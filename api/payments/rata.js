// api/payments/rata.js — LA TUA RATA, senza login: paghi con carta o dici
// "ho fatto il bonifico" con la foto della ricevuta.
//
// Gli inquilini di un palazzo preso in carico dalla tabella della
// proprietaria non hanno un account BOOM (e non devono averlo per pagare).
// Ogni mese ricevono su WhatsApp UN link, quello della loro rata. Il link
// apre /rata, che parla con questa porta:
//
//   op:'lookup'   { id, t }                  → la rata (etichette e stato,
//                 mai chi abita lì), la commissione della carta DETTA prima,
//                 il conto del contratto per il bonifico se il contratto lo porta
//   op:'report'   { id, t, date?, note?, proof?{base64,type,name}, company }
//                 → "ho pagato con bonifico": la rata diventa SEGNALATA
//                 (tenantReported, come da /casa), mai pagata — l'incasso lo
//                 registra un umano che ha visto i soldi
//   op:'withdraw' { id, t }                  → annulla una segnalazione sbagliata
//   op:'links'    Bearer admin { paymentIds[] } → { links: {id: url}, skipped }
//
// Regole dure (tests/rata/run.mjs):
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
// - La commissione della carta si mostra PRIMA di aprire Stripe, accanto al
//   bonifico che non costa niente: chi paga sceglie sapendo.
// - Il conto per il bonifico è quello scritto nel contratto (landlordIban):
//   mai il conto di BOOM al posto di quello pattuito. Senza IBAN nel
//   contratto la pagina dice "il conto di sempre", non ne inventa uno.

import { fsGet, fsGetVersioned, fsCommit, fsCreate, fsGetMany, readJson } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { verifyPayToken, payToken, payLink } from './_token.js';
import { payCausale } from './_ref.js';
import { rentFee, paymentLabel } from './pay.js';
import RENT from '../../js/rent-engine.js';

const BASE = process.env.PUBLIC_BASE_URL || 'https://www.boomrome.com';
const ID_RE = /^[\w.-]{1,200}$/;
const PROOF_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
// Il corpo di una funzione Vercel si ferma a ~4,5 MB e il base64 pesa un
// terzo in più: 3 MB di file sono il tetto onesto (le foto la pagina le
// riduce prima, un PDF di una ricevuta ci sta largo).
const MAX_PROOF = 3 * 1024 * 1024;

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

// Le parole della pagina, dalla rata. Pura: si testa senza rete.
export function rataView(p, { property, contract, feeStats, today } = {}) {
  const pay = p || {}, state = RENT.paymentState(pay, today), amount = RENT.amount(pay.amount);
  const blocked = RENT.paymentBlockReason(pay, 'rent');
  const pr = property || {}, c = contract || {};
  const interno = clip(pr.interno || c.unit, 12);
  const building = clip(pr.palazzoNome || String(pr.address || c.propertyAddress || '').split(',')[0] || pr.name, 120);
  const iban = String(c.landlordIban || '').replace(/\s+/g, '').toUpperCase();
  const view = {
    label: paymentLabel(pay).replace(/ — \d{4}-\d{2}$/, ''),
    kind: RENT.isRentPayment(pay) ? 'rent' : String(pay.type || '').toLowerCase() === 'deposit-balance' ? 'depbal' : 'other',
    month: /^\d{4}-\d{2}$/.test(String(pay.month || '')) ? pay.month : '',
    coversTo: /^\d{4}-\d{2}$/.test(String(pay.coversTo || '')) ? pay.coversTo : '',
    amount, dueDate: ymd(pay.dueDate), state, blocked,
    where: { building, interno },
    canPay: RENT.canPay(pay, today),
    paidDate: state === 'paid' ? ymd(pay.paidDate) : '',
    reportedAt: state === 'reported' ? isoOf(pay.tenantReportedAt) : '',
    reportedDate: state === 'reported' ? ymd(pay.tenantReportDate) : '',
    hasProof: state === 'reported' && !!pay.proofUrl,
    canWithdraw: pay.tenantReported === true && ['pending', 'due', 'overdue'].includes(String(pay.status || '').toLowerCase()),
    cardFee: 0,
    bonifico: { causale: payCausale(pay), iban: /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) ? iban : '', beneficiary: iban ? clip(c.landlordName, 120) : '' },
  };
  if (view.canPay && amount != null) view.cardFee = rentFee(amount, feeStats || null);
  return view;
}

async function readRata(id) {
  const version = await fsGetVersioned('payments/' + id);
  if (!version) return null;
  const p = version.data;
  const contract = p.contractId && ID_RE.test(String(p.contractId)) ? await fsGet('contracts/' + p.contractId).catch(() => null) : null;
  const pid = p.propertyId || (contract && contract.propertyId);
  const property = pid && ID_RE.test(String(pid)) ? await fsGet('properties/' + pid).catch(() => null) : null;
  return { version, p, contract, property };
}

async function ping(id, r, view, extra) {
  const who = clip((r.contract && r.contract.tenantName) || '', 80) || 'l\'inquilino';
  const where = [view.where.building, view.where.interno ? 'int. ' + view.where.interno : ''].filter(Boolean).join(' · ');
  await fsCreate('agentNotifications', {
    type: 'payment.reported', status: 'pending', priority: 'high',
    summary: '💶 ' + (where || 'Rata') + ' — ' + who + ' dice di aver pagato con bonifico ' +
      (view.amount != null ? '€' + view.amount : '') + (view.month ? ' (' + view.month + ')' : '') +
      (extra.proof ? ' · ricevuta allegata' : ' · senza ricevuta') + '. Verifica l\'incasso e premi Registra incasso.',
    ref: { collection: 'payments', id }, ownerId: (r.property && r.property.ownerId) || null,
    payload: { amount: view.amount, month: view.month, proof: !!extra.proof, date: extra.date || '', via: 'rata-link' },
    actor: 'rata', attempts: 0, createdAt: new Date().toISOString()
  }, 'payrep_' + id + '_' + Date.now());
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
  const view = rataView(r.p, { property: r.property, contract: r.contract, feeStats });

  if (op === 'lookup') {
    return res.status(200).json({ ok: true, rata: view, payUrl: view.canPay ? payLink('pay', id) : '' });
  }

  if (op === 'withdraw') {
    if (!view.canWithdraw) return res.status(409).json({ ok: false, error: 'state_changed', state: view.state });
    try {
      await fsCommit([{ docPath: 'payments/' + id, fields: { tenantReported: false, tenantReportedAt: null, tenantReportWithdrawnAt: new Date() },
        precondition: { updateTime: r.version.updateTime } }]);
    } catch (e) { return res.status(e.conflict ? 409 : 503).json({ ok: false, error: e.conflict ? 'state_changed' : 'unavailable' }); }
    return res.status(200).json({ ok: true, state: RENT.paymentState({ ...r.p, tenantReported: false }) });
  }

  // op === 'report'
  if (view.state === 'reported') return res.status(200).json({ ok: true, state: 'reported', already: true });
  if (!view.canPay) return res.status(409).json({ ok: false, error: 'state_changed', state: view.state });
  const date = ymd(b.date);
  const todayKey = new Date().toISOString().slice(0, 10);
  if (b.date && (!date || date > todayKey)) return res.status(400).json({ ok: false, error: 'bad_date' });

  let proofUrl = '', proofName = '', proofFailed = false;
  if (b.proof && b.proof.base64) {
    const type = String(b.proof.type || '').toLowerCase(), ext = PROOF_TYPES[type];
    const buf = Buffer.from(String(b.proof.base64).replace(/^data:[^,]*,/, ''), 'base64');
    if (!ext || !buf.length || buf.length > MAX_PROOF) return res.status(400).json({ ok: false, error: 'bad_proof' });
    try {
      proofUrl = await storageUpload('payment-proofs/link-' + id + '/' + Date.now() + '.' + ext, buf, type) || '';
      proofName = clip(b.proof.name, 120).replace(/[^\w .()-]/g, '_') || 'ricevuta.' + ext;
    } catch (e) { proofFailed = true; console.warn('[rata] ricevuta non caricata:', e.status || e.message); }
    if (!proofUrl) proofFailed = true;
  }

  const fields = { tenantReported: true, tenantReportedAt: new Date(), tenantReportDate: date || todayKey,
    tenantNotes: clip(b.note, 500), reportedVia: 'link' };
  if (proofUrl) { fields.proofUrl = proofUrl; fields.proofName = proofName; }
  try { await fsCommit([{ docPath: 'payments/' + id, fields, precondition: { updateTime: r.version.updateTime } }]); }
  catch (e) { return res.status(e.conflict ? 409 : 503).json({ ok: false, error: e.conflict ? 'state_changed' : 'unavailable' }); }
  try { await ping(id, r, view, { proof: !!proofUrl, date: fields.tenantReportDate }); }
  catch (e) { console.warn('[rata] ping:', e.message); }
  return res.status(200).json({ ok: true, state: 'reported', proof: !!proofUrl, proofFailed });
}
