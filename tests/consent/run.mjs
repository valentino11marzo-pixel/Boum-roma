// tests/consent/run.mjs — suite `consentbanner`
// IL RIQUADRO DEI COOKIE NON SI METTE IN MEZZO — in un browser vero.
//
// Il reperto che l'ha fatta nascere: sul telefono, per OGNI visitatore
// nuovo (e quindi per tutto il traffico che arriva da una risposta AI), il
// riquadro del consenso compariva 700ms dopo il caricamento a 84px dal
// fondo, largo 348px — esattamente sopra il bottone dell'hero o il primo
// campo del modulo. La pagina chiedeva una scelta sui cookie prima ancora
// di lasciar vedere cosa offriva.
//
// Le regole (decisione del fondatore, 15/10/2026), su telefono senza una
// scelta salvata:
//  (a) 1,5s dopo il load, senza scorrere: il riquadro è nascosto, o non
//      copre il centro di nessun elemento interattivo visibile;
//  (b) dopo uno scorrimento del 30% della finestra è visibile e non si
//      sovrappone a nessuna barra fissa in fondo (barra di pagamento, HUD,
//      bottone WhatsApp) — e resta così anche al 70% della pagina e
//      tornando in cima (niente isteresi);
//  (c) Accetta fa partire 'boom-consent-granted' e salva la scelta; prima
//      della scelta non parte niente;
//  (d) 5,5s dopo il load, senza scorrere, è visibile — e i 5 secondi
//      contano dall'ARRIVO, non dal load: con gtag.js che tarda 4s il load,
//      5,6s dopo il DOMContentLoaded è già visibile;
//  e ruotato in orizzontale oltre gli 880px prima del momento resta
//  nascosto, e tornato in verticale dopo comparso resta visibile.
// Sul desktop (1440×900) tutto com'era: 700ms dopo il DOMContentLoaded, in
// basso a sinistra. Ma una finestra (o un tablet) che diventa larga da
// telefono DOPO il caricamento prende la regola compatta e deve salire
// sopra la barra in fondo come un telefono: aspettare e misurare sono due
// cose separate.
//
// Accetta accende SOLO la misura (Google Analytics + il cookie di
// attribuzione di BOOM): i segnali ad_* restano negati, e il riquadro dice
// in EN/IT/FR cosa accende. Una scelta scaduta toglie boom_attr.
//
// E il RIPENSAMENTO (GDPR art. 7(3), Garante 10/06/2021: ritirare il
// consenso dev'essere facile quanto darlo). Il riquadro non si riapriva da
// nessuna pagina e «Solo essenziali» lasciava boom_attr dove boom-track.js
// non è caricato. Ora: un link «Cookie preferences» nel piede accanto a
// «Privacy» (o in coda al piede che non ce l'ha), …#cookie-preferences che
// riapre, e il diniego — o l'assenza di consenso — che toglie boom_attr, i
// cookie _ga/_gid e i contatti salvati. E nessuna pagina NUOVA può
// chiamare gtag('config') senza un consent default «denied» prima.
//
// E le regole MORDONO: otto mutanti del vero js/boom-consent.js (il
// comportamento di prima, la misura della barra spenta, lo scorrimento
// sordo, il timer dei 5s spento, .zz rimesso dentro la media query del
// telefono, nessun ripensamento, il timer dal load, la misura solo per chi
// parte da telefono) devono far cadere ciascuno la sua regola. Una guardia che non
// cade mai sul difetto che deve fermare non è una guardia.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { loadChromium, launchOptions } from '../_browser.mjs';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const CONSENT = path.join(R, 'js/boom-consent.js');

let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const elenco = (r, max = 12) => '\n      ' + r.slice(0, max).join('\n      ')
  + (r.length > max ? `\n      … e altre ${r.length - max}` : '');

console.log('\n\x1b[1m▸ consentbanner\x1b[0m  il riquadro dei cookie: sul telefono dopo, '
  + 'compatto e sopra la barra in fondo; sul desktop com\'era');

// ── 0 · le giunzioni sulla sorgente (statiche, girano anche senza browser) ──
const src = fs.readFileSync(CONSENT, 'utf8');
const pacchetto = fs.readFileSync(path.join(R, 'pacchetto-concordato.html'), 'utf8');
const sw = fs.readFileSync(path.join(R, 'sw.js'), 'utf8');
{
  const guai = [];
  if (!src.includes("@media(max-width:879px){.boomcst{left:8px;right:8px;width:auto;bottom:calc(var(--boomcst-lift,0px) + 8px + env(safe-area-inset-bottom,0px))"))
    guai.push('la regola compatta del telefono con --boomcst-lift manca');
  if (!src.includes('.boomcst.zz{opacity:0!important;visibility:hidden;pointer-events:none}'))
    guai.push('la classe .zz che tiene nascosto il riquadro manca');
  if (/html\[data-consent=compact\]/.test(src)) guai.push('resta la variante data-consent="compact" (ora il telefono è sempre compatto)');
  if (/bottom:calc\(84px/.test(src)) guai.push('resta il vecchio bottom:84px a mano');
  if (!/boom-consent-granted/.test(src) || !/boom-consent-denied/.test(src)) guai.push('gli eventi del consenso sono cambiati');
  if (!/setTimeout\(open, 700\)/.test(src)) guai.push('il desktop non apre più a 700ms');
  guai.length ? male('sorgente di boom-consent.js:' + elenco(guai)) : bene('boom-consent.js: telefono compatto con lift e .zz, desktop a 700ms, eventi invariati');
}
{
  const guai = [];
  if (/data-consent/.test(pacchetto)) guai.push('pacchetto-concordato.html chiede ancora data-consent');
  if (/\.boomcst/.test(pacchetto)) guai.push('pacchetto-concordato.html sposta ancora il riquadro a mano (.boomcst)');
  const v = /^const CACHE_VERSION = 'boom-v(\d+)';$/m.exec(sw);
  if (!v || +v[1] < 35) guai.push(`sw.js: CACHE_VERSION ${v ? v[1] : '?'} < 35 — i visitatori di ritorno terrebbero il riquadro vecchio`);
  guai.length ? male('pagine e service worker:' + elenco(guai))
    : bene('il Pacchetto non sposta più il riquadro a mano, e il service worker è passato a boom-v35+');
}
{
  // GA4 senza consent default: _ga e _ga_<id> nascono al caricamento, prima
  // di qualunque scelta. Si guarda ogni HTML che Vercel pubblica (onorando
  // .vercelignore): in OGNI <script> che chiama gtag('config'), PRIMA e nello
  // stesso script, un gtag('consent','default') con analytics_storage:'denied'.
  // Il 15/10/2026 quattordici pagine vive non l'avevano (property-finding,
  // board e le dodici /apartments-in, generate da scripts/neighborhoods-
  // build.js): ora NOTI è vuoto, e ogni ricaduta fa cadere la regola.
  const NOTI = new Set();
  const ign = fs.readFileSync(path.join(R, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((p) => {
      const anchored = p.startsWith('/'), dir = p.endsWith('/'), q = p.replace(/^\//, '').replace(/\/$/, '');
      const body = q.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
      return new RegExp((anchored || q.includes('/') ? '^' : '(^|/)') + body + (dir ? '/' : '(/|$)'));
    });
  const pubblicato = (rel) => !ign.some((r) => r.test(rel));
  const html = [];
  (function giro(dir) {
    for (const d of fs.readdirSync(path.join(R, dir), { withFileTypes: true })) {
      const rel = dir ? dir + '/' + d.name : d.name;
      if (d.name === 'node_modules' || d.name === '.git' || !pubblicato(d.isDirectory() ? rel + '/' : rel)) continue;
      if (d.isDirectory()) giro(rel); else if (d.name.endsWith('.html')) html.push(rel);
    }
  })('');
  const CFG = /gtag\(\s*['"]config['"]/;
  const DEF = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]\s*,\s*\{[^}]*analytics_storage\s*:\s*['"]denied['"]/;
  // vero se la pagina chiama gtag('config') senza il default «denied» prima,
  // nello stesso script (o fuori da qualunque <script> inline)
  const manca = (h) => {
    if (!CFG.test(h)) return false;
    const corpi = [...h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((b) => CFG.test(b));
    if (!corpi.length) return true;
    return corpi.some((b) => { const d = b.search(DEF); return d < 0 || d > b.search(CFG); });
  };
  const senza = html.filter((rel) => manca(fs.readFileSync(path.join(R, rel), 'utf8')));
  const conConfig = html.filter((rel) => CFG.test(fs.readFileSync(path.join(R, rel), 'utf8'))).length;
  // la regola morde: il default tolto, spostato DOPO il config o in uno
  // script successivo, e un default che concede, sono tutti presi
  {
    const pf = fs.readFileSync(path.join(R, 'property-finding.html'), 'utf8');
    const d = (pf.match(/gtag\('consent','default',\{[^}]*\}\);/) || [])[0];
    const mut = d ? [
      ['tolto', pf.replace(d, '')],
      ['dopo il config', pf.replace(d, '').replace("gtag('config','G-EYCD59RDVJ');", "gtag('config','G-EYCD59RDVJ');" + d)],
      ['in uno script dopo', pf.replace(d, '').replace('</head>', '<script>' + d + '</script></head>')],
      ['che concede', pf.replace(d, d.replace("analytics_storage:'denied'", "analytics_storage:'granted'"))],
    ] : [];
    const sfuggiti = mut.filter(([, h]) => !manca(h)).map(([n]) => n);
    if (!d) male('consent default: property-finding.html non ha più il default — il mutante non si costruisce');
    else if (manca(pf)) male('consent default: property-finding.html risulta senza default (la regola sbaglia sul buono)');
    else sfuggiti.length ? male('consent default: la regola non prende i mutanti ' + sfuggiti.join(', '))
      : bene('consent default: la regola prende il default tolto, spostato dopo il config, in uno script dopo, o che concede');
  }
  const nuove = senza.filter((f) => !NOTI.has(f));
  const restano = senza.filter((f) => NOTI.has(f));
  if (html.length < 50) male(`consent default: solo ${html.length} pagine pubblicate trovate — il giro su .vercelignore è rotto`);
  else nuove.length ? male('gtag(\'config\') senza un consent default «denied» prima, nello stesso script (i cookie _ga nascono prima della scelta):' + elenco(nuove))
    : bene(`consent default: ${conConfig} pagine pubblicate su ${html.length} chiamano gtag('config'), tutte dopo il default «denied» nello stesso script`
      + (restano.length ? ` (note da sistemare nei loro template: ${restano.length} — boom-consent.js ne toglie i cookie)` : ''));
}
{
  const guai = [];
  const corpo = (nome) => { const m = new RegExp('function ' + nome + '\\(\\) \\{[\\s\\S]*?\\n  \\}').exec(src); return m ? m[0] : ''; };
  const deny = corpo('deny');
  if (!/dropCookies\(\)/.test(deny) || !/dropStored\(\)/.test(deny)) guai.push('deny() non toglie più cookie e contatti salvati');
  if (!/boom_attr/.test(src) || !/_ga/.test(src)) guai.push('la lista dei cookie non tecnici non nomina più boom_attr e _ga');
  if (!/'boom:source'/.test(corpo('dropStored'))) guai.push('dropStored() non toglie più boom:source');
  if (!/if \(el \|\| !document\.body \|\| state\(\)\) return;/.test(src)) guai.push('open() senza la guardia sul <body> e sulla scelta già fatta');
  if (!/#cookie-preferences/.test(src) || !/data-cookie-prefs/.test(src)) guai.push('il link «Cookie preferences» non c\'è più');
  guai.length ? male('boom-consent.js, il ripensamento:' + elenco(guai))
    : bene('boom-consent.js: «Solo essenziali» toglie boom_attr, _ga e i contatti; open() aspetta il <body>; c\'è il link per cambiare idea');
}
{
  // Accetta accende SOLO la misura, e il riquadro dice cosa: Google
  // Analytics e il cookie di attribuzione di BOOM. BOOM non fa pubblicità:
  // ad_storage / ad_user_data / ad_personalization restano «denied» anche
  // dopo il sì (prima grant() li concedeva tutti e il testo diceva «un
  // cookie di misurazione» mentre ne nascevano tre).
  const guai = [];
  const corpo = (nome) => { const m = new RegExp('function ' + nome + '\\(\\) \\{[\\s\\S]*?\\n  \\}').exec(src); return m ? m[0] : ''; };
  const grant = corpo('grant');
  if (!/analytics_storage:\s*'granted'/.test(grant)) guai.push('grant() non concede più analytics_storage');
  const adGranted = grant.match(/ad_[a-z_]+:\s*'granted'/g);
  if (adGranted) guai.push('grant() concede segnali pubblicitari: ' + adGranted.join(', '));
  for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization'])
    if (!new RegExp(k + ":\\s*'denied'").test(grant)) guai.push(`grant() non dice «denied» per ${k} (una pagina senza default lo darebbe per concesso)`);
  // le tre lingue del riquadro: dice cosa accende, non «un cookie»
  const testi = [...src.matchAll(/\bp: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  if (testi.length !== 3) guai.push(`testi del riquadro trovati: ${testi.length} invece di 3 (EN/IT/FR)`);
  for (const t of testi) {
    if (!/Google Analytics/.test(t)) guai.push(`il riquadro non nomina Google Analytics: «${t.slice(0, 60)}…»`);
    if (!/attribution|attribuzione/i.test(t)) guai.push(`il riquadro non nomina il cookie di attribuzione: «${t.slice(0, 60)}…»`);
    if (/One analytics cookie|Un cookie di misurazione|Un cookie de mesure/i.test(t)) guai.push(`il riquadro promette ancora UN cookie: «${t.slice(0, 60)}…»`);
    if (t.replace(/<[^>]+>/g, '').length > 170) guai.push(`il riquadro è lungo ${t.replace(/<[^>]+>/g, '').length} caratteri (≤170): «${t.slice(0, 40)}…»`);
  }
  // una scelta negata o scaduta toglie boom_attr per nome
  if (!/function dropAttr\(\) \{ try \{ document\.cookie = 'boom_attr=; Max-Age=0; Path=\/'; \} catch \(e\) \{\} \}/.test(src))
    guai.push('dropAttr() non toglie più boom_attr per nome');
  if (!/dropAttr\(\)/.test(corpo('deny'))) guai.push('deny() non chiama dropAttr()');
  if (!/> YEAR\) \{ localStorage\.removeItem\(KEY\); dropAttr\(\); return null; \}/.test(src)) guai.push('una scelta scaduta non toglie boom_attr');
  // i 5 secondi dall'arrivo, non dal load; aspettare ≠ misurare
  if (/addEventListener\('load', onLoad\)/.test(src) || /function onLoad\(/.test(src)) guai.push('il timer dei 5s riparte dal load');
  if (!/if \(delayed && !due && !wait5\) wait5 = setTimeout\(show, 5000\);/.test(corpo('arm'))) guai.push('arm() non fa partire i 5s');
  if (!/if \(!onPhone\(\)\) \{ el\.style\.removeProperty\('--boomcst-lift'\); return; \}/.test(corpo('lift'))) guai.push('lift() misura anche fuori dal telefono');
  guai.length ? male('boom-consent.js, cosa accende Accetta:' + elenco(guai))
    : bene('boom-consent.js: Accetta concede solo analytics_storage (ad_* «denied»), il riquadro EN/IT/FR nomina Google Analytics e il cookie di attribuzione; diniego e scadenza tolgono boom_attr; i 5s partono dall\'arrivo');
}

const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright non disponibile — le regole in browser non girano');
  console.log(ko ? `  \x1b[31m${ko} guasti\x1b[0m` : '  \x1b[32mstatico verde\x1b[0m');
  process.exit(ko ? 1 : 0);
}

// ── il server statico: cleanUrls come su Vercel (/owners → owners.html) ──
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };
const srv = http.createServer((rq, rs) => {
  let u;
  try { u = decodeURIComponent(rq.url.split('?')[0].split('#')[0]); } catch { u = '/'; }
  if (u === '/') u = '/index.html';
  let f = path.join(R, u);
  if (!f.startsWith(R)) { rs.statusCode = 403; return rs.end(); }
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  fs.readFile(f, (e, d) => {
    if (e) { rs.statusCode = 404; return rs.end(); }
    rs.setHeader('content-type', TIPI[path.extname(f).toLowerCase()] || 'application/octet-stream');
    rs.end(d);
  });
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const br = await chromium.launch(launchOptions());

const PAGINE = ['/', '/owners', '/executive', '/virtual-viewing', '/deal-assistance',
  '/property-finding', '/moving-to-rome', '/apartments', '/faq', '/canone', '/pacchetto-concordato'];
const TELEFONI = [[390, 844], [390, 664]];

// Una pagina nuova = un contesto nuovo: localStorage vuoto, nessuna scelta.
// Tutto ciò che non è locale si blocca: il test non dipende dalla rete.
async function apri(url, w, h, { mobile = true, consenso = null, sorgente = null } = {}) {
  const pg = await br.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (!u.startsWith(BASE)) return r.abort();
    if (sorgente && new URL(u).pathname === '/js/boom-consent.js')
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: sorgente });
    return r.continue();
  });
  await pg.addInitScript((c) => {
    window.__ev = [];
    document.addEventListener('boom-consent-granted', () => window.__ev.push('granted'));
    document.addEventListener('boom-consent-denied', () => window.__ev.push('denied'));
    window.addEventListener('DOMContentLoaded', () => { window.__dcl = performance.now(); });
    const t = setInterval(() => {
      if (document.querySelector('.boomcst')) { window.__nato = performance.now(); clearInterval(t); }
    }, 10);
    if (c) { try { localStorage.setItem('boom:consent', c + ':' + Date.now()); } catch (e) {} }
  }, consenso);
  await pg.goto(BASE + url, { waitUntil: 'load' });
  return pg;
}

// Tutte le misure si leggono nella pagina, in un colpo.
const MISURA = () => {
  const H = innerHeight, W = innerWidth;
  const el = document.querySelector('.boomcst');
  const vis = (e) => !e.checkVisibility || e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const base = {
    ev: (window.__ev || []).slice(),
    salvato: (() => { try { return localStorage.getItem('boom:consent'); } catch (e) { return null; } })(),
    nato: window.__nato, dcl: window.__dcl, H, W
  };
  if (!el) return { ...base, esiste: false, coperti: [], barre: [] };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const nascosto = el.classList.contains('zz') || cs.visibility === 'hidden' || cs.display === 'none';
  // (a) i comandi visibili il cui CENTRO cade sotto il riquadro
  const coperti = [];
  if (!nascosto) {
    for (const c of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]')) {
      if (el.contains(c) || !vis(c)) continue;
      const q = c.getBoundingClientRect();
      if (!q.width || !q.height) continue;
      const x = q.left + q.width / 2, y = q.top + q.height / 2;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        coperti.push(`${c.tagName.toLowerCase()} «${(c.innerText || c.value || c.getAttribute('aria-label') || c.name || '').trim().replace(/\s+/g, ' ').slice(0, 40)}»`);
      }
    }
  }
  // (b) le barre fisse in fondo: position:fixed, visibili, nella metà bassa,
  // a meno di 40px dal bordo (comprende i bottoni d'angolo), non uno sfondo
  // a tutto schermo. Sovrapporsi = un'intersezione di più di 1px per lato.
  const barre = [];
  for (const b of document.querySelectorAll('body *')) {
    if (b === el || el.contains(b)) continue;
    const bs = getComputedStyle(b);
    if (bs.position !== 'fixed' || !vis(b)) continue;
    const q = b.getBoundingClientRect();
    if (!q.width || !q.height || q.top >= H || q.bottom < H - 40 || q.top <= H * 0.4) continue;
    const ix = Math.min(r.right, q.right) - Math.max(r.left, q.left);
    const iy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
    if (ix > 1 && iy > 1) barre.push(`${b.tagName.toLowerCase()}${b.id ? '#' + b.id : ''}.${String(b.className).split(' ')[0]} (top ${Math.round(q.top)}, riquadro ${Math.round(r.top)}–${Math.round(r.bottom)})`);
  }
  return {
    esiste: true, nascosto, zz: el.classList.contains('zz'), op: +cs.opacity,
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width),
    dentro: r.top >= 0 && r.bottom <= H + 0.5 && r.left >= 0 && r.right <= W + 0.5,
    eyebrow: (() => { const e = el.querySelector('.e'); return e ? getComputedStyle(e).display : null; })(),
    lift: el.style.getPropertyValue('--boomcst-lift'),
    coperti, barre, ...base
  };
};
const visibile = (m) => m.esiste && !m.nascosto && m.op > 0.5 && m.dentro;
const scorri = (pg, y) => pg.evaluate((y) => window.scrollTo(0, y), y);
// Le barre entrano con una transizione (l'HUD dei servizi: .5s) e il
// riquadro si rimisura alla sua fine (transitionend). La regola vale sullo
// stato ASSESTATO: si guarda fino a 2,5s, e se non si assesta mai è un
// guasto vero — un riquadro che si rinasconde o resta sulla barra.
async function assesta(pg, attesa) {
  await pg.waitForTimeout(attesa);
  let m = await pg.evaluate(MISURA);
  for (let t = 0; t < 2500 && !(visibile(m) && !m.barre.length); t += 150) {
    await pg.waitForTimeout(150);
    m = await pg.evaluate(MISURA);
  }
  return m;
}

// Poche pagine alla volta: il tempo conta, ma non deve sporcare le misure.
async function aGruppi(lavori, n = 4) {
  const out = [];
  for (let i = 0; i < lavori.length; i += n) out.push(...await Promise.all(lavori.slice(i, i + n).map((f) => f())));
  return out;
}

// ── sessione 1: (a) primo sguardo, (b) scorrimento, (c) la scelta ──────
async function giro(url, w, h, sorgente = null) {
  const dove = `${url} @${w}×${h}`;
  const esito = { dove, a: [], b: [], c: [] };
  const pg = await apri(url, w, h, { sorgente });
  try {
    await pg.waitForTimeout(1500);
    const m0 = await pg.evaluate(MISURA);
    if (m0.esiste && !m0.nascosto && m0.coperti.length) esito.a.push(`${dove} → copre ${m0.coperti.slice(0, 3).join(', ')}`);
    if (m0.ev.length) esito.c.push(`${dove} → un evento di consenso PRIMA della scelta: ${m0.ev.join(',')}`);

    // (b) 30% della finestra: compare, e non su una barra
    // È lo SCORRIMENTO a farlo comparire, non i 5s: si guarda subito.
    await scorri(pg, Math.round(h * 0.3));
    await pg.waitForTimeout(600);
    const m1a = await pg.evaluate(MISURA);
    if (!m1a.esiste || m1a.nascosto) esito.b.push(`${dove} → 600ms dopo uno scorrimento del 30% della finestra è ancora nascosto`);
    const m1 = await assesta(pg, 0);
    if (!visibile(m1)) esito.b.push(`${dove} → dopo il 30% della finestra non è visibile (${m1.esiste ? `zz=${m1.zz} opacità ${m1.op}` : 'non esiste'})`);
    if (m1.barre.length) esito.b.push(`${dove} @30% → sopra ${m1.barre.join('; ')}`);

    // al 70% della pagina (le barre di pagamento entrano qui) e di nuovo in cima
    await pg.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.7)));
    const m2 = await assesta(pg, 600);
    if (!visibile(m2)) esito.b.push(`${dove} @70% pagina → non è più visibile`);
    if (m2.barre.length) esito.b.push(`${dove} @70% pagina → sopra ${m2.barre.join('; ')}`);
    await scorri(pg, 0);
    const m3 = await assesta(pg, 400);
    if (!visibile(m3)) esito.b.push(`${dove} → tornando in cima si è nascosto di nuovo (isteresi)`);
    if (m3.barre.length) esito.b.push(`${dove} in cima → sopra ${m3.barre.join('; ')}`);

    // (c) la scelta: Accetta
    if (visibile(m3)) {
      await pg.click('.boomcst .ok', { timeout: 3000 });
      await pg.waitForTimeout(700);
      const m4 = await pg.evaluate(MISURA);
      if (m4.esiste) esito.c.push(`${dove} → il riquadro resta dopo Accetta`);
      if (m4.ev.join(',') !== 'granted') esito.c.push(`${dove} → eventi dopo Accetta: [${m4.ev.join(',')}] invece di [granted]`);
      if (!/^all:\d+$/.test(m4.salvato || '')) esito.c.push(`${dove} → scelta non salvata (${m4.salvato})`);
      // dopo la scelta nessuno ascolta più: scorrere non lo fa rinascere
      await scorri(pg, Math.round(h * 0.6));
      await pg.waitForTimeout(400);
      const m5 = await pg.evaluate(MISURA);
      if (m5.esiste) esito.c.push(`${dove} → dopo la scelta lo scorrimento lo fa ricomparire`);
    } else {
      esito.c.push(`${dove} → Accetta non raggiungibile: il riquadro non è mai comparso`);
    }
  } catch (e) {
    esito.c.push(`${dove} → ${String(e.message || e).split('\n')[0]}`);
  } finally { await pg.close(); }
  return esito;
}

// ── sessione 2: (d) senza scorrere, 5,5s dopo il load ──────────────────
async function attesa(url, w, h, sorgente = null) {
  const dove = `${url} @${w}×${h}`;
  const pg = await apri(url, w, h, { sorgente });
  try {
    await pg.waitForTimeout(5500);
    const m = await pg.evaluate(MISURA);
    const guai = [];
    if (!m.esiste || m.nascosto) guai.push(`${dove} → dopo 5,5s senza scorrere è ancora nascosto`);
    else if (m.barre.length) guai.push(`${dove} → dopo 5,5s sta sopra ${m.barre.join('; ')}`);
    else if (!m.dentro) guai.push(`${dove} → dopo 5,5s è fuori dalla finestra (top ${m.top})`);
    return guai;
  } finally { await pg.close(); }
}

const lavoriGiro = [], lavoriAttesa = [];
for (const [w, h] of TELEFONI) for (const u of PAGINE) {
  lavoriGiro.push(() => giro(u, w, h));
  lavoriAttesa.push(() => attesa(u, w, h));
}
const giri = await aGruppi(lavoriGiro);
const n = giri.length;
const A = giri.flatMap((g) => g.a), B = giri.flatMap((g) => g.b), C = giri.flatMap((g) => g.c);
A.length ? male(`(a) al primo sguardo il riquadro copre un comando:` + elenco(A))
  : bene(`(a) ${n} pagine×telefono: 1,5s dopo il load, senza scorrere, il riquadro non copre nessun comando`);
B.length ? male(`(b) dopo lo scorrimento:` + elenco(B))
  : bene(`(b) ${n} pagine×telefono: dopo il 30% della finestra compare, e né lì né al 70% né in cima sta sopra una barra fissa`);
C.length ? male(`(c) la scelta:` + elenco(C))
  : bene(`(c) ${n} pagine×telefono: nessun evento prima della scelta, Accetta → boom-consent-granted + scelta salvata, poi silenzio`);
const D = (await aGruppi(lavoriAttesa, 6)).flat();
D.length ? male(`(d) senza scorrere:` + elenco(D))
  : bene(`(d) ${lavoriAttesa.length} pagine×telefono: 5,5s dopo il load, senza scorrere, è visibile e libero dalle barre`);

// ── la scelta opposta e la scelta già fatta ───────────────────────────
{
  const guai = [];
  const pg = await apri('/', 390, 844);
  await scorri(pg, 300); await pg.waitForTimeout(900);
  await pg.click('.boomcst .no', { timeout: 3000 }).catch((e) => guai.push('Solo essenziali non cliccabile: ' + e.message.split('\n')[0]));
  await pg.waitForTimeout(700);
  const m = await pg.evaluate(MISURA);
  if (m.ev.join(',') !== 'denied') guai.push(`eventi dopo «Essential only»: [${m.ev.join(',')}]`);
  if (!/^min:\d+$/.test(m.salvato || '')) guai.push(`scelta non salvata come min (${m.salvato})`);
  if (m.esiste) guai.push('il riquadro resta dopo la scelta');
  await pg.close();

  const pg2 = await apri('/owners', 390, 844, { consenso: 'all' });
  await scorri(pg2, 400); await pg2.waitForTimeout(5500);
  const m2 = await pg2.evaluate(MISURA);
  if (m2.esiste) guai.push('con la scelta già salvata il riquadro ricompare');
  if (m2.ev.join(',') !== 'granted') guai.push(`la scelta salvata non riapre il consenso: [${m2.ev.join(',')}]`);
  await pg2.close();
  guai.length ? male('la scelta opposta / già fatta:' + elenco(guai))
    : bene('«Essential only» → boom-consent-denied + min salvato; con una scelta salvata niente riquadro, consenso ripristinato subito');
}

// ── il telefono ruotato: nascosto resta nascosto, comparso resta comparso ──
// Un telefono si arma una volta, al load, sotto gli 880px. Ruotato in
// orizzontale oltre la soglia (un Pro Max: 932×430) PRIMA del momento, il
// riquadro non deve comparire da solo col layout desktop su una finestra
// alta 430px; e dopo comparso, tornando in verticale, non deve rinascondersi
// (decisione #4: una volta mostrato resta fino alla scelta). Si legge lo
// stile CALCOLATO, non la classe: il difetto era proprio .zz presente e il
// riquadro visibile lo stesso.
const STILE = () => {
  const el = document.querySelector('.boomcst');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { zz: el.classList.contains('zz'), vis: cs.visibility, op: +cs.opacity, W: innerWidth, H: innerHeight };
};
const celato = (s) => s && (s.vis === 'hidden' || s.op < 0.05);
async function ruota(sorgente = null) {
  const guai = [];
  const pg = await apri('/', 390, 844, { sorgente });
  try {
    await pg.waitForTimeout(1200);
    const s0 = await pg.evaluate(STILE);
    if (!s0) guai.push('1,2s dopo il load il riquadro non è ancora nato');
    else if (!celato(s0)) guai.push(`già in verticale, 1,2s dopo il load, è visibile (zz=${s0.zz}, ${s0.vis}, opacità ${s0.op})`);
    await pg.setViewportSize({ width: 932, height: 430 });
    await pg.waitForTimeout(500);
    const s1 = await pg.evaluate(STILE);
    if (!s1 || s1.W !== 932) guai.push(`la rotazione non è avvenuta (innerWidth ${s1 && s1.W})`);
    else if (!celato(s1)) guai.push(`ruotato a 932×430 prima del momento compare da solo (zz=${s1.zz}, visibility ${s1.vis}, opacità ${s1.op})`);
    // in orizzontale è lo scorrimento a farlo comparire, come in verticale
    await scorri(pg, Math.round(430 * 0.3));
    await pg.waitForTimeout(600);
    const m2 = await pg.evaluate(MISURA);
    if (!visibile(m2)) guai.push(`in orizzontale, dopo il 30% della finestra, non compare (${m2.esiste ? `zz=${m2.zz} opacità ${m2.op}` : 'non esiste'})`);
    // e tornando in verticale resta: niente rinascondersi
    await pg.setViewportSize({ width: 390, height: 844 });
    const m3 = await assesta(pg, 500);
    if (!visibile(m3)) guai.push(`tornato in verticale si è nascosto di nuovo (${m3.esiste ? `zz=${m3.zz} opacità ${m3.op}` : 'non esiste'})`);
    else if (m3.barre.length) guai.push(`tornato in verticale sta sopra ${m3.barre.join('; ')}`);
  } catch (e) {
    guai.push(String(e.message || e).split('\n')[0]);
  } finally { await pg.close(); }
  return guai;
}
{
  const guai = await ruota();
  guai.length ? male('telefono ruotato (/ 390×844 → 932×430 → 390×844):' + elenco(guai))
    : bene('telefono ruotato a 932×430 prima del momento: resta nascosto; lo scorrimento lo fa comparire; tornato in verticale resta visibile');
}

// ── il desktop: com'era ──────────────────────────────────────────────
{
  const guai = [];
  const pg = await apri('/', 1440, 900, { mobile: false });
  await pg.waitForTimeout(1500);
  const m = await pg.evaluate(MISURA);
  const dt = m.nato - m.dcl;
  if (!m.esiste) guai.push('a 1440×900 il riquadro non compare');
  else {
    if (!(dt >= 650 && dt <= 1300)) guai.push(`compare ${Math.round(dt)}ms dopo il DOMContentLoaded invece di ~700ms`);
    if (m.nascosto || m.zz) guai.push('sul desktop nasce nascosto (.zz)');
    if (m.left !== 16 || m.bottom !== 900 - 16) guai.push(`posizione cambiata: left ${m.left}, bottom ${900 - m.bottom} invece di 16/16`);
    if (m.width !== 348) guai.push(`larghezza cambiata: ${m.width} invece di 348`);
    if (m.eyebrow === 'none') guai.push('sul desktop sparisce l\'occhiello «Privacy»');
    if (m.lift) guai.push(`sul desktop qualcuno misura la barra (--boomcst-lift=${m.lift})`);
    if (m.ev.length) guai.push('un evento di consenso senza scelta');
  }
  await pg.close();
  guai.length ? male('desktop 1440×900:' + elenco(guai))
    : bene(`desktop 1440×900: compare ${Math.round(dt)}ms dopo il DOMContentLoaded, in basso a sinistra (16/16, 348px), com'era`);
}

// ── la finestra che diventa stretta DOPO il caricamento ──────────────────
// Un tablet ruotato, una finestra rimpicciolita: il riquadro è già nato col
// layout desktop (700ms), poi la regola compatta del telefono lo porta in
// fondo a 8px. Prima la misura della barra girava solo per chi era partito
// da telefono, e lì il riquadro (z-index 140) copriva il bottone della barra
// di pagamento del Pacchetto e il WhatsApp di /faq.
async function stringi(url, sorgente = null) {
  const dove = `${url} 1024×768 → 768×1024`;
  const guai = [];
  const pg = await apri(url, 1024, 768, { mobile: false, sorgente });
  try {
    await pg.waitForTimeout(1200);
    const m0 = await pg.evaluate(MISURA);
    if (!visibile(m0)) guai.push(`${dove} → sul desktop, 1,2s dopo il load, il riquadro non c'è`);
    await pg.setViewportSize({ width: 768, height: 1024 });
    await pg.waitForTimeout(300);
    await pg.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.7)));
    const m1 = await assesta(pg, 700);
    if (!visibile(m1)) guai.push(`${dove} → dopo il restringimento non è visibile`);
    else if (m1.barre.length) guai.push(`${dove} → sta sopra ${m1.barre.join('; ')} (lift «${m1.lift || ''}»)`);
  } catch (e) {
    guai.push(`${dove} → ${String(e.message || e).split('\n')[0]}`);
  } finally { await pg.close(); }
  return guai;
}
{
  const guai = (await Promise.all(['/pacchetto-concordato', '/faq'].map((u) => stringi(u)))).flat();
  guai.length ? male('finestra ristretta dopo il caricamento:' + elenco(guai))
    : bene('finestra 1024×768 ristretta a 768×1024 dopo il caricamento: il riquadro sale sopra la barra di pagamento del Pacchetto e il WhatsApp di /faq');
}

// ── i 5 secondi dall'ARRIVO, non dal load ─────────────────────────────────
// Su una rete vera gtag.js (async), i font e le immagini spostano il load di
// secondi: contati dal load, i «5 secondi» decisi dal fondatore diventavano
// 9–10. Qui gtag.js risponde dopo 4s, e il load con lui: 5,6s dopo il
// DOMContentLoaded, senza scorrere, il riquadro deve essere già visibile.
async function arrivo(sorgente = null) {
  const guai = [];
  const pg = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  try {
    await pg.route('**/*', (r) => {
      const u = r.request().url();
      if (/googletagmanager\.com\/gtag\/js/.test(u))
        return new Promise((ok) => setTimeout(ok, 4000)).then(() => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' })).catch(() => {});
      if (!u.startsWith(BASE)) return r.abort();
      if (sorgente && new URL(u).pathname === '/js/boom-consent.js')
        return r.fulfill({ status: 200, contentType: 'text/javascript', body: sorgente });
      return r.continue();
    });
    await pg.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => { window.__dcl = performance.now(); });
      window.addEventListener('load', () => { window.__load = performance.now(); });
    });
    await pg.goto(BASE + '/owners', { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.__dcl && performance.now() - window.__dcl >= 5600, null, { timeout: 20000, polling: 100 });
    const m = await pg.evaluate(() => {
      const el = document.querySelector('.boomcst'), cs = el && getComputedStyle(el);
      return { esiste: !!el, zz: !!el && el.classList.contains('zz'), vis: cs ? cs.visibility : null,
        dcl: window.__dcl, load: window.__load == null ? null : window.__load };
    });
    if (m.load != null && m.load - m.dcl < 3000) guai.push(`lo scenario non regge: il load è arrivato ${Math.round(m.load - m.dcl)}ms dopo il DOMContentLoaded (servono ≥3s)`);
    else if (!m.esiste || m.zz || m.vis === 'hidden')
      guai.push(`/owners @390×844, load spostato di 4s: 5,6s dopo il DOMContentLoaded il riquadro è ancora nascosto (${m.esiste ? `zz=${m.zz}` : 'non esiste'})`);
  } catch (e) {
    guai.push('/owners → ' + String(e.message || e).split('\n')[0]);
  } finally { await pg.close(); }
  return guai;
}
{
  const guai = await arrivo();
  guai.length ? male('i 5 secondi dall\'arrivo:' + elenco(guai))
    : bene('i 5 secondi contano dall\'arrivo: con gtag.js che sposta il load di 4s, a 5,6s dal DOMContentLoaded il riquadro è già visibile');
}

// ── il ripensamento: il link nel piede, il diniego che pulisce davvero ────
// Su pagine con piedi diversi (colonne, liste, « · », piede senza «Privacy»,
// interruttore di lingua) e su /pre-arrival, che NON carica boom-track.js.
const RIPENSA = [['/', 'Cookie preferences'], ['/faq', 'Cookie preferences'], ['/owners', 'Preferenze cookie'],
  ['/reunion', 'Préférences cookies'], ['/blog-47-steps', 'Cookie preferences'], ['/privacy', 'Cookie preferences'],
  ['/pre-arrival', 'Cookie preferences']];
async function apriCon(url, { consenso = null, cookie = [], sorgente = null, w = 1280, h = 900, mobile = false, init = null } = {}) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
  if (cookie.length) await ctx.addCookies(cookie.map(([name, value]) => ({ name, value, url: BASE })));
  const pg = await ctx.newPage();
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (!u.startsWith(BASE)) return r.abort();
    if (sorgente && new URL(u).pathname === '/js/boom-consent.js')
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: sorgente });
    return r.continue();
  });
  await pg.addInitScript(([c, extra]) => {
    if (c && !sessionStorage.getItem('__c')) { sessionStorage.setItem('__c', '1'); localStorage.setItem('boom:consent', c + ':' + Date.now()); }
    if (extra && !sessionStorage.getItem('__x')) { sessionStorage.setItem('__x', '1'); for (const k in extra) localStorage.setItem(k, extra[k]); }
  }, [consenso, init]);
  await pg.goto(BASE + url, { waitUntil: 'load' });
  await pg.waitForTimeout(300);
  return { ctx, pg };
}
const nomi = async (ctx) => (await ctx.cookies()).map((c) => c.name).sort();
async function ripensa(sorgente = null) {
  const guai = [];
  for (const [u, testo] of RIPENSA) {
    const { ctx, pg } = await apriCon(u, { consenso: 'all', sorgente });
    try {
      const l = await pg.evaluate(() => [...document.querySelectorAll('[data-cookie-prefs]')].map((a) => ({
        testo: a.innerText.trim(), piede: !!a.closest('footer'),
        vis: a.checkVisibility ? a.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true })));
      if (l.length !== 1) { guai.push(`${u} → ${l.length} link «Cookie preferences» invece di 1`); continue; }
      if (!l[0].piede || !l[0].vis) guai.push(`${u} → il link non è visibile nel piede`);
      if (l[0].testo.toLowerCase() !== testo.toLowerCase()) guai.push(`${u} → «${l[0].testo}» invece di «${testo}»`);
      await pg.click('[data-cookie-prefs]', { timeout: 3000 });
      await pg.waitForTimeout(250);
      const m = await pg.evaluate(() => ({ plate: !!document.querySelector('.boomcst'), hash: location.hash }));
      if (!m.plate) guai.push(`${u} → il link non riapre il riquadro`);
      if (m.hash) guai.push(`${u} → il link cambia l'indirizzo (${m.hash})`);
    } catch (e) { guai.push(`${u} → ${String(e.message || e).split('\n')[0]}`); }
    finally { await ctx.close(); }
  }
  // «Solo essenziali» da una pagina SENZA boom-track.js: via tutto
  {
    const { ctx, pg } = await apriCon('/pre-arrival', { consenso: 'all', sorgente,
      cookie: [['boom_attr', encodeURIComponent('ai:chatgpt · /faq')], ['_ga', 'GA1.1.1.1'], ['_ga_EYCD59RDVJ', 'GS1.1'], ['_gid', 'GA1.2.3']],
      init: { 'boom:source': '{"channel":"ai_assistant","engine":"chatgpt","landing":"/faq","at":1}', 'boom:last': '{"channel":"google"}' } });
    try {
      const prima = await nomi(ctx);
      if (prima.join() !== '_ga,_ga_EYCD59RDVJ,_gid,boom_attr') guai.push(`/pre-arrival con consenso: cookie ${prima.join()} (si aspettavano tutti e quattro)`);
      // riaperto dall'API, non dal link: la pulizia si misura da sola
      await pg.evaluate(() => window.boomConsent.open());
      await pg.click('.boomcst .no', { timeout: 3000 });
      await pg.waitForTimeout(300);
      const dopo = await nomi(ctx);
      if (dopo.length) guai.push(`/pre-arrival, «Essential only»: restano ${dopo.join(', ')}`);
      const ls = await pg.evaluate(() => [localStorage.getItem('boom:source'), localStorage.getItem('boom:last'), localStorage.getItem('boom:consent')]);
      if (ls[0] || ls[1]) guai.push('/pre-arrival, «Essential only»: restano i contatti salvati (boom:source/boom:last)');
      if (!/^min:\d+$/.test(ls[2] || '')) guai.push(`/pre-arrival: la scelta non è salvata come min (${ls[2]})`);
    } catch (e) { guai.push('/pre-arrival → ' + String(e.message || e).split('\n')[0]); }
    finally { await ctx.close(); }
  }
  // senza scelta, i cookie GA già scritti (una pagina senza default) se ne vanno
  {
    const { ctx } = await apriCon('/property-finding', { sorgente, cookie: [['_ga', 'GA1.1.1.1'], ['_ga_EYCD59RDVJ', 'GS1.1']] });
    const n = await nomi(ctx);
    if (n.length) guai.push(`/property-finding senza scelta: dopo il load restano ${n.join(', ')}`);
    await ctx.close();
    const { ctx: c2 } = await apriCon('/property-finding', { consenso: 'all', sorgente, cookie: [['_ga', 'GA1.1.1.1']] });
    if (!(await nomi(c2)).includes('_ga')) guai.push('/property-finding CON consenso: il cookie _ga è stato tolto');
    await c2.close();
  }
  // …#cookie-preferences nell'indirizzo riapre il riquadro anche a chi ha scelto
  {
    const { ctx, pg } = await apriCon('/faq#cookie-preferences', { consenso: 'all', sorgente });
    if (!(await pg.evaluate(() => !!document.querySelector('.boomcst')))) guai.push('/faq#cookie-preferences non riapre il riquadro');
    await ctx.close();
  }
  return guai;
}
// ── una scelta scaduta non lascia il cookie che autorizzava ──────────────
// 'all' di 366 giorni fa su /pre-arrival (consenso senza boom-track.js):
// la scelta se ne va, e con lei boom_attr — prima della nuova domanda.
{
  const guai = [];
  const { ctx, pg } = await apriCon('/pre-arrival', { cookie: [['boom_attr', encodeURIComponent('ai:chatgpt · /faq')]],
    init: { 'boom:consent': 'all:' + (Date.now() - 366 * 864e5) } });
  try {
    const n = await nomi(ctx);
    if (n.includes('boom_attr')) guai.push('consenso scaduto: boom_attr resta dopo il load');
    const c = await pg.evaluate(() => localStorage.getItem('boom:consent'));
    if (c) guai.push(`consenso scaduto: la scelta resta salvata (${c})`);
    await pg.waitForTimeout(900);   // il riquadro nasce 700ms dopo il DOMContentLoaded
    if (!(await pg.evaluate(() => !!document.querySelector('.boomcst')))) guai.push('consenso scaduto: il riquadro non richiede la scelta');
  } catch (e) { guai.push('/pre-arrival → ' + String(e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
  guai.length ? male('scelta scaduta:' + elenco(guai))
    : bene('una scelta di 366 giorni fa scade: boom_attr se ne va, la scelta si richiede');
}
{
  const guai = await ripensa();
  guai.length ? male('il ripensamento:' + elenco(guai))
    : bene(`il ripensamento: ${RIPENSA.length} piedi con UN link «Cookie preferences» nella lingua della pagina che riapre il riquadro; `
      + '«Essential only» su /pre-arrival toglie boom_attr, _ga, _gid e i contatti; senza scelta i _ga già scritti spariscono, col consenso restano; #cookie-preferences riapre');
}

// ── le regole mordono: cinque mutanti del sorgente vero ───────────────────
function muta(trova, metti) {
  const out = [];
  let s = src;
  for (let i = 0; i < trova.length; i++) {
    if (s.split(trova[i]).length !== 2) return null;   // il mutante non si costruisce: lo si dice
    s = s.replace(trova[i], metti[i]);
  }
  out.push(s);
  return out[0];
}
{
  // M1 — com'era prima: nessuna attesa sul telefono, riquadro a 84px dal fondo
  const m1 = muta(
    ["    delayed = onPhone();\n    arm();\n    (document.readyState",
     "'@media(max-width:879px){.boomcst{left:8px;right:8px;width:auto;bottom:calc(var(--boomcst-lift,0px) + 8px + env(safe-area-inset-bottom,0px));padding:10px 12px;border-radius:14px}'"],
    ["    (document.readyState",
     "'@media(max-width:879px){.boomcst{left:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px))}'"]);
  if (!m1) male('mutante «com\'era prima»: il sorgente è cambiato, il mutante non si costruisce più');
  else {
    const g = await aGruppi(PAGINE.map((u) => () => giro(u, 390, 844, m1)));
    const presi = g.filter((x) => x.a.length).map((x) => x.dove);
    presi.length ? bene(`mutante «com'era prima» preso dalla regola (a) su ${presi.length} pagine a 390×844 (es. ${presi.slice(0, 3).join(', ')})`)
      : male('mutante «com\'era prima»: la regola (a) non lo prende — non morde');
  }

  // M2 — la misura della barra spenta
  const m2 = muta(['best = Math.max(best, H - r.top);'], ['best = Math.max(best, 0);']);
  if (!m2) male('mutante «lift spento»: il sorgente è cambiato, il mutante non si costruisce più');
  else {
    const g = await aGruppi(['/faq', '/owners', '/pacchetto-concordato', '/virtual-viewing'].map((u) => () => giro(u, 390, 844, m2)));
    const presi = g.filter((x) => x.b.some((t) => /sopra/.test(t))).map((x) => x.dove);
    presi.length ? bene(`mutante «lift spento» preso dalla regola (b) su ${presi.join(', ')}`)
      : male('mutante «lift spento»: la regola (b) non lo prende — non morde');
  }

  // M4 — lo scorrimento non lo fa comparire (resterebbero solo i 5s)
  const m4 = muta(['if (!due && scrolledEnough()) show();'], ['if (false) show();']);
  if (!m4) male('mutante «scorrimento sordo»: il sorgente è cambiato, il mutante non si costruisce più');
  else {
    const g = await giro('/', 390, 844, m4);
    g.b.some((t) => /ancora nascosto/.test(t)) ? bene('mutante «scorrimento sordo» preso dalla regola (b)')
      : male('mutante «scorrimento sordo»: la regola (b) non lo prende — non morde');
  }

  // M3 — i 5 secondi spenti
  const m3 = muta(['wait5 = setTimeout(show, 5000)'], ['wait5 = 0']);
  if (!m3) male('mutante «5s spenti»: il sorgente è cambiato, il mutante non si costruisce più');
  else {
    const d = await attesa('/', 390, 844, m3);
    d.length ? bene('mutante «5s spenti» preso dalla regola (d)')
      : male('mutante «5s spenti»: la regola (d) non lo prende — non morde');
  }

  // M5 — .zz di nuovo DENTRO la media query del telefono: ruotato oltre gli
  // 880px prima del momento, il riquadro compare da solo col layout desktop
  const m5 = muta(
    [".boomcst button{padding:8px 14px}}' +",
     "'.boomcst.zz{opacity:0!important;visibility:hidden;pointer-events:none}' +"],
    [".boomcst button{padding:8px 14px}' +",
     "'.boomcst.zz{opacity:0!important;visibility:hidden;pointer-events:none}}' +"]);
  if (!m5) male('mutante «.zz solo sul telefono»: il sorgente è cambiato, il mutante non si costruisce più');
  else {
    const r = await ruota(m5);
    r.some((t) => /compare da solo/.test(t)) ? bene('mutante «.zz solo sul telefono» preso dalla regola del telefono ruotato')
      : male('mutante «.zz solo sul telefono»: la regola del telefono ruotato non lo prende — non morde');
  }

  // M6 — com'era: nessun link nel piede, il diniego che non pulisce
  const m6 = muta(['  function ready() {\n    footerLink();', '    denyGtag();\n    dropCookies();\n    dropStored();'],
    ['  function ready() {', '    denyGtag();']);
  if (!m6) male('mutante «nessun ripensamento»: il sorgente è cambiato, il mutante non si costruisce più');
  else {
    const r = await ripensa(m6);
    const link = r.some((t) => /link «Cookie preferences» invece di 1/.test(t));
    const resti = r.some((t) => /Essential only»: restano/.test(t));
    link && resti ? bene('mutante «nessun ripensamento» preso: senza link nel piede e con boom_attr/_ga rimasti dopo il diniego')
      : male(`mutante «nessun ripensamento»: la regola non lo prende (link ${link}, pulizia ${resti}) — non morde`);
  }

  // M7 — i 5 secondi di nuovo dal load (com'era): con il load spostato di
  // 4s il riquadro compare a ~9s
  const m7 = muta(['    if (delayed && !due && !wait5) wait5 = setTimeout(show, 5000);'],
    ["    if (delayed && !due && !wait5) window.addEventListener('load', function () { if (!due) wait5 = setTimeout(show, 5000); });"]);
  if (!m7) male('mutante «5s dal load»: il sorgente è cambiato, il mutante non si costruisce più');
  else {
    const r = await arrivo(m7);
    r.some((t) => /ancora nascosto/.test(t)) ? bene('mutante «5s dal load» preso dalla regola dei 5 secondi dall\'arrivo')
      : male(`mutante «5s dal load»: la regola non lo prende (${r.join('; ') || 'nessun guasto'}) — non morde`);
  }

  // M8 — misura solo per chi parte da telefono (com'era): la finestra
  // ristretta dopo il caricamento resta sopra la barra
  const m8 = muta(['    delayed = onPhone();\n    arm();'], ['    delayed = onPhone();\n    if (delayed) arm();']);
  if (!m8) male('mutante «misura solo dal telefono»: il sorgente è cambiato, il mutante non si costruisce più');
  else {
    const r = (await Promise.all(['/pacchetto-concordato', '/faq'].map((u) => stringi(u, m8)))).flat();
    r.some((t) => /sta sopra/.test(t)) ? bene(`mutante «misura solo dal telefono» preso dalla regola della finestra ristretta (${r.filter((t) => /sta sopra/.test(t)).length} pagine)`)
      : male('mutante «misura solo dal telefono»: la regola della finestra ristretta non lo prende — non morde');
  }
}

await br.close(); srv.close();
console.log(ko ? `  \x1b[31mIl riquadro dei cookie si mette ancora in mezzo\x1b[0m — ${ok} passed, ${ko} failed`
  : `  \x1b[32mIl riquadro dei cookie lascia libera la pagina\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
