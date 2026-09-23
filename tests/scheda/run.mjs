// tests/scheda/run.mjs — La Scheda: anagrafica universale senza firma.
// Handler REALI (api/profile/*), rete stubbata: Firestore in-memory,
// Storage e Anthropic finti. Copre la NOSTRA logica: token derivato
// (ruolo dentro la derivazione, verifica timing-safe), precedenza del
// prefill (contratto → schema sign → schema wizard), lock post-firma,
// sync del profilo su ENTRAMBI gli schemi users, upload con OCR
// opzionale che non blocca mai, link admin autorizzato.
// Uso: node tests/scheda/run.mjs

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-scheda';
delete process.env.ANTHROPIC_API_KEY;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

// ── Stub fetch: Firestore in-memory con valori annidati veri ────────────
const store = new Map();          // 'collection/docId' → plain JS object
let anthropicCalls = 0;
let storageUploads = [];

const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });

function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
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
  if (url.includes('firebasestorage.googleapis.com')) {
    storageUploads.push({ url, bytes: (opts.body && opts.body.length) || 0 });
    return okJson({ downloadTokens: 'dltok' });
  }
  if (url.includes('api.anthropic.com')) {
    anthropicCalls++;
    return okJson({ content: [{ text: JSON.stringify({ name: 'Mario OCR Rossi', cf: 'RSSMRA85T10A562S', dob: '1985-12-10', pob: 'Roma, Italy', docType: 'passport', docNum: 'YA111', docIssuer: 'Questura di Roma', docIssueDate: '2020-01-01', nationality: 'Italian' }) }] });
  }
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
// Un IP per blocco: il rate-limit di magic-sign/_shared è un contatore
// unico per IP condiviso da tutti gli endpoint che lo importano.
let IP = '1.2.3.1';
const mkReq = (body, headers = {}) => ({ method: 'POST', headers: { 'x-forwarded-for': IP, ...headers }, body, socket: {} });

// ═══ 1. Token derivato ═══
const { schedaToken, schedaRef, parseSchedaRef, schedaUrl, mergedIdentity, identityComplete, validCF } = await import('../../api/profile/_scheda.js');
{
  const ref = schedaRef('ctr1', 'tenant');
  const p = parseSchedaRef(ref);
  check('token: ref valido → {contractId, role}', p && p.contractId === 'ctr1' && p.role === 'tenant');
  check('token: manomesso → null', parseSchedaRef(ref.slice(0, -2) + 'zz') === null);
  check('token: ruolo scambiato (t→l) → null', parseSchedaRef('ctr1.l.' + schedaToken('ctr1', 'tenant')) === null);
  check('token: spazzatura → null', parseSchedaRef('x') === null && parseSchedaRef('') === null && parseSchedaRef(null) === null);
  check('token: id con underscore (pa_xxx) round-trip', (parseSchedaRef(schedaRef('pa_abc9', 'landlord')) || {}).contractId === 'pa_abc9');
  check('url: /scheda?t=…', schedaUrl('ctr1', 'tenant').includes('/scheda?t=ctr1.t.'));
  check('cf: checksum vero accettato, falso respinto', validCF('RSSMRA85T10A562S') === true && validCF('RSSMRA85T10A562X') === false);
}

// ═══ 2. Prefill: precedenza contratto → sign → wizard ═══
{
  const m = mergedIdentity(
    { tenantCF: 'CONTRACTCF1111111'.slice(0, 16), tenantDob: '' },
    { cf: 'SIGNSCHEMA111111', codiceFiscale: 'WIZARDSCHEMA1111', dob: '1990-01-01', birthDate: '1980-01-01', name: 'Ada' },
    'tenant'
  );
  check('prefill: campo contratto vince sul profilo', m.cf === 'CONTRACTCF111111');
  check('prefill: schema sign vince sul wizard', m.dob === '1990-01-01');
  const m2 = mergedIdentity({}, { codiceFiscale: 'WIZARDONLY111111', birthDate: '1970-05-05' }, 'tenant');
  check('prefill: solo wizard → comunque letto', m2.cf === 'WIZARDONLY111111' && m2.dob === '1970-05-05');
  check('identityComplete: senza cf → false', identityComplete({ name: 'A', dob: 'x', pob: 'x', address: 'x', docNum: 'x', nationality: 'x' }) === false);
}

// ═══ 3. lookup ═══
const lookup = (await import('../../api/profile/lookup.js')).default;
{
  store.set('contracts/ctr1', {
    propertyId: 'prop1', tenantId: 'u1',
    tenantCF: 'RSSMRA85T10A562S',
    landlordSignature: 'data:image/png;base64,xxx',
  });
  store.set('properties/prop1', { name: 'Trastevere Loft', address: 'Via della Lungaretta 12', ownerId: 'own1' });
  store.set('users/u1', { name: 'Mario Rossi', email: 'm@x.it', dob: '1985-12-10', birthPlace: 'Roma' });

  let r = mkRes();
  await lookup(mkReq({ t: 'ctr1.t.deadbeef' }), r);
  check('lookup: token invalido → 404 invalid_link', r.code === 404 && r.body.error === 'invalid_link');

  r = mkRes();
  await lookup(mkReq({ t: schedaRef('ctrX', 'tenant') }), r);
  check('lookup: contratto inesistente → 404 not_found', r.code === 404 && r.body.error === 'not_found');

  r = mkRes();
  await lookup(mkReq({ t: schedaRef('ctr1', 'tenant') }), r);
  check('lookup: ok, ruolo tenant, non locked', r.code === 200 && r.body.ok && r.body.role === 'tenant' && r.body.locked === false);
  check('lookup: prefill fuso (contratto+sign+wizard)', r.body.signer.cf === 'RSSMRA85T10A562S' && r.body.signer.dob === '1985-12-10' && r.body.signer.pob === 'Roma');
  check('lookup: immobile presente', r.body.property.name === 'Trastevere Loft');

  r = mkRes();
  await lookup(mkReq({ t: schedaRef('ctr1', 'landlord') }), r);
  check('lookup: lato locatore già firmato → locked', r.code === 200 && r.body.locked === true);
}

// ═══ 4. submit ═══
const submit = (await import('../../api/profile/submit.js')).default;
IP = '1.2.3.2';
{
  const ID = { name: 'Mario Rossi', cf: 'RSSMRA85T10A562S', dob: '1985-12-10', pob: 'Roma, Italy', address: 'Via Roma 1', docType: 'passport', docNum: 'YA123', docIssuer: 'Questura', docIssueDate: '2021-02-02', nationality: 'Italian' };

  let r = mkRes();
  await submit(mkReq({ t: schedaRef('ctr1', 'tenant'), identity: { ...ID, name: '' } }), r);
  check('submit: senza nome → 400', r.code === 400 && r.body.error === 'name_required');

  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctr1', 'tenant'), identity: { ...ID, cf: 'RSSMRA85T10A562X' } }), r);
  check('submit: CF checksum errato → 400 cf_invalid', r.code === 400 && r.body.error === 'cf_invalid');

  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctr1', 'tenant'), identity: ID, phone: '+39 333 1234567' }), r);
  const c = store.get('contracts/ctr1');
  // Identità completa ≠ contratto senza puntini: mancano ancora conviventi e
  // (transitorio) il motivo — la risposta li NOMINA invece di dire «completa».
  check('submit: 200 + identità scritta ma NON «complete» (il PDF avrebbe ancora puntini) + missing nominati', r.code === 200 && r.body.ok && r.body.complete === false
    && Array.isArray(r.body.missing) && r.body.missing.some(m => m.key === 'cohabitants'));
  check('submit: campi contratto scritti', c.tenantCF === ID.cf && c.tenantDocIssuer === 'Questura' && c.tenantName === 'Mario Rossi');
  const u = store.get('users/u1');
  check('submit: profilo sync su ENTRAMBI gli schemi', u.cf === ID.cf && u.codiceFiscale === ID.cf && u.birthDate === ID.dob && u.idDocNumber === 'YA123');
  check('submit: notifica operatore creata', [...store.keys()].some(k => k.startsWith('agentNotifications/') && (store.get(k).type === 'scheda.completed')));

  // lato locatore: contratto firmato dal locatore → 410
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctr1', 'landlord'), identity: ID }), r);
  check('submit: parte già firmata → 410 already_signed', r.code === 410 && r.body.error === 'already_signed');

  // locatore su contratto non firmato → sync anche su landlords/
  store.set('contracts/ctr2', { propertyId: 'prop1' });
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctr2', 'landlord'), identity: { ...ID, name: 'Giulia Bianchi' } }), r);
  const ll = store.get('landlords/own1');
  check('submit landlord: contratto + landlords/ aggiornati', r.code === 200 && store.get('contracts/ctr2').landlordName === 'Giulia Bianchi' && ll && ll.codiceFiscale === ID.cf);
  // IL PDF SI RIFÀ DA SOLO (13/09/2026): dati nuovi su un contratto senza
  // firma → contract.pdf rigenerato; ctr1 porta la firma del locatore → no.
  check('submit landlord su contratto NON firmato: il PDF si rifà da solo (pdfRegenerated, upload contract.pdf, pdfGeneratedAt)',
    r.body.pdfRegenerated === true && storageUploads.some(x => /ctr2(%2F|\/)contract\.pdf/.test(x.url)) && !!store.get('contracts/ctr2').pdfGeneratedAt);
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctr1', 'tenant'), identity: ID, phone: '+39 333 1234567' }), r);
  check('submit su contratto con una firma viva: NESSUNA rigenerazione (il documento è congelato)', r.code === 200 && r.body.pdfRegenerated === false && !storageUploads.some(x => /ctr1(%2F|\/)contract\.pdf/.test(x.url)));
  storageUploads = [];   // la sezione upload conta i propri
}

// ═══ 5. upload (+ OCR opzionale) ═══
const upload = (await import('../../api/profile/upload.js')).default;
IP = '1.2.3.3';
{
  const png = 'data:image/jpeg;base64,' + Buffer.from('fake-image-bytes').toString('base64');

  let r = mkRes();
  await upload(mkReq({ t: 'garbage', base64: png }), r);
  check('upload: token invalido → 404', r.code === 404);

  r = mkRes();
  await upload(mkReq({ t: schedaRef('ctr1', 'tenant'), base64: png, contentType: 'image/jpeg', name: 'passport.jpg' }), r);
  const c = store.get('contracts/ctr1');
  check('upload: 200 + identityDocs sul contratto', r.code === 200 && r.body.count === 1 && Array.isArray(c.identityDocs) && c.identityDocs.length === 1 && c.identityDocs[0].role === 'tenant');
  check('upload: storage chiamato, URL mai restituita al client', storageUploads.length === 1 && !('url' in (r.body || {})));
  check('upload: senza ANTHROPIC_API_KEY → extracted null, mai errore', r.body.extracted === null || r.body.extracted === undefined);

  // con la chiave: l'estrazione riempie i campi
  process.env.ANTHROPIC_API_KEY = 'test-key';
  r = mkRes();
  await upload(mkReq({ t: schedaRef('ctr1', 'tenant'), base64: png, contentType: 'image/jpeg', extract: true }), r);
  check('upload+extract: OCR chiamato e campi estratti', r.code === 200 && anthropicCalls === 1 && r.body.extracted && r.body.extracted.cf === 'RSSMRA85T10A562S' && r.body.extracted.docIssuer === 'Questura di Roma');
  delete process.env.ANTHROPIC_API_KEY;

  // upload permesso anche a parte firmata (il documento è additivo)
  r = mkRes();
  await upload(mkReq({ t: schedaRef('ctr1', 'landlord'), base64: png, contentType: 'image/jpeg' }), r);
  check('upload: consentito anche post-firma (parte locked)', r.code === 200 && store.get('contracts/ctr1').identityDocs.length === 3);
}

// ═══ 6. link (admin) ═══
const link = (await import('../../api/profile/link.js')).default;
IP = '1.2.3.4';
{
  let r = mkRes();
  await link(mkReq({ contractId: 'ctr1' }), r);   // nessun header Authorization
  check('link: senza token → 401', r.code === 401);

  r = mkRes();
  await link(mkReq({ contractId: 'ctr1' }, { authorization: 'Bearer faketoken' }), r);   // profilo assente
  check('link: caller senza profilo → 403', r.code === 403);

  store.set('users/caller1', { role: 'admin' });
  r = mkRes();
  await link(mkReq({ contractId: 'ctr1' }, { authorization: 'Bearer faketoken' }), r);
  check('link admin: URL derivate coerenti', r.code === 200 && r.body.tenantUrl === schedaUrl('ctr1', 'tenant') && r.body.landlordUrl === schedaUrl('ctr1', 'landlord'));
  check('link admin: lock riflesso (landlord firmato)', r.body.tenantLocked === false && r.body.landlordLocked === true);
  check('link admin: senza coTenants nessun campo cosign', !('cosign' in r.body));

  // Con coTenants[]: anche i link firma dei co-conduttori (derivati) —
  // l'URL deve combaciare con cosignRef, un co già firmato è marcato.
  const { cosignRef } = await import('../../api/magic-sign/_shared.js');
  store.set('contracts/ctr1', { ...store.get('contracts/ctr1'),
    coTenants: [{ name: 'Anouk Garot', email: 'a@x.fr' }, { name: 'Terza Persona', signature: 'data:image/png;base64,x' }] });
  r = mkRes();
  await link(mkReq({ contractId: 'ctr1' }, { authorization: 'Bearer faketoken' }), r);
  check('link admin: cosign[] con URL derivato del co-conduttore',
    r.code === 200 && Array.isArray(r.body.cosign) && r.body.cosign.length === 2
    && r.body.cosign[0].url.endsWith('/sign?sign=' + encodeURIComponent(cosignRef('ctr1', 0)))
    && r.body.cosign[0].signed === false && r.body.cosign[1].signed === true);
  store.set('contracts/ctr1', { ...store.get('contracts/ctr1'), coTenants: undefined });

  // owner non admin: contratto di un ALTRO owner → 403
  store.set('users/caller1', { role: 'landlord' });
  store.set('properties/prop1', { ...store.get('properties/prop1'), ownerId: 'somebody-else' });
  r = mkRes();
  await link(mkReq({ contractId: 'ctr1' }, { authorization: 'Bearer faketoken' }), r);
  check('link landlord: immobile altrui → 403', r.code === 403 && r.body.error === 'not_your_contract');
}

// ═══ 9. L'ATTORE OPERATORE sullo stesso rail (21/09/2026 — «✎ Completa i
// dati» dalla console PA). Credenziale = Bearer ADMIN + {contractId, role}
// invece del token del link; stesse validazioni e scritture, PDF rigenerato;
// ma NIENTE email di conferma alla parte, NIENTE ping «scheda compilata»,
// fill-only rilassato; la firma già apposta resta 410; il mandato congela le
// condizioni approvate (409 PRIMA di scrivere). Il ruolo 'operator' esiste
// solo qui: i termini che nessuna parte compila.
{
  IP = '9.9.9.1';
  const fsMod = await import('node:fs');
  store.set('users/caller1', { role: 'admin', email: 'op@boom.it' });
  store.set('properties/prop9', { name: 'Casa Nove', address: 'Via Nove 9', ownerId: 'own9' });
  store.set('users/own9', { name: 'Paola Locatrice', email: 'paola@x.it' });
  store.set('landlords/own9', { name: 'Paola Locatrice', iban: 'IT60X0542811101000000123456' });
  store.set('contracts/c9', { propertyId: 'prop9', tenantId: 'u1', type: 'transitorio', rent: 1200, deposit: 2400, startDate: '2026-11-01', endDate: '2027-10-31', cedolareSecca: 'si', installmentMonths: 1, tenantName: 'Mario Rossi', tenantEmail: 'm@x.it', landlordName: 'Paola Locatrice', landlordEmail: 'paola@x.it' });
  const notifsBefore = [...store.keys()].filter(k => k.startsWith('agentNotifications/')).length;
  const upBefore = storageUploads.length;
  const H = { authorization: 'Bearer faketoken' };

  // senza link e senza bearer → invalid_link (404), come sempre
  let r = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'operator', answers: { paymentDay: '10' } }), r);
  check('operatore: senza token né Bearer → 404 invalid_link, nessuna scrittura', r.code === 404 && r.body.error === 'invalid_link' && !store.get('contracts/c9').paymentDay);
  // bearer di chi NON è admin → 403 dalla porta (requireRole), nessuna scrittura
  store.set('users/caller1', { role: 'landlord', email: 'op@boom.it' });
  r = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'operator', answers: { paymentDay: '10' } }, H), r);
  check('operatore: Bearer di un non-admin → 403, nessuna scrittura', r.code === 403 && !store.get('contracts/c9').paymentDay);
  store.set('users/caller1', { role: 'admin', email: 'op@boom.it' });
  r = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'operator', answers: { paymentDay: '10', signaturePlace: 'Roma', consegnaStato: 'buono', rent: 'abc' } }, H), r);
  const c9 = store.get('contracts/c9');
  check('operatore (ruolo operator): i termini finiscono sul contratto (giorno 10, Roma, consegna), il valore invalido è scartato e DETTO, il timbro è dell\'operatore (completedByOperator), non schedaTenantAt',
    r.code === 200 && r.body.ok && c9.paymentDay === 10 && c9.signaturePlace === 'Roma' && c9.consegnaStato === 'buono'
    && r.body.rejected.some(x => x.key === 'rent') && c9.completedByOperator === 'op@boom.it' && !!c9.completedByOperatorAt && !c9.schedaTenantAt && !c9.schedaLandlordAt);
  check('operatore: il PDF si rigenera (upload contracts/c9/contract.pdf) e la risposta lo dice',
    r.body.pdfRegenerated === true && storageUploads.slice(upBefore).some(u => u.url.includes('contracts%2Fc9%2Fcontract.pdf') || u.url.includes('contracts/c9/contract.pdf')) && !!store.get('contracts/c9').generatedPDF);
  // ruolo landlord dall'operatore: catasto sull'immobile E sul contratto, IBAN già presente riscritto (trusted), niente email né ping
  r = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'landlord', answers: { catFoglio: '123', catParticella: '45', catSub: '6', landlordIban: 'IT40S0542811101000000123456', tenantCF: 'RSSMRA85T10A562S' } }, H), r);
  const p9 = store.get('properties/prop9'), c9b = store.get('contracts/c9');
  check('operatore (ruolo landlord): il catasto atterra sull\'immobile e sul contratto, il CF del conduttore è not_yours anche per l\'operatore',
    r.code === 200 && p9.foglio === '123' && p9.particella === '45' && /123/.test(String(c9b.cadastral || p9.cadastralData || '')) && r.body.rejected.some(x => x.key === 'tenantCF' && x.why === 'not_yours'));
  check('operatore: l\'IBAN GIÀ presente si corregge (trusted — dal link pubblico sarebbe already_set) e finisce sul profilo del locatore',
    r.body.applied.includes('landlordIban') && store.get('landlords/own9').iban === 'IT40S0542811101000000123456');
  const notifsAfter = [...store.keys()].filter(k => k.startsWith('agentNotifications/')).length;
  check('operatore: NESSUN ping «scheda compilata» né «dato sensibile», NESSUNA conferma alla parte (schedaLandlordConfirmedAt assente)',
    notifsAfter === notifsBefore && !store.get('contracts/c9').schedaLandlordConfirmedAt && !store.get('contracts/c9').schedaTenantConfirmedAt);
  // la parte dal LINK, per contrasto: il ping parte
  IP = '9.9.9.2';
  r = mkRes();
  await submit(mkReq({ t: schedaRef('c9', 'tenant'), answers: { transitionalReason: 'Lavoro a Roma' } }), r);
  check('la parte dal link (contrasto): stesso rail, il ping «scheda compilata» parte e il timbro è schedaTenantAt',
    r.code === 200 && [...store.keys()].filter(k => k.startsWith('agentNotifications/')).length === notifsAfter + 1 && !!store.get('contracts/c9').schedaTenantAt);
  // il mandato congela le condizioni: un termine della foto → 409, niente scritto
  store.set('contracts/c9', { ...store.get('contracts/c9'), tenantMandate: { given: true, termsHash: 'x' } });
  IP = '9.9.9.3';
  r = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'operator', answers: { rent: '1500', paymentMethod: 'bonifico' } }, H), r);
  check('mandato sul contratto: un dato che cambia le condizioni approvate (canone) → 409 mandate_terms_frozen con la chiave, e NIENTE scritto (nemmeno il metodo di pagamento)',
    r.code === 409 && r.body.error === 'mandate_terms_frozen' && r.body.changed.includes('rent') && store.get('contracts/c9').rent === 1200 && !store.get('contracts/c9').paymentMethod);
  r = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'operator', answers: { paymentMethod: 'bonifico' } }, H), r);
  check('mandato sul contratto: un termine FUORI dalla foto (metodo di pagamento) passa', r.code === 200 && store.get('contracts/c9').paymentMethod === 'bonifico');
  IP = '9.9.9.4';
  r = mkRes();
  await submit(mkReq({ t: schedaRef('c9', 'tenant'), identity: { name: 'Mario Rossi Bis', cf: 'RSSMRA85T10A562S', dob: '1985-12-10', pob: 'Roma', address: 'Via Roma 1', docType: 'passport', docNum: 'YA1', nationality: 'Italian' } }), r);
  check('la parte dal link NON è fermata dalla guardia del mandato (è la sua identità: il nome si corregge; se il mandato poi non combacia lo dice la firma)', r.code === 200 && store.get('contracts/c9').tenantName === 'Mario Rossi Bis');
  // firma viva: la parte firmata è congelata anche per l'operatore; i termini dell'operatore con QUALSIASI firma
  store.set('contracts/c9', { ...store.get('contracts/c9'), tenantSignature: 'data:image/png;base64,x' });
  r = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'tenant', answers: { tenantPob: 'Roma' } }, H), r);
  const r2 = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'operator', answers: { signaturePlace: 'Milano' } }, H), r2);
  const r3 = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'landlord', answers: { catCategoria: 'A/2' } }, H), r3);
  check('firma viva: l\'identità del firmatario è congelata anche per l\'operatore (410); i termini dell\'operatore lo sono con QUALSIASI firma (410); il locatore non firmato resta scrivibile (dato per la registrazione, PDF non rigenerato)',
    r.code === 410 && r2.code === 410 && store.get('contracts/c9').signaturePlace === 'Roma' && r3.code === 200 && r3.body.pdfRegenerated === false && store.get('properties/prop9').categoria === 'A/2');
  r = mkRes();
  await submit(mkReq({ contractId: 'c9', role: 'boss', answers: {} }, H), r);
  check('operatore: ruolo sconosciuto → 400', r.code === 400 && r.body.error === 'contractId_and_role_required');

  // profile/link porta i DESCRITTORI per la console (ask per parte)
  // un conduttore SENZA profilo compilato (u1 ha già il CF dalla Scheda di §4): i vuoti devono esserci
  store.set('users/u10', { name: 'Mario Dieci', email: 'd@x.it' });
  store.set('contracts/c10', { propertyId: 'prop9', tenantId: 'u10', type: 'transitorio', rent: 900, deposit: 1800, startDate: '2026-11-01', endDate: '2027-04-30', cedolareSecca: 'si', tenantName: 'Mario Rossi', landlordName: 'Paola Locatrice', landlordSignature: 'data:image/png;base64,x' });
  r = mkRes();
  await link(mkReq({ contractId: 'c10' }, H), r);
  const ask = r.body && r.body.ask;
  check('link.ask: per parte le sezioni coi soli campi vuoti — l\'identità del conduttore come SEZIONE coi descrittori (tipo, etichetta IT, opzioni), i termini dell\'operatore; il locatore firmato = locked, e con una firma viva anche i termini dell\'operatore sono locked',
    r.code === 200 && ask && ask.tenant.sections.some(sc => sc.key === 'identity' && sc.fields.some(f => f.key === 'tenantCF' && f.type === 'cf' && f.label.it))
    && ask.operator.sections.some(sc => sc.fields.some(f => f.key === 'paymentDay' && f.type === 'number'))
    && ask.tenant.locked === false && ask.landlord.locked === true && ask.operator.locked === true
    && ask.tenant.sections.every(sc => sc.fields.every(f => f.value === '')));

  // giunzioni sulla sorgente: la guardia del mandato PRIMA della scrittura, la conferma SOLO alla parte, l'impaginato in una copia
  const src = fsMod.readFileSync(new URL('../../api/profile/submit.js', import.meta.url), 'utf8');
  const iGuard = src.indexOf("error: 'mandate_terms_frozen'"), iPatch = src.indexOf("await fsPatch('contracts/' + contractId, upd)");
  check('sorgente submit: la guardia del mandato precede la scrittura del contratto; la credenziale admin passa da requireRole; la conferma email e i ping sono gated su actor === \'party\'',
    iGuard > 0 && iPatch > iGuard && /requireRole\(req, res, \['admin'\]\)/.test(src) && src.indexOf("actor === 'party' && P && complete") < src.indexOf('sendEmail({') && /if \(actor === 'party'\) try \{\s*await fsCreate\('agentNotifications'/.test(src));
  const cp = fsMod.readFileSync(new URL('../../api/sign/_contractpdf.js', import.meta.url), 'utf8');
  const cv = fsMod.readFileSync(new URL('../../api/preagreement/convert.js', import.meta.url), 'utf8');
  check('sorgente: l\'impaginato in byte è UNA copia (buildContractPdfBytes) — un solo CONTRACT_PDF.build in _contractpdf.js, nessuno in convert.js, che importa la funzione',
    cp.split('CONTRACT_PDF.build(').length === 2 && !cv.includes('CONTRACT_PDF.build(') && /buildContractPdfBytes\(\{ contractId, contract, property, tenant: tenantUser, landlord \}\)/.test(cv));
}

console.log('\n' + '─'.repeat(48));
console.log(`La Scheda: ${passed} passed, ${failed} failed`);
if (failed) { console.error('FAILED: ' + bad.join(' | ')); process.exit(1); }
console.log('La scheda universale si comporta come previsto.');
// Uscita ESPLICITA: la suite stubba fetch e lascia un handle appeso, quindi
// l'event loop non si svuota da solo — il verdetto compariva e il processo
// restava vivo per sempre, bloccando `npm test` a metà batteria per tutti.
process.exit(0);
