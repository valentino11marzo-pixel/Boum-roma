// tests/og/run.mjs — L'IMMAGINE SOCIAL CHE ESISTE DAVVERO
//
// Il default di scripts/seo-config.js (DEFAULT_OG_IMAGE) puntava a
// `BOOMsocialprofile.png` — un file che NON è mai stato nel repo. Ogni
// condivisione su WhatsApp/social delle pagine stampate con quel default
// usciva con l'anteprima rotta, e nessuno lo vedeva perché il 404 lo
// incassa il crawler del social, non il browser dell'operatore. La
// lezione è quella dell'og della Réunion: l'immagine social si verifica
// CONTRO IL REPO, non si dichiara.
//
// Qui si pinna: i default di seo-config risolvono a file veri, e le
// pagine già bonificate (board, apartments-in/*) non citano MAI
// un'immagine di boomrome.com che il repo non contiene — né nei meta,
// né nel JSON-LD.
//
//   node tests/og/run.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let pass = 0, fail = 0;
const ok = (c, what) => { if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); } };

console.log('\n▸ i default di seo-config risolvono a file del repo');
{
  const cfg = readFileSync(join(RADICE, 'scripts', 'seo-config.js'), 'utf-8');
  for (const nome of ['DEFAULT_OG_IMAGE', 'FALLBACK_OG_IMAGE']) {
    const m = cfg.match(new RegExp(nome + String.raw` = \x60\$\{ORIGIN\}/([^\x60]+)\x60`));
    ok(!!m && existsSync(join(RADICE, m[1])),
      `${nome} → ${m ? m[1] : '(non trovato)'} esiste nel repo`);
  }
  ok(!cfg.includes('BOOMsocialprofile'), 'il PNG fantasma non è più il default');
}

console.log('\n▸ le pagine bonificate non citano immagini che il repo non ha');
{
  const pagine = readdirSync(join(RADICE, 'apartments-in'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => join('apartments-in', f));
  pagine.push('board.html');
  for (const p of pagine) {
    const html = readFileSync(join(RADICE, p), 'utf-8');
    // ogni URL boomrome.com/<file>.<img> citato come immagine, ovunque
    // appaia (og:image, twitter:image, "image" del JSON-LD)
    const urls = [...new Set(
      [...html.matchAll(/https:\/\/www\.boomrome\.com\/([\w.-]+\.(?:png|jpe?g|webp))/g)]
        .map((m) => m[1])
    )];
    const fantasmi = urls.filter((u) => !existsSync(join(RADICE, u)));
    ok(urls.length > 0 && fantasmi.length === 0,
      `${p}: ${urls.length} immagini citate, tutte nel repo${fantasmi.length ? ` (FANTASMI: ${fantasmi.join(', ')})` : ''}`);
  }
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
