/* A presentation of the six original destinations, never a customer choice. */
(function () {
  'use strict';
  if (document.body.dataset.homeVision !== 'dispatch' || window.BoomDispatchTour) return;
  var byId = function (id) { return document.getElementById(id); };
  var hero = byId('nextHero'), heading = byId('nextHeroTitle'), board = byId('nextDestinationBoard');
  var rail = hero && hero.querySelector('.europe-cities'), centre = hero && hero.querySelector('.hero-centre');
  var plan = hero && hero.querySelector('.edition-plan-link'), pause = byId('nextMotionToggle');
  var motion = window.BoomFlightNextMotion, globe = window.BoomFlightGlobe;
  if (!hero || !heading || !board || !rail || !centre || !plan || !pause || !motion) return;

  // Names and membership come from the real directory, not another city list.
  var cities = Array.from(rail.querySelectorAll('button[data-europe-city]')).map(function (button) {
    var code = button.querySelector('.europe-city-code');
    return { slug: button.dataset.europeCity, name: button.querySelector('span:last-child').textContent.trim(), code: code ? code.textContent.trim() : '', button: button };
  });
  if (cities.length < 2) return;
  var amsterdam = cities.findIndex(function (city) { return city.slug === 'amsterdam'; });
  if (amsterdam > 1) cities.splice(1, 0, cities.splice(amsterdam, 1)[0]);
  if (!rail.id) rail.id = 'dispatchCityChoices';
  var choose = document.createElement('button');
  choose.id = 'dispatchChooseCity'; choose.type = 'button'; choose.className = 'dispatch-tour-action';
  choose.hidden = true; choose.setAttribute('aria-controls', rail.id);
  choose.innerHTML = 'Choose your city <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>';
  plan.before(choose);
  var controls = document.createElement('div');
  controls.id = 'dispatchCityTour'; controls.className = 'dispatch-city-tour';
  controls.innerHTML = '<button id="dispatchCityTourToggle" type="button" aria-pressed="false" aria-controls="nextDestinationBoard">Play city tour</button><a href="/desks">All European desks</a>';
  centre.appendChild(controls);
  var toggle = byId('dispatchCityTourToggle'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var connection = navigator.connection, timer = 0, playing = false, interacted = false, away = false, index = 0;
  var cycles = 0, lastStop = null, lastView = document.body.dataset.view;
  var snapshot = null, initialQuery = new URLSearchParams(location.search);
  var observatory = document.body.dataset.dispatchComposition === 'observatory';
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  var peek = null, peekPaired = false, intentTimer = 0, pointerFocus = null;
  var note = null, defaultNote = 'Explore a city to see how BOOM can help.';
  if (observatory) {
    note = document.createElement('p'); note.id = 'dispatchPeekNote'; note.textContent = defaultNote;
    note.setAttribute('aria-live', 'polite'); note.setAttribute('aria-atomic', 'true');
    var promise = centre.querySelector('.hero-promise');
    if (promise) promise.after(note); else centre.appendChild(note);
  }
  var intentKeys = ['city','need','view','home','homes','place','moveIn','moveOut','stay','budget','people','type','layout','currency','saved'];
  var explicitEntry = !!location.hash || intentKeys.some(function (key) { return initialQuery.has(key); });
  var genericHeading = 'Real homes in Rome. Rental support across Europe.';

  function currentCity() {
    return cities.find(function (city) { return city.slug === document.body.dataset.europeCity; }) || cities[0];
  }
  function visible() {
    var rect = board.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
  }
  function permitted() {
    return !away && !document.hidden && !reduce.matches && !(connection && connection.saveData) &&
      pause.getAttribute('aria-pressed') !== 'true' && !motion.isPaused() &&
      document.body.dataset.view === 'home' && document.body.dataset.panoramaExpanded !== 'true' &&
      !document.body.dataset.globeFlight && visible();
  }
  function hasBrief() {
    return ['nextMoveIn','nextMoveOut','nextBudget','nextPeople','europeMoveIn','europeMoveOut','europeBudget','europePeople'].some(function (id) {
      var field = byId(id); return field && (field.value || (field.validity && field.validity.badInput));
    });
  }
  function updateControl() {
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.textContent = playing ? 'Pause city tour' : 'Play city tour';
    toggle.disabled = reduce.matches || !!(connection && connection.saveData) || pause.getAttribute('aria-pressed') === 'true' || motion.isPaused();
  }
  function showPresentation() {
    if (snapshot) return;
    var copies = [
      [hero.querySelector('.hero-pretitle'), 'Where next?'],
      [hero.querySelector('.hero-promise'), genericHeading],
      [hero.querySelector('.panorama-route-city'), 'Explore our cities'],
      [hero.querySelector('.panorama-route-scope'), 'Homes in Rome · Rental support in Europe']
    ];
    snapshot = { label: heading.getAttribute('aria-label'), copies: [], hidden: [] };
    copies.forEach(function (item) {
      if (!item[0]) return;
      snapshot.copies.push({ node:item[0], before:item[0].textContent, shown:item[1] });
      item[0].textContent = item[1];
    });
    [plan, byId('europeCitySignature')].forEach(function (node) {
      if (node) { snapshot.hidden.push({node:node, before:node.hidden}); node.hidden = true; }
    });
    heading.setAttribute('aria-label', genericHeading);
    choose.hidden = false; document.body.dataset.dispatchTour = 'playing';
  }
  function restorePresentation() {
    if (!snapshot) return;
    // A native city render may already have replaced the temporary words.
    // Never put a stale snapshot over fresh copy owned by that controller.
    snapshot.copies.forEach(function (item) { if (item.node.textContent === item.shown) item.node.textContent = item.before; });
    snapshot.hidden.forEach(function (item) { item.node.hidden = item.before; });
    if (heading.getAttribute('aria-label') === genericHeading) {
      if (snapshot.label === null) heading.removeAttribute('aria-label'); else heading.setAttribute('aria-label', snapshot.label);
    }
    snapshot = null; choose.hidden = true; delete document.body.dataset.dispatchTour;
    motion.setDestination(currentCity().name, {animate:false});
    if (globe && globe.previewCity) globe.previewCity(null, {animate:false});
  }
  function stop(reason) {
    lastStop = typeof reason === 'string' ? reason : reason && reason.type || 'state';
    interacted = true; clearTimeout(timer); timer = 0;
    clearIntent();
    playing = false; peekPaired = false;
    if (peek) {
      delete peek.button.dataset.dispatchPeek; peek = null;
      delete document.body.dataset.dispatchPeek;
      delete note.dataset.cityCode; note.textContent = defaultNote;
    }
    restorePresentation();
    choose.firstChild.nodeValue = 'Choose your city ';
    updateControl();
  }
  function clearIntent() { clearTimeout(intentTimer); intentTimer = 0; }
  function nativeCity(target) {
    var button = target && target.closest && target.closest('button[data-europe-city]');
    return button && rail.contains(button) ? cities.find(function (city) { return city.button === button; }) : null;
  }
  function showPeek(city, animate) {
    clearIntent();
    if (!observatory || !city || away || document.hidden || document.body.dataset.view !== 'home' ||
        document.body.dataset.panoramaExpanded === 'true' || document.body.dataset.globeFlight || !visible()) return;
    interacted = true; clearTimeout(timer); timer = 0;
    // One snapshot owns both presentations. Retargeting a peek never captures
    // temporary copy, and a native camera refusal never starts a board preview.
    if (playing) { playing = false; restorePresentation(); }
    if (peek) delete peek.button.dataset.dispatchPeek;
    peekPaired = !!(permitted() && globe && globe.previewCity && globe.previewCity(city.slug, {animate:animate}));
    if (peekPaired) {
      showPresentation();
      document.body.dataset.dispatchTour = 'preview';
      motion.setDestination(city.name, {animate:animate});
      choose.firstChild.nodeValue = 'Choose ' + city.name + ' ';
    } else restorePresentation();
    peek = city; city.button.dataset.dispatchPeek = 'true'; document.body.dataset.dispatchPeek = city.slug;
    note.dataset.cityCode = city.code;
    var destination = byId('clubDestinations');
    var source = destination && Array.from(destination.querySelectorAll('button[data-europe-city]')).find(function (button) { return button.dataset.europeCity === city.slug; });
    var capability = source && source.querySelector('strong + span');
    var text = 'Preview: ' + city.name + (capability ? ' · ' + capability.textContent.trim() : '');
    if (note.textContent !== text) note.textContent = text;
    updateControl();
  }
  function present(animate) {
    var city = cities[index];
    motion.setDestination(city.name, {animate:animate});
    if (globe && globe.previewCity) globe.previewCity(city.slug, {animate:animate});
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0;
      if (!playing || !permitted()) { stop('unavailable'); return; }
      index = (index + 1) % cities.length; cycles++; present(true); schedule();
    }, 5000);
  }
  function start() {
    if (peek || intentTimer) stop('control');
    if (!permitted()) { updateControl(); return; }
    index = cities.findIndex(function (city) { return city.slug === currentCity().slug; });
    cycles = 0; lastStop = null; playing = true; showPresentation(); present(false); updateControl(); schedule();
  }
  function control(target) { return target && target.closest && target.closest('#dispatchCityTourToggle,#dispatchChooseCity'); }
  toggle.addEventListener('click', function () { interacted = true; if (playing) stop('control'); else start(); });
  choose.addEventListener('click', function () {
    var candidate = peekPaired && peek;
    stop('choose');
    if (candidate) {
      candidate.button.click();
      // Choose disappears after commitment. Keep focus on the actual selected
      // control without treating this deliberate focus transfer as inspection.
      pointerFocus = candidate; candidate.button.focus({preventScroll:true}); pointerFocus = null;
      return;
    }
    var destination = rail.querySelector('button[aria-pressed="true"]') || rail.querySelector('button');
    if (destination) {
      destination.scrollIntoView({block:'nearest',behavior:'instant'});
      pointerFocus = nativeCity(destination); destination.focus({preventScroll:true}); pointerFocus = null;
    }
  });
  document.addEventListener('pointerdown', function (event) {
    pointerFocus = observatory && nativeCity(event.target);
    if (!control(event.target)) stop();
  }, true);
  document.addEventListener('keydown', function (event) {
    pointerFocus = null;
    if (control(event.target) && (event.key === 'Enter' || event.key === ' ')) return;
    // Let native Tab navigation reach the visible Choose action. Focusin will
    // transfer the preview or restore it when focus leaves the hero.
    if (observatory && peek && event.key === 'Tab' && hero.contains(event.target)) return;
    stop();
  }, true);
  document.addEventListener('focusin', function (event) {
    var city = observatory && nativeCity(event.target);
    if (city && city !== pointerFocus) { showPeek(city, false); return; }
    pointerFocus = null;
    if (!control(event.target)) stop();
  }, true);
  document.addEventListener('click', function (event) { if (!control(event.target)) stop(); }, true);
  if (observatory) document.addEventListener('pointercancel', stop, true);
  document.addEventListener('input', stop, true); document.addEventListener('change', stop, true);
  // Reading the changing board pauses it. Moving toward the fixed Choose city
  // action must never swap that action out from under the pointer.
  board.addEventListener('pointerenter', function (event) { if (event.pointerType !== 'touch' && !peek && !intentTimer) stop('board-hover'); });
  if (observatory) {
    rail.addEventListener('pointerover', function (event) {
      if (event.pointerType === 'touch' || !finePointer.matches || event.buttons) return;
      var city = nativeCity(event.target);
      if (!city || city.button.contains(event.relatedTarget) || peek === city) return;
      clearIntent();
      intentTimer = setTimeout(function () { intentTimer = 0; showPeek(city, true); }, 120);
    });
    rail.addEventListener('pointerout', function (event) {
      var city = nativeCity(event.target);
      if (city && !city.button.contains(event.relatedTarget)) clearIntent();
    });
    hero.addEventListener('pointerleave', function (event) { if (event.pointerType !== 'touch' && (peek || intentTimer)) stop('hero-leave'); });
    finePointer.addEventListener('change', function () { if (peek || intentTimer) stop('pointer'); });
  }
  window.addEventListener('scroll', stop, {passive:true});
  window.addEventListener('wheel', stop, {passive:true});
  window.addEventListener('popstate', stop);
  window.addEventListener('hashchange', stop);
  window.addEventListener('boom:flight-view', function (event) { if (!event.detail || event.detail.view !== 'home') stop('view'); });
  window.addEventListener('pagehide', function () { away = true; stop(); });
  window.addEventListener('pageshow', function () { away = false; updateControl(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else updateControl(); });
  reduce.addEventListener('change', stop);
  if (connection && connection.addEventListener) connection.addEventListener('change', stop);
  new MutationObserver(function () { if (!permitted()) stop(); else updateControl(); }).observe(pause, {attributes:true,attributeFilter:['aria-pressed']});
  new MutationObserver(function (records) {
    // The catalogue's initial load repaints the same home. That is not a
    // visitor action or a view change, and must not cancel an untouched tour.
    var changed = records.some(function (record) { return record.attributeName !== 'data-view' || document.body.dataset.view !== lastView; });
    lastView = document.body.dataset.view; if (changed) stop('journey');
  }).observe(document.body, {attributes:true,attributeFilter:['data-europe-city','data-view','data-panorama-expanded','data-globe-flight']});
  var atlas = byId('boomGlobeMount');
  if (atlas) new MutationObserver(function (records) {
    // The renderer also cancels its own preview for direct camera/API actions.
    // Its native lifecycle remains authoritative for the paired Solari tour.
    if ((!playing && !peekPaired) || atlas.dataset.globePreview) return;
    if (records.some(function (record) { return record.attributeName === 'data-globe-preview'; })) { stop('camera'); return; }
    // Geography and first visibility can arrive after DOMContentLoaded. Pair
    // that first ready frame once, without a polling timer or a city commit.
    // A denied manual peek stays a static note: readiness must not move a
    // camera later, after the visitor's intent has already passed.
    if (playing && globe && globe.previewCity) globe.previewCity(cities[index].slug, {animate:false});
  }).observe(atlas, {attributes:true,attributeFilter:['data-globe-preview','data-globe-state','data-globe-motion']});
  if (window.IntersectionObserver) new IntersectionObserver(function (entries) { if (!entries[0].isIntersecting) stop(); }).observe(board);
  if (window.ResizeObserver) new ResizeObserver(function () { if ((playing || peek || intentTimer) && !visible()) stop(); }).observe(board);

  // Debugging is read-only: the original city, forms and history remain owned
  // by Europe/Next. No timer is left behind after the first interruption.
  window.BoomDispatchTour = { state:function () { return {playing:playing,timerPending:!!(timer || intentTimer),intentPending:!!intentTimer,peek:peek?peek.slug:null,peekPaired:peekPaired,city:playing?cities[index].slug:null,cycles:cycles,order:cities.map(function (city) { return city.slug; }),lastStop:lastStop,interacted:interacted,explicitEntry:explicitEntry}; } };
  function autoStart() {
    updateControl();
    if (!interacted && !explicitEntry && !hasBrief() && scrollY < 2 &&
        (!document.activeElement || document.activeElement === document.body)) start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoStart, {once:true});
  else autoStart();
})();
