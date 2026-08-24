// tests/inventario/ui.mjs — L'INVENTARIO IN UN BROWSER VERO, a 390px.
//
// La metà rischiosa di questa funzione non sta sul server: sta nel telefono
// che deve leggere un video e cavarne dei fotogrammi. Qui la pagina VERA
// (inventario.html) gira in Chromium col motore VERO
// (js/inventario-engine.js); stub solo ai confini — Firebase, BoomPortal e
// le due chiamate all'API.
//
// Il video del test non è un file finto: viene REGISTRATO nella pagina
// (canvas → MediaRecorder), e per questo riproduce la trappola vera —
// un filmato appena registrato dichiara `duration: Infinity` finché non lo
// si sonda. Senza la sonda, l'operatore che filma e carica subito si vede
// dire "video troppo corto": il caso normale, rotto.
//
// Si auto-skippa senza playwright, come le altre suite del repo.
// Uso: node tests/inventario/ui.mjs
import { readFileSync } from 'node:fs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const read = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

const PROPOSAL = {
  ok: true, frames: 8, model: 'claude-opus-5', transcript: 'sul divano c\'è uno strappo',
  proposal: {
    rooms: [
      { key: 'cucina', label: 'Cucina', n: 0, items: [
        { name: 'Lavastoviglie Bosch', qty: 1, condition: null, note: '', source: 'ai' },
        { name: 'Sedie', qty: 6, condition: null, note: '', source: 'ai' } ] },
      { key: 'soggiorno', label: 'Soggiorno', n: 0, items: [
        { name: 'Divano 3 posti', qty: 1, condition: 'danneggiato', note: 'strappo bracciolo', source: 'ai' } ] },
    ],
    warnings: ['2 condizioni generiche proposte dal video riportate a "non dichiarata": dichiarale tu se le hai verificate'],
    counts: { rooms: 2, items: 3, pieces: 8, undeclared: 2, damaged: 1 },
  },
};

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] });
const page = await ctx.newPage();
let saved = null;

await page.route('**/*', async (route) => {
  const url = route.request().url();
  const js = (body) => route.fulfill({ status: 200, contentType: 'application/javascript', body });
  if (url.includes('gstatic.com')) return js('window.firebase=window.firebase||{firestore:function(){return{collection:function(){return{doc:function(){return{get:function(){return Promise.resolve({exists:true,data:function(){return {}}})}}},limit:function(){return{get:function(){return Promise.resolve({forEach:function(){}})}}}}}}}};');
  if (url.endsWith('/js/firebase-config.js')) return js('/* stub */');
  if (url.endsWith('/js/boom-portal.js')) return js(`window.BoomPortal={requireAuth:function(){return Promise.resolve({user:{getIdToken:function(){return Promise.resolve('tok')}},profile:{role:'admin',name:'Valentino'}})}};`);
  if (url.endsWith('/js/inventario-engine.js')) return js(read('js/inventario-engine.js'));
  if (url.includes('/api/contracts/inventario')) {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.op === 'save') { saved = body; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage/inv.pdf', counts: { pieces: 8, rooms: 2 }, shots: 1 }) }); }
    globalThis.__analyzeBody = body;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROPOSAL) });
  }
  if (url.includes('/inventario')) return route.fulfill({ status: 200, contentType: 'text/html', body: read('inventario.html') });
  return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
});

const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('https://boomrome.com/inventario?p=p1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#form', { state: 'visible', timeout: 8000 });
check('la pagina si apre sull\'immobile (nessun loader appeso)', await page.isVisible('#form'));
check('nessun errore JS al boot', errs.length === 0);

// Aggiunta alla Home: la pagina deve aprirsi a schermo intero SULL'IMMOBILE
// che si sta rilevando. Un <link rel="manifest"> qui la dirotterebbe sullo
// start_url del portale — l'icona "Lucrino 41" aprirebbe la dashboard.
{
  const src = read('inventario.html');
  check('home-screen: dichiarata app a schermo intero (iOS + Android)', /apple-mobile-web-app-capable" content="yes"/.test(src) && /mobile-web-app-capable" content="yes"/.test(src));
  check('home-screen: NESSUN manifest dichiarato, o l\'icona per immobile aprirebbe il portale', !/<link[^>]*rel="manifest"/.test(src));
  check('home-screen: icona e colore della barra ci sono', /apple-touch-icon/.test(src) && /theme-color/.test(src));
}

// ── Il video: registrato QUI, quindi con la durata "Infinity" del caso vero ──
const rec = await page.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240;
  const cx = cv.getContext('2d');
  const stream = cv.captureStream(15);
  const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.start();
  const t0 = Date.now();
  await new Promise((ok) => {
    const draw = () => {
      const k = (Date.now() - t0) / 1000;
      cx.fillStyle = ['#8b3a2b', '#2b5f8b', '#3a8b2b'][Math.floor(k) % 3];
      cx.fillRect(0, 0, 320, 240);
      cx.fillStyle = '#fff'; cx.font = '40px sans-serif'; cx.fillText('s' + k.toFixed(1), 20, 120);
      if (k > 6) return ok(); requestAnimationFrame(draw);
    };
    draw();
  });
  await new Promise((ok) => { mr.onstop = ok; mr.stop(); });
  const blob = new Blob(chunks, { type: 'video/webm' });
  // la trappola, misurata: quanto dichiara un filmato appena registrato
  const probe = document.createElement('video');
  probe.src = URL.createObjectURL(blob);
  const dichiarata = await new Promise((ok) => { probe.onloadedmetadata = () => ok(probe.duration); setTimeout(() => ok(-1), 3000); });
  window.__testBlob = blob;
  return { size: blob.size, dichiarata };
});
check('il video di prova esiste davvero', rec.size > 1000);
// La trappola non si riproduce su OGNI browser (questa Chromium a volte
// calcola la durata da sola), quindi non la si pretende: si pretende che la
// sonda ESISTA — e quando il browser mente, il resto della suite prova che
// funziona lo stesso.
console.log('   (durata dichiarata dal filmato appena registrato: ' + rec.dichiarata + ')');
check('la sonda della durata è nel codice della pagina', /currentTime=1e7/.test(read('inventario.html')));
check('e chi non ha durata leggibile riceve un messaggio, non un silenzio', /durata illeggibile/.test(read('inventario.html')));

await page.evaluate(() => {
  const f = new File([window.__testBlob], 'giro.webm', { type: 'video/webm' });
  const dt = new DataTransfer(); dt.items.add(f);
  const input = document.getElementById('videoInput');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
});
await page.waitForSelector('#pickVideo.done', { timeout: 20000 }).catch(() => {});
const frames = await page.evaluate(() => document.querySelectorAll('#thumbs img').length);
check('i fotogrammi si estraggono da un video registrato al volo', frames >= 4);
check('e la pagina lo dice all\'operatore', /letto sul telefono/.test(await page.textContent('#vinfo')));
const px = await page.evaluate(() => {
  const img = document.querySelector('#thumbs img');
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data;
  let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  return sum;
});
check('i fotogrammi contengono immagine vera (non quadrati neri)', px > 0);

// ── L'analisi e l'elenco editabile ──
await page.click('#go');
await page.waitForSelector('#listCard', { state: 'visible', timeout: 10000 });
const body = globalThis.__analyzeBody || {};
check('analyze parte con l\'immobile e i fotogrammi veri', body.op === 'analyze' && body.propertyId === 'p1' && (body.frames || []).length >= 4);
check('il video NON viene caricato: solo immagini', JSON.stringify(body).indexOf('video/webm') === -1);
check('l\'avviso dice che nessuna riga è un fatto finché non la confermi', /Nessuna riga è un fatto/.test(await page.textContent('#aiWarn')));
check('e riporta cosa ha sentito', /strappo/.test(await page.textContent('#aiWarn')));
check('l\'elenco mostra le due stanze', (await page.$$('#rooms .room')).length === 2);
check('il totale conta i pezzi, non le righe', /8<\/b> pezzi/.test(await page.innerHTML('#tot')));
check('la voce senza condizione parte da "non dichiarata"', await page.$eval('#rooms select', (s) => s.value === ''));

// il cancello: senza spunta non si salva
await page.click('#save');
await page.waitForTimeout(250);
check('senza conferma non parte niente, e la pagina spiega perché', saved === null && /nessuno ha riguardato/.test(await page.textContent('#err')));

// l'operatore corregge una riga e conferma
await page.$eval('#rooms .room .nm', (el) => { el.value = 'Lavastoviglie Bosch SMS46'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.$eval('#rooms select', (el) => { el.value = 'buono'; el.dispatchEvent(new Event('change', { bubbles: true })); });
await page.check('#reviewed');
await page.click('#save');
await page.waitForSelector('#success', { state: 'visible', timeout: 8000 });

check('save parte con reviewed=true', saved && saved.reviewed === true && saved.op === 'save');
check('la correzione dell\'operatore viaggia', /SMS46/.test(JSON.stringify(saved.rooms)));
check('e la riga toccata è marcata come umana (vale più del video)', saved.rooms[0].items[0].source === 'human' && saved.rooms[0].items[0].condition === 'buono');
check('parte anche una manciata di fotogrammi come prova', (saved.shots || []).length >= 1 && (saved.shots || []).length <= 6);
check('la schermata finale porta il PDF', (await page.getAttribute('#sPdf', 'href')) === 'https://storage/inv.pdf');
check('nessun errore JS in tutto il giro', errs.length === 0);

await browser.close();
console.log(`\nInventario UI: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
