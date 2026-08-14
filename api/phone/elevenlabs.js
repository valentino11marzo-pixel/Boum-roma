// api/phone/elevenlabs.js — la RECEPTIONIST: la seconda porta del Centralino.
//
// Con ElevenLabs Agents la chiamata non finisce in segreteria: l'agente
// RISPONDE e conversa (bilingue, con i tools di agent-tools.js per catalogo
// e slot visite veri). Questo webhook riceve l'esito e lo consegna alla
// STESSA pipeline della segreteria (_lib.js): doc `phoneCalls`, lead nello
// schema condiviso, ping Telegram, dashboard /chiamate. Il mandato completo
// dell'agente (prompt, tools, setup) sta in bot/RECEPTIONIST.md.
//
// Due eventi, ordine NON garantito, ognuno autosufficiente:
//   · post_call_transcription → il dato: trascrizione, analisi, metadata.
//     Doc `phoneCalls/el_<conversationId>`, idempotente su processedAt.
//   · post_call_audio         → l'audio intero, PUSH in base64 (niente API
//     da interrogare) → Storage phone-calls/, URL tokenizzato sul doc.
//
// LA REGOLA DELLA LINGUA, qui più importante che mai: nel transcript ci sono
// DUE voci, e l'agente parla anche italiano a un cliente inglese. Nel lead e
// in replyLang entrano SOLO i turni del CHIAMANTE — le parole dell'agente
// dentro lead.message farebbero scrivere il Commerciale nella lingua
// sbagliata, e il riassunto giudicherebbe le nostre frasi, non le sue.
//
// Auth: firma HMAC di ElevenLabs (header `elevenlabs-signature`,
// `t=<unix>,v0=<hmac_sha256(secret, t + "." + rawBody)>`, tolleranza 30').
// Env: ELEVENLABS_WEBHOOK_SECRET (dalla console ElevenLabs → Webhooks).
// bodyParser DISATTIVATO: l'HMAC si calcola sui byte grezzi — un body
// riserializzato non è mai garantito identico.

import crypto from 'node:crypto';
import { secretEqual, fsGet, fsPatch, logActivity } from '../homie/_lib.js';
import { normalizePhone, matchListing, loadCatalog } from '../homie/_lead.js';
import { tgSend } from '../telegram/_lib.js';
import {
  resolveCaller, callerLabel,
  storeCallAudio, analyzeTranscript, syncLeadFromCall, tgCallCard,
} from './_lib.js';

export const config = { api: { bodyParser: false } };

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const SIG_TOLERANCE_SEC = 30 * 60;

async function readRaw(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);   // harness/test path
  return await new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/** `t=...,v0=...` → firma valida? Esportata l'aritmetica per i test. */
export function verifySignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || !header || !rawBody) return false;
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=').map((s) => s.trim())));
  const t = parseInt(parts.t, 10);
  const v0 = parts.v0 || '';
  if (!t || !v0) return false;
  if (Math.abs(nowSec - t) > SIG_TOLERANCE_SEC) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return secretEqual(v0, expected);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ ok: false, error: 'server_misconfigured: ELEVENLABS_WEBHOOK_SECRET unset' });

  const raw = await readRaw(req);
  const sig = req.headers['elevenlabs-signature'] || req.headers['ElevenLabs-Signature'];
  if (!verifySignature(raw, sig, secret)) return res.status(401).json({ ok: false, error: 'invalid_signature' });

  let payload;
  try { payload = JSON.parse(raw); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const type = payload && payload.type;
  const data = (payload && payload.data) || {};
  const conversationId = String(data.conversation_id || '').trim();
  if (!conversationId) return res.status(200).json({ ok: true, ignored: true, reason: 'no_conversation_id' });

  const docPath = `phoneCalls/el_${conversationId}`;

  // ── l'audio intero, push in base64 ───────────────────────────────────────
  if (type === 'post_call_audio') {
    const b64 = String(data.full_audio || '');
    if (!b64) return res.status(200).json({ ok: true, ignored: true, reason: 'no_audio' });
    let buf;
    try { buf = Buffer.from(b64, 'base64'); } catch { return res.status(400).json({ ok: false, error: 'bad_base64' }); }
    if (!buf.length || buf.length > MAX_AUDIO_BYTES) return res.status(200).json({ ok: true, ignored: true, reason: 'audio_size' });
    const stored = await storeCallAudio(`el_${conversationId}`, buf);
    let doc = null;
    try { doc = await fsGet(docPath); } catch { /* si crea */ }
    try {
      await fsPatch(docPath, {
        source: 'elevenlabs', conversationId,
        ...(stored.url ? { audioUrl: stored.url, audioPath: stored.path } : { audioError: stored.error }),
        ...(doc ? {} : { status: 'in-progress', handled: false, createdAt: new Date() }),
      });
    } catch (e) { console.error('[phone/elevenlabs] audio patch:', e.message); }
    return res.status(200).json({ ok: true, conversationId, audio: !!stored.url });
  }

  if (type !== 'post_call_transcription') {
    return res.status(200).json({ ok: true, ignored: true, type: type || null });
  }

  // ── il dato: trascrizione + esito ────────────────────────────────────────
  let doc = null;
  try { doc = await fsGet(docPath); } catch { /* si procede */ }
  if (doc && doc.processedAt) return res.status(200).json({ ok: true, conversationId, duplicate: true });

  const now = new Date();
  const meta = data.metadata || {};
  const dyn = ((data.conversation_initiation_client_data || {}).dynamic_variables) || {};
  const from = normalizePhone((meta.phone_call && meta.phone_call.external_number) || dyn.system__caller_id || '');
  const durationSec = Number.isFinite(Number(meta.call_duration_secs)) ? Number(meta.call_duration_secs) : null;

  const turns = Array.isArray(data.transcript) ? data.transcript : [];
  // SOLO la voce del chiamante: è ciò che replyLang e il Commerciale leggono.
  const callerWords = turns
    .filter((t) => t && t.role === 'user' && t.message)
    .map((t) => String(t.message).trim()).filter(Boolean).join('\n').slice(0, 2500);
  // Il dialogo intero resta sul doc, per l'operatore in dashboard.
  const displayTranscript = turns
    .filter((t) => t && t.message)
    .map((t) => `${t.role === 'agent' ? '🤖' : '👤'} ${String(t.message).trim()}`)
    .join('\n').slice(0, 4000) || null;

  const resolved = from ? await resolveCaller(from) : null;
  const callerType = resolved ? resolved.type : 'unknown';
  const catalog = callerWords ? await loadCatalog() : [];
  const listing = callerWords ? matchListing(callerWords, catalog) : null;

  const analysisRaw = data.analysis || {};
  const analysis = await analyzeTranscript({
    transcript: callerWords || null, callerType, resolved, from, catalog, listing,
    providerSummary: analysisRaw.transcript_summary ? String(analysisRaw.transcript_summary).slice(0, 400) : null,
  });

  // la data collection dell'agente (se configurata) come rete sul nome
  const collected = analysisRaw.data_collection_results || {};
  const collectedName = collected.caller_name && collected.caller_name.value
    ? String(collected.caller_name.value).slice(0, 80) : null;
  const callerName = resolved ? callerLabel(resolved, from)
    : (collectedName || analysis.callerName || from || 'Numero nascosto');

  let leadId = null, leadCreated = false;
  try {
    const sync = await syncLeadFromCall({
      resolved, callerType, from, transcript: callerWords || null, listing,
      callerName: collectedName || analysis.callerName, durationSec,
      sourceRef: `el_${conversationId}`, via: 'phone/elevenlabs', now,
    });
    if (sync) { leadId = sync.leadId; leadCreated = !!sync.leadCreated; }
  } catch (e) { console.warn('[phone/elevenlabs] lead sync:', e.message); }

  const patch = {
    source: 'elevenlabs',
    conversationId,
    agentId: data.agent_id || null,
    from: from || null,
    status: 'received',
    processedAt: now,
    durationSec,
    transcript: displayTranscript,
    transcriptStatus: turns.length ? 'ok' : 'unavailable',
    callerWords: callerWords || null,
    callSuccessful: analysisRaw.call_successful != null ? String(analysisRaw.call_successful) : null,
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
    console.error('[phone/elevenlabs] doc patch:', e.message);
    // non-2xx → ElevenLabs ritenta; processedAt non scritto → il retry rifà tutto.
    return res.status(500).json({ ok: false, error: 'doc_write_failed' });
  }

  try {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
      await tgSend(chatId, tgCallCard({
        callerName, callerType, from, durationSec, analysis,
        transcript: displayTranscript, leadCreated, kind: 'agent',
      }));
      await fsPatch(docPath, { telegramNotifiedAt: new Date() });
    }
  } catch (e) { console.warn('[phone/elevenlabs] telegram:', e.message); }

  await logActivity('phone_call_agent', 'phone', {
    conversationId, from: from || '?', callerType, leadId: leadId || null,
    summary: String(analysis.summary || '').slice(0, 120),
  }, 'centralino');

  return res.status(200).json({ ok: true, conversationId, status: 'received', leadId, leadCreated });
}
