// LA PROVA (/try) — il percorso intero, guidato da un browser vero:
// scelta casa → domanda live → termini (aritmetica REALE della casa
// scelta) → firma disegnata sul canvas → timbro → pass + tempo misurato.
// Più i patti: nessuna scrittura in localStorage, eventi GA per atto.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad';

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = 0, ko = 0;
  const assai = (n, c) => { c ? ok++ : (ko++, console.log('  ✗', n)); };

  const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  await pg.route(/googletagmanager|fonts\.|firebasestorage/, r => r.abort());
  // lo spy: nel build artefatto non c'e' il gtag inline, quindi lo spy E' gtag
  await pg.addInitScript(() => {
    window.gtag = (...a) => (window.__ga = window.__ga || []).push(a);
  });

  await pg.goto('file://' + SP + '/boom-prova.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(700);

  // ── atto 1: tre case vere, la scelta avanza ──
  const case1 = await pg.$$('.pv-casa');
  assai('tre case vere in scena', case1.length === 3);
  const dati = await pg.evaluate(() => {
    const b = document.querySelectorAll('.pv-casa')[1];
    return { nome: b.dataset.nome, prezzo: +b.dataset.prezzo,
      mesi: +b.dataset.mesi, zona: b.dataset.zona };
  });
  await pg.evaluate(() => document.querySelectorAll('.pv-casa')[1].click());
  await pg.waitForTimeout(400);
  assai('atto 2 in scena', await pg.evaluate(() =>
    document.querySelector('.pv-atto[data-a="2"]').classList.contains('qui')));
  assai('la foto della casa entra nello schermo', await pg.evaluate(() =>
    document.getElementById('pvStanza').style.backgroundImage.length > 5));

  // ── atto 2: la domanda in diretta sblocca l'avanzare ──
  assai('avanti bloccato prima della domanda', await pg.evaluate(() =>
    document.getElementById('pvVaiTermini').disabled));
  await pg.evaluate(() => document.querySelector('.pv-chip').click());
  await pg.waitForTimeout(900);
  const chat = await pg.evaluate(() =>
    [...document.querySelectorAll('.pv-msg')].map(m => m.className));
  assai('domanda e risposta in chat', chat.length === 2
    && chat[0].includes('mia') && !chat[1].includes('mia'));
  await pg.evaluate(() => document.getElementById('pvVaiTermini').click());
  await pg.waitForTimeout(400);

  // ── atto 3: l'aritmetica VERA della casa scelta ──
  const conto = await pg.evaluate(() => ({
    casa: document.getElementById('pvContoCasa').textContent,
    canone: document.getElementById('pvCanone').textContent,
    fee: document.getElementById('pvFee').textContent,
    dep: document.getElementById('pvDeposito').textContent,
  }));
  const euro = n => '€' + Math.round(n).toLocaleString('en-US');
  assai('il conto porta la casa scelta', conto.casa.includes(dati.nome));
  assai('canone = quello vero', conto.canone === euro(dati.prezzo));
  assai('onorario = 10% dell\'anno', conto.fee === euro(dati.prezzo * 12 * .10));
  assai('deposito: mesi veri o intervallo onesto', dati.mesi > 0
    ? conto.dep === euro(dati.prezzo * dati.mesi)
    : /1–2 months/.test(conto.dep));
  await pg.evaluate(() => document.getElementById('pvVaiFirma').click());
  await pg.waitForTimeout(400);

  // ── atto 4: si firma DISEGNANDO, e il timbro arriva ──
  assai('timbro bloccato senza firma', await pg.evaluate(() =>
    document.getElementById('pvTimbra').disabled));
  const box = await (await pg.$('#pvCanvas')).boundingBox();
  await pg.mouse.move(box.x + 30, box.y + 80);
  await pg.mouse.down();
  await pg.mouse.move(box.x + 120, box.y + 60, { steps: 8 });
  await pg.mouse.move(box.x + 200, box.y + 95, { steps: 8 });
  await pg.mouse.up();
  await pg.waitForTimeout(200);
  assai('la firma sblocca il timbro', await pg.evaluate(() =>
    !document.getElementById('pvTimbra').disabled));
  await pg.evaluate(() => document.getElementById('pvTimbra').click());
  await pg.waitForTimeout(1300);

  // ── atto 5: il pass della casa scelta e il tempo VERO ──
  const fine = await pg.evaluate(() => ({
    atto: document.querySelector('.pv-atto[data-a="5"]').classList.contains('qui'),
    casa: document.getElementById('pvPassCasa').textContent,
    zona: document.getElementById('pvPassZona').textContent,
    tempo: document.getElementById('pvTempo').textContent,
  }));
  assai('atto 5 in scena', fine.atto);
  assai('il pass porta la casa scelta', fine.casa === dati.nome
    && fine.zona.includes(dati.zona));
  assai('il tempo è misurato davvero (secondi, non slogan)',
    /^\d+ seconds$/.test(fine.tempo));

  // ── i patti ──
  const patti = await pg.evaluate(() => ({
    storage: localStorage.length,
    eventi: (window.__ga || []).filter(a => a[0] === 'event')
      .map(a => a[1]),
  }));
  assai('NIENTE in localStorage (il patto della pagina)', patti.storage === 0);
  assai('il funnel si misura: start→home→question→terms→sign→done',
    ['try_start', 'try_home', 'try_question', 'try_terms', 'try_sign',
     'try_done'].every(e => patti.eventi.includes(e)));

  await pg.screenshot({ path: SP + '/shot-prova-fine.png' });
  await br.close();
  console.log(`\nLA PROVA: ${ok} ok, ${ko} falliti`);
  process.exit(ko ? 1 : 0);
})();
