// tests/revise/run.mjs — «Ok, mettiamolo a posto» e i co-conduttori che
// fermavano tutto (3/10/2026). Handler e moduli REALI (preagreement/
// send-sign, magic-sign/submit + lookup, sign/_notify, sign/_cosign,
// contracts/revise, sign/_contractpdf, _finalize), nodemailer mockato via
// loader, Firestore/Storage/IdentityToolkit su stub in memoria, pdf-lib e
// jsPDF VERI.
//
// LE REGOLE:
// A. I co-conduttori ricevono il LORO link da 🖊 Magic Sign (email a chi ce
//    l'ha, link per WhatsApp a tutti), dalla firma del titolare, dal
//    promemoria; il proprietario NON riceve «tocca a Lei» finché manca uno
//    di loro, e il suo link dice CHI manca.
// B. La versione corretta del contratto (PDF caricato) diventa il documento
//    che si firma: nessuna rigenerazione automatica la sovrascrive, una
//    firma già messa sulla versione sbagliata si ARCHIVIA (mai spostata) e
//    si rifirma, la firma completa le appende la pagina delle firme, e un
//    contratto firmato da tutti non si revisiona.
// Uso: node tests/revise/run.mjs
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);
import { readFileSync } from 'node:fs';

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-revise';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.ANTHROPIC_API_KEY;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const mails = () => globalThis.__mails || [];
const mailTo = (addr) => mails().filter(m => m.to === addr);
const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ── Stub fetch (stesso harness di tests/notify) ──────────────────────────
const store = new Map();
const docTimes = new Map();
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
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };

const { PDFDocument } = await import('pdf-lib');
const mkPdf = async (pages) => { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([595, 842]); return Buffer.from(await d.save()); };
const SRC_PDF = await mkPdf(1);
const storageFiles = new Map();
let storagePosts = 0;

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'caller1', email: 'op@boom.it' }] });
  if (url.startsWith('https://storage.example/contract.pdf')) return new Response(SRC_PDF, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  if (url.startsWith('https://storage.example/')) return new Response(Buffer.from('FILE:' + url.slice(24)), { status: 200 });
  if (url.startsWith('https://freetsa.org/tsr')) return new Response(Buffer.alloc(300, 7), { status: 200 });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (opts.method === 'POST') {
      const name = new URL(url).searchParams.get('name');
      if (name) { storageFiles.set(name, Buffer.from(opts.body)); storagePosts++; }
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
    const path = (url.split('/documents')[1] || '').replace(/^\//, '').split('?')[0];
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
          return new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad name' } }), { status: 400 });
        }
        const k = (w.update.name.split('/documents/')[1] || '');
        if (w.currentDocument && w.currentDocument.updateTime) {
          const cur = docTimes.get(k) || '2026-01-01T00:00:00Z';
          if (cur !== w.currentDocument.updateTime) return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: 'stored version does not match' } }), { status: 400 });
        }
        if (w.currentDocument && w.currentDocument.exists === true && !store.has(k)) {
          return new Response(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: 'No document to update: ' + k } }), { status: 404 });
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
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      bump(path);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    if (opts.method === 'DELETE') { store.delete(path); return okJson({}); }
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
let ipN = 1;
const freshIp = () => '10.3.' + Math.floor(ipN / 200) + '.' + (ipN++ % 200 + 1);
const mkReq = (body, headers = {}) => ({ method: 'POST', headers: { 'x-forwarded-for': freshIp(), ...headers }, body, socket: {} });
const ADMIN = { authorization: 'Bearer test-admin-token' };

// ── Seed comune ──────────────────────────────────────────────────────────
store.set('users/caller1', { email: 'op@boom.it', name: 'Valentino', role: 'admin' });
store.set('properties/prop1', { ownerId: 'own1', name: 'Pigneto House', address: 'Via del Pigneto 10', zone: 'Pigneto', rooms: 3, sqm: 80, furnished: true, floor: '2', interno: '14' });
store.set('users/t1', { email: 'anna@expat.com', name: 'Anna Expat', role: 'tenant' });
store.set('users/own1', { email: 'giulia@owner.it', name: 'Giulia Bianchi', role: 'landlord' });

const CONSENT = 'I confirm my identity and accept all lease terms. This digital signature is legally valid (FES — Art. 21 CAD).';
const SIG = 'data:image/png;base64,' + 'A'.repeat(400);
const signBody = (token) => ({ token, signature: SIG, consent: { text: CONSENT, hash: '' }, identity: { cf: 'RSSMRA85T10A562S', dob: '1998-05-04' } });

const baseContract = (extra) => ({
  propertyId: 'prop1', tenantId: 't1', type: 'transitorio', cedolareSecca: 'si',
  rent: 1200, deposit: 2400, startDate: '2026-10-01', endDate: '2027-09-30', paymentDay: 5,
  tenantName: 'Anna Expat', tenantEmail: 'anna@expat.com', landlordName: 'Giulia Bianchi',
  landlordCF: 'BNCGLI70A41H501X', landlordDob: '1970-01-01', landlordPob: 'Roma', landlordAddress: 'Via dei Coronari 8',
  signingOrder: 'sequential', signatureStatus: 'none', status: 'active',
  generatedPDF: 'https://storage.example/contract.pdf', clauseVersion: 2, pdfHash: 'oldhash00000000',
  ...extra,
});

const sendSign = (await import('../../api/preagreement/send-sign.js')).default;
const msSubmit = (await import('../../api/magic-sign/submit.js')).default;
const msLookup = (await import('../../api/magic-sign/lookup.js')).default;
const { cosignRef } = await import('../../api/magic-sign/_shared.js');
const { notifyPartialSignature } = await import('../../api/sign/_notify.js');

// ═══ A. I CO-CONDUTTORI ═══════════════════════════════════════════════════
{
  store.set('contracts/ctrCO', baseContract({
    tenantSignToken: 'TOK_CO_T', landlordSignToken: 'TOK_CO_L', preAgreementId: 'paCO',
    coTenants: [
      { name: 'Marco Rossi', email: 'marco@flat.com', phone: '+39 333 1111111', cf: 'RSSMRC90A01H501Z' },
      { name: 'Luca Bianchi', email: '', phone: '+39 333 2222222' },
    ],
  }));
  store.set('preAgreements/paCO', {
    status: 'paid', paidAt: '2026-09-20T10:00:00Z', paidEur: 1500, ref: 'BOOM-CO1', contractId: 'ctrCO', propertyId: 'prop1',
    tenant: { fullName: 'Anna Expat', email: 'anna@expat.com', phone: '+39 333 0000000' },
    tenants: [{ fullName: 'Anna Expat' }, { fullName: 'Marco Rossi' }, { fullName: 'Luca Bianchi' }],
    property: { address: 'Via del Pigneto 10' }, landlord: { name: 'Giulia Bianchi', email: 'giulia@owner.it' },
    money: { rent: 1200, dueAtSigning: 1500 },
  });

  // 1. 🖊 Magic Sign: il titolare E i co-conduttori
  let r = mkRes();
  await sendSign(mkReq({ id: 'paCO' }, ADMIN), r);
  const toMarco = mailTo('marco@flat.com');
  check('🖊 Magic Sign: 200, email al titolare', r.code === 200 && r.body.emailed === true && mailTo('anna@expat.com').length === 1);
  check('🖊 Magic Sign: il co-conduttore CON email riceve il SUO link (cosignRef c0), con il ruolo detto',
    toMarco.length === 1 && toMarco[0].html.includes(encodeURIComponent(cosignRef('ctrCO', 0)))
    && /co-tenant/.test(toMarco[0].html) && toMarco[0].html.includes('Anna Expat'));
  check('🖊 Magic Sign: chi NON ha email non sparisce — torna nella risposta col link (WhatsApp/copia)',
    Array.isArray(r.body.coTenants) && r.body.coTenants.length === 2
    && r.body.coTenants.some(x => x.name === 'Luca Bianchi' && x.url.includes(encodeURIComponent(cosignRef('ctrCO', 1))) && x.phone)
    && (r.body.coNoEmail || []).includes('Luca Bianchi') && (r.body.coEmailed || []).includes('Marco Rossi'));
  const pa1 = store.get('preAgreements/paCO');
  check('🖊 Magic Sign: i link dei co-conduttori sulla proposta, MAI le loro email',
    Array.isArray(pa1.coSignUrls) && pa1.coSignUrls.length === 2 && pa1.coSignUrls.every(x => !('email' in x) && x.url));
  check('🖊 Magic Sign: l\'invito al co-conduttore è stampato sul contratto (coSignInviteAt.0)',
    !!((store.get('contracts/ctrCO').coSignInviteAt || {})['0']) && !((store.get('contracts/ctrCO').coSignInviteAt || {})['1']));

  // 2. il titolare firma: il proprietario NON riceve «tocca a Lei»
  const giuliaBefore = mailTo('giulia@owner.it').filter(m => /Tocca a Lei/.test(m.subject)).length;
  r = mkRes();
  await msSubmit(mkReq(signBody('TOK_CO_T')), r);
  check('titolare firma: 200 partial', r.code === 200 && r.body.signatureStatus === 'partial');
  check('titolare firma: NESSUN «tocca a Lei» al proprietario (mancano i co-conduttori)',
    mailTo('giulia@owner.it').filter(m => /Tocca a Lei/.test(m.subject)).length === giuliaBefore);
  const conf = mailTo('anna@expat.com').filter(m => /signature is recorded/.test(m.subject)).pop();
  check('titolare firma: la sua conferma dice CHI manca, non «aspettiamo il proprietario»',
    !!conf && conf.html.includes('Marco Rossi') && conf.html.includes('Luca Bianchi') && /The other tenants sign/.test(conf.html));
  check('titolare firma: chi aveva già il link non lo riceve due volte nello stesso minuto', mailTo('marco@flat.com').length === 1);

  // 3. il link del proprietario dice CHI manca
  r = mkRes();
  await msLookup(mkReq({ token: 'TOK_CO_L' }), r);
  check('link del proprietario: 409 awaiting_tenant CON i nomi di chi manca',
    r.code === 409 && r.body.error === 'awaiting_tenant'
    && JSON.stringify(r.body.waitingFor) === JSON.stringify([{ name: 'Marco Rossi', role: 'cotenant' }, { name: 'Luca Bianchi', role: 'cotenant' }]));

  // 4. il promemoria (nudge del cron) va ai co-conduttori, non al proprietario
  const c4 = { ...store.get('contracts/ctrCO'), id: 'ctrCO' };
  const nr = await notifyPartialSignature(c4, 'tenant', null, { nudgeOnly: true });
  check('promemoria: al co-conduttore con email («Reminder»), al proprietario niente',
    mailTo('marco@flat.com').length === 2 && /^Reminder/.test(mailTo('marco@flat.com')[1].subject)
    && mailTo('giulia@owner.it').filter(m => /Tocca a Lei/.test(m.subject)).length === giuliaBefore
    && (nr.coNoEmail || []).includes('Luca Bianchi'));

  // 5. 👥 solo i co-conduttori: nessuna email al titolare
  const annaBefore = mailTo('anna@expat.com').length;
  r = mkRes();
  await sendSign(mkReq({ id: 'paCO', coOnly: true }, ADMIN), r);
  check('👥 coOnly: link dei co-conduttori, email a chi ce l\'ha, niente al titolare',
    r.code === 200 && r.body.coOnly === true && r.body.coTenants.length === 2
    && mailTo('anna@expat.com').length === annaBefore && mailTo('marco@flat.com').length === 3);

  // 6. i co-conduttori firmano col LORO link; il proprietario solo dopo l'ULTIMO
  r = mkRes();
  await msSubmit(mkReq(signBody(cosignRef('ctrCO', 0))), r);
  check('co-conduttore 1 firma col suo link: 200', r.code === 200);
  check('… manca ancora Luca: il proprietario NON è chiamato',
    mailTo('giulia@owner.it').filter(m => /Tocca a Lei/.test(m.subject)).length === giuliaBefore);
  r = mkRes();
  await msSubmit(mkReq(signBody(cosignRef('ctrCO', 1))), r);
  check('co-conduttore 2 firma: lato conduttori completo → «tocca a Lei» al proprietario, UNA volta',
    r.code === 200 && mailTo('giulia@owner.it').filter(m => /Tocca a Lei/.test(m.subject)).length === giuliaBefore + 1);
  r = mkRes();
  await msLookup(mkReq({ token: 'TOK_CO_L' }), r);
  check('ora il link del proprietario si apre', r.code === 200 && r.body.role === 'landlord');

  // 6b. i deal GIÀ fermi (convertiti prima del fix: il co-conduttore non ha
  //     mai ricevuto niente): la firma del titolare gli manda il link
  store.set('contracts/ctrOLD', baseContract({
    tenantSignToken: 'TOK_OLD_T', landlordSignToken: 'TOK_OLD_L',
    coTenants: [{ name: 'Sara Neri', email: 'sara@flat.com' }],
  }));
  r = mkRes();
  await msSubmit(mkReq(signBody('TOK_OLD_T')), r);
  const toSara = mailTo('sara@flat.com');
  check('deal fermo: alla firma del titolare il co-conduttore MAI invitato riceve il suo link',
    r.code === 200 && toSara.length === 1 && toSara[0].html.includes(encodeURIComponent(cosignRef('ctrOLD', 0)))
    && !!((store.get('contracts/ctrOLD').coSignInviteAt || {})['0']));

  // 7. le giunzioni che i test sopra non esercitano
  const cron = src('api/reminder-cron.js');
  const ci = cron.indexOf('fsGetFull(\'contracts/\' + c0.id)');
  check('cron: il promemoria rilegge il contratto INTERO prima di decidere il lato conduttori (parseDoc appiattiva coTenants → «tocca a Lei» al proprietario)',
    ci > 0 && ci < cron.indexOf('const sideDone = tenantSideComplete(c);'));
  const sf = src('api/preagreement/sign-for.js');
  check('✍️ Firmo io: con co-conduttori mancanti torna i LORO link (e li stampa sulla proposta)',
    /coTenants: coLinks/.test(sf) && /coSignUrls: coSignUrlsForPa\(contractId, fresh\)/.test(sf));
  const sl = src('api/sign/send-link.js');
  check('portal send-link: una copia sola dell\'invito ai co-conduttori (_cosign.js)', /inviteCoTenants\(/.test(sl) && !/cosignRef\(/.test(sl));
  const sign = src('sign.html');
  check('sign.html: il proprietario legge i NOMI di chi manca, in italiano', /function turnText\(w,plain\)/.test(sign)
    && /turnText\(j\.waitingFor\)/.test(sign) && /e_turn_w:'Manca ancora la firma di: \{names\}/.test(sign) && /setLang\(sl\|\|'it', true\)/.test(sign));
  const cons = src('pre-agreement-admin.html');
  check('console: 👥 Link co-conduttori come mossa primaria a titolare firmato, e il link del proprietario nascosto finché mancano',
    /sig\.tenantSigned&&coWait&&cid/.test(cons) && /!\(sig\.tenantSigned&&coWait\)&&d\.landlordSignUrl/.test(cons)
    && /function showCoLinks\(d,list,note\)/.test(cons) && /coOnly:true/.test(cons));
  check('console: il prossimo passo nomina i co-conduttori invece di «manca il proprietario»',
    /mancano i <b>co-conduttori<\/b>/.test(cons));
  const paLook = src('api/preagreement/lookup.js');
  check('pagina della proposta: al titolare solo i NOMI dei co-conduttori che mancano (mai i loro link)',
    /waitingCoTenants: complete \? \[\]/.test(paLook) && !/cosignRef/.test(paLook));
}

// ═══ B. LA VERSIONE CORRETTA ══════════════════════════════════════════════
const revise = (await import('../../api/contracts/revise.js')).default;
const { ensureContractPdf } = await import('../../api/sign/_contractpdf.js');
const callRevise = async (body, headers = ADMIN) => { const r = mkRes(); await revise(mkReq(body, headers), r); return r; };
{
  store.set('contracts/ctrRV', baseContract({
    tenantSignToken: 'TOK_RV_T', landlordSignToken: 'TOK_RV_L', preAgreementId: 'paRV',
    signInviteTenantAt: '2026-09-25T10:00:00Z',
  }));
  store.set('preAgreements/paRV', { status: 'paid', ref: 'BOOM-RV1', contractId: 'ctrRV' });

  let r = mkRes();
  await revise(mkReq({ op: 'status', contractId: 'ctrRV' }), r);
  check('revise: senza credenziale 401', r.code === 401);
  store.get('users/caller1').role = 'landlord';
  r = await callRevise({ op: 'status', contractId: 'ctrRV' });
  check('revise: solo admin (403 a un proprietario)', r.code === 403);
  store.get('users/caller1').role = 'admin';

  r = await callRevise({ op: 'status', contractId: 'ctrRV' });
  check('status: versione 1, modello BOOM, revisionabile, nessuna firma da archiviare',
    r.code === 200 && r.body.version === 1 && r.body.source === 'boom' && r.body.canRevise === true && r.body.needsVoid === false);

  r = await callRevise({ op: 'upload', contractId: 'ctrRV', pdfBase64: Buffer.from('ciao, non sono un pdf').toString('base64') });
  check('upload: un file che non è un PDF → 422, contratto intatto', r.code === 422 && r.body.error === 'not_pdf' && store.get('contracts/ctrRV').contractVersion == null);

  r = await callRevise({ op: 'upload', contractId: 'ctrRV', fileUrl: 'https://evil.example/x.pdf' });
  check('upload: un URL fuori da Storage/contracts/<id>/ non viene MAI scaricato (non è un proxy)', r.code === 400 && r.body.error === 'bad_file_url');

  const V2 = await mkPdf(3);
  const annaBefore = mailTo('anna@expat.com').length;
  r = await callRevise({ op: 'upload', contractId: 'ctrRV', pdfBase64: 'data:application/pdf;base64,' + V2.toString('base64'), fileName: 'contratto corretto.pdf', note: 'piano 2, int. 14' });
  const cv2 = store.get('contracts/ctrRV');
  check('upload: 200, versione 2, 3 pagine', r.code === 200 && r.body.version === 2 && r.body.pages === 3);
  check('upload: i byte in Storage sono ESATTAMENTE quelli caricati, su un path di versione',
    !!storageFiles.get('contracts/ctrRV/contract-v2.pdf') && storageFiles.get('contracts/ctrRV/contract-v2.pdf').equals(V2));
  check('upload: il contratto punta alla versione caricata (pdfSource upload, niente ancore, nota)',
    String(cv2.generatedPDF).includes('contract-v2.pdf') && cv2.pdfSource === 'upload' && cv2.sigAnchors === null
    && cv2.pdfUploadNote === 'piano 2, int. 14' && cv2.contractVersion === 2 && cv2.pdfHash !== 'oldhash00000000');
  check('upload: la versione 1 resta nella storia (url + hash)',
    Array.isArray(cv2.contractVersions) && cv2.contractVersions.length === 1 && cv2.contractVersions[0].v === 1
    && cv2.contractVersions[0].url === 'https://storage.example/contract.pdf' && cv2.contractVersions[0].hash === 'oldhash00000000');
  const upd = mailTo('anna@expat.com').slice(annaBefore);
  check('upload: l\'inquilino (già invitato) riceve «Updated contract» col suo link',
    upd.length === 1 && /Updated contract/.test(upd[0].subject) && upd[0].html.includes('TOK_RV_T') && r.body.notified.tenant === true);

  // la guardia: NESSUNA rigenerazione automatica sovrascrive la versione caricata
  const postsBefore = storagePosts;
  const u1 = await ensureContractPdf('ctrRV', null, { force: true });
  check('ensureContractPdf (anche force): la versione caricata NON si rigenera',
    u1 === cv2.generatedPDF && storagePosts === postsBefore && !storageFiles.has('contracts/ctrRV/contract.pdf'));
  r = mkRes();
  await msLookup(mkReq({ token: 'TOK_RV_T' }), r);
  check('/sign mostra la versione caricata', r.code === 200 && String(r.body.contract.generatedPDF).includes('contract-v2.pdf'));

  // l'inquilino firma la v2 (la prima firma forza un refresh del PDF: qui no)
  r = mkRes();
  await msSubmit(mkReq(signBody('TOK_RV_T')), r);
  check('l\'inquilino firma la v2: 200 partial, il PDF è ancora quello caricato',
    r.code === 200 && String(store.get('contracts/ctrRV').generatedPDF).includes('contract-v2.pdf') && storagePosts === postsBefore);

  // una nuova correzione con una firma viva: si DICE, non si fa da sola
  const V3 = await mkPdf(4);
  r = await callRevise({ op: 'upload', contractId: 'ctrRV', pdfBase64: V3.toString('base64') });
  check('firma viva senza voidSignatures → 409 signed_needs_void coi nomi, nulla toccato',
    r.code === 409 && r.body.error === 'signed_needs_void' && r.body.signed[0].name === 'Anna Expat'
    && !!store.get('contracts/ctrRV').tenantSignature && store.get('contracts/ctrRV').contractVersion === 2);

  const annaB2 = mailTo('anna@expat.com').length;
  r = await callRevise({ op: 'upload', contractId: 'ctrRV', pdfBase64: V3.toString('base64'), voidSignatures: true, note: 'art. 3 riformattato' });
  const cv3 = store.get('contracts/ctrRV');
  const arch = ((cv3.contractVersions || [])[1] || {}).voidedSignatures || [];
  check('con voidSignatures: versione 3, la firma della v2 ARCHIVIATA (chi, quando, hash) e riaperta',
    r.code === 200 && r.body.version === 3 && cv3.tenantSignature == null && cv3.signatureStatus === 'none'
    && cv3.signedTermsHash == null && arch.length === 1 && arch[0].role === 'tenant' && arch[0].name === 'Anna Expat'
    && /^[a-f0-9]{64}$/.test(arch[0].signatureSha256) && !!arch[0].signedAt);
  check('i byte della v2 (quella che Anna ha visto) restano intatti in Storage', storageFiles.get('contracts/ctrRV/contract-v2.pdf').equals(V2));
  check('la proposta torna a dire «nessuna firma»', store.get('preAgreements/paRV').contractSignatureStatus === 'none' && store.get('preAgreements/paRV').contractVersion === 3);
  check('Anna riceve il link della nuova versione', mailTo('anna@expat.com').slice(annaB2).some(m => /Updated contract/.test(m.subject)));
  r = mkRes();
  await msLookup(mkReq({ token: 'TOK_RV_T' }), r);
  check('il link di Anna si riapre sulla v3 (non più «hai già firmato»)', r.code === 200 && String(r.body.contract.generatedPDF).includes('contract-v3.pdf'));

  // il giro completo sulla versione caricata
  r = mkRes(); await msSubmit(mkReq(signBody('TOK_RV_T')), r);
  const r2 = mkRes(); await msSubmit(mkReq(signBody('TOK_RV_L')), r2);
  check('firme complete sulla v3', r.code === 200 && r2.code === 200 && r2.body.fullySigned === true);
  let pages = 0;
  try { pages = (await PDFDocument.load(storageFiles.get('contracts/ctrRV/contratto-firmato.pdf'))).getPageCount(); } catch (_) {}
  check('firma completa: il contratto firmato è la v3 CARICATA (4 pagine) + la pagina delle firme', pages === 5);

  r = await callRevise({ op: 'upload', contractId: 'ctrRV', pdfBase64: V2.toString('base64'), voidSignatures: true });
  check('firmato da tutti → 409 fully_signed (una correzione lì è un nuovo contratto)', r.code === 409 && r.body.error === 'fully_signed');

  // ↺ modello BOOM: dalla versione caricata si torna al modello, su un path nuovo
  store.set('contracts/ctrTP', baseContract({ tenantSignToken: 'TOK_TP_T', landlordSignToken: 'TOK_TP_L' }));
  r = await callRevise({ op: 'upload', contractId: 'ctrTP', pdfBase64: V2.toString('base64') });
  const notifiedFresh = r.body && r.body.notified;
  r = await callRevise({ op: 'template', contractId: 'ctrTP', note: 'dati corretti' });
  const tp = store.get('contracts/ctrTP');
  check('↺ modello BOOM: versione 3 rigenerata dai dati, path suo, la v2 caricata intatta',
    r.code === 200 && r.body.version === 3 && tp.pdfSource === 'boom' && String(tp.generatedPDF).includes('contract-v3.pdf')
    && !!storageFiles.get('contracts/ctrTP/contract-v3.pdf') && storageFiles.get('contracts/ctrTP/contract-v2.pdf').equals(V2)
    && tp.sigAnchors && Array.isArray(tp.sigAnchors.blocks) && tp.sigAnchors.blocks.length > 0);
  check('un contratto mai mandato in firma: nessuna email partita dalla revisione', notifiedFresh && notifiedFresh.tenant === false);
  const tpPdf = storageFiles.get('contracts/ctrTP/contract-v3.pdf');
  check('↺ il modello stampa il piano e l\'interno dall\'immobile (piano 2, int. 14)', !!tpPdf && /piano 2/.test(tpPdf.toString('latin1')) && /int\. 14/.test(tpPdf.toString('latin1')));

  // giunzioni
  const cp = src('api/sign/_contractpdf.js');
  check('guardia: in ensureContractPdf la versione caricata vince PRIMA di force e della firma',
    cp.indexOf('if (isUploadedPdf(contract)) return contract.generatedPDF;') > 0
    && cp.indexOf('if (isUploadedPdf(contract)) return contract.generatedPDF;') < cp.indexOf('opts && opts.force) && contract.generatedPDF'));
  const rv = src('api/contracts/revise.js');
  check('revise: la scrittura è condizionata all\'updateTime letto (una firma arrivata nel mezzo non si cancella)',
    /precondition: \{ updateTime: got\.updateTime \}/.test(rv));
  check('revise: il modello si impagina PRIMA del commit (mai firme riaperte su un documento che non nasce)',
    rv.indexOf('renderContractPdf(contractId, base)') < rv.indexOf('await commitWrites([{ docPath: \'contracts/\' + contractId'));
  const portal = src('js/portal-app.js');
  check('portal 🔄 Rigenera: con una firma viva o un PDF caricato passa da /api/contracts/revise (mai in silenzio)',
    /if \(liveSigs\.length \|\| contract\.pdfSource === 'upload'\)/.test(portal) && /fetch\('\/api\/contracts\/revise'/.test(portal)
    && /contract\.pdfSource === 'upload' && contract\.generatedPDF\) \{ console\.warn/.test(portal));
  const cons = src('pre-agreement-admin.html');
  check('console: 📤 Carica versione corretta (oltre 3 MB via Storage sotto contracts/<id>/) e ↺ Modello BOOM',
    /window\.uploadRevision=async function/.test(cons) && /'contracts\/'\+cid\+'\/revisions\/upload-'/.test(cons)
    && /window\.reviseTemplate=async function/.test(cons) && /📤 Carica versione corretta/.test(cons));
  check('console: ✎ Correggi i dati — i campi già compilati coi valori attuali, parte solo ciò che cambia',
    /completaDati\(\\''\+d\.id\+'\\',true\)/.test(cons) && /data-orig/.test(cons) && /if\(v===String\(el\.getAttribute\('data-orig'\)\|\|''\)\.trim\(\)\)return;/.test(cons)
    && /includeFilled = !!\(b && b\.all === true\) && auth\.profile\.role === 'admin'/.test(src('api/profile/link.js')));
}

console.log(`\nRevisione + co-conduttori: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI:\n - ' + bad.join('\n - ')); process.exit(1); }
