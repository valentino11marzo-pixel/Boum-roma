// api/phone/_lib.js — IL CENTRALINO: il motore, in un posto solo.
//
// IL PRINCIPIO. Su iPhone nessuna app può rispondere a una chiamata al posto
// dell'operatore — e va bene così: la segreteria telefonica È già una
// deviazione condizionale di rete (occupato / nessuna risposta / non
// raggiungibile). Puntando quelle deviazioni a un numero virtuale Twilio,
// QUESTA diventa la segreteria: risponde SOLO quando l'operatore non può o
// rifiuta apposta la chiamata (rifiuto = "occupato" per la rete). Chi risponde
// dall'altra parte è /api/phone/inbound (saluto bilingue + registrazione);
// /api/phone/recording trasforma il messaggio in un doc `phoneCalls` con
// audio, trascrizione, riassunto e azione consigliata — e, se il numero non è
// già un contatto BOOM, in un lead nello schema che TUTTA la macchina
// esistente legge già (Lead Brain → notify-pending → Commerciale). La
// dashboard è /chiamate.
//
// Qui vivono le parti pure (testabili senza rete) + il resolver del
// chiamante. Le regole dure, pinnate nei test:
//   · il saluto DICHIARA che è un assistente automatico e che il messaggio
//     viene registrato (disclosure GDPR: non è un dettaglio, è la porta);
//   · la lingua della bozza di risposta la decide replyLang sulle PAROLE
//     VERE del chiamante, mai la dichiarazione del modello (la lezione di
//     leads/scan-inbox: un default 'it' fa scrivere in italiano a un expat);
//   · l'analisi AI è field-whitelisted: un intent o un'azione fuori enum non
//     passa mai (la lezione di wizard/interpret);
//   · niente AI configurata ≠ niente doc: il fallback deterministico riempie
//     riassunto e bozza, il dato che conta (la chiamata) non si perde mai.

import crypto from 'node:crypto';
import { secretEqual, fsList, fsPatch, fsCreate, getAdminToken, logActivity } from '../homie/_lib.js';
import { phoneVariants, isNoise, mergeMessage, buildLead, recentLeadByPhone } from '../homie/_lead.js';
import { replyLang } from '../_lang.js';

// ── la chiave del webhook: derivata, mai coniata ───────────────────────────
// Twilio non può mandare header custom comodi: la chiave viaggia in ?k=.
// Derivata da HOMIE_SECRET (stessa disciplina di feedKey / manageToken):
// nessun nuovo env, ruotare il secret revoca il webhook.
export function phoneKey(secret = process.env.HOMIE_SECRET) {
  if (!secret) return null;
  return crypto.createHash('sha256').update('phone:' + secret).digest('hex').slice(0, 40);
}

/** true se la richiesta porta ?k=<chiave derivata> oppure X-Homie-Secret. */
export function checkPhoneAuth(req) {
  const expected = process.env.HOMIE_SECRET;
  if (!expected) return false;
  const supplied = qparam(req, 'k');
  const key = phoneKey(expected);
  if (supplied && key && secretEqual(String(supplied), key)) return true;
  const h = (req.headers && (req.headers['x-homie-secret'] || req.headers['X-Homie-Secret'])) || '';
  return !!(h && secretEqual(String(h), expected));
}

/** Un query param, che arrivi da req.query (Vercel) o dall'URL grezzo. */
export function qparam(req, name) {
  if (req.query && req.query[name] != null) return req.query[name];
  const u = String(req.url || '');
  const i = u.indexOf('?');
  if (i === -1) return null;
  try { return new URLSearchParams(u.slice(i + 1)).get(name); } catch { return null; }
}

/** Body form-urlencoded di Twilio: oggetto già parsato, stringa, o stream. */
export async function readForm(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const parse = (s) => {
    const out = {};
    try { for (const [k, v] of new URLSearchParams(String(s || ''))) out[k] = v; } catch { /* vuoto */ }
    return out;
  };
  if (typeof req.body === 'string') return parse(req.body);
  return await new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => resolve(parse(buf)));
  });
}

// ── TwiML ──────────────────────────────────────────────────────────────────
export function xmlEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

// La disclosure è NEL saluto: "assistente automatico" + "messaggio registrato".
// Corto di proposito — il chiamante ha già aspettato gli squilli di deviazione.
export const GREETING_IT = 'Ciao! Sono l’assistente automatico di BOOM. Valentino non può rispondere in questo momento: lascia un messaggio dopo il tono — viene registrato e ti richiamiamo al più presto.';
export const GREETING_EN = 'Hi! This is BOOM’s automated assistant. We can’t take your call right now — please leave a recorded message after the tone and we’ll get back to you shortly.';

/**
 * La risposta alla chiamata: saluto IT+EN, poi <Record> con i due callback —
 * `action` riprende la chiamata a messaggio finito (stage=done → grazie),
 * `recordingStatusCallback` consegna l'audio a /api/phone/recording.
 */
export function twimlGreeting({ base, key }) {
  const b = String(base || '').replace(/\/+$/, '');
  const k = encodeURIComponent(key || '');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<Response>' +
    '<Pause length="1"/>' +
    `<Say voice="alice" language="it-IT">${xmlEscape(GREETING_IT)}</Say>` +
    `<Say voice="alice" language="en-GB">${xmlEscape(GREETING_EN)}</Say>` +
    `<Record maxLength="120" timeout="6" playBeep="true" method="POST"` +
    ` action="${xmlEscape(`${b}/api/phone/inbound?k=${k}&stage=done`)}"` +
    ` recordingStatusCallback="${xmlEscape(`${b}/api/phone/recording?k=${k}`)}"` +
    ` recordingStatusCallbackMethod="POST"/>` +
    '<Say voice="alice" language="en-GB">We did not receive a message. Goodbye!</Say>' +
    '</Response>';
}

export function twimlThanks() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<Response>' +
    '<Say voice="alice" language="en-GB">Thank you! We received your message and will be in touch shortly. Ciao!</Say>' +
    '<Hangup/></Response>';
}

// ── l'analisi, sanificata ──────────────────────────────────────────────────
export const INTENTS = ['nuova-richiesta', 'visita', 'inquilino', 'proprietario', 'fornitore', 'spam', 'altro'];
export const ACTIONS = ['whatsapp', 'richiama', 'visita', 'manutenzione', 'niente'];
const URGENCIES = ['low', 'medium', 'high'];

export function fallbackDraft(lang) {
  return lang === 'it'
    ? 'Ciao! Ho visto la tua chiamata e ascoltato il messaggio — rispondimi pure qui su WhatsApp, è più comodo. Valentino · BOOM'
    : 'Hi! I saw your call and listened to your message — happy to help right here on WhatsApp. Valentino · BOOM';
}

/**
 * Whitelist + fallback sull'output del modello. `transcript` è l'evidenza:
 * decide la lingua (replyLang) qualunque cosa dichiari il modello, e riempie
 * il riassunto quando l'AI non c'è o non risponde. Pura: si testa.
 */
export function sanitizeAnalysis(parsed, transcript) {
  const p = (parsed && typeof parsed === 'object') ? parsed : {};
  const text = String(transcript || '').trim();
  // la lingua: le parole vere battono la dichiarazione; senza parole, en.
  const lang = text.length >= 12
    ? replyLang({ message: text })
    : (p.language === 'it' ? 'it' : 'en');
  const clip = (v, n) => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, n) : null;
  const summary = clip(p.summary, 400)
    || (text ? text.slice(0, 200) : 'Messaggio vocale ricevuto (nessuna trascrizione disponibile).');
  return {
    callerName: clip(p.callerName, 80),
    language: lang,
    summary,
    intent: INTENTS.includes(p.intent) ? p.intent : 'altro',
    urgency: URGENCIES.includes(p.urgency) ? p.urgency : 'medium',
    suggestedAction: ACTIONS.includes(p.suggestedAction) ? p.suggestedAction : 'richiama',
    draftReply: clip(p.draftReply, 600) || fallbackDraft(lang),
  };
}

/** L'analisi senza AI: deterministica, mai vuota. */
export function fallbackAnalysis(transcript) {
  return sanitizeAnalysis({}, transcript);
}

// ── chi sta chiamando ──────────────────────────────────────────────────────
// Stessa scala di homie/message.js (resolveByPhone) e stessa ragione: un
// inquilino che chiama per la caldaia NON deve diventare un lead, e il nome
// in dashboard deve essere il suo, non un numero. Il numero si cerca in TUTTE
// le forme (phoneVariants): il caller ID arriva internazionale, l'archivio
// spesso è nazionale.
export async function resolveCaller(phone) {
  if (!phone) return null;
  const scans = [
    { type: 'lead',     coll: 'leads',      field: 'phone' },
    { type: 'tenant',   coll: 'users',      field: 'phone', roleEq: 'tenant' },
    { type: 'landlord', coll: 'users',      field: 'phone', roleEq: 'landlord' },
    { type: 'pfs',      coll: 'pfsClients', field: 'phone' },
    { type: 'client',   coll: 'clients',    field: 'phone' },
  ];
  for (const val of phoneVariants(phone)) {
    for (const s of scans) {
      try {
        const rows = await fsList(s.coll, { filter: { field: s.field, op: 'EQUAL', value: val }, limit: 5 });
        const hit = s.roleEq ? (rows || []).find((r) => r.role === s.roleEq) : (rows || [])[0];
        if (hit) return { type: s.type, entity: hit };
      } catch { /* si continua a scandire */ }
    }
  }
  return null;
}

/** Nome leggibile di un contatto risolto (per doc, Telegram e dashboard). */
export function callerLabel(resolved, phone) {
  if (!resolved) return phone || 'Numero nascosto';
  const e = resolved.entity || {};
  return e.name
    || ((e.firstName ? (e.firstName + ' ' + (e.lastName || '')).trim() : ''))
    || e.email || phone || 'Contatto';
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PIPELINE CONDIVISA — una copia sola (la disciplina di viewings/_apply.js).
// Due porte consegnano chiamate: la segreteria che registra (recording.js,
// callback Twilio-style) e la receptionist conversazionale (elevenlabs.js,
// webhook post-chiamata). Audio→Storage, analisi, lead e card Telegram vivono
// QUI una volta: le due porte non possono divergere su come si tratta un
// chiamante.
// ═══════════════════════════════════════════════════════════════════════════

export const MODEL = 'claude-haiku-4-5-20251001';
export const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
export const BOOM_CONTACT_TYPES = new Set(['tenant', 'landlord', 'pfs', 'client']);

// Il placeholder senza trascrizione è in INGLESE di proposito: replyLang
// legge lead.message, e un placeholder italiano farebbe scrivere in italiano
// a un expat (la lezione di leads/scan-inbox).
export const NO_TRANSCRIPT_MSG = '[voicemail] Voice message left on the BOOM phone line — listen from /chiamate.';

/** Audio della chiamata → Storage phone-calls/, URL tokenizzato (= la
 *  credenziale di lettura della dashboard; le rules restano admin-only). */
export async function storeCallAudio(name, buf, contentType = 'audio/mpeg') {
  const path = `phone-calls/${name}.mp3`;
  try {
    const token = await getAdminToken();
    const up = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: buf }
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

/**
 * L'analisi haiku, field-whitelisted. `transcript` sono le parole del
 * CHIAMANTE (mai quelle dell'assistente: replyLang deve vedere solo lui).
 * `providerSummary` è il riassunto che il fornitore ha già calcolato
 * (ElevenLabs): entra SOLO come fallback quando la nostra AI non c'è.
 */
export async function analyzeTranscript({ transcript, callerType, resolved, from, catalog, listing, providerSummary }) {
  if (!transcript || !process.env.ANTHROPIC_API_KEY) {
    return sanitizeAnalysis(providerSummary ? { summary: providerSummary } : {}, transcript);
  }

  const who = resolved
    ? `già in archivio come ${callerType} ("${callerLabel(resolved, from)}")`
    : 'un numero NON in archivio';
  const names = (catalog || []).slice(0, 40).map((l) => l.name).filter(Boolean);
  const prompt = [
    'Sei il centralino di BOOM Roma (affitti a Roma, clientela internazionale).',
    'Un chiamante ha parlato con la nostra linea. Chi chiama è ' + who + '.',
    names.length ? 'Annunci attivi (solo per capire di quale casa parla): ' + names.join(' · ') : '',
    listing ? `Il testo sembra riferirsi all'annuncio "${listing.name}".` : '',
    '',
    'PAROLE DEL CHIAMANTE:',
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
      console.warn('[phone/_lib] anthropic', r.status, (await r.text()).slice(0, 120));
      return sanitizeAnalysis(providerSummary ? { summary: providerSummary } : {}, transcript);
    }
    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    return sanitizeAnalysis(parsed, transcript);
  } catch (e) {
    console.warn('[phone/_lib] analyze:', e.message);
    return sanitizeAnalysis(providerSummary ? { summary: providerSummary } : {}, transcript);
  }
}

/**
 * Il lead da una chiamata — stesse regole di homie/message.js: contatti BOOM
 * veri MAI in pipeline, un lead esistente si arricchisce, il nuovo nasce
 * nello schema condiviso (source 'phone' per ENTRAMBE le porte: a valle
 * conta il canale, non il fornitore).
 */
export async function syncLeadFromCall({ resolved, callerType, from, transcript, listing, callerName, durationSec, sourceRef, via, now }) {
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
    sourceRef: sourceRef || null,
    raw: { via: via || 'phone', channel: 'phone', durationSec: durationSec || null },
  };
  const { id } = await fsCreate('leads', lead);
  await logActivity('lead_from_phone', 'lead', { leadId: id, sourceRef: sourceRef || null, listing: lead.propertyTitle }, 'centralino');
  return { leadId: id, leadCreated: true };
}

/** La card Telegram — kind 'voicemail' (messaggio registrato) o 'agent'
 *  (conversazione gestita dalla receptionist). */
export function tgCallCard({ callerName, callerType, from, durationSec, analysis, transcript, leadCreated, kind = 'voicemail' }) {
  const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const TYPE_BADGE = { tenant: '🏠 inquilino', landlord: '🔑 proprietario', pfs: '🎯 cliente PFS', client: '👤 cliente', lead: '📇 lead esistente' };
  const header = kind === 'agent'
    ? '🤖 <b>Receptionist BOOM</b> — chiamata gestita'
    : '📞 <b>Segreteria BOOM</b> — nuovo messaggio';
  const lines = [
    header,
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
