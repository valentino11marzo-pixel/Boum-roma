// tests/bonifico/run.mjs
// IL BONIFICO GRATUITO — la corsia a margine zero. Perché funzioni davvero,
// una cosa deve reggere: il movimento che arriva in banca dev'essere abbinato
// alla rata giusta SENZA che nessuno ci metta le mani.
//
// Qui si verificano il codice della causale (api/payments/_ref.js) e la via
// esatta aggiunta a reconcile() — comprese le banche che riscrivono la
// causale a modo loro, e il caso pericoloso: codice giusto, importo sbagliato.
//
//   node tests/bonifico/run.mjs

import { payRef, payCausale, findByRef } from '../../api/payments/_ref.js';
import { reconcile } from '../../api/banking/_lib.js';

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const P = (id, over = {}) => ({
  id, amount: 1200, dueDate: '2026-09-05', month: '2026-09',
  tenantId: 'u1', status: 'pending', ...over,
});
const TX = (over = {}) => ({
  side: 'in', bookingDate: '2026-09-03', amount: 1200,
  description: '', counterparty: '', ...over,
});

// ═══ 1 · Il codice ═════════════════════════════════════════════════════════
console.log('\n\x1b[1mIl codice nella causale\x1b[0m');
const r1 = payRef('pay_ctr9_2026-09');
check('ha la forma BOOM-XXXXXX', /^BOOM-[A-Z0-9]{6}$/.test(r1), r1);
check('è stabile: stessa rata → stesso codice', payRef('pay_ctr9_2026-09') === r1);
check('rate diverse → codici diversi', payRef('pay_ctr9_2026-10') !== r1);
check('senza id → null', payRef('') === null && payRef(null) === null);
check('niente caratteri sosia (I O 0 1)', !/[IO01]/.test(r1.slice(5)), r1);

// Nessuna collisione su un catalogo realistico di rate.
const many = new Set();
for (let c = 0; c < 40; c++) for (let m = 1; m <= 12; m++) {
  many.add(payRef(`pay_ctr${c}_2026-${String(m).padStart(2, '0')}`));
}
check('480 rate → 480 codici distinti', many.size === 480, String(many.size));

console.log('\n\x1b[1mLa causale suggerita\x1b[0m');
const c1 = payCausale(P('pay_ctr9_2026-09'));
check('porta codice e periodo', c1.includes(payRef('pay_ctr9_2026-09')) && c1.includes('2026-09'), c1);
check('regge una rata senza mese', payCausale({ id: 'x', dueDate: '2026-11-05' }).includes('2026-11'));

// ═══ 2 · Le banche riscrivono la causale ═══════════════════════════════════
console.log('\n\x1b[1mCome la causale torna dalla banca\x1b[0m');
const pays = [P('pay_a_2026-09'), P('pay_b_2026-10', { amount: 1200, dueDate: '2026-10-05', month: '2026-10' })];
const ra = payRef('pay_a_2026-09');
for (const [label, text] of [
  ['identica',                     ra],
  ['minuscola',                    ra.toLowerCase()],
  ['con spazi dentro',             ra.replace('-', ' - ')],
  ['annegata nel testo',           `BONIFICO SEPA DA ROSSI ANNA CAUSALE ${ra} CANONE SETTEMBRE`],
  ['senza trattino',               ra.replace('-', '')],
  ['con punti in mezzo',           ra.split('').join('.')],
]) {
  check(`causale ${label} → trova la rata`, (findByRef(text, pays) || {}).id === 'pay_a_2026-09', text.slice(0, 40));
}
check('causale senza codice → nessuna rata', findByRef('BONIFICO DA ROSSI ANNA AFFITTO', pays) === null);
check('testo troppo corto → nessuna rata', findByRef('AFFITTO', pays) === null);

// ═══ 3 · reconcile(): la via esatta ════════════════════════════════════════
console.log('\n\x1b[1mAbbinamento certo invece che per indizi\x1b[0m');
let out = reconcile(TX({ description: `Bonifico ${ra} canone 2026-09`, counterparty: 'ROSSI ANNA' }), pays, {});
check('col codice: match immediato', out.match && out.match.paymentId === 'pay_a_2026-09');
check('…e la confidenza dice perché', out.match.confidence === 'reference', String(out.match && out.match.confidence));

// Il caso pericoloso: codice giusto, cifra sbagliata (acconto, errore).
out = reconcile(TX({ amount: 600, description: `Acconto ${ra}` }), pays, {});
check('codice giusto ma importo sbagliato → NON segna pagata',
  out.match === null, JSON.stringify(out.match));
check('…diventa un suggerimento per te', out.suggestions.includes('pay_a_2026-09'));

// Due rate dello stesso importo: senza codice reconcile rinviava a un umano.
// Col codice, decide.
console.log('\n\x1b[1mDue rate identiche nello stesso periodo\x1b[0m');
const gemelle = [
  P('pay_x_2026-09', { amount: 1200, dueDate: '2026-09-05' }),
  P('pay_y_2026-09', { amount: 1200, dueDate: '2026-09-05', tenantId: 'u2' }),
];
out = reconcile(TX({ description: 'BONIFICO AFFITTO SETTEMBRE' }), gemelle, {});
check('senza codice: nessun match, due candidati', out.match === null && out.suggestions.length === 2);
out = reconcile(TX({ description: `pagamento ${payRef('pay_y_2026-09')}` }), gemelle, {});
check('col codice: sceglie quella giusta', out.match && out.match.paymentId === 'pay_y_2026-09');

// ═══ 4 · Le vecchie euristiche non si sono rotte ═══════════════════════════
console.log('\n\x1b[1mIl comportamento di prima è intatto\x1b[0m');
out = reconcile(TX({ description: 'BONIFICO DA ROSSI ANNA', counterparty: 'ROSSI ANNA' }),
                [P('pay_solo_2026-09', { tenantName: 'Anna Rossi' })], { u1: 'Anna Rossi' });
check('abbina ancora sul nome', out.match && out.match.confidence === 'name', JSON.stringify(out.match));
out = reconcile(TX({ description: 'canone 2026-09' }), [P('pay_solo_2026-09')], {});
check('abbina ancora sul mese', out.match && ['month', 'unique-amount'].includes(out.match.confidence),
  JSON.stringify(out.match));
out = reconcile(TX({ side: 'out', amount: -1200 }), pays, {});
check('un\'uscita non è mai un incasso', out.match === null);
out = reconcile(TX({ amount: 999, description: 'niente' }), pays, {});
check('importo che non corrisponde a nulla → niente', out.match === null && out.suggestions.length === 0);

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mIl bonifico si abbina da solo, e non segna pagato ciò che non lo è.\x1b[0m');
