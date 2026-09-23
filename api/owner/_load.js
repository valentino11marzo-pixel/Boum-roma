// api/owner/_load.js — le letture dell'Archivio del Proprietario, lato server.
//
// Una copia sola di: chi sta guardando (e per conto di chi), cosa si legge da
// Firestore per quel proprietario, e come si parla con Storage PER PERCORSO.
// Lo usano /api/owner/archivio (la proiezione) e /api/owner/file (il PDF):
// ciò che la pagina elenca e ciò che il file serve passano dalle stesse porte.
//
// REGOLE (spec §C1 + ERRATA)
//  1. Il proprietario è SEMPRE chi è loggato. `as` vale solo per l'admin
//     («vedi come»); a un landlord lo si ignora in silenzio (spec §A2).
//  2. Nessuna troncatura muta (ERRATA E1.3): ogni query ha un `limit`
//     esplicito, e una risposta piena fino al limite aggiunge
//     `truncated:<collection>` — il verdetto diventa «non posso dirlo»,
//     mai un totale inventato su metà delle rate. Nessuna paginazione.
//  3. Una query fallita non fa fallire la pagina: aggiunge `read:<collection>`
//     e il motore lo dichiara (`read_partial`). Solo la lista degli immobili è
//     portante: senza quella non c'è un archivio da mostrare (500 read_failed).
//  4. Si legge SOLO ciò che è nel perimetro del proprietario: per immobile
//     posseduto, per contratto su quegli immobili, per chiave del proprietario.
//  5. Storage si legge PER PERCORSO col Bearer admin, sull'host
//     firebasestorage.googleapis.com, su un bucket della lista. L'URL
//     tokenizzato salvato sul record si usa SOLO come ripiego dopo un 401/403
//     sul percorso, e solo se punta allo stesso bucket+percorso (ERRATA E2).
//  6. Nei log codici e conteggi, mai un contenuto.
import { requireRole } from '../_auth.js';
import { fsGet, fsList, getAdminToken } from '../homie/_lib.js';
import OWNER from '../../js/owner-archive-engine.js';

const STORAGE_HOST = 'firebasestorage.googleapis.com';
const ID_RE = /^[\w.-]{1,160}$/;
export const MAX_PROPERTIES = 50;          // il ventaglio per immobile ha un tetto dichiarato
export const LIMITS = { contracts: 300, payments: 600, maintenance: 300, documents: 300, deadlines: 300, rendiconti: 300, invoices: 300 };
const QUERY_MS = 8000;                     // tetto per singola query (spec §C1)
const LOAD_BUDGET_MS = 35000;              // oltre, le query non partite si dichiarano `read:`
const POOL = 16;                           // query in volo insieme

const clean = (v) => (v == null ? '' : String(v).trim());
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

// Il bucket dove storageUpload scrive (STESSA espressione di api/agent/_lib.js).
export const UPLOAD_BUCKET = process.env.FIREBASE_STORAGE_BUCKET
  || `${process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards'}.firebasestorage.app`;
// Tutti i bucket da cui un URL salvato può venire: quello di upload per primo
// (ERRATA E2), poi le due variabili d'ambiente che il repo usa, poi i default.
export const BUCKETS = uniq([UPLOAD_BUCKET, clean(process.env.FIREBASE_STORAGE_BUCKET), clean(process.env.FIREBASE_BUCKET), ...OWNER.DEFAULT_BUCKETS]);

const validId = (s) => typeof s === 'string' && ID_RE.test(s) && s !== '.' && s !== '..';

function bodyOf(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string' || Buffer.isBuffer(b)) { try { return JSON.parse(String(b)) || {}; } catch (_) { return {}; } }
  return {};
}

// ── Gli immobili del proprietario ──────────────────────────────────────
// { properties, partial } — lancia se la query fallisce (il chiamante → 500).
export async function loadOwnedProperties(ownerUid) {
  const rows = await fsList('properties', {
    filter: { field: 'ownerId', op: 'EQUAL', value: ownerUid },
    limit: MAX_PROPERTIES + 1,
    signal: AbortSignal.timeout(QUERY_MS),
  });
  const partial = [];
  if (rows.length > MAX_PROPERTIES) partial.push('truncated:properties');
  return { properties: rows.slice(0, MAX_PROPERTIES), partial };
}

// Chi è il proprietario «guardato»: il suo profilo, la scheda landlords, gli
// alias scritti dall'invito (ERRATA E5: un solo archivio degli alias,
// users/<uid>.ownerAliases) e i suoi immobili.
// → { ok:true, ownerUser, ownerLandlord, aliases, name, properties, partial }
//   { ok:false, status, error }
export async function loadOwnerView(ownerUid, { knownUser = null, admin = false } = {}) {
  let ownerUser = knownUser, ownerLandlord = null, owned;
  try {
    const [u, ll, pr] = await Promise.all([
      knownUser ? Promise.resolve(knownUser) : fsGet('users/' + ownerUid),
      fsGet('landlords/' + ownerUid).catch(() => null),   // secondario: la scheda anagrafica
      loadOwnedProperties(ownerUid),
    ]);
    ownerUser = u; ownerLandlord = ll; owned = pr;
  } catch (_) {
    return { ok: false, status: 500, error: 'read_failed' };
  }
  // «Vedi come» vale per chiunque possieda almeno un immobile (anche un
  // ownerId penzolante, senza profilo) o abbia un profilo (ERRATA E5).
  if (admin && !owned.properties.length && !ownerUser && !ownerLandlord) return { ok: false, status: 404, error: 'owner_not_found' };
  const aliases = Array.isArray(ownerUser && ownerUser.ownerAliases) ? ownerUser.ownerAliases : [];
  const firstOwnerName = (owned.properties.find((p) => clean(p.ownerName)) || {}).ownerName;
  const name = clean(ownerUser && ownerUser.name) || clean(ownerLandlord && ownerLandlord.name) || clean(firstOwnerName) || '';
  return { ok: true, ownerUser: ownerUser || null, ownerLandlord: ownerLandlord || null, aliases, name,
    properties: owned.properties, partial: owned.partial };
}

// ── Chi guarda, e per conto di chi ─────────────────────────────────────
// Scrive lo stato e restituisce null (il chiamante fa `return`) oppure
// { viewer:{uid,role}, ownerUid, ownerUser, ownerLandlord, aliases, name, properties, partial }.
// (spec §C1 + ERRATA E5: nessun 409 not_a_landlord; il «vedi come» vale per
//  qualunque id che possieda un immobile o abbia un profilo)
export async function resolveOwner(req, res, { asFrom = 'query' } = {}) {
  const auth = await requireRole(req, res, ['landlord', 'admin']);
  if (!auth) return null;
  const role = auth.profile.role;
  const viewer = { uid: auth.uid, role };
  let ownerUid, view;
  if (role === 'admin') {
    const raw = asFrom === 'body' ? bodyOf(req).as : (req.query || {}).as;
    const as = raw == null ? '' : String(Array.isArray(raw) ? raw[0] : raw).trim();
    if (!as) { res.status(400).json({ ok: false, error: 'as_required' }); return null; }
    if (!validId(as)) { res.status(400).json({ ok: false, error: 'bad_as' }); return null; }
    ownerUid = as;
    view = await loadOwnerView(ownerUid, { admin: true });
  } else {
    // Un landlord guarda SEMPRE il proprio archivio: `as` non si legge nemmeno.
    ownerUid = auth.uid;
    view = await loadOwnerView(ownerUid, { knownUser: auth.profile });
  }
  if (!view.ok) { res.status(view.status).json({ ok: false, error: view.error }); return null; }
  return { viewer, ownerUid, ...view };
}

// ── Le query, con tetto, dichiarazione e budget ────────────────────────
async function pool(tasks, n) {
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
}

// → { contracts, payments, maintenance, documents, deadlines, rendiconti, invoices, partial }
export async function loadArchiveRecords(ownerUid, properties, ownerKeys, { budgetMs = LOAD_BUDGET_MS } = {}) {
  const started = Date.now();
  const store = {};
  Object.keys(LIMITS).forEach((c) => { store[c] = new Map(); });
  const partial = new Set();
  const keys = uniq((ownerKeys && ownerKeys.length ? ownerKeys : [ownerUid]).map(clean)).filter(validId);
  const pids = uniq((properties || []).map((p) => clean(p && p.id))).filter(validId);

  const query = (col, field, op, value) => async () => {
    if (Date.now() - started > budgetMs) { partial.add('read:' + col); return; }
    const limit = LIMITS[col];
    try {
      const rows = await fsList(col, { filter: { field, op, value }, limit, signal: AbortSignal.timeout(QUERY_MS) });
      if (rows.length >= limit) partial.add('truncated:' + col);
      rows.forEach((r) => { if (r && r.id) store[col].set(r.id, r); });
    } catch (_) {
      partial.add('read:' + col);
    }
  };

  const first = [];
  pids.forEach((pid) => {
    first.push(query('contracts', 'propertyId', 'EQUAL', pid));
    first.push(query('payments', 'propertyId', 'EQUAL', pid));
    first.push(query('maintenance', 'propertyId', 'EQUAL', pid));
    first.push(query('documents', 'propertyId', 'EQUAL', pid));
    first.push(query('deadlines', 'linkedPropertyId', 'EQUAL', pid));
  });
  keys.forEach((k) => {
    first.push(query('documents', 'userId', 'EQUAL', k));
    first.push(query('rendiconti', 'ownerId', 'EQUAL', k));
    first.push(query('invoices', 'recipientId', 'EQUAL', k));
  });
  await pool(first, POOL);

  // Le rate senza propertyId (pay_<cid>_<mese>) si ritrovano dal contratto:
  // IN a blocchi da 10 (il tetto di Firestore sull'operatore IN).
  const cids = [...store.contracts.keys()].filter(validId);
  const second = [];
  for (let i = 0; i < cids.length; i += 10) second.push(query('payments', 'contractId', 'IN', cids.slice(i, i + 10)));
  await pool(second, POOL);

  const out = {};
  Object.keys(store).forEach((c) => { out[c] = [...store[c].values()]; });
  out.partial = [...partial].sort();
  return out;
}

// ── Storage per percorso ───────────────────────────────────────────────
function storageErr(status, code) { const e = new Error(code || ('storage_' + status)); e.status = status; e.code = code || 'storage_error'; return e; }
function objectUrl(bucket, path) {
  if (!BUCKETS.includes(bucket)) throw storageErr(0, 'bucket_not_allowed');
  if (typeof path !== 'string' || !path || path[0] === '/' || path.includes('\\') || path.split('/').some((s) => s === '..' || s === '.' || s === '')) {
    throw storageErr(0, 'bad_path');
  }
  return `https://${STORAGE_HOST}/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}`;
}

// { size, contentType, name } | null (404) — lancia {status} su ogni altro esito.
export async function storageMeta(bucket, path, { timeoutMs = QUERY_MS } = {}) {
  const url = objectUrl(bucket, path);
  const token = await getAdminToken();
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(timeoutMs) });
  if (r.status === 404) return null;
  if (!r.ok) throw storageErr(r.status);
  const m = await r.json();
  const size = Number(m && m.size);
  return { size: Number.isFinite(size) ? size : null, contentType: clean(m && m.contentType), name: clean(m && m.name) };
}

async function readCapped(r, maxBytes, ac) {
  const cl = Number(r.headers.get('content-length'));
  if (Number.isFinite(cl) && cl > maxBytes) { ac.abort(); const e = storageErr(413, 'too_large'); e.size = cl; throw e; }
  if (!r.body || typeof r.body.getReader !== 'function') {
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) { const e = storageErr(413, 'too_large'); e.size = buf.length; throw e; }
    return buf;
  }
  const reader = r.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch (_) { /* già chiuso */ }
      ac.abort();
      const e = storageErr(413, 'too_large'); e.size = total; throw e;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

// Buffer — scarica PER PERCORSO col Bearer admin; oltre maxBytes interrompe.
// `fallbackUrl` (l'URL tokenizzato salvato) si usa SOLO dopo un 401/403 e
// solo se punta allo stesso bucket+percorso: l'host resta inchiodato.
export async function storageBytes(bucket, path, maxBytes, { fallbackUrl = null, timeoutMs = 25000 } = {}) {
  const url = objectUrl(bucket, path) + '?alt=media';
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const token = await getAdminToken();
    let r = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: ac.signal });
    let via = 'path';
    if ((r.status === 401 || r.status === 403) && fallbackUrl) {
      const p = OWNER.parseStorageUrl(fallbackUrl, BUCKETS);
      if (p && p.bucket === bucket && p.path === path) {
        try { if (r.body) await r.body.cancel(); } catch (_) { /* niente da chiudere */ }
        r = await fetch(fallbackUrl, { signal: ac.signal });
        via = 'fallback';
      }
    }
    console.log('[owner/file] storage_via', via, r.status);
    if (r.status === 404) throw storageErr(404, 'not_found');
    if (!r.ok) throw storageErr(r.status);
    return await readCapped(r, maxBytes, ac);
  } finally {
    clearTimeout(timer);
  }
}
