/* La scheda cliente: dati pubblici BOOM, galleria e quartiere. Nessun URL della fonte. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const RULES = window.BOOM_SMARTLINK;
  const id = new URLSearchParams(location.search).get('id') || '';
  const fmt = n => new Intl.NumberFormat('it-IT', { useGrouping:true }).format(Number(n));
  const showError = () => { $('loading').classList.add('hidden'); $('error').classList.remove('hidden'); };
  if (!/^[A-Za-z0-9_-]{20}$/.test(id) || !RULES) return showError();

  let photos = [], currentPhoto = 0, map = null, area = null, poiMarkers = [], searchMarker = null, points = [], category = 'all';
  const safeImage = raw => {
    try {
      const u = new URL(raw, location.href);
      return (u.origin === 'https://firebasestorage.googleapis.com' && decodeURIComponent(u.pathname).includes('/o/smartlinks/'))
        || (u.origin === location.origin && /^\/preview-photo\/[A-Za-z0-9_-]+$/.test(u.pathname));
    } catch { return false; }
  };
  const set = (name, value) => { $(name).textContent = value; };

  function showPhoto(index) {
    if (!photos.length) return;
    currentPhoto = (index + photos.length) % photos.length;
    $('gallery-cover').src = photos[currentPhoto];
    $('gallery-count').textContent = `${currentPhoto + 1} / ${photos.length} · VEDI FOTO`;
    $('gallery-thumbs').querySelectorAll('button').forEach((b,i) => b.classList.toggle('active', i === currentPhoto));
    $('lightbox-image').src = photos[currentPhoto];
    $('lightbox-image').alt = `Fotografia ${currentPhoto + 1} dell’immobile`;
    $('lightbox-count').textContent = `${currentPhoto + 1} / ${photos.length}`;
  }
  function gallery(images) {
    photos = (Array.isArray(images) ? images : []).filter(safeImage).slice(0, 12);
    if (!photos.length) return;
    $('gallery').hidden = false; $('gallery-empty').hidden = true;
    $('gallery-cover').addEventListener('error', () => {
      photos.splice(currentPhoto, 1);
      if (!photos.length) { $('gallery').hidden = true; $('gallery-empty').hidden = false; return; }
      $('gallery-thumbs').replaceChildren(); makeThumbs(); showPhoto(0);
    });
    function makeThumbs() {
      photos.slice(0, 3).forEach((url, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Mostra foto ${i + 1}`);
        const img = document.createElement('img'); img.src = url; img.alt = '';
        b.append(img);
        if (i === 2 && photos.length > 3) { const more=document.createElement('span'); more.textContent=`+${photos.length - 3}`; b.append(more); }
        b.addEventListener('click', () => showPhoto(i)); $('gallery-thumbs').append(b);
      });
    }
    makeThumbs(); showPhoto(0);
    $('gallery-main').addEventListener('click', () => { $('lightbox').classList.remove('hidden'); document.body.style.overflow='hidden'; $('lightbox-close').focus(); });
    $('lightbox-close').addEventListener('click', closeLightbox);
    $('lightbox-prev').addEventListener('click', () => showPhoto(currentPhoto - 1));
    $('lightbox-next').addEventListener('click', () => showPhoto(currentPhoto + 1));
    $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) closeLightbox(); });
    document.addEventListener('keydown', e => {
      if ($('lightbox').classList.contains('hidden')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showPhoto(currentPhoto - 1);
      if (e.key === 'ArrowRight') showPhoto(currentPhoto + 1);
    });
    let startX=0, startY=0;
    $('lightbox').addEventListener('touchstart', e => { startX=e.changedTouches[0].clientX; startY=e.changedTouches[0].clientY; }, {passive:true});
    $('lightbox').addEventListener('touchend', e => {
      const dx=e.changedTouches[0].clientX-startX, dy=e.changedTouches[0].clientY-startY;
      if (Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.3) showPhoto(currentPhoto+(dx<0?1:-1));
    }, {passive:true});
  }
  function closeLightbox() { $('lightbox').classList.add('hidden'); document.body.style.overflow=''; $('gallery-main').focus(); }

  function distance(meters) { return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace('.',',')} km`; }
  function categoryName(cat) { return ({metro:'Trasporti',spesa:'Spesa',universita:'Istruzione',verde:'Verde'})[cat] || 'Luogo'; }
  function tileCategory(properties) {
    const type = String(properties.subclass || properties.class || '').toLowerCase();
    if (['subway','subway_entrance','station','railway','train_station','metro_station'].includes(type)) return 'metro';
    if (['supermarket','grocery'].includes(type)) return 'spesa';
    if (['university','college'].includes(type)) return 'universita';
    if (['park','garden','dog_park'].includes(type)) return 'verde';
    return null;
  }
  function localPois() {
    if (!map || !map.getSource('openmaptiles')) return;
    const features=map.querySourceFeatures('openmaptiles',{sourceLayer:'poi'}), seen=new Set(), found=[];
    for (const f of features) {
      const p=f.properties || {}, category=tileCategory(p), co=f.geometry?.coordinates;
      const name=String(p['name:it'] || p.name || p.name_en || '').trim().slice(0,80);
      if (!category || !name || f.geometry?.type !== 'Point' || !Array.isArray(co)) continue;
      const lat=Number(co[1]), lng=Number(co[0]), km=RULES.distanceKm(area,{lat,lng});
      if (km == null || km > 2 || km < .03) continue;
      const key=category+':'+name.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
      found.push({ name, category, lat, lng, meters:Math.round(km*100) * 10 });
    }
    if (found.length && !points.length) { points=found.sort((a,b)=>a.meters-b.meters).slice(0,40); renderPois(); }
  }
  function renderPois() {
    poiMarkers.forEach(m => m.remove()); poiMarkers=[];
    const selected = category === 'all' ? points : points.filter(p => p.category === category);
    $('places-count').textContent = selected.length ? String(selected.length) : '';
    const list = $('places-list'); list.replaceChildren();
    if (!selected.length) { const empty=document.createElement('div'); empty.className='empty'; empty.textContent=points.length ? 'Nessun luogo in questa categoria nell’area mostrata.' : 'Punti vicini momentaneamente non disponibili. Puoi esplorare la mappa o cercare un luogo.'; list.append(empty); return; }
    selected.slice(0, 12).forEach(p => {
      const markerEl=document.createElement('div'); markerEl.className='poi-marker '+p.category; markerEl.title=p.name;
      const marker=new maplibregl.Marker({element:markerEl}).setLngLat([p.lng,p.lat]).addTo(map); poiMarkers.push(marker);
      const button=document.createElement('button'); button.type='button'; button.className='place-row';
      const name=document.createElement('span'), dist=document.createElement('small');
      name.textContent=`${categoryName(p.category)} · ${p.name}`; dist.textContent=distance(p.meters); button.append(name,dist);
      button.addEventListener('click', () => { map.flyTo({center:[p.lng,p.lat],zoom:15.7,essential:true}); markerEl.style.transform='scale(1.35)'; setTimeout(() => { markerEl.style.transform=''; },800); });
      list.append(button);
    });
  }
  async function loadPois() {
    try {
      const r=await fetch('/api/smartlink/pois?id='+encodeURIComponent(id),{cache:'force-cache'});
      const body=await r.json();
      if (r.ok && body.ok && Array.isArray(body.points) && body.points.length) points=body.points.filter(p => p && ['metro','spesa','universita','verde'].includes(p.category) && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))).slice(0,40);
    } catch { /* La mappa rimane navigabile. */ }
    if (!points.length) localPois();
    renderPois();
  }
  function initSearch() {
    let timer=0, seq=0;
    const input=$('place-query'), results=$('place-results');
    input.addEventListener('input', () => { clearTimeout(timer); const q=input.value.trim(); if (q.length < 3) { results.hidden=true; return; } const current=++seq;
      results.replaceChildren();
      points.filter(p => p.name.toLocaleLowerCase('it').includes(q.toLocaleLowerCase('it'))).slice(0,5).forEach(p => {
        const b=document.createElement('button'); b.type='button'; b.setAttribute('role','option'); b.textContent=p.name;
        const small=document.createElement('small'); small.textContent=categoryName(p.category)+' · '+distance(p.meters); b.append(small);
        b.addEventListener('click', () => { input.value=p.name; results.hidden=true; map.flyTo({center:[p.lng,p.lat],zoom:15.7,essential:true}); });
        results.append(b);
      });
      results.hidden=!results.childElementCount;
      timer=setTimeout(async () => {
        try {
          const url='https://photon.komoot.io/api/?q='+encodeURIComponent(q)+'&lat='+area.lat+'&lon='+area.lng+'&limit=5&lang=it&zoom=12';
          const r=await fetch(url); const body=await r.json(); if (current!==seq) return;
          if (results.childElementCount) return;
          (body.features || []).forEach(f => {
            const p=f.properties || {}, co=f.geometry?.coordinates || [];
            const place={lat:Number(co[1]),lng:Number(co[0])};
            const km=RULES.distanceKm(area, place);
            if (!p.name || km == null || km > 25) return;
            const b=document.createElement('button'); b.type='button'; b.setAttribute('role','option');
            b.textContent=String(p.name).slice(0,100);
            const small=document.createElement('small'); small.textContent=[p.district,p.city].filter(Boolean).join(' · '); b.append(small);
            b.addEventListener('click', () => {
              input.value=String(p.name); results.hidden=true;
              if (searchMarker) searchMarker.remove();
              const markerEl=document.createElement('div'); markerEl.className='poi-marker';
              searchMarker=new maplibregl.Marker({element:markerEl}).setLngLat([place.lng,place.lat]).addTo(map);
              map.flyTo({center:[place.lng,place.lat],zoom:15,essential:true});
              $('places-list').replaceChildren(); const info=document.createElement('div'); info.className='empty'; info.textContent=`${p.name} · ${distance(Math.round(km*1000/10)*10)} in linea d’aria dal centro dell’area.`; $('places-list').append(info);
            }); results.append(b);
          });
          results.hidden=!results.childElementCount;
        } catch { if (current===seq && !results.childElementCount) results.hidden=true; }
      },350);
    });
    input.addEventListener('keydown', e => { if (e.key==='Escape') results.hidden=true; });
    document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) results.hidden=true; });
  }
  async function initMap() {
    try {
      await window.BOOM_SMARTLINK_MAP.load();
      map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[area.lng,area.lat],zoom:14.1,cooperativeGestures:true,attributionControl:true});
      map.addControl(new maplibregl.NavigationControl(),'top-right');
      map.on('load', () => {
        map.addSource('smartlink-area',{type:'geojson',data:RULES.areaCircle(area)});
        map.addLayer({id:'smartlink-area-fill',type:'fill',source:'smartlink-area',paint:{'fill-color':'#ffd700','fill-opacity':.13}});
        map.addLayer({id:'smartlink-area-line',type:'line',source:'smartlink-area',paint:{'line-color':'#ffd700','line-width':2,'line-opacity':.9}});
        const markerEl=document.createElement('div'); markerEl.className='map-area'; markerEl.title='Centro indicativo dell’area';
        new maplibregl.Marker({element:markerEl}).setLngLat([area.lng,area.lat]).addTo(map);
        $('map-loading').classList.add('hidden'); map.once('idle',localPois); loadPois(); initSearch();
      });
      map.on('error', () => { if (!$('map-loading').classList.contains('hidden')) $('map-loading').textContent='Mappa momentaneamente non disponibile.'; });
    } catch { $('map-loading').textContent='Mappa momentaneamente non disponibile.'; }
  }
  function setupMap(mapData) {
    area=RULES.cleanMap(mapData);
    if (!area) return;
    $('map-section').classList.remove('hidden');
    $('map-subtitle').textContent=`${area.label} · La mappa indica la zona, non l’indirizzo esatto dell’immobile.`;
    $('filters').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      category=button.dataset.category; $('filters').querySelectorAll('button').forEach(b => b.classList.toggle('active',b===button)); if (map) renderPois();
    }));
    if ('IntersectionObserver' in window) {
      const observer=new IntersectionObserver(entries => { if (entries[0].isIntersecting) { observer.disconnect(); initMap(); } },{rootMargin:'300px'});
      observer.observe($('map-section'));
    } else initMap();
  }

  (async () => {
    try {
      const r=await fetch('/api/smartlink/read?id='+encodeURIComponent(id),{cache:'no-store'});
      if (!r.ok) return showError();
      const body=await r.json(), d=body.listing;
      if (!body.ok || !d || 'sourceUrl' in d || 'source' in d) return showError();
      set('title',d.title || 'Una casa a Roma');
      if (d.zone) { set('zone','Roma · '+d.zone); set('zone-row',d.zone); } else $('zone').classList.add('hidden');
      if (d.price) { set('price','€ '+fmt(d.price)); set('price-period','/ mese'); }
      for (const [value,label] of [[d.sqm,'m²'],[d.rooms,'locali']]) if (value) { const chip=document.createElement('div'); chip.className='pill'; const strong=document.createElement('strong'); strong.textContent=String(value); chip.append(strong,' '+label); $('summary').append(chip); }
      if (d.note) { set('note',d.note); $('note-wrap').classList.remove('hidden'); }
      if (d.observedAt) { const dt=new Date(d.observedAt); if (!isNaN(dt)) set('observed',new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(dt)); }
      const msg=`Ciao BOOM, vorrei informazioni su questa casa: ${location.href}`;
      $('contact').href='https://wa.me/393313251961?text='+encodeURIComponent(msg);
      document.title=(d.title || 'Una casa')+' · BOOM';
      gallery(d.images); setupMap(d.map);
      $('loading').classList.add('hidden'); $('page').classList.remove('hidden');
    } catch { showError(); }
  })();
})();
