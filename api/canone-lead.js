// api/canone-lead.js
// Public lead-capture endpoint for the /canone tool (Canone Concordato
// calculator). When a landlord asks for the certified calculation, we write
// a new doc to the `leads` collection — the SAME shape portal.html and
// cockpit-preview.html already read — so the lead flows straight into the
// existing Homie / portal pipeline (status='new', source='web').
//
// Unlike /api/homie/inbound this endpoint is PUBLIC (called from the browser),
// so it has NO shared secret. Abuse protection is layered instead:
//   - honeypot field (`company` must be empty)
//   - required name + (email or phone), length caps
//   - best-effort per-IP rate limit (warm-instance memory)
// The Firebase admin credentials never leave the server (reused via _lib).
//
// Method: POST   Body: { name, email, phone, address?, company(honeypot), calc{...} }
// Response 200: { ok: true, id }  | 4xx/5xx: { ok: false, error }

import { fsCreate, logActivity } from './homie/_lib.js';

// ── Best-effort in-memory rate limit (per warm instance) ──
const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear(); // crude memory guard
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num  = v => (typeof v === 'number' && isFinite(v) ? v : null);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Honeypot: real users never fill this.
  if (body.company) return res.status(200).json({ ok: true, id: 'skip' });

  const name  = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);

  const hasEmail = email && email.includes('@') && email.includes('.');
  const hasPhone = phone && /\d{6,}/.test(phone.replace(/\D/g, ''));
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
  if (!hasEmail && !hasPhone) return res.status(400).json({ ok: false, error: 'contact_required' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  // ── Channel: this endpoint serves the Canone Check (landlord) AND the
  //    Match Quiz (tenant). Same leads pipeline, different framing. ──
  const channel = body.channel === 'match_quiz' ? 'match_quiz' : 'canone_check';
  const leadType = body.leadType === 'tenant' ? 'tenant' : 'landlord';

  // ── Calc snapshot from the tool (all optional / sanitised) ──
  // Dal 30/09/2026 il calcolatore è la scheda dell'Accordo (js/canone-engine.js):
  // `fascia` è la SUBFASCIA decisa dai parametri, `mensile` il MASSIMO
  // asseverabile stimato. Il vecchio `risparmioAnnuo` (stesso canone al 21% e
  // al 10%) non si legge più: non era la scelta vera del proprietario, e
  // l'operatore non deve ripeterla al telefono.
  const c = body.calc && typeof body.calc === 'object' ? body.calc : {};
  const idxList = (v, max, allowed) => (Array.isArray(v) ? v : [])
    .filter(x => allowed ? allowed.includes(x) : (Number.isInteger(x) && x >= 0 && x < max))
    .slice(0, 20);
  const SUBF = { A: 'inferiore', B: 'media', C: 'massima' };
  const TIPI = { '32': '3+2', trans: 'transitorio', stud: 'studenti' };
  const calc = {
    zona: clip(c.zona, 80), zoneCode: clip(c.zoneCode, 12),
    fascia: /^[ABC]$/.test(String(c.fascia || '')) ? c.fascia : null,
    nParametri: num(c.nParametri), parametri: idxList(c.parametri, 20),
    maggiorazioni: idxList(c.maggiorazioni, 0, ['arr', 'sem', 'asc', 'att', 'clA', 'eco', 'sis', 'clD']),
    normale: c.normale === false ? false : (c.normale === true ? true : null),
    zonaNonInElenco: c.zonaNonInElenco === true,
    mq: num(c.mq), supConv: num(c.supConv), arredo: clip(c.arredo, 12),
    contratto: clip(c.contratto, 12), classeEn: clip(c.classeEn, 12), eurMq: num(c.eurMq),
    mensile: num(c.mensile), annuo: num(c.annuo), cedolare10: num(c.cedolare10),
    pareggio: num(c.pareggio), rangeMin: num(c.rangeMin), rangeMax: num(c.rangeMax),
  };
  const address = clip(body.address, 160);

  // Human-readable summary for the portal Leads inbox.
  let summary;
  if (channel === 'match_quiz') {
    summary = clip(body.message, 500) || 'Lead da Match Quiz (studente/inquilino).';
  } else if (calc.zonaNonInElenco) {
    const parts = ['Zona NON in elenco: da verificare sulla tabella dell\'Accordo'];
    if (address) parts.push(`indirizzo: ${address}`);
    if (calc.mq) parts.push(`${calc.mq} mq`);
    if (calc.nParametri != null) parts.push(`${calc.nParametri} parametri`);
    if (TIPI[calc.contratto]) parts.push(TIPI[calc.contratto]);
    summary = `Richiesta verifica canone concordato — ${parts.join(' · ')}.`;
  } else {
    const parts = [];
    if (calc.zona) parts.push(`Zona: ${calc.zona}${calc.zoneCode ? ' (' + calc.zoneCode + ')' : ''}`);
    if (address) parts.push(`indirizzo: ${address}`);
    if (calc.mq) parts.push(`${calc.mq} mq`);
    if (calc.fascia) parts.push(`subfascia ${SUBF[calc.fascia]}${calc.nParametri != null ? ' (' + calc.nParametri + ' parametri)' : ''}`);
    if (TIPI[calc.contratto]) parts.push(TIPI[calc.contratto]);
    if (calc.mensile) parts.push(`massimo stimato ~€${calc.mensile}/mese`);
    summary = parts.length
      ? `Richiesta verifica canone concordato — ${parts.join(' · ')}.`
      : 'Richiesta verifica canone concordato.';
  }

  const zone = clip(body.zone, 80) || calc.zona || null;
  const budget = num(body.budget) || calc.mensile || null;
  const extra = body.extra && typeof body.extra === 'object' ? body.extra : null;

  const now = new Date();
  const lead = {
    source: 'web',                 // valid source read by portal + cockpit
    service: channel === 'match_quiz' ? 'Match Quiz' : 'Canone Check',
    leadType,
    name, email: email || null, phone: phone || null,
    message: summary,
    notes: summary,
    language: 'it',
    zone,
    budget,
    intent: channel,
    status: 'new',
    grade: null,
    propertyAddress: leadType === 'landlord' ? (address || calc.zona || null) : null,
    // audit
    ingestedBy: channel,
    sourceRef: channel,
    raw: { calc, quiz: extra, ip },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity(channel === 'match_quiz' ? 'Lead da Match Quiz' : 'Lead da Canone Check', 'lead', { leadId: id, zona: zone, budget }, channel);

    // Fire-and-forget event for the realtime daemon on the Mac Mini.
    // If notify fails (network blip, secret missing) the lead is already
    // saved — the regular 15-min pulse will pick it up via the snapshot
    // fingerprint, just slower. We never block the user response on this.
    fsCreate('agentNotifications', {
      type: 'lead.new',
      summary: `Lead da ${channel === 'match_quiz' ? 'Match Quiz' : 'Canone Check'} · ${name}${zone ? ' · ' + zone : ''}${budget ? ' · ' + budget + '€' : ''}`,
      priority: 'high',
      ref: { collection: 'leads', id },
      payload: { name, email, phone, zone, budget, channel, source: 'canone-lead' },
      dedupKey: `lead-${id}`,
      status: 'pending',
      actor: 'canone-lead',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }).catch(e => console.warn('[canone-lead] notify failed:', e.message));

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[canone-lead]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
