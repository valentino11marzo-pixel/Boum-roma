// tests/trust/run.mjs — suite `trustpages`
// LE PAGINE DELLA FIDUCIA NON PROMETTONO QUELLO CHE NON C'È.
//
// Il reperto (audit GEO/SEO, ottobre 2026): about, contact e le tre pagine
// B2B (universities, corporate, research) dichiaravano «24/7 WhatsApp
// support», «2-minute average response», «500+ happy tenants», «Digital
// contracts in English», «protected deposit» e un confronto «€1,500–€5,000»
// senza fonte. Sono le frasi che un motore di risposta CITA: un'AI che
// risponde «BOOM risponde 24/7 in due minuti» mette la promessa in bocca a
// noi, e il cliente la scopre falsa la prima sera. Il fondatore (15/10/2026):
// nessuna promessa numerica sui tempi di risposta, da nessuna parte.
//
// Cosa si guarda: il testo VISIBILE, il <title>, le meta (description, og,
// twitter), le stringhe del JSON-LD, i contatori animati (data-count +
// data-suffix, che il JS trasforma in «500+») e il testo che gli script
// iniettano (i messaggi di conferma dei moduli). Più: /deals fuori dai
// motori e dalla libreria link di WhatsApp, il cookie di attribuzione
// dichiarato, la conversione della visita emessa, l'entità organizzazione
// corretta, lo studente che trova la sua porta su /universities.
//
// Il rilevatore si prova su frasi CATTIVE prima di essere usato: un pattern
// inerte darebbe un verde che non guarda niente.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg, why = '') => {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + msg); }
  else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + msg + (why ? '\n      ' + why : '')); }
};

// ── strumenti ───────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', euro: '€', middot: '·', rarr: '→', larr: '←', times: '×' };
const decode = (s) => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));

const ldBlocks = (html) => [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const ldStrings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => ldStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => ldStrings(x, out));
  return out;
};

// Tutto ciò che un lettore o un motore può leggere della pagina.
function surface(html) {
  const parts = [];
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (title) parts.push(decode(title[1]));
  for (const m of html.matchAll(/<meta\s[^>]*(?:name|property)="(?:description|og:[a-z:_]+|twitter:[a-z:_]+)"[^>]*content="([^"]*)"/gi)) parts.push(decode(m[1]));
  for (const b of ldBlocks(html)) { try { parts.push(...ldStrings(JSON.parse(b))); } catch { /* il parse ha la sua regola */ } }
  // contatori animati: <div data-count="500" data-suffix="+">0</div> si legge «500+»
  // e si legge INSIEME all'etichetta che gli sta accanto: «98%» + «Success Rate» è la promessa,
  // e nel testo visibile il contatore vale «0» — separati, nessuno dei due la dice.
  for (const m of html.matchAll(/<([a-z0-9]+)\b[^>]*\bdata-count="([^"]*)"[^>]*>[\s\S]*?<\/\1>([\s\S]{0,240})/gi)) {
    const suf = (m[0].match(/\bdata-suffix="([^"]*)"/i) || [])[1] || '';
    const label = decode(m[3].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 60);
    parts.push(decode(m[2] + suf) + ' ' + label);
  }
  // gli attributi che un lettore vede o sente: la didascalia del film (data-cap, che
  // js/boom-film.js scrive nel testo visibile), le pillole, aria-label, title, alt, placeholder
  for (const m of html.matchAll(/\b(?:data-cap|data-pill|aria-label|title|alt|placeholder)="([^"]*)"/gi)) parts.push(decode(m[1]));
  // il testo che gli script iniettano (conferme dei moduli, chip): si guarda il sorgente
  for (const m of html.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)) parts.push(m[1]);
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  parts.push(decode(visible));
  return parts.join('\n').replace(/[ \t ]+/g, ' ');
}

// Le promesse vietate. Ognuna con il perché: chi la toglie deve sapere cosa riapre.
const CLAIMS = [
  { re: /24\/7/, why: '«24/7»: nessuno risponde di notte, e il cliente lo scopre la prima sera' },
  { re: /500\+/, why: '«500+»: un numero che nessun registro dimostra' },
  { re: /2-minute average|under 2 minutes/i, why: '«2 minuti»: promessa numerica sui tempi, vietata dal fondatore' },
  { re: /Digital contracts in English|contracts? in English\b/i, why: 'il contratto è il modello italiano registrato, SPIEGATO in inglese' },
  { re: /protected deposit|deposits? (?:is |are )?protected|deposit protection/i, why: '«protected deposit» non è un istituto italiano: il deposito è limitato per legge' },
  { re: /€\s?1,500\s?[–-]\s?€\s?5,000/, why: 'confronto «€1,500–€5,000» senza fonte' },
  // decisione 3 del fondatore: nessun tempo di risposta in cifre (2h, 24h, 48h…)
  { re: /\b(?:repl(?:y|ies)|respond|response(?: time)?)\b[^.<\n]{0,60}?\b\d+\s*(?:h|hrs?|hours?|minutes?|mins?)\b/i,
    why: 'tempo di risposta in cifre: la regola è «in orario d\'ufficio (ora di Roma)»' },
  { re: /Replies within \d+|~\s*\d+\s*hours?/i, why: 'tempo di risposta in cifre' },
  // le stesse promesse con altre parole (dalla revisione, 15/10/2026)
  { re: /\b\d{1,2} ?AM\b[^<]{0,80}emergency|emergency line/i, why: '«emergency line» alle 2 di notte = un 24/7 senza la cifra: non c\'è una linea notturna' },
  { re: /within a few hours/i, why: '«within a few hours»: tempo di risposta promesso; si conferma in orario d\'ufficio' },
  { re: /\b\d{1,3}(?:,\d{3})?\+\s+verified/i, why: '«1,200+ verified homes»: un conteggio che nessun registro dimostra (il catalogo vero è di qualche decina di case)' },
  { re: /\b\d{1,3}\s?%\s*success(?: rate)?\b/i, why: '«98% success rate»: una statistica mai misurata' },
  { re: /first thing the next morning/i, why: 'decisione 3 del fondatore: «the next working morning» — «next morning» promette una risposta la domenica' },
];
const scan = (text) => CLAIMS.filter((c) => c.re.test(text)).map((c) => {
  const m = text.match(c.re); const i = m.index;
  return `${c.why}\n        «…${text.slice(Math.max(0, i - 50), i + m[0].length + 30).replace(/\s+/g, ' ').trim()}…»`;
});

// ── 0 · il rilevatore morde ─────────────────────────────────────────────
console.log('\n\x1b[1m▸ trustpages\x1b[0m  le pagine della fiducia non promettono quello che non c\'è');
console.log('\n\x1b[1m0. Il rilevatore morde (frasi cattive vere, prese dalle pagine di prima)\x1b[0m');
const BAD = [
  '<p>24/7 WhatsApp support. 2-minute average response.</p>',
  '<div class="stat-val" data-count="500" data-suffix="+">0</div>',
  '<li>Digital contracts in English</li>',
  '<script type="application/ld+json">{"@type":"Answer","text":"Every rental uses a legal contract with a protected deposit."}</script>',
  '<p>Relocation firms charge &euro;1,500&ndash;&euro;5,000 per assignment.</p>',
  '<p>Fill out the form and we\'ll respond within 2 hours.</p>',
  '<div class="form-tag">Free · Replies within 24h</div>',
  '<script>F.innerHTML="Thank you — we reply within 24 hours."</script>',
  '<meta name="description" content="6+ years, 500+ happy tenants.">',
  '<div data-cap="Legal contract signed and the deposit protected">',
  '<div class="tf-desc">Locked out at 2 AM? Pipe burst on Sunday? One tap connects you to our emergency line.</div>',
  "<script>chip.textContent='✓ Confirmed within a few hours'</script>",
  '<div data-cap="We scan 1,200+ verified homes and surface the best matches">',
  '<div class="stat-val" data-count="98" data-suffix="%">0</div><div class="stat-lab">Success Rate</div>',
  '<p>out-of-hours messages are answered first thing the next morning.</p>',
];
for (const b of BAD) ok(scan(surface(b)).length > 0, 'preso: ' + b.slice(0, 70).replace(/\s+/g, ' '));
const GOOD = [
  '<p>A person replies on WhatsApp during office hours (Rome time); messages sent out of hours are answered the next working morning.</p>',
  '<p>Italy\'s official standard-form lease, registered with the Agenzia delle Entrate and explained in English.</p>',
  '<p>We\'ll remind you the day before, 3 hours and 30 minutes ahead.</p>',
  '<p>a registered legal contract and a deposit capped by Italian law</p>',
  '<div data-cap="Registered legal contract signed, deposit capped by Italian law">',
  '<div data-cap="We scan the Rome market and surface the best matches">',
  '<div class="tf-desc">Gas, fire or flooding: call 112 first, then WhatsApp us &mdash; we coordinate the repair with the owner.</div>',
  '<div class="stat-val" data-count="6" data-suffix="+">0</div><div class="stat-lab">Years in Rome</div>',
];
for (const g of GOOD) ok(scan(surface(g)).length === 0, 'lascia passare: ' + g.slice(3, 70));

// ── 1 · le pagine ───────────────────────────────────────────────────────
console.log('\n\x1b[1m1. Nessuna promessa vietata su about, contact, universities, corporate, research, book, privacy\x1b[0m');
const PAGES = ['about.html', 'contact.html', 'universities.html', 'corporate.html', 'research.html', 'book.html', 'privacy.html'];
const src = Object.fromEntries([...PAGES, 'deals.html'].map((f) => [f, read(f)]));
for (const f of PAGES) {
  const hits = scan(surface(src[f]));
  ok(hits.length === 0, `${f}: nessun 24/7, 500+, 2 minuti, contratto «in inglese», deposito «protetto», €1,500–€5,000, tempi in cifre`,
    hits.join('\n      '));
}

console.log('\n\x1b[1m2. Il JSON-LD si legge, e le FAQ dichiarate sono quelle visibili\x1b[0m');
for (const f of [...PAGES, 'deals.html']) {
  const bad = ldBlocks(src[f]).filter((b) => { try { JSON.parse(b); return false; } catch { return true; } });
  ok(bad.length === 0, `${f}: ogni blocco ld+json fa JSON.parse`, bad.map((b) => b.slice(0, 80)).join(' | '));
}
const plain = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
for (const f of ['universities.html', 'corporate.html', 'research.html']) {
  const vis = new Map([...src[f].matchAll(/<details><summary>([\s\S]*?)<\/summary><div class="faq-a">([\s\S]*?)<\/div><\/details>/g)]
    .map((m) => [plain(m[1]), plain(m[2])]));
  const faq = ldBlocks(src[f]).map((b) => JSON.parse(b)).find((d) => d['@type'] === 'FAQPage');
  const qs = faq ? faq.mainEntity : [];
  const off = qs.filter((q) => vis.get(q.name) !== q.acceptedAnswer.text).map((q) => q.name);
  ok(!!faq && qs.length === vis.size && off.length === 0,
    `${f}: il FAQPage ha ${qs.length} domande, uguali parola per parola alle ${vis.size} visibili`, off.join(' | '));
}

// ── 3 · lo studente ha la sua porta ─────────────────────────────────────
console.log('\n\x1b[1m3. /universities: un titolo per gli uffici, una porta per lo studente\x1b[0m');
{
  const u = src['universities.html'];
  const T = 'Housing Partner for Universities in Rome | BOOM';
  ok((u.match(/<title>([\s\S]*?)<\/title>/) || [])[1] === T, `<title> è «${T}»`);
  ok(u.includes(`<meta property="og:title" content="${T}">`), 'og:title uguale al titolo');
  const tw = u.match(/<meta name="twitter:title" content="([^"]*)">/);
  ok(!tw || decode(tw[1]) === T, 'twitter:title, se c\'è, non dice altro');
  ok(/<section[^>]*\bid="students"/.test(u), 'esiste la sezione #students (gli studenti cominciano da soli)');
  const hop = u.indexOf('href="#students"'), form = u.indexOf('id="form"');
  ok(hop > 0 && (form < 0 || hop < form), 'il link «Are you a student?» porta a #students, prima del modulo per gli uffici');
  const sec = u.slice(u.search(/<section[^>]*\bid="students"/));
  ok(/Students can begin/.test(sec.slice(0, 1500)), '#students è proprio «Students can begin on their own»');
}

// ── 4 · /deals è uno strumento interno ──────────────────────────────────
console.log('\n\x1b[1m4. /deals: strumento interno, fuori dai motori e dalla libreria WhatsApp\x1b[0m');
{
  const d = src['deals.html'];
  const meta = (n) => (d.match(new RegExp(`<meta name="${n}" content="([^"]*)"`)) || [])[1] || '';
  ok(/noindex/.test(meta('robots')) && /nofollow/.test(meta('robots')), 'meta robots: noindex, nofollow', meta('robots'));
  ok(/noindex/.test(meta('googlebot')), 'meta googlebot: noindex', meta('googlebot'));
  ok(/interno/i.test((d.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''), 'il titolo dice che è interno');
  ok(!/Deals &amp; Offers|limited-time apartment offers/i.test(d), 'nessuna traccia della vecchia «pagina offerte»');
  const WA = require(path.join(R, 'js/whatsapp-replies.js'));
  ok(!WA.LINKS.some((l) => l.path === '/deals' || l.path.startsWith('/deals?')), 'la libreria link di WhatsApp non manda nessuno su /deals');
  const waSrc = read('js/whatsapp-replies.js');
  ok(!/['"`]\/deals\b/.test(waSrc), 'nessun percorso «/deals» nel modulo delle risposte');
  ok(!/24\/7/.test(waSrc), 'nessun «24/7» nelle risposte rapide');
  ok(!/\b500\+/.test(waSrc), 'nessun «500+» nelle risposte rapide');
  ok(!/leases? in English|contracts? in English\b|English-language lease/i.test(waSrc),
    'nessun contratto «in English» nelle risposte rapide: il contratto è italiano, spiegato in inglese',
    (waSrc.match(/.{0,40}(?:leases? in English|contracts? in English\b|English-language lease).{0,20}/i) || [''])[0]);
  // la commissione dell'inquilino: 10% di un anno + IVA, in ogni risposta che la cita
  for (const r of WA.REPLIES) {
    if (!/10% (?:of|del)/.test(r.text)) continue;
    ok(r.fam === 'en' ? /\+ 22% VAT/.test(r.text) : /\+ IVA 22%/.test(r.text),
      `/${r.sc}: la commissione 10% porta l'IVA accanto`);
  }
}

// ── 5 · il cookie di attribuzione è dichiarato ──────────────────────────
console.log('\n\x1b[1m5. /privacy dichiara boom_attr\x1b[0m');
{
  const p = src['privacy.html'];
  const cookies = p.slice(p.indexOf('9. Cookies'), p.indexOf('10. Security'));
  ok(/boom_attr/.test(cookies), 'la sezione Cookies nomina boom_attr');
  ok(/90 days/.test(cookies) && /first-party/.test(cookies) && /withdraw consent/.test(cookies),
    'dice durata (90 giorni), che è di prima parte e che sparisce col consenso ritirato');
  ok(/no name, email, phone/.test(cookies), 'dice che non contiene dati personali');
}

// ── 6 · la visita confermata è una conversione ─────────────────────────
console.log('\n\x1b[1m6. /book emette boom-conversion sulle due vie di successo\x1b[0m');
{
  const b = src['book.html'];
  const ev = [...b.matchAll(/dispatchEvent\(new CustomEvent\('boom-conversion',\{detail:\{label:'([^']+)',section:'book'\}\}\)\)/g)].map((m) => m[1]);
  ok(ev.length === 2, `due dispatch di boom-conversion (trovati ${ev.length})`);
  const fn = (name) => { const i = b.indexOf(`function ${name}(`); const j = b.indexOf('\nfunction ', i + 10); return b.slice(i, j); };
  const pend = fn('showPending'), conf = fn('showConfirmed');
  ok(/boomTrack\('viewing_requested'/.test(pend) && /label:'Viewing requested'/.test(pend), 'showPending: «Viewing requested» accanto a viewing_requested');
  ok(/boomTrack\('viewing_booked'/.test(conf) && /label:'Viewing booked'/.test(conf), 'showConfirmed: «Viewing booked» accanto a viewing_booked');
  ok(/window\.addEventListener\('boom-conversion'/.test(read('js/boom-track.js')), 'js/boom-track.js ascolta davvero boom-conversion');
  ok(/src="\/js\/boom-track\.js"/.test(b), 'book.html carica il tracker');
}

// ── 7 · l'entità organizzazione ─────────────────────────────────────────
console.log('\n\x1b[1m7. #organization è Egidi Immobiliare S.r.l. su ogni pagina che ha il nodo\x1b[0m');
for (const f of [...PAGES, 'deals.html']) {
  const nodes = ldBlocks(src[f]).map((b) => { try { return JSON.parse(b); } catch { return null; } })
    .flatMap((d) => (d && d['@graph']) ? d['@graph'] : [d])
    .filter((d) => d && d['@id'] === 'https://www.boomrome.com/#organization');
  if (!nodes.length) { ok(true, `${f}: nessun nodo #organization (niente da verificare)`); continue; }
  const o = nodes[0], a = o.address || {};
  ok(o.legalName === 'Egidi Immobiliare S.r.l.', `${f}: legalName «Egidi Immobiliare S.r.l.»`, o.legalName);
  ok(o.vatID === 'IT17322991005' && o.telephone === '+39-331-325-1961'
    && a.streetAddress === 'Via dei Coronari 181/184' && a.postalCode === '00186'
    && a.addressLocality === 'Roma' && a.addressRegion === 'RM' && a.addressCountry === 'IT',
    `${f}: vatID, telefono e sede (Via dei Coronari 181/184, 00186 Roma RM IT)`, JSON.stringify({ vat: o.vatID, tel: o.telephone, a }));
}

// ── 8 · la descrizione di /about ────────────────────────────────────────
console.log('\n\x1b[1m8. /about si presenta coi fatti (2019 · 2023)\x1b[0m');
{
  const a = src['about.html'];
  const D = "BOOM was born from frustration with Rome's broken rental market. Helping internationals since 2019, a registered agency since 2023: renting in Rome that works.";
  const metas = [...a.matchAll(/<meta (?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)">/g)].map((m) => decode(m[1]));
  ok(metas.length === 3 && metas.every((x) => x === D), 'description, og e twitter dicono la stessa frase vera');
  ok(D.length >= 110 && D.length <= 165, `lunghezza ${D.length} fra 110 e 165`);
  ok(/Always Reachable/.test(a) && /call 112 first/.test(a), 'la card «Always Reachable» dice orario d\'ufficio e 112 per le emergenze');
  ok(/answered the next working morning/.test(a) && !/first thing the next morning/.test(a),
    'fuori orario: «the next working morning» (decisione 3 del fondatore), come /contact');
  ok(/answered the next working morning/.test(src['contact.html']), '/contact usa la stessa frase: le due pagine della fiducia non si contraddicono');
}

console.log(`\n${fail === 0 ? '\x1b[32m\x1b[1m' : '\x1b[31m\x1b[1m'}trustpages: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
