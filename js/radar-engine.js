/* js/radar-engine.js — IL RADAR 2.0: l'impronta, il fiuto, le vedette, il valutatore.
 *
 * LA DOMANDA A CUI RISPONDE. Il radar vedeva gli annunci ma non li CAPIVA:
 * la stessa casa su Immobiliare e Idealista erano due docuenti diversi, due
 * push nel mazzo del cliente, due conteggi nelle statistiche; un prezzo
 * sotto mercato passava nel feed identico a uno normale; le ricerche
 * esistevano solo per i clienti PFS paganti; e "quanto affitta questa casa?"
 * si rispondeva a memoria. Questo motore è ciò che Casafari vende — con in
 * più il dato che Casafari non ha (i canoni FIRMATI nostri) e con le regole
 * della casa: mai inventare, mai pubblicare su campione debole, un blocco
 * non è una morte, un dubbio non è un verdetto.
 *
 * QUATTRO POTERI, UN MOTORE PURO:
 *   L'IMPRONTA   — la stessa casa vista da due porte è UNA casa. findTwin()
 *                  aggancia l'annuncio appena visto ai gemelli già noti
 *                  (cross-portale E ripubblicazioni sullo stesso portale).
 *                  Regola dura: un FALSO gemello è peggio di uno mancato —
 *                  due case diverse fuse in una = un'occasione nascosta al
 *                  cliente. Quindi soglie conservative, e la via non
 *                  distruttiva: si annota il cluster, non si cancella nulla.
 *   IL FIUTO     — ogni annuncio ingerito riceve un punteggio 0-100 contro
 *                  le statistiche VERE di zona (marketStats del Perito):
 *                  €/mq sotto il 25° percentile, ribasso recente, rientro
 *                  sul mercato, privato. Sotto campione minimo NON esce un
 *                  verdetto (la lezione D4). Un prezzo troppo bello è
 *                  'sospetto', mai 'occasione': le truffe sono sotto p25.
 *   LE VEDETTE   — le ricerche libere: criteri qualsiasi (zona, prezzo,
 *                  taglia, solo privati, solo occasioni), canale Telegram
 *                  istantaneo per l'operatore e digest email per chiunque
 *                  altro. Slegate dai clienti PFS: sono gli occhi che
 *                  l'operatore punta dove vuole lui.
 *   IL VALUTATORE— "quanto affitta?" con i numeri: fascia dai quantili di
 *                  zona (chiesto) CORRETTA sul rapporto chiesto→firmato dei
 *                  contratti BOOM veri. La correzione si applica solo con
 *                  campione firmato sufficiente, e si dichiara sempre.
 *
 * Puro: nessuna rete, nessun DB, nessun DOM. Il giudizio sta qui, dove è
 * testato (anche per mutazione); l'I/O sta nelle porte api/radar/*.
 * window.BOOM_RADAR + module.exports (UMD, come market-engine — che questo
 * file riusa per la normalizzazione zone: UNA copia, mai due).
 */
(function (root) {
  'use strict';

  var MK = (typeof module !== 'undefined' && module.exports)
    ? require('./market-engine.js')
    : (root && root.BOOM_MARKET);
  if (!MK) throw new Error('radar-engine richiede market-engine (BOOM_MARKET)');

  var DAY = 86400e3;

  function num(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (x == null) return null;
    var n = parseFloat(String(x).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function T(x) { var t = +new Date(x); return isFinite(t) ? t : null; }
  function round10(x) { return Math.round(x / 10) * 10; }

  /* ── LA ZONA DEDOTTA, MAI INDOVINATA ────────────────────────────────────
   * Il difetto trovato in produzione: la fonte PORTANTE (scan-inbox) non
   * passa nessuna zona, e scan-market passava l'ETICHETTA della ricerca
   * ("Immobiliare · Roma · prati · privati · ≤€1500") come zona → slug
   * spazzatura che frammentava marketStats. Senza zone pulite, fiuto,
   * valutatore e statistiche muoiono di fame.
   *
   * inferZone legge la zona dal TITOLO/INDIRIZZO dell'annuncio stesso (mai
   * dalla descrizione: "a due passi da Trastevere" è marketing, non
   * geografia) contro un lessico curato di toponimi romani. Le regole:
   *   - solo parole intere (niente 'monti' dentro 'monteverde');
   *   - l'alias più LUNGO vince quando contiene il più corto
   *     ('monti tiburtini' batte 'monti' → Tiburtino, non Monti);
   *   - due zone diverse entrambe presenti → null (ambiguo: mai indovinare,
   *     la lezione di matchZone del canone-engine);
   *   - ogni alias vive in UNA zona sola (i nomi ambigui — 'cavour',
   *     'porta pia', 'piramide' — sono esclusi dal lessico di proposito).
   * Il canonical è il nome che normalizeZone porta allo slug delle
   * statistiche — lo stesso spazio dei nostri annunci ('Pigneto', 'Prati'). */
  var ROME_ZONES = {
    'Centro Storico': ['centro storico', 'campo de fiori', 'piazza navona', 'pantheon', 'piazza di spagna', 'tridente', 'via giulia', 'ghetto ebraico', 'largo argentina'],
    'Monti': ['rione monti', 'monti', 'colosseo', 'fori imperiali', 'via urbana', 'panisperna', 'madonna dei monti'],
    'Celio': ['celio'],
    'Esquilino': ['esquilino', 'piazza vittorio', 'santa maria maggiore', 'termini'],
    'Castro Pretorio': ['castro pretorio', 'sallustiano'],
    'Ludovisi': ['ludovisi', 'via veneto', 'barberini'],
    'San Lorenzo': ['san lorenzo', 'scalo san lorenzo', 'verano'],
    'Trastevere': ['trastevere', 'san cosimato', 'porta portese', 'gianicolo'],
    'Testaccio': ['testaccio'],
    'Aventino': ['aventino', 'san saba'],
    'San Giovanni': ['san giovanni', 're di roma'],
    'Appio Latino': ['appio latino', 'ponte lungo', 'furio camillo', 'alberone', 'colli albani'],
    'Pigneto': ['pigneto', 'prenestino', 'malatesta', 'villa gordiani'],
    'Torpignattara': ['torpignattara', 'marranella'],
    'Centocelle': ['centocelle'],
    'Tuscolano': ['tuscolano', 'cinecitta', 'don bosco', 'quadraro', 'porta furba', 'arco di travertino', 'subaugusta'],
    'Tiburtino': ['tiburtino', 'pietralata', 'monti tiburtini', 'portonaccio', 'casal bertone'],
    'Bologna': ['piazza bologna', 'via lanciani', 'batteria nomentana'],
    'Nomentano': ['nomentano', 'villa torlonia'],
    'Trieste': ['quartiere trieste', 'trieste', 'coppede', 'corso trieste', 'quartiere africano', 'viale libia', 'salario'],
    'Parioli': ['parioli', 'piazza euclide'],
    'Pinciano': ['pinciano', 'villa borghese'],
    'Flaminio': ['flaminio', 'villaggio olimpico', 'piazza mancini'],
    'Ponte Milvio': ['ponte milvio', 'farnesina'],
    'Vigna Clara': ['vigna clara', 'collina fleming', 'fleming', 'camilluccia', 'corso francia'],
    'Prati': ['prati', 'piazza mazzini', 'lepanto', 'ottaviano', 'cola di rienzo', 'della vittoria', 'delle vittorie'],
    'Borgo': ['borgo pio', 'san pietro', 'vaticano'],
    'Cipro': ['cipro', 'valle aurelia'],
    'Trionfale': ['trionfale', 'monte mario', 'balduina'],
    'Aurelio': ['aurelio', 'gregorio vii', 'cavalleggeri', 'baldo degli ubaldi', 'cornelia', 'boccea'],
    'Monteverde': ['monteverde', 'gianicolense', 'villa pamphili', 'quattro venti', 'colli portuensi'],
    'Portuense': ['portuense', 'villa bonelli'],
    'Marconi': ['marconi'],
    'Ostiense': ['ostiense', 'san paolo', 'gazometro'],
    'Garbatella': ['garbatella'],
    'Ardeatino': ['ardeatino', 'grottaperfetta', 'roma 70', 'tor marancia', 'montagnola'],
    'EUR': ['eur', 'torrino', 'laurentina'],
    'Montesacro': ['montesacro', 'monte sacro', 'talenti', 'conca d oro', 'prati fiscali', 'nuovo salario', 'sacco pastore', 'citta giardino']
  };

  var ZONE_LEXICON = (function () {
    var out = [];
    Object.keys(ROME_ZONES).forEach(function (zone) {
      ROME_ZONES[zone].forEach(function (alias) {
        out.push({ zone: zone, alias: alias, re: new RegExp('(^|[^a-z0-9])' + alias.replace(/ /g, '[^a-z0-9]+') + '($|[^a-z0-9])') });
      });
    });
    // Alias più lunghi provati per primi: il containment-pruning poi scarta
    // i corti contenuti nei lunghi già trovati.
    out.sort(function (a, b) { return b.alias.length - a.alias.length; });
    return out;
  })();

  function inferZone(text) {
    var hay = fold(text);
    if (!hay || hay.length < 3) return null;
    var hits = [];
    ZONE_LEXICON.forEach(function (e) {
      if (e.re.test(hay)) hits.push(e);
    });
    if (!hits.length) return null;
    // Pruning per contenimento: 'monti tiburtini' presente → 'monti' non conta.
    var pruned = hits.filter(function (h) {
      return !hits.some(function (o) {
        return o !== h && o.alias.length > h.alias.length && o.alias.indexOf(h.alias) >= 0;
      });
    });
    var zones = [];
    pruned.forEach(function (h) { if (zones.indexOf(h.zone) < 0) zones.push(h.zone); });
    if (zones.length !== 1) return null;      // ambiguo → mai indovinare
    return { zone: zones[0], matched: pruned[0].alias };
  }

  /* ── L'IMPRONTA ─────────────────────────────────────────────────────────
   * Il gemellaggio si decide sui FATTI strutturati (zona, prezzo, mq,
   * camere) più i segnali del titolo (la via, i token). Mai sull'URL: è
   * proprio l'URL che cambia fra portali. */

  var STOPWORDS = {
    appartamento: 1, appartamenti: 1, affitto: 1, affittasi: 1, roma: 1,
    zona: 1, adiacenze: 1, pressi: 1, luminoso: 1, luminosa: 1, splendido: 1,
    splendida: 1, ampio: 1, ampia: 1, grazioso: 1, graziosa: 1, nuovo: 1,
    nuova: 1, ristrutturato: 1, ristrutturata: 1, arredato: 1, arredata: 1,
    bilocale: 1, trilocale: 1, quadrilocale: 1, monolocale: 1, stanza: 1,
    locali: 1, locale: 1, camere: 1, camera: 1, bagno: 1, bagni: 1,
    con: 1, per: 1, del: 1, della: 1, delle: 1, dei: 1, nel: 1, nella: 1,
    via: 1, viale: 1, piazza: 1, largo: 1, corso: 1, vicolo: 1,
    apartment: 1, flat: 1, rent: 1, rome: 1, room: 1, bedroom: 1, near: 1
  };

  function fold(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function tokens(s) {
    var out = [], seen = {};
    fold(s).split(/[^a-z0-9]+/).forEach(function (w) {
      if (w.length < 3 || STOPWORDS[w] || /^\d+$/.test(w)) return;
      if (!seen[w]) { seen[w] = 1; out.push(w); }
    });
    return out.slice(0, 24);
  }

  /* La via dentro il titolo/indirizzo. Se DUE annunci dichiarano vie
   * DIVERSE, non sono gemelli — punto. È il guardrail più forte contro il
   * falso merge (dieci bilocali identici della stessa agenzia in zone
   * limitrofe hanno prezzo e mq uguali, ma vie diverse). */
  var STREET_RE = /\b(via|viale|piazza|piazzale|largo|vicolo|corso|lungotevere|circonvallazione)\s+(?:d[eiao][illa]*\s+|d')?([a-z0-9' ]{3,40}?)(?=\s*(?:,|\.|\d|$|-|–|\(|zona\b|roma\b|ad\b))/;
  function streetOf(x) {
    var hay = fold((x && (x.address || '')) + ' ' + (x && (x.title || '')));
    var m = STREET_RE.exec(hay);
    if (!m) return null;
    var name = m[2].replace(/\s+/g, ' ').trim();
    if (!name || name.length < 3) return null;
    var civic = null;
    var after = hay.slice(m.index + m[0].length).match(/^\s*,?\s*(\d{1,4})\b/);
    if (after) civic = after[1];
    return { street: m[1] + ' ' + name, civic: civic };
  }

  function overlap(a, b) {
    if (!a.length || !b.length) return { inter: 0, jac: 0 };
    var setB = {}, inter = 0;
    b.forEach(function (w) { setB[w] = 1; });
    a.forEach(function (w) { if (setB[w]) inter++; });
    return { inter: inter, jac: inter / (a.length + b.length - inter) };
  }
  function jaccard(a, b) { return overlap(a, b).jac; }

  /* Compatibilità zona: slug uguale, oppure uno contiene l'altro
   * ('prenestino-pigneto' e 'pigneto' sono la stessa strada di casa). */
  function zoneCompat(za, zb) {
    if (!za || !zb) return 0;
    if (za === zb) return 1;
    if (za.length >= 4 && zb.length >= 4 &&
        (za.indexOf(zb) >= 0 || zb.indexOf(za) >= 0)) return 0.8;
    return 0;
  }

  /* twinScore(a, b) → { score 0..1, why[], reject } — pura e simmetrica nei
   * fatti (l'ordine non cambia il verdetto). reject = prova POSITIVA che
   * sono case diverse: azzera tutto, qualunque sia il resto. */
  function twinScore(a, b) {
    var why = [];
    var za = MK.normalizeZone(a.zone) || a.zoneSlug || null;
    var zb = MK.normalizeZone(b.zone) || b.zoneSlug || null;
    var zc = zoneCompat(za, zb);
    if (!zc) return { score: 0, why: ['zone diverse'], reject: true };

    var pa = num(a.price), pb = num(b.price);
    if (pa == null || pb == null) return { score: 0, why: ['prezzo mancante'], reject: true };
    var pd = Math.abs(pa - pb) / Math.min(pa, pb);
    if (pd > 0.10) return { score: 0, why: ['prezzi troppo distanti (' + Math.round(pd * 100) + '%)'], reject: true };

    var sa = streetOf(a), sb = streetOf(b);
    if (sa && sb && sa.street !== sb.street) {
      return { score: 0, why: ['vie diverse: "' + sa.street + '" vs "' + sb.street + '"'], reject: true };
    }

    var qa = num(a.sqm), qb = num(b.sqm);
    var sqmSim = null;
    if (qa != null && qb != null) {
      var qd = Math.abs(qa - qb) / Math.min(qa, qb);
      if (qd > 0.10) return { score: 0, why: ['metrature diverse (' + qa + ' vs ' + qb + ' mq)'], reject: true };
      sqmSim = qd <= 0.02 ? 1 : (qd <= 0.05 ? 0.85 : 0.55);
    }

    var ra = num(a.rooms != null ? a.rooms : a.bedrooms);
    var rb = num(b.rooms != null ? b.rooms : b.bedrooms);
    var roomSim = null;
    if (ra != null && rb != null) {
      var rd = Math.abs(ra - rb);
      // I portali contano diversamente (locali vs camere): 1 di scarto è
      // rumore di conteggio, 2+ è un'altra casa.
      if (rd >= 2) return { score: 0, why: ['numero stanze incompatibile'], reject: true };
      roomSim = rd === 0 ? 1 : 0.5;
    }

    var score = 0;
    score += zc * 0.25;                                   why.push(zc === 1 ? 'stessa zona' : 'zona compatibile');
    var priceSim = pd <= 0.005 ? 1 : (pd <= 0.02 ? 0.9 : (pd <= 0.05 ? 0.6 : 0.3));
    score += priceSim * 0.30;                             why.push('prezzo ' + (pd <= 0.005 ? 'identico' : ('vicino (' + Math.round(pd * 100) + '%)')));
    if (sqmSim != null) { score += sqmSim * 0.25;         why.push('metratura ' + (sqmSim === 1 ? 'identica' : 'vicina')); }
    if (roomSim != null) { score += roomSim * 0.10;       if (roomSim === 1) why.push('stesse stanze'); }

    if (sa && sb && sa.street === sb.street) {
      score += 0.25;                                      why.push('stessa via (' + sa.street + ')');
      if (sa.civic && sb.civic && sa.civic === sb.civic) { score += 0.10; why.push('stesso civico'); }
    }
    // Il segnale dei titoli esige ALMENO 2 token significativi in comune:
    // su titoli corti un token solo ("eur") dà Jaccard alto per caso — ed è
    // proprio il caso delle unità gemelle della stessa agenzia.
    var ov = overlap(tokens((a.title || '') + ' ' + (a.address || '')), tokens((b.title || '') + ' ' + (b.address || '')));
    if (ov.inter >= 2 && ov.jac >= 0.5) { score += 0.15; why.push('titoli sovrapponibili'); }
    else if (ov.inter >= 2 && ov.jac >= 0.3) { score += 0.07; }

    return { score: Math.min(1, score), why: why, reject: false };
  }

  var TWIN_THRESHOLD = 0.75;
  var TWIN_THRESHOLD_SAME_SOURCE = 0.88;

  /* findTwin(subject, candidates) → il miglior gemello sopra soglia, o null.
   *
   * Stessa FONTE = soglia più alta E serve un segnale identitario (via o
   * titoli sovrapponibili): la stessa agenzia pubblica dieci unità gemelle
   * nello stesso palazzo — prezzo e mq identici, case diverse. Il falso
   * merge lì è il default, non l'eccezione. */
  function findTwin(subject, candidates, opts) {
    var o = opts || {};
    var best = null;
    (candidates || []).forEach(function (c) {
      if (!c || c.id === subject.id) return;
      var r = twinScore(subject, c);
      if (r.reject) return;
      var sameSource = subject.source && c.source && subject.source === c.source;
      var thr = sameSource ? TWIN_THRESHOLD_SAME_SOURCE : (o.threshold != null ? o.threshold : TWIN_THRESHOLD);
      if (sameSource) {
        var hasIdentity = r.why.some(function (w) { return w.indexOf('stessa via') === 0 || w === 'titoli sovrapponibili' || w === 'stesso civico'; });
        if (!hasIdentity) return;
      }
      if (r.score < thr) return;
      if (!best || r.score > best.score) best = { id: c.id, clusterId: c.clusterId || c.id, score: Math.round(r.score * 100) / 100, why: r.why, sameSource: !!sameSource };
    });
    return best;
  }

  /* Il verdetto sul cluster: cosa RACCONTA il fatto che la stessa casa sia
   * su più porte. members: [{ id, source, advertiser, price, firstSeenAt }] */
  function clusterInfo(members) {
    var ms = (members || []).filter(Boolean);
    var sources = [], advertisers = [], srcSeen = {}, advSeen = {}, srcCount = {};
    var first = null, best = null;
    ms.forEach(function (m) {
      var s = m.source || 'altro';
      srcCount[s] = (srcCount[s] || 0) + 1;
      if (!srcSeen[s]) { srcSeen[s] = 1; sources.push(s); }
      var a = m.advertiser || 'unknown';
      if (!advSeen[a]) { advSeen[a] = 1; advertisers.push(a); }
      var t = T(m.firstSeenAt);
      if (t != null && (first == null || t < first)) first = t;
      var p = num(m.price);
      if (p != null && (!best || p < best.price)) best = { id: m.id, price: p };
    });
    var repost = Object.keys(srcCount).some(function (s) { return srcCount[s] >= 2; });
    return {
      memberIds: ms.map(function (m) { return m.id; }),
      size: ms.length,
      sources: sources,
      multiPortal: sources.length >= 2,
      privateAndAgency: advSeen['private'] === 1 && advSeen['agency'] === 1,
      repost: repost,
      bestPrice: best,
      firstSeenAt: first != null ? new Date(first).toISOString() : null
    };
  }

  /* ── L'INDICE DEI RECENTI ───────────────────────────────────────────────
   * Il gemellaggio ha bisogno di candidati senza rileggere migliaia di doc:
   * un unico documento-indice con gli annunci recenti in forma compatta.
   * È una CACHE della verità (i doc pfsProperties), non la verità: perderne
   * una voce degrada (un gemello mancato), non rompe. */
  var INDEX_CAP = 800;
  var INDEX_MAX_AGE_DAYS = 90;

  function indexEntry(id, p, clusterId) {
    return {
      id: id,
      source: p.source || null,
      zoneSlug: MK.normalizeZone(p.zone) || null,
      price: num(p.price),
      sqm: num(p.sqm),
      rooms: num(p.bedrooms != null ? p.bedrooms : p.rooms),
      advertiser: p.advertiser || 'unknown',
      title: (p.title || p.address || '').slice(0, 90),
      address: (p.address || '').slice(0, 90),
      t: p.firstSeenAt || p.scrapedAt || new Date().toISOString(),
      clusterId: clusterId || id
    };
  }

  function indexUpsert(entries, entry, opts) {
    var o = opts || {};
    var cap = o.cap != null ? o.cap : INDEX_CAP;
    var maxAge = (o.maxAgeDays != null ? o.maxAgeDays : INDEX_MAX_AGE_DAYS) * DAY;
    var now = o.nowMs != null ? o.nowMs : Date.now();
    var out = (entries || []).filter(function (e) {
      if (!e || e.id === entry.id) return false;
      var t = T(e.t);
      return t != null && (now - t) <= maxAge;
    });
    out.push(entry);
    if (out.length > cap) {
      out.sort(function (a, b) { return (T(a.t) || 0) - (T(b.t) || 0); });
      out = out.slice(out.length - cap);
    }
    return out;
  }

  /* ── IL FIUTO ───────────────────────────────────────────────────────────
   * fiuto(listing, ctx) → { score, verdict, reasons, eurSqm, vsMedianPct }
   * ctx: { stats?  (doc marketStats/<zona> del Perito),
   *        ledger? (doc marketListings — storia prezzi, rientri, nascita),
   *        cluster? (clusterInfo), nowMs? }
   *
   * L'ONESTÀ PRIMA DEL PUNTEGGIO: senza statistiche di zona con campione
   * sufficiente il verdetto è null e la ragione è scritta. Un "occasione"
   * calcolato su tre annunci è un'opinione travestita — e l'operatore ci
   * manderebbe un cliente. */
  /* Calibrazione (asserita nei test sui casi tipo): sotto-p25 da solo = 50
   * ("interessante"); sotto-p25 + privato = 60 ("occasione" — è IL caso d'oro
   * del Property Finding); sotto-p25 + ribasso = 65; metà fascia bassa +
   * privato + fresco ≈ 42. */
  var FIUTO = { OCCASIONE: 60, INTERESSANTE: 40 };

  function fiuto(listing, ctx) {
    var c = ctx || {};
    var now = c.nowMs != null ? c.nowMs : Date.now();
    var reasons = [];
    var eurSqm = MK.eurSqm(listing);

    var asked = c.stats && c.stats.asked;
    if (!asked || !asked.ok) {
      return { score: null, verdict: null, eurSqm: eurSqm != null ? Math.round(eurSqm * 10) / 10 : null,
        vsMedianPct: null, reasons: ['zona senza campione sufficiente: nessun verdetto'] };
    }
    if (eurSqm == null) {
      return { score: null, verdict: null, eurSqm: null, vsMedianPct: null,
        reasons: ['mq mancanti: il fiuto non giudica al buio'] };
    }

    var vsMedian = Math.round(((eurSqm / asked.medianEurSqm) - 1) * 100);

    // Troppo bello per essere vero = SOSPETTO, mai occasione. Le truffe
    // vivono sotto il 25° percentile; segnalarle come affari è il modo più
    // rapido per bruciare la fiducia nel radar.
    if (eurSqm < Math.max(6, asked.p25 * 0.45)) {
      return { score: 0, verdict: 'sospetto', eurSqm: Math.round(eurSqm * 10) / 10, vsMedianPct: vsMedian,
        reasons: ['prezzo irrealistico per la zona (' + Math.round(eurSqm * 10) / 10 + ' €/mq vs p25 ' + asked.p25 + '): probabile errore o truffa'] };
    }

    var score = 0;
    if (eurSqm <= asked.p25) {
      score += 50; reasons.push('sotto il 25° percentile di zona (' + Math.round(eurSqm * 10) / 10 + ' vs ' + asked.p25 + ' €/mq)');
    } else if (eurSqm <= asked.medianEurSqm) {
      var frac = (asked.medianEurSqm - eurSqm) / Math.max(1e-9, asked.medianEurSqm - asked.p25);
      score += Math.round(15 + 25 * frac);
      reasons.push('sotto la mediana di zona (' + vsMedian + '%)');
    } else if (eurSqm <= asked.p75) {
      score += 8;
    }

    var led = c.ledger || {};
    var dropAt = T(led.priceDropAt);
    if (dropAt && (now - dropAt) <= 14 * DAY) {
      score += 15; reasons.push('ribasso di prezzo negli ultimi 14 giorni');
    }
    var reAt = T(led.relistedAt);
    if (reAt && (now - reAt) <= 30 * DAY) {
      score += 8; reasons.push('tornato sul mercato di recente');
    }
    if ((listing.advertiser || led.advertiser) === 'private') {
      score += 10; reasons.push('privato (niente commissione d\'agenzia)');
    }
    var born = T(led.firstSeenAt || listing.firstSeenAt || listing.scrapedAt);
    if (born && (now - born) <= DAY) {
      score += 5; reasons.push('appena uscito');
    }

    score = Math.max(0, Math.min(100, score));
    var verdict = score >= FIUTO.OCCASIONE ? 'occasione'
      : (score >= FIUTO.INTERESSANTE ? 'interessante' : 'normale');
    return { score: score, verdict: verdict, eurSqm: Math.round(eurSqm * 10) / 10, vsMedianPct: vsMedian, reasons: reasons };
  }

  /* ── IL RADAR MANDATI (le card per l'operatore, mai messaggi) ──────────
   * Un PRIVATO fermo ben oltre l'assorbimento di zona è un proprietario che
   * sta scoprendo da solo quanto è faticoso affittare: la card "proponigli
   * la gestione BOOM" è il potere sancito dallo studio Homie (§3: card per
   * l'operatore, MAI contatto automatico — la D5 del Perito non si tocca).
   * ledger: doc marketListings. Ritorna null se non è un candidato. */
  function mandatoCheck(ledger, stats, opts) {
    var o = opts || {};
    var now = o.nowMs != null ? o.nowMs : Date.now();
    var minDays = o.minDays != null ? o.minDays : 45;
    if (!ledger || ledger.status !== 'active') return null;
    if (ledger.advertiser !== 'private') return null;
    var born = T(ledger.firstSeenAt);
    if (!born) return null;
    var days = Math.floor((now - born) / DAY);
    var absorption = stats && stats.absorption;
    var threshold = (absorption && absorption.ok)
      ? Math.max(minDays, Math.round(absorption.medianDays * 1.5))
      : 60; // senza assorbimento di zona: soglia fissa, dichiarata
    if (days < threshold) return null;
    return {
      staleDays: days,
      threshold: threshold,
      basis: (absorption && absorption.ok) ? ('assorbimento zona ' + absorption.medianDays + 'g × 1.5') : 'soglia fissa 60g (zona senza campione)',
      why: 'privato fermo da ' + days + ' giorni (soglia ' + threshold + ')'
    };
  }

  /* ── LE VEDETTE ─────────────────────────────────────────────────────────
   * watcher: { enabled, criteria: { zones[], priceMin, priceMax, sqmMin,
   *            bedsMin, advertiser ('private'|'any'), dealsOnly, sources[] },
   *            channel: { telegram, email }, createdAt }
   *
   * Regole: un criterio dichiarato che l'annuncio non può dimostrare è un
   * NO (fail closed) — meglio un alert mancato che uno sbagliato. Un
   * annuncio nato PRIMA della vedetta non la fa mai scattare: chi crea una
   * ricerca vuole il futuro, non lo spam del magazzino (la lezione della
   * semina del Segugio, qui gratis per costruzione). */
  function watcherMatch(listing, watcher, f, opts) {
    var o = opts || {};
    if (!watcher || watcher.enabled === false) return { match: false, reason: 'vedetta spenta' };
    var cr = watcher.criteria || {};
    var why = [];

    var born = T(listing.firstSeenAt || listing.scrapedAt) || (o.nowMs != null ? o.nowMs : Date.now());
    var created = T(watcher.createdAt);
    if (created && born < created) return { match: false, reason: 'annuncio precedente alla vedetta' };

    if (Array.isArray(cr.zones) && cr.zones.length) {
      var z = MK.normalizeZone(listing.zone) || listing.zoneSlug || null;
      var hit = z && cr.zones.some(function (wz) { return zoneCompat(MK.normalizeZone(wz) || wz, z) > 0; });
      if (!hit) return { match: false, reason: z ? ('fuori zona (' + z + ')') : 'zona sconosciuta' };
      why.push('zona ' + (MK.normalizeZone(listing.zone) || listing.zoneSlug));
    }
    var p = num(listing.price);
    if (cr.priceMax != null && (p == null || p > num(cr.priceMax))) return { match: false, reason: 'sopra budget' };
    if (cr.priceMin != null && (p == null || p < num(cr.priceMin))) return { match: false, reason: 'sotto il minimo' };
    if (p != null) why.push('€' + Math.round(p));
    if (cr.sqmMin != null) {
      var q = num(listing.sqm);
      if (q == null || q < num(cr.sqmMin)) return { match: false, reason: q == null ? 'mq sconosciuti' : 'troppo piccolo' };
      why.push(q + ' mq');
    }
    if (cr.bedsMin != null) {
      var r = num(listing.bedrooms != null ? listing.bedrooms : listing.rooms);
      if (r == null || r < num(cr.bedsMin)) return { match: false, reason: r == null ? 'camere sconosciute' : 'poche camere' };
    }
    if (cr.advertiser === 'private' && listing.advertiser !== 'private') {
      return { match: false, reason: 'non è un privato' };
    }
    if (Array.isArray(cr.sources) && cr.sources.length && cr.sources.indexOf(listing.source) < 0) {
      return { match: false, reason: 'fonte esclusa' };
    }
    if (cr.dealsOnly) {
      if (!f || f.verdict !== 'occasione') return { match: false, reason: 'non è un\'occasione' };
      why.push('💎 occasione ' + f.score);
    } else if (f && f.verdict === 'occasione') {
      why.push('💎 occasione ' + f.score);
    }
    return { match: true, why: why };
  }

  /* La voce che finisce nella coda della vedetta (per il digest email).
   * Compatta ma leggibile: il digest la stampa così com'è. */
  var QUEUE_CAP = 30;
  function queueEntry(id, listing, f) {
    return {
      id: id,
      at: new Date().toISOString(),
      title: (listing.title || listing.address || 'Annuncio').slice(0, 120),
      zone: listing.zone || null,
      price: num(listing.price),
      sqm: num(listing.sqm),
      rooms: num(listing.bedrooms != null ? listing.bedrooms : listing.rooms),
      url: listing.sourceUrl || null,
      source: listing.source || null,
      verdict: f ? f.verdict : null,
      score: f ? f.score : null
    };
  }

  function queueUpsert(queue, entry) {
    var out = (queue || []).filter(function (e) { return e && e.id !== entry.id; });
    out.push(entry);
    return out.slice(-QUEUE_CAP);
  }

  /* Il digest sceglie dalla coda ciò che non è mai stato notificato, con un
   * tetto: 6 case per email (oltre è un catalogo, non un alert). */
  var DIGEST_CAP = 6;
  function digestPick(watcher, opts) {
    var o = opts || {};
    var cap = o.cap != null ? o.cap : DIGEST_CAP;
    var notified = {};
    (watcher.notifiedIds || []).forEach(function (id) { notified[id] = 1; });
    var fresh = (watcher.queue || []).filter(function (e) { return e && e.id && !notified[e.id]; });
    return { send: fresh.slice(0, cap), leftover: Math.max(0, fresh.length - cap) };
  }

  /* ── IL VALUTATORE ──────────────────────────────────────────────────────
   * valuta(subject, ctx) → la fascia di canone per {zone, sqm, rooms}.
   * ctx: { stats   (doc marketStats/<zona>),
   *        actives (righe marketListings della zona, per i comparabili),
   *        signed  ([{ rent, sqm }] dai contratti FIRMATI BOOM in zona) }
   *
   * Il CHIESTO viene dai quantili di zona; la CORREZIONE viene dal rapporto
   * chiesto→firmato misurato sui nostri contratti (il dato che Casafari non
   * ha). La correzione si applica solo con ≥3 firme in zona, si limita a
   * [-20%, +10%] (fuori da lì è un artefatto del campione, non un mercato)
   * e si DICHIARA sempre nel risultato. */
  var SIGNED_MIN_SAMPLE = 3;

  function valuta(subject, ctx) {
    var c = ctx || {};
    var sqm = num(subject && subject.sqm);
    if (sqm == null || sqm < 15 || sqm > 500) {
      return { ok: false, reason: 'mq mancanti o fuori scala (15–500)' };
    }
    var asked = c.stats && c.stats.asked;
    if (!asked || !asked.ok) {
      return { ok: false, reason: 'small_sample', detail: 'zona senza campione sufficiente di annunci attivi', sample: asked ? asked.sample : 0 };
    }

    var signedVals = (c.signed || [])
      .map(function (s) { return MK.eurSqm({ price: s.rent, sqm: s.sqm }); })
      .filter(function (v) { return v != null; })
      .sort(function (a, b) { return a - b; });
    var signedDelta = null, signedMedian = null;
    if (signedVals.length >= SIGNED_MIN_SAMPLE) {
      signedMedian = MK.percentile(signedVals, 0.5);
      var ratio = signedMedian / asked.medianEurSqm;
      signedDelta = Math.max(0.80, Math.min(1.10, ratio));
    }

    var k = signedDelta != null ? signedDelta : 1;
    var low = round10(asked.p25 * sqm * k);
    var point = round10(asked.medianEurSqm * sqm * k);
    var high = round10(asked.p75 * sqm * k);

    var compsRes = MK.compsFor(
      { zone: subject.zone, zoneSlug: MK.normalizeZone(subject.zone), sqm: sqm, rooms: subject.rooms },
      c.actives || [], { max: 6, nowMs: c.nowMs }
    );

    var confidence = (asked.sample >= 15 && signedDelta != null) ? 'alta'
      : (asked.sample >= 8 ? 'media' : 'bassa');

    var reasons = [
      'base: ' + asked.sample + ' annunci attivi in zona (mediana ' + asked.medianEurSqm + ' €/mq)'
    ];
    if (signedDelta != null) {
      reasons.push('corretto sui canoni FIRMATI BOOM in zona (' + signedVals.length + ' contratti, ' +
        (signedDelta < 1 ? '−' : '+') + Math.abs(Math.round((signedDelta - 1) * 100)) + '% sul chiesto)');
    } else {
      reasons.push('nessuna correzione sul firmato (' + signedVals.length + ' contratti in zona, minimo ' + SIGNED_MIN_SAMPLE + ')');
    }
    if (compsRes.lowSample) reasons.push('comparabili scarsi in zona: fascia da leggere con prudenza');

    return {
      ok: true,
      range: { low: low, point: point, high: high },
      eurSqm: { asked: asked.medianEurSqm, signed: signedMedian != null ? Math.round(signedMedian * 10) / 10 : null },
      signedDelta: signedDelta != null ? Math.round((signedDelta - 1) * 100) : null,
      signedSample: signedVals.length,
      askedSample: asked.sample,
      confidence: confidence,
      comps: compsRes.comps,
      reasons: reasons
    };
  }

  var API = {
    // zona
    ROME_ZONES: ROME_ZONES, inferZone: inferZone, normalizeZone: MK.normalizeZone,
    // impronta
    tokens: tokens, streetOf: streetOf, jaccard: jaccard, zoneCompat: zoneCompat,
    twinScore: twinScore, findTwin: findTwin, clusterInfo: clusterInfo,
    TWIN_THRESHOLD: TWIN_THRESHOLD, TWIN_THRESHOLD_SAME_SOURCE: TWIN_THRESHOLD_SAME_SOURCE,
    // indice
    indexEntry: indexEntry, indexUpsert: indexUpsert,
    INDEX_CAP: INDEX_CAP, INDEX_MAX_AGE_DAYS: INDEX_MAX_AGE_DAYS,
    // fiuto
    fiuto: fiuto, FIUTO: FIUTO, mandatoCheck: mandatoCheck,
    // vedette
    watcherMatch: watcherMatch, queueEntry: queueEntry, queueUpsert: queueUpsert,
    digestPick: digestPick, QUEUE_CAP: QUEUE_CAP, DIGEST_CAP: DIGEST_CAP,
    // valutatore
    valuta: valuta, SIGNED_MIN_SAMPLE: SIGNED_MIN_SAMPLE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_RADAR = API;
})(typeof window !== 'undefined' ? window : this);
