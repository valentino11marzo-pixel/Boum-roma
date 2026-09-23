// tests/owner/paper.mjs — la firma su carta REGISTRATA dallo staff ferma
// davvero chi chiede di firmare.
//
// Il difetto (revisione avversariale del 23/09): «📄 Firmato su carta» lo
// leggevano solo il motore dell'Archivio e il badge del portal. Il cron dei
// promemoria (firma parziale, re-invito, «aperto ma non firmato»), il
// Gestore («Manca la tua firma»), il journey e la coda di Oggi continuavano
// a trattare il contratto come da firmare: il proprietario leggeva nel suo
// archivio «firmato su carta, registrato da BOOM» e riceveva per email
// «Tocca a Lei — firmi il contratto».
//
// Qui: (1) la regola è UNA — il motore ne tiene una copia (UMD senza
// import) e la parità col dizionario si misura su una matrice di casi;
// (2) il cron VERO su un contratto firmato su carta non manda niente, e lo
// STESSO contratto senza la registrazione sì (il controllo che morde);
// (3) il Gestore vero, in dry-run, non propone la firma; (4) journey e Oggi;
// (5) il portal non cambia i termini sotto una firma su carta.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
register('file://' + path.join(ROOT, 'tests/notify/loader.mjs'), import.meta.url);
const require = createRequire(import.meta.url);
const FIELDS = require(path.join(ROOT, 'js/contract-fields.js'));
const OWNER = require(path.join(ROOT, 'js/owner-archive-engine.js'));
const OGGI = require(path.join(ROOT, 'js/oggi-engine.js'));
const R = (f) => readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0, failed = 0; const bad = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; bad.push(name); console.log('  ✗ ' + name); }
}
function section(t) { console.log('\n' + t); }

const NOW = Date.parse('2026-09-23T10:00:00Z');
const iso = (h) => new Date(NOW - h * 3600e3).toISOString();
const PS = { at: '2026-09-20', by: 'adm', recordedAt: '2026-09-22T09:00:00Z' };

// ══ 1 · una regola sola ══════════════════════════════════════════════════
section('§1 La regola è una: motore e dizionario danno la stessa risposta');
{
  const day = (s) => { const t = String(s || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; };
  const CASES = [
    {},
    { paperSigned: PS },
    { paperSigned: { at: '2026-09-20' } },
    { paperSigned: { at: '2026-09-20', by: '' } },
    { paperSigned: { at: '20/09/2026', by: 'adm' } },
    { paperSigned: { at: null, by: 'adm' } },
    { paperSigned: 'si' },
    { paperSigned: PS, renewalOf: 'c0', createdAt: '2026-09-01T00:00:00Z' },
    { paperSigned: PS, renewalOf: 'c0', createdAt: '2026-09-23T00:00:00Z' },
    { paperSigned: { at: '2026-09-20', by: 'adm' }, renewalOf: 'c0', createdAt: '2026-09-01T00:00:00Z' },
    { paperSigned: PS, renewalOf: 'c0', startDate: '2026-10-01' },
    { paperSigned: PS, renewalOf: 'c0' },
  ];
  const diff = CASES.map((c, i) => [i, OWNER.paperSignedOn(c, day), FIELDS.paperSignedOn(c, day)]).filter((x) => x[1] !== x[2]);
  ok('paperSignedOn: il motore e contract-fields concordano su ' + CASES.length + ' casi' + (diff.length ? ' — divergono: ' + JSON.stringify(diff) : ''), diff.length === 0);
  ok('valida: giorno + autore → il giorno', FIELDS.paperSignedOn({ paperSigned: PS }) === '2026-09-20');
  ok('senza autore, o giorno illeggibile → niente', !FIELDS.paperSignedOn({ paperSigned: { at: '2026-09-20' } }) && !FIELDS.paperSignedOn({ paperSigned: { at: '20/09/2026', by: 'a' } }));
  ok('rinnovo: registrata dopo la nascita vale, prima no', !!FIELDS.paperSignedOn(CASES[7]) && !FIELDS.paperSignedOn(CASES[8]));
  ok('un Timestamp di Firestore come createdAt si legge (seconds / toDate)',
    !!FIELDS.paperSignedOn({ paperSigned: PS, renewalOf: 'c0', createdAt: { seconds: Date.parse('2026-09-01T00:00:00Z') / 1000 } })
    && !FIELDS.paperSignedOn({ paperSigned: PS, renewalOf: 'c0', createdAt: { toDate: () => new Date('2026-09-23T00:00:00Z') } }));
  ok('signatureSettled: completa oppure carta registrata', FIELDS.signatureSettled({ signatureStatus: 'complete' })
    && FIELDS.signatureSettled({ signatureStatus: 'partial', paperSigned: PS }) && !FIELDS.signatureSettled({ signatureStatus: 'partial' }));
}

// ══ 2 · il cron vero ═════════════════════════════════════════════════════
section('§2 reminder-cron (handler VERO): nessun «Tocca a Lei» su un contratto firmato su carta');
function toFs(v) {
  if (v == null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const docOf = (p, o) => { const f = {}; for (const [k, v] of Object.entries(o)) f[k] = toFs(v); return { name: `projects/test-proj/databases/(default)/documents/${p}`, fields: f }; };
async function runCron(contracts) {
  Object.assign(process.env, { FIREBASE_API_KEY: 'k', FIREBASE_ADMIN_EMAIL: 'a@b.c', FIREBASE_ADMIN_PASS: 'p', FIREBASE_PROJECT_ID: 'test-proj',
    HOMIE_SECRET: 's', GMAIL_USER: 'sys@test.it', GMAIL_APP_PASS: 'x', CRON_SECRET: 'cron' });
  const docs = { 'properties/p1': { address: 'Via Test 1', name: 'Test', ownerId: 'o1' }, 'users/t1': { email: 't@example.com', name: 'Tenant' }, 'users/o1': { email: 'owner@example.it', name: 'Marco' } };
  const patches = [];
  globalThis.__mails = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('identitytoolkit')) return J({ idToken: 'tok', expiresIn: '3600' });
    if (url.includes('securetoken')) return J({ id_token: 'tok', expires_in: '3600' });
    if (url.endsWith(':runQuery')) {
      const b = JSON.parse(opts.body); const col = b.structuredQuery.from[0].collectionId;
      const ff = b.structuredQuery.where && b.structuredQuery.where.fieldFilter;
      if (col === 'contracts' && ff && ff.field.fieldPath === 'signatureStatus') {
        return J(contracts.filter((c) => c.signatureStatus === ff.value.stringValue).map((c) => ({ document: docOf('contracts/' + c.id, c) })));
      }
      return J([]);
    }
    if ((opts.method || 'GET') === 'PATCH') { patches.push(url); return J({}); }
    const m = url.match(/documents\/(.+?)(\?|$)/);
    if (m && docs[m[1]]) return J(docOf(m[1], docs[m[1]]));
    return J({ error: { code: 404 } }, 404);
  };
  try {
    const { default: handler } = await import(path.join(ROOT, 'api/reminder-cron.js'));
    let out;
    const res = { status() { return this; }, json(o) { out = o; return this; }, setHeader() {}, send(o) { out = o; return this; }, end() { return this; } };
    await handler({ headers: { authorization: 'Bearer cron' }, method: 'GET', query: {} }, res);
    return { out: out || {}, mails: globalThis.__mails.slice(), patches: patches.filter((p) => p.includes('contracts/')) };
  } finally { globalThis.fetch = realFetch; }
}
const nowIso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const partialContract = (extra) => ({
  id: 'c1', status: 'active', signatureStatus: 'partial', propertyId: 'p1', tenantId: 't1',
  tenantSignature: 'data:image/png;base64,AAA', tenantSignedAt: nowIso(72),
  tenantSignToken: 'TT', landlordSignToken: 'LL', signingOrder: 'sequential',
  signInviteLandlordAt: nowIso(72), landlordEmail: 'owner@example.it', landlordName: 'Marco Bianchi',
  startDate: '2026-10-01', endDate: '2027-09-30', ...(extra || {}),
});
const paperNow = { at: new Date().toISOString().slice(0, 10), by: 'adm', recordedAt: nowIso(1) };
{
  const ctl = await runCron([partialContract()]);
  ok('controllo: lo STESSO contratto senza la firma su carta riceve il «Tocca a Lei» (il test morde)',
    ctl.out.signNudged === 1 && ctl.mails.some((m) => m.to === 'owner@example.it') && ctl.patches.length > 0);
  const paper = await runCron([partialContract({ paperSigned: paperNow })]);
  ok('firma su carta registrata: nessun sollecito, nessuna email al proprietario, nessuna scrittura sul contratto',
    paper.out.signNudged === 0 && !paper.mails.some((m) => m.to === 'owner@example.it') && paper.patches.length === 0);
  const viewed = { ...partialContract({ paperSigned: paperNow }), signatureStatus: 'none', tenantSignature: null, tenantSignedAt: null,
    signViewedTenantAt: nowIso(30), tenantEmail: 't@example.com' };
  const v = await runCron([viewed]);
  ok('«aperto ma non firmato» su un contratto firmato su carta: nessun promemoria', !v.mails.length && v.patches.length === 0);
  const { shouldReinvite } = await import(path.join(ROOT, 'api/reminder-cron.js'));
  const cold = { status: 'active', signatureStatus: 'none', tenantSignToken: 'TT', signInviteTenantAt: iso(80) };
  ok('shouldReinvite: invitato 80h fa → sì; firmato su carta → no', shouldReinvite(cold, NOW) === true && shouldReinvite({ ...cold, paperSigned: PS }, NOW) === false);
  const src = R('api/reminder-cron.js');
  ok('sorgente: la mappa paperSigned si legge (le altre mappe restano come prima)', /k === 'paperSigned' \? fsShallowMap\(v\) : fsVal\(v\)/.test(src));
  ok('sorgente: la guardia sta nei tre giri che chiedono di firmare',
    (src.match(/FIELDS\.paperSignedOn\(c\)/g) || []).length === 3);
}

// ══ 3 · il Gestore vero ═════════════════════════════════════════════════
section('§3 Gestore (handler VERO, dry-run): «Manca la tua firma» non parte su un contratto firmato su carta');
{
  const { createHarness } = await import('./_harness.mjs');
  const old = { id: 'cg', status: 'active', signatureStatus: 'none', propertyId: 'p1', tenantId: 't1', tenantSignToken: 'TT', landlordSignToken: 'LL',
    tenantEmail: 't@example.com', landlordEmail: 'owner@example.it', createdAt: '2026-08-01T00:00:00Z', startDate: '2026-09-01', endDate: '2027-08-31', rent: 1000 };
  async function gestore(contract) {
    const seed = { ['contracts/' + contract.id]: (({ id, ...rest }) => rest)(contract), 'properties/p1': { name: 'Test', address: 'Via Test 1', ownerId: 'o1' },
      'users/t1': { role: 'tenant', email: 't@example.com', name: 'Tenant' }, 'users/o1': { role: 'landlord', email: 'owner@example.it', name: 'Marco' } };
    const h = createHarness({ seed, env: { CRON_SECRET: 'cron' } });
    const un = h.install();
    try {
      const mod = await import(path.join(ROOT, 'api/employees/gestore.js'));
      const res = await h.call(mod.default, { method: 'GET', token: 'cron', query: { dry: '1' } });
      return res;
    } finally { un(); }
  }
  const ctl = await gestore(old);
  const signs = (r) => ((r.body && r.body.report && r.body.report.proposals) || []).filter((p) => p.type === 'firma');
  ok('controllo: senza la carta il Gestore propone la firma (il test morde)', ctl.statusCode === 200 && signs(ctl).length > 0);
  const paper = await gestore({ ...old, paperSigned: PS });
  ok('con la firma su carta registrata: nessuna proposta di firma', paper.statusCode === 200 && signs(paper).length === 0);
}

// ══ 4 · journey e Oggi ══════════════════════════════════════════════════
section('§4 journey e Oggi');
{
  const { journeyEligible } = await import(path.join(ROOT, 'api/journey/_run.js'));
  const inv = { signatureStatus: 'none', signInviteTenantAt: iso(80) };
  ok('journey: invitato e non firmato resta nel funnel; firmato su carta entra nel ciclo casa',
    journeyEligible(inv) === false && journeyEligible({ ...inv, paperSigned: PS }) === true
    && journeyEligible({ signatureStatus: 'partial', paperSigned: PS }) === true);
  const S = (c) => ({ contracts: [c], properties: [{ id: 'p1', name: 'Test' }], users: [], payments: [], maintenance: [], leads: [], viewings: [], actionQueue: [], invoices: [], deadlines: [] });
  const half = { id: 'co', propertyId: 'p1', status: 'active', signatureStatus: 'partial', tenantSignature: 'x', tenantSignedAt: iso(100), startDate: '2026-09-01' };
  const list = (c) => OGGI.build(S(c), new Date(NOW).toISOString()).decisions || [];
  ok('Oggi: la firma a metà c\'è senza carta, sparisce con la carta registrata',
    list(half).some((x) => x.kind === 'firme') && !list({ ...half, paperSigned: PS }).some((x) => x.kind === 'firme'));
  const paperOld = { id: 'cr', propertyId: 'p1', status: 'active', signatureStatus: 'none', startDate: '2026-07-01', paperSigned: { ...PS, at: '2026-07-01' } };
  const rli = (c) => list(c).filter((x) => /rli|registr/i.test(String(x.kind) + ' ' + String(x.id)));
  ok('Oggi: firmato su carta e non registrato → la registrazione RLI torna nella coda (senza carta no)',
    rli(paperOld).length > 0 && rli({ ...paperOld, paperSigned: undefined }).length === 0);
}

// ══ 5 · i termini sotto la carta ════════════════════════════════════════
section('§5 portal: i termini non cambiano sotto una firma su carta');
{
  const src = R('js/portal-app.js');
  const a = src.indexOf('    function paperTermsChanged('), b = src.indexOf('    async function markPaperSigned(');
  ok('paperTermsChanged presente, prima di markPaperSigned', a > 0 && b > a);
  const paperTermsChanged = new Function(src.slice(a, b) + '\nreturn paperTermsChanged;')();
  const c = { paperSigned: PS, propertyId: 'p1', tenantId: 't1', startDate: '2026-09-01', endDate: '2027-08-31', rent: 1250, deposit: 2500, type: 'ordinaria' };
  const same = { propertyId: 'p1', tenantId: 't1', startDate: '2026-09-01', endDate: '2027-08-31', rent: '1250', deposit: '2500', type: 'transitorio', notes: 'nuova nota' };
  ok('dati invariati (anche «ordinaria» → transitorio come nel modale, note cambiate): passa', paperTermsChanged(c, same).length === 0);
  ok('canone e scadenza cambiati: bloccato e detto', paperTermsChanged(c, { ...same, rent: '1900', endDate: '2031-12-31' }).join() === 'scadenza,canone');
  ok('inquilino, immobile, tipo: bloccati', paperTermsChanged(c, { ...same, tenantId: 't2', propertyId: 'p9', type: 'studenti' }).join() === 'immobile,inquilino,tipo');
  ok('senza firma su carta la guardia tace', paperTermsChanged({ ...c, paperSigned: undefined }, { ...same, rent: '1900' }).length === 0);
  const u0 = src.indexOf('    async function updateContract(e, id) {');
  const up = src.slice(u0, src.indexOf('\n    }\n', src.indexOf(".doc(id).update(updatePayload)", u0)));
  ok('updateContract: la guardia sta PRIMA della scrittura', up.indexOf('paperTermsChanged(_existingContract, data)') > 0
    && up.indexOf('paperTermsChanged(_existingContract, data)') < up.indexOf(".doc(id).update(updatePayload)"));
}

console.log(`\n${failed ? '✗' : '✓'} ownerpaper: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:\n - ' + bad.join('\n - ')); process.exit(1); }
