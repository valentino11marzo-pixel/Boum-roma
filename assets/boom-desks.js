(function () {
  'use strict';
  var D = window.BOOM_DESKS || {};
  var CAL = window.BOOM_DESK_CAL || null;
  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var mq = function (q) { return window.matchMedia ? matchMedia(q) : { matches: false }; };
  var reduce = mq('(prefers-reduced-motion: reduce)').matches;
  var wide = mq('(min-width: 760px)');
  var root = document.documentElement, IO = 'IntersectionObserver' in window;

  if (IO) {
    var secIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); secIO.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    $$('.sec').forEach(function (s) { secIO.observe(s); });
    root.setAttribute('data-armed', '');
  }

  var filo = $('filo'), fq = 0;
  function fil() { fq = 0; var h = document.documentElement.scrollHeight - innerHeight; if (filo) filo.style.setProperty('--p', h > 0 ? Math.min(1, scrollY / h).toFixed(4) : '0'); }
  addEventListener('scroll', function () { if (!fq) fq = requestAnimationFrame(fil); }, { passive: true });
  fil();

  var DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function mount(host, word, spin) {
    if (!host || !window.BoomSolari) return null;
    var b = new window.BoomSolari.Board(host, word.length, DRUM);
    host.classList.add('live');
    if (reduce || !spin) b.show(word); else b.show(word, 60, true);
    return b;
  }
  var hb = $('hubBoard');
  if (hb) {
    var hw = String(hb.getAttribute('data-word') || D.WORD || '').toUpperCase();
    if (reduce) mount(hb, hw, false); else setTimeout(function () { mount(hb, hw, true); }, 120);
  }
  var coded = false;
  function codes() {
    var tb = $('dboard');
    if (coded || !wide.matches || !tb || !window.BoomSolari) return;
    coded = true;
    tb.classList.add('mounted');
    $$('.db-b', tb).forEach(function (b, i) {
      var w = String(b.getAttribute('data-word') || '');
      if (reduce) mount(b, w, false); else setTimeout(function () { mount(b, w, true); }, 200 + i * 90);
    });
  }
  codes();
  if (wide.addEventListener) wide.addEventListener('change', codes); else if (wide.addListener) wide.addListener(codes);

  var flaps = {};
  function flapOf(nb, slug) {
    if (flaps[slug] || !wide.matches || !window.BoomSolari) return flaps[slug] || null;
    var h = document.createElement('b');
    h.className = 'db-nf';
    h.setAttribute('aria-hidden', 'true');
    nb.parentNode.insertBefore(h, nb);
    var b = new window.BoomSolari.Board(h, 6, DRUM);
    nb.parentNode.classList.add('flapped');
    flaps[slug] = { h: h, b: b, w: '' };
    return flaps[slug];
  }
  function nowFlap(nb, slug, word, on) {
    var f = flapOf(nb, slug);
    if (!f || f.w === word) return;
    var first = !f.w;
    f.w = word;
    f.h.classList.toggle('on', on);
    var pad6 = (word + '      ').slice(0, 6);
    if (reduce) f.b.show(pad6);
    else if (first) setTimeout(function () { f.b.show(pad6, 70, true); }, 700);
    else f.b.update(pad6);
  }

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var set = function (n, v) { if (n && n.textContent !== v) n.textContent = v; };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  function tick() {
    if (!CAL) return;
    var now = new Date(), any = false;
    (D.DESKS || []).forEach(function (d) {
      var p = CAL.zoneParts(now, d.desk.timeZone);
      var w = CAL.deskWindow(now, d.desk, d.holidays);
      if (p) $$('[data-clk="' + d.slug + '"]').forEach(function (n) { set(n, pad(Math.floor(p.min / 60)) + ':' + pad(p.min % 60) + (p.tz ? ' ' + p.tz : '')); });
      if (!w) return;
      any = any || w.open;
      $$('[data-dw="' + d.slug + '"]').forEach(function (n) { set(n, cap(w.line)); });
      var row = document.querySelector('.db-r[data-desk="' + d.slug + '"]');
      var nb = row && row.querySelector('.db-nb');
      if (nb) { set(nb, w.open ? 'OPEN' : 'CLOSED'); nb.classList.toggle('on', !!w.open); nowFlap(nb, d.slug, w.open ? 'OPEN' : 'CLOSED', !!w.open); }
      $$('[data-nsr="' + d.slug + '"]').forEach(function (n) { set(n, w.open ? 'Desk open until ' + w.until + (w.tz ? ' ' + w.tz : '') : 'Closed · ' + w.line); });
    });
    var pill = $('hubPill');
    if (pill) pill.hidden = !any;
    root.setAttribute('data-desk', any ? 'open' : 'closed');
    anyOpen = any;
    if (window.BOOM_ONDA && window.BOOM_ONDA.setOpen) window.BOOM_ONDA.setOpen(any);
  }
  var anyOpen = false;
  var timer = 0;
  function plan() {
    clearTimeout(timer);
    if (document.visibilityState === 'hidden') return;
    timer = setTimeout(function () { tick(); plan(); }, 60000 - (Date.now() % 60000) + 50);
  }
  tick();
  plan();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tick(); plan(); });
  var reflap = function () { if (wide.matches) tick(); };
  if (wide.addEventListener) wide.addEventListener('change', reflap); else if (wide.addListener) wide.addListener(reflap);

  var hzMap = document.querySelector('svg.hz'), hzIn = false;
  function hzGo() { if (hzIn || !hzMap || !D.MAP) return; hzIn = true; var e = document.createElement('script'); e.src = D.MAP; e.async = true; document.head.appendChild(e); }
  if (hzMap && IO) { var hzIO = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { hzIO.disconnect(); hzGo(); } }, { rootMargin: '600px 0px' }); hzIO.observe(hzMap); } else addEventListener('load', hzGo);

  var touch = mq('(hover: none), (max-width: 599px)'), sel = null;
  function unsel() { if (sel) { sel.classList.toggle('sel', false); sel.querySelector('.pc').classList.toggle('dock', false); $('hmap').querySelector('.hmap-box').style.marginBottom = ''; sel = null; } }
  $$('a.pin').forEach(function (p) {
    p.addEventListener('click', function (e) {
      if (!touch.matches || sel === p) return;
      e.preventDefault();
      unsel();
      var box = $('hmap').querySelector('.hmap-box'), b = box.getBoundingClientRect(), r = p.getBoundingClientRect(), pc = p.querySelector('.pc');
      pc.style.setProperty('--dl', (b.left - r.left) + 'px');
      pc.style.setProperty('--dt', (b.bottom - r.top + 8) + 'px');
      pc.style.setProperty('--dw', b.width + 'px');
      pc.classList.add('dock');
      p.classList.add('sel');
      sel = p;
      box.style.marginBottom = (pc.offsetHeight + 16) + 'px';
      if (window.BOOM_MAP) window.BOOM_MAP.fly(p.id.slice(4));
    });
  });
  document.addEventListener('click', function (e) { if (sel && !sel.contains(e.target)) unsel(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') unsel(); });

  var ondaIn = false, big = mq('(min-width: 940px)');
  function onda() {
    var cv = $('onda');
    if (ondaIn || !D.ONDA || !cv || !big.matches) return;
    ondaIn = true;
    var s = document.createElement('script');
    s.src = D.ONDA; s.async = true;
    s.onload = function () {
      if (window.BOOM_ONDA && window.BOOM_ONDA.start) window.BOOM_ONDA.start(cv, { origin: document.querySelector('#db-rom .db-code'), open: anyOpen });
    };
    document.head.appendChild(s);
  }
  function ondaLater() { if (window.requestIdleCallback) requestIdleCallback(onda, { timeout: 2000 }); else setTimeout(onda, 200); }
  if (document.readyState === 'complete') ondaLater(); else addEventListener('load', ondaLater, { once: true });
  var bigOnda = function () { if (big.matches && document.readyState === 'complete') ondaLater(); };
  if (big.addEventListener) big.addEventListener('change', bigOnda); else if (big.addListener) big.addListener(bigOnda);
})();
