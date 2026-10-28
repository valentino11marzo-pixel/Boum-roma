/* Requested stay, not lease eligibility. The public catalogue does not
   declare lease-length bounds. Never infer them from deposits or prose. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_STAY = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var choices = [1, 3, 6, 12, 18, 24];
  function months(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (!/^\d{1,2}$/.test(String(value))) return null;
    var n = Number(value);
    return choices.indexOf(n) >= 0 ? n : null;
  }
  function read(search) {
    try { return months(new URLSearchParams(search || '').get('stay')); }
    catch (_) { return null; }
  }
  function label(value) {
    var n = months(value);
    return n ? n + (n === 1 ? ' month' : ' months') : '';
  }
  function withStay(path, value) {
    if (typeof path !== 'string' || !/^\/(?!\/)/.test(path) || /[\\\s]/.test(path)) return path;
    try {
      var url = new URL(path, 'https://www.boomrome.com'), n = months(value);
      if (n) url.searchParams.set('stay', String(n));
      else url.searchParams.delete('stay');
      return url.pathname + url.search + url.hash;
    } catch (_) { return path; }
  }
  return { choices: choices.slice(), months: months, read: read, label: label, withStay: withStay };
});
