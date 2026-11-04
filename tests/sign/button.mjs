// tests/sign/button.mjs — il bottone «Firma» di /sign si ACCENDE.
// Il 13/10 il cancello `documentReady` del flusso personalizzato (anteprima
// PDF verificata) è stato copiato anche nel flusso del contratto BOOM, dove
// nessuna anteprima lo apre: firma disegnata + spunta e il bottone restava
// spento per sempre (segnalato da una cliente il 25/10). Qui si guida la
// PAGINA VERA in un browser vero (demo mode: zero rete, zero scritture):
// spento all'inizio, spento con la sola firma o la sola spunta, acceso con
// entrambe, di nuovo spento se si cancella, e il tocco porta alla conferma.
// Inquilino (EN) e locatore (IT). Si auto-skippa senza playwright.
// Uso: node tests/sign/button.mjs
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

const browser = await chromium.launch(launchOptions());
const errs = [];

async function draw(pg) {
  const box = await (await pg.$('#pad')).boundingBox();
  const y = box.y + box.height / 2;
  await pg.mouse.move(box.x + 30, y);
  await pg.mouse.down();
  for (let i = 1; i <= 20; i++) await pg.mouse.move(box.x + 30 + i * 9, y + (i % 2 ? -14 : 14));
  await pg.mouse.up();
}
const disabled = (pg) => pg.$eval('#s-sign', (b) => b.disabled);

async function walk(who, query) {
  const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pg.on('pageerror', (e) => errs.push(who + ': ' + String(e.message).slice(0, 140)));
  await pg.goto(URL_(query), { waitUntil: 'networkidle' });
  await pg.waitForTimeout(400);
  await pg.click('#rev-next'); await pg.waitForTimeout(200);
  await pg.click('#i-ok'); await pg.waitForTimeout(200);
  await pg.click('#o-skip'); await pg.waitForTimeout(250);
  check(`${who}: si arriva allo step firma`, !!(await pg.$('#pad')) && !!(await pg.$('#s-sign')));

  check(`${who}: bottone spento all'inizio`, await disabled(pg));
  await pg.check('#consent');
  check(`${who}: con la sola spunta resta spento`, await disabled(pg));
  await pg.uncheck('#consent');
  await draw(pg);
  check(`${who}: con la sola firma resta spento`, await disabled(pg));
  await pg.check('#consent');
  check(`${who}: firma + spunta → il bottone si ACCENDE`, !(await disabled(pg)));
  const bg = await pg.$eval('#s-sign', (b) => getComputedStyle(b).opacity);
  check(`${who}: acceso si vede (opacità piena, non 0.45)`, Number(bg) > 0.9);
  await pg.click('#pad-clear');
  check(`${who}: firma cancellata → di nuovo spento`, await disabled(pg));
  await draw(pg);
  check(`${who}: firma rifatta → riacceso`, !(await disabled(pg)));
  if (!(await disabled(pg))) await pg.click('#s-sign');
  await pg.waitForTimeout(900);
  check(`${who}: il tocco porta alla conferma`, !(await pg.$('#pad')) && !!(await pg.$('.success-ring')));
  await pg.close();
}

await walk('inquilino', 'demo=1');
await walk('locatore', 'demo=landlord');

check('nessun errore JavaScript', errs.length === 0);
if (errs.length) console.log('  errori:', errs);

await browser.close();
srv.close();

console.log('\n' + '─'.repeat(48));
console.log(`Bottone firma: ${pass} passed, ${fail} failed`);
if (fail) { console.error('FAILED: ' + bad.join(' | ')); process.exit(1); }
console.log('Chi firma e spunta può premere «Firma».');
