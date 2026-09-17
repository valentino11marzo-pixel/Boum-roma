/* A preparation is a reviewable interpretation of sources, never an execution. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BOOM_PROPOSTA = api;
})(typeof window !== 'undefined' ? window : this, function () {
  const VERSION = 2;
  const CONTEXT_VERSION = 2;
  const line = (v, n) => typeof v === 'string' && v.trim() && v.length <= n ? v.trim() : null;
  // HOMIE's reaction wrapper quotes somebody else's words; it is neither a
  // new sentence by the contact nor an unconditional commitment.
  function isReaction(text) {
    return /^\s*Reacted\s.{1,24}?\s+to\s/is.test(String(text || ''))
      || /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s)+$/u.test(String(text || '').trim());
  }
  const TENTATIVE = /\b(?:dovrei|dovremmo|dovrebbe|potrei|potremmo|forse|probabilmente|eventualmente|se riesco|da confermare|non confermato|might|maybe|tentative|probably|if I can|should be able|not confirmed)\b/i;
  function commitmentEvidence(raw, sourceTexts) {
    for (const row of Array.isArray(raw?.commitments) ? raw.commitments : []) {
      if (row.status !== 'satisfied' && (row.kind !== 'explicit' || row.status === 'unclear')) continue;
      const quote = String(row.quote || '');
      const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const supported = (Array.isArray(row.sourceIds) ? row.sourceIds : []).some(id => {
        const source = sourceTexts[id];
        if (typeof source !== 'string' || isReaction(source) || !quote.trim()) return false;
        const text = norm(source), excerpt = norm(quote), start = text.indexOf(excerpt);
        if (start < 0) return false;
        // Include the whole sentence so quoting just "Friday" cannot drop its
        // "might". A separate tentative sentence cannot erase a firm agreement.
        const before = text.slice(0, start).search(/[^.!?;\n]*$/);
        const tail = text.slice(start + excerpt.length).search(/[.!?;\n]/);
        const end = /[.!?;]$/.test(excerpt) ? start + excerpt.length
          : tail < 0 ? text.length : start + excerpt.length + tail;
        return !TENTATIVE.test(text.slice(before, end));
      });
      if (TENTATIVE.test(quote) || !supported) return { ok: false, error: 'commitment_requires_confirmation' };
    }
    return { ok: true };
  }
  const HUMAN = /\b(?:parlare|parlo|passami|passare|sentire|sento|richiamarmi|richiamatemi|richiamami)\b.{0,60}\b(?:valentino|persona|operatore|umano)\b|\b(?:speak|talk|transfer|connect|call)\b.{0,60}\b(?:valentino|human|person|operator)\b/i;
  const TOPICS = [
    ['payments', /\b(?:pagament\w*|bonific\w*|canone|rate\s+scadute|payment|rent\s+payment|refund|rimborso)\b/i],
    ['signature', /\b(?:firmare|firma|signature|sign\s+(?:the\s+)?contract)\b/i],
  ];
  function topicOf(text) { return (TOPICS.find(([, re]) => re.test(String(text || ''))) || ['general'])[0]; }
  function wantsHuman(text) { return HUMAN.test(String(text || '')); }
  function validate(raw, { sourceIds = [], sourceTexts = {}, sourceDirections = {}, sourceKinds = {}, practices = [], confirmedPracticeRef = null, identityBlocked = false, humanRequested = false, protectedTopic = null } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'invalid_preparation' };
    const known = new Set(sourceIds.filter(id => sourceKinds[id] !== 'historical_whatsapp_summary')), allowed = new Set(practices.map(p => p.ref));
    const evidence = commitmentEvidence(raw, sourceTexts);
    if (!evidence.ok) return evidence;
    // An unresolved, tentative promise by BOOM needs an internal decision
    // before asking the customer to organise around it.
    if (raw.draft && Array.isArray(raw.commitments) && raw.commitments.some(c => c?.status === 'unclear'
      && Array.isArray(c.sourceIds) && c.sourceIds.some(id => sourceDirections[id] === 'out'
        && TENTATIVE.test(sourceTexts[id] || ''))))
      return { ok: false, error: 'outgoing_commitment_unconfirmed' };
    const citations = value => Array.isArray(value) && value.length > 0 && value.length <= 8
      && value.every(v => typeof v === 'string' && known.has(v)) ? [...new Set(value)] : null;
    const statements = (rows, max, extra) => {
      if (!Array.isArray(rows) || rows.length > max) return null;
      const out = [];
      for (const r of rows) {
        const text = line(r?.text, 450), sourceIds = citations(r?.sourceIds);
        const quote = line(r?.quote, 300);
        const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!text || !sourceIds || !quote || !sourceIds.some(id => norm(sourceTexts[id]).includes(norm(quote)))) return null;
        const item = { text, sourceIds };
        if (extra) {
          if (!['explicit', 'inferred'].includes(r.kind) || !['pending', 'satisfied', 'unclear'].includes(r.status)) return null;
          item.kind = r.kind; item.status = r.status;
        }
        out.push(item);
      }
      return out;
    };
    const summary = line(raw.summary, 700), recommendation = line(raw.recommendation, 500);
    const facts = statements(raw.facts, 6), commitments = statements(raw.commitments, 6, true), uncertainties = statements(raw.uncertainties, 6);
    const n = raw.nextAction || {}, text = line(n.text, 240), waitingLabel = line(n.waitingLabel, 100), reason = line(n.reason, 350), sourceIdsNext = citations(n.sourceIds);
    if (!summary || !recommendation || !facts || !commitments || !uncertainties || !text || !waitingLabel || !reason || !sourceIdsNext
      || !['valentino', 'client', 'collaborator', 'boom'].includes(n.waitingOn) || typeof n.checkAt !== 'string') return { ok: false, error: 'invalid_preparation' };
    // The model may omit a selection, but cannot erase the operator's verified
    // choice. Missing scheduling details do not unlink an established case.
    const practiceRef = n.practiceRef || (!identityBlocked && allowed.has(confirmedPracticeRef) ? confirmedPracticeRef : null);
    if (practiceRef && (!allowed.has(practiceRef) || (practices.length > 1 && practiceRef !== confirmedPracticeRef) || identityBlocked))
      return { ok: false, error: 'practice_requires_selection' };
    let draft = null;
    if (raw.draft != null) {
      const d = raw.draft, draftText = line(d.text, 1800), ids = citations(d.sourceIds);
      if (!draftText || !ids || !['whatsapp', 'email'].includes(d.channel)) return { ok: false, error: 'invalid_draft' };
      draft = { channel: d.channel, text: draftText, subject: line(d.subject, 150) || 'BOOM · La tua richiesta', sourceIds: ids };
    }
    const h = raw.handoff || {};
    if (typeof h.needed !== 'boolean' || !line(h.reason, 350) || (h.sourceIds?.length && !citations(h.sourceIds))) return { ok: false, error: 'invalid_handoff' };
    const handoff = { needed: h.needed || humanRequested || identityBlocked, reason: identityBlocked ? 'Identità o recapito da verificare prima di agire.'
      : humanRequested ? 'La persona ha chiesto di parlare con Valentino o con un operatore.' : h.reason.trim(), sourceIds: h.sourceIds || [] };
    // Existing specialised flows own payment/signature notices. Preparing this
    // case must not create a second reminder on the same subject.
    if (identityBlocked || protectedTopic || humanRequested || !practiceRef) draft = null;
    return { ok: true, value: { summary, recommendation, facts, commitments, uncertainties,
      nextAction: { text, waitingOn: humanRequested ? 'valentino' : n.waitingOn,
        waitingLabel: humanRequested ? 'Valentino' : waitingLabel, checkAt: n.checkAt,
        practiceRef, sourceIds: sourceIdsNext, reason }, draft, handoff,
      identityBlocked, routeOwner: protectedTopic ? 'gestore:' + protectedTopic : null,
      status: identityBlocked ? 'needs_context' : 'ready' } };
  }
  function current(task) { return !!task?.preparation && task.status === 'open'
    && (task.preparation.version === VERSION || !!task.preparation.approval)
    && task.preparation.messageId === task.followUp?.lastMessageId; }
  // Home and worker share the same readiness rule. An approved receipt remains
  // readable across context upgrades, but never becomes current for a new event.
  function currentContext(task) { return current(task)
    && (!!task.preparation.approval || task.preparation.coverage?.version === CONTEXT_VERSION); }
  function nextActor(proposal, { followUp = {}, now } = {}) {
    const n = proposal.nextAction;
    if (proposal.draft || !['client', 'collaborator'].includes(n.waitingOn)) return n;
    const same = (a, b) => typeof a === 'string' && typeof b === 'string'
      && a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
    // Only the same operator-confirmed wait can survive without a message to
    // send. An arbitrary old outgoing message does not prove this request was
    // made, nor that a collaborator accepted this particular assignment.
    const confirmedWait = followUp.confirmed === true && followUp.practiceRef === n.practiceRef
      && followUp.waitingOn === n.waitingOn && same(followUp.waitingLabel, n.waitingLabel)
      && same(followUp.nextAction, n.text);
    if (confirmedWait) return n;
    const priorCheck = Date.parse(followUp.checkAt), proposedCheck = Date.parse(n.checkAt);
    return { ...n, waitingOn: 'valentino', waitingLabel: 'Valentino',
      // Keep an earlier existing control instead of postponing an unstarted
      // request as though the other party already had time to answer it.
      checkAt: Number.isFinite(now) && priorCheck > now && priorCheck < proposedCheck ? followUp.checkAt : n.checkAt,
      reason: ('Richiesta o incarico da verificare: non è provato che il destinatario debba già rispondere. ' + n.reason).slice(0, 350) };
  }
  return Object.freeze({ VERSION, CONTEXT_VERSION, validate, wantsHuman, topicOf, current, currentContext, nextActor, isReaction });
});
