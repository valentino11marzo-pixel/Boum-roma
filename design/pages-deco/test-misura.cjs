const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  await pg.route(/fonts\.(googleapis|gstatic)\.com|firebasestorage|googletagmanager/, r => r.abort());

  await pg.goto('file:///home/user/Boum-roma/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1200);
  const prima = await pg.evaluate(() =>
    (window.dataLayer || []).filter(a => a[0] === 'event' && a[1] === 'gate_view').length);
  await pg.locator('#prBiglietti').scrollIntoViewIfNeeded();
  await pg.waitForTimeout(900);
  const vista = await pg.evaluate(() =>
    (window.dataLayer || []).filter(a => a[0] === 'event' && a[1] === 'gate_view').length);
  // click sull'ammiraglia SENZA navigare (preventDefault da spia esterna)
  await pg.evaluate(() => {
    document.getElementById('prBiglietti')
      .addEventListener('click', e => e.preventDefault(), true);
  });
  await pg.locator('.bp.eroe').click({ position: { x: 300, y: 60 } });
  await pg.locator('.bp.vv').click();
  await pg.waitForTimeout(300);
  const click = await pg.evaluate(() =>
    (window.dataLayer || []).filter(a => a[0] === 'event' && a[1] === 'gate_click').map(a => Object.assign({}, a[2])));
  console.log('gate_view prima dello scroll:', prima, '(atteso 0)');
  console.log('gate_view dopo lo scroll:', vista, '(atteso 1)');
  console.log('gate_click:', JSON.stringify(click, null, 1));
  const ok = prima === 0 && vista === 1 && click.length === 2
    && click[0].service === 'property-finding' && click[0].price === '350'
    && click[0].flagship === 1
    && click[1].service === 'virtual-viewing' && click[1].flagship === 0;
  console.log(ok ? 'MISURA OK' : 'MISURA ROTTA');
  process.exit(ok ? 0 : 1);
})();
