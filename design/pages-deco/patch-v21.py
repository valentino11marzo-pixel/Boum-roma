#!/usr/bin/env python3
# v21 — LA SKYLINE, dentro. Non piu un varco verso lo strumento: lo strumento.
#   Stesso motore di skyline.html (MapLibre + liberty + edifici 3D + terreno
#   + satellite + archi verso le ancore), montato dentro la home.
#   Regole: non parte al caricamento (IntersectionObserver), non ruba lo
#   scroll (cooperativeGestures), e se il motore non arriva lo DICE — mai
#   una mappa finta al suo posto.
import re

f = 'pt.html'
s = open(f, encoding='utf-8').read()
n0 = len(s)

def taglia(inizio, fine, nome):
    """rimuove il blocco fra due ancore comprese"""
    global s
    a = s.index(inizio); b = s.index(fine, a) + len(fine)
    assert s.count(inizio) == 1, 'DOPPIO: ' + nome
    fuori = s[a:b]; s = s[:a] + s[b:]
    return fuori

# ── 0 · via la vecchia skyline disegnata a codice ───────────────────────
#   la sezione era gia sparita in v20; restava il motore, morto ma pesante
#   (~270 righe di canvas). Se il tool vero entra in pagina, quello se ne va.
taglia('  function skylineRoma() {',
       '  else addEventListener(\'load\', function () { setTimeout(skylineRoma, 0); });',
       'motore skyline canvas')

# ── 1 · via il CSS del varco ────────────────────────────────────────────
taglia('.varco { display:grid;', '  .varco-mirino { opacity:.2; } }', 'css varco')

# ── 2 · il CSS del cielo ────────────────────────────────────────────────
CSS = r'''
/* ── LA SKYLINE, dentro ── lo strumento vero, non una sua figura ──────── */
.cielo { position:relative; margin-top:clamp(26px,3vw,40px);
  border:1px solid var(--line); border-radius:16px; overflow:hidden;
  background:var(--void); height:min(76vh,700px);
  box-shadow:0 30px 90px rgba(0,0,0,.5); isolation:isolate; }
@media (max-width:760px){ .cielo { height:min(72vh,560px); border-radius:14px; } }
.cielo-mappa { position:absolute; inset:0; }
.cielo-mappa canvas { outline:none; }
.cielo .maplibregl-ctrl-attrib { font-size:9px!important; opacity:.4;
  background:rgba(6,6,7,.7)!important; }
.cielo .maplibregl-ctrl-attrib a { color:var(--text-3)!important; }
.cielo .maplibregl-ctrl-group { background:rgba(14,14,16,.82)!important;
  border:1px solid var(--line)!important; box-shadow:none!important;
  backdrop-filter:blur(10px); }
.cielo .maplibregl-ctrl-group button+button { border-top-color:var(--line)!important; }
.cielo .maplibregl-ctrl-icon { filter:invert(1) brightness(1.6) contrast(.85); }
.cielo .maplibregl-cooperative-gesture-screen { background:rgba(3,3,3,.72);
  font-family:var(--sans); font-weight:300; letter-spacing:.02em; }

/* la pulsantiera: filtri di prezzo + satellite, in alto */
.cielo-hud { position:absolute; top:0; left:0; right:0; z-index:6;
  display:flex; gap:7px; align-items:center; flex-wrap:wrap;
  padding:13px clamp(13px,2vw,18px) 30px; pointer-events:none;
  background:linear-gradient(180deg,rgba(6,6,7,.86),rgba(6,6,7,0)); }
.cielo-hud > * { pointer-events:auto; }
.cielo-t { font-size:10px; font-weight:600; letter-spacing:.2em;
  text-transform:uppercase; color:var(--text-4); margin-right:3px; }
.cielo-c { font-family:var(--sans); font-size:11.5px; font-weight:400;
  letter-spacing:.03em; color:var(--text-2); background:rgba(14,14,16,.76);
  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
  border:1px solid var(--line); border-radius:100px; padding:7px 14px;
  cursor:pointer; transition:color .22s var(--ease), border-color .22s var(--ease),
    background .22s var(--ease); font-variant-numeric:tabular-nums; }
.cielo-c:hover { color:var(--text); border-color:var(--line-gold-2); }
.cielo-c.on { background:var(--gold); border-color:transparent; color:#000;
  font-weight:600; }
.cielo-c.sat { margin-left:auto; }
.cielo-c.sat.on { background:rgba(0,32,18,.72); border-color:rgba(0,255,136,.32);
  color:var(--green); font-weight:500; }

/* il conteggio: in basso, come nello strumento a schermo intero */
.cielo-conta { position:absolute; left:50%; bottom:16px; z-index:6;
  transform:translateX(-50%); font-size:11.5px; letter-spacing:.02em;
  color:var(--text-2); background:rgba(14,14,16,.82);
  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
  border:1px solid var(--line); border-radius:100px; padding:8px 17px;
  white-space:nowrap; max-width:calc(100% - 32px); overflow:hidden;
  text-overflow:ellipsis; opacity:0; transition:opacity .5s var(--ease); }
.cielo-conta.viva { opacity:1; }
.cielo-conta b { color:var(--gold); font-weight:500; }
.cielo-conta i { font-style:normal; color:var(--text-4); }
@media (max-width:520px){ .cielo-conta i { display:none; } }

/* i segnaposto: il canone, in piedi sul palazzo */
.cielo-pin { display:inline-flex; flex-direction:column; align-items:center;
  cursor:pointer; transition:transform .2s var(--ease); }
.cielo-pin:hover { transform:translateY(-3px); z-index:50; }
.cielo-pin .p { background:var(--gold); color:#000; font-weight:700;
  font-size:11.5px; letter-spacing:.01em; padding:5px 11px; border-radius:100px;
  white-space:nowrap; font-variant-numeric:tabular-nums;
  box-shadow:0 5px 16px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.16); }
.cielo-pin .p.presa { background:#26262c; color:#9a9aa2;
  box-shadow:0 4px 12px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.07); }
.cielo-pin::after { content:''; width:2px; height:9px;
  background:linear-gradient(var(--gold-dark),transparent); }
.cielo-pin.spenta { opacity:.15; filter:grayscale(.7); pointer-events:none; }

/* le ancore: Sapienza, LUISS, Termini… si accendono quando tocchi una casa */
.cielo-anc { display:flex; align-items:center; gap:6px; font-size:10.5px;
  letter-spacing:.01em; color:var(--text-2); background:rgba(14,14,16,.8);
  backdrop-filter:blur(8px); border:1px solid var(--line); border-radius:100px;
  padding:5px 10px; white-space:nowrap; opacity:.45; pointer-events:none;
  transition:opacity .35s var(--ease), border-color .35s var(--ease); }
.cielo-anc .d { color:var(--gold); font-weight:600; display:none;
  font-variant-numeric:tabular-nums; }
.cielo-anc.accesa { opacity:1; border-color:var(--line-gold-2); }
.cielo-anc.accesa .d { display:inline; }
.cielo-anc.accesa .d::before { content:'· '; color:var(--text-4); }

/* la scheda che si apre sul segnaposto */
.cielo .maplibregl-popup-content { background:var(--card)!important;
  border:1px solid var(--line)!important; border-radius:14px!important;
  padding:0!important; overflow:hidden; width:224px;
  box-shadow:0 24px 60px rgba(0,0,0,.65)!important; }
.cielo .maplibregl-popup-close-button { color:var(--text-2)!important;
  font-size:19px!important; padding:2px 8px!important; z-index:2; }
.cielo .maplibregl-popup-tip { border-top-color:var(--card)!important;
  border-bottom-color:var(--card)!important; }
.pk-foto { height:122px; background:var(--elevated) center/cover no-repeat; }
.pk-corpo { padding:12px 14px 14px; }
.pk-zona { font-size:9px; font-weight:600; letter-spacing:.18em;
  text-transform:uppercase; color:var(--text-4); }
.pk-nome { font-size:14.5px; font-weight:400; color:var(--text); margin:4px 0 7px;
  letter-spacing:-.01em; }
.pk-canone { font-family:var(--display); font-weight:300; font-size:21px;
  color:var(--gold); font-variant-numeric:tabular-nums; }
.pk-canone small { font-size:10.5px; color:var(--text-4); }
.pk-vai { display:block; margin-top:11px; text-align:center; background:var(--gold);
  color:#000; font-size:12px; font-weight:600; letter-spacing:.02em;
  padding:9px; border-radius:9px; }

/* il velo: attesa onesta prima, verita onesta se il motore non arriva */
.cielo-velo { position:absolute; inset:0; z-index:8; display:flex;
  flex-direction:column; align-items:center; justify-content:center; gap:15px;
  padding:26px; text-align:center; background:var(--void);
  transition:opacity .55s var(--ease), visibility .55s var(--ease); }
.cielo-velo.via { opacity:0; visibility:hidden; }
.cielo-velo .punto { width:9px; height:9px; border-radius:50%;
  background:var(--gold); animation:cielo-batti 1.5s ease-in-out infinite; }
@keyframes cielo-batti {
  0%,100% { transform:scale(1); box-shadow:0 0 0 0 rgba(255,215,0,.36); }
  50% { transform:scale(1.22); box-shadow:0 0 0 15px rgba(255,215,0,0); } }
.cielo-velo .eti { font-size:10px; font-weight:600; letter-spacing:.28em;
  text-transform:uppercase; color:var(--text-4); }
.cielo-velo .dice { font-size:13.5px; color:var(--text-2); max-width:36ch;
  line-height:1.65; }
.cielo-velo .fuori { display:none; margin-top:4px; }
.cielo-velo.muta .punto { display:none; }
.cielo-velo.muta .fuori { display:inline-flex; }
@media (prefers-reduced-motion:reduce){ .cielo-velo .punto { animation:none; } }

/* la testata della sezione: titolo a sinistra, uscita a schermo intero a destra */
.cielo-capo { display:flex; align-items:flex-end; justify-content:space-between;
  gap:20px; flex-wrap:wrap; }
.cielo-capo .sotto { max-width:52ch; margin-top:10px; }
.cielo-pieno { display:inline-flex; align-items:center; gap:9px; flex:none;
  font-size:11.5px; font-weight:500; letter-spacing:.14em; text-transform:uppercase;
  color:var(--text-2); border:1px solid var(--line); border-radius:100px;
  padding:11px 19px; transition:color .25s var(--ease),
    border-color .25s var(--ease), transform .25s var(--ease); }
.cielo-pieno:hover { color:var(--gold); border-color:var(--line-gold-2);
  transform:translateY(-1px); }
.cielo-pieno svg { width:13px; height:13px; }
'''

# lo infilo dove stava il varco: prima della chiusura dello </style>
mark = '</style>'
i = s.index(mark)
s = s[:i] + CSS + '\n' + s[i:]

# ── 3 · la sezione ──────────────────────────────────────────────────────
a = s.index('<!-- ══ LA SKYLINE 3D')
b = s.index('<!-- ══ I SERVIZI')
SEZ = '''<!-- ══ LA SKYLINE — lo strumento vero, dentro la pagina ════════════════ -->
<section class="sezione" id="skyline">
  <div class="container">
    <div class="cielo-capo coro">
      <div>
        <span class="eyebrow dentro-subito"><i></i>Skyline 3D · live</span>
        <h2 class="titolo">Every home on Rome's <span class="hl">real
          skyline</span>.</h2>
        <p class="sotto">The actual city in three dimensions — buildings,
          terrain, satellite. Tap a home and it draws its own lines to
          Sapienza, LUISS, Termini and the Vatican, with the walk measured
          from that door.</p>
      </div>
      <a class="cielo-pieno" href="SKYLINE_URL">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
          aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-8 8M3 21l8-8"/>
        </svg>Full screen</a>
    </div>

    <div class="cielo sale" id="cielo">
      <div class="cielo-mappa" id="cieloMappa"></div>

      <div class="cielo-hud">
        <span class="cielo-t">Budget</span>
        <button type="button" class="cielo-c on" data-max="0">All</button>
        <button type="button" class="cielo-c" data-max="1500">≤ €1,500</button>
        <button type="button" class="cielo-c" data-max="2000">≤ €2,000</button>
        <button type="button" class="cielo-c" data-max="2500">≤ €2,500</button>
        <button type="button" class="cielo-c sat" id="cieloSat"
          aria-pressed="false">Satellite</button>
      </div>

      <div class="cielo-conta" id="cieloConta" aria-live="polite"></div>

      <div class="cielo-velo" id="cieloVelo">
        <span class="punto"></span>
        <span class="eti">BOOM · Skyline</span>
        <p class="dice" id="cieloDice">Mapping Rome…</p>
        <a class="cielo-pieno fuori" href="SKYLINE_URL">Open the full
          Skyline</a>
      </div>
    </div>
  </div>
</section>

'''
s = s[:a] + SEZ + s[b:]

# ── 4 · il motore ───────────────────────────────────────────────────────
JS = r'''
<script>
/* ── LA SKYLINE, dentro ────────────────────────────────────────────────
   Lo stesso motore di /skyline: MapLibre, stile liberty, edifici in
   estrusione, terreno vero, satellite a interruttore, archi verso le
   ancore della citta con la camminata misurata.
   Tre regole che una mappa dentro una pagina deve rispettare:
     · non parte al caricamento — solo quando la sezione entra davvero;
     · non ruba lo scroll — un dito scorre la pagina, due muovono la mappa;
     · se il motore non arriva lo dice. Mai una mappa finta al suo posto. */
(function () {
  'use strict';
  var CASE = 'SKY_JSON';
  var telaio = document.getElementById('cielo');
  if (!telaio || !CASE.length) return;

  var velo  = document.getElementById('cieloVelo'),
      dice  = document.getElementById('cieloDice'),
      conta = document.getElementById('cieloConta'),
      sat   = document.getElementById('cieloSat');
  var ROMA = [12.4924, 41.8902], mappa = null, PIN = [], TETTO = 0, morto = false;

  function dico(t, muto) {
    if (dice) dice.textContent = t;
    if (muto && velo) velo.classList.add('muta');
  }
  function spengo(t) { if (!morto) { morto = true; dico(t, true); } }

  /* ── le ancore della citta ── stessa lista dello strumento intero ── */
  var ANCORE = [
    [12.5018, 41.9009, 'Termini'],    [12.4924, 41.8902, 'Colosseo'],
    [12.4534, 41.9022, 'Vaticano'],   [12.4690, 41.8870, 'Trastevere'],
    [12.5135, 41.9038, 'Sapienza'],   [12.4917, 41.9269, 'LUISS'],
    [12.4790, 41.8564, 'Roma Tre'],   [12.4664, 41.8937, 'John Cabot']
  ];
  var ANC = [];

  function haversine(a, b) {
    var R = 6371, r = Math.PI / 180, dy = (b[1] - a[1]) * r, dx = (b[0] - a[0]) * r;
    var q = Math.pow(Math.sin(dy / 2), 2) + Math.cos(a[1] * r) * Math.cos(b[1] * r)
          * Math.pow(Math.sin(dx / 2), 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
  }
  /* onesto: distanza in linea d'aria + stima a 4.8 km/h, non un percorso */
  function passo(km) {
    return km < 2.6 ? Math.round(km / 4.8 * 60) + "′ walk"
                    : (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km';
  }
  function arco(a, b, curva, n) {
    n = n || 44;
    var p = [], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2,
        dx = b[0] - a[0], dy = b[1] - a[1],
        cx = mx - dy * curva, cy = my + dx * curva;
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      p.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0],
              u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
    }
    return p;
  }
  function tendi(co) {
    if (!mappa.getSource('fili')) return;
    /* sei ancore, non otto: otto righe sono rumore, sei sono un racconto */
    var vicine = ANCORE.map(function (A, i) {
      return { A: A, i: i, d: haversine(co, [A[0], A[1]]) };
    }).sort(function (x, y) { return x.d - y.d; }).slice(0, 6);
    var set = {}; vicine.forEach(function (v) { set[v.i] = v.d; });
    ANCORE.forEach(function (A, i) {
      var m = ANC[i]; if (!m) return;
      if (i in set) { m.el.classList.add('accesa'); m.el.style.opacity = '';
                      m.d.textContent = passo(set[i]); }
      else { m.el.classList.remove('accesa'); m.el.style.opacity = '.18';
             m.d.textContent = ''; }
    });
    mappa.getSource('fili').setData({ type: 'FeatureCollection',
      features: vicine.map(function (v) {
        return { type: 'Feature', geometry: { type: 'LineString',
          coordinates: arco(co, [v.A[0], v.A[1]], .12, 44) } };
      }) });
  }
  function sciogli() {
    if (mappa.getSource('fili'))
      mappa.getSource('fili').setData({ type: 'FeatureCollection', features: [] });
    ANC.forEach(function (m) { m.el.classList.remove('accesa');
      m.el.style.opacity = ''; });
  }

  /* ── la grana della citta: edifici, terreno, satellite ── */
  function grana() {
    try {
      mappa.getStyle().layers.forEach(function (L) {
        try { if (L.type === 'symbol' && /poi|housenumber|aeroway|airport/.test(L.id))
          mappa.setLayoutProperty(L.id, 'visibility', 'none'); } catch (e) {}
      });
      try {
        mappa.addSource('cielo-sat', { type: 'raster', tileSize: 256, maxzoom: 19,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
        var primo = (mappa.getStyle().layers.find(function (L) {
          return L.type === 'symbol'; }) || {}).id;
        mappa.addLayer({ id: 'cielo-sat-l', type: 'raster', source: 'cielo-sat',
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 300 } }, primo);
      } catch (e) {}
      try {
        mappa.addSource('cielo-dem', { type: 'raster-dem', encoding: 'terrarium',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256, maxzoom: 13 });
        mappa.setTerrain({ source: 'cielo-dem', exaggeration: 1.15 });
      } catch (e) {}
      var fonti = Object.keys(mappa.getStyle().sources || {});
      var f = fonti.find(function (x) { return /openmaptiles|vector|planet/i.test(x); })
              || fonti[0];
      /* travertino: il colore vero di Roma dal basso verso l'alto */
      if (f) mappa.addLayer({ id: 'cielo-3d', type: 'fill-extrusion', source: f,
        'source-layer': 'building', minzoom: 13, paint: {
          'fill-extrusion-color': ['interpolate', ['linear'],
            ['coalesce', ['get', 'render_height'], 10],
            0, '#B8AD97', 14, '#C8BDA5', 32, '#D6CBB2', 60, '#E2D8C0',
            110, '#EFE6CF'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': .92 } });
    } catch (e) {}
    try { if (mappa.setSky) mappa.setSky({ 'sky-color': '#8FB8E8',
      'horizon-color': '#F2DEB6', 'fog-color': '#E8E0CE',
      'sky-horizon-blend': .55, 'horizon-fog-blend': .5,
      'fog-ground-blend': .35 }); } catch (e) {}
  }

  function segnaposto(c) {
    var el = document.createElement('div');
    el.className = 'cielo-pin';
    el.__p = parseInt(String(c.da).replace(/[^\d]/g, ''), 10) || 0;
    el.__presa = !c.si;
    el.innerHTML = '<span class="p' + (c.si ? '' : ' presa') + '">' + c.da + '</span>';
    var foto = c.foto || '';
    var scheda = new maplibregl.Popup({ offset: 17, closeButton: true,
      maxWidth: '234px' }).setHTML(
      '<div class="pk-foto"' + (foto ? ' style="background-image:url(\'' +
        foto.replace(/'/g, '') + '\')"' : '') + '></div>' +
      '<div class="pk-corpo"><div class="pk-zona">' + c.zona + '</div>' +
      '<div class="pk-nome">' + c.nome + '</div>' +
      '<span class="pk-canone">' + c.da + '<small> /mo</small></span>' +
      '<a class="pk-vai" href="CASA_BASE' + encodeURIComponent(c.id) +
      '">View this home →</a></div>');
    el.addEventListener('click', function () { tendi([c.lng, c.lat]); });
    PIN.push(new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([c.lng, c.lat]).setPopup(scheda).addTo(mappa));
  }

  function filtra() {
    var viste = 0;
    PIN.forEach(function (m) {
      var el = m.getElement();
      var ok = el.__presa ? false : (TETTO === 0 || (el.__p > 0 && el.__p <= TETTO));
      el.classList.toggle('spenta', !ok); if (ok) viste++;
    });
    if (conta) {
      conta.classList.add('viva');
      conta.innerHTML = '<b>' + viste + '</b> home' + (viste === 1 ? '' : 's') +
        (TETTO ? ' under €' + TETTO.toLocaleString('en-US') : ' standing in Rome') +
        '<i> · tap one to measure its walks</i>';
    }
  }

  /* ── l'accensione ── */
  function accendi() {
    mappa = new maplibregl.Map({
      container: 'cieloMappa',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: ROMA, zoom: 11.1, pitch: 55, bearing: -12, antialias: true,
      attributionControl: { compact: true },
      /* un dito scorre la pagina, due muovono la mappa — mai rubare lo scroll */
      cooperativeGestures: {
        windowsHelpText: 'Use Ctrl + scroll to zoom the map',
        macHelpText: 'Use ⌘ + scroll to zoom the map',
        mobileHelpText: 'Use two fingers to move the map'
      }
    });
    mappa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }),
      'bottom-right');
    mappa.addControl(new maplibregl.FullscreenControl(), 'bottom-right');
    mappa.on('error', function (e) {
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
    });
  }

  /* i filtri di prezzo */
  [].forEach.call(telaio.querySelectorAll('.cielo-c[data-max]'), function (c) {
    c.addEventListener('click', function () {
      [].forEach.call(telaio.querySelectorAll('.cielo-c[data-max]'), function (x) {
        x.classList.toggle('on', x === c); });
      TETTO = Number(c.getAttribute('data-max')) || 0;
      if (mappa) filtra();
    });
  });
  /* mappa ⇄ satellite */
  if (sat) sat.addEventListener('click', function () {
    if (!mappa || !mappa.getLayer('cielo-sat-l')) return;
    var on = sat.classList.toggle('on');
    sat.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { mappa.setLayoutProperty('cielo-sat-l', 'visibility', on ? 'visible' : 'none'); } catch (e) {}
    try { mappa.setPaintProperty('cielo-3d', 'fill-extrusion-opacity', on ? .45 : .92); } catch (e) {}
  });

  /* ── il motore arriva solo quando la sezione entra davvero ── */
  var partito = false;
  function carica() {
    if (partito) return; partito = true;
    if (window.maplibregl) return accendi();
    var css = document.createElement('link'); css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.min.js';
    js.onload = function () {
      try { accendi(); }
      catch (e) { spengo('The map could not start here. The full Skyline still works.'); }
    };
    js.onerror = function () {
      spengo('The map engine is not reachable from this preview. The full Skyline still works.');
    };
    document.head.appendChild(js);
    /* se in dodici secondi non e successo niente, lo diciamo */
    setTimeout(function () { if (!mappa) spengo(
      'The map engine is not reachable from this preview. The full Skyline still works.'); },
      12000);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (v, o) {
      if (v[0].isIntersecting) { o.disconnect(); carica(); }
    }, { rootMargin: '260px 0px' }).observe(telaio);
  } else { addEventListener('load', carica); }
})();
</script>
'''
s = s.rstrip() + '\n' + JS

assert 'varco' not in s, 'residui varco'
assert s.count("'SKY_JSON'") == 1, "SKY_JSON: %d" % s.count("'SKY_JSON'")
assert s.count('CASA_BASE') >= 1
open(f, 'w', encoding='utf-8').write(s)
print('v21 · skyline dentro · %d KB → %d KB' % (n0 // 1024, len(s) // 1024))
