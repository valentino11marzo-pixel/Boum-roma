// tests/journey/steps.mjs
// Le email del journey partono da sole, verso clienti veri, senza che nessuno
// le rilegga. Qui blindiamo LE REGOLE COMMERCIALI decise dall'operatore —
// non l'estetica: quando ogni messaggio parte, e soprattutto cosa NON deve
// contenere.
//
//   node tests/journey/steps.mjs

import { steps } from '../../api/journey/_run.js';

// ── helper: costruisce lo stato a N giorni dall'inizio (o dalla fine) ──────
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (days) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return iso(d); };

function fire({ startIn, endIn, bought = [], missing = null, late = false }) {
  const c = {
    startDate: startIn != null ? shift(startIn) : null,
    endDate: endIn != null ? shift(endIn) : null,
  };
  const all = steps({
    c,
    tenant: { email: 'anna@example.com', name: 'Anna Rossi' },
    addrShort: 'Via Cavour',
    addr: 'Via Cavour 12, Roma',
    first: 'Anna',
    has: (kind) => bought.includes(kind),
    missing, late,
  });
  return all.filter((s) => s.due);
}

const one = (opts) => { const f = fire(opts); return f.length === 1 ? f[0] : null; };

let pass = 0, fail = 0;
function check(label, cond, extra) {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
}

// ═══ 1 · Ogni tappa parte quando deve, e una sola alla volta ═══════════════
console.log('\n\x1b[1mQuando parte ogni messaggio\x1b[0m');
check('T-30 · benvenuto',            one({ startIn: 28, endIn: 393 })?.key === 't30');
check('T-14 · documenti/utenze',     one({ startIn: 12, endIn: 377 })?.key === 't14');
check('T-7  · cleaning + saldo',     one({ startIn: 6,  endIn: 371 })?.key === 't7');
check('T-1  · chiavi',               one({ startIn: 1,  endIn: 366 })?.key === 't1');
check('T+3  · recensione + casa',    one({ startIn: -4, endIn: 361 })?.key === 'p3');
check('T-90 · conferma rinnovo',     one({ startIn: -275, endIn: 87 })?.key === 'r90');
check('uscita · grazie + referral',  one({ startIn: -370, endIn: -5 })?.key === 'exit');
check('giorno neutro · nessuna mail', fire({ startIn: -100, endIn: 265 }).length === 0);

// ═══ 2 · Le regole commerciali dell'operatore ═════════════════════════════
// "a t-90 no upsell ma richiesta giusto di conferma"
// "all'uscita solo recensione e diventare referral"
// "consegna chiavi inclusa" (mai venduta)
console.log('\n\x1b[1mRegole commerciali\x1b[0m');

const r90 = one({ startIn: -275, endIn: 87 });
const exit = one({ startIn: -370, endIn: -5 });
const t1 = one({ startIn: 1, endIn: 366 });
const SELLS = /€\s?\d|buyUrl|\/api\/services\/buy|Move-in Pack|Cleaning Premium/i;

check('T-90 non vende nulla', r90 && !SELLS.test(r90.html),
  'trovato un riferimento a prezzo/prodotto nella mail di rinnovo');
check('T-90 chiede solo conferma (sì / me ne vado)',
  r90 && /renew/i.test(r90.html) && /moving out/i.test(r90.html));

check('uscita non vende nulla', exit && !SELLS.test(exit.html));
check('uscita ha recensione + referral',
  exit && /leave a review/i.test(exit.html) && /refer a friend/i.test(exit.html));

check('T-1 non vende la consegna chiavi', t1 && !SELLS.test(t1.html));
check('T-1 dice esplicitamente che è inclusa',
  t1 && /key handover is on us|included/i.test(t1.html));

// ═══ 3 · L'upsell non ripete un prodotto già comprato ══════════════════════
console.log('\n\x1b[1mProdotti già acquistati\x1b[0m');
const t30plain  = one({ startIn: 28, endIn: 393 });
const t30bought = one({ startIn: 28, endIn: 393, bought: ['movein-pack'] });
check('T-30 propone il Move-in Pack se non comprato',
  t30plain && /Add the Move-in Pack/i.test(t30plain.html));
check('T-30 NON lo ripropone se già comprato',
  t30bought && !/Add the Move-in Pack/i.test(t30bought.html));

const t7plain  = one({ startIn: 6, endIn: 371 });
const t7bought = one({ startIn: 6, endIn: 371, bought: ['cleaning-premium'] });
check('T-7 propone il Cleaning Premium se non comprato',
  t7plain && /Book Cleaning Premium/i.test(t7plain.html));
check('T-7 NON lo ripropone se già comprato',
  t7bought && !/Book Cleaning Premium/i.test(t7bought.html));

// ═══ 4 · Il bottone recensione punta dove deve ═════════════════════════════
console.log('\n\x1b[1mLink recensione\x1b[0m');
const p3 = one({ startIn: -4, endIn: 361 });
const REVIEW_OK = /https:\/\/(g\.page\/r\/[\w-]+\/review|search\.google\.com\/local\/writereview|www\.google\.com\/search)/;
for (const [label, s] of [['T+3', p3], ['uscita', exit]]) {
  const m = String(s?.html || '').match(/href="([^"]*(?:g\.page|writereview|google\.com\/search)[^"]*)"/);
  check(`${label}: il bottone recensione ha un link valido`, m && REVIEW_OK.test(m[1]),
    m ? m[1] : 'nessun link recensione trovato');
}

// ═══ 5 · Un contratto senza date non genera nulla ══════════════════════════
console.log('\n\x1b[1mDati mancanti\x1b[0m');
check('contratto senza date → nessuna mail', fire({ startIn: null, endIn: null }).length === 0);
check('solo data di fine → nessuna mail di move-in',
  !fire({ startIn: null, endIn: 87 }).some((s) => ['t30', 't14', 't7', 't1', 'p3'].includes(s.key)));

// ═══ 6 · Contratti brevi: il rinnovo non arriva prima del trasloco ═════════
// Un transitorio di 2 mesi ha già la fine a <90 giorni il giorno del move-in:
// senza la guardia dStart<0 il cliente riceverebbe "vuoi rinnovare?" prima
// ancora di avere le chiavi.
console.log('\n\x1b[1mContratti brevi\x1b[0m');
check('transitorio 2 mesi: nessun rinnovo prima del move-in',
  !fire({ startIn: 5, endIn: 66 }).some((s) => s.key === 'r90'));
check('transitorio 2 mesi: il rinnovo arriva a lease iniziato',
  fire({ startIn: -35, endIn: 25 }).some((s) => s.key === 'r90'));

// ═══ 7 · Journey consapevole: morosità e Scheda mancante ═══════════════════
// Regole: a chi ha rate scadute NON si vende (i contenuti utili restano);
// se sappiamo cosa manca, il T-14 lo chiede PER NOME col link della Scheda.
console.log('\n\x1b[1mMorosità e Scheda\x1b[0m');
const t30late = one({ startIn: 28, endIn: 393, late: true });
check('T-30 con rate scadute: NIENTE upsell', t30late && !SELLS.test(t30late.html));
const t7late = one({ startIn: 6, endIn: 371, late: true });
check('T-7 con rate scadute: niente Cleaning, resta il promemoria saldo',
  t7late && !/Book Cleaning Premium/i.test(t7late.html) && /instalment still open/i.test(t7late.html));

const SCHEDA = 'https://www.boomrome.com/scheda?t=ctr1.t.abc';
const t14miss = one({ startIn: 12, endIn: 377, missing: { identityOk: false, docsOk: false, schedaUrl: SCHEDA } });
check('T-14 con scheda incompleta: chiede per nome e porta il link /scheda',
  t14miss && t14miss.html.includes(SCHEDA) && /personal details and a photo/i.test(t14miss.html));
const t14docs = one({ startIn: 12, endIn: 377, missing: { identityOk: true, docsOk: false, schedaUrl: SCHEDA } });
check('T-14 con solo documento mancante: chiede SOLO la foto del documento',
  t14docs && t14docs.html.includes(SCHEDA) && /photo of your ID document/i.test(t14docs.html) && !/personal details and a photo/i.test(t14docs.html));
const t14ok = one({ startIn: 12, endIn: 377 });
check('T-14 con tutto a posto: dice "complete", nessun link scheda',
  t14ok && !t14ok.html.includes('/scheda?t=') && /complete/i.test(t14ok.html));

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLe email rispettano le regole commerciali decise.\x1b[0m');
