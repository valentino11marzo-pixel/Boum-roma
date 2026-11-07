/* BOOM desk globe. Natural Earth public-domain geography; city centres, not office locations.
   An on-demand canvas renderer, with an opt-in, pausable Panorama orbit.
   It does not own journey state or navigation. */
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
  function dispatchAtlas() { return document.body.dataset.homeVision === 'dispatch'; }
  // A drag can cross any number of turns. The equivalent camera longitude
  // preserves the real destination without spinning through those turns again.
  function nearestLongitude(longitude, reference) { return longitude + Math.round((reference-longitude)/360)*360; }
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
      angle: [8, 43], target: [8, 43], scroll: 0, reduced: reduced, listeners: [], observers: [], destroyed: false,
      ambient: root.dataset.globeAmbient === 'true', ambientTimer: 0, ambientResumeAt: 0, ambientOrigin: null, ambientPhase: 0, ambientLast: 0,
      pointerWithin: false, focusWithin: false, connection: global.navigator && global.navigator.connection, motionState: '',
      zoom: 1, zoomTarget: 1, zoomTransition: null, lastPaint: 0, routeTrace: null, pointerCity: '',
      framing: root.dataset.globeFraming === 'horizon' ? 'horizon' : 'globe',
      framingMix: root.dataset.globeFraming === 'horizon' && root.dataset.globeLabels === 'selected' ? 1 : 0,
      framingTarget: 0, framingTransition: null, fullView: root.dataset.globeLabels === 'all'
    };
    root.classList.add('boom-flight-globe');
    root.dataset.globeState = 'loading';
    root.innerHTML = '<div class="boom-globe-stage"><canvas class="boom-flight-globe-canvas" aria-hidden="true"></canvas><nav class="boom-globe-cities" aria-label="Step inside a BOOM destination"></nav><p class="boom-globe-status" role="status">Connecting the cities…</p></div><div class="boom-globe-caption"><span class="boom-globe-caption-label">Drag the globe. Choose a city.</span><button type="button" class="boom-globe-reset" aria-label="Reset globe to selected city">Reset view</button><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer" aria-label="Geography: Natural Earth, public domain"><span class="boom-globe-credit-icon" aria-hidden="true">i</span> Natural Earth</a></div>';
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
    // Input intent lasts for this native click only. Europe's existing handler
    // must commit the city before the geographic selection can acquire a trace.
    listen(document, 'click', function (event) {
      var control = event.target.closest('button[data-europe-city]');
      s.pointerCity = dispatchAtlas() && event.detail > 0 && control ? control.dataset.europeCity : '';
    }, true);
    listen(document, 'click', function () { queueMicrotask(function () { s.pointerCity = ''; }); });
    listen(document, 'keydown', function () { cancelRouteTrace(s); });
    listen(global, 'popstate', function () { cancelRouteTrace(s); });
    listen(global, 'boom:flight-view', function () { cancelRouteTrace(s); });
    // Direct manipulation changes only the camera. City buttons retain keyboard navigation.
    var drag=null;
    function endDrag(event){
      if(!drag || (event && event.pointerId!==drag.id))return;
      var prior=drag;drag=null;s.dragging=false;s.dragActive=false;root.dataset.globeDragging='false';
      if(s.ambient)holdAmbient(s,1400);
      if(s.canvas.hasPointerCapture(prior.id))s.canvas.releasePointerCapture(prior.id);
      if(prior.moved && canMove(s) && event && event.type==='pointerup'){
        var carry=performance.now()-prior.time<90?clamp(prior.velocity*100,-12,12):0;
        s.target=[s.angle[0]-carry,s.angle[1]];
        s.transition={from:s.angle.slice(),to:s.target.slice(),start:performance.now(),duration:420};
      }
      requestDraw(s);
    }
    s.cancelDrag=function(){endDrag();};
    listen(s.canvas,'pointerdown',function(event){
      if(!s.ready || flight || paused(s) || event.button!==0 || drag)return;
      cancelRouteTrace(s);
      s.transition=null;
      if(s.ambient){holdAmbient(s,1400);s.ambientOrigin=null;s.zoomTransition=null;s.zoomTarget=s.zoom;s.root.dispatchEvent(new CustomEvent('boom-globe-camera',{detail:{zoom:s.zoom,min:1,max:1.25}}));}
      s.dragActive=true;drag={id:event.pointerId,x:event.clientX,y:event.clientY,angle:s.angle.slice(),lastX:event.clientX,time:performance.now(),velocity:0,moved:false};
    });
    listen(s.canvas,'pointermove',function(event){
      if(!drag || event.pointerId!==drag.id)return;
      var dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved && Math.abs(dx)<5)return;
      // pan-y remains native on touch; the browser cancels this gesture for vertical scrolling.
      if(!drag.moved){drag.moved=true;s.dragging=true;root.dataset.globeDragging='true';s.canvas.setPointerCapture(event.pointerId);}
      var now=performance.now();drag.velocity=(event.clientX-drag.lastX)/Math.max(1,now-drag.time);drag.lastX=event.clientX;drag.time=now;
      s.angle=[drag.angle[0]-dx*.24,clamp(drag.angle[1]+dy*.18,-65,75)];s.target=s.angle.slice();s.scroll=0;requestDraw(s);
    });
    listen(s.canvas,'pointerup',endDrag);listen(s.canvas,'pointercancel',endDrag);listen(s.canvas,'lostpointercapture',endDrag);
    listen(global,'pointerup',endDrag);
    listen(root.querySelector('.boom-globe-reset'),'click',function(event){
      cancelRouteTrace(s);
      endDrag();s.target=orientation(s,s.city);
      if(s.ambient){holdAmbient(s,900);s.ambientOrigin=null;setZoom(1,{animate:event.detail>0});}
      if(canMove(s)&&(!s.ambient||event.detail>0))s.transition={from:s.angle.slice(),to:s.target.slice(),start:performance.now(),duration:650};
      else{s.angle=s.target.slice();s.transition=null;}
      requestDraw(s);
    });
    // Ambient motion belongs only to the explicit Panorama presentation. The
    // globe freezes under the pointer and keyboard focus, so choosing never chases a target.
    listen(root,'pointerenter',function(event){if(event.pointerType==='touch')return;s.pointerWithin=true;if(s.ambient)holdAmbient(s,900);});
    listen(root,'pointerleave',function(event){if(event.pointerType==='touch')return;s.pointerWithin=false;s.focusWithin=!!(document.activeElement&&root.contains(document.activeElement)&&document.activeElement.matches(':focus-visible'));if(s.ambient){holdAmbient(s,900);scheduleAmbient(s);}});
    listen(root,'focusin',function(event){s.focusWithin=event.target.matches(':focus-visible');if(s.ambient&&s.focusWithin)holdAmbient(s,900);});
    listen(root,'focusout',function(event){s.focusWithin=!!(event.relatedTarget&&root.contains(event.relatedTarget)&&event.relatedTarget.matches(':focus-visible'));if(s.ambient&&!s.focusWithin){holdAmbient(s,900);scheduleAmbient(s);}});
    var ambientObserver=new MutationObserver(function(){
      s.ambient=root.dataset.globeAmbient==='true';s.ambientOrigin=null;s.ambientLast=0;if(s.ambient)s.scroll=0;
      if(!s.ambient){stopAmbient(s);s.zoom=s.zoomTarget=1;s.zoomTransition=null;}
      measure(s);requestDraw(s);
    });
    ambientObserver.observe(root,{attributes:true,attributeFilter:['data-globe-ambient']});s.observers.push(ambientObserver);
    // Full view temporarily shows the complete sphere. The inline lens remains
    // a presentation preference, independent of city, angle, zoom and brief.
    s.framingTarget = s.framingMix;
    var framingObserver = new MutationObserver(function () {
      if (!dispatchAtlas()) return;
      var mode = root.dataset.globeFraming === 'horizon' ? 'horizon' : 'globe', full = root.dataset.globeLabels === 'all';
      if (mode === s.framing && full === s.fullView) return;
      s.framing = mode; s.fullView = full; changeFraming(s, false);
    });
    framingObserver.observe(root,{attributes:true,attributeFilter:['data-globe-framing','data-globe-labels']});s.observers.push(framingObserver);
    if(s.connection&&s.connection.addEventListener)listen(s.connection,'change',function(){if(s.connection.saveData){cancelRouteTrace(s);stopAmbient(s);}else scheduleAmbient(s);});
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
      if (!s.ambient && s.visible && !paused(s) && !s.reduced.matches) { s.scrollDirty = true; requestDraw(s); }
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
    s.target = orientation(s, s.city); s.angle = s.target.slice();
    if(canMove(s)){s.angle=[s.target[0]-32,s.target[1]+12];s.transition={from:s.angle.slice(),to:s.target.slice(),start:performance.now(),duration:1100};}
    requestDraw(s);
  }
  function orientation(s, city) {
    if (!s.data) return [8, 43];
    var coordinate = s.data.cities[city].coordinate;
    // All six desks remain in view; the camera responds to each real city centre.
    var target = [coordinate[0] * .72 + 1, 37 + (coordinate[1] - 40) * .7];
    if (dispatchAtlas()) target[0] = nearestLongitude(target[0], s.angle[0]);
    return target;
  }
  function paused(s) { return s.apiPaused || !!(s.pauseButton && s.pauseButton.getAttribute('aria-pressed') === 'true'); }
  function canMove(s) { return !paused(s) && !s.reduced.matches && !document.hidden && s.visible; }
  function motionState(s,value){if(s.motionState!==value){s.motionState=value;s.root.dataset.globeMotion=value;}}
  function cancelRouteTrace(s) {
    var active = !!s.routeTrace;
    s.routeTrace = null; s.pointerCity = '';
    if (active) requestDraw(s);
  }
  function ambientAllowed(s){return s.ambient&&s.ready&&!s.destroyed&&!s.failed&&canMove(s)&&!flight&&!s.pointerWithin&&!s.focusWithin&&!s.dragActive&&!(s.connection&&s.connection.saveData);}
  function stopAmbient(s){
    clearTimeout(s.ambientTimer);s.ambientTimer=0;s.ambientLast=0;
    if(!s.transition&&!s.zoomTransition&&!s.framingTransition&&!s.routeTrace){
      // A resize clears the canvas. Hover/focus must stop an orbit frame, never
      // cancel the one required repaint after moving the same canvas out of Full view.
      if(s.raf&&!s.dirty){cancelAnimationFrame(s.raf);s.raf=0;}motionState(s,'still');
    }
  }
  function holdAmbient(s,delay){s.ambientResumeAt=performance.now()+delay;stopAmbient(s);}
  function scheduleAmbient(s){
    if(!ambientAllowed(s)||s.ambientTimer||s.transition||s.zoomTransition||s.framingTransition||s.routeTrace)return;
    // A timeout arms one rAF at a maximum of 24 paints/second. There is no
    // hidden/offscreen polling, no per-frame layout read and no moving HTML label.
    var wait=Math.max(0,s.ambientResumeAt-performance.now(),1000/24-(performance.now()-s.lastPaint));
    s.ambientTimer=global.setTimeout(function(){s.ambientTimer=0;if(ambientAllowed(s))requestDraw(s,true);},wait);
  }
  function setZoom(value,options){
    var s=instance;options=options||{};
    if(!s||s.destroyed||!s.ambient||!Number.isFinite(value))return null;
    cancelRouteTrace(s);
    var next=clamp(value,1,1.25);holdAmbient(s,900);s.zoomTarget=next;
    if(canMove(s)&&options.animate!==false&&Math.abs(next-s.zoom)>.001)s.zoomTransition={from:s.zoom,to:next,start:performance.now(),duration:260};
    else{s.zoom=next;s.zoomTransition=null;}
    s.root.dispatchEvent(new CustomEvent('boom-globe-camera',{detail:{zoom:next,min:1,max:1.25}}));
    requestDraw(s);return next;
  }
  function changeFraming(s, animate) {
    cancelRouteTrace(s);
    var target = s.framing === 'horizon' && !s.fullView ? 1 : 0;
    holdAmbient(s,900); s.framingTarget = target;
    if (animate && canMove(s) && !flight && Math.abs(target-s.framingMix) > .001) {
      s.framingTransition = {from:s.framingMix,to:target,start:performance.now(),duration:320};
    } else { s.framingMix = target; s.framingTransition = null; }
    s.root.dispatchEvent(new CustomEvent('boom-globe-camera',{detail:{zoom:s.zoomTarget,min:1,max:1.25,framing:s.framing}}));
    requestDraw(s);
  }
  function setFraming(value, options) {
    var s = instance; options = options || {};
    if (!s || s.destroyed || !s.ready || s.failed || !dispatchAtlas() || !['globe','horizon'].includes(value)) return null;
    s.framing = value; s.fullView = s.root.dataset.globeLabels === 'all';
    s.root.dataset.globeFraming = value;
    changeFraming(s, options.animate === true);
    return value;
  }
  function settle(s) {
    cancelRouteTrace(s);
    if(s.cancelDrag)s.cancelDrag();
    stopAmbient(s);
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0; s.transition = null; s.angle = s.target.slice(); s.dirty = true;
    s.zoomTransition=null;s.zoom=s.zoomTarget;
    s.framingTransition=null;s.framingMix=s.framingTarget;motionState(s,'still');
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
    var previous = s.city, trace = dispatchAtlas() && s.pointerCity === slug && document.body.dataset.europeCity === slug;
    cancelRouteTrace(s);
    if(s.cancelDrag)s.cancelDrag();
    s.city = slug; updateButtons(s); s.target = orientation(s, slug);
    if(s.ambient){holdAmbient(s,900);s.ambientOrigin=null;}
    if (s.ready && canMove(s)) {
      s.transition = { from: s.angle.slice(), to: s.target.slice(), start: performance.now(), duration: 850 };
      if (trace && !flight && !(s.connection && s.connection.saveData)) {
        // The already-present Rome connections describe geography, not a flight.
        // Trace their real great-circle samples; returning Rome reverses that arc.
        var route = slug === 'rome' ? previous : slug;
        s.routeTrace = {from:slug === 'rome' ? previous : 'rome',city:slug,route:route,
          points:slug === 'rome' ? s.data.routes[route].slice().reverse() : s.data.routes[route],
          start:s.transition.start,duration:s.transition.duration,progress:0};
      }
    }
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
  function requestDraw(s,ambientOnly) {
    if(!ambientOnly)s.dirty = true;
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
        if (p === 1) {s.transition = null;if(s.ambient)s.ambientOrigin=null;}
      }
    }
    if(s.zoomTransition){
      if(!canMove(s)){s.zoom=s.zoomTarget;s.zoomTransition=null;}
      else{var zp=clamp((time-s.zoomTransition.start)/s.zoomTransition.duration,0,1),ze=1-Math.pow(1-zp,3);s.zoom=s.zoomTransition.from+(s.zoomTransition.to-s.zoomTransition.from)*ze;if(zp===1)s.zoomTransition=null;}
    }
    if(s.framingTransition){
      if(!canMove(s)){s.framingMix=s.framingTarget;s.framingTransition=null;}
      else{var fp=clamp((time-s.framingTransition.start)/s.framingTransition.duration,0,1),fe=1-Math.pow(1-fp,3);s.framingMix=s.framingTransition.from+(s.framingTransition.to-s.framingTransition.from)*fe;if(fp===1)s.framingTransition=null;}
    }
    if(s.routeTrace){
      if(!canMove(s))s.routeTrace=null;
      else{s.routeTrace.progress=clamp((time-s.routeTrace.start)/s.routeTrace.duration,0,1);if(s.routeTrace.progress===1)s.routeTrace=null;}
    }
    var orbit=ambientAllowed(s)&&!s.transition&&!s.zoomTransition&&!s.framingTransition&&!s.routeTrace&&time>=s.ambientResumeAt;
    if(orbit){
      if(!s.ambientOrigin){s.ambientOrigin=s.angle.slice();s.ambientPhase=0;s.ambientLast=0;}
      if(s.ambientLast)s.ambientPhase+=Math.min(100,time-s.ambientLast)/1000*.045;
      s.ambientLast=time;
      s.angle=[s.ambientOrigin[0]+Math.sin(s.ambientPhase)*8,s.ambientOrigin[1]+Math.sin(s.ambientPhase*.7)*1.5];
      s.target=s.angle.slice();
    }else s.ambientLast=0;
    if (s.scrollDirty) {
      s.scrollDirty = false;
      if (!s.ambient && canMove(s) && !s.dragging) { var rect = s.root.getBoundingClientRect(); s.scroll = clamp((innerHeight*.45-rect.top-rect.height*.5)/Math.max(1, innerHeight), -1, 1)*4; }
    }
    motionState(s,s.transition||s.zoomTransition||s.framingTransition||s.routeTrace?'transition':orbit?'ambient':'still');
    paint(s); s.frames++; s.dirty = false;s.lastPaint=time;
    if (s.transition||s.zoomTransition||s.framingTransition||s.routeTrace) requestDraw(s);else scheduleAmbient(s);
  }
  // A presentation can frame the same real globe as a horizon. The flight
  // origin uses this same geometry, so entering a city never jumps cameras.
  function cameraFrame(s,w,h,zoom,framingMix) {
    if(dispatchAtlas()){
      var mix = framingMix == null ? s.framingMix : framingMix;
      var globeY = h*(s.ambient?.5:.47), globeRadius = s.ambient?Math.min(w,h)*.40*zoom:Math.min(w*.455,h*.465);
      return {cx:w*.5,cy:globeY+(h*.80-globeY)*mix,radius:globeRadius+(Math.min(w*.72,h*.78)*zoom-globeRadius)*mix};
    }
    if(s.root.dataset.globeFraming==='horizon'&&s.root.dataset.globeLabels==='selected')return {cx:w*.5,cy:h*.80,radius:Math.min(w*.72,h*.78)*zoom};
    return {cx:w*.5,cy:h*(s.ambient?.5:.47),radius:s.ambient?Math.min(w,h)*.40*zoom:Math.min(w*.455,h*.465)};
  }
  function paint(s, view) {
    view = view || {};
    var dispatch = dispatchAtlas();
    var ctx = view.context || s.context, w = view.width || s.width, h = view.height || s.height;
    var framing=cameraFrame(s,w,h,s.zoom);
    var cx = view.cx == null ? framing.cx : view.cx, cy = view.cy == null ? framing.cy : view.cy, r = view.radius || framing.radius;
    var angle = view.angle || [s.angle[0]+s.scroll, s.angle[1]+s.scroll*.4], selectedCity = view.city || s.city;
    var zoom = view.radius ? Math.min(2, r / Math.min(w,h)) : 1;
    ctx.setTransform(view.dpr || s.dpr, 0, 0, view.dpr || s.dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (view.flight) { ctx.fillStyle = 'rgba(5,6,7,'+view.cover+')'; ctx.fillRect(0,0,w,h); }
    var lon = angle[0]*RAD, lat = angle[1]*RAD;
    var east = [-Math.sin(lon), Math.cos(lon), 0], north = [-Math.sin(lat)*Math.cos(lon), -Math.sin(lat)*Math.sin(lon), Math.cos(lat)], front = [Math.cos(lat)*Math.cos(lon), Math.cos(lat)*Math.sin(lon), Math.sin(lat)];
    function project(point) {
      return [point[0]*east[0]+point[1]*east[1], -(point[0]*north[0]+point[1]*north[1]+point[2]*north[2]), point[0]*front[0]+point[1]*front[1]+point[2]*front[2]];
    }
    function path(points, lift, progress) {
      var previous = null, last = (points.length-1)*(progress == null ? 1 : progress);
      for (var index = 0; index <= Math.ceil(last); index++) {
        var at = Math.min(index,last), whole = Math.floor(at), fraction = at-whole, point = points[whole];
        if(fraction){var next=points[whole+1];point=[point[0]+(next[0]-point[0])*fraction,point[1]+(next[1]-point[1])*fraction,point[2]+(next[2]-point[2])*fraction];}
        var p = project(point), altitude = lift ? 1 + Math.sin(at/(points.length-1)*Math.PI)*lift : 1;
        var x = cx+p[0]*r*altitude, y = cy+p[1]*r*altitude;
        if (p[2] >= 0) {
          if (previous && previous.p[2] >= 0) ctx.lineTo(x, y);
          else {
            if (previous) { var ratio = -previous.p[2]/(p[2]-previous.p[2]); ctx.moveTo(previous.x+(x-previous.x)*ratio, previous.y+(y-previous.y)*ratio); ctx.lineTo(x, y); }
            else ctx.moveTo(x, y);
          }
        } else if (previous && previous.p[2] >= 0) { var t = previous.p[2]/(previous.p[2]-p[2]); ctx.lineTo(previous.x+(x-previous.x)*t, previous.y+(y-previous.y)*t); }
        previous = { p:p, x:x, y:y };
      }
      return previous;
    }
    // The globe has no generated or guessed outlines: every coastline and land dot is Natural Earth.
    ctx.save();
    if (!dispatch) { ctx.shadowColor = 'rgba(174,189,223,.24)'; ctx.shadowBlur = Math.min(40,r*.12); }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fillStyle = dispatch ? '#000' : '#08090b'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.clip();
    var globeFill = ctx.createRadialGradient(cx-r*.4, cy-r*.48, r*.1, cx+r*.18, cy+r*.15, r*1.25);
    globeFill.addColorStop(0, dispatch ? '#25271f' : '#343b40'); globeFill.addColorStop(.42, dispatch ? '#11140f' : '#1a2025'); globeFill.addColorStop(.8, dispatch ? '#050705' : '#0a0e12'); globeFill.addColorStop(1, dispatch ? '#000' : '#020304');
    ctx.fillStyle = globeFill; ctx.fillRect(cx-r, cy-r, r*2, r*2);
    if (s.data) {
      ctx.beginPath(); s.data.grid.forEach(function (points) { path(points, 0); }); ctx.lineWidth = .65; ctx.strokeStyle = dispatch ? 'rgba(231,226,203,.11)' : 'rgba(197,208,224,.13)'; ctx.stroke();
      if (dispatch) {
        // Project the same 3,700 geographic samples once, then batch their
        // light bands. Reuse the buffer: no extra frame loop or point objects.
        var land = s.dispatchLand || (s.dispatchLand = new Float32Array(s.data.dots.length*4));
        s.data.dots.forEach(function (point, index) {
          var p = project(point), offset = index*4;
          land[offset+3] = -1;
          if (p[2] <= .025) return;
          var light = -p[0]*.32-p[1]*.48+p[2]*.80;
          land[offset] = cx+p[0]*r; land[offset+1] = cy+p[1]*r; land[offset+2] = (.45+p[2]*.32)*zoom;
          land[offset+3] = p[2] < .22 || light < .42 ? 0 : light < .72 ? 1 : 2;
        });
        ['rgba(205,195,153,.26)','rgba(226,215,174,.53)','rgba(245,234,198,.82)'].forEach(function (color, band) {
          ctx.beginPath();
          for (var offset = 0; offset < land.length; offset += 4) {
            if (land[offset+3] !== band) continue;
            ctx.moveTo(land[offset]+land[offset+2],land[offset+1]); ctx.arc(land[offset],land[offset+1],land[offset+2],0,Math.PI*2);
          }
          ctx.fillStyle = color; ctx.fill();
        });
      } else {
        ctx.beginPath();
        s.data.dots.forEach(function (point) { var p = project(point); if (p[2] > .025) { var size = (.55 + p[2]*.19)*zoom; ctx.moveTo(cx+p[0]*r+size, cy+p[1]*r); ctx.arc(cx+p[0]*r, cy+p[1]*r, size, 0, Math.PI*2); } });
        ctx.fillStyle = 'rgba(236,219,173,.70)'; ctx.fill();
      }
      ctx.beginPath(); s.data.rings.forEach(function (ring) { path(ring, 0); }); ctx.lineWidth = dispatch ? .7 : .8; ctx.strokeStyle = dispatch ? 'rgba(241,232,203,.58)' : 'rgba(224,220,201,.55)'; ctx.stroke();
    }
    var shade=ctx.createRadialGradient(cx-r*.38,cy-r*.36,r*.12,cx-r*.12,cy-r*.12,r*1.12);
    shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(.65,'rgba(0,0,0,.08)');shade.addColorStop(1,'rgba(0,0,0,.88)');
    ctx.fillStyle=shade;ctx.fillRect(cx-r,cy-r,r*2,r*2);ctx.restore();
    var rim = 'rgba(203,214,231,.4)';
    if (dispatch) { rim = ctx.createLinearGradient(cx-r*.7,cy-r*.7,cx+r*.7,cy+r*.7); rim.addColorStop(0,'rgba(241,232,203,.5)'); rim.addColorStop(.55,'rgba(220,208,162,.16)'); rim.addColorStop(1,'rgba(220,208,162,0)'); }
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.lineWidth=1;ctx.strokeStyle=rim;ctx.stroke();
    var trace = dispatch && !view.flight ? s.routeTrace : null;
    if(s.data)Object.keys(s.data.routes).forEach(function(slug){
      ctx.save();ctx.beginPath();path(s.data.routes[slug],.12);ctx.lineWidth=slug===selectedCity?(dispatch?1.5:2):(dispatch?.65:.7);
      if(slug===selectedCity&&!dispatch){ctx.shadowColor='#ffd700';ctx.shadowBlur=12;}
      ctx.strokeStyle=slug===selectedCity&&(!trace||trace.route!==slug)?'#ffd700':dispatch?'rgba(207,191,139,.16)':'rgba(207,191,139,.24)';ctx.stroke();ctx.restore();
    });
    var arrival = trace ? clamp((trace.progress*trace.duration-600)/250,0,1) : 0;
    if(trace){
      var travel=clamp(trace.progress*trace.duration/600,0,1),drawn=1-Math.pow(1-travel,3);
      ctx.save();ctx.beginPath();var head=path(trace.points,.12,drawn);
      ctx.lineCap='round';ctx.lineWidth=1.5+.5*(1-arrival);
      ctx.strokeStyle='rgba(255,215,0,'+(trace.city==='rome'?1-arrival:1)+')';ctx.stroke();
      if(head&&head.p[2]>=0){ctx.beginPath();ctx.arc(head.x,head.y,3.2,0,Math.PI*2);ctx.fillStyle='rgba(255,246,216,'+(1-arrival)+')';ctx.fill();}
      ctx.restore();
    }
    if (!s.data || (!view.flight && !s.labelPositions)) return;
    CITIES.forEach(function (city) {
      var p = project(s.data.cities[city.slug].vector), selected = city.slug === selectedCity, label = s.labelPositions && s.labelPositions[city.slug];
      if (p[2] <= 0) return;
      var x = cx+p[0]*r, y = cy+p[1]*r, labelWidth = w < 430 ? 94 : 112;
      if (!view.flight && (s.root.dataset.globeLabels!=='selected'||selected)) {
        var edge = label[0] < cx ? label[0]+labelWidth*.36 : label[0]-labelWidth*.36, elbow = edge+(x-edge)*.25;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(elbow,label[1]); ctx.lineTo(edge,label[1]);
        ctx.lineWidth = selected ? 1 : .65; ctx.strokeStyle = selected ? 'rgba(255,215,0,.72)' : 'rgba(214,212,199,.3)'; ctx.stroke();
      }
      if (selected) { ctx.beginPath(); ctx.arc(x,y,view.flight?13:8,0,Math.PI*2); ctx.lineWidth = 1; ctx.strokeStyle = dispatch ? 'rgba(255,215,0,.8)' : 'rgba(255,215,0,.55)'; ctx.stroke(); }
      if(selected&&trace&&arrival>0){ctx.beginPath();ctx.arc(x,y,8+16*(1-Math.pow(1-arrival,3)),0,Math.PI*2);ctx.lineWidth=1.2;ctx.strokeStyle='rgba(255,215,0,'+(.7*(1-arrival))+')';ctx.stroke();}
      ctx.save(); ctx.beginPath(); ctx.arc(x,y,selected?3.5:dispatch?2.2:2.8,0,Math.PI*2); ctx.fillStyle = selected ? (dispatch ? '#fff6d8' : '#ffd700') : (dispatch ? '#b0a375' : '#c9b887');
      if (selected && !dispatch) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12; } ctx.fill(); ctx.restore();
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
    var cameraAngle=s.angle.slice(),cameraZoom=s.zoom,cameraFramingMix=s.framingMix;
    settle(s); // The globe and the immersive handoff never own simultaneous frame loops.
    try {
      var rect = s.stage.getBoundingClientRect(), visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      var framing=cameraFrame(s,rect.width,rect.height,cameraZoom,cameraFramingMix);
      f.origin = visible ? { x:rect.left+framing.cx,y:rect.top+framing.cy,radius:framing.radius }
        : { x:innerWidth*.5,y:innerHeight*.5,radius:Math.min(innerWidth,innerHeight)*.36 };
      f.angle = s.ambient?cameraAngle:[s.angle[0]+s.scroll,s.angle[1]+s.scroll*.4];
      f.destination = s.data.cities[slug].coordinate.slice();
      if (dispatchAtlas()) f.destination[0] = nearestLongitude(f.destination[0], f.angle[0]);
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
    var current = s ? { city:s.city, ready:s.ready, visible:s.visible, paused:paused(s), reducedMotion:s.reduced.matches, rafPending:!!s.raf, frames:s.frames, error:s.failed, dragging:!!s.dragging, angle:s.angle.slice(),ambient:s.ambient,ambientActive:s.motionState==='ambient',ambientPending:!!s.ambientTimer,saveData:!!(s.connection&&s.connection.saveData),zoom:s.zoom,zoomTarget:s.zoomTarget,zoomMin:1,zoomMax:1.25 } : { ready:false, visible:false, paused:false, reducedMotion:false, rafPending:false, frames:0 };
    current.flying = !!flight; current.flightCity = flight ? flight.city : null; current.flightCovered = !!(flight && flight.covered);
    current.flightRafPending = !!(flight && flight.raf); current.flightFrames = flight ? flight.frames : 0;
    current.framing = s ? s.framing : null;
    current.effectiveFraming = s ? s.fullView ? 'globe' : s.framing : null;
    current.framingMix = s ? s.framingMix : 0; current.framingTransition = !!(s && s.framingTransition);
    current.routeTrace = !!(s && s.routeTrace); current.routeProgress = s && s.routeTrace ? s.routeTrace.progress : 1;
    current.routeFrom = s && s.routeTrace ? s.routeTrace.from : null; current.routeCity = s && s.routeTrace ? s.routeTrace.city : null;
    return current;
  }
  function destroy() {
    cancelFlight();
    var s = instance; if (!s) return;
    if(s.cancelDrag)s.cancelDrag();
    s.destroyed = true; stopAmbient(s); if (s.raf) cancelAnimationFrame(s.raf); if (s.abort) s.abort.abort(); clearTimeout(s.timeout);
    s.observers.forEach(function (observer) { observer.disconnect(); }); s.listeners.forEach(function (remove) { remove(); });
    s.root.replaceChildren(); s.root.classList.remove('boom-flight-globe');
    ['globeState','globeCity','globeMotion','globeCompact'].forEach(function (name) { delete s.root.dataset[name]; });
    s.root.style.removeProperty('--globe-label-width');
    instance = null;
  }
  var api = global.BoomFlightGlobe = { mount:mount, selectCity:selectCity, flyTo:flyTo, cancelFlight:cancelFlight, setPaused:setPaused, setZoom:setZoom, setFraming:setFraming, destroy:destroy, state:state };
})(window);
