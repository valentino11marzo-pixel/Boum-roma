// api/apply-lead.js
// Public lead-capture for the apartment-detail APPLY / RESERVE / WAITLIST
// flow. The moment a visitor passes the quick eligibility check we persist
// the qualification snapshot to the `leads` collection — the SAME shape
// portal.html + cockpit-preview.html already read — so every serious
// applicant lands in the pipeline even if they never reach Stripe.
//
// PUBLIC endpoint (called from the browser) — same layered hardening as
// /api/canone-lead: honeypot (`company`), length caps, per-IP rate limit.
// Firebase admin credentials never leave the server (via homie/_lib).
//
// Method: POST
// Body: { name, email, phone, company(honeypot),
//         listingId, listingName, listingPrice, zone,
//         kind('apply'|'reserve'), waitlist(bool),
//         income(number), guarantor(bool),
//         household('solo'|'couple'|'family'|'flatmates'),
//         occupation('employed'|'self-employed'|'student'|'relocating'),
//         moveIn('YYYY-MM-DD'), durationMonths(number) }
// Response 200: { ok: true, id } | 4xx/5xx: { ok: false, error }
//
// LA LEZIONE DEL 30 SETTEMBRE 2026 («chi fa apply per la casa non lo vedo:
// né nei lead del portal, né via email»). Letto nei log e nella casella,
// non dedotto: due candidature vere (Berk, 16:38 e 16:43 UTC) → 200, lead
// scritto, conferma partita AL CANDIDATO — e all'operatore niente, perché
// questa porta non ha MAI scritto a BOOM: l'unico avviso era la card
// Telegram, che a sua volta poteva non partire (vedi api/leads/_fresh.js).
// Ora ogni candidatura arriva ANCHE per email all'operatore, con tutto ciò
// che il candidato ha dichiarato, i tasti per rispondergli, e Reply-To sul
// candidato. E la pagina nuova (apartment-detail.html) manda reddito e
// garante come FASCE di testo ("1500-2500", "yes-italy") e il numero dei
// firmatari: la porta accettava solo un numero e `true`, quindi buttava via
// in silenzio metà della qualificazione. Ora le fasce restano, dichiarate.

import { fsCreate, fsPatch, logActivity } from './homie/_lib.js';
// statici, mai lazy: il bundler Vercel traccia solo gli import top-level
// (la lezione nodemailer del 2026-07)
import { sendEmail } from './agent/_lib.js';
import { shell, para, fine, btn, btn2, row, hero } from './preagreement/_notify.js';

// Dove arriva l'avviso di candidatura. Stessa convenzione delle altre email
// all'operatore (sign/_notify, fiscal/_aspi, ops/*); LEADS_NOTIFY_EMAIL la
// scavalca solo per i lead, se un giorno li legge qualcun altro.
const OPERATOR_EMAIL = () => process.env.LEADS_NOTIFY_EMAIL
  || process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const SITE = 'https://www.boomrome.com';

const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num  = v => { const x = Number(v); return isFinite(x) && x >= 0 ? x : null; };

const esc = v => String(v == null ? '' : v).replace(/[<>&"]/g,
  c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const HOUSEHOLDS  = new Set(['solo', 'couple', 'family', 'flatmates']);
const OCCUPATIONS = new Set(['employed', 'self-employed', 'student', 'relocating']);

// Le fasce che apartment-detail.html offre (select #apReddito). Testo
// dichiarato, mai un numero inventato: "1500-2500" NON diventa 2000.
export const INCOME_BANDS = {
  'under-1500': 'under €1500/mo',
  '1500-2500':  '€1500–2500/mo',
  '2500-4000':  '€2500–4000/mo',
  'over-4000':  'over €4000/mo',
};
// select #apGarante. La pagina classica manda ancora un booleano.
export const GUARANTORS = {
  'yes-italy':  { has: true,  label: 'guarantor in Italy' },
  'yes-abroad': { has: true,  label: 'guarantor abroad' },
  'no':         { has: false, label: 'no guarantor' },
  'prepay':     { has: false, label: 'no guarantor — can prepay months' },
};

// Reddito: un numero (pagina classica) oppure una fascia (pagina nuova).
// 0 non è un reddito dichiarato: la pagina classica manda `income: 0` quando
// il campo non c'è, e "income €0/mo" in testa al lead era una bugia.
export function incomeOf(v) {
  if (typeof v === 'string' && INCOME_BANDS[v]) return { income: null, incomeBand: v };
  const n = num(v);
  return { income: n && n > 0 ? n : null, incomeBand: null };
}
export function guarantorOf(v) {
  if (v === true) return { guarantor: true, guarantorType: null };
  const g = typeof v === 'string' ? GUARANTORS[v] : null;
  return g ? { guarantor: g.has, guarantorType: v } : { guarantor: false, guarantorType: null };
}
export function signersOf(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}

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

  const { income, incomeBand } = incomeOf(body.income);
  const { guarantor, guarantorType } = guarantorOf(body.guarantor);
  const signers    = signersOf(body.signers);
  const household  = HOUSEHOLDS.has(body.household) ? body.household : null;
  const occupation = OCCUPATIONS.has(body.occupation) ? body.occupation : null;
  const moveIn     = /^\d{4}-\d{2}-\d{2}$/.test(String(body.moveIn || '')) ? body.moveIn : null;
  const durationM  = num(body.durationMonths);
  const kind       = body.kind === 'reserve' ? 'reserve' : 'apply';
  const waitlist   = body.waitlist === true;
  const commute    = (body.commute && typeof body.commute === 'object')
    ? { place: clip(body.commute.place, 60), km: num(body.commute.km), label: clip(body.commute.label, 60) }
    : null;

  // Human-readable qualification snapshot for the portal inbox.
  const parts = [];
  parts.push((waitlist ? 'WAITLIST ' : '') + kind.toUpperCase() + ' from listing page');
  if (income != null) parts.push('income €' + income + '/mo');
  else if (incomeBand) parts.push('income ' + INCOME_BANDS[incomeBand]);
  if (guarantorType)  parts.push(GUARANTORS[guarantorType].label);
  else if (guarantor) parts.push('has guarantor');
  if (occupation)     parts.push(occupation);
  if (household)      parts.push('moving in: ' + household);
  if (signers && signers > 1) parts.push(signers + ' signers');
  if (moveIn)         parts.push('move-in ' + moveIn);
  if (durationM)      parts.push(durationM + ' months');
  if (commute && commute.place) parts.push('commute: ' + commute.place + (commute.label ? ' ' + commute.label : ''));
  const message = parts.join(' · ');

  const now = new Date();
  const lead = {
    source: 'web',
    service: null,
    name,
    email: hasEmail ? email : null,
    phone: hasPhone ? phone : null,
    message,
    notes: message,
    language: 'en',
    budget: num(body.listingPrice),
    zone: clip(body.zone, 80),
    situation: occupation === 'student' ? 'student' : (occupation ? 'worker' : null),
    propertyId: clip(body.listingId, 80),
    propertyTitle: clip(body.listingName, 160),
    propertyPrice: num(body.listingPrice),
    propertyAddress: null,
    intakeForm: false,
    status: 'new',
    grade: null,
    intent: waitlist ? 'waitlist' : kind,
    confidence: null,
    tier: null,
    ingestedBy: 'apply-lead',
    sourceRef: null,
    raw: {
      kind, waitlist, income, incomeBand, guarantor, guarantorType,
      household, occupation, signers,
      moveIn, durationMonths: durationM, commute, ip,
      ua: clip(req.headers['user-agent'], 300),
    },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    try {
      await logActivity(
        'Apply lead: ' + name + (lead.propertyTitle ? ' → ' + lead.propertyTitle : ''),
        'lead',
        { leadId: id, message },
        'apply-lead'
      );
    } catch { /* activity log is best-effort */ }

    // Due email, in parallelo e sotto lo STESSO tetto di 8s: al candidato
    // la conferma (la pagina promette «a person replies within 2 hours»),
    // all'operatore l'avviso con tutto ciò che il candidato ha dichiarato.
    // Best-effort: un SMTP lento non fa mai fallire la candidatura già
    // salvata. Il timbro sul lead SOLO per l'email partita davvero — prima
    // `ackEmailAt` si scriveva anche quando vinceva il timeout.
    const sends = [];
    if (lead.email) sends.push(['ackEmailAt', applicantEmail(lead)]);
    sends.push(['operatorEmailAt', operatorEmail(lead, id)]);
    const settled = await Promise.race([
      Promise.allSettled(sends.map(([, mail]) => sendEmail(mail))),
      new Promise((r) => setTimeout(() => r(null), 8000)),
    ]);
    if (!settled) console.error('[apply-lead] email: timeout 8s, lead ' + id);
    const stamp = {};
    (settled || []).forEach((r, i) => {
      if (r.status === 'fulfilled') stamp[sends[i][0]] = new Date().toISOString();
      else console.error('[apply-lead] ' + sends[i][0] + ':', r.reason && r.reason.message);
    });
    if (Object.keys(stamp).length) { try { await fsPatch('leads/' + id, stamp); } catch {} }
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[apply-lead]', err && err.message);
    return res.status(500).json({ ok: false, error: 'store_failed' });
  }
}

// ── Le due email, pure (si testano senza SMTP) ─────────────────────────────

const cosaEn = l => l.intent === 'waitlist' ? 'waitlist request'
  : (l.intent === 'reserve' ? 'reservation request' : 'application');
const cosaIt = l => l.intent === 'waitlist' ? "Lista d'attesa"
  : (l.intent === 'reserve' ? 'Prenotazione' : 'Candidatura');

export function applicantEmail(lead) {
  const primo = esc(String(lead.name || '').split(' ')[0] || 'there');
  const casa = lead.propertyTitle ? esc(lead.propertyTitle) : 'the home you chose';
  const cosa = cosaEn(lead);
  return {
    to: lead.email,
    subject: lead.intent === 'waitlist' ? 'You are on the list — BOOM Rome'
      : 'Received — your ' + cosa + ' at BOOM Rome',
    html: shell(
      para(`Hi ${primo},`)
      + para(`your ${cosa} for <b>${casa}</b> just reached us — a person
          with a name reads it and replies within 2 hours (office hours,
          Rome time).`)
      + para(`If it moves forward, the next step is your written
          pre-agreement: a private link with the exact figures — rent,
          deposit, fee, dates — before a single euro moves.`)
      + btn('https://wa.me/393313251961', 'Questions? WhatsApp us')
      + fine('BOOM Rome · Egidi Immobiliare S.r.l. — you received this '
          + 'because you applied on boomrome.com.'),
      `Your ${cosa} reached us`),
  };
}

const HOUSEHOLD_IT = { solo: 'da solo/a', couple: 'coppia', family: 'famiglia', flatmates: 'coinquilini' };
const OCCUPATION_IT = { employed: 'dipendente', 'self-employed': 'autonomo/a',
  student: 'studente', relocating: 'trasferimento per lavoro' };
const INCOME_IT = { 'under-1500': 'sotto €1.500/mese', '1500-2500': '€1.500–2.500/mese',
  '2500-4000': '€2.500–4.000/mese', 'over-4000': 'oltre €4.000/mese' };
const GUARANTOR_IT = { 'yes-italy': 'sì, in Italia', 'yes-abroad': "sì, all'estero",
  no: 'no', prepay: 'no — può pagare mesi anticipati' };
const itDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

// L'avviso all'operatore: chi, per quale casa, cosa ha dichiarato, e i tasti
// per rispondergli. In italiano (è per l'operatore); il messaggio WhatsApp
// precompilato è in inglese perché la pagina che l'ha raccolto è in inglese.
export function operatorEmail(lead, id) {
  const r = lead.raw || {};
  const casaTxt = lead.propertyTitle || 'casa non indicata';
  const phoneDigits = String(lead.phone || '').replace(/\D/g, '');
  const primo = String(lead.name || '').split(' ')[0] || 'there';
  const waText = `Hi ${primo}, this is BOOM Rome — thanks for your ${cosaEn(lead)}`
    + (lead.propertyTitle ? ` for ${lead.propertyTitle}` : '') + '. ';
  const rows = [
    lead.email ? row('Email', `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>`) : '',
    lead.phone ? row('Telefono', `<a href="tel:${esc(phoneDigits)}">${esc(lead.phone)}</a>`) : '',
    row('Casa', lead.propertyId
      ? `<a href="${SITE}/listing/${encodeURIComponent(lead.propertyId)}">${esc(casaTxt)}</a>`
      : esc(casaTxt), lead.propertyPrice ? `€${esc(lead.propertyPrice)}/mese` : null),
    r.moveIn ? row('Ingresso', esc(itDate(r.moveIn))) : '',
    r.durationMonths ? row('Durata', esc(r.durationMonths) + ' mesi') : '',
    r.household ? row('Chi entra', esc(HOUSEHOLD_IT[r.household] || r.household)) : '',
    r.signers ? row('Firmatari', esc(r.signers)) : '',
    r.occupation ? row('Lavoro', esc(OCCUPATION_IT[r.occupation] || r.occupation)) : '',
    r.incomeBand ? row('Reddito', esc(INCOME_IT[r.incomeBand]))
      : (r.income ? row('Reddito', `€${esc(r.income)}/mese`) : ''),
    r.guarantorType ? row('Garante', esc(GUARANTOR_IT[r.guarantorType]))
      : (r.guarantor ? row('Garante', 'sì') : ''),
    r.commute && r.commute.place ? row('Tragitto', esc(r.commute.place + (r.commute.label ? ' ' + r.commute.label : ''))) : '',
  ].filter(Boolean).join('');
  const reply = phoneDigits
    ? btn(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(waText)}`, 'Rispondi su WhatsApp')
    : (lead.email ? btn(`mailto:${lead.email}?subject=${encodeURIComponent('BOOM Rome — ' + casaTxt)}`, 'Rispondi via email') : '');
  return {
    to: OPERATOR_EMAIL(),
    ...(lead.email ? { replyTo: lead.email } : {}),
    subject: `${cosaIt(lead)} dal sito — ${lead.name || 'senza nome'} → ${casaTxt}`,
    html: shell(
      hero({ eyebrow: cosaIt(lead) + ' dal sito', value: esc(lead.name || 'Senza nome'),
        note: esc(casaTxt) })
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">${rows}</table>`
      + para(lead.email
        ? 'Il candidato ha già ricevuto la conferma automatica, che promette una risposta entro 2 ore. <b>Rispondi a questa email</b> per scrivergli direttamente.'
        : 'Nessuna email lasciata: si risponde su WhatsApp o al telefono.')
      + reply
      + btn2(`${SITE}/portal#leads`, 'Apri i lead nel portal')
      + fine(`Lead ${esc(id)} · stato «nuovo» nel portal (Lead → Nuovi).`),
      lead.message || ''),
  };
}
