/* BOOM · CONTRACT STATE — che tipo di contratto è questo, in UNA copia.
 *
 * Puro/UMD (window.BOOM_CONTRACT_STATE nel browser, require/import da
 * Node e dalle funzioni in api/**). Nasce dal Palazzo: i contratti presi
 * in carico da una tabella (source 'palazzo-import') sono firmati SU CARTA
 * o non sono ancora in archivio (segnaposto `contractMissing`). Per tutta
 * la macchina digitale (Firma ora, inviti, solleciti di firma, journey,
 * scadenze fiscali) questi due casi vanno riconosciuti nello STESSO modo,
 * altrimenti un contratto firmato a penna riceve un invito a firmare e un
 * segnaposto riceve un PDF dal modello BOOM.
 *
 * Più il numero di telefono: la tabella della proprietaria contiene numeri
 * scritti come capita ('333 123 4567', '+90 532…', '0532 123 45 67') e un
 * link WhatsApp costruito male chiama un altro paese. `phoneIntl` NON
 * indovina: un numero che non è chiaramente italiano e non porta il
 * prefisso internazionale resta `unknown` e lo si DICE.
 */
(function (root) {
  'use strict';

  function str(v) { return v == null ? '' : String(v).trim(); }

  // Firmato su carta: lo dichiara la firma, oppure è un contratto preso in
  // carico dalla tabella con le date (un segnaposto NON è carta: è assente).
  function isPaper(c) {
    if (!c) return false;
    if (str(c.signatureStatus) === 'paper') return true;
    return false;
  }

  // Segnaposto: l'interno è occupato ma il contratto non è in archivio.
  function isPlaceholder(c) { return !!(c && c.contractMissing === true); }

  // Preso in carico dalla tabella del Palazzo.
  function isImported(c) { return !!(c && str(c.source) === 'palazzo-import'); }

  // Nessuna firma digitale da raccogliere: carta, segnaposto, o già completo.
  function notSignable(c) {
    if (!c) return true;
    return isPaper(c) || isPlaceholder(c) || str(c.signatureStatus) === 'complete';
  }

  // Motivo leggibile (IT) per chi prova a firmare / invitare: mai un 409 muto.
  function notSignableReason(c) {
    if (isPlaceholder(c)) return 'contract_missing';
    if (isPaper(c)) return 'paper';
    if (c && str(c.signatureStatus) === 'complete') return 'already_signed';
    return '';
  }

  // Fuori dalla macchina delle email automatiche al conduttore (journey,
  // benvenuti, recensioni): il rapporto lo gestisce BOOM a mano col Palazzo.
  function outOfJourney(c) { return isImported(c) || isPlaceholder(c) || isPaper(c); }

  // ── Telefono ──────────────────────────────────────────────────────────
  // { e164:'+39333…'|null, wa:'39333…'|null, kind:'it'|'it-fixed'|'intl'|'unknown'|'empty', ambiguous?, raw }
  //  - '+…' o '00…'                → internazionale, si fida del prefisso
  //  - 3xxxxxxxxx (9-10 cifre)       → cellulare italiano, +39 aggiunto
  //  - 0xxxxxxx (6-11 cifre)         → fisso italiano (+39, lo 0 resta), ambiguo
  //  - qualunque altra forma         → unknown: niente link inventati
  function phoneIntl(raw) {
    var s = str(raw);
    if (!s) return { e164: null, wa: null, kind: 'empty', raw: s };
    var digits = s.replace(/[^\d+]/g, '');
    var d;
    if (digits.charAt(0) === '+') {
      d = digits.slice(1).replace(/\D/g, '');
      if (d.length >= 8 && d.length <= 15) return { e164: '+' + d, wa: d, kind: d.indexOf('39') === 0 ? 'it' : 'intl', raw: s };
      return { e164: null, wa: null, kind: 'unknown', raw: s };
    }
    d = digits.replace(/\D/g, '');
    if (d.indexOf('00') === 0) {
      d = d.slice(2);
      if (d.length >= 8 && d.length <= 15) return { e164: '+' + d, wa: d, kind: d.indexOf('39') === 0 ? 'it' : 'intl', raw: s };
      return { e164: null, wa: null, kind: 'unknown', raw: s };
    }
    if (/^39(3\d{8,9})$/.test(d)) return { e164: '+' + d, wa: d, kind: 'it', raw: s };
    if (/^3\d{8,9}$/.test(d)) return { e164: '+39' + d, wa: '39' + d, kind: 'it', raw: s };
    // Un numero che comincia per 0 è un fisso italiano OPPURE un cellulare
    // straniero scritto in forma nazionale ('0532 123 45 67' è Ferrara e
    // anche la Turchia): niente WhatsApp e `ambiguous` per chi deve avvisare.
    if (/^0\d{5,10}$/.test(d)) return { e164: '+39' + d, wa: null, kind: 'it-fixed', ambiguous: true, raw: s };
    return { e164: null, wa: null, kind: 'unknown', raw: s };
  }

  // ── Aggiunte del filone automazioni (S7) ──────────────────────────────
  // Le macchine del mattino (Gestore, Contabile, Oggi, compliance, scadenze
  // fiscali, Bonifica) devono riconoscere gli STESSI fatti del Palazzo, non
  // una loro versione. Qui i quattro fatti che servivano a tutte.

  // Registrato all'AdE: lo dice la data della RLI o lo stato della pratica.
  // Una registrazione segnata chiude RLI, imposta di registro e opzione
  // cedolare: nessuna macchina deve ricordarle come «in scadenza».
  function isRegistered(c) {
    if (!c) return false;
    return !!str(c.rliRegisteredAt) || str(c.registrationStatus) === 'registered';
  }

  // Il mese (YYYY-MM) cade PRIMA della gestione BOOM dell'immobile
  // (property.gestioneDal, YYYY-MM)? Quei mesi non sono arretrati di BOOM:
  // il Palazzo li mostra «Prima di BOOM», e nessun sollecito né scadenza
  // deve nascere lì. Senza gestioneDal: mai.
  function beforeGestione(month, property) {
    var gd = str(property && property.gestioneDal), m = str(month).slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(gd) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return false;
    return m < gd;
  }

  // Un giorno di calendario da qualunque forma (YYYY-MM-DD, ISO, Date,
  // Timestamp Firestore {seconds}/{_seconds}/toDate). null se illeggibile.
  function dayMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'string') { var t = Date.parse(v.length === 10 ? v + 'T12:00:00Z' : v); return isFinite(t) ? t : null; }
    if (v instanceof Date) return isFinite(v.getTime()) ? v.getTime() : null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v.toDate === 'function') { try { var d = v.toDate(); return isFinite(d.getTime()) ? d.getTime() : null; } catch (_) { return null; } }
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    if (typeof v._seconds === 'number') return v._seconds * 1000;
    return null;
  }

  // L'ultimo sollecito/link mandato per QUESTA rata (lastReminderDate o una
  // voce di dunningHistory: WhatsApp dal Palazzo, email dal portal), se
  // cade negli ultimi `days` giorni. → ms del sollecito, o null. Serve al
  // Gestore per non proporre un'email a chi ha ricevuto il link ieri.
  function recentReminder(payment, now, days) {
    var p = payment || {};
    var nowMs = dayMs(now == null ? new Date() : now);
    var win = (Number(days) > 0 ? Number(days) : 7) * 86400000;
    var best = null;
    var consider = function (v) { var t = dayMs(v); if (t != null && t <= nowMs + 86400000 && nowMs - t <= win && (best == null || t > best)) best = t; };
    consider(p.lastReminderDate);
    (Array.isArray(p.dunningHistory) ? p.dunningHistory : []).forEach(function (h) { if (h) consider(h.at); });
    return best;
  }

  // I telefoni delle parti conduttrici del contratto, come sono scritti:
  // titolare + co-intestatari. Il riconoscimento (WhatsApp, telefonate) li
  // normalizza da sé; qui solo la lista, mai inventata.
  function tenantPhones(c) {
    var out = [];
    if (!c) return out;
    var t = str(c.tenantPhone);
    if (t) out.push({ phone: t, name: str(c.tenantName), role: 'tenant' });
    (Array.isArray(c.coTenants) ? c.coTenants : []).forEach(function (x, i) {
      var p = str(x && (x.phone || x.tel || x.telefono));
      if (p) out.push({ phone: p, name: str(x && (x.name || x.fullName)), role: 'cotenant', index: i });
    });
    return out;
  }

  var API = {
    isPaper: isPaper,
    isPlaceholder: isPlaceholder,
    isImported: isImported,
    notSignable: notSignable,
    notSignableReason: notSignableReason,
    outOfJourney: outOfJourney,
    phoneIntl: phoneIntl,
    isRegistered: isRegistered,
    beforeGestione: beforeGestione,
    recentReminder: recentReminder,
    tenantPhones: tenantPhones
  };

  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.BOOM_CONTRACT_STATE = API;
})(typeof window !== 'undefined' ? window : this);
