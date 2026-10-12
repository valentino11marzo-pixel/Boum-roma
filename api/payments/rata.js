// api/payments/rata.js — LA TUA RATA, senza login: paghi con bonifico (o con
// carta, dove il contratto lo consente) e dici "ho fatto il bonifico" con la
// foto della ricevuta.
//
// Gli inquilini di un palazzo preso in carico dalla tabella della
// proprietaria non hanno un account BOOM (e non devono averlo per pagare).
// Ogni mese ricevono su WhatsApp UN link, quello della loro rata. Il link
// apre /rata, che parla con questa porta:
//
//   op:'lookup'   { id, t }                  → la rata (etichette e stato,
//                 mai chi abita lì), se la carta è disponibile e con quale
//                 commissione (DETTA prima), il conto del contratto per il
//                 bonifico se il contratto lo porta
//   op:'report'   { id, t, date?, note?, proof?{base64,type,name}, company }
//                 → "ho pagato con bonifico": la rata diventa SEGNALATA
//                 (tenantReported, come da /casa), mai pagata — l'incasso lo
//                 registra un umano che ha visto i soldi. Una seconda
//                 segnalazione con contenuto NUOVO (l'altra metà di un
//                 co-intestatario, la ricevuta mancante) si ACCODA in
//                 tenantReports; una identica non raddoppia niente
//   op:'withdraw' { id, t }                  → annulla una segnalazione sbagliata
//   op:'links'    Bearer admin { paymentIds[] } → { links: {id: url}, skipped }
//
// Regole dure (tests/rata/run.mjs, tests/rata/soldi.mjs):
// - Il token è QUELLO del link di pagamento (api/payments/_token.js, kind
//   'pay'): derivato, niente da coniare, ruotare HOMIE_SECRET revoca tutto.
//   Un link apre UNA rata: non si segnala per un'altra.
// - Segnalare non è pagare. La rata resta da incassare finché l'operatore non
//   preme "Registra incasso": una foto si può sbagliare, l'estratto conto no.
// - La scrittura è condizionata (updateTime letto): un pagamento con carta
//   arrivato nel mezzo non viene coperto da una segnalazione.
// - Prima la segnalazione, poi il ping su Telegram: un ping fallito non perde
//   mai la segnalazione. La ricevuta è facoltativa e un suo upload fallito lo
//   si DICE alla pagina (che chiede di mandarla su WhatsApp), mai in silenzio.
// - La carta segue BOOM_RENT.cardPolicy: su un contratto preso in carico dal
//   Palazzo è SPENTA finché l'interno non ha il mandato all'incasso, e senza
//   commissione all'inquilino salvo scelta esplicita. Quando c'è, la
//   commissione si mostra PRIMA di aprire Stripe.
// - Il conto per il bonifico è quello scritto nel contratto (landlordIban):
//   mai il conto di BOOM al posto di quello pattuito. Senza IBAN nel
//   contratto la pagina dice "il conto di sempre", non ne inventa uno; il BIC
//   compare solo se il contratto lo porta.
// - La data di "oggi" è quella di Roma, e si accetta fino a domani UTC: chi
//   segnala a mezzanotte e mezza non riceve un "data nel futuro".

import crypto from 'node:crypto';
import Stripe from 'stripe';
import { fsGet, fsGetVersioned, fsCommit, fsCreate, fsGetMany, readJson } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { verifyPayToken, payToken, payLink } from './_token.js';
import { payCausale } from './_ref.js';
import { paymentLabel, feeFor } from './pay.js';
import RENT from '../../js/rent-engine.js';

const BASE = process.env.PUBLIC_BASE_URL || 'https://www.boomrome.com';
const ID_RE = /^[\w.-]{1,200}$/;
const PROOF_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
// Il corpo di una funzione Vercel si ferma a ~4,5 MB e il base64 pesa un
// terzo in più: 3 MB di file sono il tetto onesto (le foto la pagina le
// riduce prima, un PDF di una ricevuta ci sta largo).
const MAX_PROOF = 3 * 1024 * 1024;
// Quante segnalazioni sulla stessa rata: due metà, una ricevuta mandata dopo,
// un errore. Oltre, si parla con BOOM invece di accumulare.
export const MAX_REPORTS = 6;

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

/** L'URL che va su WhatsApp: una pagina sola per carta e bonifico. */
export function rataLink(paymentId, origin) {
  const id = String(paymentId || '');
  if (!ID_RE.test(id)) return '';
  return (origin || BASE) + '/rata?id=' + encodeURIComponent(id) + '&t=' + payToken('pay', id);
}

const rl = new Map();
function rateOk(ip, max = 8, windowMs = 10 * 60_000) {
  const now = Date.now(), e = rl.get(ip);
  if (!e || now - e.t >= windowMs) { rl.set(ip, { c: 1, t: now }); if (rl.size > 2000) rl.clear(); return true; }
  e.c += 1;
  return e.c <= max;
}
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return typeof xff === 'string' && xff ? xff.split(',')[0].trim() : (req.headers['x-real-ip'] || 'unknown');
}

function ymd(v) {
  const s = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function isoOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return '';
}
/** Il giorno civile di Roma di un istante (la data che l'inquilino vede sul telefono). */
export function romeDay(at) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at || new Date());
  const p = {}; parts.forEach(x => { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
}
// La data più avanti che si accetta: domani in UTC. Roma è al più due ore
// avanti (e un inquilino a Tokyo nove): oltre domani UTC è davvero futuro.
export function latestReportDay(now) {
  return new Date((now || new Date()).getTime() + 864e5).toISOString().slice(0, 10);
}
const httpsUrl = (v) => {
  try { const u = new URL(String(v || '')); return u.protocol === 'https:' ? u.href : ''; } catch (_) { return ''; }
};

// Il conto che l'inquilino vede per il bonifico: forma E controllo mod-97.
// Un IBAN sbagliato è peggio di nessuno (il pagamento parte e non arriva):
// se non torna, la pagina dice «il conto di sempre».
function ibanOk(v) {
  const ib = String(v || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ib)) return '';
  const r = ib.slice(4) + ib.slice(0, 4);
  let n = '', rem = 0;
  for (const ch of r) n += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  for (let i = 0; i < n.length; i += 7) rem = Number(String(rem) + n.slice(i, i + 7)) % 97;
  return rem === 1 ? ib : '';
}
// Il BIC/SWIFT solo nella forma vera (8 o 11 caratteri) e dello STESSO paese
// dell'IBAN (un conto italiano sta in una banca italiana): serve a chi paga
// da fuori dell'area SEPA. Mai dedotto dall'IBAN, mai inventato.
function bicOk(v, iban) {
  const b = String(v || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(b)) return '';
  return iban && b.slice(4, 6) === String(iban).slice(0, 2) ? b : '';
}

// Le segnalazioni di una rata, nell'ordine in cui sono arrivate. Una rata
// segnalata prima che esistesse l'elenco ha la sua segnalazione nei campi in
// testa: diventa la prima voce.
export function reportsOf(p) {
  const pay = p || {};
  const list = Array.isArray(pay.tenantReports) ? pay.tenantReports.filter(x => x && typeof x === 'object') : [];
  if (list.length) return list;
  if (pay.tenantReported === true) {
    return [{ at: isoOf(pay.tenantReportedAt), date: ymd(pay.tenantReportDate), note: clip(pay.tenantNotes, 500),
      proofUrl: pay.proofUrl || '', proofName: pay.proofName || '', proofHash: '', via: pay.reportedVia || '' }];
  }
  return [];
}

// Le parole della pagina, dalla rata. Pura: si testa senza rete.
// `contractError`: il contratto non si è potuto leggere — non si sa se la
// carta sia permessa, quindi si spegne (resta il bonifico).
export function rataView(p, { property, contract, feeStats, today, contractError } = {}) {
  const pay = p || {}, state = RENT.paymentState(pay, today), amount = RENT.amount(pay.amount);
  const blocked = RENT.paymentBlockReason(pay, 'rent');
  const pr = property || {}, c = contract || {};
  const interno = clip(pr.interno || c.unit, 12);
  const building = clip(pr.palazzoNome || String(pr.address || c.propertyAddress || '').split(',')[0] || pr.name, 120);
  const iban = ibanOk(c.landlordIban);
  const rentPart = RENT.amount(pay.rentAmount), oneriPart = RENT.amount(pay.oneriAmount);
  const canPay = RENT.canPay(pay, today);
  const policy = contractError && String(pay.source || '') !== 'palazzo-import'
    ? { available: false, reason: 'unverified', fee: 'none' }
    : RENT.cardPolicy(pay, contract, property);
  const cardAvailable = canPay && amount != null && policy.available;
  const fee = cardAvailable ? feeFor(policy, amount, feeStats || null) : 0;
  const reports = state === 'reported' ? reportsOf(pay) : [];
  const periodFrom = ymd(pay.periodFrom), periodTo = ymd(pay.periodTo);
  const canWithdraw = pay.tenantReported === true && ['pending', 'due', 'overdue'].includes(String(pay.status || '').toLowerCase());
  const view = {
    label: paymentLabel(pay).replace(/ — \d{4}-\d{2}$/, ''),
    kind: RENT.isRentPayment(pay) ? 'rent' : String(pay.type || '').toLowerCase() === 'deposit-balance' ? 'depbal' : 'other',
    month: /^\d{4}-\d{2}$/.test(String(pay.month || '')) ? pay.month : '',
    coversTo: /^\d{4}-\d{2}$/.test(String(pay.coversTo || '')) ? pay.coversTo : '',
    amount, dueDate: ymd(pay.dueDate), state, blocked,
    // Il periodo vero della rata (mesi di contratto) e se è in proporzione:
    // un importo più basso del solito senza spiegazione sembra un errore.
    periodFrom, periodTo, prorated: pay.prorated === true && !!periodFrom && !!periodTo,
    where: { building, interno },
    canPay,
    // La carta: disponibile solo su una rata pagabile E se la regola lo
    // consente. reason: 'card_off' | 'no_mandate' | 'unverified' | '' —
    // la pagina, a carta spenta, mostra solo il bonifico senza parlare di carta.
    // onBehalfOf: su un contratto del Palazzo con mandato, la carta incassa
    // BOOM per conto del locatore — la pagina lo dice prima di pagare.
    card: { available: cardAvailable, reason: canPay ? policy.reason || '' : '', fee, feeMode: cardAvailable ? policy.fee : 'none',
      onBehalfOf: cardAvailable && policy.imported ? clip(c.landlordName, 120) : '' },
    paidDate: state === 'paid' ? ymd(pay.paidDate) : '',
    // La ricevuta di una rata pagata (Stripe o archiviata), solo https.
    receiptUrl: state === 'paid' ? httpsUrl(pay.receiptUrl) : '',
    paidByCard: state === 'paid' && String(pay.paidVia || '') === 'stripe',
    reportedAt: state === 'reported' ? isoOf(pay.tenantReportedAt) : '',
    reportedDate: state === 'reported' ? ymd(pay.tenantReportDate) : '',
    hasProof: state === 'reported' && (!!pay.proofUrl || reports.some(r => !!r.proofUrl)),
    // Le segnalazioni (date e ricevuta sì, note no: le ha scritte chi
    // segnalava, la pagina la apre anche il co-intestatario).
    reports: reports.map(r => ({ date: ymd(r.date), hasProof: !!r.proofUrl })),
    canReportMore: canWithdraw && state === 'reported' && reports.length < MAX_REPORTS,
    canWithdraw,
    cardFee: fee,
    // Canone + oneri fissi pagati insieme (la rata è il totale): si dice
    // di cosa è fatto il numero, solo se le due voci tornano col totale.
    parts: oneriPart > 0 && rentPart > 0 && amount != null && Math.abs(rentPart + oneriPart - amount) < 0.01 ? { rent: rentPart, oneri: oneriPart } : null,
    bonifico: { causale: payCausale(pay), iban, beneficiary: iban ? clip(c.landlordName, 120) : '', bic: iban ? bicOk(c.landlordBic, iban) : '' },
  };
  return view;
}

async function readRata(id) {
  const version = await fsGetVersioned('payments/' + id);
  if (!version) return null;
  const p = version.data;
  let contractError = false;
  const contract = p.contractId && ID_RE.test(String(p.contractId))
    ? await fsGet('contracts/' + p.contractId).catch(() => { contractError = true; return null; }) : null;
  const pid = p.propertyId || (contract && contract.propertyId);
  const property = pid && ID_RE.test(String(pid)) ? await fsGet('properties/' + pid).catch(() => null) : null;
  return { version, p, contract, property, contractError };
}

// Un bonifico segnalato mentre una Checkout con carta è ancora aperta (un
// co-intestatario esita sulla carta, l'altro fa il bonifico): la sessione si
// chiude, così la carta non incassa una seconda volta. Se la carta ha GIÀ
// incassato, la segnalazione non si scrive (si dice di non pagare ancora).
// Senza Stripe configurato o con Stripe giù non si blocca nulla: il webhook
// alza comunque l'allarme di doppio incasso.
export async function closeOpenCheckout(p) {
  if (!p || !p.checkoutSessionId || !process.env.STRIPE_SECRET_KEY) return 'none';
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(String(p.checkoutSessionId));
    if (s.status === 'complete' || s.payment_status === 'paid') return 'complete';
    if (s.status === 'open') { await stripe.checkout.sessions.expire(s.id); return 'expired'; }
    return 'none';
  } catch (e) {
    console.warn('[rata] checkout aperto non verificabile:', e.message);
    return 'unknown';
  }
}

async function ping(id, r, view, extra) {
  const who = clip((r.contract && r.contract.tenantName) || '', 80) || 'l\'inquilino';
  const where = [view.where.building, view.where.interno ? 'int. ' + view.where.interno : ''].filter(Boolean).join(' · ');
  const nth = extra.count > 1 ? ' — segnalazione n. ' + extra.count + ' sulla stessa rata' : '';
  const createdAt = new Date().toISOString();
  await fsCreate('agentNotifications', {
    type: 'payment.reported', status: 'pending', priority: 'high',
    summary: '💶 ' + (where || 'Rata') + ' — ' + (extra.count > 1 ? 'un co-intestatario o ' + who : who) + ' dice di aver pagato con bonifico ' +
      (view.amount != null ? '€' + view.amount : '') + (view.month ? ' (' + view.month + ')' : '') +
      (extra.proof ? ' · ricevuta allegata' : ' · senza ricevuta') + nth + '. Il bonifico va al conto del locatore: verifica con lui l\'accredito, poi premi Registra incasso.',
    ref: { collection: 'payments', id }, ownerId: (r.property && r.property.ownerId) || null,
    payload: { amount: view.amount, month: view.month, proof: !!extra.proof, date: extra.date || '', via: 'rata-link', count: extra.count || 1 },
    // createdAt ISO come gli altri scrittori di agentNotifications: la
    // finestra recente di notify-pending ordina per questo campo.
    actor: 'rata', attempts: 0, dedupKey: 'payrep_' + id + '_' + (extra.count || 1), createdAt
  }, 'payrep_' + id + '_' + Date.now() + '_' + (extra.count || 1));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'private, no-store');
  const b = await readJson(req).catch(() => null);
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });
  const op = String(b.op || '');

  if (op === 'links') {
    const auth = await requireRole(req, res, ['admin']);
    if (!auth) return;
    const ids = [...new Set((Array.isArray(b.paymentIds) ? b.paymentIds : []).map(x => clip(x, 200)).filter(x => ID_RE.test(x)))].slice(0, 120);
    const map = ids.length ? await fsGetMany(ids.map(id => 'payments/' + id)) : new Map();
    const links = {}, skipped = {};
    for (const id of ids) {
      const p = map.get('payments/' + id);
      if (!p) { skipped[id] = 'not_found'; continue; }
      const why = RENT.paymentBlockReason(p, 'rent');
      if (why) { skipped[id] = why; continue; }
      links[id] = rataLink(id);
    }
    return res.status(200).json({ ok: true, links, skipped });
  }

  if (!['lookup', 'report', 'withdraw'].includes(op)) return res.status(400).json({ ok: false, error: 'unknown_op' });
  const id = clip(b.id, 200);
  if (!ID_RE.test(id) || !verifyPayToken('pay', id, b.t)) return res.status(404).json({ ok: false, error: 'invalid_link' });
  if (op !== 'lookup' && b.company) return res.status(200).json({ ok: true, honeypot: true });   // silenzio
  if (op !== 'lookup' && !rateOk(clientIp(req))) return res.status(429).json({ ok: false, error: 'rate_limited' });

  let r;
  try { r = await readRata(id); }
  catch (e) { console.error('[rata] lettura:', e.message); return res.status(503).json({ ok: false, error: 'unavailable' }); }
  if (!r) return res.status(404).json({ ok: false, error: 'invalid_link' });
  const feeStats = op === 'lookup' ? await fsGet('settings/rentFeeStats').catch(() => null) : null;
  const view = rataView(r.p, { property: r.property, contract: r.contract, feeStats, contractError: r.contractError });

  if (op === 'lookup') {
    // La carta passa dal link di pagamento che esiste già; `from=rata` fa
    // tornare l'inquilino QUI dopo Stripe (la pagina aggiunge la lingua).
    return res.status(200).json({ ok: true, rata: view, payUrl: view.card.available ? payLink('pay', id) + '&from=rata' : '' });
  }

  if (op === 'withdraw') {
    if (!view.canWithdraw) return res.status(409).json({ ok: false, error: 'state_changed', state: view.state });
    // Annullare pulisce TUTTA la segnalazione (data, nota, ricevuta, elenco):
    // una nuova segnalazione senza ricevuta non deve risultare "con ricevuta"
    // per quella vecchia. Ciò che c'era resta, a parte, come storia.
    const was = reportsOf(r.p);
    try {
      await fsCommit([{ docPath: 'payments/' + id, fields: {
        tenantReported: false, tenantReportedAt: null, tenantReportWithdrawnAt: new Date(),
        tenantReportDate: null, tenantNotes: null, proofUrl: null, proofName: null, tenantReports: null,
        tenantReportWithdrawn: { at: new Date().toISOString(), reports: was.slice(0, MAX_REPORTS) }
      }, precondition: { updateTime: r.version.updateTime } }]);
    } catch (e) { return res.status(e.conflict ? 409 : 503).json({ ok: false, error: e.conflict ? 'state_changed' : 'unavailable' }); }
    return res.status(200).json({ ok: true, state: RENT.paymentState({ ...r.p, tenantReported: false }) });
  }

  // op === 'report'
  const date = ymd(b.date);
  if (b.date && (!date || date > latestReportDay())) return res.status(400).json({ ok: false, error: 'bad_date' });
  const reportDate = date || romeDay(new Date());
  const note = clip(b.note, 500);
  let buf = null, type = '', ext = '';
  if (b.proof && b.proof.base64) {
    type = String(b.proof.type || '').toLowerCase(); ext = PROOF_TYPES[type];
    buf = Buffer.from(String(b.proof.base64).replace(/^data:[^,]*,/, ''), 'base64');
    if (!ext || !buf.length || buf.length > MAX_PROOF) return res.status(400).json({ ok: false, error: 'bad_proof' });
  }
  const proofHash = buf ? crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) : '';
  const prior = view.state === 'reported' ? reportsOf(r.p) : [];

  if (view.state === 'reported') {
    // Una seconda segnalazione: identica (doppio tocco, rete lenta) non
    // raddoppia niente; con contenuto NUOVO si accoda — l'altra metà del
    // co-intestatario o la ricevuta mandata dopo non spariscono.
    const repeat = prior.some(x => ymd(x.date) === reportDate && clip(x.note, 500) === note && String(x.proofHash || '') === proofHash);
    const nothingNew = !buf && !note && (!b.date || prior.some(x => ymd(x.date) === reportDate));
    if (repeat || nothingNew) {
      return res.status(200).json({ ok: true, state: 'reported', already: true, proof: view.hasProof, count: prior.length });
    }
    if (!view.canWithdraw) return res.status(409).json({ ok: false, error: 'state_changed', state: view.state });
    if (prior.length >= MAX_REPORTS) return res.status(409).json({ ok: false, error: 'too_many_reports', state: view.state });
  } else {
    if (!view.canPay) return res.status(409).json({ ok: false, error: 'state_changed', state: view.state });
    // Una Checkout con carta ancora aperta su questa rata si chiude; se ha
    // già incassato, niente segnalazione (sarebbe un doppio pagamento).
    if ((await closeOpenCheckout(r.p)) === 'complete') {
      return res.status(409).json({ ok: false, error: 'card_completed', state: 'processing' });
    }
  }

  let proofUrl = '', proofName = '', proofFailed = false;
  if (buf) {
    try {
      proofUrl = await storageUpload('payment-proofs/link-' + id + '/' + Date.now() + '.' + ext, buf, type) || '';
      proofName = clip(b.proof.name, 120).replace(/[^\w .()-]/g, '_') || 'ricevuta.' + ext;
    } catch (e) { proofFailed = true; console.warn('[rata] ricevuta non caricata:', e.status || e.message); }
    if (!proofUrl) proofFailed = true;
  }

  const entry = { at: new Date().toISOString(), date: reportDate, note, proofUrl, proofName, proofHash: proofUrl ? proofHash : '', via: 'link' };
  const reports = [...prior, entry].slice(-MAX_REPORTS);
  let fields;
  if (prior.length) {
    // In testa resta la PRIMA segnalazione (data proposta come data
    // dell'accredito); la ricevuta in testa si riempie se mancava.
    fields = { tenantReports: reports };
    if (proofUrl && !r.p.proofUrl) { fields.proofUrl = proofUrl; fields.proofName = proofName; }
  } else {
    fields = { tenantReported: true, tenantReportedAt: new Date(), tenantReportDate: reportDate,
      tenantNotes: note, reportedVia: 'link', tenantReports: reports };
    if (proofUrl) { fields.proofUrl = proofUrl; fields.proofName = proofName; }
  }
  try { await fsCommit([{ docPath: 'payments/' + id, fields, precondition: { updateTime: r.version.updateTime } }]); }
  catch (e) { return res.status(e.conflict ? 409 : 503).json({ ok: false, error: e.conflict ? 'state_changed' : 'unavailable' }); }
  try { await ping(id, r, view, { proof: !!proofUrl, date: reportDate, count: reports.length }); }
  catch (e) { console.warn('[rata] ping:', e.message); }
  return res.status(200).json({ ok: true, state: 'reported', proof: !!proofUrl || (prior.length > 0 && view.hasProof), proofFailed, count: reports.length });
}
