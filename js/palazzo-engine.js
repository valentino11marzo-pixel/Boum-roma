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
      .replace(/\bp\.\s*le\b/g, 'piazzale').replace(/\bp\.\s*zale\b/g, 'piazzale')
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
    // Le proposte (pre-agreement) e gli annunci dicono cosa succede a un
    // interno libero: in trattativa, riservato, pubblicato. Le proposte le
    // carica solo l'admin (rules): al proprietario arrivano vuote.
    var proposalsByProperty = Object.create(null);
    list(o.preAgreements).forEach(function (pa) {
      var pid = str(pa.propertyId);
      if (pid && propIds[pid]) (proposalsByProperty[pid] = proposalsByProperty[pid] || []).push(pa);
    });
    var listingsByProperty = Object.create(null), listingById = Object.create(null);
    list(o.listings).forEach(function (l) { if (str(l.id)) listingById[str(l.id)] = l; });
    properties.forEach(function (p) {
      var l = listingById[str(p.listingId)] || list(o.listings).find(function (x) { return str(x.propertyId) === str(p.id); });
      if (l) listingsByProperty[str(p.id)] = l;
    });
    return { now: now, today: today, month: today.slice(0, 7), properties: properties, usersById: usersById,
      contractsByProperty: byProperty, paymentsByProperty: paymentsByProperty,
      proposalsByProperty: proposalsByProperty, listingsByProperty: listingsByProperty, contractById: contractById };
  }

  // ── Un interno in un mese ────────────────────────────────────────────
  // QUATTRO TONI a schermo (8/10): gli stati sono otto perché i dati sono
  // otto, ma la proprietaria ne legge quattro. Una copia sola, letta da
  // filtri, legenda, facciata e test.
  var TONES = [
    { key: 'pagato', label: 'Pagato', states: ['paid'] },
    { key: 'ritardo', label: 'Non ha pagato', states: ['late'] },
    { key: 'attesa', label: 'In attesa', states: ['due', 'review', 'norate', 'unknown'] },
    { key: 'libero', label: 'Libero', states: ['vacant', 'incoming'] }
  ];
  function toneOf(state) {
    for (var i = 0; i < TONES.length; i++) if (TONES[i].states.indexOf(state) >= 0) return TONES[i].key;
    return 'attesa';
  }
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

  // ── La carta del contratto: registrazione e regime ───────────────────
  // Le due domande che la proprietaria (e il suo commercialista) fanno di un
  // contratto oltre ai soldi. Solo ciò che è SCRITTO: una registrazione non
  // segnata non diventa "registrato", e la cedolare non dichiarata resta
  // null — i contratti nati prima del dizionario non la portano, e "sì" per
  // default (la regola del PDF) qui sarebbe un'affermazione sul regime
  // fiscale di qualcuno che nessuno ha fatto.
  // `late`: oltre 30 giorni dalla DECORRENZA senza registrazione segnata. Il
  // termine di legge corre dalla data più vicina fra stipula e decorrenza,
  // quindi passata la decorrenza + 30 il ritardo è certo (mai un falso).
  function cedolareDeclared(c) {
    var v = c && c.cedolareSecca;
    if (v == null || v === '') v = c && c.canone && c.canone.cedolareSecca;
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    var s = norm(v);
    if (s === 'si' || s === 'yes' || s === 'true') return true;
    if (s === 'no' || s === 'false') return false;
    return null;
  }
  function paperOf(c, today) {
    if (!c) return null;
    var at = day(c.rliRegisteredAt), rs = norm(c.registrationStatus), start = day(c.startDate);
    var reg = (at || rs === 'registered') ? { status: 'registered', at: at }
      : (rs === 'sent' || c.aspiRequestedAt) ? { status: 'sent', at: day(c.aspiRequestedAt) }
      : { status: 'todo', at: '' };
    reg.late = reg.status !== 'registered' && !!(start && today && dayAdd(start, 30) < today);
    return { registration: reg, cedolare: cedolareDeclared(c) };
  }

  // ── Il foglio per il commercialista ──────────────────────────────────
  // Una riga per interno per mese (formato lungo: si filtra e si somma in
  // Excel senza ricomporre colonne). Separatore ';', decimali con la virgola,
  // date gg/mm/aaaa, BOM: è ciò che un Excel italiano apre senza chiedere.
  // Le parole sono quelle della proprietaria (mai "rata non registrata").
  var CSV_HEAD = ['Mese', 'Interno', 'Piano', 'Inquilino', 'Contratto', 'Dal', 'Al', 'Cedolare secca', 'Registrazione',
    'Canone mensile', 'Dovuto nel mese', 'Incassato nel mese', 'Pagato il', 'Stato'];
  var CSV_STATE = { paid: 'Pagato', late: 'Non ha pagato', due: 'Da pagare', review: 'In verifica', norate: 'In verifica da BOOM',
    unknown: 'In verifica', incoming: 'In arrivo', vacant: 'Libero' };
  function itDate(d) { var x = day(d); return x ? x.slice(8, 10) + '/' + x.slice(5, 7) + '/' + x.slice(0, 4) : ''; }
  function itNum(n) { return n == null || !isFinite(n) ? '' : round(n).toFixed(2).replace('.', ','); }
  function csvRows(m, opts) {
    if (!m || !m.units) return [];
    var owner = !!(opts && opts.owner);
    var rows = [];
    var floorOfUnit = function (u) { return u.floor == null ? '' : u.floorTop ? 'Attico' : floorLabel(u.floor); };
    m.units.slice().sort(function (a, b) { return (a.floor == null ? 999 : a.floor) - (b.floor == null ? 999 : b.floor) || natural(a.interno, b.interno); })
      .forEach(function (u) {
        var um = u.month, c = um.lease || um.incoming, pp = paperOf(c, m.today);
        var paid = um.rows.filter(function (r) { return r.month === m.month && r.state === 'paid' && r.paidDate; })
          .map(function (r) { return itDate(r.paidDate); });
        rows.push([m.month, u.interno || u.name, floorOfUnit(u), um.tenants.join(', '),
          c ? (str(c.type) || 'contratto') : '', um.leaseStart ? itDate(um.leaseStart) : '', um.leaseEnd ? itDate(um.leaseEnd) : '',
          !pp ? '' : pp.cedolare === true ? 'Sì' : pp.cedolare === false ? 'No' : 'Non indicata',
          !pp ? '' : pp.registration.status === 'registered' ? 'Registrato' + (pp.registration.at ? ' il ' + itDate(pp.registration.at) : '')
            : pp.registration.status === 'sent' ? 'Inviato per la registrazione' : owner ? 'In verifica da BOOM' : 'Non segnata',
          um.occupied || um.state === 'incoming' ? itNum(um.rent) : '', um.occupied ? itNum(um.expected) : '', um.occupied ? itNum(um.collected) : '', paid.join(', '),
          um.state === 'norate' && !owner ? 'Senza rata' : CSV_STATE[um.state] || '']);
      });
    return rows;
  }
  function toCsv(rows) {
    var cell = function (v) { var s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [CSV_HEAD].concat(rows).map(function (r) { return r.map(cell).join(';'); }).join('\r\n') + '\r\n';
  }

  // ── Cosa succede a un interno: proposte e annunci ─────────────────────
  var PA_DEAD = { revoked: 1, cancelled: 1, canceled: 1, expired: 1, rejected: 1, void: 1 };
  function paPaid(pa) { return !!(pa && (pa.paidAt || pa.paidSessionId || (Number(pa.paidEur) > 0))); }
  function pipelineOf(ctx, p) {
    var pid = str(p.id), out = { proposal: null, listing: null };
    var live = (ctx.proposalsByProperty[pid] || []).filter(function (pa) {
      var st = norm(pa.status);
      if (PA_DEAD[st]) return false;
      // Già diventata contratto: parla il contratto, non la proposta.
      if (str(pa.contractId) && ctx.contractById[str(pa.contractId)]) return false;
      var until = day(pa.validUntil);
      if (until && until < ctx.today && !(st === 'accepted' || st === 'paid' || paPaid(pa))) return false;
      return true;
    });
    var rank = function (pa) { var st = norm(pa.status); return paPaid(pa) || st === 'paid' ? 3 : st === 'accepted' ? 2 : st === 'reserve' ? 1 : 0; };
    var best = live.sort(function (a, b) { return rank(b) - rank(a) || str(b.createdAt && b.createdAt.seconds || b.createdAt).localeCompare(str(a.createdAt && a.createdAt.seconds || a.createdAt)); })[0];
    if (best) {
      var st = norm(best.status), lease = best.lease || {}, t = best.tenant || {};
      out.proposal = {
        id: str(best.id), ref: str(best.ref),
        kind: paPaid(best) || st === 'paid' || st === 'accepted' ? 'reserved' : st === 'reserve' ? 'waiting' : 'negotiating',
        paid: paPaid(best) || st === 'paid', status: st,
        tenant: str(t.fullName || t.name), startDate: day(lease.startDate), endDate: day(lease.endDate),
        rent: money(best.money && best.money.rent)
      };
    }
    var l = ctx.listingsByProperty[pid];
    if (l) {
      var ls = norm(l.status || l.availabilityStatus);
      out.listing = { id: str(l.id), status: ls, published: !!ls && ['available', 'waitlist', 'negotiation'].indexOf(ls) >= 0, url: '/listing/' + encodeURIComponent(str(l.id)) };
    }
    return out;
  }

  // ── Il tempo: puntualità, sfitto, contratti che finiscono ──────────────
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  function timeOf(ctx, p, endMonth) {
    var end = monthOf(endMonth) || ctx.month, from = monthAdd(end, -11);
    var rows = (ctx.paymentsByProperty[str(p.id)] || []).filter(function (r) {
      return r.isRent && r.state === 'paid' && r.dueDate && r.paidDate && r.month >= from && r.month <= end;
    });
    var delays = rows.map(function (r) { return daysBetween(r.dueDate, r.paidDate); });
    var occupiedMonths = 0;
    for (var i = 0; i < 12; i++) if (unitMonth(ctx, p, monthAdd(end, i - 11)).occupied) occupiedMonths++;
    // Libero da quando: la fine dell'ultimo contratto già chiuso.
    var ends = (ctx.contractsByProperty[str(p.id)] || []).filter(function (c) { return LIVE[cStatus(c)]; })
      .map(effectiveEnd).filter(function (d) { return d && d < ctx.today; }).sort();
    var lastEnd = ends.length ? ends[ends.length - 1] : '';
    return {
      paidCount: delays.length,
      avgDelay: delays.length ? Math.round(delays.reduce(function (a, b) { return a + b; }, 0) / delays.length * 10) / 10 : null,
      onTime: delays.filter(function (d) { return d <= 0; }).length,
      occupiedMonths: occupiedMonths, vacantMonths: 12 - occupiedMonths,
      vacantSince: lastEnd ? dayAdd(lastEnd, 1) : '', vacantDays: lastEnd ? daysBetween(lastEnd, ctx.today) : null
    };
  }

  // La frase del mese: quello che un proprietario chiederebbe al telefono,
  // scritto dai numeri. Mai una cifra che il modello non contiene.
  function brief(m, opts) {
    var owner = !!(opts && opts.owner);
    if (!m || !m.building) return [];
    var t = m.totals, mon = monthLabel(m.month), n = function (x, one, many) { return x + ' ' + (x === 1 ? one : many); };
    var late = m.units.filter(function (u) { return u.month.state === 'late'; }).sort(function (a, b) { return b.month.lateDays - a.month.lateDays; });
    var due = m.units.filter(function (u) { return u.month.state === 'due'; });
    var name = function (u) { return u.interno ? 'int. ' + u.interno : u.name; };
    var eur = function (v) { var x = Math.round(v); return '€' + String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
    var out = [mon + ': ' + t.occupied + ' interni su ' + t.units + ' sono pieni' + (t.vacant ? ', ' + n(t.vacant, 'libero', 'liberi') : '') + (t.incoming ? ', ' + t.incoming + ' in arrivo' : '') + '.'];
    var payers = t.paid + t.late + t.due + t.review + t.unknown;
    if (payers) out.push(n(t.paid, 'ha pagato', 'hanno pagato') + ' su ' + payers + ' (' + eur(t.collected) + ' di ' + eur(t.expected) + ').');
    if (late.length) out.push(n(late.length, 'è in ritardo', 'sono in ritardo') + ' per ' + eur(t.lateAmount) + ': ' + late.map(name).join(', ') + '.');
    else if (payers) out.push('Nessun ritardo.');
    if (due.length) {
      var dates = due.map(function (u) { var r = u.month.rows.find(function (x) { return x.state === 'due'; }); return r && r.dueDate; }).filter(Boolean).sort();
      var last = dates[dates.length - 1], dd = last ? +last.slice(8, 10) : 0;
      out.push(n(due.length, 'deve', 'devono') + ' ancora pagare' + (last ? ', entro ' + ([1, 8, 11].indexOf(dd) >= 0 ? "l'" : 'il ') + dd + ' ' + monthLabel(last.slice(0, 7)).split(' ')[0].toLowerCase() : '') + '.');
    }
    // Al proprietario si dice cosa sta facendo BOOM, non il nome del
    // problema interno: "rata non registrata" è un lavoro dell'operatore.
    if (owner) { if (t.review + t.norate) out.push(n(t.review + t.norate, 'pagamento è', 'pagamenti sono') + ' in verifica da BOOM.'); }
    else {
      if (t.review) out.push(n(t.review, 'pagamento è', 'pagamenti sono') + ' da verificare.');
      if (t.norate) out.push(n(t.norate, 'interno occupato non ha', 'interni occupati non hanno') + ' la rata registrata.');
    }
    if (t.arrears > t.lateAmount) out.push('Arretrati di tutti i mesi: ' + eur(t.arrears) + '.');
    return out;
  }

  // ── L'aspetto del palazzo ─────────────────────────────────────────────
  // La facciata disegna SOLO ciò che qualcuno ha dichiarato (dalla foto,
  // dal sopralluogo): intonaco, persiane, ultimo piano, nome. Senza
  // dichiarazione l'aspetto è neutro (pietra + grafite), mai "persiane
  // verdi" per default: sarebbe una bella bugia sul palazzo di qualcuno.
  // Il civico invece è un fatto (sta nell'indirizzo) e va sulla targa.
  var LOOKS = {
    intonaco: { pietra: ['Pietra · neutro', '#A9A193'], ocra: ['Ocra romana', '#C4874C'], giallo: ['Giallo Roma', '#CFA153'],
      rosso: ['Rosso pompeiano', '#A2573C'], rosa: ['Rosa antico', '#C0907E'], travertino: ['Travertino', '#CDBFA1'], bianco: ['Bianco', '#D6D2C7'] },
    persiane: { grafite: ['Grafite · neutro', '#3A3D41'], verde: ['Verde', '#2D4A38'], marrone: ['Marrone', '#4A3527'],
      grigio: ['Grigio', '#6A6F74'], bianco: ['Bianco', '#CBC6BB'] }
  };
  var LOOK_DEFAULT = { intonaco: 'pietra', persiane: 'grafite' };
  function civicOf(label) {
    var mm = /^(.*?)[\s,]+(\d+[a-z]?(?:\/[a-z0-9]+)?)$/i.exec(str(label));
    return mm ? { street: mm[1].trim(), civic: mm[2].toUpperCase() } : { street: str(label), civic: '' };
  }
  function lookOf(props, b, declaredTop) {
    var first = function (k) {
      for (var i = 0; i < props.length; i++) { var v = str(props[i] && props[i][k]); if (v) return v; }
      return '';
    };
    var it = first('palazzoIntonaco').toLowerCase(), pe = first('palazzoPersiane').toLowerCase();
    var where = b && b.key && b.key.slice(0, 2) === 'a:' ? civicOf(b.label) : civicOf(titleCase(streetKey(props[0] && props[0].address) || (b ? b.label : '')));
    return {
      intonaco: LOOKS.intonaco[it] ? it : LOOK_DEFAULT.intonaco,
      persiane: LOOKS.persiane[pe] ? pe : LOOK_DEFAULT.persiane,
      declared: { intonaco: !!LOOKS.intonaco[it], persiane: !!LOOKS.persiane[pe], topFloor: !!declaredTop },
      name: first('palazzoNome').slice(0, 60), street: where.street, civic: where.civic, topFloor: declaredTop || null
    };
  }
  // Quello che l'admin vuole salvare sugli interni del palazzo. Rifiuta,
  // mai aggiusta: un ultimo piano più basso di un interno gestito è un
  // errore da dire, non un numero da correggere in silenzio.
  function validateLook(input, m) {
    input = input || {};
    var out = {}, errors = [];
    if (input.intonaco != null) { if (LOOKS.intonaco[input.intonaco]) out.palazzoIntonaco = input.intonaco; else errors.push('intonaco'); }
    if (input.persiane != null) { if (LOOKS.persiane[input.persiane]) out.palazzoPersiane = input.persiane; else errors.push('persiane'); }
    if (input.nome != null) {
      var n = str(input.nome);
      if (n.length > 60) errors.push('nome'); else out.palazzoNome = n;
    }
    if (input.ultimoPiano != null && str(input.ultimoPiano) !== '') {
      var u = Number(input.ultimoPiano);
      var units = m && m.units ? m.units : [];
      var highest = units.reduce(function (h, x) { return x.floor != null && !x.floorTop && x.floor > h ? x.floor : h; }, -1);
      var need = highest + (units.some(function (x) { return x.floorTop; }) ? 1 : 0);
      if (!(u === Math.floor(u)) || u < 1 || u > 40) errors.push('ultimoPiano');
      else if (u < need) errors.push('ultimoPiano<' + need);
      else out.ultimoPiano = u;
    }
    return { ok: !errors.length, fields: out, errors: errors };
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
    // property.ultimoPiano: il numero dell'ultimo piano del palazzo (attico
    // compreso). Non "quanti piani": quello si legge in due modi (col piano
    // terra o senza) e il disegno mentirebbe di un piano.
    var declared = props.map(function (p) { return parseInt(p.ultimoPiano, 10); }).filter(function (x) { return x > 0 && x <= 40; });
    var savedTop = declared.length ? Math.max.apply(null, declared) : null, declaredTop = savedTop;
    // L'anteprima dell'admin (opts.topFloor) prima di salvare: stesso disegno,
    // ma m.look resta ciò che è SALVATO (è il confronto per "cosa è cambiato").
    if (opts.topFloor > 0 && opts.topFloor <= 40) declaredTop = Math.floor(opts.topFloor);
    var topN = Math.max(known.length ? Math.max.apply(null, known) + 1 : 1, declaredTop || 0);
    var owner = b.owner;
    var units = props.map(function (p) {
      var f = floorOf(p), um = unitMonth(ctx, p, m), o = ownerOf(p, ctx.usersById);
      return {
        id: str(p.id), property: p, interno: unitOf(p), scala: scalaOf(p),
        floor: f ? (f.top ? topN : f.n) : null, floorTop: !!(f && f.top),
        name: str(p.name) || str(p.address) || 'Interno', owner: o,
        ownerMismatch: !!(owner && o.key !== owner.key),
        month: um, arrears: arrearsOf(ctx, p), pipeline: pipelineOf(ctx, p), time: timeOf(ctx, p, m > ctx.month ? m : ctx.month),
        paper: paperOf(um.lease || um.incoming, ctx.today),
        strip: opts.strip === false ? [] : strip(ctx, p, m > ctx.month ? m : ctx.month, 12)
      };
    }).sort(function (a, b2) { return natural(a.scala, b2.scala) || natural(a.interno, b2.interno) || natural(a.name, b2.name); });
    // Un interno libero con una proposta accettata o pagata (contratto non
    // ancora creato) è in arrivo: chi, da quando, lo dice la proposta.
    units.forEach(function (u) {
      var pr = u.pipeline.proposal;
      if (u.month.state === 'vacant' && pr && pr.kind === 'reserved' && (!pr.startDate || pr.startDate.slice(0, 7) >= m)) {
        u.month.state = 'incoming'; u.month.fromProposal = true;
        u.month.tenants = pr.tenant ? [pr.tenant] : []; u.month.leaseStart = pr.startDate; u.month.rent = pr.rent != null ? pr.rent : u.month.rent;
      }
    });
    var floorsMap = Object.create(null), unplaced = [];
    units.forEach(function (u) {
      if (u.floor == null) { unplaced.push(u); return; }
      (floorsMap[u.floor] = floorsMap[u.floor] || []).push(u);
    });
    // Il palazzo vero non ha buchi: il piano terra, un piano fra due piani
    // gestiti, o fino all'ultimo piano dichiarato (property.ultimoPiano) ci
    // sono anche se BOOM non vi gestisce nessun interno: si disegnano vuoti.
    var nums = Object.keys(floorsMap).map(Number);
    var lo = nums.length ? Math.min(0, Math.min.apply(null, nums)) : 0;
    var hi = nums.length ? Math.max.apply(null, nums) : -1;
    if (declaredTop) hi = Math.max(hi, declaredTop);
    for (var g = lo; g <= hi; g++) if (!floorsMap[g]) floorsMap[g] = [];
    var floors = Object.keys(floorsMap).map(Number).sort(function (a, b2) { return a - b2; }).map(function (n) {
      var fl = floorsMap[n], top = fl.length && fl.every(function (u) { return u.floorTop; });
      return { n: n, label: top ? 'Attico' : floorLabel(n), short: top ? 'AT' : floorLabel(n, true), units: fl, ghost: !fl.length };
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
    var unreg = units.filter(function (u) { return u.month.lease && u.paper && u.paper.registration.late; });
    if (unreg.length) issues.push({ code: 'unregistered', count: unreg.length, ids: unreg.map(function (u) { return u.id; }) });
    var norate = units.filter(function (u) { return u.month.state === 'norate' && m <= ctx.month; });
    if (norate.length) issues.push({ code: 'norate', count: norate.length, ids: norate.map(function (u) { return u.id; }) });
    var model0 = { building: b, buildings: all, month: m, currentMonth: ctx.month, today: ctx.today, floors: floors, unplaced: unplaced, units: units,
      totals: totalsOf(units), series: series, issues: issues, owner: owner, look: lookOf(props, b, savedTop) };
    model0.analytics = analyticsOf(ctx, model0);
    model0.brief = brief(model0);
    return model0;
  }

  // L'andamento del palazzo negli ultimi 12 mesi. Solo misure, nessuna
  // stima: il canone "perso" per lo sfitto non si inventa.
  function analyticsOf(ctx, m) {
    var paid = 0, onTime = 0, delaySum = 0, unitMonths = 0, occMonths = 0;
    m.units.forEach(function (u) {
      paid += u.time.paidCount; onTime += u.time.onTime;
      if (u.time.avgDelay != null) delaySum += u.time.avgDelay * u.time.paidCount;
      unitMonths += 12; occMonths += u.time.occupiedMonths;
    });
    // Incassato su SCADUTO: una rata che scade fra una settimana non è un
    // mancato incasso, quindi non abbassa la percentuale.
    var dueTotal = 0, collectedTotal = 0, from = monthAdd(ctx.month, -11);
    m.units.forEach(function (u) {
      (ctx.paymentsByProperty[u.id] || []).forEach(function (r) {
        if (!r.isRent || r.state === 'cancelled' || r.amount == null || !r.month || r.month < from || r.month > ctx.month) return;
        if (!r.dueDate || r.dueDate > ctx.today) return;
        dueTotal = round(dueTotal + r.amount);
        if (r.state === 'paid') collectedTotal = round(collectedTotal + r.amount);
      });
    });
    var horizon = dayAdd(ctx.today, 365);
    var expiries = m.units.filter(function (u) { return u.month.leaseEnd && u.month.leaseEnd >= ctx.today && u.month.leaseEnd <= horizon; })
      .map(function (u) { return { id: u.id, interno: u.interno, name: u.name, date: u.month.leaseEnd, tenants: u.month.tenants, next: u.pipeline.proposal }; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
    var vacant = m.units.filter(function (u) { return u.month.state === 'vacant' || u.month.state === 'incoming'; })
      .map(function (u) { return { id: u.id, interno: u.interno, name: u.name, days: u.time.vacantDays, since: u.time.vacantSince, pipeline: u.pipeline }; })
      .sort(function (a, b) { return (b.days || 0) - (a.days || 0); });
    return {
      paidCount: paid, onTime: onTime, onTimePct: paid ? Math.round(onTime / paid * 100) : null,
      avgDelay: paid ? Math.round(delaySum / paid * 10) / 10 : null,
      occupancy12: unitMonths ? Math.round(occMonths / unitMonths * 100) : 0, vacantMonths: unitMonths - occMonths,
      collected12: collectedTotal, expected12: dueTotal, collectionPct: dueTotal ? Math.round(collectedTotal / dueTotal * 100) : null,
      months: m.series.map(function (s) { return { month: s.month, expected: s.totals.expected, collected: s.totals.collected, late: s.totals.lateAmount }; }),
      expiries: expiries, vacant: vacant
    };
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
    totalsOf: totalsOf, pipelineOf: pipelineOf, timeOf: timeOf, analyticsOf: analyticsOf, brief: brief, STATES: STATES, TONES: TONES, toneOf: toneOf,
    LOOKS: LOOKS, LOOK_DEFAULT: LOOK_DEFAULT, lookOf: lookOf, civicOf: civicOf, validateLook: validateLook,
    paperOf: paperOf, cedolareDeclared: cedolareDeclared, csvRows: csvRows, toCsv: toCsv, CSV_HEAD: CSV_HEAD };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.BOOM_PALAZZO = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
