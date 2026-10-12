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
  // Che tipo di contratto è (carta, segnaposto): UNA copia, la stessa della
  // macchina di firma. Senza il modulo (una pagina che non lo carica) le due
  // regole sono le sue, ricopiate alla lettera.
  var CS = ((typeof module === 'object' && module.exports) ? require('./contract-state.js') : root.BOOM_CONTRACT_STATE) || {
    isPaper: function (c) { return !!(c && String(c.signatureStatus || '').trim() === 'paper'); },
    isPlaceholder: function (c) { return !!(c && c.contractMissing === true); }
  };

  function str(v) { return v == null ? '' : String(v).trim(); }
  function norm(v) { return str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }
  function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function money(v) { var n = RENT && RENT.amount ? RENT.amount(v) : (typeof v === 'number' && v >= 0 ? v : null); return n; }

  // ── Date civili (Europe/Rome) ─────────────────────────────────────────
  // Una stringa con l'ora E il fuso ('…T23:30:00.000Z', '…+02:00') è un
  // ISTANTE: il giorno è quello di Roma, non i primi dieci caratteri (un
  // incasso registrato alle 00:30 del 6 novembre a Roma è del 6, non del 5;
  // il 31/12 alle 23:30 UTC è già l'anno dopo). Senza fuso la data è quella
  // scritta: nessuno ha detto in che ora del mondo.
  var INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
  function day(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
      var s0 = value.trim();
      var m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(s0);
      if (!m) return '';
      var d0 = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (!(d0.getUTCFullYear() === +m[1] && d0.getUTCMonth() === +m[2] - 1 && d0.getUTCDate() === +m[3])) return '';
      if (INSTANT_RE.test(s0)) { var at = new Date(s0); if (Number.isFinite(at.getTime())) return day(at); }
      return m[0].slice(0, 10);
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
  // Il giorno k mesi dopo, col fine mese tenuto (31/01 + 1 → 28/02).
  function leaseMonth(d, k) {
    var y = +d.slice(0, 4), mo = +d.slice(5, 7) - 1 + k, dd = +d.slice(8, 10);
    var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, mo, Math.min(dd, last))).toISOString().slice(0, 10);
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
  function dayAdd(d, k) {
    var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k);
    return x.toISOString().slice(0, 10);
  }
  // Quanti mesi di calendario da a (YYYY-MM) a b (YYYY-MM): b − a.
  function monthsDiff(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
  // Il giorno in cui una rata è stata pagata. Il webhook Stripe scrive
  // paidAt (l'istante) e paidDate = i primi dieci caratteri in UTC: lì vale
  // l'istante, letto a Roma. Una paidDate scritta come data a sé (l'accredito
  // dichiarato da chi registra l'incasso) resta quella: è il fatto.
  function paidDayOf(p) {
    var at = p && p.paidAt, pd = p && p.paidDate;
    var atDay = at && (typeof at !== 'string' || INSTANT_RE.test(at.trim())) ? day(typeof at === 'string' ? new Date(at.trim()) : at) : '';
    var pdDay = day(pd);
    if (atDay && (!pdDay || (typeof pd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pd.trim()) && typeof at === 'string' && at.trim().slice(0, 10) === pd.trim()))) return atDay;
    return pdDay || atDay;
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
  // Che contratto è: firmato su carta (la presa in carico), segnaposto (non
  // ancora in archivio) o nella macchina digitale. Un contratto di carta
  // non è mai "da firmare": la firma c'è, a penna.
  function contractKindOf(c) {
    if (!c) return null;
    if (CS.isPlaceholder(c)) return 'placeholder';
    if (CS.isPaper(c)) return 'paper';
    return 'digital';
  }
  // I giorni di due contratti si toccano davvero? (Non lo stesso MESE: un
  // cambio inquilino al 15 non è una sovrapposizione.) Senza inizio il
  // contratto è dichiarato in corso: copre tutto, e lo si dice.
  function daysOverlap(a, b) {
    var sa = day(a.startDate), sb = day(b.startDate), ea = effectiveEnd(a), eb = effectiveEnd(b);
    if (!sa || !sb) return true;
    return sb <= (ea || '9999-12-31') && sa <= (eb || '9999-12-31');
  }
  // Il locatore è una società? Dalla forma giuridica nel nome (S.r.l., SPA,
  // S.a.s., società, coop…) o da una sigla puntata di almeno tre lettere.
  // Serve a non parlare di IRPEF/cedolare a una società e a dire a nome di
  // chi è il reddito; un nome di persona resta persona.
  var COMPANY_RE = /(^|[^a-z])(s\.?\s?r\.?\s?l\.?\s?s?\.?|s\.?\s?p\.?\s?a\.?|s\.\s?a\.\s?p\.\s?a\.|s\.?\s?a\.?\s?s\.?|s\.?\s?n\.?\s?c\.?|s\.\s?s\.|s\.\s?a\.|soc\.|societa|cooperativa|coop\.?|consorzio|fondazione|associazione|holding|immobiliare|ltd\.?|gmbh|llc|inc\.|sarl)(?=$|[^a-z])/;
  function isCompanyName(name) {
    var s = norm(name);
    if (!s) return false;
    if (COMPANY_RE.test(s)) return true;
    // Solo sigla puntata (almeno tre lettere, e nient'altro): un nome con le
    // iniziali puntate davanti al cognome resta una persona.
    return /^(?:[a-z]\.\s?){3,}$/.test(s);
  }
  // ── La fine del contratto: disdetta e rinnovo ──────────────────────────
  // Dai MODELLI (js/contract-pdf.js), non da un'idea: studenti (Allegato C,
  // art. 1) si rinnova per uguale periodo se il conduttore non dà disdetta
  // almeno tre mesi prima; transitorio (Allegato B, art. 1) cessa senza
  // disdetta; 3+2 (Allegato A, art. 1) alla prima scadenza si proroga di
  // diritto di due anni, e la comunicazione per la rinuncia va data sei mesi
  // prima. Il 4+4 non ha un modello BOOM: il termine (sei mesi) viene dalla
  // legge, dichiarato. Un tipo che non si legge: tre mesi, DICHIARATI come
  // ipotesi da verificare sul contratto.
  function typeKey(c) {
    var t = norm(c && c.type);
    if (t === 'studenti' || t === 'studente' || t === 'universitario') return 'studenti';
    if (t === 'transitorio' || t === 'transitoria') return 'transitorio';
    if (t === '3+2' || t === '32' || t === 'concordato' || t === 'canone concordato') return '3+2';
    if (t === '4+4' || t === '44' || t === 'libero' || t === 'canone libero') return '4+4';
    return '';
  }
  var NOTICE = {
    studenti: { months: 3, renews: 'tacito', source: 'modello', rule: 'Contratto studenti (Allegato C, art. 1): senza disdetta del conduttore almeno tre mesi prima della scadenza si rinnova per uguale periodo.' },
    transitorio: { months: 0, renews: '', source: 'modello', rule: 'Contratto transitorio (Allegato B, art. 1): cessa alla scadenza senza bisogno di disdetta.' },
    '3+2': { months: 6, renews: 'proroga', source: 'modello', rule: 'Contratto 3+2 (Allegato A, art. 1): alla prima scadenza si proroga di diritto di due anni; la comunicazione per non rinnovare va data almeno sei mesi prima.' },
    '4+4': { months: 6, renews: 'rinnovo', source: 'legge', rule: 'Contratto 4+4 (L. 431/98, art. 2 c. 1): alla prima scadenza si rinnova di quattro anni, salvo disdetta del locatore per i motivi di legge con almeno sei mesi di preavviso.' },
    '': { months: 3, renews: '', source: 'ipotesi', assumed: true, rule: 'Tipo di contratto non indicato: termine di disdetta di tre mesi IPOTIZZATO, da verificare sul contratto.' }
  };
  function noticeOf(c, today) {
    if (!c || CS.isPlaceholder(c)) return null;
    var end = effectiveEnd(c);
    if (!end) return null;
    var k = typeKey(c), N = NOTICE[k], terminated = cStatus(c) === 'terminated' || !!day(c.terminatedAt);
    var by = N.months && !terminated ? leaseMonth(end, -N.months) : '';
    return { type: k || null, end: end, months: terminated ? 0 : N.months, by: by, renews: terminated ? '' : N.renews, rule: N.rule, source: N.source, assumed: !!N.assumed,
      terminated: terminated, received: day(c.disdettaAt), passed: !!(by && today && by < today),
      daysToEnd: today ? daysBetween(today, end) : null, daysToBy: by && today ? daysBetween(today, by) : null };
  }

  // ── Contesto: indici una volta sola ──────────────────────────────────
  // ── Manutenzione e utenze ────────────────────────────────────────────
  var MAINT_DONE = { resolved: 1, closed: 1, done: 1, completed: 1, cancelled: 1, canceled: 1 };
  var MAINT_PRI = { urgent: 'urgent', emergency: 'urgent', emergenza: 'urgent', high: 'high', urgente: 'high', medium: 'medium', normal: 'medium', normale: 'medium', low: 'low' };
  var MAINT_CAT = { plumbing: 'Acqua / scarichi', idraulica: 'Acqua / scarichi', electrical: 'Luce / prese', elettricita: 'Luce / prese', heating: 'Caldaia / riscaldamento',
    riscaldamento: 'Caldaia / riscaldamento', appliance: 'Elettrodomestici', elettrodomestici: 'Elettrodomestici', locks: 'Porta / serratura', serrature: 'Porta / serratura',
    leaks: 'Infiltrazioni / umidità', common: 'Parti comuni', other: 'Altro', altro: 'Altro' };
  function maintItem(mt) {
    var st = norm(mt.status) || 'open';
    return { id: str(mt.id), title: str(mt.title) || (MAINT_CAT[norm(mt.category)] || 'Manutenzione'), category: MAINT_CAT[norm(mt.category)] || 'Altro',
      priority: MAINT_PRI[norm(mt.priority)] || 'medium', status: st, open: !MAINT_DONE[st], inProgress: st === 'in_progress',
      createdAt: day(mt.createdAt), resolvedAt: day(mt.resolvedAt || mt.completedAt), description: str(mt.description).slice(0, 400),
      reporter: str(mt.reporter && mt.reporter.role) || (mt.tenantName || mt.tenantId ? 'tenant' : ''), photoUrl: str(mt.photoUrl) };
  }
  var PRI_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
  function maintOf(ctx, p) {
    var all = (ctx.maintenanceByProperty && ctx.maintenanceByProperty[str(p.id)]) || [];
    var open = all.filter(function (x) { return x.open; })
      .sort(function (a, b) { return (PRI_RANK[a.priority] - PRI_RANK[b.priority]) || String(b.createdAt).localeCompare(String(a.createdAt)); });
    var closed = all.filter(function (x) { return !x.open; }).sort(function (a, b) { return String(b.resolvedAt || b.createdAt).localeCompare(String(a.resolvedAt || a.createdAt)); });
    return { open: open, urgent: open.filter(function (x) { return x.priority === 'urgent' || x.priority === 'high'; }).length, recentClosed: closed.slice(0, 3), total: all.length };
  }
  // POD (luce): IT + 3 cifre del distributore + E + 8/9 cifre. PDR (gas): 14
  // cifre. Un codice scritto male si conserva com'è ma si DICHIARA: al
  // mediatore non deve partire un codice che il distributore rifiuterà.
  function cleanCode(v) { return str(v).toUpperCase().replace(/[\s.\-]/g, ''); }
  function podOk(v) { return /^IT\d{3}E\d{8,9}$/.test(cleanCode(v)); }
  function pdrOk(v) { return /^\d{14}$/.test(cleanCode(v)); }
  function utenzeOf(p) {
    var pod = cleanCode(p && p.pod), pdr = cleanCode(p && p.pdr);
    return { pod: pod, pdr: pdr, podOk: pod ? podOk(pod) : null, pdrOk: pdr ? pdrOk(pdr) : null };
  }

  function httpsUrl(u) { try { var x = new URL(str(u)); return x.protocol === 'https:' ? x.href : ''; } catch (_) { return ''; } }
  // Canone e oneri di una rata: dalle due voci scritte sulla rata (la presa in
  // carico le scrive), oppure dal contratto quando il totale torna ESATTO con
  // canone + oneri. Altrimenti null: non si divide a occhio un incasso.
  function splitRow(row, c) {
    var p = row.payment || {}, a = row.amount;
    if (a == null || !row.isRent) return { rent: null, oneri: null };
    var ra = money(p.rentAmount), oa = money(p.oneriAmount);
    if (ra != null && oa != null && Math.abs(round(ra + oa) - a) < 0.01) return { rent: ra, oneri: oa };
    if (oa != null && oa <= a) return { rent: round(a - oa), oneri: oa };
    if (ra != null && ra <= a) return { rent: ra, oneri: round(a - ra) };
    var q = c ? money(c.oneriQuota) : null;
    if (!q) return { rent: a, oneri: 0 };
    var r = contractRent(c);
    if (r != null && Math.abs(round(r + q) - a) < 0.01) return { rent: r, oneri: q };
    return { rent: null, oneri: null };
  }

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
    var paymentsByProperty = Object.create(null), preBoomOpen = Object.create(null), afterClose = Object.create(null);
    list(o.payments).forEach(function (p, i) {
      var contract = contractById[str(p.contractId)] || null;
      var pid = str(p.propertyId) || str(contract && contract.propertyId);
      if (!pid || !propIds[pid]) return;
      var row = {
        id: str(p.id) || 'missing-id:' + i, payment: p, contract: contract, contractId: str(p.contractId), type: norm(p.type),
        month: monthOf(p.month) || day(p.dueDate).slice(0, 7), coversTo: monthOf(p.coversTo),
        dueDate: day(p.dueDate), paidDate: paidDayOf(p),
        amount: money(p.amount), state: RENT.paymentState(p, now), isRent: RENT.isRentPayment(p),
        tenantName: str(p.tenantName) || str(contract && contract.tenantName),
        // Chi deve QUESTA rata: i nomi del SUO contratto, non di chi abita lì
        // oggi (nel mese del cambio inquilino il ritardo del vecchio resta suo).
        tenants: contract ? tenantNamesOf(contract, usersById) : (str(p.tenantName) ? [str(p.tenantName)] : []),
        // Come è stata pagata e chi l'ha visto: per il commercialista e per
        // la scheda. La ricevuta solo https (un link qualsiasi non si apre).
        paidVia: norm(p.paidVia), paidEvidence: norm(p.paidEvidence), paidSource: str(p.paidSource).slice(0, 80),
        receiptUrl: httpsUrl(p.receiptUrl), proofUrl: httpsUrl(p.proofUrl)
      };
      if (row.state === 'overdue' && row.dueDate) row.days = Math.max(0, daysBetween(row.dueDate, today));
      var parts = splitRow(row, contract);
      row.rentPart = parts.rent; row.oneriPart = parts.oneri;
      // Il periodo della rata: scritto (periodFrom/periodTo, la presa in
      // carico), oppure ricavato dal giorno di decorrenza del contratto come
      // fanno i generatori (mesi di LOCAZIONE): una rata di luglio di un
      // contratto dal 15 copre fino al 14 agosto.
      var pf = day(p.periodFrom), pt = day(p.periodTo), cs = contract ? day(contract.startDate) : '';
      if ((!pf || !pt) && cs && row.month && monthsDiff(cs.slice(0, 7), row.month) >= 0) {
        var k0 = monthsDiff(cs.slice(0, 7), row.month), k1 = monthsDiff(cs.slice(0, 7), row.coversTo && row.coversTo > row.month ? row.coversTo : row.month) + 1;
        if (!pf) pf = leaseMonth(cs, k0);
        if (!pt) { pt = dayAdd(leaseMonth(cs, k1), -1); var ce = effectiveEnd(contract); if (ce && pt > ce) pt = ce; }
        row.periodDerived = true;
      }
      row.periodFrom = pf; row.periodTo = pt;
      // Gestione BOOM dal (property.gestioneDal, YYYY-MM): ciò che è prima non
      // è storia di BOOM. Una rata di quei mesi (nata da un generatore che
      // parte dalla decorrenza di un contratto vecchio) non è un arretrato:
      // si toglie dal Palazzo e si conta a parte, perché l'operatore la chiuda.
      var gd = monthOf(propIds[pid].gestioneDal);
      if (gd && row.month && (row.coversTo || row.month) < gd) {
        if (row.state === 'overdue' || row.state === 'due') preBoomOpen[pid] = (preBoomOpen[pid] || 0) + 1;
        return;
      }
      // Una rata il cui periodo comincia DOPO la fine del suo contratto
      // (chiuso in anticipo, rate future rimaste aperte): non tiene occupato
      // l'interno e non è un ritardo. Aperta, si toglie dal Palazzo e si conta
      // per l'operatore (va annullata); pagata resta (sono soldi veri) ma si
      // dichiara, perché il contratto dice che lì non c'era più nessuno.
      var cEnd = contract ? effectiveEnd(contract) : '', pStart = pf || (row.month ? monthStart(row.month) : '');
      if (cEnd && pStart && pStart > cEnd) {
        row.afterClose = true;
        var ac = afterClose[pid] = afterClose[pid] || { open: [], paid: [] };
        if (row.state === 'overdue' || row.state === 'due' || row.state === 'unknown') { ac.open.push(row); return; }
        if (row.state === 'paid') ac.paid.push(row);
      }
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
    // La manutenzione: la stessa collection del portal (Manutenzione, Oggi,
    // il Gestore). Due vocabolari convivono (il portal: plumbing/urgent; /casa:
    // idraulica/emergency): qui si leggono entrambi, mai uno si perde.
    var maintenanceByProperty = Object.create(null);
    list(o.maintenance).forEach(function (mt) {
      var pid = str(mt.propertyId);
      if (!pid || !propIds[pid]) return;
      (maintenanceByProperty[pid] = maintenanceByProperty[pid] || []).push(maintItem(mt));
    });
    var listingsByProperty = Object.create(null), listingById = Object.create(null);
    list(o.listings).forEach(function (l) { if (str(l.id)) listingById[str(l.id)] = l; });
    properties.forEach(function (p) {
      var l = listingById[str(p.listingId)] || list(o.listings).find(function (x) { return str(x.propertyId) === str(p.id); });
      if (l) listingsByProperty[str(p.id)] = l;
    });
    return { now: now, today: today, month: today.slice(0, 7), properties: properties, usersById: usersById,
      contractsByProperty: byProperty, paymentsByProperty: paymentsByProperty, preBoomOpen: preBoomOpen, afterClose: afterClose,
      proposalsByProperty: proposalsByProperty, listingsByProperty: listingsByProperty, contractById: contractById,
      maintenanceByProperty: maintenanceByProperty };
  }

  // ── Un interno in un mese ────────────────────────────────────────────
  // QUATTRO TONI a schermo (8/10): gli stati sono otto perché i dati sono
  // otto, ma la proprietaria ne legge quattro. Una copia sola, letta da
  // filtri, legenda, facciata e test.
  var TONES = [
    { key: 'pagato', label: 'Pagato', states: ['paid'] },
    { key: 'ritardo', label: 'Non ha pagato', states: ['late'] },
    { key: 'attesa', label: 'In attesa', states: ['due', 'review', 'norate', 'unknown'] },
    { key: 'libero', label: 'Libero', states: ['vacant', 'incoming'] },
    // Solo nei mesi prima della gestione BOOM: la vista lo mostra soltanto
    // quando c'è, quindi oggi i toni a schermo restano quattro.
    { key: 'prima', label: 'Prima di BOOM', states: ['before'] }
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
    vacant: { label: 'Libero', short: 'Libero' },
    before: { label: 'Prima di BOOM', short: 'Prima' }
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
  // Il mese di calendario che resta dopo l'ultima rata di un contratto
  // iniziato a metà mese (dal 15/09 al 14/08: agosto, giorni 1–14) è coperto
  // dal PERIODO della rata di luglio, non da una rata sua: non è "rata non
  // registrata". Solo come ripiego, quando il mese non ha rate proprie, e
  // l'importo resta nel mese della rata (mai contato due volte).
  function carriedRows(rows, month) {
    var ms = monthStart(month), me = monthEnd(month);
    return rows.filter(function (r) {
      return r.isRent && r.state !== 'cancelled' && r.month && r.month < month && r.periodFrom && r.periodTo && r.periodFrom <= me && r.periodTo >= ms;
    });
  }
  function byDue(a, b) { return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || String(a.month).localeCompare(String(b.month)); }
  function unitMonth(ctx, p, month) {
    var pid = str(p.id), contracts = ctx.contractsByProperty[pid] || [], rows = ctx.paymentsByProperty[pid] || [];
    var lease = contracts.filter(function (c) { return LIVE[cStatus(c)] && covers(c, month); })
      .sort(function (a, b) { return (day(b.startDate) || '').localeCompare(day(a.startDate) || ''); })[0] || null;
    var monthRows = rowsForMonth(rows, month), carried = false;
    if (!monthRows.length && lease) { var cr = carriedRows(rows, month); if (cr.length) { monthRows = cr; carried = true; } }
    var ownRows = monthRows.filter(function (r) { return r.month === month; });
    var occupied = !!lease || monthRows.length > 0;
    var incoming = null;
    if (!occupied) {
      incoming = contracts.filter(function (c) { return (LIVE[cStatus(c)] || SIGNING[cStatus(c)]) && day(c.startDate) > monthEnd(month); })
        .sort(function (a, b) { return day(a.startDate).localeCompare(day(b.startDate)); })[0] || null;
    }
    var pay = aggregate(monthRows.map(function (r) { return r.state; }));
    var state = !occupied ? (incoming ? 'incoming' : 'vacant') : !monthRows.length ? 'norate' : pay;
    var expected = 0, collected = 0, lateAmount = 0, unknownAmounts = 0, lateUnknown = 0;
    var split = { er: 0, eo: 0, cr: 0, co: 0, ok: true };
    ownRows.forEach(function (r) {
      if (r.amount == null) { unknownAmounts++; split.ok = false; if (r.state === 'overdue') lateUnknown++; return; }
      expected = round(expected + r.amount);
      if (r.state === 'paid') collected = round(collected + r.amount);
      if (r.state === 'overdue') lateAmount = round(lateAmount + r.amount);
      if (r.rentPart == null) { split.ok = false; return; }
      split.er = round(split.er + r.rentPart); split.eo = round(split.eo + r.oneriPart);
      if (r.state === 'paid') { split.cr = round(split.cr + r.rentPart); split.co = round(split.co + r.oneriPart); }
    });
    var who = lease || incoming;
    var tenants = who ? tenantNamesOf(who, ctx.usersById) : [];
    if (!tenants.length) monthRows.forEach(function (r) { if (r.tenantName && tenants.indexOf(r.tenantName) < 0) tenants.push(r.tenantName); });
    var leaseEnd = lease ? effectiveEnd(lease) : '';
    var ref = ctx.today > monthStart(month) ? ctx.today : monthStart(month);
    var gd = monthOf(p.gestioneDal);
    // Le rate scadute e non pagate fino a questo mese (ad oggi), anche dei
    // mesi prima: chi non ha pagato novembre a dicembre è ancora in ritardo.
    var overdueUpTo = rows.filter(function (r) { return r.state === 'overdue' && (!r.month || r.month <= month); }).sort(byDue);
    if (gd && month < gd) { state = 'before'; expected = 0; collected = 0; lateAmount = 0; unknownAmounts = 0; lateUnknown = 0; split = { er: 0, eo: 0, cr: 0, co: 0, ok: true }; overdueUpTo = []; }
    var pastDue = overdueUpTo.filter(function (r) { return monthRows.indexOf(r) < 0; });
    var latePaid = monthRows.filter(function (r) { return r.state === 'overdue'; })
      .map(function (r) { return r.dueDate; }).filter(Boolean).sort()[0] || '';
    var contractId = str((lease || incoming || {}).id), lateRow = overdueUpTo[0] || null;
    return {
      month: month, state: state, occupied: occupied, lease: lease, incoming: incoming, gestioneDal: gd,
      contractId: contractId, tenants: tenants,
      contractKind: contractKindOf(lease || incoming), placeholder: !!(lease && CS.isPlaceholder(lease)),
      landlordName: str((lease || incoming || {}).landlordName).slice(0, 160),
      // Un contratto non ancora in archivio non ha canone: mai lo 0 della scheda.
      rent: contractRent(lease || incoming) != null ? contractRent(lease || incoming) : (lease && lease.contractMissing === true ? null : money(p.rent)),
      leaseStart: lease ? day(lease.startDate) : incoming ? day(incoming.startDate) : '', leaseEnd: leaseEnd,
      leaving: !!(leaseEnd && leaseEnd >= ref && leaseEnd <= dayAdd(ref, 90)),
      rows: monthRows, carried: carried, pastDue: pastDue, overdueUpTo: overdueUpTo,
      expected: expected, collected: collected, lateAmount: lateAmount, unknownAmounts: unknownAmounts, lateUnknown: lateUnknown,
      // Canone e oneri separati (null se una rata non si divide con certezza).
      expectedRent: split.ok ? split.er : null, expectedOneri: split.ok ? split.eo : null,
      collectedRent: split.ok ? split.cr : null, collectedOneri: split.ok ? split.co : null,
      lateSince: latePaid, lateDays: latePaid ? Math.max(0, Math.round((Date.parse(ctx.today) - Date.parse(latePaid)) / 864e5)) : 0,
      // Il ritardo è del contratto della RATA: nel mese del cambio inquilino
      // il debito del vecchio non diventa del nuovo (né il suo sollecito).
      lateContractId: lateRow ? lateRow.contractId : '', lateTenants: lateRow ? lateRow.tenants.slice() : [],
      lateFromPrevious: !!(lateRow && lateRow.contractId && contractId && lateRow.contractId !== contractId)
    };
  }
  // Le rate scadute e non pagate (ad oggi) di un interno: tutte, oppure fino
  // al mese `upTo`. Le righe sono le rate vere (id, mese, importo, scadenza,
  // giorni, contratto e i SUOI conduttori), dalla più vecchia.
  function arrearsOf(ctx, p, upTo) {
    var out = { amount: 0, count: 0, rent: 0, other: 0, oldest: '', oldestDays: 0, oldestMonth: '', unknownAmounts: 0, rows: [] };
    var limit = monthOf(upTo);
    (ctx.paymentsByProperty[str(p.id)] || []).forEach(function (r) {
      if (r.state !== 'overdue') return;
      if (limit && r.month && r.month > limit) return;
      out.count++;
      out.rows.push(r);
      if (r.amount != null) { out.amount = round(out.amount + r.amount); out[r.isRent ? 'rent' : 'other'] = round(out[r.isRent ? 'rent' : 'other'] + r.amount); }
      else out.unknownAmounts++;
    });
    out.rows.sort(byDue);
    var first = out.rows.find(function (r) { return r.dueDate; });
    if (first) { out.oldest = first.dueDate; out.oldestDays = first.days || 0; out.oldestMonth = first.month; }
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
  // Canone e oneri in colonne SEPARATE (gli oneri sono un rimborso di spese,
  // non reddito da locazione), come si è pagato e chi l'ha visto; una cella
  // senza dato resta VUOTA, mai 0,00. Nel mese del cambio inquilino una riga
  // per contratto: il debito del vecchio non finisce sul nuovo.
  var CSV_HEAD = ['Mese', 'Interno', 'Piano', 'Inquilino', 'Locatore', 'Contratto', 'Dal', 'Al', 'Cedolare secca', 'Registrazione',
    'Canone mensile', 'Oneri mensili', 'Dovuto nel mese', 'Incassato canone', 'Incassato oneri', 'Incassato nel mese', 'Pagato il', 'Modalità', 'Fonte prova', 'Stato'];
  var CSV_STATE = { paid: 'Pagato', late: 'Non ha pagato', due: 'Da pagare', review: 'In verifica', norate: 'In verifica da BOOM',
    unknown: 'In verifica', incoming: 'In arrivo', vacant: 'Libero', before: 'Prima della gestione BOOM' };
  var TYPE_LABEL = { transitorio: 'Transitorio', studenti: 'Studenti universitari', '3+2': '3+2 canone concordato', '4+4': '4+4 canone libero' };
  // Come è arrivato il pagamento (payments.paidVia) e chi ha visto i soldi
  // arrivare (payments.paidEvidence): BOOM non vede il conto del locatore.
  var PAID_VIA = { bonifico: 'Bonifico al locatore', contanti: 'Contanti', stripe: 'Carta (via BOOM)', sepa: 'Addebito SEPA (via BOOM)',
    bank: 'Bonifico (estratto conto BOOM)', dichiarato: 'Dichiarato dalla proprietaria', altro: 'Altro' };
  var PAID_EVIDENCE = { 'estratto-conto-locatore': 'Estratto conto del locatore', 'ricevuta-inquilino': 'Ricevuta dell’inquilino',
    'conferma-proprietaria': 'Conferma della proprietaria', stripe: 'Stripe', 'banca-boom': 'Estratto conto BOOM', altro: 'Altro' };
  function paidViaLabel(r) { return !r || !r.paidVia ? '' : PAID_VIA[r.paidVia] || r.paidVia; }
  function evidenceLabel(r) {
    if (!r) return '';
    if (r.paidEvidence) return PAID_EVIDENCE[r.paidEvidence] || r.paidEvidence;
    if (r.paidVia === 'stripe' || r.paidVia === 'sepa') return 'Stripe';
    if (r.paidVia === 'bank') return 'Estratto conto BOOM';
    if (r.paidSource) return r.paidSource.charAt(0).toUpperCase() + r.paidSource.slice(1);
    return '';
  }
  function itDate(d) { var x = day(d); return x ? x.slice(8, 10) + '/' + x.slice(5, 7) + '/' + x.slice(0, 4) : ''; }
  function itNum(n) { return n == null || !isFinite(n) ? '' : round(n).toFixed(2).replace('.', ','); }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function sumKnown(rows, f) { var t = 0; for (var i = 0; i < rows.length; i++) { var v = f(rows[i]); if (v == null) return null; t = round(t + v); } return t; }
  function csvRows(m, opts) {
    if (!m || !m.units) return [];
    var owner = !!(opts && opts.owner);
    var rows = [];
    var floorOfUnit = function (u) { return u.floor == null ? '' : u.floorTop ? 'Attico' : floorLabel(u.floor); };
    var kindText = function (c) { return !c ? '' : CS.isPlaceholder(c) ? (owner ? 'Contratto in arrivo da BOOM' : 'Contratto da caricare') : TYPE_LABEL[typeKey(c)] || str(c.type) || 'Contratto'; };
    var regText = function (c) {
      var pp = c && !CS.isPlaceholder(c) ? paperOf(c, m.today) : null;
      return !pp ? ['', ''] : [pp.cedolare === true ? 'Sì' : pp.cedolare === false ? 'No' : 'Non indicata',
        pp.registration.status === 'registered' ? 'Registrato' + (pp.registration.at ? ' il ' + itDate(pp.registration.at) : '')
          : pp.registration.status === 'sent' ? 'Inviato per la registrazione' : owner ? 'In verifica da BOOM' : 'Non segnata'];
    };
    // Una riga: il contratto `c`, le rate del mese `own` (null = nessuna rata
    // propria nel mese: le colonne dei soldi restano vuote), lo stato a parole.
    var line = function (u, c, tenants, own, stateText) {
      var rg = regText(c), paid = own ? own.filter(function (r) { return r.state === 'paid'; }) : [];
      var rent = c ? contractRent(c) : null, oneri = c ? money(c.oneriQuota) : null;
      if (c && c === u.month.lease && rent == null) rent = u.month.rent;
      var has = !!(own && own.length);
      // Un contratto senza oneri non ha una colonna oneri da riempire: vuota.
      var noOneri = !oneri && (!has || own.every(function (r) { return !r.oneriPart; }));
      return [m.month, u.interno || u.name, floorOfUnit(u), tenants.join(', '), str(c && c.landlordName), kindText(c),
        c && day(c.startDate) ? itDate(c.startDate) : '', c && effectiveEnd(c) ? itDate(effectiveEnd(c)) : '', rg[0], rg[1],
        itNum(rent), oneri ? itNum(oneri) : '',
        has ? itNum(sumKnown(own, function (r) { return r.amount; })) : '',
        has ? itNum(sumKnown(paid, function (r) { return r.rentPart; })) : '',
        has && !noOneri ? itNum(sumKnown(paid, function (r) { return r.oneriPart; })) : '',
        has ? itNum(sumKnown(paid, function (r) { return r.amount; })) : '',
        paid.map(function (r) { return itDate(r.paidDate); }).filter(Boolean).join(', '),
        uniq(paid.map(paidViaLabel)).join(', '), uniq(paid.map(evidenceLabel)).join(', '), stateText];
    };
    m.units.slice().sort(function (a, b) { return (a.floor == null ? 999 : a.floor) - (b.floor == null ? 999 : b.floor) || natural(a.interno, b.interno); })
      .forEach(function (u) {
        var um = u.month, lease = um.lease || um.incoming;
        var own = um.state === 'before' ? [] : um.rows.filter(function (r) { return r.month === m.month; });
        var stateOf = function (st) {
          if (lease && CS.isPlaceholder(lease) && st === 'norate') return owner ? 'Contratto in arrivo da BOOM' : 'Contratto da caricare';
          return st === 'norate' && !owner ? 'Senza rata' : CSV_STATE[st] || '';
        };
        if (!own.length) {
          // Mese senza rate proprie: coperto da una rata di un altro mese
          // (trimestrale, o i giorni dopo l'ultima rata di un contratto dal 15),
          // senza rata, libero, in arrivo, o prima di BOOM.
          var cover = um.state !== 'before' && um.rows.length ? um.rows[0] : null;
          var st = stateOf(um.state) + (cover ? ' · coperto dalla rata di ' + monthLabel(cover.month).toLowerCase() : '');
          rows.push(line(u, lease, um.tenants, null, st));
          return;
        }
        var groups = [], byC = Object.create(null);
        own.forEach(function (r) { var k = r.contractId || str(lease && lease.id) || '-'; if (!byC[k]) { byC[k] = []; groups.push(k); } byC[k].push(r); });
        groups.forEach(function (k) {
          var g = byC[k], c = g[0].contract || (lease && k === str(lease.id) ? lease : null);
          var names = c === lease ? um.tenants : g[0].tenants.length ? g[0].tenants : [];
          rows.push(line(u, c, names, g, stateOf(aggregate(g.map(function (r) { return r.state; })))));
        });
        // L'inquilino di oggi senza una rata sua nel mese (il cambio di
        // contratto a metà mese): c'è, e lo si dice, senza soldi suoi.
        if (um.lease && !byC[str(um.lease.id)]) rows.push(line(u, um.lease, um.tenants, null, stateOf('norate')));
      });
    return rows;
  }
  // Le utenze del palazzo, per il mediatore dell'energia: interno, piano,
  // chi è conduttore oggi, POD/PDR e se il codice ha la forma giusta. Niente
  // telefoni né email: al mediatore serve il punto di fornitura.
  var UTENZE_HEAD = ['Interno', 'Piano', 'Indirizzo', 'Conduttore oggi', 'POD (luce)', 'POD valido', 'PDR (gas)', 'PDR valido'];
  function utenzeRows(m) {
    if (!m || !m.units) return [];
    return m.units.slice().sort(function (a, b) { return (a.floor == null ? 999 : a.floor) - (b.floor == null ? 999 : b.floor) || natural(a.interno, b.interno); })
      .map(function (u) {
        var ut = u.utenze || {};
        return [u.interno || u.name, u.floor == null ? '' : u.floorTop ? 'Attico' : floorLabel(u.floor), str(u.property && u.property.address),
          (u.currentTenants || (u.month.lease ? u.month.tenants : [])).join(', '), ut.pod || '', ut.pod ? (ut.podOk ? 'sì' : 'da controllare') : '',
          ut.pdr || '', ut.pdr ? (ut.pdrOk ? 'sì' : 'da controllare') : ''];
      });
  }
  function toCsv(rows, head) {
    // Un nome che comincia con = + @ (o un trattino che non apre un numero)
    // Excel lo legge come formula: un apostrofo davanti lo lascia testo.
    var cell = function (v) {
      var s = v == null ? '' : String(v);
      if (/^[=+@\t\r]/.test(s) || /^-(?![\d,.])/.test(s)) s = "'" + s;
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + [head || CSV_HEAD].concat(rows).map(function (r) { return r.map(cell).join(';'); }).join('\r\n') + '\r\n';
  }

  // ── Il palazzo da una tabella: la presa in carico ─────────────────────
  // La proprietaria ha già il suo elenco (interno, piano, inquilino, canone,
  // scadenza): incollato da Excel o Google Sheets diventa interni, contratti
  // e rate. Due funzioni PURE: parseRentRoll legge (e dice cosa non capisce),
  // planImport decide cosa si scriverebbe. La scrittura la fa il portal, solo
  // admin, dopo l'anteprima.
  //
  // La regola che tiene in piedi tutto: le rate nascono da "gestione BOOM
  // dal" (mai dalla decorrenza di un contratto di due anni fa — sarebbero
  // ventiquattro arretrati inventati), e una rata è pagata SOLO se la tabella
  // lo dice. Id deterministici: reincollare la stessa tabella non raddoppia.
  var RR_COLS = {
    interno: ['interno', 'int', 'int.', 'unita', 'appartamento', 'app', 'n', 'numero'],
    piano: ['piano', 'floor'],
    scala: ['scala'],
    inquilino: ['inquilino', 'conduttore', 'nome', 'cognome e nome', 'nome e cognome', 'locatario', 'tenant'],
    telefono: ['telefono', 'tel', 'tel.', 'cellulare', 'cell', 'phone', 'whatsapp'],
    email: ['email', 'e-mail', 'mail'],
    canone: ['canone', 'canone mensile', 'affitto', 'importo', 'rent', 'canone €', 'canone (€)'],
    dal: ['dal', 'inizio', 'decorrenza', 'data inizio', 'inizio contratto', 'start'],
    al: ['al', 'fine', 'scadenza', 'data fine', 'fine contratto', 'end'],
    tipo: ['tipo', 'tipologia', 'contratto', 'tipo contratto'],
    deposito: ['deposito', 'cauzione', 'deposito cauzionale'],
    cedolare: ['cedolare', 'cedolare secca'],
    registrato: ['registrato', 'registrazione', 'registrato il', 'data registrazione', 'rli'],
    pagato: ['pagato', 'pagato il', 'pagamento', 'ultimo pagamento'],
    giorno: ['giorno', 'giorno pagamento', 'giorno di pagamento', 'scadenza rata'],
    pod: ['pod', 'codice pod', 'pod luce', 'luce'],
    pdr: ['pdr', 'codice pdr', 'pdr gas', 'gas'],
    // Dai contratti veri (Prenestino 42, 8/10): due studenti per interno,
    // obbligati in solido; oneri fissi pagati insieme al canone; il conto
    // del locatore (una società, non la persona che gestisce il palazzo).
    coinquilini: ['co-intestatari', 'cointestatari', 'co-intestatario', 'cointestatario', 'coinquilini', 'coinquilino', 'co-conduttori',
      'coconduttori', 'co-conduttore', 'coconduttore', 'altri conduttori', 'altri intestatari', 'secondo conduttore', 'secondo inquilino'],
    oneri: ['oneri', 'oneri accessori', 'spese', 'spese condominiali', 'acconto oneri', 'condominio', 'oneri mensili', 'oneri €', 'oneri (€)'],
    locatore: ['locatore', 'locatrice', 'proprietario', 'proprietaria', 'intestatario contratto'],
    iban: ['iban', 'iban locatore', 'iban proprietario', 'iban per il canone', 'conto', 'conto corrente'],
    mq: ['mq', 'm2', 'm²', 'metri', 'metri quadri', 'superficie', 'superficie mq']
  };
  var RR_TYPES = { transitorio: 'transitorio', transitoria: 'transitorio', studenti: 'studenti', studente: 'studenti', universitario: 'studenti',
    '3+2': '3+2', '32': '3+2', concordato: '3+2', 'canone concordato': '3+2', '4+4': '4+4', '44': '4+4', libero: '4+4', 'canone libero': '4+4' };
  function rrNum(v) {
    var x = str(v).replace(/[€\s]/g, '').replace(/(\/|al)?mese$|mensil[ie]$|eur(o)?$/i, '');
    if (!x) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '').replace(',', '.');
    else if (/^\d+,\d+$/.test(x)) x = x.replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.replace(/,/g, '');
    var n = Number(x);
    return isFinite(n) && n >= 0 ? round(n) : NaN;
  }
  function rrDate(v) {
    var x = str(v);
    if (!x) return '';
    var m = x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return day(m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2)) || null;
    m = x.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
    if (!m) return null;
    var y = m[3].length === 2 ? '20' + m[3] : m[3];
    var d = y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    var dt = new Date(d + 'T12:00:00Z');
    return isNaN(dt) || dt.toISOString().slice(0, 10) !== d ? null : d;
  }
  // Il conto dove l'inquilino paga il bonifico (/rata lo mostra): un IBAN
  // sbagliato è peggio di nessuno — il pagamento parte e non arriva. Forma
  // e controllo mod-97, come il dizionario del contratto.
  function ibanOk(v) {
    var ib = str(v).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ib)) return '';
    var r = ib.slice(4) + ib.slice(0, 4), n = '', rem = 0;
    for (var i = 0; i < r.length; i++) n += /[A-Z]/.test(r[i]) ? String(r.charCodeAt(i) - 55) : r[i];
    for (var j = 0; j < n.length; j += 7) rem = Number(String(rem) + n.slice(j, j + 7)) % 97;
    return rem === 1 ? ib : '';
  }
  // «Ada Rossi, Bea Verdi» · «A / B» · «A + B» · «A e B» (anche nomi con ğ, ş, ç).
  function rrNames(v, main) {
    var seen = Object.create(null), out = [];
    if (main) seen[norm(main)] = 1;
    str(v).split(/\s*(?:[,;\/+&|\n]|\s+e\s+|\s+and\s+)\s*/i).forEach(function (n) {
      n = n.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (n && !seen[norm(n)] && out.length < 6) { seen[norm(n)] = 1; out.push(n); }
    });
    return out;
  }
  function rrYes(v) { var s0 = norm(v); return s0 === 'si' || s0 === 'yes' || s0 === 'x' || s0 === 'vero' || s0 === 'true' || s0 === '1'; }
  function rrNo(v) { var s0 = norm(v); return s0 === 'no' || s0 === 'falso' || s0 === 'false' || s0 === '0'; }
  function rrSplit(line, sep) {
    if (sep === '\t') return line.split('\t');
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function parseRentRoll(text) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { rows: [], columns: {}, unknown: [], errors: ['vuota'] };
    var head = lines[0], sep = head.indexOf('\t') >= 0 ? '\t' : head.indexOf(';') >= 0 ? ';' : ',';
    var cols = {}, unknown = [];
    rrSplit(head, sep).forEach(function (h, i) {
      var k = norm(h).replace(/\s+/g, ' ').replace(/[:*]$/, '');
      var hit = Object.keys(RR_COLS).find(function (key) { return RR_COLS[key].indexOf(k) >= 0 && cols[key] == null; });
      if (hit) cols[hit] = i; else if (k) unknown.push(str(h));
    });
    if (cols.interno == null) return { rows: [], columns: cols, unknown: unknown, errors: ['senza_interno'] };
    var seen = Object.create(null);
    var rows = lines.slice(1).map(function (line, li) {
      var c = rrSplit(line, sep), get = function (k) { return cols[k] == null ? '' : str(c[cols[k]]); };
      var r = { line: li + 2, interno: get('interno').replace(/^int(erno)?\.?\s*/i, ''), piano: get('piano'), scala: get('scala'), inquilino: get('inquilino'),
        telefono: '', email: '', canone: null, dal: '', al: '', tipo: '', deposito: null, cedolare: '', registrato: '', registratoSi: false, pagato: '', pagatoSi: false, giorno: 5, pod: '', pdr: '',
        coinquilini: [], oneri: null, locatore: get('locatore').slice(0, 120), iban: '', mq: null,
        errors: [], warnings: [] };
      if (!r.interno) r.errors.push('interno mancante');
      else { var key = norm(r.scala) + '|' + norm(r.interno); if (seen[key]) r.errors.push('interno ' + r.interno + ' ripetuto (riga ' + seen[key] + ')'); else seen[key] = r.line; }
      if (r.piano && parseFloor(r.piano) == null) r.warnings.push('piano «' + r.piano + '» non letto: resta da indicare');
      var tel = get('telefono'), digits = tel.replace(/\D/g, '');
      if (tel) { if (digits.length >= 6 && digits.length <= 15) r.telefono = (/^\s*(\+|00)/.test(tel) ? '+' : '') + digits.replace(/^00/, ''); else r.warnings.push('telefono «' + tel + '» non è un numero'); }
      var em = get('email').toLowerCase();
      if (em) { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) r.email = em; else r.warnings.push('email «' + em + '» non valida'); }
      var can = get('canone'); r.canone = rrNum(can);
      if (can && (r.canone === null || isNaN(r.canone))) { r.errors.push('canone «' + can + '» non è un numero'); r.canone = null; }
      var dep = get('deposito'); r.deposito = rrNum(dep); if (dep && (r.deposito === null || isNaN(r.deposito))) { r.warnings.push('deposito «' + dep + '» non letto'); r.deposito = null; }
      ['dal', 'al'].forEach(function (k) { var v = get(k), d = rrDate(v); if (v && !d) r.errors.push((k === 'dal' ? 'inizio' : 'fine') + ' «' + v + '» non è una data (gg/mm/aaaa)'); r[k] = d || ''; });
      var tp = get('tipo'); if (tp) { r.tipo = RR_TYPES[norm(tp)] || ''; if (!r.tipo) r.warnings.push('tipo «' + tp + '» non riconosciuto: lascialo vuoto o usa transitorio · studenti · 3+2 · 4+4'); }
      var ced = get('cedolare'); r.cedolare = rrYes(ced) ? 'si' : rrNo(ced) ? 'no' : '';
      var reg = get('registrato'); if (reg) { var rd = rrDate(reg); if (rd) r.registrato = rd; else if (rrYes(reg)) r.registratoSi = true; else if (!rrNo(reg)) r.warnings.push('registrazione «' + reg + '» non letta'); }
      var pg = get('pagato'); if (pg) { var pd = rrDate(pg); if (pd) { r.pagato = pd; r.pagatoSi = true; } else if (rrYes(pg)) r.pagatoSi = true; else if (!rrNo(pg)) r.warnings.push('pagato «' + pg + '» non letto'); }
      var gg = parseInt(get('giorno'), 10); if (gg >= 1 && gg <= 28) r.giorno = gg;
      r.pod = cleanCode(get('pod')); r.pdr = cleanCode(get('pdr'));
      if (r.pod && !podOk(r.pod)) r.warnings.push('POD «' + r.pod + '» non ha la forma IT001E12345678: lo carico, va controllato');
      if (r.pdr && !pdrOk(r.pdr)) r.warnings.push('PDR «' + r.pdr + '» non ha 14 cifre: lo carico, va controllato');
      r.coinquilini = rrNames(get('coinquilini'), r.inquilino);
      // Gli oneri entrano nella rata: un numero illeggibile la sbaglierebbe,
      // quindi si ferma la riga come per il canone.
      var on = get('oneri'); r.oneri = rrNum(on);
      if (on && (r.oneri === null || isNaN(r.oneri))) { r.errors.push('oneri «' + on + '» non è un numero'); r.oneri = null; }
      var ib = get('iban');
      if (ib) { r.iban = ibanOk(ib); if (!r.iban) r.warnings.push('IBAN «' + ib + '» non valido: non lo carico (un conto sbagliato è peggio di nessuno)'); }
      var mq = get('mq'); r.mq = rrNum(mq);
      if (mq && !(r.mq > 0 && r.mq <= 2000)) { r.warnings.push('mq «' + mq + '» non letti'); r.mq = null; }
      if (!r.inquilino && r.coinquilini.length) r.warnings.push('co-intestatari senza inquilino: aggiungi il primo intestatario');
      // Chi abita lì ma il contratto non è ancora arrivato (canone, inizio e
      // fine TUTTI vuoti): l'interno è occupato, le rate aspettano il
      // contratto. Un dato a metà resta un errore — più facile uno sbaglio.
      r.senzaContratto = !!(r.inquilino && !get('canone') && !get('dal') && !get('al'));
      if (r.senzaContratto) r.warnings.push('contratto da caricare: l’interno risulta occupato, le rate partono quando arrivano canone e date');
      else if (r.inquilino) {
        if (r.canone == null && !r.errors.some(function (e) { return /^canone/.test(e); })) r.errors.push('canone mancante');
        if (!r.dal && !r.errors.some(function (e) { return /^inizio/.test(e); })) r.errors.push('data di inizio mancante');
        if (!r.al && !r.errors.some(function (e) { return /^fine/.test(e); })) r.errors.push('data di fine mancante');
        if (r.dal && r.al && r.al < r.dal) r.errors.push('la fine è prima dell’inizio');
      } else if (r.dal || r.al || r.pagatoSi) r.warnings.push('date o pagamento senza inquilino: l’interno resta libero');
      return r;
    });
    return { rows: rows, columns: cols, unknown: unknown, errors: [] };
  }
  function rrSlug(s0) { return norm(s0).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x'; }
  // opts: { address, ownerId, ownerName, gestioneDal (YYYY-MM), today, by }
  function planImport(rows, ctx, opts) {
    opts = opts || {};
    var gd = monthOf(opts.gestioneDal) || ctx.month, address = str(opts.address), skey = streetKey(address);
    var out = { properties: [], contracts: [], payments: [], skipped: [], errors: [], notes: [], counts: { create: 0, update: 0, same: 0, contracts: 0, contractUpdates: 0, missing: 0, payments: 0, paid: 0 } };
    if (!skey) { out.errors.push('indirizzo'); return out; }
    if (!str(opts.ownerId)) out.errors.push('proprietaria');
    var existing = ctx.properties.filter(function (p) { return streetKey(p.address) === skey; });
    var label = titleCase(streetKey(address));
    (rows || []).forEach(function (r) {
      if (r.errors && r.errors.length) { out.skipped.push(r.line); return; }
      var prop = existing.find(function (p) { return norm(unitOf(p)) === norm(r.interno) && norm(scalaOf(p)) === norm(r.scala); });
      var pid = prop ? str(prop.id) : ('plz_' + rrSlug(streetKey(address)) + (r.scala ? '_s' + rrSlug(r.scala) : '') + '_' + rrSlug(r.interno));
      var live = r.inquilino && (r.senzaContratto || r.al >= monthStart(gd));
      var pdata = {};
      if (prop) {
        if (!monthOf(prop.gestioneDal)) pdata.gestioneDal = gd;
        if (r.pod && !cleanCode(prop.pod)) pdata.pod = r.pod;
        if (r.pdr && !cleanCode(prop.pdr)) pdata.pdr = r.pdr;
        // Fill-only: un campo già scritto nel portal non si tocca.
        if (!str(prop.floor) && r.piano) pdata.floor = r.piano;
        if (!str(prop.interno)) pdata.interno = r.interno;
        if (!str(prop.scala) && r.scala) pdata.scala = r.scala;
        if (!str(prop.ownerId)) { pdata.ownerId = opts.ownerId; pdata.ownerName = str(opts.ownerName); }
        else if (str(prop.ownerId) !== str(opts.ownerId)) out.errors.push('owner:' + r.interno);
        if (!(money(prop.rent) > 0) && r.canone) pdata.rent = r.canone;
        if (r.mq && !(Number(prop.sqm) > 0)) pdata.sqm = r.mq;
        if (Object.keys(pdata).length) out.counts.update++; else out.counts.same++;
      } else {
        pdata = { name: label + ' int. ' + r.interno, address: address, interno: r.interno, scala: r.scala, floor: r.piano, ownerId: opts.ownerId, ownerName: str(opts.ownerName),
          rent: r.canone || 0, propertyType: 'apartment', availabilityStatus: live ? 'rented' : 'available', gestioneDal: gd, source: 'palazzo-import' };
        if (r.pod) pdata.pod = r.pod;
        if (r.pdr) pdata.pdr = r.pdr;
        if (r.mq) pdata.sqm = r.mq;
        out.counts.create++;
      }
      if (!prop || Object.keys(pdata).length) out.properties.push({ id: pid, exists: !!prop, data: pdata, interno: r.interno });
      if (!r.inquilino) return;
      var pcs = ctx.contractsByProperty[pid] || [];
      // Il segnaposto «contratto da caricare» è LO STESSO contratto che
      // arriva dopo: si completa, non se ne crea un secondo (sarebbero due
      // contratti vivi sullo stesso interno).
      var placeholder = pcs.find(function (c) { return c.contractMissing === true && !day(c.startDate) && LIVE[cStatus(c)]; });
      if (r.senzaContratto) {
        if (placeholder || pcs.some(function (c) { return LIVE[cStatus(c)] && (!day(c.startDate) || effectiveEnd(c) >= ctx.today || !effectiveEnd(c)); })) return;
        var pcid = 'c_' + pid + '_da-caricare', pex = {};
        if (r.coinquilini.length) pex.coTenants = r.coinquilini.map(function (n) { return { name: n }; });
        if (r.oneri != null) pex.oneriQuota = r.oneri;
        if (r.locatore) pex.landlordName = r.locatore;
        if (r.iban) pex.landlordIban = r.iban;
        out.contracts.push({ id: pcid, data: Object.assign({ propertyId: pid, status: 'active', contractMissing: true, tenantName: r.inquilino, tenantPhone: r.telefono, tenantEmail: r.email,
          type: r.tipo, source: 'palazzo-import' }, pex), interno: r.interno });
        out.counts.contracts++; out.counts.missing++;
        return;
      }
      var dup = pcs.find(function (c) { return day(c.startDate) === r.dal; }) || placeholder;
      var cid = dup ? str(dup.id) : ('c_' + pid + '_' + r.dal);
      // Ciò che il contratto aggiunge al semplice "chi e quanto": chi firma
      // con lui, gli oneri fissi, chi è il locatore e dove si paga.
      var extra = {};
      if (r.coinquilini.length) extra.coTenants = r.coinquilini.map(function (n) { return { name: n }; });
      if (r.oneri != null) extra.oneriQuota = r.oneri;
      if (r.locatore) extra.landlordName = r.locatore;
      if (r.iban) extra.landlordIban = r.iban;
      if (!dup) {
        out.contracts.push({ id: cid, data: Object.assign({ propertyId: pid, status: r.al < ctx.today ? 'expired' : 'active', tenantName: r.inquilino, tenantPhone: r.telefono, tenantEmail: r.email,
          rent: r.canone, deposit: r.deposito, startDate: r.dal, endDate: r.al, type: r.tipo, paymentDay: r.giorno, installmentMonths: 1,
          cedolareSecca: r.cedolare, signatureStatus: 'paper', paymentsFrom: gd, source: 'palazzo-import' }, extra), interno: r.interno });
        var cd = out.contracts[out.contracts.length - 1].data;
        if (r.registrato) cd.rliRegisteredAt = r.registrato;
        if (r.registrato || r.registratoSi) cd.registrationStatus = 'registered';
        out.counts.contracts++;
      } else {
        // Fill-only anche sul contratto: un dato già scritto (nel portal, da
        // una firma) non si tocca; i co-intestatari solo se non ce n'è nessuno.
        var fill = {};
        if (dup === placeholder) {
          // Arrivato il contratto: i fatti che il segnaposto non aveva.
          fill = { contractMissing: false, rent: r.canone, deposit: r.deposito, startDate: r.dal, endDate: r.al, paymentDay: r.giorno, installmentMonths: 1,
            cedolareSecca: r.cedolare, signatureStatus: 'paper', paymentsFrom: gd, status: r.al < ctx.today ? 'expired' : 'active' };
          if (r.tipo) fill.type = r.tipo;
          if (r.registrato) fill.rliRegisteredAt = r.registrato;
          if (r.registrato || r.registratoSi) fill.registrationStatus = 'registered';
        }
        if (extra.coTenants && !list(dup.coTenants).length) fill.coTenants = extra.coTenants;
        if (extra.oneriQuota != null && (dup.oneriQuota == null || dup.oneriQuota === '')) fill.oneriQuota = extra.oneriQuota;
        if (extra.landlordName && !str(dup.landlordName)) fill.landlordName = extra.landlordName;
        if (extra.landlordIban && !str(dup.landlordIban)) fill.landlordIban = extra.landlordIban;
        if (!str(dup.tenantPhone) && r.telefono) fill.tenantPhone = r.telefono;
        if (!str(dup.tenantEmail) && r.email) fill.tenantEmail = r.email;
        if (Object.keys(fill).length) { out.contracts.push({ id: cid, exists: true, data: fill, interno: r.interno }); out.counts.contractUpdates++; }
        // Le rate già in archivio non si ricalcolano mai da qui (una pagata
        // tornerebbe da pagare): se gli oneri arrivano dopo, lo si dice.
        if (fill.oneriQuota && (ctx.paymentsByProperty[pid] || []).some(function (x) { return x.isRent; })) out.notes.push('oneri:' + r.interno);
      }
      // Le rate: da max(gestione, inizio) a fine contratto, mensili, stesso id
      // del generatore del portal (pay_<contratto>_<mese>): mai due schedule.
      var have = Object.create(null);
      (ctx.paymentsByProperty[pid] || []).forEach(function (x) { if (x.month) have[x.month] = 1; });
      // MESI DI CONTRATTO, non di calendario (come il generatore di
      // magic-sign): dal 15/09 al 14/08 sono 11 periodi, e una dodicesima
      // rata ad agosto sarebbe un canone chiesto per un mese che il
      // contratto non ha. L'ultimo periodo parziale si paga in proporzione.
      for (var k = 0; k < 120; k++) {
        var ps = leaseMonth(r.dal, k);
        if (ps > r.al) break;
        var nx = leaseMonth(r.dal, k + 1), full = dayAdd(nx, -1), pe = full < r.al ? full : r.al, mm = ps.slice(0, 7);
        if (mm < gd || have[mm]) continue;
        var f = pe < full ? (daysBetween(ps, pe) + 1) / (daysBetween(ps, full) + 1) : 1;
        var canK = round(r.canone * f), oneK = r.oneri ? round(r.oneri * f) : 0;
        var due = mm + '-' + ('0' + r.giorno).slice(-2);
        if (k === 0 && due < r.dal) due = r.dal;
        var paidNow = mm === gd && r.pagatoSi;
        // Gli oneri fissi si pagano col canone (art. 5 del contratto): la
        // rata è il TOTALE che l'inquilino versa, con le due voci accanto.
        var pay = { contractId: cid, propertyId: pid, type: 'rent', amount: oneK ? round(canK + oneK) : canK, month: mm, coversTo: mm, installmentMonths: 1, dueDate: due,
          periodFrom: ps, periodTo: pe, status: paidNow ? 'paid' : 'pending', autoGenerated: true, source: 'palazzo-import' };
        if (oneK) { pay.rentAmount = canK; pay.oneriAmount = oneK; }
        if (f < 1) pay.prorated = true;
        if (paidNow) { pay.paidDate = r.pagato || null; pay.paidVia = 'dichiarato'; pay.paidSource = 'tabella della proprietaria'; out.counts.paid++; }
        out.payments.push({ id: 'pay_' + cid + '_' + mm, data: pay, interno: r.interno });
        out.counts.payments++;
      }
    });
    out.buildingKey = existing.length ? buildingKeyOf(existing[0]) : 'a:' + skey; out.label = label; out.gestioneDal = gd;
    return out;
  }
  var RR_TEMPLATE = 'Interno;Piano;Inquilino;Co-intestatari;Telefono;Email;Canone;Oneri;Dal;Al;Tipo;Deposito;Cedolare;Registrato il;Pagato il;Locatore;IBAN;Mq;POD;PDR\r\n' +
    '1;PT;Mario Rossi;Anna Bianchi;+39 333 1234567;mario@example.com;850;120;01/09/2025;31/08/2027;transitorio;1700;si;20/09/2025;03/10/2026;Rossi Immobiliare S.r.l.;IT60X0542811101000000123456;48;IT001E12345678;00881234567890\r\n' +
    '2;PT;;;;;900;;;;;;;;;;;;;\r\n';

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
  // La finestra è SEMPRE gli ultimi 12 mesi fino a oggi (un mese futuro
  // scelto nella linea del tempo non la sposta in avanti), e dentro la
  // finestra si misurano solo i mesi di BOOM: prima di "gestione BOOM dal"
  // non c'è storia (né pieno né sfitto), un contratto segnaposto è
  // un'occupazione NON NOTA (mai "12 su 12"), un mese futuro non è successo.
  var OCC_MIN_MONTHS = 3;
  function timeOf(ctx, p, endMonth) {
    var e0 = monthOf(endMonth), end = e0 && e0 < ctx.month ? e0 : ctx.month, from = monthAdd(end, -11), gd = monthOf(p.gestioneDal);
    var start = gd && gd > from ? gd : from;
    var all = ctx.paymentsByProperty[str(p.id)] || [];
    var rows = all.filter(function (r) {
      return r.isRent && r.state === 'paid' && r.dueDate && r.paidDate && r.month >= from && r.month <= end;
    });
    var delays = rows.map(function (r) { return daysBetween(r.dueDate, r.paidDate); });
    var occupied = 0, vacant = 0, unknown = 0, window = 0;
    for (var mm = start; mm <= end; mm = monthAdd(mm, 1)) {
      window++;
      var um = unitMonth(ctx, p, mm);
      if (um.state === 'before') continue;
      if (um.placeholder) { unknown++; continue; }
      if (um.occupied) occupied++; else vacant++;
    }
    var measured = occupied + vacant;
    // Le rate che erano attese (scadute fino a oggi) e quelle ancora aperte:
    // "nessuna rata ancora prevista" non è "non paga", e chi ha due rate
    // aperte non è "puntuale" perché le pagate erano in orario.
    var expectedRows = all.filter(function (r) { return r.isRent && r.state !== 'cancelled' && r.dueDate && r.dueDate <= ctx.today && r.month >= start && r.month <= end; });
    var open = all.filter(function (r) { return r.state === 'overdue'; }).sort(byDue);
    // Libero da quando: la fine dell'ultimo contratto già chiuso.
    var ends = (ctx.contractsByProperty[str(p.id)] || []).filter(function (c) { return LIVE[cStatus(c)]; })
      .map(effectiveEnd).filter(function (d) { return d && d < ctx.today; }).sort();
    var lastEnd = ends.length ? ends[ends.length - 1] : '';
    return {
      // Gestione iniziata dentro la finestra: puntualità e occupazione si
      // misurano da lì ("da ottobre 2026").
      since: gd && gd > from && gd <= end ? gd : '',
      from: start <= end ? start : '', to: end,
      paidCount: delays.length,
      avgDelay: delays.length ? Math.round(delays.reduce(function (a, b) { return a + b; }, 0) / delays.length * 10) / 10 : null,
      onTime: delays.filter(function (d) { return d <= 0; }).length,
      expectedCount: expectedRows.length,
      overdueCount: open.length, overdueOldest: open.length ? open[0].dueDate : '',
      windowMonths: window, measuredMonths: measured, unknownMonths: unknown,
      occupiedMonths: occupied, vacantMonths: vacant,
      occupancy: measured && window >= OCC_MIN_MONTHS ? Math.round(occupied / measured * 100) : null,
      vacantSince: lastEnd ? dayAdd(lastEnd, 1) : '', vacantDays: lastEnd ? daysBetween(lastEnd, ctx.today) : null
    };
  }

  // Euro all'italiana, deterministici (mai toLocaleString: con l'ICU ridotta
  // degrada in silenzio): €1.500 sugli interi, €1.500,50 coi centesimi —
  // la frase e la scheda dicono lo stesso numero.
  function eurIt(v) {
    if (v == null || !isFinite(v)) return '';
    var s = round(v).toFixed(2).split('.');
    return '€' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (s[1] === '00' ? '' : ',' + s[1]);
  }

  // La frase del mese: quello che un proprietario chiederebbe al telefono,
  // scritto dai numeri. Mai una cifra che il modello non contiene, mai
  // "nessun ritardo" con un arretrato aperto, mai un ritardo "di €0".
  function brief(m, opts) {
    var owner = !!(opts && opts.owner);
    if (!m || !m.building) return [];
    var t = m.totals, mon = monthLabel(m.month), n = function (x, one, many) { return x + ' ' + (x === 1 ? one : many); };
    var name = function (u) { return u.interno ? 'int. ' + u.interno : u.name; };
    var eur = eurIt;
    var out = [];
    var tail = function () {
      if (m.partial) {
        var cols = Array.isArray(m.partial) ? m.partial.join(', ') : '';
        out.push(owner ? 'Alcuni dati sono ancora in arrivo: i numeri di questo riepilogo potrebbero essere incompleti.'
          : 'Archivio letto in parte' + (cols ? ' (' + cols + ')' : '') + ': i numeri possono essere incompleti.');
      }
      return out;
    };
    // Un mese tutto prima della gestione: niente "tutti in regola", niente
    // "pieni": di quel mese BOOM non sa nulla, e lo dice.
    if (m.allBefore) {
      out.push(mon + ': prima della gestione BOOM' + (m.gestioneDal ? ' (che parte da ' + monthLabel(m.gestioneDal).toLowerCase() + ')' : '') +
        ': pagamenti e occupazione di questo mese non sono in archivio.');
      return tail();
    }
    var managed = t.managed != null ? t.managed : t.units, part = managed !== t.units;
    out.push(mon + ': ' + (t.occupied === 1 ? '1 interno' : t.occupied + ' interni') + ' su ' + managed + (part ? (managed === 1 ? ' gestito' : ' gestiti') + ' da BOOM' : '') +
      (t.occupied === 1 ? ' è pieno' : ' sono pieni') + (t.vacant ? ', ' + n(t.vacant, 'libero', 'liberi') : '') + (t.incoming ? ', ' + t.incoming + ' in arrivo' : '') + '.');
    var payers = t.paid + t.late + t.due + t.review + t.unknown;
    if (payers) out.push(n(t.paid, 'ha pagato', 'hanno pagato') + ' su ' + payers + ' (' + (!t.expected && t.unknownAmounts ? 'importi da verificare'
      : eur(t.collected) + ' di ' + eur(t.expected) + (t.unknownAmounts ? ', più ' + n(t.unknownAmounts, 'rata', 'rate') + ' con l’importo da verificare' : '')) + ').');
    // In ritardo con una rata DI QUESTO MESE (la cifra è quella del mese)…
    var lateNow = m.units.filter(function (u) { return u.month.state === 'late' && (u.month.lateAmount > 0 || u.month.lateUnknown > 0); })
      .sort(function (a, b) { return b.month.lateDays - a.month.lateDays; });
    var nowIds = Object.create(null), shown = 0;
    lateNow.forEach(function (u) { nowIds[u.id] = 1; shown = round(shown + u.month.lateAmount); });
    if (lateNow.length) {
      var unk = lateNow.some(function (u) { return u.month.lateUnknown > 0; });
      out.push(n(lateNow.length, 'è in ritardo', 'sono in ritardo') + ' per ' + (shown > 0 ? eur(shown) + (unk ? ' più un importo da verificare' : '') : 'un importo da verificare') + ': ' + lateNow.map(name).join(', ') + '.');
    }
    // …e chi deve ancora mesi PRECEDENTI (a dicembre, chi non ha pagato
    // novembre è ancora in ritardo: non sparisce dalla frase).
    var older = (m.debtors || []).filter(function (d) { return !nowIds[d.id]; });
    if (older.length) {
      out.push('Ancora da pagare dai mesi precedenti: ' + older.map(function (d) {
        shown = round(shown + d.amount);
        var when = d.oldestMonth ? (d.count === 1 ? monthLabel(d.oldestMonth).toLowerCase() : d.count + ' rate da ' + monthLabel(d.oldestMonth).toLowerCase()) : n(d.count, 'rata', 'rate');
        return (d.interno ? 'int. ' + d.interno : d.name) + ' (' + when + ', ' + (d.amount > 0 ? eur(d.amount) + (d.unknownAmounts ? ' più un importo da verificare' : '') : 'importo da verificare') + ')';
      }).join(', ') + '.');
    }
    if (!lateNow.length && !older.length && payers) out.push('Nessun ritardo.');
    var due = m.units.filter(function (u) { return u.month.state === 'due'; });
    if (due.length) {
      var dates = due.map(function (u) { var r = u.month.rows.find(function (x) { return x.state === 'due'; }); return r && r.dueDate; }).filter(Boolean).sort();
      var last = dates[dates.length - 1], dd = last ? +last.slice(8, 10) : 0;
      out.push(n(due.length, 'deve', 'devono') + ' ancora pagare' + (last ? ', entro ' + ([1, 8, 11].indexOf(dd) >= 0 ? "l'" : 'il ') + dd + ' ' + monthLabel(last.slice(0, 7)).split(' ')[0].toLowerCase() : '') + '.');
    }
    // Al proprietario si dice cosa sta facendo BOOM, non il nome del
    // problema interno: "rata non registrata" è un lavoro dell'operatore.
    if (owner) {
      if (t.review + t.norate) out.push(n(t.review + t.norate, 'pagamento è', 'pagamenti sono') + ' in verifica da BOOM.');
      if (t.nocontract) out.push(n(t.nocontract, 'interno ha', 'interni hanno') + ' il contratto in arrivo da BOOM.');
    } else {
      if (t.review) out.push(n(t.review, 'pagamento è', 'pagamenti sono') + ' da verificare.');
      if (t.norate) out.push(n(t.norate, 'interno occupato non ha', 'interni occupati non hanno') + ' la rata registrata.');
      if (t.nocontract) out.push(n(t.nocontract, 'interno occupato non ha', 'interni occupati non hanno') + ' il contratto in archivio.');
    }
    if (t.maintOpen) out.push(n(t.maintOpen, 'segnalazione di manutenzione aperta', 'segnalazioni di manutenzione aperte') + (t.maintUrgent ? ' (' + t.maintUrgent + ' urgent' + (t.maintUrgent === 1 ? 'e' : 'i') + ')' : '') + '.');
    if (t.before) out.push(n(t.before, 'interno era', 'interni erano') + ' prima della gestione BOOM: i pagamenti di quel mese non sono in archivio.');
    if (t.arrears > shown + 0.005) out.push('Arretrati di tutti i mesi: ' + eur(t.arrears) + '.');
    return tail();
  }
  // ── L'aspetto del palazzo ─────────────────────────────────────────────
  // La facciata disegna SOLO ciò che qualcuno ha dichiarato (dalla foto,
  // dal sopralluogo): intonaco, persiane, ultimo piano, nome. Senza
  // dichiarazione l'aspetto è neutro (pietra + grafite), mai "persiane
  // verdi" per default: sarebbe una bella bugia sul palazzo di qualcuno.
  // Il civico invece è un fatto (sta nell'indirizzo) e va sulla targa.
  var LOOKS = {
    intonaco: { pietra: ['Pietra · neutro', '#A9A193'], ocra: ['Ocra romana', '#C4874C'], giallo: ['Giallo Roma', '#CFA153'],
      rosso: ['Rosso pompeiano', '#A2573C'], rosa: ['Rosa antico', '#C0907E'], rosachiaro: ['Rosa chiaro', '#E8CFC2'], travertino: ['Travertino', '#CDBFA1'], bianco: ['Bianco', '#D6D2C7'] },
    // «Rosa chiaro» e «Verde grigio» misurati su una foto vera (il cortile di
    // Piazzale Prenestino 42, al sole: intonaco #ECD5C9, persiane #455553):
    // i preset restano scelte DICHIARATE dall'admin, mai un default.
    persiane: { grafite: ['Grafite · neutro', '#3A3D41'], verde: ['Verde', '#2D4A38'], verdegrigio: ['Verde grigio', '#3E504B'], marrone: ['Marrone', '#4A3527'],
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

  // Il contratto in corso in un GIORNO (oggi): per la disdetta, l'annuncio
  // ancora pubblicato, il conduttore di oggi nelle utenze.
  function leaseOn(ctx, p, d) {
    return (ctx.contractsByProperty[str(p.id)] || []).filter(function (c) {
      if (!LIVE[cStatus(c)]) return false;
      var s = day(c.startDate), e = effectiveEnd(c);
      return !s ? cStatus(c) === 'active' : s <= d && (!e || e >= d);
    }).sort(function (a, b) { return (day(b.startDate) || '').localeCompare(day(a.startDate) || ''); })[0] || null;
  }
  // Un contratto PIÙ RECENTE sullo stesso interno (rinnovo, nuovo inquilino,
  // anche in firma): la fine del vecchio è già decisa.
  function successorOf(ctx, pid, c) {
    var s = day(c.startDate);
    return (ctx.contractsByProperty[pid] || []).some(function (x) {
      return x !== c && (LIVE[cStatus(x)] || SIGNING[cStatus(x)]) && day(x.startDate) && (!s || day(x.startDate) > s);
    });
  }
  var CLOSED = { terminated: 1, closed: 1, ended: 1, completed: 1, renewed: 1, cancelled: 1, canceled: 1 };
  // Gli oneri dell'anno (del mese scelto) fino a oggi: per il conguaglio
  // ("salvo conguaglio", art. 5). Solo le quote che si dividono con certezza;
  // le rate che non si dividono si contano a parte, mai stimate.
  function oneriYearOf(ctx, p, month) {
    var y = month.slice(0, 4), out = { year: y, collected: 0, expected: 0, rows: 0, unknown: 0 };
    (ctx.paymentsByProperty[str(p.id)] || []).forEach(function (r) {
      if (!r.isRent || r.state === 'cancelled' || !r.month || r.month.slice(0, 4) !== y || r.month > ctx.month) return;
      if (r.oneriPart == null) { out.unknown++; return; }
      if (!r.oneriPart) return;
      out.rows++;
      if (r.dueDate && r.dueDate <= ctx.today) out.expected = round(out.expected + r.oneriPart);
      if (r.state === 'paid') out.collected = round(out.collected + r.oneriPart);
    });
    return out;
  }

  // Il modello completo di un palazzo per un mese: piani → interni, totali,
  // serie dei mesi per la linea del tempo, e ciò che va sistemato.
  // opts.partial: l'archivio è stato letto con un tetto (true, o l'elenco
  // delle collection troncate): il modello lo DICHIARA (frase e Da sistemare)
  // invece di contare come assente ciò che non ha letto.
  function model(ctx, key, month, opts) {
    opts = opts || {};
    var m = monthOf(month) || ctx.month;
    var all = buildings(ctx, opts.filter);
    var b = all.find(function (x) { return x.key === key; }) || all[0] || null;
    var partial = opts.partial ? (Array.isArray(opts.partial) ? opts.partial.filter(Boolean).map(str) : true) : false;
    if (!b) return { building: null, buildings: all, month: m, floors: [], unplaced: [], units: [], totals: totalsOf([]), series: [], issues: [], debtors: [], partial: partial, allBefore: false };
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
      var f = floorOf(p), um = unitMonth(ctx, p, m), o = ownerOf(p, ctx.usersById), cur = leaseOn(ctx, p, ctx.today);
      return {
        id: str(p.id), property: p, interno: unitOf(p), scala: scalaOf(p),
        floor: f ? (f.top ? topN : f.n) : null, floorTop: !!(f && f.top),
        name: str(p.name) || str(p.address) || 'Interno', owner: o,
        ownerMismatch: !!(owner && o.key !== owner.key),
        // arrears: tutte le rate scadute ad oggi; debt: solo fino al mese scelto.
        month: um, arrears: arrearsOf(ctx, p), debt: arrearsOf(ctx, p, m), pipeline: pipelineOf(ctx, p),
        // Il tempo si misura sempre fino a OGGI: un mese futuro scelto non
        // sposta la finestra degli "ultimi 12 mesi".
        time: timeOf(ctx, p, ctx.month),
        // Un contratto non ancora in archivio non ha registrazione né regime
        // da raccontare ("in verifica" su un contratto che non c'è): null.
        paper: um.placeholder ? null : paperOf(um.lease || um.incoming, ctx.today), maintenance: maintOf(ctx, p), utenze: utenzeOf(p),
        oneri: oneriYearOf(ctx, p, m),
        contractKind: um.contractKind, landlordName: um.landlordName, landlordIsCompany: isCompanyName(um.landlordName),
        current: cur, currentTenants: cur ? tenantNamesOf(cur, ctx.usersById) : [], notice: noticeOf(cur, ctx.today),
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
    var seriesOf = function (endM) {
      return Array.from({ length: 12 }, function (_, i) {
        var mm = monthAdd(endM, i - 11);
        var t = totalsOf(props.map(function (p) { return { month: unitMonth(ctx, p, mm), arrears: { amount: 0 } }; }));
        return { month: mm, totals: t };
      });
    };
    // La linea del tempo segue il mese scelto (si naviga anche avanti);
    // l'andamento resta sugli ultimi 12 mesi fino a oggi.
    var series = seriesOf(m > ctx.month ? m : ctx.month);
    var pastSeries = m > ctx.month ? seriesOf(ctx.month) : series;

    // Chi non ha pagato, a oggi, fino a questo mese: anche i mesi precedenti.
    // Il nome e il contratto sono quelli della rata più vecchia (nel mese del
    // cambio inquilino il ritardo del vecchio resta del vecchio).
    var debtors = units.filter(function (u) { return u.debt.count; }).map(function (u) {
      var d = u.debt, first = d.rows[0];
      var pay = d.rows.find(function (r) { return r.amount != null && r.amount > 0 && !/^missing-id:/.test(r.id); }) || null;
      var mine = d.rows.filter(function (r) { return r.month === m; });
      return { id: u.id, interno: u.interno, name: u.name, amount: d.amount, count: d.count, unknownAmounts: d.unknownAmounts,
        oldest: d.oldest, oldestDays: d.oldestDays, oldestMonth: d.oldestMonth, rows: d.rows, row: first, payRow: pay,
        contractId: first.contractId, tenants: first.tenants.slice(),
        previousContract: !!(first.contractId && u.month.contractId && first.contractId !== u.month.contractId),
        thisMonth: { count: mine.length, amount: mine.reduce(function (a, r) { return r.amount != null ? round(a + r.amount) : a; }, 0) },
        older: { count: d.count - mine.length, amount: round(d.amount - mine.reduce(function (a, r) { return r.amount != null ? round(a + r.amount) : a; }, 0)) } };
    }).sort(function (a, b2) { return b2.oldestDays - a.oldestDays || natural(a.interno, b2.interno); });

    var issues = [];
    if (unplaced.length) issues.push({ code: 'unplaced', count: unplaced.length, ids: unplaced.map(function (u) { return u.id; }) });
    var mism = units.filter(function (u) { return u.ownerMismatch; });
    if (mism.length) issues.push({ code: 'owner', count: mism.length, ids: mism.map(function (u) { return u.id; }) });
    if (owner && !owner.id) issues.push({ code: 'ownerProfile', count: units.length, ids: units.map(function (u) { return u.id; }) });
    // Contratti scaduti senza una chiusura scritta: "attivo" (staleActive) o
    // scaduto e basta (expiredStillIn). Per le date l'interno è libero, ma
    // l'inquilino potrebbe essere ancora dentro: uno studenti senza disdetta
    // si rinnova da solo. Si dice quale regola vale, mai si decide.
    var stale = [], staleItems = [], expired = [];
    props.forEach(function (p) {
      var pid = str(p.id), cs = ctx.contractsByProperty[pid] || [];
      cs.forEach(function (c) {
        var end = effectiveEnd(c), st = cStatus(c);
        if (!end || end >= ctx.today || CS.isPlaceholder(c)) return;
        var nt = noticeOf(c, ctx.today), next = successorOf(ctx, pid, c);
        var item = { id: str(c.id), unitId: pid, end: end, status: st, type: typeKey(c) || null, renews: nt && !next ? nt.renews : '', successor: next };
        if (st === 'active') { stale.push(str(c.id)); staleItems.push(item); return; }
        if (CLOSED[st] || !LIVE[st] || day(c.terminatedAt) || next || end < dayAdd(ctx.today, -400)) return;
        expired.push(item);
      });
    });
    if (stale.length) issues.push({ code: 'staleActive', count: stale.length, ids: stale, items: staleItems });
    if (expired.length) issues.push({ code: 'expiredStillIn', count: expired.length, ids: uniq(expired.map(function (x) { return x.unitId; })), contracts: expired });
    // Due contratti vivi i cui GIORNI si sovrappongono (non lo stesso mese:
    // un cambio inquilino al 15 è normale). La stessa regola della
    // conversione (convert.overlapConflict).
    var double = units.filter(function (u) {
      var cs = (ctx.contractsByProperty[u.id] || []).filter(function (c) { return LIVE[cStatus(c)] && covers(c, m); });
      for (var i = 0; i < cs.length; i++) for (var j = i + 1; j < cs.length; j++) if (daysOverlap(cs[i], cs[j])) return true;
      return false;
    });
    if (double.length) issues.push({ code: 'overlap', count: double.length, ids: double.map(function (u) { return u.id; }) });
    var pre = units.filter(function (u) { return ctx.preBoomOpen && ctx.preBoomOpen[u.id]; });
    if (pre.length) issues.push({ code: 'preBoom', count: pre.reduce(function (a, u) { return a + ctx.preBoomOpen[u.id]; }, 0), ids: pre.map(function (u) { return u.id; }) });
    // Rate rimaste dopo la chiusura del contratto: aperte vanno annullate;
    // pagate vanno verificate (rimborso, o la data di chiusura è sbagliata).
    var acU = units.filter(function (u) { var a = ctx.afterClose && ctx.afterClose[u.id]; return a && (a.open.length || a.paid.length); });
    if (acU.length) {
      var acOpen = [], acPaid = [];
      acU.forEach(function (u) { ctx.afterClose[u.id].open.forEach(function (r) { acOpen.push(r.id); }); ctx.afterClose[u.id].paid.forEach(function (r) { acPaid.push(r.id); }); });
      issues.push({ code: 'afterClose', count: acOpen.length + acPaid.length, open: acOpen.length, paid: acPaid.length, ids: acU.map(function (u) { return u.id; }), paymentIds: acOpen, paidIds: acPaid });
    }
    var unreg = units.filter(function (u) { return u.month.lease && u.paper && u.paper.registration.late; });
    if (unreg.length) issues.push({ code: 'unregistered', count: unreg.length, ids: unreg.map(function (u) { return u.id; }) });
    var missingC = units.filter(function (u) { return u.month.lease && u.month.lease.contractMissing === true; });
    if (missingC.length) issues.push({ code: 'nocontract', count: missingC.length, ids: missingC.map(function (u) { return u.id; }) });
    var norate = units.filter(function (u) { return u.month.state === 'norate' && m <= ctx.month && !(u.month.lease && u.month.lease.contractMissing === true); });
    if (norate.length) issues.push({ code: 'norate', count: norate.length, ids: norate.map(function (u) { return u.id; }) });
    // La disdetta: per i contratti in corso che finiscono presto, la data
    // entro cui va data (dal modello del contratto) e cosa succede se nessuno
    // la dà. Fuori: chi l'ha già data, chi ha già un contratto dopo.
    var notice = [];
    units.forEach(function (u) {
      var nt = u.notice, c = u.current;
      if (!c || !nt || !nt.by || nt.terminated || nt.received || successorOf(ctx, u.id, c)) return;
      var from = [dayAdd(nt.end, -120), dayAdd(nt.by, -30)].sort()[0];
      if (ctx.today < from || ctx.today > nt.end) return;
      notice.push({ unitId: u.id, contractId: str(c.id), end: nt.end, by: nt.by, months: nt.months, renews: nt.renews, rule: nt.rule, source: nt.source,
        assumed: nt.assumed, passed: nt.passed, daysToBy: nt.daysToBy, daysToEnd: nt.daysToEnd, tenants: u.currentTenants.slice() });
    });
    if (notice.length) issues.push({ code: 'noticeDue', count: notice.length, ids: notice.map(function (x) { return x.unitId; }), items: notice });
    // Un interno abitato con l'annuncio ancora in vetrina: porta lead per una
    // casa che non c'è. Va bene solo il pre-blocco VERO: una data di
    // disponibilità scritta che viene dopo la fine del contratto.
    var live = [];
    units.forEach(function (u) {
      var c = u.current, l = u.pipeline.listing, raw = ctx.listingsByProperty[u.id];
      if (!c || !l || !l.published || !raw) return;
      var lFrom = day(raw.availableFrom) || day(raw.availableDate), end = effectiveEnd(c);
      if (lFrom && end && lFrom > end) return;
      var why = !lFrom ? (l.status === 'available' ? 'now' : 'nodate') : !end ? 'noend' : lFrom <= ctx.today ? 'now' : 'early';
      live.push({ unitId: u.id, listingId: l.id, status: l.status, availableFrom: lFrom, leaseEnd: end, why: why });
    });
    if (live.length) issues.push({ code: 'listingLive', count: live.length, ids: live.map(function (x) { return x.unitId; }), items: live });
    var look = lookOf(props, b, savedTop);
    // Prima di condividere il palazzo con la proprietaria: ciò che il disegno
    // non sa (ultimo piano, intonaco, persiane) resta neutro — e si dice.
    if (props.length >= 3) {
      var miss = [];
      if (!look.declared.topFloor) miss.push('ultimoPiano');
      if (!look.declared.intonaco) miss.push('intonaco');
      if (!look.declared.persiane) miss.push('persiane');
      if (miss.length) issues.push({ code: 'lookMissing', count: miss.length, ids: [], missing: miss });
    }
    if (partial) issues.push({ code: 'partial', count: 1, ids: [], collections: Array.isArray(partial) ? partial : [] });
    var totals = totalsOf(units);
    totals.debtors = debtors.length;
    totals.debtorsAmount = debtors.reduce(function (a, d) { return round(a + d.amount); }, 0);
    totals.debtorsOldest = debtors.map(function (d) { return d.oldest; }).filter(Boolean).sort()[0] || '';
    var model0 = { building: b, buildings: all, month: m, currentMonth: ctx.month, today: ctx.today, floors: floors, unplaced: unplaced, units: units,
      totals: totals, series: series, issues: issues, owner: owner, look: look,
      debtors: debtors, debtorsRef: ctx.today, partial: partial,
      // Un mese tutto prima della gestione BOOM: niente "tutti in regola" né
      // "tutto pieno" — di quel mese non c'è archivio.
      allBefore: units.length > 0 && totals.before === totals.units, beforeCount: totals.before,
      gestioneDal: props.map(function (p) { return monthOf(p.gestioneDal); }).filter(Boolean).sort()[0] || '' };
    model0.analytics = analyticsOf(ctx, model0, pastSeries);
    model0.brief = brief(model0);
    return model0;
  }

  // L'andamento del palazzo negli ultimi 12 mesi fino a oggi. Solo misure,
  // nessuna stima: il canone "perso" per lo sfitto non si inventa, e
  // l'occupazione si misura solo sui mesi di BOOM con un contratto noto
  // (null sotto OCC_MIN_MONTHS mesi di gestione: un numero su un mese solo
  // non è un andamento).
  function analyticsOf(ctx, m, pastSeries) {
    var paid = 0, onTime = 0, delaySum = 0, unitMonths = 0, occMonths = 0, unknownMonths = 0, win = 0, sinces = [];
    m.units.forEach(function (u) {
      paid += u.time.paidCount; onTime += u.time.onTime;
      if (u.time.avgDelay != null) delaySum += u.time.avgDelay * u.time.paidCount;
      unitMonths += u.time.measuredMonths; occMonths += u.time.occupiedMonths; unknownMonths += u.time.unknownMonths;
      win = Math.max(win, u.time.windowMonths);
      sinces.push(u.time.since || '');
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
      .map(function (u) { return { id: u.id, interno: u.interno, name: u.name, date: u.month.leaseEnd, tenants: u.month.tenants, next: u.pipeline.proposal, notice: u.notice }; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
    var vacant = m.units.filter(function (u) { return u.month.state === 'vacant' || u.month.state === 'incoming'; })
      .map(function (u) { return { id: u.id, interno: u.interno, name: u.name, days: u.time.vacantDays, since: u.time.vacantSince, pipeline: u.pipeline }; })
      .sort(function (a, b) { return (b.days || 0) - (a.days || 0); });
    var ser = pastSeries || m.series;
    return {
      paidCount: paid, onTime: onTime, onTimePct: paid ? Math.round(onTime / paid * 100) : null,
      avgDelay: paid ? Math.round(delaySum / paid * 10) / 10 : null,
      // null = campione troppo piccolo (dichiarato da occupancyMonths/
      // occupancyMinMonths): mai "48%" su un palazzo preso in carico ieri.
      occupancy12: unitMonths && win >= OCC_MIN_MONTHS ? Math.round(occMonths / unitMonths * 100) : null, vacantMonths: unitMonths - occMonths,
      occupancyMonths: win, occupancyUnitMonths: unitMonths, occupancyUnknown: unknownMonths, occupancyMinMonths: OCC_MIN_MONTHS,
      occupancySince: sinces.length && sinces.every(Boolean) ? sinces.sort()[0] : '',
      collected12: collectedTotal, expected12: dueTotal, collectionPct: dueTotal ? Math.round(collectedTotal / dueTotal * 100) : null,
      months: ser.map(function (s) { return { month: s.month, expected: s.totals.expected, collected: s.totals.collected, late: s.totals.lateAmount }; }),
      expiries: expiries, vacant: vacant
    };
  }

  // I numeri del mese. `occupied` conta solo gli interni GESTITI nel mese
  // (un mese prima di BOOM non è né pieno né libero: `before`), e `managed`
  // è il denominatore giusto ("3 su 4 gestiti").
  function totalsOf(units) {
    var t = { units: units.length, managed: 0, occupied: 0, vacant: 0, incoming: 0, paid: 0, late: 0, due: 0, review: 0, norate: 0, unknown: 0, before: 0, maintOpen: 0, maintUrgent: 0,
      expected: 0, collected: 0, lateAmount: 0, unknownAmounts: 0, arrears: 0, arrearsCount: 0, arrearsOldest: '', leaving: 0, occupancy: 0, nocontract: 0 };
    units.forEach(function (u) {
      var um = u.month;
      if (um.state !== 'before') { t.managed++; if (um.occupied) t.occupied++; }
      t[um.state] = (t[um.state] || 0) + 1;
      // Occupato col contratto non ancora in archivio: è una cosa diversa da
      // una rata mancante, e alla proprietaria si dice com'è.
      if (um.state === 'norate' && um.lease && um.lease.contractMissing === true) { t.nocontract++; t.norate--; }
      if (um.leaving) t.leaving++;
      t.expected = round(t.expected + um.expected);
      t.collected = round(t.collected + um.collected);
      t.lateAmount = round(t.lateAmount + um.lateAmount);
      t.unknownAmounts += um.unknownAmounts || 0;
      if (u.maintenance) { t.maintOpen += u.maintenance.open.length; t.maintUrgent += u.maintenance.urgent; }
      t.arrears = round(t.arrears + ((u.arrears && u.arrears.amount) || 0));
      if (u.arrears && u.arrears.count) {
        t.arrearsCount += u.arrears.count;
        if (u.arrears.oldest && (!t.arrearsOldest || u.arrears.oldest < t.arrearsOldest)) t.arrearsOldest = u.arrears.oldest;
      }
    });
    t.occupancy = t.managed ? Math.round(t.occupied / t.managed * 100) : 0;
    return t;
  }

  var API = { day: day, monthOf: monthOf, monthAdd: monthAdd, monthLabel: monthLabel, parseFloor: parseFloor, floorLabel: floorLabel,
    unitOf: unitOf, scalaOf: scalaOf, floorOf: floorOf, streetKey: streetKey, buildingKeyOf: buildingKeyOf, ownerOf: ownerOf,
    context: context, unitMonth: unitMonth, arrearsOf: arrearsOf, strip: strip, buildings: buildings, model: model,
    totalsOf: totalsOf, pipelineOf: pipelineOf, timeOf: timeOf, analyticsOf: analyticsOf, brief: brief, STATES: STATES, TONES: TONES, toneOf: toneOf,
    LOOKS: LOOKS, LOOK_DEFAULT: LOOK_DEFAULT, lookOf: lookOf, civicOf: civicOf, validateLook: validateLook,
    paperOf: paperOf, cedolareDeclared: cedolareDeclared, csvRows: csvRows, toCsv: toCsv, CSV_HEAD: CSV_HEAD,
    parseRentRoll: parseRentRoll, planImport: planImport, RR_TEMPLATE: RR_TEMPLATE,
    maintOf: maintOf, utenzeOf: utenzeOf, podOk: podOk, pdrOk: pdrOk, utenzeRows: utenzeRows, UTENZE_HEAD: UTENZE_HEAD,
    // S2 — il mese, gli arretrati, i numeri
    effectiveEnd: effectiveEnd, covers: covers, daysOverlap: daysOverlap, contractKindOf: contractKindOf, isCompanyName: isCompanyName,
    noticeOf: noticeOf, NOTICE: NOTICE, typeKey: typeKey, paidDayOf: paidDayOf, eur: eurIt, leaseOn: leaseOn,
    PAID_VIA: PAID_VIA, PAID_EVIDENCE: PAID_EVIDENCE, paidViaLabel: paidViaLabel, evidenceLabel: evidenceLabel, OCC_MIN_MONTHS: OCC_MIN_MONTHS };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.BOOM_PALAZZO = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
