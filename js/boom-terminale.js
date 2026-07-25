/* ════════════════════════════════════════════════════════════════════════
   BOOM Terminale — the airport/station experience layer of the home.

   Composes the Atelier "Terminale" on top of js/boom-solari.js:
   gate signage, platform gold line, station clock (real Rome time,
   Swiss minute-stop), boarding-pass stats, the living departures board
   (with a split-flap clock in its header, market lifecycle and real
   links into /apartments.html) and the optional synthesized Solari
   clack (Web Audio, muted by default, user-enabled via the AUDIO pill).

   Requires js/boom-solari.js loaded first (defer order in index.html).
   Everything degrades: no board element, no Web Audio, reduced motion —
   each subsystem simply rests.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BS = window.BoomSolari;
  if (!BS || !BS.Board) return;
  var Board = BS.Board;
  var Cell = BS.Cell;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DRUM_NUM = ' 0123456789HMIN€%';
  var DRUM_AZ = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·';

var _tbpState = null;

function applyTabellone() {
  removeTabellone();

  var hero = document.querySelector('.hero');
  if (!hero || typeof Board !== 'function') return;

  var AZ = (typeof DRUM_AZ !== 'undefined') ? DRUM_AZ
         : ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·';
  var staticOnly = (typeof reduced !== 'undefined') ? !!reduced
                 : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var ZONES = ['TRASTEVERE', 'MONTI', 'PRATI', 'TESTACCIO', 'PARIOLI'];
  var TIPI  = ['2BR', '1BR', 'STUDIO', '3BR', 'LOFT'];
  var STATI = ['AVAILABLE', 'NEW', 'BOOKED', 'AVAILABLE', 'LAST CALL'];
  var ZONE_POOL = ZONES.concat(
    ['S·GIOVANNI', 'FLAMINIO', 'AVENTINO', 'S·LORENZO', 'GARBATELLA']);
  var TIPO_POOL  = ['2BR', '1BR', 'STUDIO', '3BR', 'LOFT'];
  var STATO_POOL = ['AVAILABLE', 'AVAILABLE', 'NEW', 'BOOKED', 'LAST CALL'];

  var st = { panel: null, rows: [], touts: [], ivals: [],
             mq: null, onMq: null, built: false, lastRot: -1 };

  var panel = document.createElement('div');
  panel.className = 'tbp-panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML =
    '<div class="tbp-head">' +
      '<span>PARTENZE · DEPARTURES</span>' +
      '<span>ROMA — <i class="tbp-dot"></i>LIVE</span>' +
    '</div>' +
    '<div class="tbp-cols">' +
      '<span class="tbp-c1">DESTINAZIONE</span>' +
      '<span class="tbp-c2">TIPO</span>' +
      '<span class="tbp-c3">STATO</span>' +
    '</div>' +
    '<div class="tbp-rows"></div>';

  var rowsEl = panel.children[2];
  var i;
  for (i = 0; i < 5; i++) {
    var r = document.createElement('div'); r.className = 'tbp-row';
    var z = document.createElement('div'); z.className = 'tbp-zone';
    var t = document.createElement('div'); t.className = 'tbp-tipo';
    var s = document.createElement('div'); s.className = 'tbp-stato';
    r.appendChild(z); r.appendChild(t); r.appendChild(s);
    rowsEl.appendChild(r);
    st.rows.push({ zEl: z, tEl: t, sEl: s, zb: null, sb: null,
                   zone: ZONES[i], tipo: TIPI[i], stato: STATI[i] });
  }

  hero.appendChild(panel);
  st.panel = panel;

  function rotate() {
    if (document.hidden) return;
    var idx;
    do { idx = Math.floor(Math.random() * 5); } while (idx === st.lastRot);
    st.lastRot = idx;
    var used = {}, k, cand = [];
    for (k = 0; k < 5; k++) used[st.rows[k].zone] = 1;
    for (k = 0; k < ZONE_POOL.length; k++) {
      if (!used[ZONE_POOL[k]]) cand.push(ZONE_POOL[k]);
    }
    var row = st.rows[idx];
    row.zone  = cand[Math.floor(Math.random() * cand.length)] || row.zone;
    row.tipo  = TIPO_POOL[Math.floor(Math.random() * TIPO_POOL.length)];
    row.stato = STATO_POOL[Math.floor(Math.random() * STATO_POOL.length)];
    row.zb.show(row.zone, 26, true);
    row.sb.show(row.stato, 34, true);
    row.tEl.textContent = row.tipo;
  }

  function flutter() {
    if (document.hidden) return;
    var row = st.rows[Math.floor(Math.random() * 5)];
    var b = (Math.random() < 0.5) ? row.zb : row.sb;
    if (b) b.flutter();
  }

  function build() {
    if (st.built) return;
    if (st.mq && !st.mq.matches) return;
    st.built = true;
    var j;
    for (j = 0; j < 5; j++) {
      st.rows[j].zb = new Board(st.rows[j].zEl, 10, AZ);
      st.rows[j].sb = new Board(st.rows[j].sEl, 9, AZ);
    }
    if (staticOnly) {
      for (j = 0; j < 5; j++) {
        st.rows[j].zb.show(st.rows[j].zone);
        st.rows[j].sb.show(st.rows[j].stato);
        st.rows[j].tEl.textContent = st.rows[j].tipo;
      }
      return;
    }
    for (j = 0; j < 5; j++) (function (j2) {
      st.touts.push(setTimeout(function () {
        var row = st.rows[j2];
        row.zb.show(row.zone, 26, true);
        row.sb.show(row.stato, 34, true);
        row.tEl.textContent = row.tipo;
      }, 1400 + j2 * 120));
    })(j);
    st.ivals.push(setInterval(rotate, 11000));
    st.ivals.push(setInterval(flutter, 17000));
  }

  st.mq = window.matchMedia ? window.matchMedia('(min-width: 1100px)') : null;
  if (st.mq) {
    st.onMq = function () { build(); };
    if (st.mq.addEventListener) st.mq.addEventListener('change', st.onMq);
    else if (st.mq.addListener) st.mq.addListener(st.onMq);
  }
  st.touts.push(setTimeout(build, 0));

  _tbpState = st;
}

function removeTabellone() {
  var st = _tbpState;
  if (!st) return;
  var k;
  for (k = 0; k < st.touts.length; k++) clearTimeout(st.touts[k]);
  for (k = 0; k < st.ivals.length; k++) clearInterval(st.ivals[k]);
  if (st.mq && st.onMq) {
    if (st.mq.removeEventListener) st.mq.removeEventListener('change', st.onMq);
    else if (st.mq.removeListener) st.mq.removeListener(st.onMq);
  }
  if (st.panel && st.panel.parentNode) st.panel.parentNode.removeChild(st.panel);
  _tbpState = null;
}

function applySegnaletica() {
    var body = document.body;
    if (body && body.classList) { body.classList.add('segnaletica'); }
    var stats = document.querySelectorAll('.hero-stats');
    for (var i = 0; i < stats.length; i++) {
        stats[i].classList.add('linea-banchina');
    }
}

function removeSegnaletica() {
    var body = document.body;
    if (body && body.classList) { body.classList.remove('segnaletica'); }
    var marked = document.querySelectorAll('.linea-banchina');
    for (var j = 0; j < marked.length; j++) {
        marked[j].classList.remove('linea-banchina');
    }
}

/* IMBARCO 2.0 — applyImbarco()/removeImbarco(), ES5, idempotenti. */
function applyImbarco() {
    var body = document.body;
    var i, card, val, key, em, nt, nb;
    var cards = document.querySelectorAll('.hero-stats .hero-stat');
    if (!cards.length) cards = document.querySelectorAll('.hero-stat');

    var LINES = {
        '48H':  'NOW BOARDING · NO QUEUE',
        '98%':  'ON TIME · EVERY TIME',
        '2MIN': 'GATE 2MIN · SEAT 1A',
        '€0': 'ALL CLEAR · €0 EXTRA'
    };
    var FALLBACK = [
        'NOW BOARDING · NO QUEUE',
        'ON TIME · EVERY TIME',
        'GATE 2MIN · SEAT 1A',
        'ALL CLEAR · €0 EXTRA'
    ];

    for (i = 0; i < cards.length; i++) {
        card = cards[i];

        /* Tacche di perforazione (una volta sola) */
        if (!card.querySelector('.imbarco-notch')) {
            nt = document.createElement('i');
            nt.className = 'imbarco-notch imbarco-notch-t';
            nb = document.createElement('i');
            nb.className = 'imbarco-notch imbarco-notch-b';
            card.appendChild(nt);
            card.appendChild(nb);
        }

        /* Microcopy sotto il valore (sibling del valore, MAI dentro:
           Board() svuota il contenuto di .hero-stat-value) */
        if (!card.querySelector('.imbarco-line')) {
            val = card.querySelector('.hero-stat-value');
            key = val ? (val.getAttribute('data-flap') || '').replace(/\s+/g, '').toUpperCase() : '';
            em = document.createElement('em');
            em.className = 'imbarco-line';
            em.appendChild(document.createTextNode(LINES[key] || FALLBACK[i % 4]));
            if (val && val.nextSibling) {
                card.insertBefore(em, val.nextSibling);
            } else if (val) {
                card.appendChild(em);
            } else {
                card.appendChild(em);
            }
        }
    }

    var wasOff = !body.classList.contains('imbarco');
    body.classList.add('imbarco');

    /* Cerimonia una tantum, solo alla prima attivazione, mai in reduced */
    var isReduced = (typeof reduced !== 'undefined') ? reduced :
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (wasOff && !isReduced) {
        body.classList.remove('imbarco-enter');
        void body.offsetWidth; /* reflow: riparte pulita anche dopo un remove/apply */
        body.classList.add('imbarco-enter');
        if (applyImbarco._t) clearTimeout(applyImbarco._t);
        applyImbarco._t = setTimeout(function () {
            body.classList.remove('imbarco-enter');
            applyImbarco._t = null;
        }, 1000); /* 450ms + 240ms stagger + margine */
    }
}

function removeImbarco() {
    var body = document.body;
    var i, junk;
    if (applyImbarco._t) {
        clearTimeout(applyImbarco._t);
        applyImbarco._t = null;
    }
    body.classList.remove('imbarco-enter');
    body.classList.remove('imbarco');
    junk = document.querySelectorAll('.imbarco-notch, .imbarco-line');
    for (i = 0; i < junk.length; i++) {
        if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]);
    }
}

(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var GOLD = '#FFD700';
  var S = null;

  function prefersReduced() {
    if (typeof reduced !== 'undefined') return !!reduced;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Offset Roma vs UTC via Intl (gestisce l'ora legale, niente +1/+2 fissi) */
  function romeOffsetMs() {
    try {
      var now = Date.now();
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).formatToParts(new Date(now));
      var m = {}, i;
      for (i = 0; i < parts.length; i++) m[parts[i].type] = parts[i].value;
      var wall = Date.UTC(
        parseInt(m.year, 10), parseInt(m.month, 10) - 1, parseInt(m.day, 10),
        parseInt(m.hour, 10) % 24, parseInt(m.minute, 10), parseInt(m.second, 10)
      );
      return wall - Math.floor(now / 1000) * 1000;
    } catch (e) {
      return -new Date().getTimezoneOffset() * 60000;
    }
  }

  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    t = t - 1;
    return 1 + c3 * t * t * t + c1 * t * t;
  }

  /* Quadrante statico pre-renderizzato una volta (blit ad ogni frame) */
  function drawFace(c2) {
    var c = 36, r = 33, i, a, card, len, o1, o2;
    c2.beginPath(); c2.arc(c, c, r, 0, TAU);
    c2.fillStyle = '#0A0A0A'; c2.fill();
    c2.lineWidth = 1; c2.strokeStyle = 'rgba(255,215,0,0.3)'; c2.stroke();
    c2.lineCap = 'butt';
    for (i = 0; i < 12; i++) {
      a = i * TAU / 12; card = (i % 3 === 0);
      len = card ? 7 : 4;
      o1 = r - 3; o2 = r - 3 - len;
      c2.beginPath();
      c2.moveTo(c + Math.sin(a) * o1, c - Math.cos(a) * o1);
      c2.lineTo(c + Math.sin(a) * o2, c - Math.cos(a) * o2);
      c2.lineWidth = card ? 2 : 1.2;
      c2.strokeStyle = card ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.38)';
      c2.stroke();
    }
  }

  function hand(ctx, a, tail, len, w, color) {
    var c = 36, sa = Math.sin(a), ca = Math.cos(a);
    ctx.beginPath();
    ctx.moveTo(c + sa * tail, c - ca * tail);
    ctx.lineTo(c + sa * len, c - ca * len);
    ctx.lineCap = 'round'; ctx.lineWidth = w; ctx.strokeStyle = color;
    ctx.stroke();
  }

  function render(hA, mA, sA) {
    var ctx = S.ctx, c = 36, tx, ty;
    ctx.clearRect(0, 0, 72, 72);
    ctx.drawImage(S.face, 0, 0, 72, 72);
    hand(ctx, hA, -5, 16, 3.4, 'rgba(255,255,255,0.85)');
    hand(ctx, mA, -6, 25, 2.2, 'rgba(255,255,255,0.85)');
    hand(ctx, sA, -8, 17.5, 1.1, GOLD);
    tx = c + Math.sin(sA) * 19.5; ty = c - Math.cos(sA) * 19.5;
    ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, TAU); ctx.fillStyle = GOLD; ctx.fill();
    ctx.beginPath(); ctx.arc(c, c, 2, 0, TAU); ctx.fillStyle = GOLD; ctx.fill();
  }

  /* Minute-stop svizzero: giro dei secondi in 58.5s, sosta al 12,
     scatto dei minuti con micro-overshoot meccanico */
  function angles(nowMs, perfTs) {
    var total = nowMs + S.off;
    var minTotal = Math.floor(total / 60000);
    var secFrac = (total % 60000) / 1000;
    if (S.lastMin === null) { S.lastMin = minTotal; S.stepAt = -1e9; }
    else if (minTotal !== S.lastMin) { S.lastMin = minTotal; S.stepAt = perfTs; }
    var p = (perfTs - S.stepAt) / 300;
    if (p < 0) p = 0;
    var minPos = (p >= 1) ? minTotal : (minTotal - 1 + easeOutBack(p));
    var sweep = secFrac / 58.5; if (sweep > 1) sweep = 1;
    return {
      h: ((total / 3600000) % 12) / 12 * TAU,
      m: (minPos % 60) / 60 * TAU,
      s: sweep * TAU
    };
  }

  function loop(ts) {
    S.raf = requestAnimationFrame(loop);
    if (window.innerWidth < 1100) return; /* nascosto dal CSS: zero lavoro */
    var now = Date.now();
    if (now - S.offSync > 60000) { S.off = romeOffsetMs(); S.offSync = now; }
    var a = angles(now, ts);
    var e = 1, t;
    if (S.mount === null) S.mount = ts;
    t = (ts - S.mount) / 1200;
    if (t < 1) { t = 1 - t; e = 1 - t * t * t; } /* cerimonia: carica da mezzogiorno */
    render(a.h * e, a.m * e, a.s * e);
  }

  function drawStatic() {
    S.off = romeOffsetMs();
    var total = Date.now() + S.off;
    render(
      ((total / 3600000) % 12) / 12 * TAU,
      (Math.floor(total / 60000) % 60) / 60 * TAU,
      Math.floor((total % 60000) / 1000) / 60 * TAU
    );
  }

  window.removeOrologio = function () {
    if (S) {
      if (S.raf) cancelAnimationFrame(S.raf);
      if (S.timer) clearInterval(S.timer);
      if (S.onVis) document.removeEventListener('visibilitychange', S.onVis);
      S = null;
    }
    var old = document.querySelectorAll('.stclk'), i;
    for (i = 0; i < old.length; i++) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
  };

  window.applyOrologio = function () {
    window.removeOrologio();

    var host = document.createElement('div');
    host.className = 'stclk';
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', 'Orologio di stazione: ora locale di Roma');
    var cv = document.createElement('canvas');
    cv.className = 'stclk-dial';
    var cap = document.createElement('div');
    cap.className = 'stclk-cap';
    cap.textContent = 'ROMA';
    host.appendChild(cv); host.appendChild(cap);
    document.body.appendChild(host);

    var dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    cv.width = 72 * dpr; cv.height = 72 * dpr;
    cv.style.width = '72px'; cv.style.height = '72px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var face = document.createElement('canvas');
    face.width = 72 * dpr; face.height = 72 * dpr;
    var fx = face.getContext('2d');
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFace(fx);

    S = {
      host: host, ctx: ctx, face: face,
      raf: 0, timer: 0, mount: null,
      off: romeOffsetMs(), offSync: Date.now(),
      lastMin: null, stepAt: -1e9,
      reduced: prefersReduced(), onVis: null
    };

    S.onVis = function () {
      if (!S) return;
      if (document.hidden) {
        if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
        return;
      }
      S.off = romeOffsetMs(); S.offSync = Date.now();
      if (S.reduced) { drawStatic(); return; }
      S.lastMin = null;                       /* nessuno scatto-fantasma al rientro */
      if (S.mount !== null) S.mount = -1e9;   /* cerimonia solo la prima volta */
      if (!S.raf) S.raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', S.onVis);

    if (S.reduced) {
      drawStatic();
      S.timer = setInterval(function () {
        if (S && !document.hidden) drawStatic();
      }, 30000);
      host.className = 'stclk on';
    } else {
      if (!document.hidden) S.raf = requestAnimationFrame(loop);
      requestAnimationFrame(function () {
        if (S) S.host.className = 'stclk on';
      });
    }
  };
})();

/* BOOM Roma — IL CLACK: suono Solari sintetizzato (Web Audio, zero asset).
   Muto di default. ES5, idempotente, no-op se Web Audio manca. */
(function () {
  'use strict';

  /* ---------- factory ---------- */
  function BoomClack() {
    var ctx = null;          /* AudioContext: creato LAZY alla prima enable() */
    var master = null;       /* gain di uscita */
    var noiseBuf = null;     /* rumore bianco precalcolato (~60ms) */
    var on = false;
    var lastAt = 0;          /* timestamp ultimo clack */
    var THROTTLE_MS = 45;    /* mai piu' di un clack ogni 45ms */
    var CASCADE_MS = 220;    /* clack ravvicinati = cascata -> intensita' ridotta */
    var CASCADE_CAP = 0.35;

    function ensureCtx() {
      if (ctx) return ctx;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 1;
        master.connect(ctx.destination);
        var len = Math.max(1, Math.floor(ctx.sampleRate * 0.06));
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; master = null; noiseBuf = null; }
      return ctx;
    }

    function enable() {
      try {
        if (!ensureCtx()) return false;
        on = true;
        if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e2) {} }
        return true;
      } catch (e) { return false; }
    }

    function disable() {
      on = false;
      try { if (ctx && ctx.suspend) ctx.suspend(); } catch (e) {}
    }

    function toggle() {
      if (on) { disable(); return false; }
      return enable();
    }

    function isEnabled() { return on; }

    /* UN clack: burst di rumore in bandpass + tick sinusoidale per il corpo meccanico */
    function play(intensity) {
      if (!on || !ctx || !noiseBuf) return;
      try {
        var now = (window.performance && performance.now) ? performance.now() : +new Date();
        var since = now - lastAt;
        if (since < THROTTLE_MS) return;                 /* throttle assoluto */
        var cascading = since < CASCADE_MS;
        lastAt = now;

        if (intensity == null || isNaN(intensity)) intensity = 0.6;
        if (intensity < 0) intensity = 0;
        if (intensity > 1) intensity = 1;
        if (cascading && intensity > CASCADE_CAP) intensity = CASCADE_CAP;
        if (intensity <= 0.001) return;

        var t0 = ctx.currentTime;
        var burstDur = 0.018 + Math.random() * 0.012;    /* 18-30ms */
        var decay = 0.04 + Math.random() * 0.02;         /* env 40-60ms */

        /* master gain del singolo clack: 0.1 * intensity */
        var clackGain = ctx.createGain();
        clackGain.gain.value = 0.1 * intensity;
        clackGain.connect(master);

        /* (a) burst di rumore -> bandpass ~2400Hz Q1.2, varianza ±15% */
        var src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2400 * (0.85 + Math.random() * 0.30);
        bp.Q.value = 1.2;
        var gN = ctx.createGain();
        gN.gain.setValueAtTime(1.0, t0);
        gN.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
        src.connect(bp); bp.connect(gN); gN.connect(clackGain);
        src.start(t0);
        src.stop(t0 + Math.max(burstDur, decay));

        /* (b) tick sinusoidale 6ms ~1100Hz: il corpo meccanico */
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1100 * (0.95 + Math.random() * 0.10);
        var gT = ctx.createGain();
        gT.gain.setValueAtTime(0.5, t0);
        gT.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.006);
        osc.connect(gT); gT.connect(clackGain);
        osc.start(t0);
        osc.stop(t0 + 0.008);
      } catch (e) { /* silenzio: il suono non deve mai rompere la pagina */ }
    }

    return { enable: enable, disable: disable, toggle: toggle, enabled: isEnabled, play: play };
  }

  /* ---------- istanza globale (idempotente) ---------- */
  if (!window.__clack) window.__clack = BoomClack();
  window.BoomClack = BoomClack;

  /* ---------- toggle UI ---------- */
  var TOGGLE_ID = 'boom-audio-toggle';

  function syncToggle(btn) {
    var isOn = false;
    try { isOn = !!(window.__clack && window.__clack.enabled()); } catch (e) {}
    btn.textContent = isOn ? 'AUDIO ON' : 'AUDIO OFF';
    btn.className = isOn ? 'boom-audio-toggle is-on' : 'boom-audio-toggle';
    btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
  }

  function mountAudioToggle() {
    var existing = document.getElementById(TOGGLE_ID);
    if (existing) { syncToggle(existing); return existing; }   /* idempotente */
    var btn = document.createElement('button');
    btn.id = TOGGLE_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Suono del tabellone');
    btn.addEventListener('click', function () {
      var nowOn = false;
      try { nowOn = window.__clack.toggle(); } catch (e) {}
      syncToggle(btn);
      if (nowOn) {
        /* un solo clack di conferma; micro-ritardo per lasciare completare resume() */
        window.setTimeout(function () {
          try { window.__clack.play(0.6); } catch (e2) {}
        }, 60);
      }
    });
    syncToggle(btn);
    document.body.appendChild(btn);
    return btn;
  }

  function unmountAudioToggle() {
    var el = document.getElementById(TOGGLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  window.mountAudioToggle = mountAudioToggle;
  window.unmountAudioToggle = unmountAudioToggle;

  /* auto-mount: il toggle esiste anche con prefers-reduced-motion
     (il suono non e' motion — resta comunque muto finche' l'utente non lo accende) */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { mountAudioToggle(); });
  } else {
    mountAudioToggle();
  }
})();

/* ── L'OROLOGIO FLAP DEL TABELLONE ─────────────────────────────────────
   makeFlapClock(hostEl) -> { destroy }
   HH:MM di Roma in celle split-flap nella testata del tabellone.
   Usa le primitive di pagina: Board, DRUM_NUM, reduced. ES5 puro. */
function makeFlapClock(hostEl) {
  if (!hostEl) return { destroy: function () {} };
  if (hostEl._fclk && hostEl._fclk.destroy) hostEl._fclk.destroy(); /* idempotente */

  hostEl.textContent = '';
  hostEl.classList.add('fclk');

  var hhHost = document.createElement('span'); hhHost.className = 'fclk-b';
  var sep    = document.createElement('s');    sep.className    = 'fclk-sep';
  sep.textContent = ':';
  var mmHost = document.createElement('span'); mmHost.className = 'fclk-b';
  hostEl.appendChild(hhHost);
  hostEl.appendChild(sep);
  hostEl.appendChild(mmHost);

  var hh = new Board(hhHost, 2, DRUM_NUM);
  var mm = new Board(mmHost, 2, DRUM_NUM);

  /* Ora di Roma DST-safe via Intl (formatToParts). MAI +1 fisso:
     se Intl manca del tutto, si ripiega sull'ora locale del device. */
  var fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false
    });
    if (!fmt.formatToParts) fmt = null;
  } catch (e) { fmt = null; }

  function pad2(s) { s = String(s); return s.length < 2 ? '0' + s : s; }

  function romeHM() {                          /* -> 'HHMM' */
    if (fmt) {
      var p = fmt.formatToParts(new Date()), h = '00', m = '00', i;
      for (i = 0; i < p.length; i++) {
        if (p[i].type === 'hour') h = p[i].value;
        else if (p[i].type === 'minute') m = p[i].value;
      }
      if (h === '24') h = '00';                /* quirk h24 di alcuni engine */
      return pad2(h) + pad2(m);
    }
    var d = new Date();
    return pad2(d.getHours()) + pad2(d.getMinutes());
  }

  var cur = romeHM();
  var t2 = null;

  if (reduced) {                               /* mount: valore secco, zero cicli */
    hh.show(cur.slice(0, 2));
    mm.show(cur.slice(2));
  } else {                                     /* mini-cascata che scavalca i due punti */
    hh.show(cur.slice(0, 2), 70, true);
    t2 = setTimeout(function () { mm.show(cur.slice(2), 70, true); t2 = null; }, 150);
  }

  /* un solo tick leggerissimo: confronta il minuto, scatta solo al cambio */
  var iv = setInterval(function () {
    if (document.hidden) return;               /* al rientro il primo tick riallinea */
    var now = romeHM();
    if (now === cur) return;
    cur = now;
    /* Board.show salta gia' le celle identiche: flippa solo cio' che cambia */
    hh.show(now.slice(0, 2), 70, !reduced);
    mm.show(now.slice(2), 70, !reduced);
  }, 1000);

  var api = {
    destroy: function () {
      if (iv) { clearInterval(iv); iv = null; }
      if (t2) { clearTimeout(t2); t2 = null; }
      hostEl.textContent = '';
      hostEl.classList.remove('fclk');
      hostEl._fclk = null;
    }
  };
  hostEl._fclk = api;
  return api;
}

/* ── tabelloneVita — ciclo di vita + interattività del tabellone partenze ──
   Riceve _tbpState (rows con zEl/tEl/sEl, boards zb/sb, zone/tipo/stato).
   UNA sola azione per giro (10–13s): la narrazione onesta del mercato —
   AVAILABLE → BOARDING → DEPARTED → sostituzione (NEW → AVAILABLE).
   Reduced motion: righe ferme, interattività intatta. Idempotente. */
function tabelloneVita(state) {
  var api = { destroy: function () {} };
  if (!state || !state.rows || !state.rows.length) return api;

  /* idempotente: una sola vita per tabellone */
  if (state._vita && typeof state._vita.destroy === 'function') state._vita.destroy();

  var noMotion = false;
  try {
    noMotion = (typeof reduced !== 'undefined') ? !!reduced
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  var finePointer = false;
  try { finePointer = window.matchMedia('(pointer: fine)').matches; } catch (e2) {}

  var ZONE_POOL = ['TRASTEVERE', 'MONTI', 'PRATI', 'TESTACCIO', 'PARIOLI',
    'S·GIOVANNI', 'FLAMINIO', 'AVENTINO', 'S·LORENZO', 'GARBATELLA'];
  var TIPO_POOL = ['2BR', '1BR', 'STUDIO', '3BR', 'LOFT'];

  var rows = state.rows;
  var destroyed = false;
  var timer = null;
  var age = [];            /* giri dall'ultimo cambiamento: l'anzianità decide */
  var addedClass = [];     /* [el, classe] aggiunte da noi, da togliere al destroy */

  function mark(el, cls) {
    if (el && el.classList && !el.classList.contains(cls)) {
      el.classList.add(cls);
      addedClass.push([el, cls]);
    }
  }

  function rowNode(row) {
    var el = row.zEl || row.sEl || row.tEl;
    while (el && el.classList) {
      if (el.classList.contains('tbp-row')) return el;
      el = el.parentNode;
    }
    return (row.zEl && row.zEl.parentNode) || null;
  }

  /* pannello: risali dalla prima riga, con fallback al selettore */
  var panel = null;
  (function () {
    var el = rows[0] && (rows[0].zEl || rows[0].sEl);
    while (el && el.classList) {
      if (el.classList.contains('tbp-panel')) { panel = el; return; }
      el = el.parentNode;
    }
    panel = document.querySelector('.tbp-panel');
  })();

  /* aggancia le classi che il CSS del sottosistema usa + sincronizza gli stati iniziali */
  var i, rn0;
  for (i = 0; i < rows.length; i++) {
    mark(rows[i].zEl, 'tbp-zona');
    mark(rows[i].sEl, 'tbp-stato');
    age.push(0);
    rn0 = rowNode(rows[i]);
    if (rn0) {
      if (rows[i].stato === 'BOARDING') rn0.classList.add('tbp-hot');
      if (rows[i].stato === 'DEPARTED') rn0.classList.add('tbp-gone');
    }
  }

  function flipStato(row, word) {
    row.stato = word;
    if (row.sb && row.sb.show) row.sb.show(word, 70, !noMotion);
    else if (row.sEl) row.sEl.textContent = word;
  }
  function flipZona(row, word) {
    row.zone = word;
    if (row.zb && row.zb.show) row.zb.show(word, 90, !noMotion);
    else if (row.zEl) row.zEl.textContent = word;
  }
  function setTipo(row, word) {
    row.tipo = word;
    if (row.tb && row.tb.show) row.tb.show(word, 90, !noMotion);
    else if (row.tEl) row.tEl.textContent = word;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function freshZone() {
    var used = {}, free = [], k;
    for (k = 0; k < rows.length; k++) used[rows[k].zone] = 1;
    for (k = 0; k < ZONE_POOL.length; k++) if (!used[ZONE_POOL[k]]) free.push(ZONE_POOL[k]);
    return free.length ? pick(free) : pick(ZONE_POOL);
  }
  function freshTipo(cur) {
    var t = pick(TIPO_POOL);
    if (t === cur) t = pick(TIPO_POOL);  /* un solo re-roll: la ripetizione resta possibile, com'è al vero */
    return t;
  }

  function census() {
    var c = { boarding: 0, departed: 0 }, k;
    for (k = 0; k < rows.length; k++) {
      if (rows[k].stato === 'BOARDING') c.boarding++;
      else if (rows[k].stato === 'DEPARTED') c.departed++;
    }
    return c;
  }

  /* UNA sola azione per giro — la voce del tabellone, mai un coro */
  function act() {
    var c = census(), k, r, rn;

    /* 1 — la riga partita viene sostituita da un nuovo arrivo */
    for (k = 0; k < rows.length; k++) {
      r = rows[k];
      if (r.stato === 'DEPARTED' && age[k] >= 1) {
        rn = rowNode(r);
        if (rn) { rn.classList.remove('tbp-gone'); rn.classList.remove('tbp-hot'); }
        flipZona(r, freshZone());
        setTipo(r, freshTipo(r.tipo));
        flipStato(r, 'NEW');
        age[k] = 0;
        return;
      }
    }

    /* 2 — il nuovo arrivo si assesta: NEW → AVAILABLE dopo un giro */
    for (k = 0; k < rows.length; k++) {
      r = rows[k];
      if (r.stato === 'NEW' && age[k] >= 1) {
        flipStato(r, 'AVAILABLE');
        age[k] = 0;
        return;
      }
    }

    /* 3 — il boarding si chiude: BOARDING → DEPARTED (mai 2 DEPARTED a bordo) */
    if (c.departed === 0) {
      for (k = 0; k < rows.length; k++) {
        r = rows[k];
        if (r.stato === 'BOARDING' && (age[k] >= 2 || (age[k] >= 1 && Math.random() < 0.35))) {
          flipStato(r, 'DEPARTED');
          rn = rowNode(r);
          if (rn) { rn.classList.remove('tbp-hot'); rn.classList.add('tbp-gone'); }
          age[k] = 0;
          return;
        }
      }
    }

    /* 4 — la disponibile più anziana entra in boarding (mai 2 BOARDING a bordo) */
    if (c.boarding === 0) {
      var best = -1, cand = [];
      for (k = 0; k < rows.length; k++) {
        r = rows[k];
        if ((r.stato === 'AVAILABLE' || r.stato === 'NEW') && age[k] >= 2) {
          if (age[k] > best) { best = age[k]; cand = [k]; }
          else if (age[k] === best) cand.push(k);
        }
      }
      if (cand.length) {
        k = cand[Math.floor(Math.random() * cand.length)];
        r = rows[k];
        flipStato(r, 'BOARDING');
        rn = rowNode(r);
        if (rn) rn.classList.add('tbp-hot');
        age[k] = 0;
        return;
      }
    }
    /* 5 — nessun evento maturo: il tabellone tace. Silenzio da stazione, non riempitivo. */
  }

  function tick() {
    timer = null;
    if (destroyed) return;
    if (!document.hidden) {
      for (var k = 0; k < rows.length; k++) age[k]++;
      act();
    }
    scheduleNext();
  }
  function scheduleNext() {
    if (destroyed || noMotion) return;             /* reduced: righe ferme */
    timer = setTimeout(tick, 10000 + Math.random() * 3000);   /* 10–13s */
  }

  /* ── interattività: solo puntatore fine ── */
  var invite = null;
  var onClick = null;
  if (panel && finePointer) {
    panel.classList.add('tbp-live');

    onClick = function (ev) {
      var t = ev.target;
      while (t && t !== panel) {
        if (t.classList && t.classList.contains('tbp-row')) {
          window.location.href = '/apartments.html';
          return;
        }
        t = t.parentNode;
      }
    };
    panel.addEventListener('click', onClick);

    invite = document.createElement('a');
    invite.className = 'tbp-invite';
    invite.href = '/apartments.html';
    invite.textContent = 'TUTTE LE PARTENZE → APARTMENTS';
    panel.appendChild(invite);
  }

  scheduleNext();

  api.destroy = function () {
    if (destroyed) return;
    destroyed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    var k, rn;
    for (k = 0; k < rows.length; k++) {
      rn = rowNode(rows[k]);
      if (rn) { rn.classList.remove('tbp-hot'); rn.classList.remove('tbp-gone'); }
    }
    for (k = 0; k < addedClass.length; k++) {
      addedClass[k][0].classList.remove(addedClass[k][1]);
    }
    if (panel) {
      panel.classList.remove('tbp-live');
      if (onClick) panel.removeEventListener('click', onClick);
    }
    if (invite && invite.parentNode) invite.parentNode.removeChild(invite);
    if (state._vita === api) state._vita = null;
  };

  state._vita = api;
  return api;
}

  /* ── la regia di produzione ── */
  function bootTerminale() {
    try {
      applySegnaletica();
      applyOrologio();
      applyImbarco();
      applyTabellone();

      /* un solo direttore per il tabellone */
      var st = _tbpState, k;
      if (st) {
        for (k = 0; k < st.ivals.length; k++) clearInterval(st.ivals[k]);
        st.ivals = [];
        if (!reduced) {
          st.ivals.push(setInterval(function () {
            if (document.hidden) return;
            var row = st.rows[Math.floor(Math.random() * 5)];
            var b = Math.random() < 0.5 ? row.zb : row.sb;
            if (b) b.flutter();
          }, 17000));
        }
        try { tabelloneVita(st); } catch (e0) {}
        try {
          var head = document.querySelector('.tbp-head');
          if (head && head.children[1]) {
            var host = document.createElement('span');
            host.style.fontSize = '10px';
            host.style.marginLeft = '10px';
            head.children[1].appendChild(host);
            makeFlapClock(host);
          }
        } catch (e1) {}
      }

      /* il clack sugli scatti delle celle (muto finche' l'utente non lo accende) */
      try {
        var _step = Cell.prototype.step;
        Cell.prototype.step = function (nc, done) {
          try { if (window.__clack) window.__clack.play(); } catch (e2) {}
          return _step.call(this, nc, done);
        };
      } catch (e3) {}

      /* DAYS risponde al cursore */
      (function () {
        if (!matchMedia('(hover: hover) and (pointer: fine)').matches || reduced) return;
        var w = document.getElementById('flapWord');
        var wb = BS.wordBoard;
        if (!w || !wb) return;
        var hov = false;
        w.addEventListener('pointerenter', function () {
          hov = true;
          wb.show('48H ', 70, true);
        });
        w.addEventListener('pointerleave', function () {
          hov = false;
          setTimeout(function () { if (!hov) wb.show('DAYS', 70, true); }, 900);
        });
      })();
    } catch (e) { /* ogni sottosistema riposa da solo, mai rompere la home */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootTerminale);
  } else {
    bootTerminale();
  }
})();
