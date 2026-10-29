/* Flight next: one existing Skyline frame, shared by the isolated proposal's
 * Home and Apartments views. No map engine, catalogue request or saved state.
 * mount needs a connected, sized container. Commands queue until Skyline is
 * ready. scope([]) intentionally shows no homes; pass all public IDs to reset.
 */
(function (window, document) {
  'use strict';
  var frame = null, shell = null, fallback = null, owner = null, boundDocument = null;
  var pendingScope = null, pendingBudget = null, pendingHome = '';
  var api = null, visible = false, hidden = false, timer = 0, resizeFrame = 0;
  var snapshot = { status: 'idle' }, observer = null, sizeObserver = null;
  var origin = window.location.origin;

  function id(value) { return /^[A-Za-z0-9_-]{1,100}$/.test(String(value || '')) ? String(value) : ''; }
  function emit(name, detail) { window.dispatchEvent(new CustomEvent('boom-next:map-' + name, { detail: detail })); }
  function state() { return Object.assign({}, snapshot); }
  function update(value) {
    snapshot = Object.assign({}, snapshot, value);
    if (shell) shell.dataset.state = snapshot.status;
    if (fallback) {
      fallback.hidden = snapshot.status !== 'error' && snapshot.status !== 'waiting';
      fallback.querySelector('span').textContent = snapshot.status === 'error' ? 'The city view could not load. ' : 'Still connecting the city. ';
    }
    if (snapshot.status === 'ready' || snapshot.status === 'error') clearTimeout(timer);
    emit('state', state());
  }
  function acceptState(value) {
    value = value || {};
    var failed = value.catalogueStatus === 'error' || value.mapStatus === 'error' || value.mapStatus === 'context-lost';
    update(Object.assign({}, value, { status: failed ? 'error' : value.usable ? 'ready' : 'loading' }));
  }
  function watchWait() {
    clearTimeout(timer);
    if (hidden || !visible || document.hidden || snapshot.status === 'ready' || snapshot.status === 'error') return;
    timer = setTimeout(function () {
      update({ status: 'waiting' });
    }, 28000);
  }
  function send(message) {
    if (!frame || !frame.contentWindow) return false;
    try { frame.contentWindow.postMessage(message, origin); return true; } catch (_) { return false; }
  }
  function replay() {
    if (!api) return;
    // Both messages use the same FIFO channel: the scope is applied before a
    // queued selection, so a newly included home can actually be selected.
    if (pendingBudget !== null) api.setBudget(pendingBudget);
    if (pendingScope !== null) send({ t: 'boomTieni', ids: pendingScope.slice() });
    if (pendingHome) send({ t: 'boomSelect', id: pendingHome });
  }
  function resize() {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(function () {
      resizeFrame = 0;
      if (!api || hidden || !visible || document.hidden) return;
      try { api.map.resize(); } catch (_) {}
    });
  }
  function dressOwnedFrame(childDocument) {
    if (!childDocument.head || childDocument.getElementById('boom-next-map-presentation')) return;
    var style = childDocument.createElement('style');
    style.id = 'boom-next-map-presentation';
    // This proposal renders the selected home in its own rail. Keep Skyline's
    // original precision wording as a small map note; never hide ≈ pins or
    // attribution, and never copy geographic claims into a second data store.
    style.textContent = '#skyHome{display:block!important;left:12px!important;right:auto!important;bottom:27px!important;width:fit-content!important;max-width:calc(100% - 24px)!important;min-height:0!important;margin:0!important;padding:5px 8px!important;border:0!important;border-radius:4px!important;box-shadow:none!important;background:#0b0e12df!important;pointer-events:none!important}'
      + '#skyHome[hidden]{display:none!important}'
      + '#skyHome>:not(.sky-home-copy),#skyHome .sky-home-copy>:not(#skyHomePrecision){display:none!important}'
      + '#skyHome .sky-home-copy{display:block!important;width:auto!important;min-width:0!important}'
      + '#skyHomePrecision{display:block!important;margin:0!important;padding:0!important;max-width:none!important;font-size:10px!important;line-height:1.4!important;color:#c4c7cf!important}';
    childDocument.head.appendChild(style);
  }
  function attach() {
    if (!frame) return;
    var child, childDocument;
    try { child = frame.contentWindow; childDocument = child.document; } catch (_) {
      update({ status: 'error', error: 'frame-origin' }); return;
    }
    dressOwnedFrame(childDocument);
    if (boundDocument !== childDocument) {
      boundDocument = childDocument;
      child.addEventListener('boom:skyline-ready', function () {
        if (boundDocument !== childDocument) return;
        attach();
      });
      child.addEventListener('boom:skyline-state', function (event) {
        if (boundDocument === childDocument) acceptState(event.detail);
      });
    }
    if (child.BoomSkyline && api !== child.BoomSkyline) {
      api = child.BoomSkyline;
      acceptState(api.state ? api.state() : child.BoomSkylineState);
      replay(); resize();
    }
  }
  function create() {
    shell = document.createElement('div');
    shell.className = 'boom-next-map-shell';
    shell.style.cssText = 'position:relative;width:100%;height:100%;min-height:0;background:#080a0e;overflow:hidden;isolation:isolate;';
    shell.dataset.state = 'loading';
    frame = document.createElement('iframe');
    frame.className = 'boom-next-map-frame';
    frame.title = 'BOOM Skyline — explore real homes in Rome';
    frame.setAttribute('allow', 'fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('loading', 'lazy');
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#080a0e;';
    frame.addEventListener('load', function () { attach(); watchWait(); });
    frame.addEventListener('error', function () { update({ status: 'error', error: 'frame-load' }); });
    frame.src = '/skyline?embed=1&preview=1';
    shell.appendChild(frame);
    // Skyline owns its loader and retry. This appears only if the frame itself
    // never becomes usable, and never covers map controls or attribution.
    fallback = document.createElement('div');
    fallback.className = 'boom-next-map-fallback'; fallback.hidden = true;
    fallback.style.cssText = 'position:absolute;left:12px;right:12px;top:70px;width:fit-content;max-width:calc(100% - 24px);padding:12px 15px;border:1px solid #ffffff30;border-radius:12px;background:#101319f2;color:#eee;font:13px/1.5 system-ui,sans-serif;';
    var note = document.createElement('span'); note.textContent = 'Still connecting the city. ';
    var link = document.createElement('a'); link.href = '/skyline'; link.textContent = 'Open Skyline ↗'; link.style.color = '#FFD700';
    var list = document.createElement('a'); list.href = '/apartments'; list.textContent = 'Browse homes ↗'; list.style.cssText = 'color:#FFD700;margin-left:12px;';
    fallback.append(note, link, list); shell.appendChild(fallback);
    if (window.IntersectionObserver) {
      observer = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (!visible && api) { try { api.map.stop(); } catch (_) {} }
        if (visible) resize(); watchWait();
      }, { threshold: 0 });
      observer.observe(shell);
    } else visible = true;
    if (window.ResizeObserver) { sizeObserver = new ResizeObserver(resize); sizeObserver.observe(shell); }
    update({ status: 'loading' });
  }
  function mount(container) {
    if (!container || container.nodeType !== 1 || container.ownerDocument !== document || !container.isConnected) return null;
    if (!frame) create();
    hidden = false; shell.hidden = false;
    if (owner !== container || shell.parentNode !== container) {
      var moved = false;
      // moveBefore preserves the iframe browsing context (including WebGL).
      // Older browsers safely reload the SAME frame; replay restores commands.
      if (shell.isConnected && typeof container.moveBefore === 'function') {
        try { container.moveBefore(shell, null); moved = true; } catch (_) {}
      }
      if (!moved) {
        if (shell.isConnected) {
          if (api) { try { api.map.stop(); } catch (_) {} }
          api = null; boundDocument = null; update({ status: 'loading', usable: false });
        }
        container.appendChild(shell);
      }
      owner = container;
    }
    resize(); watchWait(); return frame;
  }
  function hide() {
    hidden = true;
    if (shell) shell.hidden = true;
    clearTimeout(timer);
    if (api) { try { api.map.stop(); } catch (_) {} }
  }
  function scope(ids) {
    if (!Array.isArray(ids)) return false;
    pendingScope = Array.from(new Set(ids.map(id).filter(Boolean)));
    if (api) send({ t: 'boomTieni', ids: pendingScope.slice() });
    return true;
  }
  function select(value) {
    var chosen = id(value); if (!chosen) return false;
    pendingHome = chosen;
    if (api) send({ t: 'boomSelect', id: chosen });
    return true;
  }
  function setBudget(value) {
    var amount = Number(value); if (!Number.isFinite(amount) || amount < 0) return false;
    pendingBudget = amount;
    if (api) api.setBudget(amount);
    return true;
  }
  window.addEventListener('message', function (event) {
    if (!frame || event.origin !== origin || event.source !== frame.contentWindow || !event.data) return;
    if (event.data.t === 'boomSkylineReady') { attach(); if (api && api.state) acceptState(api.state()); }
    if (event.data.t === 'boomSelected') {
      var chosen = id(event.data.id); if (!chosen) return;
      pendingHome = chosen; emit('select', { id: chosen });
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && api) { try { api.map.stop(); } catch (_) {} }
    else resize(); watchWait();
  });
  window.addEventListener('resize', resize, { passive: true });
  window.BoomNextMap = Object.freeze({ mount: mount, hide: hide, select: select, scope: scope, setBudget: setBudget, state: state });
})(window, document);
