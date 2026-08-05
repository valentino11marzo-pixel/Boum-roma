// tests/squadra/desk.mjs — LA SCRIVANIA, MONTATA IN UN BROWSER VERO.
//
// La sezione promette una cosa precisa: si disegna SUBITO, senza Firestore.
// Mansioni, autonomia e confini sono conoscenza statica — se avessero bisogno
// di una lettura per comparire, la pagina sarebbe un altro posto dove Safari
// può restare appeso a un loader (la lezione che è costata lo spinner infinito
// del portale). Qui la promessa viene messa alla prova: la pagina si monta con
// `window.db` INESISTENTE, e deve venire fuori tutta.
//
// squadraPage() vive dentro l'IIFE di portal-app.js e non è esportabile: la si
// estrae dal sorgente contando le graffe e la si esegue nel browser con gli
// stub minimi, la stessa disciplina di tests/wizard/local_brain.py (che estrae
// le funzioni pure del bot via AST invece di riscriverle nel test).
//
// Si auto-skippa senza playwright, come le altre suite del repo.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const BROWSER = process.env.BOOM_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function loadChromium() {
  for (const p of [
    ...(process.env.BOOM_PLAYWRIGHT ? [process.env.BOOM_PLAYWRIGHT] : []),
    'playwright-core', 'playwright',
    '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js'
  ]) {
    try {
      const m = await import(p);
      const c = m.chromium || (m.default && m.default.chromium);
      if (c) return c;
    } catch { /* prova il prossimo */ }
  }
  return null;
}

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

// Estrae una funzione top-level dal sorgente contando le graffe.
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`funzione ${name} non trovata in portal-app.js`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
  }
  throw new Error(`graffe sbilanciate in ${name}`);
}

const appSrc = readFileSync(join(ROOT, 'js', 'portal-app.js'), 'utf8');
const squadraPageSrc = extractFn(appSrc, 'squadraPage');

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

let pass = 0, fail = 0;
// AWAIT obbligatorio: una prima versione di questo file non aspettava le
// verifiche async e stampava ✓ perché una Promise è "vera" — due controlli
// dichiaravano di aver verificato il DOM mentre il browser si stava già
// chiudendo. Un test che mente è peggio di nessun test.
const check = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

console.log('\nLA SCRIVANIA — montata in un browser, senza Firestore\n');

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e)));

await page.goto(`http://127.0.0.1:${PORT}/tests/squadra/_harness.html`, { waitUntil: 'domcontentloaded' });

const out = await page.evaluate((src) => {
  // Gli stub MINIMI del portale. Nessun Firebase, nessun db: è il punto.
  window.S = { page: 'squadra' };
  window.esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  // window.db resta INDEFINITO di proposito.
  const fn = new Function('esc', 'S', 'return (' + src + ')')(window.esc, window.S);
  const html = fn();
  document.getElementById('main').innerHTML = html;
  return { len: html.length, hasDb: typeof window.db !== 'undefined' };
}, squadraPageSrc);

const txt = await page.textContent('#main');
const registry = (await import(join(ROOT, 'js', 'squadra-registry.js').replace(/^/, 'file://'))).default
  || (await import('node:module')).createRequire(import.meta.url)(join(ROOT, 'js', 'squadra-registry.js'));

await check('nessuna eccezione durante il render', () => {
  assert.deepEqual(errors, [], errors.join(' · '));
});

await check('si è disegnata SENZA Firestore (window.db mai definito)', () => {
  assert.equal(out.hasDb, false, 'il test ha barato: db esisteva');
  assert.ok(out.len > 5000, `HTML troppo corto (${out.len} byte) — non è la pagina intera`);
});

await check('ci sono tutti: nessun dipendente resta fuori dalla scrivania', () => {
  const missing = registry.TEAM.filter(a => !txt.includes(a.name));
  assert.deepEqual(missing.map(a => a.name), [], 'assenti dalla pagina');
});

await check('l\'avviso in testa nomina chi scrive ai clienti da solo', () => {
  assert.ok(txt.includes('SCRIVONO AI TUOI CLIENTI SENZA CHIEDERTELO'), 'manca l\'avviso');
  for (const a of registry.speaksToClients()) {
    assert.ok(txt.includes(a.name), `${a.name} scrive ai clienti ma non è nell'avviso`);
  }
});

await check('ogni fascicolo porta le tre liste — la lettera di assunzione', () => {
  const solo = (txt.match(/FA DA SOLO/g) || []).length;
  const porta = (txt.match(/PORTA A TE/g) || []).length;
  const mai = (txt.match(/NON FA MAI/g) || []).length;
  assert.equal(solo, registry.TEAM.length, `FA DA SOLO su ${solo}/${registry.TEAM.length} schede`);
  assert.equal(porta, registry.TEAM.length, `PORTA A TE su ${porta}/${registry.TEAM.length}`);
  assert.equal(mai, registry.TEAM.length, `NON FA MAI su ${mai}/${registry.TEAM.length}`);
});

await check('il badge dice la verità sull\'autonomia', () => {
  const n = (re) => (txt.match(re) || []).length;
  assert.equal(n(/Passa sempre da te/g), 2, 'solo Gestore e Commerciale passano da approvazione');
  assert.ok(n(/Agisce da solo/g) >= 15, 'quasi tutti agiscono senza chiedere: deve vedersi');
});

await check('i reparti compaiono tutti come intestazioni', () => {
  for (const r of registry.REPARTI) assert.ok(txt.includes(r), `reparto mancante: ${r}`);
});

// Il fascicolo è dentro un <details>: chiuso di default (una pagina che si
// apre con 19 dossier spalancati è illeggibile), apribile davvero.
await check('il fascicolo è chiuso di default e si apre', async () => {
  const openBefore = await page.$$eval('#main details[open]', els => els.length);
  assert.equal(openBefore, 0, 'i fascicoli non devono essere già aperti');
  await page.$eval('#main details', el => el.open = true);
  const openAfter = await page.$$eval('#main details[open]', els => els.length);
  assert.equal(openAfter, 1);
});

await browser.close();
server.close();

console.log(`\n  ${pass} passati, ${fail} falliti\n`);
process.exit(fail ? 1 : 0);
