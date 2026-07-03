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

  // ═══════════════════════ mode: COLLI (v2 — the seven hills, done right) ══
  // A smooth topographic field of seven gaussian hills + drifting breath.
  // Contours are extracted ONCE with interpolated marching squares (no wobble),
  // cached as segment lists; each frame draws them dim and lets a soft golden
  // "altitude light" breathe up and down the levels — the hills inhale.
  SCENES.colli = function () {
    var W, H, LEVELS = 11, layers;   // layers[i] = [x1,y1,x2,y2, ...]
    function field(hills, x, y) {
      var v = 0;
      for (var i = 0; i < hills.length; i++) {
        var h = hills[i], dx = (x - h.x) / h.r, dy = (y - h.y) / h.r;
        v += h.a * Math.exp(-(dx * dx + dy * dy));
      }
      return v + 0.08 * vnoise(x * 0.004, y * 0.004);
    }
    function build(w, h) {
      W = w; H = h; layers = [];
      var rnd = mulberry32(7771);
      // The seven, composed — a chain across the page like Rome seen from above,
      // each hill its own summit (smaller radii so they read as SEVEN, not one blob).
      var hills = [], m = Math.min(w, h);
      for (var i = 0; i < 7; i++) {
        var fx2 = 0.08 + 0.84 * (i / 6);                       // marching across
        var fy2 = 0.5 + 0.34 * Math.sin(i * 2.1 + 0.8)         // weaving up & down
                 + (rnd() - 0.5) * 0.12;
        hills.push({ x: w * fx2, y: h * fy2, r: m * (0.11 + rnd() * 0.07), a: 0.7 + rnd() * 0.5 });
      }
      var cell = Math.max(14, Math.round(Math.min(w, h) / 46));
      var nx = Math.ceil(w / cell) + 1, ny = Math.ceil(h / cell) + 1;
      var grid = new Float32Array(nx * ny);
      for (var gy = 0; gy < ny; gy++) for (var gx = 0; gx < nx; gx++)
        grid[gy * nx + gx] = field(hills, gx * cell, gy * cell);
      var lo = Infinity, hi = -Infinity;
      for (var q = 0; q < grid.length; q++) { if (grid[q] < lo) lo = grid[q]; if (grid[q] > hi) hi = grid[q]; }
      for (var li = 0; li < LEVELS; li++) {
        var iso = lo + (hi - lo) * (0.22 + 0.72 * li / (LEVELS - 1)), segs = [];
        var lerp = function (a, b) { return (iso - a) / (b - a || 1e-9); };
        for (gy = 0; gy < ny - 1; gy++) for (gx = 0; gx < nx - 1; gx++) {
          var a = grid[gy * nx + gx], b = grid[gy * nx + gx + 1],
              c = grid[(gy + 1) * nx + gx + 1], d = grid[(gy + 1) * nx + gx];
          var idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          var x0 = gx * cell, y0 = gy * cell;
          var T = [x0 + cell * lerp(a, b), y0], R = [x0 + cell, y0 + cell * lerp(b, c)],
              B = [x0 + cell * lerp(d, c), y0 + cell], L = [x0, y0 + cell * lerp(a, d)];
          var put = function (p, q2) { segs.push(p[0], p[1], q2[0], q2[1]); };
          switch (idx) {
            case 1: case 14: put(L, B); break;
            case 2: case 13: put(B, R); break;
            case 3: case 12: put(L, R); break;
            case 4: case 11: put(T, R); break;
            case 6: case 9:  put(T, B); break;
            case 7: case 8:  put(L, T); break;
            case 5:  put(L, T); put(B, R); break;
            case 10: put(L, B); put(T, R); break;
          }
        }
        layers.push(segs);
      }
    }
    function strokeLevel(ctx, segs, style, width) {
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath();
      for (var s = 0; s < segs.length; s += 4) { ctx.moveTo(segs[s], segs[s + 1]); ctx.lineTo(segs[s + 2], segs[s + 3]); }
      ctx.stroke();
    }
    return {
      build: build,
      draw: function (ctx, t, k) {
        // the altitude light breathes: a soft band sweeps up the levels and back
        var pos = (Math.sin(t * 0.22) * 0.5 + 0.5) * (LEVELS - 1);
        for (var li = 0; li < LEVELS; li++) {
          var glow = Math.max(0, 1 - Math.abs(li - pos) / 2.2);
          var major = li % 3 === 0;
          strokeLevel(ctx, layers[li],
            glow > 0.25 ? warm((0.18 + glow * 0.38) * k) : gold((major ? 0.28 : 0.16) * k),
            major ? 1.3 : 0.8);
        }
      }
    };
  };

  // ═══════════════════ mode: RAGGIERA (Deco, done right) ════════════════════
  // A fine Art-Deco sunburst from a high focus: ~88 hairline rays in alternating
  // weights, banded concentric arcs, the whole fan turning imperceptibly while
  // a glint orbits the arcs. Crisp, legible, hypnotic — never busy.
  SCENES.raggiera = function () {
    // A BOUNDED Deco crown at the top of the page — not a full-screen grid.
    // The fan is rendered once to an offscreen canvas (crisp, zero per-frame
    // cost), then drawn each frame with an imperceptible rotation; the only
    // live elements are a glint orbiting the crown arc and its soft ember.
    var W, H, fx, fy, R, off, offR;
    function build(w, h) {
      W = w; H = h; fx = w * 0.5; fy = -h * 0.22;
      R = Math.min(w, h) * 0.88;
      offR = Math.ceil(R + 4);
      off = document.createElement('canvas');
      off.width = off.height = offR * 2;
      var c = off.getContext('2d');
      c.translate(offR, offR);
      var A0 = Math.PI * 0.28, A1 = Math.PI * 0.72, N = 56;
      for (var i = 0; i <= N; i++) {
        var a = A0 + (A1 - A0) * i / N;
        var major = i % 8 === 0, mid = i % 2 === 0;
        var g = c.createLinearGradient(Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18, Math.cos(a) * R, Math.sin(a) * R);
        g.addColorStop(0, gold((major ? 0.55 : mid ? 0.34 : 0.20)));
        g.addColorStop(0.75, gold((major ? 0.26 : mid ? 0.13 : 0.07)));
        g.addColorStop(1, gold(0));
        c.beginPath();
        c.moveTo(Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18);
        c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        c.strokeStyle = g; c.lineWidth = major ? 1.6 : mid ? 1 : 0.6; c.stroke();
      }
      // engraved bands — closer to the crown, where the eye rests
      for (var b = 1; b <= 4; b++) {
        var rr = R * (0.24 + b * 0.10);
        c.beginPath(); c.arc(0, 0, rr, A0, A1);
        c.strokeStyle = gold(b % 2 ? 0.16 : 0.30);
        c.lineWidth = b % 2 ? 0.7 : 1.3;
        c.setLineDash(b === 3 ? [1, 6] : []); c.stroke(); c.setLineDash([]);
      }
      // stepped Deco tips on the major rays
      for (i = 0; i <= N; i += 8) {
        var a2 = A0 + (A1 - A0) * i / N, rt = R * 0.78;
        c.beginPath(); c.arc(Math.cos(a2) * rt, Math.sin(a2) * rt, 2.4, 0, TAU);
        c.fillStyle = warm(0.5); c.fill();
      }
    }
    return {
      build: build,
      draw: function (ctx, t, k) {
        ctx.save(); ctx.globalAlpha = Math.min(1, k);
        ctx.translate(fx, fy); ctx.rotate(Math.sin(t * 0.05) * 0.02);   // a slow, breathing sway
        ctx.drawImage(off, -offR, -offR);
        // the live glint orbits the third band
        var A0 = Math.PI * 0.26, A1 = Math.PI * 0.74;
        var ga = A0 + (Math.sin(t * 0.16) * 0.5 + 0.5) * (A1 - A0), rr = R * 0.54;
        ctx.beginPath(); ctx.arc(0, 0, rr, ga - 0.045, ga + 0.045);
        ctx.strokeStyle = warm(0.85 * k); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
        var gx = Math.cos(ga) * rr, gy = Math.sin(ga) * rr;
        var hg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 46);
        hg.addColorStop(0, warm(0.28 * k)); hg.addColorStop(1, warm(0));
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(gx, gy, 46, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      }
    };
  };

  // ═══════════════════ mode: ACQUEDOTTO (the architectural meander) ═════════
  // Two tiers of Roman aqueduct arches marching across the page in shallow
  // perspective; a warm light travels the arcade, arch after arch — the same
  // pulse grammar as the meander, in architecture. Iconic and readable.
  SCENES.acquedotto = function () {
    // ONE monument, not two floating rows: a stacked double arcade in the lower
    // third of the page — big arches on the ground, smaller ones on the cornice
    // above, engraved with a double stroke like stone voussoirs. A warm light
    // walks the lower arcade, climbs, and returns along the upper one.
    var W, H, arches, BASE, C1, C2;
    function build(w, h) {
      W = w; H = h; arches = [];
      BASE = h * 0.80;                                    // the ground
      var pitch = Math.max(110, Math.min(170, w * 0.10));
      var h1 = Math.min(h * 0.22, pitch * 1.15);           // lower arch height
      var h2 = h1 * 0.58;                                 // upper arch height
      C1 = BASE - h1 - 12;                                // lower cornice
      C2 = C1 - h2 - 10;                                  // upper cornice
      for (var x = pitch / 2; x < w + pitch; x += pitch) {
        arches.push({ x: x, yb: BASE, w: pitch * 0.74, h: h1, tier: 0 });
        arches.push({ x: x + pitch / 2, yb: C1, w: pitch * 0.52, h: h2, tier: 1 });
      }
    }
    function archPath(ctx, a, inset) {
      var r = a.w / 2 - inset, top = a.yb - a.h + inset;
      ctx.beginPath();
      ctx.moveTo(a.x - r, a.yb);
      ctx.lineTo(a.x - r, top + r);
      ctx.arc(a.x, top + r, r, Math.PI, 0);
      ctx.lineTo(a.x + r, a.yb);
    }
    return {
      build: build,
      draw: function (ctx, t, k) {
        var span = W + 300;
        var p = (t * 0.12) % 2;
        var lx = p < 1 ? (p * span - 150) : (span - (p - 1) * span - 150);
        var litTier = p < 1 ? 0 : 1;
        for (var i = 0; i < arches.length; i++) {
          var a = arches[i];
          var lit = a.tier === litTier ? Math.max(0, 1 - Math.abs(a.x - lx) / 190) : 0;
          var base = a.tier ? 0.20 : 0.30;
          // stone: double engraved stroke
          archPath(ctx, a, 0);
          ctx.strokeStyle = (lit > 0.35 ? warm : gold)((base + lit * 0.45) * k);
          ctx.lineWidth = a.tier ? 1.1 : 1.5; ctx.stroke();
          archPath(ctx, a, 5);
          ctx.strokeStyle = gold((base * 0.55 + lit * 0.2) * k);
          ctx.lineWidth = 0.6; ctx.stroke();
          if (lit > 0.45) {                               // the opening glows as the light passes through
            archPath(ctx, a, 2); ctx.closePath();
            ctx.fillStyle = warm(lit * 0.10 * k); ctx.fill();
          }
        }
        // cornices + ground: the horizontals that make it ONE building
        [[BASE + 2, 0.4], [C1, 0.3], [C1 + 6, 0.16], [C2, 0.26], [C2 + 5, 0.13]].forEach(function (ln) {
          ctx.beginPath(); ctx.moveTo(0, ln[0]); ctx.lineTo(W, ln[0]);
          ctx.strokeStyle = gold(ln[1] * k); ctx.lineWidth = ln[1] > 0.3 ? 1.4 : 0.8; ctx.stroke();
        });
      }
    };
  };

  // ═════════ THE LINEA D'ORO FAMILY — engraved gold lines, traveling light ═══
  // Siblings of Raggiera & Meandro: same grammar (thin engraved strokes, one
  // warm pulse that travels), three more Roman icons.

  // CARDO — the Roman street grid (cardo & decumanus). A fine engraved plan
  // of insulae; two or three light-runners walk the streets and turn at
  // crossings, like current through the city's circuit.
  SCENES.cardo = function () {
    var W, H, step, runners, majors;
    function build(w, h) {
      W = w; H = h;
      step = Math.max(72, Math.min(110, Math.min(w, h) / 9));
      majors = { x: Math.round(w / 2 / step) * step, y: Math.round(h / 2 / step) * step };
      runners = [];
      var rnd = mulberry32(1204);
      for (var i = 0; i < 3; i++) runners.push({
        x: Math.round(rnd() * w / step) * step,
        y: Math.round(rnd() * h / step) * step,
        dx: rnd() > 0.5 ? 1 : -1, dy: 0, trail: [], speed: 150 + rnd() * 70
      });
      runners.forEach(function (r, i2) { if (i2 % 2) { r.dy = r.dx; r.dx = 0; } });
    }
    return {
      build: build,
      draw: function (ctx, t, k, dt) {
        // the plan
        for (var x = 0; x <= W + 1; x += step) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H);
          ctx.strokeStyle = gold((x === majors.x ? 0.42 : 0.16) * k); ctx.lineWidth = x === majors.x ? 1.5 : 0.7; ctx.stroke();
        }
        for (var y = 0; y <= H + 1; y += step) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y);
          ctx.strokeStyle = gold((y === majors.y ? 0.42 : 0.16) * k); ctx.lineWidth = y === majors.y ? 1.5 : 0.7; ctx.stroke();
        }
        if (STATIC_ONLY) return;
        // the runners
        var move = (dt || 16) / 1000;
        for (var i = 0; i < runners.length; i++) {
          var r = runners[i];
          r.x += r.dx * r.speed * move; r.y += r.dy * r.speed * move;
          // at a crossing: maybe turn (deterministic-ish wobble)
          var gx = Math.round(r.x / step) * step, gy = Math.round(r.y / step) * step;
          if (Math.abs(r.x - gx) < 2 && Math.abs(r.y - gy) < 2 && Math.random() < 0.45) {
            r.x = gx; r.y = gy;
            if (r.dx !== 0) { r.dy = Math.random() < 0.5 ? 1 : -1; r.dx = 0; }
            else { r.dx = Math.random() < 0.5 ? 1 : -1; r.dy = 0; }
          }
          if (r.x < -step || r.x > W + step || r.y < -step || r.y > H + step) {
            r.x = majors.x; r.y = majors.y; r.trail = [];
          }
          r.trail.push([r.x, r.y]);
          if (r.trail.length > 44) r.trail.shift();
          for (var s = 1; s < r.trail.length; s++) {
            var f = s / r.trail.length;
            ctx.beginPath(); ctx.moveTo(r.trail[s - 1][0], r.trail[s - 1][1]); ctx.lineTo(r.trail[s][0], r.trail[s][1]);
            ctx.strokeStyle = warm(0.7 * f * k); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke();
          }
          ctx.lineCap = 'butt';
          var hg = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 30);
          hg.addColorStop(0, warm(0.32 * k)); hg.addColorStop(1, warm(0));
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(r.x, r.y, 34, 0, TAU); ctx.fill();
        }
      }
    };
  };

  // TEVERE — the river. Seven engraved current-lines flowing across the page,
  // and one glint drifting downstream along the heart of the current.
  SCENES.tevere = function () {
    var W, H, curves;
    function pathAt(i, n) {
      // a smooth diagonal current: baseline + two sines, offset per strand
      var pts = [], off = (i - (n - 1) / 2) * 26;
      for (var s = 0; s <= 120; s++) {
        var u = s / 120, x = -60 + u * (W + 120);
        var y = H * 0.5 + off
              + Math.sin(u * 4.2 + i * 0.35) * H * 0.10
              + Math.sin(u * 9.1 + i * 0.6) * H * 0.025
              + (u - 0.5) * H * 0.22;                    // the diagonal fall
        pts.push([x, y]);
      }
      return pts;
    }
    function build(w, h) {
      W = w; H = h; curves = [];
      for (var i = 0; i < 7; i++) curves.push(pathAt(i, 7));
    }
    return {
      build: build,
      draw: function (ctx, t, k) {
        for (var i = 0; i < curves.length; i++) {
          var c = curves[i], mid = i === 3;
          ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]);
          for (var s = 1; s < c.length; s++) ctx.lineTo(c[s][0], c[s][1]);
          ctx.strokeStyle = gold((mid ? 0.30 : 0.13 + 0.02 * (3 - Math.abs(i - 3))) * k);
          ctx.lineWidth = mid ? 1.4 : 0.7; ctx.stroke();
        }
        if (STATIC_ONLY) return;
        // the glint drifts downstream on the central current
        var c2 = curves[3], u = (t * 0.06) % 1, idx = Math.min(c2.length - 2, Math.floor(u * (c2.length - 1)));
        var p = c2[idx], q = c2[idx + 1], f = u * (c2.length - 1) - idx;
        var gx = p[0] + (q[0] - p[0]) * f, gy = p[1] + (q[1] - p[1]) * f;
        ctx.beginPath(); ctx.moveTo(c2[Math.max(0, idx - 4)][0], c2[Math.max(0, idx - 4)][1]);
        for (var s2 = Math.max(0, idx - 4); s2 <= idx + 1; s2++) ctx.lineTo(c2[s2][0], c2[s2][1]);
        ctx.strokeStyle = warm(0.8 * k); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
        var hg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 44);
        hg.addColorStop(0, warm(0.30 * k)); hg.addColorStop(1, warm(0));
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(gx, gy, 44, 0, TAU); ctx.fill();
      }
    };
  };

  // INTRECCIO — a banknote guilloché ribbon: six braided strands woven through
  // a band of the page, engraved; one glint travels the weave end to end.
  SCENES.intreccio = function () {
    var W, H, strands, Y0, AMP;
    function build(w, h) {
      W = w; H = h; Y0 = h * 0.42; AMP = Math.min(120, h * 0.13);
      strands = [];
      for (var i = 0; i < 6; i++) {
        var pts = [];
        for (var s = 0; s <= 160; s++) {
          var u = s / 160, x = -40 + u * (w + 80);
          var y = Y0 + Math.sin(u * Math.PI * 6 + i * Math.PI / 3) * AMP * (0.55 + 0.45 * Math.sin(u * Math.PI));
          pts.push([x, y]);
        }
        strands.push(pts);
      }
    }
    return {
      build: build,
      draw: function (ctx, t, k) {
        for (var i = 0; i < strands.length; i++) {
          var c = strands[i];
          ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]);
          for (var s = 1; s < c.length; s++) ctx.lineTo(c[s][0], c[s][1]);
          ctx.strokeStyle = gold((i % 2 ? 0.14 : 0.24) * k);
          ctx.lineWidth = i % 2 ? 0.7 : 1.1; ctx.stroke();
        }
        if (STATIC_ONLY) return;
        var u = (Math.sin(t * 0.14) * 0.5 + 0.5), gxp = -40 + u * (W + 80);
        for (var i2 = 0; i2 < strands.length; i2++) {
          var c2 = strands[i2], idx = Math.max(1, Math.min(c2.length - 1, Math.round(u * 160)));
          ctx.beginPath(); ctx.moveTo(c2[Math.max(0, idx - 3)][0], c2[Math.max(0, idx - 3)][1]);
          for (var s2 = Math.max(0, idx - 3); s2 <= idx; s2++) ctx.lineTo(c2[s2][0], c2[s2][1]);
          ctx.strokeStyle = warm(0.5 * k); ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
        }
        var hg = ctx.createRadialGradient(gxp, Y0, 0, gxp, Y0, AMP * 1.5);
        hg.addColorStop(0, warm(0.16 * k)); hg.addColorStop(1, warm(0));
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(gxp, Y0, AMP * 1.5, 0, TAU); ctx.fill();
      }
    };
  };

  // ═════════ ULTRA-TECH QUIET LUXURY — precision instruments, almost still ═══

  // ORBITA — an armillary instrument: three hairline ellipses tilted in space,
  // fine tick marks on the outer ring, and one satellite of warm light per
  // orbit, each moving at its own patient speed. A watch face the size of Rome.
  SCENES.orbita = function () {
    var W, H, cx, cy, orbits;
    function build(w, h) {
      W = w; H = h; cx = w * 0.62; cy = h * 0.44;
      var R = Math.min(w, h) * 0.55;
      orbits = [
        { rx: R * 1.35, ry: R * 0.42, rot: -0.18, speed: 0.045, ph: 0.0 },
        { rx: R * 0.95, ry: R * 0.60, rot: 0.42, speed: -0.065, ph: 2.1 },
        { rx: R * 0.62, ry: R * 0.24, rot: 0.10, speed: 0.10, ph: 4.4 }
      ];
    }
    function orbitPoint(o, a) {
      var x = Math.cos(a) * o.rx, y = Math.sin(a) * o.ry;
      var c = Math.cos(o.rot), s = Math.sin(o.rot);
      return [cx + x * c - y * s, cy + x * s + y * c];
    }
    return {
      build: build,
      draw: function (ctx, t, k) {
        for (var i = 0; i < orbits.length; i++) {
          var o = orbits[i];
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.rot);
          ctx.beginPath(); ctx.ellipse(0, 0, o.rx, o.ry, 0, 0, TAU);
          ctx.strokeStyle = gold((i === 0 ? 0.26 : 0.16) * k); ctx.lineWidth = i === 0 ? 1 : 0.6; ctx.stroke();
          if (i === 0) {                       // instrument ticks on the outer ring
            for (var m = 0; m < 60; m++) {
              var a2 = m / 60 * TAU, major = m % 5 === 0;
              var x1 = Math.cos(a2) * o.rx, y1 = Math.sin(a2) * o.ry;
              var x2 = Math.cos(a2) * (o.rx - (major ? 10 : 5)), y2 = Math.sin(a2) * (o.ry * (1 - (major ? 10 : 5) / o.rx));
              ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
              ctx.strokeStyle = gold((major ? 0.22 : 0.10) * k); ctx.lineWidth = major ? 1 : 0.5; ctx.stroke();
            }
          }
          ctx.restore();
          // the satellite
          var a3 = STATIC_ONLY ? o.ph : t * o.speed * TAU / 4 + o.ph;
          var p = orbitPoint(o, a3);
          // a short trailing arc
          ctx.beginPath();
          for (var s2 = 14; s2 >= 0; s2--) {
            var q = orbitPoint(o, a3 - s2 * 0.02 * Math.sign(o.speed || 1));
            s2 === 14 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]);
          }
          ctx.strokeStyle = warm(0.4 * k); ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, TAU); ctx.fillStyle = warm(0.9 * k); ctx.fill();
          var hg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 26);
          hg.addColorStop(0, warm(0.22 * k)); hg.addColorStop(1, warm(0));
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(p[0], p[1], 26, 0, TAU); ctx.fill();
        }
      }
    };
  };

  // BATTITO — one perfect hairline across the page. Most of the time: total
  // stillness. Every few seconds a soft pulse travels the line and it settles
  // back to flat. The city's heartbeat on an instrument, nothing else.
  SCENES.battito = function () {
    var W, H, Y;
    function pulseShape(u) {           // a composed, elegant beat (not a clinical ECG)
      if (u <= 0 || u >= 1) return 0;
      var env = Math.pow(Math.sin(u * Math.PI), 2);
      return env * (Math.sin(u * TAU * 3.5) * 0.55 + Math.sin(u * TAU * 1.2) * 0.45);
    }
    function build(w, h) { W = w; H = h; Y = h * 0.56; }
    return {
      build: build,
      draw: function (ctx, t, k) {
        var period = 7, u = (t % period) / period;          // one pass every 7s
        var headX = -0.15 + u * 1.3;                        // travels across (with margins)
        var AMP = Math.min(70, H * 0.08);
        ctx.beginPath();
        for (var x = 0; x <= W; x += 4) {
          var ux = x / W;
          var local = (ux - headX) / 0.16 + 0.5;            // the pulse window
          var y = Y - (STATIC_ONLY ? 0 : pulseShape(local)) * AMP;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = gold(0.30 * k); ctx.lineWidth = 1.1; ctx.stroke();
        // fine ruler beneath — the instrument
        for (var m = 0; m <= 40; m++) {
          var mx = m / 40 * W, major = m % 5 === 0;
          ctx.beginPath(); ctx.moveTo(mx, Y + 26); ctx.lineTo(mx, Y + 26 + (major ? 9 : 4));
          ctx.strokeStyle = gold((major ? 0.16 : 0.08) * k); ctx.lineWidth = major ? 1 : 0.5; ctx.stroke();
        }
        if (STATIC_ONLY) return;
        // the head of the pulse glows faintly as it passes
        var hx = headX * W;
        if (hx > 0 && hx < W) {
          var hy = Y - pulseShape(0.5) * AMP;
          var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 40);
          hg.addColorStop(0, warm(0.20 * k)); hg.addColorStop(1, warm(0));
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 40, 0, TAU); ctx.fill();
        }
      }
    };
  };

  // SCANSIONE — a vertical blade of light crossing the page in about a minute.
  // The dark holds a lattice of points you cannot see — they exist only where
  // the blade passes, then fade back into black. Pure instrument, pure quiet.
  SCENES.scansione = function () {
    var W, H, dots;
    function build(w, h) {
      W = w; H = h; dots = [];
      var rnd = mulberry32(6006), step = 54;
      for (var y = step / 2; y < h; y += step)
        for (var x = step / 2; x < w; x += step)
          dots.push([x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 10, 0.5 + rnd() * 0.5]);
    }
    return {
      build: build,
      draw: function (ctx, t, k) {
        var u = STATIC_ONLY ? 0.5 : ((t * 0.016) % 1.2) - 0.1;   // ~62s per pass
        var bx = u * W;
        // the lattice, alive only near the blade
        for (var i = 0; i < dots.length; i++) {
          var d = dots[i], dist = Math.abs(d[0] - bx);
          if (dist > 200) continue;
          var a = (1 - dist / 200) * 0.5 * d[2] * k;
          ctx.beginPath(); ctx.arc(d[0], d[1], dist < 40 ? 1.6 : 1.1, 0, TAU);
          ctx.fillStyle = (dist < 40 ? warm : gold)(a); ctx.fill();
        }
        // the blade
        var g = ctx.createLinearGradient(bx - 60, 0, bx + 60, 0);
        g.addColorStop(0, warm(0)); g.addColorStop(0.5, warm(0.10 * k)); g.addColorStop(1, warm(0));
        ctx.fillStyle = g; ctx.fillRect(bx - 60, 0, 120, H);
        ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, H);
        ctx.strokeStyle = warm(0.42 * k); ctx.lineWidth = 1; ctx.stroke();
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
