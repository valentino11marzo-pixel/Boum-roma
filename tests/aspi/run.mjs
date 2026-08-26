// tests/aspi/run.mjs — L'ITER ASPI: registrazione + asseverazione in un tap.
//
// Cosa si pretende:
//   1. Le manopole: default in codice, settings/registrazione li sovrascrive
//      solo con valori BUONI (un'email senza @ o un prezzo negativo non
//      passano mai — la lezione mergeCompany).
//   2. La checklist dice la verità per variante: senza PDF del contratto si
//      BLOCCA (una richiesta di registrazione senza contratto è rumore),
//      l'asseverazione pretende APE/planimetria/scheda, il canone FUORI
//      fascia viene dichiarato — mai nascosto.
//   3. La porta: senza Bearer admin → 401 e ZERO scritture, zero email.
//   4. L'invio vero (handler reale su Firestore in memoria, nodemailer
//      catturato): email al referente con l'operatore in copia e gli
//      allegati veri; stato stampato sul contratto (registrationStatus
//      'sent' — ma MAI degradando un 'registered'); i mancanti dichiarati
//      nell'email e persistiti.
//   5. La fattura col markup: creata all'invio con l'importo della variante
//      (89 / 189 / 278 di default), idempotente PER COSTRUZIONE — il
//      secondo invio rimanda l'email ma NON emette una seconda fattura.
//   6. Zero tap: maybeAutoAspi tace con la manopola off (default) e parte
//      con auto:true — e in _finalize è cablato DOPO il fascicolo CAF.
//   7. Le giunzioni sulla sorgente: import statici (lezione Vercel tracer),
//      rules che tolgono settings/registrazione alla lettura anonima,
//      maxDuration in vercel.json, i bottoni del portal.
// Uso: node tests/aspi/run.mjs

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

try { await import('pdf-lib'); }
catch {
  console.log('SKIP: pdf-lib non installato (npm install per abilitare questa suite)');
  process.exit(0);
}

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'testsecret';
process.env.GMAIL_USER = 'g@x.it';
process.env.GMAIL_APP_PASS = 'gp';
delete process.env.ASPI_EMAIL;

import fs from 'node:fs';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

// ── Stub fetch: Firestore + Storage (upload E download) + IdentityToolkit ─
const store = new Map();
const FS = 'firestore.googleapis.com';
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });

function toFsV(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsV) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFsV(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const toFsFieldsShallow = (obj) => { const f = {}; for (const [k, v] of Object.entries(obj || {})) f[k] = toFsV(v); return f; };
function fromFsV(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFsV);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFsV(x); return o; }
  return null;
}

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'admin1' }] });
  if (url.includes('firebasestorage.googleapis.com')) {
    // POST = upload (fascicolo); GET = download allegato → byte finti
    if ((opts.method || 'GET') === 'POST') return okJson({ downloadTokens: 'tk123' });
    return new Response(Buffer.from('%PDF-1.4 fake bytes for attachment'), { status: 200 });
  }
  if (url.includes(FS)) {
    const path = url.split('/documents')[1] || '';
    if (path.startsWith(':runQuery')) {
      const q = JSON.parse(opts.body).structuredQuery;
      const coll = q.from[0].collectionId;
      const field = q.where?.fieldFilter?.field?.fieldPath;
      const val = q.where?.fieldFilter?.value?.stringValue;
      const rows = [];
      for (const [key, fields] of store) {
        if (!key.startsWith(coll + '/')) continue;
        if (field && String(fields[field]) !== String(val)) continue;
        rows.push({ document: { name: 'projects/p/databases/(default)/documents/' + key, fields: toFsFieldsShallow(fields) } });
      }
      return okJson(rows.length ? rows : [{}]);
    }
    const clean = path.replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = clean + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      const fields = JSON.parse(opts.body).fields || {};
      const flat = {};
      for (const [k, v] of Object.entries(fields)) flat[k] = fromFsV(v);
      store.set(key, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      const fields = JSON.parse(opts.body).fields || {};
      const flat = store.get(clean) || {};
      for (const [k, v] of Object.entries(fields)) flat[k] = fromFsV(v);
      store.set(clean, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + clean });
    }
    const doc = store.get(clean);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + clean, fields: toFsFieldsShallow(doc) });
  }
  throw new Error('fetch non stubbata: ' + url);
};

const mails = () => globalThis.__mails || [];
const mkRes = () => ({
  code: 0, body: null, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; },
  end() { return this; },
});
const mkReq = (body, headers = {}) => ({ method: 'POST', headers, body });

const {
  ASPI_DEFAULTS, mergeAspiSettings, aspiChecklist, checklistBlocked, checklistMissing,
  kindPrice, kindCost, defaultKind, sendAspiRequest, maybeAutoAspi,
} = await import('../../api/fiscal/_aspi.js');

// ═══ 1. Le manopole: default sani, override solo con valori buoni ═══
{
  const d = mergeAspiSettings(null);
  check('default: destinatario = referente ASPI, costi 37/100, prezzi 89/189',
    d.email === 'roberto.ubertini@gmail.com' && d.costoRegistrazione === 37 && d.costoAsseverazione === 100
    && d.prezzoRegistrazione === 89 && d.prezzoAsseverazione === 189 && d.auto === false && d.autoInvoice === true);
  check('prezzo/costo per variante: completo = somma (278 / 137)',
    kindPrice('completo', d) === 278 && kindCost('completo', d) === 137
    && kindPrice('registrazione', d) === 89 && kindCost('asseverazione', d) === 100);
  const o = mergeAspiSettings({ email: 'geometra@studio.it', prezzoRegistrazione: 120, billTo: 'tenant', auto: true });
  check('override buoni: email/prezzo/billTo/auto passano', o.email === 'geometra@studio.it' && o.prezzoRegistrazione === 120 && o.billTo === 'tenant' && o.auto === true);
  const g = mergeAspiSettings({ email: 'senza-chiocciola', prezzoRegistrazione: -5, costoAsseverazione: 'boh', billTo: 'hacker' });
  check('override cattivi: email senza @, prezzo negativo, billTo ignoto → restano i default',
    g.email === ASPI_DEFAULTS.email && g.prezzoRegistrazione === 89 && g.costoAsseverazione === 100 && g.billTo === 'landlord');
}

// ═══ 2. La checklist per variante ═══
const baseContract = {
  type: 'studenti', requiresAsseverazione: true,
  tenantName: 'Anna Rossi', tenantCF: 'RSSNNA90A41H501X', tenantDob: '1990-01-01',
  landlordName: 'Mario Bianchi', landlordCF: 'BNCMRA60A01H501Y',
  startDate: '2026-09-01', endDate: '2027-08-31', rent: 900, deposit: 1800,
  signedPdfUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/contracts%2Fc1%2Fcontratto-firmato.pdf?alt=media&token=s',
  identityDocs: [
    { url: 'https://firebasestorage.googleapis.com/v0/b/x/o/id1.jpg?alt=media', name: 'passport.jpg' },
    { url: 'https://firebasestorage.googleapis.com/v0/b/x/o/extra1.pdf?alt=media', name: 'iscrizione.pdf', kind: 'extra' },
  ],
  fascicoloFiscaleUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/contracts%2Fc1%2Ffascicolo-fiscale.pdf?alt=media&token=f',
  canoneScheda: { zonaCod: 'C30', zonaNome: 'PIGNETO', fascia: 'B', cMax: 950, fits: true },
};
const baseProperty = {
  address: 'Via del Pigneto 12', sqm: 60, ownerId: 'own1',
  dossier: {
    ape: { url: 'https://firebasestorage.googleapis.com/v0/b/x/o/ape.pdf?alt=media' },
    planimetria: { url: 'https://firebasestorage.googleapis.com/v0/b/x/o/plan.pdf?alt=media' },
  },
};
{
  const reg = aspiChecklist(baseContract, baseProperty, 'registrazione');
  check('checklist registrazione: contratto firmato OK, niente voci asseverazione',
    reg.find(i => i.key === 'contratto').state === 'ok' && !reg.some(i => i.key === 'ape') && !checklistBlocked(reg));
  const compl = aspiChecklist(baseContract, baseProperty, 'completo');
  check('checklist completo: APE + planimetria + scheda canone entrano',
    compl.some(i => i.key === 'ape' && i.state === 'ok') && compl.some(i => i.key === 'planimetria' && i.state === 'ok')
    && compl.find(i => i.key === 'scheda_canone').state === 'ok');
  check('checklist: locatore senza documento → dichiarato mancante (mai nascosto)',
    compl.find(i => i.key === 'id_locatore').state === 'missing');

  const noPdf = aspiChecklist({ ...baseContract, signedPdfUrl: '', generatedPDF: '' }, baseProperty, 'registrazione');
  check('checklist: SENZA PDF del contratto la richiesta è BLOCCATA', checklistBlocked(noPdf));

  const fuori = aspiChecklist({ ...baseContract, canoneScheda: { ...baseContract.canoneScheda, fits: false } }, baseProperty, 'completo');
  const sc = fuori.find(i => i.key === 'scheda_canone');
  check('checklist: canone FUORI fascia → warn che lo dice (ASPI non può attestare)',
    sc.state === 'warn' && /FUORI FASCIA/.test(sc.label));

  check('variante di default dal contratto: requiresAsseverazione false → solo registrazione',
    defaultKind({ requiresAsseverazione: false }) === 'registrazione' && defaultKind(baseContract) === 'completo');
}

// ═══ 3. La porta: senza admin non si passa ═══
const handler = (await import('../../api/fiscal/registra.js')).default;
{
  const r = mkRes();
  await handler(mkReq({ op: 'send', contractId: 'c1' }), r);
  check('porta: senza Bearer → 401, zero email, zero fatture',
    r.code === 401 && mails().length === 0 && ![...store.keys()].some(k => k.startsWith('invoices/')));
}

// ═══ 4. L'invio vero (handler reale, giro completo) ═══
store.set('users/admin1', { role: 'admin', email: 'admin@boom.it' });
store.set('contracts/c1', { ...baseContract, propertyId: 'p1', tenantId: 'u1' });
store.set('properties/p1', { ...baseProperty });
store.set('users/u1', { name: 'Anna Rossi' });
store.set('users/own1', { name: 'Mario Bianchi' });
{
  const r = mkRes();
  await handler(mkReq({ op: 'status', contractId: 'c1' }, { authorization: 'Bearer faketoken' }), r);
  check('status: checklist per ENTRAMBE le varianti + prezzi in vigore',
    r.code === 200 && r.body.ok && Array.isArray(r.body.kinds.registrazione) && Array.isArray(r.body.kinds.completo)
    && r.body.settings.prezzi.completo === 278 && r.body.settings.costi.completo === 137 && r.body.kind === 'completo');

  const r2 = mkRes();
  await handler(mkReq({ op: 'send', contractId: 'c1', kind: 'completo' }, { authorization: 'Bearer faketoken' }), r2);
  const m = mails()[mails().length - 1];
  const c1 = store.get('contracts/c1');
  check('send: 200 e email al referente di default', r2.code === 200 && r2.body.ok && m && m.to === 'roberto.ubertini@gmail.com');
  check('send: operatore SEMPRE in copia', String(m.cc || '').includes('valentino@boom-rome.com'));
  check('send: allegati veri — contratto firmato, identità, APE, planimetria, scheda',
    Array.isArray(m.attachments)
    && m.attachments.some(a => a.filename.startsWith('BOOM_Contratto'))
    && m.attachments.some(a => /^Documento_conduttore/.test(a.filename))
    && m.attachments.some(a => a.filename.startsWith('APE'))
    && m.attachments.some(a => a.filename.startsWith('Planimetria'))
    && m.attachments.some(a => a.filename.startsWith('BOOM_Scheda_calcolo')));
  check('send: oggetto = variante + immobile', /attestazione/i.test(m.subject) && m.subject.includes('Via del Pigneto 12'));
  check('send: stato stampato sul contratto (aspiRequestedAt/Kind/To + registrationStatus sent)',
    !!c1.aspiRequestedAt && c1.aspiRequestKind === 'completo' && c1.aspiRequestTo === 'roberto.ubertini@gmail.com'
    && c1.registrationStatus === 'sent' && c1.aspiRequestCount === 1);
  check('send: i mancanti dichiarati (documento locatore) — nell\'email E persistiti',
    /Non ancora nel fascicolo/.test(m.html) && Array.isArray(c1.aspiRequestMissing)
    && c1.aspiRequestMissing.some(x => /locatore/i.test(x)));

  const inv = store.get('invoices/aspi_completo_c1');
  check('fattura: creata col markup della variante (€278 al proprietario)',
    !!inv && inv.amount === 278 && inv.recipientType === 'landlord' && inv.recipientId === 'own1'
    && inv.status === 'pending' && inv.contractId === 'c1' && /attestazione/i.test(inv.service));

  // ── Il secondo invio: email SÌ, seconda fattura MAI ──
  const nInv = [...store.keys()].filter(k => k.startsWith('invoices/')).length;
  const nMail = mails().length;
  const r3 = mkRes();
  await handler(mkReq({ op: 'send', contractId: 'c1', kind: 'completo' }, { authorization: 'Bearer faketoken' }), r3);
  check('re-invio: email ripartita, fattura NON duplicata, contatore a 2',
    r3.code === 200 && mails().length === nMail + 1
    && [...store.keys()].filter(k => k.startsWith('invoices/')).length === nInv
    && r3.body.invoice && r3.body.invoice.created === false
    && store.get('contracts/c1').aspiRequestCount === 2);
}

// ═══ 5. Settings vincono sui default · bill:false non fattura ═══
{
  store.set('settings/registrazione', { email: 'geometra@studio.it', referente: 'Geo Metra', prezzoRegistrazione: 120 });
  store.set('contracts/c2', { ...baseContract, requiresAsseverazione: false, propertyId: 'p1', tenantId: 'u1' });
  const r = mkRes();
  await handler(mkReq({ op: 'send', contractId: 'c2', kind: 'registrazione' }, { authorization: 'Bearer faketoken' }), r);
  const m = mails()[mails().length - 1];
  const inv = store.get('invoices/aspi_registrazione_c2');
  check('settings: il destinatario configurato batte il default', r.code === 200 && m.to === 'geometra@studio.it');
  check('settings: prezzo configurato → fattura €120 per la sola registrazione', !!inv && inv.amount === 120);
  check('registrazione: nell\'email NIENTE voci asseverazione', !m.attachments.some(a => a.filename.startsWith('APE')));

  store.set('contracts/c2b', { ...baseContract, propertyId: 'p1' });
  const rb = mkRes();
  await handler(mkReq({ op: 'send', contractId: 'c2b', kind: 'registrazione', bill: false }, { authorization: 'Bearer faketoken' }), rb);
  check('bill:false → email sì, nessuna fattura', rb.code === 200 && !store.has('invoices/aspi_registrazione_c2b'));
  store.delete('settings/registrazione');
}

// ═══ 6. Senza PDF niente invio · 'registered' non si degrada ═══
{
  store.set('contracts/c3', { ...baseContract, signedPdfUrl: '', generatedPDF: '', propertyId: 'p1' });
  const nMail = mails().length;
  const r = mkRes();
  await handler(mkReq({ op: 'send', contractId: 'c3' }, { authorization: 'Bearer faketoken' }), r);
  check('senza contratto PDF: 422, zero email, zero stato, zero fattura',
    r.code === 422 && r.body.error === 'contratto_pdf_mancante' && mails().length === nMail
    && !store.get('contracts/c3').aspiRequestedAt && !store.has('invoices/aspi_completo_c3'));

  store.set('contracts/c4', { ...baseContract, propertyId: 'p1', registrationStatus: 'registered' });
  const r4 = mkRes();
  await handler(mkReq({ op: 'send', contractId: 'c4', kind: 'completo' }, { authorization: 'Bearer faketoken' }), r4);
  check('già registrato: l\'invio (es. asseverazione tardiva) NON degrada registrationStatus',
    r4.code === 200 && store.get('contracts/c4').registrationStatus === 'registered');
}

// ═══ 7. L'asseverazione genera la scheda che manca ═══
{
  store.set('contracts/c5', { ...baseContract, fascicoloFiscaleUrl: '', canoneScheda: null, propertyId: 'p1', tenantId: 'u1' });
  const r = mkRes();
  await handler(mkReq({ op: 'send', contractId: 'c5', kind: 'completo' }, { authorization: 'Bearer faketoken' }), r);
  const c5 = store.get('contracts/c5');
  const m = mails()[mails().length - 1];
  check('scheda mancante: il Fascicolo Fiscale nasce ALL\'INVIO e parte in allegato',
    r.code === 200 && !!c5.fascicoloFiscaleUrl && m.attachments.some(a => a.filename.startsWith('BOOM_Scheda_calcolo')));
}

// ═══ 8. Zero tap: la manopola auto ═══
{
  const nMail = mails().length;
  const off = await maybeAutoAspi({ ...store.get('contracts/c1'), id: 'c1' });
  check('auto OFF (default): nessun invio, nessun rumore', off.skipped === 'off' && mails().length === nMail);

  store.set('settings/registrazione', { auto: true });
  const on = await maybeAutoAspi({ ...store.get('contracts/c1'), id: 'c1' });
  check('auto ON: la richiesta parte da sola alla firma completa', on.ok === true && mails().length === nMail + 1);
  store.delete('settings/registrazione');
}

// ═══ 10. IL DOCUMENTO SI ATTACCA DOVE MANCA (api/fiscal/allega.js) ═══
// Il rimbalzo fra console era il lavoro: ora la voce della checklist e' una
// porta. Si pretende che il file finisca DAVVERO dove la voce prometteva —
// l'immobile eredita i suoi documenti, il contratto i suoi — e che la
// checklist torni gia' aggiornata (senza, l'operatore ricarica per vedere).
const allega = (await import('../../api/fiscal/allega.js')).default;
const PDFB64 = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 finto').toString('base64');
{
  const r = mkRes();
  await allega(mkReq({ contractId: 'c1', key: 'ape', base64: PDFB64, name: 'ape.pdf' }), r);
  check('allega: senza Bearer -> 401, nessun documento scritto', r.code === 401);

  const r1 = mkRes();
  await allega(mkReq({ contractId: 'c1', key: 'ape', base64: PDFB64, name: 'ape-2026.pdf', contentType: 'application/pdf' }, { authorization: 'Bearer faketoken' }), r1);
  const prop = store.get('properties/p1');
  check('allega APE: finisce nel DOSSIER dell\'immobile (lo ereditano i contratti futuri)',
    r1.code === 200 && prop.dossier && prop.dossier.ape && /property-docs%2Fp1/.test(prop.dossier.ape.url));
  check('allega: la checklist torna gia\' aggiornata, per ENTRAMBE le varianti',
    r1.body.kinds && r1.body.kinds.completo.find(i => i.key === 'ape').state === 'ok'
    && Array.isArray(r1.body.kinds.registrazione));

  const r2 = mkRes();
  await allega(mkReq({ contractId: 'c1', key: 'id_locatore', base64: PDFB64, name: 'ci-mario.jpg', contentType: 'image/jpeg' }, { authorization: 'Bearer faketoken' }), r2);
  const c1 = store.get('contracts/c1');
  const last = c1.identityDocs[c1.identityDocs.length - 1];
  check('allega identita\': entra in contract.identityDocs col RUOLO giusto',
    r2.code === 200 && last.role === 'landlord' && /contracts%2Fc1%2Fidentity/.test(last.url)
    && r2.body.kinds.completo.find(i => i.key === 'id_locatore').state === 'ok');

  const r3 = mkRes();
  await allega(mkReq({ contractId: 'c1', key: 'esigenza', base64: PDFB64, name: 'iscrizione.pdf' }, { authorization: 'Bearer faketoken' }), r3);
  const c1b = store.get('contracts/c1');
  check('allega esigenza: marcata kind:extra (il pack e l\'email la riconoscono)',
    r3.code === 200 && c1b.identityDocs.some(d => d.kind === 'extra'));

  const nBefore = JSON.stringify(store.get('contracts/c1'));
  const r4 = mkRes();
  await allega(mkReq({ contractId: 'c1', key: 'contratto', base64: PDFB64 }, { authorization: 'Bearer faketoken' }), r4);
  check('allega: una voce NON allegabile (il contratto si genera) viene rifiutata, zero scritture',
    r4.code === 400 && r4.body.error === 'key_non_allegabile' && JSON.stringify(store.get('contracts/c1')) === nBefore);
}

// ═══ 11. LA SCHEDA SI STAMPA SEMPRE (fedele al modulo dell'associazione) ═══
// Il difetto del 23/08: senza zona o mq la pagina 1 degradava a "SCHEDA NON
// CALCOLABILE" — l'operatore restava senza foglio proprio quando gli serviva
// stamparlo e completarlo a mano. E il canone PATTUITO non si tocca mai: il
// massimo di fascia e' un riferimento dell'accordo, non un tetto che questo
// foglio impone al prezzo deciso dalle parti.
{
  const src = fs.readFileSync(new URL('../../api/fiscal/fascicolo.js', import.meta.url), 'utf8');
  check('fascicolo: nessuna via d\'uscita "non calcolabile" — il modulo esce comunque',
    !src.includes('SCHEDA CANONE NON ANCORA CALCOLABILE') && src.includes('IL MODULO SI STAMPA SEMPRE'));
  check('fascicolo: il canone PATTUITO si stampa sempre, anche senza calcolo',
    /Importo canone mensile PATTUITO/.test(src) && /calc\.canone \|\| contract\.rent/.test(src));
  check('fascicolo: la griglia maggiorazioni A-H del modulo c\'e\' tutta',
    ['A - Ammobiliato', 'B - Seminterrato', 'C - Senza ascensore', 'D - Attico',
     'E - Classe energetica A/B/C', 'F - Interventi Eco Bonus', 'G - Interventi Sisma Bonus',
     'H - Classe energetica D/E/F'].every(l => src.includes(l)));
  check('fascicolo: numeri all\'italiana DETERMINISTICI (mai toLocaleString: ICU ridotta = 1250,00)',
    src.includes('function itNum') && !/toLocaleString\('it-IT'/.test(src));
}

// ═══ 12. LA VALUTAZIONE BOOM — documento a parte, e onesto sul campione ═══
{
  const vsrc = fs.readFileSync(new URL('../../api/fiscal/valutazione.js', import.meta.url), 'utf8');
  check('valutazione: dichiara in testa di NON essere l\'attestazione di rispondenza',
    vsrc.includes("NON e\\' l\\'attestazione di rispondenza all\\'accordo territoriale"));
  check('valutazione: stampa il canone DECISO, non un massimo ricalcolato',
    vsrc.includes('T(`${eur(canone)} / mese`') && !/canone\s*=\s*Math\.min/.test(vsrc)
    && !/Math\.min\([^)]*canone[^)]*\)/.test(vsrc));
  check('valutazione: sotto campione NON pubblica una mediana (disciplina del Perito)',
    vsrc.includes('campione insufficiente') && vsrc.includes("reason: 'small_sample'"));
  check('valutazione: i canoni FIRMATI pretendono almeno 3 contratti',
    /vals\.length < 3/.test(vsrc));
  check('valutazione: la fascia dell\'accordo entra come RIFERIMENTO dichiarato',
    vsrc.includes('Riportato come riferimento'));
  const vj = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  check('vercel.json: allega + valutazione hanno il tempo per Storage e mercato',
    vj.functions['api/fiscal/allega.js'].maxDuration === 60 && vj.functions['api/fiscal/valutazione.js'].maxDuration === 60);
  const portal = fs.readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  check('portal: 📎 su ogni voce allegabile e 💶 Valutazione BOOM sulla riga contratto',
    portal.includes('function aspiAllega') && portal.includes("ASPI_ALLEGABILI") && portal.includes('openValutazione'));
}

// ═══ 9. Le giunzioni sulla SORGENTE ═══
{
  const aspiSrc = fs.readFileSync(new URL('../../api/fiscal/_aspi.js', import.meta.url), 'utf8');
  check('sorgente _aspi: import statici (mai await import — lezione Vercel tracer)', !/await import\(/.test(aspiSrc));

  const finSrc = fs.readFileSync(new URL('../../api/sign/_finalize.js', import.meta.url), 'utf8');
  const iCaf = finSrc.indexOf('sendCafDossier(contract');
  const iAuto = finSrc.indexOf('maybeAutoAspi(contract');
  check('sorgente _finalize: maybeAutoAspi importato staticamente e chiamato DOPO il fascicolo CAF',
    /^import \{ maybeAutoAspi \} from '\.\.\/fiscal\/_aspi\.js';$/m.test(finSrc) && iCaf > -1 && iAuto > iCaf);

  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  check('firestore.rules: settings/registrazione NON leggibile dall\'anonimo (email del referente)',
    /!\(x in \['company', 'registrazione'\]\)/.test(rules));

  const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  check('vercel.json: api/fiscal/registra.js con maxDuration 60 (scarica gli allegati)',
    vercel.functions && vercel.functions['api/fiscal/registra.js'] && vercel.functions['api/fiscal/registra.js'].maxDuration === 60);

  const portal = fs.readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  check('portal: pannello 🏛 cablato (openAspi/sendAspi) e bottoni su dettaglio + Burocrazia',
    portal.includes('function openAspi') && portal.includes('function sendAspi')
    && portal.split("openAspi('${c.id}')").length >= 3
    && portal.includes("op: 'status', contractId") && portal.includes("op: 'send', contractId"));
  const panel = portal.slice(portal.indexOf('function openAspi'), portal.indexOf('window.sendAspi ='));
  check('portal: il pannello legge prezzi e checklist dal SERVER — nessun € hardcodato nel pannello',
    portal.includes('st.settings.prezzi[kind]') && panel.includes('s.prezzi.completo') && panel.includes('s.prezzi.registrazione')
    && !/€\d/.test(panel));
}

// ═══ Esito ═══
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:', bad.join(' | ')); process.exit(1); }
