// tests/seo/run.mjs — le guardie della SEO, perché non torni alla deriva.
//
// LA LEZIONE DEL 2026-08-27: il registro (scripts/seo-config.js) era fermo a
// ~40 voci mentre il sito ne serviva 65 — rigenerare la sitemap avrebbe
// CANCELLATO canone, services, executive, reunion e le guide dall'indice;
// la sitemap a mano intanto elencava /booking (bloccata da robots.txt, una
// contraddizione che Search Console segnala) e NON conosceva welcome-to-rome
// né ponte-milvio. E su 20 pagine il markup FAQPage dichiarava domande che
// la pagina non mostrava — il "contenuto nascosto" che la dottrina di casa
// (reunion, executive) già vieta, qui esteso a TUTTO il sito.
//
// Le invarianti, tutte sulla SORGENTE o sugli artefatti committati:
//  1. ogni pagina indicizzabile in produzione ha title ≤65, description
//     50–168, canonical sul dominio canonico, OG, JSON-LD che PARSA,
//     un solo H1, lang e DOCTYPE;
//  2. ogni pagina indicizzabile è NEL REGISTRO (una pagina nuova senza voce
//     = questo test rosso — così il registro non può più invecchiare);
//  3. sitemap.xml = proiezione del registro: stessi URL del generatore,
//     nessun URL bloccato da robots.txt, nessun file inesistente, hreflang
//     di reunion/executive presenti, le pagine portanti dentro;
//  4. FAQPage: al massimo UN blocco per pagina e ogni domanda dello schema
//     esiste come testo visibile (stessa estrazione dello strumento di
//     sincronizzazione — una copia sola);
//  5. llms.txt: ogni link boomrome.com punta a una rotta VERA del repo
//     (file, rewrite o redirect — la lezione delle risposte WhatsApp);
//  6. la guardia di seo-update.js resta al suo posto (la sentinella è il
//     consenso: una testa curata a mano non si riscrive alla cieca).
//
//   node tests/seo/run.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { extractVisibleFaq, ldBlocks, normText, plainText } from '../../scripts/seo-faq-sync.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(new URL('.', import.meta.url).pathname, '..', '..');
const ORIGIN = 'https://www.boomrome.com';

let pass = 0, fail = 0;
const ok = (c, what) => { if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); } };
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

/* ── il perimetro: cosa va davvero in produzione ─────────────────────── */
const ignored = read('.vercelignore').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
const isIgnored = (f) => ignored.some((re) => re.test(f));

const allPages = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...readdirSync(join(ROOT, 'apartments-in')).filter((f) => f.endsWith('.html')).map((f) => 'apartments-in/' + f),
].filter((f) => !isIgnored(f));

const attr = (tag, name) => {
  const m = tag.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? (m[2] ?? m[3]) : null;
};
const metaByName = (html, name) => {
  const re = /<meta\b[^>]*>/gi; let m;
  while ((m = re.exec(html))) if ((attr(m[0], 'name') || '').toLowerCase() === name) return attr(m[0], 'content');
  return null;
};
const metaByProp = (html, prop) => {
  const re = /<meta\b[^>]*>/gi; let m;
  while ((m = re.exec(html))) if ((attr(m[0], 'property') || '').toLowerCase() === prop) return attr(m[0], 'content');
  return null;
};
const linkRel = (html, rel) => {
  const re = /<link\b[^>]*>/gi; let m;
  while ((m = re.exec(html))) if ((attr(m[0], 'rel') || '').toLowerCase() === rel) return attr(m[0], 'href');
  return null;
};

const pages = {};
for (const f of allPages) {
  const html = read(f);
  const robots = metaByName(html, 'robots') || '';
  pages[f] = { html, noindex: robots.includes('noindex') };
}
const indexable = Object.keys(pages).filter((f) => !pages[f].noindex);

/* ── 1. l'igiene di ogni pagina indicizzabile ────────────────────────── */
console.log(`\n▸ le ${indexable.length} pagine indicizzabili in produzione: testa completa`);
let clean = 0;
const titles = new Map();
for (const f of indexable) {
  const { html } = pages[f];
  const problems = [];
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
  if (!title) problems.push('senza <title>');
  else {
    if (title.length > 65) problems.push(`title ${title.length} car. (max 65)`);
    if (titles.has(title)) problems.push(`title duplicato con ${titles.get(title)}`);
    titles.set(title, f);
  }
  const desc = metaByName(html, 'description') || '';
  if (!desc) problems.push('senza description');
  else if (desc.length < 50 || desc.length > 168) problems.push(`description ${desc.length} car. (50–168)`);
  const canonical = linkRel(html, 'canonical');
  if (!canonical) problems.push('senza canonical');
  else if (!canonical.startsWith(ORIGIN)) problems.push(`canonical fuori dominio: ${canonical}`);
  else if (/\.html$/.test(canonical)) problems.push('canonical con .html (cleanUrls la 308-a)');
  if (!metaByProp(html, 'og:title')) problems.push('senza og:title');
  if (!metaByProp(html, 'og:image')) problems.push('senza og:image');
  if (!/^<!DOCTYPE html>/i.test(html.trimStart())) problems.push('senza DOCTYPE (quirks mode)');
  if (!/<html[^>]*\slang=/i.test(html)) problems.push('senza lang');
  const h1s = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1s !== 1) problems.push(`${h1s} H1 (ne serve 1)`);
  const blocks = ldBlocks(html);
  if (!blocks.length) problems.push('senza JSON-LD');
  const broken = blocks.filter((b) => b.json === null).length;
  if (broken) problems.push(`${broken} blocchi JSON-LD che non parsano`);
  if (problems.length) ok(false, `${f}: ${problems.join(' · ')}`);
  else clean++;
}
ok(clean === indexable.length, `${clean}/${indexable.length} pagine con la testa a posto`);

/* ── 2. il registro conosce ogni pagina indicizzabile ────────────────── */
console.log('\n▸ il registro non può più invecchiare');
const { PAGES } = require('../../scripts/seo-config.js');
const missing = indexable.filter((f) => !PAGES[f]);
ok(missing.length === 0, `ogni pagina indicizzabile è in scripts/seo-config.js${missing.length ? ` — mancano: ${missing.join(', ')}` : ''}`);

/* ── 3. sitemap = proiezione del registro ────────────────────────────── */
console.log('\n▸ sitemap.xml: la proiezione, non un file a mano');
const sitemap = read('sitemap.xml');
const smUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const smPaths = smUrls.map((u) => u.replace(ORIGIN, '') || '/');
ok(smUrls.every((u) => u.startsWith(ORIGIN)), 'ogni <loc> sta sul dominio canonico');
ok(new Set(smPaths).size === smPaths.length, 'nessun URL duplicato');

const { entries } = require('../../scripts/seo-sitemap.js');
const genPaths = entries.map((e) => e.loc.replace(ORIGIN, '') || '/').sort();
const smSorted = [...smPaths].sort();
ok(JSON.stringify(genPaths) === JSON.stringify(smSorted),
  `sitemap.xml == generatore (${smPaths.length} URL)` +
  (JSON.stringify(genPaths) === JSON.stringify(smSorted) ? '' :
    ` — solo in sitemap: [${smSorted.filter((p) => !genPaths.includes(p))}] · solo nel generatore: [${genPaths.filter((p) => !smSorted.includes(p))}]`));

// ogni URL della sitemap ha un file che risponde
const pathToFile = new Map();
for (const [file, cfg] of Object.entries(PAGES)) pathToFile.set(cfg.path === '/' ? '/' : cfg.path, file);
const dead = smPaths.filter((p) => {
  const file = pathToFile.get(p);
  return !file || !existsSync(join(ROOT, file)) || isIgnored(file);
});
ok(dead.length === 0, `ogni URL in sitemap ha il suo file in produzione${dead.length ? ` — morti: ${dead.join(', ')}` : ''}`);

// nessun URL della sitemap è bloccato da robots.txt (la contraddizione /booking)
const robotsTxt = read('robots.txt');
const disallows = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]).filter((d) => !d.includes('?'));
const blocked = smPaths.filter((p) => disallows.some((d) => p === d || p === d.replace(/\.html$/, '')));
ok(blocked.length === 0, `nessun URL in sitemap è bloccato da robots.txt${blocked.length ? ` — bloccati: ${blocked.join(', ')}` : ''}`);

// nessuna pagina noindex in sitemap
const noindexIn = smPaths.filter((p) => { const f = pathToFile.get(p); return f && pages[f] && pages[f].noindex; });
ok(noindexIn.length === 0, `nessuna pagina noindex in sitemap${noindexIn.length ? ` — dentro: ${noindexIn.join(', ')}` : ''}`);

// le portanti, per nome — l'assenza di welcome-to-rome era il buco trovato
for (const p of ['/', '/apartments', '/welcome-to-rome', '/canone', '/services', '/executive', '/reunion', '/moving-to-rome', '/apartments-in/ponte-milvio', '/blog-scam-bible']) {
  ok(smPaths.includes(p), `la sitemap porta ${p}`);
}
// hreflang dei due mercati bilingui
ok(/reunion"\/>[\s\S]{0,200}?hreflang="en" href="https:\/\/www\.boomrome\.com\/reunion\?lang=en"/.test(sitemap) || (sitemap.includes('hreflang="fr"') && sitemap.includes('/reunion?lang=en')), 'reunion dichiara fr + en');
ok(sitemap.includes('/executive?lang=it'), 'executive dichiara en + it');
ok(robotsTxt.includes('Sitemap: https://www.boomrome.com/sitemap.xml') && robotsTxt.includes('Sitemap: https://www.boomrome.com/listings-sitemap.xml'), 'robots.txt dichiara entrambe le sitemap');

/* ── 4. FAQPage: mai un blocco che dice ciò che la pagina non mostra ── */
console.log('\n▸ FAQ: lo schema segue lo schermo (la dottrina reunion/executive, su tutto il sito)');
let faqViolations = 0;
for (const f of Object.keys(pages)) {
  const { html } = pages[f];
  const woLd = html.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, ' ');
  const hay = normText(woLd.replace(/<[^>]+>/g, ' '));
  let topFaq = 0;
  for (const b of ldBlocks(html)) {
    if (!b.json) continue;
    const nodes = b.json['@graph'] || [b.json];
    for (const n of nodes) {
      if (!n || n['@type'] !== 'FAQPage') continue;
      if (!b.json['@graph']) topFaq++;
      for (const q of n.mainEntity || []) {
        const probe = normText(q.name || '').slice(0, 45);
        if (probe && !hay.includes(probe)) {
          faqViolations++;
          ok(false, `${f}: domanda invisibile nello schema — "${(q.name || '').slice(0, 60)}"`);
        }
      }
    }
  }
  if (topFaq > 1) { faqViolations++; ok(false, `${f}: ${topFaq} blocchi FAQPage (ne vale uno)`); }
}
ok(faqViolations === 0, 'ogni domanda FAQPage esiste come testo in pagina, un blocco per pagina');

/* ── 5. llms.txt: mai un link morto in bocca a un motore di risposta ── */
console.log('\n▸ llms.txt: le rotte dedotte dal repo, non da una lista');
const vercel = JSON.parse(read('vercel.json'));
const routes = new Set(['/']);
for (const f of allPages) routes.add('/' + f.replace(/\.html$/, '').replace(/\/index$/, ''));
for (const rw of vercel.rewrites || []) if (!rw.source.includes(':') && !rw.source.includes('(')) routes.add(rw.source);
for (const rd of vercel.redirects || []) {
  const src = rd.source.replace(/^\/\(([^)]+)\)$/, '$1');
  for (const alt of src.split('|')) routes.add('/' + alt.replace(/^\//, ''));
}
routes.add('/llms-listings.txt'); routes.add('/sitemap.xml'); routes.add('/listings-sitemap.xml');
const llms = read('llms.txt');
const llmsLinks = [...llms.matchAll(/https:\/\/www\.boomrome\.com(\/[^\s)\]]*)?/g)]
  .map((m) => (m[1] || '/').replace(/[.,:]$/, ''));
let deadLlms = 0;
for (const p of new Set(llmsLinks)) {
  const base = p.split('?')[0];
  const okRoute = routes.has(base) || base === '/' || base.startsWith('/listing/') || base.startsWith('/apartments-in');
  if (!okRoute) { deadLlms++; ok(false, `llms.txt linka una rotta inesistente: ${p}`); }
}
ok(deadLlms === 0, `i ${new Set(llmsLinks).size} link boomrome.com di llms.txt risolvono tutti`);
for (const p of ['/blog-scam-bible', '/welcome-to-rome', '/llms-listings.txt']) {
  ok(llms.includes(ORIGIN + p), `llms.txt cita ${p}`);
}

/* ── 6. le guardie restano al loro posto (asserito sulla sorgente) ──── */
console.log('\n▸ le guardie sulla sorgente');
const upd = read('scripts/seo-update.js');
ok(upd.includes("cfg.metaManaged === false"), 'seo-update salta le teste curate a mano (metaManaged:false)');
ok(upd.includes('SENTINEL_OPEN) && !ADOPT'), 'seo-update non inietta mai senza sentinella (serve --adopt)');
const smSrc = read('scripts/seo-sitemap.js');
ok(smSrc.includes('gitLastmod'), 'il lastmod della sitemap viene da git, non da "oggi"');
const vign = read('.vercelignore');
for (const f of ['index-classic.html', 'apartments-classic.html', 'apartment-detail-classic.html', 'property-finding-classic.html', 'header.html']) {
  ok(vign.includes(f), `.vercelignore tiene fuori ${f}`);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
