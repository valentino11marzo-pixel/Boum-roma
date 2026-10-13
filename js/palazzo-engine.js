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
  // Le stesse date tornano migliaia di volte (scadenze, decorrenze): la
  // lettura di una stringa si ricorda (deterministica: il fuso è sempre
  // Roma), con un tetto perché una pagina aperta tutto il giorno non cresca.
  var DAY_MEMO = Object.create(null), DAY_MEMO_N = 0;
  var ROME_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
  function day(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
      var hit = DAY_MEMO[value];
      if (hit !== undefined) return hit;
      if (++DAY_MEMO_N > 20000) { DAY_MEMO = Object.create(null); DAY_MEMO_N = 1; }
      return (DAY_MEMO[value] = dayOfString(value));
    }
    var date;
    try {
      date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate()
        : typeof value.seconds === 'number' ? new Date(value.seconds * 1000) : null;
    } catch (_) { return ''; }
    if (!date || !Number.isFinite(date.getTime())) return '';
    var p = {};
    ROME_DAY.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function dayOfString(value) {
    var s0 = value.trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(s0);
    if (!m) return '';
    var d0 = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (!(d0.getUTCFullYear() === +m[1] && d0.getUTCMonth() === +m[2] - 1 && d0.getUTCDate() === +m[3])) return '';
    if (INSTANT_RE.test(s0)) { var at = new Date(s0); if (Number.isFinite(at.getTime())) return day(at); }
    return m[0].slice(0, 10);
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
  function unitOf(p) {
    var u = str(p && (p.interno || p.unit));
    if (u) return u.replace(/^int(?:erno)?\.?\s*/i, '');
    var m = UNIT_RE.exec(norm(p && p.name)) || UNIT_RE.exec(norm(p && p.address));
    return m ? m[1].toUpperCase() : '';
  }
  // La scala si legge per token, come il civico: "Via della Scala 5" è una
  // via di Trastevere (scala dopo una preposizione), "Via Scala 5" pure
  // (scala dopo il tipo di strada). Solo "scala B" / "sc. B" è una scala.
  function scalaIn(text) {
    var t = norm(text).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    for (var i = 0; i < t.length; i++) {
      if ((t[i] === 'scala' || t[i] === 'sc') && isScalaMarker(t[i - 1] || '', t[i + 1] || '')) return t[i + 1].toUpperCase();
    }
    return '';
  }
  function scalaOf(p) {
    var s = str(p && p.scala);
    if (s) return s.replace(/^(?:scala|sc\.?)\s*/i, '').toUpperCase();
    return scalaIn(p && p.address) || scalaIn(p && p.name);
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
  // Il tipo di strada: "Via Scala 5" ha la scala nel nome, non una scala B.
  var STREET_TYPES = ['via', 'viale', 'piazza', 'piazzale', 'largo', 'vicolo', 'vico', 'corso', 'lungotevere', 'circonvallazione', 'salita', 'borgo', 'strada', 'contrada', 'galleria', 'lungomare', 'piazzetta', 'rampa', 'scalinata'];
  // Le vie con una data nel nome (4 Novembre, XX Settembre, 21 Aprile,
  // 16 Ottobre 1943): quel numero è il NOME della via, non il civico.
  var MONTH_WORDS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var ROMAN_DAYS = (function () {
    var o = {}, u = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'], t = ['', 'x', 'xx', 'xxx'];
    for (var n = 1; n <= 31; n++) o[t[Math.floor(n / 10)] + u[n % 10]] = n;
    return o;
  })();
  var CIVIC_SUFFIX = ['bis', 'ter', 'quater'];
  // Le parole che dopo il civico dicono DOVE nel palazzo, mai la via:
  // «42 terzo piano», «42 PT», «42 stanza 2», «42 palazzina B».
  var DETAIL = FLOOR_WORDS.concat(['piano', 'pt', 'app', 'appartamento', 'stanza', 'stanze', 'camera', 'camere', 'lotto', 'palazzina', 'edificio',
    'seminterrato', 'mansarda', 'sottotetto', 'cantina', 'box', 'garage', 'posto', 'negozio', 'ufficio', 'locale', 'magazzino']);
  function isScalaMarker(prev, next) {
    return PREP.indexOf(prev) < 0 && STREET_TYPES.indexOf(prev) < 0 && !!next && next.length <= 3;
  }
  // Per token, non per regex cieca: "Via della Scala 5" è un palazzo in
  // Trastevere, non "Via della" + scala 5; "Via Roma 12" tiene la sua Roma.
  // Il civico è l'ULTIMO numero della via, quello dopo cui vengono solo i
  // dettagli (virgola, int., scala, piano, città, fine): "Via 4 Novembre 96"
  // è il 96 di Via 4 Novembre, mai il 4 di "Via". bis/ter restano nel
  // civico (il 42 bis è un altro portone), i romani davanti a un mese
  // diventano cifre (XX Settembre = 20 Settembre).
  function streetKey(address) {
    var s = norm(address);
    if (!s) return '';
    s = s.replace(/\bv\.\s*le\b|\bvle\b/g, 'viale')
      .replace(/\bp\.\s*(?:zz?a?)?le\b|\bpzz?a?le\b/g, 'piazzale')
      .replace(/\bp\.\s*zz?a\b|\bpzz?a\b/g, 'piazza')
      .replace(/\bc\.\s*so\b|\bcso\b/g, 'corso').replace(/\bl\.\s*go\b|\blgo\b/g, 'largo')
      .replace(/^v\.\s*/, 'via ').replace(/\b\d{5}\b/g, ' ')
      .replace(/(\d+)\s*\/\s*([a-z])\b/g, '$1$2')
      // virgola, trattino staccato, parentesi: lì finisce la via
      .replace(/\s*[,;()]\s*|\s+-\s+/g, ' , ')
      .replace(/[^a-z0-9,]+/g, ' ').trim();
    var t = s.split(' ').filter(Boolean), out = [], civico = '';
    var hasStreet = function () { return out.some(function (x) { return CITY.indexOf(x) < 0; }); };
    var isNum = function (w) { return /^\d+(?:[a-z]|bis|ter|quater)?$/.test(w); };
    for (var i = 0; i < t.length; i++) {
      var w = t[i], prev = t[i - 1] || '', next = t[i + 1] || '';
      if (w === ',') { if (civico) break; continue; }
      if (w === 'int' || w === 'interno') { if (civico) break; i++; continue; }
      if ((w === 'scala' || w === 'sc') && isScalaMarker(prev, next)) { if (civico) break; i++; continue; }
      if (w === 'piano' && PREP.indexOf(prev) < 0 && (/^\d{1,2}$/.test(next) || FLOOR_WORDS.indexOf(next) >= 0)) { if (civico) break; i++; continue; }
      if (w === 'p' && /^\d{1,2}$/.test(next)) { if (civico) break; i++; continue; }
      if (w === 'civico' || w === 'civ' || w === 'n' || w === 'nr' || w === 'num') continue;
      if (civico) {
        // Un numero seguito da altre parole della via era parte del nome
        // ("Via 4 Fontane 20"): torna nella via e si cerca il civico vero.
        // Ma solo se sta SUBITO dopo il tipo di strada («Via 4 Fontane»,
        // «Viale dei 4 Venti»): dopo «Piazzale Prenestino» il 42 è già il
        // civico, e «42 Pigneto», «42 terzo piano», «42 stanza 2» restano
        // il 42 — un quartiere o un dettaglio non fanno un altro palazzo.
        if (CITY.indexOf(w) >= 0 || isNum(w) || DETAIL.indexOf(w) >= 0) break;
        if (!out.every(function (x) { return STREET_TYPES.indexOf(x) >= 0 || PREP.indexOf(x) >= 0 || CITY.indexOf(x) >= 0; })) break;
        out.push(civico); civico = '';
      }
      if (ROMAN_DAYS[w] && MONTH_WORDS.indexOf(next) >= 0) { out.push(String(ROMAN_DAYS[w])); continue; }
      if (/^\d+$/.test(w) && (MONTH_WORDS.indexOf(next) >= 0 || (/^(1[89]|20)\d\d$/.test(w) && MONTH_WORDS.indexOf(prev) >= 0))) { out.push(w); continue; }
      if (isNum(w)) {
        if (!hasStreet()) continue;
        civico = w;
        if (/^\d+$/.test(w) && (/^[a-z]$/.test(next) || CIVIC_SUFFIX.indexOf(next) >= 0)) { civico = w + next; i++; }
        continue;
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
  // Chiuso DAVVERO: terminato (o con la data di chiusura scritta), oppure
  // scaduto/chiuso/rinnovato per stato. Un contratto ancora 'active' (o
  // 'signed') oltre la sua fine NON è chiuso: è un rinnovo tacito o una data
  // da aggiornare, e le rate dei mesi dopo restano dovute.
  var ENDED = { terminated: 1, expired: 1, closed: 1, ended: 1, completed: 1, renewed: 1, cancelled: 1, canceled: 1 };
  function closedForReal(c) { return !!(c && (ENDED[cStatus(c)] || day(c.terminatedAt))); }
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
  // Il locatore è una società? Due segni, nessuna supposizione:
  //  - una PAROLA da ente ovunque nel nome (società, cooperativa, consorzio,
  //    fondazione, associazione, holding, immobiliare);
  //  - una FORMA giuridica in CODA al nome (dopo «unipersonale», «in
  //    liquidazione», «a socio unico», che la seguono): S.r.l., SPA, Ltd…
  //    Le forme che sono anche cognomi o iniziali (sas, sa, ss) valgono solo
  //    puntate («S.a.s.») o in maiuscolo («ROSSI SAS»): «Maria Sas» e
  //    «Rosa S. A. Rossi» restano persone.
  //  - oppure il nome è TUTTO una sigla puntata di almeno tre lettere
  //    («A.B.C.D.»): un nome con le iniziali davanti al cognome resta persona.
  // Serve a non parlare di IRPEF/cedolare a una società.
  var COMPANY_WORD_RE = /(^|[^a-z])(societa|soc\.|cooperativa|coop\.?|consorzio|fondazione|associazione|holding|immobiliare)(?=$|[^a-z])/;
  var FORM_SURE = { srl: 1, srls: 1, spa: 1, snc: 1, sapa: 1, ltd: 1, gmbh: 1, llc: 1, inc: 1, sarl: 1, scarl: 1, scrl: 1 };
  var FORM_AMBIG = { sas: 1, sa: 1, ss: 1 };
  var FORM_TAIL_RE = /[\s,]+(?:unipersonale|in liquidazione|a socio unico|con socio unico)\.?\s*$/i;
  function isCompanyName(name) {
    var raw = str(name).replace(/[()]/g, ' ').trim(), s = norm(raw);
    if (!s) return false;
    if (COMPANY_WORD_RE.test(s)) return true;
    if (/^(?:[a-z]\.\s?){3,}$/.test(s)) return true;
    var body = raw;
    for (var i = 0; i < 3 && FORM_TAIL_RE.test(body); i++) body = body.replace(FORM_TAIL_RE, '').trim();
    // La forma in coda: puntata («S.r.l.», «S. p. A.»), oppure una parola sola.
    var dotted = /(?:^|[\s,])((?:[A-Za-z]\.\s?){2,5})$/.exec(body);
    if (dotted) {
      var letters = dotted[1].replace(/[\s.]/g, '').toLowerCase();
      // La sigla puntata è TUTTO il nome? Allora è una sigla, non una forma
      // (vale la regola delle tre lettere sopra).
      if (dotted.index === 0) return false;
      // «Bianchi & C. S.n.c.»: la forma è la coda della sigla.
      for (var k = 0; k <= letters.length - 2; k++) { var f = letters.slice(k); if (FORM_SURE[f] || FORM_AMBIG[f]) return true; }
      return false;
    }
    var last = /(?:^|[\s,])([A-Za-z]{2,5})\.?$/.exec(body);
    if (!last || last.index === 0) return false; // una parola sola non basta
    var w = last[1].toLowerCase();
    if (FORM_SURE[w]) return true;
    return !!(FORM_AMBIG[w] && last[1] === last[1].toUpperCase());
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
    '3+2': { months: 6, renews: 'proroga', source: 'modello', rule: 'Contratto 3+2 (Allegato A, art. 1): alla prima scadenza si proroga di diritto di due anni (il locatore può disdire solo per i motivi dell’art. 3 L. 431/98); alla fine della proroga chi non vuole rinnovare lo comunica almeno sei mesi prima.' },
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

  // Solo https, e senza lanciare: una rata senza ricevuta (la norma) non
  // passa dal costruttore di URL (che su '' lancia, e costava ~7 volte il
  // contesto su un archivio grande).
  function httpsUrl(u) { var s = str(u); if (!/^https:\/\//i.test(s)) return ''; try { return new URL(s).href; } catch (_) { return ''; } }
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
    var paymentsByProperty = Object.create(null), preBoomOpen = Object.create(null), afterClose = Object.create(null), beyondEnd = Object.create(null);
    // Ciò che di un contratto serve a ogni sua rata, calcolato una volta:
    // inizio, fine effettiva, chiuso davvero, e i giorni dei mesi di locazione.
    var infoMemo = typeof Map === 'function' ? new Map() : null;
    var infoOf = function (c) {
      var hit = infoMemo && infoMemo.get(c);
      if (hit) return hit;
      var it = { start: day(c.startDate), end: effectiveEnd(c), closed: closedForReal(c), lm: Object.create(null), pe: Object.create(null) };
      it.month0 = it.start ? it.start.slice(0, 7) : '';
      it.lease = function (k) { return it.lm[k] || (it.lm[k] = leaseMonth(it.start, k)); };
      it.periodEnd = function (k) { return it.pe[k] || (it.pe[k] = dayAdd(it.lease(k), -1)); };
      if (infoMemo) infoMemo.set(c, it);
      return it;
    };
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
      var ci = contract ? infoOf(contract) : null;
      var pf = day(p.periodFrom), pt = day(p.periodTo), cs = ci ? ci.start : '';
      if ((!pf || !pt) && cs && row.month && monthsDiff(ci.month0, row.month) >= 0) {
        var k0 = monthsDiff(ci.month0, row.month), k1 = monthsDiff(ci.month0, row.coversTo && row.coversTo > row.month ? row.coversTo : row.month) + 1;
        if (!pf) pf = ci.lease(k0);
        // Il periodo si chiude alla fine del contratto, ma solo per la rata
        // che la contiene: una rata che comincia DOPO la fine tiene il suo.
        if (!pt) { pt = ci.periodEnd(k1); var ce = ci.end; if (ce && pt > ce && pf <= ce) pt = ce; }
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
      // Una rata il cui periodo comincia DOPO la fine del suo contratto.
      // Contratto chiuso DAVVERO (terminato, scaduto, chiuso): la rata non
      // tiene occupato l'interno e non è un ritardo. Aperta, si toglie dal
      // Palazzo e si conta per l'operatore (va annullata); pagata resta fra i
      // soldi (sono veri) ma si dichiara, perché il contratto dice che lì non
      // c'era più nessuno. Contratto ancora 'active' oltre la fine (rinnovo
      // tacito, una data da aggiornare): la rata resta dovuta — tiene occupato
      // l'interno, conta come ritardo — e si segnala a parte («rinnovo?»),
      // mai «da annullare».
      var cEnd = ci ? ci.end : '', pStart = pf || (row.month ? monthStart(row.month) : '');
      if (cEnd && pStart && pStart > cEnd) {
        if (ci.closed) {
          row.afterClose = true;
          var ac = afterClose[pid] = afterClose[pid] || { open: [], paid: [] };
          if (row.state === 'overdue' || row.state === 'due' || row.state === 'unknown') { ac.open.push(row); return; }
          if (row.state === 'paid') ac.paid.push(row);
        } else if (row.state !== 'cancelled') {
          row.beyondEnd = true;
          var be = beyondEnd[pid] = beyondEnd[pid] || [];
          be.push(row);
        }
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
      contractsByProperty: byProperty, paymentsByProperty: paymentsByProperty, preBoomOpen: preBoomOpen, afterClose: afterClose, beyondEnd: beyondEnd,
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
    var monthRows = rowsForMonth(rows, month), carried = false, beyond = false;
    // Un contratto ancora 'attivo' oltre la sua fine con le rate di questo
    // mese (rinnovo tacito, una data da aggiornare): è lui l'inquilino del
    // mese — nome, canone, che contratto è — e lo si dichiara (beyondEnd).
    if (!lease) { var br = monthRows.find(function (r) { return r.beyondEnd && r.contract; }); if (br) { lease = br.contract; beyond = true; } }
    // Il ripiego vale solo per la rata DEL CONTRATTO del mese: nel mese del
    // cambio inquilino la rata di luglio del vecchio non copre agosto del
    // nuovo (sarebbe un verde falso su una rata che manca).
    if (!monthRows.length && lease) {
      var cr = carriedRows(rows, month).filter(function (r) { return !r.contractId || r.contractId === str(lease.id); });
      if (cr.length) { monthRows = cr; carried = true; }
    }
    var ownRows = monthRows.filter(function (r) { return r.month === month; });
    // Una rata dopo la chiusura del contratto (anche pagata) non dice che lì
    // c'è qualcuno: senza un contratto in corso l'interno è libero, e la rata
    // resta visibile fra i soldi del mese.
    var occupied = !!lease || monthRows.some(function (r) { return !r.afterClose; });
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
    if (!tenants.length && occupied) monthRows.forEach(function (r) { if (!r.afterClose && r.tenantName && tenants.indexOf(r.tenantName) < 0) tenants.push(r.tenantName); });
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
      rows: monthRows, carried: carried, beyondEnd: beyond, pastDue: pastDue, overdueUpTo: overdueUpTo,
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
          // Soldi veri dopo la chiusura del contratto (o oltre la sua fine, con
          // il contratto ancora attivo): si scrivono, e si dice perché sono strani.
          var why = g.every(function (r) { return r.afterClose; }) ? ' · dopo la chiusura del contratto'
            : g.every(function (r) { return r.beyondEnd; }) ? ' · oltre la scadenza del contratto' : '';
          rows.push(line(u, c, names, g, stateOf(aggregate(g.map(function (r) { return r.state; }))) + why));
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
  // lo dice con una data che cade nella finestra di QUELLA rata. Id
  // deterministici: reincollare la stessa tabella non raddoppia, e ciò che
  // in archivio è DIVERSO dalla tabella si dice (plan.diffs) e si scrive solo
  // se l'operatore lo chiede (opts.applyDiffs).
  // Il CS è quello dichiarato in testa al file: qui NON si ridichiara (un
  // secondo `var CS = … : null` lo azzerava nel browser e il Palazzo cadeva
  // al primo contratto — integrazione del 13/10/2026).
  function phoneOf(v) {
    var cs = CS && typeof CS.phoneIntl === 'function' ? CS : (root && root.BOOM_CONTRACT_STATE);
    return cs && typeof cs.phoneIntl === 'function' ? cs.phoneIntl(v) : null;
  }
  var RR_COLS = {
    interno: ['interno', 'int', 'int.', 'unita', 'unita immobiliare', 'appartamento', 'app', 'n', 'nr', 'num', 'numero', 'n interno', 'interno n', 'numero interno'],
    piano: ['piano', 'floor'],
    scala: ['scala'],
    inquilino: ['inquilino', 'conduttore', 'nome', 'cognome e nome', 'nome e cognome', 'locatario', 'tenant', 'nominativo', 'inquilini', 'conduttori', 'intestatario'],
    cognome: ['cognome', 'surname'],
    telefono: ['telefono', 'tel', 'tel.', 'cellulare', 'cell', 'phone', 'whatsapp', 'numero di telefono', 'telefono cellulare'],
    email: ['email', 'e-mail', 'mail', 'posta elettronica'],
    canone: ['canone', 'canone mensile', 'affitto', 'importo', 'rent', 'canone €', 'canone (€)', 'canone di locazione'],
    dal: ['dal', 'inizio', 'decorrenza', 'data inizio', 'inizio contratto', 'start', 'inizio locazione', 'data decorrenza'],
    al: ['al', 'fine', 'scadenza', 'data fine', 'fine contratto', 'end', 'fine locazione', 'scadenza contratto', 'data scadenza'],
    tipo: ['tipo', 'tipologia', 'contratto', 'tipo contratto', 'tipo di contratto'],
    deposito: ['deposito', 'cauzione', 'deposito cauzionale'],
    cedolare: ['cedolare', 'cedolare secca'],
    registrato: ['registrato', 'registrazione', 'registrato il', 'data registrazione', 'rli'],
    // «Ultimo pagamento» e «pagamento» non sono qui di proposito: la data
    // segnerebbe pagata la rata di un altro mese. «Pagato il» dice l'accredito.
    pagato: ['pagato', 'pagato il', 'pagata il', 'data accredito', 'accreditato il', 'incassato il', 'data pagamento'],
    giorno: ['giorno', 'giorno pagamento', 'giorno di pagamento', 'scadenza rata'],
    pod: ['pod', 'codice pod', 'pod luce', 'luce'],
    pdr: ['pdr', 'codice pdr', 'pdr gas', 'gas'],
    // Dai contratti veri (Prenestino 42, 8/10): due studenti per interno,
    // obbligati in solido; oneri fissi pagati insieme al canone; il conto
    // del locatore (una società, non la persona che gestisce il palazzo).
    coinquilini: ['co-intestatari', 'cointestatari', 'co-intestatario', 'cointestatario', 'coinquilini', 'coinquilino', 'co-conduttori',
      'coconduttori', 'co-conduttore', 'coconduttore', 'altri conduttori', 'altri intestatari', 'secondo conduttore', 'secondo inquilino'],
    oneri: ['oneri', 'oneri accessori', 'spese', 'spese condominiali', 'acconto oneri', 'condominio', 'oneri mensili', 'oneri €', 'oneri (€)', 'oneri condominiali'],
    locatore: ['locatore', 'locatrice', 'proprietario', 'proprietaria', 'intestatario contratto'],
    iban: ['iban', 'iban locatore', 'iban proprietario', 'iban per il canone', 'conto', 'conto corrente'],
    mq: ['mq', 'm2', 'm²', 'metri', 'metri quadri', 'superficie', 'superficie mq']
  };
  // Il titolo come lo scrive Excel: «Canone mensile €», «Canone (€/mese)»,
  // «Deposito €», «Int.», «N°». Si tolgono valuta, parentesi, "/mese",
  // "mensile", punti e due punti; poi si cerca l'alias esatto e, se non
  // c'è, la parola chiave (prima le regole più specifiche).
  function rrHead(h) {
    return norm(h).replace(/\([^)]*\)/g, ' ').replace(/€|\beur(?:o)?\b/g, ' ')
      .replace(/\/\s*mese\b|\bal mese\b|\bper mese\b|\bmensil[ei]\b/g, ' ')
      .replace(/[:*°º#.]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  var RR_ALIAS = (function () {
    var o = Object.create(null);
    Object.keys(RR_COLS).forEach(function (k) { RR_COLS[k].forEach(function (a) { var h = rrHead(a); if (h && !o[h]) o[h] = k; }); });
    return o;
  })();
  var RR_GUESS = [
    [/\biban\b/, 'iban'],
    [/^(?:codice )?pod\b/, 'pod'], [/^(?:codice )?pdr\b/, 'pdr'],
    [/co-?\s?intestat|cointestat|co-?\s?condutt|cocondutt|coinquilin|^altri (?:condutt|intestat|inquilin)|^(?:secondo|seconda|2) (?:condutt|inquilin|intestat)|^(?:condutt|inquilin|intestatari)\w* (?:2|ii|secondo|seconda)$/, 'coinquilini'],
    [/^(?:data (?:di |della )?|giorno (?:di |della )?)?scadenza (?:della )?(?:rata|pagamento|canone)|^giorno\b/, 'giorno'],
    // «Nome inquilino», «Nome e cognome conduttore», «Nome dell'inquilino».
    [/^(?:(?:nome|cognome)(?: e (?:nome|cognome))? (?:del |della |dell['’] ?|dell )?)?(?:nominativ|inquilin|condutt|locatari|tenant|intestatari)/, 'inquilino'],
    [/^cognome\b/, 'cognome'],
    [/^(?:canone|affitto|pigione)(?!.*(?:oneri|spese|total|annu|deposit|cauzion))/, 'canone'],
    [/^(?:oneri|spese|condominio|acconto (?:oneri|spese))/, 'oneri'],
    [/^(?:data (?:di |d'|del |della )?)?(?:inizio|decorrenza|ingresso)\b/, 'dal'],
    [/^(?:data (?:di |del |della )?)?(?:fine|termine|uscita|scadenza)\b/, 'al'],
    [/^(?:deposito|cauzione)/, 'deposito'],
    [/^cedolare/, 'cedolare'],
    [/^(?:data (?:di |della )?)?registra|^rli\b/, 'registrato'],
    [/^(?:pagat|data (?:di |del |dell')?(?:pagamento|accredito|bonifico)|accredit|incassat)/, 'pagato'],
    [/^(?:telefon|tel\b|cell|mobile|whatsapp|recapito tel)/, 'telefono'],
    [/mail/, 'email'],
    [/^(?:locator|locatric|propriet)/, 'locatore'],
    [/^(?:superficie|mq\b|m2\b|metri)/, 'mq'],
    [/^(?:tipo|tipologia)\b/, 'tipo'],
    [/^piano\b/, 'piano'],
    [/^scala\b/, 'scala'],
    [/^(?:interno|int\b|unita|appartamento|n\b|nr\b|num)/, 'interno']
  ];
  function rrColumn(h, cols) {
    var k = rrHead(h);
    if (!k) return '';
    if (RR_ALIAS[k] && cols[RR_ALIAS[k]] == null) return RR_ALIAS[k];
    if (RR_ALIAS[k]) return '';
    for (var i = 0; i < RR_GUESS.length; i++) if (RR_GUESS[i][0].test(k) && cols[RR_GUESS[i][1]] == null) return RR_GUESS[i][1];
    return '';
  }
  var RR_TYPES = { transitorio: 'transitorio', transitoria: 'transitorio', studenti: 'studenti', studente: 'studenti', universitario: 'studenti',
    '3+2': '3+2', '32': '3+2', concordato: '3+2', 'canone concordato': '3+2', '4+4': '4+4', '44': '4+4', libero: '4+4', 'canone libero': '4+4' };
  function rrNum(v) {
    var x = str(v).replace(/[€\s]/g, '').replace(/(\/|al)?mese$|mensil[ie]$|eur(o)?$/i, '');
    if (!x) return null;
    // «1.500,00» italiano · «1,500» con gruppi di tre cifre = migliaia (un
    // importo con tre decimali non esiste) · «1500,5» decimale con virgola.
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.replace(/,/g, '');
    else if (/^\d+,\d+$/.test(x)) x = x.replace(',', '.');
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
  // gg/mm/aaaa per le frasi del piano.
  function rrIt(d) { var x = str(d); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x.slice(8, 10) + '/' + x.slice(5, 7) + '/' + x.slice(0, 4) : x; }
  function rrDays(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
  function rrPlural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function rrList(items) { return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' e ' + items[items.length - 1]; }
  function rrMonth(m) { return monthLabel(m).toLowerCase(); }
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
  function ibanMask(ib) { ib = str(ib).replace(/\s+/g, '').toUpperCase(); return ib.length > 8 ? ib.slice(0, 4) + ' … ' + ib.slice(-4) : ib; }
  // Una società non ha la cedolare secca (solo persone fisiche, art. 3
  // d.lgs. 23/2011): s.r.l., s.p.a., s.a.s., s.n.c., società, coop…
  // Parola per parola, coi punti tolti dentro la parola: «S.r.l.» → srl.
  var COMPANY_WORDS = ['srl', 'srls', 'spa', 'sapa', 'sas', 'snc', 'scarl', 'scrl', 'societa', 'soc', 'coop', 'cooperativa', 'fondazione', 'associazione', 'ltd', 'gmbh', 'inc', 'sarl'];
  function looksCompany(name) {
    return norm(name).split(/\s+/).some(function (w) { return COMPANY_WORDS.indexOf(w.replace(/[^a-z0-9]/g, '')) >= 0; });
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
  // La chiave di un interno e di una scala: «07» è il 7, «int. 7» è il 7,
  // «12/B» è il 12B, «Scala A» è la A. Solo per CONFRONTARE: in archivio
  // l'interno resta scritto come l'ha scritto la proprietaria.
  function unitKey(v) {
    return norm(v).replace(/^(?:int(?:erno)?|app(?:artamento)?|unita|n)\b\.?\s*/, '').replace(/[^a-z0-9]+/g, '').replace(/^0+(?=\d)/, '');
  }
  function scalaKey(v) { return norm(v).replace(/^(?:scala|sc)\b\.?\s*/, '').replace(/[^a-z0-9]+/g, ''); }
  // Le righe della tabella, virgolette comprese: una cella di Excel con un
  // a capo dentro ("Ada\nBea") arriva fra virgolette e resta UNA cella.
  function rrRecords(text, sep) {
    var out = [], row = [], cur = '', q = false, line = 1, start = 1, opened = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (!opened) { opened = true; start = line; }
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else { if (ch === '\n') line++; cur += ch; }
      } else if (ch === '"' && cur === '') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); out.push({ cells: row, line: start }); row = []; cur = ''; line++; opened = false;
      } else cur += ch;
    }
    if (opened && (cur !== '' || row.length)) { row.push(cur); out.push({ cells: row, line: start }); }
    return out;
  }
  // La riga dei totali in fondo a un Excel: non è un interno.
  var RR_TOTAL = /^(?:tot|totale|totali|totale generale|subtotale|sub totale|somma|sum|total)$/;
  function parseRentRoll(text) {
    var all = String(text || '').replace(/^﻿/, '');
    var first = all.split(/\r?\n/).find(function (l) { return l.trim(); });
    if (!first) return { rows: [], columns: {}, unknown: [], unknownColumns: [], ignored: [], errors: ['vuota'] };
    var sep = first.indexOf('\t') >= 0 ? '\t' : first.indexOf(';') >= 0 ? ';' : ',';
    var recs = rrRecords(all, sep).filter(function (rc) { return rc.cells.some(function (x) { return str(x); }); });
    var cols = {}, unknown = [], unknownCols = [];
    recs[0].cells.forEach(function (h, i) {
      var hit = rrColumn(h, cols);
      if (hit) cols[hit] = i; else if (str(h)) { unknown.push(str(h)); unknownCols.push({ name: str(h), index: i, looks: '' }); }
    });
    if (cols.interno == null) return { rows: [], columns: cols, unknown: unknown, unknownColumns: unknownCols, ignored: [], errors: ['senza_interno'] };
    // Un titolo al plurale («Conduttori») senza la colonna dei co-intestatari:
    // la cella porta tutti e due i nomi.
    var splitTenants = cols.coinquilini == null && cols.inquilino != null &&
      /^(?:(?:nome|cognome)(?: e (?:nome|cognome))? (?:dei |degli |delle |del |della |dell['’] ?)?)?(?:condutt|inquilin|intestatar|nominativ)\w*(?:\/)?i$/.test(rrHead(recs[0].cells[cols.inquilino]));
    var has = {};
    Object.keys(RR_COLS).forEach(function (k) { has[k] = cols[k] != null; });
    // Il nome di chi abita lì può stare in «Inquilino» o nel solo «Cognome».
    var tenantCol = has.inquilino || has.cognome;
    has.tenant = tenantCol;
    var meta = { has: has, columns: cols, unknown: unknown, unknownColumns: unknownCols, ignored: [] };
    var seen = Object.create(null);
    var rows = [];
    recs.slice(1).forEach(function (rec) {
      var c = rec.cells, get = function (k) { return cols[k] == null ? '' : str(c[cols[k]]); };
      var rawInt = get('interno');
      var tot = (rawInt ? [rawInt] : c).some(function (x) { return RR_TOTAL.test(norm(x).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()); });
      if (tot) { meta.ignored.push({ line: rec.line, reason: 'totale', text: rawInt || 'Totale' }); return; }
      var inq = get('inquilino'), coRaw = get('coinquilini');
      if (cols.cognome != null && get('cognome')) inq = (inq + ' ' + get('cognome')).trim();
      if (splitTenants && inq && /[\/+;&\n]|\s+e\s+/i.test(inq)) {
        var parts = inq.split(/\s*(?:[\/+;&\n]|\s+e\s+)\s*/i).map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
        inq = parts[0] || ''; coRaw = parts.slice(1).join(' / ');
      }
      var r = { line: rec.line, interno: rawInt.replace(/^int(erno)?\.?\s*/i, ''), piano: get('piano'), scala: get('scala').replace(/^(?:scala|sc\.?)\s*/i, ''), inquilino: inq.replace(/\s+/g, ' ').slice(0, 120),
        telefono: '', email: '', canone: null, dal: '', al: '', tipo: '', deposito: null, cedolare: '', registrato: '', registratoSi: false, pagato: '', pagatoSi: false, giorno: 5, pod: '', pdr: '',
        coinquilini: [], oneri: null, locatore: get('locatore').slice(0, 120), iban: '', ibanInput: '', ibanValid: null, mq: null,
        senzaContratto: false, soloContatti: false, meta: meta, errors: [], warnings: [], alerts: [] };
      var ik = unitKey(r.interno);
      if (!r.interno) r.errors.push('interno mancante');
      else if (r.interno.length > 12 || r.interno.split(/\s+/).length >= 3 || !ik) r.errors.push('interno «' + r.interno + '» non sembra un interno: scrivi solo il numero (7, 7A, 12/B)');
      else {
        var key = scalaKey(r.scala) + '|' + ik;
        if (seen[key]) { r.errors.push('interno ' + r.interno + ' ripetuto (riga ' + seen[key] + ')'); r.dupUnit = seen[key]; } else seen[key] = r.line;
      }
      if (r.piano && parseFloor(r.piano) == null) r.warnings.push('piano «' + r.piano + '» non letto: resta da indicare');
      var tel = get('telefono'), digits = tel.replace(/\D/g, '');
      if (tel) {
        if (digits.length >= 6 && digits.length <= 15) {
          r.telefono = (/^\s*(\+|00)/.test(tel) ? '+' : '') + digits.replace(/^00/, '');
          // Un numero che non è chiaramente italiano e non porta il prefisso
          // internazionale manda il link WhatsApp in un altro paese.
          var ph = phoneOf(tel);
          if (ph && (ph.kind === 'unknown' || ph.ambiguous)) r.warnings.push('telefono «' + tel + '»: numero senza prefisso internazionale, scrivilo con + (es. +90 …): altrimenti WhatsApp e la chiamata vanno a un altro numero');
        } else r.warnings.push('telefono «' + tel + '» non è un numero');
      }
      var em = get('email').toLowerCase();
      if (em) { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) r.email = em; else r.warnings.push('email «' + em + '» non valida'); }
      var can = get('canone'); r.canone = rrNum(can);
      if (can && (r.canone === null || isNaN(r.canone))) { r.errors.push('canone «' + can + '» non è un numero'); r.canone = null; }
      // Zero non è un canone: dodici rate da €0 (e link della rata per €0)
      // non dicono niente a nessuno. Su un interno libero non si carica.
      else if (r.canone === 0) {
        if (r.inquilino) r.errors.push('canone 0: se l’interno è dato in uso gratuito non va in tabella come contratto (lascia vuoti canone e date, oppure scrivi il canone vero)');
        else { r.warnings.push('canone 0 su un interno libero: non lo carico'); r.canone = null; }
      }
      else if (r.canone != null && (r.canone < 50 || r.canone > 20000)) r.warnings.push('canone «' + can + '» letto come ' + rrEur(r.canone) + ': è davvero il canone MENSILE? controllalo prima di caricare');
      var dep = get('deposito'); r.deposito = rrNum(dep); if (dep && (r.deposito === null || isNaN(r.deposito))) { r.warnings.push('deposito «' + dep + '» non letto'); r.deposito = null; }
      ['dal', 'al'].forEach(function (k) { var v = get(k), d = rrDate(v); if (v && !d) r.errors.push((k === 'dal' ? 'inizio' : 'fine') + ' «' + v + '» non è una data (gg/mm/aaaa)'); r[k] = d || ''; });
      var tp = get('tipo'); if (tp) { r.tipo = RR_TYPES[norm(tp)] || ''; if (!r.tipo) r.warnings.push('tipo «' + tp + '» non riconosciuto: lascialo vuoto o usa transitorio · studenti · 3+2 · 4+4'); }
      var ced = get('cedolare'); r.cedolare = rrYes(ced) ? 'si' : rrNo(ced) ? 'no' : '';
      var reg = get('registrato'); if (reg) { var rd = rrDate(reg); if (rd) r.registrato = rd; else if (rrYes(reg)) r.registratoSi = true; else if (!rrNo(reg)) r.warnings.push('registrazione «' + reg + '» non letta'); }
      // «Pagato il» vuole la data dell'accredito: è lei che dice QUALE rata.
      // Un «sì» senza data non segna niente (lo si dice).
      var pg = get('pagato'); if (pg) { var pd = rrDate(pg); if (pd) { r.pagato = pd; r.pagatoSi = true; } else if (rrYes(pg)) { r.pagatoSi = true; r.warnings.push('pagato «' + pg + '» senza data: nessuna rata segnata pagata, scrivi il giorno dell’accredito (gg/mm/aaaa)'); } else if (!rrNo(pg)) r.warnings.push('pagato «' + pg + '» non letto'); }
      var gg = parseInt(get('giorno'), 10); if (gg >= 1 && gg <= 28) r.giorno = gg;
      r.pod = cleanCode(get('pod')); r.pdr = cleanCode(get('pdr'));
      if (r.pod && !podOk(r.pod)) r.warnings.push('POD «' + r.pod + '» non ha la forma IT001E12345678: lo carico, va controllato');
      if (r.pdr && !pdrOk(r.pdr)) r.warnings.push('PDR «' + r.pdr + '» non ha 14 cifre: lo carico, va controllato');
      r.coinquilini = rrNames(coRaw, r.inquilino);
      // Gli oneri entrano nella rata: un numero illeggibile la sbaglierebbe,
      // quindi si ferma la riga come per il canone.
      var on = get('oneri'); r.oneri = rrNum(on);
      if (on && (r.oneri === null || isNaN(r.oneri))) { r.errors.push('oneri «' + on + '» non è un numero'); r.oneri = null; }
      var ib = get('iban');
      if (ib) {
        r.ibanInput = ib.replace(/\s+/g, '').toUpperCase(); r.iban = ibanOk(ib); r.ibanValid = !!r.iban;
        if (!r.iban) r.warnings.push('IBAN «' + ib + '» non valido: non lo carico (un conto sbagliato è peggio di nessuno)');
      }
      if (r.cedolare === 'si' && r.locatore && looksCompany(r.locatore)) {
        var al0 = 'cedolare «sì» con un locatore che è una società («' + r.locatore + '»): la cedolare secca è solo per le persone fisiche, controlla il contratto';
        r.alerts.push(al0); r.warnings.push(al0);
      }
      var mq = get('mq'); r.mq = rrNum(mq);
      if (mq && !(r.mq > 0 && r.mq <= 2000)) { r.warnings.push('mq «' + mq + '» non letti'); r.mq = null; }
      if (!r.inquilino && r.coinquilini.length) r.warnings.push('co-intestatari senza inquilino: aggiungi il primo intestatario');
      // Chi abita lì ma il contratto non è ancora arrivato (canone, inizio e
      // fine TUTTI vuoti, colonne presenti): l'interno è occupato, le rate
      // aspettano il contratto. Se la tabella NON ha quelle colonne, è un
      // aggiornamento dei contatti (soloContatti), mai un «contratto da
      // caricare». Un dato a metà resta un errore — più facile uno sbaglio.
      var anyContract = !!(get('canone') || get('dal') || get('al'));
      var contractCols = has.canone && has.dal && has.al;
      r.senzaContratto = !!(r.inquilino && !anyContract && contractCols);
      r.soloContatti = !!(r.inquilino && !anyContract && !contractCols);
      if (r.inquilino && anyContract) {
        if (r.canone == null && !r.errors.some(function (e) { return /^canone/.test(e); })) r.errors.push('canone mancante');
        if (!r.dal && !r.errors.some(function (e) { return /^inizio/.test(e); })) r.errors.push('data di inizio mancante');
        if (!r.al && !r.errors.some(function (e) { return /^fine/.test(e); })) r.errors.push('data di fine mancante');
        if (r.dal && r.al && r.al < r.dal) r.errors.push('la fine è prima dell’inizio');
      } else if (!r.inquilino && !tenantCol && (r.dal || r.al || r.pagatoSi || r.registrato || (r.canone != null && unknownCols.some(function (u) { return str(c[u.index]); })))) {
        // Senza la colonna dei nomi la tabella non dice chi abita lì: canone e
        // date che arrivano lo stesso sono un contratto senza intestatario
        // (di solito un titolo che non riconosco). Si ferma la riga, mai un
        // interno «libero» con dentro qualcuno.
        r.errors.push('la tabella non ha la colonna Inquilino: canone e date di questa riga non hanno a chi andare (rinomina in «Inquilino» la colonna coi nomi)');
      } else if (!r.inquilino && (r.dal || r.al || r.pagatoSi)) r.warnings.push('date o pagamento senza inquilino: l’interno resta libero');
      rows.push(r);
    });
    // Una colonna che non riconosco ma porta date o importi: se mancano le
    // colonne del contratto, quelle date/importi sono probabilmente proprio
    // canone e decorrenza scritti con un titolo che non conosco. Si ferma
    // la riga invece di caricare un interno senza contratto.
    unknownCols.forEach(function (u) {
      var vals = rows.filter(function (r) { return r.inquilino; }).map(function (r) { return { r: r, v: str(recs.find(function (x) { return x.line === r.line; }).cells[u.index]) }; }).filter(function (x) { return x.v; });
      var dates = vals.filter(function (x) { return rrDate(x.v); }), nums = vals.filter(function (x) { var n = rrNum(x.v); return !rrDate(x.v) && typeof n === 'number' && n >= 100; });
      u.looks = dates.length && dates.length >= nums.length ? 'date' : nums.length ? 'importi' : '';
      var miss = u.looks === 'date' ? !(has.dal && has.al) : u.looks === 'importi' ? !has.canone : false;
      if (miss) (u.looks === 'date' ? dates : nums).forEach(function (x) {
        x.r.errors.push('la colonna «' + u.name + '» ha ' + (u.looks === 'date' ? 'date' : 'importi') + ' che non so leggere: rinominala come nel modello (' + (u.looks === 'date' ? 'Dal · Al · Pagato il · Registrato il' : 'Canone · Oneri · Deposito') + ') o toglila');
      });
    });
    return { rows: rows, columns: cols, unknown: unknown, unknownColumns: unknownCols, ignored: meta.ignored, errors: [] };
  }
  function rrSlug(s0) { return norm(s0).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x'; }

  // ── Le rate di un contratto, mese di CONTRATTO per mese ──────────────
  // Come il generatore di magic-sign: dal 15/09 al 14/08 sono 11 periodi, e
  // una dodicesima rata ad agosto sarebbe un canone chiesto per un mese che
  // il contratto non ha. L'ultimo periodo parziale si paga in proporzione.
  // La scadenza è il giorno di pagamento del mese, MAI prima dell'inizio
  // del periodo che la rata paga (un contratto dal 15 non è "in ritardo"
  // il 6 per un periodo che non è cominciato). Un contratto dal 29/02 (o
  // dal 31) che finisce sull'anniversario tagliato a fine mese finisce lì:
  // niente tredicesima rata di un giorno.
  function rrSchedule(dal, al, canone, oneri, giorno) {
    var out = [];
    if (!dal || !al || al < dal) return out;
    for (var k = 0; k < 600; k++) {
      var ps = leaseMonth(dal, k);
      if (ps > al) break;
      var nx = leaseMonth(dal, k + 1), full = dayAdd(nx, -1);
      if (nx === al && +nx.slice(8, 10) < +dal.slice(8, 10)) full = al;
      var pe = full < al ? full : al, mm = ps.slice(0, 7);
      var f = pe < full ? (rrDays(ps, pe) + 1) / (rrDays(ps, full) + 1) : 1;
      var canK = round((canone || 0) * f), oneK = oneri ? round(oneri * f) : 0;
      var due = mm + '-' + ('0' + (giorno || 5)).slice(-2);
      if (due < ps) due = ps;
      out.push({ k: k, month: mm, periodFrom: ps, periodTo: pe, due: due, f: f, rent: canK, oneri: oneK, amount: oneK ? round(canK + oneK) : canK });
      if (pe >= al) break;
    }
    return out;
  }
  // La finestra in cui una data di accredito appartiene a una rata: da
  // max(inizio periodo, scadenza − 25 giorni) a min(fine periodo, oggi).
  function rrPaidWindow(e, today) {
    var lo = dayAdd(e.due, -25); if (lo < e.periodFrom) lo = e.periodFrom;
    var hi = e.periodTo < today ? e.periodTo : today;
    return { from: lo, to: hi };
  }

  // ── Il confronto col contratto in archivio ───────────────────────────
  var ALIVE_C = { active: 1, signed: 1, expired: 1, terminated: 1, completed: 1, ended: 1, renewed: 1, closed: 1, pending: 1, signing: 1, sent: 1 };
  function rrAlive(c) { return !!ALIVE_C[cStatus(c)]; }
  function rrPlaceholder(c) { return !!(c && c.contractMissing === true); }
  function rrSigned(c) {
    var s = norm(c && c.signatureStatus);
    return !!(c && (c.tenantSignature || c.landlordSignature || ['complete', 'tenant_signed', 'landlord_signed', 'partial', 'signed'].indexOf(s) >= 0));
  }
  function rrNameKey(v) { return str(v).replace(/\s+/g, ' ').toLowerCase(); }
  function rrTokens(v) { return norm(v).replace(/[^a-z0-9ı]+/g, ' ').trim().split(' ').filter(Boolean).sort(); }
  // La stessa persona scritta in un altro modo: «Rossi Mario» = «Mario
  // Rossi», «Ayşe» = «Ayse», «Ivan Test» dentro «Ivan Test Petrov».
  function rrSamePerson(a, b) {
    var x = rrTokens(a), y = rrTokens(b);
    if (!x.length || !y.length) return false;
    if (x.join(' ') === y.join(' ')) return true;
    var small = x.length <= y.length ? x : y, big = small === x ? y : x;
    return small.length >= 2 && small.every(function (t) { return big.indexOf(t) >= 0; });
  }
  function rrPeopleOf(c) {
    return [str(c.tenantName)].concat(list(c.coTenants).map(function (t) { return str(t && (t.name || t.fullName)); })).filter(Boolean);
  }
  function rrPhoneSame(a, b) {
    var pa = phoneOf(a), pb = phoneOf(b);
    if (pa && pb && pa.e164 && pb.e164) return pa.e164 === pb.e164;
    var da = str(a).replace(/\D/g, '').replace(/^00/, ''), db = str(b).replace(/\D/g, '').replace(/^00/, '');
    return da === db || da === '39' + db || db === '39' + da;
  }
  var RR_FIELDS = [
    { f: 'tenantName', label: 'nome dell’inquilino', terms: true },
    { f: 'coTenants', label: 'co-intestatari', terms: true },
    { f: 'rent', label: 'canone', terms: true, rates: true },
    { f: 'oneriQuota', label: 'oneri', terms: true, rates: true },
    { f: 'endDate', label: 'fine del contratto', terms: true, rates: true },
    { f: 'deposit', label: 'deposito', terms: true },
    { f: 'type', label: 'tipo di contratto', terms: true },
    { f: 'cedolareSecca', label: 'cedolare secca', terms: true },
    { f: 'landlordName', label: 'locatore', terms: true },
    { f: 'landlordIban', label: 'IBAN del locatore' },
    { f: 'tenantPhone', label: 'telefono' },
    { f: 'tenantEmail', label: 'email' }
  ];
  function rrFactsOfContract(c) {
    return { tenantName: str(c.tenantName), coTenants: list(c.coTenants).map(function (t) { return str(t && (t.name || t.fullName)); }).filter(Boolean),
      rent: contractRent(c), oneriQuota: money(c.oneriQuota), endDate: day(c.endDate), deposit: money(c.deposit), type: str(c.type).toLowerCase(),
      cedolareSecca: cedolareDeclared(c), landlordName: str(c.landlordName), landlordIban: str(c.landlordIban).replace(/\s+/g, '').toUpperCase(),
      tenantPhone: str(c.tenantPhone), tenantEmail: str(c.tenantEmail).toLowerCase() };
  }
  function rrFactsOfRow(r) {
    return { tenantName: r.inquilino, coTenants: r.coinquilini || [], rent: r.canone, oneriQuota: r.oneri, endDate: r.al, deposit: r.deposito, type: r.tipo,
      cedolareSecca: r.cedolare === 'si' ? true : r.cedolare === 'no' ? false : null, landlordName: r.locatore, landlordIban: r.iban,
      tenantPhone: r.telefono, tenantEmail: r.email };
  }
  function rrEmpty(v) { return v == null || v === '' || (Array.isArray(v) && !v.length); }
  function rrSame(f, a, b) {
    if (f === 'rent' || f === 'oneriQuota' || f === 'deposit') return Math.abs(a - b) < 0.005;
    if (f === 'tenantName') return rrNameKey(a) === rrNameKey(b);
    if (f === 'coTenants') return a.map(rrNameKey).sort().join('|') === b.map(rrNameKey).sort().join('|');
    if (f === 'landlordName') return norm(a).replace(/[^a-z0-9]+/g, '') === norm(b).replace(/[^a-z0-9]+/g, '');
    if (f === 'tenantPhone') return rrPhoneSame(a, b);
    return a === b;
  }
  // Il valore nella forma del documento contracts/<id>.
  function rrWrite(f, v) {
    if (f === 'coTenants') return v.map(function (n) { return { name: n }; });
    if (f === 'cedolareSecca') return v ? 'si' : 'no';
    return v;
  }
  function rrEur(v) {
    var n = round(v), i = Math.floor(n), c = Math.round((n - i) * 100);
    return '€' + String(i).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (c ? ',' + ('0' + c).slice(-2) : '');
  }
  function rrShow(f, v) {
    if (rrEmpty(v)) return '';
    if (f === 'rent' || f === 'oneriQuota' || f === 'deposit') return rrEur(v);
    if (f === 'endDate') return rrIt(v);
    if (f === 'cedolareSecca') return v ? 'sì' : 'no';
    if (f === 'coTenants') return v.join(', ');
    if (f === 'landlordIban') return ibanMask(v);
    return String(v);
  }

  // Le rate in archivio di UN contratto rilette coi termini dati: quali
  // cambierebbero importo, quali scadono prima del loro periodo, quali
  // cadono dopo una fine anticipata. Mai una rata pagata, segnalata o in
  // corso (lo stato viene da BOOM_RENT, come in tutto il Palazzo).
  function rrReconcile(ctx, pid, cid, terms) {
    var byMonth = Object.create(null);
    rrSchedule(terms.start, terms.end, terms.rent, terms.oneri, terms.day).forEach(function (e) { byMonth[e.month] = e; });
    var res = { updates: [], cancels: [], skipped: [], amount: 0, due: 0, period: 0 };
    if (!terms.start || !terms.end) return res;
    (ctx.paymentsByProperty[pid] || []).forEach(function (x) {
      if (x.contractId !== cid || !x.isRent || (x.state !== 'due' && x.state !== 'overdue')) return;
      var p = x.payment || {};
      // Solo le rate nate dalla presa in carico (stesso calendario): quelle
      // del portale o di magic-sign hanno le loro regole, si correggono da
      // Gestisci canoni.
      if ((Number(p.installmentMonths) || 1) > 1 || !(str(p.source) === 'palazzo-import' || day(p.periodFrom))) { res.skipped.push(x); return; }
      var e = byMonth[x.month], from = day(p.periodFrom);
      if (!e) {
        if (terms.end && (from || x.month + '-01') > terms.end) res.cancels.push(x); else res.skipped.push(x);
        return;
      }
      if (from && from !== e.periodFrom) { res.skipped.push(x); return; }
      var data = {}, why = [];
      if (x.amount == null || Math.abs(x.amount - e.amount) >= 0.005) { data.amount = e.amount; why.push('amount'); }
      var split = money(p.rentAmount) != null || money(p.oneriAmount) != null;
      if (e.oneri || split || data.amount != null) {
        if (money(p.rentAmount) !== e.rent || data.amount != null) data.rentAmount = e.rent;
        if (money(p.oneriAmount) !== e.oneri || data.amount != null) data.oneriAmount = e.oneri;
      }
      if (from && day(p.periodTo) && day(p.periodTo) !== e.periodTo) { data.periodTo = e.periodTo; why.push('period'); }
      if (from && !!p.prorated !== (e.f < 1)) data.prorated = e.f < 1;
      if (from && x.dueDate && x.dueDate < from) { data.dueDate = e.due; why.push('due'); }
      if (!why.length) return;
      if (why.indexOf('amount') >= 0) res.amount++;
      if (why.indexOf('due') >= 0) res.due++;
      if (why.indexOf('period') >= 0) res.period++;
      res.updates.push({ x: x, data: data, why: why });
    });
    return res;
  }

  // Quale interno in archivio è questa riga: stessa chiave d'interno
  // («07» = «7»), stessa scala. Se la tabella non dice la scala e c'è UN
  // solo candidato, è lui; se ce n'è più d'uno, la riga si ferma (meglio
  // una domanda che un contratto sull'interno sbagliato).
  function rrMatch(existing, r) {
    var uk = unitKey(r.interno), sk = scalaKey(r.scala);
    var same = existing.filter(function (p) { return unitKey(unitOf(p)) === uk; });
    if (!same.length) return { prop: null };
    var exact = same.filter(function (p) { return scalaKey(scalaOf(p)) === sk; });
    if (exact.length === 1) return { prop: exact[0] };
    if (exact.length > 1) return { error: 'in archivio ci sono ' + exact.length + ' interni ' + r.interno + (sk ? ' nella scala ' + r.scala.toUpperCase() : '') + ': correggi l’archivio prima di caricare' };
    if (sk) {
      var bare = same.filter(function (p) { return !scalaKey(scalaOf(p)); });
      if (bare.length === 1) return { prop: bare[0] };
      if (bare.length > 1) return { error: 'in archivio ci sono ' + bare.length + ' interni ' + r.interno + ' senza scala: correggi l’archivio prima di caricare' };
      return { prop: null };
    }
    if (same.length === 1) return { prop: same[0] };
    return { error: 'in archivio ci sono ' + same.length + ' interni ' + r.interno + ' (scala ' + rrList(same.map(function (p) { return scalaOf(p) || '—'; })) + '): aggiungi la colonna Scala' };
  }

  // opts: { address, ownerId, ownerName, gestioneDal (YYYY-MM), by, applyDiffs, listings }
  function planImport(rows, ctx, opts) {
    opts = opts || {};
    var gd = monthOf(opts.gestioneDal) || ctx.month, address = str(opts.address), skey = streetKey(address), apply = opts.applyDiffs === true;
    var today = ctx.today, nowIso = '';
    try { var nd = ctx.now instanceof Date ? ctx.now : new Date(ctx.now); if (isFinite(nd.getTime())) nowIso = nd.toISOString(); } catch (_) {}
    var out = { properties: [], contracts: [], payments: [], paymentUpdates: [], skipped: [], errors: [], notes: [], messages: [], rows: [], diffs: [],
      paidMarks: [], overdueNow: [], listingLinks: [], accounts: [], unknownColumns: [], ignoredRows: [], applyDiffs: apply,
      counts: { create: 0, update: 0, same: 0, contracts: 0, contractUpdates: 0, missing: 0, payments: 0, paid: 0, diffs: 0, diffsLocked: 0, diffsApplicable: 0,
        paymentUpdates: 0, paymentCancels: 0, overdueNow: 0, rowErrors: 0, contacts: 0 } };
    var meta0 = (rows || []).map(function (r) { return r && r.meta; }).filter(Boolean)[0] || null;
    if (meta0) { out.unknownColumns = (meta0.unknownColumns || []).slice(); out.ignoredRows = (meta0.ignored || []).slice(); }
    if (!skey) { out.errors.push('indirizzo'); return out; }
    if (!str(opts.ownerId)) out.errors.push('proprietaria');
    var existing = ctx.properties.filter(function (p) { return streetKey(p.address) === skey; });
    var label = titleCase(streetKey(address));
    // Gli annunci li passa chi chiama (opts.listings: il contesto del
    // Palazzo non li espone tutti), oppure il contesto se un giorno li porta.
    var listings = list(opts.listings).length ? list(opts.listings) : list(ctx.listings).length ? list(ctx.listings)
      : ctx.listingById ? Object.keys(ctx.listingById).map(function (k) { return ctx.listingById[k]; }) : [];
    var linkedListing = Object.create(null);
    ctx.properties.forEach(function (p) { if (str(p.listingId)) linkedListing[str(p.listingId)] = str(p.id); });
    (rows || []).forEach(function (r) {
      var info = { line: r.line, interno: r.interno, unitKey: unitKey(r.interno), scala: r.scala || '', propertyId: '', exists: false, existsAs: '', action: '', contractId: '',
        tenant: r.inquilino || '', coTenants: (r.coinquilini || []).slice(), phone: r.telefono || '', email: r.email || '', canone: r.canone, oneri: r.oneri,
        dal: r.dal || '', al: r.al || '', tipo: r.tipo || '', cedolare: r.cedolare || '', deposito: r.deposito, locatore: r.locatore || '',
        iban: r.iban || '', ibanInput: r.ibanInput || '', ibanValid: r.ibanValid == null ? null : r.ibanValid, ibanMasked: ibanMask(r.iban || r.ibanInput || ''),
        floor: r.piano || '', floorMissing: false, gestioneDal: '', payments: 0, paid: false, paidMarks: [], overdue: 0,
        diffs: [], notes: [], warnings: (r.warnings || []).slice(), alerts: (r.alerts || []).slice(), errors: [], listing: null };
      out.rows.push(info);
      var rowErr = function (msg) { info.errors.push(msg); info.action = 'error'; };
      // Una riga che la lettura ha già fermato conta come ogni altra riga
      // ferma: plan.errors e counts.rowErrors dicono TUTTE le righe da
      // correggere (una regola sola per bloccare il carico).
      if (r.errors && r.errors.length) { info.action = 'error'; info.errors = r.errors.slice(); out.errors.push('row:' + r.line); out.skipped.push(r.line); out.counts.rowErrors++; return; }
      var has = (r.meta && r.meta.has) || null;
      // La tabella non ha la colonna dei nomi: non dice chi abita lì, quindi
      // non dice nemmeno che l'interno è libero.
      var noTenantCol = !!(has && !(has.inquilino || has.cognome));
      var mt = rrMatch(existing, r);
      if (mt.error) { rowErr(mt.error); }
      var prop = mt.prop || null;
      var pid = prop ? str(prop.id) : ('plz_' + rrSlug(skey) + (r.scala ? '_s' + rrSlug(scalaKey(r.scala) || r.scala) : '') + '_' + rrSlug(info.unitKey || r.interno));
      if (!prop && ctx.properties.some(function (p) { return str(p.id) === pid; })) pid += '_b';
      info.propertyId = pid; info.exists = !!prop;
      if (prop) info.existsAs = str(prop.name) || str(prop.address);
      // Gestione BOOM dal: quella dell'interno, se già scritta, non si
      // riscrive MAI (completare un interno a novembre non toglie ottobre).
      var unitGd = (prop && monthOf(prop.gestioneDal)) || gd;
      info.gestioneDal = unitGd;
      info.gestioneKept = !!(prop && monthOf(prop.gestioneDal) && monthOf(prop.gestioneDal) !== gd);
      info.floorMissing = !(r.piano && parseFloor(r.piano)) && !(prop && floorOf(prop));
      // Lo si dice quando la tabella ha la colonna Piano (la cella vuota è
      // una dimenticanza) o quando l'interno nasce ora; una tabella di soli
      // telefoni non deve rifare l'elenco dei piani mancanti.
      info.floorAsk = info.floorMissing && (!prop || !has || has.piano);
      if (!r.piano && info.floorAsk) info.warnings.push('piano non indicato: l’interno resta fuori dalla facciata finché non lo indichi');
      var live = r.inquilino && (r.senzaContratto || r.soloContatti || r.al >= monthStart(unitGd));
      // Occupato si scrive solo se ci sarà un contratto (o il segnaposto);
      // libero solo se la tabella lo dice. Una riga di soli contatti per un
      // interno nuovo, o una tabella senza nomi, non dicono né l'uno né l'altro.
      var occ = r.inquilino && (r.senzaContratto || (!r.soloContatti && r.al >= monthStart(unitGd))) ? 'rented' : (r.soloContatti || noTenantCol) ? '' : 'available';
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
      } else {
        // Mai un canone inventato: senza canone l'interno nasce senza.
        pdata = { name: label + ' int. ' + r.interno, address: address, interno: r.interno, scala: r.scala, floor: r.piano, ownerId: opts.ownerId, ownerName: str(opts.ownerName),
          propertyType: 'apartment', gestioneDal: gd, source: 'palazzo-import' };
        if (occ) pdata.availabilityStatus = occ;
        if (r.canone != null) pdata.rent = r.canone;
        if (r.pod) pdata.pod = r.pod;
        if (r.pdr) pdata.pdr = r.pdr;
        if (r.mq) pdata.sqm = r.mq;
      }
      // L'annuncio allo stesso civico e interno: si aggancia (solo se
      // l'interno non ne ha uno), lo stato dell'annuncio non si tocca.
      if (listings.length) {
        var cand = listings.filter(function (l) {
          return streetKey(l.address) === skey && unitKey(unitOf(l)) === info.unitKey && (!str(l.propertyId) || str(l.propertyId) === pid) &&
            (!linkedListing[str(l.id)] || linkedListing[str(l.id)] === pid);
        });
        if (cand.length === 1 && !(prop && str(prop.listingId))) {
          var l0 = cand[0], ls = norm(l0.status || l0.availabilityStatus), pub = ['available', 'waitlist', 'negotiation'].indexOf(ls) >= 0;
          pdata.listingId = str(l0.id);
          info.listing = { id: str(l0.id), name: str(l0.name || l0.title), status: ls, published: pub };
          info.notes.push('annuncio «' + (str(l0.name || l0.title) || l0.id) + '» agganciato all’interno');
          // In lista d'attesa (con la data in cui si libera) è il pre-blocco:
          // va bene. «Disponibile» su un interno abitato porta lead a vuoto.
          if (live && (ls === 'available' || ls === 'negotiation')) info.alerts.push('l’annuncio «' + (str(l0.name || l0.title) || l0.id) + '» è ancora pubblicato come disponibile ma l’interno risulta occupato: dal catalogo toglilo, o mettilo in lista d’attesa con la data in cui si libera');
          out.listingLinks.push({ interno: r.interno, propertyId: pid, listingId: str(l0.id), status: ls, published: pub, occupied: !!live });
        }
      }
      var plan = { contracts: [], payments: [], paymentUpdates: [], diffs: [], paidMarks: [], overdue: [] };
      var pcs = prop ? (ctx.contractsByProperty[pid] || []) : [];
      var aliveC = pcs.filter(rrAlive);
      var ph = aliveC.find(function (c) { return rrPlaceholder(c) && !day(c.startDate); }) || null;
      // Il contratto di OGGI dell'interno (per i contatti): quello in corso,
      // altrimenti il segnaposto, altrimenti il prossimo in arrivo.
      var currentOf = function () {
        var cov = aliveC.filter(function (c) { var s = day(c.startDate), e = effectiveEnd(c); return !rrPlaceholder(c) && s && s <= today && (!e || e >= today); });
        if (cov.length > 1) return { ambiguous: cov };
        if (cov.length) return { c: cov[0] };
        if (ph) return { c: ph };
        var nxt = aliveC.filter(function (c) { return !rrPlaceholder(c) && day(c.startDate) > today; }).sort(function (a, b) { return day(a.startDate).localeCompare(day(b.startDate)); })[0];
        return nxt ? { c: nxt } : {};
      };
      var tenantOf = function (c) { return str(c.tenantName) || 'un altro inquilino'; };

      // Il confronto riga ⇄ contratto in archivio: ciò che manca si riempie,
      // ciò che è diverso si DICE (e si scrive solo con applyDiffs).
      var compare = function (c, opt) {
        opt = opt || {};
        var a = rrFactsOfContract(c), b = rrFactsOfRow(r), fill = {}, diffs = [];
        var locked = rrSigned(c), terminated = cStatus(c) === 'terminated';
        var person = !opt.nameCheck || !r.inquilino || !a.tenantName || rrPeopleOf(c).some(function (n) { return rrSamePerson(n, r.inquilino); });
        // Una persona DIVERSA su un contratto con le date, senza date in
        // tabella a dire che è lo stesso contratto: può essere un cambio
        // d'inquilino. Niente da qui, nemmeno con applyDiffs (il segnaposto
        // invece non ha date né soldi: lo si può intestare).
        var lockPerson = !person && !rrPlaceholder(c);
        RR_FIELDS.forEach(function (d) {
          var to = b[d.f], from = a[d.f];
          if (rrEmpty(to)) return;
          if (opt.only && opt.only.indexOf(d.f) < 0) return;
          if (d.f === 'endDate' && terminated) return;
          // Anche un campo VUOTO di un contratto firmato è un termine di quel
          // contratto: riempirlo da qui cambierebbe l'impronta delle firme
          // (la controfirma risponderebbe 409) o i dati dopo la firma. Si
          // dice, bloccato, e si corregge dal contratto.
          if (rrEmpty(from) && d.terms && locked) {
            diffs.push({ interno: r.interno, line: r.line, contractId: str(c.id), field: d.f, label: d.label, from: from, to: to,
              fromText: 'non indicato', toText: rrShow(d.f, to), locked: true, lockReason: lockPerson ? 'persona' : 'firmato', rates: 0, fill: true });
            return;
          }
          if (rrEmpty(from)) { fill[d.f] = rrWrite(d.f, to); return; }
          if (rrSame(d.f, from, to)) return;
          // Un co-intestatario con dati di firma non si riscrive da qui.
          var coLocked = d.f === 'coTenants' && list(c.coTenants).some(function (t) { return t && Object.keys(t).some(function (k) { return k !== 'name' && t[k] != null && t[k] !== ''; }); });
          var why = lockPerson ? 'persona' : d.terms && locked ? 'firmato' : coLocked ? 'cofirmato' : '';
          diffs.push({ interno: r.interno, line: r.line, contractId: str(c.id), field: d.f, label: d.label, from: from, to: to,
            fromText: rrShow(d.f, from), toText: rrShow(d.f, to), locked: !!why, lockReason: why, rates: 0 });
        });
        return { fill: fill, diffs: diffs, person: person, lockPerson: lockPerson, locked: locked };
      };
      // Scrive sul contratto esistente: i riempimenti (se è la stessa
      // persona o se l'operatore lo chiede) e le differenze con applyDiffs.
      var updateExisting = function (c, cmp, extra) {
        var data = {};
        if (cmp.person || (apply && !cmp.lockPerson)) Object.keys(cmp.fill).forEach(function (k) { data[k] = cmp.fill[k]; });
        Object.keys(extra || {}).forEach(function (k) { data[k] = extra[k]; });
        var applied = apply ? cmp.diffs.filter(function (d) { return !d.locked; }) : [];
        applied.forEach(function (d) { data[d.field] = rrWrite(d.field, d.to); });
        if (applied.some(function (d) { return d.field === 'endDate'; })) {
          var st = cStatus(c);
          if (st === 'active' && r.al < today) data.status = 'expired';
          else if (st === 'expired' && r.al >= today) data.status = 'active';
        }
        // I termini con cui si rileggono e si generano le rate.
        var a = rrFactsOfContract(c);
        var pick = function (f) { return f in data ? data[f] : a[f]; };
        var terms = { start: day(c.startDate) || r.dal, end: data.endDate || (cStatus(c) === 'terminated' ? effectiveEnd(c) : a.endDate),
          rent: pick('rent'), oneri: pick('oneriQuota'), day: parseInt(c.paymentDay, 10) || r.giorno };
        // Per l'anteprima: che cosa cambierebbe nelle rate se si applicasse.
        var full = {};
        cmp.diffs.filter(function (d) { return !d.locked; }).forEach(function (d) { full[d.field] = d.to; });
        var tAll = { start: terms.start, end: full.endDate || terms.end, rent: full.rent != null ? full.rent : terms.rent,
          oneri: full.oneriQuota != null ? full.oneriQuota : terms.oneri, day: terms.day };
        var rec = rrReconcile(ctx, pid, str(c.id), tAll);
        cmp.diffs.forEach(function (d) {
          if (d.field === 'rent' || d.field === 'oneriQuota') d.rates = rec.amount;
          if (d.field === 'endDate') d.rates = rec.cancels.length + rec.period;
        });
        // Gli oneri (o il canone) arrivati DOPO le rate: il contratto si
        // riempie, le rate da pagare cambierebbero importo — si dice.
        ['oneriQuota', 'rent'].forEach(function (f) {
          if (cmp.fill[f] != null && rec.amount && !cmp.diffs.some(function (d) { return d.field === f; })) {
            cmp.diffs.push({ interno: r.interno, line: r.line, contractId: str(c.id), field: f, label: f === 'rent' ? 'canone nelle rate' : 'oneri nelle rate', from: null, to: cmp.fill[f],
              fromText: f === 'rent' ? 'rate senza canone' : 'rate col solo canone', toText: rrShow(f, cmp.fill[f]), locked: false, rates: rec.amount, fill: true });
          }
        });
        if (rec.due) cmp.diffs.push({ interno: r.interno, line: r.line, contractId: str(c.id), field: 'dueDate', label: 'scadenza delle rate', from: null, to: null,
          fromText: rrPlural(rec.due, 'rata scade', 'rate scadono') + ' prima dell’inizio del periodo che paga', toText: 'all’inizio del periodo', locked: false, rates: rec.due });
        if (apply) {
          // Gli importi cambiano SOLO se cambia ciò che li fa (canone, oneri,
          // fine): una correzione di telefono non riscrive una rata ritoccata
          // a mano. La scadenza prima del periodo si sistema sempre.
          var ratesChange = ['rent', 'oneriQuota', 'endDate'].some(function (f) { return f in data; });
          var recA = rrReconcile(ctx, pid, str(c.id), terms);
          recA.updates.forEach(function (u) {
            var d0 = u.data;
            if (!ratesChange) {
              if (u.why.indexOf('due') < 0) return;
              d0 = { dueDate: u.data.dueDate };
            }
            plan.paymentUpdates.push({ id: u.x.id, interno: r.interno, contractId: str(c.id), month: u.x.month, data: d0, why: ratesChange ? u.why : ['due'],
              expect: { status: str(u.x.payment && u.x.payment.status), amount: u.x.amount } });
          });
          if (ratesChange) recA.cancels.forEach(function (x) {
            plan.paymentUpdates.push({ id: x.id, interno: r.interno, contractId: str(c.id), month: x.month, cancel: true,
              data: { status: 'cancelled', cancelledAt: nowIso, cancelledReason: 'fine del contratto anticipata (tabella del palazzo)' },
              expect: { status: str(x.payment && x.payment.status), amount: x.amount } });
          });
          if (ratesChange && recA.skipped.length) info.notes.push(rrPlural(recA.skipped.length, 'rata da pagare non segue', 'rate da pagare non seguono') + ' il calendario della presa in carico: ' + (recA.skipped.length === 1 ? 'correggila' : 'correggile') + ' da Gestisci canoni');
        } else {
          // Gli oneri (o il canone) entrano nel contratto anche senza
          // applyDiffs (riempiono un campo vuoto): le rate da pagare nate dal
          // portal o da magic-sign (altro calendario) restano com'erano, e lo
          // si dice — l'avviso che la vista legge ('oneri:') e la riga.
          var filledNow = ['oneriQuota', 'rent'].filter(function (f) { return f in data && cmp.fill[f] != null; });
          var oneriNow = filledNow.indexOf('oneriQuota') >= 0;
          if (oneriNow && (cmp.diffs.some(function (d) { return d.field === 'oneriQuota' && d.fill && !d.locked; }) || rec.skipped.length)) out.notes.push('oneri:' + r.interno);
          if (filledNow.length && rec.skipped.length) {
            var nk = rec.skipped.length;
            info.notes.push((oneriNow ? 'gli oneri (' + rrEur(cmp.fill.oneriQuota) + ') entrano' : 'il canone (' + rrEur(cmp.fill.rent) + ') entra') + ' nel contratto, ma ' +
              rrPlural(nk, 'rata da pagare non segue', 'rate da pagare non seguono') + ' il calendario della presa in carico e da qui non ' + (nk === 1 ? 'cambia' : 'cambiano') + ': ' +
              (nk === 1 ? 'correggila' : 'correggile') + ' da Gestisci canoni');
          }
        }
        if (Object.keys(data).length) plan.contracts.push({ id: str(c.id), exists: true, data: data, interno: r.interno });
        plan.diffs = plan.diffs.concat(cmp.diffs);
        if (cmp.lockPerson) info.notes.push('in archivio l’interno è di ' + tenantOf(c) + ', la tabella dice ' + r.inquilino + ': non scrivo niente sul contratto di un’altra persona. Se è un cambio d’inquilino chiudi prima quel contratto; se è lo stesso nome scritto diverso, correggilo con una riga completa (canone, dal, al)');
        else if (!cmp.person && !apply) info.notes.push('il contratto da caricare è a nome di ' + tenantOf(c) + ', la tabella dice ' + r.inquilino + ': se è la stessa persona applica le differenze');
        return terms;
      };
      // Le rate nuove di un contratto: solo i mesi che QUEL contratto non
      // ha ancora (mai quelle di un altro contratto sullo stesso interno).
      var newRates = function (cid, terms, c) {
        var have = Object.create(null), every = Number(c && c.installmentMonths) || 1;
        // Una rata copre i mesi da month a coversTo (trimestrale: tre): nessun
        // mese che una rata in archivio paga già riceve una rata mensile.
        (ctx.paymentsByProperty[pid] || []).forEach(function (x) {
          if (x.contractId !== cid || !x.month) return;
          var im = Number(x.payment && x.payment.installmentMonths) || 1;
          if (x.isRent && im > every) every = im;
          var last = x.coversTo && x.coversTo > x.month ? x.coversTo : x.month;
          for (var m = x.month, g = 0; m && m <= last && g < 24; m = monthAdd(m, 1), g++) have[m] = 1;
        });
        // Un contratto a rate ogni N mesi ha un altro calendario: la presa in
        // carico genera solo rate mensili, quindi qui non ne nasce nessuna.
        if (every > 1) {
          info.notes.push('il contratto ha rate ogni ' + every + ' mesi: le rate mancanti si generano da Gestisci canoni');
          if (r.pagato) info.warnings.push('pagamento del ' + rrIt(r.pagato) + ': con rate ogni ' + every + ' mesi non lo segno da qui, registra l’incasso dal Palazzo');
          return;
        }
        var sched = rrSchedule(terms.start, terms.end, terms.rent, terms.oneri, terms.day);
        var made = [];
        sched.forEach(function (e) {
          if (e.month < unitGd || have[e.month]) return;
          var pay = { contractId: cid, propertyId: pid, type: 'rent', amount: e.amount, month: e.month, coversTo: e.month, installmentMonths: 1, dueDate: e.due,
            periodFrom: e.periodFrom, periodTo: e.periodTo, status: 'pending', autoGenerated: true, source: 'palazzo-import' };
          // Gli oneri fissi si pagano col canone (art. 5 del contratto): la
          // rata è il TOTALE che l'inquilino versa, con le due voci accanto.
          if (e.oneri) { pay.rentAmount = e.rent; pay.oneriAmount = e.oneri; }
          if (e.f < 1) pay.prorated = true;
          made.push({ id: 'pay_' + cid + '_' + e.month, data: pay, interno: r.interno, e: e });
        });
        // «Pagato il» vale per la PRIMA rata della gestione, e solo se la data
        // cade nella sua finestra: una data sola non dice di quale mese è un
        // pagamento tardivo (il 20/11 può essere ottobre in ritardo).
        if (r.pagato) {
          var inWin = function (x) { var w = rrPaidWindow(x.e, today); return r.pagato >= w.from && r.pagato <= w.to; };
          var hit = made.length && inWin(made[0]) ? made[0] : null;
          var later = !hit && made.slice(1).find(inWin);
          if (hit) {
            Object.assign(hit.data, { status: 'paid', paidDate: r.pagato, paidVia: 'dichiarato', paidEvidence: 'conferma-proprietaria', paidSource: 'tabella della proprietaria' });
            if (nowIso) hit.data.paidRecordedAt = nowIso;
            if (str(opts.by)) hit.data.paidRecordedBy = str(opts.by);
            plan.paidMarks.push({ interno: r.interno, paymentId: hit.id, month: hit.e.month, paidDate: r.pagato, amount: hit.data.amount });
            info.notes.push('pagamento del ' + rrIt(r.pagato) + ' segnato sulla rata di ' + rrMonth(hit.e.month));
          } else {
            var old = (ctx.paymentsByProperty[pid] || []).filter(function (x) { return x.contractId === cid && x.isRent; }).find(function (x) {
              var p = x.payment || {}, from = day(p.periodFrom) || (x.month + '-01'), to = day(p.periodTo) || monthEnd(x.month);
              var w = rrPaidWindow({ due: x.dueDate || from, periodFrom: from, periodTo: to }, today); return r.pagato >= w.from && r.pagato <= w.to;
            });
            // La stessa tabella ricaricata: la rata è già pagata, niente da dire.
            if (old && old.state === 'paid') { /* già registrato */ }
            else if (later) info.warnings.push('pagamento del ' + rrIt(r.pagato) + ': cade nella rata di ' + rrMonth(later.e.month) + ', ma «Pagato il» vale per la prima rata (' + rrMonth(made[0].e.month) + '): nessuna rata segnata, registra l’incasso dal Palazzo');
            else if (r.pagato > today) info.warnings.push('pagato il ' + rrIt(r.pagato) + ': è una data futura, nessuna rata segnata pagata');
            else if (old) info.warnings.push('pagamento del ' + rrIt(r.pagato) + ': la rata di ' + rrMonth(old.month) + ' è già in archivio, registra l’incasso dal Palazzo (Registra incasso)');
            else if (made.length && r.pagato < rrPaidWindow(made[0].e, today).from) info.warnings.push('pagamento del ' + rrIt(r.pagato) + ': è prima della rata di ' + rrMonth(made[0].e.month) + ' (si paga dal ' + rrIt(rrPaidWindow(made[0].e, today).from) + '), nessuna rata segnata pagata');
            else info.warnings.push('pagamento del ' + rrIt(r.pagato) + ': non cade nel periodo di nessuna rata, nessuna rata segnata pagata');
          }
        }
        made.forEach(function (x) {
          if (x.data.status === 'pending' && x.data.dueDate < today) plan.overdue.push({ interno: r.interno, paymentId: x.id, month: x.e.month, dueDate: x.data.dueDate, amount: x.data.amount });
          plan.payments.push({ id: x.id, data: x.data, interno: r.interno });
        });
      };

      if (!info.errors.length) {
        if (!r.inquilino) {
          var cur0 = currentOf();
          var contactsOnly = noTenantCol && (r.telefono || r.email);
          if (contactsOnly) {
            if (cur0.ambiguous) info.warnings.push('in archivio l’interno ha più contratti in corso: i contatti non li scrivo, sistemali dal contratto');
            else if (cur0.c) { info.action = 'contacts'; info.contractId = str(cur0.c.id); updateExisting(cur0.c, compare(cur0.c, { only: ['tenantPhone', 'tenantEmail'] })); }
            else info.warnings.push('nessun contratto in corso per questo interno: telefono ed email non hanno dove andare');
          } else if (noTenantCol) {
            // «Interno;Piano», «Interno;POD;PDR»: si aggiornano i dati
            // dell'interno, l'occupazione resta quella che è.
            info.action = !prop || Object.keys(pdata).length ? 'property' : 'none';
          } else {
            info.action = 'free';
            if (has && has.inquilino && cur0.c && !rrPlaceholder(cur0.c) && day(cur0.c.startDate) <= today) {
              var e0 = effectiveEnd(cur0.c);
              info.warnings.push('la tabella lo dà libero, ma in archivio c’è il contratto di ' + tenantOf(cur0.c) + (e0 ? ' fino al ' + rrIt(e0) : '') + ': da qui non lo chiudo');
            }
          }
        } else if (r.senzaContratto || r.soloContatti) {
          var cur = currentOf();
          if (r.pagato) info.warnings.push('pagamento del ' + rrIt(r.pagato) + ': senza canone e date in tabella non lo segno su nessuna rata, registra l’incasso dal Palazzo');
          if (cur.ambiguous) rowErr('in archivio l’interno ha ' + cur.ambiguous.length + ' contratti in corso (' + rrList(cur.ambiguous.map(tenantOf)) + '): chiudi quello vecchio prima di caricare');
          else if (cur.c) {
            info.action = 'contacts'; info.contractId = str(cur.c.id);
            updateExisting(cur.c, compare(cur.c, { nameCheck: true }));
          } else if (r.soloContatti) {
            info.action = 'none';
            info.warnings.push('nessun contratto in archivio per questo interno: la tabella non ha le colonne Canone, Dal e Al, quindi non lo creo');
          } else {
            var pcid = 'c_' + pid + '_da-caricare', pex = {};
            if (r.coinquilini.length) pex.coTenants = r.coinquilini.map(function (n) { return { name: n }; });
            if (r.oneri != null) pex.oneriQuota = r.oneri;
            if (r.locatore) pex.landlordName = r.locatore;
            if (r.iban) pex.landlordIban = r.iban;
            plan.contracts.push({ id: pcid, data: Object.assign({ propertyId: pid, status: 'active', contractMissing: true, tenantName: r.inquilino, tenantPhone: r.telefono, tenantEmail: r.email,
              type: r.tipo, source: 'palazzo-import' }, pex), interno: r.interno });
            info.action = 'placeholder-new'; info.contractId = pcid;
            info.warnings.push('contratto da caricare: l’interno risulta occupato, le rate partono quando arrivano canone e date');
          }
        } else {
          var dup = aliveC.find(function (c) { return !rrPlaceholder(c) && day(c.startDate) === r.dal; });
          var overlap = aliveC.filter(function (c) {
            if (rrPlaceholder(c) || c === dup) return false;
            var s = day(c.startDate), e = effectiveEnd(c);
            return s && s <= r.al && (!e || e >= r.dal);
          });
          if (dup) {
            info.action = 'contract-same'; info.contractId = str(dup.id);
            var cmpD = compare(dup);
            var tD = updateExisting(dup, cmpD);
            if (plan.contracts.length || plan.diffs.length) info.action = 'contract-update';
            newRates(str(dup.id), tD, dup);
          } else if (overlap.length) {
            var o = overlap[0], os = day(o.startDate), oe = effectiveEnd(o);
            var same = rrPeopleOf(o).some(function (n) { return rrSamePerson(n, r.inquilino); });
            if (same) rowErr('decorrenza diversa (' + rrIt(r.dal) + ' in tabella, ' + rrIt(os) + ' in archivio): è un nuovo contratto? chiudi prima il vecchio, poi ricarica la riga');
            else rowErr('c’è già il contratto di ' + tenantOf(o) + ' (dal ' + rrIt(os) + (oe ? ' al ' + rrIt(oe) : '') + '): chiudilo prima con la data di uscita, poi ricarica la riga');
          } else if (ph) {
            // Il segnaposto «contratto da caricare» è LO STESSO contratto che
            // arriva ora: si completa, non se ne crea un secondo.
            var cmpP = compare(ph, { nameCheck: true });
            info.contractId = str(ph.id);
            if (!cmpP.person && !apply) {
              info.action = 'placeholder-hold';
              plan.diffs = plan.diffs.concat(cmpP.diffs);
              info.notes.push('il contratto da caricare è a nome di ' + tenantOf(ph) + ', la tabella dice ' + r.inquilino + ': se è la stessa persona applica le differenze, altrimenti chiudi prima il segnaposto');
            } else {
              info.action = 'placeholder-complete';
              var fillP = { contractMissing: false, rent: r.canone, deposit: r.deposito, startDate: r.dal, endDate: r.al, paymentDay: r.giorno,
                cedolareSecca: r.cedolare, signatureStatus: 'paper', paymentsFrom: unitGd, status: r.al < today ? 'expired' : 'active' };
              // La cadenza scritta dal portal sul segnaposto non si riscrive.
              if (!(Number(ph.installmentMonths) > 1)) fillP.installmentMonths = 1;
              if (r.tipo) fillP.type = r.tipo;
              if (r.registrato) fillP.rliRegisteredAt = r.registrato;
              if (r.registrato || r.registratoSi) fillP.registrationStatus = 'registered';
              cmpP.diffs = cmpP.diffs.filter(function (d) { return ['rent', 'endDate', 'deposit', 'cedolareSecca', 'type'].indexOf(d.field) < 0; });
              ['rent', 'endDate', 'deposit', 'cedolareSecca', 'type'].forEach(function (k) { delete cmpP.fill[k]; });
              // Le rate coi termini che il contratto avrà DAVVERO (oneri diversi
              // dal segnaposto restano quelli in archivio finché non si applica).
              newRates(str(ph.id), updateExisting(ph, cmpP, fillP), ph);
            }
          } else {
            var cid = 'c_' + pid + '_' + r.dal;
            if (ctx.contractById && ctx.contractById[cid]) cid += '_b';
            // Ciò che il contratto aggiunge al semplice "chi e quanto": chi
            // firma con lui, gli oneri fissi, chi è il locatore e dove si paga.
            var extra = {};
            if (r.coinquilini.length) extra.coTenants = r.coinquilini.map(function (n) { return { name: n }; });
            if (r.oneri != null) extra.oneriQuota = r.oneri;
            if (r.locatore) extra.landlordName = r.locatore;
            if (r.iban) extra.landlordIban = r.iban;
            var cd = Object.assign({ propertyId: pid, status: r.al < today ? 'expired' : 'active', tenantName: r.inquilino, tenantPhone: r.telefono, tenantEmail: r.email,
              rent: r.canone, deposit: r.deposito, startDate: r.dal, endDate: r.al, type: r.tipo, paymentDay: r.giorno, installmentMonths: 1,
              cedolareSecca: r.cedolare, signatureStatus: 'paper', paymentsFrom: unitGd, source: 'palazzo-import' }, extra);
            if (r.registrato) cd.rliRegisteredAt = r.registrato;
            if (r.registrato || r.registratoSi) cd.registrationStatus = 'registered';
            plan.contracts.push({ id: cid, data: cd, interno: r.interno });
            info.action = 'contract-new'; info.contractId = cid;
            newRates(cid, { start: r.dal, end: r.al, rent: r.canone, oneri: r.oneri, day: r.giorno });
          }
        }
      }
      if (info.errors.length) {
        out.errors.push('row:' + r.line); out.skipped.push(r.line); out.counts.rowErrors++;
        return;
      }
      // Tutto ciò che la riga scrive, solo se la riga è sana.
      if (prop) { if (Object.keys(pdata).length) out.counts.update++; else out.counts.same++; }
      else out.counts.create++;
      if (!prop || Object.keys(pdata).length) out.properties.push({ id: pid, exists: !!prop, data: pdata, interno: r.interno });
      plan.contracts.forEach(function (c) {
        out.contracts.push(c);
        if (c.exists) out.counts.contractUpdates++; else { out.counts.contracts++; if (c.data.contractMissing === true) out.counts.missing++; }
      });
      plan.payments.forEach(function (p) { out.payments.push(p); out.counts.payments++; if (p.data.status === 'paid') out.counts.paid++; });
      plan.paymentUpdates.forEach(function (u) { out.paymentUpdates.push(u); if (u.cancel) out.counts.paymentCancels++; else out.counts.paymentUpdates++; });
      plan.diffs.forEach(function (d) { out.diffs.push(d); out.counts.diffs++; if (d.locked) out.counts.diffsLocked++; else out.counts.diffsApplicable++; });
      plan.paidMarks.forEach(function (x) { out.paidMarks.push(x); });
      plan.overdue.forEach(function (x) { out.overdueNow.push(x); out.counts.overdueNow++; });
      if (info.action === 'contacts') out.counts.contacts++;
      info.diffs = plan.diffs; info.paidMarks = plan.paidMarks; info.paid = plan.paidMarks.length > 0; info.overdue = plan.overdue.length;
      info.payments = plan.payments.length;
    });
    // I conti su cui pagano gli inquilini, raccolti: il dato più delicato
    // della tabella, da guardare una volta prima di caricare.
    var accounts = Object.create(null);
    out.rows.forEach(function (x) {
      if (x.action === 'error' || (!x.iban && !x.ibanInput && !x.locatore)) return;
      var k = (x.iban || x.ibanInput) + '|' + norm(x.locatore);
      var a = accounts[k] = accounts[k] || { locatore: x.locatore, iban: x.iban, ibanMasked: x.ibanMasked, ibanValid: x.ibanValid, interni: [] };
      a.interni.push(x.interno);
    });
    out.accounts = Object.keys(accounts).map(function (k) { return accounts[k]; });
    // Le frasi del piano, con singolari e plurali giusti.
    var M = out.messages;
    var keptGd = out.rows.filter(function (x) { return x.action !== 'error' && x.gestioneKept; });
    if (out.ignoredRows.length) M.push(out.ignoredRows.length === 1 ? 'Riga ' + out.ignoredRows[0].line + ' saltata: è la riga dei totali, non un interno.'
      : 'Righe ' + rrList(out.ignoredRows.map(function (x) { return String(x.line); })) + ' saltate: sono righe dei totali, non interni.');
    if (out.unknownColumns.length) {
      var one = out.unknownColumns.length === 1;
      M.push((one ? 'Colonna non riconosciuta: ' : 'Colonne non riconosciute: ') + out.unknownColumns.map(function (u) { return '«' + u.name + '»' + (u.looks ? ' (contiene ' + u.looks + ')' : ''); }).join(', ') +
        '. ' + (one ? 'Non la carico: se serve, rinominala' : 'Non le carico: se servono, rinominale') + ' come nel modello.');
    }
    if (keptGd.length) M.push('Per ' + (keptGd.length === 1 ? 'l’interno ' + keptGd[0].interno + ', già in archivio, la gestione resta da ' + rrMonth(keptGd[0].gestioneDal)
      : 'gli interni ' + rrList(keptGd.map(function (x) { return x.interno; })) + ', già in archivio, la gestione resta quella scritta (' + rrList(keptGd.map(function (x) { return rrMonth(x.gestioneDal); }).filter(function (v, i, a) { return a.indexOf(v) === i; })) + ')') +
      '; il mese scelto vale per gli interni nuovi.');
    var floorless = out.rows.filter(function (x) { return x.action !== 'error' && x.floorAsk; });
    if (floorless.length) M.push(rrPlural(floorless.length, 'interno senza piano', 'interni senza piano') + ' (' + rrList(floorless.map(function (x) { return x.interno; })) + '): ' + (floorless.length === 1 ? 'resta' : 'restano') + ' fuori dalla facciata finché non lo indichi.');
    var da = out.counts.diffsApplicable;
    if (da) M.push(apply ? rrPlural(da, 'differenza con l’archivio verrà applicata', 'differenze con l’archivio verranno applicate') + (out.counts.paymentUpdates + out.counts.paymentCancels ? ' (' + rrPlural(out.counts.paymentUpdates + out.counts.paymentCancels, 'rata da pagare cambia', 'rate da pagare cambiano') + ')' : '') + '.'
      : rrPlural(da, 'differenza con l’archivio', 'differenze con l’archivio') + ': ' + (da === 1 ? 'non la applico' : 'non le applico') + ' finché non lo chiedi.');
    var lockedBy = function (why) { return out.diffs.filter(function (d) { return d.lockReason === why || (why === 'firmato' && d.lockReason === 'cofirmato'); }).length; };
    var lf = lockedBy('firmato'), lp = lockedBy('persona');
    if (lf) M.push(lf === 1 ? '1 differenza riguarda un contratto firmato digitalmente (o un co-intestatario che ha firmato): da qui non si cambia, correggila dal contratto.'
      : lf + ' differenze riguardano contratti firmati digitalmente (o co-intestatari che hanno firmato): da qui non si cambiano, correggile dal contratto.');
    if (lp) M.push(lp === 1 ? '1 differenza riguarda il contratto di un’altra persona: da qui non si applica (vedi la riga).'
      : lp + ' differenze riguardano il contratto di un’altra persona: da qui non si applicano (vedi le righe).');
    if (out.overdueNow.length) M.push(rrPlural(out.overdueNow.length, 'rata risulta già scaduta', 'rate risultano già scadute') + ' oggi (' +
      out.overdueNow.slice(0, 6).map(function (x) { return 'int. ' + x.interno + ' · ' + rrMonth(x.month) + ', scadenza ' + rrIt(x.dueDate); }).join('; ') + (out.overdueNow.length > 6 ? '; …' : '') +
      '): ' + (out.overdueNow.length === 1 ? 'se è stata pagata, scrivi «Pagato il» nella tabella o registra l’incasso dopo il carico.'
        : 'se sono state pagate, registra l’incasso di ciascuna dal Palazzo dopo il carico («Pagato il» vale solo per la prima rata di ogni interno).'));
    var noList = listings.filter(function (l) { return streetKey(l.address) === skey && !unitKey(unitOf(l)) && !linkedListing[str(l.id)] && !str(l.propertyId); });
    if (noList.length) M.push(rrPlural(noList.length, 'annuncio', 'annunci') + ' allo stesso civico senza interno (' + rrList(noList.map(function (l) { return '«' + (str(l.name || l.title) || l.id) + '»'; })) + '): ' + (noList.length === 1 ? 'agganciarlo' : 'agganciarli') + ' a mano dalla scheda dell’interno.');
    out.buildingKey = existing.length ? buildingKeyOf(existing[0]) : 'a:' + skey; out.label = label; out.gestioneDal = gd;
    return out;
  }
  // Il modello da scaricare: dati inventati, coerenti fra loro (una società
  // locatrice non ha la cedolare; «Pagato il» dentro il primo mese).
  var RR_TEMPLATE = 'Interno;Piano;Inquilino;Co-intestatari;Telefono;Email;Canone;Oneri;Dal;Al;Tipo;Deposito;Cedolare;Registrato il;Pagato il;Locatore;IBAN;Mq;POD;PDR\r\n' +
    '1;PT;Mario Rossi;Anna Bianchi;+39 333 1234567;mario@example.com;850;120;01/09/2025;31/08/2027;transitorio;1700;no;20/09/2025;03/10/2026;Rossi Immobiliare S.r.l.;IT60X0542811101000000123456;48;IT001E12345678;00881234567890\r\n' +
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
    // Le rate di CANONE aperte (anche più vecchie della finestra: un debito
    // resta un debito). Un saldo deposito scaduto non è puntualità sul
    // canone: si conta a parte (overdueOther).
    var open = all.filter(function (r) { return r.isRent && r.state === 'overdue'; }).sort(byDue);
    var openOther = all.filter(function (r) { return !r.isRent && r.state === 'overdue'; });
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
      overdueCount: open.length, overdueOldest: open.length ? open[0].dueDate : '', overdueOther: openOther.length,
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
    // Un interno il cui mese rientra nel periodo della rata del mese prima
    // (l'ultimo mese di un contratto dal 15) non ha una rata sua: non lo si
    // conta fra chi "ha pagato €0", lo si dice a parte. E una frase senza
    // importi del mese (solo rate trimestrali in corso) non stampa «€0 di €0».
    var carriedU = m.units.filter(function (u) { return u.month.carried && u.month.state !== 'before'; });
    var payers = t.paid + t.late + t.due + t.review + t.unknown - carriedU.length;
    var paidN = t.paid - carriedU.filter(function (u) { return u.month.state === 'paid'; }).length;
    if (payers > 0) out.push(n(paidN, 'ha pagato', 'hanno pagato') + ' su ' + payers + (!t.expected && !t.unknownAmounts ? '' : ' (' + (!t.expected ? 'importi da verificare'
      : eur(t.collected) + ' di ' + eur(t.expected) + (t.unknownAmounts ? ', più ' + n(t.unknownAmounts, 'rata', 'rate') + ' con l’importo da verificare' : '')) + ')') + '.');
    if (carriedU.length) {
      var mname = monthLabel(m.month).split(' ')[0].toLowerCase(), prevOf = function (u) { var r = u.month.rows[0]; return r && r.month ? monthLabel(r.month).toLowerCase() : 'del mese prima'; };
      out.push(carriedU.length === 1 ? name(carriedU[0]) + ': ' + mname + ' rientra nel periodo della rata di ' + prevOf(carriedU[0]) + '.'
        : mname.charAt(0).toUpperCase() + mname.slice(1) + ' rientra nel periodo della rata del mese prima: ' + carriedU.map(function (u) { return name(u) + ' (rata di ' + prevOf(u) + ')'; }).join(', ') + '.');
    }
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
    // novembre è ancora in ritardo: non sparisce dalla frase). Anche chi è in
    // ritardo questo mese, se deve pure i mesi prima: si nomina la sola parte
    // vecchia (la cifra del mese è già detta sopra, mai contata due volte).
    // Un interno con due contratti in debito (il cambio inquilino) porta il
    // nome di chi deve: la stessa cifra non va sul nome sbagliato.
    var debts = m.debtors || [];
    var perUnit = Object.create(null);
    debts.forEach(function (d) { perUnit[d.unitId] = (perUnit[d.unitId] || 0) + 1; });
    var olderParts = [];
    debts.forEach(function (d) {
      var part = nowIds[d.unitId] ? d.older : d;
      if (!part || !part.count) return;
      var amt = part.amount, unkN = part.unknownAmounts, om = nowIds[d.unitId] ? part.oldestMonth : d.oldestMonth;
      shown = round(shown + amt);
      // Un saldo deposito non è un canone: lo si chiama col suo nome.
      var partRows = nowIds[d.unitId] ? d.rows.filter(function (r) { return r.month !== m.month; }) : d.rows;
      var what = partRows.length && partRows.every(function (r) { return !r.isRent; }) ? (partRows.every(function (r) { return /deposit/.test(r.type); }) ? 'saldo deposito' : 'altri addebiti') : '';
      var when = what ? what + (om ? ' di ' + monthLabel(om).toLowerCase() : '')
        : om ? (part.count === 1 ? monthLabel(om).toLowerCase() : part.count + ' rate da ' + monthLabel(om).toLowerCase()) : n(part.count, 'rata', 'rate');
      var who = (d.interno ? 'int. ' + d.interno : d.name) + (perUnit[d.unitId] > 1 && d.tenants.length ? ' · ' + d.tenants[0] : '');
      olderParts.push(who + ' (' + when + ', ' + (amt > 0 ? eur(amt) + (unkN ? ' più un importo da verificare' : '') : 'importo da verificare') + ')');
    });
    if (olderParts.length) out.push('Ancora da pagare dai mesi precedenti: ' + olderParts.join(', ') + '.');
    if (!lateNow.length && !olderParts.length && (payers > 0 || carriedU.length)) out.push('Nessun ritardo.');
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
    // UNA voce per interno E contratto: nel mese del cambio inquilino il
    // debito del vecchio resta del vecchio e quello della nuova della nuova —
    // nome, importo, rata più vecchia e rata da sollecitare (payRow) vengono
    // solo dalle rate di QUEL contratto. `id` è univoco (interno~contratto),
    // `unitId` è l'interno.
    var sumRows = function (rs) { return rs.reduce(function (a, r) { return r.amount != null ? round(a + r.amount) : a; }, 0); };
    var debtors = [];
    units.forEach(function (u) {
      var d = u.debt;
      if (!d.count) return;
      var keys = [], byC = Object.create(null);
      d.rows.forEach(function (r) { var k = r.contractId || '-'; if (!byC[k]) { byC[k] = []; keys.push(k); } byC[k].push(r); });
      keys.forEach(function (k) {
        var rs = byC[k], first = rs[0], dated = rs.find(function (r) { return r.dueDate; }) || null;
        var pay = rs.find(function (r) { return r.amount != null && r.amount > 0 && !/^missing-id:/.test(r.id); }) || null;
        var mine = rs.filter(function (r) { return r.month === m; }), old = rs.filter(function (r) { return r.month !== m; });
        var oldDated = old.find(function (r) { return r.month; }) || null;
        debtors.push({ id: u.id + '~' + k, unitId: u.id, interno: u.interno, name: u.name,
          amount: sumRows(rs), count: rs.length, unknownAmounts: rs.filter(function (r) { return r.amount == null; }).length,
          oldest: dated ? dated.dueDate : '', oldestDays: dated ? dated.days || 0 : 0, oldestMonth: dated ? dated.month : '',
          rows: rs, row: first, payRow: pay, contractId: first.contractId, tenants: first.tenants.slice(),
          previousContract: !!(first.contractId && u.month.contractId && first.contractId !== u.month.contractId),
          thisMonth: { count: mine.length, amount: sumRows(mine) },
          older: { count: old.length, amount: sumRows(old), unknownAmounts: old.filter(function (r) { return r.amount == null; }).length, oldestMonth: oldDated ? oldDated.month : '' } });
      });
    });
    debtors.sort(function (a, b2) { return b2.oldestDays - a.oldestDays || natural(a.interno, b2.interno) || natural(a.oldest, b2.oldest); });

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
        // Il transitorio cessa da sé alla scadenza (Allegato B, art. 1): uno
        // scaduto è la fine normale, non un dubbio da tenere aperto 400 giorni.
        if (typeKey(c) === 'transitorio') return;
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
    // Rate oltre la fine di un contratto ancora 'attivo': sono dovute (tengono
    // occupato l'interno, contano come ritardo). Rinnovo tacito o una data da
    // aggiornare: si chiede, mai «da annullare».
    var beItems = [];
    units.forEach(function (u) {
      var rs = (ctx.beyondEnd && ctx.beyondEnd[u.id]) || [];
      var seen = Object.create(null);
      rs.forEach(function (r) {
        var k = r.contractId || '-', it = seen[k];
        if (!it) {
          var c = r.contract, nt = c ? noticeOf(c, ctx.today) : null;
          it = seen[k] = { unitId: u.id, contractId: r.contractId, end: c ? effectiveEnd(c) : '', type: c ? typeKey(c) || null : null,
            renews: nt ? nt.renews : '', from: r.month, count: 0, open: 0, paid: 0, paymentIds: [] };
          beItems.push(it);
        }
        it.count++; it.paymentIds.push(r.id);
        if (r.state === 'paid') it.paid++; else it.open++;
        if (r.month && (!it.from || r.month < it.from)) it.from = r.month;
      });
    });
    if (beItems.length) issues.push({ code: 'beyondEnd', count: beItems.length, ids: uniq(beItems.map(function (x) { return x.unitId; })), items: beItems });
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
    totals.debtorUnits = uniq(debtors.map(function (d) { return d.unitId; })).length;
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
    var occ = unitMonths && win >= OCC_MIN_MONTHS ? Math.round(occMonths / unitMonths * 100) : null;
    var occSince = sinces.length && sinces.every(Boolean) ? sinces.slice().sort()[0] : '';
    return {
      paidCount: paid, onTime: onTime, onTimePct: paid ? Math.round(onTime / paid * 100) : null,
      avgDelay: paid ? Math.round(delaySum / paid * 10) / 10 : null,
      // null = campione troppo piccolo (dichiarato da occupancyMonths/
      // occupancyMinMonths): mai "48%" su un palazzo preso in carico ieri.
      occupancy12: occ, vacantMonths: unitMonths - occMonths,
      occupancyMonths: win, occupancyUnitMonths: unitMonths, occupancyUnknown: unknownMonths, occupancyMinMonths: OCC_MIN_MONTHS,
      occupancySince: occSince,
      // Pronto da stampare: la percentuale, oppure perché non c'è ancora
      // (mai «null%» né «0%» su un palazzo preso in carico ieri).
      occupancyText: occ != null ? occ + '%' : !unitMonths ? 'non misurabile: nessun mese con un contratto noto'
        : 'in misura' + (occSince ? ' da ' + monthLabel(occSince).toLowerCase() : '') + ' (servono ' + OCC_MIN_MONTHS + ' mesi)',
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
    parseRentRoll: parseRentRoll, planImport: planImport, RR_TEMPLATE: RR_TEMPLATE, unitKey: unitKey, scalaKey: scalaKey, rrSchedule: rrSchedule,
    maintOf: maintOf, utenzeOf: utenzeOf, podOk: podOk, pdrOk: pdrOk, utenzeRows: utenzeRows, UTENZE_HEAD: UTENZE_HEAD,
    // S2 — il mese, gli arretrati, i numeri
    effectiveEnd: effectiveEnd, covers: covers, daysOverlap: daysOverlap, contractKindOf: contractKindOf, isCompanyName: isCompanyName,
    noticeOf: noticeOf, NOTICE: NOTICE, typeKey: typeKey, paidDayOf: paidDayOf, eur: eurIt, leaseOn: leaseOn,
    PAID_VIA: PAID_VIA, PAID_EVIDENCE: PAID_EVIDENCE, paidViaLabel: paidViaLabel, evidenceLabel: evidenceLabel, OCC_MIN_MONTHS: OCC_MIN_MONTHS };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.BOOM_PALAZZO = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
