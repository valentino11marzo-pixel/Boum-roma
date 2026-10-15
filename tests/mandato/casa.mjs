// tests/mandato/casa.mjs — LA CASA DELLA PROPOSTA GIÀ NEL PORTAL (15/10/2026).
//
// «Fallo valere con stesso indirizzo e interno.» Una proposta accettata
// SENZA immobile collegato fotografa un indirizzo: il mandato del conduttore
// vale sull'immobile nato dalla proposta (prop_pa_<id>, §12 di run.mjs) e,
// da oggi, sul record del portal con lo STESSO indirizzo e lo STESSO
// interno. Qui si blinda:
//   1. il motore (js/mandato-engine.js): la lettura dell'indirizzo sulle
//      forme VERE del backup, il confronto dell'interno, e il rifiuto
//      quando non si legge con certezza — fra un mandato inservibile e una
//      firma sulla casa sbagliata, il primo;
//   2. la conversione (handler reale): il riscontro scritto sul mandato
//      (propertyMatch), il preflight che lo dice prima del tap;
//   3. il mandato dato DOPO l'accettazione su un contratto già nato;
//   4. ✍️ Firmo io su un contratto convertito PRIMA della regola: lo stato
//      lo dice senza scrivere, la firma scrive il riscontro e firma; un
//      interno diverso o un immobile ritoccato dopo → niente firma; una
//      lettura fallita non tocca niente.
// Handler REALI (preagreement/submit, convert, mandate, sign-for →
// magic-sign/submit in-process), nodemailer mockato via il loader di notify,
// Firestore/Storage/Identity su stub in-memory. Dati sintetici.
// Uso: node tests/mandato/casa.mjs
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-casa';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TELEGRAM_BOT_TOKEN;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

// ── Stub: Firestore in-memory (runQuery, commit con precondizione, create
// 409 su id esistente, patch) + Storage + Identity ──
const store = new Map();
const docTimes = new Map();
const storageFiles = new Map();
const failGet = new Set();      // percorsi la cui LETTURA fallisce (500)
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
  if (url.includes('api.telegram.org')) return okJson({ ok: true, result: { message_id: 1 } });
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
    const path = (url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
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
      if (qs.get('currentDocument.exists') === 'false' && store.has(path)) return new Response('exists', { status: 400 });
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      bump(path);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    if (failGet.has(path)) return new Response('boom', { status: 500 });
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
let IP = '9.8.1.1';
const mkReq = (body, headers = {}) => ({ method: 'POST', headers: { 'x-forwarded-for': IP, 'user-agent': 'test-ua', ...headers }, body, socket: {} });
const admin = (body) => mkReq(body, { authorization: 'Bearer admin-token' });
const clone = (o) => JSON.parse(JSON.stringify(o));

const MANDATO = (await import('../../js/mandato-engine.js')).default;
const { mandateCheck, mandateTermsHash } = await import('../../api/magic-sign/_shared.js');
const paSubmit = (await import('../../api/preagreement/submit.js')).default;
const { convertPaToContract, mandatePreflight } = await import('../../api/preagreement/convert.js');
const paMandate = (await import('../../api/preagreement/mandate.js')).default;
const signFor = (await import('../../api/preagreement/sign-for.js')).default;
const { healTenantMandate } = await import('../../api/preagreement/sign-for.js');

// ═══ 1. IL MOTORE ═══════════════════════════════════════════════════════
{
  const k = (a) => { const x = MANDATO.homeKey(a); return x ? x.street + '|' + x.civic + '|' + x.unit : null; };
  // le forme VERE del backup del 12/10 (indirizzi degli immobili)
  check('homeKey: «Via Luigi Pulci, n. 52» = «Via Luigi Pulci 52» («n.» davanti al civico)', k('Via Luigi Pulci, n. 52') === 'via luigi pulci|52|' && k('Via Luigi Pulci 52') === 'via luigi pulci|52|');
  check('homeKey: «V.le Angelico, 9» = «Viale Angelico 9» (abbreviazione e civico dopo la virgola)', k('V.le Angelico, 9') === 'viale angelico|9|' && k('Viale Angelico 9') === 'viale angelico|9|');
  check('homeKey: l\'interno scritto nell\'indirizzo si separa («Via dei Latini, 76 - int 1», «Viale Angelico n.9 int.11»)',
    k('Via dei Latini, 76 - int 1') === 'via dei latini|76|1' && k('Viale Angelico n.9 int.11') === 'viale angelico|9|11');
  check('homeKey: CAP, città e ordine dei pezzi non contano', k('00185 Roma, Via Merulana 113') === 'via merulana|113|' && k('Via Merulana, 113, Roma RM, 00185') === 'via merulana|113|');
  check('homeKey: «P.za di Spagna 9», «Lungot. dei Mellini 44», apostrofi tipografici', k('P.za di Spagna 9') === 'piazza di spagna|9|' && k('Lungot. dei Mellini 44') === 'lungotevere dei mellini|44|' && k('Via dell’Orso 5') === k("Via dell'Orso 5"));
  check('homeKey: «Via N. Sauro 12» resta la via di Nazario Sauro (dopo la N non c\'è un numero)', k('Via N. Sauro 12') === 'via n sauro|12|');
  check('homeKey: scala e piano DOPO il civico non sono l\'indirizzo', k('Via XX Settembre 4 piano terra') === 'via xx settembre|4|' && k('Via X Y 12, scala B, int. 3') === 'via x y|12|3');
  check('homeKey: 42/B è un altro civico di 42', k('Piazzale Prenestino 42/B') === 'piazzale prenestino|42b|' && k('Piazzale Prenestino 42') === 'piazzale prenestino|42|');
  const unread = ['Via Federico Guarducci', 'Viale Angelico, Mazzini', 'Passeggiata di Ripetta', 'Via dei Coronari, Piazza Navona', 'Viale Angelico 9 Prati', 'Angelico 9', '', null];
  check('homeKey: senza civico, senza tipo di via o con parole dopo il civico NON si legge (null) — mai una casa indovinata',
    unread.every(a => MANDATO.homeKey(a) === null));

  const m = (a, au, r) => MANDATO.homeMatch({ address: a, unit: au }, r);
  const ok1 = m('Viale Angelico 9', '11', { address: 'V.le Angelico, 9', unit: 'Int. 11' });
  check('homeMatch: stesso indirizzo e stesso interno («11» = «Int. 11») → la stessa casa, con l\'etichetta', ok1.match === true && ok1.label === 'viale angelico 9, int. 11' && ok1.key === 'viale angelico 9 int 11');
  check('homeMatch: l\'interno del record anche in `interno`', m('Viale Angelico 9', '11', { address: 'Viale Angelico 9', interno: '11' }).match === true);
  const u1 = m('Viale Angelico 9', '11', { address: 'Viale Angelico 9', unit: '12' });
  const u2 = m('Viale Angelico 9', '', { address: 'Viale Angelico 9', unit: '11' });
  check('homeMatch: interno diverso, o dichiarato da una parte sola → NON è la stessa casa (reason unit)',
    u1.match === false && u1.reason === 'unit' && u1.approvedUnit === '11' && u1.recordUnit === '12' && u2.match === false && u2.reason === 'unit');
  const e = m('Viale Angelico 9', '', { address: 'Viale Angelico 9' });
  check('homeMatch: interno non dichiarato su entrambi → la stessa casa (casa intera, come lucchetto e sovrapposizioni), e l\'etichetta LO DICE',
    e.match === true && /interno non dichiarato su entrambi/.test(e.label));
  check('homeMatch: civico diverso o via diversa («Tor Quinto» ≠ «Tor di Quinto») → reason address',
    m('Viale Angelico 9', '', { address: 'Viale Angelico 91' }).reason === 'address' && m('Via di Tor Quinto 39', '', { address: 'Via di Tor di Quinto 39' }).reason === 'address');
  check('homeMatch: un indirizzo illeggibile non combacia mai (reason address_unreadable)', m('Viale Angelico 9', '', { address: 'Viale Angelico' }).reason === 'address_unreadable');

  const snapU = { propertyId: null, address: 'viale angelico 9', unit: '11' };
  const hc = (terms, contract, property, pa = {}) => MANDATO.homeCheck({ terms, pa, paId: 'P1', contract, property });
  check('homeCheck: una foto CON immobile non chiede riscontri (null)', hc({ ...snapU, propertyId: 'pX' }, { propertyId: 'W0' }, { address: 'Viale Angelico 9', unit: '11' }) === null);
  check('homeCheck: il contratto sull\'immobile nato dalla proposta vale già (null), anche senza propertyId', hc(snapU, { propertyId: 'prop_pa_P1' }, null) === null && hc(snapU, {}, null) === null);
  check('homeCheck: il record che non c\'è → property_missing', hc(snapU, { propertyId: 'W0' }, null).reason === 'property_missing');
  check('homeCheck: l\'interno è quello della FOTO, anche se la proposta lo ha cambiato dopo (dichiarato in console)',
    hc(snapU, { propertyId: 'W0' }, { address: 'Viale Angelico 9', unit: '11' }, { property: { address: 'Viale Angelico 9', unit: '12' }, unitDeclaredAt: '2026-10-01' }).match === true
    && hc(snapU, { propertyId: 'W0' }, { address: 'Viale Angelico 9', unit: '12' }, { property: { address: 'Viale Angelico 9', unit: '12' }, unitDeclaredAt: '2026-10-01' }).match === false);
  const old = { propertyId: null, address: 'viale angelico 9' };   // foto di prima del 15/10: senza interno
  check('homeCheck: foto vecchia → l\'interno della proposta (chiusa dopo l\'accettazione)',
    hc(old, { propertyId: 'W0' }, { address: 'Viale Angelico 9', unit: '11' }, { property: { address: 'Viale Angelico 9', unit: '11' } }).match === true);
  check('homeCheck: foto vecchia + interno dichiarato DOPO, o indirizzo ritoccato → unit_unknown, niente riscontro',
    hc(old, { propertyId: 'W0' }, { address: 'Viale Angelico 9', unit: '11' }, { property: { address: 'Viale Angelico 9', unit: '11' }, unitDeclaredAt: '2026-10-01', unitWas: null }).reason === 'unit_unknown'
    && hc(old, { propertyId: 'W0' }, { address: 'Viale Angelico 9', unit: '11' }, { property: { address: 'Viale Angelico 9, Roma', unit: '11' } }).reason === 'unit_unknown');

  const T = { ...MANDATO.termsFromContract({ propertyId: null, tenantName: 'A B', landlordName: 'C D', rent: 900, startDate: '2027-01-01', endDate: '2027-12-31' }), address: 'viale angelico 9', unit: '11' };
  const c0 = { propertyId: 'W0', tenantName: 'A B', landlordName: 'C D', rent: 900, startDate: '2027-01-01', endDate: '2027-12-31' };
  const pm = { propertyId: 'W0', by: 'address+unit', home: 'viale angelico 9 int 11' };
  check('termsForMandate: il riscontro allinea SOLO il record riscontrato', MANDATO.diffTerms(T, MANDATO.termsForMandate(c0, { terms: T, paId: 'P1', propertyMatch: pm })).length === 0
    && MANDATO.diffTerms(T, MANDATO.termsForMandate({ ...c0, propertyId: 'W1' }, { terms: T, paId: 'P1', propertyMatch: pm })).map(d => d.key).join() === 'propertyId');
  check('termsForMandate: un riscontro di altro tipo non vale', MANDATO.diffTerms(T, MANDATO.termsForMandate(c0, { terms: T, paId: 'P1', propertyMatch: { ...pm, by: 'manual' } })).map(d => d.key).join() === 'propertyId');
  const noUnit = { ...T }; delete noUnit.unit;
  check('compatibilità: l\'interno NON entra nell\'impronta — i mandati già dati restano validi', mandateTermsHash(T) === mandateTermsHash(noUnit) && MANDATO.canonical(T) === MANDATO.canonical(noUnit));
  check('la foto della proposta porta l\'interno (unit), quella del contratto no', MANDATO.termsFromProposal({ property: { address: 'Via X 1', unit: 'Int. 3' } }).unit === 'int. 3' && MANDATO.termsFromContract({}).unit === null);
}

// ── Seed ────────────────────────────────────────────────────────────────
store.set('users/caller1', { role: 'admin', name: 'Valentino', email: 'op@boom.it' });
// l'appartamento è GIÀ nel portal: stesso indirizzo (scritto diverso) e stesso interno
store.set('properties/W0', { name: 'Angelico 9', address: 'V.le Angelico, 9', unit: 'Int. 11', city: 'Roma', ownerName: 'Giulia Bianchi', floor: '3' });
// stesso palazzo, ALTRO interno
store.set('properties/W1', { name: 'Angelico 9 int 12', address: 'Viale Angelico 9', unit: '12', city: 'Roma', ownerName: 'Giulia Bianchi', floor: '4' });
const paSeed = (token, extra = {}) => ({
  token, status: 'sent', propertyId: null, askMandate: true,
  property: { address: 'Viale Angelico 9', unit: '11', type: 'Entire Apartment', condition: 'Furnished', use: 'Residential', floor: '3' },
  landlord: { name: 'Giulia Bianchi', email: null, phone: '+39 334 0000000' },
  lease: { startDate: '2047-01-01', months: 12, endDate: '2047-12-31', type: 'Transitional Lease', lawRef: 'uso transitorio · L.431/98 art.5 c.1', reason: 'lavoro' },
  money: { rent: 1450, deposit: 2900, depositMonths: 2, dueAtSigning: 0, monthlyTotal: 1450, chargedMonthly: 1450, depositAtSigning: 0, depositAtMoveIn: 2900, installmentMonths: 1 },
  createdAt: '2046-12-01T10:00:00Z',
  ...extra,
});
const tenant = (n) => ({ fullName: 'Jen Prova ' + n, email: 'jen' + n + '@x.com', phone: '+1555000000' + n, dob: '1990-01-01', nationality: 'American' });
// un anno di locazione diverso per ogni proposta: stesso indirizzo e stesso
// interno nello stesso periodo li fermerebbe il lucchetto (la seconda in riserva)
let YEAR = 2047;
async function accept(id, token, { mandate = true, extra = {} } = {}) {
  const y = YEAR++;
  store.set('preAgreements/' + id, paSeed(token, { lease: { startDate: y + '-01-01', months: 12, endDate: y + '-12-31', type: 'Transitional Lease', lawRef: 'uso transitorio · L.431/98 art.5 c.1', reason: 'lavoro' }, ...extra }));
  const t = tenant(id);
  IP = '9.8.2.' + (passed + failed + 1);
  const r = mkRes();
  await paSubmit(mkReq({ token, tenant: t, tenants: [t], accept: true, mandate }), r);
  return { r, pa: store.get('preAgreements/' + id) };
}

// ═══ 2. LA CONVERSIONE su un immobile del portal ════════════════════════
{
  const { r, pa } = await accept('paA', 'a1'.repeat(16));
  check('§2 setup: accettata col mandato, foto SENZA immobile e CON l\'interno visto dal cliente',
    r.code === 200 && pa.mandate && pa.mandate.given === true && pa.approvedTerms.terms.propertyId === null && pa.approvedTerms.terms.unit === '11');

  const before = store.size;
  const dry = await convertPaToContract({ pa, paId: 'paA', propertyId: 'W0', dryRun: true });
  check('preflight su W0 (stesso indirizzo e interno): il mandato SARÀ spendibile, e la console sa perché',
    dry.ok === true && dry.dryRun === true && dry.mandate && dry.mandate.ok === true && dry.mandate.home && dry.mandate.home.match === true && dry.mandate.home.label === 'viale angelico 9, int. 11');
  const dry1 = await convertPaToContract({ pa, paId: 'paA', propertyId: 'W1', dryRun: true });
  check('preflight su W1 (altro interno): mandato NON spendibile, con l\'interno nominato',
    dry1.ok === true && dry1.mandate.ok === false && dry1.mandate.home.match === false && /interno diverso: proposta «11», immobile «12»/.test(dry1.mandate.home.text));
  check('… il preflight non scrive nulla', store.size === before && !store.has('contracts/pa_paA'));

  const out = await convertPaToContract({ pa, paId: 'paA', propertyId: 'W0', actor: 'test' });
  const c = store.get('contracts/pa_paA');
  check('conversione su W0: il contratto nasce sul record del portal e il mandato porta il riscontro (propertyMatch)',
    out.ok === true && !!c && c.propertyId === 'W0' && c.tenantMandate && c.tenantMandate.propertyMatch
    && c.tenantMandate.propertyMatch.propertyId === 'W0' && c.tenantMandate.propertyMatch.by === 'address+unit' && c.tenantMandate.propertyMatch.home === 'viale angelico 9 int 11');
  check('… mandato SPENDIBILE: termsMatch, nessun diff, mandateCheck ok — l\'impronta resta quella dell\'accettazione',
    c.tenantMandate.termsMatch === true && c.tenantMandate.termsDiff.length === 0 && mandateCheck(c).ok === true && c.tenantMandate.termsHash === pa.approvedTerms.hash);
  check('… e resta un mandato: una condizione vera cambiata dopo è ancora un diff (canone)', mandateCheck({ ...c, rent: 1500 }).ok === false && mandateCheck({ ...c, rent: 1500 }).diff.map(d => d.key).join() === 'rent');
  check('… il riscontro vale per QUEL record: spostato su W1 il mandato non è spendibile', mandateCheck({ ...c, propertyId: 'W1' }).ok === false);

  const { pa: paB } = await accept('paB', 'b1'.repeat(16));
  await convertPaToContract({ pa: paB, paId: 'paB', propertyId: 'W1', actor: 'test', force: true });
  const cB = store.get('contracts/pa_paB');
  check('conversione su W1 (altro interno): mandato registrato ma NON spendibile, nessun riscontro',
    !!cB && cB.tenantMandate && !cB.tenantMandate.propertyMatch && cB.tenantMandate.termsMatch === false && cB.tenantMandate.termsDiff.join() === 'propertyId' && mandateCheck(cB).reason === 'mandate_terms_changed');

  const { pa: paN } = await accept('paN', 'c1'.repeat(16), { mandate: false });
  const dryN = await convertPaToContract({ pa: paN, paId: 'paN', propertyId: 'W0', dryRun: true });
  check('proposta SENZA mandato: il preflight non parla di mandato (null)', dryN.ok === true && dryN.mandate === null && mandatePreflight(paN, 'paN', {}, null) === null);
}

// ═══ 3. IL MANDATO DATO DOPO, sul contratto già nato su W0 ═══════════════
{
  const tok = 'd1'.repeat(16);
  const { pa } = await accept('paM', tok, { mandate: false });
  await convertPaToContract({ pa, paId: 'paM', propertyId: 'W0', actor: 'test', force: true });
  const c0 = clone(store.get('contracts/pa_paM'));
  IP = '9.8.3.1';
  const r = mkRes();
  await paMandate(mkReq({ token: tok, mandate: true }), r);
  const c = store.get('contracts/pa_paM');
  check('mandato dato DOPO: il contratto già nato su W0 lo eredita col riscontro, spendibile',
    !c0.tenantMandate && r.code === 200 && c.tenantMandate && c.tenantMandate.given === true && c.tenantMandate.propertyMatch && c.tenantMandate.propertyMatch.propertyId === 'W0'
    && c.tenantMandate.termsMatch === true && mandateCheck(c).ok === true);
}

// ═══ 4. ✍️ FIRMO IO su un contratto convertito PRIMA della regola ═══════
{
  // l'operatore ha la firma salvata
  let r = mkRes(); await signFor(admin({ op: 'signature', png: 'data:image/png;base64,' + 'C'.repeat(600) }), r);
  check('§4 setup: firma dell\'operatore salvata', r.code === 200);

  // il contratto com'era prima del 15/10: foto senza interno, nessun riscontro, termsMatch false
  const legacy = async (id, token, propertyId) => {
    const { pa } = await accept(id, token);
    await convertPaToContract({ pa, paId: id, propertyId, actor: 'test', force: true });
    const cid = 'contracts/pa_' + id;
    const c = store.get(cid);
    const terms = { ...c.tenantMandate.terms }; delete terms.unit;
    c.tenantMandate = { ...c.tenantMandate, terms, termsMatch: false, termsDiff: ['propertyId'] };
    delete c.tenantMandate.propertyMatch;
    const p = store.get('preAgreements/' + id);
    p.approvedTerms = { ...p.approvedTerms, terms };
    return cid;
  };

  const cidL = await legacy('paL', 'e1'.repeat(16), 'W0');
  check('§4 setup: il contratto legacy su W0 rifiuterebbe la firma (nessun riscontro)', mandateCheck(store.get(cidL)).ok === false);
  const snapBefore = clone(store.get(cidL));
  r = mkRes(); await signFor(admin({ op: 'status', id: 'paL' }), r);
  check('status: il piano dice la verità — mandato spendibile, la casa è quella della proposta (etichetta), e NIENTE scritto',
    r.code === 200 && r.body.plan.mandateOk === true && r.body.plan.canSignTenant === true && r.body.plan.home && r.body.plan.home.match === true
    && r.body.plan.home.label === 'viale angelico 9, int. 11' && JSON.stringify(store.get(cidL)) === JSON.stringify(snapBefore));
  r = mkRes(); await signFor(admin({ op: 'sign', id: 'paL', contractVersion: 1 }), r);
  const cL = store.get(cidL);
  check('sign: il riscontro si scrive sul mandato PRIMA della firma, e il conduttore firma per mandato',
    r.code === 200 && (r.body.steps || []).join() === 'tenant' && cL.tenantMandate.propertyMatch && cL.tenantMandate.propertyMatch.propertyId === 'W0'
    && cL.tenantMandate.termsMatch === true && !!cL.tenantSignature && !!cL.tenantSignedByDelegate && /Jen Prova paL/.test(cL.tenantSignedByDelegate.onBehalfOf || ''));

  const cidX = await legacy('paX', 'f1'.repeat(16), 'W1');
  r = mkRes(); await signFor(admin({ op: 'status', id: 'paX' }), r);
  check('status su W1 (altro interno): mandato NON spendibile, e il perché (interno diverso)',
    r.code === 200 && r.body.plan.mandateOk === false && r.body.plan.home && r.body.plan.home.match === false && /interno diverso/.test(r.body.plan.home.text));
  r = mkRes(); await signFor(admin({ op: 'sign', id: 'paX', contractVersion: 1 }), r);
  const cX = store.get(cidX);
  check('sign su W1: 409 mandate_terms_changed col perché, nessuna firma, nessuna delega armata',
    r.code === 409 && r.body.error === 'mandate_terms_changed' && r.body.home && /interno diverso/.test(r.body.home.text) && !cX.tenantSignature && !cX.tenantDelegate);

  // l'immobile ritoccato DOPO il riscontro: non è più la casa approvata
  const { pa: paE } = await accept('paE', '0e'.repeat(16));
  store.set('properties/W2', { name: 'Angelico 9 bis', address: 'Viale Angelico 9', unit: '11', city: 'Roma' });
  await convertPaToContract({ pa: paE, paId: 'paE', propertyId: 'W2', actor: 'test', force: true });
  const cidE = 'contracts/pa_paE';
  check('§4 riscontro preso su W2 alla conversione', !!(store.get(cidE).tenantMandate || {}).propertyMatch && mandateCheck(store.get(cidE)).ok === true);
  store.get('properties/W2').unit = '7';
  r = mkRes(); await signFor(admin({ op: 'status', id: 'paE' }), r);
  check('status dopo che W2 è passato all\'interno 7: il piano lo dice (non spendibile), senza scrivere',
    r.body.plan.mandateOk === false && r.body.plan.home.match === false && !!store.get(cidE).tenantMandate.propertyMatch);
  r = mkRes(); await signFor(admin({ op: 'sign', id: 'paE', contractVersion: 1 }), r);
  const cE = store.get(cidE);
  check('sign: 409, e il riscontro TOLTO dal mandato (lookup e portal vedono la stessa cosa) — nessuna firma',
    r.code === 409 && !cE.tenantMandate.propertyMatch && cE.tenantMandate.termsMatch === false && !cE.tenantSignature && mandateCheck(cE).ok === false);

  // una lettura FALLITA dell'immobile non tocca niente
  store.get('properties/W2').unit = '11';
  const { pa: paF } = await accept('paF', '0f'.repeat(16));
  await convertPaToContract({ pa: paF, paId: 'paF', propertyId: 'W2', actor: 'test', force: true });
  const cidF = 'contracts/pa_paF';
  failGet.add('properties/W2');
  const fBefore = clone(store.get(cidF));
  r = mkRes(); await signFor(admin({ op: 'status', id: 'paF' }), r);
  check('lettura dell\'immobile FALLITA: si tiene il riscontro che c\'è (piano spendibile, niente scritto, nessun home nel piano)',
    r.code === 200 && r.body.plan.mandateOk === true && !r.body.plan.home && JSON.stringify(store.get(cidF)) === JSON.stringify(fBefore));
  failGet.delete('properties/W2');

  // il caso puro: niente da rifare se foto con immobile o immobile nato dalla proposta
  const cBorn = { propertyId: 'prop_pa_Z', tenantMandate: { given: true, termsVersion: 2, terms: { propertyId: null, address: 'viale angelico 9', unit: '11' }, paId: 'Z' } };
  check('healTenantMandate: sull\'immobile nato dalla proposta non c\'è niente da rifare (null)',
    healTenantMandate({ contract: cBorn, pa: {}, paId: 'Z', property: null }) === null
    && healTenantMandate({ contract: { ...cBorn, propertyId: 'W0', tenantMandate: { ...cBorn.tenantMandate, terms: { propertyId: 'pX' } } }, pa: {}, paId: 'Z', property: store.get('properties/W0') }) === null);
}

// ═══ 5. LE GIUNZIONI ═══════════════════════════════════════════════════
{
  const fs = await import('node:fs');
  const R = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
  const cv = R('api/preagreement/convert.js'), sf = R('api/preagreement/sign-for.js'), md = R('api/preagreement/mandate.js'), cons = R('pre-agreement-admin.html'), eng = R('js/mandato-engine.js');
  check('convert: tenantMandateFor riceve l\'immobile su cui il contratto nasce (conversione e mandato dato dopo)',
    /contract\.tenantMandate = tenantMandateFor\(pa, paId, contract, property\);/.test(cv) && /tenantMandateFor\(paNow, id, \{ \.\.\.contract, id: cid \}, property\)/.test(md));
  check('sign-for: la casa si ricontrolla e si scrive PRIMA di mandateCheck nella firma, solo in memoria nello stato',
    sf.indexOf('const heal = await homeHealFor(contract, pa, paId, nowISO);') > 0 && sf.indexOf('const heal = await homeHealFor(contract, pa, paId, nowISO);') < sf.indexOf('const chk = mandateCheck(contract);')
    && /signPlan\(heal \? \{ \.\.\.contract, tenantMandate: heal\.mandate \} : contract, opSig\)/.test(sf));
  check('console: carica il motore (una copia della regola) e la casa identica viene PRIMA del somigliante',
    /<script src="\/js\/mandato-engine\.js"><\/script>/.test(cons) && /\|\|homeTwin\(d,props\)\n    \|\|\(norm\(addr\)\?/.test(cons) && /M\.homeCheck\(\{terms:T,pa:d,paId:d\.id,contract:\{propertyId:p\.id\},property:p\}\)/.test(cons));
  check('motore: l\'export resta una riga sola (le funzioni della casa si aggiungono sullo stesso oggetto)',
    /Object\.assign\(API, \{ normUnit, homeKey, homeMatch, homeCheck, propertyMatchFrom, describeHome \}\);/.test(eng));
}

console.log(`\nCasa: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:\n - ' + bad.join('\n - ')); process.exit(1); }
