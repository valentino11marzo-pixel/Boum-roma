/* ════════════════════════════════════════════════════════════════════════
   BOOM RadarScape — the home background as the instrument itself.

   One canvas replaces the old orbs + grid + mouse-glow + hero-ambient
   stack: a precision radar centered behind the hero, scanning Rome.
   Concentric rings with chronograph ticks, engraved coordinates, a slow
   rotating sweep, and real Rome zones that ping with their name when the
   beam passes them. The central pulse of the old radar survives as the
   heart of the scene.

   Progressive enhancement only:
   - mounts on #radarScape and adds body.radar-live on success — the old
     CSS radar (.radar-container) stays as fallback when JS/canvas fails;
   - prefers-reduced-motion → a single static composed frame, no loop;
   - pauses on tab hide, fades + parallaxes away on scroll.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var GOLD = '255,215,0';
  var GOLD_HI = '255,233,150';
  var AMBER = '255,176,60';

  /* Rome, plotted. Angles are compass degrees from the centro storico
     (north-up), radii are fractions of the outer ring. Placement is
     geographically honest but tuned so labels clear the hero copy. */
  var ZONES = [
    { name: 'PARIOLI',      a:  15, r: 0.68 },
    { name: 'FLAMINIO',     a: 345, r: 0.70 },
    { name: 'PRATI',        a: 330, r: 0.62 },
    { name: 'NOMENTANO',    a:  50, r: 0.72 },
    { name: 'SAN LORENZO',  a: 100, r: 0.85 },
    { name: 'MONTI',        a:  80, r: 0.50 },
    { name: 'SAN GIOVANNI', a: 135, r: 0.75 },
    { name: 'GARBATELLA',   a: 168, r: 0.72 },
    { name: 'TESTACCIO',    a: 195, r: 0.68 },
    { name: 'AVENTINO',     a: 175, r: 0.42 },
    { name: 'TRASTEVERE',   a: 220, r: 0.60 },
    { name: 'EUR',          a: 200, r: 0.74 }
  ];

  var SWEEP_PERIOD = 11;      /* seconds per rotation */
  var TRAIL = 110 * Math.PI / 180;
  var PULSE_PERIOD = 3.2;     /* the central pulse — il pulso */

  function mount(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

    var W = 0, H = 0, DPR = 1, OUTER = 0, cx = 0, cy = 0;
    var mobile = false, showLabels = true;
    var staticLayer = null;
    var blips = [];
    var dust = [];
    var avoid = [];               /* hero copy rects (document coords) */
    var raf = null;
    var lastNow = 0;
    var sweepPrev = 0;
    var sweepCount = 0;
    var lockIndex = 2;
    var scrollFade = 1;
    var mx = 0, my = 0, mxT = 0, myT = 0;   /* parallax, lerped */

    function rgba(c, a) { return 'rgba(' + c + ',' + a + ')'; }
    function dir(deg) { var r = deg * Math.PI / 180; return { x: Math.sin(r), y: -Math.cos(r) }; }

    /* ── layout ─────────────────────────────────────────────────────── */
    function layout() {
      W = window.innerWidth;
      H = window.innerHeight;
      mobile = W < 760;
      showLabels = !mobile;
      DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      /* Composition: with a left-aligned hero (the real home) the
         instrument takes the free right side; with centered or unknown
         layouts it stays centered behind the copy. */
      cx = W / 2;
      cy = H * 0.5;
      var sy0 = window.scrollY || 0;
      var titleEl = document.querySelector('.hero-title');
      if (!mobile && titleEl) {
        var tr = titleEl.getBoundingClientRect();
        var trCx = tr.left + tr.width / 2 + 0;
        if (trCx < W * 0.46 && tr.right < W * 0.78) {
          cx = Math.min((tr.right + W) / 2 + 20, W * 0.72);
          cy = H * 0.47;
        }
      }
      OUTER = mobile ? Math.min(W * 0.62, H * 0.4) : Math.min(W * 0.44, H * 0.66);

      /* Measure the hero copy so zone labels never sit on top of it */
      avoid = [];
      var sel = ['.hero-eyebrow', '.hero-title', '.hero-subtitle', '.hero-actions', '.hero-stats'];
      for (var s = 0; s < sel.length; s++) {
        var el = document.querySelector(sel[s]);
        if (!el) continue;
        var r = el.getBoundingClientRect();
        if (r.width && r.height) {
          avoid.push({ left: r.left, right: r.right, top: r.top + sy0, bottom: r.bottom + sy0 });
        }
      }

      blips = ZONES.map(function (z) {
        var d = dir(z.a);
        return {
          name: z.name,
          aRad: z.a * Math.PI / 180,
          x: d.x * z.r * OUTER,
          y: d.y * z.r * OUTER,
          ux: d.x, uy: d.y,
          ping: -99, lock: false
        };
      });

      dust = [];
      var n = mobile ? 40 : 90;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * OUTER;
        dust.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, s: Math.random() });
      }

      buildStatic();
    }

    /* ── static layer: rings, ticks, crosshair, inscriptions, dust ──── */
    function buildStatic() {
      staticLayer = document.createElement('canvas');
      staticLayer.width = canvas.width;
      staticLayer.height = canvas.height;
      var s = staticLayer.getContext('2d');
      s.setTransform(DPR, 0, 0, DPR, 0, 0);
      s.translate(cx, cy);

      var i, a;

      /* micro-dust inside the field */
      for (i = 0; i < dust.length; i++) {
        s.fillStyle = rgba(GOLD, 0.03 + dust[i].s * 0.05);
        s.fillRect(dust[i].x, dust[i].y, 1, 1);
      }

      /* concentric rings */
      for (i = 1; i <= 5; i++) {
        s.beginPath();
        s.arc(0, 0, OUTER * i / 5, 0, TAU);
        s.strokeStyle = rgba(GOLD, i === 3 ? 0.085 : 0.045);
        s.lineWidth = 1;
        s.stroke();
      }

      /* chronograph ticks on the index ring (every 5°, majors every 30°) */
      var R3 = OUTER * 3 / 5;
      for (i = 0; i < 72; i++) {
        a = i * 5 * Math.PI / 180;
        var major = i % 6 === 0;
        var cardinal = i % 18 === 0;
        var len = cardinal ? 11 : major ? 7 : 3.5;
        var alpha = cardinal ? 0.22 : major ? 0.13 : 0.07;
        s.beginPath();
        s.moveTo(Math.sin(a) * R3, -Math.cos(a) * R3);
        s.lineTo(Math.sin(a) * (R3 + len), -Math.cos(a) * (R3 + len));
        s.strokeStyle = rgba(GOLD, alpha);
        s.lineWidth = cardinal ? 1.2 : 1;
        s.stroke();
      }

      /* dashed outer boundary */
      s.beginPath();
      s.setLineDash([2, 7]);
      s.arc(0, 0, OUTER, 0, TAU);
      s.strokeStyle = rgba(GOLD, 0.07);
      s.lineWidth = 1;
      s.stroke();
      s.setLineDash([]);

      /* hairline crosshair with a breathing gap at center */
      s.strokeStyle = rgba(GOLD, 0.035);
      s.lineWidth = 1;
      s.beginPath();
      s.moveTo(-OUTER, 0); s.lineTo(-18, 0);
      s.moveTo(18, 0); s.lineTo(OUTER, 0);
      s.moveTo(0, -OUTER); s.lineTo(0, -18);
      s.moveTo(0, 18); s.lineTo(0, OUTER);
      s.stroke();

      /* engraved coordinates — the "studiato" detail */
      var fs = mobile ? 8 : 9;
      s.font = '500 ' + fs + 'px "Helvetica Neue", Inter, Arial, sans-serif';
      try { s.letterSpacing = '2.5px'; } catch (e) { /* older engines */ }
      arcText(s, 'ROMA · 41°54′ N — 12°29′ E', R3 + (mobile ? 18 : 24), -Math.PI / 2, 0.30, false);
      arcText(s, 'BOOM · LIVE SCAN', R3 + (mobile ? 18 : 24), Math.PI / 2, 0.20, true);
    }

    /* Text set along a circular arc, char by char.
       centerAngle uses canvas convention (-π/2 = top, π/2 = bottom).
       invert=true flips glyphs so the bottom arc reads left-to-right. */
    function arcText(c, text, radius, centerAngle, alpha, invert) {
      var widths = [], total = 0, i;
      for (i = 0; i < text.length; i++) {
        widths[i] = c.measureText(text[i]).width + 2.5;
        total += widths[i];
      }
      var m = c.measureText('M');
      var ascent = (m.actualBoundingBoxAscent || 7);
      var stepDir = invert ? -1 : 1;
      /* work in a rotate(θ) frame where θ=0 is the top of the circle */
      var theta = (centerAngle + Math.PI / 2) - stepDir * (total / 2) / radius;
      c.fillStyle = rgba(GOLD, alpha);
      c.textAlign = 'center';
      for (i = 0; i < text.length; i++) {
        var half = stepDir * (widths[i] / 2) / radius;
        theta += half;
        c.save();
        c.rotate(theta);
        c.translate(0, -radius);
        if (invert) {
          c.rotate(Math.PI);
          c.fillText(text[i], 0, ascent + 2);
        } else {
          c.fillText(text[i], 0, -2);
        }
        c.restore();
        theta += half;
      }
      c.textAlign = 'left';
    }

    /* ── per-frame drawing ──────────────────────────────────────────── */
    function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);

      /* scroll recession: the instrument slides up slower than the page */
      var sy = window.scrollY || 0;
      var cyd = cy - sy * 0.25;

      /* parallax (fine pointers only) */
      mx += (mxT - mx) * 0.045;
      my += (myT - my) * 0.045;
      var ox = cx + mx * 14;
      var oy = cyd + my * 9;

      /* breathing gold fog — the appagante layer */
      var breath = 0.5 + 0.5 * Math.sin(t / 9 * TAU);
      var fog = ctx.createRadialGradient(ox + mx * 10, oy + OUTER * 0.12, 0, ox + mx * 10, oy + OUTER * 0.12, OUTER * 1.45);
      fog.addColorStop(0, rgba(GOLD, 0.042 + 0.012 * breath));
      fog.addColorStop(0.55, rgba(GOLD, 0.014));
      fog.addColorStop(1, rgba(GOLD, 0));
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, W, H);

      var fog2 = ctx.createRadialGradient(ox + OUTER * 0.95, oy - OUTER * 0.75, 0, ox + OUTER * 0.95, oy - OUTER * 0.75, OUTER * 0.9);
      fog2.addColorStop(0, rgba(AMBER, 0.018));
      fog2.addColorStop(1, rgba(AMBER, 0));
      ctx.fillStyle = fog2;
      ctx.fillRect(0, 0, W, H);

      /* static engraving */
      ctx.drawImage(staticLayer, ox - cx, oy - cy, W, H);

      /* sweep */
      var sweep = (t % SWEEP_PERIOD) / SWEEP_PERIOD * TAU;
      drawSweep(ox, oy, sweep);

      /* blip crossing detection (cyclic) */
      if (!reduced) {
        for (var i = 0; i < blips.length; i++) {
          var b = blips[i];
          if (crossed(sweepPrev, sweep, b.aRad)) {
            b.ping = t;
            b.lock = (i === lockIndex);
          }
        }
        if (sweep < sweepPrev) {   /* wrapped → new rotation */
          sweepCount++;
          lockIndex = (lockIndex + 5) % blips.length;
        }
        sweepPrev = sweep;
      }

      drawBlips(ox, oy, t);
      drawCenter(ox, oy, t);
    }

    function crossed(a0, a1, target) {
      if (a0 <= a1) return target > a0 && target <= a1;
      return target > a0 || target <= a1;   /* wrap */
    }

    function drawSweep(ox, oy, sweep) {
      var canvasAngle = sweep - Math.PI / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ox, oy, OUTER, 0, TAU);
      ctx.clip();

      if (ctx.createConicGradient) {
        var trailFrac = TRAIL / TAU;
        var g = ctx.createConicGradient(canvasAngle - TRAIL, ox, oy);
        g.addColorStop(0, rgba(GOLD, 0));
        g.addColorStop(trailFrac * 0.6, rgba(GOLD, 0.035));
        g.addColorStop(trailFrac * 0.97, rgba(GOLD, 0.085));
        g.addColorStop(trailFrac, rgba(GOLD, 0.11));
        g.addColorStop(Math.min(1, trailFrac + 0.003), rgba(GOLD, 0));
        g.addColorStop(1, rgba(GOLD, 0));
        ctx.fillStyle = g;
        ctx.fillRect(ox - OUTER, oy - OUTER, OUTER * 2, OUTER * 2);
      } else {
        /* fan-line fallback for engines without conic gradients */
        for (var k = 0; k < 24; k++) {
          var a = sweep - TRAIL * (k / 24);
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + Math.sin(a) * OUTER, oy - Math.cos(a) * OUTER);
          ctx.strokeStyle = rgba(GOLD, 0.06 * (1 - k / 24));
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      /* crisp leading edge */
      var tipX = ox + Math.sin(sweep) * OUTER;
      var tipY = oy - Math.cos(sweep) * OUTER;
      var lg = ctx.createLinearGradient(ox, oy, tipX, tipY);
      lg.addColorStop(0, rgba(GOLD_HI, 0));
      lg.addColorStop(0.18, rgba(GOLD_HI, 0.34));
      lg.addColorStop(1, rgba(GOLD_HI, 0.10));
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
    }

    function labelBlocked(x, y) {
      var sy = window.scrollY || 0;
      for (var i = 0; i < avoid.length; i++) {
        var r = avoid[i];
        if (x > r.left - 18 && x < r.right + 18 &&
            y > r.top - sy - 16 && y < r.bottom - sy + 16) return true;
      }
      return false;
    }

    function drawBlips(ox, oy, t) {
      var fs = mobile ? 8.5 : 10;
      ctx.font = '500 ' + fs + 'px "Helvetica Neue", Inter, Arial, sans-serif';
      try { ctx.letterSpacing = '2.2px'; } catch (e) { /* older engines */ }

      for (var i = 0; i < blips.length; i++) {
        var b = blips[i];
        var px = ox + b.x, py = oy + b.y;
        if (px < 14 || px > W - 14 || py < 14 || py > H - 14) continue;

        var age = t - b.ping;
        var flare = age < 3 ? Math.exp(-age * 1.6) : 0;

        /* base dot */
        ctx.beginPath();
        ctx.arc(px, py, 1.3 + flare * 1.2, 0, TAU);
        ctx.fillStyle = rgba(flare > 0.25 ? GOLD_HI : GOLD, 0.16 + flare * 0.74);
        ctx.fill();

        if (flare > 0.02) {
          /* glow */
          var gg = ctx.createRadialGradient(px, py, 0, px, py, 22);
          gg.addColorStop(0, rgba(GOLD_HI, 0.30 * flare));
          gg.addColorStop(1, rgba(GOLD_HI, 0));
          ctx.fillStyle = gg;
          ctx.fillRect(px - 22, py - 22, 44, 44);

          /* expanding ping ring */
          if (age < 1.5) {
            var pr = ease(age / 1.5) * 26;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, TAU);
            ctx.strokeStyle = rgba(GOLD, (1 - age / 1.5) * 0.35);
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          /* target lock brackets — one zone per rotation gets "found" */
          if (b.lock && age < 4) {
            var la = Math.min(1, age / 0.3) * (age > 3.2 ? (4 - age) / 0.8 : 1);
            var s = 8 + (1 - Math.min(1, age / 0.3)) * 6;
            ctx.strokeStyle = rgba(GOLD_HI, 0.55 * la);
            ctx.lineWidth = 1;
            corner(px - s, py - s, 4, 1, 1);
            corner(px + s, py - s, 4, -1, 1);
            corner(px - s, py + s, 4, 1, -1);
            corner(px + s, py + s, 4, -1, -1);
          }

          /* zone label, only where the hero copy isn't */
          if (showLabels && age < 3.4) {
            if (!labelBlocked(px, py)) {
              var lAlpha = Math.min(1, age / 0.15) * (age > 2.4 ? Math.max(0, (3.4 - age) / 1) : 1);
              var lx = px + b.ux * 16, ly = py + b.uy * 16;
              ctx.strokeStyle = rgba(GOLD, 0.28 * lAlpha);
              ctx.beginPath();
              ctx.moveTo(px + b.ux * 5, py + b.uy * 5);
              ctx.lineTo(px + b.ux * 12, py + b.uy * 12);
              ctx.stroke();
              ctx.fillStyle = rgba(GOLD, (b.lock ? 0.85 : 0.62) * lAlpha);
              ctx.textAlign = b.ux >= 0.3 ? 'left' : b.ux <= -0.3 ? 'right' : 'center';
              ctx.textBaseline = b.uy >= 0.3 ? 'top' : b.uy <= -0.3 ? 'bottom' : 'middle';
              if (b.uy >= 0.3 && ly > H - 24) {   /* keep labels off the bottom edge */
                ly = py - 14;
                ctx.textBaseline = 'bottom';
              }
              ctx.fillText(b.name, lx, ly);
            }
          }
        }
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    function corner(x, y, s, dx, dy) {
      ctx.beginPath();
      ctx.moveTo(x + dx * s, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * s);
      ctx.stroke();
    }

    /* the central pulse — kept from the original radar, now the heart */
    function drawCenter(ox, oy, t) {
      var breath = 0.5 + 0.5 * Math.sin(t / 3 * TAU);

      for (var k = 0; k < 2; k++) {
        var p = ((t / PULSE_PERIOD) + k * 0.5) % 1;
        var r = ease(p) * OUTER * 0.62;
        if (r < 6) continue;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, TAU);
        ctx.strokeStyle = rgba(GOLD, (1 - p) * 0.16);
        ctx.lineWidth = 1.5 - p;
        ctx.stroke();
      }

      var glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, 44);
      glow.addColorStop(0, rgba(GOLD, 0.24 + 0.16 * breath));
      glow.addColorStop(1, rgba(GOLD, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(ox - 44, oy - 44, 88, 88);

      ctx.beginPath();
      ctx.arc(ox, oy, 3.4 + 0.8 * breath, 0, TAU);
      ctx.fillStyle = rgba(GOLD_HI, 0.95);
      ctx.fill();
    }

    function ease(p) { return 1 - Math.pow(1 - p, 3); }

    /* ── loop / lifecycle ───────────────────────────────────────────── */
    function loop(now) {
      var dt = Math.min(0.05, (now - lastNow) / 1000) || 0.016;
      lastNow = now;

      var sy = window.scrollY || 0;
      scrollFade = Math.max(0, 1 - sy / (H * 1.05));
      canvas.style.opacity = scrollFade.toFixed(3);

      if (scrollFade > 0.02) frame(now / 1000, dt);
      raf = requestAnimationFrame(loop);
    }

    function staticFrame() {
      /* reduced motion: one considered still — no sweep, a few zones lit */
      frame(SWEEP_PERIOD * 0.31, 0.016);
      var picks = mobile ? [] : [1, 6, 10];
      ctx.font = '500 9.5px "Helvetica Neue", Inter, Arial, sans-serif';
      try { ctx.letterSpacing = '2.2px'; } catch (e) { /* older engines */ }
      for (var i = 0; i < picks.length; i++) {
        var b = blips[picks[i]];
        var px = cx + b.x, py = cy + b.y;
        if (px < 14 || px > W - 14 || py < 14 || py > H - 14 || labelBlocked(px, py)) continue;
        ctx.fillStyle = rgba(GOLD, 0.4);
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, TAU); ctx.fill();
        ctx.textAlign = b.ux >= 0 ? 'left' : 'right';
        ctx.fillText(b.name, px + b.ux * 14, py + b.uy * 14);
      }
    }

    var resizeT = null, lastW = 0, lastH = 0;
    function onResize() {
      /* ignore mobile URL-bar jitters */
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 130) return;
      clearTimeout(resizeT);
      resizeT = setTimeout(function () {
        lastW = window.innerWidth; lastH = window.innerHeight;
        layout();
        if (reduced) staticFrame();
      }, 120);
    }

    layout();
    lastW = W; lastH = H;

    if (finePointer) {
      window.addEventListener('pointermove', function (e) {
        mxT = (e.clientX / W - 0.5) * 2;
        myT = (e.clientY / H - 0.5) * 2;
      }, { passive: true });
    }
    window.addEventListener('resize', onResize);

    if (reduced) {
      staticFrame();
    } else {
      raf = requestAnimationFrame(loop);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (raf) { cancelAnimationFrame(raf); raf = null; }
        } else if (!raf) {
          lastNow = performance.now();
          raf = requestAnimationFrame(loop);
        }
      });
    }

    return {
      destroy: function () {
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
      }
    };
  }

  /* self-mount */
  function boot() {
    var el = document.getElementById('radarScape');
    if (!el) return;
    try {
      if (mount(el)) document.body.classList.add('radar-live');
      else el.parentNode && el.parentNode.removeChild(el);
    } catch (e) {
      /* any failure → the CSS radar fallback stays visible */
      el.parentNode && el.parentNode.removeChild(el);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.BoomRadarScape = { mount: mount };
})();
