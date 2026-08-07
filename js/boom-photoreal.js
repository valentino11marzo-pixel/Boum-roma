/* BOOM Photoreal — "Explore the block" su Google Photorealistic 3D Tiles.
   Roma com'è davvero: fotogrammetria, tetti, alberi, cornicioni.

   PERCHÉ QUESTA RISCRITTURA (sintomo reale: "si apre un Cesium senza
   controlli, e se clicco si impianta — loading lentissimo, poi dopo anni
   arriva il 3D della zona"):

   1 · LA CAMERA ARRIVAVA PER ULTIMA. setView su Roma stava DENTRO il .then()
       del tileset, quindi Cesium restava sulla vista globale di default
       mentre Google gli streammava le tessere radice di mezzo pianeta.
       Ora la camera è sull'indirizzo PRIMA che parta la richiesta: il
       tileset scarica solo l'isolato che stai guardando.
   2 · NESSUN DETTAGLIO PROGRESSIVO. maximumScreenSpaceError di default (16)
       pretende la qualità piena subito. Ora si parte grezzi e nitidi in due
       tempi: prima immagine in pochi secondi, poi si affina da sola.
   3 · L'ORBITA PARTIVA SUBITO e girava a ogni frame: la camera si muoveva
       di continuo, quindi la richiesta di tessere non si assestava mai.
       Ora l'orbita comincia solo quando la prima vista è completa.
   4 · NESSUN CONTROLLO. Solo una ✕. Ora: zoom, ricentra, orbita on/off,
       schermo intero, Street View, e una barra di avanzamento vera.

   Caricato solo su richiesta (CesiumJS ~3MB) e solo se /api/maps-key
   restituisce una chiave; qualunque errore rigetta la promise e il
   chiamante ripiega sulla mappa satellitare. Esc o ✕ per chiudere. */
(function () {
'use strict';

var CDN = 'https://cdn.jsdelivr.net/npm/cesium@1.119.0/Build/Cesium/';
var TILES = 'https://tile.googleapis.com/v1/3dtiles/root.json?key=';

// Dettaglio: si parte permissivi (immagine subito) e si stringe una volta
// che la prima vista è a posto. 24 → 16 è la differenza tra "aspetto" e
// "guardo già qualcosa".
var SSE_FAST = 24, SSE_SHARP = 16;

var loading = null, viewer = null, wrap = null, tileset = null, orbitOff = null;
var GOLD = '#FFD700';

function css() {
  if (document.getElementById('prcss')) return;
  var st = document.createElement('style'); st.id = 'prcss';
  st.textContent = [
    '#prwrap{position:fixed;inset:0;z-index:300;background:#060607;font-family:inherit}',
    '#prview{position:absolute;inset:0}',
    '#prwrap .prbtn{border:1px solid rgba(255,215,0,.34);background:rgba(0,0,0,.62);',
      '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:' + GOLD + ';',
      'border-radius:100px;cursor:pointer;font-family:inherit;letter-spacing:.4px;',
      'transition:background .18s,border-color .18s;line-height:1}',
    '#prwrap .prbtn:hover{background:rgba(255,215,0,.14);border-color:rgba(255,215,0,.6)}',
    '#prwrap .prbtn:focus-visible{outline:2px solid ' + GOLD + ';outline-offset:2px}',
    '#prwrap .prbtn[aria-pressed="true"]{background:rgba(255,215,0,.2)}',
    // barra comandi: in basso a destra, pollice-friendly
    '#prwrap .prctl{position:absolute;right:14px;bottom:calc(30px + env(safe-area-inset-bottom));z-index:6;',
      'display:flex;flex-direction:column;gap:8px;align-items:flex-end}',
    '#prwrap .prctl .prbtn{width:44px;height:44px;font-size:17px;display:grid;place-items:center;padding:0}',
    '#prwrap .prx{position:absolute;top:14px;right:14px;z-index:6;padding:11px 18px;font-size:13px}',
    '#prwrap .prl{position:absolute;left:16px;bottom:calc(30px + env(safe-area-inset-bottom));z-index:5;',
      'color:rgba(255,255,255,.8);font-size:12px;letter-spacing:.6px;background:rgba(0,0,0,.55);',
      'border-radius:100px;padding:9px 15px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
      'max-width:52vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#prwrap .prh{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:5;color:' + GOLD + ';',
      'font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;background:rgba(0,0,0,.55);',
      'border:1px solid rgba(255,215,0,.3);border-radius:100px;padding:7px 14px;',
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);white-space:nowrap;',
      'transition:opacity .4s}',
    // schermata di caricamento: dice a che punto siamo, non "attendere"
    '#prwrap .prload{position:absolute;inset:0;display:grid;place-items:center;z-index:4;',
      'background:radial-gradient(120% 90% at 50% 40%,#101018,#060607);pointer-events:none;transition:opacity .5s}',
    '#prwrap .prload.gone{opacity:0}',
    '#prwrap .prlbox{text-align:center;padding:0 28px}',
    '#prwrap .prlt{color:rgba(255,255,255,.62);font-size:11.5px;letter-spacing:2.4px;text-transform:uppercase}',
    '#prwrap .prlbar{width:190px;height:2px;background:rgba(255,255,255,.12);border-radius:2px;margin:16px auto 0;overflow:hidden}',
    '#prwrap .prlfill{height:100%;width:8%;background:' + GOLD + ';border-radius:2px;transition:width .45s ease}',
    '#prwrap .prlsub{color:rgba(255,255,255,.34);font-size:11px;letter-spacing:.6px;margin-top:12px}',
    '@media(max-width:560px){',
      '#prwrap .prl{max-width:44vw;font-size:11px}',
      '#prwrap .prh{font-size:9.5px;letter-spacing:1.2px;padding:6px 11px}',
      '#prwrap .prctl .prbtn{width:42px;height:42px}}',
    '@media(prefers-reduced-motion:reduce){#prwrap .prlfill{transition:none}}',
  ].join('');
  document.head.appendChild(st);
}

function loadCesium() {
  return loading || (loading = new Promise(function (res, rej) {
    if (window.Cesium) return res();
    window.CESIUM_BASE_URL = CDN;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CDN + 'Widgets/widgets.css';
    document.head.appendChild(l);
    var s = document.createElement('script'); s.src = CDN + 'Cesium.js';
    s.onload = function () { res(); };
    s.onerror = function () { loading = null; rej(new Error('cesium_load_failed')); };
    document.head.appendChild(s);
    setTimeout(function () { if (!window.Cesium) { loading = null; rej(new Error('cesium_timeout')); } }, 25000);
  }));
}

function onKey(e) {
  if (!wrap) return;
  if (e.key === 'Escape') return close();
  if (e.key === '+' || e.key === '=') { zoom(1); e.preventDefault(); }
  if (e.key === '-' || e.key === '_') { zoom(-1); e.preventDefault(); }
}

function close() {
  if (orbitOff) { try { orbitOff(); } catch (e) {} orbitOff = null; }
  try { if (viewer && !viewer.isDestroyed()) viewer.destroy(); } catch (e) {}
  viewer = null; tileset = null;
  if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
  wrap = null;
  document.removeEventListener('keydown', onKey);
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
}

// Zoom manuale: libera prima la camera dall'orbita, altrimenti il tick
// successivo la riporterebbe indietro e il pulsante sembrerebbe rotto.
function zoom(dir) {
  if (!viewer) return;
  if (orbitOff) { orbitOff(); orbitOff = null; }
  var h = viewer.camera.positionCartographic.height;
  var step = Math.max(30, h * 0.35);
  try { dir > 0 ? viewer.camera.zoomIn(step) : viewer.camera.zoomOut(step); } catch (e) {}
}

function ui(o) {
  var name = String(o.name || '').replace(/[<>&"]/g, function (c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
  });
  return '<div id="prview"></div>'
    + '<div class="prload"><div class="prlbox">'
    +   '<div class="prlt">Costruisco l’isolato reale</div>'
    +   '<div class="prlbar"><div class="prlfill"></div></div>'
    +   '<div class="prlsub">Google Photorealistic 3D · Roma</div>'
    + '</div></div>'
    + '<button class="prbtn prx" type="button" data-a="close">✕ Chiudi</button>'
    + '<div class="prh">Trascina per prendere il comando</div>'
    + '<div class="prl">' + name + ' · Google Photorealistic 3D</div>'
    + '<div class="prctl">'
    +   '<button class="prbtn" type="button" data-a="in"    aria-label="Avvicina">＋</button>'
    +   '<button class="prbtn" type="button" data-a="out"   aria-label="Allontana">－</button>'
    +   '<button class="prbtn" type="button" data-a="orbit" aria-label="Orbita automatica" aria-pressed="true">⟳</button>'
    +   '<button class="prbtn" type="button" data-a="reset" aria-label="Torna sulla casa">◎</button>'
    +   '<button class="prbtn" type="button" data-a="pano"  aria-label="Apri Street View">👁</button>'
    +   '<button class="prbtn" type="button" data-a="full"  aria-label="Schermo intero">⤢</button>'
    + '</div>';
}

function open(o) {
  return loadCesium().then(function () {
    css(); close();
    var C = window.Cesium;
    var reduce = false;
    try { reduce = matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}

    wrap = document.createElement('div');
    wrap.id = 'prwrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Esplora l’isolato in 3D fotorealistico');
    wrap.innerHTML = ui(o);
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey);

    viewer = new C.Viewer('prview', {
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      timeline: false, animation: false, navigationHelpButton: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false, baseLayer: false,
      // Il globo terrestre non serve: guardiamo solo la fotogrammetria.
      // Toglierlo evita un intero livello di richieste.
      globe: false,
    });
    // 30fps invece di 60: su un portatile la differenza non si vede e la
    // GPU resta libera per lo streaming delle tessere.
    viewer.targetFrameRate = 30;
    try { viewer.scene.backgroundColor = C.Color.fromCssColorString('#060607'); } catch (e) {}
    try { viewer.scene.skyAtmosphere.show = true; } catch (e) {}
    try { viewer.scene.screenSpaceCameraController.enableCollisionDetection = false; } catch (e) {}

    // ══ IL PUNTO CHIAVE ══════════════════════════════════════════════════
    // La camera è sull'indirizzo PRIMA che il tileset venga richiesto.
    // Google streamma ciò che la camera inquadra: se la camera è ancora
    // sulla vista globale di default, scarica mezzo pianeta e l'utente
    // aspetta "anni" prima di vedere il proprio isolato.
    var center = C.Cartesian3.fromDegrees(o.lng, o.lat, 45);
    var startHeading = C.Math.toRadians(o.heading || 25);
    var home = function () {
      try {
        viewer.camera.lookAt(center, new C.HeadingPitchRange(startHeading, C.Math.toRadians(-30), 320));
        viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
      } catch (e) {}
    };
    home();

    var fill = wrap.querySelector('.prlfill');
    var load = wrap.querySelector('.prload');
    var setPct = function (p) { if (fill) fill.style.width = Math.max(8, Math.min(100, p)) + '%'; };

    return C.Cesium3DTileset.fromUrl(TILES + encodeURIComponent(o.key), {
      showCreditsOnScreen: true,
      maximumScreenSpaceError: SSE_FAST,     // grezzo ma SUBITO
      cacheBytes: 384 * 1024 * 1024,
      maximumCacheOverflowBytes: 256 * 1024 * 1024,
      skipLevelOfDetail: true,               // niente livelli intermedi
      preferLeaves: true,
    }).then(function (ts) {
      if (!viewer || viewer.isDestroyed()) throw new Error('closed');
      tileset = ts;
      viewer.scene.primitives.add(ts);
      home();

      // Avanzamento vero: quante richieste restano in volo.
      var peak = 0;
      try {
        ts.loadProgress.addEventListener(function (pending, processing) {
          var total = pending + processing;
          if (total > peak) peak = total;
          setPct(peak ? (1 - total / peak) * 100 : 100);
        });
      } catch (e) {}

      var reveal = function () {
        setPct(100);
        if (load) { load.classList.add('gone'); setTimeout(function () { if (load && load.parentNode) load.parentNode.removeChild(load); }, 520); }
        // Ora che la prima vista c'è, si affina — senza far aspettare nessuno.
        try { ts.maximumScreenSpaceError = SSE_SHARP; } catch (e) {}
        if (!reduce) startOrbit();
        else setPressed(false);
      };
      var revealed = false;
      var once = function () { if (revealed) return; revealed = true; reveal(); };
      try { ts.initialTilesLoaded.addEventListener(once); } catch (e) {}
      // Rete lenta: dopo 9s si mostra comunque quel che c'è, invece di
      // tenere l'utente davanti a una barra.
      setTimeout(once, 9000);

      // ── orbita gentile, che si ferma appena l'utente prende il comando ──
      function setPressed(on) {
        var b = wrap && wrap.querySelector('[data-a="orbit"]');
        if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
        var h = wrap && wrap.querySelector('.prh');
        if (h) h.style.opacity = on ? '1' : '0';
      }
      function startOrbit() {
        if (orbitOff || !viewer) return;
        var heading = startHeading;
        var tick = function () {
          if (!viewer || viewer.isDestroyed()) return;
          heading += 0.0011;
          try { viewer.camera.lookAt(center, new C.HeadingPitchRange(heading, C.Math.toRadians(-30), 320)); } catch (e) {}
        };
        viewer.clock.onTick.addEventListener(tick);
        orbitOff = function () {
          try { viewer.clock.onTick.removeEventListener(tick); } catch (e) {}
          try { viewer.camera.lookAtTransform(C.Matrix4.IDENTITY); } catch (e) {}
          setPressed(false);
        };
        setPressed(true);
      }
      function stopOrbit() { if (orbitOff) { orbitOff(); orbitOff = null; } }

      // Qualsiasi interazione ferma l'orbita: chi tocca vuole guidare.
      try {
        var h = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
        h.setInputAction(stopOrbit, C.ScreenSpaceEventType.LEFT_DOWN);
        h.setInputAction(stopOrbit, C.ScreenSpaceEventType.WHEEL);
        try { h.setInputAction(stopOrbit, C.ScreenSpaceEventType.PINCH_START); } catch (e) {}
      } catch (e) {}

      // ── i comandi ──
      wrap.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('[data-a]');
        if (!b) return;
        var a = b.getAttribute('data-a');
        if (a === 'close') return close();
        if (a === 'in') return zoom(1);
        if (a === 'out') return zoom(-1);
        if (a === 'orbit') return orbitOff ? stopOrbit() : startOrbit();
        if (a === 'reset') { stopOrbit(); home(); return; }
        if (a === 'pano') {
          return window.open('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='
            + o.lat + ',' + o.lng, '_blank', 'noopener');
        }
        if (a === 'full') {
          try {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (wrap.requestFullscreen) wrap.requestFullscreen();
          } catch (e) {}
        }
      });
    });
  }).catch(function (err) { close(); throw err; });
}

window.BoomPhotoreal = { open: open, close: close };
})();
