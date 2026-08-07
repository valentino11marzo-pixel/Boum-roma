// tests/bonifico/parity.mjs
// LA CAUSALE MOSTRATA AL CLIENTE DEVE COINCIDERE CON QUELLA CHE LA BANCA
// RICONOSCE.
//
// Il codice è calcolato due volte: in /casa dal browser (crypto.subtle) per
// mostrarlo, e in api/payments/_ref.js dal server (node:crypto) per abbinare
// il movimento. Se le due ricette divergono di un solo carattere, il cliente
// copia una causale che nessuno riconoscerà — e il bonifico "gratis" torna a
// essere lavoro manuale, senza che nessuno si accorga del perché.
//
// Qui la funzione del browser gira in un browser vero, sulla stessa lista di
// id, e si confronta carattere per carattere con quella del server.
//
//   node tests/bonifico/parity.mjs

import { payRef } from '../../api/payments/_ref.js';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

async function loadChromium() {
  for (const spec of ['playwright-core', 'playwright',
    ...(process.env.BOOM_PLAYWRIGHT ? [process.env.BOOM_PLAYWRIGHT] : []),
    '/opt/node22/lib/node_modules/playwright/index.js']) {
    try { const m = await import(spec); const c = m.chromium || (m.default && m.default.chromium); if (c) return c; }
    catch { /* next */ }
  }
  console.log('SKIP: playwright-core non disponibile');
  process.exit(0);
}
const chromium = await loadChromium();

// Estrae dal file vero la funzione del browser: se qualcuno la modifica in
// tenant.html, questo test la ripesca così com'è ed è lui a rompersi.
const page_src = await readFile(new URL('../../tenant.html', import.meta.url), 'utf8');
const alpha = page_src.match(/var REF_ALPHABET='([^']+)'/);
const fn = page_src.match(/function payRefLocal\(id\)\{[\s\S]*?\n\}/);
if (!alpha || !fn) {
  console.log('\x1b[31m✗ payRefLocal / REF_ALPHABET non trovati in tenant.html — '
    + 'se sono stati rinominati, aggiorna questo test\x1b[0m');
  process.exit(1);
}

const IDS = [
  'pay_ctr9_2026-09', 'pay_ctr9_2026-10', 'depbal_ctr9',
  'pay_abc-123_2027-01', 'pay_ÀÉÎ_2026-12', 'pay_' + 'x'.repeat(60),
  'pay_ctr1_2026-01', 'pay_ctr1_2026-02', 'pay_ctr1_2026-03',
];

const browser = await chromium.launch({
  executablePath: process.env.BOOM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
// crypto.subtle esige un CONTESTO SICURO: su about:blank non esiste. http su
// 127.0.0.1 è considerato sicuro dai browser, quindi basta servire una pagina
// vuota da lì — ed è anche più fedele alla realtà (in produzione è https).
const srv = createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>parity</title>'); });
await new Promise(r => srv.listen(8951, '127.0.0.1', r));
await page.goto('http://127.0.0.1:8951/');
const got = await page.evaluate(async ({ alphabet, body, ids }) => {
  const REF_ALPHABET = alphabet;
  const payRefLocal = new Function('REF_ALPHABET', 'return ' + body)(REF_ALPHABET);
  const out = {};
  for (const id of ids) out[id] = await payRefLocal(id);
  return out;
}, { alphabet: alpha[1], body: fn[0], ids: IDS });
await browser.close();
srv.close();

let pass = 0, fail = 0;
console.log('\n\x1b[1mBrowser (/casa) vs server (api/payments/_ref.js)\x1b[0m');
for (const id of IDS) {
  const server = payRef(id), client = got[id];
  const ok = server === client;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${id.slice(0, 34).padEnd(34)} `
    + `${client}${ok ? '' : '  ≠ server ' + server}`);
  ok ? pass++ : fail++;
}

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLa causale che il cliente copia è quella che la banca riconosce.\x1b[0m');
