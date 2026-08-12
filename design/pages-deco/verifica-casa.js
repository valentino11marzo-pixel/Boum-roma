// Verifica della casa completa: lente, posto, presa, FAQ JSON-LD.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const FILE = 'file:///tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/boom-casa-p.html';

(async () => {
  const browser = await chromium.launch();
  const esiti = [];
  const dice = (ok, t) => { const r = (ok ? 'OK  ' : 'FAIL') + ' ' + t;
    esiti.push(r); console.log(r); };

  // ── la casa di apertura, desktop ──
  const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errori = [];
  pg.on('pageerror', e => errori.push(String(e)));
  await pg.goto(FILE, { waitUntil: 'load' });
  await pg.waitForTimeout(1100);
  dice(errori.length === 0, 'zero errori JS' +
    (errori.length ? ' → ' + errori[0] : ''));

  // lente: si apre dal telaio, conta, avanza, chiude con Esc
  await pg.click('#telaio > img');
  await pg.waitForTimeout(250);
  const l1 = await pg.evaluate(() => ({
    aperta: !document.getElementById('lente').hidden,
    conta: document.getElementById('lenteConta').textContent,
    src: !!document.getElementById('lenteFoto').src }));
  dice(l1.aperta && /^1 \/ \d+/.test(l1.conta) && l1.src,
    'lente aperta (' + JSON.stringify(l1) + ')');
  await pg.click('#lenteSucc');
  const l2 = await pg.evaluate(() =>
    document.getElementById('lenteConta').textContent);
  dice(/^2 \//.test(l2), 'lente avanza (' + l2 + ')');
  await pg.keyboard.press('Escape');
  dice(await pg.evaluate(() => document.getElementById('lente').hidden),
    'lente chiusa con Esc');

  // il posto: 4 vicini con tempi misurati, i luoghi, la nota onesta
  const posto = await pg.evaluate(() => ({
    vicini: document.querySelectorAll('#vicini .vicino').length,
    tempo: (document.querySelector('#vicini .vicino i') || {}).textContent,
    luoghi: !!document.getElementById('luogoQ'),
    vuota: (document.querySelector('#luogoRighe .luoghi-vuota') || {})
      .textContent || '' }));
  dice(posto.vicini === 4 && /min/.test(posto.tempo || '') && posto.luoghi,
    'posto: 4 vicini misurati (' + JSON.stringify(posto) + ')');

  // la presa in PREVIEW: compila, invia, la nota dice la verita
  await pg.fill('#prNome', 'Test');
  await pg.fill('#prMail', 'test@test.com');
  await pg.fill('#prTel', '+39333');
  await pg.click('#prVai');
  const nota = await pg.evaluate(() =>
    document.getElementById('presaNota').textContent);
  dice(/PREVIEW/.test(nota) && /Stripe/.test(nota),
    'presa PREVIEW onesta (' + nota.slice(0, 60) + '…)');

  // FAQ JSON-LD: dieci risposte, JSON valido
  const ld = await pg.evaluate(() => {
    const s = document.getElementById('faqLd');
    if (!s) return null;
    try { const j = JSON.parse(s.textContent);
      return { tipo: j['@type'], n: (j.mainEntity || []).length };
    } catch (e) { return { tipo: 'rotto' }; }
  });
  dice(!!ld && ld.tipo === 'FAQPage' && ld.n === 10,
    'FAQPage JSON-LD (' + JSON.stringify(ld) + ')');

  // ordine e igiene
  const doppi = await pg.evaluate(() => {
    const visti = {}, out = [];
    document.querySelectorAll('[id]').forEach(e => {
      if (visti[e.id]) out.push(e.id); visti[e.id] = 1; });
    return out;
  });
  dice(doppi.length === 0, 'zero id doppi' +
    (doppi.length ? ' → ' + doppi.join(',') : ''));
  const oflow = await pg.evaluate(() =>
    document.documentElement.scrollWidth - innerWidth);
  dice(oflow <= 1, 'zero overflow (' + oflow + 'px)');

  // la mappa del blocco: da qui il motore NON arriva — deve dirlo
  await pg.evaluate(() =>
    document.getElementById('posto').scrollIntoView());
  await pg.click('#bloccoVia');
  await pg.waitForTimeout(13500);
  const spento = await pg.evaluate(() => ({
    onesto: !!document.querySelector('#blocco3d .blocco-spento'),
    maps: !!document.querySelector(
      '#blocco3d a[href^="https://maps.google.com"]') }));
  dice(spento.onesto && spento.maps,
    'mappa: fallback onesto + Google Maps (' + JSON.stringify(spento) + ')');
  await pg.close();

  // ── waitlist senza coordinate: posto nascosto, presa "Priority" ──
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const err2 = [];
  p2.on('pageerror', e => err2.push(String(e)));
  await p2.goto(FILE + '#id=OLLVsiKhPrhpT1fx8XmB', { waitUntil: 'load' });
  await p2.waitForTimeout(1100);
  const wl = await p2.evaluate(() => ({
    posto: getComputedStyle(document.getElementById('posto')).display,
    titolo: document.getElementById('presaTitolo').textContent,
    stato: document.getElementById('statoCasa').textContent }));
  dice(err2.length === 0 && wl.posto === 'none' && /Priority/.test(wl.titolo)
    && /waitlist/i.test(wl.stato),
    'waitlist senza geo: posto nascosto, hold Priority ('
    + JSON.stringify(wl) + ')');
  await p2.close();

  // ── casa affittata: la presa sparisce ──
  const p3 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const err3 = [];
  p3.on('pageerror', e => err3.push(String(e)));
  // la casa affittata esiste solo nella build sito (foto su Storage)
  await p3.goto(FILE.replace('boom-casa-p.html', 'boom-casa-p-sito.html')
    + '#id=G8tzBej0f8JyBP0oAqRS', { waitUntil: 'load' });
  await p3.waitForTimeout(1100);
  const aff = await p3.evaluate(() => ({
    presa: getComputedStyle(document.getElementById('presaCasa')).display,
    posto: getComputedStyle(document.getElementById('posto')).display,
    oflow: document.documentElement.scrollWidth - innerWidth }));
  dice(err3.length === 0 && aff.presa === 'none' && aff.posto !== 'none'
    && aff.oflow <= 1,
    'affittata (mobile): presa nascosta, posto vivo ('
    + JSON.stringify(aff) + ')');
  await p3.close();

  const ko = esiti.filter(e => e.startsWith('FAIL')).length;
  console.log(ko ? 'FALLITI: ' + ko : 'TUTTO VERDE');
  await browser.close();
  process.exit(ko ? 1 : 0);
})();
