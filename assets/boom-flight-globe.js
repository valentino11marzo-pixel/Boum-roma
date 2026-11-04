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
  var RAD = Math.PI / 180, instance = null, cached = null, flight = null, flightSerial = 0;
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
    root.innerHTML = '<div class="boom-globe-stage"><canvas class="boom-flight-globe-canvas" aria-hidden="true"></canvas><nav class="boom-globe-cities" aria-label="Step inside a BOOM destination"></nav><p class="boom-globe-status" role="status">Connecting the cities…</p></div><div class="boom-globe-caption"><span class="boom-globe-caption-label">Choose a city. Step inside.</span><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer" aria-label="Geography: Natural Earth, public domain"><span class="boom-globe-credit-icon" aria-hidden="true">i</span> Natural Earth</a></div>';
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
      button.setAttribute('aria-label', (item.slug === 'rome' ? 'Enter Rome, homes and Skyline' : 'Explore '+item.name+', BOOM desk'));
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
    listen(document, 'visibilitychange', function () { if (document.hidden && flight) arrive(flight, 'hidden'); syncMotion(s); });
    listen(global, 'pagehide', function () { cancelFlight(); settle(s); });
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
    if (flight && (paused(s) || s.reduced.matches)) arrive(flight, 'motion-disabled');
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
    if (s.destroyed || s.raf || flight || !s.visible || document.hidden || !s.width || !s.height || !s.context) return;
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
  function paint(s, view) {
    view = view || {};
    var ctx = view.context || s.context, w = view.width || s.width, h = view.height || s.height;
    var cx = view.cx == null ? w*.5 : view.cx, cy = view.cy == null ? h*.47 : view.cy, r = view.radius || Math.min(w*.455, h*.465);
    var angle = view.angle || [s.angle[0]+s.scroll, s.angle[1]+s.scroll*.4], selectedCity = view.city || s.city;
    var zoom = view.radius ? Math.min(2, r / Math.min(w,h)) : 1;
    ctx.setTransform(view.dpr || s.dpr, 0, 0, view.dpr || s.dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (view.flight) { ctx.fillStyle = 'rgba(5,6,7,'+view.cover+')'; ctx.fillRect(0,0,w,h); }
    var lon = angle[0]*RAD, lat = angle[1]*RAD;
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
    ctx.shadowColor = 'rgba(174,189,223,.13)'; ctx.shadowBlur = Math.min(32,r*.10);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fillStyle = '#08090b'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.clip();
    var globeFill = ctx.createRadialGradient(cx-r*.4, cy-r*.48, r*.1, cx+r*.18, cy+r*.15, r*1.25);
    globeFill.addColorStop(0, '#20242b'); globeFill.addColorStop(.58, '#12161b'); globeFill.addColorStop(1, '#050607');
    ctx.fillStyle = globeFill; ctx.fillRect(cx-r, cy-r, r*2, r*2);
    if (s.data) {
      ctx.beginPath(); s.data.grid.forEach(function (points) { path(points, 0); }); ctx.lineWidth = .65; ctx.strokeStyle = 'rgba(197,208,224,.13)'; ctx.stroke();
      ctx.beginPath();
      s.data.dots.forEach(function (point) { var p = project(point); if (p[2] > .025) { var size = (.55 + p[2]*.19)*zoom; ctx.moveTo(cx+p[0]*r+size, cy+p[1]*r); ctx.arc(cx+p[0]*r, cy+p[1]*r, size, 0, Math.PI*2); } });
      ctx.fillStyle = 'rgba(223,205,161,.53)'; ctx.fill();
      ctx.beginPath(); s.data.rings.forEach(function (ring) { path(ring, 0); }); ctx.lineWidth = .8; ctx.strokeStyle = 'rgba(224,220,201,.48)'; ctx.stroke();
      Object.keys(s.data.routes).forEach(function (slug) {
        ctx.save(); ctx.beginPath(); path(s.data.routes[slug], .06); ctx.lineWidth = slug === selectedCity ? 1.8 : .8;
        if (slug === selectedCity) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 10; }
        ctx.strokeStyle = slug === selectedCity ? '#ffd700' : 'rgba(207,191,139,.35)'; ctx.stroke(); ctx.restore();
      });
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.lineWidth = .7; ctx.strokeStyle = 'rgba(203,214,231,.3)'; ctx.stroke();
    if (!s.data || (!view.flight && !s.labelPositions)) return;
    CITIES.forEach(function (city) {
      var p = project(s.data.cities[city.slug].vector), selected = city.slug === selectedCity, label = s.labelPositions && s.labelPositions[city.slug];
      if (p[2] <= 0) return;
      var x = cx+p[0]*r, y = cy+p[1]*r, labelWidth = w < 430 ? 94 : 112;
      if (!view.flight) {
        var edge = label[0] < cx ? label[0]+labelWidth*.36 : label[0]-labelWidth*.36, elbow = edge+(x-edge)*.25;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(elbow,label[1]); ctx.lineTo(edge,label[1]);
        ctx.lineWidth = selected ? 1 : .65; ctx.strokeStyle = selected ? 'rgba(255,215,0,.72)' : 'rgba(214,212,199,.3)'; ctx.stroke();
      }
      if (selected) { ctx.beginPath(); ctx.arc(x,y,view.flight?13:8,0,Math.PI*2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,215,0,.55)'; ctx.stroke(); }
      ctx.save(); ctx.beginPath(); ctx.arc(x,y,selected?3.5:2.8,0,Math.PI*2); ctx.fillStyle = selected ? '#ffd700' : '#c9b887';
      if (selected) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12; } ctx.fill(); ctx.restore();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#08090b'; ctx.stroke();
    });
  }
  function smooth(value) { value = clamp(value,0,1); return value*value*(3-2*value); }
  function finishFlight(f, status, reason) {
    if (!f || f.done) return;
    f.done = true;
    if (f.raf) cancelAnimationFrame(f.raf);
    clearTimeout(f.timeout);
    if (status !== 'arrived') f.abort.abort();
    f.cleanup.forEach(function (remove) { remove(); });
    if (f.overlay) { if (f.overlay.open) f.overlay.close(); f.overlay.remove(); }
    if (flight === f) {
      flight = null;
      delete document.body.dataset.globeFlight;
      if (instance && !instance.destroyed) requestDraw(instance);
    }
    f.resolve({ status:status, city:f.city, animated:f.animated, covered:f.covered, reason:reason || status });
  }
  function cover(f) {
    if (!f || f.done || flight !== f || f.covered) return;
    f.covered = true;
    try {
      var result = typeof f.onCovered === 'function' ? f.onCovered({ city:f.city, signal:f.abort.signal }) : null;
      // A synchronous route change is preferred. An optional promise is bounded by the
      // same watchdog, so a rejected or stalled handoff cannot retain a modal.
      if (result && typeof result.then === 'function') {
        f.pendingCallback = true;
        Promise.resolve(result).then(function () {
          f.pendingCallback = false;
          if (!f.done && f.arrivalReason) finishFlight(f,'arrived',f.arrivalReason);
        },function () { if (!f.done) finishFlight(f,'failed','callback'); });
      }
    } catch (error) { finishFlight(f,'failed','callback'); }
  }
  function arrive(f, reason) {
    if (!f || f.done || flight !== f) return;
    cover(f);
    if (!f.done) {
      if (f.pendingCallback) f.arrivalReason = reason || 'complete';
      else finishFlight(f,'arrived',reason);
    }
  }
  function cancelFlight() { if (flight) finishFlight(flight,'cancelled','cancelled'); }
  function flightSize(f) {
    var w = global.innerWidth, h = global.innerHeight;
    if (w === f.width && h === f.height) return;
    f.width = w; f.height = h;
    f.dpr = Math.max(.8,Math.min(global.devicePixelRatio || 1,2,Math.sqrt(1500000/(w*h))));
    f.canvas.width = Math.round(w*f.dpr); f.canvas.height = Math.round(h*f.dpr);
  }
  function renderFlight(f, time) {
    f.raf = 0;
    if (f.done || flight !== f) return;
    if (document.hidden || paused(f.source) || f.source.reduced.matches) { arrive(f,'motion-disabled'); return; }
    try {
      flightSize(f);
      var elapsed = Math.max(0,time-f.start), p = clamp(elapsed/1220,0,1);
      var move = smooth(p/.78), zoom = Math.pow(smooth(p/.84),2.4), reveal = smooth((p-.79)/.21);
      var angle = [f.angle[0]+(f.destination[0]-f.angle[0])*move,f.angle[1]+(f.destination[1]-f.angle[1])*move];
      var radius = f.origin.radius+(Math.max(f.width,f.height)*4.5-f.origin.radius)*zoom;
      f.overlay.style.opacity = String(1-reveal);
      f.label.style.opacity = String(smooth(elapsed/200)*(1-smooth((p-.68)/.15)));
      paint(f.source,{ flight:true,context:f.context,width:f.width,height:f.height,dpr:f.dpr,
        cx:f.origin.x+(f.width*.5-f.origin.x)*move,cy:f.origin.y+(f.height*.5-f.origin.y)*move,
        radius:radius,angle:angle,city:f.city,cover:clamp(elapsed/180,0,1) });
      f.frames++;
      // This frame is completely opaque before the underlying real view is changed.
      if (elapsed >= 180) cover(f);
      if (f.done || flight !== f) return;
      if (p === 1) { arrive(f,'complete'); return; }
      f.raf = requestAnimationFrame(function (now) { renderFlight(f,now); });
    } catch (error) { arrive(f,'render-fallback'); }
  }
  function flyTo(slug, options) {
    options = options || {};
    if (!allowed(slug)) return Promise.resolve({status:'invalid',city:slug,animated:false,covered:false,reason:'unknown-city'});
    if (flight) finishFlight(flight,'superseded','superseded');
    var s = instance, resolve, promise = new Promise(function (done) { resolve = done; });
    var f = flight = { id:++flightSerial,city:slug,source:s,onCovered:options.onCovered,resolve:resolve,
      abort:new AbortController(),cleanup:[],covered:false,animated:false,done:false,raf:0,frames:0 };
    // Suppress a second native transition during both animated and instant handoffs.
    document.body.dataset.globeFlight = 'active';
    f.timeout = setTimeout(function () {
      if (f.pendingCallback) finishFlight(f,'failed','callback-timeout');
      else arrive(f,'timeout');
    },1800);
    // Even an unavailable canvas must complete the user's requested navigation.
    if (!s || !s.ready || s.destroyed || s.failed || document.hidden || paused(s) || s.reduced.matches) {
      arrive(f,'instant'); return promise;
    }
    settle(s); // The globe and the immersive handoff never own simultaneous frame loops.
    try {
      var rect = s.stage.getBoundingClientRect(), visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      f.origin = visible ? { x:rect.left+rect.width*.5,y:rect.top+rect.height*.47,radius:Math.min(rect.width*.455,rect.height*.465) }
        : { x:innerWidth*.5,y:innerHeight*.5,radius:Math.min(innerWidth,innerHeight)*.36 };
      f.angle = [s.angle[0]+s.scroll,s.angle[1]+s.scroll*.4];
      f.destination = s.data.cities[slug].coordinate.slice();
      var item = CITIES.find(function (city) { return city.slug === slug; });
      f.overlay = document.createElement('dialog'); f.overlay.className = 'boom-globe-flight';
      f.overlay.setAttribute('aria-label',(slug === 'rome' ? 'Entering ' : 'Exploring ')+item.name);
      f.overlay.innerHTML = '<canvas aria-hidden="true"></canvas><p class="boom-globe-flight-label"><span>'+item.code+'</span><strong>'+item.name+'</strong><small>'+(slug === 'rome' ? 'Homes & Skyline' : 'Your BOOM desk')+'</small></p><button type="button" data-globe-skip>Skip flight <span aria-hidden="true">↗</span></button>';
      f.canvas = f.overlay.querySelector('canvas'); f.context = f.canvas.getContext('2d'); f.label = f.overlay.querySelector('.boom-globe-flight-label');
      if (!f.context || typeof f.overlay.showModal !== 'function') { arrive(f,'canvas-unavailable'); return promise; }
      var skip = f.overlay.querySelector('[data-globe-skip]');
      var skipFlight = function () { arrive(f,'skipped'); };
      var escapeFlight = function (event) { event.preventDefault(); arrive(f,'skipped'); };
      var closedFlight = function () { if (!f.done) finishFlight(f,'cancelled','closed'); };
      skip.addEventListener('click',skipFlight); f.overlay.addEventListener('cancel',escapeFlight); f.overlay.addEventListener('close',closedFlight);
      f.cleanup.push(function () { skip.removeEventListener('click',skipFlight); f.overlay.removeEventListener('cancel',escapeFlight); f.overlay.removeEventListener('close',closedFlight); });
      document.body.dataset.globeFlight = 'active';
      document.body.appendChild(f.overlay); f.overlay.showModal();
      skip.focus({preventScroll:true});
      f.animated = true; f.start = performance.now();
      renderFlight(f,f.start);
    } catch (error) { arrive(f,'overlay-unavailable'); }
    return promise;
  }
  function setPaused(value) { if (instance) { instance.apiPaused = !!value; syncMotion(instance); } }
  function state() {
    var s = instance;
    var current = s ? { city:s.city, ready:s.ready, visible:s.visible, paused:paused(s), reducedMotion:s.reduced.matches, rafPending:!!s.raf, frames:s.frames, error:s.failed } : { ready:false, visible:false, paused:false, reducedMotion:false, rafPending:false, frames:0 };
    current.flying = !!flight; current.flightCity = flight ? flight.city : null; current.flightCovered = !!(flight && flight.covered);
    current.flightRafPending = !!(flight && flight.raf); current.flightFrames = flight ? flight.frames : 0;
    return current;
  }
  function destroy() {
    cancelFlight();
    var s = instance; if (!s) return;
    s.destroyed = true; if (s.raf) cancelAnimationFrame(s.raf); if (s.abort) s.abort.abort(); clearTimeout(s.timeout);
    s.observers.forEach(function (observer) { observer.disconnect(); }); s.listeners.forEach(function (remove) { remove(); });
    s.root.replaceChildren(); s.root.classList.remove('boom-flight-globe');
    ['globeState','globeCity','globeMotion','globeCompact'].forEach(function (name) { delete s.root.dataset[name]; });
    s.root.style.removeProperty('--globe-label-width');
    instance = null;
  }
  var api = global.BoomFlightGlobe = { mount:mount, selectCity:selectCity, flyTo:flyTo, cancelFlight:cancelFlight, setPaused:setPaused, destroy:destroy, state:state };
})(window);
