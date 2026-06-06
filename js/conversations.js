/* BOOM · Conversations — unified messaging model.
 *
 * Backs the "📨 Inbox" page in portal.html. Every WhatsApp/email/note that
 * BOOM sends or logs is stored as a `messages` doc linked to a
 * `conversations` doc keyed by the contact (lead/tenant/landlord/pfs/client).
 *
 * Outbound today: composing a WhatsApp opens wa.me with prefilled text and
 * the sender is asked to confirm "Inviato?" so the message is logged. Email
 * sends through the existing sendBoomEmail path and is logged automatically.
 * Inbound today: manual ("Aggiungi messaggio ricevuto"). The schema is
 * ready for the WhatsApp Business API / Homie bridge when those land —
 * direction='in' messages from those sources will just slot in.
 *
 * Pure module: no rendering, no DOM. window.BOOM_INBOX + CommonJS.
 *
 * Schema (Firestore):
 *   conversations/{convId}
 *     contactType: 'lead'|'tenant'|'landlord'|'pfs'|'client'
 *     contactId:   <doc id of the linked entity>
 *     contactUid:  <Firebase Auth uid if known>          (for rules)
 *     contactName, contactPhone, contactEmail
 *     channel: 'whatsapp'|'email'|'mixed'|'note'
 *     status: 'open'|'snoozed'|'closed'
 *     unread: number
 *     assignedLandlordId: uid | null
 *     lastMessageAt, lastMessagePreview, lastDirection
 *     tags: string[]
 *     createdAt
 *
 *   messages/{msgId}
 *     conversationId: <convId>
 *     direction: 'out'|'in'|'note'
 *     channel: 'whatsapp'|'email'|'note'
 *     body, attachments[], by (uid),
 *     contactUid (denorm for rules), assignedLandlordId (denorm)
 *     at
 */
(function (root) {
  'use strict';

  function normalizePhone(p) {
    if (!p) return '';
    var s = String(p).replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.startsWith('00')) s = '+' + s.slice(2);
    else if (!s.startsWith('+')) {
      // Italian default
      if (s.startsWith('3') || s.startsWith('0')) s = '+39' + s.replace(/^0/, '');
    }
    return s;
  }

  // Build a stable conversation key from contactType + contactId so we can
  // find-or-create without a search query.
  function convIdFor(contactType, contactId) {
    return 'conv_' + contactType + '_' + String(contactId).replace(/[^A-Za-z0-9_-]/g, '');
  }

  // Map a portal contact (lead/tenant/landlord/pfs/client) onto a
  // conversation header. Tolerant of partial fields.
  function buildHeader(contactType, contact) {
    var c = contact || {};
    return {
      contactType: contactType,
      contactId: c.id || '',
      contactUid: c.uid || c.userId || null,
      contactName: c.name || (c.firstName ? c.firstName + ' ' + (c.lastName || '') : '') || c.email || 'Senza nome',
      contactPhone: normalizePhone(c.phone || c.phoneNumber || ''),
      contactEmail: c.email || '',
      assignedLandlordId: c.assignedLandlordId || c.ownerId || null,
      status: 'open',
      unread: 0,
      tags: [],
    };
  }

  function preview(body, max) {
    if (!body) return '';
    var s = String(body).replace(/\s+/g, ' ').trim();
    var n = max || 90;
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // Render the wa.me URL for the composer. Used by the UI to open WhatsApp.
  function whatsappUrl(phone, text) {
    var p = normalizePhone(phone).replace(/^\+/, '');
    var t = encodeURIComponent(text || '');
    return p ? ('https://wa.me/' + p + (t ? '?text=' + t : '')) : '';
  }

  // Group messages by date for the timeline. Returns
  // [{ dateLabel: "Oggi"|"Ieri"|"3 ott", items: [msg,...] }].
  function groupByDay(messages, now) {
    var today = (now || new Date()); today.setHours(0,0,0,0);
    var yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
    var groups = {};
    (messages || []).forEach(function (m) {
      var ts = m.at && typeof m.at.toDate === 'function' ? m.at.toDate() : new Date(m.at || Date.now());
      var key = ts.toISOString().slice(0,10);
      (groups[key] = groups[key] || { dateRaw: ts, items: [] }).items.push(m);
    });
    var out = Object.keys(groups).sort().map(function (k) {
      var d = groups[k].dateRaw;
      var label;
      if (d >= today) label = 'Oggi';
      else if (d >= yesterday) label = 'Ieri';
      else label = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
      groups[k].items.sort(function(a,b){
        var ta = a.at && typeof a.at.toMillis === 'function' ? a.at.toMillis() : new Date(a.at||0).getTime();
        var tb = b.at && typeof b.at.toMillis === 'function' ? b.at.toMillis() : new Date(b.at||0).getTime();
        return ta - tb;
      });
      return { dateLabel: label, items: groups[k].items };
    });
    return out;
  }

  // Quick reply templates — short, BOOM voice, fill-in placeholders.
  var TEMPLATES = [
    { id: 'pfs_welcome', label: '👋 PFS · Benvenuto', body: 'Ciao {nome}! Sono {agente} di BOOM. Iniziamo la tua ricerca casa a Roma. Ti scrivo qui per ogni opzione. Quale fascia di prezzo preferisci?' },
    { id: 'viewing_propose', label: '📅 Proposta viewing', body: 'Ciao {nome}, ho un appuntamento disponibile per {immobile} {data}. Confermi?' },
    { id: 'viewing_remind', label: '⏰ Promemoria viewing', body: 'Ciao {nome}! Ricordo il sopralluogo {data} a {indirizzo}. Ci vediamo lì?' },
    { id: 'rent_due', label: '💰 Promemoria canone', body: 'Ciao {nome}, ti ricordo il canone di {immobile} in scadenza il {data}. Grazie!' },
    { id: 'rent_received', label: '✅ Canone ricevuto', body: 'Ciao {nome}, ho ricevuto il canone di {mese}. Tutto in regola, grazie!' },
    { id: 'maintenance_ack', label: '🔧 Segnalazione ricevuta', body: 'Ciao {nome}, ho ricevuto la segnalazione. Ti ricontatto entro 24h con il tecnico.' },
    { id: 'landlord_pitch', label: '🏠 Proposta mandato', body: 'Buongiorno {nome}, sono di BOOM. Gestiamo per Lei la locazione di {immobile} chiavi in mano: ricerca inquilino, contratto, gestione canoni. La chiamo nei prossimi giorni.' },
    { id: 'commercialista_share', label: '📊 Link commercialista', body: 'Buongiorno, le inoltro il pacchetto fiscale per {immobile} anno {anno}: {link}. Il link scade il {scadenza}.' },
  ];

  function fillTemplate(body, vars) {
    return String(body || '').replace(/\{(\w+)\}/g, function (_, k) {
      return vars && vars[k] != null ? vars[k] : '{' + k + '}';
    });
  }

  var API = {
    normalizePhone: normalizePhone,
    convIdFor: convIdFor,
    buildHeader: buildHeader,
    preview: preview,
    whatsappUrl: whatsappUrl,
    groupByDay: groupByDay,
    TEMPLATES: TEMPLATES,
    fillTemplate: fillTemplate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_INBOX = API;
})(typeof window !== 'undefined' ? window : this);
