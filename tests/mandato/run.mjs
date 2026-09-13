// tests/mandato/run.mjs — IL MANDATO A FIRMARE + LA SCHEDA FIRMATA + IL
// DOCUMENTO DEL PROPRIETARIO, blindati.
//
// Handler e moduli REALI (preagreement/submit, lookup, convert; magic-sign/
// lookup, submit; sign/_finalize delegateLines; fiscal/fascicolo schedaFacts
// + buildSchedaPdf; fiscal/valutazione), pdf-lib REALE, nodemailer mockato
// via il loader della suite notify, Firestore/Storage/Identity su stub
// in-memory. LE REGOLE:
//  · il cliente firma sulla proposta ANCHE la scheda di calcolo del canone
//    (Allegato 2/B): il testo del consenso è UNO (pagina == server, hash);
//  · il mandato a firmare è una spunta A PARTE (mai dedotta dal consenso),
//    solo se la console lo offre; il contratto lo eredita con l'IMPRONTA dei
//    termini su cui è stato dato;
//  · al posto del conduttore si firma SOLO col mandato scritto (403 senza),
//    SOLO agli stessi termini (409 se cambiati) — e chi ha firmato davvero
//    resta stampato (tenantSignedByDelegate → pagina firme, certificato,
//    scheda ARPE);
//  · la Valutazione BOOM esce anche SENZA contratto (dall'immobile) con la
//    scheda di calcolo brandizzata a pagina 2 — stessi fatti del modulo ARPE.
// Uso: node tests/mandato/run.mjs   (MANDATO_DUMP=1 salva i PDF in /tmp)
import { register } from 'node:module';
import fs from 'node:fs';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-mandato';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TELEGRAM_BOT_TOKEN;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

// ── Stub: Firestore in-memory (runQuery, commit con precondizione, create
// 409 su id esistente, patch) + Storage con ritenzione byte + Identity ──
const store = new Map();
const docTimes = new Map();
const storageFiles = new Map();
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const toFsFields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
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
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'caller1', email: 'op@boom.it' }] });
  if (url.includes('api.telegram.org')) return okJson({ ok: true, result: { message_id: 1 } });
  if (url.startsWith('https://freetsa.org/tsr')) return new Response(Buffer.alloc(300, 7), { status: 200 });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (opts.method === 'POST') {
      const name = new URL(url).searchParams.get('name');
      if (name) storageFiles.set(name, Buffer.from(opts.body));
      return okJson({ downloadTokens: 'dltok' });
    }
    const m = url.match(/\/o\/([^?]+)\?alt=media/);
    if (m) {
      const bytes = storageFiles.get(decodeURIComponent(m[1]));
      if (!bytes) return new Response('not found', { status: 404 });
      return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    }
    return okJson({ downloadTokens: 'dltok' });
  }
  if (url.includes('firestore.googleapis.com')) {
    const path = (url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    const bump = (k) => docTimes.set(k, new Date(Date.now() + docTimes.size).toISOString());
    const docRow = (k) => ({ name: 'projects/p/databases/(default)/documents/' + k, fields: toFsFields(store.get(k)), updateTime: docTimes.get(k) || '2026-01-01T00:00:00Z', createTime: '2026-01-01T00:00:00Z' });
    if (path.startsWith(':runQuery')) {
      const sq = (JSON.parse(opts.body || '{}') || {}).structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const ff = (sq.where || {}).fieldFilter;
      const rows = [];
      for (const [k] of store) {
        if (!k.startsWith(col + '/') || k.slice(col.length + 1).includes('/')) continue;
        if (ff) {
          const want = fromFs(ff.value);
          const got = (store.get(k) || {})[ff.field.fieldPath];
          if (got !== want) continue;
        }
        rows.push({ document: docRow(k) });
        if (sq.limit && rows.length >= sq.limit) break;
      }
      return okJson(rows.length ? rows : [{}]);
    }
    if (path.startsWith(':commit')) {
      const writes = (JSON.parse(opts.body || '{}') || {}).writes || [];
      for (const w of writes) {
        if (!/^projects\/[^/]+\/databases\/\(default\)\/documents\/.+/.test(String(w.update.name))) {
          return new Response(JSON.stringify({ error: { code: 400, message: 'invalid name', status: 'INVALID_ARGUMENT' } }), { status: 400 });
        }
        const k = (w.update.name.split('/documents/')[1] || '');
        if (w.currentDocument && w.currentDocument.updateTime) {
          const cur = docTimes.get(k) || '2026-01-01T00:00:00Z';
          if (cur !== w.currentDocument.updateTime) return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: 'the stored version does not match' } }), { status: 400 });
        }
        const doc = store.get(k) || {};
        Object.assign(doc, fromFsFields(w.update.fields));
        store.set(k, doc); bump(k);
      }
      return okJson({ writeResults: writes.map(() => ({})) });
    }
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      store.set(key, fromFsFields(JSON.parse(opts.body).fields));
      bump(key);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      if (qs.get('currentDocument.exists') === 'false' && store.has(path)) return new Response('exists', { status: 400 });
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      bump(path);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson(docRow(path));
  }
  throw new Error('fetch non stubbata: ' + url);
};

const mkRes = () => ({
  code: 0, body: null, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; },
  send(b) { this.body = b; return this; },
  end() { return this; },
});
let IP = '9.7.1.1';
const mkReq = (body, headers = {}) => ({ method: 'POST', headers: { 'x-forwarded-for': IP, 'user-agent': 'test-ua', ...headers }, body, socket: {} });
const dump = (name, bytes) => { if (process.env.MANDATO_DUMP) fs.writeFileSync('/tmp/mandato_' + name, bytes); };
const R = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));
// Il testo VERO dentro un PDF pdf-lib: i content stream sono Flate-compressi,
// quindi si decodificano (decodePDFRawStream) e si leggono gli operatori Tj.
const { PDFDocument: PDFLibDoc, PDFArray, PDFRawStream, decodePDFRawStream } = await import('pdf-lib');
async function pdfText(bytes) {
  const d = await PDFLibDoc.load(bytes);
  let out = '';
  for (const pg of d.getPages()) {
    const c = pg.node.Contents();
    const refs = c instanceof PDFArray ? c.asArray() : [c];
    for (const ref of refs) {
      const st = d.context.lookup(ref);
      if (st instanceof PDFRawStream) out += Buffer.from(decodePDFRawStream(st).decode()).toString('latin1') + '\n';
    }
  }
  // pdf-lib scrive le stringhe in esadecimale (<424F4F4D> Tj): si decodificano.
  const text = out.replace(/<([0-9A-Fa-f]+)>\s*Tj/g, (_, h) => Buffer.from(h, 'hex').toString('latin1') + ' ');
  return { pages: d.getPageCount(), text };
}

// ── Seed ─────────────────────────────────────────────────────────────────
store.set('users/caller1', { role: 'admin', name: 'Valentino', email: 'op@boom.it' });
store.set('properties/prop1', {
  ownerId: 'own1', ownerName: 'Giulia Bianchi', name: 'Trastevere Loft', address: 'Via della Lungaretta 12', city: 'Roma',
  zone: 'Trastevere', canoneZonaCod: '', rooms: 3, sqm: 78, furnished: true, energyClass: 'F', floor: '3',
  cadastralData: 'foglio 495, part. 120, sub 8', features: ['elevator', 'ac', 'balcony'],
});
store.set('properties/prop2', { ownerId: 'own1', name: 'Casa senza dati', address: 'Vicolo Ignoto 1' });
store.set('users/own1', { role: 'landlord', name: 'Giulia Bianchi', email: 'giulia@x.it' });

const TOKEN_A = 'a'.repeat(32), TOKEN_B = 'b'.repeat(32), TOKEN_C = 'c'.repeat(32);
const paSeed = (token, extra = {}) => ({
  token, status: 'sent', propertyId: 'prop1', askMandate: true,
  property: { address: 'Via della Lungaretta 12', type: 'Entire Apartment', condition: 'Furnished', use: 'Residential', floor: '3' },
  landlord: { name: 'Giulia Bianchi', email: 'giulia@x.it' },
  lease: { startDate: '2026-11-01', months: 12, endDate: '2027-10-31', type: 'Transitional Lease', lawRef: 'uso transitorio · L.431/98 art.5 c.1' },
  money: { rent: 1500, deposit: 3000, depositMonths: 2, dueAtSigning: 0, monthlyTotal: 1500, chargedMonthly: 1500, depositAtSigning: 0, depositAtMoveIn: 3000, installmentMonths: 1 },
  createdAt: '2026-09-01T10:00:00Z',
  ...extra,
});

const { PA_CONSENT_TEXT, PA_MANDATE_TEXT, PA_CONSENT_HASH, PA_MANDATE_HASH, sha256 } = await import('../../api/preagreement/_consent.js');
const { termsFingerprint } = await import('../../api/magic-sign/_shared.js');

// ═══ 1. I testi che il cliente firma: UNA copia (pagina == server) ═══
{
  const page = R('pre-agreement.html');
  check('consenso: la pagina mostra ESATTAMENTE il testo che il server registra (PA_CONSENT_TEXT)',
    page.includes("var PA_CONSENT_TEXT='" + PA_CONSENT_TEXT + "'"));
  check('mandato: la pagina mostra ESATTAMENTE il testo del mandato (PA_MANDATE_TEXT)',
    page.includes("var PA_MANDATE_TEXT='" + PA_MANDATE_TEXT + "'"));
  check('consenso: dichiara la firma sulla scheda Allegato 2/B e la provenienza delle informazioni ("provided by the parties")',
    /Allegato 2\/B/.test(PA_CONSENT_TEXT) && /provided by the parties/.test(PA_CONSENT_TEXT));
  check('mandato: termini predeterminati, revocabile per iscritto, art. 1395 c.c. dichiarato',
    /exactly the terms accepted/.test(PA_MANDATE_TEXT) && /revocable in writing/.test(PA_MANDATE_TEXT) && /1395/.test(PA_MANDATE_TEXT));
  check('hash stabili (sha256 del testo)', PA_CONSENT_HASH === sha256(PA_CONSENT_TEXT) && PA_MANDATE_HASH === sha256(PA_MANDATE_TEXT) && PA_CONSENT_HASH !== PA_MANDATE_HASH);
  check('la spunta del mandato è A PARTE (checkbox paMandate) e non è pre-selezionata',
    /id="paMandate"/.test(page) && !/id="paMandate" checked/.test(page) && /mandate:!!\(\$\('paMandate'\)&&\$\('paMandate'\)\.checked\)/.test(page));
  check('la pagina mostra la scheda di calcolo PRIMA della firma (schedaCard) e dichiara i buchi invece di fingere',
    /function schedaCard\(/.test(page) && /Still to complete on the sheet/.test(page) && /if\(!sc\|\|!sc\.linked\)return ''/.test(page));
}

// ═══ 2. PA lookup: la scheda che il cliente firmerà, calcolata dal server ═══
{
  store.set('preAgreements/paA', paSeed(TOKEN_A));
  const lookup = (await import('../../api/preagreement/lookup.js')).default;
  const r = mkRes();
  await lookup(mkReq({ token: TOKEN_A }), r);
  const sc = r.code === 200 && r.body.pa.scheda;
  check('lookup: 200 con askMandate=true (scelta esplicita della console) e mandate=null prima dell\'accettazione',
    r.code === 200 && r.body.pa.askMandate === true && r.body.pa.mandate === null);
  // COMPATIBILITÀ: una proposta nata PRIMA del mandato non ha il campo →
  // NON offerto. Le proposte in corso non cambiano comportamento da sole.
  store.set('preAgreements/paOld', { ...paSeed('d'.repeat(32)), askMandate: undefined, propertyId: 'prop2', lease: { startDate: '2031-01-01', months: 6, endDate: '2031-06-30', type: 'Transitional Lease', lawRef: 'x' } });
  delete store.get('preAgreements/paOld').askMandate;
  const rOld = mkRes();
  await lookup(mkReq({ token: 'd'.repeat(32) }), rOld);
  check('lookup: askMandate ASSENTE (proposta precedente) → false: nessuna spunta offerta', rOld.code === 200 && rOld.body.pa.askMandate === false);
  check('lookup: scheda collegata all\'immobile — zona riconosciuta, mq, fascia, verdetto sul canone della proposta',
    !!sc && sc.linked === true && !!sc.zonaCod && sc.mq === 78 && !!sc.fascia && sc.pattuito === 1500 && typeof sc.fits === 'boolean');
  check('lookup: nessun buco su un immobile completo (zona, mq, catasto, canone)', !!sc && Array.isArray(sc.gaps) && sc.gaps.length === 0);

  store.set('preAgreements/paC', paSeed(TOKEN_C, { propertyId: 'prop2', askMandate: false }));
  const r2 = mkRes();
  await lookup(mkReq({ token: TOKEN_C }), r2);
  const sc2 = r2.code === 200 && r2.body.pa.scheda;
  check('lookup: immobile SENZA dati → i buchi sono dichiarati (zona, mq, catasto), mai un numero inventato',
    !!sc2 && sc2.linked === true && sc2.gaps.includes('zona') && sc2.gaps.includes('mq') && sc2.gaps.includes('catasto') && !sc2.fascia);
  check('lookup: askMandate=false viaggia alla pagina (nessuna spunta offerta)', r2.body.pa.askMandate === false);
}

// ═══ 3. PA submit: consenso con hash + mandato solo se spuntato E offerto ═══
{
  const submit = (await import('../../api/preagreement/submit.js')).default;
  const tenant = { fullName: 'Anna Expat', email: 'anna@x.com', phone: '+33600000000', dob: '1996-02-03', nationality: 'French', cf: 'XPTNNA96B43Z110Q' };
  let r = mkRes();
  await submit(mkReq({ token: TOKEN_A, tenant, tenants: [tenant], accept: true, mandate: true }), r);
  const pa = store.get('preAgreements/paA');
  check('submit: accettata, consenso col TESTO e l\'hash di _consent.js, schedaSigned=true',
    r.code === 200 && r.body.ok && pa.status === 'accepted'
    && pa.consent && pa.consent.text === PA_CONSENT_TEXT && pa.consent.hash === PA_CONSENT_HASH && pa.consent.schedaSigned === true && pa.consent.ip === IP);
  check('submit: mandato conferito → registrato con testo, hash, data, ip',
    pa.mandate && pa.mandate.given === true && pa.mandate.hash === PA_MANDATE_HASH && pa.mandate.text === PA_MANDATE_TEXT && pa.mandate.at === pa.consent.at);

  // La spunta NON offerta dalla console non vale, anche se il body la porta.
  r = mkRes();
  await submit(mkReq({ token: TOKEN_C, tenant, tenants: [tenant], accept: true, mandate: true }), r);
  const paC = store.get('preAgreements/paC');
  check('submit: askMandate=false → mandate NULL anche con mandate:true nel body (mai dedotto)',
    r.code === 200 && paC.status === 'accepted' && paC.mandate === null && paC.consent && paC.consent.schedaSigned === true);
  check('submit: la FOTO delle condizioni approvate è persistita sulla proposta (v2, hash, immobile, parti, modello, soldi, clausole)',
    paC.approvedTerms && paC.approvedTerms.version === 2 && /^[a-f0-9]{64}$/.test(paC.approvedTerms.hash)
    && paC.approvedTerms.terms.propertyId === 'prop2' && paC.approvedTerms.terms.rent === 1500 && paC.approvedTerms.terms.deposit === 3000
    && paC.approvedTerms.terms.model === 'transitorio' && paC.approvedTerms.terms.tenants[0] === 'anna expat' && paC.approvedTerms.terms.landlord === 'giulia bianchi'
    && Array.isArray(paC.approvedTerms.terms.clauses) && paC.approvedTerms.at === paC.acceptedAt);
  r = mkRes();
  await submit(mkReq({ token: 'd'.repeat(32), tenant: { ...tenant, email: 'old@x.com' }, tenants: [{ ...tenant, email: 'old@x.com' }], accept: true, mandate: true }), r);
  check('submit: askMandate ASSENTE (proposta precedente) + mandate:true nel body → mandate NULL',
    r.code === 200 && store.get('preAgreements/paOld').status === 'accepted' && store.get('preAgreements/paOld').mandate === null);

  // Senza spunta, niente mandato.
  // Periodo DISGIUNTO da paC sullo stesso immobile: il lucchetto per mese
  // (propertyLocks) altrimenti la parcheggerebbe come riserva — giusto, ma
  // non è ciò che si misura qui.
  store.set('preAgreements/paB', paSeed(TOKEN_B, { propertyId: 'prop2', lease: { startDate: '2028-03-01', months: 6, endDate: '2028-08-31', type: 'Transitional Lease', lawRef: 'x' } }));
  r = mkRes();
  await submit(mkReq({ token: TOKEN_B, tenant: { ...tenant, email: 'b@x.com' }, tenants: [{ ...tenant, email: 'b@x.com' }], accept: true }), r);
  check('submit: senza spunta → mandate NULL, consenso comunque registrato', r.code === 200 && store.get('preAgreements/paB').status === 'accepted' && store.get('preAgreements/paB').mandate === null && !!store.get('preAgreements/paB').consent);

  const lookup = (await import('../../api/preagreement/lookup.js')).default;
  r = mkRes();
  await lookup(mkReq({ token: TOKEN_A }), r);
  check('lookup dopo l\'accettazione: mandate.at esposto (solo la data, mai il testo)',
    r.code === 200 && r.body.pa.mandate && r.body.pa.mandate.at === pa.mandate.at && !('text' in r.body.pa.mandate));
}

// ═══ 3b. CONVERSIONE AUTOMATICA sul percorso REALE (submit → maybeAutoConvert) ═══
// La regressione della revisione: submit.js passava a maybeAutoConvert la
// proposta letta PRIMA della patch — senza consenso, mandato e foto delle
// condizioni. Il contratto automatico nasceva senza paAcceptance e senza
// tenantMandate: il mandato appena dato spariva sulla strada normale.
{
  const submit = (await import('../../api/preagreement/submit.js')).default;
  const tenant = { fullName: 'Bruno Auto', email: 'bruno@x.com', phone: '+39333000111', cf: 'BRNTAU90A01H501Z' };
  const T_D = 'e'.repeat(32), T_E = 'f'.repeat(32);
  store.set('preAgreements/paD', paSeed(T_D, { autoConvert: true, lease: { startDate: '2028-01-01', months: 12, endDate: '2028-12-31', type: 'Transitional Lease', lawRef: 'x' }, customClauses: ['No pets.', 'Keys returned at the agency.'] }));
  store.set('preAgreements/paE', paSeed(T_E, { autoConvert: true, lease: { startDate: '2029-01-01', months: 12, endDate: '2029-12-31', type: 'Transitional Lease', lawRef: 'x' } }));

  let r = mkRes();
  await submit(mkReq({ token: T_D, tenant, tenants: [tenant], accept: true, mandate: true }), r);
  const paD = store.get('preAgreements/paD');
  const cD = store.get('contracts/pa_paD');
  check('auto-convert (dovuto 0, mandato offerto e selezionato): il contratto nasce dal submit', r.code === 200 && r.body.ok && !!cD && paD.contractId === 'pa_paD');
  check('auto-convert: il contratto conserva paAcceptance (data = consenso, ref, hash, schedaSigned)',
    !!cD && cD.paAcceptance && cD.paAcceptance.at === paD.consent.at && cD.paAcceptance.ref === paD.ref && cD.paAcceptance.hash === PA_CONSENT_HASH && cD.paAcceptance.schedaSigned === true);
  check('auto-convert: il contratto conserva tenantMandate v2 con la FOTO presa all\'accettazione (stesso hash della proposta)',
    !!cD && cD.tenantMandate && cD.tenantMandate.given === true && cD.tenantMandate.termsVersion === 2
    && cD.tenantMandate.termsHash === paD.approvedTerms.hash && cD.tenantMandate.termsSource === 'proposal-at-acceptance'
    && cD.tenantMandate.termsMatch === true && cD.tenantMandate.termsDiff.length === 0 && cD.tenantMandate.hash === PA_MANDATE_HASH);
  check('auto-convert: le clausole della proposta sono nel contratto e nella foto (stesso insieme)',
    !!cD && /No pets\./.test(cD.otherClauses) && cD.tenantMandate.terms.clauses.includes('no pets.') && cD.tenantName === 'Bruno Auto');
  check('auto-convert: il documento del mandato è su Storage', storageFiles.has('contracts/pa_paD/mandato-conduttore.pdf'));

  // Ripetizione della richiesta (tasto indietro, doppio tap): niente secondo contratto, niente riscrittura
  const before = JSON.stringify(cD.tenantMandate);
  r = mkRes();
  await submit(mkReq({ token: T_D, tenant, tenants: [tenant], accept: true, mandate: true }), r);
  check('submit ripetuto su proposta accettata: 200 already, UN solo contratto, mandato intatto',
    r.code === 200 && r.body.already === true && [...store.keys()].filter(k => k.startsWith('contracts/') && store.get(k).preAgreementId === 'paD').length === 1
    && JSON.stringify(store.get('contracts/pa_paD').tenantMandate) === before);

  // Mandato offerto ma NON selezionato: contratto automatico senza mandato, con l'accettazione
  r = mkRes();
  await submit(mkReq({ token: T_E, tenant: { ...tenant, email: 'bruno2@x.com' }, tenants: [{ ...tenant, email: 'bruno2@x.com' }], accept: true }), r);
  const cE = store.get('contracts/pa_paE');
  check('auto-convert (mandato offerto, non selezionato): contratto con paAcceptance e tenantMandate NULL',
    r.code === 200 && !!cE && cE.paAcceptance && cE.paAcceptance.schedaSigned === true && cE.tenantMandate === null && store.get('preAgreements/paE').approvedTerms.version === 2);
  const src = R('api/preagreement/submit.js');
  check('submit.js: maybeAutoConvert riceve consent, mandate e approvedTerms (non la proposta stale)',
    /maybeAutoConvert\(\{\s*pa: \{ \.\.\.data, tenant, tenants: signed, status: 'accepted', ref, acceptedAt, consent, mandate, approvedTerms/.test(src));
  // Gli altri chiamanti automatici rileggono la proposta da Firestore (webhook, resolve): la foto viaggia da sé
  const wh = R('api/stripe-webhook.js'), rs = R('api/preagreement/resolve.js');
  check('webhook e resolve passano la proposta RILETTA (con consent/mandate/approvedTerms persistiti)',
    /maybeAutoConvert\(\{ pa: \{ \.\.\.pa, status: 'paid'/.test(wh) && /maybeAutoConvert\(\{ pa: fixed, paId \}\)/.test(rs));
}

// ═══ 4. Conversione: il contratto eredita accettazione (= firma scheda) e mandato con l'impronta ═══
{
  const { convertPaToContract } = await import('../../api/preagreement/convert.js');
  const outA = await convertPaToContract({ pa: store.get('preAgreements/paA'), paId: 'paA' });
  const cA = store.get('contracts/pa_paA');
  check('convert: contratto creato con paAcceptance (data, ref, hash, schedaSigned)',
    outA.ok && !!cA && cA.paAcceptance && cA.paAcceptance.at === store.get('preAgreements/paA').consent.at
    && cA.paAcceptance.ref === store.get('preAgreements/paA').ref && cA.paAcceptance.schedaSigned === true && cA.paAcceptance.hash === PA_CONSENT_HASH);
  check('convert: tenantMandate v2 = la FOTO presa all\'accettazione (hash della proposta, non ricalcolato dal contratto), verificata alla conversione',
    cA.tenantMandate && cA.tenantMandate.given === true && cA.tenantMandate.termsVersion === 2
    && cA.tenantMandate.termsHash === store.get('preAgreements/paA').approvedTerms.hash && cA.tenantMandate.termsHash !== termsFingerprint(cA)
    && cA.tenantMandate.termsMatch === true && cA.tenantMandate.termsSource === 'proposal-at-acceptance'
    && cA.tenantMandate.hash === PA_MANDATE_HASH && cA.tenantMandate.ref === cA.preAgreementRef && outA.mandate === true && outA.mandateTermsMatch === true);
  const mandBytes = storageFiles.get('contracts/pa_paA/mandato-conduttore.pdf');
  check('convert: il documento del mandato (proposta accettata col testo) è su Storage e linkato (tenantMandate.docUrl)',
    !!mandBytes && mandBytes.slice(0, 4).toString() === '%PDF' && /mandato-conduttore\.pdf/.test(cA.tenantMandate.docUrl || ''));
  if (mandBytes) dump('mandato.pdf', mandBytes);

  const outB = await convertPaToContract({ pa: store.get('preAgreements/paB'), paId: 'paB' });
  const cB = store.get('contracts/pa_paB');
  check('convert: senza mandato sulla proposta → tenantMandate NULL (la firma per conto del conduttore resta impossibile)',
    outB.ok && !!cB && cB.tenantMandate === null && outB.mandate === false && !storageFiles.has('contracts/pa_paB/mandato-conduttore.pdf'));
}

// ═══ 5. Magic Sign: al posto del conduttore SOLO col mandato, SOLO agli stessi termini ═══
{
  const msSubmit = (await import('../../api/magic-sign/submit.js')).default;
  const msLookup = (await import('../../api/magic-sign/lookup.js')).default;
  const CONSENT = 'I confirm my identity and accept all lease terms. This digital signature is legally valid (FES — Art. 21 CAD).';
  const SIG = 'data:image/png;base64,' + 'A'.repeat(400);
  const body = (token) => ({ token, signature: SIG, consent: { text: CONSENT, hash: '' }, identity: { cf: 'XPTNNA96B43Z110Q' } });
  const dele = { name: 'Valentino Egidi', onBehalfOf: 'Anna Expat', basis: 'mandato scritto del conduttore', at: '2026-09-09T09:00:00Z', by: 'caller1' };

  // (a) contratto SENZA mandato + tenantDelegate acceso a mano → 403, zero firma
  const cB = store.get('contracts/pa_paB');
  cB.tenantDelegate = dele;
  IP = '9.7.5.1';
  let r = mkRes();
  await msSubmit(mkReq(body(cB.tenantSignToken)), r);
  check('senza mandato scritto: 403 mandate_missing, nessuna firma scritta',
    r.code === 403 && r.body.error === 'mandate_missing' && !store.get('contracts/pa_paB').tenantSignature);
  await tick();
  check('senza mandato: avviso all\'operatore (agentNotifications, motivo mandate_missing)',
    [...store.keys()].some(k => k.startsWith('agentNotifications/') && /mandate_missing/.test((store.get(k) || {}).summary || '')));
  cB.tenantDelegate = null;

  // (b) contratto CON mandato: lookup dichiara chi firma per chi
  const cA = store.get('contracts/pa_paA');
  cA.tenantDelegate = dele;
  r = mkRes();
  await msLookup(mkReq({ token: cA.tenantSignToken }), r);
  check('lookup: espone tenantDelegate e tenantMandate {at, ref} (mai il testo)',
    r.code === 200 && r.body.contract.tenantDelegate && r.body.contract.tenantDelegate.name === 'Valentino Egidi'
    && r.body.contract.tenantMandate && r.body.contract.tenantMandate.at === cA.tenantMandate.at && r.body.contract.tenantMandate.ref === cA.tenantMandate.ref
    && !('text' in r.body.contract.tenantMandate) && !('termsHash' in r.body.contract.tenantMandate));

  // (c) termini ritoccati DOPO il mandato → 409, nessuna firma
  const rentBefore = cA.rent;
  cA.rent = rentBefore + 50;
  IP = '9.7.5.2';
  r = mkRes();
  await msSubmit(mkReq(body(cA.tenantSignToken)), r);
  check('termini cambiati dopo il mandato: 409 mandate_terms_changed, nessuna firma',
    r.code === 409 && r.body.error === 'mandate_terms_changed' && r.body.changed.includes('rent') && !store.get('contracts/pa_paA').tenantSignature);
  cA.rent = rentBefore;

  // Le condizioni che l'impronta v1 IGNORAVA: immobile, clausole, oneri, modello — tutte DOPO la conversione
  const tryMut = async (label, mutate, restore, key) => {
    mutate();
    const rr = mkRes();
    await msSubmit(mkReq(body(cA.tenantSignToken)), rr);
    restore();
    check(`dopo la conversione, ${label} cambiato → 409 mandate_terms_changed (changed: ${key}), nessuna firma`,
      rr.code === 409 && rr.body.error === 'mandate_terms_changed' && rr.body.changed.includes(key) && !store.get('contracts/pa_paA').tenantSignature);
  };
  const keep = { propertyId: cA.propertyId, otherClauses: cA.otherClauses, accessoryCharges: cA.accessoryCharges, type: cA.type, landlordName: cA.landlordName, installmentMonths: cA.installmentMonths };
  await tryMut('immobile', () => { cA.propertyId = 'prop2'; }, () => { cA.propertyId = keep.propertyId; }, 'propertyId');
  await tryMut('clausole', () => { cA.otherClauses = (cA.otherClauses ? cA.otherClauses + '\n' : '') + 'Il conduttore rinuncia alla restituzione del deposito.'; }, () => { cA.otherClauses = keep.otherClauses; }, 'clauses');
  await tryMut('oneri accessori', () => { cA.accessoryCharges = 120; }, () => { cA.accessoryCharges = keep.accessoryCharges; }, 'accessoryCharges');
  await tryMut('modello di contratto', () => { cA.type = 'studenti'; }, () => { cA.type = keep.type; }, 'model');
  await tryMut('locatore', () => { cA.landlordName = 'Altro Proprietario'; }, () => { cA.landlordName = keep.landlordName; }, 'landlord');
  await tryMut('cadenza delle rate', () => { cA.installmentMonths = 3; }, () => { cA.installmentMonths = keep.installmentMonths; }, 'installmentMonths');
  // Un accento corretto in /scheda NON è un'altra persona: la foto normalizza
  cA.tenantName = 'Ánna  Expat';
  { const rr = mkRes(); await msLookup(mkReq({ token: cA.tenantSignToken }), rr);
    check('lookup: nome con accento/spazi diversi → condizioni ancora OK (normalizzazione), termsOk=true', rr.code === 200 && rr.body.contract.tenantMandate.termsOk === true && rr.body.contract.tenantMandate.termsVersion === 2); }
  cA.tenantName = 'Anna Expat';
  cA.rent = rentBefore + 50;
  { const rr = mkRes(); await msLookup(mkReq({ token: cA.tenantSignToken }), rr);
    check('lookup: condizioni cambiate → termsOk=false + termsChanged con le etichette (sign.html avvisa PRIMA del tentativo)',
      rr.code === 200 && rr.body.contract.tenantMandate.termsOk === false && rr.body.contract.tenantMandate.termsChanged.includes('canone mensile')); }
  cA.rent = rentBefore;

  // (d) stessi termini → la firma passa ed è marcata "per mandato"
  IP = '9.7.5.3';
  r = mkRes();
  await msSubmit(mkReq(body(cA.tenantSignToken)), r);
  const sA = store.get('contracts/pa_paA');
  check('stessi termini: 200 partial, firma registrata',
    r.code === 200 && r.body.signatureStatus === 'partial' && !!sA.tenantSignature);
  check('tenantSignedByDelegate stampato: chi, per conto di chi, riferimento/data/hash del mandato',
    sA.tenantSignedByDelegate && sA.tenantSignedByDelegate.name === 'Valentino Egidi' && sA.tenantSignedByDelegate.onBehalfOf === 'Anna Expat'
    && sA.tenantSignedByDelegate.mandateRef === cA.tenantMandate.ref && sA.tenantSignedByDelegate.mandateAt === cA.tenantMandate.at
    && sA.tenantSignedByDelegate.mandateHash === PA_MANDATE_HASH && !!sA.tenantSignedByDelegate.signedAt);

  // (e) chi firma di persona NON viene marcato per mandato (mutazione: nessun tenantDelegate)
  check('firma di persona sul contratto B (nessun delegato): nessun tenantSignedByDelegate', (() => {
    const c = store.get('contracts/pa_paB');
    return !c.tenantDelegate && !c.tenantSignedByDelegate;
  })());

  // (f) l'ORDINE nel sorgente: la guardia del mandato sta PRIMA della costruzione della firma
  const src = R('api/magic-sign/submit.js');
  check('submit.js: guardia mandato (403/409) PRIMA di `const upd = {}` e stamp DENTRO il ramo tenant',
    src.indexOf("error: 'mandate_missing'") < src.indexOf('const upd = {};')
    && src.indexOf("error: 'mandate_terms_changed'") < src.indexOf('const upd = {};')
    && src.indexOf('upd.tenantSignedByDelegate = {') > src.indexOf("if (role === 'tenant') {")
    && src.indexOf('upd.tenantSignedByDelegate = {') < src.indexOf("upd.tenantSignTokenUsedAt = nowISO;"));
  check('submit.js: l\'impronta dei termini è UNA (importata da _shared.js, non ridefinita)',
    /import \{[^}]*termsFingerprint[^}]*\} from '\.\/_shared\.js'/.test(src) && !/^export function termsFingerprint/m.test(src) && /export \{ termsFingerprint \};/.test(src));
  const sign = R('sign.html');
  check('sign.html: banner "You are signing as X on behalf of the tenant" + avviso se manca il mandato',
    /S\.role==='tenant'&&c\.tenantDelegate&&c\.tenantDelegate\.name/.test(sign) && /on behalf of the tenant/.test(sign) && /no written mandate on file/.test(sign));
}

// ═══ 5b. La verifica ALLA CONVERSIONE, la base che non si sposta, il v1 che non si rompe ═══
{
  const submit = (await import('../../api/preagreement/submit.js')).default;
  const { convertPaToContract } = await import('../../api/preagreement/convert.js');
  const msSubmit = (await import('../../api/magic-sign/submit.js')).default;
  const MANDATO = (await import('../../js/mandato-engine.js')).default;
  const CONSENT = 'I confirm my identity and accept all lease terms. This digital signature is legally valid (FES — Art. 21 CAD).';
  const SIG = 'data:image/png;base64,' + 'C'.repeat(400);
  const body = (token) => ({ token, signature: SIG, consent: { text: CONSENT, hash: '' }, identity: {} });
  const dele = { name: 'Valentino Egidi', onBehalfOf: 'x', basis: 'mandato scritto del conduttore', at: '2026-09-10T09:00:00Z', by: 'caller1' };
  const tenant = { fullName: 'Carla Prova', email: 'carla@x.com', phone: '+39333000222' };

  // (a) modello scelto a mano alla conversione ≠ proposta → mandato registrato ma NON spendibile, e la firma 409
  const T_F = '1a'.repeat(16);
  store.set('preAgreements/paF', paSeed(T_F, { propertyId: 'prop2', lease: { startDate: '2032-01-01', months: 12, endDate: '2032-12-31', type: 'Transitional Lease', lawRef: 'x' } }));
  let r = mkRes();
  await submit(mkReq({ token: T_F, tenant, tenants: [tenant], accept: true, mandate: true }), r);
  const outF = await convertPaToContract({ pa: store.get('preAgreements/paF'), paId: 'paF', type: 'studenti' });
  const cF = store.get('contracts/pa_paF');
  check('conversione con modello diverso dalla proposta: tenantMandate.termsMatch=false, termsDiff=[model], risposta mandateTermsMatch=false',
    outF.ok && cF.type === 'studenti' && cF.tenantMandate && cF.tenantMandate.termsMatch === false && cF.tenantMandate.termsDiff.includes('model') && outF.mandateTermsMatch === false
    && cF.tenantMandate.termsHash === store.get('preAgreements/paF').approvedTerms.hash);
  cF.tenantDelegate = dele;
  r = mkRes();
  await msSubmit(mkReq(body(cF.tenantSignToken)), r);
  check('…e la firma per mandato viene rifiutata (409, changed: model)', r.code === 409 && r.body.error === 'mandate_terms_changed' && r.body.changed.includes('model'));

  // (b) la BASE non si sposta: la proposta viene manomessa DOPO l'accettazione → la foto resta quella dell'accettazione
  const T_G = '2b'.repeat(16);
  store.set('preAgreements/paG', paSeed(T_G, { propertyId: 'prop2', lease: { startDate: '2033-01-01', months: 12, endDate: '2033-12-31', type: 'Transitional Lease', lawRef: 'x' } }));
  r = mkRes();
  await submit(mkReq({ token: T_G, tenant, tenants: [tenant], accept: true, mandate: true }), r);
  const paG = store.get('preAgreements/paG');
  const hashAtAcceptance = paG.approvedTerms.hash;
  paG.money.rent = 1900;   // manomissione dopo l'accettazione (la console non lo permette; una scrittura diretta sì)
  const outG = await convertPaToContract({ pa: paG, paId: 'paG' });
  const cG = store.get('contracts/pa_paG');
  check('proposta manomessa DOPO l\'accettazione: il contratto nasce coi dati nuovi, ma la base del mandato resta la FOTO dell\'accettazione → termsMatch=false (rent)',
    outG.ok && cG.rent === 1900 && cG.tenantMandate.termsHash === hashAtAcceptance && cG.tenantMandate.terms.rent === 1500
    && cG.tenantMandate.termsMatch === false && cG.tenantMandate.termsDiff.includes('rent'));

  // (c) proposta accettata PRIMA della v2 (senza approvedTerms) → foto dalla proposta, dichiarata
  const T_H = '3c'.repeat(16);
  store.set('preAgreements/paH', { ...paSeed(T_H, { propertyId: 'prop2', lease: { startDate: '2034-01-01', months: 12, endDate: '2034-12-31', type: 'Transitional Lease', lawRef: 'x' } }),
    status: 'accepted', ref: 'BOOM-LEGACY', acceptedAt: '2026-09-09T10:00:00Z', tenant: { ...tenant, signature: tenant.fullName }, tenants: [{ ...tenant, signature: tenant.fullName }],
    consent: { at: '2026-09-09T10:00:00Z', text: 'x', hash: 'y', schedaSigned: true }, mandate: { given: true, at: '2026-09-09T10:00:00Z', hash: 'z', text: 'm' } });
  const outH = await convertPaToContract({ pa: store.get('preAgreements/paH'), paId: 'paH' });
  const cH = store.get('contracts/pa_paH');
  check('proposta senza approvedTerms (accettata prima della v2): foto presa dalla proposta e DICHIARATA (proposal-at-conversion), match=true',
    outH.ok && cH.tenantMandate.termsSource === 'proposal-at-conversion' && cH.tenantMandate.termsVersion === 2 && cH.tenantMandate.termsMatch === true
    && cH.tenantMandate.termsHash === (await import('../../api/magic-sign/_shared.js')).mandateTermsHash(MANDATO.termsFromProposal(store.get('preAgreements/paH'))));

  // (c2) proposta SENZA immobile collegato al momento del mandato, immobile scelto alla conversione manuale → non spendibile (propertyId)
  const T_I = '4d'.repeat(16);
  store.set('preAgreements/paI', { ...paSeed(T_I, { lease: { startDate: '2036-01-01', months: 12, endDate: '2036-12-31', type: 'Transitional Lease', lawRef: 'x' } }), propertyId: null });
  r = mkRes();
  await submit(mkReq({ token: T_I, tenant, tenants: [tenant], accept: true, mandate: true }), r);
  const outI = await convertPaToContract({ pa: store.get('preAgreements/paI'), paId: 'paI', propertyId: 'prop2' });
  const cI = store.get('contracts/pa_paI');
  check('mandato dato su una proposta senza immobile collegato, immobile agganciato alla conversione → termsMatch=false (propertyId): il cliente non ha approvato QUEL record',
    r.code === 200 && outI.ok && cI.propertyId === 'prop2' && cI.tenantMandate.terms.propertyId === null && cI.tenantMandate.termsMatch === false && cI.tenantMandate.termsDiff.includes('propertyId'));

  // (d) mandato v1 (nato prima: termsHash = termsFingerprint, senza termsVersion) resta valutato con la regola v1
  store.set('contracts/legacyV1', {
    propertyId: 'prop2', tenantId: 't9', type: 'transitorio', cedolareSecca: 'si', rent: 900, deposit: 1800, startDate: '2035-01-01', endDate: '2035-12-31',
    tenantName: 'Legacy Uno', landlordName: 'Giulia Bianchi', tenantSignToken: 'LEGACYTOK_1', landlordSignToken: 'LEGACYTOK_2',
    signingOrder: 'sequential', signatureStatus: 'none', status: 'active', tenantDelegate: dele,
  });
  const cL = store.get('contracts/legacyV1');
  cL.tenantMandate = { given: true, at: '2026-09-09T00:00:00Z', ref: 'BOOM-V1', hash: 'h', termsHash: termsFingerprint(cL) };
  cL.rent = 950;
  r = mkRes();
  await msSubmit(mkReq(body('LEGACYTOK_1')), r);
  check('mandato v1 con canone cambiato → 409 (regola v1 ancora in vigore)', r.code === 409 && r.body.error === 'mandate_terms_changed');
  cL.rent = 900;
  r = mkRes();
  await msSubmit(mkReq(body('LEGACYTOK_1')), r);
  check('mandato v1 sui termini originali → la firma passa (versionato, non rotto)', r.code === 200 && !!store.get('contracts/legacyV1').tenantSignedByDelegate);

  // (e) il motore: simmetria proposta⇄contratto e cosa NON entra
  const t1 = MANDATO.termsFromProposal(store.get('preAgreements/paD'));
  const t2 = MANDATO.termsFromContract(store.get('contracts/pa_paD'));
  check('motore: la foto dalla proposta e quella dal contratto convertito coincidono (canonical identico)', MANDATO.canonical(t1) === MANDATO.canonical(t2) && MANDATO.diffTerms(t1, t2).length === 0);
  check('motore: la clausola automatica dei co-conduttori non conta come clausola pattuita',
    MANDATO.normClauses('I co-conduttori (A, B) hanno sottoscritto la proposta accettata BOOM-1 e si obbligano in solido…\nNo pets.').join('|') === 'no pets.');
  check('motore: extra, provvigione e add-on NON entrano nella foto (non sono condizioni del contratto di locazione)',
    !('extras' in t1) && !('fee' in t1) && !('addons' in t1) && !('agencyFee' in t1));
  const sh = R('api/magic-sign/_shared.js');
  check('_shared: mandateCheck versionato (v2 → foto; v1 → termsFingerprint), hash con prefisso di versione',
    /Number\(m\.termsVersion\) >= 2/.test(sh) && /termsFingerprint\(contract\) === m\.termsHash/.test(sh) && /'mandato:v2:'/.test(sh));
}

// ═══ 6. Le righe sotto la firma: pagina firme e certificato dicono CHI ha firmato ═══
{
  const { delegateLines } = await import('../../api/sign/_finalize.js');
  const m = delegateLines({ name: 'Valentino Egidi', onBehalfOf: 'Anna Expat', mandateRef: 'BOOM-ABC123', mandateAt: '2026-09-09T10:00:00Z', signedAt: '2026-09-10T10:00:00Z' });
  check('mandato → due righe: "Firma per mandato: …" + "per conto di … - mandato del gg/mm/aaaa (ref)"',
    m.length === 2 && /^Firma per mandato: Valentino Egidi$/.test(m[0]) && /^per conto di Anna Expat - mandato del \d{1,2}\/\d{1,2}\/2026 \(BOOM-ABC123\)$/.test(m[1]));
  const d = delegateLines({ name: 'Valentino Egidi', onBehalfOf: 'Giulia Bianchi', basis: 'delega scritta del proprietario', signedAt: '2026-09-10T10:00:00Z' });
  check('delega → "Firma per delega: …" + "per conto di … - <base>"', d.length === 2 && /^Firma per delega: /.test(d[0]) && /per conto di Giulia Bianchi - delega scritta/.test(d[1]));
  check('nessun delegato → nessuna riga (il documento di chi firma di persona non cambia)', delegateLines(null).length === 0 && delegateLines({}).length === 0);
  const long = delegateLines({ name: 'N'.repeat(90), onBehalfOf: 'O'.repeat(90), mandateRef: 'R'.repeat(40), mandateAt: '2026-01-01' });
  check('righe tagliate a 64 caratteri e SOLO WinAnsi (mai una freccia che fa fallire il PDF)',
    long.every(l => l.length <= 64 && /^[\x20-\xFF]*$/.test(l)));
  const fin = R('api/sign/_finalize.js');
  check('_finalize: pagina firme E certificato passano tenantSignedByDelegate / landlordSignedByDelegate ai blocchi',
    (fin.match(/c\.tenantSignedByDelegate\)/g) || []).length >= 2 && (fin.match(/c\.landlordSignedByDelegate\)/g) || []).length >= 2 && /delegateLines\(dele\)/.test(fin));
}

// ═══ 7. La scheda ARPE firmata: le firme delle parti sul modulo ═══
{
  const { schedaFacts, buildSchedaPdf, resolveCanoneInput, schedaGaps } = await import('../../api/fiscal/fascicolo.js');
  const CANONE = (await import('../../js/canone-engine.js')).default;
  // Un contratto nato dalla proposta porta l'identita' del conduttore sul
  // PROFILO users (convert la bootstrappa): il fascicolo la risale con
  // hydrateParties prima di stampare — qui si fa lo stesso passo.
  const FIELDS = (await import('../../js/contract-fields.js')).default;
  const raw = store.get('contracts/pa_paA');
  const p = store.get('properties/prop1');
  const c = { ...FIELDS.hydrateParties(raw, store.get('users/' + raw.tenantId) || {}, store.get('users/own1') || {}, p),
    landlordSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', landlordSignedAt: '2026-09-11T10:00:00Z' };
  c.tenantSignature = c.landlordSignature;
  check('convert + hydrate: il conduttore della proposta ha nome sul contratto (via profilo users)', c.tenantName === 'Anna Expat');
  const input = resolveCanoneInput({ contract: c, property: p, listing: null });
  const calc = CANONE.solve(input);
  const f = schedaFacts({ contract: c, property: p, calc, input });
  const tl = f.firme.conduttore.lines.join(' | ');
  check('scheda: la firma del conduttore dice "X per conto di Y", "mandato del …", e la firma digitale sulla proposta',
    /Valentino Egidi per conto di Anna Expat/.test(tl) && /mandato del \d{2}\/\d{2}\/\d{4}/.test(tl) && /firma digitale sulla proposta/.test(tl) && !!f.firme.conduttore.image);
  check('scheda: la firma del locatore di persona → "firmato digitalmente il …" con l\'immagine',
    /firmato digitalmente il/.test(f.firme.locatore.lines.join(' ')) && !!f.firme.locatore.image);
  check('scheda: nessun buco (immobile completo) — il foglio esce pronto', schedaGaps(f).length === 0);
  const bytes = Buffer.from(await buildSchedaPdf(f));
  const st = await pdfText(bytes);
  check('scheda PDF: nasce con le firme (1 pagina, le righe del mandato e della proposta stampate)',
    bytes.slice(0, 4).toString() === '%PDF' && st.pages === 1 && /per conto di Anna Expat/.test(st.text) && /firma digitale sulla proposta/.test(st.text));
  dump('scheda-firmata.pdf', bytes);
  // Mutazione: senza accettazione digitale sulla proposta la riga NON compare
  const f2 = schedaFacts({ contract: { ...c, paAcceptance: null, tenantSignedByDelegate: null }, property: p, calc, input });
  check('scheda: senza paAcceptance/mandato le righe non si inventano (solo la firma digitale del contratto)',
    !/proposta/.test(f2.firme.conduttore.lines.join(' ')) && !/per conto/.test(f2.firme.conduttore.lines.join(' ')) && /firmato digitalmente/.test(f2.firme.conduttore.lines.join(' ')));
  const pk = R('api/sign/_pack.js');
  check('pack: 10_Mandato_conduttore.pdf entra SOLO quando la firma è per mandato (tenantSignedByDelegate)',
    /10_Mandato_conduttore\.pdf/.test(pk) && /const tsd = contract\.tenantSignedByDelegate;\s*if \(tsd && tsd\.name\)/.test(pk));
}

// ═══ 8. La Valutazione BOOM dall'IMMOBILE: il documento per il proprietario ═══
{
  const val = (await import('../../api/fiscal/valutazione.js')).default;
  let r = mkRes();
  await val(mkReq({ propertyId: 'prop1', canone: 1650, note: 'Richiesta del proprietario → parere' }, { authorization: 'Bearer tok' }), r);
  check('valutazione da immobile (senza contratto): 200 con url sotto property-docs/<id>/',
    r.code === 200 && r.body.ok && /property-docs%2Fprop1%2Fvalutazione-boom\.pdf|property-docs\/prop1\/valutazione-boom\.pdf/.test(r.body.url));
  const bytes = storageFiles.get('property-docs/prop1/valutazione-boom.pdf');
  let pages = 0, text = '';
  if (bytes) { ({ pages, text } = await pdfText(bytes)); dump('valutazione-immobile.pdf', bytes); }
  check('il PDF ha DUE pagine: parere di mercato + scheda di calcolo brandizzata', pages === 2);
  check('pagina 2: la scheda di calcolo (titolo, superficie convenzionale, parametri, massimo attestabile, canone proposto)',
    /SCHEDA DI CALCOLO DEL CANONE/.test(text) && /SUPERFICIE CONVENZIONALE/.test(text) && /PARAMETRI DESCRITTIVI/.test(text)
    && /MASSIMO ATTESTABILE/.test(text) && /CANONE PROPOSTO/.test(text));
  check('la testata è quella del marchio (_pdfbrand: masthead + piede legale), non disegnata a mano',
    (() => { const s = R('api/fiscal/valutazione.js'); return /masthead\(page, b, \{ W, H, M, title: 'Valutazione locativa'/.test(s) && /stampFooters\(pdf, b, \{ W, M \}\)/.test(s) && !/T\('BOOM', M, H - 27/.test(s); })());
  check('risposta: scheda {gaps, fascia, cMax, fits, nP, sc} — nessun buco sull\'immobile completo',
    r.body.scheda && r.body.scheda.gaps.length === 0 && !!r.body.scheda.fascia && r.body.scheda.cMax > 0 && typeof r.body.scheda.fits === 'boolean');
  check('il canone proposto si stampa come DECISO (1650, nessun tetto)', r.body.canone === 1650);
  const p1 = store.get('properties/prop1');
  check('l\'immobile ricorda il documento (valutazioneBoomUrl/At/Canone)', /valutazione-boom/.test(p1.valutazioneBoomUrl || '') && !!p1.valutazioneBoomAt && p1.valutazioneBoomCanone === 1650);

  // Immobile SENZA zona/mq: il documento esce comunque e DICE cosa manca
  r = mkRes();
  await val(mkReq({ propertyId: 'prop2', canone: 900 }, { authorization: 'Bearer tok' }), r);
  const b2 = storageFiles.get('property-docs/prop2/valutazione-boom.pdf');
  const t2 = b2 ? (await pdfText(b2)).text : '';
  check('immobile senza dati: 200, scheda con i buchi dichiarati (zona, mq, catasto) e "non calcolabile" — mai un numero',
    r.code === 200 && r.body.scheda.gaps.includes('zona') && r.body.scheda.gaps.includes('mq') && r.body.scheda.gaps.includes('catasto')
    && /non calcolabile/.test(t2) && /da completare/.test(t2) && r.body.scheda.cMax === null);
  if (b2) dump('valutazione-vuota.pdf', b2);

  // Dal contratto: stesso documento, marcato anche sul contratto
  r = mkRes();
  await val(mkReq({ contractId: 'pa_paA' }, { authorization: 'Bearer tok' }), r);
  check('valutazione dal contratto: 200, canone del contratto, url sotto contracts/<id>/, contratto marcato',
    r.code === 200 && r.body.canone === 1500 && /contracts(%2F|\/)pa_paA/.test(r.body.url) && /valutazione-boom/.test(store.get('contracts/pa_paA').valutazioneBoomUrl || ''));
  const b3 = storageFiles.get('contracts/pa_paA/valutazione-boom.pdf');
  if (b3) dump('valutazione-contratto.pdf', b3);

  // Senza admin: 403, niente PDF
  store.set('users/caller1', { role: 'tenant' });
  r = mkRes();
  storageFiles.delete('property-docs/prop1/valutazione-boom.pdf');
  await val(mkReq({ propertyId: 'prop1', canone: 1000 }, { authorization: 'Bearer tok' }), r);
  check('non admin: 403 e nessun PDF generato', r.code === 403 && !storageFiles.has('property-docs/prop1/valutazione-boom.pdf'));
  store.set('users/caller1', { role: 'admin', name: 'Valentino', email: 'op@boom.it' });
}

// ═══ 9. Le console: portal, console PA, dizionario ═══
{
  const app = R('js/portal-app.js');
  const fo = app.slice(app.indexOf('function openFirmaOra'), app.indexOf('async function setDelega'));
  check('portal 🖊 Firma ora: card "Mandato del conduttore" con setMandatoTenant, e la riga rossa RESTA (senza mandato non si firma mai)',
    /Mandato del conduttore/.test(fo) && /setMandatoTenant\(/.test(fo) && /non si firma mai/.test(fo) && /firma falsa/.test(fo));
  const sm = app.slice(app.indexOf('async function setMandatoTenant'), app.indexOf('window.setMandatoTenant'));
  check('portal setMandatoTenant: rifiuta senza mandato scritto e a firma già apposta; scrive tenantDelegate nello schema del rail',
    /tenantSignature\) return toast\('error'/.test(sm) && /Nessun mandato scritto/.test(sm) && /tenantDelegate: payload/.test(sm) && /onBehalfOf/.test(sm));
  check('portal: un rinnovo NON eredita mandato/deleghe/accettazione (atti di QUEL contratto)',
    /'tenantMandate', 'tenantDelegate', 'tenantSignedByDelegate', 'landlordSignedByDelegate', 'paAcceptance'/.test(app));
  check('portal: 💶 Valutazione sulla scheda immobile → openValutazione(null, undefined, {propertyId})',
    /openValutazione\(null, undefined, \{propertyId:'\$\{p\.id\}'\}\)/.test(app) && /propertyId: \(!contractId && p\) \? p\.id : undefined/.test(app));
  const adm = R('pre-agreement-admin.html');
  check('console PA: interruttore "offri il mandato" (fMandate) NON preselezionato, persistito nel create E nell\'edit in place, ripristinato solo se esplicito',
    /id="fMandate" style/.test(adm) && !/id="fMandate" checked/.test(adm) && /askMandate:!!\$\('fMandate'\)\.checked/.test(adm) && /askMandate:body\.askMandate/.test(adm) && /\$\('fMandate'\)\.checked=d\.askMandate===true/.test(adm));
  check('pagina cliente: la spunta del mandato compare SOLO con askMandate===true (assente = non offerto)',
    /PA\.askMandate===true/.test(R('pre-agreement.html')) && !/PA\.askMandate!==false/.test(R('pre-agreement.html')));
  check('portal Firma ora: la card dice che il mandato riguarda SOLO il conduttore principale e che i co-conduttori firmano separatamente, e mostra il diff delle condizioni',
    /solo il conduttore principale/.test(fo) && /co-conduttori firmano separatamente/.test(fo) && /describeDiff\(mandDiff\)/.test(fo) && /termsFromContract\(c\)/.test(fo));
  check('portal: mandato-engine caricato dal portal e network-first nel SW; setMandatoTenant rifiuta l\'attivazione a condizioni cambiate',
    /mandato-engine\.js/.test(R('portal.html')) && /\/js\/mandato-engine\.js/.test(R('sw.js')) && /Condizioni cambiate rispetto al mandato/.test(sm));
  check('sign.html: avviso rosso quando termsOk===false (il server rifiuterà)', /termsOk===false/.test(R('sign.html')));
  check('console PA: la riga dice se il mandato è arrivato e la verifica canone segnala il catasto mancante PRIMA di mandare il link',
    /Mandato a firmare ricevuto il/.test(adm) && /scheda 2\/B: manca il catasto/.test(adm));
  const cv = R('api/preagreement/convert.js');
  check('convert.js: la base del mandato è la FOTO della proposta (pa.approvedTerms), mai il contratto — il contratto si VERIFICA (diff), non fa da base',
    /const terms = snap \? snap\.terms : MANDATO\.termsFromProposal\(pa/.test(cv) && /const termsHash = snap \? snap\.hash : mandateTermsHash\(terms\)/.test(cv)
    && /MANDATO\.diffTerms\(terms, MANDATO\.termsFromContract\(contract\)\)/.test(cv) && !/termsFingerprint\(contract\)/.test(cv));
}

// ═══ 10. Il bug della pagina RLI: numeri da rliFacts (L2 per tutti, importo per durata) ═══
{
  const FIELDS = (await import('../../js/contract-fields.js')).default;
  const short = { type: 'transitorio', rent: 1000, startDate: '2026-10-01', endDate: '2027-03-31', cedolareSecca: 'si', tenantName: 'A', landlordName: 'B' };
  const rf = FIELDS.rliFacts(short);
  check('rliFacts transitorio 6 mesi: tipologia L2, importo per RLI = canone × 6 (non × 12)', rf.tipologia === 'L2' && rf.amountForRli === 6000 && rf.months === 6);
  const st = FIELDS.rliFacts({ ...short, type: 'studenti', endDate: '2027-09-30' });
  check('rliFacts studenti: art. 5 c. 2 e accordo 27/07/2023', /art\. 5/.test(st.article) && /27\/07\/2023/.test(st.accordo || ''));
  const a32 = FIELDS.rliFacts({ ...short, type: '3+2', endDate: '2029-09-30' });
  check('rliFacts 3+2: art. 2 c. 3 L. 431/98 e accordo 27/07/2023', /art\. 2, comma 3/.test(a32.article) && /27\/07\/2023/.test(a32.accordo || ''));
  const fsrc = R('api/fiscal/fascicolo.js');
  check('fascicolo pagina RLI: legge FIELDS.rliFacts (non rent×12 a mano)', /const rli = FIELDS\.rliFacts\(contract\)/.test(fsrc) && !/rent \* 12/.test(fsrc.slice(fsrc.indexOf('DATI REGISTRAZIONE RLI'))));
}

console.log(`\nMandato: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:\n - ' + bad.join('\n - ')); process.exit(1); }
