/* BOOM Flight — links derived from existing preferences, never a second catalogue. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_FLIGHT = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var ID = /^[A-Za-z0-9_-]{1,120}$/;
  function saved(raw) {
    var a; try { a = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return []; }
    if (!Array.isArray(a)) return [];
    return a.filter(function (s, i) {
      return typeof s === 'string' && /^\/listing\/[A-Za-z0-9_-]{1,120}$/.test(s) && a.indexOf(s) === i;
    }).slice(0, 100);
  }
  function skyline(paths) {
    var ids = saved(paths).slice(0, 20).map(function (p) { return p.slice(9); });
    return '/skyline' + (ids.length ? '?homes=' + ids.map(encodeURIComponent).join(',') : '');
  }
  function listing(id) { return ID.test(String(id || '')) ? '/listing/' + id : null; }
  return { saved: saved, skyline: skyline, listing: listing };
});
