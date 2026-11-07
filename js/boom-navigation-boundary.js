/* Service pages opt into cross-document transitions; the Flight application
 * owns its in-page transitions. Cancel only the native snapshot at that boundary.
 * Chromium can otherwise reject an inaccessible promise after browser Back. */
(function () {
  'use strict';
  window.addEventListener('pageswap', function (event) {
    var transition = event.viewTransition, destination;
    if (!transition) return;
    try { destination = new URL(event.activation.entry.url); } catch (_) { return; }
    if (destination.origin !== location.origin ||
        !/^\/(?:flight-next|home-panorama)(?:\.html)?\/?$/.test(destination.pathname)) return;
    transition.ready.catch(function () {});
    transition.finished.catch(function () {});
    transition.skipTransition();
  });
})();
