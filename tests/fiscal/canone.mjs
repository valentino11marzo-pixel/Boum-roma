// tests/fiscal/canone.mjs — il motore del canone concordato, blindato.
// Motore PURO (js/canone-engine.js): niente rete, niente stub. Copre le
// regole dell'accordo che decidono SOLDI e ASSEVERABILITÀ: superficie
// convenzionale coi coefficienti ufficiali, scelta della fascia dai
// parametri, la regola del cap (gli aumenti non superano il massimo di
// fascia, le riduzioni sì), il match zona che non tira a indovinare, i
// parametri derivati SOLO da feature reali, e il verdetto fits/fuori.
// Uso: node tests/fiscal/canone.mjs
import E from '../../js/canone-engine.js';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const near = (a, b) => Math.abs(a - b) < 0.01;

// ═══ 1. Superficie convenzionale (coefficienti ufficiali) ═══
{
  check('sc: 45 mq → ×1,30 col tetto 52,90', near(E.supConv({ mq: 45 }).total, 52.90));
  check('sc: 40 mq → ×1,30 = 52,00 (sotto il tetto)', near(E.supConv({ mq: 40 }).total, 52.00));
  check('sc: 60 mq → ×1,15 = 69,00', near(E.supConv({ mq: 60 }).total, 69.00));
  check('sc: 62 mq → ×1,15 col tetto 70,00', near(E.supConv({ mq: 62 }).total, 70.00));
  check('sc: 80 mq → ×1,00', near(E.supConv({ mq: 80 }).total, 80.00));
  const p = E.supConv({ mq: 80, mqBal: 8, mqBox: 10, boxPre: true, mqPC: 5, mqVe: 20 });
  check('sc: pertinenze (bal ×0,25, box pregiato ×0,80, pc ×0,20, verde ×0,10)',
    near(p.total, 80 + 8 * 0.25 + 10 * 0.80 + 5 * 0.20 + 20 * 0.10));
}

// ═══ 2. Fascia dai parametri + alloggio normale ═══
const Z = E.matchZone('B14'); // TRASTEVERE: A 12.6–15.4 · B 15.4–22.0 · C 22.0–26.4
{
  check('zona: B14 = TRASTEVERE', Z && Z.nome === 'TRASTEVERE');
  const a = E.computeCanone({ zona: Z, mq: 80, parIdx: [1, 2], tipo: 'stud' });
  check('2 parametri → FASCIA A', a.fascia === 'A' && near(a.cMax, 15.4 * 80));
  const b = E.computeCanone({ zona: Z, mq: 80, parIdx: [1, 2, 3], tipo: 'stud' });
  check('3 parametri → FASCIA B (soglia sMed=3)', b.fascia === 'B' && near(b.cMax, 22.0 * 80));
  const c = E.computeCanone({ zona: Z, mq: 80, parIdx: [0, 1, 2, 3, 4, 5, 6], tipo: 'stud' });
  check('7 parametri → FASCIA C (soglia sMax=7)', c.fascia === 'C' && near(c.cMax, 26.4 * 80));
  const nn = E.computeCanone({ zona: Z, mq: 80, parIdx: [0, 1, 2, 3, 4, 5, 6], normale: false, tipo: 'stud' });
  check('NON normale → FASCIA A anche con 7 parametri', nn.fascia === 'A');
}

// ═══ 3. La regola del cap: aumenti mai oltre il max di fascia ═══
{
  const t = E.computeCanone({ zona: Z, mq: 80, parIdx: [1, 2, 3], tipo: 'trans' });
  check('transitorio +10% ma CAP al massimo di fascia', near(t.cMax, 22.0 * 80) && t.capApplied === true && t.pct === 10);
  const s = E.computeCanone({ zona: Z, mq: 80, parIdx: [1, 2, 3], tipo: 'stud' });
  check('studenti: NESSUN +10% automatico', s.pct === 0);
  const r = E.computeCanone({ zona: Z, mq: 80, parIdx: [1, 2, 3], tipo: 'stud', mag: ['asc'] });
  check('riduzione (senza ascensore −10%) SI applica sotto il max', near(r.cMax, 22.0 * 80 * 0.90) && r.capApplied === false);
  const arr0 = E.computeCanone({ zona: Z, mq: 80, parIdx: [1, 2, 3], tipo: 'stud', mag: ['arr'] });
  check('ammobiliato con pArr non calibrato (0) → nessun effetto', arr0.pct === 0);
  const arr15 = E.computeCanone({ zona: Z, mq: 80, parIdx: [1, 2, 3], tipo: 'stud', mag: ['arr'], cfg: { pArr: 15 } });
  check('ammobiliato con pArr=15 configurato → +15% (cappato)', arr15.pct === 15 && near(arr15.cMax, 22.0 * 80));
}

// ═══ 4. Match zona: preciso o niente ═══
{
  check('match: testo con la zona dentro', E.matchZone('Trastevere Loft, Via della Lungaretta')?.cod === 'B14');
  check('match: PARIOLI → C1', E.matchZone('Parioli')?.cod === 'C1');
  check('match: "SALARIO" ambiguo (3 zone) → null, mai indovinare', E.matchZone('SALARIO') === null);
  check('match: spazzatura → null', E.matchZone('xyz') === null && E.matchZone('') === null);
}

// ═══ 5. Parametri derivati SOLO da feature reali ═══
{
  const d = E.deriveParametri(['elevator', 'ac', 'balcony', 'double_glazing', 'washing_machine']);
  check('derive: ascensore(6)+aria(5)+balcone(3)+doppi vetri(9), lavatrice ignorata',
    JSON.stringify(d.parIdx) === JSON.stringify([3, 5, 6, 9]));
  const m = E.deriveMaggiorazioni({ furnished: true, energyClass: 'E', floorText: 'attico' }, { pArr: 0 });
  check('derive magg: classe E→clD, attico→att; ammobiliato NO se pArr=0',
    m.mag.includes('clD') && m.mag.includes('att') && !m.mag.includes('arr'));
}

// ═══ 6. solve: il verdetto onesto ═══
{
  const inF = E.solve({ zonaText: 'TRASTEVERE', mq: 78, canone: 1450, tipo: 'stud', features: ['elevator', 'ac', 'balcony'] });
  check('solve: 1450 su max ' + inF.cMax.toFixed(0) + ' → RIENTRA', inF.fits === true && inF.fascia === 'B');
  const out = E.solve({ zonaText: 'PIGNETO', mq: 50, canone: 1400, tipo: 'stud', features: ['elevator', 'ac', 'balcony'] });
  check('solve: fuori fascia → fits=false con sforamento esatto, mai nascosto',
    out.fits === false && out.excess > 0 && near(out.canone - out.excess, out.cMax));
  const nz = E.solve({ zonaText: 'ATLANTIDE', mq: 50, canone: 1000 });
  check('solve: zona ignota → errore, nessun numero inventato', nz.ok === false && nz.error === 'zona_non_trovata');
}

console.log('\n' + '─'.repeat(48));
console.log(`Canone concordato: ${passed} passed, ${failed} failed`);
if (failed) { console.error('FAILED: ' + bad.join(' | ')); process.exit(1); }
console.log('La fascia di oscillazione si comporta come l\'accordo.');
