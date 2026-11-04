// Il conto tributi RLI è dichiarato dall'admin, distinto dal conto canone.
// Handler veri; SOLO rete simulata (Firestore, Identity, Storage, SMTP).
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);
Object.assign(process.env, {
  FIREBASE_API_KEY: 'test', FIREBASE_ADMIN_EMAIL: 'admin@test.invalid',
  FIREBASE_ADMIN_PASS: 'test', FIREBASE_PROJECT_ID: 'test-registration-bank',
  GMAIL_USER: 'sender@test.invalid', GMAIL_APP_PASS: 'test',
  REGISTRATION_EMAIL: 'registration@test.invalid',
});

let passed = 0, failed = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); ok ? passed++ : failed++; };
const store = new Map(), writes = [], reads = [], logs = [];
let failWrite = false;
const okJson = (value) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const nameOf = path => 'projects/test/databases/(default)/documents/' + path;
function encode(value) {
  if (value == null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: fields(value) } };
  return { stringValue: value };
}
const fields = value => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
function decode(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return +value.integerValue;
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
}
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    if (url.pathname.endsWith('accounts:signInWithPassword')) return okJson({ idToken: 'admin-service-test' });
    return okJson({ users: JSON.parse(options.body).idToken === 'caller-token' ? [{ localId: 'caller', email: 'admin@test.invalid' }] : [] });
  }
  if (url.hostname === 'firebasestorage.googleapis.com' && (!options.method || options.method === 'GET')) {
    return new Response(Buffer.from('%PDF-1.7\ncontratto firmato di prova\n%%EOF'), { headers: { 'Content-Type': 'application/pdf' } });
  }
  if (url.hostname !== 'firestore.googleapis.com') throw new Error('Unexpected network destination');
  const path = url.pathname.split('(default)/documents/')[1];
  if (!path) throw new Error('Unexpected Firestore request');
  if (options.method === 'PATCH') {
    const patch = Object.fromEntries(Object.entries(JSON.parse(options.body).fields).map(([k, v]) => [k, decode(v)]));
    if (failWrite) return new Response('Rejected payload ' + JSON.stringify(patch), { status: 503 });
    if (url.searchParams.get('currentDocument.exists') === 'false' && store.has(path)) return new Response('exists', { status: 409 });
    const mask = url.searchParams.getAll('updateMask.fieldPaths');
    if (mask.length !== Object.keys(patch).length || !mask.every(key => Object.hasOwn(patch, key))) throw new Error('Wrong update mask');
    writes.push({ path, patch });
    store.set(path, { ...(store.get(path) || {}), ...patch });
    return okJson({ name: nameOf(path), updateTime:'2026-10-01T00:00:00Z', fields: fields(store.get(path)) });
  }
  if (options.method && options.method !== 'GET') throw new Error('Unexpected Firestore mutation');
  reads.push(path);
  return store.has(path) ? okJson({ name: nameOf(path), updateTime:'2026-10-01T00:00:00Z', fields: fields(store.get(path)) }) : new Response('missing', { status: 404 });
};

const IBAN = 'IT79O0123456789000012345678'; // sintetico: CIN O, non zero
const RENT_IBAN = 'DE89370400440532013000'; // fixture pubblica, diverso dall'addebito
const HOLDER = 'Società di prova S.r.l.';
const initial = {
  propertyId: 'p1', type: 'transitorio', relet: false,
  tenantName: 'Conduttore di prova', landlordName: 'Locatore di prova',
  startDate: '2026-10-01', endDate: '2027-09-30', rent: 1200,
  landlordIban: RENT_IBAN, cedolareSecca: 'no',
  signingStatus: 'completed', finalizedAt: '2026-10-01T12:00:00Z',
  fullySignedAt: '2026-10-01T12:00:00Z', signingCertificateUrl: 'https://firebasestorage.googleapis.com/cert.pdf',
  signedPdfUrl: 'https://firebasestorage.googleapis.com/signed.pdf', signedPdfHash: 'signed-content-hash',
  signing: { tenant: { signedAt: '2026-10-01T12:00:00Z' } },
};
function seed(role = 'admin') {
  store.clear(); reads.length = writes.length = logs.length = 0; failWrite = false;
  globalThis.__mails = []; globalThis.__mailAttempts = [];
  store.set('users/caller', { role, email: 'admin@test.invalid' });
  store.set('properties/p1', { ownerId: 'landlord1', address: 'Via di prova 1' });
  store.set('users/landlord1', { role: 'landlord', iban: RENT_IBAN });
  store.set('settings/company', { iban: RENT_IBAN });
  store.set('contracts/ctr1', structuredClone(initial));
}
const request = { op: 'save-bank', contractId: 'ctr1', rliDebitIban: IBAN, rliDebitHolder: HOLDER };
const handler = (await import('../../api/fiscal/registra.js')).default;
const foglio = (await import('../../api/fiscal/foglio.js')).default;
const { sheetRows } = await import('../../api/sign/_foglio.js');
async function drive(body, { token = 'caller-token', target = handler } = {}) {
  const res = { code: 0, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await target({ method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {}, body }, res);
  return res;
}
const row = (rows, label) => rows.find(value => value.includes('>' + label + '<')) || '';

for (const role of ['tenant', 'landlord', 'owner']) {
  seed(role);
  for (const body of [request, { op: 'status', contractId: 'ctr1' }]) {
    const res = await drive(body);
    check(role + ': lettura/salvataggio negato senza dati bancari', res.code === 403 && !res.body.bank && writes.length === 0 && !reads.includes('contracts/ctr1'));
  }
}
seed();
for (const token of ['', 'invalid-token']) {
  const res = await drive(request, { token });
  check('token assente/invalido: 401 senza scritture', res.code === 401 && writes.length === 0);
}

seed();
const empty = await drive({ op: 'status', contractId: 'ctr1' });
check('status: IBAN e intestatario mancanti sono espliciti, nessuna deduzione', empty.code === 200
  && empty.body.bank.rliDebitIban === '' && empty.body.bank.rliDebitHolder === '' && !empty.body.bank.ready
  && empty.body.bank.missing.join() === 'rliDebitIban,rliDebitHolder' && /incompleto/.test(empty.body.bank.warning));
check('status non scrive né invia', writes.length === 0 && globalThis.__mails.length === 0);
const saved = await drive({ ...request, rliDebitIban: ' it79 O012 3456 7890 0001 2345 678 ', rliDebitHolder: '  Società  di prova S.r.l.  ' });
check('admin: salva valori normalizzati pronti', saved.code === 200 && saved.body.bank.ready && saved.body.bank.warning === null
  && saved.body.bank.rliDebitIban === IBAN && saved.body.bank.rliDebitHolder === HOLDER);
check('patch esatta: soltanto due campi sul contratto', writes.length === 1 && writes[0].path === 'contracts/ctr1'
  && Object.keys(writes[0].patch).sort().join() === 'rliDebitHolder,rliDebitIban');
check('contratto firmato, canone, conto locatore e profilo restano identici', JSON.stringify(store.get('contracts/ctr1')) === JSON.stringify({ ...initial, rliDebitIban: IBAN, rliDebitHolder: HOLDER })
  && store.get('users/landlord1').iban === RENT_IBAN && store.get('settings/company').iban === RENT_IBAN);
check('salvare il conto non invia email né genera allegati', globalThis.__mails.length === 0 && writes.length === 1);
const reread = await drive({ op: 'status', contractId: 'ctr1' });
check('rilettura status restituisce gli stessi valori salvati', JSON.stringify(reread.body.bank) === JSON.stringify(saved.body.bank));
const rows = sheetRows({ contract: store.get('contracts/ctr1'), property: store.get('properties/p1') }).rows;
check('foglio legge conto tributi e intestatario salvati, conto canone distinto', row(rows, 'Conto addebito tributi RLI').includes(IBAN)
  && row(rows, 'Conto addebito tributi RLI').includes(HOLDER) && row(rows, 'IBAN canone (locatore)').includes(RENT_IBAN)
  && !row(rows, 'IBAN canone (locatore)').includes(IBAN));
const mail = await drive({ contractId: 'ctr1' }, { target: foglio });
const sent = globalThis.__mails[0];
check('handler foglio vero: email simulata riletta da Firestore con stessi valori', mail.code === 200 && globalThis.__mails.length === 1
  && sent.to === 'registration@test.invalid' && sent.html.includes(IBAN) && sent.html.includes(HOLDER) && sent.html.includes(RENT_IBAN));
check('email simulata conserva il PDF firmato allegato', sent?.attachments?.some(a => a.filename === 'Contratto_firmato.pdf'
  && Buffer.from(a.content).includes(Buffer.from('contratto firmato di prova'))));

seed();
for (const [label, body, error] of [
  ['IBAN checksum errato', { ...request, rliDebitIban: 'IT7900123456789000012345678' }, 'iban_invalid'],
  ['IBAN forma errata', { ...request, rliDebitIban: '12345' }, 'iban_invalid'],
  ['canone estraneo', { ...request, rent: 1 }, 'unexpected_fields'],
  ['conto locatore estraneo', { ...request, landlordIban: IBAN }, 'unexpected_fields'],
  ['campo sconosciuto', { ...request, extra: true }, 'unexpected_fields'],
  ['intestatario omesso', { op: 'save-bank', contractId: 'ctr1', rliDebitIban: IBAN }, 'bank_fields_required'],
  ['IBAN omesso', { op: 'save-bank', contractId: 'ctr1', rliDebitHolder: HOLDER }, 'bank_fields_required'],
  ['intestatario non testuale', { ...request, rliDebitHolder: { name: HOLDER } }, 'invalid_bank_fields'],
  ['IBAN non testuale', { ...request, rliDebitIban: null }, 'invalid_bank_fields'],
  ['intestatario oltre limite', { ...request, rliDebitHolder: 'x'.repeat(201) }, 'invalid_bank_fields'],
]) {
  seed();
  const before = JSON.stringify([...store]);
  const res = await drive(body);
  check(label + ': rifiuta prima di scrivere/inviare', res.code === 400 && res.body.error === error
    && JSON.stringify([...store]) === before && writes.length === 0 && globalThis.__mails.length === 0);
}
seed();
const absent = await drive({ ...request, contractId: 'missing' });
check('contratto inesistente: 404, non crea record', absent.code === 404 && writes.length === 0 && !store.has('contracts/missing'));
const partial = await drive({ ...request, rliDebitHolder: '' });
check('intestatario esplicitamente mancante: conserva IBAN ma segnala incompleto', partial.code === 200 && !partial.body.bank.ready
  && partial.body.bank.missing.join() === 'rliDebitHolder' && /intestatario non dichiarato/.test(partial.body.bank.warning));
const partialRows = sheetRows({ contract: store.get('contracts/ctr1'), property: {} }).rows;
check('foglio incompleto dichiara intestatario mancante, senza inventarlo', /intestatario non dichiarato/.test(row(partialRows, 'Conto addebito tributi RLI')));
const cleared = await drive({ ...request, rliDebitIban: '', rliDebitHolder: '' });
check('vuoti espliciti cancellano solo i dati addebito, restano mancanti', cleared.code === 200 && !cleared.body.bank.ready
  && store.get('contracts/ctr1').rliDebitIban === '' && store.get('contracts/ctr1').rliDebitHolder === '' && store.get('contracts/ctr1').landlordIban === RENT_IBAN);
store.get('contracts/ctr1').rliDebitIban = 'IBAN-LEGACY-ERRATO';
store.get('contracts/ctr1').rliDebitHolder = HOLDER;
const legacy = await drive({ op: 'status', contractId: 'ctr1' });
check('status: IBAN legacy errato non appare pronto', legacy.code === 200 && !legacy.body.bank.ready && legacy.body.bank.invalid.join() === 'rliDebitIban');

seed(); failWrite = true;
const originalError = console.error;
let failure;
try { console.error = (...args) => logs.push(args.join(' ')); failure = await drive(request); }
finally { console.error = originalError; }
check('Firestore fallisce: errore dichiarato, nessun falso salvataggio', failure.code === 500 && failure.body.error === 'bank_save_failed' && writes.length === 0);
check('errore Firestore non espone IBAN/intestatario nei log o nella risposta', !JSON.stringify(logs).includes(IBAN)
  && !JSON.stringify(logs).includes(HOLDER) && !JSON.stringify(failure.body).includes(IBAN));

seed();
Object.assign(store.get('contracts/ctr1'), { registrationReceiptHash: 'current', registrationReceiptUrl: 'new-url', registrationReceiptDelivery: {
  a: { who: 'tenant', fileKey: 'sha256:current', url: 'old-token-url', status: 'sent' },
  b: { who: 'landlord', fileKey: 'sha256:previous', url: 'new-url', status: 'sent' },
} });
const receipt = await drive({ op: 'status', contractId: 'ctr1' });
check('status ricevuta: seleziona hash corrente anche se il token URL cambia', receipt.body.state.receiptDelivery.length === 1 && receipt.body.state.receiptDelivery[0].who === 'tenant');
console.log(`\nregistration-bank: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
