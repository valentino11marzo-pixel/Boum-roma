/* PROSPETTIVA — a reversible composition over the existing BOOM journey.
 * No catalogue, map, application or saved-state implementation lives here. */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('edition') !== 'perspective' || document.body.dataset.direction !== 'club') return;
  var directions = window.BoomFlightDirections, hero = document.getElementById('nextHero');
  if (!directions || !hero) return;
  document.body.dataset.edition = 'perspective';
  var byId = function (id) { return document.getElementById(id); };
  var ticket = byId('directionClubTicket'), centre = hero.querySelector('.hero-centre');
  var planner = hero.querySelector('.europe-planner'), scene = document.querySelector('.next-city-scene');
  if (!ticket || !centre || !planner || !scene) return;

  var opening = document.createElement('div');
  opening.className = 'perspective-opening';
  opening.innerHTML = '<div><p class="perspective-index">BOOM / HOMES &amp; EVERYDAY LIFE</p><h2>See the home.<br><span>Feel the city.</span></h2></div><div class="perspective-opening-note"></div>';
  hero.insertBefore(opening, ticket);
  var note = opening.querySelector('.perspective-opening-note');
  note.append(centre.querySelector('.hero-promise'), byId('europeCitySignature'));

  var cover = document.createElement('div');
  cover.className = 'perspective-cover';
  cover.innerHTML = '<a class="perspective-home-image" aria-label="Explore the featured home" hidden><img alt="" decoding="async" fetchpriority="high"></a><div class="perspective-photo-wait" role="status">Opening the Rome catalogue.</div><div class="perspective-photo-label"><span>01 / FROM THE ROME CATALOGUE</span><a class="perspective-feature-name" hidden></a><p class="perspective-feature-facts"></p></div>';
  var featurePhoto = cover.querySelector('.perspective-home-image'), featureImage = featurePhoto.querySelector('img'), featureWait = cover.querySelector('.perspective-photo-wait');
  featureImage.addEventListener('load', function () { cover.dataset.imageStatus = 'ready'; featurePhoto.hidden = false; featureWait.hidden = true; });
  featureImage.addEventListener('error', function () {
    cover.dataset.imageStatus = 'error'; featurePhoto.hidden = true; featureWait.hidden = false;
    featureWait.textContent = 'The photograph is unavailable. Open the home details above.';
  });
  cover.appendChild(scene);
  var aside = document.createElement('div');
  aside.className = 'perspective-brief';
  ticket.replaceChildren(cover, aside);
  aside.append(centre, planner);
  centre.classList.add('perspective-arrival');
  centre.insertBefore(byId('nextSolariField'), centre.firstChild);
  var arrivalLabel = document.createElement('p');
  arrivalLabel.className = 'perspective-arrival-label';
  arrivalLabel.textContent = 'YOUR CITY / YOUR STARTING POINT';
  centre.insertBefore(arrivalLabel, centre.querySelector('h1'));
  centre.appendChild(byId('nextMotionToggle'));
  scene.classList.add('perspective-city-window');
  scene.querySelector('.city-heading>span:last-child').textContent = 'A LIVE VIEW';

  // The original home rail remains a second, browsable view of the same catalogue.
  var skylineChapter = document.querySelector('.skyline-chapter');
  skylineChapter.querySelector('.chapter-aside>p').textContent = 'Choose a home. Then see how its neighbourhood fits your everyday life.';
  byId('nextSkyTitle').innerHTML = 'Different homes.<br><em>New perspectives.</em>';
  byId('nextHomesTitle').textContent = 'The Rome collection';

  // A search opens the working map/list first. The explicit balance action still
  // reaches its original section, now the next step beneath the workspace.
  var discovery = byId('nextDiscovery'), balance = byId('nextBalance');
  discovery.insertAdjacentElement('afterend', balance);
  var planNav = document.createElement('nav');
  planNav.className = 'perspective-plan-nav';
  planNav.setAttribute('aria-label', 'Your home search');
  planNav.innerHTML = '<a href="#nextDiscovery"><span>01</span> Explore the homes</a><a href="#nextBalance"><span>02</span> Compare the trade-offs</a>';
  byId('nextApartments').querySelector('.next-filter-bar').insertAdjacentElement('afterend', planNav);

  var featured = null, previousRender = directions.render;
  function revealMap() {
    byId('nextHomeMap').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-perspective-locate]');
    if (button && window.BoomNextMap) { window.BoomNextMap.select(button.dataset.perspectiveLocate); revealMap(); }
    else if (event.target.closest('[data-europe-locate]')) revealMap();
  });
  function connectHomeCards() {
    byId('nextHomeRail').querySelectorAll('[data-home-id]').forEach(function (card) {
      if (card.querySelector('[data-perspective-locate]')) return;
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'perspective-card-map';
      button.dataset.perspectiveLocate = card.dataset.homeId;
      button.textContent = 'Show on Skyline ↗';
      button.setAttribute('aria-label', 'Show ' + card.querySelector('h3').textContent + ' on Skyline');
      card.querySelector('.next-card-info').appendChild(button);
    });
  }
  function showFeature(context) {
    if (!featured && context.catalogue.length) {
      var preferred = ['Kz9bXztv5QXmQrNhAcoU', 'esFhjFMVfZtkIrhkx0PR', '5QAKCvswE3HN9nuuG82S'];
      for (var i = 0; i < preferred.length && !featured; i++) featured = context.catalogue.find(function (c) { return c.id === preferred[i] && c.lane !== 'closed' && c.image; });
      featured = featured || context.catalogue.find(function (c) { return c.lane !== 'closed' && c.image; });
    }
    if (!featured) return;
    var photo = cover.querySelector('.perspective-home-image'), name = cover.querySelector('.perspective-feature-name'), img = photo.querySelector('img');
    cover.dataset.featuredHome = featured.id;
    if (img.getAttribute('src') !== featured.image) {
      cover.dataset.imageStatus = 'loading'; featureWait.textContent = 'Opening the photograph.';
      img.src = featured.image;
    }
    img.alt = featured.name + ' — from the BOOM catalogue';
    [photo, name].forEach(function (link) { link.href = context.url('detail', featured.id); link.dataset.home = featured.id; });
    name.hidden = false;
    photo.setAttribute('aria-label', 'Explore ' + featured.name);
    name.textContent = featured.name + ' ↗';
    cover.querySelector('.perspective-feature-facts').textContent = [featured.zone || 'Rome', featured.price == null ? 'Price on request' : '€' + featured.price.toLocaleString('en-GB') + ' / month', featured.area == null ? null : featured.area + ' m²'].filter(Boolean).join(' · ');
    photo.hidden = cover.dataset.imageStatus !== 'ready';
    featureWait.hidden = cover.dataset.imageStatus === 'ready';
  }
  directions.render = function (context) {
    previousRender(context);
    showFeature(context);
    connectHomeCards();
    if (context.state.view === 'apartments') byId('nextAptsTitle').textContent = 'Your Rome, in perspective.';
    if (context.state.view === 'detail') {
      var detail = byId('nextDetailContent'), everyday = detail.querySelector('.detail-everyday'), body = detail.querySelector('.detail-body');
      if (everyday && body) body.insertAdjacentElement('afterend', everyday);
    }
  };
})();
