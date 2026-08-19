const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const sky = fs.readFileSync('/home/user/Boum-roma/skyline.html', 'utf8');
  await pg.route('**/skyline?embed=1', r =>
    r.fulfill({ status: 200, contentType: 'text/html', body: sky }));
  await pg.route('**firestore.googleapis.com/**', r => r.abort());
  await pg.route('**cdn.jsdelivr.net/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await pg.route('**/sw.js', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await pg.goto('http://localhost:8123/boom-portale-sito.html');
  await pg.waitForTimeout(1500);
  await pg.locator('#cielo').scrollIntoViewIfNeeded();
  await pg.waitForTimeout(5200);
  const r = await pg.evaluate(() => ({
    iframe: !!document.querySelector('#cieloMappa iframe'),
    src: (document.querySelector('#cieloMappa iframe') || {}).src || '',
    hud: !!document.querySelector('#cielo .cielo-hud'),
    veloVia: document.getElementById('cieloVelo').classList.contains('via'),
    embNascosto: (() => { try {
      const d = document.querySelector('#cieloMappa iframe').contentDocument;
      return d.documentElement.classList.contains('emb')
        && getComputedStyle(d.querySelector('.bar')).display === 'none';
    } catch (e) { return 'x-origin'; } })(),
  }));
  console.log(JSON.stringify(r, null, 1));
  const ok = r.iframe && /skyline\?embed=1/.test(r.src) && !r.hud
    && r.veloVia && r.embNascosto === true && errs.filter(e => !/ServiceWorker/.test(e)).length === 0;
  console.log(ok ? 'FINESTRA SKYLINE: TUTTO VERDE' : 'GUASTO ' + errs.join('|'));
  await pg.close(); await br.close();
  process.exit(ok ? 0 : 1);
})();
