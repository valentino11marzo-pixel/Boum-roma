/* BOOM Flight / Home. No second catalogue and no business writes.
   Keep the Skyline iframe usable as the hero, even when the browser has
   disabled embedded content. Its original loader owns map boot/errors. */
(function () {
  'use strict';
  var home = document.querySelector('[data-flight-home="true"]');
  if (!home) return;

  // A presentation-only light follows the existing mechanical flip.
  // No new Solari clock or persistent animation frame loop is introduced.
  var word = home.querySelector('#flapDays');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var inView = false;
  var impulseTimer = 0;
  var pointerFrame = 0;
  var visibilityObserver;
  function canMove() { return inView && !document.hidden && !reduced.matches; }
  function stopLight() {
    clearTimeout(impulseTimer);
    impulseTimer = 0;
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    if (word) {
      word.classList.remove('flight-home-energized');
      word.style.removeProperty('--flight-light-x');
      word.style.removeProperty('--flight-light-y');
    }
  }
  function syncMotion() {
    home.classList.toggle('flight-home-motion', canMove());
    if (!canMove()) stopLight();
  }
  function impulse() {
    if (!word || !canMove() || impulseTimer) return;
    word.classList.add('flight-home-energized');
    impulseTimer = window.setTimeout(function () {
      word.classList.remove('flight-home-energized');
      impulseTimer = 0;
    }, 1500);
  }
  if (word) {
    // Observe the title, not the whole (tall on mobile) hero: it rests as
    // soon as the visitor moves down to Skyline and the search controls.
    if ('IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        syncMotion();
      }, { threshold:0.25 });
      visibilityObserver.observe(word);
    } else { inView = true; syncMotion(); }
    word.addEventListener('animationstart', function (event) {
      if (event.animationName === 'flTop') impulse();
    });
    word.addEventListener('pointerenter', function () {
      if (finePointer.matches) impulse();
    });
    word.addEventListener('pointermove', function (event) {
      if (!canMove() || !finePointer.matches || pointerFrame) return;
      var x = event.clientX, y = event.clientY;
      pointerFrame = requestAnimationFrame(function () {
        pointerFrame = 0;
        if (!canMove()) return;
        var box = word.getBoundingClientRect();
        if (!box.width || !box.height) return;
        word.style.setProperty('--flight-light-x', Math.round(25 + Math.max(0, Math.min(1, (x - box.left) / box.width)) * 50) + '%');
        word.style.setProperty('--flight-light-y', Math.round(30 + Math.max(0, Math.min(1, (y - box.top) / box.height)) * 40) + '%');
      });
    }, { passive:true });
    word.addEventListener('pointerleave', function () {
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      word.style.removeProperty('--flight-light-x');
      word.style.removeProperty('--flight-light-y');
    });
    document.addEventListener('visibilitychange', syncMotion);
    if (reduced.addEventListener) reduced.addEventListener('change', syncMotion);
    else if (reduced.addListener) reduced.addListener(syncMotion);
    window.addEventListener('pagehide', function () {
      inView = false;
      syncMotion();
    });
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      if (visibilityObserver) { visibilityObserver.unobserve(word); visibilityObserver.observe(word); }
      else { inView = true; syncMotion(); }
    });
  }
  var scene = home.querySelector('#cieloMappa');
  if (!scene) return;
  function prepare() {
    var frame = scene.querySelector('iframe');
    if (!frame || frame.dataset.flightHome) return;
    frame.dataset.flightHome = 'true';
    frame.title = 'Explore Rome with BOOM Skyline: homes and your places';
    // Loading remains eager only because the real map is now in view.
    // No second map, screenshot or invented geography is loaded here.
    frame.setAttribute('loading', 'eager');
  }
  prepare();
  var observer = new MutationObserver(prepare);
  observer.observe(scene, { childList:true });
  window.addEventListener('pagehide', function () { observer.disconnect(); }, { once:true });
})();
