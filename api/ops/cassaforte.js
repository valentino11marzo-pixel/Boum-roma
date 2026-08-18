// api/ops/cassaforte.js — LA CASSAFORTE (cron notturno, 02:50 UTC)
//
// L'audit del 18/08 l'ha detto senza giri: il database non ha UN backup.
// Tutto il business — contratti, pagamenti, clienti — vive in un Firestore
// senza copia: un errore di progetto, un account compromesso, un delete
// sbagliato e non c'è niente da riaprire. Questo cron, ogni notte, legge
// le collection critiche via REST admin, le serializza in JSON, le chiude
// in UNO ZIP con INDICE.txt e:
//   1. lo posa su Storage (`backups/cassaforte-<data>.zip`) — la copia
//      pronta da riscaricare;
//   2. lo SPEDISCE alla casella dell'operatore quando pesa ≤18MB — Gmail
//      è la copia FUORI piattaforma (stessa disciplina della
//      Conservazione: zero credenziali nuove, zero servizi da mantenere).
//      Oltre la soglia resta la copia Storage e Telegram lo dice.
//
// NON sostituisce l'export nativo di Firestore (che resta la strada
// giusta appena si configura il bucket GCS): è la rete che esiste DA
// STASERA, con gli attrezzi che il progetto ha già.
//
// Idempotente per giorno via `heartbeat/cassaforte-<YYYY-MM-DD>`
// (collection già admin-only nelle rules deployate — la lezione
// propertyLocks al contrario). Auth come i cron PFS; ?dry=1 conta senza
// scrivere né spedire.

import {
  requireCronOrAdmin, fsList, fsCreate, tgNotify, reportEmployeeHealth,
} from '../employees/_lib.js';
import { getAdminToken } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { buildZip } from '../_zip.js';

const EMPLOYEE = 'cassaforte';
const ADMIN_NOTIFY = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET
  || 'boom-property-dashboards.firebasestorage.app';
const MAX_MAIL = 18 * 1024 * 1024;

// le collection che SONO il business: perderne una non è un disservizio,
// è la fine dell'archivio. documents/conversations portano i metadati
// (i file veri stanno su Storage e hanno già la Conservazione).
export const COLLECTIONS = [
  'listings', 'properties', 'contracts', 'payments', 'invoices',
  'preAgreements', 'leads', 'users', 'landlords', 'pfsClients',
  'savedSearches', 'viewings', 'viewingRequests', 'maintenance',
  'documents', 'settings',
];

async function uploadZip(path, bytes) {
  const token = await getAdminToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const r = await fetch(url, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' },
    body: bytes });
  if (!r.ok) throw new Error('storage_' + r.status + ': ' + (await r.text()).slice(0, 200));
  const meta = await r.json().catch(() => ({}));
  const dt = (meta.downloadTokens || '').split(',')[0];
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media${dt ? ('&token=' + dt) : ''}`;
}

export async function run({ dry = false, dayOverride = null } = {}) {
  const day = dayOverride || new Date().toISOString().slice(0, 10);

  if (!dry) {
    // idempotenza per giorno: il secondo giro è un no-op per costruzione
    try {
      await fsCreate('heartbeat',
        { kind: EMPLOYEE, day, at: new Date().toISOString() },
        `cassaforte-${day}`);
    } catch (e) {
      if (e.exists) return { done: 'già in cassaforte', day };
      throw e;
    }
  }

  const files = [];
  const counts = {};
  const buchi = [];
  for (const coll of COLLECTIONS) {
    try {
      const docs = await fsList(coll, { limit: 5000 });
      counts[coll] = (docs || []).length;
      files.push({
        name: coll + '.json',
        data: Buffer.from(JSON.stringify(docs || [], null, 1), 'utf8'),
      });
    } catch (e) {
      // una collection illeggibile NON ferma il backup delle altre —
      // ma finisce nell'INDICE: un buco taciuto è un backup bugiardo
      counts[coll] = -1;
      buchi.push(coll + ': ' + e.message);
    }
  }
  if (!files.length) throw new Error('nessuna collection leggibile');

  const indice = [
    `BOOM · Cassaforte — dump del ${day}`,
    'Copia di sicurezza del database (JSON per collection).',
    'I FILE (pdf/foto) vivono su Storage: qui ci sono i loro riferimenti.',
    '',
    ...COLLECTIONS.map((c) => `  ${c}: ${counts[c] === -1 ? 'ILLEGGIBILE' : counts[c] + ' documenti'}`),
    ...(buchi.length ? ['', 'BUCHI (da guardare):', ...buchi.map((b) => '  ' + b)] : []),
  ].join('\n');
  files.unshift({ name: '00_INDICE.txt', data: Buffer.from(indice, 'utf8') });

  const zip = buildZip(files);
  const tot = Object.values(counts).filter((n) => n > 0).reduce((a, b) => a + b, 0);
  if (dry) return { dry: true, day, counts, zipBytes: zip.length };

  const url = await uploadZip(`backups/cassaforte-${day}.zip`, zip);

  let emailed = false;
  if (zip.length <= MAX_MAIL) {
    try {
      await sendEmail({
        to: ADMIN_NOTIFY,
        subject: `BOOM · Cassaforte ${day} — ${tot} documenti al sicuro`,
        text: `Backup notturno del database (${(zip.length / 1048576).toFixed(1)}MB, `
          + `${tot} documenti in ${files.length - 1} collection).\n`
          + `Copia su Storage: ${url}\n\n${indice}`,
        attachments: [{ filename: `boom-cassaforte-${day}.zip`,
          content: zip, contentType: 'application/zip' }],
      });
      emailed = true;
    } catch (e) {
      // l'email è la copia fuori piattaforma: se salta, NON in silenzio
      try { await tgNotify('⚠️ <b>Cassaforte</b>: lo ZIP di ' + day
        + ' è su Storage ma l\'email non è partita (' + e.message.slice(0, 120)
        + ').'); } catch (e2) {}
    }
  } else {
    try { await tgNotify('🗄️ <b>Cassaforte</b>: il dump di ' + day + ' pesa '
      + (zip.length / 1048576).toFixed(1) + 'MB — oltre la soglia email. '
      + 'La copia è su Storage.'); } catch (e2) {}
  }
  if (buchi.length) {
    try { await tgNotify('⚠️ <b>Cassaforte</b>: collection illeggibili nel dump di '
      + day + ' — ' + buchi.map((b) => b.split(':')[0]).join(', ')); } catch (e2) {}
  }
  return { day, counts, zipBytes: zip.length, url, emailed, buchi };
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';
  try {
    const out = await run({ dry,
      dayOverride: /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.day || ''))
        ? req.query.day : null });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: { zipBytes: out.zipBytes || 0, emailed: !!out.emailed } });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[cassaforte]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}
