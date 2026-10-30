/* Three reversible compositions over the same public catalogue and journey. */
(function () {
  'use strict';
  var direction = new URLSearchParams(location.search).get('direction');
  if (!['atlas', 'residence', 'club'].includes(direction)) return;
  document.body.dataset.direction = direction;
  var hero = document.getElementById('nextHero');
  var centre = hero.querySelector('.hero-centre');
  var search = document.getElementById('nextSearch');
  var skyline = document.querySelector('.skyline-chapter');
  var feature;
  if (direction === 'atlas') {
    var map = document.getElementById('nextHomeMap');
    hero.insertBefore(map, centre);
    var copy = document.createElement('div');
    copy.className = 'direction-atlas-copy';
    copy.innerHTML = '<p class="eyebrow">YOUR CITY, WITHIN REACH</p><h2>Your life.<br>On the map.</h2><p>Choose a home around the places that matter.</p><button type="button" class="text-button" data-guide>Find my balance <span aria-hidden="true">↗</span></button>';
    copy.appendChild(document.querySelector('.city-caption'));
    hero.appendChild(copy);
    hero.appendChild(search);
    skyline.hidden = true;
    centre.querySelector('.hero-pretitle').textContent = 'SKYLINE /';
  } else if (direction === 'residence') {
    feature = document.createElement('div');
    feature.id = 'directionResidenceHero'; feature.hidden = true;
    feature.innerHTML = '<img class="residence-hero-image" alt="" decoding="async" fetchpriority="high"><a class="residence-feature"><span class="residence-feature-kicker"></span><strong class="residence-feature-name"></strong><span class="residence-feature-bottom"><span class="residence-feature-price"></span><span class="residence-feature-arrow" aria-hidden="true">↗</span></span></a>';
    hero.insertBefore(feature, centre);
    centre.querySelector('.hero-pretitle').textContent = 'A home with room for you.';
    centre.querySelector('.hero-promise').textContent = 'Discover a place to make your own. BOOM takes care of the move.';
    skyline.before(document.querySelector('.homes-chapter'));
    document.querySelector('.homes-chapter .eyebrow').textContent = '01 / A PLACE TO CALL YOURS';
    skyline.querySelector('.eyebrow').textContent = '02 / YOUR CITY, CONNECTED';
  } else {
    var ticket = document.createElement('div'); ticket.id = 'directionClubTicket';
    hero.insertBefore(ticket, hero.querySelector('.hero-bottom'));
    ticket.appendChild(centre); ticket.appendChild(search);
    centre.querySelector('.eyebrow').innerHTML = '<span class="signal"></span> BOOM / YOUR ARRIVAL PASS';
    centre.querySelector('.hero-promise').textContent = 'Your home. Your people on the ground.';
    document.querySelector('#nextPeople option[value=""]').textContent = 'Choose';
  }
  var chosen, atlasFeatured = false;
  function render(context) {
    var homes = context.catalogue;
    document.querySelectorAll('a[data-view]').forEach(function(a){a.href=context.url(a.dataset.view);});
    document.querySelectorAll('a[data-services]').forEach(function(a){a.href=context.url('home')+'#services';});
    if (!chosen && homes.length) {
      chosen = homes.find(function(c){return c.id === 'Kz9bXztv5QXmQrNhAcoU' && c.lane !== 'closed' && c.image;}) || homes.find(function(c){return c.lane !== 'closed' && c.image;});
    }
    if (feature && chosen) {
      var img = feature.querySelector('img'), link = feature.querySelector('a');
      if (img.getAttribute('src') !== chosen.image) img.src = chosen.image;
      img.alt = chosen.name + ' — image from the BOOM catalogue';
      feature.style.setProperty('--residence-focus',chosen.id === 'Kz9bXztv5QXmQrNhAcoU' ? '50% 68%' : '50% 50%');
      feature.style.setProperty('--residence-image-scale',chosen.id === 'Kz9bXztv5QXmQrNhAcoU' ? '1.14' : '1');
      link.href = context.url('detail', chosen.id); link.dataset.home = chosen.id;
      feature.querySelector('.residence-feature-kicker').textContent = (chosen.zone || 'Rome') + ' · ' + chosen.status;
      feature.querySelector('.residence-feature-name').textContent = chosen.name;
      feature.querySelector('.residence-feature-price').textContent = chosen.price == null ? 'Price on request' : '€' + chosen.price.toLocaleString('en-GB') + ' / month';
      feature.hidden = false;
    }
    if(direction === 'atlas' && chosen && !atlasFeatured) {
      atlasFeatured = true;
      var caption = document.querySelector('.city-caption'), selected = document.createElement('span');
      selected.className = 'city-selected';
      var thumb = document.createElement('img'); thumb.src = chosen.image; thumb.alt = '';
      var label = document.createElement('span'), price = document.createElement('small');
      label.textContent = chosen.name;
      price.textContent = (chosen.zone || 'Rome') + ' · ' + (chosen.price == null ? 'Price on request' : '€' + chosen.price.toLocaleString('en-GB') + ' / month');
      label.appendChild(price); selected.append(thumb,label);
      var explore = document.createElement('a'); explore.href = context.url('detail',chosen.id); explore.dataset.home = chosen.id; explore.textContent = 'Explore this home ↗';
      caption.replaceChildren(selected,explore);
    }
    document.querySelectorAll('a[data-home]').forEach(function(a){a.href=context.url('detail',a.dataset.home);});
    // Only public identifiers leave the frame. Dates and household stay inside it.
    if (parent !== window) parent.postMessage({type:'boom-design-state', direction:direction, view:context.state.view, home:context.state.home || (chosen && chosen.id) || ''}, location.origin);
  }
  window.BoomFlightDirections = {name:direction, defaultLayout:direction === 'atlas' ? 'skyline' : 'gallery', render:render};
})();
