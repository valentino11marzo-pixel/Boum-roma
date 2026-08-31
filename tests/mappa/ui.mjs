// tests/mappa/ui.mjs — IL QUADRANTE in un browser vero.
//
// I tile e il CDN di MapLibre non sono raggiungibili da qui: e' un
// VANTAGGIO, non un limite. Il pannello e' informazione pura e deve reggere
// anche quando la mappa non carica — prima restava sepolto sotto il cartello
// «Map engine unavailable», cioe' la pagina diventava un vicolo cieco
// proprio nel caso in cui serviva di piu'.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { loadChromium, launchOptions } from '../_browser.mjs';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const PORTA = +(process.env.PORTA || 8241);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (c, t) => c ? bene(t) : male(t);

console.log('\n\x1b[1m▸ mappaui\x1b[0m  il Quadrante regge anche senza mappa');

const chromium = await loadChromium();
if (!chromium) { console.log('  SKIP: playwright non disponibile'); process.exit(0); }

const srv = http.createServer((rq, rs) => {
  const f = path.join(R, rq.url.split('?')[0]);
  fs.readFile(f, (e, d) => e ? (rs.statusCode = 404, rs.end())
    : (rs.setHeader('content-type', f.endsWith('.css') ? 'text/css'
      : f.endsWith('.js') ? 'text/javascript' : 'text/html'), rs.end(d)));
}).listen(PORTA);

const br = await chromium.launch(await launchOptions());
for (const [w, tag] of [[390, 'telefono'], [1440, 'desktop']]) {
  const pg = await br.newPage({ viewport: { width: w, height: 844 },
    isMobile: w < 500, hasTouch: w < 500 });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message.slice(0, 80)));
  await pg.route('**/*', (r) => r.request().url().startsWith('http://localhost')
    ? r.continue() : r.abort());
  await pg.goto(`http://localhost:${PORTA}/skyline.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(1200);

  const a = await pg.evaluate(() => {
    const q = document.getElementById('quad');
    const l = document.getElementById('load');
    return { c: !!q, visibile: q && !q.hidden,
      righe: q ? q.querySelectorAll('.qr').length : 0,
      tempiVuoti: q ? q.querySelectorAll('.qr .tm').length : -1,
      veloVia: !l || l.style.display === 'none',
      nota: q ? document.getElementById('quadN').textContent : '',
      mete: document.getElementById('qfMeta')
        ? document.getElementById('qfMeta').options.length : 0 };
  });
  check(a.c && a.visibile, `${tag}: il Quadrante c'e ed e visibile`);
  check(a.righe === 9, `${tag}: la legenda porta le 9 mete della citta`);
  check(a.tempiVuoti === 0,
    `${tag}: a riposo NESSUNA colonna dei tempi (un trattino ripetuto si legge come rotto)`);
  check(a.veloVia && /list view|distances below/i.test(a.nota),
    `${tag}: senza mappa il velo se ne va e il pannello dice cosa resta`);
  check(a.mete === 9, `${tag}: il filtro per minuti conosce tutte le mete`);

  // la porta scelta: numeri col loro GRADO DI VERITA'
  const b = await pg.evaluate(() => {
    if (!window.__quadrante) return null;
    window.__quadrante.perCasa({ lat: 41.8902, lng: 12.5100, nome: 'Prova' });
    const q = document.getElementById('quad');
    return { titolo: document.getElementById('quadT').textContent,
      scelta: q.classList.contains('scelta'),
      gradi: [...q.querySelectorAll('.qr .tm i')].map((e) => e.textContent),
      numeri: [...q.querySelectorAll('.qr .tm b')].map((e) => e.textContent) };
  });
  check(b && b.scelta && b.titolo === 'Prova',
    `${tag}: scelta una porta, il pannello diventa il suo cruscotto`);
  check(b && b.gradi.length && b.gradi.every((g) => /measured|on foot|estimate/.test(g)),
    `${tag}: OGNI numero dichiara da dove viene`);
  check(b && b.numeri.some((n) => n.startsWith('≈'))
        && b.numeri.some((n) => !n.startsWith('≈')),
    `${tag}: la stima porta la ≈, il misurato no`);

  // si torna alla citta'
  const c = await pg.evaluate(() => {
    document.getElementById('quadX').click();
    const q = document.getElementById('quad');
    return { scelta: q.classList.contains('scelta'),
      tempi: q.querySelectorAll('.qr .tm').length };
  });
  check(c && !c.scelta && c.tempi === 0, `${tag}: si torna alla citta pulita`);
  check(!errs.length, `${tag}: nessun errore JS` + (errs.length ? ' — ' + errs[0] : ''));
  await pg.close();
}
await br.close(); srv.close();
console.log(ko ? `  \x1b[31mIl Quadrante non tiene\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mIl Quadrante tiene\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
