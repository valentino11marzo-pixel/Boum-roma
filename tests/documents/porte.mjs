// Le porte email: handler, parser MIME e Smistatore REALI; solo rete simulata.
import { register } from 'node:module';
import crypto from 'node:crypto';
register('../notify/loader.mjs', import.meta.url);
const imapMock = `export class ImapFlow {
  async connect() {}
  async getMailboxLock() { return { release() {} }; }
  async search(query) {
    globalThis.__porteSearches.push(query.from);
    return globalThis.__porteMail.flatMap((m, i) => m.from.toLowerCase().includes(query.from.toLowerCase()) ? [i + 1] : []);
  }
  async fetchOne(uid) { globalThis.__porteFetch(); return { source: globalThis.__porteMail[uid - 1].source }; }
  async logout() {}
}`;
const imapURL = 'data:text/javascript,' + encodeURIComponent(imapMock);
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'imapflow') return { url: ${JSON.stringify(imapURL)}, shortCircuit: true };
    return next(s, c);
  }
`), import.meta.url);

Object.assign(process.env, { HOMIE_SECRET: 'fixture', FIREBASE_API_KEY: 'fixture',
  FIREBASE_ADMIN_EMAIL: 'admin@example.test', FIREBASE_ADMIN_PASS: 'fixture',
  ANTHROPIC_API_KEY: 'fixture', GMAIL_USER: 'operator@example.test', GMAIL_APP_PASS: 'fixture' });
for (const key of ['DOC_MAIL_FROM', 'PFS_IMAP_USER', 'PFS_IMAP_PASS', 'ACCOUNTING_EMAIL', 'TELEGRAM_BOT_TOKEN']) delete process.env[key];
let fails = 0, checks = 0;
function ok(name, value) { checks++; console.log(`${value ? 'PASS' : 'FAIL'} ${name}`); if (!value) fails++; }
const DB = new Map();
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = (f) => {
  if (!f) return null;
  if ('nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });

let autoId = 0, aiHits = 0, storageHits = 0, aiFails = false, failedCollection = '';
let modelProperty = 'pA', lastPrompt = '', beforeAI = () => {};
const events = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (value, status = 200) => ({ ok: status < 400, status, json: async () => value, text: async () => JSON.stringify(value) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (u.includes('api.anthropic.com')) {
    beforeAI(); aiHits++; events.push({ type: 'ai' });
    lastPrompt = JSON.parse(opts.body).messages[0].content.find(b => b.type === 'text').text;
    if (aiFails) throw new Error('private-document-text');
    return json({ content: [{ type: 'text', text: JSON.stringify({ category: 'ape', fiscalYear: 2026,
      propertyId: modelProperty, summary: 'Fixture APE' }) }] });
  }
  if (u.includes('firebasestorage.googleapis.com')) {
    storageHits++; events.push({ type: 'storage' }); return json({ downloadTokens: 'test-token' });
  }
  if (!u.includes('firestore.googleapis.com')) throw new Error('unexpected_network');
  const body = opts.body ? JSON.parse(opts.body) : null;
  const path = decodeURIComponent(u.match(/documents\/([^?:]+)/)?.[1] || '');
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery, coll = q.from[0].collectionId, filter = q.where?.fieldFilter;
    events.push({ type: 'read', coll });
    if (coll === failedCollection) return json({ error: 'private-document-text' }, 503);
    return json([...DB].filter(([k, v]) => k.startsWith(coll + '/') && (!filter || v[filter.field.fieldPath] === dec(filter.value)))
      .slice(0, q.limit).map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'POST' || opts.method === 'PATCH') {
    const id = new URL(u).searchParams.get('documentId') || 'doc' + (++autoId);
    const key = opts.method === 'POST' ? path + '/' + id : path;
    if (opts.method === 'POST' && DB.has(key)) return json({ error: 'ALREADY_EXISTS' }, 409);
    const doc = { ...(DB.get(key) || {}), ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    events.push({ type: 'write', key, doc }); DB.set(key, doc); return json(toDoc(key, doc));
  }
  return DB.has(path) ? json(toDoc(path, DB.get(path))) : json({ error: 'NOT_FOUND' }, 404);
};
const { default: handler } = await import('../../api/documents/scan-inbox.js');
function mail(from, id, names = ['ape.pdf']) {
  const raw = [ `From: ${from}`, 'To: operator@example.test', `Message-ID: <${id}>`,
    'Date: Thu, 10 Sep 2026 10:00:00 +0200', 'Subject: Documento casa', 'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="porte"', '', '--porte',
    'Content-Type: text/plain; charset=utf-8', '', 'Ecco il documento richiesto.',
    ...names.flatMap(name => ['--porte', 'Content-Type: application/pdf',
      `Content-Disposition: attachment; filename="${name}"`, 'Content-Transfer-Encoding: base64', '',
      Buffer.from('%PDF-1.4 fixture ' + name).toString('base64')]), '--porte--', '',
  ].join('\r\n');
  return { from, source: Buffer.from(raw) };
}
function reset() {
  DB.clear(); events.length = 0; aiHits = storageHits = 0; aiFails = false; failedCollection = '';
  modelProperty = 'pA'; beforeAI = () => {};
  globalThis.__porteMail = []; globalThis.__porteSearches = []; globalThis.__porteFetch = () => {};
  DB.set('properties/pA', { title: 'Cavour', ownerId: 'ownerA' });
  DB.set('properties/pB', { title: 'Prati', ownerId: 'other' });
  DB.set('landlords/ownerA', { email: 'Owner@Example.Test', name: 'Proprietario fixture' });
  DB.set('contracts/cA', { propertyId: 'pA', landlordId: 'ownerA', tenantId: 'tenantA', status: 'active' });
}
async function run(dry = false) {
  let out, status;
  await handler({ headers: { 'x-homie-secret': 'fixture' }, query: dry ? { dry: '1' } : {} }, {
    status(c) { status = c; return this; }, json(o) { out = o; return this; },
  });
  return { status, ...out };
}
const docs = () => [...DB].filter(([key]) => key.startsWith('documents/'));
const imports = () => [...DB].filter(([key]) => key.startsWith('docImports/'));
const docKey = (id, file = 'ape.pdf') => 'documents/em_' + crypto.createHash('sha1').update(`<${id}>` + file).digest('hex');

reset();
globalThis.__porteMail = [mail('Owner@Example.Test', 'owner')];
let cleanBeforeMatch = false;
beforeAI = () => { cleanBeforeMatch = !events.some(e => e.type === 'write' || e.type === 'storage'); };
let result = await run();
ok('email in landlords → processata senza env aggiuntivo', result.status === 200 && result.counts.filed === 1);
ok('la ricerca IMAP include la relazione normalizzata', globalThis.__porteSearches.includes('owner@example.test'));
ok('NESSUNA scrittura prima del match', cleanBeforeMatch);
ok('prima scrittura del documento già sotto il SUO immobile', events.find(e => e.key === docKey('owner'))?.doc.propertyId === 'pA');
ok('email: id deterministico, origine e contratto', DB.get(docKey('owner'))?.source === 'email' && DB.get(docKey('owner'))?.contractId === 'cA');
ok('aggancio della relazione passato come hint', lastPrompt.includes('Relazione: Proprietario fixture; immobili: pA; contratti: cA.'));
const ai = aiHits, uploads = storageHits;
await run();
ok('retry email non duplica né paga modello/Storage', docs().length === 1 && aiHits === ai && storageHits === uploads);

for (const kind of ['tenant', 'landlord']) {
  reset();
  DB.delete('landlords/ownerA');
  DB.set('users/' + (kind === 'tenant' ? 'tenantA' : 'ownerA'), { role: kind, email: 'Person@Example.Test' });
  globalThis.__porteMail = [mail('PERSON@example.test', 'user-' + kind)];
  result = await run();
  ok(`users ${kind}: relazione per email → suo immobile`, result.counts.filed === 1 && docs()[0]?.[1].propertyId === 'pA');
}
for (const kind of ['tenant', 'landlord']) {
  reset(); DB.delete('landlords/ownerA');
  DB.set('contracts/cA', { propertyId: 'pA', [kind + 'Email']: 'Person@Example.Test', status: 'active' });
  globalThis.__porteMail = [mail('PERSON@example.test', 'contract-' + kind)];
  result = await run();
  ok(`contracts ${kind}Email: relazione senza profilo → suo contratto`, result.counts.filed === 1 && docs()[0]?.[1].contractId === 'cA');
}

reset();
DB.set('properties/pB', { title: 'Prati', ownerId: 'ownerA' });
modelProperty = null;
globalThis.__porteMail = [mail('owner@example.test', 'many')];
await run();
ok('due immobili: porta passa TUTTI i candidati, non indovina', docs()[0]?.[1].needsFiling === true && docs()[0]?.[1].relatedPropertyIds?.sort().join(',') === 'pA,pB');

reset();
DB.set('landlords/unlinked', { email: 'unlinked@example.test' });
globalThis.__porteMail = [mail('unlinked@example.test', 'unlinked')];
await run();
ok('relazione senza immobili: processata ma MAI sotto casa altrui', docs().length === 1 && docs()[0][1].propertyId === null && docs()[0][1].needsFiling === true);

reset();
DB.set('users/admin', { role: 'admin', email: 'stranger@example.test' });
globalThis.__porteMail = [mail('"operator@example.test" <stranger@example.test>', 'unknown')];
result = await run();
ok('ignoto restituito da IMAP: non processato, neanche se user admin', result.counts.emails === 0 && aiHits === 0 && docs().length === 0 && imports().length === 0);
ok('ignoto: nessuna scrittura in archivio né Storage', !events.some(e => e.type === 'storage' || e.key?.startsWith('documents/')));

reset();
globalThis.__porteMail = [mail('owner@example.test, stranger@example.test', 'multiple-from')];
result = await run();
ok('From multipli: nessuna fiducia presunta', result.counts.emails === 0 && aiHits === 0 && docs().length === 0);

reset();
globalThis.__porteMail = [mail('operator@example.test', 'operator')];
result = await run();
ok('indirizzo operatore continua a funzionare', result.counts.filed === 1 && docs()[0]?.[1].propertyId === 'pA');

reset();
globalThis.__porteMail = [mail('owner@example.test', 'dry')];
result = await run(true);
ok('dry: nessuna scrittura, nessun modello o upload', result.counts.filed === 1 && !events.some(e => ['write', 'ai', 'storage'].includes(e.type)));

reset();
globalThis.__porteMail = [mail('owner@example.test', 'failure')];
aiFails = true;
await run();
ok('errore modello: nessun docImports che impedisca il retry', imports().length === 0 && docs().length === 0);
aiFails = false;
await run();
ok('retry dopo errore: il documento viene archiviato', docs().length === 1 && imports().length === 1);

reset();
globalThis.__porteMail = [mail('owner@example.test', 'partial', ['a.pdf', 'b.pdf'])];
beforeAI = () => { aiFails = aiHits === 1; };
await run();
ok('fallimento secondo allegato: il primo resta, email ritentabile', docs().length === 1 && imports().length === 0);
beforeAI = () => {}; aiFails = false;
await run();
ok('retry parziale: due documenti totali, nessun doppione', docs().length === 2 && imports().length === 1 && aiHits === 3);

reset();
globalThis.__porteMail = [mail('owner@example.test', 'budget')];
const realNow = Date.now;
globalThis.__porteFetch = () => { const t = realNow(); Date.now = () => t + 25_000; };
try { result = await run(); } finally { Date.now = realNow; }
ok('budget esaurito prima del modello: rinviato senza perdere email', aiHits === 0 && docs().length === 0 && imports().length === 0 && result.counts.deferred === 1);

reset();
failedCollection = 'users';
globalThis.__porteMail = [mail('"operator@example.test" <owner@example.test>', 'failed-read')];
const warn = console.warn, warnings = [];
console.warn = (...args) => warnings.push(args.join(' '));
try { result = await run(); } finally { console.warn = warn; }
ok('lettura relazioni fallita: non archivia con un elenco parziale', result.counts.emails === 0 && docs().length === 0);
ok('lettura fallita: log senza contenuti privati', !warnings.join('').includes('private-document'));

reset();
for (let i = 2; i < 200; i++) DB.set('properties/extra' + i, { title: 'Fixture', ownerId: 'other' });
globalThis.__porteMail = [mail('owner@example.test', 'catalog-limit')];
await run();
ok('catalogo al tetto dello Smistatore: nessun default su lista potenzialmente troncata', docs()[0]?.[1].needsFiling === true);

reset();
globalThis.__porteMail = [mail('owner@example.test', 'same-name', ['ape.pdf', 'ape.pdf'])];
await run();
ok('due allegati omonimi nella stessa email: due documenti distinti', docs().length === 2);
await run();
ok('retry di allegati omonimi: nessun doppione', docs().length === 2 && aiHits === 2);

console.log(`${checks} check, ${fails} falliti`);
process.exit(fails ? 1 : 0);
