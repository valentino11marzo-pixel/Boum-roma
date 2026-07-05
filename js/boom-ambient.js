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
       meandro     Greek-key frieze with a running light pulse  (money)
       contorni    topographic contour lines of a hill          (zones/map)
       aurum       molten-gold flow field                       (editorial)
       sampietrini fan-laid setts with light ripples            (footer)
       raggiera    bounded Deco crown, orbiting double glint    (statement)
       cardo       Roman street grid walked by light-runners    (browse)
       tevere      the river's flow in engraved lines           (editorial)
       intreccio   banknote weave with a crossing light         (money)
       marmo       travertine veins, gliding sheen + vein glint (discovery)
       guilloche   lathework braids, breathing + strand glint   (site default)

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
    // The Greek key as an engraved frieze — fewer, larger, calmer bands.
    // Each band is a double stroke (main line + a fine echo 4px below, like
    // a chiselled shadow); one warm pulse per band travels the key and
    // carries a soft ember at its head.
    var W, H, rows;
    function keyRow(y, u, off) {
      var pts = [], x = -u * 4 + off;
      while (x < W + u * 4) {
        pts.push([x, y], [x, y - u], [x + u * 2, y - u], [x + u * 2, y + u], [x + u, y + u], [x + u, y], [x + u * 3, y]);
        x += u * 3;
      }
      return pts;
    }
    function trace(ctx, pts, dy) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] + dy);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1] + dy);
      ctx.stroke();
    }
    return {
      build: function (w, h) {
        W = w; H = h; rows = [];
        var u = Math.max(28, Math.min(42, h * 0.038));
        for (var y = u * 2; y < H + u; y += u * 6) rows.push(keyRow(y, u, (y * 7) % (u * 3)));
      },
      draw: function (ctx, t, k) {
        for (var r = 0; r < rows.length; r++) {
          var pts = rows[r];
          // engraved pair: fine echo below, main line above
          ctx.strokeStyle = gold(0.06 * k); ctx.lineWidth = 0.5; trace(ctx, pts, 4);
          ctx.strokeStyle = gold(0.16 * k); ctx.lineWidth = 1; trace(ctx, pts, 0);
          if (STATIC_ONLY) continue;
          var L = 0; for (var q = 1; q < pts.length; q++) L += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]);
          var head = ((t * 0.11 + r * 0.23) % 1) * L, tail = head - L * 0.07, acc = 0, hx = null, hy = null;
          ctx.lineWidth = 1.8; ctx.lineCap = 'round';
          for (var s = 1; s < pts.length; s++) {
            var seg = Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1]), a = acc, b = acc + seg;
            if (b > tail && a < head) {
              var f0 = Math.max(0, (tail - a) / seg), f1 = Math.min(1, (head - a) / seg);
              var x0 = pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * f0, y0 = pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * f0;
              var x1 = pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * f1, y1 = pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * f1;
              ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
              ctx.strokeStyle = warm(0.55 * k); ctx.stroke();
              if (head >= a && head <= b) { hx = x1; hy = y1; }
            }
            acc = b;
          }
          ctx.lineCap = 'butt';
          if (hx !== null) {
            var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 26);
            hg.addColorStop(0, warm(0.22 * k)); hg.addColorStop(1, warm(0));
            ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 26, 0, TAU); ctx.fill();
          }
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
        // the crown breathes: a ±8% swell on a slow cycle, on top of the sway
        var kb = k * (0.92 + 0.08 * Math.sin(t * 0.13));
        ctx.save(); ctx.globalAlpha = Math.min(1, kb);
        ctx.translate(fx, fy); ctx.rotate(Math.sin(t * 0.05) * 0.02);   // a slow, breathing sway
        ctx.drawImage(off, -offR, -offR);
        var A0 = Math.PI * 0.26, A1 = Math.PI * 0.74;
        // the live glint orbits the third band
        var ga = A0 + (Math.sin(t * 0.16) * 0.5 + 0.5) * (A1 - A0), rr = R * 0.54;
        ctx.beginPath(); ctx.arc(0, 0, rr, ga - 0.045, ga + 0.045);
        ctx.strokeStyle = warm(0.85 * kb); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke();
        var gx = Math.cos(ga) * rr, gy = Math.sin(ga) * rr;
        var hg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 46);
        hg.addColorStop(0, warm(0.28 * kb)); hg.addColorStop(1, warm(0));
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(gx, gy, 46, 0, TAU); ctx.fill();
        // a second, smaller glint counters it on the inner band — call and answer
        var ga2 = A1 - (Math.sin(t * 0.16 + 1.3) * 0.5 + 0.5) * (A1 - A0), r2 = R * 0.34;
        ctx.beginPath(); ctx.arc(0, 0, r2, ga2 - 0.035, ga2 + 0.035);
        ctx.strokeStyle = warm(0.5 * kb); ctx.lineWidth = 1.6; ctx.stroke(); ctx.lineCap = 'butt';
        var g2x = Math.cos(ga2) * r2, g2y = Math.sin(ga2) * r2;
        var hg2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, 24);
        hg2.addColorStop(0, warm(0.16 * kb)); hg2.addColorStop(1, warm(0));
        ctx.fillStyle = hg2; ctx.beginPath(); ctx.arc(g2x, g2y, 24, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
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

  // ═════════ MATERIA ROMANA — the stone and the engraving, almost still ═════

  // MARMO — travertine, the stone Rome is built from. A dozen hairline gold
  // veins wander one diagonal grain across the page with short branches and
  // a scatter of pores (cached offscreen, crisp, zero per-frame cost). The
  // living light: a slow sheen gliding along the grain — light moving over
  // polished stone — and one glint walking the master vein.
  SCENES.marmo = function () {
    var W, H, off, master, masterLen, GRAIN = -0.30, DIAG;
    function vein(rnd, x0, y0, ang, n, drift) {
      var pts = [[x0, y0]], x = x0, y = y0, curve = 0;
      for (var i = 0; i < n; i++) {
        curve += (rnd() - 0.5) * drift; curve *= 0.92;
        x += Math.cos(ang + curve) * 16; y += Math.sin(ang + curve) * 16;
        pts.push([x, y]);
      }
      return pts;
    }
    function stroke(c, pts, w, a) {
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length - 1; i++)
        c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      c.strokeStyle = gold(a); c.lineWidth = w; c.stroke();
    }
    return {
      build: function (w, h) {
        W = w; H = h; DIAG = Math.hypot(w, h);
        off = document.createElement('canvas'); off.width = w; off.height = h;
        var c = off.getContext('2d'), rnd = mulberry32(97), n = Math.ceil((w + 240) / 14);
        // stone depth — a few vast, whisper-faint clouds under the veins
        for (var cl = 0; cl < 3; cl++) {
          var cx = rnd() * w, cy = rnd() * h, cr = Math.min(w, h) * (0.4 + rnd() * 0.3);
          var cg = c.createRadialGradient(cx, cy, 0, cx, cy, cr);
          cg.addColorStop(0, gold(0.025)); cg.addColorStop(1, gold(0));
          c.fillStyle = cg; c.beginPath(); c.arc(cx, cy, cr, 0, TAU); c.fill();
        }
        var count = 8 + Math.round(h / 240), mid = Math.floor(count / 2);
        master = null;
        for (var v = 0; v < count; v++) {
          var y0 = (v + 0.5) / count * h * 1.25 - h * 0.05 + (rnd() - 0.5) * h * 0.12;
          var pts = vein(rnd, -120, y0, GRAIN + (rnd() - 0.5) * 0.10, n, 0.48);
          var main = v === mid, aw = main ? 1.2 : 0.6 + rnd() * 0.5, aa = main ? 0.20 : 0.07 + rnd() * 0.08;
          stroke(c, pts, aw, aa);
          // engraved companion — a fainter parallel line, the chisel's echo
          if (main || rnd() < 0.4) {
            c.save(); c.translate(0, 4); stroke(c, pts, aw * 0.6, aa * 0.45); c.restore();
          }
          if (main) master = pts;
          // a short, fainter branch peeling off at a low angle
          if (rnd() < 0.6) {
            var at = pts[Math.floor(pts.length * (0.25 + rnd() * 0.5))];
            stroke(c, vein(rnd, at[0], at[1], GRAIN + (rnd() < 0.5 ? -0.4 : 0.4), Math.floor(n / 4), 0.5), 0.5, 0.06);
          }
        }
        // travertine pores — small grain-aligned specks
        for (var p = 0; p < 130; p++) {
          var px = rnd() * w, py = rnd() * h;
          c.save(); c.translate(px, py); c.rotate(GRAIN);
          c.fillStyle = gold(0.05 + rnd() * 0.06);
          c.beginPath(); c.ellipse(0, 0, 1.2 + rnd() * 2.6, 0.5 + rnd() * 0.9, 0, 0, TAU); c.fill();
          c.restore();
        }
        masterLen = 0;
        for (var q = 1; q < master.length; q++) masterLen += Math.hypot(master[q][0] - master[q - 1][0], master[q][1] - master[q - 1][1]);
      },
      draw: function (ctx, t, k) {
        ctx.save(); ctx.globalAlpha = Math.min(1, k);
        ctx.drawImage(off, 0, 0);
        ctx.restore(); ctx.globalAlpha = 1;
        if (STATIC_ONLY) return;
        // the sheen — a broad soft band of light gliding along the grain
        var u = ((t * 0.016) % 1.4) - 0.2, bx = u * DIAG - DIAG / 2, bw = DIAG * 0.30;
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(GRAIN);
        var sg = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
        sg.addColorStop(0, warm(0)); sg.addColorStop(0.5, warm(0.045 * k)); sg.addColorStop(1, warm(0));
        ctx.fillStyle = sg; ctx.fillRect(-DIAG, -DIAG, DIAG * 2, DIAG * 2);
        ctx.restore();
        // one glint walks the master vein
        var head = ((t * 0.05) % 1) * masterLen, tail = head - masterLen * 0.05, acc = 0, hx = null, hy = null;
        ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        for (var s = 1; s < master.length; s++) {
          var seg = Math.hypot(master[s][0] - master[s - 1][0], master[s][1] - master[s - 1][1]), a = acc, b = acc + seg;
          if (b > tail && a < head) {
            var f0 = Math.max(0, (tail - a) / seg), f1 = Math.min(1, (head - a) / seg);
            var x1 = master[s - 1][0] + (master[s][0] - master[s - 1][0]) * f1, y1 = master[s - 1][1] + (master[s][1] - master[s - 1][1]) * f1;
            ctx.beginPath();
            ctx.moveTo(master[s - 1][0] + (master[s][0] - master[s - 1][0]) * f0, master[s - 1][1] + (master[s][1] - master[s - 1][1]) * f0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = warm(0.42 * k); ctx.stroke();
            if (head >= a && head <= b) { hx = x1; hy = y1; }
          }
          acc = b;
        }
        ctx.lineCap = 'butt';
        if (hx !== null) {
          var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 22);
          hg.addColorStop(0, warm(0.16 * k)); hg.addColorStop(1, warm(0));
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 22, 0, TAU); ctx.fill();
        }
      }
    };
  };

  // GUILLOCHÉ — the old site signature, reborn. Three engraved lathework
  // braids (banknote engine-turning: interleaved harmonics, cached offscreen);
  // the braid breathes almost imperceptibly and a single glint rides one
  // strand of the central band.
  SCENES.guilloche = function () {
    var W, H, off, path, pathLen;
    function strandY(yc, A, u, i, M) {
      var ph = i * TAU / M, amp = A * (0.45 + 0.55 * (i + 1) / M);
      return yc + amp * Math.sin(u * Math.PI * 5 + ph) * (0.72 + 0.28 * Math.sin(u * Math.PI))
                + A * 0.22 * Math.sin(u * Math.PI * 13.7 + ph * 1.7);
    }
    return {
      build: function (w, h) {
        W = w; H = h;
        off = document.createElement('canvas'); off.width = w; off.height = h;
        var c = off.getContext('2d'), bands = [[h * 0.20, 0.7, 0.85], [h * 0.52, 1, 1], [h * 0.84, 0.7, 0.85]];
        path = null;
        for (var b = 0; b < bands.length; b++) {
          var yc = bands[b][0], A = Math.min(64, h * 0.075) * bands[b][1], em = bands[b][2], M = 9;
          for (var i = 0; i < M; i++) {
            var pts = [];
            for (var s = 0; s <= 220; s++) {
              var u = s / 220;
              pts.push([-30 + u * (w + 60), strandY(yc, A, u, i, M)]);
            }
            c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
            for (var q = 1; q < pts.length; q++) c.lineTo(pts[q][0], pts[q][1]);
            c.strokeStyle = gold((i === 0 ? 0.20 : i % 2 ? 0.07 : 0.12) * em);
            c.lineWidth = i === 0 ? 1 : 0.55; c.stroke();
            if (b === 1 && i === 0) path = pts;
          }
        }
        pathLen = 0;
        for (var p = 1; p < path.length; p++) pathLen += Math.hypot(path[p][0] - path[p - 1][0], path[p][1] - path[p - 1][1]);
      },
      draw: function (ctx, t, k) {
        var kb = k * (STATIC_ONLY ? 1 : 0.94 + 0.06 * Math.sin(t * 0.11));
        ctx.save(); ctx.globalAlpha = Math.min(1, kb);
        ctx.drawImage(off, 0, 0);
        ctx.restore(); ctx.globalAlpha = 1;
        if (STATIC_ONLY) return;
        var head = ((t * 0.07) % 1) * pathLen, tail = head - pathLen * 0.06, acc = 0, hx = null, hy = null;
        ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        for (var s = 1; s < path.length; s++) {
          var seg = Math.hypot(path[s][0] - path[s - 1][0], path[s][1] - path[s - 1][1]), a = acc, b = acc + seg;
          if (b > tail && a < head) {
            var f0 = Math.max(0, (tail - a) / seg), f1 = Math.min(1, (head - a) / seg);
            var x1 = path[s - 1][0] + (path[s][0] - path[s - 1][0]) * f1, y1 = path[s - 1][1] + (path[s][1] - path[s - 1][1]) * f1;
            ctx.beginPath();
            ctx.moveTo(path[s - 1][0] + (path[s][0] - path[s - 1][0]) * f0, path[s - 1][1] + (path[s][1] - path[s - 1][1]) * f0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = warm(0.5 * k); ctx.stroke();
            if (head >= a && head <= b) { hx = x1; hy = y1; }
          }
          acc = b;
        }
        ctx.lineCap = 'butt';
        if (hx !== null) {
          var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 24);
          hg.addColorStop(0, warm(0.18 * k)); hg.addColorStop(1, warm(0));
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 24, 0, TAU); ctx.fill();
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
    var raf = 0, running = false, last = 0, t0 = 0, sceneClock = 0, tempoBoost = 0;

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
      // the user's gesture stirs the material; it settles on its own
      if (tempoBoost > 0.001) tempoBoost *= 0.94; else tempoBoost = 0;
      sceneClock += dt * 0.001 * moodCur.tempo * (1 + tempoBoost);
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
      stir: function (v) { tempoBoost = Math.min(1.6, tempoBoost + Math.max(0, +v || 0) * 0.6); },
      scenes: Object.keys(SCENES),
      moods: Object.keys(MOODS),
      destroy: function () { stop(); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  }

  // external scene registration — a maker receives the helper kit and returns
  // {build,draw}; lets scenes be developed as standalone files, then inlined.
  function register(name, maker) {
    SCENES[name] = function () {
      return maker({ gold: gold, warm: warm, TAU: TAU, STATIC_ONLY: STATIC_ONLY, mulberry32: mulberry32, vnoise: vnoise });
    };
  }


  // ═════════ MATERIA ROMANA II — the lab family: stone, dust, leaf, water, silk ═

/* MARMO ANTICO — living stone. Two precomputed noise fields on a downscaled
   buffer larger than the screen: (1) a warm CLOUD base — fractal value-noise
   as dim luminance clouds; (2) a golden FILAMENT layer — narrow band-pass of
   a second, domain-warped noise field: soft cloudy veins, not hairlines.
   Life: the sampling window drifts imperceptibly along one diagonal grain,
   the filament layer breathes, and a broad sheen glides across every ~40s,
   lighting the material itself (source-atop). Travertine under candlelight.
   Perf: layers composite into a half-res stage (updated every 2nd frame);
   one upscaled blit per frame to the screen. */
register('marmoantico', function (H) {
  var gold = H.gold, warm = H.warm, TAU = H.TAU,
      STATIC_ONLY = H.STATIC_ONLY, mulberry32 = H.mulberry32;

  var W, Hh, DIAG, PAD, S = 3, BW, BH, cloudCv, veinCv;
  var stage, sctx, SW, SH, SS = 0.5, fc = 0;
  var G = -0.32, cg = Math.cos(G), sg = Math.sin(G);

  function parseRGB(str) {
    var m = /([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(str);
    return m ? [+m[1], +m[2], +m[3]] : [217, 180, 91];
  }
  function makeNoise(seed) {
    var rnd = mulberry32(seed), perm = new Uint8Array(512), vals = new Float32Array(256),
        p = new Uint8Array(256), i, j, tmp;
    for (i = 0; i < 256; i++) { p[i] = i; vals[i] = rnd(); }
    for (i = 255; i > 0; i--) { j = (rnd() * (i + 1)) | 0; tmp = p[i]; p[i] = p[j]; p[j] = tmp; }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      xi &= 255; yi &= 255;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var a = vals[perm[perm[xi] + yi]], b = vals[perm[perm[xi + 1] + yi]],
          c = vals[perm[perm[xi] + yi + 1]], d = vals[perm[perm[xi + 1] + yi + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(nf, x, y, oct) {
    var s = 0, amp = 0.5, tot = 0, o;
    for (o = 0; o < oct; o++) { s += nf(x, y) * amp; tot += amp; x = x * 2.03 + 13.7; y = y * 2.03 + 7.9; amp *= 0.5; }
    return s / tot;
  }
  function sstep(a, b, x) { x = (x - a) / (b - a); if (x < 0) x = 0; if (x > 1) x = 1; return x * x * (3 - 2 * x); }

  function renderStage(st, k) {
    var w2 = SW, h2 = SH, sc = SS;
    sctx.clearRect(0, 0, w2, h2);
    // drift the sampling window imperceptibly along the grain (never loops)
    var du = Math.sin(st * TAU / 253) * PAD * 0.45, dv = Math.sin(st * TAU / 337 + 0.8) * PAD * 0.20;
    var ox = du * cg - dv * sg, oy = du * sg + dv * cg;
    sctx.globalAlpha = 0.93 + 0.07 * Math.sin(st * TAU / 61 + 0.5);
    sctx.drawImage(cloudCv, (-PAD + ox) * sc, (-PAD + oy) * sc, BW * S * sc, BH * S * sc);
    // filament layer: parallax drift + breathing alpha
    var du2 = Math.sin(st * TAU / 253 + 0.7) * PAD * 0.62, dv2 = Math.sin(st * TAU / 289 + 2.0) * PAD * 0.26;
    var ox2 = du2 * cg - dv2 * sg, oy2 = du2 * sg + dv2 * cg;
    sctx.globalAlpha = 0.68 + 0.32 * Math.sin(st * TAU / 31 + 2.2);
    sctx.drawImage(veinCv, (-PAD + ox2) * sc, (-PAD + oy2) * sc, BW * S * sc, BH * S * sc);
    sctx.globalAlpha = 1;
    // the sheen — a broad soft light gliding along the grain every ~40s
    var per = 40, ph = (st / per) % 1, ease = Math.sin(ph * Math.PI);
    if (STATIC_ONLY) { ph = 0.40; ease = 1; }
    if (ease > 0.01) {
      var bx = (-0.68 + 1.36 * ph) * DIAG * sc, bw = DIAG * 0.28 * sc, ext = DIAG * sc;
      sctx.save();
      sctx.translate(w2 / 2, h2 / 2); sctx.rotate(G);
      // light the material itself, not the void
      sctx.globalCompositeOperation = 'source-atop';
      var s1 = sctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
      s1.addColorStop(0, warm(0)); s1.addColorStop(0.5, warm(0.62 * ease)); s1.addColorStop(1, warm(0));
      sctx.fillStyle = s1; sctx.fillRect(bx - bw, -ext, bw * 2, ext * 2);
      // faint atmospheric bloom over everything
      sctx.globalCompositeOperation = 'source-over';
      var s2 = sctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
      s2.addColorStop(0, warm(0)); s2.addColorStop(0.5, warm(0.06 * ease)); s2.addColorStop(1, warm(0));
      sctx.fillStyle = s2; sctx.fillRect(bx - bw, -ext, bw * 2, ext * 2);
      sctx.restore();
      sctx.globalCompositeOperation = 'source-over';
    }
  }

  return {
    build: function (w, h) {
      W = w; Hh = h; DIAG = Math.hypot(w, h);
      PAD = Math.round(Math.min(w, h) * 0.14) + 40;
      BW = Math.ceil((w + PAD * 2) / S); BH = Math.ceil((h + PAD * 2) / S);
      SW = Math.ceil(w * SS); SH = Math.ceil(h * SS);
      stage = document.createElement('canvas'); stage.width = SW; stage.height = SH;
      sctx = stage.getContext('2d');
      fc = 0;
      var GC = parseRGB(gold(1)), WC = parseRGB(warm(1));
      var nA = makeNoise(1101), nBig = makeNoise(2207), nFine = makeNoise(3313),
          nW1 = makeNoise(4409), nW2 = makeNoise(5501), nV = makeNoise(6607),
          nV2 = makeNoise(7703), nP = makeNoise(8809), nS = makeNoise(9901);
      cloudCv = document.createElement('canvas'); cloudCv.width = BW; cloudCv.height = BH;
      veinCv = document.createElement('canvas'); veinCv.width = BW; veinCv.height = BH;
      var cc = cloudCv.getContext('2d'), vc = veinCv.getContext('2d');
      var cd = cc.createImageData(BW, BH), vd = vc.createImageData(BW, BH);
      var cp = cd.data, vp = vd.data;
      var q = 1 / Math.min(w, h);
      var f1x = w * 0.76, f1y = h * 0.18, r1 = DIAG * 0.52;
      var f2x = w * 0.10, f2y = h * 0.90, r2 = DIAG * 0.40;
      var f3x = w * 0.94, f3y = h * 0.78, r3 = DIAG * 0.38;
      var CLOUD_A = 0.35, VEIN_A = 0.62;
      var idx = 0, by, bx;
      for (by = 0; by < BH; by++) {
        var y = by * S - PAD;
        for (bx = 0; bx < BW; bx++, idx += 4) {
          var x = bx * S - PAD;
          var u = x * cg + y * sg, v = -x * sg + y * cg;
          // compositional light mask — pools of light, dimmer where text sits
          var dx1 = x - f1x, dy1 = y - f1y, dx2 = x - f2x, dy2 = y - f2y,
              dx3 = x - f3x, dy3 = y - f3y;
          var g3 = Math.exp(-(dx3 * dx3 + dy3 * dy3) / (r3 * r3));
          var m = 0.42 + 0.78 * Math.exp(-(dx1 * dx1 + dy1 * dy1) / (r1 * r1))
                       + 0.44 * Math.exp(-(dx2 * dx2 + dy2 * dy2) / (r2 * r2))
                       + 0.50 * g3;
          if (m > 1.20) m = 1.20;
          // CLOUD base — big soft masses elongated along the grain
          var nc = fbm(nA, u * q * 1.35 + 7.1, v * q * 2.7 + 3.2, 4);
          var big = nBig(u * q * 0.5 + 11.3, v * q * 0.85 + 5.7);
          // the counter-mass: lift the field itself toward the far corner
          nc = nc * 0.58 + big * 0.42 + 0.13 * g3;
          var cs = sstep(0.26, 0.86, nc);
          // fine stone grain — big soft velvet grain, strongest in the light
          var fg = nFine(x * 0.045, y * 0.045);
          var ca = (0.12 + 0.14 * big + cs) * (0.80 + 0.34 * fg * (0.3 + 0.7 * cs)) * m;
          // FILAMENT layer — band-pass of a warped field: soft cloudy veins
          var wx = (fbm(nW1, u * q * 1.7, v * q * 1.7, 3) - 0.5) * 1.5;
          var wy = (fbm(nW2, u * q * 1.7 + 41.7, v * q * 1.7 + 9.3, 3) - 0.5) * 1.5;
          var nv = fbm(nV, u * q * 0.8 + wx, v * q * 3.4 + wy, 4);
          var dv = nv - 0.5; if (dv < 0) dv = -dv;
          // vein width varies along its run — wisp, river, and a few bright cords
          var sw = nS(u * q * 1.3 + 5.5, v * q * 2.0 + 2.2);
          var sigw = 320 + 1700 * sw * sw;
          var core = Math.exp(-dv * dv * sigw), glowv = Math.exp(-dv * dv * 110);
          var patch = sstep(0.26, 0.60, fbm(nP, u * q * 1.05 + 3.3, v * q * 1.5 + 8.8, 2) + 0.12 * g3);
          var va = (core * 0.88 + glowv * 0.45) * patch * m;
          // secondary finer veinlets — contrast of scale
          var nv2 = fbm(nV2, u * q * 1.5, v * q * 6.2, 3);
          var d2 = nv2 - 0.5; if (d2 < 0) d2 = -d2;
          va += Math.exp(-d2 * d2 * 1500) * 0.34 * patch * m;
          // write pixels — mid-tones lean cream so the stone stays warm, not olive
          var tc = 0.50 + cs * 0.5; if (tc > 1) tc = 1;
          cp[idx] = (GC[0] + (WC[0] - GC[0]) * tc) | 0;
          cp[idx + 1] = (GC[1] + (WC[1] - GC[1]) * tc) | 0;
          cp[idx + 2] = (GC[2] + (WC[2] - GC[2]) * tc) | 0;
          cp[idx + 3] = (ca > 1 ? 1 : ca) * CLOUD_A * 255 | 0;
          var tv = 0.45 + core * 0.55;
          vp[idx] = (GC[0] + (WC[0] - GC[0]) * tv) | 0;
          vp[idx + 1] = (GC[1] + (WC[1] - GC[1]) * tv) | 0;
          vp[idx + 2] = (GC[2] + (WC[2] - GC[2]) * tv) | 0;
          vp[idx + 3] = (va > 1 ? 1 : va) * VEIN_A * 255 | 0;
        }
      }
      cc.putImageData(cd, 0, 0); vc.putImageData(vd, 0, 0);
      // travertine pores — small grain-aligned flecks for tactility
      var rnd = mulberry32(97), np = Math.round(BW * BH / 2000), pi;
      for (pi = 0; pi < np; pi++) {
        var pxx = rnd() * BW, pyy = rnd() * BH;
        cc.save(); cc.translate(pxx, pyy); cc.rotate(G);
        cc.fillStyle = (rnd() < 0.5 ? gold : warm)(0.06 + rnd() * 0.12);
        cc.beginPath(); cc.ellipse(0, 0, 0.6 + rnd() * 1.9, 0.3 + rnd() * 0.7, 0, 0, TAU); cc.fill();
        cc.restore();
      }
    },
    draw: function (ctx, t, k) {
      var st = STATIC_ONLY ? 0 : t;
      // stage refresh every 2nd frame — the material moves far too slowly to tell
      if ((fc & 1) === 0 || fc < 2) renderStage(st, k);
      fc++;
      ctx.globalAlpha = Math.min(1, k);
      ctx.drawImage(stage, 0, 0, W, Hh);
      ctx.globalAlpha = 1;
    }
  };
});

/* PULVISCOLO — gold dust suspended in the light of a Roman church.
   Two parallel diagonal blades of light from high windows on the right
   (baked into one static base layer with cloudy erosion), a living
   filament overlay riding the primary blade, and ~240 dust motes in three
   depth layers drifting on convection noise. One mote twinkles every few
   seconds — never more. */
register('pulviscolo', function (H) {
  'use strict';
  var gold = H.gold, warm = H.warm, TAU = H.TAU,
      STATIC_ONLY = H.STATIC_ONLY, mulberry32 = H.mulberry32, vnoise = H.vnoise;

  var W, Hh, diag;
  var GC, WC;                        // parsed rgb of gold / warm
  var cloud, cw, ch;                 // atmosphere noise buffer
  var base;                          // fully-baked still: cloud+glow+shafts+pool
  var strk, strkW, strkL;            // living filament overlay (primary shaft)
  var S = [];                        // shaft geometry (for mote lighting)
  var motes, sprites, glowSpr, rnd;
  var lastT = -1, tw = null, twNext = 4;

  function rgbOf(str) { var m = /\(([^)]+)\)/.exec(str), p = m[1].split(','); return [+p[0], +p[1], +p[2]]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a) + ')'; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function fbm(x, y) {
    return vnoise(x, y) * 0.55 + vnoise(x * 2.13 + 37.2, y * 2.13 + 91.7) * 0.28 +
           vnoise(x * 4.71 + 11.8, y * 4.71 + 57.3) * 0.17;
  }

  /* ── atmosphere noise: warm haze, dense only toward the light ── */
  function buildCloud() {
    cw = Math.ceil(W * 1.2 / 3); ch = Math.ceil(Hh * 1.2 / 3);
    cloud = document.createElement('canvas'); cloud.width = cw; cloud.height = ch;
    var g = cloud.getContext('2d'), img = g.createImageData(cw, ch), d = img.data, i = 0;
    for (var y = 0; y < ch; y++) {
      var v = y / (ch - 1);
      for (var x = 0; x < cw; x++, i += 4) {
        var u = x / (cw - 1);
        var n = fbm(x * 0.009, y * 0.009);
        var mixw = clamp01((fbm(x * 0.021 + 133.7, y * 0.021 + 71.3) - 0.3) * 1.7);
        var dgl = u * 0.62 + (1 - v) * 0.78;                 // toward upper right
        var wgt = 0.1 + 0.9 * Math.pow(clamp01((dgl - 0.25) / 1.05), 1.6);
        d[i]     = Math.round(GC[0] + (WC[0] - GC[0]) * mixw);
        d[i + 1] = Math.round(GC[1] + (WC[1] - GC[1]) * mixw);
        d[i + 2] = Math.round(GC[2] + (WC[2] - GC[2]) * mixw);
        d[i + 3] = Math.round(Math.pow(clamp01(n), 2.0) * wgt * 0.42 * 255);
      }
    }
    g.putImageData(img, 0, 0);
  }

  /* ── one shaft sprite: warm core, gold flanks, streaks, cloudy erosion ── */
  function crossGrad(g, sw, sl, peakPx, sigLpx, sigRpx, core, col) {
    var lg = g.createLinearGradient(0, 0, sw, 0);
    for (var i = 0; i <= 18; i++) {
      var px = i / 18 * sw, dd = px - peakPx, sg = dd < 0 ? sigLpx : sigRpx;
      var a = (i === 0 || i === 18) ? 0 : core * Math.exp(-(dd * dd) / (2 * sg * sg));
      lg.addColorStop(i / 18, rgba(col, a));
    }
    g.fillStyle = lg; g.fillRect(0, 0, sw, sl);
  }
  function makeShaft(cfg) {
    var s = {
      ox: cfg.ox, oy: cfg.oy, tilt: cfg.tilt,
      dx: Math.sin(cfg.tilt), dy: Math.cos(cfg.tilt),
      hw: cfg.hw, gain: cfg.gain, len: diag * 1.3
    };
    var sw = Math.round(s.hw * 5), sl = Math.round(s.len);
    var c = document.createElement('canvas'); c.width = sw; c.height = sl;
    var g = c.getContext('2d');
    var peak = s.hw * 2.2, ws = cfg.wSig || 0.42;
    crossGrad(g, sw, sl, peak, s.hw * 0.85, s.hw * 1.15, cfg.core * 0.44, GC);
    crossGrad(g, sw, sl, peak - s.hw * 0.08, s.hw * ws, s.hw * ws * 1.38, cfg.core * 0.95, WC);
    for (var i = 0; i < cfg.streaks; i++) {
      var sx = peak + (rnd() - 0.5) * s.hw * 2.2;
      var wd = s.hw * ((cfg.stW || 0.14) + rnd() * 0.22);
      var a = 0.04 + rnd() * (cfg.stA || 0.07);
      var col = rnd() < 0.72 ? WC : GC;
      var lg = g.createLinearGradient(sx - wd, 0, sx + wd, 0);
      lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(0.5, rgba(col, a)); lg.addColorStop(1, rgba(col, 0));
      g.fillStyle = lg; g.fillRect(sx - wd, 0, wd * 2, sl);
    }
    g.globalCompositeOperation = 'destination-out';          // cloudy erosion
    g.globalAlpha = 0.85;
    g.drawImage(cloud, 0, 0, cw, ch, 0, 0, sw, sl);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';           // longitudinal fade
    var vg = g.createLinearGradient(0, 0, 0, sl);
    vg.addColorStop(0, 'rgba(0,0,0,0.9)'); vg.addColorStop(0.28, 'rgba(0,0,0,1)');
    vg.addColorStop(0.70, 'rgba(0,0,0,0.75)'); vg.addColorStop(0.93, 'rgba(0,0,0,0.3)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg; g.fillRect(0, 0, sw, sl);
    g.globalCompositeOperation = 'source-over';
    s.spr = c; s.sw = sw; s.sl = sl;
    return s;
  }
  function shaftAt(x, y, s) {
    var px = x - s.ox, py = y - s.oy;
    var al = px * s.dx + py * s.dy;
    if (al < 0) return 0;
    var q = Math.abs(px * s.dy - py * s.dx) / (s.hw + al * 0.02);
    if (q >= 1) return 0;
    var f = 1 - q * q;
    return f * f * s.gain;
  }

  /* ── the baked base: everything still in one full-screen canvas ── */
  function buildBase() {
    base = document.createElement('canvas'); base.width = W; base.height = Hh;
    var g = base.getContext('2d');
    // atmosphere — second offset pass adds tactility to the shadow side
    g.drawImage(cloud, -W * 0.1, -Hh * 0.1, W * 1.2, Hh * 1.2);
    g.globalAlpha = 0.4;
    g.drawImage(cloud, -W * 0.55, -Hh * 0.2, W * 1.65, Hh * 1.45);
    g.globalAlpha = 1;
    // window glow upper right
    var wg = g.createRadialGradient(W * 0.98, -Hh * 0.06, 0, W * 0.98, -Hh * 0.06, W * 0.4);
    wg.addColorStop(0, rgba(WC, 0.22)); wg.addColorStop(0.55, rgba(GC, 0.06)); wg.addColorStop(1, rgba(GC, 0));
    g.fillStyle = wg; g.fillRect(0, 0, W, Hh);
    // shafts — primary gets a wide faint scatter halo behind it
    g.globalCompositeOperation = 'lighter';
    for (var j = 0; j < S.length; j++) {
      var s = S[j];
      g.save(); g.translate(s.ox, s.oy); g.rotate(-s.tilt);
      if (j === 0) { g.globalAlpha = 0.4; g.drawImage(s.spr, -s.sw * 0.95, 0, s.sw * 1.9, s.sl); g.globalAlpha = 1; }
      g.drawImage(s.spr, -s.sw / 2, 0, s.sw, s.sl);
      g.restore();
    }
    // floor pool where the primary blade lands — a soft bloom, mostly cropped
    var al0 = (Hh * 0.985 - S[0].oy) / S[0].dy;
    var poolX = S[0].ox + S[0].dx * al0;
    g.save(); g.translate(poolX, Hh * 0.985); g.scale(1, 0.34);
    var pr = Math.max(W * 0.17, Hh * 0.2);
    var pg = g.createRadialGradient(0, 0, 0, 0, 0, pr);
    pg.addColorStop(0, rgba(WC, 0.1)); pg.addColorStop(0.55, rgba(GC, 0.04)); pg.addColorStop(1, rgba(GC, 0));
    g.fillStyle = pg; g.fillRect(-pr, -pr, pr * 2, pr * 2);
    g.restore();
    g.globalCompositeOperation = 'source-over';
  }

  /* ── living filaments: thin warm strands riding the primary blade ── */
  function buildStreak() {
    strkW = Math.round(S[0].hw * 1.8); strkL = Math.round(diag * 1.0);
    strk = document.createElement('canvas'); strk.width = strkW; strk.height = strkL;
    var g = strk.getContext('2d');
    for (var i = 0; i < 5; i++) {
      var x = strkW * (0.18 + rnd() * 0.64);
      var sg = 8 + rnd() * 14;
      var a = 0.06 + rnd() * 0.07;
      var col = rnd() < 0.8 ? WC : GC;
      var lg = g.createLinearGradient(x - sg * 3, 0, x + sg * 3, 0);
      lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(0.5, rgba(col, a)); lg.addColorStop(1, rgba(col, 0));
      g.fillStyle = lg; g.fillRect(x - sg * 3, 0, sg * 6, strkL);
    }
    g.globalCompositeOperation = 'destination-in';
    var vg = g.createLinearGradient(0, 0, 0, strkL);
    vg.addColorStop(0, 'rgba(0,0,0,0.55)'); vg.addColorStop(0.3, 'rgba(0,0,0,1)');
    vg.addColorStop(0.8, 'rgba(0,0,0,0.5)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg; g.fillRect(0, 0, strkW, strkL);
    g.globalCompositeOperation = 'source-over';
  }

  /* ── dust: 3 depth layers, prerendered dots (deepest = blurriest) ── */
  function dot(px, stops, col) {
    var c = document.createElement('canvas'); c.width = px; c.height = px;
    var g = c.getContext('2d'), r = px / 2;
    var rg = g.createRadialGradient(r, r, 0, r, r, r);
    for (var i = 0; i < stops.length; i++) rg.addColorStop(stops[i][0], rgba(col, stops[i][1]));
    g.fillStyle = rg; g.fillRect(0, 0, px, px);
    return c;
  }
  function buildMotes() {
    var sc = (W * Hh) / (1360 * 900);
    var layers = [
      { n: Math.round(135 * sc), r0: 0.6, r1: 1.3, sp: 1.5, base: 0.07, boost: 0.6,  fs: 7 },
      { n: Math.round(72  * sc), r0: 1.1, r1: 2.2, sp: 2.6, base: 0.085, boost: 0.9, fs: 4.6 },
      { n: Math.round(34  * sc), r0: 2.2, r1: 3.5, sp: 4.4, base: 0.11, boost: 1.2, fs: 3.1 }
    ];
    motes = [];
    for (var L = 0; L < 3; L++) {
      var lay = layers[L];
      for (var i = 0; i < lay.n; i++) {
        var x, y;
        if (rnd() < 0.42) {                                  // seed some in-beam
          var sh = S[rnd() < 0.72 ? 0 : 1];
          var al = 120 + rnd() * diag;
          var qq = (rnd() * 2 - 1) * (sh.hw + al * 0.02) * 1.15;
          x = sh.ox + sh.dx * al + sh.dy * qq;
          y = sh.oy + sh.dy * al - sh.dx * qq;
          if (x < -20 || x > W + 20 || y < -20 || y > Hh + 20) { x = rnd() * W; y = rnd() * Hh; }
        } else { x = rnd() * W; y = rnd() * Hh; }
        motes.push({
          x: x, y: y, L: L,
          r: lay.r0 + rnd() * (lay.r1 - lay.r0),
          sp: lay.sp * (0.55 + rnd() * 0.8),
          base: lay.base * (0.7 + rnd() * 0.6),
          boost: lay.boost * (0.75 + rnd() * 0.5),
          fw: 0.22 + rnd() * 0.5, ph: rnd() * TAU,
          lz: rnd() * 90, rise: 0.5 + rnd() * 0.9,
          fs: lay.fs, f: 0
        });
      }
    }
  }

  return {
    build: function (w, h) {
      W = w; Hh = h; diag = Math.hypot(w, h);
      GC = rgbOf(gold(1)); WC = rgbOf(warm(1));
      rnd = mulberry32(20260704);
      buildCloud();
      S.length = 0;
      var portrait = Hh > W;
      S.push(makeShaft({                                     // primary blade
        ox: W * (portrait ? 0.96 : 0.88), oy: -Hh * 0.30,
        tilt: portrait ? -0.30 : -0.46,
        hw: Math.max(68, W * 0.07), gain: 1, core: 0.30, streaks: 8
      }));
      S.push(makeShaft({                                     // thin companion
        ox: W * 1.15, oy: -Hh * 0.26,
        tilt: portrait ? -0.36 : -0.53,
        hw: Math.max(30, W * 0.027), gain: 0.7, core: 0.17, streaks: 2,
        wSig: 0.62, stW: 0.3, stA: 0.04
      }));
      buildBase();
      buildStreak();
      buildMotes();
      sprites = [
        dot(28, [[0, 1], [0.28, 0.5], [1, 0]], GC),          // far: blurred blob
        dot(22, [[0, 1], [0.3, 0.55], [1, 0]], GC),          // mid
        dot(24, [[0, 1], [0.16, 0.9], [0.42, 0.22], [1, 0]], WC) // near: sharp core
      ];
      glowSpr = dot(64, [[0, 0.9], [0.35, 0.3], [1, 0]], WC);
      lastT = -1; tw = null; twNext = 3 + rnd() * 3;
    },

    draw: function (ctx, t, k) {
      var dts = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;

      // 1 · the baked still (one full-screen blit)
      ctx.globalAlpha = k;
      ctx.drawImage(base, 0, 0, W, Hh);

      // 2 · living filaments over the primary blade
      var s0 = S[0];
      if (!STATIC_ONLY) {
        var sway = Math.sin(t * 0.026 + 0.9) * 0.005;
        var slide = 30 * Math.sin(t * 0.021 + 2.2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * (0.55 + 0.35 * Math.sin(t * 0.047 + 1.2));
        ctx.translate(s0.ox, s0.oy);
        ctx.rotate(-s0.tilt + sway);
        ctx.drawImage(strk, -strkW / 2, slide - 40, strkW, strkL);
        ctx.restore();
      }

      // 3 · twinkle scheduler (one mote, every few seconds, never more)
      var n = motes.length;
      if (!STATIC_ONLY) {
        if (tw) {
          var u = (t - tw.t0) / tw.dur;
          if (u >= 1) { tw = null; twNext = t + 3.2 + rnd() * 3.8; }
          else tw.e = Math.sin(Math.PI * u);
        } else if (t >= twNext) {
          for (var tr = 0; tr < 14; tr++) {
            var ci = (rnd() * n) | 0;
            if (motes[ci].f > 0.3 && motes[ci].L > 0) { tw = { i: ci, t0: t, dur: 1.4 + rnd() * 1.1, e: 0 }; break; }
          }
          if (!tw) twNext = t + 1.5;
        }
      }

      // 4 · dust
      ctx.globalCompositeOperation = 'lighter';
      var lum = 0.85 + (STATIC_ONLY ? 0 : 0.25 * Math.sin(t * 0.047 + 1.2));
      var m, f, a, sz, hs;
      for (var i = 0; i < n; i++) {
        m = motes[i];
        f = (shaftAt(m.x, m.y, S[0]) + shaftAt(m.x, m.y, S[1])) * lum;
        if (f > 1) f = 1;
        m.f = f;
        if (dts > 0 && !STATIC_ONLY) {
          var ang = vnoise(m.x * 0.0042 + t * 0.021, m.y * 0.0042 + m.lz) * TAU * 1.9;
          m.x += Math.cos(ang) * m.sp * dts;
          m.y += (Math.sin(ang) * m.sp * 0.72 - m.rise * (0.35 + f)) * dts;
          if (m.x < -24) m.x += W + 48; else if (m.x > W + 24) m.x -= W + 48;
          if (m.y < -24) m.y += Hh + 48; else if (m.y > Hh + 24) m.y -= Hh + 48;
        }
        a = (m.base + f * m.boost) * (0.72 + 0.28 * Math.sin(t * m.fw + m.ph)) * k;
        if (tw && tw.i === i) a += tw.e * 0.85 * k;
        if (a > 1) a = 1;
        if (a < 0.008) continue;
        sz = m.r * m.fs; hs = sz / 2;
        ctx.globalAlpha = a;
        ctx.drawImage(sprites[m.L], m.x - hs, m.y - hs, sz, sz);
      }
      if (tw && tw.e > 0.02) {
        var tm = motes[tw.i], gs = 30 + tm.r * 10;
        ctx.globalAlpha = tw.e * 0.5 * k;
        ctx.drawImage(glowSpr, tm.x - gs / 2, tm.y - gs / 2, gs, gs);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  };
});

/* FOGLIA D'ORO — a gilded surface. Gold leaf laid in leaf-sized tesserae
   (baroque ceiling / icon ground) in a sweeping band from the top-right
   corner. The field is precomputed offscreen: each leaf is a facet with its
   own tone and luminance (cluster noise groups leaves into big soft masses
   of light and shadow — deep umber → rich gold → cream fire), hairline
   seams, soft burnish sheen, occasional craquelure and flecks; a cloudy
   grain pass turns the whole into burnished metal. Life: a slow raking
   light travels the band — per-leaf brightness = f(distance to the front),
   quantised per tessera by filling per-leaf alpha masks on a half-res stage
   then 'source-in' with a lit version of the field: leaves catch fire in
   sequence, as facets do. One composite canvas, one full blit per frame. */
register('foglia', function (H) {
  var gold = H.gold, warm = H.warm, TAU = H.TAU,
      STATIC_ONLY = H.STATIC_ONLY, mulberry32 = H.mulberry32, vnoise = H.vnoise;

  var W, Hh, fieldCv, hiS, stage, sctx, comp, cctx, bloomCv, SS = 0.6, SW, SH;
  var leaves = [];
  var GC, WC, LEN, P0x, P0y, ux, uy, nx, ny, bow, headX, headY, DIAG, fc2 = 0;
  var P1 = 26, P2 = 47, SIG1 = 0.12, SIG2 = 0.22;

  function parseRGB(str) {
    var m = /([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(str);
    return m ? [+m[1], +m[2], +m[3]] : [217, 180, 91];
  }
  function col(tone, a) {
    if (tone > 1) tone = 1; if (tone < 0) tone = 0;
    return 'rgba(' + ((GC[0] + (WC[0] - GC[0]) * tone) | 0) + ',' +
      ((GC[1] + (WC[1] - GC[1]) * tone) | 0) + ',' +
      ((GC[2] + (WC[2] - GC[2]) * tone) | 0) + ',' + a + ')';
  }
  function sstep(a, b, x) { x = (x - a) / (b - a); if (x < 0) x = 0; if (x > 1) x = 1; return x * x * (3 - 2 * x); }
  function fbm(x, y, oct, ox, oy) {
    var s = 0, amp = 0.5, tot = 0, o;
    for (o = 0; o < oct; o++) { s += vnoise(x + ox, y + oy) * amp; tot += amp; x = x * 2.07 + 19.3; y = y * 2.07 + 7.7; amp *= 0.5; }
    return s / tot;
  }
  function quad(c, p) {
    c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]);
    c.lineTo(p[4], p[5]); c.lineTo(p[6], p[7]); c.closePath();
  }

  // paint one tessera. mode 0 = unlit base (fieldCv), 1 = lit delta (hiS).
  function paintLeaf(c, p, lf, rnd, mode) {
    var i, t0 = lf.tone, m = lf.m;
    var a = mode ? (0.82 + 0.15 * rnd())
                 : lf.lum * (0.26 + 0.18 * rnd()) * (0.30 + 0.70 * m);
    if (lf.dull) a *= mode ? 0.4 : 0.3;
    if (a > 0.82) a = 0.82;
    // leaf body — a strong tonal tilt: each facet has a bright and a dark end
    var ga = lf.rot + (rnd() - 0.5) * 1.3, gr = lf.L * 0.62;
    var gx = Math.cos(ga) * gr, gy = Math.sin(ga) * gr;
    var g = c.createLinearGradient(lf.cx - gx, lf.cy - gy, lf.cx + gx, lf.cy + gy);
    if (mode) {
      g.addColorStop(0, col(t0 + 0.65, a));
      g.addColorStop(1, col(t0 + 0.32, a * 0.72));
    } else {
      g.addColorStop(0, col(t0 + 0.15, a));
      g.addColorStop(1, col(t0 - 0.10, a * 0.55));
    }
    quad(c, p); c.fillStyle = g; c.fill();
    // burnish sheen — one or two soft directional strokes, not scratches
    if (!lf.dull && !lf.plain) {
      c.save(); quad(c, p); c.clip();
      var sa = lf.rot + lf.streakA, ca2 = Math.cos(sa), sa2 = Math.sin(sa),
          ns = 1 + (rnd() * 2 | 0);
      for (i = 0; i < ns; i++) {
        var off = (rnd() - 0.5) * lf.L * 0.9, dark = rnd() < 0.45;
        c.globalCompositeOperation = dark ? 'destination-out' : 'source-over';
        c.strokeStyle = dark ? 'rgba(0,0,0,' + (0.05 + rnd() * 0.05) + ')'
                             : col(t0 + 0.4, (mode ? 0.10 : 0.045) + rnd() * 0.035);
        c.lineWidth = 3 + rnd() * 5;
        c.beginPath();
        c.moveTo(lf.cx - ca2 * lf.L - sa2 * off, lf.cy - sa2 * lf.L + ca2 * off);
        c.lineTo(lf.cx + ca2 * lf.L - sa2 * off, lf.cy + sa2 * lf.L + ca2 * off);
        c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
      c.restore();
    }
    // seams — hairline shadow gaps on all four edges; the tessellation
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = 'rgba(0,0,0,' + (mode ? 0.45 : 0.32) + ')'; c.lineWidth = 1.1;
    quad(c, p); c.stroke();
    c.globalCompositeOperation = 'source-over';
    // one faint lit edge facing the head; in the lit layer it flares
    if (!lf.dull && !lf.plain && (mode || rnd() < 0.45)) {
      c.strokeStyle = col(0.85, (mode ? 0.40 : 0.07) * (0.4 + 0.6 * m));
      c.lineWidth = mode ? 1 : 0.7;
      c.beginPath(); c.moveTo(p[6], p[7]); c.lineTo(p[0], p[1]); c.lineTo(p[2], p[3]); c.stroke();
    }
    // craquelure — short dark hairline wanders
    if (lf.crack) {
      var ncr = 1 + (rnd() * 2 | 0), s;
      for (i = 0; i < ncr; i++) {
        var px = lf.cx + (rnd() - 0.5) * lf.L * 0.8, py = lf.cy + (rnd() - 0.5) * lf.L * 0.8;
        var da = rnd() * TAU, segs = 3 + (rnd() * 3 | 0);
        c.globalCompositeOperation = 'destination-out';
        c.strokeStyle = 'rgba(0,0,0,' + ((mode ? 0.4 : 0.24) + rnd() * 0.12) + ')';
        c.lineWidth = 0.7 + rnd() * 0.4;
        c.beginPath(); c.moveTo(px, py);
        for (s = 0; s < segs; s++) {
          da += (rnd() - 0.5) * 1.4;
          px += Math.cos(da) * lf.L * (0.08 + rnd() * 0.12);
          py += Math.sin(da) * lf.L * (0.08 + rnd() * 0.12);
          c.lineTo(px, py);
        }
        c.stroke();
        c.globalCompositeOperation = 'source-over';
      }
    }
    // flecks — warm sparks and dark pits; sparks flare in the lit layer
    if (!lf.plain && rnd() < (mode ? 0.35 : 0.5)) {
      var nf = 1 + (rnd() * 3 | 0);
      for (i = 0; i < nf; i++) {
        var dk = !mode && rnd() < 0.4;
        c.globalCompositeOperation = dk ? 'destination-out' : 'source-over';
        c.fillStyle = dk ? 'rgba(0,0,0,' + (0.12 + rnd() * 0.14) + ')'
                         : col(0.9, (mode ? 0.35 : 0.14) + rnd() * 0.2);
        c.beginPath();
        c.arc(lf.cx + (rnd() - 0.5) * lf.L * 0.8, lf.cy + (rnd() - 0.5) * lf.L * 0.8,
              0.4 + rnd() * (mode ? 1.4 : 1.0), 0, TAU);
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
  }

  function makeGrain(w3, h3, seed, brightMode) {
    var cv = document.createElement('canvas'); cv.width = w3; cv.height = h3;
    var cx2 = cv.getContext('2d'), id = cx2.createImageData(w3, h3), d = id.data;
    var idx = 0, x, y, tone = brightMode ? 0.9 : 0;
    var rr = (GC[0] + (WC[0] - GC[0]) * tone) | 0, gg = (GC[1] + (WC[1] - GC[1]) * tone) | 0,
        bb = (GC[2] + (WC[2] - GC[2]) * tone) | 0;
    for (y = 0; y < h3; y++) for (x = 0; x < w3; x++, idx += 4) {
      var n = fbm(x * 0.013, y * 0.013, 3, seed, seed * 1.7);
      var fine = vnoise(x * 0.33 + seed, y * 0.33);
      var av = brightMode
        ? (sstep(0.53, 0.92, n) * 0.36 + fine * 0.08)
        : (sstep(0.50, 0.14, n) * 0.50 + fine * 0.10);
      d[idx] = rr; d[idx + 1] = gg; d[idx + 2] = bb;
      d[idx + 3] = (av > 1 ? 1 : av) * 255 | 0;
    }
    cx2.putImageData(id, 0, 0);
    return cv;
  }

  return {
    build: function (w, h) {
      W = w; Hh = h; DIAG = Math.hypot(w, h);
      var mn = Math.min(w, h);
      GC = parseRGB(gold(1)); WC = parseRGB(warm(1));
      // ── band geometry: top-right corner sweeping down-left ──
      P0x = w * 1.04; P0y = -h * 0.08;
      var p1x = w * 0.10, p1y = h * 1.06;
      var dx = p1x - P0x, dy = p1y - P0y;
      LEN = Math.hypot(dx, dy); ux = dx / LEN; uy = dy / LEN; nx = -uy; ny = ux;
      bow = mn * 0.09;
      headX = P0x + ux * LEN * 0.14; headY = P0y + uy * LEN * 0.14;
      var L = Math.max(46, Math.min(96, mn * 0.085));
      var maxHw = mn * 0.38;

      fieldCv = document.createElement('canvas');
      fieldCv.width = w; fieldCv.height = h;
      var fc = fieldCv.getContext('2d');
      SW = Math.ceil(w * SS); SH = Math.ceil(h * SS);
      hiS = document.createElement('canvas'); hiS.width = SW; hiS.height = SH;
      var hc = hiS.getContext('2d'); hc.scale(SS, SS);
      stage = document.createElement('canvas'); stage.width = SW; stage.height = SH;
      sctx = stage.getContext('2d');
      comp = document.createElement('canvas'); comp.width = w; comp.height = h;
      cctx = comp.getContext('2d');
      leaves = []; fc2 = 0;

      var rnd = mulberry32(20260704);

      function course(pitch, hwScale, aScale, lit) {
        var vExt = maxHw * hwScale + bow + pitch;
        var jRows = Math.ceil(vExt * 2 / pitch), iCols = Math.ceil(LEN * 1.10 / pitch);
        var j, i;
        for (j = 0; j < jRows; j++) {
          var rowOff = (rnd() - 0.5) * pitch * 0.35;
          var rowRot = (rnd() - 0.5) * 0.05;
          for (i = 0; i < iCols; i++) {
            var cu = -0.04 * LEN + (i + 0.5) * pitch + rowOff;
            var cv2 = -vExt + (j + 0.5) * pitch + (rnd() - 0.5) * pitch * 0.10;
            var un = cu / LEN;
            var bo = bow * Math.sin(un * 2.6 + 0.4);
            // organic band width — swells and pinches along its run
            var hw2 = mn * (0.38 - 0.12 * un) * hwScale *
                      (0.74 + 0.55 * vnoise(un * 3.1, 7.7));
            var dist = Math.abs(cv2 - bo);
            var mA = 1 - sstep(hw2 * 0.60, hw2 * 1.12, dist);
            var mL = sstep(-0.05, 0.06, un) * (1 - sstep(0.90, 1.06, un));
            var m = mA * mL, stray = false;
            if (m <= 0.02) {
              if (lit && rnd() < 0.05 && dist < hw2 * 1.6 && mL > 0.3) { m = 0.06; stray = true; }
              else continue;
            } else if (m < 0.5 && rnd() < (0.5 - m) * 1.35) continue;
            var cx3 = P0x + ux * cu + nx * cv2, cy3 = P0y + uy * cu + ny * cv2;
            if (cx3 < -pitch || cx3 > w + pitch || cy3 < -pitch || cy3 > h + pitch) continue;
            var rot = Math.atan2(uy, ux) + rowRot + (rnd() - 0.5) * 0.09;
            var hwL = pitch * 0.5 + 1, hhL = pitch * 0.5 + 1;
            var cr = Math.cos(rot), sr = Math.sin(rot), p = [], corner;
            var cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            for (corner = 0; corner < 4; corner++) {
              var qx = cs[corner][0] * hwL + (rnd() - 0.5) * pitch * 0.05;
              var qy = cs[corner][1] * hhL + (rnd() - 0.5) * pitch * 0.05;
              p.push(cx3 + qx * cr - qy * sr, cy3 + qx * sr + qy * cr);
            }
            // cluster noise → bimodal masses: deep shadow field, luminous pools
            var cl = fbm(cx3 * 0.0016, cy3 * 0.0016, 2, 3.7, 9.1);
            var cl2 = sstep(0.30, 0.80, cl);
            var lum = (0.30 + 1.9 * cl2) * (1.16 - 0.38 * un) * aScale;
            if (lum > 2.0) lum = 2.0;
            var lf = {
              cx: cx3, cy: cy3, L: pitch, rot: rot, m: m,
              tone: 0.10 + rnd() * 0.16 + 0.36 * (lum > 1 ? 1 : lum),
              lum: lum * (stray ? 0.38 : 1),
              gain: (rnd() < 0.14 ? 1.45 : 0.75 + 0.55 * rnd()) * (0.75 + 0.5 * cl2),
              streakA: (rnd() - 0.5) * 0.3,
              plain: !lit || stray,
              dull: (lit && m > 0.6 && rnd() < 0.06),
              crack: lit && rnd() < 0.24 && m > 0.35,
              d: un + (rnd() - 0.5) * 0.05,
              js: 0.75 + 0.6 * rnd(),
              sp: 6 + rnd() * 13, so: rnd() * TAU,
              samp: 0.05 + rnd() * 0.05
            };
            if (lf.gain > 1.7) lf.gain = 1.7;
            paintLeaf(fc, p, lf, rnd, 0);
            if (lit) {
              paintLeaf(hc, p, lf, rnd, 1);
              var ps = [], q2;
              for (q2 = 0; q2 < 8; q2++) ps.push(p[q2] * SS);
              lf.ps = ps;
              leaves.push(lf);
            }
          }
        }
      }

      // under-course: small dim tesserae extending past the edge — depth
      course(L * 0.55, 1.26, 0.13, false);
      // top course: the gilding itself
      course(L, 1.0, 1.0, true);

      // ── grain: cloudy luminance + fine metal sparkle, leaves-only ──
      var w3 = Math.ceil(w / 3), h3 = Math.ceil(h / 3);
      var brightG = makeGrain(w3, h3, 11.3, true);
      var darkG = makeGrain(w3, h3, 47.9, false);
      fc.globalCompositeOperation = 'source-atop';
      fc.drawImage(brightG, 0, 0, w, h);
      fc.globalCompositeOperation = 'destination-out';
      fc.drawImage(darkG, 0, 0, w, h);
      // compositional luminance: cream fire at the head, umber tail
      fc.globalCompositeOperation = 'source-atop';
      var hg = fc.createRadialGradient(headX, headY, 0, headX, headY, DIAG * 0.42);
      hg.addColorStop(0, warm(0.36)); hg.addColorStop(1, warm(0));
      fc.fillStyle = hg; fc.fillRect(0, 0, w, h);
      fc.globalCompositeOperation = 'destination-out';
      var tg = fc.createLinearGradient(
        P0x + ux * LEN * 0.45, P0y + uy * LEN * 0.45,
        P0x + ux * LEN * 1.05, P0y + uy * LEN * 1.05);
      tg.addColorStop(0, 'rgba(0,0,0,0)'); tg.addColorStop(1, 'rgba(0,0,0,0.30)');
      fc.fillStyle = tg; fc.fillRect(0, 0, w, h);
      // under-glow baked behind the leaves — a pool of warmth at the head
      fc.globalCompositeOperation = 'destination-over';
      var ug = fc.createRadialGradient(headX, headY, 0, headX, headY, DIAG * 0.46);
      ug.addColorStop(0, warm(0.10)); ug.addColorStop(1, warm(0));
      fc.fillStyle = ug; fc.fillRect(0, 0, w, h);
      fc.globalCompositeOperation = 'source-over';
      // lit field gets the grain too, lighter hand
      hc.globalCompositeOperation = 'source-atop';
      hc.globalAlpha = 0.6; hc.drawImage(brightG, 0, 0, w, h);
      hc.globalCompositeOperation = 'destination-out';
      hc.globalAlpha = 0.45; hc.drawImage(darkG, 0, 0, w, h);
      hc.globalAlpha = 1; hc.globalCompositeOperation = 'source-over';
      // bloom sprite — soft halo that rides with the light front
      bloomCv = document.createElement('canvas'); bloomCv.width = bloomCv.height = 128;
      var bc = bloomCv.getContext('2d');
      var bg = bc.createRadialGradient(64, 64, 0, 64, 64, 64);
      bg.addColorStop(0, warm(0.85)); bg.addColorStop(1, warm(0));
      bc.fillStyle = bg; bc.fillRect(0, 0, 128, 128);
    },

    draw: function (ctx, t, k) {
      var st = STATIC_ONLY ? 10 : t;
      if (k > 1) k = 1;
      // refresh the composite every 3rd frame — the light crawls slowly
      if (fc2 % 3 === 0 || fc2 < 2) {
        var ph1 = (st / P1) % 1, ph2 = ((st + 20) / P2) % 1;
        var f1 = -0.05 + 1.10 * ph1, f2 = 1.10 - 1.30 * ph2;
        var e1 = Math.pow(Math.sin(ph1 * Math.PI), 0.6);
        var e2 = Math.sin(ph2 * Math.PI) * 0.55;
        sctx.clearRect(0, 0, SW, SH);
        sctx.globalCompositeOperation = 'source-over';
        var i, n = leaves.length;
        for (i = 0; i < n; i++) {
          var lf = leaves[i];
          var d1 = (lf.d - f1) / (SIG1 * lf.js), d2 = (lf.d - f2) / SIG2;
          var b = e1 * lf.gain * Math.exp(-d1 * d1) + e2 * lf.gain * 0.55 * Math.exp(-d2 * d2)
                + lf.samp * (0.5 + 0.5 * Math.sin(st * TAU / lf.sp + lf.so));
          b *= 0.5 + 0.5 * lf.m;
          if (b <= 0.02) continue;
          if (b > 1) b = 1;
          sctx.fillStyle = 'rgba(255,255,255,' + b + ')';
          var p = lf.ps;
          sctx.beginPath(); sctx.moveTo(p[0], p[1]); sctx.lineTo(p[2], p[3]);
          sctx.lineTo(p[4], p[5]); sctx.lineTo(p[6], p[7]); sctx.closePath(); sctx.fill();
        }
        sctx.globalCompositeOperation = 'source-in';
        sctx.drawImage(hiS, 0, 0);
        // bloom riding the primary front, composited on the stage (cheap)
        if (e1 > 0.02) {
          sctx.globalCompositeOperation = 'source-over';
          var fx = (P0x + ux * f1 * LEN) * SS, fy = (P0y + uy * f1 * LEN) * SS,
              br = DIAG * 0.34 * SS;
          sctx.globalAlpha = 0.22 * e1;
          sctx.drawImage(bloomCv, fx - br, fy - br, br * 2, br * 2);
          sctx.globalAlpha = 1;
        }
        // fold field + light into the composite: one blit per frame after
        cctx.globalCompositeOperation = 'copy';
        cctx.drawImage(fieldCv, 0, 0);
        cctx.globalCompositeOperation = 'source-over';
        cctx.drawImage(stage, 0, 0, W, Hh);
      }
      fc2++;
      ctx.globalAlpha = k * (0.94 + 0.06 * Math.sin(st * TAU / 47));
      ctx.drawImage(comp, 0, 0, W, Hh);
      ctx.globalAlpha = 1;
    }
  };
});

/* CAUSTICA — golden water-light on dark stone. The reflection of a Roman
   fountain at night: soft caustic webs (luminous cell filaments) that breathe,
   merge and split, pooled toward the lower-right of the page while the
   reading column stays calm. Technique: caustic intensity = soft band-pass of
   the sum of two low-frequency value-noise fields, computed at build time on
   a downscaled buffer. Life without per-frame noise: 3 coarse web variants
   (second field offset around a circle in noise space) crossfaded in a
   seamless cycle + 2 fine variants, all drifting at different speeds under
   'lighter' compositing, over a dim warm cloud base (wet stone). A broad
   swell of light glides through the pool (~36s) via source-atop, and an
   underwater bloom breathes beneath. Slow, molten, precious — never plasma.
   Perf: all noise at build; draw = a few half-res blits + 2 gradients. */
register('caustica', function (H) {
  var gold = H.gold, warm = H.warm, TAU = H.TAU,
      STATIC_ONLY = H.STATIC_ONLY, mulberry32 = H.mulberry32;

  var W, Hh, DIAG, PAD, S = 3, BW, BH;
  var stage, sctx, SW, SH, SS = 0.5, fc = 0;
  var cloudCv, coarse = [], fine = [];
  var poolX, poolY, poolR;

  function parseRGB(str) {
    var m = /([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(str);
    return m ? [+m[1], +m[2], +m[3]] : [255, 215, 0];
  }
  function makeNoise(seed) {
    var rnd = mulberry32(seed), perm = new Uint8Array(512), vals = new Float32Array(256),
        p = new Uint8Array(256), i, j, tmp;
    for (i = 0; i < 256; i++) { p[i] = i; vals[i] = rnd(); }
    for (i = 255; i > 0; i--) { j = (rnd() * (i + 1)) | 0; tmp = p[i]; p[i] = p[j]; p[j] = tmp; }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      xi &= 255; yi &= 255;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var a = vals[perm[perm[xi] + yi]], b = vals[perm[perm[xi + 1] + yi]],
          c = vals[perm[perm[xi] + yi + 1]], d = vals[perm[perm[xi + 1] + yi + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(nf, x, y, oct) {
    var s = 0, amp = 0.5, tot = 0, o;
    for (o = 0; o < oct; o++) { s += nf(x, y) * amp; tot += amp; x = x * 2.03 + 13.7; y = y * 2.03 + 7.9; amp *= 0.5; }
    return s / tot;
  }
  function sstep(a, b, x) { x = (x - a) / (b - a); if (x < 0) x = 0; if (x > 1) x = 1; return x * x * (3 - 2 * x); }

  function renderStage(st) {
    var sc = SS;
    sctx.clearRect(0, 0, SW, SH);
    sctx.globalCompositeOperation = 'source-over';
    // wet-stone base — near-static, faint breathing
    var ox = Math.sin(st * TAU / 271) * PAD * 0.30, oy = Math.sin(st * TAU / 353 + 1.1) * PAD * 0.18;
    sctx.globalAlpha = 0.92 + 0.08 * Math.sin(st * TAU / 47 + 0.6);
    sctx.drawImage(cloudCv, (-PAD + ox) * sc, (-PAD + oy) * sc, BW * S * sc, BH * S * sc);
    // coarse caustic web — 3 variants crossfaded in a seamless cycle
    sctx.globalCompositeOperation = 'lighter';
    var th = st * TAU / 52, breath = 0.82 + 0.18 * Math.sin(st * TAU / 29 + 1.7);
    var dx = Math.sin(st * TAU / 199 + 0.4) * PAD * 0.42, dy = Math.sin(st * TAU / 251 + 2.3) * PAD * 0.30;
    var i, wgt;
    for (i = 0; i < 3; i++) {
      wgt = (0.5 + 0.5 * Math.cos(th - i * TAU / 3)) / 1.5;
      if (wgt < 0.03) continue;
      sctx.globalAlpha = wgt * breath;
      sctx.drawImage(coarse[i], (-PAD + dx) * sc, (-PAD + dy) * sc, BW * S * sc, BH * S * sc);
    }
    // fine web — 2 variants, its own tempo, counter-drift (parallax depth)
    var thf = st * TAU / 37 + 0.9, breathF = 0.70 + 0.30 * Math.sin(st * TAU / 23 + 0.3);
    var dxf = Math.sin(st * TAU / 149 + 3.1) * PAD * 0.55, dyf = Math.sin(st * TAU / 181 + 5.2) * PAD * 0.40;
    for (i = 0; i < 2; i++) {
      wgt = 0.5 + (i === 0 ? 0.5 : -0.5) * Math.cos(thf);
      if (wgt < 0.01) continue;
      sctx.globalAlpha = wgt * breathF;
      sctx.drawImage(fine[i], (-PAD + dxf) * sc, (-PAD + dyf) * sc, BW * S * sc, BH * S * sc);
    }
    sctx.globalAlpha = 1;
    // swell — a broad surge of light gliding through the pool every ~36s,
    // lighting the caustics themselves (source-atop), not the void
    var per = 36, ph = ((st / per) % 1 + 1) % 1, ease = Math.sin(ph * Math.PI);
    if (STATIC_ONLY) { ph = 0.42; ease = 1; }
    if (ease > 0.01) {
      var ang = -0.62, ext = DIAG * sc;
      var bx = (-0.65 + 1.30 * ph) * DIAG * sc, bw = DIAG * 0.26 * sc;
      sctx.save();
      sctx.translate(poolX * sc, poolY * sc); sctx.rotate(ang);
      sctx.globalCompositeOperation = 'source-atop';
      var s1 = sctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
      s1.addColorStop(0, warm(0)); s1.addColorStop(0.5, warm(0.50 * ease)); s1.addColorStop(1, warm(0));
      sctx.fillStyle = s1; sctx.fillRect(bx - bw, -ext, bw * 2, ext * 2);
      sctx.restore();
      sctx.globalCompositeOperation = 'source-over';
    }
    // underwater bloom — the basin glows from beneath, breathing slowly
    var ba = 0.06 + 0.03 * Math.sin(st * TAU / 41 + 2.6);
    var rg = sctx.createRadialGradient(poolX * sc, poolY * sc, 0, poolX * sc, poolY * sc, poolR * 1.1 * sc);
    rg.addColorStop(0, warm(ba)); rg.addColorStop(0.4, gold(ba * 0.6)); rg.addColorStop(1, gold(0));
    sctx.fillStyle = rg; sctx.fillRect(0, 0, SW, SH);
  }

  return {
    build: function (w, h) {
      W = w; Hh = h; DIAG = Math.hypot(w, h);
      var minwh = Math.min(w, h);
      PAD = Math.round(minwh * 0.16) + 40;
      BW = Math.ceil((w + PAD * 2) / S); BH = Math.ceil((h + PAD * 2) / S);
      SW = Math.ceil(w * SS); SH = Math.ceil(h * SS);
      stage = document.createElement('canvas'); stage.width = SW; stage.height = SH;
      sctx = stage.getContext('2d');
      fc = 0;
      poolX = w * 0.84; poolY = h * 0.72; poolR = DIAG * 0.48;
      var GC = parseRGB(gold(1)), WC = parseRGB(warm(1));
      var nA = makeNoise(1103), nB = makeNoise(2251), nWid = makeNoise(3307),
          nFA = makeNoise(4409), nFB = makeNoise(5503), nCl = makeNoise(6607),
          nWx = makeNoise(7717), nWy = makeNoise(8821);
      var qc = 2.7 / minwh, qf = qc * 2.4, qw = 1.7 / minwh, qb = 1.15 / minwh,
          qp = 0.95 / minwh, WARP = 0.60;
      var RB = 0.47, cb = Math.cos(RB), sb = Math.sin(RB);
      var N = BW * BH;
      var fldA = new Float32Array(N), fldFA = new Float32Array(N),
          wid = new Float32Array(N), mask = new Float32Array(N), mask2 = new Float32Array(N),
          wpx = new Float32Array(N), wpy = new Float32Array(N);
      // pool composition: main basin lower-right + faint shelf along the
      // bottom + whisper floor everywhere; reading column stays calm
      var p2x = w * 0.66, p2y = h * 1.04, r2 = DIAG * 0.30;
      var idx = 0, bx, by, x, y;
      for (by = 0; by < BH; by++) {
        y = by * S - PAD;
        for (bx = 0; bx < BW; bx++, idx++) {
          x = bx * S - PAD;
          var dx1 = (x - poolX) / poolR, dy1 = (y - poolY) / poolR;
          var dx2 = (x - p2x) / r2, dy2 = (y - p2y) / r2;
          var m = 0.07 + 1.12 * Math.exp(-(dx1 * dx1 + dy1 * dy1) * 2.1)
                       + 0.44 * Math.exp(-(dx2 * dx2 + dy2 * dy2) * 1.7);
          if (m > 1.1) m = 1.1;
          mask[idx] = m;
          mask2[idx] = m * Math.sqrt(m);
          // low-freq domain warp — bends the noise lattice so no cell wall
          // ever runs axis-straight; liquid, not gridded
          var wx = (nWx(x * qp + 3.1, y * qp + 8.7) - 0.5) * WARP;
          var wy = (nWy(x * qp + 12.9, y * qp + 1.3) - 0.5) * WARP;
          wpx[idx] = wx; wpy[idx] = wy;
          fldA[idx] = nA(x * qc + wx, y * qc + wy);
          fldFA[idx] = nFA(x * qf + 7.7 + wx * 0.6, y * qf + 3.9 + wy * 0.6);
          wid[idx] = nWid(x * qw + 2.2, y * qw + 5.5);
        }
      }
      // ── coarse caustic variants: band-pass of (fieldA + fieldB(offset k))
      var K = 3, k, R = 1.55;
      coarse = [];
      for (k = 0; k < K; k++) {
        var offx = R * Math.cos(k * TAU / K), offy = R * Math.sin(k * TAU / K);
        var cv = document.createElement('canvas'); cv.width = BW; cv.height = BH;
        var cx = cv.getContext('2d'), im = cx.createImageData(BW, BH), px = im.data;
        idx = 0;
        var p4 = 0;
        for (by = 0; by < BH; by++) {
          y = by * S - PAD;
          for (bx = 0; bx < BW; bx++, idx++, p4 += 4) {
            x = bx * S - PAD;
            var ub = (x * cb - y * sb) * qc * 1.13, vb = (x * sb + y * cb) * qc * 1.13;
            var s = (fldA[idx] + nB(ub + offx + wpx[idx], vb + offy + wpy[idx])) * 0.5;
            var d = s - 0.5;
            var wm = wid[idx];
            var core = Math.exp(-d * d * (380 + 1300 * wm * wm));
            var glow = Math.exp(-d * d * 70);
            // luminous cell interiors where the field crests — sunlit water
            var li = sstep(0.56, 0.84, s) * 0.22;
            var va = (core * (0.85 + 0.45 * wm) + core * core * 0.35 + glow * 0.18 + li) * mask[idx];
            if (va > 1) va = 1;
            var tt = 0.38 + 0.75 * core + 0.45 * li; if (tt > 1) tt = 1;
            px[p4]     = (GC[0] + (WC[0] - GC[0]) * tt) | 0;
            px[p4 + 1] = (GC[1] + (WC[1] - GC[1]) * tt) | 0;
            px[p4 + 2] = (GC[2] + (WC[2] - GC[2]) * tt) | 0;
            px[p4 + 3] = va * 0.66 * 255 | 0;
          }
        }
        cx.putImageData(im, 0, 0);
        coarse.push(cv);
      }
      // ── fine caustic variants (2): smaller cells, thinner, dimmer
      fine = [];
      for (k = 0; k < 2; k++) {
        var offx2 = 2.3 * (k ? -1 : 1), offy2 = 1.4 * (k ? 1 : -1);
        var cv2 = document.createElement('canvas'); cv2.width = BW; cv2.height = BH;
        var cx2 = cv2.getContext('2d'), im2 = cx2.createImageData(BW, BH), px2 = im2.data;
        idx = 0; p4 = 0;
        for (by = 0; by < BH; by++) {
          y = by * S - PAD;
          for (bx = 0; bx < BW; bx++, idx++, p4 += 4) {
            x = bx * S - PAD;
            var s2 = (fldFA[idx] + nFB(x * qf * 1.11 + offx2 + wpx[idx] * 0.6, y * qf * 1.11 + offy2 + wpy[idx] * 0.6)) * 0.5;
            var d2 = s2 - 0.5;
            var core2 = Math.exp(-d2 * d2 * 800);
            var va2 = (core2 * 0.95 + Math.exp(-d2 * d2 * 110) * 0.10) * mask2[idx];
            if (va2 > 1) va2 = 1;
            var t2 = 0.38 + 0.62 * core2; if (t2 > 1) t2 = 1;
            px2[p4]     = (GC[0] + (WC[0] - GC[0]) * t2) | 0;
            px2[p4 + 1] = (GC[1] + (WC[1] - GC[1]) * t2) | 0;
            px2[p4 + 2] = (GC[2] + (WC[2] - GC[2]) * t2) | 0;
            px2[p4 + 3] = va2 * 0.48 * 255 | 0;
          }
        }
        cx2.putImageData(im2, 0, 0);
        fine.push(cv2);
      }
      // ── wet-stone cloud base — dim warm luminance, texture of the basin
      cloudCv = document.createElement('canvas'); cloudCv.width = BW; cloudCv.height = BH;
      var cc = cloudCv.getContext('2d'), cd = cc.createImageData(BW, BH), cp = cd.data;
      idx = 0; p4 = 0;
      for (by = 0; by < BH; by++) {
        y = by * S - PAD;
        for (bx = 0; bx < BW; bx++, idx++, p4 += 4) {
          x = bx * S - PAD;
          var nc = fbm(nCl, x * qb + 11.3, y * qb + 5.7, 4);
          var cs = sstep(0.42, 0.95, nc);
          var ca = (0.04 + 0.40 * cs) * mask2[idx];
          var tc = 0.42 + cs * 0.42;
          cp[p4]     = (GC[0] + (WC[0] - GC[0]) * tc) | 0;
          cp[p4 + 1] = (GC[1] + (WC[1] - GC[1]) * tc) | 0;
          cp[p4 + 2] = (GC[2] + (WC[2] - GC[2]) * tc) | 0;
          cp[p4 + 3] = (ca > 1 ? 1 : ca) * 0.22 * 255 | 0;
        }
      }
      cc.putImageData(cd, 0, 0);
    },
    draw: function (ctx, t, k) {
      var st = STATIC_ONLY ? 0 : t;
      if (fc % 3 === 0 || fc < 2) renderStage(st);
      fc++;
      ctx.globalAlpha = Math.min(1, k);
      ctx.drawImage(stage, 0, 0, W, Hh);
      ctx.globalAlpha = 1;
    }
  };
});

/* SETA — dark silk catching gold light.
   4-6 vast satin folds. Each fold is a noise-displaced curved band with an
   ASYMMETRIC satin cross-profile — a tight luminous crest riding one edge,
   a soft face rolling into shadow on the other, thread grain baked in —
   precomputed at build (per-pixel, half-res), rotated once into a
   screen-aligned bake. All fold bases + a dim warm cloud compose into one
   static BED canvas. Life: each fold's luminance peak slides slowly along
   its length — an oriented Gaussian light window masked from the fold's
   bake via destination-in (seamless) — phase-offset per fold, plus a global
   breath. Crossings glow ('lighter'). The eye reads drape, not lines.
   Perf: stage = 1 bed blit + 4-6 clipped window passes every 3rd frame;
   one upscaled blit per frame. */
register('seta', function (H) {
  var gold = H.gold, warm = H.warm, TAU = H.TAU,
      STATIC_ONLY = H.STATIC_ONLY, mulberry32 = H.mulberry32, vnoise = H.vnoise;

  var W, Hh, DIAG, folds, bed;
  var stage, sctx, scratch, scx, SW, SH, SS = 0.5, fc = 0;

  function parseRGB(str) {
    var m = /([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(str);
    return m ? [+m[1], +m[2], +m[3]] : [217, 180, 91];
  }
  function fbm(x, y, oct) {
    var s = 0, amp = 0.5, tot = 0, o;
    for (o = 0; o < oct; o++) { s += vnoise(x, y) * amp; tot += amp; x = x * 2.03 + 13.7; y = y * 2.03 + 7.9; amp *= 0.5; }
    return s / tot;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function sstep(a, b, x) { x = (x - a) / (b - a); if (x < 0) x = 0; if (x > 1) x = 1; return x * x * (3 - 2 * x); }

  // compositional light mask — lift the corners, calm the reading column
  function lightMask(gx, gy) {
    var dx1 = gx - W * 0.84, dy1 = gy - Hh * 0.14,
        dx2 = gx - W * 0.16, dy2 = gy - Hh * 0.88,
        r1 = DIAG * 0.50, r2 = DIAG * 0.42;
    var m = 0.62 + 0.56 * Math.exp(-(dx1 * dx1 + dy1 * dy1) / (r1 * r1))
                 + 0.30 * Math.exp(-(dx2 * dx2 + dy2 * dy2) / (r2 * r2));
    return m > 1.2 ? 1.2 : m;
  }

  function buildFold(i, NF, rnd, GC, WC) {
    var sMin = Math.min(W, Hh);
    var th = -0.34 + (rnd() - 0.5) * 0.40;
    var dirx = Math.cos(th), diry = Math.sin(th), nx = -diry, ny = dirx;
    var perp = Math.abs(W * diry) + Math.abs(Hh * dirx);
    var d = (-0.5 + (i + 0.5) / NF) * perp * 1.08 + (rnd() - 0.5) * perp / NF * 0.7;
    var Cx = W / 2 + nx * d, Cy = Hh / 2 + ny * d;
    var back = i === 1;                                 // one wide, dim far fold
    var fullW = sMin * (back ? 0.30 + rnd() * 0.08 : 0.11 + rnd() * 0.16);
    var hw0 = fullW / 2;
    var e = rnd() < 0.5 ? -1 : 1;                       // which side carries the crest
    var A = sMin * (0.05 + rnd() * 0.09);
    var Lp = DIAG + 260;
    var Hf = 2 * (A + hw0 * 1.9 + 26);
    var fa = 0.7 + rnd() * 0.5, fb = 1.6 + rnd() * 1.0,
        pa = rnd() * TAU, pb = rnd() * TAU,
        s1 = rnd() * 90, s2 = rnd() * 90, s3 = rnd() * 90, s4 = rnd() * 90;
    var cv = document.createElement('canvas');
    var OW = Math.ceil(Lp * SS), OH = Math.ceil(Hf * SS);
    cv.width = OW; cv.height = OH;
    var c = cv.getContext('2d');
    var img = c.createImageData(OW, OH), px = img.data;
    var col, row, u, cyv, hwv, vc, lum, X, Y, gx, gy;
    var TCY = new Float32Array(OW), THW = new Float32Array(OW),
        TVC = new Float32Array(OW), TLM = new Float32Array(OW),
        TLN = new Float32Array(OW);
    for (col = 0; col < OW; col++) {
      u = col / OW;
      cyv = A * (Math.sin(u * TAU * fa + pa) * 0.6 + Math.sin(u * TAU * fb + pb) * 0.4)
          + A * 0.5 * ((vnoise(u * 2.6 + s1, 7.7) - 0.5) * 2);
      hwv = hw0 * (0.72 + 0.55 * vnoise(u * 2.2 + s2, 3.3));
      vc = (vnoise(u * 1.7 + s3, 9.1) - 0.5) * 0.42;
      lum = 0.45 + 0.85 * vnoise(u * 1.6 + s4, 5.5);
      X = col / SS - Lp / 2; Y = cyv;
      gx = Cx + dirx * X + nx * Y; gy = Cy + diry * X + ny * Y;
      TCY[col] = (Hf / 2 + cyv) * SS;
      THW[col] = hwv * SS;
      TVC[col] = vc;
      TLM[col] = lum * lightMask(gx, gy);
      TLN[col] = (lum - 0.45) / 0.85;
    }
    var idx, v, s, face, crest, cut, t1, t2, threads, a, tcol, dy;
    for (row = 0; row < OH; row++) {
      idx = row * OW * 4;
      for (col = 0; col < OW; col++, idx += 4) {
        dy = row - TCY[col];
        v = dy / THW[col];
        s = v * e;
        if (s > 1.2 || s < -2.0) { px[idx + 3] = 0; continue; }
        // satin profile: soft face into shadow, tight crest at the lit edge
        face = Math.exp(-(s + 0.45) * (s + 0.45) * 1.15);
        if (s < 0) face *= 1 - sstep(1.25, 1.9, -s);
        crest = Math.exp(-(s - 0.42 - TVC[col]) * (s - 0.42 - TVC[col]) * 14);
        cut = 1 - sstep(0.78, 1.10, s);
        // silk threads — striations riding the sheen, calm on the face
        t1 = vnoise(col * 0.06 + s1 * 3.1, dy * 0.30 + s2);
        t2 = vnoise(col * 0.020 + s3 * 2.7, dy * 0.9 + 3.3);
        threads = 0.85 + (0.34 * (t1 - 0.5) + 0.22 * (t2 - 0.5)) * (0.35 + 0.65 * crest);
        a = (face * 0.24 + crest * 1.0) * cut * threads * TLM[col];
        if (a > 1) a = 1; if (a < 0) a = 0;
        // dim silk keeps saturated gold; only the lit sheen goes cream
        tcol = clamp01((0.26 + 0.74 * crest + 0.06 * (threads - 0.85)) * (0.5 + 0.5 * TLN[col]));
        px[idx]     = (GC[0] + (WC[0] - GC[0]) * tcol) | 0;
        px[idx + 1] = (GC[1] + (WC[1] - GC[1]) * tcol) | 0;
        px[idx + 2] = (GC[2] + (WC[2] - GC[2]) * tcol) | 0;
        px[idx + 3] = (a * 255) | 0;
      }
    }
    c.putImageData(img, 0, 0);
    // rotate once into a screen-aligned bake; the local canvas is discarded
    var bk = document.createElement('canvas'); bk.width = SW; bk.height = SH;
    var bc = bk.getContext('2d');
    bc.translate(Cx * SS, Cy * SS); bc.rotate(th); bc.translate(-OW / 2, -OH / 2);
    bc.drawImage(cv, 0, 0);
    return {
      bk: bk, th: th, dirx: dirx, diry: diry, Cx: Cx, Cy: Cy, Lp: Lp, OH: OH,
      base: back ? 0.36 : 0.20,
      amp: back ? 0.5 : 0.85 + rnd() * 0.15,
      T: 38 + rnd() * 34, ph: rnd() * TAU, sg: 0.09 + rnd() * 0.05,
      T2: 47 + rnd() * 40, ph2: rnd() * TAU
    };
  }

  // one fold's traveling light — oriented Gaussian window, seamless
  function lightWindow(f, p, amp) {
    var pwx = (f.Cx + f.dirx * (p - 0.5) * f.Lp) * SS,
        pwy = (f.Cy + f.diry * (p - 0.5) * f.Lp) * SS,
        lw = 2.2 * f.sg * f.Lp * SS, hh = f.OH / 2;
    var ex = Math.abs(f.dirx) * lw + Math.abs(f.diry) * hh,
        ey = Math.abs(f.diry) * lw + Math.abs(f.dirx) * hh;
    var x0 = Math.floor(pwx - ex), y0 = Math.floor(pwy - ey),
        x1 = Math.ceil(pwx + ex), y1 = Math.ceil(pwy + ey);
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 > SW) x1 = SW; if (y1 > SH) y1 = SH;
    var bw = x1 - x0, bh = y1 - y0;
    if (bw < 3 || bh < 3) return;
    scx.clearRect(x0, y0, bw, bh);
    scx.drawImage(f.bk, x0, y0, bw, bh, x0, y0, bw, bh);
    scx.globalCompositeOperation = 'destination-in';
    var g = scx.createLinearGradient(pwx - f.dirx * lw, pwy - f.diry * lw,
                                     pwx + f.dirx * lw, pwy + f.diry * lw);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.16, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.30, 'rgba(255,255,255,0.36)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.76)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.58, 'rgba(255,255,255,0.76)');
    g.addColorStop(0.70, 'rgba(255,255,255,0.36)');
    g.addColorStop(0.84, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    scx.fillStyle = g; scx.fillRect(x0, y0, bw, bh);
    scx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = amp;
    sctx.drawImage(scratch, x0, y0, bw, bh, x0, y0, bw, bh);
  }

  function renderStage(st) {
    sctx.clearRect(0, 0, SW, SH);
    sctx.globalAlpha = 0.90 + 0.10 * Math.sin(st * TAU / 21 + 1.3);   // breath
    sctx.drawImage(bed, 0, 0);
    sctx.globalCompositeOperation = 'lighter';
    var i, f, p, amp;
    for (i = 0; i < folds.length; i++) {
      f = folds[i];
      p = 0.5 + 0.44 * Math.sin(st * TAU / f.T + f.ph);
      amp = f.amp * (0.78 + 0.22 * Math.sin(st * TAU / f.T2 + f.ph2));
      lightWindow(f, p, amp);
    }
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'source-over';
  }

  return {
    build: function (w, h) {
      W = w; Hh = h; DIAG = Math.hypot(w, h);
      SW = Math.ceil(w * SS); SH = Math.ceil(h * SS);
      stage = document.createElement('canvas'); stage.width = SW; stage.height = SH;
      sctx = stage.getContext('2d');
      scratch = document.createElement('canvas'); scratch.width = SW; scratch.height = SH;
      scx = scratch.getContext('2d');
      fc = 0;
      var GC = parseRGB(gold(1)), WC = parseRGB(warm(1));
      // ── dim warm cloud (the fabric in shadow), straight into the bed ──
      var CS = 3, CBW = Math.ceil(w / CS), CBH = Math.ceil(h / CS);
      var cloudCv = document.createElement('canvas'); cloudCv.width = CBW; cloudCv.height = CBH;
      var cc = cloudCv.getContext('2d');
      var cd = cc.createImageData(CBW, CBH), cp = cd.data;
      var q = 1 / Math.min(w, h), G = -0.34, cg = Math.cos(G), sg2 = Math.sin(G);
      var idx = 0, by, bx, x, y, u, v, nc, ca;
      for (by = 0; by < CBH; by++) {
        y = by * CS;
        for (bx = 0; bx < CBW; bx++, idx += 4) {
          x = bx * CS;
          u = x * cg + y * sg2; v = -x * sg2 + y * cg;
          nc = fbm(u * q * 1.1 + 5.1, v * q * 2.2 + 2.7, 4);
          ca = clamp01((nc - 0.30) * 1.6) * lightMask(x, y);
          cp[idx] = GC[0]; cp[idx + 1] = GC[1]; cp[idx + 2] = GC[2];
          cp[idx + 3] = (ca * 0.24 * 255) | 0;
        }
      }
      cc.putImageData(cd, 0, 0);
      // ── folds ──
      var rnd = mulberry32(7301);
      var NF = Math.max(4, Math.min(6, Math.round(DIAG / 330)));
      folds = [];
      var i;
      for (i = 0; i < NF; i++) folds.push(buildFold(i, NF, rnd, GC, WC));
      // ── the bed: cloud + every fold at its dim base, composed once ──
      bed = document.createElement('canvas'); bed.width = SW; bed.height = SH;
      var bc = bed.getContext('2d');
      bc.drawImage(cloudCv, 0, 0, SW, SH);
      bc.globalCompositeOperation = 'lighter';
      for (i = 0; i < NF; i++) {
        bc.globalAlpha = folds[i].base;
        bc.drawImage(folds[i].bk, 0, 0);
      }
      bc.globalAlpha = 1; bc.globalCompositeOperation = 'source-over';
    },
    draw: function (ctx, t, k) {
      var st = STATIC_ONLY ? 13.7 : t;
      if (fc % 3 === 0 || fc < 2) renderStage(st);
      fc++;
      ctx.globalAlpha = Math.min(1, k);
      ctx.drawImage(stage, 0, 0, W, Hh);
      ctx.globalAlpha = 1;
    }
  };
});

  window.BoomAmbient = { mount: mount, register: register, scenes: Object.keys(SCENES), moods: Object.keys(MOODS), reduce: REDUCE, lite: LITE };
})();
