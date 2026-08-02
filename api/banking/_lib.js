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
  // I compensi di BOOM vengono PRIMA di `canoni`: "provvigione intermediazione
  // locazione" contiene "locazion" e finiva tra i canoni, cioè tra i soldi di
  // qualcun altro. Senza una categoria propria un bonifico "Property finding
  // service" da 427 cadeva in `altri-incassi` e nessuno sapeva che andava
  // fatturato.
  { cat: 'compensi',    re: /provvigion|intermediazion|property\s*finding|protection\s*fee|compenso|onorari|competenze\s*agenzia|commissione\s*agenzia/i, side: 'in' },
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

/* ─── Flusso: cosa è DAVVERO un incasso ───────────────────────────────────
   La categoria dice di che natura è un movimento; il FLUSSO dice se è denaro
   di BOOM. Sono due domande diverse e la seconda è quella che conta, perché
   la maggior parte di ciò che entra su questo conto non è ricavo:

   · STORNO — l'estratto di giugno contiene tre bonifici falliti e
     riaccreditati. Dichiara 26.140 di entrate contro 22.538 reali: senza
     riconoscere le righe "STORNO SCRITTURA OPERAZIONE DEL …" e neutralizzare
     la COPPIA (lo storno e il movimento originale), ogni totale è gonfiato.
   · PASSANTE — i depositi cauzionali entrano e ripartono verso il
     proprietario entro pochi giorni. Nel trimestre maggio-luglio 2026 sono
     la voce dominante: su ~46.500 in entrata le fee vere sono TRE. Non sono
     ricavi e non vanno fatturati.
   · FEE — il compenso di BOOM. Questo sì va fatturato, ed è l'unica cosa che
     deve accendere un allarme quando la fattura non c'è.

   Funzione PURA su una lista di movimenti: nessuna rete, testabile. Non
   modifica gli input. */
const RE_STORNO = /storno\s+(scrittura|operazione|bonifico)|riaccredito|stornato/i;
const RE_INOLTRO = /inoltro\s+(deposito|caparra)|restituzione\s+(deposito|caparra)|giroconto\s+deposito|rimborso\s+cauzion/i;
const RE_DEPOSITO = /caparra|cauzion|deposito/i;
// Un payout Stripe non è una fee singola: è il netto di molti pagamenti, già
// riconciliati per altra via. Trattarlo come compenso da fatturare
// produrrebbe un allarme per ogni accredito.
const RE_STRIPE = /stripe/i;

// "…OPERAZIONE DEL 03/06/2026" → '2026-06-03'. Solo date complete: un
// "DEL 03/06" senza anno resterebbe ambiguo a cavallo di dicembre.
function dateInText(s) {
  const m = String(s || '').match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
  if (!m) return null;
  const gg = Number(m[1]), mm = Number(m[2]);
  if (gg < 1 || gg > 31 || mm < 1 || mm > 12) return null;
  return `${m[3]}-${String(mm).padStart(2, '0')}-${String(gg).padStart(2, '0')}`;
}

export function classifyFlow(txs, { windowDays = 45 } = {}) {
  const out = (txs || []).map((t) => ({ ...t, flow: null, pairId: null }));
  const day = 86400000;
  const at = (t) => (t.bookingDate ? Date.parse(t.bookingDate) : NaN);
  const hay = (t) => `${t.description || ''} ${t.counterparty || ''}`;
  const used = new Set();

  /* 1. Storni — la coppia si annulla.
     La banca SCRIVE la data dell'originale nella causale ("STORNO SCRITTURA
     OPERAZIONE DEL 03/06/2026"): quando c'è, si appaia su quella. Con tre
     bonifici falliti dello stesso importo a giorni consecutivi — il caso
     reale dell'estratto di giugno — la vicinanza temporale sbaglia coppia
     nella metà dei casi. I totali tornerebbero comunque, ma un operatore che
     apre la coppia troverebbe una controparte che non c'entra, e a quel
     punto non si fida più della classificazione. */
  out.forEach((t, i) => {
    if (used.has(i) || !RE_STORNO.test(hay(t))) return;
    const dichiarata = dateInText(hay(t));
    let best = -1, bestGap = Infinity;
    out.forEach((o, j) => {
      if (j === i || used.has(j)) return;
      if (Math.abs(o.amount + t.amount) > 0.01) return;      // segno opposto, stesso importo
      if (RE_STORNO.test(hay(o))) return;                     // l'originale non è uno storno
      if (dichiarata) {
        // Data esatta: o corrisponde, o non è quella operazione.
        if (o.bookingDate !== dichiarata) return;
        best = j; bestGap = -1;
        return;
      }
      const gap = Math.abs(at(o) - at(t));
      if (!isFinite(gap) || gap > 20 * day) return;
      if (gap < bestGap) { bestGap = gap; best = j; }
    });
    if (best >= 0) {
      used.add(i); used.add(best);
      out[i].flow = 'storno'; out[best].flow = 'storno';
      out[i].pairId = String(best); out[best].pairId = String(i);
    } else {
      out[i].flow = 'storno';   // storno senza originale nella finestra
    }
  });

  // 2. Depositi passanti — un'entrata "deposito" che riesce verso il
  // proprietario. L'uscita può essere di importo diverso (trattenute), quindi
  // si accetta uno scarto, ma MAI superiore all'entrata: un'uscita più grande
  // è un altro movimento.
  out.forEach((t, i) => {
    if (used.has(i) || t.flow || t.amount <= 0) return;
    if (!RE_DEPOSITO.test(hay(t))) return;
    let best = -1, bestGap = Infinity;
    out.forEach((o, j) => {
      if (j === i || used.has(j) || o.flow || o.amount >= 0) return;
      if (!RE_INOLTRO.test(hay(o))) return;
      const abs = Math.abs(o.amount);
      if (abs > t.amount + 0.01 || abs < t.amount * 0.5) return;
      const gap = at(o) - at(t);
      if (!isFinite(gap) || gap < -day || gap > windowDays * day) return;
      if (gap < bestGap) { bestGap = gap; best = j; }
    });
    if (best >= 0) {
      used.add(i); used.add(best);
      out[i].flow = 'passante'; out[best].flow = 'passante';
      out[i].pairId = String(best); out[best].pairId = String(i);
    }
  });

  // 3. Le fee: quello che resta e che è un compenso.
  out.forEach((t) => {
    if (t.flow) return;
    if (t.amount > 0 && t.category === 'compensi' && !RE_STRIPE.test(hay(t))) t.flow = 'fee';
  });
  return out;
}

/* L'allarme del §6, quello che da solo avrebbe evitato l'arretrato di
   quattro mesi: incassi classificati FEE che non hanno una fattura.
   Prudente per scelta — un movimento già collegato a una fattura, o con un
   importo che corrisponde a una fattura emessa in una finestra di 60 giorni,
   NON viene segnalato. Meglio un allarme mancato che un allarme falso: un
   elenco che grida al lupo viene smesso di guardare, e allora non serve più
   a niente. */
export function feeWithoutInvoice(txs, invoices, { windowDays = 60 } = {}) {
  const day = 86400000;
  const emesse = (invoices || []).filter((i) => i.dataFattura && i.lordo > 0);
  return (txs || []).filter((t) => {
    if (t.flow !== 'fee' || t.invoiceId) return false;
    const at = Date.parse(t.bookingDate || '');
    return !emesse.some((i) => {
      if (Math.abs(i.lordo - t.amount) > 0.01) return false;
      const d = Date.parse(i.dataFattura);
      return !isFinite(at) || Math.abs(d - at) <= windowDays * day;
    });
  });
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
    return exact
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
  // Sentinella che non può comparire in una causale. Va scritta come
  // ESCAPE, non come byte NUL letterale: un NUL nel sorgente rende il file
  // "binario" per grep/ripgrep, e questo file smette di comparire nelle
  // ricerche di chi lo deve modificare. (Stringa vuota no: `includes('')`
  // è sempre vero e ogni rata risulterebbe agganciata al mese.)
  } catch { return '\u0000'; }
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
  // Il flusso si decide sul BATCH: storni e depositi passanti sono coppie, e
  // una riga da sola non dice mai se è un incasso vero.
  const flowed = classifyFlow(txs);
  const docIds = flowed.map(txDocId);
  // `classifyFlow` appaia per INDICE (è pura, non conosce Firestore). Su un
  // documento un indice non vuole dire niente al run successivo: qui diventa
  // l'id dell'altro movimento della coppia.
  const withIds = flowed.map((tx, i) => ({
    tx: { ...tx, pairId: tx.pairId != null ? docIds[Number(tx.pairId)] || null : null },
    docId: docIds[i],
  }));
  const seen = withIds.length ? await batchExists('bankTransactions', withIds.map(w => w.docId)) : new Set();
  const fresh = withIds.filter(w => !seen.has(w.docId));

  const [payments, users] = await Promise.all([
    fsList('payments', { limit: 600 }),
    fsList('users', { limit: 1000 }).catch(() => []),
  ]);
  const pending = payments.filter(p => !['paid', 'cancelled'].includes(p.status));
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
