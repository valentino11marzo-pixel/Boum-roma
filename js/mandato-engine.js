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

  // La forma che si HASHA (server) e si confronta (browser): chiavi in
  // ordine fisso, l'indirizzo escluso (è un dato della proposta che il
  // contratto non porta — entra nel diff SOLO se entrambi i lati lo hanno).
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

  const API = { VERSION, LABELS, normText, normClauses, modelOfLease, modelOfContract, termsFromProposal, termsFromContract, canonical, diffTerms, describeDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_MANDATO = API;
})(typeof window !== 'undefined' ? window : this);
