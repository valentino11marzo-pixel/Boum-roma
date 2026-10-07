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
  var FILTERS = [
    ['all', 'Tutti', null],
    ['paid', 'Pagato', ['paid']],
    ['late', 'In ritardo', ['late']],
    ['due', 'Da pagare', ['due']],
    ['check', 'Da verificare', ['review', 'norate', 'unknown']],
    ['free', 'Liberi', ['vacant', 'incoming']]
  ];
  var GLYPH = { paid: '✓', late: '!', due: '·', review: '?', norate: '–', unknown: '?', incoming: '→', vacant: '' };

  var ui = { key: '', month: '', view: '3d', filter: 'all', selected: '', rx: -22, ry: 34, zoom: 1, intro: Object.create(null), playing: null };
  var adapter = null, last = null, bound = false;
  try {
    var saved = JSON.parse(root.localStorage && root.localStorage.getItem('boom_palazzo') || '{}');
    if (saved.view === 'list' || saved.view === '3d') ui.view = saved.view;
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
    if (um.state === 'norate') return month > currentMonth ? 'Rata non ancora generata' : 'Rata non registrata';
    return E.STATES[um.state] ? E.STATES[um.state].label : 'Da verificare';
  }
  function matches(filter, state) { var f = FILTERS.find(function (x) { return x[0] === filter; }); return !f || !f[2] || f[2].indexOf(state) >= 0; }

  // ── Dati ──────────────────────────────────────────────────────────────
  function compute() {
    var S = adapter.state(), admin = adapter.isAdmin();
    var ctx = E.context({ properties: S.properties, contracts: S.contracts, payments: S.payments, users: S.users });
    var me = S.profile && S.profile.id;
    var filter = admin ? null : function (p) { return p.ownerId === me; };
    if (!ui.month) ui.month = ctx.month;
    var m = E.model(ctx, ui.key, ui.month, { filter: filter });
    if (m.building && m.building.key !== ui.key) { ui.key = m.building.key; }
    if (ui.selected && !m.units.some(function (u) { return u.id === ui.selected; })) ui.selected = '';
    return { ctx: ctx, m: m, admin: admin, S: S };
  }

  // ── Disegno ───────────────────────────────────────────────────────────
  function render() {
    if (!adapter) return '';
    var data = compute(); last = data;
    var m = data.m;
    if (!m.building) {
      return '<div class="plz"><header class="plz-head"><div><p class="plz-eyebrow">Il Palazzo</p><h1>' + (data.admin ? 'Nessun immobile in archivio' : 'Nessun interno collegato al tuo profilo') + '</h1><p class="plz-sub">' +
        (data.admin ? 'Aggiungi gli immobili da Immobili o dall’Innesto: ogni interno allo stesso civico diventa un piano del palazzo.' : 'BOOM sta collegando i tuoi immobili. Appena pronti li vedrai qui, interno per interno.') + '</p></div></header></div>';
    }
    return '<div class="plz" data-view="' + ui.view + '">' + header(data) + '<div id="plz-issues">' + issues(data) + '</div><div id="plz-kpis">' + kpis(data) + '</div>' +
      '<div id="plz-timeline">' + timeline(data) + '</div>' +
      '<div class="plz-body"><div class="plz-main">' + filters(data) +
      (ui.view === '3d' ? scene(data) : '<div id="plz-roll">' + roll(data) + '</div>') + tray(data) +
      '</div><aside class="plz-panel" id="plz-panel" aria-live="polite">' + panel(data) + '</aside></div>' +
      '<div class="plz-tip" id="plz-tip" hidden></div></div>';
  }

  function header(data) {
    var m = data.m, b = m.building, o = m.owner;
    var sub = data.admin ? (o ? 'Proprietà di ' + esc(o.name || o.email || 'proprietario da collegare') : 'Proprietario da collegare') + ' · ' + b.units + (b.units === 1 ? ' interno' : ' interni')
      : b.units + (b.units === 1 ? ' interno gestito' : ' interni gestiti') + ' da BOOM';
    var picker = m.buildings.length > 1 ? '<label class="plz-pick"><span>Palazzo</span><select data-plz="building">' + m.buildings.map(function (x) {
      return '<option value="' + esc(x.key) + '"' + (x.key === b.key ? ' selected' : '') + '>' + esc(x.label) + ' · ' + x.units + (data.admin && x.owner ? ' · ' + esc(x.owner.name || x.owner.email || '') : '') + '</option>';
    }).join('') + '</select></label>' : '';
    var isNow = m.month === m.currentMonth;
    return '<header class="plz-head"><div class="plz-title"><p class="plz-eyebrow">Il Palazzo</p><h1 id="plz-h1" tabindex="-1">' + esc(b.label) + '</h1><p class="plz-sub">' + sub + '</p></div>' +
      '<div class="plz-controls">' + picker +
      '<div class="plz-month" role="group" aria-label="Mese"><button type="button" class="plz-ico" data-plz="prev" aria-label="Mese precedente">‹</button><strong id="plz-month-label">' + esc(E.monthLabel(m.month)) + '</strong><button type="button" class="plz-ico" data-plz="next" aria-label="Mese successivo">›</button>' +
      (isNow ? '' : '<button type="button" class="plz-chip-btn" data-plz="today">Oggi</button>') + '</div>' +
      '<div class="plz-seg" role="tablist" aria-label="Vista"><button type="button" role="tab" data-plz="view" data-v="3d" aria-selected="' + (ui.view === '3d') + '">3D</button><button type="button" role="tab" data-plz="view" data-v="list" aria-selected="' + (ui.view === 'list') + '">Elenco</button></div>' +
      '</div></header>';
  }

  function issues(data) {
    if (!data.admin || !data.m.issues.length) return '';
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
      if (i.code === 'norate') return row('Rate', i.count + (i.count === 1 ? ' interno occupato senza rata' : ' interni occupati senza rata') + ' in ' + esc(E.monthLabel(m.month).toLowerCase()) + ': né pagato né in ritardo finché la rata non esiste.', '<button type="button" class="plz-btn" data-plz="rent" data-id="' + esc(i.ids[0]) + '">Verifica rate</button>');
      return '';
    }).join('');
    return rows ? '<details class="plz-issues"' + (m.issues.some(function (i) { return i.code !== 'norate'; }) ? ' open' : '') + '><summary>Da sistemare · ' + m.issues.length + '</summary>' + rows + '</details>' : '';
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
        var bar = seg('paid', t.paid) + seg('review', t.review) + seg('due', t.due) + seg('norate', t.norate + t.unknown) + seg('late', t.late) + seg('incoming', t.incoming) + seg('vacant', t.vacant);
        return '<button type="button" class="plz-mcell' + (s.month === m.month ? ' is-on' : '') + (s.month === m.currentMonth ? ' is-now' : '') + '" data-plz="month" data-m="' + s.month + '" aria-label="' + esc(E.monthLabel(s.month)) + ': ' + t.paid + ' pagati, ' + t.late + ' in ritardo, ' + (t.vacant + t.incoming) + ' liberi" aria-pressed="' + (s.month === m.month) + '"><span class="plz-mbar">' + bar + '</span><small>' + E.monthLabel(s.month, true) + '</small></button>';
      }).join('') + '</div></div>';
  }

  function filters(data) {
    var t = data.m.totals, count = { all: t.units, paid: t.paid, late: t.late, due: t.due, check: t.review + t.norate + t.unknown, free: t.vacant + t.incoming };
    return '<div class="plz-filters" role="group" aria-label="Mostra">' + FILTERS.map(function (f) {
      return '<button type="button" class="plz-filter plz-f-' + f[0] + '" data-plz="filter" data-f="' + f[0] + '" aria-pressed="' + (ui.filter === f[0]) + '"><i aria-hidden="true"></i>' + f[1] + '<b>' + count[f[0]] + '</b></button>';
    }).join('') + '</div>';
  }

  function cube(u, x, z, i) {
    var um = u.month, s = um.state, dim = !matches(ui.filter, s);
    var who = um.tenants.length ? surname(um.tenants[0]) : s === 'vacant' ? 'Libero' : s === 'incoming' ? 'In arrivo' : '';
    var label = unitTitle(u) + ', ' + unitWhere(u) + ': ' + (um.tenants.join(', ') || (s === 'vacant' ? 'libero' : '')) + ' — ' + stateLabel(um, last.m.month, last.m.currentMonth) + (um.expected ? ', ' + eur(um.expected) : '');
    return '<div class="plz-unit' + (u.id === ui.selected ? ' is-sel' : '') + (dim ? ' is-dim' : '') + '" role="button" tabindex="0" data-plz="select" data-id="' + esc(u.id) + '" data-state="' + s + '" style="--x:' + x + 'px;--zz:' + z + 'px;--i:' + i + '" aria-label="' + esc(label) + '">' +
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
            '<span role="cell" data-l="Inquilino">' + esc(um.tenants.join(' · ') || (um.state === 'vacant' ? 'Libero' : um.state === 'incoming' ? 'In arrivo dal ' + dateIt(um.leaseStart) : '—')) + '</span>' +
            '<span role="cell" data-l="Canone" class="plz-num">' + (um.rent != null && um.occupied ? eur(um.rent) : '—') + '</span>' +
            '<span role="cell" data-l="Fino al">' + (um.leaseEnd ? dateIt(um.leaseEnd) + (um.leaving ? ' <em class="plz-warn">in scadenza</em>' : '') : '—') + '</span>' +
            '<span role="cell" data-l="Mese"><span class="plz-pill plz-s-' + um.state + '">' + esc(stateLabel(um, m.month, m.currentMonth)) + '</span>' + (um.expected ? ' <small class="plz-num">' + eur(um.expected) + '</small>' : '') + '</span>' +
            '<span role="cell" data-l="12 mesi">' + stripHTML(u, m.month) + '</span>' +
            '<span role="cell" data-l="Arretrati" class="plz-num' + (u.arrears.amount ? ' plz-red' : '') + '">' + (u.arrears.amount ? eur(u.arrears.amount) : '—') + '</span></div>';
        }).join('') + '</div>';
      }).join('') + '</div>';
  }

  function panel(data) {
    var m = data.m, u = ui.selected && m.units.find(function (x) { return x.id === ui.selected; });
    return u ? unitPanel(u, data) : monthPanel(data);
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
      block('Liberi', free, function (u) { return line(u, '', u.month.state === 'incoming' ? 'in arrivo dal ' + dateIt(u.month.leaseStart) : unitWhere(u)); }, 'Tutto pieno.') +
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
  function unitPanel(u, data) {
    var m = data.m, um = u.month, admin = data.admin;
    var lease = um.lease || um.incoming;
    var rows = um.rows.map(function (r) {
      var st = { paid: 'Pagato', overdue: 'In ritardo', due: 'Da pagare', reported: 'Segnalato · da verificare', processing: 'In corso', unknown: 'Da verificare' }[r.state] || 'Da verificare';
      return '<li><span>' + esc(r.month && r.coversTo && r.coversTo !== r.month ? E.monthLabel(r.month, true) + '→' + E.monthLabel(r.coversTo, true) : E.monthLabel(r.month)) + '</span><b class="plz-num">' + eur(r.amount) + '</b><em class="plz-pill plz-s-' + ({ overdue: 'late', reported: 'review', processing: 'review' }[r.state] || r.state) + '">' + st + '</em><small>' + (r.paidDate ? 'pagato il ' + dateIt(r.paidDate) : r.dueDate ? 'scadenza ' + dateIt(r.dueDate) : '') + '</small></li>';
    }).join('');
    var pdf = lease && (lease.signedPdfUrl || lease.generatedPDF);
    var safe = function (url) { try { var x = new URL(url); return x.protocol === 'https:' ? x.href : ''; } catch (_) { return ''; } };
    var actions = admin
      ? '<button type="button" class="plz-btn plz-primary" data-plz="rent" data-id="' + esc(u.id) + '">Gestisci canoni</button>' +
        (um.contractId ? '<button type="button" class="plz-btn" data-plz="contract" data-id="' + esc(um.contractId) + '">Apri contratto</button>' : '') +
        '<button type="button" class="plz-btn" data-plz="dossier" data-id="' + esc(u.id) + '">Fascicolo</button><button type="button" class="plz-btn" data-plz="edit" data-id="' + esc(u.id) + '">Modifica interno</button>'
      : (safe(pdf) ? '<a class="plz-btn" href="' + esc(safe(pdf)) + '" target="_blank" rel="noopener">Contratto (PDF) ↗</a>' : '') + '<button type="button" class="plz-btn" data-plz="inbox">Scrivi a BOOM</button>';
    return '<div class="plz-pcard plz-unitcard"><button type="button" class="plz-close" data-plz="deselect" aria-label="Chiudi">×</button>' +
      '<p class="plz-eyebrow">' + esc(unitWhere(u)) + '</p><h2 id="plz-unit-h" tabindex="-1">' + esc(unitTitle(u)) + '</h2>' +
      '<span class="plz-pill plz-s-' + um.state + ' plz-big">' + esc(stateLabel(um, m.month, m.currentMonth)) + ' · ' + esc(E.monthLabel(m.month).toLowerCase()) + '</span>' +
      (u.ownerMismatch && admin ? '<p class="plz-note">Non collegato al profilo di ' + esc(m.owner && (m.owner.name || m.owner.email) || 'proprietaria') + ': dal suo accesso non lo vede.</p>' : '') +
      '<dl class="plz-facts">' +
      '<div><dt>' + (um.state === 'incoming' ? 'In arrivo' : 'Inquilino') + '</dt><dd>' + esc(um.tenants.join(' · ') || (um.state === 'vacant' ? 'Libero' : '—')) + '</dd></div>' +
      '<div><dt>Contratto</dt><dd>' + (um.leaseStart || um.leaseEnd ? esc((um.leaseStart ? 'dal ' + dateIt(um.leaseStart) : '') + (um.leaseEnd ? ' al ' + dateIt(um.leaseEnd) : '')) + (um.leaving ? ' <em class="plz-warn">in scadenza</em>' : '') : '—') + '</dd></div>' +
      '<div><dt>Canone</dt><dd class="plz-num">' + (um.rent != null ? eur(um.rent) + ' / mese' : '—') + '</dd></div>' +
      '<div><dt>Arretrati</dt><dd class="plz-num' + (u.arrears.amount ? ' plz-red' : '') + '">' + (u.arrears.amount ? eur(u.arrears.amount) + ' · ' + u.arrears.count + (u.arrears.count === 1 ? ' rata' : ' rate') + (u.arrears.oldest ? ' dal ' + dateIt(u.arrears.oldest) : '') : 'Nessuno') + '</dd></div>' +
      '</dl><p class="plz-eyebrow">Ultimi 12 mesi</p>' + stripHTML(u, m.month) +
      '<p class="plz-eyebrow">Rate di ' + esc(E.monthLabel(m.month).toLowerCase()) + '</p>' + (rows ? '<ul class="plz-rows">' + rows + '</ul>' : '<p class="plz-muted">' + (um.occupied ? 'Nessuna rata registrata per questo mese.' : 'Nessun contratto in questo mese.') + '</p>') +
      '<div class="plz-actions">' + actions + '</div></div>';
  }

  // ── Aggiornamenti senza ricostruire la scena ──────────────────────────
  // Cambiare mese (anche in riproduzione) ricolora i cubi esistenti: le
  // facce sfumano da un colore all'altro invece di ridisegnarsi da capo.
  function patch() {
    if (!adapter || !doc || !doc.querySelector('.plz')) return;
    var data = compute(); last = data;
    var m = data.m, set = function (id, html) { var el = doc.getElementById(id); if (el) el.innerHTML = html; };
    set('plz-issues', issues(data)); set('plz-kpis', kpis(data)); set('plz-timeline', timeline(data)); set('plz-panel', panel(data)); scrollTimeline();
    var lab = doc.getElementById('plz-month-label'); if (lab) lab.textContent = E.monthLabel(m.month);
    var today = doc.querySelector('[data-plz="today"]');
    if (m.month === m.currentMonth && today) today.remove();
    if (m.month !== m.currentMonth && !today) { var nx = doc.querySelector('[data-plz="next"]'); if (nx) nx.insertAdjacentHTML('afterend', '<button type="button" class="plz-chip-btn" data-plz="today">Oggi</button>'); }
    var fl = doc.querySelector('.plz-filters'); if (fl) fl.outerHTML = filters(data);
    if (ui.view === 'list') { set('plz-roll', roll(data)); }
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
    if (last && last.m.building) ui.intro[last.m.building.key] = true;
    if (!st || !w) return;
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

  function onClick(e) {
    var el = e.target.closest && e.target.closest('[data-plz]');
    if (!el || !el.closest('.plz') || !adapter) return;
    var act = el.getAttribute('data-plz'), id = el.getAttribute('data-id') || '';
    var st = doc.getElementById('plz-stage');
    if (act === 'select') { if (st && st.dataset.justDragged) return; select(id); return; }
    if (act === 'deselect') { ui.selected = ''; patch(); return; }
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
    var A = adapter.actions || {}, admin = adapter.isAdmin();
    var unit = last && last.m.units.find(function (u) { return u.id === id; });
    if (act === 'inbox' && A.inbox) return A.inbox();
    if (!admin) return;
    if (act === 'rent' && unit && A.rent) return A.rent(unit.id, last.m.month);
    if (act === 'contract' && id && A.contract) return A.contract(id);
    if (act === 'dossier' && unit && A.dossier) return A.dossier(unit.id);
    if (act === 'edit' && unit && A.edit) return A.edit(unit.property);
    if (act === 'contracts' && A.contracts) return A.contracts();
    if (act === 'users' && A.users) return A.users();
    if (act === 'link' && A.linkOwner) {
      var ids = (el.getAttribute('data-ids') || '').split(',').filter(Boolean), owner = el.getAttribute('data-owner');
      if (ids.length && owner) A.linkOwner(ids, owner);
    }
  }
  function onChange(e) {
    var el = e.target;
    if (!el || el.getAttribute('data-plz') !== 'building' || !adapter) return;
    stopPlay(); ui.key = el.value; ui.selected = ''; persist(); rerender();
  }
  function onKey(e) {
    var el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el && el.getAttribute && el.getAttribute('data-plz') === 'select' && el.getAttribute('role')) {
      e.preventDefault(); select(el.getAttribute('data-id'));
    }
    if (e.key === 'Escape' && ui.selected && doc.querySelector('.plz')) { ui.selected = ''; patch(); }
  }
  function onOver(e) {
    var tip = doc.getElementById('plz-tip'), el = e.target.closest && e.target.closest('.plz-unit');
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
    root.addEventListener('resize', function () { if (doc.getElementById('plz-world')) applyView(); });
  }

  var API = { configure: configure, render: render, mount: mount, patch: patch, ui: ui, eur: eur };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.BOOM_PALAZZO_UI = API;
})(typeof window !== 'undefined' ? window : globalThis);
