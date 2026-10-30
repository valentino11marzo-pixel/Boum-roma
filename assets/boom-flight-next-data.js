/* The isolated Flight Next proposal reads the public catalogue once per load.
 * This adapter owns display shape, never availability, fees or persistent data. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(root, require('../js/listing-facts.js'), require('../js/dispo-engine.js'));
  else root.BoomNextData = factory(root, root.BOOM_FACTS, root.BOOM_DISPO);
})(typeof window !== 'undefined' ? window : globalThis, function (root, Facts, Dispo) {
  'use strict';
  var inFlight = null;
  var ID = /^[A-Za-z0-9_-]{1,120}$/;
  var PUBLIC = ['available', 'waitlist', 'rented', 'reserved'];
  function text(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
  function positive(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
    var n = Number(value); return isFinite(n) && n > 0 ? n : null;
  }
  function safeImage(value) {
    if (typeof value !== 'string' || /[\\\u0000-\u0020\u007f]/.test(value)) return '';
    if (/^\/(?!\/)/.test(value)) return value;
    try {
      var url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch (_) { return ''; }
  }
  function normalize(raw, today) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.id !== 'string' || !ID.test(raw.id)) return null;
    var name = text(raw.name || raw.title), state = text(raw.status).toLowerCase();
    if (!name || PUBLIC.indexOf(state) < 0) return null;
    var images = (Array.isArray(raw.images) ? raw.images : []).map(safeImage).filter(Boolean);
    if (!images.length) images = [safeImage(raw.coverImage), safeImage(raw.image)].filter(Boolean);
    images = images.filter(function (url, index) { return images.indexOf(url) === index; });
    var availability = Dispo && Dispo.laneCopy ? Dispo.laneCopy(raw, 'en', today) : null;
    var facts = Facts || {}, features = (Array.isArray(raw.features) ? raw.features : Array.isArray(raw.tags) ? raw.tags : []);
    return {
      id: raw.id, name: name, zone: text(raw.zone || raw.neighborhood), type: text(raw.type),
      price: positive(raw.price), area: positive(raw.sqm != null ? raw.sqm : raw.size),
      bedrooms: facts.bedroomsOf ? facts.bedroomsOf(raw) : null, bathrooms: positive(raw.bathrooms),
      images: images, image: images[0] || '', description: text(raw.description),
      features: features.map(text).filter(Boolean), furnished: facts.furnishedOf ? facts.furnishedOf(raw.furnished) : null,
      billsIncluded: facts.billsIncluded ? facts.billsIncluded(raw) : null,
      status: availability ? availability.short : 'Availability to confirm',
      statusDetail: availability ? availability.long : 'Ask BOOM for the exact date.',
      lane: availability ? availability.lane : 'unknown',
      canonicalUrl: '/listing/' + raw.id, raw: raw
    };
  }
  function cards(records, criteria) {
    criteria = criteria || {};
    var budget = positive(criteria.budgetMax), type = text(criteria.type).toLowerCase();
    var beds = criteria.bedrooms, wanted = null;
    if ((typeof beds === 'number' || typeof beds === 'string') && /^\d+$/.test(String(beds))) {
      var n = Number(beds); if (Number.isInteger(n) && n >= 0 && n <= 10) wanted = n;
    }
    return (Array.isArray(records) ? records : []).filter(function (card) {
      if (!card || !ID.test(String(card.id || ''))) return false;
      if (budget && (card.price == null || card.price > budget)) return false;
      if (type && text(card.type).toLowerCase() !== type) return false;
      if (wanted !== null && (card.bedrooms == null || (wanted === 0 ? card.bedrooms !== 0 : card.bedrooms < wanted))) return false;
      return true;
    });
  }
  function failure(code) { var error = new Error('The current homes could not be loaded. Please try again.'); error.code = code; return error; }
  function load() {
    if (inFlight) return inFlight;
    var controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    var timer = root.setTimeout(function () { if (controller) controller.abort(); }, 15000);
    // Only concurrent requests share a promise. A later load rereads the server;
    // no localStorage, sessionStorage or catalogue snapshot becomes a second truth.
    inFlight = Promise.resolve().then(function () {
      return root.fetch('/api/listings', { cache: 'no-store', signal: controller ? controller.signal : undefined });
    }).then(function (response) {
      if (!response.ok) throw failure('catalogue-http');
      return response.json();
    }).then(function (data) {
      if (!data || data.ok !== true || !Array.isArray(data.listings)) throw failure('catalogue-shape');
      var seen = Object.create(null);
      return data.listings.map(function (raw) { return normalize(raw); }).filter(function (card) {
        if (!card || seen[card.id]) return false; seen[card.id] = true; return true;
      });
    }).catch(function (error) {
      if (error && /^catalogue-/.test(error.code || '')) throw error;
      throw failure(controller && controller.signal.aborted ? 'catalogue-timeout' : 'catalogue-network');
    }).finally(function () { root.clearTimeout(timer); inFlight = null; });
    return inFlight;
  }
  return { load: load, normalize: normalize, cards: cards };
});
