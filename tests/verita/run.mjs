// tests/verita/run.mjs — suite `verita`
// LE FRASI CHE NON DICIAMO PIU', IN NESSUNA PAGINA.
//
// Il giro GEO/SEO/AI del 15/10/2026 ha trovato le stesse promesse false
// sparse su decine di superfici, ognuna corretta dal suo pacchetto: supporto
// «24/7» e risposte «under 2 minutes» o «within 2 hours» (decisione 3 del
// fondatore: nessun tempo di risposta in cifre, da nessuna parte), «500+»
// clienti mai contati e un «98% Success Rate» mai misurato, un
// «English-language lease» (il contratto e' il modello ufficiale italiano,
// registrato all'Agenzia delle Entrate e SPIEGATO in inglese), la
// «deposit protection» che BOOM non offre, statistiche mai misurate, una
// revisione «da avvocato» e PayPal mai integrati, un preavviso di «30 days»
// che i nostri modelli di contratto non dicono, la commissione «whichever is
// lower» (la regola incassata e' il 10% di un anno di canone + IVA 22%, una
// volta), «5+ options within 10 days» (le Condizioni §4.2: almeno 3 entro 15
// giorni), «voidable» dove la legge dice nullo, «ARPE-certified», un menu
// concierge di servizi che non si vendono, e «all-in» sui canoni.
//
// Ogni pacchetto ha la sua guardia sulle SUE pagine. Questa e' quella
// TRASVERSALE: una frase tolta da una pagina non deve poter rientrare da
// un'altra — e un motore di risposta cita la frase piu' netta che trova,
// ovunque la trovi.
//
// Dove si guarda (tutto cio' che un motore legge o riceve):
//   · ogni pagina della sitemap: il testo VISIBILE (script, stili e
//     commenti tolti; <noscript> resta, e' cio' che legge chi non esegue
//     JS), gli attributi che si leggono (meta content, alt, title,
//     aria-label, placeholder, i data-* dei contatori, resi come
//     nome="valore") e TUTTE le stringhe dei JSON-LD. I contatori animati
//     (data-count/data-fine/… + data-suffix/data-suff/data-suf) si leggono
//     come li legge chi guarda la pagina: il valore finale col suffisso AL
//     POSTO del segnaposto «0», cioe' accanto alla sua etichetta («98%
//     Success Rate», non «98%» da solo in un elenco a parte);
//   · apartment-detail.html, il modello da cui api/listing.js serve OGNI
//     /listing/<id>: non e' nella sitemap, ma e' il corpo che i crawler
//     ricevono per ogni casa, e si legge come una pagina;
//   · llms.txt e scripts/seo-config.js (la sorgente delle descrizioni);
//   · la sorgente di api/listing.js, api/llms-listings.js e
//     api/ask-listing.js (la scheda servita, il catalogo per le AI e il
//     prompt dell'assistente della scheda);
//   · la sorgente delle EMAIL che partono da sole: api/apply-lead.js (la
//     conferma della candidatura), api/search/matcher.js (il digest delle
//     ricerche salvate), api/stripe-webhook.js (le conferme di pagamento) e
//     api/viewings/_email.js (la richiesta di visita appena prenotata, che
//     prometteva «within a few hours» / «entro poche ore»).
//     Le pagine avevano tolto i tempi di risposta in cifre e le email li
//     spedivano ancora: «A human answers within 2 hours», «Within a few
//     hours», la shortlist PFS «Within 72 hours» contro le Condizioni §4.2.
//     Per queste quattro vale una regola in piu', piu' larga: nessun «within
//     N hours», «entro N ore», «within a few/two hours», «entro poche ore». Una consegna di
//     prodotto venduta in pagina (il verdetto del Contract Check in 24h
//     dalla ricezione) si scrive come la scrive la pagina, mai come una
//     risposta.
// «all-in» vale solo per llms.txt e i file api: nelle pagine «all-in»
// e' anche il totale mensile dichiarato riga per riga.
//
// Ogni regola fallisce col file, la frase trovata e il perche' in una riga.
// E ogni regola si prova PRIMA su una frase cattiva: un pattern inerte
// darebbe un verde che non guarda niente.
//
// MUTAZIONE (verificata il 15/10/2026 su una copia, VERITA_ROOT=<copia>):
// rimettendo «24/7 WhatsApp support» in about.html, «whichever is lower» in
// terms.html, «all-inclusive» in llms.txt e «English-language lease» nel
// prompt di api/ask-listing.js, cade ciascuna la sua regola e solo quella;
// cosi' anche «Verified reviews» nella meta description di /contact, un
// contatore data-fine="500" o data-count="500"+data-suffix="+" nella home,
// «fully insured» dentro una stringa del Dataset di /meteo, il contatore di
// HEAD in about.html (<div data-count="98" data-suffix="%">0</div><div>
// Success Rate</div> → «98% Success») e quello della home con data-suff,
// «A person replies within 2 hours.» in faq.html, «We reply within 2 hours»
// in api/ask-listing.js e «An English-language lease.» in
// apartment-detail.html. NON fanno cadere niente, per scelta: «all-in» in
// una pagina della sitemap (fuori ambito), «24/7» dentro un commento HTML
// (non e' testo che si legge) e «an island you cross in two hours» di
// /reunion (un tempo di viaggio, non una risposta).
// MUTAZIONE delle email (stessa prova): rimettendo «A human answers within
// 2 hours.» in api/search/matcher.js, «r1_value: 'Within 2 hours'»,
// «'Within 72 hours'», «'Within a few hours'» o «Entro 48 ore dai dati» in
// api/stripe-webhook.js o «Rispondiamo entro 4 ore» in api/apply-lead.js,
// cade la regola delle email (e, per la prima, anche quella delle pagine).
//
// LA DURATA (in coda, regola a se'): con BOOM si affitta da 3 MESI in su,
// mai da 1 (decisione del fondatore, 15/10/2026; le Condizioni lo dicevano
// gia': «All leases through BOOM have a minimum duration of 3 months»). Le
// pagine presentavano il transitorio come l'offerta «1–18 months» — /executive
// in nove punti fra meta, dati strutturati, scheda, FAQ e modulo (piu' il
// «2–9 months» del cinema), llms.txt in quattro, /owners in tre («da un mese
// in su»), la home nelle sue FAQ — e un motore di risposta
// cita quello che trova: «BOOM affitta da un mese». E' una regola di CLASSE:
// cade qualunque durata che parte sotto i 3 mesi, nelle cinque famiglie di
// forme scritte accanto al rilevatore e provate una per una nelle frasi
// cattive (EN/IT/FR, in cifre o a parole, in mesi, settimane o giorni):
// la fascia («1–18 months», «1–18-month leases», «1−18 mesi», «da 1 a 18
// mesi», «1 month to 18 months», «between one month and 18 months», «2–9
// months»), il «da» («from one month», «from 30 days», «a partire da un
// mese», «à partir d'un mois»), il minimo («Minimum 1 month», «Minimum
// stay: 1 month», «Minimum term — 1 month», «durata minima di un mese»,
// «1-month minimum»), il «o piu'» («1+ months», «a month or more», «4 weeks
// or more», «da un mese in su») e la durata come nome dell'offerta
// («one-month leases», «stays of one month», «contratto di un mese»). Una
// forma che non sta in queste famiglie non cade: e' un elenco chiuso, non
// «ogni forma» — quando ne compare una nuova, si aggiunge alla sua famiglia
// e alle frasi cattive. Si guarda in ogni paragrafo delle pagine della
// sitemap e del modello delle schede, in ogni riga di llms.txt, seo-config,
// js/whatsapp-replies.js (le risposte che partono dal telefono),
// js/conto-engine.js (le etichette del conto dei proprietari, servite su
// /canone, /owners e /pacchetto-concordato) e delle sorgenti api qui sopra.
// Il paragrafo e' il blocco della pagina (p, li, dd, cella, risposta della
// FAQ…), ogni stringa dei JSON-LD e ogni attributo letto, la riga dei file
// di testo e dei sorgenti.
// Non sono durate, e non cadono: il deposito («1–2 months of rent»), il
// preavviso, un'attesa («Typical wait: 1–3 months»), un anticipo («at least
// one month before you land»), «from one month to the next», gli arretrati
// («two months or more behind on rent»), le buste paga, gli anni («from 1 to
// 2 years»), i giorni di una pratica («within 30 days of signing»). Una
// fascia corta (che finisce sotto i 6 mesi) e le altre forme senza un nome
// d'offerta contano solo se il paragrafo parla di contratto, soggiorno,
// incarico o case: «Register your residency · hard · 1-2 months» e' il
// tempo di una pratica, non un affitto. E non cade la frase che NEGA il mese
// nella sua proposizione («never offer a one-month lease», «mai proporre un
// contratto di un mese»): e' quella che un prompt o una FAQ scrivono proprio
// per dire il minimo. La negazione vale a due parole al massimo e fino alla
// punteggiatura: «No hidden fees, leases from 1 month» cade.
// L'eccezione, dichiarata: il fatto di LEGGE (il transitorio ammette da 1 a
// 18 mesi, art. 5 L. 431/98 e DM 16/01/2017) resta dicibile solo nel
// paragrafo che lo dice da legge E nomina, nello stesso paragrafo, il minimo
// BOOM di 3 mesi — la guida ai contratti spiega la legge, ma chi la legge
// non deve uscirne con la promessa sbagliata. La legge da sola non basta:
// «Italy's fixed-term lease: 1 to 18 months, under art. 5 of law 431/98»
// (la FAQ di /executive com'era) cade.
// MUTAZIONE (15/10/2026, su una copia con VERITA_ROOT, 12 su 12 prese dalla
// sola regola della durata): «1 to 18 months» nella FAQ visibile di
// executive.html, «1–18 months» nel suo og:description, «Term 1–18 MONTHS»
// nella cartolina del contratto, «Productions in town 2–9 months»; «from one
// month up» e «da un mese in su» in owners.html; «(1 to 12+ months)» in
// llms.txt; «Leases from 1 month» in js/whatsapp-replies.js e in
// scripts/seo-config.js; «For 1–18 months, a contratto transitorio» in
// moving-to-rome.html; e i paragrafi di legge privati del minimo BOOM («with
// BOOM the minimum is 3 months» tolto dalla scheda del transitorio in
// blog-contract-types.html, «BOOM's minimum is 3 months» tolto da faq.html).
// La prima prova ha MANCATO la FAQ di /executive: la risposta inglese e quella
// italiana stavano nello stesso <div>, e il «con BOOM da 3 a 18 mesi» italiano
// copriva il «1 to 18 months» inglese — da li' le span di lingua separate.
// LA REVISIONE (15/10/2026, sera): la prima versione diceva «in ogni forma»
// e lasciava passare forme comuni — un revisore le ha rimesse in pagine vere
// e la guardia restava verde. Riscritta a famiglie; MUTAZIONE su una copia,
// 13 su 13 prese dalla sola regola della durata: «Registered transitional
// 1–18-month leases» nell'og:description di executive.html, «on assignment
// for 1 month to 18 months» e «for 4 weeks or more» nella stessa pagina;
// «durata minima di un mese», «minimum stay: 1 month» e «contratti da un
// mese a diciotto mesi» in owners.html; «(a month or more)», «between one
// month and 18 months» e «1-month minimum» in llms.txt; «(from 30 days)» in
// faq.html; «1−18 months» (U+2212) e «one-month leases» in
// moving-to-rome.html; «minimum term — 1 month» in js/conto-engine.js. E sul
// rilevatore stesso (le frasi cattive e buone qui sotto sono la sua prova):
// tolta la famiglia del nome, allargata la negazione a sei parole, spenta la
// negazione, tolti gli arretrati, letti gli anni come mesi, tolta l'unita'
// dopo il primo numero, tolto il meno vero, tolto «minimo/minima» — cade
// ogni volta una delle due prove.

import fs from 'node:fs';
import path from 'node:path';

// VERITA_ROOT: solo per le prove di mutazione su una copia dell'albero.
const R = process.env.VERITA_ROOT ? path.resolve(process.env.VERITA_ROOT)
  : path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const elenco = (righe, max = 14) => '\n      ' + righe.slice(0, max).join('\n      ')
  + (righe.length > max ? `\n      … e altre ${righe.length - max}` : '');

// ── le regole ──────────────────────────────────────────────────────────
// soloFonti: la regola vale solo per llms.txt e i tre file api.
const REGOLE = [
  { re: /24\/7/, cattiva: '24/7 WhatsApp support',
    perche: 'nessun supporto 24 ore su 24: una persona risponde in orario d\'ufficio (ora di Roma), il resto il mattino lavorativo dopo' },
  // Il lookbehind lascia passare le fasce di prezzo («€1,500–2,500+/month»
  // nella guida ai quartieri): e' «500+» come CONTEGGIO che non diciamo.
  { re: /(?<![\d.,])500\+|data-fine="500"/, cattiva: '500+ happy tenants',
    perche: '«500+» non e\' un numero misurato: nessun dato del repo conta quei clienti' },
  { re: /under 2 minutes|2-minute average|Min response|respond in under/i, cattiva: 'we respond in under 2 minutes',
    perche: 'nessun tempo di risposta in cifre, da nessuna parte (decisione del fondatore, 15/10/2026)' },
  // «within 2 hours» nudo cadrebbe su /reunion («an island you cross in two
  // hours», un tempo di viaggio): serve davanti chi risponde o arriva (un
  // verbo, «a human», «emergencies»), nella stessa frase. Le forme sono
  // quelle che HEAD diceva davvero: «a person replies within 2 hours»,
  // «A human, within two hours», «emergencies within 2 hours», «someone
  // arrives within 2 hours», «reply in 2h», «Rispondiamo entro 2 ore».
  { re: /(?:repl(?:y|ies|ied)|respon(?:d|ds|se|ses)|answer(?:s|ed)?|get back|arriv(?:e|es|al)|contact you|confirm|human|person|someone|emergenc(?:y|ies)|rispo(?:sta|nd\w*)|ricontatt\w*)[^.<\n]{0,40}?\b(?:(?:with)?in|entro)\s+(?:2(?!\d)|two|due)\s*(?:hours?|h|ore)\b|\b(?:2|two)-hour (?:reply|response|answer)/i,
    cattiva: 'a person replies within 2 hours',
    perche: 'nessun tempo di risposta in cifre, da nessuna parte (decisione 3 del fondatore, 15/10/2026)' },
  { re: /building-exact|\borbit around/i, cattiva: 'a 3D orbit around the building',
    perche: 'il 3D fotorealistico non e\' erogabile e il pin e\' «esatto» solo con via+civico verificati (js/boom-geo.js)' },
  { re: /English-language (registered )?(lease|contract)|English contracts?\b|in English and Italian|contracts? in English\b|anche in inglese/i, cattiva: 'an English-language lease',
    perche: 'il contratto e\' il modello ufficiale italiano, registrato all\'Agenzia delle Entrate e spiegato in inglese' },
  { re: /deposit protection|protected deposit|held safe with guarantees/i, cattiva: 'full deposit protection',
    perche: 'nessuna tutela del deposito che BOOM non offre: il deposito segue la clausola del contratto' },
  { re: /95% approval|Over 40%|70% of international|€80\/month|98% success|fully insured|€47K|Average savings/i, cattiva: '98% success rate',
    perche: 'statistica o garanzia mai misurata: nessun numero senza una fonte nel repo' },
  { re: /verified reviews/i, cattiva: 'verified reviews',
    perche: 'nessun sistema verifica le recensioni: «verified» e\' una promessa senza meccanismo' },
  { re: /Lawyer contract review|PayPal/i, cattiva: 'Lawyer contract review via PayPal',
    perche: 'BOOM e\' un\'agenzia, non uno studio legale, e PayPal non e\' integrato (carta via Stripe, bonifico)' },
  { re: /30 days(’|')? (written )?notice/i, cattiva: "30 days' notice",
    perche: 'il preavviso e\' quello della clausola di recesso dei nostri modelli (js/contract-pdf.js), non 30 giorni' },
  { re: /whichever is lower/i, cattiva: 'one month or 10%, whichever is lower',
    perche: 'la commissione e\' il 10% di un anno di canone + IVA 22%, una volta (api/preagreement/create.js)' },
  { re: /within 10 days|5\+ curated/i, cattiva: '5+ curated options within 10 days',
    perche: 'Property Finding: almeno 3 opzioni nei criteri scritti entro 15 giorni, o i €350 restituiti (Condizioni §4.2)' },
  { re: /no broker fees|Zero hidden fees|Trusted by 500/i, cattiva: 'no broker fees',
    perche: 'c\'e\' una commissione e va detta (10% annuo + IVA); «Trusted by 500» e\' un numero mai misurato' },
  { re: /voidable|concordato minimum/i, cattiva: 'an unregistered lease is voidable',
    perche: 'affermazione legale non sostenuta: un contratto non registrato e\' nullo (L. 311/2004 art. 1 c. 346), nessun «minimo» automatico' },
  { re: /ARPE-certified/i, cattiva: 'ARPE-certified contracts',
    perche: 'BOOM non e\' «certificata ARPE»: l\'attestazione la rilascia l\'organizzazione firmataria, e non per ogni contratto' },
  { re: /€150\/doc|€60\/mo|All 30 services|Airport Transfer|Mail Service/i, cattiva: 'Airport Transfer · All 30 services',
    perche: 'servizio o prezzo che non esiste nel catalogo (api/_catalog.js)' },
  { re: /\ball-in(clusive)?\b/i, cattiva: 'all-inclusive monthly price', soloFonti: true,
    perche: '«all-in/all-inclusive» fa dire a un motore che utenze e spese sono comprese: si dice cosa c\'e\' nel prezzo' },
  // Le email automatiche: qui non serve il contesto («a human», «reply»)
  // della regola sulle pagine — un'email non parla di traghetti, e ogni
  // «within N hours» che parte da sola a un cliente e' una promessa di
  // tempo. Le consegne di prodotto si scrivono come le scrivono le loro
  // pagine («Written verdict in 24h · from when the contract reaches us»).
  { re: /within \d+ hours?|entro \d+ or[ae]|within (a few|two|a couple of) hours|entro (poche|qualche|due) or[ae]/i, cattiva: 'We review your application — Within 2 hours', soloEmail: true,
    perche: 'email automatica con un tempo in cifre: si scrive «during office hours (Rome time)» / «in orario d\'ufficio (ora di Roma)» (decisione del fondatore, 15/10/2026)' },
];

// ── i corpora ──────────────────────────────────────────────────────────
const leggi = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', euro: '€', hellip: '…', middot: '·', times: '×',
  plus: '+', percnt: '%' };
const decodifica = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] != null ? ENT[n.toLowerCase()] : m));
const stringhe = (x, out = []) => {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) for (const y of x) stringhe(y, out);
  else if (x && typeof x === 'object') for (const v of Object.values(x)) stringhe(v, out);
  return out;
};
const LD = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const ATTR_LETTI = /^(?:content|alt|title|aria-label|placeholder|data-[a-z0-9-]+)$/i;
// Il suffisso dei contatori ha tre grafie nel sito: data-suffix (about),
// data-suff (home), data-suf (plancia PFS).
const SUFFISSO = /^data-suf(?:f(?:ix)?)?$/;
// Un contatore: il tag col valore, e il testo che lo segue fino al tag dopo.
const CONTATORE = /<([a-z][a-z0-9-]*)\b([^>]*\bdata-(?:count|fine|to|target|value)\s*=\s*["']([^"']*)["'][^>]*)>([^<]*)/gi;

// Il testo di una pagina come lo legge un motore: visibile + attributi
// letti + stringhe dei JSON-LD.
function corpusPagina(s) {
  const ld = [];
  for (const m of s.matchAll(LD)) {
    try { ld.push(...stringhe(JSON.parse(m[1]))); } catch { ld.push(m[1]); }
  }
  const markup = s.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const attrs = [];
  for (const t of markup.matchAll(/<[a-z][a-z0-9-]*\b([^>]*)>/gi)) {
    const coppie = [...t[1].matchAll(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
      .map((m) => [m[1].toLowerCase(), m[2] != null ? m[2] : m[3]]);
    for (const [k, v] of coppie) if (ATTR_LETTI.test(k)) attrs.push(`${k}="${decodifica(v)}"`);
    // I contatori animati: il JS scrive «valore + suffisso» (500 + «+»).
    const val = coppie.find(([k]) => /^data-(?:count|fine|to|target|value)$/.test(k));
    const suf = coppie.find(([k]) => SUFFISSO.test(k));
    if (val && suf) attrs.push(val[1] + suf[1]);
  }
  // E nel testo visibile il valore finale prende il posto del segnaposto
  // («0», «0+», «€0»), cosi' sta accanto alla sua etichetta: «98% Success
  // Rate» si legge solo se 98% e Success Rate sono vicini. Solo un
  // segnaposto numerico viene sostituito: un testo vero accanto a un
  // data-target (un link di menu) resta com'e', e si controlla com'e'.
  const conValori = markup.replace(CONTATORE, (m, tag, at, val, testo) => {
    if (!/^[\s0-9.,+%h€$—–-]*$/.test(decodifica(testo))) return m;
    const suf = (at.match(/\bdata-suf(?:f(?:ix)?)?\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    return '<' + tag + at + '>' + decodifica(val) + decodifica(suf);
  });
  const visibile = decodifica(conValori.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  return [visibile, attrs.join('\n'), ld.join('\n')].join('\n');
}

const sitemap = leggi('sitemap.xml');
const pagine = [];
for (const u of [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
  const rel = u.replace(/^https?:\/\/[^/]+\/?/, '').replace(/\/$/, '');
  let f = rel === '' ? 'index.html' : (rel.endsWith('.html') ? rel : rel + '.html');
  if (!fs.existsSync(path.join(R, f)) && rel) f = rel + '/index.html';
  if (fs.existsSync(path.join(R, f))) pagine.push(f);
}
// Il modello della scheda: api/listing.js lo legge e lo serve come corpo di
// ogni /listing/<id>. Non e' nella sitemap, ma e' cio' che un crawler riceve.
if (fs.existsSync(path.join(R, 'apartment-detail.html'))) pagine.push('apartment-detail.html');
else male('apartment-detail.html non esiste: la guardia non puo guardare il corpo delle schede');
// Le email automatiche sono sorgenti api anche loro (valgono le regole
// delle fonti) e in piu' hanno la loro regola, soloEmail.
const EMAIL = ['api/apply-lead.js', 'api/search/matcher.js', 'api/stripe-webhook.js', 'api/viewings/_email.js'];
const FONTI = ['llms.txt', 'api/listing.js', 'api/llms-listings.js', 'api/ask-listing.js', ...EMAIL];
const corpora = [];                       // [file, testo, fonte?, email?]
for (const f of [...new Set(pagine)]) corpora.push([f, corpusPagina(leggi(f)), false, false]);
for (const f of ['scripts/seo-config.js', ...FONTI]) {
  if (fs.existsSync(path.join(R, f))) corpora.push([f, leggi(f), FONTI.includes(f), EMAIL.includes(f)]);
  else male(`${f} non esiste: la guardia non puo guardarlo`);
}

console.log(`\n\x1b[1m▸ verita\x1b[0m  le frasi che non diciamo piu: ${pagine.length - 1} pagine della sitemap, `
  + `il modello delle schede, llms.txt, seo-config e ${FONTI.length - 1} sorgenti api (${EMAIL.length} di email)`);

// ── il rilevatore morde? ───────────────────────────────────────────────
{
  const inerti = REGOLE.filter((r) => !r.re.test(r.cattiva)).map((r) => String(r.re));
  inerti.length ? male('regole che non riconoscono nemmeno la loro frase cattiva:' + elenco(inerti))
                : bene(`le ${REGOLE.length} regole riconoscono ciascuna la sua frase cattiva`);
}

// ── il giro ────────────────────────────────────────────────────────────
for (const r of REGOLE) {
  const g = new RegExp(r.re.source, r.re.flags.includes('g') ? r.re.flags : r.re.flags + 'g');
  const trovate = [], dove = new Map();
  for (const [f, testo, fonte, email] of corpora) {
    if (r.soloFonti && !fonte) continue;
    if (r.soloEmail && !email) continue;
    for (const m of testo.matchAll(g)) {
      const a = Math.max(0, m.index - 35), b = Math.min(testo.length, m.index + m[0].length + 35);
      const intorno = testo.slice(a, b).replace(/\s+/g, ' ').trim();
      trovate.push(`${f} → «${m[0]}» in «…${intorno}…»`);
      if (!dove.has(f)) dove.set(f, m[0]);
    }
  }
  const nome = String(r.re).slice(0, 70) + (r.soloFonti ? ' (llms.txt + api)' : '')
    + (r.soloEmail ? ' (email: ' + EMAIL.join(', ') + ')' : '');
  // La riga col ✗ porta da sola file e frase: tests/run-all.mjs stampa
  // soltanto le righe col ✗, e un rosso senza il «dove» non si ripara.
  const sintesi = [...dove].slice(0, 4).map(([f, x]) => `${f} «${x}»`).join(', ')
    + (dove.size > 4 ? ` e altri ${dove.size - 4} file` : '');
  trovate.length
    ? male(`${sintesi} (${trovate.length}×) — ${r.perche}` + elenco(trovate))
    : bene(`${nome} — assente`);
}

// ── la durata: con BOOM si affitta da 3 mesi in su ─────────────────────
// Il perche', le forme e l'eccezione di legge sono nell'intestazione. Qui il
// testo si legge a PARAGRAFI e non tutto di fila come sopra: l'eccezione
// vale solo se legge e minimo BOOM stanno nello stesso paragrafo, e una
// pagina letta di fila metterebbe accanto due frasi che il lettore non legge
// insieme.
//
// Fine parola anche dopo una lettera accentata («più»): \b senza il flag u
// conosce solo [A-Za-z0-9_], e dopo «ù» non vede nessun confine.
const FINE = '(?![A-Za-zÀ-ÿ0-9])';
// Le quantita', in cifre o a parole (EN/IT/FR). Ci sono anche quelle dei
// giorni e delle settimane («thirty days», «quattro settimane», «a couple
// of»): una promessa «from 30 days» vale «from one month».
const PAROLE_NUM = { a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, eighteen: 18, twenty: 20, 'twenty-four': 24, thirty: 30,
  sixty: 60, ninety: 90, 'a couple of': 2, 'a few': 3,
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  undici: 11, dodici: 12, quindici: 15, diciotto: 18, venti: 20, ventiquattro: 24, trenta: 30, sessanta: 60,
  novanta: 90, 'un paio di': 2, qualche: 3,
  une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15,
  'dix-huit': 18, vingt: 20, trente: 30, soixante: 60, 'quatre-vingt-dix': 90, quelques: 3 };
// Le alternative piu' lunghe prima: «dix-huit» prima di «dix», «una» prima di «un».
const parole = (ks) => ks.sort((x, y) => y.length - x.length).map((k) => k.replace(/ /g, '\\s+')).join('|');
const QTA = '(?:\\d{1,3}|' + parole(Object.keys(PAROLE_NUM)) + ')';
// L'estremo alto di una fascia: un numero, mai un articolo o «qualche».
const ALTO = '(?:\\d{1,2}|' + parole(Object.keys(PAROLE_NUM)
  .filter((k) => PAROLE_NUM[k] >= 2 && !/ /.test(k) && !['qualche', 'quelques'].includes(k))) + ')';
const numero = (w) => (/^\d+$/.test(w) ? Number(w) : PAROLE_NUM[w.toLowerCase().replace(/\s+/g, ' ')] || 0);
const U_MESI = '(?:months?|mesi|mese|mois)';
const U_TEMPO = '(?:months?|mesi|mese|mois|weeks?|settiman[ae]|semaines?|days?|giorni|giorno|jours?)';
const U_ANNI = '(?:years?|anni|anno|ans?)';
const UNITA = '(?:months?|mesi|mese|mois|mo)' + FINE;
// Quanti mesi fa una quantita': 30 giorni un mese, la settimana 7 giorni.
const mesi = (n, u) => (/^(?:week|settiman|semaine)/i.test(u) ? n * 7 / 30
  : /^(?:day|giorn|jour)/i.test(u) ? n / 30 : new RegExp('^' + U_ANNI + '$', 'i').test(u) ? n * 12 : n);

// Le forme, a famiglie. Ognuna dice da dove parte la durata (in mesi); sotto
// i 3 e' una promessa che non manteniamo.
// 1. La fascia: «1–18 months», «1–18-month leases», «1−18 mesi» (il meno
//    vero, U+2212), «da 1 a 18 mesi», «1 to 12+ months», «2–9 months»,
//    «1 month to 18 months», «un mese a diciotto mesi», «between one month
//    and 18 months» («and/e/et» solo dopo «between/tra/fra/entre»). «1–2
//    years» non e' una fascia corta: l'unita' alta vale per tutte e due.
const DUR_FASCIA = new RegExp('(\\b(?:between|tra|fra|entre)\\s+)?\\b(1|2|one|two|uno|una|un|une|due|deux)'
  + '(?:\\s*[-‑]?\\s*(' + U_MESI + '))?\\s*(–|—|-|‐|‑|−|~|\\bto\\b|\\ba\\b|à|\\bal\\b|\\bfino a\\b|\\buntil\\b|\\btill\\b|\\bthrough\\b|\\bor\\b|\\bo\\b|\\bou\\b|\\band\\b|\\be\\b|\\bet\\b)\\s*'
  + '(' + ALTO + ')\\s*\\+?\\s*[-‑]?\\s*(' + U_MESI + '|mo|' + U_ANNI + ')' + FINE, 'gi');
// 2. Il «da»: «from one month», «from 30 days», «as little as a month», «for
//    just a month», «even for a month», «a partire da un mese», «anche per un
//    mese», «à partir d'un mois», «dès un mois», «da 1 mese» («da» solo in
//    cifre e in mesi: «vivo a Roma da un mese» non e' un'offerta).
const DUR_DA = new RegExp('(\\b(?:from|starting (?:at|from)|beginning (?:at|from)|as (?:short|little) as|for (?:just|only|as little as)|even (?:for )?(?:just )?)|à partir d[\'’]\\s?|à partir de|\\bdès|\\ba partire da|\\banche (?:solo )?per|\\bper (?:un )?sol[oa]|\\bda)\\s*'
  + '(?:just\\s+|only\\s+|solo\\s+)?(' + QTA + ')\\s*(?:single\\s+|sol[oa]\\s+|seul\\s+)?[-‑]?\\s*(' + U_TEMPO + ')' + FINE, 'gi');
// 3. Il minimo: «Minimum 1 month», «Minimum stay: 1 month», «Minimum term —
//    1 month», «a minimum of one month», «min. 30 days», «at least four
//    weeks», «durata minima di un mese», «Durata minima 1 mese», «séjour
//    minimum d'un mois», «1-month minimum», «un mese minimo». Dopo il nome
//    («durata minima», «durée minimale») basta l'aggettivo: e' lui che apre.
const NOMI_DURATA = '(?:stays?|leases?|lets?|rentals?|tenanc(?:y|ies)|terms?|periods?|duration|contracts?|commitment|bookings?|durata|permanenza|soggiorno|contratto|locazione|periodo|séjour|bail|durée|location)';
const MINIMO = '(?:minimum|min\\.?|minim[oa]|minimal[ea]?|minimale|at least|almeno|au moins|no less than|non meno di)';
const DUR_MIN = new RegExp('\\b' + MINIMO + '(?:\\s+' + NOMI_DURATA + ')?'
  + '(?:\\s*[:=—–-]\\s*|\\s+(?:of|di|de|is|è|est)\\s+(?:(?:di|de)\\s+)?|\\s+d[\'’]\\s?|\\s+)(?:just\\s+|only\\s+|solo\\s+)?'
  + '(' + QTA + ')\\s*(?:single\\s+|sol[oa]\\s+)?[-‑]?\\s*(' + U_TEMPO + ')' + FINE
  + '|\\b(' + QTA + ')[-‑ ](' + U_TEMPO + ')\\s+(?:minimum|minim[oa]|min\\.?)' + FINE, 'gi');
// 4. Il «o piu'»: «1+ months», «1 month+», «a month or more», «4 weeks or
//    more», «30+ days», «one month and up», «un mese in su», «un mois et plus».
const DUR_PIU = new RegExp('\\b(' + QTA + ')\\s*\\+\\s*(' + U_TEMPO + ')' + FINE
  + '|\\b(' + QTA + ')\\s*(' + U_TEMPO + ')\\s*\\+(?!\\d)'
  + '|\\b(' + QTA + ')\\s+(?:single\\s+)?(' + U_TEMPO + ')\\s+(?:up|and up|and above|and over|and longer|and more|or (?:more|longer|over|above)|in su|in poi|o più|o oltre|et plus|ou plus)' + FINE, 'gi');
// 5. La durata come nome dell'offerta: «one-month leases», «1-month stays»,
//    «stays of one month», «short lets of 2 weeks», «contratto di un mese»,
//    «un bail d'un mois». Il nome porta il contesto con se'.
const NOMI_AFFITTO = '(?:leases?|lets?|lettings?|rentals?|stays?|tenanc(?:y|ies)|contracts?|bookings?|sublets?)';
const DUR_NOME = new RegExp('\\b(' + QTA + ')[-‑ ](' + U_TEMPO + ')(?:\\s+|-)(?:(?:furnished|short|medium|fixed|transitional|registered|minimum)[-‑ ](?:term\\s+)?)?' + NOMI_AFFITTO + FINE
  + '|\\b' + NOMI_AFFITTO + '\\s+(?:of|for|lasting)\\s+(?:just\\s+|only\\s+|as little as\\s+)?(' + QTA + ')\\s+(?:single\\s+)?(' + U_TEMPO + ')' + FINE
  + '|\\b(?:contratt[oi]|soggiorn[oi]|locazion[ei]|permanenz[ae])\\s+(?:di|da|per)\\s+(?:solo\\s+)?(' + QTA + ')\\s+(?:sol[oa]\\s+)?(' + U_TEMPO + ')' + FINE
  + '|\\b(?:ba(?:il|ux)|locations?|séjours?)\\s+d[\'’]\\s?(' + QTA + ')\\s+(' + U_TEMPO + ')' + FINE, 'gi');
// Il limite basso (in mesi) di una presa e se basta da sola (la fascia lunga,
// il nome dell'offerta) o vuole un paragrafo che parli di casa; null = non e'
// una durata da guardare.
const primo = (m, ...i) => i.map((k) => m[k]).find(Boolean);
const FAMIGLIE = [
  [DUR_FASCIA, (m) => {
    const [, tra, basso, uBasso, sep, alto, uAlto] = m;
    if (/^(?:and|e|et)$/i.test(sep) && !tra) return null;
    if (new RegExp('^' + U_ANNI + '$', 'i').test(uAlto) && !uBasso) return null;
    return { min: numero(basso), lunga: mesi(numero(alto), uAlto) >= 6 };
  }],
  [DUR_DA, (m) => {
    const [, pre, q, u] = m;
    if (/^da$/i.test(pre) && (!/^\d+$/.test(q) || !new RegExp('^' + U_MESI + '$', 'i').test(u))) return null;
    return { min: mesi(numero(q), u), lunga: false };
  }],
  [DUR_MIN, (m) => ({ min: mesi(numero(primo(m, 1, 3)), primo(m, 2, 4)), lunga: false })],
  [DUR_PIU, (m) => ({ min: mesi(numero(primo(m, 1, 3, 5)), primo(m, 2, 4, 6)), lunga: false })],
  [DUR_NOME, (m) => ({ min: mesi(numero(primo(m, 1, 3, 5, 7)), primo(m, 2, 4, 6, 8)), lunga: true })],
];
// Misure che non sono una durata: deposito, preavviso, attesa, anticipo,
// arretrati, buste paga.
const NON_DURATA_PRIMA = /(?:deposits?|depositi?|cauzion[ei]|caution|dépôt|caparra|notice|preavviso|préavis|wait(?:ing)?|attesa|processing|delivery)\W*(?:[A-Za-zÀ-ÿ]+\W+){0,2}$|\b(?:within|entro|nel giro di|in|after|dopo|every|ogni|each)\s+$/i;
const NON_DURATA_DOPO = /^\s*(?:['’]s?\s*)?(?:of\s+|di\s+|de\s+|d['’]\s*)?(?:rent|deposit|notice|wait|fees?|commission|salary|pay|payslips?|pay slips?|income|bank statements?|statements?|canone|affitto|caparra|cauzione|deposito|preavviso|stipendio|buste paga|cedolini|estratti conto|reddito|loyer|caution|préavis|revenus|bulletins)\b|^\s*(?:to|all['’]|à)\s*(?:the\s+)?(?:next|another|altro|l['’]autre)\b|^\s*(?:before|ahead|in advance|earlier|prior|ago|later|after|prima|in anticipo|fa|dopo|avant|behind|late|overdue|in arrears|in ritardo|di ritardo|arretrat\w*|en retard|de retard|unpaid)\b/i;
// Una negazione nella stessa proposizione, a due parole al massimo dalla
// presa, la toglie: «never offer a one-month lease», «mai proporre un
// contratto di un mese», «we don't do one-month stays» — sono le frasi che
// un prompt o una FAQ scrivono proprio per dire il minimo. «Not only / non
// solo» non nega niente, e la punteggiatura chiude la proposizione: «No
// hidden fees, leases from 1 month» resta una promessa.
const NEGAZIONE = "(?<![A-Za-zÀ-ÿ])(?:never|not(?!\\s+(?:only|just))|no|nor|without|instead of|rather than|unlike|mai|non(?!\\s+(?:solo|soltanto))|né|niente|nessun[oa]?|senza|invece d[ie]\\w*|anziché|jamais|pas(?!\\s+seulement)|ni|aucune?|sans|au lieu d[e'’]\\w*)(?![A-Za-zÀ-ÿ])|n['’]t(?![A-Za-z])";
const NEGATA = new RegExp('(?:' + NEGAZIONE + ')(?:\\s+\\S+){0,2}\\s*$', 'i');
const negata = (prima) => NEGATA.test(prima.split(/[.;:!?,—–()[\]]/).pop());
// Una fascia corta (che finisce sotto i 6 mesi) e le altre forme contano
// solo dove si parla di casa, contratto o soggiorno.
const CONTESTO_AFFITTO = /\b(?:leases?|leasing|lets|letting|rent(?:al|als|ing|ed|s)?|tenan(?:t|ts|cy|cies)|contracts?|contratt[oi]|transitori[oa]?|transitional|locazion[ei]|affitt[a-z]*|stays?|soggiorn[oi]|assignments?|incaric(?:o|hi)|trasfert[ae]|posted|postings?|secondments?|term|durata|duration|BOOM|homes?|flats?|apartments?|appartament[oi]|casa|bail|location|séjour|logement)\b/i;
// L'eccezione: legge E minimo BOOM nello stesso paragrafo.
const LEGGE = /\b431\/(?:19)?98\b|\bby law\b|\bper legge\b|\bdi legge\b|\bthe law\b|\bla legge\b|\blegally\b|\blegalmente\b|\bDM 16\/01\/2017\b|\bla loi\b/i;
const MINIMO_BOOM = new RegExp('\\bBOOM\\b[^.;:!?]{0,60}?\\b(?:minimum|minimo|min\\.?|at least|almeno|from|da|dai|starting at|starts at|parte da|dès|au moins)\\b[^.;:!?]{0,20}?\\b(?:3|three|tre|trois)\\s*' + UNITA
  + '|\\b(?:minimum|minimo|at least|almeno|au moins)\\b[^.;:!?]{0,20}?\\b(?:3|three|tre|trois)\\s*(?:months?|mesi|mois)' + FINE + '[^.;:!?]{0,40}?\\bBOOM\\b'
  + '|\\b(?:3|three|tre|trois)\\s*(?:–|—|-|to|a|à)\\s*(?:\\d{1,2}|eighteen|diciotto|dix-huit)\\+?\\s*(?:(?:months?|mesi|mois|mo)' + FINE + ')?\\s*\\(?\\s*(?:with|through|via|con|tramite|avec)\\s+BOOM\\b'
  + '|\\b(?:with|through|via|con|tramite|avec)\\s+BOOM\\b[^.;:!?]{0,30}?\\b(?:3|three|tre|trois)\\s*(?:months?|mesi|mois|–|—|-|to|a|à)', 'i');

// Le durate BOOM sotto i 3 mesi di UN paragrafo ([] = niente, o paragrafo di legge in regola).
function duratePromesse(par) {
  const out = [];
  for (const [re, limite] of FAMIGLIE) {
    for (const m of par.matchAll(re)) {
      const l = limite(m);
      if (!l || !(l.min > 0 && l.min < 3)) continue;
      const prima = par.slice(Math.max(0, m.index - 60), m.index);
      const dopo = par.slice(m.index + m[0].length, m.index + m[0].length + 30);
      if (NON_DURATA_PRIMA.test(prima.slice(-40)) || NON_DURATA_DOPO.test(dopo) || negata(prima)) continue;
      if (!l.lunga && !CONTESTO_AFFITTO.test(par)) continue;
      out.push(m[0]);
    }
  }
  return out.length && LEGGE.test(par) && MINIMO_BOOM.test(par) ? [] : out;
}
const paragrafoDiLegge = (par) => FAMIGLIE.some(([re]) => new RegExp(re.source, re.flags).test(par))
  && LEGGE.test(par) && MINIMO_BOOM.test(par);

// I paragrafi di una pagina: i blocchi del testo visibile (script, stili e
// commenti tolti, come sopra), ogni stringa dei JSON-LD, ogni attributo letto.
// Nelle pagine bilingui (/executive, /owners, /reunion) ogni <span class="l-en">
// e <span class="l-it|l-fr"> e' un paragrafo a se': se ne vede UNO alla
// volta, e il minimo BOOM scritto in italiano non copre «1 to 18 months»
// rimasto nella frase inglese accanto (la prima mutazione l'ha mancato).
const SEP = String.fromCharCode(0x2029);
const BLOCCO = /<\/?(?:p|div|li|dd|dt|td|th|tr|h[1-6]|summary|details|section|article|header|footer|nav|ul|ol|dl|table|thead|tbody|tfoot|caption|blockquote|br|hr|option|optgroup|select|button|label|figure|figcaption|main|aside|form|fieldset|legend|textarea|pre|address|noscript)\b[^>]*>/gi;
const LINGUA = /\bclass\s*=\s*["'](?:[^"']*\s)?l-(?:en|it|fr)(?:\s[^"']*)?["']/i;
function separaLingue(markup) {
  let out = '', i = 0, prof = 0;
  const aperte = [];                       // le profondita' delle span di lingua aperte
  for (const m of markup.matchAll(/<(\/?)span\b([^>]*)>/gi)) {
    out += markup.slice(i, m.index); i = m.index + m[0].length;
    if (!m[1]) {
      prof++;
      if (LINGUA.test(m[2])) { aperte.push(prof); out += SEP + m[0]; continue; }
      out += m[0];
    } else {
      out += m[0];
      if (aperte.length && aperte[aperte.length - 1] === prof) { aperte.pop(); out += SEP; }
      prof = Math.max(0, prof - 1);
    }
  }
  return out + markup.slice(i);
}
function paragrafiPagina(s) {
  const out = [];
  for (const m of s.matchAll(LD)) {
    try { out.push(...stringhe(JSON.parse(m[1]))); } catch { out.push(m[1]); }
  }
  const markup = s.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  for (const t of markup.matchAll(/<[a-z][a-z0-9-]*\b([^>]*)>/gi))
    for (const m of t[1].matchAll(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi))
      if (ATTR_LETTI.test(m[1])) out.push(decodifica(m[2] != null ? m[2] : m[3]));
  const testo = separaLingue(markup).replace(BLOCCO, SEP).replace(/<[^>]+>/g, ' ');
  for (const p of decodifica(testo).split(SEP)) {
    const t = p.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

{
  // il rilevatore morde, e non grida al lupo: ogni frase e' un paragrafo a se'
  const CATTIVE = [
    'Registered transitional leases (1–18 months) timed to your assignment, explained in English.',
    "Italy's fixed-term residential lease: 1 to 18 months, under art. 5 of law 431/98, registered with the Agenzia delle Entrate.",
    'Professionisti a Roma con un incarico da 1 a 18 mesi: agenzie ONU, ambasciate.',
    'International tenants moving to Rome for the medium term (1 to 12+ months): expats, students.',
    'Productions in town 2–9 months, dates that move: a lease that ends when the wrap does.',
    "We don't run short-term holiday lets: only registered leases, from one month up.",
    'Non gestiamo affitti brevi turistici: solo contratti registrati, da un mese in su.',
    'Minimum 1 month, maximum 18 months. Must have a documented temporary need — work assignment, study.',
    'Term 1–18 MONTHS',
    '1–18 mo',
    'Leases from 1 month, explained in English.',
    'Furnished homes for stays of 1+ months.',
    'Durata: 1–3 mesi, contratto registrato.',
    'Un contratto transitorio a partire da un mese.',
    'Bail meublé de 1 à 18 mois.',
    'Location meublée à partir d\'un mois.',
    'Contratto transitorio di 1–3 mesi agosto compreso.',    // «ago» non e' «agosto»
    // Le forme che la prima versione lasciava passare (revisione del 15/10/2026):
    // ognuna e' stata rimessa in una pagina vera senza far cadere niente.
    'Registered transitional 1–18-month leases timed to your assignment.',
    'Transitional leases, 1−18 months.',                     // il meno vero, U+2212
    'Professionals in Rome on assignment for 1 month to 18 months.',
    'Lease length: between one month and 18 months.',
    'Contratti da un mese a diciotto mesi.',
    'Leases tra 1 e 18 mesi.',
    'Minimum stay: 1 month, furnished.',
    'Minimum lease: one month.',
    'Minimum term — 1 month, maximum 18.',
    'Durata minima di un mese, massima 18.',
    'Durata minima 1 mese.',
    'Durée minimale d\'un mois pour la location.',
    '1-month minimum, registered lease.',
    'Furnished flats, a minimum of 30 days.',
    'International tenants for the medium term (a month or more).',
    'Furnished homes for 4 weeks or more.',
    '1 month+ stays in central Rome.',
    'Furnished apartments for rent (from 30 days).',
    'Leases from a couple of months, registered.',
    'Stays from two weeks up to 18 months.',
    'Apartments to rent even for a month.',
    'Contratti transitori fino a 18 mesi, anche per un solo mese.',
    'One-month leases available all year.',
    'Stays of one month are welcome.',
    'Short lets of 2 weeks, registered with the Agenzia.',
    'Affittiamo con un contratto di un mese, registrato.',
    'Un bail d\'un mois, enregistré.',
    // la negazione vale solo nella sua proposizione, e a due parole al massimo
    'No hidden fees, leases from 1 month.',
    'No commission and leases from 1 month.',
    'We rent not only for years but from one month.',
  ];
  const BUONE = [
    'A transitorio instead lasts 1–18 months by law (with BOOM, at least 3 months) and requires a documented temporary need.',
    "A contratto transitorio (transitional lease: 1–18 months by law, for a temporary need stated and documented in the lease; BOOM's minimum is 3 months, per our terms).",
    '1–18 months by law; 3–18 with BOOM',
    'By law, minimum 1 month and maximum 18 months; with BOOM the minimum is 3 months.',
    "Italy's fixed-term residential lease: 3 to 18 months with BOOM, under art. 5 of law 431/98.",
    'Security deposit 1–2 months of rent → returns',
    "1–2 months' deposit what renters wire to hold an unverified flat",
    'Budget a deposit of 2–3 months plus an agency fee.',
    'Typical wait: 1–3 months for the appointment, 3–6 months for the actual card.',
    '⚠ hard 1-2 months',
    'Rents in Rome change from one month to the next.',
    'Book your home at least one month before you land.',
    'e.g., within 1 month',
    'Two or three months of rent, gone silent.',
    'Leave for serious reasons with 3 months’ notice by registered letter.',
    'One dedicated human on WhatsApp for the first month.',
    'Vivo a Roma da un mese e cerco casa.',
    'Rents on these flats went up 1–2 months ago.',
    // anni, giorni e settimane che non sono un soggiorno con noi
    'Leases from 1 to 2 years for families.',
    'The lease must be registered within 30 days of signing.',
    'Asking rents in each zone over the last 30 days.',
    'Start your apartment search at least 2 weeks in advance.',
    'Viewings are booked from 2 weeks before your arrival in the apartment.',
    'Leases from 3 months, registered.',
    'Furnished flats for 13 weeks or more.',
    // deposito, preavviso, arretrati, buste paga
    'A deposit of at least one month is customary for a rental.',
    'A notice period of at least one month applies to the lease.',
    'Il preavviso minimo per il contratto è di un mese.',
    'If the tenant is two months or more behind on rent, the landlord can start eviction.',
    'Most landlords ask the tenant for 1–2 months of payslips.',
    // le frasi che il minimo lo DICONO, anche negando il mese
    '- Lease length: 3 months minimum with BOOM (Terms of service); a transitional lease runs up to 18 months.',
    'Durata: con BOOM da 3 mesi in su (Condizioni); mai proporre un mese.',
    "trans: { it: 'Transitorio (con BOOM da 3 a 18 mesi)', en: 'Transitional (3 to 18 months with BOOM)' },",
    'Never offer a one-month lease: with BOOM the minimum is 3 months.',
    'Mai proporre un contratto di un mese: con BOOM si parte da 3 mesi.',
    "We don't do one-month stays — the minimum is 3 months.",
    'Instead of a one-month lease, BOOM offers 3 months minimum.',
  ];
  const mute = CATTIVE.filter((t) => !duratePromesse(t).length);
  const lupo = BUONE.filter((t) => duratePromesse(t).length).map((t) => `«${t}» → ${duratePromesse(t).join(', ')}`);
  mute.length ? male('la regola della durata non riconosce frasi che dovrebbe far cadere:' + elenco(mute))
              : bene(`la regola della durata riconosce le sue ${CATTIVE.length} frasi cattive`);
  lupo.length ? male('la regola della durata grida al lupo su frasi in regola:' + elenco(lupo))
              : bene(`...e lascia stare le ${BUONE.length} che non sono una durata BOOM (deposito, attese, arretrati, anni, negazioni, legge col minimo BOOM accanto)`);
  // ...e sulla pagina: la span inglese e quella italiana sono due paragrafi
  // (il minimo BOOM detto in italiano non copre la frase inglese accanto),
  // la cella e il <p> di legge col minimo BOOM restano in regola.
  const pagina = '<div class="a"><span class="l-en">Italy\'s fixed-term lease: 1 to 18 months, under art. 5 of law 431/98.</span>'
    + '<span class="l-it">Il contratto a termine: con BOOM da 3 a 18 mesi, art. 5 della L. 431/98.</span></div>'
    + '<table><tr><td class="em">Transitorio</td><td>1&ndash;18 months by law; 3&ndash;18 with BOOM</td></tr></table>'
    + '<p>By law, minimum 1 month and maximum 18 months; with BOOM the minimum is 3 months.</p>';
  const prese = paragrafiPagina(pagina).flatMap(duratePromesse);
  prese.length === 1 && prese[0] === '1 to 18 months'
    ? bene('sulla pagina bilingue cade la sola frase inglese senza minimo BOOM (lingue separate, legge col minimo accanto in regola)')
    : male('la lettura a paragrafi della pagina non separa lingue e blocchi come deve: ' + JSON.stringify(prese));
}

{
  const corporaDurata = [];               // [file, [paragrafi]]
  for (const f of [...new Set(pagine)]) corporaDurata.push([f, paragrafiPagina(leggi(f))]);
  // js/conto-engine.js: le etichette dei tipi di contratto del conto dei
  // proprietari (BOOM_CONTO.TIPI) non le stampa ancora nessuna pagina, ma il
  // file e' pubblico — la prima pagina che le usa le porterebbe ai proprietari.
  for (const f of ['scripts/seo-config.js', 'js/whatsapp-replies.js', 'js/conto-engine.js', ...FONTI]) {
    if (fs.existsSync(path.join(R, f))) corporaDurata.push([f, leggi(f).split('\n')]);
    else male(`${f} non esiste: la guardia della durata non puo guardarlo`);
  }
  const trovate = [], dove = new Map(), legge = new Set();
  let letti = 0;
  for (const [f, pars] of corporaDurata) for (const par of pars) {
    letti++;
    if (paragrafoDiLegge(par)) legge.add(f);
    for (const x of duratePromesse(par)) {
      trovate.push(`${f} → «${x}» in «${par.length > 160 ? par.slice(0, 160) + '…' : par}»`);
      if (!dove.has(f)) dove.set(f, x);
    }
  }
  const sintesi = [...dove].slice(0, 4).map(([f, x]) => `${f} «${x}»`).join(', ')
    + (dove.size > 4 ? ` e altri ${dove.size - 4} file` : '');
  trovate.length
    ? male(`${sintesi} (${trovate.length}×) — con BOOM si affitta da 3 mesi in su (decisione del fondatore, 15/10/2026): `
      + 'si scrive «3–18 months» / «da 3 a 18 mesi»; il fatto di legge (1–18 mesi) solo accanto al minimo BOOM' + elenco(trovate))
    : bene(`nessuna durata BOOM sotto i 3 mesi in ${letti} paragrafi (${corporaDurata.length} file)`
      + (legge.size ? ` — la legge dei 1–18 mesi detta col minimo BOOM accanto in: ${[...legge].join(', ')}` : ''));
}

console.log(ko ? `  \x1b[31mQualcosa dice ancora una frase che non diciamo piu\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mNessuna frase vietata\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
