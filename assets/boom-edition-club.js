/* Club edition: a different composition over the existing public journey. */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('edition') !== 'club') return;
  if (document.body.dataset.direction !== 'club' || document.body.dataset.edition === 'club') return;
  var directions = window.BoomFlightDirections;
  var hero = document.getElementById('nextHero');
  var ticket = document.getElementById('directionClubTicket');
  var planner = document.querySelector('.europe-planner');
  if (!directions || !hero || !ticket || !planner) return;
  document.body.dataset.edition = 'club';

  // Move the original forms, retaining their fields, listeners and validation.
  planner.classList.add('edition-club-runway');
  hero.insertBefore(planner, hero.querySelector('.hero-bottom'));
  var mast = document.createElement('div');
  mast.className = 'edition-runway-head';
  mast.innerHTML = '<span>YOUR ARRIVAL PLAN</span><span>One brief. A real person on your side.</span>';
  planner.prepend(mast);

  var stage = document.createElement('div');
  stage.className = 'edition-home-stage';
  stage.innerHTML = '<div class="edition-home-placeholder"><span>THE ROME COLLECTION</span><p>A place to make your own.</p><a href="/apartments" data-view="apartments">Explore the homes <span aria-hidden="true">↗</span></a></div><a class="edition-home-feature" hidden><img class="edition-home-photo" alt="" decoding="async" fetchpriority="high"><span class="edition-home-caption"><span class="edition-home-meta"></span><strong class="edition-home-name"></strong><span class="edition-home-bottom"><span class="edition-home-price"></span><span class="edition-home-open">Step inside <span aria-hidden="true">↗</span></span></span></span></a>';
  ticket.appendChild(stage);
  var planLink = document.createElement('a');
  planLink.className = 'edition-plan-link';
  planLink.href = '#nextSearch';
  planLink.innerHTML = 'Plan your move <span aria-hidden="true">↓</span>';
  hero.querySelector('.hero-promise').insertAdjacentElement('afterend', planLink);
  var feature = stage.querySelector('.edition-home-feature');
  var photo = feature.querySelector('img');
  var chosenId = '', failedImage = '';
  var preferred = ['Kz9bXztv5QXmQrNhAcoU', 'esFhjFMVfZtkIrhkx0PR', '5QAKCvswE3HN9nuuG82S'];
  var sourceRender = directions.render;
  directions.render = function (context) {
    sourceRender.apply(this, arguments);
    var homes = context.catalogue || [];
    var eligible = homes.filter(function (c) { return c.lane !== 'closed' && c.image && c.image !== failedImage; });
    var home = preferred.map(function (id) { return eligible.find(function (c) { return c.id === id; }); }).find(Boolean) || eligible[0];
    if (!home) { feature.hidden = true; stage.dataset.ready = 'false'; return; }
    if (chosenId !== home.id || photo.getAttribute('src') !== home.image) {
      chosenId = home.id;
      photo.src = home.image;
      photo.alt = home.name + ' — photo from the BOOM catalogue';
      feature.style.setProperty('--edition-photo-focus', home.id === 'Kz9bXztv5QXmQrNhAcoU' ? '50% 68%' : '50% 50%');
    }
    feature.href = context.url('detail', home.id);
    feature.dataset.home = home.id;
    feature.setAttribute('aria-label', 'Explore ' + home.name);
    feature.querySelector('.edition-home-meta').textContent = [home.zone, home.status].filter(Boolean).join(' · ');
    feature.querySelector('.edition-home-name').textContent = home.name;
    feature.querySelector('.edition-home-price').textContent = home.price == null ? 'Price on request' : '€' + Number(home.price).toLocaleString('en-GB') + ' / month';
    feature.hidden = false;
    stage.dataset.ready = 'true';
  };
  photo.addEventListener('error', function () { failedImage = photo.getAttribute('src'); feature.hidden = true; stage.dataset.ready = 'false'; });

  // The long European destinations fit the actual heading column, including the
  // architectural signature beside it. No replacement of the Solari engine.
  var fitFrame = 0;
  function fitDestination() {
    fitFrame = 0;
    var board = document.getElementById('nextDestinationBoard');
    var heading = document.getElementById('nextHeroTitle');
    var letters = (board.getAttribute('aria-label') || 'ROME').length;
    var width = heading.clientWidth;
    if (width > 0) board.style.setProperty('--europe-board-size', Math.max(26, Math.min(innerWidth < 650 ? 84 : 132, (width - 8) / (letters * .91))) + 'px');
  }
  function queueFit() { if (!fitFrame) fitFrame = requestAnimationFrame(fitDestination); }
  new MutationObserver(queueFit).observe(document.body, {attributes:true,attributeFilter:['data-europe-city']});
  window.addEventListener('resize', queueFit, {passive:true});

  // The catalogue opens with its homes and map. The existing comparison remains
  // the destination of Find my balance, with its facts and controls untouched.
  var discovery = document.getElementById('nextDiscovery');
  var balance = document.getElementById('nextBalance');
  if (discovery && balance) discovery.insertAdjacentElement('afterend', balance);

  // Pointer feedback has no autonomous clock. The original motion control and
  // reduced-motion preference govern it along with the Solari field.
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var fine = matchMedia('(hover: hover) and (pointer: fine)');
  var tilted = null, frame = 0, point = null;
  function resetTilt() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; point = null;
    if (tilted) { tilted.style.removeProperty('--edition-rx'); tilted.style.removeProperty('--edition-ry'); }
    tilted = null;
  }
  function motionAllowed() { return !reduce.matches && fine.matches && !document.hidden && hero.dataset.nextMotion === 'running'; }
  function syncMotion() {
    document.body.dataset.editionMotion = motionAllowed() ? 'active' : 'still';
    if (!motionAllowed()) resetTilt();
  }
  function paintTilt() {
    frame = 0;
    if (!tilted || !point || !motionAllowed()) return;
    var box = tilted.getBoundingClientRect();
    if (!box.width || !box.height) return;
    tilted.style.setProperty('--edition-rx', ((.5 - (point.y - box.top) / box.height) * 2).toFixed(2) + 'deg');
    tilted.style.setProperty('--edition-ry', (((point.x - box.left) / box.width - .5) * 2).toFixed(2) + 'deg');
  }
  document.addEventListener('pointermove', function (event) {
    if (!motionAllowed()) return;
    var surface = event.target.closest('.edition-home-feature, .next-ticket');
    if (!surface) { resetTilt(); return; }
    if (surface !== tilted) { resetTilt(); tilted = surface; }
    point = {x:event.clientX,y:event.clientY};
    if (!frame) frame = requestAnimationFrame(paintTilt);
  }, {passive:true});
  document.addEventListener('pointerout', function (event) {
    if (tilted && (!event.relatedTarget || !tilted.contains(event.relatedTarget))) resetTilt();
  }, {passive:true});
  new MutationObserver(syncMotion).observe(hero, {attributes:true,attributeFilter:['data-next-motion']});
  reduce.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pagehide', resetTilt);
  syncMotion();
  // Europe computes the Solari cell size from the actual, recomposed column.
  requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); queueFit(); });
})();
