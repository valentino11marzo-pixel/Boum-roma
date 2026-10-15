// tests/seogen/run.mjs
// IL GENERATORE SEO NON PUO' PIU' RIMETTERE UN'ENTITA' FINTA.
//
// Il reperto: scripts/seo-update.js e scripts/seo-config.js, rieseguiti,
// avrebbero riscritto sul sito un telefono inventato (+39 333 123 4567), una
// sede in «Via del Corso» con il centroide generico di Roma e orari mai
// pubblicati (il nodo LocalBusiness), la ragione sociale «BOOM Rome» al posto
// di Egidi Immobiliare S.r.l., e nelle descrizioni «500+» e «no broker fees».
// E sulle pagine con la testa scritta a mano avrebbero aggiunto una SECONDA
// serie di entita'. Le pagine erano state corrette a mano; il generatore no:
// bastava un giro per disfare tutto.
//
// Quattro guardie, piu' due sulle pagine fuori sitemap:
//   1. la sorgente del generatore non porta piu' i fatti finti;
//   2. il registro: descrizioni oneste e di misura, le teste a mano protette;
//   3. ANTI-DERIVA: il generatore, eseguito davvero in una copia, produce per
//      blog-47-steps gli stessi nodi BlogPosting e #organization che la
//      pagina pubblica — e lascia intatta una pagina con la testa a mano;
//   4. la sitemap (mantenuta a mano) non si riscrive se perderebbe URL;
//   5. le pagine noindex deployate portano l'entita' legale vera.
//
// Il generatore NON gira mai sul repo: solo in una cartella temporanea.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, dett = '') => (cond ? bene(t) : male(t + (dett ? ' — ' + dett : '')));
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

console.log('\n\x1b[1m▸ seogen\x1b[0m  il generatore SEO non rimette un\'entita\' finta');

const ORG = {
  legalName: 'Egidi Immobiliare S.r.l.',
  vatID: 'IT17322991005',
  telephone: '+39-331-325-1961',
  streetAddress: 'Via dei Coronari 181/184',
  postalCode: '00186',
};

// Tutti i nodi JSON-LD di una pagina, @graph e array compresi.
function nodiJsonLd(html) {
  const out = [];
  const errori = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1]); } catch (e) { errori.push(e.message); continue; }
    const giu = (x) => {
      if (Array.isArray(x)) return x.forEach(giu);
      if (x && typeof x === 'object') {
        if (Array.isArray(x['@graph'])) return x['@graph'].forEach(giu);
        out.push(x);
      }
    };
    giu(d);
  }
  return { nodi: out, errori };
}
const orgDi = (nodi) => nodi.filter((n) => typeof n['@id'] === 'string' && n['@id'].endsWith('/#organization'));

// ── 1 · la sorgente del generatore ────────────────────────────────────
const src = read('scripts/seo-update.js');
check(!/legalName:\s*['"]BOOM Rome['"]/.test(src), "seo-update.js: niente legalName 'BOOM Rome'");
check(!src.includes('+39 333 123 4567'), 'seo-update.js: niente telefono inventato +39 333 123 4567');
check(!src.includes('Via del Corso'), "seo-update.js: niente sede finta in 'Via del Corso'");
check(!src.includes('localBusinessJsonLd') && !/case\s+'LocalBusiness'/.test(src),
  'seo-update.js: nessun nodo LocalBusiness (centroide, orari mai pubblicati)');
for (const [k, v] of Object.entries(ORG)) {
  check(src.includes(`'${v}'`), `seo-update.js: l'organizzazione dichiara ${k} = ${v}`);
}
check(!/500\+|24\/7|Zero hidden fees|no broker fees/i.test(src.replace(/^\s*\/\/.*$/gm, '')),
  'seo-update.js: nessuna promessa vietata (500+, 24/7, Zero hidden fees, no broker fees)');

// Le cinque risposte della home: il FAQPage che il generatore saprebbe
// scrivere dice parola per parola cio' che index.html dichiara.
{
  const home = nodiJsonLd(read('index.html')).nodi.find((n) => n['@type'] === 'FAQPage');
  const domande = home ? home.mainEntity || [] : [];
  const mancanti = domande.filter((q) => !src.includes(q.name) || !src.includes(q.acceptedAnswer.text));
  check(domande.length === 5 && !mancanti.length,
    'il FAQPage:home del generatore e\' quello di index.html, parola per parola',
    domande.length !== 5 ? `index.html dichiara ${domande.length} domande` : mancanti.map((q) => q.name).join(' | '));
}

// ── 2 · il registro ───────────────────────────────────────────────────
const { PAGES } = require(path.join(R, 'scripts/seo-config.js'));
{
  const fuori = [];
  const vietate = [];
  for (const [f, c] of Object.entries(PAGES)) {
    const d = c.description || '';
    if (/500\+|24\/7|Zero hidden fees|no broker fees/i.test(d)) vietate.push(f);
    if (/noindex/i.test(c.robots || '')) continue;
    const n = [...d].length;
    if (n < 110 || n > 165) fuori.push(`${f} (${n})`);
  }
  check(!fuori.length, 'ogni descrizione indicizzabile sta fra 110 e 165 caratteri', fuori.join(', '));
  check(!vietate.length, 'nessuna descrizione dice 500+, 24/7, Zero hidden fees o no broker fees', vietate.join(', '));

  const aMano = ['index.html', 'apartments.html', 'apartment-detail.html', 'how-it-works.html',
    'property-finding.html', 'concierge.html', 'deal-assistance.html', 'virtual-viewing.html'];
  const scoperte = aMano.filter((f) => !PAGES[f] || PAGES[f].manualHead !== true);
  check(!scoperte.length, 'le 8 pagine con la testa scritta a mano hanno manualHead: true', scoperte.join(', '));
  check(/noindex/i.test((PAGES['deals.html'] || {}).robots || '') && PAGES['deals.html'].skipSitemap === true,
    'deals.html (strumento interno) e\' noindex e fuori sitemap');
  check(/noindex/i.test((PAGES['apartment-detail.html'] || {}).robots || ''),
    'apartment-detail.html (guscio dinamico) e\' noindex');
  const conLB = Object.entries(PAGES).filter(([, c]) => (c.schemas || []).some((s) => s.split(':')[0] === 'LocalBusiness'));
  check(!(PAGES['index.html'].schemas || []).some((s) => /LocalBusiness/.test(s)) && !conLB.length,
    'nessuna pagina (index.html compresa) chiede un nodo LocalBusiness', conLB.map(([f]) => f).join(', '));
  check(!(PAGES['faq.html'].schemas || []).some((s) => s.split(':')[0] === 'FAQPage'),
    'faq.html non riceve il FAQPage generico della home (il suo lo deriva faq-schema.mjs)');

  const DATE = {
    'blog-47-steps.html': '2026-02-26', 'blog-contract-types.html': '2026-03-01',
    'blog-cost-calculator.html': '2026-02-26', 'blog-neighborhood-guide.html': '2026-02-26',
    'blog-scam-bible.html': '2026-02-26', 'blog-tenant-rights.html': '2026-02-27',
    'blog-visa-residency.html': '2026-03-01',
  };
  const date = Object.entries(DATE).filter(([f, p]) => {
    const a = (PAGES[f] || {}).article || {};
    return a.datePublished !== p || a.dateModified !== '2026-10-15';
  });
  check(!date.length, 'le date dei sette articoli sono quelle pubblicate (modifica 2026-10-15)', date.map(([f]) => f).join(', '));
}

// ── 3 · ANTI-DERIVA: il generatore eseguito davvero, in una copia ──────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'seogen-'));
try {
  for (const d of ['scripts', 'js']) fs.cpSync(path.join(R, d), path.join(TMP, d), { recursive: true });
  for (const f of ['blog-47-steps.html', 'index.html', 'sitemap.xml']) fs.copyFileSync(path.join(R, f), path.join(TMP, f));

  const run = (args) => spawnSync(process.execPath, args, { cwd: TMP, encoding: 'utf8' });
  const gen = run(['scripts/seo-update.js', 'blog-47-steps']);
  check(gen.status === 0, 'seo-update.js blog-47-steps gira nella copia', (gen.stderr || '').slice(0, 300));

  const pub = nodiJsonLd(read('blog-47-steps.html'));
  const out = nodiJsonLd(fs.readFileSync(path.join(TMP, 'blog-47-steps.html'), 'utf8'));
  check(!out.errori.length, 'ogni JSON-LD generato e\' JSON valido', out.errori.join('; '));

  const bpPub = pub.nodi.find((n) => n['@type'] === 'BlogPosting') || {};
  const bpOut = out.nodi.find((n) => n['@type'] === 'BlogPosting') || {};
  for (const k of ['@id', 'author', 'datePublished', 'dateModified']) {
    const a = JSON.stringify(bpOut[k]), b = JSON.stringify(bpPub[k]);
    check(a !== undefined && a === b, `BlogPosting.${k}: generato = pubblicato`, `${a} ≠ ${b}`);
  }
  const oPub = orgDi(pub.nodi)[0] || {}, oOut = orgDi(out.nodi);
  check(oOut.length === 1, 'un solo nodo #organization nell\'output', `${oOut.length}`);
  for (const [k, get] of [
    ['legalName', (o) => o.legalName],
    ['vatID', (o) => o.vatID],
    ['streetAddress', (o) => (o.address || {}).streetAddress],
  ]) {
    const a = get(oOut[0] || {}), b = get(oPub);
    check(a !== undefined && a === b && a === ORG[k], `#organization.${k}: generato = pubblicato = ${ORG[k]}`, `${a} ≠ ${b}`);
  }
  check(!out.nodi.some((n) => n['@type'] === 'LocalBusiness'), 'nessun LocalBusiness nell\'output del generatore');

  // Una testa scritta a mano non si tocca: index.html esce dalla copia identica.
  const home = run(['scripts/seo-update.js', 'index.html']);
  check(home.status === 0 && fs.readFileSync(path.join(TMP, 'index.html'), 'utf8') === read('index.html'),
    'una pagina con manualHead esce dal generatore byte per byte identica (nessuna seconda serie di entita\')');

  // ── 4 · la sitemap mantenuta a mano non si riscrive se perde URL ─────
  const prima = fs.readFileSync(path.join(TMP, 'sitemap.xml'), 'utf8');
  const sm = run(['scripts/seo-sitemap.js']);
  check(sm.status !== 0, 'seo-sitemap.js senza --force esce con errore se perderebbe <loc>',
    `exit ${sm.status}: ${(sm.stdout || '').slice(0, 120)}`);
  check(/hand-maintained; this run would drop \d+ URLs — use --force to override\./.test(sm.stderr || ''),
    'e dice quante URL perderebbe e come forzare', (sm.stderr || '').slice(0, 160));
  check(fs.readFileSync(path.join(TMP, 'sitemap.xml'), 'utf8') === prima, 'sitemap.xml resta intatta');
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

// ── 5 · le pagine noindex deployate portano l'entita' legale vera ─────
{
  const NOINDEX = ['404.html', 'login.html', 'onboarding.html', 'booking.html', 'client-portal.html',
    'form-landlord.html', 'form-tenant.html', 'owner-dashboard.html', 'pass-delivery.html',
    'pre-arrival.html', 'precheck.html', 'proppass.html', 'tenant.html', 'thank-you.html'];
  const guai = [];
  for (const f of NOINDEX) {
    const html = read(f);
    const { nodi, errori } = nodiJsonLd(html);
    if (errori.length) guai.push(`${f}: JSON-LD non valido`);
    if (/"legalName":\s*"BOOM Rome"/.test(html)) guai.push(`${f}: legalName BOOM Rome`);
    for (const o of orgDi(nodi)) {
      if (o.legalName !== ORG.legalName || o.vatID !== ORG.vatID || o.telephone !== ORG.telephone
        || (o.address || {}).streetAddress !== ORG.streetAddress || (o.address || {}).postalCode !== ORG.postalCode) {
        guai.push(`${f}: #organization incompleto`);
      }
    }
  }
  check(!guai.length, `le ${NOINDEX.length} pagine noindex deployate dichiarano Egidi Immobiliare S.r.l. con P.IVA, telefono e sede`,
    guai.join('; '));

  // Nessun tempo di risposta in cifre (decisione del fondatore, 15/10/2026).
  // thank-you.html e' dove atterra OGNI checkout pagato e il modulo contatti:
  // tests/verita guarda solo la sitemap, quindi queste pagine le guarda qui.
  // Il testo come lo legge chi la apre: visibile, attributi letti (meta
  // comprese), stringhe JSON-LD e i messaggi di alert().
  const TEMPI = /within \d+\s*(minutes?|hours?|h)\b|\b\d+\s*h\b|response time:\s*\d|under 2 minutes|24\/7/i;
  const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', ndash: '–', mdash: '—', euro: '€' };
  const dec = (t) => t.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] != null ? ENT[n.toLowerCase()] : m));
  const letto = (html) => {
    const parti = [];
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) parti.push(m[1]);
    for (const m of html.matchAll(/\balert\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) parti.push(m[2].replace(/\\(.)/g, '$1'));
    const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    for (const m of markup.matchAll(/\b(?:content|alt|title|aria-label|placeholder)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      parti.push(dec(m[1] != null ? m[1] : m[2]));
    }
    parti.push(dec(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' '));
    return parti.join('\n');
  };
  const promesse = [];
  for (const f of NOINDEX) {
    const m = letto(read(f)).match(TEMPI);
    if (m) promesse.push(`${f}: «${m[0]}»`);
  }
  check(TEMPI.test(letto('<p>We\'ll get back to you within <strong>2 hours</strong></p>'))
    && TEMPI.test(letto('<script>alert(\'We\\\'ll reply within 24 hours via WhatsApp.\')</script>'))
    && TEMPI.test(letto('<meta name="description" content="We respond within 24 hours.">')),
    'il rilevatore dei tempi di risposta riconosce testo, meta e alert()');
  check(!promesse.length, `nessuna delle ${NOINDEX.length} pagine noindex promette un tempo di risposta in cifre`,
    promesse.join('; '));
}

console.log(ko ? `  \x1b[31mIl generatore puo' ancora sbagliare\x1b[0m — ${ok} passed, ${ko} failed`
               : `  \x1b[32mIl generatore dice il vero\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
