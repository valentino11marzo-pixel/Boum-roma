// tests/owner/run.mjs — L'AREA PROPRIETARIO, blindata.
//
// Handler VERI (api/owners/*, api/notify/send.js, api/properties/dossier.js,
// api/pfs/_guard.js, api/preagreement/create.js), motore VERO
// (js/owner-vault-engine.js), nodemailer mockato (loader della suite notify);
// finte solo la rete: Firestore REST in memoria, Identity Toolkit con una
// tabella di account vera (signUp/signIn/update/lookup), Storage.
//
// LE REGOLE:
//  1. Un proprietario vede i SUOI immobili — intestati al suo uid O alla sua
//     scheda landlords — e mai quelli degli altri; un inquilino non entra.
//  2. Dalla cassaforte non esce MAI un token di firma dell'altra parte, né
//     un URL che non sia nostro; il SUO link di firma solo quando tocca a lui.
//  3. I documenti d'identità del conduttore compaiono solo a contratto firmato.
//  4. L'account nasce da solo, la password la sceglie il proprietario da un
//     link monouso NOSTRO; un'email di admin o di inquilino non diventa mai
//     un proprietario.
//  5. Un proprietario con account NON è un operatore: le porte dell'operatore
//     (pfs/_guard, pre-accordi) gli rispondono 403, e l'email del portale
//     parte solo verso i suoi inquilini e BOOM.
// Uso: node tests/owner/run.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'server@boom.test';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'homie-test-secret';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.GMAIL_USER = 'sistema@boom.test';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.TELEGRAM_BOT_TOKEN;

let passed = 0, failed = 0; const bad = [];
const check = (n, c, extra) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || extra === undefined ? '' : ' — ' + extra)); };
const mails = () => globalThis.__mails || [];

// ── Firestore REST in memoria ────────────────────────────────────────────
const store = new Map();
const toFs = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
};
const toFields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
const fromFs = (v) => {
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
};
const fromFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };

// ── Identity Toolkit: account veri (email → uid/password) ────────────────
const authUsers = new Map(); // email → { uid, password }
let calls = [];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const storagePuts = [];

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const body = () => JSON.parse(opts.body || '{}');
  if (url.includes('identitytoolkit')) {
    const b = body();
    if (url.includes('signInWithPassword')) {
      if (b.email === process.env.FIREBASE_ADMIN_EMAIL) return json({ idToken: 'ADMIN', localId: 'srv' });
      const a = authUsers.get(b.email);
      if (!a || a.password !== b.password) return json({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, 400);
      calls.push({ op: 'signIn', email: b.email });
      return json({ idToken: 'idt_' + a.uid, localId: a.uid });
    }
    if (url.includes('accounts:signUp')) {
      if (authUsers.has(b.email)) return json({ error: { message: 'EMAIL_EXISTS' } }, 400);
      const uid = 'uid_' + (authUsers.size + 1);
      authUsers.set(b.email, { uid, password: b.password });
      calls.push({ op: 'signUp', email: b.email });
      return json({ localId: uid, email: b.email });
    }
    if (url.includes('accounts:update')) {
      const uid = String(b.idToken || '').replace(/^idt_/, '');
      const e = [...authUsers.entries()].find(([, a]) => a.uid === uid);
      if (!e) return json({ error: { message: 'INVALID_ID_TOKEN' } }, 400);
      e[1].password = b.password; calls.push({ op: 'update', uid });
      return json({ localId: uid });
    }
    if (url.includes('accounts:lookup')) {
      // il bearer del test È l'uid (o idt_<uid>), se il profilo esiste
      const uid = String(b.idToken || '').replace(/^idt_/, '');
      if (!store.has('users/' + uid)) return json({ error: { message: 'INVALID_ID_TOKEN' } }, 400);
      return json({ users: [{ localId: uid, email: store.get('users/' + uid).email }] });
    }
    return json({ error: { message: 'unexpected' } }, 400);
  }
  if (url.includes('api.telegram.org')) return json({ ok: true });
  if (url.includes('firebasestorage.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') { storagePuts.push(decodeURIComponent((url.split('name=')[1] || '').split('&')[0])); return json({ downloadTokens: 'tk' }); }
    return new Response('nope', { status: 404 });
  }
  if (url.includes('firestore.googleapis.com')) {
    const path = decodeURIComponent((url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0]);
    const qs = new URL(url).searchParams;
    const row = (k) => ({ name: 'projects/p/databases/(default)/documents/' + k, fields: toFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z' });
    const method = (opts.method || 'GET').toUpperCase();
    if (path.startsWith(':runQuery')) {
      const sq = body().structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const ff = (sq.where || {}).fieldFilter;
      const out = [];
      for (const k of store.keys()) {
        if (!k.startsWith(col + '/') || k.split('/').length !== 2) continue;
        if (ff && (store.get(k) || {})[ff.field.fieldPath] !== fromFs(ff.value)) continue;
        out.push({ document: row(k) });
        if (sq.limit && out.length >= sq.limit) break;
      }
      return json(out.length ? out : [{}]);
    }
    if (method === 'POST') {
      const id = qs.get('documentId') || 'auto_' + Math.random().toString(36).slice(2, 10);
      const key = path + '/' + id;
      if (qs.get('documentId') && store.has(key)) return json({ error: { code: 409 } }, 409);
      store.set(key, fromFields(body().fields));
      return json({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (method === 'PATCH') {
      if (qs.get('currentDocument.exists') === 'false' && store.has(path)) return json({ error: { code: 400 } }, 400);
      store.set(path, Object.assign({}, store.get(path) || {}, fromFields(body().fields)));
      return json(row(path));
    }
    if (!store.has(path)) return new Response('not found', { status: 404 });
    return json(row(path));
  }
  throw new Error('fetch non stubbata: ' + url);
};

const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const call = async (handler, { method = 'POST', token, body = {}, query = {} } = {}) => {
  const res = mkRes();
  await handler({ method, headers: token ? { authorization: 'Bearer ' + token } : {}, query, body: JSON.stringify(body), socket: {} }, res);
  return res;
};

const FS = 'https://firebasestorage.googleapis.com/v0/b/x/o/';
const SECRET_T = 'TENANTSIGNTOKEN_secret_aaaa';
const SECRET_L = 'LANDLORDSIGNTOKEN_secret_bbbb';

function seed() {
  store.clear(); authUsers.clear(); storagePuts.length = 0; calls = []; globalThis.__mails = [];
  store.set('users/admin1', { role: 'admin', email: 'valentino@boom-rome.com', name: 'Valentino' });
  // Anna: account legato alla sua scheda landlords (L_anna) — metà dei suoi
  // immobili è intestata alla scheda, metà all'uid
  store.set('users/anna', { role: 'landlord', email: 'anna@own.it', name: 'Anna Bianchi', landlordId: 'L_anna' });
  store.set('landlords/L_anna', { name: 'Anna Bianchi', email: 'anna@own.it', userId: 'anna' });
  store.set('users/bruno', { role: 'landlord', email: 'bruno@own.it', name: 'Bruno' });
  store.set('users/tina', { role: 'tenant', email: 'tina@ten.it', name: 'Tina' });
  store.set('properties/p_uid', { ownerId: 'anna', name: 'Levico', address: 'Via Levico 7', dossier: { ape: { url: FS + 'ape?alt=media', at: '2026-05-01' } } });
  store.set('properties/p_crm', { ownerId: 'L_anna', name: 'Cavour', address: 'Via Cavour 12' });
  store.set('properties/p_bruno', { ownerId: 'bruno', name: 'Giulia', address: 'Via Giulia 3' });
  // p_uid: contratto firmato da entrambi, con documenti di ogni tipo
  store.set('contracts/c_signed', {
    propertyId: 'p_uid', tenantName: 'Tina Rossi', tenantEmail: 'tina@ten.it', rent: 1200, deposit: 2400,
    startDate: '2026-01-01', endDate: '2026-12-15', signatureStatus: 'complete', status: 'active',
    tenantSignedAt: '2025-12-10T10:00:00Z', landlordSignedAt: '2025-12-11T10:00:00Z', rliRegisteredAt: '2025-12-20',
    tenantSignToken: SECRET_T, landlordSignToken: SECRET_L,
    signedPdfUrl: FS + 'signed?alt=media', signingCertificateUrl: FS + 'cert?alt=media',
    fascicoloFiscaleUrl: FS + 'fasc?alt=media', schedaCanoneUrl: 'http://evil.example/scheda.pdf', valutazioneBoomUrl: 'https://evil.example/valutazione.pdf',
    verbaleConsegna: { url: FS + 'verbale?alt=media', at: '2026-01-01T09:00:00Z', keysCount: 3 },
    identityDocs: [{ url: FS + 'passport?alt=media', role: 'tenant', name: 'passport.jpg' }, { url: 'javascript:alert(1)', role: 'tenant' }],
  });
  // p_crm: contratto in firma — il conduttore ha firmato, tocca ad Anna
  store.set('contracts/c_partial', {
    propertyId: 'p_crm', tenantName: 'Marco Verdi', tenantEmail: 'marco@ten.it', rent: 900,
    startDate: '2026-11-01', endDate: '2027-10-31', signatureStatus: 'partial', status: 'pending',
    tenantSignature: 'data:image/png;base64,xx', tenantSignedAt: '2026-09-28T10:00:00Z',
    tenantSignToken: 'T2_' + SECRET_T, landlordSignToken: 'L2_' + SECRET_L, signInviteTenantAt: '2026-09-27',
    generatedPDF: FS + 'draft?alt=media',
    identityDocs: [{ url: FS + 'marco-id?alt=media', role: 'tenant', name: 'id.jpg' }],
  });
  store.set('contracts/c_bruno', { propertyId: 'p_bruno', tenantName: 'X', tenantEmail: 'x@ten.it', rent: 700, signatureStatus: 'complete', signedPdfUrl: FS + 'bruno?alt=media', tenantSignToken: 'TB', landlordSignToken: 'LB' });
  store.set('payments/pay1', { contractId: 'c_signed', propertyId: 'p_uid', amount: 1200, month: '2026-08', dueDate: '2026-08-05', status: 'paid', paidDate: '2026-08-04' });
  store.set('payments/pay2', { contractId: 'c_signed', amount: 1200, month: '2026-09', dueDate: '2026-09-05', status: 'pending' }); // senza propertyId: si aggancia per contratto
  store.set('payments/dep', { contractId: 'c_signed', propertyId: 'p_uid', amount: 2400, type: 'deposit-balance', status: 'paid', paidDate: '2026-01-02' });
  store.set('documents/d_f24', { propertyId: 'p_uid', category: 'F24 IMU', name: 'F24 IMU · Levico · 2026', fileUrl: FS + 'f24?alt=media', docDate: '2026-06-16' });
  store.set('documents/d_boom', { propertyId: 'p_uid', category: 'fattura società invoice', name: 'Fattura BOOM', fileUrl: FS + 'boominv?alt=media' });
  store.set('documents/d_bank', { propertyId: 'p_uid', category: 'estratto conto bancario', name: 'Estratto BOOM', fileUrl: FS + 'bank?alt=media' });
  store.set('documents/d_unfiled', { propertyId: 'p_uid', category: 'F24 IMU', needsFiling: true, fileUrl: FS + 'unfiled?alt=media' });
  store.set('documents/d_idpartial', { propertyId: 'p_crm', contractId: 'c_partial', category: 'documento identità carta ID', fileUrl: FS + 'marco-id-archive?alt=media' });
  store.set('rendiconti/anna_2026-08', { ownerId: 'anna', month: '2026-08', url: FS + 'rend-08?alt=media', at: '2026-09-01T06:10:00Z' });
  store.set('rendiconti/L_anna_2026-07', { ownerId: 'L_anna', month: '2026-07', url: FS + 'rend-07?alt=media' });
  store.set('maintenance/m1', { propertyId: 'p_uid', title: 'Caldaia', status: 'open', createdAt: '2026-09-20' });
}

const OWNER = (await import('../../js/owner-vault-engine.js')).default;
const vaultH = (await import('../../api/owners/vault.js')).default;
const activateH = (await import('../../api/owners/activate.js')).default;
const inviteH = (await import('../../api/owners/invite.js')).default;
const sendH = (await import('../../api/notify/send.js')).default;
const dossierH = (await import('../../api/properties/dossier.js')).default;
const createPaH = (await import('../../api/preagreement/create.js')).default;
const { requireCronOrAdmin } = await import('../../api/pfs/_guard.js');
const { maybeOwnerArea } = await import('../../api/owners/_invite.js');
const { parseActivationRef } = await import('../../api/owners/_provision.js');

// ═══ 1. Il motore, da solo ════════════════════════════════════════════
console.log('\n── motore');
{
  seed();
  const all = (col) => [...store.entries()].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.split('/')[1], ...v }));
  const v = OWNER.buildVault({ now: '2026-09-30', properties: all('properties').filter((p) => p.id !== 'p_bruno'),
    contracts: all('contracts'), payments: all('payments'), documents: all('documents'), maintenance: all('maintenance'),
    rendiconti: all('rendiconti'), signable: { c_partial: true } });
  const s = JSON.stringify(v);
  check('nessun token di firma del conduttore esce dal motore', !s.includes(SECRET_T));
  check('il link di firma del proprietario esce SOLO dove tocca a lui', s.includes('sign?sign=L2_') && !s.includes('sign?sign=' + SECRET_L));
  check('un URL non nostro (http://evil) non diventa un documento', !s.includes('evil.example'));
  check('javascript: non diventa un link', !s.includes('javascript:'));
  const lev = v.properties.find((p) => p.id === 'p_uid');
  const cav = v.properties.find((p) => p.id === 'p_crm');
  const kinds = (p, f) => p.documents.find((x) => x.key === f).items.map((i) => i.kind);
  check('contratto firmato + certificato + verbale nella cartella contratto', ['contract_signed', 'signing_cert', 'verbale'].every((k) => kinds(lev, 'contract').includes(k)));
  check('a contratto firmato il documento del conduttore si vede', kinds(lev, 'tenant').includes('tenant_id'));
  check('a contratto NON firmato il documento del conduttore NON si vede (neanche dall\'archivio)', kinds(cav, 'tenant').length === 0 && !s.includes('marco-id'));
  check('…e il proprietario sa che esistono e quando li vedrà', cav.missing.some((m) => m.code === 'tenant_docs_after_sign' && m.n === 2));
  check('la bozza non firmata è etichettata come bozza', kinds(cav, 'contract').includes('contract_draft'));
  check('F24 dall\'archivio passa (è suo)', kinds(lev, 'tax').includes('f24'));
  check('fatture e estratti conto di BOOM NON passano', !s.includes('boominv') && !s.includes('/bank?'));
  check('un documento da smistare non passa', !s.includes('unfiled'));
  check('APE caricato → non è fra i mancanti; visura sì', !lev.missing.some((m) => m.code === 'dossier_ape') && lev.missing.some((m) => m.code === 'dossier_visura'));
  check('incassato YTD = solo il canone pagato (il deposito non è un incasso)', lev.money.collectedYtd === 1200, lev.money.collectedYtd);
  check('la rata scaduta senza propertyId è un arretrato', lev.money.arrears === 1200 && lev.money.arrearsCount === 1);
  check('in firma prima di tutto (ordinamento per urgenza)', v.properties[0].id === 'p_crm');
  check('evento «firma ora» per Cavour con il link', cav.events.some((e) => e.code === 'sign_now' && /sign\?sign=L2_/.test(e.action)));
  check('fine contratto entro 90 giorni → «decidi il rinnovo»', lev.events.some((e) => e.code === 'renewal_decide'));
  check('rendiconti di entrambe le chiavi, dal più recente', v.reports.length === 2 && v.reports[0].month === '2026-08');
  check('storia fatta di fatti datati (firma, registrazione, chiavi)', ['tenant_signed', 'landlord_signed', 'registered', 'keys_delivered'].every((c) => lev.history.some((h) => h.code === c)));
  // registrazione: dentro il termine = scadenza; oltre, senza data = «da confermare», mai «in ritardo»
  const v2 = OWNER.buildVault({ now: '2026-09-30', properties: [{ id: 'p' }], contracts: [{ id: 'c', propertyId: 'p', signatureStatus: 'complete', tenantSignedAt: '2026-09-20', landlordSignedAt: '2026-09-21', startDate: '2026-10-01', endDate: '2027-09-30' }] });
  const reg = v2.properties[0].events.find((e) => /registration/.test(e.code));
  check('registrazione nel termine → scadenza a 30 giorni dalla prima firma', reg && reg.code === 'registration' && reg.date === '2026-10-20', JSON.stringify(reg));
  const v3 = OWNER.buildVault({ now: '2026-09-30', properties: [{ id: 'p' }], contracts: [{ id: 'c', propertyId: 'p', signatureStatus: 'complete', tenantSignedAt: '2026-01-10', landlordSignedAt: '2026-01-11', startDate: '2026-01-15', endDate: '2027-01-14' }] });
  check('oltre il termine senza data → «da confermare», non «in ritardo»', v3.properties[0].events.some((e) => e.code === 'registration_unconfirmed'));
}

// Mutazioni: le regole mordono davvero (il motore rotto deve far cadere i check)
console.log('\n── mutazioni del motore');
{
  const src = readFileSync(new URL('../../js/owner-vault-engine.js', import.meta.url), 'utf8');
  const load = (code) => { const m = { exports: {} }; vm.runInNewContext(code, { module: m, require: () => null, URL, globalThis: {} }); return m.exports; };
  seed();
  const all = (col) => [...store.entries()].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.split('/')[1], ...v }));
  const input = { now: '2026-09-30', properties: all('properties'), contracts: all('contracts'), documents: all('documents'), payments: [], signable: {} };
  const m1 = load(src.replace("if (!done) { ctx.lockedTenantDocs++; return; }", ''));
  check('mutazione: senza la guardia di firma il passaporto trapela (il test lo vede)', JSON.stringify(m1.buildVault(input)).includes('marco-id?'));
  const m2 = load(src.replace("SAFE_HOSTS.indexOf(x.hostname) >= 0", 'true'));
  check('mutazione: senza la lista degli host passa l\'URL estraneo (il test lo vede)', JSON.stringify(m2.buildVault(input)).includes('evil.example'));
  const m3 = load(src.replace('if (!rule && d.shared !== true) return;', ''));
  check('mutazione: senza la lista delle categorie passa la fattura BOOM (il test lo vede)', JSON.stringify(m3.buildVault(input)).includes('boominv'));
}

// ═══ 2. La porta della cassaforte ════════════════════════════════════
console.log('\n── api/owners/vault');
{
  seed();
  let r = await call(vaultH, { method: 'GET' });
  check('senza token → 401', r.code === 401);
  r = await call(vaultH, { method: 'GET', token: 'tina' });
  check('un inquilino → 403', r.code === 403);
  r = await call(vaultH, { method: 'GET', token: 'anna' });
  const ids = (r.body.vault.properties || []).map((p) => p.id).sort();
  check('Anna vede i suoi DUE immobili: quello sul suo uid e quello sulla sua scheda landlords', r.code === 200 && ids.join() === 'p_crm,p_uid', ids.join());
  check('…e non quello di Bruno', !ids.includes('p_bruno'));
  const s = JSON.stringify(r.body);
  check('nessun token di firma del conduttore nella risposta', !s.includes(SECRET_T) && !s.includes('TB'));
  check('il suo link di firma su Cavour (conduttore ha firmato, lato completo)', s.includes('sign?sign=L2_'));
  check('il link della sua Scheda solo dove non ha firmato', s.includes('/scheda?t=c_partial.l.') && !s.includes('/scheda?t=c_signed'));
  check('visita timbrata sul profilo (per l\'operatore)', !!store.get('users/anna').ownerLastSeenAt);
  check('risposta non cacheabile', r.headers['Cache-Control'] === 'private, no-store');
  r = await call(vaultH, { method: 'GET', token: 'admin1' });
  check('admin senza ownerId → 400 (non esiste «la mia area» dell\'admin)', r.code === 400);
  const before = store.get('users/anna').ownerLastSeenAt;
  r = await call(vaultH, { method: 'GET', token: 'admin1', query: { ownerId: 'L_anna' } });
  check('anteprima admin dalla scheda landlords → gli stessi due immobili', r.code === 200 && r.body.preview === true && r.body.vault.properties.length === 2);
  check('l\'anteprima non timbra la visita del proprietario', store.get('users/anna').ownerLastSeenAt === before);
  // una scheda landlords con la STESSA email ma legata a un altro account non si adotta
  store.set('landlords/L_other', { email: 'anna@own.it', userId: 'bruno' });
  store.set('properties/p_hijack', { ownerId: 'L_other', name: 'Non tua' });
  r = await call(vaultH, { method: 'GET', token: 'anna' });
  check('scheda con la sua email ma legata a un altro account → non adottata', !r.body.vault.properties.some((p) => p.id === 'p_hijack'));
  // l'email e il landlordId del profilo li può riscrivere l'utente stesso:
  // non devono aprire NIENTE senza il legame che scrive solo l'admin
  store.set('landlords/L_free', { email: 'anna@own.it' });            // stessa email, nessun legame
  store.set('properties/p_free', { ownerId: 'L_free', name: 'Scheda libera' });
  store.set('users/bruno', { ...store.get('users/bruno'), landlordId: 'L_anna', email: 'anna@own.it' }); // Bruno si riscrive il profilo
  r = await call(vaultH, { method: 'GET', token: 'anna' });
  check('una scheda con la stessa email ma senza legame NON si adotta', !r.body.vault.properties.some((p) => p.id === 'p_free'));
  r = await call(vaultH, { method: 'GET', token: 'bruno' });
  const bids = r.body.vault.properties.map((p) => p.id);
  check('profilo riscritto (landlordId + email di Anna) → Bruno NON vede gli immobili di Anna', !bids.includes('p_crm') && !bids.includes('p_uid') && !bids.includes('p_free') && bids.includes('p_bruno'), bids.join());
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  check('rules: da sé non si riscrivono email, landlordId e lo stato dell\'area', /hasAny\(\[[^\]]*'email'[^\]]*'landlordId'[^\]]*'ownerSetup'/.test(rules));
}

// ═══ 2b. «Dalla tua ultima visita» e il volto della casa ═════════════
console.log('\n── visite e copertina');
{
  const { visitWindow } = await import('../../api/owners/vault.js');
  const now = '2026-09-30T12:00:00.000Z';
  const w0 = visitWindow({}, now);
  check('primo accesso → since null (niente «Nuovo»: sarebbe tutto nuovo)', w0.since === null && w0.patch.ownerVisitAt === now && !('ownerPrevVisitAt' in w0.patch));
  const w1 = visitWindow({ ownerVisitAt: '2026-09-30T09:00:00.000Z', ownerPrevVisitAt: '2026-09-20T08:00:00.000Z' }, now);
  check('ricaricare dentro 6 ore NON sposta il confine (i «Nuovo» non spariscono)', w1.since === '2026-09-20T08:00:00.000Z' && w1.patch === null);
  const w2 = visitWindow({ ownerVisitAt: '2026-09-29T09:00:00.000Z', ownerPrevVisitAt: '2026-09-20T08:00:00.000Z' }, now);
  check('dopo 6 ore nasce una visita nuova: la vecchia diventa il confine', w2.since === '2026-09-29T09:00:00.000Z' && w2.patch.ownerPrevVisitAt === '2026-09-29T09:00:00.000Z' && w2.patch.ownerVisitAt === now);
  const w3 = visitWindow({ ownerLastSeenAt: '2026-09-01T10:00:00.000Z' }, now);
  check('profili di prima (solo ownerLastSeenAt) → quel timbro fa da confine', w3.since === '2026-09-01T10:00:00.000Z');
  seed();
  store.set('users/anna', { ...store.get('users/anna'), ownerVisitAt: '2026-09-01T10:00:00.000Z' });
  let r = await call(vaultH, { method: 'GET', token: 'anna' });
  check('la porta risponde col confine della visita precedente', r.code === 200 && r.body.since === '2026-09-01T10:00:00.000Z', r.body.since);
  const u = store.get('users/anna');
  check('…e apre la visita nuova sul profilo', u.ownerPrevVisitAt === '2026-09-01T10:00:00.000Z' && u.ownerVisitAt > '2026-09-01T10:00:00.000Z');
  r = await call(vaultH, { method: 'GET', token: 'anna' });
  check('un refresh subito dopo tiene lo stesso confine', r.body.since === '2026-09-01T10:00:00.000Z');
  const snap = JSON.stringify(store.get('users/anna'));
  r = await call(vaultH, { method: 'GET', token: 'admin1', query: { ownerId: 'anna' } });
  check('anteprima admin: vede il confine del proprietario, ma non scrive niente', r.body.since === '2026-09-01T10:00:00.000Z' && JSON.stringify(store.get('users/anna')) === snap);
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  check('rules: le visite le scrive solo il server', /'ownerVisitAt', 'ownerPrevVisitAt'/.test(rules));
  // la copertina: la foto vera se c'è, MAI un host altrui
  const cov = (p) => OWNER.buildVault({ now: '2026-09-30', properties: [Object.assign({ id: 'x' }, p)] }).properties[0].cover;
  check('copertina: heroPhoto del Photo Studio', cov({ heroPhoto: FS + 'hero?alt=media', photos: [{ url: FS + 'p1?alt=media' }] }) === FS + 'hero?alt=media');
  check('copertina: senza hero, la prima foto (oggetto o stringa)', cov({ photos: [{ url: FS + 'p1?alt=media' }] }) === FS + 'p1?alt=media' && cov({ photos: [FS + 'p2?alt=media'] }) === FS + 'p2?alt=media');
  check('copertina: un host estraneo non passa, si scende alla foto successiva', cov({ heroPhoto: 'https://evil.example/x.jpg', photos: [{ url: FS + 'ok?alt=media' }] }) === FS + 'ok?alt=media');
  check('copertina: niente foto → stringa vuota (la pagina disegna la facciata)', cov({}) === '' && cov({ image: 'http://insecure/x.jpg' }) === '');
}

// ═══ 3. Invito + attivazione: l'account nasce, la password è sua ══════
console.log('\n── invito e attivazione');
{
  seed();
  store.set('landlords/L_new', { name: 'Carla Neri', email: 'Carla@Own.it', phone: '+39 333 1' });
  store.set('properties/p_new', { ownerId: 'L_new', name: 'Pigneto', address: 'Via del Pigneto 1' });
  store.set('contracts/c_new', { propertyId: 'p_new', tenantName: 'T', signatureStatus: 'complete', rent: 800 });
  let r = await call(inviteH, { token: 'anna', body: { op: 'invite', propertyId: 'p_new' } });
  check('invito: solo admin (un proprietario → 403)', r.code === 403);
  r = await call(inviteH, { token: 'admin1', body: { op: 'invite', propertyId: 'p_new' } });
  check('invito → account creato', r.code === 200 && r.body.status === 'created', JSON.stringify(r.body));
  const uid = r.body.uid;
  const u = store.get('users/' + uid) || {};
  check('profilo landlord, email normalizzata, legato alla scheda', u.role === 'landlord' && u.email === 'carla@own.it' && u.landlordId === 'L_new');
  check('la scheda landlords punta all\'account', store.get('landlords/L_new').userId === uid);
  check('la password iniziale è CIFRATA sul profilo (mai in chiaro)', u.ownerSetup && u.ownerSetup.sealed && !JSON.stringify(u).includes(authUsers.get('carla@own.it').password));
  const mail = mails().find((m) => m.to === 'carla@own.it');
  check('email di invito partita, in italiano, col link di attivazione', !!mail && /area proprietario/i.test(mail.subject) && /owner\?attiva=/.test(mail.html));
  check('…che è lo stesso link restituito all\'operatore', mail && mail.html.includes(r.body.activationUrl.replace(/&/g, '&amp;')));
  const ref = new URL(r.body.activationUrl).searchParams.get('attiva');
  check('il riferimento del link si legge', !!parseActivationRef(ref));
  let a = await call(activateH, { body: { ref: 'nope.nope', op: 'check' } });
  check('link falso → 404', a.code === 404);
  a = await call(activateH, { body: { ref, op: 'check' } });
  check('check → mostra l\'email con cui entrerà', a.code === 200 && a.body.email === 'carla@own.it');
  a = await call(activateH, { body: { ref, op: 'set', password: 'corta' } });
  check('password corta → 400', a.code === 400 && a.body.error === 'weak_password');
  a = await call(activateH, { body: { ref, op: 'set', password: 'unaPasswordLunga!' } });
  check('attivazione → la password dell\'account è QUELLA scelta', a.code === 200 && authUsers.get('carla@own.it').password === 'unaPasswordLunga!');
  check('il segreto e il cifrato spariscono dal profilo', !store.get('users/' + uid).ownerSetup && !!store.get('users/' + uid).ownerActivatedAt);
  a = await call(activateH, { body: { ref, op: 'set', password: 'unaltraPassword' } });
  check('il link vale UNA volta (secondo uso → 410)', a.code === 410 && authUsers.get('carla@own.it').password === 'unaPasswordLunga!');
  // re-invito di un account non ancora attivato: il link vecchio muore
  seed();
  store.set('landlords/L_d', { name: 'Dario', email: 'dario@own.it' });
  store.set('properties/p_d', { ownerId: 'L_d', name: 'Monti' });
  const r1 = await call(inviteH, { token: 'admin1', body: { op: 'invite', landlordId: 'L_d' } });
  const r2 = await call(inviteH, { token: 'admin1', body: { op: 'invite', landlordId: 'L_d' } });
  check('re-invito: nessun secondo account', r2.body.uid === r1.body.uid && [...authUsers.keys()].filter((e) => e === 'dario@own.it').length === 1);
  const old = await call(activateH, { body: { ref: new URL(r1.body.activationUrl).searchParams.get('attiva'), op: 'check' } });
  check('re-invito: il link vecchio non vale più', old.code === 410);
  // le guardie di identità
  store.set('landlords/L_adm', { name: 'Op', email: 'valentino@boom-rome.com' });
  let g = await call(inviteH, { token: 'admin1', body: { op: 'invite', landlordId: 'L_adm' } });
  check('email di un ADMIN → mai un proprietario', g.code === 409 && g.body.reason === 'admin_account' && store.get('users/admin1').role === 'admin');
  store.set('landlords/L_ten', { name: 'Tina', email: 'tina@ten.it' });
  g = await call(inviteH, { token: 'admin1', body: { op: 'invite', landlordId: 'L_ten' } });
  check('email di un INQUILINO → non si converte, si dice perché', g.code === 409 && g.body.reason === 'role_conflict' && store.get('users/tina').role === 'tenant');
  // stato per la console
  g = await call(inviteH, { token: 'admin1', body: { op: 'status', landlordId: 'L_d' } });
  check('stato: account in attesa di attivazione', g.code === 200 && g.body.account && g.body.account.pendingActivation === true);
}

// ═══ 4. Backfill + l'automazione della firma ═════════════════════════
console.log('\n── backfill e firma completa');
{
  seed();
  store.set('landlords/L_b', { name: 'Elena', email: 'elena@own.it' });
  store.set('properties/p_b', { ownerId: 'L_b', name: 'Trastevere' });
  store.set('contracts/c_b', { propertyId: 'p_b', signatureStatus: 'complete' });
  store.set('landlords/L_nos', { name: 'Senza firma', email: 'nos@own.it' });
  store.set('properties/p_nos', { ownerId: 'L_nos', name: 'In trattativa' });
  store.set('contracts/c_nos', { propertyId: 'p_nos', signatureStatus: 'none' });
  store.set('users/anna', { ...store.get('users/anna'), ownerLastSeenAt: '2026-09-29T10:00:00Z' });
  let r = await call(inviteH, { token: 'admin1', body: { op: 'backfill' } });
  const cand = (r.body.candidates || []).map((c) => c.ownerId);
  check('backfill (dry di default): candidati solo con contratto firmato', r.body.dry === true && cand.includes('L_b') && !cand.includes('L_nos'));
  check('backfill dry non crea account né spedisce', !authUsers.has('elena@own.it') && mails().length === 0);
  check('backfill: chi è già attivo non è candidato', !cand.includes('anna'));
  r = await call(inviteH, { token: 'admin1', body: { op: 'backfill', dry: false } });
  check('backfill vero: invita', (r.body.invited || []).some((x) => x.email === 'elena@own.it') && mails().some((m) => m.to === 'elena@own.it'));
  // finalize: l'account nasce senza spedire; l'interruttore lo spegne
  seed();
  store.set('landlords/L_f', { name: 'Fabio', email: 'fabio@own.it' });
  store.set('properties/p_f', { ownerId: 'L_f', name: 'Ostiense' });
  const c = { id: 'c_f', propertyId: 'p_f' };
  const out = await maybeOwnerArea(c, store.get('properties/p_f'));
  check('firma completa: account del proprietario pronto, link di attivazione per il benvenuto', out && out.uid && /owner\?attiva=/.test(out.activationUrl) && out.email === 'fabio@own.it');
  check('…senza una seconda email (il link viaggia nel benvenuto)', mails().length === 0);
  store.set('settings/ownerArea', { autoInvite: false });
  store.set('landlords/L_g', { name: 'Gino', email: 'gino@own.it' });
  store.set('properties/p_g', { ownerId: 'L_g' });
  const off = await maybeOwnerArea({ id: 'c_g', propertyId: 'p_g' }, store.get('properties/p_g'));
  check('interruttore spento → nessun account', off && off.skipped === 'disabled' && !authUsers.has('gino@own.it'));
}

// ═══ 5. Un proprietario con account NON è un operatore ═══════════════
console.log('\n── il proprietario non è un operatore');
{
  seed();
  const res = mkRes();
  const actor = await requireCronOrAdmin({ headers: { authorization: 'Bearer anna' } }, res);
  check('pfs/_guard (34 porte: banca, dipendenti, rendiconti…): landlord → 403', actor === null && res.code === 403);
  const res2 = mkRes();
  check('pfs/_guard: admin passa', (await requireCronOrAdmin({ headers: { authorization: 'Bearer admin1' } }, res2)) === 'admin:admin1');
  let r = await call(createPaH, { token: 'anna', body: {} });
  check('pre-accordo: landlord → 403', r.code === 403);
  // email dal portale: solo verso i suoi inquilini e BOOM
  r = await call(sendH, { token: 'anna', body: { to: 'sconosciuto@phish.it', params: { heading: 'Ciao' } } });
  check('email a un estraneo dall\'account proprietario → 403, niente spedito', r.code === 403 && mails().length === 0);
  r = await call(sendH, { token: 'anna', body: { to: 'Tina@Ten.it', params: { heading: 'Caldaia', intro: 'Arriva il tecnico', portal_link: 'https://evil.example/login', cta_text: 'Accedi' } } });
  const m = mails()[0];
  check('email al SUO inquilino → parte', r.code === 200 && m && m.to === 'Tina@Ten.it');
  check('…ma il bottone verso un sito estraneo viene tolto', m && !m.html.includes('evil.example'));
  r = await call(sendH, { token: 'anna', body: { to: 'x@ten.it', params: { heading: 'x' } } });
  check('email all\'inquilino di un ALTRO proprietario → 403', r.code === 403);
  r = await call(sendH, { token: 'admin1', body: { to: 'chiunque@altro.it', params: { heading: 'x' } } });
  check('l\'admin scrive a chi vuole (invariato)', r.code === 200);
}

// ═══ 6. Caricare dove manca (fascicolo) ══════════════════════════════
console.log('\n── upload dall\'area');
{
  seed();
  const PDF = Buffer.from('%PDF-1.4 x').toString('base64');
  let r = await call(dossierH, { token: 'anna', body: { propertyId: 'p_crm', slot: 'visura', base64: PDF } });
  check('proprietario carica sulla casa intestata alla SUA scheda landlords → 200', r.code === 200, JSON.stringify(r.body));
  check('…e l\'operatore riceve la notizia', [...store.keys()].some((k) => k.startsWith('agentNotifications/') && store.get(k).type === 'owner.document_uploaded'));
  r = await call(dossierH, { token: 'anna', body: { propertyId: 'p_uid', slot: 'ape', base64: PDF } });
  check('uno slot già pieno non si sovrascrive dall\'area proprietario (409)', r.code === 409 && store.get('properties/p_uid').dossier.ape.url === FS + 'ape?alt=media');
  r = await call(dossierH, { token: 'anna', body: { propertyId: 'p_bruno', slot: 'visura', base64: PDF } });
  check('sulla casa di Bruno → 403', r.code === 403);
}

// ═══ 7. La pagina: giunzioni sulla sorgente ══════════════════════════
console.log('\n── la pagina /owner');
{
  const html = readFileSync(new URL('../../owner-dashboard.html', import.meta.url), 'utf8');
  check('la pagina legge la cassaforte dalla porta del server', html.includes("/api/owners/vault"));
  check('nessuna lettura Firestore dei dati nella pagina (solo la porta)', !/collection\('(contracts|payments|documents|properties)'\)/.test(html));
  check('il link di attivazione ha il suo percorso', html.includes('/api/owners/activate') && html.includes("qs.get('attiva')"));
  check('niente più dati finti del vecchio mockup', !/chart\.js/i.test(html) && !/Mario Rossi|Luxury Penthouse/.test(html));
  check('ogni testo passa da escapeHtml', html.includes('BoomPortal.escapeHtml'));
  const vj = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  check('/owner è una rewrite (il ?attiva= non si perde in un redirect)', (vj.rewrites || []).some((x) => x.source === '/owner' && /owner-dashboard/.test(x.destination)));
  check('/owner non indicizzato e non in cache', (vj.headers || []).some((h) => /\(owner\|/.test(h.source) && h.headers.some((x) => /no-store/.test(x.value))));
  check('il pattern privato NON copre /owners (pagina pubblica)', !(vj.headers || []).some((h) => h.source === '/(owner)(.*)'));
  const fin = readFileSync(new URL('../../api/sign/_finalize.js', import.meta.url), 'utf8');
  // la demo pubblica: lo stesso motore, nessuna porta, nessun Firebase
  check('Firebase non è uno script statico (la demo non lo scarica)', !/<script src="https:\/\/www\.gstatic\.com\/firebasejs/.test(html) && html.includes('firebaseReady()'));
  check('la demo usa il motore VERO, non un JSON scritto a mano', /startDemo[\s\S]{0,200}owner-vault-engine\.js/.test(html) && html.includes('BOOM_OWNER.buildVault(DEMO_IN.input)'));
  check('nella demo documenti e firma non portano a file veri: lo si dice', /if\(!DEMO\)return;[\s\S]{0,200}demo=1#/.test(html));
  check('nella demo il caricamento non manda niente a nessuno', /if\(DEMO\)\{demoUpload\(\);return\}/.test(html));
  const own = readFileSync(new URL('../../owners.html', import.meta.url), 'utf8');
  check('owners.html porta all\'area d\'esempio vera', (own.match(/href="\/owner\?demo=1"/g) || []).length >= 2);
  check('owners.html non promette più ciò che l\'area non fa', !/app\.boomrome\.com\/proprietari|media annua|Approvazione preventivi online|Ticket manutenzione con foto|Ispezioni programmate|Alert pagamento in ritardo|Rinnovo APE/.test(own));
  check('finalize: l\'area nasce PRIMA del benvenuto (il link viaggia dentro)', fin.indexOf('maybeOwnerArea(contract, property)') > 0 && fin.indexOf('maybeOwnerArea(contract, property)') < fin.indexOf('sendWelcomeEmails(contract, property'));
}

console.log(`\n${passed} passati, ${failed} falliti`);
if (failed) { console.log('FALLITI:\n - ' + bad.join('\n - ')); process.exit(1); }
