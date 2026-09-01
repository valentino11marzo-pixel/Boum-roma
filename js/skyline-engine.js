/* js/skyline-engine.js — LA CITTÀ DI NOTTE, in un motore puro.
 *
 * Lo Skyline 1.0 era MapLibre sopra lo stile "liberty" di OpenFreeMap:
 * una carta stradale CHIARA, pastello, generica — il chrome nero-oro di
 * BOOM galleggiava su una mappa che sembrava di un altro sito, e l'unico
 * modo di sfogliare le case era andare a caccia di pin. Il giudizio
 * dell'operatore («is a shit to be used») era giusto.
 *
 * Lo Skyline 2.0 è Roma di notte: la città è una base scura e quieta,
 * l'ORO è solo BOOM — i pin, i fili delle distanze, il palazzo della
 * casa selezionata. E le case si sfogliano da una pellicola di card in
 * basso, sincronizzata con la camera: la mappa segue le card, le card
 * seguono i pin.
 *
 * Qui vive tutto ciò che si può giudicare SENZA un browser:
 *
 *  · nightStyle(style)  — la rilettura notturna di uno stile
 *    OpenMapTiles (liberty): fondo, acqua, strade, verde, edifici,
 *    etichette. MAI un'eccezione: un layer che non capiamo resta com'è
 *    (meglio un dettaglio chiaro che una mappa morta). POI, civici,
 *    scudetti stradali: spenti — sono il rumore che l'1.0 lasciava.
 *  · la geometria: centroidi di zona, spread deterministico dei pin
 *    sovrapposti, archi (bezier), haversine, etichette distanza.
 *  · nearestAnchors — i fili: i TUOI posti sempre, le ancore di Roma
 *    fino a 6 linee totali (nove linee sono rumore, sei una storia).
 *  · laneFor — la corsia commerciale letta da dispo-engine (INIETTATO,
 *    mai ricopiato): closed non si prenota, una data illeggibile dice
 *    «Ask us», mai «Available now». La stessa onestà della vetrina.
 *  · fmtEuro deterministico (mai toLocaleString — la lezione ICU).
 *
 * window.BOOM_SKYLINE — UMD come boom-geo/dispo-engine/kiosk-engine.
 * Test: node tests/skyline/run.mjs
 */
(function (root) {
  'use strict';

  var ROME = [12.4924, 41.8902];

  /* ── LA NOTTE — la palette, una sola ─────────────────────────────────── */
  var NOTTE = {
    bg: '#0A0A0E', land: '#0C0C11', green: '#0D1210',
    water: '#0A1120', waterLine: '#152233',
    roadMinor: '#17171D', road: '#1F1F26', roadMajor: '#2B2B34',
    roadCase: '#08080C', rail: '#1B1B22', building: '#131318',
    boundary: '#26262E',
    labelMajor: '#D9D3C3', labelZone: '#B9AE8C', label: '#84848E',
    halo: '#08080A'
  };

  /* Il palazzo in 3D: bronzo notturno graduato sull'altezza; la casa
     selezionata (SOLO con pin `exact` — la sagoma d'oro non si spaccia,
     regola boom-geo) si accende via feature-state. */
  var EXTRUSION = {
    ramp: [0, '#17171D', 20, '#1D1C23', 45, '#24222A', 90, '#2C2A32', 150, '#383540'],
    lit: '#8F7327',
    opacity: 0.96
  };

  var SKY = {
    'sky-color': '#05060C', 'horizon-color': '#241E2E', 'fog-color': '#0B0B12',
    'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.55, 'fog-ground-blend': 0.4
  };

  var LIGHT = { anchor: 'viewport', color: '#FFE9B8', intensity: 0.25 };

  /* La camera: si parte alti e piatti, si SCENDE su Roma inclinandosi —
     l'arrivo in aereo, non un fitBounds secco. */
  var INTRO = {
    from: { center: ROME, zoom: 10.2, pitch: 0, bearing: 0 },
    to: { zoom: 12.6, pitch: 58, bearing: -14, duration: 3400 }
  };

  function cameraFor(co, i) {
    /* ogni selezione ruota di poco il punto di vista: la città respira */
    return {
      center: co, zoom: 15.3, pitch: 62,
      bearing: -14 + ((i || 0) % 5 - 2) * 7,
      duration: 1400
    };
  }

  /* ── nightStyle — la rilettura notturna, senza mai rompere la mappa ── */
  function nightStyle(style) {
    if (!style || !Array.isArray(style.layers)) return style;
    var s;
    try { s = JSON.parse(JSON.stringify(style)); } catch (e) { return style; }
    s.layers.forEach(function (L) {
      try {
        var id = String(L.id || '').toLowerCase();
        var t = L.type;
        var sl = String(L['source-layer'] || '').toLowerCase();
        L.paint = L.paint || {};
        L.layout = L.layout || {};
        if (t === 'background') { L.paint['background-color'] = NOTTE.bg; return; }
        if (t === 'symbol') {
          /* il rumore dell'1.0: icone POI, civici, scudetti, aeroporti */
          if (/poi|housenumber|aeroway|airport|oneway|ferry|shield|golf|_ref\b|station/.test(id)) {
            L.layout.visibility = 'none'; return;
          }
          L.paint['text-color'] =
            /country|state|city|town|capital/.test(id) ? NOTTE.labelMajor
              : /suburb|neighbourhood|neighborhood|quarter|village|hamlet/.test(id) ? NOTTE.labelZone
                : NOTTE.label;
          L.paint['text-halo-color'] = NOTTE.halo;
          L.paint['text-halo-width'] = 1.1;
          if ('icon-color' in L.paint) L.paint['icon-color'] = NOTTE.label;
          return;
        }
        /* i pattern raster resterebbero CHIARI sopra il colore nuovo */
        if (L.paint['fill-pattern']) delete L.paint['fill-pattern'];
        if (L.paint['line-pattern']) delete L.paint['line-pattern'];
        if (sl === 'water' || /water|ocean|river/.test(id)) {
          if (t === 'fill') L.paint['fill-color'] = NOTTE.water;
          if (t === 'line') L.paint['line-color'] = NOTTE.waterLine;
          return;
        }
        if (sl === 'transportation' || /road|street|highway|bridge|tunnel|path|track/.test(id)) {
          if (t === 'line') {
            L.paint['line-color'] =
              /casing|case/.test(id) ? NOTTE.roadCase
                : /motorway|trunk|primary/.test(id) ? NOTTE.roadMajor
                  : /secondary|tertiary/.test(id) ? NOTTE.road
                    : NOTTE.roadMinor;
          }
          if (t === 'fill') L.paint['fill-color'] = NOTTE.road;
          return;
        }
        if (sl === 'building') {
          if (t === 'fill') {
            L.paint['fill-color'] = NOTTE.building;
            L.paint['fill-opacity'] = 0.85;
          }
          if (t === 'line') L.paint['line-color'] = NOTTE.building;
          return;
        }
        if (sl === 'landcover' || sl === 'landuse' || sl === 'park' || /park|wood|grass|green/.test(id)) {
          if (t === 'fill') {
            L.paint['fill-color'] = /wood|grass|park|green|cemetery/.test(id + sl) ? NOTTE.green : NOTTE.land;
            L.paint['fill-opacity'] = 0.7;
          }
          if (t === 'line') L.paint['line-color'] = NOTTE.land;
          return;
        }
        if (sl === 'boundary' || /boundary|admin/.test(id)) {
          if (t === 'line') L.paint['line-color'] = NOTTE.boundary;
          return;
        }
        if (sl === 'transit' || /rail|transit/.test(id)) {
          if (t === 'line') L.paint['line-color'] = NOTTE.rail;
          return;
        }
        /* tutto il resto: si spegne verso il fondo, mai si nasconde */
        if (t === 'fill') L.paint['fill-color'] = NOTTE.land;
        if (t === 'line') L.paint['line-color'] = NOTTE.roadMinor;
      } catch (e) { /* un layer illeggibile resta com'è */ }
    });
    return s;
  }

  /* ── I QUARTIERI — centroidi per gli annunci senza coordinate ────────── */
  var ZONES = [
    [12.4735, 41.8986, 'centro storico', 'navona', 'coronari', 'ripetta', 'pantheon', 'spagna', 'trevi', 'campo de', 'farnese', 'centro'],
    [12.4692, 41.8867, 'trastevere', 'gianicolo'],
    [12.4924, 41.8946, 'monti', 'colosse', 'cavour'],
    [12.4632, 41.9100, 'prati', 'mazzini', 'angelico', 'vatican', 'ottaviano', 'cola di rienzo', 'lepanto'],
    [12.5380, 41.8880, 'pigneto', 'centocelle', 'casilina'],
    [12.4757, 41.8758, 'testaccio'],
    [12.4690, 41.8560, 'marconi', 'ostiense', 'garbatella', 'piramide', 'gazometro'],
    [12.5050, 41.9230, 'trieste', 'copped', 'africano', 'salario', 'nomentano'],
    [12.5151, 41.9000, 'san lorenzo', 'sapienza', 'verano'],
    [12.5010, 41.8950, 'esquilino', 'vittorio emanuele', 'manzoni'],
    [12.4760, 41.9230, 'flaminio'],
    [12.4680, 41.9380, 'ponte milvio', 'tor di quinto', 'foro italico'],
    [12.4880, 41.9230, 'parioli', 'villa ada'],
    [12.4900, 41.9070, 'veneto', 'ludovisi', 'barberini'],
    [12.5300, 41.9430, "conca d'oro", 'conca', 'jonio', 'annibaliano'],
    [12.5230, 41.9120, 'tiburtina', 'bologna', 'pietralata']
  ];
  function zoneCoord(l) {
    var z = (String((l && l.zone) || (l && l.neighborhood) || '') + ' '
      + String((l && l.address) || '')).toLowerCase();
    for (var i = 0; i < ZONES.length; i++) {
      var Z = ZONES[i];
      for (var k = 2; k < Z.length; k++) {
        if (z.indexOf(Z[k]) !== -1) return [Z[0], Z[1]];
      }
    }
    return null;
  }

  /* Lo spread è una FABBRICA: ogni chiamata a spreader() parte da zero,
     così due render della stessa lista mettono i pin negli stessi punti
     (deterministico), e i pin sullo stesso centroide non si coprono. */
  function spreader() {
    var seen = {};
    return function (co) {
      var key = co[0].toFixed(3) + ',' + co[1].toFixed(3);
      var n = seen[key] || 0; seen[key] = n + 1;
      if (n === 0) return co.slice();
      var ang = n * 2.39996323, rad = 0.0017 * Math.sqrt(n);
      return [co[0] + rad * Math.cos(ang), co[1] + rad * Math.sin(ang)];
    };
  }

  function haversine(a, b) {
    var R = 6371, r = Math.PI / 180;
    var dy = (b[1] - a[1]) * r, dx = (b[0] - a[0]) * r;
    var s = Math.pow(Math.sin(dy / 2), 2)
      + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.pow(Math.sin(dx / 2), 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function arc(a, b, bow, n) {
    n = n || 44;
    var pts = [], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var cx = mx - dy * bow, cy = my + dx * bow;
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0],
        u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
    }
    return pts;
  }

  /* onesta come sempre: linea d'aria + stima a piedi, mai un "percorso" */
  function distLabel(km) {
    return km < 2.6 ? Math.round(km / 4.8 * 60) + '′ walk'
      : (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km';
  }

  /* ── LE ANCORE DI ROMA ───────────────────────────────────────────────── */
  var ANCHORS = [
    [12.5018, 41.9009, 'Termini', 'metro'],
    [12.4924, 41.8902, 'Colosseo', 'colosseo'],
    [12.4534, 41.9022, 'Vaticano', 'vaticano'],
    [12.4690, 41.8870, 'Trastevere', 'trastevere'],
    [12.5135, 41.9038, 'Sapienza', 'sapienza'],
    [12.4917, 41.9269, 'LUISS', 'uni'],
    [12.4790, 41.8564, 'Roma Tre', 'uni'],
    [12.4664, 41.8937, 'John Cabot', 'uni'],
    [12.4593, 41.9032, 'LUMSA', 'uni']
  ];
  var ANCHOR_ICON = { metro: '🚇', colosseo: '🏛', vaticano: '⛪', trastevere: '🍷', sapienza: '🎓', uni: '🎓' };

  /* I fili: i TUOI posti si collegano SEMPRE (sono il motivo per cui li
     hai salvati); le ancore di Roma riempiono fino a `max` linee totali. */
  function nearestAnchors(co, myPlaces, max) {
    max = max || 6;
    var mie = (myPlaces || []).map(function (p) {
      return { kind: 'mine', p: p, d: haversine(co, [p.lng, p.lat]) };
    });
    var slots = Math.max(2, max - mie.length);
    var rome = ANCHORS.map(function (A, i) {
      return { kind: 'anchor', i: i, A: A, d: haversine(co, [A[0], A[1]]) };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, slots);
    return { mine: mie, anchors: rome };
  }

  /* ── la corsia commerciale, letta dal motore condiviso ───────────────── */
  function laneFor(l, dispo, today) {
    var d = dispo || (root && root.BOOM_DISPO);
    if (!d || !d.marketLane) return null;     /* senza motore non si indovina */
    var m = d.marketLane({
      status: l && l.status,
      availableFrom: l && l.availableFrom,
      availableDate: l && l.availableDate
    }, today);
    var copy = d.laneCopy(m, 'en', today);
    return { lane: m.lane, bookable: m.bookable, badge: copy.short, tone: copy.tone, iso: m.iso };
  }

  /* deterministico: '€1,500' su qualsiasi runtime (la lezione ICU) */
  function fmtEuro(n) {
    n = Math.round(Number(n) || 0);
    return '€' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  var API = {
    ROME: ROME,
    NOTTE: NOTTE,
    EXTRUSION: EXTRUSION,
    SKY: SKY,
    LIGHT: LIGHT,
    INTRO: INTRO,
    ZONES: ZONES,
    ANCHORS: ANCHORS,
    ANCHOR_ICON: ANCHOR_ICON,
    nightStyle: nightStyle,
    cameraFor: cameraFor,
    zoneCoord: zoneCoord,
    spreader: spreader,
    haversine: haversine,
    arc: arc,
    distLabel: distLabel,
    nearestAnchors: nearestAnchors,
    laneFor: laneFor,
    fmtEuro: fmtEuro
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SKYLINE = API;
})(typeof window !== 'undefined' ? window : this);
