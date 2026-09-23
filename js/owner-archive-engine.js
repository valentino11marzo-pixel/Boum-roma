/* js/owner-archive-engine.js — L'ARCHIVIO DEL PROPRIETARIO, il motore puro.
 *
 * Una copia sola di ogni regola che decide COSA vede il proprietario su
 * /proprietario: quale documento è suo e si può servire, a quale contratto
 * appartiene un file (la regola del percorso + la guardia del rinnovo),
 * le tappe del contratto, i soldi (dalla lettura di BOOM_RENT, mai una
 * seconda aritmetica), il verdetto in una frase e il «da fare».
 *
 * REGOLE DURE
 *  1. Mai inventare. Ciò che il dato non dice esce come «non lo so»
 *     (stato `unknown`, verdetto `nonso`), mai come un fatto finto.
 *  2. Nessun dato del conduttore oltre il nome COME STAMPATO sul contratto:
 *     a BOOM_RENT si passano stub {id, name}, mai i record `users` veri (il
 *     motore dei canoni risolve il nome come `user.name || user.email`).
 *  3. Nessun URL tokenizzato, nessun token di firma nella proiezione:
 *     `assertClean` è l'ultima porta, e non ristampa mai il valore trovato.
 *  4. Puro: niente IO, niente orologio di sistema, niente formattazione
 *     dipendente dalla macchina. `now` arriva sempre da fuori.
 *  5. Niente `require`: le dipendenze arrivano iniettate
 *     (deps = { rent, fields, dossier, schedaUrl? }).
 *
 * UMD: <script> → window.BOOM_OWNER; `import OWNER from '../../js/owner-archive-engine.js'`
 * da api/** (root package.json è commonjs, quindi l'import è di default).
 *
 * Punti di mutazione (i test li rimettono rotti e pretendono il rosso):
 *   mp:path-prefix · mp:renewal-guard · mp:visibility · mp:view-as-url ·
 *   mp:tenant-stub · mp:overdue-state · mp:lease-month · mp:installments-window ·
 *   (revisione del 23/09) mp:scrub-rules · mp:scrub-data · mp:renewal-unsigned ·
 *   mp:availability · mp:terminated-end · mp:terminated-days ·
 *   mp:after-termination · mp:rooms-label · mp:terminated-ribbon ·
 *   mp:others-reasons · mp:lease-unsigned · mp:search-invoices ·
 *   (chiusura del 23/09) mp:signature-unrecorded · mp:terminated-undated ·
 *   mp:paper-signed · mp:paper-renewal · mp:paper-ghost
 */
(function (root) {
  'use strict';

  // ── Costanti ──────────────────────────────────────────────────────────
  var VERSION = 1;
  var BASE = 'https://www.boomrome.com';
  var CONTACT = { name: 'Valentino · BOOM Roma', wa: '393313251961', email: 'valentino@boom-rome.com' };
  var ID_RE = /^[\w.-]{1,160}$/;
  var DEFAULT_BUCKETS = ['boom-property-dashboards.firebasestorage.app', 'boom-property-dashboards.appspot.com'];
  var STORAGE_HOST = 'firebasestorage.googleapis.com';

  // ── Helper ────────────────────────────────────────────────────────────
  function str(v) { return v == null ? '' : String(v).trim(); }
  function key(v) { return str(v).toLowerCase(); }
  function list(v) { return Array.isArray(v) ? v.filter(function (x) { return x != null; }) : []; }
  function objs(v) { return list(v).filter(function (x) { return x && typeof x === 'object'; }); }
  function obj(v) { return v && typeof v === 'object' ? v : {}; }
  function has(v) { return str(v) !== ''; }
  function uniq(arr) { var s = []; arr.forEach(function (x) { if (s.indexOf(x) < 0) s.push(x); }); return s; }
  function norm(s) { return str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function isYmd(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s); }
  function isYm(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }
  function addMonths(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + (m < 9 ? '0' : '') + (m + 1);
  }
  function daysBetween(a, b) { return a && b ? Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000) : null; }
  function addDays(ymd, n) { var d = new Date(Date.parse(ymd + 'T12:00:00Z') + n * 86400000); return d.toISOString().slice(0, 10); }
  function isoAt(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(v) ? v : null; }

  // ── Formattatori deterministici (mai la formattazione della macchina) ──
  // itNum: stessa aritmetica di api/sign/_foglio.js (test di parità).
  function itNum(n, dec) {
    if (n === null || n === undefined || n === '' || typeof n === 'boolean') return '';
    var x = Number(n); if (!Number.isFinite(x)) return '';
    var d = dec == null ? 2 : dec;
    var f = Math.abs(x).toFixed(d), parts = f.split('.');
    return (x < 0 ? '-' : '') + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d > 0 ? ',' + parts[1] : '');
  }
  function enNum(n, dec) {
    if (n === null || n === undefined || n === '' || typeof n === 'boolean') return '';
    var x = Number(n); if (!Number.isFinite(x)) return '';
    var d = dec == null ? 2 : dec;
    var f = Math.abs(x).toFixed(d), parts = f.split('.');
    return (x < 0 ? '-' : '') + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d > 0 ? '.' + parts[1] : '');
  }
  function eur(n, opts) {
    var o = opts || {}, dec = o.dec == null ? 2 : o.dec, lang = o.lang === 'en' ? 'en' : 'it';
    if (lang === 'en') { var e = enNum(n, dec); return e ? (e.charAt(0) === '-' ? '-€' + e.slice(1) : '€' + e) : ''; }
    var i = itNum(n, dec); return i ? '€ ' + i : '';
  }
  var MONTHS = {
    it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  var MONTHS_SHORT = {
    it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  };
  function ymdOf(s) { var t = str(s).slice(0, 10); return isYmd(t) ? t : ''; }
  function L(lang) { return lang === 'en' ? 'en' : 'it'; }
  function dateNum(ymd) { var t = ymdOf(ymd); return t ? t.slice(8, 10) + '/' + t.slice(5, 7) + '/' + t.slice(0, 4) : ''; }
  function dateLong(ymd, lang) { var t = ymdOf(ymd); return t ? (+t.slice(8, 10)) + ' ' + MONTHS[L(lang)][+t.slice(5, 7) - 1] + ' ' + t.slice(0, 4) : ''; }
  function dateShort(ymd, lang) { var t = ymdOf(ymd); return t ? (+t.slice(8, 10)) + ' ' + MONTHS_SHORT[L(lang)][+t.slice(5, 7) - 1] : ''; }
  function monthLabel(ym, lang) { var t = str(ym).slice(0, 7); return isYm(t) ? MONTHS[L(lang)][+t.slice(5, 7) - 1] + ' ' + t.slice(0, 4) : ''; }

  // ── Le parole: IT e EN con lo STESSO insieme di chiavi (test) ──────────
  // Plurali: suffisso `.one` / `.many`, scelto da t() sul parametro n.
  var STRINGS = {
    it: {
      'verdict.ok': 'Tutto in ordine.',
      'verdict.tu.sign': 'Serve una tua firma.',
      'verdict.tu.scheda.one': 'Manca un tuo dato.',
      'verdict.tu.scheda.many': 'Mancano {n} tuoi dati.',
      'verdict.tu.deadline': 'Hai una scadenza entro il {date}.',
      'verdict.tu.deadline_overdue': 'Una tua scadenza è passata il {date}.',
      'verdict.osservo.overdue.one': 'Una rata in ritardo da {days} giorni.',
      'verdict.osservo.overdue.many': '{n} rate in ritardo.',
      'verdict.osservo.reported': 'Il conduttore segnala un bonifico: BOOM lo sta verificando.',
      'verdict.osservo.processing': 'Un pagamento è in elaborazione.',
      'verdict.osservo.processing_sepa': 'Un addebito SEPA è in corso.',
      'verdict.osservo.charge_overdue': '{what} in ritardo da {days} giorni.',
      'verdict.reminder': '· sollecito inviato il {date}',
      'verdict.nonso': 'Non posso dirlo con certezza.',
      'verdict.vuoto': 'Non vedo ancora immobili collegati al tuo account.',
      'verdict.vuoto.cta': 'Scrivi a BOOM: li colleghiamo noi.',
      'reason.sign_needed': 'Il contratto di {address} aspetta la tua firma.',
      'reason.scheda_needed': 'Mancano alcuni tuoi dati per il contratto di {address}.',
      'reason.deadline_soon': 'Scadenza entro il {date}: {title}.',
      'reason.deadline_overdue': 'Scadenza passata il {date}: BOOM non ha ancora registrato l’esito.',
      'reason.rent_overdue': 'Rata di {month} in ritardo da {days} giorni.',
      'reason.rent_reported': 'Il conduttore segnala un bonifico: BOOM verifica.',
      'reason.rent_processing': 'Pagamento in elaborazione.',
      'reason.rent_processing_sepa': 'Addebito SEPA in corso.',
      'reason.rent_unlinked': 'Una rata non è collegata al contratto: BOOM verifica.',
      'reason.rent_amount_missing': 'Una rata non ha l’importo registrato.',
      'reason.rent_state_unknown': 'Lo stato di una rata non è registrato.',
      'reason.rent_month_missing': 'Una rata non ha il mese registrato.',
      'reason.installments_missing': 'Le rate di {month} non sono ancora a sistema.',
      'reason.rented_without_contract': 'Risulta affittato, ma non c’è un contratto attivo a sistema.',
      'reason.contract_expired_open': 'Il contratto è scaduto il {date} e non risulta né rinnovato né chiuso.',
      'reason.multiple_active_contracts': 'Più contratti attivi sulla stessa unità: BOOM verifica.',
      'reason.contract_date_conflict': 'Le date del contratto sono da verificare.',
      'reason.read_partial': 'Una parte dei dati non si è caricata: riprova tra poco.',
      'reason.registration_unknown': 'La registrazione del contratto non risulta ancora: BOOM non ha registrato l’esito.',
      'reason.lease_unsigned': 'Il contratto non risulta ancora firmato da tutte le parti.',
      'reason.signature_unrecorded': 'La firma del contratto non risulta a sistema: BOOM verifica.',
      'reason.charges_after_termination': 'Ci sono rate aperte dopo la cessazione del {date}: BOOM verifica se sono dovute.',
      'reason.charges_after_termination_undated': 'Ci sono rate aperte su un contratto cessato senza data di cessazione registrata: BOOM verifica se sono dovute.',
      'reason.charge_overdue': '{what} in ritardo da {days} giorni.',
      'reason.charge_reported': '{what}: il conduttore segnala un bonifico, BOOM verifica.',
      'reason.charge_processing': '{what}: pagamento in elaborazione.',
      'reason.charge_state_unknown': '{what}: lo stato non è registrato.',
      'reason.charge_amount_missing': '{what}: l’importo non è registrato.',
      'dot.ok': 'In ordine', 'dot.tu': 'Serve te', 'dot.osservo': 'Da seguire', 'dot.nonso': 'Da verificare',
      'todo.none': 'Niente da fare per te.',
      'todo.outcome': 'BOOM non ha ancora registrato l’esito.',
      'todo.overdue': 'scaduta il {date}',
      'todo.sign': 'Firma il contratto di {address}',
      'todo.sign.cta': 'Firma ora',
      'todo.scheda.one': 'Manca un tuo dato: {list}',
      'todo.scheda.many': 'Mancano {n} tuoi dati: {list}',
      'todo.scheda.cta': 'Completa i tuoi dati',
      'todo.docs': 'Carica {doc}',
      'todo.viewas_hidden': 'Link personale nascosto in modalità vedi come',
      'row.paid': 'Pagata dal conduttore il {date} · {via}',
      'row.paid_novia': 'Registrata come pagata il {date} · via non registrata',
      'row.due': 'In scadenza il {date}',
      'row.overdue': 'In ritardo da {days} giorni (scadenza {date})',
      'row.reported': 'Il conduttore segnala un bonifico del {date}: BOOM verifica',
      'row.processing': 'Pagamento in elaborazione',
      'row.processing_sepa': 'Addebito SEPA in corso',
      'row.unknown': 'Stato non registrato',
      'row.no_amount': 'importo non registrato',
      'row.cancelled': 'Annullata',
      'row.after_end': 'Successiva alla cessazione del {date}: BOOM verifica se è dovuta',
      'row.after_end_undated': 'Contratto cessato, data di cessazione non registrata: BOOM verifica se è dovuta',
      'row.reminders.one': 'un sollecito inviato, l’ultimo il {date}',
      'row.reminders.many': '{n} solleciti inviati, l’ultimo il {date}',
      'via.card': 'carta', 'via.sepa': 'addebito SEPA', 'via.bank': 'bonifico', 'via.none': 'via non registrata',
      'money.year': 'Pagato dal conduttore nel {year}',
      'money.year_registered': 'Registrato come pagato nel {year}',
      'money.year_count.one': '{paid} su una rata',
      'money.year_count.many': '{paid} su {n} rate',
      'money.unknown_amount.one': 'una rata senza importo registrato',
      'money.unknown_amount.many': '{n} rate senza importo registrato',
      'money.payout_note': 'Il versamento di BOOM sul tuo conto non è ancora registrato in questo portale.',
      'money.deposit_balance': 'Saldo deposito',
      'money.other_charge': 'Altro addebito',
      'file.too_large': 'Documento di {mb} MB: troppo grande da aprire qui. Chiedilo a BOOM: te lo mandiamo noi.',
      'file.not_generated': 'Segnato come inviato, ma il PDF non è in archivio.',
      'file.external': 'Il file non è nell’archivio BOOM.',
      'file.error': 'Non riesco ad aprire il documento adesso.',
      'ghost.signed': 'Contratto firmato: non ancora in archivio',
      'ghost.ape': 'APE: non ancora nel fascicolo',
      'ghost.verbale': 'Verbale di consegna: non ancora in archivio',
      'stage.proposta': 'Proposta accettata', 'stage.firma_conduttore': 'Firma del conduttore',
      'stage.firma_proprietario': 'La tua firma', 'stage.firmato': 'Contratto firmato',
      'stage.registrazione': 'Registrazione', 'stage.chiavi': 'Consegna delle chiavi',
      'stage.inventario': 'Inventario', 'stage.inizio': 'Inizio', 'stage.rinnovo': 'Rinnovato',
      'stage.cessazione': 'Cessato', 'stage.riconsegna': 'Riconsegna', 'stage.fine': 'Fine',
      'stagestate.done': 'fatto', 'stagestate.now': 'adesso', 'stagestate.next': 'dopo',
      'stagestate.conflict': 'da verificare', 'stagestate.unknown': 'non registrato',
      'note.per_mandato': 'firmato per mandato', 'note.per_delega': 'firmato per delega',
      'note.delega_attiva': 'firmerà BOOM per tua delega',
      'note.firma_non_registrata': 'firma non registrata a sistema',
      'note.su_carta': 'firmato su carta, registrato da BOOM',
      'note.inviata_aspi': 'pratica inviata per la registrazione',
      'note.data_di_conferma': 'data in cui BOOM l’ha segnata',
      'note.esito_non_registrato': 'esito non ancora registrato',
      'kind.draft': 'Contratto da firmare', 'kind.signed': 'Contratto firmato',
      'kind.scheda': 'Scheda di calcolo del canone (Allegato 2/B)', 'kind.verbale': 'Verbale di consegna',
      'kind.inv-in': 'Inventario di consegna', 'kind.inv-out': 'Inventario di riconsegna',
      'kind.valutazione': 'Valutazione BOOM', 'kind.dossier-visura': 'Visura catastale',
      'kind.dossier-planimetria': 'Planimetria', 'kind.dossier-ape': 'APE · attestato di prestazione energetica',
      'kind.dossier-delega': 'Delega', 'kind.rendiconto': 'Rendiconto di {month}',
      'kind.own-document': 'Documento',
      'kind.certificate': 'Certificato di firma elettronica', 'kind.tsr': 'Marca temporale',
      'kind.doc-contratto': 'Contratto di locazione', 'kind.doc-rli': 'Registrazione RLI',
      'kind.doc-cedolare': 'Opzione cedolare secca', 'kind.doc-fattura-spese': 'Fattura spese / manutenzione',
      'kind.doc-f24-registro': 'F24 imposta di registro', 'kind.doc-f24-imu': 'F24 IMU',
      'kind.doc-istat': 'Adeguamento ISTAT', 'kind.doc-ape': 'APE', 'kind.doc-visura': 'Visura catastale',
      'kind.doc-verbale': 'Verbale di consegna', 'kind.doc-inventario': 'Inventario',
      'fact.certificate': 'Certificato di firma elettronica generato',
      'fact.tsr': 'Marca temporale presente',
      'fact.rent_receipt': 'Ricevuta emessa al conduttore',
      'fact.photo': 'foto allegata',
      'fact.invoice_nopdf': 'PDF non archiviato',
      'prov.firma_completa': 'nato alla firma completa', 'prov.generato': 'generato dal sistema',
      'prov.fascicolo': 'nato con il fascicolo del contratto', 'prov.consegna_chiavi': 'nato alla consegna delle chiavi',
      'prov.giro_inventario': 'nato dal giro dell’inventario', 'prov.riconsegna': 'nato alla riconsegna',
      'prov.valutazione': 'nato dalla valutazione BOOM', 'prov.fascicolo_immobile': 'caricato nel fascicolo dell’immobile',
      'prov.rendiconto_mensile': 'rendiconto del mese', 'prov.archiviato': 'archiviato',
      'by.sistema': 'dal sistema', 'by.operatore': 'da BOOM', 'by.proprietario': 'da te', 'by.non_noto': 'autore non registrato',
      'ribbon.paid': 'pagata', 'ribbon.due': 'in scadenza', 'ribbon.overdue': 'in ritardo',
      'ribbon.reported': 'bonifico segnalato', 'ribbon.processing': 'in elaborazione',
      'ribbon.unknown': 'stato non registrato', 'ribbon.cancelled': 'annullata',
      'ribbon.empty': 'nessuna rata a sistema', 'ribbon.fuori': 'fuori dal contratto',
      'status.signed': 'firmato', 'status.awaiting_signatures': 'in attesa delle firme',
      'status.unrecorded': 'firma non registrata a sistema', 'status.renewed': 'rinnovato',
      'status.signed_paper': 'firmato su carta',
      'status.terminated': 'cessato', 'status.expired': 'scaduto',
      'type.transitorio': 'transitorio', 'type.studenti': 'per studenti', 'type.3+2': '3+2 a canone concordato',
      'type.4+4': '4+4', 'type.none': 'Tipo non indicato',
      'cadence.1': 'mensili', 'cadence.2': 'bimestrali', 'cadence.3': 'trimestrali',
      'cadence.6': 'semestrali', 'cadence.12': 'annuali', 'cadence.none': 'cadenza non indicata',
      'invoice.open': 'da pagare', 'invoice.paid': 'pagata', 'invoice.cancelled': 'annullata',
      'maint.plumbing': 'Idraulica', 'maint.electrical': 'Elettricità', 'maint.heating': 'Riscaldamento',
      'maint.appliance': 'Elettrodomestici', 'maint.other': 'Altro',
      'maint.status.open': 'aperta', 'maint.status.pending': 'in attesa', 'maint.status.in_progress': 'in corso',
      'maint.status.resolved': 'risolta', 'maint.status.closed': 'chiusa', 'maint.status.unknown': 'stato non registrato',
      'folder.contratto': 'Contratto', 'folder.consegna': 'Consegna', 'folder.soldi': 'Soldi', 'folder.immobile': 'Immobile',
      'state.firmato': 'firmato', 'state.bozza': 'bozza', 'state.ultima': 'ultima versione',
      'facts.lease': 'Contratto {status} fino al {date}',
      'facts.lease_unrecorded': 'Contratto fino al {date} · firma non registrata a sistema',
      'facts.leases': '{n} contratti in corso',
      'facts.vacant': 'Immobile libero: nessun contratto a sistema',
      'facts.no_lease': 'Risulta affittato, nessun contratto attivo a sistema',
      'facts.month.paid': 'Rata di {month} pagata dal conduttore il {date}',
      'facts.month.paid_novia': 'Rata di {month} registrata come pagata il {date}',
      'facts.month.due': 'Rata di {month} in scadenza il {date}',
      'facts.month.overdue': 'Rata di {month} in ritardo da {days} giorni',
      'facts.month.reported': 'Rata di {month}: il conduttore segnala un bonifico',
      'facts.month.processing': 'Rata di {month} in elaborazione',
      'facts.month.unknown': 'Rata di {month}: stato non registrato',
      'facts.month.cancelled': 'Rata di {month} annullata',
      'facts.no_rows': 'Rate di {month} non ancora a sistema',
      'facts.deadlines.one': 'Una scadenza nei prossimi 30 giorni',
      'facts.deadlines.many': '{n} scadenze nei prossimi 30 giorni',
      'ui.title': 'Il tuo archivio', 'ui.exit': 'Esci', 'ui.lang': 'English',
      'ui.eyebrow': 'Il tuo archivio · {date}', 'ui.updated': 'Aggiornato alle {time}', 'ui.verifying': 'verifico…',
      'ui.more_houses.one': '+ un’altra casa', 'ui.more_houses.many': '+{n} altre case',
      'ui.adminband': 'Stai vedendo l’archivio di {name} come lo vede lui · i link personali sono nascosti',
      'ui.back_portal': 'Torna al portal',
      'ui.error': 'Non riesco a leggere il tuo archivio adesso.', 'ui.retry': 'Riprova', 'ui.whatsapp': 'Scrivi su WhatsApp',
      'ui.cadastral': 'Foglio {foglio} · Part. {particella} · Sub {sub} · Cat. {categoria}',
      'ui.cadastral_missing': 'Dati catastali: da completare',
      'ui.contract_line': 'Contratto {type} con {name}',
      'ui.cotenants.one': 'e un co-conduttore', 'ui.cotenants.many': 'e {n} co-conduttori',
      // daysToEnd = i giorni che MANCANO alla fine, non la durata del contratto.
      'ui.lease_dates.one': 'dal {from} al {to} · manca un giorno',
      'ui.lease_dates.many': 'dal {from} al {to} · mancano {n} giorni',
      'ui.lease_dates_only': 'dal {from} al {to}',
      'ui.rent_line': 'Canone {amount} al mese · rate {cadence}',
      'ui.rent_missing': 'Canone non registrato',
      'ui.cedolare.yes': 'Cedolare secca: sì', 'ui.cedolare.no': 'Cedolare secca: no', 'ui.cedolare.null': 'Cedolare secca: non indicata',
      'ui.unit': 'Interno {unit}',
      'ui.maint_line': '{category}: {title}',
      'ui.maint_opened': 'aperta il {date}', 'ui.maint_resolved': 'risolta il {date}', 'ui.maint_cost': 'costo registrato {amount}',
      'ui.no_maint': 'Nessun intervento registrato', 'ui.see_all': 'Vedi tutti',
      'ui.valuation': 'Valutazione BOOM del {date} · canone proposto {amount}',
      'ui.past_contracts': 'Contratti precedenti ({n})',
      'ui.search_placeholder': 'Cerca: chiavi, APE, marzo 2026…',
      'ui.new_since.one': 'un nuovo documento dall’ultima visita', 'ui.new_since.many': '{n} nuovi dall’ultima visita',
      'ui.archive_empty': 'Qui arriveranno da soli i documenti: alla firma, alla consegna delle chiavi, al primo rendiconto.',
      'ui.invoice_line': 'Fattura BOOM n. {number} · {service} · {amount} · {status} · PDF non archiviato',
      'ui.advisor': 'Il tuo riferimento', 'ui.introduce': 'Conosci un proprietario? Presentacelo',
      'ui.introduce_text': 'Ciao Valentino, vorrei presentarti un proprietario:',
      'ui.legal': 'BOOM Roma · Egidi Immobiliare',
      'ui.nuovo': 'nuovo', 'ui.share': 'Invia al commercialista', 'ui.open': 'Apri', 'ui.close': 'Chiudi',
      'ui.contract_short': 'Contratto {from}–{to}',
      'ui.rendiconti': 'Rendiconti',
      'qnav.verdict': 'Risposta', 'qnav.todo': 'Da fare', 'qnav.houses': 'Case', 'qnav.archive': 'Archivio',
      'sheet.proof': 'Da dove viene questo numero', 'sheet.rows': 'Le rate sommate', 'sheet.statement': 'Il rendiconto del mese',
      'sheet.provenance': 'Da dove viene questo documento',
      'sheet.due': 'scadenza il {date}',
      'ui.loading': 'Apro il tuo archivio…', 'ui.search_none': 'Nessun documento trovato per «{q}».',
      'ui.maint_title': 'Interventi', 'ui.details': 'Dettagli', 'ui.email': 'Email',
      'share.preparing': 'Preparo il file…', 'share.tap': 'Tocca di nuovo per inviare',
    },
    en: {
      'verdict.ok': 'All in order.',
      'verdict.tu.sign': 'Your signature is needed.',
      'verdict.tu.scheda.one': 'One of your details is missing.',
      'verdict.tu.scheda.many': '{n} of your details are missing.',
      'verdict.tu.deadline': 'You have a deadline by {date}.',
      'verdict.tu.deadline_overdue': 'One of your deadlines passed on {date}.',
      'verdict.osservo.overdue.one': 'A payment is {days} days late.',
      'verdict.osservo.overdue.many': '{n} payments are late.',
      'verdict.osservo.reported': 'The tenant reports a transfer: BOOM is checking it.',
      'verdict.osservo.processing': 'A payment is being processed.',
      'verdict.osservo.processing_sepa': 'A SEPA debit is in progress.',
      'verdict.osservo.charge_overdue': '{what} is {days} days late.',
      'verdict.reminder': '· reminder sent on {date}',
      'verdict.nonso': 'I can’t say for certain.',
      'verdict.vuoto': 'No homes are linked to your account yet.',
      'verdict.vuoto.cta': 'Write to BOOM: we’ll link them for you.',
      'reason.sign_needed': 'The lease for {address} is waiting for your signature.',
      'reason.scheda_needed': 'Some of your details are missing for the lease of {address}.',
      'reason.deadline_soon': 'Deadline by {date}: {title}.',
      'reason.deadline_overdue': 'Deadline passed on {date}: BOOM hasn’t recorded the outcome yet.',
      'reason.rent_overdue': 'The {month} payment is {days} days late.',
      'reason.rent_reported': 'The tenant reports a transfer: BOOM is checking.',
      'reason.rent_processing': 'Payment being processed.',
      'reason.rent_processing_sepa': 'SEPA debit in progress.',
      'reason.rent_unlinked': 'A payment isn’t linked to the lease: BOOM is checking.',
      'reason.rent_amount_missing': 'A payment has no amount recorded.',
      'reason.rent_state_unknown': 'A payment’s status isn’t recorded.',
      'reason.rent_month_missing': 'A payment has no month recorded.',
      'reason.installments_missing': '{month} payments aren’t in the system yet.',
      'reason.rented_without_contract': 'Marked as rented, but no active lease is in the system.',
      'reason.contract_expired_open': 'The lease ended on {date} and is recorded as neither renewed nor closed.',
      'reason.multiple_active_contracts': 'More than one active lease on the same unit: BOOM is checking.',
      'reason.contract_date_conflict': 'The lease dates need checking.',
      'reason.read_partial': 'Part of the data didn’t load: try again shortly.',
      'reason.registration_unknown': 'The lease registration isn’t recorded yet: BOOM hasn’t recorded the outcome.',
      'reason.lease_unsigned': 'The lease isn’t signed by all parties yet.',
      'reason.signature_unrecorded': 'The lease signature isn’t recorded in the system: BOOM is checking.',
      'reason.charges_after_termination': 'Some payments are still open after the termination on {date}: BOOM is checking whether they are due.',
      'reason.charges_after_termination_undated': 'Some payments are still open on a terminated lease with no termination date recorded: BOOM is checking whether they are due.',
      'reason.charge_overdue': '{what} is {days} days late.',
      'reason.charge_reported': '{what}: the tenant reports a transfer, BOOM is checking.',
      'reason.charge_processing': '{what}: payment being processed.',
      'reason.charge_state_unknown': '{what}: status not recorded.',
      'reason.charge_amount_missing': '{what}: no amount recorded.',
      'dot.ok': 'In order', 'dot.tu': 'Needs you', 'dot.osservo': 'Being followed', 'dot.nonso': 'Needs checking',
      'todo.none': 'Nothing for you to do.',
      'todo.outcome': 'BOOM hasn’t recorded the outcome yet.',
      'todo.overdue': 'overdue since {date}',
      'todo.sign': 'Sign the lease for {address}',
      'todo.sign.cta': 'Sign now',
      'todo.scheda.one': 'One of your details is missing: {list}',
      'todo.scheda.many': '{n} of your details are missing: {list}',
      'todo.scheda.cta': 'Complete your details',
      'todo.docs': 'Upload {doc}',
      'todo.viewas_hidden': 'Personal link hidden in view-as mode',
      'row.paid': 'Paid by the tenant on {date} · {via}',
      'row.paid_novia': 'Recorded as paid on {date} · method not recorded',
      'row.due': 'Due on {date}',
      'row.overdue': '{days} days late (due {date})',
      'row.reported': 'The tenant reports a transfer on {date}: BOOM is checking',
      'row.processing': 'Payment being processed',
      'row.processing_sepa': 'SEPA debit in progress',
      'row.unknown': 'Status not recorded',
      'row.no_amount': 'amount not recorded',
      'row.cancelled': 'Cancelled',
      'row.after_end': 'After the termination on {date}: BOOM is checking whether it is due',
      'row.after_end_undated': 'Lease terminated, no termination date recorded: BOOM is checking whether it is due',
      'row.reminders.one': 'one reminder sent, the last on {date}',
      'row.reminders.many': '{n} reminders sent, the last on {date}',
      'via.card': 'card', 'via.sepa': 'SEPA debit', 'via.bank': 'bank transfer', 'via.none': 'method not recorded',
      'money.year': 'Paid by the tenant in {year}',
      'money.year_registered': 'Recorded as paid in {year}',
      'money.year_count.one': '{paid} over one payment',
      'money.year_count.many': '{paid} over {n} payments',
      'money.unknown_amount.one': 'one payment with no amount recorded',
      'money.unknown_amount.many': '{n} payments with no amount recorded',
      'money.payout_note': 'BOOM’s transfer to your account isn’t recorded in this portal yet.',
      'money.deposit_balance': 'Deposit balance',
      'money.other_charge': 'Other charge',
      'file.too_large': 'This {mb} MB document is too large to open here. Ask BOOM: we’ll send it to you.',
      'file.not_generated': 'Marked as sent, but the PDF isn’t in the archive.',
      'file.external': 'The file isn’t in the BOOM archive.',
      'file.error': 'I can’t open the document right now.',
      'ghost.signed': 'Signed lease: not in the archive yet',
      'ghost.ape': 'Energy certificate: not in the file yet',
      'ghost.verbale': 'Handover report: not in the archive yet',
      'stage.proposta': 'Proposal accepted', 'stage.firma_conduttore': 'Tenant’s signature',
      'stage.firma_proprietario': 'Your signature', 'stage.firmato': 'Lease signed',
      'stage.registrazione': 'Registration', 'stage.chiavi': 'Key handover',
      'stage.inventario': 'Inventory', 'stage.inizio': 'Start', 'stage.rinnovo': 'Renewed',
      'stage.cessazione': 'Terminated', 'stage.riconsegna': 'Move-out', 'stage.fine': 'End',
      'stagestate.done': 'done', 'stagestate.now': 'now', 'stagestate.next': 'next',
      'stagestate.conflict': 'needs checking', 'stagestate.unknown': 'not recorded',
      'note.per_mandato': 'signed under mandate', 'note.per_delega': 'signed under delegation',
      'note.delega_attiva': 'BOOM will sign under your delegation',
      'note.firma_non_registrata': 'signature not recorded in the system',
      'note.su_carta': 'signed on paper, recorded by BOOM',
      'note.inviata_aspi': 'sent for registration',
      'note.data_di_conferma': 'date BOOM recorded it',
      'note.esito_non_registrato': 'outcome not recorded yet',
      'kind.draft': 'Lease to sign', 'kind.signed': 'Signed lease',
      'kind.scheda': 'Rent calculation sheet (Allegato 2/B)', 'kind.verbale': 'Handover report',
      'kind.inv-in': 'Move-in inventory', 'kind.inv-out': 'Move-out inventory',
      'kind.valutazione': 'BOOM valuation', 'kind.dossier-visura': 'Land registry extract',
      'kind.dossier-planimetria': 'Floor plan', 'kind.dossier-ape': 'Energy performance certificate (APE)',
      'kind.dossier-delega': 'Delegation', 'kind.rendiconto': '{month} statement',
      'kind.own-document': 'Document',
      'kind.certificate': 'Electronic signature certificate', 'kind.tsr': 'Timestamp',
      'kind.doc-contratto': 'Lease agreement', 'kind.doc-rli': 'RLI registration',
      'kind.doc-cedolare': 'Cedolare secca option', 'kind.doc-fattura-spese': 'Expense / maintenance invoice',
      'kind.doc-f24-registro': 'F24 registration tax', 'kind.doc-f24-imu': 'F24 IMU',
      'kind.doc-istat': 'ISTAT adjustment', 'kind.doc-ape': 'Energy certificate (APE)', 'kind.doc-visura': 'Land registry extract',
      'kind.doc-verbale': 'Handover report', 'kind.doc-inventario': 'Inventory',
      'fact.certificate': 'Electronic signature certificate generated',
      'fact.tsr': 'Timestamp present',
      'fact.rent_receipt': 'Receipt issued to the tenant',
      'fact.photo': 'photo attached',
      'fact.invoice_nopdf': 'PDF not archived',
      'prov.firma_completa': 'created when all parties signed', 'prov.generato': 'generated by the system',
      'prov.fascicolo': 'created with the lease file', 'prov.consegna_chiavi': 'created at the key handover',
      'prov.giro_inventario': 'created from the inventory walk-through', 'prov.riconsegna': 'created at move-out',
      'prov.valutazione': 'created from the BOOM valuation', 'prov.fascicolo_immobile': 'uploaded to the property file',
      'prov.rendiconto_mensile': 'monthly statement', 'prov.archiviato': 'archived',
      'by.sistema': 'by the system', 'by.operatore': 'by BOOM', 'by.proprietario': 'by you', 'by.non_noto': 'author not recorded',
      'ribbon.paid': 'paid', 'ribbon.due': 'due', 'ribbon.overdue': 'late',
      'ribbon.reported': 'transfer reported', 'ribbon.processing': 'being processed',
      'ribbon.unknown': 'status not recorded', 'ribbon.cancelled': 'cancelled',
      'ribbon.empty': 'no payment in the system', 'ribbon.fuori': 'outside the lease',
      'status.signed': 'signed', 'status.awaiting_signatures': 'awaiting signatures',
      'status.unrecorded': 'signature not recorded in the system', 'status.renewed': 'renewed',
      'status.signed_paper': 'signed on paper',
      'status.terminated': 'terminated', 'status.expired': 'expired',
      'type.transitorio': 'transitional', 'type.studenti': 'student', 'type.3+2': '3+2 agreed-rent',
      'type.4+4': '4+4', 'type.none': 'Type not recorded',
      'cadence.1': 'monthly', 'cadence.2': 'every two months', 'cadence.3': 'quarterly',
      'cadence.6': 'every six months', 'cadence.12': 'yearly', 'cadence.none': 'schedule not recorded',
      'invoice.open': 'to pay', 'invoice.paid': 'paid', 'invoice.cancelled': 'cancelled',
      'maint.plumbing': 'Plumbing', 'maint.electrical': 'Electrical', 'maint.heating': 'Heating',
      'maint.appliance': 'Appliances', 'maint.other': 'Other',
      'maint.status.open': 'open', 'maint.status.pending': 'pending', 'maint.status.in_progress': 'in progress',
      'maint.status.resolved': 'resolved', 'maint.status.closed': 'closed', 'maint.status.unknown': 'status not recorded',
      'folder.contratto': 'Lease', 'folder.consegna': 'Handover', 'folder.soldi': 'Money', 'folder.immobile': 'Property',
      'state.firmato': 'signed', 'state.bozza': 'draft', 'state.ultima': 'latest version',
      'facts.lease': 'Lease {status} until {date}',
      'facts.lease_unrecorded': 'Lease until {date} · signature not recorded in the system',
      'facts.leases': '{n} leases running',
      'facts.vacant': 'Vacant: no lease in the system',
      'facts.no_lease': 'Marked as rented, no active lease in the system',
      'facts.month.paid': '{month} payment paid by the tenant on {date}',
      'facts.month.paid_novia': '{month} payment recorded as paid on {date}',
      'facts.month.due': '{month} payment due on {date}',
      'facts.month.overdue': '{month} payment {days} days late',
      'facts.month.reported': '{month} payment: the tenant reports a transfer',
      'facts.month.processing': '{month} payment being processed',
      'facts.month.unknown': '{month} payment: status not recorded',
      'facts.month.cancelled': '{month} payment cancelled',
      'facts.no_rows': '{month} payments not in the system yet',
      'facts.deadlines.one': 'One deadline in the next 30 days',
      'facts.deadlines.many': '{n} deadlines in the next 30 days',
      'ui.title': 'Your archive', 'ui.exit': 'Sign out', 'ui.lang': 'Italiano',
      'ui.eyebrow': 'Your archive · {date}', 'ui.updated': 'Updated at {time}', 'ui.verifying': 'checking…',
      'ui.more_houses.one': '+ one more home', 'ui.more_houses.many': '+{n} more homes',
      'ui.adminband': 'You are viewing {name}’s archive as they see it · personal links are hidden',
      'ui.back_portal': 'Back to the portal',
      'ui.error': 'I can’t read your archive right now.', 'ui.retry': 'Try again', 'ui.whatsapp': 'Write on WhatsApp',
      'ui.cadastral': 'Sheet {foglio} · Parcel {particella} · Sub {sub} · Cat. {categoria}',
      'ui.cadastral_missing': 'Cadastral data: to be completed',
      'ui.contract_line': '{type} lease with {name}',
      'ui.cotenants.one': 'and one co-tenant', 'ui.cotenants.many': 'and {n} co-tenants',
      'ui.lease_dates.one': 'from {from} to {to} · one day left',
      'ui.lease_dates.many': 'from {from} to {to} · {n} days left',
      'ui.lease_dates_only': 'from {from} to {to}',
      'ui.rent_line': 'Rent {amount} a month · {cadence} payments',
      'ui.rent_missing': 'Rent not recorded',
      'ui.cedolare.yes': 'Cedolare secca: yes', 'ui.cedolare.no': 'Cedolare secca: no', 'ui.cedolare.null': 'Cedolare secca: not stated',
      'ui.unit': 'Unit {unit}',
      'ui.maint_line': '{category}: {title}',
      'ui.maint_opened': 'opened on {date}', 'ui.maint_resolved': 'resolved on {date}', 'ui.maint_cost': 'recorded cost {amount}',
      'ui.no_maint': 'No repairs recorded', 'ui.see_all': 'See all',
      'ui.valuation': 'BOOM valuation of {date} · proposed rent {amount}',
      'ui.past_contracts': 'Previous leases ({n})',
      'ui.search_placeholder': 'Search: keys, APE, March 2026…',
      'ui.new_since.one': 'one new document since your last visit', 'ui.new_since.many': '{n} new since your last visit',
      'ui.archive_empty': 'Documents will arrive here on their own: at signing, at the key handover, with the first statement.',
      'ui.invoice_line': 'BOOM invoice no. {number} · {service} · {amount} · {status} · PDF not archived',
      'ui.advisor': 'Your contact', 'ui.introduce': 'Know an owner? Introduce them to us',
      'ui.introduce_text': 'Hi Valentino, I’d like to introduce you to an owner:',
      'ui.legal': 'BOOM Roma · Egidi Immobiliare',
      'ui.nuovo': 'new', 'ui.share': 'Send to your accountant', 'ui.open': 'Open', 'ui.close': 'Close',
      'ui.contract_short': 'Lease {from}–{to}',
      'ui.rendiconti': 'Statements',
      'qnav.verdict': 'Answer', 'qnav.todo': 'To do', 'qnav.houses': 'Homes', 'qnav.archive': 'Archive',
      'sheet.proof': 'Where this number comes from', 'sheet.rows': 'The payments summed', 'sheet.statement': 'The month’s statement',
      'sheet.provenance': 'Where this document comes from',
      'sheet.due': 'due on {date}',
      'ui.loading': 'Opening your archive…', 'ui.search_none': 'No documents found for “{q}”.',
      'ui.maint_title': 'Repairs', 'ui.details': 'Details', 'ui.email': 'Email',
      'share.preparing': 'Preparing the file…', 'share.tap': 'Tap again to send',
    },
  };

  function t(k, lang, params) {
    var p = params || {}, l = L(lang), s = STRINGS[l][k];
    if (s == null && STRINGS.it[k] != null) s = STRINGS.it[k];
    if (s == null && p.n != null) {
      var pk = k + (Number(p.n) === 1 ? '.one' : '.many');
      s = STRINGS[l][pk] != null ? STRINGS[l][pk] : STRINGS.it[pk];
    }
    if (s == null) return k;
    return String(s).replace(/\{(\w+)\}/g, function (m, name) { return p[name] == null ? m : String(p[name]); });
  }

  // ── Il testo che esce: mai un recapito, un CF, un IBAN ─────────────────
  var RX_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var RX_PHONE_INTL = /(?:\+|00)\d[\d\s.-]{6,}\d/g;
  var RX_PHONE_IT = /\b3\d{2}[\s.]?\d{6,7}\b/g;
  var RX_CF = /\b[A-Za-z]{6}[0-9LMNPQRSTUVlmnpqrstuv]{2}[A-EHLMPR-Ta-ehlmpr-t][0-9LMNPQRSTUVlmnpqrstuv]{2}[A-Za-z][0-9LMNPQRSTUVlmnpqrstuv]{3}[A-Za-z]\b/g;
  var RX_IBAN = /\b[A-Z]{2}\d{2}\s?(?:[A-Z0-9]\s?){11,30}\b/g;
  // LE REGOLE DEL TESTO, in una copia sola: assertClean le usa per RIFIUTARE
  // una stringa, scrubText per NEUTRALIZZARLA prima. Prima erano due elenchi
  // e non dicevano la stessa cosa: «Data: 12/09 — perdita» (un titolo di
  // manutenzione) o «Scansione_001234567.pdf» passavano la pulizia e poi
  // facevano cadere l'intero archivio con 500 projection_unsafe. Ora il
  // telefono è UNA regex e il «data:» iniziale ha una regola sola.
  var RX_PHONE = /(?:\+|00)\d{7,}|\b3\d{2}[\s.]?\d{6,7}\b/;
  var RX_DATA_URI = /^\s*data:/i;
  var TEXT_PATTERNS = [
    ['storage_url', /firebasestorage\.googleapis\.com/i],
    ['token_param', /[?&]token=/i],
    ['stripe', /pay\.stripe\.com/i],
    ['data_uri', RX_DATA_URI],
    ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
    ['cf', /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/],
    ['iban', /\bIT\d{2}[A-Z]\d{10}[0-9A-Z]{12}\b/],
    ['phone', RX_PHONE],
  ];
  function globalOf(rx) { return new RegExp(rx.source, rx.flags.indexOf('g') >= 0 ? rx.flags : rx.flags + 'g'); }
  function scrubText(s, max) {
    var m = max == null ? 80 : max;
    var x = str(s).replace(/\s+/g, ' ');
    if (!x) return null;
    // Un vero data: URI (data:image/png;base64,…) non è testo: via tutto.
    if (/^\s*data:[\w.+-]+\/[\w.+-]+[;,]/i.test(x)) return null;
    // Un URL che porta Storage, un token o una ricevuta Stripe esce intero.
    x = x.replace(/\bhttps?:\/\/\S+/gi, function (u) { return /firebasestorage\.googleapis\.com|[?&]token=|pay\.stripe\.com/i.test(u) ? '…' : u; });
    // Un «?token=…» fuori da un URL se ne va col suo valore, non solo l'etichetta.
    x = x.replace(/[?&]token=[^\s&#]*/gi, '…');
    x = x.replace(RX_EMAIL, '…').replace(RX_IBAN, '…').replace(RX_CF, '…').replace(RX_PHONE_INTL, '…').replace(RX_PHONE_IT, '…');
    // Poi esattamente ciò che assertClean rifiuta, con le SUE regole.
    /* mp:scrub-rules */ TEXT_PATTERNS.forEach(function (pt) { if (pt[0] !== 'data_uri') x = x.replace(globalOf(pt[1]), '…'); });
    x = x.trim();
    // «Data: 12/09 …» è l'italiano di «Date:», non un URI: resta leggibile.
    x = /* mp:scrub-data */ x.replace(/^(data)\s*:/i, '$1 –');
    if (!x) return null;
    if (x.length > m) x = x.slice(0, Math.max(1, m - 1)).trim() + '…';
    // L'invariante: ciò che scrubText lascia passare, assertClean lo accetta.
    // Se una sostituzione ne avesse creata un'altra, il testo non esce.
    if (TEXT_PATTERNS.some(function (pt) { return pt[1].test(x); })) return null;
    return x;
  }
  function looksLikeContact(s) {
    var x = str(s);
    RX_EMAIL.lastIndex = 0; RX_PHONE_INTL.lastIndex = 0; RX_PHONE_IT.lastIndex = 0;
    return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(x) || /(?:\+|00)\d[\d\s.-]{6,}\d/.test(x) || /\b3\d{2}[\s.]?\d{6,7}\b/.test(x);
  }
  // Gli importi fiscali non si stampano (§A6): «(min €67)» sparisce intero.
  function stripAmounts(s) {
    return str(s)
      .replace(/\([^()]*(?:€|\bEUR\b)[^()]*\)/gi, '')
      .replace(/(?:€\s?|\bEUR\s?)\d[\d.,]*/gi, '')
      .replace(/\b\d[\d.,]*\s?(?:€|EUR\b)/gi, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ── Riferimenti ai file ───────────────────────────────────────────────
  var C_KINDS = ['draft', 'signed', 'scheda', 'verbale', 'inv-in', 'inv-out', 'valutazione'];
  var P_KINDS = ['inv-in', 'inv-out', 'valutazione', 'dossier-visura', 'dossier-planimetria', 'dossier-ape', 'dossier-delega'];
  var REF_RE = /^(c|p|d|r):([\w.-]{1,160})(?::([a-z-]{2,24}|\d{4}-(?:0[1-9]|1[0-2])))?$/;
  function badId(id) { return !ID_RE.test(id) || id === '.' || id === '..'; }
  function parseRef(s) {
    if (typeof s !== 'string' || s.length > 200) return null;
    var m = REF_RE.exec(s); if (!m) return null;
    var scope = m[1], id = m[2], kind = m[3] || null;
    if (badId(id)) return null;
    if (scope === 'c') { if (C_KINDS.indexOf(kind) < 0) return null; }
    else if (scope === 'p') { if (P_KINDS.indexOf(kind) < 0) return null; }
    else if (scope === 'd') { if (kind) return null; }
    else if (scope === 'r') { if (!kind || !isYm(kind)) return null; }
    return { scope: scope, id: id, kind: kind };
  }
  function encodeRef(x) {
    var o = obj(x), s = o.scope + ':' + o.id + (o.kind ? ':' + o.kind : '');
    var back = parseRef(s);
    if (!back || back.scope !== o.scope || back.id !== o.id || (back.kind || null) !== (o.kind || null)) throw new Error('ref non valido');
    return s;
  }
  // Solo https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<percorso>,
  // bucket in lista, percorso senza «..», senza «/» iniziale, senza «\».
  function parseStorageUrl(url, buckets) {
    if (typeof url !== 'string' || url.length > 2000) return null;
    var u; try { u = new URL(url); } catch (_) { return null; }
    if (u.protocol !== 'https:' || u.host !== STORAGE_HOST || u.username || u.password) return null;
    var m = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(u.pathname);
    if (!m) return null;
    var bucket, path;
    try { bucket = decodeURIComponent(m[1]); path = decodeURIComponent(m[2]); } catch (_) { return null; }
    var allowed = list(buckets).length ? list(buckets).map(str) : DEFAULT_BUCKETS;
    if (allowed.indexOf(bucket) < 0) return null;
    if (!path || path.charAt(0) === '/' || path.indexOf('\\') >= 0 || /[\u0000-\u001f]/.test(path)) return null;
    if (path.split('/').some(function (seg) { return seg === '..' || seg === '.' || seg === ''; })) return null;
    return { bucket: bucket, path: path };
  }

  // ── La tabella di visibilità (una riga per tipo) ──────────────────────
  function row(scope, field, owner, folder, event, it, en) { return { scope: scope, field: field, owner: owner, folder: folder, event: event, why: { it: it, en: en } }; }
  var VISIBILITY = {
    'draft': row('c', 'contracts.generatedPDF', 'file', 'contratto', 'generato', 'Il testo che sta per firmare, solo finché la firma non è completa e solo con un giro di firma digitale provato; mai se la firma non risulta a sistema.', 'The text he is about to sign, only until signing is complete and only with a proven digital signing round; never when the signature isn’t recorded.'),
    'signed': row('c', 'contracts.signedPdfUrl', 'file', 'contratto', 'firma_completa', 'Il suo atto firmato: lo riceve già per email.', 'His signed act; he already receives it by email.'),
    'scheda': row('c', 'contracts.schedaCanoneUrl', 'file', 'contratto', 'fascicolo', 'Allegato 2/B, che firma anche lui.', 'Allegato 2/B, which he co-signs.'),
    'verbale': row('c', 'contracts.verbaleConsegna.url', 'file', 'consegna', 'consegna_chiavi', 'È parte della consegna; lo riceve per email.', 'He is a party to the handover; he receives it by email.'),
    'inv-in': row('c|p', 'inventario.url', 'file', 'consegna', 'giro_inventario', 'Tutela il suo deposito.', 'Protects his deposit claim.'),
    'inv-out': row('c|p', 'inventarioUscita.url', 'file', 'consegna', 'riconsegna', 'Tutela il suo deposito.', 'Protects his deposit claim.'),
    'valutazione': row('c|p', 'valutazioneBoomUrl', 'file', 'immobile', 'valutazione', 'La valutazione BOOM, fatta per lui.', 'BOOM’s valuation, made for him.'),
    'dossier-visura': row('p', 'properties.dossier.visura.url', 'file', 'immobile', 'fascicolo_immobile', 'Fatti del suo immobile.', 'Facts about his own property.'),
    'dossier-planimetria': row('p', 'properties.dossier.planimetria.url', 'file', 'immobile', 'fascicolo_immobile', 'Fatti del suo immobile.', 'Facts about his own property.'),
    'dossier-ape': row('p', 'properties.dossier.ape.url', 'file', 'immobile', 'fascicolo_immobile', 'Fatti del suo immobile.', 'Facts about his own property.'),
    'dossier-delega': row('p', 'properties.dossier.delega.url', 'file', 'immobile', 'fascicolo_immobile', 'Fatti del suo immobile.', 'Facts about his own property.'),
    'rendiconto': row('r', 'rendiconti/<key>/rendiconto_<M>.pdf', 'file', 'soldi', 'rendiconto_mensile', 'Il suo rendiconto mensile.', 'His monthly statement.'),
    'document': row('d', 'documents.fileUrl|storagePath', 'file', null, 'archiviato', 'Solo le categorie dichiarate in DOC_CATEGORIES.', 'Only the categories declared in DOC_CATEGORIES.'),
    'own-document': row('d', 'documents.fileUrl|storagePath', 'file', null, 'archiviato', 'Un documento suo (userId suo), mai una categoria vietata.', 'His own document (his userId), never a forbidden category.'),
    'certificate': row(null, 'contracts.signingCertificateUrl', 'fact', null, null, 'Stampa CF e IP del conduttore: solo il fatto.', 'Prints the tenant’s CF and IP: fact only.'),
    'tsr': row(null, 'contracts.timestampTsrUrl', 'fact', null, null, 'Un .tsr non si legge: il fatto sì.', 'A .tsr is not human-readable; the fact is.'),
    'fascicolo': row(null, 'contracts.fascicoloFiscaleUrl', 'never', null, null, 'Lavoro dell’operatore; la pagina RLI stampa i dati del conduttore.', 'Operator’s working file; the RLI page prints tenant data.'),
    'pack': row(null, 'contracts.registrationPackUrl', 'never', null, null, 'Contiene i documenti d’identità del conduttore.', 'Contains the tenant’s ID scans.'),
    'identity': row(null, 'identityDocs[].url', 'never', null, null, 'Documenti d’identità del conduttore.', 'The tenant’s ID scans.'),
    'mandate': row(null, 'contracts.tenantMandate.docUrl', 'never', null, null, 'Atto del conduttore, porta il suo IP.', 'The tenant’s act; carries the tenant’s IP.'),
    'landlord-pass': row(null, 'landlordPassUrl', 'never', null, null, 'Wallet fuori dalla v1.', 'Wallet is out of v1.'),
    'inventario-frames': row(null, 'inventario.shots[]', 'never', null, null, 'Foto di una casa abitata.', 'Photos of an occupied home.'),
    'rent-receipt': row(null, 'payments.receiptDocId', 'fact', null, null, 'Indirizzata al conduttore.', 'Addressed to the tenant.'),
    'stripe-receipt': row(null, 'payments.receiptUrl', 'never', null, null, 'Porta dati della carta.', 'Carries card data.'),
    'payment-proof': row(null, 'payments.proofUrl', 'never', null, null, 'Dati bancari del conduttore.', 'The tenant’s bank data.'),
    'maintenance-photo': row(null, 'maintenance.photoUrl', 'fact', null, null, 'Dentro la casa del conduttore.', 'Inside the tenant’s home.'),
    'invoice': row(null, 'invoices (recipientId)', 'fact', null, null, 'Nessun PDF archiviato.', 'No PDF is stored.'),
    'sign-request': row(null, 'signRequests.*PdfUrl', 'never', null, null, 'Flussi custom solo admin.', 'Admin-only custom flows.'),
    'signatures': row(null, '*Signature', 'never', null, null, 'Le firme non sono documenti.', 'Signatures are not documents.'),
  };

  // Ogni campo con un URL che i produttori scrivono → un tipo sopra, oppure
  // {ignore:'<collection> — motivo'}. Il test anti-deriva lo confronta coi
  // file che producono (tests/owner/engine.mjs).
  var URL_FIELDS = {
    generatedPDF: 'draft',
    signedPdfUrl: 'signed',
    schedaCanoneUrl: 'scheda',
    signingCertificateUrl: 'certificate',
    timestampTsrUrl: 'tsr',
    fascicoloFiscaleUrl: 'fascicolo',
    registrationPackUrl: 'pack',
    valutazioneBoomUrl: 'valutazione',
    landlordPassUrl: 'landlord-pass',
    receiptUrl: 'stripe-receipt',
    proofUrl: 'payment-proof',
    photoUrl: 'maintenance-photo',
    fileUrl: 'document',
    docUrl: 'mandate',
    'verbaleConsegna.url': 'verbale',
    'inventario.url': 'inv-in',
    'inventarioUscita.url': 'inv-out',
    'inventario.shots[]': 'inventario-frames',
    'inventarioUscita.shots[]': 'inventario-frames',
    'dossier.<slot>.url': 'dossier-visura',
    'identityDocs[].url': 'identity',
    'tenantMandate.docUrl': 'mandate',
    originalPdfUrl: { ignore: 'signRequests — flusso custom solo admin, mai letto' },
    contractPdfUrl: { ignore: 'contracts — campo legacy solo letto, nessuno lo scrive' },
    certificateUrl: { ignore: 'contracts — campo legacy solo letto (conservazione)' },
    tenantSignUrl: { ignore: 'risposta di convert/send-sign — link di firma del conduttore, mai proiettato' },
    landlordSignUrl: { ignore: 'risposta di convert/send-sign — il link di firma arriva dal token, via todo' },
    packUrl: { ignore: 'variabile locale di _finalize — il campo è registrationPackUrl' },
    signedPdf: { ignore: 'variabile locale di _finalize — il campo è signedPdfUrl' },
    schedaUrl: { ignore: 'variabile locale / link /scheda derivato — il file è schedaCanoneUrl' },
    schedaPdfUrl: { ignore: 'variabile locale di _aspi — il campo è schedaCanoneUrl' },
    certUrl: { ignore: 'variabile locale di _aspi — il campo è signingCertificateUrl' },
    fascicoloUrl: { ignore: 'variabile locale di _aspi — il campo è fascicoloFiscaleUrl' },
    jsPDF: { ignore: 'jsPDF — libreria, non un campo' },
    videoUrl: { ignore: 'listings — vetrina pubblica, non archivio' },
    imageUrl: { ignore: 'listings — vetrina pubblica, non archivio' },
  };

  // documents.category (normalizzata) → decisione. Chiavi = CATS[*].category
  // di api/documents/_smista.js + verbale, inventario, ricevuta.
  function cat(owner, id, folder, it, en) { return { owner: owner, id: id, folder: folder, label: { it: it, en: en } }; }
  var DOC_CATEGORIES = {
    'verbale': cat('file', 'verbale', 'consegna', 'Verbale di consegna', 'Handover report'),
    'inventario': cat('file', 'inventario', 'consegna', 'Inventario', 'Inventory'),
    'contratto locazione': cat('file', 'contratto', 'contratto', 'Contratto di locazione', 'Lease agreement'),
    'registrazione rli': cat('file', 'rli', 'contratto', 'Registrazione RLI', 'RLI registration'),
    'cedolare secca opzione': cat('file', 'cedolare', 'contratto', 'Opzione cedolare secca', 'Cedolare secca option'),
    'adeguamento istat': cat('file', 'istat', 'contratto', 'Adeguamento ISTAT', 'ISTAT adjustment'),
    'f24 imposta di registro': cat('file', 'f24-registro', 'soldi', 'F24 imposta di registro', 'F24 registration tax'),
    'f24 imu': cat('file', 'f24-imu', 'soldi', 'F24 IMU', 'F24 IMU'),
    'ape prestazione energetica': cat('file', 'ape', 'immobile', 'APE', 'Energy certificate (APE)'),
    'visura catastale': cat('file', 'visura', 'immobile', 'Visura catastale', 'Land registry extract'),
    'fattura spese manutenzione': cat('file', 'fattura-spese', 'immobile', 'Fattura spese / manutenzione', 'Expense / maintenance invoice'),
    'ricevuta canone incasso': cat('never', 'ricevuta-canone', null, 'Ricevuta canone', 'Rent receipt'),
    'ricevuta': cat('never', 'ricevuta', null, 'Ricevuta', 'Receipt'),
    'f24 tributo versamento': cat('never', 'f24-altro', null, 'F24 / tributi', 'F24 / taxes'),
    'utility bolletta utenza': cat('never', 'utenza', null, 'Bolletta / utenza', 'Utility bill'),
    'documento identita carta id': cat('never', 'identita', null, 'Documento d’identità', 'ID document'),
    'cessione fabbricato': cat('never', 'cessione', null, 'Cessione di fabbricato', 'Building transfer notice'),
    'imposta soggiorno versamento': cat('never', 'soggiorno', null, 'Imposta di soggiorno', 'Tourist tax'),
    'fattura societa invoice': cat('never', 'fattura-societa', null, 'Fattura società', 'Company invoice'),
    'estratto conto bancario': cat('never', 'estratto-conto', null, 'Estratto conto', 'Bank statement'),
    'proposta pre-accordo rental proposal': cat('never', 'proposta', null, 'Proposta / pre-accordo', 'Rental proposal'),
    'messaggio cliente richiesta': cat('never', 'messaggio', null, 'Messaggio di un cliente', 'Client message'),
    'documento generico': cat('never', 'generico', null, 'Documento', 'Document'),
  };
  function categoryOf(doc) { return DOC_CATEGORIES[norm(obj(doc).category)] || null; }

  var STAGES = ['proposta', 'firma_conduttore', 'firma_proprietario', 'firmato', 'registrazione', 'chiavi', 'inventario', 'inizio', 'rinnovo', 'cessazione', 'riconsegna', 'fine'];

  // Ricerca: parole (normalizzate) → tipi dell'archivio e categorie.
  var LEXICON = [
    { words: ['chiavi', 'keys', 'consegna', 'handover', 'verbale'], kinds: ['verbale', 'doc-verbale'] },
    { words: ['inventario', 'inventory', 'mobili', 'furniture'], kinds: ['inv-in', 'inv-out', 'doc-inventario'] },
    { words: ['ape', 'energia', 'energy', 'classe energetica'], kinds: ['dossier-ape', 'doc-ape'] },
    { words: ['catasto', 'visura', 'cadastral'], kinds: ['dossier-visura', 'doc-visura'] },
    { words: ['planimetria', 'floor plan'], kinds: ['dossier-planimetria'] },
    { words: ['contratto', 'lease', 'firmato', 'signed'], kinds: ['signed', 'draft', 'doc-contratto'] },
    { words: ['scheda', 'arpe', 'canone concordato'], kinds: ['scheda'] },
    { words: ['rendiconto', 'statement', 'estratto'], kinds: ['rendiconto'] },
    { words: ['valutazione', 'valuation', 'stima'], kinds: ['valutazione'] },
    { words: ['f24'], kinds: ['doc-f24-registro', 'doc-f24-imu'] },
    { words: ['imu'], kinds: ['doc-f24-imu'] },
    { words: ['rli', 'registrazione'], kinds: ['doc-rli', 'doc-f24-registro'] },
    { words: ['cedolare'], kinds: ['doc-cedolare'] },
    { words: ['istat'], kinds: ['doc-istat'] },
  ];

  var CODES = {
    reasons: ['sign_needed', 'scheda_needed', 'deadline_soon', 'deadline_overdue', 'rent_overdue', 'rent_reported', 'rent_processing', 'rent_processing_sepa', 'rent_unlinked', 'rent_amount_missing', 'rent_state_unknown', 'rent_month_missing', 'installments_missing', 'rented_without_contract', 'contract_expired_open', 'multiple_active_contracts', 'contract_date_conflict', 'read_partial', 'registration_unknown',
      'lease_unsigned', 'charges_after_termination', 'charge_overdue', 'charge_reported', 'charge_processing', 'charge_state_unknown', 'charge_amount_missing',
      'signature_unrecorded'],
    notes: ['per_mandato', 'per_delega', 'delega_attiva', 'firma_non_registrata', 'su_carta', 'inviata_aspi', 'data_di_conferma', 'esito_non_registrato'],
    stageStates: ['done', 'now', 'next', 'conflict', 'unknown'],
    dots: ['ok', 'tu', 'osservo', 'nonso'],
    vias: ['card', 'sepa', 'bank', 'none'],
    cadences: ['1', '2', '3', '6', '12', 'none'],
    invoiceStatus: ['open', 'paid', 'cancelled'],
    maint: ['plumbing', 'electrical', 'heating', 'appliance', 'other'],
    maintStatus: ['open', 'pending', 'in_progress', 'resolved', 'closed', 'unknown'],
    contractStatus: ['signed', 'signed_paper', 'awaiting_signatures', 'unrecorded', 'renewed', 'terminated', 'expired'],
    types: ['transitorio', 'studenti', '3+2', '4+4', 'none'],
    ribbon: ['paid', 'due', 'overdue', 'reported', 'processing', 'unknown', 'cancelled', 'empty', 'fuori'],
    folders: ['contratto', 'consegna', 'soldi', 'immobile'],
    states: ['firmato', 'bozza', 'ultima'],
    events: ['firma_completa', 'generato', 'fascicolo', 'consegna_chiavi', 'giro_inventario', 'riconsegna', 'valutazione', 'fascicolo_immobile', 'rendiconto_mensile', 'archiviato'],
    by: ['sistema', 'operatore', 'proprietario', 'non_noto'],
    ghosts: ['signed', 'ape', 'verbale'],
    kinds: ['draft', 'signed', 'scheda', 'verbale', 'inv-in', 'inv-out', 'valutazione', 'dossier-visura', 'dossier-planimetria', 'dossier-ape', 'dossier-delega', 'rendiconto', 'own-document', 'certificate', 'tsr'].concat(Object.keys(DOC_CATEGORIES).filter(function (k) { return DOC_CATEGORIES[k].owner === 'file'; }).map(function (k) { return 'doc-' + DOC_CATEGORIES[k].id; })),
  };

  // ── Le chiavi del proprietario (uid + alias scritti dall'admin) ────────
  function ownerKeys(ownerUid, aliases) {
    var out = [];
    [ownerUid].concat(list(aliases).map(function (a) { return a && typeof a === 'object' ? (a.key || a.id) : a; })).forEach(function (k) {
      var s = str(k); if (s && !badId(s) && out.indexOf(s) < 0) out.push(s);
    });
    return out;
  }

  // ── Percorsi ──────────────────────────────────────────────────────────
  // Un URL è una stringa che si dichiara tale: una data ISO non lo è.
  function asUrl(s) { return typeof s === 'string' && /^(https?:|data:)/i.test(s.trim()) ? s.trim() : ''; }
  function urlOf(v) {
    if (typeof v === 'string') return asUrl(v);
    var o = obj(v); return asUrl(o.url) || asUrl(o.docUrl);
  }
  function pathOf(v, buckets) { var p = parseStorageUrl(urlOf(v), buckets); return p ? p.path : ''; }

  // I campi di un contratto e di un immobile che portano un file in Storage:
  // tutti, anche quelli mai proiettati — servono alla regola dei doppioni.
  function contractPaths(c, buckets) {
    var out = [];
    function add(v) { var p = parseStorageUrl(urlOf(v), buckets); if (p) out.push(p.path); }
    ['generatedPDF', 'signedPdfUrl', 'schedaCanoneUrl', 'signingCertificateUrl', 'timestampTsrUrl', 'fascicoloFiscaleUrl',
      'registrationPackUrl', 'valutazioneBoomUrl', 'landlordPassUrl', 'contractPdfUrl', 'certificateUrl'].forEach(function (f) { add(c[f]); });
    add(c.verbaleConsegna); add(c.inventario); add(c.inventarioUscita); add(obj(c.tenantMandate).docUrl);
    objs(c.identityDocs).forEach(function (d) { add(d.url); if (has(d.path)) out.push(str(d.path)); });
    list(obj(c.inventario).shots).concat(list(obj(c.inventarioUscita).shots)).forEach(add);
    return out;
  }
  function propertyPaths(p, buckets) {
    var out = [];
    function add(v) { var x = parseStorageUrl(urlOf(v), buckets); if (x) out.push(x.path); }
    add(p.inventario); add(p.inventarioUscita); add(p.valutazioneBoomUrl); add(p.landlordPassUrl);
    Object.keys(obj(p.dossier)).forEach(function (k) { add(obj(p.dossier)[k]); });
    list(obj(p.inventario).shots).concat(list(obj(p.inventarioUscita).shots)).forEach(add);
    return out;
  }

  // ── Il perimetro: cosa è del proprietario (una copia per build e fileFor) ─
  function contractExcluded(c, keys) {
    var who = str(c.landlordId) || str(c.ownerId);
    return !!who && keys.indexOf(who) < 0;
  }
  function scopeFor(input) {
    var o = input || {};
    var buckets = uniq([str(o.uploadBucket)].concat(list(o.buckets).map(str)).filter(Boolean));
    if (!buckets.length) buckets = DEFAULT_BUCKETS.slice();
    var uploadBucket = str(o.uploadBucket) || buckets[0];
    var keys = ownerKeys(o.ownerUid, o.aliases);
    var properties = objs(o.properties).filter(function (p) { return keys.indexOf(str(p.ownerId)) >= 0 && !badId(str(p.id)); });
    var ownedPropertyIds = new Set(properties.map(function (p) { return str(p.id); }));
    var onProperty = objs(o.contracts).filter(function (c) { return ownedPropertyIds.has(str(c.propertyId)) && !badId(str(c.id)); });
    var ownedContractIds = new Set(), allContractIds = new Set(), paths = new Set();
    onProperty.forEach(function (c) {
      allContractIds.add(str(c.id));
      if (!contractExcluded(c, keys)) ownedContractIds.add(str(c.id));
      contractPaths(c, buckets).forEach(function (p) { paths.add(p); });
    });
    properties.forEach(function (p) { propertyPaths(p, buckets).forEach(function (x) { paths.add(x); }); });
    var byId = { properties: {}, contracts: {}, documents: {} };
    properties.forEach(function (p) { byId.properties[str(p.id)] = p; });
    onProperty.forEach(function (c) { byId.contracts[str(c.id)] = c; });
    objs(o.documents).forEach(function (d) { if (has(d.id)) byId.documents[str(d.id)] = d; });
    return { ownerKeys: keys, ownedPropertyIds: ownedPropertyIds, ownedContractIds: ownedContractIds, contractItemPaths: paths,
      buckets: buckets, uploadBucket: uploadBucket, allContractIds: allContractIds, byId: byId };
  }

  // ── Attribuzione: il percorso decide, la data protegge il rinnovo ──────
  function dateOfValue(v, day) {
    if (v == null || v === '') return '';
    if (typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Date]' && typeof v.toDate !== 'function' && typeof v.seconds !== 'number') {
      return day(v.at) || day(v.signedAt) || day(v.createdAt) || '';
    }
    return day(v) || '';
  }
  function attributable(contract, field, value, ctx) {
    var c = obj(contract), x = obj(ctx), day = x.day || function (s) { return ymdOf(s); };
    var cid = str(c.id), url = urlOf(value);
    var propertyLevel = false;
    if (url) {
      var parsed = parseStorageUrl(url, x.buckets);
      if (!parsed || !cid) return false;
      var path = parsed.path;
      if (/* mp:path-prefix */ path.indexOf('contracts/' + cid + '/') === 0) return true;
      if (path.indexOf('contracts/') === 0) return false;
      if (path.indexOf('property-docs/' + str(c.propertyId) + '/') !== 0) return false;
      propertyLevel = true;
    }
    /* mp:renewal-guard */ if (c.renewalOf) {
      var anchor = day(c.createdAt) || day(c.startDate);
      var d = dateOfValue(value, day);
      if (!anchor || !d) return false;
      return d >= anchor;
    }
    return propertyLevel || !url;
  }

  // ── documents: chi vede cosa ──────────────────────────────────────────
  function documentVisibility(doc, ctx) {
    var d = obj(doc), x = obj(ctx), keys = list(x.ownerKeys);
    var props = x.ownedPropertyIds || new Set(), owned = x.ownedContractIds || new Set();
    var all = x.allContractIds || new Set(), itemPaths = x.contractItemPaths || new Set();
    var mine = keys.indexOf(str(d.userId)) >= 0;
    function never(reason) { return { owner: 'never', kind: null, reason: reason }; }
    // 1. perimetro
    if (!props.has(str(d.propertyId)) && !mine) return never('not_owner_scope');
    if (has(d.contractId) && all.has(str(d.contractId)) && !owned.has(str(d.contractId))) return never('other_landlord');
    // 2. da smistare
    if (d.needsFiling === true) return never('unfiled');
    // 3. archivio interno del deal (firme PNG, riepilogo con i contatti)
    if (str(d.type) === 'deal-archive') return never('deal_archive_internal');
    // 4. il percorso è già un oggetto del contratto/immobile (copia d'attivazione)
    var path = has(d.storagePath) ? str(d.storagePath) : pathOf(d.fileUrl, x.buckets);
    if (path && itemPaths.has(path)) return never('duplicate_of_contract_item');
    // 5. il prefisso del percorso deve essere suo
    if (!path || path.charAt(0) === '/' || path.indexOf('..') >= 0 || path.indexOf('\\') >= 0) return never('path_out_of_scope');
    var seg = path.split('/');
    var okPrefix = (seg[0] === 'contracts' && owned.has(seg[1]) && seg.length > 2)
      || (seg[0] === 'property-docs' && props.has(seg[1]) && seg.length > 2)
      || (seg[0] === 'documents' && seg.length > 2 && (keys.indexOf(seg[1]) >= 0 || (str(d.source) === 'innesto' && /^documents\/[^/]+\/innesto\//.test(path))))
      || (seg[0] === 'smistatore' && seg.length > 1);
    if (!okPrefix) return never('path_out_of_scope');
    // 6. categoria vietata: vince anche su «è suo»
    var c = categoryOf(d);
    if (/* mp:visibility */ c && c.owner === 'never') return never('never_category');
    // 7. un documento suo
    if (mine) return { owner: 'file', kind: 'own-document', reason: 'own_document' };
    // 8. categoria dichiarata
    if (c && c.owner === 'file') return { owner: 'file', kind: 'doc-' + c.id, reason: 'declared_category' };
    return never('undeclared_category');
  }

  // ── Contratti: tipo, stato, tappe ─────────────────────────────────────
  function contractType(raw) {
    var k = key(raw);
    if (k === 'studenti' || k === 'student') return 'studenti';
    if (k === '3+2' || k === '32' || k === 'concordato') return '3+2';
    if (k === 'transitorio' || k === 'transitional') return 'transitorio';
    if (k === '4+4' || k === 'ordinaria' || k === 'libero') return '4+4';
    return null;
  }
  var PAST = ['renewed', 'terminated', 'expired'];
  function phaseOf(c) {
    var s = key(c.status);
    if (s === 'active') return 'current';
    if (PAST.indexOf(s) >= 0) return 'past';
    return 'hidden';
  }
  // Un contratto è «in attesa delle firme» SOLO con una prova POSITIVA che il
  // suo giro di firma è digitale: un invito a firmare partito, una proposta
  // convertita, il PDF generato dal server, una firma (o una data di firma)
  // già registrata, lo stato «parziale» — oppure un RINNOVO del portal
  // (renewalOf) ancora senza firme, perché renewContract le azzera apposta e
  // il rinnovo va rifirmato. Chiusura del 23/09: i token di firma NON sono
  // una prova — saveContract li conia sempre, anche per un contratto firmato
  // su carta e inserito a mano, e l'Innesto pure. Dirgli «in attesa delle
  // firme» affermava un fatto non registrato; ora, senza prova, lo stato è
  // neutro («firma non registrata a sistema») e il verdetto «non posso dirlo»
  // (signature_unrecorded), mai «Tutto in ordine» e mai «firmato».
  function signingEvidence(c) {
    return has(c.preAgreementId) || key(c.pdfGeneratedBy) === 'server' || has(c.signInviteTenantAt) || has(c.signInviteLandlordAt)
      || !!c.tenantSignature || !!c.landlordSignature || has(c.tenantSignedAt) || has(c.landlordSignedAt)
      || !!c.tenantSignedByDelegate || !!c.landlordSignedByDelegate || key(c.signatureStatus) === 'partial'
      || objs(c.coTenants).some(function (x) { return !!x.signature || has(x.signedAt); })
      || /* mp:renewal-unsigned */ has(c.renewalOf);
  }
  // «Segnato come affittato»: il portal e l'Innesto scrivono
  // availabilityStatus (il campo che l'operatore tocca); `status:'rented'` lo
  // scrive solo la firma digitale e nessuno lo rimette a posto. Vince il primo,
  // il secondo vale solo quando il primo manca.
  function markedRented(p) {
    var a = /* mp:availability */ key(p.availabilityStatus);
    if (a) return a === 'rented';
    return key(p.status) === 'rented';
  }
  // La fine VERA di un contratto: un cessato finisce alla cessazione, anche se
  // la data di fine scritta è più avanti (terminateContract la lascia com'è).
  function terminatedOn(c) {
    if (key(c.status) !== 'terminated') return '';
    var t = ymdOf(c.terminatedAt), e = ymdOf(c.endDate);
    return t && (!e || t < e) ? t : '';
  }
  function effectiveEnd(c) { return terminatedOn(c) || ymdOf(c.endDate); }
  // Cessato, ma senza una data di cessazione leggibile: non si sa da quando.
  function terminatedUndated(c) { return key(c.status) === 'terminated' && !ymdOf(c.terminatedAt); }
  // La firma su carta REGISTRATA dallo staff (portal, «✓ Firmato su carta»):
  // `paperSigned {at: giorno della firma, by: chi l'ha registrata,
  // recordedAt}`. È un fatto dichiarato da BOOM, non una firma digitale: vale
  // solo con giorno e autore leggibili, e su un RINNOVO solo se registrata
  // dopo la nascita del rinnovo — la carta del contratto vecchio non firma il
  // nuovo (renewContract non la copia; questa è la seconda cintura).
  // Restituisce il giorno della firma, o ''.
  function paperSignedOn(c, day) {
    var ps = obj(c.paperSigned), d = day || ymdOf;
    var at = ymdOf(ps.at);
    if (!at || !has(ps.by)) return '';
    if (/* mp:paper-renewal */ c.renewalOf) {
      var anchor = d(c.createdAt) || d(c.startDate), rec = d(ps.recordedAt);
      if (!anchor || !rec || rec < anchor) return '';
    }
    return /* mp:paper-signed */ at;
  }
  // La firma non è registrata: né completa, né firmata su carta a detta dello
  // staff, né un giro digitale provato.
  function isUnrecorded(c, day) {
    return key(c.signatureStatus) !== 'complete' && !paperSignedOn(c, day) && !signingEvidence(c);
  }
  function cardStatus(c, day) {
    var s = key(c.status);
    if (PAST.indexOf(s) >= 0) return s;
    if (key(c.signatureStatus) === 'complete') return 'signed';
    if (paperSignedOn(c, day)) return 'signed_paper';
    return isUnrecorded(c, day) ? 'unrecorded' : 'awaiting_signatures';
  }
  function delegateArmed(c, ctx) {
    var d = obj(c.landlordDelegate);
    return has(d.name) && attributable(c, 'landlordDelegate', d, ctx);
  }
  // Il mese `ym` cade dentro il contratto (per mese, come il nastro). Senza
  // data d'inizio leggibile non lo copre: mai supporre una locazione.
  function leaseCoversMonth(c, ym) {
    var s = ymdOf(c.startDate).slice(0, 7), e = ymdOf(c.endDate).slice(0, 7);
    return !!s && s <= ym && (!e || ym <= e);
  }
  function tenantSideSigned(c) {
    if (!c.tenantSignature && !has(c.tenantSignedAt)) return false;
    return objs(c.coTenants).filter(function (x) { return has(x.name); }).every(function (x) { return !!x.signature; });
  }

  function stagesFor(contract, ctx) {
    var c = obj(contract), x = obj(ctx), day = x.day || ymdOf, today = str(x.today);
    var refs = x.refs instanceof Set ? x.refs : new Set(list(x.refs));
    var cid = str(c.id), unrecorded = isUnrecorded(c, day), out = [];
    function ref(kind) { var r = 'c:' + cid + ':' + kind; return refs.has(r) ? [r] : []; }
    function push(k, state, date, note, rs, counts) {
      var s = { key: k, state: state, date: date || null, note: note || null, refs: rs || [] };
      if (counts) s.counts = counts;
      out.push(s);
    }
    var pa = obj(c.paAcceptance);
    if (day(pa.at)) push('proposta', 'done', day(pa.at));
    var complete = key(c.signatureStatus) === 'complete';
    // Firmato su carta: niente tappe delle firme digitali (non ce ne sono),
    // la tappa «Firmato» porta il giorno della carta e dice chi lo afferma.
    var paper = complete ? '' : paperSignedOn(c, day);
    if (!unrecorded && !paper) {
      // A firma completa le due firme ci sono per costruzione, anche se una
      // data manca: la tappa è fatta, la data resta vuota (mai inventata).
      var tDel = obj(c.tenantSignedByDelegate);
      var tAt = day(c.tenantSignedAt) || day(tDel.signedAt);
      if (tAt || c.tenantSignature || complete) push('firma_conduttore', 'done', tAt, c.tenantSignedByDelegate ? 'per_mandato' : null);
      else push('firma_conduttore', 'pending');
      var lDel = obj(c.landlordSignedByDelegate);
      var lAt = day(c.landlordSignedAt) || day(lDel.signedAt);
      if (lAt || c.landlordSignature || complete) push('firma_proprietario', 'done', lAt, c.landlordSignedByDelegate ? 'per_delega' : null);
      else push('firma_proprietario', 'pending', null, delegateArmed(c, x) ? 'delega_attiva' : null);
    }
    var full = day(c.fullySignedAt);
    if (key(c.signatureStatus) === 'complete') push('firmato', 'done', full || null, null, ref('signed').concat(ref('scheda')));
    else if (paper) { push('firmato', 'done', paper, 'su_carta'); full = paper; }
    else if (unrecorded && key(c.status) === 'active') push('firmato', 'unknown', null, 'firma_non_registrata');
    else if (!unrecorded) push('firmato', 'pending');
    // Registrazione (ERRATA E1.2): A vince, poi B confermata, poi inviata.
    if (!unrecorded) {
      var rliRefs = list(x.rliRefs);
      var A = ymdOf(c.rliRegisteredAt);
      var regAt = day(c.registeredAt), aspiAt = day(c.aspiRequestedAt);
      if (A) push('registrazione', 'done', A, null, rliRefs);
      else if (key(c.registrationStatus) === 'registered' && attributable(c, 'registeredAt', c.registeredAt, x)) push('registrazione', 'done', regAt || null, 'data_di_conferma', rliRefs);
      else if (key(c.registrationStatus) === 'sent' && attributable(c, 'aspiRequestedAt', c.aspiRequestedAt || c.registrationSheetSentAt, x)) push('registrazione', 'now', aspiAt || day(c.registrationSheetSentAt) || null, 'inviata_aspi', rliRefs);
      else if (aspiAt && attributable(c, 'aspiRequestedAt', c.aspiRequestedAt, x)) push('registrazione', 'now', aspiAt, 'inviata_aspi', rliRefs);
      else if (full && today && daysBetween(full, today) > 30) push('registrazione', 'unknown', null, 'esito_non_registrato', rliRefs);
      else push('registrazione', 'pending', null, null, rliRefs);
    }
    var vc = obj(c.verbaleConsegna);
    if (day(vc.at) && attributable(c, 'verbaleConsegna', vc, x)) push('chiavi', 'done', day(vc.at), null, ref('verbale'));
    var inv = obj(c.inventario);
    if (day(inv.at) && attributable(c, 'inventario', inv, x)) push('inventario', 'done', day(inv.at), null, ref('inv-in'));
    var start = ymdOf(c.startDate), end = ymdOf(c.endDate);
    if (start) push('inizio', today && today >= start ? 'done' : 'pending', start);
    if (key(c.status) === 'renewed' && has(c.renewedToId)) {
      var hist = objs(c.renewalHistory), last = hist.length ? hist[hist.length - 1] : {};
      push('rinnovo', 'done', day(last.date) || null);
    }
    // Cessato: la tappa ha la sua data (fatta o futura); senza data non si
    // inventa, si dice «non registrato». In entrambi i casi la «Fine» scritta
    // sul contratto non è più la fine vera: se la cessazione la precede, o se
    // la sua data manca, la tappa «Fine» non si disegna (l'aereo non ci va).
    var terminated = key(c.status) === 'terminated', term = ymdOf(c.terminatedAt);
    if (terminated) {
      if (term) push('cessazione', today && today >= term ? 'done' : 'pending', term);
      else push('cessazione', 'unknown');
    }
    var out2 = obj(c.inventarioUscita);
    if (day(out2.at) && attributable(c, 'inventarioUscita', out2, x)) {
      var diff = obj(out2.diff);
      push('riconsegna', 'done', day(out2.at), null, ref('inv-out'), {
        missing: list(diff.missing).length, damaged: list(diff.damaged).length, added: list(diff.added).length, unverifiable: list(diff.unverifiable).length,
      });
    }
    if (end && /* mp:terminated-end */ !(terminated && (!term || term < end))) push('fine', today && today > end ? 'done' : 'pending', end);
    // L'aereo: la prima tappa non compiuta è «adesso», le successive «dopo».
    var planeSet = false;
    out.forEach(function (s) {
      if (s.state === 'done' || s.state === 'conflict' || s.state === 'unknown') return;
      if (!planeSet) { s.state = 'now'; planeSet = true; } else s.state = 'next';
    });
    return out;
  }

  // ── Soldi ─────────────────────────────────────────────────────────────
  var WORST = ['overdue', 'unknown', 'reported', 'processing', 'due', 'paid', 'cancelled'];
  function viaOf(p) { var v = key(p.paidVia); return v === 'stripe' ? 'card' : v === 'sepa' ? 'sepa' : v === 'bank' ? 'bank' : null; }
  function isSepa(p) { return has(p.sddStatus) || has(p.sddPiId); }

  function assertDeps(deps) {
    var d = obj(deps);
    if (!d.rent || !d.fields || !d.dossier || typeof d.rent.overview !== 'function' || typeof d.dossier.day !== 'function') throw new Error('deps richiesti');
    return d;
  }

  function romeClock(now) {
    try {
      var date = now instanceof Date ? now : new Date(now);
      if (!Number.isFinite(date.getTime())) return '';
      var f = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).forEach(function (p) { f[p.type] = p.value; });
      return (f.hour || '00') + ':' + (f.minute || '00');
    } catch (_) { return ''; }
  }

  // ── Gli oggetti file di un contratto / di un immobile / di un documento ─
  // UNA funzione per build e fileFor: ciò che la pagina elenca è ciò che il
  // server serve (test di andata e ritorno).
  function fileName(kind, label, date, path) {
    var slug = norm(label).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'immobile';
    var k = String(kind).replace(/[^a-z0-9]+/gi, '-').replace(/(^|-)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/-/g, '');
    var ext = (/\.([a-z0-9]{2,5})$/i.exec(path || '') || [])[1];
    ext = ext ? ext.toLowerCase() : 'pdf';
    return 'BOOM_' + k + '_' + slug + (date ? '_' + date : '') + '.' + ext;
  }
  function contentTypeHint(path) {
    var ext = ((/\.([a-z0-9]{2,5})$/i.exec(path || '') || [])[1] || '').toLowerCase();
    return ext === 'pdf' ? 'application/pdf' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'application/octet-stream';
  }
  function propLabel(p) { return str(p && (p.name || p.address)) || 'Immobile'; }

  function contractItems(c, prop, scope, day) {
    var items = [], cid = str(c.id), actx = { buckets: scope.buckets, day: day };
    var complete = key(c.signatureStatus) === 'complete', unrecorded = isUnrecorded(c, day);
    // Firmato su carta: il PDF generato a sistema NON è quello firmato — non
    // si mostra come «bozza» di un contratto che bozza non è più.
    var paper = !complete && !!paperSignedOn(c, day);
    function add(kind, value, date, at, extra) {
      var parsed = parseStorageUrl(urlOf(value), scope.buckets);
      if (!parsed) return;
      if (!attributable(c, kind, value, actx)) return;
      items.push(Object.assign({ ref: 'c:' + cid + ':' + kind, kind: kind, propertyId: str(c.propertyId), contractId: cid,
        bucket: parsed.bucket, path: parsed.path, url: urlOf(value), date: date || null, at: at || null, label: propLabel(prop) }, extra || {}));
    }
    if (!complete && !unrecorded && !paper) add('draft', c.generatedPDF, day(c.pdfGeneratedAt), isoAt(c.pdfGeneratedAt), { byServer: key(c.pdfGeneratedBy) === 'server' });
    add('signed', c.signedPdfUrl, day(c.fullySignedAt) || day(c.finalizedAt), isoAt(c.fullySignedAt));
    add('scheda', c.schedaCanoneUrl, day(c.schedaCanoneAt), isoAt(c.schedaCanoneAt));
    var vc = obj(c.verbaleConsegna); add('verbale', vc, day(vc.at), isoAt(vc.at), { by: vc.by });
    var inv = obj(c.inventario); add('inv-in', inv, day(inv.at), isoAt(inv.at), { by: inv.by });
    var iu = obj(c.inventarioUscita); add('inv-out', iu, day(iu.at), isoAt(iu.at), { by: iu.by });
    add('valutazione', c.valutazioneBoomUrl, day(c.valutazioneBoomAt), isoAt(c.valutazioneBoomAt));
    return items;
  }
  function propertyItems(p, scope, day, takenPaths) {
    var items = [], pid = str(p.id);
    function allowed(path) {
      var seg = path.split('/');
      return (seg[0] === 'property-docs' && seg[1] === pid) || (seg[0] === 'contracts' && scope.ownedContractIds.has(seg[1]));
    }
    function add(kind, value, date, at, extra) {
      var parsed = parseStorageUrl(urlOf(value), scope.buckets);
      if (!parsed || !allowed(parsed.path)) return;
      if (takenPaths && takenPaths.has(parsed.path)) return;
      items.push(Object.assign({ ref: 'p:' + pid + ':' + kind, kind: kind, propertyId: pid, contractId: null,
        bucket: parsed.bucket, path: parsed.path, url: urlOf(value), date: date || null, at: at || null, label: propLabel(p) }, extra || {}));
    }
    var inv = obj(p.inventario); add('inv-in', inv, day(inv.at), isoAt(inv.at), { by: inv.by });
    var iu = obj(p.inventarioUscita); add('inv-out', iu, day(iu.at), isoAt(iu.at), { by: iu.by });
    add('valutazione', p.valutazioneBoomUrl, day(p.valutazioneBoomAt), isoAt(p.valutazioneBoomAt));
    ['visura', 'planimetria', 'ape', 'delega'].forEach(function (slot) {
      var s = obj(obj(p.dossier)[slot]);
      var parsed = parseStorageUrl(urlOf(s), scope.buckets);
      if (!parsed || parsed.path.indexOf('property-docs/' + pid + '/') !== 0) return;
      if (takenPaths && takenPaths.has(parsed.path)) return;
      items.push({ ref: 'p:' + pid + ':dossier-' + slot, kind: 'dossier-' + slot, propertyId: pid, contractId: null,
        bucket: parsed.bucket, path: parsed.path, url: urlOf(s), date: day(s.at) || null, at: isoAt(s.at), label: propLabel(p), by: s.by });
    });
    return items;
  }
  function documentItem(d, scope, day, props) {
    var v = documentVisibility(d, scope);
    if (v.owner !== 'file' || badId(str(d.id))) return null;
    var path = has(d.storagePath) ? str(d.storagePath) : pathOf(d.fileUrl, scope.buckets);
    var parsedUrl = parseStorageUrl(urlOf(d.fileUrl), scope.buckets);
    var bucket = parsedUrl && parsedUrl.path === path ? parsedUrl.bucket : scope.uploadBucket;
    var c = categoryOf(d), pid = str(d.propertyId);
    return { ref: 'd:' + str(d.id), kind: v.kind, propertyId: scope.ownedPropertyIds.has(pid) ? pid : null,
      contractId: scope.ownedContractIds.has(str(d.contractId)) ? str(d.contractId) : null,
      bucket: bucket, path: path, url: urlOf(d.fileUrl), date: day(d.docDate) || day(d.createdAt) || null, at: isoAt(d.createdAt),
      label: propLabel(props[pid]), category: c, doc: d };
  }

  function fileFor(ref, scope, deps) {
    var d = assertDeps(deps), day = d.dossier.day, s = obj(scope);
    var r = parseRef(ref);
    if (!r) return { ok: false, error: 'bad_ref' };
    var byId = obj(s.byId), keys = list(s.ownerKeys);
    var props = obj(byId.properties), contracts = obj(byId.contracts), docs = obj(byId.documents);
    var owned = s.ownedPropertyIds || new Set(), ownedC = s.ownedContractIds || new Set();
    var item = null;
    function target(it, kindName) {
      var parsed = parseStorageUrl(it.url, s.buckets);
      var fallbackUrl = parsed && parsed.bucket === it.bucket && parsed.path === it.path ? it.url : null;
      return { ok: true, kind: kindName || it.kind, bucket: it.bucket, path: it.path, name: fileName(kindName || it.kind, it.label, it.date, it.path), contentTypeHint: contentTypeHint(it.path), fallbackUrl: fallbackUrl };
    }
    if (r.scope === 'c') {
      var c = contracts[r.id];
      if (!c) return { ok: false, error: 'not_found' };
      if (!owned.has(str(c.propertyId))) return { ok: false, error: 'not_your_property' };
      if (!ownedC.has(r.id)) return { ok: false, error: 'not_visible' };
      item = contractItems(c, props[str(c.propertyId)], s, day).filter(function (it) { return it.kind === r.kind; })[0];
      if (!item) return { ok: false, error: rawContractField(c, r.kind) ? 'not_visible' : 'not_found' };
      return target(item);
    }
    if (r.scope === 'p') {
      var p = props[r.id];
      if (!p) return { ok: false, error: owned.has(r.id) ? 'not_found' : 'not_your_property' };
      item = propertyItems(p, s, day, null).filter(function (it) { return it.kind === r.kind; })[0];
      if (!item) return { ok: false, error: rawPropertyField(p, r.kind) ? 'not_visible' : 'not_found' };
      return target(item);
    }
    if (r.scope === 'd') {
      var doc = docs[r.id];
      if (!doc) return { ok: false, error: 'not_found' };
      if (!owned.has(str(doc.propertyId)) && keys.indexOf(str(doc.userId)) < 0) return { ok: false, error: 'not_your_property' };
      item = documentItem(doc, s, day, props);
      if (!item) return { ok: false, error: 'not_visible' };
      return target(item, item.kind);
    }
    // r: il rendiconto ha un percorso deterministico, il bucket è quello di upload
    if (keys.indexOf(r.id) < 0) return { ok: false, error: 'not_your_property' };
    var path = 'rendiconti/' + r.id + '/rendiconto_' + r.kind + '.pdf';
    return { ok: true, kind: 'rendiconto', bucket: s.uploadBucket || DEFAULT_BUCKETS[0], path: path,
      name: 'BOOM_Rendiconto_' + r.kind + '.pdf', contentTypeHint: 'application/pdf', fallbackUrl: null };
  }
  function rawContractField(c, kind) {
    return !!({ draft: urlOf(c.generatedPDF), signed: urlOf(c.signedPdfUrl), scheda: urlOf(c.schedaCanoneUrl), verbale: urlOf(c.verbaleConsegna),
      'inv-in': urlOf(c.inventario), 'inv-out': urlOf(c.inventarioUscita), valutazione: urlOf(c.valutazioneBoomUrl) })[kind];
  }
  function rawPropertyField(p, kind) {
    if (kind.indexOf('dossier-') === 0) return !!urlOf(obj(p.dossier)[kind.slice(8)]);
    return !!({ 'inv-in': urlOf(p.inventario), 'inv-out': urlOf(p.inventarioUscita), valutazione: urlOf(p.valutazioneBoomUrl) })[kind];
  }

  // ── La proiezione ─────────────────────────────────────────────────────
  var EVENT_OF = { draft: 'generato', signed: 'firma_completa', scheda: 'fascicolo', verbale: 'consegna_chiavi', 'inv-in': 'giro_inventario',
    'inv-out': 'riconsegna', valutazione: 'valutazione', rendiconto: 'rendiconto_mensile' };
  var FOLDER_OF = { draft: 'contratto', signed: 'contratto', scheda: 'contratto', verbale: 'consegna', 'inv-in': 'consegna', 'inv-out': 'consegna',
    valutazione: 'immobile', rendiconto: 'soldi' };
  function titleOf(kind, extra) {
    if (extra && extra.category && kind !== 'own-document') return { it: extra.category.label.it, en: extra.category.label.en };
    return { it: t('kind.' + kind, 'it', extra && extra.params), en: t('kind.' + kind, 'en', extra && extra.params) };
  }
  function byOf(it, keys) {
    if (it.kind === 'signed' || it.kind === 'scheda' || it.kind === 'rendiconto') return 'sistema';
    if (it.kind === 'draft') return it.byServer ? 'sistema' : 'operatore';
    if (it.doc) {
      var d = it.doc, who = str(d.uploadedBy) || str(d.createdBy);
      if (keys.indexOf(str(d.userId)) >= 0 && (!who || keys.indexOf(who) >= 0)) return 'proprietario';
      if (who && keys.indexOf(who) >= 0) return 'proprietario';
      if (['verbale', 'inventario', 'smistatore', 'finalize'].indexOf(key(d.source)) >= 0) return 'sistema';
      return who ? 'operatore' : 'non_noto';
    }
    var b = str(it.by);
    if (!b) return 'non_noto';
    return keys.indexOf(b) >= 0 ? 'proprietario' : 'operatore';
  }
  function archiveItem(it, keys, lang) {
    var kind = it.kind, cat = it.category || null;
    var folder = cat && cat.folder ? cat.folder : FOLDER_OF[kind] || (kind.indexOf('dossier-') === 0 ? 'immobile' : 'immobile');
    var title;
    if (kind === 'own-document') {
      var nm = scrubText(obj(it.doc).name, 80);
      title = cat && cat.owner === 'file' ? { it: cat.label.it, en: cat.label.en } : nm ? { it: nm, en: nm } : titleOf(kind);
    } else title = titleOf(kind, { category: cat });
    var state = kind === 'signed' ? 'firmato' : kind === 'draft' ? 'bozza' : ['valutazione', 'scheda', 'inv-in', 'inv-out'].indexOf(kind) >= 0 ? 'ultima' : null;
    var event = EVENT_OF[kind] || (kind.indexOf('dossier-') === 0 ? 'fascicolo_immobile' : 'archiviato');
    return { ref: it.ref, kind: kind, propertyId: it.propertyId || null, contractId: it.contractId || null, folder: folder,
      date: it.date || null, at: it.at || null, year: it.date ? it.date.slice(0, 4) : null, title: title, state: state,
      provenance: { event: event, by: byOf(it, keys) }, file: true, note: null };
  }

  function build(input, deps) {
    var d = assertDeps(deps), rent = d.rent, fields = d.fields, dossier = d.dossier, day = dossier.day;
    var inp = obj(input), now = inp.now == null ? null : inp.now;
    if (now == null) throw new Error('now richiesto');
    var today = day(now);
    if (!today) throw new Error('now non valido');
    var month = today.slice(0, 7), year = today.slice(0, 4);
    var viewer = obj(inp.viewer), viewAs = key(viewer.role) === 'admin';
    var ownerUid = str(inp.ownerUid);
    var scope = scopeFor({ ownerUid: ownerUid, aliases: inp.aliases, properties: inp.properties, contracts: inp.contracts,
      documents: inp.documents, buckets: inp.buckets, uploadBucket: inp.uploadBucket });
    var keys = scope.ownerKeys;
    var properties = objs(inp.properties).filter(function (p) { return scope.ownedPropertyIds.has(str(p.id)); })
      .sort(function (a, b) { return propLabel(a).localeCompare(propLabel(b), 'it') || str(a.id).localeCompare(str(b.id)); });
    var propsById = {}; properties.forEach(function (p) { propsById[str(p.id)] = p; });
    var hidden = {}; function hide(kind, reason, n) { var k = kind + '|' + reason; hidden[k] = (hidden[k] || 0) + (n || 1); }
    var issuesAdmin = [];

    // Contratti: esclusi quelli di un altro proprietario (ERRATA E3.3) e quelli nascosti.
    var allOnProps = objs(inp.contracts).filter(function (c) { return scope.ownedPropertyIds.has(str(c.propertyId)) && !badId(str(c.id)); });
    var contracts = [];
    allOnProps.forEach(function (c) {
      if (!scope.ownedContractIds.has(str(c.id))) { hide('contract', 'other_landlord'); return; }
      var ph = phaseOf(c);
      if (ph === 'hidden') { hide('contract', 'status_' + (key(c.status) || 'none').replace(/[^a-z_]/g, '')); return; }
      contracts.push(c);
    });
    var excludedIds = new Set(allOnProps.map(function (c) { return str(c.id); }).filter(function (id) { return !contracts.some(function (c) { return str(c.id) === id; }); }));
    contracts.forEach(function (c) {
      if (urlOf(c.fascicoloFiscaleUrl)) hide('fascicolo', 'operator_file');
      if (urlOf(c.registrationPackUrl)) hide('pack', 'tenant_ids');
      if (objs(c.identityDocs).length) hide('identity', 'tenant_ids', objs(c.identityDocs).length);
      if (urlOf(obj(c.tenantMandate).docUrl)) hide('mandate', 'tenant_act');
      if (urlOf(c.landlordPassUrl)) hide('landlord-pass', 'out_of_v1');
      if (list(obj(c.inventario).shots).length) hide('inventario-frames', 'occupied_home', list(obj(c.inventario).shots).length);
    });
    var payments = objs(inp.payments).filter(function (p) {
      if (excludedIds.has(str(p.contractId))) return false;
      var pid = str(p.propertyId);
      return !pid || scope.ownedPropertyIds.has(pid);
    });

    // BOOM_RENT con stub: mai i record users veri (regola dura 2).
    var nameByTenant = {};
    contracts.forEach(function (c) { var id = str(c.tenantId); if (id && !nameByTenant[id]) nameByTenant[id] = scrubText(c.tenantName, 60) || '—'; });
    var cById = {}; contracts.forEach(function (c) { cById[str(c.id)] = c; });
    payments.forEach(function (p) { var id = str(p.tenantId); if (id && !nameByTenant[id]) { var c = cById[str(p.contractId)]; nameByTenant[id] = (c && scrubText(c.tenantName, 60)) || '—'; } });
    var ownerStub = { id: ownerUid, name: scrubText(obj(inp.owner).name, 60) || '—' };
    var tenantStubs = Object.keys(nameByTenant).filter(function (id) { return id !== ownerUid; }).map(function (id) { return { id: id, name: nameByTenant[id] }; });
    var rentView = rent.overview({ payments: payments, properties: properties, contracts: contracts,
      /* mp:tenant-stub */ users: [ownerStub].concat(tenantStubs), now: now, month: '' });
    var unitByProp = {};
    rentView.units.forEach(function (u) { if (u.propertyId) unitByProp[u.propertyId] = u; });

    // Documenti visibili
    var docItems = [];
    objs(inp.documents).forEach(function (doc) {
      var v = documentVisibility(doc, scope);
      if (v.owner !== 'file') { if (scope.ownedPropertyIds.has(str(doc.propertyId)) || keys.indexOf(str(doc.userId)) >= 0) hide('document', v.reason); return; }
      var it = documentItem(doc, scope, day, propsById);
      if (it) docItems.push(it);
    });

    var fileItems = [], takenPaths = new Set();
    contracts.forEach(function (c) {
      contractItems(c, propsById[str(c.propertyId)], scope, day).forEach(function (it) {
        if (it.kind === 'valutazione' && takenPaths.has(it.path)) return;
        takenPaths.add(it.path); fileItems.push(it);
      });
    });
    properties.forEach(function (p) { propertyItems(p, scope, day, takenPaths).forEach(function (it) { takenPaths.add(it.path); fileItems.push(it); }); });
    var refSet = new Set(fileItems.map(function (it) { return it.ref; }));

    // Scadenze del proprietario (solo quelle che BOOM ha scritto)
    var deadlines = objs(inp.deadlines).filter(function (dl) {
      if (key(dl.owner) !== 'landlord' || key(dl.status) !== 'pending' || !ymdOf(dl.date) || badId(str(dl.id))) return false;
      if (!scope.ownedPropertyIds.has(str(dl.linkedPropertyId)) && !scope.ownedContractIds.has(str(dl.linkedContractId))) return false;
      if (has(dl.linkedContractId) && excludedIds.has(str(dl.linkedContractId))) return false;
      return true;
    });

    var reasons = [], todo = [];
    function reason(code, extra) { var r = { code: code }; Object.keys(extra || {}).forEach(function (k) { if (extra[k] != null) r[k] = extra[k]; }); reasons.push(r); }

    // Ogni immobile
    var projProps = properties.map(function (p) {
      var pid = str(p.id), unit = unitByProp[pid] || { payments: [] };
      var pc = contracts.filter(function (c) { return str(c.propertyId) === pid; });
      var current = pc.filter(function (c) { return phaseOf(c) === 'current'; });
      var past = pc.filter(function (c) { return phaseOf(c) === 'past'; })
        .sort(function (a, b) { return str(b.startDate).localeCompare(str(a.startDate)) || str(a.id).localeCompare(str(b.id)); }).slice(0, 10);
      var rliByContract = {};
      docItems.forEach(function (it) { if (it.kind === 'doc-rli' && it.contractId) (rliByContract[it.contractId] = rliByContract[it.contractId] || []).push(it.ref); });
      var sctx = { today: today, day: day, buckets: scope.buckets, refs: refSet };
      function card(c) {
        var cid = str(c.id), tDel = obj(c.tenantSignedByDelegate), lDel = obj(c.landlordSignedByDelegate);
        var cedRaw = (c.cedolareSecca !== undefined && c.cedolareSecca !== null && c.cedolareSecca !== '') || (obj(c.canone).cedolareSecca !== undefined && obj(c.canone).cedolareSecca !== null && obj(c.canone).cedolareSecca !== '');
        var tsrOk = !!parseStorageUrl(urlOf(c.timestampTsrUrl), scope.buckets) && attributable(c, 'timestampTsrUrl', c.timestampTsrUrl, sctx);
        var certOk = !!parseStorageUrl(urlOf(c.signingCertificateUrl), scope.buckets) && attributable(c, 'signingCertificateUrl', c.signingCertificateUrl, sctx);
        var inst = Number(c.installmentMonths);
        var tName = looksLikeContact(c.tenantName) ? null : scrubText(c.tenantName, 60);
        var start = ymdOf(c.startDate) || null, end = ymdOf(c.endDate) || null;
        // I giorni che mancano si contano sulla fine VERA (un cessato finisce
        // alla cessazione; cessato senza data → non si sa, null).
        var effEnd = key(c.status) === 'terminated' ? (ymdOf(c.terminatedAt) || null) : end;
        if (effEnd && end && effEnd > end) effEnd = end;
        return {
          id: cid, status: cardStatus(c, day), type: contractType(c.type), unit: scrubText(c.unit, 20),
          tenantName: tName,
          coTenantNames: objs(c.coTenants).map(function (x) { return looksLikeContact(x.name) ? null : scrubText(x.name, 60); }).filter(Boolean),
          startDate: start, endDate: end, daysToEnd: /* mp:terminated-days */ effEnd ? daysBetween(today, effEnd) : null,
          rent: rent.amount(c.rent) != null ? rent.amount(c.rent) : rent.amount(obj(c.canone).monthly),
          installmentMonths: [1, 2, 3, 6, 12].indexOf(inst) >= 0 ? inst : null,
          deposit: rent.amount(c.deposit),
          cedolare: cedRaw ? !!fields.cedolareOn(c) : null,
          renewalOf: has(c.renewalOf) && !badId(str(c.renewalOf)) ? str(c.renewalOf) : null,
          renewedToId: has(c.renewedToId) && !badId(str(c.renewedToId)) ? str(c.renewedToId) : null,
          signing: {
            status: key(c.signatureStatus) || 'none',
            tenantAt: day(c.tenantSignedAt) || day(tDel.signedAt) || null,
            landlordAt: day(c.landlordSignedAt) || day(lDel.signedAt) || null,
            fullyAt: day(c.fullySignedAt) || null,
            // Firmato su carta: il giorno che lo staff ha registrato (mai una
            // firma digitale: le firme sopra restano vuote).
            paperAt: key(c.signatureStatus) === 'complete' ? null : (paperSignedOn(c, day) || null),
            tenantByMandate: !!c.tenantSignedByDelegate,
            landlordByDelegate: !!c.landlordSignedByDelegate,
            delegateArmed: delegateArmed(c, sctx) && !c.landlordSignature && !has(c.landlordSignedAt),
          },
          sealed: { tsr: tsrOk, at: tsrOk ? (day(c.finalizedAt) || day(c.fullySignedAt) || null) : null },
          certificate: certOk ? 'present' : 'none',
          stages: stagesFor(c, Object.assign({ rliRefs: rliByContract[cid] || [] }, sctx)),
        };
      }
      var currentCards = current.map(card), pastCards = past.map(card);

      // Rate: righe proiettate campo per campo (mai tenantName, payment, …).
      var rows = [], others = [];
      var lo = addMonths(month, -35), hi = addMonths(month, 3);
      var pcById = {}; pc.forEach(function (c) { pcById[str(c.id)] = c; });
      // Più contratti in corso sulla stessa casa (le stanze): ogni rata dice
      // di chi è — l'interno e il nome COME STAMPATO sul contratto. Con un
      // contratto solo non serve, e non si ripete.
      var multi = current.length > 1;
      // Le rate che restano aperte DOPO la cessazione di un contratto: BOOM
      // non le ha annullate, ma nessuno ci dice che siano dovute (il preavviso
      // può coprirle, oppure no). Non sono un «ritardo» (osservo): sono da
      // verificare (nonso, charges_after_termination), e la riga lo dice.
      // Cessato SENZA data (chiusura del 23/09): non si sa da quando, quindi
      // nessuna rata ancora aperta di quel contratto si può dire «in ritardo»
      // né «in scadenza» — tutte da verificare, e la riga dice perché.
      var afterEndIds = {}, UNDATED = 'undated';
      (unit.payments || []).forEach(function (r) {
        var c = pcById[str((r.payment || {}).contractId)], term = c ? terminatedOn(c) : '';
        var open = /* mp:after-termination */ ['overdue', 'due', 'unknown'].indexOf(r.state) >= 0;
        if (c && /* mp:terminated-undated */ terminatedUndated(c)) { if (open) afterEndIds[str(r.id)] = UNDATED; return; }
        if (!term) return;
        var due = r.dueDate || (r.month ? r.month + '-01' : '');
        if (due && due > term && open) afterEndIds[str(r.id)] = term;
      });
      function stateOf(r) { return afterEndIds[str(r.id)] ? 'unknown' : r.state; }
      (unit.payments || []).forEach(function (r) {
        var p = r.payment || {};
        var st = /* mp:overdue-state */ r.state;
        var inWindow = r.month && r.month >= lo && r.month <= hi;
        if (!inWindow && st !== 'overdue' && st !== 'unknown' && r.month) return;
        var afterMark = afterEndIds[str(r.id)] || null;
        var afterEnd = afterMark && afterMark !== UNDATED ? afterMark : null;
        if (afterMark) st = 'unknown';
        var rc = pcById[str(p.contractId)] || null;
        var rr = { id: str(r.id), month: r.month || null, dueDate: r.dueDate || null, amount: r.amount, state: st, isRent: !!r.isRent,
          type: str(p.type) || null, paidDate: day(p.paidDate) || day(p.paidAt) || null, via: viaOf(p),
          coversTo: isYm(str(p.coversTo)) ? str(p.coversTo) : null, reportedDate: day(p.tenantReportedAt) || null,
          overdueDays: st === 'overdue' && r.dueDate ? daysBetween(r.dueDate, today) : null,
          reminders: Number(p.remindersSent) > 0 ? { count: Number(p.remindersSent), last: day(p.lastReminderDate) || day(p.lastReminderAt) || null } : null,
          sepa: isSepa(p), afterEnd: afterEnd, afterTermination: !!afterMark,
          contractId: rc ? str(rc.id) : null,
          unit: /* mp:rooms-label */ multi && rc ? scrubText(rc.unit, 20) : null,
          tenantName: multi && rc && !looksLikeContact(rc.tenantName) ? scrubText(rc.tenantName, 60) : null,
          property: !!r.property };
        (r.isRent ? rows : others).push(rr);
      });
      function sortRows(a, b) { return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.id.localeCompare(b.id); }
      rows.sort(sortRows); others.sort(sortRows);

      // Il nastro: 12 mesi, il peggiore vince; vuoto dentro il contratto ≠ fuori.
      // Un cessato occupa il nastro fino alla cessazione, non alla fine scritta.
      var leases = pc.map(function (c) { return [str(c.startDate).slice(0, 7), /* mp:terminated-ribbon */ effectiveEnd(c).slice(0, 7)]; }).filter(function (x) { return isYm(x[0]); });
      var ribbonMonths = [];
      for (var i = -9; i <= 2; i++) {
        var ym = addMonths(month, i);
        var mrows = rent.rowsForMonth(unit, ym).filter(function (r) { return r.isRent; });
        var state;
        if (mrows.length) {
          state = WORST.filter(function (s) { return mrows.some(function (r) { return stateOf(r) === s; }); })[0] || 'unknown';
        } else state = leases.some(function (l) { return ym >= l[0] && (!isYm(l[1]) || ym <= l[1]); }) ? 'empty' : 'fuori';
        ribbonMonths.push({ ym: ym, state: state, count: mrows.length, rowIds: mrows.map(function (r) { return str(r.id); }) });
      }

      // L'anno: solo ciò che è registrato pagato; gli importi mancanti si contano.
      var yr = { year: year, paid: 0, paidCount: 0, unknownAmountCount: 0, rowIds: [] };
      (unit.payments || []).filter(function (r) { return r.isRent && r.state === 'paid'; }).forEach(function (r) {
        var pd = day(r.payment.paidDate) || day(r.payment.paidAt);
        if (!pd || pd.slice(0, 4) !== year) return;
        yr.paidCount++; yr.rowIds.push(str(r.id));
        if (r.amount == null) yr.unknownAmountCount++;
        else yr.paid = Math.round((yr.paid + r.amount) * 100) / 100;
      });

      // Motivi del verdetto per questo immobile
      rows.forEach(function (r) {
        if (!r.property) reason('rent_unlinked', { propertyId: pid, paymentId: r.id });
        if (r.amount == null) reason('rent_amount_missing', { propertyId: pid, paymentId: r.id });
        if (r.afterTermination) { reason('charges_after_termination', { propertyId: pid, contractId: r.contractId, date: r.afterEnd }); return; }
        if (r.state === 'unknown') reason('rent_state_unknown', { propertyId: pid, paymentId: r.id });
        if (!r.month) reason('rent_month_missing', { propertyId: pid, paymentId: r.id });
        if (r.state === 'overdue') reason('rent_overdue', { propertyId: pid, paymentId: r.id, days: r.overdueDays, month: r.month, reminderLast: r.reminders ? r.reminders.last : null, unit: r.unit, tenantName: r.tenantName });
        if (r.state === 'reported') reason('rent_reported', { propertyId: pid, paymentId: r.id, date: r.reportedDate });
        if (r.state === 'processing') reason(r.sepa ? 'rent_processing_sepa' : 'rent_processing', { propertyId: pid, paymentId: r.id });
      });
      // Gli altri addebiti (saldo deposito, …): un addebito in ritardo non è
      // «tutto in ordine» solo perché non è una rata di canone. Prima il saldo
      // deposito scaduto da 233 giorni lasciava il verdetto a «ok» mentre la
      // stessa pagina lo mostrava in ritardo.
      /* mp:others-reasons */ others.forEach(function (r) {
        var what = r.type === 'deposit-balance' ? 'deposit-balance' : 'other';
        if (r.afterTermination) { reason('charges_after_termination', { propertyId: pid, contractId: r.contractId, date: r.afterEnd }); return; }
        if (r.state === 'overdue') reason('charge_overdue', { propertyId: pid, paymentId: r.id, what: what, days: r.overdueDays });
        else if (r.state === 'reported') reason('charge_reported', { propertyId: pid, paymentId: r.id, what: what, date: r.reportedDate });
        else if (r.state === 'processing') reason('charge_processing', { propertyId: pid, paymentId: r.id, what: what });
        else if (r.state === 'unknown') reason('charge_state_unknown', { propertyId: pid, paymentId: r.id, what: what });
        if (r.amount == null && r.state !== 'cancelled') reason('charge_amount_missing', { propertyId: pid, paymentId: r.id, what: what });
      });
      if (markedRented(p) && !current.length) reason('rented_without_contract', { propertyId: pid });
      current.forEach(function (c) {
        var end = ymdOf(c.endDate), start = ymdOf(c.startDate), cs = cardStatus(c, day);
        if (end && end < today) reason('contract_expired_open', { propertyId: pid, contractId: str(c.id), date: end });
        if ((cs === 'signed' || cs === 'signed_paper' || cs === 'unrecorded') && /* mp:installments-window */ start && start <= today && (!end || today <= end)) {
          var covered = rent.rowsForMonth(unit, month).some(function (r) { return r.isRent && (!has(r.payment.contractId) || str(r.payment.contractId) === str(c.id)); });
          if (!covered) reason('installments_missing', { propertyId: pid, contractId: str(c.id), month: month });
        }
      });
      for (var a = 0; a < current.length; a++) for (var b = a + 1; b < current.length; b++) {
        var ca = current[a], cb = current[b], ua = norm(ca.unit), ub = norm(cb.unit);
        if (ua && ub && ua !== ub) continue;
        var s1 = ymdOf(ca.startDate) || '0000-01-01', e1 = ymdOf(ca.endDate) || '9999-12-31', s2 = ymdOf(cb.startDate) || '0000-01-01', e2 = ymdOf(cb.endDate) || '9999-12-31';
        if (s1 <= e2 && s2 <= e1) reason('multiple_active_contracts', { propertyId: pid, contractId: str(ca.id) });
      }
      currentCards.concat(pastCards).forEach(function (cc) {
        cc.stages.forEach(function (s) { if (s.key === 'registrazione' && s.state === 'unknown' && s.note === 'esito_non_registrato') reason('registration_unknown', { propertyId: pid, contractId: cc.id }); });
      });
      // Il fascicolo dell'immobile: solo i conflitti di date dei CONTRATTI (ERRATA E4.10).
      try {
        var dos = dossier.build({ propertyId: pid, properties: properties, contracts: contracts, users: [ownerStub].concat(tenantStubs),
          payments: payments, documents: [], maintenance: [], tasks: [], now: now });
        var seenC = {};
        dos.issues.forEach(function (is) {
          if (is.kind !== 'contract' || ['contract_date_conflict', 'relationship_conflict', 'invalid_date'].indexOf(is.code) < 0) return;
          if (seenC[is.id]) return; seenC[is.id] = true;
          reason('contract_date_conflict', { propertyId: pid, contractId: str(is.id) || null });
        });
        dos.issues.forEach(function (is) { issuesAdmin.push({ propertyId: pid, code: is.code }); });
      } catch (_) { reason('read_partial', { propertyId: pid }); }

      // Interventi
      var maint = objs(inp.maintenance).filter(function (m) { return str(m.propertyId) === pid && !badId(str(m.id)); }).map(function (m) {
        var catCode = key(m.category), status = key(m.status);
        var photo = has(m.photoUrl);
        return { id: str(m.id), category: CODES.maint.indexOf(catCode) >= 0 ? catCode : 'other', title: scrubText(m.title, 60),
          status: CODES.maintStatus.indexOf(status) >= 0 ? status : 'unknown', openedAt: day(m.createdAt) || null,
          resolvedAt: day(m.resolvedAt) || null, cost: rent.amount(m.cost), hasPhoto: photo, urgent: key(m.priority) === 'urgent' };
      }).sort(function (x, y) { return (y.openedAt || '').localeCompare(x.openedAt || '') || x.id.localeCompare(y.id); }).slice(0, 20);
      objs(inp.maintenance).forEach(function (m) { if (str(m.propertyId) === pid && has(m.photoUrl)) hide('maintenance-photo', 'fact_only'); });

      // Valutazione
      var valItem = fileItems.filter(function (it) { return it.kind === 'valutazione' && it.propertyId === pid; })
        .sort(function (x, y) { return (y.date || '').localeCompare(x.date || ''); })[0] || null;
      var valuation = (day(p.valutazioneBoomAt) || valItem) ? { at: day(p.valutazioneBoomAt) || (valItem && valItem.date) || null,
        canone: rent.amount(p.valutazioneBoomCanone), ref: valItem ? valItem.ref : null } : null;

      // Catasto
      var parsed = fields.parseCadastral(str(p.cadastralData));
      var cadastral = { foglio: str(p.foglio) || parsed.foglio || '', particella: str(p.particella) || parsed.particella || '',
        sub: str(p.sub) || parsed.sub || '', categoria: str(p.categoria) || parsed.categoria || '' };
      if (!cadastral.foglio && !cadastral.particella && !cadastral.sub && !cadastral.categoria) cadastral = null;
      else Object.keys(cadastral).forEach(function (k) { cadastral[k] = scrubText(cadastral[k], 20) || ''; });

      // Fatti della riga del verdetto
      var facts = [];
      if (currentCards.length) {
        var first = currentCards[0];
        var lf = { k: 'lease', status: first.status, to: first.endDate };
        if (currentCards.length > 1) lf.n = currentCards.length;
        facts.push(lf);
      } else if (markedRented(p)) facts.push({ k: 'no_lease' });
      else facts.push({ k: 'vacant' });
      if (currentCards.length) {
        var cell = ribbonMonths[9];
        var mr = rows.filter(function (r) { return cell.rowIds.indexOf(r.id) >= 0; });
        if (mr.length) {
          var f = { k: 'month', month: month, state: cell.state };
          var main = mr.filter(function (r) { return r.state === cell.state; })[0] || mr[0];
          if (cell.state === 'paid' && main.paidDate) { f.date = main.paidDate; f.via = main.via; }
          if (cell.state === 'due' && main.dueDate) f.date = main.dueDate;
          if (cell.state === 'overdue') f.days = main.overdueDays;
          if (mr.length > 1) f.count = mr.length;
          // Le stanze: la rata in ritardo dice di quale interno è.
          if (multi && cell.state === 'overdue') { if (main.unit) f.unit = main.unit; if (main.tenantName) f.tenantName = main.tenantName; }
          facts.push(f);
        } else if (/* mp:lease-month */ current.some(function (c) { return leaseCoversMonth(c, month); })) facts.push({ k: 'no_rows', month: month });
        // Un mese fuori da ogni contratto in corso (prima dell'inizio, dopo
        // la fine) non ha rate da aspettarsi: nessun fatto, mai «non ancora a
        // sistema» per un mese che il contratto non copre.
      }
      var n30 = deadlines.filter(function (dl) { return (str(dl.linkedPropertyId) === pid || pc.some(function (c) { return str(c.id) === str(dl.linkedContractId); })) && ymdOf(dl.date) >= today && ymdOf(dl.date) <= addDays(today, 30); }).length;
      if (n30) facts.push({ k: 'deadlines', n30: n30 });

      return { id: pid, label: scrubText(propLabel(p), 80) || 'Immobile', address: scrubText(str(p.address) + (has(p.city) && str(p.address).indexOf(str(p.city)) < 0 ? ', ' + str(p.city) : ''), 120) || '',
        cadastral: cadastral, dot: 'ok', facts: facts, contracts: { current: currentCards, past: pastCards },
        ribbon: { months: ribbonMonths, currentIndex: 9 }, rows: rows, others: others, year: yr,
        maintenance: maint, valuation: valuation, _current: current, _unit: unit };
    });

    // Rate senza immobile (unità «unlinked»/«contract:»): da verificare.
    rentView.units.forEach(function (u) {
      if (u.propertyId && propsById[u.propertyId]) return;
      u.payments.forEach(function (r) { if (r.isRent) reason('rent_unlinked', { paymentId: str(r.id) }); });
    });

    // Da fare: firma → Scheda → scadenze
    projProps.forEach(function (pp) {
      pp._current.forEach(function (c) {
        var cid = str(c.id), sctx = { today: today, day: day, buckets: scope.buckets };
        var sequential = key(c.signingOrder) !== 'any', signTodo = false, cst = cardStatus(c, day);
        // Firmato su carta: nessuna firma digitale da chiedergli (un invito
        // rimasto armato sul contratto non lo rimanda a firmare ciò che ha
        // già firmato).
        if (cst !== 'signed_paper' && !c.landlordSignature && !has(c.landlordSignedAt) && has(c.landlordSignToken) && !delegateArmed(c, sctx)
          && (key(c.signatureStatus) === 'partial' || has(c.signInviteLandlordAt)) && (!sequential || tenantSideSigned(c))) {
          todo.push({ id: 'sign:' + cid, kind: 'sign', propertyId: pp.id, contractId: cid,
            /* mp:view-as-url */ url: viewAs ? null : BASE + '/sign?sign=' + encodeURIComponent(str(c.landlordSignToken)) });
          reason('sign_needed', { propertyId: pp.id, contractId: cid });
          signTodo = true;
        }
        // Un contratto in corso che aspetta ancora firme non è «tutto in
        // ordine»: se la prossima firma non è la sua (quella è già «serve
        // te»), il verdetto dice che non può dirlo con certezza.
        if (!signTodo && /* mp:lease-unsigned */ cst === 'awaiting_signatures') reason('lease_unsigned', { propertyId: pp.id, contractId: cid });
        // Nessuna firma registrata e nessun giro digitale provato: può essere
        // un contratto firmato su carta e inserito a mano, oppure no. Il dato
        // non lo dice, quindi il verdetto non può dire «Tutto in ordine».
        if (/* mp:signature-unrecorded */ cst === 'unrecorded') reason('signature_unrecorded', { propertyId: pp.id, contractId: cid });
        var cc = pp.contracts.current.filter(function (x) { return x.id === cid; })[0];
        var reg = cc && cc.stages.filter(function (s) { return s.key === 'registrazione'; })[0];
        // Solo un contratto con la tappa di registrazione (quindi digitale):
        // su un contratto di carta la Scheda non ha un PDF da completare —
        // nemmeno quando lo staff ne ha registrato la firma su carta.
        if (reg && reg.state !== 'done' && cst !== 'signed_paper') {
          var ctx = { contract: c, property: propsById[pp.id], tenant: {}, landlord: obj(inp.landlordProfile) };
          var it = [], en = [];
          try { it = fields.missingFor('landlord', ctx, { lang: 'it' }); en = fields.missingFor('landlord', ctx, { lang: 'en' }); } catch (_) { it = []; en = []; }
          var enBy = {}; en.forEach(function (m) { enBy[m.key] = m.label; });
          var missing = it.map(function (m) { return { key: str(m.key), label: { it: str(m.label), en: str(enBy[m.key] || m.label) }, group: str(m.group) }; });
          var docsOnly = !!c.landlordSignature;
          if (docsOnly) missing = missing.filter(function (m) { return m.group === 'docs'; });
          if (missing.length) {
            var sUrl = null;
            if (!viewAs && typeof d.schedaUrl === 'function') { try { sUrl = d.schedaUrl(cid) || null; } catch (_) { sUrl = null; } }
            todo.push({ id: 'scheda:' + cid, kind: 'scheda', propertyId: pp.id, contractId: cid, missing: missing, docsOnly: docsOnly, url: sUrl });
            reason('scheda_needed', { propertyId: pp.id, contractId: cid, n: missing.length });
          }
        }
      });
    });
    deadlines.filter(function (dl) { var dt = ymdOf(dl.date); return dt >= addDays(today, -365) && dt <= addDays(today, 30); })
      .sort(function (a, b) { return ymdOf(a.date).localeCompare(ymdOf(b.date)) || str(a.id).localeCompare(str(b.id)); })
      .forEach(function (dl) {
        var dt = ymdOf(dl.date), pid = scope.ownedPropertyIds.has(str(dl.linkedPropertyId)) ? str(dl.linkedPropertyId)
          : (contracts.filter(function (c) { return str(c.id) === str(dl.linkedContractId); })[0] || {}).propertyId || null;
        var item = { id: 'dl:' + str(dl.id), kind: 'deadline', title: stripAmounts(scrubText(dl.title, 120)) || '—', date: dt,
          legalRef: scrubText(dl.legalRef, 60) || '', overdue: dt < today, propertyId: pid ? str(pid) : null,
          contractId: scope.ownedContractIds.has(str(dl.linkedContractId)) ? str(dl.linkedContractId) : null };
        todo.push(item);
        reason(item.overdue ? 'deadline_overdue' : 'deadline_soon', { propertyId: item.propertyId, contractId: item.contractId, date: dt });
      });
    var ORDER = { sign: 0, scheda: 1, deadline: 2 };
    todo.sort(function (a, b) { return ORDER[a.kind] - ORDER[b.kind] || str(a.date).localeCompare(str(b.date)) || a.id.localeCompare(b.id); });

    var partial = list(inp.partial).map(str).filter(function (p) { return /^[\w:.-]{1,60}$/.test(p); });
    if (partial.length) reason('read_partial', {});

    // Verdetto: vuoto > tu > osservo > nonso > ok
    var TU = ['sign_needed', 'scheda_needed', 'deadline_soon', 'deadline_overdue'];
    var OSS = ['rent_overdue', 'rent_reported', 'rent_processing', 'rent_processing_sepa', 'charge_overdue', 'charge_reported', 'charge_processing'];
    function levelOf(code) { return TU.indexOf(code) >= 0 ? 'tu' : OSS.indexOf(code) >= 0 ? 'osservo' : 'nonso'; }
    var RANK = { tu: 3, osservo: 2, nonso: 1, ok: 0 };
    function worst(rs) { var w = 'ok'; rs.forEach(function (r) { var l = levelOf(r.code); if (RANK[l] > RANK[w]) w = l; }); return w; }
    // Motivi unici (stesso codice+riferimenti = una riga)
    var seenR = {};
    reasons = reasons.filter(function (r) { var k = JSON.stringify(r); if (seenR[k]) return false; seenR[k] = true; return true; });
    reasons.sort(function (a, b) { return RANK[levelOf(b.code)] - RANK[levelOf(a.code)]; });
    var state = properties.length ? worst(reasons) : 'vuoto';
    projProps.forEach(function (pp) { pp.dot = worst(reasons.filter(function (r) { return r.propertyId === pp.id; })); });
    var lines = projProps.map(function (pp) { return { propertyId: pp.id, dot: pp.dot, facts: pp.facts }; })
      .sort(function (a, b) { return RANK[b.dot] - RANK[a.dot]; });

    // Archivio
    var archive = [];
    fileItems.forEach(function (it) { archive.push(archiveItem(it, keys)); });
    docItems.forEach(function (it) { archive.push(archiveItem(it, keys)); });
    objs(inp.rendiconti).forEach(function (m) {
      var ok = str(m.ownerId), mo = str(m.month);
      if (keys.indexOf(ok) < 0 || !isYm(mo)) return;
      var id = has(m.id) ? str(m.id) : ok + '_' + mo;
      var flag = obj(inp.rendicontiFiles)[id];
      archive.push({ ref: 'r:' + ok + ':' + mo, kind: 'rendiconto', propertyId: null, contractId: null, folder: 'soldi',
        date: day(m.at) || mo + '-01', at: isoAt(m.at), year: mo.slice(0, 4),
        title: { it: t('kind.rendiconto', 'it', { month: monthLabel(mo, 'it') }), en: t('kind.rendiconto', 'en', { month: monthLabel(mo, 'en') }) },
        state: null, provenance: { event: 'rendiconto_mensile', by: 'sistema' }, file: flag !== false, note: flag === false ? 'not_generated' : null, _month: mo });
    });
    // Fantasmi: ciò che dovrebbe esserci e non c'è (ERRATA E4.7)
    var ghosts = [];
    projProps.forEach(function (pp) {
      var all = pp.contracts.current.concat(pp.contracts.past);
      all.forEach(function (cc) {
        if (cc.signing.fullyAt && !refSet.has('c:' + cc.id + ':signed')) ghosts.push({ ghost: true, kind: 'signed', propertyId: pp.id, contractId: cc.id, folder: 'contratto', reason: 'not_archived' });
        // Firmato su carta: la copia firmata non nasce a sistema — finché non
        // c'è in archivio (un «Contratto di locazione» caricato), lo si dice.
        else if (cc.signing.paperAt && /* mp:paper-ghost */ !docItems.some(function (it) { return it.contractId === cc.id && it.category && it.category.id === 'contratto'; }))
          ghosts.push({ ghost: true, kind: 'signed', propertyId: pp.id, contractId: cc.id, folder: 'contratto', reason: 'not_archived' });
      });
      var p = propsById[pp.id];
      var apeDoc = docItems.some(function (it) { return it.propertyId === pp.id && it.category && it.category.id === 'ape'; });
      if (pp.contracts.current.length && !refSet.has('p:' + pp.id + ':dossier-ape') && !apeDoc && !parseStorageUrl(urlOf(obj(obj(p.dossier).ape)), scope.buckets))
        ghosts.push({ ghost: true, kind: 'ape', propertyId: pp.id, contractId: null, folder: 'immobile', reason: 'not_in_dossier' });
      pp.contracts.current.forEach(function (cc) {
        var verbaleDoc = docItems.some(function (it) { return it.contractId === cc.id && it.category && it.category.id === 'verbale'; });
        if ((cc.status === 'signed' || cc.status === 'signed_paper') && cc.startDate && today >= cc.startDate && !refSet.has('c:' + cc.id + ':verbale') && !verbaleDoc)
          ghosts.push({ ghost: true, kind: 'verbale', propertyId: pp.id, contractId: cc.id, folder: 'consegna', reason: 'not_archived' });
      });
    });
    archive.sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || str(a.ref).localeCompare(str(b.ref)); });
    var rendicontiCount = archive.filter(function (a) { return a.kind === 'rendiconto'; }).length;
    archive.forEach(function (a) { delete a._month; });
    archive = archive.concat(ghosts);

    // Fatture BOOM al proprietario (solo il fatto: nessun PDF archiviato)
    var invoices = objs(inp.invoices).filter(function (inv) { return keys.indexOf(str(inv.recipientId)) >= 0 && !rent.isRentReceipt(inv) && !badId(str(inv.id)); }).map(function (inv) {
      var st = key(inv.status), cid = scope.ownedContractIds.has(str(inv.contractId)) ? str(inv.contractId) : null;
      var c = cid ? cById[cid] || (scope.byId.contracts[cid]) : null;
      return { id: str(inv.id), number: scrubText(inv.number, 40) || '', service: scrubText(inv.service, 80) || '', amount: rent.amount(inv.amount),
        date: day(inv.date) || day(inv.createdAt) || null, status: st === 'paid' ? 'paid' : ['cancelled', 'canceled', 'void'].indexOf(st) >= 0 ? 'cancelled' : 'open',
        paidDate: day(inv.paidDate) || day(inv.paidAt) || null, contractId: cid, propertyId: c ? str(c.propertyId) : null };
    }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id); });

    var ownerName = scrubText(obj(inp.owner).name, 60) || '';
    var projection = {
      v: VERSION, today: today, month: month, updated: { date: today, time: romeClock(now instanceof Date ? now : new Date(now)) },
      owner: { firstName: ownerName ? ownerName.split(' ')[0] : '', name: ownerName },
      viewAs: viewAs,
      verdict: { state: state, reasons: reasons, lines: lines },
      todo: todo,
      properties: projProps.map(function (pp) { delete pp._current; delete pp._unit; pp.rows.concat(pp.others).forEach(function (r) { delete r.property; }); return pp; }),
      archive: archive,
      invoices: invoices,
      notes: { payoutNotTracked: true },
      meta: { partial: partial, counts: { properties: properties.length, contracts: contracts.length, archive: archive.filter(function (a) { return !a.ghost; }).length, rendiconti: rendicontiCount } },
    };
    if (viewAs) {
      projection.adminNotes = {
        hidden: Object.keys(hidden).sort().map(function (k) { var p = k.split('|'); return { kind: p[0], reason: p[1], count: hidden[k] }; }),
        issues: issuesAdmin,
      };
    }
    return projection;
  }

  // ── L'ultima porta: nessun valore sensibile esce, e non lo si ristampa ──
  var FORBIDDEN_KEYS = ['tenantSignToken', 'landlordSignToken', 'token', 'downloadTokens', 'manageToken', 'identityDocs', 'email', 'phone', 'cf', 'iban',
    'landlordIban', 'marginEur', 'stripeCostEur', 'serviceFeeEur', 'cardBrand', 'cardCountry', 'proofUrl', 'receiptUrl', 'fileUrl', 'signature',
    'tenantSignature', 'landlordSignature', 'ip', 'ua', 'payment', 'contract', 'property', 'tenant', 'user', 'source', 'raw'];
  var TENANT_KEY_RE = /^tenant(Email|Phone|CF|Dob|Pob|Address|Doc\w*|Nationality)$/;
  var TODO_URL_RE = /^https:\/\/www\.boomrome\.com\/(sign\?sign=|scheda\?t=)[\w.%~-]+$/;
  // Le stesse regole di scrubText (TEXT_PATTERNS, sopra): una copia sola.
  var PATTERNS = TEXT_PATTERNS;
  // Un identificativo (id, ref, *Id, rowIds) che rispetta la grammatica degli
  // id non può portare «+», spazi o «@»: lì il controllo telefono darebbe
  // falsi allarmi su id esadecimali, gli altri controlli restano.
  var ID_KEY_RE = /^(id|ref|rowIds|renewalOf|renewedToId|[a-z]+Id)$/;
  function assertClean(projection) {
    var violations = [];
    function scan(v, path, idLike) {
      PATTERNS.forEach(function (pt) {
        if (pt[0] === 'phone' && idLike && /^[\w:.-]{1,200}$/.test(v)) return;
        if (pt[1].test(v)) violations.push({ path: path, rule: pt[0] });
      });
    }
    function walk(v, path, idLike) {
      if (Array.isArray(v)) { v.forEach(function (x, i) { walk(x, path + '[' + i + ']', idLike); }); return; }
      if (v && typeof v === 'object') {
        Object.keys(v).forEach(function (kk) {
          var p = path ? path + '.' + kk : kk, val = v[kk];
          if (FORBIDDEN_KEYS.indexOf(kk) >= 0 || TENANT_KEY_RE.test(kk) || /IP$/.test(kk)) violations.push({ path: p, rule: 'forbidden_key' });
          if (kk === 'url') {
            var slot = /^todo\[\d+\]\.url$/.test(p);
            if (slot && (val === null || (typeof val === 'string' && TODO_URL_RE.test(val)))) return;
            violations.push({ path: p, rule: 'url_key' });
          }
          walk(val, p, ID_KEY_RE.test(kk));
        });
        return;
      }
      if (typeof v === 'string') scan(v, path, idLike);
    }
    walk(projection, '', false);
    return violations.length ? { ok: false, violations: violations } : { ok: true };
  }

  // ── Ricerca istantanea sulla proiezione ───────────────────────────────
  var MONTH_WORDS = {};
  ['it', 'en'].forEach(function (l) {
    MONTHS[l].forEach(function (m, i) { MONTH_WORDS[norm(m)] = i + 1; MONTH_WORDS[norm(m).slice(0, 3)] = i + 1; });
  });
  function search(projection, query, lang) {
    var P = obj(projection), q = norm(query), lg = L(lang), out = [];
    if (!q) return out;
    var props = objs(P.properties), byProp = {};
    props.forEach(function (p) { byProp[p.id] = p; });
    function contractLabel(cid, pid) {
      var p = byProp[pid]; if (!p || !cid) return null;
      var c = objs(obj(p.contracts).current).concat(objs(obj(p.contracts).past)).filter(function (x) { return x.id === cid; })[0];
      if (!c) return null;
      var a = str(c.startDate).slice(0, 4), b = str(c.endDate).slice(2, 4);
      return a ? t('ui.contract_short', lg, { from: a, to: b || '…' }) : null;
    }
    function pathFor(a) {
      var p = byProp[a.propertyId], parts = [];
      if (p) parts.push(p.label);
      var cl = contractLabel(a.contractId, a.propertyId); if (cl) parts.push(cl);
      if (a.kind === 'rendiconto') parts.push(t('ui.rendiconti', lg));
      else parts.push(t('folder.' + a.folder, lg));
      return parts;
    }
    function pushArchive(a) {
      if (out.length >= 30 || !a || a.ghost) return;
      if (out.some(function (o) { return o.type === 'archive' && o.ref === a.ref; })) return;
      out.push({ type: 'archive', ref: a.ref, propertyId: a.propertyId || null, title: obj(a.title)[lg] || obj(a.title).it || '', path: pathFor(a) });
    }
    var archive = objs(P.archive);
    // Mese: «marzo 2026», «mar», «March 2026»
    var mm = /^([a-z]+)\s*(\d{4})?$/.exec(q);
    if (mm && MONTH_WORDS[mm[1]] && (mm[1].length === 3 || MONTHS.it.map(norm).indexOf(mm[1]) >= 0 || MONTHS.en.map(norm).indexOf(mm[1]) >= 0)) {
      var mn = MONTH_WORDS[mm[1]], today = str(P.today) || '2000-01-01', ty = +today.slice(0, 4), tm = +today.slice(5, 7);
      var y = mm[2] ? +mm[2] : (mn <= tm ? ty : ty - 1);
      var ym = y + '-' + (mn < 10 ? '0' : '') + mn;
      archive.filter(function (a) { return a.kind === 'rendiconto' && /:(\d{4}-\d{2})$/.test(a.ref || '') && a.ref.slice(-7) === ym; }).forEach(pushArchive);
      props.forEach(function (p) {
        var months = objs(obj(p.ribbon).months);
        if (months.some(function (m) { return m.ym === ym; }) || objs(p.rows).some(function (r) { return r.month === ym; })) {
          if (out.length < 30) out.push({ type: 'month', id: ym, propertyId: p.id, title: monthLabel(ym, lg), path: [p.label, monthLabel(ym, lg)] });
        }
      });
      return out.slice(0, 30);
    }
    // Lessico
    var kinds = [];
    LEXICON.forEach(function (e) {
      e.words.forEach(function (w) { var nw = norm(w); if (q === nw || (' ' + q + ' ').indexOf(' ' + nw + ' ') >= 0 || (nw.length >= 4 && nw.indexOf(q) === 0 && q.length >= 3)) kinds = kinds.concat(e.kinds); });
    });
    if (kinds.length) archive.filter(function (a) { return kinds.indexOf(a.kind) >= 0; }).forEach(pushArchive);
    // Testo libero: titoli, immobili, contratti
    archive.forEach(function (a) {
      if (a.ghost) return;
      var hay = norm([obj(a.title).it, obj(a.title).en].join(' '));
      if (hay.indexOf(q) >= 0) pushArchive(a);
    });
    // Le fatture BOOM stanno nell'archivio (cartella Soldi): una riga che si
    // vede deve anche potersi trovare — per numero, servizio o «fattura».
    var invWord = ['fattura', 'fatture', 'invoice', 'invoices'].some(function (w) { return q === w || (' ' + q + ' ').indexOf(' ' + w + ' ') >= 0 || (w.length >= 4 && w.indexOf(q) === 0 && q.length >= 4); });
    /* mp:search-invoices */ objs(P.invoices).forEach(function (v) {
      if (out.length >= 30) return;
      var line = function (l) { return t('ui.invoice_line', l, { number: v.number || '', service: v.service || '', amount: '', status: '' }); };
      var hay = norm([line('it'), line('en')].join(' '));
      if (!invWord && hay.indexOf(q) < 0) return;
      var pth = []; if (byProp[v.propertyId]) pth.push(byProp[v.propertyId].label);
      var cl = contractLabel(v.contractId, v.propertyId); if (cl) pth.push(cl);
      pth.push(t('folder.soldi', lg));
      out.push({ type: 'invoice', id: str(v.id), propertyId: v.propertyId || null, title: v.number || '', path: pth });
    });
    props.forEach(function (p) {
      if (out.length >= 30) return;
      if (norm(p.label + ' ' + p.address).indexOf(q) >= 0) out.push({ type: 'property', id: p.id, propertyId: p.id, title: p.label, path: [p.label] });
      objs(obj(p.contracts).current).concat(objs(obj(p.contracts).past)).forEach(function (c) {
        if (out.length >= 30) return;
        if (norm([c.tenantName].concat(c.coTenantNames || []).join(' ')).indexOf(q) >= 0) {
          var cl = contractLabel(c.id, p.id) || t('folder.contratto', lg);
          out.push({ type: 'contract', id: c.id, propertyId: p.id, title: cl, path: [p.label, cl] });
        }
      });
    });
    return out.slice(0, 30);
  }

  var API = {
    VERSION: VERSION, BASE: BASE, CONTACT: CONTACT, STRINGS: STRINGS, VISIBILITY: VISIBILITY, DOC_CATEGORIES: DOC_CATEGORIES,
    STAGES: STAGES, LEXICON: LEXICON, URL_FIELDS: URL_FIELDS, CODES: CODES, DEFAULT_BUCKETS: DEFAULT_BUCKETS, ID_RE: ID_RE,
    itNum: itNum, enNum: enNum, eur: eur, dateNum: dateNum, dateLong: dateLong, dateShort: dateShort, monthLabel: monthLabel, t: t,
    encodeRef: encodeRef, parseRef: parseRef, parseStorageUrl: parseStorageUrl,
    ownerKeys: ownerKeys, scopeFor: scopeFor, documentVisibility: documentVisibility, attributable: attributable, stagesFor: stagesFor, paperSignedOn: paperSignedOn,
    build: build, fileFor: fileFor, assertClean: assertClean, scrubText: scrubText, stripAmounts: stripAmounts, search: search,
    contractType: contractType,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_OWNER = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
