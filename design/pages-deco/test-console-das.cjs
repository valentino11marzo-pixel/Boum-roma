const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const U = 'http://localhost:8172/deal-assistance.html';
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route(/fonts\.|googletagmanager|google-analytics|firebase/, r => r.abort());
  await pg.goto(U, { waitUntil: 'load' }); await pg.waitForTimeout(1400);
  const E = []; const ok = (n, v) => E.push((v ? 'OK ' : 'FAIL ') + n);
  ok('8 righe, la prima aperta su desktop', await pg.evaluate(() =>
    document.querySelectorAll('.riga').length === 8 && document.getElementById('d1').open));
  ok('le 6 domande del FAQPage sono <summary> VISIBILI', await pg.evaluate(() => {
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => s.textContent).find(t => t.includes('FAQPage'));
    const qs = [...ld.matchAll(/"name"\s*:\s*"([^"]+\?)"/g)].map(m => m[1]);
    const vis = [...document.querySelectorAll('.r-q')].map(e => e.textContent.trim());
    return qs.length === 6 && qs.every(q => vis.includes(q));
  }));
  ok('registro: 5 righe + il rischio', await pg.evaluate(() =>
    document.querySelectorAll('.libro .lp').length === 5 &&
    /risk/i.test(document.querySelector('.lp.tot .lp-v').textContent)));
  ok('la cassa originale e intatta', await pg.evaluate(() =>
    typeof openSheet === 'function' && typeof paySheet === 'function' &&
    !!document.getElementById('ov') && !!document.getElementById('sGo')));
  await pg.click('#d5 > summary'); await pg.waitForTimeout(900);
  ok('apertura: contatore + segmenti + sala delle regole', await pg.evaluate(() =>
    document.getElementById('csStato').textContent.startsWith('2') &&
    document.querySelectorAll('#csSeg i.acceso').length === 2 &&
    document.querySelectorAll('#d5 .regolaR').length === 6));
  ok('invito alla cassa dopo due', await pg.evaluate(() =>
    document.getElementById('csBasta').classList.contains('viva')));
  ok('verdetto semaforo in d1', await pg.evaluate(() =>
    document.querySelectorAll('#d1 .vd').length === 3));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  await pg.keyboard.press('7'); await pg.waitForTimeout(600);
  ok('tastiera: 7 apre la fiducia', await pg.evaluate(() => document.getElementById('d7').open));
  await pg.evaluate(() => document.getElementById('cons').scrollIntoView({block:'start'}));
  await pg.waitForTimeout(700);
  ok('barra della console visibile', await pg.evaluate(() =>
    document.getElementById('hud').classList.contains('su')));
  // la cassa si apre davvero
  await pg.evaluate(() => openSheet('test')); await pg.waitForTimeout(600);
  ok('foglio Stripe si apre', await pg.evaluate(() =>
    document.getElementById('ov').classList.contains('on')));
  await pg.close();
  const m = await br.newPage({ viewport: { width: 390, height: 844 } });
  m.on('pageerror', e => errs.push('mob:' + e.message));
  await m.route(/fonts\.|googletagmanager|google-analytics|firebase/, r => r.abort());
  await m.goto(U, { waitUntil: 'load' }); await m.waitForTimeout(1300);
  const vp = await m.evaluate(() => +(document.documentElement.scrollHeight/innerHeight).toFixed(1));
  ok('mobile: ' + vp + ' schermate (era 9.2)', vp <= 8);
  ok('mobile senza sforo', await m.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0);
  ok('mobile: niente tagliato nelle righe', await m.evaluate(() =>
    [...document.querySelectorAll('.riga > summary *')].every(e => e.getBoundingClientRect().right <= innerWidth + 1)));
  await m.close();
  const nj = await br.newContext({ javaScriptEnabled: false });
  const p3 = await nj.newPage();
  await p3.route(/fonts\.|googletagmanager|google-analytics|firebase/, r => r.abort());
  await p3.goto(U, { waitUntil: 'load' }); await p3.waitForTimeout(400);
  await p3.click('#d3 > summary'); await p3.waitForTimeout(300);
  ok('senza JS le domande si aprono', await p3.evaluate(() =>
    document.getElementById('d3').hasAttribute('open')));
  await nj.close();
  console.log(E.join('\n'));
  console.log(errs.length ? 'ERRORI: ' + [...new Set(errs)].join(' | ') : 'zero pageerror');
  await br.close();
})();
