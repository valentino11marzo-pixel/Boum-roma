/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Ambient Engine — sectional generative backgrounds  ·  boom-ambient.js

   One canvas, many scenes. Each page section declares its ambience:
       <section data-ambient="oculus">…</section>
   As the user scrolls, the engine cross-fades between the scenes of the
   sections that dominate the viewport. Separately, the page can shift the
   MOOD — how alive the ambience is — to match what the user is doing:

       BoomAmbient.mood('browse')   exploring: full tempo, full presence
       BoomAmbient.mood('read')     reading:   slower, quieter
       BoomAmbient.mood('focus')    overlay/sheet open: dimmed, almost still
       BoomAmbient.mood('convert')  paying/applying: near-still, zero noise

   Scenes (Rome-iconic, generative, no assets):
       oculus      Pantheon coffers + drifting sun-shaft        (statement)
       cosmati     quiet Cosmatesque rosette field              (browse)
       velluto     breathing velvet gradient, zero geometry     (read/trust)
       meandro     Greek-key circuit with a running light pulse (money)
       contorni    topographic contour lines of a hill          (zones/map)
       aurum       molten-gold flow field                       (editorial)
       sampietrini fan-laid setts with light ripples            (footer)

   Engineering: single rAF; DPR≤1.75; pauses when tab hidden; honours
   prefers-reduced-motion (static frame) and saveData/low deviceMemory
   (drops to the calmest static rendering). Idempotent. No dependencies.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.BoomAmbient) return;

  var TAU = Math.PI * 2;
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var LITE = !!((navigator.connection && navigator.connection.saveData) || (navigator.deviceMemory && navigator.deviceMemory <= 2));
  var STATIC_ONLY = REDUCE || LITE;

  // Palette is mutable so each mount can recolor the scene library (one engine
  // instance per page). Defaults: refined gold #D9B45B / highlight #F2D27C.
  var PAL = { a: '217,180,91', b: '242,210,124' };
  function gold(al) { return 'rgba(' + PAL.a + ',' + al + ')'; }
  function warm(al) { return 'rgba(' + PAL.b + ',' + al + ')'; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function fract(x) { return x - Math.floor(x); }
  function hash2(x, y) { return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    var u = smooth(xf), v = smooth(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  /* ── scene library — each: { build(W,H), draw(ctx,t,k,dt) } ────────────── */
  var SCENES = {};

  SCENES.oculus = function () {
    var W, H, cx, cy, Rmax, rings = 6, sectors = 24, radAt, coffers;
    return {
      build: function (w, h) {
        W = w; H = h; cx = w * 0.76; cy = h * 0.24; Rmax = Math.min(w, h) * 0.85;
        radAt = function (kk) { return Rmax * Math.pow(0.8, rings - kk); };
        coffers = [];
        for (var i = 0; i < sectors; i++) {
          var a0 = i / sectors * TAU, a1 = (i + 1) / sectors * TAU;
          for (var kk = 0; kk < rings; kk++) coffers.push({ a0: a0, a1: a1, am: (a0 + a1) / 2, r0: radAt(kk), r1: radAt(kk + 1) });
        }
      },
      draw: function (ctx, t, k) {
        var beam = Math.sin(t * 0.08) * Math.PI;
        for (var g = 0; g <= rings; g++) { ctx.beginPath(); ctx.arc(cx, cy, radAt(g), 0, TAU); ctx.strokeStyle = gold(0.06 * k); ctx.lineWidth = 0.6; ctx.stroke(); }
        for (var i = 0; i < coffers.length; i++) {
          var c = coffers[i], da = Math.atan2(Math.sin(c.am - beam), Math.cos(c.am - beam)), lit = Math.max(0, Math.cos(da));
          var pr = (c.r1 - c.r0) * 0.16, pa = (c.a1 - c.a0) * 0.30, A0 = c.a0 + pa, A1 = c.a1 - pa, R0 = c.r0 + pr, R1 = c.r1 - pr;
          ctx.beginPath();
          ctx.moveTo(cx + R0 * Math.cos(A0), cy + R0 * Math.sin(A0)); ctx.lineTo(cx + R1 * Math.cos(A0), cy + R1 * Math.sin(A0));
          ctx.lineTo(cx + R1 * Math.cos(A1), cy + R1 * Math.sin(A1)); ctx.lineTo(cx + R0 * Math.cos(A1), cy + R0 * Math.sin(A1)); ctx.closePath();
          ctx.strokeStyle = gold((0.05 + 0.11 * (c.r0 / Rmax) + lit * 0.18) * k); ctx.lineWidth = 0.7; ctx.stroke();
          if (lit > 0.6) { ctx.fillStyle = warm((lit - 0.55) * 0.08 * k); ctx.fill(); }
        }
        var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radAt(1) * 1.5);
        grd.addColorStop(0, warm(0.18 * k)); grd.addColorStop(1, gold(0));
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, radAt(1) * 1.5, 0, TAU); ctx.fill();
      }
    };
  };

  SCENES.cosmati = function () {
    var W, H, cells;
    return {
      build: function (w, h) {
        W = w; H = h; cells = [];
        var rnd = mulberry32(9161), g = Math.max(170, Math.min(250, Math.hypot(w, h) * 0.14));
        for (var y = -g / 2; y < H + g; y += g) for (var x = -g / 2; x < W + g; x += g)
          cells.push({ x: x, y: y, r: g * (0.32 + rnd() * 0.05), teeth: 6 + 2 * (rnd() * 3 | 0), ph: rnd() * TAU });
      },
      draw: function (ctx, t, k) {
        var sx = (((t * 0.04) % 1.6) - 0.3) * (W + H);
        for (var i = 0; i < cells.length; i++) {
          var c = cells[i], lit = Math.max(0, 1 - Math.abs((c.x + c.y) - sx) / (W * 0.22));
          var op = (0.10 + 0.02 * Math.sin(t * 0.25 + c.ph) + lit * 0.26) * k;
          ctx.save(); ctx.translate(c.x, c.y);
          for (var r = 0; r < 3; r++) { ctx.beginPath(); ctx.arc(0, 0, c.r * (0.4 + 0.3 * r), 0, TAU); ctx.strokeStyle = gold(op - r * 0.015); ctx.lineWidth = 0.8; ctx.stroke(); }
          ctx.beginPath();
          for (var n = 0; n <= 90; n++) { var th = n / 90 * TAU, rad = c.r * (1 + 0.15 * Math.cos(c.teeth * th)); n ? ctx.lineTo(rad * Math.cos(th), rad * Math.sin(th)) : ctx.moveTo(rad * Math.cos(th), rad * Math.sin(th)); }
          ctx.strokeStyle = (lit > 0.4 ? warm : gold)(op * 0.9); ctx.lineWidth = 0.7; ctx.stroke();
          ctx.restore();
        }
      }
    };
  };

  SCENES.velluto = function () {
    var W, H;
    return {
      build: function (w, h) { W = w; H = h; },
      draw: function (ctx, t, k) {
        var breathe = 0.5 + 0.5 * Math.sin(t * 0.22);
        var g1 = ctx.createRadialGradient(W * 0.22, H * 0.3, 0, W * 0.22, H * 0.3, Math.max(W, H) * (0.5 + breathe * 0.06));
        g1.addColorStop(0, gold(0.045 * k)); g1.addColorStop(1, gold(0));
        ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
        var g2 = ctx.createRadialGradient(W * 0.82, H * 0.75, 0, W * 0.82, H * 0.75, Math.max(W, H) * (0.44 + (1 - breathe) * 0.06));
        g2.addColorStop(0, warm(0.035 * k)); g2.addColorStop(1, gold(0));
        ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      }
    };
  };

  SCENES.meandro = function () {
    var W, H, rows;
    function keyRow(y, u, off) {
      var pts = [], x = -u * 4 + off;
      while (x < W + u * 4) {
        pts.push([x, y], [x, y - u], [x + u * 2, y - u], [x + u * 2, y + u], [x + u, y + u], [x + u, y], [x + u * 3, y]);
        x += u * 3;
      }
      return pts;
    }
    return {
      build: function (w, h) {
        W = w; H = h; rows = [];
        var u = Math.max(22, Math.min(34, h * 0.032));
        for (var y = u * 2; y < H; y += u * 4.4) rows.push(keyRow(y, u, (y * 7) % (u * 3)));
      },
      draw: function (ctx, t, k) {
        for (var r = 0; r < rows.length; r++) {
          var pts = rows[r];
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.strokeStyle = gold(0.11 * k); ctx.lineWidth = 0.9; ctx.stroke();
          if (STATIC_ONLY) continue;
          var L = 0; for (var q = 1; q < pts.length; q++) L += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]);
          var head = ((t * 0.14 + r * 0.17) % 1) * L, tail = head - L * 0.08, acc = 0;
          ctx.lineWidth = 2; ctx.lineCap = 'round';
          for (var s = 1; s < pts.length; s++) {
            var seg = Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1]), a = acc, b = acc + seg;
            if (b > tail && a < head) {
              var f0 = Math.max(0, (tail - a) / seg), f1 = Math.min(1, (head - a) / seg);
              ctx.beginPath();
              ctx.moveTo(pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * f0, pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * f0);
              ctx.lineTo(pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * f1, pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * f1);
              ctx.strokeStyle = warm(0.5 * k); ctx.stroke();
            }
            acc = b;
          }
          ctx.lineCap = 'butt';
        }
      }
    };
  };

  SCENES.contorni = function () {
    var W, H, lines;
    return {
      build: function (w, h) {
        W = w; H = h; lines = [];
        // topographic contours of a synthetic hill field (i sette colli)
        for (var lvl = 0; lvl < 9; lvl++) lines.push(0.25 + lvl * 0.065);
      },
      draw: function (ctx, t, k) {
        var drift = STATIC_ONLY ? 0 : t * 0.02;
        for (var li = 0; li < lines.length; li++) {
          var iso = lines[li];
          ctx.beginPath();
          var started = false;
          for (var x = 0; x <= W; x += 8) {
            // march a contour: for each x find y where field ≈ iso (coarse but smooth)
            var best = -1, bestD = 1e9;
            for (var y = 0; y <= H; y += 8) {
              var v = vnoise(x * 0.0022 + drift, y * 0.0026) * 0.7 + vnoise(x * 0.0007, y * 0.0009) * 0.3;
              var d = Math.abs(v - iso);
              if (d < bestD) { bestD = d; best = y; }
            }
            if (bestD < 0.02) { started ? ctx.lineTo(x, best) : ctx.moveTo(x, best); started = true; }
            else started = false;
          }
          ctx.strokeStyle = gold((0.10 + (li % 3 === 0 ? 0.06 : 0)) * k);
          ctx.lineWidth = li % 3 === 0 ? 1.1 : 0.6;
          ctx.stroke();
        }
      }
    };
  };

  SCENES.aurum = function () {
    var W, H, parts, N;
    function field(x, y, t) { var s = 0.0016; return vnoise(x * s + t * 0.04, y * s) * TAU * 2 + vnoise(x * s * 2.1, y * s * 2.1 - t * 0.03) * TAU; }
    return {
      trails: true,
      build: function (w, h) {
        W = w; H = h; N = Math.max(140, Math.min(420, (w * h) / 6000 | 0)); parts = [];
        var rnd = mulberry32(2718);
        for (var i = 0; i < N; i++) parts.push({ x: rnd() * w, y: rnd() * h, life: rnd(), sp: 0.5 + rnd() });
      },
      draw: function (ctx, t, k, dt) {
        ctx.globalCompositeOperation = 'lighter';
        var step = STATIC_ONLY ? 0 : (dt || 16) * 0.055;
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i], px = p.x, py = p.y;
          if (!STATIC_ONLY) {
            var a = field(p.x, p.y, t);
            p.x += Math.cos(a) * p.sp * step; p.y += Math.sin(a) * p.sp * step; p.life -= 0.004;
            if (p.life <= 0 || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) { p.x = Math.random() * W; p.y = Math.random() * H; px = p.x; py = p.y; p.life = 1; }
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = (p.sp > 1.1 ? warm : gold)(0.20 * p.life * k); ctx.lineWidth = 1.2; ctx.stroke();
          } else {
            var a2 = field(p.x, p.y, 0);
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a2) * 9, p.y + Math.sin(a2) * 9);
            ctx.strokeStyle = gold(0.18 * k); ctx.lineWidth = 1.2; ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  };

  SCENES.sampietrini = function () {
    var W, H, setts, ripples;
    return {
      build: function (w, h) {
        W = w; H = h; setts = []; ripples = [];
        var rnd = mulberry32(4471), pitch = Math.max(26, Math.min(40, Math.hypot(w, h) * 0.024)), row = 0;
        for (var y = -pitch; y < H + pitch; y += pitch * 0.92) {
          var dir = row % 2 ? 1 : -1;
          for (var x = -pitch; x < W + pitch; x += pitch)
            setts.push({ x: x + (rnd() - 0.5) * pitch * 0.28, y: y + (rnd() - 0.5) * pitch * 0.28, s: pitch * (0.34 + rnd() * 0.1), rot: dir * 0.5 + (rnd() - 0.5) * 0.5, tone: 0.08 + rnd() * 0.06 });
          row++;
        }
      },
      draw: function (ctx, t, k, dt) {
        if (!STATIC_ONLY && ripples.length < 4 && Math.random() < 0.025) ripples.push({ x: Math.random() * W, y: Math.random() * H, r: 0, life: 1 });
        for (var i = ripples.length - 1; i >= 0; i--) { var rp = ripples[i]; rp.r += (dt || 16) * 0.15; rp.life -= (dt || 16) * 0.0008; if (rp.life <= 0) ripples.splice(i, 1); }
        for (var s = 0; s < setts.length; s++) {
          var st = setts[s], lit = 0;
          for (var j = 0; j < ripples.length; j++) { var d = Math.abs(Math.hypot(st.x - ripples[j].x, st.y - ripples[j].y) - ripples[j].r); if (d < 34) lit = Math.max(lit, (1 - d / 34) * ripples[j].life); }
          ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.rot);
          ctx.fillStyle = (lit > 0.25 ? warm : gold)((st.tone + lit * 0.6) * k);
          var s2 = st.s;
          ctx.beginPath(); ctx.moveTo(-s2, -s2 * 0.86); ctx.lineTo(s2, -s2 * 0.7); ctx.lineTo(s2 * 0.9, s2 * 0.86); ctx.lineTo(-s2 * 0.9, s2 * 0.7); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    };
  };

  /* ── moods: how alive the ambience is, by what the user is doing ────────── */
  var MOODS = {
    browse:  { tempo: 1,    presence: 1    },
    read:    { tempo: 0.45, presence: 0.6  },
    focus:   { tempo: 0.2,  presence: 0.35 },
    convert: { tempo: 0.08, presence: 0.22 }
  };

  /* ── engine ──────────────────────────────────────────────────────────────── */
  function mount(opts) {
    opts = opts || {};
    if (opts.palette) { PAL.a = opts.palette.a || PAL.a; PAL.b = opts.palette.b || PAL.b; }
    var INKRGB = opts.inkRGB || '10,9,8';
    var wrap = document.createElement('div');
    wrap.setAttribute('data-boom-ambient', '');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:' + (opts.z != null ? opts.z : -1) + ';pointer-events:none;background:' + (opts.ink || '#0A0908') + ';overflow:hidden';
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    var veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;inset:0;background:radial-gradient(115% 95% at 50% 40%, rgba(' + INKRGB + ',.88) 0%, rgba(' + INKRGB + ',.55) 46%, rgba(' + INKRGB + ',.16) 74%, rgba(' + INKRGB + ',0) 100%)';
    wrap.appendChild(canvas); wrap.appendChild(veil);
    document.body.appendChild(wrap);

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var W = 0, H = 0;

    // active scene A→B crossfade state
    var cur = null, curKey = '', nxt = null, nxtKey = '', mix = 0;   // mix 1 → fully nxt
    var moodName = 'browse', mood = MOODS.browse, moodCur = { tempo: 1, presence: 1 };
    var raf = 0, running = false, last = 0, t0 = 0, sceneClock = 0;

    function instantiate(key) {
      if (!SCENES[key]) return null;
      var s = SCENES[key]();
      s.build(W, H);
      return s;
    }
    function resize() {
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cur) cur.build(W, H);
      if (nxt) nxt.build(W, H);
      if (!running) renderOnce();
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      var dt = Math.min(48, now - last); last = now;
      // ease mood
      moodCur.tempo += (mood.tempo - moodCur.tempo) * 0.06;
      moodCur.presence += (mood.presence - moodCur.presence) * 0.06;
      sceneClock += dt * 0.001 * moodCur.tempo;
      var t = sceneClock;
      // crossfade progress
      if (nxt) { mix = Math.min(1, mix + dt / 700); if (mix >= 1) { cur = nxt; curKey = nxtKey; nxt = null; nxtKey = ''; mix = 0; } }
      var anyTrails = (cur && cur.trails) || (nxt && nxt.trails);
      if (anyTrails) { ctx.fillStyle = 'rgba(' + INKRGB + ',0.09)'; ctx.fillRect(0, 0, W, H); }
      else ctx.clearRect(0, 0, W, H);
      var kBase = moodCur.presence * (opts.intensity != null ? opts.intensity : 1);
      if (cur) cur.draw(ctx, t, kBase * (nxt ? (1 - mix) : 1), dt);
      if (nxt) nxt.draw(ctx, t, kBase * mix, dt);
    }
    function start() { if (running || STATIC_ONLY) return; running = true; last = 0; t0 = performance.now(); raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function renderOnce() { ctx.clearRect(0, 0, W, H); if (cur) cur.draw(ctx, 0, MOODS[moodName].presence, 16); }

    function setScene(key) {
      if (key === curKey || key === nxtKey || !SCENES[key]) return;
      if (opts.onScene) { try { opts.onScene(key); } catch (e) {} }
      if (!cur) { cur = instantiate(key); curKey = key; if (STATIC_ONLY) renderOnce(); else start(); return; }
      nxt = instantiate(key); nxtKey = key; mix = 0;
      if (STATIC_ONLY) { cur = nxt; curKey = nxtKey; nxt = null; nxtKey = ''; renderOnce(); }
    }
    function setMood(name) {
      if (!MOODS[name]) return;
      moodName = name; mood = MOODS[name];
      wrap.style.transition = 'opacity .6s ease';
      wrap.style.opacity = String(0.4 + mood.presence * 0.6);
      if (STATIC_ONLY) renderOnce();
    }

    /* sections: watch every [data-ambient]; the one closest to viewport centre wins */
    var sections = [];
    function watchSections() {
      sections = [].slice.call(document.querySelectorAll('[data-ambient]'));
      if (!sections.length) return;
      var pick = function () {
        var mid = window.innerHeight * 0.45, best = null, bestD = 1e9;
        for (var i = 0; i < sections.length; i++) {
          var r = sections[i].getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) continue;
          var centre = (r.top + r.bottom) / 2, d = Math.abs(centre - mid);
          // a section covering the mid-line always wins
          if (r.top <= mid && r.bottom >= mid) d = -1;
          if (d < bestD) { bestD = d; best = sections[i]; }
        }
        if (best) setScene(best.getAttribute('data-ambient'));
      };
      var ticking = false;
      window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { pick(); ticking = false; }); } }, { passive: true });
      pick();
    }

    window.addEventListener('resize', (function () { var id; return function () { clearTimeout(id); id = setTimeout(resize, 180); }; })());
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : (curKey && start()); });

    resize();
    if (opts.scene) setScene(opts.scene);
    if (opts.sections !== false) { (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', watchSections, { once: true }) : watchSections(); }

    return {
      scene: setScene,
      mood: setMood,
      scenes: Object.keys(SCENES),
      moods: Object.keys(MOODS),
      destroy: function () { stop(); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  }

  window.BoomAmbient = { mount: mount, scenes: Object.keys(SCENES), moods: Object.keys(MOODS), reduce: REDUCE, lite: LITE };
})();
