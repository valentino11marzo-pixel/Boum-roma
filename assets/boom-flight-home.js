/* BOOM Flight / Home. No second catalogue and no business writes.
   Keep the Skyline iframe usable as the hero, even when the browser has
   disabled embedded content. Its original loader owns map boot/errors. */
(function () {
  'use strict';
  var home = document.querySelector('[data-flight-home="true"]');
  if (!home) return;
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
