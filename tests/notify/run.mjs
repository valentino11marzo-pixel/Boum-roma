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

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'caller1', email: 'op@boom.it' }] });
  if (url.includes('firebasestorage.googleapis.com')) return okJson({ downloadTokens: 'dltok' });
  if (url.includes('firestore.googleapis.com')) {
    const path = (url.split('/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (path.startsWith(':runQuery')) return okJson([{}]);
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      store.set(key, fromFsFields(JSON.parse(opts.body).fields));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFsFields(doc) });
  }
  throw new Error('fetch non stubbata: ' + url);
};

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
store.set('properties/prop1', { ownerId: 'own1', name: 'Trastevere Loft', address: 'Via della Lungaretta 12', rooms: 3, sqm: 78, energyClass: 'F', cadastralData: 'foglio 495, part. 120, sub 8' });
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
  check('CAF: link contratto PDF + certificato', caf.length === 1
    && caf[0].html.includes('https://storage.example/contract.pdf')
    && caf[0].html.includes('signing-certificate.pdf'));

  const wt = mailTo('anna@expat.com').filter(m => /Welcome home/.test(m.subject));
  check('welcome tenant: inglese, link portal', wt.length === 1 && /Enter my portal/i.test(wt[0].html));
  const wl = mailTo('giulia@owner.it').filter(m => /Contratto firmato/.test(m.subject));
  check('welcome landlord: italiano, passi fiscali', wl.length === 1 && /Cedolare secca/.test(wl[0].html) && /RLI/.test(wl[0].html));
  check('welcome landlord: cessione fabbricato per extra-UE', wl.length === 1 && /Questura/.test(wl[0].html));
  check('design: il marchio hosted è nel masthead', wt.length === 1 && wt[0].html.includes('android-chrome-192x192.png'));

  const before = mails().length;
  const again = await finalizeContract({ ...FULL, finalizedAt: '2026-07-29T11:05:00Z' });
  check('finalize: idempotente — nessuna nuova email al retry', again.skipped === true && mails().length === before);
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
