const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  // prendi due id veri dalle card della build
  const html = fs.readFileSync('boom-discovery-sito.html', 'utf8');
  const ids = [...new Set([...html.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]))];
  const [idA, idB] = [ids[0], ids[1]];
  const FINTO = { documents: [
    { name: 'projects/x/databases/(default)/documents/listings/' + idA,
      fields: { status: { stringValue: 'rented' }, price: { integerValue: '1500' } } },
    { name: 'projects/x/databases/(default)/documents/listings/' + idB,
      fields: { status: { stringValue: 'available' },
        availableDate: { stringValue: '2026-11-01' },
        price: { integerValue: '2222' } } },
  ] };
  await pg.route('**firestore.googleapis.com/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FINTO) }));
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await pg.goto('file://' + path.resolve('boom-discovery-sito.html'));
  await pg.waitForTimeout(2600);
  const r = await pg.evaluate(([a, b]) => {
    const ca = document.querySelector('.casa-p[data-id="' + a + '"]');
    const cb = document.querySelector('.casa-p[data-id="' + b + '"]');
    return {
      aStato: ca.querySelector('.casa-stato').textContent.trim(),
      aClasse: ca.querySelector('.casa-stato').className,
      bStato: cb.querySelector('.casa-stato').textContent.trim(),
      bPrezzo: cb.dataset.prezzo,
      bFlap: cb.querySelector('.flap-prezzo').dataset.p,
      bDal: cb.dataset.dal,
    };
  }, [idA, idB]);
  console.log(JSON.stringify(r, null, 1));
  const ok = r.aStato === 'Rented' && !/si|poi|fila/.test(r.aClasse)
    && /Free from 1 Nov/.test(r.bStato) && r.bPrezzo === '2222'
    && r.bFlap === '€2,222' && r.bDal === '2026-11-01' && errs.length === 0;
  console.log(ok ? 'IDRANTE VETRINA: TUTTO VERDE' : 'GUASTO ' + errs.join('|'));
  await pg.close(); await br.close();
  process.exit(ok ? 0 : 1);
})();
