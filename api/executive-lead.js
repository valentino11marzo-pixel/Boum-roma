// api/executive-lead.js
// Public lead-capture for the /executive page — the desk for high-level
// foreign professionals coming to Rome on a work assignment (the transitional
// segment: UN agencies, embassies, corporate secondments, visiting academics,
// medical staff, film productions).
//
// One design decision carries the whole file: this person is NOT a B2B lead.
// They are a tenant — the most qualified tenant Rome receives — so the lead
// rides the EXISTING tenant machine untouched (Lead Brain → notify-pending →
// Commerciale). What must never get lost is the CONTEXT the operator reads
// before answering: assignment sector, dates, duration, employer. It lands in
// the first line of the human summary (EXECUTIVE — Roma · …), same discipline
// as reunion-lead's PROPRIÉTAIRE/LOCATAIRE heads.
//
// The honeypot trap, learned once already (tests/webforms): the hidden field
// is `company`, but THIS audience has a real employer to declare — so the
// visible field posts as `employer`, never `company`. An executive filling in
// their employer must not be silently swallowed as a bot.
//
// Hardening identical to the other public forms (reunion-lead, apply-lead):
// honeypot, required name + (email or phone), length caps, best-effort
// per-IP rate limit.
//
// Method: POST   Body: { name, email, phone, employer, sector, zone,
//                        budget, moveIn, duration, message, lang,
//                        company(honeypot) }
// Response 200: { ok: true, id } | 4xx/5xx: { ok: false, error }

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
// "2.500", "2,500" and "2500" are all the same monthly budget. Strip
// thousands separators FIRST — a naive parseFloat reads the Italian "2.500"
// as two euros and a half, and a €2/month executive budget would sail through
// every later check looking merely odd instead of wrong.
const num = v => {
  const s = String(v == null ? '' : v).replace(/[.,\s](?=\d{3}(\D|$))/g, '');
  const n = typeof v === 'number' ? v : parseFloat(s.replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};
// Deterministic thousands for the operator's eyes ("2.500"). Never
// toLocaleString: with a small-ICU Node build it silently degrades and the
// summary prints "2500" — a formatting promise that depends on the runtime
// is not a promise.
const fmtEur = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// The assignment sectors Rome actually receives — the one word that tells the
// operator which conversation this is before reading anything else. Free text
// never enters: an unknown value falls to null, not to an invented label.
export const SECTORS = {
  corporate:  'azienda / secondment',
  un:         'organizzazione internazionale (FAO/WFP/IFAD/ONU)',
  diplomatic: 'ambasciata / missione diplomatica',
  research:   'università / ricerca',
  medical:    'sanità',
  film:       'produzione film & media',
  other:      'altro',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Honeypot: real users never fill this. Answer 200 so the bot learns nothing.
  // NB: `employer` is the VISIBLE field — only `company` is the trap.
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

  const employer = clip(body.employer, 160);
  const sectorKey = String(body.sector || '').toLowerCase();
  const sector = SECTORS[sectorKey] ? sectorKey : null;
  const zone     = clip(body.zone, 120);
  const message  = clip(body.message, 1000);
  const budget   = num(body.budget);          // monthly, always — never a purchase total
  const moveIn   = clip(body.moveIn, 40);
  const duration = clip(body.duration, 30);   // '3-6', '6-12'… months, from the select

  // Human-readable summary for the portal Leads inbox + the Telegram card.
  // The operator reads THIS line, not the fields: sector first (it decides
  // the voice), then the numbers that shape the answer.
  const parts = [];
  if (sector && sector !== 'other') parts.push(SECTORS[sector]);
  if (employer) parts.push(employer);
  if (zone) parts.push(zone);
  if (budget) parts.push(`~€${fmtEur(budget)}/mese`);
  if (moveIn) parts.push(`arrivo ${moveIn}`);
  if (duration) parts.push(`${duration} mesi`);
  const summary = [
    `EXECUTIVE — Roma${parts.length ? ' · ' + parts.join(' · ') : ''}.`,
    message,
  ].filter(Boolean).join(' ');

  // The page is English-first and this audience is foreign: 'en' is the honest
  // default. replyLang() re-decides from their actual words at reply time —
  // what must never happen is storing 'it' for someone who wrote in English
  // (the leads/scan-inbox lesson).
  const lang = body.lang === 'it' ? 'it' : 'en';

  const now = new Date();
  const lead = {
    source: 'web',                 // valid source read by portal + cockpit
    service: 'BOOM Executive',
    market: 'roma',
    leadType: 'tenant',            // a person seeking a home — NOT B2B
    name, email: email || null, phone: phone || null,
    message: summary,
    notes: summary,
    language: lang,
    zone,
    budget,
    budgetKind: 'monthly',
    moveIn,
    intent: 'executive_relocation',
    status: 'new',
    grade: null,
    propertyAddress: null,
    // audit
    ingestedBy: 'executive-lead',
    sourceRef: 'executive',
    executive: {
      sector,
      employer,
      duration,
      at: now.toISOString(),
    },
    raw: { sector: sectorKey || null, employer, zone, budget, moveIn, duration, message, lang, ip },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity('Lead executive (trasferta Roma)', 'lead', { leadId: id, sector, employer, budget }, 'executive-lead');

    // Fire-and-forget: the lead is already saved, so a failed notify only
    // means the operator hears about it on the next pulse instead of now.
    fsCreate('agentNotifications', {
      type: 'lead.new',
      summary: `💼 EXECUTIVE · ${name}` +
        (sector && sector !== 'other' ? ` · ${SECTORS[sector]}` : '') +
        (zone ? ` · ${zone}` : '') +
        (budget ? ` · €${fmtEur(budget)}/mese` : ''),
      priority: 'high',
      ref: { collection: 'leads', id },
      payload: { name, email, phone, sector, employer, zone, budget, source: 'executive-lead' },
      dedupKey: `lead-${id}`,
      status: 'pending',
      actor: 'executive-lead',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }).catch(e => console.warn('[executive-lead] notify failed:', e.message));

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[executive-lead]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
