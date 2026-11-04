#!/usr/bin/env node
// scripts/scroll-sync.mjs — IL CONTRATTO DI SCORRIMENTO, PORTATO SU OGNI
// PAGINA. css/boom-scroll.css e js/boom-scroll.js sono la sorgente; ogni
// pagina pubblica li porta inline fra <!-- BOOM_SCROLL:START --> e
// <!-- BOOM_SCROLL:END -->, nello STESSO formato che stampa
// build-cities.mjs (fragments). Fino al 22/10/2026 nessuno script teneva
// allineate le 68 copie: cambiare la sorgente non cambiava le pagine.
//   node scripts/scroll-sync.mjs           riscrive le copie vecchie
//   node scripts/scroll-sync.mjs --check   esce 1 e nomina le copie vecchie
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function scrollBlock(root = R) {
  const css = fs.readFileSync(path.join(root, 'css/boom-scroll.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'js/boom-scroll.js'), 'utf8');
  return `<!-- BOOM_SCROLL:START -->\n<style>\n${css}</style>\n<script>\n${js}</script>\n<!-- BOOM_SCROLL:END -->`;
}
const SKIP = new Set(['node_modules', '.git', '.vercel']);
export function markedFiles(root = R) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html') && fs.readFileSync(p, 'utf8').includes('<!-- BOOM_SCROLL:START -->')) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}
const RE = /<!-- BOOM_SCROLL:START -->[\s\S]*?<!-- BOOM_SCROLL:END -->/;

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const block = scrollBlock();
  const stale = [];
  for (const f of markedFiles()) {
    const s = fs.readFileSync(f, 'utf8');
    const m = s.match(RE);
    if (!m) { stale.push(path.relative(R, f) + ' (START without END)'); continue; }
    if (m[0] === block) continue;
    stale.push(path.relative(R, f));
    if (!check) fs.writeFileSync(f, s.replace(RE, () => block));
  }
  if (check) {
    if (stale.length) { console.error(`✗ ${stale.length} copie del contratto di scorrimento non allineate a css/boom-scroll.css + js/boom-scroll.js:\n  ` + stale.join('\n  ') + '\n  → node scripts/scroll-sync.mjs'); process.exit(1); }
    console.log('✓ il contratto di scorrimento è uguale alla sorgente su ' + markedFiles().length + ' pagine');
  } else console.log(stale.length ? `✓ riscritte ${stale.length} copie` : '✓ già allineate');
}
