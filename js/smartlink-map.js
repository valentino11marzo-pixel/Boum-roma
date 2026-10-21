/* Mappa dell'area: stessa geometria nello Studio e nella scheda cliente. */
(function (root) {
  'use strict';
  let loading;
  function frame(map, area) {
    const points = root.BOOM_SMARTLINK.areaCircle(area).geometry.coordinates[0];
    map.resize();
    map.fitBounds([[Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))], [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]], {padding:25, duration:0, maxZoom:14});
  }
  function load() {
    if (root.maplibregl) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (!document.querySelector('[data-smartlink-map-css]')) {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.dataset.smartlinkMapCss = '1';
        css.href = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.append(css);
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.min.js';
      script.onload = resolve;
      script.onerror = () => { script.remove(); loading = null; reject(new Error('map_unavailable')); };
      document.head.append(script);
    });
    return loading;
  }
  function mount(host, zones) {
    const rules = root.BOOM_SMARTLINK;
    let map, candidate = null, confirmed = null, omitted = false, version = 0, disposed = false, controller;
    host.innerHTML = `<div class="sl-map-choice"><label class="form-label" for="sl_area_query">Quale zona mostriamo al cliente?</label>
      <div class="sl-inline"><input id="sl_area_query" class="form-input" type="search" placeholder="Es. Cipro, Roma" autocomplete="off"><button type="button" class="btn btn-secondary" data-area-search>Cerca zona</button></div>
      <p data-area-status class="sl-hint" role="status">Cerca una zona o usa quella suggerita dall’annuncio.</p><div class="sl-area-results" data-area-results></div>
      <div data-area-preview hidden><div class="sl-area-map" data-area-map role="region" aria-label="Anteprima dell’area mostrata al cliente"></div>
      <p class="sl-hint">Il cerchio mostra la zona indicativa. Non identifica il portone. I punti di interesse saranno calcolati attorno a quest’area.</p>
      <div class="sl-area-actions"><button type="button" class="btn" data-area-confirm>Conferma questa zona</button><button type="button" class="btn btn-secondary" data-area-center>Ricentra</button></div></div>
      <button type="button" class="sl-area-omit" data-area-omit>Continua senza mappa</button></div>`;
    const el = selector => host.querySelector(selector);
    const input = el('input'), status = el('[data-area-status]'), results = el('[data-area-results]'), preview = el('[data-area-preview]'), confirm = el('[data-area-confirm]');
    function invalidate() {
      version++; controller?.abort(); candidate = confirmed = null; omitted = false;
      preview.hidden = true; results.replaceChildren(); confirm.disabled = false; confirm.textContent = 'Conferma questa zona';
    }
    function draw() {
      if (!candidate || !map?.isStyleLoaded()) return;
      const data = rules.areaCircle(candidate);
      if (map.getSource('area')) map.getSource('area').setData(data);
      else {
        map.addSource('area', { type:'geojson', data });
        map.addLayer({ id:'area-fill', type:'fill', source:'area', paint:{'fill-color':'#D4AF37','fill-opacity':0.18} });
        map.addLayer({ id:'area-line', type:'line', source:'area', paint:{'line-color':'#D4AF37','line-width':2} });
      }
      frame(map, candidate);
      confirm.disabled = !!confirmed;
    }
    async function select(value) {
      invalidate(); candidate = rules.cleanMap(value);
      if (!candidate) return;
      input.value = candidate.label; preview.hidden = false; confirm.disabled = true;
      status.textContent = candidate.label + ' · Controlla il cerchio e conferma la zona.';
      const current = version;
      try {
        await load();
        if (disposed || current !== version) return;
        if (!map) {
          map = new root.maplibregl.Map({ container:el('[data-area-map]'), style:'https://tiles.openfreemap.org/styles/liberty', center:[candidate.lng,candidate.lat], zoom:14, cooperativeGestures:true });
          map.addControl(new root.maplibregl.NavigationControl({showCompass:false}), 'top-right');
          map.on('load', draw);
          map.on('error', () => { if (!disposed && candidate) status.textContent = 'Mappa non completamente disponibile. Zona selezionata: ' + candidate.label + '. Riprova prima di confermare.'; });
        }
        draw();
      } catch {
        if (current === version && !disposed) status.textContent = 'Anteprima non disponibile. Zona selezionata: ' + candidate.label + '. Puoi riprovare la ricerca o continuare senza mappa.';
      }
    }
    function render(candidates) {
      results.replaceChildren();
      candidates.forEach(value => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary'; button.textContent = value.label;
        button.addEventListener('click', () => select(value)); results.append(button);
      });
    }
    async function search() {
      const q = input.value.trim(); invalidate();
      if (q.length < 3) { status.textContent = 'Scrivi almeno tre lettere del quartiere.'; return; }
      const known = rules.areaCandidates(q, zones);
      if (known.length === 1) { await select(known[0]); return; }
      if (known.length) { render(known); status.textContent = 'Scegli la zona da vedere sulla mappa.'; return; }
      status.textContent = 'Cerco la zona a Roma…'; const current = version;
      controller = new AbortController(); const searchController = controller;
      const timer = setTimeout(() => searchController.abort(), 8000);
      try {
        const response = await fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(q + ( /roma/i.test(q) ? '' : ', Roma')) + '&lat=41.9028&lon=12.4964&limit=6&lang=default', {signal:controller.signal});
        if (!response.ok) throw new Error('search_unavailable');
        const data = await response.json();
        if (disposed || current !== version) return;
        const areas = (data.features || []).map(f => rules.cleanMap({ lat:f.geometry?.coordinates?.[1], lng:f.geometry?.coordinates?.[0], label:[f.properties?.name,f.properties?.city].filter(Boolean).join(', ') })).filter(Boolean);
        render(areas);
        status.textContent = areas.length ? 'Scegli una zona e controllala sulla mappa.' : 'Nessuna zona trovata a Roma. Prova con il nome del quartiere.';
      } catch {
        if (!disposed && current === version) status.textContent = 'Ricerca non disponibile. Riprova o scegli di continuare senza mappa.';
      } finally { clearTimeout(timer); }
    }
    input.addEventListener('input', () => { invalidate(); status.textContent = 'La zona è cambiata: cerca e conferma la nuova area.'; });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); search(); } });
    el('[data-area-search]').addEventListener('click', search);
    confirm.addEventListener('click', () => {
      if (!candidate) return;
      confirmed = {...candidate}; omitted = false; confirm.disabled = true; confirm.textContent = 'Zona confermata ✓';
      status.textContent = confirmed.label + ' · Questa è l’area che vedrà il cliente.';
    });
    el('[data-area-center]').addEventListener('click', draw);
    el('[data-area-omit]').addEventListener('click', () => { invalidate(); input.value = ''; omitted = true; status.textContent = 'La scheda verrà creata senza mappa. Puoi ancora cercare una zona.'; });
    return {
      suggest(text) {
        if (confirmed || candidate || omitted || input.value) return;
        const known = rules.areaCandidates(text, zones);
        if (known.length === 1) select(known[0]);
        else if (known.length) { render(known); status.textContent = 'L’annuncio cita più zone: scegli quella corretta.'; }
      },
      reset() { invalidate(); input.value = ''; status.textContent = 'Cerca la zona del nuovo annuncio.'; },
      value() { return confirmed; },
      ready() { return !!confirmed || omitted; },
      focus() { host.scrollIntoView({block:'center', behavior:'auto'}); input.focus({preventScroll:true}); },
      destroy() { disposed = true; version++; controller?.abort(); map?.remove(); }
    };
  }
  root.BOOM_SMARTLINK_MAP = {load, mount, frame};
})(window);
