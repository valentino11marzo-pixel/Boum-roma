// tests/contractpdf/run.mjs — il PDF del contratto in UNA copia, ovunque.
//
// Il difetto coperto: un contratto nato dal rail pre-agreement (convert /
// send-sign, server-side) restava senza generatedPDF — sign.html non
// offriva "View full contract PDF" prima della firma e _finalize saltava
// il contratto firmato in allegato. Qui si pretende che:
//   1. l'impaginato condiviso (js/contract-pdf.js) produca un PDF vero
//      (jsPDF REALE, non mockato) con le ancore firma per _finalize;
//   2. ensureContractPdf generi/patchi UNA volta sola e non tocchi MAI un
//      contratto con una firma viva (verificato per mutazione);
//   3. la conversione PA scriva il PDF da sola — e se Storage è giù il
//      contratto nasca comunque (mai bloccare una conversione per un PDF);
//   4. send-sign sani i contratti pre-fix PRIMA che parta l'invito
//      (asserito sull'ORDINE nel sorgente: la guardia prima della spesa);
//   5. la prima apertura di /sign (lookup) sia l'ultima rete;
//   6. l'impaginato viva SOLO nel modulo (portal-app delega — niente
//      seconda copia che possa divergere) e jspdf sia pinnato in ENTRAMBI
//      i manifest + lockfile (la lezione del 2026-07-22).
// Uso: node tests/contractpdf/run.mjs

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

// jspdf VERO è il soggetto del test: senza node_modules (macchina appena
// clonata, CI a zero deps) la suite si dichiara SKIP, mai un falso rosso.
try { await import('jspdf'); }
catch {
  console.log('SKIP: jspdf non installato (npm install per abilitare questa suite)');
  process.exit(0);
}

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'testsecret';
process.env.GMAIL_USER = 'g@x.it';
process.env.GMAIL_APP_PASS = 'gp';

import fs from 'node:fs';
import crypto from 'node:crypto';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

// ── Stub fetch: Firestore + Storage + IdentityToolkit in-memory ─────────
const store = new Map();
const storageCalls = [];
globalThis.__storageDown = false;

const FS = 'firestore.googleapis.com';
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });

function toFsV(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsV) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFsV(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function toFsFieldsShallow(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj || {})) f[k] = toFsV(v);
  return f;
}
function fromFsV(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFsV);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFsV(x); return o; }
  return null;
}

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'admin1' }] });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (globalThis.__storageDown) return new Response('down', { status: 503 });
    storageCalls.push(url);
    return okJson({ downloadTokens: 'tk123' });
  }
  if (url.includes(FS)) {
    const path = url.split('/documents')[1] || '';
    if (path.startsWith(':runQuery')) {
      const q = JSON.parse(opts.body).structuredQuery;
      const coll = q.from[0].collectionId;
      const field = q.where?.fieldFilter?.field?.fieldPath;
      const val = q.where?.fieldFilter?.value?.stringValue;
      const rows = [];
      for (const [key, fields] of store) {
        if (!key.startsWith(coll + '/')) continue;
        if (field && String(fields[field]) !== String(val)) continue;
        rows.push({ document: { name: 'projects/p/databases/(default)/documents/' + key, fields: toFsFieldsShallow(fields) } });
      }
      return okJson(rows.length ? rows : [{}]);
    }
    const clean = path.replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = clean + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      const fields = JSON.parse(opts.body).fields || {};
      const flat = {};
      for (const [k, v] of Object.entries(fields)) flat[k] = fromFsV(v);
      store.set(key, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      const fields = JSON.parse(opts.body).fields || {};
      const flat = store.get(clean) || {};
      for (const [k, v] of Object.entries(fields)) flat[k] = fromFsV(v);
      store.set(clean, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + clean });
    }
    const doc = store.get(clean);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + clean, fields: toFsFieldsShallow(doc) });
  }
  throw new Error('fetch non stubbata: ' + url);
};

const mkRes = () => ({
  code: 0, body: null, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; },
  send(t) { this.body = t; return this; },
  end() { return this; },
});
const mkReq = (body, headers = {}) => ({ method: 'POST', headers, body });

// ═══ 1. Il modulo impagina davvero (jsPDF REALE) ═══
const CONTRACT_PDF = (await import('../../js/contract-pdf.js')).default;
const jspdfNS = (await import('jspdf')).default;
const jsPDF = jspdfNS.jsPDF || jspdfNS;

const sampleContract = {
  type: 'transitorio',
  tenantName: 'Anna Rossi', tenantCF: 'RSSNNA90A41H501X', tenantDob: '1990-01-01',
  tenantPob: 'Roma', tenantAddress: 'Via Prova 1, Roma', tenantDocType: 'passport', tenantDocNum: 'AA123',
  landlordName: 'Mario Bianchi', landlordCF: 'BNCMRA60A01H501Y',
  startDate: '2026-09-01', endDate: '2027-08-31',
  rent: 1200, deposit: 2400,
  canone: { monthly: 1200, total: 14400, installments: 12, paymentDay: 5, paymentMethod: 'bonifico bancario', cedolareSecca: true, oneriMode: 'tabella_allegato_d' },
  transitionalReason: 'trasferta di lavoro', cohabitants: '',
};
const sampleProperty = { city: 'Roma', address: 'Via Prova 1', floor: '2', rooms: 3, furnished: true };

{
  const built = CONTRACT_PDF.build({ jsPDF, contractId: 'c_test', contract: sampleContract, property: sampleProperty, tenant: null, landlord: null });
  const bytes = Buffer.from(built.doc.output('arraybuffer'));
  check('modulo: Allegato B produce un PDF vero (%PDF, più pagine)', bytes.slice(0, 5).toString() === '%PDF-' && built.doc.internal.getNumberOfPages() >= 3);
  check('modulo: ancore firma per _finalize (2 blocchi × locatore+conduttore)', Array.isArray(built.sigAnchors) && built.sigAnchors.length === 4
    && built.sigAnchors.every(a => a.page >= 1 && a.xr >= 0 && a.yr >= 0 && a.wr > 0 && a.hr > 0));
  check('modulo: hashSeed = id+date+canone (stessa formula del portal)', built.hashSeed === 'c_test2026-09-012027-08-31' + 1200);

  const builtC = CONTRACT_PDF.build({ jsPDF, contractId: 'c_stud', contract: { ...sampleContract, type: 'studenti', universityName: 'LUISS', courseName: 'Economia' }, property: sampleProperty, tenant: null, landlord: null });
  const bytesC = Buffer.from(builtC.doc.output('arraybuffer'));
  check('modulo: Allegato C (studenti) produce un PDF vero', bytesC.slice(0, 5).toString() === '%PDF-' && builtC.sigAnchors.length === 4);

  const builtCo = CONTRACT_PDF.build({ jsPDF, contractId: 'c_co', contract: { ...sampleContract, coTenants: [{ name: 'Luca Verdi', cf: 'X' }] }, property: sampleProperty, tenant: null, landlord: null });
  check('modulo: co-conduttore → 6 ancore (2 blocchi × 3 firmatari)', builtCo.sigAnchors.length === 6
    && builtCo.sigAnchors.filter(a => a.role === 'cotenant' && a.coIndex === 0).length === 2);

  // Determinismo: stessi dati → stessi byte (a meno della data di stampa,
  // qui fissata via signatureDate) — l'impaginato non ha stato nascosto.
  const b1 = Buffer.from(CONTRACT_PDF.build({ jsPDF, contractId: 'c_det', contract: { ...sampleContract, signatureDate: '2026-08-13' }, property: sampleProperty, tenant: null, landlord: null }).doc.output('arraybuffer'));
  const b2 = Buffer.from(CONTRACT_PDF.build({ jsPDF, contractId: 'c_det', contract: { ...sampleContract, signatureDate: '2026-08-13' }, property: sampleProperty, tenant: null, landlord: null }).doc.output('arraybuffer'));
  check('modulo: impaginato deterministico a parità di dati', b1.length > 0 && b1.length === b2.length);
}

// ═══ 2. Hash: il server calcola la STESSA impronta del portal ═══
{
  const { sha16 } = await import('../../api/sign/_contractpdf.js');
  const seed = 'c_test2026-09-012027-08-311200';
  const subtle = await crypto.webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const portalHash = Array.from(new Uint8Array(subtle)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  check('hash: sha16 server === generateDocHash portal (subtle)', sha16(seed) === portalHash);
}

// ═══ 3. ensureContractPdf: genera, patcha, una volta sola ═══
const { ensureContractPdf } = await import('../../api/sign/_contractpdf.js');
{
  store.set('contracts/c1', { ...sampleContract, propertyId: 'p1', tenantId: 'u1' });
  store.set('properties/p1', { ...sampleProperty, ownerId: 'own1' });
  store.set('users/u1', { name: 'Anna Rossi', cf: 'RSSNNA90A41H501X' });
  store.set('users/own1', { name: 'Mario Bianchi' });

  const n0 = storageCalls.length;
  const url = await ensureContractPdf('c1');
  const c1 = store.get('contracts/c1');
  check('ensure: genera e patcha generatedPDF + sigAnchors + clauseVersion 2', !!url && c1.generatedPDF === url
    && c1.clauseVersion === 2 && c1.sigAnchors && Array.isArray(c1.sigAnchors.blocks) && c1.sigAnchors.blocks.length === 4);
  check('ensure: pdfHash 16 hex + pdfGeneratedBy server', /^[0-9a-f]{16}$/.test(c1.pdfHash) && c1.pdfGeneratedBy === 'server');
  check('ensure: UN solo upload su Storage', storageCalls.length === n0 + 1);

  const url2 = await ensureContractPdf('c1');
  check('ensure: idempotente — secondo giro restituisce lo stesso URL senza upload', url2 === url && storageCalls.length === n0 + 1);
}

// ═══ 4. LA GUARDIA: mai rigenerare sotto una firma viva (mutazione) ═══
{
  store.set('contracts/c_signed', { ...sampleContract, tenantSignature: 'data:image/png;base64,AAA' });
  const n0 = storageCalls.length;
  const url = await ensureContractPdf('c_signed');
  check('guardia: contratto con firma → null, zero upload, zero patch', url === null && storageCalls.length === n0 && !store.get('contracts/c_signed').generatedPDF);

  store.set('contracts/c_cosigned', { ...sampleContract, coTenants: [{ name: 'L', signature: 'data:image/png;base64,BBB' }] });
  const urlCo = await ensureContractPdf('c_cosigned');
  check('guardia: anche la firma di un CO-conduttore congela il PDF', urlCo === null && !store.get('contracts/c_cosigned').generatedPDF);
}

// ═══ 5. La conversione PA scrive il PDF da sola ═══
const { convertPaToContract } = await import('../../api/preagreement/convert.js');
const basePa = {
  status: 'accepted', acceptedAt: '2026-08-10T10:00:00Z', ref: 'BOOM-TEST',
  tenant: { fullName: 'Anna Rossi', email: 'anna@x.it', cf: 'RSSNNA90A41H501X', dob: '1990-01-01', birthPlace: 'Roma' },
  landlord: { name: 'Mario Bianchi', email: 'mario@x.it' },
  lease: { startDate: '2026-09-01', endDate: '2027-08-31', months: 12, reason: 'trasferta' },
  money: { rent: 1200, deposit: 2400, depositMonths: 2 },
};
{
  store.set('preAgreements/pa1', { ...basePa });
  store.set('properties/prop1', { ...sampleProperty, ownerId: 'own1' });
  const out = await convertPaToContract({ pa: store.get('preAgreements/pa1'), paId: 'pa1', propertyId: 'prop1', actor: 'test' });
  const c = store.get('contracts/pa_pa1');
  check('convert: contratto creato CON generatedPDF (il rail PA non è più cieco)', out.ok && c && !!c.generatedPDF && c.sigAnchors && c.clauseVersion === 2);
  const notif = [...store.keys()].filter(k => k.startsWith('agentNotifications/')).map(k => store.get(k));
  check('convert: NESSUN promemoria pdf_missing quando il PDF nasce', !notif.some(n => n.type === 'contract.pdf_missing'));
}

// ═══ 6. Storage giù: la conversione NON si blocca, il promemoria resta ═══
{
  globalThis.__storageDown = true;
  store.set('preAgreements/pa2', { ...basePa });
  const out = await convertPaToContract({ pa: store.get('preAgreements/pa2'), paId: 'pa2', propertyId: 'prop1', actor: 'test' });
  const c = store.get('contracts/pa_pa2');
  check('convert: Storage giù → contratto creato comunque, senza PDF', out.ok && c && !c.generatedPDF);
  const notif = [...store.keys()].filter(k => k.startsWith('agentNotifications/')).map(k => store.get(k));
  check('convert: Storage giù → promemoria pdf_missing presente', notif.some(n => n.type === 'contract.pdf_missing' && n.dedupKey === 'pdf-missing-pa_pa2'));
  globalThis.__storageDown = false;
}

// ═══ 7. send-sign sana i contratti pre-fix prima dell'invito ═══
{
  store.set('users/admin1', { role: 'admin', email: 'admin@boom.it' });
  // Contratto convertito PRIMA del fix: esiste, ha i token, NON ha il PDF.
  store.set('contracts/pa_pa3', {
    ...sampleContract, propertyId: 'prop1', tenantId: 'u1',
    tenantSignToken: 'tok-tenant-pa3-0000', landlordSignToken: 'tok-landlord-pa3-0000',
  });
  store.set('preAgreements/pa3', { ...basePa, contractId: 'pa_pa3' });
  const sendSign = (await import('../../api/preagreement/send-sign.js')).default;
  const r = mkRes();
  await sendSign(mkReq({ id: 'pa3' }, { authorization: 'Bearer faketoken' }), r);
  const c = store.get('contracts/pa_pa3');
  check('send-sign: 200 e contratto pre-fix SANATO (generatedPDF presente)', r.code === 200 && !!c.generatedPDF);
}

// ═══ 7b. send-link (la QUARTA porta d'invito) sana anche lui ═══
{
  store.set('contracts/c_sendlink', {
    ...sampleContract, propertyId: 'prop1', tenantId: 'u1', tenantEmail: 'anna@x.it',
    tenantSignToken: 'tok-sendlink-t-00000',
  });
  const sendLink = (await import('../../api/sign/send-link.js')).default;
  const r = mkRes();
  await sendLink(mkReq({ contractId: 'c_sendlink', role: 'tenant' }, { authorization: 'Bearer faketoken' }), r);
  const c = store.get('contracts/c_sendlink');
  check('send-link: il PDF nasce PRIMA che parta l\'invito', r.code === 200 && !!c.generatedPDF);
}

// ═══ 8. lookup: la prima apertura di /sign è l'ultima rete ═══
const lookup = (await import('../../api/magic-sign/lookup.js')).default;
{
  store.set('contracts/c_legacy', {
    ...sampleContract, propertyId: 'prop1', tenantId: 'u1',
    tenantSignToken: 'tok-legacy-tenant-0000',
  });
  const r = mkRes();
  await lookup(mkReq({ token: 'tok-legacy-tenant-0000' }, { 'x-forwarded-for': '9.9.9.1' }), r);
  const c = store.get('contracts/c_legacy');
  check('lookup: 200 e generatedPDF nato alla prima apertura', r.code === 200 && !!r.body?.contract?.generatedPDF && !!c.generatedPDF);
  check('lookup: la pagina riceve lo stesso URL persistito', r.body?.contract?.generatedPDF === c.generatedPDF);
}
{
  // Lato locatore su contratto già firmato dall'inquilino ma senza PDF
  // (caso limite legacy): la firma viva CONGELA — niente generazione.
  store.set('contracts/c_frozen', {
    ...sampleContract, propertyId: 'prop1', tenantId: 'u1',
    tenantSignToken: 'tok-frozen-tenant-000', landlordSignToken: 'tok-frozen-landlord-0',
    tenantSignature: 'data:image/png;base64,CCC', signatureStatus: 'partial',
  });
  const n0 = storageCalls.length;
  const r = mkRes();
  await lookup(mkReq({ token: 'tok-frozen-landlord-0' }, { 'x-forwarded-for': '9.9.9.2' }), r);
  check('lookup: firma viva → NIENTE generazione (documento congelato)', r.code === 200 && !r.body?.contract?.generatedPDF && storageCalls.length === n0);
}

// ═══ 9. Le giunzioni asserite sulla SORGENTE ═══
{
  const sendSignSrc = fs.readFileSync(new URL('../../api/preagreement/send-sign.js', import.meta.url), 'utf8');
  const iEnsure = sendSignSrc.indexOf('await ensureContractPdf(');
  const iEmail = sendSignSrc.indexOf('await sendContractSignEmail(');
  check('sorgente send-sign: la sanatoria PRIMA dell\'email (ordine)', iEnsure > -1 && iEmail > -1 && iEnsure < iEmail);

  const convertSrc = fs.readFileSync(new URL('../../api/preagreement/convert.js', import.meta.url), 'utf8');
  const iGen = convertSrc.indexOf('await ensureContractPdf(');
  const iMiss = convertSrc.indexOf("type: 'contract.pdf_missing'");
  check('sorgente convert: genera, e il promemoria vive solo nel ramo fallimento', iGen > -1 && iMiss > iGen && convertSrc.includes('if (!pdfUrl)'));

  const lookupSrc = fs.readFileSync(new URL('../../api/magic-sign/lookup.js', import.meta.url), 'utf8');
  check('sorgente lookup: la rete esiste ed è condizionata all\'assenza del PDF', lookupSrc.includes('if (!contract.generatedPDF)') && lookupSrc.includes('ensureContractPdf(contract.id'));

  const sendLinkSrc = fs.readFileSync(new URL('../../api/sign/send-link.js', import.meta.url), 'utf8');
  const iEnsureSL = sendLinkSrc.indexOf('await ensureContractPdf(');
  const iInviteSL = sendLinkSrc.indexOf('await sendSignInvite(');
  check('sorgente send-link: PDF backfill PRIMA dell\'invito (ordine)', iEnsureSL > -1 && iInviteSL > -1 && iEnsureSL < iInviteSL);

  const portalSrc = fs.readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  check('sorgente portal: delega al modulo, niente seconda copia dell\'impaginato',
    portalSrc.includes('BOOM_CONTRACT_PDF') && !portalSrc.includes('_generateContractPDF_allegatoB')
    && !portalSrc.includes('LOCAZIONE ABITATIVA DI NATURA TRANSITORIA'));

  const moduleSrc = fs.readFileSync(new URL('../../js/contract-pdf.js', import.meta.url), 'utf8');
  check('sorgente modulo: entrambi i modelli CAF vivono nel modulo',
    moduleSrc.includes('LOCAZIONE ABITATIVA DI NATURA TRANSITORIA') && moduleSrc.includes('LOCAZIONE ABITATIVA PER STUDENTI UNIVERSITARI'));

  const portalHtml = fs.readFileSync(new URL('../../portal.html', import.meta.url), 'utf8');
  const iMod = portalHtml.indexOf('/js/contract-pdf.js');
  const iApp = portalHtml.indexOf('/js/portal-app.js"></script>');
  check('portal.html: contract-pdf.js caricato PRIMA di portal-app.js', iMod > -1 && iApp > -1 && iMod < iApp);

  const signHtml = fs.readFileSync(new URL('../../sign.html', import.meta.url), 'utf8');
  check('sign.html: il link "View full contract PDF" legge generatedPDF', signHtml.includes('contract.generatedPDF'));

  // La lezione del 2026-07-22: la dipendenza in ENTRAMBI i manifest + lock.
  const apiPkg = JSON.parse(fs.readFileSync(new URL('../../api/package.json', import.meta.url), 'utf8'));
  const rootPkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const apiLock = JSON.parse(fs.readFileSync(new URL('../../api/package-lock.json', import.meta.url), 'utf8'));
  const rootLock = JSON.parse(fs.readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  check('jspdf pinnato in api/package.json E root package.json (stessa versione del CDN)',
    apiPkg.dependencies.jspdf === '2.5.1' && rootPkg.dependencies.jspdf === '2.5.1');
  check('jspdf nei DUE package-lock.json',
    !!apiLock.packages['node_modules/jspdf'] && !!rootLock.packages['node_modules/jspdf']);

  // Il modulo è importato staticamente (mai await import('pkg') — la
  // trappola del bundler Vercel che ha spento le email PA fino a luglio).
  const serverSrc = fs.readFileSync(new URL('../../api/sign/_contractpdf.js', import.meta.url), 'utf8');
  check('sorgente _contractpdf: jspdf importato staticamente (tracer-safe)',
    /^import jspdfNS from 'jspdf';$/m.test(serverSrc) && !serverSrc.includes("await import('jspdf')"));
}

// ═══ Esito ═══
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:', bad.join(' | ')); process.exit(1); }
