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
    'Casafari': /^(?:[a-z0-9-]+\.)?casafari\.com$/,
    'Casa.it': /^(?:[a-z0-9-]+\.)?casa\.it$/,
  };
  function photoUrl(raw, sourceName) {
    try {
      const value = String(raw || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.port || u.username || u.password || u.hash || !PHOTO_HOSTS[sourceName]?.test(u.hostname.toLowerCase())) return null;
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
  function cleanMap(input) {
    if (!input || typeof input !== 'object') return null;
    const lat = Number(input.lat), lng = Number(input.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 41.70 || lat > 42.05 || lng < 12.25 || lng > 12.75) return null;
    return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000, label: cleanText(input.label, 70) || 'Roma', precision: 'area' };
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
  const API = { SOURCES, sourceFor, normalizeUrl, cleanText, publicText, positiveNumber, photoUrl, photoCandidates, validImageUrl, validPublicImageUrl, cleanImages, cleanMap, distanceKm, makeRecord, publicRecord };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SMARTLINK = API;
})(typeof window !== 'undefined' ? window : this);
