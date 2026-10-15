// tests/llms/run.mjs — llms.txt dice la verità e copre tutto il sito.
//
// llms.txt è il file che i motori di risposta leggono DIRETTAMENTE: una frase
// lì dentro diventa la risposta che un assistente dà a chi chiede «quanto
// costa affittare con BOOM?». Il giro GEO del 15/10/2026 ci ha trovato sei
// promesse che le pagine smentivano — prezzi «all-in», pin «building-exact»,
// un'«orbit» intorno al palazzo che la mappa non fa più, supporto «24/7»,
// «deposit protection» (il deposito lo tiene il proprietario), un «English-
// language lease» (il contratto è il modello ufficiale italiano, spiegato in
// inglese), il SEPA per i nuovi inquilini (chiuso) e le «distances shown on
// every listing» — più la commissione al 10% del canone annuo SENZA l'IVA che
// il codice (api/preagreement/create.js) poi addebita. E mancavano FAQ,
// soldi, prenotazione, guide, azienda e contatti: le pagine a cui un motore
// dovrebbe rimandare per prime.
//
// Le regole:
//  (a) nessuna delle frasi vietate (le sette del difetto + quelle della
//      guardia verita che valgono anche per llms.txt);
//  (b) ogni «10% of one year's / annual rent» porta l'IVA entro 120 caratteri;
//  (c) ogni URL https://www.boomrome.com/… è una <loc> della sitemap, o sta
//      nell'elenco esplicito (/llms-listings.txt, /api/meteo, varianti
//      ?lang= e ?role= di pagine della sitemap) — e mai il dominio nudo;
//  (d) ogni <loc> della sitemap (salvo /listing/*, /apartment-detail, /deals)
//      è linkata almeno una volta;
//  (e) le tre intestazioni che owners/executive/reunion estraggono sono
//      identiche (cambiarle spegne in silenzio le loro guardie);
//  (f) ogni riga che linka /<chiave del catalogo>) cita il prezzo del
//      catalogo (api/_catalog.js);
//  (g) l'ultima sezione è «## Optional» (llmstxt.org), e i fatti dell'azienda
//      e dei contatti ci sono;
//  (h) con BOOM si affitta da 3 mesi in su: i fatti chiave lo dicono, e
//      nessuna fascia BOOM parte da 1 mese (decisione del fondatore, 15/10).
//
// Ogni regola è una funzione pura sul testo: la stessa che giudica il file
// vero giudica anche una copia ROTTA apposta (in coda), e su quella deve
// fallire — una guardia che non morde è decorativa.
//
// Run: node tests/llms/run.mjs

import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else {
    fail++;
    const d = Array.isArray(detail) ? '\n      ' + detail.slice(0, 12).join('\n      ')
      + (detail.length > 12 ? `\n      … e altre ${detail.length - 12}` : '')
      : (detail !== undefined ? ' — ' + JSON.stringify(detail) : '');
    console.log(`  \x1b[31m✗ ${name}\x1b[0m${d}`);
  }
};

console.log('\n\x1b[1m▸ llmstxt\x1b[0m  llms.txt dice la verità e copre il sito');

const LLMS = read('llms.txt');
const SITEMAP = read('sitemap.xml');
const CATALOG = read('api/_catalog.js');

/* ── i dati di confronto ─────────────────────────────────────────────── */
const norm = (p) => {
  let s = (p || '/').split('#')[0];
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
};
const sitemapPaths = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => norm(m[1].trim().replace(/^https?:\/\/[^/]+/, '')));
const PRICES = {};
for (const m of CATALOG.matchAll(/'([a-z-]+)':\s*\{\s*eur:\s*(\d+)/g)) PRICES[m[1]] = m[2];

const ALLOW = new Set(['/llms-listings.txt', '/api/meteo']);
const QUERY_OK = /^\?(lang|role)=[a-z]+$/;
const NOT_REQUIRED = (p) => /^\/listing\//.test(p) || p === '/apartment-detail' || p === '/deals';

const PINNED = [
  '## BOOM for property owners in Rome (page in Italian, English toggle)',
  '## BOOM Executive (relocating professionals — and the companies that move them)',
  '## BOOM La Réunion (second market, page in French)',
];

/* (a) le frasi vietate. Le prime dieci sono il difetto di questo file; le
   altre sono le regole della guardia verita (tests/verita) che valgono su
   llms.txt: qui falliscono PRIMA, nel file che le ha introdotte. */
const BANNED = [
  [/\ball-in(clusive)?\b/i, 'prezzo «all-in»: il canone dice caso per caso se le utenze sono incluse'],
  [/building-exact/i, 'pin «building-exact»: la precisione del pin è dichiarata per pin (boom-geo)'],
  [/\borbit\b/i, '«orbit»: la Skyline non gira intorno al palazzo'],
  [/24\/7/, '«24/7»: una persona risponde in orario d\'ufficio (ora di Roma)'],
  [/60-second/i, '«60-second»: il check di idoneità dura 2 minuti'],
  [/English-language|English contracts?\b/i, 'contratto «in inglese»: è il modello ufficiale italiano, spiegato in inglese'],
  [/deposit protection/i, '«deposit protection»: il deposito lo tiene il locatore, BOOM no'],
  [/SEPA direct debit/i, 'SEPA: i nuovi mandati sono chiusi'],
  [/distances shown on every listing/i, 'distanze «su ogni annuncio»: solo dove il pin è mappato'],
  [/whichever is lower/i, '«whichever is lower»: la regola applicata è il 10% annuo + IVA'],
  [/500\+/, '«500+»: un numero mai contato'],
  [/under 2 minutes|2-minute average|Min response|respond in under/i, 'tempo di risposta promesso'],
  [/protected deposit|held safe with guarantees/i, 'deposito «protetto»'],
  [/in English and Italian|contracts? in English\b/i, 'contratto «in inglese»'],
  [/95% approval|Over 40%|70% of international|€80\/month|98% success|fully insured|€47K|Average savings/i, 'statistica mai misurata'],
  [/verified reviews/i, 'recensioni «verificate»'],
  [/Lawyer contract review|PayPal/i, 'servizio inesistente'],
  [/30 days(’|')? (written )?notice/i, 'preavviso di 30 giorni: non è quello dei contratti BOOM'],
  [/within 10 days|5\+ curated/i, 'promessa PFS vecchia (3 opzioni in 15 giorni, Terms §4.2)'],
  [/no broker fees|Zero hidden fees|Trusted by 500/i, 'slogan smentito dalla pagina'],
  [/voidable|concordato minimum/i, 'affermazione legale non verificata'],
  [/ARPE-certified/i, '«ARPE-certified»'],
  [/€150\/doc|€60\/mo|All 30 services|Airport Transfer|Mail Service/i, 'servizio concierge non in catalogo'],
  [/average client saves|€600\+/i, 'risparmio medio mai misurato'],
  // decisione del fondatore n. 3: nessun tempo di risposta in cifre (né «within
  // 2 hours», né «within one hour»). Gli SLA dei servizi («first review within
  // 24 hours», «scheduled within 48 hours») non sono risposte e non toccano.
  [/\b(repl(y|ies|ied)|respon(d|ds|se)|answer(s|ed)?)\b[^.\n]{0,40}\bwithin\s+(\d+|an?|one|two|few)\s*(minutes?|hours?|h)\b/i, 'tempo di risposta in cifre (decisione del fondatore n. 3)'],
  [/round[- ]the[- ]clock|24 hours a day|24\s*\/\s*7/i, 'supporto «round the clock»: una persona risponde in orario d\'ufficio'],
];
function ruleBanned(t) {
  const out = [];
  for (const [re, why] of BANNED) {
    const m = t.match(re);
    if (m) out.push(`«${m[0]}» — ${why}`);
  }
  return out;
}

/* (b) la commissione porta l'IVA: dopo ogni «10% of … rent», entro 120
   caratteri, deve comparire VAT/IVA (una cifra «+ VAT» nuda in un'altra
   frase non copre questa). */
function ruleFeeVat(t) {
  const out = [];
  for (const m of t.matchAll(/10% of (one year's|a year's|the annual|annual) rent/gi)) {
    const after = t.slice(m.index, m.index + m[0].length + 120);
    if (!/VAT|IVA/.test(after)) out.push('…' + t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 60).replace(/\n/g, ' ') + '…');
  }
  return out;
}

/* gli URL del sito: www sempre (l'apex fa un salto di redirect, e un motore
   che cita l'apex cita un URL che non è la canonical). */
function siteUrls(t) {
  return [...t.matchAll(/https?:\/\/(?:www\.)?boomrome\.com(?=[\s)\]>"'`,;]|$|\/|\?|#)[^\s)\]>"'`]*/g)]
    .map((m) => m[0].replace(/[.,;:]+$/, ''));
}

/* (c) ogni URL esiste nella sitemap o è dichiarato a parte */
function ruleUrlsKnown(t, sitemapXml) {
  const known = new Set(sitemapPaths(sitemapXml));
  const out = [];
  for (const u of siteUrls(t)) {
    if (!/^https:\/\/www\.boomrome\.com/.test(u)) { out.push(`${u} — non è https://www.boomrome.com (apex o http)`); continue; }
    const rest = u.replace(/^https:\/\/www\.boomrome\.com/, '');
    const qi = rest.indexOf('?');
    const p = norm(qi >= 0 ? rest.slice(0, qi) : rest);
    const q = qi >= 0 ? rest.slice(qi).split('#')[0] : '';
    if (q) {
      if (!(known.has(p) && QUERY_OK.test(q))) out.push(`${u} — query non ammessa (solo ?lang= / ?role= su una pagina della sitemap)`);
      continue;
    }
    if (!known.has(p) && !ALLOW.has(p)) out.push(`${u} — né nella sitemap né nell'elenco ammesso`);
  }
  return out;
}

/* (d) ogni pagina pubblica è linkata */
function ruleCoverage(t, sitemapXml) {
  const linked = new Set(siteUrls(t)
    .filter((u) => /^https:\/\/www\.boomrome\.com/.test(u))
    .map((u) => norm(u.replace(/^https:\/\/www\.boomrome\.com/, '').split('?')[0])));
  return sitemapPaths(sitemapXml).filter((p) => !NOT_REQUIRED(p) && !linked.has(p));
}

/* (e) le intestazioni che le altre suite estraggono */
function ruleHeadings(t) {
  const lines = new Set(t.split('\n'));
  return PINNED.filter((h) => !lines.has(h));
}

/* (f) il prezzo del catalogo sulla riga che linka il servizio */
function rulePrices(t) {
  const out = [];
  for (const line of t.split('\n')) {
    for (const [k, eur] of Object.entries(PRICES)) {
      if (line.includes('/' + k + ')') && !line.includes('€' + eur)) out.push(`${k} senza €${eur}: ${line.slice(0, 80)}…`);
    }
  }
  return out;
}

/* (g) struttura llmstxt.org e fatti dell'azienda */
function ruleStructure(t) {
  const out = [];
  const lines = t.split('\n');
  if (!/^# \S/.test(lines[0] || '')) out.push('la prima riga non è il titolo H1');
  if (!lines.some((l) => l.startsWith('> '))) out.push('manca il blockquote di sintesi');
  const h2 = lines.filter((l) => l.startsWith('## '));
  if (h2[h2.length - 1] !== '## Optional') out.push(`l'ultima sezione è «${h2[h2.length - 1]}», non «## Optional»`);
  for (const s of ['## Before you rent', '## Guides', '## Company', '## Contact']) {
    if (!lines.includes(s)) out.push(`manca la sezione «${s}»`);
  }
  return out;
}
const FACTS = [
  'Egidi Immobiliare S.r.l.', '17322991005', 'Via dei Coronari 181/184, 00186 Roma',
  '+39 331 325 1961', 'valentino@boom-rome.com', 'https://wa.me/393313251961',
  // le frasi che le altre suite pretendono (owners, executive, reunion)
  'does not sublet', '?role=owner', '?role=tenant', '?role=buyer', 'Hoguet', 'FAO', 'IFAD', '431/98',
  'boomrome.com/meteo',
];
const ruleFacts = (t) => FACTS.filter((f) => !t.includes(f));

/* (h) la durata: con BOOM si affitta da 3 mesi in su (decisione del
   fondatore, 15/10/2026). Il file presentava il transitorio come «1–18
   months» in tre punti e il pubblico come «medium term (1 to 12+ months)»:
   un assistente avrebbe risposto «sì» a «can I rent for one month with
   BOOM?». Ora i fatti chiave lo dicono in chiaro, ed e' la riga che un motore
   cita. La regola di classe, con l'eccezione di legge, e' in tests/verita:
   qui le forme che c'erano nel file che i motori leggono per primi. */
function ruleDurata(t) {
  const out = [];
  if (!/^- Lease length: 3 months minimum for every lease through BOOM in Rome\b/m.test(t)) out.push('i fatti chiave non dicono il minimo di 3 mesi');
  for (const m of t.matchAll(/\b1\s*(?:–|-|to)\s*1[28]\+?\s*months\b|\bfrom (?:one|1|a) month\b|\bone month up\b/gi)) out.push(`«${m[0]}»`);
  return out;
}

/* ── il file vero ────────────────────────────────────────────────────── */
let r;
r = ruleBanned(LLMS);
ok('(a) nessuna promessa che le pagine smentiscono (all-in, building-exact, orbit, 24/7, English-language lease, deposit protection, SEPA, …)', r.length === 0, r);
r = ruleFeeVat(LLMS);
ok('(b) ogni «10% of one year\'s / annual rent» porta l\'IVA entro 120 caratteri', r.length === 0, r);
const nFee = [...LLMS.matchAll(/10% of (one year's|a year's|the annual|annual) rent/gi)].length;
ok('    …e la commissione è davvero scritta (almeno due volte: il percorso e i fatti chiave)', nFee >= 2, nFee);
r = ruleUrlsKnown(LLMS, SITEMAP);
ok('(c) ogni URL del sito è una pagina della sitemap o un\'eccezione dichiarata', r.length === 0, r);
r = ruleCoverage(LLMS, SITEMAP);
ok('(d) ogni pagina della sitemap (salvo /listing/*, /apartment-detail, /deals) è linkata', r.length === 0, r);
r = ruleHeadings(LLMS);
ok('(e) le tre intestazioni lette da owners / executive / reunion sono identiche', r.length === 0, r);
r = rulePrices(LLMS);
ok('(f) ogni servizio del catalogo linkato cita il suo prezzo (api/_catalog.js)', r.length === 0, r);
ok('    …e il controllo morde: almeno quattro servizi del catalogo sono linkati',
  Object.keys(PRICES).filter((k) => LLMS.includes('/' + k + ')')).length >= 4);
r = ruleStructure(LLMS);
ok('(g) struttura llmstxt.org: H1, sintesi, Before you rent / Guides / Company / Contact, e «## Optional» in coda', r.length === 0, r);
r = ruleFacts(LLMS);
ok('    …i fatti dell\'azienda e dei contatti, e le frasi che le altre suite pretendono', r.length === 0, r);
r = ruleDurata(LLMS);
ok('(h) la durata: i fatti chiave dicono il minimo di 3 mesi, e nessuna fascia BOOM parte da 1 mese', r.length === 0, r);

/* ── le guardie mordono: ogni regola, su una copia rotta, deve fallire ── */
const firstUrl = (p) => `https://www.boomrome.com${p}`;
// una pagina linkata UNA volta sola, così toglierle il link la scopre davvero
const linkCount = (p) => siteUrls(LLMS).filter((u) => norm(u.replace(/^https:\/\/www\.boomrome\.com/, '').split('?')[0]) === p).length;
const someLinked = sitemapPaths(SITEMAP).find((p) => !NOT_REQUIRED(p) && p !== '/' && linkCount(p) === 1 && LLMS.includes(firstUrl(p) + ')'));
const catKey = Object.keys(PRICES).find((k) => LLMS.includes('/' + k + ')'));
const MUT = [
  ['(a) «24/7 WhatsApp support»', () => ruleBanned(LLMS + '\n- 24/7 WhatsApp support.')],
  ['(a) «transparent all-in pricing»', () => ruleBanned(LLMS + '\n- transparent all-in pricing')],
  ['(a) «English-language registered lease»', () => ruleBanned(LLMS + '\n- English-language registered lease')],
  ['(a) «A person replies within 2 hours»', () => ruleBanned(LLMS + '\n- A person replies within 2 hours.')],
  ['(a) «We answer within one hour»', () => ruleBanned(LLMS + '\n- We answer within one hour.')],
  ['(a) «Support round the clock»', () => ruleBanned(LLMS + '\n- Support round the clock on WhatsApp.')],
  ['(b) commissione senza IVA', () => ruleFeeVat(LLMS + '\n- agency fee of 10% of annual rent; no hidden costs, ever, at any point of the rental, from the first viewing to the last day of the lease.')],
  ['(c) URL inventato', () => ruleUrlsKnown(LLMS + '\n- [X](https://www.boomrome.com/pagina-che-non-esiste)', SITEMAP)],
  ['(c) dominio apex', () => ruleUrlsKnown(LLMS + '\n- [X](https://boomrome.com/faq)', SITEMAP)],
  ['(c) query qualsiasi', () => ruleUrlsKnown(LLMS + '\n- [X](https://www.boomrome.com/faq?utm=x)', SITEMAP)],
  ['(d) una pagina pubblica non più linkata', () => ruleCoverage(LLMS.split(firstUrl(someLinked) + ')').join('https://example.com/x)'), SITEMAP)],
  ['(e) intestazione owners ritoccata', () => ruleHeadings(LLMS.replace(PINNED[0], PINNED[0] + ' '))],
  ['(f) prezzo del catalogo cambiato sulla riga', () => rulePrices(LLMS.split('\n').map((l) => l.includes('/' + catKey + ')')
    ? l.split('€' + PRICES[catKey]).join('€' + (Number(PRICES[catKey]) + 1)) : l).join('\n'))],
  ['(g) Optional non più in coda', () => ruleStructure(LLMS + '\n## Extra\n- x')],
  ['(h) «medium term (1 to 12+ months)»', () => ruleDurata(LLMS.replace('(3 to 12+ months)', '(1 to 12+ months)'))],
  ['(h) il minimo di 3 mesi tolto dai fatti chiave', () => ruleDurata(LLMS.replace(/^- Lease length:.*\n/m, ''))],
];
const muti = MUT.filter(([, f]) => f().length === 0).map(([n]) => n);
ok(`ogni regola morde su una copia rotta (${MUT.length} mutazioni, tutte prese)`, muti.length === 0 && someLinked && catKey, muti);

console.log(fail ? `  \x1b[31mllms.txt non è ancora allineato\x1b[0m — ${pass} passed, ${fail} failed`
                 : `  \x1b[32mllms.txt dice la verità\x1b[0m — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
