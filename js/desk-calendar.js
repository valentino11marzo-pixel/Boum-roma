/* js/desk-calendar.js — IL CALENDARIO DEI DESK CITTÀ, una copia sola.
 *
 * Lo leggono il webhook dei pagamenti (api/stripe-webhook.js: la fine del
 * recesso di 14 giorni e il giorno in cui il lavoro comincia) e le pagine
 * città (inlinato dal build fra i marcatori BOOM_CALENDAR: la finestra del
 * desk stampata sotto la porta). Prima le tabelle vivevano solo nel
 * webhook, e la pagina diceva «desk open» anche a Koningsdag, alla Diada e
 * a Natale; e prendeva la sigla del fuso di OGGI anche per un'apertura di
 * domani (domenica 25 ottobre 2026: «Tomorrow from 09:00 CEST», ma lunedì
 * è già CET).
 *
 * Le regole:
 *   - l'Italia vale sempre (il desk risponde da Roma), più il calendario del
 *     paese del desk (`nl`, `es`, `es-bcn`); una chiave ignota vale l'Italia
 *     sola — i test fissano le chiavi che i desk nominano (HOLIDAY_KEYS);
 *   - date in UTC a mezzogiorno di calendario (mai 14×24h: il cambio d'ora);
 *   - la sigla del fuso è quella dell'ISTANTE in cui il desk apre.
 *
 * Nessuna dipendenza, nessuna rete. UMD: `require`, `import` e
 * window.BOOM_DESK_CAL. */
(function (root) {
  'use strict';

  // Easter Sunday, Gregorian (Meeus/Jones/Butcher), as [month, day].
  function easterOf(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var n = h + l - 7 * m + 114;
    return [Math.floor(n / 31), (n % 31) + 1];
  }

  // Fixed dates as MM-DD, Easter-relative ones as offsets in days.
  var HOLIDAYS = {
    // national, plus Rome's patron day (29 June); 4 October is a national
    // holiday again from 2026
    it: { fixed: ['01-01', '01-06', '04-25', '05-01', '06-02', '06-29', '08-15', '10-04', '11-01', '12-08', '12-25', '12-26'], easter: [1] },
    // Nieuwjaar, Koningsdag (26 April when the 27th is a Sunday), Bevrijdingsdag,
    // Kerst; Goede Vrijdag, Paasmaandag, Hemelvaart, Pinkstermaandag
    nl: { fixed: ['01-01', '04-27', '05-05', '12-25', '12-26'], easter: [-2, 1, 39, 50], kingsDay: true },
    // national, plus the Comunidad and the city of Madrid (2 May, San Isidro,
    // La Almudena); Jueves and Viernes Santo
    es: { fixed: ['01-01', '01-06', '05-01', '05-02', '05-15', '08-15', '10-12', '11-01', '11-09', '12-06', '12-08', '12-25'], easter: [-3, -2] },
    // the Barcelona desk: Catalonia's labour calendar (DOGC: Ordre EMT/66/2025
    // for 2026, EMT/52/2026 for 2027 — Cap d'Any, Reis, Treball, Sant Joan,
    // Assumpció, Diada, Festa Nacional, Tots Sants, Constitució, Immaculada,
    // Nadal, Sant Esteve; Divendres Sant and Dilluns de Pasqua Florida, NO
    // Dijous Sant) plus the city of Barcelona's two local days (Pasqua
    // Granada = Easter+50, La Mercè 24 Sept). Catalonia drops whichever of
    // 15/8, 1/11, 6/12, 26/12 fall on a Sunday: listing all four is exact
    // for 2026-2027 and only ever ADDS a day. When La Mercè falls on a Sunday
    // the city keeps it on Monday the 25th (2023; next in 2028): `merceMonday`,
    // the same move as Koningsdag in nl. The two local days are set each June
    // by mayoral decree: re-check yearly. Keyed apart from `country`, which
    // also drives the +34 phone reading in api/_market.js.
    'es-bcn': { fixed: ['01-01', '01-06', '05-01', '06-24', '08-15', '09-11', '09-24', '10-12', '11-01', '12-06', '12-08', '12-25', '12-26'], easter: [-2, 1, 50], merceMonday: true }
  };
  // the calendar keys a desk may name (CITY_MARKETS.<slug>.holidays || country):
  // an unknown key would silently fall back to Italy alone, so tests pin it
  var HOLIDAY_KEYS = Object.keys(HOLIDAYS);

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* is (y, m, d) a holiday for Italy or the desk's calendar `key` */
  function isHoliday(y, m, d, key) {
    var mmdd = pad(m) + '-' + pad(d), em = easterOf(y), keys = ['it', key];
    for (var j = 0; j < keys.length; j++) {
      var h = HOLIDAYS[keys[j]];
      if (!h) continue;
      if (h.fixed.indexOf(mmdd) >= 0) return true;
      if (h.kingsDay && mmdd === '04-26' && new Date(Date.UTC(y, 3, 27)).getUTCDay() === 0) return true;
      if (h.merceMonday && mmdd === '09-25' && new Date(Date.UTC(y, 8, 24)).getUTCDay() === 0) return true;
      for (var q = 0; q < h.easter.length; q++) {
        var x = new Date(Date.UTC(y, em[0] - 1, em[1] + h.easter[q]));
        if (x.getUTCMonth() + 1 === m && x.getUTCDate() === d) return true;
      }
    }
    return false;
  }
  /* the same, on a UTC calendar date (the webhook's form) */
  function isDeskHoliday(date, key) {
    return isHoliday(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), key);
  }
  function workingDay(date, key) {
    var w = date.getUTCDay();
    return w !== 0 && w !== 6 && !isDeskHoliday(date, key);
  }

  /* the clock of a zone at an instant: year, month, day, weekday, minutes
     into the day and the zone's short name (CET/CEST) — null when Intl
     cannot say */
  var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function zoneParts(at, tz) {
    var o = {};
    try {
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz || 'Europe/Rome', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short', timeZoneName: 'short'
      }).formatToParts(at).forEach(function (x) { o[x.type] = x.value; });
    } catch (e) { return null; }
    if (!o.year || WD[o.weekday] === undefined) return null;
    var name = String(o.timeZoneName || '');
    // a runtime that prints "GMT+2" instead of "CEST": the label is derived
    // from the offset for the one zone the desks use, else left empty
    if (!/^[A-Z]{2,5}$/.test(name)) name = /\+2$/.test(name) ? 'CEST' : /\+1$/.test(name) ? 'CET' : '';
    return {
      y: +o.year, m: +o.month, d: +o.day, wd: WD[o.weekday],
      min: (+o.hour % 24) * 60 + (+o.minute), tz: name, key: o.year + '-' + pad(+o.month) + '-' + pad(+o.day)
    };
  }

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function toMin(s) { var a = String(s).split(':'); return (+a[0]) * 60 + (+a[1]); }

  /* is the desk open at the instant `at` */
  function openAt(p, desk, key) {
    return desk.days.indexOf(p.wd) >= 0 && !isHoliday(p.y, p.m, p.d, key)
      && p.min >= toMin(desk.hours.from) && p.min < toMin(desk.hours.to);
  }

  /* The desk window, said in words, at the instant `now`:
       open   → { open: true,  until: '19:00', tz: 'CET', line: 'desk open until 19:00 CET' }
       closed → { open: false, day: 'Tomorrow', from: '09:00', tz: 'CET', line: 'Tomorrow from 09:00 CET' }
     The zone name is the one of the OPENING instant, never today's. The
     search walks forward in 15-minute steps (a desk opens on the quarter)
     for at most three weeks: Christmas plus a weekend fits easily.
     `desk` is { timeZone, hours: {from, to}, days: [0..6] }. */
  function deskWindow(now, desk, key) {
    if (!desk || !desk.hours || !Array.isArray(desk.days)) return null;
    var tz = desk.timeZone || 'Europe/Rome';
    var p = zoneParts(now, tz);
    if (!p) return null;
    if (openAt(p, desk, key)) return { open: true, until: desk.hours.to, tz: p.tz, line: 'desk open until ' + desk.hours.to + (p.tz ? ' ' + p.tz : '') };
    var step = 9e5, t = new Date(Math.ceil(now.getTime() / step) * step);
    var tomorrow = zoneParts(new Date(now.getTime() + 864e5), tz);
    for (var i = 0; i < 21 * 96; i++, t = new Date(t.getTime() + step)) {
      var q = zoneParts(t, tz);
      if (q && openAt(q, desk, key)) {
        var day = q.key === p.key ? 'Today' : tomorrow && q.key === tomorrow.key ? 'Tomorrow' : DAY_NAMES[q.wd];
        return { open: false, day: day, from: desk.hours.from, tz: q.tz, line: day + ' from ' + desk.hours.from + (q.tz ? ' ' + q.tz : '') };
      }
    }
    return null;
  }

  var API = {
    HOLIDAYS: HOLIDAYS, HOLIDAY_KEYS: HOLIDAY_KEYS, easterOf: easterOf,
    isHoliday: isHoliday, isDeskHoliday: isDeskHoliday, workingDay: workingDay,
    zoneParts: zoneParts, deskWindow: deskWindow
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_DESK_CAL = API;
})(typeof window !== 'undefined' ? window : this);
