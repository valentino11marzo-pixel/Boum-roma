// api/ops/backup.js — IL BACKUP DEL DATABASE (cron giornaliero, 04:50 UTC)
//
// L'audit del 2026-08-18 ha trovato il rischio numero uno: NON esisteva alcun
// backup del database. Ogni altro problema è recuperabile; questo no. Un
// `fsPatch` sbagliato, uno script storto o una password admin compromessa
// cancellavano contratti, pagamenti e mandati SEPA in modo definitivo.
//
// Questo cron chiude la classe di guasto DOMINANTE (errore umano, cancellazione
// accidentale, script andato storto) senza nuovi servizi: esporta ogni giorno
// le collezioni critiche in un JSON gzippato su Firebase Storage
// (`backups/YYYY-MM-DD/…`), e — per le collezioni CORE, quando stanno sotto il
// limite email — ne allega una copia alla casella dell'operatore: Gmail
// diventa la copia FUORI piattaforma (come fa già la Conservazione per i PDF).
//
// Cosa NON copre da solo (dichiarato, non nascosto): il disaster recovery
// TOTALE (perdita dell'intero progetto Firebase) — per quello serve PITR di
// Firestore (una casella nella console, 7 giorni) e/o un export su un secondo
// cloud. Il manifest via Telegram/email lo ricorda finché non è attivo.
//
// Idempotente per giorno via `heartbeat/backup-<YYYY-MM-DD>` (fsCreate → 409
// = già fatto oggi). Heartbeat `teamHealth/backup`. Auth come i cron PFS.
// Query: ?dry=1 (conta senza scrivere) · ?full=1 (forza anche in dry).
//
// PREREQUISITO: storage.rules con `match /backups/` admin-only (deployato
// insieme a questo commit) — senza, l'upload 403 (le credenziali admin
// passano dalle rules, la lezione di api/homie/_lib.js).

import {
  requireCronOrAdmin, fsList, fsCreate, tgNotify, reportEmployeeHealth,
} from '../employees/_lib.js';
import { getAdminToken } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { gzipSync } from 'node:zlib';

const EMPLOYEE = 'backup';
const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const ADMIN_NOTIFY = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const LIMIT_PER = 5000;          // tetto per collezione (fsList non pagina)
const EMAIL_MAX = 18 * 1024 * 1024; // allegato email: sotto i 25MB di Gmail

// Il cuore: money + identità + atti. Sempre esportate, e allegate via email
// quando piccole (la copia fuori-piattaforma del dato che conta davvero).
export const COLLECTIONS_CORE = [
  'contracts', 'payments', 'users', 'properties', 'landlords',
  'preAgreements', 'invoices', 'deadlines', 'clients', 'pfsClients', 'leads',
];
// Il resto dello stato operativo. Esportato su Storage (recupero da errore).
export const COLLECTIONS_EXTRA = [
  'maintenance', 'documents', 'savedSearches', 'viewingRequests',
  'bankAccounts', 'bankTransactions', 'operatorTasks', 'portalPubs',
  'propertyLocks', 'rendiconti', 'documentShares', 'registrations',
];
export const COLLECTIONS_FULL = [...COLLECTIONS_CORE, ...COLLECTIONS_EXTRA];

// Manifest = la verità onesta su cosa è stato salvato, truncation compresa.
// Puro ed esportato: è la parte che decide se il backup è affidabile, quindi
// si testa senza rete.
export function manifestOf(collections, limitPer = LIMIT_PER) {
  const rows = [];
  let total = 0, truncated = [];
  for (const name of Object.keys(collections)) {
    const n = (collections[name] || []).length;
    total += n;
    const isTrunc = n >= limitPer; // count == limit ⇒ potrebbe esserci di più
    if (isTrunc) truncated.push(name);
    rows.push({ name, count: n, truncated: isTrunc });
  }
  return { rows, total, truncated };
}

async function uploadToStorage(path, buf, contentType) {
  const token = await getAdminToken();
  const r = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: buf }
  );
  if (!r.ok) throw new Error(`Storage upload failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return path;
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[backup]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry }) {
  // Data di Roma (il cron gira in UTC; il nome file segue il giorno locale).
  const rome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const day = `${rome.getFullYear()}-${String(rome.getMonth() + 1).padStart(2, '0')}-${String(rome.getDate()).padStart(2, '0')}`;
  const stamp = day + 'T' + String(rome.getHours()).padStart(2, '0') + String(rome.getMinutes()).padStart(2, '0');

  // Idempotenza per giorno: un secondo run nello stesso giorno non ripete.
  if (!dry) {
    try {
      await fsCreate('heartbeat', { at: new Date(), day, by: 'backup-cron' }, `backup-${day}`);
    } catch (e) {
      if (String(e.message || '').includes('409') || String(e.message || '').includes('exists')) {
        return { skipped: 'already_done_today', day, counts: {} };
      }
      throw e;
    }
  }

  // Esporta ogni collezione. Un errore su una NON deve far perdere le altre:
  // si annota e si prosegue (un backup parziale è meglio di nessun backup).
  const collections = {};
  const errors = [];
  for (const name of COLLECTIONS_FULL) {
    try {
      collections[name] = await fsList(name, { limit: LIMIT_PER });
    } catch (e) {
      collections[name] = [];
      errors.push({ name, error: String(e.message || e).slice(0, 120) });
    }
  }

  const manifest = manifestOf(collections, LIMIT_PER);
  const dump = { generatedAt: new Date().toISOString(), day, bucket: BUCKET, collections };
  const gz = gzipSync(Buffer.from(JSON.stringify(dump)), { level: 9 });
  const counts = {
    day, docs: manifest.total, bytes: gz.length,
    collections: manifest.rows.length, truncated: manifest.truncated, errors: errors.length,
  };

  if (dry) return { dry: true, counts, manifest: manifest.rows, errors };

  // 1) Copia completa su Storage (il recupero da errore umano, il 90% dei casi).
  const storagePath = `backups/${day}/boom-dump-${stamp}.json.gz`;
  await uploadToStorage(storagePath, gz, 'application/gzip');

  // 2) Copia CORE fuori piattaforma via email, quando sta sotto il limite Gmail.
  const core = {};
  for (const n of COLLECTIONS_CORE) core[n] = collections[n] || [];
  const coreGz = gzipSync(Buffer.from(JSON.stringify({ generatedAt: dump.generatedAt, day, collections: core })), { level: 9 });
  const attachable = coreGz.length <= EMAIL_MAX;

  const truncNote = manifest.truncated.length
    ? `\n\n⚠️ Collezioni al limite di ${LIMIT_PER} righe (potrebbero avere altri dati non salvati): ${manifest.truncated.join(', ')}. Alzare LIMIT_PER o attivare un export completo.`
    : '';
  const errNote = errors.length ? `\n\n⚠️ Errori: ${errors.map(e => e.name + ' (' + e.error + ')').join('; ')}` : '';
  const rowsTxt = manifest.rows.map(r => `  ${r.name}: ${r.count}${r.truncated ? ' ⚠️' : ''}`).join('\n');
  const mb = (n) => (n / 1024 / 1024).toFixed(2);

  const emailText =
    `Backup BOOM del ${day}.\n\n` +
    `${manifest.total} documenti in ${manifest.rows.length} collezioni.\n` +
    `Copia completa su Storage: ${storagePath} (${mb(gz.length)} MB).\n` +
    (attachable
      ? `Copia CORE (contratti, pagamenti, utenti, immobili, proposte…) in allegato: boom-core-${day}.json.gz (${mb(coreGz.length)} MB).`
      : `Copia CORE troppo grande per l'email (${mb(coreGz.length)} MB): è comunque nel dump su Storage.`) +
    `\n\nDettaglio:\n${rowsTxt}${truncNote}${errNote}\n\n` +
    `Nota DR: questo protegge da errori e cancellazioni. Per la perdita TOTALE del progetto Firebase attiva PITR nella console Firestore (7 giorni di ripristino) — è una casella, un minuto.`;

  try {
    await sendEmail({
      to: ADMIN_NOTIFY,
      subject: `🗄️ Backup BOOM ${day} — ${manifest.total} documenti`,
      text: emailText,
      attachments: attachable ? [{ filename: `boom-core-${day}.json.gz`, content: coreGz }] : [],
    });
    counts.emailed = attachable;
  } catch (e) { counts.emailError = String(e.message || e).slice(0, 120); }

  // Recap Telegram solo se c'è qualcosa da sapere (truncation/errori) o comunque
  // una riga sobria: un backup andato bene non deve gridare ogni giorno.
  try {
    if (manifest.truncated.length || errors.length) {
      await tgNotify(`🗄️ Backup ${day}: ${manifest.total} doc su Storage.${truncNote}${errNote}`.slice(0, 3500));
    }
  } catch { /* non-fatal */ }

  return { day, storagePath, counts, manifest: manifest.rows, errors };
}
