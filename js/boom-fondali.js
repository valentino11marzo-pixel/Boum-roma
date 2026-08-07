/* ═══ BOOM FONDALI LAB — four candidate backgrounds, each engineered around a
   different "addictive to the eye" mechanism, all on the BoomAmbient engine
   (DPR cap, visibility pause, reduced-motion static frame, mood easing).

   seta-doro  · liquid-gold silk — endless smooth flow, never repeats
   polvere    · dust in a turning light shaft — depth + stochastic twinkle
   tevere     · water-light net — organic compression shimmer (caustics)
   venedoro   · kintsugi veins — growth, permanence, slow renewal

   Perf budget per frame (1080p): seta ~360 line segs · polvere ~240 arcs ·
   tevere ~1.4k hairline segs at 30fps effective · venedoro 9 walkers + 1 blit. ═══ */
(function () {
  if (!window.BoomAmbient || !BoomAmbient.register) return;

  /* ── SETA D'ORO — ribbons of liquid gold, three depths, additive glow ── */
  BoomAmbient.register('seta-doro', function (H) {
    var gold = H.gold, warm = H.warm, TAU = H.TAU, rnd = H.mulberry32(715);
    var W, Hh, layers;
    return {
      build: function (w, h) {
        W = w; Hh = h; layers = [];
        var depths = [
          { n: 5, alpha: 0.05, amp: h * 0.10, lw: 26, speed: 0.55 },  // far: wide, dim
          { n: 4, alpha: 0.09, amp: h * 0.13, lw: 14, speed: 0.8 },
          { n: 3, alpha: 0.16, amp: h * 0.16, lw: 7,  speed: 1.15 }   // near: thin, bright
        ];
        for (var d = 0; d < depths.length; d++) {
          var L = depths[d], ribbons = [];
          for (var i = 0; i < L.n; i++) {
            ribbons.push({
              y0: h * (0.18 + 0.64 * ((i + 0.5) / L.n) + (rnd() - 0.5) * 0.08),
              a1: L.amp * (0.55 + rnd() * 0.45), k1: (0.7 + rnd() * 0.9) * TAU / w, w1: (0.05 + rnd() * 0.06) * L.speed, p1: rnd() * TAU,
              a2: L.amp * 0.35 * rnd(),          k2: (1.6 + rnd() * 1.6) * TAU / w, w2: (0.09 + rnd() * 0.08) * L.speed, p2: rnd() * TAU,
              breatheT: 14 + rnd() * 10, breatheP: rnd() * TAU
            });
          }
          layers.push({ cfg: L, ribbons: ribbons });
        }
      },
      draw: function (ctx, t, k) {
        ctx.globalCompositeOperation = 'lighter';
        var step = Math.max(12, W / 90);
        for (var d = 0; d < layers.length; d++) {
          var L = layers[d].cfg, rs = layers[d].ribbons;
          for (var i = 0; i < rs.length; i++) {
            var r = rs[i], br = 0.75 + 0.25 * Math.sin(t * TAU / r.breatheT + r.breatheP);
            ctx.beginPath();
            for (var x = -step; x <= W + step; x += step) {
              var y = r.y0 + br * (r.a1 * Math.sin(r.k1 * x + t * r.w1 * TAU + r.p1)
                                 + r.a2 * Math.sin(r.k2 * x - t * r.w2 * TAU + r.p2));
              x <= 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.strokeStyle = warm(L.alpha * 0.45 * k); ctx.lineWidth = L.lw; ctx.stroke();   // halo
            ctx.strokeStyle = gold(L.alpha * k); ctx.lineWidth = Math.max(1, L.lw * 0.22); ctx.stroke(); // core
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  });

  /* ── POLVERE — gold dust drifting through a slowly turning beam ── */
  BoomAmbient.register('polvere', function (H) {
    var gold = H.gold, warm = H.warm, TAU = H.TAU, rnd = H.mulberry32(1187);
    var W, Hh, motes, bx;
    return {
      build: function (w, h) {
        W = w; Hh = h; bx = w * 0.62; motes = [];
        var n = Math.min(320, Math.round(w * h / 5000));
        for (var i = 0; i < n; i++) {
          var d = rnd();                                    // depth 0 far → 1 near
          motes.push({ x: rnd() * w, y: rnd() * h, d: d, r: 0.5 + 1.9 * d,
                       vy: 0.006 + 0.02 * d, sway: 6 + 24 * d, sw: 0.15 + rnd() * 0.3,
                       tw: 1.5 + rnd() * 2.5, ph: rnd() * TAU });
        }
      },
      draw: function (ctx, t, k, dt) {
        var ang = Math.PI / 2 + Math.sin(t * 0.045) * 0.34;             // beam leans slowly
        var half = 0.16;                                                 // beam half-width (rad)
        // the shaft itself — a long soft wedge from above the canvas
        var ex = bx + Math.cos(ang) * Hh * 1.6, ey = -60 + Math.sin(ang) * Hh * 1.6;
        var g = ctx.createLinearGradient(bx, -60, ex, ey);
        g.addColorStop(0, warm(0.10 * k)); g.addColorStop(0.55, warm(0.035 * k)); g.addColorStop(1, warm(0));
        ctx.globalCompositeOperation = 'lighter';
        ctx.save(); ctx.translate(bx, -60); ctx.rotate(ang - Math.PI / 2);
        ctx.fillStyle = g; ctx.beginPath();
        ctx.moveTo(-14, 0); ctx.lineTo(14, 0);
        ctx.lineTo(Hh * 0.62, Hh * 1.7); ctx.lineTo(-Hh * 0.62, Hh * 1.7); ctx.closePath();
        // gradient is in canvas space; simpler: fill with translucent warm
        ctx.fillStyle = warm(0.055 * k); ctx.fill();
        ctx.restore();
        // motes
        for (var i = 0; i < motes.length; i++) {
          var m = motes[i];
          m.y -= m.vy * dt; if (m.y < -8) { m.y = Hh + 8; m.x = rnd() * W; }
          var x = m.x + Math.sin(t * m.sw + m.ph) * m.sway;
          // angular distance from beam axis (apex at bx,-60)
          var pa = Math.atan2(m.y + 60, x - bx), da = Math.abs(Math.atan2(Math.sin(pa - ang), Math.cos(pa - ang)));
          var inb = Math.max(0, 1 - da / half);
          var tw = 0.55 + 0.45 * Math.sin(t * m.tw + m.ph * 2);
          var a = (0.09 + 0.4 * m.d) * tw * (0.5 + 1.7 * inb) * k;
          if (a < 0.015) continue;
          ctx.beginPath(); ctx.arc(x, m.y, m.r * (1 + inb * 0.5), 0, TAU);
          ctx.fillStyle = (inb > 0.35 ? warm : gold)(a); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  });

  /* ── TEVERE — the light net water throws on stone, in bronze ── */
  BoomAmbient.register('tevere', function (H) {
    var gold = H.gold, warm = H.warm, TAU = H.TAU;
    var W, Hh, gx, gy, cell, px, py, fc = 0;
    return {
      build: function (w, h) {
        W = w; Hh = h;
        cell = Math.max(46, Math.min(64, Math.hypot(w, h) / 28));
        gx = Math.ceil(w / cell) + 3; gy = Math.ceil(h / cell) + 3;
        px = new Float32Array(gx * gy); py = new Float32Array(gx * gy);
      },
      draw: function (ctx, t, k) {
        if ((fc++ & 1) && fc > 2) { /* 30fps effective: redraw every 2nd frame */ }
        var A = cell * 0.17, q1 = TAU / (cell * 5.6), q2 = TAU / (cell * 3.6);
        var i, j, n;
        for (j = 0; j < gy; j++) for (i = 0; i < gx; i++) {
          n = j * gx + i;
          var x = (i - 1) * cell, y = (j - 1) * cell;
          px[n] = x + A * (Math.sin(q1 * y + t * 0.42) + 0.6 * Math.sin(q2 * (x + y) - t * 0.31));
          py[n] = y + A * (Math.sin(q1 * x - t * 0.36 + 1.7) + 0.6 * Math.sin(q2 * (x - y) + t * 0.27));
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.15; ctx.lineCap = 'round';
        var rest = cell, restD = cell * 1.4142;
        for (j = 0; j < gy - 1; j++) for (i = 0; i < gx - 1; i++) {
          n = j * gx + i;
          var x0 = px[n], y0 = py[n];
          seg(ctx, x0, y0, px[n + 1], py[n + 1], rest, k);
          seg(ctx, x0, y0, px[n + gx], py[n + gx], rest, k);
        }
        ctx.globalCompositeOperation = 'source-over';
        function seg(c, ax, ay, bx2, by2, r0, kk) {
          var d = Math.hypot(bx2 - ax, by2 - ay), comp = 1 - d / r0;  // >0 compressed = bright
          var a = 0.07 + Math.max(0, comp) * 1.05;
          if (a < 0.075) return;
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx2, by2);
          c.strokeStyle = (comp > 0.13 ? warm : gold)(Math.min(0.38, a) * kk);
          c.stroke();
        }
      }
    };
  });

  /* ── VENE D'ORO — kintsugi: veins that grow, settle, and slowly renew ── */
  BoomAmbient.register('venedoro', function (H) {
    var gold = H.gold, warm = H.warm, TAU = H.TAU, vn = H.vnoise, rnd = H.mulberry32(3391);
    var W, Hh, P, pc, walkers, fadeAcc = 0;
    function spawn(w, h) {
      return { x: rnd() * w, y: rnd() * h, dir: rnd() * TAU, age: 0, life: 900 + rnd() * 1400 };
    }
    return {
      build: function (w, h) {
        W = w; Hh = h;
        P = document.createElement('canvas'); P.width = Math.max(1, w); P.height = Math.max(1, h);
        pc = P.getContext('2d');
        walkers = []; for (var i = 0; i < 8; i++) walkers.push(spawn(w, h));
        // static-frame dignity: pre-grow so the first paint isn't empty
        for (var s = 0; s < (H.STATIC_ONLY ? 2600 : 700); s++) stepAll(16, 0.6, null);
      },
      draw: function (ctx, t, k, dt) {
        stepAll(dt, k, ctx);
        // the settled veins
        ctx.globalAlpha = Math.min(1, 0.85 * k);
        ctx.drawImage(P, 0, 0, W, Hh);
        ctx.globalAlpha = 1;
        // renewal: old veins retire imperceptibly
        fadeAcc += dt;
        if (fadeAcc > 1400) {
          fadeAcc = 0;
          pc.globalCompositeOperation = 'destination-out';
          pc.fillStyle = 'rgba(0,0,0,0.05)'; pc.fillRect(0, 0, W, Hh);
          pc.globalCompositeOperation = 'source-over';
        }
      }
    };
    function stepAll(dt, k, ctx) {
      var step = Math.min(2.2, dt * 0.055);
      for (var i = 0; i < walkers.length; i++) {
        var w = walkers[i], ox = w.x, oy = w.y;
        w.dir += (vn(w.x * 0.0042, w.y * 0.0042) - 0.5) * 1.15;
        w.x += Math.cos(w.dir) * step; w.y += Math.sin(w.dir) * step;
        w.age += dt;
        if (w.x < -20 || w.x > W + 20 || w.y < -20 || w.y > Hh + 20 || w.age > w.life) { walkers[i] = spawn(W, Hh); continue; }
        pc.beginPath(); pc.moveTo(ox, oy); pc.lineTo(w.x, w.y);
        pc.strokeStyle = gold(0.24); pc.lineWidth = 1.1; pc.stroke();
        if (ctx) {                                        // the living head, molten
          ctx.globalCompositeOperation = 'lighter';
          var g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, 10);
          g.addColorStop(0, warm(0.5 * k)); g.addColorStop(1, warm(0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w.x, w.y, 10, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        if (rnd() < 0.0016 && walkers.length < 10) walkers.push({ x: w.x, y: w.y, dir: w.dir + (rnd() < 0.5 ? 1 : -1) * 0.9, age: 0, life: 700 + rnd() * 900 });
      }
      if (walkers.length > 10) walkers.splice(0, walkers.length - 10);
    }
  });
})();
