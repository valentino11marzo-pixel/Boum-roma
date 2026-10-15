// tests/catalogo/descrizioni.mjs — LE DESCRIZIONI CHE NON INVENTANO.
//
// Il 15/10/2026, letti i 27 annunci veri (fixture-listings-2026-10-15.json),
// la macchina che scrive le descrizioni (api/wizard/describe.js) inventava
// per quattro strade: un arredo MAI dichiarato diventava «unfurnished» (nove
// descrizioni), le camere si leggevano dal testo libero `beds` («three
// bedrooms» sul bilocale di Via dei Cappellari), canone e data finivano
// nel testo («Available from 1 March at €1500/month»), dove invecchiano, e
// il civico arrivava al modello («Via Endertà 9» in un testo pubblico).
//
// Qui si prova, sui dati veri e col handler VERO (Firestore in memoria,
// Anthropic e Identity Toolkit finti — solo la rete è simulata):
//   1. i fatti al modello: niente arredo inventato, niente €/date, le camere
//      dal campo strutturato (0 = monolocale), la via senza civico;
//   2. il testo nuovo si controlla prima di scriverlo (copyIssues): prezzo,
//      soldi, date, durata del soggiorno (minimo 3 mesi: mai «one month»),
//      civico, arredo inventato in OGNI verso, camere sbagliate — senza i
//      falsi positivi («free from traffic», «due volte al mese», il
//      deposito-ripostiglio, «una camera matrimoniale»);
//   3. REGENERATE: solo admin o cron — mai il segreto del bot né quello di
//      Homie —, riscrive solo i testi della macchina («ai» esatto), i vuoti
//      e il template; salta le parole di una persona (anche quelle corrette
//      a mano DOPO la macchina, e i testi 'lotto12' dell'operatore) col
//      motivo; conserva descriptionOriginal, scrive solo sulla versione letta;
//   4. la strada del bot passa dallo stesso controllo (un testo che viola le
//      regole torna vuoto, mai il JSON grezzo); lo sweep notturno pure.
//
//   node tests/catalogo/descrizioni.mjs

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (cond, what, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fail++; console.log(`  ✗ ${what}${extra !== undefined ? '  → ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : ''}`); }
};
const eq = (got, want, what) => ok(JSON.stringify(got) === JSON.stringify(want), what,
  JSON.stringify(got) === JSON.stringify(want) ? undefined : `atteso ${JSON.stringify(want)}, ottenuto ${JSON.stringify(got)}`);

// ── l'ambiente PRIMA del modulo (homie/_lib legge l'env al caricamento) ─────
process.env.FIREBASE_API_KEY = 'fb-key';
process.env.FIREBASE_ADMIN_EMAIL = 'server@boom.test';
process.env.FIREBASE_ADMIN_PASS = 'pw';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.CRON_SECRET = 'cron-secret-test';
process.env.WIZARD_SECRET = 'wizard-secret-test';
process.env.HOMIE_SECRET = 'homie-secret-test';
process.env.ANTHROPIC_API_KEY = 'anthropic-test';
for (const k of ['LOCAL_AI_URL', 'LOCAL_AI_MODEL', 'LOCAL_AI_VISION_MODEL', 'ANTHROPIC_MODEL']) delete process.env[k];

const FIXTURE = JSON.parse(readFileSync(join(HERE, 'fixture-listings-2026-10-15.json'), 'utf8'));
const BY = Object.fromEntries(FIXTURE.map((l) => [l._id, l]));
const FACTS = require('../../js/listing-facts.js');

const D = await import('../../api/wizard/describe.js');
const { buildFacts, furnishingOf, regenVerdict, machinePatch, copyIssues, textHash, SYSTEM,
  MACHINE_SOURCES, REGEN_MAX_IDS, isBoilerplate, streetOf } = D;
const handler = D.default;
// il rilevatore della lista dell'assistente, se c'è (l'altra metà della regola)
const FIX = existsSync(join(ROOT, 'js/catalogo-correzioni.js')) ? require('../../js/catalogo-correzioni.js') : null;
const HAS_FIX_ISSUES = !!(FIX && typeof FIX.descriptionIssues === 'function');

// ═══ 1. I fatti al modello, sui 27 annunci veri ══════════════════════════
console.log('\n▸ i fatti al modello — sui 27 annunci veri');
{
  const undeclared = FIXTURE.filter((l) => furnishingOf(l) === null);
  ok(undeclared.length >= 9, `il fixture ha case con arredo NON dichiarato (${undeclared.length})`);
  ok(undeclared.every((l) => !/Furnishing:|unfurnished/i.test(buildFacts(l))),
    'arredo non dichiarato → nessuna riga Furnishing e mai «unfurnished»',
    undeclared.filter((l) => /Furnishing:|unfurnished/i.test(buildFacts(l))).map((l) => l._id));
  const saidUnfurnished = undeclared.filter((l) => /\bunfurnished\b/i.test(l.description || ''));
  ok(saidUnfurnished.length >= 8,
    `proprio le case la cui descrizione pubblica diceva «unfurnished» senza dichiarazione (${saidUnfurnished.length})`);
  const yes = FIXTURE.filter((l) => l.furnished === 'yes');
  ok(yes.length > 0 && yes.every((l) => /^Furnishing: fully furnished$/m.test(buildFacts(l))),
    'arredo dichiarato «yes» → «Furnishing: fully furnished»');

  // la riga del concordato («Rent-controlled … contract available») è un tipo
  // di contratto, non un canone né una data: resta
  const pricey = FIXTURE.filter((l) => {
    const f = buildFacts(l);
    return /€|^Rent:|\/month|per month|Available from|availableDate/im.test(f)
      || (l.price && new RegExp('\\b' + l.price + '\\b').test(f))
      || (l.availableDate && f.includes(String(l.availableDate).trim()));
  });
  ok(pricey.length === 0, 'mai canone né data tra i fatti (né €, né «Rent», né «Available from», né la data dell\'annuncio)',
    pricey.map((l) => l._id));

  const f1 = buildFacts(BY.OLLVsiKhPrhpT1fx8XmB);
  ok(/^Bedrooms: 1$/m.test(f1) && !/Bedrooms: 3/.test(f1),
    'OLLVsiKhPrhpT1fx8XmB (bilocale, bedrooms 1, beds «3») → «Bedrooms: 1», mai 3', f1);
  const f2 = buildFacts(BY.wvX0h0lBoNKOMuTuHkVI);
  ok(/^Bedrooms: 2$/m.test(f2), 'wvX0h0lBoNKOMuTuHkVI («Capri 2 Bed», bedrooms 2, beds «Living , 1 bedroom…») → «Bedrooms: 2»', f2);
  const wrongBeds = FIXTURE.filter((l) => {
    const b = FACTS.bedroomsOf(l);
    const m = buildFacts(l).match(/^Bedrooms: (.+)$/m);
    if (b == null) return !!m;
    return !m || (b === 0 ? m[1] !== 'studio (no separate bedroom)' : m[1] !== String(b));
  });
  ok(wrongBeds.length === 0, 'su TUTTI i 27 la riga Bedrooms è FACTS.bedroomsOf, la regola unica, nient\'altro', wrongBeds.map((l) => l._id));

  ok(FIXTURE.every((l) => /^City: Rome, Italy$/m.test(buildFacts(l))),
    'la città c\'è sempre: «Trieste» è un quartiere di Roma, non la città (il modello aveva confuso le due)');
  ok(/^Neighbourhood: Trieste$/m.test(buildFacts(BY.FHeEHIFbil6QG8Jcccxc)), 'il quartiere resta quello dell\'annuncio');
  ok(FIXTURE.every((l) => !/washing_machine|double_glazing|pets_allowed/.test(buildFacts(l))),
    'nessuna chiave grezza del database arriva al modello');

  // la via senza il civico: «nomina la via, non il numero»
  const numbered = FIXTURE.filter((l) => /\d\s*$/.test(String(l.address || '').split(',')[0].trim()));
  ok(numbered.length >= 15, `il fixture ha indirizzi col civico (${numbered.length})`);
  const leaks = FIXTURE.filter((l) => {
    const f = buildFacts(l);
    return /^Address:/m.test(f) || /^Street: .*\d/m.test(f) || (l.address && !f.includes('Street: ' + streetOf(l.address)));
  });
  ok(leaks.length === 0, 'su TUTTI i 27 il modello riceve la via e mai il civico (nessuna cifra nella riga Street)', leaks.map((l) => l._id));
  eq(buildFacts(BY.ilW5lAxnNn5M2TjsSHx2).match(/^Street: .*$/m)?.[0], 'Street: Via Endertà',
    'ilW5lAxnNn5M2TjsSHx2 («Via Endertà 9», il civico finito in un testo pubblico) → «Street: Via Endertà»');
  eq(buildFacts(BY.angelico).match(/^Street: .*$/m)?.[0], 'Street: Viale Angelico, Mazzini',
    'un indirizzo senza civico resta com\'è, col suo quartiere');

  eq(buildFacts({ bedrooms: 0, type: 'Studio' }).match(/^Bedrooms: .*$/m)?.[0], 'Bedrooms: studio (no separate bedroom)',
    'bedrooms 0 (monolocale) → «Bedrooms: studio (no separate bedroom)»');
  ok(!/Bedrooms: 0/.test(buildFacts({ bedrooms: 0 })), '…mai «Bedrooms: 0»');
  ok(!/Bedrooms/.test(buildFacts({ beds: 'Studio with Bath' })), 'camere ignote (niente campo, testo senza numero) → nessuna riga');
  ok(/^Bedrooms: 2$/m.test(buildFacts({ beds: '2 BR' })), 'senza il campo strutturato vale il testo, solo se ha un numero 1–10');
  ok(/^Bedrooms: 1$/m.test(buildFacts({ bedrooms: 1, beds: '3' })), 'il campo strutturato vince sul testo libero');
}

console.log('\n▸ la via senza il civico (streetOf)');
{
  for (const [a, want] of [
    ['Via Endertà 9', 'Via Endertà'], ['Via Endertà, 9', 'Via Endertà'], ['Via Endertà n. 9', 'Via Endertà'],
    ['Via Endertà 9/A', 'Via Endertà'], ['9 Via Endertà', 'Via Endertà'], ['Via Dei Laghi 14 Roma', 'Via Dei Laghi'],
    ['Via Simeto 14, 00198 Roma', 'Via Simeto'], ['Roma, Via X 3', 'Via X'], ['Via Tiburtina 545 int. 3', 'Via Tiburtina'],
    ['Piazza Dante 1, int 4', 'Piazza Dante'], ['Via Endertà, 9, int. 4, 00199 Roma', 'Via Endertà'],
    ['Viale 21 Aprile 12', 'Viale 21 Aprile'], ['Viale 21 Aprile', 'Viale 21 Aprile'], ['Via 4 Novembre 157', 'Via 4 Novembre'],
    ['Via Di S.Anna 16', 'Via Di S.Anna'], ['Via Di Tor Di quinto 39', 'Via Di Tor Di quinto'],
    ['Viale Angelico, Mazzini', 'Viale Angelico, Mazzini'], ['Via in Piscinula', 'Via in Piscinula'],
    ['Via Roma', 'Via Roma'], ['', ''], [null, ''],
  ]) eq(streetOf(a), want, `«${a}» → «${want}»`);
}

// La decisione del fondatore (15/10): 0 = monolocale, e si dice — anche se il
// bot, nel messaggio unico, salva bedrooms 0 quando l'operatore le camere non
// le ha dette. Quello è un difetto del bot e si corregge lì
// (bot/boom_listing_wizard.py): qui lo 0 resta un fatto, e il controllo tiene
// il testo a quel fatto.
console.log('\n▸ lo 0 è un monolocale (decisione del 15/10)');
{
  const quick = { type: 'bilocale', zone: 'Prati', sqm: 60, beds: 0, bedrooms: 0, furnished: 'no' };
  eq(buildFacts(quick).match(/^Bedrooms: .*$/m)?.[0], 'Bedrooms: studio (no separate bedroom)',
    'bedrooms 0 → «studio» qualunque sia il tipo: la regola del sito non dipende dal nome del tipo');
  ok(!/Bedrooms/.test(buildFacts({ type: 'bilocale', beds: 0, furnished: 'no' })),
    'il corpo che il bot manda a describe ({beds:0}, senza bedrooms) → nessuna riga (il testo «0» non è un numero di camere)');
  ok(/^Furnishing: unfurnished$/m.test(buildFacts(quick)),
    'l\'arredo «no» resta «unfurnished»: è indistinguibile da una dichiarazione vera — il default del bot si corregge nel bot');
  ok(copyIssues('A bright one-bedroom bilocale.', quick).includes('bedrooms_mismatch'),
    'un numero di camere nel testo diverso dallo 0 salvato → bloccato');
}

console.log('\n▸ l\'arredo: solo come è stato dichiarato');
{
  const fu = (v) => furnishingOf({ furnished: v });
  eq(['yes', ' Yes ', 'partial', 'no', 'NO'].map(fu),
    ['fully furnished', 'fully furnished', 'partially furnished', 'unfurnished', 'unfurnished'],
    'i tre valori del bot e del portal (maiuscole e spazi non contano)');
  eq([undefined, null, '', 'tbd', 'si', true, false].map(fu), [null, null, null, null, null, null, null],
    'tutto il resto tace: assente, vuoto, «tbd», e i booleani (sui listings non li scrive nessuno; come catalogo-correzioni)');
  eq(furnishingOf({}), null, 'campo assente → null (prima diventava «unfurnished»)');
  eq(furnishingOf(null), null, 'un annuncio nullo non fa esplodere niente');
}

// ═══ 2. Il SYSTEM e il controllo del testo nuovo ═════════════════════════
// Ogni frase che le prove di questa sezione passano a copyIssues si annota:
// alla fine, su TUTTE, la lista dell'assistente non deve trovare niente che
// copyIssues non trovi — tranne le divergenze volute dal fondatore, che si
// annotano a parte (LOOSE) col loro codice.
const CORPUS = new Set();
const LOOSE = new Map();
const ci = (t, l) => { CORPUS.add(t); return copyIssues(t, l); };
const loose = (t, l, code) => { CORPUS.add(t); LOOSE.set(t, code); return copyIssues(t, l); };
const BASE = { type: 'bilocale', bedrooms: 1, furnished: 'yes', address: 'Via dei Cappellari 4' };
const PLAIN_EN = 'A calm, well-kept home in Rome with good light and air conditioning. The neighbourhood is residential, with daily shops and easy transport.';

console.log('\n▸ il SYSTEM porta le regole');
{
  ok(/if the facts don't say, do not mention furniture at all — never call it furnished or unfurnished/.test(SYSTEM),
    'arredo non dato → non dire se è arredata');
  ok(/never write prices, rent, deposits, fees or commissions/.test(SYSTEM)
    && /never say when the home is available \(no dates, no "available now", no "ready to move in"\)/.test(SYSTEM),
    'mai prezzi, canoni, commissioni o date di disponibilità nel testo');
  ok(/give a number of bedrooms ONLY as the Bedrooms line states it; never deduce it from the type or the name/.test(SYSTEM),
    'le camere solo dalla riga Bedrooms');
  ok(/with no Bedrooms line, give no number of bedrooms/.test(SYSTEM), '…e senza la riga, nessun numero');
  ok(/address: you may name the street, never a house number/.test(SYSTEM), 'la via sì, il civico mai');
  ok(/never mention the length of stay, minimum term or short stays/.test(SYSTEM),
    'mai la durata del soggiorno, un minimo o i soggiorni brevi (con BOOM si affitta per almeno 3 mesi)');
  ok(/for BOTH languages/.test(SYSTEM), 'le regole valgono anche per l\'italiano');
}

console.log('\n▸ il testo nuovo si controlla prima di scriverlo');
{
  const base = BASE;
  const CLEAN = 'A bright one-bedroom flat on Via dei Cappellari, with air conditioning and a balcony. Una camera da letto, luminosa.';
  eq(ci(CLEAN, base), [], 'un testo pulito passa (la via senza numero è ammessa)');
  for (const [t, code] of [
    ['Only €1,500.', 'price_in_text'], ['For 1500 euro you get…', 'price_in_text'], ['Rent is 1,200 per month.', 'price_in_text'],
    ['1.200/month', 'price_in_text'], ['Affitto 900 al mese.', 'price_in_text'],
    ['No agency fee.', 'fee_in_text'], ['A deposit of two months.', 'fee_in_text'], ['Nessuna provvigione.', 'fee_in_text'],
    ['Available from 1 March.', 'date_in_text'], ['Fully furnished and ready to move in.', 'date_in_text'],
    ['Disponibile dal 1 settembre.', 'date_in_text'], ['Free from July 1st.', 'date_in_text'],
    ['Libera da settembre 2026.', 'date_in_text'], ['Pronto da abitare.', 'date_in_text'],
  ]) ok(ci(t, base).includes(code), `«${t}» → ${code}`, ci(t, base));

  const und = { type: 'Loft', bedrooms: 1 };
  ok(ci('The unfurnished space is yours.', und).includes('furnishing_invented'), 'arredo non dichiarato + «unfurnished» → furnishing_invented');
  ok(ci('Lo spazio non arredato.', und).includes('furnishing_invented'), '…anche in italiano («non arredato»)');
  eq(ci('An unfurnished flat.', { ...und, furnished: 'no' }), [], 'arredo dichiarato «no» → «unfurnished» è il fatto');
  ok(ci('Fully furnished.', { ...und, furnished: 'no' }).includes('furnishing_contradicted'), 'dichiarata vuota ma «fully furnished» → contraddetto');

  ok(ci('It offers three bedrooms.', base).includes('bedrooms_mismatch'), 'bedrooms 1 + «three bedrooms» → bedrooms_mismatch');
  ok(ci('Tre camere da letto.', base).includes('bedrooms_mismatch'), '…anche «tre camere da letto»');
  ok(ci('Un monolocale di 55 mq.', base).includes('bedrooms_mismatch'), 'bedrooms 1 + «monolocale» → mismatch (l\'italiano di Via Piemonte)');
  eq(ci('A one-bedroom flat.', base), [], '«one-bedroom» con bedrooms 1 è giusto');
  eq(ci('A room in a three-bedroom shared flat.', { type: 'Shared Room', bedrooms: 1 }), [],
    'una stanza in casa condivisa descrive le camere della CASA: non si confronta');
  ok(ci('Two bedrooms.', { bedrooms: 0 }).includes('bedrooms_mismatch'), 'monolocale (0) + «two bedrooms» → mismatch');
  eq(ci('A studio apartment.', { bedrooms: 0 }), [], 'monolocale (0) + «studio apartment» è giusto');
  // il SYSTEM dice «senza la riga, nessun numero»: il controllo lo garantisce
  ok(ci('Three bedrooms.', { type: 'bilocale' }).includes('bedrooms_invented'),
    'camere ignote + un numero nel testo → bedrooms_invented (dedotto dal tipo, cioè inventato)');
  eq(ci('A bright bilocale with a balcony.', { type: 'bilocale' }), [], 'camere ignote e nessun numero → niente da dire');
  eq(ci('A room in a three-bedroom flat.', { type: 'Room' }), [], '…ma una stanza in casa condivisa conta le camere della CASA, anche lì');
  // il conto più BASSO di quello dichiarato è sbagliato quanto quello più alto
  const capri = BY.wvX0h0lBoNKOMuTuHkVI;
  ok(ci('A spacious one-bedroom flat with a balcony.', capri).includes('bedrooms_mismatch'),
    'Capri (2 camere) + «one-bedroom» e nient\'altro → mismatch (il conto in difetto non passa)');
  ok(ci('Una camera da letto, luminosa.', BY.pigneto).includes('bedrooms_mismatch'),
    '«una camera DA LETTO» è un conto: su una casa da 2 camere è sbagliato');
}

// I rilievi del 15/10 sull'arredo: con il campo vuoto il controllo
// bloccava solo «unfurnished» — un «fully furnished» o un «arredato»
// inventati passavano. È l'altra metà della stessa invenzione: 9 dei 18
// annunci da rigenerare hanno l'arredo ignoto.
console.log('\n▸ l\'arredo nel testo: inventato, e contraddetto');
{
  const angelico = BY.angelico;
  ok(furnishingOf(angelico) === null && !(angelico.features || []).concat(angelico.tags || []).some((f) => /furnish|arred/i.test(f)),
    'angelico: arredo non dichiarato, nessuna feature né etichetta lo dice (il caso dei rilievi)');
  for (const t of ['A fully furnished loft.', 'Il loft è arredato con gusto.', 'Vuoto, tutto da arredare.', 'Privo di arredi.',
    'La casa è vuota.', 'Si consegna vuota.', 'L\'appartamento viene consegnato vuoto.', 'The flat comes empty.', 'An empty apartment.',
    'Furnished with taste.', 'Ammobiliata.',
    'With modern furniture throughout.', 'Bring your own furniture.', 'Furnish it your way.', 'Con arredamento moderno.']) {
    ok(ci(t, angelico).includes('furnishing_invented'), `arredo ignoto + «${t}» → furnishing_invented`, ci(t, angelico));
  }
  eq(ci(PLAIN_EN, angelico), [], 'arredo ignoto e nessuna parola sull\'arredo → passa');
  eq(ci('Gli immobili della zona sono luminosi.', angelico), [], '«immobili» non sono «mobili»');
  eq(ci('The street is empty at night.', angelico), [], '«empty» detto della strada non è l\'arredo');
  eq(ci('Uno spazio vuoto in cortile.', angelico), [], '«vuoto» detto di un cortile non è l\'arredo');

  // l'eccezione: l'operatore l'ha scritto fra le feature o le etichette
  eq(ci('Fully furnished.', { bedrooms: 1, features: ['Fully furnished'] }), [],
    'il campo è vuoto ma l\'operatore l\'ha messo fra le feature: il modello l\'ha saputo dai fatti');
  eq(ci('Fully furnished.', { bedrooms: 1, tags: ['fully furnished'] }), [],
    '…o fra le etichette: è vero, e un testo che lo ripete non inventa');
  const prenestino = BY['2SwJ8yD3ITXylrEtYIlL'];
  ok(furnishingOf(prenestino) === null && (prenestino.tags || []).includes('fully furnished'),
    '2SwJ8yD3ITXylrEtYIlL: campo vuoto, «fully furnished» fra feature ed etichette (il caso vero)');
  eq(ci('A bright, fully furnished flat.', prenestino), [], '…e lì «fully furnished» passa');
  ok(ci('An unfurnished flat.', { bedrooms: 1, tags: ['fully furnished'] }).includes('furnishing_contradicted'),
    'etichette «fully furnished» + «unfurnished» → contraddetto (dichiarato è dichiarato, anche lì)');
  eq(ci('An unfurnished flat.', { bedrooms: 1, features: ['Unfurnished'] }), [], 'feature «Unfurnished» + «unfurnished» → coerente');

  const yes = { bedrooms: 1, furnished: 'yes' }, no = { bedrooms: 1, furnished: 'no' }, part = { bedrooms: 1, furnished: 'partial' };
  ok(ci('An unfurnished flat.', yes).includes('furnishing_contradicted'), 'dichiarata arredata («yes») + «unfurnished» → contraddetto');
  ok(ci('Da arredare.', yes).includes('furnishing_contradicted'), '…anche «da arredare»');
  ok(ci('La casa è vuota.', yes).includes('furnishing_contradicted'), '…anche «la casa è vuota»');
  ok(ci('Partially furnished.', yes).includes('furnishing_contradicted'), 'arredata del tutto + «partially furnished» → contraddetto');
  ok(ci('Fully furnished.', part).includes('furnishing_contradicted'), 'arredata in parte + «fully furnished» → contraddetto');
  ok(ci('Arredato con gusto.', no).includes('furnishing_contradicted'), 'dichiarata vuota + «arredato» → contraddetto');
  for (const [t, l] of [['Fully furnished.', yes], ['Arredato con gusto.', yes], ['Partially furnished.', part],
    ['Senza mobili.', no], ['Bring your own furniture.', no], ['The flat comes without furniture.', no], ['La casa è vuota.', no]]) {
    eq(ci(t, l), [], `dichiarata «${l.furnished}» + «${t}» → coerente`);
  }
}

// I rilievi del 15/10 sulle famiglie: falsi positivi che bloccavano testi
// giusti, e falsi negativi che lasciavano passare un prezzo o una data.
console.log('\n▸ falsi positivi: ciò che NON è un prezzo, una data, un conto');
{
  const zL4h = BY.zL4h3VusgV1qnoNQK5Dc;
  ok((zL4h.features || []).includes('storage'), 'zL4h ha la feature «storage» (storage room)');
  eq(ci('Un trilocale luminoso. Dispone anche di un deposito al piano.', zL4h), [],
    '«deposito» in italiano è anche il ripostiglio: non è una caparra');
  for (const t of ['Un deposito al 2° piano.', 'Deposito bici in cortile.', 'Un deposito di 10 mq.', 'Un deposito di 100 mq.',
    'Nel 2019 il deposito è stato rifatto.']) {
    ok(!ci(t, zL4h).includes('fee_in_text'), `«${t}» → non è una caparra`, ci(t, zL4h));
  }
  for (const t of ['Un deposito cauzionale di due mensilità.', 'Il deposito è di 2 mesi.', 'Due mesi di deposito.',
    'Deposito di 3000 euro.', 'Il deposito è 3000.', 'Cauzione pari a un mese.', 'Deposito di €3000.']) {
    ok(ci(t, zL4h).includes('fee_in_text'), `«${t}» → fee_in_text (è la caparra)`);
  }
  const pigneto = BY.pigneto;
  eq(FACTS.bedroomsOf(pigneto), 2, 'pigneto: 2 camere');
  eq(ci('Due camere da letto: una camera matrimoniale e una cameretta.', pigneto), [],
    '«una camera matrimoniale» descrive UNA delle camere, non le conta');
  eq(ci('Una camera da letto, luminosa.', BASE), [], '«una camera da letto» con 1 camera è giusto');

  for (const t of ['A 100 sqm flat with monthly cleaning of the stairs.', 'Built in 2019, with monthly maintenance.',
    'A canone concordato contract (3+2) is possible.', 'On the 5th floor, monthly cleaning.']) {
    ok(!ci(t, pigneto).includes('price_in_text'), `«${t}» → non è un prezzo (superficie, anno, durata)`, ci(t, pigneto));
  }
  for (const t of ['Near Marconi, a short walk from Marconi station.', 'You may enjoy the terrace.',
    'A building from the 1920s.']) {
    ok(!ci(t, pigneto).includes('date_in_text'), `«${t}» → non è una data`, ci(t, pigneto));
  }
}

// Le quattro forme che il fondatore ha voluto più strette (15/10): qui NON
// si bloccano più. descriptionIssues (js/catalogo-correzioni.js, l'altro
// pacchetto) oggi le segnala ancora: sono le sole divergenze ammesse, e la
// prova di classe più sotto ne pretende la lista esatta.
console.log('\n▸ le divergenze volute: falsi positivi che non bloccano più');
{
  const pigneto = BY.pigneto;
  for (const [t, code] of [
    ['A quiet street free from traffic.', 'date_in_text'],
    ['Libero dal traffico, il cortile è silenzioso.', 'date_in_text'],
    ['Le scale si puliscono due volte al mese.', 'price_in_text'],
    ['Cleaned twice per month.', 'price_in_text'],
    ['Rent is paid per month.', 'price_in_text'],
    ['Two bedrooms; one bedroom faces the courtyard.', 'bedrooms_mismatch'],
  ]) {
    const got = loose(t, pigneto, code);
    ok(!got.includes(code), `«${t}» → non è ${code}`, got);
  }
  // …ma la stessa famiglia, con una data, una cifra o il conto giusto mancante, sì
  for (const [t, code] of [['Free from 1 March.', 'date_in_text'], ['Free from March.', 'date_in_text'],
    ['Free from next month.', 'date_in_text'], ['Libera dal 1 settembre.', 'date_in_text'],
    ['900 al mese.', 'price_in_text'], ['1950 a month.', 'price_in_text'], ['The rent is 1,200 per month.', 'price_in_text'],
    ['One bedroom faces the courtyard.', 'bedrooms_mismatch']]) {
    ok(ci(t, pigneto).includes(code), `«${t}» → ${code}`, ci(t, pigneto));
  }
}

console.log('\n▸ falsi negativi: il prezzo e la data in ogni forma');
{
  const l = BY.pigneto;
  for (const t of ['1,500 EUR', 'EUR 1500 ogni mese.', 'Canone 1.500/mese.', 'Canone 1.500.', 'Yours for 1,500 a month.',
    '1.500 mensili.', 'The rent of 2000 includes…', '2.000 monthly.', '1.500/mese']) {
    ok(ci(t, l).includes('price_in_text'), `«${t}» → price_in_text`, ci(t, l));
  }
  for (const t of ['Immediately available.', 'Available immediately.', 'Available today.', 'The flat is yours from September.',
    'Disponibile a partire da settembre.', 'Available right away.', 'La casa è subito libera.', 'Si entra il 1 sett.',
    'Disponibile da subito.', 'Yours from mid-September.', 'Libera ora.', 'Dall\'1 settembre.', 'Available now.',
    'From 1 March.', 'September 1st, 2026.', 'Ready to move in.']) {
    ok(ci(t, l).includes('date_in_text'), `«${t}» → date_in_text`, ci(t, l));
  }
}

// LA DURATA (decisione del 15/10): con BOOM si affitta per almeno 3 mesi —
// mai promettere un mese, un soggiorno breve, un mese per mese.
console.log('\n▸ la durata del soggiorno: mai un mese, mai «short stays»');
{
  const l = BASE;
  for (const t of ['Ideal for stays from one month.', 'Perfect for short stays and digital nomads.',
    'Flexible month-to-month rental.', 'Minimum stay 1 month.', 'A 1-month lease is possible.', 'Short-term lets welcome.',
    'For a few weeks or more.', 'A 3-month minimum.', 'Stays of 3 months or more.', 'Mid-term rental.',
    'Soggiorni brevi anche di un mese.', 'Affitti brevi.', 'Per brevi periodi.', 'Almeno tre mesi.',
    'Contratto di 6 mesi.', 'Anche per un mese.', 'Mese per mese.', 'Ideale per il breve termine.']) {
    ok(ci(t, l).includes('stay_in_text'), `«${t}» → stay_in_text`, ci(t, l));
  }
  for (const t of ['Ideal for long-term stays.', 'A 1950s building.', 'Close to the Monti area.',
    'Monthly cleaning of the stairs.', 'Mese dopo mese il quartiere cambia.', 'Un trilocale di 80 mq.']) {
    ok(!ci(t, l).includes('stay_in_text'), `«${t}» → non è una durata`, ci(t, l));
  }
}

// IL CIVICO: il modello non lo riceve più; se compare è inventato o
// sfuggito. «Nomina la via, non il numero».
console.log('\n▸ il civico nel testo');
{
  const endertà = BY.ilW5lAxnNn5M2TjsSHx2;
  for (const t of ['On Via Endertà 9, a calm room.', 'On Via Endertà, 9.', 'Via Enderta 9 (senza accento).', 'Al civico 9 di Via Endertà.',
    'In Via Endertà al numero 9.', 'Via del Corso 75 is close.', 'Corso Vittorio Emanuele II 34.', 'Via dell\'Orso 5.',
    'Via di Sant\'Anna 16.', 'Near Via Merulana 12/A.', 'The house number is on the door.']) {
    ok(ci(t, endertà).includes('address_number'), `«${t}» → address_number`, ci(t, endertà));
  }
  const aprile = { address: 'Viale 21 Aprile 12', bedrooms: 1, furnished: 'yes' };
  ok(ci('On Viale 21 Aprile 12.', aprile).includes('address_number'), '«Viale 21 Aprile 12» (la propria via, col numero nel nome) → address_number');
  const torDiQuinto = { address: 'Via Di Tor Di quinto 39', bedrooms: 1, furnished: 'yes' };
  ok(ci('On Via di Tor di Quinto 39.', torDiQuinto).includes('address_number'), '«Via di Tor di Quinto 39» (la propria via, maiuscole diverse) → address_number');
  for (const t of ['On Via Endertà, a calm room.', '2 bedrooms', 'On the 3rd floor.', 'Close to Metro B.',
    'Via Nazionale, 2 minutes away.', 'Piazza Navona 5 min a piedi.', 'Via Appia 3 km away.', 'Metro B, 2 stops from Termini.',
    'Near Via Nazionale, a 2-minute walk.', 'Via Nomentana 300m away.', 'Viale 21 Aprile, near the park.',
    'Via Ostiense, 2 bedrooms and a terrace.', 'Lungotevere, 10 minutes on foot.',
    'A due passi dal Museo Civico di Zoologia.', 'Near the Teatro Civico.']) {
    ok(!ci(t, endertà).includes('address_number'), `«${t}» → non è un civico`, ci(t, endertà));
  }
  eq(ci('A flat on Viale 21 Aprile, near the park.', aprile), [], 'il proprio indirizzo senza numero passa (e non è una data)');
}

console.log('\n▸ il proprio indirizzo non è una data');
{
  const aprile = { address: 'Viale 21 Aprile 12', bedrooms: 1 };
  eq(ci('A flat on Viale 21 Aprile, near the park.', aprile), [],
    'il proprio indirizzo non è una data («Viale 21 Aprile»: altrimenti la casa non si rigenererebbe mai)');
  ok(ci('On Viale 21 Aprile, available from 21 April.', aprile).includes('date_in_text'), '…ma una data vera accanto sì');
}

// Nessun testo rigenerato deve finire nella lista dell'assistente: le
// famiglie di qui CONTENGONO quelle di js/catalogo-correzioni.js — sui 27
// testi veri, e su ogni frase di questa sezione contro case di ogni forma
// (arredo dichiarato o no, camere note, ignote o 0, una stanza). Le sole
// eccezioni sono le divergenze volute (LOOSE), ciascuna col suo codice.
console.log('\n▸ copyIssues contiene la lista dell\'assistente (descriptionIssues), tranne le divergenze volute');
if (HAS_FIX_ISSUES) {
  const gaps = [];
  for (const l of FIXTURE) {
    const mine = copyIssues((l.description || '') + '\n' + (l.descriptionIt || ''), l);
    for (const code of FIX.descriptionIssues(l)) if (!mine.includes(code)) gaps.push(l._id + ':' + code);
  }
  ok(gaps.length === 0, 'sui 27 testi veri copyIssues trova tutto ciò che trova descriptionIssues (catalogo-correzioni)', gaps);

  const SHAPES = [BASE, { type: 'Loft', bedrooms: 1 }, BY.pigneto, BY.zL4h3VusgV1qnoNQK5Dc, BY.angelico,
    { type: 'bilocale', bedrooms: 0, beds: 0, furnished: 'no' }, { type: 'Room', bedrooms: 1 }, { bedrooms: 0 }, {},
    { type: 'bilocale', furnished: 'partial', bedrooms: 2 }];
  const corpusGaps = [], declared = [];
  for (const t of CORPUS) {
    for (const l of SHAPES) {
      const mine = copyIssues(t, l);
      for (const code of FIX.descriptionIssues({ ...l, description: t, descriptionIt: '' })) {
        if (mine.includes(code)) continue;
        if (LOOSE.get(t) === code) declared.push(code);
        else corpusGaps.push(`${code} «${t.slice(0, 40)}» su ${l._id || l.type || '{}'}`);
      }
    }
  }
  ok(CORPUS.size >= 60 && corpusGaps.length === 0,
    `su ${CORPUS.size} frasi × ${SHAPES.length} case nessun codice di descriptionIssues manca a copyIssues fuori dalle divergenze volute`,
    corpusGaps.slice(0, 6));
  console.log(`    (divergenze volute ancora segnalate da descriptionIssues: ${declared.length} — si chiudono allentando anche lei)`);
} else ok(true, 'js/catalogo-correzioni.js (o descriptionIssues) assente: confronto saltato');

// ═══ 3. Chi si può rigenerare, e cosa resta scritto ══════════════════════
console.log('\n▸ chi si può rigenerare (regenVerdict)');
{
  eq(MACHINE_SOURCES, ['ai'], 'i testi della macchina: solo «ai» (i «lotto12» sono dell\'operatore)');
  for (const id of ['XcAnljWiqqx2s7msgWUR', 'wvX0h0lBoNKOMuTuHkVI', 'uHAGgEno6JKtWbgruJzU', '2SwJ8yD3ITXylrEtYIlL']) {
    const v = regenVerdict(BY[id]);
    ok(!v.ok && v.reason === 'not_machine' && v.note, `${id}: parole di una persona → saltata (${v.reason}), col motivo`);
  }
  for (const id of ['Kz9bXztv5QXmQrNhAcoU', 'qRRRV7BjXDPqgTpVchnz']) {
    const v = regenVerdict(BY[id]);
    ok(!v.ok && v.reason === 'not_machine' && v.source === 'lotto12' && /operatore/.test(v.note || ''),
      `${id} (lotto12, scritto e approvato dall'operatore il 16/08) → saltata, e il motivo lo dice`, v);
  }
  for (const id of ['OLLVsiKhPrhpT1fx8XmB', 'angelico']) {
    const v = regenVerdict(BY[id]);
    ok(v.ok && v.basis === 'machine', `${id}: scritta dalla macchina (${BY[id].descriptionSource}) → si rigenera`);
  }
  for (const id of ['G8tzBej0f8JyBP0oAqRS', 'yGBx17OFlSgD0Kowk9jK', 'zL4h3VusgV1qnoNQK5Dc']) {
    const v = regenVerdict(BY[id]);
    ok(v.ok && v.basis === 'boilerplate', `${id}: il template del bot → si rigenera`);
  }
  ok(regenVerdict({ description: '' }).basis === 'empty',
    'vuota → si scrive (basis «empty»: in /catalogo «missing» vuol dire annuncio non trovato)');
  const human = regenVerdict({ description: 'Corretta a mano dall\'assistente.', descriptionSource: 'ai', descriptionAiHash: textHash('Il vecchio testo della macchina.') });
  ok(!human.ok && human.reason === 'edited_after_machine',
    'marcata «ai» ma il testo non è più quello scritto dalla macchina → saltata');
  ok(regenVerdict({ description: '  Il vecchio testo\n della macchina. ', descriptionSource: 'ai', descriptionAiHash: textHash('Il vecchio testo della macchina.') }).ok,
    'spazi e a capo diversi non sono una correzione');
  // non è ESATTAMENTE «ai» → è di una persona, col motivo leggibile
  for (const [src, re] of [['portal:valentino@boom.test', /portale \(valentino@boom\.test\)/], ['studio:a@b.c', /Media Studio/],
    ['human', /«human»/], ['AI', /«AI»/], [' ai', /« ai»/], ['ai:old', /«ai:old»/], ['lotto12', /operatore/]]) {
    const v = regenVerdict({ description: 'Un testo qualsiasi.', descriptionSource: src });
    ok(!v.ok && v.reason === 'not_machine' && v.source === src && re.test(v.note || ''),
      `descriptionSource «${src}» → saltata, motivo: «${(v.note || '').slice(0, 70)}…»`, v);
  }
}

console.log('\n▸ cosa si scrive (machinePatch)');
{
  const p = machinePatch({ description: 'Vecchio', descriptionIt: 'Vecchio IT', descriptionOriginal: 'LE PAROLE DEL FONDATORE' }, 'New', 'Nuovo', '2026-10-15T10:00:00.000Z');
  ok(!('descriptionOriginal' in p), 'un descriptionOriginal che c\'è non si tocca MAI');
  eq([p.description, p.descriptionIt, p.descriptionSource, p.descriptionAt, p.descriptionPrevious, p.descriptionItPrevious],
    ['New', 'Nuovo', 'ai', '2026-10-15T10:00:00.000Z', 'Vecchio', 'Vecchio IT'], 'testo, fonte, data, e i testi sostituiti conservati');
  eq(p.descriptionAiHash, textHash('New'), 'l\'impronta del testo scritto');
  const q = machinePatch({ description: 'Primo testo' }, 'New', '');
  eq([q.descriptionOriginal, q.descriptionPrevious, 'descriptionIt' in q], ['Primo testo', 'Primo testo', false],
    'originale assente → si scrive; senza italiano nuovo nessun descriptionIt');
  const r = machinePatch({ description: '   ' }, 'New', 'Nuovo');
  ok(!('descriptionOriginal' in r) && !('descriptionPrevious' in r), 'niente testo prima → niente da conservare');
}

// ═══ 4. Il handler vero, sulla rete finta ════════════════════════════════
const PREFIX = 'projects/test-proj/databases/(default)/documents/';
const STORE = new Map();          // path → { data, updateTime }
const WRITES = [];                // { path, fields, precondition }
const CALLS = { anthropic: [], lookups: 0, gets: [] };
let clock = 0;
const nextVersion = () => new Date(Date.UTC(2026, 9, 15, 9, 0, 0) + (++clock) * 1000).toISOString().replace('Z', '000Z');

function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fsJson = (path) => {
  const d = STORE.get(path), fields = {};
  for (const [k, v] of Object.entries(d.data)) fields[k] = toFs(v);
  return { name: PREFIX + path, fields, updateTime: d.updateTime, createTime: '2026-01-01T00:00:00.000000Z' };
};
const put = (path, data) => STORE.set(path, { data: structuredClone(data), updateTime: nextVersion() });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// la risposta del modello: pulita, o rotta nei modi che contano
const CLEAN_EN = 'A calm, well-kept home in Rome with good light and air conditioning. The neighbourhood is residential, with daily shops and easy transport.';
const CLEAN_IT = 'Una casa tranquilla e curata a Roma, con buona luce e aria condizionata. Il quartiere è residenziale, con negozi di ogni giorno e trasporti comodi.';
const PROSE = 'Sure! Here is a lovely description of the flat, enjoy.';
let MODE = 'clean';
let ON_ANTHROPIC = null;          // gancio: cosa succede «mentre il modello scrive»
let ON_LIST = null;               // gancio: cosa succede dopo la lista dello sweep
let ON_GET = null;                // gancio: una lettura che «costa» tempo, o che cade
// il tetto di tempo della chiamata al modello si legge sul segnale che
// api/_budget.js (aiSignal) passa alla fetch: AbortSignal.timeout(ms)
const realTimeout = AbortSignal.timeout.bind(AbortSignal);
AbortSignal.timeout = (ms) => { const sg = realTimeout(ms); sg.__ms = ms; return sg; };
const answer = () => {
  if (MODE === 'http500') return null;
  // risposte che non sono il JSON chiesto, scritte così come le manda il modello
  const raw = {
    prose: PROSE,
    prose_price: 'A lovely flat for €1,500 per month, close to everything.',
    json_other: '{"description":"A nice flat in Rome."}',
    en_null: '{"en":null,"it":"Una bella casa."}',
  }[MODE];
  if (raw !== undefined) return raw;
  const t = {
    clean: { en: CLEAN_EN, it: CLEAN_IT },
    price: { en: CLEAN_EN + ' Yours for €1,500 per month.', it: CLEAN_IT },
    date: { en: CLEAN_EN + ' Available from 1 March.', it: CLEAN_IT },
    unfurnished: { en: 'The unfurnished space is a blank canvas. ' + CLEAN_EN, it: CLEAN_IT },
    furnished_inv: { en: 'A fully furnished loft. ' + CLEAN_EN, it: CLEAN_IT },
    three: { en: 'It offers three bedrooms. ' + CLEAN_EN, it: CLEAN_IT },
    stay: { en: CLEAN_EN + ' Ideal for stays from one month.', it: CLEAN_IT },
    civico: { en: 'On Via Dei Cappellari 4, a calm home. ' + CLEAN_EN, it: CLEAN_IT },
    // sbaglia SOLO in italiano: anche l'italiano è pubblico
    it_price: { en: CLEAN_EN, it: CLEAN_IT + ' Il canone è di 1.500 al mese.' },
    empty_en: { en: '', it: CLEAN_IT },
    no_it: { en: CLEAN_EN, it: '' },
  }[MODE];
  return t ? JSON.stringify(t) : PROSE;
};

const TOKENS = { 'tok-admin': 'adm', 'tok-landlord': 'lnd', 'tok-tenant': 'tnt' };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://identitytoolkit.googleapis.com/')) {
    if (u.includes('signInWithPassword')) return json({ idToken: 'server-token', expiresIn: '3600' });
    CALLS.lookups++;
    const uid = TOKENS[JSON.parse(opts.body || '{}').idToken];
    return uid ? json({ users: [{ localId: uid }] }) : json({ error: { message: 'INVALID_ID_TOKEN' } }, 400);
  }
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    const body = JSON.parse(opts.body);
    body.__timeoutMs = opts.signal ? opts.signal.__ms : undefined;
    CALLS.anthropic.push(body);
    if (ON_ANTHROPIC) await ON_ANTHROPIC(body);
    const text = answer();
    if (text === null) return json({ error: { message: 'overloaded' } }, 500);
    return json({ content: [{ type: 'text', text }], usage: { input_tokens: 120, output_tokens: 90 },
      model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn' });
  }
  if (u.startsWith('https://firestore.googleapis.com/')) {
    const rest = u.split('(default)/documents')[1].split('?')[0];
    if (rest === ':runQuery') {
      const sq = JSON.parse(opts.body).structuredQuery;
      const col = sq.from[0].collectionId;
      const rows = [...STORE.keys()].filter((k) => k.startsWith(col + '/') && k.split('/').length === 2)
        .slice(0, sq.limit || 50).map((k) => ({ document: fsJson(k) }));
      if (ON_LIST) { const h = ON_LIST; ON_LIST = null; await h(); }
      return json(rows.length ? rows : [{}]);
    }
    if (rest === ':commit') {
      const { writes } = JSON.parse(opts.body);
      // come il Firestore vero: tutte le precondizioni prima, poi tutto o niente
      for (const w of writes) {
        const path = w.update.name.slice(PREFIX.length);
        const cd = w.currentDocument;
        if (cd && cd.updateTime && (!STORE.has(path) || STORE.get(path).updateTime !== cd.updateTime)) {
          return json({ error: { code: 400, status: 'FAILED_PRECONDITION', message: 'stale' } }, 400);
        }
        if (cd && cd.exists === true && !STORE.has(path)) return json({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
        if (cd && cd.exists === false && STORE.has(path)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
      }
      for (const w of writes) {
        const path = w.update.name.slice(PREFIX.length);
        const fields = {};
        for (const k of w.updateMask.fieldPaths) fields[k] = fromFs(w.update.fields[k]);
        WRITES.push({ path, fields, precondition: w.currentDocument || null });
        const cur = STORE.has(path) ? STORE.get(path).data : {};
        STORE.set(path, { data: { ...cur, ...fields }, updateTime: nextVersion() });
      }
      return json({ writeResults: writes.map(() => ({ updateTime: nextVersion() })) });
    }
    if ((opts.method || 'GET') === 'GET') {
      const path = rest.replace(/^\//, '');
      CALLS.gets.push(path);
      if (ON_GET) await ON_GET(path);
      return STORE.has(path) ? json(fsJson(path)) : json({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
    }
  }
  throw new Error('fetch non stubbata: ' + (opts.method || 'GET') + ' ' + u);
};

function seed() {
  STORE.clear(); WRITES.length = 0; CALLS.anthropic.length = 0; CALLS.gets.length = 0;
  MODE = 'clean'; ON_ANTHROPIC = null; ON_LIST = null; ON_GET = null;
  for (const l of FIXTURE) { const { _id, ...data } = l; put('listings/' + _id, data); }
  put('users/adm', { role: 'admin', email: 'valentino@boom.test' });
  put('users/lnd', { role: 'landlord', email: 'owner@boom.test' });
  put('users/tnt', { role: 'tenant', email: 'tenant@boom.test' });
}
const listingWrites = () => WRITES.filter((w) => w.path.startsWith('listings/'));
const doc = (id) => STORE.get('listings/' + id)?.data;
const mkRes = () => ({
  statusCode: 200, body: null, headers: {},
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; },
  end() { return this; },
});
async function call({ method = 'POST', headers = {}, body, query = {} } = {}) {
  const res = mkRes();
  await handler({ method, headers, body, query }, res);
  return res;
}
const regen = (ids, headers) => call({ headers, body: { mode: 'regenerate', ids } });
const ADMIN = { authorization: 'Bearer tok-admin' };
const BOT = { 'x-wizard-secret': 'wizard-secret-test' };
const userText = (b) => b.messages[b.messages.length - 1].content;

// ─── 4a. la strada del bot: lo stesso controllo, e mai il JSON grezzo ──
console.log('\n▸ la strada del bot (X-Wizard-Secret)');
{
  seed();
  const BODY = { type: 'bilocale', zone: 'Prati', address: 'Via Endertà 9', sqm: 60, beds: 2, bathrooms: 1, price: 1500,
    availableDate: '2026-11-01', features: ['ac', 'washing_machine'], concordato: true, furnished: 'yes' };
  const r = await call({ headers: BOT, body: BODY });
  ok(r.statusCode === 200 && r.body.en === CLEAN_EN && r.body.it === CLEAN_IT, 'il bot riceve en e it', r.body);
  eq([r.body.aiHash, r.body.issues], [textHash(CLEAN_EN), []], '…e l\'impronta del testo, da conservare con la copia; nessun problema');
  const b = CALLS.anthropic[0];
  ok(b && b.system === SYSTEM, 'il modello riceve il SYSTEM con le regole');
  const u = b ? userText(b) : '';
  ok(!/€|1500|^Rent:|Available from|2026-11-01/m.test(u), 'canone e data mandati dal bot NON arrivano al modello', u);
  ok(/^Street: Via Endertà$/m.test(u) && !/Endertà\s*,?\s*9/.test(u), 'dell\'indirizzo arriva la via, mai il civico', u);
  ok(listingWrites().length === 0, 'la strada del bot non scrive niente');
  const no = await call({ body: { type: 'bilocale' } });
  ok(no.statusCode === 401 && CALLS.anthropic.length === 1, 'senza segreto: 401 e nessuna chiamata al modello');

  // un testo che viola le regole non arriva al bot (che pubblica senza leggere)
  for (const [mode, code] of [['price', 'price_in_text'], ['it_price', 'price_in_text'], ['stay', 'stay_in_text'],
    ['civico', 'address_number'], ['date', 'date_in_text'], ['prose_price', 'price_in_text']]) {
    MODE = mode;
    const x = await call({ headers: BOT, body: { ...BODY, address: 'Via Dei Cappellari 4' } });
    ok(x.statusCode === 200 && x.body.ok === true && x.body.en === '' && x.body.it === '' && x.body.aiHash === null
      && (x.body.issues || []).includes(code),
      `modello «${mode}» → al bot en e it vuoti, aiHash null, issues [${code}] (ripiega sul suo modello)`, x.body);
  }
  // un JSON che non è quello chiesto non diventa MAI la descrizione, e
  // senza inglese non arriva nemmeno l'italiano
  for (const mode of ['json_other', 'en_null', 'empty_en']) {
    MODE = mode;
    const x = await call({ headers: BOT, body: BODY });
    ok(x.statusCode === 200 && x.body.en === '' && x.body.it === '' && x.body.aiHash === null && !/[{}]/.test(JSON.stringify(x.body.en)),
      `modello «${mode}» → en vuoto, mai il JSON grezzo come descrizione`, x.body);
  }
  // la prosa senza JSON torna così com'è — passata dal controllo
  MODE = 'prose';
  const p = await call({ headers: BOT, body: BODY });
  ok(p.statusCode === 200 && p.body.en === PROSE && p.body.it === '' && p.body.aiHash === textHash(PROSE),
    'prosa senza nessun JSON → al bot il testo così com\'è (lo pubblica chi l\'ha chiesto)', p.body);
  MODE = 'http500';
  const down = await call({ headers: BOT, body: BODY });
  ok(down.statusCode === 502 && down.body.error === 'ai_failed', 'modello giù → 502 ai_failed', down.body);
  ok(listingWrites().length === 0, 'in nessun caso la strada del bot scrive');
}

// ─── 4b. regenerate: chi può ────────────────────────────────────────────
console.log('\n▸ regenerate: solo un admin o il cron, mai il segreto del bot');
{
  seed();
  const before = structuredClone(doc('OLLVsiKhPrhpT1fx8XmB'));
  const cases = [
    ['nessuna credenziale', {}, 401],
    ['solo il segreto del bot (X-Wizard-Secret)', BOT, 401],
    ['il segreto di Homie (il bot ci ricade senza WIZARD_SECRET)', { 'x-homie-secret': 'homie-secret-test' }, 403],
    ['un token falso', { authorization: 'Bearer tok-falso' }, 401],
    ['un inquilino', { authorization: 'Bearer tok-tenant' }, 403],
    ['un proprietario (le regole Firestore non gli danno i listings)', { authorization: 'Bearer tok-landlord' }, 403],
    ['un cron col segreto sbagliato', { authorization: 'Bearer cron-sbagliato' }, 401],
  ];
  for (const [what, headers, code] of cases) {
    const r = await regen(['OLLVsiKhPrhpT1fx8XmB'], headers);
    ok(r.statusCode === code && r.body && r.body.ok === false, `${what} → ${code}`, { status: r.statusCode, body: r.body });
  }
  const viaQuery = await call({ headers: BOT, query: { mode: 'regenerate' }, body: { ids: ['OLLVsiKhPrhpT1fx8XmB'] } });
  ok(viaQuery.statusCode === 401, '?mode=regenerate col segreto del bot e un corpo senza mode → 401, mai la strada del bot');
  ok(CALLS.anthropic.length === 0, 'in nessuno di questi casi parte una chiamata al modello', CALLS.anthropic.length);
  ok(listingWrites().length === 0, '…né una scrittura');
  eq(doc('OLLVsiKhPrhpT1fx8XmB'), before, 'l\'annuncio è identico a prima');

  // il profilo dell'admin non si rilegge (la seconda lettura, quella che
  // distingue admin da proprietario, cade): 503, mai «admin» per difetto
  let reads = 0;
  ON_GET = async (path) => { if (path === 'users/adm' && ++reads === 2) throw new Error('rete giù'); };
  const unread = await regen(['OLLVsiKhPrhpT1fx8XmB'], ADMIN);
  ON_GET = null;
  ok(unread.statusCode === 503 && unread.body.error === 'profile_unavailable' && reads === 2,
    'il profilo dell\'admin non si rilegge → 503 profile_unavailable', { status: unread.statusCode, body: unread.body, reads });
  ok(CALLS.anthropic.length === 0 && listingWrites().length === 0 && !CALLS.gets.includes('listings/OLLVsiKhPrhpT1fx8XmB'),
    '…e niente letto, niente chiesto al modello, niente scritto');

  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const nokey = await regen(['OLLVsiKhPrhpT1fx8XmB'], ADMIN);
  process.env.ANTHROPIC_API_KEY = key;
  ok(nokey.statusCode === 500 && nokey.body.error === 'server_missing_anthropic_key' && !CALLS.gets.includes('listings/OLLVsiKhPrhpT1fx8XmB'),
    'senza ANTHROPIC_API_KEY → 500 detto, nessun annuncio letto', nokey.body);

  for (const [what, body, code, err] of [
    ['ids assenti', { mode: 'regenerate' }, 400, 'ids_required'],
    ['ids vuoti', { mode: 'regenerate', ids: [] }, 400, 'ids_required'],
    [`più di ${REGEN_MAX_IDS} id`, { mode: 'regenerate', ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, 400, 'too_many_ids'],
    ['un id con «/» (sotto-collezione)', { mode: 'regenerate', ids: ['ok', 'listings/x'] }, 400, 'invalid_id'],
    ['un id riservato', { mode: 'regenerate', ids: ['__x__'] }, 400, 'invalid_id'],
    ['un id non stringa', { mode: 'regenerate', ids: [42] }, 400, 'invalid_id'],
  ]) {
    const r = await call({ headers: ADMIN, body });
    ok(r.statusCode === code && r.body.error === err, `${what} → ${code} ${err}`, r.body);
  }
  ok(CALLS.anthropic.length === 0 && listingWrites().length === 0, 'un input storto non spende e non scrive');

  const cron = await regen(['G8tzBej0f8JyBP0oAqRS'], { authorization: 'Bearer cron-secret-test' });
  ok(cron.statusCode === 200 && cron.body.results[0].outcome === 'written', 'il cron (Bearer CRON_SECRET) può', cron.body);
}

// ─── 4c. regenerate: cosa fa ────────────────────────────────────────────
console.log('\n▸ regenerate: riscrive la macchina, salta le persone, conserva tutto');
{
  seed();
  put('listings/conOriginale', { status: 'waitlist', type: 'bilocale', bedrooms: 1, furnished: 'yes',
    description: 'Testo della macchina, sbagliato.', descriptionSource: 'ai', descriptionOriginal: 'LE PAROLE DEL FONDATORE' });
  const old = structuredClone(doc('OLLVsiKhPrhpT1fx8XmB'));
  const human = structuredClone(doc('wvX0h0lBoNKOMuTuHkVI'));
  const r = await regen(['OLLVsiKhPrhpT1fx8XmB', 'wvX0h0lBoNKOMuTuHkVI', 'angelico', 'G8tzBej0f8JyBP0oAqRS', 'conOriginale', 'non-esiste'], ADMIN);
  ok(r.statusCode === 200 && r.body.ok === true, 'risponde 200 con ok', r.body);
  const by = Object.fromEntries((r.body.results || []).map((x) => [x.id, x]));
  eq((r.body.results || []).map((x) => x.id), ['OLLVsiKhPrhpT1fx8XmB', 'wvX0h0lBoNKOMuTuHkVI', 'angelico', 'G8tzBej0f8JyBP0oAqRS', 'conOriginale', 'non-esiste'],
    'un risultato per id, nell\'ordine chiesto');
  eq([r.body.written, r.body.skipped, r.body.failed].map((a) => Array.isArray(a) ? a.length : a), [4, 1, 1],
    'gli esiti divisi come nello sweep: 4 scritte, 1 saltata, 1 fallita');
  ok(['written', 'skipped', 'failed'].every((o) => r.body[o].every((x) => x.outcome === o))
    && r.body.written.length + r.body.skipped.length + r.body.failed.length === r.body.results.length,
    '…ognuno nella sua lista, nessuno perso né doppio rispetto a results');
  ok(r.body.results.every((x) => typeof x.note === 'string' && x.note.length > 10), 'ogni esito ha la sua frase in italiano (note)');

  ok(by.OLLVsiKhPrhpT1fx8XmB?.outcome === 'written' && by.OLLVsiKhPrhpT1fx8XmB.reason === 'machine', 'OLLV (scritta dalla macchina, «three bedrooms») → riscritta');
  const o = doc('OLLVsiKhPrhpT1fx8XmB');
  eq([o.description, o.descriptionIt, o.descriptionSource], [CLEAN_EN, CLEAN_IT, 'ai'], 'OLLV: testo nuovo in entrambe le lingue, fonte «ai»');
  eq([o.descriptionPrevious, o.descriptionItPrevious, o.descriptionOriginal], [old.description, old.descriptionIt, old.description],
    'OLLV: il testo di prima resta (previous) e, mancando, diventa l\'originale');
  ok(typeof o.descriptionAt === 'string' && !Number.isNaN(Date.parse(o.descriptionAt)), 'OLLV: descriptionAt è una data');
  eq(o.descriptionAiHash, textHash(CLEAN_EN), 'OLLV: l\'impronta del testo scritto');
  eq([o.bedrooms, o.beds, o.price, o.name], [old.bedrooms, old.beds, old.price, old.name], 'OLLV: nessun altro campo toccato');
  const fO = CALLS.anthropic.map(userText).find((t) => /Via Dei Cappellari/.test(t)) || '';
  ok(/^Bedrooms: 1$/m.test(fO) && !/Bedrooms: 3/.test(fO), 'al modello per OLLV: «Bedrooms: 1»', fO);
  ok(/^Street: Via Dei Cappellari$/m.test(fO) && !/Cappellari\s*,?\s*4\b/.test(fO), 'al modello per OLLV: la via, senza il «4»', fO);

  ok(by.wvX0h0lBoNKOMuTuHkVI?.outcome === 'skipped' && by.wvX0h0lBoNKOMuTuHkVI.reason === 'not_machine' && by.wvX0h0lBoNKOMuTuHkVI.note,
    'Capri (parole di una persona) → saltata, col motivo', by.wvX0h0lBoNKOMuTuHkVI);
  eq(doc('wvX0h0lBoNKOMuTuHkVI'), human, 'Capri: identica, campo per campo');

  ok(by.angelico?.outcome === 'written', 'angelico («unfurnished» inventato, €2000, 1 luglio) → riscritta');
  const fA = CALLS.anthropic.map(userText).find((t) => /Viale Angelico/.test(t)) || '';
  ok(fA && !/Furnishing|unfurnished|€|2000|Available|July/i.test(fA), 'al modello per angelico: niente arredo, niente canone, niente data', fA);

  ok(by.G8tzBej0f8JyBP0oAqRS?.outcome === 'written' && by.G8tzBej0f8JyBP0oAqRS.reason === 'boilerplate', 'il template del bot → riscritto');
  ok(isBoilerplate(doc('G8tzBej0f8JyBP0oAqRS').descriptionOriginal), '…e il template resta in descriptionOriginal');

  eq(doc('conOriginale').descriptionOriginal, 'LE PAROLE DEL FONDATORE', 'un descriptionOriginal che c\'era resta quello (mai sovrascritto)');
  eq(doc('conOriginale').descriptionPrevious, 'Testo della macchina, sbagliato.', '…il testo appena sostituito va in descriptionPrevious');
  ok(by['non-esiste']?.outcome === 'failed' && by['non-esiste'].reason === 'not_found', 'un id inesistente → failed not_found, detto');
  ok(!STORE.has('listings/non-esiste'), '…e nessun annuncio fantasma creato');
  ok(listingWrites().every((w) => w.precondition && w.precondition.updateTime), 'ogni scrittura è condizionata alla versione letta');

  // il giro dell'assistente: corregge a mano, e il testo non è più quello
  // della macchina (l'impronta non torna)
  const again = await regen(['OLLVsiKhPrhpT1fx8XmB'], ADMIN);
  ok(again.body.results[0].outcome === 'written', 'un testo della macchina rimasto com\'era si può rigenerare ancora');
  const cur = STORE.get('listings/OLLVsiKhPrhpT1fx8XmB');
  cur.data.description = 'Bilocale luminoso in Via dei Cappellari, scritto dall\'assistente dopo il giro.';
  cur.updateTime = nextVersion();
  const kept = structuredClone(cur.data);
  const after = await regen(['OLLVsiKhPrhpT1fx8XmB'], ADMIN);
  ok(after.body.results[0].outcome === 'skipped' && after.body.results[0].reason === 'edited_after_machine',
    'corretta a mano DOPO la macchina (fonte ancora «ai») → saltata', after.body.results[0]);
  eq(doc('OLLVsiKhPrhpT1fx8XmB'), kept, '…e le parole dell\'assistente restano');
}

console.log('\n▸ regenerate: le parole di una persona, in tutte le forme');
{
  seed();
  // il portale (l'altro pacchetto) marca la correzione a mano
  put('listings/dalPortale', { status: 'available', type: 'bilocale', bedrooms: 1, furnished: 'yes',
    description: 'Scritta dall\'assistente nel giro delle case.', descriptionSource: 'portal:valentino@boom.test' });
  const ids = ['Kz9bXztv5QXmQrNhAcoU', 'qRRRV7BjXDPqgTpVchnz', 'dalPortale'];
  const before = ids.map((id) => structuredClone(doc(id)));
  const r = await regen(ids, ADMIN);
  const res = r.body.results || [];
  ok(res.length === 3 && res.every((x) => x.outcome === 'skipped' && x.reason === 'not_machine'),
    'lotto12 (×2) e la correzione dal portale → saltate (not_machine)', res);
  ok(res.slice(0, 2).every((x) => x.source === 'lotto12' && /operatore/.test(x.note)),
    'i lotto12: la fonte e il motivo («scritta e approvata dall\'operatore») arrivano a /catalogo', res.slice(0, 2));
  ok(res[2].source === 'portal:valentino@boom.test' && /portale/.test(res[2].note), 'la correzione dal portale: chi e da dove', res[2]);
  ok(ids.every((id, i) => JSON.stringify(doc(id)) === JSON.stringify(before[i])) && CALLS.anthropic.length === 0 && listingWrites().length === 0,
    '…nessuna toccata, nessuna chiamata al modello, nessuna scrittura');
}

console.log('\n▸ regenerate: un id ripetuto vale una volta');
{
  seed();
  const old = structuredClone(doc('OLLVsiKhPrhpT1fx8XmB'));
  const r = await regen(['OLLVsiKhPrhpT1fx8XmB', 'OLLVsiKhPrhpT1fx8XmB', ' OLLVsiKhPrhpT1fx8XmB '], ADMIN);
  eq((r.body.results || []).map((x) => x.id + ':' + x.outcome), ['OLLVsiKhPrhpT1fx8XmB:written'], 'tre volte lo stesso id → un esito solo');
  eq([CALLS.anthropic.length, listingWrites().length], [1, 1], '…una chiamata al modello, una scrittura');
  eq(doc('OLLVsiKhPrhpT1fx8XmB').descriptionPrevious, old.description,
    '…e in descriptionPrevious c\'è il testo di PRIMA, non quello scritto un attimo fa');
}

// ─── 4d. regenerate: i guasti si dicono, e non scrivono ────────────────
console.log('\n▸ regenerate: un testo rotto non si pubblica, un guasto si dice');
{
  const once = async (mode, id) => {
    seed(); MODE = mode;
    const before = structuredClone(doc(id));
    const r = await regen([id], ADMIN);
    return { r: r.body && r.body.results && r.body.results[0], before, after: doc(id), status: r.statusCode };
  };
  for (const [mode, id, reason, issue] of [
    ['price', 'OLLVsiKhPrhpT1fx8XmB', 'broke_rules', 'price_in_text'],
    ['it_price', 'OLLVsiKhPrhpT1fx8XmB', 'broke_rules', 'price_in_text'],
    ['date', 'OLLVsiKhPrhpT1fx8XmB', 'broke_rules', 'date_in_text'],
    ['stay', 'OLLVsiKhPrhpT1fx8XmB', 'broke_rules', 'stay_in_text'],
    ['civico', 'OLLVsiKhPrhpT1fx8XmB', 'broke_rules', 'address_number'],
    ['three', 'OLLVsiKhPrhpT1fx8XmB', 'broke_rules', 'bedrooms_mismatch'],
    ['unfurnished', 'angelico', 'broke_rules', 'furnishing_invented'],
    ['furnished_inv', 'angelico', 'broke_rules', 'furnishing_invented'],
    ['empty_en', 'OLLVsiKhPrhpT1fx8XmB', 'empty_copy', null],
    ['empty_en', 'G8tzBej0f8JyBP0oAqRS', 'empty_copy', null],
    ['no_it', 'OLLVsiKhPrhpT1fx8XmB', 'no_italian', null],
    ['prose', 'OLLVsiKhPrhpT1fx8XmB', 'ai_unreadable', null],
    ['json_other', 'OLLVsiKhPrhpT1fx8XmB', 'ai_unreadable', null],
    ['http500', 'OLLVsiKhPrhpT1fx8XmB', 'ai_failed', null],
  ]) {
    const { r, before, after, status } = await once(mode, id);
    ok(status === 200 && r && r.outcome === 'failed' && r.reason === reason && (!issue || (r.issues || []).includes(issue)) && r.note,
      `modello «${mode}» su ${id.slice(0, 8)} → failed ${reason}${issue ? ' (' + issue + ')' : ''}, col motivo`, r);
    eq(after, before, `modello «${mode}» su ${id.slice(0, 8)} → l'annuncio resta com'era`);
  }
  {
    seed(); MODE = 'prose';
    const before = structuredClone(doc('G8tzBej0f8JyBP0oAqRS'));
    const r = await regen(['G8tzBej0f8JyBP0oAqRS'], ADMIN);
    ok(r.body.results[0].outcome === 'failed' && r.body.results[0].reason === 'ai_unreadable',
      'una risposta in prosa non si pubblica nemmeno dove non c\'è un italiano vecchio da proteggere', r.body.results[0]);
    eq(doc('G8tzBej0f8JyBP0oAqRS'), before, '…e il template resta dov\'era, finché non arriva un testo vero');
  }
  {
    seed(); MODE = 'no_it';
    const r = await regen(['G8tzBej0f8JyBP0oAqRS'], ADMIN);
    ok(r.body.results[0].outcome === 'written' && r.body.results[0].italian === false && !('descriptionIt' in doc('G8tzBej0f8JyBP0oAqRS')),
      'senza italiano nuovo ma senza italiano vecchio da smentire → si scrive l\'inglese, e lo si dice', r.body.results[0]);
  }
  {
    seed();
    ON_ANTHROPIC = async () => {
      const cur = STORE.get('listings/OLLVsiKhPrhpT1fx8XmB');
      cur.data.description = 'Salvato dal portal mentre il modello scriveva.';
      cur.updateTime = nextVersion();
    };
    const r = await regen(['OLLVsiKhPrhpT1fx8XmB'], ADMIN);
    ok(r.body.results[0].outcome === 'failed' && r.body.results[0].reason === 'changed_meanwhile',
      'qualcuno salva l\'annuncio mentre il modello scrive → failed changed_meanwhile', r.body.results[0]);
    eq(doc('OLLVsiKhPrhpT1fx8XmB').description, 'Salvato dal portal mentre il modello scriveva.', '…e il suo salvataggio resta');
  }
  {
    seed();
    const realNow = Date.now;
    let skew = 0;
    Date.now = () => realNow() + skew;
    ON_ANTHROPIC = async () => { skew += 18_000; };     // ogni descrizione «costa» 18s
    const ids = ['OLLVsiKhPrhpT1fx8XmB', 'angelico', 'navona', 'piemonte', 'pigneto', 'ripetta'];
    const before = ids.map((id) => structuredClone(doc(id)));
    let r;
    try { r = await regen(ids, ADMIN); } finally { Date.now = realNow; }
    const out = r.body.results.map((x) => x.outcome + ':' + x.reason);
    eq(out.slice(0, 2), ['written:machine', 'written:machine'], 'tempo: le prime due ci stanno', out);
    ok(r.body.results.slice(2).every((x) => x.outcome === 'skipped' && x.reason === 'time_budget' && x.note),
      'tempo: oltre i ~45s il resto si salta col motivo («rimandala»), non si comincia ciò che non si può finire', out);
    ok(ids.slice(2).every((id, i) => JSON.stringify(doc(id)) === JSON.stringify(before[i + 2])), '…e quelle saltate non sono toccate');
    ok(ids.slice(2).every((id) => !CALLS.gets.includes('listings/' + id)),
      '…né lette: senza il tempo di finire non si comincia nemmeno', CALLS.gets.filter((g) => g.startsWith('listings/')));
    eq(CALLS.anthropic.length, 2, 'tempo: due chiamate al modello, non sei');
  }
  // il tempo che una LETTURA lenta si mangia: la chiamata al modello riceve
  // solo quello che resta (mai i 20s pieni), e sotto il minimo non parte
  const slowRead = async (readCostMs) => {
    seed();
    const realNow = Date.now;
    let skew = 0;
    Date.now = () => realNow() + skew;
    ON_ANTHROPIC = async () => { skew += 18_000; };
    ON_GET = async (path) => { if (path === 'listings/angelico') skew += readCostMs; };
    let r;
    try { r = await regen(['OLLVsiKhPrhpT1fx8XmB', 'angelico'], ADMIN); } finally { Date.now = realNow; }
    return r.body.results;
  };
  {
    const res = await slowRead(8_000);    // angelico parte a ~18s, letto a ~26s: restano ~19s
    const t = CALLS.anthropic[1] && CALLS.anthropic[1].__timeoutMs;
    ok(res[1].outcome === 'written' && typeof t === 'number' && t <= 13_000 && t >= 8_000,
      `lettura lenta: il modello riceve il tempo che resta (${t}ms ≤ 13s), non i 20s pieni`, { t, r: res[1] });
    const t0 = CALLS.anthropic[0] && CALLS.anthropic[0].__timeoutMs;
    ok(typeof t0 === 'number' && t0 <= 20_000 && t0 > 13_000, `a inizio chiamata il tetto è quello di sempre (${t0}ms ≤ 20s)`, t0);
  }
  {
    const res = await slowRead(15_000);   // letto a ~33s: restano ~12s, meno del minimo utile
    ok(res[1].outcome === 'skipped' && res[1].reason === 'time_budget',
      'lettura lentissima: non c\'è più il tempo minimo → saltata dopo la lettura, col motivo', res[1]);
    ok(CALLS.anthropic.length === 1 && doc('angelico').descriptionSource === 'ai' && !doc('angelico').descriptionAiHash,
      '…nessuna chiamata al modello per lei, nessuna scrittura');
  }
}

// ─── 4e. lo sweep notturno passa dalla stessa strada ───────────────────
console.log('\n▸ lo sweep notturno (GET ?mode=sweep)');
{
  seed();
  for (const k of [...STORE.keys()]) if (k.startsWith('listings/')) STORE.delete(k);
  put('listings/tmplOrig', { status: 'available', type: 'bilocale', bedrooms: 1, furnished: 'yes',
    description: 'Beautiful bilocale in Prati, 60sqm on floor 1, fully furnished. 1 beds, 1 bathroom. €1,200/month.',
    descriptionOriginal: 'Le parole di chi l\'ha messo online per primo.' });
  put('listings/muto', { status: 'available', type: 'Room', bedrooms: 1, description: '' });
  put('listings/umano', { status: 'available', type: 'Studio', description: 'Perfect for Luiss students.' });
  put('listings/riempito', { status: 'waitlist', type: 'Loft', description: '' });
  put('listings/lotto', { status: 'available', type: 'Duplex', description: 'Le parole dell\'operatore.', descriptionSource: 'lotto12' });
  ON_LIST = async () => {
    const c = STORE.get('listings/riempito');
    c.data.description = 'Scritta a mano mentre lo sweep partiva.';
    c.updateTime = nextVersion();
  };
  const r = await call({ method: 'GET', headers: { authorization: 'Bearer cron-secret-test' }, query: { mode: 'sweep' } });
  ok(r.statusCode === 200 && r.body.ok === true && r.body.mode === 'sweep', 'lo sweep risponde', r.body);
  eq((r.body.written || []).map((w) => w.id + ':' + w.gap).sort(), ['muto:missing', 'tmplOrig:boilerplate'], 'riempie il muto e il template');
  eq(doc('tmplOrig').descriptionOriginal, 'Le parole di chi l\'ha messo online per primo.', 'lo sweep non sovrascrive più un descriptionOriginal');
  ok(isBoilerplate(doc('tmplOrig').descriptionPrevious), '…il template sostituito resta in descriptionPrevious');
  eq(doc('umano').description, 'Perfect for Luiss students.', 'le parole di una persona non sono nemmeno candidate');
  eq(doc('lotto').description, 'Le parole dell\'operatore.', '…né quelle dell\'operatore (lotto12)');
  eq((r.body.skipped || []).map((s) => s.id + ':' + s.note), ['riempito:no_gap'], 'riempito nel frattempo → saltato sul dato fresco');
  eq(doc('riempito').description, 'Scritta a mano mentre lo sweep partiva.', '…e quel testo resta');
  ok(listingWrites().every((w) => w.precondition && w.precondition.updateTime), 'anche lo sweep scrive solo sulla versione letta');
  ok(listingWrites().every((w) => Object.keys(w.fields).includes('description')), 'lo sweep scrive solo descrizioni (nessuna passata a ritroso)');
  ok(CALLS.anthropic.every((b) => b.system === SYSTEM && !/€|Rent|Available from/.test(userText(b))), 'anche lo sweep: SYSTEM con le regole, fatti senza canone');
}

console.log(`\n${fail ? '✗' : '✓'} descrizioni: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
