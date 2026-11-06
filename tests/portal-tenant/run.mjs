// Il caricamento dell'inquilino nel portal (loadDataScoped, il VERO codice
// estratto da js/portal-app.js): una casa che le regole gli negano non deve
// far cadere contratti e pagamenti.
//
// Il caso vero (6/11/2026): Miss Thao, Via Vittoria 69. Contratto appena nato
// dalla proposta, immobile non ancora affittato a lei (currentContractId
// assente o del contratto precedente). La query `in` sugli id delle case
// veniva negata per intero, e con lei tutto il caricamento: «Missing or
// insufficient permissions», «No Active Lease», nessuna rata da pagare.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
function extract(src, name) {
  const m = new RegExp('(?:async )?function ' + name + '\\(').exec(src);
  if (!m) throw Error('manca ' + name);
  let i = src.indexOf('{', m.index), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && !--depth) return src.slice(m.index, i + 1); }
  throw Error('non chiusa ' + name);
}
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('PASS ' + m); };

function denied() { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; }

// Firestore finto con la REGOLA delle case per l'inquilino (firestore.rules,
// match /properties): leggibile solo se currentContractId è un suo contratto.
// Una query su più case è negata se ANCHE UNA non è ammessa.
function fakeDb(data, uid, opts = {}) {
  const canReadProperty = (p) => p && p.currentContractId && (data.contracts[p.currentContractId] || {}).tenantId === uid;
  const snap = (rows) => ({ docs: rows.map(([id, d]) => ({ id, exists: true, data: () => ({ ...d }) })) });
  const query = (col, filters = []) => ({
    where(field, op, value) { return query(col, filters.concat([[field, op, value]])); },
    limit() { return this; },
    async get() {
      const rows = Object.entries(data[col] || {}).filter(([id, d]) => filters.every(([f, op, v]) => {
        const val = f === '__id__' ? id : d[f];
        return op === 'in' ? v.includes(val) : val === v;
      }));
      if (col === 'properties' && rows.some(([, d]) => !canReadProperty(d))) throw denied();
      return snap(rows);
    },
    doc(id) {
      return { async get() {
        if (col === 'properties' && opts.propertyError) throw opts.propertyError;
        const d = (data[col] || {})[id];
        if (col === 'properties' && d && !canReadProperty(d)) throw denied();
        return d ? { id, exists: true, data: () => ({ ...d }) } : { id, exists: false, data: () => undefined };
      } };
    },
  });
  return { collection: (col) => query(col) };
}

function run(src, data, opts = {}) {
  const code = ['fetchReadableByIds', 'fetchWhereInChunked', 'loadDataScoped'].map(f => extract(src, f)).join('\n');
  const status = [];
  const ctx = {
    S: { profile: { id: 'thao', role: 'tenant' }, conversations: [], messages: [] },
    db: fakeDb(data, 'thao', opts),
    firebase: { firestore: { FieldPath: { documentId: () => '__id__' } } },
    isLandlord: () => false,
    portalSourceStatus: (k, v) => status.push(k + ':' + v),
    cacheData() {}, checkAlerts() {}, portalDataRender() {},
    performance: { now: () => 0 }, console: { log() {}, warn() {}, error() {} },
    Promise, Array, Set, Date, Error,
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.go = () => loadDataScoped(false, 0, () => true);', ctx);
  return ctx.go().then(r => ({ r, S: ctx.S, status }));
}

const base = () => ({
  contracts: { c_thao: { tenantId: 'thao', propertyId: 'p_vittoria', status: 'active', startDate: '2026-10-01' } },
  properties: { p_vittoria: { address: 'Via Vittoria 69', currentContractId: 'c_prev' } },
  payments: { pay_c_thao_2026_11: { tenantId: 'thao', contractId: 'c_thao', amount: 2000, status: 'pending', dueDate: '2026-11-05' } },
  maintenance: {}, documents: {}, conversations: {}, messages: {},
});
const withPrev = (d) => { d.contracts.c_prev = { tenantId: 'someone_else', propertyId: 'p_vittoria' }; return d; };

// 1. La casa non è ancora sua: contratti e pagamenti arrivano lo stesso.
{
  const { r, S, status } = await run(SRC, withPrev(base()));
  ok(r && r.ok === true, 'casa negata: il caricamento riesce');
  ok(S.contracts.length === 1 && S.contracts[0].id === 'c_thao', 'casa negata: il contratto c\'è (niente «No Active Lease» per un errore)');
  ok(S.payments.length === 1 && S.payments[0].amount === 2000, 'casa negata: la rata di novembre c\'è');
  ok(S.properties.length === 0, 'casa negata: la casa manca e basta');
  ok(status.includes('core:live') && !status.includes('core:error'), 'casa negata: «Dati principali» non va in errore');
}
// 2. Casa affittata a lei: si legge.
{
  const d = base(); d.properties.p_vittoria.currentContractId = 'c_thao';
  const { S } = await run(SRC, d);
  ok(S.properties.length === 1 && S.properties[0].address === 'Via Vittoria 69', 'casa sua: letta');
}
// 3. Un guasto che NON è un permesso negato risale come prima (mai un
//    caricamento «riuscito» a rete giù).
{
  const e = new Error('unavailable'); e.code = 'unavailable';
  let threw = false; try { await run(SRC, withPrev(base()), { propertyError: e }); } catch (x) { threw = x.code === 'unavailable'; }
  ok(threw, 'rete giù sulla casa: l\'errore risale');
}
// Mutazioni: la vecchia query `in` e il catch che inghiotte tutto.
{
  const old = SRC.replace(/fetchReadableByIds\('properties', propIds\)/,
    "db.collection('properties').where(firebase.firestore.FieldPath.documentId(), 'in', propIds).get({ source: 'server' }).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))");
  assert.notEqual(old, SRC);
  let threw = false; try { await run(old, withPrev(base())); } catch (x) { threw = x.code === 'permission-denied'; }
  ok(threw, 'mutazione: con la query `in` di prima la casa negata fa cadere tutto (il guasto di Thao)');
  const swallow = SRC.replace("if (e && e.code === 'permission-denied') return null; throw e;", 'return null;');
  assert.notEqual(swallow, SRC);
  const e = new Error('unavailable'); e.code = 'unavailable';
  let threw2 = false; try { await run(swallow, withPrev(base()), { propertyError: e }); } catch { threw2 = true; }
  ok(!threw2, 'mutazione: un catch che inghiotte tutto nasconderebbe la rete giù (il check 3 lo prende)');
}
console.log(`Portal inquilino: ${n} controlli passati`);
