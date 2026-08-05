// tests/market/wiring.mjs — IL PERITO: le giunzioni, asserite sulla SORGENTE.
//
// Il motore è testato per mutazione; qui si assicurano i punti dove il
// motore incontra il resto della macchina — gli errori che i test unitari
// non possono vedere perché vivono NEL cablaggio:
//
//   • il tap nell'ingestione PFS dev'essere BEST-EFFORT e DOPO la scrittura
//     master: il radar di mercato non deve mai rompere il servizio che i
//     clienti pagano (la lezione delle guardie Réunion: conta l'ORDINE);
//   • il verdetto di morte lo dà IL SERVER col motore, mai il Mac: la
//     decisione resta nel posto testato per mutazione;
//   • le collection nuove sono nelle rules (la lezione propertyLocks: senza
//     la riga cadono nel default-deny e nulla funziona);
//   • il cron è dichiarato in vercel.json (il drift lo copre anche il
//     registro, ma qui il messaggio d'errore dice DOVE guardare).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

console.log('\nMARKET WIRING — le giunzioni del Perito\n');

const ingest = read('api/pfs/_ingest.js');
const homie = read('api/homie/market.js');
const ledger = read('api/market/_ledger.js');
const pulse = read('api/market/pulse.js');
const rules = read('firestore.rules');
const vercel = JSON.parse(read('vercel.json'));

check('il tap vive nell\'ingestione PFS, best-effort, DOPO la scrittura master', () => {
  const master = ingest.indexOf("fsPatch('pfsProperties/' + stableId, property)");
  const tap = ingest.indexOf('recordObservation(stableId, property)');
  assert.ok(master > 0, 'scrittura master non trovata');
  assert.ok(tap > 0, 'il tap non esiste: il libro mastro resta vuoto e il Perito è un guscio');
  assert.ok(tap > master, 'il tap DEVE venire dopo la scrittura master: prima il servizio pagato, poi la statistica');
  const tapLine = ingest.slice(ingest.lastIndexOf('\n', tap), ingest.indexOf('\n', tap));
  assert.ok(/try\s*\{/.test(tapLine), 'il tap deve essere in un try: un errore del radar non può rompere l\'ingestione PFS');
});

check('anche il corto-circuito di freschezza alimenta il libro mastro', () => {
  const short = ingest.indexOf('skippedFresh: true');
  const tap = ingest.lastIndexOf('recordObservation(stableId,', short);
  assert.ok(short > 0 && tap > 0 && tap < short,
    'il ri-avvistamento fresco deve arrivare al libro mastro PRIMA del return — rimanda la verifica di morte');
});

check('il verdetto di morte lo dà il SERVER col motore, mai il Mac', () => {
  assert.ok(homie.includes('ME.deathVerdict('), 'homie/market deve passare gli esiti dal motore');
  assert.ok(homie.includes('ME.applyCheck('), 'e applicare col fold del motore');
  assert.ok(!/body\.(verdict|gone|dead)/.test(homie),
    'il POST non deve accettare un verdetto già deciso dal client');
});

check('la porta di Homie è dietro il segreto, come ogni porta di Homie', () => {
  assert.ok(homie.includes('requireSecret(req, res)'), 'manca il gate X-Homie-Secret');
  const gate = homie.indexOf('requireSecret');
  const work = homie.indexOf('fsList(');
  assert.ok(gate > 0 && (work < 0 || gate < work), 'il gate deve precedere ogni lavoro');
});

check('il libro mastro non salva mai contatti (la porta usa solo il motore)', () => {
  assert.ok(ledger.includes('ME.observe('), 'la porta deve passare dal fold del motore');
  assert.ok(!/contactEmail|contactPhone/.test(ledger),
    'la porta non deve toccare i contatti nemmeno di passaggio');
});

check('marketListings e marketStats sono nelle rules (lezione propertyLocks)', () => {
  assert.ok(/match \/marketListings\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules),
    'senza la riga, default-deny: il libro mastro non si scrive affatto');
  assert.ok(/match \/marketStats\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules),
    'le statistiche di zona devono essere leggibili dal portal (admin)');
});

check('il cron del battito è dichiarato in vercel.json', () => {
  const paths = (vercel.crons || []).map(c => c.path);
  assert.ok(paths.includes('/api/market/pulse'),
    'il Perito senza cron non aggiorna mai le statistiche');
});

check('il battito vuoto ha parole sue: un libro vuoto non è un mercato fermo', () => {
  assert.ok(pulse.includes('Libro mastro VUOTO'),
    'il primo run (o un\'ingestione ferma) deve dirsi con parole esplicite');
  assert.ok(pulse.includes('checkBacklog') && pulse.includes('verifiche di vita arretrate'),
    'il backlog di verifiche deve essere visibile: senza morti l\'assorbimento invecchia in silenzio');
});

console.log(`\n  ${pass} passati, ${fail} falliti\n`);
process.exit(fail ? 1 : 0);
