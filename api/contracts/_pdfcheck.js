// api/contracts/_pdfcheck.js — il PDF caricato contro i DATI del contratto.
//
// LA LEZIONE DEL 3/10/2026 (il secondo giro di «📤 Carica versione
// corretta»). Il PDF corretto a mano diventa il documento che le parti
// firmano, ma il sistema non lo legge: canone, date e deposito che
// governano rate, scadenze, registrazione e mandato restano quelli SCRITTI
// sul contratto. Se l'operatore corregge il canone nel PDF e non nei dati,
// il cliente firma 1.250 e le rate partono a 1.200 — e nessuno se ne
// accorge fino al primo addebito. Qui il PDF si LEGGE prima di accettarlo:
// il modello trascrive soltanto ciò che c'è scritto (mai un calcolo, mai
// una correzione), e il confronto lo fa il CODICE sui numeri letti.
//
// Avverte, non blocca: un PDF che non si legge, un modello giù o un
// documento troppo lungo danno `unchecked` col motivo — mai un 'match'
// inventato, mai un caricamento fermato per un guasto nostro. Una
// differenza vera torna all'operatore PRIMA del commit (revise 409
// `pdf_terms_mismatch`): annulla e corregge i dati, o carica comunque e la
// scelta resta scritta sul contratto (`pdfCheck.accepted`).

import FIELDS from '../../js/contract-fields.js';
import { ai } from '../_ai.js';
import { extractJson } from '../agent/_claude.js';

export const PDF_CHECK_MAX_PAGES = 40;

// Le voci che il confronto guarda, con le etichette che la console mostra.
export const PDF_CHECK_FIELDS = [
  { key: 'rent', label: 'canone' },
  { key: 'deposit', label: 'deposito' },
  { key: 'startDate', label: 'decorrenza' },
  { key: 'endDate', label: 'scadenza' },
  { key: 'tenantName', label: 'conduttore' },
  { key: 'landlordName', label: 'locatore' },
  { key: 'floor', label: 'piano' },
  { key: 'unit', label: 'interno' },
];
const LABEL = Object.fromEntries(PDF_CHECK_FIELDS.map(f => [f.key, f.label]));

const PROMPT = [
  'Sei il revisore di un contratto di locazione italiano. Leggi il PDF e TRASCRIVI i dati richiesti esattamente come sono scritti nel documento.',
  'Rispondi SOLO con JSON valido, in questa forma:',
  '{',
  ' "rent": { "amount": <numero in euro del canone pattuito, o null>, "basis": "mensile" | "annuo" | "durata" | null },',
  ' "deposit": <deposito cauzionale in euro, o null>,',
  ' "startDate": "YYYY-MM-DD" o null,',
  ' "endDate": "YYYY-MM-DD" o null,',
  ' "tenantName": "<nome e cognome del conduttore principale, o null>",',
  ' "landlordName": "<nome e cognome (o ragione sociale) del locatore, o null>",',
  ' "floor": "<piano dell\'immobile come scritto, o null>",',
  ' "unit": "<interno dell\'immobile come scritto, o null>"',
  '}',
  'Regole: "basis" dice a cosa si riferisce l\'importo del canone (al mese, all\'anno, o all\'intera durata del contratto).',
  'Non calcolare, non correggere, non dedurre: se un dato non c\'è o non è leggibile, null.',
].join('\n');

// ── normalizzazioni (pure) ───────────────────────────────────────────────
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = FIELDS.parseItNumber(String(v));
  return Number.isFinite(n) ? n : null;
};
const isoDate = (v) => {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};
const nameTokens = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z\s'-]/g, ' ').split(/[\s'-]+/).filter(t => t.length > 1);
const ORD = { terra: '0', terreno: '0', pt: '0', t: '0', rialzato: 'r', primo: '1', secondo: '2', terzo: '3', quarto: '4', quinto: '5', sesto: '6', settimo: '7', ottavo: '8', nono: '9', decimo: '10', seminterrato: 's', attico: 'a' };
export function normFloor(v) {
  const s = String(v ?? '').toLowerCase().replace(/piano/g, ' ').replace(/[°º^]/g, ' ').trim();
  if (!s) return '';
  const d = /-?\d+/.exec(s);
  if (d) return String(Number(d[0]));
  for (const w of s.split(/[\s.,]+/)) if (ORD[w]) return ORD[w];
  return s.replace(/\s+/g, ' ');
}
export function normUnit(v) {
  return String(v ?? '').toUpperCase().replace(/\b(INTERNO|INT|N|NR|NUM)\b\.?/g, ' ').replace(/[^A-Z0-9]/g, '');
}
const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

// I dati del contratto come il PDF li stampa (immobile prima, contratto poi:
// la stessa catena di contract-pdf.js per piano e interno).
export function contractTerms(contract, property) {
  const c = contract || {}, p = property || {};
  return {
    rent: num(c.rent),
    deposit: num(c.deposit),
    startDate: isoDate(c.startDate),
    endDate: isoDate(c.endDate),
    tenantName: String(c.tenantName || '').trim(),
    landlordName: String(c.landlordName || p.ownerName || '').trim(),
    floor: String(p.floor ?? c.floor ?? '').trim(),
    unit: String(p.interno || p.unit || c.unit || '').trim(),
    months: FIELDS.leaseMonths(c) || 0,
  };
}

// Pura: la lettura del PDF contro i dati. Una voce che il PDF non porta (o
// che il contratto non ha) è `unread`, MAI una differenza.
export function compareTerms(read, ours) {
  const r = read || {}, o = ours || {};
  const diff = [], unread = [];
  const push = (key, contractV, pdfV) => diff.push({ key, label: LABEL[key], contract: contractV, pdf: pdfV });

  // canone: l'importo vale per la base dichiarata (mese, anno, intera durata)
  const rentAmt = num(r.rent && typeof r.rent === 'object' ? r.rent.amount : r.rent);
  const basis = r.rent && typeof r.rent === 'object' ? String(r.rent.basis || '').toLowerCase() : '';
  if (rentAmt === null || !o.rent) unread.push('rent');
  else {
    const want = basis === 'annuo' ? [o.rent * 12] : basis === 'durata' ? [o.rent * (o.months || 0)]
      : basis === 'mensile' ? [o.rent] : [o.rent, o.rent * 12, o.rent * (o.months || 0)];
    if (!want.some(w => w > 0 && near(rentAmt, w))) push('rent', o.rent, rentAmt + (basis ? ' (' + basis + ')' : ''));
  }
  const dep = num(r.deposit);
  if (dep === null || o.deposit === null || o.deposit === undefined) unread.push('deposit');
  else if (!near(dep, o.deposit)) push('deposit', o.deposit, dep);

  for (const k of ['startDate', 'endDate']) {
    const d = isoDate(r[k]);
    if (!d || !o[k]) unread.push(k);
    else if (d !== o[k]) push(k, o[k], d);
  }
  for (const k of ['tenantName', 'landlordName']) {
    const a = nameTokens(r[k]), b = nameTokens(o[k]);
    if (!a.length || !b.length) { unread.push(k); continue; }
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (!short.every(t => long.includes(t))) push(k, o[k], String(r[k]));
  }
  const f1 = normFloor(r.floor), f2 = normFloor(o.floor);
  if (!f1 || !f2) unread.push('floor'); else if (f1 !== f2) push('floor', o.floor, String(r.floor));
  const u1 = normUnit(r.unit), u2 = normUnit(o.unit);
  if (!u1 || !u2) unread.push('unit'); else if (u1 !== u2) push('unit', o.unit, String(r.unit));

  const read_ = PDF_CHECK_FIELDS.length - unread.length;
  return { diff, unread, read: read_ };
}

// La lettura vera (I/O): il PDF al modello, il JSON al confronto. Mai
// un'eccezione verso il chiamante — un guasto è `unchecked` col motivo.
export async function checkUploadedPdf({ buf, contract, property, pages = null, timeoutMs = 30000 } = {}) {
  const at = new Date().toISOString();
  if (pages && pages > PDF_CHECK_MAX_PAGES) return { status: 'unchecked', reason: 'too_long', diff: [], unread: [], at };
  let parsed = null, model = null;
  try {
    const r = await ai({
      purpose: 'contract.pdfcheck', maxTokens: 700, timeoutMs, json: true,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(buf).toString('base64') } },
        { type: 'text', text: PROMPT },
      ] }],
    });
    model = r.model || null;
    parsed = extractJson(r.text);
  } catch (e) {
    return { status: 'unchecked', reason: (e && e.code) || 'ai_failed', diff: [], unread: [], at };
  }
  if (!parsed || typeof parsed !== 'object') return { status: 'unchecked', reason: 'unreadable', diff: [], unread: [], at, model };
  const cmp = compareTerms(parsed, contractTerms(contract, property));
  if (!cmp.read) return { status: 'unchecked', reason: 'nothing_read', diff: [], unread: cmp.unread, at, model };
  return { status: cmp.diff.length ? 'mismatch' : 'match', diff: cmp.diff, unread: cmp.unread, read: cmp.read, at, model };
}
