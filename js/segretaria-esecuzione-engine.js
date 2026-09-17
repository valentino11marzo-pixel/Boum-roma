/* Presentation of one approved proposal. No effects, permissions or new state.
 * A free-form nextAction never becomes a tool call. Only the existing reply,
 * follow-up and observed preparation monitor describe executable steps here.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BOOM_SEGRETARIA_ESECUZIONE = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const text = value => typeof value === 'string' ? value.trim() : '';
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const timestamp = value => typeof value === 'string' ? Date.parse(value) : NaN;
  const labels = { valentino: 'Valentino', client: 'Cliente', collaborator: 'Collaboratore', boom: 'BOOM' };

  function describe({ preparation: p, delivery, monitoring: m, uncertain = false, now } = {}) {
    if (!p || typeof p !== 'object') return { steps: [], manual: [], hasDraft: false, approved: false,
      notice: 'Prepara e rivedi una proposta per vedere le azioni disponibili.' };
    const n = p.nextAction || {}, a = p.approval, hasDraft = p.draft != null, approved = !!a;
    // The API receipt has actionId/confirmed, but not necessarily revision or
    // messageId. Optional local identifiers must agree when they are present.
    const approvalMatches = approved && !!text(p.revision) && !!text(p.messageId)
      && a.revision === p.revision && a.messageId === p.messageId;
    const receiptMatches = approvalMatches && delivery?.confirmed === true
      && (!own(delivery, 'revision') || delivery.revision === p.revision)
      && (!own(delivery, 'messageId') || delivery.messageId === p.messageId)
      && (hasDraft ? !!text(a.actionId) && delivery.actionId === a.actionId
        : !a.actionId && !delivery.actionId && delivery.delivery === 'follow_up_only');
    const unresolved = uncertain || (approved && !receiptMatches) || (!!delivery && !approved);
    const steps = [{ id: 'follow_up', title: 'Registrazione del seguito',
      state: unresolved ? 'needs_review' : approved ? 'recorded' : 'planned',
      detail: unresolved ? 'Ricarica lo stato per verificare la registrazione di questa proposta.'
        : approved ? 'Prossimo passo, responsabile e ricontrollo registrati. Il caso resta aperto fino a un esito.'
          : 'Salva il prossimo passo, il responsabile e il ricontrollo mostrati.' }];
    if (hasDraft) {
      const channel = p.draft?.channel, knownChannel = ['whatsapp', 'email'].includes(channel);
      let state = !knownChannel || unresolved ? 'needs_review' : 'planned';
      if (approved && !unresolved && knownChannel) state = ({ sent: 'sent', pending_execution: 'pending',
        ...(channel === 'whatsapp' ? { queued: 'queued' } : {}) })[delivery.delivery] || 'needs_review';
      const details = {
        planned: 'Invia una sola volta la bozza mostrata, allo stesso destinatario e tramite lo stesso canale.',
        pending: 'Approvazione registrata; l’invio della bozza deve ancora essere avviato.',
        queued: 'La bozza approvata è nella coda WhatsApp del Mac. L’invio resta da riscontrare.',
        sent: 'Invio della bozza approvata registrato. Questo non chiude il lavoro.',
        needs_review: 'Esito dell’invio da verificare. Ricarica lo stato prima di riprovare.'
      };
      steps.push({ id: 'reply', title: channel === 'whatsapp' ? 'Invio WhatsApp' : channel === 'email' ? 'Invio email' : 'Invio da verificare',
        state, detail: details[state] });
    }
    const checkAt = timestamp(n.checkAt), checkedAt = timestamp(m?.checkedAt), lastRunAt = timestamp(m?.lastRunAt);
    const fresh = Number.isFinite(now) && Number.isFinite(checkedAt) && Number.isFinite(lastRunAt)
      && checkedAt <= now && lastRunAt <= now && now - checkedAt <= 180000 && now - lastRunAt <= 180000;
    let checkState = 'unavailable', checkDetail = 'Stato del ricontrollo automatico da verificare.';
    if (!Number.isFinite(checkAt)) checkDetail = 'La data del ricontrollo deve essere impostata.';
    else if (m?.enabled === false || m?.prepareCases === false || ['disabled', 'paused'].includes(m?.status)) {
      checkState = 'paused'; checkDetail = 'Ricontrollo automatico in pausa. La data mostrata resta una verifica interna.';
    } else if (m?.mode !== 'continuous' && m?.status === 'daily_cap') {
      checkState = 'paused'; checkDetail = 'Il limite giornaliero impedisce altre preparazioni. La data di ricontrollo resta da seguire.';
    } else if (m?.enabled === true && m?.prepareCases === true && !m?.incomplete && fresh && ['working', 'idle'].includes(m.status)) {
      checkState = unresolved ? 'needs_review' : checkAt <= now ? 'pending' : approved ? 'recorded' : 'planned';
      checkDetail = unresolved ? 'Ricarica lo stato per verificare il ricontrollo di questa proposta.'
        : checkAt <= now ? 'L’orario di ricontrollo mostrato è trascorso. L’esito del nuovo esame resta da verificare.'
        : 'A partire dalla data mostrata è previsto un nuovo esame del caso, secondo le priorità della coda. Eventuali nuove azioni richiedono una nuova approvazione.';
    }
    steps.push({ id: 'recheck', title: 'Ricontrollo interno', state: checkState, detail: checkDetail });
    const manual = text(n.text) ? [{ title: 'Prossimo passo · ' + (text(n.waitingLabel) || labels[n.waitingOn] || 'Responsabile da definire'),
      detail: text(n.text) }] : [];
    const notice = unresolved ? 'Il riscontro di questa proposta richiede verifica. Ricarica l’esito prima di agire di nuovo.'
      : 'Il pulsante esegue solo le azioni elencate. Il prossimo passo resta al responsabile indicato; il caso si chiude con un esito.';
    return { steps, manual, hasDraft, approved, notice };
  }
  return Object.freeze({ describe });
});
