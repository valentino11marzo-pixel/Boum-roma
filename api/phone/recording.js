// api/phone/recording.js — dal messaggio in segreteria al lead, da solo.
//
// recordingStatusCallback di Twilio (arriva quando l'audio è pronto, con
// CallSid + RecordingUrl — NON con il numero del chiamante: quello vive nel
// doc `phoneCalls` che /api/phone/inbound ha creato rispondendo, con
// fallback sul lookup della chiamata via API Twilio).
//
// La catena, ogni anello best-effort TRANNE la scrittura del doc:
//   scarica l'audio → lo mette su Storage (URL tokenizzato: è la credenziale
//   di lettura della dashboard) → trascrive (Whisper, lingua AUTO: i clienti
//   BOOM parlano inglese quanto italiano) → riconosce il chiamante
//   (phoneVariants su leads/users/pfsClients/clients: un inquilino che chiama
//   per la caldaia NON diventa un lead) → analisi haiku field-whitelisted
//   (riassunto per l'operatore, azione consigliata, bozza WhatsApp nella
//   lingua VERA del chiamante) → numero sconosciuto → doc `leads` nello
//   schema di homie/inbound (dedupe per persona via recentLeadByPhone), e da
//   lì la macchina esistente fa tutto: Brain → notify-pending → Commerciale
//   → ping Telegram con la bozza già pronta.
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

import { fsGet, fsPatch, fsCreate, getAdminToken, logActivity } from '../homie/_lib.js';
import { normalizePhone, isNoise, matchListing, mergeMessage, buildLead, recentLeadByPhone, loadCatalog } from '../homie/_lead.js';
import { tgSend } from '../telegram/_lib.js';
import { checkPhoneAuth, readForm, resolveCaller, callerLabel, sanitizeAnalysis, fallbackAnalysis } from './_lib.js';

const MODEL = 'claude-haiku-4-5-20251001';
const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

const BOOM_CONTACT_TYPES = new Set(['tenant', 'landlord', 'pfs', 'client']);

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
    const stored = await storeAudio(callSid, audio.buf);
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
  const analysis = await analyze({ transcript, callerType, resolved, from, catalog, listing });
  const callerName = resolved ? callerLabel(resolved, from) : (analysis.callerName || from || 'Numero nascosto');

  // ── il lead: solo sconosciuti veri, un lead per persona ──────────────────
  let leadId = null, leadCreated = false;
  try {
    const sync = await syncLead({ resolved, callerType, from, transcript, listing, callerName: analysis.callerName, durationSec, callSid, now });
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
      await tgSend(chatId, tgCard({ callerName, callerType, from, durationSec, analysis, transcript, leadCreated }));
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

// ─── Storage: l'audio in casa BOOM, URL tokenizzato per la dashboard ───────

async function storeAudio(callSid, buf) {
  const path = `phone-calls/${callSid}.mp3`;
  try {
    const token = await getAdminToken();
    const up = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/mpeg' }, body: buf }
    );
    if (!up.ok) return { url: null, path: null, error: 'storage_' + up.status };
    const meta = await up.json().catch(() => ({}));
    const dl = String(meta.downloadTokens || '').split(',')[0];
    return {
      url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media${dl ? '&token=' + dl : ''}`,
      path,
    };
  } catch (e) {
    return { url: null, path: null, error: 'storage_failed: ' + String(e.message).slice(0, 80) };
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

// ─── L'analisi ─────────────────────────────────────────────────────────────

async function analyze({ transcript, callerType, resolved, from, catalog, listing }) {
  if (!transcript || !process.env.ANTHROPIC_API_KEY) return fallbackAnalysis(transcript);

  const who = resolved
    ? `già in archivio come ${callerType} ("${callerLabel(resolved, from)}")`
    : 'un numero NON in archivio';
  const names = (catalog || []).slice(0, 40).map((l) => l.name).filter(Boolean);
  const prompt = [
    'Sei il centralino di BOOM Roma (affitti a Roma, clientela internazionale).',
    'Un chiamante ha lasciato questo messaggio in segreteria. Chi chiama è ' + who + '.',
    names.length ? 'Annunci attivi (solo per capire di quale casa parla): ' + names.join(' · ') : '',
    listing ? `Il testo sembra riferirsi all'annuncio "${listing.name}".` : '',
    '',
    'TRASCRIZIONE:',
    '"""' + String(transcript).slice(0, 2500) + '"""',
    '',
    'Rispondi SOLO con un oggetto JSON, nessun altro testo:',
    '{',
    ' "callerName": string|null,       // SOLO se detto nel messaggio, MAI inventato',
    ' "language": "it"|"en",           // lingua in cui parla il chiamante',
    ' "summary": string,               // 1-2 frasi IN ITALIANO per l\'operatore: chi è, cosa vuole',
    ' "intent": "nuova-richiesta"|"visita"|"inquilino"|"proprietario"|"fornitore"|"spam"|"altro",',
    ' "urgency": "low"|"medium"|"high",',
    ' "suggestedAction": "whatsapp"|"richiama"|"visita"|"manutenzione"|"niente",',
    ' "draftReply": string             // risposta WhatsApp pronta da inviare, NELLA LINGUA del chiamante, breve e concreta, che risponde a ciò che ha chiesto, firmata "Valentino · BOOM"',
    '}',
    'Non inventare MAI dati non presenti nel messaggio.',
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) {
      console.warn('[phone/recording] anthropic', r.status, (await r.text()).slice(0, 120));
      return fallbackAnalysis(transcript);
    }
    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    return sanitizeAnalysis(parsed, transcript);
  } catch (e) {
    console.warn('[phone/recording] analyze:', e.message);
    return fallbackAnalysis(transcript);
  }
}

// ─── Il lead ───────────────────────────────────────────────────────────────
// Stesse regole di homie/message.js: contatti BOOM veri MAI in pipeline, un
// lead esistente si arricchisce, il nuovo nasce nello schema condiviso. Il
// placeholder senza trascrizione è in INGLESE di proposito: replyLang legge
// lead.message, e un placeholder italiano farebbe scrivere in italiano a un
// expat (la lezione di leads/scan-inbox).
const NO_TRANSCRIPT_MSG = '[voicemail] Voice message left on the BOOM phone line — listen from /chiamate.';

async function syncLead({ resolved, callerType, from, transcript, listing, callerName, durationSec, callSid, now }) {
  if (!from) return null;                                  // anonimo: nessuno da richiamare
  if (BOOM_CONTACT_TYPES.has(callerType)) return null;     // inquilini & co: non è un lead
  if (transcript && isNoise(transcript)) return null;      // un colpo di tosse non è un cliente

  const text = transcript || NO_TRANSCRIPT_MSG;

  // già in pipeline (risolto come lead, o stesso numero da un'altra porta)
  const prior = (callerType === 'lead' && resolved) ? resolved.entity : await recentLeadByPhone(from, now.getTime());
  if (prior) {
    try {
      await fsPatch(`leads/${prior.id}`, {
        message: mergeMessage(prior.message, text),
        lastInboundAt: now,
        ...(prior.phone ? {} : { phone: from }),
        ...(prior.propertyId || !listing ? {} : { propertyId: listing.id, propertyTitle: listing.name || null, propertyPrice: listing.price || null }),
      });
    } catch { /* non-fatale */ }
    return { leadId: prior.id, leadCreated: false };
  }

  const lead = {
    ...buildLead({ text, phone: from, name: callerName || '', listing, at: now }),
    source: 'phone',
    sourceRef: callSid,
    raw: { via: 'phone/recording', channel: 'phone', durationSec: durationSec || null },
  };
  const { id } = await fsCreate('leads', lead);
  await logActivity('lead_from_phone', 'lead', { leadId: id, callSid, listing: lead.propertyTitle }, 'centralino');
  return { leadId: id, leadCreated: true };
}

// ─── Telegram ──────────────────────────────────────────────────────────────

function tgCard({ callerName, callerType, from, durationSec, analysis, transcript, leadCreated }) {
  const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const TYPE_BADGE = { tenant: '🏠 inquilino', landlord: '🔑 proprietario', pfs: '🎯 cliente PFS', client: '👤 cliente', lead: '📇 lead esistente' };
  const lines = [
    '📞 <b>Segreteria BOOM</b> — nuovo messaggio',
    `👤 ${esc(callerName)}${TYPE_BADGE[callerType] ? ' · ' + TYPE_BADGE[callerType] : ''}${leadCreated ? ' · 🆕 lead creato' : ''}`,
    `${from ? '📱 ' + esc(from) + ' · ' : ''}⏱ ${durationSec != null ? durationSec + 's' : '?'}`,
    `🧠 ${esc(analysis.summary)}`,
  ];
  if (transcript) lines.push(`<blockquote>${esc(String(transcript).slice(0, 350))}${transcript.length > 350 ? '…' : ''}</blockquote>`);
  if (from && analysis.suggestedAction === 'whatsapp') {
    lines.push(`💬 Rispondi: https://wa.me/${from.replace(/\D/g, '')}?text=${encodeURIComponent(analysis.draftReply)}`);
  }
  lines.push('🎛 Tutte le chiamate: https://boomrome.com/chiamate');
  return lines.join('\n');
}
