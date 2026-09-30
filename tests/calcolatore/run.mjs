// tests/calcolatore/run.mjs — IL CALCOLATORE PUBBLICO È LA SCHEDA DELL'ATTESTAZIONE.
//
// IL CASO DEL 30 SETTEMBRE 2026. Una proprietaria arrivata da internet ha
// confrontato il canone che le mostrava /canone con quello calcolato dalle
// associazioni: il nostro era «abbastanza più alto». Aveva ragione. La pagina
// non usava js/canone-engine.js (il motore della scheda ARPE, del Fascicolo
// Fiscale e di scheda-canone.html) ma una tabella e una formula sue: subfascia
// scelta a gusto («stato dell'immobile»), arredato +15% preselezionato,
// transitorio +15% (la scheda dice +10%), tetto al massimo di subfascia ×1,35,
// case piccole senza i limiti di 52,90 / 70 mq. Misurato: fino al +39% sopra
// il massimo che poi l'organizzazione firmataria attesta. E 27 zone esistevano
// solo lì, mai verificate.
//
// Le regole che questa suite tiene ferme:
//   · la pagina carica il motore e non ha più una tabella zone sua;
//   · su una griglia di casi il numero MOSTRATO è quello del motore, e non
//     supera MAI il massimo della subfascia × superficie convenzionale;
//   · il transitorio non alza il massimo (la regola del tetto);
//   · una zona fuori tabella non riceve un numero: diventa una richiesta di
//     verifica, con l'indirizzo obbligatorio;
//   · il lead porta subfascia, parametri e massimo — mai il vecchio
//     «risparmio» (stesso canone al 21% e al 10%);
//   · la pagina del pacchetto ripete «massimo asseverabile», mai «in fascia».
//
// La parte browser si auto-skippa senza playwright; le altre girano sempre.

import E from '../../js/canone-engine.js';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
};

// ─── 1. La sorgente: una copia sola del calcolo ─────────────────────────
console.log('\n▸ la sorgente');
const CANONE = read('canone.html');
const PACK = read('pacchetto-concordato.html');
const SERVICES = read('services.html');
{
  const iEng = CANONE.indexOf('<script src="/js/canone-engine.js"></script>');
  const iUse = CANONE.indexOf('window.BOOM_CANONE');
  ok('/canone carica il motore della scheda', iEng !== -1);
  ok('...prima dello script che lo usa', iEng !== -1 && iUse > iEng);
  ok('...e chiama computeCanone (non una formula sua)', /E\.computeCanone\(/.test(CANONE));
  ok('nessuna tabella zone locale', !/const ZONE\s*=/.test(CANONE));
  ok('nessun tetto ×1,35 sopra il massimo', !/\*\s*1\.35/.test(CANONE));
  ok('nessuna maggiorazione scritta a mano (+15)', !/mod\s*\+=\s*15/.test(CANONE));
  ok('nessuna subfascia scelta dallo «stato dell\'immobile»', !/id="fascia"/.test(CANONE));
  for (const [f, s] of [['canone.html', CANONE], ['pacchetto-concordato.html', PACK], ['services.html', SERVICES]]) {
    ok(`${f}: nessun «90+» zone non verificate`, !/90\+/.test(s));
  }
  ok('pacchetto: mai «canone in fascia»', !/canone in fascia/i.test(PACK));
  ok('pacchetto: mai il vecchio «risparmio stimato»', !/risparmio stimato/i.test(PACK));
}

// ─── 2. La porta del lead ───────────────────────────────────────────────
console.log('\n▸ il lead');
let written = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin', expiresIn: '3600' }) };
  }
  if (u.includes('firestore.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') {
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/leads/c123' }) };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};
const handler = (await import('../../api/canone-lead.js')).default;
const plain = (v) => {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) {
    const o = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = plain(val);
    return o;
  }
  return v;
};
let ipSeq = 0;
async function call(body) {
  written = [];
  let code = 0, payload = null;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '10.9.0.' + (++ipSeq) }, body }, res);
  const w = written.find((x) => /documents\/leads/.test(x.url));
  const lead = w ? plain({ mapValue: { fields: w.body.fields } }) : null;
  return { code, payload, lead };
}
{
  const r = await call({
    name: 'Laura Bianchi', email: 'laura@example.it', phone: '+39 333 1234567', address: 'Via Cola di Rienzo 10',
    calc: { zona: 'Prati', zoneCode: 'C40', fascia: 'B', nParametri: 4, parametri: [0, 3, 6, 25, 'x'],
      maggiorazioni: ['clA', 'hack'], normale: true, mq: 65, supConv: 70, contratto: 'trans',
      mensile: 1288, annuo: 15456, pareggio: 1467, risparmioAnnuo: 1700 },
  });
  ok('lead scritto', r.code === 200 && r.lead, r.payload);
  const s = r.lead ? r.lead.message : '';
  ok('il riassunto dice subfascia e parametri', /subfascia media \(4 parametri\)/.test(s), s);
  ok('...il massimo stimato', /massimo stimato ~€1288\/mese/.test(s), s);
  ok('...il tipo di contratto', /transitorio/.test(s), s);
  ok('...e MAI il vecchio risparmio', !/risparmio/i.test(s), s);
  ok('l\'indirizzo diventa propertyAddress', r.lead && r.lead.propertyAddress === 'Via Cola di Rienzo 10');
  const calc = r.lead && r.lead.raw && r.lead.raw.calc;
  ok('parametri ripuliti (fuori scala e testo scartati)', calc && JSON.stringify(calc.parametri) === '[0,3,6]', calc && calc.parametri);
  ok('maggiorazioni solo dalla scheda', calc && JSON.stringify(calc.maggiorazioni) === '["clA"]', calc && calc.maggiorazioni);
  ok('risparmioAnnuo non viene salvato', calc && !('risparmioAnnuo' in calc));
}
{
  const r = await call({
    name: 'Mario Rossi', phone: '+39 333 7654321', address: 'Via di Centocelle 100',
    calc: { zonaNonInElenco: true, mq: 70, nParametri: 5, contratto: '32' },
  });
  const s = r.lead ? r.lead.message : '';
  ok('zona fuori elenco: il riassunto lo dice', /Zona NON in elenco/.test(s), s);
  ok('...con l\'indirizzo da verificare', /Via di Centocelle 100/.test(s), s);
  ok('...e nessun numero inventato', !/€/.test(s), s);
}
{
  const r = await call({ name: 'Quiz', email: 'q@example.it', channel: 'match_quiz', leadType: 'tenant', message: 'Cerco a Roma' });
  ok('il Match Quiz resta com\'era', r.code === 200 && r.lead && r.lead.message === 'Cerco a Roma');
}
globalThis.fetch = realFetch;

// ─── 3. Il browser: la pagina dice il numero del motore ─────────────────
console.log('\n▸ la pagina, in un browser vero');
const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright non disponibile — parte browser saltata');
  finish();
} else {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = p === '/canone' ? '/canone.html' : p === '/pacchetto-concordato' ? '/pacchetto-concordato.html' : p;
    try {
      const buf = await readFile(join(ROOT, file));
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(buf);
    } catch { res.writeHead(404); res.end('nope'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  let leadPosts = [];
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE + '/api/canone-lead')) {
      leadPosts.push(JSON.parse(r.request().postData() || '{}'));
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"t1"}' });
    }
    if (u.startsWith(BASE + '/')) return r.continue();
    return r.abort();   // niente rete esterna: font, analytics
  });

  try {
    await page.goto(BASE + '/canone', { waitUntil: 'load' });

    // le zone sono SOLO quelle del motore (+ «non in elenco»)
    const values = await page.$$eval('#zona option', (os) => os.map((o) => o.value).filter(Boolean));
    const engineCods = E.ZONES.map((z) => z.cod).sort();
    const pageCods = values.filter((v) => v !== 'altro').sort();
    ok('zone della pagina = zone del motore', JSON.stringify(pageCods) === JSON.stringify(engineCods),
      { pagina: pageCods.length, motore: engineCods.length });
    ok('c\'è la voce «non in elenco»', values.includes('altro'));
    ok('i 20 parametri della scheda', (await page.$$('#params input[type=checkbox]')).length === 20);

    async function imposta(c) {
      await page.selectOption('#zona', c.cod);
      await page.fill('#mq', String(c.mq));
      await page.selectOption('#tipo', c.tipo);
      await page.$$eval('#params input', (ins, idx) => ins.forEach((i) => { i.checked = idx.includes(+i.dataset.par); }), c.par);
      await page.$$eval('[data-mag]', (ins, mag) => ins.forEach((i) => { i.checked = mag.includes(i.dataset.mag); }), c.mag || []);
      await page.evaluate((ce) => pick('ce', ce), c.ce || 'g');
      await page.$eval('#normale', (i, v) => { i.checked = v; }, c.normale !== false);
      await page.evaluate(() => recalc());
    }
    const magEngine = (c) => {
      const m = (c.mag || []).slice();
      if (c.ce === 'abc') m.push('clA'); else if (c.ce === 'def') m.push('clD');
      return m;
    };
    const range = (n) => Array.from({ length: n }, (_, i) => i);
    const CASI = [
      { cod: 'B14', mq: 80, tipo: '32', par: range(4) },
      { cod: 'B14', mq: 80, tipo: 'trans', par: range(4), ce: 'abc' },
      { cod: 'C40', mq: 65, tipo: 'trans', par: range(8) },                  // era +27%
      { cod: 'C30', mq: 45, tipo: 'trans', par: range(9), ce: 'abc' },       // era +39%
      { cod: 'C30', mq: 40, tipo: 'stud', par: range(2) },
      { cod: 'C10', mq: 60, tipo: '32', par: range(3), mag: ['att', 'arr'] },
      { cod: 'D29', mq: 130, tipo: '32', par: range(12), mag: ['sem'] },
      { cod: 'B31', mq: 55, tipo: 'trans', par: range(7), normale: false },
      { cod: 'C1', mq: 100, tipo: '32', par: range(5), mag: ['asc'], ce: 'def' },
    ];
    for (const c of CASI) {
      await imposta(c);
      const shown = await page.$eval('#rMonthly', (el) => ({ v: +el.dataset.v, t: el.textContent }));
      const r = E.computeCanone({ zona: E.ZONES.find((z) => z.cod === c.cod), mq: c.mq, parIdx: c.par,
        mag: magEngine(c), tipo: c.tipo, normale: c.normale !== false });
      const tetto = r.fMax * r.sc;
      const tag = `${c.cod} ${c.mq}mq ${c.tipo} ${c.par.length}p${c.normale === false ? ' non-normale' : ''}`;
      ok(`${tag}: mostra il massimo del motore (€${Math.round(r.cMax)})`, shown.v === Math.round(r.cMax), shown);
      ok(`${tag}: mai sopra il massimo di subfascia`, shown.v <= Math.round(tetto), { mostrato: shown.v, tetto: Math.round(tetto) });
      const href = await page.$eval('#rPack', (a) => a.getAttribute('href'));
      const q = new URL(href, BASE).searchParams;
      ok(`${tag}: il pacchetto riceve lo stesso numero`, +q.get('canone') === Math.round(r.cMax) && q.get('sub') === r.fascia, href);
    }

    // il transitorio non alza il massimo
    await imposta({ cod: 'C40', mq: 65, tipo: '32', par: range(4) });
    const v32 = await page.$eval('#rMonthly', (el) => +el.dataset.v);
    await imposta({ cod: 'C40', mq: 65, tipo: 'trans', par: range(4) });
    const vTr = await page.$eval('#rMonthly', (el) => +el.dataset.v);
    ok('il transitorio non porta il canone oltre il massimo', vTr === v32, { v32, vTr });
    const note = await page.$eval('#rNotes', (el) => el.textContent);
    ok('...e la nota lo spiega', /non portano mai il canone oltre il massimo/.test(note), note);

    // lead dal calcolo: il payload porta il numero del motore
    leadPosts = [];
    await imposta({ cod: 'C40', mq: 65, tipo: 'trans', par: range(4) });
    await page.fill('#lf_name', 'Laura Bianchi');
    await page.fill('#lf_phone', '+39 333 1234567');
    await page.fill('#lf_email', 'laura@example.it');
    await page.fill('#lf_address', 'Via Cola di Rienzo 10');
    await page.click('#lf_btn');
    await page.waitForSelector('#leadSuccess.show', { timeout: 5000 });
    const post = leadPosts[0];
    const rPrati = E.computeCanone({ zona: E.ZONES.find((z) => z.cod === 'C40'), mq: 65, parIdx: range(4), tipo: 'trans' });
    ok('il lead porta il massimo del motore', post && post.calc && post.calc.mensile === Math.round(rPrati.cMax), post && post.calc);
    ok('...subfascia e parametri', post && post.calc.fascia === rPrati.fascia && post.calc.nParametri === 4);
    ok('...l\'indirizzo', post && post.address === 'Via Cola di Rienzo 10');
    ok('...e non il vecchio risparmio', post && !('risparmioAnnuo' in post.calc));
    const wa = await page.$eval('#waSuccess', (a) => decodeURIComponent(a.href));
    ok('WhatsApp precompilato col massimo stimato', /massimo stimato ~€ 1\.288/.test(wa), wa);

    // zona fuori elenco: nessun numero, indirizzo obbligatorio
    await page.goto(BASE + '/canone', { waitUntil: 'load' });
    await page.fill('#mq', '70');
    await page.selectOption('#zona', 'altro');
    const off = await page.evaluate(() => ({
      off: getComputedStyle(document.getElementById('offList')).display,
      body: getComputedStyle(document.getElementById('resultBody')).display,
      req: document.getElementById('lf_address').required,
      snap: window.__canone,
    }));
    ok('zona fuori elenco: nessun numero mostrato', off.body === 'none' && off.off === 'block', off);
    ok('...l\'indirizzo diventa obbligatorio', off.req === true);
    ok('...e il lead lo segnala', off.snap && off.snap.zonaNonInElenco === true && !('mensile' in off.snap), off.snap);

    // la pagina del pacchetto ripete il numero con le parole giuste
    await imposta({ cod: 'C40', mq: 65, tipo: 'trans', par: range(4) });
    const href = await page.$eval('#rPack', (a) => a.getAttribute('href'));
    await page.goto(BASE + href, { waitUntil: 'load' });
    const bar = await page.$eval('#calcTxt', (el) => el.textContent);
    ok('pacchetto: «massimo asseverabile stimato»', /massimo asseverabile stimato ≈ € 1\.288\/mese/.test(bar), bar);
    ok('pacchetto: subfascia e parametri', /subfascia media, 4 parametri/.test(bar), bar);
    ok('pacchetto: niente «in fascia», niente «risparmio»', !/in fascia|risparmio/i.test(bar), bar);
    // un vecchio link col parametro risparmio non lo mostra più
    await page.goto(BASE + '/pacchetto-concordato?zona=Prati&mq=65&canone=1500&risparmio=1980', { waitUntil: 'load' });
    const old = await page.$eval('#calcTxt', (el) => el.textContent);
    ok('vecchio link: il «risparmio» viene ignorato', !/1\.980|risparmio/i.test(old), old);

    // telefono: nessuno scorrimento laterale
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, isMobile: true });
    const mp = await mob.newPage();
    await mp.route('**/*', (r) => (r.request().url().startsWith(BASE + '/') ? r.continue() : r.abort()));
    await mp.goto(BASE + '/canone', { waitUntil: 'load' });
    await mp.selectOption('#zona', 'B14');
    await mp.fill('#mq', '80');
    await mp.evaluate(() => { document.querySelector('details.adv').open = true; recalc(); });
    const w = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    ok('390px: nessuno scorrimento laterale', w.sw <= w.iw, w);
    await mob.close();

    ok('nessun errore JS', errs.length === 0, errs);
  } catch (e) {
    ok('la suite browser gira fino in fondo', false, String(e && e.message || e).split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  finish();
}

function finish() {
  console.log(`\nIl calcolatore è la scheda: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
