// IL MOTORE NEL BROWSER: i tre file caricati come in portal.html (niente
// `module`, tutto su `window`), il palazzo sintetico disegnato per intero.
// Nato dall'integrazione del 13/10/2026: un secondo `var CS = … : null` in
// palazzo-engine.js azzerava BOOM_CONTRACT_STATE nel browser e il Palazzo
// cadeva al primo contratto ("Cannot read properties of null"), mentre in
// Node (dove `require` risponde) tutte le suite restavano verdi.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildFixture } from './fixture.mjs';

const read = f => readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8');
let n = 0;
const ok = (label, fn) => { fn(); n++; console.log('✓ ' + label); };

function browser(engineSrc) {
  const win = { Intl, Date, Math, JSON, console, URL };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const [f, s] of [['contract-state.js', read('contract-state.js')], ['rent-engine.js', read('rent-engine.js')], ['palazzo-engine.js', engineSrc]]) {
    vm.runInContext(s, ctx, { filename: f });
  }
  return win;
}

const F = buildFixture(new Date('2026-10-13T10:00:00Z'));
const S = F.state;
const draw = (E) => {
  const ctx = E.context({ properties: S.properties, contracts: S.contracts, payments: S.payments, users: S.users, maintenance: S.maintenance, preAgreements: S.preAgreements, listings: S.listings, now: new Date('2026-10-13T10:00:00Z') });
  return E.model(ctx, '', ctx.month, {});
};

ok('nel browser il motore usa BOOM_CONTRACT_STATE e disegna il palazzo', () => {
  const w = browser(read('palazzo-engine.js'));
  const m = draw(w.BOOM_PALAZZO);
  assert.equal(m.units.length, 13);
  assert.ok(m.units.every(u => u.month && u.month.state), 'ogni interno ha lo stato del mese');
});

ok('il telefono della presa in carico passa da phoneIntl anche nel browser', () => {
  const w = browser(read('palazzo-engine.js'));
  const P = w.BOOM_PALAZZO.parseRentRoll('Interno\tInquilino\tTelefono\tCanone\tDal\tAl\n1\tMario Prova\t333 000 0001\t900\t01/10/2026\t30/09/2027');
  assert.equal(P.rows.length, 1);
});

ok('mutazione: il secondo `var CS = … : null` rimesso fa cadere il disegno', () => {
  const src = read('palazzo-engine.js').replace('  function phoneOf(v) {', "  var CS = (typeof module === 'object' && module.exports) ? require('./contract-state.js') : null;\n  function phoneOf(v) {");
  const w = browser(src);
  assert.throws(() => draw(w.BOOM_PALAZZO), /isPlaceholder|null/);
});

console.log(`\n${n} check — il motore del Palazzo come lo carica il browser.`);
