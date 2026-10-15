// tests/registrazione/run.mjs — dal contratto firmato alla ricevuta (15/10/2026).
// Handler REALI (api/fiscal/registra.js op:'registered'), nodemailer mockato
// dal loader della suite notify, Firestore/Storage/Identity in memoria.
// LE REGOLE: i documenti d'identità caricati sul PROFILO di una parte entrano
// nel pacchetto anche se il contratto non li ha (stesso file = una volta);
// «Registrato» è UN passo — stato, scadenze chiuse, ricevuta archiviata per
// ogni parte e mandata in allegato a conduttori (EN) e proprietario (IT) UNA
// volta per file; il portal non firma mai un input sbagliato (data futura,
// «PDF» che non è un PDF) e non scrive niente quando rifiuta.
// Uso: node tests/registrazione/run.mjs
import { register } from 'node:module';
import fs from 'node:fs';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-registrazione';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.ADMIN_NOTIFY_EMAIL;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const mails = () => globalThis.__mails || [];
const mailTo = (addr) => mails().filter(m => m.to === addr);

// ── Stub: Firestore in-memory + Storage con ritenzione byte + Identity ──
const store = new Map();
const docTimes = new Map(); let fixtureRevision = 0;
const bump = (k) => docTimes.set(k, `2026-01-01T00:00:00.${String(++fixtureRevision).padStart(9, '0')}Z`);
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
  if (url.includes('firebasestorage.googleapis.com')) {
    if (opts.method !== 'POST') { const k = [...storageFiles.keys()].find(n => url.includes(encodeURIComponent(n))); if (k) return new Response(storageFiles.get(k), { status: 200 }); }
    if (opts.method === 'POST') {
      const name = new URL(url).searchParams.get('name');
      if (name) storageFiles.set(name, Buffer.from(opts.body));
      return okJson({ downloadTokens: 'dltok' });
    }
    return okJson({ downloadTokens: 'dltok' });
  }
  if (url.includes('firestore.googleapis.com')) {
    // Ancorato a "(default)/documents": la collection si chiama proprio
    // "documents" e uno split ingenuo su '/documents' la mangerebbe.
    const path = (url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (path === ':runQuery') {
      const q = JSON.parse(opts.body).structuredQuery;
      const coll = q.from[0].collectionId, f = q.where && q.where.fieldFilter;
      const out = [...store.entries()].filter(([k, d]) => k.startsWith(coll + '/') && k.split('/').length === 2
        && (!f || String(d[f.field.fieldPath]) === String(fromFs(f.value))))
        .map(([k, d]) => ({ document: { name: 'projects/p/databases/(default)/documents/' + k, fields: toFsFields(d) } }));
      return okJson(out);
    }
    if (path.startsWith(':commit')) {
      const writes = JSON.parse(opts.body).writes || [];
      for (const w of writes) {
        const k = String(w.update?.name || '').split('/documents/')[1];
        const pre = w.currentDocument || {};
        if (!k || !w.updateMask || (!pre.updateTime && typeof pre.exists !== 'boolean')) throw new Error('Malformed conditional commit');
        if ((pre.updateTime && pre.updateTime !== (docTimes.get(k) || '2026-01-01T00:00:00Z')) || (pre.exists === true && !store.has(k)) || (pre.exists === false && store.has(k))) {
          return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 409 });
        }
      }
      for (const w of writes) {
        const k = w.update.name.split('/documents/')[1];
        const doc = store.get(k) || {};
        Object.assign(doc, fromFsFields(w.update.fields)); store.set(k, doc); bump(k);
      }
      return okJson({ writeResults: writes.map(() => ({})) });
    }
    if (opts.method === 'POST' && !path.startsWith(':')) {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      store.set(key, fromFsFields(JSON.parse(opts.body).fields)); bump(key);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur); bump(path);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFsFields(doc), updateTime: docTimes.get(path) || '2026-01-01T00:00:00Z' });
  }
  throw new Error('fetch non stubbata: ' + url);
};


const PDF = Buffer.from('%PDF-1.7\nricevuta RLI di prova\n%%EOF');
const PDF64 = PDF.toString('base64');
function seed() {
  store.clear(); storageFiles.clear(); globalThis.__mails = [];
  store.set('users/caller1', { role: 'admin', name: 'Valentino', email: 'op@boom.it' });
  store.set('properties/p1', { ownerId: 'own1', address: 'Via Levico 12', name: 'Levico' });
  store.set('users/own1', { role: 'landlord', name: 'Stefano C', email: 'stefano@landlord.it',
    identityDocs: [{ url: 'https://firebasestorage.googleapis.com/own-ci.jpg', name: 'ci.jpg' }] });
  store.set('users/t1', { role: 'tenant', name: 'Julie', email: 'julie@tenant.fr',
    identityDocs: [{ url: 'https://firebasestorage.googleapis.com/julie-pass.jpg', name: 'pass.jpg' }] });
  store.set('users/t2', { role: 'tenant', name: 'Anouk', email: 'anouk@tenant.fr' });
  store.set('contracts/ctr1', {
    propertyId: 'p1', tenantId: 't1', type: 'transitorio',
    tenantName: 'Julie Verbrugghe', tenantEmail: 'julie@tenant.fr',
    coTenants: [{ name: 'Anouk Garot', email: 'anouk@tenant.fr', userId: 't2' }],
    landlordName: 'Stefano Compierchio', startDate: '2026-09-01', endDate: '2027-08-31', rent: 1400,
    identityDocs: [{ url: 'https://firebasestorage.googleapis.com/julie-pass.jpg', name: 'pass.jpg', role: 'tenant' }],
  });
  store.set('deadlines/d1', { linkedContractId: 'ctr1', title: 'Registrare RLI — Via Levico 12', status: 'pending' });
  store.set('deadlines/d2', { linkedContractId: 'ctr1', type: 'contract_registration', title: 'Registrazione', status: 'pending' });
  store.set('deadlines/d3', { linkedContractId: 'ctr1', title: 'Rinnovo', status: 'pending' });
  store.set('deadlines/d4', { linkedContractId: 'altro', title: 'Registrare RLI — altro', status: 'pending' });
}
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const drive = async (body) => {
  const handler = (await import('../../api/fiscal/registra.js')).default;
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body }, res);
  return res;
};
const R = await import('../../api/fiscal/_ricevuta.js');
const I = await import('../../api/sign/_iddocs.js');

// ═══ 1. I documenti d'identità dai profili ═════════════════════════════
{
  const c = { identityDocs: [{ url: 'u1', role: 'tenant' }] };
  const m = I.mergeIdentityDocs(c, { tenant: { identityDocs: [{ url: 'u1' }, { url: 'u2' }] }, landlordU: { identityDocs: [{ url: 'u3' }] },
    landlordR: { identityDocs: [{ url: 'u3' }, { url: 'u4' }] }, coUsers: [null, { identityDocs: [{ url: 'u5' }] }] });
  check('iddocs: prima quelli del contratto, poi i profili senza doppioni (stesso URL = stesso file)', m.map(d => d.url).join() === 'u1,u2,u3,u4,u5');
  check('iddocs: il ruolo viene dal profilo, il co-conduttore porta il suo indice', m[1].role === 'tenant' && m[2].role === 'landlord' && m[4].tenantIndex === 2 && m[4].source === 'profile' && !m[0].source);
  check('iddocs: niente profili = lista del contratto com’è', I.mergeIdentityDocs(c, {}).length === 1 && I.mergeIdentityDocs({}, {}).length === 0);
  seed();
  const w = await I.withProfileDocs({ ...store.get('contracts/ctr1'), id: 'ctr1' });
  check('iddocs I/O: il documento del locatore caricato solo sul profilo entra nel pacchetto', w.identityDocs.some(d => d.role === 'landlord' && /own-ci/.test(d.url)) && w.identityDocs.length === 2);
  check('iddocs I/O: non scrive nulla sul contratto', store.get('contracts/ctr1').identityDocs.length === 1);
}

// ═══ 2. L'input del portal: rifiuta, mai aggiusta ═══════════════════════
{
  const T = { today: '2026-10-15' };
  check('input: data futura rifiutata', R.parseReceiptInput({ date: '2026-10-16' }, T).error === 'future_date');
  check('input: data illeggibile rifiutata', R.parseReceiptInput({ date: '15/10/2026' }, T).error === 'bad_date');
  check('input: un «PDF» che non comincia con %PDF non lo è', R.parseReceiptInput({ date: '2026-10-14', base64: Buffer.from('ciao').toString('base64'), contentType: 'application/pdf' }, T).error === 'bad_file');
  check('input: tipo non ammesso', R.parseReceiptInput({ date: '2026-10-14', base64: PDF64, contentType: 'text/html' }, T).error === 'bad_type');
  check('input: codice con caratteri strani rifiutato', R.parseReceiptInput({ date: '2026-10-14', code: '<b>x</b>' }, T).error === 'bad_code');
  const ok = R.parseReceiptInput({ date: '2026-10-14', code: 'tkr26t001234000ab', base64: 'data:application/pdf;base64,' + PDF64, contentType: 'application/pdf', name: 'ricevuta AdE.pdf' }, T);
  check('input: valido → codice maiuscolo, file letto, notifica di default accesa', !ok.error && ok.code === 'TKR26T001234000AB' && ok.file && ok.file.ext === 'pdf' && ok.notify === true);
  check('input: senza file si registra lo stesso (solo stato)', !R.parseReceiptInput({ date: '2026-10-14' }, T).error);
}

// ═══ 3. Il giro vero: registrato in un passo ════════════════════════════
{
  seed();
  const r400 = await drive({ op: 'registered', contractId: 'ctr1', date: '2099-01-01', base64: PDF64, contentType: 'application/pdf' });
  check('handler: 400 su data futura e nessuna scrittura', r400.code === 400 && !store.get('contracts/ctr1').registrationStatus && storageFiles.size === 0 && mails().length === 0);

  const res = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', code: 'TKR26T001234000AB', base64: PDF64, contentType: 'application/pdf', name: 'ricevuta.pdf' });
  const c = store.get('contracts/ctr1');
  check('handler: 200, stato unico registered con data e codice', res.code === 200 && c.registrationStatus === 'registered' && c.rliRegisteredAt === '2026-10-14' && c.registrationCode === 'TKR26T001234000AB');
  const key = [...storageFiles.keys()].find(k => k.startsWith('contracts/ctr1/ricevuta-registrazione-'));
  check('handler: la ricevuta sta su Storage sotto contracts/<id>/ coi byte caricati', !!key && Buffer.compare(storageFiles.get(key), PDF) === 0 && !!c.registrationReceiptUrl);
  check('handler: chiuse SOLO le scadenze della registrazione di QUESTO contratto (tutte e due le forme)', store.get('deadlines/d1').status === 'done' && store.get('deadlines/d2').status === 'done'
    && store.get('deadlines/d3').status === 'pending' && store.get('deadlines/d4').status === 'pending' && res.body.deadlinesClosed === 2);
  const docs = ['tenant', 'landlord', 'co0'].map(w => store.get('documents/' + R.receiptDocId('ctr1', w)));
  check('handler: ricevuta nell’archivio di inquilino, proprietario e co-conduttore', docs.every(d => d && d.type === 'receipt' && d.fileUrl === c.registrationReceiptUrl)
    && docs[0].userId === 't1' && docs[1].userId === 'own1' && docs[2].userId === 't2');
  const jm = mailTo('julie@tenant.fr'), am = mailTo('anouk@tenant.fr'), lm = mailTo('stefano@landlord.it');
  check('handler: email con la ricevuta in allegato a conduttrice e co-conduttrice (EN) e proprietario (IT)', jm.length === 1 && am.length === 1 && lm.length === 1
    && /registered/i.test(jm[0].subject) && /Contratto registrato/.test(lm[0].subject)
    && Buffer.compare(jm[0].attachments[0].content, PDF) === 0 && /TKR26T001234000AB/.test(lm[0].html));
  check('handler: l’invio è timbrato sul contratto', store.get('contracts/ctr1').registrationReceiptSentUrl === c.registrationReceiptUrl);

  const again = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', code: 'TKR26T001234000AB' });
  check('handler: risalvare senza file nuovo NON rimanda le email (una volta per file)', again.code === 200 && again.body.skipped === 'already_sent' && mails().length === 3);
  const forced = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', resend: true });
  check('handler: anche «rimanda» non riscrive a chi l’ha GIÀ ricevuta (registro per destinatario)', forced.code === 200 && forced.body.sent.length === 0
    && forced.body.alreadySent.length === 3 && forced.body.skipped === 'already_sent' && mails().length === 3);

  seed();
  const quiet = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', base64: PDF64, contentType: 'application/pdf', notify: false });
  check('handler: notifica spenta = archivio sì, email no', quiet.code === 200 && quiet.body.skipped === 'notify_off' && mails().length === 0 && quiet.body.archived === 3);
  seed();
  const nofile = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14' });
  check('handler: senza file = solo stato, niente archivio né email', nofile.code === 200 && nofile.body.skipped === 'no_file' && nofile.body.archived === 0 && mails().length === 0);
  const r404 = await drive({ op: 'registered', contractId: 'sparito', date: '2026-10-14' });
  check('handler: contratto inesistente 404', r404.code === 404);
}

// ═══ 3b. Ricevute per destinatario e per file (review Codex, 15/10) ═════
{
  const fail550 = (addr) => (o) => o.to === addr ? Object.assign(new Error('550 5.1.1 mailbox unavailable'), { responseCode: 550 }) : null;
  seed(); globalThis.__mailAttempts = [];
  globalThis.__mailFail = fail550('stefano@landlord.it');
  const first = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', base64: PDF64, contentType: 'application/pdf', name: 'ricevuta.pdf' });
  globalThis.__mailFail = null;
  check('ricevute: primo invio = 3 tentativi, 2 consegnate, proprietario respinto', globalThis.__mailAttempts.length === 3 && mails().length === 2
    && first.body.sent.length === 2 && first.body.failed.join() === 'landlord');
  const led = store.get('contracts/ctr1').registrationReceiptDelivery || {};
  const st = Object.values(led).map(e => e.who + ':' + e.status).sort().join();
  check('ricevute: il registro dice chi l’ha ricevuta e chi no, per destinatario', st === 'cotenant0:sent,landlord:failed,tenant:sent'
    || st === 'co0:sent,landlord:failed,tenant:sent' || (Object.values(led).length === 3 && Object.values(led).filter(e => e.status === 'sent').length === 2
      && Object.values(led).find(e => e.who === 'landlord').status === 'failed'));
  check('ricevute: il timbro elenca SOLO chi l’ha ricevuta', !(store.get('contracts/ctr1').registrationReceiptSentTo || []).includes('landlord'));
  const again = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14' });
  check('ricevute: il risalvataggio normale manda SOLO al proprietario (prima: already_sent con 0 tentativi)', again.code === 200
    && again.body.sent.length === 1 && again.body.sent[0].who === 'landlord' && again.body.alreadySent.length === 2);
  check('ricevute: totale consegnate 3, nessun doppione a conduttrice e co-conduttrice', mails().length === 3 && globalThis.__mailAttempts.length === 4
    && mailTo('julie@tenant.fr').length === 1 && mailTo('anouk@tenant.fr').length === 1 && mailTo('stefano@landlord.it').length === 1
    && Buffer.compare(mailTo('stefano@landlord.it')[0].attachments[0].content, PDF) === 0);
  const third = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14' });
  check('ricevute: a tutti consegnata → already_sent, zero tentativi', third.body.skipped === 'already_sent' && globalThis.__mailAttempts.length === 4);

  // Esito INCERTO (timeout): non riparte da solo, solo col «rimanda» esplicito e solo a quella persona.
  seed(); globalThis.__mailAttempts = [];
  globalThis.__mailFail = (o) => o.to === 'julie@tenant.fr' ? new Error('socket hang up') : null;
  const u1 = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', base64: PDF64, contentType: 'application/pdf' });
  globalThis.__mailFail = null;
  check('ricevute: socket caduta = «uncertain» (può essere arrivata)', u1.body.uncertain.join() === 'tenant' && u1.body.sent.length === 2);
  const u2 = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14' });
  check('ricevute: l’incerta NON riparte col risalvataggio normale', u2.body.skipped === 'uncertain_needs_resend' && globalThis.__mailAttempts.length === 3);
  const u3 = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', resend: true });
  check('ricevute: «rimanda» esplicito manda SOLO all’incerta', u3.body.sent.length === 1 && u3.body.sent[0].who === 'tenant'
    && mailTo('julie@tenant.fr').length === 1 && mailTo('anouk@tenant.fr').length === 1 && mailTo('stefano@landlord.it').length === 1);

  // Un file NUOVO è un'altra ricevuta: riparte a tutti.
  const PDF2 = Buffer.from('%PDF-1.7\nricevuta corretta\n%%EOF');
  const nf = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', base64: PDF2.toString('base64'), contentType: 'application/pdf' });
  check('ricevute: un file nuovo riparte a tutti, coi byte nuovi', nf.body.sent.length === 3
    && Buffer.compare(mailTo('stefano@landlord.it').at(-1).attachments[0].content, PDF2) === 0);

  // Il registro legacy (timbro per file) vale come «sent»: niente doppioni dopo il deploy.
  seed();
  await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14', base64: PDF64, contentType: 'application/pdf', notify: false });
  const cu = store.get('contracts/ctr1');
  cu.registrationReceiptSentUrl = cu.registrationReceiptUrl; cu.registrationReceiptSentTo = ['tenant', 'landlord'];
  const lg = await drive({ op: 'registered', contractId: 'ctr1', date: '2026-10-14' });
  check('ricevute: chi era nel timbro legacy non la riceve due volte', lg.body.sent.length === 1 && lg.body.alreadySent.length === 2
    && mailTo('anouk@tenant.fr').length === 1 && mailTo('julie@tenant.fr').length === 0);
}

// ═══ 3c. IBAN per finalità e fonte (foglio e pacchetto) ═════════════════
{
  const { sheetRows } = await import('../../api/sign/_foglio.js');
  const rowOf = (rows, label) => (rows.find(r => r.includes('>' + label + '<')) || '');
  const base = { type: 'transitorio', startDate: '2026-09-01', endDate: '2027-08-31', rent: 1000, cedolareSecca: 'no', tenantName: 'X', landlordName: 'Y' };
  const r1 = sheetRows({ contract: { ...base, landlordIban: 'IT60 X054 2811 1010 0000 0123 456' }, property: {} }).rows;
  check('IBAN: il canone stampa l’IBAN del locatore con la fonte', /IT60X0542811101000000123456/.test(rowOf(r1, 'IBAN canone (locatore)')) && /dal contratto/.test(rowOf(r1, 'IBAN canone (locatore)')));
  check('IBAN: il conto tributi NON si deduce dal canone (assente = non dichiarato)', !!rowOf(r1, 'Conto addebito tributi RLI')
    && !/IT60X0542811101000000123456/.test(rowOf(r1, 'Conto addebito tributi RLI')) && /intestato al richiedente RLI/.test(rowOf(r1, 'Conto addebito tributi RLI')));
  const r2 = sheetRows({ contract: { ...base }, property: {} }).rows;
  check('IBAN: senza dati nessuno dei due inventato', !/IT\d\d/.test(rowOf(r2, 'IBAN canone (locatore)')) && !/IT\d\d/.test(rowOf(r2, 'Conto addebito tributi RLI')));
  const r3 = sheetRows({ contract: { ...base, landlordIban: 'IT60X0542811101000000123456', rliDebitIban: 'IT60X0542811101000000123456' }, property: {} }).rows;
  check('IBAN: conto tributi uguale al canone = dichiarato, detto, e intestatario mancante segnalato', /dichiarato così, non dedotto/.test(rowOf(r3, 'Conto addebito tributi RLI'))
    && /intestatario non dichiarato/.test(rowOf(r3, 'Conto addebito tributi RLI')));
  const r4 = sheetRows({ contract: { ...base, rliDebitIban: 'IT02 L123 4512 3451 2345 6789 012', rliDebitHolder: 'Egidi Immobiliare S.r.l.' }, property: {} }).rows;
  check('IBAN: conto tributi dichiarato dall’operatore con l’intestatario, canone resta non dichiarato', /IT02L1234512345123456789012/.test(rowOf(r4, 'Conto addebito tributi RLI'))
    && /Egidi Immobiliare/.test(rowOf(r4, 'Conto addebito tributi RLI')) && !/IT02L/.test(rowOf(r4, 'IBAN canone (locatore)')));
  const F = await import('../../js/contract-fields.js');
  const FF = F.default || F;
  const op = FF.askFor('operator', { contract: { type: 'transitorio' }, property: {}, tenant: {}, landlord: {} });
  const keys = JSON.stringify(op);
  check('IBAN: il conto tributi è un campo dell’OPERATORE (sezione Registrazione), distinto dall’IBAN del locatore', /rliDebitIban/.test(keys) && /rliDebitHolder/.test(keys) && !/"landlordIban"/.test(keys));
}

// ═══ 3d. Pack rigenerato: i documenti dei co-conduttori dal profilo ═════
{
  seed();
  const COT = Buffer.from('BYTES-DOC-ANOUK-CARICATO-DOPO-LA-FIRMA');
  storageFiles.set('doc/anouk-ci.jpg', COT);
  // Caricato sul PROFILO di Anouk DOPO la firma: il contratto non lo ha.
  store.get('users/t2').identityDocs = [{ url: 'https://firebasestorage.googleapis.com/v0/b/x/o/' + encodeURIComponent('doc/anouk-ci.jpg') + '?alt=media', name: 'anouk-ci.jpg' }];
  const handler = (await import('../../api/fiscal/pack.js')).default;
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { contractId: 'ctr1' } }, res);
  const zipKey = [...storageFiles.keys()].find(k => /^contracts\/ctr1\/.*\.zip$/.test(k));
  const readZip = (buf) => {
    const eocd = buf.length - 22; const count = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16); const files = {};
    for (let i = 0; i < count; i++) {
      const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), cmtLen = buf.readUInt16LE(off + 32);
      const size = buf.readUInt32LE(off + 24), lho = buf.readUInt32LE(off + 42);
      const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
      const ln = buf.readUInt16LE(lho + 26), le = buf.readUInt16LE(lho + 28);
      files[name] = buf.slice(lho + 30 + ln + le, lho + 30 + ln + le + size); off += 46 + nameLen + extraLen + cmtLen;
    }
    return files;
  };
  let zf = {}; try { zf = readZip(storageFiles.get(zipKey)); } catch (e) { console.log('  zip:', e.message); }
  check('pack rigenerato: 200 e ZIP su Storage', res.code === 200 && !!zipKey);
  check('pack rigenerato: il documento caricato sul profilo del co-conduttore DOPO la firma è dentro, coi suoi byte',
    Object.entries(zf).some(([n, b]) => /anouk-ci/.test(n) && Buffer.compare(b, COT) === 0));
  check('pack rigenerato: non scrive i documenti sul contratto', (store.get('contracts/ctr1').identityDocs || []).length === 1);
}

// ═══ 4. Giunzioni sulla sorgente ════════════════════════════════════════
{
  const fin = fs.readFileSync(new URL('../../api/sign/_finalize.js', import.meta.url), 'utf8');
  check('finalize: il Foglio non parte più da solo (una email sola all’operatore)', !/sendRegistrationSheet\(/.test(fin));
  check('finalize: i documenti dei profili entrano prima delle email', fin.indexOf('mergeIdentityDocs(contract') > -1 && fin.indexOf('mergeIdentityDocs(contract') < fin.indexOf('sendCafDossier('));
  const portal = fs.readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  check('portal: #aspi=<id> apre il pannello del referente, e «Registrato» passa da un solo posto', /function aspiSeedFromHash\(/.test(portal) && /openAspi\(aspiSeed\)/.test(portal)
    && /function markRliRegistered[^{]*\{\s*return openRegistered\(/.test(portal) && /op:\s*'registered'/.test(portal));
}

console.log(`\nRegistrazione: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
