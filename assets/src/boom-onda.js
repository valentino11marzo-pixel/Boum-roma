/* assets/boom-onda.js — the onda (v1.7): the home's flap field, gold only,
   behind a desk's pass (inside it on a phone, calm below opt.calm) and the
   /desks board. It beats while the desk is open; a fact pulses once from
   where it happens: pulse(node, 'l' file · 'p' paid · 's' fare).
   start(canvas, { origin: node | () => node, calm: node, hero: node, open })
   — origin: where the heartbeat rises; calm: the box the ambient stays
   above (full until 30px over it, gone 140px below); hero: inside a card,
   the ambient sleeps while this node (the board) is above the viewport,
   a fact still lights the card; open: the desk is open now.
   One requestAnimationFrame chain; IntersectionObserver sleep;
   visibilitychange; ResizeObserver on the canvas (a ticket opening grows
   the pass; crossing 940 moves the canvas — both re-measure). Reduced
   motion: one still frame, never a loop, never a pulse. 'boom:beat' is a
   payload-free Event on window at each heartbeat (PERIOD 8200 ms). */
(function () {
  'use strict';
  var Q = 16, PERIOD = 8200, FS = [];
  for (var q = 0; q < Q; q++) {
    FS[q] = 'rgba(250,248,240,' + ((q + .5) / Q * .15).toFixed(3) + ')';
    FS[q + Q] = 'rgba(255,215,0,' + ((q + .5) / Q * .5).toFixed(3) + ')';
  }
  var O = window.BOOM_ONDA = { running: false, PERIOD: PERIOD, start: start, setOpen: setOpen, pulse: pulse };
  var tela, ctx, opt, card, still = false, open = false, seen = true, hero = true, on = false;
  var W = 0, H = 0, D = 1, U = 1, Z = 0, cw, ch, px, py, cols, rows, N, E, AU, K, VY, lo = 0, hi = 0;
  var mx = -1e4, my = -1e4, rush = -1e4, last = 0, prev = 0, beat = 700, flip = 2200, hot = 0, lit = 0, waves = [], cas = [], wait, tw, raf = 0;

  /* a node's centre, in canvas px */
  function at(n) {
    var r = tela.getBoundingClientRect(), o = n && n.getBoundingClientRect && n.getBoundingClientRect();
    return o && o.width ? [(o.left + o.width / 2 - r.left) * D, (o.top + o.height / 2 - r.top) * D] : [W * .56, H * .42];
  }
  function origin() { var o = opt.origin; return at(typeof o === 'function' ? o() : o); }
  /* the ambient: the desk open and, inside a card, the board (hero) not scrolled above the viewport */
  function amb() { return open && (!card || hero); }
  function measure() {
    var r = tela.getBoundingClientRect(), b = document.createElement('canvas'), g, y, v, sm, c = (card = tela.parentNode !== document.body) && opt.calm, sm = r.width < 600;
    D = Math.min(window.devicePixelRatio || 1, sm ? 1.5 : 2, Math.max(1, Math.sqrt(2.3e6 / Math.max(1, r.width * r.height))));
    W = tela.width = Math.round(r.width * D); H = tela.height = Math.round(r.height * D);
    cw = Math.round((sm ? 30 : 40) * D); ch = Math.round(cw * .68);
    px = cw + Math.round(7 * D); py = ch + px - cw; U = (sm ? 12 : 20) * px;
    cols = Math.ceil(W / px) + 1; rows = Math.ceil(H / py) + 1; N = cols * rows; lo = 0; hi = rows;
    E = new Float32Array(N); AU = new Float32Array(N); K = new Int8Array(N); VY = new Float32Array(rows);
    var a = c ? (c.getBoundingClientRect().top - r.top - 30) * D : (Math.min(innerHeight, 1000) - r.top - scrollY) * D * .55;
    var z = c ? a + 140 * D : a / .55 * .98;
    for (y = 0; y < rows; y++) { v = y * py + ch / 2; VY[y] = v < a ? 1 : Math.max(0, (z - v) / (z - a)); }
    Z = Math.min(H, z);
    /* the quiet layer: the canvas's background */
    b.width = px; b.height = py; g = b.getContext('2d');
    g.fillStyle = 'rgba(250,248,240,.031)'; cell(g, 0, 0);
    tela.style.background = 'url(' + b.toDataURL() + ') 0 0/' + px / D + 'px ' + py / D + 'px';
    dim();
  }
  function cell(g, x, y) { if (g.roundRect) g.roundRect(x, y, cw, ch, 3 * D); else g.rect(x, y, cw, ch); }
  /* ms, reach, gain, band: beat 'b' + echo 'e' (< 'f': veiled), fact 'l', opening 'o', fare 's' */
  var KIND = { b: [3000, 1.05, 1, .12], e: [3000, 1.05, .45, .12], l: [2400, 1.05, 1.3, .12], o: [4200, 1.3, 1, .12], s: [900, .5, .8, .09] };
  function wave(x, y, t, s) {
    var k = KIND[s], b = s < 'f' ? Z : H, d = Math.max(Math.hypot(x, y - b), Math.hypot(W - x, y - b), Math.hypot(x, y), Math.hypot(W - x, y));
    waves.push({ x: x, y: y, via: t, s: s, dur: k[0], reach: U * k[1], g: k[2], w: U * k[3], life: Math.min(1.4, (d + U * k[3]) / (U * k[1])) });
    if (waves.length > 6) waves.shift();
  }
  function set(i, f) { if (f * .85 > AU[i]) AU[i] = f * .85; if (f > E[i]) E[i] = f; }
  function frame(t, live) {
    var i, r, c, w, x, y, a, s, f, ii, tide = live && amb();
    ctx.clearRect(0, lo * py, W, (hi - lo + 1) * py);
    if (tide && t > beat) {
      var o = origin();
      wave(o[0], o[1], t, 'b'); wave(o[0], o[1], t + 300, 'e');
      beat = t + PERIOD;
      dispatchEvent(new Event('boom:beat'));
    }
    if (tide && t > flip) { cas.push({ c: Math.floor(Math.random() * cols), via: t }); flip = t + 4600 + Math.random() * 3800; }
    if (cas.length > 4) cas.shift();
    hot = 0;
    for (i = 0; i < cas.length; i++) {
      var ca = cas[i], head = (t - ca.via) / (ca.r != null ? 38 : 46);
      if (head < 0 || head > (ca.r != null ? cols : Z / py) + 3) continue;
      hot++;
      for (s = Math.max(0, Math.floor(head) - 2); s <= Math.floor(head); s++) {
        f = 1 - (head - s) / 3;
        if (f <= 0) continue;
        /* a fact's row: the board writes the line */
        if (ca.r != null) { ii = ca.r * cols; if (ca.c + s < cols) set(ii + ca.c + s, f); if (ca.c - s >= 0) set(ii + ca.c - s, f); }
        else if (s < rows) set(s * cols + ca.c, f * VY[s]);
      }
    }
    for (w = waves.length - 1; w >= 0; w--) if ((t - waves[w].via) / waves[w].dur > waves[w].life) waves.splice(w, 1); else hot++;
    var f1 = tide ? ((t * .00009) % 1.6) * (W + H) - H * .4 : W * .6;
    var f2 = tide ? (1 - (t * .00005) % 1.6) * (W + H) - H * .4 : -1;
    var b1 = U * .34, b2 = U * .5, bm = U * .26;
    for (r = 0, i = 0; r < rows; r++) {
      y = r * py + ch / 2;
      var vy = VY[r];
      for (c = 0; c < cols; c++, i++) {
        x = c * px + cw / 2;
        var v1 = 1 - Math.abs(x + y * .82 - f1) / b1, v2 = 1 - Math.abs(x - y * .6 + H * .6 - f2) / b2, dx = x - mx, dy = y - my;
        a = E[i];
        if (v1 > 0 && v1 * v1 * .9 * vy > a) a = v1 * v1 * .9 * vy;
        if (v2 > 0 && v2 * v2 * .35 * vy > a) a = v2 * v2 * .35 * vy;
        if (dx * dx + dy * dy < bm * bm) { f = 1 - Math.sqrt(dx * dx + dy * dy) / bm; if (f * f > a) a = f * f; }
        E[i] = a;
        if (tide && v1 > .96 && Math.random() < .006) AU[i] = .9 * vy;
        for (w = 0; w < waves.length; w++) {
          var od = waves[w], age = (t - od.via) / od.dur;
          if (age < 0) continue;
          dx = x - od.x; dy = y - od.y;
          var da = Math.abs(Math.sqrt(dx * dx + dy * dy) - age * od.reach);
          if (da > U * .12) continue;
          var vo = Math.max(0, 1 - da / od.w), vc = Math.max(0, 1 - da / (U * .035)), g = od.g * (od.s < 'f' ? vy : 1);
          a = Math.max(vo * (1.2 - age), vc * 1.15 * (1 - age * .3)) * g;
          if (a > E[i]) E[i] = a;
          a = Math.max(vo * vo * (1 - age * .35) * .9, vc * (1 - age * .25)) * g;
          if (a > AU[i]) AU[i] = Math.min(1, a);
        }
      }
    }
    var kd = Math.pow(.9, Math.min(80, t - (prev || t)) / 16.7);
    prev = t; lit = 0; lo = rows; hi = 0;
    /* 16 milk, 16 gold steps: one fill each */
    for (i = 0; i < N; i++) {
      E[i] *= kd; AU[i] *= kd;
      if (E[i] < .003) E[i] = 0;
      if (AU[i] < .003) AU[i] = 0; else lit = 1;
      K[i] = AU[i] > .05 ? Q + Math.min(Q - 1, AU[i] * Q | 0) : E[i] >= .02 ? Math.min(Q - 1, E[i] / 1.2 * Q | 0) : -1;
      if (K[i] >= 0) { r = (i / cols) | 0; if (r < lo) lo = r; if (r > hi) hi = r; }
    }
    for (q = 0; q < 2 * Q; q++) paint(q);
    paint(-1);
  }
  function paint(q) {
    var n = 0, i, x, y;
    for (i = 0; i < N; i++) {
      if (q < 0 ? !(K[i] >= 0 && (E[i] > .14 || AU[i] > .1)) : K[i] !== q) continue;
      if (!n++) ctx.beginPath();
      x = (i % cols) * px; y = ((i / cols) | 0) * py;
      if (q < 0) ctx.rect(x, y + ch * .48, cw, Math.max(1, D)); else cell(ctx, x, y);
    }
    if (n) { ctx.fillStyle = q < 0 ? 'rgba(3,3,3,.55)' : FS[q]; ctx.fill(); }
  }
  /* ONE chain: a callback a hidden tab parked never starts a second */
  function loop(t) {
    raf = 0;
    if (!on) return;
    raf = requestAnimationFrame(loop);
    if (t - rush > 500 && t - last < (hot ? 28 : 75)) return;
    last = t; frame(t, true);
    if (!amb() && !hot && !lit) rest();
  }
  function sleep() { on = false; O.running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function rest() {
    sleep();
    if (!tela) return;
    E.fill(0); AU.fill(0); waves = []; cas = []; prev = 0; hot = lit = 0; lo = 0; hi = rows;
    frame(0, false);
  }
  function wake() {
    var go = !!tela && (amb() || hot || lit) && seen && !still && !document.hidden;
    if (go && !on) { on = true; O.running = true; prev = 0; if (!raf) raf = requestAnimationFrame(loop); }
    else if (!go && on) sleep();
  }
  function dim() { tela.style.opacity = (open ? 1 : .6) * (card ? .6 : 1); }
  function move(e) {
    if (!on) return;
    var r = tela.getBoundingClientRect();
    mx = (e.clientX - r.left) * D; my = (e.clientY - r.top) * D; rush = performance.now();
  }
  function resize() {
    clearTimeout(wait);
    wait = setTimeout(function () { measure(); if (!on) rest(); }, 180);
  }
  function start(c, o) {
    o = o || {};
    if (tela) { setOpen(o.open); return O; }
    if (!c || !c.getContext || !(ctx = c.getContext('2d'))) return O;
    tela = c; opt = o;
    open = !!o.open;
    still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    measure();
    if (!still) {
      if (matchMedia('(pointer: fine)').matches) addEventListener('pointermove', move, { passive: true });
      new IntersectionObserver(function (es) { var e = es[es.length - 1]; seen = e.isIntersecting && e.intersectionRatio >= .04; wake(); }, { threshold: .04 }).observe(c);
      /* "watch the board": on a phone the lower half of the pass alone on screen is no reason to run the tides */
      if (o.hero) new IntersectionObserver(function (es) { hero = es[es.length - 1].isIntersecting; wake(); }).observe(o.hero);
      document.addEventListener('visibilitychange', wake);
    }
    new ResizeObserver(resize).observe(c);
    if (open && !still) wake(); else rest();
    return O;
  }
  function setOpen(b) {
    b = !!b;
    if (!tela) { open = b; return; }
    if (b === open) { if (b && !on) wake(); return; }
    open = b;
    /* the dim over 1.2s, then the transition goes: a lingering transition property
       would animate every later opacity (a re-measure) — and under a fake clock
       (tests/cities/ui.mjs B4) it stalls the page's other flap boards */
    if (!still) { tela.style.transition = 'opacity 1.2s'; clearTimeout(tw); tw = setTimeout(function () { tela.style.transition = ''; }, 1300); }
    dim();
    if (still) return rest();
    if (b) { var o = origin(); wave(o[0], o[1], performance.now(), 'o'); beat = performance.now() + PERIOD; }
    wake();
  }
  function pulse(n, s, ms) {
    if (!tela || still) return;
    setTimeout(function () {
      var p = at(n), t = performance.now();
      wave(p[0], p[1], t, s === 'p' ? 'l' : s);
      if (s === 'p') wave(p[0], p[1], t + 300, 'l');
      if (s !== 's') cas.push({ r: Math.floor(p[1] / py), c: Math.floor(p[0] / px), via: t });
      hot++; wake();
    }, ms || 0);
  }
})();
