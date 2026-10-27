/* BOOM Flight · Skyline. Presentation/controller over the existing MapLibre,
 * BOOM_MAPPA and Pendolare engines. No catalogue, routing or personal-data store. */
(function () {
  'use strict';
  var api = null, orbit = 0, lastFrame = 0, restoreFocus = null;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var query = new URLSearchParams(location.search);
  try{if(document.documentElement.classList.contains('emb')&&window.parent!==window&&window.parent.location.origin===location.origin)document.documentElement.classList.add('sky-consent-parent');}catch(_){}
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var money = function (v) { return '€' + Math.round(Number(v)).toLocaleString('en-US'); };
  var screen = el('div', 'sky-flight');
  screen.innerHTML = '<div class="sky-flight-heading"><span>ROM / YOUR CITY, IN VIEW</span><h1>Skyline<span> by BOOM</span></h1><p>Choose a home. See how your life connects.</p></div>'
    + '<div class="sky-flight-tools" role="group" aria-label="Map view"><div class="sky-view-toggle"><button type="button" id="sky2d" aria-pressed="false" disabled>2D</button><button type="button" id="sky3d" aria-pressed="true" disabled>3D</button></div><button type="button" id="skyOrbit" aria-pressed="false" disabled>Orbit</button><button type="button" id="skyReset" disabled>Reset view</button><button type="button" id="skyShare" class="sky-share-button" disabled>Share Skyline ↗</button></div>'
    + '<div class="sky-share-context" id="skyShared" hidden><span>A shared view of Rome</span><button type="button" id="skyAllHomes">Explore all homes ↗</button></div>'
    + '<aside class="sky-flight-home" id="skyHome" aria-label="Selected apartment" hidden><button type="button" class="sky-home-close" id="skyHomeClose" aria-label="Close selected apartment">×</button><div class="sky-home-media"><img id="skyHomeImage" alt="" hidden><button type="button" id="skyHomeSave" class="sky-home-save" aria-pressed="false">Save home</button></div><div class="sky-home-copy"><span class="sky-home-zone" id="skyHomeZone"></span><h2 id="skyHomeName"></h2><p class="sky-home-precision" id="skyHomePrecision"></p><div class="sky-home-bottom"><span class="sky-home-price" id="skyHomePrice"></span><a id="skyHomeLink" href="/apartments">Explore home ↗</a></div></div></aside>'
    + '<p class="sky-flight-status" id="skyStatus" role="status" aria-live="polite"></p>';
  document.body.appendChild(screen);

  var share = el('dialog', 'sky-share-dialog');
  share.id = 'skyShareDialog';
  share.setAttribute('aria-labelledby', 'skyShareTitle');
  share.innerHTML = '<button type="button" class="sky-dialog-close" id="skyShareClose" aria-label="Close sharing">×</button><span class="sky-share-label">BOOM / SKYLINE PASS</span><h2 id="skyShareTitle">Could this be<br>your Rome?</h2><p>Send this view, selected home and budget. Include a public destination below to share its commute filter. Your private places stay on your device.</p><label class="sky-share-place"><input type="checkbox" id="skySharePlace"> Include the public destination: <strong id="skyPlaceName">Termini</strong></label><label class="sky-link-label" for="skyShareURL">Your Skyline link</label><input id="skyShareURL" class="sky-share-url" readonly><div class="sky-share-actions"><button type="button" id="skyCopyLink">Copy link</button><button type="button" id="skyNativeShare" hidden>Share…</button></div><p id="skyShareResult" class="sky-share-result" role="status"></p>';
  document.body.appendChild(share);

  function status(text) { $('skyStatus').textContent = text; }
  function stopOrbit() {
    if (orbit) cancelAnimationFrame(orbit);
    orbit = 0; lastFrame = 0;
    $('skyOrbit').setAttribute('aria-pressed', 'false');
    $('skyOrbit').textContent = 'Orbit';
  }
  function frame(time) {
    if (!api || document.hidden || reduced.matches) return stopOrbit();
    var elapsed = lastFrame ? Math.min(80, time - lastFrame) : 0;
    lastFrame = time;
    api.map.jumpTo({ bearing: api.map.getBearing() + elapsed * .004 });
    orbit = requestAnimationFrame(frame);
  }
  function viewButtons() {
    if (!api) return;
    var three = api.map.getPitch() > 10;
    $('sky2d').setAttribute('aria-pressed', String(!three));
    $('sky3d').setAttribute('aria-pressed', String(three));
  }
  function setView(three) {
    if (!api) return;
    stopOrbit(); api.map.stop();
    api.map.easeTo({ pitch: three ? 55 : 0, bearing: three ? api.map.getBearing() : 0, duration: reduced.matches ? 0 : 650, essential: false });
    viewButtons();
  }
  function savedPath() {
    var F=window.BOOM_FLIGHT, selected=api&&api.selected();
    return F&&selected?F.listing(selected.__id):null;
  }
  function readSaved() {
    var F=window.BOOM_FLIGHT;if(!F)return null;
    try{return F.saved(localStorage.getItem('boomSalvate'));}catch(_){return null;}
  }
  function syncSaved() {
    var button=$('skyHomeSave'),path=savedPath(),paths=readSaved();
    var saved=!!(path&&paths&&paths.indexOf(path)>=0);
    button.disabled=!path;
    button.setAttribute('aria-pressed',String(saved));
    button.setAttribute('aria-label',saved?'Remove saved home':'Save this home');
    button.textContent=saved?'Saved ✓':'Save home';
  }
  function toggleSaved() {
    // Read at the gesture: another page/frame may have changed the shortlist
    // since this map card was selected. boomSalvate remains the only store.
    var path=savedPath(),paths=readSaved();
    if(!path||!paths){status('Saved homes are unavailable on this browser right now.');return;}
    var wasSaved=paths.indexOf(path)>=0;
    var next=wasSaved?paths.filter(function(p){return p!==path;}):[path].concat(paths).slice(0,100);
    try{localStorage.setItem('boomSalvate',JSON.stringify(next));}
    catch(_){status('This browser could not save the home. Please try again.');return;}
    syncSaved();
    window.dispatchEvent(new CustomEvent('boom:move'));
    status(wasSaved?'Home removed from Your move.':'Home saved to Your move.');
  }
  function selection(detail) {
    stopOrbit();
    var l = detail && detail.listing, card = $('skyHome');
    if (!l) { card.hidden = true; document.documentElement.classList.remove('sky-has-home'); return; }
    card.hidden = false; document.documentElement.classList.add('sky-has-home');
    $('skyHomeName').textContent = l.name || l.title || 'Apartment';
    $('skyHomeZone').textContent = l.zone || l.neighborhood || 'ROME';
    var precision = detail.precision;
    $('skyHomePrecision').textContent = precision === 'exact' ? 'Address located · building heights are illustrative' : precision === 'street' ? 'Street located · exact entrance to confirm' : 'Approximate area · exact address to confirm';
    var photo = String(l.image || (l.images && l.images[0]) || '');
    var image = $('skyHomeImage'); image.hidden = true;
    if (/^https:\/\//i.test(photo) || /^\/(?!\/)/.test(photo)) { image.src = photo; image.alt = l.name || 'Apartment'; image.hidden = false; }
    var price = $('skyHomePrice'); price.replaceChildren();
    var number = Number(l.price);
    if (isFinite(number) && number > 0) {
      var board = el('span', 'sky-price-board'); board.setAttribute('aria-label', money(number) + ' per month');
      Array.from(money(number)).forEach(function (c) { var cell = el('span', 'sky-price-cell', c); cell.setAttribute('aria-hidden', 'true'); board.appendChild(cell); });
      price.appendChild(board); price.appendChild(el('small', '', ' / month'));
    } else price.textContent = 'Price on request';
    $('skyHomeLink').href = '/listing/' + encodeURIComponent(String(l.id));
    syncSaved();
    status('Selected ' + (l.name || 'apartment') + '. Explore its connections in the city panel.');
  }
  function validCamera(raw) {
    var a = String(raw || '').split(',').map(Number);
    if (a.length !== 5 || !a.every(Number.isFinite)) return null;
    if (a[0] < 11.8 || a[0] > 13.2 || a[1] < 41.4 || a[1] > 42.3 || a[2] < 9 || a[2] > 17 || Math.abs(a[3]) > 180 || a[4] < 0 || a[4] > 60) return null;
    return { center: a.slice(0, 2), zoom: a[2], bearing: a[3], pitch: reduced.matches ? 0 : a[4] };
  }
  function shareURL() {
    if (!api) return '';
    var url = new URL('/skyline', location.origin), m = api.map, center = m.getCenter();
    url.searchParams.set('view', [center.lng.toFixed(4), center.lat.toFixed(4), m.getZoom().toFixed(2), m.getBearing().toFixed(1), m.getPitch().toFixed(1)].join(','));
    var selected = api.selected(); if (selected) url.searchParams.set('home', selected.__id);
    var filter = api.filter();
    var known = new Set(api.markers.map(function (mk) { return mk.getElement().__id; }));
    var homes = filter.homes.filter(function (id) { return known.has(id); }).slice(0, 30);
    if (homes.length) url.searchParams.set('homes', homes.join(','));
    if (filter.budget) url.searchParams.set('budget', String(filter.budget));
    var destination = $('qfMeta');
    var includePlace=$('skySharePlace').checked && destination && window.BOOM_MAPPA && BOOM_MAPPA.METE.some(function (p) { return p.slug === destination.value; });
    if(includePlace)url.searchParams.set('place', destination.value);
    var active = document.querySelector('#qfMin button.on');
    if (active && includePlace) url.searchParams.set('minutes', active.dataset.m);
    return url.href;
  }
  function updateShare() { $('skyShareURL').value = shareURL(); }
  function openShare() {
    if (!api) return;
    stopOrbit(); restoreFocus = document.activeElement;
    var d = $('qfMeta'); $('skyPlaceName').textContent = d && d.selectedOptions.length ? d.selectedOptions[0].textContent : 'Termini';
    $('skySharePlace').checked = false; $('skyShareResult').textContent = ''; updateShare();
    share.showModal(); $('skyCopyLink').focus();
  }
  function closeShare() { share.close(); if (restoreFocus) restoreFocus.focus(); }
  function attach(a) {
    if (!a || api) return; api = a;
    ['sky2d', 'sky3d', 'skyReset', 'skyShare'].forEach(function (id) { $(id).disabled = false; });
    $('skyOrbit').disabled = reduced.matches;
    // The stable selected-home card replaces the marker popover; its contents
    // remain in core for older/no-controller clients and generator compatibility.
    api.markers.forEach(function (m) { m.setPopup(null); });
    if(window.BOOM_FLIGHT_MAP)BOOM_FLIGHT_MAP.dress(api.map,'sky-3d');
    viewButtons();
    ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach(function (event) { api.map.on(event, function (e) { if (e.originalEvent) stopOrbit(); }); });
    api.map.on('pitchend', viewButtons);
    api.map.getCanvas().addEventListener('pointerdown', stopOrbit, { passive: true });
    api.map.getCanvas().addEventListener('wheel', stopOrbit, { passive: true });
    var camera = validCamera(query.get('view'));
    if (camera) { api.map.stop(); api.map.jumpTo(camera); }
    if (query.get('place')) {
      api.selectPublicPlace(query.get('place'));
      var minutes = query.get('minutes');
      if (['15', '25', '40'].indexOf(minutes) >= 0) { var btn = document.querySelector('#qfMin button[data-m="' + minutes + '"]'); if (btn) btn.click(); }
    }
    if (query.get('homes')) $('skyShared').hidden = false;
    api.shareURL = shareURL;
    if (api.selected()) selection({ listing: api.selected().__listing, precision: api.selected().__precision });
    // A share camera is explicit; preserve it after an incoming home selection.
    if (camera && query.get('home')) { api.select(query.get('home'), { fly: false }); api.map.stop(); api.map.jumpTo(camera); }
    status('Rome is ready. Choose a price pin to explore a home.');
  }
  var quadHead=$('quadCapo');
  if(quadHead){
    quadHead.setAttribute('tabindex','0');quadHead.setAttribute('role','button');quadHead.setAttribute('aria-label','Show or hide city connections');
    quadHead.addEventListener('click',function(e){if(e.target.closest('button'))return;if((innerWidth<=640&&$('quad').classList.contains('scelta'))||document.documentElement.classList.contains('emb')){$('quad').classList.toggle('sky-expanded');quadHead.setAttribute('aria-expanded',String($('quad').classList.contains('sky-expanded')));}});
    quadHead.addEventListener('keydown',function(e){if(e.target===quadHead&&(e.key==='Enter'||e.key===' ')){e.preventDefault();quadHead.click();}});
  }
  $('sky2d').addEventListener('click', function () { setView(false); });
  $('sky3d').addEventListener('click', function () { setView(true); });
  $('skyOrbit').addEventListener('click', function () {
    if (!api || reduced.matches) return;
    if (orbit) return stopOrbit();
    api.map.stop(); $('skyOrbit').setAttribute('aria-pressed', 'true'); $('skyOrbit').textContent = 'Stop orbit';
    orbit = requestAnimationFrame(frame);
  });
  $('skyReset').addEventListener('click', function () { if (api) { stopOrbit(); api.clear(); api.reset(); } });
  $('skyShare').addEventListener('click', openShare);
  $('skyHomeSave').addEventListener('click',toggleSaved);
  window.addEventListener('storage',function(e){if(e.key==='boomSalvate'||e.key===null)syncSaved();});
  window.addEventListener('boom:move',syncSaved);
  window.addEventListener('load',syncSaved);
  $('skyHomeClose').addEventListener('click', function () { if (api) api.clear(); });
  $('skyHomeImage').addEventListener('error', function () { this.hidden = true; });
  $('skyAllHomes').addEventListener('click', function () { location.assign('/skyline'); });
  $('skyShareClose').addEventListener('click', closeShare);
  $('skySharePlace').addEventListener('change', updateShare);
  share.addEventListener('close', function () { if (restoreFocus) restoreFocus.focus(); });
  share.addEventListener('click', function (e) { if (e.target === share) { var r = share.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeShare(); } });
  $('skyCopyLink').addEventListener('click', function () {
    updateShare();
    if (!navigator.clipboard) { $('skyShareURL').focus(); $('skyShareURL').select(); $('skyShareResult').textContent = 'Select and copy the link above.'; return; }
    navigator.clipboard.writeText($('skyShareURL').value).then(function () { $('skyShareResult').textContent = 'Link copied. Your private places are not included.'; }, function () { $('skyShareURL').focus(); $('skyShareURL').select(); $('skyShareResult').textContent = 'Copy the selected link above.'; });
  });
  if (navigator.share) {
    $('skyNativeShare').hidden = false;
    $('skyNativeShare').addEventListener('click', function () { updateShare(); navigator.share({ title: 'BOOM Skyline · your Rome', url: $('skyShareURL').value }).catch(function (e) { if (e.name !== 'AbortError') $('skyShareResult').textContent = 'Use Copy link to share this view.'; }); });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopOrbit(); });
  reduced.addEventListener('change', function () { stopOrbit(); $('skyOrbit').disabled = !api || reduced.matches; if (api && reduced.matches) { api.map.stop(); api.map.jumpTo({ pitch: 0 }); } });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') stopOrbit(); });
  window.addEventListener('boom:skyline-ready', function (e) { attach(e.detail.api); });
  window.addEventListener('boom:skyline-selection', function (e) { selection(e.detail); });
  window.addEventListener('boom:skyline-filter', function (e) { if (api && e.detail.count === 0) status('No homes match these filters. Try another budget or destination.'); });
  if (window.BoomSkyline) attach(window.BoomSkyline);
  if(query.get('places')==='1'&&$('mieiChip'))$('mieiChip').click();
  var places=$('mieiVelo');
  if(places){
    places.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.preventDefault();$('mieiChiudi').click();$('mieiChip').focus();return;}
      if(e.key!=='Tab')return;
      var controls=Array.from(places.querySelectorAll('button,input')).filter(function(n){return !n.disabled&&n.getClientRects().length;});
      if(!controls.length)return;
      var first=controls[0],last=controls[controls.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
    $('mieiChiudi').addEventListener('click',function(){$('mieiChip').focus();});
  }
})();
