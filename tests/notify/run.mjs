// tests/notify/run.mjs — il ciclo email del contratto, blindato.
// Handler e moduli REALI (sign/_finalize, sign/_notify, sign/send-link,
// profile/submit); nodemailer mockato via loader (le email finiscono in
// __mails), Firestore/Storage/IdentityToolkit su stub in-memory. Copre LE
// REGOLE: il fascicolo CAF va a valentino@boom-rome.com esattamente una
// volta, l'invito firma porta il link /sign giusto per il ruolo giusto
// nella lingua giusta, il locatore sequenziale non viene invitato prima
// del tempo, la scheda completa conferma il cliente una volta sola.
// Uso: node tests/notify/run.mjs
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-notify';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ADMIN_NOTIFY_EMAIL;
delete process.env.CAF_EMAIL;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const mails = () => globalThis.__mails || [];
const mailTo = (addr) => mails().filter(m => m.to === addr);

// ── Stub fetch: Firestore in-memory (valori annidati) + Storage + Auth ──
const store = new Map();
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

// PDF sorgente del contratto (1 pagina, pdf-lib REALE): serve a testare che
// finalize lo scarichi e gli appenda la pagina firme.
const { PDFDocument: TestPDF } = await import('pdf-lib');
const SRC_PDF = Buffer.from(await (async () => { const d = await TestPDF.create(); d.addPage([595, 842]); return d.save(); })());
// Storage in-memory: gli upload conservano i byte, i GET alt=media li
// riservono — così gli ALLEGATI delle email sono i PDF veri, verificabili.
const storageFiles = new Map();

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'caller1', email: 'op@boom.it' }] });
  if (url.startsWith('https://storage.example/contract.pdf')) return new Response(SRC_PDF, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  // Qualsiasi altro file "esterno" (documenti identità, dossier immobile):
  // contenuto deterministico dal path, così il test verifica la FEDELTÀ
  // dei byte dentro lo ZIP del pack.
  if (url.startsWith('https://storage.example/')) return new Response(Buffer.from('FILE:' + url.slice(24)), { status: 200 });
  // TSA RFC3161 (freetsa): risposta finta abbastanza lunga da passare il
  // sanity check (>100 byte) — la marca temporale viene archiviata.
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
    const path = (url.split('/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    const bump = (k) => docTimes.set(k, new Date(Date.now() + docTimes.size).toISOString());
    const docRow = (k) => ({ name: 'projects/p/databases/(default)/documents/' + k, fields: toFsFields(store.get(k)), updateTime: docTimes.get(k) || '2026-01-01T00:00:00Z', createTime: '2026-01-01T00:00:00Z' });
    // runQuery REALE (filtro EQUAL su un campo): serve a findContractByToken
    // e alle fsList del completamento firma.
    if (path.startsWith(':runQuery')) {
      const sq = (JSON.parse(opts.body || '{}') || {}).structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const ff = (sq.where || {}).fieldFilter;
      const rows = [];
      for (const [k] of store) {
        if (!k.startsWith(col + '/')) continue;
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
    // :commit con updateMask (merge) e PRECONDIZIONE currentDocument.updateTime
    if (path.startsWith(':commit')) {
      const writes = (JSON.parse(opts.body || '{}') || {}).writes || [];
      for (const w of writes) {
        // Severo come il VERO Firestore: il name di un write è un RESOURCE
        // NAME (projects/…), mai un URL. Lo stub permissivo qui ha nascosto
        // il bug che in produzione bloccava OGNI firma (2026-08-02).
        if (!/^projects\/[^/]+\/databases\/\(default\)\/documents\/.+/.test(String(w.update.name))) {
          return new Response(JSON.stringify({ error: { code: 400, message: `Document name "${w.update.name}" is invalid`, status: 'INVALID_ARGUMENT' } }), { status: 400 });
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
const docTimes = new Map();

const mkRes = () => ({
  code: 0, body: null, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; },
  end() { return this; },
});
let IP = '9.1.1.1';
const mkReq = (body, headers = {}) => ({ method: 'POST', headers: { 'x-forwarded-for': IP, ...headers }, body, socket: {} });

// ── Seed ─────────────────────────────────────────────────────────────────
store.set('properties/prop1', { ownerId: 'own1', name: 'Trastevere Loft', address: 'Via della Lungaretta 12', zone: 'Trastevere', rooms: 3, sqm: 78, furnished: true, energyClass: 'F', cadastralData: 'foglio 495, part. 120, sub 8', features: ['elevator', 'ac', 'balcony'],
  dossier: {
    visura:      { url: 'https://storage.example/visura.pdf', name: 'visura.pdf', contentType: 'application/pdf', at: '2026-07-01' },
    planimetria: { url: 'https://storage.example/pln.pdf', name: 'pln.pdf', contentType: 'application/pdf', at: '2026-07-01' },
    ape:         { url: 'https://storage.example/ape.pdf', name: 'ape.pdf', contentType: 'application/pdf', at: '2026-07-01' },
    delega:      { url: 'https://storage.example/delega.pdf', name: 'delega.pdf', contentType: 'application/pdf', at: '2026-07-01' },
  } });
store.set('users/t1', { email: 'anna@expat.com', name: 'Anna Expat', role: 'tenant' });
store.set('users/own1', { email: 'giulia@owner.it', name: 'Giulia Bianchi', role: 'landlord' });

const FULL = {
  id: 'ctrF', propertyId: 'prop1', tenantId: 't1',
  type: 'studenti', requiresAsseverazione: true, cedolareSecca: 'si',
  rent: 1450, deposit: 2900, startDate: '2026-09-01', endDate: '2027-08-31',
  installmentMonths: 3, paymentDay: 5,
  tenantName: 'Anna Expat', tenantCF: 'RSSMRA85T10A562S', tenantDob: '1998-05-04',
  tenantPob: 'Boston, USA', tenantAddress: 'Via della Lungaretta 12', tenantDocType: 'passport',
  tenantDocNum: 'USA991', tenantDocIssuer: 'US Dept of State', tenantDocIssueDate: '2022-01-01',
  tenantNationality: 'American',
  landlordName: 'Giulia Bianchi', landlordCF: 'BNCGLI70A41H501X', landlordDob: '1970-01-01',
  landlordPob: 'Roma', landlordAddress: 'Via dei Coronari 8',
  tenantSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  landlordSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  tenantSignedAt: '2026-07-29T10:00:00Z', landlordSignedAt: '2026-07-29T11:00:00Z',
  fullySignedAt: '2026-07-29T11:00:00Z', signatureStatus: 'complete',
  generatedPDF: 'https://storage.example/contract.pdf',
  // Ancore delle righe-firma come le scrive il generatore del portal:
  // esercitano la stampa delle firme SUL contratto (non solo l'addendum).
  sigAnchors: { v: 1, blocks: [
    { role: 'landlord', page: 1, xr: 0.084, yr: 0.72, wr: 0.27, hr: 0.074 },
    { role: 'tenant', page: 1, xr: 0.62, yr: 0.72, wr: 0.27, hr: 0.074 },
  ] },
  identityDocs: [{ url: 'https://storage.example/doc1.jpg', name: 'passport.jpg', role: 'tenant', at: '2026-07-28' }],
  depositPaid: true,
};
store.set('contracts/ctrF', { ...FULL });

// ═══ 1. finalize: welcome + fascicolo CAF, una volta sola ═══
const { finalizeContract } = await import('../../api/sign/_finalize.js');
{
  const out = await finalizeContract({ ...FULL });
  check('finalize: ok + caf inviato', out.ok === true && out.caf === true);

  const caf = mailTo('valentino@boom-rome.com').filter(m => /Asseverazione/i.test(m.subject));
  check('CAF: arriva a valentino@boom-rome.com', caf.length === 1);
  check('CAF: anagrafica completa di ENTRAMBE le parti', caf.length === 1
    && caf[0].html.includes('RSSMRA85T10A562S') && caf[0].html.includes('BNCGLI70A41H501X')
    && caf[0].html.includes('US Dept of State'));
  check('CAF: linka il contratto FIRMATO + certificato', caf.length === 1
    && caf[0].html.includes('contratto-firmato.pdf')
    && caf[0].html.includes('signing-certificate.pdf'));
  check('CAF: contratto firmato + certificato + fascicolo + DOCUMENTO IDENTITÀ in allegato', caf.length === 1
    && (caf[0].attachments || []).length === 4
    && ['BOOM_Contratto_firmato.pdf', 'BOOM_Certificato_di_firma.pdf', 'BOOM_Fascicolo_Fiscale.pdf']
        .every(n => (caf[0].attachments || []).some(a => a.filename === n))
    && (caf[0].attachments || []).some(a => a.filename === 'Documento_identita_1_passport.jpg'));

  // Il contratto firmato: PDF sorgente (1 pagina) + pagina delle firme = 2.
  const ctrPatched = store.get('contracts/ctrF');
  check('contratto firmato: URL persistito sul contratto', out.signedPdf === true
    && String(ctrPatched.signedPdfUrl || '').includes('contratto-firmato.pdf'));
  const signedBytes = storageFiles.get('contracts/ctrF/contratto-firmato.pdf');
  let signedPages = 0;
  try { signedPages = (await TestPDF.load(signedBytes)).getPageCount(); } catch {}
  check('contratto firmato: PDF originale + pagina firme appesa', signedPages === 2);

  // ── Pack Registrazione: uno ZIP con TUTTO, e l'indice che dice la verità ──
  const readZip = (buf) => {
    const eocd = buf.length - 22;
    if (buf.readUInt32LE(eocd) !== 0x06054b50) throw new Error('no_eocd');
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const files = {};
    for (let i = 0; i < count; i++) {
      if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad_central');
      const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), cmtLen = buf.readUInt16LE(off + 32);
      const size = buf.readUInt32LE(off + 24);
      const lho = buf.readUInt32LE(off + 42);
      const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
      const ln = buf.readUInt16LE(lho + 26), le = buf.readUInt16LE(lho + 28);
      files[name] = buf.slice(lho + 30 + ln + le, lho + 30 + ln + le + size);
      off += 46 + nameLen + extraLen + cmtLen;
    }
    return files;
  };
  check('pack: generato e URL persistito sul contratto', out.pack === true
    && String(ctrPatched.registrationPackUrl || '').includes('pack-registrazione.zip'));
  let zf = {};
  try { zf = readZip(storageFiles.get('contracts/ctrF/pack-registrazione.zip')); } catch (e) { console.log('  zip parse:', e.message); }
  const zNames = Object.keys(zf);
  check('pack: contiene indice, contratto firmato, certificato, fascicolo',
    zNames.includes('00_INDICE.txt') && zNames.includes('01_Contratto_firmato.pdf')
    && zNames.includes('02_Certificato_firma_FES.pdf') && zNames.includes('03_Fascicolo_Fiscale.pdf'));
  check('pack: contiene visura, planimetria, APE, delega dal dossier immobile',
    zNames.some(n => n.startsWith('04_Visura')) && zNames.some(n => n.startsWith('05_Planimetria'))
    && zNames.some(n => n.startsWith('06_APE')) && zNames.some(n => n.startsWith('07_Delega')));
  check('pack: contiene il documento identità del conduttore',
    zNames.some(n => n.startsWith('08_1_Documento_conduttore')));
  check('pack: i byte del contratto firmato dentro lo ZIP sono IDENTICI a quelli in Storage',
    !!zf['01_Contratto_firmato.pdf'] && zf['01_Contratto_firmato.pdf'].equals(storageFiles.get('contracts/ctrF/contratto-firmato.pdf')));
  const indice = String(zf['00_INDICE.txt'] || '');
  check('pack: INDICE con codici fiscali di entrambe le parti',
    indice.includes('RSSMRA85T10A562S') && indice.includes('BNCGLI70A41H501X'));
  check('pack: INDICE dice cosa MANCA (attestazione studenti) e dove caricarla',
    /MANCA/.test(indice) && indice.includes('Attestazione iscrizione universitaria') && /dove:/.test(indice));
  check('pack: il CAF riceve il link allo ZIP con l\'avviso dei mancanti', caf.length === 1
    && caf[0].html.includes('pack-registrazione.zip')
    && /Nel pack mancano/.test(caf[0].html) && caf[0].html.includes('Attestazione iscrizione universitaria'));

  const wt = mailTo('anna@expat.com').filter(m => /Welcome home/.test(m.subject));
  check('welcome tenant: inglese, link portal', wt.length === 1 && /Enter my portal/i.test(wt[0].html));
  check('welcome tenant: contratto firmato + certificato IN ALLEGATO', wt.length === 1
    && (wt[0].attachments || []).length === 2
    && (wt[0].attachments || []).some(a => a.filename === 'BOOM_Signed_Contract.pdf' && a.content && a.content.length > 500)
    && (wt[0].attachments || []).some(a => a.filename === 'BOOM_Signing_Certificate.pdf')
    && /Attached/.test(wt[0].html));
  const wl = mailTo('giulia@owner.it').filter(m => /Contratto firmato/.test(m.subject));
  check('welcome landlord: italiano, passi fiscali', wl.length === 1 && /Cedolare secca/.test(wl[0].html) && /RLI/.test(wl[0].html));
  check('welcome landlord: contratto firmato + certificato IN ALLEGATO (nomi IT)', wl.length === 1
    && (wl[0].attachments || []).length === 2
    && (wl[0].attachments || []).some(a => a.filename === 'BOOM_Contratto_firmato.pdf')
    && (wl[0].attachments || []).some(a => a.filename === 'BOOM_Certificato_di_firma.pdf')
    && /In allegato/.test(wl[0].html));
  check('welcome landlord: cessione fabbricato per extra-UE', wl.length === 1 && /Questura/.test(wl[0].html));
  // Il masthead è PURAMENTE tipografico: l'anteprima in browser reale ha
  // mostrato il PNG hosted con un artefatto chiaro sopra il wordmark, e con
  // le immagini bloccate lasciava un buco. Il tipo non può tradire — quindi
  // qui si asserisce che il wordmark c'è e che NESSUNA immagine è tornata.
  check('design: masthead tipografico (wordmark oro, MAI un <img>)', wt.length === 1
    && wt[0].html.includes('B&nbsp;O&nbsp;O&nbsp;M') && !/<img/i.test(wt[0].html.split('bp-paper')[0]));

  // Fascicolo Fiscale: generato dentro finalize, linkato nel CAF, snapshot
  // del calcolo canone persistito sul contratto (zona Trastevere → B14).
  const ctr = store.get('contracts/ctrF');
  check('fascicolo: PDF generato e URL sul contratto',
    typeof ctr.fascicoloFiscaleUrl === 'string' && ctr.fascicoloFiscaleUrl.includes('fascicolo-fiscale.pdf'));
  check('fascicolo: calcolo canone persistito (zona B14, fascia, verdetto)',
    ctr.canoneScheda && ctr.canoneScheda.zonaCod === 'B14' && !!ctr.canoneScheda.fascia
    && typeof ctr.canoneScheda.cMax === 'number' && ctr.canoneScheda.fits === true);
  const caf2 = mailTo('valentino@boom-rome.com').find(m => /Asseverazione/i.test(m.subject));
  check('CAF: il Fascicolo Fiscale è linkato nell\'email', !!caf2 && caf2.html.includes('Fascicolo Fiscale'));

  const before = mails().length;
  const again = await finalizeContract({ ...FULL, finalizedAt: '2026-07-29T11:05:00Z' });
  check('finalize: idempotente — nessuna nuova email al retry', again.skipped === true && mails().length === before);
}

// ═══ 1c. Contratto legacy SENZA PDF sorgente: mai bloccare la firma ═══
// Niente generatedPDF → niente contratto-firmato, ma le welcome partono
// comunque col certificato in allegato e il CAF dice la verità sul PDF.
{
  const G = { ...FULL, id: 'ctrG' };
  delete G.generatedPDF;
  store.set('contracts/ctrG', { ...G });
  const b = mails().length;
  const out = await finalizeContract({ ...G });
  check('legacy senza PDF: finalize ok, signedPdf false', out.ok === true && out.signedPdf === false);
  const wt = mails().slice(b).find(m => m.to === 'anna@expat.com' && /Welcome home/.test(m.subject));
  check('legacy senza PDF: welcome col SOLO certificato in allegato', !!wt
    && (wt.attachments || []).length === 1
    && wt.attachments[0].filename === 'BOOM_Signing_Certificate.pdf'
    && /Signing certificate/.test(wt.html));
  const caf = mails().slice(b).find(m => m.to === 'valentino@boom-rome.com' && /Asseverazione/i.test(m.subject));
  check('legacy senza PDF: CAF onesto (PDF non ancora generato) + cert, fascicolo e identità allegati', !!caf
    && caf.html.includes('PDF non ancora generato')
    && (caf.attachments || []).length === 3);
  check('legacy senza PDF: il pack elenca "Contratto firmato" tra i mancanti',
    Array.isArray(out.packMissing) && out.packMissing.includes('Contratto firmato')
    && !!caf && /Nel pack mancano/.test(caf.html) && caf.html.includes('Contratto firmato'));
}

// ═══ 1d. Magic Sign submit: terms freeze, già-firmato VIVO, sequenziale ═══
{
  const msSubmit = (await import('../../api/magic-sign/submit.js')).default;
  const msLookup = (await import('../../api/magic-sign/lookup.js')).default;
  const CONSENT = 'I confirm my identity and accept all lease terms. This digital signature is legally valid (FES — Art. 21 CAD).';
  const SIG = 'data:image/png;base64,' + 'A'.repeat(400);
  store.set('contracts/ctrMS', {
    propertyId: 'prop1', tenantId: 't1', type: 'transitorio', cedolareSecca: 'si',
    rent: 1200, deposit: 2400, startDate: '2026-10-01', endDate: '2027-09-30', paymentDay: 5,
    tenantName: 'Anna Expat', landlordName: 'Giulia Bianchi',
    tenantSignToken: 'MSTOK_TENANT_1', landlordSignToken: 'MSTOK_LANDLORD_1',
    signingOrder: 'sequential', signatureStatus: 'none', status: 'active',
    generatedPDF: 'https://storage.example/contract.pdf',
  });
  const body = (token) => ({ token, signature: SIG, consent: { text: CONSENT, hash: '' }, identity: { cf: 'rssmra85t10a562s', dob: '1998-05-04' } });

  IP = '9.1.2.1';
  let r = mkRes();
  await msSubmit(mkReq(body('MSTOK_LANDLORD_1')), r);
  check('submit: locatore prima dell\'inquilino su sequenziale → 409', r.code === 409 && r.body.error === 'awaiting_tenant');

  // L'inquilino APRE il link (lookup) prima di firmare: prima apertura tracciata
  r = mkRes();
  await msLookup(mkReq({ token: 'MSTOK_TENANT_1' }), r);
  check('lookup pre-firma: 200 col prefill del firmatario', r.code === 200 && r.body.ok === true && r.body.role === 'tenant');

  r = mkRes();
  await msSubmit(mkReq(body('MSTOK_TENANT_1')), r);
  const ms1 = store.get('contracts/ctrMS');
  check('submit tenant: 200 partial + TERMINI CONGELATI (hash+snapshot)', r.code === 200 && r.body.signatureStatus === 'partial'
    && typeof ms1.signedTermsHash === 'string' && ms1.signedTermsHash.length === 64
    && ms1.signedTerms && ms1.signedTerms.rent === 1200 && ms1.signedTerms.endDate === '2027-09-30');
  check('submit tenant: token SOPRAVVIVE (usedAt stampato) + CF normalizzato',
    ms1.tenantSignToken === 'MSTOK_TENANT_1' && !!ms1.tenantSignTokenUsedAt && ms1.tenantCF === 'RSSMRA85T10A562S');

  IP = '9.1.2.2';
  r = mkRes();
  await msLookup(mkReq({ token: 'MSTOK_TENANT_1' }), r);
  check('lookup dopo la firma: 410 already_signed VIVO (non più "Link not valid")',
    r.code === 410 && r.body.error === 'already_signed' && !!r.body.signedAt);
  r = mkRes();
  await msSubmit(mkReq(body('MSTOK_TENANT_1')), r);
  check('re-submit stesso ruolo → 410, la prima firma non si sovrascrive', r.code === 410 && r.body.error === 'already_signed');

  // L'admin "ritocca" il canone DOPO la firma dell'inquilino…
  store.get('contracts/ctrMS').rent = 1300;
  IP = '9.1.2.3';
  r = mkRes();
  await msSubmit(mkReq(body('MSTOK_LANDLORD_1')), r);
  check('termini cambiati tra le firme → controfirma BLOCCATA (409 terms_changed)', r.code === 409 && r.body.error === 'terms_changed');
  check('terms_changed → ping urgente all\'operatore', [...store.keys()].some(k => k.startsWith('agentNotifications/') && (store.get(k) || {}).type === 'contract.terms_changed'));

  // …ripristinati i termini firmati, la controfirma passa e chiude tutto.
  store.get('contracts/ctrMS').rent = 1200;
  r = mkRes();
  await msSubmit(mkReq(body('MSTOK_LANDLORD_1')), r);
  const ms2 = store.get('contracts/ctrMS');
  check('controfirma sui termini GIUSTI → complete + cascata (rate generate)',
    r.code === 200 && r.body.fullySigned === true && ms2.signatureStatus === 'complete'
    && [...store.keys()].some(k => k.startsWith('payments/pay_ctrMS_')));
  check('prima apertura tracciata sul contratto (signViewedTenantAt)', !!ms2.signViewedTenantAt);
}

// ═══ 1e. CO-FIRMA: token derivati, parallelo tra conduttori, locatore per ultimo ═══
{
  const msSubmit = (await import('../../api/magic-sign/submit.js')).default;
  const msLookup = (await import('../../api/magic-sign/lookup.js')).default;
  const sendLink = (await import('../../api/sign/send-link.js')).default;
  const { cosignRef, tenantSideComplete } = await import('../../api/magic-sign/_shared.js');
  const CONSENT = 'I confirm my identity and accept all lease terms. This digital signature is legally valid (FES — Art. 21 CAD).';
  const SIG = 'data:image/png;base64,' + 'B'.repeat(400);
  store.set('users/caller1', { role: 'admin' });
  store.set('contracts/ctrCS', {
    propertyId: 'prop1', tenantId: 't1', type: 'transitorio', cedolareSecca: 'si',
    rent: 1400, deposit: 2800, startDate: '2026-09-01', endDate: '2027-08-31', paymentDay: 1,
    tenantName: 'Julie V', tenantEmail: 'julie@x.fr', landlordName: 'Stefano C',
    landlordEmail: 'stefano@x.it',
    coTenants: [{ name: 'Anouk G', cf: 'GRTNKA06L65Z110O', email: 'anouk@x.fr', tenantIndex: 1 }],
    tenantSignToken: 'CSTOK_TENANT_1', landlordSignToken: 'CSTOK_LANDLORD_1',
    signingOrder: 'sequential', signatureStatus: 'none', status: 'active',
    generatedPDF: 'https://storage.example/contract.pdf',
  });
  const body = (token) => ({ token, signature: SIG, consent: { text: CONSENT, hash: '' }, identity: {} });
  const coRef = cosignRef('ctrCS', 0);

  IP = '9.1.3.1';
  let r = mkRes();
  const before = mails().length;
  await sendLink(mkReq({ contractId: 'ctrCS', role: 'tenant' }, { authorization: 'Bearer x' }), r);
  check('send-link con co-firma: invita il principale E il co-conduttore (link derivato)',
    r.code === 200 && r.body.coInvited === 1
    && mails().slice(before).some(m => m.to === 'anouk@x.fr' && m.html.includes(encodeURIComponent(coRef))));

  r = mkRes();
  await msSubmit(mkReq(body('CSTOK_TENANT_1')), r);
  check('principale firma → partial (manca il co-conduttore)', r.code === 200 && r.body.signatureStatus === 'partial');
  r = mkRes();
  await msSubmit(mkReq(body('CSTOK_LANDLORD_1')), r);
  check('locatore BLOCCATO finché il lato conduttori non è completo', r.code === 409 && r.body.error === 'awaiting_tenant');

  IP = '9.1.3.2';
  r = mkRes();
  await msLookup(mkReq({ token: coRef }), r);
  check('lookup co-conduttore: 200, rende come tenant, prefill con la SUA identità',
    r.code === 200 && r.body.role === 'tenant' && r.body.cosign && r.body.cosign.index === 0
    && r.body.signer.name === 'Anouk G' && r.body.signer.cf === 'GRTNKA06L65Z110O');

  r = mkRes();
  await msSubmit(mkReq(body(coRef)), r);
  const cs1 = store.get('contracts/ctrCS');
  check('co-conduttore firma nel SUO slot: lato conduttori completo, contratto ancora partial',
    r.code === 200 && !!cs1.coTenants[0].signature && !!cs1.coTenants[0].signedAt
    && tenantSideComplete(cs1) && cs1.signatureStatus === 'partial');
  r = mkRes();
  await msSubmit(mkReq(body(coRef)), r);
  check('co-conduttore che rifirma → 410', r.code === 410 && r.body.error === 'already_signed');

  IP = '9.1.3.3';
  r = mkRes();
  await msSubmit(mkReq(body('CSTOK_LANDLORD_1')), r);
  const cs2 = store.get('contracts/ctrCS');
  check('locatore controfirma a lato completo → COMPLETE + finalize',
    r.code === 200 && r.body.fullySigned === true && cs2.signatureStatus === 'complete' && !!cs2.finalizedAt);
  check('certificato costruito con TUTTE le firme (hash include i co-conduttori)',
    String(cs2.signingCertificateUrl || '').includes('signing-certificate.pdf')
    && storageFiles.has('contracts/ctrCS/signing-certificate.pdf'));
  check('marca temporale RFC3161 archiviata e stampata sul contratto',
    String(cs2.timestampTsrUrl || '').includes('timestamp.tsr')
    && storageFiles.has('contracts/ctrCS/timestamp.tsr'));

  // OTP OBBLIGATORIO: col flag, la firma senza telefono verificato è respinta
  store.set('contracts/ctrOTP', {
    propertyId: 'prop1', tenantId: 't1', type: 'transitorio', rent: 900, deposit: 900,
    startDate: '2026-10-01', endDate: '2027-03-31', tenantName: 'Anna Expat',
    tenantSignToken: 'OTPTOK_1', signingOrder: 'sequential', signatureStatus: 'none',
    otpRequired: true,
  });
  r = mkRes();
  await msSubmit(mkReq(body('OTPTOK_1')), r);
  check('otpRequired: firma senza telefono verificato → 428 otp_required',
    r.code === 428 && r.body.error === 'otp_required');
}

// ═══ 1b. Watchdog inviti freddi (predicato puro) ═══
{
  const { shouldReinvite } = await import('../../api/reminder-cron.js');
  const now = Date.now();
  const h = (n) => new Date(now - n * 3600 * 1000).toISOString();
  const base = { status: 'active', tenantSignToken: 'tk', signInviteTenantAt: h(80) };
  check('reinvite: invito freddo da 80h → SÌ', shouldReinvite({ ...base }, now) === true);
  check('reinvite: invito fresco (<72h) → no', shouldReinvite({ ...base, signInviteTenantAt: h(10) }, now) === false);
  check('reinvite: MAI invitato → no (decisione umana)', shouldReinvite({ status: 'active', tenantSignToken: 'tk' }, now) === false);
  check('reinvite: già firmato → no', shouldReinvite({ ...base, tenantSignature: 'sig' }, now) === false);
  check('reinvite: reminder manuale <24h fa → no', shouldReinvite({ ...base, lastReminderAt: h(2) }, now) === false);
  check('reinvite: cap 2 re-inviti → no', shouldReinvite({ ...base, inviteNudgeCount: 2 }, now) === false);
}

// ═══ 2. notifyPartialSignature: lingue e link giusti ═══
const notify = await import('../../api/sign/_notify.js');
{
  const c = { ...FULL, landlordSignature: null, landlordSignedAt: null, signatureStatus: 'partial', landlordSignToken: 'LLTOK123' };
  const before = mails().length;
  await notify.notifyPartialSignature(c, 'tenant', null);
  const conf = mails().slice(before).find(m => m.to === 'anna@expat.com');
  const nudge = mails().slice(before).find(m => m.to === 'giulia@owner.it');
  check('parziale: conferma al firmatario (EN)', !!conf && /your signature/i.test(conf.subject + conf.html));
  check('parziale: nudge al locatore IN ITALIANO col SUO link', !!nudge
    && /Tocca a Lei/.test(nudge.subject) && nudge.html.includes('/sign?sign=LLTOK123'));

  const b2 = mails().length;
  await notify.notifyPartialSignature(c, 'tenant', null, { nudgeOnly: true });
  const onlyNudge = mails().slice(b2);
  check('parziale nudgeOnly: niente doppia conferma al firmatario', onlyNudge.length === 1 && onlyNudge[0].to === 'giulia@owner.it');
}

// ═══ 3. send-link: auth, ruoli, protocollo sequenziale ═══
const sendLink = (await import('../../api/sign/send-link.js')).default;
IP = '9.1.1.2';
{
  store.set('users/caller1', { role: 'admin' });
  store.set('contracts/ctrS', {
    propertyId: 'prop1', tenantId: 't1', rent: 1200, deposit: 2400,
    startDate: '2026-10-01', endDate: '2027-03-31', tenantName: 'Anna Expat',
    landlordName: 'Giulia Bianchi', signingOrder: 'sequential',
  });

  let r = mkRes();
  await sendLink(mkReq({ contractId: 'ctrS' }), r);
  check('send-link: senza token → 401', r.code === 401);

  const before = mails().length;
  r = mkRes();
  await sendLink(mkReq({ contractId: 'ctrS', role: 'tenant' }, { authorization: 'Bearer x' }), r);
  const c = store.get('contracts/ctrS');
  check('send-link tenant: 200, token backfillato, invito partito', r.code === 200 && r.body.sent === true
    && !!c.tenantSignToken && r.body.url.includes(c.tenantSignToken));
  const invite = mails().slice(before).find(m => m.to === 'anna@expat.com');
  check('invito tenant: inglese, CTA firma, link giusto', !!invite
    && /ready to sign/i.test(invite.subject) && invite.html.includes('/sign?sign=' + c.tenantSignToken));
  check('send-link: stamp signInviteTenantAt sul contratto', !!store.get('contracts/ctrS').signInviteTenantAt);

  r = mkRes();
  await sendLink(mkReq({ contractId: 'ctrS', role: 'landlord' }, { authorization: 'Bearer x' }), r);
  check('send-link landlord su sequenziale non firmato → 409 awaiting_tenant', r.code === 409 && r.body.error === 'awaiting_tenant');

  r = mkRes();
  await sendLink(mkReq({ contractId: 'ctrF', role: 'tenant' }, { authorization: 'Bearer x' }), r);
  check('send-link su parte già firmata → 409 already_signed', r.code === 409 && r.body.error === 'already_signed');
}

// ═══ 3b. /api/fiscal/pack: rigenerazione on-demand (admin) ═══
const packEndpoint = (await import('../../api/fiscal/pack.js')).default;
IP = '9.1.1.5';
{
  let r = mkRes();
  await packEndpoint(mkReq({ contractId: 'ctrF' }), r);
  check('pack endpoint: senza token → 401', r.code === 401);

  r = mkRes();
  await packEndpoint(mkReq({ contractId: 'ctrF' }, { authorization: 'Bearer x' }), r);
  check('pack endpoint: admin → 200 con url e mancanti', r.code === 200 && r.body.ok === true
    && String(r.body.url || '').includes('pack-registrazione.zip')
    && Array.isArray(r.body.missing));

  r = mkRes();
  await packEndpoint(mkReq({ contractId: 'nope' }, { authorization: 'Bearer x' }), r);
  check('pack endpoint: contratto inesistente → 404', r.code === 404);
}

// ═══ 4. scheda: conferma al cliente, una volta sola ═══
const schedaSubmit = (await import('../../api/profile/submit.js')).default;
const { schedaRef } = await import('../../api/profile/_scheda.js');
IP = '9.1.1.3';
{
  store.set('contracts/ctrP', { propertyId: 'prop1', tenantId: 't1' });
  const ID = { name: 'Anna Expat', cf: 'RSSMRA85T10A562S', dob: '1998-05-04', pob: 'Boston, USA', address: 'Via Roma 1', docType: 'passport', docNum: 'USA991', docIssuer: 'US Dept of State', docIssueDate: '2022-01-01', nationality: 'American' };

  const before = mails().length;
  let r = mkRes();
  await schedaSubmit(mkReq({ t: schedaRef('ctrP', 'tenant'), identity: ID }), r);
  const conf = mails().slice(before).filter(m => m.to === 'anna@expat.com' && /details are in/i.test(m.subject));
  check('scheda completa → conferma al cliente (EN)', r.code === 200 && conf.length === 1);
  check('scheda: flag anti-doppione sul contratto', !!store.get('contracts/ctrP').schedaTenantConfirmedAt);

  const b2 = mails().length;
  r = mkRes();
  await schedaSubmit(mkReq({ t: schedaRef('ctrP', 'tenant'), identity: ID }), r);
  check('scheda re-submit → NESSUNA seconda conferma', r.code === 200
    && mails().slice(b2).filter(m => /details are in/i.test(m.subject)).length === 0);
}

console.log('\n' + '─'.repeat(48));
console.log(`Notifiche: ${passed} passed, ${failed} failed`);
if (failed) { console.error('FAILED: ' + bad.join(' | ')); process.exit(1); }
console.log('Il ciclo email del contratto si comporta come previsto.');
