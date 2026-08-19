// tests/preagreement/state.mjs
// LO STATO DI UNA PROPOSTA — il difetto che ha fatto sembrare NON PAGATO un
// deal incassato, e che ha piantato il passo successivo.
//
// Il guasto vero (agosto 2026): `submit.js` trattava come terminale il solo
// stato `accepted`. Un secondo invio del modulo su una proposta GIÀ PAGATA
// (pagina rimasta aperta con la bozza in localStorage, tasto indietro da
// Stripe, tap ripetuto su rete lenta) la riscriveva ad `accepted` con un
// protocollo nuovo e apriva una SECONDA Checkout; e se nel frattempo il
// lucchetto dell'immobile era passato a un'altra proposta, la ributtava in
// `reserve` — stato in cui → Contratto, Magic Sign e ✉ Reinvia copia
// rispondono tutti 409 `not_accepted_yet`.
//
// Qui girano i handler VERI (submit, pay, resolve) su un Firestore in
// memoria che riproduce i due comportamenti che contano: runQuery per token
// e create-o-fallisci con 409 sul documentId (il lucchetto).
//
//   node tests/preagreement/state.mjs

import { register } from 'node:module';
register('../money/loader.mjs', import.meta.url);

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@boom';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'hs';

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

// ── Firestore in memoria ──────────────────────────────────────────────────
const DB = new Map();
let WRITES = 0;
const toF = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toF(x)])) } };
  return { stringValue: String(v) };
};
const fromF = (f) => {
  if (!f || 'nullValue' in f) return null;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('stringValue' in f) return f.stringValue;
  if ('arrayValue' in f) return ((f.arrayValue || {}).values || []).map(fromF);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, fromF(x)]));
  return null;
};
const flds = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, toF(v)]));
const unflds = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromF(v)]));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), m = (opts.method || 'GET').toUpperCase();
  if (u.includes('identitytoolkit')) return json({ idToken: 'T', users: [{ localId: 'admin1', email: 'valentino@boom-rome.com' }] });
  if (u.includes('api.telegram.org')) return json({ ok: true });
  if (u.includes('api.emailjs.com')) return new Response('OK', { status: 200 });
  if (!u.includes('firestore.googleapis.com')) throw new Error('fetch imprevista: ' + u);

  const after = decodeURIComponent(u.split('/documents')[1] || '').replace(/^\//, '');
  if (after.startsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId;
    const field = q.where?.fieldFilter?.field?.fieldPath;
    const val = q.where?.fieldFilter?.value?.stringValue;
    const rows = [];
    for (const [key, fields] of DB) {
      if (!key.startsWith(coll + '/')) continue;
      if (field && String(fields[field]) !== String(val)) continue;
      rows.push({ document: { name: 'projects/p/databases/(default)/documents/' + key, fields: flds(fields) } });
    }
    return json(rows.length ? rows : [{}]);
  }
  const clean = after.split('?')[0];
  if (m === 'POST') {
    const dm = u.match(/documentId=([^&]+)/);
    const id = dm ? decodeURIComponent(dm[1]) : 'auto_' + DB.size;
    const path = clean + '/' + id;
    if (dm && DB.has(path)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);   // ← compare-and-set
    WRITES++;
    DB.set(path, unflds(JSON.parse(opts.body || '{}').fields));
    return json({ name: 'projects/p/databases/(default)/documents/' + path });
  }
  if (m === 'PATCH') {
    WRITES++;
    DB.set(clean, { ...(DB.get(clean) || {}), ...unflds(JSON.parse(opts.body || '{}').fields) });
    return json({ name: clean });
  }
  if (m === 'DELETE') { DB.delete(clean); return json({}); }
  if (!DB.has(clean)) return json({ error: { status: 'NOT_FOUND' } }, 404);
  return json({ name: clean, fields: flds(DB.get(clean)) });
};

// ── req/res ───────────────────────────────────────────────────────────────
const mkRes = () => ({
  code: 0, body: null,
  setHeader() {}, status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; }, end() { return this; },
});
const mkReq = (body, headers = {}) => ({ method: 'POST', headers, body });
const ADMIN = { authorization: 'Bearer idtok' };

const TOKEN = 'a'.repeat(32);
const PA = (over = {}) => ({
  token: TOKEN,
  createdAt: '2026-08-01T09:00:00.000Z',
  status: 'viewed',
  propertyId: 'prop_cavour',
  property: { address: 'Via Cavour 12, Roma' },
  landlord: { name: 'Egidi' },
  lease: { startDate: '2026-09-01', endDate: '2027-08-31', months: 12 },
  money: { rent: 1400, dueAtSigning: 2800 },
  ...over,
});
const TENANT = { fullName: 'Xenia Petrova', email: 'xenia@example.com', phone: '+393331234567' };
const seed = (pa, id = 'pa_x') => { DB.clear(); WRITES = 0; globalThis.__stripeCalls = []; globalThis.__stripeSessions = []; DB.set('preAgreements/' + id, pa); DB.set('users/admin1', { role: 'admin', email: 'valentino@boom-rome.com' }); return id; };
const get = (id = 'pa_x') => DB.get('preAgreements/' + id);

const submit = (await import('../../api/preagreement/submit.js')).default;
const payHandler = (await import('../../api/preagreement/pay.js')).default;
const resolve = (await import('../../api/preagreement/resolve.js')).default;
const S = await import('../../api/preagreement/_state.js');

// ═══ 1 · Il fatto, non l'etichetta ═════════════════════════════════════════
console.log('\n\x1b[1mChe cosa vuol dire "pagato"\x1b[0m');
check('status paid → pagato', S.paidOnRecord({ status: 'paid' }) === true);
check('paidAt su status accepted → pagato lo stesso', S.paidOnRecord({ status: 'accepted', paidAt: '2026-08-10T10:00:00Z' }) === true);
check('paidSessionId basta', S.paidOnRecord({ status: 'reserve', paidSessionId: 'cs_1' }) === true);
check('una proposta appena inviata non è pagata', S.paidOnRecord({ status: 'sent' }) === false);
check('senza documento non inventa un incasso', S.paidOnRecord(null) === false);
check('il dovuto comprende gli add-on', S.dueAtSigning({ money: { dueAtSigning: 2800 }, addonsEur: 149 }) === 2949);
check('verdetto: soldi con etichetta indietro = da riparare',
  S.stateVerdict({ status: 'accepted', paidAt: 'x' }).kind === 'payment_lost');
check('verdetto: riserva = da riparare', S.stateVerdict({ status: 'reserve' }).kind === 'reserve');
check('verdetto: accettata col dovuto aperto NON è un guasto',
  S.stateVerdict({ status: 'accepted', money: { dueAtSigning: 2800 } }).kind === 'unpaid');

// ═══ 2 · Il secondo invio su una proposta già pagata ═══════════════════════
console.log('\n\x1b[1mIl modulo rispedito dopo il pagamento\x1b[0m');
seed(PA({ status: 'paid', tenant: TENANT, ref: 'BOOM-OLD', paidAt: '2026-08-10T10:00:00.000Z', paidEur: 2800, paidSessionId: 'cs_paid_1' }));
let res = mkRes();
await submit(mkReq({ token: TOKEN, tenant: TENANT, accept: true }), res);
let d = get();
check('risponde ok senza rifare nulla', res.code === 200 && res.body.already === true && res.body.paid === true, JSON.stringify(res.body));
check('lo stato PAGATO non viene degradato', d.status === 'paid', d.status);
check('il protocollo resta quello incassato', d.ref === 'BOOM-OLD', String(d.ref));
check('NESSUNA seconda Checkout aperta', globalThis.__stripeCalls.length === 0, String(globalThis.__stripeCalls.length));
check('nessuna riserva inventata su un deal chiuso', !d.reserveOf && !d.reserveAt);

// La stessa scena col lucchetto dell'immobile passato a un'altra proposta:
// è QUESTA la variante che finiva in `reserve` e piantava tutto.
seed(PA({ status: 'paid', tenant: TENANT, ref: 'BOOM-OLD', paidAt: '2026-08-10T10:00:00.000Z', paidEur: 2800 }));
for (let i = 0; i < 12; i++) {
  const mth = '2026-' + String(9 + i).padStart(2, '0');
  DB.set('propertyLocks/p_prop_cavour__' + (i < 4 ? mth : '2027-' + String(i - 3).padStart(2, '0')),
    { paId: 'pa_altro', ref: 'Marco Bianchi', heldAt: new Date().toISOString(), firm: true });
}
res = mkRes();
await submit(mkReq({ token: TOKEN, tenant: TENANT, accept: true }), res);
d = get();
check('immobile passato ad altri: il deal pagato NON diventa una riserva',
  d.status === 'paid' && res.code === 200, `${d.status} / ${res.code}`);

// ═══ 3 · La riserva resta una strada aperta ════════════════════════════════
// La guardia non deve chiudere il percorso legittimo: chi è in riserva e non
// ha pagato nulla deve poter chiudere quando l'immobile si libera.
console.log('\n\x1b[1mLa riserva può ancora chiudere (la guardia non è un muro)\x1b[0m');
seed(PA({ status: 'reserve', tenant: TENANT, reserveOf: 'pa_altro' }));
res = mkRes();
await submit(mkReq({ token: TOKEN, tenant: TENANT, accept: true }), res);
d = get();
check('senza lucchetti attivi accetta e apre il pagamento',
  d.status === 'accepted' && !!res.body.checkoutUrl, `${d.status} / ${JSON.stringify(res.body)}`);

// ═══ 4 · Nessun doppio incasso dal bottone "completa il pagamento" ═════════
console.log('\n\x1b[1mIl link "completa la prenotazione" su un deal già incassato\x1b[0m');
seed(PA({ status: 'accepted', tenant: TENANT, ref: 'BOOM-OLD', paidAt: '2026-08-10T10:00:00.000Z', paidEur: 2800, paidSessionId: 'cs_paid_1' }));
res = mkRes();
await payHandler(mkReq({ token: TOKEN }), res);
check('rifiuta: già pagato', res.code === 409 && res.body.error === 'already_paid', JSON.stringify(res.body));
check('…e non ha creato nessuna sessione', globalThis.__stripeCalls.length === 0);

// ═══ 5 · Il bottone che rimette in pari ════════════════════════════════════
console.log('\n\x1b[1mLa riparazione dalla console\x1b[0m');
seed(PA({ status: 'accepted', tenant: TENANT, ref: 'BOOM-1', paidAt: '2026-08-10T10:00:00.000Z', paidEur: 2800, paidSessionId: 'cs_paid_1' }));
const w0 = WRITES;
res = mkRes();
await resolve(mkReq({ id: 'pa_x' }, {}), res);           // senza Authorization
check('senza credenziali: 401', res.code === 401, String(res.code));
check('…e nessuna scrittura', WRITES === w0, String(WRITES - w0));

res = mkRes();
await resolve(mkReq({ id: 'pa_x' }, ADMIN), res);
d = get();
check('soldi sul documento → stato riportato a PAGATO',
  res.body && res.body.verdict === 'payment_restored' && d.status === 'paid', JSON.stringify(res.body));
check('l\'incasso originale non viene riscritto', d.paidEur === 2800 && d.paidSessionId === 'cs_paid_1');
check('resta traccia di chi ha riparato', !!d.statusRepairedAt && d.statusRepairedBy === 'valentino@boom-rome.com', String(d.statusRepairedBy));

// La prova che sta solo su Stripe (webhook mai arrivato).
seed(PA({ status: 'accepted', tenant: TENANT, ref: 'BOOM-2' }));
globalThis.__stripeSessions = [
  { id: 'cs_altro', payment_status: 'paid', metadata: { token: 'b'.repeat(32) }, amount_total: 999900 },
  { id: 'cs_mio', payment_status: 'paid', metadata: { token: TOKEN }, amount_total: 280000, payment_intent: 'pi_9' },
];
res = mkRes();
await resolve(mkReq({ id: 'pa_x' }, ADMIN), res);
d = get();
check('pagamento trovato su Stripe per QUESTO token', d.status === 'paid' && d.paidSessionId === 'cs_mio', JSON.stringify(res.body));
check('…con l\'importo davvero incassato', d.paidEur === 2800, String(d.paidEur));
check('…e non prende la sessione di un\'altra proposta', d.paidEur !== 9999);

// Nessuna prova da nessuna parte: non si inventa un incasso.
seed(PA({ status: 'accepted', tenant: TENANT, ref: 'BOOM-3' }));
globalThis.__stripeSessions = [{ id: 'cs_altrui', payment_status: 'paid', metadata: { token: 'c'.repeat(32) }, amount_total: 100000 }];
const w1 = WRITES;
res = mkRes();
await resolve(mkReq({ id: 'pa_x' }, ADMIN), res);
d = get();
check('nessuna prova → non dichiara pagato', d.status === 'accepted' && res.body.verdict === 'no_payment_found', JSON.stringify(res.body));
check('…e non tocca il documento', WRITES === w1, String(WRITES - w1));

// Una sessione APERTA (non pagata) non è una prova.
seed(PA({ status: 'accepted', tenant: TENANT }));
globalThis.__stripeSessions = [{ id: 'cs_aperta', payment_status: 'unpaid', metadata: { token: TOKEN }, amount_total: 280000 }];
res = mkRes();
await resolve(mkReq({ id: 'pa_x' }, ADMIN), res);
check('checkout abbandonata ≠ pagamento', get().status === 'accepted' && res.body.verdict === 'no_payment_found');

// ═══ 6 · Sbloccare una riserva ═════════════════════════════════════════════
console.log('\n\x1b[1mLa riserva sbloccata dalla console\x1b[0m');
seed(PA({ status: 'reserve', tenant: TENANT, reserveOf: 'pa_altro', reserveAt: '2026-08-05T10:00:00.000Z' }));
DB.set('propertyLocks/p_prop_cavour__2026-09', { paId: 'pa_altro', ref: 'Marco Bianchi', heldAt: new Date().toISOString(), firm: true });
const w2 = WRITES;
res = mkRes();
await resolve(mkReq({ id: 'pa_x' }, ADMIN), res);
check('immobile ancora tenuto: non promuove', res.body.verdict === 'still_held' && get().status === 'reserve', JSON.stringify(res.body));
check('…e dice DI CHI è', res.body.blocked && res.body.blocked.byRef === 'Marco Bianchi');
check('…senza scrivere niente sulla proposta', !get().statusRepairedBy);

DB.delete('propertyLocks/p_prop_cavour__2026-09');
res = mkRes();
await resolve(mkReq({ id: 'pa_x' }, ADMIN), res);
d = get();
check('immobile libero: la riserva torna ACCETTATA', res.body.verdict === 'reserve_promoted' && d.status === 'accepted', JSON.stringify(res.body));
check('…con un protocollo suo', /^BOOM-/.test(String(d.ref)), String(d.ref));
check('…e la firma già data resta', !!d.tenant, JSON.stringify(d.tenant));
check('…ma il dovuto NON è dichiarato pagato', d.status === 'accepted' && !d.paidAt && res.body.due === 2800);
check('il lucchetto ora è suo', (DB.get('propertyLocks/p_prop_cavour__2026-09') || {}).paId === 'pa_x');

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mUn deal pagato non può più tornare indietro, e nessuno resta bloccato in silenzio.\x1b[0m');
