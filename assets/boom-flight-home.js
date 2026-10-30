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
    // The parent creates one iframe near the viewport; Skyline owns its boot.
    frame.setAttribute('loading', 'lazy');
  }
  if (scene) {
    prepareMap();
    mapObserver = new MutationObserver(prepareMap);
    mapObserver.observe(scene, { childList:true });
  }
  // Native horizontal scrolling keeps vertical swipes available on phones.
  var rail = document.getElementById('flightHomeRail');
  var railControls = document.querySelector('.flight-rail-controls');
  var railObserver, railResize, railFrame;
  function railCards() { return rail ? Array.prototype.slice.call(rail.querySelectorAll('.casa-p')) : []; }
  function railIndex(cards) {
    if (!rail || !cards.length) return 0;
    var left = rail.getBoundingClientRect().left + 16, best = 0, distance = Infinity;
    cards.forEach(function (card, i) {
      var d = Math.abs(card.getBoundingClientRect().left - left);
      if (d < distance) { distance = d; best = i; }
    });
    return best;
  }
  function updateRail() {
    railFrame = null;
    if (!rail || !railControls) return;
    var cards = railCards(), i = railIndex(cards);
    railControls.hidden = cards.length < 2;
    railControls.querySelector('[data-rail-position]').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
    railControls.querySelector('[data-rail-prev]').disabled = i === 0;
    railControls.querySelector('[data-rail-next]').disabled = i >= cards.length - 1;
  }
  function queueRail() { if (!railFrame) railFrame = requestAnimationFrame(updateRail); }
  if (rail && railControls) {
    rail.addEventListener('scroll', queueRail, { passive:true });
    railControls.addEventListener('click', function (event) {
      var button = event.target.closest('button'); if (!button) return;
      var cards = railCards(), i = railIndex(cards) + (button.hasAttribute('data-rail-next') ? 1 : -1);
      if (!cards[i]) return;
      rail.scrollBy({ left:cards[i].getBoundingClientRect().left - rail.getBoundingClientRect().left - 16, behavior:reduced.matches ? 'instant' : 'smooth' });
    });
    railObserver = new MutationObserver(queueRail); railObserver.observe(rail, { childList:true });
    if ('ResizeObserver' in window) { railResize = new ResizeObserver(queueRail); railResize.observe(rail); }
    updateRail();
  }

  // Explicit play, readable steps and one animation clock. A manual choice
  // remains selected until the visitor deliberately resumes the journey.
  var journey = document.getElementById('apparecchio'), journeyObserver, journeyTimer;
  var journeyInView = false, playing = false, step = 0;
  var tabs = journey ? Array.prototype.slice.call(journey.querySelectorAll('.app-tab')) : [];
  var panels = journey ? Array.prototype.slice.call(journey.querySelectorAll('.scena-p')) : [];
  var play = journey && journey.querySelector('[data-journey-play]');
  function syncJourney() {
    if (!journey || !play) return;
    clearInterval(journeyTimer); journeyTimer = null;
    var motion = journeyInView && !document.hidden && !reduced.matches;
    journey.dataset.motion = motion ? 'running' : 'paused';
    journey.dataset.playing = String(playing && motion);
    play.setAttribute('aria-pressed', String(playing));
    play.innerHTML = playing ? 'Pause journey <span aria-hidden="true">Ⅱ</span>' : 'Play journey <span aria-hidden="true">▷</span>';
    play.hidden = reduced.matches;
    if (playing && motion) journeyTimer = setInterval(function () { showStep((step + 1) % panels.length); }, 7500);
  }
  function showStep(next) {
    step = next;
    tabs.forEach(function (tab, i) { tab.classList.toggle('on', i === step); tab.setAttribute('aria-selected', String(i === step)); tab.tabIndex = i === step ? 0 : -1; });
    panels.forEach(function (panel, i) { panel.classList.toggle('attiva', i === step); panel.hidden = i !== step; });
  }
  if (journey && play) {
    journey.style.setProperty('--app-durata', '7500ms');
    tabs.forEach(function (tab, i) { tab.addEventListener('click', function () { playing = false; showStep(i); syncJourney(); }); });
    journey.querySelector('.app-tabs').addEventListener('keydown', function (event) {
      var next = event.key === 'ArrowRight' ? (step + 1) % tabs.length : event.key === 'ArrowLeft' ? (step + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); playing = false; showStep(next); tabs[next].focus(); syncJourney();
    });
    play.addEventListener('click', function () { playing = !playing; syncJourney(); });
    journey.addEventListener('focusin', function (event) { if (event.target !== play && playing) { playing = false; syncJourney(); } });
    if ('IntersectionObserver' in window) {
      journeyObserver = new IntersectionObserver(function (entries) { journeyInView = entries[0].isIntersecting; syncJourney(); }, { threshold:.15 });
      journeyObserver.observe(journey);
    } else journeyInView = true;
    document.addEventListener('visibilitychange', syncJourney);
    if (reduced.addEventListener) reduced.addEventListener('change', syncJourney);
    showStep(0); syncJourney();
  }
  window.addEventListener('pagehide', function () {
    ticketsInView = false;
    syncTicketMotion();
    if (ticketObserver) ticketObserver.disconnect();
    if (mapObserver) mapObserver.disconnect();
    if (railObserver) railObserver.disconnect();
    if (railResize) railResize.disconnect();
    if (railFrame) cancelAnimationFrame(railFrame);
    railFrame = null;
    journeyInView = false; syncJourney();
    if (journeyObserver) journeyObserver.disconnect();
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    if (ticketObserver) ticketObserver.observe(tickets);
    else { ticketsInView = true; syncTicketMotion(); }
    if (mapObserver) {
      prepareMap();
      mapObserver.observe(scene, { childList:true });
    }
    if (railObserver) railObserver.observe(rail, { childList:true });
    if (railResize) railResize.observe(rail);
    updateRail();
    if (journeyObserver) journeyObserver.observe(journey);
    else { journeyInView = true; syncJourney(); }
  });
})();
