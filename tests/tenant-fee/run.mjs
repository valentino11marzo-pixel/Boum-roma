// tests/tenant-fee/run.mjs — suite `tenantfee`
//
// LA COMMISSIONE DELL'INQUILINO, DETTA COME LA INCASSA IL SISTEMA.
//
// Il reperto (15/10/2026): la macchina ha sempre incassato UNA regola —
// `api/preagreement/create.js`: feePct 10 sull'ANNO di canone (rent × 12),
// feeVatPct 22 aggiunta sopra — mentre le pagine ne raccontavano tre
// diverse. I Termini (§4.1) dicevano «una mensilità OPPURE il 10% del
// canone annuo, il più basso dei due» con un esempio che sommava una
// mensilità; /your-money, /how-it-works e /try stampavano «10% of the
// annual rent» SENZA l'IVA, e i calcolatori in pagina mostravano un totale
// del primo giorno più basso di quello che la proposta avrebbe poi chiesto.
// Un motore di risposta cita la frase più netta che trova: se la frase è
// sbagliata, la cita sbagliata — e il cliente arriva alla firma con un
// numero che non è il nostro.
//
// Le regole, ognuna nata da una riga vera:
//  1. ogni calcolo della commissione in pagina (`* 12 * .10`) porta `* 1.22`
//     nella STESSA espressione;
//  2. i Termini §4.1 dicono la regola e l'esempio SI RIFÀ dall'aritmetica
//     (non si confronta con un numero copiato: si ricalcola);
//  3. dove una pagina pubblica dice «10% of the annual rent» l'IVA arriva
//     entro 120 caratteri — testo visibile, JSON-LD e meta descrizioni,
//     più llms.txt e il prompt di api/ask-listing.js;
//  4. «whichever is lower» non esiste più da nessuna parte;
//  5. il FAQPage di /how-it-works è parola per parola la risposta visibile;
//  6. nessuna offerta SEPA ai nuovi inquilini (il mandato nuovo è chiuso);
//  7. il recesso nei Termini è quello dei NOSTRI modelli di contratto
//     (js/contract-pdf.js), non un «30 days notice» inventato;
//  8. il QUANDO della commissione è quello della proposta (create.js:
//     feeDue 'separate' di default, la proposta stampa «not at signing»):
//     né i Termini né il FAQ dicono «due at signing»; e il canone è
//     «anticipato, entro il 5» come nei modelli, non «il 1° del mese»;
//  9. «through Stripe» si dice solo dei pagamenti ALLA FIRMA: il canone va
//     anche per bonifico, e su carta porta la commissione di servizio
//     (api/payments/pay.js rentFee) — detta, mai taciuta sotto «one fee».
// 10. i Termini §4.3 dicono gratis la visita e la candidatura delle case del
//     CATALOGO e il Virtual Viewing a pagamento al prezzo di api/_catalog.js;
//     nessuna pagina dice «no viewing fees» senza dire di quali case.
//
// La suite legge di proposito file di altri pacchetti (index, apartments,
// apartment-detail, property-finding, llms.txt, ask-listing): diventa verde
// quando tutti i pacchetti P0 sono atterrati. Le regole mordono: in coda,
// ogni controllo viene rieseguito su un campione SBAGLIATO e deve fallire.

import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const elenco = (righe, max = 12) => '\n      ' + righe.slice(0, max).join('\n      ')
  + (righe.length > max ? `\n      … e altre ${righe.length - max}` : '');
const leggi = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const esiste = (f) => fs.existsSync(path.join(R, f));
const riga = (s, i) => s.slice(0, i).split('\n').length;

console.log('\n\x1b[1m▸ tenantfee\x1b[0m  la commissione dell\'inquilino: 10% di un anno di canone + IVA 22%, una volta');

// ── la regola, letta dalla porta che INCASSA ───────────────────────────
// Se un giorno create.js cambia default, questa suite deve accorgersene
// prima delle pagine: le frasi qui sotto valgono SOLO per questa regola.
const create = leggi('api/preagreement/create.js');
const pctDefault = create.match(/feePct\s*=\s*[^;]*num\(m\.feePct,\s*(\d+(?:\.\d+)?)\)/);
const vatDefault = create.match(/feeVatPct\s*=\s*[^;]*num\(m\.feeVatPct,\s*(\d+(?:\.\d+)?)\)/);
const baseAnno = /rent\s*\*\s*12\s*\*\s*feePct\s*\/\s*100/.test(create);
(pctDefault && +pctDefault[1] === 10 && vatDefault && +vatDefault[1] === 22 && baseAnno)
  ? bene('api/preagreement/create.js incassa ancora la regola A: 10% di rent × 12, IVA 22% sopra')
  : male('api/preagreement/create.js non dice più «10% di rent × 12 + IVA 22%» — '
      + 'le pagine e questa suite vanno riallineate alla regola nuova '
      + `(feePct=${pctDefault?.[1]}, feeVatPct=${vatDefault?.[1]}, base anno=${baseAnno})`);

// ── strumenti puri (riusati dalle mutazioni in coda) ───────────────────
function decodifica(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&euro;/g, '€')
    .replace(/&times;/g, '×').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[‘’]/g, "'");
}
function testoVisibile(html) {
  return decodifica(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function blocchiLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push({ ok: true, dato: JSON.parse(m[1]) }); }
    catch (e) { out.push({ ok: false, errore: e.message }); }
  }
  return out;
}
function stringheDi(x, acc = []) {
  if (typeof x === 'string') acc.push(decodifica(x).replace(/\s+/g, ' '));
  else if (Array.isArray(x)) x.forEach((v) => stringheDi(v, acc));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => stringheDi(v, acc));
  return acc;
}
function metaDescrizioni(html) {
  const out = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0];
    if (!/\b(?:name|property)=["'](?:description|og:description|twitter:description)["']/i.test(t)) continue;
    const c = t.match(/\bcontent=(["'])([\s\S]*?)\1/i);
    if (c) out.push(decodifica(c[2]).replace(/\s+/g, ' '));
  }
  return out;
}

// regola 1: ogni `* 12 * .10` deve portare `* 1.22` nella stessa espressione
function calcoliSenzaIva(src) {
  const fuori = [];
  for (const m of src.matchAll(/\*\s*12\s*\*\s*(0)?\.10?\b/g)) {
    const coda = src.slice(m.index + m[0].length).split(/[;\n]/)[0];
    if (!/\*\s*1\.22\b/.test(coda)) {
      fuori.push(`riga ${riga(src, m.index)}: ${src.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20).replace(/\s+/g, ' ').trim()}`);
    }
  }
  return fuori;
}
// regola 3: «10% of (the) annual rent» con l'IVA entro 120 caratteri
const FRASE = /10% of (one year's|a year's|the annual|annual) rent/gi;
function frasiSenzaIva(testo) {
  const fuori = [];
  for (const m of testo.matchAll(FRASE)) {
    const fine = m.index + m[0].length;
    if (!/\b(VAT|IVA)\b/.test(testo.slice(fine, fine + 120))) {
      fuori.push(testo.slice(Math.max(0, m.index - 30), fine + 60).trim());
    }
  }
  return fuori;
}
// regola 9: «every euro/payment (goes) through Stripe» senza «at signing»
// promette ciò che il canone per bonifico non fa
const STRIPE_TUTTO = /\bevery (?:euro|payment)\s+(?:moves\s+|goes\s+)?through Stripe\b(?![^.]{0,20}\bor bank transfer)/gi;
function promesseStripe(testo) {
  return [...testo.matchAll(STRIPE_TUTTO)].map((m) => testo.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim());
}

// regola 10: «no viewing fees» detto senza dire DI QUALI CASE contraddice il
// Virtual Viewing (€89, api/_catalog.js), che è una visita a pagamento per un
// annuncio trovato altrove. La frase vera nomina le case del catalogo.
const VISITE_NUDE = /\bno viewing (?:or application )?fees?\b|<li>\s*Viewing fees\s*<\/li>/gi;
function visiteGratisNude(testo) {
  return [...testo.matchAll(VISITE_NUDE)].map((m) => testo.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim());
}
// i Termini §4.3: cosa non si paga e cosa è facoltativo, al prezzo del catalogo
function difettiSez43(html, vv) {
  const sez = (html.match(/4\.3 What we do not charge, and what is optional([\s\S]*?)<\/div>/) || [])[1];
  if (!sez) return ['la sezione «4.3 What we do not charge, and what is optional» non si trova'];
  const t = testoVisibile(sez);
  const via = [];
  /to view a home in our catalogue, in person or on a live video call/.test(t) || via.push('non dice che la visita delle case del catalogo è gratis');
  /to apply for a home in our catalogue/.test(t) || via.push('non dice che candidarsi a una casa del catalogo è gratis');
  t.includes(`Virtual Viewing (€${vv.eur})`) || via.push(`non dice il Virtual Viewing al prezzo del catalogo (€${vv.eur})`);
  (/listing you found elsewhere/.test(t)) || via.push('non dice che il Virtual Viewing è per un annuncio trovato altrove');
  (/credited to the commission in §4\.1/.test(t) && /\bcredited\b/i.test(vv.desc)) || via.push('non dice che il Virtual Viewing si scala dalla commissione (§4.1), come dice il catalogo');
  (/refunded in full if we cannot reach the property/.test(t) && /refunded in full if we cannot reach the property/i.test(vv.desc)) || via.push('non dice il rimborso del Virtual Viewing come lo dice il catalogo');
  /card fee, shown on the payment page before you confirm/.test(t) || via.push('non dice la commissione della carta sul canone (api/payments/pay.js rentFee)');
  visiteGratisNude(sez).length && via.push('elenca ancora «Viewing fees» fra le cose che non si pagano');
  return via;
}

// regola 5: ogni domanda del FAQPage = la <details> visibile, parola per parola
function faqDivergenti(html) {
  const visibili = new Map();
  for (const m of html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    visibili.set(testoVisibile(m[1]), testoVisibile(m[2]));
  }
  const fuori = [];
  let domande = 0;
  for (const b of blocchiLd(html)) {
    if (!b.ok) continue;
    const nodi = [].concat(b.dato['@graph'] || b.dato);
    for (const n of nodi) {
      if (!n || n['@type'] !== 'FAQPage') continue;
      for (const q of [].concat(n.mainEntity || [])) {
        domande++;
        const nome = decodifica(String(q.name || '')).replace(/\s+/g, ' ').trim();
        const risposta = decodifica(String(q.acceptedAnswer?.text || '')).replace(/\s+/g, ' ').trim();
        if (!visibili.has(nome)) fuori.push(`«${nome}» non è una domanda visibile`);
        else if (visibili.get(nome) !== risposta) {
          fuori.push(`«${nome}»\n        JSON-LD: ${risposta.slice(0, 140)}\n        pagina:  ${visibili.get(nome).slice(0, 140)}`);
        }
      }
    }
  }
  return { fuori, domande };
}

// ── 1 · i calcolatori in pagina sommano l'IVA ──────────────────────────
// blog-cost-calculator.html è un calcolatore del MERCATO (non della
// commissione BOOM): la regola vale se e dove calcola il 10% dell'anno.
const CALCOLATORI = ['index.html', 'apartments.html', 'apartment-detail.html',
  'your-money.html', 'try.html', 'blog-cost-calculator.html'];
{
  const fuori = [];
  let visti = 0;
  for (const f of CALCOLATORI) {
    if (!esiste(f)) { fuori.push(`${f} → file assente`); continue; }
    const s = leggi(f);
    visti += [...s.matchAll(/\*\s*12\s*\*\s*(0)?\.10?\b/g)].length;
    for (const x of calcoliSenzaIva(s)) fuori.push(`${f} ${x}`);
  }
  fuori.length
    ? male(`${fuori.length} calcoli della commissione senza «* 1.22» — il totale mostrato sarebbe più basso di quello che la proposta chiede:` + elenco(fuori))
    : bene(`ogni calcolo della commissione in pagina porta l'IVA (${visti} calcoli in ${CALCOLATORI.length} file)`);
}

// ── 2 · i Termini §4.1: la regola e l'esempio che si rifà ──────────────
const terms = leggi('terms.html');
{
  const sezione = (terms.match(/4\.1 Standard Commission([\s\S]*?)4\.2 Property Finding/) || [])[1] || '';
  const t41 = testoVisibile(sezione);
  // ricalcolo: rent 1.200 → 10% × 12 = 1.440, IVA 22% = 316,80, totale 1.756,80, − PFS 350
  const canone = 1200, pfs = 350;
  const fee = canone * 12 * 0.10;
  const iva = Math.round(fee * 0.22 * 100) / 100;
  const tot = Math.round((fee + iva) * 100) / 100;
  const netto = Math.round((tot - pfs) * 100) / 100;
  const en = (n) => '€' + n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  const attese = [en(canone), en(fee), en(iva), en(tot), en(netto)];
  const mancano = attese.filter((x) => !t41.includes(x));
  (!sezione) ? male('terms.html: la sezione 4.1 non si trova più')
    : mancano.length
      ? male(`terms.html §4.1: l'esempio non torna con 10% × 12 + IVA 22% — mancano ${mancano.join(', ')}`)
      : bene(`terms.html §4.1: l'esempio si rifà dall'aritmetica (${en(canone)} → ${en(fee)} + ${en(iva)} IVA = ${en(tot)}; − ${en(pfs)} = ${en(netto)})`);
  (t41.includes('€1,756.80') && t41.includes('€1,406.80'))
    ? bene('terms.html §4.1 stampa €1,756.80 e €1,406.80')
    : male('terms.html §4.1 non stampa €1,756.80 e/o €1,406.80');
  /whichever is lower/i.test(sezione) || /One month's rent, OR/i.test(sezione)
    ? male('terms.html §4.1 dice ancora «una mensilità OPPURE il 10%, il più basso»')
    : bene('terms.html §4.1 non ha più l\'alternativa «una mensilità / il più basso»');
  /10% of one year's rent \(monthly rent × 12 × 10%\), whatever the length of the lease/.test(t41)
    ? bene('terms.html §4.1 dice la regola: 10% di un anno di canone, qualunque sia la durata')
    : male('terms.html §4.1 non dice «10% of one year\'s rent (monthly rent × 12 × 10%), whatever the length of the lease»');
  /signed from 15 October 2026; agreements signed earlier keep the terms they were signed under/.test(t41)
    ? bene('terms.html §4.1 dichiara da quando vale (15 ottobre 2026) e salva i contratti già firmati')
    : male('terms.html §4.1 non dichiara la decorrenza della regola (accordi firmati dal 15 ottobre 2026)');
  /written in your pre-agreement before anything is paid/.test(t41)
    ? bene('terms.html §4.1 rinvia alla cifra scritta nella proposta')
    : male('terms.html §4.1 non rinvia alla cifra scritta nella proposta prima di pagare');
  // the date the terms say they were updated must not predate the §4.1 rule
  // they carry (15 October 2026); pinning ONE date broke at every later edit
  // of the terms (the city desks' §12 moved it to 22 October)
  {
    const m = terms.match(/Last Updated: (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/);
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const at = m ? Date.UTC(+m[3], MONTHS.indexOf(m[2]), +m[1]) : NaN;
    // a real calendar day (31 February rolls over) and never in the future:
    // a typo'd year would otherwise pass for ever
    const real = m && new Date(at).getUTCDate() === +m[1];
    real && at >= Date.UTC(2026, 9, 15) && at <= Date.now() + 864e5
      ? bene(`terms.html: «Last Updated: ${m[1]} ${m[2]} ${m[3]}», non prima della regola del 15 ottobre 2026`)
      : male('terms.html: la data di aggiornamento manca, non è un giorno vero, è nel futuro o precede il 15 ottobre 2026, quando §4.1 è entrata in vigore');
  }
}

// ── 3 · «10% of the annual rent» non viaggia mai senza IVA ─────────────
const sitemap = leggi('sitemap.xml');
const pubbliche = [];
for (const u of [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
  const rel = u.replace(/^https?:\/\/[^/]+\/?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  const f = rel === '' ? 'index.html' : (rel.endsWith('.html') ? rel : rel + '.html');
  if (esiste(f) && !pubbliche.includes(f)) pubbliche.push(f);
}
{
  const fuori = [], ldRotti = [];
  let frasi = 0;
  for (const f of pubbliche) {
    const s = leggi(f);
    const fonti = [['testo', testoVisibile(s)], ...metaDescrizioni(s).map((x) => ['meta', x])];
    for (const b of blocchiLd(s)) {
      if (!b.ok) { ldRotti.push(`${f} → ${b.errore}`); continue; }
      for (const x of stringheDi(b.dato)) fonti.push(['JSON-LD', x]);
    }
    for (const [dove, testo] of fonti) {
      frasi += [...testo.matchAll(FRASE)].length;
      for (const x of frasiSenzaIva(testo)) fuori.push(`${f} (${dove}) → …${x}…`);
    }
  }
  for (const f of ['llms.txt', 'api/ask-listing.js']) {
    const s = decodifica(leggi(f)).replace(/\s+/g, ' ');
    frasi += [...s.matchAll(FRASE)].length;
    for (const x of frasiSenzaIva(s)) fuori.push(`${f} → …${x}…`);
  }
  ldRotti.length
    ? male(`${ldRotti.length} blocchi JSON-LD che non si leggono:` + elenco(ldRotti))
    : bene(`ogni JSON-LD delle ${pubbliche.length} pagine della sitemap si legge`);
  fuori.length
    ? male(`${fuori.length} volte «10% of the annual rent» senza l'IVA entro 120 caratteri:` + elenco(fuori))
    : bene(`«10% of the annual rent» arriva sempre con l'IVA (${frasi} frasi: ${pubbliche.length} pagine della sitemap, llms.txt, api/ask-listing.js)`);
}

// ── 4 · «whichever is lower» non esiste più ────────────────────────────
{
  const fuori = [];
  for (const f of [...pubbliche, 'llms.txt', 'api/ask-listing.js']) {
    const s = leggi(f).replace(/<!--[\s\S]*?-->/g, ' ');
    const m = s.match(/whichever is lower/i);
    if (m) fuori.push(`${f}:${riga(s, m.index)}`);
  }
  fuori.length
    ? male(`«whichever is lower» sopravvive in ${fuori.length} file — è la regola che il sistema non incassa:` + elenco(fuori))
    : bene('«whichever is lower» non compare in nessuna pagina della sitemap, in llms.txt né in api/ask-listing.js');
}

// ── 5 · /how-it-works: il FAQPage è la risposta visibile ───────────────
const hiw = leggi('how-it-works.html');
{
  const { fuori, domande } = faqDivergenti(hiw);
  !domande ? male('how-it-works.html: nessun FAQPage trovato')
    : fuori.length
      ? male(`how-it-works.html: ${fuori.length} risposte del FAQPage diverse da quelle visibili:` + elenco(fuori))
      : bene(`how-it-works.html: le ${domande} risposte del FAQPage sono parola per parola quelle in pagina`);
  const costo = (hiw.match(/<summary>What does BOOM cost\?<\/summary>([\s\S]*?)<\/details>/) || [])[1] || '';
  const tc = testoVisibile(costo);
  /One fee: 10% of the annual rent plus 22% VAT \(12\.2% of a year's rent in all\), charged once, when your pre-agreement states\./.test(tc)
    ? bene('how-it-works.html «What does BOOM cost?» dice 10% + IVA 22%, una volta, quando lo dice la proposta')
    : male('how-it-works.html «What does BOOM cost?» non dice «10% of the annual rent plus 22% VAT (12.2% …), charged once, when your pre-agreement states»');
  (!/charged once at signing|only other lines/i.test(tc)
    && /cedolare secca/.test(tc) && /stamp duty and half the registration tax/.test(tc)
    && /lease obligations have been checked/.test(tc) && /card fee shown before you pay/.test(tc))
    ? bene('how-it-works.html «What does BOOM cost?»: niente «at signing» né «only other lines»; bollo e metà registro senza cedolare, deposito dopo la verifica, commissione carta detta')
    : male('how-it-works.html «What does BOOM cost?» tace bollo/registro, la verifica del deposito o la commissione carta, o dice ancora «at signing»/«only other lines»');
}

// ── 6 · nessuna offerta SEPA ai nuovi inquilini ────────────────────────
// CLAUDE.md (Area casa, 05/10): rimossa l'offerta di nuovi mandati SEPA,
// conservati stato e revoca di quelli già attivi. Le pagine di vendita non
// possono promettere ciò che /casa non offre più.
{
  const fuori = ['how-it-works.html', 'your-money.html', 'try.html']
    .filter((f) => /\bSEPA\b/.test(leggi(f)));
  fuori.length
    ? male('SEPA è ancora offerto in: ' + fuori.join(', '))
    : bene('nessuna offerta SEPA in how-it-works, your-money e try');
}

// ── 7 · il recesso dei Termini è quello dei nostri modelli ─────────────
{
  /30 days notice/i.test(terms)
    ? male('terms.html dice ancora «30 days notice» — nessun modello BOOM lo prevede')
    : bene('terms.html non dice più «30 days notice»');
  // i tre modelli: transitorio (B) e studenti (C) tre mesi, 3+2 (A) sei mesi
  const pdf = leggi('js/contract-pdf.js');
  const recessi = [...pdf.matchAll(/addArticle\(\d+,\s*'Recesso del conduttore',\s*`([^`]*)`/g)].map((m) => m[1]);
  const tre = recessi.filter((x) => /gravi motivi/.test(x) && /raccomandata/.test(x) && /tre mesi/.test(x)).length;
  const sei = recessi.filter((x) => /gravi motivi/.test(x) && /raccomandata/.test(x) && /sei mesi/.test(x)).length;
  (recessi.length === 3 && tre === 2 && sei === 1)
    ? bene('js/contract-pdf.js: recesso per gravi motivi con raccomandata — tre mesi (transitorio, studenti), sei mesi (3+2)')
    : male(`js/contract-pdf.js non dice più ciò che i Termini riportano (articoli recesso: ${recessi.length}, tre mesi: ${tre}, sei mesi: ${sei}) — riallineare §3.1`);
  const t31 = testoVisibile((terms.match(/3\.1 Lease Term([\s\S]*?)3\.2 Payments/) || [])[1] || '');
  const t72 = testoVisibile((terms.match(/7\.2 After Move-In([\s\S]*?)<\/div>/) || [])[1] || '');
  (/transitional and student leases, for serious reasons \(gravi motivi\) with three months' notice by registered letter/.test(t31)
    && /3\+2 lease, [^.]*six months' notice/.test(t31)
    && /landlord's written agreement/.test(t31))
    ? bene('terms.html §3.1: tre mesi (transitorio, studenti) e sei mesi (3+2) per gravi motivi, prima solo d\'accordo col locatore')
    : male('terms.html §3.1 non riporta il recesso dei modelli (gravi motivi, tre/sei mesi, raccomandata, accordo scritto del locatore)');
  (/follows the withdrawal clause of your lease \(see 3\.1\)/.test(t72) && /landlord agrees in writing/.test(t72)
    && !/until we find a replacement tenant/.test(t72))
    ? bene('terms.html §7.2 rinvia al §3.1 e non promette più la fine dell\'obbligo «quando troviamo un sostituto»')
    : male('terms.html §7.2 non rinvia alla clausola di recesso o promette ancora la sostituzione');
}

// ── 7b · il QUANDO della commissione e il giorno del canone ────────────
{
  const feeDue = (create.match(/const feeDue\s*=[^;]*:\s*'([a-z-]+)'\s*;/) || [])[1];
  feeDue === 'separate'
    ? bene("api/preagreement/create.js: la commissione è «separate» di default (la proposta stampa «not at signing»)")
    : male(`api/preagreement/create.js: feeDue di default è «${feeDue}» — Termini e FAQ dicono «quando lo dice la proposta», ricontrollare`);
  const t41 = testoVisibile((terms.match(/4\.1 Standard Commission([\s\S]*?)4\.2 Property Finding/) || [])[1] || '');
  (/payable at the time stated in your pre-agreement/.test(t41) && !/due at (signing|signature)/i.test(t41)
    && /€1,406\.80 left to pay/.test(t41))
    ? bene('terms.html §4.1: la commissione si paga quando lo dice la proposta, mai «due at signing»')
    : male('terms.html §4.1 dice ancora «due at signing/signature» o non rinvia al momento scritto nella proposta');
  const t31 = testoVisibile((terms.match(/3\.1 Lease Term([\s\S]*?)3\.2 Payments/) || [])[1] || '');
  const pdf = leggi('js/contract-pdf.js');
  const rinnovoStudenti = /Alla prima scadenza il contratto si rinnova automaticamente per uguale periodo se il conduttore non comunica al locatore disdetta almeno tre mesi prima/.test(pdf);
  (rinnovoStudenti && /student lease it renews automatically for the same period at its first expiry unless you give the landlord notice at least three months before it expires/.test(t31))
    ? bene('terms.html §3.1: il contratto studenti si rinnova da solo alla prima scadenza senza disdetta a tre mesi (Allegato C art. 1)')
    : male('terms.html §3.1 non dice il rinnovo automatico del contratto studenti (o js/contract-pdf.js non lo prevede più)');
  const t32 = testoVisibile((terms.match(/3\.2 Payments([\s\S]*?)3\.3 Deposit/) || [])[1] || '');
  const giorno5 = /paymentDay\)\s*\|\|\s*contract\.paymentDay\s*\|\|\s*5\s*;/.test(pdf) && /\|\|\s*5\s*;/.test(pdf);
  (giorno5 && !/1st of each month/i.test(t32) && /paid in advance/.test(t32) && /by the 5th of the month unless the lease sets another day/.test(t32))
    ? bene('terms.html §3.2: canone anticipato, entro il 5 salvo diverso giorno nel contratto (come i modelli)')
    : male('terms.html §3.2 dice ancora «1st of each month» o non riporta il giorno dei modelli (entro il 5, anticipato)');
}

// ── 7c · «through Stripe» solo alla firma; la carta sul canone si paga ──
{
  const fuori = [];
  for (const f of ['how-it-works.html', 'your-money.html', 'try.html']) {
    const s = leggi(f);
    const fonti = [testoVisibile(s), ...metaDescrizioni(s)];
    for (const b of blocchiLd(s)) if (b.ok) fonti.push(...stringheDi(b.dato));
    for (const t of fonti) for (const x of promesseStripe(t)) fuori.push(`${f} → …${x}…`);
  }
  fuori.length
    ? male('«every euro/payment through Stripe» senza «at signing» — il canone va anche per bonifico:' + elenco(fuori))
    : bene('«through Stripe» è detto solo dei pagamenti alla firma (how-it-works, your-money, try)');
  const v = testoVisibile(hiw);
  (!/card or bank transfer/i.test(v) && (v.match(/card fee shown before you pay/g) || []).length >= 4)
    ? bene('how-it-works.html: dove il canone va su carta, la commissione carta è detta (accanto a «one fee»)')
    : male('how-it-works.html offre il canone «by card» senza dire la commissione carta, sotto la promessa «one fee»');
}

// ── 8 · le pagine di questo pacchetto: l'ente vero e nessuna promessa di tempo ─
{
  const PAGINE = ['terms.html', 'your-money.html', 'how-it-works.html', 'try.html'];
  const fuoriOrg = [], fuoriTempo = [];
  for (const f of PAGINE) {
    const s = leggi(f);
    const org = blocchiLd(s).filter((b) => b.ok).flatMap((b) => [].concat(b.dato['@graph'] || b.dato))
      .find((n) => n && n['@id'] === 'https://www.boomrome.com/#organization');
    const a = org?.address || {};
    if (!org) fuoriOrg.push(`${f} → nodo #organization assente`);
    else if (org.legalName !== 'Egidi Immobiliare S.r.l.' || org.vatID !== 'IT17322991005'
      || org.telephone !== '+39-331-325-1961' || a.streetAddress !== 'Via dei Coronari 181/184'
      || a.postalCode !== '00186' || a.addressLocality !== 'Roma' || a.addressRegion !== 'RM'
      || a.addressCountry !== 'IT') {
      fuoriOrg.push(`${f} → ${JSON.stringify({ legalName: org.legalName, vatID: org.vatID, telephone: org.telephone, address: a })}`);
    }
    const v = testoVisibile(s) + ' ' + metaDescrizioni(s).join(' ');
    const m = v.match(/\b(?:repl(?:y|ies)|respond(?:s)?|answer(?:s|ed)?)\b[^.]{0,40}\bwithin \d+\s*(?:hours?|minutes?)|24\/7|under 2 minutes/i);
    if (m) fuoriTempo.push(`${f} → «${m[0]}»`);
  }
  fuoriOrg.length
    ? male('nodo #organization diverso dal contratto condiviso (Egidi Immobiliare S.r.l., IT17322991005, Via dei Coronari 181/184):' + elenco(fuoriOrg))
    : bene('terms, your-money, how-it-works, try: #organization è Egidi Immobiliare S.r.l., P.IVA, telefono e sede operativa');
  fuoriTempo.length
    ? male('promesse numeriche sui tempi di risposta (decisione del fondatore: nessuna):' + elenco(fuoriTempo))
    : bene('nessuna promessa numerica sui tempi di risposta nelle pagine del pacchetto');
}

// ── 8b · §4.3: la visita del catalogo è gratis, il Virtual Viewing no ──
// Il reperto (31/10/2026): i Termini §4.3 dicevano «We do not charge:
// Viewing fees» e cinque pagine li citavano («no viewing fees… Terms §4.3»)
// mentre /virtual-viewing vende a €89 una visita in video, che è una visita
// a pagamento. Le due cose sono vere insieme solo se si dice DI QUALI CASE:
// le nostre si vedono gratis, l'annuncio trovato altrove no.
const { CATALOG } = await import(path.join(R, 'api/_catalog.js'));
const VV = CATALOG['virtual-viewing'];
{
  const via = difettiSez43(terms, VV);
  via.length
    ? male('terms.html §4.3 non dice cosa è gratis e cosa è facoltativo:' + elenco(via))
    : bene(`terms.html §4.3: visita e candidatura del catalogo gratis, Virtual Viewing a €${VV.eur} come il catalogo (scalato dalla commissione, rimborsato se non si raggiunge la casa), la commissione carta detta`);
  const fuori = [];
  for (const f of [...pubbliche, 'llms.txt']) {
    const s = leggi(f);
    const fonti = f.endsWith('.txt') ? [s] : [testoVisibile(s), ...metaDescrizioni(s)];
    if (!f.endsWith('.txt')) for (const b of blocchiLd(s)) if (b.ok) fonti.push(...stringheDi(b.dato));
    for (const t of fonti) for (const x of visiteGratisNude(t)) fuori.push(`${f} → …${x}…`);
  }
  fuori.length
    ? male('«no viewing fees» senza dire di quali case — il Virtual Viewing costa €' + VV.eur + ':' + elenco(fuori))
    : bene(`nessuna pagina pubblica né llms.txt dice «no viewing fees» senza il catalogo (${pubbliche.length} pagine + llms.txt)`);
}

// ── 9 · le regole mordono: campioni SBAGLIATI devono essere presi ──────
{
  const prese = [];
  visiteGratisNude('transparent pricing with no viewing or application fees (Terms §4.3)').length === 1
    || prese.push('«no viewing or application fees» non preso');
  visiteGratisNude('No viewing fees, no application fees (§4.3).').length === 1
    || prese.push('«No viewing fees» non preso');
  visiteGratisNude('viewing or applying for a home in our catalogue costs nothing (Terms §4.3)').length === 0
    || prese.push('la frase giusta col catalogo rifiutata');
  const vecchio43 = terms.replace(/<p><strong>4\.3 What we do not charge[\s\S]*?(?=<\/div>)/,
    '<p><strong>4.3 What we do not charge, and what is optional</strong><br>We do not charge:</p><ul><li>Viewing fees</li><li>Application fees</li></ul>');
  vecchio43 !== terms && difettiSez43(vecchio43, VV).length >= 3
    || prese.push('il vecchio §4.3 («We do not charge: Viewing fees») non preso');
  difettiSez43(terms.replace(`Virtual Viewing</a> (€${VV.eur})`, 'Virtual Viewing</a> (€99)'), VV).some((x) => /prezzo del catalogo/.test(x))
    || prese.push('un prezzo del Virtual Viewing diverso dal catalogo non preso');
  calcoliSenzaIva('var fee = Math.round(p * 12 * .10);').length === 1 || prese.push('calcolo senza IVA non preso');
  calcoliSenzaIva('var fee = Math.round(p * 12 * 0.1);').length === 1 || prese.push('calcolo «0.1» senza IVA non preso');
  calcoliSenzaIva('var fee = Math.round(p * 12 * .10); var t = fee * 1.22;').length === 1 || prese.push('IVA in un\'altra istruzione accettata');
  calcoliSenzaIva('var fee = Math.round(p * 12 * .10 * 1.22);').length === 0 || prese.push('calcolo giusto rifiutato');
  frasiSenzaIva('One fee: 10% of the annual rent, charged once at signing. First month and deposit are the only other lines.').length === 1
    || prese.push('frase senza IVA non presa');
  frasiSenzaIva('10% of one year\'s rent (monthly rent × 12 × 10%), whatever the length of the lease. The commission is subject to Italian VAT').length === 0
    || prese.push('frase con IVA entro 120 caratteri rifiutata');
  const faqRotta = '<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q?","acceptedAnswer":{"@type":"Answer","text":"One fee: 10% of the annual rent plus 22% VAT."}}]}</script>'
    + '<details class="faq-v"><summary>Q?</summary><p>One fee: 10% of the annual rent.</p></details>';
  faqDivergenti(faqRotta).fuori.length === 1 || prese.push('FAQPage diverso dalla pagina accettato');
  promesseStripe('one fee; every payment through Stripe, receipted.').length === 1 || prese.push('«every payment through Stripe» non preso');
  promesseStripe('Every euro through Stripe, receipted.').length === 1 || prese.push('«Every euro through Stripe» non preso');
  promesseStripe('Every payment goes through Stripe with a receipt.').length === 1 || prese.push('«goes through Stripe» non preso');
  promesseStripe('Every payment at signing goes through Stripe with a receipt.').length === 0 || prese.push('«at signing» rifiutato');
  promesseStripe('Every euro moves through Stripe or bank transfer, on record.').length === 0 || prese.push('«Stripe or bank transfer» rifiutato');
  prese.length
    ? male('una regola non morde più:' + elenco(prese))
    : bene('le regole mordono: calcolo senza IVA, IVA altrove, frase senza IVA, FAQ divergente e «tutto via Stripe» vengono presi');
}

console.log(ko ? `  \x1b[31mLa commissione non è ancora detta come la incassiamo\x1b[0m — ${ok} passed, ${ko} failed`
               : `  \x1b[32mLa commissione è detta come la incassiamo\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
