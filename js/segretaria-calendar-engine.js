/* Small calendar boundary, not a natural-language scheduling parser.
 * Source dates are evidence; this module never rewrites a proposed appointment.
 * Unqualified IT/EN weekdays, D/M[/YYYY], ISO dates, D month [YYYY] and HH:MM
 * are supported. Same-day/qualified weekdays and DST gaps/folds stay ambiguous.
 */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports
    ? require('./segretaria-proposta-engine.js') : root.BOOM_PROPOSTA);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BOOM_SEGRETARIA_CALENDAR = api;
})(typeof window !== 'undefined' ? window : this, function (PROPOSTA) {
  'use strict';
  const TIME_ZONE = 'Europe/Rome';
  const DAY = 86400000;
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekdays = { domenica: 0, sunday: 0, lunedi: 1, monday: 1, martedi: 2, tuesday: 2,
    mercoledi: 3, wednesday: 3, giovedi: 4, thursday: 4, venerdi: 5, friday: 5, sabato: 6, saturday: 6 };
  const months = { gennaio: 1, january: 1, febbraio: 2, february: 2, marzo: 3, march: 3,
    aprile: 4, april: 4, maggio: 5, may: 5, giugno: 6, june: 6, luglio: 7, july: 7,
    agosto: 8, august: 8, settembre: 9, september: 9, ottobre: 10, october: 10,
    novembre: 11, november: 11, dicembre: 12, december: 12 };
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const clean = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pad = n => String(n).padStart(2, '0');
  const dateKey = (y, m, d) => String(y).padStart(4, '0') + '-' + pad(m) + '-' + pad(d);
  const unique = values => [...new Set(values)];
  function validDate(y, m, d) {
    if (!Number.isInteger(y) || y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function instant(value) {
    if (typeof value === 'number' || value instanceof Date) return Number.isFinite(+value) ? +value : NaN;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value || '');
    if (!m || !validDate(+m[1], +m[2], +m[3]) || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) return NaN;
    return Date.parse(value);
  }
  function local(ms) {
    if (!Number.isFinite(ms)) return null;
    const p = Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]));
    return { date: dateKey(p.year, p.month, p.day), time: pad(p.hour) + ':' + pad(p.minute),
      year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second,
      weekday: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
  }
  const dateMs = date => Date.parse(date + 'T12:00:00Z');
  const addDays = (date, days) => new Date(dateMs(date) + days * DAY).toISOString().slice(0, 10);
  // Derive offsets from IANA data on either side of the local date. Validate
  // every candidate by round-trip: zero matches = gap; two = repeated hour.
  function wallInstants(date, hour, minute) {
    const guess = Date.parse(date + 'T' + pad(hour) + ':' + pad(minute) + ':00Z');
    const offsets = unique([-36, -12, 0, 12, 36].map(h => {
      const at = guess + h * 3600000, p = local(at);
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at;
    }));
    return unique(offsets.map(offset => guess - offset).filter(at => {
      const p = local(at); return p.date === date && p.hour === hour && p.minute === minute;
    })).sort((a, b) => a - b);
  }
  function tokens(text) {
    const s = clean(text), days = [], dates = [], times = [];
    const dayRe = new RegExp('\\b(' + Object.keys(weekdays).join('|') + ')\\b', 'g');
    for (const m of s.matchAll(dayRe)) days.push({ weekday: weekdays[m[1]], index: m.index, end: m.index + m[0].length });
    for (const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))
      dates.push({ year: +m[1], month: +m[2], day: +m[3], index: m.index, end: m.index + m[0].length });
    for (const m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g))
      dates.push({ year: m[3] ? +m[3] : null, month: +m[2], day: +m[1], index: m.index, end: m.index + m[0].length });
    const monthRe = new RegExp('\\b(\\d{1,2})\\s+(' + Object.keys(months).join('|') + ')(?:\\s+(\\d{4}))?\\b', 'g');
    for (const m of s.matchAll(monthRe)) dates.push({ year: m[3] ? +m[3] : null,
      month: months[m[2]], day: +m[1], index: m.index, end: m.index + m[0].length });
    for (const m of s.matchAll(/\b(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/g)) {
      let hour = +m[1]; const minute = +m[2];
      const valid = minute <= 59 && (m[3] ? hour >= 1 && hour <= 12 : hour <= 23);
      if (m[3]) hour = hour % 12 + (m[3] === 'pm' ? 12 : 0);
      times.push({ hour, minute, valid });
    }
    return { text: s, days, dates, times };
  }
  function buildCalendarContext({ sources = [], now = Date.now() } = {}) {
    const clock = local(instant(now)), anchors = [], references = [];
    for (const source of sources.slice(0, 40)) {
      if (!['message', 'phone_call', undefined].includes(source.kind) || source.analysisAvailable === false
        || (source.textAvailable === false && source.analysisAvailable !== true)) continue;
      const text = source.analysisText ?? source.text;
      // The transport's quoted outgoing message is not a new dated promise.
      if (PROPOSTA.isReaction(text)) continue;
      const at = instant(source.at), p = local(at), parsed = tokens(text);
      const id = source.id || source.ref;
      if (!id) continue;
      if (p) anchors.push({ sourceId: id, sourceAt: new Date(at).toISOString(), localDate: p.date, weekday: names[p.weekday] });
      if (!parsed.days.length) continue;
      for (const day of parsed.days) {
        const ref = { sourceId: id, weekday: names[day.weekday], weekdayIndex: day.weekday,
          date: null, localTime: null, eventAt: null, status: 'ambiguous', reason: null };
        const qualified = /\b(?:next|last|following|previous|prossim\w*|scors\w*|successiv\w*|precedente)\b/.test(parsed.text);
        const otherContext = /\b(?:every|each|ogni)\b|\b(?:we met|we visited|ci siamo visti|ci siamo incontrati|si e svolta)\b/.test(parsed.text);
        if (!p) ref.reason = 'source_time_unverified';
        else if (parsed.days.length !== 1 || parsed.dates.length > 1 || parsed.times.length > 1) ref.reason = 'multiple_calendar_references';
        else if (parsed.dates.length) {
          const d = parsed.dates[0], y = d.year || p.year;
          if (!validDate(y, d.month, d.day)) ref.reason = 'invalid_source_date';
          else {
            ref.date = dateKey(y, d.month, d.day);
            if (new Date(dateMs(ref.date)).getUTCDay() !== day.weekday) ref.reason = 'source_weekday_date_conflict';
            else if (!d.year && Math.abs(dateMs(ref.date) - dateMs(p.date)) > 183 * DAY) ref.reason = 'source_year_ambiguous';
          }
        } else if (qualified || otherContext) ref.reason = 'qualified_weekday_ambiguous';
        else {
          const offset = (day.weekday - p.weekday + 7) % 7;
          if (!offset) ref.reason = 'same_weekday_ambiguous';
          else ref.date = addDays(p.date, offset);
        }
        if (!ref.reason && ref.date && parsed.times.length) {
          const t = parsed.times[0];
          if (!t.valid) ref.reason = 'invalid_source_time';
          else if (/\b(?:utc|gmt|bst|est|pst|cst|cet|cest)\b/.test(parsed.text)) ref.reason = 'explicit_time_zone_unresolved';
          else {
            ref.localTime = pad(t.hour) + ':' + pad(t.minute);
            const candidates = wallInstants(ref.date, t.hour, t.minute);
            if (candidates.length !== 1) ref.reason = candidates.length ? 'repeated_local_time' : 'nonexistent_local_time';
            else ref.eventAt = new Date(candidates[0]).toISOString();
          }
        }
        if (!ref.reason && ref.date) ref.status = clock && (ref.eventAt ? instant(ref.eventAt) < instant(now) : ref.date < clock.date) ? 'past' : 'resolved';
        references.push(ref);
      }
    }
    return { timeZone: TIME_ZONE, today: clock?.date || null, anchors, references,
      limitations: ['Only explicit IT/EN weekdays with simple calendar dates and HH:MM are interpreted; date-only source events and free-form timezone names are not resolved.',
        'A resolved date does not prove an appointment, its confirmation, its owner or completion.',
        'Missing or multiple events, qualified/same-day weekdays and DST gaps/folds require clarification.'] };
  }
  function validateCalendarProposal(proposal, { calendar } = {}) {
    const issues = [], refs = calendar?.references || [];
    const issue = (code, matches = []) => {
      const sourceIds = unique(matches.map(r => r.sourceId));
      if (!issues.some(i => i.code === code && JSON.stringify(i.sourceIds) === JSON.stringify(sourceIds))) issues.push({ code, sourceIds });
    };
    const scoped = item => {
      const selected = refs.filter(r => (item?.sourceIds || []).includes(r.sourceId));
      return selected.length ? selected : refs;
    };
    const fields = [{ text: proposal?.summary }, { text: proposal?.recommendation },
      ...(proposal?.facts || []), ...(proposal?.commitments || []),
      proposal?.nextAction, proposal?.draft].filter(Boolean);
    for (const field of fields) {
      const parsed = tokens(field.text), relevant = scoped(field);
      for (const d of parsed.dates) {
        const nearby = parsed.days.filter(w => Math.min(Math.abs(w.end - d.index), Math.abs(d.end - w.index)) < 45);
        const candidates = nearby.length === 1 ? relevant.filter(r => r.weekdayIndex === nearby[0].weekday) : relevant;
        const supported = candidates.filter(r => r.date && r.status !== 'ambiguous');
        const years = unique(supported.map(r => +r.date.slice(0, 4)));
        const year = d.year || (years.length === 1 ? years[0] : null);
        const appointment = /\b(?:visita|appuntamento|sopralluogo|appointment|viewing|visit|meeting)\b/.test(parsed.text);
        if (!nearby.length && !appointment) continue;
        if (!year) { issue('calendar_year_ambiguous', candidates); continue; }
        if (!validDate(year, d.month, d.day)) { issue('calendar_invalid_date', candidates); continue; }
        const date = dateKey(year, d.month, d.day);
        if (nearby.length === 1 && new Date(dateMs(date)).getUTCDay() !== nearby[0].weekday)
          issue('calendar_weekday_date_conflict', candidates);
        if (supported.length && !supported.some(r => r.date === date)) issue('calendar_source_date_conflict', supported);
        if (!supported.length && candidates.some(r => r.status === 'ambiguous')) issue('calendar_source_ambiguous', candidates);
      }
    }
    const n = proposal?.nextAction || {}, controlText = clean([n.text, n.reason].filter(Boolean).join(' '))
      .replace(/\b(?:non\s+prima|not\s+before)\b[^.;!?]*/g, '');
    const previousDay = /\b(?:giorno|sera|mattina)\s+prima\b|\b(?:day|evening|morning)\s+before\b|\b(?:giorno|sera)\s+precedente\b/.test(controlText);
    const beforeEvent = previousDay || /\bprima\s+(?:dell[’']|della\s+|del\s+|di\s+)?(?:visita|appuntamento|sopralluogo)\b|\bbefore\s+(?:the\s+)?(?:visit|viewing|appointment|meeting)\b/.test(controlText);
    if (beforeEvent) {
      const relevant = scoped(n), supported = relevant.filter(r => r.date && r.status !== 'ambiguous');
      const events = unique(supported.map(r => r.date + '|' + (r.eventAt || '')));
      const check = instant(n.checkAt), checkLocal = local(check);
      if (!Number.isFinite(check)) issue('calendar_invalid_check_time', relevant);
      else if (events.length !== 1 || relevant.some(r => r.status === 'ambiguous')) issue('calendar_event_ambiguous', relevant);
      else {
        const event = supported[0];
        if (previousDay ? checkLocal.date >= event.date : event.eventAt ? check >= instant(event.eventAt) : checkLocal.date >= event.date)
          issue('calendar_check_not_before_event', supported);
      }
    }
    return issues.length ? { ok: false, error: issues[0].code, issues } : { ok: true, issues: [] };
  }
  return Object.freeze({ TIME_ZONE, buildCalendarContext, validateCalendarProposal });
});
