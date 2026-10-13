// api/banking/_lib.js
// La Banca — open-banking plumbing for the Contabile.
//
// Provider: GoCardless Bank Account Data (ex Nordigen) — PSD2 account
// information API, free tier, covers the Italian banks (Intesa, Unicredit,
// BPER, Fineco, N26, Revolut, …). BOOM never sees bank credentials: the
// operator authorizes once from their own banking app, we hold only an
// access token per account (consent renews every ~90 days from /banca).
//
// Env (from bankaccountdata.gocardless.com → User secrets):
//   GOCARDLESS_SECRET_ID
//   GOCARDLESS_SECRET_KEY
//
// Firestore:
//   bankAccounts/<accountId>       linked account (iban, institution, status)
//   bankTransactions/<hash>        one doc per movement, deduped, categorized,
//                                  reconciled against `payments` when safe
//   bankRequisitions/<id>          consent flows in progress (audit)

import crypto from 'node:crypto';
import { FS_BASE, getAdminToken, fsGet, fsPatch, fsList, logActivity } from '../homie/_lib.js';
import { findByRef } from '../payments/_ref.js';

const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

// ─── GoCardless auth (24h token, cached in warm lambda) ───────────────────
let _gcTok = null, _gcAt = 0;
const GC_TTL = 23 * 3600 * 1000;

export async function gcToken() {
  const now = Date.now();
  if (_gcTok && (now - _gcAt) < GC_TTL) return _gcTok;
  const id = process.env.GOCARDLESS_SECRET_ID, key = process.env.GOCARDLESS_SECRET_KEY;
  if (!id || !key) throw new Error('GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY non configurate');
  const r = await fetch(`${GC_BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_id: id, secret_key: key }),
  });
  const data = await r.json();
  if (!r.ok || !data.access) throw new Error('GoCardless token failed: ' + JSON.stringify(data).slice(0, 200));
  _gcTok = data.access; _gcAt = now;
  return _gcTok;
}

export async function gc(path, { method = 'GET', body } = {}) {
  const token = await gcToken();
  const r = await fetch(`${GC_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data.detail || data.summary || JSON.stringify(data).slice(0, 200);
    const err = new Error(`GoCardless ${r.status}: ${msg}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

export const gcConfigured = () => !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);

// ─── Transaction normalization ─────────────────────────────────────────────
// GoCardless booked transaction → our compact bankTransactions doc.
export function normalizeTx(accountId, t) {
  const amount = Number(t.transactionAmount?.amount ?? 0);
  const description = String(
    t.remittanceInformationUnstructured
    || (Array.isArray(t.remittanceInformationUnstructuredArray) ? t.remittanceInformationUnstructuredArray.join(' ') : '')
    || t.additionalInformation || ''
  ).slice(0, 400);
  const counterparty = String(t.debtorName || t.creditorName || '').slice(0, 120);
  return {
    accountId,
    txId: t.transactionId || t.internalTransactionId || null,
    bookingDate: t.bookingDate || t.valueDate || null,
    valueDate: t.valueDate || t.bookingDate || null,
    amount,
    currency: t.transactionAmount?.currency || 'EUR',
    side: amount >= 0 ? 'in' : 'out',
    description,
    counterparty,
    category: categorize({ amount, description, counterparty }),
    source: 'gocardless',
  };
}

// Stable doc id: provider txId when present, else content hash — makes every
// sync/import re-run a no-op on already-seen movements.
export function txDocId(tx) {
  const seed = tx.txId || `${tx.accountId}|${tx.bookingDate}|${tx.amount}|${tx.description}`;
  return 'tx_' + crypto.createHash('sha1').update(seed).digest('hex').slice(0, 24);
}

// ─── Categorization (prima nota) ───────────────────────────────────────────
// Deterministic keyword rules — the operator can re-categorize from /banca
// (a manual `categoryLocked` beats any future re-run).
const CATEGORY_RULES = [
  { cat: 'canoni',      re: /affitto|canone|locazion|rent\b|pigione/i, side: 'in' },
  { cat: 'caparre',     re: /caparra|deposito cauzion|deposit/i },
  { cat: 'stripe',      re: /stripe/i, side: 'in' },
  { cat: 'tasse',       re: /f24|agenzia.{0,8}entrate|imposta|tributo|inps|inail|iva\b/i },
  { cat: 'utenze',      re: /enel|acea|eni\b|hera|iren|a2a|sorgenia|edison|fastweb|tim\b|vodafone|wind|illumia|luce|gas\b/i },
  { cat: 'condominio',  re: /condomini/i },
  { cat: 'commissioni', re: /commission|competenze|canone mensile|imposta di bollo|spese tenuta|fee\b/i },
  { cat: 'stipendi',    re: /stipendi|salary|emolument/i },
  { cat: 'manutenzione', re: /manutenzion|idraulic|elettricist|riparazion|imbianch/i },
];

export function categorize({ amount, description, counterparty }) {
  const hay = `${description} ${counterparty}`;
  for (const r of CATEGORY_RULES) {
    if (r.side && r.side !== (amount >= 0 ? 'in' : 'out')) continue;
    if (r.re.test(hay)) return r.cat;
  }
  return amount >= 0 ? 'altri-incassi' : 'altre-uscite';
}

// ─── Reconciliation: bonifico in entrata ⇄ payment del portale ─────────────
// Conservative auto-match. A credit marks a pending payment as paid ONLY when
// ALL of:
//   1. exact amount (±1 cent),
//   2. bookingDate within [dueDate-15gg, dueDate+45gg],
//   3. it is the ONLY candidate at that amount in that window,
//   4. the movement text mentions the tenant (a name token ≥4 chars) OR the
//      payment month, OR that amount is unique among ALL open payments.
// Anything weaker becomes a suggestion (tx.matchSuggestions) surfaced in
// /banca and in the Contabile's report — never a silent guess.
// Una rata che si paga sul conto del LOCATORE, non su quello di BOOM: le
// rate di un palazzo preso in carico (source 'palazzo-import' — /rata indica
// il landlordIban del contratto). Per costruzione non arrivano mai qui: un
// accredito di pari importo sul conto BOOM è un'altra cosa (una provvigione,
// un rimborso). Al massimo un SUGGERIMENTO da confermare, mai un «pagato»
// automatico. Il solo landlordIban NON basta: la Scheda lo raccoglie anche
// sui contratti digitali, i cui canoni arrivano sul conto BOOM (settings/
// payout, /casa) — escluderli spegnerebbe la riconciliazione che funziona.
export function toLandlordAccount(p) {
  return !!(p && (p.source === 'palazzo-import' || p._toLandlord === true));
}

/** Marca le rate dei contratti presi in carico dal Palazzo (anche quelle
 *  nate dopo, senza `source` sulla rata). Muta e restituisce l'array. */
export function markLandlordDirect(payments, contracts) {
  const direct = new Set((contracts || [])
    .filter(c => c && c.id && c.source === 'palazzo-import')
    .map(c => c.id));
  for (const p of payments || []) if (p && direct.has(p.contractId)) p._toLandlord = true;
  return payments;
}

export function reconcile(tx, pendingPayments, tenantNameById) {
  if (tx.side !== 'in' || !tx.bookingDate) return { match: null, suggestions: [] };

  // ── Via esatta: il codice nella causale ─────────────────────────────────
  // /casa suggerisce al cliente una causale che porta il codice della rata
  // (api/payments/_ref.js). Se c'è, il movimento DICE quale rata sta pagando:
  // niente euristiche, niente rinvii a un umano.
  // L'importo si verifica comunque: un codice giusto con la cifra sbagliata
  // (acconto, errore di digitazione) diventa un suggerimento, non un match —
  // segnare pagata una rata pagata a metà sarebbe peggio di non segnarla.
  const byRef = findByRef(`${tx.description} ${tx.counterparty}`, pendingPayments);
  if (byRef) {
    const exact = Math.abs((Number(byRef.amount) || 0) - tx.amount) <= 0.01;
    return exact && !toLandlordAccount(byRef)
      ? { match: { paymentId: byRef.id, confidence: 'reference' }, suggestions: [] }
      : { match: null, suggestions: [byRef.id] };
  }

  const booked = Date.parse(tx.bookingDate);
  const candidates = pendingPayments.filter(p => {
    if (Math.abs((Number(p.amount) || 0) - tx.amount) > 0.01) return false;
    const due = p.dueDate ? Date.parse(p.dueDate) : null;
    if (!due) return false;
    return booked >= due - 15 * 86400000 && booked <= due + 45 * 86400000;
  });
  if (!candidates.length) return { match: null, suggestions: [] };
  if (candidates.length > 1) return { match: null, suggestions: candidates.map(p => p.id).slice(0, 5) };

  const p = candidates[0];
  if (toLandlordAccount(p)) return { match: null, suggestions: [p.id] };
  const hay = `${tx.description} ${tx.counterparty}`.toLowerCase();
  const tenantName = (tenantNameById[p.tenantId] || p.tenantName || '').toLowerCase();
  const nameHit = tenantName.split(/\s+/).some(tok => tok.length >= 4 && hay.includes(tok));
  const monthHit = p.month && (hay.includes(p.month) || hay.includes(monthNameIt(p.month)));
  const amountUnique = pendingPayments.filter(q => Math.abs((Number(q.amount) || 0) - tx.amount) <= 0.01).length === 1;

  if (nameHit || monthHit || amountUnique) {
    return { match: { paymentId: p.id, confidence: nameHit ? 'name' : monthHit ? 'month' : 'unique-amount' }, suggestions: [] };
  }
  return { match: null, suggestions: [p.id] };
}

function monthNameIt(ym) {
  try {
    return new Date(ym + '-01T00:00:00Z').toLocaleDateString('it-IT', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  } catch { return ' '; }
}

// Apply a confirmed match: payment → paid, tx → linked. Reversible from the
// portal (payment doc keeps the previous status trail in activityLog).
export async function applyMatch(txDoc, txData, paymentId, confidence, actor = 'banca') {
  await fsPatch(`payments/${paymentId}`, {
    status: 'paid',
    paidDate: txData.bookingDate,
    paidVia: 'bank',
    bankTxId: txDoc,
  });
  await fsPatch(`bankTransactions/${txDoc}`, {
    matchedPaymentId: paymentId,
    matchConfidence: confidence,
    matchedAt: new Date(),
    matchedBy: actor,
  });
  await logActivity('Canone riconciliato da bonifico', 'banking',
    { paymentId, tx: txDoc, amount: txData.amount, confidence }, actor);
}

// ─── CSV (formato commercialista) ──────────────────────────────────────────
// Italian conventions: semicolon separator, DD/MM/YYYY dates, decimal comma.
// Excel (locale it-IT) opens it correctly with no import wizard.
export function toItalianCsv(rows, columns) {
  const sep = ';';
  const fmt = v => {
    if (v == null) return '';
    if (typeof v === 'number') return v.toFixed(2).replace('.', ',');
    const s = String(v).replace(/\r?\n/g, ' ');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const dmy = iso => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  };
  const head = columns.map(c => c.label).join(sep);
  const body = rows.map(r => columns.map(c => {
    const v = typeof c.get === 'function' ? c.get(r) : r[c.key];
    return c.date ? dmy(v) : fmt(v);
  }).join(sep)).join('\r\n');
  // BOM so Excel detects UTF-8 (accented causali).
  return '﻿' + head + '\r\n' + body + '\r\n';
}

// Bulk existence check — one batchGet per 200 ids instead of one GET per doc.
// Makes the first-sync backfill (hundreds of movements) fit the 60s budget.
export async function batchExists(collection, ids) {
  const token = await getAdminToken();
  // batchGet wants resource names ("projects/…/documents/coll/id"), i.e.
  // FS_BASE without the API host prefix.
  const resourceRoot = FS_BASE.replace(/^https:\/\/[^/]+\/v1\//, '');
  const found = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const r = await fetch(`${FS_BASE}:batchGet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: chunk.map(id => `${resourceRoot}/${collection}/${id}`) }),
    });
    if (!r.ok) throw new Error(`batchGet failed (${r.status}): ${await r.text()}`);
    const arr = await r.json();
    for (const item of Array.isArray(arr) ? arr : []) {
      if (item.found?.name) found.add(item.found.name.split('/').pop());
    }
  }
  return found;
}

// Fetch every linked account (skips ones the operator disabled).
export async function listLinkedAccounts() {
  const accounts = await fsList('bankAccounts', { limit: 20 }).catch(() => []);
  return accounts.filter(a => a.status !== 'disabled');
}

// ─── CSV dell'home banking → movimenti ─────────────────────────────────────
// Shared by /api/banking/import (manual upload) and /api/banking/scan-inbox
// (statement attachments arriving by email). Column auto-detect covers the
// common Italian exports (Intesa, Unicredit, BPER, Fineco, N26, Revolut).
export function parseBankCsv(text) {
  const rows = csvRows(text);
  if (rows.length < 2) return { txs: [], error: 'nessuna riga dati trovata' };
  // Header may not be on line 1 (some exports prepend account metadata):
  // scan the first 10 rows for the first one that maps to our columns.
  let map = null, headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const m = detectColumns(rows[i]);
    if (m.date != null && (m.amount != null || (m.in != null && m.out != null))) { map = m; headerIdx = i; break; }
  }
  if (!map) return { txs: [], error: 'colonne non riconosciute — servono almeno data e importo (o entrate/uscite)', header: rows[0] };

  const txs = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const dateIso = parseItDate(r[map.date]);
    if (!dateIso) continue;
    let amount;
    if (map.amount != null) amount = parseItNumber(r[map.amount]);
    else {
      const inc = parseItNumber(r[map.in]) || 0;
      const out = parseItNumber(r[map.out]) || 0;
      amount = inc - Math.abs(out);
    }
    if (!amount) continue;
    txs.push({
      bookingDate: dateIso,
      amount,
      description: String(map.desc != null ? r[map.desc] : '').slice(0, 400),
      counterparty: String(map.ctrp != null ? r[map.ctrp] : '').slice(0, 120),
    });
  }
  return { txs, error: null };
}

function csvRows(text) {
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined);
  const sep = [';', ',', '\t'].map(s => ({ s, n: firstLine.split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(field.trim()); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
}

function detectColumns(header) {
  const h = header.map(x => String(x).toLowerCase());
  const find = (...pats) => {
    for (const p of pats) { const i = h.findIndex(x => x.includes(p)); if (i >= 0) return i; }
    return null;
  };
  return {
    date: find('data operazione', 'data contabile', 'started date', 'data', 'date'),
    amount: find('importo', 'amount'),
    in: find('entrate', 'accrediti', 'avere', 'credit'),
    out: find('uscite', 'addebiti', 'dare', 'debit'),
    desc: find('descrizione', 'causale', 'dettagli', 'description', 'note'),
    ctrp: find('controparte', 'beneficiario', 'ordinante', 'payee', 'counterparty'),
  };
}

// '31/12/2025', '31-12-2025', '2025-12-31' → '2025-12-31'
export function parseItDate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// '1.234,56' / '1234.56' / '-1.234,56 €' → number
export function parseItNumber(s) {
  if (s == null || s === '') return 0;
  let t = String(s).replace(/[€\s]/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return isNaN(n) ? 0 : n;
}

// ─── Pipeline unica di ingestione ──────────────────────────────────────────
// rawTxs: [{ bookingDate, amount, description, counterparty }]. Applies
// categorization, stable-id dedupe, conservative reconciliation and the
// parallel writes. Returns { imported, skipped, matched, suggested }.
export async function ingestBankTransactions(rawTxs, { accountId, source, actor = 'banca' }) {
  const txs = rawTxs.map(r => ({
    accountId,
    txId: null,
    bookingDate: r.bookingDate,
    valueDate: r.bookingDate,
    amount: r.amount,
    currency: 'EUR',
    side: r.amount >= 0 ? 'in' : 'out',
    description: r.description || '',
    counterparty: r.counterparty || '',
    category: categorize({ amount: r.amount, description: r.description || '', counterparty: r.counterparty || '' }),
    source,
  }));
  const withIds = txs.map(tx => ({ tx, docId: txDocId(tx) }));
  const seen = withIds.length ? await batchExists('bankTransactions', withIds.map(w => w.docId)) : new Set();
  const fresh = withIds.filter(w => !seen.has(w.docId));

  const [payments, users, contracts] = await Promise.all([
    fsList('payments', { limit: 600 }),
    fsList('users', { limit: 1000 }).catch(() => []),
    fsList('contracts', { limit: 1000 }).catch(() => []),
  ]);
  const pending = markLandlordDirect(payments.filter(p => !['paid', 'cancelled'].includes(p.status)), contracts);
  const tenantNameById = {}; users.forEach(u => { tenantNameById[u.id] = u.name || ''; });

  let matched = 0, suggested = 0;
  const toWrite = [];
  for (const { tx, docId } of fresh) {
    const { match, suggestions } = reconcile(tx, pending, tenantNameById);
    if (match) { const i = pending.findIndex(p => p.id === match.paymentId); if (i >= 0) pending.splice(i, 1); matched++; }
    else if (suggestions.length) suggested++;
    toWrite.push({ tx, docId, match, suggestions });
  }
  for (let i = 0; i < toWrite.length; i += 8) {
    await Promise.all(toWrite.slice(i, i + 8).map(async ({ tx, docId, match, suggestions }) => {
      await fsPatch('bankTransactions/' + docId, { ...tx, matchSuggestions: suggestions.length ? suggestions : null, createdAt: new Date() });
      if (match) await applyMatch(docId, tx, match.paymentId, match.confidence, actor);
    }));
  }
  return { imported: fresh.length, skipped: withIds.length - fresh.length, matched, suggested };
}

export { fsGet, fsPatch, fsList, logActivity };
