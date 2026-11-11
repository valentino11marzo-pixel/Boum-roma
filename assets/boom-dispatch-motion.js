/* The moving gate reads the native city selection; it owns no journey state. */
(function () {
  'use strict';
  if (document.body.dataset.homeVision !== 'dispatch') return;
  var rail = document.querySelector('#nextHero .europe-cities');
  var pause = document.getElementById('nextMotionToggle');
  if (!rail || !pause || rail.querySelector('.dispatch-city-carrier')) return;
  var carrier = document.createElement('span');
  carrier.className = 'dispatch-city-carrier';
  carrier.setAttribute('aria-hidden', 'true');
  carrier.hidden = true;
  rail.appendChild(carrier);
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var motion = null, intent = '', away = false;
  var viewportWidth = innerWidth, viewportHeight = innerHeight;
  var tokens = getComputedStyle(document.body);
  var duration = parseFloat(tokens.getPropertyValue('--p-state')) || 220;
  var easing = tokens.getPropertyValue('--p-ease').trim() || 'cubic-bezier(.16,1,.3,1)';

  function visible() {
    var box = rail.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
  }
  function allowed() {
    return !away && !document.hidden && !reduce.matches &&
      pause.getAttribute('aria-pressed') !== 'true' && document.body.dataset.view === 'home' && visible();
  }
  function cancel() {
    if (motion) { motion.cancel(); motion = null; }
  }
  function place(animate) {
    var selected = rail.querySelector('button[data-europe-city][aria-pressed="true"]');
    if (!selected) return;
    var bounds = rail.getBoundingClientRect(), target = selected.getBoundingClientRect();
    if (!bounds.width || !target.width || !target.height) { cancel(); return; }
    // Read the painted in-flight rectangle before cancellation. A fast second
    // choice continues from that exact point, rather than from the old city.
    var previous = carrier.hidden ? null : carrier.getBoundingClientRect();
    cancel();
    var x = target.left - bounds.left - rail.clientLeft;
    var y = target.top - bounds.top - rail.clientTop;
    var destination = 'translate(' + x + 'px,' + y + 'px)';
    carrier.style.width = target.width + 'px';
    carrier.style.height = target.height + 'px';
    carrier.style.transform = destination;
    carrier.hidden = false;
    rail.classList.add('dispatch-carrier-ready');
    if (!animate || !previous || !allowed()) return;
    var fromX = previous.left - bounds.left - rail.clientLeft;
    var fromY = previous.top - bounds.top - rail.clientTop;
    if (Math.abs(fromX - x) + Math.abs(fromY - y) < 1) return;
    var start = 'translate(' + fromX + 'px,' + fromY + 'px) scale(' +
      (previous.width / target.width) + ',' + (previous.height / target.height) + ')';
    motion = carrier.animate([{ transform: start }, { transform: destination }], {
      duration: duration, easing: easing
    });
    var current = motion;
    current.onfinish = function () { if (motion === current) motion = null; };
  }
  function settle() { intent = ''; cancel(); place(false); }

  document.addEventListener('click', function (event) {
    var choice = event.target.closest('.europe-city-switch button[data-europe-city]');
    intent = choice && event.detail > 0 && choice.getAttribute('aria-pressed') !== 'true'
      ? choice.dataset.europeCity : '';
  }, true);
  // Body mutation follows the original city controller's synchronous render.
  // A rejected choice, history traversal or another doorway never invents motion.
  new MutationObserver(function () {
    var animate = intent === document.body.dataset.europeCity;
    intent = ''; place(animate);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-europe-city'] });
  new MutationObserver(function () { if (!allowed()) settle(); }).observe(pause, {
    attributes: true, attributeFilter: ['aria-pressed']
  });
  new MutationObserver(settle).observe(document.body, {
    attributes: true, attributeFilter: ['data-view', 'data-panorama-expanded']
  });
  if (window.ResizeObserver) new ResizeObserver(settle).observe(rail);
  if (window.IntersectionObserver) new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) settle();
  }).observe(rail);
  document.addEventListener('keydown', settle);
  document.addEventListener('visibilitychange', settle);
  window.addEventListener('resize', function () {
    // The existing scene owner also emits resize to repaint the globe after a
    // city choice. Only a changed viewport interrupts this finite selection.
    if (innerWidth === viewportWidth && innerHeight === viewportHeight) return;
    viewportWidth = innerWidth; viewportHeight = innerHeight; settle();
  }, { passive: true });
  window.addEventListener('popstate', settle);
  window.addEventListener('pagehide', function () { away = true; settle(); });
  window.addEventListener('pageshow', function () { away = false; settle(); });
  window.addEventListener('boom:flight-view', settle);
  reduce.addEventListener('change', settle);
  if (document.fonts) document.fonts.ready.then(settle);
  place(false);
})();
