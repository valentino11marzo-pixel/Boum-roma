/* Phone intake: a catalogue mention is a candidate, not an association.
 * This is a deliberately closed grammar of first-person interest, NOT a
 * general language/negation classifier. Unrecognised wording stays unlinked;
 * it must never make the caller repeat a formula. No booking is confirmed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BOOM_PHONE_LISTING = api;
})(typeof window !== 'undefined' ? window : this, function () {
  const MAX_CALLER_CHARS = 2500;
  const normal = value => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const statement = value => normal(value).replace(/[.!]$/, '');
  // Only a whole closing turn may be ignored, never a substring/reaction quote.
  const CLOSINGS = new Set(['grazie', 'grazie mille', 'arrivederci', 'thanks', 'thank you', 'bye', 'goodbye']);
  const PREFIXES = [
    'mi interessa ', 'mi interessa il ', 'mi interessa la ', "mi interessa l'annuncio ",
    'sono interessato a ', 'sono interessata a ', 'confermo il mio interesse per ',
    'voglio visitare ', 'voglio visitare il ', 'voglio visitare la ',
    'vorrei visitare ', 'vorrei visitare il ', 'vorrei visitare la ',
    'i am interested in ', "i'm interested in ", 'i want to view ', 'i would like to view ',
  ];
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function resolve(turns, catalog) {
    const result = { status: 'none', listingId: null, candidateIds: [], evidence: null };
    if (!Array.isArray(turns) || !Array.isArray(catalog)) return result;
    // Never read a clipped prefix as the whole conversation: a correction
    // outside the persisted callerWords limit invalidates automatic linking.
    // loadCatalog reads at most 100 records. At the cap we cannot prove that
    // a duplicate title is not record 101; an apparently unique prefix is
    // never enough. Keep this conservative bound local to phone intake.
    if (turns.length > 200 || catalog.length >= 100) return { ...result, status: 'incomplete' };
    const caller = [];
    let size = 0;
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (!turn || turn.role !== 'user') continue;
      if (typeof turn.message !== 'string') return { ...result, status: 'incomplete' };
      size += turn.message.length + (caller.length ? 1 : 0);
      if (size > MAX_CALLER_CHARS) return { ...result, status: 'incomplete' };
      caller.push({ index: i, text: turn.message });
    }
    const rows = catalog.filter(row => row && typeof row.id === 'string' && row.id.trim()
      && typeof row.name === 'string' && row.name.trim() && row.name.length <= 180)
      .map(row => ({ id: row.id, title: normal(row.name) }));
    const words = normal(caller.map(turn => turn.text).join('\n'));
    const mentions = text => rows.filter(row => new RegExp('(^|[^\\p{L}\\p{N}])' + escape(row.title) + '(?=$|[^\\p{L}\\p{N}])', 'u').test(text));
    result.candidateIds = [...new Set(mentions(words).map(row => row.id))];
    result.status = result.candidateIds.length ? 'unconfirmed' : 'none';
    let last = caller.length - 1;
    while (last >= 0 && CLOSINGS.has(statement(caller[last].text))) last--;
    if (last < 0) return result;
    const turn = caller[last], text = statement(turn.text);
    const candidates = mentions(text);
    if (candidates.length !== 1) return result;
    const chosen = candidates[0];
    // Match the WHOLE turn, retaining quotes, questions, conditionals and
    // extra sentences: none can be discarded to manufacture positive proof.
    if (!PREFIXES.some(prefix => text === prefix + chosen.title)) return result;
    return { ...result, status: 'explicit_interest', listingId: chosen.id,
      evidence: { turnIndex: turn.index, quote: turn.text.trim(), rule: 'whole-turn-interest-v1' } };
  }
  return Object.freeze({ resolve, MAX_CALLER_CHARS });
});
