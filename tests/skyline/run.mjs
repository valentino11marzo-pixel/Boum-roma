// tests/skyline/run.mjs — SKYLINE 2.0, Roma di notte
//
// Lo Skyline 1.0 era il chrome nero-oro di BOOM sopra una carta stradale
// CHIARA e generica, e le case si sfogliavano a caccia di pin. Il 2.0 è
// la città di notte (stile riletto dal motore puro) con la PELLICOLA di
// card in basso, sincronizzata con la camera. Qui si morde:
//
//  · il motore (js/skyline-engine.js): la rilettura notturna non rompe
//    MAI uno stile (garbage compreso), spegne il rumore (POI, civici,
//    scudetti) e ricolora acqua/strade/verde/etichette; la geometria è
//    deterministica; i fili sono al massimo 6 e i TUOI posti passano
//    sempre; la corsia arriva da dispo-engine INIETTATO — closed non si
//    prenota, una data illeggibile dice «Ask us», mai «Available now».
//  · le giunzioni sulla SORGENTE di skyline.html: il ponte embed con la
//    discovery (boomTieni + controllo origin), Street View solo su pin
//    exact/street (boom-geo), l'anello d'oro SOLO su exact, la pagina
//    che resta utile anche senza mappa (pellicola prima del motore).
//
//   node tests/skyline/run.mjs

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const S = require(join(RADICE, 'js', 'skyline-engine.js'));
const D = require(join(RADICE, 'js', 'dispo-engine.js'));

let pass = 0, fail = 0;
const ok = (c, what) => { if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); } };

console.log('\n▸ la rilettura notturna — mai una mappa morta');
{
  const fx = { version: 8, layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
    { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': '#a0c8f0' } },
    { id: 'road_motorway', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': '#ffcc88' } },
    { id: 'road_minor', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': '#fff' } },
    { id: 'poi_z14', type: 'symbol', 'source-layer': 'poi', layout: {}, paint: {} },
    { id: 'housenumber', type: 'symbol', 'source-layer': 'housenumber', layout: {}, paint: {} },
    { id: 'road_shield', type: 'symbol', 'source-layer': 'transportation_name', layout: {}, paint: {} },
    { id: 'place_suburb', type: 'symbol', 'source-layer': 'place', paint: { 'text-color': '#333' } },
    { id: 'place_city', type: 'symbol', 'source-layer': 'place', paint: { 'text-color': '#333' } },
    { id: 'landuse_park', type: 'fill', 'source-layer': 'landuse', paint: { 'fill-pattern': 'grass', 'fill-color': '#c8facc' } },
    { id: 'building', type: 'fill', 'source-layer': 'building', paint: { 'fill-color': '#e0d0c0' } },
    { id: 'ignoto', type: 'tipo-marziano', paint: {} }
  ] };
  const n = S.nightStyle(fx);
  ok(n.layers[0].paint['background-color'] === S.NOTTE.bg, 'il fondo è la notte');
  ok(n.layers[1].paint['fill-color'] === S.NOTTE.water, "l'acqua è inchiostro, non celeste");
  ok(n.layers[2].paint['line-color'] === S.NOTTE.roadMajor, 'le arterie sono grafite chiara');
  ok(n.layers[3].paint['line-color'] === S.NOTTE.roadMinor, 'le vie minori quasi si spengono');
  ok(n.layers[4].layout.visibility === 'none', 'i POI (il rumore dell\'1.0) sono spenti');
  ok(n.layers[5].layout.visibility === 'none', 'i civici sono spenti');
  ok(n.layers[6].layout.visibility === 'none', 'gli scudetti stradali sono spenti');
  ok(n.layers[7].paint['text-color'] === S.NOTTE.labelZone, 'i quartieri parlano in oro spento');
  ok(n.layers[8].paint['text-color'] === S.NOTTE.labelMajor, 'la città parla in chiaro');
  ok(!('fill-pattern' in n.layers[9].paint), 'i pattern chiari non sopravvivono alla notte');
  ok(n.layers[10].paint['fill-color'] === S.NOTTE.building, 'gli edifici 2D sono scuri');
  ok(fx.layers[0].paint['background-color'] === '#f8f4f0', 'lo stile ORIGINALE non viene toccato');
  ok(S.nightStyle(null) === null && !!S.nightStyle({ layers: 'x' }), 'il garbage passa oltre, mai un lancio');
}

console.log('\n▸ la geometria è deterministica');
{
  const a = S.spreader(), b = S.spreader();
  const p1 = a([12.47, 41.89]), p2 = a([12.47, 41.89]), q1 = b([12.47, 41.89]);
  ok(p1[0] !== p2[0] || p1[1] !== p2[1], 'due case sullo stesso centroide non si coprono');
  ok(JSON.stringify(b([12.47, 41.89])) === JSON.stringify(p2) && JSON.stringify(q1) === JSON.stringify(p1),
    'due render danno gli stessi punti (spreader è una fabbrica, non uno stato globale)');
  const arco = S.arc([0, 0], [1, 1], 0.12, 32);
  ok(arco.length === 33 && arco[0][0] === 0 && arco[32][0] === 1, "l'arco parte e arriva ESATTAMENTE");
  ok(S.distLabel(1.2) === '15′ walk' && S.distLabel(5.34) === '5.3 km' && S.distLabel(14.2) === '14 km',
    'le distanze: passi vicino, km lontano — mai spacciate per percorso');
  ok(Math.abs(S.haversine([12.4924, 41.8902], [12.5018, 41.9009]) - 1.42) < 0.15,
    'Colosseo→Termini ≈ 1.4 km in linea d\'aria');
}

console.log('\n▸ i fili: i TUOI posti sempre, Roma fino a sei linee');
{
  const co = [12.49, 41.90];
  const zero = S.nearestAnchors(co, [], 6);
  ok(zero.mine.length === 0 && zero.anchors.length === 6, 'senza posti: 6 ancore di Roma');
  const due = S.nearestAnchors(co, [{ name: 'A', lng: 12.5, lat: 41.91 }, { name: 'B', lng: 12.46, lat: 41.88 }], 6);
  ok(due.mine.length === 2 && due.anchors.length === 4, 'con 2 posti: 2 + 4 = sempre 6');
  const sei = S.nearestAnchors(co, [1, 2, 3, 4, 5, 6].map((i) => ({ name: 'P' + i, lng: 12.5, lat: 41.9 })), 6);
  ok(sei.mine.length === 6 && sei.anchors.length === 2,
    'i posti non vengono MAI tagliati (sono il tuo motivo); Roma tiene un minimo di 2');
  const ord = zero.anchors.every((x, i, a) => i === 0 || a[i - 1].d <= x.d);
  ok(ord, 'le ancore arrivano dalla più vicina');
}

console.log('\n▸ la corsia arriva da dispo-engine — la stessa onestà della vetrina');
{
  const closed = S.laneFor({ status: 'rented' }, D);
  ok(closed && closed.bookable === false && closed.badge === 'Rented', 'affittata senza data: fuori mercato');
  const mute = S.laneFor({ status: 'available', availableDate: 'boh chissà' }, D, '2026-08-28');
  ok(mute && mute.badge === 'Ask us for the date', 'data illeggibile → «Ask us», MAI «Available now»');
  ok(mute && mute.badge !== 'Available now', 'il difetto storico non torna dal cielo');
  const ahead = S.laneFor({ status: 'rented', availableFrom: '2027-02-01' }, D, '2026-08-28');
  ok(ahead && ahead.lane === 'ahead' && /Free from/.test(ahead.badge),
    'affittata col rilascio da CONTRATTO → si prenota, con la data nel badge');
  ok(S.laneFor({ status: 'available' }, null) === null, 'senza motore non si indovina');
}

console.log('\n▸ il resto del motore');
ok(S.fmtEuro(1500) === '€1,500' && S.fmtEuro(950) === '€950', 'euro deterministici (mai toLocaleString)');
ok(!!S.zoneCoord({ zone: 'Pigneto' }) && S.zoneCoord({ zone: 'Marte' }) === null,
  'il centroide esiste solo per le zone vere — mai un pin inventato');
ok(S.INTRO.from.pitch === 0 && S.INTRO.to.pitch > 45, "l'arrivo: alti e piatti, poi la città si inclina");
ok(Math.abs(S.cameraFor([1, 2], 0).bearing - S.cameraFor([1, 2], 1).bearing) > 0,
  'ogni selezione ruota un poco il punto di vista');

/* ── le giunzioni sulla SORGENTE ─────────────────────────────────────── */
const sky = readFileSync(join(RADICE, 'skyline.html'), 'utf-8');

console.log('\n▸ skyline.html: le giunzioni che non devono saltare');
ok(sky.includes('/js/skyline-engine.js') && sky.includes('/js/dispo-engine.js') && sky.includes('/js/boom-geo.js'),
  'la pagina carica i tre motori (notte, corsie, precisione dei pin)');
ok(sky.includes("d.t==='boomTieni'") && sky.includes('e.origin!==location.origin'),
  'il ponte embed con la discovery è VIVO e controlla l\'origin (apartments.html lo usa)');
ok(sky.includes('embed=1') && sky.includes("_b.target='_top'"),
  'in embed i link scappano dall\'iframe (base target=_top)');
ok(/prec==='exact'\|\|h\.prec==='street'/.test(sky.replace(/\s+/g, '')),
  'Street View solo su pin exact/street — su un centroide aprirebbe una via qualunque (boom-geo)');
ok(sky.includes("h.prec!=='exact'") && sky.includes('boom-ring'),
  "l'anello d'oro sotto il palazzo SOLO su pin exact: la sagoma non si spaccia");
ok(sky.indexOf('costruisciPellicola') < sky.indexOf('bootMappa()'),
  'PRIMA il dato (la pellicola), POI la mappa: senza tiles la pagina resta utile');
ok(sky.includes('senza-mappa') && sky.includes('browse the homes below'),
  'la mappa può mancare: le case restano sfogliabili, mai un vicolo cieco');
ok(sky.includes('nightStyle') && sky.includes('tiles.openfreemap.org/styles/liberty'),
  'lo stile si scarica e si rilegge in notturno prima che la mappa nasca');
ok(sky.includes('prefers-reduced-motion') && sky.includes('RIDOTTO'),
  'chi chiede quiete ha jump invece di voli');
ok(sky.includes('cooperativeGestures:EMB'), 'nell\'iframe la rotella scorre la pagina, non lo zoom');
ok(sky.includes("localStorage.getItem('boom:pois')"),
  'i «My places» restano sulla stessa memoria del detail (boom:pois)');
ok(sky.includes('≈ ') || sky.includes("circa='≈"), 'un pin di zona porta il ≈: la precisione non si spaccia');
ok(!sky.includes('maplibregl.Popup'), 'niente più popup sopra la città: la selezione vive nella pellicola');
ok((sky.match(/render_height/g) || []).length >= 1 && sky.includes('EXTRUSION'),
  'gli edifici 3D leggono le altezze vere e la palette bronzo del motore');

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
