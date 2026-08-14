// I tasti del blocco: sempre presenti col pin, onesti sul livello.
//   exact  → coordinate + «the exact entrance»
//   street → ≈ strada + «this street»
//   zone   → ≈ zona, NIENTE Street View
//   none   → riga nascosta
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const P = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/boom-casa-p-sito.html';

(async () => {
  const html = fs.readFileSync(P, 'utf8');
  const i = html.indexOf('[{"id"');
  let d = 0, j = i;
  do { const ch = html[j]; if (ch === '[') d++; if (ch === ']') d--; j++; } while (d > 0);
  const CASE = JSON.parse(html.slice(i, j));
  const scegli = (lvl) => CASE.find((c) => c.prec === lvl && c.lat);
  const casi = {
    exact: scegli('exact'), street: scegli('street'),
    zone: CASE.find((c) => c.prec === 'zone' && c.lat),
    none: CASE.find((c) => !c.lat),
  };
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = 0, ko = 0;
  const assai = (nome, cond) => { cond ? ok++ : (ko++, console.log('  ✗', nome)); };

  for (const [lvl, c] of Object.entries(casi)) {
    if (!c) { console.log('  (nessuna casa', lvl + ')'); continue; }
    /* pagina FRESCA per casa: il cambio di solo hash non ricarica */
    const pg = await br.newPage();
    await pg.goto('file://' + P + '#id=' + encodeURIComponent(c.id),
      { waitUntil: 'load' });
    await pg.waitForTimeout(1500);
    const st = await pg.evaluate(() => {
      const az = document.getElementById('bloccoAzioni');
      const sv = document.getElementById('blkSv');
      const dr = document.getElementById('blkDir');
      const cc = document.getElementById('blkCoords');
      return {
        azVis: az ? !az.hidden : null,
        svVis: sv ? !sv.hidden : null,
        svTxt: sv ? sv.textContent : '', svHref: sv ? sv.getAttribute('href') : '',
        drHref: dr ? dr.getAttribute('href') : '', ccTxt: cc ? cc.textContent : '',
      };
    });
    console.log(lvl, '·', c.nome, '→', JSON.stringify(st));
    if (lvl === 'none') { assai('none: riga nascosta', st.azVis === false); continue; }
    assai(lvl + ': riga visibile', st.azVis === true);
    assai(lvl + ': directions ok',
      st.drHref.startsWith('https://www.google.com/maps/dir/?api=1&destination=' + c.lat));
    if (lvl === 'exact') {
      assai('exact: sv visibile + entrance',
        st.svVis && /exact entrance/.test(st.svTxt));
      assai('exact: coordinate ◈', st.ccTxt.startsWith('◈'));
      assai('exact: pano href',
        st.svHref.includes('map_action=pano&viewpoint=' + c.lat));
    }
    if (lvl === 'street') {
      assai('street: sv visibile + this street',
        st.svVis && /this street/.test(st.svTxt));
      assai('street: ≈ senza coordinate', st.ccTxt.startsWith('≈'));
    }
    if (lvl === 'zone') {
      assai('zone: NIENTE street view', st.svVis === false);
      assai('zone: ≈ zona', st.ccTxt.startsWith('≈')
        && st.ccTxt.includes(c.zona));
    }
    await pg.close();
  }
  await br.close();
  console.log(ko ? `KO: ${ko} falliti (${ok} ok)` : `OK: ${ok} controlli passati`);
  process.exit(ko ? 1 : 0);
})();
