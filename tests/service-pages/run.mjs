// tests/service-pages/run.mjs — suite `servicepages`
//
// LE PAGINE PRODOTTO DICONO AI MOTORI QUELLO CHE DICONO ALLE PERSONE.
//
// Il reperto (15/10/2026), pagina per pagina:
//  · property-finding: il FAQPage dichiarava cinque risposte scritte A PARTE —
//    «The €350 is fully refundable if we do not deliver a match. You risk
//    nothing.» — una parafrasi più larga della clausola vera (§4.2: almeno 3
//    opzioni nei criteri concordati entro 15 giorni, oppure il rimborso). E la
//    riga visibile del prezzo diceva «one month's rent or 10% of the annual
//    rent, whichever is lower», la regola che il sistema NON incassa
//    (api/preagreement/create.js: 10% di un anno di canone + IVA 22%).
//  · i sette nodi Service non avevano un @id: /services e la pagina stessa
//    non potevano dire «è QUESTO servizio», e un motore vedeva otto entità
//    sciolte invece di un catalogo collegato.
//  · concierge dichiarava highPrice €390 mentre la pagina dice che un
//    atterraggio completo PARTE da circa €390; /services lo dava come prezzo
//    piatto. E «a human answers within 2 hours» viola la decisione 3 del
//    fondatore (nessun tempo di risposta in cifre).
//  · 48 link interni con «.html»: ogni clic un 308 in più (cleanUrls).
//  · il controllo gratuito non portava alla scala a pagamento.
//
// Le regole leggono SOLO i file del pacchetto P0-09 (più api/_catalog.js e,
// in lettura, pacchetto-concordato.html per l'@id che /services cita).
// In coda ogni regola viene rieseguita su un campione SBAGLIATO e deve
// fallire: una guardia che non morde è decorativa.

import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, perche = '') => (cond ? bene(t) : male(t + (perche ? `\n      ${perche}` : '')));
const elenco = (righe, max = 12) => '\n      ' + righe.slice(0, max).join('\n      ')
  + (righe.length > max ? `\n      … e altre ${righe.length - max}` : '');
const leggi = (f) => fs.readFileSync(path.join(R, f), 'utf8');

const O = 'https://www.boomrome.com';
const ORG = O + '/#organization';
const LEGAL = 'Egidi Immobiliare S.r.l.';
const PRODOTTI = ['property-finding', 'virtual-viewing', 'deal-assistance', 'deposit-recovery',
  'contract-check-express', 'remote-move-pack', 'concierge'];
const ALTRE = ['services', 'contract-check', 'deposit-letter'];
const PAGINE = [...PRODOTTI, ...ALTRE];

console.log('\n\x1b[1m▸ servicepages\x1b[0m  le pagine prodotto: FAQ vera, entità collegate, prezzi onesti, link puliti');

// ── strumenti puri (riusati dalle mutazioni in coda) ───────────────────
// La normalizzazione è QUELLA del generatore del FAQPage: <br> → spazio,
// tag tolti, entità decodificate, spazi compressi. Non una «somiglianza»:
// l'uguaglianza esatta.
function decodifica(t) {
  return t
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&euro;/g, '€').replace(/&hellip;/g, '…')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}
const testo = (h) => decodifica(h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function blocchi(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { out.push(JSON.parse(m[1])); } catch (e) { out.push({ __rotto: e.message }); }
  }
  return out;
}
const nodi = (html) => blocchi(html).flatMap((d) => (d['@graph'] || [d]));
const canonical = (html) => (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';

// Le righe della console: domanda = span.r-q, risposta = p.r-lead + ogni
// p.r-det. Su property-finding, alla q8 si aggiunge la clausola §4.2 citata
// in pagina (il blockquote la cui <cite> nomina §4.2).
function righe(html, conClausola = false) {
  const out = [];
  for (const m of html.matchAll(/<details class="riga[^"]*" id="([a-z]\d+)"[^>]*>([\s\S]*?)<\/details>/g)) {
    const [, id, b] = m;
    const q = b.match(/<span class="r-q">([\s\S]*?)<\/span>/);
    const lead = b.match(/<p class="r-lead">([\s\S]*?)<\/p>/);
    if (!q || !lead) continue;
    const parti = [testo(lead[1])];
    for (const d of b.matchAll(/<p class="r-det">([\s\S]*?)<\/p>/g)) parti.push(testo(d[1]));
    if (conClausola && id === 'q8') {
      const c = [...b.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>\s*<cite>([\s\S]*?)<\/cite>/g)]
        .find((x) => /§4\.2/.test(x[2]));
      if (c) parti.push(testo(c[1]));
    }
    out.push({ id, q: testo(q[1]), a: parti.join(' ') });
  }
  return out;
}

// regola A: il Service della pagina ha @id <canonical>#service e il WebPage lo indica
function entitaServizio(html) {
  const guai = [];
  const can = canonical(html).replace(/\/$/, '');
  if (!can) return ['nessuna canonical'];
  const servizi = nodi(html).filter((n) => [].concat(n['@type'] || []).includes('Service'));
  if (servizi.length !== 1) guai.push(`${servizi.length} nodi Service (atteso 1)`);
  const sv = servizi[0];
  if (sv && sv['@id'] !== can + '#service') guai.push(`Service @id «${sv['@id']}» ≠ ${can}#service`);
  if (sv && !(sv.provider && sv.provider['@id'] === ORG)) guai.push('Service senza provider #organization');
  for (const w of nodi(html).filter((n) => [].concat(n['@type'] || []).includes('WebPage'))) {
    if (!(w.mainEntity && w.mainEntity['@id'] === can + '#service')) {
      guai.push(`WebPage senza mainEntity → ${can}#service`);
    }
  }
  return guai;
}

// regola B: ogni nodo #organization porta la ragione sociale vera
function organizzazione(html) {
  const guai = [];
  const org = nodi(html).filter((n) => n['@id'] === ORG);
  if (!org.length) guai.push('nessun nodo #organization');
  for (const n of org) {
    if (n.legalName !== LEGAL) guai.push(`legalName «${n.legalName}»`);
    if (n.vatID && n.vatID !== 'IT17322991005') guai.push(`vatID «${n.vatID}»`);
    if (n.address && n.address.streetAddress && n.address.streetAddress !== 'Via dei Coronari 181/184') {
      guai.push(`streetAddress «${n.address.streetAddress}»`);
    }
  }
  return guai;
}

// regola C: il FAQPage è, parola per parola, la riga visibile
function faqVera(html, conClausola = false) {
  const guai = [];
  const faq = nodi(html).filter((n) => n['@type'] === 'FAQPage');
  if (faq.length !== 1) return [`${faq.length} FAQPage (atteso 1)`];
  const vis = new Map(righe(html, conClausola).map((r) => [r.q, r.a]));
  for (const q of faq[0].mainEntity || []) {
    if (!vis.has(q.name)) { guai.push(`domanda che la pagina non pone: «${q.name}»`); continue; }
    if (vis.get(q.name) !== q.acceptedAnswer.text) {
      guai.push(`«${q.name}»: dichiarata ≠ visibile\n        dich: ${q.acceptedAnswer.text.slice(0, 110)}…\n        vis:  ${vis.get(q.name).slice(0, 110)}…`);
    }
  }
  return guai;
}

// regola D: nessun link interno «/x.html» (fuori dagli script)
function linkHtml(html) {
  const statico = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  return [...statico.matchAll(/href="(\/[a-z0-9-]+\.html(?:[?#][^"]*)?)"/g)].map((m) => m[1]);
}

// regola E (decisione 3 del fondatore): nessun tempo di risposta in cifre
const RISPOSTA = [
  /\b(?:repl(?:y|ies)|respond|response(?: time)?|answers?)\b[^.<\n]{0,60}?\b\d+\s*(?:h|hrs?|hours?|minutes?|mins?)\b/i,
  /within (?:two|2) hours|Replies within \d+|24\/7|under 2 minutes|within (?:a|one) (?:day|working day)/i,
];
// Del JSON-LD contano i VALORI (domande, risposte, descrizioni), non le
// chiavi: «"@type":"Answer","text":"…within 24 hours…"» non è una promessa
// sui tempi di risposta, è la forma di un FAQPage.
function stringhe(x, out = []) {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => stringhe(v, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (!k.startsWith('@')) stringhe(v, out);
  return out;
}
function tempiRisposta(html, regole = RISPOSTA) {
  const superfici = [testo(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')),
    ...blocchi(html).map((d) => stringhe(d).join(' · '))];
  const fuori = [];
  for (const s of superfici) for (const re of regole) {
    const m = s.match(re);
    if (m) fuori.push('…' + s.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20) + '…');
  }
  return fuori;
}

const src = Object.fromEntries(PAGINE.map((p) => [p, leggi(p + '.html')]));

// ── 0 · ogni JSON-LD si legge ──────────────────────────────────────────
{
  const rotti = [];
  for (const p of PAGINE) for (const d of blocchi(src[p])) if (d.__rotto) rotti.push(`${p}.html → ${d.__rotto}`);
  check(!rotti.length, `ogni JSON-LD delle ${PAGINE.length} pagine si legge`, rotti.join('\n      '));
}

// ── 1 · i sette Service hanno un'identità, e il WebPage la indica ─────
for (const p of PRODOTTI) {
  const g = entitaServizio(src[p]);
  check(!g.length, `${p}: Service @id ${O}/${p}#service, provider #organization, WebPage → mainEntity`, g.join(' · '));
}

// ── 2 · /services cita gli STESSI @id ──────────────────────────────────
{
  const lista = nodi(src.services).find((n) => n['@type'] === 'ItemList');
  const stub = lista ? lista.itemListElement.map((x) => x.item) : [];
  const attesi = [...PRODOTTI, 'pacchetto-concordato'];
  const guai = [];
  for (const slug of attesi) {
    const s = stub.find((x) => x && x.url === `${O}/${slug}`);
    if (!s) { guai.push(`${slug}: nessuno stub con url ${O}/${slug}`); continue; }
    if (s['@id'] !== `${O}/${slug}#service`) guai.push(`${slug}: @id «${s['@id']}»`);
    if (!(s.provider && s.provider['@id'] === ORG)) guai.push(`${slug}: provider ≠ #organization`);
    // e l'@id citato esiste davvero sulla pagina del prodotto
    const pagina = leggi(slug + '.html');
    if (!nodi(pagina).some((n) => n['@id'] === `${O}/${slug}#service`)) {
      guai.push(`${slug}: /services cita ${slug}#service ma ${slug}.html non lo dichiara`);
    }
  }
  check(!guai.length, `/services: ${attesi.length} stub con @id, url e provider, e ogni @id esiste sulla sua pagina`,
    guai.join('\n      '));
}

// ── 3 · property-finding: il FAQPage È la riga visibile ───────────────
{
  const pf = src['property-finding'];
  const faq = nodi(pf).find((n) => n['@type'] === 'FAQPage');
  const vis = righe(pf, true);
  check(faq && faq['@id'] === `${O}/property-finding#faq`, 'property-finding: FAQPage con @id …/property-finding#faq');
  check(faq && vis.length === 8 && faq.mainEntity.length === 8
    && faq.mainEntity.every((q, i) => q.name === vis[i].q),
  'property-finding: le 8 domande dichiarate sono le 8 righe q1…q8, nello stesso ordine',
  `dichiarate ${faq ? faq.mainEntity.length : 0}, righe ${vis.length}`);
  const g = faqVera(pf, true);
  check(!g.length, 'property-finding: ogni risposta dichiarata = lead + dettaglio visibili (q8 + clausola §4.2)', g.join('\n      '));
  const q8 = faq && faq.mainEntity.find((q) => q.name === 'What if you don\'t find anything?');
  check(q8 && /at least 3 options matching your agreed criteria within 15 days, the €350 is refunded in full/.test(q8.acceptedAnswer.text),
    'property-finding q8: la risposta porta la clausola §4.2 vera (3 opzioni, 15 giorni, rimborso)');
  check(!/whichever/i.test(JSON.stringify(faq || {})) && !/whichever/i.test(pf),
    'property-finding: «whichever» non compare né nel FAQPage né in pagina');
  check(!/You risk nothing|fully refundable if we do not deliver a match/i.test(pf),
    'property-finding: la parafrasi «fully refundable … You risk nothing» è sparita');
  const q2 = vis.find((r) => r.id === 'q2');
  check(q2 && q2.a.includes("deducted from the agency fee — 10% of one year's rent plus 22% VAT (§4.1)"),
    'property-finding q2: la provvigione è la regola A (10% di un anno di canone + IVA 22%)');
}

// ── 4 · le altre sei console: FAQPage = riga visibile ──────────────────
for (const p of PRODOTTI.filter((x) => x !== 'property-finding')) {
  const g = faqVera(src[p]);
  check(!g.length, `${p}: ogni risposta del FAQPage è parola per parola la riga visibile`, g.join('\n      '));
}
{
  const g = [];
  const cc = src['contract-check'];
  const faq = nodi(cc).find((n) => n['@type'] === 'FAQPage');
  const vis = new Map();
  for (const m of cc.matchAll(/<details><summary>([\s\S]*?)<\/summary><div class="faq-a">([\s\S]*?)<\/div><\/details>/g)) {
    vis.set(testo(m[1]), testo(m[2]));
  }
  if (!faq) g.push('nessun FAQPage');
  else {
    if (faq.mainEntity.length !== vis.size) g.push(`${faq.mainEntity.length} dichiarate, ${vis.size} visibili`);
    for (const q of faq.mainEntity) if (vis.get(q.name) !== q.acceptedAnswer.text) g.push(`«${q.name}» dichiarata ≠ visibile`);
  }
  check(!g.length, 'contract-check: il FAQPage è le cinque <details> visibili, parola per parola', g.join(' · '));
}

// ── 5 · concierge: «da €390» non è un massimo ─────────────────────────
{
  const sv = nodi(src.concierge).find((n) => n['@type'] === 'Service');
  const of = sv && sv.offers;
  check(of && of['@type'] === 'AggregateOffer' && !('highPrice' in of) && of.lowPrice === '15',
    'concierge: AggregateOffer da €15, senza highPrice (€390 è dove PARTE un atterraggio completo)',
    JSON.stringify(of));
  const lista = nodi(src.services).find((n) => n['@type'] === 'ItemList');
  const c = lista && lista.itemListElement.map((x) => x.item).find((x) => x.url === `${O}/concierge`);
  check(c && c.offers && c.offers['@type'] === 'AggregateOffer' && c.offers.lowPrice === '15'
    && !('price' in c.offers) && !('highPrice' in c.offers),
  '/services: Concierge come la sua pagina — AggregateOffer da €15, senza prezzo piatto né highPrice', JSON.stringify(c && c.offers));
}

// ── 6 · i prezzi dei nodi Service sono quelli del catalogo ────────────
{
  const { CATALOG } = await import(path.join(R, 'api/_catalog.js'));
  const guai = [];
  for (const p of PRODOTTI.filter((x) => CATALOG[x])) {
    const sv = nodi(src[p]).find((n) => n['@type'] === 'Service');
    if (!sv || String(sv.offers && sv.offers.price) !== String(CATALOG[p].eur)) {
      guai.push(`${p}: ${sv && sv.offers && sv.offers.price} ≠ catalogo €${CATALOG[p].eur}`);
    }
  }
  const lista = nodi(src.services).find((n) => n['@type'] === 'ItemList');
  for (const it of (lista ? lista.itemListElement : []).map((x) => x.item)) {
    const k = it.url.replace(O + '/', '').replace('pacchetto-concordato', 'concordato-pack');
    if (CATALOG[k] && String(it.offers.price) !== String(CATALOG[k].eur)) guai.push(`/services ${k}: ${it.offers.price} ≠ €${CATALOG[k].eur}`);
  }
  check(!guai.length, 'ogni prezzo dichiarato nei Service è quello di api/_catalog.js', guai.join(' · '));

  // ── 7 · il controllo gratuito porta alla scala a pagamento ──────────
  const cc = src['contract-check'];
  const scala = (cc.match(/<p class="ladder">([\s\S]*?)<\/p>/) || [])[1] || '';
  const ex = CATALOG['contract-check-express'].eur, da = CATALOG['deal-assistance'].eur;
  check(new RegExp(`<a href="/contract-check-express">[^<]*€${ex}\\b`).test(scala)
    && new RegExp(`<a href="/deal-assistance">[^<]*€${da}\\b`).test(scala),
  `contract-check: la riga .ladder porta a /contract-check-express (€${ex}) e /deal-assistance (€${da}) coi prezzi del catalogo`);
  const forma = cc.indexOf('</form>'), riga = cc.indexOf('<p class="ladder">');
  check(forma > 0 && riga > forma && riga - forma < 200,
    'contract-check: la scala sta subito dopo il modulo, fuori dal <form> (resta visibile anche dopo l\'invio)');
  check(/^\.ladder\{[^}]*var\(--/m.test(cc), 'contract-check: .ladder usa i token della pagina (var(--…))');
}

// ── 8 · nessun «.html» nei link interni ───────────────────────────────
{
  const fuori = [];
  for (const p of PAGINE) for (const h of linkHtml(src[p])) fuori.push(`${p}.html → ${h}`);
  check(!fuori.length, `nessun link interno «/x.html» sulle ${PAGINE.length} pagine (ogni clic un 308 in meno)`, elenco(fuori));
  check(/href="\/client-portal\?code=DEMO"/.test(src['property-finding']),
    'property-finding: la demo dell\'app conserva la query (/client-portal?code=DEMO)');
}

// ── 9 · la ragione sociale su ogni #organization ───────────────────────
{
  const fuori = [];
  for (const p of PAGINE) for (const g of organizzazione(src[p])) fuori.push(`${p}.html → ${g}`);
  check(!fuori.length, `#organization è ${LEGAL} su tutte le ${PAGINE.length} pagine (P.IVA e sede, se presenti, giuste)`, elenco(fuori));
}

// ── 10 · nessun tempo di risposta in cifre (decisione 3) ───────────────
// Due livelli. Le frasi di SUPPORTO vietate («within 2 hours», «24/7»,
// «within a day»…) su TUTTE le pagine del pacchetto: /services riassume le
// altre e un motore la cita come catalogo — «Answer within a day» lì
// contraddiceva contract-check, che dice «in orario d'ufficio». La regola
// larga («answer/reply … N ore») solo dove si parla di assistenza:
// concierge, il controllo gratuito e il catalogo /services. Sulle pagine a
// pagamento «verdict within 24 hours» / «first pass within 24 hours» è la
// consegna del prodotto, scritta in api/_catalog.js, non un tempo di
// risposta dell'assistenza.
for (const p of PAGINE) {
  const f = tempiRisposta(src[p], [RISPOSTA[1]]);
  check(!f.length, `${p}: nessuna frase di supporto vietata («within 2 hours», «24/7», «within a day»…)`, elenco(f));
}
for (const p of ['concierge', 'contract-check', 'services']) {
  const f = tempiRisposta(src[p]);
  check(!f.length, `${p}: nessun tempo di risposta in cifre — «in orario d'ufficio (ora di Roma)»`, elenco(f));
}
check(/during office hours \(Rome time\)/.test(src.concierge) && /during office hours \(Rome time\)/.test(src['contract-check']),
  'concierge e contract-check dicono «during office hours (Rome time)»');

// ── 10b · /services non allarga la promessa del Property Finding ────────
// La card diceva «Refunded if we find no match»: la stessa parafrasi tolta
// dal FAQPage. La clausola vera (§4.2) è 3 opzioni nei criteri entro 15
// giorni, oppure i €350 indietro.
const RIMBORSO_LARGO = /Refunded if we find no match|fully refundable/i;
check(!RIMBORSO_LARGO.test(src.services),
  '/services: nessuna parafrasi larga del rimborso PF («Refunded if we find no match», «fully refundable»)');
check(/3 matching options in 15 days, or the €350 back/.test(src.services),
  '/services: la card PF dice la clausola §4.2 (3 opzioni in 15 giorni, o i €350 indietro)');

// ── 11 · le regole mordono ────────────────────────────────────────────
// Ogni regola rieseguita su un campione SBAGLIATO, ricavato dal file vero.
{
  const pf = src['property-finding'];
  const morsi = [];
  const prendi = (nome, preso) => morsi.push([nome, preso]);

  // il «whichever» rimesso nella riga visibile: la risposta dichiarata non torna più
  const pfVecchio = pf.replace("10% of one\n        year's rent plus 22% VAT (§4.1)",
    "one month's rent or\n        10% of the annual rent, <b>whichever is lower</b> (§4.1)");
  prendi('PF: riga visibile cambiata → FAQ divergente', pfVecchio !== pf && faqVera(pfVecchio, true).length > 0);
  // la parafrasi vecchia rimessa nel FAQPage
  const pfParafrasi = pf.replace(/("name":"What if you don't find anything\?","acceptedAnswer":\{"@type":"Answer","text":")[^"]*/,
    '$1The €350 is fully refundable if we do not deliver a match. You risk nothing.');
  prendi('PF: parafrasi nel FAQPage', pfParafrasi !== pf && faqVera(pfParafrasi, true).length > 0);
  // senza la clausola §4.2 la q8 non torna
  prendi('PF: q8 senza clausola', faqVera(pf, false).length > 0);
  // Service senza @id e WebPage senza mainEntity
  const senzaId = src.concierge.replace(`"@id": "${O}/concierge#service",\n`, '');
  prendi('Service senza @id', senzaId !== src.concierge && entitaServizio(senzaId).length > 0);
  const senzaMain = src.concierge.replace(`"mainEntity":{"@id":"${O}/concierge#service"},`, '');
  prendi('WebPage senza mainEntity', senzaMain !== src.concierge && entitaServizio(senzaMain).length > 0);
  // highPrice rimesso
  const alto = src.concierge.replace('"lowPrice": "15", "priceCurrency"', '"lowPrice": "15", "highPrice": "390", "priceCurrency"');
  const ofAlto = alto !== src.concierge && nodi(alto).find((n) => n['@type'] === 'Service').offers;
  prendi('concierge con highPrice', ofAlto && 'highPrice' in ofAlto);
  // un link .html rimesso
  prendi('link «/terms.html»', linkHtml(src.concierge.replace('href="/terms"', 'href="/terms.html"')).length > 0);
  // org senza legalName
  const senzaLegal = src['deposit-letter'].replace(/"legalName": "Egidi Immobiliare S\.r\.l\.", /, '');
  prendi('#organization senza legalName', senzaLegal !== src['deposit-letter'] && organizzazione(senzaLegal).length > 0);
  // «within 2 hours» rimesso
  prendi('«a human answers within 2 hours»', tempiRisposta('<p>A human answers on WhatsApp within 2 hours</p>').length > 0
    && tempiRisposta('<small>a human replies within 2 hours</small>').length > 0
    && tempiRisposta('<p>We reply within 24 hours.</p>').length > 0);
  prendi('«Answer within a day» (/services)', tempiRisposta('<span class="when">Answer within a day</span>').length > 0
    && tempiRisposta('<p>We reply within one working day.</p>', [RISPOSTA[1]]).length > 0
    && tempiRisposta(src.services.replace('A person replies in office hours (Rome time)', 'Answer within a day'), [RISPOSTA[1]]).length > 0);
  prendi('«within 2 hours» nel FAQPage (valori del JSON-LD)', tempiRisposta(
    '<script type="application/ld+json">{"@type":"Answer","text":"A human answers within 2 hours."}</script>').length > 0);
  prendi('rimborso largo su /services', RIMBORSO_LARGO.test(src.services.replace(
    '3 matching options in 15 days, or the €350 back', 'Refunded if we find no match')));
  prendi('lascia passare la frase giusta',
    tempiRisposta('<p>A person replies on WhatsApp during office hours (Rome time).</p>').length === 0);
  const mancati = morsi.filter(([, preso]) => !preso).map(([n]) => n);
  check(!mancati.length, `le regole mordono: ${morsi.length} campioni sbagliati, tutti presi`, 'non presi: ' + mancati.join(' · '));
}

console.log(ko ? `  \x1b[31mLe pagine prodotto non sono ancora in ordine\x1b[0m — ${ok} passed, ${ko} failed`
               : `  \x1b[32mLe pagine prodotto sono in ordine\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
