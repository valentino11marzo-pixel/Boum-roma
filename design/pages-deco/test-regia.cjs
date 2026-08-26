const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await br.newPage({ viewport: { width: 1440, height: 950 } });
  await pg.route(/fonts\.|firebasestorage/, r => r.abort());
  await pg.goto('file:///home/user/Boum-roma/property-finding.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1400);
  const filoAcceso = await pg.evaluate(() => document.body.classList.contains('volo-on'));
  const tappe = await pg.locator('.rf-tappa').count();
  // scroll a metà pagina: scia e aereo devono muoversi, tappe accendersi
  await pg.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * .5));
  await pg.waitForTimeout(500);
  const meta = await pg.evaluate(() => ({
    scia: document.querySelector('.rf-scia').style.height,
    passate: document.querySelectorAll('.rf-tappa.passata').length
  }));
  // il montaggio: il form si arma e monta quando arriva in vista
  await pg.locator('#checkin').scrollIntoViewIfNeeded();
  await pg.waitForTimeout(1600);
  const monta = await pg.evaluate(() => document.getElementById('ckForm').className);
  // la zecca: il nome finisce nel link
  await pg.fill('#pmNome', "Valentino D'Angelo");
  await pg.waitForTimeout(200);
  const href = await pg.evaluate(() => document.getElementById('pmVai').href);
  // screenshot del filo a metà scroll
  await pg.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * .45));
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: 'pfs5-filo.png', clip: { x: 0, y: 0, width: 720, height: 950 } });
  console.log('volo-on:', filoAcceso, '· tappe:', tappe, '· a metà:', JSON.stringify(meta));
  console.log('ckForm:', monta.includes('monta') ? 'MONTATO' : monta);
  console.log('zecca href:', href);
  const ok = filoAcceso && tappe === 7 && parseFloat(meta.scia) > 40
    && meta.passate >= 2 && monta.includes('monta')
    && href.includes('name=Valentino');
  console.log(ok ? 'REGIA OK' : 'REGIA ROTTA');
  process.exit(ok ? 0 : 1);
})();
