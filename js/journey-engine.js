/* A public journey brief, not another saved catalogue or customer record.
   Private POIs stay in the calling controller and never enter a URL. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./stay-engine.js'), require('./mappa-engine.js'));
  else root.BOOM_JOURNEY = factory(root.BOOM_STAY, root.BOOM_MAPPA);
})(typeof window !== 'undefined' ? window : globalThis, function (STAY, MAPPA) {
  'use strict';
  var people = ['solo', 'couple', 'family', 'flatmates'], types = ['__entire', '__rooms'];
  var sensitive = /^(privateplace|private_place|lat|lng|lon|latitude|longitude|coordinates|address|name|email|phone|contact|token)$/i;
  function destination(value) {
    if (typeof value !== 'string') return null;
    return ((MAPPA && MAPPA.DESTINATIONS) || []).find(function (p) { return p.slug === value; }) || null;
  }
  function budget(value) {
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d{1,6}$/.test(String(value))) return null;
    var n = Number(value); return n >= 0 && n <= 100000 ? n : null;
  }
  function homes(values, allowed) {
    var seen = Object.create(null), valid = Array.isArray(allowed) ? new Set(allowed) : null;
    return (Array.isArray(values) ? values : []).filter(function (id) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || seen[id] || (valid && !valid.has(id))) return false;
      seen[id] = true; return true;
    }).slice(0, 3);
  }
  function normalize(value, options) {
    value = value && typeof value === 'object' ? value : {};
    options = options || {};
    var stay = STAY.normalize({moveIn:value.moveIn, moveOut:value.moveOut,
      durationMonths:value.durationMonths == null ? value.stay : value.durationMonths});
    return { place:destination(value.place) ? value.place : null,
      // Legacy POIs have no stable identifier. A transient reference is useful
      // only inside a controller; read() deliberately never restores it.
      privatePlace:typeof value.privatePlace === 'string' && /^poi:[0-3]$/.test(value.privatePlace) ? value.privatePlace : null,
      moveIn:stay.moveIn, moveOut:stay.moveOut, durationMonths:stay.durationMonths,
      budget:budget(value.budget), people:people.indexOf(value.people) >= 0 ? value.people : null,
      type:types.indexOf(value.type) >= 0 ? value.type : null,
      homes:homes(value.homes, options.allowedHomes) };
  }
  function read(search, options) {
    try {
      var q = new URLSearchParams(search || '');
      return normalize({place:q.get('place'), moveIn:q.get('moveIn'), moveOut:q.get('moveOut'),
        durationMonths:q.get('stay'), budget:q.get('budget'), people:q.get('people'), type:q.get('type'), homes:(q.get('homes') || '').split(',')}, options);
    } catch (_) { return normalize(); }
  }
  function localURL(path) {
    if (typeof path !== 'string' || !/^\/(?!\/)/.test(path) || /[\\\s]/.test(path)) return null;
    try { return new URL(path, 'https://www.boomrome.com'); } catch (_) { return null; }
  }
  function stripPrivate(query) {
    Array.from(query.keys()).forEach(function (key) { if (sensitive.test(key)) query.delete(key); });
  }
  function withIntent(path, value, options) {
    var url = localURL(path); if (!url) return path;
    var brief = normalize(value, options);
    stripPrivate(url.searchParams);
    if (url.hash.indexOf('=') >= 0) {
      var hash = new URLSearchParams(url.hash.slice(1)); stripPrivate(hash); url.hash = hash.toString();
    }
    [['place',brief.place], ['budget',brief.budget], ['people',brief.people], ['type',brief.type], ['homes',brief.homes.length ? brief.homes.join(',') : null]].forEach(function (pair) {
      if (pair[1] !== null) url.searchParams.set(pair[0],String(pair[1])); else url.searchParams.delete(pair[0]);
    });
    // Exact civil dates and duration are owned by the existing stay engine.
    return STAY.withIntent(url.pathname + url.search + url.hash, brief);
  }
  function share(value, options) {
    return withIntent('/flight-next?direction=club&view=apartments', value, options);
  }
  return Object.freeze({normalize:normalize, read:read, withIntent:withIntent, share:share, destination:destination});
});
