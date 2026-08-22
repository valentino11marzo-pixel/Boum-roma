
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await br.newPage({ viewport: { width: 1440, height: 1000 } });
  await pg.route(/fonts\./, r => r.abort());
  await pg.goto('file:///tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/variante-innesto.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: 'shot-innesto-riposo.png', fullPage: true });
  await pg.hover('.sm.eroe');
  await pg.waitForTimeout(1100);
  await (await pg.$('.sm.eroe')).screenshot({ path: 'shot-innesto-dock.png' });
  await br.close();
  console.log('innesto shots ok');
})();
