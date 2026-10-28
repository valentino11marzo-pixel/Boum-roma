/* Requested stay, not lease eligibility. Calendar rules live here; prices
   remain in the existing quote controller. Move-out is the departure date. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_STAY = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var choices = [3, 6, 12, 18, 24], DAY = 86400000;
  function months(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (!/^\d{1,3}$/.test(String(value))) return null;
    var n = Number(value);
    // Three months is BOOM Terms 3.1. Ten years is a technical planning
    // range, not a claim about a home's maximum lease length.
    return n >= 3 && n <= 120 ? n : null;
  }
  function utc(y, m, d) {
    var value = new Date(0); value.setUTCFullYear(y, m - 1, d); value.setUTCHours(0, 0, 0, 0); return value;
  }
  function iso(value) {
    return String(value.getUTCFullYear()).padStart(4, '0') + '-'
      + String(value.getUTCMonth() + 1).padStart(2, '0') + '-' + String(value.getUTCDate()).padStart(2, '0');
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var parts = value.split('-').map(Number);
    return parts[0] >= 1 && iso(utc(parts[0], parts[1], parts[2])) === value ? value : null;
  }
  function addMonths(start, count) {
    if (!date(start) || !Number.isInteger(count)) return null;
    var a = start.split('-').map(Number), total = a[0] * 12 + a[1] - 1 + count;
    var year = Math.floor(total / 12), month = total - year * 12 + 1;
    if (year < 1 || year > 9999) return null;
    var last = utc(year, month + 1, 0).getUTCDate();
    return iso(utc(year, month, Math.min(a[2], last)));
  }
  function period(from, until) {
    if (!date(from) || !date(until) || until <= from) return null;
    var a = from.split('-').map(Number), b = until.split('-').map(Number);
    var whole = (b[0] - a[0]) * 12 + b[1] - a[1];
    if (addMonths(from, whole) > until) whole--;
    var anchor = addMonths(from, whole).split('-').map(Number);
    var days = Math.round((utc(b[0], b[1], b[2]) - utc(anchor[0], anchor[1], anchor[2])) / DAY);
    var minimum = addMonths(from, 3);
    return { wholeMonths: whole, days: days, months: days === 0 ? months(whole) : null,
      meetsMinimum: !!minimum && until >= minimum };
  }
  function normalize(input) {
    input = input || {};
    var start = date(input.moveIn), end = date(input.moveOut), n = months(input.durationMonths);
    if (input.moveOut && !end) n = null;
    if (start && !end && !input.moveOut && n) end = addMonths(start, n);
    if (start && end) { var p = period(start, end); n = p && p.meetsMinimum ? p.months : null; }
    return { moveIn: start, moveOut: end, durationMonths: n };
  }
  function validate(input) {
    input = input || {};
    if (input.moveIn && !date(input.moveIn)) return { field: 'moveIn', message: 'Choose a valid arrival date.' };
    if (input.moveOut && !date(input.moveOut)) return { field: 'moveOut', message: 'Choose a valid departure date.' };
    var start = date(input.moveIn), end = date(input.moveOut);
    if (start && !end) return { field: 'moveOut', message: 'Choose your departure date, or clear both dates.' };
    if (end && !start) return { field: 'moveIn', message: 'Choose your arrival date, or clear both dates.' };
    if (!start && !end) return null;
    if (start && !addMonths(start, 3)) return { field: 'moveIn', message: 'Choose an earlier arrival date within the supported calendar.' };
    if (end <= start) return { field: 'moveOut', message: 'Departure must be after arrival.' };
    if (!period(start, end).meetsMinimum) return { field: 'moveOut', message: 'BOOM stays start at 3 months. Choose ' + addMonths(start, 3) + ' or later.' };
    if (end > addMonths(start, 120)) return { field: 'moveOut', message: 'Use a range within 10 years here; ask BOOM about a longer stay.' };
    return null;
  }
  function intent(search, hash) {
    try {
      var q = new URLSearchParams(search || ''), h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
      return normalize({ moveIn: q.get('moveIn') || h.get('dal'), moveOut: q.get('moveOut'), durationMonths: q.get('stay') });
    } catch (_) { return normalize(); }
  }
  function read(search) { return intent(search).durationMonths; }
  function label(value) { var n = months(value); return n ? n + ' months' : ''; }
  function summary(value) {
    var i = normalize(value), p = period(i.moveIn, i.moveOut);
    if (i.moveIn && i.moveOut && p) return i.moveIn + ' → ' + i.moveOut + ' · ' + p.wholeMonths + ' months' + (p.days ? ' + ' + p.days + (p.days === 1 ? ' day' : ' days') : '');
    if (i.moveIn) return 'From ' + i.moveIn + ' · departure to choose';
    if (i.moveOut) return 'Until ' + i.moveOut + ' · arrival to choose';
    return label(i.durationMonths);
  }
  function localURL(path) {
    if (typeof path !== 'string' || !/^\/(?!\/)/.test(path) || /[\\\s]/.test(path)) return null;
    try { return new URL(path, 'https://www.boomrome.com'); } catch (_) { return null; }
  }
  function withIntent(path, value) {
    var url = localURL(path); if (!url) return path;
    var i = normalize(value);
    [['stay', i.durationMonths], ['moveIn', i.moveIn], ['moveOut', i.moveOut]].forEach(function (pair) {
      if (pair[1]) url.searchParams.set(pair[0], String(pair[1])); else url.searchParams.delete(pair[0]);
    });
    return url.pathname + url.search + url.hash;
  }
  function withStay(path, value) {
    var url = localURL(path); if (!url) return path;
    var n = months(value);
    if (n) url.searchParams.set('stay', String(n)); else url.searchParams.delete('stay');
    return url.pathname + url.search + url.hash;
  }
  return { choices: choices.slice(), months: months, date: date, addMonths: addMonths, period: period,
    normalize: normalize, validate: validate, intent: intent, read: read, label: label, summary: summary,
    withIntent: withIntent, withStay: withStay };
});
