// scripts/check-pages.mjs — validazione statica del sito (nessuna dipendenza).
// 1. Sintassi di ogni blocco <script> inline in tutti gli .html (salta ld+json)
// 2. Sintassi dei .js serviti (js/*.js, sw.js)
// 3. vercel.json ben formato
// Esce 1 al primo gruppo di errori: pensato per la CI.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
let failures = 0;

// Le pagine escluse dal deploy (.vercelignore) non vengono validate:
// controlliamo solo ciò che finisce davvero in produzione.
let ignored = [];
try {
  ignored = readFileSync(join(root, '.vercelignore'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((pat) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
} catch {}
const isIgnored = (name) => ignored.some((re) => re.test(name));

function checkInline(file) {
  const html = readFileSync(file, 'utf8');
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    i++;
    if (/type\s*=\s*["']application\/(ld\+json|json)["']/i.test(m[1])) continue;
    try {
      new vm.Script(m[2], { filename: `${file}#${i}` });
    } catch (e) {
      failures++;
      console.error(`FAIL ${file} — blocco <script> #${i}: ${e.message}`);
    }
  }
}

function checkJs(file) {
  try {
    const src = readFileSync(file, 'utf8');
    if (/^\s*(import|export)\s/m.test(src)) {
      // Modulo ESM (api/*): il parse avviene nel job tramite `node --check` — qui basta leggere.
      return;
    }
    new vm.Script(src, { filename: file });
  } catch (e) {
    failures++;
    console.error(`FAIL ${file}: ${e.message}`);
  }
}

const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html') && !isIgnored(f));
for (const f of htmlFiles) checkInline(join(root, f));
console.log(`inline-js: ${htmlFiles.length} pagine controllate`);

const jsFiles = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => join(root, 'js', f));
jsFiles.push(join(root, 'sw.js'));
for (const f of jsFiles) checkJs(f);
console.log(`js: ${jsFiles.length} file controllati`);

try { JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')); console.log('vercel.json: OK'); }
catch (e) { failures++; console.error(`FAIL vercel.json: ${e.message}`); }

if (failures) { console.error(`\n${failures} errori.`); process.exit(1); }
console.log('\nTutto OK.');
