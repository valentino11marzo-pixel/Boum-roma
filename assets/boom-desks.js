/* assets/boom-desks.js — BOOM Desks, the hub (/desks). Reads
   window.BOOM_DESKS (the build's config: the live desks' hours and holiday
   calendars) and window.BOOM_DESK_CAL (the desk calendar, inlined). Never
   fetches. The static HTML carries the hours only: the clock, the window
   and OPEN/CLOSED are written here, from the calendar, and change only when
   a fact changes. Without JS, or without the calendar, the page stays as
   served. */
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

  /* the curtain: a section gets .in once it comes into view */
  if (IO) {
    var secIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); secIO.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    $$('.sec').forEach(function (s) { secIO.observe(s); });
    root.setAttribute('data-armed', '');
  }

  /* the filament: where you are on the page */
  var filo = $('filo'), fq = 0;
  function fil() { fq = 0; var h = document.documentElement.scrollHeight - innerHeight; if (filo) filo.style.setProperty('--p', h > 0 ? Math.min(1, scrollY / h).toFixed(4) : '0'); }
  addEventListener('scroll', function () { if (!fq) fq = requestAnimationFrame(fil); }, { passive: true });
  fil();

  /* the boards: EUROPE settles once; at ≥760 each row's code flips in, 90 ms apart */
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

  /* the tick: the desk clock, the window and OPEN/CLOSED for every live desk.
     At load, then on the minute, only while the tab is visible. */
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
      if (nb) { set(nb, w.open ? 'OPEN' : 'CLOSED'); nb.classList.toggle('on', !!w.open); }
      $$('[data-nsr="' + d.slug + '"]').forEach(function (n) { set(n, w.open ? 'Desk open until ' + w.until + (w.tz ? ' ' + w.tz : '') : 'Closed · ' + w.line); });
    });
    var pill = $('hubPill');
    if (pill) pill.hidden = !any;
    root.setAttribute('data-desk', any ? 'open' : 'closed');
  }
  var timer = 0;
  function plan() {
    clearTimeout(timer);
    if (document.visibilityState === 'hidden') return;
    timer = setTimeout(function () { tick(); plan(); }, 60000 - (Date.now() % 60000) + 50);
  }
  tick();
  plan();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tick(); plan(); });
})();
