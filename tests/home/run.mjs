// tests/home/run.mjs — suite `hometruth`
// LA HOME DICE IL VERO. La prima pagina e' quella che un motore di risposta
// cita per primo, e il 15/10/2026 diceva cose che il codice non sostiene:
//
//   · «Day one … + our fee» calcolato col 10% di un anno di canone SENZA
//     l'IVA, mentre api/preagreement/create.js incassa 10% + 22% IVA: la
//     home prometteva un numero piu' basso di quello che il cliente paga;
//   · una griglia concierge con sei servizi che non si vendono (Airport
//     Transfer, Mail Service, «24/7 Emergency», Cleaning €60/mo, Permit
//     Help €150/doc) e «All 30 services» — il menu vero ne ha molti meno;
//   · «500+ Happy Tenants Placed» e «24/7 WhatsApp Support», promesse che
//     nessun dato del repo dimostra (e un contatore che, senza JS, diceva
//     «0+» a chi legge e a chi indicizza);
//   · un secondo nodo LocalBusiness col centroide generico di Roma
//     (41.9028, 12.4964) come «sede» e orari mai pubblicati da nessuna
//     parte, accanto a un #organization senza indirizzo vero.
//
// Ogni regola qui sotto inchioda uno di quei difetti. Le sorgenti di build
// (design/pages-deco/pt.html, testa.py) sono controllate anche loro: una
// ricostruzione futura non deve rimettere in pagina cio' che abbiamo tolto.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, perche = '') => (cond ? bene(t) : male(t + (perche ? ' — ' + perche : '')));

const leggi = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const home = leggi('index.html');
const pt = leggi('design/pages-deco/pt.html');
const testaPy = leggi('design/pages-deco/testa.py');

console.log('\n\x1b[1m▸ hometruth\x1b[0m  la home dice il vero: costo del primo giorno, servizi, promesse ed entita');

// testo visibile: tag via, entita' decodificate, spazi collassati
const ENT = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', mdash: '—', ndash: '–', euro: '€' };
const decodifica = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
const testo = (html) => decodifica(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ── 1 · i JSON-LD: tutti validi, nessun LocalBusiness, un'entita' completa
const blocchi = [];
let rotti = 0;
for (const m of home.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
  try { blocchi.push(JSON.parse(m[1])); } catch { rotti++; }
}
const nodi = blocchi.flatMap((d) => d['@graph'] || [d]);
check(blocchi.length > 0 && rotti === 0, `ogni blocco JSON-LD della home e JSON valido (${blocchi.length})`,
  `${rotti} blocchi non parsano`);

check(!home.includes('#localbusiness'), 'nessun riferimento a #localbusiness');
check(!home.includes('"LocalBusiness"'), 'nessun nodo "LocalBusiness" (geo finto, orari mai pubblicati)');

const org = nodi.filter((n) => n['@id'] === 'https://www.boomrome.com/#organization');
check(org.length === 1, 'un solo nodo #organization', `ne trovo ${org.length}`);
const o = org[0] || {};
check(o.legalName === 'Egidi Immobiliare S.r.l.', '#organization: legalName Egidi Immobiliare S.r.l.', `trovo ${JSON.stringify(o.legalName)}`);
check(o.vatID === 'IT17322991005', '#organization: vatID IT17322991005', `trovo ${JSON.stringify(o.vatID)}`);
check(o.telephone === '+39-331-325-1961', '#organization: telefono +39-331-325-1961', `trovo ${JSON.stringify(o.telephone)}`);
const a = o.address || {};
check(a.streetAddress === 'Via dei Coronari 181/184' && a.postalCode === '00186'
  && a.addressLocality === 'Roma' && a.addressRegion === 'RM' && a.addressCountry === 'IT',
  '#organization: sede Via dei Coronari 181/184, 00186 Roma RM IT', `trovo ${JSON.stringify(a)}`);
// la sede dichiarata e' la stessa che il piede di pagina stampa
check(/Via dei Coronari 181\/184, 00186 Roma/.test(home) && /P\.IVA 17322991005/.test(home),
  'l\'entita dichiara la stessa sede e la stessa P.IVA del piede di pagina');

// ── 2 · la FAQ dichiarata e' PAROLA PER PAROLA quella visibile ────────────
const faq = nodi.filter((n) => n['@type'] === 'FAQPage');
check(faq.length === 1, 'un solo FAQPage', `ne trovo ${faq.length}`);
const visibili = new Map();
// A date-shortcut disclosure is a form control, not a published question.
// All actual FAQ rows still have to match the schema word for word.
for (const m of home.matchAll(/<details\b[^>]*class="[^"]*\bfaq-v\b[^"]*"[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) {
  visibili.set(testo(m[1]), testo(m[2]));
}
const dichiarate = (faq[0]?.mainEntity || []).map((q) => [q.name, String(q.acceptedAnswer?.text || '')]);
check(dichiarate.length === 5, 'la FAQ dichiara cinque domande', `ne trovo ${dichiarate.length}`);
const diverse = [];
for (const [q, r] of dichiarate) {
  const v = visibili.get(testo(q));
  if (v === undefined) diverse.push(`«${q}» non e in pagina`);
  else if (v !== testo(r)) diverse.push(`«${q}»\n        markup:  ${testo(r)}\n        pagina:  ${v}`);
}
check(!diverse.length, 'ogni risposta del FAQPage e uguale a quella visibile (tag tolti, spazi collassati)',
  '\n      ' + diverse.join('\n      '));
check(visibili.size === dichiarate.length, 'ogni domanda FAQ visibile della home e dichiarata nel FAQPage',
  `${visibili.size} in pagina, ${dichiarate.length} dichiarate`);
check(!dichiarate.some(([q]) => /Choose by length/.test(q)), 'i controlli del soggiorno non diventano domande FAQ');

const fee = dichiarate.find(([q]) => q === 'Does BOOM charge broker fees?');
check(!!fee && fee[1].includes("10% of one year's rent plus 22% VAT") && fee[1].includes('12.2%'),
  'la FAQ sulla provvigione dice la regola vera: 10% di un anno + 22% IVA (12,2% in tutto)');
check(!!fee && /at least 3 matching options within 15 days/.test(fee[1]),
  'la promessa PFS e quella dei Terms §4.2: almeno 3 opzioni in 15 giorni o rimborso');
const cf = dichiarate.find(([q]) => q === 'Do I need a codice fiscale to rent in Rome?');
check(!!cf && !/24\s*[–-]\s*48 hours/.test(cf[1]) && /AA4\/8/.test(cf[1]),
  'la FAQ sul codice fiscale non promette «24–48 hours» e indica la strada gratuita (AA4/8)');

// ── 3 · il costo del primo giorno include l'IVA sulla provvigione ────────
const calcolo = home.match(/Math\.round\(x\.p \* 12 \* \.10[^)]*\)/);
check(!!calcolo && calcolo[0].includes('1.22'),
  'il conto del primo giorno applica l\'IVA alla provvigione (× 1.22)',
  `trovo ${calcolo ? calcolo[0] : 'nessun calcolo'}`);
check(/our '\s*\+ 'fee incl\. VAT\./.test(home), 'la riga del primo giorno dice «our fee incl. VAT»');
{
  // il numero, non solo la formula: un canone da 1.000 €/mese con una
  // mensilita' di deposito costa il primo giorno 1.000 + 1.000 + 1.464
  const corpo = (home.match(/var conti = dentro\.map\(function \(x\) \{\s*([\s\S]*?)\}\);/) || [])[1] || '';
  let giorno = NaN;
  try { giorno = new Function('x', corpo)({ p: 1000, m: 1 }); } catch { /* resta NaN */ }
  check(giorno === 3464, 'canone 1.000 € + 1 mese di deposito → 3.464 € il primo giorno (1.464 di provvigione con IVA)',
    `il calcolo della pagina da ${giorno}`);
}

{
  // la ricevuta della demo «Sign & pay»: il totale stampato e' quello che
  // il cliente paga davvero (mese + deposito + provvigione CON IVA). Prima
  // diceva €5,120 = 1.600 + 1.600 + 1.920, la provvigione senza IVA, sulla
  // stessa pagina della FAQ che dice 12,2%.
  // Il canone si legge dalla didascalia della casa protagonista, qualunque
  // sia il suo nome: i nomi cambiano (catalogo-nomi.mjs, 15/10/2026 — era
  // «Trilocale Pigneto», ora è il nome della via), il conto no.
  const affitto = home.match(/<figcaption>[^<·]+ · €([\d,]+)\/mo<\/figcaption>/);
  const ricevuta = home.match(/<div class="sc-totale"><span>([^<]*)<\/span>\s*<b>€([\d,]+)<\/b><\/div>/);
  const p = affitto ? +affitto[1].replace(/,/g, '') : NaN;
  const totale = ricevuta ? +ricevuta[2].replace(/,/g, '') : NaN;
  const atteso = p * 2 + Math.round(p * 12 * 0.10 * 1.22);
  check(Number.isFinite(p) && totale === atteso,
    `la ricevuta della demo: canone €${p} → totale €${atteso} (mese + deposito + provvigione con IVA)`,
    `la pagina stampa €${ricevuta ? ricevuta[2] : '?'}`);
  check(!!ricevuta && /incl\. VAT/.test(ricevuta[1]), 'l\'etichetta della ricevuta dice «incl. VAT»',
    `trovo ${JSON.stringify(ricevuta && ricevuta[1])}`);
  const ptRicevuta = pt.match(/<div class="sc-totale"><span>([^<]*)<\/span>/);
  check(!!ptRicevuta && /incl\. VAT/.test(ptRicevuta[1]), 'pt.html: anche l\'etichetta della ricevuta dice «incl. VAT»',
    `trovo ${JSON.stringify(ptRicevuta && ptRicevuta[1])}`);
}

// ── 4 · niente promesse non dimostrate, niente servizi che non si vendono
const VIETATE = ['24/7', 'data-fine="500"', 'All 30 services', '€60/mo', '€150/doc', 'Airport',
  'Mail Service', '500+', 'Trusted by', 'no broker fees', 'Happy Tenants'];
const trovate = VIETATE.filter((v) => home.includes(v));
check(!trovate.length, 'la home non contiene: ' + VIETATE.join(' · '), 'trovo ' + trovate.join(', '));
// decisione del fondatore n. 3: nessuna promessa NUMERICA sui tempi di
// risposta (ne' sulla home ne' nella sorgente da cui si ricostruisce)
const TEMPI = /within\s*2\s*h\b|within (?:2|two) hours|under 2 minutes/i;
check(!TEMPI.test(home), 'la home non promette tempi di risposta in cifre («within 2h», «under 2 minutes»)',
  `trovo «${(home.match(TEMPI) || [])[0]}»`);
check(!TEMPI.test(pt), 'pt.html non promette tempi di risposta in cifre',
  `trovo «${(pt.match(TEMPI) || [])[0]}»`);

// ── 5 · la griglia concierge: servizi veri, ai prezzi del catalogo ───────
const { CATALOG } = await import(pathToFileURL(path.join(R, 'api/_catalog.js')).href);
const tessere = new Map([...home.matchAll(/<h3 class="mini6-nome">([^<]+)<\/h3><span>([^<]*)<\/span>/g)]
  .map((m) => [decodifica(m[1]).trim(), decodifica(m[2]).trim()]));
check(tessere.size === 6, 'la griglia concierge ha sei tessere', `ne trovo ${tessere.size}`);
const prezzo = (s) => { const m = String(s || '').match(/€\s?(\d+)/); return m ? +m[1] : NaN; };
check(prezzo(tessere.get('Move-in Pack')) === CATALOG['movein-pack'].eur,
  `Move-in Pack = €${CATALOG['movein-pack'].eur} come api/_catalog.js (movein-pack)`,
  `la pagina dice ${JSON.stringify(tessere.get('Move-in Pack'))}`);
check(prezzo(tessere.get('Deep clean')) === CATALOG['cleaning-premium'].eur,
  `Deep clean = €${CATALOG['cleaning-premium'].eur} come api/_catalog.js (cleaning-premium)`,
  `la pagina dice ${JSON.stringify(tessere.get('Deep clean'))}`);
{
  // SIM e sanita' non sono nel catalogo Stripe: il loro listino e' la
  // pagina /concierge, e la home non puo' dire un numero diverso.
  const conc = testo(leggi('concierge.html'));
  const sim = prezzo(tessere.get('Italian SIM')), san = prezzo(tessere.get('Healthcare enrollment'));
  check(Number.isFinite(sim) && new RegExp(`SIM[^€]{0,30}€${sim}\\b`).test(conc),
    `Italian SIM = €${sim}, lo stesso prezzo di /concierge`);
  check(Number.isFinite(san) && new RegExp(`[Hh]ealthcare enrol{1,2}ment[^€]{0,30}€${san}\\b`).test(conc),
    `Healthcare enrollment = €${san}, lo stesso prezzo di /concierge`);
}
check(/<a class="vai-testa" href="\/concierge">All concierge services →<\/a>/.test(home),
  'il rimando dice «All concierge services» e punta a /concierge');
check(/<div class="pass-campo"><b>Support<\/b><span>WhatsApp · EN<\/span><\/div>/.test(home),
  'il pass dice «WhatsApp · EN», non «24/7»');

// ── 6 · i contatori: chi legge senza JS non vede mai «0» ─────────────────
// il banco: una fila di <div> semplici (nessun div annidato) dentro #aboutNum
const banco = (home.match(/id="aboutNum">((?:\s*<div>(?:(?!<\/?div)[\s\S])*<\/div>)+)\s*<\/div>/) || [])[1] || '';
const cifre = [...banco.matchAll(/<b([^>]*)>([^<]*)<\/b>/g)];
check(cifre.length === 4, 'i numeri della casa sono quattro', `ne trovo ${cifre.length}`);
const zeri = [], storti = [];
for (const m of home.matchAll(/<b([^>]*)>([^<]*)<\/b>/g)) {
  const statico = m[2].trim();
  if (/^0\D?$/.test(statico) && /data-fine/.test(m[1])) zeri.push(m[0]);
  const fine = (m[1].match(/data-fine="([^"]*)"/) || [])[1];
  if (fine !== undefined) {
    const suff = (m[1].match(/data-suff="([^"]*)"/) || [])[1] || '';
    if (statico !== fine + suff) storti.push(`${m[0]} (atteso ${fine + suff})`);
  }
}
check(!cifre.some((m) => /^0\+?$/.test(m[2].trim())) && !zeri.length,
  'nessun contatore stampa «0» o «0+» come testo statico', zeri.join(', '));
check(!storti.length, 'ogni contatore animato stampa gia il suo valore finale', storti.join(', '));
check(/<div><b>REA<\/b><span>Registered agency · RM-1710623<\/span><\/div>/.test(banco),
  'al posto di «500+» c\'e l\'iscrizione REA RM-1710623, la stessa del piede');
check(/REA RM-1710623/.test(home), 'il numero REA del contatore e quello del piede di pagina');
check(/<div><b>EN<\/b><span>WhatsApp, a real person<\/span><\/div>/.test(banco),
  'al posto di «24/7» c\'e «EN · WhatsApp, a real person»');
check(/function conta\(el\)/.test(home) && /querySelectorAll\('\[data-fine\]'\)/.test(home)
  && !/querySelectorAll\('#aboutNum b'\)|querySelectorAll\('\.chi-num b'\)/.test(home),
  'l\'animazione tocca solo gli elementi con data-fine (REA ed EN restano come sono)');

// ── 7 · le sorgenti di build non rimettono in pagina cio' che e' stato tolto
const ptVietate = ['24/7', 'All 30 services', 'data-fine="500"', 'Airport Transfer', 'Mail Service', '€60/mo', '€150/doc'];
const ptTrovate = ptVietate.filter((v) => pt.includes(v));
check(!ptTrovate.length, 'design/pages-deco/pt.html non contiene: ' + ptVietate.join(' · '), 'trovo ' + ptTrovate.join(', '));
check(/Math\.round\(x\.p \* 12 \* \.10 \* 1\.22\)/.test(pt) && /fee incl\. VAT\./.test(pt),
  'pt.html calcola il primo giorno con l\'IVA, come la home');
check(/href="\/concierge">All concierge services →/.test(pt), 'pt.html rimanda a /concierge (non /concierge.html)');
check(!/24\s*[–-]\s*48 hours/.test(testaPy) && !/LocalBusiness'|NEGOZIO,/.test(testaPy),
  'testa.py: niente «24–48 hours» e niente LocalBusiness nella testa della home');
{
  // testa.py produce ESATTAMENTE i blocchi della home: se divergono, la
  // prossima ricostruzione cambierebbe la pagina in silenzio.
  const py = spawnSync('python3', ['-B', '-c',
    'import sys, json; sys.dont_write_bytecode = True\n'
    + 'sys.path.insert(0, sys.argv[1])\n'
    + 'import testa as T\n'
    + 'print(json.dumps([T._ld(T.AGENZIA), T._ld(T.FAQ_HOME)]))',
    path.join(R, 'design/pages-deco')], { encoding: 'utf8' });
  if (py.status !== 0 || !py.stdout) {
    console.log('  \x1b[33m⊘\x1b[0m testa.py non eseguibile qui (python3 assente?) — confronto saltato');
  } else {
    const [agenzia, faqHome] = JSON.parse(py.stdout);
    check(home.includes(agenzia), 'testa.py genera lo stesso nodo #organization della home');
    check(home.includes(faqHome), 'testa.py genera la stessa FAQ della home');
  }
}

console.log(ko ? `  \x1b[31mLa home non dice ancora il vero\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mLa home dice il vero\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
