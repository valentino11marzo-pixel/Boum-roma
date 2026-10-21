/* SmartLink esterni: regole pure condivise da portale e API. */
(function (root) {
  'use strict';
  const SOURCES = [
    { host: 'immobiliare.it', name: 'Immobiliare.it' },
    { host: 'idealista.it', name: 'Idealista' },
    { host: 'subito.it', name: 'Subito' },
    { host: 'casafari.com', name: 'Casafari' },
    { host: 'casa.it', name: 'Casa.it' },
  ];
  function sourceFor(host) {
    return SOURCES.find(s => host === s.host || host.endsWith('.' + s.host)) || null;
  }
  function normalizeUrl(raw) {
    try {
      const u = new URL(String(raw || '').trim());
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) return null;
      const source = sourceFor(u.hostname.toLowerCase());
      if (!source || u.pathname === '/' || u.pathname.length < 5) return null;
      u.protocol = 'https:';
      u.hash = '';
      // Gli URL condivisi non conservano parametri di sessione o tracking.
      u.search = '';
      return { url: u.toString(), source: source.name };
    } catch { return null; }
  }
  function cleanText(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
  function publicText(v, max) {
    return cleanText(v, max).replace(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:immobiliare\.it|idealista\.it|subito\.it|casafari\.com|casa\.it)(?:\/[^\s]*)?/gi, '').replace(/\s+/g, ' ').trim();
  }
  function positiveNumber(v, max) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null;
  }
  const PHOTO_HOSTS = {
    'Immobiliare.it': /^(?:[a-z0-9-]+\.)?im-cdn\.it$/,
    'Idealista': /^(?:[a-z0-9-]+\.)?idealista\.(?:it|com)$/,
    'Subito': /^(?:[a-z0-9-]+\.)?subito\.it$/,
    // La galleria SmartLink CasaFari conserva anche il CDN originale Immobiliare.
    'Casafari': /^(?:[a-z0-9-]+\.)?(?:casafari\.com|im-cdn\.it)$/,
    'Casa.it': /^(?:[a-z0-9-]+\.)?casa\.it$/,
  };
  function photoUrl(raw, sourceName) {
    try {
      const value = String(raw || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.port || u.username || u.password || u.hash) return null;
      // CDN delle fotografie Subito osservato nella galleria pubblica: URL senza estensione.
      if(sourceName==='Subito' && u.hostname==='images.sbito.it') {
        if(!/^\/api\/v1\/sbt-ads-images-pro\/images\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u.pathname)) return null;
        u.search='?rule=fullscreen-1x-auto';
        return u.toString();
      }
      if(!PHOTO_HOSTS[sourceName]?.test(u.hostname.toLowerCase())) return null;
      if (!/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(u.pathname + u.search)) return null;
      if (/logo|avatar|icon|sprite|favicon|pixel|badge/i.test(u.pathname)) return null;
      return u.toString();
    } catch { return null; }
  }
  function photoCandidates(html, sourceName, initial = []) {
    const photos = [], seen = new Set();
    const add = raw => {
      const url = photoUrl(raw, sourceName);
      if (!url || seen.has(url) || photos.length >= 12) return;
      seen.add(url); photos.push(url);
    };
    (Array.isArray(initial) ? initial : [initial]).forEach(add);
    const h = String(html || '').slice(0, 2_000_000);
    const meta = /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi;
    for (const tag of h.match(meta) || []) {
      const m = tag.match(/content=["']([^"']+)["']/i);
      if (m) add(m[1]);
    }
    const re = /https:\\?\/\\?\/[a-z0-9.-]+(?:\\?\/[^\s"'<>`]+)?/gi;
    let m;
    while ((m = re.exec(h)) && photos.length < 12) add(m[0].replace(/[),;]+$/, ''));
    return photos;
  }
  function validImageUrl(raw, key) {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(String(key || ''))) return false;
      const u = new URL(String(raw || ''));
      if (u.origin !== 'https://firebasestorage.googleapis.com' || u.hash || u.username || u.password) return false;
      const prefix = '/v0/b/boom-property-dashboards.firebasestorage.app/o/';
      if (!u.pathname.startsWith(prefix) || u.searchParams.get('alt') !== 'media') return false;
      const path = decodeURIComponent(u.pathname.slice(prefix.length));
      return new RegExp('^smartlinks/' + key + '/[0-9a-f-]{36}\\.(?:jpg|jpeg|png|webp)$', 'i').test(path);
    } catch { return false; }
  }
  function validPublicImageUrl(raw) {
    try {
      const path = decodeURIComponent(new URL(String(raw)).pathname);
      const m = path.match(/\/o\/smartlinks\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i);
      return !!m && validImageUrl(raw, m[1]);
    } catch { return false; }
  }
  function cleanImages(images, key) {
    if (images == null) return [];
    if (!Array.isArray(images) || images.length > 12) return null;
    const unique = [...new Set(images.map(String))];
    if (unique.length !== images.length || unique.some(url => !validImageUrl(url, key))) return null;
    return unique;
  }
  // Foto già appartenenti allo stesso annuncio BOOM, anche da un'altra bozza.
  // La verifica si ripete sul server: il browser non può autorizzare un riuso.
  function reusableImages(record, sourceUrl, images, draftKey) {
    const source = normalizeUrl(sourceUrl);
    if (!source || record?.active !== true || normalizeUrl(record.sourceUrl)?.url !== source.url) return null;
    if (!Array.isArray(images) || !images.length || images.length > 12 || new Set(images).size !== images.length) return null;
    const archived = new Set((Array.isArray(record.images) ? record.images : []).filter(validPublicImageUrl));
    if (!archived.size || images.some(url => !archived.has(url) && !validImageUrl(url, draftKey))) return null;
    return images.slice();
  }
  function cleanMap(input) {
    if (!input || typeof input !== 'object') return null;
    if (input.lat == null || input.lng == null || input.lat === '' || input.lng === '') return null;
    const lat = Number(input.lat), lng = Number(input.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 41.70 || lat > 42.05 || lng < 12.25 || lng > 12.75) return null;
    return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000, label: cleanText(input.label, 70) || 'Roma', precision: 'area' };
  }
  function areaCandidates(query, zones) {
    const normalize = v => cleanText(v, 180).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const q = normalize(query);
    if (q.length < 3) return [];
    return Object.entries(zones || {}).filter(([name]) => {
      const n = normalize(name);
      return (' ' + q + ' ').includes(' ' + n + ' ') || n.startsWith(q);
    }).sort(([a], [b]) => b.length - a.length).slice(0, 6).map(([name, coords]) => cleanMap({
      ...coords, label: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') + ', Roma'
    })).filter(Boolean);
  }
  function areaCircle(area, meters = 650) {
    const coords = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64 * Math.PI * 2;
      coords.push([area.lng + meters * Math.cos(t) / (111320 * Math.cos(area.lat * Math.PI / 180)), area.lat + meters * Math.sin(t) / 111320]);
    }
    return { type:'Feature', geometry:{ type:'Polygon', coordinates:[coords] }, properties:{} };
  }
  function distanceKm(a, b) {
    if (!a || !b) return null;
    const lat1 = Number(a.lat), lng1 = Number(a.lng), lat2 = Number(b.lat), lng2 = Number(b.lng);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
    const rad = Math.PI / 180, dy = (lat2 - lat1) * rad, dx = (lng2 - lng1) * rad;
    const h = Math.sin(dy / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dx / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function makeRecord(input, now) {
    const source = normalizeUrl(input.sourceUrl);
    if (!source) return null;
    const images = cleanImages(input.images, input.idempotencyKey);
    if (!images) return null;
    const map = cleanMap(input.map);
    if (input.map != null && !map) return null;
    return {
      sourceUrl: source.url,
      source: source.source,
      title: cleanText(input.title, 130) || 'Una casa a Roma',
      price: positiveNumber(input.price, 1000000),
      zone: cleanText(input.zone, 90),
      sqm: positiveNumber(input.sqm, 100000),
      rooms: positiveNumber(input.rooms, 100),
      note: cleanText(input.note, 400),
      images,
      map,
      observedAt: now,
      availability: 'Da verificare',
      active: true,
    };
  }
  function publicRecord(d) {
    const { title, price, zone, sqm, rooms, note, images, map, observedAt, availability } = d;
    return { title: publicText(title,130) || 'Una casa a Roma', price, zone:publicText(zone,90), sqm, rooms, note:publicText(note,400), images: Array.isArray(images) ? images.filter(validPublicImageUrl).slice(0,12) : [], map: map ? { ...map, label:publicText(map.label,70) || 'Roma' } : null, observedAt, availability };
  }
  const API = { SOURCES, sourceFor, normalizeUrl, cleanText, publicText, positiveNumber, photoUrl, photoCandidates, validImageUrl, validPublicImageUrl, cleanImages, reusableImages, cleanMap, areaCandidates, areaCircle, distanceKm, makeRecord, publicRecord };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SMARTLINK = API;
})(typeof window !== 'undefined' ? window : this);
