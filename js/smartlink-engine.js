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
  function positiveNumber(v, max) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null;
  }
  function makeRecord(input, now) {
    const source = normalizeUrl(input.sourceUrl);
    if (!source) return null;
    return {
      sourceUrl: source.url,
      source: source.source,
      title: cleanText(input.title, 130) || 'Annuncio su ' + source.source,
      price: positiveNumber(input.price, 1000000),
      zone: cleanText(input.zone, 90),
      sqm: positiveNumber(input.sqm, 100000),
      rooms: positiveNumber(input.rooms, 100),
      note: cleanText(input.note, 400),
      observedAt: now,
      availability: 'Da verificare',
      active: true,
    };
  }
  const API = { SOURCES, sourceFor, normalizeUrl, cleanText, positiveNumber, makeRecord };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SMARTLINK = API;
})(typeof window !== 'undefined' ? window : this);
