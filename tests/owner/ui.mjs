// tests/owner/ui.mjs — L'ARCHIVIO DEL PROPRIETARIO IN UN BROWSER VERO.
//
// La pagina VERA (proprietario.html) in Chromium, col motore VERO
// (js/owner-archive-engine.js) e con la proiezione costruita dal motore VERO
// sulle fixture del pacchetto A — la stessa che /api/owner/archivio manda.
// Stub SOLO ai confini: BoomPortal (l'utente), gli SDK Firebase da CDN, e le
// due porte del server (archivio, file) servite via route.
//
// Cosa pretende, a 390 e a 1440 px (e a 320 dove si rompe per primo):
//   · nessuno scorrimento orizzontale, nessun loader appeso, il verdetto
//     giusto in #hero[data-state] per ok/osservo/nonso/tu/vuoto;
//   · nessuna stringa «veleno» (email, telefono, CF, IBAN, token, URL
//     Storage) nel DOM;
//   · il nastro apre il foglio, Esc lo chiude e il fuoco torna a chi l'ha
//     aperto; si chiude anche trascinandolo giù;
//   · un tocco sul documento: POST col ref giusto, poi navigazione sul
//     telefono o finestra aperta DENTRO il click sul desktop;
//   · 413 → la frase onesta e WhatsApp; EN ⇄ IT negli importi; vedi-come
//     senza link personali; movimento ridotto = puntini fermi, e solo l'«in
//     ordine» verificato respira; errore del server = card, mai spinner;
//   · ricerca («chiavi», «marzo 2026»), #r=AAAA-MM, l'ultima visita, la
//     risposta in cache che si conferma da sola;
//   · nel sorgente: niente Firestore, niente toLocale, niente analytics.
//
// Screenshot facoltativi: BOOM_SHOTS=<cartella> node tests/owner/ui.mjs
// Si auto-skippa senza playwright, come le altre suite browser.
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { projection, multiProjection, POISON, OWNER as ENGINE, OWNER_UID, ADMIN_UID } from './fixtures.mjs';

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }

let passed = 0, failed = 0; const bad = [];
const check = (n, c, extra) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && extra ? '  → ' + extra : '')); };
const read = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const HTML = read('proprietario.html');
const ENGINE_SRC = read('js/owner-archive-engine.js');
const ORIGIN = 'https://www.boomrome.com';
const SHOTS = process.env.BOOM_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// ── Il sorgente: le regole che non si vedono a schermo ──────────────────
{
  const head = HTML.slice(0, 4000);
  check('sorgente: robots noindex,nofollow nei primi 4000 caratteri', /<meta name="robots" content="noindex, nofollow">/.test(head));
  check('sorgente: robots PRIMA del blocco di stile', HTML.indexOf('name="robots"') < HTML.indexOf('<style'));
  check('sorgente: nessuna lettura Firestore (.collection( / firestore())', !/\.collection\(/.test(HTML) && !/firestore\(\)/.test(HTML));
  check('sorgente: nessun toLocale* né Intl.NumberFormat', !/toLocale/.test(HTML) && !/Intl\.NumberFormat/.test(HTML));
  check('sorgente: nessuna analytics (gtag / googletagmanager)', !/gtag|googletagmanager|google-analytics/.test(HTML));
  check('sorgente: il token viene dall\'utente di requireAuth, mai da currentUser', /USER\.getIdToken\(\)/.test(HTML) && !/currentUser/.test(HTML));
  check('sorgente: requireAuth landlord+admin verso /login', /requireAuth\(\['landlord','admin'\],\{loginUrl:'\/login'\}\)/.test(HTML));
  check('sorgente: usa #load e #app (copertura "mai spinner eterno")', /id="load"/.test(HTML) && /id="app"/.test(HTML));
  check('sorgente: un solo dialog#sheet', (HTML.match(/<dialog /g) || []).length === 1 && /<dialog id="sheet"/.test(HTML));
  // Ogni animazione vive dentro @media(prefers-reduced-motion:no-preference);
  // fuori resta solo il lampo della casa raggiunta, spento esplicitamente
  // sotto reduce. Si tolgono i blocchi no-preference (graffe bilanciate) e
  // si guarda cosa rimane.
  {
    const css = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
    let rest = '', i = 0; const tag = '@media(prefers-reduced-motion:no-preference){';
    while (i < css.length) {
      const j = css.indexOf(tag, i);
      if (j < 0) { rest += css.slice(i); break; }
      rest += css.slice(i, j);
      let k = j + tag.length, depth = 1;
      while (k < css.length && depth) { if (css[k] === '{') depth++; else if (css[k] === '}') depth--; k++; }
      i = k;
    }
    const outside = (rest.match(/animation:[^;}]+/g) || []).filter((a) => !/animation:none/.test(a));
    check('sorgente: il movimento sta dentro prefers-reduced-motion:no-preference',
      outside.length === 1 && /animation:flash/.test(outside[0]) && /prefers-reduced-motion:reduce\)\{\.house\.flash\{animation:none\}/.test(css), outside.join(' | '));
  }
  check('sorgente: la finestra desktop si apre prima di qualunque attesa (window.open prima di postFile)',
    HTML.indexOf("w=window.open('','_blank')") > 0 && HTML.indexOf("w=window.open('','_blank')") < HTML.indexOf('postFile(ref).then'));
  check('motore: STRINGS it/en con le stesse chiavi', JSON.stringify(Object.keys(ENGINE.STRINGS.it).sort()) === JSON.stringify(Object.keys(ENGINE.STRINGS.en).sort()));
}

// ── Le proiezioni: il motore VERO sulle fixture ─────────────────────────
const P = {};
for (const s of ['ok', 'osservo', 'nonso', 'tu', 'vuoto', 'rooms', 'renewal', 'paper']) P[s] = projection(s);
P.tuAs = projection('tu', { viewAs: true });
P.marzo = projection('ok', { mutate: (inp) => {
  inp.rendiconti.push({ id: `${OWNER_UID}_2026-03`, ownerId: OWNER_UID, month: '2026-03', at: '2026-04-01T06:10:00Z' });
  inp.rendicontiFiles[`${OWNER_UID}_2026-03`] = true;
} });
for (const [k, v] of Object.entries(P)) check(`fixture ${k}: la proiezione passa assertClean`, ENGINE.assertClean(v).ok);

// ── Il banco: la pagina servita come in produzione, i confini stubbati ──
const browser = await chromium.launch(launchOptions());

async function open({ proj = P.ok, role = 'landlord', uid = OWNER_UID, url = '/proprietario', width = 390, height = 844,
  reduced = false, archivio = null, file = null, init = null, delayArchivio = 0, html: pageHtml = HTML, portalJs = null, engineJs = undefined } = {}) {
  const mobile = width < 900;
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const log = { archivio: [], posts: [], tickets: [], errors: [], shares: [], navs: 0 };
  page.on('pageerror', (e) => log.errors.push(e.message));
  if (init) await page.addInitScript(init.fn, init.arg);
  const state = { proj, archivio };
  await page.route('**/*', async (route) => {
    const req = route.request(), u = new URL(req.url());
    const js = (body) => route.fulfill({ status: 200, contentType: 'application/javascript', body });
    if (u.hostname.endsWith('gstatic.com')) return js('window.firebase=window.firebase||{auth:function(){return{signOut:function(){return Promise.resolve()}}}};');
    if (u.pathname === '/js/firebase-config.js' || u.pathname === '/js/boom-err.js') return js('/* stub */');
    if (u.pathname === '/js/boom-portal.js' && portalJs != null) return js(portalJs);
    if (u.pathname === '/js/boom-portal.js') return js(`window.BoomPortal={
      requireAuth:function(){return Promise.resolve({user:{uid:${JSON.stringify(uid)},getIdToken:function(){return Promise.resolve('tok-'+${JSON.stringify(uid)})}},profile:{id:${JSON.stringify(uid)},role:${JSON.stringify(role)},name:'Test'}})},
      withTimeout:function(p){return p},showRecovery:function(){}};`);
    if (u.pathname === '/js/owner-archive-engine.js' && engineJs === null) return route.fulfill({ status: 404, body: '' });
    if (u.pathname === '/js/owner-archive-engine.js') return js(engineJs || ENGINE_SRC);
    if (u.pathname === '/api/owner/archivio') {
      log.archivio.push({ url: req.url(), auth: req.headers()['authorization'] || '' });
      if (delayArchivio) await new Promise((r) => setTimeout(r, delayArchivio));
      if (state.archivio) return state.archivio(route);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, archive: state.proj }) });
    }
    if (u.pathname === '/api/owner/file' && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      log.posts.push({ body, auth: req.headers()['authorization'] || '' });
      if (file) return file(route, body);
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, url: '/api/owner/file?ticket=TKT.' + encodeURIComponent(body.ref), expiresAt: '2026-09-22T08:43:00Z', name: 'BOOM_Doc.pdf', size: 1000, contentType: 'application/pdf' }) });
    }
    if (u.pathname === '/api/owner/file' && u.searchParams.get('ticket')) {
      log.tickets.push({ url: req.url(), nav: req.isNavigationRequest() });
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 test' });
    }
    if (u.pathname === '/api/owner/file' && u.searchParams.get('ref')) {
      log.shares.push({ url: req.url(), auth: req.headers()['authorization'] || '' });
      return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': 'inline; filename="BOOM_Contratto.pdf"' }, body: '%PDF-1.4 test' });
    }
    if (u.pathname === '/proprietario') { log.navs++; return route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml }); }
    if (u.pathname === '/portal') return route.fulfill({ status: 200, contentType: 'text/html', body: '<p id="portal">portal</p>' });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(ORIGIN + url, { waitUntil: 'domcontentloaded' });
  return { ctx, page, log, state };
}
const settled = (page) => page.waitForFunction(() => { const l = document.getElementById('load'); return l && l.hidden && (document.getElementById('hero') || document.querySelector('.errcard')); }, null, { timeout: 8000 }).then(() => true, () => false);
const overflowX = (page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
// Gli importi portano uno spazio indivisibile dopo «€» (non si spezzano mai a
// capo): nei confronti di testo vale come uno spazio normale.
const tx = (page, sel) => page.textContent(sel).then((s) => String(s || '').replace(/\u00a0/g, ' '));
const html = (page) => page.evaluate(() => document.body.innerHTML);
// Le tre stanze: si entra toccando la barra, come farebbe il proprietario.
const room = async (page, r) => { await page.click('#tabs [data-tab="' + r + '"]'); await page.waitForSelector('.view[data-view="' + r + '"]:not([hidden])', { timeout: 3000 }).catch(() => null); };

// ── 1 · I cinque stati, a 390 e a 1440 ─────────────────────────────────
for (const w of [390, 1440]) {
  for (const s of ['ok', 'osservo', 'nonso', 'tu', 'vuoto']) {
    const { ctx, page, log } = await open({ proj: P[s], width: w });
    const ok = await settled(page);
    check(`${s}@${w}: #load nascosto e #hero presente`, ok);
    const st = await page.getAttribute('#hero', 'data-state').catch(() => null);
    check(`${s}@${w}: #hero[data-state="${s}"]`, st === s, st);
    const ov = await overflowX(page);
    check(`${s}@${w}: nessuno scorrimento orizzontale`, ov <= 0, ov + 'px');
    const h = await html(page);
    const leak = POISON.filter((x) => h.includes(x));
    check(`${s}@${w}: nessuna stringa veleno nel DOM`, leak.length === 0, leak.join(', '));
    check(`${s}@${w}: la chiamata porta il Bearer dell'utente`, log.archivio[0] && log.archivio[0].auth === 'Bearer tok-' + OWNER_UID);
    check(`${s}@${w}: nessun errore JS`, log.errors.length === 0, log.errors[0]);
    if (SHOTS) {
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(SHOTS, `${s}-${w}.png`), fullPage: true });
    }
    await ctx.close();
  }
}
for (const s of ['ok', 'tu', 'rooms', 'renewal', 'paper']) {
  const { ctx, page, log } = await open({ proj: P[s], width: 320, height: 700 });
  await settled(page);
  const ov = await overflowX(page);
  check(`${s}@320: nessuno scorrimento orizzontale`, ov <= 0, ov + 'px');
  check(`${s}@320: nessun errore JS`, log.errors.length === 0, log.errors[0]);
  await ctx.close();
}

// ── 2 · Il contenuto dice i fatti, nella forma giusta ──────────────────
{
  const { ctx, page } = await open({ proj: P.ok, width: 1440 });
  await settled(page);
  const txt = await tx(page, '#hero');
  check('ok: la frase è «Tutto in ordine.» e «Niente da fare per te.»', txt.includes('Tutto in ordine.') && txt.includes('Niente da fare per te.'));
  check('ok: «Aggiornato alle 10:42»', txt.includes('Aggiornato alle 10:42'));
  check('ok: il nastro ha 12 mesi con lo stato nella forma', (await page.$$('.ribbon .rb[data-ym][data-state]')).length === 12);
  check('ok: la linea ha l\'aereo sulla prima tappa non compiuta', (await page.$$('.linea li.now .rc-aereo')).length === 1);
  check('ok: una casa per article[data-property-id], un blocco per [data-contract-id]',
    (await page.$$('article[data-property-id="p1"]')).length === 1 && (await page.$$('[data-contract-id="c1"]')).length === 1);
  const cs = await tx(page, '#case');
  check('ok: canone in formato deterministico IT (€ 1.250,00)', cs.includes('€ 1.250,00'));
  check('ok: «Pagato dal conduttore nel 2026» con la somma vera (€ 10.000,00)', cs.includes('Pagato dal conduttore nel 2026') && cs.includes('€ 10.000,00'));
  check('ok: la nota onesta sul versamento BOOM', cs.includes('Il versamento di BOOM sul tuo conto non è ancora registrato in questo portale.'));
  check('ok: cedolare secca «sì» dal contratto', cs.includes('Cedolare secca: sì'));
  check('ok: le date del contratto dicono i giorni che MANCANO alla fine', cs.includes('dal 1 febbraio 2026 al 31 gennaio 2027 · mancano 131 giorni'));
  const ar = await tx(page, '#archivio');
  check('ok: l\'archivio raggruppa per Contratto · Consegna · Soldi · Immobile', ['Contratto', 'Consegna', 'Soldi', 'Immobile'].every((x) => ar.includes(x)));
  check('ok: la fattura BOOM dichiara «PDF non archiviato»', ar.includes('Fattura BOOM n. BOOM-2026-014') && ar.includes('PDF non archiviato'));
  check('ok: il rendiconto senza file dice che il PDF non è in archivio', ar.includes('Segnato come inviato, ma il PDF non è in archivio.'));
  check('ok: nessun link Storage, nessun href a un PDF', (await page.$$('a[href*="firebasestorage"], a[href$=".pdf"]')).length === 0);
  check('ok: nessun link di firma (non serve la sua firma)', (await page.$$('a[href*="/sign?sign="]')).length === 0);
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.osservo });
  await settled(page);
  const txt = await tx(page, '#hero');
  check('osservo: «Una rata in ritardo da 17 giorni.» + sollecito con la data', txt.includes('Una rata in ritardo da 17 giorni.') && txt.includes('Sollecito inviato il 15 settembre 2026'));
  check('osservo: la cella del mese in ritardo è «overdue»', (await page.$$('.rb[data-ym="2026-09"][data-state="overdue"]')).length === 1);
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.tu });
  await settled(page);
  check('tu: il link di firma c\'è per il proprietario', (await page.$$('#todo a[href^="https://www.boomrome.com/sign?sign="]')).length === 1);
  check('tu: la scheda porta al /scheda', (await page.$$('#todo a[href^="https://www.boomrome.com/scheda?t="]')).length === 1);
  const td = await tx(page, '#todo');
  check('tu: la scadenza passata è detta «scaduta il 1 settembre 2026» e «BOOM non ha ancora registrato l\'esito»', td.includes('scaduta il 1 settembre 2026') && td.includes('BOOM non ha ancora registrato l’esito'));
  check('tu: nessun importo fiscale nel titolo delle scadenze', !/€\s?\d/.test(td));
  check('tu: dati catastali «da completare»', (await tx(page, '#case')).includes('Dati catastali: da completare'));
  // Il contratto parte il 1/10: settembre non ha rate da aspettarsi.
  const all = await tx(page, '#app');
  check('tu: prima dell\'inizio nessuna «Rate di settembre 2026 non ancora a sistema»', !all.includes('non ancora a sistema') && !all.includes('Rate di settembre'), all.slice(0, 200));
  check('tu: la cella di settembre è «fuori dal contratto»', (await page.$$('.rb[data-ym="2026-09"][data-state="fuori"]')).length === 1);
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.paper, width: 1440 });
  await settled(page);
  const cs = await tx(page, '#case');
  check('paper: cedolare «non indicata» (mai un sì inventato)', cs.includes('Cedolare secca: non indicata'));
  check('paper: «firma non registrata a sistema» (lo stato neutro, mai «in attesa delle firme»)', cs.includes('firma non registrata a sistema') && !cs.includes('in attesa delle firme'));
  await ctx.close();
}
{
  // La firma su carta REGISTRATA dallo staff: la pagina la dice per quello che
  // è — «firmato su carta», e la tappa «firmato su carta, registrato da BOOM»
  // col giorno — e non dice più «firma non registrata a sistema».
  const proj = projection('paper', { mutate: (i) => { i.contracts[0].paperSigned = { at: '2025-05-20', by: 'adm', recordedAt: '2026-09-23T10:00:00Z' }; i.contracts[0].rliRegisteredAt = '2025-06-10'; } });
  check('fixture paper firmata su carta: la proiezione passa assertClean', ENGINE.assertClean(proj).ok);
  const { ctx, page } = await open({ proj, width: 1440 });
  await settled(page);
  const cs = await tx(page, '#case'), hero = await tx(page, '#hero');
  check('carta registrata: «firmato su carta» e la tappa «firmato su carta, registrato da BOOM»', cs.includes('firmato su carta') && cs.includes('firmato su carta, registrato da BOOM'), cs.slice(0, 300));
  check('carta registrata: niente «firma non registrata a sistema», niente «in attesa delle firme»', !cs.includes('firma non registrata a sistema') && !cs.includes('in attesa delle firme'));
  check('carta registrata E registrazione segnata: «Tutto in ordine.»', hero.includes('Tutto in ordine'), hero.slice(0, 200));
  await ctx.close();
}

// ── 3 · Il foglio: apre, Esc, fuoco, trascinamento ─────────────────────
{
  const { ctx, page, log } = await open({ proj: P.ok });
  await settled(page);
  const cell = '.ribbon .rb[data-ym="2026-08"]';
  await room(page, 'case');
  await page.click(cell);
  await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
  check('nastro: una cella apre dialog#sheet[open]', await page.$('dialog#sheet[open]') !== null);
  const body = await tx(page, '#sheetBody');
  check('nastro: il foglio elenca la rata con importo e «Pagata dal conduttore il 4 agosto 2026 · carta»',
    body.includes('€ 1.250,00') && body.includes('Pagata dal conduttore il 4 agosto 2026 · carta'));
  check('nastro: il foglio porta il rendiconto del mese', body.includes('Rendiconto di agosto 2026'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  check('foglio: Esc lo chiude', await page.$('dialog#sheet[open]') === null);
  const back = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-ym'));
  check('foglio: il fuoco torna alla cella che l\'ha aperto', back === '2026-08', back);
  // l'anno
  await page.click('.yline');
  await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
  const yb = await tx(page, '#sheetBody');
  check('anno: il foglio somma le 8 rate e ne dà il totale', (yb.match(/Pagata dal conduttore il/g) || []).length === 8 && yb.includes('€ 10.000,00'));
  // trascina giù (a foglio fermo: l'entrata dura 320ms)
  await page.waitForTimeout(450);
  const box = await page.locator('#sheetTop').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 90, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, box.y + 260, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  check('foglio: si chiude trascinandolo giù', await page.$('dialog#sheet[open]') === null);
  check('foglio: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}

{
  // Senza showModal (Safari < 15.4) il fuoco non lo restituisce il browser:
  // lo deve restituire la pagina.
  const noModal = { fn: () => { try { HTMLDialogElement.prototype.showModal = undefined; } catch (e) {} } };
  const { ctx, page, log } = await open({ proj: P.ok, init: noModal });
  await settled(page);
  await room(page, 'case');
  await page.click('.ribbon .rb[data-ym="2026-07"]');
  check('senza showModal: il foglio si apre lo stesso', await page.$('dialog#sheet[open]') !== null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  check('senza showModal: Esc lo chiude', await page.$('dialog#sheet[open]') === null);
  const back = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-ym'));
  check('senza showModal: il fuoco torna alla cella', back === '2026-07', back);
  check('senza showModal: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}

// ── 4 · Un tocco, il PDF ────────────────────────────────────────────────
{
  const { ctx, page, log } = await open({ proj: P.ok });
  await settled(page);
  await room(page, 'archivio');
  const nav = page.waitForRequest((r) => r.url().includes('/api/owner/file?ticket='), { timeout: 5000 }).catch(() => null);
  await page.click('.arow[data-ref="c:c1:signed"] .arow-main');
  const r = await nav;
  check('telefono: il tocco manda un POST col ref giusto', log.posts[0] && log.posts[0].body.ref === 'c:c1:signed' && !('as' in log.posts[0].body));
  check('telefono: il POST porta il Bearer', log.posts[0] && log.posts[0].auth === 'Bearer tok-' + OWNER_UID);
  check('telefono: poi naviga (location.assign) sull\'URL del biglietto', !!r && r.isNavigationRequest() && r.url() === ORIGIN + '/api/owner/file?ticket=TKT.' + encodeURIComponent('c:c1:signed'));
  await ctx.close();
}
{
  const initOpen = { fn: () => {
    window.__opened = [];
    window.open = function (u, n) {
      const rec = { u, n, loc: null, closed: false };
      window.__opened.push(rec);
      return { close() { rec.closed = true; }, set location(v) { rec.loc = String(v); }, get location() { return rec.loc; } };
    };
  } };
  const { ctx, page, log } = await open({ proj: P.ok, width: 1440, init: initOpen });
  await settled(page);
  await room(page, 'archivio');
  await page.click('.arow[data-ref="c:c1:signed"] .arow-main');
  const early = await page.evaluate(() => window.__opened.map((o) => ({ u: o.u, n: o.n, loc: o.loc })));
  check('desktop: la finestra si apre DENTRO il click, prima della risposta', early.length === 1 && early[0].u === '' && early[0].n === '_blank' && early[0].loc === null, JSON.stringify(early));
  await page.waitForFunction(() => window.__opened[0] && window.__opened[0].loc, null, { timeout: 4000 }).catch(() => null);
  const late = await page.evaluate(() => window.__opened[0] && window.__opened[0].loc);
  check('desktop: poi la finestra va sull\'URL del biglietto', late === ORIGIN + '/api/owner/file?ticket=TKT.' + encodeURIComponent('c:c1:signed'), late);
  check('desktop: la pagina resta dov\'è', page.url().startsWith(ORIGIN + '/proprietario'));
  // un documento di un chip della linea
  await room(page, 'case');
  await page.click('.linea .docchip[data-ref="c:c1:verbale"]');
  await page.waitForTimeout(500);
  check('desktop: il chip della linea apre il suo documento', log.posts.some((p) => p.body.ref === 'c:c1:verbale'));
  await ctx.close();
}
{
  // 413: la frase onesta, WhatsApp; la finestra desktop si richiude
  const tooBig = (route) => route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'too_large', size: 5000000, limit: 4400000 }) });
  const initOpen = { fn: () => { window.__opened = []; window.open = function () { const rec = { closed: false }; window.__opened.push(rec); return { close() { rec.closed = true; } }; }; } };
  for (const w of [390, 1440]) {
    const { ctx, page, log } = await open({ proj: P.ok, width: w, file: tooBig, init: initOpen });
    await settled(page);
    await room(page, 'archivio');
    await page.click('.arow[data-ref="c:c1:verbale"] .arow-main');
    await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
    const sb = await tx(page, '#sheetBody').catch(() => '');
    check(`413@${w}: «Documento di 5,0 MB: troppo grande da aprire qui…»`, sb.includes('Documento di 5,0 MB: troppo grande da aprire qui. Chiedilo a BOOM: te lo mandiamo noi.'), sb.slice(0, 140));
    check(`413@${w}: c'è il link WhatsApp`, (await page.$$('#sheetBody a[href^="https://wa.me/393313251961"]')).length === 1);
    check(`413@${w}: nessuna navigazione`, page.url().startsWith(ORIGIN + '/proprietario'));
    if (w === 1440) check('413@1440: la finestra vuota si richiude', await page.evaluate(() => window.__opened.length === 1 && window.__opened[0].closed));
    check(`413@${w}: nessun errore JS`, log.errors.length === 0, log.errors[0]);
    await ctx.close();
  }
}
{
  // «Invia al commercialista»: GET ?ref col Bearer (mai il biglietto nudo)
  const { ctx, page, log } = await open({ proj: P.ok, width: 1440 });
  await settled(page);
  await room(page, 'archivio');
  await page.click('.arow[data-ref="c:c1:signed"] [data-share]');
  await page.waitForTimeout(600);
  check('condividi: il file si chiede col Bearer su /api/owner/file?ref=', log.shares.length === 1 && log.shares[0].auth === 'Bearer tok-' + OWNER_UID
    && log.shares[0].url === ORIGIN + '/api/owner/file?ref=' + encodeURIComponent('c:c1:signed'));
  check('condividi: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}

// ── 5 · Lingua ─────────────────────────────────────────────────────────
{
  const { ctx, page, log } = await open({ proj: P.ok, width: 1440 });
  await settled(page);
  const it = await tx(page, '#case');
  await page.click('#lang');
  await page.waitForTimeout(100);
  const en = await tx(page, '#case');
  check('lingua: IT «€ 1.250,00» → EN «€1,250.00»', it.includes('€ 1.250,00') && en.includes('€1,250.00') && !en.includes('€ 1.250,00'));
  check('lingua: EN «All in order.»', (await tx(page, '#hero')).includes('All in order.'));
  check('lingua: la scelta resta per questo browser', await page.evaluate(() => localStorage.getItem('boom:proprietario:lang')) === 'en');
  check('lingua: html[lang] segue', await page.getAttribute('html', 'lang') === 'en');
  check('lingua: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.ok, url: '/proprietario?lang=en&via=carta' });
  await settled(page);
  check('?lang=en apre in inglese', (await tx(page, '#hero')).includes('All in order.'));
  check('?via=carta sparisce dall\'indirizzo (la carta non è una credenziale)', !page.url().includes('via=') && page.url().includes('lang=en'));
  await ctx.close();
}

// ── 6 · Vedi come (admin) ──────────────────────────────────────────────
{
  const { ctx, page, log } = await open({ proj: P.tuAs, role: 'admin', uid: ADMIN_UID, url: '/proprietario?as=' + OWNER_UID });
  await settled(page);
  check('vedi-come: #adminband visibile col nome', await page.isVisible('#adminband') && (await tx(page, '#adminband')).includes('Marco Bianchi'));
  check('vedi-come: nessun a[href*="/sign?sign="]', (await page.$$('a[href*="/sign?sign="]')).length === 0);
  check('vedi-come: nessun link alla Scheda', (await page.$$('a[href*="/scheda?t="]')).length === 0);
  check('vedi-come: al posto del link, la nota «Link personale nascosto…»', (await tx(page, '#todo')).includes('Link personale nascosto in modalità vedi come'));
  check('vedi-come: la lettura chiede ?as=<proprietario>', log.archivio[0] && log.archivio[0].url.endsWith('/api/owner/archivio?as=' + OWNER_UID));
  const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('boom:proprietario:') && k !== 'boom:proprietario:lang'));
  check('vedi-come: né ultima visita né cache scritte', ls.length === 0, ls.join(','));
  await room(page, 'archivio');
  await page.click('.arow[data-ref="c:c1:draft"] .arow-main').catch(() => null);
  await page.waitForTimeout(400);
  check('vedi-come: anche il file si chiede con as', log.posts.length === 0 || log.posts[0].body.as === OWNER_UID);
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.ok, role: 'admin', uid: ADMIN_UID });
  await page.waitForURL(ORIGIN + '/portal', { timeout: 4000 }).catch(() => null);
  check('admin senza ?as → /portal', page.url() === ORIGIN + '/portal');
  await ctx.close();
}
{
  const { ctx, page, log } = await open({ proj: P.ok, url: '/proprietario?as=own_2' });
  await settled(page);
  check('proprietario con ?as=altro: ?as ignorato anche nella lettura', log.archivio[0] && log.archivio[0].url === ORIGIN + '/api/owner/archivio');
  await ctx.close();
}

// ── 7 · Movimento: respira SOLO l'«in ordine» verificato ────────────────
{
  const anim = (page) => page.evaluate(() => [...document.querySelectorAll('.dot')].map((d) => ({ s: d.getAttribute('data-dot'), a: getComputedStyle(d).animationName })));
  let r = await open({ proj: P.ok, width: 1440, reduced: true });
  await settled(r.page);
  let dots = await anim(r.page);
  check('movimento ridotto: nessun puntino si muove', dots.length > 0 && dots.every((d) => d.a === 'none'), JSON.stringify(dots));
  await r.ctx.close();
  r = await open({ proj: P.ok, width: 1440 });
  await settled(r.page);
  dots = await anim(r.page);
  check('ok verificato: il puntino d\'oro respira', dots.some((d) => d.s === 'ok' && d.a !== 'none'));
  await r.ctx.close();
  for (const s of ['osservo', 'nonso', 'tu']) {
    r = await open({ proj: P[s], width: 1440 });
    await settled(r.page);
    dots = await anim(r.page);
    const hero = dots[0];
    check(`${s}: il puntino del verdetto è fermo`, hero && hero.s === s && hero.a === 'none', JSON.stringify(hero));
    await r.ctx.close();
  }
}

// ── 8 · Errore del server: una card, mai uno spinner ────────────────────
{
  const fail = (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"read_failed"}' });
  const { ctx, page, log, state } = await open({ proj: P.ok, archivio: fail });
  await settled(page);
  check('errore 500: card d\'errore con Riprova e WhatsApp', await page.isVisible('.errcard') && (await tx(page, '.errcard')).includes('Non riesco a leggere il tuo archivio adesso.')
    && (await page.$$('.errcard a[href^="https://wa.me/"]')).length === 1);
  check('errore 500: #load nascosto', await page.evaluate(() => document.getElementById('load').hidden));
  state.archivio = null;
  await page.click('#retry');
  await page.waitForSelector('#hero[data-state="ok"]', { timeout: 4000 }).catch(() => null);
  check('errore → Riprova: il verdetto arriva', await page.$('#hero[data-state="ok"]') !== null);
  check('errore: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}
{
  const garbage = (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>nope</html>' });
  const { ctx, page, log } = await open({ proj: P.ok, archivio: garbage });
  await settled(page);
  check('risposta non JSON: card d\'errore, niente crash', await page.isVisible('.errcard') && log.errors.length === 0, log.errors[0]);
  await ctx.close();
}

// ── 9 · Ricerca e link profondi ─────────────────────────────────────────
{
  const { ctx, page, log } = await open({ proj: P.marzo, width: 1440 });
  await settled(page);
  await page.keyboard.press('/');
  check('ricerca: «/» mette il fuoco sul campo', await page.evaluate(() => document.activeElement && document.activeElement.id === 'q'));
  await page.fill('#q', 'chiavi');
  check('ricerca: «chiavi» → il verbale di consegna', (await page.$$('#alist [data-ref="c:c1:verbale"]')).length === 1);
  check('ricerca: il risultato dice dove sta (casa › contratto › cartella)', (await tx(page, '#alist')).includes('Via Cavour 12 › Contratto 2026–27 › Consegna'));
  await page.fill('#q', 'marzo 2026');
  check('ricerca: «marzo 2026» → il rendiconto di marzo', (await page.$$('#alist [data-ref="r:own_1:2026-03"]')).length === 1);
  await page.fill('#q', 'xyzzy');
  check('ricerca: nessun risultato lo dice', (await tx(page, '#alist')).includes('Nessun documento trovato'));
  await page.fill('#q', '');
  check('ricerca: campo vuoto → l\'archivio torna intero', (await page.$$('#alist .arow')).length >= 10);
  check('ricerca: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.ok, url: '/proprietario#r=2026-08' });
  await settled(page);
  await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
  check('#r=2026-08 apre il foglio del rendiconto di agosto', await page.$('dialog#sheet[open]') !== null && (await tx(page, '#sheetTitle')).includes('Rendiconto di agosto 2026'));
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.ok, url: '/proprietario#doc=' + encodeURIComponent('p:p1:dossier-ape') });
  await settled(page);
  await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
  const sb = await tx(page, '#sheetBody').catch(() => '');
  check('#doc= apre la provenienza del documento', (await tx(page, '#sheetTitle')).includes('APE') && sb.includes('caricato nel fascicolo dell’immobile · da BOOM'));
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.ok, url: '/proprietario#q=' + encodeURIComponent('verbale') });
  await settled(page);
  check('#q= riempie la ricerca', await page.inputValue('#q') === 'verbale' && (await page.$$('#alist [data-ref="c:c1:verbale"]')).length === 1);
  await ctx.close();
}
{
  const { ctx, page } = await open({ proj: P.ok, url: '/proprietario#c=c1', height: 700 });
  await settled(page);
  await page.waitForTimeout(700);
  const top = await page.evaluate(() => document.querySelector('[data-contract-id="c1"]').getBoundingClientRect().top);
  check('#c= porta il contratto in vista, sotto le barre fisse', top > 60 && top < 400, String(top));
  await ctx.close();
}

// ── 10 · Ultima visita e risposta in cache ─────────────────────────────
{
  const seed = { fn: (uid) => { try { localStorage.setItem('boom:proprietario:seen:' + uid, '2026-08-15'); } catch (e) {} }, arg: OWNER_UID };
  const { ctx, page } = await open({ proj: P.ok, init: seed });
  await settled(page);
  await room(page, 'archivio');
  const chip = await tx(page, '#newchip').catch(() => '');
  check('ultima visita: «un nuovo documento dall\'ultima visita»', chip.includes('un nuovo documento dall’ultima visita'), chip);
  check('ultima visita: il nuovo ha il puntino d\'oro', (await page.$$('.arow[data-ref="r:own_1:2026-08"] .nu')).length === 1 && (await page.$$('.arow .nu')).length === 1);
  await page.click('#newchip');
  check('ultima visita: il chip filtra', (await page.$$('#alist .arow[data-ref]')).length === 1);
  const after = await page.evaluate((uid) => ({ seen: localStorage.getItem('boom:proprietario:seen:' + uid), cache: localStorage.getItem('boom:proprietario:v1:' + uid) }), OWNER_UID);
  check('ultima visita: si ricorda oggi', after.seen === '2026-09-22');
  const c = JSON.parse(after.cache || '{}');
  check('cache: {state, reasonCodes, at} e basta', c.state === 'ok' && Array.isArray(c.reasonCodes) && typeof c.at === 'string' && Object.keys(c).length === 3);
  check('cache: niente importi, niente nomi', !/€|Marco|Cavour|Rossi|\d{3,}/.test(JSON.stringify({ s: c.state, r: c.reasonCodes })));
  await ctx.close();
}
{
  const seed = { fn: (uid) => { try { localStorage.setItem('boom:proprietario:v1:' + uid, JSON.stringify({ state: 'osservo', reasonCodes: ['rent_overdue'], at: new Date().toISOString() })); } catch (e) {} }, arg: OWNER_UID };
  const { ctx, page } = await open({ proj: P.ok, init: seed, delayArchivio: 900 });
  await page.waitForSelector('#hero.dim', { timeout: 3000 }).catch(() => null);
  const early = await page.evaluate(() => ({ dim: !!document.querySelector('#hero.dim'), load: document.getElementById('load').hidden, tx: (document.getElementById('hero') || {}).textContent || '' }));
  check('cache: la risposta di ieri si dipinge smorzata con «verifico…», senza loader', early.dim && early.load && early.tx.includes('verifico…'), JSON.stringify(early));
  await page.waitForSelector('#hero[data-state="ok"]', { timeout: 4000 }).catch(() => null);
  check('cache: poi arriva la risposta vera', await page.$('#hero[data-state="ok"]') !== null);
  check('cache: lo stato è cambiato → il filo d\'oro passa', await page.$('#sweep.go') !== null);
  await ctx.close();
}

// ── 11 · Più case, rinnovo, stanze ─────────────────────────────────────
{
  const { ctx, page, log } = await open({ proj: P.renewal, width: 1440 });
  await settled(page);
  const cs = await tx(page, '#case');
  check('rinnovo: i contratti precedenti stanno in «Contratti precedenti (1)»', cs.includes('Contratti precedenti (1)'));
  check('rinnovo: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}
{
  const { ctx, page, log } = await open({ proj: P.rooms, width: 390 });
  await settled(page);
  check('stanze: due blocchi contratto nella stessa casa', (await page.$$('article[data-property-id="p1"] [data-contract-id]')).length === 2);
  check('stanze: «Interno A» e «Interno B»', (await tx(page, '#case')).includes('Interno A') && (await tx(page, '#case')).includes('Interno B'));
  check('stanze: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}

// ── 11b · La revisione avversariale del 23/09 ──────────────────────────
// Ogni difetto confermato si prova sulla pagina VERA (verde) e sulla stessa
// pagina col difetto rimesso (rosso): la mutazione riscrive il sorgente
// servito, il file sul disco non si tocca.
{
  // Bersaglio assente = la pagina è cambiata (o è stata mutata sul disco): un
  // controllo rosso che lo dice, e il verde gira comunque.
  const mut = (from, to) => { if (!HTML.includes(from)) { check('bersaglio di mutazione presente: ' + from.slice(0, 70), false); return null; } return HTML.replace(from, to); };
  async function redGreen(name, fn, mutated) {
    let g = false, r = false;
    try { g = !!(await fn(HTML)); } catch (e) { g = false; }
    check(name + ' (verde sulla pagina vera)', g);
    if (mutated == null) return;
    try { r = !(await fn(mutated)); } catch (e) { r = true; }
    check(name + ' (rosso col difetto rimesso)', r);
  }
  const R = {
    rented: projection('ok', { mutate: (i) => { delete i.properties[0].status; i.properties[0].availabilityStatus = 'rented'; i.contracts = []; i.payments = []; i.documents = []; i.invoices = []; } }),
    terminated: projection('ok', { mutate: (i) => { const c = i.contracts[0]; c.status = 'terminated'; c.terminatedAt = '2026-06-30'; i.properties[0].status = 'vacant';
      i.payments = i.payments.map((p) => (p.month && p.month > '2026-06') ? { ...p, status: 'pending', paidDate: undefined, paidVia: undefined } : p); } }),
    depLate: projection('ok', { mutate: (i) => { const d = i.payments.find((p) => p.id === 'depbal_c1'); d.status = 'pending'; delete d.paidDate; delete d.paidVia; } }),
    roomsLate: projection('rooms', { mutate: (i) => { const x = i.payments.find((p) => p.id === 'pay_cA_2026-09'); x.status = 'pending'; delete x.paidDate; delete x.paidVia; } }),
    // Cessato SENZA terminatedAt (chiusura 23/09): le rate aperte restano.
    termUndated: projection('ok', { mutate: (i) => { const c = i.contracts[0]; c.status = 'terminated'; delete c.terminatedAt; i.properties[0].status = 'vacant';
      i.payments = i.payments.map((p) => (p.month && p.month > '2026-06') ? { ...p, status: 'pending', paidDate: undefined, paidVia: undefined } : p); } }),
    okAs: projection('ok', { viewAs: true }),
  };
  for (const [k, v] of Object.entries(R)) check(`revisione: fixture ${k} passa assertClean`, ENGINE.assertClean(v).ok);

  // (b) la casa senza contratto dice il SUO fatto
  await redGreen('casa segnata affittata senza contratto: «Risulta affittato…», mai «Immobile libero» accanto', async (html) => {
    const { ctx, page } = await open({ proj: R.rented, html });
    await settled(page);
    const cs = await tx(page, '#case'), hero = await page.getAttribute('#hero', 'data-state');
    await ctx.close();
    return hero === 'nonso' && cs.includes('Risulta affittato, nessun contratto attivo a sistema') && !cs.includes('Immobile libero');
  }, mut(`+(cur.length?cur.map(contractHtml).join(''):leaseFact?'<p class="note" style="margin-top:0" data-fact="'+esc(leaseFact.k)+'">'+esc(factText(leaseFact))+'</p>':'')+'</div>';`,
    `+(cur.length?cur.map(contractHtml).join(''):'<p class="note" style="margin-top:0">'+esc(t('facts.vacant'))+'</p>')+'</div>';`));
  {
    const { ctx, page } = await open({ proj: projection('ok', { mutate: (i) => { i.contracts = []; i.payments = []; i.properties[0].status = 'vacant'; } }) });
    await settled(page);
    check('casa libera: il fatto «Immobile libero» resta', (await tx(page, '#case')).includes('Immobile libero: nessun contratto a sistema'));
    await ctx.close();
  }

  // (c) il cessato: date fino alla cessazione, rate dopo = da verificare
  const termCase = async (html) => {
    const { ctx, page } = await open({ proj: R.terminated, html, width: 1440 });
    await settled(page);
    const cs = await tx(page, '#case');
    await ctx.close();
    return cs.includes('dal 1 febbraio 2026 al 30 giugno 2026') && !cs.includes('al 31 gennaio 2027') && !/mancano \d+ giorni/.test(cs);
  };
  await redGreen('cessato: «dal 1 febbraio 2026 al 30 giugno 2026», niente «mancano … giorni»', termCase,
    mut('var to=cess&&(!c.endDate||cess.date<c.endDate)?cess.date:c.endDate;', 'var to=c.endDate;'));
  await redGreen('cessato: la rata di agosto dice «Successiva alla cessazione del 30 giugno 2026: BOOM verifica…»', async (html) => {
    const { ctx, page } = await open({ proj: R.terminated, html });
    await settled(page);
    const hero = await tx(page, '#hero'), st = await page.getAttribute('#hero', 'data-state');
    await room(page, 'case');
    await page.click('.ribbon .rb[data-ym="2026-08"]');
    await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
    const sb = await tx(page, '#sheetBody').catch(() => '');
    await ctx.close();
    return st === 'nonso' && !/in ritardo/i.test(hero) && hero.includes('Ci sono rate aperte dopo la cessazione del 30 giugno 2026')
      && sb.includes('Successiva alla cessazione del 30 giugno 2026: BOOM verifica se è dovuta') && !sb.includes('In ritardo');
  }, mut("if(r.afterEnd)return t('row.after_end',{date:D(r.afterEnd)});", ''));

  // (d) il saldo deposito in ritardo è nella frase
  await redGreen('saldo deposito scaduto: «Saldo deposito in ritardo da 233 giorni.», puntino rosso', async (html) => {
    const { ctx, page } = await open({ proj: R.depLate, html });
    await settled(page);
    const h = await tx(page, '#verdictTx'), st = await page.getAttribute('#hero', 'data-state');
    await ctx.close();
    return st === 'osservo' && h.startsWith('Saldo deposito in ritardo da 233 giorni.');
  }, mut("if(co.length===1)return {s:t('verdict.osservo.charge_overdue',{what:whatOf(co[0]),days:co[0].days}),used:'charge_overdue'};", ''));

  // (e) firma non registrata = stato neutro; il rinnovo non firmato aspetta le firme
  await redGreen('firma non registrata: «Contratto fino al 31 maggio 2029 · firma non registrata a sistema», mai «firmato su carta» né «in attesa delle firme»', async (html) => {
    const { ctx, page } = await open({ proj: P.paper, html });
    await settled(page);
    const all = await tx(page, '#app');
    await ctx.close();
    return all.includes('Contratto fino al 31 maggio 2029 · firma non registrata a sistema') && !all.includes('firmato su carta') && !all.includes('in attesa delle firme')
      && !all.includes('Contratto firma non registrata');
  }, mut("if(f.status==='unrecorded'&&f.to)return t('facts.lease_unrecorded',{date:D(f.to)});", ''));
  // Chiusura 23/09: l'hero lo dice — «Non posso dirlo con certezza.» col
  // motivo, mai «Tutto in ordine.»; il «da fare» non chiede una firma.
  await redGreen('firma non registrata: l\'hero dice «Non posso dirlo con certezza.» e «La firma del contratto non risulta a sistema: BOOM verifica.»', async (html) => {
    const { ctx, page } = await open({ proj: P.paper, html });
    await settled(page);
    const hero = await tx(page, '#hero'), st = await page.getAttribute('#hero', 'data-state');
    const signLinks = (await page.$$('a[href*="/sign?sign="]')).length, all = await tx(page, '#app');
    await ctx.close();
    return st === 'nonso' && hero.includes('Non posso dirlo con certezza.') && hero.includes('La firma del contratto non risulta a sistema: BOOM verifica.')
      && !all.includes('Tutto in ordine.') && signLinks === 0;
  }, mut("  'signature_unrecorded'];", "  ];"));
  {
    const { ctx, page } = await open({ proj: P.paper, url: '/proprietario?lang=en' });
    await settled(page);
    const all = await tx(page, '#app');
    check('firma non registrata, EN: «signature not recorded in the system» e il motivo, mai «All in order.»', all.includes('Lease until 31 May 2029 · signature not recorded in the system')
      && all.includes('The lease signature isn’t recorded in the system: BOOM is checking.') && !all.includes('All in order.'));
    await ctx.close();
  }
  // Cessato SENZA data (chiusura 23/09): nessuna rata «in ritardo», la riga
  // e il motivo dicono che la data di cessazione non è registrata.
  await redGreen('cessato senza data: il foglio di agosto dice «Contratto cessato, data di cessazione non registrata: BOOM verifica se è dovuta»', async (html) => {
    const { ctx, page } = await open({ proj: R.termUndated, html });
    await settled(page);
    const hero = await tx(page, '#hero'), st = await page.getAttribute('#hero', 'data-state');
    await room(page, 'case');
    await page.click('.ribbon .rb[data-ym="2026-08"]');
    await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
    const sb = await tx(page, '#sheetBody').catch(() => '');
    await ctx.close();
    return st === 'nonso' && !/in ritardo/i.test(hero) && sb.includes('Contratto cessato, data di cessazione non registrata: BOOM verifica se è dovuta')
      && !/In ritardo/.test(sb) && !sb.includes('Stato non registrato');
  }, mut("  if(r.afterTermination)return t('row.after_end_undated');", ''));
  await redGreen('cessato senza data: l\'hero dice «…su un contratto cessato senza data di cessazione registrata…», mai «del :»', async (html) => {
    const { ctx, page } = await open({ proj: R.termUndated, html });
    await settled(page);
    const hero = await tx(page, '#hero');
    await ctx.close();
    return hero.includes('Ci sono rate aperte su un contratto cessato senza data di cessazione registrata: BOOM verifica se sono dovute.')
      && !hero.includes('cessazione del :') && !hero.includes('{date}');
  }, mut("var txt=t('reason.'+r.code+(r.code==='charges_after_termination'&&!r.date?'_undated':''),p);", "var txt=t('reason.'+r.code,p);"));
  {
    const clone = projection('ok', { mutate: (i) => { const old = i.contracts[0]; delete old.preAgreementId; delete old.pdfGeneratedBy;
      old.status = 'renewed'; old.renewedToId = 'c2'; old.startDate = '2025-10-01'; old.endDate = '2026-09-30';
      const c = JSON.parse(JSON.stringify(old));
      ['tenantSignature', 'landlordSignature', 'tenantSignedAt', 'landlordSignedAt', 'fullySignedAt', 'finalizedAt', 'signedPdfUrl', 'schedaCanoneUrl', 'rliRegisteredAt', 'generatedPDF', 'renewedToId', 'signingCertificateUrl'].forEach((k) => delete c[k]);
      Object.assign(c, { id: 'c2', startDate: '2026-10-01', endDate: '2027-09-30', status: 'active', signatureStatus: 'none', renewalOf: 'c1', createdAt: '2026-09-15T10:00:00Z' });
      i.contracts = [old, c]; } });
    const { ctx, page } = await open({ proj: clone });
    await settled(page);
    const all = await tx(page, '#app'), st = await page.getAttribute('#hero', 'data-state');
    check('rinnovo non firmato: «in attesa delle firme», mai «Tutto in ordine»', all.includes('in attesa delle firme') && st !== 'ok' && !all.includes('Tutto in ordine.'), st);
    await ctx.close();
  }

  // (g) le stanze: di chi è la rata
  const roomsSheet = async (html) => {
    const { ctx, page } = await open({ proj: R.roomsLate, html });
    await settled(page);
    await room(page, 'case');
    await page.click('.ribbon .rb[data-ym="2026-09"]');
    await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
    const sb = await tx(page, '#sheetBody');
    await ctx.close();
    return /Interno A · Anna Verdi[\s\S]*In ritardo da 17 giorni/.test(sb) && sb.includes('Interno B · Bruno Neri');
  };
  await redGreen('stanze: nel foglio del mese ogni rata dice interno e conduttore', roomsSheet,
    mut(`+(whoOf(r)?'<p class="q who">'+esc(whoOf(r))+'</p>':'')`, ''));
  await redGreen('stanze: il fatto del mese in ritardo nomina l\'interno («… · Interno A · Anna Verdi»)', async (html) => {
    const { ctx, page } = await open({ proj: R.roomsLate, html });
    await settled(page);
    const h = await tx(page, '#hero');
    await ctx.close();
    return h.includes('Rata di settembre 2026 in ritardo da 17 giorni · Interno A · Anna Verdi');
  }, mut("return who?s+' · '+who:s;", 'return s;'));

  // (h) la fattura si trova
  await redGreen('ricerca: «fattura» e «BOOM-2026-014» trovano la fattura, col percorso', async (html) => {
    const { ctx, page } = await open({ proj: P.ok, html });
    await settled(page);
    let okAll = true;
    await room(page, 'archivio');
    for (const q of ['fattura', 'BOOM-2026-014', 'Fattura BOOM']) {
      await page.fill('#q', q);
      const n = (await page.$$('#alist [data-invoice="aspi_registrazione_c1"]')).length, t = await tx(page, '#alist');
      okAll = okAll && n === 1 && !t.includes('Nessun documento trovato') && t.includes('Via Cavour 12 › Contratto 2026–27 › Soldi');
    }
    await ctx.close();
    return okAll;
  }, mut("if(r.type==='invoice')return INV[r.id]?invHtml(INV[r.id],path):'';", ''));

  // (i) senza motore: una card vera, niente pagina nera; senza BoomPortal Riprova ricarica
  await redGreen('motore irraggiungibile (404): card d\'errore in italiano con WhatsApp, nessun errore JS', async (html) => {
    const { ctx, page, log } = await open({ proj: P.ok, html, engineJs: null });
    await settled(page);
    const r = { card: await page.isVisible('.errcard'), t: await tx(page, '.errcard').catch(() => ''), wa: (await page.$$('.errcard a[href^="https://wa.me/393313251961"]')).length,
      hl: await tx(page, '#hl'), exit: await tx(page, '#logout'), errs: log.errors.length };
    await ctx.close();
    return r.card && r.t.includes('Non riesco a leggere il tuo archivio adesso.') && r.t.includes('Riprova') && r.wa === 1 && r.hl === 'Il tuo archivio' && r.exit === 'Esci' && r.errs === 0;
  }, mut("function wa(text){return 'https://wa.me/'+(O?O.CONTACT.wa:WA_NUMBER)+", "function wa(text){return 'https://wa.me/'+O.CONTACT.wa+"));
  {
    const { ctx, page, log } = await open({ proj: P.ok, engineJs: null, url: '/proprietario?lang=en' });
    await settled(page);
    check('motore irraggiungibile, ?lang=en: la card parla inglese', (await tx(page, '.errcard')).includes('I can’t read your archive right now.') && log.errors.length === 0, log.errors[0]);
    await ctx.close();
  }
  await redGreen('BoomPortal assente: «Riprova» ricarica la pagina (mai un bottone spento)', async (html) => {
    const { ctx, page, log } = await open({ proj: P.ok, html, portalJs: '/* vuoto */' });
    await settled(page);
    const before = log.navs;
    await page.click('#retry');
    await page.waitForFunction((n) => true, before, { timeout: 100 }).catch(() => {});
    await page.waitForTimeout(700);
    const r = { navs: log.navs - before, errs: log.errors.length };
    await ctx.close();
    return r.navs >= 1 && r.errs === 0;
  }, mut("    if(!O||!window.BoomPortal||!USER){location.reload();return}\n", ''));

  // (j) il doppio tocco non apre due volte
  const initOpen = { fn: () => { window.__opened = []; window.open = function (u, n) { const rec = { u, n, loc: null }; window.__opened.push(rec);
    return { close() {}, set location(v) { rec.loc = String(v); }, get location() { return rec.loc; } }; }; } };
  const slowFile = async (route, body) => { await new Promise((r) => setTimeout(r, 1500)); return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, url: '/api/owner/file?ticket=TKT.' + encodeURIComponent(body.ref), expiresAt: '2026-09-22T08:43:00Z' }) }); };
  const busyMut = mut("  if(BUSY[ref]||(trig&&trig.getAttribute('aria-busy')==='true'))return;\n", '');
  await redGreen('desktop: il doppio clic su un documento apre UNA scheda e manda UN POST', async (html) => {
    const { ctx, page, log } = await open({ proj: P.ok, html, width: 1440, init: initOpen, file: slowFile });
    await settled(page);
    await room(page, 'archivio');
    await page.dblclick('.arow[data-ref="c:c1:signed"] .arow-main');
    await page.waitForTimeout(2200);
    const w = await page.evaluate(() => window.__opened.length);
    await ctx.close();
    return w === 1 && log.posts.length === 1;
  }, busyMut);
  await redGreen('telefono: tre tocchi mentre il biglietto arriva → un POST, e la riga si vede occupata', async (html) => {
    const { ctx, page, log } = await open({ proj: P.ok, html, file: slowFile });
    await settled(page);
    const sel = '.arow[data-ref="c:c1:signed"] .arow-main';
    await room(page, 'archivio');
    await page.tap(sel);
    const during = await page.evaluate((s) => { const e = document.querySelector(s); return { busy: e.getAttribute('aria-busy'), op: +getComputedStyle(e).opacity }; }, sel);
    await page.tap(sel, { force: true }); await page.tap(sel, { force: true });
    await page.waitForTimeout(300);
    const posts = log.posts.length;
    await ctx.close();
    return posts === 1 && during.busy === 'true' && during.op < 1;
  }, busyMut);

  // (k) condividi: iOS perde il gesto → lo si dice
  const shareInit = { fn: () => { window.__shareCalls = 0; navigator.canShare = () => true;
    navigator.share = () => { window.__shareCalls++; return window.__shareCalls === 1 ? Promise.reject(new DOMException('gesto perso', 'NotAllowedError')) : Promise.resolve(); }; } };
  await redGreen('condividi dall\'icona: gesto perso → il foglio dice «Tocca di nuovo per inviare», il secondo tocco condivide il file già pronto', async (html) => {
    const { ctx, page, log } = await open({ proj: P.ok, html, init: shareInit });
    await settled(page);
    await room(page, 'archivio');
    await page.tap('.arow[data-ref="c:c1:signed"] [data-share]');
    await page.waitForSelector('dialog#sheet[open]', { timeout: 3000 }).catch(() => null);
    const sb = await tx(page, '#sheetBody').catch(() => '');
    await page.tap('#sheetBody [data-share]').catch(() => null);
    await page.waitForTimeout(300);
    const calls = await page.evaluate(() => window.__shareCalls);
    await ctx.close();
    return sb.includes('Tocca di nuovo per inviare') && calls === 2 && log.shares.length === 1;
  }, mut("        else infoSheet(ref,btn,esc(t('share.tap')));\n", ''));

  // (l) vedi-come sul telefono: la ricerca e i link profondi non finiscono sotto la banda
  await redGreen('vedi-come@390: il campo di ricerca attaccato in alto si può toccare', async (html) => {
    const { ctx, page } = await open({ proj: R.okAs, html, role: 'admin', uid: ADMIN_UID, url: '/proprietario?as=' + OWNER_UID, reduced: true });
    await settled(page); await page.waitForTimeout(200);
    await room(page, 'archivio');
    await page.evaluate(() => { window.scrollTo(0, 900); });
    await page.waitForTimeout(300);
    const hit = await page.evaluate(() => { const q = document.getElementById('q'), b = q.getBoundingClientRect(); return document.elementFromPoint(b.left + 60, b.top + b.height / 2) === q; });
    await ctx.close();
    return hit;
  }, mut('body.va .search{top:calc(var(--top) + 6px + var(--band,58px))}\n', ''));
  await redGreen('vedi-come@390: #c= porta il contratto SOTTO la banda e il salto della casa, e si può toccare', async (html) => {
    const { ctx, page } = await open({ proj: R.okAs, html, role: 'admin', uid: ADMIN_UID, url: '/proprietario?as=' + OWNER_UID, reduced: true });
    await settled(page); await page.waitForTimeout(200);
    await page.evaluate(() => { location.hash = 'c=c1'; });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => { const el = document.querySelector('[data-contract-id="c1"] .ct-title'), b = el.getBoundingClientRect(), qn = document.querySelector('article[data-property-id] .jump').getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return { top: b.top, qnav: qn.bottom, hit: el.contains(hit) }; });
    await ctx.close();
    return r.top >= r.qnav && r.hit;
  }, mut("body.va section,body.va article,body.va [data-contract-id],body.va .hsec{scroll-margin-top:calc(var(--top) + 72px + var(--band,58px))}\n", ''));

  // (m) Esci: il proprietario alla sua porta, l'admin al portal
  const logoutMut = mut("var dest=PROFILE&&PROFILE.role==='admin'?'/portal':'/login?next=%2Fproprietario';", "var dest='/login';");
  const leaveTo = async (page) => {
    const nav = page.waitForRequest((r) => r.isNavigationRequest() && !new URL(r.url()).pathname.startsWith('/proprietario'), { timeout: 4000 }).catch(() => null);
    await page.click('#logout');
    const r = await nav;
    return r ? r.url() : '';
  };
  await redGreen('Esci (proprietario) → /login?next=%2Fproprietario, la porta italiana del proprietario', async (html) => {
    const { ctx, page } = await open({ proj: P.ok, html });
    await settled(page);
    const u = await leaveTo(page);
    await ctx.close();
    return u === ORIGIN + '/login?next=%2Fproprietario';
  }, logoutMut);
  await redGreen('Esci (admin in vedi-come) → /portal', async (html) => {
    const { ctx, page } = await open({ proj: R.okAs, html, role: 'admin', uid: ADMIN_UID, url: '/proprietario?as=' + OWNER_UID });
    await settled(page);
    const u = await leaveTo(page);
    await ctx.close();
    return u === ORIGIN + '/portal';
  }, logoutMut);

  if (SHOTS) {
    for (const [name, proj] of [['ok', P.ok], ['tu', P.tu], ['rooms', P.rooms], ['rooms-late', R.roomsLate], ['renewal', P.renewal], ['paper', P.paper], ['terminated', R.terminated], ['deposit-late', R.depLate], ['rented-no-lease', R.rented]]) {
      const { ctx, page } = await open({ proj, width: 390, reduced: true });
      await settled(page); await page.waitForTimeout(250);
      await page.screenshot({ path: join(SHOTS, `rev-${name}-390.png`), fullPage: true });
      await ctx.close();
    }
  }
}

// ── 11c · Le tre stanze (24/09): la faccia del proprietario ──────────────
// «Troppo basilare, identico all'altro»: la pagina portava gli STESSI token
// di /casa (l'inquilino). Qui si pretende l'identità propria e il modello a
// stanze: Oggi (la risposta) · Case · Archivio, con l'indirizzo che segue.
{
  const TENANT = read('tenant.html');
  const tok = (src) => { const m = /:root\{([\s\S]*?)\}/.exec(src); return m ? m[1].replace(/\s+/g, '') : ''; };
  check('identità: il blocco :root del proprietario NON è quello di /casa', tok(HTML) && tok(HTML) !== tok(TENANT));
  check('identità: niente token di /casa (--void:#050506) né la griglia a puntini', !/--void:#050506/.test(HTML) && !/\.bg \.grid/.test(HTML));
  check('identità: carattere di sistema Apple in testa alla pila', /--font:-apple-system,BlinkMacSystemFont/.test(HTML));
}
{
  const { ctx, page, log } = await open({ proj: P.ok });
  await settled(page);
  const vis = () => page.evaluate(() => [...document.querySelectorAll('.view')].filter((v) => !v.hidden).map((v) => v.getAttribute('data-view')));
  const tabNames = (pg) => pg.$$eval('#tabs .tab > span:not(.bd)', (x) => x.map((e) => e.textContent).join(' '));
  check('stanze: tre bottoni nella barra (Oggi · Casa · Archivio)', (await tabNames(page)) === 'Oggi Casa Archivio', await tabNames(page));
  check('stanze: si apre su Oggi, e si vede SOLO Oggi', JSON.stringify(await vis()) === '["oggi"]' && await page.getAttribute('#tabs [data-tab="oggi"]', 'aria-current') === 'page');
  await room(page, 'case');
  check('stanze: Casa → la casa, con l\'indirizzo che segue (#case)', JSON.stringify(await vis()) === '["case"]' && page.url().endsWith('#case') && await page.getAttribute('#tabs [data-tab="case"]', 'aria-current') === 'page');
  const ring = await page.getAttribute('.ring', 'aria-label').catch(() => '');
  check('anello: «131 giorni alla fine · Giorno 234 di 365» (dalle date del contratto)', ring === '131 giorni alla fine · Giorno 234 di 365', ring);
  const jumps = await page.$$eval('article[data-property-id="p1"] .jump [data-jump]', (b) => b.map((x) => x.textContent));
  check('casa: il salto Contratto · Soldi · Interventi · Immobile', JSON.stringify(jumps) === '["Contratto","Soldi","Interventi","Immobile"]', JSON.stringify(jumps));
  await page.click('article[data-property-id="p1"] .jump [data-jump$="-soldi"]');
  await page.waitForTimeout(900);
  const sj = await page.evaluate(() => ({ top: document.getElementById('hs-p1-soldi').getBoundingClientRect().top, bottom: innerHeight + scrollY >= document.documentElement.scrollHeight - 2, y: scrollY }));
  check('casa: il salto porta a «Soldi» sotto le barre (o in fondo, se la pagina finisce prima)', sj.y > 0 && sj.top > 50 && (sj.top < 260 || sj.bottom), JSON.stringify(sj));
  await room(page, 'archivio');
  check('stanze: Archivio → #archivio', JSON.stringify(await vis()) === '["archivio"]' && page.url().endsWith('#archivio'));
  const folds = await page.$$eval('.fold', (b) => b.map((x) => x.querySelector('b').textContent + ':' + x.querySelector('small').textContent));
  check('archivio: le quattro cartelle coi conteggi veri', JSON.stringify(folds) === '["Contratto:3 documenti","Consegna:2 documenti","Soldi:5 documenti","Immobile:4 documenti"]', JSON.stringify(folds));
  await page.click('.fold[data-folder="consegna"]');
  const refs = await page.$$eval('#alist .arow[data-ref]', (r) => r.map((x) => x.getAttribute('data-ref')).sort());
  check('archivio: la cartella Consegna mostra SOLO verbale e inventario', JSON.stringify(refs) === '["c:c1:inv-in","c:c1:verbale"]', JSON.stringify(refs));
  await page.click('.fclear');
  check('archivio: «× Tutto» riporta l\'archivio intero', (await page.$$('#alist .arow')).length >= 10);
  const heads = await page.$$eval('#alist .agroup > h3', (h) => h.map((x) => x.textContent));
  check('archivio: una linea del tempo per mese, dal più recente («Settembre 2026» in testa)', heads[0] === 'Settembre 2026' && heads.includes('Febbraio 2026'), heads.join(' | '));
  check('archivio: dice come si aprono i documenti (link personale di 60 secondi)', (await tx(page, '#archivio')).includes('link personale che vale 60 secondi'));
  await page.goBack();
  await page.waitForTimeout(200);
  check('stanze: «indietro» torna alla stanza di prima', JSON.stringify(await vis()) === '["case"]');
  await room(page, 'oggi');
  const tiles = await tx(page, '.pulse');
  check('Oggi: il polso dice i numeri veri (€ 10.000,00 · tra 131 giorni)', tiles.includes('€ 10.000,00') && tiles.includes('tra 131 giorni'), tiles);
  check('Oggi: senza rata in arrivo, nessuna tessera inventata', !tiles.includes('Prossima rata'));
  await page.click('#novita .frow[data-ref="r:own_1:2026-08"]');
  await page.waitForTimeout(500);
  check('Oggi: un documento del feed si apre col suo ref', log.posts.some((x) => x.body.ref === 'r:own_1:2026-08'));
  check('stanze: nessun errore JS', log.errors.length === 0, log.errors[0]);
  await ctx.close();
}
{
  const proj = multiProjection();
  check('fixture multi: la proiezione passa assertClean', ENGINE.assertClean(proj).ok);
  for (const w of [320, 390, 1440]) {
    const { ctx, page, log } = await open({ proj, width: w, height: 800 });
    await settled(page);
    await room(page, 'case');
    const cards = await page.$$eval('.pcard', (c) => c.map((x) => x.querySelector('h3').textContent));
    check(`più case@${w}: il portafoglio ha una carta per casa`, JSON.stringify(cards) === '["Via Cavour 12","Via dei Serpenti 40"]', JSON.stringify(cards));
    check(`più case@${w}: nessuna casa aperta finché non la scegli`, (await page.$$('article.house:not([hidden])')).length === 0);
    await page.click('.pcard[data-goto="p=p2"]');
    await page.waitForFunction(() => location.hash === '#p=p2' && !document.getElementById('cback').hidden, null, { timeout: 3000 }).catch(() => null);
    const open1 = await page.$$eval('article.house:not([hidden])', (a) => a.map((x) => x.getAttribute('data-property-id')));
    check(`più case@${w}: la carta apre SOLO la sua casa, col ritorno`, JSON.stringify(open1) === '["p2"]' && await page.isVisible('#cback') && !(await page.isVisible('#clist')));
    check(`più case@${w}: la barra dice il nome della casa`, (await tx(page, '#hl')) === 'Via dei Serpenti 40');
    check(`più case@${w}: la rata in ritardo è sul nastro della SUA casa`, (await page.$$('article[data-property-id="p2"] .rb[data-ym="2026-09"][data-state="overdue"]')).length === 1);
    await room(page, 'case');
    // l'indirizzo cambia subito, l'evento hashchange arriva dopo: si aspetta la pagina, non l'indirizzo
    await page.waitForFunction(() => !document.getElementById('clist').hidden, null, { timeout: 3000 }).catch(() => null);
    const back = await page.evaluate(() => ({ h: location.hash, clist: document.getElementById('clist').hidden, open: document.querySelectorAll('article.house:not([hidden])').length }));
    check(`più case@${w}: Case di nuovo → il portafoglio`, back.h === '#case' && !back.clist && back.open === 0, JSON.stringify(back));
    check(`più case@${w}: il badge rosso sulla stanza Case`, (await tx(page, '#tabs [data-tab="case"] .bd.red')) === '1');
    const ov = await overflowX(page);
    check(`più case@${w}: nessuno scorrimento orizzontale`, ov <= 0, ov + 'px');
    const h = await html(page);
    check(`più case@${w}: nessuna stringa veleno`, POISON.every((x) => !h.includes(x)));
    check(`più case@${w}: nessun errore JS`, log.errors.length === 0, log.errors[0]);
    await ctx.close();
  }
}
{
  const { ctx, page } = await open({ proj: P.ok, url: '/proprietario?lang=en' });
  await settled(page);
  const en = await page.$$eval('#tabs .tab > span:not(.bd)', (x) => x.map((e) => e.textContent).join(' '));
  check('stanze EN: Today · Home · Archive', en === 'Today Home Archive', en);
  await ctx.close();
}

// ── 12 · La porta: /login verso /proprietario parla SOLO italiano ──────
// La pagina VERA (login.html) con un Firebase finto: il reset si registra,
// il login fallisce con wrong-password. Fuori da /proprietario la pagina
// resta quella di sempre, in inglese.
{
  const LOGIN = read('login.html');
  const fb = (mode) => `(function(){var calls=window.__reset=[];
    function auth(){return {setPersistence:function(){return Promise.resolve()},onAuthStateChanged:function(){},
      sendPasswordResetEmail:function(e,st){calls.push({e:e,url:st&&st.url||null});return Promise.resolve()},
      signInWithEmailAndPassword:function(){return Promise.reject({code:'auth/wrong-password'})},currentUser:null}}
    auth.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};
    ${mode === 'nofb' ? '' : 'window.firebase={initializeApp:function(){},auth:auth};'}})();`;
  const loginAt = async (url, { width = 390, height = 844, mode = 'ok' } = {}) => {
    const mobile = width < 900;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.origin === ORIGIN && u.pathname === '/login') return route.fulfill({ status: 200, contentType: 'text/html', body: LOGIN });
      if (u.hostname === 'www.gstatic.com' && u.pathname.endsWith('firebase-app-compat.js')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fb(mode) });
      if (u.hostname === 'www.gstatic.com' || u.pathname === '/js/boom-err.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return route.abort();
    });
    await page.goto(ORIGIN + url, { waitUntil: 'load' });
    return { ctx, page, errors };
  };
  // Tutto il testo della pagina (anche quello nascosto a questa larghezza:
  // l'eroe desktop e la testata mobile) più placeholder, aria-label, title.
  const copy = (page) => page.evaluate(() => {
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const el = n.parentElement; if (el && !el.closest('script,style,svg') && n.nodeValue.trim()) out.push(n.nodeValue.trim()); }
    document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => ['placeholder', 'aria-label', 'title'].forEach((a) => { const v = el.getAttribute(a); if (v) out.push(v); }));
    return { text: out.join(' | '), lang: document.documentElement.lang, title: document.title, forms: document.forms.length };
  });
  const EN = ['Forgot', 'Sign in', 'Show', 'Hide', 'Back to site', 'Welcome', 'Browse', 'Contact', 'Encrypted', 'Caps Lock', 'Rome is yours',
    'beautifully', 'Listings', 'Wallet', 'Trusted', 'Rental', 'Every', 'you@email.com', 'home', 'Please', 'Incorrect'];
  const msg = (page) => page.waitForFunction(() => document.getElementById('message').classList.contains('show'), null, { timeout: 4000 })
    .then(() => page.evaluate(() => document.getElementById('message').textContent), () => '');
  const RESET = 'Se l’email è registrata ti abbiamo scritto: apri il link, scegli la password, poi torna qui.';

  for (const w of [390, 1440]) {
    const { ctx, page, errors } = await loginAt('/login?next=%2Fproprietario', { width: w, height: w < 900 ? 844 : 900 });
    const c = await copy(page);
    const en = EN.filter((x) => c.text.includes(x));
    check(`login proprietario@${w}: nessuna parola inglese nella pagina`, en.length === 0, en.join(', '));
    check(`login proprietario@${w}: lang it, titolo italiano, un solo form`, c.lang === 'it' && /Il tuo archivio/.test(c.title) && c.forms === 1, JSON.stringify({ lang: c.lang, title: c.title, forms: c.forms }));
    const f = await page.evaluate(() => ({ email: document.querySelector('label[for="email"]').textContent, pw: document.querySelector('label[for="password"]').textContent,
      forgot: document.getElementById('forgotBtn').textContent, submit: document.querySelector('#submitBtn .t').textContent, ph: document.getElementById('email').placeholder,
      caps: document.getElementById('capsHint').textContent, reveal: document.getElementById('revealBtn').textContent }));
    check(`login proprietario@${w}: etichette, «Password dimenticata?», «Accedi», «Mostra», maiuscole`, f.email === 'Indirizzo email' && f.pw === 'Password'
      && f.forgot === 'Password dimenticata?' && f.submit === 'Accedi' && f.ph === 'nome@esempio.it' && f.reveal === 'Mostra' && /Blocco maiuscole/.test(f.caps), JSON.stringify(f));
    check(`login proprietario@${w}: nessuno scorrimento orizzontale`, (await overflowX(page)) <= 0);
    const fr = await page.evaluate(() => { const a = document.querySelector('label[for="password"]').getBoundingClientRect(), b = document.getElementById('forgotBtn').getBoundingClientRect(); return { sameRow: Math.abs(a.top - b.top) < 8, apart: b.left - a.right }; });
    check(`login proprietario@${w}: «Password» e «Password dimenticata?» sulla stessa riga, senza toccarsi`, fr.sameRow && fr.apart > 12, JSON.stringify(fr));
    check(`login proprietario@${w}: nessun errore JS`, errors.length === 0, errors[0]);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `login-proprietario-${w}.png`), fullPage: true });
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await loginAt('/login?next=%2Fproprietario');
    await page.click('#forgotBtn');
    const m1 = await msg(page);
    check('login proprietario: «Password dimenticata?» senza email → la richiesta in italiano', m1.includes('Scrivi la tua email qui sopra') && m1.includes('«Password dimenticata?»'), m1);
    await page.fill('#email', 'anna@x.it');
    await page.click('#forgotBtn');
    await page.waitForFunction((r) => document.getElementById('message').textContent === r, RESET, { timeout: 4000 }).catch(() => {});
    const r = await page.evaluate(() => ({ calls: window.__reset, m: document.getElementById('message').textContent }));
    check('login proprietario: il reset torna a /proprietario, col messaggio unico in italiano', r.calls.length === 1 && r.calls[0].url === 'https://www.boomrome.com/proprietario' && r.m === RESET, JSON.stringify(r));
    await page.click('#revealBtn');
    const rv = await page.evaluate(() => ({ t: document.getElementById('revealBtn').textContent, a: document.getElementById('revealBtn').getAttribute('aria-label') }));
    check('login proprietario: «Nascondi» / «Nascondi la password»', rv.t === 'Nascondi' && rv.a === 'Nascondi la password', JSON.stringify(rv));
    await page.fill('#password', 'sbagliata');
    await page.evaluate(() => document.getElementById('message').classList.remove('show'));
    await page.click('#submitBtn');
    const m2 = await msg(page);
    check('login proprietario: password sbagliata → «Email o password non corrette. Riprova.»', m2 === 'Email o password non corrette. Riprova.', m2);
    check('login proprietario: nessun errore JS nelle interazioni', errors.length === 0, errors[0]);
    await ctx.close();
  }
  {
    const { ctx, page } = await loginAt('/login?next=%2Fproprietario', { mode: 'nofb' });
    const m = await msg(page);
    check('login proprietario: servizio di accesso irraggiungibile → avviso in italiano', m.includes('Non riesco a raggiungere il servizio di accesso'), m);
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await loginAt('/login?next=%2Fportal');
    const d = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.querySelector('.a-title').textContent, forgot: document.getElementById('forgotBtn').textContent,
      reveal: document.getElementById('revealBtn').textContent, label: document.querySelector('label[for="email"]').textContent, owner: document.body.classList.contains('owner') }));
    check('login altrove: la pagina di sempre (Sign in, Forgot?, Show, Email, lang en)', d.lang === 'en' && d.title === 'Sign in' && d.forgot === 'Forgot?' && d.reveal === 'Show' && d.label === 'Email' && !d.owner, JSON.stringify(d));
    await page.click('#forgotBtn');
    const m1 = await msg(page);
    check('login altrove: «Forgot?» senza email → il messaggio inglese di sempre', m1 === 'Enter your email above, then tap “Forgot?” again.', m1);
    await page.fill('#email', 'a@b.it'); await page.fill('#password', 'x');
    await page.evaluate(() => document.getElementById('message').classList.remove('show'));
    await page.click('#submitBtn');
    const m2 = await msg(page);
    check('login altrove: password sbagliata → «Incorrect email or password. Please try again.»', m2 === 'Incorrect email or password. Please try again.', m2);
    check('login altrove: nessun errore JS', errors.length === 0, errors[0]);
    await ctx.close();
  }
}

await browser.close();
console.log(`\nowner/ui: ${passed} passed, ${failed} failed`);
if (failed) { console.log('Falliti:\n  ' + bad.join('\n  ')); process.exit(1); }
