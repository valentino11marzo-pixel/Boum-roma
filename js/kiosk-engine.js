/* js/kiosk-engine.js — LE RIGHE DEL TABELLONE, in un motore puro.
 *
 * /board è il tabellone Solari da vetrina: cinque colonne a palette che
 * girano come a Fiumicino. Fino ad agosto 2026 le righe erano SOLO una
 * fotografia di build (costruisci-kiosk.py) con tre difetti che nessuno
 * poteva vedere finché non passava davanti alla vetrina:
 *
 *   1. il rullo (DRUM) non conosceva l'apostrofo: su "CONCA D'ORO" la
 *      cella non trovava il glifo e restava MUTA — un buco nero nel nome;
 *   2. la zona si troncava a metà parola ("VITTORIO VENE", "CENTRO
 *      STORIC") — un tabellone vero ABBREVIA, non mozza;
 *   3. il prezzo si tagliava a 6 caratteri: €10,000 diventava "€10,00",
 *      cioè un NUMERO DIVERSO stampato in vetrina.
 *
 * Qui vive tutta la grammatica delle righe — cosa entra, come si scrive,
 * cosa NON si promette — così la pagina la usa per l'aggiornamento vivo
 * (idrante: Firestore REST, lettura pubblica), il builder python la
 * rispecchia per la fotografia, e i test la mordono senza browser.
 *
 * LE REGOLE DURE (pinnate in tests/kiosk/run.mjs):
 *   · ogni carattere emesso ESISTE nel rullo — mai una cella muta;
 *   · la corsia la decide BOOM_DISPO.marketLane (regole A–D di
 *     dispo-engine): `closed` non sale sul tabellone, una data
 *     illeggibile scrive ASK e MAI NOW, una `rented` si mostra col
 *     rilascio solo se lo dice il CONTRATTO (availableFrom);
 *   · senza il motore dispo non si indovina: righe vuote, resta la build;
 *   · i numeri sono DETERMINISTICI (mai toLocaleString: la lezione
 *     dell'ICU ridotta pagata su /executive) e mai corrotti in silenzio.
 *
 * window.BOOM_KIOSK — UMD come boom-geo/dispo-engine.
 */
(function (root) {
  'use strict';

  /* Il rullo: ogni glifo che il tabellone sa stampare. L'apostrofo e il
     trattino ci sono per i nomi veri di Roma (Conca d'Oro, Tor de'
     Schiavi). Cambiarlo qui NON basta: la pagina dichiara il suo — i test
     pretendono che i due siano identici. */
  var DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789€.,:·+/'-";

  /* Le larghezze fisiche delle colonne (in celle). Sono il contratto col
     layout: tutto ciò che esce da qui DEVE starci dentro. */
  var W = { ora: 5, zona: 13, tipo: 3, prezzo: 6, stato: 5 };

  var NUOVA_GIORNI = 21;                    /* come il builder: NEW < 21g */
  var MESI = ['JAN','FEB','MAR','APR','MAY','JUN',
              'JUL','AUG','SEP','OCT','NOV','DEC'];

  /* Le abbreviazioni che un tabellone vero userebbe. Solo dove la regola
     generale (iniziale puntata della prima parola) suonerebbe peggio. */
  var ABBREV = { 'CENTRO STORICO': 'CENTRO' };

  /* ── la pulizia: maiuscole, accenti sciolti, MAI un glifo fuori rullo ── */
  function pulisci(s) {
    var t = String(s == null ? '' : s).toUpperCase();
    /* CITTÀ → CITTA: l'accento si scioglie, non si butta la lettera */
    try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    catch (e) { /* runtime senza normalize: si filtra e basta */ }
    var out = '';
    for (var i = 0; i < t.length; i++) {
      out += DRUM.indexOf(t.charAt(i)) >= 0 ? t.charAt(i) : ' ';
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  /* ── la zona: si ABBREVIA, mai mozzata a metà parola ─────────────────── */
  function zonaCorta(z) {
    var t = pulisci(String(z == null ? '' : z).split('/')[0]);
    if (!t) return 'ROMA';
    if (t.length <= W.zona) return t;
    if (ABBREV[t]) return ABBREV[t];
    var parole = t.split(' ');
    if (parole.length > 1) {
      /* VITTORIO VENETO → V. VENETO: la prima parola si punta */
      var punta = parole[0].charAt(0) + '. ' + parole.slice(1).join(' ');
      if (punta.length <= W.zona) return punta;
    }
    /* ancora lunga: cadono le parole in coda, mai le lettere */
    while (parole.length > 1 && parole.join(' ').length > W.zona) parole.pop();
    var r = parole.join(' ');
    return r.length <= W.zona ? r : r.slice(0, W.zona);
  }

  /* ── il prezzo: deterministico, e MAI un numero diverso dal vero ─────── */
  function prezzoCorto(n) {
    n = Math.round(n);
    var s = '€' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (s.length > W.prezzo) s = '€' + String(n);       /* €12500          */
    if (s.length > W.prezzo) s = '€' + Math.round(n / 1000) + 'K';
    if (s.length > W.prezzo) s = '€' + Math.round(n / 1e6) + 'M';
    return s;
  }

  /* ── la colonna Free: 1SEP, 31JAN … oppure ASK — mai una bugia ───────── */
  function dataCorta(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return 'ASK';
    var m = +String(iso).slice(5, 7), g = +String(iso).slice(8, 10);
    if (!(m >= 1 && m <= 12)) return 'ASK';
    return String(g) + MESI[m - 1];
  }

  function letti(x) {
    var m = /\d+/.exec(String(x == null ? '' : x));
    return m ? parseInt(m[0], 10) : null;
  }

  /* ── UNA riga del tabellone da un annuncio ────────────────────────────
   * Ritorna null quando l'annuncio non deve salire (corsia closed, prezzo
   * assente): un tabellone che mostra una casa fuori mercato genera
   * telefonate da rifiutare. Il giudizio sulla corsia è TUTTO di
   * dispo-engine — qui si traduce soltanto in cinque colonne. */
  function riga(l, opts) {
    l = l || {}; opts = opts || {};
    var dispo = opts.dispo
      || (typeof root !== 'undefined' && root ? root.BOOM_DISPO : null);
    if (!dispo || !dispo.marketLane) return null;   /* senza motore non si indovina */

    var corsia = dispo.marketLane({
      status: l.status,
      availableFrom: l.availableFrom,
      availableDate: l.availableDate
    }, opts.oggi);
    if (!corsia || corsia.lane === 'closed') return null;

    var p = parseFloat(String(l.price == null ? '' : l.price)
      .replace(/[^\d.]/g, ''));
    if (!isFinite(p) || p <= 0) return null;

    var n = letti(l.beds != null && l.beds !== '' ? l.beds : l.bedrooms);
    var adesso = opts.oggi ? +new Date(opts.oggi) : Date.now();
    var fresca = !!(l.createdMs
      && (adesso - l.createdMs) < NUOVA_GIORNI * 864e5);

    /* la regola 1 di dispo, sul tabellone: illeggibile → ASK, mai NOW */
    var ora = corsia.lane === 'now'
      ? (corsia.dateUnreadable ? 'ASK' : 'NOW')
      : dataCorta(corsia.iso);

    return {
      ora: ora.slice(0, W.ora),
      zona: zonaCorta(l.zone != null && l.zone !== '' ? l.zone : l.zona),
      tipo: n === 0 ? 'STU' : (n ? (n > 9 ? '9BR' : n + 'BR') : 'FLT'),
      prezzo: prezzoCorto(p),
      stato: corsia.lane === 'ahead' ? 'LIST' : (fresca ? 'NEW' : 'FREE'),
      /* NON è una colonna del tabellone: è la porta — la riga cliccata
         apre /listing/<id>. Vuoto quando l'annuncio non ha un id. */
      id: String(l.id == null ? '' : l.id)
    };
  }

  /* ── la lettura del REST di Firestore (la stessa dell'idrante) ───────── */
  function campo(f, k) {
    var x = f && f[k];
    if (!x) return null;
    return x.stringValue != null ? x.stringValue
      : x.integerValue != null ? x.integerValue
      : x.doubleValue != null ? x.doubleValue : null;
  }

  /* documents → righe pronte, le più recenti in testa (come il builder). */
  function daFirestore(documents, opts) {
    if (!documents || !documents.length) return [];
    var righe = [];
    for (var i = 0; i < documents.length; i++) {
      var doc = documents[i] || {};
      var f = doc.fields || {};
      var creata = Date.parse(doc.createTime || '') || 0;
      var r = riga({
        id: String(doc.name || '').split('/').pop(),
        status: campo(f, 'status'),
        availableFrom: campo(f, 'availableFrom'),
        availableDate: campo(f, 'availableDate'),
        price: campo(f, 'price'),
        beds: campo(f, 'beds'),
        bedrooms: campo(f, 'bedrooms'),
        zone: campo(f, 'zone'),
        zona: campo(f, 'zona'),
        createdMs: creata
      }, opts);
      if (r) { r._t = creata; righe.push(r); }
    }
    righe.sort(function (a, b) { return b._t - a._t; });
    for (var k = 0; k < righe.length; k++) delete righe[k]._t;
    return righe;
  }

  var API = {
    DRUM: DRUM,
    W: W,
    NUOVA_GIORNI: NUOVA_GIORNI,
    ABBREV: ABBREV,
    pulisci: pulisci,
    zonaCorta: zonaCorta,
    prezzoCorto: prezzoCorto,
    dataCorta: dataCorta,
    letti: letti,
    riga: riga,
    campo: campo,
    daFirestore: daFirestore
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_KIOSK = API;
})(typeof window !== 'undefined' ? window : this);
