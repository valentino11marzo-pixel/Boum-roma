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

const EMPLOYEE = 'conservazione';
const ADMIN_NOTIFY = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const MAX_ZIP = 20 * 1024 * 1024;
const clip = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
const safe = (s) => clip(s, 60).replace(/[^a-zA-Z0-9._-]/g, '_') || 'doc';

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
  const counts = { month, contracts: done.length, files: 0, bytes: 0, emails: 0, missing: 0 };

  if (!done.length) return { counts, note: 'nessun contratto finalizzato nel mese' };
  if (dry) {
    return { counts, contracts: done.map((c) => ({ id: c.id, tenant: c.tenantName, finalizedAt: c.finalizedAt })) };
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
      html: `<p>In allegato l'archivio di conservazione del mese <strong>${month}</strong>${part}: contratti firmati, certificati FES, fascicoli e marche temporali dei contratti finalizzati nel mese.</p><p>Conserva questa email: è la copia FUORI da Firebase dell'archivio legale.</p>${counts.missing ? `<p>⚠️ ${counts.missing} file non scaricabili — dettagli in 00_INDICE.txt</p>` : ''}`,
      attachments: [{ filename: `BOOM_conservazione_${month}${volumes.length > 1 ? '_vol' + (i + 1) : ''}.zip`, content: zip, contentType: 'application/zip' }],
    });
    counts.emails++;
  }

  await tgNotify(`🗄️ <b>Conservazione ${month}</b>\n${counts.contracts} contratti · ${counts.files} file · ${Math.round(counts.bytes / 1024 / 1024 * 10) / 10}MB in ${counts.emails} email${counts.missing ? `\n⚠️ ${counts.missing} file mancanti (vedi INDICE)` : ''}`);
  await logActivity('Conservazione mensile inviata', 'ops', counts, EMPLOYEE);
  return { counts };
}
