/* BOOM · IL PALAZZO — un proprietario, un palazzo, ogni interno, ogni mese.
 *
 * Puro/UMD (window.BOOM_PALAZZO, require da Node). Legge properties,
 * contracts, payments (e users per i nomi) e risponde, per QUALUNQUE mese,
 * alle tre domande del proprietario: quali interni sono pieni, chi ha
 * pagato, chi no. Non scrive dati e non inventa:
 *  - lo stato di ogni rata viene da BOOM_RENT.paymentState (una copia sola,
 *    la stessa di Canoni, fascicolo e /casa);
 *  - un interno occupato senza rata nel mese è "rata non registrata" — un
 *    dato da sistemare, MAI "pagato" e MAI "in ritardo";
 *  - un piano illeggibile resta "da collocare", mai indovinato;
 *  - una rata trimestrale colora i tre mesi che copre, ma il suo importo
 *    conta UNA volta, nel mese in cui scade (niente incassi triplicati).
 * Il palazzo non esiste come documento: è il gruppo degli interni allo
 * stesso civico (via + numero), oppure `property.palazzo` se l'operatore
 * l'ha scritto a mano. La chiave del civico ignora interno, scala, piano,
 * CAP e città: "Viale X 12, int. 4" e "Viale X, 12 - scala B" sono lo
 * stesso palazzo.
 */
(function (root) {
  'use strict';

  var RENT = (typeof module === 'object' && module.exports) ? require('./rent-engine.js') : root.BOOM_RENT;

  function str(v) { return v == null ? '' : String(v).trim(); }
  function norm(v) { return str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }
  function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function money(v) { var n = RENT && RENT.amount ? RENT.amount(v) : (typeof v === 'number' && v >= 0 ? v : null); return n; }

  // ── Date civili (Europe/Rome) ─────────────────────────────────────────
  function day(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
      var m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
      if (!m) return '';
      var d0 = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return d0.getUTCFullYear() === +m[1] && d0.getUTCMonth() === +m[2] - 1 && d0.getUTCDate() === +m[3] ? m[0].slice(0, 10) : '';
    }
    var date;
    try {
      date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate()
        : typeof value.seconds === 'number' ? new Date(value.seconds * 1000) : null;
    } catch (_) { return ''; }
    if (!date || !Number.isFinite(date.getTime())) return '';
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function monthOf(v) { var s = str(v); return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : ''; }
  function monthAdd(month, k) {
    var m = monthOf(month); if (!m) return '';
    var d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1));
    return d.toISOString().slice(0, 7);
  }
  function monthStart(m) { return m + '-01'; }
  function monthEnd(m) {
    var d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0));
    return d.toISOString().slice(0, 10);
  }
  function dayAdd(d, k) {
    var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k);
    return x.toISOString().slice(0, 10);
  }
  var MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  function monthLabel(month, short) {
    var m = monthOf(month); if (!m) return 'Periodo da verificare';
    var name = MONTHS_IT[+m.slice(5, 7) - 1];
    return short ? name.slice(0, 3) : name.charAt(0).toUpperCase() + name.slice(1) + ' ' + m.slice(0, 4);
  }

  // ── Piano, scala, interno ─────────────────────────────────────────────
  var WORD_FLOORS = { primo: 1, secondo: 2, terzo: 3, quarto: 4, quinto: 5, sesto: 6, settimo: 7, ottavo: 8, nono: 9, decimo: 10,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  // → { n } numero di piano, { top:true } attico, null se illeggibile.
  // "3° / 5", "3° con ascensore", "2nd Floor", "Ground Floor", "PT",
  // "rialzato", "primo piano", "piano 4", 2 (numero) — mai un'ipotesi.
  function parseFloor(value) {
    if (typeof value === 'number') return Number.isInteger(value) && value >= -3 && value <= 40 ? { n: value } : null;
    var s = norm(value);
    if (!s) return null;
    if (/\b(super)?attico\b|\bpenthouse\b|\bmansard/.test(s)) return { top: true };
    if (/seminterrat|\binterrato\b|\bbasement\b|sottostrada|^-\s*1(?!\d)|^s1?$/.test(s)) return { n: -1 };
    if (/\bterra\b|rialzat|\bground\b|^p\.?\s*t\.?$|^t$|\braised\b|^0(?!\d)/.test(s)) return { n: 0 };
    var m = /^(\d{1,2})(?!\d)/.exec(s) || /\bpiano\s*(\d{1,2})(?!\d)/.exec(s) || /\b(\d{1,2})\s*(?:°|º|\^|st\b|nd\b|rd\b|th\b)/.exec(s);
    if (m) { var n = +m[1]; return n >= 0 && n <= 40 ? { n: n } : null; }
    var w = /\b(primo|secondo|terzo|quarto|quinto|sesto|settimo|ottavo|nono|decimo|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/.exec(s);
    return w ? { n: WORD_FLOORS[w[1]] } : null;
  }
  function floorLabel(n, short) {
    if (n === -1) return short ? 'S1' : 'Seminterrato';
    if (n === 0) return short ? 'PT' : 'Piano terra';
    return short ? 'P' + n : n + '° piano';
  }
  var UNIT_RE = /\bint(?:erno)?\.?\s*([a-z0-9]{1,4})\b/;
  var SCALA_RE = /\b(?:scala|sc\.)\s*([a-z0-9]{1,3})\b/;
  function unitOf(p) {
    var u = str(p && (p.interno || p.unit));
    if (u) return u.replace(/^int(?:erno)?\.?\s*/i, '');
    var m = UNIT_RE.exec(norm(p && p.name)) || UNIT_RE.exec(norm(p && p.address));
    return m ? m[1].toUpperCase() : '';
  }
  function scalaOf(p) {
    var s = str(p && p.scala);
    if (s) return s.replace(/^scala\s*/i, '').toUpperCase();
    var m = SCALA_RE.exec(norm(p && p.address)) || SCALA_RE.exec(norm(p && p.name));
    return m ? m[1].toUpperCase() : '';
  }
  function floorOf(p) {
    var f = parseFloor(p && p.floor);
    if (f) return f;
    var m = /\bpiano\s*(\d{1,2}|terra|primo|secondo|terzo|quarto|quinto|sesto|settimo|ottavo|nono|decimo)\b/.exec(norm(p && p.address));
    return m ? parseFloor(m[1] === 'terra' ? 'terra' : m[1]) : null;
  }

  // ── Il civico: lo stesso palazzo, comunque sia scritto ────────────────
  var PREP = ['del', 'della', 'delle', 'dello', 'degli', 'dei', 'di', 'la', 'alla', 'alle', 'al', 'sulla'];
  var CITY = ['roma', 'rome', 'rm', 'italia', 'italy'];
  var FLOOR_WORDS = ['terra', 'rialzato', 'primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto', 'settimo', 'ottavo', 'nono', 'decimo', 'attico'];
  // Per token, non per regex cieca: "Via della Scala 5" è un palazzo in
  // Trastevere, non "Via della" + scala 5; "Via Roma 12" tiene la sua Roma.
  // Dopo il civico ci si ferma: lì vengono solo i dettagli dell'interno.
  function streetKey(address) {
    var s = norm(address);
    if (!s) return '';
    s = s.replace(/\bv\.\s*le\b/g, 'viale').replace(/\bp\.\s*zz?a\b/g, 'piazza')
      .replace(/\bc\.\s*so\b/g, 'corso').replace(/\bl\.\s*go\b/g, 'largo')
      .replace(/^v\.\s*/, 'via ').replace(/\b\d{5}\b/g, ' ')
      .replace(/(\d+)\s*\/\s*([a-z])\b/g, '$1$2')
      .replace(/[^a-z0-9]+/g, ' ').trim();
    var t = s.split(' ').filter(Boolean), out = [], civico = '';
    for (var i = 0; i < t.length; i++) {
      var w = t[i], prev = t[i - 1] || '', next = t[i + 1] || '';
      if (w === 'int' || w === 'interno') { i++; continue; }
      if ((w === 'scala' || w === 'sc') && PREP.indexOf(prev) < 0 && next && next.length <= 3) { i++; continue; }
      if (w === 'piano' && PREP.indexOf(prev) < 0 && (/^\d{1,2}$/.test(next) || FLOOR_WORDS.indexOf(next) >= 0)) { i++; continue; }
      if (w === 'p' && /^\d{1,2}$/.test(next)) { i++; continue; }
      if (w === 'civico' || w === 'n' || w === 'nr' || w === 'num') continue;
      if (/^\d+[a-z]?$/.test(w)) {
        if (!out.some(function (x) { return CITY.indexOf(x) < 0; })) continue;
        civico = /^\d+$/.test(w) && /^[a-z]$/.test(next) ? w + next : w;
        break;
      }
      out.push(w);
    }
    while (out.length > 1 && CITY.indexOf(out[0]) >= 0) out.shift();
    if (!civico) while (out.length > 1 && CITY.indexOf(out[out.length - 1]) >= 0) out.pop();
    return out.concat(civico ? [civico] : []).join(' ');
  }
  function titleCase(s) {
    return s.split(' ').map(function (w) {
      return /^\d/.test(w) ? w.toUpperCase() : (['di', 'de', 'del', 'della', 'dei', 'delle', 'degli', 'da', 'in'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1));
    }).join(' ').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function buildingKeyOf(p) {
    var explicit = str(p && (p.palazzo || p.buildingKey || p.building));
    if (explicit) return 'b:' + norm(explicit).replace(/[^a-z0-9]+/g, ' ').trim();
    var k = streetKey(p && p.address);
    return k ? 'a:' + k : '';
  }

  // ── Proprietario ──────────────────────────────────────────────────────
  function ownerOf(p, usersById) {
    var id = str(p && p.ownerId), user = id && usersById ? usersById[id] : null;
    var email = norm((user && user.email) || (p && p.ownerEmail));
    var name = str((user && user.name) || (p && p.ownerName));
    return { key: id ? 'id:' + id : email ? 'email:' + email : name ? 'name:' + norm(name) : '', id: id, email: email, name: name, user: user || null };
  }

  // ── Contratti: chi è dentro in un mese ────────────────────────────────
  // LIVE = il contratto è (o è stato) in vigore: per un mese passato conta
  // anche lo scaduto. In firma = in arrivo, non ancora dentro.
  var LIVE = { active: 1, signed: 1, expired: 1, terminated: 1, completed: 1, ended: 1, renewed: 1, closed: 1 };
  var SIGNING = { pending: 1, signing: 1, sent: 1 };
  function cStatus(c) { return norm(c && c.status); }
  function effectiveEnd(c) {
    if (cStatus(c) === 'terminated') return day(c.terminatedAt) || day(c.terminationDate) || day(c.endDate);
    return day(c.endDate);
  }
  function covers(c, month) {
    var start = day(c.startDate), end = effectiveEnd(c);
    if (!start) return cStatus(c) === 'active'; // attivo senza data: dichiarato, segnalato a parte
    return start <= monthEnd(month) && (!end || end >= monthStart(month));
  }
  function contractRent(c) {
    var v = money(c && c.rent);
    if (v == null && c && c.canone) v = money(c.canone.monthly != null ? c.canone.monthly : c.canone.amount);
    return v;
  }
  function tenantNamesOf(c, usersById) {
    var out = [];
    var u = usersById && usersById[str(c.tenantId)];
    var main = str(c.tenantName) || str(u && (u.name || u.email));
    if (main) out.push(main);
    list(c.coTenants).forEach(function (t) { var n = str(t && (t.name || t.fullName)); if (n && !out.includes(n)) out.push(n); });
    return out;
  }

  // ── Contesto: indici una volta sola ──────────────────────────────────
  function context(o) {
    o = o || {};
    var now = o.now == null ? new Date() : o.now;
    var today = day(now) || day(new Date());
    var users = list(o.users), usersById = Object.create(null);
    users.forEach(function (u) { if (str(u.id)) usersById[str(u.id)] = u; });
    var properties = list(o.properties).filter(function (p) { return str(p.id) && p.status !== 'archived' && p.deleted !== true; });
    var propIds = Object.create(null); properties.forEach(function (p) { propIds[str(p.id)] = p; });
    var contracts = list(o.contracts), contractById = Object.create(null), byProperty = Object.create(null);
    contracts.forEach(function (c) {
      if (str(c.id)) contractById[str(c.id)] = c;
      var pid = str(c.propertyId);
      if (!pid || !propIds[pid]) return;
      (byProperty[pid] = byProperty[pid] || []).push(c);
    });
    var paymentsByProperty = Object.create(null);
    list(o.payments).forEach(function (p, i) {
      var contract = contractById[str(p.contractId)] || null;
      var pid = str(p.propertyId) || str(contract && contract.propertyId);
      if (!pid || !propIds[pid]) return;
      var row = {
        id: str(p.id) || 'missing-id:' + i, payment: p, contractId: str(p.contractId),
        month: monthOf(p.month) || day(p.dueDate).slice(0, 7), coversTo: monthOf(p.coversTo),
        dueDate: day(p.dueDate), paidDate: day(p.paidDate || p.paidAt),
        amount: money(p.amount), state: RENT.paymentState(p, now), isRent: RENT.isRentPayment(p),
        tenantName: str(p.tenantName) || str(contract && contract.tenantName)
      };
      (paymentsByProperty[pid] = paymentsByProperty[pid] || []).push(row);
    });
    return { now: now, today: today, month: today.slice(0, 7), properties: properties, usersById: usersById,
      contractsByProperty: byProperty, paymentsByProperty: paymentsByProperty };
  }

  // ── Un interno in un mese ────────────────────────────────────────────
  var STATES = {
    paid: { label: 'Pagato', short: 'Pagato' },
    late: { label: 'In ritardo', short: 'Ritardo' },
    due: { label: 'Da pagare', short: 'Da pagare' },
    review: { label: 'In verifica', short: 'Verifica' },
    norate: { label: 'Rata non registrata', short: 'Senza rata' },
    unknown: { label: 'Da verificare', short: 'Verifica' },
    incoming: { label: 'In arrivo', short: 'In arrivo' },
    vacant: { label: 'Libero', short: 'Libero' }
  };
  function aggregate(states) {
    if (!states.length) return '';
    if (states.indexOf('overdue') >= 0) return 'late';
    if (states.indexOf('reported') >= 0 || states.indexOf('processing') >= 0) return 'review';
    if (states.indexOf('due') >= 0) return 'due';
    if (states.every(function (s) { return s === 'paid'; })) return 'paid';
    return 'unknown';
  }
  function rowsForMonth(rows, month) {
    return rows.filter(function (r) {
      if (!r.isRent || r.state === 'cancelled') return false;
      return r.month === month || (r.coversTo && r.month && r.month < month && month <= r.coversTo);
    });
  }
  function unitMonth(ctx, p, month) {
    var pid = str(p.id), contracts = ctx.contractsByProperty[pid] || [], rows = ctx.paymentsByProperty[pid] || [];
    var lease = contracts.filter(function (c) { return LIVE[cStatus(c)] && covers(c, month); })
      .sort(function (a, b) { return (day(b.startDate) || '').localeCompare(day(a.startDate) || ''); })[0] || null;
    var monthRows = rowsForMonth(rows, month);
    var ownRows = monthRows.filter(function (r) { return r.month === month; });
    var occupied = !!lease || monthRows.length > 0;
    var incoming = null;
    if (!occupied) {
      incoming = contracts.filter(function (c) { return (LIVE[cStatus(c)] || SIGNING[cStatus(c)]) && day(c.startDate) > monthEnd(month); })
        .sort(function (a, b) { return day(a.startDate).localeCompare(day(b.startDate)); })[0] || null;
    }
    var pay = aggregate(monthRows.map(function (r) { return r.state; }));
    var state = !occupied ? (incoming ? 'incoming' : 'vacant') : !monthRows.length ? 'norate' : pay;
    var expected = 0, collected = 0, lateAmount = 0, unknownAmounts = 0;
    ownRows.forEach(function (r) {
      if (r.amount == null) { unknownAmounts++; return; }
      expected = round(expected + r.amount);
      if (r.state === 'paid') collected = round(collected + r.amount);
      if (r.state === 'overdue') lateAmount = round(lateAmount + r.amount);
    });
    var who = lease || incoming;
    var tenants = who ? tenantNamesOf(who, ctx.usersById) : [];
    if (!tenants.length) monthRows.forEach(function (r) { if (r.tenantName && tenants.indexOf(r.tenantName) < 0) tenants.push(r.tenantName); });
    var leaseEnd = lease ? effectiveEnd(lease) : '';
    var ref = ctx.today > monthStart(month) ? ctx.today : monthStart(month);
    var latePaid = monthRows.filter(function (r) { return r.state === 'overdue'; })
      .map(function (r) { return r.dueDate; }).filter(Boolean).sort()[0] || '';
    return {
      month: month, state: state, occupied: occupied, lease: lease, incoming: incoming,
      contractId: str((lease || incoming || {}).id), tenants: tenants,
      rent: contractRent(lease || incoming) != null ? contractRent(lease || incoming) : money(p.rent),
      leaseStart: lease ? day(lease.startDate) : incoming ? day(incoming.startDate) : '', leaseEnd: leaseEnd,
      leaving: !!(leaseEnd && leaseEnd >= ref && leaseEnd <= dayAdd(ref, 90)),
      rows: monthRows, expected: expected, collected: collected, lateAmount: lateAmount, unknownAmounts: unknownAmounts,
      lateSince: latePaid, lateDays: latePaid ? Math.max(0, Math.round((Date.parse(ctx.today) - Date.parse(latePaid)) / 864e5)) : 0
    };
  }
  function arrearsOf(ctx, p) {
    var out = { amount: 0, count: 0, rent: 0, other: 0, oldest: '' };
    (ctx.paymentsByProperty[str(p.id)] || []).forEach(function (r) {
      if (r.state !== 'overdue') return;
      out.count++;
      if (r.amount != null) { out.amount = round(out.amount + r.amount); out[r.isRent ? 'rent' : 'other'] = round(out[r.isRent ? 'rent' : 'other'] + r.amount); }
      if (r.dueDate && (!out.oldest || r.dueDate < out.oldest)) out.oldest = r.dueDate;
    });
    return out;
  }
  function strip(ctx, p, endMonth, n) {
    var end = monthOf(endMonth) || ctx.month, len = n || 12;
    return Array.from({ length: len }, function (_, i) {
      var m = monthAdd(end, i - len + 1), um = unitMonth(ctx, p, m);
      return { month: m, state: um.state };
    });
  }

  // ── I palazzi ────────────────────────────────────────────────────────
  function buildings(ctx, filter) {
    var groups = Object.create(null);
    ctx.properties.forEach(function (p) {
      if (filter && !filter(p)) return;
      var key = buildingKeyOf(p) || 'x:senza-indirizzo';
      var g = groups[key] = groups[key] || { key: key, propertyIds: [], owners: Object.create(null), sample: p };
      g.propertyIds.push(str(p.id));
      var o = ownerOf(p, ctx.usersById);
      if (o.key) { var e = g.owners[o.key] = g.owners[o.key] || { owner: o, count: 0 }; e.count++; }
    });
    return Object.keys(groups).map(function (key) {
      var g = groups[key], owners = Object.keys(g.owners).map(function (k) { return g.owners[k]; })
        .sort(function (a, b) { return b.count - a.count || (b.owner.id ? 1 : 0) - (a.owner.id ? 1 : 0); });
      var label = key === 'x:senza-indirizzo' ? 'Indirizzo da indicare' : key.slice(0, 2) === 'b:' ? titleCase(key.slice(2)) : titleCase(key.slice(2));
      return { key: key, label: label, units: g.propertyIds.length, propertyIds: g.propertyIds,
        owner: owners.length ? owners[0].owner : null, owners: owners.map(function (x) { return x.owner; }) };
    }).sort(function (a, b) { return b.units - a.units || a.label.localeCompare(b.label, 'it'); });
  }

  function natural(a, b) { return String(a || '').localeCompare(String(b || ''), 'it', { numeric: true, sensitivity: 'base' }); }

  // Il modello completo di un palazzo per un mese: piani → interni, totali,
  // serie dei mesi per la linea del tempo, e ciò che va sistemato.
  function model(ctx, key, month, opts) {
    opts = opts || {};
    var m = monthOf(month) || ctx.month;
    var all = buildings(ctx, opts.filter);
    var b = all.find(function (x) { return x.key === key; }) || all[0] || null;
    if (!b) return { building: null, buildings: all, month: m, floors: [], unplaced: [], units: [], totals: totalsOf([]), series: [], issues: [] };
    var props = b.propertyIds.map(function (id) { return ctx.properties.find(function (p) { return str(p.id) === id; }); }).filter(Boolean);
    var known = props.map(floorOf).filter(function (f) { return f && !f.top; }).map(function (f) { return f.n; });
    var topN = known.length ? Math.max.apply(null, known) + 1 : 1;
    var owner = b.owner;
    var units = props.map(function (p) {
      var f = floorOf(p), um = unitMonth(ctx, p, m), o = ownerOf(p, ctx.usersById);
      return {
        id: str(p.id), property: p, interno: unitOf(p), scala: scalaOf(p),
        floor: f ? (f.top ? topN : f.n) : null, floorTop: !!(f && f.top),
        name: str(p.name) || str(p.address) || 'Interno', owner: o,
        ownerMismatch: !!(owner && o.key !== owner.key),
        month: um, arrears: arrearsOf(ctx, p),
        strip: opts.strip === false ? [] : strip(ctx, p, m > ctx.month ? m : ctx.month, 12)
      };
    }).sort(function (a, b2) { return natural(a.scala, b2.scala) || natural(a.interno, b2.interno) || natural(a.name, b2.name); });
    var floorsMap = Object.create(null), unplaced = [];
    units.forEach(function (u) {
      if (u.floor == null) { unplaced.push(u); return; }
      (floorsMap[u.floor] = floorsMap[u.floor] || []).push(u);
    });
    var floors = Object.keys(floorsMap).map(Number).sort(function (a, b2) { return a - b2; }).map(function (n) {
      var top = floorsMap[n].every(function (u) { return u.floorTop; });
      return { n: n, label: top ? 'Attico' : floorLabel(n), short: top ? 'AT' : floorLabel(n, true), units: floorsMap[n] };
    });
    var series = Array.from({ length: 12 }, function (_, i) {
      var mm = monthAdd(m > ctx.month ? m : ctx.month, i - 11);
      var t = totalsOf(props.map(function (p) { return { month: unitMonth(ctx, p, mm), arrears: { amount: 0 } }; }));
      return { month: mm, totals: t };
    });
    var issues = [];
    if (unplaced.length) issues.push({ code: 'unplaced', count: unplaced.length, ids: unplaced.map(function (u) { return u.id; }) });
    var mism = units.filter(function (u) { return u.ownerMismatch; });
    if (mism.length) issues.push({ code: 'owner', count: mism.length, ids: mism.map(function (u) { return u.id; }) });
    if (owner && !owner.id) issues.push({ code: 'ownerProfile', count: units.length, ids: units.map(function (u) { return u.id; }) });
    var stale = [];
    props.forEach(function (p) {
      (ctx.contractsByProperty[str(p.id)] || []).forEach(function (c) {
        var end = effectiveEnd(c);
        if (cStatus(c) === 'active' && end && end < ctx.today) stale.push(str(c.id));
      });
    });
    if (stale.length) issues.push({ code: 'staleActive', count: stale.length, ids: stale });
    var double = units.filter(function (u) {
      return (ctx.contractsByProperty[u.id] || []).filter(function (c) { return LIVE[cStatus(c)] && covers(c, m); }).length > 1;
    });
    if (double.length) issues.push({ code: 'overlap', count: double.length, ids: double.map(function (u) { return u.id; }) });
    var norate = units.filter(function (u) { return u.month.state === 'norate' && m <= ctx.month; });
    if (norate.length) issues.push({ code: 'norate', count: norate.length, ids: norate.map(function (u) { return u.id; }) });
    return { building: b, buildings: all, month: m, currentMonth: ctx.month, floors: floors, unplaced: unplaced, units: units,
      totals: totalsOf(units), series: series, issues: issues, owner: owner };
  }

  function totalsOf(units) {
    var t = { units: units.length, occupied: 0, vacant: 0, incoming: 0, paid: 0, late: 0, due: 0, review: 0, norate: 0, unknown: 0,
      expected: 0, collected: 0, lateAmount: 0, arrears: 0, arrearsCount: 0, arrearsOldest: '', leaving: 0, occupancy: 0 };
    units.forEach(function (u) {
      var um = u.month;
      if (um.occupied) t.occupied++;
      t[um.state] = (t[um.state] || 0) + 1;
      if (um.leaving) t.leaving++;
      t.expected = round(t.expected + um.expected);
      t.collected = round(t.collected + um.collected);
      t.lateAmount = round(t.lateAmount + um.lateAmount);
      t.arrears = round(t.arrears + ((u.arrears && u.arrears.amount) || 0));
      if (u.arrears && u.arrears.count) {
        t.arrearsCount += u.arrears.count;
        if (u.arrears.oldest && (!t.arrearsOldest || u.arrears.oldest < t.arrearsOldest)) t.arrearsOldest = u.arrears.oldest;
      }
    });
    t.occupancy = t.units ? Math.round(t.occupied / t.units * 100) : 0;
    return t;
  }

  var API = { day: day, monthOf: monthOf, monthAdd: monthAdd, monthLabel: monthLabel, parseFloor: parseFloor, floorLabel: floorLabel,
    unitOf: unitOf, scalaOf: scalaOf, floorOf: floorOf, streetKey: streetKey, buildingKeyOf: buildingKeyOf, ownerOf: ownerOf,
    context: context, unitMonth: unitMonth, arrearsOf: arrearsOf, strip: strip, buildings: buildings, model: model,
    totalsOf: totalsOf, STATES: STATES };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.BOOM_PALAZZO = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
