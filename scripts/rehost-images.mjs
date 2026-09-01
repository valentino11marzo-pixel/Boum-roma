// scripts/rehost-images.mjs
// LA RISCRITTURA. Trova ogni immagine servita da un host che non e' nostro,
// chiede a /api/media/rehost di riportarla a casa, e sostituisce l'URL nei
// file. Nessuna magia: la mappa e' un JSON che si puo' leggere, e senza
// --apply non tocca un byte.
//
//   node scripts/rehost-images.mjs                       # cosa c'e' fuori casa
//   node scripts/rehost-images.mjs --map mappa.json      # con una mappa a mano
//   BOOM_BASE=https://boomrome.com HOMIE_SECRET=… \
//     node scripts/rehost-images.mjs --apply             # il giro completo
//
// Perche' il download non lo fa questo script: l'host di partenza puo'
// essere irraggiungibile dall'ambiente di sviluppo (il nostro non raggiunge
// imgur), mentre il server ha rete vera e le chiavi di Storage.

import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(new URL('..', import.meta.url).pathname);
const ARG = process.argv.slice(2);
const applica = ARG.includes('--apply');
const mappaFile = ARG[ARG.indexOf('--map') + 1];

// Casa nostra: il sito, lo Storage del progetto, e cio' che e' gia' locale.
export const NOSTRI = [
  /^https?:\/\/(www\.)?boomrome\.com\//,
  /^https?:\/\/([a-z0-9-]+\.)*firebasestorage\.googleapis\.com\//,
  /^https?:\/\/([a-z0-9-]+\.)*storage\.googleapis\.com\//,
  /^data:/, /^\//, /^\.\.?\//,
];
export const nostro = (u) => NOSTRI.some((r) => r.test(u));

// Dove puo' nascondersi l'URL di un'immagine: src, srcset, url() del CSS,
// e i campi immagine dentro il JSON incorporato nelle pagine.
const CACCIA = [
  /<img[^>]+\bsrc="([^"]+)"/gi,
  /\bsrcset="([^"]+)"/gi,
  /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
  /"(?:image|img|images|photo|thumbnail)"\s*:\s*"([^"]+)"/gi,
];

export function immaginiEsterne(testo) {
  const fuori = new Set();
  for (const re of CACCIA) {
    for (const m of testo.matchAll(re)) {
      for (const pezzo of m[1].split(',')) {
        const u = pezzo.trim().split(/\s+/)[0];
        if (!u || nostro(u)) continue;
        if (!/^https?:\/\//.test(u)) continue;
        if (!/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(u)) continue;
        fuori.add(u);
      }
    }
  }
  return [...fuori];
}

function fileHtml(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fileHtml(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

// Il test importa immaginiEsterne(): il giro da riga di comando parte solo
// quando questo file E' il comando, altrimenti importarlo scriverebbe file.
const daRigaDiComando = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (!daRigaDiComando) { /* solo libreria */ } else { await principale(); }

async function principale() {
const file = fileHtml(R);
const perFile = new Map();
const tutte = new Set();
for (const f of file) {
  const fuori = immaginiEsterne(fs.readFileSync(f, 'utf8'));
  if (fuori.length) { perFile.set(f, fuori); fuori.forEach((u) => tutte.add(u)); }
}

if (!tutte.size) { console.log('Nessuna immagine fuori casa.'); return; }
console.log(`${tutte.size} immagini fuori casa in ${perFile.size} file:`);
for (const [f, u] of perFile) console.log(`  ${path.relative(R, f)}  (${u.length})`);

let mappa = {};
if (mappaFile) mappa = JSON.parse(fs.readFileSync(mappaFile, 'utf8'));
else if (applica) {
  const base = process.env.BOOM_BASE || 'https://boomrome.com';
  const seg = process.env.HOMIE_SECRET || process.env.CRON_SECRET;
  if (!seg) { console.error('Serve HOMIE_SECRET (o CRON_SECRET) per chiamare il server.'); process.exit(1); }
  const r = await fetch(`${base}/api/media/rehost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Homie-Secret': seg },
    body: JSON.stringify({ urls: [...tutte] }),
  });
  const d = await r.json();
  if (!d.ok) { console.error('Il server ha detto no:', d); process.exit(1); }
  mappa = d.mapped || {};
  if (d.saltati?.length) {
    console.log('\nNON riportate a casa (restano su un host di terzi):');
    for (const s of d.saltati) console.log(`  ${s.url} → ${s.motivo}`);
  }
  fs.writeFileSync(path.join(R, 'mappa-immagini.json'), JSON.stringify(mappa, null, 2));
}

if (!applica && !mappaFile) {
  console.log('\n(anteprima — niente e\' stato toccato. --apply per il giro vero)');
  return;
}

let toccati = 0, sostituzioni = 0;
for (const [f, fuori] of perFile) {
  let s = fs.readFileSync(f, 'utf8'), cambiato = false;
  for (const u of fuori) {
    if (!mappa[u]) continue;
    const n = s.split(u).length - 1;
    if (!n) continue;
    s = s.split(u).join(mappa[u]);
    sostituzioni += n; cambiato = true;
  }
  // Un preconnect a un host che non usiamo piu' e' una stretta di mano TLS
  // regalata a ogni caricamento: si toglie insieme alle immagini.
  const dopo = immaginiEsterne(s);
  for (const host of ['i.imgur.com']) {
    if (!dopo.some((u) => u.includes(host))) {
      const p = new RegExp(`\\s*<link[^>]+preconnect[^>]*${host.replace('.', '\\.')}[^>]*>`, 'g');
      if (p.test(s)) { s = s.replace(p, ''); cambiato = true; }
    }
  }
  if (cambiato) { fs.writeFileSync(f, s); toccati++; }
}
console.log(`\n${sostituzioni} URL riscritti in ${toccati} file.`);
}
