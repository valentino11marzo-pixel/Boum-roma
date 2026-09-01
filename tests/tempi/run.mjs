// tests/tempi/run.mjs — I TEMPI PORTA-A-PORTA DAL GTFS.
//
// La vetrina prometteva minuti in linea d'aria (km × 4.2 + 10): il
// Pendolare li misura sulla rete vera. Qui si verifica TUTTO il giro senza
// rete: una piccola città sintetica scritta in un GTFS VERO (zip STORE via
// api/_zip.js, così lettore e scrittore si provano a vicenda, più una voce
// DEFLATE costruita a mano perché il feed vero è DEFLATE), macinata dal
// builder vero, e le regole dure:
//   · l'attesa è metà headway MISURATO (28 corse in 14h → 15′ di attesa)
//   · una "corsa" oltre i 45′ è un dato sporco e NON diventa un arco —
//     senza la guardia, Termini risulterebbe raggiungibile (mutazione)
//   · la griglia non inventa MAI: fuori copertura → '~' → verso() null
//   · vicino alla meta vince la camminata, senza bisogno di fermate
//   · più vicino alla meta = tempo minore (monotonia lungo la linea)
//   · le virgolette CSV non spostano le colonne (nomi fermate con virgole)
// Più le giunzioni sulla sorgente: scheda e skyline consultano la griglia
// e la stima dichiarata resta VIVA in una copia sola (js/mappa-engine.js:
// il letterale nella pagina non si asserisce più — vedi la nota sotto),
// le rules aprono publicGeo in lettura,
// il cron esiste in vercel.json e il registro della Squadra lo dichiara.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');

const { buildZip, crc32 } = await import(join(ROOT, 'api', '_zip.js'));
const { zipEntries, streamEntryLines } = await import(join(ROOT, 'api', '_unzip.js'));
const OPS = await import(join(ROOT, 'api', 'ops', 'gtfs-tempi.js'));
const TEMPI = (await import(join(ROOT, 'js', 'tempi-engine.js'))).default;
const { toFsFields } = await import(join(ROOT, 'api', 'homie', '_lib.js'));

let pass = 0, fail = 0;
function check(nome, v) {
  if (v) { pass++; console.log('  ✓ ' + nome); }
  else { fail++; console.log('  ✗ ' + nome); }
}

/* ── il motore puro ────────────────────────────────────────────────────── */
console.log('MOTORE (tempi-engine)');
check('codifica/decodifica: identità su 0..89',
  [...Array(90).keys()].every((m) => TEMPI.decodifica(TEMPI.codifica(m)) === m));
check('oltre il tetto (90′) → nessun verdetto, mai un numero',
  TEMPI.codifica(90) === TEMPI.NA && TEMPI.codifica(null) === TEMPI.NA
  && TEMPI.decodifica(TEMPI.NA) === null);
{
  const meta = { lat0: 41.76, lng0: 12.35, dLat: 0.0027, dLng: 0.0036, righe: 89, colonne: 84 };
  check('cella: dentro, sui bordi dentro, fuori = -1',
    TEMPI.cella(meta, 41.90, 12.50) >= 0
    && TEMPI.cella(meta, 41.7601, 12.3501) === 0
    && TEMPI.cella(meta, 41.75, 12.50) === -1
    && TEMPI.cella(meta, 41.90, 12.66) === -1);
  const g = TEMPI.NA.repeat(meta.righe * meta.colonne).split('');
  g[TEMPI.cella(meta, 41.90, 12.50)] = TEMPI.codifica(18);
  const dati = { meta, griglie: { termini: g.join('') } };
  check('verso: la cella coperta risponde, la scoperta no',
    TEMPI.eta(dati, 41.90, 12.50, 'termini') === 18
    && TEMPI.verso(dati, 41.80, 12.40) === null);
  const doc = { fields: toFsFields({ meta, griglie: { termini: g.join('') } }) };
  const rt = TEMPI.daDoc(doc);
  check('daDoc: il doc Firestore REST torna dati leggibili (round-trip)',
    rt && TEMPI.eta(rt, 41.90, 12.50, 'termini') === 18);
  check('daDoc su spazzatura → null, mai un lancio',
    TEMPI.daDoc(null) === null && TEMPI.daDoc({}) === null
    && TEMPI.daDoc({ fields: { meta: { stringValue: 'x' } } }) === null);
}
check('le mete portano gli slug che le pagine usano',
  ['termini', 'vaticano', 'luiss', 'romatre', 'lumsa']
    .every((s) => TEMPI.METE.some((m) => m.slug === s)));

/* ── il lettore ZIP: STORE dal gemello, DEFLATE a mano ─────────────────── */
console.log('LETTORE ZIP (_unzip)');
{
  const z = buildZip([{ name: 'a.txt', data: 'riga1\r\nriga2\nriga3' }]);
  const righe = [];
  await streamEntryLines(z, zipEntries(z)[0], (r) => righe.push(r));
  check('STORE: le righe tornano intere, \\r\\n e coda senza newline compresi',
    righe.length === 3 && righe[0] === 'riga1' && righe[2] === 'riga3');
}
{
  // una voce DEFLATE scritta a mano: il feed vero è DEFLATE
  const testo = Buffer.from('x,y\n1,2\n3,4\n', 'utf8');
  const comp = zlib.deflateRawSync(testo);
  const nome = Buffer.from('d.txt');
  const loc = Buffer.alloc(30);
  loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4);
  loc.writeUInt16LE(8, 8); loc.writeUInt32LE(crc32(testo), 14);
  loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(testo.length, 22);
  loc.writeUInt16LE(nome.length, 26);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(crc32(testo), 16); cen.writeUInt32LE(comp.length, 20);
  cen.writeUInt32LE(testo.length, 24); cen.writeUInt16LE(nome.length, 28);
  cen.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + nome.length, 12);
  eocd.writeUInt32LE(30 + nome.length + comp.length, 16);
  const z = Buffer.concat([loc, nome, comp, cen, nome, eocd]);
  const righe = [];
  await streamEntryLines(z, zipEntries(z)[0], (r) => righe.push(r));
  check('DEFLATE: si inflaziona in streaming e le righe tornano',
    righe.length === 3 && righe[1] === '1,2');
}

/* ── la città sintetica: un GTFS vero in miniatura ─────────────────────── */
console.log('BUILDER (città sintetica → griglia)');
const hhmm = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(x)}`;
};
// la linea A: S1 → S2 → S3 → S4, dove S4 È il Vaticano; 6′ a tratta,
// 28 corse fra le 07:10 e le 20:40 → headway 30′ → attesa 15′ (il cap)
const FERMATE = [
  ['S1', 'Piazza, Uno', 41.9000, 12.3600],   // virgola NEL nome: prova CSV
  ['S2', 'Fermata Due', 41.9000, 12.3900],
  ['S3', 'Fermata Tre', 41.9000, 12.4200],
  ['S4', 'San Pietro', 41.9022, 12.4534],
  ['SB', 'Capolinea Lento', 41.9009, 12.5018], // Termini: solo la corsa sporca
];
let stopTimes = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n';
let tripsTxt = 'trip_id,route_id,service_id,direction_id\n';
for (let n = 0; n < 28; n++) {
  const t0 = 7 * 3600 + 10 * 60 + n * 1800;
  tripsTxt += `TA${n},LINEA_A,FERIALE,0\n`;
  [0, 1, 2, 3].forEach((k) => {
    const t = t0 + k * 360;
    stopTimes += `TA${n},${hhmm(t)},${hhmm(t)},S${k + 1},${k + 1}\n`;
  });
}
// la corsa SPORCA: 50 minuti secchi S1→SB — deve essere scartata
tripsTxt += 'TB0,LINEA_B,FERIALE,0\n';
stopTimes += `TB0,${hhmm(8 * 3600)},${hhmm(8 * 3600)},S1,1\n`;
stopTimes += `TB0,${hhmm(8 * 3600 + 3000)},${hhmm(8 * 3600 + 3000)},SB,2\n`;

const ZIP = buildZip([
  { name: 'calendar.txt', data:
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n'
    + 'FERIALE,1,1,1,1,1,0,0,20200101,20351231\n' },
  { name: 'trips.txt', data: tripsTxt },
  { name: 'stops.txt', data:
    'stop_id,stop_name,stop_lat,stop_lon,location_type\n'
    + FERMATE.map((f) => `${f[0]},"${f[1]}",${f[2]},${f[3]},0`).join('\n') + '\n' },
  { name: 'stop_times.txt', data: stopTimes },
]);

const esito = await OPS.costruisciDaZip(ZIP, new Date('2026-08-28T12:00:00Z'));
const DATI = { meta: esito.meta, griglie: esito.griglie };

check('il giorno campione è un feriale con il servizio attivo',
  esito.stats.servizi === 1 && esito.stats.corseAttive === 29);
check('tutte le fermate lette (le virgolette non spostano le colonne)',
  esito.stats.fermate === 5);

const vatDaS1 = TEMPI.eta(DATI, 41.9000, 12.3600, 'vaticano');
check('S1 → Vaticano: bus con attesa 15′ + 3 tratte da 6′ (~33–40′), '
  + 'non i ~127′ della camminata', vatDaS1 != null && vatDaS1 >= 30 && vatDaS1 <= 45);
const vatDaS3 = TEMPI.eta(DATI, 41.9000, 12.4200, 'vaticano');
check('monotonia: da S3 (una tratta) si arriva prima che da S1 (tre)',
  vatDaS3 != null && vatDaS3 < vatDaS1);
check('sotto casa della meta vince la camminata (Colosseo ≤ 3′)',
  (TEMPI.eta(DATI, 41.8902, 12.4924, 'colosseo') ?? 99) <= 3);
check('LA GUARDIA: la corsa sporca da 50′ NON apre Termini '
  + '(senza il tetto corsaMaxS questo sarebbe ~67′)',
  TEMPI.eta(DATI, 41.9000, 12.3600, 'termini') === null);
check('fuori copertura la griglia tace: verso() → null',
  TEMPI.verso(DATI, 41.7700, 12.6300) === null);
check('fuori griglia (bbox) → null', TEMPI.verso(DATI, 41.5, 12.5) === null);
{
  const G = esito.meta;
  const attesi = G.righe * G.colonne;
  check('ogni griglia è lunga esattamente righe×colonne',
    TEMPI.METE.every((m) => esito.griglie[m.slug].length === attesi));
}

/* ── le giunzioni sulla sorgente ───────────────────────────────────────── */
console.log('GIUNZIONI');
{
  const det = R('apartment-detail.html');
  const reg = R('design/pages-deco/ld-regia.html');
  for (const [nome, t] of [['apartment-detail', det], ['ld-regia', reg]]) {
    check(nome + ': consulta la griglia (publicGeo/tempi-roma + BOOM_TEMPI.verso)',
      t.includes('publicGeo/tempi-roma') && t.includes('BOOM_TEMPI.verso'));
  }

  /* IL FALLBACK NON SI ASSERISCE PIU' COME STRINGA NELLA PAGINA.
     Fino al 31/08/2026 questa guardia pretendeva il letterale
     `'≈' + Math.round(d * 4.2 + 10)` DENTRO apartment-detail.html — cioè
     asseriva DOVE stava l'implementazione, non che la promessa reggesse.
     Il risultato: la stessa camminata era calcolata a 4,7 km/h nella
     scheda e a 4,8 nello Skyline, due risposte diverse alla stessa
     domanda, e la guardia era verde. Ora la stima vive in UNA copia
     (js/mappa-engine.js) e qui si verifica l'INVARIANTE, in tre pezzi che
     insieme sono più forti del letterale di prima:
       (a) il motore produce davvero una stima DICHIARATA (il ≈), e
       (b) la pagina ci passa attraverso, e
       (c) nessuno se n'è ricopiata una propria — la ricaduta vera. */
  {
    const MAP = R('js/mappa-engine.js');
    check('(a) il motore tiene la stima dichiarata (km×4.2+10, col ≈)',
      MAP.includes('4.2') && MAP.includes('10') && MAP.includes("'≈'"));
    check('(b) la scheda passa dal motore condiviso',
      det.includes('src="/js/mappa-engine.js"')
      && det.includes('BOOM_MAPPA.tempo('));
    /* la formula ricopiata FUORI dal motore: è così che le due velocità
       avevano preso strade diverse. Un solo posto può scriverla. */
    const copie = ['apartment-detail.html', 'skyline.html', 'index.html',
      'apartments.html', 'design/pages-deco/ld-regia.html']
      .filter((f) => /\*\s*4\.2\s*\+\s*10/.test(R(f)));
    check('(c) nessuna pagina si ricopia la formula (' +
      (copie.join(', ') || 'nessuna') + ')', copie.length === 0);
  }
  // gli slug scritti nei POSTI della scheda devono esistere nel motore
  const slugs = [...det.matchAll(/\[\s*'(?:[^'\\]|\\.)+',\s*'(?:[^'\\]|\\.)*',\s*[\d.]+,\s*[\d.]+,\s*'(\w+)'\s*\]/g)]
    .map((m) => m[1]);
  check('scheda: 7 slug, tutti nel motore (' + slugs.join(',') + ')',
    slugs.length === 7 && slugs.every((s) => TEMPI.METE.some((m) => m.slug === s)));
  check('detail carica /js/tempi-engine.js', det.includes('src="/js/tempi-engine.js"'));

  const sk = R('skyline.html');
  check('skyline: carica il motore e consulta la griglia',
    sk.includes('src="/js/tempi-engine.js"') && sk.includes('publicGeo/tempi-roma')
    && sk.includes('BOOM_TEMPI.eta'));
  check('skyline: il fallback in km resta (distLabel)',
    sk.includes('function distLabel(km)') && sk.includes('return distLabel(dKm);'));
  const blocco = sk.slice(sk.indexOf('var ANCHORS=['),
    sk.indexOf('];', sk.indexOf('var ANCHORS=[')));
  const skSlugs = [...blocco.matchAll(/\[12\.\d+,41\.\d+,'[^']+','[^']+','(\w+)'\]/g)]
    .map((m) => m[1]);
  check('skyline: 9 slug ancora, tutti nel motore (' + skSlugs.length + ')',
    skSlugs.length === 9 && skSlugs.every((s) => TEMPI.METE.some((m) => m.slug === s)));

  check('firestore.rules: publicGeo leggibile da tutti, scrittura admin',
    /match \/publicGeo\/\{x\} \{ allow read: if true; allow write: if isAdmin\(\); \}/
      .test(R('firestore.rules')));
  const v = JSON.parse(R('vercel.json'));
  check('vercel.json: il cron del Pendolare esiste',
    (v.crons || []).some((c) => c.path === '/api/ops/gtfs-tempi'));
  check('vercel.json: budget largo (300s) per il builder',
    v.functions && v.functions['api/ops/gtfs-tempi.js']
    && v.functions['api/ops/gtfs-tempi.js'].maxDuration === 300);
  check('il registro della Squadra dichiara il cron (niente dipendenti fantasma)',
    R('js/squadra-registry.js').includes("crons: ['/api/ops/gtfs-tempi']"));
}

console.log(fail ? `\nTEMPI: ${fail} GUASTI su ${pass + fail}`
  : `\nTEMPI: TUTTO VERDE (${pass} check)`);
process.exit(fail ? 1 : 0);
