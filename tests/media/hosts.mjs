// tests/media/hosts.mjs
// LE FOTO DEL SITO SONO NOSTRE — e questo impedisce che smettano di esserlo.
//
// Ad agosto 2026 sei pagine pubbliche servivano le proprie immagini da
// i.imgur.com: una pagina che vende un servizio da centinaia di euro
// dipendeva, per la prova visiva, da un host di terzi. Se quell'host
// blocca l'hotlink o cancella il file, la pagina non da' errore: resta in
// piedi a vendere con dei riquadri vuoti, e nessun allarme suona.
//
// La migrazione la fa api/media/rehost.js + scripts/rehost-images.mjs, ma
// deve girare dove l'host di partenza e' raggiungibile. Nel frattempo qui
// c'e' la disciplina che conta davvero: un ELENCO delle dipendenze note.
//   · un'immagine esterna NUOVA fa fallire il test (il debito non cresce);
//   · un'immagine sparita dall'elenco fa fallire il test (l'elenco non
//     invecchia in silenzio: si aggiorna quando si migra, ed e' quello il
//     momento in cui si vede il progresso).
// Quando l'elenco e' vuoto, la dipendenza e' finita e il test lo dice.
//
// Le pagine PUBBLICHE (quelle in sitemap.xml, non una lista scritta a mano)
// sono trattate a parte: li' una foto mancante la vede un cliente.

import fs from 'node:fs';
import path from 'node:path';
import { immaginiEsterne } from '../../scripts/rehost-images.mjs';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const ELENCO = path.join(R, 'tests/media/fuori-casa.json');
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };

function html(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) html(p, acc);
    else if (e.name.endsWith('.html')) acc.push(path.relative(R, p));
  }
  return acc;
}

// le pagine pubbliche si DEDUCONO dalla sitemap, non si elencano a mano
const sitemap = fs.readFileSync(path.join(R, 'sitemap.xml'), 'utf8');
const pubbliche = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, ''))
  .filter(Boolean)
  .flatMap((s) => [s + '.html', s]));

const trovate = {};
for (const f of html(R)) {
  const fuori = immaginiEsterne(fs.readFileSync(path.join(R, f), 'utf8'));
  if (fuori.length) trovate[f] = fuori.sort();
}

const atteso = fs.existsSync(ELENCO) ? JSON.parse(fs.readFileSync(ELENCO, 'utf8')) : {};

console.log('\n\x1b[1m▸ media\x1b[0m  le foto del sito sono nostre');

// 1 · niente di NUOVO
const nuove = [];
for (const [f, urls] of Object.entries(trovate)) {
  for (const u of urls) if (!(atteso[f] || []).includes(u)) nuove.push(`${f} → ${u}`);
}
nuove.length
  ? male(`${nuove.length} immagini esterne NUOVE:\n      ` + nuove.join('\n      ')
      + '\n      Le foto vanno su Firebase Storage: scripts/rehost-images.mjs')
  : bene('nessuna dipendenza NUOVA da un host di terzi');

// 2 · l'elenco non invecchia
const sparite = [];
for (const [f, urls] of Object.entries(atteso)) {
  for (const u of urls) if (!(trovate[f] || []).includes(u)) sparite.push(`${f} → ${u}`);
}
sparite.length
  ? male(`${sparite.length} voci dell'elenco non esistono piu' — aggiorna `
      + `tests/media/fuori-casa.json (e' il momento in cui si vede il progresso):\n      `
      + sparite.join('\n      '))
  : bene("l'elenco delle dipendenze note e' allineato alla realta'");

// 3 · le pagine pubbliche, contate a parte
const pubbFuori = Object.keys(trovate).filter((f) => pubbliche.has(f));
const resto = Object.keys(trovate).length - pubbFuori.length;
if (pubbFuori.length) {
  console.log(`  \x1b[33m·\x1b[0m ${pubbFuori.length} pagine PUBBLICHE dipendono ancora `
    + `da un host di terzi (${resto} interne/storiche):\n      ` + pubbFuori.join('\n      ')
    + '\n      Un cliente che apre una di queste vede i riquadri vuoti se '
    + "l'host cade. Migrazione: BOOM_BASE=… HOMIE_SECRET=… node "
    + 'scripts/rehost-images.mjs --apply');
} else {
  bene('nessuna pagina pubblica dipende da un host di terzi');
}

// 4 · nessun preconnect a un host che non usiamo piu'
const morti = [];
for (const f of html(R)) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  for (const m of s.matchAll(/<link[^>]+preconnect[^>]+href="https?:\/\/([^/"]+)/g)) {
    const host = m[1];
    if (/boomrome|google|gstatic|firebase|stripe|jsdelivr|cloudflare|unpkg/.test(host)) continue;
    // Morto = l'host non compare DA NESSUN'ALTRA PARTE nel file. Cercarlo
    // solo fra le immagini dava falsi positivi veri: i tile delle mappe
    // (openfreemap) li chiede una libreria via JS, e quel preconnect e'
    // esattamente cio' che deve essere — corretto.
    const altrove = s.split(host).length - 1;
    if (altrove <= 1) morti.push(`${f} → ${host}`);
  }
}
morti.length
  ? male(`${morti.length} preconnect a host non piu' usati (una stretta di mano `
      + 'TLS regalata a ogni caricamento):\n      ' + morti.join('\n      '))
  : bene('nessun preconnect verso un host che non serviamo piu\'');

console.log(ko ? `  \x1b[31mLe foto non sono ancora tutte nostre\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mLe foto restano nostre\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
