// tests/pa-external/ui.mjs — la console pre-agreement VERA in Chromium (390 e
// 1280 px): «📎 Carica firmato» e «💶 Link provvigione» cliccati come li
// clicca l'operatore. Le chiamate a /api/preagreement/sign-for eseguono il
// handler VERO sul Firestore in memoria della suite (fixture.mjs); Firebase
// nel browser è un ponte verso lo stesso Firestore. Niente rete esterna.
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const F = await import('./fixture.mjs');
const { DB, SIGNED_PDF, call, seed } = F;
const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non trovato (BOOM_PLAYWRIGHT)'); process.exit(0); }
const ROOT = new URL('../../', import.meta.url);
const page0 = readFileSync(new URL('pre-agreement-admin.html', ROOT), 'utf8');
const js = (p) => readFileSync(new URL(p, ROOT), 'utf8');

// Firebase compat finto: ogni lettura passa da window.__db (esposta da Node).
const FIREBASE_STUB = `
(function(){
  var L=[];window.__listeners=L;
  function snapDoc(id,data){return {id:id,exists:!!data,data:function(){return data?JSON.parse(JSON.stringify(data)):undefined}};}
  function list(col){return window.__db('list',col).then(function(rows){return {forEach:function(fn){rows.forEach(function(r){fn(snapDoc(r.id,r.data));});},docs:rows.map(function(r){return snapDoc(r.id,r.data);})};});}
  function q(col){var o={orderBy:function(){return o;},limit:function(){return o;},where:function(){return o;},
    get:function(){return list(col);},
    onSnapshot:function(fn){var h=function(){list(col).then(fn);};L.push(h);h();return function(){};}};return o;}
  window.firebase={initializeApp:function(){},apps:[1],auth:function(){return {};},firestore:function(){return {
    collection:function(col){var o=q(col);o.doc=function(id){var path=col+'/'+id;return {
      get:function(){return window.__db('get',path).then(function(d){return snapDoc(id,d);});},
      onSnapshot:function(fn){var h=function(){window.__db('get',path).then(function(d){fn(snapDoc(id,d));});};L.push(h);h();return function(){};},
      update:function(p){return window.__db('patch',path,p);},set:function(p){return window.__db('patch',path,p);}};};return o;}};}};
  window.__refresh=function(){L.forEach(function(h){h();});};
})();`;
const PORTAL_STUB = `window.BoomPortal={bugButton:function(){},hardReset:function(){},requireAuth:function(){return Promise.resolve({user:{email:'admin@example.test',uid:'admin',getIdToken:function(){return Promise.resolve('synthetic');}},profile:{role:'admin'}});}};`;

const browser = await chromium.launch(launchOptions());
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('PASS ' + m); };
try {
  for (const width of [390, 1280]) {
    seed();
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], ops = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.exposeFunction('__db', async (op, path, patch) => {
      if (op === 'list') return [...DB.keys()].filter(k => k.startsWith(path + '/') && k.split('/').length === 2).map(k => ({ id: k.split('/')[1], data: DB.get(k) }));
      if (op === 'get') return DB.get(path) || null;
      if (op === 'patch') { DB.set(path, { ...(DB.get(path) || {}), ...patch }); return true; }
      return null;
    });
    await page.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === 'www.gstatic.com') return route.fulfill({ contentType: 'text/javascript', body: u.pathname.includes('firestore') ? FIREBASE_STUB : '' });
      if (u.hostname !== 'boom.test') return route.fulfill({ status: 204, body: '' });
      if (u.pathname === '/' || u.pathname === '/pre-agreement-admin') return route.fulfill({ contentType: 'text/html', body: page0 });
      if (u.pathname === '/js/boom-portal.js') return route.fulfill({ contentType: 'text/javascript', body: PORTAL_STUB });
      if (u.pathname === '/js/firebase-config.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (u.pathname.startsWith('/js/')) return route.fulfill({ contentType: 'text/javascript', body: js(u.pathname.slice(1)) });
      if (u.pathname === '/api/preagreement/sign-for') {
        const b = route.request().postDataJSON(); ops.push(b);
        const r = await call(b);
        await route.fulfill({ status: r.code, contentType: 'application/json', body: JSON.stringify(r.body) });
        await page.evaluate(() => window.__refresh && window.__refresh()).catch(() => {});
        return;
      }
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('https://boom.test/');
    const row = page.locator('.parow').first();
    await row.waitFor({ timeout: 10000 });
    ok(await row.getByText('Provvigione').count() > 0 && /€1,464/.test(await row.innerText()), width + 'px: la riga dice la provvigione e la cifra firmata');
    ok(await row.getByRole('button', { name: '📎 Carica firmato' }).count() === 1, width + 'px: «📎 Carica firmato» anche senza contratto');

    // 💶 il link della provvigione, col messaggio pronto per WhatsApp
    await row.getByRole('button', { name: '💶 Link provvigione' }).click();
    const ps = page.locator('#psov');
    await ps.waitFor({ timeout: 10000 });
    const wa = await ps.getByRole('link', { name: '📲 Manda su WhatsApp' }).getAttribute('href');
    ok(/^https:\/\/wa\.me\/393331112222\?text=/.test(wa) && decodeURIComponent(wa).includes('/api/payments/link?k=inv&id=prov_pa1'), width + 'px: WhatsApp all’inquilino col link di pagamento');
    ok(DB.get('invoices/prov_pa1').amount === 1464 && ops.filter(o => o.op === 'fee-link').length === 1, width + 'px: una fattura, una chiamata');
    if (process.env.PAEXT_SHOT) await page.screenshot({ path: process.env.PAEXT_SHOT + '/fee-' + width + '.png' });
    await ps.getByRole('button', { name: 'Chiudi' }).click();
    await page.waitForFunction(() => /link pronto/.test(document.querySelector('.parow').innerText), null, { timeout: 5000 });
    ok(true, width + 'px: la riga si aggiorna: link pronto');

    // 📎 il firmato: contratto + profili + PDF + dopo
    await page.locator('.parow').first().getByRole('button', { name: '📎 Carica firmato' }).click();
    const ov = page.locator('#extov');
    await ov.waitFor({ timeout: 15000 });
    ok(ops.some(o => o.op === 'ext-contract' && o.createProperty === true), width + 'px: il contratto nasce dalla proposta (con conferma), immobile compreso');
    const go = ov.getByRole('button', { name: 'Carica e continua' });
    ok(await go.isDisabled(), width + 'px: senza profili il caricamento è fermo, e il pannello dice perché');
    ok(/Proprietario[\s\S]*Maria Verdi/.test(await ov.innerText()), width + 'px: il piano nomina il proprietario da creare');
    await ov.getByRole('button', { name: /Crea \/ collega i profili/ }).click();
    await page.waitForFunction(() => /Tutte le parti hanno il loro profilo/.test((document.getElementById('extov') || {}).innerText || ''), null, { timeout: 15000 });
    ok(!(await page.locator('#extov').getByRole('button', { name: 'Carica e continua' }).isDisabled()), width + 'px: profili creati, il caricamento si sblocca');
    const ov2 = page.locator('#extov');
    if (process.env.PAEXT_SHOT) await page.screenshot({ path: process.env.PAEXT_SHOT + '/ext-' + width + '.png', fullPage: false });
    ok(/Canone\s*€1,000\/mese/.test(await ov2.innerText()), width + 'px: i dati da controllare sono quelli del contratto');
    await ov2.getByRole('button', { name: 'Carica e continua' }).click();
    ok(/Scegli il PDF/.test(await ov2.locator('#extMsg').innerText()), width + 'px: senza file non parte niente');
    await ov2.locator('#extFile').setInputFiles({ name: 'firmato.pdf', mimeType: 'application/pdf', buffer: SIGNED_PDF });
    await ov2.getByRole('button', { name: 'Carica e continua' }).click();
    ok(!ops.some(o => o.op === 'ext-adopt'), width + 'px: senza le due conferme nessuna chiamata');
    await ov2.locator('#extOk1').check(); await ov2.locator('#extOk2').check();
    await ov2.getByRole('button', { name: 'Carica e continua' }).click();
    await page.waitForFunction(() => /Il journey riparte da solo/.test((document.getElementById('extMsg') || {}).textContent || ''), null, { timeout: 30000 });
    const msg = await ov2.locator('#extMsg').innerText();
    if (process.env.PAEXT_SHOT) await page.screenshot({ path: process.env.PAEXT_SHOT + '/done-' + width + '.png' });
    ok(/Contratto firmato acquisito/.test(msg) && /Benvenuto inviato/.test(msg) && /12 rate create/.test(msg), width + 'px: acquisito, recupero, benvenuto e 12 rate — detti uno per uno');
    const adopt = ops.find(o => o.op === 'ext-adopt');
    ok(adopt.pdfBase64 && adopt.confirmComplete === true && adopt.confirmTerms === true && /^\d{4}-\d{2}-\d{2}$/.test(adopt.signedDate), width + 'px: la richiesta porta PDF, data e conferme');
    const onb = ops.find(o => o.op === 'ext-onboard');
    ok(onb.welcome === true && onb.schedule === true, width + 'px: benvenuto e canoni chiesti esplicitamente (spunte)');
    ok(DB.get('contracts/pa_pa1').signatureStatus === 'complete' && DB.get('properties/prop_pa_pa1').status === 'rented', width + 'px: contratto firmato, immobile affittato');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, width + 'px: niente scorrimento laterale');
    await ov2.getByRole('button', { name: 'Chiudi' }).click();
    await page.waitForFunction(() => /Firmato fuori da Magic Sign/.test(document.querySelector('.parow').innerText), null, { timeout: 5000 });
    ok(true, width + 'px: la riga dice «Firmato fuori da Magic Sign», non «certificato FES»');
    ok(errors.length === 0, width + 'px: nessun errore JS (' + errors.join(' | ') + ')');
    await page.close();
  }
} finally { await browser.close(); }
console.log(`PA external UI: ${n} controlli passati`);
