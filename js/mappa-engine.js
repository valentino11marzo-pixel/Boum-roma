/* BOOM_MAPPA — il cervello della mappa, in una copia sola.
 *
 * IL REPERTO. Skyline e la scheda dell'annuncio disegnavano DUE mappe
 * diverse per lo stesso mestiere: stessa libreria (maplibre 4.7.1), stesso
 * stile (openfreemap liberty), stessi palazzi 3D, due volte. E soprattutto
 * TRE elenchi di mete mantenuti a mano — skyline, la scheda e il motore
 * dei tempi — che erano gia' divergenti: la scheda non conosceva LUMSA.
 * Tre liste della stessa cosa non restano allineate: si allineano una
 * volta e poi si dimenticano.
 *
 * Qui vive il GIUDIZIO, non il disegno: le mete, la distanza, il tempo col
 * suo GRADO DI VERITA', i posti dell'utente e il filtro per minuti. Niente
 * DOM e niente rete — si prova in node, e lo leggono sia le pagine (UMD)
 * sia i test (ESM).
 *
 * LA REGOLA CHE TIENE IN PIEDI TUTTO: nessun numero esce senza dire da
 * dove viene. `vero` = misurato dal Pendolare sul GTFS di Roma Mobilita';
 * `stima` = aritmetica sulla linea d'aria, e allora si stampa con la ≈.
 * Un minuto stimato spacciato per misurato e' la bugia che il cliente
 * scopre col trasloco gia' fatto.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_MAPPA = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── LE METE: una copia sola ──────────────────────────────────────────
     `slug` e' la chiave della griglia dei tempi (js/tempi-engine.js): i due
     elenchi DEVONO combaciare, e il test lo pretende invece di sperarlo. */
  var METE = [
    { slug: 'termini',    nome: 'Termini',    che: 'Trains + Metro A/B',   lat: 41.9009, lng: 12.5018, tipo: 'nodo' },
    { slug: 'colosseo',   nome: 'Colosseo',   che: 'The ancient centre',   lat: 41.8902, lng: 12.4924, tipo: 'segno' },
    { slug: 'vaticano',   nome: 'Vatican',    che: "St Peter's & museums", lat: 41.9022, lng: 12.4534, tipo: 'segno' },
    { slug: 'trastevere', nome: 'Trastevere', che: 'Nightlife + station',  lat: 41.8870, lng: 12.4690, tipo: 'segno' },
    { slug: 'sapienza',   nome: 'Sapienza',   che: 'Main campus',          lat: 41.9038, lng: 12.5135, tipo: 'ateneo' },
    { slug: 'luiss',      nome: 'LUISS',      che: 'Viale Romania campus', lat: 41.9269, lng: 12.4917, tipo: 'ateneo' },
    { slug: 'romatre',    nome: 'Roma Tre',   che: 'Ostiense campus',      lat: 41.8564, lng: 12.4790, tipo: 'ateneo' },
    { slug: 'johncabot',  nome: 'John Cabot', che: 'Trastevere campus',    lat: 41.8937, lng: 12.4664, tipo: 'ateneo' },
    { slug: 'lumsa',      nome: 'LUMSA',      che: 'Borgo campus',         lat: 41.9032, lng: 12.4593, tipo: 'ateneo' }
  ];

  /* ── la geometria ─────────────────────────────────────────────────── */
  function km(lat1, lng1, lat2, lng2) {
    var R = 6371, r = Math.PI / 180;
    var dy = (lat2 - lat1) * r, dx = (lng2 - lng1) * r;
    var s = Math.sin(dy / 2) * Math.sin(dy / 2)
      + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dx / 2) * Math.sin(dx / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* Il passo urbano vero, non quello da manuale: 4,8 km/h e' la velocita'
     che il Pendolare usa nel grafo — qui si resta uguali, perche' due
     numeri diversi per la stessa camminata sono due risposte diverse alla
     stessa domanda. */
  var KMH_PIEDI = 4.8;
  function minPiedi(d) { return Math.round(d / KMH_PIEDI * 60); }

  /* La stima, quando la griglia non copre. NON e' una previsione: e' un
     ordine di grandezza, e infatti si stampa sempre con la ≈. */
  function minStima(d) { return Math.round(d * 4.2 + 10); }

  /* ── IL TEMPO COL SUO GRADO DI VERITA' ────────────────────────────────
     Ritorna SEMPRE {min, fonte, testo}. `fonte`:
       'piedi' — si va a piedi, e il numero e' aritmetica onesta
       'rete'  — misurato dal Pendolare sulla rete e sugli orari veri
       'stima' — linea d'aria, dichiarata con la ≈
     Il chiamante non deve mai decidere da solo come chiamare un numero. */
  var SOGLIA_PIEDI_KM = 2.6;
  function tempo(d, veroMin) {
    if (!isFinite(d) || d < 0) return null;
    if (d < SOGLIA_PIEDI_KM) {
      var p = minPiedi(d);
      return { min: p, fonte: 'piedi', testo: p + "′ walk" };
    }
    if (veroMin != null && isFinite(veroMin)) {
      return { min: Math.round(veroMin), fonte: 'rete', testo: Math.round(veroMin) + "′" };
    }
    var s = minStima(d);
    return { min: s, fonte: 'stima', testo: '≈' + s + "′" };
  }

  /* ── le mete piu' vicine a una porta, gia' ordinate e gia' etichettate.
     `leggiEta(slug)` la passa il chiamante: e' l'unico punto in cui entra
     la griglia del Pendolare, cosi' questo file resta puro. */
  function vicine(lat, lng, opzioni) {
    var o = opzioni || {};
    var quante = o.quante || 6;
    var leggiEta = typeof o.leggiEta === 'function' ? o.leggiEta : function () { return null; };
    var lista = (o.mete || METE).map(function (m) {
      var d = km(lat, lng, m.lat, m.lng);
      return { meta: m, km: d, tempo: tempo(d, leggiEta(m.slug)) };
    });
    lista.sort(function (a, b) {
      /* si ordina per TEMPO quando c'e', per distanza quando non c'e':
         ordinare per km una lista di minuti metterebbe in cima la meta
         piu' vicina in linea d'aria e non quella che si raggiunge prima —
         che a Roma sono spesso due posti diversi. */
      var ta = a.tempo ? a.tempo.min : Infinity, tb = b.tempo ? b.tempo.min : Infinity;
      return ta - tb || a.km - b.km;
    });
    return lista.slice(0, quante);
  }

  /* ── I POSTI DELL'UTENTE ──────────────────────────────────────────────
     Una chiave sola per tutto il sito: chi salva il proprio ufficio sulla
     scheda lo ritrova sullo Skyline. `spazio` si inietta nei test; nel
     browser Safari privato LANCIA su localStorage, quindi si avvolge. */
  var CHIAVE = 'boom:pois';
  var MAX_POSTI = 4;

  function magazzino(spazio) {
    if (spazio) return spazio;
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; }
    catch (e) { return null; }
  }
  function posti(spazio) {
    var s = magazzino(spazio); if (!s) return [];
    try {
      var a = JSON.parse(s.getItem(CHIAVE) || '[]');
      return Array.isArray(a) ? a.filter(function (p) {
        return p && typeof p.name === 'string'
          && isFinite(p.lat) && isFinite(p.lng);
      }).slice(0, MAX_POSTI) : [];
    } catch (e) { return []; }
  }
  function salvaPosto(p, spazio) {
    var s = magazzino(spazio); if (!s || !p || !p.name) return posti(spazio);
    if (!isFinite(p.lat) || !isFinite(p.lng)) return posti(spazio);
    var a = posti(spazio);
    var nome = String(p.name).trim();
    /* stesso nome = stesso posto: si aggiorna, non si duplica */
    a = a.filter(function (x) { return x.name.toLowerCase() !== nome.toLowerCase(); });
    a.unshift({ name: nome, lat: +p.lat, lng: +p.lng });
    a = a.slice(0, MAX_POSTI);
    try { s.setItem(CHIAVE, JSON.stringify(a)); } catch (e) {}
    return a;
  }
  function togliPosto(i, spazio) {
    var s = magazzino(spazio); if (!s) return [];
    var a = posti(spazio); a.splice(i, 1);
    try { s.setItem(CHIAVE, JSON.stringify(a)); } catch (e) {}
    return a;
  }

  /* ── IL FILTRO PER MINUTI ─────────────────────────────────────────────
     «Mostrami solo le case a ≤20′ da Sapienza». E' la domanda che chi si
     trasferisce si fa davvero, e nessun portale la sa rispondere: mostrano
     un raggio in km, che a Roma non vuol dire niente.
     Regola dura: una casa il cui tempo e' una STIMA non entra in un filtro
     che parla di minuti — o il filtro diventa una promessa che non
     reggiamo. Si dichiara quante ne restano fuori per questo motivo. */
  function filtroTempo(case_, slug, maxMin, leggiEta) {
    var dentro = [], fuori = [], incerte = [];
    var meta = null;
    for (var k = 0; k < METE.length; k++) if (METE[k].slug === slug) meta = METE[k];
    if (!meta || !isFinite(maxMin)) return { dentro: case_ || [], fuori: [], incerte: [] };
    (case_ || []).forEach(function (c) {
      if (!isFinite(c.lat) || !isFinite(c.lng)) { incerte.push(c); return; }
      var d = km(c.lat, c.lng, meta.lat, meta.lng);
      var t = tempo(d, leggiEta ? leggiEta(c, meta.slug) : null);
      if (!t) { incerte.push(c); return; }
      if (t.fonte === 'stima') { incerte.push(c); return; }
      (t.min <= maxMin ? dentro : fuori).push(c);
    });
    return { dentro: dentro, fuori: fuori, incerte: incerte };
  }

  return {
    METE: METE, CHIAVE: CHIAVE, MAX_POSTI: MAX_POSTI,
    KMH_PIEDI: KMH_PIEDI, SOGLIA_PIEDI_KM: SOGLIA_PIEDI_KM,
    km: km, minPiedi: minPiedi, minStima: minStima, tempo: tempo,
    vicine: vicine, posti: posti, salvaPosto: salvaPosto,
    togliPosto: togliPosto, filtroTempo: filtroTempo
  };
}));
