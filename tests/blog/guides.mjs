// tests/blog/guides.mjs  (suite `blogguides`)
// LE QUATTRO GUIDE DI PUNTA: LEGGE GIUSTA, TESTO LEGGIBILE SENZA JS, UN ARTICOLO SOLO.
//
// I reperti (15/10/2026):
//  · blog-tenant-rights diceva la legge sbagliata: la clausola «no animali»
//    nel contratto «nulla» (l'art. 1138 c.c. vincola il regolamento di
//    condominio, non il contratto), «puoi recedere in qualsiasi momento con
//    6 mesi» (servono i gravi motivi), una prelazione generale dell'inquilino
//    (esiste solo nel caso dell'art. 3 c. 1 lett. g L. 431/98) e il contratto
//    non registrato che «fa scendere il canone al minimo concordato» (la
//    riduzione automatica del D.Lgs. 23/2011 non si applica piu').
//  · quattro guide tenevano le risposte SOLO dentro un array JavaScript: un
//    crawler che non esegue JS vedeva contenitori vuoti.
//  · ogni guida dichiarava DUE articoli (un `Article` scritto a mano con un
//    editore inventato, «BOOM Rome Rentals», piu' il BlogPosting generato)
//    e statistiche mai misurate (€47K, 500+, 2min, «80% dei falsi annunci»).
//
// Le regole: (1) il markup statico corrisponde ai dati (`--check`); (2) ogni
// stringa dei dati e' testo della pagina fuori dagli <script>; (3) le frasi
// sbagliate non tornano; (4) un solo articolo, datato e attribuito; (5) la
// data di modifica e' visibile; (6) l'organizzazione e' la societa' vera.
// In piu', se c'e' un browser: con JS acceso la pagina si comporta come
// prima (una risposta aperta alla volta, nessun doppione).

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { PAGES, dataOf, markup } from '../../scripts/blog-prerender.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const elenco = (r, max = 10) => '\n      ' + r.slice(0, max).join('\n      ')
  + (r.length > max ? `\n      … e altre ${r.length - max}` : '');

const FILES = Object.keys(PAGES);
const MOD = '2026-10-15';
const PUB = {
  'blog-47-steps.html': '2026-02-26',
  'blog-scam-bible.html': '2026-02-26',
  'blog-neighborhood-guide.html': '2026-02-26',
  'blog-tenant-rights.html': '2026-02-27',
};
const ORG = 'https://www.boomrome.com/#organization';
const src = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(R, f), 'utf8')]));

console.log('\n\x1b[1m▸ blogguides\x1b[0m  le quattro guide: legge giusta, testo senza JS, un articolo solo');

// ── testo visibile: niente script/stili/commenti, entita' decodificate ────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', middot: '·', rarr: '→', larr: '←', darr: '↓',
  hellip: '…', euro: '€', reg: '®', copy: '©', sup2: '²' };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z0-9]+);/gi, (m, n) => (n in ENT ? ENT[n] : m));
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
const visible = (h) => squash(decode(h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')));
// tutto cio' che un lettore O un motore puo' leggere: testo, JSON-LD, sorgente
// con gli escape \uXXXX risolti; apostrofi tipografici ridotti a quelli dritti.
const plain = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
const unesc = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// ── 1 · il markup statico e' quello dei dati ─────────────────────────────
{
  const r = spawnSync(process.execPath, [path.join(R, 'scripts/blog-prerender.mjs'), '--check'], { encoding: 'utf8' });
  r.status === 0
    ? bene('node scripts/blog-prerender.mjs --check: le quattro pagine sono allineate ai loro dati')
    : male('il markup statico non corrisponde ai dati — rilancia node scripts/blog-prerender.mjs'
        + elenco((r.stdout + r.stderr).trim().split('\n')));
  // e ogni pagina ha UN blocco, dentro il contenitore giusto
  const CONT = {
    'blog-scam-bible.html': /<div class="scams" id="scam-list">\s*<div class="scam-intro">[\s\S]*?<\/div>\s*<!-- PRERENDER:START/,
    'blog-tenant-rights.html': /<div class="qa-list" id="qa-list">\s*<!-- PRERENDER:START/,
    'blog-47-steps.html': /<div id="steps-area">\s*<!-- PRERENDER:START/,
    'blog-neighborhood-guide.html': /<div id="ds">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<!-- PRERENDER:START/,
  };
  const fuori = FILES.filter((f) => (src[f].match(/<!-- PRERENDER:START/g) || []).length !== 1 || !CONT[f].test(src[f]));
  fuori.length ? male('blocco PRERENDER assente, doppio o fuori dal contenitore:' + elenco(fuori))
               : bene('un solo blocco PRERENDER per pagina, dentro il contenitore della lista');
}

// ── 2 · ogni stringa dei dati e' testo della pagina, fuori dagli <script> ──
const FIELDS = {
  'blog-tenant-rights.html': (d) => d.categories.flatMap((c) => [c.name,
    ...c.questions.flatMap((q) => [q.q, q.answer, q.law, q.protection])]),
  'blog-scam-bible.html': (d) => d.scams.flatMap((s) => [s.name, s.summary, s.description,
    ...s.redFlags, s.realCase, s.protection, s.frequency]),
  'blog-47-steps.html': (d) => d.phases.flatMap((p) => [p.name,
    ...p.steps.flatMap((s) => [s.title, s.detail, s.time, ...(s.warning ? [s.warning] : [])])]),
  'blog-neighborhood-guide.html': (d) => d.ZO.flatMap((id) => {
    const z = d.Z[id]; return [z.n, z.r, z.v, z.b, z.a, z.i];
  }),
};
const datiDi = {};
for (const f of FILES) {
  const d = dataOf(f, src[f]);
  datiDi[f] = d;
  const vis = visible(src[f]);
  const voci = FIELDS[f](d).map(squash);
  const mancano = voci.filter((t) => !vis.includes(t));
  mancano.length
    ? male(`${f}: ${mancano.length}/${voci.length} stringhe dei dati non sono testo della pagina:` + elenco(mancano.map((t) => t.slice(0, 90))))
    : bene(`${f}: tutte le ${voci.length} stringhe dei dati sono testo HTML (leggibili senza JS)`);
}

// ── 2b · il JS non ricostruisce piu' la lista (niente doppioni) ───────────
{
  const guai = [];
  const sb = src['blog-scam-bible.html'];
  if (!/if \(!list\.querySelector\('\.scam-card'\)\) \{\s*scams\.forEach/.test(sb))
    guai.push('scam-bible: il ciclo delle card non e protetto da if (!list.querySelector(\'.scam-card\'))');
  if (/list\.innerHTML\s*=/.test(src['blog-tenant-rights.html']))
    guai.push('tenant-rights: renderQuestions riscrive ancora innerHTML');
  if (/area\.innerHTML\s*=/.test(src['blog-47-steps.html']))
    guai.push('47-steps: buildSteps riscrive ancora area.innerHTML');
  const nb = src['blog-neighborhood-guide.html'];
  if (/getElementById\('dp'\)\.insertAdjacentHTML|querySelector\('\.zd'\);\s*if\s*\(o\)\s*o\.remove\(\)/.test(nb))
    guai.push('neighborhood-guide: il click costruisce (o cancella) una seconda copia della zona');
  guai.length ? male('il JS ricostruisce ancora le liste:' + elenco(guai))
              : bene('il JS mostra/nasconde i nodi prerenderizzati invece di ricostruirli');

  // scam-bible: il markup statico e' QUELLO che il vecchio ciclo costruiva
  // (lo si esegue davvero, in vm, con una lista finta che risponde «vuota»).
  const script = [...sb.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => /var scams\s*=/.test(s));
  let costruito = '';
  const lista = { querySelector: () => null, insertAdjacentHTML: (_, h) => { costruito += h; } };
  vm.runInNewContext(script, { document: { getElementById: () => lista } }, { timeout: 2000 });
  const statico = decode(markup('blog-scam-bible.html', sb).replace(/\n/g, ''));
  costruito === statico
    ? bene('scam-bible: le card statiche sono identiche a quelle del ciclo JS (stessi id e gestori)')
    : male('scam-bible: le card statiche divergono dal ciclo JS');
}

// ── 3 · le frasi sbagliate non tornano ───────────────────────────────────
{
  const VIETATE = [
    ['concordato minimum', /concordato minimum/i],
    ["it's considered void", /it's considered void/i],
    ['terminate at any time with 6 months', /terminate at any time with 6 months/i],
    ['€47K', /€47K|&#8364;47K/i],
    ['zero scams', /zero scams/i],
    ["80% of 'too good", /80% of 'too good/i],
    ['within 10 days', /within 10 days/i],
    // «500+» come numero a se': il canone di Centro «€1,500–2,500+» resta
    ['500+', /(?<![\d.,])500\+/],
    ['2min', /\b2min\b/i],
    ['10-Day / 5-day delivery', /10-Day Delivery|5-day delivery/i],
    ['Deposit protection', /deposit protection/i],
    ['Response within 2 hours', /within 2 hours|within a few hours/i],
    ['can be invalidated', /can be invalidated/i],
    ['limited legal standing', /limited legal standing/i],
    ['No exceptions (recesso)', /notice via raccomandata \(registered letter\)\. No exceptions/i],
    ['500+ rental deals', /500\+ rental deals/i],
    ['BOOM Rome Rentals', /BOOM Rome Rentals/],
    // la provvigione di BOOM (10% del canone annuo + IVA) non e' una truffa,
    // e l'Italia non ha un massimo di legge per la provvigione
    ['standard commission in Rome is one month', /standard commission in Rome is one month/i],
    ['legal maximum would have been', /legal maximum would have been/i],
    ['Commission higher than one month', /Commission higher than one month/i],
    ['legally the cost should be split', /legally the cost should be split/i],
    ['illegal to charge for', /illegal to charge for/i],
    // contratto non registrato: nullo, ma nessuno ti mette fuori senza giudice
    ['evicted without process', /evicted without process/i],
    ['zero legal protection', /zero legal protection/i],
    ['making you complicit', /making you complicit/i],
    // diritto dell'inquilino: niente giurisprudenza non verificata, niente regole inventate
    ['case law 1–3 months', /considers 1.3 months reasonable/i],
    ['first 4-year period', /first 4-year period/i],
    ['6 months to sue', /6 months to sue/i],
    ['urgent personal need', /urgent personal need/i],
    ['reduced from previous thresholds', /reduced from previous thresholds/i],
    ['Art. 32, Legge 392 (ISTAT)', /Art\. 32, Legge 392/i],
    ['2% of annual rent, split 50/50', /2% of annual rent, split 50\/50/i],
    ['residency within 8 days of the permesso', /within 8 days of getting your permesso/i],
    // statistiche mai misurate
    ['saved clients thousands', /saved clients thousands/i],
    ['hundreds of rental deals', /hundreds of rental deals/i],
    ['closed deals in every single one', /closed deals in every single one/i],
    ['15-20% less', /15-20% less/i],
    ['24-72 hours', /last 24-72 hours/i],
    ['cost 3x more', /cost 3x more/i],
    ['paying triple', /paying triple/i],
    ['saves you thousands', /saves you thousands/i],
    ['visura €5', /(?:costs|This) €5(?![\d,.])/i],
  ];
  const trovate = [];
  for (const f of FILES) {
    const h = plain(visible(src[f]) + '\n' + decode(unesc(src[f])));
    for (const [nome, re] of VIETATE) if (re.test(h)) trovate.push(`${f} → «${nome}»`);
  }
  trovate.length ? male(`${trovate.length} frasi sbagliate o non dimostrabili ancora in pagina:` + elenco(trovate))
                 : bene(`nessuna delle ${VIETATE.length} frasi vietate (legge sbagliata, statistiche mai misurate)`);

  // e la legge giusta c'e', in pagina, come testo
  const tr = plain(visible(src['blog-tenant-rights.html']));
  const DEVE = [
    ['animali: il condominio no, il contratto si', /The building can't, but the landlord can/],
    ['art. 1138 vincola il regolamento, non il contratto', /binds the building's regulations, not a clause agreed in your lease/],
    ['recesso per gravi motivi, 6 mesi', /serious reasons \(gravi motivi\).*6 months' notice by registered letter/],
    ['transitorio e studenti: 3 mesi', /at least 3 months' notice by registered letter/],
    ['prelazione solo nel caso della lett. g', /only in one case[\s\S]*art\. 3, c\. 1, lett\. g, L\. 431\/1998/],
    ['contratto non registrato nullo', /null under Italian law \(art\. 1, c\. 346, L\. 311\/2004\)/],
    ['link a Contract Check Express', /Contract Check Express gives you a written verdict/],
  ];
  const assenti = DEVE.filter(([, re]) => !re.test(tr)).map(([n]) => n);
  if (!/<a href="\/contract-check-express">Contract Check Express<\/a>/.test(src['blog-tenant-rights.html'])) assenti.push('href /contract-check-express');
  const cat = fs.readFileSync(path.join(R, 'api/_catalog.js'), 'utf8');
  const cce = (cat.match(/'contract-check-express':\s*\{\s*eur:\s*(\d+)/) || [])[1];
  if (!cce || !tr.includes(`(€${cce})`)) assenti.push(`prezzo Contract Check Express ≠ catalogo (€${cce})`);
  assenti.length ? male('tenant-rights: mancano le formulazioni corrette:' + elenco(assenti))
                 : bene('tenant-rights: animali, recesso, prelazione e registrazione dicono la legge citata');
}

// ── 4 · un solo articolo, datato e attribuito ────────────────────────────
const ARTICLE = new Set(['Article', 'BlogPosting', 'NewsArticle', 'TechArticle']);
const nodi = (h) => {
  const out = [];
  for (const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
    let d; try { d = JSON.parse(m[1]); } catch { out.push({ '@type': '__rotto__' }); continue; }
    for (const n of (d['@graph'] || [d])) out.push(n);
  }
  return out;
};
const meta = (h, p) => (h.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1];
for (const f of FILES) {
  const h = src[f];
  const ns = nodi(h);
  const guai = [];
  if (ns.some((n) => n['@type'] === '__rotto__')) guai.push('un blocco JSON-LD non parsa');
  const art = ns.filter((n) => [].concat(n['@type'] || []).some((t) => ARTICLE.has(t)));
  const canon = (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (art.length !== 1) guai.push(`${art.length} nodi articolo (atteso 1)`);
  const a = art[0] || {};
  if (a['@id'] !== canon + '#article') guai.push(`@id ${a['@id']} ≠ ${canon}#article`);
  if (!a.author || a.author['@id'] !== ORG) guai.push('author non è #organization');
  if (a.datePublished !== PUB[f]) guai.push(`datePublished ${a.datePublished} ≠ ${PUB[f]}`);
  if (a.datePublished !== meta(h, 'article:published_time')) guai.push('datePublished ≠ article:published_time');
  if (a.dateModified !== MOD) guai.push(`dateModified ${a.dateModified} ≠ ${MOD}`);
  if (a.dateModified !== meta(h, 'article:modified_time')) guai.push('dateModified ≠ article:modified_time');
  if (a.inLanguage !== 'en') guai.push('inLanguage ≠ en');
  if (!a.isPartOf || a.isPartOf['@id'] !== 'https://www.boomrome.com/blog#blog') guai.push('isPartOf ≠ /blog#blog');
  // (5) la data di modifica si VEDE
  const vis = h.replace(/<script[\s\S]*?<\/script>/gi, '');
  if (!new RegExp(`<p class="hero-by">[^<]*<time datetime="${a.dateModified}">`).test(vis))
    guai.push(`nessun <time datetime="${a.dateModified}"> visibile nel byline`);
  // (6) l'organizzazione e' la societa' vera
  const org = ns.filter((n) => n['@id'] === ORG);
  if (!org.length) guai.push('nessun nodo #organization');
  for (const o of org) {
    if (o.legalName !== 'Egidi Immobiliare S.r.l.') guai.push(`#organization legalName «${o.legalName}»`);
    if (o.vatID && o.vatID !== 'IT17322991005') guai.push(`vatID ${o.vatID}`);
    if (o.address && o.address.streetAddress && o.address.streetAddress !== 'Via dei Coronari 181/184') guai.push('streetAddress');
  }
  guai.length ? male(`${f}:` + elenco(guai))
              : bene(`${f}: un articolo (${a['@type']}) #organization, ${a.datePublished} → ${a.dateModified}, byline visibile`);
}

// la descrizione della guida ai quartieri non porta piu' i «500+ deal»
{
  const NB = "Honest, no-BS guide to Rome's 12 best neighborhoods for expats. Interactive map with scam risk ratings, rent prices and insider tips from a Rome rental agency.";
  const h = src['blog-neighborhood-guide.html'];
  const posti = [/<meta name="description" content="([^"]*)"/, /<meta property="og:description" content="([^"]*)"/,
    /<meta name="twitter:description" content="([^"]*)"/].map((re) => (h.match(re) || [])[1]);
  const art = nodi(h).find((n) => n['@type'] === 'BlogPosting') || {};
  posti.push(art.description);
  const storte = posti.filter((d) => d !== NB);
  storte.length || NB.length > 165 || NB.length < 110
    ? male(`neighborhood-guide: description non allineata in ${storte.length} posti (o fuori 110–165)`)
    : bene(`neighborhood-guide: description nuova (${NB.length} car) in meta, og, twitter e BlogPosting`);
  // i link statici alle pagine di zona e al meteo
  const zone = ['trastevere', 'centro-storico', 'monti', 'prati', 'testaccio', 'pigneto', 'san-lorenzo'];
  const nav = (h.match(/<nav class="zone-links"[\s\S]*?<\/nav>/) || [''])[0];
  const senza = zone.filter((z) => !nav.includes(`href="/apartments-in/${z}"`))
    .concat(['/apartments-in"', '/meteo"'].filter((u) => !nav.includes('href="' + u)));
  senza.length ? male('neighborhood-guide: la nav statica delle zone non porta:' + elenco(senza))
               : bene('neighborhood-guide: nav statica verso 7 zone, /apartments-in e /meteo');
  const note = (markup('blog-neighborhood-guide.html', h).match(/class="zr-note"/g) || []).length;
  note === datiDi['blog-neighborhood-guide.html'].ZO.length
    ? bene(`neighborhood-guide: ogni zona dichiara la fascia come «indicative asking range» con la fonte /meteo (${note})`)
    : male(`neighborhood-guide: nota sulla fascia di canone in ${note} zone su ${datiDi['blog-neighborhood-guide.html'].ZO.length}`);
}

// ── browser (facoltativo): con JS la pagina si comporta come prima ───────
const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright non disponibile — le verifiche in browser non girano');
} else {
  const PORTA = +(process.env.PORTA || 8237);
  const srv = http.createServer((rq, rs) => {
    let f = path.join(R, decodeURIComponent(rq.url.split('?')[0]));
    if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
    fs.readFile(f, (e, d) => e ? (rs.statusCode = 404, rs.end())
      : (rs.setHeader('content-type', f.endsWith('.css') ? 'text/css'
        : f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'), rs.end(d)));
  });
  await new Promise((r) => srv.listen(PORTA, r));
  const br = await chromium.launch(launchOptions());
  const apri = async (f, js = true) => {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: js });
    await ctx.route('**/*', (r) => (r.request().url().startsWith('http://localhost') ? r.continue() : r.abort()));
    const pg = await ctx.newPage();
    const errori = [];
    pg.on('pageerror', (e) => errori.push(String(e)));
    await pg.goto(`http://localhost:${PORTA}/${f}`, { waitUntil: 'load' });
    await pg.waitForTimeout(400);
    return { ctx, pg, errori };
  };
  const vis = (pg, sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sel);
  try {
    // tenant-rights: una categoria, poi una domanda — come prima, una risposta alla volta
    {
      const { ctx, pg, errori } = await apri('blog-tenant-rights.html');
      const r0 = { card: await vis(pg, '.qa-card'), risposte: await vis(pg, '.qa-answer'), tot: await pg.$$eval('.qa-card', (x) => x.length) };
      await pg.click('.cat-tab[data-cat="eviction"]');
      await pg.locator('.qa-hd:visible').nth(2).click();
      const r1 = { card: await vis(pg, '.qa-card'), risposte: await vis(pg, '.qa-answer'), leggi: await vis(pg, '.law-text') };
      await pg.locator('.law-toggle:visible').first().click();
      const leggi = await vis(pg, '.law-text');
      await pg.locator('.qa-hd:visible').nth(2).click();
      const r2 = await vis(pg, '.qa-answer');
      const atteso = r0.tot === 15 && r0.card === 4 && r0.risposte === 0 && r1.card === 4 && r1.risposte === 1 && r1.leggi === 0 && leggi === 1 && r2 === 0 && !errori.length;
      atteso ? bene('tenant-rights in Chromium: 4 domande visibili su 15 in DOM, un clic apre UNA risposta, la legge a richiesta, si richiude')
             : male('tenant-rights in Chromium si comporta diversamente: ' + JSON.stringify({ r0, r1, leggi, r2, errori }));
      await ctx.close();
    }
    // scam-bible: sette card, non quattordici
    {
      const { ctx, pg, errori } = await apri('blog-scam-bible.html');
      const n = await pg.$$eval('.scam-card', (x) => x.length);
      await pg.click('.scam-hd[data-id="4"]');
      const aperte = await vis(pg, '.scam-body');
      n === 7 && aperte === 1 && !errori.length
        ? bene('scam-bible in Chromium: 7 card (nessun doppione col ciclo JS), una si apre')
        : male(`scam-bible in Chromium: ${n} card, ${aperte} aperte, errori ${errori.join('; ')}`);
      await ctx.close();
    }
    // 47-steps: 47 passi in DOM, 7 visibili, il cambio fase ne mostra un'altra
    {
      const { ctx, pg, errori } = await apri('blog-47-steps.html');
      const tot = await pg.$$eval('.step-card', (x) => x.length);
      const v0 = await vis(pg, '.step-card');
      await pg.locator('.phase-item').nth(3).click();
      const v1 = await vis(pg, '.step-card');
      await pg.locator('.step-hd:visible').nth(1).click();
      const corpi = await vis(pg, '.step-body');
      await pg.locator('.step-cb:visible').first().click();
      const prog = await pg.textContent('#prog-count');
      tot === 47 && v0 === 7 && v1 === 10 && corpi === 1 && prog === '1/47' && !errori.length
        ? bene('47-steps in Chromium: 47 passi in DOM, 7 visibili, la fase 4 ne mostra 10, un passo si apre, il progresso conta')
        : male('47-steps in Chromium: ' + JSON.stringify({ tot, v0, v1, corpi, prog, errori }));
      await ctx.close();
    }
    // neighborhood: dodici zone in DOM, una alla volta, mai una seconda copia
    {
      const { ctx, pg, errori } = await apri('blog-neighborhood-guide.html');
      const v0 = await vis(pg, '.zd');
      await pg.click('.zbtn[data-z="monti"]');
      await pg.click('.zbtn[data-z="prati"]');
      const tot = await pg.$$eval('.zd', (x) => x.length);
      const v1 = await vis(pg, '.zd');
      const nome = await pg.evaluate(() => [...document.querySelectorAll('.zd')].find((e) => e.getClientRects().length)?.querySelector('.zn').textContent);
      const up = await vis(pg, '.zd .boom-upsell');
      await pg.click('.zbtn[data-z="prati"]');
      const v2 = await vis(pg, '.zd');
      v0 === 0 && tot === 12 && v1 === 1 && nome === 'Prati' && up === 2 && v2 === 0 && !errori.length
        ? bene('neighborhood-guide in Chromium: 12 zone in DOM, una alla volta con i suoi due upsell, nessuna copia, il secondo clic richiude')
        : male('neighborhood-guide in Chromium: ' + JSON.stringify({ v0, tot, v1, nome, up, v2, errori }));
      await ctx.close();
    }
    // senza JS tutto si legge
    {
      const conti = {};
      for (const [f, sel] of [['blog-tenant-rights.html', '.qa-answer'], ['blog-47-steps.html', '.step-detail'],
        ['blog-scam-bible.html', '.scam-text'], ['blog-neighborhood-guide.html', '.zd .zv']]) {
        const { ctx, pg } = await apri(f, false);
        conti[f] = await vis(pg, sel);
        await ctx.close();
      }
      const att = { 'blog-tenant-rights.html': 15, 'blog-47-steps.html': 47, 'blog-scam-bible.html': 7, 'blog-neighborhood-guide.html': 12 };
      const diversi = Object.keys(att).filter((f) => conti[f] !== att[f]);
      diversi.length ? male('senza JS non tutto si vede: ' + JSON.stringify(conti))
                     : bene('senza JS: 15 risposte, 47 passi, 7 truffe e 12 zone visibili e leggibili');
    }
  } finally {
    await br.close();
    srv.close();
  }
}

console.log(ko ? `  \x1b[31m${ko} guasti\x1b[0m — ${ok} passed` : `  \x1b[32mtutto verde\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
