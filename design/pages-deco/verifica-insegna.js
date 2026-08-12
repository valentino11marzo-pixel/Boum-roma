// La verifica dell'Insegna: misure vere su ogni pagina trattata.
//   marchio 66px (58 mobile), lettering 30px (25 mobile), SVG a 8 anelli
//   byte-uguale nei path, niente overflow orizzontale.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const BASE = '/home/user/Boum-roma/';
const PAGINE = ['blog.html','blog-47-steps.html','blog-contract-types.html',
  'blog-cost-calculator.html','blog-neighborhood-guide.html',
  'blog-scam-bible.html','blog-tenant-rights.html','blog-visa-residency.html',
  'moving-to-rome.html','moving-to-rome-from-us.html',
  'moving-to-rome-from-uk.html','moving-to-rome-from-germany.html',
  'virtual-viewing.html','deal-assistance.html','property-finding.html',
  'concierge.html','deposit-recovery.html','contract-check.html',
  'contract-check-express.html','canone.html','about.html',
  'how-it-works.html','corporate.html','universities.html','faq.html',
  'contact.html','thank-you.html','refer.html','privacy.html','terms.html',
  'login.html','404.html','skyline.html'];

// i path del marchio originale: la geometria non si tocca
const svg = fs.readFileSync(BASE + 'design/pages-deco/logo-live.svg', 'utf8');
const PATHS = [...svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);

(async () => {
  const browser = await chromium.launch();
  let ko = 0;
  for (const f of PAGINE) {
    // geometria: ogni d= del logo originale deve stare nella pagina
    const html = fs.readFileSync(BASE + f, 'utf8');
    const geom = PATHS.every(d => html.includes(d));
    const righe = [];
    for (const [nome, vp, mAtteso, sAtteso] of [
        ['d', { width: 1280, height: 900 }, 66, 30],
        ['m', { width: 390, height: 844 }, 58, 25]]) {
      const pg = await browser.newPage({ viewport: vp });
      try {
        await pg.goto('file://' + BASE + f, { waitUntil: 'domcontentloaded',
          timeout: 20000 });
        await pg.waitForTimeout(500);
        const r = await pg.evaluate(() => {
          const mk = document.querySelector('.marchio .logo-mark');
          const sp = document.querySelector('.marchio span');
          const o = document.documentElement.scrollWidth - innerWidth;
          return { mk: mk ? Math.round(mk.getBoundingClientRect().width) : 0,
            sp: sp ? parseFloat(getComputedStyle(sp).fontSize) : 0,
            o: o };
        });
        const ok = r.mk === mAtteso && Math.round(r.sp) === sAtteso
          && r.o <= 1;
        righe.push((ok ? '' : '[' + nome + ' GUASTO ' + JSON.stringify(r)
          + ']'));
        if (!ok) ko++;
      } catch (e) { righe.push('[' + nome + ' ERR ' +
        String(e).slice(0, 60) + ']'); ko++; }
      await pg.close();
    }
    const esito = (geom ? '' : '[SVG ALTERATO] ') + righe.join('');
    console.log((esito ? 'FAIL ' : 'OK   ') + f + ' ' + esito);
    if (!geom) ko++;
  }
  console.log(ko ? 'GUASTI: ' + ko : 'INSEGNA UNIFORME OVUNQUE');
  await browser.close();
  process.exit(ko ? 1 : 0);
})();
