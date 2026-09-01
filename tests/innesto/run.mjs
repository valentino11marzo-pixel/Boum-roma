// tests/innesto/run.mjs
// L'Innesto moriva su "errore 413" con un PDF vero in mano: il body di una
// function Vercel ha un tetto di PIATTAFORMA di 4,5 MB, quindi un PDF
// scansionato sopra ~3,3 MB (base64 +33%) veniva respinto dall'edge PRIMA
// che l'handler partisse — il sizeLimit dichiarato nel file e il tetto
// client di 8 MB erano promesse che nessuno manteneva.
//
// La cura: le foto si riducono client-side (adeCompressImage, una copia
// sola), e un file che resta grande TRANSITA dallo Storage — all'API va
// solo l'URL, il server scarica i byte dove il tetto non esiste, e il
// transito si cancella a lettura finita. L'URL è accettato SOLO se punta
// al nostro Storage: i byte finiscono ad Anthropic, e un URL libero
// trasformerebbe l'endpoint in un proxy verso host arbitrari.
//
// Qui gira l'HANDLER VERO: sono finte solo la rete (Identity Toolkit,
// Firestore, Storage, Anthropic) e le credenziali.
//
//   node tests/innesto/run.mjs

import { readFileSync } from 'node:fs';

process.env.ANTHROPIC_API_KEY = 'sk-test';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@boom';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';

// ── store in memoria ───────────────────────────────────────────────────────
const USERS = new Map([
  ['admin_1',  { role: 'admin',    email: 'valentino@boom-rome.com' }],
  ['tenant_1', { role: 'tenant',   email: 'inquilino@example.com' }],
]);

const PDF_BYTES = Buffer.from('%PDF-1.4 SIMETO12 TESTA OYKU — contratto di locazione transitoria');
const HUGE_BYTES = Buffer.alloc(8 * 1024 * 1024 + 1, 65);

const OUR_STORAGE = 'https://firebasestorage.googleapis.com/v0/b/test/o/documents%2Fadmin_1%2Finnesto-tmp%2F1_Simeto12.pdf?alt=media&token=t';
const HUGE_URL    = 'https://firebasestorage.googleapis.com/v0/b/test/o/documents%2Fadmin_1%2Finnesto-tmp%2F2_enorme.pdf?alt=media&token=t';

const toF = (v) => (typeof v === 'string' ? { stringValue: v } : { nullValue: null });
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

let anthCalls = [];
let storageFetches = 0;
let foreignFetches = 0;

// La proposta finta porta anche campi INVENTATI: la whitelist deve fermarli.
const AI_REPLY = JSON.stringify({
  landlord: { name: 'Anna Testa', email: 'anna@example.com', segreto: 'mai' },
  contract: { type: 'transitorio', rent: 1100, startDate: '2026-09-01', hacker: 'x' },
  confidence: 88,
  notes: ['il deposito non è indicato'],
});

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('accounts:signInWithPassword')) return json({ idToken: 'ADMIN_TOKEN' });
  if (u.includes('accounts:lookup')) {
    const { idToken } = JSON.parse(opts.body || '{}');
    if (!USERS.has(idToken)) return json({ error: 'INVALID_ID_TOKEN' }, 400);
    return json({ users: [{ localId: idToken, email: USERS.get(idToken).email }] });
  }
  if (u.includes('firestore.googleapis.com')) {
    const path = decodeURIComponent(u.split('/documents/')[1] || '').split('?')[0];
    const uid = path.replace('users/', '');
    if (!USERS.has(uid)) return json({ error: { status: 'NOT_FOUND' } }, 404);
    const p = USERS.get(uid);
    return json({ name: path, fields: { role: toF(p.role), email: toF(p.email) } });
  }
  if (u.startsWith('https://firebasestorage.googleapis.com/')) {
    storageFetches++;
    const bytes = u.includes('enorme') ? HUGE_BYTES : PDF_BYTES;
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  }
  if (u.includes('api.anthropic.com')) {
    anthCalls.push({ headers: opts.headers, body: JSON.parse(opts.body || '{}') });
    return json({ content: [{ type: 'text', text: AI_REPLY }] });
  }
  // Qualunque altro host è un buco: si conta e si nega.
  foreignFetches++;
  return new Response('nope', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
};

const { default: handler } = await import('../../api/portal/ingest.js');

function mkRes() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

async function call(token, body) {
  anthCalls = []; storageFetches = 0; foreignFetches = 0;
  const req = {
    method: 'POST',
    headers: token === null ? {} : { authorization: 'Bearer ' + token },
    body: body || {},
  };
  const res = mkRes();
  await handler(req, res);
  return { res, anth: anthCalls, storage: storageFetches, foreign: foreignFetches };
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

console.log('\n\x1b[1mLa porta\x1b[0m');
let r = await call(null, { text: 'contratto' });
check('senza Authorization → 401', r.res.code === 401, `ho avuto ${r.res.code}`);
check('…e Anthropic non viene mai chiamato', r.anth.length === 0);

r = await call('tenant_1', { text: 'contratto' });
check('un inquilino loggato → 403', r.res.code === 403, `ho avuto ${r.res.code}`);
check('…e non spende un token', r.anth.length === 0);

r = await call('admin_1', {});
check('senza materiale → 400 prima di spendere', r.res.code === 400 && r.anth.length === 0, `ho avuto ${r.res.code}`);

console.log('\n\x1b[1mIl testo inline (la via di sempre)\x1b[0m');
r = await call('admin_1', { text: 'Contratto transitorio, Anna Testa, €1.100/mese' });
check('admin + testo → 200', r.res.code === 200, JSON.stringify(r.res.body));
check('…con la chiave del server', r.anth[0]?.headers?.['x-api-key'] === 'sk-test');
check('…la whitelist ferma i campi inventati',
  r.res.body?.proposal?.landlord?.name === 'Anna Testa'
  && !('segreto' in (r.res.body?.proposal?.landlord || {}))
  && !('hacker' in (r.res.body?.proposal?.contract || {})),
  JSON.stringify(r.res.body?.proposal));

console.log('\n\x1b[1mIl transito da Storage (la cura del 413)\x1b[0m');
r = await call('admin_1', { fileUrl: OUR_STORAGE, mediaType: 'application/pdf' });
check('fileUrl del NOSTRO Storage → 200', r.res.code === 200, JSON.stringify(r.res.body));
check('…i byte scaricati sono ESATTAMENTE quelli che vanno ad Anthropic', (() => {
  const doc = (r.anth[0]?.body?.messages?.[0]?.content || []).find((c) => c.type === 'document');
  return doc && doc.source?.data === PDF_BYTES.toString('base64')
    && doc.source?.media_type === 'application/pdf';
})());
check('…lo Storage è stato letto una volta', r.storage === 1, String(r.storage));

r = await call('admin_1', { fileUrl: OUR_STORAGE });
check('senza mediaType dichiarato vale il content-type dello Storage', r.res.code === 200
  && (r.anth[0]?.body?.messages?.[0]?.content || []).some((c) => c.type === 'document'),
  `ho avuto ${r.res.code}`);

console.log('\n\x1b[1mMai un proxy verso host arbitrari\x1b[0m');
r = await call('admin_1', { fileUrl: 'https://evil.example.com/leak.pdf', mediaType: 'application/pdf' });
check('host estraneo → 400 bad_file_url', r.res.code === 400 && r.res.body?.error === 'bad_file_url',
  `${r.res.code} ${r.res.body?.error}`);
check('…l\'host estraneo non viene MAI contattato', r.foreign === 0, String(r.foreign));
check('…e non si spende un token', r.anth.length === 0);

r = await call('admin_1', { fileUrl: 'http://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media', mediaType: 'application/pdf' });
check('http nudo (non https) → 400 anche sul nostro host', r.res.code === 400 && r.foreign === 0 && r.storage === 0,
  `${r.res.code} foreign=${r.foreign} storage=${r.storage}`);

console.log('\n\x1b[1mI tetti restano onesti\x1b[0m');
r = await call('admin_1', { fileUrl: HUGE_URL, mediaType: 'application/pdf' });
check('file oltre 8 MB via Storage → 413 file_too_large', r.res.code === 413 && r.res.body?.error === 'file_too_large',
  `${r.res.code} ${r.res.body?.error}`);
check('…senza spendere un token', r.anth.length === 0);

r = await call('admin_1', { base64: 'A'.repeat(8 * 1024 * 1024 + 1), mediaType: 'application/pdf' });
check('base64 inline oltre il tetto → 413', r.res.code === 413, `ho avuto ${r.res.code}`);

r = await call('admin_1', { fileUrl: OUR_STORAGE, mediaType: 'application/zip' });
check('formato fuori whitelist → 400 anche via fileUrl', r.res.code === 400
  && r.res.body?.error === 'unsupported_media_type' && r.anth.length === 0,
  `${r.res.code} ${r.res.body?.error}`);

// ═══ L'APPLY VERO — "Crea nel portale" deve creare DAVVERO ═══════════════
// Il 30/08 l'operatore ha premuto Crea, letto "Innesto completato" e trovato
// l'archivio senza contratto: l'apply lo salta quando nella proposta manca
// l'immobile o l'inquilino, ma il riepilogo lo PROMETTEVA comunque e il
// toast finale non diceva niente. Qui si estrae l'innestoApply REALE (con il
// generateMonthlyPayments reale) e lo si guida su un Firestore in memoria.
console.log('\n\x1b[1mL\'apply crea davvero (funzioni reali su Firestore finto)\x1b[0m');

const appSrc = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
function extract(name) {
  const at = appSrc.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('non trovo ' + name);
  const start = appSrc.lastIndexOf('\n', at) + 1;   // prende anche l'eventuale async
  let i = appSrc.indexOf('{', at), depth = 0;
  for (; i < appSrc.length; i++) {
    if (appSrc[i] === '{') depth++;
    else if (appSrc[i] === '}') { depth--; if (!depth) break; }
  }
  return appSrc.slice(start, i + 1);
}

const applyWrites = [];
let applyAutoId = 0;
const fakeDb = {
  collection: (cname) => ({
    add: async (data) => { const id = cname.slice(0, 3) + '_' + (++applyAutoId); applyWrites.push({ op: 'add', c: cname, id, data }); return { id }; },
    doc: (id) => ({
      _path: cname + '/' + id,
      update: async (data) => { applyWrites.push({ op: 'update', c: cname, id, data }); },
    }),
    where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
  }),
  batch: () => ({
    set(ref, data) { applyWrites.push({ op: 'batch.set', path: ref._path, data }); },
    commit: async () => {},
  }),
};
const applyToasts = [];
const S = { users: [], properties: [], contracts: [], landlords: [], profile: { id: 'admin', role: 'admin' } };
const { createRequire } = await import('node:module');
const requireCjs = createRequire(import.meta.url);
const makeApply = new Function(
  'window', 'firebase', 'db', 'S', 'toast', 'renderPage', 'buildNav', 'loadDataFresh', 'logActivity', 'localStorage', 'console', '_innesto',
  extract('generateMonthlyPayments') + '\n' + extract('innestoReset') + '\n' + extract('innestoApply') + '\nreturn innestoApply;'
);
async function runApply(proposal, seed = {}, links = {}) {
  applyWrites.length = 0; applyToasts.length = 0; applyAutoId = 0;
  S.users = seed.users || []; S.properties = seed.properties || [];
  S.contracts = []; S.landlords = seed.landlords || [];
  const innesto = { proposal, links, notes: [], confidence: 90, busy: false, file: null, matches: null };
  const fn = makeApply(
    { BOOM_DATAOPS: requireCjs('../../js/dataops-engine.js') },
    { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
    fakeDb, S, (...a) => applyToasts.push(a), () => {}, () => {}, async () => {}, async () => {},
    { removeItem: () => {}, getItem: () => null, setItem: () => {} },
    { log: () => {}, warn: () => {}, error: () => {} },
    innesto
  );
  await fn();
  const by = {};
  applyWrites.forEach((w) => { const k = w.op === 'batch.set' ? w.path.split('/')[0] : w.c; by[k] = (by[k] || 0) + (w.op === 'update' ? 0 : 1); });
  return { by, writes: [...applyWrites], toasts: [...applyToasts] };
}

const FULL = {
  landlord: { name: 'Anna Rossi', email: 'anna@example.com' },
  tenant: { name: 'Oyku Testa', email: 'oyku@example.com' },
  property: { name: 'Via Simeto 12', address: 'Via Simeto 12, Roma', rent: 1100 },
  contract: { type: 'transitorio', startDate: '2026-09-01', endDate: '2027-08-31', rent: 1100, deposit: 2200, paymentDay: 5, installmentMonths: 1 },
};

let a = await runApply(structuredClone(FULL));
check('proposta completa → contratto E piano rate scritti',
  a.by.contracts === 1 && a.by.payments === 12 && a.by.users === 2 && a.by.properties === 1,
  JSON.stringify(a.by));
check('…e il toast lo dice', a.toasts.some((t) => t[0] === 'success' && /contratto/.test(t[2] || '')));

const senzaTenant = structuredClone(FULL); delete senzaTenant.tenant;
a = await runApply(senzaTenant);
check('senza inquilino il contratto NON nasce (niente rate orfane)',
  !a.by.contracts && !a.by.payments, JSON.stringify(a.by));
check('…ma il salto NON è più muto: il toast nomina la gamba mancante',
  a.toasts.some((t) => t[0] === 'warning' && /Contratto NON creato/.test(t[1]) && /inquilino/.test(t[2])),
  JSON.stringify(a.toasts));

a = await runApply(structuredClone(FULL), { landlords: [{ id: 'll_anna', name: 'Anna Rossi', email: 'anna@example.com' }] });
check('proprietario già in landlords → NESSUN doppione (il pool è quello della card)',
  a.by.users === 1 && a.writes.some((w) => w.c === 'contracts' && w.op === 'add' && w.data.landlordId === 'll_anna'),
  JSON.stringify(a.by));

// IL CASO VIA SIMETO (30/08): il PDF non porta inquilino né immobile, ma
// ENTRAMBI esistono in anagrafica (creati da una corsa precedente). Con gli
// agganci del fantasma il contratto nasce sui record esistenti — zero
// doppioni, e le rate puntano agli id giusti.
a = await runApply({ contract: structuredClone(FULL.contract) }, {
  users: [{ id: 'u_ten', name: 'Oyku Testa', email: 'oyku@example.com', role: 'tenant' }],
  properties: [{ id: 'p_sim', name: 'Via Simeto 12', address: 'Via Simeto 12, Roma', rent: 1100 }],
}, { tenant: 'u_ten', property: 'p_sim' });
check('CASO VIA SIMETO: contratto dagli agganci d\'archivio, senza sezioni nella proposta',
  a.by.contracts === 1 && a.by.payments === 12 && !a.by.users && !a.by.properties,
  JSON.stringify(a.by));
check('…con gli id GIUSTI dell\'archivio', (() => {
  const c = a.writes.find((w) => w.c === 'contracts' && w.op === 'add');
  return c && c.data.tenantId === 'u_ten' && c.data.propertyId === 'p_sim';
})());
check('…e l\'immobile agganciato viene marcato affittato',
  a.writes.some((w) => w.c === 'properties' && w.op === 'update' && w.id === 'p_sim' && w.data.availabilityStatus === 'rented'));

// L'aggancio ESPLICITO vince sul match riderivato: se l'operatore ha scelto
// un immobile diverso da quello che il nome suggerirebbe, comanda lui.
a = await runApply(structuredClone(FULL), {
  users: [{ id: 'u_ten', name: 'Oyku Testa', email: 'oyku@example.com', role: 'tenant' }],
  properties: [
    { id: 'p_sim', name: 'Via Simeto 12', address: 'Via Simeto 12, Roma', rent: 1100 },
    { id: 'p_altro', name: 'Via Simeto 12 int. 7', address: 'Via Simeto 12, Roma', rent: 1100 },
  ],
}, { property: 'p_altro' });
check('l\'aggancio scelto dall\'operatore vince sul match automatico', (() => {
  const c = a.writes.find((w) => w.c === 'contracts' && w.op === 'add');
  return c && c.data.propertyId === 'p_altro' && !a.by.properties;
})());

console.log('\n\x1b[1mLe giunzioni sulla sorgente\x1b[0m');
const app = appSrc;
const api = readFileSync(new URL('../../api/portal/ingest.js', import.meta.url), 'utf8');

check('il riepilogo promette il contratto SOLO con entrambe le gambe',
  /p\.contract && !contractLegs\.length\) willCreate\.push\('contratto/.test(app));
check('…e la gamba mancante ha una card visibile, non un silenzio',
  /Contratto NON creabile/.test(app));
check('…ma un aggancio dall\'archivio VALE come gamba (il fantasma sblocca)',
  /!p\.property && !_innesto\.links\.property\) contractLegs/.test(app)
  && /!p\.tenant && !_innesto\.links\.tenant\) contractLegs/.test(app));
check('la sezione mancante ha il fantasma: select dall\'archivio + compila a mano',
  /innestoPick\(/.test(app) && /innestoAddSection\(/.test(app) && /scegli dall'archivio/.test(app));
check('una seconda lettura INTEGRA la proposta aperta (mergeProposal, mai sovrascrivere)',
  /mergeProposal\(_innesto\.proposal, fresh\)/.test(app) && /Leggi e integra/.test(app));
check('…e le derivazioni girano dopo ogni lettura (deposito da mensilità × canone)',
  /deriveProposal\(next\)/.test(app) || /deriveProposal\(/.test(app));
check('a contratto creato si atterra sui Contratti, non su una pagina vuota',
  /if \(madeContract\) goTo\('contracts'\)/.test(app));
check('una lettura vuota non butta via la proposta aperta',
  !/_innesto\.notes = data\.notes \|\| \[\]; _innesto\.proposal = null;/.test(app));

const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
check('il motore dataops è network-first nel SW (una copia stantia divergerebbe dalla pagina)',
  /url\.pathname === '\/js\/dataops-engine\.js'/.test(sw));
check('…e la cache del SW è stata versionata oltre la v17', !/boom-v17/.test(sw));

const capM = /INNESTO_INLINE_MAX\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(app);
check('il tetto inline del client sta SOTTO i 4,5 MB di piattaforma (base64 +33%)',
  capM && Number(capM[1]) * 1024 * 1024 * (4 / 3) < 4.5 * 1024 * 1024,
  capM ? `${capM[1]} MB raw` : 'INNESTO_INLINE_MAX assente');
check('la scelta inline/transito passa dal tetto', /blob\.size\s*<=\s*INNESTO_INLINE_MAX/.test(app));
check('le foto si riducono PRIMA della scelta (adeCompressImage, una copia sola)', (() => {
  const fn = app.slice(app.indexOf('async function innestoAnalyze'));
  const body = fn.slice(0, fn.indexOf('\n    }\n'));
  return body.indexOf('adeCompressImage') !== -1
    && body.indexOf('adeCompressImage') < body.indexOf('INNESTO_INLINE_MAX');
})());
check('il transito va nella cartella PROPRIA (documents/<uid>/innesto-tmp/)',
  /storage\.ref\('documents\/'\s*\+\s*auth\.currentUser\.uid\s*\+\s*'\/innesto-tmp\//.test(app));
check('…e si CANCELLA a lettura finita (anche su errore: sta nel finally)', (() => {
  const fn = app.slice(app.indexOf('async function innestoAnalyze'));
  const fin = fn.slice(fn.indexOf('} finally {'));
  return /transitRef\.delete\(\)/.test(fin.slice(0, 400));
})());
check('la pagina dice del transito invece di promettere il falso',
  /transita dal tuo Storage/.test(app) && !/Non viene salvato da nessuna parte finché non confermi/.test(app));
check('il server inchioda l\'host del fileUrl al nostro Storage',
  /u\.hostname\s*!==\s*'firebasestorage\.googleapis\.com'/.test(api));

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mIl PDF grande passa da Storage, l\'apply crea davvero, e un contratto saltato non è mai muto.\x1b[0m');
