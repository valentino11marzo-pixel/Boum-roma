const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await br.newPage({ viewport: { width: 1440, height: 950 } });
  await pg.route(/fonts\.|firebasestorage/, r => r.abort());
  let postBody = null;
  await pg.route(/\/api\/create-checkout/, async r => {
    postBody = JSON.parse(r.request().postData());
    await r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ url: 'https://checkout.stripe.com/finto' }) });
  });
  await pg.route(/checkout\.stripe\.com/, r =>
    r.fulfill({ contentType: 'text/html', body: '<title>STRIPE</title>ok' }));
  await pg.goto('file:///home/user/Boum-roma/property-finding.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(800);
  // 1) validazione: submit vuoto → errore, nessuna POST
  await pg.locator('#ckVai').click();
  const err1 = await pg.locator('#ckErr').textContent();
  console.log('vuoto → errore:', JSON.stringify(err1.slice(0, 40)), '· POST partita?', postBody !== null);
  // 2) more details apre i campi extra
  await pg.locator('#ckPiu').click();
  const extraVisibile = await pg.locator('#ckZone').isVisible();
  console.log('more details apre le zone:', extraVisibile);
  // 3) compila e vola
  await pg.fill('#ckNome', 'Test Passenger');
  await pg.fill('#ckMail', 'test@example.com');
  await pg.fill('#ckTel', '+393331234567');
  await pg.fill('#ckBudget', '1800');
  await pg.fill('#ckZone', 'Trastevere');
  await pg.locator('#ckVai').click();
  await pg.waitForURL(/stripe/, { timeout: 5000 });
  console.log('redirect a Stripe:', pg.url().includes('stripe'));
  console.log('POST body:', JSON.stringify(postBody));
  const ok = err1.length > 5 && extraVisibile
    && postBody && postBody.name === 'Test Passenger'
    && postBody.preferred_areas === 'Trastevere' && !postBody.company;
  console.log(ok ? 'CHECK-IN OK' : 'CHECK-IN ROTTO');
  process.exit(ok ? 0 : 1);
})();
