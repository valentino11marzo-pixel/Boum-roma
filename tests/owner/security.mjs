// tests/owner/security.mjs — LA CHIUSURA DEL 22/09/2026 (pacchetto E).
//
// L'Archivio del Proprietario (/proprietario) nasce insieme a una chiusura:
// il proprietario non legge più NULLA dal browser, e gli endpoint che gli
// davano i link dell'inquilino, i documenti di altri o il certificato Apple
// di produzione diventano dello staff. Questa suite tiene le due metà:
//
//   §1 firestore.rules — nessun ramo landlord nelle letture di properties,
//      contracts, payments, maintenance, documents, conversations, messages;
//      l'helper ownsProperty() non esiste più; il "proprio documento" non
//      vale per il landlord (errata E3.1). Restano users/invoices/
//      documentShares/taxPacks.
//   §2 storage.rules — documents/maintenance/payment-proofs senza landlord;
//      passes scritti solo dall'admin.
//   §3 gli HANDLER VERI (tests/owner/_harness.mjs: Firestore e Storage in
//      memoria, si finge solo la rete): profile/link, sign/send-link,
//      documents/{share,qa,ocr}, notify/send, photos/enhance, portal/ingest,
//      generate-pass, preagreement/{convert,send-sign,resolve,create,notify}
//      → un landlord (e un owner) riceve 403 SENZA scrivere niente e senza
//      spendere un token; l'admin passa la porta (controllo positivo: un 403
//      ovunque passerebbe per sicurezza anche se l'handler fosse rotto).
//   §4 js/portal-app.js — il landlord esce verso /proprietario PRIMA di
//      loadData/showApp/listener, la cache locale buttata, i marcatori
//      che altre suite tagliano intatti (errata E6).
//   §5 le quattro pagine dello staff MONTATE (vm + DOM permissivo +
//      Firestore che registra): col profilo landlord nessuna .collection(),
//      il cartello verso /proprietario; con l'admin la pagina legge
//      (controllo positivo); i requisiti di tests/ritorno intatti.
//   §6 vercel.json, pagine ritirate, robots, seo-config.
//
// Le regole di testo (§1 §2 §4 §5) si verificano ANCHE per mutazione qui
// dentro: si rimette il difetto nel testo e il controllo deve dire rosso —
// un controllo che non morde non è un controllo. Gli handler sono stati
// verificati per mutazione a mano (rimesso ['admin','owner','landlord'] in
// profile/link, share e convert; tolta la guardia `landlord_link_only` in
// send-link; tolta la guardia del tipo in generate-pass: rosso, ripristinato).
//
//   node tests/owner/security.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createHarness } from './_harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const R = (f) => readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0, failed = 0; const bad = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; bad.push(name); console.log('  ✗ ' + name); }
}
const section = (t) => console.log('\n' + t);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:"'])\/\/[^\n]*/g, '$1');

// ═════════════════════════════════════════════════════════════════════════
// §1 firestore.rules
// ═════════════════════════════════════════════════════════════════════════
// Il blocco `match /<coll>/{x} { … }` con le graffe bilanciate.
function matchBlock(rules, coll) {
  const re = new RegExp('match\\s+/' + coll + '(?:/\\{[^}]*\\})+\\s*\\{');
  const m = re.exec(rules); if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  while (i < rules.length && depth) { const c = rules[i++]; if (c === '{') depth++; else if (c === '}') depth--; }
  return rules.slice(m.index, i);
}
// Il testo della sola `allow read` (fino al `;`).
function readClause(block) {
  const m = /allow\s+read[^:]*:\s*if([\s\S]*?);/.exec(block || '');
  return m ? m[1] : null;
}
const LOCKED = ['properties', 'contracts', 'payments', 'maintenance', 'documents', 'conversations', 'messages'];
function rulesViolations(rulesText) {
  const code = stripComments(rulesText);
  const v = [];
  if (/function\s+ownsProperty\s*\(/.test(code)) v.push('helper ownsProperty() presente');
  if (/ownsProperty\s*\(/.test(code)) v.push('ownsProperty( usato');
  for (const coll of LOCKED) {
    const rc = readClause(matchBlock(code, coll));
    if (rc == null) { v.push(coll + ': allow read non trovata'); continue; }
    // L'unico isLandlord() ammesso è la NEGAZIONE sul proprio documento
    // (errata E3.1): `resource.data.userId == uid() && !isLandlord()`.
    const positive = rc.replace(/!\s*isLandlord\(\)/g, '');
    if (/isLandlord\(\)/.test(positive)) v.push(coll + ': ramo landlord in lettura');
    if (/assignedLandlordId/.test(rc)) v.push(coll + ': assignedLandlordId in lettura');
    if (/resource\.data\.ownerId\s*==\s*uid\(\)/.test(rc)) v.push(coll + ': ownerId == uid() in lettura');
  }
  // documents: il "proprio documento" solo per chi NON è landlord.
  const drc = readClause(matchBlock(code, 'documents')) || '';
  const ownBranches = drc.match(/[^|]*resource\.data\.userId\s*==\s*uid\(\)[^|]*/g) || [];
  if (!ownBranches.length || ownBranches.some(b => !/!\s*isLandlord\(\)/.test(b))) v.push('documents: proprio documento leggibile da un landlord');
  // Il ramo tenant dei condivisi resta (l'inquilino non perde niente).
  if (!/isTenant\(\)[\s\S]*currentContractId[\s\S]*tenantId\s*==\s*uid\(\)/.test(drc)) v.push('documents: ramo tenant dei condivisi sparito');
  return v;
}
function keepsOwnerCollections(rulesText) {
  const code = stripComments(rulesText);
  const r = (c) => readClause(matchBlock(code, c)) || '';
  return /uid\(\)\s*==\s*userId/.test(r('users'))
    && /recipientId\s*==\s*uid\(\)/.test(r('invoices'))
    && /isLandlord\(\)\s*&&\s*resource\.data\.ownerId\s*==\s*uid\(\)/.test(r('documentShares'))
    && /isLandlord\(\)\s*&&\s*resource\.data\.ownerId\s*==\s*uid\(\)/.test(r('taxPacks'));
}

section('§1 firestore.rules — il proprietario non legge dal browser');
const RULES = R('firestore.rules');
const rv = rulesViolations(RULES);
ok('nessun ramo landlord nelle letture di ' + LOCKED.join('/') + (rv.length ? ' — ' + rv.join(' · ') : ''), rv.length === 0);
ok('users (proprio), invoices (recipientId), documentShares e taxPacks del landlord restano', keepsOwnerCollections(RULES));
ok('l\'intestazione dice dove legge il proprietario («solo via /api/owner/*»)', /IL PROPRIETARIO LEGGE SOLO VIA \/api\/owner\/\*/.test(RULES));
// mutazioni: ciascuna rimette uno dei rami tolti il 22/09 e DEVE essere presa
const MUT_RULES = [
  ['ramo landlord su properties', (s) => s.replace("allow read: if isAdmin()\n                  || (isTenant()\n                      && resource.data.currentContractId", "allow read: if isAdmin()\n                  || (isLandlord() && resource.data.ownerId == uid())\n                  || (isTenant()\n                      && resource.data.currentContractId")],
  ['helper ownsProperty rimesso', (s) => s.replace('function onlyChanges(', 'function ownsProperty(pid) { return isLandlord() && propertyData(pid).ownerId == uid(); }\n    function onlyChanges(')],
  ['ramo landlord su contracts', (s) => s.replace("|| (isTenant() && resource.data.tenantId == uid());\n      allow create, delete: if isAdmin();\n      allow update: if isAdmin()\n                    || (isTenant() && resource.data.tenantId == uid()\n                        && onlyChanges(['tenantSignature'", "|| (isTenant() && resource.data.tenantId == uid())\n                  || (isLandlord() && propertyData(resource.data.propertyId).ownerId == uid());\n      allow create, delete: if isAdmin();\n      allow update: if isAdmin()\n                    || (isTenant() && resource.data.tenantId == uid()\n                        && onlyChanges(['tenantSignature'")],
  ['proprio documento anche per il landlord', (s) => s.replace('(resource.data.userId == uid() && !isLandlord())', 'resource.data.userId == uid()')],
  ['inbox assegnata al landlord', (s) => s.replace("allow read:   if isAdmin()\n                    || (resource.data.contactUid == uid());\n      allow create: if isAdmin();", "allow read:   if isAdmin()\n                    || (resource.data.contactUid == uid())\n                    || (isLandlord() && resource.data.assignedLandlordId == uid());\n      allow create: if isAdmin();")],
];
for (const [name, mut] of MUT_RULES) {
  const m = mut(RULES);
  ok('mutazione presa: ' + name, m !== RULES && rulesViolations(m).length > 0);
}

// La PROPRIA scheda users (revisione del 23/09/2026): gli alias e i timbri
// d'invito decidono cosa vede /api/owner/* e quale account prende l'invito —
// scritti da sé erano la chiave per l'archivio di un altro proprietario. La
// `allow update` del proprietario della scheda deve escluderli TUTTI con
// affectedKeys().hasAny([...]). (L'emulatore lo prova in tests/rules/runner.mjs.)
const USERS_LOCKED = ['role', 'email', 'authUid', 'ownerAliases', 'ownerInvitedAt', 'ownerInvitedBy', 'ownerInviteSentAt', 'ownerPortalFirstAt',
  'accountConfirmedAt', 'accountConfirmedBy'];
function usersSelfLockMissing(rulesText) {
  const block = matchBlock(stripComments(rulesText), 'users') || '';
  const m = /allow\s+update\s*:\s*if([\s\S]*?);/.exec(block);
  if (!m) return ['allow update non trovata'];
  const self = /uid\(\)\s*==\s*userId([\s\S]*)$/.exec(m[1]);
  if (!self) return ['ramo del proprietario della scheda non trovato'];
  const h = /!\s*request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasAny\(\[([^\]]*)\]\)/.exec(self[1]);
  if (!h) return ['nessun affectedKeys().hasAny([...]) negato'];
  const listed = (h[1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1));
  return USERS_LOCKED.filter((k) => !listed.includes(k));
}
const ul = usersSelfLockMissing(RULES);
ok('users: la propria scheda NON scrive ' + USERS_LOCKED.join('/') + (ul.length ? ' — manca: ' + ul.join(', ') : ''), ul.length === 0);
const MUT_USERS = [
  ['torna a chiudere solo role', (s) => s.replace(/!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasAny\(\[[^\]]*\]\)\);/, "!('role' in request.resource.data.diff(resource.data).affectedKeys()));")],
  ['ownerAliases tolto dalla lista', (s) => s.replace("'role', 'email', 'authUid', 'ownerAliases',", "'role', 'email', 'authUid',")],
  ['email tolta dalla lista', (s) => s.replace("'role', 'email', 'authUid',", "'role', 'authUid',")],
  ['la firma della conferma tolta dalla lista', (s) => s.replace(",\n                                       'accountConfirmedAt', 'accountConfirmedBy'", '')],
];
for (const [name, mut] of MUT_USERS) {
  const m = mut(RULES);
  ok('mutazione presa (users): ' + name, m !== RULES && usersSelfLockMissing(m).length > 0);
}

// ═════════════════════════════════════════════════════════════════════════
// §2 storage.rules
// ═════════════════════════════════════════════════════════════════════════
function storageViolations(txt) {
  const code = stripComments(txt);
  const v = [];
  for (const folder of ['documents', 'maintenance', 'payment-proofs']) {
    const b = matchBlock(code, folder.replace('-', '\\-'));
    const rc = readClause(b);
    if (rc == null) { v.push(folder + ': allow read non trovata'); continue; }
    if (/isLandlord\(\)/.test(rc)) v.push(folder + ': landlord in lettura');
    if (!/uid\(\)\s*==\s*userId/.test(rc)) v.push(folder + ': proprietario della cartella sparito');
  }
  const pb = matchBlock(code, 'passes') || '';
  const w = (/allow\s+write\s*:\s*if([\s\S]*?);/.exec(pb) || [])[1] || '';
  if (!/isAdmin\(\)/.test(w) || /isLandlord\(\)/.test(w)) v.push('passes: scrittura non solo admin');
  return v;
}
section('§2 storage.rules — cartelle degli altri e pass Wallet');
const STOR = R('storage.rules');
const sv = storageViolations(STOR);
ok('documents/maintenance/payment-proofs: admin o il titolare della cartella, mai un landlord qualsiasi; passes: solo admin' + (sv.length ? ' — ' + sv.join(' · ') : ''), sv.length === 0);
ok('taxpacks del proprio ownerId restano al landlord', /taxpacks\/\{ownerId\}[\s\S]{0,200}isLandlord\(\)\s*&&\s*uid\(\)\s*==\s*ownerId/.test(STOR));
ok('mutazione presa: landlord rimesso su documents/', storageViolations(STOR.replace("match /documents/{userId}/{allPaths=**} {\n      allow read:  if isAdmin() || uid() == userId;", "match /documents/{userId}/{allPaths=**} {\n      allow read:  if isAdmin() || uid() == userId || isLandlord();")).length > 0);
ok('mutazione presa: landlord rimesso sulla scrittura dei passes', storageViolations(STOR.replace('allow write:  if isAdmin() && request.resource.size < 5', 'allow write:  if (isAdmin() || isLandlord()) && request.resource.size < 5')).length > 0);

// ═════════════════════════════════════════════════════════════════════════
// §3 gli handler veri
// ═════════════════════════════════════════════════════════════════════════
const SEED = {
  'users/U_ADM': { role: 'admin', name: 'Op', email: 'op@boom.test' },
  // il landlord SENZA email: send-link sul suo lato si ferma a 409 no_email
  // (nessuna email spedita dal test) e restituisce il SUO link.
  'users/U_LL': { role: 'landlord', name: 'Luisa Locatrice' },
  'users/U_OWN': { role: 'owner', name: 'Omar Owner' },
  'users/U_T': { role: 'tenant', name: 'Tina Tenant', email: 'tina@tenant.test' },
  'properties/P1': { ownerId: 'U_LL', name: 'Casa Uno', address: 'Via Uno 1' },
  'properties/P2': { ownerId: 'U_OTHER', name: 'Casa Due', address: 'Via Due 2' },
  // C1: l'inquilino ha già firmato (lato conduttori completo), PDF presente
  'contracts/C1': { propertyId: 'P1', tenantId: 'U_T', tenantName: 'Tina Tenant', tenantSignToken: 'TENANT-SIGN-TOKEN', landlordSignToken: 'LL-SIGN-TOKEN', tenantSignature: 'data:image/png;base64,AAAA', generatedPDF: 'https://firebasestorage.googleapis.com/v0/b/b/o/contracts%2FC1%2Fc.pdf?alt=media&token=PDFTOK' },
  // C2: con un co-conduttore (profile/link gli dava il link di FIRMA)
  'contracts/C2': { propertyId: 'P1', tenantId: 'U_T', tenantSignToken: 'TENANT-SIGN-TOKEN-2', coTenants: [{ name: 'Carlo Coinquilino' }] },
  'contracts/C3': { propertyId: 'P2', tenantId: 'U_T', tenantSignToken: 'TENANT-SIGN-TOKEN-3', landlordSignToken: 'LL-SIGN-TOKEN-3', tenantSignature: 'data:x', generatedPDF: 'https://x/c3.pdf' },
  'documents/D_T': { userId: 'U_T', propertyId: 'P1', category: "Documento d'identità", fileUrl: 'https://firebasestorage.googleapis.com/v0/b/b/o/documents%2FU_T%2Fid.jpg?alt=media&token=IDTOK' },
  'documents/D_LL': { userId: 'U_LL', propertyId: 'P1', category: 'Contratto', fileUrl: 'https://x/own.pdf' },
  'preAgreements/PA1': { token: 'a'.repeat(32), status: 'accepted', propertyId: 'P1', tenant: { fullName: 'Tina Tenant', email: 'tina@tenant.test' }, landlord: { name: 'Luisa' }, money: { rent: 1000 }, lease: { startDate: '2026-10-01', months: 12 } },
};
const h = createHarness({ seed: SEED });
const uninstall = h.install();
// Gli handler si importano DOPO install (FIREBASE_API_KEY e FS_BASE si
// leggono al caricamento del modulo).
const imp = async (f) => (await import('../../' + f)).default;
const H = {
  link: await imp('api/profile/link.js'),
  sendLink: await imp('api/sign/send-link.js'),
  share: await imp('api/documents/share.js'),
  qa: await imp('api/documents/qa.js'),
  ocr: await imp('api/documents/ocr.js'),
  notify: await imp('api/notify/send.js'),
  ingest: await imp('api/portal/ingest.js'),
  pass: await imp('api/generate-pass.js'),
  convert: await imp('api/preagreement/convert.js'),
  sendSign: await imp('api/preagreement/send-sign.js'),
  resolve: await imp('api/preagreement/resolve.js'),
  create: await imp('api/preagreement/create.js'),
  paNotify: await imp('api/preagreement/notify.js'),
};
let enhance = null;
try { enhance = await imp('api/photos/enhance.js'); }
catch (e) { console.log('  nota: api/photos/enhance.js non importabile qui (' + (e.code || e.message) + ') — la sua porta si legge sulla sorgente'); }

const LEAKS = ['TENANT-SIGN-TOKEN', 'IDTOK', 'PDFTOK', '/sign?sign=', 'scheda?t='];
const leaks = (r) => { const t = r.text() || ''; return LEAKS.filter(x => t.includes(x)); };
// console.* degli handler zittiti: un test non stampa i log di produzione
const quiet = async (fn) => { const o = { log: console.log, warn: console.warn, error: console.error }; console.log = console.warn = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, o); } };
const call = (handler, opts) => quiet(() => h.call(handler, { method: 'POST', ...opts }));
const AI = /api\.anthropic\.com|openai\.com/;
const aiCalls = () => h.fetchLog.filter(e => AI.test(e.url)).length;

section('§3 handler veri — il proprietario non passa più');
{
  // profile/link
  const snap = h.snapshot();
  const r = await call(H.link, { uid: 'U_LL', body: { contractId: 'C2' } });
  ok('profile/link: il landlord del SUO immobile → 403 forbidden (niente Scheda dell\'inquilino, niente link di firma dei co-conduttori)', r.statusCode === 403 && r.body && r.body.error === 'forbidden' && leaks(r).length === 0);
  const ro = await call(H.link, { uid: 'U_OWN', body: { contractId: 'C2' } });
  ok('profile/link: role owner → 403', ro.statusCode === 403);
  ok('profile/link: nessuna scrittura dai rifiuti', h.diff(snap).length === 0);
  const ra = await call(H.link, { uid: 'U_ADM', body: { contractId: 'C2' } });
  ok('profile/link: l\'admin riceve ancora le Schede e il link del co-conduttore (controllo positivo)', ra.statusCode === 200 && /scheda\?t=/.test(ra.body.tenantUrl || '') && Array.isArray(ra.body.cosign) && ra.body.cosign.length === 1);
}
{
  // sign/send-link
  const snap = h.snapshot();
  const r1 = await call(H.sendLink, { uid: 'U_LL', body: { contractId: 'C1', role: 'tenant' } });
  ok('send-link: landlord con role:"tenant" → 403 landlord_link_only, nessun link nella risposta', r1.statusCode === 403 && r1.body.error === 'landlord_link_only' && leaks(r1).length === 0);
  const r2 = await call(H.sendLink, { uid: 'U_LL', body: { contractId: 'C1' } });
  ok('send-link: landlord SENZA role (default tenant) → 403 landlord_link_only', r2.statusCode === 403 && r2.body.error === 'landlord_link_only');
  const r2o = await call(H.sendLink, { uid: 'U_OWN', body: { contractId: 'C1', role: 'tenant' } });
  ok('send-link: role owner con role:"tenant" → 403', r2o.statusCode === 403);
  ok('send-link: i rifiuti non scrivono niente', h.diff(snap).length === 0);
  const r3 = await call(H.sendLink, { uid: 'U_LL', body: { contractId: 'C1', role: 'landlord' } });
  ok('send-link: landlord con role:"landlord" sul PROPRIO contratto passa la porta (qui 409 no_email) e riceve il SUO link, mai quello dell\'inquilino',
    r3.statusCode === 409 && r3.body.error === 'no_email' && /LL-SIGN-TOKEN/.test(r3.body.url || '') && !/TENANT-SIGN-TOKEN/.test(r3.text()));
  const r4 = await call(H.sendLink, { uid: 'U_LL', body: { contractId: 'C3', role: 'landlord' } });
  ok('send-link: landlord su un contratto NON suo → 403 not_your_contract', r4.statusCode === 403 && r4.body.error === 'not_your_contract');
  const r5 = await call(H.sendLink, { uid: 'U_ADM', body: { contractId: 'C1', role: 'tenant' } });
  ok('send-link: l\'admin chiede ancora il lato inquilino (qui 409 already_signed: la porta si passa)', r5.statusCode === 409 && r5.body.error === 'already_signed');
}
{
  // documents/share — errata E3.5: admin-only
  const snap = h.snapshot();
  const r1 = await call(H.share, { uid: 'U_LL', body: { ownerId: 'U_LL', docIds: ['D_T'] } });
  ok('documents/share: landlord con il documento d\'identità dell\'INQUILINO → 403, nessuna condivisione creata', r1.statusCode === 403 && h.diff(snap).length === 0);
  const r2 = await call(H.share, { uid: 'U_LL', body: { ownerId: 'U_LL', docIds: ['D_LL'] } });
  ok('documents/share: anche col proprio documento → 403 (lo staff condivide, il proprietario usa il suo archivio)', r2.statusCode === 403 && h.diff(snap).length === 0);
  const ra = await call(H.share, { uid: 'U_ADM', body: { ownerId: 'U_LL', docIds: ['D_LL'] } });
  ok('documents/share: l\'admin crea ancora la condivisione (controllo positivo)', ra.statusCode === 200 && ra.body.ok === true && [...h.DB.keys()].some(k => k.startsWith('documentShares/')));
}
{
  // Le porte che spendono o spediscono: 403 PRIMA di qualunque AI o scrittura.
  const snap = h.snapshot(); const ai0 = aiCalls();
  const qa = await call(H.qa, { uid: 'U_LL', body: { question: 'quanto ho incassato?' } });
  ok('documents/qa: landlord → 403 (il testo OCR degli inquilini non arriva al modello per lui)', qa.statusCode === 403);
  const ocr = await call(H.ocr, { uid: 'U_LL', body: { fileUrl: 'https://evil.example/x.pdf' } });
  ok('documents/ocr: landlord → 403 (niente fetch di un URL qualsiasi, niente credito AI)', ocr.statusCode === 403 && !h.fetchLog.some(e => /evil\.example/.test(e.url)));
  const nt = await call(H.notify, { uid: 'U_LL', body: { to: 'vittima@example.com', params: { heading: 'x' } } });
  ok('notify/send: landlord → 403 (niente email col marchio BOOM a indirizzi arbitrari)', nt.statusCode === 403);
  const nto = await call(H.notify, { uid: 'U_OWN', body: { to: 'vittima@example.com', params: {} } });
  ok('notify/send: role owner → 403', nto.statusCode === 403);
  const ing = await call(H.ingest, { uid: 'U_LL', body: { text: 'contratto di locazione tra…' } });
  ok('portal/ingest: landlord → 403 (Opus 5 non si spende da un account di proprietario)', ing.statusCode === 403);
  const ingo = await call(H.ingest, { uid: 'U_OWN', body: { text: 'x' } });
  ok('portal/ingest: role owner → 403', ingo.statusCode === 403);
  if (enhance) {
    const en = await call(enhance, { uid: 'U_LL', body: { listingId: 'L1', mode: 'apply' } });
    ok('photos/enhance: landlord col token Firebase → 403 (apply riscriveva le foto di qualunque annuncio)', en.statusCode === 403);
    const ea = await call(enhance, { uid: 'U_ADM', body: { mode: 'apply' } });
    ok('photos/enhance: l\'admin passa la porta (qui 400 no_listing)', ea.statusCode === 400 && ea.body.error === 'no_listing');
  }
  ok('nessuna chiamata a un modello e nessuna scrittura da tutti questi rifiuti', aiCalls() === ai0 && h.diff(snap).length === 0);
  const qaA = await call(H.qa, { uid: 'U_ADM', body: { question: 'x' } });
  ok('documents/qa: l\'admin passa la porta (qui 400 question_too_short o 500 senza chiave AI)', qaA.statusCode !== 403 && qaA.statusCode !== 401);
}
{
  // generate-pass: il landlord firma SOLO la propria carta
  const snap = h.snapshot();
  const p1 = await call(H.pass, { uid: 'U_LL', body: { type: 'tenant', data: { tenantName: 'X' } } });
  ok('generate-pass: landlord con type tenant → 403', p1.statusCode === 403);
  const p2 = await call(H.pass, { uid: 'U_LL', body: { type: 'landlord', data: { landlordId: 'U_OTHER', landlordName: 'Altro' } } });
  ok('generate-pass: landlord con la carta di UN ALTRO landlordId → 403', p2.statusCode === 403);
  const p3 = await call(H.pass, { uid: 'U_OWN', body: { type: 'viewing', data: { name: 'x' } } });
  ok('generate-pass: role owner con type viewing → 403', p3.statusCode === 403);
  ok('generate-pass: i rifiuti non scrivono passMeta', h.diff(snap).length === 0);
  const p4 = await call(H.pass, { uid: 'U_LL', body: { type: 'landlord', data: { landlordId: 'U_LL', landlordName: 'Luisa' } } });
  ok('generate-pass: la PROPRIA carta landlord passa la porta (qui la firma fallisce senza certificato: né 401 né 403)', p4.statusCode !== 403 && p4.statusCode !== 401);
  const p5 = await call(H.pass, { uid: 'U_ADM', body: { type: 'tenant', data: { tenantName: 'X' } } });
  ok('generate-pass: l\'admin firma ancora qualunque tipo (né 401 né 403)', p5.statusCode !== 403 && p5.statusCode !== 401);
}
{
  // preagreement/* — errata E1.5: solo admin
  const snap = h.snapshot();
  const cases = [['convert', H.convert, { id: 'PA1' }], ['send-sign', H.sendSign, { id: 'PA1' }], ['resolve', H.resolve, { id: 'PA1' }],
    ['create', H.create, { property: { address: 'Via Uno 1' }, money: { rent: 900 } }], ['notify', H.paNotify, { id: 'PA1' }]];
  for (const [name, fn, body] of cases) {
    const rl = await call(fn, { uid: 'U_LL', body });
    const ro = await call(fn, { uid: 'U_OWN', body });
    ok(`preagreement/${name}: landlord e owner → 403 forbidden, nessun link nella risposta`, rl.statusCode === 403 && rl.body.error === 'forbidden' && ro.statusCode === 403 && leaks(rl).length === 0);
  }
  ok('preagreement/*: nessuna scrittura (né contratto, né proposta, né profili) dai rifiuti', h.diff(snap).length === 0);
  const ra = await call(H.convert, { uid: 'U_ADM', body: {} });
  ok('preagreement/convert: l\'admin passa la porta (qui 400 senza id)', ra.statusCode === 400);
}
ok('nessuna chiamata di rete non prevista dal banco di prova', h.unexpected.length === 0);
uninstall();

// ═════════════════════════════════════════════════════════════════════════
// §4 js/portal-app.js — il landlord esce prima di caricare
// ═════════════════════════════════════════════════════════════════════════
function portalViolations(src) {
  const v = [];
  const fnStart = src.indexOf('function landlordToArchive()');
  if (fnStart < 0) { v.push('landlordToArchive() assente'); return v; }
  const body = src.slice(fnStart, src.indexOf('\n    }', fnStart));
  if (!/role\s*!==\s*'landlord'/.test(body)) v.push('landlordToArchive non guarda il ruolo');
  if (!/localStorage\.removeItem\('boom_data_cache'\)/.test(body)) v.push('la cache locale non si butta');
  if (!/location\.replace\('\/proprietario'\)/.test(body)) v.push('non va su /proprietario');
  // Il percorso principale dell'auth: dopo S.profile, prima di tutto il resto.
  const a = src.indexOf('S.profile = { id: u.uid, ...doc.data() };');
  const gate = src.indexOf('if (landlordToArchive()) return;', a);
  const firsts = ['loadData()', 'showApp()', 'startSessionCheck()', 'readBoomBridge()', "db.collection('users').doc(u.uid).update"]
    .map(t => src.indexOf(t, a)).filter(i => i >= 0);
  if (a < 0 || gate < 0 || firsts.some(i => i < gate)) v.push('percorso principale: il landlord non esce prima di loadData/showApp/listener');
  // Il ritentativo Safari (seconda lettura del profilo).
  const b = src.indexOf('S.profile = { id: u.uid, ...retryDoc.data() };');
  const gate2 = src.indexOf('if (landlordToArchive()) return;', b);
  const load2 = src.indexOf('await loadData();', b);
  if (b < 0 || gate2 < 0 || load2 < gate2) v.push('ritentativo Safari: loadData prima dell\'uscita');
  // Il watchdog dei 25s chiama showApp: non deve far entrare un landlord in uscita.
  const sa = src.indexOf('function showApp()');
  const setup = src.indexOf('setupApp();', sa);
  const guard = src.indexOf('if (leavingForArchive) return;', sa);
  if (sa < 0 || guard < 0 || guard > setup) v.push('showApp avvia setup/listener anche per un landlord in uscita');
  return v;
}
section('§4 js/portal-app.js — /portal non è più del proprietario');
const PA = R('js/portal-app.js');
const pv = portalViolations(PA);
ok('il landlord va su /proprietario subito dopo il profilo, PRIMA di loadData/showApp/listener, cache buttata' + (pv.length ? ' — ' + pv.join(' · ') : ''), pv.length === 0);
ok('mutazione presa: uscita spostata DOPO loadData', portalViolations(PA.replace("                    S.profile = { id: u.uid, ...doc.data() };\n                    if (landlordToArchive()) return;", "                    S.profile = { id: u.uid, ...doc.data() };\n                    await loadData();\n                    if (landlordToArchive()) return;")).length > 0);
ok('mutazione presa: la cache non si butta', portalViolations(PA.replace("try { localStorage.removeItem('boom_data_cache'); } catch (e) {}\n        location.replace('/proprietario');", "location.replace('/proprietario');")).length > 0);
ok('mutazione presa: showApp senza guardia', portalViolations(PA.replace('if (leavingForArchive) return;', '')).length > 0);
// i marcatori che altre suite tagliano (errata E6) restano
ok('marcatori intatti: commercialistaLandlordLite( · markPaymentPaid( · router isLandlord() → marketIntelPage()',
  PA.includes('    function commercialistaLandlordLite(') && PA.includes('markPaymentPaid(') && /else if \(isLandlord\(\)\) \{ m\.innerHTML = marketIntelPage\(\);/.test(PA));

// ═════════════════════════════════════════════════════════════════════════
// §5 le quattro pagine dello staff, MONTATE
// ═════════════════════════════════════════════════════════════════════════
// DOM permissivo: qualunque proprietà esiste, qualunque chiamata risponde.
// Serve a far girare gli <script> in linea senza un browser: si guarda solo
// SE la pagina tocca Firestore e COSA mette nel riquadro di caricamento.
function anyObj(store = {}) {
  const fn = function () {};
  return new Proxy(fn, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      return (store[k] = anyObj());
    },
    set(t, k, v) { store[k] = v; return true; },
    apply() { return anyObj(); },
    construct() { return anyObj(); },
    has() { return true; },
  });
}
function mountPage(html, role) {
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => !/^\s*\{\s*"@context"/.test(s));
  const els = {};
  const el = (id) => els[id] || (els[id] = anyObj({ id, innerHTML: '', textContent: '', style: anyObj({}), value: '' }));
  const reads = [];
  const fsStub = () => anyObj({ collection: (name) => { reads.push(name); return anyObj(); } });
  let authed = null;
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    Promise, JSON, Math, Date, String, Number, Array, Object, RegExp, Error, Map, Set, Symbol, Intl, Uint8Array, ArrayBuffer,
    encodeURIComponent, decodeURIComponent, parseFloat, parseInt, isNaN, isFinite,
    document: anyObj({ getElementById: el, querySelector: () => anyObj(), querySelectorAll: () => [], createElement: () => anyObj({ style: anyObj({}) }), addEventListener() {}, body: anyObj(), head: anyObj() }),
    location: anyObj({ search: '', hash: '', pathname: '/x', origin: 'https://www.boomrome.com', href: 'https://www.boomrome.com/x' }),
    navigator: anyObj({ userAgent: 'node' }), localStorage: anyObj({ getItem: () => null }), sessionStorage: anyObj({ getItem: () => null }),
    URLSearchParams, URL, alert() {}, confirm: () => false, prompt: () => null, fetch: async () => anyObj(), addEventListener() {},
    firebase: anyObj({ firestore: fsStub, auth: () => anyObj() }),
    BoomPortal: anyObj({
      bugButton() {},
      requireAuth: () => ({ then: (fn) => { authed = fn; return { catch() { return this; } }; } }),
    }),
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const errors = [];
  for (const s of scripts) { try { vm.runInContext(s, ctx, { timeout: 2000 }); } catch (e) { errors.push(e.message); } }
  const readsBeforeAuth = reads.length;
  let cbError = null;
  if (authed) { try { authed({ user: anyObj({ uid: 'u1', email: 'x@y', getIdToken: async () => 't' }), profile: { role, name: 'X' } }); } catch (e) { cbError = e.message; } }
  return { reads, readsBeforeAuth, hooked: !!authed, load: String(els.load ? els.load.innerHTML : ''), errors, cbError };
}
section('§5 le pagine dello staff — il ruolo PRIMA di ogni lettura');
const STAFF = ['verbale.html', 'inventario.html', 'manuale.html', 'pre-agreement-admin.html'];
const staffCheck = (html) => {
  const ll = mountPage(html, 'landlord');
  const ow = mountPage(html, 'owner');
  return { ll, ow, safe: ll.hooked && ll.reads.length === 0 && ow.reads.length === 0 && /\/proprietario/.test(ll.load) && /staff BOOM/.test(ll.load) };
};
for (const f of STAFF) {
  const html = R(f);
  const { ll, safe } = staffCheck(html);
  ok(`${f}: col landlord (e l'owner) NESSUNA .collection(, il cartello «dello staff BOOM» con /proprietario`, safe && ll.readsBeforeAuth === 0);
  const ad = mountPage(html, 'admin');
  ok(`${f}: con l'admin la pagina legge Firestore (controllo positivo: il banco vede le letture)`, ad.hooked && ad.reads.length > 0 && !/staff BOOM/.test(ad.load));
  const mut = html.replace("if(!res.profile||res.profile.role!=='admin'){staffOnly();return;}", '');
  ok(`${f}: mutazione presa — senza la guardia il landlord legge`, mut !== html && !staffCheck(mut).safe);
}
// tests/ritorno: la via del ritorno e il canale dei bug restano (errata E6)
ok('ritorno intatto: href="/portal" in tutte, BoomPortal.bugButton( in verbale/manuale/pre-agreement-admin, mai freshOnReturn',
  STAFF.every(f => R(f).includes('href="/portal"')) && ['verbale.html', 'manuale.html', 'pre-agreement-admin.html'].every(f => R(f).includes('BoomPortal.bugButton(')) && STAFF.every(f => !R(f).includes('freshOnReturn')));

// ═════════════════════════════════════════════════════════════════════════
// §6 il ritiro: vercel.json, file, robots, seo
// ═════════════════════════════════════════════════════════════════════════
section('§6 il ritiro — una superficie sola: /proprietario');
const VJ = JSON.parse(R('vercel.json'));
const vfun = VJ.functions || {};
const expandBraces = k => { const m = k.match(/^(.*)\{([^}]*)\}(.*)$/); return m ? m[2].split(',').flatMap(x => expandBraces(m[1] + x + m[3])) : [k]; };
const ruleFor = f => Object.keys(vfun).find(k => expandBraces(k).includes(f));
ok('vercel.json: al massimo 50 regole functions (il tetto di Vercel, prima del build)', Object.keys(vfun).length <= 50);
ok('vercel.json: api/owner/{archivio,file,invite}.js a 60s in UNA regola', ['archivio', 'file', 'invite'].every(n => ruleFor(`api/owner/${n}.js`) === 'api/owner/{archivio,file,invite}.js' && vfun['api/owner/{archivio,file,invite}.js'].maxDuration === 60));
const redir = (VJ.redirects || []).find(r => /owner-dashboard/.test(r.source));
ok('vercel.json: /owner, /owner.html, /owner-dashboard(.html) → /proprietario, permanente', !!redir && redir.destination === '/proprietario' && redir.permanent === true && ['owner', 'owner.html', 'owner-dashboard', 'owner-dashboard.html'].every(x => new RegExp('^' + redir.source.replace(/\(([^)]*)\)/, (_, g) => '(' + g.replace(/\./g, '\\.') + ')') + '$').test('/' + x)));
ok('vercel.json: nessun rewrite verso /owner-dashboard', !(VJ.rewrites || []).some(r => /owner-dashboard/.test(r.source + r.destination)));
const priv = (VJ.headers || []).find(g => (g.headers || []).some(x => x.key === 'Cache-Control' && /no-store/.test(x.value)) && /\|casa\|/.test(g.source));
ok('vercel.json: /proprietario nel gruppo privato no-store + noindex', !!priv && /\|proprietario\|proprietario\.html\)/.test(priv.source) && priv.headers.some(x => x.key === 'X-Robots-Tag' && /noindex/.test(x.value)));
ok('vercel.json: owner-dashboard fuori dal gruppo noindex debole', !(VJ.headers || []).some(g => /owner-dashboard/.test(g.source)));
ok('owner.html e owner-dashboard.html non esistono più', !existsSync(path.join(ROOT, 'owner.html')) && !existsSync(path.join(ROOT, 'owner-dashboard.html')));
const ROBOTS = R('robots.txt');
ok('robots.txt: Disallow /proprietario, niente più owner-dashboard', /^Disallow: \/proprietario$/m.test(ROBOTS) && !/owner-dashboard/.test(ROBOTS));
const require_ = (await import('node:module')).createRequire(import.meta.url);
const SEO = require_('../../scripts/seo-config.js').PAGES;
ok('seo-config: proprietario.html noindex, nofollow; owner.html e owner-dashboard.html fuori', !!SEO['proprietario.html'] && /noindex/.test(SEO['proprietario.html'].robots) && /nofollow/.test(SEO['proprietario.html'].robots) && SEO['proprietario.html'].skipSitemap === true && !SEO['owner.html'] && !SEO['owner-dashboard.html']);
ok('concierge: nessun riferimento alla pagina ritirata', !/owner-dashboard/.test(R('api/agent/concierge.js')));


// ═════════════════════════════════════════════════════════════════════════
// §7 i guardiani condivisi dello staff — il proprietario non è staff
// ═════════════════════════════════════════════════════════════════════════
// api/pfs/_guard.js è la porta di ~35 endpoint (banca, lead, visite,
// scadenzario, radar, cron, Scrivano). Aveva ADMIN_ROLES = admin+owner+
// landlord: con l'Archivio gli account landlord si moltiplicano, e ognuno
// sarebbe passato da lì come 'admin:<uid>'. Stessa lista in
// listings-availability e admin/match-test. Si guida il guardiano VERO.
section('§7 guardiani dello staff — banca, lead, visite, cron: solo admin');
{
  const { requireCronOrAdmin } = await import('../../api/pfs/_guard.js');
  const reinstall = h.install(); // §3 aveva già rimesso la rete vera
  const probe = async (uid) => {
    const r = h.res();
    const actor = await quiet(() => requireCronOrAdmin(h.req({ method: 'POST', headers: { authorization: 'Bearer ' + uid } }), r));
    return { actor, status: r.statusCode ?? r._status ?? null, body: r };
  };
  const ll = await probe('U_LL'), own = await probe('U_OWN'), ten = await probe('U_T'), adm = await probe('U_ADM');
  ok('pfs/_guard: un landlord NON passa (niente actor)', ll.actor === null);
  ok('pfs/_guard: un owner NON passa', own.actor === null);
  ok('pfs/_guard: un tenant NON passa', ten.actor === null);
  ok('pfs/_guard: l\'admin passa (controllo positivo)', adm.actor === 'admin:U_ADM');
  // mutazione sulla sorgente: rimettere il landlord nella lista deve dire rosso
  const gsrc = R('api/pfs/_guard.js');
  const roles = (t) => { const m = /const\s+ADMIN_ROLES\s*=\s*new\s+Set\(\[([^\]]*)\]\)/.exec(stripComments(t)); return m ? m[1].replace(/\s/g, '') : null; };
  ok('pfs/_guard: ADMIN_ROLES è solo admin', roles(gsrc) === "'admin'");
  const mut = gsrc.replace("new Set(['admin'])", "new Set(['admin', 'owner', 'landlord'])");
  ok('pfs/_guard: mutazione presa — col landlord nella lista il controllo dice rosso', mut !== gsrc && roles(mut) !== "'admin'");
  for (const f of ['api/listings-availability.js', 'api/admin/match-test.js']) {
    ok(`${f}: ADMIN_ROLES è solo admin`, roles(R(f)) === "'admin'");
  }
  // Nessun altro guardiano nello stesso stile che torni a includere il proprietario.
  const offenders = [];
  const walk = (d) => { for (const e of (require_('node:fs').readdirSync(path.join(ROOT, d), { withFileTypes: true }))) {
    const p = d + '/' + e.name; if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
    if (!/\.js$/.test(e.name)) continue; const r = roles(R(p)); if (r != null && r !== "'admin'") offenders.push(p);
  } };
  walk('api');
  ok('api/**: nessun ADMIN_ROLES che includa owner/landlord', offenders.length === 0);
  reinstall();
}
{
  // Le email di firma, rendiconto e verbale portano il link all'archivio da
  // _entry.js, un modulo senza import: un guasto nell'invito o nel motore non
  // può fermare l'email di una firma completa.
  const entry = stripComments(R('api/owner/_entry.js'));
  ok('_entry.js non importa niente', !/^\s*import\s/m.test(entry));
  for (const f of ['api/sign/_notify.js', 'api/owners/rendiconto.js', 'api/contracts/verbale.js']) {
    const src = R(f);
    ok(`${f}: il link all'archivio arriva da owner/_entry.js, non da invite.js`, /from '\.\.\/owner\/_entry\.js'/.test(src) && !/from '\.\.\/owner\/invite\.js'/.test(src));
  }
}

{
  // 📄 Firmato su carta (portal): le funzioni VERE, estratte dal sorgente e
  // fatte girare con Firestore, modale e toast finti. Registra {at, by,
  // recordedAt} solo per l'admin, mai nel futuro, mai su un contratto già
  // firmato digitalmente; si toglie; il rinnovo non la eredita.
  const src = R('js/portal-app.js');
  const a = src.indexOf('    function romeToday() {'), b = src.indexOf('    window.markPaperSigned = markPaperSigned;');
  ok('portal: romeToday/markPaperSigned/unmarkPaperSigned presenti', a > 0 && b > a);
  const code = src.slice(a, b);
  async function run({ admin = true, contract, answer, confirmIt = true, today = '2026-09-23' }) {
    const writes = [], toasts = [];
    const S = { contracts: [contract], profile: { role: admin ? 'admin' : 'landlord' } };
    const FV = { serverTimestamp: () => '__ts__', delete: () => '__del__' };
    const deps = {
      S, isAdmin: () => S.profile.role === 'admin', toast: (k, m) => toasts.push(k + ':' + m),
      askModal: async () => answer, confirm: () => confirmIt, closeModal: () => {}, viewContract: () => {}, setTimeout: () => {},
      fmtDate: (d) => String(d), console: { error: () => {} },
      auth: { currentUser: { uid: 'adm' } },
      firebase: { firestore: { FieldValue: FV } },
      db: { collection: (col) => ({ doc: (id) => ({ update: async (f) => { writes.push({ path: col + '/' + id, f }); } }) }) },
      Intl: { DateTimeFormat: function () { return { format: () => today }; } },
    };
    const fn = new Function(...Object.keys(deps), code + '\nreturn { markPaperSigned, unmarkPaperSigned };');
    const api = fn(...Object.values(deps));
    return { api, writes, toasts, contract };
  }
  const base = () => ({ id: 'c1', startDate: '2025-06-01', signatureStatus: 'none' });
  let r = await run({ contract: base(), answer: '2025-05-20' });
  await r.api.markPaperSigned('c1');
  const w = r.writes[0];
  ok('admin: registra paperSigned {at, by: uid dell\'admin, recordedAt ISO} sul contratto', r.writes.length === 1 && w.path === 'contracts/c1'
    && w.f.paperSigned.at === '2025-05-20' && w.f.paperSigned.by === 'adm' && /^\d{4}-\d{2}-\d{2}T/.test(w.f.paperSigned.recordedAt));
  r = await run({ contract: base(), answer: '2026-09-24' });
  await r.api.markPaperSigned('c1');
  ok('una firma nel futuro (ora di Roma) non si registra', r.writes.length === 0 && r.toasts.some((t) => /futuro/.test(t)));
  r = await run({ contract: base(), answer: '20/05/2025' });
  await r.api.markPaperSigned('c1');
  ok('una data illeggibile non si registra', r.writes.length === 0);
  r = await run({ contract: base(), answer: null });
  await r.api.markPaperSigned('c1');
  ok('annullato: nessuna scrittura', r.writes.length === 0);
  r = await run({ admin: false, contract: base(), answer: '2025-05-20' });
  await r.api.markPaperSigned('c1');
  ok('non admin: nessuna scrittura', r.writes.length === 0);
  r = await run({ contract: { ...base(), signatureStatus: 'complete' }, answer: '2025-05-20' });
  await r.api.markPaperSigned('c1');
  ok('già firmato digitalmente: nessuna scrittura', r.writes.length === 0);
  r = await run({ contract: { ...base(), paperSigned: { at: '2025-05-20', by: 'adm', recordedAt: 'x' } } });
  await r.api.unmarkPaperSigned('c1');
  ok('togliere: paperSigned cancellato dal contratto', r.writes.length === 1 && r.writes[0].f.paperSigned === '__del__' && !r.contract.paperSigned);
  // Il rinnovo: firmato su carta = contratto firmato → rinnovo come contratto
  // NUOVO, e la carta non passa al clone.
  const rn = src.slice(src.indexOf('    async function renewContract(e, id) {'), src.indexOf("const ref = await db.collection('contracts').add(clone);"));
  ok('renewContract: un contratto firmato su carta si rinnova come contratto NUOVO', /const _signed = [\s\S]*?contract\.paperSigned && contract\.paperSigned\.at/.test(rn));
  ok('renewContract: paperSigned è fra i campi che il clone NON eredita', /'paperSigned',[\s\S]*?\]\.forEach\(k => delete clone\[k\]\)/.test(rn));
}

console.log(`\n${failed ? '✗' : '✓'} ownersec: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:\n - ' + bad.join('\n - ')); process.exit(1); }
