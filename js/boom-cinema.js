/* BOOM · Cinema driver — reveal-on-scroll + gentle photo parallax.
   Emotional full-bleed film. No dependencies. Reduced-motion safe. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cins = [].slice.call(document.querySelectorAll('.cin'));
  if (!cins.length) return;

  // reveal each chapter as it enters
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.3 });
  cins.forEach(function (c) { io.observe(c); });

  if (reduce) return;

  // gentle parallax: photo drifts slower than the scroll
  var bgs = [].slice.call(document.querySelectorAll('.cin-bg'));
  var ticking = false;
  function update() {
    var vh = window.innerHeight;
    for (var i = 0; i < bgs.length; i++) {
      var host = bgs[i].parentNode.getBoundingClientRect();
      if (host.bottom < -200 || host.top > vh + 200) continue; // offscreen
      var center = host.top + host.height / 2;
      var off = (center - vh / 2) / vh;        // ~ -1 .. 1
      bgs[i].style.transform = 'translateY(' + (off * -7).toFixed(2) + '%)';
    }
    ticking = false;
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  update();
})();
