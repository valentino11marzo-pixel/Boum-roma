/* Dispatch optics and clearance. Native controllers still own the journey. */
(function () {
  'use strict';
  if (document.body.dataset.homeVision !== 'dispatch') return;
  var byId = function (id) { return document.getElementById(id); };
  var atlas = byId('boomGlobeMount'), globe = window.BoomFlightGlobe;
  var header = document.querySelector('.next-nav'), route = document.querySelector('.edition-flightline');
  if (!atlas || !globe || !header || !route) return;

  var lenses = document.createElement('div');
  lenses.className = 'dispatch-lenses';
  lenses.setAttribute('role', 'group');
  lenses.setAttribute('aria-label', 'Globe perspective');
  lenses.innerHTML = '<button type="button" data-dispatch-lens="globe" aria-pressed="false" aria-controls="boomGlobeMount"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="3.5" ry="8"/><path d="M4 12h16"/></svg>Globe</button><button type="button" data-dispatch-lens="horizon" aria-pressed="true" aria-controls="boomGlobeMount"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17a10 10 0 0 1 18 0M3 17h18M12 7v3M5 10l2 2M19 10l-2 2"/></svg>Horizon</button>';
  atlas.querySelector('.panorama-route').before(lenses);
  function syncLens() {
    var camera = globe.state();
    lenses.querySelectorAll('button').forEach(function (button) {
      button.disabled = !camera.ready || !!camera.error || typeof globe.setFraming !== 'function';
      button.setAttribute('aria-pressed', String(button.dataset.dispatchLens === (camera.framing || 'horizon')));
    });
  }
  lenses.addEventListener('click', function (event) {
    var button = event.target.closest('[data-dispatch-lens]');
    if (!button || button.disabled || button.getAttribute('aria-pressed') === 'true') return;
    globe.setFraming(button.dataset.dispatchLens, { animate: event.detail > 0 });
    syncLens();
  });
  atlas.addEventListener('boom-globe-camera', syncLens);
  new MutationObserver(syncLens).observe(atlas, { attributes: true, attributeFilter: ['data-globe-state'] });
  syncLens();

  // Measure the actual two bars. One native scroll coordinate system, with no
  // wheel/touch interception or second current-chapter calculation.
  function measureClearance() {
    var navHeight = Math.ceil(header.getBoundingClientRect().height);
    var routeHeight = document.body.dataset.view === 'home' ? Math.ceil(route.getBoundingClientRect().height) : 0;
    var root = document.documentElement;
    var values = { '--dispatch-nav-height': navHeight + 'px', '--dispatch-scroll-clearance': (navHeight + routeHeight) + 'px' };
    Object.keys(values).forEach(function (key) {
      if (root.style.getPropertyValue(key) !== values[key]) root.style.setProperty(key, values[key]);
    });
  }
  if (window.ResizeObserver) {
    var dimensions = new ResizeObserver(measureClearance);
    dimensions.observe(header); dimensions.observe(route);
  }
  new MutationObserver(measureClearance).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'data-europe-city'] });
  window.addEventListener('resize', measureClearance, { passive: true });
  window.addEventListener('pageshow', measureClearance);
  measureClearance();
})();
