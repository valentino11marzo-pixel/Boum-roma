/* BOOM desk globe. Natural Earth public-domain geography; city centres, not office locations.
   A finite, on-demand canvas renderer. It does not own journey state or navigation. */
(function (global) {
  'use strict';
  var CITIES = [
    { slug: 'london', name: 'London', code: 'LON', label: [.18, .19] },
    { slug: 'amsterdam', name: 'Amsterdam', code: 'AMS', label: [.76, .14] },
    { slug: 'barcelona', name: 'Barcelona', code: 'BCN', label: [.17, .43] },
    { slug: 'milan', name: 'Milan', code: 'MIL', label: [.81, .38] },
    { slug: 'madrid', name: 'Madrid', code: 'MAD', label: [.14, .67] },
    { slug: 'rome', name: 'Rome', code: 'ROM', label: [.80, .67] }
  ];
  var RAD = Math.PI / 180, instance = null, cached = null;
  function allowed(slug) { return CITIES.some(function (city) { return city.slug === slug; }); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function vector(coordinate) {
    var lon = coordinate[0] * RAD, lat = coordinate[1] * RAD, cos = Math.cos(lat);
    return [cos * Math.cos(lon), cos * Math.sin(lon), Math.sin(lat)];
  }
  function greatCircle(a, b, count) {
    var dot = clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2], -1, 1), angle = Math.acos(dot), sin = Math.sin(angle), points = [];
    for (var i = 0; i <= count; i++) {
      var t = i / count, left = sin ? Math.sin((1-t)*angle)/sin : 1-t, right = sin ? Math.sin(t*angle)/sin : t;
      points.push([a[0]*left+b[0]*right, a[1]*left+b[1]*right, a[2]*left+b[2]*right]);
    }
    return points;
  }
  function prepare(raw) {
    if (!raw || !Array.isArray(raw.features) || !Array.isArray(raw.cities) || !Array.isArray(raw.landDots)) throw new Error('Missing globe geography');
    var cities = {};
    raw.cities.forEach(function (city) {
      if (allowed(city.slug) && Array.isArray(city.coordinates) && city.coordinates.length === 2 && city.coordinates.every(Number.isFinite)) {
        cities[city.slug] = { coordinate: city.coordinates, vector: vector(city.coordinates) };
      }
    });
    if (CITIES.some(function (city) { return !cities[city.slug]; })) throw new Error('Incomplete globe cities');
    var rings = [];
    raw.features.forEach(function (feature) {
      if (feature.geometry && feature.geometry.type === 'Polygon') feature.geometry.coordinates.forEach(function (ring) { rings.push(ring.map(vector)); });
    });
    if (!rings.length) throw new Error('Missing globe land');
    var grid = [];
    for (var lon = -180; lon < 180; lon += 30) {
      var meridian = [];
      for (var lat = -90; lat <= 90; lat += 3) meridian.push(vector([lon, lat]));
      grid.push(meridian);
    }
    for (var parallel = -60; parallel <= 60; parallel += 30) {
      var line = [];
      for (var longitude = -180; longitude <= 180; longitude += 3) line.push(vector([longitude, parallel]));
      grid.push(line);
    }
    var routes = {};
    CITIES.forEach(function (city) { if (city.slug !== 'rome') routes[city.slug] = greatCircle(cities.rome.vector, cities[city.slug].vector, 36); });
    return { cities: cities, rings: rings, dots: raw.landDots.map(vector), grid: grid, routes: routes };
  }
  function mount(root) {
    if (!root || !root.appendChild) return null;
    if (instance && instance.root === root) return api;
    destroy();
    var reduced = global.matchMedia('(prefers-reduced-motion: reduce)'), body = document.body;
    var city = allowed(body.dataset.europeCity) ? body.dataset.europeCity : 'rome';
    var s = instance = {
      root: root, city: city, data: null, ready: false, failed: false, visible: false,
      apiPaused: false, raf: 0, frames: 0, dirty: true, transition: null, width: 0, height: 0,
      angle: [8, 43], target: [8, 43], scroll: 0, reduced: reduced, listeners: [], observers: [], destroyed: false
    };
    root.classList.add('boom-flight-globe');
    root.dataset.globeState = 'loading';
    root.innerHTML = '<div class="boom-globe-stage"><canvas class="boom-flight-globe-canvas" aria-hidden="true"></canvas><nav class="boom-globe-cities" aria-label="Choose your BOOM destination"></nav><p class="boom-globe-status" role="status">Connecting the cities…</p></div><div class="boom-globe-caption"><span class="boom-globe-caption-label">Rome & the BOOM desks</span><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer" aria-label="Geography: Natural Earth, public domain"><span class="boom-globe-credit-icon" aria-hidden="true">i</span> Natural Earth</a></div>';
    s.stage = root.querySelector('.boom-globe-stage');
    s.canvas = root.querySelector('canvas');
    s.context = s.canvas.getContext('2d');
    s.status = root.querySelector('.boom-globe-status');
    s.buttons = {};
    var nav = root.querySelector('.boom-globe-cities');
    CITIES.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button'; button.dataset.globeCity = item.slug;
      button.innerHTML = '<span class="boom-globe-city-name">'+item.name+'</span><span class="boom-globe-city-code" aria-hidden="true">'+item.code+'</span>';
      button.setAttribute('aria-pressed', String(city === item.slug));
      button.setAttribute('aria-label', 'Choose '+item.name+(item.slug === 'rome' ? ', homes and Skyline' : ', BOOM desk'));
      nav.appendChild(button); s.buttons[item.slug] = button;
    });
    function listen(target, type, callback, options) { target.addEventListener(type, callback, options); s.listeners.push(function () { target.removeEventListener(type, callback, options); }); }
    listen(nav, 'click', function (event) {
      var button = event.target.closest('button[data-globe-city]');
      if (!button || !nav.contains(button)) return;
      // The owning city controller decides whether to accept the request. No private or form state here.
      global.dispatchEvent(new CustomEvent('boom-globe-city', { detail: { slug: button.dataset.globeCity } }));
    });
    s.pauseButton = document.getElementById('nextMotionToggle');
    if (s.pauseButton) {
      var pauseObserver = new MutationObserver(function () { syncMotion(s); });
      pauseObserver.observe(s.pauseButton, { attributes: true, attributeFilter: ['aria-pressed'] }); s.observers.push(pauseObserver);
    }
    var cityObserver = new MutationObserver(function () { selectCity(body.dataset.europeCity); });
    cityObserver.observe(body, { attributes: true, attributeFilter: ['data-europe-city'] }); s.observers.push(cityObserver);
    if (global.ResizeObserver) {
      var resizeObserver = new ResizeObserver(function () { measure(s); }); resizeObserver.observe(s.stage); s.observers.push(resizeObserver);
    } else listen(global, 'resize', function () { measure(s); }, { passive: true });
    if (global.IntersectionObserver) {
      var visibilityObserver = new IntersectionObserver(function (entries) {
        if (s.destroyed) return;
        s.visible = entries[0].isIntersecting;
        if (!s.visible) settle(s); else { measure(s); requestDraw(s); }
      }, { threshold: 0 });
      visibilityObserver.observe(root); s.observers.push(visibilityObserver);
    } else s.visible = true;
    listen(global, 'scroll', function () {
      if (s.visible && !paused(s) && !s.reduced.matches) { s.scrollDirty = true; requestDraw(s); }
    }, { passive: true });
    listen(document, 'visibilitychange', function () { syncMotion(s); });
    listen(global, 'pagehide', function () { settle(s); });
    listen(global, 'pageshow', function () { measure(s); requestDraw(s); });
    listen(reduced, 'change', function () { syncMotion(s); });
    measure(s); updateButtons(s);
    if (!s.context) { fail(s); return api; }
    if (cached) accept(s, cached);
    else {
      s.abort = new AbortController();
      s.timeout = global.setTimeout(function () { if (!s.ready && !s.destroyed) { s.abort.abort(); fail(s); } }, 10000);
      fetch('/assets/boom-globe-geography.json', { signal: s.abort.signal, credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('Globe geography unavailable');
        return response.json();
      }).then(function (raw) { var data = prepare(raw); cached = data; if (!s.destroyed) accept(s, data); }).catch(function (error) { if (!s.destroyed && (!error || error.name !== 'AbortError' || !s.failed)) fail(s); });
    }
    return api;
  }
  function fail(s) {
    if (s.destroyed) return;
    clearTimeout(s.timeout); s.failed = true; s.root.dataset.globeState = 'error';
    s.status.textContent = 'Globe unavailable. Choose your city.'; s.status.hidden = false;
    s.canvas.hidden = true;
  }
  function accept(s, data) {
    clearTimeout(s.timeout); s.data = data; s.ready = true; s.root.dataset.globeState = 'ready';
    s.status.textContent = ''; s.status.hidden = true;
    s.target = orientation(s, s.city); s.angle = s.target.slice(); requestDraw(s);
  }
  function orientation(s, city) {
    if (!s.data) return [8, 43];
    var coordinate = s.data.cities[city].coordinate;
    // All six desks remain in view; the camera responds to each real city centre.
    return [coordinate[0] * .72 + 1, 37 + (coordinate[1] - 40) * .7];
  }
  function paused(s) { return s.apiPaused || !!(s.pauseButton && s.pauseButton.getAttribute('aria-pressed') === 'true'); }
  function canMove(s) { return !paused(s) && !s.reduced.matches && !document.hidden && s.visible; }
  function settle(s) {
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0; s.transition = null; s.angle = s.target.slice(); s.dirty = true;
    s.root.dataset.globeMotion = 'still';
  }
  function syncMotion(s) {
    if (!canMove(s)) { settle(s); s.scroll = 0; }
    requestDraw(s);
  }
  function selectCity(slug) {
    var s = instance;
    if (!s || s.destroyed || !allowed(slug)) return false;
    if (s.city === slug) return true;
    s.city = slug; updateButtons(s); s.target = orientation(s, slug);
    if (s.ready && canMove(s)) s.transition = { from: s.angle.slice(), to: s.target.slice(), start: performance.now(), duration: 850 };
    else { s.transition = null; s.angle = s.target.slice(); }
    requestDraw(s); return true;
  }
  function updateButtons(s) {
    CITIES.forEach(function (item) { s.buttons[item.slug].setAttribute('aria-pressed', String(item.slug === s.city)); });
    s.root.dataset.globeCity = s.city;
  }
  function measure(s) {
    if (s.destroyed) return;
    var rect = s.stage.getBoundingClientRect(), width = Math.round(rect.width), height = Math.round(rect.height);
    if (!width || !height) return;
    if (width !== s.width || height !== s.height) {
      s.width = width; s.height = height;
      var dpr = Math.min(global.devicePixelRatio || 1, 2, Math.sqrt(1500000 / (width * height)));
      s.dpr = Math.max(1, dpr); s.canvas.width = Math.round(width * s.dpr); s.canvas.height = Math.round(height * s.dpr);
      placeLabels(s); requestDraw(s);
    }
  }
  function placeLabels(s) {
    var width = s.width, height = s.height, labelWidth = width < 430 ? 94 : 112;
    s.root.dataset.globeCompact = String(width < 430);
    s.root.style.setProperty('--globe-label-width', labelWidth+'px');
    s.labelPositions = {};
    CITIES.forEach(function (item) {
      var x = clamp(width * item.label[0], labelWidth / 2 + 3, width - labelWidth / 2 - 3), y = clamp(height * item.label[1], 30, height - 26);
      s.buttons[item.slug].style.left = x + 'px'; s.buttons[item.slug].style.top = y + 'px';
      s.labelPositions[item.slug] = [x, y];
    });
  }
  function requestDraw(s) {
    s.dirty = true;
    if (s.destroyed || s.raf || !s.visible || document.hidden || !s.width || !s.height || !s.context) return;
    s.raf = requestAnimationFrame(function (time) { frame(s, time); });
  }
  function frame(s, time) {
    s.raf = 0;
    if (s.destroyed || !s.visible || document.hidden) return;
    if (s.transition) {
      if (!canMove(s)) { s.angle = s.target.slice(); s.transition = null; }
      else {
        var p = clamp((time-s.transition.start)/s.transition.duration, 0, 1), eased = 1-Math.pow(1-p, 3);
        s.angle = [s.transition.from[0]+(s.transition.to[0]-s.transition.from[0])*eased, s.transition.from[1]+(s.transition.to[1]-s.transition.from[1])*eased];
        if (p === 1) s.transition = null;
      }
    }
    if (s.scrollDirty) {
      s.scrollDirty = false;
      if (canMove(s)) { var rect = s.root.getBoundingClientRect(); s.scroll = clamp((innerHeight*.45-rect.top-rect.height*.5)/Math.max(1, innerHeight), -1, 1)*4; }
    }
    s.root.dataset.globeMotion = s.transition ? 'transition' : 'still';
    paint(s); s.frames++; s.dirty = false;
    if (s.transition) requestDraw(s);
  }
  function paint(s) {
    var ctx = s.context, w = s.width, h = s.height, cx = w*.5, cy = h*.47, r = Math.min(w*.455, h*.465);
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    var lon = (s.angle[0]+s.scroll)*RAD, lat = (s.angle[1]+s.scroll*.4)*RAD;
    var east = [-Math.sin(lon), Math.cos(lon), 0], north = [-Math.sin(lat)*Math.cos(lon), -Math.sin(lat)*Math.sin(lon), Math.cos(lat)], front = [Math.cos(lat)*Math.cos(lon), Math.cos(lat)*Math.sin(lon), Math.sin(lat)];
    function project(point) {
      return [point[0]*east[0]+point[1]*east[1], -(point[0]*north[0]+point[1]*north[1]+point[2]*north[2]), point[0]*front[0]+point[1]*front[1]+point[2]*front[2]];
    }
    function path(points, lift) {
      var previous = null;
      points.forEach(function (point, index) {
        var p = project(point), altitude = lift ? 1 + Math.sin(index/(points.length-1)*Math.PI)*lift : 1;
        var x = cx+p[0]*r*altitude, y = cy+p[1]*r*altitude;
        if (p[2] >= 0) {
          if (previous && previous.p[2] >= 0) ctx.lineTo(x, y);
          else {
            if (previous) { var ratio = -previous.p[2]/(p[2]-previous.p[2]); ctx.moveTo(previous.x+(x-previous.x)*ratio, previous.y+(y-previous.y)*ratio); ctx.lineTo(x, y); }
            else ctx.moveTo(x, y);
          }
        } else if (previous && previous.p[2] >= 0) { var t = previous.p[2]/(previous.p[2]-p[2]); ctx.lineTo(previous.x+(x-previous.x)*t, previous.y+(y-previous.y)*t); }
        previous = { p:p, x:x, y:y };
      });
    }
    // The globe has no generated or guessed outlines: every coastline and land dot is Natural Earth.
    ctx.save();
    ctx.shadowColor = 'rgba(25,25,25,.06)'; ctx.shadowBlur = r*.11; ctx.shadowOffsetY = r*.035;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.clip();
    var globeFill = ctx.createRadialGradient(cx-r*.4, cy-r*.48, r*.1, cx+r*.18, cy+r*.15, r*1.25);
    globeFill.addColorStop(0, '#ffffff'); globeFill.addColorStop(.64, '#fafafa'); globeFill.addColorStop(1, '#eaeaea');
    ctx.fillStyle = globeFill; ctx.fillRect(cx-r, cy-r, r*2, r*2);
    if (s.data) {
      ctx.beginPath(); s.data.grid.forEach(function (points) { path(points, 0); }); ctx.lineWidth = .65; ctx.strokeStyle = 'rgba(36,36,36,.13)'; ctx.stroke();
      ctx.beginPath();
      s.data.dots.forEach(function (point) { var p = project(point); if (p[2] > .025) { var size = .55 + p[2]*.19; ctx.moveTo(cx+p[0]*r+size, cy+p[1]*r); ctx.arc(cx+p[0]*r, cy+p[1]*r, size, 0, Math.PI*2); } });
      ctx.fillStyle = 'rgba(34,34,34,.29)'; ctx.fill();
      ctx.beginPath(); s.data.rings.forEach(function (ring) { path(ring, 0); }); ctx.lineWidth = .75; ctx.strokeStyle = 'rgba(26,26,26,.65)'; ctx.stroke();
      Object.keys(s.data.routes).forEach(function (slug) {
        ctx.beginPath(); path(s.data.routes[slug], .06); ctx.lineWidth = slug === s.city ? 1.8 : .8;
        ctx.strokeStyle = slug === s.city ? '#a47f00' : 'rgba(110,103,62,.38)'; ctx.stroke();
      });
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.lineWidth = .7; ctx.strokeStyle = 'rgba(30,30,30,.2)'; ctx.stroke();
    if (!s.data || !s.labelPositions) return;
    CITIES.forEach(function (city) {
      var p = project(s.data.cities[city.slug].vector), selected = city.slug === s.city, label = s.labelPositions[city.slug];
      if (p[2] <= 0) return;
      var x = cx+p[0]*r, y = cy+p[1]*r, labelWidth = w < 430 ? 94 : 112;
      var edge = label[0] < cx ? label[0]+labelWidth*.36 : label[0]-labelWidth*.36, elbow = edge+(x-edge)*.25;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(elbow,label[1]); ctx.lineTo(edge,label[1]);
      ctx.lineWidth = selected ? 1 : .65; ctx.strokeStyle = selected ? 'rgba(141,110,0,.72)' : 'rgba(35,35,35,.32)'; ctx.stroke();
      if (selected) { ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(164,127,0,.38)'; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x,y,selected?3.5:2.8,0,Math.PI*2); ctx.fillStyle = selected ? '#e3b900' : '#c9ad45'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
  }
  function setPaused(value) { if (instance) { instance.apiPaused = !!value; syncMotion(instance); } }
  function state() {
    var s = instance;
    return s ? { city:s.city, ready:s.ready, visible:s.visible, paused:paused(s), reducedMotion:s.reduced.matches, rafPending:!!s.raf, frames:s.frames, error:s.failed } : { ready:false, visible:false, paused:false, reducedMotion:false, rafPending:false, frames:0 };
  }
  function destroy() {
    var s = instance; if (!s) return;
    s.destroyed = true; if (s.raf) cancelAnimationFrame(s.raf); if (s.abort) s.abort.abort(); clearTimeout(s.timeout);
    s.observers.forEach(function (observer) { observer.disconnect(); }); s.listeners.forEach(function (remove) { remove(); });
    s.root.replaceChildren(); s.root.classList.remove('boom-flight-globe');
    ['globeState','globeCity','globeMotion','globeCompact'].forEach(function (name) { delete s.root.dataset[name]; });
    s.root.style.removeProperty('--globe-label-width');
    instance = null;
  }
  var api = global.BoomFlightGlobe = { mount:mount, selectCity:selectCity, setPaused:setPaused, destroy:destroy, state:state };
})(window);
