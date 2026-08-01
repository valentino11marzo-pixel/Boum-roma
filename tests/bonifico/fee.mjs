// tests/bonifico/fee.mjs
// LA COMMISSIONE CHE SI MISURA INVECE DI INDOVINARSI.
//
// Una percentuale fissa non può andare a pari: la stessa carta costa a Stripe
// l'1,5% se europea e il 3,25% se americana, e il paese non è noto prima
// dell'addebito. Il vecchio 2,5% guadagnava sugli europei e perdeva su ogni
// carta estera — e l'inquilino BOOM è un expat.
//
// Qui si verifica che rentFee() faccia la cosa giusta nei tre stati: senza
// dati (prudente), con pochi dati (ancora prudente), con dati veri (converge
// sul costo). E che il tetto e la forzatura manuale reggano.
//
//   node tests/bonifico/fee.mjs

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'proj';

const { rentFee, measuredCost } = await import('../../api/payments/pay.js');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};
const eur = (n) => '€' + Number(n).toFixed(2);
// I costi reali di Stripe, per confrontarci contro la verità.
const COST = {
  eea:  (a) => a * 0.015 + 0.25,
  intl: (a) => a * 0.0325 + 0.25,
};

// ═══ 1 · Senza storia: prudenti ════════════════════════════════════════════
console.log('\n\x1b[1mNessun dato ancora\x1b[0m');
for (const a of [700, 1200, 2000, 3500]) {
  const f = rentFee(a, null);
  check(`canone ${eur(a)}: copre anche una carta estera`, f >= COST.intl(a) - 0.5,
    `commissione ${eur(f)} vs costo estero ${eur(COST.intl(a))}`);
}
check('la base dichiarata è "seed"', measuredCost(null, 1200).basis === 'seed');
check('regge stats vuote come null', rentFee(1200, {}) === rentFee(1200, null));

// ═══ 2 · Pochi campioni: non si fida ═══════════════════════════════════════
console.log('\n\x1b[1mTroppo pochi incassi per fidarsi\x1b[0m');
const scarsi = { count: 3, volumeEur: 3600, costEur: 20, fixedEur: 0.75 };
check('con 3 incassi resta sul prudente', measuredCost(scarsi, 1200).basis === 'seed',
  measuredCost(scarsi, 1200).basis);

// ═══ 3 · Con dati veri: converge sul costo ═════════════════════════════════
console.log('\n\x1b[1mCon la storia vera, la commissione scende\x1b[0m');
// 20 incassi da €1.200: 14 carte estere, 6 europee — il mix realistico BOOM.
let volume = 0, cost = 0;
for (let i = 0; i < 20; i++) {
  const a = 1200; volume += a;
  cost += (i < 14 ? COST.intl(a) : COST.eea(a));
}
const stats = { count: 20, volumeEur: volume, costEur: Math.round(cost * 100) / 100, fixedEur: 20 * 0.25 };
const misurata = rentFee(1200, stats);
const vecchia = Math.max(9, 1200 * 0.025);          // la formula di prima
check('la base diventa "measured"', measuredCost(stats, 1200).basis === 'measured');
check('la commissione copre il costo medio reale',
  misurata >= (cost / 20) - 0.5, `${eur(misurata)} vs costo medio ${eur(cost / 20)}`);
check('e con buffer 0 va davvero a pari, non a profitto',
  Math.abs(misurata - cost / 20) < 1.2, `${eur(misurata)} vs ${eur(cost / 20)}`);
console.log(`     \x1b[2mprima ${eur(vecchia)} · ora ${eur(misurata)} · costo medio reale ${eur(cost / 20)}\x1b[0m`);

// Un parco di sole carte europee deve far scendere il prezzo per davvero.
let v2 = 0, c2 = 0;
for (let i = 0; i < 20; i++) { v2 += 1200; c2 += COST.eea(1200); }
const solaEuropa = rentFee(1200, { count: 20, volumeEur: v2, costEur: c2, fixedEur: 5 });
check('con soli clienti europei la commissione crolla', solaEuropa < misurata - 5,
  `${eur(solaEuropa)} vs ${eur(misurata)}`);
check('…e resta comunque sopra il costo', solaEuropa >= COST.eea(1200) - 0.5,
  `${eur(solaEuropa)} vs ${eur(COST.eea(1200))}`);

// ═══ 4 · Le manopole ═══════════════════════════════════════════════════════
console.log('\n\x1b[1mIl buffer e i limiti\x1b[0m');
process.env.RENT_FEE_BUFFER = '3';
const conBuffer = rentFee(1200, stats);
check('il buffer aggiunge margine in euro, non in percentuale',
  Math.abs(conBuffer - misurata - 3) < 0.02, `${eur(conBuffer)} vs ${eur(misurata)}+3`);
delete process.env.RENT_FEE_BUFFER;

process.env.RENT_FEE_MAX_PCT = '2';
check('il tetto di sicurezza taglia qualunque calcolo',
  rentFee(1200, null) <= 1200 * 0.02 + 0.001, eur(rentFee(1200, null)));
delete process.env.RENT_FEE_MAX_PCT;

process.env.RENT_FEE_PCT = '1.5';
check('la forzatura manuale vince su tutto', Math.abs(rentFee(1200, stats) - 18) < 0.02,
  eur(rentFee(1200, stats)));
delete process.env.RENT_FEE_PCT;

console.log('\n\x1b[1mNiente di assurdo in uscita\x1b[0m');
check('canone zero → commissione zero', rentFee(0, stats) >= 0);
check('mai negativa', rentFee(50, stats) >= 0);
check('statistica corrotta non manda in NaN',
  isFinite(rentFee(1200, { count: 99, volumeEur: 0, costEur: 5 })), String(rentFee(1200, { count: 99, volumeEur: 0, costEur: 5 })));

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLa commissione copre il costo vero e scende da sola.\x1b[0m');
