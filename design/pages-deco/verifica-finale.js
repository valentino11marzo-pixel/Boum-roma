// LA VERIFICA FINALE — 4 pagine × 2 viewport: errori, contrasto WCAG
// (composizione alpha su #030303), bersagli, id doppi, overflow.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const DIR = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/';
const PAGINE = ['boom-portale.html', 'boom-discovery.html',
                'boom-casa-p.html', 'boom-soldi.html'];

(async () => {
  const browser = await chromium.launch();
  let ko = 0;
  for (const f of PAGINE) {
    for (const [nome, vp] of [['d', { width: 1280, height: 900 }],
                              ['m', { width: 390, height: 844 }]]) {
      const pg = await browser.newPage({ viewport: vp });
      const errori = [];
      pg.on('pageerror', e => errori.push(String(e).slice(0, 90)));
      await pg.goto('file://' + DIR + f, { waitUntil: 'load' });
      await pg.waitForTimeout(1300);
      const r = await pg.evaluate(() => {
        function lum(c) {
          const a = c.map(v => { v /= 255;
            return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
          return .2126 * a[0] + .7152 * a[1] + .0722 * a[2];
        }
        function contro(c1, c2) {
          const l1 = lum(c1), l2 = lum(c2);
          return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
        }
        const FONDO = [3, 3, 3];
        function sfondo(el) {
          /* il fondo VERO: si risale finche' un antenato ne dipinge uno */
          let q = el, base = FONDO.slice();
          while (q && q !== document.documentElement) {
            const b = getComputedStyle(q).backgroundColor
              .match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
            if (b) {
              const ba = b[4] === undefined ? 1 : parseFloat(b[4]);
              if (ba > 0) {
                base = [1, 2, 3].map(i =>
                  parseFloat(b[i]) * ba + FONDO[i - 1] * (1 - ba));
                if (ba >= .5) break;   /* fondo sostanziale: basta */
              }
            }
            q = q.parentElement;
          }
          return base;
        }
        const male = [];
        document.querySelectorAll('body *').forEach(el => {
          if (male.length > 6) return;
          if (el.closest('[aria-hidden="true"]')) return;
          const testo = [].slice.call(el.childNodes).some(n =>
            n.nodeType === 3 && n.textContent.trim().length > 1);
          if (!testo) return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const q = el.getBoundingClientRect();
          if (!q.width || !q.height) return;
          const m = cs.color.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
          if (!m) return;
          const al = m[4] === undefined ? 1 : parseFloat(m[4]);
          const base = sfondo(el);
          const c = [1, 2, 3].map(i =>
            parseFloat(m[i]) * al + base[i - 1] * (1 - al));
          const px = parseFloat(cs.fontSize);
          const grosso = px >= 24 ||
            (px >= 18.66 && parseInt(cs.fontWeight) >= 700);
          const soglia = grosso ? 3 : 4.5;
          const rap = contro(c, base);
          if (rap < soglia - .02) male.push(
            (el.className || el.tagName) + ' ' + rap.toFixed(2) + '<' + soglia
            + ' "' + el.textContent.trim().slice(0, 26) + '"');
        });
        const doppi = [], visti = {};
        document.querySelectorAll('[id]').forEach(e => {
          if (visti[e.id]) doppi.push(e.id); visti[e.id] = 1; });
        const oflow = document.documentElement.scrollWidth - innerWidth;
        const piccoli = [];
        document.querySelectorAll('a, button, [role="button"]').forEach(b => {
          if (b.closest('[aria-hidden="true"]')) return;
          const q = b.getBoundingClientRect();
          if (!q.width || !q.height) return;
          const cs = getComputedStyle(b);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          /* WCAG 2.2: i link inline nel testo sono esenti dal minimo */
          if (cs.display === 'inline') return;
          if (q.height < 24 || (q.height < 32 && q.width < 32))
            piccoli.push((b.className || b.id || b.tagName) + ' '
              + Math.round(q.width) + 'x' + Math.round(q.height));
        });
        return { male, doppi, oflow, piccoli: piccoli.slice(0, 5) };
      });
      const guaio = errori.length || r.male.length || r.doppi.length
        || r.oflow > 1 || r.piccoli.length;
      if (guaio) ko++;
      console.log((guaio ? 'FAIL ' : 'OK   ') + f + ' [' + nome + ']'
        + (errori.length ? ' JS:' + errori[0] : '')
        + (r.male.length ? ' AA:' + r.male.join(' | ') : '')
        + (r.doppi.length ? ' ID:' + r.doppi.join(',') : '')
        + (r.oflow > 1 ? ' OFLOW:' + r.oflow : '')
        + (r.piccoli.length ? ' MINI:' + r.piccoli.join(' | ') : ''));
      await pg.close();
    }
  }
  console.log(ko ? 'GUASTI: ' + ko : 'TUTTO VERDE — 8/8');
  await browser.close();
  process.exit(ko ? 1 : 0);
})();
