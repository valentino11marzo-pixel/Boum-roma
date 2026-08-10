// tests/tempo/run.mjs — IL TEMPO VERO, NON PIÙ km×4.2+10.
//
// Per anni le pagine hanno mostrato "≈ km in linea d'aria × 4.2 + 10 min
// door-to-door": un numero inventato, sbagliato a caso perché Roma è
// anisotropa — lungo la metro A voli, in trasversale no (CLAUDE.md lo
// chiamava "Ancora falso"). Questa suite difende la sostituzione:
//
//   1. il CITY PACK è sano: stazioni nel bbox di Roma, tratte plausibili,
//      interscambi veri (Colosseo è B+C dal 16/12/2025), rete CONNESSA —
//      un id sbagliato spezzerebbe il grafo in silenzio;
//   2. il MOTORE dice cose vere entro tolleranze larghe (è una stima e lo
//      dichiara): la camminata batte i mezzi sul corto, Termini→FCO prende
//      il Leonardo, Pigneto→Colosseo viaggia sulla C;
//   3. l'ONESTÀ è nel formato: ogni stima transit comincia con "≈";
//   4. le PAGINE sono cablate sul motore e la vecchia formula non esiste più
//      nella sorgente (asserito sui file, come reunion/availability-ui).
//
//   node tests/tempo/run.mjs

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);

const RT = require('../../js/roma-transit.js');
const T = require('../../js/tempo-engine.js');
const PACK = RT.PACK;

let pass = 0, fail = 0;
const ok = (c, what) => { if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); } };

const stationIndex = {};
PACK.lines.forEach((L) => L.stops.forEach((s) => {
  if (!stationIndex[s[0]]) stationIndex[s[0]] = { label: s[1], lat: s[2], lng: s[3], lines: [] };
  stationIndex[s[0]].lines.push(L.id);
}));
const at = (id) => ({ lat: stationIndex[id].lat, lng: stationIndex[id].lng });

console.log('\n▸ il city pack: Roma descritta come dati, senza invenzioni');
ok(PACK.city === 'Roma' && /^\d{4}-\d{2}$/.test(PACK.version), `city + version dichiarate (${PACK.version})`);
ok(PACK.lines.length >= 12, `almeno 12 linee (${PACK.lines.length})`);

const HOPMAX = { metro: 4.5, tram: 4.5, rail: 9, express: 30 };
let hopBad = 0, bboxBad = 0, dupBad = 0, colorBad = 0, svcBad = 0;
PACK.lines.forEach((L) => {
  if (!/^#[0-9A-Fa-f]{6}$/.test(L.color)) colorBad++;
  if (!(L.headwayMin >= 2 && L.headwayMin <= 30 && L.speedKmh >= 8 && L.speedKmh <= 60)) svcBad++;
  const seen = new Set();
  L.stops.forEach((s) => { if (seen.has(s[0])) dupBad++; seen.add(s[0]);
    if (!(s[2] > 41.70 && s[2] < 42.00 && s[3] > 12.20 && s[3] < 12.75)) bboxBad++; });
  for (let i = 0; i < L.stops.length - 1; i++) {
    const km = T.hav(L.stops[i][2], L.stops[i][3], L.stops[i + 1][2], L.stops[i + 1][3]);
    if (!(km >= 0.15 && km <= (HOPMAX[L.kind] || 4.5))) { hopBad++; console.log(`      tratta sospetta: ${L.id} ${L.stops[i][0]}→${L.stops[i + 1][0]} ${km.toFixed(2)}km`); }
  }
});
ok(bboxBad === 0, 'ogni fermata dentro il bbox di Roma');
ok(hopBad === 0, 'ogni tratta tra 150m e il tetto del suo mezzo (metro/tram 4.5km, rail 9, express 30)');
ok(dupBad === 0, 'nessuna fermata ripetuta dentro una linea');
ok(colorBad === 0 && svcBad === 0, 'colori hex e frequenze/velocità plausibili');

let linkBad = 0;
(PACK.links || []).forEach(([a, b, w]) => {
  if (!stationIndex[a] || !stationIndex[b]) { linkBad++; return; }
  const km = T.hav(stationIndex[a].lat, stationIndex[a].lng, stationIndex[b].lat, stationIndex[b].lng);
  if (!(w >= 1 && w <= 12 && km <= 0.8)) linkBad++;
});
ok(linkBad === 0, 'corrispondenze a piedi: stazioni esistenti, ≤800m, 1–12 minuti');

console.log('\n▸ gli interscambi veri (Colosseo B+C esiste dal 16/12/2025)');
const has = (st, li) => stationIndex[st] && stationIndex[st].lines.includes(li);
ok(has('termini', 'MA') && has('termini', 'MB'), 'Termini = A + B');
ok(has('san-giovanni', 'MA') && has('san-giovanni', 'MC'), 'San Giovanni = A + C');
ok(has('colosseo', 'MB') && has('colosseo', 'MC'), 'Colosseo = B + C (aperta dic 2025)');
ok(has('bologna', 'MB') && has('bologna', 'MB1'), 'Bologna = B + B1');
ok(has('trastevere-fs', 'T8') && has('trastevere-fs', 'FL1') && has('trastevere-fs', 'FL3'), 'Stazione Trastevere = tram 8 + FL1 + FL3');
ok(has('valle-aurelia', 'MA') && has('valle-aurelia', 'FL3'), 'Valle Aurelia = A + FL3');
ok(has('tiburtina', 'MB') && has('tiburtina', 'FL1'), 'Tiburtina = B + FL1');
ok(has('fco', 'FL1') && has('fco', 'LEX'), 'Fiumicino = FL1 + Leonardo Express');
ok(has('pigneto', 'MC'), 'Pigneto ha la sua fermata C');

console.log('\n▸ le ancore di una vita romana');
const aIds = new Set(PACK.anchors.map((a) => a.id));
ok(aIds.size === PACK.anchors.length && PACK.anchors.length >= 12, `ancore uniche e sufficienti (${PACK.anchors.length})`);
['sapienza', 'luiss', 'roma-tre', 'john-cabot', 'lumsa'].forEach((u) =>
  ok(aIds.has(u), `l'ancora storica "${u}" resta (le pagine esistenti la usano)`));
ok(PACK.anchors.every((a) => a.lat > 41.70 && a.lat < 42.00 && a.perWeek >= 1), 'ancore nel bbox, frequenza ≥1');
ok(Array.isArray(PACK.notices) && PACK.notices.some((n) => /tram/i.test(n)), 'l\'avviso onesto sui tram 2026 sta nei DATI, non nel codice');

console.log('\n▸ serializzazione per le mappe');
const gj = RT.toGeoJSON();
ok(gj.lines.features.length === PACK.lines.length, 'una LineString per linea');
ok(gj.stations.features.length === Object.keys(stationIndex).length, 'una stazione = un punto (dedup su id condivisi)');
const tf = gj.stations.features.find((f) => f.properties.id === 'termini');
ok(tf && tf.properties.lines.length >= 3, 'Termini elenca le sue linee');

console.log('\n▸ il grafo è UNO: rete connessa (un id sbagliato la spezzerebbe)');
const G = T.buildGraph(PACK);
const nSt = Object.keys(G.stations).length;
ok(nSt >= 90, `stazioni nel grafo (${nSt})`);
const reach = T.reachFrom(G, at('termini'));
const arrived = Object.keys(reach.arrive).length;
ok(arrived / nSt >= 0.95, `da Termini si arriva al ${Math.round(arrived / nSt * 100)}% delle stazioni (≥95%)`);
['jonio', 'eur-fermi', 'mirti', 'lido-centro', 'monte-mario', 'fco', 'pantano', 'mancini'].forEach((id) =>
  ok(reach.arrive[id] != null, `…inclusa ${id} (${reach.arrive[id] != null ? reach.arrive[id] + '′' : 'IRRAGGIUNGIBILE'})`));
ok(reach.arrive['colosseo'] < reach.arrive['anagnina'], 'più lontano = più minuti (Colosseo < Anagnina)');

console.log('\n▸ verità note, con tolleranze da stima dichiarata');
const p1 = T.plan(at('termini'), at('colosseo'), G);
ok(p1.mode === 'transit' && p1.min >= 5 && p1.min <= 20, `Termini→Colosseo coi mezzi, 5–20′ (${p1.min}′)`);
ok(p1.min < p1.walkMin, '…e più veloce della camminata');
const p2 = T.plan(at('battistini'), at('anagnina'), G);
ok(p2.mode === 'transit' && p2.min >= 25 && p2.min <= 60, `Battistini→Anagnina 25–60′ (${p2.min}′)`);
ok(p2.rides.length === 1 && p2.rides[0].short === 'A', '…tutta sulla A, senza cambi fantasiosi');
const p3 = T.plan(at('lepanto'), at('termini'), G);
ok(p3.mode === 'transit' && p3.min >= 8 && p3.min <= 25 && p3.rides[0].short === 'A', `Lepanto→Termini sulla A (${p3.min}′)`);
const p4 = T.plan(at('piramide'), at('eur-fermi'), G);
ok(p4.mode === 'transit' && p4.min >= 8 && p4.min <= 25 && p4.rides.some((r) => r.short === 'B'), `Piramide→EUR Fermi sulla B (${p4.min}′)`);
const p5 = T.plan(at('pigneto'), at('colosseo'), G);
ok(p5.mode === 'transit' && p5.min >= 6 && p5.min <= 25 && p5.rides.some((r) => r.short === 'C'), `Pigneto→Colosseo sulla C — la notizia di dicembre 2025 (${p5.min}′)`);
const pFco = T.plan(at('termini'), at('fco'), G);
ok(pFco.mode === 'transit' && pFco.min >= 25 && pFco.min <= 55, `Termini→FCO 25–55′ (${pFco.min}′)`);
ok(pFco.rides.some((r) => r.short === 'LEX'), '…col Leonardo Express, non con giri assurdi');

const trast = PACK.anchors.find((a) => a.id === 'trastevere');
const jcu = PACK.anchors.find((a) => a.id === 'john-cabot');
const pw = T.plan(trast, jcu, G);
ok(pw.mode === 'walk' && pw.min <= 15, `Trastevere→John Cabot si fa A PIEDI (${pw.min}′): il corto non prende mai i mezzi`);
const psl = T.plan({ lat: 41.8993, lng: 12.5147 }, PACK.anchors.find((a) => a.id === 'sapienza'), G);
ok(psl.mode === 'walk' && psl.min <= 14, `San Lorenzo→Sapienza a piedi (${psl.min}′)`);

console.log('\n▸ determinismo e simmetria (una stima instabile non è una stima)');
const s1 = JSON.stringify(T.plan(at('cipro'), at('cinecitta'), G));
const s2 = JSON.stringify(T.plan(at('cipro'), at('cinecitta'), G));
ok(s1 === s2, 'stesso input → stesso identico output');
const ab = T.plan(at('termini'), at('cinecitta'), G).min, ba = T.plan(at('cinecitta'), at('termini'), G).min;
ok(Math.abs(ab - ba) <= 3, `andata≈ritorno entro 3′ (${ab}′ vs ${ba}′)`);

console.log('\n▸ l\'onestà è nel formato');
ok(/^≈\d+′ · /.test(T.label(p3)), `ogni stima transit comincia con ≈ e nomina la linea ("${T.label(p3)}")`);
ok(/walk$/.test(T.label(pw)) && !/≈/.test(T.label(pw)), `la camminata è misurabile, niente ≈ ("${T.label(pw)}")`);
ok(T.trace(p3).some((l) => /Metro A/.test(l)), 'trace() nomina la linea per esteso');
const pDoor = T.plan({ lat: 41.8956, lng: 12.4722 }, PACK.anchors.find((a) => a.id === 'sapienza'), G);
ok(pDoor.legs.some((l) => l.kind === 'walk'), 'un piano PORTA-a-porta ha le gambe: 🚶 in testa o in coda');
ok(T.fmtWeekly(125) === '2h 05′' && T.fmtWeekly(45) === '45′', 'formato ore/settimana');

console.log('\n▸ le ore della tua vita, per settimana');
const wk = T.weekly(G, at('lepanto'), [
  { ...PACK.anchors.find((a) => a.id === 'sapienza'), perWeek: 5 },
  { ...PACK.anchors.find((a) => a.id === 'fco'), perWeek: 1 },
]);
const exp = wk.per[0].plan.min * 10 + wk.per[1].plan.min * 2;
ok(wk.weekMin === exp, `Σ andata+ritorno × frequenza (${T.fmtWeekly(wk.weekMin)}/sett)`);
ok(wk.per.every((x) => x.plan && x.weekMin > 0), 'ogni ancora porta il suo piano e il suo peso');

console.log('\n▸ le pagine sono cablate sul motore — e la vecchia formula non esiste più');
const src = (f) => (existsSync(new URL(`../../${f}`, import.meta.url)) ? readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8') : '');
['skyline.html', 'apartments.html', 'apartment-detail.html', 'match.html', 'tempo.html'].forEach((f) => {
  const s = src(f);
  ok(s.includes('/js/roma-transit.js') && s.includes('/js/tempo-engine.js'), `${f} carica pack + motore`);
  ok(s.includes('BOOM_TEMPO'), `${f} usa BOOM_TEMPO`);
});
ok(!src('apartment-detail.html').includes('4.2+10'), 'apartment-detail: km×4.2+10 rimosso dalla sorgente');
ok(!src('match.html').includes('12 + km/18*60') || src('match.html').includes('BOOM_TEMPO'), 'match: la stima piatta resta solo come paracadute dietro il motore');
const tempoSrc = src('tempo.html');
ok(tempoSrc.includes('/api/listings') && tempoSrc.includes('reachFrom'), 'tempo.html: catalogo vero + aloni di raggiungibilità');
ok(src('sitemap.xml').includes('boomrome.com/tempo'), 'la Mappa del Tempo è nel sitemap');

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
