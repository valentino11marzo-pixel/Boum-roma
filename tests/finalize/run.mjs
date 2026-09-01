// tests/finalize/run.mjs — il finalize che non muore mai a metà.
// Nato dal 1/09/2026 (il contratto di Rute): Firebase Storage rispondeva 403
// a ogni upload admin e il finalize — che creava le obbligazioni PRIMA di
// scoprirlo — moriva ucciso a 60s dopo aver già scritto ~10 scadenze. Il
// watchdog del reminder-cron riprovava ogni 15 minuti: scadenze duplicate a
// ogni giro, cron 504 a ogni run, e journey / incasso SEPA / countdown
// visite (che nel cron stanno DOPO) spenti per ore. E la CI che doveva
// avvisare del FIREBASE_TOKEN scaduto usciva VERDE per colpa di `| tee`
// senza pipefail.
// Qui si blinda tutto: la sonda Storage (primo upload = certificato, se
// rifiuta si esce senza aver scritto NULLA e con UN avviso al giorno), le
// scadenze idempotenti con la bonifica dei doppioni della tempesta, il
// budget del watchdog, e il pipefail della CI — asserito sulla sorgente.
// Uso: node tests/finalize/run.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-finalize';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ADMIN_NOTIFY_EMAIL;
delete process.env.CAF_EMAIL;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const mails = () => globalThis.__mails || [];

// ── Stub fetch: Firestore in-memory + Storage col RUBINETTO ──────────────
// `storageDown` finge il 1/09: ogni upload admin → 403 "Permission denied.".
const store = new Map();
const storageFiles = new Map();
let storageDown = false;
let uploadAttempts = 0;
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

const { PDFDocument: TestPDF } = await import('pdf-lib');
const SRC_PDF = Buffer.from(await (async () => { const d = await TestPDF.create(); d.addPage([595, 842]); return d.save(); })());

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'caller1', email: 'op@boom.it' }] });
  if (url.startsWith('https://storage.example/contract.pdf')) return new Response(SRC_PDF, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  if (url.startsWith('https://storage.example/')) return new Response(Buffer.from('FILE:' + url.slice(24)), { status: 200 });
  if (url.startsWith('https://freetsa.org/tsr')) return new Response(Buffer.alloc(300, 7), { status: 200 });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (opts.method === 'POST') {
      uploadAttempts++;
      if (storageDown) return new Response(JSON.stringify({ error: { code: 403, message: 'Permission denied.' } }), { status: 403 });
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
        rows.push({ document: { name: 'projects/p/databases/(default)/documents/' + k, fields: toFsFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z', createTime: '2026-01-01T00:00:00Z' } });
        if (sq.limit && rows.length >= sq.limit) break;
      }
      return okJson(rows.length ? rows : [{}]);
    }
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
    if (opts.method === 'DELETE') {
      store.delete(path);
      return okJson({});
    }
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFsFields(doc), updateTime: '2026-01-01T00:00:00Z', createTime: '2026-01-01T00:00:00Z' });
  }
  throw new Error('fetch non stubbata: ' + url);
};

// ── Seed ─────────────────────────────────────────────────────────────────
store.set('properties/prop1', { ownerId: 'own1', name: 'Trastevere Loft', address: 'Via della Lungaretta 12', zone: 'Trastevere', rooms: 3, sqm: 78, furnished: true, energyClass: 'F', cadastralData: 'foglio 495, part. 120, sub 8', features: ['elevator', 'ac'] });
store.set('users/t1', { email: 'rute@expat.com', name: 'Rute Expat', role: 'tenant' });
store.set('users/own1', { email: 'stefano@owner.it', name: 'Stefano Owner', role: 'landlord' });

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const BASE_CONTRACT = {
  propertyId: 'prop1', tenantId: 't1',
  type: 'transitorio', cedolareSecca: 'si',
  rent: 800, deposit: 900, startDate: '2026-09-01', endDate: '2027-08-31',
  installmentMonths: 1, paymentDay: 5,
  tenantName: 'Rute Expat', tenantCF: 'RSSMRA85T10A562S', tenantNationality: 'Estonian',
  landlordName: 'Stefano Owner', landlordCF: 'BNCGLI70A41H501X',
  tenantSignature: SIG, landlordSignature: SIG,
  tenantSignedAt: '2026-09-01T09:01:00Z', landlordSignedAt: '2026-09-01T13:14:00Z',
  fullySignedAt: '2026-09-01T13:14:00Z', signatureStatus: 'complete',
  generatedPDF: 'https://storage.example/contract.pdf',
};

const { finalizeContract } = await import('../../api/sign/_finalize.js');
const today = new Date().toISOString().slice(0, 10);
const deadlineKeys = () => [...store.keys()].filter(k => k.startsWith('deadlines/'));
const magicKeys = () => [...store.keys()].filter(k => k.startsWith('magicLinks/'));

// ═══ 1. Storage GIÙ: la sonda esce subito, senza aver scritto niente ═══
{
  const C = { ...BASE_CONTRACT, id: 'ctrX' };
  store.set('contracts/ctrX', { ...C });
  storageDown = true;
  uploadAttempts = 0;
  const mailsBefore = mails().length;

  const out = await finalizeContract({ ...C });
  check('storage giù: finalize esce con storage_unavailable (retryable)',
    !!out && out.ok === false && out.error === 'storage_unavailable' && out.retryable === true);
  check('storage giù: NESSUNA scadenza creata (il difetto che duplicava a ogni retry)',
    deadlineKeys().length === 0);
  check('storage giù: NESSUN magic link coniato', magicKeys().length === 0);
  check('storage giù: NESSUNA email partita (né welcome né CAF)', mails().length === mailsBefore);
  check('storage giù: finalizedAt NON scritto — il watchdog deve poter riprovare',
    !(store.get('contracts/ctrX') || {}).finalizedAt);
  check('storage giù: UN SOLO upload tentato (403 non si riprova: sonda economica)',
    uploadAttempts === 1);
  const alerts = [...store.keys()].filter(k => k.startsWith('agentNotifications/finstor_ctrX_'));
  check('storage giù: UN avviso urgente, con id deterministico per giorno',
    alerts.length === 1 && alerts[0] === `agentNotifications/finstor_ctrX_${today}`
    && (store.get(alerts[0]) || {}).priority === 'urgent');
  check('storage giù: l\'avviso dice cosa fare (regole/IAM), non solo che è rotto',
    /storage\.rules|IAM|Publish/i.test(String((store.get(alerts[0]) || {}).body || '')));

  // Secondo giro (il watchdog 15 minuti dopo): stesso esito, nessun secondo
  // avviso, ancora zero scritture.
  const out2 = await finalizeContract({ ...C });
  check('storage giù, retry: stesso esito senza doppiare l\'avviso',
    out2.error === 'storage_unavailable'
    && [...store.keys()].filter(k => k.startsWith('agentNotifications/finstor_ctrX_')).length === 1
    && deadlineKeys().length === 0 && mails().length === mailsBefore);
}

// ═══ 2. La tempesta passata si SANA al primo giro sano ═══
// Si semina il danno vero del 1/09: tre copie della stessa scadenza con id
// auto (i giri del cron morti a metà) + il doc RLI di submit, che NON è del
// finalize e non va mai toccato.
{
  const C = { ...BASE_CONTRACT, id: 'ctrS' };
  store.set('contracts/ctrS', { ...C });
  const TARI = { title: 'Denuncia TARI (occupazione) al Comune', type: 'fiscal', date: '2026-10-01', status: 'pending', autoGenerated: true, source: 'finalize', linkedContractId: 'ctrS' };
  store.set('deadlines/auto_storm1', { ...TARI });
  store.set('deadlines/auto_storm2', { ...TARI, status: 'done' }); // l'operatore ne ha già lavorata una
  store.set('deadlines/auto_storm3', { ...TARI });
  store.set('deadlines/rli_ctrS', { title: 'Registrare RLI - Via della Lungaretta 12', type: 'contract_registration', date: '2026-09-26', status: 'pending', autoGenerated: true, linkedContractId: 'ctrS' });
  store.set('deadlines/rli_copia_umana', { title: 'Registrare RLI - Via della Lungaretta 12', type: 'contract_registration', date: '2026-09-26', status: 'pending', autoGenerated: true, linkedContractId: 'ctrS' });

  storageDown = false;
  const out = await finalizeContract({ ...C });
  check('giro sano: finalize completa (ok, certificato, contratto firmato)',
    out.ok === true && out.certificate === true && out.signedPdf === true);

  const dls = deadlineKeys().map(k => ({ key: k, ...store.get(k) })).filter(d => d.linkedContractId === 'ctrS');
  const tari = dls.filter(d => d.title === TARI.title);
  check('bonifica: della scadenza triplicata resta UNA copia', tari.length === 1);
  check('bonifica: la copia che resta è quella GIÀ LAVORATA dall\'operatore, mai un doppione vergine',
    tari.length === 1 && tari[0].status === 'done');
  check('bonifica: si tocca SOLO ciò che il finalize ha generato — le RLI (anche doppie) sopravvivono',
    dls.filter(d => String(d.title).startsWith('Registrare RLI')).length === 2);
  const titles = dls.map(d => d.title);
  check('scadenze: nessun titolo compare due volte (idempotenti per costruzione)',
    titles.filter(t => !String(t).startsWith('Registrare RLI')).length === new Set(titles.filter(t => !String(t).startsWith('Registrare RLI'))).size);
  check('scadenze nuove: id deterministico dlfin_<contratto>_<i>',
    dls.some(d => /^deadlines\/dlfin_ctrS_\d+$/.test(d.key)));

  check('giro sano: certificato e contratto firmato DAVVERO su Storage',
    storageFiles.has('contracts/ctrS/signing-certificate.pdf')
    && storageFiles.has('contracts/ctrS/contratto-firmato.pdf'));
  check('giro sano: finalizedAt scritto', !!(store.get('contracts/ctrS') || {}).finalizedAt);
  check('giro sano: welcome tenant + CAF partiti',
    mails().some(m => m.to === 'rute@expat.com') && mails().some(m => m.to === 'valentino@boom-rome.com'));

  // Idempotenza piena: il secondo giro non rimanda nulla e non ricrea nulla.
  const mailsBefore = mails().length, dlBefore = deadlineKeys().length;
  const again = await finalizeContract({ ...C, finalizedAt: (store.get('contracts/ctrS') || {}).finalizedAt });
  check('giro sano, retry: skipped, zero nuove email, zero nuove scadenze',
    again.skipped === true && mails().length === mailsBefore && deadlineKeys().length === dlBefore);
}

// ═══ 3. 🔄 Rifinalizza bonifica anche il contratto GIÀ finalizzato ═══
// Il caso VERO di Rute: la tempesta lascia i doppioni, POI un giro sano
// scrive finalizedAt — da lì finalizeContract esce subito (skipped) e la
// passata interna non girerebbe mai. Il tap su 🔄 Rifinalizza deve pulire
// comunque; e senza auth non deve cancellare NIENTE (l'ordine conta).
{
  const mkRes = () => ({
    code: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
    end() { return this; },
  });
  const TARI2 = { title: 'Denuncia TARI (occupazione) al Comune', type: 'fiscal', date: '2026-10-01', status: 'pending', autoGenerated: true, source: 'finalize', linkedContractId: 'ctrS' };
  store.set('deadlines/auto_dopo1', { ...TARI2 });
  store.set('deadlines/auto_dopo2', { ...TARI2 });

  const { default: refinalize } = await import('../../api/sign/refinalize.js');

  // Senza auth: 401 e i doppioni restano — la bonifica sta DOPO la porta.
  const r401 = mkRes();
  await refinalize({ method: 'POST', headers: {}, body: { contractId: 'ctrS' } }, r401);
  check('refinalize senza auth: 401 e NESSUNA cancellazione',
    r401.code === 401 && store.has('deadlines/auto_dopo1') && store.has('deadlines/auto_dopo2'));

  const r = mkRes();
  const mailsBefore = mails().length;
  await refinalize({ method: 'POST', headers: { 'x-homie-secret': 'test-secret-finalize' }, body: { contractId: 'ctrS' } }, r);
  check('refinalize su contratto finalizzato: 200, finalize skipped (nessuna seconda email)',
    r.code === 200 && r.body && r.body.ok === true && r.body.result && r.body.result.skipped === true
    && mails().length === mailsBefore);
  const tari2 = [...store.keys()].filter(k => k.startsWith('deadlines/'))
    .map(k => ({ key: k, ...store.get(k) }))
    .filter(d => d.linkedContractId === 'ctrS' && d.title === TARI2.title);
  check('refinalize: i doppioni post-finalize spariscono, resta la copia lavorata',
    r.body.dedupeRemoved >= 2 && tari2.length === 1 && tari2[0].status === 'done');
}

// ═══ 4. Le giunzioni, asserite sulla SORGENTE ═══
{
  const fin = readFileSync(new URL('../../api/sign/_finalize.js', import.meta.url), 'utf8');
  const probeAt = fin.indexOf('signing-certificate.pdf');
  const deadlinesAt = fin.indexOf("fsCreate('deadlines'");
  check('sorgente finalize: la sonda (upload certificato) sta PRIMA delle scadenze',
    probeAt > -1 && deadlinesAt > -1 && probeAt < deadlinesAt);
  check('sorgente finalize: il bail storage_unavailable esiste e sta prima delle scadenze',
    fin.indexOf("error: 'storage_unavailable'") > -1 && fin.indexOf("error: 'storage_unavailable'") < deadlinesAt);
  check('sorgente finalize: upload passa dal helper condiviso (retry 429/5xx, err.status)',
    /import \{ storageUpload \} from '\.\.\/agent\/_lib\.js'/.test(fin));

  const cron = readFileSync(new URL('../../api/reminder-cron.js', import.meta.url), 'utf8');
  const guardAt = cron.indexOf('refinalizeSkipped');
  const journeyAt = cron.indexOf('runJourney');
  const sddAt = cron.indexOf('collectSdd');
  check('sorgente cron: il watchdog refinalize ha il budget guard',
    guardAt > -1 && /elapsed\(\) > 35_000/.test(cron));
  check('sorgente cron: il refinalize sta in CODA — dopo journey, SEPA e countdown visite (un RECUPERO non affama mai l\'incasso e i promemoria)',
    guardAt > -1 && journeyAt > -1 && sddAt > -1
    && guardAt > journeyAt && guardAt > sddAt && guardAt > cron.indexOf('runViewingMoments'));

  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const pipefailAt = ci.indexOf('set -o pipefail');
  const teeAt = ci.indexOf('| tee /tmp/fb.log');
  check('sorgente CI: set -o pipefail PRIMA del deploy | tee — il 31/08 il deploy falliva e il job usciva verde',
    pipefailAt > -1 && teeAt > -1 && pipefailAt < teeAt);
  check('sorgente CI: il successo si dimostra (grep "Deploy complete"), non si presume',
    ci.includes('Deploy complete'));

  const rules = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8');
  check('storage.rules: rendiconti/ ha il suo match (senza, l\'upload admin 403a — successo il 1/09)',
    /match \/rendiconti\/\{ownerId\}/.test(rules));
  check('storage.rules: site/ ha il suo match (le immagini ri-ospitate del sito)',
    /match \/site\//.test(rules));
}

console.log('\n────────────────────────────────────────────────');
console.log(`Finalize: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI:\n - ' + bad.join('\n - ')); process.exit(1); }
console.log('La firma completa non muore più a metà: sonda, bonifica, budget e CI sincera.');
