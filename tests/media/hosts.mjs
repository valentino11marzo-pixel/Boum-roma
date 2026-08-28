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

// 5 · nessuna immagine del repo sproporzionata a cio' che mostra
// La griglia di ricerca serviva pigneto-palace.jpg a 1500x2000 e 295 KB per
// una card larga ~380px in un riquadro 4:3: sei volte i pixel necessari, e
// per giunta quasi tutti ritagliati via dal browser. Era l'oggetto piu'
// pesante di apartments.html — piu' dell'HTML. Ricodificata a 800px/48 KB,
// la pagina e' passata da 591 KB a 343 KB senza toccare una riga di markup.
// Il budget e' per RUOLO, non un numero unico: le strisce dei pass Wallet
// viaggiano DENTRO il .pkpass e le scarica l'app una volta sola (e vanno
// viste a retina sul telefono), le card social le prende un crawler, le
// immagini di pagina le paga il visitatore su rete mobile. Trattarle uguali
// avrebbe voluto dire o rovinare i pass o non accorgersi mai di una foto da
// 295 KB nella griglia di ricerca.
function tetto(f) {
  if (/^(pass-assets|assets\/passes)\//.test(f)) return [400, 'pass Wallet'];
  if (/^og-|\/og-/.test(f)) return [120, 'card social'];
  return [200, 'immagine di pagina'];
}
function immagini(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'reference') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) immagini(p, acc);
    else if (/\.(jpe?g|png|webp)$/i.test(e.name)) acc.push(p);
  }
  return acc;
}
const grasse = immagini(R)
  .map((p) => {
    const f = path.relative(R, p);
    const [max, ruolo] = tetto(f);
    return [f, Math.round(fs.statSync(p).size / 1024), max, ruolo];
  })
  .filter(([, kb, max]) => kb > max)
  .sort((a, b) => b[1] - a[1]);
grasse.length
  ? male(`${grasse.length} immagini oltre il budget del loro ruolo — su un `
      + 'telefono una sola di queste vale il budget dell\'intera pagina:\n      '
      + grasse.map(([f, kb, max, r]) => `${f} — ${kb} KB (${r}: max ${max})`).join('\n      ')
      + '\n      sharp(f).resize({width:800}).jpeg({quality:82,mozjpeg:true})')
  : bene('ogni immagine sta nel budget del proprio ruolo');

// 6 · il motore d'ambiente non torna nel percorso critico
// 103 KB di atmosfera generativa: misurati in Chromium con CPU a 1/4
// costavano ~420ms di thread principale prima che la pagina fosse
// interattiva, senza toccare la prima pittura. Sta dietro uno stub che lo
// carica dopo `load`. Un <script src> nudo lo rimetterebbe davanti.
const nudi = html(R).filter((f) => !f.startsWith('preview-')
  && fs.readFileSync(path.join(R, f), 'utf8')
       .includes('<script src="/js/boom-ambient.js"></script>'));
nudi.length
  ? male(`${nudi.length} pagine caricano il motore d'ambiente nel percorso `
      + 'critico (~420ms di thread principale su un telefono di fascia '
      + 'media):\n      ' + nudi.join('\n      '))
  : bene("il motore d'ambiente resta fuori dal percorso critico");

console.log(ko ? `  \x1b[31mLe foto non sono ancora tutte nostre\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mLe foto restano nostre\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
