/* BOOM · L'INCARICO DEL PROPRIETARIO — il motore puro (12/11/2026).
 *
 * Perché esiste. L'incarico con cui un proprietario affida a BOOM la ricerca
 * dei conduttori si scriveva a mano, una volta per proprietario, fuori dal
 * sistema: un PDF fatto in chat, firmato su carta, mai collegato all'immobile
 * né all'area proprietario. Il primo caso vero (un incarico biennale a
 * compenso unico) ha chiesto esclusiva, preavviso e penale: tre clausole che
 * in un foglio scritto a mano si dimenticano o si scrivono in due modi.
 *
 * Qui il testo dell'incarico è UNO. Le condizioni entrano da una lista chiusa
 * (normalize: rifiuta, mai aggiusta), le clausole escono da clauses() e le
 * leggono la pagina di firma (/incarico), il PDF (api/owners/_incarico-pdf.js)
 * e l'email: tre lettori, una copia. L'impronta (canonical → SHA-256, la fa
 * il chiamante) lega la firma a QUESTE condizioni: cambiate dopo l'invio, la
 * firma viene rifiutata (409) invece di valere per un testo mai letto.
 *
 * Regole, tutte in tests/incarico/run.mjs:
 *  1. Mai un valore dedotto: esclusiva dichiarata sì/no, IVA da lista chiusa,
 *     penale assente = nessuna alternativa al preavviso (0 è rifiutato: una
 *     penale di zero euro è un errore di battitura, non una condizione).
 *  2. Gli importi sono centesimi interi, stampati con euro() deterministica
 *     (mai toLocaleString: con small-ICU degrada in silenzio).
 *  3. Il recesso di legge dei 14 giorni compare SOLO per firma a distanza e
 *     proprietario persona fisica; in sede o con una società non si stampa.
 *  4. Le clausole che il proprietario approva una per una (artt. 1341-1342
 *     c.c.) sono marcate `specific:true`: la pagina le chiede a parte, il
 *     server le pretende.
 *
 * UMD: window.BOOM_INCARICO nel browser, import in api/ e nei test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_INCARICO = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;

  // L'identità di BOOM: gli stessi dati del piede di api/_pdfbrand.js e del
  // footer del sito (P.IVA e REA pubblicati su /faq).
  var BOOM = {
    name: 'Egidi Immobiliare S.r.l.',
    brand: 'BOOM',
    legal: 'Viale Liegi 42, 00198 Roma',
    office: 'Via dei Coronari 181/184, 00186 Roma',
    vat: '17322991005',
    rea: 'RM-1710623',
    rep: 'Valentino Egidi',
    email: 'hello@boom-rome.com'
  };

  var VAT = ['inclusa', 'oltre'];          // lista chiusa
  var PLACE = ['sede', 'distanza'];        // dove si firma
  var KIND = ['persona', 'societa'];       // chi è il proprietario

  function str(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200); }
  function isIsoDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  // "1.000", "1000,50", 1000 → centesimi interi; qualunque altra cosa → null.
  function cents(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
    var s = String(v).replace(/[€\s]/g, '');
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s) && !/^\d+([.,]\d{1,2})?$/.test(s)) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 100) : null;
  }
  function euro(c) {
    var n = Math.round(Number(c) || 0), neg = n < 0; n = Math.abs(n);
    var whole = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var dec = String(n % 100); if (dec.length < 2) dec = '0' + dec;
    return (neg ? '-' : '') + '€ ' + whole + ',' + dec;
  }
  var MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  function dateIt(iso) {
    if (!isIsoDate(iso)) return '';
    var p = iso.split('-'), d = Number(p[2]);
    return (d === 1 ? '1°' : String(d)) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0];
  }
  function monthsIt(n) { return n === 1 ? 'un mese' : n + ' mesi'; }

  /**
   * Le condizioni, da qualunque forma arrivino, in UNA forma — o gli errori.
   * @returns {{ok:boolean, terms?:object, errors?:string[]}}
   */
  function normalize(raw) {
    raw = raw || {};
    var o = raw.owner || {}, p = raw.property || {}, errors = [];
    var owner = {
      kind: KIND.indexOf(o.kind) >= 0 ? o.kind : (o.kind == null || o.kind === '' ? 'persona' : null),
      name: str(o.name, 120), cf: str(o.cf, 20).toUpperCase(),
      birthPlace: str(o.birthPlace, 80), birthDate: isIsoDate(o.birthDate) ? o.birthDate : '',
      address: str(o.address, 160), email: str(o.email, 120).toLowerCase(), phone: str(o.phone, 30)
    };
    if (!owner.kind) errors.push('owner_kind');
    if (owner.name.length < 3) errors.push('owner_name');
    if (owner.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(owner.email)) errors.push('owner_email');
    if (o.birthDate && !owner.birthDate) errors.push('owner_birth_date');

    var property = { id: str(p.id, 80), address: str(p.address, 160), detail: str(p.detail, 120), cadastre: str(p.cadastre, 120) };
    if (property.address.length < 5) errors.push('property_address');

    var start = isIsoDate(raw.start) ? raw.start : '', end = isIsoDate(raw.end) ? raw.end : '';
    if (!start) errors.push('start');
    if (!end) errors.push('end');
    if (start && end && end <= start) errors.push('end_before_start');

    var feeCents = cents(raw.fee);
    if (!(feeCents > 0)) errors.push('fee');
    var vat = VAT.indexOf(raw.vat) >= 0 ? raw.vat : null;
    if (!vat) errors.push('vat');
    var feePaidOn = raw.feePaidOn ? (isIsoDate(raw.feePaidOn) ? raw.feePaidOn : null) : '';
    if (feePaidOn === null) errors.push('fee_paid_on');

    if (raw.exclusive !== true && raw.exclusive !== false) errors.push('exclusive');

    // Recesso convenzionale: preavviso in mesi (vuoto = nessuna clausola) e,
    // in alternativa, una penale. Zero non è una penale.
    var notice = null, penaltyCents = null;
    if (raw.noticeMonths != null && raw.noticeMonths !== '') {
      var nm = Number(raw.noticeMonths);
      if (nm === Math.floor(nm) && nm >= 1 && nm <= 24) notice = nm; else errors.push('notice_months');
    }
    if (raw.penalty != null && raw.penalty !== '') {
      penaltyCents = cents(raw.penalty);
      if (!(penaltyCents > 0)) { errors.push('penalty'); penaltyCents = null; }
      else if (notice == null) errors.push('penalty_without_notice');
    }

    var lease = null;
    if (raw.currentLease && (raw.currentLease.start || raw.currentLease.end)) {
      var ls = raw.currentLease.start, le = raw.currentLease.end;
      if (isIsoDate(ls) && isIsoDate(le) && le > ls) lease = { start: ls, end: le }; else errors.push('current_lease');
    }

    var place = PLACE.indexOf(raw.place) >= 0 ? raw.place : null;
    if (!place) errors.push('place');

    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, terms: {
      v: VERSION, owner: owner, property: property, start: start, end: end,
      feeCents: feeCents, vat: vat, feePaidOn: feePaidOn || '',
      exclusive: raw.exclusive === true, noticeMonths: notice, penaltyCents: penaltyCents,
      expenses: raw.expenses !== false, currentLease: lease, place: place
    } };
  }

  // Il recesso di legge (14 giorni, Codice del consumo) riguarda solo la firma
  // a distanza di un proprietario persona fisica.
  function hasWithdrawal(t) { return !!t && t.place === 'distanza' && t.owner.kind === 'persona'; }

  function feeText(t) { return euro(t.feeCents) + (t.vat === 'inclusa' ? ', IVA inclusa' : ' oltre IVA'); }

  function parties(t) {
    var o = t.owner, bits = [o.name];
    if (o.kind === 'persona' && (o.birthPlace || o.birthDate)) bits.push('nascita: ' + [o.birthPlace, o.birthDate ? dateIt(o.birthDate) : ''].filter(Boolean).join(', '));
    if (o.cf) bits.push((o.kind === 'societa' ? 'C.F./P.IVA ' : 'C.F. ') + o.cf);
    if (o.address) bits.push((o.kind === 'societa' ? 'con sede in ' : 'residente in ') + o.address);
    return {
      boom: BOOM.name + ', sede legale ' + BOOM.legal + ', sede operativa ' + BOOM.office + ', C.F. e P.IVA ' + BOOM.vat + ', REA ' + BOOM.rea + ', in persona dell’Amministratore Unico ' + BOOM.rep + ', operante con il marchio ' + BOOM.brand + ' (di seguito «BOOM»)',
      owner: bits.join(', ') + ' (di seguito «la Proprietà»)'
    };
  }

  function propertyLine(t) {
    var p = t.property;
    return p.address + (p.detail ? ', ' + p.detail : '') + (p.cadastre ? ' (Catasto Fabbricati: ' + p.cadastre + ')' : '');
  }

  /** Le clausole, nell'ordine in cui si leggono. Una copia per pagina, PDF, email. */
  function clauses(t) {
    var out = [];
    function add(id, title, text, specific) { out.push({ id: id, n: out.length + 1, title: title, text: text, specific: !!specific }); }

    add('oggetto', 'Oggetto',
      'La Proprietà incarica BOOM di ricercare i conduttori dell’immobile in ' + propertyLine(t) +
      ' e di assisterla nella locazione, ogni volta che l’immobile sia o stia per tornare libero.');

    if (t.exclusive) add('esclusiva', 'Esclusiva',
      'L’incarico è conferito in esclusiva. Per tutta la sua durata la Proprietà non affida ad altri la ricerca dei conduttori e non concede in locazione l’immobile senza l’assistenza di BOOM.', true);
    else add('esclusiva', 'Nessuna esclusiva', 'L’incarico non è conferito in esclusiva.');

    add('durata', 'Durata',
      'L’incarico decorre dal ' + dateIt(t.start) + ' e termina il ' + dateIt(t.end) + ', senza bisogno di disdetta e senza rinnovo automatico.' +
      (t.currentLease ? ' Comprende la locazione già conclusa con l’assistenza di BOOM, in corso dal ' + dateIt(t.currentLease.start) + ' al ' + dateIt(t.currentLease.end) + '.' : ''));

    add('compenso', 'Compenso',
      'Per l’intera durata dell’incarico e per tutte le locazioni dell’immobile concluse in tale periodo, la Proprietà riconosce a BOOM un compenso unico e forfettario di ' + feeText(t) +
      '. Nessun’altra somma è dovuta dalla Proprietà a BOOM a titolo di provvigione o compenso.');

    if (t.expenses) add('spese', 'Spese escluse',
      'Restano a carico della Proprietà, per ciascun contratto di locazione, le spese di registrazione e di asseverazione, nella misura che BOOM comunica di volta in volta prima di sostenerle.');

    if (t.noticeMonths != null) add('recesso', 'Recesso anticipato',
      'La Proprietà può recedere dall’incarico prima della scadenza con un preavviso scritto di ' + monthsIt(t.noticeMonths) + '.' +
      (t.penaltyCents != null ? ' In alternativa può recedere senza preavviso versando a BOOM una penale di ' + euro(t.penaltyCents) + '.' : '') +
      ' Il compenso già versato resta acquisito.', true);

    add('conduttori', 'Rapporti con i conduttori',
      'I rapporti economici tra BOOM e i conduttori sono regolati separatamente con questi ultimi e restano estranei al presente incarico.');

    if (t.feePaidOn) add('quietanza', 'Quietanza',
      'BOOM dichiara di aver ricevuto dalla Proprietà, in data ' + dateIt(t.feePaidOn) + ', la somma di ' + euro(t.feeCents) + ' e ne rilascia quietanza a saldo del compenso. Seguirà regolare fattura.');
    else add('pagamento', 'Pagamento', 'Il compenso è dovuto alla firma del presente incarico, a fronte di regolare fattura.');

    if (hasWithdrawal(t)) add('recesso_legge', 'Diritto di recesso di legge',
      'Poiché l’incarico è firmato a distanza, la Proprietà può recedere entro 14 giorni dalla firma, senza indicarne il motivo, scrivendo a ' + BOOM.email +
      '. Se chiede che BOOM inizi subito e poi recede entro i 14 giorni, deve a BOOM un importo proporzionato a quanto già svolto.');

    add('dati', 'Dati personali',
      'BOOM tratta i dati della Proprietà per eseguire l’incarico e adempiere agli obblighi di legge. L’informativa completa è su boomrome.com/privacy.');
    return out;
  }

  /** La scheda in chiaro: le righe che si leggono prima del testo. */
  function summary(t) {
    var rows = [
      ['Immobile', t.property.address + (t.property.detail ? ' · ' + t.property.detail : '')],
      ['Durata', 'dal ' + dateIt(t.start) + ' al ' + dateIt(t.end)],
      ['Compenso', feeText(t) + ' · unico per tutta la durata'],
      ['Esclusiva', t.exclusive ? 'sì' : 'no']
    ];
    if (t.noticeMonths != null) rows.push(['Per uscire prima', 'preavviso scritto di ' + monthsIt(t.noticeMonths) + (t.penaltyCents != null ? ', oppure penale di ' + euro(t.penaltyCents) : '')]);
    if (t.expenses) rows.push(['A parte', 'registrazione e asseverazione dei contratti, comunicate di volta in volta']);
    rows.push(['Pagamento', t.feePaidOn ? 'ricevuto il ' + dateIt(t.feePaidOn) : 'alla firma']);
    return rows;
  }

  // Chiavi ordinate, ricorsivo: la stessa impronta su server, browser e test.
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  /** Ciò che la firma copre: le condizioni E il testo che ne esce. */
  function canonical(t) {
    return stable({ v: VERSION, terms: t, text: clauses(t).map(function (c) { return c.n + '. ' + c.title + '. ' + c.text; }) });
  }

  function specificIds(t) { return clauses(t).filter(function (c) { return c.specific; }).map(function (c) { return c.id; }); }

  return {
    VERSION: VERSION, BOOM: BOOM, VAT: VAT, PLACE: PLACE, KIND: KIND,
    normalize: normalize, clauses: clauses, summary: summary, parties: parties,
    canonical: canonical, specificIds: specificIds, hasWithdrawal: hasWithdrawal,
    euro: euro, cents: cents, dateIt: dateIt, propertyLine: propertyLine, feeText: feeText
  };
}));
