// tests/dossier/run.mjs
// Il fascicolo ARPE carica i documenti dell'immobile in Storage sotto
// credenziali ADMIN — cioè il server scavalca le storage.rules per conto di
// chi chiama. Se l'autorizzazione a livello di oggetto sbaglia, un
// proprietario può scrivere nel fascicolo di un immobile altrui.
//
// Qui gira l'HANDLER VERO (auth reale, _lib.js reale): sono finte solo la
// rete e le credenziali — Firestore REST, Identity Toolkit e Storage sono
// serviti da uno stub di globalThis.fetch con uno store in memoria.
//
//   node tests/dossier/run.mjs

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@boom';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';

// ── store in memoria ───────────────────────────────────────────────────────
const DB = new Map();
const reset = () => {
  DB.clear();
  DB.set('properties/p_mine',   { name: 'Via Cavour 12', ownerId: 'owner_1' });
  DB.set('properties/p_theirs', { name: 'Via Giulia 3',  ownerId: 'owner_2' });
  DB.set('users/admin_1', { role: 'admin',    email: 'valentino@boom-rome.com' });
  DB.set('users/owner_1', { role: 'landlord', email: 'anna@example.com' });
  DB.set('users/owner_2', { role: 'landlord', email: 'bruno@example.com' });
};

// ── Firestore REST ⇄ oggetti JS (solo i tipi che l'endpoint usa) ──────────
const toF = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toF(x)])) } };
  return { stringValue: String(v) };
};
const fromF = (f) => {
  if (!f) return null;
  if ('nullValue' in f) return null;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('stringValue' in f) return f.stringValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(fromF);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, fromF(x)]));
  return null;
};
const toFields = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, toF(v)]));
const fromFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromF(v)]));

let uploads = [];
let CURRENT_UID = null;          // chi presenta il token in questo test

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  // ── login admin (getAdminToken) ──
  if (u.includes('accounts:signInWithPassword')) return json({ idToken: 'ADMIN_TOKEN' });

  // ── verifica del token del chiamante (requireRole) ──
  if (u.includes('accounts:lookup')) {
    const { idToken } = JSON.parse(opts.body || '{}');
    if (!idToken || !DB.has('users/' + idToken)) return json({ error: 'x' }, 400);
    return json({ users: [{ localId: idToken, email: (DB.get('users/' + idToken) || {}).email }] });
  }

  // ── Storage ──
  if (u.includes('firebasestorage.googleapis.com')) {
    uploads.push({
      url: u,
      path: decodeURIComponent((u.split('?name=')[1] || '')),
      bytes: opts.body ? opts.body.length : 0,
      contentType: (opts.headers || {})['Content-Type'],
      auth: (opts.headers || {}).Authorization,
    });
    return json({ downloadTokens: 'tok-123' });
  }

  // ── Firestore documents ──
  if (u.includes('firestore.googleapis.com')) {
    if (u.includes('/activityLog')) return json({ name: 'activityLog/x', fields: {} });
    const path = decodeURIComponent(u.split('/documents/')[1] || '').split('?')[0];
    const method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET') {
      if (!DB.has(path)) return json({ error: { status: 'NOT_FOUND' } }, 404);
      return json({ name: path, fields: toFields(DB.get(path)) });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(opts.body || '{}');
      DB.set(path, { ...(DB.get(path) || {}), ...fromFields(body.fields) });
      return json({ name: path, fields: toFields(DB.get(path)) });
    }
  }
  throw new Error('fetch non previsto nel test: ' + u);
};

const { default: handler } = await import('../../api/properties/dossier.js');

// ── finto res ──────────────────────────────────────────────────────────────
function mkRes() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = () => {};
  return r;
}

const PDF = Buffer.from('%PDF-1.4 finto').toString('base64');
async function call(uid, body, { fresh = true } = {}) {
  if (fresh) reset();
  uploads = [];
  // readJson() preferisce req.body quando c'e: e' la stessa cosa che fa
  // Vercel con un POST application/json.
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer ' + uid, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
  const res = mkRes();
  await handler(req, res);
  return { res, uploads, DB };
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

console.log('\n\x1b[1mAutorizzazione\x1b[0m');
let r = await call('nessuno', { propertyId: 'p_mine', slot: 'visura', base64: PDF });
check('token non valido → 401', r.res.code === 401, `ho avuto ${r.res.code}`);

r = await call('owner_1', { propertyId: 'p_theirs', slot: 'visura', base64: PDF });
check('proprietario su immobile ALTRUI → 403', r.res.code === 403, `ho avuto ${r.res.code}`);
check('…e non ha caricato nulla', r.uploads.length === 0);
check('…e non ha scritto sul documento', !r.DB.get('properties/p_theirs').dossier);

r = await call('owner_1', { propertyId: 'p_mine', slot: 'visura', base64: PDF });
check('proprietario sul PROPRIO immobile → 200', r.res.code === 200, JSON.stringify(r.res.body));

r = await call('admin_1', { propertyId: 'p_theirs', slot: 'ape', base64: PDF });
check('admin su qualsiasi immobile → 200', r.res.code === 200, JSON.stringify(r.res.body));

console.log('\n\x1b[1mValidazione input\x1b[0m');
r = await call('admin_1', { propertyId: 'p_mine', slot: 'contratto', base64: PDF });
check('slot inventato → 400', r.res.code === 400);
r = await call('admin_1', { propertyId: 'p_ghost', slot: 'ape', base64: PDF });
check('immobile inesistente → 404', r.res.code === 404, `ho avuto ${r.res.code}`);
r = await call('admin_1', { propertyId: 'p_mine', slot: 'ape', base64: '' });
check('file vuoto → 400', r.res.code === 400);
r = await call('admin_1', { propertyId: 'p_mine', slot: 'ape', base64: Buffer.alloc(16 * 1024 * 1024).toString('base64') });
check('oltre 15MB → 413', r.res.code === 413, `ho avuto ${r.res.code}`);

console.log('\n\x1b[1mI quattro slot ARPE\x1b[0m');
for (const slot of ['visura', 'planimetria', 'ape', 'delega']) {
  r = await call('admin_1', { propertyId: 'p_mine', slot, base64: PDF });
  const saved = (r.DB.get('properties/p_mine').dossier || {})[slot];
  check(`slot "${slot}" salvato con url`, r.res.code === 200 && !!saved && !!saved.url);
}

console.log('\n\x1b[1mDove finisce il file\x1b[0m');
r = await call('admin_1', { propertyId: 'p_mine', slot: 'visura', base64: PDF, name: '../../etc/passwd' });
const up = r.uploads[0] || {};
check('sale sotto property-docs/<id>/', /^property-docs\/p_mine\//.test(up.path || ''), up.path);
const leaf = (up.path || '').replace('property-docs/p_mine/', '');
check('il nome file non contiene separatori di percorso', !leaf.includes('/'), up.path);
check('il file non puo uscire dalla cartella dell immobile',
  (up.path || '').startsWith('property-docs/p_mine/')
  && !(up.path || '').split('/').slice(2).some(seg => seg === '..'), up.path);
check('usa il token ADMIN, non quello del chiamante', up.auth === 'Bearer ADMIN_TOKEN', up.auth);

console.log('\n\x1b[1mSlot già pieni\x1b[0m');
reset();
DB.set('properties/p_mine', { name: 'Via Cavour 12', ownerId: 'owner_1',
  dossier: { ape: { url: 'https://vecchio', name: 'ape-2024' } } });
{
  const rr = await call('admin_1', { propertyId: 'p_mine', slot: 'visura', base64: PDF }, { fresh: false });
  const d = (DB.get('properties/p_mine').dossier) || {};
  check('la richiesta va a buon fine', rr.res.code === 200, JSON.stringify(rr.res.body));
  check('caricare la visura non cancella l\'APE già presente', d.ape && d.ape.url === 'https://vecchio');
  check('…e la visura viene aggiunta accanto', !!(d.visura && d.visura.url));
}

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mIl fascicolo ARPE non scrive mai dove non deve.\x1b[0m');
