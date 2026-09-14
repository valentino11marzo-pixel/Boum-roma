/* Oggi: rappresentazione dei seguiti già salvati in operatorTasks.
 * Nessuna decisione di invio, nessuna memoria propria. Date passate dal
 * chiamante: leggere o rispondere alla conversazione non chiude un seguito.
 */
(function (root, factory) {
  var API = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SEGRETARIA_CASI = API;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var WAITING = { valentino: 'Valentino', client: 'Cliente', collaborator: 'Collaboratore', boom: 'BOOM' };
  var TYPES = { leads: 'Richiesta casa', contracts: 'Contratto', pfsClients: 'Ricerca PFS', viewingRequests: 'Visita' };
  var text = function (v) { return typeof v === 'string' ? v.trim() : ''; };
  var validId = function (v) { return /^sg_[a-f0-9]{32}$/.test(text(v)); };
  var own = function (obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); };
  function dateMs(value) {
    var n = Date.parse(value || '');
    return Number.isFinite(n) ? n : null;
  }
  function partition(rows, now) {
    var decisions = [], waiting = [], seen = new Set(), invalid = 0;
    (Array.isArray(rows) ? rows : []).forEach(function (task) {
      if (!task || !validId(task.id) || !task.followUp) { invalid++; return; }
      if (task.status !== 'open' || seen.has(task.id)) return;
      seen.add(task.id);
      var f = task.followUp, at = dateMs(f.checkAt);
      var decided = f.confirmed === true && f.needsReview !== true && f.ambiguous !== true && !!f.practiceRef;
      (decided && at !== null && at > now ? waiting : decisions).push(task);
    });
    var sort = function (a, b) { return (dateMs(a.followUp.checkAt) || 0) - (dateMs(b.followUp.checkAt) || 0) || a.id.localeCompare(b.id); };
    return { decisions: decisions.sort(sort), waiting: waiting.sort(sort), invalid: invalid };
  }
  function propertyLabel(ref, dossier, state) {
    if (!ref) return 'Casa da collegare';
    var known = ((dossier && dossier.properties) || []).find(function (p) { return p.ref === ref; });
    if (known && text(known.label)) return text(known.label);
    var parts = String(ref).split('/');
    if (parts.length === 2 && ['properties', 'listings'].includes(parts[0])) {
      var row = ((state && state[parts[0]]) || []).find(function (p) { return p.id === parts[1]; });
      if (row && text(row.name || row.address || row.title)) return text(row.name || row.address || row.title);
    }
    return 'Casa collegata · nome da verificare';
  }
  function practiceLabel(practice, dossier, state) {
    if (!practice || !practice.ref) return 'Pratica da collegare';
    var parts = String(practice.ref).split('/');
    var kind = own(TYPES, parts[0]) ? TYPES[parts[0]] : 'Pratica';
    var house = (practice.propertyRefs || []).map(function (ref) { return propertyLabel(ref, dossier, state); });
    return [kind, text(practice.status), house.join(', '), parts[1] ? '#' + parts[1].slice(-8) : ''].filter(Boolean).join(' · ');
  }
  function describe(task, dossier, state, now) {
    var f = task.followUp || {};
    var practice = ((dossier && dossier.practices) || []).find(function (p) { return p.ref === f.practiceRef; })
      || (f.practiceRef ? { ref: f.practiceRef } : null);
    var at = dateMs(f.checkAt);
    var needs = f.confirmed !== true || f.needsReview === true || f.ambiguous === true || !f.practiceRef;
    return {
      name: text(f.contactName) || 'Persona da identificare', preview: text(f.preview),
      practice: practiceLabel(practice ? Object.assign({}, practice, { propertyRefs: [] }) : null, dossier, state), house: propertyLabel(f.propertyRef, dossier, state),
      nextAction: text(f.nextAction) || 'Prossima azione da confermare',
      waiting: text(f.waitingLabel) || (own(WAITING, f.waitingOn) ? WAITING[f.waitingOn] : 'Responsabile da confermare'),
      checkAt: at, due: at !== null && at <= now,
      state: needs ? (f.ambiguous || !f.practiceRef ? 'Da collegare' : 'Da confermare') : (at !== null && at <= now ? 'Da ricontrollare' : 'Confermato'),
      checkBasis: text(f.checkBasis),
      conversationId: /^[\w.-]{1,180}$/.test(text(f.conversationId)) ? f.conversationId : null
    };
  }
  function localDateTime(iso) {
    var ms = dateMs(iso);
    if (ms === null) return '';
    var d = new Date(ms);
    return new Date(ms - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function confirmation(task, fields, dossier, now) {
    var f = task && task.followUp;
    if (!task || !validId(task.id) || !f || task.status !== 'open') return { error: 'Questo seguito non è più aperto. Ricaricalo.' };
    var action = text(fields.nextAction), label = text(fields.waitingLabel);
    var inputDate = text(fields.checkAt), ms = dateMs(inputDate);
    if (!action || action.length > 240) return { error: 'Indica una prossima azione, entro 240 caratteri.' };
    if (!own(WAITING, fields.waitingOn) || !label || label.length > 100) return { error: 'Indica chi deve agire, con un nome o riferimento chiaro.' };
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inputDate) || ms === null || localDateTime(new Date(ms).toISOString()) !== inputDate
      || ms <= now || ms > now + 365 * 86400000) return { error: 'Scegli un ricontrollo futuro, entro un anno.' };
    var practiceRef = text(fields.practiceRef) || null;
    if (practiceRef && (!(dossier && Array.isArray(dossier.practices)) || dossier.identityIncomplete || dossier.identityAmbiguous
      || !dossier.practices.some(function (p) { return p.ref === practiceRef; }))) return { error: 'La pratica non è verificabile: ricarica o lasciala da collegare.' };
    return { payload: { op: 'confirm', id: task.id, lastMessageId: f.lastMessageId, practiceRef: practiceRef,
      nextAction: action, waitingOn: fields.waitingOn, waitingLabel: label, checkAt: new Date(ms).toISOString() } };
  }
  return Object.freeze({ partition: partition, describe: describe, practiceLabel: practiceLabel,
    propertyLabel: propertyLabel, localDateTime: localDateTime, confirmation: confirmation, validId: validId, WAITING: Object.freeze(WAITING) });
});
