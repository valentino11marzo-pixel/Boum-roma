// api/phone/recording.js — dal messaggio in segreteria al lead, da solo.
//
// recordingStatusCallback di Twilio (arriva quando l'audio è pronto, con
// CallSid + RecordingUrl — NON con il numero del chiamante: quello vive nel
// doc `phoneCalls` che /api/phone/inbound ha creato rispondendo, con
// fallback sul lookup della chiamata via API Twilio).
//
// La catena, ogni anello best-effort TRANNE la scrittura del doc:
//   scarica l'audio → Storage (URL tokenizzato) → trascrive (Whisper, lingua
//   AUTO: i clienti BOOM parlano inglese quanto italiano) → riconosce il
//   chiamante → analisi haiku field-whitelisted → numero sconosciuto → doc
//   `leads` nello schema condiviso → ping Telegram. La pipeline vera (audio,
//   analisi, lead, card) vive in _lib.js, CONDIVISA con la porta ElevenLabs:
//   le due segreterie non possono divergere su come si tratta un chiamante.
//
// Idempotente per costruzione: `processedAt` sul doc — i retry di Twilio
// (che rimanda il callback su non-2xx) non duplicano lead né ping.
// Un fallimento di UN anello non spegne la catena: il doc esce comunque,
// con dentro scritto cosa manca e perché ("trascrizione non configurata" è
// un'informazione, il silenzio è un bug — la lezione di wizard/transcribe).
//
// Env (oltre a quelli di homie/_lib):
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN  → download audio (basic auth) e
//                                             lookup chiamata. Senza: si
//                                             tenta il download nudo e si
//                                             annota l'eventuale rifiuto.
//   OPENAI_API_KEY                          → Whisper (già usato dal wizard)
//   ANTHROPIC_API_KEY                       → analisi haiku
//   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID   → ping operatore

import { fsGet, fsPatch, logActivity } from '../homie/_lib.js';
import { normalizePhone, matchListing, loadCatalog } from '../homie/_lead.js';
import { tgSend } from '../telegram/_lib.js';
import {
  checkPhoneAuth, readForm, resolveCaller, callerLabel,
  storeCallAudio, analyzeTranscript, syncLeadFromCall, tgCallCard,
} from './_lib.js';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!checkPhoneAuth(req)) return res.status(401).json({ ok: false, error: 'invalid_key' });

  const form = await readForm(req);
  const callSid = String(form.CallSid || '').trim();
  if (!callSid) return res.status(400).json({ ok: false, error: 'no_call_sid' });

  const recStatus = String(form.RecordingStatus || 'completed');
  if (!['completed', 'absent'].includes(recStatus)) {
    return res.status(200).json({ ok: true, ignored: true, recStatus });
  }

  const docPath = `phoneCalls/${callSid}`;
  let doc = null;
  try { doc = await fsGet(docPath); } catch { /* si procede senza */ }
  if (doc && doc.processedAt) {
    return res.status(200).json({ ok: true, callSid, duplicate: true });
  }

  const now = new Date();

  // ── riagganciato prima del bip: la chiamata resta, il resto no ───────────
  if (recStatus === 'absent') {
    try {
      await fsPatch(docPath, {
        callSid, status: 'no-message', processedAt: now,
        ...(doc ? {} : { handled: false, createdAt: now }),
      });
    } catch (e) { console.error('[phone/recording] absent patch:', e.message); }
    return res.status(200).json({ ok: true, callSid, status: 'no-message' });
  }

  // ── chi chiamava: dal doc, o dall'API Twilio se inbound non l'ha scritto ─
  let from = (doc && doc.from) || null;
  if (!from) from = await twilioCallFrom(callSid);
  from = normalizePhone(from || '');

  const durationSec = parseInt(form.RecordingDuration, 10) || null;

  // ── l'audio: scaricato e messo in casa nostra ────────────────────────────
  const audio = await downloadRecording(form.RecordingUrl);
  let audioUrl = null, audioPath = null, audioError = audio.error || null;
  if (audio.buf) {
    const stored = await storeCallAudio(callSid, audio.buf);
    audioUrl = stored.url; audioPath = stored.path;
    if (stored.error) audioError = stored.error;
  }

  // ── la trascrizione: lingua auto, mai un blocco ──────────────────────────
  let transcript = null, transcriptStatus = 'unavailable';
  if (audio.buf) {
    const t = await transcribe(audio.buf);
    transcript = t.text; transcriptStatus = t.status;
  }

  // ── chi è + di quale casa parla ──────────────────────────────────────────
  const resolved = from ? await resolveCaller(from) : null;
  const callerType = resolved ? resolved.type : 'unknown';
  const catalog = transcript ? await loadCatalog() : [];
  const listing = transcript ? matchListing(transcript, catalog) : null;

  // ── l'analisi (haiku, whitelisted; senza chiave → fallback) ──────────────
  const analysis = await analyzeTranscript({ transcript, callerType, resolved, from, catalog, listing });
  const callerName = resolved ? callerLabel(resolved, from) : (analysis.callerName || from || 'Numero nascosto');

  // ── il lead: solo sconosciuti veri, un lead per persona ──────────────────
  let leadId = null, leadCreated = false;
  try {
    const sync = await syncLeadFromCall({
      resolved, callerType, from, transcript, listing,
      callerName: analysis.callerName, durationSec,
      sourceRef: callSid, via: 'phone/recording', now,
    });
    if (sync) { leadId = sync.leadId; leadCreated = !!sync.leadCreated; }
  } catch (e) { console.warn('[phone/recording] lead sync:', e.message); }

  // ── IL DATO CHE CONTA: il doc della chiamata ─────────────────────────────
  const patch = {
    callSid,
    from: from || null,
    status: 'received',
    processedAt: now,
    durationSec,
    audioUrl, audioPath,
    ...(audioError ? { audioError } : {}),
    recordingUrlTwilio: form.RecordingUrl ? String(form.RecordingUrl).slice(0, 300) : null,
    transcript: transcript ? String(transcript).slice(0, 4000) : null,
    transcriptStatus,
    callerType,
    callerName,
    ...(resolved ? { callerId: resolved.entity.id } : {}),
    summary: analysis.summary,
    intent: analysis.intent,
    urgency: analysis.urgency,
    language: analysis.language,
    suggestedAction: analysis.suggestedAction,
    draftReply: analysis.draftReply,
    ...(listing ? { propertyId: listing.id, propertyTitle: listing.name || null } : {}),
    ...(leadId ? { leadId, leadCreated } : {}),
    ...(doc ? {} : { handled: false, createdAt: now }),
  };
  try {
    await fsPatch(docPath, patch);
  } catch (e) {
    console.error('[phone/recording] doc patch:', e.message);
    // 500 → Twilio ritenta, e processedAt non è stato scritto: il retry rifà tutto.
    return res.status(500).json({ ok: false, error: 'doc_write_failed' });
  }

  // ── il ping (dopo il dato, mai al posto del dato) ────────────────────────
  try {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
      await tgSend(chatId, tgCallCard({ callerName, callerType, from, durationSec, analysis, transcript, leadCreated, kind: 'voicemail' }));
      await fsPatch(docPath, { telegramNotifiedAt: new Date() });
    }
  } catch (e) { console.warn('[phone/recording] telegram:', e.message); }

  await logActivity('phone_call_received', 'phone', {
    callSid, from: from || '?', callerType, leadId: leadId || null,
    summary: String(analysis.summary || '').slice(0, 120),
  }, 'centralino');

  return res.status(200).json({ ok: true, callSid, status: 'received', leadId, leadCreated });
}

// ─── Twilio ────────────────────────────────────────────────────────────────

function twilioAuthHeader() {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return null;
  return 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64');
}

async function twilioCallFrom(callSid) {
  const auth = twilioAuthHeader();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!auth || !sid) return null;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${encodeURIComponent(callSid)}.json`, {
      headers: { Authorization: auth },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.from || null;
  } catch { return null; }
}

async function downloadRecording(recordingUrl) {
  if (!recordingUrl) return { buf: null, error: 'no_recording_url' };
  const url = String(recordingUrl) + (String(recordingUrl).endsWith('.mp3') ? '' : '.mp3');
  const auth = twilioAuthHeader();
  try {
    const r = await fetch(url, { headers: auth ? { Authorization: auth } : {} });
    if (!r.ok) {
      // 401 senza credenziali configurate: si DICE, non si tace.
      return { buf: null, error: `download_${r.status}${auth ? '' : '_twilio_creds_missing'}` };
    }
    const ab = await r.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!buf.length) return { buf: null, error: 'empty_audio' };
    if (buf.length > MAX_AUDIO_BYTES) return { buf: null, error: 'audio_too_large' };
    return { buf };
  } catch (e) {
    return { buf: null, error: 'download_failed: ' + String(e.message).slice(0, 80) };
  }
}

// ─── Whisper (stessa via di api/wizard/transcribe.js, lingua AUTO) ─────────

async function transcribe(buf) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { text: null, status: 'unavailable' };
  try {
    const formData = new FormData();
    formData.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'voicemail.mp3');
    formData.append('model', 'whisper-1');
    // NIENTE `language`: il chiamante BOOM parla inglese quanto italiano, e
    // forzare 'it' storpierebbe metà dei messaggi.
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: formData,
    });
    if (!r.ok) {
      console.warn('[phone/recording] whisper', r.status, (await r.text()).slice(0, 120));
      return { text: null, status: 'failed' };
    }
    const data = await r.json();
    const text = String(data.text || '').trim();
    return text ? { text, status: 'ok' } : { text: null, status: 'failed' };
  } catch (e) {
    console.warn('[phone/recording] whisper:', e.message);
    return { text: null, status: 'failed' };
  }
}
