// api/withdraw.js — the online withdrawal function (city desks v1.8, stage W;
// spec §7). POST only, default function config (vercel.json stays at its 50
// rules), no new collection, rule, env or Storage prefix.
//
// Since 19/06/2026 an online seller must offer a withdrawal FUNCTION (CRD art.
// 11a, §356a BGB, L221-21, art. 54-bis Cod. cons.): a button "Withdraw from
// contract here", a confirmation "Confirm withdrawal", and an acknowledgement
// of receipt on a durable medium with the statement's content and the date and
// time it was received. withdrawal.html is the page (stream C); this is the
// server. Every desk (the six that sell, Paris and Berlin, which order and
// charge at signing) and the Rome Pacchetto post here.
//
// What it does, in order:
//   1. honeypot `company` → the same answer as a real statement, nothing done;
//      name, email, desk from a closed list, ref ≤ 80 → else a 400 (validation
//      never depends on what is in the database); per-IP rate limit.
//   2. the statement id is derived — withdraw-<sha1(email|ref|requestId)[0:20]>
//      — so a retried submit is the SAME statement: agentNotifications answers
//      409 and the client gets the same answer, never a second card or email.
//   3. best-effort matching, server-side: "BM X7K2Q" → leads.city.file,
//      "PAR-2026-0007"/"BER-…" → leads.city.order.number, else email + desk.
//      Only ORDERS count: a book_ order of Paris/Berlin or a paid svc_ order
//      (the six, and the Rome services). A free city_ file is not a contract.
//   4. leads/<order> is written only when ONE order matches and its email is
//      the statement's: a reference is guessable (order numbers are
//      sequential), and a stranger must not stop someone else's order. A
//      book_ order not signed beyond the draft and not paid → withdrawnAt +
//      withdrawal{at, via:'online', ackSentAt, statementId}: nothing was
//      charged, nothing is owed. Signed, invoiced or paid, closed, or a paid
//      svc_ order → the withdrawal map only. Never `city` (a top-level commit
//      mask replaces whole maps), always under the updateTime just read.
//   5. the acknowledgement goes at once to the consumer (Rome date and time,
//      the statement, their reference, our receipt number), the copy to the
//      operator (Italian, Reply-To the consumer: Gmail is the archive), and
//      the card in agentNotifications says what the operator must do. NOTHING
//      is decided automatically: no refund, no closure, no email beyond the
//      acknowledgement.
//   6. the answer is 200 {ok:true} whatever the match — the same status, the
//      same body. The acknowledgement carries only what the consumer typed and
//      the time: it never confirms that an order exists.
//
// Recovery: a statement whose acknowledgement failed, or whose first run died
// (no outcome after IN_FLIGHT_MS), is resumed by the next identical submit:
// one claim under the updateTime read, then the missing parts — the email with
// the ORIGINAL date and time, the lead stamp re-decided on fresh data. A
// failed acknowledgement also raises withdraw-mail-<hash> for the operator.
// With Firestore unreachable the two emails still go (the operator copy is
// then the only record, and says so); with nothing recorded anywhere → 503.
//
// Body: { name, email, ref, desk, service, requestId, company(honeypot), lang? }
// 200 {ok:true} · 400 {ok:false,error} · 405 · 429 rate_limited · 503 unavailable

import crypto from 'node:crypto';
import { fsCreate, fsGetVersioned, fsList, fsCommit, logActivity } from './homie/_lib.js';
import { sendEmail } from './agent/_lib.js';
import { shell, para, fine, row, hero } from './preagreement/_notify.js';
import { CITY_MARKETS, moneyOf } from './_market.js';
import DESK_CAL from '../js/desk-calendar.js';
import SCALO from '../js/scalo-codes.js';

const OPERATOR_EMAIL = () => process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const REPLY_TO = 'hello@boom-rome.com';            // the address of the model form and the page
export const IN_FLIGHT_MS = 60 * 1000;             // a first run older than this, with no outcome, is dead
export const MAX_ATTEMPTS = 5;                     // resumes per statement (each may send one email)
const MAIL_CAP_MS = 8000;

// ── per-IP rate limit (best effort, per warm instance) ────────────────────
const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
export const MAX_PER_WINDOW = 6;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > MAX_PER_WINDOW;
}

// ── the statement ─────────────────────────────────────────────────────────
const clip = (v, n) => (v == null ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailKey = (v) => String(v == null ? '' : v).trim().toLowerCase();

// The desks the page offers (spec §7), plus the spellings a link may carry:
// the Pacchetto's own emails say desk=Rome, the new links desk=Roma.
export const DESKS = ['Amsterdam', 'Barcelona', 'Berlin', 'London', 'Madrid', 'Milan', 'Paris', 'Valencia', 'Roma', 'other'];
const DESK_ALIAS = { '': 'other', rome: 'Roma', roma: 'Roma', milano: 'Milan', londra: 'London', parigi: 'Paris', berlino: 'Berlin', barcellona: 'Barcelona' };
export function deskOf(v) {
  const k = clip(v, 40).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(DESK_ALIAS, k)) return DESK_ALIAS[k];
  return DESKS.find((d) => d.toLowerCase() === k) || null;
}
// the market key of a desk ('roma' for Rome; null for "other") and of a lead
const deskMarket = (desk) => (desk === 'other' ? null : desk === 'Roma' ? 'roma' : desk.toLowerCase());
const leadMarket = (lead) => {
  const k = String((lead && lead.market) || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(CITY_MARKETS, k) ? k : 'roma';
};
const DESK_EN = { Roma: 'Rome' };
const DESK_IT = { Amsterdam: 'AMSTERDAM', Barcelona: 'BARCELLONA', Berlin: 'BERLINO', London: 'LONDRA', Madrid: 'MADRID', Milan: 'MILANO', Paris: 'PARIGI', Valencia: 'VALENCIA', Roma: 'ROMA', other: 'DESK NON INDICATO' };
const deskFlag = (desk) => (desk === 'Roma' ? '🇮🇹' : (CITY_MARKETS[deskMarket(desk) || ''] || {}).flag || '');

// The services, by the value the page's <select> posts (its text is accepted
// too). Anything else is the consumer's own words, kept verbatim (clipped).
export const SERVICES = {
  'full-search': 'Full Search', 'application-pack': 'Application Pack', 'attended-viewing': 'Attended Viewing',
  'concordato-pack': 'Pacchetto canone concordato', other: 'Other BOOM service',
};
const SERVICES_IT = { other: 'Altro servizio BOOM' };
export function serviceOf(v) {
  const s = clip(v, 80);
  if (!s) return { key: null, label: null };
  const k = s.toLowerCase();
  if (SERVICES[k]) return { key: k, label: SERVICES[k] };
  const byText = Object.keys(SERVICES).find((x) => SERVICES[x].toLowerCase() === k);
  return byText ? { key: byText, label: SERVICES[byText] } : { key: null, label: s };
}

export function normalizeStatement(body) {
  const name = clip(body.name, 120);
  if (name.length < 2) return { error: 'name_required' };
  const email = clip(body.email, 160);
  if (!EMAIL_RE.test(email)) return { error: 'email_required' };
  const ref = body.ref == null ? '' : String(body.ref).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (ref.length > 80) return { error: 'ref_too_long' };
  const desk = deskOf(body.desk);
  if (!desk) return { error: 'unknown_desk' };
  const svc = serviceOf(body.service);
  // one page load = one requestId (it only feeds the statement id): the city
  // pages' alphanumeric token or a UUID, anything else is ignored
  const requestId = /^[a-z0-9-]{8,64}$/i.test(String(body.requestId || '')) ? String(body.requestId) : null;
  const lang = desk === 'Roma' || String(body.lang || '').toLowerCase() === 'it' ? 'it' : 'en';
  return { st: { name, email, emailKey: emailKey(email), ref: ref || null, desk, service: svc.label, serviceKey: svc.key, requestId, lang } };
}

export function statementId(st) {
  const h = crypto.createHash('sha1').update(`${st.emailKey}|${st.ref || ''}|${st.requestId || ''}`).digest('hex');
  return 'withdraw-' + h.slice(0, 20);
}
// the number the consumer reads on the acknowledgement
export const receiptOf = (id) => 'W-' + String(id).slice('withdraw-'.length, 'withdraw-'.length + 10).toUpperCase();

// The statement in the words of the EU model form (Annex I(B)), filled with
// what the consumer chose — the same sentence the page's mailto helper writes.
export function statementText(st, lang = st.lang) {
  const it = lang === 'it';
  const svc = it ? (SERVICES_IT[st.serviceKey] || st.service) : st.service;
  const desk = st.desk === 'other' ? null : (it ? (st.desk === 'Roma' ? 'Roma' : st.desk) : (DESK_EN[st.desk] || st.desk));
  const what = (svc || (it ? 'un servizio BOOM' : 'a BOOM service')) + (desk ? ` (${desk})` : '');
  return it
    ? `Con la presente notifico il recesso dal mio contratto per la prestazione del seguente servizio: ${what}.`
    : `I hereby give notice that I withdraw from my contract for the provision of the following service: ${what}.`;
}

// ── Rome time: the calendar of the desks, one copy (js/desk-calendar.js) ──
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const pad = (n) => (n < 10 ? '0' : '') + n;
export function romeStamp(at) {
  let p = DESK_CAL.zoneParts(at, 'Europe/Rome');
  let tz = p ? p.tz : 'UTC';
  if (!p) { // Intl unavailable: say UTC, never pass it off as Rome
    p = { y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: at.getUTCDate(), min: at.getUTCHours() * 60 + at.getUTCMinutes() };
    p.key = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  }
  const time = `${pad(Math.floor(p.min / 60))}:${pad(p.min % 60)}`;
  const dateEn = `${p.d} ${MONTHS_EN[p.m - 1]} ${p.y}`, dateIt = `${p.d} ${MONTHS_IT[p.m - 1]} ${p.y}`;
  return {
    day: p.key, time, tz, dateEn, dateIt,
    en: `${dateEn}, ${time} (Rome time${tz ? ', ' + tz : ''})`,
    it: `${dateIt}, ore ${time} (ora di Roma)`,
    short: `${pad(p.d)}/${pad(p.m)}/${p.y} ${time}`,
  };
}
// 'YYYY-MM-DD' (+ n calendar days) → 'DD/MM/YYYY'; anything else verbatim
export function itDay(day, plus = 0) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day || ''));
  if (!m) return day || null;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + plus));
  return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
}
const romeDayOf = (iso) => { const t = new Date(iso || NaN); return Number.isFinite(t.getTime()) ? romeStamp(t).day : null; };

// ── matching ──────────────────────────────────────────────────────────────
// The order prefixes come from the registry (order.prefix, the FLIP's two
// lines) with the two known ones as the floor, so the function reads Paris
// and Berlin orders before and after the flip alike.
function orderPrefixes() {
  const out = new Set(['PAR', 'BER']);
  for (const c of Object.values(CITY_MARKETS)) if (c && c.order && /^[A-Z]{3}$/.test(String(c.order.prefix || ''))) out.add(c.order.prefix);
  return [...out];
}
// "bm-x7k2q", "BMX7K2Q", "File BM X7K2Q" → "BM X7K2Q"; "par 2026 7",
// "PAR-2026-0007-FS" (the invoice number) → "PAR-2026-0007".
export function refKeys(ref) {
  const s = String(ref || '').toUpperCase();
  const f = /(?:^|[^A-Z0-9])BM[\s\-_.:#]*([A-Z0-9]{5})(?![A-Z0-9])/.exec(s);
  const file = f && [...f[1]].every((c) => SCALO.FILE_ALPHABET.includes(c)) ? 'BM ' + f[1] : null;
  const re = new RegExp(`(?:^|[^A-Z0-9])(${orderPrefixes().join('|')})[\\s\\-_.]*(20\\d{2})[\\s\\-_.]*(\\d{1,6})(?!\\d)`);
  const o = re.exec(s);
  const order = o ? `${o[1]}-${o[2]}-${String(Number(o[3])).padStart(4, '0')}` : null;
  return { file, order };
}

// An ORDER is a contract: a book_ order (Paris, Berlin) or a paid svc_ order.
export const isOrderLead = (d) => !!d && /^book_/.test(String(d.id || '')) || (!!d && /^svc_/.test(String(d.id || '')) && d.paid === true);

// What the statement means for ONE order, read on its current data.
export function classify(lead) {
  const id = String((lead && lead.id) || '');
  if (/^book_/.test(id)) {
    if (lead.withdrawnAt) return 'book_withdrawn';
    const s = (lead.signing && lead.signing.status) || null;
    if (lead.paid === true || (s && s !== 'draft' && s !== 'no_fee')) return 'book_signed';
    if (lead.closedAt || s === 'no_fee') return 'book_closed';
    return 'book_open';
  }
  if (/^svc_/.test(id) && lead.paid === true) return 'svc_paid';
  return null;
}

// What is written on the order (top-level fields only; `city` never).
export function leadWrite(kind, lead, w) {
  const map = { at: w.at, via: 'online', ackSentAt: w.ackSentAt || null, statementId: w.statementId };
  const prev = lead && lead.withdrawal && typeof lead.withdrawal === 'object' ? lead.withdrawal : null;
  if (kind === 'book_open') return { withdrawnAt: w.at, withdrawal: prev || map };
  if (kind === 'book_signed' || kind === 'book_closed' || kind === 'svc_paid') return prev ? null : { withdrawal: map };
  return null;
}

async function findOrders(st) {
  const keys = refKeys(st.ref);
  const pick = (rows) => {
    const seen = new Map();
    for (const d of rows || []) if (isOrderLead(d) && !seen.has(d.id)) seen.set(d.id, d);
    return [...seen.values()];
  };
  try {
    const q = (field, value, limit) => fsList('leads', { filter: { field, op: 'EQUAL', value }, limit });
    const byRef = await Promise.all([
      keys.file ? q('city.file', keys.file, 10) : [],
      keys.order ? q('city.order.number', keys.order, 10) : [],
    ]);
    const refHits = pick(byRef.flat());
    if (refHits.length) return { via: 'ref', hits: refHits, keys };
    const forms = [...new Set([st.email.trim(), st.emailKey])];
    const rows = (await Promise.all(forms.map((k) => q('email', k, 20)))).flat();
    const want = deskMarket(st.desk);
    const hits = pick(rows.filter((d) => emailKey(d.email) === st.emailKey && (!want || leadMarket(d) === want)));
    return { via: 'email', hits, keys, refMiss: !!(keys.file || keys.order) };
  } catch (e) {
    void e;                                  // logs carry codes, never a Firestore body
    console.warn('[withdraw] lookup_failed');
    return { failed: true, keys };
  }
}

// The decision, BEFORE anything is written: one order and the same person, or
// a card that says why the operator must look. The single order is re-read
// with its version, so the stamp is decided on the data it will change.
async function decide(st, found) {
  if (!found || found.failed) return { kind: 'lookup_failed' };
  const hits = found.hits || [];
  if (!hits.length) return { kind: 'none', refMiss: !!found.refMiss };
  if (hits.length > 1) return { kind: 'ambiguous', leads: hits.slice(0, 5).map((d) => ({ id: d.id, market: leadMarket(d), state: classify(d) })), count: hits.length };
  const one = hits[0];
  if (emailKey(one.email) !== st.emailKey) return { kind: 'mismatch', leadId: one.id, lead: one, via: found.via };
  let v = null;
  try { v = await fsGetVersioned('leads/' + one.id); } catch (_) { v = null; }
  const lead = v ? v.data : one;
  return { kind: classify(lead), leadId: one.id, lead, version: v ? v.updateTime : null, via: found.via, refMiss: !!found.refMiss };
}

// ── the operator's card (Italian; the Telegram card shows type + summary) ─
const startNowIt = (v) => (v === true ? 'sì' : v === false ? 'no' : 'non registrato');
const svcLabelOf = (lead) => (lead.city && lead.city.serviceLabel) || SERVICES[lead.kind] || lead.kind || 'servizio';
// never throws: a card that failed to build must not change the answer
export function cardText(st, stamp, dec) {
  try { return cardOf(st, stamp, dec); }
  catch (_) { return `↩️ RECESSO ONLINE · ${DESK_IT[st.desk] || st.desk} · ${st.name} <${st.email}> · ricevuto ${stamp.short} — da abbinare a mano.`; }
}
function cardOf(st, stamp, dec) {
  const head = `↩️ RECESSO ONLINE · ${deskFlag(st.desk) ? deskFlag(st.desk) + ' ' : ''}${DESK_IT[st.desk]} · ${st.name} <${st.email}>`
    + `${st.ref ? ` · rif. «${st.ref}»` : ''}${st.service ? ` · ${st.service}` : ''} · ricevuto ${stamp.short} (ora di Roma)`;
  const lead = dec.lead || {};
  const c = lead.city || {};
  const at = dec.leadId ? ` leads/${dec.leadId}` : '';
  const viaNote = dec.refMiss ? ' (il riferimento non corrisponde a nessun ordine: abbinato per email)' : '';
  const order = [c.order && c.order.number ? `ordine ${c.order.number}` : null, c.serviceLabel || null, c.file ? `file ${c.file}` : null].filter(Boolean).join(' · ');
  switch (dec.kind) {
    case 'book_open':
      return `${head} — ${order}${viaNote} — nulla da rimborsare: niente è addebitato prima della firma. Ordine segnato come receduto.${at}`;
    case 'book_signed':
      return `${head} — ${order}${viaNote} — dopo la firma: finestra fino al ${itDay(c.withdrawalEndsOn) || 'non registrata'}, Start now ${startNowIt(c.startNow)} — decidi tu`
        + ` (il diritto può essersi esaurito col servizio interamente eseguito)${lead.paid === true ? '; compenso già pagato' : lead.signing && lead.signing.status === 'invoiced' ? '; fattura emessa' : ''}`
        + `${lead.withdrawal ? `; dichiarazione già ricevuta il ${itDay(romeDayOf(lead.withdrawal.at))}` : ''}. Nessuna modifica automatica.${at}`;
    case 'book_closed':
      return `${head} — ${order}${viaNote} — ordine già chiuso${lead.closeReason ? ` (${lead.closeReason})` : ''}${lead.closedAt ? ` il ${itDay(romeDayOf(lead.closedAt))}` : ''}: nulla da rimborsare.${at}`;
    case 'book_withdrawn':
      return `${head} — ${order} — già receduto il ${itDay(romeDayOf(lead.withdrawnAt)) || '?'}: nulla da fare oltre questa conferma.${at}`;
    case 'svc_paid': {
      const amount = Number.isFinite(Number(lead.amount_eur)) ? moneyOf(Number(lead.amount_eur), lead.currency) : null;
      const desk = leadMarket(lead) === 'roma' ? 'Roma' : (CITY_MARKETS[leadMarket(lead)] || {}).label;
      return `${head} — ordine pagato${amount ? ' ' + amount : ''} · ${svcLabelOf(lead)}${desk ? ` (${desk})` : ''}${c.file ? ` · file ${c.file}` : ''}${viaNote}`
        + ` — rimborso entro 14 giorni (entro il ${itDay(stamp.day, 14)}), con lo stesso mezzo di pagamento; Start now ${startNowIt(c.startNow)}`
        + `${c.withdrawalEndsOn ? `, finestra fino al ${itDay(c.withdrawalEndsOn)}` : ''}${lead.paid_at ? `, pagato il ${itDay(romeDayOf(lead.paid_at))}` : ''}`
        + `${lead.withdrawal ? `; dichiarazione già ricevuta il ${itDay(romeDayOf(lead.withdrawal.at))}` : ''}. Nessun rimborso automatico.${at}`;
    }
    case 'mismatch':
      return `${head} — il riferimento corrisponde a leads/${dec.leadId} (${(CITY_MARKETS[leadMarket(lead)] || {}).label || 'Roma'} · ${svcLabelOf(lead)}), ma l'email dell'ordine è un'altra (${lead.email || '?'}): verifica chi ha scritto, da abbinare a mano. Nessuna modifica all'ordine.`;
    case 'ambiguous':
      return `${head} — più ordini corrispondono (${dec.count}: ${dec.leads.map((l) => `leads/${l.id} ${l.market} ${l.state}`).join(', ')}): da abbinare a mano. Nessuna modifica.`;
    case 'lookup_failed':
      return `${head} — ricerca dell'ordine non riuscita: da abbinare a mano.`;
    default:
      return `${head} — nessun ordine trovato${dec.refMiss ? ' (neanche col riferimento)' : ''}: da abbinare a mano.`;
  }
}

// ── the two emails ────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const rowsTable = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">${rows.map(([k, v]) => row(k, esc(v))).join('')}</table>`;

// The acknowledgement: only what the consumer typed and when it arrived. It is
// the same for a matched and an unmatched statement — it never says an order
// exists, its number, its state, or what is owed.
export function ackEmail(st, stamp, receipt) {
  const it = st.lang === 'it';
  const desk = st.desk === 'other' ? null : (it ? st.desk : (DESK_EN[st.desk] || st.desk));
  const svc = (it ? (SERVICES_IT[st.serviceKey] || st.service) : st.service) || (it ? 'non indicato' : 'not given');
  const rows = it
    ? [['Dichiarazione', statementText(st, 'it')], ['Nome', st.name], ['Email indicata', st.email], ['Desk', desk || 'non indicato'],
      ['Servizio', svc], ['Suo riferimento', st.ref || 'non indicato'], ['Ricevuta il', stamp.it], ['Numero di ricevuta', receipt]]
    : [['Statement', statementText(st, 'en')], ['Name', st.name], ['Email used', st.email], ['Desk', desk || 'not given'],
      ['Service', svc], ['Your reference', st.ref || 'not given'], ['Received', stamp.en], ['Receipt number', receipt]];
  const when = it ? `il <b>${esc(stamp.dateIt)} alle ${stamp.time}</b> (ora di Roma)` : `on <b>${esc(stamp.dateEn)} at ${stamp.time}</b>, Rome time${stamp.tz ? ` (${stamp.tz})` : ''}`;
  const next = it
    ? 'Cosa succede ora: verifichiamo il suo ordine e le scriviamo da questo indirizzo. Se le spetta un rimborso, lo riceve entro 14 giorni da oggi, con lo stesso mezzo di pagamento usato.'
    : 'What happens next: we check your order and write to you from this address. If a refund is due, it is made within 14 days of today, with the payment method you used.';
  const notYou = it ? 'Se non ha inviato lei questa dichiarazione, risponda a questa email.' : 'If you did not send this statement, reply to this email.';
  const html = shell(
    hero({ eyebrow: it ? 'Recesso ricevuto' : 'Withdrawal received', value: esc(it ? stamp.dateIt : stamp.dateEn), note: esc(it ? `ore ${stamp.time}, ora di Roma` : `${stamp.time} Rome time${stamp.tz ? ` (${stamp.tz})` : ''}`) })
    + para(it ? `Gentile ${esc(st.name)},` : `Dear ${esc(st.name)},`)
    + para(it
      ? `abbiamo ricevuto la sua dichiarazione di recesso ${when}. Questa email è la nostra conferma di ricevimento, su supporto durevole: la conservi.`
      : `we received your statement of withdrawal ${when}. This email is our acknowledgement of receipt, on a durable medium: please keep it.`)
    + rowsTable(rows)
    + para(next)
    + fine(notYou),
    it ? `Recesso ricevuto il ${stamp.dateIt}, ore ${stamp.time}` : `Withdrawal received on ${stamp.dateEn} at ${stamp.time} Rome time`);
  const text = [
    it ? `Recesso ricevuto — ${stamp.it}` : `Withdrawal received — ${stamp.en}`, '',
    it ? `Gentile ${st.name},` : `Dear ${st.name},`,
    (it ? `abbiamo ricevuto la sua dichiarazione di recesso il ${stamp.dateIt} alle ${stamp.time} (ora di Roma). Questa email è la nostra conferma di ricevimento, su supporto durevole: la conservi.`
      : `we received your statement of withdrawal on ${stamp.dateEn} at ${stamp.time}, Rome time${stamp.tz ? ` (${stamp.tz})` : ''}. This email is our acknowledgement of receipt, on a durable medium: please keep it.`), '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '', next, notYou, '',
    'Egidi Immobiliare S.r.l. (BOOM) · Via dei Coronari 181/184, 00186 Roma · hello@boom-rome.com',
  ].join('\n');
  return {
    to: st.email,
    subject: (it ? 'Recesso ricevuto · BOOM' : 'Withdrawal received · BOOM') + (desk ? ' ' + desk : ''),
    html, text, replyTo: REPLY_TO,
    ...(process.env.GMAIL_USER ? { from: `BOOM <${process.env.GMAIL_USER}>` } : {}),
  };
}

// The operator's copy (Italian): the same statement, the card, Reply-To the
// consumer. In Gmail it is the archive of every statement — and with Firestore
// down it is the only record, so it says so.
export function operatorEmail(st, stamp, receipt, card, { unrecorded = false, id } = {}) {
  const rows = [['Dichiarazione', statementText(st)], ['Nome', st.name], ['Email', st.email], ['Desk', st.desk], ['Servizio', st.service || 'non indicato'],
    ['Riferimento', st.ref || 'non indicato'], ['Ricevuto', stamp.it], ['Ricevuta', receipt], ['Notifica', id ? 'agentNotifications/' + id : '—']];
  const html = shell(
    hero({ eyebrow: 'Recesso online ricevuto', value: esc(stamp.short), note: 'ora di Roma' })
    + (unrecorded ? para('<b>⚠️ Non registrato in Firestore (database non raggiungibile): questa email è l\'unica traccia. Abbina e segna a mano.</b>') : '')
    + para(esc(card))
    + rowsTable(rows)
    + fine('Al cliente parte la conferma di ricevimento con questi dati, data e ora. Niente è deciso in automatico: rimborsi, chiusure e risposte restano tuoi.'),
    `Recesso online — ${DESK_IT[st.desk]} — ${st.name}`);
  return {
    to: OPERATOR_EMAIL(),
    subject: `Recesso online — ${DESK_IT[st.desk]} — ${st.name}${st.ref ? ' — ' + st.ref : ''}`,
    html, replyTo: st.email,
  };
}

// both emails in parallel, under ONE cap; an outcome only for what went
async function sendMails(list) {
  let timer;
  const settled = await Promise.race([
    Promise.allSettled(list.map(([, mail]) => sendEmail(mail))),
    new Promise((r) => { timer = setTimeout(() => r(null), MAIL_CAP_MS); }),
  ]);
  clearTimeout(timer);
  const out = {};
  list.forEach(([key], i) => {
    const r = settled && settled[i];
    out[key] = r && r.status === 'fulfilled' ? { at: new Date(Date.now()).toISOString() } : { error: r ? String((r.reason && (r.reason.responseCode || r.reason.code)) || 'send_failed') : 'timeout' };
  });
  return out;
}

// the stamp on the order, decided again on fresh data (a cfy tap or a payment
// may land between the read and the write: the updateTime precondition sees it)
async function stampLead(dec, w) {
  if (!dec.leadId || !['book_open', 'book_signed', 'book_closed', 'svc_paid', 'book_withdrawn'].includes(dec.kind)) return { skipped: 'no_order' };
  let version = dec.version, lead = dec.lead;
  for (let i = 0; i < 3; i++) {
    if (!version) {
      const v = await fsGetVersioned('leads/' + dec.leadId).catch(() => null);
      if (!v) return { error: 'read_failed' };
      version = v.updateTime; lead = v.data;
    }
    const kind = classify(lead);
    const fields = leadWrite(kind, lead, w);
    if (!fields) return { kind, lead, skipped: 'nothing_to_write' };
    try {
      await fsCommit([{ docPath: 'leads/' + dec.leadId, precondition: { updateTime: version }, fields }]);
      return { kind, lead, at: w.at, wrote: Object.keys(fields) };
    } catch (e) {
      if (!e || !e.conflict) return { kind, lead, error: 'write_failed' };
      version = null;
    }
  }
  return { error: 'busy' };
}

async function raiseAckAlarm(id, st, receipt) {
  try {
    await fsCreate('agentNotifications', {
      type: 'withdrawal.ack_failed', priority: 'high', status: 'pending', actor: 'withdraw',
      summary: `📭 Recesso online ${receipt}: la conferma di ricevimento a ${st.email} NON è partita — mandala a mano (testo, data e ora in agentNotifications/${id}).`,
      ref: { collection: 'agentNotifications', id }, dedupKey: 'withdraw-mail-' + id.slice('withdraw-'.length),
      createdAt: new Date(Date.now()).toISOString(), attempts: 0,
    }, 'withdraw-mail-' + id.slice('withdraw-'.length));
  } catch (_) { /* 409 = already raised */ }
}

const outcomeFields = (mails) => {
  const f = {};
  if (mails.ack) { if (mails.ack.at) { f.ackSentAt = mails.ack.at; f.ackError = null; } else { f.ackFailedAt = new Date(Date.now()).toISOString(); f.ackError = mails.ack.error; } }
  if (mails.op) { if (mails.op.at) f.operatorCopySentAt = mails.op.at; else { f.operatorCopyFailedAt = new Date(Date.now()).toISOString(); f.operatorCopyError = mails.op.error; } }
  return f;
};
const stampFields = (s, dec) => (s.error
  ? { leadStampError: s.error }
  : { leadStampedAt: s.wrote ? s.at : null, leadStamp: { leadId: dec.leadId || null, kind: s.kind || dec.kind, wrote: s.wrote || null, skipped: s.skipped || null } });

// ── the first run ─────────────────────────────────────────────────────────
async function receive(st) {
  const id = statementId(st);
  const path = 'agentNotifications/' + id;
  let prior = null, dbDown = false;
  try { prior = await fsGetVersioned(path); } catch (_) { dbDown = true; }
  if (prior) return resume(path, prior);

  const at = new Date(Date.now());
  const iso = at.toISOString();
  const stamp = romeStamp(at);
  const receipt = receiptOf(id);
  let dec = dbDown ? { kind: 'lookup_failed' } : await decide(st, await findOrders(st));
  let card = cardText(st, stamp, dec);
  const statement = { name: st.name, email: st.email, desk: st.desk, service: st.service, serviceKey: st.serviceKey, ref: st.ref, requestId: st.requestId, lang: st.lang, text: statementText(st) };
  const doc = {
    type: 'withdrawal.received', priority: 'high', status: 'pending', actor: 'withdraw',
    summary: card, statement, receipt, receivedAt: iso, receivedRome: stamp.short,
    match: { kind: dec.kind, leadId: dec.leadId || null, via: dec.via || null, leads: dec.leads ? dec.leads.map((l) => l.id) : null },
    ...(dec.leadId ? { ref: { collection: 'leads', id: dec.leadId } } : {}),
    dedupKey: id, createdAt: iso, attempts: 0,
  };
  let unrecorded = false;
  try {
    await fsCreate('agentNotifications', doc, id);
  } catch (e) {
    if (e && e.exists) { // the same statement, a moment ago: same answer
      const again = await fsGetVersioned(path).catch(() => null);
      return again ? resume(path, again) : dec.kind;
    }
    unrecorded = true;
  }

  const mails = await sendMails([
    ['ack', ackEmail(st, stamp, receipt)],
    ['op', operatorEmail(st, stamp, receipt, card, { unrecorded, id })],
  ]);
  if (unrecorded) {
    console.warn('[withdraw] statement not recorded: ack', mails.ack.at ? 'sent' : mails.ack.error, 'op', mails.op.at ? 'sent' : mails.op.error);
    if (!mails.ack.at && !mails.op.at) { const err = new Error('unrecorded'); err.code = 'unrecorded'; throw err; }
    return dec.kind;
  }

  const s = await stampLead(dec, { at: iso, ackSentAt: mails.ack.at || null, statementId: id });
  const fields = { ...outcomeFields(mails), ...stampFields(s, dec), completedAt: new Date(Date.now()).toISOString() };
  if (s.kind && s.kind !== dec.kind) { // the order moved between the read and the write
    dec = { ...dec, kind: s.kind, lead: s.lead || dec.lead };
    card = cardText(st, stamp, dec);
    fields.summary = card;
    fields.match = { ...doc.match, kind: s.kind };
  }
  try { await fsCommit([{ docPath: path, precondition: { exists: true }, fields }]); }
  catch (e) { console.warn('[withdraw] outcome not recorded:', e && e.conflict ? 'conflict' : 'error'); }
  if (!mails.ack.at) await raiseAckAlarm(id, st, receipt);
  let timer;
  await Promise.race([
    Promise.resolve(logActivity('Recesso online ricevuto', 'withdrawal', { statementId: id, desk: st.desk, kind: dec.kind, leadId: dec.leadId || null }, 'withdraw')).catch(() => {}),
    new Promise((r) => { timer = setTimeout(r, 4000); }),
  ]);
  clearTimeout(timer);
  return dec.kind;
}

// ── a later identical submit: finish what the first run left undone ───────
async function resume(path, prior) {
  const d = prior.data || {};
  const st0 = d.statement || {};
  const kind = d.match && d.match.kind;
  const needsAck = !d.ackSentAt;
  const needsStamp = !!(d.match && d.match.leadId) && !d.leadStampedAt && !(d.leadStamp && d.leadStamp.skipped);
  const needsOp = !d.operatorCopySentAt;
  if (!needsAck && !needsStamp) return kind;
  const tries = Number(d.attempts) || 0;
  if (tries >= MAX_ATTEMPTS) return kind;
  const last = Date.parse(d.lastAttemptAt || d.receivedAt || '') || 0;
  if (!d.ackFailedAt && Date.now() - last < IN_FLIGHT_MS) return kind;     // the first run may still be at work
  try {
    await fsCommit([{ docPath: path, precondition: { updateTime: prior.updateTime }, fields: { lastAttemptAt: new Date(Date.now()).toISOString(), attempts: tries + 1 } }]);
  } catch (_) { return kind; }                                              // another submit holds the claim

  const st = { ...st0, emailKey: emailKey(st0.email) };
  const id = path.slice('agentNotifications/'.length);
  const at = new Date(Date.parse(d.receivedAt) || Date.now());
  const stamp = romeStamp(at);
  const receipt = d.receipt || receiptOf(id);
  const list = [];
  if (needsAck) list.push(['ack', ackEmail(st, stamp, receipt)]);
  if (needsAck && needsOp) list.push(['op', operatorEmail(st, stamp, receipt, d.summary || '', { id })]);
  const mails = list.length ? await sendMails(list) : {};
  const fields = { ...outcomeFields(mails) };
  if (needsStamp) {
    const dec = { kind, leadId: d.match.leadId, lead: null, version: null };
    const s = await stampLead(dec, { at: d.receivedAt || at.toISOString(), ackSentAt: (mails.ack && mails.ack.at) || d.ackSentAt || null, statementId: id });
    Object.assign(fields, stampFields(s, dec));
  }
  fields.completedAt = new Date(Date.now()).toISOString();
  try { await fsCommit([{ docPath: path, precondition: { exists: true }, fields }]); } catch (_) { /* logged nowhere: codes only */ }
  if (mails.ack && !mails.ack.at) await raiseAckAlarm(id, st, receipt);
  if (mails.ack && mails.ack.at && d.ackFailedAt) {
    try { await fsCommit([{ docPath: 'agentNotifications/withdraw-mail-' + id.slice('withdraw-'.length), precondition: { exists: true }, fields: { status: 'done', resolvedAt: fields.completedAt } }]); } catch (_) {}
  }
  return kind;
}

const SAME = (res) => res.status(200).json({ ok: true });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'no_body' });

  // Honeypot: the bot gets the answer a person gets, and nothing happens.
  if (body.company) return SAME(res);

  const n = normalizeStatement(body);
  if (n.error) return res.status(400).json({ ok: false, error: n.error });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  // Nothing recorded anywhere, or an unexpected failure: a 503, so the page
  // says "try again or email us". A retry is the same statement (its id is
  // derived), so it can only finish the job, never double it.
  try { await receive(n.st); }
  catch (e) {
    if (!e || e.code !== 'unrecorded') console.error('[withdraw] failed:', (e && (e.code || e.name)) || 'error');
    return res.status(503).json({ ok: false, error: 'unavailable' });
  }
  return SAME(res); // the one answer: match or not
}
