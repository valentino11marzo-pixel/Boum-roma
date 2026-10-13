/* BOOM · IL PALAZZO — la vista. Un palazzo in 3D (CSS, niente WebGL: gira
 * su qualunque telefono e non scarica librerie), un cubo per interno, il
 * colore è lo stato del mese: oro pagato, rosso in ritardo, avorio da
 * pagare, blu in verifica, ambra senza rata, vetro libero, menta in arrivo.
 * Accanto, il mese in parole: chi non ha pagato, chi deve ancora pagare,
 * cosa è libero. Sotto, la linea del tempo dei 12 mesi (▶ la riproduce).
 *
 * Una faccia, due ruoli: l'admin vede tutti i palazzi, ciò che va sistemato
 * e le azioni del portale (canoni, contratto, fascicolo, modifica); il
 * proprietario vede il SUO palazzo, in sola lettura. Nessuna scrittura parte
 * da qui tranne una, esplicita e solo admin: collegare gli interni al
 * profilo della proprietaria (altrimenti dal suo accesso non li vede).
 * Il motore è js/palazzo-engine.js; qui c'è solo disegno e interazione.
 */
(function (root) {
  'use strict';
  var NODE = typeof module === 'object' && module.exports;
  var E = NODE ? require('./palazzo-engine.js') : root.BOOM_PALAZZO;
  var RENT = NODE ? require('./rent-engine.js') : root.BOOM_RENT;
  // Che contratto è (carta, segnaposto) e com'è scritto il telefono: UNA
  // copia, js/contract-state.js. Senza il modulo (una pagina che non lo
  // carica) le regole minime sono le sue, e il telefono non si indovina mai.
  var CS = (NODE ? require('./contract-state.js') : root.BOOM_CONTRACT_STATE) || {
    isPaper: function (c) { return !!(c && String(c.signatureStatus || '').trim() === 'paper'); },
    isPlaceholder: function (c) { return !!(c && c.contractMissing === true); },
    isImported: function (c) { return !!(c && String(c.source || '').trim() === 'palazzo-import'); },
    notSignable: function (c) { return !c || c.contractMissing === true || /^(paper|complete)$/.test(String(c.signatureStatus || '').trim()); },
    phoneIntl: function (raw) { var s = String(raw || '').trim(), d = s.replace(/\D/g, ''); return s.charAt(0) === '+' && d.length >= 8 ? { e164: '+' + d, wa: d, kind: d.indexOf('39') === 0 ? 'it' : 'intl', raw: s } : { e164: null, wa: null, kind: s ? 'unknown' : 'empty', raw: s }; }
  };
  var doc = root.document;

  var GEO = { w: 88, h: 54, d: 66, gx: 12, gz: 16, fh: 66 };
  // I filtri sono i QUATTRO TONI del motore (E.TONES), non gli otto stati.
  // «Liberi e in arrivo»: il tono conta anche chi arriva, e accanto i numeri
  // dicono «2 liberi · 1 in arrivo» — la stessa parola con due numeri no.
  var FILTERS = [['all', 'Tutti', null]].concat(E.TONES.map(function (t) {
    return [{ pagato: 'paid', ritardo: 'late', attesa: 'due', libero: 'free', prima: 'before', annullata: 'waived' }[t.key], t.key === 'ritardo' ? 'Non pagato' : t.key === 'libero' ? 'Liberi e in arrivo' : t.label, t.states];
  }));
  var GLYPH = { paid: '✓', late: '!', due: '·', review: '·', norate: '·', unknown: '·', incoming: '→', vacant: '', before: '', waived: '–' };

  // view '' = nessuna scelta salvata: la decide il ruolo al primo disegno
  // (la proprietaria apre su Semplice ovunque, l'admin su 3D da desktop).
  var ui = { key: '', month: '', view: '', filter: 'all', selected: '', rx: -22, ry: 34, zoom: 1, intro: Object.create(null), facIntro: Object.create(null), fy: -25, fx: -10, playing: null, draft: null, lookOpen: false, paidOpen: false, shown: '', asOwner: '', shareOpen: false, imp: null, reportFor: '', reportDone: '', reportDraft: { category: 'plumbing', priority: 'medium', description: '' }, links: null, linksOpen: false, linksErr: false,
    rata: { urls: Object.create(null), skipped: Object.create(null), pending: Object.create(null), sent: Object.create(null), open: '', failed: '' }, rataOpen: false,
    contacts: { byId: Object.create(null), pending: Object.create(null), failed: Object.create(null) },
    // La lingua dei messaggi agli inquilini (inglese di default), i documenti
    // condivisi per palazzo, i link /guasto per contratto, il modulo canone/
    // oneri aperto, l'esito dell'ultimo comando del rendiconto, la carta.
    msgLang: 'en', docs: Object.create(null), linksBy: null, linksSeat: null, terms: null, rend: null, cardOpen: false, cardDraft: null, opener: '' };
  var adapter = null, last = null, bound = false;
  try {
    var saved = JSON.parse(root.localStorage && root.localStorage.getItem('boom_palazzo') || '{}');
    if (saved.view === 'list' || saved.view === '3d' || saved.view === 'simple') ui.view = saved.view;
    if (typeof saved.key === 'string') ui.key = saved.key;
  } catch (_) {}
  function persist() { try { root.localStorage.setItem('boom_palazzo', JSON.stringify({ view: ui.view, key: ui.key })); } catch (_) {} }

  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function eur(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    var n = Math.round(Number(v) * 100) / 100, int = Math.trunc(Math.abs(n)), cents = Math.round((Math.abs(n) - int) * 100);
    return (n < 0 ? '−' : '') + '€' + String(int).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (cents ? ',' + String(cents).padStart(2, '0') : '');
  }
  var MON = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  function dateIt(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? (+d.slice(8, 10)) + ' ' + MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) : ''; }
  function unitTitle(u) { return u.interno ? 'Int. ' + u.interno : u.name; }
  function unitWhere(u) {
    var parts = [];
    if (u.scala) parts.push('Scala ' + u.scala);
    parts.push(u.floor == null ? (viewAdmin() ? 'piano da indicare' : 'piano in verifica da BOOM') : u.floorTop ? 'Attico' : E.floorLabel(u.floor));
    return parts.join(' · ');
  }
  function surname(name) { var s = String(name || '').trim().split(/\s+/); return s.length > 1 ? s[s.length - 1] : s[0] || ''; }
  function stateLabel(um, month, currentMonth) {
    var owner = adapter && !viewAdmin();
    if (um.state === 'norate' && um.lease && um.lease.contractMissing === true) return owner ? 'Contratto in arrivo da BOOM' : 'Contratto da caricare';
    if (um.state === 'norate' && owner) return 'In verifica da BOOM';
    if (um.state === 'review' && owner) return 'In verifica da BOOM';
    if ((um.state === 'review' || um.state === 'unknown') && (um.rows || []).some(function (r) { return r.state === 'review'; })) return 'Rimborso o contestazione da verificare';
    if (um.state === 'norate') return month > currentMonth ? 'Rata non ancora generata' : 'Rata non registrata';
    return E.STATES[um.state] ? E.STATES[um.state].label : 'Da verificare';
  }
  // L'operatore che guarda "come la vede lei": stessi dati, nessun suo tasto.
  function viewAdmin() { return !!(adapter && adapter.isAdmin() && !ui.asOwner); }
  function matches(filter, state) { var f = FILTERS.find(function (x) { return x[0] === filter; }); return !f || !f[2] || f[2].indexOf(state) >= 0; }

  // ── Dati ──────────────────────────────────────────────────────────────
  function compute() {
    var S = adapter.state(), realAdmin = adapter.isAdmin();
    if (!realAdmin) ui.asOwner = '';
    var preview = realAdmin && ui.asOwner ? ui.asOwner : '', admin = realAdmin && !preview;
    if (!ui.view) ui.view = !admin || (root.matchMedia && root.matchMedia('(max-width: 600px)').matches) ? 'simple' : '3d';
    var ctx = E.context({ properties: S.properties, contracts: S.contracts, payments: S.payments, users: S.users, maintenance: S.maintenance,
      preAgreements: admin ? S.preAgreements : null, listings: S.listings });
    // In anteprima il filtro è QUELLO della proprietaria: vede solo gli
    // interni col suo ownerId, come dal suo accesso (rules + loader).
    var me = preview || (S.profile && S.profile.id);
    var filter = admin ? null : function (p) { return p.ownerId === me; };
    if (!ui.month) ui.month = ctx.month;
    // L'anteprima dell'aspetto (solo admin, prima di salvare) usa lo stesso
    // motore: l'ultimo piano entra nel modello, i colori sopra m.look.
    var d = admin && ui.draft && ui.draft.key === ui.key ? ui.draft : null;
    // Archivio letto a metà: il modello lo DICHIARA invece di contare come
    // assente ciò che non ha letto. Admin: archivi letti al tetto finché il
    // palazzo aperto non è stato riletto mirato. Proprietaria: una lettura
    // fallita (documenti, manutenzioni) che non tocca contratti e rate.
    var L = S.palazzoLoad, loaded = !!(L && L.state === 'ready' && L.key && L.key === ui.key);
    var err = !realAdmin && S.scopedLoadError ? String(S.scopedLoadError) : '';
    var severe = !!err && /immobili|contratti|rate/i.test(err);
    var partial = admin ? ((S.palazzoTruncated && !loaded) || (L && L.state === 'error' && L.key === ui.key) ? true : false) : !!err;
    var m = E.model(ctx, ui.key, ui.month, { filter: filter, partial: partial, topFloor: d && d.ultimoPiano > 0 ? +d.ultimoPiano : undefined });
    if (m.building && d) {
      m.lookView = Object.assign({}, m.look, d.intonaco ? { intonaco: d.intonaco } : {}, d.persiane ? { persiane: d.persiane } : {}, d.nome != null ? { name: String(d.nome).trim() } : {});
      if (d.ultimoPiano > 0 && d.ultimoPiano <= 40) m.lookView.topFloor = +d.ultimoPiano;
    }
    if (!admin && m.building) m.brief = E.brief(m, { owner: true });
    if (m.building && m.building.key !== ui.key) { ui.key = m.building.key; }
    if (ui.selected && !m.units.some(function (u) { return u.id === ui.selected; })) ui.selected = '';
    var pv = preview ? (S.users || []).find(function (u) { return u.id === preview; }) || { id: preview } : null;
    return { ctx: ctx, m: m, admin: admin, realAdmin: realAdmin, preview: pv, S: S, filter: filter, loadError: err, severe: severe, load: L && L.key === ui.key ? L : null };
  }
  // Ciò che il Palazzo sa di NON sapere, detto in testa: la lettura fallita
  // (con «Riprova»), l'archivio letto a metà, la rilettura in corso.
  function loadNote(data) {
    var A = adapter.actions || {}, out = '';
    if (data.loadError) {
      out += '<div class="plz-alert" role="alert"><p>' + esc(data.severe ? 'Non sono riuscito a leggere tutti i dati del tuo palazzo: per non mostrarti numeri sbagliati, il mese resta nascosto finché non tocchi Riprova.' : data.loadError) + '</p>' +
        (A.reload ? '<button type="button" class="plz-btn plz-sm plz-primary" data-plz="reload">Riprova</button>' : '') + '</div>';
    }
    if (data.admin && data.load && data.load.state === 'loading') out += '<p class="plz-muted plz-loadline" role="status">Rileggo contratti, rate e manutenzioni di questo palazzo…</p>';
    if (data.admin && data.load && data.load.state === 'error') out += '<div class="plz-alert" role="alert"><p>' + esc(data.load.error || 'Rilettura del palazzo non riuscita: i numeri potrebbero essere incompleti.') + '</p>' + (A.reload ? '<button type="button" class="plz-btn plz-sm" data-plz="reload">Riprova</button>' : '') + '</div>';
    return out;
  }

  // ── Disegno ───────────────────────────────────────────────────────────
  function render() {
    if (!adapter) return '';
    var data = compute(); last = data;
    var m = data.m;
    if (!m.building || data.severe) {
      var h1 = data.loadError ? 'Il tuo palazzo non è arrivato' : data.admin ? 'Nessun immobile in archivio' : 'Nessun interno collegato al tuo profilo';
      var sub = data.loadError ? '' : data.admin ? 'Carica il palazzo da una tabella, oppure aggiungi gli immobili da Immobili o dall’Innesto: ogni interno allo stesso civico diventa un piano del palazzo.' : 'BOOM sta collegando i tuoi immobili. Appena pronti li vedrai qui, interno per interno.';
      return '<div class="plz">' + previewBar(data) + '<header class="plz-head"><div><p class="plz-eyebrow">Il Palazzo</p><h1>' + h1 + '</h1>' + (sub ? '<p class="plz-sub">' + sub + '</p>' : '') +
        (data.admin ? '<div class="plz-otools"><button type="button" class="plz-chip-btn" data-plz="imp-open">＋ Carica da tabella</button></div>' : '') + '</div></header>' + loadNote(data) +
        '<div id="plz-import">' + (data.admin && ui.imp ? importPanel(data) : '') + '</div></div>';
    }
    if (ui.view === 'simple') {
      return '<div class="plz" data-view="simple">' + previewBar(data) + header(data) + '<div id="plz-load">' + loadNote(data) + '</div><div id="plz-share">' + (ui.shareOpen ? shareBox(data) : '') + '</div><div id="plz-import">' + (data.admin && ui.imp ? importPanel(data) : '') + '</div><div id="plz-issues">' + issues(data) + '</div>' +
        '<div class="plz-body plz-body-simple"><div class="plz-main" id="plz-simple">' + simple(data) + '</div>' +
        '<aside class="plz-panel" id="plz-panel" aria-live="polite">' + (ui.selected ? panel(data) : '') + '</aside></div>' +
        '<div class="plz-tip" id="plz-tip" hidden></div></div>';
    }
    return '<div class="plz" data-view="' + ui.view + '">' + previewBar(data) + header(data) + '<div id="plz-load">' + loadNote(data) + '</div><div id="plz-share">' + (ui.shareOpen ? shareBox(data) : '') + '</div><div id="plz-import">' + (data.admin && ui.imp ? importPanel(data) : '') + '</div><div id="plz-issues">' + issues(data) + '</div><div id="plz-kpis">' + kpis(data) + '</div>' +
      '<div id="plz-timeline">' + timeline(data) + '</div>' +
      '<div class="plz-body"><div class="plz-main">' + filters(data) +
      (ui.view === '3d' ? scene(data) : '<div id="plz-roll">' + roll(data) + exportBar(data) + '</div>') + tray(data) +
      '</div><aside class="plz-panel" id="plz-panel" aria-live="polite">' + panel(data) + '</aside></div>' +
      '<section class="plz-analytics" id="plz-analytics" aria-label="Andamento degli ultimi 12 mesi">' + analytics(data) + '</section>' +
      (data.admin ? '<div class="plz-below">' + cardPanel(data) + '</div>' : '') +
      '<div class="plz-tip" id="plz-tip" hidden></div></div>';
  }

  // ── Anteprima e invio alla proprietaria ───────────────────────────────
  var LOGIN_URL = 'https://www.boomrome.com/login?next=%2Fportal%23palazzo';
  function previewBar(data) {
    if (!data.preview) return '';
    var p = data.preview;
    return '<div class="plz-preview" role="status"><p><b>Anteprima</b> · così vede il Palazzo <b>' + esc(p.name || p.email || 'la proprietaria') + '</b> dal suo accesso: solo gli interni collegati a lei, nessun tasto dell’operatore, nessuna proposta.</p>' +
      '<button type="button" class="plz-btn plz-sm" data-plz="as-owner" data-owner="">Esci dall’anteprima</button></div>';
  }
  function shareText(data) {
    var o = data.m.owner || {}, first = String(o.name || '').trim().split(/\s+/)[0];
    return (first ? 'Buongiorno ' + first + ',' : 'Buongiorno,') + ' il suo Palazzo su BOOM è pronto (' + data.m.building.label + '): ogni mese vede quali interni sono occupati, chi ha pagato e chi no; toccando un interno trova l’inquilino con telefono, la scadenza del contratto e i pagamenti.\n\n' +
      'Si entra da qui con la sua email: ' + LOGIN_URL + '\nLa prima volta le arriva un’email da BOOM con il link per scegliere la password; se non la trova, nella pagina d’accesso scriva la sua email e tocchi «Password dimenticata?».\n\nValentino · BOOM';
  }
  function shareBox(data) {
    var o = data.m.owner || {}, u = o.user || {}, txt = shareText(data), A = adapter.actions || {};
    var phone = u.phone ? waNumber(u.phone) : '';
    return '<div class="plz-share"><p class="plz-eyebrow">Il messaggio per ' + esc(o.name || o.email || 'la proprietaria') + '</p><textarea class="plz-share-t" id="plz-share-t" rows="7" aria-label="Messaggio da inviare">' + esc(txt) + '</textarea>' +
      '<div class="plz-share-b">' +
      (phone ? '<a class="plz-btn plz-primary plz-sm" href="https://wa.me/' + esc(phone) + '?text=' + esc(encodeURIComponent(txt)) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      (o.email ? '<a class="plz-btn plz-sm" href="mailto:' + esc(o.email) + '?subject=' + esc(encodeURIComponent('Il suo Palazzo su BOOM')) + '&body=' + esc(encodeURIComponent(txt)) + '">Email</a>' : '') +
      '<button type="button" class="plz-btn plz-sm" data-plz="share-copy">Copia</button>' +
      (A.sendPasswordLink && o.id ? '<button type="button" class="plz-btn plz-sm" data-plz="pwd-link" data-owner="' + esc(o.id) + '"' + (o.email ? '' : ' disabled') + '>Manda il link per la password</button>' : '') +
      (!phone && !o.email ? '<span class="plz-muted">Nel suo profilo non ci sono telefono né email: copia il messaggio.</span>' : !phone ? '<span class="plz-muted">Telefono non in archivio (o senza prefisso): WhatsApp da aggiungere in Utenti.</span>' : '') +
      '</div><p class="plz-muted plz-share-n">Prima di inviarlo: «👁 Come la vede» mostra esattamente la sua pagina. Il link per la password le arriva per email, in italiano, e la riporta qui.</p>' +
      rendicontoBox(data) + '</div>';
  }
  // Il rendiconto del 1° del mese a questa proprietaria: spento, anteprima
  // (il PDF arriva SOLO a BOOM) o automatico. Senza una scelta scritta vale
  // l'anteprima per chi ha interni presi in carico dalla tabella (la regola
  // del server, api/owners/rendiconto.js), e lo si dice.
  var REND_MODES = [['off', 'Spento'], ['preview', 'Anteprima a BOOM'], ['auto', 'Automatico a lei']];
  // La risposta di /api/owners/rendiconto in una frase: cosa è partito e a chi.
  function rendOutcome(r, kind) {
    if (!r || r.ok === false) return { ok: false, msg: 'Non è partito: ' + ((r && r.error) || 'errore') + '. Riprova fra un attimo.' };
    var c = r.counts || {}, x = (r.results || [])[0] || {}, mon = r.label || (x.month ? E.monthLabel(x.month) : 'il mese scorso');
    var why = { off: 'il rendiconto è spento per lei', no_email: 'nel suo profilo non c’è un’email', no_activity: 'nel mese non ci sono movimenti', before_management: 'il mese è prima della gestione BOOM',
      already_sent: 'era già stato inviato', in_progress: 'un invio è già in corso', deferred: 'il server non ha fatto in tempo: riprova fra un minuto', parked: 'l’invio è fermo dopo troppi tentativi' };
    if (c.failed || c.uncertain || x.failed || x.uncertain) return { ok: false, msg: 'Invio di ' + mon + ' non riuscito: ' + (x.failed || x.uncertain || 'errore') + '. Controlla la posta inviata prima di riprovare.' };
    if (x.skipped) return { ok: false, msg: 'Niente di partito per ' + mon + ': ' + (why[x.skipped] || x.skipped) + '.' };
    if (c.previews) return { ok: true, msg: 'Anteprima di ' + mon + ' mandata a BOOM' + (x.to ? ' (' + x.to + ')' : '') + ': lei non riceve niente.' };
    if (c.sent) return { ok: true, msg: 'Rendiconto di ' + mon + ' mandato a ' + (x.to || 'lei') + '.' };
    return { ok: false, msg: kind === 'preview' ? 'Nessuna anteprima prodotta per ' + mon + '.' : 'Niente di partito per ' + mon + '.' };
  }
  function rendicontoBox(data) {
    var o = data.m.owner || {}, u = o.user || {}, A = adapter.actions || {};
    if (!o.id || !A.setRendiconto) return '';
    var raw = String(u.rendicontoMode || ''), known = raw === 'off' || raw === 'preview' || raw === 'auto';
    var imported = data.m.units.some(function (x) { return (x.property && x.property.source === 'palazzo-import') || (x.month.lease && x.month.lease.source === 'palazzo-import'); });
    var mode = known ? raw : raw ? 'preview' : imported ? 'preview' : 'auto';
    var note = known ? '' : raw ? ' (valore non valido in archivio: vale l’anteprima)' : imported ? ' (predefinito: interni presi in carico dalla tabella)' : ' (predefinito)';
    var R = ui.rend || {};
    return '<div class="plz-rend"><p class="plz-eyebrow">Rendiconto del 1° del mese</p>' +
      '<div class="plz-seg plz-rend-seg" role="group" aria-label="Rendiconto mensile">' + REND_MODES.map(function (x) {
        return '<button type="button" data-plz="rend-mode" data-mode="' + x[0] + '" data-owner="' + esc(o.id) + '" aria-pressed="' + (mode === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="plz-muted">' + esc({ off: 'Non parte niente, né a lei né a BOOM.', preview: 'Il PDF arriva solo a BOOM, con «ANTEPRIMA» nell’oggetto: lei non riceve niente.', auto: 'Il 1° del mese il PDF del mese chiuso arriva a lei per email.' }[mode] + note) + '</p>' +
      (adapter.rendiconto ? '<div class="plz-share-b"><button type="button" class="plz-btn plz-sm" data-plz="rend-run" data-kind="preview" data-owner="' + esc(o.id) + '">Mandami l’anteprima</button>' +
        '<button type="button" class="plz-btn plz-sm" data-plz="rend-run" data-kind="force" data-owner="' + esc(o.id) + '">Rimanda il mese scorso</button></div>' : '') +
      (R.msg ? '<p class="' + (R.ok ? 'plz-okline' : 'plz-note') + '" role="status">' + esc(R.msg) + '</p>' : '') + '</div>';
  }
  function header(data) {
    var m = data.m, b = m.building, o = m.owner;
    var sub = data.admin ? (o ? 'Proprietà di ' + esc(o.name || o.email || 'proprietario da collegare') : 'Proprietario da collegare') + ' · ' + b.units + (b.units === 1 ? ' interno' : ' interni')
      : b.units + (b.units === 1 ? ' interno gestito' : ' interni gestiti') + ' da BOOM';
    if (m.gestioneDal) sub += ' · gestione BOOM da ' + esc(E.monthLabel(m.gestioneDal).toLowerCase());
    var picker = m.buildings.length > 1 ? '<label class="plz-pick"><span>Palazzo</span><select data-plz="building">' + m.buildings.map(function (x) {
      return '<option value="' + esc(x.key) + '"' + (x.key === b.key ? ' selected' : '') + '>' + esc(x.label) + ' · ' + x.units + (data.admin && x.owner ? ' · ' + esc(x.owner.name || x.owner.email || '') : '') + '</option>';
    }).join('') + '</select></label>' : '';
    var isNow = m.month === m.currentMonth;
    var first = o && (String(o.name || '').trim().split(/\s+/)[0] || o.email);
    var tools = data.admin && o && o.id ? '<div class="plz-otools"><button type="button" class="plz-chip-btn" data-plz="as-owner" data-owner="' + esc(o.id) + '">👁 Come la vede ' + esc(first) + '</button>' +
      '<button type="button" class="plz-chip-btn" data-plz="share" aria-expanded="' + (ui.shareOpen ? 'true' : 'false') + '">Invia a ' + esc(first) + '</button>' +
      '<button type="button" class="plz-chip-btn" data-plz="imp-open">＋ Carica da tabella</button></div>'
      : data.admin ? '<div class="plz-otools"><button type="button" class="plz-chip-btn" data-plz="imp-open">＋ Carica da tabella</button></div>' : '';
    return '<header class="plz-head"><div class="plz-title"><p class="plz-eyebrow">Il Palazzo</p><h1 id="plz-h1" tabindex="-1">' + esc(b.label) + '</h1><p class="plz-sub">' + sub + '</p>' + tools + '</div>' +
      '<div class="plz-controls">' + picker +
      '<div class="plz-month" role="group" aria-label="Mese"><button type="button" class="plz-ico" data-plz="prev" aria-label="Mese precedente">‹</button><strong id="plz-month-label">' + esc(E.monthLabel(m.month)) + '</strong><button type="button" class="plz-ico" data-plz="next" aria-label="Mese successivo">›</button>' +
      (isNow ? '' : '<button type="button" class="plz-chip-btn" data-plz="today">Oggi</button>') + '</div>' +
      '<div class="plz-seg" role="tablist" aria-label="Vista">' + [['simple', 'Semplice'], ['3d', '3D'], ['list', 'Elenco']].map(function (v) {
        return '<button type="button" role="tab" data-plz="view" data-v="' + v[0] + '" aria-selected="' + (ui.view === v[0]) + '">' + v[1] + '</button>';
      }).join('') + '</div>' +
      '</div></header>';
  }

  // «Da sistemare» (solo admin): UNA riga per ogni voce del motore, e il
  // numero nel titolo conta le righe disegnate — mai una voce contata e
  // non mostrata. Ogni riga dice cosa e porta UNA mossa.
  function issues(data) {
    if (!data.admin) return '';
    var m = data.m, o = m.owner, S = data.S, ctx = data.ctx, out = [];
    var noPhone = withoutPhone(m);
    var name = function (uid) { var u = m.units.find(function (x) { return x.id === uid; }); return u ? unitTitle(u) : 'Interno'; };
    var tenantOfC = function (cid) { var c = ctx.contractById[cid]; return c ? String(c.tenantName || '').trim() : ''; };
    var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
    var btn = function (act, label, attrs) { return '<button type="button" class="plz-btn" data-plz="' + act + '"' + (attrs || '') + '>' + label + '</button>'; };
    var openC = function (cid, label) { return cid ? btn('contract', label || 'Apri contratto', ' data-id="' + esc(cid) + '"') : ''; };
    var row = function (tag, text, action, code) { out.push('<div class="plz-issue" data-issue="' + esc(code) + '"><span class="plz-tag">' + tag + '</span><p>' + text + '</p>' + (action || '') + '</div>'); };
    var renewsText = function (r) { return r === 'tacito' ? 'senza disdetta si rinnova da solo' : r === 'proroga' ? 'si proroga di diritto' : r === 'rinnovo' ? 'si rinnova' : ''; };
    m.issues.forEach(function (i) {
      switch (i.code) {
        case 'unplaced': return row('Piano', plural(i.count, 'interno senza piano', 'interni senza piano') + ': restano fuori dalla facciata e dal 3D.', btn('edit', 'Indica il piano', ' data-id="' + esc(i.ids[0]) + '"'), i.code);
        case 'owner':
          if (o && o.id) return row('Accesso', plural(i.count, 'interno non collegato', 'interni non collegati') + ' a ' + esc(o.name || o.email) + ': dal suo accesso non ' + (i.count === 1 ? 'lo vede' : 'li vede') + '.', btn('link', 'Collega a ' + esc(o.name || 'lei'), ' data-owner="' + esc(o.id) + '" data-ids="' + esc(i.ids.join(',')) + '"'), i.code);
          return row('Accesso', plural(i.count, 'interno ha', 'interni hanno') + ' un proprietario diverso dagli altri del palazzo.', btn('select', 'Vedi', ' data-id="' + esc(i.ids[0]) + '"'), i.code);
        case 'ownerProfile': {
          var cand = (S.users || []).find(function (u) { return u.role === 'landlord' && o && ((o.email && String(u.email || '').toLowerCase() === o.email) || (o.name && String(u.name || '').trim().toLowerCase() === o.name.trim().toLowerCase())); });
          return row('Accesso', 'Nessun interno è collegato al profilo di ' + esc(o && (o.name || o.email) || 'un proprietario') + ': ' + (cand ? 'il profilo esiste.' : 'crea il suo accesso in Utenti (ruolo Locatore), poi collegalo da qui.'),
            cand ? btn('link', 'Collega a ' + esc(cand.name || cand.email), ' data-owner="' + esc(cand.id) + '" data-ids="' + esc(i.ids.join(',')) + '"') : btn('users', 'Apri Utenti'), i.code);
        }
        case 'staleActive': {
          var it0 = (i.items || [])[0] || {};
          return row('Contratti', plural(i.count, 'contratto risulta attivo ma è scaduto', 'contratti risultano attivi ma sono scaduti') + (it0.unitId ? ' (' + esc(name(it0.unitId)) + (it0.end ? ', fine ' + dateIt(it0.end) : '') + (it0.renews ? ': ' + renewsText(it0.renews) : '') + ')' : '') + ': per le date l’interno è libero. Aggiorna la fine o chiudilo.', openC(it0.id || i.ids[0]), i.code);
        }
        case 'expiredStillIn': {
          var c0 = (i.contracts || [])[0] || {};
          var who0 = tenantOfC(c0.id);
          return row('Fine contratto', plural(i.count, 'contratto è scaduto', 'contratti sono scaduti') + ' senza una chiusura scritta' + (c0.unitId ? ' (' + esc(name(c0.unitId)) + (who0 ? ', ' + esc(who0) : '') + (c0.end ? ', fine ' + dateIt(c0.end) : '') + ')' : '') + (c0.renews ? ': ' + renewsText(c0.renews) + ' se nessuno ha dato disdetta' : '') + '. L’inquilino è ancora dentro? Rinnova o chiudi.', openC(c0.id), i.code);
        }
        case 'overlap': {
          var uid = i.ids[0], live = ((ctx.contractsByProperty[uid] || []).filter(function (c) { return E.covers(c, m.month) && !/^(terminated|cancelled|canceled|closed|ended)$/.test(String(c.status || '')); })
            .sort(function (a, b) { return String(a.startDate || '').localeCompare(String(b.startDate || '')); }));
          var older = live[0];
          return row('Contratti', plural(i.count, 'interno ha', 'interni hanno') + ' due contratti con giorni in comune (' + esc(name(uid)) + (older ? ': quello di ' + esc(older.tenantName || 'chi c’era prima') + ' va chiuso' : '') + ').', older ? openC(older.id, 'Apri quello da chiudere') : btn('select', 'Vedi', ' data-id="' + esc(uid) + '"'), i.code);
        }
        case 'preBoom': return row('Rate', plural(i.count, 'rata aperta', 'rate aperte') + ' di mesi prima della gestione BOOM: nel Palazzo non contano (non sono arretrati di BOOM), ma in Canoni restano scadute. Chiudile se non servono.', btn('rent', 'Apri canoni', ' data-id="' + esc(i.ids[0]) + '"'), i.code);
        case 'afterClose': {
          var parts = [];
          if (i.open) parts.push(plural(i.open, 'aperta da annullare', 'aperte da annullare'));
          if (i.paid) parts.push(plural(i.paid, 'pagata da verificare (rimborso, o la data di chiusura è sbagliata)', 'pagate da verificare (rimborso, o la data di chiusura è sbagliata)'));
          var acts = (i.open && (adapter.actions || {}).cancelRates ? btn('cancel-rates', 'Annulla ' + (i.open === 1 ? 'la rata aperta' : 'le ' + i.open + ' rate aperte'), ' data-ids="' + esc((i.paymentIds || []).join(',')) + '"') : '') +
            (i.paid ? btn('rent', 'Verifica in Canoni', ' data-id="' + esc(i.ids[0]) + '"') : '');
          return row('Rate', plural(i.count, 'rata cade', 'rate cadono') + ' dopo la chiusura del contratto (' + esc(i.ids.map(name).join(', ')) + '): ' + parts.join(', ') + '.', acts, i.code);
        }
        case 'beyondEnd': {
          var b0 = (i.items || [])[0] || {};
          return row('Fine contratto', plural(i.count, 'contratto ha', 'contratti hanno') + ' rate dopo la fine scritta (' + esc(name(b0.unitId)) + (b0.end ? ', fine ' + dateIt(b0.end) : '') + (b0.from ? ', rate da ' + esc(E.monthLabel(b0.from).toLowerCase()) : '') + '): rinnovo tacito o una data da aggiornare. Le rate restano dovute.', openC(b0.contractId), i.code);
        }
        case 'unregistered': return row('Registrazione', plural(i.count, 'contratto in corso senza registrazione segnata', 'contratti in corso senza registrazione segnata') + ' oltre 30 giorni dalla decorrenza: segnala con ✓ RLI registrato o invia ad ASPI. Alla proprietaria risulta “in verifica da BOOM”.', btn('select', 'Vedi', ' data-id="' + esc(i.ids[0]) + '"'), i.code);
        case 'nocontract': return row('Contratti', plural(i.count, 'interno occupato senza contratto in archivio', 'interni occupati senza contratto in archivio') + ': canone, date e rate arrivano col contratto. Alla proprietaria risulta “contratto in arrivo da BOOM”.', btn('load-contract', 'Carica il contratto', ' data-id="' + esc(i.ids[0]) + '"'), i.code);
        case 'norate': return row('Rate', plural(i.count, 'interno occupato senza rata', 'interni occupati senza rata') + ' in ' + esc(E.monthLabel(m.month).toLowerCase()) + ': né pagato né in ritardo finché la rata non esiste.', btn('rent', 'Verifica rate', ' data-id="' + esc(i.ids[0]) + '"'), i.code);
        case 'noticeDue': {
          var n0 = (i.items || [])[0] || {};
          var when = n0.passed ? 'termine per la disdetta passato il ' + dateIt(n0.by) + (n0.renews ? ': ' + renewsText(n0.renews) : '') : 'disdetta entro il ' + dateIt(n0.by);
          return row('Disdetta', plural(i.count, 'contratto finisce', 'contratti finiscono') + ' presto (' + esc(name(n0.unitId)) + (n0.tenants && n0.tenants[0] ? ', ' + esc(n0.tenants[0]) : '') + ', fine ' + dateIt(n0.end) + '): ' + when + (n0.assumed ? ' — termine ipotizzato, verifica sul contratto' : '') + '. Chiedi all’inquilino se resta.', openC(n0.contractId), i.code);
        }
        case 'listingLive': {
          var l0 = (i.items || [])[0] || {}, lu = m.units.find(function (x) { return x.id === l0.unitId; }), url = lu && lu.pipeline.listing ? lu.pipeline.listing.url : '';
          var why = { now: 'è pubblicato come libero adesso', nodate: 'è pubblicato senza data di disponibilità', noend: 'è pubblicato ma il contratto non ha una fine', early: 'è pubblicato con una data prima della fine del contratto' }[l0.why] || 'è ancora pubblicato';
          return row('Annunci', plural(i.count, 'interno abitato ha', 'interni abitati hanno') + ' l’annuncio in vetrina (' + esc(name(l0.unitId)) + ': ' + why + '): porta lead per una casa che non c’è. Toglilo, o mettilo in lista d’attesa con la data in cui si libera.', url ? '<a class="plz-btn" href="' + esc(url) + '" target="_blank" rel="noopener">Annuncio ↗</a>' : '', i.code);
        }
        case 'lookMissing': {
          var labels = { ultimoPiano: 'ultimo piano', intonaco: 'intonaco', persiane: 'persiane' }, miss = i.missing || [];
          return row('Facciata', 'Prima di mandarla alla proprietaria: ' + miss.map(function (k) { return labels[k] || k; }).join(', ') + ' non ' + (miss.length === 1 ? 'è dichiarato' : 'sono dichiarati') + ', la facciata resta neutra. Indicali da una foto o dal sopralluogo.', btn('look-open', 'Aspetto del palazzo'), i.code);
        }
        case 'partial': return row('Dati', 'Archivio letto in parte' + (i.collections && i.collections.length ? ' (' + esc(i.collections.join(', ')) + ')' : '') + ': i numeri di questo palazzo possono essere incompleti finché non lo rileggo.', (adapter.actions || {}).reload ? btn('reload', 'Rileggi') : '', i.code);
        default: return row('Da verificare', 'Voce «' + esc(i.code) + '»: ' + plural(i.count || 0, 'elemento', 'elementi') + '.', i.ids && i.ids[0] ? btn('select', 'Vedi', ' data-id="' + esc(i.ids[0]) + '"') : '', i.code);
      }
    });
    if (noPhone.length) row('Contatti', plural(noPhone.length, 'inquilino senza telefono', 'inquilini senza telefono') + ' in archivio: dalla sua scheda la proprietaria non ' + (noPhone.length === 1 ? 'lo può' : 'li può') + ' chiamare.', btn('select', 'Vedi', ' data-id="' + esc(noPhone[0].id) + '"'), 'phone');
    var badWa = waMissing(m);
    if (badWa.length) row('Contatti', plural(badWa.length, 'inquilino ha', 'inquilini hanno') + ' un numero senza prefisso internazionale (' + esc(badWa.map(function (x) { return unitTitle(x.u); }).join(', ')) + '): niente WhatsApp finché non lo correggi (es. +90 …).', btn('select', 'Vedi', ' data-id="' + esc(badWa[0].u.id) + '"'), 'wa');
    if (!out.length) return '';
    var quiet = m.issues.every(function (i) { return i.code === 'norate'; }) && !noPhone.length && !badWa.length;
    return '<details class="plz-issues"' + (quiet ? '' : ' open') + '><summary>Da sistemare · ' + out.length + '</summary>' + out.join('') + '</details>';
  }
  // Inquilini col telefono ma senza un numero buono per WhatsApp.
  function waMissing(m) {
    var out = [];
    m.units.forEach(function (u) {
      var list = u.month.occupied ? contactsOf(u.month) : undefined;
      if (!Array.isArray(list)) return;
      list.forEach(function (p) { if (p.phone && !phoneOf(p.phone).wa) out.push({ u: u, p: p }); });
    });
    return out;
  }

  function ring(pct) {
    var r = 22, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return '<svg class="plz-ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="' + r + '" class="plz-ring-bg"/><circle cx="28" cy="28" r="' + r + '" class="plz-ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>';
  }
  function kpis(data) {
    var m = data.m, t = m.totals, mon = E.monthLabel(m.month).split(' ')[0].toLowerCase();
    if (m.allBefore) return '<div class="plz-kpis plz-kpis-before"><p class="plz-before-line">' + esc(beforeLine(m)) + '</p></div>';
    // Paganti e chi ha pagato dai totali del motore: l'interno il cui mese
    // rientra nella rata del mese prima non è un pagante (mai «3/3» sopra la
    // frase «2 hanno pagato su 2»).
    var managed = t.managed != null ? t.managed : t.units;
    var payers = t.payers != null ? t.payers : t.paid + t.late + t.due + t.review + t.unknown, paidN = t.paidPayers != null ? t.paidPayers : t.paid;
    var pct = t.expected ? Math.round(t.collected / t.expected * 100) : 0;
    var dn = t.debtorUnits != null ? t.debtorUnits : t.late, damt = t.debtorsAmount != null ? t.debtorsAmount : t.lateAmount;
    var occNote = [t.vacant ? t.vacant + (t.vacant === 1 ? ' libero' : ' liberi') : 'nessuno libero', t.incoming ? t.incoming + ' in arrivo' : '', t.leaving ? t.leaving + ' in scadenza' : '',
      t.before ? t.before + ' prima di BOOM' : ''].filter(Boolean).join(' · ');
    return '<div class="plz-kpis">' +
      '<div class="plz-kpi">' + ring(t.occupancy) + '<div><span>Pieni</span><strong>' + t.occupied + '<small>/' + managed + '</small></strong><em>' + occNote + '</em></div></div>' +
      '<div class="plz-kpi"><div class="plz-kpi-grow"><span>Hanno pagato · ' + esc(mon) + '</span><strong>' + paidN + '<small>/' + payers + '</small></strong><div class="plz-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><em>' + (t.expected ? eur(t.collected) + ' di ' + eur(t.expected) : payers ? 'importi da verificare' : t.carried ? esc(mon) + ' rientra nella rata del mese prima' : 'nessuna rata nel mese') + '</em></div></div>' +
      '<div class="plz-kpi' + (dn ? ' is-alert' : '') + '"><div><span>Non hanno pagato</span><strong>' + dn + '</strong><em>' + (dn ? (damt > 0 ? eur(damt) : 'importo da verificare') + (t.debtorsOldest ? ' · dal ' + dateIt(t.debtorsOldest) : '') : t.due ? (t.due === 1 ? '1 deve ancora pagare' : t.due + ' devono ancora pagare') : 'nessun ritardo') + '</em></div></div>' +
      '<div class="plz-kpi' + (t.arrears ? ' is-alert' : '') + '"><div><span>Arretrati totali</span><strong class="plz-num">' + eur(t.arrears) + '</strong><em>' + (t.arrearsCount ? t.arrearsCount + (t.arrearsCount === 1 ? ' rata scaduta' : ' rate scadute') + (t.arrearsOldest ? ', dal ' + dateIt(t.arrearsOldest) : '') : 'nessuna rata scaduta') + '</em></div></div>' +
      '</div>';
  }
  // Un mese tutto prima della gestione: una riga, mai «tutti in regola».
  function beforeLine(m) {
    return 'Prima della gestione BOOM' + (m.gestioneDal ? ' (da ' + E.monthLabel(m.gestioneDal).toLowerCase() + ')' : '') + ': pagamenti e occupazione di ' + E.monthLabel(m.month).toLowerCase() + ' non sono in archivio.';
  }

  function timeline(data) {
    var m = data.m;
    return '<div class="plz-time"><button type="button" class="plz-ico plz-play" data-plz="play" aria-label="' + (ui.playing ? 'Ferma' : 'Riproduci gli ultimi 12 mesi') + '">' + (ui.playing ? '❚❚' : '▶') + '</button><div class="plz-months" role="group" aria-label="Ultimi 12 mesi">' +
      m.series.map(function (s) {
        var t = s.totals, n = Math.max(1, t.units), seg = function (k, v) { return v ? '<i class="plz-s-' + k + '" style="flex:' + v + '"></i>' : ''; };
        var bar = seg('paid', t.paid) + seg('due', t.due + t.review + t.norate + (t.nocontract || 0) + t.unknown) + seg('late', t.late) + seg('vacant', t.vacant + t.incoming) + seg('before', t.before || 0) + seg('waived', t.waived || 0);
        var lab = t.units && (t.before || 0) === t.units ? 'prima della gestione BOOM'
          : t.paid + (t.paid === 1 ? ' pagato, ' : ' pagati, ') + t.late + ' in ritardo, ' + (t.vacant + t.incoming) + ((t.vacant + t.incoming) === 1 ? ' libero' : ' liberi') + (t.before ? ', ' + t.before + ' prima di BOOM' : '') +
            (t.waived ? ', ' + t.waived + (t.waived === 1 ? ' rata annullata' : ' rate annullate') : '');
        return '<button type="button" class="plz-mcell' + (s.month === m.month ? ' is-on' : '') + (s.month === m.currentMonth ? ' is-now' : '') + '" data-plz="month" data-m="' + s.month + '" aria-label="' + esc(E.monthLabel(s.month)) + ': ' + lab + '" aria-pressed="' + (s.month === m.month) + '"><span class="plz-mbar">' + bar + '</span><small>' + E.monthLabel(s.month, true) + '</small></button>';
      }).join('') + '</div></div>';
  }

  function filters(data) {
    var t = data.m.totals, count = { all: t.units, paid: t.paid, late: t.late, due: t.due + t.review + t.norate + (t.nocontract || 0) + t.unknown, free: t.vacant + t.incoming, before: t.before || 0, waived: t.waived || 0 };
    // «Prima di BOOM» e «Rata annullata» solo quando ci sono (o sono scelti).
    return '<div class="plz-filters" role="group" aria-label="Mostra">' + FILTERS.filter(function (f) { return (f[0] !== 'before' && f[0] !== 'waived') || count[f[0]] || ui.filter === f[0]; }).map(function (f) {
      return '<button type="button" class="plz-filter plz-f-' + f[0] + '" data-plz="filter" data-f="' + f[0] + '" aria-pressed="' + (ui.filter === f[0]) + '"><i aria-hidden="true"></i>' + f[1] + '<b>' + count[f[0]] + '</b></button>';
    }).join('') + '</div>';
  }

  // Un libero non è tutto uguale: in trattativa o già sul sito si vede.
  function pipeOf(u) {
    var s = u.month.state, pr = u.pipeline && u.pipeline.proposal, ls = u.pipeline && u.pipeline.listing;
    return s === 'vacant' && pr && pr.kind !== 'reserved' ? 'nego' : s === 'vacant' && ls && ls.published ? 'listed' : '';
  }
  function maintAttr(u) {
    var mt = u.maintenance;
    return mt && mt.open.length ? ' data-maint="' + (mt.urgent ? 'urgent' : 'open') + '"' : '';
  }
  function unitLabel(u) {
    var um = u.month, s = um.state, pipe = pipeOf(u);
    return unitTitle(u) + ', ' + unitWhere(u) + ': ' + (um.tenants.join(', ') || (s === 'vacant' ? 'libero' : '')) + ' — ' + stateLabel(um, last.m.month, last.m.currentMonth) + (um.expected ? ', ' + eur(um.expected) : '') +
      (pipe === 'nego' ? ' · in trattativa' : pipe === 'listed' ? ' · pubblicato sul sito' : '') +
      (u.maintenance && u.maintenance.open.length ? ' · ' + u.maintenance.open.length + (u.maintenance.open.length === 1 ? ' guasto aperto' : ' guasti aperti') : '');
  }
  function cube(u, x, z, i) {
    var um = u.month, s = um.state, dim = !matches(ui.filter, s), pipe = pipeOf(u);
    var who = um.tenants.length ? surname(um.tenants[0]) : pipe === 'nego' ? 'Trattativa' : pipe === 'listed' ? 'Sul sito' : s === 'vacant' ? 'Libero' : s === 'incoming' ? 'In arrivo' : '';
    return '<div class="plz-unit' + (u.id === ui.selected ? ' is-sel' : '') + (dim ? ' is-dim' : '') + '" role="button" tabindex="0" data-plz="select" data-id="' + esc(u.id) + '" data-state="' + s + '"' + (pipe ? ' data-pipe="' + pipe + '"' : '') + maintAttr(u) + ' style="--x:' + x + 'px;--zz:' + z + 'px;--i:' + i + '" aria-label="' + esc(unitLabel(u)) + '">' +
      '<div class="plz-face plz-f-front"><b>' + esc(u.interno || '•') + '</b><small>' + esc(who) + '</small><em aria-hidden="true">' + (GLYPH[s] || '') + '</em></div>' +
      '<div class="plz-face plz-f-back"></div><div class="plz-face plz-f-right"></div><div class="plz-face plz-f-left"></div><div class="plz-face plz-f-top"></div></div>';
  }

  function layout(floors) {
    var rowsOf = function (n) { return n <= 4 ? 1 : n <= 12 ? 2 : 3; };
    var maxCols = 1, maxRows = 1;
    floors.forEach(function (f) { var r = rowsOf(f.units.length); maxRows = Math.max(maxRows, r); maxCols = Math.max(maxCols, Math.ceil(f.units.length / r)); });
    var bw = maxCols * GEO.w + (maxCols - 1) * GEO.gx, bd = maxRows * GEO.d + (maxRows - 1) * GEO.gz;
    return { rowsOf: rowsOf, bw: bw, bd: bd, cols: maxCols, rows: maxRows };
  }

  function scene(data) {
    var floors = data.m.floors;
    if (!floors.length) return '<div class="plz-stage plz-empty-stage"><p>Nessun interno ha un piano indicato: li trovi qui sotto, nel cortile.</p></div>';
    var L = layout(floors), n = floors.length, intro = !ui.intro[data.m.building.key];
    var html = '', idx = 0;
    floors.forEach(function (f, li) {
      var y = (n - 1) * GEO.fh / 2 - li * GEO.fh, r = L.rowsOf(f.units.length), c = Math.ceil(f.units.length / r);
      if (f.ghost) {
        html += '<div class="plz-level plz-ghost" style="--y:' + y + 'px;--li:' + li + '"><div class="plz-flabel" aria-hidden="true">' + esc(f.short) + '</div>' +
          '<div class="plz-unit plz-ghostbox" aria-hidden="true" style="--w:' + L.bw + 'px;--x:0px;--zz:0px"><div class="plz-face plz-f-front"><small>non gestito da BOOM</small></div><div class="plz-face plz-f-back"></div><div class="plz-face plz-f-right"></div><div class="plz-face plz-f-left"></div><div class="plz-face plz-f-top"></div></div></div>';
        return;
      }
      var cubes = f.units.map(function (u, k) {
        var row = Math.floor(k / c), col = k % c;
        var x = Math.round((col - (c - 1) / 2) * (GEO.w + GEO.gx));
        var z = Math.round(((r - 1) / 2 - row) * (GEO.d + GEO.gz));
        return cube(u, x, z, idx++);
      }).join('');
      // Niente solai disegnati: lastre larghe quanto il palazzo, a 9px dai cubi
      // del piano sotto, Chrome le ordina male in profondità e sembrano
      // tagliare gli interni. Il palazzo si legge dai cubi stessi.
      html += '<div class="plz-level" style="--y:' + y + 'px;--li:' + li + '">' +
        '<div class="plz-flabel" aria-hidden="true">' + esc(f.short) + '</div>' + cubes + '</div>';
    });
    var gy = (n - 1) * GEO.fh / 2 + GEO.h / 2 + 4;
    return '<div class="plz-stage" id="plz-stage" tabindex="0" aria-label="Il palazzo in 3D. Trascina o usa le frecce per ruotare." style="--h3:' + Math.min(620, Math.max(340, n * GEO.fh + 230)) + 'px">' +
      '<div class="plz-world' + (intro ? ' plz-intro' : '') + '" id="plz-world" style="--w:' + GEO.w + 'px;--h:' + GEO.h + 'px;--d:' + GEO.d + 'px;--bw:' + L.bw + 'px;--bd:' + L.bd + 'px;--gy:' + gy + 'px;--rx:' + ui.rx + 'deg;--ry:' + ui.ry + 'deg;--z:' + ui.zoom + '">' +
      '<div class="plz-ground"></div>' + html + '</div>' +
      '<div class="plz-stage-ctl" role="group" aria-label="Vista 3D"><button type="button" class="plz-ico" data-plz="rot" data-d="-1" aria-label="Ruota a sinistra">↺</button><button type="button" class="plz-ico" data-plz="rot" data-d="1" aria-label="Ruota a destra">↻</button><button type="button" class="plz-ico" data-plz="zoom" data-d="1" aria-label="Avvicina">+</button><button type="button" class="plz-ico" data-plz="zoom" data-d="-1" aria-label="Allontana">−</button><button type="button" class="plz-ico" data-plz="reset" aria-label="Vista iniziale">⌂</button></div>' +
      '<p class="plz-hint" aria-hidden="true">Trascina per ruotare · tocca un interno</p></div>';
  }

  function tray(data) {
    var un = data.m.unplaced;
    if (!un.length) return '';
    return '<div class="plz-tray"><p class="plz-eyebrow">' + (ui.view === '3d' ? (data.admin ? 'Nel cortile · piano da indicare' : 'Posizione sul piano in verifica da BOOM') : '') + '</p>' + (ui.view === '3d' ? '<div class="plz-tray-row">' + un.map(function (u) {
      return '<button type="button" class="plz-chip" data-plz="select" data-id="' + esc(u.id) + '" data-state="' + u.month.state + '"><i aria-hidden="true"></i>' + esc(unitTitle(u)) + '<small>' + esc(stateLabel(u.month, data.m.month, data.m.currentMonth)) + '</small></button>';
    }).join('') + '</div>' : '') + '</div>';
  }

  // Le parole della striscia sono quelle del resto della scheda (stateLabel):
  // alla proprietaria «In verifica da BOOM» o «Contratto in arrivo da BOOM»,
  // mai «Rata non registrata», che è una parola dell'operatore.
  function stripHTML(u, month, currentMonth) {
    return '<div class="plz-strip" role="group" aria-label="Ultimi 12 mesi">' + u.strip.map(function (c) {
      var lab = E.monthLabel(c.month) + ': ' + stateLabel({ state: c.state, lease: u.month.lease }, c.month, currentMonth || month);
      return '<button type="button" class="plz-dot plz-s-' + c.state + (c.month === month ? ' is-on' : '') + '" data-plz="month" data-m="' + c.month + '" title="' + esc(lab) + '" aria-label="' + esc(lab) + '"></button>';
    }).join('') + '</div>';
  }

  function roll(data) {
    var m = data.m;
    var floorsDesc = m.floors.slice().reverse().concat(m.unplaced.length ? [{ label: data.admin ? 'Piano da indicare' : 'Piano in verifica da BOOM', units: m.unplaced }] : []);
    return '<div class="plz-roll" role="table" aria-label="Interni del palazzo"><div class="plz-rrow plz-rhead" role="row"><span role="columnheader">Interno</span><span role="columnheader">Inquilino</span><span role="columnheader">Canone</span><span role="columnheader">Contratto fino al</span><span role="columnheader">' + esc(E.monthLabel(m.month)) + '</span><span role="columnheader">Ultimi 12 mesi</span><span role="columnheader">Arretrati</span></div>' +
      floorsDesc.map(function (f) {
        var units = f.units.filter(function (u) { return matches(ui.filter, u.month.state); });
        if (!units.length) return '';
        return '<div class="plz-rfloor" role="rowgroup"><p class="plz-rfloor-l">' + esc(f.label) + '</p>' + units.map(function (u) {
          var um = u.month;
          return '<div class="plz-rrow' + (u.id === ui.selected ? ' is-sel' : '') + '" role="row" tabindex="0" data-plz="select" data-id="' + esc(u.id) + '">' +
            '<span role="cell" class="plz-rint"><b>' + esc(unitTitle(u)) + '</b>' + (u.scala ? '<small>Scala ' + esc(u.scala) + '</small>' : '') + '</span>' +
            '<span role="cell" data-l="Inquilino">' + esc(um.tenants.join(' · ') || (um.state === 'vacant' ? 'Libero' : um.state === 'incoming' ? 'In arrivo dal ' + dateIt(um.leaseStart) : '—')) + rollPhone(um) +
              (u.maintenance && u.maintenance.open.length ? ' <em class="plz-warn">🔧 ' + u.maintenance.open.length + (u.maintenance.open.length === 1 ? ' guasto' : ' guasti') + '</em>' : '') + '</span>' +
            '<span role="cell" data-l="Canone" class="plz-num">' + (um.rent != null && um.occupied ? eur(um.rent) : '—') + '</span>' +
            '<span role="cell" data-l="Fino al">' + (um.leaseEnd ? dateIt(um.leaseEnd) + (um.leaving ? ' <em class="plz-warn">' + esc(expiry(um.leaseEnd, m.today)) + '</em>' : '') : '—') + '</span>' +
            '<span role="cell" data-l="Mese"><span class="plz-pill plz-s-' + um.state + '">' + esc(stateLabel(um, m.month, m.currentMonth)) + '</span>' + (um.expected ? ' <small class="plz-num">' + eur(um.expected) + '</small>' : '') + '</span>' +
            '<span role="cell" data-l="12 mesi">' + stripHTML(u, m.month, m.currentMonth) + '</span>' +
            '<span role="cell" data-l="Arretrati" class="plz-num' + (u.arrears.amount ? ' plz-red' : '') + '">' + (u.arrears.amount ? eur(u.arrears.amount) : '—') + '</span></div>';
        }).join('') + '</div>';
      }).join('') + '</div>';
  }

  function panel(data) {
    var m = data.m, u = ui.selected && m.units.find(function (x) { return x.id === ui.selected; });
    if (!u) { ui.shown = ''; return monthPanel(data); }
    var enter = ui.shown !== u.id; ui.shown = u.id;
    return unitPanel(u, data, enter);
  }
  // Chi non ha pagato: i DEBITORI del motore (m.debtors), una voce per
  // interno E contratto — anche i mesi prima ancora aperti, col totale e il
  // mese da cui decorre il ritardo. Nel mese del cambio inquilino il debito
  // del vecchio resta col SUO nome.
  function debtorsOf(m) {
    return (m.debtors || []).map(function (d) { return { d: d, u: m.units.find(function (x) { return x.id === d.unitId; }) }; }).filter(function (x) { return x.u; });
  }
  function debtAmount(d) { return d.amount > 0 ? eur(d.amount) + (d.unknownAmounts ? ' + ?' : '') : 'da verificare'; }
  // Un importo che manca non è «€0»: si dice che è da verificare.
  function amtText(v) { return Number(v) > 0 ? eur(v) : 'importo da verificare'; }
  function paidAmt(u, r) {
    // Il mese coperto dalla rata del mese prima: l'importo è quello della
    // rata che lo copre (contato nel SUO mese), mai «importo da verificare».
    if (u.month.carried && r) return Number(r.amount) > 0 ? eur(r.amount) : amtText(0);
    var multi = r && r.coversTo && r.coversTo !== r.month;
    return multi && !u.month.collected && Number(r.amount) > 0 ? eur(r.amount) : amtText(u.month.collected || u.month.expected);
  }
  // Una riga che non è canone (saldo del deposito, altro addebito) si dice
  // per quello che è: mai «la rata di settembre» per un saldo di deposito.
  function rowKind(r) {
    if (!r || r.isRent !== false) return 'rent';
    return /^deposit(-balance)?$/.test(String(r.type || '').toLowerCase()) ? 'deposit' : 'other';
  }
  function rowName(r) {
    var k = rowKind(r);
    return k === 'deposit' ? (String(r.type || '').toLowerCase() === 'deposit' ? 'Deposito' : 'Saldo deposito') : k === 'other' ? 'Altro addebito' : '';
  }
  // Quante righe e di che tipo, quando non sono tutte canone: «1 rata + saldo
  // deposito» invece di «2 rate». '' se sono tutte canone.
  function itemsText(rows) {
    if (!Array.isArray(rows)) return '';
    var extra = rows.filter(function (r) { return rowKind(r) !== 'rent'; });
    if (!extra.length) return '';
    var rentN = rows.length - extra.length, names = [];
    extra.forEach(function (r) { var nm = rowName(r).toLowerCase(); if (names.indexOf(nm) < 0) names.push(nm); });
    return (rentN ? rentN + (rentN === 1 ? ' rata + ' : ' rate + ') : '') + names.join(' + ');
  }
  function debtNote(d) {
    var bits = [];
    if (d.oldestMonth) bits.push('da ' + E.monthLabel(d.oldestMonth).toLowerCase());
    if (d.oldestDays) bits.push(d.oldestDays + (d.oldestDays === 1 ? ' giorno' : ' giorni'));
    var mix = itemsText(d.rows);
    if (mix) bits.push(mix);
    else if (d.count > 1) bits.push(d.count + ' rate');
    if (d.unknownAmounts) bits.push(d.unknownAmounts === 1 ? 'un importo da verificare' : d.unknownAmounts + ' importi da verificare');
    if (d.previousContract) bits.push('contratto precedente');
    return bits.join(' · ');
  }
  function debtorName(x) { return x.d.tenants && x.d.tenants[0] || x.u.month.tenants[0] || ''; }
  // L'interno il cui mese rientra nella rata del mese prima (l'ultimo mese di
  // un contratto dal 15) non sta fra i paganti: ha la sua riga.
  function isCarried(u) { return !!(u.month.carried && u.month.state !== 'before' && u.month.state !== 'late'); }
  function carriedNote(u) {
    var r = u.month.rows[0];
    return r ? 'rata di ' + E.monthLabel(r.month).toLowerCase() + (r.state === 'paid' ? (r.paidDate ? ' · pagata il ' + dateIt(r.paidDate) : ' · pagata') : r.state === 'due' ? ' · da pagare' : ' · da verificare') : '';
  }
  function waivedNote(u) {
    var r = (u.month.waivedRows || [])[0], p = r && r.payment || {}, why = String(p.cancelledReason || '').trim().slice(0, 80);
    return 'rata di ' + E.monthLabel(u.month.month).toLowerCase() + ' annullata' + (why ? ' · ' + why : '');
  }
  function monthPanel(data) {
    var m = data.m, by = function (states) { return m.units.filter(function (u) { return states.indexOf(u.month.state) >= 0 && !isCarried(u); }); };
    // La frase del mese prima di BOOM sta già nei numeri in alto: qui niente.
    if (m.allBefore) return '';
    var debt = debtorsOf(m);
    var due = by(['due']), check = by(['review', 'norate', 'unknown']), free = by(['vacant']), coming = by(['incoming']), paid = by(['paid']);
    var carried = m.units.filter(isCarried), waived = by(['waived']);
    function line(u, right, note, who) {
      return '<button type="button" class="plz-line" data-plz="select" data-id="' + esc(u.id) + '"><i class="plz-s-' + u.month.state + '" aria-hidden="true"></i><span><b>' + esc(unitTitle(u)) + '</b> ' + esc(who != null ? who : u.month.tenants.length ? u.month.tenants[0] : '') + (note ? '<small>' + esc(note) + '</small>' : '') + '</span><em>' + right + '</em></button>';
    }
    function block(title, n, items, empty) {
      return '<section class="plz-block"><h3>' + title + ' <b>' + n + '</b></h3>' + (items.length ? items.join('') : '<p class="plz-muted">' + empty + '</p>') + '</section>';
    }
    var t = m.totals;
    return '<div class="plz-pcard"><p class="plz-eyebrow">' + esc(E.monthLabel(m.month)) + ' in breve</p>' +
      block('Non hanno pagato', debt.length, debt.map(function (x) { return line(x.u, debtAmount(x.d), debtNote(x.d), debtorName(x)).replace('class="plz-s-' + x.u.month.state + '"', 'class="plz-s-late"'); }), t.before ? 'Nessun ritardo fra gli interni gestiti.' : 'Nessun ritardo.') +
      (due.length ? block('Devono ancora pagare', due.length, due.map(function (u) { var r = u.month.rows.find(function (x) { return x.state === 'due'; }); return line(u, amtText(u.month.expected), r && r.dueDate ? 'scade il ' + dateIt(r.dueDate) : ''); }), '') : '') +
      (check.length ? block('Da verificare', check.length, check.map(function (u) { return line(u, '', stateLabel(u.month, m.month, m.currentMonth)); }), '') : '') +
      block('Liberi', free.length, free.map(function (u) { return line(u, '', freeNote(u)); }), t.before ? 'Nessun libero fra gli interni gestiti.' : 'Tutto pieno.') +
      (coming.length ? block('In arrivo', coming.length, coming.map(function (u) { return line(u, '', freeNote(u)); }), '') : '') +
      (waived.length ? block('Rata annullata', waived.length, waived.map(function (u) { return line(u, '', waivedNote(u)); }), '') : '') +
      (carried.length ? block('Coperti dalla rata del mese prima', carried.length, carried.map(function (u) { return line(u, paidAmt(u, u.month.rows[0]), carriedNote(u)); }), '') : '') +
      block('Hanno pagato', paid.length, paid.map(function (u) {
        var r = u.month.rows.find(function (x) { return x.paidDate; }) || u.month.rows[0];
        // Una rata che copre più mesi si conta nel mese in cui scade: qui si
        // dice che il mese è coperto, con l'importo vero, non "€0".
        var multi = r && r.coversTo && r.coversTo !== r.month;
        var span = multi ? 'rata ' + E.monthLabel(r.month, true) + '–' + E.monthLabel(r.coversTo, true) + ' · ' : '';
        return line(u, paidAmt(u, r), span + (r && r.paidDate ? 'pagata il ' + dateIt(r.paidDate) : ''));
      }), 'Ancora nessun pagamento registrato questo mese.') +
      '</div>';
  }

  // Un interno libero in una riga: chi arriva, chi tratta, se è sul sito, da quanto.
  function freeNote(u) {
    var pr = u.pipeline && u.pipeline.proposal, ls = u.pipeline && u.pipeline.listing, um = u.month, bits = [];
    if (um.state === 'incoming') bits.push('in arrivo' + (um.leaseStart ? ' dal ' + dateIt(um.leaseStart) : '') + (um.fromProposal ? (pr && pr.paid ? ' · proposta pagata, contratto da creare' : ' · proposta accettata, contratto da creare') : ''));
    else if (pr) bits.push((pr.kind === 'waiting' ? 'in lista d’attesa: ' : 'in trattativa con ') + (pr.tenant || 'un candidato'));
    if (um.state === 'vacant' && ls) bits.push(ls.published ? 'pubblicato sul sito' : 'annuncio non pubblicato');
    if (um.state === 'vacant' && u.time && u.time.vacantDays != null) bits.push('libero da ' + u.time.vacantDays + (u.time.vacantDays === 1 ? ' giorno' : ' giorni'));
    return bits.join(' · ') || unitWhere(u);
  }
  // La puntualità detta onesta: chi ha rate aperte non è «puntuale» perché
  // le pagate erano in orario, e «nessuna rata ancora prevista» non è «non
  // paga». Dalla gestione BOOM, se è iniziata dentro i 12 mesi.
  function punctuality(t) {
    if (!t) return '—';
    var since = t.since ? ' da ' + E.monthLabel(t.since).toLowerCase() : '';
    var open = t.overdueCount ? (t.overdueCount === 1 ? '1 rata aperta' : t.overdueCount + ' rate aperte') + (t.overdueOldest ? ', la più vecchia scaduta il ' + dateIt(t.overdueOldest) : '') : '';
    if (!t.paidCount) {
      if (open) return open;
      if (t.expectedCount === 0) return 'Nessuna rata ancora in scadenza' + since;
      return 'Nessuna rata pagata' + (since || ' negli ultimi 12 mesi');
    }
    var d = t.avgDelay, ad = Math.abs(d);
    var when = d < -0.4 ? itNum(ad) + (ad === 1 ? ' giorno prima' : ' giorni prima') : d > 0.4 ? itNum(d) + (d === 1 ? ' giorno dopo' : ' giorni dopo') : 'il giorno della scadenza';
    var base = 'Paga in media ' + when + ' · ' + t.onTime + ' su ' + t.paidCount + (t.paidCount === 1 ? ' rata puntuale' : ' rate puntuali') + since;
    return open ? base + ' · ' + open : base;
  }
  // I mesi occupati: solo quelli misurati (dalla gestione BOOM, con un
  // contratto noto). Il segnaposto non dà «12 su 12»: dà «—».
  function occupiedText(t) {
    if (!t) return '—';
    if (!t.measuredMonths) return t.unknownMonths ? '— (contratto non ancora in archivio)' : '—';
    return 'occupato ' + t.occupiedMonths + ' ' + (t.occupiedMonths === 1 ? 'mese' : 'mesi') + ' su ' + t.measuredMonths + (t.since ? ' (da ' + E.monthLabel(t.since).toLowerCase() + ')' : '') +
      (t.unknownMonths ? ' · ' + t.unknownMonths + (t.unknownMonths === 1 ? ' mese' : ' mesi') + ' senza contratto in archivio' : '');
  }
  function pipelineText(u) {
    var pr = u.pipeline.proposal, ls = u.pipeline.listing, out = [];
    if (pr) out.push(({ reserved: pr.paid ? 'Proposta pagata' : 'Proposta accettata', waiting: 'In lista d’attesa', negotiating: 'Proposta inviata' })[pr.kind] + (pr.tenant ? ' · ' + pr.tenant : '') + (pr.startDate ? ' · dal ' + dateIt(pr.startDate) : '') + (pr.rent != null ? ' · ' + eur(pr.rent) + '/mese' : '') + (pr.ref ? ' · ' + pr.ref : ''));
    if (ls) out.push(ls.published ? 'Annuncio pubblicato' : 'Annuncio non pubblicato');
    return out.join(' — ');
  }
  function itNum(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  // ── I contatti: dal server, una volta per contratto ─────────────────
  // `users` non è leggibile dal proprietario e un contratto nato da una
  // proposta non porta il telefono: li ricompone /api/owners/contatti, solo
  // per i contratti dei SUOI immobili. Un guasto non riprova da solo (niente
  // giri a vuoto): la scheda offre «Riprova».
  // Tutti i contratti che il mese mostra: chi abita, chi deve una rata (anche
  // il contratto PRIMA, nel mese del cambio inquilino), le rate in elenco.
  function contactIdsOf(m) {
    var seen = Object.create(null), out = [];
    var add = function (id) { if (id && !seen[id]) { seen[id] = 1; out.push(id); } };
    (m && m.units || []).forEach(function (u) {
      add(u.month.contractId); add(u.month.lateContractId);
      (u.month.rows || []).forEach(function (r) { add(r.contractId); });
      (u.month.pastDue || []).forEach(function (r) { add(r.contractId); });
    });
    (m && m.debtors || []).forEach(function (d) { add(d.contractId); });
    return out;
  }
  function contactsOfC(cid) { return cid ? ui.contacts.byId[cid] : undefined; }
  function ensureContacts(m) {
    if (!adapter || typeof adapter.contacts !== 'function' || !m || !m.building) return;
    var C = ui.contacts;
    var need = contactIdsOf(m).filter(function (id) { return !(id in C.byId) && !C.pending[id] && !C.failed[id]; });
    if (!need.length) return;
    need.forEach(function (id) { C.pending[id] = true; });
    Promise.resolve().then(function () { return adapter.contacts(need.slice(0, 120)); }).then(function (map) {
      need.forEach(function (id) { C.byId[id] = map && Array.isArray(map[id]) ? map[id] : []; delete C.pending[id]; });
      if (doc && doc.querySelector('.plz')) patch();
    }, function () {
      need.forEach(function (id) { C.failed[id] = true; delete C.pending[id]; });
      if (doc && doc.querySelector('.plz')) patch();
    });
  }
  function contactsOf(um) { return um.contractId ? ui.contacts.byId[um.contractId] : undefined; }
  function withoutPhone(m) {
    return m.units.filter(function (u) {
      var list = u.month.occupied ? contactsOf(u.month) : undefined;
      return Array.isArray(list) && !list.some(function (p) { return p.phone; });
    });
  }
  // Il telefono passa SEMPRE da BOOM_CONTRACT_STATE.phoneIntl: un numero
  // straniero scritto alla nazionale ('0532 123 45 67', '532 123 4567') non
  // diventa un WhatsApp per Cuba o una telefonata a Ferrara. Senza prefisso
  // certo niente WhatsApp, e lo si dice.
  function phoneOf(phone) { var r = CS.phoneIntl(phone); return r && typeof r === 'object' ? r : { e164: null, wa: null, kind: 'unknown', raw: String(phone || '') }; }
  function waNumber(phone) { return phoneOf(phone).wa || ''; }
  // Il link per chiamare: alla proprietaria MAI su un numero ambiguo (un
  // cellulare estero scritto alla nazionale diventerebbe una telefonata a
  // Ferrara); l'operatore lo tiene, con l'avviso accanto.
  function telOf(ph) { return ph && ph.e164 && !(ph.ambiguous && !viewAdmin()) ? 'tel:' + ph.e164 : ''; }
  // Prefissi internazionali (ITU): a una cifra 1 e 7, a due cifre questi;
  // tutti gli altri a tre. Serve solo a scrivere il numero leggibile.
  var CC2 = /^(2[07]|3[0-469]|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])/;
  function groupDigits(x) {
    if (x.length === 10) return x.slice(0, 3) + ' ' + x.slice(3, 6) + ' ' + x.slice(6);
    if (x.length === 9) return x.slice(0, 3) + ' ' + x.slice(3, 6) + ' ' + x.slice(6);
    return x.replace(/(\d{3})(?=\d{4,})/g, '$1 ');
  }
  function fmtPhone(phone) {
    var r = phoneOf(phone);
    // Un numero ambiguo (fisso italiano o estero senza prefisso) si scrive
    // com'è stato dato: «+39 053…» affermerebbe un prefisso che non sappiamo.
    if (!r.e164 || r.ambiguous) return String(phone || '').trim();
    var d = r.e164.slice(1), cl = /^[17]/.test(d) ? 1 : CC2.test(d) ? 2 : 3;
    return '+' + d.slice(0, cl) + ' ' + groupDigits(d.slice(cl));
  }
  function rollPhone(um) {
    var list = um.occupied || um.state === 'incoming' ? contactsOf(um) : undefined;
    var p = Array.isArray(list) && list.find(function (x) { return x.phone; });
    if (!p) return '';
    var ph = phoneOf(p.phone), tel = telOf(ph);
    return tel ? '<a class="plz-tel" href="' + esc(tel) + '" aria-label="' + esc('Chiama ' + (p.name || '') + ' ' + fmtPhone(p.phone)) + '">' + esc(fmtPhone(p.phone)) + '</a>'
      : '<span class="plz-tel plz-muted">' + esc(p.phone) + '</span>';
  }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function personHTML(p) {
    var links = [], ph = p.phone ? phoneOf(p.phone) : null, admin = viewAdmin();
    if (telOf(ph)) links.push('<a class="plz-btn plz-sm plz-primary" href="' + esc(telOf(ph)) + '">Chiama</a>');
    if (ph && ph.wa) links.push('<a class="plz-btn plz-sm" href="https://wa.me/' + esc(ph.wa) + '" target="_blank" rel="noopener">WhatsApp</a>');
    if (p.email) links.push('<a class="plz-btn plz-sm" href="mailto:' + esc(p.email) + '">Email</a>');
    var phoneLine = !p.phone ? '<span class="plz-muted">telefono non in archivio</span>'
      : '<span class="plz-num">' + esc(fmtPhone(p.phone)) + '</span>' + (ph.wa ? '' : '<small class="plz-warn">' + esc(phoneWhy(ph, admin)) + '</small>');
    return '<li class="plz-person"><p class="plz-person-n"><b>' + esc(p.name || 'Senza nome') + '</b>' + (p.role === 'cotenant' ? '<small>co-intestatario</small>' : '') + '</p>' +
      '<p class="plz-person-c">' + phoneLine + (p.email ? '<span>' + esc(p.email) + '</span>' : '') + '</p>' +
      (links.length ? '<div class="plz-reach">' + links.join('') + '</div>' : '') + '</li>';
  }
  // Perché un numero non ha WhatsApp: all'operatore cosa fare, alla
  // proprietaria cosa succede.
  function phoneWhy(ph, admin) {
    // Alla proprietaria non si afferma un fisso che non sappiamo: «da verificare».
    if (ph.kind === 'it-fixed' || ph.ambiguous) return admin ? 'fisso, oppure un cellulare estero senza prefisso: se è estero correggilo (es. +90 …)' : 'numero da verificare con BOOM: niente WhatsApp';
    return admin ? 'numero senza prefisso internazionale: correggilo nel contratto (es. +44 …)' : 'numero da verificare con BOOM: niente WhatsApp';
  }
  function peopleHTML(u, data) {
    var um = u.month;
    if (!um.contractId) return '';
    var head = '<p class="plz-eyebrow">' + (um.state === 'incoming' ? 'Chi arriva' : 'Chi abita qui') + '</p>';
    if (!adapter || typeof adapter.contacts !== 'function') return head + '<p class="plz-people-names">' + esc(um.tenants.join(' · ') || '—') + '</p>';
    var list = contactsOf(um);
    if (!list) {
      if (ui.contacts.failed[um.contractId]) return head + '<p class="plz-muted">' + esc(um.tenants.join(' · ')) + ' — contatti non raggiungibili ora. <button type="button" class="plz-link" data-plz="contacts-retry">Riprova</button></p>';
      return head + '<p class="plz-muted plz-loading">' + esc(um.tenants.join(' · ')) + (um.tenants.length ? ' · ' : '') + 'carico i contatti…</p>';
    }
    if (!list.length) return head + '<p class="plz-people-names">' + esc(um.tenants.join(' · ') || '—') + '</p><p class="plz-muted">' + (data.admin ? 'Nessun contatto in archivio: aggiungilo dal contratto.' : 'Contatti non ancora in archivio: li aggiunge BOOM.') + '</p>';
    return head + '<ul class="plz-people">' + list.map(personHTML).join('') + '</ul>';
  }
  // Quanto manca: in giorni fino a due mesi, poi in mesi. Mai una data
  // inventata: senza fine contratto non si dice niente.
  function expiry(end, today) {
    if (!end || !today) return '';
    var d = Math.round((Date.parse(end) - Date.parse(today)) / 864e5);
    if (isNaN(d)) return '';
    if (d < 0) return 'scaduto da ' + (-d) + (d === -1 ? ' giorno' : ' giorni');
    if (d === 0) return 'scade oggi';
    if (d <= 60) return 'scade tra ' + d + (d === 1 ? ' giorno' : ' giorni');
    var mo = Math.floor(d / 30.44);
    return 'scade tra ' + mo + (mo === 1 ? ' mese' : ' mesi');
  }
  function startsIn(start, today) {
    var d = Math.round((Date.parse(start) - Date.parse(today)) / 864e5);
    return isNaN(d) || d < 0 ? '' : d === 0 ? 'entra oggi' : 'entra tra ' + d + (d === 1 ? ' giorno' : ' giorni');
  }
  var TYPES = { transitorio: 'Transitorio', studenti: 'Studenti', '3+2': '3+2 canone concordato', '32': '3+2 canone concordato', concordato: '3+2 canone concordato', '4+4': '4+4 libero', libero: '4+4 libero' };
  function leaseType(c) { var t = String(c && c.type || '').trim(); return TYPES[t.toLowerCase()] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : ''); }
  function depositOf(c) {
    if (!c) return '';
    var n = Number(c.deposit);
    if (isFinite(n) && n > 0) return eur(n);
    var mo = Number(c.depositMonths);
    return isFinite(mo) && mo > 0 ? mo + ' mensilità' : '';
  }
  // La registrazione in parole. Alla proprietaria: ciò che BOOM ha segnato,
  // altrimenti "in verifica da BOOM" (mai "non registrato": un contratto
  // registrato e non segnato è il caso più comune dei contratti nati prima).
  function regText(reg, admin) {
    if (reg.status === 'registered') return 'registrato all\u2019Agenzia delle Entrate' + (reg.at ? ' il ' + dateIt(reg.at) : '');
    if (reg.status === 'sent') return 'in registrazione' + (reg.at ? ' · inviato il ' + dateIt(reg.at) : '');
    if (!admin) return 'in verifica da BOOM';
    return 'non segnata' + (reg.late ? ' · oltre 30 giorni dalla decorrenza' : '');
  }
  // Le leve dell'operatore sull'interno, raggruppate per mestiere: ogni tasto
  // è una funzione del portal che esiste già (nessuna seconda strada).
  // Un contratto NON firmabile (carta, segnaposto, già firmato) non offre
  // «Firma ora»; un segnaposto non offre PDF, firma, RLI, ASPI, fascicolo
  // né scheda ARPE: non c'è un contratto da cui farli — si CARICA.
  function adminActions(u, data) {
    var um = u.month, lease = um.lease || um.incoming, cid = um.contractId, reg = u.paper && u.paper.registration, A = adapter.actions || {};
    var b = function (act, label, extra, primary) { return '<button type="button" class="plz-btn' + (primary ? ' plz-primary' : '') + '" data-plz="' + act + '"' + (extra || '') + '>' + label + '</button>'; };
    var open = firstPayable(u);
    var groups = [];
    groups.push(['Soldi', b('rent', 'Gestisci canoni', ' data-id="' + esc(u.id) + '"', true) +
      (open && adapter.rataLinks ? b('rata', 'Manda il link della rata', ' data-pay="' + esc(open.id) + '" data-id="' + esc(u.id) + '" data-cid="' + esc(open.contractId || '') + '"') : open ? b('paylink', 'Link di pagamento', ' data-pay="' + esc(open.id) + '"') : '')]);
    if (lease && CS.isPlaceholder(lease)) {
      // Il segnaposto: canone e date dalla tabella («Carica il contratto»),
      // la scansione firmata come PDF se c'è già (mai Firma/RLI/ASPI: non
      // c'è ancora un contratto da firmare o registrare). Niente «Da un PDF
      // (Innesto)»: l'Innesto non crea un contratto dove c'è il segnaposto
      // (lettura Opus pagata e vicolo cieco). Si completa dalla tabella.
      groups.push(['Contratto', b('load-contract', 'Carica il contratto', ' data-id="' + esc(u.id) + '"', true) +
        (safeUrl(lease.paperPdfUrl) ? b('pdf', 'Contratto firmato (PDF)', ' data-id="' + esc(cid) + '"') : '') +
        (A.uploadPaperContract ? '<label class="plz-btn plz-file"><input type="file" accept="application/pdf" data-plz-file="paper" data-id="' + esc(cid) + '">' + (lease.paperPdfUrl ? 'Sostituisci la scansione' : 'Allega la scansione firmata (PDF)') + '</label>' : '') +
        b('contract', 'Apri il segnaposto', ' data-id="' + esc(cid) + '"')]);
    } else if (cid && lease) {
      var paper = CS.isPaper(lease), live = !/^(terminated|cancelled|canceled|closed|ended|completed|renewed)$/.test(String(lease.status || '')), started = um.lease === lease;
      var hasPdf = !!(safeUrl(lease.paperPdfUrl) || safeUrl(lease.signedPdfUrl) || safeUrl(lease.generatedPDF)) || !paper;
      groups.push(['Contratto', b('contract', 'Apri contratto', ' data-id="' + esc(cid) + '"') +
        (hasPdf ? b('pdf', paper && lease.paperPdfUrl ? 'Contratto firmato (PDF)' : 'PDF', ' data-id="' + esc(cid) + '"') : '') +
        (CS.notSignable(lease) ? '' : b('firma', 'Firma ora', ' data-id="' + esc(cid) + '"')) +
        (paper && A.uploadPaperContract ? '<label class="plz-btn plz-file"><input type="file" accept="application/pdf" data-plz-file="paper" data-id="' + esc(cid) + '">' + (lease.paperPdfUrl ? 'Sostituisci la scansione' : 'Allega contratto firmato (PDF)') + '</label>' : '') +
        (live && started && A.setRent ? b('terms', 'Cambia canone', ' data-id="' + esc(cid) + '" data-f="rent"') : '') +
        (live && started && A.applyOneri ? b('terms', 'Cambia oneri', ' data-id="' + esc(cid) + '" data-f="oneri"') : '') +
        (live && started && A.terminate ? b('terminate', 'Chiudi contratto', ' data-id="' + esc(cid) + '"') : '') +
        (ui.terms && ui.terms.cid === cid ? termsForm(lease) : '')]);
      // Già registrato all'AdE: ad ASPI si chiede SOLO l'attestazione (il
      // server risponde 409 already_registered a una seconda registrazione).
      var registered = (reg && reg.status === 'registered') || !!lease.rliRegisteredAt || lease.registrationStatus === 'registered';
      // Registrato e attestazione dichiarata NON richiesta: niente da chiedere
      // ad ASPI (il server risponde 409 not_required), la leva non c'è.
      var aspiNone = registered && lease.requiresAsseverazione === false;
      groups.push(['Registrazione', (reg && reg.status !== 'registered' ? b('rli', '✓ RLI registrato', ' data-id="' + esc(cid) + '"', !!reg.late) : '') +
        (aspiNone ? '' : b('aspi', registered ? 'Invia ad ASPI · solo attestazione' : 'Invia ad ASPI', ' data-id="' + esc(cid) + '"' + (registered ? ' title="Contratto già registrato all’AdE: ad ASPI si chiede solo l’attestazione di rispondenza"' : ''))) + b('fiscale', 'Fascicolo fiscale', ' data-id="' + esc(cid) + '"') +
        b('arpe', 'Scheda ARPE', ' data-id="' + esc(cid) + '"')]);
    }
    groups.push(['Interno', b('dossier', 'Fascicolo immobile', ' data-id="' + esc(u.id) + '"') + b('edit', 'Modifica interno', ' data-id="' + esc(u.id) + '"') +
      (u.pipeline.proposal ? '<a class="plz-btn" href="/pre-agreement-admin.html" target="_blank" rel="noopener">Proposta ' + esc(u.pipeline.proposal.ref || '') + ' ↗</a>' : '') +
      (u.pipeline.listing ? '<a class="plz-btn" href="' + esc(u.pipeline.listing.url) + '" target="_blank" rel="noopener">Annuncio ↗</a>' : '')]);
    return groups.map(function (g) { return '<div class="plz-agroup"><p class="plz-agroup-l">' + g[0] + '</p><div class="plz-agroup-b">' + g[1] + '</div></div>'; }).join('');
  }
  // Canone o oneri dalle rate da pagare in poi: il portal (applyRentFuture /
  // applyOneriFuture) rilegge contratto e rate dal server, dice cosa cambia
  // e chiede conferma. Le rate pagate non cambiano mai.
  function termsForm(lease) {
    var f = ui.terms.f, cur = f === 'rent' ? lease.rent : lease.oneriQuota;
    return '<form class="plz-terms" id="plz-terms" data-id="' + esc(ui.terms.cid) + '" data-f="' + f + '"><label><span>' + (f === 'rent' ? 'Nuovo canone mensile' : 'Nuovi oneri mensili') + ' (€)</span>' +
      '<input type="text" inputmode="decimal" name="v" value="' + esc(cur != null ? String(cur).replace('.', ',') : '') + '" autocomplete="off"></label>' +
      '<p class="plz-muted">Vale per le rate ancora da pagare: le pagate e le segnalate restano come sono. Prima di scrivere il portale ti dice quali rate cambiano.</p>' +
      '<div class="plz-mform-b"><button type="submit" class="plz-btn plz-primary plz-sm">Applica</button><button type="button" class="plz-btn plz-sm" data-plz="terms-cancel">Annulla</button></div></form>';
  }
  var PRI_LABEL = { urgent: 'Emergenza', high: 'Urgente', medium: 'Normale', low: 'Non urgente' };
  var CAT_OPTS = [['plumbing', 'Acqua / scarichi'], ['heating', 'Caldaia / riscaldamento'], ['electrical', 'Luce / prese'], ['appliance', 'Elettrodomestici'],
    ['locks', 'Porta / serratura'], ['leaks', 'Infiltrazioni / umidità'], ['common', 'Parti comuni'], ['other', 'Altro']];
  // Chi ha segnalato il guasto: nome, telefono e foto dal documento vero
  // (il motore porta solo il ruolo). Dal link /guasto arrivano nome e
  // telefono DIGITATI da chi scrive: si mostrano come tali.
  function reporterOf(x) {
    var raw = (adapter.state().maintenance || []).find(function (mt) { return String(mt.id) === x.id; }) || {};
    var rp = raw.reporter && typeof raw.reporter === 'object' ? raw.reporter : {};
    return { name: String(rp.name || raw.tenantName || '').trim().slice(0, 80), phone: String(rp.phone || '').trim().slice(0, 40), via: rp.via || '',
      photo: safeUrl(raw.photoUrl || x.photoUrl), description: String(raw.description || x.description || '').trim().slice(0, 400) };
  }
  // La manutenzione dell'interno: ciò che è aperto (urgente prima), la
  // segnalazione dalla scheda e il link per l'inquilino. Il guasto si scrive
  // sul server (/api/maintenance/guasto): così parte anche il ping all'operatore.
  function maintHTML(u, data) {
    var mt = u.maintenance || { open: [], recentClosed: [] }, admin = data.admin;
    var who = function (x) { return x.reporter === 'owner' ? (admin ? 'dalla proprietaria' : 'da te') : x.reporter === 'admin' ? 'da BOOM' : x.reporter === 'tenant' ? 'dall’inquilino' : ''; };
    var item = function (x) {
      var r = reporterOf(x), ph = r.phone ? phoneOf(r.phone) : null;
      var label = '<b>' + esc(x.title) + '</b><small>' + esc([PRI_LABEL[x.priority], x.inProgress ? 'in lavorazione' : 'aperto', x.createdAt ? 'dal ' + dateIt(x.createdAt) : '', who(x)].filter(Boolean).join(' · ')) + '</small>';
      var by = r.name || r.phone ? '<p class="plz-mwho">Segnalato da <b>' + esc(r.name || 'chi ha usato il link') + '</b>' + (r.phone ? ' · <span class="plz-num">' + esc(fmtPhone(r.phone)) + '</span>' : '') + (r.via === 'link' ? ' <small>(dal link per i guasti)</small>' : '') + '</p>' : '';
      var reach = (telOf(ph) ? '<a class="plz-btn plz-sm" href="' + esc(telOf(ph)) + '">Chiama</a>' : '') + (ph && ph.wa ? '<a class="plz-btn plz-sm" href="https://wa.me/' + esc(ph.wa) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
        (r.photo ? '<a class="plz-btn plz-sm" href="' + esc(r.photo) + '" target="_blank" rel="noopener">Foto ↗</a>' : '');
      return '<li class="plz-mitem plz-mp-' + x.priority + '">' + (admin && x.id ? '<button type="button" class="plz-mopen" data-plz="maint" data-id="' + esc(x.id) + '">' + label + '</button>' : '<span>' + label + '</span>') +
        (r.description && r.description !== x.title ? '<p class="plz-mdesc">' + esc(r.description) + '</p>' : '') + by + (reach ? '<div class="plz-reach">' + reach + '</div>' : '') + '</li>';
    };
    var list = mt.open.length ? '<ul class="plz-mlist">' + mt.open.map(item).join('') + '</ul>'
      : '<p class="plz-muted">Nessun guasto aperto' + (mt.recentClosed[0] ? ' · l’ultimo, «' + esc(mt.recentClosed[0].title) + '», è chiuso' + (mt.recentClosed[0].resolvedAt ? ' dal ' + dateIt(mt.recentClosed[0].resolvedAt) : '') : '') + '.</p>';
    var done = ui.reportDone === u.id ? '<p class="plz-okline">✓ Segnalazione inviata: BOOM l’ha ricevuta adesso.</p>' : '';
    var form = ui.reportFor === u.id ? '<form class="plz-mform" id="plz-mform" data-id="' + esc(u.id) + '">' +
      '<label><span>Di cosa si tratta</span><select name="category">' + CAT_OPTS.map(function (c) { return '<option value="' + c[0] + '"' + (ui.reportDraft.category === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Quanto è urgente</span><select name="priority">' + [['medium', 'Normale'], ['high', 'Urgente'], ['urgent', 'Emergenza']].map(function (o) { return '<option value="' + o[0] + '"' + (ui.reportDraft.priority === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="plz-mform-wide"><span>Cosa succede</span><textarea name="description" rows="3" maxlength="1200" placeholder="Es. macchia di umidità sul soffitto del bagno, si allarga">' + esc(ui.reportDraft.description) + '</textarea></label>' +
      '<p class="plz-err" id="plz-merr" role="alert"></p>' +
      '<div class="plz-mform-b"><button type="submit" class="plz-btn plz-primary plz-sm" data-plz="maint-send">Invia a BOOM</button><button type="button" class="plz-btn plz-sm" data-plz="maint-cancel">Annulla</button></div></form>' : '';
    var live = liveToday(u), url0 = live ? guastoUrlFor(u) : '';
    var reach2 = url0 ? tenantShare(u, url0) : '';
    var closedNote = u.month.contractId && adapter.links && !live ? '<p class="plz-muted plz-mclosed">Il contratto di questo mese è chiuso: il link per i guasti è di chi abita lì oggi — torna al mese corrente.</p>' : '';
    return '<p class="plz-eyebrow">Manutenzione</p>' + list + done + form +
      (ui.reportFor === u.id ? '' : '<div class="plz-actions plz-mact"><button type="button" class="plz-btn plz-sm" data-plz="maint-new" data-id="' + esc(u.id) + '">🔧 Segnala un guasto</button>' +
        (u.month.contractId && adapter.links && live ? '<button type="button" class="plz-btn plz-sm" data-plz="maint-link" data-id="' + esc(u.id) + '">Link per l’inquilino</button>' : '') + '</div>') + closedNote + reach2;
  }

  // ── I messaggi agli inquilini: in inglese di default ──────────────────
  // Gli inquilini dei palazzi sono quasi tutti stranieri: il messaggio parte
  // in inglese (si passa all'italiano con un tocco), il link porta la lingua
  // (&lang=en|it) e OGNI messaggio porta l'informativa privacy per gli
  // inquilini (art. 14 GDPR: chi tratta i loro dati) — «solo al primo» la
  // toglieva al co-intestatario appena partito il messaggio al titolare.
  var BASE = 'https://www.boomrome.com';
  var MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON_EN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthEn(m) { return /^\d{4}-\d{2}$/.test(m || '') ? MON_EN[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : ''; }
  function dateEn(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? (+d.slice(8, 10)) + ' ' + MON_EN3[+d.slice(5, 7) - 1] : ''; }
  function eurEn(v) {
    if (v == null || !Number.isFinite(Number(v))) return '';
    var n = Math.round(Number(v) * 100) / 100, int = Math.trunc(n), cents = Math.round((n - int) * 100);
    return '€' + String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (cents ? '.' + String(cents).padStart(2, '0') : '');
  }
  function withLang(url, lang) { return url ? url + (url.indexOf('?') >= 0 ? '&' : '?') + 'lang=' + lang : ''; }
  // Il link porta la lingua del messaggio: senza, la pagina segue il telefono
  // (un inquilino col telefono in inglese leggeva l'informativa in inglese
  // sotto un messaggio italiano).
  function privacyLine(lang) { return lang === 'it' ? 'Come BOOM tratta i tuoi dati: ' + BASE + '/privacy-inquilini?lang=it' : 'How BOOM handles your data: ' + BASE + '/privacy-inquilini?lang=en'; }
  function langToggle() {
    return '<div class="plz-lang" role="group" aria-label="Lingua del messaggio">' + [['en', 'English'], ['it', 'Italiano']].map(function (x) {
      return '<button type="button" data-plz="msg-lang" data-l="' + x[0] + '" aria-pressed="' + (ui.msgLang === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  // Il link /guasto apre l'interno per UN contratto vivo (il token è del
  // posto: api/maintenance/guasto.js). Il link del contratto del mese: il suo
  // (byContract), oppure il link dell'interno SOLO se il posto di oggi è quel
  // contratto — mai il link della nuova inquilina mandato a chi è uscito.
  function seatOfUnit(u) {
    if (ui.linksSeat && Object.prototype.hasOwnProperty.call(ui.linksSeat, u.id)) return ui.linksSeat[u.id];
    return u.seats ? u.seats.primary : null;
  }
  function liveToday(u) {
    var cid = u.month.contractId, by = ui.linksBy && ui.linksBy[u.id];
    return !!(cid && ((by && by[cid]) || (u.seats && u.seats.ids.indexOf(cid) >= 0) || seatOfUnit(u) === cid));
  }
  function guastoUrlFor(u) {
    var cid = u.month.contractId, by = ui.linksBy && ui.linksBy[u.id], link = ui.links && ui.links[u.id];
    if (!cid) return '';
    if (by && by[cid]) return by[cid];
    return link && seatOfUnit(u) === cid ? link : '';
  }
  // Il link del guasto, pronto da mandare: a OGNI conduttore del contratto
  // col suo WhatsApp (il link è già quello del SUO contratto, guastoUrlFor).
  function tenantShare(u, link) {
    var cid = u.month.contractId, people = contactsOfC(cid) || [], lang = ui.msgLang;
    var url = withLang(link, lang);
    var msgFor = function (name) {
      var first = firstName(name);
      return lang === 'it'
        ? (first ? 'Ciao ' + first + ', ' : 'Ciao, ') + 'per segnalare un guasto in casa (' + unitTitle(u).toLowerCase() + ') usa questo link: ' + url + ' — arriva subito a BOOM, che organizza l’intervento. In caso di pericolo chiama il 112.\n' + privacyLine('it')
        : (first ? 'Hi ' + first + ', ' : 'Hi, ') + 'to report a problem in your flat (' + (u.interno ? 'unit ' + u.interno : unitTitle(u)) + ') use this link: ' + url + ' — it goes straight to BOOM, who arranges the repair. In an emergency call 112.\n' + privacyLine('en');
    };
    var withWa = people.filter(function (p) { return p.phone && phoneOf(p.phone).wa; });
    return '<div class="plz-mlink">' + langToggle() + '<input type="text" readonly value="' + esc(url) + '" aria-label="Link per segnalare un guasto">' +
      withWa.map(function (p, k) { return '<a class="plz-btn' + (k ? '' : ' plz-primary') + ' plz-sm" href="https://wa.me/' + esc(phoneOf(p.phone).wa) + '?text=' + esc(encodeURIComponent(msgFor(p.name))) + '" target="_blank" rel="noopener">WhatsApp: ' + esc(firstName(p.name) || 'inquilino') + '</a>'; }).join('') +
      '<button type="button" class="plz-btn plz-sm" data-plz="copy-link" data-text="' + esc(msgFor((people[0] || {}).name || u.month.tenants[0] || '')) + '">Copia messaggio</button></div>';
  }
  // ── La rata in tasca all'inquilino ─────────────────────────────────────
  // UN link per rata (/rata, api/payments/rata.js): bonifico con la foto
  // della ricevuta, e la carta SOLO dove il palazzo ha il mandato all'incasso
  // (BOOM_RENT.cardPolicy). Il link lo calcola il server; il messaggio va a
  // chi DEVE quella rata (il contratto della RIGA), a ciascun intestatario.
  function payable(r) { return r && (r.state === 'due' || r.state === 'overdue') && r.amount != null && r.amount > 0 && !/^missing-id:/.test(r.id); }
  function firstPayable(u) {
    var all = (u.month.pastDue || []).concat(u.month.rows || []).filter(payable);
    return all.sort(function (a, b) { return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')); })[0] || null;
  }
  function cardOf(r, u) {
    if (!RENT || typeof RENT.cardPolicy !== 'function') return { available: false, reason: 'card_off' };
    var c = r && r.contract || (u && (u.month.lease || u.month.incoming)) || null;
    return RENT.cardPolicy((r && r.payment) || {}, c, u && u.property);
  }
  function rataText(u, r, url, name, lang, kind) {
    var who = firstName(name), card = cardOf(r, u).available;
    var late = r.state === 'overdue', what = rowKind(r), dep = what === 'deposit' && String(r.type || '').toLowerCase() === 'deposit';
    if (lang === 'it') {
      // Il saldo del deposito (o un altro addebito) non è «la rata di settembre».
      var itWhat = what === 'rent' ? 'la rata di ' + E.monthLabel(r.month).toLowerCase() : what === 'deposit' ? (dep ? 'il deposito cauzionale' : 'il saldo del deposito') : 'il pagamento';
      var fem = what === 'rent';
      var how = card ? 'Puoi pagar' + (fem ? 'la' : 'lo') + ' con carta o Apple Pay, oppure segnalare il bonifico con la foto della ricevuta, da qui: ' : 'Da qui trovi i dati per il bonifico e puoi segnalarlo con la foto della ricevuta: ';
      return (who ? 'Ciao ' + who : 'Ciao') + (kind === 'sollecito' && late ? ', ti ricordo ' : ', ecco ') + itWhat + ' (' + unitTitle(u).toLowerCase() + '): ' + eur(r.amount) +
        (r.dueDate ? (late ? (fem ? ', scaduta il ' : ', scaduto il ') : ' entro il ') + dateIt(r.dueDate) : '') + (late && kind === 'sollecito' ? ' e non ci risulta ancora arrivat' + (fem ? 'a' : 'o') : '') + '. ' + how + url + '\n' + privacyLine('it');
    }
    var enWhat = what === 'rent' ? 'the ' + monthEn(r.month) + ' rent' : what === 'deposit' ? (dep ? 'the security deposit' : 'the deposit balance') : 'the payment';
    var howEn = card ? 'You can pay by card or Apple Pay, or report your bank transfer with a photo of the receipt, here: ' : 'Here you find the bank details and can report your transfer with a photo of the receipt: ';
    return (who ? 'Hi ' + who : 'Hi') + (kind === 'sollecito' && late ? ', a reminder about ' : ', here is ') + enWhat + ' (' + (u.interno ? 'unit ' + u.interno : unitTitle(u)) + '): ' + eurEn(r.amount) +
      (r.dueDate ? (late ? ', due on ' : ', due by ') + dateEn(r.dueDate) : '') + (late && kind === 'sollecito' ? ' and we have not received it yet' : '') + '. ' + howEn + url + '\n' + privacyLine('en');
  }
  var SKIP_WHY = { already_paid: 'risulta già pagata', payment_reported: 'il bonifico è già segnalato', sdd_processing: 'addebito SEPA in corso', payment_processing: 'pagamento in corso',
    payment_cancelled: 'rata annullata', payment_not_payable: 'stato da verificare', not_found: 'rata non trovata', payment_review: 'rimborso o contestazione da verificare' };
  // L'ultimo invio registrato sulla rata (dunningHistory, scritto da
  // palazzoLogSent): lo stato «inviato» viene da lì, non dalla sessione.
  function lastSent(p) {
    var h = p && Array.isArray(p.dunningHistory) ? p.dunningHistory.filter(function (x) { return x && x.at; }) : [];
    return h.length ? h.slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); })[0] : null;
  }
  function sentText(s) {
    if (!s) return '';
    var d = E.day ? E.day(s.at) : String(s.at).slice(0, 10);
    return (s.kind === 'sollecito' ? 'sollecito' : 'link') + ' mandato il ' + dateIt(d) + (s.channel && s.channel !== 'whatsapp' ? ' (' + s.channel + ')' : '');
  }
  function rataShare(u, r) {
    var R = ui.rata, url = R.urls[r.id];
    if (R.pending[r.id]) return '<p class="plz-muted plz-rshare">Preparo il link…</p>';
    if (R.skipped[r.id]) return '<p class="plz-note plz-rshare">Link non creato: ' + esc(SKIP_WHY[R.skipped[r.id]] || R.skipped[r.id]) + '.</p>';
    if (!url) return R.failed ? '<p class="plz-note plz-rshare">Link non disponibile ora · <button type="button" class="plz-linkbtn" data-plz="rata" data-pay="' + esc(r.id) + '" data-id="' + esc(u.id) + '" data-cid="' + esc(r.contractId || '') + '">riprova</button></p>' : '';
    var lang = ui.msgLang, link = withLang(url, lang), kind = r.state === 'overdue' ? 'sollecito' : 'rata-link';
    var people = contactsOfC(r.contractId);
    var names = r.tenants && r.tenants.length ? r.tenants : u.month.tenants;
    var phones = (people || []).filter(function (p) { return p.phone; });
    var sent = lastSent(r.payment), local = R.sent[r.id];
    var btns = phones.map(function (p, k) {
      var ph = phoneOf(p.phone);
      if (!ph.wa) return '<span class="plz-warn plz-sm-note">' + esc(firstName(p.name) || 'Inquilino') + ': numero senza prefisso, correggilo</span>';
      return '<a class="plz-btn' + (k ? '' : ' plz-primary') + ' plz-sm" data-sent="' + esc(r.id) + '" data-kind="' + kind + '" data-month="' + esc(r.month || '') + '" href="https://wa.me/' + esc(ph.wa) + '?text=' + esc(encodeURIComponent(rataText(u, r, link, p.name, lang, kind))) + '" target="_blank" rel="noopener">' +
        'WhatsApp: ' + esc(firstName(p.name) || 'inquilino') + '</a>';
    }).join('');
    var status = local === 'error' ? '<p class="plz-note">Messaggio aperto, ma l’invio non è stato segnato sulla rata.</p>' : sent ? '<p class="plz-okline">✓ ' + esc(sentText(sent)) + '</p>' : local ? '<p class="plz-okline">✓ Messaggio aperto: lo segno sulla rata…</p>' : '';
    return '<div class="plz-mlink plz-rshare">' + langToggle() + '<input type="text" readonly value="' + esc(link) + '" aria-label="Link della rata">' +
      (people === undefined ? '<span class="plz-muted plz-loadc">carico i contatti…</span>' : btns || '<span class="plz-muted">Nessun telefono in archivio</span>') +
      '<button type="button" class="plz-btn plz-sm" data-plz="copy-link" data-text="' + esc(rataText(u, r, link, names[0] || '', lang, kind)) + '">Copia messaggio</button>' + status + '</div>';
  }
  function fetchRata(ids) {
    var R = ui.rata, need = ids.filter(function (id) { return !R.urls[id] && !R.pending[id]; });
    if (!need.length || typeof adapter.rataLinks !== 'function') return;
    need.forEach(function (id) { R.pending[id] = true; delete R.skipped[id]; });
    R.failed = '';
    Promise.resolve().then(function () { return adapter.rataLinks(need.slice(0, 120)); }).then(function (res) {
      need.forEach(function (id) { delete R.pending[id]; });
      Object.keys((res && res.links) || {}).forEach(function (id) { R.urls[id] = res.links[id]; });
      Object.keys((res && res.skipped) || {}).forEach(function (id) { R.skipped[id] = res.skipped[id]; });
      if (doc && doc.querySelector('.plz')) patch();
    }, function () {
      need.forEach(function (id) { delete R.pending[id]; });
      R.failed = 'error';
      if (doc && doc.querySelector('.plz')) patch();
    });
  }
  // Tutte le rate aperte del mese E quelle ancora scadute dei mesi prima:
  // una riga per rata, un tap a testa.
  function openRates(m) {
    var open = [], seen = Object.create(null);
    m.units.forEach(function (u) {
      (u.month.pastDue || []).concat(u.month.rows || []).forEach(function (r) {
        if (!payable(r) || seen[r.id] || (r.month && r.month > m.month)) return;
        seen[r.id] = 1; open.push({ u: u, r: r });
      });
    });
    return open.sort(function (a, b) { return (b.r.state === 'overdue') - (a.r.state === 'overdue') || String(a.u.interno || a.u.name).localeCompare(String(b.u.interno || b.u.name), 'it', { numeric: true }) || String(a.r.month).localeCompare(String(b.r.month)); });
  }
  function rataBar(data) {
    if (!data.admin || typeof adapter.rataLinks !== 'function' || data.m.allBefore) return '';
    var open = openRates(data.m), mon = E.monthLabel(data.m.month).toLowerCase();
    var head = '<div class="plz-export plz-ratabar"><p>Rate da pagare</p><button type="button" class="plz-btn plz-sm' + (ui.rataOpen ? '' : ' plz-primary') + '" data-plz="rata-all" aria-expanded="' + (ui.rataOpen ? 'true' : 'false') + '"' + (open.length ? '' : ' disabled') + '>' +
      (open.length ? '📨 Manda i link di ' + esc(mon) + ' · ' + open.length : 'Nessuna rata aperta in ' + esc(mon)) + '</button></div>';
    if (!ui.rataOpen || !open.length) return head;
    var sent = open.filter(function (x) { return lastSent(x.r.payment) || ui.rata.sent[x.r.id]; }).length;
    var card = open.some(function (x) { return cardOf(x.r, x.u).available; });
    return head + '<div class="plz-ratalist" id="plz-ratalist"><p class="plz-muted">Ogni messaggio porta il link della SUA rata: ' + (card ? 'carta o Apple Pay, oppure il bonifico con la ricevuta' : 'i dati per il bonifico e la segnalazione con la ricevuta (la carta è spenta finché non c’è il mandato all’incasso)') + '. Le rate scadute dei mesi prima sono in cima. Chi segnala il bonifico passa in «In attesa» finché non premi Registra incasso. Già mandati: ' + sent + ' di ' + open.length + '.</p>' +
      open.map(function (x) {
        var s = lastSent(x.r.payment);
        return '<div class="plz-rataitem' + (s || ui.rata.sent[x.r.id] ? ' is-sent' : '') + '"><p class="plz-rataitem-h"><b>' + esc(unitTitle(x.u)) + '</b> ' + esc((x.r.tenants && x.r.tenants[0]) || x.r.tenantName || x.u.month.tenants[0] || '') +
          ' · ' + esc(rowKind(x.r) === 'rent' ? E.monthLabel(x.r.month).toLowerCase() : rowName(x.r).toLowerCase()) + ' · <span class="plz-num">' + eur(x.r.amount) + '</span>' + (x.r.state === 'overdue' ? ' · <span class="plz-red">scaduta</span>' : '') + (s ? ' · <small>' + esc(sentText(s)) + '</small>' : '') + '</p>' + rataShare(x.u, x.r) + '</div>';
      }).join('') + '</div>';
  }
  function utenzeFacts(u, admin) {
    var ut = u.utenze || {}, row = function (k, code, ok) {
      if (!code) return admin ? '<div><dt>' + k + '</dt><dd class="plz-muted">non in archivio</dd></div>' : '';
      return '<div><dt>' + k + '</dt><dd class="plz-num">' + esc(code) + (ok === false ? ' <em class="plz-warn">da controllare</em>' : '') + '</dd></div>';
    };
    return row('POD luce', ut.pod, ut.podOk) + row('PDR gas', ut.pdr, ut.pdrOk);
  }
  function safeUrl(url) { try { var x = new URL(String(url || '')); return x.protocol === 'https:' ? x.href : ''; } catch (_) { return ''; } }
  // Il periodo della rata quando non è un mese di calendario (contratto dal
  // 15: la rata di settembre va dal 15/9 al 14/10).
  function periodText(r) {
    var f = r.periodFrom, t = r.periodTo;
    if (!f || !t) return '';
    var calendar = f.slice(8) === '01' && t.slice(0, 7) === f.slice(0, 7) && +t.slice(8) >= 28;
    return calendar ? '' : 'dal ' + dateIt(f) + ' al ' + dateIt(t);
  }
  // Le segnalazioni di bonifico ANNULLATE (dall'inquilino da /rata o /casa,
  // o revocate da BOOM): tenantReportWithdrawn tiene la storia. Si vedono
  // barrate e dette «annullate», MAI come una segnalazione attiva; e solo se
  // l'annullo è più recente dell'ultima segnalazione (una storia già superata
  // da una segnalazione nuova non serve). Rata pagata o annullata: niente.
  function msOf(v) {
    if (v == null || v === '') return 0;
    try {
      var t = typeof v === 'string' ? Date.parse(v) : v instanceof Date ? v.getTime() : typeof v.toDate === 'function' ? v.toDate().getTime()
        : typeof v.seconds === 'number' ? v.seconds * 1000 : typeof v._seconds === 'number' ? v._seconds * 1000 : NaN;
      return isFinite(t) ? t : 0;
    } catch (_) { return 0; }
  }
  function withdrawnLines(p, r, admin) {
    var wd = p && p.tenantReportWithdrawn;
    if (!wd || typeof wd !== 'object' || r.state === 'paid' || r.state === 'cancelled') return [];
    var wMs = msOf(wd.at), rMs = msOf(p.tenantReportedAt);
    if (!wMs || (r.state === 'reported' && rMs && wMs < rMs)) return [];
    var list = Array.isArray(wd.reports) ? wd.reports.filter(function (x) { return x && typeof x === 'object'; }) : [];
    var wDay = dateIt(E.day ? E.day(wd.at) : String(wd.at).slice(0, 10));
    var who = wd.by && wd.by !== 'tenant' ? (admin ? 'revocata da BOOM' : 'non confermata da BOOM') : 'annullata dall’inquilino';
    return (list.length ? list.slice(-3) : [{}]).map(function (x) {
      var d = /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || '')) ? x.date : '';
      return '<s>bonifico segnalato' + (d ? ' del ' + dateIt(d) : '') + '</s> · segnalazione ' + who + (wDay ? ' il ' + wDay : '') +
        (admin && wd.reason ? ' · «' + esc(String(wd.reason).slice(0, 80)) + '»' : '');
    });
  }
  var ROW_STATE = { paid: 'Pagato', overdue: 'Non pagato', due: 'Da pagare', reported: 'Segnalato · da verificare', processing: 'In corso', review: 'Rimborso/contestazione — da verificare', cancelled: 'Annullata', unknown: 'Da verificare' };
  var ROW_PILL = { overdue: 'late', reported: 'review', processing: 'review', review: 'review', cancelled: 'vacant' };
  // Una rata nella scheda: stato, come e quando è stata pagata e chi l'ha
  // visto (paidVia/paidEvidence), le segnalazioni dell'inquilino con le loro
  // ricevute, l'ultimo link mandato, e le mosse dell'operatore.
  function rowHTML(u, r, data, landlord) {
    var admin = data.admin, A0 = adapter.actions || {}, p = r.payment || {};
    var st = r.state === 'reported' && !admin ? 'In verifica da BOOM' : ROW_STATE[r.state] || 'Da verificare';
    var label = rowKind(r) !== 'rent' ? rowName(r) : r.month && r.coversTo && r.coversTo !== r.month ? E.monthLabel(r.month, true) + '→' + E.monthLabel(r.coversTo, true) : E.monthLabel(r.month);
    var subs = [], per = rowKind(r) === 'rent' ? periodText(r) : '';
    if (per) subs.push(per);
    if (r.state === 'reported') {
      var reps = Array.isArray(p.tenantReports) && p.tenantReports.length ? p.tenantReports : [{ date: p.tenantReportDate, note: p.tenantNotes, proofUrl: p.proofUrl }];
      reps.forEach(function (x, k) {
        var d = /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || '')) ? x.date : '';
        var pr = safeUrl(x.proofUrl);
        subs.push('bonifico segnalato' + (d ? ' del ' + dateIt(d) : '') + (x.note && admin ? ' · «' + esc(String(x.note).slice(0, 80)) + '»' : '') + (pr ? ' · <a href="' + esc(pr) + '" target="_blank" rel="noopener">ricevuta ' + (reps.length > 1 ? k + 1 + ' ' : '') + '↗</a>' : ''));
      });
    } else if (r.state === 'paid') {
      var how = [E.paidViaLabel ? E.paidViaLabel(r) : '', E.evidenceLabel && r.paidEvidence ? 'prova: ' + E.evidenceLabel(r).toLowerCase() : ''].filter(Boolean).join(' · ');
      subs.push((r.paidDate ? 'pagato il ' + dateIt(r.paidDate) : 'pagato') + (how ? ' · ' + esc(how) : ''));
      if (p.heldBy === 'boom') subs.push('pagato con carta — incassato da BOOM per conto di ' + esc(landlord || 'il locatore') + ', da riversare');
    } else if (r.state === 'review') {
      var mb = RENT && RENT.moneyBack ? RENT.moneyBack(p) : '';
      // Alla proprietaria cosa succede, mai un'istruzione dell'operatore.
      subs.push(admin ? (mb === 'refund' ? 'rimborsata con carta: verifica con l’inquilino' : 'contestazione aperta sulla carta: BOOM risponde a Stripe')
        : (mb === 'refund' ? 'pagamento con carta rimborsato: lo sta verificando BOOM' : 'contestazione sul pagamento con carta: la segue BOOM'));
    } else if (r.state === 'cancelled') {
      var whyC = String(p.cancelledReason || '').trim().slice(0, 120), atC = E.day ? E.day(p.cancelledAt) : '';
      subs.push('annullata' + (atC ? ' il ' + dateIt(atC) : '') + (whyC ? ' · ' + esc(whyC) : '') + ': non è dovuta');
    } else if (r.dueDate) subs.push((r.state === 'overdue' ? 'scaduta il ' : 'scadenza ') + dateIt(r.dueDate) + (r.days ? ' · ' + r.days + (r.days === 1 ? ' giorno' : ' giorni') : ''));
    withdrawnLines(p, r, admin).forEach(function (x) { subs.push(x); });
    var s = admin ? lastSent(p) : null;
    if (s) subs.push(sentText(s));
    var manual = r.state === 'paid' && !(p.stripeSessionId || p.sddPiId || p.bankTxId) && (['stripe', 'sepa', 'bank'].indexOf(String(p.paidVia || '')) < 0 || !!p.paidRecordedBy);
    var acts = (safeUrl(r.receiptUrl) ? '<a class="plz-btn plz-sm" href="' + esc(safeUrl(r.receiptUrl)) + '" target="_blank" rel="noopener">Ricevuta ↗</a>' : '') +
      (admin && payable(r) && adapter.rataLinks ? '<button type="button" class="plz-btn plz-sm' + (r.state === 'overdue' ? ' plz-primary' : '') + '" data-plz="rata" data-pay="' + esc(r.id) + '" data-id="' + esc(u.id) + '" data-cid="' + esc(r.contractId || '') + '">Manda il link</button>' : '') +
      (admin && (payable(r) || r.state === 'reported') && A0.record ? '<button type="button" class="plz-btn plz-sm" data-plz="record" data-pay="' + esc(r.id) + '">Registra incasso</button>' : '') +
      (admin && manual && A0.undoRecord ? '<button type="button" class="plz-btn plz-sm" data-plz="undo-record" data-pay="' + esc(r.id) + '">Annulla incasso</button>' : '');
    return '<li data-pay="' + esc(r.id) + '"><span>' + esc(label) + '</span><b class="plz-num">' + eur(r.amount) + (Number(p.oneriAmount) > 0 ? '<small>di cui oneri ' + eur(Number(p.oneriAmount)) + '</small>' : '') + '</b><em class="plz-pill plz-s-' + (ROW_PILL[r.state] || r.state) + '">' + esc(st) + '</em>' +
      (subs.length ? '<small>' + subs.join('<br>') + '</small>' : '') +
      (acts ? '<div class="plz-rowact">' + acts + '</div>' : '') + (admin && ui.rata.open === r.id ? rataShare(u, r) : '') + '</li>';
  }
  // I documenti CONDIVISI degli interni (scansione del contratto, ricevuta
  // RLI…): letti una volta per palazzo (adapter.documents), mai uno non
  // condiviso alla proprietaria.
  function ensureDocs(m) {
    if (!adapter || typeof adapter.documents !== 'function' || !m || !m.building) return;
    var key = m.building.key, D = ui.docs;
    if (D[key] || D['~' + key]) return;
    D['~' + key] = 'pending';
    Promise.resolve().then(function () { return adapter.documents(m.building.propertyIds.slice()); }).then(function (rows) {
      D[key] = Array.isArray(rows) ? rows : []; delete D['~' + key];
      if (doc && doc.querySelector('.plz')) patch();
    }, function () { D[key] = 'error'; delete D['~' + key]; if (doc && doc.querySelector('.plz')) patch(); });
  }
  function docsHTML(u, data) {
    var key = data.m.building.key, all = ui.docs[key];
    if (all === 'error') return '<p class="plz-eyebrow">Documenti</p><p class="plz-muted">Documenti non raggiungibili ora. <button type="button" class="plz-link" data-plz="docs-retry">Riprova</button></p>';
    if (!Array.isArray(all)) return typeof adapter.documents === 'function' ? '<p class="plz-eyebrow">Documenti</p><p class="plz-muted plz-loading">carico i documenti…</p>' : '';
    var mine = all.filter(function (d) { return d.propertyId === u.id && safeUrl(d.fileUrl || d.url); });
    if (!mine.length) return '';
    return '<p class="plz-eyebrow">Documenti condivisi da BOOM</p><ul class="plz-docs">' + mine.slice(0, 8).map(function (d) {
      var at = E.day ? E.day(d.createdAt || d.uploadedAt || d.date) : '';
      return '<li><a href="' + esc(safeUrl(d.fileUrl || d.url)) + '" target="_blank" rel="noopener">' + esc(String(d.name || d.fileName || 'Documento').slice(0, 80)) + ' ↗</a>' + (at ? '<small>' + dateIt(at) + '</small>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function pdfUrlOf(lease) {
    if (!lease || CS.isPlaceholder(lease)) return '';
    return safeUrl(lease.paperPdfUrl) || safeUrl(lease.signedPdfUrl) || safeUrl(lease.generatedPDF);
  }
  // La carta su /rata per questo interno, in parole (solo admin).
  function cardText(u, lease) {
    var c = RENT && RENT.cardPolicy ? RENT.cardPolicy({}, lease, u.property) : null;
    if (!c) return '';
    if (!c.imported) return 'accesa (contratto non preso in carico: incassa BOOM)';
    if (c.available) return 'accesa · mandato del ' + dateIt(c.mandateAt) + (c.fee === 'surcharge' ? ' · commissione all’inquilino' : ' · commissione a carico di BOOM');
    return c.reason === 'no_mandate' ? 'spenta: manca la data del mandato all’incasso' : 'spenta: l’inquilino vede solo il bonifico al locatore';
  }
  function unitPanel(u, data, enter) {
    var m = data.m, um = u.month, admin = data.admin;
    var lease = um.lease || um.incoming;
    var landlord = String(um.landlordName || (lease && lease.landlordName) || '').trim();
    var rows = um.rows.concat(um.waivedRows || []).map(function (r) { return rowHTML(u, r, data, landlord); }).join('');
    var past = (um.pastDue || []).map(function (r) { return rowHTML(u, r, data, (r.contract && r.contract.landlordName) || landlord); }).join('');
    var pdf = pdfUrlOf(lease);
    var actions = admin ? adminActions(u, data)
      : (pdf ? '<a class="plz-btn" href="' + esc(pdf) + '" target="_blank" rel="noopener">Contratto (PDF) ↗</a>' : '') +
        '<button type="button" class="plz-btn plz-primary" data-plz="inbox" data-id="' + esc(u.id) + '">Scrivi a BOOM su WhatsApp</button>' +
        '<button type="button" class="plz-btn" data-plz="inbox" data-ch="email" data-id="' + esc(u.id) + '">Email a BOOM</button>';
    var pp = u.paper, reg = pp && pp.registration;
    var exp = um.leaseEnd ? expiry(um.leaseEnd, m.today) : um.state === 'incoming' && um.leaseStart ? startsIn(um.leaseStart, m.today) : '';
    var kind = leaseType(lease), dep = depositOf(lease);
    var oneri = lease && Number(lease.oneriQuota) > 0 ? Number(lease.oneriQuota) : 0;
    var iban = lease ? String(lease.landlordIban || '').replace(/\s+/g, '').toUpperCase() : '';
    iban = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) ? iban.replace(/(.{4})/g, '$1 ').trim() : '';
    var placeholder = lease && CS.isPlaceholder(lease);
    return '<div class="plz-pcard plz-unitcard' + (enter ? ' is-enter' : '') + '"><button type="button" class="plz-close" data-plz="deselect" aria-label="Chiudi la scheda">×</button>' +
      '<p class="plz-eyebrow">' + esc(unitWhere(u)) + '</p><h2 id="plz-unit-h" tabindex="-1">' + esc(unitTitle(u)) + '</h2>' +
      '<span class="plz-pill plz-s-' + um.state + ' plz-big">' + esc(stateLabel(um, m.month, m.currentMonth)) + ' · ' + esc(E.monthLabel(m.month).toLowerCase()) + '</span>' +
      (u.ownerMismatch && admin ? '<p class="plz-note">Non collegato al profilo di ' + esc(m.owner && (m.owner.name || m.owner.email) || 'proprietaria') + ': dal suo accesso non lo vede.</p>' : '') +
      (um.contractId ? peopleHTML(u, data) : '<p class="plz-people-names plz-muted">' + (um.state === 'vacant' ? 'Libero' + (u.time && u.time.vacantDays != null ? ' da ' + u.time.vacantDays + (u.time.vacantDays === 1 ? ' giorno' : ' giorni') : '') : um.state === 'before' ? 'Prima della gestione BOOM' : esc(um.tenants.join(' · ') || '—')) + '</p>') +
      (placeholder ? '<p class="plz-note">' + (admin ? 'Contratto non ancora in archivio: canone, date e rate arrivano quando lo carichi.' : 'Contratto in arrivo da BOOM: canone e scadenze compariranno qui.') + '</p>' : '') +
      (um.leaseStart || um.leaseEnd ? '<div class="plz-term' + (um.leaving ? ' is-leaving' : '') + '"><p class="plz-term-k">' + esc(kind || 'Contratto') + (lease && CS.isPaper(lease) ? ' · firmato su carta' : '') + '</p><p class="plz-term-d">' + esc((um.leaseStart ? 'dal ' + dateIt(um.leaseStart) : '') + (um.leaseEnd ? ' al ' + dateIt(um.leaseEnd) : '')) + '</p>' + (exp ? '<p class="plz-term-x">' + esc(exp) + '</p>' : '') + noticeText(u, admin) + '</div>' : '') +
      '<dl class="plz-facts">' +
      '<div><dt>Canone</dt><dd class="plz-num">' + (um.rent != null ? eur(um.rent) + ' / mese' : placeholder ? '<span class="plz-muted">' + (admin ? 'da caricare col contratto' : 'in arrivo col contratto') + '</span>' : '—') + '</dd></div>' +
      (oneri ? '<div><dt>Oneri accessori</dt><dd class="plz-num">' + eur(oneri) + ' / mese <small>insieme al canone</small></dd></div>' : '') +
      (dep ? '<div><dt>Deposito</dt><dd class="plz-num">' + esc(dep) + '</dd></div>' : '') +
      (landlord ? '<div><dt>Locatore</dt><dd>' + esc(landlord.slice(0, 120)) + '</dd></div>' : '') +
      // Il conto del bonifico su /rata: del locatore SOLO sui contratti presi
      // in carico dal Palazzo; un contratto digitale paga sul conto BOOM (lo
      // stesso di /casa) — il landlordIban che porta non è il conto dei canoni.
      (admin && lease ? '<div><dt>Conto per il bonifico</dt><dd' + (!CS.isImported(lease) ? ' class="plz-muted">conto BOOM (contratto digitale, come /casa)'
        : iban ? ' class="plz-num">' + esc(iban) : ' class="plz-muted">non in archivio: la pagina della rata dice «il conto di sempre»') + '</dd></div>' : '') +
      (admin && lease ? '<div><dt>Carta su /rata</dt><dd>' + esc(cardText(u, lease)) + '</dd></div>' : '') +
      (reg ? '<div><dt>Registrazione</dt><dd class="' + (admin && reg.late ? 'plz-red' : '') + '">' + esc(regText(reg, admin)) + '</dd></div>' : '') +
      (pp && (pp.cedolare != null || admin) ? '<div><dt>Cedolare secca</dt><dd>' + (pp.cedolare === true ? 'sì' : pp.cedolare === false ? 'no' : 'non indicata nel contratto') + '</dd></div>' : '') +
      '<div><dt>Arretrati</dt><dd class="plz-num' + (u.arrears.amount ? ' plz-red' : '') + '">' + (u.arrears.count ? (u.arrears.amount ? eur(u.arrears.amount) : 'importo da verificare') + ' · ' + (itemsText(u.arrears.rows) || u.arrears.count + (u.arrears.count === 1 ? ' rata' : ' rate')) + (u.arrears.oldest ? ' dal ' + dateIt(u.arrears.oldest) : '') : 'Nessuno') + '</dd></div>' +
      '<div><dt>Puntualità</dt><dd>' + esc(placeholder && !(u.time && (u.time.paidCount || u.time.overdueCount)) ? '—' : punctuality(u.time)) + '</dd></div>' +
      '<div><dt>12 mesi</dt><dd>' + esc(occupiedText(u.time)) + '</dd></div>' +
      (admin && (u.pipeline.proposal || u.pipeline.listing) ? '<div><dt>In corso</dt><dd>' + esc(pipelineText(u)) + '</dd></div>' : '') +
      utenzeFacts(u, admin) +
      '</dl>' + docsHTML(u, data) + maintHTML(u, data) + '<p class="plz-eyebrow">Ultimi 12 mesi</p>' + stripHTML(u, m.month, m.currentMonth) +
      '<p class="plz-eyebrow">Rate di ' + esc(E.monthLabel(m.month).toLowerCase()) + '</p>' + (rows ? '<ul class="plz-rows">' + rows + '</ul>' : '<p class="plz-muted">' + (um.state === 'before' ? 'Prima della gestione BOOM (da ' + esc(E.monthLabel(um.gestioneDal).toLowerCase()) + '): i pagamenti di questo mese non sono in archivio.' : placeholder ? (admin ? 'Nessuna rata: arrivano quando carichi il contratto.' : 'Le rate compariranno quando BOOM carica il contratto.') : um.occupied ? 'Nessuna rata registrata per questo mese.' : 'Nessun contratto in questo mese.') + '</p>') +
      (past ? '<p class="plz-eyebrow plz-red-eyebrow">Ancora da pagare dai mesi prima</p><ul class="plz-rows">' + past + '</ul>' : '') +
      '<div class="plz-actions">' + actions + '</div></div>';
  }
  // La disdetta del contratto in corso, quando il termine si avvicina.
  function noticeText(u, admin) {
    var n = u.notice;
    if (!n || !n.by || n.terminated || n.received || !u.month.leaving) return '';
    var t = n.passed ? 'termine per la disdetta passato il ' + dateIt(n.by) : 'disdetta entro il ' + dateIt(n.by);
    var r = n.renews === 'tacito' ? ': senza disdetta si rinnova da solo' : n.renews === 'proroga' ? ': si proroga di diritto' : n.renews === 'rinnovo' ? ': si rinnova' : '';
    return '<p class="plz-term-n">' + esc(t + r + (admin && n.assumed ? ' (termine ipotizzato, verifica sul contratto)' : '')) + '</p>';
  }

  // ── Semplice: il mese in una schermata ───────────────────────────────
  // La frase del mese (scritta dai numeri), la facciata del palazzo di sera
  // e gli elenchi con UN'azione per riga. Nessun grafico da leggere.
  //
  // La facciata: ogni interno è una finestra e la LUCE è lo stato del mese
  // (oro pagato, rosso non ha pagato, avorio deve pagare, blu in verifica,
  // menta in arrivo a persiane socchiuse). Libero = persiane CHIUSE. Le
  // finestre senza numero sono di interni che BOOM non gestisce. Intonaco,
  // persiane, ultimo piano e nome vengono da m.look: solo ciò che qualcuno
  // ha dichiarato, il resto è neutro. La posizione degli interni sul piano
  // è schematica, e la didascalia lo dice.
  function frame() { return '<span class="plz-win-frame" aria-hidden="true"><span class="plz-win-glass"></span><span class="plz-shut plz-shut-l"></span><span class="plz-shut plz-shut-r"></span></span>'; }
  function win(u, k) {
    var s = u.month.state, pipe = pipeOf(u);
    return '<button type="button" class="plz-win' + (u.id === ui.selected ? ' is-sel' : '') + (matches(ui.filter, s) ? '' : ' is-dim') + '" style="--bi:' + k + '" data-plz="select" data-id="' + esc(u.id) + '" data-state="' + s + '"' + (pipe ? ' data-pipe="' + pipe + '"' : '') + maintAttr(u) + ' aria-label="' + esc(unitLabel(u)) + '">' +
      frame() + '<span class="plz-win-plate"><b>' + esc(u.interno || '•') + '</b><em aria-hidden="true">' + (GLYPH[s] || '') + '</em></span></button>';
  }
  function blind(k) { return '<span class="plz-win is-blind" style="--bi:' + k + '" aria-hidden="true">' + frame() + '<span class="plz-win-plate"></span></span>'; }
  function lookStyle(look) {
    var I = E.LOOKS.intonaco[look.intonaco] || E.LOOKS.intonaco[E.LOOK_DEFAULT.intonaco];
    var P = E.LOOKS.persiane[look.persiane] || E.LOOKS.persiane[E.LOOK_DEFAULT.persiane];
    return '--wall:' + I[1] + ';--shut:' + P[1];
  }
  // La legenda: i quattro toni, più «Prima di BOOM» SOLO quando nel mese
  // c'è (e si riscrive al cambio mese, insieme alla luce delle finestre).
  function keysHTML(m) {
    return E.TONES.filter(function (t) { return t.key === 'prima' ? m.totals.before : t.key === 'annullata' ? m.totals.waived : true; }).map(function (t) {
      return '<span class="plz-key" data-state="' + t.states[0] + '"><i></i>' + t.label + '</span>';
    }).join('');
  }
  function facade(data) {
    var m = data.m, look = m.lookView || m.look, floors = m.floors;
    var isAttic = function (f) { return f.label === 'Attico'; };
    var n = Math.max(2, floors.reduce(function (x, f) { return isAttic(f) ? x : Math.max(x, f.units.length); }, 0));
    var attic = floors.length && isAttic(floors[floors.length - 1]) ? floors[floors.length - 1] : null;
    var row = function (f) {
      var fi = floors.indexOf(f), ground = f.n === 0;
      var cells = f.units.map(function (u, k) { return win(u, k); });
      var cols = f === attic ? Math.max(1, f.units.length) : n;
      for (var k = cells.length; k < cols; k++) cells.push(blind(k));
      if (ground) {
        cells.splice(Math.floor(cells.length / 2), 0, '<span class="plz-portone" aria-hidden="true">' + (look.civic ? '<i class="plz-civ">' + esc(look.civic) + '</i>' : '') + '<span class="plz-door"></span></span>');
        cols++;
      }
      return '<div class="plz-fac-fl' + (f === attic ? ' is-attic' : '') + (ground ? ' is-ground' : '') + (f.ghost ? ' is-ghost' : '') + '" style="--fi:' + fi + ';--cols:' + cols + '">' +
        '<span class="plz-fac-lab" title="' + esc(f.label + (f.ghost ? ' · non gestito da BOOM' : '')) + '">' + esc(f.short) + '</span>' +
        (ground && look.street ? '<span class="plz-targa" aria-hidden="true">' + esc(look.street) + '</span>' : '') +
        '<div class="plz-fac-bays">' + cells.join('') + '</div></div>';
    };
    var regular = floors.filter(function (f) { return f !== attic; }).slice().reverse();
    var intro = !ui.facIntro[m.building.key] && !ui.draft;
    // Il volume: la facciata è la faccia davanti di un palazzo vero — fianchi,
    // tetto a terrazza, attico arretrato, la strada come piano. I fianchi sono
    // CIECHI di proposito: dove stanno le finestre laterali non lo sappiamo.
    var sides = '<i class="plz-fac-side is-r" aria-hidden="true"></i><i class="plz-fac-side is-l" aria-hidden="true"></i><i class="plz-fac-top" aria-hidden="true"></i>';
    return '<figure class="plz-facade' + (intro ? ' is-intro' : '') + '" id="plz-fac" style="' + lookStyle(look) + ';--n:' + n + '" aria-label="' + esc('La facciata di ' + (look.name || m.building.label) + ': una finestra per interno') + '">' +
      '<div class="plz-fac-stage" id="plz-fac-stage" tabindex="0" aria-label="Il palazzo in 3D: trascina o usa le frecce per girarlo">' +
      '<div class="plz-fac-body" id="plz-fac-body" style="--fy:' + ui.fy + 'deg;--fx:' + ui.fx + 'deg">' +
      '<div class="plz-fac-bld">' +
      (attic ? '<div class="plz-fac-attic"><div class="plz-fac-roof is-small" aria-hidden="true"></div>' + row(attic) + sides + '</div>' : '') +
      '<div class="plz-fac-main"><div class="plz-fac-roof" aria-hidden="true">' + (look.name ? '<span>' + esc(look.name) + '</span>' : '') + '</div>' +
      regular.map(row).join('') + sides + '</div>' +
      '<div class="plz-fac-ground" aria-hidden="true"></div>' +
      '</div></div></div>' +
      (m.unplaced.length ? '<div class="plz-fac-yard"><p>' + (data.admin ? 'Senza piano · indicalo dalla scheda' : 'Posizione sul piano in verifica da BOOM') + '</p><div class="plz-fac-bays" style="--cols:' + Math.min(6, Math.max(2, m.unplaced.length)) + '">' + m.unplaced.map(function (u, k) { return win(u, k); }).join('') + '</div></div>' : '') +
      '<figcaption class="plz-fac-cap"><span class="plz-keys" id="plz-keys">' + keysHTML(m) + '</span>' +
      '<small>Una finestra per interno; la posizione sul piano è schematica e i fianchi sono ciechi. Finestre senza numero: interni non gestiti da BOOM. Trascina per girare il palazzo.' +
      (data.admin && !(look.declared.intonaco || look.declared.persiane) && !ui.draft ? ' Aspetto neutro: imposta intonaco e persiane veri qui sotto.' : '') + '</small></figcaption></figure>';
  }

  // ── La carta su /rata, per palazzo (solo admin) ───────────────────────
  // Con la carta i soldi arrivano sul conto Stripe di BOOM, non su quello
  // del locatore: per gli interni presi in carico la carta resta SPENTA
  // finché non c'è un mandato all'incasso con la sua data (la regola è
  // BOOM_RENT.cardPolicy, la stessa di /rata e del link di pagamento).
  // La commissione di default è a carico di BOOM: il sovrapprezzo verso un
  // consumatore è vietato (art. 62 Cod. consumo) salvo parere legale.
  function cardCfgOf(m) {
    var cfgs = m.units.map(function (u) { return u.property && u.property.rataCard && typeof u.property.rataCard === 'object' ? u.property.rataCard : null; });
    var key = function (c) { return c ? [c.on === true, c.mandateAt || '', c.fee || 'absorbed', c.note || ''].join('|') : '-'; };
    var mixed = cfgs.some(function (c) { return key(c) !== key(cfgs[0]); });
    return { cfg: cfgs.find(Boolean) || null, mixed: mixed };
  }
  // Cosa vede l'inquilino su /rata con la bozza dell'interruttore. Per i
  // contratti NON presi in carico la carta c'è già (incassa BOOM): l'interruttore
  // vale solo per quelli presi in carico dalla tabella, e lo si dice.
  function cardEffect(d, sum) {
    var other = sum && sum.notImported ? (sum.notImported === 1 ? ' L’altro interno, non preso in carico, ha già la carta su /rata (incassa BOOM).' : ' Gli altri ' + sum.notImported + ' interni, non presi in carico, hanno già la carta su /rata (incassa BOOM).') : '';
    if (sum && sum.any && !sum.imported) return 'Contratti non presi in carico: su /rata la carta c’è già (incassa BOOM). Questo interruttore vale per gli interni presi in carico dalla tabella.';
    return (!d.on ? 'Su /rata gli inquilini degli interni presi in carico vedono solo il bonifico al conto del locatore.'
      : !d.mandateAt ? 'Senza la data del mandato la carta resta SPENTA anche con l’interruttore acceso.'
      : 'Su /rata compare anche la carta (Apple Pay compreso): i soldi arrivano a BOOM, che li riversa al locatore.') + other;
  }
  // La carta su /rata del palazzo: TUTTI gli interni con un contratto, non il
  // primo (un palazzo può avere interni presi in carico e altri no).
  function cardSummary(m) {
    var pols = m.units.map(function (u) { var c = u.month.lease || u.month.incoming; return c && RENT && RENT.cardPolicy ? RENT.cardPolicy({}, c, u.property) : null; }).filter(Boolean);
    var imp = pols.filter(function (p) { return p.imported; });
    return { any: pols.length, imported: imp.length, notImported: pols.length - imp.length, first: imp[0] || null };
  }
  function cardPanel(data) {
    var A = adapter.actions || {};
    if (!data.admin || !A.saveRataCard) return '';
    var m = data.m, cur = cardCfgOf(m), c = cur.cfg || {};
    var d = ui.cardDraft && ui.cardDraft.key === m.building.key ? ui.cardDraft : { key: m.building.key, on: c.on === true, mandateAt: /^\d{4}-\d{2}-\d{2}$/.test(String(c.mandateAt || '')) ? c.mandateAt : '', note: c.note || '', fee: c.fee === 'surcharge' ? 'surcharge' : 'absorbed' };
    var sum = cardSummary(m), pol = sum.first;
    var state = !sum.any ? 'nessun contratto' : !pol ? 'accesa (contratti non presi in carico)' : (pol.available ? 'accesa' : pol.reason === 'no_mandate' ? 'spenta · manca la data del mandato' : 'spenta') + (sum.notImported ? ' per i presi in carico' : '');
    var effect = cardEffect(d, sum);
    return '<details class="plz-look plz-card" id="plz-card"' + (ui.cardOpen ? ' open' : '') + '><summary>Pagamento con carta su /rata <em class="plz-warn" id="plz-card-badge">' + esc(state) + '</em></summary>' +
      '<p class="plz-look-note">Con la carta i soldi arrivano sul conto Stripe di BOOM, non su quello del locatore: serve un mandato all’incasso scritto e un riversamento registrato. Si salva su tutti gli interni del palazzo.' + (cur.mixed ? ' <b>Oggi gli interni hanno impostazioni diverse.</b>' : '') + '</p>' +
      '<label class="plz-check"><input type="checkbox" data-card="on"' + (d.on ? ' checked' : '') + '> Carta accesa su /rata</label>' +
      '<div class="plz-look-row"><label class="plz-look-f"><span>Mandato all’incasso firmato il</span><input type="date" data-card="mandateAt" value="' + esc(d.mandateAt) + '"></label>' +
      '<label class="plz-look-f"><span>Nota (riferimento del mandato)</span><input type="text" maxlength="200" data-card="note" value="' + esc(d.note) + '"></label></div>' +
      '<fieldset class="plz-look-sw plz-fee"><legend>Commissione della carta</legend>' +
      '<label><input type="radio" name="plz-card-fee" value="absorbed" data-card="fee"' + (d.fee !== 'surcharge' ? ' checked' : '') + '> A carico di BOOM (consigliato): l’inquilino paga solo la rata</label>' +
      '<label><input type="radio" name="plz-card-fee" value="surcharge" data-card="fee"' + (d.fee === 'surcharge' ? ' checked' : '') + '> All’inquilino</label>' +
      '<p class="plz-note">Il sovrapprezzo sui pagamenti verso i consumatori è vietato (art. 62 Codice del consumo; art. 3 c. 4 d.lgs. 11/2010): sceglilo solo dopo un parere legale.</p></fieldset>' +
      '<p class="plz-muted" id="plz-card-effect">' + esc(effect) + '</p>' +
      '<div class="plz-look-act"><button type="button" class="plz-btn plz-primary plz-sm" data-plz="card-save">Salva sul palazzo</button>' + (ui.cardDraft ? '<button type="button" class="plz-btn plz-sm" data-plz="card-cancel">Annulla</button>' : '') + '</div></details>';
  }

  // L'aspetto del palazzo, solo admin: si dichiara ciò che si è visto (foto,
  // sopralluogo) e si salva su TUTTI gli interni del palazzo. L'anteprima è
  // dal vivo; la scrittura parte solo da "Salva", con conferma.
  function lookPanel(data) {
    var m = data.m, look = m.look, d = ui.draft || {};
    var sw = function (kind, key) {
      var val = E.LOOKS[kind][key], cur = d[kind] != null ? d[kind] : (look.declared[kind] ? look[kind] : '');
      return '<label class="plz-sw" title="' + esc(val[0]) + '"><input type="radio" name="plz-look-' + kind + '" value="' + key + '" data-look="' + kind + '"' + (cur === key ? ' checked' : '') + '><i style="--sw:' + val[1] + '"></i><span>' + esc(val[0]) + '</span></label>';
    };
    var top = d.ultimoPiano != null ? d.ultimoPiano : (look.topFloor || '');
    var nome = d.nome != null ? d.nome : look.name;
    return '<details class="plz-look" id="plz-look"' + (ui.draft || ui.lookOpen ? ' open' : '') + '><summary>Aspetto del palazzo <em class="plz-warn" id="plz-look-badge">' + lookBadge(look) + '</em></summary>' +
      '<p class="plz-look-note">Disegna solo ciò che hai visto, dalla foto o dal sopralluogo. Si salva su tutti gli interni del palazzo.</p>' +
      '<div class="plz-look-row"><label class="plz-look-f"><span>Nome · facoltativo</span><input type="text" maxlength="60" data-look="nome" value="' + esc(nome) + '"></label>' +
      '<label class="plz-look-f plz-look-n"><span>Ultimo piano</span><input type="number" min="1" max="40" step="1" inputmode="numeric" data-look="ultimoPiano" value="' + esc(top) + '" aria-describedby="plz-look-nh"></label></div>' +
      '<p class="plz-look-hint" id="plz-look-nh">Il numero dell’ultimo piano, attico compreso.</p>' +
      '<fieldset class="plz-look-sw"><legend>Intonaco</legend>' + Object.keys(E.LOOKS.intonaco).map(function (k) { return sw('intonaco', k); }).join('') + '</fieldset>' +
      '<fieldset class="plz-look-sw"><legend>Persiane</legend>' + Object.keys(E.LOOKS.persiane).map(function (k) { return sw('persiane', k); }).join('') + '</fieldset>' +
      '<p class="plz-look-err" id="plz-look-err" role="alert"></p>' +
      '<div class="plz-look-act" id="plz-look-act">' + lookActions() + '</div></details>';
  }
  function lookBadge(look) { return ui.draft ? 'anteprima' : look.declared.intonaco || look.declared.persiane ? 'dichiarato' : 'neutro'; }
  function lookActions() {
    return '<button type="button" class="plz-btn plz-primary plz-sm" data-plz="look-save"' + (ui.draft ? '' : ' disabled') + '>Salva sul palazzo</button>' +
      (ui.draft ? '<button type="button" class="plz-btn plz-sm" data-plz="look-cancel">Annulla</button>' : '');
  }
  // Solo ciò che l'admin ha davvero cambiato: toccare l'ultimo piano non
  // dichiara un intonaco che nessuno ha scelto.
  function lookChanges(m) {
    var d = ui.draft || {}, look = m.look, out = {};
    if (d.intonaco != null && (d.intonaco !== look.intonaco || !look.declared.intonaco)) out.intonaco = d.intonaco;
    if (d.persiane != null && (d.persiane !== look.persiane || !look.declared.persiane)) out.persiane = d.persiane;
    if (d.nome != null && String(d.nome).trim() !== look.name) out.nome = String(d.nome).trim();
    if (d.ultimoPiano != null && String(d.ultimoPiano).trim() !== '' && String(d.ultimoPiano).trim() !== String(look.topFloor || '')) out.ultimoPiano = String(d.ultimoPiano).trim();
    return out;
  }
  function lookError(errors) {
    return errors.map(function (e) {
      if (e === 'intonaco' || e === 'persiane') return 'Colore non valido.';
      if (e === 'nome') return 'Il nome sta in 60 caratteri.';
      if (e === 'ultimoPiano') return 'L’ultimo piano è un numero intero da 1 a 40.';
      var need = /^ultimoPiano<(\d+)$/.exec(e);
      if (need) return 'Un interno gestito arriva al ' + E.floorLabel(+need[1]).toLowerCase() + ': l’ultimo piano non può essere più basso di ' + need[1] + '.';
      return 'Valore non valido.';
    }).join(' ');
  }

  function briefHTML(data) {
    var m = data.m, b = m.brief || [];
    // Un mese tutto prima della gestione: la frase è UNA, qui (le schede
    // sotto non la ripetono).
    if (m.allBefore) return '<div class="plz-brief"><p class="plz-eyebrow">' + esc(E.monthLabel(m.month)) + ' in breve</p><p class="plz-lead plz-before-line">' + esc(beforeLine(m)) + '</p></div>';
    var lead = (b[0] || '').replace(/^[^:]+:\s*/, '');
    return '<div class="plz-brief"><p class="plz-eyebrow">' + esc(E.monthLabel(m.month)) + ' in breve</p><p class="plz-lead">' + esc(lead.charAt(0).toUpperCase() + lead.slice(1)) + '</p>' +
      (b.length > 1 ? '<p class="plz-rest">' + esc(b.slice(1).join(' ')) + '</p>' : '') + '</div>';
  }
  function cards(data) {
    var m = data.m, admin = data.admin, by = function (states) { return m.units.filter(function (u) { return states.indexOf(u.month.state) >= 0 && !isCarried(u); }); };
    var debt = debtorsOf(m), t = m.totals;
    var due = by(['due']), check = by(['review', 'norate', 'unknown']), free = by(['vacant']), coming = by(['incoming']), paid = by(['paid']);
    var carried = m.units.filter(isCarried), waived = by(['waived']);
    var row = function (u, right, note, action, who, dot) {
      return '<div class="plz-srow"><button type="button" class="plz-line" data-plz="select" data-id="' + esc(u.id) + '"><i class="plz-s-' + (dot || u.month.state) + '" aria-hidden="true"></i><span><b>' + esc(unitTitle(u)) + '</b> ' + esc(who != null ? who : u.month.tenants[0] || '') + (note ? '<small>' + esc(note) + '</small>' : '') + '</span><em>' + right + '</em></button>' + (action || '') + '</div>';
    };
    // Sollecita: la rata scaduta più vecchia CON importo (payRow) del
    // contratto del debito, mandata a chi la deve (data-cid).
    var sollecita = function (x) {
      var r = x.d.payRow;
      if (!admin || !r) return '';
      return adapter.rataLinks ? '<button type="button" class="plz-btn plz-primary plz-sm" data-plz="rata" data-kind="sollecito" data-pay="' + esc(r.id) + '" data-id="' + esc(x.u.id) + '" data-cid="' + esc(x.d.contractId || '') + '">Sollecita</button>'
        : '<button type="button" class="plz-btn plz-primary plz-sm" data-plz="paylink" data-pay="' + esc(r.id) + '">Sollecita</button>';
    };
    var manda = function (u) {
      var r = u.month.rows.find(function (x) { return x.state === 'due'; });
      return admin && r && payable(r) && adapter.rataLinks ? '<button type="button" class="plz-btn plz-sm" data-plz="rata" data-pay="' + esc(r.id) + '" data-id="' + esc(u.id) + '" data-cid="' + esc(r.contractId || '') + '">Manda il link</button>' : '';
    };
    var card = function (cls, title, n, body) { return '<section class="plz-scard ' + cls + '"><h3>' + title + ' <b>' + n + '</b></h3>' + body + '</section>'; };
    var broken = m.units.filter(function (u) { return u.maintenance && u.maintenance.open.length; })
      .sort(function (a, b) { return b.maintenance.urgent - a.maintenance.urgent; });
    var mcard = broken.length ? card('is-maint', 'Manutenzione aperta', broken.reduce(function (a, u) { return a + u.maintenance.open.length; }, 0), broken.map(function (u) {
      var top = u.maintenance.open[0];
      // Il pallino qui è l'URGENZA, non il pagamento: oro = pagato confonderebbe.
      return row(u, '<span class="plz-mpri plz-mp-' + top.priority + '">' + esc(PRI_LABEL[top.priority] || '') + '</span>', top.category + (top.createdAt ? ' · dal ' + dateIt(top.createdAt) : '') + (u.maintenance.open.length > 1 ? ' · +' + (u.maintenance.open.length - 1) : ''))
        .replace('<i class="plz-s-' + u.month.state + '"', '<i class="plz-mdot plz-mp-' + top.priority + '"');
    }).join('')) : '';
    // Un mese tutto prima della gestione: una riga sola, mai «tutti in
    // regola» o «tutto pieno» di un mese di cui BOOM non sa niente.
    if (m.allBefore) return mcard;
    return card('is-late', 'Non hanno pagato', debt.length, debt.length ? debt.map(function (x) { return row(x.u, debtAmount(x.d), debtNote(x.d), sollecita(x), debtorName(x), 'late'); }).join('')
        : '<p class="plz-ok">' + (t.before ? 'Nessun ritardo fra gli interni gestiti.' : 'Tutti in regola.') + '</p>') +
      (due.length ? card('', 'Devono ancora pagare', due.length, due.map(function (u) { var r = u.month.rows.find(function (x) { return x.state === 'due'; }); return row(u, amtText(u.month.expected), r && r.dueDate ? 'entro il ' + dateIt(r.dueDate) : '', manda(u)); }).join('')) : '') +
      (check.length ? card('', 'Da verificare', check.length, check.map(function (u) { return row(u, '', stateLabel(u.month, m.month, m.currentMonth)); }).join('')) : '') +
      mcard +
      card('', 'Liberi', free.length, free.length ? free.map(function (u) { return row(u, '', freeNote(u)); }).join('') : '<p class="plz-ok">' + (t.before ? 'Nessun libero fra gli interni gestiti.' : 'Tutto pieno.') + '</p>') +
      (coming.length ? card('', 'In arrivo', coming.length, coming.map(function (u) { return row(u, '', freeNote(u)); }).join('')) : '') +
      (waived.length ? card('', 'Rata annullata', waived.length, waived.map(function (u) { return row(u, '', waivedNote(u)); }).join('')) : '') +
      (carried.length ? card('', 'Coperti dalla rata del mese prima', carried.length, carried.map(function (u) { return row(u, paidAmt(u, u.month.rows[0]), carriedNote(u)); }).join('')) : '') +
      (t.before ? '<p class="plz-muted plz-before-note">' + (t.before === 1 ? '1 interno era' : t.before + ' interni erano') + ' prima della gestione BOOM in ' + esc(E.monthLabel(m.month).toLowerCase()) + ': di quel mese non c’è archivio.</p>' : '') +
      '<details class="plz-scard plz-paidcard"' + (ui.paidOpen ? ' open' : '') + '><summary><h3>Hanno pagato <b>' + paid.length + '</b></h3></summary>' + paid.map(function (u) { return row(u, paidAmt(u, u.month.rows.find(function (x) { return x.paidDate; }) || u.month.rows[0]), ''); }).join('') + '</details>';
  }

  function simple(data) {
    return '<div id="plz-sbrief">' + briefHTML(data) + '</div>' +
      '<div class="plz-sgrid"><div class="plz-scol">' + facade(data) + (data.admin ? lookPanel(data) + cardPanel(data) : '') + '</div>' +
      '<div class="plz-scards" id="plz-scards">' + cards(data) + exportBar(data) + '</div></div>';
  }
  // Cambiare mese (o riprodurre l'anno) non ridisegna la facciata: cambia
  // la luce delle finestre e le persiane si aprono o si chiudono davvero.
  function patchFacade(data) {
    var fac = doc.getElementById('plz-fac'); if (!fac) return;
    var byId = Object.create(null); data.m.units.forEach(function (u) { byId[u.id] = u; });
    var els = fac.querySelectorAll('.plz-win[data-id]');
    if (els.length !== data.m.units.length) { fac.outerHTML = facade(data); syncFacade(); return; }
    Array.prototype.forEach.call(els, function (el) {
      var u = byId[el.getAttribute('data-id')]; if (!u) return;
      var s = u.month.state, pipe = pipeOf(u);
      el.setAttribute('data-state', s);
      if (pipe) el.setAttribute('data-pipe', pipe); else el.removeAttribute('data-pipe');
      var mt = u.maintenance && u.maintenance.open.length ? (u.maintenance.urgent ? 'urgent' : 'open') : '';
      if (mt) el.setAttribute('data-maint', mt); else el.removeAttribute('data-maint');
      el.setAttribute('aria-label', unitLabel(u));
      el.classList.toggle('is-dim', !matches(ui.filter, s));
      el.classList.toggle('is-sel', u.id === ui.selected);
      var em = el.querySelector('.plz-win-plate em'); if (em) em.textContent = GLYPH[s] || '';
    });
    var keys = doc.getElementById('plz-keys'); if (keys) keys.innerHTML = keysHTML(data.m);
  }

  // ── L'andamento: 12 mesi di soldi, puntualità, sfitto, scadenze ────────
  // Una sola serie (incassato) sopra la sua traccia (atteso): nessuna
  // legenda, il titolo la nomina; il valore si scrive solo sul mese scelto.
  function analytics(data) {
    var m = data.m, A = m.analytics;
    if (!A) return '';
    var max = Math.max.apply(null, A.months.map(function (x) { return Math.max(x.expected, x.collected); }).concat([1]));
    var bars = A.months.map(function (x) {
      var hE = Math.round(x.expected / max * 100), hC = Math.round(x.collected / max * 100), on = x.month === m.month;
      // Un mese senza rate non ha «incassato €0 su €0»: non ha dati, e lo si dice.
      var none = !x.expected && !x.collected;
      var tip = E.monthLabel(x.month) + ': ' + (none ? (m.gestioneDal && x.month < m.gestioneDal ? 'prima della gestione BOOM' : 'nessuna rata nel mese')
        : 'incassato ' + eur(x.collected) + ' su ' + eur(x.expected) + (x.late ? ' · in ritardo ' + eur(x.late) : ''));
      return '<button type="button" class="plz-abar' + (on ? ' is-on' : '') + '" data-plz="month" data-m="' + x.month + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        (on ? '<span class="plz-aval">' + (none ? '—' : eur(x.collected)) + '</span>' : '') + '<span class="plz-atrack" style="height:' + hE + '%"><i style="height:' + (hE ? Math.round(hC / hE * 100) : 0) + '%"></i></span><small>' + E.monthLabel(x.month, true) + '</small></button>';
    }).join('');
    var pct = function (v) { return v == null ? '—' : v + '%'; };
    var days = function (v) { return itNum(v) + (Math.abs(v) === 1 ? ' giorno' : ' giorni'); };
    var delay = A.avgDelay == null ? 'nessun dato' : A.avgDelay < -0.4 ? 'in media ' + days(Math.abs(A.avgDelay)) + ' prima' : A.avgDelay > 0.4 ? 'in media ' + days(A.avgDelay) + ' dopo la scadenza' : 'in media alla scadenza';
    // L'occupazione sotto i 3 mesi di gestione non è un andamento: il motore
    // dà null, e qui si dice da quando si misura (mai «null%» né «0%»).
    var occ = A.occupancy12 != null ? A.occupancy12 + '%' : '—';
    var occNote = A.occupancy12 != null ? A.vacantMonths + (A.vacantMonths === 1 ? ' mese' : ' mesi') + ' di sfitto in tutto il palazzo'
      : A.occupancyText ? (/^in misura/.test(A.occupancyText) ? 'dati ' + A.occupancyText.replace(/^in misura\s*/, '') : A.occupancyText) : 'dati da ' + (A.occupancySince ? E.monthLabel(A.occupancySince).toLowerCase() : 'pochi mesi');
    var EXP_MAX = 5, more = A.expiries.length - EXP_MAX;
    var exp = A.expiries.length ? A.expiries.slice(0, EXP_MAX).map(function (e) { return '<li><b>' + esc(e.interno ? 'Int. ' + e.interno : e.name) + '</b> ' + esc(e.tenants[0] || '') + '<em>' + dateIt(e.date) + (e.next ? ' · ' + (e.next.kind === 'reserved' ? 'nuovo inquilino pronto' : 'in trattativa') : '') + '</em></li>'; }).join('') + (more > 0 ? '<li class="plz-muted">e altri ' + more + ' · vedi Elenco</li>' : '') : '<li class="plz-muted">Nessun contratto finisce nei prossimi 12 mesi.</li>';
    return '<div class="plz-ahead"><p class="plz-eyebrow">Andamento · ultimi 12 mesi</p></div><div class="plz-agrid">' +
      '<div class="plz-acard plz-achart"><h3>Incassato su atteso, per mese</h3><div class="plz-abars" role="group" aria-label="Incassato su atteso, per mese">' + bars + '</div></div>' +
      '<div class="plz-acard"><span>Incassato su scaduto</span><strong>' + pct(A.collectionPct) + '</strong><em>' + (A.expected12 ? eur(A.collected12) + ' di ' + eur(A.expected12) : 'nessuna rata ancora scaduta') + '</em></div>' +
      '<div class="plz-acard"><span>Puntualità</span><strong>' + pct(A.onTimePct) + '</strong><em>' + (A.paidCount ? A.onTime + ' su ' + A.paidCount + (A.paidCount === 1 ? ' rata' : ' rate') + ' entro la scadenza · ' + delay : 'nessuna rata ancora pagata') + '</em></div>' +
      '<div class="plz-acard"><span>Occupazione 12 mesi</span><strong>' + occ + '</strong><em>' + esc(occNote) + '</em></div>' +
      '<div class="plz-acard plz-alist"><span>Contratti che finiscono entro un anno</span><ul>' + exp + '</ul></div>' +
      '</div>';
  }

  // ── Aggiornamenti senza ricostruire la scena ──────────────────────────
  // Cambiare mese (anche in riproduzione) ricolora i cubi esistenti: le
  // facce sfumano da un colore all'altro invece di ridisegnarsi da capo.
  function patch() {
    if (!adapter || !doc || !doc.querySelector('.plz')) return;
    var data = compute(); last = data;
    if (!data.m.building || data.severe) return;
    ensureContacts(data.m); ensureDocs(data.m);
    var m = data.m, set = function (id, html) { var el = doc.getElementById(id); if (el) el.innerHTML = html; };
    set('plz-load', loadNote(data));
    if (ui.view === 'simple') {
      set('plz-issues', issues(data)); set('plz-sbrief', briefHTML(data)); set('plz-scards', cards(data) + exportBar(data)); set('plz-panel', ui.selected ? panel(data) : '');
      if (doc.getElementById('plz-fac')) patchFacade(data); else { set('plz-simple', simple(data)); syncFacade(); }
      var lab0 = doc.getElementById('plz-month-label'); if (lab0) lab0.textContent = E.monthLabel(m.month);
      toggleToday(m);
      focusRata();
      return;
    }
    set('plz-issues', issues(data)); set('plz-kpis', kpis(data)); set('plz-timeline', timeline(data)); set('plz-panel', panel(data)); set('plz-analytics', analytics(data)); scrollTimeline();
    var lab = doc.getElementById('plz-month-label'); if (lab) lab.textContent = E.monthLabel(m.month);
    toggleToday(m);
    var fl = doc.querySelector('.plz-filters'); if (fl) fl.outerHTML = filters(data);
    if (ui.view === 'list') { set('plz-roll', roll(data) + exportBar(data)); }
    else {
      var byId = Object.create(null); m.units.forEach(function (u) { byId[u.id] = u; });
      Array.prototype.forEach.call(doc.querySelectorAll('.plz-unit'), function (el) {
        var u = byId[el.getAttribute('data-id')]; if (!u) return;
        var tmp = doc.createElement('div'); tmp.innerHTML = cube(u, 0, 0, 0);
        var fresh = tmp.firstChild;
        el.setAttribute('data-state', u.month.state);
        el.setAttribute('aria-label', fresh.getAttribute('aria-label'));
        el.classList.toggle('is-dim', fresh.classList.contains('is-dim'));
        el.classList.toggle('is-sel', u.id === ui.selected);
        el.querySelector('.plz-f-front').innerHTML = fresh.querySelector('.plz-f-front').innerHTML;
      });
      var trayEl = doc.querySelector('.plz-tray'); if (trayEl) trayEl.outerHTML = tray(data);
    }
    focusRata();
  }
  function toggleToday(m) {
    var today = doc.querySelector('[data-plz="today"]');
    if (m.month === m.currentMonth && today) today.remove();
    if (m.month !== m.currentMonth && !today) { var nx = doc.querySelector('[data-plz="next"]'); if (nx) nx.insertAdjacentHTML('afterend', '<button type="button" class="plz-chip-btn" data-plz="today">Oggi</button>'); }
  }
  function rerender() { stopPlay(); adapter.render(); }

  // ── Interazione ──────────────────────────────────────────────────────
  function world() { return doc.getElementById('plz-world'); }
  function applyView() {
    var w = world(); if (!w) return;
    w.style.setProperty('--rx', ui.rx + 'deg'); w.style.setProperty('--ry', ui.ry + 'deg'); w.style.setProperty('--z', ui.zoom * fitZoom());
  }
  function fitZoom() {
    var st = doc.getElementById('plz-stage'), w = world();
    if (!st || !w) return 1;
    var bw = parseFloat(w.style.getPropertyValue('--bw')) || 300, bd = parseFloat(w.style.getPropertyValue('--bd')) || 80;
    var levels = w.querySelectorAll('.plz-level').length || 1;
    var span = Math.sqrt(bw * bw + bd * bd) + 150; // + le etichette dei piani
    var byW = (st.clientWidth || 800) / span;
    var byH = 560 / (levels * GEO.fh + 120);
    var z = Math.max(0.42, Math.min(1.6, byW, byH));
    // La scena è alta quanto il palazzo che contiene: niente vuoto sopra.
    st.style.height = Math.round(Math.min(640, Math.max(300, (levels * GEO.fh + 70) * z * ui.zoom + 120))) + 'px';
    return z;
  }
  // Su telefono la linea del tempo scorre: si apre sul mese scelto, non su
  // quello di un anno fa.
  function scrollTimeline() {
    var t = doc.querySelector('.plz-months'), on = t && t.querySelector('.plz-mcell.is-on');
    if (t && on && t.scrollWidth > t.clientWidth) t.scrollLeft = Math.max(0, on.offsetLeft - t.clientWidth + on.offsetWidth + 24);
  }
  function stopPlay() { if (ui.playing) { root.clearInterval(ui.playing); ui.playing = null; } }
  function setMonth(mm) { if (!E.monthOf(mm)) return; ui.month = mm; patch(); }
  function narrow() { return !!(root.matchMedia && root.matchMedia('(max-width: 920px)').matches); }
  // Chi ha aperto la scheda (finestra, cubo, riga, voce di una card): alla
  // chiusura il focus e lo scorrimento tornano lì, non in cima alla pagina.
  function opener(el) {
    if (!el || !el.getAttribute) return '';
    var host = el.closest('.plz-win, .plz-unit, .plz-rrow, .plz-line, .plz-chip, .plz-btn');
    if (!host) return '';
    var kind = host.classList.contains('plz-win') ? '.plz-win' : host.classList.contains('plz-unit') ? '.plz-unit' : host.classList.contains('plz-rrow') ? '.plz-rrow' : host.classList.contains('plz-chip') ? '.plz-chip' : host.classList.contains('plz-line') ? '.plz-line' : '.plz-btn';
    var id = host.getAttribute('data-id') || el.getAttribute('data-id') || '';
    return id ? kind + '[data-id="' + String(id).replace(/["\\]/g, '') + '"]' : '';
  }
  function select(id, from) {
    ui.selected = ui.selected === id ? '' : id;
    if (ui.selected) ui.opener = opener(from) || ui.opener;
    patch();
    if (ui.selected) {
      var h = doc.getElementById('plz-unit-h'); if (h) h.focus({ preventScroll: true });
      var p = doc.getElementById('plz-panel');
      if (p && narrow()) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else restoreFocus();
  }
  function closeCard() { ui.selected = ''; ui.rata.open = ''; ui.terms = null; patch(); restoreFocus(); }
  function restoreFocus() {
    var sel = ui.opener; ui.opener = '';
    var el = sel && doc.querySelector('.plz ' + sel);
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (_) {}
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
  }
  // Sollecita / Manda il link: la scheda in vista e il focus sul tasto
  // WhatsApp appena il link è pronto (su telefono la scheda sta più giù).
  function focusRata() {
    var id = ui.rata.focus; if (!id || ui.rata.pending[id]) return;
    ui.rata.focus = '';
    var box = doc.querySelector('#plz-panel li[data-pay="' + String(id).replace(/["\\]/g, '') + '"] .plz-rshare') || doc.getElementById('plz-panel');
    if (!box) return;
    // I contatti stanno arrivando: si aspetta il loro giro (patch → qui).
    if (box.querySelector('.plz-loadc') && Object.keys(ui.contacts.pending).length) { ui.rata.focus = id; return; }
    try { box.scrollIntoView({ block: narrow() ? 'center' : 'nearest', behavior: 'smooth' }); } catch (_) {}
    var target = box.querySelector('a[href^="https://wa.me/"]') || box.querySelector('[data-plz="copy-link"]') || box.querySelector('[data-plz="rata"]');
    if (target) try { target.focus({ preventScroll: true }); } catch (_) {}
  }
  // La rilettura mirata del palazzo aperto (il portal la avvia SUBITO DOPO
  // aver disegnato) finisce senza ridisegnare quando non cambia niente o
  // quando fallisce: la vista la segue da sé, così «Rileggo…» si vede, poi
  // sparisce, e un errore compare subito con Riprova — non al prossimo
  // cambio di mese, con numeri che intanto sembravano completi.
  var loadWatch = null;
  function watchLoad() {
    if (loadWatch || !adapter || !doc || !root.setInterval || !viewAdmin()) return;
    var L = adapter.state().palazzoLoad;
    // Già com'era al disegno: niente da dire. Una lettura fallita (o finita)
    // prima di questo giro si dice subito.
    if (!L || !L.key || L.key !== ui.key || L === (last && last.load)) return;
    if (L.state !== 'loading') return refreshLoad(true);
    var key = L.key, t0 = Date.now();
    refreshLoad();
    loadWatch = root.setInterval(function () {
      var L2 = adapter && adapter.state().palazzoLoad;
      var done = !L2 || L2.key !== key || L2.state !== 'loading';
      if (!done && Date.now() - t0 < 120000) return;
      root.clearInterval(loadWatch); loadWatch = null;
      if (done && doc.querySelector('.plz')) refreshLoad(true);
    }, 300);
  }
  // Mentre si scrive in un campo del Palazzo si riscrivono solo l'avviso e
  // «Da sistemare»: mai un campo sostituito sotto le dita.
  function refreshLoad(full) {
    if (!doc.querySelector('.plz')) return;
    var a = doc.activeElement, typing = a && a.closest && a.closest('.plz') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if (full && !typing) return patch();
    var data = compute(); last = data;
    if (!data.m.building || data.severe) return;
    var l = doc.getElementById('plz-load'); if (l) l.innerHTML = loadNote(data);
    var is = doc.getElementById('plz-issues'); if (is) is.innerHTML = issues(data);
  }
  function mount() {
    if (!doc) return;
    var st = doc.getElementById('plz-stage'), w = world();
    lightsOn();
    syncFacade();
    if (last && last.m.building && !last.severe) { ensureContacts(last.m); ensureDocs(last.m); }
    if (root.setTimeout) root.setTimeout(watchLoad, 0);
    if (!st || !w) return;
    if (last && last.m.building) ui.intro[last.m.building.key] = true;
    applyView();
    scrollTimeline();
    var drag = null;
    st.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.plz-stage-ctl')) return;
      drag = { x: e.clientX, y: e.clientY, rx: ui.rx, ry: ui.ry, moved: false, id: e.pointerId };
    });
    st.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      if (!drag.moved) { drag.moved = true; try { st.setPointerCapture(e.pointerId); } catch (_) {} st.classList.add('is-drag'); w.classList.remove('plz-intro'); }
      ui.ry = drag.ry + dx * 0.45; ui.rx = Math.max(-62, Math.min(-6, drag.rx - dy * 0.3));
      applyView();
    });
    var end = function (e) {
      if (!drag) return;
      if (drag.moved) { st.classList.remove('is-drag'); st.dataset.justDragged = '1'; root.setTimeout(function () { delete st.dataset.justDragged; }, 60); }
      drag = null;
    };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    st.addEventListener('keydown', function (e) {
      if (e.target !== st) return;
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { ui.ry += k === 'ArrowLeft' ? -15 : 15; }
      else if (k === 'ArrowUp' || k === 'ArrowDown') { ui.rx = Math.max(-62, Math.min(-6, ui.rx + (k === 'ArrowUp' ? -6 : 6))); }
      else if (k === '+' || k === '=') ui.zoom = Math.min(1.8, ui.zoom * 1.12);
      else if (k === '-') ui.zoom = Math.max(0.6, ui.zoom / 1.12);
      else return;
      e.preventDefault(); applyView();
    });
    w.addEventListener('animationend', function (e) { if (e.target === w) w.classList.remove('plz-intro'); });
  }

  // ── Il volume della facciata: girarlo ────────────────────────────────
  // Delegato sul documento: la facciata si ridisegna (anteprima aspetto,
  // cambio palazzo) e un ascoltatore sull'elemento morirebbe con lei. Sul
  // telefono il gesto verticale resta della pagina (touch-action: pan-y):
  // si gira solo trascinando di lato.
  var facDrag = null;
  function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function setFacAngles() {
    var b = doc.getElementById('plz-fac-body'); if (!b) return;
    b.style.setProperty('--fy', ui.fy + 'deg'); b.style.setProperty('--fx', ui.fx + 'deg');
  }
  function onFacDown(e) {
    var st = e.target.closest && e.target.closest('#plz-fac-stage');
    if (!st || e.button !== 0) return;
    facDrag = { x: e.clientX, y: e.clientY, fy: ui.fy, fx: ui.fx, moved: false, id: e.pointerId, st: st, touch: e.pointerType !== 'mouse' };
  }
  function onFacMove(e) {
    if (!facDrag || facDrag.id !== e.pointerId) return;
    var dx = e.clientX - facDrag.x, dy = e.clientY - facDrag.y;
    if (!facDrag.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      if (facDrag.touch && Math.abs(dy) > Math.abs(dx)) { facDrag = null; return; }
      facDrag.moved = true; facDrag.st.classList.add('is-drag');
      try { facDrag.st.setPointerCapture(e.pointerId); } catch (_) {}
    }
    ui.fy = clampN(facDrag.fy + dx * 0.32, -42, 42);
    if (!facDrag.touch) ui.fx = clampN(facDrag.fx - dy * 0.18, -22, 2);
    setFacAngles();
  }
  function onFacUp(e) {
    if (!facDrag || facDrag.id !== e.pointerId) return;
    if (facDrag.moved) {
      var st = facDrag.st;
      st.classList.remove('is-drag'); st.dataset.justDragged = '1';
      root.setTimeout(function () { delete st.dataset.justDragged; }, 60);
    }
    facDrag = null;
  }
  // I marcapiani dei fianchi alla quota VERA dei piani della facciata
  // (le altezze dipendono dalla larghezza: si misurano, non si indovinano).
  function syncFacade() {
    var fac = doc && doc.getElementById('plz-fac'); if (!fac) return;
    Array.prototype.forEach.call(fac.querySelectorAll('.plz-fac-main, .plz-fac-attic'), function (box) {
      if (!box.offsetHeight) return;
      var stops = [];
      Array.prototype.forEach.call(box.children, function (fl) {
        if (!fl.classList || !(fl.classList.contains('plz-fac-fl') || fl.classList.contains('plz-fac-roof'))) return;
        var y = fl.offsetTop + fl.offsetHeight;
        stops.push('transparent ' + (y - 2) + 'px', 'rgba(0,0,0,.38) ' + (y - 2) + 'px', 'rgba(0,0,0,.38) ' + y + 'px', 'transparent ' + y + 'px');
      });
      if (stops.length) box.style.setProperty('--lines', 'linear-gradient(180deg,' + stops.join(',') + ')');
    });
  }

  // La prima volta che si apre un palazzo le luci si accendono dal basso e
  // le persiane si aprono piano per piano. Una volta sola per palazzo.
  function lightsOn() {
    var fac = doc.getElementById('plz-fac');
    if (!fac || !fac.classList.contains('is-intro')) return;
    if (last && last.m.building) ui.facIntro[last.m.building.key] = true;
    var raf = root.requestAnimationFrame || function (f) { return root.setTimeout(f, 16); };
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    raf(function () { raf(function () {
      fac.classList.remove('is-intro');
      if (reduce) return;
      fac.classList.add('is-waking');
      root.setTimeout(function () { fac.classList.remove('is-waking'); }, 2600);
    }); });
  }
  function readDraft(el) {
    var k = el.getAttribute('data-look');
    if (!last || !last.m.building || !k) return;
    if (!ui.draft || ui.draft.key !== last.m.building.key) ui.draft = { key: last.m.building.key };
    ui.draft[k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    var err = doc.getElementById('plz-look-err'); if (err) err.textContent = '';
    var data = compute(); last = data;
    var fac = doc.getElementById('plz-fac'); if (fac) { fac.outerHTML = facade(data); syncFacade(); }
    var act = doc.getElementById('plz-look-act'); if (act) act.innerHTML = lookActions();
    var badge = doc.getElementById('plz-look-badge'); if (badge) badge.textContent = lookBadge(data.m.look);
  }
  function onInput(e) {
    var el = e.target;
    if (el && el.form && el.form.id === 'plz-mform' && el.name && el.name in ui.reportDraft) { ui.reportDraft[el.name] = el.value; return; }
    if (el && el.getAttribute && el.getAttribute('data-imp') && ui.imp) {
      ui.imp[el.getAttribute('data-imp')] = el.value;
      // La tabella (o l'indirizzo, la proprietaria, il mese) è cambiata dopo
      // la lettura: il piano letto non vale più, e il tasto che lo scriverebbe
      // sparisce finché non si rilegge.
      if (ui.imp.parsed || ui.imp.plan) {
        ui.imp.parsed = null; ui.imp.plan = null;
        var out = doc.getElementById('plz-imp-out'); if (out) out.innerHTML = importStale();
      }
      return;
    }
    if (el && el.getAttribute && el.getAttribute('data-card') && adapter && viewAdmin()) return readCard(el);
    if (!el || !el.getAttribute || !el.getAttribute('data-look') || !adapter || !viewAdmin()) return;
    readDraft(el);
  }
  // La bozza della carta: solo in memoria finché non si salva.
  function readCard(el) {
    if (!last || !last.m.building) return;
    var k = el.getAttribute('data-card'), m = last.m;
    if (!ui.cardDraft || ui.cardDraft.key !== m.building.key) {
      var c = cardCfgOf(m).cfg || {};
      ui.cardDraft = { key: m.building.key, on: c.on === true, mandateAt: /^\d{4}-\d{2}-\d{2}$/.test(String(c.mandateAt || '')) ? c.mandateAt : '', note: c.note || '', fee: c.fee === 'surcharge' ? 'surcharge' : 'absorbed' };
    }
    if (k === 'on') ui.cardDraft.on = !!el.checked;
    else if (k === 'fee') { if (el.checked) ui.cardDraft.fee = el.value === 'surcharge' ? 'surcharge' : 'absorbed'; }
    else ui.cardDraft[k] = String(el.value || '');
    var d = ui.cardDraft, eff = doc.getElementById('plz-card-effect');
    if (eff) eff.textContent = cardEffect(d, cardSummary(m));
  }
  function onToggle(e) {
    var el = e.target;
    if (!el || !el.classList) return;
    if (el.id === 'plz-look') ui.lookOpen = el.open;
    if (el.id === 'plz-card') ui.cardOpen = el.open;
    if (el.classList.contains('plz-paidcard')) ui.paidOpen = el.open;
  }

  // ── La presa in carico: il palazzo da una tabella (solo admin) ────────
  // La proprietaria ha già il suo elenco: incollato qui diventa interni,
  // contratti e rate (E.parseRentRoll → E.planImport, puri). Si scrive solo
  // dopo l'anteprima, col tasto che dice cosa nasce, e le rate partono da
  // "gestione BOOM dal": mai arretrati inventati prima di BOOM.
  // «Gestione BOOM dal» vale SOLO per gli interni nuovi (e per quelli che
  // non l'hanno scritta): un interno già in archivio tiene sempre la sua
  // (planImport). Quindi qui si propone il mese di OGGI — l'interno affidato
  // a BOOM a gennaio non eredita ottobre (quattro rate scadute inventate).
  // Completare un interno dalla sua scheda (importForUnit) parte invece
  // dalla SUA gestione.
  function impDefaults(data) {
    var m = data.m, o = m && m.owner;
    return { address: m && m.building ? m.building.label : '', ownerId: o && o.id || '', from: (m && (m.currentMonth || m.gestioneDal)) || '', text: '', parsed: null, plan: null, applyDiffs: false };
  }
  function importPanel(data) {
    var st = ui.imp, S = data.S || {};
    var owners = (S.users || []).filter(function (u) { return u.role === 'landlord' || u.role === 'owner'; })
      .sort(function (a, b) { return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'it'); });
    return '<section class="plz-import" aria-labelledby="plz-imp-h"><p class="plz-eyebrow" id="plz-imp-h">Carica il palazzo da una tabella</p>' +
      '<p class="plz-muted">Incolla da Excel o Google Sheets la riga dei titoli e una riga per interno. Titoli letti: Interno · Piano · Inquilino · Co-intestatari · Telefono · Email · Canone · Oneri · Dal · Al · Tipo · Deposito · Cedolare · Registrato il · Pagato il · Locatore · IBAN · Mq · POD · PDR. Serve solo Interno; per un interno affittato anche Canone, Dal e Al. Gli oneri fissi entrano nella rata insieme al canone; l’IBAN è il conto che l’inquilino vede per il bonifico. «Pagato il» vale per il primo mese di gestione. I telefoni stranieri vanno scritti col prefisso (+44, +90…).</p>' +
      '<div class="plz-import-f"><label><span>Indirizzo del palazzo</span><input type="text" data-imp="address" value="' + esc(st.address) + '" placeholder="Via Esempio 12, Roma" autocomplete="off"></label>' +
      '<label><span>Proprietaria</span><select data-imp="ownerId"><option value="">Scegli…</option>' + owners.map(function (u) {
        return '<option value="' + esc(u.id) + '"' + (u.id === st.ownerId ? ' selected' : '') + '>' + esc(u.name || u.email || u.id) + '</option>';
      }).join('') + '</select></label>' +
      '<label><span>Gestione BOOM dal</span><input type="month" data-imp="from" value="' + esc(st.from) + '"></label></div>' +
      (owners.length ? '' : '<p class="plz-note">Nessun profilo Locatore: crealo in Utenti (ruolo Locatore), poi torna qui.</p>') +
      '<textarea class="plz-import-t" data-imp="text" rows="7" spellcheck="false" aria-label="Tabella degli interni" placeholder="Interno\tPiano\tInquilino\tTelefono\tCanone\tDal\tAl\tTipo\tPagato il">' + esc(st.text) + '</textarea>' +
      '<label class="plz-check"><input type="checkbox" data-imp-flag="applyDiffs"' + (st.applyDiffs ? ' checked' : '') + '> Applica le differenze con l’archivio (canone, oneri, fine, nomi, contatti, conto: anche sulle rate ancora da pagare)</label>' +
      '<div class="plz-import-b"><button type="button" class="plz-btn plz-primary plz-sm" data-plz="imp-read">Leggi la tabella</button>' +
      '<button type="button" class="plz-btn plz-sm" data-plz="imp-template">Scarica il modello</button>' +
      '<button type="button" class="plz-btn plz-sm" data-plz="imp-close">Chiudi</button></div>' +
      '<div id="plz-imp-out" aria-live="polite">' + importResult() + '</div></section>';
  }
  var IMP_ACTION = { 'contract-new': 'contratto nuovo', 'contract-same': 'contratto già in archivio', 'contract-update': 'contratto in archivio, da aggiornare',
    'placeholder-new': 'occupato · contratto da caricare', 'placeholder-complete': 'completa il contratto da caricare', 'placeholder-hold': 'contratto da caricare a nome di un’altra persona',
    contacts: 'aggiorna i contatti del contratto', free: 'libero', property: 'aggiorna l’interno', none: 'niente da cambiare' };
  var LOCK_WHY = { firmato: 'contratto firmato digitalmente: si corregge dal contratto', cofirmato: 'co-intestatario che ha firmato: si corregge dal contratto', persona: 'contratto di un’altra persona: non si tocca da qui' };
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function importResult() {
    var st = ui.imp; if (!st || !st.parsed) return '';
    var P = st.parsed, plan = st.plan;
    if (P.errors.indexOf('vuota') >= 0) return '<p class="plz-note">La tabella è vuota.</p>';
    if (P.errors.indexOf('senza_interno') >= 0) return '<p class="plz-note">Nella prima riga manca il titolo «Interno»: è l’unica colonna obbligatoria.</p>';
    var planErr = plan ? plan.errors : [];
    var msgs = [];
    if (planErr.indexOf('indirizzo') >= 0) msgs.push('Scrivi l’indirizzo del palazzo (via e civico).');
    if (planErr.indexOf('proprietaria') >= 0) msgs.push('Scegli la proprietaria.');
    planErr.filter(function (e) { return /^owner:/.test(e); }).forEach(function (e) { msgs.push('L’interno ' + esc(e.slice(6)) + ' è già in archivio a nome di un altro proprietario: non lo sposto da qui.'); });
    (plan ? plan.notes : []).filter(function (n) { return /^oneri:/.test(n); }).forEach(function (n) { msgs.push('Interno ' + esc(n.slice(6)) + ': gli oneri entrano nel contratto, ma le rate già in archivio restano col solo canone finché non applichi le differenze (o le correggi da Gestisci canoni).'); });
    var rows = plan && plan.rows && plan.rows.length ? plan.rows : null;
    var bad = rows ? rows.filter(function (r) { return r.errors && r.errors.length; }) : P.rows.filter(function (r) { return r.errors.length; });
    var tr = (rows || P.rows).map(function (r) {
      var errs = r.errors || [], src = rows ? r : null;
      var verdict;
      if (errs.length) verdict = '<em class="plz-red">' + esc(errs.join(' · ')) + '</em>';
      else if (src) {
        var bits = [src.exists ? 'già in archivio' + (src.existsAs ? ' come «' + esc(String(src.existsAs).slice(0, 60)) + '»' : '') : 'nuovo', esc(IMP_ACTION[src.action] || src.action || '')];
        if (src.payments) bits.push(plural(src.payments, 'rata', 'rate'));
        if (src.paid) bits.push('<b>pagato</b>' + (src.paidMarks && src.paidMarks[0] ? ' (rata di ' + esc(E.monthLabel(src.paidMarks[0].month).toLowerCase()) + ')' : ''));
        if (src.overdue) bits.push('<span class="plz-red">' + plural(src.overdue, 'rata già scaduta', 'rate già scadute') + '</span>');
        // Da quando partono le rate, per ogni interno: anche per i nuovi.
        if ((src.gestioneKept || !src.exists) && src.gestioneDal) bits.push('gestione BOOM da ' + esc(E.monthLabel(src.gestioneDal).toLowerCase()));
        verdict = bits.filter(Boolean).join(' · ');
      } else verdict = 'da leggere';
      var detail = [];
      if (src) {
        var terms = [src.tipo, src.cedolare === true || src.cedolare === 'si' ? 'cedolare sì' : src.cedolare === false || src.cedolare === 'no' ? 'cedolare no' : '', src.deposito != null ? 'deposito ' + eur(src.deposito) : '',
          // Un IBAN non valido lo dicono già l'avviso della riga e «Dove pagano gli inquilini».
          src.locatore ? 'locatore ' + src.locatore : '', src.ibanMasked && src.ibanValid !== false ? 'IBAN ' + src.ibanMasked : ''].filter(Boolean);
        if (terms.length) detail.push('<small class="plz-imp-terms">' + esc(terms.join(' · ')) + '</small>');
        (src.diffs || []).forEach(function (d) {
          detail.push('<small class="plz-imp-diff' + (d.locked ? ' is-locked' : '') + '"><b>' + esc(d.label) + '</b>: ' + esc(d.fromText || 'non indicato') + ' → ' + esc(d.toText || '') + (d.rates ? ' · ' + plural(d.rates, 'rata', 'rate') : '') +
            (d.ratesKept ? ' (' + (d.ratesKept === 1 ? '1 già scaduta resta com’era' : d.ratesKept + ' già scadute restano com’erano') + ')' : '') +
            (d.locked ? ' — ' + esc(LOCK_WHY[d.lockReason] || 'bloccata') : st.applyDiffs ? ' — si applica' : ' — non applicata') + '</small>');
        });
        (src.alerts || []).forEach(function (a) { detail.push('<small class="plz-imp-alert">⚠ ' + esc(a) + '</small>'); });
        (src.warnings || []).filter(function (w) { return (src.alerts || []).indexOf(w) < 0; }).forEach(function (w) { detail.push('<small>' + esc(w) + '</small>'); });
        (src.notes || []).forEach(function (n) { detail.push('<small class="plz-muted">' + esc(n) + '</small>'); });
      } else if (r.warnings && r.warnings.length) detail.push('<small>' + esc(r.warnings.join(' · ')) + '</small>');
      var tenant = src ? [src.tenant].concat(src.coTenants || []).filter(Boolean).join(' + ') : [r.inquilino].concat(r.coinquilini || []).filter(Boolean).join(' + ');
      var canone = src ? src.canone : r.canone, oneri = src ? src.oneri : r.oneri, dal = src ? src.dal : r.dal, al = src ? src.al : r.al;
      return '<tr' + (errs.length ? ' class="is-bad"' : '') + '><td>' + esc(r.interno) + '</td><td>' + esc((src ? src.floor : r.piano) || '—') + (src && src.floorMissing ? '<small class="plz-warn">piano mancante</small>' : '') + '</td><td>' + esc(tenant || '—') + '</td><td class="plz-num">' + (canone != null ? eur(canone) + (oneri ? '<small>+ ' + eur(oneri) + ' oneri</small>' : '') : '—') + '</td><td>' +
        esc(dal ? dateIt(dal) + ' → ' + dateIt(al) : '—') + '</td><td>' + verdict + detail.join('') + '</td></tr>';
    }).join('');
    var c = plan ? plan.counts : { create: 0, update: 0, same: 0, contracts: 0, contractUpdates: 0, payments: 0, paid: 0, diffsApplicable: 0, paymentUpdates: 0, paymentCancels: 0, rowErrors: 0 };
    var cu = c.contractUpdates || 0, apply = !!(plan && plan.applyDiffs);
    var blocked = !plan || bad.length || planErr.length;
    var writes = c.create + c.update + c.contracts + cu + c.payments + (apply ? (c.paymentUpdates || 0) + (c.paymentCancels || 0) : 0);
    var go = [c.create ? 'crea ' + plural(c.create, 'interno', 'interni') : '', c.update ? 'aggiorna ' + plural(c.update, 'interno', 'interni') : '',
      c.contracts ? plural(c.contracts, 'contratto', 'contratti') : '', cu ? (apply ? 'aggiorna ' : 'completa ') + plural(cu, 'contratto', 'contratti') : '',
      c.payments ? plural(c.payments, 'rata', 'rate') : '', apply && c.paymentUpdates ? 'ricalcola ' + plural(c.paymentUpdates, 'rata', 'rate') : '', apply && c.paymentCancels ? 'annulla ' + plural(c.paymentCancels, 'rata', 'rate') : ''].filter(Boolean).join(', ');
    var da = c.diffsApplicable || 0;
    var mainBtn, extraBtn = '';
    if (blocked) mainBtn = '<button type="button" class="plz-btn plz-primary" data-plz="imp-go" disabled>' + (bad.length ? 'Correggi le righe in rosso' : 'Completa i dati sopra') + '</button>';
    else if (writes > 0) mainBtn = '<button type="button" class="plz-btn plz-primary" data-plz="imp-go">' + esc(go.charAt(0).toUpperCase() + go.slice(1)) + '</button>';
    else if (!apply && da > 0) mainBtn = '<button type="button" class="plz-btn plz-primary" data-plz="imp-apply">' + plural(da, 'differenza', 'differenze') + ' con l’archivio: applica' + (da === 1 ? 'la' : 'le') + '</button>';
    else mainBtn = '<button type="button" class="plz-btn plz-primary" data-plz="imp-go" disabled>Niente da cambiare</button>';
    if (!blocked && writes > 0 && !apply && da > 0) extraBtn = '<button type="button" class="plz-btn" data-plz="imp-apply">Applica anche ' + (da === 1 ? 'la differenza' : 'le ' + da + ' differenze') + '</button>';
    var accounts = plan && plan.accounts && plan.accounts.length ? '<div class="plz-imp-acc"><p class="plz-eyebrow">Dove pagano gli inquilini</p><ul>' + plan.accounts.map(function (a) {
      return '<li><b>' + esc(a.locatore || 'Locatore non indicato') + '</b> · <span class="plz-num">' + esc(a.ibanMasked || 'IBAN non indicato') + '</span>' + (a.ibanValid === false ? ' <em class="plz-red">IBAN non valido: non lo carico</em>' : a.ibanValid === true ? ' <em class="plz-ok-i">✓ controllato</em>' : '') +
        '<small>' + (a.interni.length === 1 ? 'interno ' : plural(a.interni.length, 'interno', 'interni') + ': int. ') + esc(a.interni.join(', ')) + '</small></li>';
    }).join('') + '</ul></div>' : '';
    var ovAll = plan && plan.overdueNow ? plan.overdueNow : [], ovNew = ovAll.filter(function (x) { return x.newUnit; });
    var od = ovAll.length ? '<div class="plz-imp-od"><p class="plz-eyebrow">Rate già scadute oggi</p><ul>' + ovAll.map(function (x) {
      return '<li>Int. ' + esc(x.interno) + ' · ' + esc(E.monthLabel(x.month).toLowerCase()) + ' · ' + eur(x.amount) + ' · scadenza ' + dateIt(x.dueDate) + (x.newUnit ? ' · <b>interno nuovo</b>' : '') + '</li>';
    }).join('') + '</ul>' + (ovNew.length < ovAll.length ? '<p class="plz-muted">Se sono state pagate, registra l’incasso dopo il carico: non diventano pagate da sole («Pagato il» nella tabella vale solo per la prima rata di ogni interno).</p>' : '') +
      (ovNew.length ? '<p class="plz-note">Interni nuovi: le rate partono da «Gestione BOOM dal» (' + esc(E.monthLabel(plan.gestioneDal).toLowerCase()) + '). Se BOOM li gestisce da dopo, cambia la data prima di caricare: dopo il carico non si corregge più.</p>' : '') + '</div>' : '';
    // Le rate già scadute le elenca il riquadro qui sotto: la stessa frase
    // fra i messaggi sarebbe un doppione proprio dove si decide (solo
    // quella: «restano all'importo di prima» e «interni nuovi» restano).
    var pm = plan ? (plan.messages || []).filter(function (x) { return !(od && /^\d+ rat[ae] (risulta|risultano) già scadut|^\d+ rat[ae] di (un interno nuovo|interni nuovi)/.test(x)); }) : P.unknown.length ? ['Colonne non riconosciute: ' + P.unknown.join(', ') + '.'] : [];
    return '<p class="plz-import-sum"><b>' + plural(P.rows.length + ((P.ignored || []).length), 'riga', 'righe') + '</b> · ' + plural(c.create, 'interno nuovo', 'interni nuovi') + ', ' + (c.update + (c.same || 0)) + ' già in archivio' + (c.update ? ' (' + c.update + ' da completare)' : '') + ' · ' + plural(c.contracts, 'contratto', 'contratti') + (c.missing ? ' (' + c.missing + ' da caricare)' : '') + (cu ? ' (+' + cu + (apply ? ' da aggiornare)' : ' da completare)') : '') + ' · ' + plural(c.payments, 'rata', 'rate') + ' da ' + esc(E.monthLabel(plan ? plan.gestioneDal : st.from).toLowerCase()) +
      (c.paid ? ' (' + c.paid + ' segnate pagate dalla tabella)' : '') + '</p>' +
      (pm.length ? '<div class="plz-imp-msgs" role="status">' + pm.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>' : '') +
      (msgs.length ? '<p class="plz-note">' + msgs.join(' ') + '</p>' : '') +
      (bad.length ? '<p class="plz-note">' + plural(bad.length, 'riga da correggere', 'righe da correggere') + ' (in rosso): sistemale nella tabella e rileggi. Non si carica niente a metà.</p>' : '') +
      accounts + od +
      '<div class="plz-import-wrap"><table class="plz-import-tab"><thead><tr><th>Interno</th><th>Piano</th><th>Inquilino</th><th>Canone</th><th>Contratto</th><th>Esito</th></tr></thead><tbody>' + tr + '</tbody></table></div>' +
      '<div class="plz-import-b">' + mainBtn + extraBtn + '</div>';
  }
  function importStale() { return '<p class="plz-note" role="status">Tabella cambiata dopo la lettura: premi «Leggi la tabella» per vedere cosa cambia.</p>'; }
  // Ciò da cui il piano è nato: se cambia, il piano non si scrive.
  function impSource(st) { return JSON.stringify([st.text, st.address, st.ownerId, st.from, st.applyDiffs === true]); }
  function importRead() {
    var st = ui.imp; if (!st || !last) return;
    st.planFor = impSource(st);
    st.parsed = E.parseRentRoll(st.text);
    var owner = (last.S.users || []).find(function (u) { return u.id === st.ownerId; });
    var me = last.S.profile && last.S.profile.id || '';
    st.plan = st.parsed.rows.length ? E.planImport(st.parsed.rows, last.ctx, { address: st.address, ownerId: st.ownerId, ownerName: owner ? (owner.name || owner.email || '') : '', gestioneDal: st.from,
      applyDiffs: st.applyDiffs === true, listings: last.S.listings || [], by: me }) : null;
    var out = doc.getElementById('plz-imp-out'); if (out) out.innerHTML = importResult();
  }
  // «Carica il contratto» di un interno da caricare: l'import già pronto con
  // la riga di quell'interno (Interno, Piano, Inquilino) e le colonne da
  // riempire. Si scrive solo dopo l'anteprima, come sempre.
  function importForUnit(u) {
    var data = last || compute(), st = ui.imp = impDefaults(data);
    var lease = u.month.lease || {}, co = (lease.coTenants || []).map(function (t) { return t && (t.name || t.fullName) || ''; }).filter(Boolean).join(' / ');
    var cells = [u.interno || '', u.property && u.property.floor || '', lease.tenantName || u.month.tenants[0] || '', co, lease.tenantPhone || '', '', '', '', '', '', lease.landlordName || ''];
    st.text = ['Interno', 'Piano', 'Inquilino', 'Co-intestatari', 'Telefono', 'Canone', 'Oneri', 'Dal', 'Al', 'Tipo', 'Locatore'].join('\t') + '\n' + cells.join('\t');
    if (u.property && u.property.gestioneDal) st.from = String(u.property.gestioneDal);
    var box = doc.getElementById('plz-import');
    if (box) { box.innerHTML = importPanel(data); var ta = box.querySelector('[data-imp="text"]'); if (ta) { ta.focus(); try { box.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {} } }
  }

  function copyText(text, el) {
    var done = function () { if (el) { var t0 = el.textContent; el.textContent = 'Copiato ✓'; root.setTimeout(function () { el.textContent = t0; }, 1600); } };
    try { if (root.navigator.clipboard && root.isSecureContext) { root.navigator.clipboard.writeText(text).then(done, function () { root.prompt('Copia il messaggio', text); }); return; } } catch (_) {}
    try { root.prompt('Copia il messaggio', text); } catch (_) {}
  }
  function downloadText(file, text, type) {
    try {
      var url = root.URL.createObjectURL(new root.Blob([text], { type: type || 'text/csv;charset=utf-8' }));
      var a = doc.createElement('a'); a.href = url; a.download = file; a.rel = 'noopener'; doc.body.appendChild(a); a.click();
      root.setTimeout(function () { root.URL.revokeObjectURL(url); a.remove(); }, 1500);
    } catch (_) {}
  }

  // ── Per il commercialista: il mese o l'anno in un CSV ─────────────────
  // Lo stesso motore della pagina (E.csvRows), mese per mese: il foglio non
  // può dire una cosa diversa da ciò che la proprietaria vede. L'anno arriva
  // fino al mese corrente, mai un mese che non è ancora successo.
  function exportBar(data) {
    var y = data.m.month.slice(0, 4);
    return rataBar(data) + '<div class="plz-export"><p>Per il commercialista</p><button type="button" class="plz-btn plz-sm" data-plz="csv" data-span="month">' + esc(E.monthLabel(data.m.month)) + ' · CSV</button>' +
      '<button type="button" class="plz-btn plz-sm" data-plz="csv" data-span="year">Anno ' + esc(y) + ' · CSV</button>' +
      '<button type="button" class="plz-btn plz-sm" data-plz="csv" data-span="utenze">Utenze POD/PDR · CSV</button></div>';
  }
  function slug(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'palazzo'; }
  function exportCsv(year) {
    if (!last || !last.m.building) return;
    var m = last.m, owner = !last.admin, rows = [], name;
    if (year === 'utenze') { downloadText('BOOM_' + slug(m.building.label) + '_utenze.csv', E.toCsv(E.utenzeRows(m), E.UTENZE_HEAD)); ui.lastExport = { file: 'utenze' }; return; }
    if (!year) { rows = E.csvRows(m, { owner: owner }); name = m.month; }
    else {
      var y = m.month.slice(0, 4), endM = y === m.currentMonth.slice(0, 4) ? m.currentMonth : y + '-12';
      // Dal primo mese di gestione BOOM se TUTTI gli interni la dichiarano
      // (con un interno senza la data i mesi prima hanno dati veri): al
      // commercialista non vanno nove mesi di righe vuote.
      var gds = m.units.map(function (u) { return u.month.gestioneDal || ''; });
      var gd0 = gds.length && gds.every(Boolean) ? gds.slice().sort()[0] : '';
      var start = gd0 && gd0 > y + '-01' ? gd0 : y + '-01';
      if (start > endM) {
        var note = [y, '', '', ''].concat(E.CSV_HEAD.slice(4, -1).map(function () { return ''; })).concat(['Prima della gestione BOOM (da ' + E.monthLabel(gd0).toLowerCase() + '): nessun mese di ' + y + ' in archivio']);
        rows = [note];
      }
      for (var mm = start; mm <= endM; mm = E.monthAdd(mm, 1)) {
        rows = rows.concat(E.csvRows(E.model(last.ctx, m.building.key, mm, { filter: last.filter, strip: false }), { owner: owner }));
      }
      name = y;
    }
    var file = 'BOOM_' + slug(m.building.label) + '_' + name + '.csv';
    downloadText(file, E.toCsv(rows));
    ui.lastExport = { file: file, rows: rows.length };
  }

  function onClick(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a) {   // chiama/scrivi: il link fa il suo lavoro
      // Il messaggio della rata aperto su WhatsApp resta SULLA RATA
      // (dunningHistory): «inviato» si legge da lì, anche domani.
      var sentId = a.getAttribute('data-sent');
      if (sentId) {
        ui.rata.sent[sentId] = true;
        var A1 = adapter && adapter.actions || {};
        var meta = { channel: 'whatsapp', kind: a.getAttribute('data-kind') === 'sollecito' ? 'sollecito' : 'rata-link', month: a.getAttribute('data-month') || '' };
        if (A1.logRataSent) Promise.resolve().then(function () { return A1.logRataSent(sentId, meta); })
          .then(function (ok) { if (ok === false) ui.rata.sent[sentId] = 'error'; if (doc.querySelector('.plz')) patch(); }, function () { ui.rata.sent[sentId] = 'error'; if (doc.querySelector('.plz')) patch(); });
        root.setTimeout(function () { if (doc.querySelector('.plz')) patch(); }, 0);
      }
      return;
    }
    var el = e.target.closest && e.target.closest('[data-plz]');
    if (!el || !el.closest('.plz') || !adapter) return;
    var act = el.getAttribute('data-plz'), id = el.getAttribute('data-id') || '';
    var st = doc.getElementById('plz-stage');
    var fst = doc.getElementById('plz-fac-stage');
    if (act === 'select') { if ((st && st.dataset.justDragged) || (fst && fst.dataset.justDragged)) return; select(id, el); return; }
    if (act === 'deselect') { closeCard(); return; }
    if (act === 'contacts-retry') { ui.contacts.failed = Object.create(null); patch(); return; }
    if (act === 'docs-retry' && last && last.m.building) { delete ui.docs[last.m.building.key]; patch(); return; }
    if (act === 'msg-lang') { ui.msgLang = el.getAttribute('data-l') === 'it' ? 'it' : 'en'; patch(); return; }
    if (act === 'reload') { var Ar = adapter.actions || {}; if (Ar.reload) { el.disabled = true; el.textContent = 'Rileggo…'; return Promise.resolve(Ar.reload()).then(function () { el.disabled = false; el.textContent = 'Riprova'; }, function () { el.disabled = false; el.textContent = 'Riprova'; }); } return; }
    if (act === 'month') { stopPlay(); setMonth(el.getAttribute('data-m')); return; }
    if (act === 'prev' || act === 'next') { stopPlay(); setMonth(E.monthAdd(ui.month || last.m.month, act === 'prev' ? -1 : 1)); return; }
    if (act === 'today') { stopPlay(); setMonth(last.m.currentMonth); return; }
    if (act === 'filter') { ui.filter = el.getAttribute('data-f'); patch(); return; }
    if (act === 'view') { ui.view = el.getAttribute('data-v'); persist(); rerender(); return; }
    if (act === 'rot') { ui.ry += 30 * (+el.getAttribute('data-d')); applyView(); return; }
    if (act === 'zoom') { ui.zoom = +el.getAttribute('data-d') > 0 ? Math.min(1.8, ui.zoom * 1.15) : Math.max(0.6, ui.zoom / 1.15); applyView(); return; }
    if (act === 'reset') { ui.rx = -22; ui.ry = 34; ui.zoom = 1; applyView(); return; }
    if (act === 'play') {
      if (ui.playing) { stopPlay(); patch(); return; }
      var series = last.m.series.map(function (s) { return s.month; }), i = 0;
      ui.month = series[0]; patch();
      ui.playing = root.setInterval(function () {
        i++;
        if (i >= series.length || !doc.querySelector('.plz')) { stopPlay(); if (doc.querySelector('.plz')) patch(); return; }
        ui.month = series[i]; patch();
      }, root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1400 : 850);
      patch();
      return;
    }
    var A = adapter.actions || {}, admin = viewAdmin();
    var unit = last && last.m.units.find(function (u) { return u.id === id; });
    // «Scrivi a BOOM»: con l'interno, così chi risponde sa di cosa si parla.
    if (act === 'inbox' && A.inbox) return A.inbox(id || ui.selected || '', el.getAttribute('data-ch') === 'email' ? 'email' : undefined);
    if (act === 'csv') { var span = el.getAttribute('data-span'); return exportCsv(span === 'year' ? true : span === 'utenze' ? 'utenze' : false); }
    if (act === 'maint-new') { ui.reportFor = id; ui.reportDone = ''; patch(); var ta = doc.querySelector('#plz-mform textarea'); if (ta) ta.focus(); return; }
    if (act === 'maint-cancel') { ui.reportFor = ''; patch(); return; }
    if (act === 'copy-link') { copyText(el.getAttribute('data-text') || '', el); return; }
    // Sollecita / Manda il link: la scheda dell'interno si apre sulla rata,
    // il link si chiede al server, e su telefono la scheda viene IN VISTA col
    // focus sul tasto WhatsApp (prima restava 1.000px più giù, fuori schermo).
    if (act === 'rata' && admin) {
      var payId = el.getAttribute('data-pay');
      if (id && ui.selected !== id) { ui.opener = opener(el) || ui.opener; ui.selected = id; }
      ui.rata.open = payId; ui.rata.focus = payId;
      fetchRata([payId]);
      patch();
      return;
    }
    if (act === 'rata-all' && admin && last) {
      ui.rataOpen = !ui.rataOpen;
      if (ui.rataOpen) fetchRata(openRates(last.m).map(function (x) { return x.r.id; }));
      patch();
      return;
    }
    if (act === 'record' && admin && A.record) return A.record(el.getAttribute('data-pay'));
    if (act === 'undo-record' && admin && A.undoRecord) return Promise.resolve(A.undoRecord(el.getAttribute('data-pay'))).then(function (ok) { if (ok) patch(); });
    if (act === 'maint-link' && adapter.links && last) {
      var occ = last.m.units.filter(function (x) { return x.month.contractId; }).map(function (x) { return x.id; });
      el.disabled = true;
      // Il server può dare un link PER CONTRATTO (più contratti vivi sullo
      // stesso interno): ognuno riceve il suo.
      return Promise.resolve(adapter.links(occ.length ? occ : [id])).then(function (res) {
        var links = res && res.links && typeof res.links === 'object' ? res.links : res || {};
        ui.links = Object.assign({}, ui.links || {}, links);
        ui.linksBy = Object.assign({}, ui.linksBy || {}, (res && res.byContract) || {});
        // Il posto di oggi per interno (il contratto a cui il link apre): se
        // il server lo dice vince sul motore.
        if (res && res.seats && typeof res.seats === 'object') ui.linksSeat = Object.assign({}, ui.linksSeat || {}, res.seats);
        el.disabled = false; patch();
      }, function () { el.disabled = false; el.textContent = 'Link non disponibile ora · riprova'; });
    }
    if (act === 'as-owner' && adapter.isAdmin()) { ui.asOwner = el.getAttribute('data-owner') || ''; ui.selected = ''; ui.shareOpen = false; ui.draft = null; rerender(); return; }
    if (act === 'share' && adapter.isAdmin()) {
      ui.shareOpen = !ui.shareOpen; el.setAttribute('aria-expanded', ui.shareOpen ? 'true' : 'false');
      var box = doc.getElementById('plz-share'); if (box && last) box.innerHTML = ui.shareOpen ? shareBox(last) : '';
      return;
    }
    if (act === 'share-copy') {
      var ta = doc.getElementById('plz-share-t'); if (!ta) return;
      var done = function () { el.textContent = 'Copiato ✓'; root.setTimeout(function () { el.textContent = 'Copia'; }, 1600); };
      try { if (root.navigator.clipboard && root.isSecureContext) return root.navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); }); } catch (_) {}
      ta.select(); try { if (doc.execCommand('copy')) done(); } catch (_) {}
      return;
    }
    if (!admin) return;
    if (act === 'imp-open') { ui.imp = ui.imp || impDefaults(last || compute()); var box2 = doc.getElementById('plz-import'); if (box2) { box2.innerHTML = importPanel(last); var ta2 = box2.querySelector('[data-imp="text"]'); if (ta2) ta2.focus(); } return; }
    if (act === 'imp-close') { ui.imp = null; var box3 = doc.getElementById('plz-import'); if (box3) box3.innerHTML = ''; return; }
    if (act === 'imp-template') return downloadText('BOOM_modello_palazzo.csv', '﻿' + E.RR_TEMPLATE);
    if (act === 'imp-read') return importRead();
    // Le differenze con l'archivio si applicano solo se lo chiedi: il piano
    // si ricalcola (cambiano anche le rate da pagare) e il tasto lo dice.
    if (act === 'imp-apply' && ui.imp) { ui.imp.applyDiffs = true; var cb = doc.querySelector('[data-imp-flag="applyDiffs"]'); if (cb) cb.checked = true; return importRead(); }
    if (act === 'load-contract' && unit) return importForUnit(unit);
    if (act === 'innesto' && unit && A.innesto) return A.innesto(unit.id);
    if (act === 'terms' && id) { ui.terms = { cid: id, f: el.getAttribute('data-f') === 'oneri' ? 'oneri' : 'rent' }; patch(); var tin = doc.querySelector('#plz-terms input'); if (tin) tin.focus(); return; }
    if (act === 'terms-cancel') { ui.terms = null; patch(); return; }
    if (act === 'terminate' && id && A.terminate) return A.terminate(id);
    if (act === 'cancel-rates' && A.cancelRates) {
      var pids = (el.getAttribute('data-ids') || '').split(',').filter(Boolean);
      if (!pids.length) return;
      el.disabled = true;
      return Promise.resolve(A.cancelRates(pids, 'contratto chiuso')).then(function () { el.disabled = false; patch(); }, function () { el.disabled = false; });
    }
    if (act === 'look-open') {
      ui.lookOpen = true;
      if (ui.view !== 'simple') { ui.view = 'simple'; persist(); rerender(); }
      var lk = doc.getElementById('plz-look'); if (lk) { lk.open = true; try { lk.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {} }
      return;
    }
    if (act === 'card-cancel') { ui.cardDraft = null; adapter.render(); return; }
    if (act === 'card-save' && A.saveRataCard && last && last.m.building) {
      var cd = ui.cardDraft && ui.cardDraft.key === last.m.building.key ? ui.cardDraft : null;
      if (!cd) { var c0 = cardCfgOf(last.m).cfg || {}; cd = { on: c0.on === true, mandateAt: c0.mandateAt || '', note: c0.note || '', fee: c0.fee === 'surcharge' ? 'surcharge' : 'absorbed' }; }
      el.disabled = true;
      return Promise.resolve(A.saveRataCard(last.m.building.propertyIds.slice(), { on: !!cd.on, mandateAt: /^\d{4}-\d{2}-\d{2}$/.test(cd.mandateAt || '') ? cd.mandateAt : null, note: cd.note || '', fee: cd.fee === 'surcharge' ? 'surcharge' : 'absorbed' }))
        .then(function (ok) { if (ok) { ui.cardDraft = null; ui.cardOpen = true; adapter.render(); } else el.disabled = false; }, function () { el.disabled = false; });
    }
    if (act === 'pwd-link' && A.sendPasswordLink) { el.disabled = true; return Promise.resolve(A.sendPasswordLink(el.getAttribute('data-owner'))).then(function (ok) { el.disabled = false; if (ok) el.textContent = '✓ Link per la password inviato'; }, function () { el.disabled = false; }); }
    if (act === 'rend-mode' && A.setRendiconto) {
      return Promise.resolve(A.setRendiconto(el.getAttribute('data-owner'), el.getAttribute('data-mode'))).then(function (ok) {
        if (ok) { ui.rend = null; var sb = doc.getElementById('plz-share'); if (sb && last) { last = compute(); sb.innerHTML = ui.shareOpen ? shareBox(last) : ''; } }
      });
    }
    if (act === 'rend-run' && adapter.rendiconto) {
      var kind = el.getAttribute('data-kind') === 'force' ? 'force' : 'preview', ow = el.getAttribute('data-owner');
      if (kind === 'force' && root.confirm && !root.confirm('Rimandare il rendiconto del mese scorso?\n\nCon la modalità «Automatico a lei» le arriva di nuovo, anche se l’aveva già ricevuto. Con «Anteprima» arriva solo a BOOM.')) return;
      el.disabled = true;
      var shareNow = function () { var sb = doc.getElementById('plz-share'); if (sb && last) sb.innerHTML = ui.shareOpen ? shareBox(last) : ''; };
      return Promise.resolve(adapter.rendiconto(ow, kind)).then(function (r) { ui.rend = rendOutcome(r, kind); shareNow(); }, function (err) { ui.rend = { ok: false, msg: 'Non è partito: ' + ((err && err.message) || 'errore') + '. Riprova fra un attimo.' }; shareNow(); });
    }
    if (act === 'imp-go' && ui.imp && ui.imp.plan && A.importRoll) {
      // Rete di sicurezza: un piano letto da un'altra tabella non parte mai.
      if (ui.imp.planFor !== impSource(ui.imp)) { ui.imp.plan = null; ui.imp.parsed = null; var o2 = doc.getElementById('plz-imp-out'); if (o2) o2.innerHTML = importStale(); return; }
      var plan = ui.imp.plan; el.disabled = true;
      return Promise.resolve(A.importRoll(plan)).then(function (ok) {
        if (ok) { ui.imp = null; ui.key = plan.buildingKey; ui.selected = ''; persist(); adapter.render(); } else el.disabled = false;
      }, function () { el.disabled = false; });
    }
    if (act === 'maint' && id && A.maintenance) return A.maintenance(id);
    if (act === 'pdf' && id && A.pdf) return A.pdf(id);
    if (act === 'firma' && id && A.firma) return A.firma(id);
    if (act === 'rli' && id && A.rli) return A.rli(id);
    if (act === 'aspi' && id && A.aspi) return A.aspi(id);
    if (act === 'fiscale' && id && A.fiscale) return A.fiscale(id);
    if (act === 'arpe' && id && A.arpe) return A.arpe(id);
    if (act === 'rent' && unit && A.rent) return A.rent(unit.id, last.m.month);
    if (act === 'contract' && id && A.contract) return A.contract(id);
    if (act === 'dossier' && unit && A.dossier) return A.dossier(unit.id);
    if (act === 'edit' && unit && A.edit) return A.edit(unit.property);
    if (act === 'paylink' && A.payLink) return A.payLink(el.getAttribute('data-pay'));
    if (act === 'look-cancel') { ui.draft = null; adapter.render(); return; }
    if (act === 'look-save' && A.saveLook && last.m.building) {
      var v = E.validateLook(lookChanges(last.m), last.m), err = doc.getElementById('plz-look-err');
      if (!v.ok) { if (err) err.textContent = lookError(v.errors); return; }
      if (!Object.keys(v.fields).length) { ui.draft = null; adapter.render(); return; }
      el.disabled = true;
      return Promise.resolve(A.saveLook(last.m.building.propertyIds.slice(), v.fields)).then(function (ok) {
        if (ok) { ui.draft = null; ui.lookOpen = true; adapter.render(); } else el.disabled = false;
      }, function () { el.disabled = false; });
    }
    if (act === 'contracts' && A.contracts) return A.contracts();
    if (act === 'users' && A.users) return A.users();
    if (act === 'link' && A.linkOwner) {
      var ids = (el.getAttribute('data-ids') || '').split(',').filter(Boolean), owner = el.getAttribute('data-owner');
      if (ids.length && owner) A.linkOwner(ids, owner);
    }
  }
  function onChange(e) {
    var el = e.target;
    if (el && el.getAttribute && el.getAttribute('data-imp-flag') && ui.imp) { ui.imp[el.getAttribute('data-imp-flag')] = !!el.checked; if (ui.imp.parsed) importRead(); return; }
    if (el && el.getAttribute && el.getAttribute('data-card')) return onInput(e);
    // La scansione del contratto firmato su carta (solo admin): solo PDF, la
    // controlla e la carica il portal (palazzoUploadPaper).
    if (el && el.getAttribute && el.getAttribute('data-plz-file') === 'paper' && el.files && el.files[0] && adapter && viewAdmin()) {
      var A = adapter.actions || {}, cid = el.getAttribute('data-id'), f = el.files[0], lab = el.closest('label');
      if (!A.uploadPaperContract) return;
      if (lab) lab.classList.add('is-busy');
      return Promise.resolve(A.uploadPaperContract(cid, f)).then(function (url) { el.value = ''; if (lab) lab.classList.remove('is-busy'); if (url) patch(); }, function () { el.value = ''; if (lab) lab.classList.remove('is-busy'); });
    }
    if (el && el.getAttribute && (el.getAttribute('data-look') && el.type === 'radio' || el.getAttribute('data-imp') || (el.form && el.form.id === 'plz-mform'))) return onInput(e);
    if (!el || el.getAttribute('data-plz') !== 'building' || !adapter) return;
    stopPlay(); ui.key = el.value; ui.selected = ''; ui.draft = null; persist(); rerender();
  }
  // La segnalazione dalla scheda: si valida qui (una frase, almeno), si
  // scrive sul server. Il testo resta in ui.reportDraft finché non parte.
  // Un importo scritto come lo scrive una persona: «1.250», «1250,50»,
  // «1.250,50», «1250.50». Ambiguo o non numero → NaN (mai indovinato).
  function euroInput(v) {
    var t = String(v == null ? '' : v).trim().replace(/[\s€]/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d+(,\d{1,2})?$/.test(t)) t = t.replace(',', '.');
    else if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
    return Math.round(Number(t) * 100) / 100;
  }
  function onSubmit(e) {
    var f = e.target;
    // Canone / oneri dalle rate da pagare in poi: il portal chiede conferma.
    if (f && f.id === 'plz-terms' && adapter) {
      e.preventDefault();
      var A = adapter.actions || {}, cid = f.getAttribute('data-id'), kind = f.getAttribute('data-f');
      var v = euroInput(f.v.value), fn = kind === 'oneri' ? A.applyOneri : A.setRent;
      if (!fn || !isFinite(v) || v < 0 || (kind === 'rent' && !(v > 0))) { f.v.focus(); return; }
      return Promise.resolve(fn(cid, v)).then(function (ok) { if (ok) { ui.terms = null; patch(); } });
    }
    if (!f || f.id !== 'plz-mform' || !adapter) return;
    e.preventDefault();
    var pid = f.getAttribute('data-id'), err = doc.getElementById('plz-merr'), btn = f.querySelector('[data-plz="maint-send"]');
    var d = { category: f.category.value, priority: f.priority.value, description: String(f.description.value || '').trim() };
    if (d.description.length < 8) { if (err) err.textContent = 'Scrivi almeno una frase: cosa succede e dove.'; f.description.focus(); return; }
    if (!adapter.report) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Invio…'; }
    return Promise.resolve(adapter.report(pid, d)).then(function (ok) {
      if (ok) { ui.reportFor = ''; ui.reportDone = pid; ui.reportDraft = { category: 'plumbing', priority: 'medium', description: '' }; patch(); return; }
      if (btn) { btn.disabled = false; btn.textContent = 'Invia a BOOM'; }
      if (err) err.textContent = 'Non è partita: riprova fra un attimo.';
    }, function () { if (btn) { btn.disabled = false; btn.textContent = 'Invia a BOOM'; } if (err) err.textContent = 'Non è partita: riprova fra un attimo.'; });
  }
  function onKey(e) {
    var el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el && el.getAttribute && el.getAttribute('data-plz') === 'select' && el.getAttribute('role')) {
      e.preventDefault(); select(el.getAttribute('data-id'), el);
    }
    if (el && el.id === 'plz-fac-stage' && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
      e.preventDefault();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ui.fy = clampN(ui.fy + (e.key === 'ArrowLeft' ? -8 : 8), -42, 42);
      else ui.fx = clampN(ui.fx + (e.key === 'ArrowUp' ? -4 : 4), -22, 2);
      setFacAngles();
    }
    if (e.key === 'Escape' && ui.selected && doc.querySelector('.plz')) closeCard();
  }
  function onOver(e) {
    var tip = doc.getElementById('plz-tip'), el = e.target.closest && e.target.closest('.plz-unit, .plz-win[data-id]');
    if (!tip) return;
    if (!el || (root.matchMedia && root.matchMedia('(hover: none)').matches)) { tip.hidden = true; return; }
    tip.textContent = el.getAttribute('aria-label');
    tip.hidden = false;
    var r = el.getBoundingClientRect(), host = doc.querySelector('.plz').getBoundingClientRect();
    tip.style.left = Math.round(r.left - host.left + r.width / 2) + 'px';
    tip.style.top = Math.round(r.top - host.top - 10) + 'px';
  }

  function configure(value) {
    adapter = value;
    if (bound || !doc) return;
    bound = true;
    doc.addEventListener('click', onClick);
    doc.addEventListener('change', onChange);
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('pointerover', onOver);
    doc.addEventListener('input', onInput);
    doc.addEventListener('submit', onSubmit);
    doc.addEventListener('toggle', onToggle, true);
    doc.addEventListener('pointerdown', onFacDown);
    doc.addEventListener('pointermove', onFacMove);
    doc.addEventListener('pointerup', onFacUp);
    doc.addEventListener('pointercancel', onFacUp);
    root.addEventListener('resize', function () { if (doc.getElementById('plz-world')) applyView(); syncFacade(); });
  }

  var API = { configure: configure, render: render, mount: mount, patch: patch, ui: ui, eur: eur,
    // Le parole della vista, pure: per i test in Node (tests/palazzo/view*.mjs).
    _t: { euroInput: euroInput, fmtPhone: fmtPhone, waNumber: waNumber, punctuality: punctuality, occupiedText: occupiedText, rendOutcome: rendOutcome,
      periodText: periodText, debtNote: debtNote, eurEn: eurEn, withLang: withLang,
      rowKind: rowKind, rowName: rowName, rataText: rataText, amtText: amtText, telOf: telOf, phoneOf: phoneOf, phoneWhy: phoneWhy, cardEffect: cardEffect,
      impDefaults: impDefaults, exportCsv: exportCsv, privacyLine: privacyLine, last: function () { return last; } } };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.BOOM_PALAZZO_UI = API;
})(typeof window !== 'undefined' ? window : globalThis);
