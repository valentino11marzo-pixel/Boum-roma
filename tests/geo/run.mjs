// tests/geo/run.mjs
// Lo Skyline mostrava OGNI pin come "indirizzo esatto" e la scheda offriva
// "Street View · the exact entrance" anche quando la coordinata era il
// centroide di un quartiere. La causa: le pagine leggevano `listing.geoZone`,
// un campo che nessun annuncio porta (0 su 19 in produzione il 29/07/2026),
// quindi `exact = hasCo && !geoZone` era sempre vero.
//
// La provenienza però c'era già, in `listing.geo` — scritta dal bake dei
// geocodici. Qui si verifica che venga letta bene, sulle stringhe VERE del
// catalogo: tre case del centro condividevano un centroide, e due coppie
// erano appaiate su una geocodifica del solo quartiere.
//
//   node tests/geo/run.mjs

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../../js/boom-geo.js');

let pass = 0, fail = 0;
const ok = (c, what) => { if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); } };
const lvl = (listing, want, what) => {
  const got = G.pinPrecision(listing).level;
  ok(got === want, `${what} → ${want}${got === want ? '' : `  (ottenuto "${got}")`}`);
};

const geo = (src, q) => ({ lat: 41.9181441, lng: 12.5099, geo: { src, q, at: '2026-07-07T20:47:41.492Z' } });

console.log('\n▸ i 19 annunci pubblici, con le loro stringhe geo reali');

// via + civico → il portone. Questi cinque possono mostrare coordinate e Street View.
lvl(geo('nominatim', 'Via Appennini 33, Roma'),        'exact', 'Bilocale Trieste · Via Appennini 33');
lvl(geo('nominatim', 'Via MonteCuccoli 26, Roma'),     'exact', 'Trilocale Pigneto · Via MonteCuccoli 26');
lvl(geo('nominatim', 'Via Endertà 9, Roma'),           'exact', 'Africano · Via Endertà 9');
lvl(geo('nominatim', 'Via Ettore Petrolini 30, Roma'), 'exact', 'Parioli · Via Ettore Petrolini 30');
lvl(geo('nominatim', 'Piazza Capri 46, Roma'),         'exact', 'Capri 2 Bed · Piazza Capri 46');

// via senza civico → la strada giusta, non il numero
lvl(geo('nominatim', 'Via Di Tor Di quinto, Roma'),        'street', 'Ponte Milvio Duplex · via senza civico');
lvl(geo('nominatim', 'Via in Piscinula, Roma'),            'street', 'Bilocale Trastevere · via senza civico');
lvl(geo('nominatim', 'Via Ascoli Piceno, Pigneto, Roma'),  'street', 'Pigneto Terrace · via senza civico');
lvl(geo('nominatim', 'Via Di Tor Di Quinto, Roma'),        'street', 'Bilocale Ponte Milvio · via senza civico');

// centroide dichiarato dal bake
lvl(geo('zone', 'zone:Centro'),          'zone', 'Bilocale Centro · bake di zona');
lvl(geo('zone', 'zone:Centro Storico'),  'zone', 'Coronari Classic · bake di zona');
lvl(geo('zone', 'zone:Vittorio Veneto'), 'zone', 'Piemonte Attic · bake di zona');

// il caso insidioso: src dice "nominatim" ma è stato cercato un QUARTIERE
lvl(geo('nominatim', 'Prati, Roma'),   'zone', 'Angelico Loft · geocodifica del solo quartiere');
lvl(geo('nominatim', 'Trieste, Roma'), 'zone', 'Levico · geocodifica del solo quartiere');

// nessuna coordinata
lvl({ name: 'Pigneto Palace Double Bed' }, 'none', 'senza lat/lng');
lvl({ lat: 0, lng: 0 },                    'none', 'coordinate a zero');

console.log('\n▸ il campo che non esiste non deve più decidere niente');
ok(G.pinPrecision(geo('zone', 'zone:Centro')).exact === false,
  'un centroide non è "exact" nemmeno se geoZone è assente (era il bug)');
ok(G.pinPrecision({ lat: 41.8986, lng: 12.4735, geoZone: true }).level === 'zone',
  'coordinate tonde senza provenienza → zone (i vecchi centroidi restano riconosciuti)');
ok(G.pinPrecision({ lat: 41.907, lng: 12.49 }).level === 'zone',
  'anche 3 decimali (Piemonte Attic) → zone');
ok(G.pinPrecision({ lat: 41.9181441, lng: 12.5099 }).level === 'street',
  'coordinate lunghe senza provenienza → street, non "exact": non sappiamo cosa fu cercato');

console.log('\n▸ un CAP non è un civico');
lvl(geo('nominatim', 'Via dei Coronari, 00186 Roma'), 'street', 'Via dei Coronari, 00186 → strada, non portone');
lvl(geo('nominatim', 'Via dei Coronari 181, 00186 Roma'), 'exact', 'con il civico 181 → portone');

console.log('\n▸ le parole, identiche sulle due superfici');
const c = G.pinCopy('exact');
ok(c.coords === true && c.street === true, 'exact: coordinate e Street View concessi');
const s = G.pinCopy('street');
ok(s.street === true && s.coords === false, 'street: Street View sì, chip coordinate no');
const z = G.pinCopy('zone', 'Centro Storico');
ok(z.street === false && z.coords === false, 'zone: né Street View "exact entrance" né coordinate');
ok(/Centro Storico/.test(z.note), 'zone: la nota nomina il quartiere vero');
ok(G.pinCopy('none').badge === '', 'none: nessuna etichetta da mostrare');

console.log('\n▸ il quadro del catalogo (quello che vede il radar qualità)');
const CAT = [
  geo('nominatim', 'Via Appennini 33, Roma'), geo('nominatim', 'Via MonteCuccoli 26, Roma'),
  geo('nominatim', 'Via Endertà 9, Roma'), geo('nominatim', 'Via Ettore Petrolini 30, Roma'),
  geo('nominatim', 'Piazza Capri 46, Roma'),
  geo('nominatim', 'Via Di Tor Di quinto, Roma'), geo('nominatim', 'Via in Piscinula, Roma'),
  geo('nominatim', 'Via Ascoli Piceno, Pigneto, Roma'), geo('nominatim', 'Via Di Tor Di Quinto, Roma'),
  geo('zone', 'zone:Centro'), geo('zone', 'zone:Centro Storico'), geo('zone', 'zone:Vittorio Veneto'),
  geo('zone', 'zone:Centro Storico'),
  geo('nominatim', 'Prati, Roma'), geo('nominatim', 'Prati, Roma'), geo('nominatim', 'Trieste, Roma'),
  {}, {}, {},
];
const a = G.pinAudit(CAT);
ok(a.total === 19, `19 annunci contati (${a.total})`);
ok(a.exact === 5,  `5 con il portone vero (${a.exact})`);
ok(a.street === 4, `4 con la strada (${a.street})`);
ok(a.zone === 7,   `7 solo quartiere (${a.zone})`);
ok(a.none === 3,   `3 senza pin (${a.none})`);
ok(a.exact + a.street + a.zone + a.none === a.total, 'nessun annuncio sfugge alla classificazione');

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
