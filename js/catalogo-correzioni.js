/* js/catalogo-correzioni.js — I NOMI DALL'INDIRIZZO VERO, E I DATI CHE SI POSSONO PROVARE.
 *
 * Il 15/10/2026 il catalogo (27 annunci su Firestore, 19 pubblici) portava:
 *  - tre «Bilocale Centro», due «Bilocale Trieste», due «Trilocale Pigneto»:
 *    nomi generici del bot, uguali fra case diverse, che un motore di
 *    risposta e un cliente non sanno distinguere;
 *  - «Capri 2 Bed» mostrato come «1 bedroom» e il bilocale di Via dei
 *    Cappellari come «3 bedrooms»: ogni superficie leggeva prima `beds`
 *    (il testo libero del bot: «Living , 1 bedroom with balcony , 1
 *    bedroom…») e ne prendeva il PRIMO numero, invece del campo strutturato
 *    `bedrooms`.
 *
 * La regola dei nomi è quella che il fondatore usava già a mano («Coronari
 * Classic», «Ripetta Terrace», «Angelico Loft», «Piemonte Attic»): il nome
 * della VIA + una parola che descrive la casa, presa SOLO da un fatto che
 * l'annuncio dichiara (Room, Studio, Loft, Duplex, Attic, Terrace, Garden,
 * One-Bed/Two-Bed). Senza civico: l'indirizzo esatto resta dove è oggi.
 * Dove il numero di camere non è sicuro il nome non lo promette («Flat») e
 * la casa va nella lista dell'assistente.
 *
 * Qui solo ciò che i dati PROVANO. Il resto è `verify`: va visto in casa.
 * `fix` sono scritture di campi (mai un dato inventato: ogni voce porta la
 * sua prova in `why`). L'applicazione è un tap dell'admin su /catalogo,
 * con `nameOriginal` conservato. `incerto` elenca i fatti che i dati NON
 * decidono (oggi solo 'camere'): /catalogo non preseleziona la
 * rigenerazione della descrizione, che si rifà dopo il giro in casa.
 *
 * Chi ha scritto una descrizione, e se si può rigenerare, lo dice
 * regenerable(l): lo specchio di regenVerdict in api/wizard/describe.js
 * (la parità è provata in tests/catalogo/strumento.mjs). Il server resta il
 * giudice finale: rilegge l'annuncio e può saltare col suo motivo.
 *
 * UMD come js/listing-facts.js: window.BOOM_CATALOGO_FIX nel browser,
 * require/import da scripts/ e tests/.
 */
(function (root) {
  'use strict';

  var VERSION = '2026-10-15';

  // stato al momento della correzione: `from` è il nome che c'era, così lo
  // strumento riconosce un nome già cambiato a mano (e non lo sovrascrive
  // senza chiederlo).
  var LISTINGS = {
    // ── pubblici (available / waitlist) ────────────────────────────────
    'ilW5lAxnNn5M2TjsSHx2': {
      from: 'Africano Premium Room', name: 'Endertà Room',
      address: 'Via Endertà 9', zone: 'Africano/Trieste',
      why: 'Via Endertà 9; type «Room».',
      fix: { zone: 'Africano/Trieste' },
      verify: ['Arredata o no? La descrizione dice «unfurnished» ma il campo è vuoto.',
        'Bagno condiviso (etichetta «shared bath»): con quante persone?',
        'Disponibile da quando? Il campo data è vuoto e la descrizione dice «ready from 1 July».'],
    },
    '5QAKCvswE3HN9nuuG82S': {
      from: 'Bilocale Centro', name: 'Corso One-Bed',
      address: 'Via del Corso 75', zone: 'Centro',
      why: 'Via del Corso 75; bilocale, 1 camera.',
      fix: {},
      verify: ['Una sola foto: servono almeno 8.'],
    },
    '2SwJ8yD3ITXylrEtYIlL': {
      from: 'Pigneto Palace Double Bed', name: 'Prenestino Two-Bed',
      address: 'Piazzale Prenestino 42', zone: 'Pigneto',
      why: 'Piazzale Prenestino 42; trilocale, 2 camere.',
      fix: {},
      verify: ['STESSO indirizzo e STESSO piano (3°) dell\'annuncio affittato «Prenestino Two-Bath» (80 m², 2 bagni): è lo stesso appartamento o un altro? Se è lo stesso, uno dei due annunci va tolto.',
        'Arredata? Etichetta «fully furnished» ma il campo arredo è vuoto.',
        'Bagni: quanti?', 'Una sola foto: servono almeno 8.'],
    },
    'Kz9bXztv5QXmQrNhAcoU': {
      from: 'Ponte Milvio Duplex', name: 'Tor di Quinto Duplex',
      address: 'Via di Tor di Quinto 39', zone: 'Ponte Milvio',
      why: 'Via di Tor di Quinto 39; type «Duplex».',
      fix: {},
      verify: ['Stesso civico del «Tor di Quinto One-Bed» (70 m², piano terra): due unità diverse? Interno di ciascuna.',
        'Arredata?', 'Una sola foto: servono almeno 8.'],
    },
    'ttvrjazww9oe4tA0wHTf': {
      from: 'Bilocale Ponte Milvio', name: 'Tor di Quinto One-Bed',
      address: 'Via di Tor di Quinto 39', zone: 'Ponte Milvio',
      why: 'Via di Tor di Quinto 39; bilocale, 1 camera.',
      fix: {},
      verify: ['Interno (stesso civico del Duplex).'],
    },
    '9u42Zd1ROX3EHRgLKXFg': {
      from: 'Bilocale Prati', name: 'Visconti One-Bed',
      address: 'Via Quirino Visconti 60', zone: 'Prati',
      why: 'Via Quirino Visconti 60; bilocale, 1 camera.',
      fix: {},
      verify: ['Disponibilità: «1 Sept 2027» — confermare l\'anno.'],
    },
    'esFhjFMVfZtkIrhkx0PR': {
      from: 'Prati cozy', name: 'Montezebio Loft',
      address: 'Via Montezebio', zone: 'Prati',
      why: 'Via Montezebio; type «Loft».',
      fix: { zone: 'Prati', type: 'Loft' },
      verify: ['Civico mancante: senza il numero la mappa resta «posizione approssimativa».',
        'Arredata? La descrizione dice «Unfurnished» ma il campo è vuoto.'],
    },
    'uHAGgEno6JKtWbgruJzU': {
      from: 'Tiburtina lux Room', name: 'Tiburtina Ensuite Room',
      address: 'Via Tiburtina 545', zone: 'Tiburtina/Bologna',
      why: 'Via Tiburtina 545; stanza con bagno privato.',
      fix: { zone: 'Tiburtina/Bologna', type: 'Room with private bath' },
      verify: ['45 m²: è la stanza o tutto l\'appartamento? Da quante persone è condivisa la cucina?',
        '«15 minuti a piedi dalla Sapienza»: verificare.', 'Una sola foto: servono almeno 8.'],
    },
    'FHeEHIFbil6QG8Jcccxc': {
      from: 'Bilocale Trieste', name: 'Appennini One-Bed',
      address: 'Via Appennini 33', zone: 'Trieste',
      why: 'Via Appennini 33; bilocale, 1 camera.',
      fix: {},
      verify: ['Disponibile da quando? Il campo data è vuoto e la descrizione dice «July 1st, 2026».'],
    },
    'OLLVsiKhPrhpT1fx8XmB': {
      from: 'Bilocale Centro', name: 'Cappellari Flat',
      address: 'Via dei Cappellari 4', zone: 'Centro',
      why: 'Via dei Cappellari 4. Camere incerte: il nome non le promette.',
      // tipo «bilocale», bedrooms 1 e nome «Bilocale» dicono 1 camera; solo
      // il testo libero `beds` dice «3» — e da lì la descrizione AI ha
      // scritto «three bedrooms». Il campo strutturato è già 1: si allinea
      // il testo, e la casa va verificata.
      fix: { beds: '1' },
      // `incerto`: un fatto che i dati non decidono. La descrizione si rifà
      // DOPO il giro in casa: rigenerata ora ripeterebbe un numero non provato
      incerto: ['camere'],
      verify: ['CAMERE: 1 o 3? I dati si contraddicono (bilocale da 60 m² con «3»). Dopo la verifica il nome può diventare «Cappellari One-Bed».'],
    },
    'navona': {
      from: 'Coronari Classic', name: 'Coronari Classic',
      address: 'Via dei Coronari', zone: 'Centro Storico',
      why: 'Già dal nome della via.',
      fix: {},
      verify: ['Civico mancante.', 'Arredata? La descrizione dice «unfurnished» ma il campo è vuoto.',
        'Una sola foto: servono almeno 8.'],
    },
    'ripetta': {
      from: 'Ripetta Terrace', name: 'Ripetta Terrace',
      address: 'Passeggiata di Ripetta', zone: 'Centro Storico',
      why: 'Già dal nome della via.',
      fix: {},
      verify: ['Civico mancante.', 'Data di rilascio sconosciuta: quando si libera?',
        'Arredata? La descrizione dice «unfurnished».', 'Una sola foto: servono almeno 8.'],
    },
    'wvX0h0lBoNKOMuTuHkVI': {
      from: 'Capri 2 Bed', name: 'Capri Two-Bed',
      address: 'Piazza Capri 46', zone: "Conca d'Oro",
      why: 'Piazza Capri 46; 2 camere (bedrooms 2, testo «1 bedroom with balcony, 1 bedroom»).',
      fix: { type: 'Spacious 2 Bedroom flat' },
      verify: ['«Di fronte alla Metro B di piazza Annibaliano»: verificare la fermata più vicina.',
        'Data di rilascio sconosciuta.', 'Una sola foto: servono almeno 8.'],
    },
    'marconi': {
      from: 'Marconi Shared', name: 'Guarducci Shared Room',
      address: 'Via Federico Guarducci', zone: 'Marconi',
      why: 'Via Federico Guarducci; stanza in appartamento condiviso.',
      fix: {},
      verify: ['Civico mancante.', 'Arredata? La descrizione dice «unfurnished».',
        'Una sola foto: servono almeno 8.'],
    },
    'qRRRV7BjXDPqgTpVchnz': {
      from: 'Parioli Double Room with Garden ', name: 'Petrolini Garden Room',
      address: 'Via Ettore Petrolini 30', zone: 'Parioli',
      why: 'Via Ettore Petrolini 30; stanza doppia con accesso al giardino.',
      // «All invlusive» è un refuso (billsIncluded lo copre già); «floor »
      // non è un piano.
      fix: { tagsReplace: { 'All invlusive': 'All inclusive' }, floor: '' },
      verify: ['Piano?'],
    },
    'hwnkDcXvs7Q0EW99xV7O': {
      from: 'Trilocale Pigneto', name: 'Montecuccoli Flat',
      address: 'Via Montecuccoli 26', zone: 'Pigneto',
      why: 'Via Montecuccoli 26. Camere incerte: il nome non le promette.',
      fix: {},
      incerto: ['camere'],
      verify: ['CAMERE: «trilocale» (di solito 2 camere) ma i dati dicono 3 su 100 m². Quante sono?',
        'L\'indirizzo è scritto «MonteCuccoli»: correggere in «Via Montecuccoli 26».'],
    },
    'pigneto': {
      from: 'Pigneto Terrace', name: 'Ascoli Piceno Terrace',
      address: 'Via Ascoli Piceno', zone: 'Pigneto',
      why: 'Via Ascoli Piceno; terrazzo.',
      fix: {},
      verify: ['Civico mancante.', 'Arredata? La descrizione dice «unfurnished».',
        'Una sola foto: servono almeno 8.'],
    },
    'angelico': {
      from: 'Angelico Loft', name: 'Angelico Loft',
      address: 'Viale Angelico', zone: 'Prati',
      why: 'Già dal nome della via.',
      // «1BR + Loft» (testo dell'operatore) e «sleeping loft» (descrizione):
      // una camera più il soppalco, non due camere.
      fix: { bedrooms: 1 },
      incerto: ['camere'],
      verify: ['Il soppalco è una camera chiusa? Se sì, le camere tornano 2.',
        'Civico mancante.', 'Una sola foto: servono almeno 8.'],
    },
    'piemonte': {
      from: 'Piemonte Attic', name: 'Piemonte Attic',
      address: 'Via Piemonte', zone: 'Vittorio Veneto',
      why: 'Già dal nome della via.',
      fix: {},
      verify: ['Civico mancante.', 'Data di rilascio sconosciuta.',
        'Arredata? La descrizione dice «unfurnished».', 'Una sola foto: servono almeno 8.'],
    },

    // ── affittati (tornano in vetrina quando si liberano) ─────────────
    'aZ3EnMYBDy7c2upKRnnA': {
      from: 'Bilocale Centro', name: "Sant'Anna One-Bed",
      address: 'Via di S. Anna 16', zone: 'Centro',
      why: 'Via di S. Anna 16; bilocale, 1 camera.', fix: {}, verify: [],
    },
    'XcAnljWiqqx2s7msgWUR': {
      from: 'Barberini Gem', name: 'Avignonesi Studio',
      address: 'Via degli Avignonesi 16', zone: 'Centro Storico',
      why: 'Via degli Avignonesi 16; monolocale.',
      // «Studio» e «Studio with Bath»: un monolocale non ha camere separate.
      fix: { bedrooms: 0 }, verify: ['Nessuna foto in archivio.'],
    },
    'G8tzBej0f8JyBP0oAqRS': {
      from: 'Bilocale Flaminio', name: 'Fracassini One-Bed',
      address: 'Via Fracassini 10', zone: 'Flaminio',
      why: 'Via Fracassini 10; bilocale, 1 camera.', fix: {}, verify: [],
    },
    'sr0rpLSqbpDMASkHINfx': {
      from: 'Trilocale Pigneto', name: 'Prenestino Two-Bath',
      address: 'Piazzale Prenestino 42', zone: 'Pigneto',
      why: 'Piazzale Prenestino 42; 2 camere, 2 bagni.', fix: {},
      verify: ['Vedi «Prenestino Two-Bed»: stesso indirizzo e stesso piano.'],
    },
    'cezFMXTWnHUDgb1H2WWm': {
      from: 'Bilocale Trastevere', name: 'Piscinula One-Bed',
      address: 'Via in Piscinula', zone: 'Trastevere',
      why: 'Via in Piscinula; bilocale, 1 camera.', fix: {}, verify: ['Civico mancante.'],
    },
    'levico': {
      from: 'Levico', name: 'Levico Garden',
      address: 'Via Levico', zone: 'Trieste',
      why: 'Via Levico; piano giardino.', fix: {}, verify: ['Civico mancante.'],
    },
    'yGBx17OFlSgD0Kowk9jK': {
      from: 'Bilocale Trieste', name: 'Laghi One-Bed',
      address: 'Via dei Laghi 14', zone: 'Trieste',
      why: 'Via dei Laghi 14; bilocale, 1 camera.', fix: {}, verify: [],
    },
    'zL4h3VusgV1qnoNQK5Dc': {
      from: 'Trilocale Trieste', name: 'Calabria Two-Bed',
      address: 'Via Calabria 29', zone: 'Trieste',
      why: 'Via Calabria 29; trilocale, 2 camere.', fix: {}, verify: [],
    },
  };

  // ── la lettura delle camere: UNA copia, in js/listing-facts.js ─────
  var FACTS = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./listing-facts.js') : (root && root.BOOM_FACTS);
  function bedroomsOf(l) {
    if (!FACTS || typeof FACTS.bedroomsOf !== 'function') {
      throw new Error('js/listing-facts.js va caricato prima di js/catalogo-correzioni.js');
    }
    return FACTS.bedroomsOf(l);
  }

  // ── chi ha scritto una descrizione ──────────────────────────────────
  // MACHINE: le sorgenti che la macchina può riscrivere perché le ha
  // scritte lei. Solo «ai». I testi «lotto12» (la passata del 16/08,
  // api/ops/_lotto12.js) sono correzioni APPROVATE dall'operatore: per
  // decisione del fondatore (15/10/2026) contano come parole di una
  // persona, e /catalogo non li propone mai per la rigenerazione.
  var MACHINE = ['ai'];
  // la sorgente com'è scritta (come regenVerdict: niente trim, niente
  // maiuscole — una sorgente scritta a mano diversa da «ai» è di una persona)
  function sourceOf(l) {
    var s = l && l.descriptionSource;
    return typeof s === 'string' && s !== '' ? s : null;
  }

  // Il template del bot, riconosciuto dalla sua forma («Beautiful bilocale
  // in Centro, 60sqm on floor 1… Features include ac, washing_machine…»): la
  // STESSA regola di isBoilerplate in api/wizard/describe.js. Le chiavi
  // grezze sono quelle con «_» di FEATURE_LABELS del server; se il server
  // ne aggiunge una, la prova di parità lo dice.
  var RAW_KEYS = ['washing_machine', 'pets_allowed', 'double_glazing'];
  function isBoilerplate(text) {
    var t = String(text || '');
    if (!t.trim()) return false;
    if (/\d+\s*sqm on floor/i.test(t)) return true;
    if (/\bFeatures include\b/i.test(t)) return true;
    return RAW_KEYS.some(function (k) { return t.indexOf(k) >= 0; });
  }

  // L'impronta del testo che la macchina ha scritto (descriptionAiHash): la
  // STESSA funzione di textHash in api/wizard/describe.js, scritta lì pura e
  // sincrona apposta per stare anche qui. Spazi, a capo e forma degli
  // accenti non contano. Serve a riconoscere un testo «ai» corretto a mano
  // dal portal, che riscrive `description` ma lascia descriptionSource.
  function textHash(text) {
    var s = String(text == null ? '' : text).normalize('NFC').replace(/\s+/g, ' ').trim();
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ('0000000' + (h2 >>> 0).toString(16)).slice(-8) + ('0000000' + (h1 >>> 0).toString(16)).slice(-8);
  }

  // Si può rigenerare? { ok, basis } oppure { ok:false, reason, source }, come
  // regenVerdict: un testo vuoto, il template del bot, o un testo della
  // macchina ancora identico a come la macchina l'ha scritto. Il resto sono
  // parole di una persona, o almeno nessuno ha provato il contrario.
  function regenerable(l) {
    l = l || {};
    var t = String(l.description || '').trim();
    if (!t) return { ok: true, basis: 'empty' };
    if (isBoilerplate(t)) return { ok: true, basis: 'boilerplate' };
    // la sorgente ESATTA, come il server: « ai » o «AI» non sono «ai»
    var source = sourceOf(l);
    if (MACHINE.indexOf(source) < 0) return { ok: false, reason: 'not_machine', source: source };
    if (l.descriptionAiHash && l.descriptionAiHash !== textHash(t)) {
      return { ok: false, reason: 'edited_after_machine', source: source };
    }
    return { ok: true, basis: 'machine', source: source };
  }

  // ── cosa non va in una descrizione: LE STESSE REGOLE DEL SERVER ─────
  // descriptionIssues è la lista dell'assistente (e decide quali «Rigenera»
  // /catalogo accende); copyIssues di api/wizard/describe.js è il controllo
  // che il server fa sul testo nuovo prima di scriverlo. LA REGOLA DI CLASSE:
  // qui mai più largo di lì — un testo che il server ha appena scritto non
  // deve tornare segnalato, e preselezionato, in /catalogo. La pagina non
  // può importare il server, quindi qui sotto c'è una COPIA FEDELE delle sue
  // famiglie (prezzo, provvigioni, data, durata, civico, arredo, camere),
  // presa così com'è: si cambia lì e si ricopia qui. Le sole differenze:
  // niente `export`, le camere passano da bedroomsOf (che dice se manca
  // js/listing-facts.js) e l'escape degli accenti si legge.
  // tests/catalogo/descrizioni.mjs pretende la regola di classe;
  // tests/catalogo/strumento.mjs pretende che le due diano lo stesso
  // risultato (sui 27 annunci e su un corpo di frasi), e prende le derive.
  function textOf(l) { return String((l && l.description) || '') + '\n' + String((l && l.descriptionIt) || ''); }

  function furnishingOf(L) {
    const s = String(L == null || L.furnished == null ? '' : L.furnished).trim().toLowerCase();
    if (s === 'yes') return 'fully furnished';
    if (s === 'partial') return 'partially furnished';
    if (s === 'no') return 'unfurnished';
    return null;
  }

  // LA VIA, SENZA IL CIVICO. La lista dell'assistente dice «nomina la via, non
  // il numero»: il civico nel testo pubblico dice a chiunque dov'è il portone
  // di una casa abitata, e quando la casa cambia il testo resta. Il modello
  // riceve solo la via — e il quartiere, se l'indirizzo lo porta dopo la
  // virgola («Viale Angelico, Mazzini»). Si toglie: il numero in coda alla via
  // (anche «n. 9», «9/A», «9 int. 3»), un numero da solo dopo la virgola, CAP e
  // città. Un numero che FA PARTE del nome resta: «Viale 21 Aprile»,
  // «Via 4 Novembre» (il numero sta prima del nome, non in coda).
  const STREET_WORDS = ['via', 'viale', 'piazza', 'piazzale', 'piazzetta', 'largo', 'vicolo', 'vico', 'corso',
    'lungotevere', 'circonvallazione', 'borgo', 'salita', 'clivo', 'passeggiata', 'strada', 'rampa',
    'scalinata', 'galleria', 'lungomare', 'contrada', 'traversa', 'v\\.le', 'p\\.zza', 'p\\.za', 'p\\.le', 'c\\.so', 'l\\.go'];
  const STREET_RE = STREET_WORDS.join('|');
  const RE_STARTS_STREET = new RegExp(`^(?:${STREET_RE})(?=[\\s.]|$)`, 'i');
  const RE_LEAD_NUMBER = new RegExp(`^\\d{1,4}[a-z]?\\s*,?\\s+(?=(?:${STREET_RE})\\b)`, 'i');
  const RE_TAIL_NUMBER = /(?:\s*,\s*|\s+|^)(?:(?:n|nr|no|num|civico)\b\.?\s*)?\d{1,4}[a-z]?(?:\s*\/\s*[a-z0-9]{1,3})?(?:\s*,?\s*(?:int|interno|scala|sc|piano|p)\b\.?\s*[\w°-]{1,4})*\s*$/i;
  const RE_TAIL_CITY = /(\d[a-z]?)\s*[-–,]?\s*(?:\d{5}\s*)?(?:roma|rome|rm)\b\.?\s*$/i;
  const RE_ONLY_CITY = /^(?:\d{5}\s*)?(?:roma|rome|rm|italia|italy)?\.?$/i;
  const RE_ONLY_EXTRA = /^(?:int|interno|scala|sc|piano|p)\b\.?\s*[\w°-]{0,4}$/i;

  function streetOf(address) {
    const parts = String(address == null ? '' : address).split(/\s*,\s*|\s+[-–]\s+/).map((p) => {
      let s = p.trim().replace(/\s+/g, ' ');
      if (RE_ONLY_EXTRA.test(s)) return '';             // «int. 4», «scala B»
      s = s.replace(RE_LEAD_NUMBER, '');                // «9 Via Endertà»
      s = s.replace(RE_TAIL_CITY, '$1');                // «Via Dei Laghi 14 Roma»
      s = s.replace(RE_TAIL_NUMBER, '').trim();         // «Via Endertà 9», «9»
      return s;
    }).filter((s) => s && !RE_ONLY_CITY.test(s) && !RE_ONLY_EXTRA.test(s) && /[a-zà-ÿ]/i.test(s));
    return parts.join(', ');
  }

  const EN_MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  // «sett» è l'abbreviazione italiana («dal 1 sett.»); «set», «mar», «ago»
  // no: «1 set of keys», «2 mar…», «anni ago» sono altre parole
  const IT_MONTHS = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|sett';
  const MONTHS = EN_MONTHS + '|' + IT_MONTHS;
  // una cifra che può essere un canone: almeno tre cifre o le migliaia
  // separate («900», «1.500», «1,500») — mai una superficie
  const MONEY = '(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{3,5})(?:[.,]\\d{1,2})?';
  const NOT_YEAR = '(?!(?:19|20)\\d\\d\\b)';
  const NOT_SIZE = '(?!\\s*(?:sqm|sq\\.?\\s?m|mq|m2|m²|square|metri|meters|metres))';
  // la frequenza che fa di una cifra un canone
  const PER_MONTH = '(?:(?:a|per|each|every)\\s+month|monthly|al\\s+mese|a\\s+mese|per\\s+mese|ogni\\s+mese|mensil[ei])';
  const RE_PRICE = new RegExp([
    '€',
    '\\b\\d[\\d.,]*\\s*eur(?:os?)?\\b',                      // «1,500 EUR», «900 euro»
    '\\beur(?:os?)?\\s*\\d',                                // «EUR 1500»
    '\\/\\s?(?:month|mo|mese)\\b',                           // la barra-mese è sempre un prezzo
    // una cifra vicina alla frequenza: «900 a month», «1.500 al mese» — ma
    // «due volte al mese», «cleaned twice per month» non sono un canone
    `\\b${NOT_YEAR}${MONEY}\\b${NOT_SIZE}[^.\\n]{0,25}?\\b${PER_MONTH}\\b`,
    `\\b${MONEY}\\s*(?:€|eur(?:os?)?)?\\s*${PER_MONTH}\\b`,  // attaccata, anche una cifra da anno: «1950 a month»
    `\\b(?:rent|canone|affitto|pigione)\\b[^.\\n\\d]{0,15}${MONEY}\\b${NOT_SIZE}`,   // «Canone 1.500»
  ].join('|'), 'i');
  // «deposito» in italiano è anche il ripostiglio (la feature `storage`): conta
  // come soldi solo accanto a soldi — €, euro, mensilità, mesi, canoni, una
  // cifra da canone, «cauzionale»; «deposit», «cauzione», «provvigione» sempre
  const RE_FEE = new RegExp([
    '\\b(?:agency\\s+)?fees?\\b', '\\bcommissions?\\b', '\\bdeposits?\\b',
    '\\bprovvigion[ei]\\b', '\\bcommission[ei]\\b', '\\bcauzion[ei]\\b', '\\bcauzional[ei]\\b',
    `\\bdeposit[oi]\\b[^.;\\n]{0,40}?(?:€|\\beur(?:os?)?\\b|\\bmensilit|\\bmes[ei]\\b|\\bcanon[ei]\\b|\\b${NOT_YEAR}${MONEY}\\b${NOT_SIZE})`,
    `(?:€|\\bmensilit[àa]|\\bmes[ei]\\b|\\b${NOT_YEAR}${MONEY}\\b${NOT_SIZE})[^.;\\n]{0,25}?\\bdeposit[oi]\\b`,
  ].join('|'), 'i');
  const RE_DATE = new RegExp([
    '\\b(?:available|ready)\\s+(?:from|on|now|immediately|starting)\\b',
    // «free from» solo davanti a una data: «free from traffic» è un'altra cosa
    `\\bfree\\s+(?:from|on|starting(?:\\s+from)?)\\s+(?:the\\s+)?(?:early\\s+|mid[\\s-]?|late\\s+|(?:the\\s+)?(?:end|beginning|start|middle)\\s+of\\s+)?(?:\\d|(?:${MONTHS})\\b|next\\s+(?:week|month|year)\\b|today\\b|tomorrow\\b)`,
    '\\bfree\\s+(?:now|immediately|right\\s+away|straight\\s+away)\\b',
    '\\b(?:immediately|instantly|right\\s+away|straight\\s+away|now)\\s+available\\b',
    '\\bavailable\\s+(?:right\\s+away|straight\\s+away|today|as\\s+of)\\b',
    '\\bready to move\\b', '\\bmove-?in ready\\b',
    '\\bdisponibil[ei]\\s+(?:da|dal|dall|dalla|subito|immediatamente)\\b', '\\bsubito disponibile\\b',
    // «libero da» come «free from»: solo davanti a una data («libero dal traffico» no)
    `\\bliber[oaie]\\s+(?:da|dal|dalla|dall['’]?)\\s*(?:\\d|(?:${IT_MONTHS})\\b|subito\\b|oggi\\b|ora\\b|adesso\\b|inizio\\b|met[àa]\\b|fine\\b|prossim)`,
    '\\bliber[oaie]\\s+subito\\b', '\\bpront[oa] da abitare\\b',
    '\\bsubito\\s+(?:liber|disponibil|abitabil|pront)\\w*',
    '\\b(?:liber|disponibil)\\w*\\s+(?:da\\s+)?(?:subito|ora|adesso|oggi|immediatamente)\\b',
    `\\ba\\s+partire\\s+da(?:l|lla|ll['’])?\\s*(?:\\d|${IT_MONTHS}|subito|ora|oggi|inizio|metà|meta|fine)`,
    `\\b(?:da|dal|dalla|dai)\\s+(?:inizio\\s+|metà\\s+|meta\\s+|fine\\s+)?(?:${IT_MONTHS})\\b`,
    `\\bdall['’]\\s*(?:\\d{1,2}°?\\s+)?(?:${IT_MONTHS})\\b`,
    `\\bfrom\\s+(?:early\\s+|mid[\\s-]?|late\\s+|the\\s+(?:start|end|beginning|middle)\\s+of\\s+)?(?:${MONTHS})\\b`,
    `\\b\\d{1,2}(?:st|nd|rd|th|º|°)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`,          // «1 March», «1° settembre»
    `\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`,                         // «September 1st»
    `\\b(?:${MONTHS})\\s+20\\d\\d\\b`,
  ].join('|'), 'i');
  // LA DURATA. Con BOOM si affitta per almeno 3 mesi (decisione del fondatore,
  // 15/10): «one month», «short stays», «month-to-month» promettono una cosa
  // che non si fa. Il SYSTEM vieta qualsiasi durata; qui si blocca ciò che la
  // promette — un soggiorno breve, un minimo, una durata in mesi o settimane.
  // «long-term» non è una promessa sbagliata e non si blocca.
  const NUM_EN = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|an?|a\\s+few|a\\s+couple\\s+of|\\d{1,2})';
  const NUM_IT = '(?:un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|pochi|poche|qualche|\\d{1,2})';
  const RE_STAY = new RegExp([
    '\\b(?:one|1|a\\s+single)[\\s-]+months?\\b',
    '\\bmonth[\\s-]+(?:to|by)[\\s-]+month\\b',
    '\\bshort(?:er)?[\\s-]+(?:stays?|terms?|lets?|rentals?|leases?|visits?|periods?|tenanc(?:y|ies))\\b',
    '\\b(?:mid|medium)[\\s-]+term\\b',
    '\\bminimum\\s+(?:stay|term|lease|let|rental|period|tenancy|contract|duration|of)\\b',
    `\\bmin\\.?\\s+${NUM_EN}\\s+(?:months?|weeks?|nights?)\\b`,
    `\\b${NUM_EN}[\\s-]+(?:months?|weeks?|nights?)[\\s-]+(?:minimum|min\\b|stays?|leases?|lets?|rentals?|contracts?|tenanc(?:y|ies))\\b`,
    `\\b(?:stays?|lets?|leases?|rentals?|tenanc(?:y|ies)|contracts?)\\s+(?:of|from|for|starting\\s+(?:at|from))\\s+(?:just\\s+|only\\s+|as\\s+little\\s+as\\s+)?${NUM_EN}\\s+(?:months?|weeks?|nights?)\\b`,
    `\\bfor\\s+(?:just\\s+|only\\s+)?${NUM_EN}\\s+(?:months?|weeks?)\\b`,
    '\\bflexible\\s+(?:stays?|leases?|lets?|rentals?|length|duration)\\b',
    '\\b(?:weekly|nightly)\\s+(?:stays?|rentals?|lets?|rates?)\\b',
    '\\b(?:un|uno|1)\\s+mese\\b',                           // «anche per un mese»
    '\\bmese\\s+per\\s+mese\\b',
    '\\bsoggiorn[oi]\\s+brev[ei]\\b',
    '\\bbrev[ei]\\s+(?:soggiorn[oi]|period[oi]|permanenz[ae]|durat[ae])\\b',
    '\\b(?:affitt[oi]|locazion[ei]|soggiorn[oi])\\s+(?:brev[ei]|di\\s+breve\\s+durata)\\b',
    '\\b(?:breve|medio)\\s+termine\\b',
    '\\b(?:durata|permanenza|soggiorno|locazione|contratto|affitto)\\s+minim[ao]\\b',
    `\\b(?:minimo|almeno|min\\.?)\\s+${NUM_IT}\\s+(?:mes[ei]|settiman[ae]|nott[ei])\\b`,
    `\\b(?:soggiorn[oi]|affitt[oi]|locazion[ei]|contratt[oi])\\s+(?:di|da)\\s+(?:soli?\\s+)?${NUM_IT}\\s+(?:mes[ei]|settiman[ae]|nott[ei])\\b`,
    `\\bper\\s+(?:soli?\\s+)?${NUM_IT}\\s+(?:mes[ei]|settiman[ae])\\b`,
  ].join('|'), 'i');
  // L'arredo nel testo. Con il campo vuoto qualsiasi parola sull'arredo è
  // inventata — «fully furnished» quanto «unfurnished», «arredato con gusto»
  // quanto «da arredare» o «la casa è vuota»: il modello non l'ha saputo da
  // nessuno. Con l'arredo dichiarato (nel campo, o fra feature ed etichette)
  // si cerca solo il contrario di ciò che è dichiarato.
  const EMPTY_HOME = '\\b(?:casa|appartamento|immobile|alloggio|loft|bilocale|trilocale|quadrilocale|monolocale|attico|mansarda|unità)'
      + '\\s+(?:è\\s+|e[\'’]\\s+|sarà\\s+|resta\\s+|rimane\\s+|viene\\s+(?:\\w+\\s+)?)?(?:completamente\\s+|totalmente\\s+)?vuot[oaie]\\b'
    + '|\\b(?:consegn|affitt|offert|lasci|propost)\\w*\\s+(?:completamente\\s+|totalmente\\s+)?vuot[oaie]\\b'
    + '|\\b(?:flat|apartment|home|house|unit|loft|studio|place|property)\\s+(?:is\\s+|comes\\s+|will\\s+be\\s+|is\\s+(?:let|rented|offered|delivered)\\s+)?(?:completely\\s+|totally\\s+|entirely\\s+)?empty\\b'
    + '|\\b(?:comes|delivered|let|rented|offered|handed\\s+over)\\s+(?:completely\\s+|totally\\s+|entirely\\s+)?empty\\b'
    + '|\\bempty\\s+(?:flat|apartment|home|house|unit|loft|studio)\\b';
  const UNFURN = '\\bunfurnished\\b|\\bnot\\s+furnished\\b|\\bwithout\\s+(?:any\\s+)?furniture\\b|\\bno\\s+furniture\\b'
    + '|\\bnon\\s+(?:è\\s+|e\\s+|sono\\s+)?(?:arredat|ammobiliat)\\w*|\\bsenza\\s+(?:arredi|arredamento|mobili)\\b'
    + '|\\bpriv[oaie]\\s+di\\s+(?:arredi|arredamento|mobili)\\b|\\bda\\s+arredare\\b|\\bvuot[oaie]\\s+di\\s+(?:arredi|mobili)\\b'
    + '|' + EMPTY_HOME;
  const RE_UNFURNISHED = new RegExp(UNFURN, 'i');
  const RE_UNFURNISHED_ALL = new RegExp(UNFURN, 'gi');
  // solo gli aggettivi: «bring your own furniture» parla di mobili ed è
  // coerente con una casa vuota — non è un «arredata»
  const RE_FURNISHED = /\b(?:fully\s+|partially\s+|partly\s+|semi[\s-]?)?furnished\b|\barredat[oaie]\b|\bammobiliat[oaie]\b/i;
  const RE_FULLY = /\b(?:fully|completely|entirely)\s+furnished\b|\b(?:completamente|interamente|totalmente)\s+arredat/i;
  const RE_PARTLY = /\b(?:partially|partly)\s+furnished\b|\bsemi[\s-]?furnished\b|\bparzialmente\s+arredat|\bsemi[\s-]?arredat/i;
  // qualunque parola sull'arredo, anche «la casa è vuota»
  const RE_FURNISHING_WORD = new RegExp('\\b(?:un)?furnish\\w*|\\bfurniture\\b|\\barred\\w*|\\bammobiliat\\w*|\\bmobili\\b|' + EMPTY_HOME, 'i');
  const RE_FURNISHING_TOLD = /furnish|furnitur|arred|ammobiliat|\bmobili\b/i;
  const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6 };
  // un NUMERO di camere: «three bedrooms», «one-bedroom», «due camere (da
  // letto)», «una camera da letto». «Una camera matrimoniale» no: in italiano
  // «camera» è anche una stanza qualsiasi descritta da sola, non un conto.
  const RE_BEDROOM_COUNT = /\b(\d{1,2}|one|two|three|four|five|six|uno|una|due|tre|quattro|cinque|sei)[\s-]+(?:bedrooms?|camere(?:\s+da\s+letto)?|camera\s+da\s+letto)\b/gi;

  // L'arredo che l'operatore ha scritto fra le feature o le etichette quando
  // il campo è vuoto: è dichiarato anche così («fully furnished» fra i tag di
  // 2SwJ8yD3ITXylrEtYIlL). Le feature arrivano al modello, le etichette no —
  // ma sono vere lo stesso, e un testo che le ripete non inventa niente.
  function furnishingTold(l) {
    const said = [...(Array.isArray(l.features) ? l.features : []), ...(Array.isArray(l.tags) ? l.tags : [])]
      .map((x) => String(x == null ? '' : x)).filter((x) => RE_FURNISHING_TOLD.test(x));
    if (!said.length) return null;
    const s = said.join(' | ');
    if (RE_UNFURNISHED.test(s)) return 'unfurnished';
    if (RE_PARTLY.test(s)) return 'partially furnished';
    return 'fully furnished';
  }

  // Il proprio indirizzo non è una data: a Roma «Viale 21 Aprile» si scrive
  // anche in cifre, e il controllo lo scambierebbe per «disponibile dal 21
  // aprile» — una rigenerazione bloccata per sempre su quella casa.
  function withoutPlace(t, l) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const addr = String(l.address || '').trim();
    const street = streetOf(addr);
    let out = t;
    for (const p of [addr, street, ...street.split(', ')]) if (p.length >= 4) out = out.replace(new RegExp(esc(p), 'gi'), ' ');
    return out;
  }

  // IL CIVICO NEL TESTO. Il modello non lo riceve più (streetOf), quindi un
  // numero accanto a una via è inventato o sfuggito: si blocca. Tre forme: la
  // via dell'annuncio seguita da un numero (anche «Viale 21 Aprile 12», «Via
  // Di Tor Di quinto 39»), qualsiasi via scritta come tale seguita da un
  // numero («Via del Corso 75»), e le parole del civico («al civico 9», «house
  // number»). Non è un civico il numero che misura altro: «Via Nazionale, 2
  // minutes», «Piazza Navona 5 min a piedi», «Via Appia 3 km», «2 stops» —
  // e non ci sono vie in «2 bedrooms», «3rd floor», «Metro B».
  const deaccent = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const anyCase = (s) => s.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const NUM_TAIL = '(?:\\s*,)?\\s*(?:al\\s+)?(?:(?:[Nn]|[Nn][Rr]|[Nn][Oo]|[Nn]um|[Nn]umero|[Cc]ivico)\\.?\\s*)?\\d{1,4}(?:[A-Z]|\\/[A-Za-z0-9]{1,3})?\\b';
  const NAME_PART = '(?:di|de|del|della|dello|delle|dei|degli|da|dal|dalla|dai|san|santa|santo|la|le|lo|il|gli|in|a|al|alla|alle|ai|agli|e|s\\.|ss\\.)';
  const NAME_APOS = "(?:d|dell|all|nell|sull|sant)['’]";
  const NAME_CAP = "[A-Z][A-Za-z'’.\\-]*";
  const RE_STREET_NUMBER = new RegExp(
    `\\b(?:${STREET_WORDS.map(anyCase).join('|')})\\s+(?:${NAME_PART}\\s+|${NAME_APOS}\\s*|${NAME_CAP}\\s+){0,6}${NAME_CAP}${NUM_TAIL}`, 'g');
  // «civico» è anche un aggettivo («Museo Civico di Zoologia», a due passi da
  // Villa Borghese): conta solo se segue un numero
  const RE_CIVICO_WORDS = /\bcivico\s*(?:nr?\.?\s*|numero\s*)?\d|\b(?:numero\s+civico|house\s+number|street\s+number|building\s+number|door\s+number)\b/i;
  const RE_NOT_CIVICO = /^[\s\-–]*(?:\d+[\s\-–]*)?(?:mins?\b|minut|km\b|m\b|mt\b|metr|meter|yards?\b|steps?\b|passi|°|º|bed|camer|stanz|rooms?\b|floor|pian|sqm|sq\b|mq\b|m2\b|m²|walk|a\s+piedi|stops?\b|fermat|bus\b|tram\b|lines?\b|line[ae]\b|euro|eur\b|€|%|anni\b|years?\b|secol|centur)/i;

  function ownStreetNames(l) {
    return streetOf(l.address).split(', ').map((p) => deaccent(p).trim())
      .filter((p) => p.length >= 4 && RE_STARTS_STREET.test(p));
  }

  function addressNumberIn(text, l) {
    const t = deaccent(text);
    if (RE_CIVICO_WORDS.test(t)) return true;
    const patterns = ownStreetNames(l).map((n) => new RegExp(anyCase(escRe(n)) + NUM_TAIL, 'g'));
    patterns.push(new RegExp(RE_STREET_NUMBER.source, 'g'));
    for (const re of patterns) {
      let m;
      while ((m = re.exec(t))) {
        if (!RE_NOT_CIVICO.test(t.slice(m.index + m[0].length, m.index + m[0].length + 30))) return true;
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    return false;
  }

  function copyIssues(text, l) {
    l = l || {};
    const t = String(text || '');
    const out = [];
    if (RE_PRICE.test(t)) out.push('price_in_text');
    if (RE_FEE.test(t)) out.push('fee_in_text');
    if (RE_DATE.test(withoutPlace(t, l))) out.push('date_in_text');
    if (RE_STAY.test(t)) out.push('stay_in_text');
    if (addressNumberIn(t, l)) out.push('address_number');

    const fu = furnishingOf(l) || furnishingTold(l);
    if (fu === null) {
      // nessuno l'ha detto: ogni parola sull'arredo è inventata
      if (RE_FURNISHING_WORD.test(t)) out.push('furnishing_invented');
    } else {
      const said = t.replace(RE_UNFURNISHED_ALL, ' ');    // tolto «unfurnished», resta «furnished»?
      const wrong = fu === 'unfurnished' ? RE_FURNISHED.test(said)
        : fu === 'fully furnished' ? (RE_UNFURNISHED.test(t) || RE_PARTLY.test(t))
          : (RE_UNFURNISHED.test(t) || RE_FULLY.test(t));
      if (wrong) out.push('furnishing_contradicted');
    }

    // una stanza in un appartamento condiviso descrive le camere della CASA
    // («a room in a three-bedroom flat»): lì il conto non si confronta.
    // Il confronto è con FACTS.bedroomsOf, la stessa lettura della lista
    // dell'assistente e di buildFacts.
    const room = /\b(?:room|stanza|shared)\b/i.test(String(l.type || ''));
    if (!room) {
      const b = bedroomsOf(l);
      const claims = [];
      let m;
      RE_BEDROOM_COUNT.lastIndex = 0;
      while ((m = RE_BEDROOM_COUNT.exec(t))) {
        const v = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
        if (v != null) claims.push(v);
      }
      if (b == null) {
        // camere che nessuno ha dichiarato: un numero nel testo è dedotto dal
        // tipo o dal nome, cioè inventato (il SYSTEM lo vieta, qui si verifica)
        if (claims.length) out.push('bedrooms_invented');
      } else if ((claims.length && !claims.includes(b))
        // sbagliato solo se NESSUNA occorrenza dà il numero giusto: «two
        // bedrooms; one bedroom faces the courtyard» sono due camere
        || (b >= 1 && /\bmonolocale\b|\bstudio (?:flat|apartment)\b/i.test(t))) {
        out.push('bedrooms_mismatch');
      }
    }
    return out;
  }

  function descriptionIssues(l) {
    l = l || {};
    if (!FACTS || typeof FACTS.bedroomsOf !== 'function') bedroomsOf(l);   // l'errore che dice cosa manca
    return copyIssues(textOf(l), l);
  }

  // la sorgente dice «macchina» (senza guardare se il testo è ancora il suo:
  // per quello c'è regenerable)
  function machineWritten(l) {
    return MACHINE.indexOf(sourceOf(l)) >= 0;
  }

  var API = {
    VERSION: VERSION, LISTINGS: LISTINGS, MACHINE: MACHINE,
    bedroomsOf: bedroomsOf, descriptionIssues: descriptionIssues, machineWritten: machineWritten,
    regenerable: regenerable, isBoilerplate: isBoilerplate, textHash: textHash,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_CATALOGO_FIX = API;
})(typeof window !== 'undefined' ? window : this);
