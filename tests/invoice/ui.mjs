// tests/invoice/ui.mjs — l'editor fattura si apre DAVVERO.
//
// invoice-engine è coperto dai suoi test puri; questa suite copre l'altro
// pezzo: ~400 righe di template string che costruiscono il modal. Un apice
// non chiuso o un `esc()` mancante lì non lo vede nessun linter, e il primo
// a scoprirlo sarebbe l'operatore con un modal vuoto e un errore in console.
//
// Firebase è finto (nessuna rete, nessun progetto), jsPDF è finto: qui
// interessa che il DOM esca giusto e che i numeri a schermo siano quelli
// del motore.
//
//   node tests/invoice/ui.mjs
//
// Si auto-skippa senza playwright-core, come tests/safari/boot.mjs.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = 8917;
const BROWSER = process.env.BOOM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

async function loadChromium() {
  const tries = [
    'playwright-core', 'playwright',
    ...(process.env.BOOM_PLAYWRIGHT ? [process.env.BOOM_PLAYWRIGHT] : []),
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/opt/node22/lib/node_modules/playwright-core/index.js',
    '/usr/lib/node_modules/playwright-core/index.js',
  ];
  for (const t of tries) {
    try { const m = await import(t); return (m.default || m).chromium; } catch {}
  }
  return null;
}

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright-core non disponibile (BOOM_PLAYWRIGHT=/path/to/index.js per forzarlo)');
  process.exit(0);
}

const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  \x1b[32m✓\x1b[0m ' + name); pass++; }
  catch (e) { console.log('  \x1b[31m✗\x1b[0m ' + name + '\n      ' + e.message); fail++; }
};
const ok = (v, m) => { if (!v) throw new Error(m || 'atteso true'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a)); };

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// Pagina minima: solo lo shell DOM che il modulo tocca + i due script.
// portal-app.js gira per intero al load (è uno script classico) ma non fa
// nulla finché non lo si chiama: le sue chiamate al boot sono dentro
// onFirebaseScriptLoad / onAuthStateChanged, che qui non scattano mai.
await page.goto(`http://localhost:${PORT}/tests/invoice/fixture.html`, { waitUntil: 'networkidle' });

const BOOT = errors.slice();
await t('portal-app.js si carica senza errori di parsing/boot', () => {
  ok(BOOT.length === 0, 'errori al load: ' + BOOT.join(' | '));
  ok(true);
});

await t('il motore fatture è esposto in pagina', async () => {
  eq(await page.evaluate(() => typeof window.BOOM_INVOICE), 'object');
  eq(await page.evaluate(() => typeof window.openInvoiceEditor), 'function');
});

await t('l\'editor si apre e mostra i blocchi principali', async () => {
  errors.length = 0;
  await page.evaluate(() => window.openInvoiceEditor({}));
  await page.waitForSelector('#invDocType', { timeout: 4000 });
  const html = await page.evaluate(() => document.getElementById('modals').innerText);
  ['Cliente', 'Righe del documento', 'Ritenuta', 'Pagamento'].forEach((s) =>
    ok(html.includes(s), 'manca la sezione "' + s + '"'));
  ok(errors.length === 0, 'errori: ' + errors.join(' | '));
});

await t('i totali a schermo sono quelli del motore (IVA 22% inclusa)', async () => {
  await page.fill('#invL_desc_0', 'Provvigione mediazione');
  await page.fill('#invL_price_0', '1383.33');
  await page.evaluate(() => window.invLive());
  const txt = await page.evaluate(() => document.getElementById('invTotals').innerText);
  ok(txt.includes('1.383,33'), 'imponibile assente: ' + txt);
  ok(txt.includes('304,33'), 'IVA assente: ' + txt);
  ok(txt.includes('1.687,66'), 'totale assente: ' + txt);
});

await t('la validazione blocca l\'emissione finché mancano i dati SdI', async () => {
  const disabled = await page.evaluate(() => document.getElementById('invEmitBtn').disabled);
  eq(disabled, true, 'il bottone Emetti deve partire disabilitato');
  const checks = await page.evaluate(() => document.getElementById('invChecks').innerText);
  ok(/nome|denominazione|indirizzo|CAP/i.test(checks), 'la lista errori non nomina i campi: ' + checks);
});

await t('compilando il cliente il blocco si sblocca', async () => {
  await page.fill('#invB_name', 'Rossi Property Srl');
  await page.fill('#invB_vat', '12345678903');
  await page.fill('#invB_address', 'Via Cavour');
  await page.fill('#invB_zip', '00184');
  await page.fill('#invB_city', 'Roma');
  await page.fill('#invB_province', 'RM');
  await page.fill('#invB_sdiCode', 'ABC1234');
  await page.evaluate(() => window.invLive());
  eq(await page.evaluate(() => document.getElementById('invEmitBtn').disabled), false,
     'con emittente e cliente completi l\'emissione dev\'essere permessa');
});

await t('aliquota 0% fa comparire il selettore Natura', async () => {
  await page.selectOption('#invL_vat_0', '0');
  await page.waitForSelector('#invL_nat_0', { timeout: 3000 });
  eq(await page.evaluate(() => document.getElementById('invL_nat_0').value), 'N2.2');
});

await t('aggiungere e togliere righe non perde quanto già digitato', async () => {
  await page.selectOption('#invL_vat_0', '22');
  await page.evaluate(() => window.invAddLine());
  await page.waitForSelector('#invL_desc_1');
  eq(await page.evaluate(() => document.getElementById('invL_desc_0').value), 'Provvigione mediazione');
  await page.fill('#invL_desc_1', 'Rimborso spese');
  await page.fill('#invL_price_1', '100');
  await page.evaluate(() => window.invLive());
  ok((await page.evaluate(() => document.getElementById('invTotals').innerText)).includes('1.483,33'));
  await page.evaluate(() => window.invRemoveLine(1));
  await page.waitForFunction(() => !document.getElementById('invL_desc_1'));
  eq(await page.evaluate(() => document.getElementById('invL_desc_0').value), 'Provvigione mediazione');
});

await t('la ritenuta compare solo quando la si attiva, e cambia il netto', async () => {
  eq(await page.evaluate(() => !!document.getElementById('invWhRate')), false);
  await page.check('#invWhOn');
  await page.waitForSelector('#invWhRate');
  await page.fill('#invWhRate', '23');
  await page.fill('#invWhBase', '50');
  await page.evaluate(() => window.invLive());
  const txt = await page.evaluate(() => document.getElementById('invTotals').innerText);
  ok(txt.includes('159,08'), 'ritenuta attesa 11,5% di 1383,33 = 159,08 — ' + txt);
  ok(txt.includes('Netto a pagare'), 'manca il netto');
  await page.uncheck('#invWhOn');
});

await t('l\'XML generato dall\'editor contiene i dati digitati', async () => {
  const xml = await page.evaluate(() => {
    window.invSync();
    return window.BOOM_INVOICE.buildXML(
      Object.assign({}, window.__draft(), { number: '1/2026', progressive: 1 }),
      window.invSeller());
  });
  ok(xml.includes('<CodiceDestinatario>ABC1234</CodiceDestinatario>'));
  ok(xml.includes('<Denominazione>Rossi Property Srl</Denominazione>'));
  ok(xml.includes('<ImportoTotaleDocumento>1687.66</ImportoTotaleDocumento>'));
});

await t('un nome cliente con apici/HTML non rompe il modal (XSS)', async () => {
  await page.fill('#invB_name', '<img src=x onerror=alert(1)>"\'&');
  await page.evaluate(() => window.invEdit());
  await page.waitForSelector('#invB_name');
  eq(await page.evaluate(() => document.querySelectorAll('#modals img').length), 0,
     'il markup del campo nome è finito nel DOM');
  eq(await page.evaluate(() => document.getElementById('invB_name').value), '<img src=x onerror=alert(1)>"\'&',
     'il valore deve sopravvivere intatto al giro di escaping');
});

await t('la card impostazioni riflette lo stato reale della configurazione', async () => {
  errors.length = 0;
  const configured = await page.evaluate(() => window.billingSettingsCard());
  ok(configured.includes('blVat') && configured.includes('blReaNumber'), 'campi P.IVA/REA assenti');
  ok(configured.includes('configurato') && !configured.includes('da compilare'),
     'con emittente completo deve dirsi configurato');
  ok(configured.includes('checksum valido'), 'la P.IVA valida dev\'essere confermata a schermo');

  // Svuotata: la card deve DIRE che manca, non presentarsi identica.
  const empty = await page.evaluate(() => {
    const keep = S.billing; S.billing = null;
    const html = window.billingSettingsCard(); S.billing = keep; return html;
  });
  ok(empty.includes('da compilare'), 'senza dati deve dichiararsi non configurata');
  ok(errors.length === 0, errors.join(' | '));
});

await t('una P.IVA con checksum rotto viene segnalata nella card', async () => {
  const html = await page.evaluate(() => {
    const keep = S.billing;
    S.billing = Object.assign({}, keep, { vat: '17546591000' });
    const h = window.billingSettingsCard(); S.billing = keep; return h;
  });
  ok(html.includes('checksum non valido'), 'la P.IVA cablata in COMPANY dev\'essere segnalata');
});

await browser.close();
server.close();
console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' passati, ' + fail + ' falliti\x1b[0m\n');
process.exit(fail ? 1 : 0);
