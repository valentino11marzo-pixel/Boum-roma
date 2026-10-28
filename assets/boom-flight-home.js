/* BOOM Flight / Home. Presentation only; the original cartaRoma canvas
   owns the Solari background and its central gold pulse. No duplicate
   animation clock, catalogue or business writes are introduced here. */
(function () {
  'use strict';
  var home = document.querySelector('[data-flight-home="true"]');
  if (!home || home.dataset.flightHomePresentation) return;
  home.dataset.flightHomePresentation = 'true';

  // Facts stay in the server HTML. Progressive disclosure shortens the
  // reading path without removing content from no-script visitors.
  document.querySelectorAll('[data-flight-disclosure]').forEach(function (button) {
    var panel = document.getElementById(button.dataset.flightDisclosure);
    if (!panel) return;
    button.hidden = false;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    });
  });

  // Rest the existing ticket foil and route animations outside the viewport.
  // The original product demo and the canvas keep their own controllers.
  var tickets = document.querySelector('.flight-home-services .biglietteria');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ticketsInView = !('IntersectionObserver' in window);
  var ticketObserver;
  function syncTicketMotion() {
    if (!tickets) return;
    tickets.style.setProperty('--flight-ticket-motion',
      ticketsInView && !document.hidden && !reduced.matches ? 'running' : 'paused');
  }
  if (tickets) {
    if ('IntersectionObserver' in window) {
      ticketObserver = new IntersectionObserver(function (entries) {
        ticketsInView = entries[0].isIntersecting;
        syncTicketMotion();
      }, { threshold:0.01 });
      ticketObserver.observe(tickets);
    }
    syncTicketMotion();
    document.addEventListener('visibilitychange', syncTicketMotion);
    if (reduced.addEventListener) reduced.addEventListener('change', syncTicketMotion);
    else if (reduced.addListener) reduced.addListener(syncTicketMotion);
  }

  var scene = home.querySelector('#cieloMappa');
  var mapObserver;
  function prepareMap() {
    if (!scene) return;
    var frame = scene.querySelector('iframe');
    if (!frame || frame.dataset.flightHome) return;
    frame.dataset.flightHome = 'true';
    frame.title = 'Explore Rome with BOOM Skyline: homes and your places';
    // The real iframe is in the hero. Its original loader owns boot/errors.
    frame.setAttribute('loading', 'eager');
  }
  if (scene) {
    prepareMap();
    mapObserver = new MutationObserver(prepareMap);
    mapObserver.observe(scene, { childList:true });
  }
  window.addEventListener('pagehide', function () {
    ticketsInView = false;
    syncTicketMotion();
    if (ticketObserver) ticketObserver.disconnect();
    if (mapObserver) mapObserver.disconnect();
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    if (ticketObserver) ticketObserver.observe(tickets);
    else { ticketsInView = true; syncTicketMotion(); }
    if (mapObserver) {
      prepareMap();
      mapObserver.observe(scene, { childList:true });
    }
  });
})();
