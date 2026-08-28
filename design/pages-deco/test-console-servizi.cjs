/* LA BATTERIA DELLE SEI PAGINE SERVIZIO — Chromium vero.
   Una sola regola per tutte: quello che il JSON-LD dichiara deve stare
   in pagina come testo visibile, la pagina deve funzionare senza JS, e
   niente deve uscire dallo schermo del telefono. */
// Il browser lo risolve tests/_browser.mjs, mai un percorso cablato: una
// suite verde su una macchina sola non e' una suite (lezione 19/08/2026).
const { loadChromium, launchOptions } = require('node:module')
  .createRequire(__filename)('../../tests/_browser.cjs');
// Il server se lo avvia la suite: dipendere da un `python3 -m http.server`
// lanciato a mano significa verde in locale e rosso in CI.
const PORTA = process.env.PORTA || 8174;
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '../..');
const srv = require('http').createServer((rq, rs) => {
  const f = path.join(R, rq.url.split('?')[0]);
  fs.readFile(f, (e, d) => e ? (rs.statusCode = 404, rs.end())
    : (rs.setHeader('content-type', f.endsWith('.css') ? 'text/css'
      : f.endsWith('.js') ? 'text/javascript' : 'text/html'), rs.end(d)));
});
// [file, prefisso righe, quante, come si compra]
// Concierge non ha cassa Stripe per PROGETTO: si preventiva a voce.
// Il test non pretende una cassa dove non deve esistere.
const PAG = [
  ['deal-assistance.html',       'd', 8, 'stripe'],
  ['virtual-viewing.html',       'v', 8, 'stripe'],
  ['contract-check-express.html','c', 6, 'stripe'],
  ['deposit-recovery.html',      'r', 6, 'stripe'],
  ['remote-move-pack.html',      'm', 6, 'stripe'],
  ['concierge.html',             'g', 6, 'whatsapp'],
];
const SOGLIA_VP = 8.5;
(async () => {
    const chromium = await loadChromium();
  if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }
  srv.listen(PORTA);
  const br = await chromium.launch(await launchOptions());
  let guasti = 0;
  for (const [file, pre, n, cassa] of PAG) {
    const U = `http://localhost:${PORTA}/${file}`;
    const E = [], errs = [];
    const ok = (t, v) => { E.push((v ? '  OK   ' : '  FAIL ') + t); if (!v) guasti++; };
    const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
    pg.on('pageerror', e => errs.push(e.message));
    await pg.route(/fonts\.|googletagmanager|google-analytics|firebase/, r => r.abort());
    await pg.goto(U, { waitUntil: 'load' }); await pg.waitForTimeout(1400);

    ok(`${n} righe, la prima aperta su desktop`, await pg.evaluate(([pre, n]) =>
      document.querySelectorAll('.riga').length === n &&
      document.getElementById(pre + '1').open, [pre, n]));

    ok('ogni domanda del FAQPage e un <summary> VISIBILE', await pg.evaluate(() => {
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => s.textContent).find(t => t.includes('FAQPage'));
      if (!ld) return false;
      const qs = [...ld.matchAll(/"name"\s*:\s*"([^"]+\?)"/g)].map(m => m[1]);
      const vis = [...document.querySelectorAll('.r-q')].map(e => e.textContent.trim());
      return qs.length > 0 && qs.every(q => vis.includes(q));
    }));

    ok('la vecchia FAQ non e rimasta in pagina', await pg.evaluate(() =>
      !document.querySelector('.faq')));

    // La regola che conta per SEO/AI: cio' che la pagina DICHIARA a un
    // motore dev'essere cio' che MOSTRA a un umano. Una risposta diversa
    // nel JSON-LD e' contenuto nascosto, e su DAS quella diversa era la
    // media «€600+» che non sappiamo dimostrare.
    ok('la risposta dichiarata e la risposta mostrata', await pg.evaluate(() => {
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => { try { return JSON.parse(s.textContent); } catch (e) { return null; } })
        .find(d => d && d['@type'] === 'FAQPage');
      if (!ld) return false;
      const piano = t => t.replace(/\s+/g, ' ').trim().toLowerCase();
      return ld.mainEntity.every(q => {
        const riga = [...document.querySelectorAll('.riga')]
          .find(r => r.querySelector('.r-q').textContent.trim() === q.name);
        if (!riga) return false;
        // tutta la riga: il colpo sta nel sommario, il resto nel corpo
        const vis = piano(riga.textContent);
        const dic = piano(q.acceptedAnswer.text);
        // ogni parola dichiarata deve esistere nel testo visibile
        return dic.split(' ').slice(0, 25).every(w => vis.includes(w));
      });
    }));

    ok('nessuna promessa non dimostrabile nella cassa', await pg.evaluate(() =>
      !/€600\+|average client saves/i.test(document.body.textContent)));

    ok('il registro esiste e finisce con la riga totale', await pg.evaluate(() =>
      document.querySelectorAll('.libro .lp').length >= 4 &&
      !!document.querySelector('.lp.tot .lp-v')));

    ok(cassa === 'stripe' ? 'la cassa originale e intatta'
                          : 'si compra su WhatsApp, e non finge una cassa',
      await pg.evaluate((cassa) => cassa === 'stripe'
        ? (typeof openSheet === 'function' && !!document.getElementById('ov'))
        : (!/openSheet\(/.test(document.documentElement.innerHTML) &&
           !!document.querySelector('a[href^="https://wa.me/"]')), cassa));

    // apertura di due righe → contatore, segmenti, invito alla cassa
    await pg.click(`#${pre}3 > summary`); await pg.waitForTimeout(900);
    ok('apre: contatore e segmenti seguono', await pg.evaluate(() =>
      document.getElementById('csStato').textContent.trim().startsWith('2') &&
      document.querySelectorAll('#csSeg i.acceso').length === 2));
    ok('invito alla cassa dopo due risposte', await pg.evaluate(() =>
      document.getElementById('csBasta').classList.contains('viva')));

    await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
    await pg.keyboard.press(String(n)); await pg.waitForTimeout(600);
    ok(`tastiera: ${n} apre l ultima riga`, await pg.evaluate(([pre, n]) =>
      document.getElementById(pre + n).open, [pre, n]));

    await pg.evaluate(() => document.getElementById('cons').scrollIntoView({ block: 'start' }));
    await pg.waitForTimeout(700);
    ok('la barra della console e in vista', await pg.evaluate(() =>
      document.getElementById('hud').classList.contains('su')));

    ok('il piede porta le prove verificabili', await pg.evaluate(() =>
      /17322991005/.test(document.body.textContent) &&
      /019317594/.test(document.body.textContent)));
    await pg.close();

    // telefono
    const m = await br.newPage({ viewport: { width: 390, height: 844 } });
    m.on('pageerror', e => errs.push('mob:' + e.message));
    await m.route(/fonts\.|googletagmanager|google-analytics|firebase/, r => r.abort());
    await m.goto(U, { waitUntil: 'load' }); await m.waitForTimeout(1300);
    const vp = await m.evaluate(() => +(document.documentElement.scrollHeight / innerHeight).toFixed(1));
    ok(`mobile: ${vp} schermate`, vp <= SOGLIA_VP);
    ok('mobile: nessuno sforo orizzontale', await m.evaluate(() =>
      document.documentElement.scrollWidth - innerWidth) <= 0);
    ok('mobile: niente tagliato nelle righe', await m.evaluate(() =>
      [...document.querySelectorAll('.riga > summary *')]
        .every(e => e.getBoundingClientRect().right <= innerWidth + 1)));
    ok('mobile: bersagli >=40px', await m.evaluate(() =>
      [...document.querySelectorAll('.riga > summary')]
        .every(e => e.getBoundingClientRect().height >= 40)));
    await m.close();

    // senza JS
    const nj = await br.newContext({ javaScriptEnabled: false });
    const p3 = await nj.newPage();
    await p3.route(/fonts\.|googletagmanager|google-analytics|firebase/, r => r.abort());
    await p3.goto(U, { waitUntil: 'load' }); await p3.waitForTimeout(400);
    await p3.click(`#${pre}2 > summary`); await p3.waitForTimeout(300);
    ok('senza JS le domande si aprono lo stesso', await p3.evaluate(([pre]) =>
      document.getElementById(pre + '2').hasAttribute('open'), [pre]));
    await nj.close();

    console.log('── ' + file);
    console.log(E.join('\n'));
    if (errs.length) { guasti++; console.log('  ERRORI: ' + [...new Set(errs)].join(' | ')); }
    else console.log('  zero pageerror');
  }
  await br.close(); srv.close();
  console.log(guasti ? `\n${guasti} GUASTI` : '\nTUTTO VERDE');
  process.exit(guasti ? 1 : 0);
})();
