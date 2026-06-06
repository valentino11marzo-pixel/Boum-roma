/* BOOM · Reel driver — scroll-scrubbed cinematic product film.
   The user drives playback by scrolling: a pinned device morphs through
   acts; narration, ghost numeral, progress rail and parallax follow.
   No dependencies. Reduced-motion & small-screen safe (stacks statically). */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initReel(root) {
    var track = root.querySelector('.reel-track');
    var acts = [].slice.call(root.querySelectorAll('.reel-act'));
    var scenes = [].slice.call(root.querySelectorAll('.reel-scene'));
    var dots = [].slice.call(root.querySelectorAll('.reel-dot'));
    var ghost = root.querySelector('.reel-ghost');
    var N = scenes.length;
    if (!N || !track) return;

    // Static fallback: reduced motion or narrow viewport — show it all, no scrub.
    function isNarrow() { return matchMedia('(max-width: 900px)').matches; }
    if (reduce || isNarrow()) {
      root.classList.add('is-static');
      acts.forEach(function (a) { a.classList.add('show'); });
      scenes.forEach(function (s) { s.classList.add('show'); });
      return;
    }

    // give the track enough scroll distance: ~1 viewport per act + a little tail
    track.style.height = ((N + 0.6) * 100) + 'vh';

    var cur = -1, ticking = false;

    function setActive(idx, seg, p) {
      root.style.setProperty('--reel-p', p.toFixed(4));
      root.style.setProperty('--reel-seg', seg.toFixed(4));
      if (idx === cur) return;
      cur = idx;
      acts.forEach(function (a, i) { a.classList.toggle('show', i === idx); });
      scenes.forEach(function (s, i) {
        if (i === idx) {
          s.classList.remove('show'); void s.offsetWidth; // restart micro-animations
          s.classList.add('show');
        } else { s.classList.remove('show'); }
      });
      dots.forEach(function (d, i) {
        d.classList.toggle('on', i === idx);
        d.classList.toggle('past', i < idx);
      });
      if (ghost) ghost.textContent = (idx + 1);
    }

    function onScroll() {
      var rect = track.getBoundingClientRect();
      var total = track.offsetHeight - window.innerHeight;
      var scrolled = Math.min(Math.max(-rect.top, 0), total);
      var p = total > 0 ? scrolled / total : 0;            // 0..1 overall
      var seg = p * N;
      var idx = Math.min(Math.floor(seg), N - 1);
      setActive(idx, seg - idx, p);
      ticking = false;
    }
    function request() { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }

    // dot → scroll to that act's middle
    dots.forEach(function (d, i) {
      d.addEventListener('click', function () {
        var total = track.offsetHeight - window.innerHeight;
        var top = track.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({ top: top + (i + 0.5) / N * total, behavior: 'smooth' });
      });
    });

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', function () {
      if (isNarrow()) { window.location.reload(); return; } // re-evaluate to static
      track.style.height = ((N + 0.6) * 100) + 'vh'; request();
    }, { passive: true });
    onScroll();
  }

  function boot() { document.querySelectorAll('.reel[data-reel]').forEach(initReel); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
