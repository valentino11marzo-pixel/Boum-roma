/* BOOM · Lumen — interactive "turn on the lights" hero + x-ray reveal.
   The dark market (drifting scam fragments) is lit by a warm spotlight that
   follows the pointer and reveals the verified home + truth beneath.
   Vanilla canvas. Reduced-motion safe (renders a static lit frame). */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- x-ray module: reveal on scroll ---------- */
  document.querySelectorAll('.xray').forEach(function (x) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.4 });
    io.observe(x);
  });

  /* ---------- lumen hero ---------- */
  var hero = document.querySelector('.lumen');
  if (!hero) return;
  var canvas = hero.querySelector('.lumen-canvas');
  var ctx = canvas.getContext('2d');
  var lit = document.createElement('canvas');
  var lctx = lit.getContext('2d');
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  var img = new Image(); var imgReady = false;
  img.onload = function () { imgReady = true; };
  img.src = hero.getAttribute('data-img') || 'https://i.imgur.com/8LVxrhs.jpeg';

  var SCAMS = ['“Wire the deposit first”', 'No viewings', 'Owner is abroad', 'Pay cash only',
    '€500 to hold it', 'Send your ID', 'Western Union', 'Keys after payment', 'Can’t meet in person',
    'Too good to be true', 'Fake listing', 'No contract', 'Hidden agency fee', 'Pay before you see it'];
  var parts = [];
  function seed() {
    parts = []; var n = Math.max(16, Math.round(W / 58));
    for (var i = 0; i < n; i++) parts.push({
      x: Math.random() * W, y: Math.random() * H, t: SCAMS[i % SCAMS.length],
      vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .12,
      a: .05 + Math.random() * .10, s: 11 + Math.random() * 5
    });
  }

  var mx = null, my = null, tx, ty, has = false, R = 0, revealed = 0, litDone = false, t0 = performance.now();
  var goldCache;
  function gold() { if (!goldCache) { goldCache = (getComputedStyle(document.documentElement).getPropertyValue('--gold') || '#D4AF37').trim(); } return goldCache; }

  function resize() {
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    lit.width = canvas.width; lit.height = canvas.height;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    R = Math.max(150, Math.min(W, H) * 0.28);
    if (mx == null) { mx = tx = W * 0.5; my = ty = H * 0.6; }
    seed();
  }

  function target(x, y) { tx = x; ty = y; has = true; hero.classList.add('touched'); }
  hero.addEventListener('mousemove', function (e) { var r = canvas.getBoundingClientRect(); target(e.clientX - r.left, e.clientY - r.top); });
  hero.addEventListener('touchmove', function (e) { var r = canvas.getBoundingClientRect(), t = e.touches[0]; target(t.clientX - r.left, t.clientY - r.top); }, { passive: true });
  hero.addEventListener('touchstart', function (e) { var r = canvas.getBoundingClientRect(), t = e.touches[0]; target(t.clientX - r.left, t.clientY - r.top); mx = tx; my = ty; }, { passive: true });

  function drawDark() {
    ctx.fillStyle = '#050506'; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < -80) p.x = W + 40; if (p.x > W + 80) p.x = -40;
      if (p.y < -30) p.y = H + 30; if (p.y > H + 30) p.y = -30;
      var d = Math.hypot(p.x - mx, p.y - my);
      var dim = d < R ? Math.max(0, d / R) : 1;        // scams disperse in the light
      ctx.font = p.s + 'px Inter, sans-serif';
      ctx.fillStyle = 'rgba(150,170,190,' + (p.a * dim) + ')';
      ctx.fillText(p.t, p.x, p.y);
    }
  }

  function drawLit() {
    lctx.clearRect(0, 0, W, H);
    lctx.fillStyle = '#0c0a06'; lctx.fillRect(0, 0, W, H);
    if (imgReady) {
      var ir = img.width / img.height, cr = W / H, dw, dh, dx, dy;
      if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; } else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
      lctx.drawImage(img, dx, dy, dw, dh);
      lctx.fillStyle = 'rgba(8,6,2,.28)'; lctx.fillRect(0, 0, W, H);
      var wg = lctx.createRadialGradient(mx, my, 0, mx, my, R);
      wg.addColorStop(0, 'rgba(255,210,120,.22)'); wg.addColorStop(1, 'rgba(255,180,80,0)');
      lctx.fillStyle = wg; lctx.fillRect(0, 0, W, H);
      lctx.textAlign = 'center';
      lctx.fillStyle = 'rgba(255,255,255,.97)'; lctx.font = '600 ' + Math.round(R * 0.14) + 'px Inter, sans-serif';
      lctx.fillText('€1,850 / month', mx, my - 4);
      lctx.fillStyle = gold(); lctx.font = '700 ' + Math.round(R * 0.082) + 'px Inter, sans-serif';
      lctx.fillText('✓ VERIFIED · DEPOSIT PROTECTED', mx, my + Math.round(R * 0.12));
      lctx.fillStyle = 'rgba(255,255,255,.72)'; lctx.font = '400 ' + Math.round(R * 0.074) + 'px Inter, sans-serif';
      lctx.fillText('Trastevere · 2 bed · real 58 m²', mx, my + Math.round(R * 0.23));
      lctx.textAlign = 'start';
    }
    lctx.globalCompositeOperation = 'destination-in';
    var mg = lctx.createRadialGradient(mx, my, 0, mx, my, R);
    mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(.68, 'rgba(0,0,0,1)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = mg; lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lit, 0, 0, W, H);

    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var rg = ctx.createRadialGradient(mx, my, R * 0.66, mx, my, R * 1.06);
    rg.addColorStop(0, 'rgba(255,200,110,0)'); rg.addColorStop(.7, 'rgba(255,190,90,.10)'); rg.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(mx, my, R * 1.06, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,228,165,.9)'; ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, 7); ctx.fill();
    ctx.restore();
  }

  function swapHead() { var h = hero.querySelector('.lumen-h'); if (h && h.getAttribute('data-lit')) h.innerHTML = h.getAttribute('data-lit'); }

  var raf = null, running = false;
  function frame(now) {
    if (!running) return;
    if (!has) { var e = (now - t0) / 1000; tx = W * (0.5 + 0.26 * Math.cos(e * 0.55)); ty = H * (0.55 + 0.16 * Math.sin(e * 0.9)); }
    mx += (tx - mx) * 0.12; my += (ty - my) * 0.12;
    drawDark(); drawLit();
    if (!litDone && has && ++revealed > 36) { litDone = true; hero.classList.add('lit'); swapHead(); }
    raf = requestAnimationFrame(frame);
  }
  function renderStatic() { mx = W * 0.62; my = H * 0.5; has = true; drawDark(); drawLit(); hero.classList.add('lit'); swapHead(); }
  function start() { if (running) return; running = true; if (reduce) { renderStatic(); return; } raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

  window.addEventListener('resize', function () { resize(); if (reduce) renderStatic(); }, { passive: true });
  resize();
  var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { e.isIntersecting ? start() : stop(); }); }, { threshold: 0.05 });
  io2.observe(hero);
})();
