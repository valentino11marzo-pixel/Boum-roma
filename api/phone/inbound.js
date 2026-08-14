// api/phone/inbound.js — la voce che risponde quando l'operatore non può.
//
// Webhook Voice di Twilio ("A call comes in" sul numero virtuale). La
// deviazione condizionale dell'iPhone (**004*<numero>#) manda qui SOLO le
// chiamate occupato/senza-risposta/irraggiungibile — rispondere di persona
// resta sempre possibile e l'assistente non entra mai.
//
// Due momenti sulla stessa porta:
//   1) primo hit          → saluto bilingue + <Record> (e il doc `phoneCalls`
//                           nasce SUBITO, così anche chi riaggancia al bip
//                           resta visibile in /chiamate come chiamata persa);
//   2) ?stage=done        → grazie + <Hangup/> (il chiamante ha finito di
//                           parlare senza riagganciare).
// L'audio registrato arriva DOPO, sull'altro webhook (/api/phone/recording).
//
// La regola che governa il file: QUALSIASI intoppo interno (Firestore giù,
// doc già esistente) non deve MAI impedire di rispondere alla chiamata — il
// TwiML esce comunque. Un errore qui è un cliente che sente il vuoto.
//
// Auth: ?k=<chiave derivata da HOMIE_SECRET> (vedi phoneKey) o X-Homie-Secret.
// GET ?setup=1 con Bearer admin (api/pfs/_guard.js) → gli URL esatti da
// incollare nella console Twilio, così la chiave non va calcolata a mano.

import { fsCreate } from '../homie/_lib.js';
import { normalizePhone } from '../homie/_lead.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { checkPhoneAuth, phoneKey, qparam, readForm, twimlGreeting, twimlThanks } from './_lib.js';

function baseUrl(req) {
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'boomrome.com';
  return `https://${host}`;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // ── setup: la console/dashboard chiede gli URL da configurare su Twilio ──
  if (qparam(req, 'setup') === '1') {
    const actor = await requireCronOrAdmin(req, res);
    if (!actor) return;
    const key = phoneKey();
    if (!key) return res.status(500).json({ ok: false, error: 'server_misconfigured: HOMIE_SECRET unset' });
    const base = baseUrl(req);
    return res.status(200).json({
      ok: true,
      // Via A — segreteria che registra (Twilio-style):
      voiceUrl: `${base}/api/phone/inbound?k=${key}`,
      voiceMethod: 'POST',
      // Via B — receptionist conversazionale (ElevenLabs Agents, vedi
      // bot/RECEPTIONIST.md): webhook post-chiamata + tools in chiamata.
      elevenlabsWebhookUrl: `${base}/api/phone/elevenlabs`,
      toolCatalogUrl: `${base}/api/phone/agent-tools?k=${key}&op=catalog`,
      toolSlotsUrl: `${base}/api/phone/agent-tools?k=${key}&op=slots`,
      note: 'Via A (Twilio): incolla voiceUrl come webhook Voice del numero. Via B (ElevenLabs): webhook firmato HMAC (env ELEVENLABS_WEBHOOK_SECRET) + i due tool URL nell’agente — mandato completo in bot/RECEPTIONIST.md. Poi sull’iPhone: **004*<numero># per le deviazioni condizionali.',
    });
  }

  if (!checkPhoneAuth(req)) return res.status(401).json({ ok: false, error: 'invalid_key' });

  const xml = (body) => {
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.status(200);
    return res.end(body);
  };

  // ── il chiamante ha finito il messaggio senza riagganciare ───────────────
  if (qparam(req, 'stage') === 'done') return xml(twimlThanks());

  // ── primo hit: registra la chiamata, poi rispondi ────────────────────────
  const form = await readForm(req);
  const callSid = String(form.CallSid || '').trim();
  const from = normalizePhone(form.From || '');

  if (callSid) {
    // Il doc nasce ORA: una chiamata senza messaggio resta comunque un fatto
    // visibile in /chiamate. docId = CallSid → un retry di Twilio è un 409,
    // non un doppione. Best-effort per la regola del file: il TwiML esce
    // anche con Firestore in ginocchio.
    try {
      await fsCreate('phoneCalls', {
        callSid,
        from: from || null,
        fromRaw: form.From ? String(form.From).slice(0, 40) : null,
        to: form.To ? String(form.To).slice(0, 40) : null,
        status: 'in-progress',
        handled: false,
        createdAt: new Date(),
      }, callSid);
    } catch (e) {
      if (!e.exists) console.warn('[phone/inbound] doc create:', e.message);
    }
  }

  return xml(twimlGreeting({ base: baseUrl(req), key: phoneKey() }));
}
