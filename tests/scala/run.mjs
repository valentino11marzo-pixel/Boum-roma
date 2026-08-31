// tests/scala/run.mjs — LA SCALA DI RICADUTA DEL CDN, PROVATA DAVVERO.
//
// Dai log del 31/08/2026: il portale dell'operatore ha riportato due volte
// `{"message":"Script error.","source":"","line":0,"col":0,"stack":""}`.
// È la forma che il browser dà quando a lanciare è uno script di un altro
// dominio: per policy nasconde tutto. Sappiamo CHE è andato in errore e non
// possiamo sapere IN COSA — la telemetria c'è ed è muta.
//
// `crossorigin="anonymous"` smaschera l'errore, ma solo se il CDN risponde
// con l'intestazione CORS. Se non la manda, lo script NON CARICA AFFATTO — e
// su portal.html quello significa pagina bianca, perché Firebase è tutto il
// portale, e il gestore d'errore esistente sostituisce il body con un
// cartello di guasto.
//
// Non si scommette su un'intestazione che non possiamo verificare da qui:
// si costruisce una scala e si PROVA il gradino peggiore. Questa suite serve
// uno script SENZA header CORS — cioè simula esattamente il CDN che non
// collabora — e pretende che la pagina si rialzi da sola.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';

const PORT = 8936;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }

// Il finto CDN: /lib.js risponde SENZA Access-Control-Allow-Origin, quindi
// una richiesta in modalità CORS (crossorigin="anonymous") fallisce, mentre
// quella normale riesce. È il caso che vogliamo sopravvivere.
let servedCors = 0, servedPlain = 0;
const cdn = createServer((req, res) => {
  if (req.url.startsWith('/lib.js')) {
    if (req.headers.origin) { servedCors++; res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('window.__lib=1;'); }
    else { servedPlain++; res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('window.__lib=1;'); }
    return;
  }
  res.writeHead(404).end();
});
await new Promise((r) => cdn.listen(PORT + 1, r));

// La pagina: la STESSA scala di portal.html, estratta alla lettera dal file.
import { readFileSync } from 'node:fs';
const portal = readFileSync(new URL('../../portal.html', import.meta.url), 'utf8');
const ladder = portal.slice(portal.indexOf('window.__fbRetried = {};'), portal.indexOf('function onFirebaseScriptError') + 700);
ok(/hasAttribute\('crossorigin'\)/.test(ladder) && /__fbRetried\[src\]/.test(ladder),
  'la scala vive in portal.html (è quella che si prova, non una copia scritta qui)');

const page404 = `<!doctype html><html><body>
<script>
window.firebaseScriptsLoaded = 0; window.__errCard = 0;
function onFirebaseScriptLoad(){ window.firebaseScriptsLoaded++; }
${ladder.replace(/document\.body\.innerHTML = `[\s\S]*$/, 'window.__errCard = 1;\n        }')}
<\/script>
<script crossorigin="anonymous" src="http://localhost:${PORT + 1}/lib.js" onload="onFirebaseScriptLoad()" onerror="onFirebaseScriptError(event)"><\/script>
</body></html>`;

const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page404); });
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();
const warns = [];
page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

const st = await page.evaluate(() => ({ lib: window.__lib, loaded: window.firebaseScriptsLoaded, card: window.__errCard }));
ok(st.lib === 1, 'il CDN che NON manda CORS non lascia la pagina senza script: la scala lo ricarica in chiaro');
ok(st.loaded === 1, 'e il conteggio del boot avanza come se nulla fosse (onload arriva davvero)');
ok(st.card === 0, "nessun cartello di guasto: l'operatore non vede niente di anomalo");
ok(warns.some((w) => /senza CORS/.test(w)), 'ma resta scritto nella console PERCHÉ si è ricaduti (mai un ripiego muto)');

// e non deve ritentare all'infinito: un CDN davvero irraggiungibile deve
// arrivare al cartello, non entrare in ciclo
const retried = await page.evaluate(() => Object.keys(window.__fbRetried).length);
ok(retried === 1, 'un solo tentativo per script: un CDN morto arriva al cartello, non a un ciclo infinito');

await browser.close(); server.close(); cdn.close();

// e la scala deve essere ATTACCATA a tutti e quattro i tag, o metà portale
// resta cieco come prima
const tags = (portal.match(/<script crossorigin="anonymous" src="https:\/\/www\.gstatic\.com\/firebasejs/g) || []).length;
ok(tags === 4, `tutti e quattro gli SDK Firebase chiedono l'errore in chiaro (trovati ${tags})`);
ok(!/<script src="https:\/\/www\.gstatic\.com\/firebasejs/.test(portal), 'nessun tag rimasto indietro senza crossorigin');

console.log(`\n${fail ? '✗' : '✓'} scala: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
