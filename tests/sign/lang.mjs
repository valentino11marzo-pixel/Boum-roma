// tests/sign/lang.mjs — /sign parla la lingua di chi firma.
// Guida la PAGINA VERA in un browser vero (demo mode: zero rete, zero
// scritture) e verifica: default per ruolo (locatore IT, inquilino EN), il
// toggle che ridisegna lo step CORRENTE in entrambe le direzioni, l'intero
// percorso tradotto (review → identità → telefono → firma), lo "Skip" che
// non blocca più il flusso e i link WhatsApp presenti dove serve.
// Si auto-skippa senza playwright, come la suite safari.
// Uso: node tests/sign/lang.mjs
import { loadChromium, launchOptions } from '../_browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile — npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js');
  process.exit(0);
}

let pass = 0, fail = 0;
const bad = [];
const check = (name, cond) => { cond ? pass++ : (fail++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

const srv = http.createServer((req, res) => {
  const rel = (req.url.split('?')[0] === '/') ? '/sign.html' : req.url.split('?')[0];
  const p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': rel.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
  res.end(fs.readFileSync(p));
}).listen(0);
const PORT = srv.address().port;
const URL_ = (q) => `http://127.0.0.1:${PORT}/sign.html?${q}`;

// --no-sandbox: sui runner CI (container, utente senza user-namespace)
// Chromium non parte senza. In locale è innocuo.
const browser = await chromium.launch(launchOptions());
const errs = [];
const newPage = async () => {
  const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  return pg;
};

// ── Inquilino: default EN ──
const pg = await newPage();
await pg.goto(URL_('demo=1'), { waitUntil: 'networkidle' });
await pg.waitForTimeout(500);
check('inquilino: la pagina parte in INGLESE', (await pg.textContent('.step h1')) === 'Review your contract');
check('il selettore lingua è in pagina', !!(await pg.$('#lang')));

// ── Toggle IT: ridisegna lo step CORRENTE (non solo il successivo) ──
await pg.click('#lang button[data-l="it"]');
await pg.waitForTimeout(350);
check('toggle IT: lo step corrente si ridisegna in italiano', (await pg.textContent('.step h1')) === 'Il Suo contratto');
const cells = await pg.$$eval('.cell .k', (ns) => ns.map((n) => n.textContent));
check('riepilogo tradotto (canone, durata, decorrenza, deposito)',
  cells.includes('Canone mensile') && cells.includes('Durata') && cells.includes('Decorrenza') && cells.includes('Deposito'));

// ── Il percorso intero in italiano ──
await pg.click('#rev-next'); await pg.waitForTimeout(250);
check('step identità in italiano', /Suoi dati/.test(await pg.textContent('.step h1')));
await pg.click('#i-ok'); await pg.waitForTimeout(250);
check('step telefono in italiano', (await pg.textContent('.step h1')) === 'Verifica il telefono');
check('lo Skip esiste e non blocca il flusso', (await pg.textContent('#o-skip')).trim() === 'Salta per ora');
check('WhatsApp raggiungibile dallo step telefono', !!(await pg.$('a[href*="wa.me/393313251961"]')));
await pg.click('#o-skip'); await pg.waitForTimeout(250);
check('skip → si arriva alla firma (in italiano)', (await pg.textContent('.step h1')) === 'Firmi il contratto');
check('consenso tradotto e completo', /Confermo la mia identità/.test(await pg.textContent('.consent span')));
check('WhatsApp raggiungibile anche prima di firmare', !!(await pg.$('a[href*="wa.me/393313251961"]')));

// ── Ritorno a EN: bidirezionale ──
await pg.click('#lang button[data-l="en"]'); await pg.waitForTimeout(300);
check('toggle EN: la firma torna in inglese', (await pg.textContent('.step h1')) === 'Sign your contract');

// ── Locatore: default IT (riceve l'email in italiano) ──
const pg2 = await newPage();
await pg2.goto(URL_('demo=landlord'), { waitUntil: 'networkidle' });
await pg2.waitForTimeout(500);
check('locatore: la pagina parte in ITALIANO', (await pg2.textContent('.step h1')) === 'Il Suo contratto');

check('nessun errore JavaScript in tutto il percorso', errs.length === 0);
if (errs.length) console.log('  errori:', errs);

await browser.close();
srv.close();

console.log('\n' + '─'.repeat(48));
console.log(`Firma bilingue: ${pass} passed, ${fail} failed`);
if (fail) { console.error('FAILED: ' + bad.join(' | ')); process.exit(1); }
console.log('La pagina di firma parla la lingua di chi firma.');
