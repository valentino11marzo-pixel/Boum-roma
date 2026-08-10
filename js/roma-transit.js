/* js/roma-transit.js — IL CITY PACK DI ROMA per il motore del tempo.
 *
 * Per anni le pagine hanno mostrato "≈ km×4.2+10 min door-to-door": un numero
 * inventato, sbagliato a caso, perché Roma è anisotropa — lungo la metro A
 * voli, in trasversale no (era il difetto documentato in CLAUDE.md, "Ancora
 * falso"). Questo file è la risposta: la rete VERA su cui una vita romana si
 * muove, descritta come dati puri. Il motore (js/tempo-engine.js) non sa
 * nulla di Roma: legge QUALSIASI pack con questo schema, quindi Milano,
 * Lisbona o Parigi sono "solo" un altro file come questo.
 *
 * SCHEMA UNIVERSALE (window.<CITY>_TRANSIT.PACK):
 *   city, version
 *   walking   { speedKmh, detour, maxAccessKm, accessMin, egressMin, autoLinkKm }
 *   transfer  { sameStationMin, station:{<id>:min} }   — cambi dentro la stazione
 *   lines[]   { id, name, short, kind(metro|tram|rail|express), color,
 *               speedKmh, headwayMin, dwellMin, sampled?, notice?,
 *               stops:[[id,label,lat,lng], …] in ordine di percorrenza }
 *   links[]   [stA, stB, walkMin]  — corrispondenze a piedi tra stazioni diverse
 *   anchors[] { id, label, emoji, kind(uni|work|hub|icon|life|travel),
 *               lat, lng, perWeek }  — i punti di una vita, per le UI
 *   service   { …note di esercizio }     notices[] { …avvisi onesti }
 *
 * REGOLE DI ONESTÀ (le stesse di boom-geo):
 *   - stazioni condivise tra linee = stesso id (l'interscambio nasce dai dati);
 *   - linee `sampled:true` elencano le fermate PRINCIPALI (stima, mai orario);
 *   - lo stato reale del servizio sta scritto qui (Metro C fino a Colosseo dal
 *     16/12/2025; rete tram in bus sostitutivo ago→nov 2026), non nel codice.
 *
 * Coordinate: centro fermata, precisione da stima (±100–300 m) — coerente con
 * un modello che dichiara sempre "≈". Fonti: rete ATAC/Trenitalia, apertura
 * Metro C Colosseo–Porta Metronia (Roma Servizi per la Mobilità, dic 2025),
 * stato rete tram 2026 (Roma Servizi per la Mobilità, ago 2026).
 */
(function (root) {
  'use strict';

  var PACK = {
    city: 'Roma',
    version: '2026-08',

    walking: { speedKmh: 4.6, detour: 1.3, maxAccessKm: 1.7, accessMin: 2, egressMin: 1, autoLinkKm: 0.26 },
    transfer: {
      sameStationMin: 2,
      /* i cambi che nella realtà sono corridoi lunghi */
      station: { termini: 5, tiburtina: 5, 'san-giovanni': 3, colosseo: 3, 'valle-aurelia': 3, ostiense: 3 }
    },

    lines: [
      { id: 'MA', name: 'Metro A', short: 'A', kind: 'metro', color: '#FF7314', speedKmh: 30, headwayMin: 4, dwellMin: 0.4, stops: [
        ['battistini', 'Battistini', 41.9057, 12.4155],
        ['cornelia', 'Cornelia', 41.9022, 12.4276],
        ['baldo-degli-ubaldi', 'Baldo degli Ubaldi', 41.8993, 12.4341],
        ['valle-aurelia', 'Valle Aurelia', 41.9033, 12.4415],
        ['cipro', 'Cipro', 41.9077, 12.4471],
        ['ottaviano', 'Ottaviano', 41.9098, 12.4585],
        ['lepanto', 'Lepanto', 41.9095, 12.4666],
        ['flaminio', 'Flaminio', 41.9111, 12.4763],
        ['spagna', 'Spagna', 41.9066, 12.4830],
        ['barberini', 'Barberini', 41.9038, 12.4886],
        ['repubblica', 'Repubblica', 41.9027, 12.4959],
        ['termini', 'Termini', 41.9009, 12.5018],
        ['vittorio-emanuele', 'Vittorio Emanuele', 41.8938, 12.5045],
        ['manzoni', 'Manzoni', 41.8896, 12.5077],
        ['san-giovanni', 'San Giovanni', 41.8860, 12.5090],
        ['re-di-roma', 'Re di Roma', 41.8817, 12.5145],
        ['ponte-lungo', 'Ponte Lungo', 41.8776, 12.5197],
        ['furio-camillo', 'Furio Camillo', 41.8745, 12.5238],
        ['colli-albani', 'Colli Albani', 41.8710, 12.5289],
        ['arco-di-travertino', 'Arco di Travertino', 41.8665, 12.5341],
        ['porta-furba', 'Porta Furba', 41.8626, 12.5410],
        ['numidio-quadrato', 'Numidio Quadrato', 41.8598, 12.5470],
        ['lucio-sestio', 'Lucio Sestio', 41.8570, 12.5533],
        ['giulio-agricola', 'Giulio Agricola', 41.8546, 12.5591],
        ['subaugusta', 'Subaugusta', 41.8523, 12.5651],
        ['cinecitta', 'Cinecittà', 41.8496, 12.5716],
        ['anagnina', 'Anagnina', 41.8413, 12.5834]
      ] },

      { id: 'MB', name: 'Metro B', short: 'B', kind: 'metro', color: '#2E7DDB', speedKmh: 30, headwayMin: 5, dwellMin: 0.4, stops: [
        ['laurentina', 'Laurentina', 41.8262, 12.4680],
        ['eur-fermi', 'EUR Fermi', 41.8320, 12.4700],
        ['eur-palasport', 'EUR Palasport', 41.8390, 12.4720],
        ['eur-magliana', 'EUR Magliana', 41.8474, 12.4661],
        ['marconi', 'Marconi', 41.8567, 12.4713],
        ['basilica-san-paolo', 'Basilica San Paolo', 41.8608, 12.4787],
        ['garbatella', 'Garbatella', 41.8672, 12.4830],
        ['piramide', 'Piramide', 41.8757, 12.4820],
        ['circo-massimo', 'Circo Massimo', 41.8807, 12.4885],
        ['colosseo', 'Colosseo', 41.8905, 12.4931],
        ['cavour', 'Cavour', 41.8940, 12.4945],
        ['termini', 'Termini', 41.9009, 12.5018],
        ['castro-pretorio', 'Castro Pretorio', 41.9040, 12.5085],
        ['policlinico', 'Policlinico', 41.9075, 12.5138],
        ['bologna', 'Bologna', 41.9134, 12.5205],
        ['tiburtina', 'Tiburtina FS', 41.9109, 12.5297],
        ['quintiliani', 'Quintiliani', 41.9145, 12.5365],
        ['monti-tiburtini', 'Monti Tiburtini', 41.9198, 12.5451],
        ['pietralata', 'Pietralata', 41.9260, 12.5520],
        ['santa-maria-soccorso', 'S. Maria del Soccorso', 41.9285, 12.5605],
        ['ponte-mammolo', 'Ponte Mammolo', 41.9337, 12.5690],
        ['rebibbia', 'Rebibbia', 41.9385, 12.5760]
      ] },

      { id: 'MB1', name: 'Metro B1', short: 'B1', kind: 'metro', color: '#5EA0E8', speedKmh: 30, headwayMin: 9, dwellMin: 0.4, stops: [
        ['bologna', 'Bologna', 41.9134, 12.5205],
        ['sant-agnese-annibaliano', 'S. Agnese / Annibaliano', 41.9227, 12.5172],
        ['libia', 'Libia', 41.9256, 12.5110],
        ['conca-doro', "Conca d'Oro", 41.9352, 12.5230],
        ['jonio', 'Jonio', 41.9420, 12.5270]
      ] },

      /* Colosseo e Porta Metronia aperte il 16/12/2025 — la C arriva nel centro. */
      { id: 'MC', name: 'Metro C', short: 'C', kind: 'metro', color: '#31B46C', speedKmh: 33, headwayMin: 7, dwellMin: 0.4, stops: [
        ['colosseo', 'Colosseo · Fori Imperiali', 41.8905, 12.4931],
        ['porta-metronia', 'Porta Metronia', 41.8790, 12.5035],
        ['san-giovanni', 'San Giovanni', 41.8860, 12.5090],
        ['lodi', 'Lodi', 41.8836, 12.5178],
        ['pigneto', 'Pigneto', 41.8845, 12.5265],
        ['malatesta', 'Malatesta', 41.8848, 12.5378],
        ['teano', 'Teano', 41.8838, 12.5468],
        ['gardenie', 'Gardenie', 41.8797, 12.5518],
        ['mirti', 'Mirti', 41.8735, 12.5555],
        ['parco-di-centocelle', 'Parco di Centocelle', 41.8685, 12.5640],
        ['alessandrino', 'Alessandrino', 41.8668, 12.5745],
        ['torre-spaccata', 'Torre Spaccata', 41.8645, 12.5830],
        ['torre-maura', 'Torre Maura', 41.8625, 12.5920],
        ['giardinetti', 'Giardinetti', 41.8608, 12.6015],
        ['torrenova', 'Torrenova', 41.8585, 12.6125],
        ['torre-angela', 'Torre Angela', 41.8605, 12.6220],
        ['torre-gaia', 'Torre Gaia', 41.8610, 12.6320],
        ['grotte-celoni', 'Grotte Celoni', 41.8630, 12.6425],
        ['due-leoni', 'Due Leoni / Fontana Candida', 41.8640, 12.6530],
        ['borghesiana', 'Borghesiana', 41.8650, 12.6640],
        ['bolognetta', 'Bolognetta', 41.8660, 12.6750],
        ['finocchio', 'Finocchio', 41.8680, 12.6850],
        ['graniti', 'Graniti', 41.8700, 12.6950],
        ['pantano', 'Monte Compatri / Pantano', 41.8480, 12.7160]
      ] },

      /* Rete tram: fermate PRINCIPALI (sampled). Velocità da bus sostitutivo
         finché la rete non rientra (7 set → 23 nov 2026). */
      { id: 'T2', name: 'Tram 2 (Flaminio–Mancini)', short: '2', kind: 'tram', color: '#6FC7BC', speedKmh: 11, headwayMin: 9, dwellMin: 0.35, sampled: true,
        notice: 'bus sostitutivo fino al rientro della rete tram (autunno 2026)', stops: [
        ['flaminio-t', 'Flaminio (tram)', 41.9113, 12.4758],
        ['apollodoro', 'Apollodoro', 41.9205, 12.4702],
        ['ankara', 'Ankara', 41.9280, 12.4685],
        ['mancini', 'Mancini · Ponte Milvio', 41.9333, 12.4677]
      ] },

      { id: 'T8', name: 'Tram 8 (Casaletto–Venezia)', short: '8', kind: 'tram', color: '#6FC7BC', speedKmh: 11, headwayMin: 8, dwellMin: 0.35, sampled: true,
        notice: 'bus sostitutivo fino al rientro della rete tram (autunno 2026)', stops: [
        ['casaletto', 'Casaletto', 41.8760, 12.4400],
        ['san-camillo', 'Osp. San Camillo', 41.8720, 12.4525],
        ['trastevere-fs', 'Stazione Trastevere', 41.8716, 12.4665],
        ['trastevere-mastai', 'Trastevere · Mastai', 41.8855, 12.4715],
        ['belli', 'Belli · P.za Sonnino', 41.8896, 12.4742],
        ['arenula', 'Arenula · Cairoli', 41.8945, 12.4762],
        ['venezia', 'Piazza Venezia', 41.8958, 12.4823]
      ] },

      { id: 'T3', name: 'Tram 3 (Trastevere–Valle Giulia)', short: '3', kind: 'tram', color: '#6FC7BC', speedKmh: 11, headwayMin: 9, dwellMin: 0.35, sampled: true,
        notice: 'bus sostitutivo fino al rientro della rete tram (autunno 2026)', stops: [
        ['trastevere-fs', 'Stazione Trastevere', 41.8716, 12.4665],
        ['marmorata', 'Marmorata · Testaccio', 41.8800, 12.4755],
        ['piramide', 'Piramide', 41.8757, 12.4820],
        ['aventino', 'Aventino · Circo Massimo', 41.8825, 12.4890],
        ['colosseo', 'Colosseo', 41.8905, 12.4931],
        ['porta-maggiore', 'Porta Maggiore', 41.8905, 12.5150],
        ['verano', 'Verano · San Lorenzo', 41.9020, 12.5200],
        ['policlinico-t', 'Policlinico (tram)', 41.9060, 12.5165],
        ['regina-margherita', 'Regina Margherita · Coppedè', 41.9187, 12.5077],
        ['valle-giulia', 'Valle Giulia', 41.9172, 12.4820]
      ] },

      { id: 'T19', name: 'Tram 19 (Centocelle–Risorgimento)', short: '19', kind: 'tram', color: '#6FC7BC', speedKmh: 11, headwayMin: 9, dwellMin: 0.35, sampled: true,
        notice: 'bus sostitutivo fino al rientro della rete tram (autunno 2026)', stops: [
        ['centocelle-gerani', 'Centocelle · P.za dei Gerani', 41.8775, 12.5595],
        ['largo-preneste', 'Largo Preneste', 41.8890, 12.5440],
        ['prenestina-pigneto', 'Prenestina · Pigneto', 41.8905, 12.5330],
        ['porta-maggiore', 'Porta Maggiore', 41.8905, 12.5150],
        ['verano', 'Verano · San Lorenzo', 41.9020, 12.5200],
        ['policlinico-t', 'Policlinico (tram)', 41.9060, 12.5165],
        ['regina-margherita', 'Regina Margherita · Coppedè', 41.9187, 12.5077],
        ['valle-giulia', 'Valle Giulia', 41.9172, 12.4820],
        ['milizie', 'V.le delle Milizie', 41.9120, 12.4660],
        ['risorgimento', 'Risorgimento · San Pietro', 41.9075, 12.4574]
      ] },

      { id: 'T5', name: 'Tram 5/14 (Termini–Prenestina)', short: '5', kind: 'tram', color: '#6FC7BC', speedKmh: 11, headwayMin: 7, dwellMin: 0.35, sampled: true,
        notice: 'bus sostitutivo fino al rientro della rete tram (autunno 2026)', stops: [
        ['termini', 'Termini', 41.9009, 12.5018],
        ['porta-maggiore', 'Porta Maggiore', 41.8905, 12.5150],
        ['prenestina-pigneto', 'Prenestina · Pigneto', 41.8905, 12.5330],
        ['largo-preneste', 'Largo Preneste', 41.8890, 12.5440],
        ['togliatti', 'P.le Togliatti', 41.8880, 12.5695]
      ] },

      { id: 'FL1', name: 'FL1 (Fiumicino–Tiburtina–Salario)', short: 'FL1', kind: 'rail', color: '#8F7BD8', speedKmh: 50, headwayMin: 15, dwellMin: 0.8, stops: [
        ['fco', 'Fiumicino Aeroporto', 41.7930, 12.2510],
        ['parco-leonardo', 'Parco Leonardo', 41.7910, 12.3115],
        ['fiera-di-roma', 'Fiera di Roma', 41.7935, 12.3405],
        ['ponte-galeria', 'Ponte Galeria', 41.7955, 12.3620],
        ['muratella', 'Muratella', 41.8205, 12.4235],
        ['magliana', 'Magliana FS', 41.8378, 12.4445],
        ['villa-bonelli', 'Villa Bonelli', 41.8556, 12.4570],
        ['trastevere-fs', 'Stazione Trastevere', 41.8716, 12.4665],
        ['ostiense', 'Roma Ostiense', 41.8720, 12.4865],
        ['tuscolana', 'Roma Tuscolana', 41.8798, 12.5215],
        ['tiburtina', 'Tiburtina FS', 41.9109, 12.5297],
        ['nomentana', 'Roma Nomentana', 41.9188, 12.5205],
        ['nuovo-salario', 'Nuovo Salario', 41.9425, 12.5095]
      ] },

      { id: 'FL3', name: 'FL3 (Ostiense–San Pietro–Monte Mario)', short: 'FL3', kind: 'rail', color: '#A492E3', speedKmh: 45, headwayMin: 15, dwellMin: 0.8, stops: [
        ['ostiense', 'Roma Ostiense', 41.8720, 12.4865],
        ['trastevere-fs', 'Stazione Trastevere', 41.8716, 12.4665],
        ['quattro-venti', 'Quattro Venti', 41.8795, 12.4590],
        ['san-pietro', 'Roma San Pietro', 41.8975, 12.4555],
        ['valle-aurelia', 'Valle Aurelia', 41.9033, 12.4415],
        ['balduina', 'Balduina', 41.9170, 12.4390],
        ['gemelli', 'Gemelli', 41.9320, 12.4290],
        ['monte-mario', 'Monte Mario', 41.9420, 12.4310]
      ] },

      { id: 'LEX', name: 'Leonardo Express (Termini–FCO)', short: 'LEX', kind: 'express', color: '#D4AF37', speedKmh: 50, headwayMin: 15, dwellMin: 0, stops: [
        ['termini', 'Termini', 41.9009, 12.5018],
        ['fco', 'Fiumicino Aeroporto', 41.7930, 12.2510]
      ] },

      { id: 'MARE', name: 'Metromare (Roma–Lido)', short: 'Mare', kind: 'rail', color: '#3FB6E0', speedKmh: 38, headwayMin: 12, dwellMin: 0.6, sampled: true, stops: [
        ['porta-san-paolo', 'Porta San Paolo', 41.8755, 12.4805],
        ['basilica-san-paolo', 'Basilica San Paolo', 41.8608, 12.4787],
        ['eur-magliana', 'EUR Magliana', 41.8474, 12.4661],
        ['tor-di-valle', 'Tor di Valle', 41.8330, 12.4390],
        ['acilia', 'Acilia', 41.7860, 12.3630],
        ['ostia-antica', 'Ostia Antica', 41.7560, 12.2930],
        ['lido-centro', 'Lido Centro · Ostia', 41.7330, 12.2790]
      ] }
    ],

    /* corrispondenze a piedi tra stazioni con nomi diversi */
    links: [
      ['piramide', 'porta-san-paolo', 3],
      ['piramide', 'ostiense', 6],
      ['policlinico', 'policlinico-t', 4],
      ['flaminio', 'flaminio-t', 2],
      ['lepanto', 'milizie', 4],
      ['ottaviano', 'risorgimento', 4],
      ['termini', 'repubblica', 7]
    ],

    /* i punti di una vita romana — le UI partono da qui, l'utente aggiunge i suoi */
    anchors: [
      { id: 'termini',    label: 'Termini',              emoji: '🚇', kind: 'hub',    lat: 41.9009, lng: 12.5018, perWeek: 2 },
      { id: 'colosseo',   label: 'Colosseo',             emoji: '🏛', kind: 'icon',   lat: 41.8902, lng: 12.4924, perWeek: 1 },
      { id: 'vaticano',   label: 'Vaticano',             emoji: '⛪', kind: 'icon',   lat: 41.9022, lng: 12.4534, perWeek: 1 },
      { id: 'trastevere', label: 'Trastevere nightlife', emoji: '🍷', kind: 'life',   lat: 41.8870, lng: 12.4690, perWeek: 2 },
      { id: 'sapienza',   label: 'Sapienza',             emoji: '🎓', kind: 'uni',    lat: 41.9038, lng: 12.5135, perWeek: 5 },
      { id: 'luiss',      label: 'LUISS',                emoji: '🎓', kind: 'uni',    lat: 41.9269, lng: 12.4917, perWeek: 5 },
      { id: 'roma-tre',   label: 'Roma Tre',             emoji: '🎓', kind: 'uni',    lat: 41.8564, lng: 12.4790, perWeek: 5 },
      { id: 'john-cabot', label: 'John Cabot',           emoji: '🎓', kind: 'uni',    lat: 41.8937, lng: 12.4664, perWeek: 5 },
      { id: 'lumsa',      label: 'LUMSA',                emoji: '🎓', kind: 'uni',    lat: 41.9032, lng: 12.4593, perWeek: 5 },
      { id: 'cattolica',  label: 'Cattolica · Gemelli',  emoji: '🎓', kind: 'uni',    lat: 41.9320, lng: 12.4290, perWeek: 5 },
      { id: 'tor-vergata','label': 'Tor Vergata',        emoji: '🎓', kind: 'uni',    lat: 41.8540, lng: 12.6266, perWeek: 5 },
      { id: 'eur',        label: 'EUR business',         emoji: '💼', kind: 'work',   lat: 41.8310, lng: 12.4700, perWeek: 5 },
      { id: 'fco',        label: 'Fiumicino FCO',        emoji: '✈️', kind: 'travel', lat: 41.7930, lng: 12.2510, perWeek: 1 },
      { id: 'ostia',      label: 'Ostia beach',          emoji: '🏖', kind: 'life',   lat: 41.7330, lng: 12.2790, perWeek: 1 }
    ],

    service: {
      metroClose: '23:30',
      metroCloseWeekend: '01:30',
      note: 'Metro: ultima corsa ~23:30 (ven+sab ~01:30). Dopo, linee bus notturne n.'
    },

    notices: [
      'Estimates on the real metro · tram · rail graph, average waits included — not official timetables.',
      'City buses are not modeled: where a bus is the only link, estimates run conservative.',
      'Tram network partly running as replacement buses until autumn 2026 (gradual return 7 Sep – 23 Nov).'
    ]
  };

  /* ── serializzazioni per le mappe (MapLibre) ── */

  function toGeoJSON() {
    var lineFeats = PACK.lines.map(function (L) {
      return {
        type: 'Feature',
        properties: { id: L.id, name: L.name, short: L.short, kind: L.kind, color: L.color },
        geometry: { type: 'LineString', coordinates: L.stops.map(function (s) { return [s[3], s[2]]; }) }
      };
    });
    var seen = {}, stFeats = [];
    PACK.lines.forEach(function (L) {
      L.stops.forEach(function (s) {
        if (seen[s[0]]) { if (seen[s[0]].properties.lines.indexOf(L.short) < 0) seen[s[0]].properties.lines.push(L.short); return; }
        seen[s[0]] = {
          type: 'Feature',
          properties: { id: s[0], label: s[1], lines: [L.short], kind: L.kind },
          geometry: { type: 'Point', coordinates: [s[3], s[2]] }
        };
        stFeats.push(seen[s[0]]);
      });
    });
    return {
      lines: { type: 'FeatureCollection', features: lineFeats },
      stations: { type: 'FeatureCollection', features: stFeats }
    };
  }

  var API = { PACK: PACK, toGeoJSON: toGeoJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.ROMA_TRANSIT = API;
})(typeof window !== 'undefined' ? window : this);
