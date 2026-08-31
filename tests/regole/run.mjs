// tests/regole/run.mjs — LE REGOLE IN VIGORE, NON QUELLE NEL FILE.
//
// LA LEZIONE DEL 31 AGOSTO 2026. `firestore.rules` nel repo dichiarava
// `match /publicGeo/{x} { allow read: if true; }` — la griglia dei tempi che
// la vetrina e /skyline devono leggere da anonimi. In PRODUZIONE quella
// lettura rispondeva PERMISSION_DENIED: le regole non erano mai state
// deployate, perché il FIREBASE_TOKEN della CI era scaduto e il job
// `deploy-rules` falliva a ogni push da giorni, in silenzio, mentre i merge
// continuavano.
//
// È esattamente il difetto che il job era nato per impedire (la lezione
// `propertyLocks`), tornato dal lato di chi lo doveva prevenire. E nessuna
// suite poteva accorgersene, perché tutte leggono il FILE — cioè
// l'intenzione — e nessuna la REALTÀ.
//
// Questa la legge. Nessuna credenziale: si interroga Firestore da anonimo,
// come farebbe un visitatore, con la chiave pubblica che sta già nelle
// pagine. Due liste, e la seconda vale più della prima:
//   · APERTE  — ciò che il sito DEVE poter leggere senza login;
//   · CHIUSE  — ciò che non deve MAI uscire da anonimo (contratti,
//               pagamenti, IBAN dell'azienda, telefonate, lucchetti…).
// Una regola troppo stretta rompe una pagina; una troppo larga regala
// l'archivio. Qui si misurano entrambe le direzioni.
//
// Rete assente o irraggiungibile ⇒ SKIP: una suite non deve fallire perché
// la macchina è offline. Ma se Firestore RISPONDE e la risposta è diversa da
// quella dichiarata, quello è un guasto — ed è il punto di tutto.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

// la chiave e il progetto si LEGGONO dalla configurazione vera del sito: se
// un giorno cambiano, il test segue senza che nessuno se ne ricordi
const cfg = read('js/firebase-config.js');
const API_KEY = (cfg.match(/apiKey:\s*"([^"]+)"/) || [])[1];
const PROJECT = (cfg.match(/projectId:\s*"([^"]+)"/) || [])[1];

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

if (!API_KEY || !PROJECT) {
  console.log('SKIP: js/firebase-config.js non espone apiKey/projectId');
  process.exit(0);
}

const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
async function leggi(path) {
  const r = await fetch(`${base}/${path}?pageSize=1&key=${API_KEY}`, {
    signal: AbortSignal.timeout(15000),
  });
  return r.status;   // 200 = letta · 403 = negata · 404 = permessa ma vuota
}

// prova di raggiungibilità: se la rete non c'è, non si giudica nulla
let sonda;
try { sonda = await leggi('listings'); }
catch (e) { console.log('SKIP: Firestore non raggiungibile da qui (' + e.message + ')'); process.exit(0); }

// ── APERTE: il sito le legge da anonimo, o una pagina si rompe ──────────
const APERTE = [
  ['listings', 'il catalogo (la vetrina lo legge senza login)'],
  ['publicGeo', 'la griglia dei tempi porta-a-porta (scheda e /skyline)'],
];
for (const [coll, cosa] of APERTE) {
  const st = await leggi(coll);
  ok(st === 200 || st === 404,
    `APERTA in produzione: ${coll} — ${cosa}${st === 403 ? '  ⛔ NEGATA: le regole in vigore non sono quelle del repo — rideploya firestore.rules' : ''}`);
}

// ── CHIUSE: da anonimo non escono, mai ──────────────────────────────────
const CHIUSE = [
  ['contracts', 'i contratti'],
  ['payments', 'le rate e gli incassi'],
  ['users', 'le anagrafiche'],
  ['leads', 'i clienti in trattativa'],
  ['propertyLocks', 'i lucchetti sugli immobili'],
  ['phoneCalls', 'le telefonate registrate'],
  ['preAgreements', 'le proposte'],
  ['bugReports', 'le segnalazioni'],
];
for (const [coll, cosa] of CHIUSE) {
  const st = await leggi(coll);
  ok(st === 403, `CHIUSA in produzione: ${coll} — ${cosa}${st !== 403 ? `  ⛔ risponde ${st} da ANONIMO` : ''}`);
}

// ── e il file dichiara le stesse due liste (o il test misura altro) ─────
const rules = read('firestore.rules');
for (const [coll] of APERTE) {
  ok(new RegExp(`match /${coll}/\\{[^}]*\\}\\s*\\{[^}]*allow read: if true`).test(rules),
    `il repo dichiara ${coll} pubblica in lettura (la lista del test non può divergere dal file)`);
}

console.log(`\n${fail ? '✗' : '✓'} regole: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
