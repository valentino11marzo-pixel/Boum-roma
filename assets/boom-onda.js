/* assets/boom-onda.js — the onda behind a city desk's pass (v1.6, ≥940px):
   the home's flap field (index.html cartaRoma), gold only. The heartbeat
   rises from the stub's destination code (.route-s .rb). It LOOPS only
   while the desk is open — boom-city.js says so each minute, from the desk
   calendar; closed, it draws one dim still frame and stops. Reduced motion:
   one frame, never a loop. Off screen or in a hidden tab it sleeps. No tap
   ripple, no scroll front, no green. Loaded by assets/boom-city.js after
   load, only at ≥940px. window.BOOM_ONDA = { start, setOpen, stop, running } */
(function () {
  'use strict';
  var GOLD = '255,215,0', MILK = '250,248,240';
  var O = window.BOOM_ONDA = { running: false, start: start, setOpen: setOpen, stop: stop };
  var tela, ctx, src, still = false, open = false, seen = true, on = false, halt = false;
  var W = 0, H = 0, DPR = 1, MIN = 1, cw, ch, gap, cols, rows, E, AU, base, ox, oy;
  var px = -1e4, py = -1e4, rush = -1e4, last = 0, prev = 0, beat = 700, flip = 2200, waves = [], cas = [], wait, raf = 0;

  /* the vertical veil, baked into the alpha (no mask-image on the compositor) */
  function veil(y) { var q = y / H; return q < .72 ? 1 : Math.max(0, (.98 - q) / .26); }
  function cell(g, x, y) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, cw, ch, 3 * DPR); else g.rect(x, y, cw, ch);
    g.fill();
  }
  /* the heartbeat's origin: the centre of the stub's destination code,
     read again at each beat (the stub is sticky) and on resize */
  function origin() {
    var r = tela.getBoundingClientRect(), o = src && src.getBoundingClientRect();
    if (o && o.width) { ox = (o.left + o.width / 2 - r.left) * DPR; oy = (o.top + o.height / 2 - r.top) * DPR; }
    else { ox = W * .56; oy = H * .42; }
  }
  function measure() {
    var r = tela.getBoundingClientRect();
    /* an area cap: sharp where it shows, never a monster canvas */
    DPR = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(2.3e6 / Math.max(1, r.width * r.height))));
    W = tela.width = Math.round(r.width * DPR); H = tela.height = Math.round(r.height * DPR);
    MIN = Math.max(1, Math.min(W, H));
    cw = Math.round(40 * DPR); ch = Math.round(cw * .68); gap = Math.round(7 * DPR);
    cols = Math.ceil(W / (cw + gap)) + 1; rows = Math.ceil(H / (ch + gap)) + 1;
    E = new Float32Array(cols * rows); AU = new Float32Array(cols * rows);
    base = null;
    if (W && H) {
      /* the quiet layer is drawn once, under; each frame paints only the lit cells */
      base = document.createElement('canvas'); base.width = W; base.height = H;
      var g = base.getContext('2d');
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var v = veil(y * (ch + gap));
        if (v <= 0) continue;
        g.fillStyle = 'rgba(' + MILK + ',' + (.031 * v) + ')';
        cell(g, x * (cw + gap), y * (ch + gap));
      }
    }
    origin();
  }
  /* one frame. live: the tides move, the heartbeat and the cascades come;
     still: one band, at alpha k (the closed desk dims it to .6) */
  function frame(t, live, k) {
    ctx.clearRect(0, 0, W, H);
    if (!base) return;
    var i, r, c;
    if (live && t > beat) {
      origin();
      waves.push({ x: ox, y: oy, via: t });
      if (waves.length > 3) waves.shift();
      beat = t + 8200;
    }
    /* a column cascade: one row of the board updating, top to bottom — gold */
    if (live && t > flip) {
      cas.push({ c: Math.floor(Math.random() * cols), via: t });
      if (cas.length > 3) cas.shift();
      flip = t + 4600 + Math.random() * 3800;
    }
    for (i = 0; i < cas.length; i++) {
      var ca = cas[i], head = (t - ca.via) / 46;
      if (head > rows + 3) continue;
      for (r = Math.max(0, Math.floor(head) - 2); r <= Math.min(rows - 1, Math.floor(head)); r++) {
        var ii = r * cols + ca.c, f = 1 - (head - r) / 3;
        if (f <= 0) continue;
        AU[ii] = Math.max(AU[ii], f * .85); E[ii] = Math.max(E[ii], f);
      }
    }
    var f1 = live ? ((t * .00009) % 1.6) * (W + H) - H * .4 : W * .6;
    var f2 = live ? (1 - (t * .00005) % 1.6) * (W + H) - H * .4 : -1;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      var x = c * (cw + gap) + cw / 2, y = r * (ch + gap) + ch / 2;
      i = r * cols + c;
      var v1 = Math.max(0, 1 - Math.abs((x + y * .82) - f1) / (MIN * .34));
      var v2 = Math.max(0, 1 - Math.abs((x - y * .6 + H * .6) - f2) / (MIN * .5));
      var vm = Math.max(0, 1 - Math.hypot(x - px, y - py) / (MIN * .26));
      E[i] = Math.max(E[i], v1 * v1 * .9, v2 * v2 * .35, vm * vm);
      if (live && v1 > .96 && Math.random() < .006) AU[i] = .9;
      for (var w = 0; w < waves.length; w++) {
        var od = waves[w], age = (t - od.via) / 3000;
        if (age > 1.4) continue;
        /* the beat: a narrow crest leads, the band behind holds the gold */
        var da = Math.abs(Math.hypot(x - od.x, y - od.y) - age * MIN * 1.05);
        var vo = Math.max(0, 1 - da / (MIN * .12)), vc = Math.max(0, 1 - da / (MIN * .035));
        E[i] = Math.max(E[i], vo * (1.2 - age), vc * 1.15 * (1 - age * .3));
        AU[i] = Math.max(AU[i], vo * vo * (1 - age * .35) * .9, vc * (1 - age * .25));
      }
    }
    var dt = Math.min(80, t - (prev || t)), kd = Math.pow(.9, dt / 16.7);
    prev = t;
    for (i = 0; i < E.length; i++) {
      E[i] *= kd; AU[i] *= kd;
      if (E[i] < .003) E[i] = 0;
      if (AU[i] < .003) AU[i] = 0;
    }
    ctx.globalAlpha = k;
    ctx.drawImage(base, 0, 0);
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      i = r * cols + c;
      if (E[i] < .02 && AU[i] < .05) continue;
      var x2 = c * (cw + gap), y2 = r * (ch + gap), vy = veil(y2);
      if (vy <= 0) continue;
      ctx.fillStyle = AU[i] > .05 ? 'rgba(' + GOLD + ',' + (AU[i] * .5 * vy) + ')' : 'rgba(' + MILK + ',' + (E[i] * .13 * vy) + ')';
      cell(ctx, x2, y2);
      if (E[i] > .14 || AU[i] > .1) { ctx.fillStyle = 'rgba(3,3,3,.55)'; ctx.fillRect(x2, y2 + ch * .48, cw, Math.max(1, DPR)); }
    }
    ctx.globalAlpha = 1;
  }
  /* ONE chain: the frame id is kept, so a callback a hidden tab parked can
     never start a second loop next to the one wake() queues */
  function loop(t) {
    raf = 0;
    if (!on) return;
    raf = requestAnimationFrame(loop);
    /* at rest the field breathes at 30 fps; under the pointer, 60 */
    if (t - rush > 500 && t - last < 28) return;
    last = t; frame(t, true, 1);
  }
  function sleep() { on = false; O.running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  /* the still frame: from a clean field */
  function rest() {
    sleep();
    if (!tela) return;
    E.fill(0); AU.fill(0); waves = []; cas = []; prev = 0;
    frame(0, false, open ? 1 : .6);
  }
  function wake() {
    var go = !!tela && open && seen && !still && !halt && !document.hidden;
    if (go && !on) { on = true; O.running = true; prev = 0; if (!raf) raf = requestAnimationFrame(loop); }
    else if (!go && on) sleep();
  }
  function move(e) {
    if (!on) return;
    var r = tela.getBoundingClientRect();
    px = (e.clientX - r.left) * DPR; py = (e.clientY - r.top) * DPR; rush = performance.now();
  }
  function resize() {
    clearTimeout(wait);
    wait = setTimeout(function () { measure(); if (!on) rest(); }, 180);
  }
  function start(c, o) {
    o = o || {};
    if (tela) { if (c === tela) { halt = false; setOpen(o.open); } return O; }
    if (!c || !c.getContext || !(ctx = c.getContext('2d'))) return O;
    tela = c;
    src = o.origin && o.origin.nodeType ? o.origin : document.querySelector(o.origin || '.route-s .rb');
    open = !!o.open;
    still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    measure();
    if (!still) {
      addEventListener('pointermove', move, { passive: true });
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { var e = es[es.length - 1]; seen = e.isIntersecting && e.intersectionRatio >= .04; wake(); }, { threshold: .04 }).observe(c);
      document.addEventListener('visibilitychange', wake);
    }
    addEventListener('resize', resize, { passive: true });
    if (open && !still) wake(); else rest();
    return O;
  }
  /* the desk opens or closes: the loop follows (closed → one dim frame) */
  function setOpen(b) {
    b = !!b;
    if (!tela) { open = b; return; }
    if (b === open && (on || !b || still)) return;
    open = b;
    if (open && !still) wake(); else rest();
  }
  function stop() { halt = true; sleep(); }
})();
