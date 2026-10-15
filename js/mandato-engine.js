// js/mandato-engine.js — LE CONDIZIONI APPROVATE del mandato a firmare, in
// UNA copia (UMD → window.BOOM_MANDATO nel portal, import ESM da api/**).
//
// Il cliente conferisce il mandato SU UNA PROPOSTA: BOOM può firmare il
// contratto in suo nome «on exactly the terms accepted in this pre-agreement,
// with no changes» (api/preagreement/_consent.js). Perché quella frase valga,
// le condizioni approvate devono essere:
//   1. FOTOGRAFATE all'accettazione (submit.js → pa.approvedTerms), non
//      ricalcolate dopo su dati che qualcuno può aver toccato;
//   2. VERIFICABILI alla conversione (il contratto appena costruito le
//      riproduce?) e alla firma (il contratto di ADESSO le riproduce?);
//   3. LEGGIBILI dall'operatore prima del tentativo di firma (il portal
//      mostra COSA è cambiato, non solo "no").
//
// termsFromProposal() e termsFromContract() producono lo STESSO oggetto
// canonico da due sorgenti diverse: è la simmetria che rende il confronto
// possibile. Copre immobile, parti, modello, date, condizioni economiche
// del contratto di locazione (canone, deposito, oneri accessori e come si
// incassano, cadenza, cedolare) e le clausole. NON copre, di proposito:
//   · gli extra (righe di denaro della proposta) e la provvigione BOOM —
//     non entrano nel contratto di locazione che si firma;
//   · gli add-on (servizi comprati all'accettazione) — non sono condizioni
//     del contratto;
//   · la versione dell'impaginato (clauseVersion) — è il NOSTRO layout dei
//     modelli dell'associazione, non una condizione pattuita.
// Versione 2. La versione 1 (termsFingerprint in api/magic-sign/_shared.js)
// resta per il terms-freeze fra le firme e per i mandati nati prima.
(function (root) {
  'use strict';

  const VERSION = 2;

  const LABELS = {
    propertyId: 'immobile',
    address: 'indirizzo',
    landlord: 'locatore',
    tenants: 'conduttori',
    model: 'modello di contratto',
    startDate: 'decorrenza',
    endDate: 'scadenza',
    rent: 'canone mensile',
    deposit: 'deposito',
    accessoryCharges: 'oneri accessori',
    billEnergyCredit: 'oneri incassati col canone',
    installmentMonths: 'cadenza delle rate',
    cedolare: 'cedolare secca',
    clauses: 'clausole',
  };

  // Testo confrontabile: senza accenti (una «é» corretta in /scheda non è
  // un'altra persona), minuscolo, spazi collassati.
  function normText(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // La clausola che convert.js AGGIUNGE da sé quando ci sono co-conduttori:
  // non è una condizione pattuita dal cliente, quindi non entra nel confronto
  // (altrimenti ogni proposta con due nomi risulterebbe "modificata").
  const AUTO_COTENANT = /^i co-conduttori \(.*\) hanno sottoscritto la proposta accettata /;

  // Le clausole come insieme confrontabile: una stringa a capo (contratto)
  // o un array (proposta) → righe normalizzate, senza vuote, ordinate.
  function normClauses(list) {
    const arr = Array.isArray(list) ? list : (list == null ? [] : [list]);
    const out = [];
    for (const item of arr) {
      String(item == null ? '' : item).split('\n').forEach(line => {
        const t = normText(line);
        if (t && !AUTO_COTENANT.test(t)) out.push(t);
      });
    }
    return out.sort();
  }

  // Il tipo di contratto DECIDE il modello (Allegato B/C/A). Una copia sola:
  // convert.leaseType delega qui. Il chiamante esplicito vince, altrimenti
  // si legge la tendina della console sulla proposta.
  function modelOfLease(explicit, lease) {
    if (explicit === 'studenti' || explicit === 'transitorio' || explicit === '3+2') return explicit;
    const t = String((lease || {}).type || '');
    if (/student/i.test(t)) return 'studenti';
    if (/3\s*\+\s*2|allegato a\b/i.test(t)) return '3+2';
    return 'transitorio';
  }

  const cadence = (n) => ([1, 2, 3, 6, 12].includes(Number(n)) ? Number(n) : 1);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
  const day = (v) => String(v || '').slice(0, 10) || null;
  // Il tipo del contratto nella grammatica del modello ('32' e 'concordato'
  // sono le forme che compliance-rules leggeva già).
  function modelOfContract(c) {
    const t = String((c || {}).type || '').toLowerCase();
    if (t === 'studenti') return 'studenti';
    if (t === '32' || /^3\s*\+\s*2$/.test(t) || t === 'concordato') return '3+2';
    return 'transitorio';
  }

  // Dalla PROPOSTA accettata (submit.js, all'accettazione; convert.js come
  // ripiego per le proposte accettate prima di questa versione — la console
  // non lascia modificare una proposta accettata, quindi è la stessa foto).
  // L'immobile è quello della PROPOSTA al momento dell'accettazione: una
  // proposta senza immobile collegato produce propertyId null, e un
  // immobile agganciato dopo (conversione manuale) risulta nel diff — il
  // cliente ha dato il mandato su un indirizzo, non su un record scelto poi.
  function termsFromProposal(pa) {
    pa = pa || {};
    const m = pa.money || {}, le = pa.lease || {};
    const list = Array.isArray(pa.tenants) && pa.tenants.length ? pa.tenants : [pa.tenant || {}];
    const energy = num(m.energyCredit);
    return {
      v: VERSION,
      propertyId: pa.propertyId || null,
      address: normText((pa.property || {}).address) || null,
      // l'interno che il cliente ha visto accettando: come l'indirizzo, non
      // entra nell'impronta — serve a riconoscere la casa (homeCheck)
      unit: normText((pa.property || {}).unit) || null,
      landlord: normText((pa.landlord || {}).name) || null,
      tenants: list.map(t => normText((t || {}).fullName)).filter(Boolean),
      model: modelOfLease(undefined, le),
      startDate: day(le.startDate),
      endDate: day(le.endDate),
      rent: num(m.rent),
      deposit: num(m.deposit),
      accessoryCharges: energy,
      billEnergyCredit: energy > 0 && m.billEnergyCredit !== false,
      installmentMonths: cadence(m.installmentMonths),
      cedolare: 'si',
      clauses: normClauses(pa.customClauses),
    };
  }

  // Dal CONTRATTO (quello appena costruito da convert.js, o quello di ADESSO
  // al momento della firma). L'indirizzo non vive sul contratto: resta
  // null e non pesa nel confronto (l'identità dell'immobile è propertyId).
  function termsFromContract(c) {
    c = c || {};
    const energy = num(c.accessoryCharges);
    const ced = ((c.cedolareSecca || 'si') !== 'no' && c.cedolareSecca !== false) ? 'si' : 'no';
    return {
      v: VERSION,
      propertyId: c.propertyId || null,
      address: null,
      unit: null,
      landlord: normText(c.landlordName) || null,
      tenants: [c.tenantName].concat((Array.isArray(c.coTenants) ? c.coTenants : []).map(x => (x || {}).name))
        .map(normText).filter(Boolean),
      model: modelOfContract(c),
      startDate: day(c.startDate),
      endDate: day(c.endDate),
      rent: num(c.rent),
      deposit: num(c.deposit),
      accessoryCharges: energy,
      billEnergyCredit: energy > 0 && c.billEnergyCredit !== false,
      installmentMonths: cadence(c.installmentMonths),
      cedolare: ced,
      clauses: normClauses(c.otherClauses),
    };
  }

  // L'IMMOBILE NATO DALLA PROPOSTA (12/10/2026 — Via dei Latini 76).
  // Una proposta accettata senza immobile collegato fotografa propertyId
  // null: il cliente ha dato il mandato su un INDIRIZZO, quello della
  // proposta. Il contratto però nasce sempre su un record di `properties`,
  // e quando nel portal la casa non c'era convert lo crea DALLA STESSA
  // proposta (createProperty → prop_pa_<paId>, indirizzo e interno copiati
  // da lei). Contare quel record come «immobile cambiato» rendeva il
  // mandato inservibile per costruzione su OGNI proposta senza immobile
  // collegato: nel backup del 12/10 BOOM-MUMY744I aveva termsDiff
  // ['propertyId'] e nient'altro, e altre tre proposte pagate col mandato
  // aspettavano lo stesso destino. Qui, e solo qui, il record nato dalla
  // proposta del mandato vale come l'indirizzo approvato. Un immobile
  // DIVERSO, scelto a mano dopo l'accettazione (anche allo stesso civico:
  // in un palazzo ci sono più interni), resta un cambio di condizioni.
  const PA_PROPERTY_PREFIX = 'prop_pa_';
  function proposalPropertyId(paId) {
    const s = String(paId == null ? '' : paId).trim();
    return s ? PA_PROPERTY_PREFIX + s : null;
  }
  // matchedId: il record del portal già riconosciuto come la casa della
  // proposta (stesso indirizzo e interno, homeCheck → propertyMatch).
  function alignPropertyToSnapshot(snapshot, current, paId, matchedId) {
    if (!snapshot || !current) return current;
    if (snapshot.propertyId != null && snapshot.propertyId !== '') return current;
    const born = proposalPropertyId(paId);
    const same = (born && current.propertyId === born) || (matchedId && current.propertyId === matchedId);
    if (!same) return current;
    return Object.assign({}, current, { propertyId: null });
  }
  // Le condizioni di ADESSO lette dal contratto, nella forma in cui si
  // confrontano con la foto del mandato del CONDUTTORE (la proposta su cui
  // è stato dato: m.paId, o quella da cui il contratto è nato). Una copia
  // sola per server (mandateCheck, tenantMandateFor) e portal (🖊 Firma ora).
  function termsForMandate(contract, mandate) {
    const m = mandate || {};
    const c = contract || {};
    const pm = m.propertyMatch && m.propertyMatch.by === 'address+unit' ? m.propertyMatch.propertyId : null;
    return alignPropertyToSnapshot(m.terms, termsFromContract(c), m.paId || c.preAgreementId, pm);
  }

  // LA CASA DELLA PROPOSTA GIÀ NEL PORTAL (15/10/2026 — «fallo valere con
  // stesso indirizzo e interno»). Una proposta accettata senza immobile
  // collegato fotografa un INDIRIZZO; se il contratto nasce su un record del
  // portal con lo stesso indirizzo e lo stesso interno, quel record È la casa
  // che il cliente ha approvato. Le regole sono strette di proposito — è la
  // base su cui BOOM firma al posto del cliente:
  //   · si confrontano via e civico normalizzati (maiuscole, accenti,
  //     punteggiatura, le abbreviazioni comuni, «n.»/«civico» davanti al
  //     numero, scala e piano dopo, città e CAP, il quartiere dopo la
  //     virgola) e l'interno, con la normalizzazione del lucchetto
  //     (_lock.js normUnit): «Int. 11» = «11». Un interno non dichiarato
  //     combacia solo con un interno non dichiarato: per BOOM è la casa
  //     intera a quell'indirizzo (lucchetto e sovrapposizioni la leggono
  //     così), e la console lo DICE prima della firma;
  //   · l'interno approvato è quello della FOTO (unit, dal 15/10); per una
  //     foto più vecchia quello della proposta, che dopo l'accettazione non
  //     si modifica — salvo l'interno dichiarato dalla console (resolve:
  //     unitDeclaredAt) o un indirizzo ritoccato: lì l'interno che il
  //     cliente ha visto non è più ricostruibile, e il riscontro non c'è;
  //   · un indirizzo che non si legge con certezza (nessun tipo di via,
  //     nessun civico, parole dopo il civico) NON combacia mai: fra un
  //     mandato inservibile e una firma sulla casa sbagliata, il primo.
  // Il riscontro si prende dove ci sono entrambi i dati (conversione,
  // mandato dato dopo, ✍️ Firmo io) e resta scritto sul mandato
  // (propertyMatch): firma, lookup e portal lo leggono senza rileggere
  // l'immobile. Vale per QUEL record: un contratto spostato su un altro
  // immobile torna un cambio di condizioni.
  function normUnit(v) {
    return String(v == null ? '' : v).trim().toLowerCase()
      .replace(/^int(erno)?\.?\s*/, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 24);
  }
  const STREET_TYPES = ['via', 'viale', 'piazza', 'piazzale', 'piazzetta', 'largo', 'corso', 'vicolo', 'vico',
    'lungotevere', 'circonvallazione', 'borgo', 'salita', 'clivo', 'strada', 'stradone', 'galleria',
    'passeggiata', 'rampa', 'scalinata', 'traversa', 'lungomare', 'contrada', 'localita', 'discesa'];
  const CITY_WORDS = ['roma', 'rome', 'rm', 'italia', 'italy'];
  const ABBREV = [
    [/\bv\.\s*le\b/g, 'viale'], [/\bvle\b/g, 'viale'],
    [/\bp\.\s*zza\b/g, 'piazza'], [/\bp\.\s*za\b/g, 'piazza'], [/\bpzza\b/g, 'piazza'],
    [/\bp\.\s*le\b/g, 'piazzale'],
    [/\bl\.\s*go\b/g, 'largo'], [/\bc\.\s*so\b/g, 'corso'],
    [/\bv\.\s*lo\b/g, 'vicolo'], [/\bvic\./g, 'vicolo'],
    [/\bl\.\s*re\b/g, 'lungotevere'], [/\blungot\./g, 'lungotevere'],
    [/\bcirc\.\s*ne\b/g, 'circonvallazione'],
    [/(^|,)\s*v\.\s+/g, '$1via '],
  ];
  const isCivic = (t) => /^\d{1,4}(?:[a-z]|bis|ter)?$/.test(t);
  // { street, civic, unit } o null quando l'indirizzo non si legge con certezza.
  function homeKey(address) {
    let s = String(address == null ? '' : address).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2019'`\u00b4]/g, ' ');
    for (const [re, to] of ABBREV) s = s.replace(re, to);
    let unit = '';
    s = s.replace(/\b(?:int|interno)\b\.?\s*([a-z0-9]+)/g, (m0, u) => { if (!unit) unit = u; return ' '; });
    // «n. 52», «n° 52», «nr 52», «civico 52»: il numero resta, l'etichetta no
    // («Via N. Sauro 12» resta com'è: dopo la N non c'è un numero)
    s = s.replace(/\b(?:n|nr|num|numero|civico|civ)\b\s*[.\u00b0\u00ba]?\s*(?=\d)/g, ' ');
    s = s.replace(/(\d)\s*\/\s*([a-z])\b/g, '$1$2').replace(/(\d)\s+(bis|ter)\b/g, '$1$2');
    // scala, piano, palazzina DOPO il civico non sono l'indirizzo
    s = s.replace(/(\d[a-z]?)\s*,?\s*\b(?:scala|sc|piano|palazzina|pal|edificio|lotto)\b\.?\s*[a-z0-9]+\b/g, '$1');
    const segs = s.split(/[,;]/)
      .map(x => x.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean))
      .filter(a => a.length);
    let si = -1, ti = -1;
    for (let i = 0; i < segs.length && si < 0; i++) {
      const k = segs[i].findIndex(t => STREET_TYPES.indexOf(t) >= 0);
      if (k >= 0) { si = i; ti = k; }
    }
    if (si < 0) return null;
    const seg = segs[si];
    let end = seg.length;
    while (end > ti + 1 && (CITY_WORDS.indexOf(seg[end - 1]) >= 0 || /^\d{5}$/.test(seg[end - 1]))) end--;
    let civic = null, nameEnd = end;
    if (end - 2 > ti && /^[a-z]$/.test(seg[end - 1]) && isCivic(seg[end - 2]) && /^\d+$/.test(seg[end - 2])) {
      civic = seg[end - 2] + seg[end - 1]; nameEnd = end - 2;              // «12 a»
    } else if (end - 1 > ti && isCivic(seg[end - 1])) {
      civic = seg[end - 1]; nameEnd = end - 1;                              // «via x 12»
    } else if (end === seg.length && ti > 0 && isCivic(seg[ti - 1])) {
      civic = seg[ti - 1];                                                  // «12 via x»
    } else if (end === seg.length && segs[si + 1] && isCivic(segs[si + 1][0])) {
      const nx = segs[si + 1];                                              // «via x, 12»
      civic = nx[0] + (nx[1] && /^[a-z]$/.test(nx[1]) && /^\d+$/.test(nx[0]) ? nx[1] : '');
    }
    if (!civic) return null;
    const name = seg.slice(ti, nameEnd);
    if (name.length < 2) return null;
    return { street: name.join(' '), civic, unit };
  }
  // approved / record: { address, unit } (record: anche `interno`).
  function homeMatch(approved, record) {
    const a = approved || {}, r = record || {};
    const A = homeKey(a.address), B = homeKey(r.address);
    if (!A || !B) return { match: false, reason: 'address_unreadable', approved: A, record: B };
    if (A.street !== B.street || A.civic !== B.civic) return { match: false, reason: 'address', approved: A, record: B };
    const ua = normUnit(a.unit) || normUnit(A.unit);
    const ub = normUnit(r.unit) || normUnit(r.interno) || normUnit(B.unit);
    if (ua !== ub) return { match: false, reason: 'unit', approved: A, record: B, approvedUnit: ua, recordUnit: ub };
    const where = A.street + ' ' + A.civic;
    return { match: true, unit: ua || null, where, key: where + (ua ? ' int ' + ua : ''), label: where + (ua ? ', int. ' + ua : ', interno non dichiarato su entrambi') };
  }
  // Serve il riscontro? Solo con la foto SENZA immobile e un contratto su un
  // record che non è quello nato dalla proposta (quello vale già). null =
  // non serve; { match:false, reason:'property_missing' } = serve, manca il
  // record (chi chiama lo legge e richiama).
  function homeCheck(o) {
    o = o || {};
    const terms = o.terms || {}, c = o.contract || {};
    if (terms.propertyId != null && terms.propertyId !== '') return null;
    const pid = c.propertyId || null;
    if (!pid || pid === proposalPropertyId(o.paId || c.preAgreementId)) return null;
    if (!o.property) return { propertyId: pid, match: false, reason: 'property_missing' };
    const pa = o.pa || {}, p = pa.property || {};
    let unit;
    if (Object.prototype.hasOwnProperty.call(terms, 'unit')) unit = terms.unit;            // la foto
    else if (pa.unitDeclaredAt || (terms.address && normText(p.address) !== terms.address)) {
      return { propertyId: pid, match: false, reason: 'unit_unknown' };
    } else unit = p.unit;                                                                     // foto vecchia
    return Object.assign({ propertyId: pid }, homeMatch({ address: terms.address || p.address, unit }, o.property));
  }
  // Ciò che si scrive sul mandato quando combacia (o null).
  function propertyMatchFrom(check, at) {
    if (!check || check.match !== true) return null;
    return { propertyId: check.propertyId, by: 'address+unit', home: check.key, label: check.label, at: at || new Date().toISOString() };
  }
  // In parole, per la console: perché il record collegato non è la casa.
  function describeHome(check) {
    if (!check || check.match) return '';
    const shown = (k) => k ? (k.street + ' ' + k.civic) : 'non leggibile';
    if (check.reason === 'unit') return 'interno diverso: proposta «' + (check.approvedUnit || '—') + '», immobile «' + (check.recordUnit || '—') + '»';
    if (check.reason === 'address') return 'indirizzo diverso: proposta «' + shown(check.approved) + '», immobile «' + shown(check.record) + '»';
    if (check.reason === 'address_unreadable') return 'indirizzo non leggibile con certezza (serve via e civico): proposta «' + shown(check.approved) + '», immobile «' + shown(check.record) + '»';
    if (check.reason === 'unit_unknown') return 'l\'interno che il cliente ha approvato non è ricostruibile (proposta ritoccata o interno dichiarato dopo l\'accettazione)';
    if (check.reason === 'property_missing') return 'immobile del contratto non trovato';
    return 'casa diversa';
  }

  // La forma che si HASHA (server) e si confronta (browser): chiavi in
  // ordine fisso, indirizzo e interno esclusi (sono dati della proposta che
  // il contratto non porta — l'indirizzo entra nel diff SOLO se entrambi i
  // lati lo hanno, l'interno serve solo a riconoscere la casa).
  const KEYS = ['v', 'propertyId', 'landlord', 'tenants', 'model', 'startDate', 'endDate',
    'rent', 'deposit', 'accessoryCharges', 'billEnergyCredit', 'installmentMonths', 'cedolare', 'clauses'];
  function canonical(terms) {
    const t = terms || {};
    const o = {};
    for (const k of KEYS) o[k] = t[k] === undefined ? null : t[k];
    return JSON.stringify(o);
  }

  // Cosa è cambiato fra la foto e il contratto di adesso: chiave, etichetta,
  // da → a. Vuoto = condizioni identiche.
  function diffTerms(snapshot, current) {
    const a = snapshot || {}, b = current || {};
    const out = [];
    const cmp = ['propertyId', 'landlord', 'tenants', 'model', 'startDate', 'endDate',
      'rent', 'deposit', 'accessoryCharges', 'billEnergyCredit', 'installmentMonths', 'cedolare', 'clauses'];
    for (const k of cmp) {
      const x = a[k] === undefined ? null : a[k], y = b[k] === undefined ? null : b[k];
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ key: k, label: LABELS[k] || k, from: x, to: y });
    }
    if (a.address && b.address && a.address !== b.address) out.push({ key: 'address', label: LABELS.address, from: a.address, to: b.address });
    return out;
  }

  // Una riga per l'operatore: «canone mensile: 1500 → 1550 · clausole».
  function describeDiff(diff) {
    const fmt = (v) => v == null ? '—' : Array.isArray(v) ? (v.length ? v.join(' | ') : '—') : String(v);
    return (diff || []).map(d => (d.key === 'clauses' || d.key === 'tenants')
      ? d.label
      : d.label + ': ' + fmt(d.from) + ' → ' + fmt(d.to)).join(' · ');
  }

  const API = { VERSION, LABELS, normText, normClauses, modelOfLease, modelOfContract, termsFromProposal, termsFromContract, proposalPropertyId, alignPropertyToSnapshot, termsForMandate, canonical, diffTerms, describeDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_MANDATO = API;
  // la casa della proposta già nel portal (15/10/2026): lo stesso oggetto
  // esportato, quindi visibile da server e portal
  Object.assign(API, { normUnit, homeKey, homeMatch, homeCheck, propertyMatchFrom, describeHome });
})(typeof window !== 'undefined' ? window : this);
