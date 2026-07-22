/* ════════════════════════════════════════════════════════════════════════
   BOOM Campo — the quiet light field of the home hero.

   The "campo" layer of the Atelier system: never the voice, always the
   atmosphere (the voice on the home is the Solari typography —
   js/boom-solari.js). Alpha budget ≤ 0.05: the field must stay just
   under conscious attention.

   Scene: "corte" — sunlight through an off-stage colonnade. Four broad
   oblique blades of gold migrate across the page over ~a minute, a warm
   pool where each touches the floor, a handful of dust motes that only
   exist inside the light.

   Not to be confused with js/boom-ambient.js (the sectional MATERIA
   engine used by the Services pages) — this is a single fixed scene,
   deliberately minimal, for the home only.

   Progressive enhancement, same contract as the other BOOM engines:
   - mounts on #boomCampo, adds body.radar-live on success (which also
     rests the CSS radar fallback in the hero);
   - prefers-reduced-motion → one static composed frame, no loop;
   - pauses on hidden tab, fades out on scroll, DPR-capped.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var GOLD = '255,215,0';
  var GOLD_HI = '255,233,150';
  var WARM = '255,205,120';

  function rgba(c, a) { return 'rgba(' + c + ',' + a + ')'; }

  function mount(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 0, H = 0, DPR = 1, mobile = false;
    var motes = [];
    var raf = null, lastNow = 0;
    var ANG = -0.28;               /* ~16° — the sun never comes in straight */
    var SPEED = 3;                 /* px/s — a full crossing takes about a minute */

    function layout() {
      W = window.innerWidth;
      H = window.innerHeight;
      mobile = W < 760;
      DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      motes = [];
      var n = mobile ? 8 : 14;
      for (var i = 0; i < n; i++) {
        motes.push({
          x: Math.random() * W * 1.2, y: Math.random() * H,
          v: 1.5 + Math.random() * 3, ph: Math.random() * TAU,
          sz: 0.6 + Math.random() * 1.2
        });
      }
    }

    function bandX(i, t) {
      var span = W * 1.5;
      return ((t * SPEED + i * span / 4) % span) - W * 0.25;
    }
    function bandW(i) { return W * (0.11 + i * 0.022); }

    function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      var breath = 0.85 + 0.15 * Math.sin(t / 19 * TAU);

      for (var i = 0; i < 4; i++) {
        var bx = bandX(i, t);
        var bw = bandW(i);
        ctx.save();
        ctx.translate(bx, H * 0.5);
        ctx.rotate(ANG);
        var g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
        g.addColorStop(0, rgba(GOLD, 0));
        g.addColorStop(0.5, rgba(GOLD, 0.034 * breath));
        g.addColorStop(1, rgba(GOLD, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-bw / 2, -H, bw, H * 2);
        ctx.restore();

        /* where the blade meets the floor, the stone warms up */
        ctx.save();
        ctx.translate(bx - Math.tan(ANG) * H * 0.5, H * 0.99);
        ctx.scale(1, 0.16);
        var p = ctx.createRadialGradient(0, 0, 0, 0, 0, bw * 1.1);
        p.addColorStop(0, rgba(WARM, 0.045 * breath));
        p.addColorStop(1, rgba(WARM, 0));
        ctx.fillStyle = p;
        ctx.fillRect(-bw * 1.2, -bw * 1.2, bw * 2.4, bw * 2.4);
        ctx.restore();
      }

      /* dust — it only exists inside the light */
      for (var k = 0; k < motes.length; k++) {
        var m = motes[k];
        m.y += m.v * dt * 4;
        m.x -= m.v * dt * 1.2;
        if (m.y > H + 10) { m.y = -10; m.x = Math.random() * W * 1.2; }
        var inLight = 0;
        for (i = 0; i < 4; i++) {
          var lx = bandX(i, t) + (H * 0.5 - m.y) * Math.tan(-ANG);
          var d = Math.abs(m.x - lx) / (bandW(i) / 2);
          if (d < 1) inLight = Math.max(inLight, 1 - d);
        }
        if (inLight <= 0.05) continue;
        var a = 0.14 * inLight * (0.5 + 0.5 * Math.sin(t * 1.6 + m.ph));
        ctx.fillStyle = rgba(GOLD_HI, a);
        ctx.fillRect(m.x, m.y, m.sz, m.sz);
      }
    }

    function loop(now) {
      var dt = Math.min(0.05, (now - lastNow) / 1000) || 0.016;
      lastNow = now;
      var sy = window.scrollY || 0;
      var fade = Math.max(0, 1 - sy / (H * 1.05));
      canvas.style.opacity = fade.toFixed(3);
      if (fade > 0.02) frame(now / 1000, dt);
      raf = requestAnimationFrame(loop);
    }

    var resizeT = null, lastW = 0, lastH = 0;
    function onResize() {
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 130) return;
      clearTimeout(resizeT);
      resizeT = setTimeout(function () {
        lastW = window.innerWidth; lastH = window.innerHeight;
        layout();
        if (reduced) frame(24, 0.016);
      }, 120);
    }

    layout();
    lastW = W; lastH = H;
    window.addEventListener('resize', onResize);

    if (reduced) {
      frame(24, 0.016);
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

  function boot() {
    var el = document.getElementById('boomCampo');
    if (!el) return;
    try {
      if (mount(el)) document.body.classList.add('radar-live');   /* rests the CSS radar fallback */
      else el.parentNode && el.parentNode.removeChild(el);
    } catch (e) {
      el.parentNode && el.parentNode.removeChild(el);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.BoomCampo = { mount: mount };
})();
