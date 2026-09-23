// api/owner/archivio.js — GET /api/owner/archivio[?as=<ownerUid>]
//
// L'Archivio del Proprietario, lato server: legge ciò che è del proprietario,
// lo passa al motore puro (js/owner-archive-engine.js → BOOM_OWNER.build) e
// restituisce la PROIEZIONE — mai un record grezzo. Il browser del
// proprietario non legge più Firestore: questa è la sua unica porta.
//
// L'ordine conta (spec §C2):
//  1. chi guarda (landlord = sempre sé stesso; admin = «vedi come» con ?as)
//  2. immobili → chiavi (uid + alias) → contratti, rate, interventi,
//     documenti, scadenze, rendiconti, fatture (ognuno col suo tetto)
//  3. per i 36 rendiconti più recenti, il PDF esiste davvero? (per percorso)
//  4. build → assertClean: una proiezione sporca NON esce (500 projection_unsafe)
//  5. prima apertura di un landlord: timbro + notifica all'operatore
//     (entrambi ATTESI — su Vercel una scrittura dopo la risposta si perde —
//      entrambi best-effort: un loro guasto non toglie l'archivio)
//  6. 200 { ok, archive } con Cache-Control privato, mai in cache.
//
// Nei log: codici e conteggi. Mai un nome, un indirizzo, un URL.
import { setCors } from '../_auth.js';
import { fsPatch, fsCreate } from '../homie/_lib.js';
import { schedaUrl } from '../profile/_scheda.js';
import OWNER from '../../js/owner-archive-engine.js';
import RENT from '../../js/rent-engine.js';
import FIELDS from '../../js/contract-fields.js';
import DOSSIER from '../../js/property-dossier-engine.js';
import { resolveOwner, loadArchiveRecords, storageMeta, BUCKETS, UPLOAD_BUCKET } from './_load.js';

const RENDICONTI_CHECKED = 36;
const META_MS = 5000;
const NO_STORE = 'private, no-store, max-age=0';

const DEPS = { rent: RENT, fields: FIELDS, dossier: DOSSIER, schedaUrl: (cid) => schedaUrl(cid, 'landlord') };

// Il rendiconto è su un percorso deterministico (api/owners/rendiconto.js):
// il marcatore dice «spedito», solo Storage dice «il PDF c'è».
async function checkRendiconti(markers, keys) {
  const out = {};
  const mine = (markers || []).filter((m) => m && keys.includes(String(m.ownerId || '')) && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m.month || '')))
    .sort((a, b) => String(b.month).localeCompare(String(a.month)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, RENDICONTI_CHECKED);
  await Promise.all(mine.map(async (m) => {
    const id = m.id || `${m.ownerId}_${m.month}`;
    try {
      const meta = await storageMeta(UPLOAD_BUCKET, `rendiconti/${m.ownerId}/rendiconto_${m.month}.pdf`, { timeoutMs: META_MS });
      out[id] = meta ? true : false;
    } catch (_) {
      out[id] = null;   // non verificato: la pagina lo elenca, il file dirà la verità
    }
  }));
  return out;
}

export default async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', NO_STORE);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const who = await resolveOwner(req, res, { asFrom: 'query' });
  if (!who) return;
  const { viewer, ownerUid, ownerUser, ownerLandlord, aliases, name, properties } = who;

  const keys = OWNER.ownerKeys(ownerUid, aliases);
  const records = await loadArchiveRecords(ownerUid, properties, keys);
  const partial = [...new Set([...(who.partial || []), ...(records.partial || [])])].sort();
  const rendicontiFiles = await checkRendiconti(records.rendiconti, keys);

  let archive;
  try {
    archive = OWNER.build({
      ownerUid, aliases, viewer, owner: { name },
      landlordProfile: { ...(ownerLandlord || {}), ...(ownerUser || {}) },
      properties,
      contracts: records.contracts, payments: records.payments, maintenance: records.maintenance,
      documents: records.documents, deadlines: records.deadlines, rendiconti: records.rendiconti, invoices: records.invoices,
      rendicontiFiles, partial, buckets: BUCKETS, uploadBucket: UPLOAD_BUCKET, now: new Date(),
    }, DEPS);
  } catch (e) {
    console.error('[owner/archivio] build_failed');
    return res.status(500).json({ ok: false, error: 'build_failed' });
  }

  const clean = OWNER.assertClean(archive);
  if (!clean.ok) {
    console.error('[owner/archivio] projection_unsafe', clean.violations.map((v) => v.rule + '@' + v.path));
    return res.status(500).json({ ok: false, error: 'projection_unsafe' });
  }

  // Prima apertura del proprietario (mai in «vedi come»): un timbro e una
  // notifica all'operatore, attesi prima della risposta.
  if (viewer.role === 'landlord' && viewer.uid === ownerUid && !(ownerUser && ownerUser.ownerPortalFirstAt)) {
    const at = new Date();
    try { await fsPatch('users/' + ownerUid, { ownerPortalFirstAt: at.toISOString() }); }
    catch (_) { console.warn('[owner/archivio] first_stamp_failed'); }
    try {
      await fsCreate('agentNotifications', {
        type: 'owner.activated',
        summary: `🔑 ${name || 'Un proprietario'} ha aperto il suo archivio (${properties.length} ${properties.length === 1 ? 'immobile' : 'immobili'})`,
        status: 'pending', priority: 'high',
        ref: { collection: 'users', id: ownerUid },
        payload: { uid: ownerUid, properties: properties.length },
        dedupKey: 'owner-activated-' + ownerUid,
        createdAt: at,
      }, 'owner_activated_' + ownerUid);
    } catch (e) {
      if (!e || !e.exists) console.warn('[owner/archivio] activation_notify_failed');
    }
  }

  console.log('[owner/archivio] ok', viewer.role, 'props=' + properties.length, 'contracts=' + records.contracts.length,
    'archive=' + archive.archive.length, 'partial=' + partial.length, 'state=' + archive.verdict.state);
  return res.status(200).json({ ok: true, archive });
}
