#!/usr/bin/env python3
# LA MAPPA IMBATTIBILE — lo Skyline in produzione era una scatola nera:
# il velo si alzava SOLO su 'load', e se lo stile vettoriale non arrivava
# non c'era ne watchdog ne piano B. Tre stadi, mai il nero:
#   1. vettoriale (openfreemap liberty) — il quadro pieno;
#   2. se 'load' non arriva in 9s O lo stile fallisce: SATELLITE puro
#      (tile Esri — le stesse del detail live che funziona), ricostruito
#      con uno stile inline: niente JSON esterno da scaricare;
#   3. se anche il satellite tace: la carta onesta col link al /skyline.
# In piu: il velo si alza anche su 'idle' (primo render completo), e
# il lettering BOOM torna Helvetica Neue 300 — la taglia era giusta,
# il peso no.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('pt.html', 'ld-regia.html'):
    shutil.copy(f, f + '.bak')

# ═══ PT.HTML — il modulo Skyline ════════════════════════════════════════
s = leggi('pt.html')

# il lettering: Helvetica Neue 300, non 400 — la motivazione del marchio
s = uno(s, """.marchio span { font-family:var(--display); font-size:30px; font-weight:400;""",
""".marchio span { font-family:var(--display); font-size:30px; font-weight:300;""",
'lettering 300')

# preconnect alle tile: il primo byte arriva prima
s = uno(s, 'FONT_INLINE',
"""<link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin>
<link rel="dns-prefetch" href="https://cdn.jsdelivr.net">
FONT_INLINE""", 'preconnect tile')

# lo stato del carico + lo stile satellite inline
s = uno(s, """  var ROMA = [12.4924, 41.8902], mappa = null, PIN = [], TETTO = 0, morto = false;""",
"""  var ROMA = [12.4924, 41.8902], mappa = null, PIN = [], TETTO = 0, morto = false;
  var carico = false, satellite = false;
  /* il piano B non scarica niente: lo stile e scritto qui dentro */
  function stileSatellite() {
    return { version: 8, sources: { sat: { type: 'raster', tileSize: 256,
      maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] } },
      layers: [{ id: 'sat', type: 'raster', source: 'sat' }] };
  }
  function ripiego() {
    /* il vettoriale non e arrivato: si passa al satellite puro. Se entro
       8s non arriva neanche lui, la carta onesta. */
    if (carico || morto || satellite || !mappa) return;
    satellite = true;
    dico('Switching to satellite…');
    try { mappa.setStyle(stileSatellite()); } catch (e) { spengo(
      'The map engine could not start here. The full Skyline still works.'); return; }
    setTimeout(function () { if (!carico) spengo(
      'The map engine is not reachable from here. The full Skyline still works.'); },
      8000);
  }""", 'stile satellite')

# il velo si alza al primo render VERO, e gli attrezzi si riarmano anche
# dopo un cambio di stile (setStyle azzera sorgenti e layer)
s = uno(s, """    mappa.on('error', function (e) {
      /* un tile che manca non e un fallimento; uno stile che manca lo e */
      if (e && e.error && /style|Failed to fetch/i.test(String(e.error.message || '')))
        spengo('The map engine could not be reached from here. The full Skyline still works.');
    });
    mappa.on('load', function () {
      grana();
      mappa.addSource('fili', { type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } });
      mappa.addLayer({ id: 'fili-alone', type: 'line', source: 'fili',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFD700', 'line-width': 6, 'line-blur': 6,
          'line-opacity': .22 } });
      mappa.addLayer({ id: 'fili-filo', type: 'line', source: 'fili',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#FFE680', 'line-width': 1.6, 'line-opacity': .9,
          'line-dasharray': [1, 1.6] } });
      ANCORE.forEach(function (A) {
        var el = document.createElement('div'); el.className = 'cielo-anc';
        var nm = document.createElement('span'); nm.textContent = A[2];
        var d = document.createElement('span'); d.className = 'd';
        el.appendChild(nm); el.appendChild(d);
        ANC.push({ el: el, d: d, mk: new maplibregl.Marker({ element: el,
          anchor: 'center' }).setLngLat([A[0], A[1]]).addTo(mappa) });
      });
      mappa.on('click', sciogli);

      var box = new maplibregl.LngLatBounds();
      CASE.forEach(function (c) { segnaposto(c); box.extend([c.lng, c.lat]); });
      try { mappa.fitBounds(box, { padding: 84, maxZoom: 14.2, duration: 1600,
        pitch: 55 }); } catch (e) {}
      filtra();
      if (velo) velo.classList.add('via');
    });""",
"""    mappa.on('error', function (e) {
      /* un tile che manca non e un fallimento; uno stile che manca lo e —
         e il piano B e il satellite, non il buio */
      if (e && e.error && /style|Failed to fetch/i.test(String(e.error.message || '')))
        ripiego();
    });
    var attrezzata = false;
    function attrezza() {
      /* tutto cio che uno setStyle spazza via: fili, ancore, pin */
      if (!satellite) grana();
      try {
        mappa.addSource('fili', { type: 'geojson',
          data: { type: 'FeatureCollection', features: [] } });
        mappa.addLayer({ id: 'fili-alone', type: 'line', source: 'fili',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#FFD700', 'line-width': 6, 'line-blur': 6,
            'line-opacity': .22 } });
        mappa.addLayer({ id: 'fili-filo', type: 'line', source: 'fili',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#FFE680', 'line-width': 1.6,
            'line-opacity': .9, 'line-dasharray': [1, 1.6] } });
      } catch (e) {}
      if (attrezzata) return;
      attrezzata = true;
      ANCORE.forEach(function (A) {
        var el = document.createElement('div'); el.className = 'cielo-anc';
        var nm = document.createElement('span'); nm.textContent = A[2];
        var d = document.createElement('span'); d.className = 'd';
        el.appendChild(nm); el.appendChild(d);
        ANC.push({ el: el, d: d, mk: new maplibregl.Marker({ element: el,
          anchor: 'center' }).setLngLat([A[0], A[1]]).addTo(mappa) });
      });
      mappa.on('click', sciogli);
      var box = new maplibregl.LngLatBounds();
      CASE.forEach(function (c) { segnaposto(c); box.extend([c.lng, c.lat]); });
      try { mappa.fitBounds(box, { padding: 84, maxZoom: 14.2,
        duration: 1600, pitch: 55 }); } catch (e) {}
      filtra();
    }
    function eccola() {
      carico = true;
      attrezza();
      if (velo) velo.classList.add('via');
    }
    mappa.on('load', eccola);
    /* 'idle' = primo quadro COMPLETO: se 'load' tarda ma il render
       arriva, il velo si alza comunque — mai il nero su una mappa viva */
    mappa.once('idle', eccola);
    /* e se in 9s non e arrivato niente, si passa al satellite */
    setTimeout(ripiego, 9000);""", 'velo e ripiego')

# il timeout finale del loader esterno resta, ma ora prova il ripiego
s = uno(s, """    /* se in dodici secondi non e successo niente, lo diciamo */
    setTimeout(function () { if (!mappa) spengo(
      'The map engine is not reachable from this preview. The full Skyline still works.'); },
      12000);""",
"""    /* se in dodici secondi il motore non e neanche arrivato, lo diciamo */
    setTimeout(function () { if (!mappa) spengo(
      'The map engine is not reachable from here. The full Skyline still works.'); },
      12000);""", 'timeout motore')
scrivi('pt.html', s)

# ═══ LD-REGIA — la mappa del blocco, stessa disciplina ══════════════════
s = leggi('ld-regia.html')
s = uno(s, """    var mappaB = null, spenta = false;""",
"""    var mappaB = null, spenta = false, carico = false, satellite = false;
    function stileSat() {
      return { version: 8, sources: { sat: { type: 'raster', tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] } },
        layers: [{ id: 'sat', type: 'raster', source: 'sat' }] };
    }
    function ripiegoB() {
      /* vettoriale muto → satellite puro; muto anche lui → carta onesta */
      if (carico || spenta || satellite || !mappaB) return;
      satellite = true;
      try { mappaB.setStyle(stileSat()); } catch (e) { spengo(); return; }
      setTimeout(function () { if (!carico) spengo(); }, 8000);
    }""", 'stile sat blocco')
s = uno(s, """      mappaB.on('error', function (e) {
        if (e && e.error
            && /style|Failed to fetch/i.test(String(e.error.message || '')))
          spengo();
      });
      mappaB.on('load', function () {""",
"""      mappaB.on('error', function (e) {
        if (e && e.error
            && /style|Failed to fetch/i.test(String(e.error.message || '')))
          ripiegoB();
      });
      setTimeout(ripiegoB, 9000);
      mappaB.on('load', function () {
        carico = true;""", 'blocco ripiego')

# dopo un setStyle gli anelli vanno riarmati: il blocco 'load' rifire
# su ogni stile nuovo, quindi le add vanno protette (gia in try) e il
# pin non va duplicato
s = uno(s, """        var el = document.createElement('div');
        el.className = 'blocco-pin';
        el.innerHTML = '<span>' + euro(c.prezzo) + '</span>';
        new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([c.lng, c.lat]).addTo(mappaB);""",
"""        if (!document.querySelector('#bloccoMappa .blocco-pin')) {
          var el = document.createElement('div');
          el.className = 'blocco-pin';
          el.innerHTML = '<span>' + euro(c.prezzo) + '</span>';
          new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([c.lng, c.lat]).addTo(mappaB);
        }""", 'pin unico')
scrivi('ld-regia.html', s)
print('mappa imbattibile: fatta')
