/* assets/boom-map.js — the Horizon, alive (v1.7; the why: build-cities.mjs «THE HORIZON»).
   The night, the open-now glow, the planes; nothing loops; reduced motion: no plane. */
(function () {
  'use strict';
  var svg = document.querySelector('svg.hz'), D;
  if (!svg || svg.hzOn) return;
  svg.hzOn = 1;
  try { D = JSON.parse(svg.nextElementSibling.textContent); } catch (e) { return; }
  var M = Math, c = D.c, V = D.v, X0 = V[0], Y0 = V[1], W = V[2], H = V[3], rad = M.PI / 180, q = 4, lw = M.ceil(W / q), lh = M.ceil(H / q);
  var C = c.slice(0, 3), F = c.slice(3, 6), R = c.slice(6, 9), U = c.slice(9, 12), S = c[12], TX = c[13], TY = c[14];
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }, CC = dot(C, C) - 1;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, CAL = window.BOOM_DESK_CAL, nite = svg.querySelector('.hz-nite');
  var el = function (n, a) { var e = document.createElementNS('http://www.w3.org/2000/svg', n); for (var k in a) e.setAttribute(k, a[k]); return e; };
  var cv = document.createElement('canvas'), cx = cv.getContext && cv.getContext('2d'), img, im, term;
  cv.width = lw; cv.height = lh;
  // the subsolar point (low-precision almanac)
  function sun(t) {
    var n = t / 864e5 - 10957.5, g = (357.528 + 0.9856003 * n) * rad;
    var l = (280.46 + 0.9856474 * n + 1.915 * M.sin(g) + 0.02 * M.sin(2 * g)) * rad, e = (23.439 - 4e-7 * n) * rad;
    var de = M.asin(M.sin(e) * M.sin(l)), lo = M.atan2(M.cos(e) * M.sin(l), M.cos(l)) - (280.46061837 + 360.98564736629 * n) * rad;
    return [M.cos(de) * M.cos(lo), M.cos(de) * M.sin(lo), M.sin(de)];
  }
  // the night: the build's camera, one ray per 4 units, the sun's height sets the veil
  // returns whether any night is drawn inside the frame (a veil pixel, or a terminator segment)
  function night(s) {
    if (!cx || !nite) return false;
    img = img || cx.createImageData(lw, lh);
    var p = img.data, Cs = dot(C, s), drawn = 0;
    for (var j = 0; j < lh; j++) for (var i = 0; i < lw; i++) {
      var x = (X0 + (i + 0.5) * q - TX) / S, y = (Y0 + (j + 0.5) * q - TY) / S, k = 4 * (j * lw + i);
      var r = [F[0] + R[0] * x - U[0] * y, F[1] + R[1] * x - U[1] * y, F[2] + R[2] * x - U[2] * y], L = M.sqrt(dot(r, r));
      var b = dot(C, r) / L, h = b * b - CC;
      if (h < 0) { p[k + 3] = 0; continue; }
      var mu = Cs - (b + M.sqrt(h)) * dot(r, s) / L, a = M.min(1, M.max(0, (0.05 - mu) / 0.25));
      a = a * a * (3 - 2 * a) * 0.56;
      var w = M.max(0, 1 - M.abs(mu - 0.02) / 0.09) * (0.56 - a) * 0.3, A = a + w;
      p[k] = A && 255 * w / A; p[k + 1] = A && (180 * w + 6 * a) / A; p[k + 2] = A && (90 * w + 26 * a) / A; p[k + 3] = A * 255;
      if (p[k + 3]) drawn = 1;
    }
    cx.putImageData(img, 0, 0);
    if (!im) nite.appendChild(im = el('image', { x: X0, y: Y0, width: lw * q, height: lh * q, preserveAspectRatio: 'none' })), nite.appendChild(term = el('path', { 'class': 'hz-term' }));
    im.setAttribute('href', cv.toDataURL());
    // the terminator, its visible part
    var u = [s[1], -s[0], 0], ul = M.sqrt(dot(u, u)) || 1, d = '', on = 0;
    u = [u[0] / ul, u[1] / ul, 0];
    var v = [s[1] * u[2] - s[2] * u[1], s[2] * u[0] - s[0] * u[2], s[0] * u[1] - s[1] * u[0]];
    for (var n = 0; n <= 720; n++) {
      var t = n * M.PI / 360, X = [0, 1, 2].map(function (k) { return u[k] * M.cos(t) + v[k] * M.sin(t); });
      var e = [X[0] - C[0], X[1] - C[1], X[2] - C[2]], z = dot(e, F), px = TX + S * dot(e, R) / z, py = TY - S * dot(e, U) / z;
      if (dot(X, C) < 1.002 || z <= 0 || px < X0 - 40 || px > X0 + W + 40 || py < Y0 - 40 || py > Y0 + H + 40) { on = 0; continue; }
      d += (on ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1); on = 1;
    }
    term.setAttribute('d', d);
    return !!(drawn || /L/.test(d));
  }
  // the glow: open now, the board's calendar
  function tick() {
    var now = new Date();
    var dark = night(sun(+now));
    for (var k in D.d) {
      var x = D.d[k], g = document.getElementById('hzd-' + k);
      var w = CAL && g && CAL.deskWindow(now, { timeZone: x.z || 'Europe/Rome', hours: { from: x.f || '09:00', to: x.t || '19:00' }, days: x.w || [1, 2, 3, 4, 5] }, x.h);
      if (w) g.classList.toggle('on', !!w.open);
    }
    // the key says only what the map shows: 'open now' always, 'night, now' only when a night is drawn
    [].forEach.call(document.querySelectorAll('.k-x'), function (x) { x.hidden = !!x.querySelector('.k-n') && !dark; });
  }
  var timer;
  function plan() { clearTimeout(timer); if (!document.hidden) timer = setTimeout(function () { tick(); plan(); }, 60080 - Date.now() % 60000); }
  tick(); plan();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); plan(); });
  // the planes: transform only, one rAF chain, on the arc's own curve
  var arcs = {}, fl = [], raf = 0;
  [].forEach.call(svg.querySelectorAll('.arc'), function (a) { arcs[a.getAttribute('data-k')] = a; });
  function fly(k, delay, draw) {
    var a = arcs[k];
    if (!a || reduce || fl.some(function (f) { return f.a === a; })) return;
    var L = a.getTotalLength(), g = svg.appendChild(el('g', { 'class': 'hz-pl', opacity: 0 }));
    g.appendChild(el('use', { href: '#boomPlane', x: -9, y: -9, width: 18, height: 18 }));
    if (draw) a.style.strokeDasharray = a.style.strokeDashoffset = 1;
    fl.push({ a: a, L: L, g: g, draw: draw, t0: performance.now() + (delay || 0), T: 1000 + L * 2.4 });
    raf = raf || requestAnimationFrame(step);
  }
  function step(now) {
    var sc = M.max(0.8, M.min(2, 17 * W / 18 / (svg.getBoundingClientRect().width || W)));
    fl = fl.filter(function (f) {
      var t = (now - f.t0) / f.T;
      if (t < 0) return 1;
      if (t >= 1) { if (f.draw) f.a.style.strokeDashoffset = 0; svg.removeChild(f.g); return 0; }
      var e = t < 0.5 ? 4 * t * t * t : 1 - M.pow(2 - 2 * t, 3) / 2, l = e * f.L;
      var p = f.a.getPointAtLength(l), a = f.a.getPointAtLength(M.max(0, l - 1)), b = f.a.getPointAtLength(M.min(f.L, l + 1));
      f.g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + (M.atan2(b.y - a.y, b.x - a.x) / rad + 90).toFixed(1) + ') scale(' + sc.toFixed(2) + ')');
      f.g.setAttribute('opacity', M.min(1, t / 0.08, (1 - t) / 0.1).toFixed(2));
      if (f.draw) f.a.style.strokeDashoffset = 1 - e;
      return 1;
    });
    raf = fl.length ? requestAnimationFrame(step) : 0;
  }
  // the first view: every arc drawn from Rome, a plane at its tip
  var keys = Object.keys(arcs).sort(function (x, y) { return arcs[x].getTotalLength() - arcs[y].getTotalLength(); });
  if (!reduce && window.IntersectionObserver) {
    var r0 = svg.getBoundingClientRect(), seen = r0.top < innerHeight * 0.7 && r0.bottom > innerHeight * 0.3;
    if (!seen) keys.forEach(function (k) { arcs[k].style.strokeDasharray = arcs[k].style.strokeDashoffset = 1; });
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); keys.forEach(function (k, i) { fly(k, i * 260, !seen); }); }
    }, { threshold: 0.35 });
    io.observe(svg);
  }
  // again on a pin (hub) or a Network line (desk page)
  [].forEach.call(document.querySelectorAll('a.pin, ul.net a'), function (a) {
    var b = a.querySelector('b'), k = a.id ? a.id.slice(4) : b && b.textContent.toLowerCase(), A = arcs[k];
    if (!A) return;
    var on = function () { fly(k); if (!a.id) A.classList.add('hi'); }, off = function () { A.classList.remove('hi'); };
    a.addEventListener('mouseenter', on); a.addEventListener('focus', on);
    a.addEventListener('mouseleave', off); a.addEventListener('blur', off);
  });
  window.BOOM_MAP = { fly: fly, sun: sun };
})();
