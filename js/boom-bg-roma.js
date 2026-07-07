/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Roma Atelier — Background Engine  ·  js/boom-bg-roma.js
   Animated, generative, Rome-iconic backgrounds. Ultra-tech, perf-first,
   reading-safe. Drop-in: BoomBGRoma.mount({ mode, intensity }).

   Modes (each = iconic Roman geometry × modern motion):
     cosmati     — Cosmatesque mosaic (rosettes + tessere) + raking specular
     oculus      — Pantheon coffered dome + moving oculus sun-shaft
     sampietrini — fan-laid Roman setts catching gold ripples (wet stone)
     meandro     — infinite Greek-key lattice with a light pulse on the path
     aurum       — molten-gold curl-noise flow field (additive glow)

   Rules: DPR-capped, single rAF, pauses when tab hidden, honours
   prefers-reduced-motion (renders one static frame), never intercepts input.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.BoomBGRoma) return;

  var TAU = Math.PI * 2;
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── palette ────────────────────────────────────────────────────────────
  function gold(a) { return 'rgba(255,215,0,' + a + ')'; }
  function foil(a) { return 'rgba(231,190,72,' + a + ')'; }   // antique gold
  function warm(a) { return 'rgba(255,229,160,' + a + ')'; }  // highlight
  var INK = '#070708';

  // ── deterministic PRNG + cheap value noise ──────────────────────────────
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

  // ═══════════════════════ mode: COSMATI ══════════════════════════════════
  // Procedural Cosmatesque field — big guilloché rosettes on a lattice, bands
  // of small tessere between them, and a raking light that lifts whatever it
  // crosses (like sun grazing inlaid marble & gold).
  function Cosmati() {
    var W, H, cells;
    function build(w, h) {
      W = w; H = h; cells = [];
      var rnd = mulberry32(9161);
      var g = Math.max(150, Math.min(230, Math.hypot(w, h) * 0.13));  // rosette pitch
      for (var y = -g * 0.5; y < H + g; y += g) {
        for (var x = -g * 0.5; x < W + g; x += g) {
          cells.push({ x: x, y: y, r: g * (0.34 + rnd() * 0.05), rings: 3 + (rnd() * 2 | 0), spin: (rnd() - 0.5) * 0.06, phase: rnd() * TAU, teeth: 6 + 2 * (rnd() * 3 | 0) });
        }
      }
      // interstitial tessere (small squares on the diagonals between rosettes)
      cells.tess = [];
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        cells.tess.push({ x: c.x + g / 2, y: c.y, s: g * 0.05, rot: Math.PI / 4 });
        cells.tess.push({ x: c.x, y: c.y + g / 2, s: g * 0.05, rot: Math.PI / 4 });
      }
    }
    function draw(ctx, t, k) {
      // raking light line sweeps diagonally across the field
      var sweep = ((t * 0.045) % 1.6) - 0.3;           // -0.3 .. 1.3
      var sx = sweep * (W + H);                          // projected position on x+y axis
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var proj = (c.x + c.y);
        var d = Math.abs(proj - sx);
        var lit = Math.max(0, 1 - d / (W * 0.22));       // 0..1 brightness from sweep
        var base = 0.12 + 0.03 * Math.sin(t * 0.3 + c.phase);
        var op = (base + lit * 0.34) * k;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.spin * Math.sin(t * 0.12 + c.phase) + c.phase * 0.02);
        // concentric rings
        for (var r = 0; r < c.rings; r++) {
          var rr = c.r * (0.32 + 0.68 * r / c.rings);
          ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU);
          ctx.strokeStyle = (lit > 0.35 ? warm : foil)(Math.max(0, op - r * 0.01));
          ctx.lineWidth = 0.9; ctx.stroke();
        }
        // guilloché rosette (hypotrochoid-ish petals)
        ctx.beginPath();
        var N = 120, teeth = c.teeth, amp = 0.16;
        for (var n = 0; n <= N; n++) {
          var th = n / N * TAU, rad = c.r * (0.86) * (1 + amp * Math.cos(teeth * th));
          var px = rad * Math.cos(th), py = rad * Math.sin(th);
          n ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.strokeStyle = (lit > 0.4 ? warm : gold)(op); ctx.lineWidth = 0.85; ctx.stroke();
        // centre boss
        if (lit > 0.15) { ctx.beginPath(); ctx.arc(0, 0, c.r * 0.12, 0, TAU); ctx.fillStyle = warm(lit * 0.24 * k); ctx.fill(); }
        ctx.restore();
      }
      // tessere sparkle where the light is
      for (var j = 0; j < cells.tess.length; j++) {
        var s = cells.tess[j], dd = Math.abs((s.x + s.y) - sx), l2 = Math.max(0, 1 - dd / (W * 0.16));
        if (l2 <= 0.02) continue;
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
        ctx.fillStyle = warm(l2 * 0.65 * k); ctx.fillRect(-s.s, -s.s, s.s * 2, s.s * 2);
        ctx.restore();
      }
    }
    return { build: build, draw: draw };
  }

  // ═══════════════════════ mode: OCULUS ═══════════════════════════════════
  // Pantheon coffered dome in perspective + a soft oculus beam whose angle
  // moves like the sun through the day; each coffer catches the passing light.
  function Oculus() {
    var W, H, cx, cy, Rmax, rings = 7, sectors = 28, radAt, coffers;
    function build(w, h) {
      W = w; H = h; cx = w * 0.72; cy = h * 0.30; Rmax = Math.min(w, h) * 0.92;
      radAt = function (kk) { return Rmax * Math.pow(0.8, rings - kk); };
      coffers = [];
      for (var i = 0; i < sectors; i++) {
        var a0 = i / sectors * TAU, a1 = (i + 1) / sectors * TAU, am = (a0 + a1) / 2;
        for (var kk = 0; kk < rings; kk++) coffers.push({ a0: a0, a1: a1, am: am, r0: radAt(kk), r1: radAt(kk + 1) });
      }
    }
    function poly(ctx, a0, a1, r0, r1, pr, pa) {
      var A0 = a0 + pa, A1 = a1 - pa, R0 = r0 + pr, R1 = r1 - pr;
      ctx.beginPath();
      ctx.moveTo(cx + R0 * Math.cos(A0), cy + R0 * Math.sin(A0));
      ctx.lineTo(cx + R1 * Math.cos(A0), cy + R1 * Math.sin(A0));
      ctx.lineTo(cx + R1 * Math.cos(A1), cy + R1 * Math.sin(A1));
      ctx.lineTo(cx + R0 * Math.cos(A1), cy + R0 * Math.sin(A1));
      ctx.closePath();
    }
    function draw(ctx, t, k) {
      var sun = t * 0.10;                               // beam angle drifts
      var beam = Math.sin(sun) * Math.PI;               // -PI..PI sweep
      // concentric ring guides
      for (var g = 0; g <= rings; g++) {
        ctx.beginPath(); ctx.arc(cx, cy, radAt(g), 0, TAU);
        ctx.strokeStyle = foil(0.07 * k); ctx.lineWidth = 0.6; ctx.stroke();
      }
      for (var i = 0; i < coffers.length; i++) {
        var c = coffers[i];
        var da = Math.atan2(Math.sin(c.am - beam), Math.cos(c.am - beam));
        var lit = Math.max(0, Math.cos(da));             // faces the beam?
        var depth = 0.06 + 0.13 * (c.r0 / Rmax);
        var pr = (c.r1 - c.r0) * 0.16, pa = (c.a1 - c.a0) * 0.30;
        poly(ctx, c.a0, c.a1, c.r0, c.r1, pr, pa);
        ctx.strokeStyle = foil((depth + lit * 0.22) * k); ctx.lineWidth = 0.75; ctx.stroke();
        if (lit > 0.55) { ctx.fillStyle = warm((lit - 0.5) * 0.10 * k); ctx.fill(); }
      }
      // the oculus + a soft volumetric shaft
      var beamX = cx + Math.cos(beam) * Rmax * 0.5, beamY = cy + Math.sin(beam) * Rmax * 0.5;
      var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radAt(1) * 1.4);
      grd.addColorStop(0, warm(0.22 * k)); grd.addColorStop(1, gold(0));
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, radAt(1) * 1.4, 0, TAU); ctx.fill();
      var lg = ctx.createLinearGradient(cx, cy, beamX, beamY);
      lg.addColorStop(0, warm(0.10 * k)); lg.addColorStop(1, gold(0));
      ctx.strokeStyle = lg; ctx.lineWidth = radAt(0) * 0.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(beamX, beamY); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    return { build: build, draw: draw };
  }

  // ═══════════════════════ mode: SAMPIETRINI ══════════════════════════════
  // Fan-laid Roman setts (archi contrastanti). Gold ripples spawn and expand;
  // setts within a ripple briefly light up — wet cobbles catching lamplight.
  function Sampietrini() {
    var W, H, setts, ripples, seed;
    function build(w, h) {
      W = w; H = h; setts = []; ripples = []; seed = mulberry32(4471);
      var pitch = Math.max(26, Math.min(40, Math.hypot(w, h) * 0.024));
      // fan rows: each row is an arc; stones step along the arc, alternating fan centres
      var row = 0;
      for (var y = -pitch; y < H + pitch; y += pitch * 0.92) {
        var dir = row % 2 ? 1 : -1;
        for (var x = -pitch; x < W + pitch; x += pitch) {
          var jx = (seed() - 0.5) * pitch * 0.28, jy = (seed() - 0.5) * pitch * 0.28;
          var rot = dir * 0.5 + (seed() - 0.5) * 0.5;
          setts.push({ x: x + jx, y: y + jy, s: pitch * (0.34 + seed() * 0.10), rot: rot, tone: 0.09 + seed() * 0.07 });
        }
        row++;
      }
    }
    function draw(ctx, t, k, dt) {
      // spawn ripples occasionally (deterministic-ish via noise)
      if (!REDUCE && ripples.length < 5 && Math.random() < 0.03) {
        ripples.push({ x: Math.random() * W, y: Math.random() * H, r: 0, life: 1 });
      }
      for (var i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i]; rp.r += (dt || 16) * 0.16; rp.life -= (dt || 16) * 0.0008;
        if (rp.life <= 0) ripples.splice(i, 1);
      }
      for (var s = 0; s < setts.length; s++) {
        var st = setts[s], lit = 0;
        for (var j = 0; j < ripples.length; j++) {
          var rp2 = ripples[j], d = Math.abs(Math.hypot(st.x - rp2.x, st.y - rp2.y) - rp2.r);
          if (d < 34) lit = Math.max(lit, (1 - d / 34) * rp2.life);
        }
        var op = (st.tone + lit * 0.7) * k;
        ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.rot);
        // stone = rounded gold-ink quad, brighter when lit
        ctx.fillStyle = (lit > 0.25 ? warm : foil)(op);
        var s2 = st.s;
        ctx.beginPath();
        ctx.moveTo(-s2, -s2 * 0.86); ctx.lineTo(s2, -s2 * 0.7); ctx.lineTo(s2 * 0.9, s2 * 0.86); ctx.lineTo(-s2 * 0.9, s2 * 0.7); ctx.closePath();
        ctx.fill();
        if (lit > 0.5) { ctx.strokeStyle = warm(lit * 0.5 * k); ctx.lineWidth = 0.6; ctx.stroke(); }
        ctx.restore();
      }
    }
    return { build: build, draw: draw };
  }

  // ═══════════════════════ mode: MEANDRO ══════════════════════════════════
  // Infinite Greek-key (meander) lattice. Dim engraved lines; a bright pulse
  // runs along the polyline like current through a circuit. Two parallax layers.
  function Meandro() {
    var W, H, layers;
    function keyRow(y, unit, offset) {
      // build a meander polyline across the width at height y
      var pts = [], x = -unit * 4 + offset;
      while (x < W + unit * 4) {
        // one meander cell (square spiral) as 8 segments
        pts.push([x, y]); pts.push([x, y - unit]); pts.push([x + unit * 2, y - unit]);
        pts.push([x + unit * 2, y + unit]); pts.push([x + unit, y + unit]); pts.push([x + unit, y]);
        pts.push([x + unit * 3, y]);
        x += unit * 3;
      }
      return pts;
    }
    function build(w, h) {
      W = w; H = h; layers = [];
      var unit1 = Math.max(20, Math.min(34, h * 0.03));
      var rows1 = [];
      for (var y = unit1 * 2; y < H; y += unit1 * 4) rows1.push(keyRow(y, unit1, (y * 7) % (unit1 * 3)));
      layers.push({ rows: rows1, op: 0.10, speed: 0.00016, w: 0.8 });
      var unit2 = unit1 * 1.7, rows2 = [];
      for (var y2 = unit2 * 1.5; y2 < H; y2 += unit2 * 4.2) rows2.push(keyRow(y2, unit2, (y2 * 13) % (unit2 * 4)));
      layers.push({ rows: rows2, op: 0.06, speed: 0.00009, w: 1.1 });
    }
    function pathLen(pts) { var L = 0; for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
    function draw(ctx, t, k) {
      for (var li = 0; li < layers.length; li++) {
        var lay = layers[li];
        for (var r = 0; r < lay.rows.length; r++) {
          var pts = lay.rows[r];
          // base engraved line
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.strokeStyle = foil(lay.op * k); ctx.lineWidth = lay.w; ctx.stroke();
          // running pulse: pick a moving position along the polyline, draw bright segment
          if (REDUCE) continue;
          var L = pathLen(pts), head = ((t * 1000 * lay.speed + r * 0.13) % 1) * L, tail = head - L * 0.10;
          var acc = 0;
          ctx.lineWidth = lay.w + 1.2; ctx.lineCap = 'round';
          for (var s = 1; s < pts.length; s++) {
            var seg = Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1]);
            var a = acc, b = acc + seg;
            if (b > tail && a < head) {
              var f0 = Math.max(0, (tail - a) / seg), f1 = Math.min(1, (head - a) / seg);
              var x0 = pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * f0, y0 = pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * f0;
              var x1 = pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * f1, y1 = pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * f1;
              ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = warm(0.5 * k); ctx.stroke();
            }
            acc = b;
          }
          ctx.lineCap = 'butt';
        }
      }
    }
    return { build: build, draw: draw };
  }

  // ═══════════════════════ mode: AURUM ════════════════════════════════════
  // Molten-gold curl-noise flow field with additive glow. The ultra-tech piece.
  function Aurum() {
    var W, H, parts, N;
    function build(w, h) {
      W = w; H = h; N = Math.max(180, Math.min(560, (w * h) / 5000 | 0)); parts = [];
      var rnd = mulberry32(2718);
      for (var i = 0; i < N; i++) parts.push({ x: rnd() * w, y: rnd() * h, px: 0, py: 0, life: rnd(), sp: 0.5 + rnd() });
    }
    function field(x, y, t) {
      var s = 0.0016;
      var a = vnoise(x * s + t * 0.05, y * s) * TAU * 2 + vnoise(x * s * 2.1, y * s * 2.1 - t * 0.04) * TAU;
      return a;
    }
    function draw(ctx, t, k, dt) {
      // gentle fade for trails (drawn by engine's translucent clear); here we add
      ctx.globalCompositeOperation = 'lighter';
      var step = REDUCE ? 0 : (dt || 16) * 0.06;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i]; p.px = p.x; p.py = p.y;
        if (!REDUCE) {
          var a = field(p.x, p.y, t);
          p.x += Math.cos(a) * p.sp * step; p.y += Math.sin(a) * p.sp * step;
          p.life -= 0.004;
          if (p.life <= 0 || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) {
            p.x = Math.random() * W; p.y = Math.random() * H; p.px = p.x; p.py = p.y; p.life = 1;
          }
          ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = (p.sp > 1.1 ? warm : gold)(0.22 * p.life * k); ctx.lineWidth = 1.3; ctx.stroke();
        } else {
          var a2 = field(p.x, p.y, 0);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a2) * 10, p.y + Math.sin(a2) * 10);
          ctx.strokeStyle = gold(0.22 * k); ctx.lineWidth = 1.3; ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    return { build: build, draw: draw, trails: true };
  }

  // ── registry ─────────────────────────────────────────────────────────────
  var FACTORY = { cosmati: Cosmati, oculus: Oculus, sampietrini: Sampietrini, meandro: Meandro, aurum: Aurum };
  var LABELS = { cosmati: 'Cosmati', oculus: 'Oculus', sampietrini: 'Sampietrini', meandro: 'Meandro', aurum: 'Aurum' };

  // ── engine / mount ─────────────────────────────────────────────────────
  function mount(opts) {
    opts = opts || {};
    var host = opts.target || document.body;
    var wrap = document.createElement('div');
    wrap.setAttribute('data-boom-bg-roma', '');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:' + (opts.z != null ? opts.z : -1) + ';pointer-events:none;background:' + INK + ';overflow:hidden';
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    var veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:' +
      'radial-gradient(120% 100% at 50% 42%, rgba(7,7,8,.86) 0%, rgba(7,7,8,.55) 42%, rgba(7,7,8,.18) 72%, rgba(7,7,8,0) 100%),' +
      'linear-gradient(180deg, rgba(7,7,8,.65) 0%, rgba(7,7,8,0) 22%, rgba(7,7,8,0) 78%, rgba(7,7,8,.7) 100%)';
    wrap.appendChild(canvas); wrap.appendChild(veil);
    host.appendChild(wrap);

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, mode = null, modeKey = '', intensity = opts.intensity != null ? opts.intensity : 1;
    var raf = 0, last = 0, t0 = 0, running = false;

    function resize() {
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mode) mode.build(W, H);
      if (!running) renderOnce();               // reflect resize even when paused
    }
    function clearFull() { ctx.clearRect(0, 0, W, H); }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!last) last = now; var dt = Math.min(48, now - last); last = now;
      var t = (now - t0) / 1000;
      if (mode && mode.trails) { ctx.fillStyle = 'rgba(7,7,8,0.08)'; ctx.fillRect(0, 0, W, H); }
      else clearFull();
      if (mode) mode.draw(ctx, t, intensity, dt);
    }
    function start() { if (running || REDUCE) return; running = true; last = 0; t0 = performance.now(); raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf), raf = 0; }
    function renderOnce() { clearFull(); if (mode) mode.draw(ctx, 0, intensity, 16); }

    function setMode(key) {
      if (!FACTORY[key]) { modeKey = 'none'; stop(); clearFull(); return; }
      stop(); modeKey = key; mode = FACTORY[key](); mode.build(W, H); clearFull();
      if (REDUCE) { renderOnce(); } else { start(); }
    }
    function setIntensity(v) { intensity = Math.max(0.3, Math.min(1.5, v)); if (!running) renderOnce(); }

    window.addEventListener('resize', debounce(resize, 180));
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : (modeKey && modeKey !== 'none' && start()); });

    resize();
    setMode(opts.mode || 'cosmati');

    return {
      setMode: setMode, setIntensity: setIntensity,
      modes: Object.keys(FACTORY), labels: LABELS,
      destroy: function () { stop(); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  }

  function debounce(fn, ms) { var id; return function () { clearTimeout(id); id = setTimeout(fn, ms); }; }

  window.BoomBGRoma = { mount: mount, modes: Object.keys(FACTORY), labels: LABELS, reduce: REDUCE };
})();
