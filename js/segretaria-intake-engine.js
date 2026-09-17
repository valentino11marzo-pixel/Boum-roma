/* Deterministic intake only, not a promise, calendar booking or language model.
 * A small accepted grammar keeps a source deadline visible before preparation.
 * Everything temporal outside that grammar requests immediate human review.
 */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports
    ? require('./segretaria-calendar-engine.js') : root.BOOM_SEGRETARIA_CALENDAR,
  typeof module !== 'undefined' && module.exports
    ? require('./segretaria-proposta-engine.js') : root.BOOM_PROPOSTA);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BOOM_SEGRETARIA_INTAKE = api;
})(typeof window !== 'undefined' ? window : this, function (CAL, PROPOSTA) {
  'use strict';
  const VERSION = 1;
  const clean = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pad = n => String(n).padStart(2, '0');
  const MARKER = /\b(?:entro|by|no later than|prima di|prima delle?|before)\b/g;
  const TEMPORAL = /\b\d{1,2}:\d{2}\b|\b(?:oggi|domani|dopodomani|today|tomorrow|tonight|stasera|mezzogiorno|mezzanotte|noon|midnight|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|monday|tuesday|wednesday|thursday|friday|saturday|sunday|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,2}[/-]\d{1,2}\b|\b(?:entro|by|before)\s+(?:(?:le|il|at)\s+)?\d{1,2}\b/;
  const UNCERTAIN = /\b(?:forse|magari|eventualmente|probabilmente|preferibilmente|dovrei|dovremmo|dovrebbe|se possibile|se riesco|da confermare|maybe|perhaps|possibly|probably|preferably|might|tentative|if possible|if I can)\b/i;
  const NEGATED = /\b(?:non|mai|not|never|don['’]t|doesn['’]t|isn['’]t|no need)\b/i;
  const HISTORICAL = /\b(?:avevo|avevamo|ieri|scors\w*|gia fatto|gia verificato|yesterday|last week|had asked|already done|used to)\b/i;
  const OTHER_ZONE = /\b(?:utc|gmt|bst|est|pst|cst|cet|cest|london|londra|new york|paris|parigi|tokyo)\b|\b(?:fuso|timezone|time zone)\b|\b(?:ora|time)\s+(?:di\s+|of\s+)?(?!roma\b|rome\b)\w+/;

  function extractRequestedTiming({ text, sourceAt, sourceMessageId, now = Date.now() } = {}) {
    if (typeof text !== 'string' || !text.trim() || PROPOSTA.isReaction(text)) return null;
    // Never accept a deadline from a truncated prefix: another time or a
    // retraction could be beyond the bound. The original message remains stored.
    const overflow = text.length > 12000;
    const bounded = text.slice(0, 12000);
    const clauses = bounded.split(/[!?;\n]|\.(?=\s|$)/).map(x => x.trim()).filter(Boolean);
    const candidates = clauses.filter(x => {
      const s = clean(x); return [...s.matchAll(MARKER)].length && TEMPORAL.test(s);
    });
    if (!candidates.length) return null;
    const quote = candidates.join(' … ').slice(0, 600);
    const evidence = { version: VERSION, status: 'ambiguous', reason: null,
      sourceMessageId: typeof sourceMessageId === 'string' ? sourceMessageId : null,
      sourceAt: typeof sourceAt === 'string' ? sourceAt : null,
      quote, requestedAt: null, timeZone: CAL.TIME_ZONE };
    const ambiguous = reason => ({ ...evidence, reason });
    if (overflow) return ambiguous('source_text_too_long');
    if (candidates.length !== 1) return ambiguous('multiple_requests');
    // Caller turns can retract an earlier request in a separate sentence.
    // Preserve uncertainty rather than accepting the earlier time.
    if (/\b(?:lascia(?:te)? perdere|non (?:serve|e necessario) piu|annull(?:a|ate) la richiesta|never mind|no longer needed|cancel (?:that|the request))\b/.test(clean(bounded))
      || clauses.some(x => /^(?:forse|magari|maybe|perhaps|non e confermato|not confirmed)$/i.test(clean(x))))
      return ambiguous('request_retracted_or_uncertain');
    const s = clean(candidates[0]);
    if (UNCERTAIN.test(s)) return ambiguous('tentative_request');
    // "No later than" is itself an affirmative upper bound; other negatives
    // keep their original evidence and cannot establish a promised hour.
    if (NEGATED.test(s.replace(/\bno later than\b/g, 'by'))) return ambiguous('negated_request');
    if (HISTORICAL.test(s) || /["“”«»]|\b(?:quoted|forwarded|ha detto|said)\b/.test(s)) return ambiguous('historical_or_quoted_request');
    if ([...s.matchAll(MARKER)].length !== 1) return ambiguous('multiple_requests');
    if (OTHER_ZONE.test(s.replace(/\b(?:ora di roma|rome time|ora di rome|ora roma)\b/g, ''))) return ambiguous('explicit_time_zone_unresolved');
    const anchor = CAL.romeLocalDate(sourceAt);
    if (!anchor) return ambiguous('source_time_unverified');
    const times = [...s.matchAll(/\b(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/g)];
    if (times.length !== 1) return ambiguous(times.length ? 'multiple_times' : 'time_unspecified');
    const t = times[0]; let hour = +t[1];
    if (+t[2] > 59 || (t[3] ? hour < 1 || hour > 12 : hour > 23)) return ambiguous('invalid_source_time');
    if (t[3]) hour = hour % 12 + (t[3] === 'pm' ? 12 : 0);
    const dates = [];
    for (const m of s.matchAll(/\b(oggi|today|domani|tomorrow)\b/g)) {
      const day = /^(domani|tomorrow)$/.test(m[1]) ? 1 : 0;
      dates.push(new Date(Date.parse(anchor + 'T12:00:00Z') + day * 86400000).toISOString().slice(0, 10));
    }
    for (const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) dates.push(`${m[1]}-${m[2]}-${m[3]}`);
    for (const m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) dates.push(`${m[3]}-${pad(m[2])}-${pad(m[1])}`);
    if (dates.length !== 1) return ambiguous(dates.length ? 'multiple_dates' : 'date_unspecified');
    // All tokens around the parsed instant must fit this deliberately small
    // grammar. An extra weekday, "or at 3", named date or approximation stays
    // unresolved instead of silently borrowing the first parseable time.
    const afterMarker = s.slice([...s.matchAll(MARKER)][0].index).replace(MARKER, '')
      .replace(/\b(?:oggi|today|domani|tomorrow)\b/g, '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '')
      .replace(/\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/g, '')
      .replace(/\b(?:alle|le|at|on|il|del|di|ora|roma|rome|time|per favore|please|grazie|thanks)\b/g, '')
      .replace(/[\s,()–—-]/g, '');
    if (afterMarker) return ambiguous('unsupported_timing_phrase');
    const resolved = CAL.resolveRomeWallTime(dates[0], pad(hour) + ':' + t[2]);
    if (!resolved.ok) return ambiguous(resolved.reason);
    const clock = typeof now === 'number' ? now : Date.parse(now);
    if (!Number.isFinite(clock)) return ambiguous('review_time_unverified');
    return { ...evidence, requestedAt: resolved.at,
      status: Date.parse(resolved.at) <= clock ? 'past' : 'resolved',
      reason: Date.parse(resolved.at) <= clock ? 'requested_time_elapsed' : 'explicit_source_request' };
  }

  function proposeInitialCheck({ text, sourceAt, sourceMessageId, now = Date.now() } = {}) {
    const sourceTime = Date.parse(sourceAt), clock = typeof now === 'number' ? now : Date.parse(now);
    const intakeTiming = extractRequestedTiming({ text, sourceAt, sourceMessageId, now: clock });
    const baseline = sourceTime + 2 * 3600000;
    if (!intakeTiming) return { intakeTiming: null, checkAt: new Date(baseline).toISOString(),
      checkBasis: 'proposta interna: due ore dalla ricezione, nessun orario promesso al cliente' };
    const check = intakeTiming.status === 'resolved' ? Math.min(baseline, Date.parse(intakeTiming.requestedAt)) : clock;
    return { intakeTiming, checkAt: new Date(check).toISOString(),
      checkBasis: intakeTiming.status === 'resolved'
        ? 'proposta interna entro l’orario richiesto nella fonte; richiesta da verificare, nessun impegno confermato'
        : 'revisione interna immediata: richiesta di orario da verificare nella fonte, nessun impegno confermato' };
  }
  return Object.freeze({ VERSION, extractRequestedTiming, proposeInitialCheck });
});
