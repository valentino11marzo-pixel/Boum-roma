// tests/blog/core.mjs — il nucleo del blog: tre articoli e l'indice.
//
// Suite `blogcore`. Nata dal giro GEO/SEO del 15/10/2026 (pacchetto P1-13),
// dove su queste quattro pagine si sono trovati difetti che un motore di
// risposta avrebbe CITATO, non solo indicizzato:
//
// 1. UN ERRORE DI DIRITTO. /blog-contract-types diceva che un contratto non
//    registrato e' «voidable» (annullabile). La legge dice NULLO: art. 1,
//    c. 346, L. 311/2004 («sono nulli se, ricorrendone i presupposti, non
//    sono registrati»). Annullabile e nullo sono due regimi diversi, e la
//    frase sbagliata e' esattamente quella che un'AI riporta a chi chiede.
//
// 2. UN NUMERO CHE IL CODICE NON INCASSA. Il calcolatore dei costi metteva
//    nella commissione «1 mese + IVA» (canone × 1,22), mentre la regola che
//    il server applica davvero (api/preagreement/create.js, default feePct
//    10 e feeVatPct 22) e' il 10% di un anno di canone + IVA 22%, una volta.
//    La regola si verifica ESEGUENDO lo script della pagina, non cercando
//    una stringa: una formula riscritta in altra forma passa, una sbagliata
//    no.
//
// 3. STATISTICHE MAI MISURATE. «2min Avg Response», «500+ Clients Helped»,
//    «within 10 days», «all-in prices»: promesse senza una misura dietro.
//    La decisione del fondatore (15/10) e' piu' severa del piano: nessuna
//    promessa NUMERICA di risposta, quindi nemmeno «<2h».
//
// 4. DUE ENTITA' PER PAGINA. Ogni articolo dichiarava un `Article` scritto a
//    mano (autore «BOOM by Egidi…», editore «BOOM Rome Rentals», date
//    diverse) accanto al `BlogPosting` generato; l'indice due `Blog` con due
//    editori. Ora: un'entita' sola, con @id, autore = #organization, date
//    uguali ai meta e una data «Updated» VISIBILE uguale a dateModified.
//
// Run: node tests/blog/core.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, why = '') => (cond ? bene(t) : male(t + (why ? ' — ' + why : '')));

console.log('\n\x1b[1m▸ blogcore\x1b[0m  contract-types, cost-calculator, visa-residency e l\'indice del blog');

const SITE = 'https://www.boomrome.com';
const ORG = SITE + '/#organization';
const BLOG = SITE + '/blog#blog';
const RELEASE = '2026-10-15';
// Date di prima pubblicazione confermate dal fondatore (15/10/2026).
const POSTS = {
  'blog-contract-types.html': '2026-03-01',
  'blog-cost-calculator.html': '2026-02-26',
  'blog-visa-residency.html': '2026-03-01',
};
const ARTICLE = new Set(['Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'Report', 'ScholarlyArticle']);

const jsonld = (s, f) => {
  const nodi = [];
  for (const m of s.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1]); } catch (e) { male(`${f}: JSON-LD che non parsa (${e.message})`); continue; }
    for (const n of [].concat(d['@graph'] || d)) nodi.push(n);
  }
  return nodi;
};
const tipi = (n) => [].concat(n['@type'] || []);
const meta = (s, prop) => (s.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`)) || [])[1] || '';
const body = (s) => s.slice(s.indexOf('</head>'));
const testo = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

// ── 1 · ogni articolo: un'entita' sola, datata e attribuita ─────────────
for (const [f, pubblicato] of Object.entries(POSTS)) {
  const s = read(f);
  const canon = (s.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  const nodi = jsonld(s, f);
  const art = nodi.filter((n) => tipi(n).some((t) => ARTICLE.has(t)));
  check(art.length === 1, `${f}: un solo nodo della famiglia Article`,
    `ne trovo ${art.length} (${art.map((n) => tipi(n).join('/')).join(', ')})`);
  const a = art[0] || {};
  check(canon && a['@id'] === canon + '#article', `${f}: @id = <canonical>#article`, `@id=${a['@id']} canonical=${canon}`);
  check(a.author && a.author['@id'] === ORG && Object.keys(a.author).length === 1,
    `${f}: autore = #organization (riferimento, non un'organizzazione inventata)`, JSON.stringify(a.author));
  check(a.publisher && a.publisher['@id'] === ORG, `${f}: editore = #organization`, JSON.stringify(a.publisher));
  check(a.inLanguage === 'en', `${f}: inLanguage "en"`, String(a.inLanguage));
  check(a.isPartOf && a.isPartOf['@id'] === BLOG, `${f}: isPartOf ${BLOG}`, JSON.stringify(a.isPartOf));
  const pubMeta = meta(s, 'article:published_time');
  const modMeta = meta(s, 'article:modified_time');
  check(a.datePublished === pubMeta && pubMeta === pubblicato,
    `${f}: datePublished = meta = ${pubblicato}`, `jsonld=${a.datePublished} meta=${pubMeta}`);
  check(a.dateModified === modMeta && modMeta === RELEASE,
    `${f}: dateModified = meta = ${RELEASE}`, `jsonld=${a.dateModified} meta=${modMeta}`);
  // La data «Updated» deve stare nel corpo, sotto il titolo, dentro un <time>.
  const hero = (body(s).match(/<header class="hero">([\s\S]*?)<\/header>/) || [])[1] || '';
  const tempi = [...hero.matchAll(/<time datetime="([^"]+)">([^<]+)<\/time>/g)];
  check(tempi.length === 1 && tempi[0][1] === a.dateModified,
    `${f}: <time> visibile nel titolo = dateModified`, tempi.map((t) => t[1]).join(',') || 'nessun <time> nel titolo');
  check(/class="hero-by"[^>]*>By BOOM · Egidi Immobiliare S\.r\.l\. · Updated </.test(hero),
    `${f}: firma visibile «By BOOM · Egidi Immobiliare S.r.l.»`);
  check(/\.hero-by\s*\{[^}]*font-size:12px/.test(s), `${f}: la firma ha il suo stile`);
}

// ── 2 · l'indice: un Blog solo, che elenca i suoi articoli ──────────────
{
  const f = 'blog.html';
  const s = read(f);
  const blog = jsonld(s, f).filter((n) => tipi(n).includes('Blog'));
  check(blog.length === 1, `${f}: un solo nodo Blog`, `ne trovo ${blog.length}`);
  const b = blog[0] || {};
  check(b['@id'] === BLOG, `${f}: @id ${BLOG}`, String(b['@id']));
  check(b.inLanguage === 'en', `${f}: inLanguage "en"`);
  check(b.publisher && b.publisher['@id'] === ORG, `${f}: editore = #organization`, JSON.stringify(b.publisher));
  const refs = [].concat(b.blogPost || []).map((p) => p && p['@id']);
  check(refs.length === 7 && new Set(refs).size === 7, `${f}: 7 blogPost, tutti diversi`, `${refs.length}`);
  // I riferimenti si DEDUCONO dalle card dell'indice, non da una lista a mano.
  const linkati = [...new Set([...body(s).matchAll(/href="\/(blog-[a-z0-9-]+)"/g)].map((m) => m[1]))];
  const attesi = linkati.map((x) => `${SITE}/${x}#article`).sort();
  check(JSON.stringify([...refs].sort()) === JSON.stringify(attesi),
    `${f}: blogPost = gli articoli che l'indice mostra`, `refs=${refs.length} card=${linkati.length}`);
  // Ogni riferimento punta a un nodo che esiste davvero nella sua pagina.
  const orfani = [];
  for (const slug of linkati) {
    const file = slug + '.html';
    if (!fs.existsSync(path.join(R, file))) { orfani.push(`${file} non esiste`); continue; }
    const p = read(file);
    const ids = jsonld(p, file).filter((n) => tipi(n).some((t) => ARTICLE.has(t))).map((n) => n['@id']);
    if (!ids.includes(`${SITE}/${slug}#article`)) orfani.push(`${file} non dichiara ${slug}#article`);
  }
  check(!orfani.length, `${f}: ogni blogPost risolve a un articolo con quell'@id`, orfani.join(' · '));
}

// ── 3 · nessuna statistica non misurata, nessuna promessa numerica ──────
{
  const FILES = [...Object.keys(POSTS), 'blog.html'];
  const VIETATE = ['voidable', '500+', '2min', 'within 10 days', 'all-in prices', '1mo+VAT',
    'Avg Response', '24/7', 'within 2 hours', 'Response within', 'within a few hours', '10-Day Delivery',
    '&lt;2h', '&euro;2,000&ndash;4,000', 'pays for itself', 'hundreds of', 'client experiences'];
  const trovate = [];
  for (const f of FILES) {
    const s = read(f);
    for (const v of VIETATE) if (s.includes(v)) trovate.push(`${f} → «${v}»`);
  }
  check(!trovate.length, 'nessuna statistica non misurata e nessuna promessa di risposta numerica', trovate.join(' · '));
  // La promessa del Property Finding e' quella dei Termini §4.2: ogni
  // termine in giorni dentro la sua card e' 15, mai un altro numero.
  for (const f of Object.keys(POSTS)) {
    const b = body(read(f));
    const card = [...b.matchAll(/upsell-tag">Property Finding<\/div>([\s\S]*?)upsell-cta-row/g)].map((m) => m[1]).join(' ');
    if (!card) continue;
    const giorni = [...card.matchAll(/(\d+)[\s-]?days?\b/gi)].map((m) => +m[1]);
    check(giorni.every((g) => g === 15), `${f}: Property Finding promette i 15 giorni dei Termini §4.2`, giorni.join(','));
  }
  {
    const s = read('blog-cost-calculator.html');
    check(/at least 3 options matching your written brief within 15 days, or the &#8364;350 back/.test(s),
      'blog-cost-calculator: «at least 3 options … within 15 days, or the €350 back»');
  }
}

// ── 4 · il diritto: un contratto non registrato e' NULLO ────────────────
{
  const s = read('blog-contract-types.html');
  check(/An unregistered contract is null \(art\. 1, c\. 346, L\. 311\/2004\)/.test(s),
    'blog-contract-types: «null (art. 1, c. 346, L. 311/2004)»');
  // Revisione del 15/10: le frasi che i modelli BOOM (js/contract-pdf.js) e
  // la legge citata NON sostengono, e che un motore riporterebbe tali e quali.
  // Ogni voce dice quale clausola la smentisce.
  const SMENTITE = [
    ['right to demand', 'nessun articolo da al conduttore il diritto di «pretendere» un contratto lungo (Allegato B art. 3: riconduzione)'],
    ['this is <strong>illegal</strong>', 'un nuovo transitorio con esigenza vera e documentata e lecito'],
    ['tied to 75% of the ISTAT', 'sul 4+4 l\'aggiornamento ISTAT vale solo se il contratto lo prevede'],
    ['Your rent is frozen', 'la rinuncia all\'ISTAT dura quanto l\'opzione cedolare (MODEL_A art. 5, MODEL_C art. 6)'],
    ['guarantee of no increases', 'idem: il locatore puo uscire dalla cedolare'],
    ['for the entire contract duration', 'idem'],
    ['Auto if enrolled', 'MODEL_C art. 1: rinnovo automatico salvo disdetta del conduttore, senza condizione di iscrizione'],
    ['Automatically renews if the student', 'idem'],
    ['Parents can co-sign', 'MODEL_C art. 4: «altre forme di garanzia», non una co-firma'],
    ['Free / capped', 'Allegato B art. 4: a Roma il canone del transitorio segue l\'Accordo'],
    ['technically illegal but rarely challenged', 'affermazione non misurata che invita ad accettare un contratto non conforme'],
    ['Without it, leaving early can mean paying remaining rent', 'art. 3, c. 6, L. 431/1998: recesso per gravi motivi sempre ammesso'],
    ['Hard for landlord to evict', 'lo sfratto per morosita resta sempre possibile'],
    ['while you figure things out', 'un transitorio senza esigenza vera contraddice Allegato B artt. 2-3'],
    ["Some Municipi won't grant residenza", 'non verificabile; la residenza segue la dimora abituale'],
  ];
  for (const [frase, perche] of SMENTITE) check(!s.includes(frase), `blog-contract-types: niente «${frase}»`, perche);
  check(/brought back to the 4\+4 duration of art\. 2, c\. 1, L\. 431\/1998/.test(s),
    'blog-contract-types: la trappola del transitorio cita la riconduzione (Allegato B art. 3)');
  check(/art\. 3, c\. 6, L\. 431\/1998/.test(s), 'blog-contract-types: il recesso per gravi motivi cita art. 3, c. 6, L. 431/1998');
  // Con BOOM si affitta da 3 mesi in su (decisione del fondatore, 15/10/2026).
  // La guida spiega la LEGGE (il transitorio ammette da 1 a 18 mesi), ma dove
  // la dice dice anche il minimo BOOM, nello stesso paragrafo: chi la legge
  // non deve uscirne con «BOOM affitta da un mese». La regola di classe e' in
  // tests/verita; qui i tre punti della guida che la dicono.
  check(/A transitorio instead lasts 1–18 months by law \(with BOOM, at least 3 months\)/.test(s)
    && /1&ndash;18 months by law; 3&ndash;18 with BOOM/.test(s)
    && /By law, minimum 1 month and maximum 18 months; with BOOM the minimum is 3 months\./.test(s)
    && !/<p>Minimum 1 month/.test(s),
    'blog-contract-types: dove dice i 1–18 mesi di legge dice anche il minimo BOOM di 3 mesi (risposta breve, tabella, scheda)');
}

// ── 4b · la guida visti: date oneste, niente numeri non verificati ──────
{
  const s = read('blog-visa-residency.html');
  const SMENTITE = [
    ['as of early 2026', 'la firma dice «Updated 15 October 2026»: la pagina non puo contraddirsi sulla data'],
    ['legally equivalent to the permesso', 'la ricevuta non vale per i viaggi come il permesso, soprattutto al primo rilascio'],
    ['For Schengen travel, carry both', 'idem'],
    ['7% for 10 years', 'l\'aliquota 7% e per i pensionati esteri, non per i nomadi digitali'],
    ['The fine can reach', 'cifra non verificata nel repo'],
    ['slight delays are tolerated', 'consiglio a sforare un termine di legge'],
    ['at least 12 months', 'la residenza non dipende da una durata minima del contratto'],
    ['Self-employed: voluntary enrollment', 'chi lavora in Italia e versa contributi non paga l\'iscrizione al SSN'],
    ['rarely enforce', 'affermazione non misurata'],
  ];
  for (const [frase, perche] of SMENTITE) check(!s.includes(frase), `blog-visa-residency: niente «${frase}»`, perche);
}

// ── 5 · la verifica da €49 sta sotto la risposta, al prezzo del catalogo ─
{
  const { CATALOG } = await import(path.join(R, 'api/_catalog.js'));
  const s = read('blog-contract-types.html');
  const b = body(s);
  const iCta = b.indexOf('href="/contract-check-express"');
  const iProse = b.indexOf('class="prose"');
  const iAnswer = b.indexOf('class="answer-box"');
  check(iCta > -1 && iProse > -1 && iCta < iProse, 'blog-contract-types: /contract-check-express prima del primo paragrafo',
    `cta=${iCta} prose=${iProse}`);
  check(iAnswer > -1 && iAnswer < iCta, 'blog-contract-types: …e subito DOPO la risposta breve', `answer=${iAnswer} cta=${iCta}`);
  const early = (b.match(/<section class="bconv bconv-early"[\s\S]*?<\/section>/) || [''])[0];
  const prezzi = [...testo(early).matchAll(/€\s?(\d+)/g)].map((m) => +m[1]);
  const cce = CATALOG['contract-check-express'].eur;
  check(early && prezzi.length && prezzi.every((p) => p === cce),
    `blog-contract-types: il blocco in alto dice €${cce} come api/_catalog.js`, `prezzi=${prezzi.join(',')}`);
  check(/credited in full if you upgrade to Deal Assistance/.test(early) && /Credited in full if you upgrade to Deal Assistance/.test(CATALOG['contract-check-express'].desc),
    'blog-contract-types: «credited in full» e\' la stessa promessa del catalogo');
  check(/\.bconv\.bconv-early\s*\{/.test(s), 'blog-contract-types: il blocco in alto ha il suo stile compatto');
  // Il blocco di fine pagina resta, e i suoi prezzi sono quelli del catalogo.
  const fine = [...b.matchAll(/<section class="bconv">[\s\S]*?<\/section>/g)].map((m) => m[0]).pop() || '';
  const pf = [...testo(fine).matchAll(/€\s?(\d+)/g)].map((m) => +m[1]);
  const ammessi = new Set([CATALOG['contract-check-express'].eur, CATALOG['deal-assistance'].eur]);
  check(fine && pf.length && pf.every((p) => ammessi.has(p)), 'blog-contract-types: il blocco finale resta, coi prezzi del catalogo',
    `prezzi=${pf.join(',')}`);
}

// ── 6 · il calcolatore usa la commissione VERA, IVA compresa ────────────
// Si esegue lo script della pagina con un DOM minimo: conta cio' che il
// lettore vede, non la forma in cui la formula e' scritta.
{
  const f = 'blog-cost-calculator.html';
  const s = read(f);
  const script = [...body(s).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((x) => /function calc\(/.test(x));
  check(!!script, `${f}: trovo lo script del calcolatore`);
  if (script) {
    const el = {};
    const nodo = (id) => (el[id] ||= {
      id, value: '', textContent: '', innerHTML: '', className: '', dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {} }, appendChild() {},
    });
    const document = {
      getElementById: nodo,
      createElement: () => nodo('_' + Math.random()),
      querySelectorAll: () => [],
    };
    const prova = (budget, rooms) => {
      for (const k of Object.keys(el)) delete el[k];
      nodo('budget').value = String(budget);
      nodo('rooms').value = String(rooms);
      const ctx = { document, gtag() {}, Math, console };
      vm.runInNewContext(script, ctx);
      // zona di default: Trastevere (indice 1), concordato
      const z = ctx.zones[ctx.selZone];
      const rent = Math.min(Math.max(budget, z.concordato[0]), z.concordato[1]);
      const atteso = Math.round(rent * 12 * 0.10 * 1.22);
      const grid = el['y1-grid'].innerHTML;
      const voce = grid.match(/Agency Fee \(([^)]*)\)<\/div><div class="y1-item-val">€([\d.,\s ]+)</);
      const mostrato = voce ? +voce[2].replace(/[^\d]/g, '') : NaN;
      return { rent, atteso, mostrato, etichetta: voce ? voce[1] : '' };
    };
    for (const [b, r] of [[1200, 2], [900, 1], [600, 3]]) {
      const x = prova(b, r);
      check(x.mostrato === x.atteso,
        `${f}: commissione = 10% di un anno + IVA (canone €${x.rent} → €${x.atteso})`, `mostrato €${x.mostrato}`);
    }
    const x = prova(1200, 2);
    check(x.etichetta === "10% of a year's rent + VAT", `${f}: l'etichetta dice la regola`, x.etichetta);
    // La forma esatta conta meno del risultato (verificato sopra), ma la
    // riga deve restare leggibile come la regola: rent*12*0.10*1.22.
    check(/agencyFee\s*=\s*Math\.round\(\s*baseRent\s*\*\s*(?:12\s*\*\s*0?\.10?|1\.2)\s*\*\s*1\.22\s*\)/.test(script),
      `${f}: la formula nel sorgente e' Math.round(rent*12*0.10*1.22)`);
  }
  check(/every price to the euro/.test(s), `${f}: «every price to the euro» al posto di «all-in prices»`);
}

// ── 7 · #organization e' la societa' vera, ovunque ──────────────────────
{
  const sbagliate = [];
  for (const f of [...Object.keys(POSTS), 'blog.html']) {
    const org = jsonld(read(f), f).filter((n) => n['@id'] === ORG);
    if (org.length !== 1) { sbagliate.push(`${f}: ${org.length} nodi #organization`); continue; }
    const o = org[0];
    const a = o.address || {};
    const giusto = o.legalName === 'Egidi Immobiliare S.r.l.' && o.vatID === 'IT17322991005'
      && o.telephone === '+39-331-325-1961' && a.streetAddress === 'Via dei Coronari 181/184'
      && a.postalCode === '00186' && a.addressLocality === 'Roma' && a.addressRegion === 'RM'
      && a.addressCountry === 'IT';
    if (!giusto) sbagliate.push(`${f}: ${JSON.stringify({ legalName: o.legalName, vatID: o.vatID, telephone: o.telephone, address: a })}`);
  }
  check(!sbagliate.length, '#organization = Egidi Immobiliare S.r.l. (P.IVA, telefono, sede di Via dei Coronari)', sbagliate.join(' · '));
}

console.log(ko ? `  \x1b[31mIl nucleo del blog non e in ordine\x1b[0m — ${ok} passed, ${ko} failed`
               : `  \x1b[32mIl nucleo del blog e in ordine\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
