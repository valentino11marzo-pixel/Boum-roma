/* BOOM_TEMPI — il motore PURO dei tempi porta-a-porta.
 *
 * La vetrina prometteva minuti calcolati sulla linea d'aria (km × 4.2 + 10):
 * sbagliati a caso, perché Roma è anisotropa — lungo la metro A voli, in
 * trasversale no. I tempi VERI li calcola il Pendolare (api/ops/gtfs-tempi.js)
 * sul GTFS statico di Roma Mobilità: grafo a frequenze, Dijkstra dalle mete,
 * griglia ~300 m sulla città, scritta nel doc Firestore `publicGeo/tempi-roma`
 * (lettura pubblica). Qui vive solo la LETTURA: nessun fetch, nessun DOM —
 * si testa in node, e lo importano sia le pagine (UMD) sia il builder (ESM).
 *
 * La regola dura: dove la griglia non copre si risponde null, MAI un numero
 * inventato — il chiamante degrada alla stima di prima, dichiarata come tale.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_TEMPI = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* le mete: UNA copia sola — builder, scheda (/listing) e skyline leggono
     da qui. `slug` è la chiave della griglia; le coordinate le usa SOLO il
     builder (le pagine cercano col punto della CASA, non della meta). */
  var METE = [
    { slug: 'termini',    nome: 'Termini',    lat: 41.9009, lng: 12.5018 },
    { slug: 'colosseo',   nome: 'Colosseo',   lat: 41.8902, lng: 12.4924 },
    { slug: 'vaticano',   nome: 'Vatican',    lat: 41.9022, lng: 12.4534 },
    { slug: 'trastevere', nome: 'Trastevere', lat: 41.8870, lng: 12.4690 },
    { slug: 'sapienza',   nome: 'Sapienza',   lat: 41.9038, lng: 12.5135 },
    { slug: 'luiss',      nome: 'LUISS',      lat: 41.9269, lng: 12.4917 },
    { slug: 'romatre',    nome: 'Roma Tre',   lat: 41.8564, lng: 12.4790 },
    { slug: 'johncabot',  nome: 'John Cabot', lat: 41.8937, lng: 12.4664 },
    { slug: 'lumsa',      nome: 'LUMSA',      lat: 41.9032, lng: 12.4593 }
  ];

  /* la codifica: un carattere per cella, minuti 0–89 → chr(48+m)
     '!' = nessun verdetto (fuori dall'intervallo per costruzione). Oltre 89
     minuti non è un pendolarismo che vale la pena stampare. */
  var NA = '!';   /* 33: FUORI da 48..137, mai in collisione coi minuti
                     (la prima stesura usava '~' = 126 = minuto 78: il test
                     di identità l'ha preso subito) */
  var CAP = 89;

  function codifica(min) {
    if (min == null || !isFinite(min)) return NA;
    var v = Math.round(min);
    if (v < 0 || v > CAP) return NA;
    return String.fromCharCode(48 + v);
  }
  function decodifica(ch) {
    if (!ch || ch === NA) return null;
    var v = ch.charCodeAt(0) - 48;
    return (v >= 0 && v <= CAP) ? v : null;
  }

  /* meta = { lat0, lng0, dLat, dLng, righe, colonne } — la geometria vive
     NEL DOC, non qui: il builder può stringere o allargare la griglia senza
     toccare le pagine. */
  function cella(meta, lat, lng) {
    if (!meta || !meta.dLat || !meta.dLng) return -1;
    var r = Math.floor((lat - meta.lat0) / meta.dLat);
    var c = Math.floor((lng - meta.lng0) / meta.dLng);
    if (r < 0 || c < 0 || r >= meta.righe || c >= meta.colonne) return -1;
    return r * meta.colonne + c;
  }

  /* dati = { meta:{…}, griglie:{ slug: stringa } } → { slug: minuti } o
     null quando il punto è fuori griglia / la cella non ha verdetto. */
  function verso(dati, lat, lng) {
    if (!dati || !dati.meta || !dati.griglie) return null;
    if (typeof lat !== 'number' || typeof lng !== 'number'
        || !isFinite(lat) || !isFinite(lng)) return null;
    var i = cella(dati.meta, lat, lng);
    if (i < 0) return null;
    var out = null;
    for (var k = 0; k < METE.length; k++) {
      var g = dati.griglie[METE[k].slug];
      if (!g || i >= g.length) continue;
      var v = decodifica(g.charAt(i));
      if (v == null) continue;
      if (!out) out = {};
      out[METE[k].slug] = v;
    }
    return out;
  }

  function eta(dati, lat, lng, slug) {
    var v = verso(dati, lat, lng);
    return (v && slug in v) ? v[slug] : null;
  }

  /* il doc Firestore REST → dati piani. Le pagine lo chiamano sul JSON
     grezzo di publicGeo/tempi-roma; niente SDK, niente dipendenze. */
  function daDoc(doc) {
    try {
      var f = doc && doc.fields; if (!f) return null;
      function mappa(k) {
        var m = f[k] && f[k].mapValue && f[k].mapValue.fields;
        if (!m) return null;
        var out = {};
        Object.keys(m).forEach(function (kk) {
          var v = m[kk];
          out[kk] = v.stringValue != null ? v.stringValue
            : v.integerValue != null ? +v.integerValue
            : v.doubleValue != null ? v.doubleValue : null;
        });
        return out;
      }
      var meta = mappa('meta'), griglie = mappa('griglie');
      if (!meta || !griglie) return null;
      return { meta: meta, griglie: griglie };
    } catch (e) { return null; }
  }

  return { METE: METE, NA: NA, CAP: CAP,
    codifica: codifica, decodifica: decodifica, cella: cella,
    verso: verso, eta: eta, daDoc: daDoc };
}));
