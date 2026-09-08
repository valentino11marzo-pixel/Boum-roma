// tests/pratica/run.mjs — IMPORTA PRATICA, provata sul handler VERO.
//
// Sei casi, tutti chiesti dall'operatore, tutti scritti come prove e non come
// speranze. Firestore, Identity Toolkit, Storage e Anthropic sono finti AI
// CONFINI (globalThis.fetch); api/contracts/import.js e js/pratica-engine.js
// sono quelli di produzione.
//
//   node tests/pratica/run.mjs
//
// Le regole che questa suite difende, in ordine di quanto costa violarle:
//
//   1. NESSUNA FIRMA FALSA. Un contratto di carta non scrive mai i campi di
//      Magic Sign. Verificato per MUTAZIONE: se si toglie la guardia, il test
//      cade.
//   2. NESSUN ARRETRATO INVENTATO. Prima della presa in gestione non nasce
//      nessuna rata, fattura, sollecito o registrazione.
//   3. «NON PAGATO» NON SI DICE SENZA PROVE. Assenza di ricevuta =
//      'da_verificare'.
//   4. IL SECONDO CARICAMENTO NON DUPLICA. Stessa pratica, stesso id.
//   5. DUE DOCUMENTI IN DISACCORDO NON SI SCELGONO DA SOLI.
//   6. UN ERRORE DI LETTURA NON BUTTA VIA GLI ALTRI DOCUMENTI, e non scrive.

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

const PRATICA = (await import('../../js/pratica-engine.js')).default;

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('✗ FAIL ' + name + (extra ? '\n      ' + String(extra).slice(0, 400) : '')); }
};
const section = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length)));

// ─── ambiente finto ───────────────────────────────────────────────────────
process.env.FIREBASE_PROJECT_ID = 'boom-test';
process.env.FIREBASE_API_KEY = 'test-key';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@test.invalid';
process.env.FIREBASE_ADMIN_PASS = 'x';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';

const DB = new Map();            // docPath → { fields }
const UPLOADS = [];              // { path, size, contentType }
let AI_QUEUE = [];               // risposte del modello, in ordine
const AI_CALLS = [];
let ROLE = 'admin';

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  // Identity Toolkit — il token dell'admin server-side
  if (u.includes('accounts:signInWithPassword')) {
    return new Response(JSON.stringify({ idToken: 'server-token' }), { status: 200 });
  }
  // Identity Toolkit — verifica del token del chiamante
  if (u.includes('accounts:lookup')) {
    return new Response(JSON.stringify({ users: [{ localId: 'u_' + ROLE, email: ROLE + '@test.invalid' }] }), { status: 200 });
  }
  // Anthropic
  if (u.includes('api.anthropic.com')) {
    AI_CALLS.push(JSON.parse(opts.body || '{}'));
    const next = AI_QUEUE.shift();
    if (next === undefined) return new Response('no scripted reply', { status: 500 });
    if (next && next.__status) return new Response(next.body || 'err', { status: next.__status });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: typeof next === 'string' ? next : JSON.stringify(next) }] }), { status: 200 });
  }
  // Storage — upload
  if (u.includes('firebasestorage.googleapis.com') && u.includes('uploadType=media')) {
    const name = decodeURIComponent(u.split('name=')[1] || '');
    UPLOADS.push({ path: name, size: (opts.body && opts.body.length) || 0, contentType: (opts.headers || {})['Content-Type'] });
    return new Response(JSON.stringify({ name, downloadTokens: 'tok-' + UPLOADS.length }), { status: 200 });
  }
  // Storage — transito in lettura
  if (u.includes('firebasestorage.googleapis.com')) {
    return new Response(Buffer.from('%PDF-1.4 transito'), { status: 200, headers: { 'content-type': 'application/pdf' } });
  }
  // Firestore
  if (u.includes('firestore.googleapis.com')) {
    const path = u.split('/documents/')[1].split('?')[0];
    const method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET') {
      const doc = DB.get(path);
      return doc ? new Response(JSON.stringify(doc), { status: 200 })
                 : new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    }
    if (method === 'POST') {
      const id = decodeURIComponent((u.match(/documentId=([^&]+)/) || [])[1] || ('auto' + DB.size));
      const full = path + '/' + id;
      if (DB.has(full)) return new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 409 });
      const body = JSON.parse(opts.body || '{}');
      DB.set(full, { name: full, fields: body.fields || {} });
      return new Response(JSON.stringify({ name: full, fields: body.fields || {} }), { status: 200 });
    }
    if (method === 'PATCH') {
      const prev = DB.get(path) || { fields: {} };
      const body = JSON.parse(opts.body || '{}');
      const merged = Object.assign({}, prev.fields, body.fields || {});
      DB.set(path, { name: path, fields: merged });
      return new Response(JSON.stringify({ name: path, fields: merged }), { status: 200 });
    }
  }
  return realFetch(url, opts);
};

// utenti: il profilo che requireRole legge
const setUser = (role) => {
  ROLE = role;
  // fsDocToJs pretende doc.name: senza, il profilo torna null e ogni chiamata
  // muore con "no_profile" — il test misurerebbe il proprio difetto.
  DB.set('users/u_' + role, { name: 'users/u_' + role, fields: { role: { stringValue: role }, name: { stringValue: role } } });
};
['admin', 'owner'].forEach(setUser);
setUser('admin');

const handler = (await import('../../api/contracts/import.js')).default;

function mkRes() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const call = async (body, role = 'admin') => {
  setUser(role);
  const req = { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body };
  const res = mkRes();
  await handler(req, res);
  return res;
};

// documenti sintetici — nessun dato reale
const PDF = (label) => ({ name: label + '.pdf', mediaType: 'application/pdf', base64: Buffer.from('%PDF-1.4 ' + label).toString('base64') });

const CONTRATTO = {
  landlord: { name: 'Bianchi Anna', codiceFiscale: 'BNCNNA80A41H501K' },
  tenant: { name: 'Rossi Mario', codiceFiscale: 'RSSMRA90A01H501Z', email: 'mario@example.invalid' },
  property: { name: 'Via Sintetica 10', address: 'Via Sintetica 10, Roma', sqm: 70 },
  contract: { type: 'studenti', startDate: '2026-01-01', endDate: '2027-06-30', rent: 900, deposit: 1800, depositMonths: 2, paymentDay: 5, installmentMonths: 1, cedolareSecca: true },
  confidence: 88,
  notes: ['deposito indicato in due mensilità'],
  provenance: { 'contract.rent': { page: 2, quote: 'canone mensile di euro novecento' } },
};

// ═══ 1 · doppio caricamento ═══════════════════════════════════════════════
section('1 · doppio caricamento: stessa pratica, mai due');
AI_QUEUE = [CONTRATTO];
let r = await call({ op: 'extract', files: [PDF('contratto')] });
ok(r.code === 200 && r.body.ok, 'prima lettura riuscita', JSON.stringify(r.body).slice(0, 200));
const key1 = r.body.praticaKey;
ok(!!key1, 'la pratica ha un\'identità derivata dai fatti', key1);
ok(r.body.written === false, 'extract NON scrive niente (come l\'Innesto)');
ok(DB.size === 2, 'nessun documento creato dalla lettura (solo i due utenti)', 'DB=' + DB.size);
ok(r.body.extraction.fields['contract.rent'].page === 2, 'la provenienza porta la pagina');
ok(/novecento/.test(r.body.extraction.fields['contract.rent'].quote || ''), 'la provenienza porta la citazione copiata');

AI_QUEUE = [CONTRATTO];
r = await call({ op: 'extract', files: [PDF('contratto')] });
ok(r.body.praticaKey === key1, 'la SECONDA lettura dello stesso contratto dà la STESSA pratica');

// grafia diversa, stessa casa
AI_QUEUE = [Object.assign({}, CONTRATTO, { property: { name: 'via sintetica 10', address: 'VIA SINTETICA, 10 - Roma' } })];
r = await call({ op: 'extract', files: [PDF('copia')] });
ok(r.body.praticaKey === key1, 'indirizzo scritto diversamente: sempre la stessa pratica');

// ═══ 2 · conferma, firma esterna, presa in gestione ═══════════════════════
section('2 · contratto firmato ESTERNAMENTE: nessuna firma simulata');
const draftBase = () => ({
  reviewed: true,
  takeoverDate: '2026-09-01',
  extraction: { fields: JSON.parse(JSON.stringify(r0fields)), conflicts: [] },
  links: { property: { chosen: null, createNew: true }, tenant: { chosen: null, createNew: true } },
  signature: { mode: 'external', signedOn: '2025-12-20', verifiedBy: 'operatore', verifiedAt: '2026-09-01', evidenceSourceKey: 'src_abc' },
  sources: [PDF('contratto')],
});
AI_QUEUE = [CONTRATTO];
const r0 = await call({ op: 'extract', files: [PDF('contratto')] });
const r0fields = r0.body.extraction.fields;

let conf = await call({ op: 'confirm', draft: draftBase() });
ok(conf.code === 200 && conf.body.ok, 'la pratica si crea dopo la revisione', JSON.stringify(conf.body).slice(0, 250));
const praticaId = conf.body.id;
const saved = DB.get('contracts/' + praticaId);
ok(!!saved, 'la pratica è un doc `contracts` (nessuna collection parallela)');
const f = saved ? saved.fields : {};
ok(f.origin && f.origin.stringValue === 'imported', 'il contratto dichiara di essere importato');
const magic = PRATICA.MAGIC_FIELDS.filter((k) => Object.prototype.hasOwnProperty.call(f, k));
ok(magic.length === 0, 'NESSUN campo di Magic Sign scritto', magic.join(','));
ok(!!f.signature, 'la firma esterna vive in un blocco suo');
ok(UPLOADS.some((u) => u.path.startsWith('contracts/' + praticaId + '/originali/')),
   'l\'originale è archiviato sotto contracts/<id>/originali/ (admin-only nelle storage.rules)');

// firma esterna incompleta → rifiutata
let bad = await call({ op: 'confirm', draft: Object.assign(draftBase(), { signature: { mode: 'external', signedOn: '2025-12-20' } }) });
ok(bad.code === 400 && bad.body.error === 'signature_incomplete', 'firma esterna senza verifica dell\'operatore: rifiutata');

// la stessa guardia alla PORTA, non solo nel motore: un chiamante che
// infila una firma nel draft viene fermato prima di qualunque scrittura.
const dbPreInject = DB.size;
const inject = await call({ op: 'confirm', draft: Object.assign(draftBase(), {
  patch: { tenantSignature: 'data:image/png;base64,AAA', signatureStatus: 'complete' } }) });
ok(inject.code === 400 && /firma digitale/.test(JSON.stringify(inject.body)),
   'una firma Magic Sign infilata nel draft: la PORTA rifiuta', JSON.stringify(inject.body).slice(0, 200));
ok(DB.size === dbPreInject, 'e non scrive niente');

// la guardia, per MUTAZIONE
const touched = PRATICA.magicSignFieldsTouched({ tenantSignature: 'data:image/png;base64,AAA', rent: 900 });
ok(touched.length === 1 && touched[0] === 'tenantSignature', 'magicSignFieldsTouched riconosce una firma introdotta di nascosto');
ok(PRATICA.magicSignFieldsTouched({ rent: 900 }).length === 0, 'un patch onesto passa');

// stati
const st = PRATICA.states({ signature: { mode: 'external', verifiedBy: 'operatore', verifiedAt: '2026-09-01' } });
ok(st.firmato.state === 'firmato' && st.firmato.external === true, 'stato firmato: dichiarato ESTERNO, non Magic Sign');
ok(st.registrato.state === PRATICA.UNKNOWN, 'registrato è un asse SEPARATO e parte da verificare');
ok(st.consegnato.state === PRATICA.UNKNOWN, 'consegnato è un asse separato');

// ═══ 3 · doppio caricamento sulla PRATICA ════════════════════════════════
section('3 · ricaricare la stessa pratica non ne crea una seconda');
const before = DB.size;
const dup = await call({ op: 'confirm', draft: draftBase() });
ok(dup.code === 409 && dup.body.error === 'pratica_exists', 'seconda conferma: 409, non un secondo contratto');
ok(DB.size === before, 'nessun documento in più', 'prima=' + before + ' dopo=' + DB.size);
ok(/Aggiungi documento/.test(dup.body.message || ''), 'e dice all\'operatore cosa fare invece');

const att = await call({ op: 'attach', praticaId, files: [PDF('contratto')], reread: false });
ok(att.code === 200 && att.body.added === 0, 'allegare lo STESSO file: niente di nuovo');
ok((att.body.duplicates || []).length === 1, 'il duplicato è dichiarato, non silenzioso');

// ═══ 4 · dati discordanti ════════════════════════════════════════════════
section('4 · due documenti in disaccordo: nessuno vince da solo');
AI_QUEUE = [
  CONTRATTO,
  Object.assign({}, CONTRATTO, { contract: Object.assign({}, CONTRATTO.contract, { rent: 1100 }) }),
];
const disc = await call({ op: 'extract', files: [PDF('contratto'), PDF('allegato')] });
ok(disc.code === 200 && disc.body.ok, 'due documenti letti');
const cf = disc.body.extraction.conflicts.filter((c) => c.path === 'contract.rent');
ok(cf.length === 1, 'il canone discorde è registrato come CONFLITTO', JSON.stringify(disc.body.extraction.conflicts));
ok(cf[0] && String(cf[0].kept) === '900' && String(cf[0].seen) === '1100', 'entrambi i valori restano visibili');
ok(String(disc.body.extraction.fields['contract.rent'].value) === '900', 'il primo valore NON viene sovrascritto in silenzio');
const inc = PRATICA.inconsistencies({ extraction: disc.body.extraction });
ok(inc.some((i) => i.level === 'errore' && i.path === 'contract.rent'), 'il conflitto è un\'incongruenza bloccante');
const gate = PRATICA.confirmable({ reviewed: true, takeoverDate: '2026-09-01', extraction: disc.body.extraction });
ok(!gate.ok, 'con un conflitto aperto la pratica NON si conferma', JSON.stringify(gate.errors));

// un valore CONFERMATO dall'operatore non si fa sovrascrivere da una lettura
const withConfirmed = { fields: { 'contract.rent': { value: 900, source: 's1', confirmed: true } }, conflicts: [] };
const m = PRATICA.mergeExtraction(withConfirmed, { contract: { rent: 1100 } }, { sourceKey: 's2' });
ok(String(m.fields['contract.rent'].value) === '900', 'il valore confermato dall\'operatore resta');
ok(m.conflicts.length === 1 && /confermato/.test(m.conflicts[0].reason), 'ma il disaccordo viene detto lo stesso');

// ═══ 5 · presa in gestione: nessun arretrato inventato ═══════════════════
section('5 · presa in gestione: il passato non si fabbrica');
const plan = PRATICA.takeoverPlan({ startDate: '2026-01-01', endDate: '2027-01-01', takeoverDate: '2026-09-01', installmentMonths: 1 });
ok(plan.ok, 'piano calcolato');
ok(plan.historical.length === 8, '8 periodi PRIMA della presa in gestione restano storici', 'storici=' + plan.historical.length);
ok(plan.managed.length === 4, '4 periodi in gestione', 'gestiti=' + plan.managed.length);
ok(plan.managed.every((p) => p.from >= '2026-09-01'), 'nessun periodo gestito precede la presa in gestione');
['payment', 'invoice', 'reminder', 'registration'].forEach((kind) => {
  const g = PRATICA.guardBackdated({ kind, date: '2026-03-01' }, { takeoverDate: '2026-09-01' });
  ok(!g.allowed, 'niente ' + kind + ' per un periodo anteriore alla presa in gestione');
});
ok(PRATICA.guardBackdated({ kind: 'payment', date: '2026-10-01' }, { takeoverDate: '2026-09-01' }).allowed,
   'un periodo in gestione invece passa');
const noTake = PRATICA.takeoverPlan({ startDate: '2026-01-01', endDate: '2027-01-01' });
ok(!noTake.ok && noTake.errors.some((e) => /presa in gestione/.test(e)), 'senza la data non si genera NESSUNO scadenzario');
const confNoTake = await call({ op: 'confirm', draft: Object.assign(draftBase(), { takeoverDate: '' }) });
ok(confNoTake.code === 400, 'e la porta rifiuta la conferma senza quella data');

// ═══ 6 · la ricevuta che arriva dopo ═════════════════════════════════════
section('6 · nessuna ricevuta = DA VERIFICARE, mai «non pagato»');
const senza = PRATICA.receiptStatus({ period: '2026-09' });
ok(senza.state === PRATICA.UNKNOWN, 'senza ricevuta lo stato è da_verificare', senza.state);
ok(!/non pagat/i.test(senza.basis.replace('NON risulta non pagato', '')), 'e la motivazione non accusa il cliente');
ok(/da verificare/i.test(senza.basis), 'lo dice esplicitamente', senza.basis);
const conRic = PRATICA.receiptStatus({ period: '2026-09', receipt: { documentId: 'doc1' } });
ok(conRic.state === 'pagato' && conRic.verified, 'con la ricevuta: pagato e verificato');
const dichiarato = PRATICA.receiptStatus({ period: '2026-09', declaredPaidBy: 'proprietario' });
ok(dichiarato.state === 'pagato' && !dichiarato.verified, 'dichiarato senza ricevuta: pagato ma NON verificato');

const axis = PRATICA.states({ periods: [{ period: '2026-09' }, { period: '2026-10', receipt: { documentId: 'd' } }] }).pagato;
ok(axis.state === PRATICA.UNKNOWN && axis.detail.length === 2, 'un periodo senza prova tiene l\'asse su da_verificare');
const na = PRATICA.nextAction({
  takeoverDate: '2026-09-01', startDate: '2026-01-01', endDate: '2027-01-01',
  signature: { mode: 'external', verifiedBy: 'op', verifiedAt: '2026-09-01' },
  registration: { registeredAt: '2026-01-20', protocol: 'RM/123' },
  periods: [{ period: '2026-09' }],
});
ok(/Verifica il pagamento del periodo 2026-09/.test(na.action), 'la prossima azione è VERIFICARE, non sollecitare', na.action);
ok(na.owner === 'operatore', 'con un responsabile');

// la ricevuta arriva dopo: si allega, non si duplica la pratica
AI_QUEUE = [{ contract: {}, notes: [] }];
const later = await call({ op: 'attach', praticaId, files: [PDF('ricevuta-settembre')] });
ok(later.code === 200 && later.body.added === 1, 'la ricevuta successiva si allega alla pratica esistente');
ok(DB.size === before, 'e non nasce nessuna seconda pratica', 'DB=' + DB.size);
const after = DB.get('contracts/' + praticaId);
ok(!!after, 'la pratica è ancora una sola');

// ═══ 7 · dati mancanti ═══════════════════════════════════════════════════
section('7 · dati mancanti: si dice cosa manca, non si indovina');
ok(PRATICA.praticaKey({ property: { address: 'Via X 1' } }) === null,
   'con un solo asse non si inventa un\'identità di pratica');
ok(PRATICA.praticaKey({ property: { address: 'Via X 1' }, contract: { startDate: '2026-01-01' } }) !== null,
   'con due assi sì');
// Il caso che rende necessaria la soglia di DUE assi: due contratti
// successivi sullo stesso appartamento — l'inquilino che esce e quello che
// entra — non devono MAI collassare nella stessa pratica.
const casaA = { property: { address: 'Via Sintetica 10, Roma' }, tenant: { name: 'Rossi Mario' }, contract: { startDate: '2024-01-01' } };
const casaB = { property: { address: 'Via Sintetica 10, Roma' }, tenant: { name: 'Verdi Luca' }, contract: { startDate: '2026-01-01' } };
ok(PRATICA.praticaKey(casaA) !== PRATICA.praticaKey(casaB),
   'stesso immobile, inquilini e date diverse: DUE pratiche distinte');
const stessoInquilinoAltraCasa = { property: { address: 'Via Altra 3, Roma' }, tenant: { name: 'Rossi Mario' }, contract: { startDate: '2024-01-01' } };
ok(PRATICA.praticaKey(casaA) !== PRATICA.praticaKey(stessoInquilinoAltraCasa),
   'stesso inquilino, immobile diverso: due pratiche distinte');
const gaps = PRATICA.confirmable({ reviewed: false, extraction: { fields: {} } });
ok(!gaps.ok && gaps.errors.some((e) => /revisione/.test(e)), 'senza revisione umana non si conferma');
const miss = PRATICA.missingDocs({ documents: [{ key: 'contratto', documentId: 'd1' }] });
ok(miss.find((m) => m.key === 'contratto').present === true, 'il contratto allegato risulta presente');
const assenti = miss.filter((m) => !m.present).map((m) => m.key);
ok(assenti.includes('registrazione') && assenti.includes('ape') && assenti.includes('verbale'),
   'i mancanti sono elencati per nome', assenti.join(','));
ok(miss.every((m) => m.why), 'ognuno dice PERCHÉ serve');

// ═══ 8 · errore di estrazione ════════════════════════════════════════════
section('8 · errore di lettura: non butta via gli altri, non scrive');
const dbBefore = DB.size;
AI_QUEUE = [{ __status: 502, body: 'overloaded' }, CONTRATTO];
const mixed = await call({ op: 'extract', files: [PDF('illeggibile'), PDF('buono')] });
ok(mixed.code === 200 && mixed.body.ok, 'la lettura complessiva riesce lo stesso');
const failedFile = (mixed.body.files || []).filter((x) => x.ok === false);
ok(failedFile.length === 1, 'il file illeggibile è dichiarato fallito', JSON.stringify(mixed.body.files));
ok((mixed.body.files || []).some((x) => x.ok === true), 'e l\'altro è stato elaborato');
ok(mixed.body.notes.some((n) => /lettura non riuscita/.test(n)), 'la nota lo spiega all\'operatore');
ok(DB.size === dbBefore, 'un errore di estrazione non scrive niente');

AI_QUEUE = [{ __status: 502, body: 'x' }];
const allBad = await call({ op: 'extract', files: [PDF('rotto')] });
ok(allBad.body.ok === true && (allBad.body.files || []).every((x) => x.ok === false),
   'tutti i file illeggibili: nessun dato inventato, esito dichiarato');
ok(!allBad.body.praticaKey, 'e nessuna identità di pratica dal nulla');

// JSON malformato del modello
AI_QUEUE = ['{ questo non è json'];
const badJson = await call({ op: 'extract', files: [PDF('storto')] });
ok((badJson.body.files || []).every((x) => x.ok === false), 'JSON del modello illeggibile: file fallito, mai un valore a caso');

// ═══ 9 · permessi e isolamento ═══════════════════════════════════════════
section('9 · permessi e isolamento dei documenti');
AI_QUEUE = [CONTRATTO];
const ownerRead = await call({ op: 'extract', files: [PDF('c')] }, 'owner');
ok(ownerRead.code === 200, 'un owner può LEGGERE un documento (come l\'Innesto)');
const ownerWrite = await call({ op: 'confirm', draft: draftBase() }, 'owner');
ok(ownerWrite.code === 403, 'ma NON può creare una pratica: contracts è admin-only', 'code=' + ownerWrite.code);
const dbNow = DB.size;
ok(dbNow === DB.size, 'e il tentativo non ha scritto niente');

setUser('admin');
const badHost = await call({ op: 'extract', files: [{ name: 'x.pdf', mediaType: 'application/pdf', fileUrl: 'https://evil.example.com/x.pdf' }] });
ok(badHost.code === 400 && /transit_host_not_allowed/.test(JSON.stringify(badHost.body)),
   'un URL fuori dal nostro Storage viene rifiutato: l\'endpoint non è un proxy');
ok(UPLOADS.every((u) => u.path.startsWith('contracts/')), 'ogni originale sta sotto contracts/<id>/, mai in una cartella pubblica');

// ═══ 10 · formati dichiarati ═════════════════════════════════════════════
section('10 · formati: dichiarati, non scoperti con un errore');
ok(PRATICA.acceptsFile({ name: 'c.pdf', mediaType: 'application/pdf' }).ok, 'PDF accettato');
['jpg', 'png', 'webp', 'heic'].forEach((e) => ok(PRATICA.acceptsFile({ name: 'f.' + e }).ok, e.toUpperCase() + ' accettato'));
const docx = PRATICA.acceptsFile({ name: 'contratto.docx' });
ok(!docx.ok && /PDF/.test(docx.why), 'DOCX rifiutato CON il motivo e la via d\'uscita', docx.why);
ok(!PRATICA.acceptsFile({ name: 'a.zip' }).ok, 'ZIP rifiutato');
ok(!PRATICA.acceptsFile({ name: 'movimenti.csv' }).ok, 'CSV rifiutato (per i movimenti c\'è la Banca)');
ok(PRATICA.NOT_ACCEPTED.every((n) => n.why), 'ogni formato rifiutato spiega perché');

// ═══ 11 · agganci proposti, mai fusioni ══════════════════════════════════
section('11 · agganci: proposti, mai fusi sul solo nome');
const archive = {
  properties: [{ id: 'p1', name: 'Via Sintetica 10', address: 'Via Sintetica 10, Roma' }],
  users: [{ id: 't1', name: 'Rossi Mario', codiceFiscale: 'RSSMRA90A01H501Z' }, { id: 't2', name: 'Rossi Mario' }],
  landlords: [{ id: 'l1', name: 'Bianchi Anna' }],
};
const links = PRATICA.linkProposals({
  property: { address: 'via sintetica 10 roma' },
  tenant: { name: 'Rossi Mario', codiceFiscale: 'RSSMRA90A01H501Z' },
  landlord: { name: 'Bianchi Anna' },
}, archive);
ok(links.property.decision === 'collega' && links.property.preselected === 'p1', 'stesso indirizzo: aggancio proposto');
ok(links.tenant.decision === 'collega' && links.tenant.preselected === 't1', 'stesso codice fiscale: aggancio proposto');
ok(links.landlord.decision === 'da_confermare' && !links.landlord.preselected,
   'SOLO il nome: mostrato ma MAI pre-selezionato', JSON.stringify(links.landlord));
const tie = PRATICA.linkProposals({ tenant: { name: 'Rossi Mario' } }, archive);
ok(tie.tenant.decision === 'da_confermare', 'due omonimi: sceglie l\'operatore', JSON.stringify(tie.tenant));
ok(/stesso punteggio|indizio debole/.test(tie.tenant.why), 'e il motivo è scritto');
const nuovo = PRATICA.linkProposals({ tenant: { name: 'Sconosciuto Ignoto' } }, archive);
ok(nuovo.tenant.decision === 'nuovo', 'nessuna corrispondenza: si crea nuovo, senza forzature');

console.log('\n' + '─'.repeat(64));
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
