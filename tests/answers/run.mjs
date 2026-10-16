// tests/answers/run.mjs — LE RISPOSTE CITABILI (giro GEO del 15/10/2026).
//
// Le pagine che un motore di risposta cita di più devono rispondere da sole,
// e il markup deve dire SOLO ciò che la pagina mostra:
//   · /meteo — il Dataset è completo e si risolve in pagina: chi lo crea è un
//     nodo VERO (nome + ragione sociale), tre variabili misurate coi nomi che
//     la pagina usa, la tecnica di misura copiata parola per parola dal
//     blocco «How it's measured», nessuna licenza (la pagina non ne dichiara
//     una), un solo BreadcrumbList che finisce sulla canonical;
//   · /welcome-to-rome — la guida virale ha la sua entità Article col titolo
//     uguale all'H1, e nessuna promessa «ARPE-certified» (BOOM registra i
//     contratti all'Agenzia delle Entrate; l'attestazione ARPE non è di ogni
//     contratto e non la rilasciamo noi);
//   · /moving-to-rome — risponde PRIMA di raccontare: il blocco #breve sta
//     subito dopo l'hero, cita la legge giusta e i suoi numeri di budget sono
//     QUELLI della tabella dei costi della pagina (copiati, mai riscritti);
//   · le quattro pagine «moving» portano la ragione sociale sul nodo
//     #organization.
// L'esempio di /canone è legato al motore in tests/conto (non qui).
//
// Mutazioni (verificate a mano su una copia, ANSWERS_ROOT=<copia>): togliere
// il creator o una variabile, aggiungere "license", duplicare il breadcrumb,
// rimettere «ARPE-certified», cambiare una cifra della tabella dei costi senza
// toccare #breve, spostare #breve dopo THE MONEY, togliere legalName da una
// pagina «moving» — ognuna fa cadere il check che la riguarda.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = process.env.ANSWERS_ROOT || join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => readFileSync(join(R, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + name + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 600) : '')); }
}
function section(t) { console.log('\n\x1b[1m▸ ' + t + '\x1b[0m'); }

const ORG = 'https://www.boomrome.com/#organization';
const LEGAL = 'Egidi Immobiliare S.r.l.';
const norm = t => String(t).replace(/\s+/g, ' ').trim();
const decode = t => t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');
// Il testo visibile: niente script, stili, commenti; i tag diventano spazi.
const visible = h => norm(decode(h.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')));
// Gli elementi in linea (b, em, a…) non spezzano le parole; gli altri tag sì.
const textOf = frag => norm(decode(frag.replace(/<\/?(?:b|i|em|strong|a|span|time|small)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ')));

// Tutti i blocchi JSON-LD → { blocks, bad, nodes } (i @graph appiattiti).
function ld(h) {
  const blocks = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const bad = [], nodes = [];
  for (const b of blocks) {
    let j; try { j = JSON.parse(b); } catch (e) { bad.push(e.message); continue; }
    for (const x of [].concat(j)) for (const n of (x['@graph'] || [x])) nodes.push(n);
  }
  return { blocks, bad, nodes };
}
const ofType = (nodes, t) => nodes.filter(n => [].concat(n['@type']).includes(t));
const byId = (nodes, id) => nodes.find(n => n['@id'] === id);
const canonicalOf = h => (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
const metaDesc = h => (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
const lastCrumb = bc => { const l = (bc && bc.itemListElement) || []; const x = l[l.length - 1]; return x && (typeof x.item === 'string' ? x.item : x.item && x.item['@id']); };

// ─────────────────────────────────────────────────────────────────────────
section('/meteo: un Dataset completo che si risolve in pagina');
{
  const h = read('meteo.html');
  const { blocks, bad, nodes } = ld(h);
  ok('ogni blocco JSON-LD parsa', blocks.length > 0 && bad.length === 0, bad);
  const ds = ofType(nodes, 'Dataset');
  ok('un solo Dataset', ds.length === 1, ds.length);
  const d = ds[0] || {};
  const cr = d.creator && (d.creator['@id'] ? byId(nodes, d.creator['@id']) : d.creator);
  ok('il creator del Dataset è un nodo in pagina con name e legalName', !!(cr && cr.name && cr.legalName === LEGAL), d.creator);
  const pub = d.publisher && byId(nodes, d.publisher['@id']);
  ok('anche il publisher si risolve sul nodo #organization', !!(pub && pub['@id'] === ORG && pub.legalName === LEGAL));
  ok('il nodo #organization porta vatID IT17322991005', !!(cr && cr.vatID === 'IT17322991005'));
  const vm = [].concat(d.variableMeasured || []);
  ok('variableMeasured ha 3 voci, ognuna con nome e unità', vm.length === 3 && vm.every(v => v['@type'] === 'PropertyValue' && v.name && v.unitText), vm);
  const vis = visible(h).toLowerCase();
  const notShown = vm.filter(v => !vis.includes(String(v.name).toLowerCase())).map(v => v.name);
  ok('i nomi delle variabili sono le parole che la pagina mostra', notShown.length === 0, notShown);
  ok('nessuna licenza dichiarata (la pagina non ne indica una)', !/"license"\s*:/.test(blocks.join(' ')));
  const mt = norm(d.measurementTechnique || '');
  const metodo = h.match(/<h2>How it's measured<\/h2>([\s\S]*?)<\/section>/);
  const metodoTxt = metodo ? textOf(metodo[1]) : '';
  ok('measurementTechnique = le prime due frasi di «How it\'s measured», parola per parola',
    mt.length > 40 && metodoTxt.startsWith(mt) && (mt.match(/[.!?](?=\s|$)/g) || []).length === 2, { mt, metodoTxt: metodoTxt.slice(0, 300) });
  ok('Dataset: inLanguage en, gratuito, Roma, parole chiave', d.inLanguage === 'en' && d.isAccessibleForFree === true
    && d.spatialCoverage && /Rome/.test(d.spatialCoverage.name) && Array.isArray(d.keywords) && d.keywords.length >= 3);
  const dist = [].concat(d.distribution || []);
  ok('la distribuzione punta alla porta dati /api/meteo (JSON)', dist.some(x => x.contentUrl === 'https://www.boomrome.com/api/meteo' && x.encodingFormat === 'application/json'));
  const bcs = ofType(nodes, 'BreadcrumbList');
  ok('un solo BreadcrumbList', bcs.length === 1, bcs.length);
  ok('il breadcrumb finisce sulla canonical', lastCrumb(bcs[0]) === canonicalOf(h), [lastCrumb(bcs[0]), canonicalOf(h)]);
  const wp = ofType(nodes, 'WebPage')[0] || {};
  ok('la WebPage rimanda al breadcrumb e al publisher in pagina', !!(wp.breadcrumb && byId(nodes, wp.breadcrumb['@id'])) && wp.publisher && wp.publisher['@id'] === ORG && wp.inLanguage === 'en');
  const site = ofType(nodes, 'WebSite')[0];
  ok('il WebSite richiamato da isPartOf è in pagina', !!(site && wp.isPartOf && wp.isPartOf['@id'] === site['@id']));
}

// ─────────────────────────────────────────────────────────────────────────
section('/welcome-to-rome: la guida ha un Article, e nessuna promessa ARPE');
{
  const h = read('welcome-to-rome.html');
  const { blocks, bad, nodes } = ld(h);
  ok('ogni blocco JSON-LD parsa', blocks.length > 0 && bad.length === 0, bad);
  const h1 = textOf((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  const arts = ofType(nodes, 'Article');
  ok('un solo Article', arts.length === 1, arts.length);
  const a = arts[0] || {};
  ok('headline dell\'Article = il testo dell\'H1', !!h1 && norm(a.headline || '') === h1, [a.headline, h1]);
  ok('description dell\'Article = la meta description', a.description === decode(metaDesc(h) || ''), [a.description, metaDesc(h)]);
  const wp = a.mainEntityOfPage && byId(nodes, a.mainEntityOfPage['@id']);
  ok('mainEntityOfPage si risolve sulla WebPage, che porta la canonical', !!(wp && wp.url === canonicalOf(h)), a.mainEntityOfPage);
  const title = norm(decode((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''));
  ok('la WebPage si chiama come il <title>', !!wp && wp.name === title, [wp && wp.name, title]);
  const au = a.author && byId(nodes, a.author['@id']), pu = a.publisher && byId(nodes, a.publisher['@id']);
  ok('author e publisher = il nodo #organization in pagina, con la ragione sociale', !!(au && pu && au === pu && au['@id'] === ORG && au.legalName === LEGAL && au.address && au.address.streetAddress === 'Via dei Coronari 181/184'));
  ok('Article: dateModified della release, in inglese, gratuito', a.dateModified === '2026-10-15' && a.inLanguage === 'en' && a.isAccessibleForFree === true);
  const img = a.image && (a.image.url || a.image);
  ok('l\'immagine dell\'Article è la og della pagina', img === (h.match(/<meta property="og:image" content="([^"]+)"/) || [])[1], img);
  const sp = (wp && wp.speakable && wp.speakable.cssSelector) || [];
  ok('speakable punta a nodi che esistono (h1, .lede)', sp.length > 0 && sp.every(s => s === 'h1' ? /<h1[\s>]/.test(h) : new RegExp('class="[^"]*\\b' + s.replace(/^\./, '') + '\\b').test(h)), sp);
  const bcs = ofType(nodes, 'BreadcrumbList');
  ok('un solo BreadcrumbList, che finisce sulla canonical', bcs.length === 1 && lastCrumb(bcs[0]) === canonicalOf(h), [bcs.length, lastCrumb(bcs[0])]);
  ok('nessun «ARPE-certified», né in pagina né nel markup', !/ARPE-certified/i.test(h));
  ok('la registrazione è detta per quello che è: all\'Agenzia delle Entrate', /Every BOOM lease is registered with the Agenzia delle Entrate/.test(visible(h)));
  ok('la data visibile è quella della release', /Updated October 2026/.test(visible(h)));
}

// ─────────────────────────────────────────────────────────────────────────
section('/moving-to-rome: prima la risposta, coi numeri della pagina');
{
  const h = read('moving-to-rome.html');
  const m = h.match(/<section class="breve" id="breve"[\s\S]*?<\/section>/);
  ok('#breve esiste', !!m);
  const b = m ? m[0] : '';
  const bt = textOf(b);
  ok('#breve cita la legge del transitorio (L. 431/1998) e il tetto del deposito', bt.includes('L. 431/1998') && bt.includes("three months' rent") && bt.includes('L. 392/1978'), bt.slice(0, 200));
  const iHero = h.indexOf('<header class="hero">'), iBreve = h.indexOf('id="breve"'), iMoney = h.indexOf('THE MONEY');
  ok('#breve sta subito dopo l\'hero e prima di THE MONEY', iHero > 0 && iBreve > iHero && iMoney > iBreve && !/<section/.test(h.slice(h.indexOf('</header>', iHero), iBreve).replace(/<section class="breve"/, '')));
  const dd = textOf((b.match(/<dt>Budget<\/dt><dd>([\s\S]*?)<\/dd>/) || [])[1] || '');
  const row = name => (h.match(new RegExp('<tr><td><b>' + name.replace(/[+]/g, '\\+') + '</b></td><td class="pr">([^<]+)</td>')) || [])[1];
  const rows = ['Studio', '1 bedroom', '2 bedrooms', 'Utilities + wifi'].map(n => [n, row(n)]);
  ok('la tabella dei costi ha le quattro righe', rows.every(([, v]) => !!v), rows);
  const missing = rows.filter(([, v]) => !v || !dd.includes(v)).map(([n, v]) => n + ': ' + v);
  ok('le cifre del budget in #breve sono quelle della tabella della pagina', !!dd && missing.length === 0, { missing, dd });
  const qual = (h.match(/<tr><th>Home<\/th><th>([^<]+)<\/th>/) || [])[1];
  ok('e portano lo stesso qualificatore della tabella («' + qual + '»)', !!qual && dd.startsWith(qual), dd.slice(0, 80));
  const dts = [...b.matchAll(/<dt>([^<]+)<\/dt>/g)].map(x => x[1]);
  ok('#breve risponde alle sei domande (documenti, contratto, registrazione, deposito, budget, prima di pagare)',
    ['Documents', 'Which contract', 'Registration', 'Deposit', 'Budget', 'Before you pay'].every(x => dts.includes(x)), dts);
  ok('#breve porta la data della release', /<time datetime="2026-10-15">15 October 2026<\/time>/.test(b));
  ok('#breve ha i suoi stili in pagina', /\.breve\s*\{/.test(h) && /\.breve dl\s*\{/.test(h));
  ok('il link interno di #breve punta a una pagina che esiste', [...b.matchAll(/href="\/([a-z0-9-]+)"/g)].every(x => { try { read(x[1] + '.html'); return true; } catch { return false; } }));
}

// ─────────────────────────────────────────────────────────────────────────
section('le pagine «moving»: la ragione sociale sul nodo #organization');
for (const f of ['moving-to-rome.html', 'moving-to-rome-from-us.html', 'moving-to-rome-from-uk.html', 'moving-to-rome-from-germany.html']) {
  const h = read(f);
  const { blocks, bad, nodes } = ld(h);
  const orgs = nodes.filter(n => n['@id'] === ORG);
  ok(`${f}: JSON-LD valido, #organization con legalName «${LEGAL}»`, blocks.length > 0 && bad.length === 0 && orgs.length >= 1 && orgs.every(o => o.legalName === LEGAL), { bad, legal: orgs.map(o => o.legalName) });
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${pass} ok, ${fail} ko\x1b[0m`);
if (fail) process.exitCode = 1;
