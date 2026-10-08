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
  var E = typeof module === 'object' && module.exports ? require('./palazzo-engine.js') : root.BOOM_PALAZZO;
  var doc = root.document;

  var GEO = { w: 88, h: 54, d: 66, gx: 12, gz: 16, fh: 66 };
  // I filtri sono i QUATTRO TONI del motore (E.TONES), non gli otto stati.
  var FILTERS = [['all', 'Tutti', null]].concat(E.TONES.map(function (t) {
    return [{ pagato: 'paid', ritardo: 'late', attesa: 'due', libero: 'free', prima: 'before' }[t.key], t.key === 'ritardo' ? 'Non pagato' : t.key === 'libero' ? 'Liberi' : t.label, t.states];
  }));
  var GLYPH = { paid: '✓', late: '!', due: '·', review: '·', norate: '·', unknown: '·', incoming: '→', vacant: '', before: '' };

  // view '' = nessuna scelta salvata: la decide il ruolo al primo disegno
  // (la proprietaria apre su Semplice ovunque, l'admin su 3D da desktop).
  var ui = { key: '', month: '', view: '', filter: 'all', selected: '', rx: -22, ry: 34, zoom: 1, intro: Object.create(null), facIntro: Object.create(null), fy: -25, fx: -10, playing: null, draft: null, lookOpen: false, paidOpen: false, shown: '', asOwner: '', shareOpen: false, imp: null, reportFor: '', reportDone: '', reportDraft: { category: 'plumbing', priority: 'medium', description: '' }, links: null, linksOpen: false, linksErr: false,
    rata: { urls: Object.create(null), skipped: Object.create(null), pending: Object.create(null), sent: Object.create(null), open: '', failed: '' }, rataOpen: false,
    contacts: { byId: Object.create(null), pending: Object.create(null), failed: Object.create(null) } };
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
    parts.push(u.floor == null ? 'piano da indicare' : u.floorTop ? 'Attico' : E.floorLabel(u.floor));
    return parts.join(' · ');
  }
  function surname(name) { var s = String(name || '').trim().split(/\s+/); return s.length > 1 ? s[s.length - 1] : s[0] || ''; }
  function stateLabel(um, month, currentMonth) {
    var owner = adapter && !viewAdmin();
    if (um.state === 'norate' && um.lease && um.lease.contractMissing === true) return owner ? 'Contratto in arrivo da BOOM' : 'Contratto da caricare';
    if (um.state === 'norate' && owner) return 'In verifica da BOOM';
    if (um.state === 'review' && owner) return 'In verifica da BOOM';
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
    var m = E.model(ctx, ui.key, ui.month, { filter: filter, topFloor: d && d.ultimoPiano > 0 ? +d.ultimoPiano : undefined });
    if (m.building && d) {
      m.lookView = Object.assign({}, m.look, d.intonaco ? { intonaco: d.intonaco } : {}, d.persiane ? { persiane: d.persiane } : {}, d.nome != null ? { name: String(d.nome).trim() } : {});
      if (d.ultimoPiano > 0 && d.ultimoPiano <= 40) m.lookView.topFloor = +d.ultimoPiano;
    }
    if (!admin && m.building) m.brief = E.brief(m, { owner: true });
    if (m.building && m.building.key !== ui.key) { ui.key = m.building.key; }
    if (ui.selected && !m.units.some(function (u) { return u.id === ui.selected; })) ui.selected = '';
    var pv = preview ? (S.users || []).find(function (u) { return u.id === preview; }) || { id: preview } : null;
    return { ctx: ctx, m: m, admin: admin, realAdmin: realAdmin, preview: pv, S: S, filter: filter };
  }

  // ── Disegno ───────────────────────────────────────────────────────────
  function render() {
    if (!adapter) return '';
    var data = compute(); last = data;
    var m = data.m;
    if (!m.building) {
      return '<div class="plz">' + previewBar(data) + '<header class="plz-head"><div><p class="plz-eyebrow">Il Palazzo</p><h1>' + (data.admin ? 'Nessun immobile in archivio' : 'Nessun interno collegato al tuo profilo') + '</h1><p class="plz-sub">' +
        (data.admin ? 'Carica il palazzo da una tabella, oppure aggiungi gli immobili da Immobili o dall’Innesto: ogni interno allo stesso civico diventa un piano del palazzo.' : 'BOOM sta collegando i tuoi immobili. Appena pronti li vedrai qui, interno per interno.') + '</p>' +
        (data.admin ? '<div class="plz-otools"><button type="button" class="plz-chip-btn" data-plz="imp-open">＋ Carica da tabella</button></div>' : '') + '</div></header>' +
        '<div id="plz-import">' + (data.admin && ui.imp ? importPanel(data) : '') + '</div></div>';
    }
    if (ui.view === 'simple') {
      return '<div class="plz" data-view="simple">' + previewBar(data) + header(data) + '<div id="plz-share">' + (ui.shareOpen ? shareBox(data) : '') + '</div><div id="plz-import">' + (data.admin && ui.imp ? importPanel(data) : '') + '</div><div id="plz-issues">' + issues(data) + '</div>' +
        '<div class="plz-body plz-body-simple"><div class="plz-main" id="plz-simple">' + simple(data) + '</div>' +
        '<aside class="plz-panel" id="plz-panel" aria-live="polite">' + (ui.selected ? panel(data) : '') + '</aside></div>' +
        '<div class="plz-tip" id="plz-tip" hidden></div></div>';
    }
    return '<div class="plz" data-view="' + ui.view + '">' + previewBar(data) + header(data) + '<div id="plz-share">' + (ui.shareOpen ? shareBox(data) : '') + '</div><div id="plz-import">' + (data.admin && ui.imp ? importPanel(data) : '') + '</div><div id="plz-issues">' + issues(data) + '</div><div id="plz-kpis">' + kpis(data) + '</div>' +
      '<div id="plz-timeline">' + timeline(data) + '</div>' +
      '<div class="plz-body"><div class="plz-main">' + filters(data) +
      (ui.view === '3d' ? scene(data) : '<div id="plz-roll">' + roll(data) + exportBar(data) + '</div>') + tray(data) +
      '</div><aside class="plz-panel" id="plz-panel" aria-live="polite">' + panel(data) + '</aside></div>' +
      '<section class="plz-analytics" id="plz-analytics" aria-label="Andamento degli ultimi 12 mesi">' + analytics(data) + '</section>' +
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
      'Si entra da qui con la sua email: ' + LOGIN_URL + '\nLa prima volta, se non ha ancora una password, scriva la sua email e tocchi «Forgot?»: le arriva il link per sceglierla.\n\nValentino · BOOM';
  }
  function shareBox(data) {
    var o = data.m.owner || {}, u = o.user || {}, txt = shareText(data);
    var phone = u.phone ? waNumber(u.phone) : '';
    return '<div class="plz-share"><p class="plz-eyebrow">Il messaggio per ' + esc(o.name || o.email || 'la proprietaria') + '</p><textarea class="plz-share-t" id="plz-share-t" rows="7" aria-label="Messaggio da inviare">' + esc(txt) + '</textarea>' +
      '<div class="plz-share-b">' +
      (phone ? '<a class="plz-btn plz-primary plz-sm" href="https://wa.me/' + esc(phone) + '?text=' + esc(encodeURIComponent(txt)) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      (o.email ? '<a class="plz-btn plz-sm" href="mailto:' + esc(o.email) + '?subject=' + esc(encodeURIComponent('Il suo Palazzo su BOOM')) + '&body=' + esc(encodeURIComponent(txt)) + '">Email</a>' : '') +
      '<button type="button" class="plz-btn plz-sm" data-plz="share-copy">Copia</button>' +
      (!phone && !o.email ? '<span class="plz-muted">Nel suo profilo non ci sono telefono né email: copia il messaggio.</span>' : !phone ? '<span class="plz-muted">Telefono non in archivio: WhatsApp da aggiungere in Utenti.</span>' : '') +
      '</div><p class="plz-muted plz-share-n">Prima di inviarlo: «👁 Come la vede» mostra esattamente la sua pagina.</p></div>';
  }
  function header(data) {
    var m = data.m, b = m.building, o = m.owner;
    var sub = data.admin ? (o ? 'Proprietà di ' + esc(o.name || o.email || 'proprietario da collegare') : 'Proprietario da collegare') + ' · ' + b.units + (b.units === 1 ? ' interno' : ' interni')
      : b.units + (b.units === 1 ? ' interno gestito' : ' interni gestiti') + ' da BOOM';
    if (m.gestioneDal) sub += ' · gestione dal ' + esc(E.monthLabel(m.gestioneDal).toLowerCase());
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

  function issues(data) {
    var noPhone = data.admin ? withoutPhone(data.m) : [];
    if (!data.admin || (!data.m.issues.length && !noPhone.length)) return '';
    var m = data.m, o = m.owner, S = data.S;
    var rows = m.issues.map(function (i) {
      if (i.code === 'unplaced') return row('Piano', i.count + (i.count === 1 ? ' interno senza piano' : ' interni senza piano') + ': restano nel cortile, fuori dalla vista 3D.', '<button type="button" class="plz-btn" data-plz="edit" data-id="' + esc(i.ids[0]) + '">Indica il piano</button>');
      if (i.code === 'owner' && o && o.id) return row('Accesso', i.count + (i.count === 1 ? ' interno non collegato' : ' interni non collegati') + ' a ' + esc(o.name || o.email) + ': dal suo accesso non ' + (i.count === 1 ? 'lo vede' : 'li vede') + '.', '<button type="button" class="plz-btn" data-plz="link" data-owner="' + esc(o.id) + '" data-ids="' + esc(i.ids.join(',')) + '">Collega a ' + esc(o.name || 'lei') + '</button>');
      if (i.code === 'ownerProfile') {
        var cand = (S.users || []).find(function (u) { return u.role === 'landlord' && o && ((o.email && String(u.email || '').toLowerCase() === o.email) || (o.name && String(u.name || '').trim().toLowerCase() === o.name.trim().toLowerCase())); });
        return row('Accesso', 'Nessun interno è collegato al profilo di ' + esc(o && (o.name || o.email) || 'un proprietario') + ': ' + (cand ? 'il profilo esiste.' : 'crea il suo accesso in Utenti (ruolo Locatore), poi collegalo da qui.'),
          cand ? '<button type="button" class="plz-btn" data-plz="link" data-owner="' + esc(cand.id) + '" data-ids="' + esc(i.ids.join(',')) + '">Collega a ' + esc(cand.name || cand.email) + '</button>' : '<button type="button" class="plz-btn" data-plz="users">Apri Utenti</button>');
      }
      if (i.code === 'staleActive') return row('Contratti', i.count + (i.count === 1 ? ' contratto risulta attivo ma è scaduto' : ' contratti risultano attivi ma sono scaduti') + ': per le date, l’interno è libero.', '<button type="button" class="plz-btn" data-plz="contracts">Apri contratti</button>');
      if (i.code === 'overlap') return row('Contratti', i.count + (i.count === 1 ? ' interno ha due contratti' : ' interni hanno due contratti') + ' nello stesso mese.', '<button type="button" class="plz-btn" data-plz="select" data-id="' + esc(i.ids[0]) + '">Vedi</button>');
      if (i.code === 'preBoom') return row('Rate', i.count + (i.count === 1 ? ' rata aperta' : ' rate aperte') + ' di mesi prima della gestione BOOM: nel Palazzo non contano (non sono arretrati di BOOM), ma in Canoni restano scadute. Chiudile se non servono.', '<button type="button" class="plz-btn" data-plz="rent" data-id="' + esc(i.ids[0]) + '">Apri canoni</button>');
      if (i.code === 'unregistered') return row('Registrazione', i.count + (i.count === 1 ? ' contratto in corso senza registrazione segnata' : ' contratti in corso senza registrazione segnata') + ' oltre 30 giorni dalla decorrenza: segnala con ✓ RLI registrato o invia ad ASPI. Alla proprietaria risulta “in verifica da BOOM”.', '<button type="button" class="plz-btn" data-plz="select" data-id="' + esc(i.ids[0]) + '">Vedi</button>');
      if (i.code === 'nocontract') return row('Contratti', i.count + (i.count === 1 ? ' interno occupato senza contratto in archivio' : ' interni occupati senza contratto in archivio') + ': canone, date e rate arrivano col contratto (reincolla la riga completa, o caricalo dall’Innesto). Alla proprietaria risulta “in verifica da BOOM”.', '<button type="button" class="plz-btn" data-plz="select" data-id="' + esc(i.ids[0]) + '">Vedi</button>');
      if (i.code === 'norate') return row('Rate', i.count + (i.count === 1 ? ' interno occupato senza rata' : ' interni occupati senza rata') + ' in ' + esc(E.monthLabel(m.month).toLowerCase()) + ': né pagato né in ritardo finché la rata non esiste.', '<button type="button" class="plz-btn" data-plz="rent" data-id="' + esc(i.ids[0]) + '">Verifica rate</button>');
      return '';
    }).join('') + (noPhone.length ? row('Contatti', noPhone.length + (noPhone.length === 1 ? ' inquilino senza telefono' : ' inquilini senza telefono') + ' in archivio: dalla sua scheda la proprietaria non ' + (noPhone.length === 1 ? 'lo può' : 'li può') + ' chiamare.', '<button type="button" class="plz-btn" data-plz="select" data-id="' + esc(noPhone[0].id) + '">Vedi</button>') : '');
    var n = m.issues.length + (noPhone.length ? 1 : 0);
    return rows ? '<details class="plz-issues"' + (m.issues.some(function (i) { return i.code !== 'norate'; }) || noPhone.length ? ' open' : '') + '><summary>Da sistemare · ' + n + '</summary>' + rows + '</details>' : '';
    function row(tag, text, action) { return '<div class="plz-issue"><span class="plz-tag">' + tag + '</span><p>' + text + '</p>' + action + '</div>'; }
  }

  function ring(pct) {
    var r = 22, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return '<svg class="plz-ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="' + r + '" class="plz-ring-bg"/><circle cx="28" cy="28" r="' + r + '" class="plz-ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>';
  }
  function kpis(data) {
    var t = data.m.totals, mon = E.monthLabel(data.m.month).split(' ')[0].toLowerCase();
    var occ = t.occupied, payers = t.paid + t.late + t.due + t.review + t.unknown;
    var pct = t.expected ? Math.round(t.collected / t.expected * 100) : 0;
    return '<div class="plz-kpis">' +
      '<div class="plz-kpi">' + ring(t.occupancy) + '<div><span>Pieni</span><strong>' + occ + '<small>/' + t.units + '</small></strong><em>' + (t.vacant ? t.vacant + (t.vacant === 1 ? ' libero' : ' liberi') : 'nessuno libero') + (t.incoming ? ' · ' + t.incoming + ' in arrivo' : '') + (t.leaving ? ' · ' + t.leaving + ' in scadenza' : '') + '</em></div></div>' +
      '<div class="plz-kpi"><div class="plz-kpi-grow"><span>Hanno pagato · ' + esc(mon) + '</span><strong>' + t.paid + '<small>/' + payers + '</small></strong><div class="plz-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><em>' + eur(t.collected) + ' di ' + eur(t.expected) + '</em></div></div>' +
      '<div class="plz-kpi' + (t.late ? ' is-alert' : '') + '"><div><span>Non hanno pagato</span><strong>' + t.late + '</strong><em>' + (t.late ? eur(t.lateAmount) + ' in ritardo' : t.due ? t.due + ' devono ancora pagare' : 'nessun ritardo') + '</em></div></div>' +
      '<div class="plz-kpi' + (t.arrears ? ' is-alert' : '') + '"><div><span>Arretrati totali</span><strong class="plz-num">' + eur(t.arrears) + '</strong><em>' + (t.arrearsCount ? t.arrearsCount + (t.arrearsCount === 1 ? ' rata scaduta' : ' rate scadute') + (t.arrearsOldest ? ', dal ' + dateIt(t.arrearsOldest) : '') : 'nessuna rata scaduta') + '</em></div></div>' +
      '</div>';
  }

  function timeline(data) {
    var m = data.m;
    return '<div class="plz-time"><button type="button" class="plz-ico plz-play" data-plz="play" aria-label="' + (ui.playing ? 'Ferma' : 'Riproduci gli ultimi 12 mesi') + '">' + (ui.playing ? '❚❚' : '▶') + '</button><div class="plz-months" role="group" aria-label="Ultimi 12 mesi">' +
      m.series.map(function (s) {
        var t = s.totals, n = Math.max(1, t.units), seg = function (k, v) { return v ? '<i class="plz-s-' + k + '" style="flex:' + v + '"></i>' : ''; };
        var bar = seg('paid', t.paid) + seg('due', t.due + t.review + t.norate + (t.nocontract || 0) + t.unknown) + seg('late', t.late) + seg('vacant', t.vacant + t.incoming) + seg('before', t.before || 0);
        return '<button type="button" class="plz-mcell' + (s.month === m.month ? ' is-on' : '') + (s.month === m.currentMonth ? ' is-now' : '') + '" data-plz="month" data-m="' + s.month + '" aria-label="' + esc(E.monthLabel(s.month)) + ': ' + t.paid + ' pagati, ' + t.late + ' in ritardo, ' + (t.vacant + t.incoming) + ' liberi" aria-pressed="' + (s.month === m.month) + '"><span class="plz-mbar">' + bar + '</span><small>' + E.monthLabel(s.month, true) + '</small></button>';
      }).join('') + '</div></div>';
  }

  function filters(data) {
    var t = data.m.totals, count = { all: t.units, paid: t.paid, late: t.late, due: t.due + t.review + t.norate + (t.nocontract || 0) + t.unknown, free: t.vacant + t.incoming, before: t.before || 0 };
    return '<div class="plz-filters" role="group" aria-label="Mostra">' + FILTERS.filter(function (f) { return f[0] !== 'before' || count.before || ui.filter === 'before'; }).map(function (f) {
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
    return '<div class="plz-tray"><p class="plz-eyebrow">' + (ui.view === '3d' ? 'Nel cortile · piano da indicare' : '') + '</p>' + (ui.view === '3d' ? '<div class="plz-tray-row">' + un.map(function (u) {
      return '<button type="button" class="plz-chip" data-plz="select" data-id="' + esc(u.id) + '" data-state="' + u.month.state + '"><i aria-hidden="true"></i>' + esc(unitTitle(u)) + '<small>' + esc(stateLabel(u.month, data.m.month, data.m.currentMonth)) + '</small></button>';
    }).join('') + '</div>' : '') + '</div>';
  }

  function stripHTML(u, month) {
    return '<div class="plz-strip" role="group" aria-label="Ultimi 12 mesi">' + u.strip.map(function (c) {
      return '<button type="button" class="plz-dot plz-s-' + c.state + (c.month === month ? ' is-on' : '') + '" data-plz="month" data-m="' + c.month + '" title="' + esc(E.monthLabel(c.month) + ' · ' + (E.STATES[c.state] ? E.STATES[c.state].label : '')) + '" aria-label="' + esc(E.monthLabel(c.month) + ': ' + (E.STATES[c.state] ? E.STATES[c.state].label : '')) + '"></button>';
    }).join('') + '</div>';
  }

  function roll(data) {
    var m = data.m;
    var floorsDesc = m.floors.slice().reverse().concat(m.unplaced.length ? [{ label: 'Piano da indicare', units: m.unplaced }] : []);
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
            '<span role="cell" data-l="12 mesi">' + stripHTML(u, m.month) + '</span>' +
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
  function monthPanel(data) {
    var m = data.m, by = function (states) { return m.units.filter(function (u) { return states.indexOf(u.month.state) >= 0; }); };
    var late = by(['late']).sort(function (a, b) { return b.month.lateDays - a.month.lateDays; });
    var due = by(['due']), check = by(['review', 'norate', 'unknown']), free = by(['vacant', 'incoming']), paid = by(['paid']);
    function line(u, right, note) {
      return '<button type="button" class="plz-line" data-plz="select" data-id="' + esc(u.id) + '"><i class="plz-s-' + u.month.state + '" aria-hidden="true"></i><span><b>' + esc(unitTitle(u)) + '</b> ' + esc(u.month.tenants.length ? u.month.tenants[0] : '') + (note ? '<small>' + esc(note) + '</small>' : '') + '</span><em>' + right + '</em></button>';
    }
    function block(title, units, fn, empty) {
      return '<section class="plz-block"><h3>' + title + ' <b>' + units.length + '</b></h3>' + (units.length ? units.map(fn).join('') : '<p class="plz-muted">' + empty + '</p>') + '</section>';
    }
    return '<div class="plz-pcard"><p class="plz-eyebrow">' + esc(E.monthLabel(m.month)) + ' in breve</p>' +
      block('Non hanno pagato', late, function (u) { return line(u, eur(u.month.lateAmount || u.month.expected), u.month.lateDays ? u.month.lateDays + (u.month.lateDays === 1 ? ' giorno' : ' giorni') + ' di ritardo' : 'scaduto'); }, 'Nessun ritardo.') +
      (due.length ? block('Devono ancora pagare', due, function (u) { var r = u.month.rows.find(function (x) { return x.state === 'due'; }); return line(u, eur(u.month.expected), r && r.dueDate ? 'scade il ' + dateIt(r.dueDate) : ''); }, '') : '') +
      (check.length ? block('Da verificare', check, function (u) { return line(u, '', stateLabel(u.month, m.month, m.currentMonth)); }, '') : '') +
      block('Liberi', free, function (u) { return line(u, '', freeNote(u)); }, 'Tutto pieno.') +
      block('Hanno pagato', paid, function (u) {
        var r = u.month.rows.find(function (x) { return x.paidDate; }) || u.month.rows[0];
        // Una rata che copre più mesi si conta nel mese in cui scade: qui si
        // dice che il mese è coperto, con l'importo vero, non "€0".
        var multi = r && r.coversTo && r.coversTo !== r.month;
        var span = multi ? 'rata ' + E.monthLabel(r.month, true) + '–' + E.monthLabel(r.coversTo, true) + ' · ' : '';
        return line(u, multi && !u.month.collected ? eur(r.amount) : eur(u.month.collected || u.month.expected), span + (r && r.paidDate ? 'pagata il ' + dateIt(r.paidDate) : ''));
      }, 'Ancora nessun pagamento registrato questo mese.') +
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
  function punctuality(t) {
    if (!t || !t.paidCount) return t && t.since ? 'Nessuna rata ancora pagata da ' + E.monthLabel(t.since).toLowerCase() + ' (gestione BOOM)' : 'Nessuna rata pagata negli ultimi 12 mesi';
    var d = t.avgDelay, when = d < -0.4 ? itNum(Math.abs(d)) + (Math.abs(d) === 1 ? ' giorno prima' : ' giorni prima') : d > 0.4 ? itNum(d) + (d === 1 ? ' giorno dopo' : ' giorni dopo') : 'il giorno della scadenza';
    return 'Paga in media ' + when + ' · ' + t.onTime + ' rate su ' + t.paidCount + ' puntuali';
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
  function contactIdsOf(m) {
    var seen = Object.create(null), out = [];
    (m && m.units || []).forEach(function (u) { var id = u.month.contractId; if (id && !seen[id]) { seen[id] = 1; out.push(id); } });
    return out;
  }
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
  // WhatsApp vuole il prefisso: un cellulare italiano scritto senza +39 lo riceve.
  function waNumber(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (String(phone).charAt(0) !== '+' && /^3\d{8,9}$/.test(d)) d = '39' + d;
    return d;
  }
  function fmtPhone(phone) {
    var s = String(phone || ''), d = s.replace(/\D/g, '');
    var g = function (x) { return x.length === 10 ? x.slice(0, 3) + ' ' + x.slice(3, 6) + ' ' + x.slice(6) : x; };
    if (/^\+39\d{9,10}$/.test(s)) return '+39 ' + g(d.slice(2));
    if (/^3\d{9}$/.test(s)) return g(s);
    return s;
  }
  function rollPhone(um) {
    var list = um.occupied || um.state === 'incoming' ? contactsOf(um) : undefined;
    var p = Array.isArray(list) && list.find(function (x) { return x.phone; });
    return p ? '<a class="plz-tel" href="tel:' + esc(p.phone) + '" aria-label="' + esc('Chiama ' + (p.name || '') + ' ' + fmtPhone(p.phone)) + '">' + esc(fmtPhone(p.phone)) + '</a>' : '';
  }
  function personHTML(p) {
    var links = [];
    if (p.phone) {
      links.push('<a class="plz-btn plz-sm plz-primary" href="tel:' + esc(p.phone) + '">Chiama</a>');
      links.push('<a class="plz-btn plz-sm" href="https://wa.me/' + esc(waNumber(p.phone)) + '" target="_blank" rel="noopener">WhatsApp</a>');
    }
    if (p.email) links.push('<a class="plz-btn plz-sm" href="mailto:' + esc(p.email) + '">Email</a>');
    return '<li class="plz-person"><p class="plz-person-n"><b>' + esc(p.name || 'Senza nome') + '</b>' + (p.role === 'cotenant' ? '<small>co-intestatario</small>' : '') + '</p>' +
      '<p class="plz-person-c">' + (p.phone ? '<span class="plz-num">' + esc(fmtPhone(p.phone)) + '</span>' : '<span class="plz-muted">telefono non in archivio</span>') + (p.email ? '<span>' + esc(p.email) + '</span>' : '') + '</p>' +
      (links.length ? '<div class="plz-reach">' + links.join('') + '</div>' : '') + '</li>';
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
  function adminActions(u, data) {
    var um = u.month, cid = um.contractId, reg = u.paper && u.paper.registration;
    var b = function (act, label, extra, primary) { return '<button type="button" class="plz-btn' + (primary ? ' plz-primary' : '') + '" data-plz="' + act + '"' + (extra || '') + '>' + label + '</button>'; };
    var open = um.rows.filter(function (r) { return r.state === 'overdue' || r.state === 'due'; })[0];
    var groups = [];
    groups.push(['Soldi', b('rent', 'Gestisci canoni', ' data-id="' + esc(u.id) + '"', true) +
      (open && open.id && adapter.rataLinks ? b('rata', 'Manda il link della rata', ' data-pay="' + esc(open.id) + '" data-id="' + esc(u.id) + '"') : open && open.id ? b('paylink', 'Link di pagamento', ' data-pay="' + esc(open.id) + '"') : '')]);
    if (cid) {
      groups.push(['Contratto', b('contract', 'Apri contratto', ' data-id="' + esc(cid) + '"') + b('pdf', 'PDF', ' data-id="' + esc(cid) + '"') +
        b('firma', 'Firma ora', ' data-id="' + esc(cid) + '"')]);
      groups.push(['Registrazione', (reg && reg.status !== 'registered' ? b('rli', '✓ RLI registrato', ' data-id="' + esc(cid) + '"', !!reg.late) : '') +
        b('aspi', 'Invia ad ASPI', ' data-id="' + esc(cid) + '"') + b('fiscale', 'Fascicolo fiscale', ' data-id="' + esc(cid) + '"') +
        b('arpe', 'Scheda ARPE', ' data-id="' + esc(cid) + '"')]);
    }
    groups.push(['Interno', b('dossier', 'Fascicolo immobile', ' data-id="' + esc(u.id) + '"') + b('edit', 'Modifica interno', ' data-id="' + esc(u.id) + '"') +
      (u.pipeline.proposal ? '<a class="plz-btn" href="/pre-agreement-admin.html" target="_blank" rel="noopener">Proposta ' + esc(u.pipeline.proposal.ref || '') + ' ↗</a>' : '') +
      (u.pipeline.listing ? '<a class="plz-btn" href="' + esc(u.pipeline.listing.url) + '" target="_blank" rel="noopener">Annuncio ↗</a>' : '')]);
    return groups.map(function (g) { return '<div class="plz-agroup"><p class="plz-agroup-l">' + g[0] + '</p><div class="plz-agroup-b">' + g[1] + '</div></div>'; }).join('');
  }
  var PRI_LABEL = { urgent: 'Emergenza', high: 'Urgente', medium: 'Normale', low: 'Non urgente' };
  var CAT_OPTS = [['plumbing', 'Acqua / scarichi'], ['heating', 'Caldaia / riscaldamento'], ['electrical', 'Luce / prese'], ['appliance', 'Elettrodomestici'],
    ['locks', 'Porta / serratura'], ['leaks', 'Infiltrazioni / umidità'], ['common', 'Parti comuni'], ['other', 'Altro']];
  // La manutenzione dell'interno: ciò che è aperto (urgente prima), la
  // segnalazione dalla scheda e il link per l'inquilino. Il guasto si scrive
  // sul server (/api/maintenance/guasto): così parte anche il ping all'operatore.
  function maintHTML(u, data) {
    var mt = u.maintenance || { open: [], recentClosed: [] }, admin = data.admin;
    var who = function (x) { return x.reporter === 'owner' ? 'da te' : x.reporter === 'admin' ? 'da BOOM' : x.reporter === 'tenant' ? 'dall’inquilino' : ''; };
    var item = function (x) {
      var label = (admin ? '' : '') + '<b>' + esc(x.title) + '</b><small>' + esc([PRI_LABEL[x.priority], x.inProgress ? 'in lavorazione' : 'aperto', x.createdAt ? 'dal ' + dateIt(x.createdAt) : '', admin ? (x.reporter === 'owner' ? 'dalla proprietaria' : x.reporter === 'admin' ? 'da BOOM' : x.reporter === 'tenant' ? 'dall’inquilino' : '') : who(x)].filter(Boolean).join(' · ')) + '</small>';
      return '<li class="plz-mitem plz-mp-' + x.priority + '">' + (admin && x.id ? '<button type="button" class="plz-mopen" data-plz="maint" data-id="' + esc(x.id) + '">' + label + '</button>' : '<span>' + label + '</span>') + '</li>';
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
    var link = ui.links && ui.links[u.id];
    var reach = link ? tenantShare(u, link) : '';
    return '<p class="plz-eyebrow">Manutenzione</p>' + list + done + form +
      (ui.reportFor === u.id ? '' : '<div class="plz-actions plz-mact"><button type="button" class="plz-btn plz-sm" data-plz="maint-new" data-id="' + esc(u.id) + '">🔧 Segnala un guasto</button>' +
        (u.month.contractId && adapter.links ? '<button type="button" class="plz-btn plz-sm" data-plz="maint-link" data-id="' + esc(u.id) + '">Link per l’inquilino</button>' : '') + '</div>') + reach;
  }
  // Il link del guasto, pronto da mandare all'inquilino: WhatsApp col suo
  // numero (dai contatti già caricati), altrimenti da copiare.
  function tenantShare(u, link) {
    var list = contactsOf(u.month) || [], p = list.find(function (x) { return x.role === 'tenant' && x.phone; }) || list.find(function (x) { return x.phone; });
    var first = String((p && p.name) || u.month.tenants[0] || '').trim().split(/\s+/)[0];
    var txt = (first ? 'Ciao ' + first + ', ' : 'Ciao, ') + 'per segnalare un guasto in casa (' + unitTitle(u).toLowerCase() + ') usa questo link: ' + link + ' — arriva subito a BOOM, che organizza l’intervento.';
    return '<div class="plz-mlink"><input type="text" readonly value="' + esc(link) + '" aria-label="Link per segnalare un guasto">' +
      (p ? '<a class="plz-btn plz-primary plz-sm" href="https://wa.me/' + esc(waNumber(p.phone)) + '?text=' + esc(encodeURIComponent(txt)) + '" target="_blank" rel="noopener">WhatsApp a ' + esc(first || 'inquilino') + '</a>' : '') +
      '<button type="button" class="plz-btn plz-sm" data-plz="copy-link" data-text="' + esc(txt) + '">Copia messaggio</button></div>';
  }
  // ── La rata in tasca all'inquilino ─────────────────────────────────────
  // UN link per rata (/rata, api/payments/rata.js): carta o Apple Pay, oppure
  // "ho fatto il bonifico" con la foto della ricevuta. Il link lo calcola il
  // server (il token è derivato da un segreto); qui si compone il messaggio
  // col nome e il numero dell'inquilino, dai contatti già caricati.
  function payable(r) { return r && (r.state === 'due' || r.state === 'overdue') && r.amount != null && r.amount > 0 && !/^missing-id:/.test(r.id); }
  function rataMessage(u, r, url) {
    var list = contactsOf(u.month) || [], p = list.find(function (x) { return x.role === 'tenant' && x.phone; }) || list.find(function (x) { return x.phone; });
    var first = String((p && p.name) || r.tenantName || u.month.tenants[0] || '').trim().split(/\s+/)[0];
    var late = r.state === 'overdue';
    var txt = (first ? 'Ciao ' + first : 'Ciao') + ', ecco la rata di ' + E.monthLabel(r.month).toLowerCase() + ' (' + unitTitle(u).toLowerCase() + '): ' + eur(r.amount) +
      (r.dueDate ? (late ? ', scaduta il ' : ' entro il ') + dateIt(r.dueDate) : '') +
      '. Puoi pagarla con carta o Apple Pay, oppure segnalare il bonifico con la foto della ricevuta, da qui: ' + url;
    return { txt: txt, phone: p ? p.phone : '', first: first };
  }
  var SKIP_WHY = { already_paid: 'risulta già pagata', payment_reported: 'il bonifico è già segnalato', sdd_processing: 'addebito SEPA in corso', payment_processing: 'pagamento in corso',
    payment_cancelled: 'rata annullata', payment_not_payable: 'stato da verificare', not_found: 'rata non trovata' };
  function rataShare(u, r) {
    var R = ui.rata, url = R.urls[r.id];
    if (R.pending[r.id]) return '<p class="plz-muted plz-rshare">Preparo il link…</p>';
    if (R.skipped[r.id]) return '<p class="plz-note plz-rshare">Link non creato: ' + esc(SKIP_WHY[R.skipped[r.id]] || R.skipped[r.id]) + '.</p>';
    if (!url) return R.failed ? '<p class="plz-note plz-rshare">Link non disponibile ora · <button type="button" class="plz-linkbtn" data-plz="rata" data-pay="' + esc(r.id) + '" data-id="' + esc(u.id) + '">riprova</button></p>' : '';
    var msg = rataMessage(u, r, url), sent = R.sent[r.id];
    return '<div class="plz-mlink plz-rshare"><input type="text" readonly value="' + esc(url) + '" aria-label="Link della rata">' +
      (msg.phone ? '<a class="plz-btn plz-primary plz-sm" data-sent="' + esc(r.id) + '" href="https://wa.me/' + esc(waNumber(msg.phone)) + '?text=' + esc(encodeURIComponent(msg.txt)) + '" target="_blank" rel="noopener">' + (sent ? '✓ Inviato · di nuovo' : 'WhatsApp a ' + esc(msg.first || 'inquilino')) + '</a>' : '<span class="plz-muted">Nessun telefono in archivio</span>') +
      '<button type="button" class="plz-btn plz-sm" data-plz="copy-link" data-text="' + esc(msg.txt) + '">Copia messaggio</button></div>';
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
  // Tutte le rate aperte del mese, una riga per inquilino: un tap a testa.
  function rataBar(data) {
    if (!data.admin || typeof adapter.rataLinks !== 'function') return '';
    var open = [];
    data.m.units.forEach(function (u) { u.month.rows.forEach(function (r) { if (payable(r) && r.month === data.m.month) open.push({ u: u, r: r }); }); });
    var head = '<div class="plz-export plz-ratabar"><p>Rate del mese</p><button type="button" class="plz-btn plz-sm' + (ui.rataOpen ? '' : ' plz-primary') + '" data-plz="rata-all" aria-expanded="' + (ui.rataOpen ? 'true' : 'false') + '"' + (open.length ? '' : ' disabled') + '>' +
      (open.length ? '📨 Manda i link di ' + esc(E.monthLabel(data.m.month).toLowerCase()) + ' · ' + open.length : 'Nessuna rata aperta in ' + esc(E.monthLabel(data.m.month).toLowerCase())) + '</button></div>';
    if (!ui.rataOpen || !open.length) return head;
    open.sort(function (a, b) { return (b.r.state === 'overdue') - (a.r.state === 'overdue') || String(a.u.interno || a.u.name).localeCompare(String(b.u.interno || b.u.name), 'it', { numeric: true }); });
    var sent = open.filter(function (x) { return ui.rata.sent[x.r.id]; }).length;
    return head + '<div class="plz-ratalist" id="plz-ratalist"><p class="plz-muted">Ogni messaggio porta il link della SUA rata: carta o Apple Pay, oppure il bonifico con la ricevuta. Chi segnala il bonifico passa in «In attesa» finché non premi Registra incasso. Inviati in questa sessione: ' + sent + ' di ' + open.length + '.</p>' +
      open.map(function (x) {
        return '<div class="plz-rataitem' + (ui.rata.sent[x.r.id] ? ' is-sent' : '') + '"><p class="plz-rataitem-h"><b>' + esc(unitTitle(x.u)) + '</b> ' + esc(x.r.tenantName || x.u.month.tenants[0] || '') +
          ' · <span class="plz-num">' + eur(x.r.amount) + '</span>' + (x.r.state === 'overdue' ? ' · <span class="plz-red">scaduta</span>' : '') + '</p>' + rataShare(x.u, x.r) + '</div>';
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
  function unitPanel(u, data, enter) {
    var m = data.m, um = u.month, admin = data.admin, A0 = (adapter && adapter.actions) || {};
    var lease = um.lease || um.incoming;
    var rows = um.rows.map(function (r) {
      var st = { paid: 'Pagato', overdue: 'Non pagato', due: 'Da pagare', reported: 'Segnalato · da verificare', processing: 'In corso', unknown: 'Da verificare' }[r.state] || 'Da verificare';
      var p = r.payment || {}, proof = r.state === 'reported' ? safeUrl(p.proofUrl) : '';
      var rep = r.state === 'reported' ? 'bonifico segnalato' + (/^\d{4}-\d{2}-\d{2}$/.test(String(p.tenantReportDate || '')) ? ' del ' + dateIt(p.tenantReportDate) : '') + (p.tenantNotes ? ' · «' + String(p.tenantNotes).slice(0, 80) + '»' : '') : '';
      var acts = (proof ? '<a class="plz-btn plz-sm" href="' + esc(proof) + '" target="_blank" rel="noopener">Ricevuta ↗</a>' : '') +
        (admin && payable(r) && adapter.rataLinks ? '<button type="button" class="plz-btn plz-sm' + (r.state === 'overdue' ? ' plz-primary' : '') + '" data-plz="rata" data-pay="' + esc(r.id) + '" data-id="' + esc(u.id) + '">Manda il link</button>' : '') +
        (admin && (payable(r) || r.state === 'reported') && A0.record ? '<button type="button" class="plz-btn plz-sm" data-plz="record" data-pay="' + esc(r.id) + '">Registra incasso</button>' : '');
      return '<li><span>' + esc(r.month && r.coversTo && r.coversTo !== r.month ? E.monthLabel(r.month, true) + '→' + E.monthLabel(r.coversTo, true) : E.monthLabel(r.month)) + '</span><b class="plz-num">' + eur(r.amount) + (Number(p.oneriAmount) > 0 ? '<small>di cui oneri ' + eur(Number(p.oneriAmount)) + '</small>' : '') + '</b><em class="plz-pill plz-s-' + ({ overdue: 'late', reported: 'review', processing: 'review' }[r.state] || r.state) + '">' + st + '</em><small>' + esc(rep || (r.paidDate ? 'pagato il ' + dateIt(r.paidDate) : r.dueDate ? 'scadenza ' + dateIt(r.dueDate) : '')) + '</small>' +
        (acts ? '<div class="plz-rowact">' + acts + '</div>' : '') + (admin && ui.rata.open === r.id ? rataShare(u, r) : '') + '</li>';
    }).join('');
    var pdf = lease && (lease.signedPdfUrl || lease.generatedPDF);
    var safe = function (url) { try { var x = new URL(url); return x.protocol === 'https:' ? x.href : ''; } catch (_) { return ''; } };
    var actions = admin ? adminActions(u, data) : (safe(pdf) ? '<a class="plz-btn" href="' + esc(safe(pdf)) + '" target="_blank" rel="noopener">Contratto (PDF) ↗</a>' : '') + '<button type="button" class="plz-btn" data-plz="inbox">Scrivi a BOOM</button>';
    var pp = u.paper, reg = pp && pp.registration;
    var exp = um.leaseEnd ? expiry(um.leaseEnd, m.today) : um.state === 'incoming' && um.leaseStart ? startsIn(um.leaseStart, m.today) : '';
    var kind = leaseType(lease), dep = depositOf(lease);
    var oneri = lease && Number(lease.oneriQuota) > 0 ? Number(lease.oneriQuota) : 0;
    var iban = lease ? String(lease.landlordIban || '').replace(/\s+/g, '').toUpperCase() : '';
    iban = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) ? iban.replace(/(.{4})/g, '$1 ').trim() : '';
    return '<div class="plz-pcard plz-unitcard' + (enter ? ' is-enter' : '') + '"><button type="button" class="plz-close" data-plz="deselect" aria-label="Chiudi">×</button>' +
      '<p class="plz-eyebrow">' + esc(unitWhere(u)) + '</p><h2 id="plz-unit-h" tabindex="-1">' + esc(unitTitle(u)) + '</h2>' +
      '<span class="plz-pill plz-s-' + um.state + ' plz-big">' + esc(stateLabel(um, m.month, m.currentMonth)) + ' · ' + esc(E.monthLabel(m.month).toLowerCase()) + '</span>' +
      (u.ownerMismatch && admin ? '<p class="plz-note">Non collegato al profilo di ' + esc(m.owner && (m.owner.name || m.owner.email) || 'proprietaria') + ': dal suo accesso non lo vede.</p>' : '') +
      (um.contractId ? peopleHTML(u, data) : '<p class="plz-people-names plz-muted">' + (um.state === 'vacant' ? 'Libero' + (u.time && u.time.vacantDays != null ? ' da ' + u.time.vacantDays + (u.time.vacantDays === 1 ? ' giorno' : ' giorni') : '') : esc(um.tenants.join(' · ') || '—')) + '</p>') +
      (lease && lease.contractMissing === true ? '<p class="plz-note">' + (admin ? 'Contratto non ancora in archivio: canone, date e rate arrivano quando lo carichi.' : 'Contratto in arrivo da BOOM: canone e scadenze compariranno qui.') + '</p>' : '') +
      (um.leaseStart || um.leaseEnd ? '<div class="plz-term' + (um.leaving ? ' is-leaving' : '') + '"><p class="plz-term-k">' + esc(kind || 'Contratto') + '</p><p class="plz-term-d">' + esc((um.leaseStart ? 'dal ' + dateIt(um.leaseStart) : '') + (um.leaseEnd ? ' al ' + dateIt(um.leaseEnd) : '')) + '</p>' + (exp ? '<p class="plz-term-x">' + esc(exp) + '</p>' : '') + '</div>' : '') +
      '<dl class="plz-facts">' +
      '<div><dt>Canone</dt><dd class="plz-num">' + (um.rent != null ? eur(um.rent) + ' / mese' : '—') + '</dd></div>' +
      (oneri ? '<div><dt>Oneri accessori</dt><dd class="plz-num">' + eur(oneri) + ' / mese <small>insieme al canone</small></dd></div>' : '') +
      (dep ? '<div><dt>Deposito</dt><dd class="plz-num">' + esc(dep) + '</dd></div>' : '') +
      (lease && String(lease.landlordName || '').trim() ? '<div><dt>Locatore</dt><dd>' + esc(String(lease.landlordName).slice(0, 120)) + '</dd></div>' : '') +
      (admin && lease ? '<div><dt>Conto per il bonifico</dt><dd' + (iban ? ' class="plz-num">' + esc(iban) : ' class="plz-muted">non in archivio: la pagina della rata dice «il conto di sempre»') + '</dd></div>' : '') +
      (reg ? '<div><dt>Registrazione</dt><dd class="' + (admin && reg.late ? 'plz-red' : '') + '">' + esc(regText(reg, admin)) + '</dd></div>' : '') +
      (pp && (pp.cedolare != null || admin) ? '<div><dt>Cedolare secca</dt><dd>' + (pp.cedolare === true ? 'sì' : pp.cedolare === false ? 'no' : 'non indicata nel contratto') + '</dd></div>' : '') +
      '<div><dt>Arretrati</dt><dd class="plz-num' + (u.arrears.amount ? ' plz-red' : '') + '">' + (u.arrears.amount ? eur(u.arrears.amount) + ' · ' + u.arrears.count + (u.arrears.count === 1 ? ' rata' : ' rate') + (u.arrears.oldest ? ' dal ' + dateIt(u.arrears.oldest) : '') : 'Nessuno') + '</dd></div>' +
      '<div><dt>Puntualità</dt><dd>' + esc(punctuality(u.time)) + '</dd></div>' +
      '<div><dt>12 mesi</dt><dd>' + (u.time ? 'occupato ' + u.time.occupiedMonths + ' mesi su 12' : '—') + '</dd></div>' +
      (admin && (u.pipeline.proposal || u.pipeline.listing) ? '<div><dt>In corso</dt><dd>' + esc(pipelineText(u)) + '</dd></div>' : '') +
      utenzeFacts(u, admin) +
      '</dl>' + maintHTML(u, data) + '<p class="plz-eyebrow">Ultimi 12 mesi</p>' + stripHTML(u, m.month) +
      '<p class="plz-eyebrow">Rate di ' + esc(E.monthLabel(m.month).toLowerCase()) + '</p>' + (rows ? '<ul class="plz-rows">' + rows + '</ul>' : '<p class="plz-muted">' + (um.state === 'before' ? 'Prima della gestione BOOM (dal ' + esc(E.monthLabel(um.gestioneDal).toLowerCase()) + '): i pagamenti di questo mese non sono in archivio.' : um.occupied ? 'Nessuna rata registrata per questo mese.' : 'Nessun contratto in questo mese.') + '</p>') +
      '<div class="plz-actions">' + actions + '</div></div>';
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
    var keys = E.TONES.filter(function (t) { return t.key !== 'prima' || m.totals.before; }).map(function (t) { return [t.states[0], t.label]; });
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
      (m.unplaced.length ? '<div class="plz-fac-yard"><p>Senza piano · indicalo dalla scheda</p><div class="plz-fac-bays" style="--cols:' + Math.min(6, Math.max(2, m.unplaced.length)) + '">' + m.unplaced.map(function (u, k) { return win(u, k); }).join('') + '</div></div>' : '') +
      '<figcaption class="plz-fac-cap"><span class="plz-keys">' + keys.map(function (k) { return '<span class="plz-key" data-state="' + k[0] + '"><i></i>' + k[1] + '</span>'; }).join('') + '</span>' +
      '<small>Una finestra per interno; la posizione sul piano è schematica e i fianchi sono ciechi. Finestre senza numero: interni non gestiti da BOOM. Trascina per girare il palazzo.' +
      (data.admin && !(look.declared.intonaco || look.declared.persiane) && !ui.draft ? ' Aspetto neutro: imposta intonaco e persiane veri qui sotto.' : '') + '</small></figcaption></figure>';
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
    return '<div class="plz-brief"><p class="plz-eyebrow">' + esc(E.monthLabel(m.month)) + ' in breve</p><p class="plz-lead">' + esc((b[0] || '').replace(/^[^:]+:\s*/, '')) + '</p>' +
      (b.length > 1 ? '<p class="plz-rest">' + esc(b.slice(1).join(' ')) + '</p>' : '') + '</div>';
  }
  function cards(data) {
    var m = data.m, admin = data.admin, by = function (states) { return m.units.filter(function (u) { return states.indexOf(u.month.state) >= 0; }); };
    var late = by(['late']).sort(function (a, b) { return b.month.lateDays - a.month.lateDays; });
    var due = by(['due']), check = by(['review', 'norate', 'unknown']), free = by(['vacant', 'incoming']), paid = by(['paid']);
    var row = function (u, right, note, action) {
      return '<div class="plz-srow"><button type="button" class="plz-line" data-plz="select" data-id="' + esc(u.id) + '"><i class="plz-s-' + u.month.state + '" aria-hidden="true"></i><span><b>' + esc(unitTitle(u)) + '</b> ' + esc(u.month.tenants[0] || '') + (note ? '<small>' + esc(note) + '</small>' : '') + '</span><em>' + right + '</em></button>' + (action || '') + '</div>';
    };
    var sollecita = function (u) {
      var r = u.month.rows.find(function (x) { return x.state === 'overdue'; });
      return admin && r ? (adapter.rataLinks ? '<button type="button" class="plz-btn plz-primary plz-sm" data-plz="rata" data-pay="' + esc(r.id) + '" data-id="' + esc(u.id) + '">Sollecita</button>'
        : '<button type="button" class="plz-btn plz-primary plz-sm" data-plz="paylink" data-pay="' + esc(r.id) + '">Sollecita</button>') : '';
    };
    var manda = function (u) {
      var r = u.month.rows.find(function (x) { return x.state === 'due'; });
      return admin && r && adapter.rataLinks ? '<button type="button" class="plz-btn plz-sm" data-plz="rata" data-pay="' + esc(r.id) + '" data-id="' + esc(u.id) + '">Manda il link</button>' : '';
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
    return card('is-late', 'Non hanno pagato', late.length, late.length ? late.map(function (u) { return row(u, eur(u.month.lateAmount || u.month.expected), u.month.lateDays ? u.month.lateDays + (u.month.lateDays === 1 ? ' giorno' : ' giorni') + ' di ritardo' : 'scaduto', sollecita(u)); }).join('') : '<p class="plz-ok">Tutti in regola.</p>') +
      (due.length ? card('', 'Devono ancora pagare', due.length, due.map(function (u) { var r = u.month.rows.find(function (x) { return x.state === 'due'; }); return row(u, eur(u.month.expected), r && r.dueDate ? 'entro il ' + dateIt(r.dueDate) : '', manda(u)); }).join('')) : '') +
      (check.length ? card('', 'Da verificare', check.length, check.map(function (u) { return row(u, '', stateLabel(u.month, m.month, m.currentMonth)); }).join('')) : '') +
      mcard +
      card('', 'Liberi', free.length, free.length ? free.map(function (u) { return row(u, '', freeNote(u)); }).join('') : '<p class="plz-ok">Tutto pieno.</p>') +
      '<details class="plz-scard plz-paidcard"' + (ui.paidOpen ? ' open' : '') + '><summary><h3>Hanno pagato <b>' + paid.length + '</b></h3></summary>' + paid.map(function (u) { return row(u, eur(u.month.collected || u.month.expected), ''); }).join('') + '</details>';
  }
  function simple(data) {
    return '<div id="plz-sbrief">' + briefHTML(data) + '</div>' +
      '<div class="plz-sgrid"><div class="plz-scol">' + facade(data) + (data.admin ? lookPanel(data) : '') + '</div>' +
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
      var tip = E.monthLabel(x.month) + ': incassato ' + eur(x.collected) + ' su ' + eur(x.expected) + (x.late ? ' · in ritardo ' + eur(x.late) : '');
      return '<button type="button" class="plz-abar' + (on ? ' is-on' : '') + '" data-plz="month" data-m="' + x.month + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        (on ? '<span class="plz-aval">' + eur(x.collected) + '</span>' : '') + '<span class="plz-atrack" style="height:' + hE + '%"><i style="height:' + (hE ? Math.round(hC / hE * 100) : 0) + '%"></i></span><small>' + E.monthLabel(x.month, true) + '</small></button>';
    }).join('');
    var pct = function (v) { return v == null ? '—' : v + '%'; };
    var delay = A.avgDelay == null ? 'nessun dato' : A.avgDelay < -0.4 ? 'in media ' + itNum(Math.abs(A.avgDelay)) + ' giorni prima' : A.avgDelay > 0.4 ? 'in media ' + itNum(A.avgDelay) + ' giorni dopo la scadenza' : 'in media alla scadenza';
    var EXP_MAX = 5, more = A.expiries.length - EXP_MAX;
    var exp = A.expiries.length ? A.expiries.slice(0, EXP_MAX).map(function (e) { return '<li><b>' + esc(e.interno ? 'Int. ' + e.interno : e.name) + '</b> ' + esc(e.tenants[0] || '') + '<em>' + dateIt(e.date) + (e.next ? ' · ' + (e.next.kind === 'reserved' ? 'nuovo inquilino pronto' : 'in trattativa') : '') + '</em></li>'; }).join('') + (more > 0 ? '<li class="plz-muted">e altri ' + more + ' · vedi Elenco</li>' : '') : '<li class="plz-muted">Nessun contratto finisce nei prossimi 12 mesi.</li>';
    return '<div class="plz-ahead"><p class="plz-eyebrow">Andamento · ultimi 12 mesi</p></div><div class="plz-agrid">' +
      '<div class="plz-acard plz-achart"><h3>Incassato su atteso, per mese</h3><div class="plz-abars" role="group" aria-label="Incassato su atteso, per mese">' + bars + '</div></div>' +
      '<div class="plz-acard"><span>Incassato su scaduto</span><strong>' + pct(A.collectionPct) + '</strong><em>' + eur(A.collected12) + ' di ' + eur(A.expected12) + '</em></div>' +
      '<div class="plz-acard"><span>Puntualità</span><strong>' + pct(A.onTimePct) + '</strong><em>' + A.onTime + ' rate su ' + A.paidCount + ' entro la scadenza · ' + delay + '</em></div>' +
      '<div class="plz-acard"><span>Occupazione 12 mesi</span><strong>' + A.occupancy12 + '%</strong><em>' + A.vacantMonths + (A.vacantMonths === 1 ? ' mese' : ' mesi') + ' di sfitto in tutto il palazzo</em></div>' +
      '<div class="plz-acard plz-alist"><span>Contratti che finiscono entro un anno</span><ul>' + exp + '</ul></div>' +
      '</div>';
  }

  // ── Aggiornamenti senza ricostruire la scena ──────────────────────────
  // Cambiare mese (anche in riproduzione) ricolora i cubi esistenti: le
  // facce sfumano da un colore all'altro invece di ridisegnarsi da capo.
  function patch() {
    if (!adapter || !doc || !doc.querySelector('.plz')) return;
    var data = compute(); last = data;
    ensureContacts(data.m);
    var m = data.m, set = function (id, html) { var el = doc.getElementById(id); if (el) el.innerHTML = html; };
    if (ui.view === 'simple') {
      set('plz-issues', issues(data)); set('plz-sbrief', briefHTML(data)); set('plz-scards', cards(data) + exportBar(data)); set('plz-panel', ui.selected ? panel(data) : '');
      if (doc.getElementById('plz-fac')) patchFacade(data); else { set('plz-simple', simple(data)); syncFacade(); }
      var lab0 = doc.getElementById('plz-month-label'); if (lab0) lab0.textContent = E.monthLabel(m.month);
      toggleToday(m);
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
  function select(id) {
    ui.selected = ui.selected === id ? '' : id;
    patch();
    if (ui.selected) {
      var h = doc.getElementById('plz-unit-h'); if (h) h.focus({ preventScroll: true });
      var p = doc.getElementById('plz-panel');
      if (p && root.matchMedia && root.matchMedia('(max-width: 920px)').matches) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  function mount() {
    if (!doc) return;
    var st = doc.getElementById('plz-stage'), w = world();
    lightsOn();
    syncFacade();
    if (last) ensureContacts(last.m);
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
    if (el && el.getAttribute && el.getAttribute('data-imp') && ui.imp) { ui.imp[el.getAttribute('data-imp')] = el.value; return; }
    if (!el || !el.getAttribute || !el.getAttribute('data-look') || !adapter || !viewAdmin()) return;
    readDraft(el);
  }
  function onToggle(e) {
    var el = e.target;
    if (!el || !el.classList) return;
    if (el.id === 'plz-look') ui.lookOpen = el.open;
    if (el.classList.contains('plz-paidcard')) ui.paidOpen = el.open;
  }

  // ── La presa in carico: il palazzo da una tabella (solo admin) ────────
  // La proprietaria ha già il suo elenco: incollato qui diventa interni,
  // contratti e rate (E.parseRentRoll → E.planImport, puri). Si scrive solo
  // dopo l'anteprima, col tasto che dice cosa nasce, e le rate partono da
  // "gestione BOOM dal": mai arretrati inventati prima di BOOM.
  function impDefaults(data) {
    var m = data.m, o = m && m.owner;
    return { address: m && m.building ? m.building.label : '', ownerId: o && o.id || '', from: (m && m.currentMonth) || '', text: '', parsed: null, plan: null };
  }
  function importPanel(data) {
    var st = ui.imp, S = data.S || {};
    var owners = (S.users || []).filter(function (u) { return u.role === 'landlord' || u.role === 'owner'; })
      .sort(function (a, b) { return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'it'); });
    return '<section class="plz-import" aria-labelledby="plz-imp-h"><p class="plz-eyebrow" id="plz-imp-h">Carica il palazzo da una tabella</p>' +
      '<p class="plz-muted">Incolla da Excel o Google Sheets la riga dei titoli e una riga per interno. Titoli letti: Interno · Piano · Inquilino · Co-intestatari · Telefono · Email · Canone · Oneri · Dal · Al · Tipo · Deposito · Cedolare · Registrato il · Pagato il · Locatore · IBAN · Mq · POD · PDR. Serve solo Interno; per un interno affittato anche Canone, Dal e Al. Gli oneri fissi entrano nella rata insieme al canone; l’IBAN è il conto che l’inquilino vede per il bonifico. «Pagato il» vale per il primo mese di gestione.</p>' +
      '<div class="plz-import-f"><label><span>Indirizzo del palazzo</span><input type="text" data-imp="address" value="' + esc(st.address) + '" placeholder="Piazzale Prenestino 42, Roma" autocomplete="off"></label>' +
      '<label><span>Proprietaria</span><select data-imp="ownerId"><option value="">Scegli…</option>' + owners.map(function (u) {
        return '<option value="' + esc(u.id) + '"' + (u.id === st.ownerId ? ' selected' : '') + '>' + esc(u.name || u.email || u.id) + '</option>';
      }).join('') + '</select></label>' +
      '<label><span>Gestione BOOM dal</span><input type="month" data-imp="from" value="' + esc(st.from) + '"></label></div>' +
      (owners.length ? '' : '<p class="plz-note">Nessun profilo Locatore: crealo in Utenti (ruolo Locatore), poi torna qui.</p>') +
      '<textarea class="plz-import-t" data-imp="text" rows="7" spellcheck="false" aria-label="Tabella degli interni" placeholder="Interno\tPiano\tInquilino\tTelefono\tCanone\tDal\tAl\tTipo\tPagato il">' + esc(st.text) + '</textarea>' +
      '<div class="plz-import-b"><button type="button" class="plz-btn plz-primary plz-sm" data-plz="imp-read">Leggi la tabella</button>' +
      '<button type="button" class="plz-btn plz-sm" data-plz="imp-template">Scarica il modello</button>' +
      '<button type="button" class="plz-btn plz-sm" data-plz="imp-close">Chiudi</button></div>' +
      '<div id="plz-imp-out" aria-live="polite">' + importResult() + '</div></section>';
  }
  function importResult() {
    var st = ui.imp; if (!st || !st.parsed) return '';
    var P = st.parsed, plan = st.plan;
    if (P.errors.indexOf('vuota') >= 0) return '<p class="plz-note">La tabella è vuota.</p>';
    if (P.errors.indexOf('senza_interno') >= 0) return '<p class="plz-note">Nella prima riga manca il titolo «Interno»: è l’unica colonna obbligatoria.</p>';
    var bad = P.rows.filter(function (r) { return r.errors.length; }), warn = P.rows.filter(function (r) { return r.warnings.length; });
    var planErr = plan ? plan.errors : [];
    var msgs = [];
    if (planErr.indexOf('indirizzo') >= 0) msgs.push('Scrivi l’indirizzo del palazzo (via e civico).');
    if (planErr.indexOf('proprietaria') >= 0) msgs.push('Scegli la proprietaria.');
    planErr.filter(function (e) { return /^owner:/.test(e); }).forEach(function (e) { msgs.push('L’interno ' + esc(e.slice(6)) + ' è già in archivio a nome di un altro proprietario: non lo sposto da qui.'); });
    var byLine = Object.create(null); (plan ? plan.payments : []).forEach(function (x) { byLine[x.interno] = (byLine[x.interno] || 0) + 1; });
    var rows = P.rows.map(function (r) {
      var ex = plan && plan.properties.find(function (x) { return x.interno === r.interno; });
      var verdict = r.errors.length ? '<em class="plz-red">' + esc(r.errors.join(' · ')) + '</em>'
        : (ex && ex.exists ? 'già in archivio' : 'nuovo') + (r.senzaContratto ? ' · occupato · contratto da caricare' : r.inquilino ? ' · contratto · ' + (byLine[r.interno] || 0) + ' rate' : ' · libero') + (r.pagatoSi ? ' · pagato' : '');
      return '<tr' + (r.errors.length ? ' class="is-bad"' : '') + '><td>' + esc(r.interno) + '</td><td>' + esc(r.piano || '—') + '</td><td>' + esc(r.inquilino ? [r.inquilino].concat(r.coinquilini || []).join(' + ') : '—') + '</td><td class="plz-num">' + (r.canone != null ? eur(r.canone) + (r.oneri ? '<small>+ ' + eur(r.oneri) + ' oneri</small>' : '') : '—') + '</td><td>' +
        esc(r.dal ? dateIt(r.dal) + ' → ' + dateIt(r.al) : '—') + '</td><td>' + verdict + (r.warnings.length ? '<small>' + esc(r.warnings.join(' · ')) + '</small>' : '') + '</td></tr>';
    }).join('');
    var c = plan ? plan.counts : { create: 0, update: 0, same: 0, contracts: 0, contractUpdates: 0, payments: 0, paid: 0 };
    var cu = c.contractUpdates || 0;
    var can = plan && !bad.length && !planErr.length && (c.create + c.update + c.contracts + cu + c.payments) > 0;
    var go = [c.create ? 'crea ' + c.create + (c.create === 1 ? ' interno' : ' interni') : '', c.update ? 'aggiorna ' + c.update + (c.update === 1 ? ' interno' : ' interni') : '',
      c.contracts ? c.contracts + (c.contracts === 1 ? ' contratto' : ' contratti') : '', cu ? 'completa ' + cu + (cu === 1 ? ' contratto' : ' contratti') : '',
      c.payments ? c.payments + (c.payments === 1 ? ' rata' : ' rate') : ''].filter(Boolean).join(', ');
    (plan ? plan.notes : []).filter(function (n) { return /^oneri:/.test(n); }).forEach(function (n) { msgs.push('Interno ' + esc(n.slice(6)) + ': gli oneri entrano nel contratto, ma le rate già in archivio restano col solo canone — correggile da Gestisci canoni.'); });
    return '<p class="plz-import-sum"><b>' + P.rows.length + (P.rows.length === 1 ? ' riga' : ' righe') + '</b> · ' + c.create + ' interni nuovi, ' + (c.update + (c.same || 0)) + ' già in archivio' + (c.update ? ' (' + c.update + ' da completare)' : '') + ' · ' + c.contracts + ' contratti' + (c.missing ? ' (' + c.missing + ' da caricare)' : '') + (cu ? ' (+' + cu + ' da completare)' : '') + ' · ' + c.payments + ' rate da ' + esc(E.monthLabel(plan ? plan.gestioneDal : st.from).toLowerCase()) +
      (c.paid ? ' (' + c.paid + ' segnate pagate dalla tabella)' : '') + '</p>' +
      (P.unknown.length ? '<p class="plz-muted">Colonne ignorate: ' + esc(P.unknown.join(', ')) + '.</p>' : '') +
      (msgs.length ? '<p class="plz-note">' + msgs.join(' ') + '</p>' : '') +
      (bad.length ? '<p class="plz-note">' + bad.length + (bad.length === 1 ? ' riga da correggere' : ' righe da correggere') + ' (in rosso): sistemale nella tabella e rileggi. Non si carica niente a metà.</p>' : '') +
      (warn.length ? '<p class="plz-muted">' + warn.length + (warn.length === 1 ? ' riga ha' : ' righe hanno') + ' un avviso: si carica lo stesso, il dato non letto resta vuoto.</p>' : '') +
      '<div class="plz-import-wrap"><table class="plz-import-tab"><thead><tr><th>Interno</th><th>Piano</th><th>Inquilino</th><th>Canone</th><th>Contratto</th><th>Esito</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="plz-import-b"><button type="button" class="plz-btn plz-primary" data-plz="imp-go"' + (can ? '' : ' disabled') + '>' + (go ? go.charAt(0).toUpperCase() + go.slice(1) : 'Niente da cambiare') + '</button></div>';
  }
  function importRead() {
    var st = ui.imp; if (!st || !last) return;
    st.parsed = E.parseRentRoll(st.text);
    var owner = (last.S.users || []).find(function (u) { return u.id === st.ownerId; });
    st.plan = st.parsed.rows.length ? E.planImport(st.parsed.rows, last.ctx, { address: st.address, ownerId: st.ownerId, ownerName: owner ? (owner.name || owner.email || '') : '', gestioneDal: st.from }) : null;
    var out = doc.getElementById('plz-imp-out'); if (out) out.innerHTML = importResult();
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
      for (var mm = y + '-01'; mm <= endM; mm = E.monthAdd(mm, 1)) {
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
      var sentId = a.getAttribute('data-sent');
      if (sentId) { ui.rata.sent[sentId] = true; root.setTimeout(function () { if (doc.querySelector('.plz')) patch(); }, 0); }
      return;
    }
    var el = e.target.closest && e.target.closest('[data-plz]');
    if (!el || !el.closest('.plz') || !adapter) return;
    var act = el.getAttribute('data-plz'), id = el.getAttribute('data-id') || '';
    var st = doc.getElementById('plz-stage');
    var fst = doc.getElementById('plz-fac-stage');
    if (act === 'select') { if ((st && st.dataset.justDragged) || (fst && fst.dataset.justDragged)) return; select(id); return; }
    if (act === 'deselect') { ui.selected = ''; patch(); return; }
    if (act === 'contacts-retry') { ui.contacts.failed = Object.create(null); patch(); return; }
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
    if (act === 'inbox' && A.inbox) return A.inbox();
    if (act === 'csv') { var span = el.getAttribute('data-span'); return exportCsv(span === 'year' ? true : span === 'utenze' ? 'utenze' : false); }
    if (act === 'maint-new') { ui.reportFor = id; ui.reportDone = ''; patch(); var ta = doc.querySelector('#plz-mform textarea'); if (ta) ta.focus(); return; }
    if (act === 'maint-cancel') { ui.reportFor = ''; patch(); return; }
    if (act === 'copy-link') { copyText(el.getAttribute('data-text') || '', el); return; }
    if (act === 'rata' && admin) {
      var payId = el.getAttribute('data-pay');
      if (id && ui.selected !== id) ui.selected = id;
      ui.rata.open = payId;
      fetchRata([payId]);
      patch();
      return;
    }
    if (act === 'rata-all' && admin && last) {
      ui.rataOpen = !ui.rataOpen;
      if (ui.rataOpen) {
        var ids = [];
        last.m.units.forEach(function (u) { u.month.rows.forEach(function (r) { if (payable(r) && r.month === last.m.month) ids.push(r.id); }); });
        fetchRata(ids);
      }
      patch();
      return;
    }
    if (act === 'record' && admin && A.record) return A.record(el.getAttribute('data-pay'));
    if (act === 'maint-link' && adapter.links && last) {
      var occ = last.m.units.filter(function (x) { return x.month.contractId; }).map(function (x) { return x.id; });
      el.disabled = true;
      return Promise.resolve(adapter.links(occ.length ? occ : [id])).then(function (links) { ui.links = Object.assign({}, ui.links || {}, links || {}); el.disabled = false; patch(); },
        function () { el.disabled = false; el.textContent = 'Link non disponibile ora · riprova'; });
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
    if (act === 'imp-go' && ui.imp && ui.imp.plan && A.importRoll) {
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
    if (el && el.getAttribute && (el.getAttribute('data-look') && el.type === 'radio' || el.getAttribute('data-imp') || (el.form && el.form.id === 'plz-mform'))) return onInput(e);
    if (!el || el.getAttribute('data-plz') !== 'building' || !adapter) return;
    stopPlay(); ui.key = el.value; ui.selected = ''; ui.draft = null; persist(); rerender();
  }
  // La segnalazione dalla scheda: si valida qui (una frase, almeno), si
  // scrive sul server. Il testo resta in ui.reportDraft finché non parte.
  function onSubmit(e) {
    var f = e.target;
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
      e.preventDefault(); select(el.getAttribute('data-id'));
    }
    if (el && el.id === 'plz-fac-stage' && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
      e.preventDefault();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ui.fy = clampN(ui.fy + (e.key === 'ArrowLeft' ? -8 : 8), -42, 42);
      else ui.fx = clampN(ui.fx + (e.key === 'ArrowUp' ? -4 : 4), -22, 2);
      setFacAngles();
    }
    if (e.key === 'Escape' && ui.selected && doc.querySelector('.plz')) { ui.selected = ''; patch(); }
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

  var API = { configure: configure, render: render, mount: mount, patch: patch, ui: ui, eur: eur };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.BOOM_PALAZZO_UI = API;
})(typeof window !== 'undefined' ? window : globalThis);
