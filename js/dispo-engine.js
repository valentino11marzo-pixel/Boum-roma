/* js/dispo-engine.js — QUANDO È DAVVERO LIBERA QUESTA CASA.
 *
 * Il campo `listings.availableDate` esiste da sempre ed è testo LIBERO. Il
 * portal suggeriva addirittura i formati nel placeholder — "Es: Feb 1,
 * Sep 2026, Immediate" — mentre la vetrina faceva così:
 *
 *     const af = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0,10) : day(0);
 *
 * cioè TUTTO ciò che non era ISO diventava OGGI, e la card stampava
 * "Available now". I tre esempi del placeholder sono esattamente i tre casi
 * che finivano lì. Un cliente prenotava una visita per "disponibile ora" su
 * una casa libera a settembre — e lo scopriva davanti al portone.
 *
 * Peggio: il campo che quel codice legge per PRIMO è `availableFrom`, che
 * nessuna delle tre porte di scrittura (portal, /modifica del bot, wizard NL)
 * ha mai scritto su Firestore. Due nomi per lo stesso dato, uno morto.
 *
 * Qui la disponibilità si LEGGE una volta sola, con le stesse regole per
 * vetrina, scheda, feed, portali, bot e JSON-LD — così non possono più
 * raccontare cose diverse. Tre stati utili invece di una data finta:
 *
 *   now      libera adesso            → "Available now"
 *   date     libera da una data certa → "Free from 1 Sep"
 *   unknown  non lo sappiamo          → "Ask us" — MAI "available now"
 *
 * ─── LE DUE REGOLE DURE ──────────────────────────────────────────────────
 *
 * 1. AMBIGUO NON DIVENTA MAI "LIBERA ORA". È l'intero difetto di partenza.
 *    Un testo che non sappiamo leggere è `unknown`, e `unknown` in pagina
 *    dice "su richiesta". Dire "non lo so" costa una domanda; dire "libera
 *    adesso" quando non è vero costa il cliente.
 *
 * 2. QUANDO È IMPRECISO, SI ARROTONDA TARDI. "fine agosto" → 31, mai il 1°.
 *    Sbagliare in avanti fa aspettare qualche giorno; sbagliare all'indietro
 *    mette in vetrina una casa che è ancora occupata. Gli errori non sono
 *    simmetrici, e la direzione la sceglie il motore, non chi scrive.
 *
 * Usato da: apartments.html · apartment-detail.html · api/listing.js ·
 * api/llms-listings.js · api/feed/immobiliare.js · api/publisher/_state.js ·
 * api/listings/availability.js (la porta di scrittura) · il portal.
 */
(function (root) {
  'use strict';

  /* ── vocabolario ──────────────────────────────────────────────────────── */

  var MONTHS = {
    gennaio: 1, genn: 1, gen: 1, january: 1, jan: 1,
    febbraio: 2, febbr: 2, febb: 2, feb: 2, february: 2,
    marzo: 3, mar: 3, march: 3,
    aprile: 4, apr: 4, april: 4,
    maggio: 5, mag: 5, may: 5,
    giugno: 6, giu: 6, june: 6, jun: 6,
    luglio: 7, lug: 7, july: 7, jul: 7,
    agosto: 8, ago: 8, august: 8, aug: 8,
    settembre: 9, sett: 9, set: 9, september: 9, sept: 9, sep: 9,
    ottobre: 10, ott: 10, october: 10, oct: 10,
    novembre: 11, nov: 11, november: 11,
    dicembre: 12, dic: 12, december: 12, dec: 12
  };

  /* alternanza coi nomi lunghi PRIMA: "settembre" non deve fermarsi a "set" */
  var MONTH_ALT = Object.keys(MONTHS)
    .sort(function (a, b) { return b.length - a.length; })
    .join('|');

  var MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  /* "libera adesso", in tutte le forme che un operatore scrive davvero */
  var NOW_RE = new RegExp(
    '\\b(subito|da subito|disponibile ora|libera? ora|libera? adesso|adesso|' +
    'immediat\\w*|pronta|pronto|now|available now|immediately|right away|asap|' +
    'da oggi|from today|today)\\b', 'i');

  /* "non lo sappiamo" DICHIARATO: vale quanto una data, perché è una scelta */
  var UNKNOWN_RE = new RegExp(
    '\\b(da concordare|da definire|da destinarsi|su richiesta|da verificare|' +
    'non so|boh|tbd|t\\.b\\.d|to be defined|to be confirmed|on request|ask|' +
    'chiedere|sconosciut\\w*|n/?d)\\b', 'i');

  /* le parole che introducono una data: servono a NON leggere "may be free"
     come "maggio". Un mese nudo senza preposizione non è una data. */
  var LEAD = '(?:dal|dall\'|dalla|da|a partire dal|a partire da|dai primi di|' +
    'entro|per|in|from|starting|starting from|as of|available)';

  var VAGUE_END = '(?:fine|a fine|verso fine|end of|late)';
  var VAGUE_MID = '(?:met[aà]|a met[aà]|mid|middle of)';
  var VAGUE_START = '(?:inizio|a inizio|primi di|i primi di|early|beginning of|start of)';

  var NL_STOPWORDS = {
    bilocale: 1, trilocale: 1, monolocale: 1, quadrilocale: 1, appartamento: 1,
    apartment: 1, casa: 1, roma: 1, rome: 1, flat: 1, luminoso: 1, luminosa: 1,
    ristrutturato: 1, ristrutturata: 1, piano: 1, zona: 1, annuncio: 1, listing: 1,
    /* aggiunte qui: le parole della disponibilità, che altrimenti farebbero
       punteggio su un annuncio che si chiama "…Libero…" o sta in via Settembre */
    libero: 1, libera: 1, disponibile: 1, disponibili: 1, subito: 1, available: 1
  };

  var QUESTION_RE = new RegExp(
    '^\\s*(quant|qual|che\\s|chi\\s|come\\s|dove\\s|c[\'’]?è\\s|ci sono|mi dici|' +
    'dimmi|fammi vedere|mostrami|elenca|lista|vedi|when|which|what|how many|is |are )', 'i');

  /* ── utilità di calendario (niente librerie, niente fusi: date civili) ─── */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function todayIso(today) {
    if (typeof today === 'string' && /^\d{4}-\d{2}-\d{2}/.test(today)) return today.slice(0, 10);
    var d = today instanceof Date ? today : new Date();
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  /* Un mese/giorno senza anno: quello in corso, e se è già passato il
     prossimo. "1 settembre" scritto a dicembre significa l'anno dopo. */
  function inferYear(month, day, refIso) {
    var y = +refIso.slice(0, 4);
    var cand = iso(y, month, Math.min(day, daysInMonth(y, month)));
    return cand < refIso ? y + 1 : y;
  }

  function isIsoDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  }

  /* ── 1. LEGGERE UNA DATA ──────────────────────────────────────────────── */

  /**
   * Il testo che un umano ha scritto → uno stato certo.
   *
   * @returns {{kind:'now'|'date'|'unknown', iso:string|null,
   *            precision:'day'|'month'|'month-end'|'month-mid'|null,
   *            raw:string, why:string}}
   *
   * `unknown` non è un fallimento: è la risposta giusta quando non c'è una
   * lettura sola. Il chiamante non deve MAI trasformarlo in una data.
   */
  function parseAvailability(raw, today) {
    var ref = todayIso(today);
    var s = String(raw == null ? '' : raw).trim();
    var out = function (kind, isoV, precision, why) {
      return { kind: kind, iso: isoV || null, precision: precision || null, raw: s, why: why };
    };

    if (!s) return out('unknown', null, null, 'vuoto');

    /* ISO puro: la forma che il sistema scrive da sé */
    var m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) {
      var yy = +m[1], mm = +m[2], dd = +m[3];
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= daysInMonth(yy, mm)) {
        return out('date', iso(yy, mm, dd), 'day', 'ISO');
      }
    }

    var t = s.toLowerCase();

    /* "libera adesso" batte tutto: è la dichiarazione più forte */
    if (NOW_RE.test(t)) return out('now', null, null, 'subito');

    /* "da concordare" è una scelta esplicita, non un buco */
    if (UNKNOWN_RE.test(t)) return out('unknown', null, null, 'dichiarato da concordare');

    /* giorno + mese — "1 settembre", "il 1° settembre 2026", "Sep 1" */
    m = t.match(new RegExp('\\b(\\d{1,2})\\s*(?:°|º|st|nd|rd|th)?\\s*(?:di\\s+)?(' + MONTH_ALT + ')\\.?\\b(?:\\s+(\\d{4}))?'));
    if (!m) {
      m = t.match(new RegExp('\\b(' + MONTH_ALT + ')\\.?\\s+(\\d{1,2})\\b(?:\\s*,?\\s*(\\d{4}))?'));
      if (m) m = [m[0], m[2], m[1], m[3]];       // normalizza a (giorno, mese, anno)
    }
    if (m) {
      var mo = MONTHS[m[2]], day = +m[1];
      if (mo && day >= 1 && day <= 31) {
        var yr = m[3] ? +m[3] : inferYear(mo, day, ref);
        if (day <= daysInMonth(yr, mo)) return out('date', iso(yr, mo, day), 'day', 'giorno e mese');
      }
    }

    /* numerica all'italiana: giorno PRIMA — "15/10", "15-10-2026", "15.10.26" */
    m = t.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
    if (m) {
      var d2 = +m[1], m2 = +m[2];
      if (m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31) {
        var y2 = m[3] ? +m[3] : 0;
        if (y2 && y2 < 100) y2 += 2000;
        if (!y2) y2 = inferYear(m2, d2, ref);
        if (d2 <= daysInMonth(y2, m2)) return out('date', iso(y2, m2, d2), 'day', 'data numerica');
      }
    }

    /* mese impreciso — QUI VALE LA REGOLA 2: si arrotonda TARDI.
       "fine agosto" → 31 agosto. Mai il 1°: metterebbe in vetrina come
       libera una casa che è ancora occupata per tutto il mese. */
    m = t.match(new RegExp('\\b' + VAGUE_END + '\\s+(?:di\\s+|del\\s+|of\\s+)?(' + MONTH_ALT + ')\\b(?:\\s+(\\d{4}))?'));
    if (m) {
      var me = MONTHS[m[1]], ye = m[2] ? +m[2] : inferYear(me, daysInMonth(+ref.slice(0, 4), me), ref);
      return out('date', iso(ye, me, daysInMonth(ye, me)), 'month-end', 'fine mese (arrotondato tardi)');
    }
    m = t.match(new RegExp('\\b' + VAGUE_MID + '\\s+(?:di\\s+|del\\s+|of\\s+)?(' + MONTH_ALT + ')\\b(?:\\s+(\\d{4}))?'));
    if (m) {
      var mv = MONTHS[m[1]], yv = m[2] ? +m[2] : inferYear(mv, 15, ref);
      return out('date', iso(yv, mv, 15), 'month-mid', 'metà mese');
    }
    m = t.match(new RegExp('\\b' + VAGUE_START + '\\s+(?:di\\s+|del\\s+|of\\s+)?(' + MONTH_ALT + ')\\b(?:\\s+(\\d{4}))?'));
    if (m) {
      var ms = MONTHS[m[1]], ys = m[2] ? +m[2] : inferYear(ms, 1, ref);
      return out('date', iso(ys, ms, 1), 'month', 'inizio mese');
    }

    /* mese NUDO dentro una frase: vale solo con una preposizione davanti —
       "libero da settembre". Senza, "may be free" diventerebbe maggio e
       "set the price" settembre: dentro una frase un mese nudo non è una
       dichiarazione di data. */
    m = t.match(new RegExp('\\b' + LEAD + '\\s+(?:mese\\s+di\\s+|the\\s+)?(' + MONTH_ALT + ')\\.?\\b(?:\\s+(\\d{4}))?'));
    if (m) {
      var mb = MONTHS[m[1]], yb = m[2] ? +m[2] : inferYear(mb, 1, ref);
      return out('date', iso(yb, mb, 1), 'month', 'mese con preposizione');
    }

    /* …ma un mese che è TUTTA la stringa non ha una seconda lettura: è il
       caso del campo del portal, dove "Sep 2026" era uno dei tre esempi del
       placeholder — e diventava "disponibile oggi". Qui non c'è frase in cui
       nascondersi, quindi si legge: primo del mese. */
    m = t.match(new RegExp('^\\s*(?:' + LEAD + '\\s+)?(' + MONTH_ALT + ')\\.?\\s*,?\\s*(\\d{4})?\\s*$'));
    if (m) {
      var mw = MONTHS[m[1]], yw = m[2] ? +m[2] : inferYear(mw, 1, ref);
      return out('date', iso(yw, mw, 1), 'month', 'mese da solo');
    }

    return out('unknown', null, null, 'non interpretabile');
  }

  /* ── 2. LO STATO DI UN ANNUNCIO ───────────────────────────────────────── */

  /**
   * La disponibilità REALE di un annuncio, letta con la precedenza giusta:
   * il campo normalizzato `availableFrom` batte il testo storico
   * `availableDate` — che resta leggibile, così i 19 annunci esistenti
   * funzionano prima ancora del backfill.
   *
   * @returns {{kind, iso, precision, status, source, past:boolean}}
   */
  function resolve(listing, today) {
    var l = listing || {};
    var ref = todayIso(today);
    var status = String(l.status || l.availabilityStatus || '').toLowerCase();

    var res = null, source = 'none';
    if (l.availableFrom != null && String(l.availableFrom).trim()) {
      res = parseAvailability(l.availableFrom, ref); source = 'availableFrom';
    }
    if ((!res || res.kind === 'unknown') && l.availableDate != null && String(l.availableDate).trim()) {
      var alt = parseAvailability(l.availableDate, ref);
      if (alt.kind !== 'unknown' || !res) { res = alt; source = 'availableDate'; }
    }
    if (!res) res = parseAvailability('', ref);

    /* una data già passata vuol dire "da allora", cioè adesso */
    var past = res.kind === 'date' && res.iso <= ref;
    var kind = past ? 'now' : res.kind;

    return {
      kind: kind,
      iso: res.kind === 'date' ? res.iso : null,
      precision: res.precision,
      status: status || 'available',
      source: source,
      past: past
    };
  }

  /* ── 3. LE PAROLE (in un posto solo) ──────────────────────────────────── */

  function fmtDate(isoV, lang) {
    if (!isoV) return '';
    var y = +isoV.slice(0, 4), m = +isoV.slice(5, 7), d = +isoV.slice(8, 10);
    var now = new Date();
    var showYear = y !== now.getUTCFullYear();
    if (lang === 'it') return d + ' ' + MON_IT[m - 1] + (showYear ? ' ' + y : '');
    return d + ' ' + MON_SHORT[m - 1] + (showYear ? ' ' + y : '');
  }

  /**
   * Cosa scrive la pagina. Vetrina, scheda, feed e bot chiamano QUESTA, così
   * non possono contraddirsi — la lezione di pinCopy().
   * @returns {{text:string, tone:'now'|'date'|'unknown'|'waitlist'|'rented'}}
   */
  function label(listingOrRes, lang, today) {
    var it = lang === 'it';
    var r = (listingOrRes && listingOrRes.kind) ? listingOrRes : resolve(listingOrRes, today);

    if (r.status === 'waitlist') {
      return {
        text: it ? 'Occupata ora · si prenota in anticipo' : 'Occupied now · rents ahead',
        tone: 'waitlist'
      };
    }
    if (r.status === 'rented' && r.kind !== 'date') {
      return { text: it ? 'Affittata' : 'Rented', tone: 'rented' };
    }
    if (r.kind === 'now') return { text: it ? 'Disponibile ora' : 'Available now', tone: 'now' };
    if (r.kind === 'date') {
      return {
        text: (it ? 'Libera dal ' : 'Free from ') + fmtDate(r.iso, lang),
        tone: 'date'
      };
    }
    /* LA REGOLA 1, nell'unico punto che conta: qui NON si dice "ora" */
    return { text: it ? 'Data su richiesta' : 'Ask us for the date', tone: 'unknown' };
  }

  /* ── 4. RICONOSCERE L'IMMOBILE (stesso punteggio del bot) ─────────────── */

  function tokens(hay) {
    var out = {}, m = String(hay || '').toLowerCase().match(/[a-zà-ù]{4,}/g) || [];
    for (var i = 0; i < m.length; i++) if (!NL_STOPWORDS[m[i]]) out[m[i]] = 1;
    return Object.keys(out);
  }

  /**
   * @returns {{id, listing}} | {ambiguous:[names]} | null
   */
  function matchListing(text, listings) {
    var t = String(text || '').toLowerCase();
    var list = Array.isArray(listings) ? listings : [];
    var scored = [];

    for (var i = 0; i < list.length; i++) {
      var l = list[i], id = String(l.id || '');
      if (id && t.indexOf(id.toLowerCase()) >= 0) return { id: id, listing: l };
      var toks = tokens((l.name || '') + ' ' + (l.zone || '') + ' ' + (l.address || ''));
      var score = 0;
      for (var k = 0; k < toks.length; k++) if (t.indexOf(toks[k]) >= 0) score++;
      if (score) scored.push({ score: score, id: id, listing: l });
    }

    if (!scored.length) {
      var TYPES = ['bilocale', 'trilocale', 'monolocale', 'quadrilocale'];
      for (var x = 0; x < TYPES.length; x++) {
        if (t.indexOf(TYPES[x]) < 0) continue;
        var hits = list.filter(function (l2) {
          return ((l2.name || '') + ' ' + (l2.type || '')).toLowerCase().indexOf(TYPES[x]) >= 0;
        });
        if (hits.length === 1) return { id: String(hits[0].id), listing: hits[0] };
        if (hits.length) return { ambiguous: hits.map(function (h) { return h.name || h.id; }) };
      }
      return list.length === 1 ? { id: String(list[0].id), listing: list[0] } : null;
    }

    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.filter(function (s) { return s.score === scored[0].score; });
    if (top.length === 1) return { id: top[0].id, listing: top[0].listing };
    return { ambiguous: top.map(function (s) { return s.listing.name || s.id; }) };
  }

  function isQuestion(text) {
    var t = String(text || '');
    return QUESTION_RE.test(t) || /\?\s*$/.test(t);
  }

  /* ── 5. IL MESSAGGIO UNICO ────────────────────────────────────────────── */

  function segments(text) {
    var s = String(text || '');
    /* "aggiorna le disponibilità: …" — il preambolo non è un immobile */
    s = s.replace(/^[^:\n]{0,60}:(?=[\s\S])/, function (pre) {
      return /aggiorn|disponibil|liber|update|availabilit|dat[ei]|calendario/i.test(pre) ? '' : pre;
    });
    return s
      .split(/[\n;,·•|]+|\s+[-–—]\s+|\s+(?:e|ed|and)\s+/i)
      .map(function (x) { return x.replace(/^[\s>*\-–—]+/, '').trim(); })
      .filter(Boolean);
  }

  /**
   * UN messaggio → le date di TUTTI gli appartamenti nominati.
   *
   *   "Levico dal 1 settembre, Cavour subito, Pigneto 15/10"
   *   "Levico, Cavour e Pigneto dal 1 settembre"      ← una data per tutti
   *
   * Il secondo caso (`mode:'broadcast'`) scatta SOLO quando nel messaggio
   * c'è UNA sola data e nessun altro pezzo ne porta una propria: lì non
   * esiste una seconda lettura. Un messaggio MISTO — due case con la loro
   * data più una nuda — non trasmette niente a nessuno: la casa senza data
   * resta `noDate` e lo dice. Indovinare quale data volesse è esattamente
   * il modo di scrivere una data sbagliata su un immobile vero.
   *
   * @returns {{ok, mode, updates:[{id,name,kind,iso,precision,phrase}],
   *            ambiguous:[], noDate:[], noListing:[], note}}
   */
  function parseBatch(text, listings, today) {
    var ref = todayIso(today);
    var raw = String(text || '');
    var empty = {
      ok: false, mode: 'none', updates: [], ambiguous: [], noDate: [], noListing: [], note: ''
    };

    if (!raw.trim()) { empty.note = 'Messaggio vuoto.'; return empty; }

    /* LA GUARDIA: "quali sono liberi a settembre?" nomina case e mesi e
       diventerebbe una scrittura di massa. Una domanda non scrive mai. */
    if (isQuestion(raw)) {
      empty.note = 'Sembra una domanda, non un aggiornamento.';
      empty.isQuestion = true;
      return empty;
    }

    var segs = segments(raw), parts = [];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var mt = matchListing(seg, listings);
      var av = parseAvailability(seg, ref);
      parts.push({ seg: seg, match: mt, avail: av });
    }

    var dated = parts.filter(function (p) { return p.avail.kind !== 'unknown'; });
    var named = parts.filter(function (p) { return p.match && p.match.id; });

    var res = {
      ok: false, mode: 'segments', updates: [], ambiguous: [], noDate: [], noListing: [], note: ''
    };

    /* trasmissione: una sola data, più immobili, nessuna ambiguità di lettura */
    if (dated.length === 1 && named.length >= 2) {
      var one = dated[0].avail;
      res.mode = 'broadcast';
      named.forEach(function (p) {
        res.updates.push(item(p.match, one, dated[0].seg));
      });
      parts.forEach(function (p) {
        if (p.match && p.match.ambiguous) res.ambiguous.push({ seg: p.seg, names: p.match.ambiguous });
      });
      res.ok = res.updates.length > 0;
      res.note = res.ok
        ? res.updates.length + ' immobili → ' + human(one)
        : '';
      return res;
    }

    parts.forEach(function (p) {
      if (p.match && p.match.ambiguous) {
        res.ambiguous.push({ seg: p.seg, names: p.match.ambiguous });
        return;
      }
      var hasListing = !!(p.match && p.match.id);
      var hasDate = p.avail.kind !== 'unknown' || UNKNOWN_RE.test(p.seg.toLowerCase());
      if (hasListing && hasDate) {
        res.updates.push(item(p.match, p.avail, p.seg));
      } else if (hasListing) {
        res.noDate.push({ seg: p.seg, id: p.match.id, name: p.match.listing.name || p.match.id });
      } else if (p.avail.kind !== 'unknown') {
        res.noListing.push({ seg: p.seg, avail: p.avail });
      }
    });

    /* lo stesso immobile nominato due volte: vince l'ULTIMA parola scritta */
    var seen = {};
    res.updates = res.updates.filter(function (u) { return true; }).reverse()
      .filter(function (u) { if (seen[u.id]) return false; seen[u.id] = 1; return true; })
      .reverse();

    res.ok = res.updates.length > 0;
    if (!res.ok && !res.note) {
      res.note = res.ambiguous.length ? 'Non ho capito quale immobile.'
        : res.noListing.length ? 'Ho letto una data ma non a quale casa si riferisce.'
          : res.noDate.length ? 'Ho riconosciuto la casa ma non la data.'
            : 'Nessun immobile e nessuna data riconosciuti.';
    }
    return res;

    function item(mt, av, seg) {
      return {
        id: mt.id,
        name: mt.listing.name || mt.id,
        kind: av.kind,
        iso: av.iso,
        precision: av.precision,
        phrase: seg,
        was: shortState(mt.listing, ref)
      };
    }
  }

  function shortState(l, ref) {
    var r = resolve(l, ref);
    return r.kind === 'now' ? 'subito' : r.kind === 'date' ? r.iso : '—';
  }

  function human(av, lang) {
    if (!av) return '—';
    if (av.kind === 'now') return lang === 'en' ? 'now' : 'subito';
    if (av.kind === 'date') return av.iso;
    return lang === 'en' ? 'unknown' : 'da concordare';
  }

  /* ── 6. COSA SI SCRIVE SU FIRESTORE ───────────────────────────────────── */

  /**
   * L'unica forma ammessa sul documento. Additiva e reversibile: la frase
   * originale dell'operatore resta in `availableRaw`, come
   * `descriptionOriginal` per i testi e `imagesOriginal` per le foto.
   *
   * `availableDate` continua a essere scritto (ISO o "Subito") perché lo
   * leggono ancora il bot, il Pubblicista e la vetrina non aggiornata: la
   * normalizzazione non deve rompere chi c'era prima.
   */
  function writePatch(av, actor) {
    var now = new Date().toISOString();
    var p = {
      availableFrom: av.kind === 'date' ? av.iso : (av.kind === 'now' ? 'Subito' : ''),
      availableDate: av.kind === 'date' ? av.iso : (av.kind === 'now' ? 'Subito' : ''),
      availableKind: av.kind,
      availablePrecision: av.precision || '',
      availableRaw: String(av.raw || '').slice(0, 120),
      availabilityUpdatedAt: now,
      availabilityUpdatedBy: String(actor || '').slice(0, 80),
      updatedAt: now
    };
    return p;
  }

  /* Il quadro d'insieme: quante case dicono la verità e quante tacciono.
     Serve al comando /disponibilita e al pannello del portal. */
  function audit(listings, today) {
    var ref = todayIso(today);
    var out = { now: 0, date: 0, unknown: 0, rented: 0, waitlist: 0, total: 0, gaps: [] };
    (Array.isArray(listings) ? listings : []).forEach(function (l) {
      var r = resolve(l, ref);
      out.total++;
      if (r.status === 'rented') out.rented++;
      else if (r.status === 'waitlist') out.waitlist++;
      if (r.kind === 'unknown') {
        out.unknown++;
        if (r.status !== 'rented') out.gaps.push({ id: l.id, name: l.name || l.id, status: r.status });
      } else out[r.kind]++;
    });
    return out;
  }

  var API = {
    parseAvailability: parseAvailability,
    resolve: resolve,
    label: label,
    fmtDate: fmtDate,
    matchListing: matchListing,
    isQuestion: isQuestion,
    segments: segments,
    parseBatch: parseBatch,
    writePatch: writePatch,
    audit: audit,
    human: human,
    todayIso: todayIso
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_DISPO = API;
})(typeof window !== 'undefined' ? window : this);
