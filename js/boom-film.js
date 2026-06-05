/* BOOM · Product film driver
   Auto-plays a screencast of the BOOM dashboard running a whole move.
   - cursor flies to the active sidebar item and "clicks", the screen switches,
     scene micro-animations replay, captions + progress update.
   - only runs while on screen (IntersectionObserver); reduced-motion safe.
   No dependencies. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initFilm(root) {
    var frame = root.querySelector('.bf-frame');
    var stage = root.querySelector('.bf-stage');
    var cursor = root.querySelector('.bf-cursor');
    var capPill = root.querySelector('.bf-cap .pill');
    var capTxt = root.querySelector('.bf-cap .txt');
    var navs = Array.prototype.slice.call(root.querySelectorAll('.bf-nav'));
    var scenes = Array.prototype.slice.call(root.querySelectorAll('.bf-scene'));
    var ticks = Array.prototype.slice.call(root.querySelectorAll('.bf-tick'));
    if (!scenes.length) return;

    var DUR = 3600;
    root.style.setProperty('--bf-dur', DUR + 'ms');

    function clearAnims(sc) {
      sc.querySelectorAll('.bf-match,.bf-ok').forEach(function (e) { e.classList.remove('in'); });
      var sg = sc.querySelector('.bf-sign'); if (sg) sg.classList.remove('go');
    }
    function runAnims(sc) {
      sc.querySelectorAll('.bf-match').forEach(function (e, i) { setTimeout(function () { e.classList.add('in'); }, 260 + i * 190); });
      sc.querySelectorAll('.bf-ok').forEach(function (e, i) { setTimeout(function () { e.classList.add('in'); }, 520 + i * 240); });
      var sg = sc.querySelector('.bf-sign'); if (sg) setTimeout(function () { sg.classList.add('go'); }, 320);
    }

    function moveCursorTo(el) {
      if (reduce || !cursor || !el) return;
      var fr = frame.getBoundingClientRect(), r = el.getBoundingClientRect();
      var x = (r.left - fr.left) + r.width * 0.62;
      var y = (r.top - fr.top) + r.height * 0.5;
      cursor.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      setTimeout(function () {
        cursor.classList.add('click');
        setTimeout(function () { cursor.classList.remove('click'); }, 480);
      }, 520);
    }

    function show(k) {
      navs.forEach(function (n, i) { n.classList.toggle('active', i === k); n.classList.toggle('done', i < k); });
      moveCursorTo(navs[k]);
      var delay = reduce ? 0 : 430;
      setTimeout(function () {
        scenes.forEach(function (s, i) {
          if (i === k) { s.classList.add('show'); }
          else { if (s.classList.contains('show')) clearAnims(s); s.classList.remove('show'); }
        });
        var sc = scenes[k];
        if (capPill) capPill.textContent = sc.getAttribute('data-pill') || ('Step ' + (k + 1));
        if (capTxt) capTxt.textContent = sc.getAttribute('data-cap') || '';
        if (!reduce) runAnims(sc); else { // reveal statically
          sc.querySelectorAll('.bf-match,.bf-ok').forEach(function (e) { e.classList.add('in'); });
          var sg = sc.querySelector('.bf-sign'); if (sg) sg.classList.add('go');
        }
        ticks.forEach(function (t, i) { t.classList.toggle('active', i === k); t.classList.toggle('done', i < k); });
      }, delay);
    }

    if (reduce) { show(0); return; } // static: show first step, no loop

    var i = 0, timer = null, running = false;
    function tick() { show(i); i = (i + 1) % scenes.length; }
    function start() { if (running) return; running = true; tick(); timer = setInterval(tick, DUR); }
    function stop() { running = false; if (timer) { clearInterval(timer); timer = null; } }

    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
    }, { threshold: 0.35 });
    io.observe(root);
  }

  function boot() { document.querySelectorAll('.boom-film').forEach(initFilm); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
