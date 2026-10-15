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

console.log(ko ? `  \x1b[31mQualcosa dice ancora una frase che non diciamo piu\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mNessuna frase vietata\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
