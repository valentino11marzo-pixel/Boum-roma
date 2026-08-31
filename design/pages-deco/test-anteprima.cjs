/* L'ANTEPRIMA E' LA PAGINA — e si dimostra.
   Le anteprime pubblicate come artifact sono state HTML NUDO per un giro
   intero: anteprima.py consegnava il corpo senza <head>, e con l'head se
   ne andavano tutti i fogli di stile. Nessuno se n'e' accorto finche' non
   l'ha aperta un telefono. Questo test confronta l'anteprima con la
   pagina VERA nello stesso browser: stesso fondo, stessa geometria delle
   barre, stesse righe, zero errori. Se divergono, e' un guasto. */
// Il browser lo risolve tests/_browser.mjs, mai un percorso cablato: una
// suite verde su una macchina sola non e' una suite (lezione 19/08/2026).
const { loadChromium, launchOptions } = require('node:module')
  .createRequire(__filename)('../../tests/_browser.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const R = '/home/user/Boum-roma/';
const PORTA = process.env.PORTA || 8173;
const PAG = ['deal-assistance', 'virtual-viewing', 'contract-check-express',
             'deposit-recovery', 'remote-move-pack', 'concierge'];
const rilievo = () => ({
  fondo: getComputedStyle(document.body).backgroundColor,
  righe: document.querySelectorAll('.riga').length,
  hud: !!document.getElementById('hud'),
  registro: !!document.getElementById('registro'),
  navBasso: Math.round((document.querySelector('.nav') || {}).getBoundingClientRect
    ? document.querySelector('.nav').getBoundingClientRect().bottom : -1),
  famAlto: (() => { const f = document.querySelector('.fam');
    return f ? Math.round(f.getBoundingClientRect().top) : -1; })(),
  sforo: document.documentElement.scrollWidth - innerWidth,
  carattere: getComputedStyle(document.querySelector('.r-q') || document.body).fontFamily,
});
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anteprima-'));
  const srv = require('http').createServer((rq, rs) => {
    const f = rq.url.startsWith('/__a/') ? path.join(tmp, rq.url.slice(5))
                                         : path.join(R, rq.url.split('?')[0]);
    fs.readFile(f, (e, d) => e ? (rs.statusCode = 404, rs.end())
      : (rs.setHeader('content-type', f.endsWith('.css') ? 'text/css'
        : f.endsWith('.js') ? 'text/javascript' : 'text/html'), rs.end(d)));
  }).listen(PORTA);
    const chromium = await loadChromium();
  if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }
  const br = await chromium.launch(await launchOptions());
  const E = []; let guasti = 0;
  const ok = (t, v) => { E.push((v ? 'OK   ' : 'FAIL ') + t); if (!v) guasti++; };
  for (const p of PAG) {
    // il guscio dell'artifact: doctype/head/body + reset minimo
    const corpo = path.join(tmp, p + '.body.html');
    execFileSync('python3', [R + 'design/pages-deco/anteprima.py', p + '.html', corpo]);
    fs.writeFileSync(path.join(tmp, p + '.html'),
      `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>
</head><body>${fs.readFileSync(corpo, 'utf8')}</body></html>`);
    for (const [w, h, mob] of [[390, 844, true], [1440, 900, false]]) {
      const misure = [], errori = [];
      for (const u of [`/${p}.html`, `/__a/${p}.html`]) {
        const pg = await br.newPage({ viewport: { width: w, height: h },
          deviceScaleFactor: mob ? 2 : 1, isMobile: mob, hasTouch: mob });
        const err = [];
        pg.on('pageerror', e => err.push(e.message));
        await pg.route(/fonts\.|googletagmanager|google-analytics|firebase|imgur/,
          r => r.abort());
        await pg.goto(`http://localhost:${PORTA}${u}`, { waitUntil: 'load' });
        await pg.waitForTimeout(1200);
        misure.push(await pg.evaluate(rilievo));
        errori.push(err);
        await pg.close();
      }
      const [vera, ante] = misure;
      const q = mob ? '390px' : '1440px';
      ok(`${p} ${q}: l'anteprima e' vestita come la pagina`,
        ante.fondo === vera.fondo && ante.carattere === vera.carattere);
      ok(`${p} ${q}: stessa geometria delle barre`,
        Math.abs(ante.navBasso - vera.navBasso) <= 2 &&
        Math.abs(ante.famAlto - vera.famAlto) <= 2);
      ok(`${p} ${q}: stesso contenuto (${ante.righe} righe, hud, registro)`,
        ante.righe === vera.righe && ante.righe > 0 && ante.hud && ante.registro);
      ok(`${p} ${q}: nessuno sforo orizzontale`, ante.sforo <= 0);
      ok(`${p} ${q}: nessun errore JS nell'anteprima`, errori[1].length === 0);
    }
  }
  await br.close(); srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(E.join('\n'));
  console.log(guasti ? `\n${guasti} GUASTI` : '\nL anteprima e la pagina — 60 controlli');
  process.exit(guasti ? 1 : 0);
})();
