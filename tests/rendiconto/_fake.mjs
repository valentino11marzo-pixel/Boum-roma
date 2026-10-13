// tests/rendiconto/_fake.mjs — Firestore + Storage + Identity Toolkit in
// memoria, abbastanza VERI per il rendiconto:
//  - runQuery con EQUAL/IN, ordine per nome documento, startAt (cursore) e
//    limit: le letture a pagine e i filtri IN si provano davvero;
//  - create con documentId → 409 se esiste; PATCH con exists=false che
//    rifiuta un doc esistente (come Firestore) e poi aggiorna con la mask;
//  - :commit con precondizione updateTime (409 se il doc è cambiato);
//  - :batchGet; un registro delle query per asserire COSA si legge.
// globalThis.__fsHook(method, path) può restituire una Response per
// simulare un guasto (es. 403 sulle regole). Nessun dato personale vero.

export const store = new Map();         // 'col/id' → oggetto
export const versions = new Map();      // 'col/id' → updateTime
export const storageFiles = new Map();  // path → Buffer
export const queries = [];              // { col, filter } per ogni runQuery
export const telegrams = [];            // il testo di ogni messaggio Telegram
let clock = 0;
const bump = (k) => versions.set(k, `2026-01-01T00:00:${String(++clock).padStart(6, '0')}Z`);
export function put(k, v) { store.set(k, v); bump(k); }
export function reset() { store.clear(); versions.clear(); storageFiles.clear(); queries.length = 0; telegrams.length = 0; globalThis.__mails = []; globalThis.__mailHook = null; globalThis.__fsHook = null; globalThis.__storageHook = null; }

const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const err = (status, statusText, message) => new Response(JSON.stringify({ error: { code: status, status: statusText, message } }), { status });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const toFields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fromFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };
const NAME = 'projects/test-proj/databases/(default)/documents/';
const row = (k) => ({ name: NAME + k, fields: toFields(store.get(k)), updateTime: versions.get(k), createTime: versions.get(k) });

export function install({ tokens = {} } = {}) {
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url.includes('identitytoolkit')) {
      if (url.includes('signInWithPassword')) return ok({ idToken: 'srv-token', localId: 'srv' });
      const tok = JSON.parse(opts.body || '{}').idToken;
      if (tokens[tok]) return ok({ users: [{ localId: tokens[tok] }] });
      return err(400, 'INVALID_ARGUMENT', 'INVALID_ID_TOKEN');
    }
    if (url.includes('api.telegram.org')) { try { telegrams.push(JSON.parse(opts.body || '{}').text || ''); } catch { /* */ } return ok({ ok: true }); }
    if (url.includes('firebasestorage.googleapis.com')) {
      const name = new URL(url).searchParams.get('name');
      if (typeof globalThis.__storageHook === 'function') { const r = await globalThis.__storageHook(name); if (r) return r; }
      if (opts.method === 'POST' && name) storageFiles.set(name, Buffer.from(opts.body));
      return ok({ downloadTokens: 'dltok' });
    }
    if (!url.includes('firestore.googleapis.com')) throw new Error('fetch non stubbata: ' + url);
    const path = decodeURIComponent((url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0]);
    const qs = new URL(url).searchParams;
    const method = opts.method || 'GET';
    if (typeof globalThis.__fsHook === 'function') { const r = await globalThis.__fsHook(method, path, opts); if (r) return r; }

    if (path === ':runQuery') {
      const sq = JSON.parse(opts.body || '{}').structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const ff = (sq.where || {}).fieldFilter;
      queries.push({ col, filter: ff ? { field: ff.field.fieldPath, op: ff.op, value: fromFs(ff.value) } : null });
      let keys = [...store.keys()].filter((k) => k.startsWith(col + '/') && k.split('/').length === 2);
      if (ff) {
        const want = fromFs(ff.value), f = ff.field.fieldPath;
        keys = keys.filter((k) => {
          const v = (store.get(k) || {})[f];
          if (ff.op === 'EQUAL') return v === want;
          if (ff.op === 'IN') return Array.isArray(want) && want.includes(v);
          if (ff.op === 'GREATER_THAN') return v != null && v > want;
          throw new Error('op non stubbata: ' + ff.op);
        });
      }
      keys.sort();   // ordine per nome documento, come Firestore
      const sa = sq.startAt && sq.startAt.values && sq.startAt.values[0] && sq.startAt.values[0].referenceValue;
      if (sa) { const after = sa.split('/documents/')[1]; keys = keys.filter((k) => k > after); }
      if (sq.limit) keys = keys.slice(0, sq.limit);
      return ok(keys.length ? keys.map((k) => ({ document: row(k) })) : [{ readTime: 'x' }]);
    }
    if (path === ':batchGet') {
      const docs = JSON.parse(opts.body || '{}').documents || [];
      return ok(docs.map((d) => { const k = d.split('/documents/')[1]; return store.has(k) ? { found: row(k) } : { missing: d }; }));
    }
    if (path === ':commit') {
      const writes = JSON.parse(opts.body || '{}').writes || [];
      for (const w of writes) {
        const k = (w.update ? w.update.name : w.delete).split('/documents/')[1];
        const pre = w.currentDocument || {};
        if (pre.updateTime && versions.get(k) !== pre.updateTime) return err(409, 'FAILED_PRECONDITION', 'changed');
        if (pre.exists === false && store.has(k)) return err(409, 'ALREADY_EXISTS', 'exists');
        if (pre.exists === true && !store.has(k)) return err(404, 'NOT_FOUND', 'missing');
      }
      for (const w of writes) {
        const k = w.update.name.split('/documents/')[1];
        const cur = { ...(store.get(k) || {}) }, nv = fromFields(w.update.fields);
        for (const fp of (w.updateMask && w.updateMask.fieldPaths) || Object.keys(nv)) cur[fp] = nv[fp];
        put(k, cur);
      }
      return ok({ writeResults: writes.map(() => ({})) });
    }
    if (method === 'POST') {
      const id = qs.get('documentId') || 'auto_' + (++clock);
      const k = path + '/' + id;
      if (store.has(k)) return err(409, 'ALREADY_EXISTS', 'Document already exists');
      put(k, fromFields(JSON.parse(opts.body).fields));
      return ok({ name: NAME + k });
    }
    if (method === 'PATCH') {
      if (qs.get('currentDocument.exists') === 'false' && store.has(path)) return err(400, 'FAILED_PRECONDITION', 'exists');
      const cur = { ...(store.get(path) || {}) }, nv = fromFields(JSON.parse(opts.body).fields);
      const mask = qs.getAll('updateMask.fieldPaths');
      for (const fp of mask.length ? mask : Object.keys(nv)) cur[fp] = nv[fp];
      put(path, cur);
      return ok(row(path));
    }
    if (!store.has(path)) return new Response('not found', { status: 404 });
    return ok(row(path));
  };
}

// Il testo di un PDF pdf-lib: flussi deflate, stringhe esadecimali in WinAnsi.
const WIN = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ' };
export async function pdfText(buf) {
  const zlib = await import('node:zlib');
  const s = Buffer.from(buf).toString('latin1');
  let raw = '';
  const re = /stream\r?\n([\s\S]*?)endstream/g; let m;
  while ((m = re.exec(s))) { try { raw += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') + '\n'; } catch { /* immagine */ } }
  return (raw.match(/<([0-9A-Fa-f]+)>\s*Tj/g) || [])
    .map((h) => [...Buffer.from(h.replace(/[<>\sTj]/g, ''), 'hex')].map((b) => WIN[b] || String.fromCharCode(b)).join(''))
    .join('\n');
}
