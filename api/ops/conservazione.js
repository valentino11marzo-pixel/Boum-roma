// api/ops/conservazione.js — LA CONSERVAZIONE (cron mensile, il 2 alle 05:40)
//
// I contratti firmati, i certificati FES, i fascicoli e le marche temporali
// vivono TUTTI dentro Firebase: un account compromesso o un errore di
// progetto e l'archivio legale sparisce con la piattaforma. Questo cron,
// il 2 del mese, prende ogni contratto FINALIZZATO nel mese chiuso, scarica
// i suoi PDF (contratto firmato, certificato, fascicolo fiscale, .tsr della
// marca temporale, pack registrazione) e li spedisce IN UNO ZIP alla casella
// dell'operatore: Gmail diventa la copia fuori-piattaforma, con zero nuove
// credenziali e zero nuovi servizi da mantenere. INDICE.txt dentro lo ZIP
// dice cosa c'è e per quale contratto.
//
// Idempotente per mese via `heartbeat/conservazione-<YYYY-MM>` (collection
// già admin-only nelle rules DEPLOYATE — niente dipendenza da un deploy
// rules futuro, la lezione propertyLocks al contrario). Sopra i 20MB lo ZIP
// si spezza in più email numerate: Gmail rifiuta gli allegati oltre 25MB.
//
// Auth come i cron PFS. Query: ?dry=1 · ?month=YYYY-MM (recuperi).

import {
  requireCronOrAdmin, fsGet, fsList, fsCreate, logActivity, tgNotify,
  reportEmployeeHealth,
} from '../employees/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { buildZip } from '../_zip.js';
import { CITY_MARKETS, chargeAtOf } from '../_market.js';

const EMPLOYEE = 'conservazione';
const ADMIN_NOTIFY = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const MAX_ZIP = 20 * 1024 * 1024;
const clip = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
const safe = (s) => clip(s, 60).replace(/[^a-zA-Z0-9._-]/g, '_') || 'doc';

// ── I registri degli ordini dei desk che incassano alla firma (v1.8) ─────
// Parigi: il registro dei mandati (décret 72-678 art. 72 — numerato, in
// ordine di data, senza buchi; che un registro tenuto così basti è da
// confermare col legale, spec §16 O5); Berlino: il registro degli ordini.
// Ogni mese la conservazione porta UN CSV per desk con le righe del registro
// NATE o CAMBIATE nel mese (ordine, firma, pagamento, recesso, chiusura) e lo
// stato di oggi: la copia fuori da Firebase. Separatore «;» e BOM per Excel
// in italiano; date ISO; un campo che comincia con = + - @ prende un apice
// (niente formule da un nome scritto dal cliente).
const REG_COLS = ['number', 'orderedAt', 'name', 'email', 'plan', 'startNow', 'expiresOn', 'status', 'signedOn', 'invoice', 'paidAt', 'withdrawnAt', 'closedAt'];
const ROME_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
const ROME_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function romeDayOf(v) {
  if (v == null || v === '') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const t = Date.parse(String(v));
  if (!Number.isFinite(t)) return '';
  const p = {};
  for (const x of ROME_DAY.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
function romeStamp(v) {
  const d = romeDayOf(v);
  if (!d || /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return d;
  return `${d} ${ROME_TIME.format(new Date(Date.parse(String(v))))}`;
}
const csvCell = (v) => {
  let x = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(x)) x = "'" + x;
  return /[;"\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
};
// the signing day once the operator has CONFIRMED it (invoice or no fee): a
// draft of /firmato is not yet a fact of the register
function signedOnOf(l) {
  const sg = l.signing && typeof l.signing === 'object' ? l.signing : {};
  return ['invoicing', 'invoiced', 'no_fee'].includes(sg.status) && sg.signedOn ? String(sg.signedOn) : '';
}
// the order's fee invoice (invoices/cityfee_<id>), when the run read it: a
// fee paid by transfer is marked paid on the INVOICE only (the portal's
// «Segna pagata»), and a webhook whose order stamp failed leaves the order
// unpaid while its invoice is paid — so, like the managed ticket, the
// register reads the invoice (finding F5)
function invoiceOf(l, invoices) {
  const id = l.signing && typeof l.signing === 'object' ? l.signing.invoiceId : null;
  return typeof id === 'string' && invoices && invoices.has(id) ? invoices.get(id) : null;
}
// the day the fee was paid: the order's stamp, else the invoice's (the
// webhook writes paidAt, the portal paidDate)
const paidAtOf = (l, inv) => l.paidAt || (inv && (inv.paidAt || inv.paidDate)) || '';
// the state of an order as the managed ticket reads it (api/city-lead.js
// orderStatus): paid when the order OR its invoice says so; a withdrawal
// statement never hides an invoice still owed; the register adds no_fee to
// the ticket's closed. Without the invoice (none issued, or not read) the
// order's own signing status says whether a fee is owed.
function orderState(l, inv) {
  const sg = l.signing && typeof l.signing === 'object' ? l.signing : {};
  const owed = inv ? inv.status !== 'cancelled' && Number.isFinite(Number(inv.amount)) : sg.status === 'invoiced';
  const statement = !!(l.withdrawal && l.withdrawal.at);
  if (l.paid === true || (inv && inv.status === 'paid')) return 'paid';
  if (l.withdrawnAt || (statement && !owed && !l.closedAt)) return 'withdrawn';
  if (l.closedAt) return l.closeReason === 'no_fee' || sg.status === 'no_fee' ? 'no_fee' : 'closed';
  if (owed) return 'due';
  return 'booked';
}
/**
 * The month's register extracts, pure: one CSV per signing desk with at
 * least one order born or changed in `month` (YYYY-MM, Rome). `invoices`:
 * the fee invoices the run read (a Map by id, or a list of { id, … }).
 * Exported for the test. → [{ name, desk, rows, data }]
 */
export function orderRegisters(leads, month, markets = CITY_MARKETS, invoices = null) {
  const inv = invoices instanceof Map ? invoices
    : new Map((Array.isArray(invoices) ? invoices : []).filter((d) => d && d.id).map((d) => [d.id, d]));
  const out = [];
  for (const [key, desk] of Object.entries(markets)) {
    if (chargeAtOf(key) !== 'signing' || !desk || !desk.order || !desk.order.prefix) continue;
    const rows = (leads || []).filter((l) => l && /^book_/.test(String(l.id || '')) && l.booked === true && l.market === key)
      .filter((l) => {
        const c = l.city || {};
        return [c.orderedAt, signedOnOf(l), paidAtOf(l, invoiceOf(l, inv)), l.withdrawnAt || (l.withdrawal && l.withdrawal.at), l.closedAt]
          .some((v) => romeDayOf(v).slice(0, 7) === month);
      })
      .sort((a, b) => String((a.city && a.city.order && a.city.order.number) || '').localeCompare(String((b.city && b.city.order && b.city.order.number) || '')));
    if (!rows.length) continue;
    const lines = [REG_COLS.join(';')];
    for (const l of rows) {
      const c = l.city || {}, o = c.order || {}, sg = l.signing || {}, fee = invoiceOf(l, inv);
      lines.push([
        o.number || l.id, romeStamp(c.orderedAt), l.name, l.email, c.service, c.startNow === true ? 'yes' : 'no',
        o.expiresOn || '', orderState(l, fee), signedOnOf(l), sg.invoiceId || '', romeDayOf(paidAtOf(l, fee)),
        romeDayOf(l.withdrawnAt || (l.withdrawal && l.withdrawal.at)), romeDayOf(l.closedAt),
      ].map(csvCell).join(';'));
    }
    const name = `${desk.country === 'fr' ? 'registre' : 'orders'}-${desk.order.prefix}-${month}.csv`;
    out.push({ name, desk: key, rows: rows.length, data: '\uFEFF' + lines.join('\r\n') + '\r\n' });
  }
  return out;
}

// The fee invoices of the orders (invoices/cityfee_<id>, source
// 'city-signing'): ONE query, then a direct read of any invoice an order
// names that the query did not return. A failed read throws: the register
// is never written from half the facts (the run fails, the heartbeat says so).
async function orderInvoices(orders) {
  const byId = new Map();
  for (const d of await fsList('invoices', { filter: { field: 'source', op: 'EQUAL', value: 'city-signing' }, limit: 1000 })) {
    if (d && d.id) byId.set(d.id, d);
  }
  const named = [...new Set((orders || []).map((l) => l && l.signing && typeof l.signing === 'object' ? l.signing.invoiceId : null)
    .filter((id) => typeof id === 'string' && /^[\w.-]{1,120}$/.test(id) && !byId.has(id)))];
  for (const id of named) {
    const d = await fsGet('invoices/' + id);
    if (d) byId.set(id, d);
  }
  return byId;
}

async function fetchPdf(url) {
  if (!url) return null;
  try {
    const r = await Promise.race([
      fetch(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
    ]);
    if (!r || !r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length ? b : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({
      dry,
      monthOverride: /^\d{4}-\d{2}$/.test(String(req.query?.month || '')) ? req.query.month : null,
    });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[conservazione]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry, monthOverride }) {
  const rome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  let y = rome.getFullYear(), m = rome.getMonth();
  if (monthOverride) { y = +monthOverride.slice(0, 4); m = +monthOverride.slice(5, 7) - 1; }
  else { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  const month = `${y}-${String(m + 1).padStart(2, '0')}`;

  const contracts = await fsList('contracts', { limit: 800 });
  const done = contracts.filter((c) => String(c.finalizedAt || '').slice(0, 7) === month);
  // the order registers of the desks that charge at signing (none until the
  // flip: nothing is read then)
  const signing = Object.keys(CITY_MARKETS).some((k) => chargeAtOf(k) === 'signing');
  const orders = signing ? await fsList('leads', { filter: { field: 'intent', op: 'EQUAL', value: 'city_booking' }, limit: 1000 }) : [];
  const registers = orderRegisters(orders, month, CITY_MARKETS, signing ? await orderInvoices(orders) : null);
  const counts = { month, contracts: done.length, files: 0, bytes: 0, emails: 0, missing: 0 };
  if (registers.length) counts.orders = registers.reduce((n, r) => n + r.rows, 0);

  if (!done.length && !registers.length) return { counts, note: 'nessun contratto finalizzato nel mese' };
  if (dry) {
    return { counts, contracts: done.map((c) => ({ id: c.id, tenant: c.tenantName, finalizedAt: c.finalizedAt })),
      ...(registers.length ? { registers: registers.map((r) => ({ name: r.name, rows: r.rows })) } : {}) };
  }

  // Idempotenza per mese: heartbeat/ è già admin-only nelle rules DEPLOYATE.
  try { await fsCreate('heartbeat', { kind: EMPLOYEE, month, at: new Date().toISOString() }, `conservazione-${month}`); }
  catch (e) { if (e.exists) return { counts, skipped: 'already_archived' }; /* altro errore: si procede */ }

  // Un contratto = i suoi PDF, nomi parlanti dentro lo ZIP
  const files = [];
  const indice = [`CONSERVAZIONE BOOM — mese ${month}`, `Generato: ${new Date().toISOString()}`, ''];
  for (const c of done) {
    const who = safe(c.tenantName || c.id);
    const sources = [
      ['contratto-firmato.pdf', c.signedPdfUrl],
      ['certificato-fes.pdf', c.signingCertificateUrl || c.certificateUrl],
      ['fascicolo-fiscale.pdf', c.fascicoloFiscaleUrl],
      ['marca-temporale.tsr', c.timestampTsrUrl],
      ['pack-registrazione.zip', c.registrationPackUrl],
    ];
    indice.push(`── ${c.tenantName || '?'} — ${c.propertyAddress || c.propertyId || ''} (contratto ${c.id})`);
    for (const [name, url] of sources) {
      if (!url) continue;
      const bytes = await fetchPdf(url);
      if (!bytes) { counts.missing++; indice.push(`   ✗ ${name} — NON scaricabile (${clip(url, 60)})`); continue; }
      files.push({ name: `${month}/${who}_${c.id.slice(0, 8)}/${name}`, data: bytes });
      counts.files++; counts.bytes += bytes.length;
      indice.push(`   ok ${name} (${Math.round(bytes.length / 1024)} KB)`);
    }
    indice.push('');
  }
  for (const r of registers) {
    const bytes = Buffer.from(r.data, 'utf8');
    files.push({ name: `${month}/${r.name}`, data: bytes });
    counts.files++; counts.bytes += bytes.length;
    indice.push(`── Registro ordini ${CITY_MARKETS[r.desk].label}: ${r.name} (${r.rows} ${r.rows === 1 ? 'riga' : 'righe'}, nati o cambiati nel mese)`);
  }
  if (!files.length) return { counts, note: 'nessun file scaricabile' };
  files.unshift({ name: `${month}/00_INDICE.txt`, data: indice.join('\n') });

  // Spezza in volumi ≤20MB, un'email per volume
  const volumes = [];
  let cur = [files[0]], size = 0;
  for (const f of files.slice(1)) {
    if (size + f.data.length > MAX_ZIP && cur.length > 1) { volumes.push(cur); cur = [files[0]]; size = 0; }
    cur.push(f); size += f.data.length;
  }
  volumes.push(cur);

  for (let i = 0; i < volumes.length; i++) {
    const zip = buildZip(volumes[i]);
    const part = volumes.length > 1 ? ` (vol. ${i + 1}/${volumes.length})` : '';
    await sendEmail({
      to: ADMIN_NOTIFY,
      subject: `🗄️ Conservazione ${month}${part} — ${counts.contracts} contratti, ${counts.files} file`,
      html: `<p>In allegato l'archivio di conservazione del mese <strong>${month}</strong>${part}: contratti firmati, certificati FES, fascicoli e marche temporali dei contratti finalizzati nel mese.</p>${registers.length ? `<p>Dentro c'è anche il registro degli ordini dei desk che incassano alla firma: ${registers.map((r) => r.name).join(', ')}.</p>` : ''}<p>Conserva questa email: è la copia FUORI da Firebase dell'archivio legale.</p>${counts.missing ? `<p>⚠️ ${counts.missing} file non scaricabili — dettagli in 00_INDICE.txt</p>` : ''}`,
      attachments: [{ filename: `BOOM_conservazione_${month}${volumes.length > 1 ? '_vol' + (i + 1) : ''}.zip`, content: zip, contentType: 'application/zip' }],
    });
    counts.emails++;
  }

  await tgNotify(`🗄️ <b>Conservazione ${month}</b>\n${counts.contracts} contratti · ${counts.files} file · ${Math.round(counts.bytes / 1024 / 1024 * 10) / 10}MB in ${counts.emails} email${counts.missing ? `\n⚠️ ${counts.missing} file mancanti (vedi INDICE)` : ''}`);
  await logActivity('Conservazione mensile inviata', 'ops', counts, EMPLOYEE);
  return { counts };
}
