// Verifica della discovery ripensata: stecca, foglio, vista, paragone.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const FILE = 'file:///tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/boom-discovery.html';

(async () => {
  const browser = await chromium.launch();
  const esiti = [];
  const dice = (ok, t) => { const r = (ok ? 'OK  ' : 'FAIL') + ' ' + t;
    esiti.push(r); console.log(r); };

  for (const [nome, vp] of [['desktop', { width: 1280, height: 900 }],
                            ['mobile', { width: 390, height: 844 }]]) {
    const pg = await browser.newPage({ viewport: vp });
    const errori = [];
    pg.on('pageerror', e => errori.push(String(e)));
    await pg.goto(FILE, { waitUntil: 'load' });
    await pg.waitForTimeout(900);

    // 0. errori js
    dice(errori.length === 0, nome + ' · zero errori JS' +
      (errori.length ? ' → ' + errori[0] : ''));

    // 1. la stecca esiste, e sticky, e sta sotto la barra
    const st = await pg.evaluate(() => {
      const s = document.getElementById('stecca');
      if (!s) return null;
      const cs = getComputedStyle(s);
      return { pos: cs.position, top: cs.top,
        nav: document.querySelector('.nav').offsetHeight };
    });
    dice(!!st && st.pos === 'sticky' && parseInt(st.top) >= st.nav - 2,
      nome + ' · stecca sticky sotto la barra (' + JSON.stringify(st) + ')');

    // 2. niente id doppi
    const doppi = await pg.evaluate(() => {
      const visti = {}, out = [];
      document.querySelectorAll('[id]').forEach(e => {
        if (visti[e.id]) out.push(e.id); visti[e.id] = 1; });
      return out;
    });
    dice(doppi.length === 0, nome + ' · zero id doppi' +
      (doppi.length ? ' → ' + doppi.join(',') : ''));

    // 3. niente overflow orizzontale
    const oflow = await pg.evaluate(() =>
      document.documentElement.scrollWidth - innerWidth);
    dice(oflow <= 1, nome + ' · zero overflow (' + oflow + 'px)');

    // 4. la skycarta sta in mezzo alla griglia (posizione 7)
    const skyPos = await pg.evaluate(() => {
      const m = document.getElementById('muro');
      const figli = [].slice.call(m.children).filter(e =>
        !e.classList.contains('via') || e.id === 'skyCarta');
      return figli.findIndex(e => e.id === 'skyCarta');
    });
    dice(skyPos === 6, nome + ' · skycarta in posizione 7 (' + skyPos + ')');

    // 5. il toggle vista: skyline apre la vista cielo, la griglia sparisce
    await pg.click('#vCielo');
    await pg.waitForTimeout(400);
    const vista = await pg.evaluate(() => ({
      cielo: !document.getElementById('vistaCielo').hidden,
      muro: getComputedStyle(document.getElementById('muro')).display,
      on: document.getElementById('vCielo').classList.contains('on'),
      pulsa: document.getElementById('vCielo').classList.contains('pulsa'),
      velo: !!document.getElementById('cieloVelo'),
    }));
    dice(vista.cielo && vista.muro === 'none' && vista.on && !vista.pulsa
      && vista.velo, nome + ' · vista skyline ' + JSON.stringify(vista));
    await pg.click('#vGriglia');
    await pg.waitForTimeout(200);
    const torna = await pg.evaluate(() => ({
      cielo: document.getElementById('vistaCielo').hidden,
      muro: getComputedStyle(document.getElementById('muro')).display }));
    dice(torna.cielo && torna.muro !== 'none', nome + ' · ritorno in griglia');

    // 6. il foglio dei filtri: apre, filtra, conta
    await pg.click('#apriFiltri');
    dice(await pg.evaluate(() => !document.getElementById('foglioVelo').hidden),
      nome + ' · foglio si apre');
    await pg.click('#foglioVelo button[data-f="arredata"]');
    await pg.waitForTimeout(250);
    const dopoF = await pg.evaluate(() => ({
      badge: document.getElementById('filtriConta').textContent,
      nascosto: document.getElementById('filtriConta').hidden,
      mostra: document.getElementById('foglioConto').textContent }));
    dice(dopoF.badge === '1' && !dopoF.nascosto,
      nome + ' · il ＋ conta 1 filtro (' + JSON.stringify(dopoF) + ')');
    await pg.click('#pulisci');
    await pg.click('#foglioFatto');
    dice(await pg.evaluate(() => document.getElementById('foglioVelo').hidden),
      nome + ' · foglio si chiude');

    // 7. il paragone: due case, tavola, aritmetica del giorno uno
    const para = await pg.evaluate(() => {
      const bb = [].slice.call(document.querySelectorAll('#muro .home-para'))
        .slice(0, 2);
      bb.forEach(b => b.click());
      const tray = document.getElementById('paraTray');
      return { visibile: !tray.hidden,
        abilitato: !document.getElementById('paraApri').disabled };
    });
    dice(para.visibile && para.abilitato,
      nome + ' · tray del paragone attivo ' + JSON.stringify(para));
    await pg.click('#paraApri');
    await pg.waitForTimeout(200);
    const conti = await pg.evaluate(() => {
      const c = document.querySelector('#muro .home-para.on')
        .closest('.casa-p');
      const p = +c.dataset.prezzo, m = +c.dataset.cauzione || 1;
      const atteso = p + m * p + Math.round(p * 12 * .10);
      const t = document.getElementById('paraTavola');
      const fila = [].slice.call(t.querySelectorAll('tr')).find(r =>
        (r.querySelector('th') || {}).textContent === 'Day one, all-in');
      const scritto = fila ? fila.querySelectorAll('td')[0].textContent : '';
      return { atteso, scritto,
        aperta: !document.getElementById('paraVelo').hidden,
        file: t.querySelectorAll('tr').length };
    });
    const num = parseInt(String(conti.scritto).replace(/[^\d]/g, ''), 10);
    dice(conti.aperta && conti.file >= 13 && num === conti.atteso,
      nome + ' · tavola e giorno-uno esatto (' + JSON.stringify(conti) + ')');
    await pg.click('#paraChiudi');
    await pg.click('#paraSvuota');
    dice(await pg.evaluate(() => document.getElementById('paraTray').hidden),
      nome + ' · paragone svuotato');

    // 8. la ricerca porta al vuoto onesto
    await pg.fill('#fq', 'zzzzz');
    await pg.waitForTimeout(400);
    dice(await pg.evaluate(() =>
      document.getElementById('vuoto').classList.contains('si')),
      nome + ' · vuoto onesto con ricerca impossibile');
    await pg.fill('#fq', '');
    await pg.waitForTimeout(400);

    // 9. i bersagli: tutto cliccabile nella stecca/foglio/tray ≥ 36px alto
    const piccoli = await pg.evaluate(() => {
      const out = [];
      document.querySelectorAll(
        '#stecca button, #foglioVelo button, .para-tray button, ' +
        '#skyCarta, .home-para, .pt-x, .foglio-x')
        .forEach(b => {
          const r = b.getBoundingClientRect();
          if (!r.width || !r.height) return;   /* nascosti: non bersagli */
          if (r.height < 34 || r.width < 34)
            out.push(b.className + ' ' + Math.round(r.width) + 'x'
              + Math.round(r.height));
        });
      return out;
    });
    dice(piccoli.length === 0, nome + ' · bersagli ≥34px' +
      (piccoli.length ? ' → ' + piccoli.slice(0, 4).join(' | ') : ''));

    await pg.close();
  }
  console.log(esiti.join('\n'));
  const ko = esiti.filter(e => e.startsWith('FAIL')).length;
  console.log(ko ? 'FALLITI: ' + ko : 'TUTTO VERDE');
  await browser.close();
  process.exit(ko ? 1 : 0);
})();
