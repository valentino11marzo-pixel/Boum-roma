/* BOOM · Canone Concordato Engine — pure, framework-free, unit-tested.
 *
 * Accordo Territoriale del Comune di Roma depositato il 25/07/2023
 * (DM 16/01/2017): fasce di oscillazione A/B/C in EUR/mq/mese per zona,
 * i 20 parametri ufficiali della scheda ARPE, le maggiorazioni A-H, la
 * superficie convenzionale coi coefficienti ufficiali e la regola del cap
 * (gli AUMENTI non superano mai il massimo di fascia; le riduzioni si
 * applicano). Stessa aritmetica di scheda-canone.html — un motore solo,
 * usato dal calcolatore, dal Fascicolo Fiscale server-side e dai test.
 *
 * La tabella zone e' quella caricata nel calcolatore (fonte secondaria,
 * agg. 2026): confermare sempre la zona esatta con ARPE. Questo motore
 * organizza il calcolo — non sostituisce l'attestazione di rispondenza.
 *
 * Exposes window.BOOM_CANONE (browser) and module.exports (Node/tests).
 */
(function (root) {
  'use strict';

  // ─── Zone (fascia di oscillazione EUR/mq/mese: aMin..aMax / b / c) ────
  var ZONES = [
    {"cod": "B1", "nome": "TESTACCIO", "aMin": 10.5, "aMax": 13.2, "bMin": 13.2, "bMax": 15.3, "cMin": 15.3, "cMax": 17.6},
    {"cod": "B2", "nome": "SAN SABA", "aMin": 10.5, "aMax": 13.2, "bMin": 13.2, "bMax": 18.9, "cMin": 18.9, "cMax": 22.6},
    {"cod": "B3", "nome": "CELIO", "aMin": 10.5, "aMax": 13.2, "bMin": 13.2, "bMax": 18.9, "cMin": 18.9, "cMax": 22.6},
    {"cod": "B4", "nome": "MONTI", "aMin": 10.5, "aMax": 13.2, "bMin": 13.2, "bMax": 18.9, "cMin": 18.9, "cMax": 22.6},
    {"cod": "B12", "nome": "AVENTINO", "aMin": 12.6, "aMax": 15.4, "bMin": 15.4, "bMax": 22.0, "cMin": 22.0, "cMax": 26.4},
    {"cod": "B13", "nome": "SANT'ANGELO-CAMPITELLI", "aMin": 12.6, "aMax": 15.4, "bMin": 15.4, "bMax": 22.0, "cMin": 22.0, "cMax": 26.4},
    {"cod": "B14", "nome": "TRASTEVERE", "aMin": 12.6, "aMax": 15.4, "bMin": 15.4, "bMax": 22.0, "cMin": 22.0, "cMax": 26.4},
    {"cod": "B15", "nome": "BORGO", "aMin": 12.6, "aMax": 15.4, "bMin": 15.4, "bMax": 22.0, "cMin": 22.0, "cMax": 26.4},
    {"cod": "B17", "nome": "SALLUSTIANO-CASTRO PRETORIO", "aMin": 12.6, "aMax": 15.4, "bMin": 15.4, "bMax": 22.0, "cMin": 22.0, "cMax": 26.4},
    {"cod": "B18", "nome": "ESQUILINO", "aMin": 7.0, "aMax": 9.2, "bMin": 9.2, "bMax": 13.1, "cMin": 13.1, "cMax": 15.7},
    {"cod": "B25", "nome": "LUDOVISI", "aMin": 12.6, "aMax": 15.4, "bMin": 15.4, "bMax": 22.0, "cMin": 22.0, "cMax": 26.4},
    {"cod": "B29", "nome": "VIMINALE", "aMin": 10.5, "aMax": 13.2, "bMin": 13.2, "bMax": 18.9, "cMin": 18.9, "cMax": 22.6},
    {"cod": "B31", "nome": "TRIDENTE", "aMin": 12.6, "aMax": 18.3, "bMin": 18.3, "bMax": 26.2, "cMin": 26.2, "cMax": 31.5},
    {"cod": "B32", "nome": "CORSO VITTORIO", "aMin": 12.6, "aMax": 16.9, "bMin": 16.9, "bMax": 24.1, "cMin": 24.1, "cMax": 28.9},
    {"cod": "C1", "nome": "PARIOLI", "aMin": 10.5, "aMax": 13.8, "bMin": 13.8, "bMax": 19.8, "cMin": 19.8, "cMax": 23.8},
    {"cod": "C2", "nome": "SALARIO (Via Nizza)", "aMin": 10.5, "aMax": 13.8, "bMin": 13.8, "bMax": 19.8, "cMin": 19.8, "cMax": 23.8},
    {"cod": "C3", "nome": "PINCIANO", "aMin": 10.5, "aMax": 13.8, "bMin": 13.8, "bMax": 19.8, "cMin": 19.8, "cMax": 23.8},
    {"cod": "C4", "nome": "NOMENTANO TORLONIA", "aMin": 10.5, "aMax": 13.8, "bMin": 13.8, "bMax": 19.8, "cMin": 19.8, "cMax": 23.8},
    {"cod": "C40", "nome": "PRATI", "aMin": 10.5, "aMax": 12.8, "bMin": 12.8, "bMax": 18.4, "cMin": 18.4, "cMax": 22.0},
    {"cod": "C41", "nome": "DELLA VITTORIA (Cavalier d'Arpino)", "aMin": 10.5, "aMax": 12.8, "bMin": 12.8, "bMax": 18.4, "cMin": 18.4, "cMax": 22.0},
    {"cod": "C46", "nome": "SALARIO TRIESTE (Via dei Laghi/Corsica)", "aMin": 10.5, "aMax": 13.9, "bMin": 13.9, "bMax": 19.9, "cMin": 19.9, "cMax": 23.9},
    {"cod": "C49", "nome": "FLAMINIO", "aMin": 10.5, "aMax": 12.8, "bMin": 12.8, "bMax": 18.4, "cMin": 18.4, "cMax": 22.0},
    {"cod": "C50", "nome": "FLAMINIO PORTA DEL POPOLO", "aMin": 10.5, "aMax": 13.0, "bMin": 13.0, "bMax": 18.6, "cMin": 18.6, "cMax": 22.4},
    {"cod": "C5", "nome": "SAN LORENZO", "aMin": 4.4, "aMax": 8.1, "bMin": 8.1, "bMax": 11.6, "cMin": 11.6, "cMax": 13.6},
    {"cod": "C7", "nome": "APPIO VILLA FIORELLI", "aMin": 6.1, "aMax": 7.9, "bMin": 7.9, "bMax": 11.3, "cMin": 11.3, "cMax": 14.1},
    {"cod": "C8", "nome": "APPIO NOCERA UMBRA", "aMin": 6.1, "aMax": 7.9, "bMin": 7.9, "bMax": 11.3, "cMin": 11.3, "cMax": 14.1},
    {"cod": "C9", "nome": "APPIO METRONIO", "aMin": 6.1, "aMax": 8.6, "bMin": 8.6, "bMax": 12.3, "cMin": 12.3, "cMax": 15.5},
    {"cod": "C10", "nome": "GARBATELLA", "aMin": 6.1, "aMax": 8.2, "bMin": 8.2, "bMax": 11.8, "cMin": 11.8, "cMax": 13.5},
    {"cod": "C11", "nome": "MARCONI", "aMin": 6.1, "aMax": 8.2, "bMin": 8.2, "bMax": 11.8, "cMin": 11.8, "cMax": 13.5},
    {"cod": "C12", "nome": "MONTEVERDE VECCHIO", "aMin": 6.1, "aMax": 9.8, "bMin": 9.8, "bMax": 14.0, "cMin": 14.0, "cMax": 16.0},
    {"cod": "C13", "nome": "MONTEVERDE NUOVO", "aMin": 6.1, "aMax": 8.2, "bMin": 8.2, "bMax": 11.8, "cMin": 11.8, "cMax": 12.8},
    {"cod": "C14", "nome": "AURELIO MONTE DI CRETA", "aMin": 4.7, "aMax": 8.1, "bMin": 8.1, "bMax": 11.6, "cMin": 11.6, "cMax": 12.8},
    {"cod": "C15", "nome": "AURELIO GREGORIO VII", "aMin": 6.1, "aMax": 8.4, "bMin": 8.4, "bMax": 12.0, "cMin": 12.0, "cMax": 15.5},
    {"cod": "C16", "nome": "CAVALLEGGERI", "aMin": 6.1, "aMax": 8.4, "bMin": 8.4, "bMax": 12.0, "cMin": 12.0, "cMax": 14.5},
    {"cod": "C17", "nome": "BALDUINA GIOVENALE", "aMin": 6.1, "aMax": 8.2, "bMin": 8.2, "bMax": 11.8, "cMin": 11.8, "cMax": 12.8},
    {"cod": "C18", "nome": "CIPRO", "aMin": 6.3, "aMax": 8.4, "bMin": 8.4, "bMax": 12.0, "cMin": 12.0, "cMax": 13.5},
    {"cod": "C19", "nome": "PONTE MILVIO FARNESINA", "aMin": 8.8, "aMax": 11.4, "bMin": 11.4, "bMax": 16.3, "cMin": 16.3, "cMax": 17.9},
    {"cod": "C21", "nome": "SALARIO AFRICANO (V.le Libia)", "aMin": 6.1, "aMax": 9.8, "bMin": 9.8, "bMax": 14.0, "cMin": 14.0, "cMax": 15.5},
    {"cod": "C22", "nome": "BATTERIA NOMENTANA LANCIANI", "aMin": 6.1, "aMax": 9.5, "bMin": 9.5, "bMax": 13.6, "cMin": 13.6, "cMax": 14.5},
    {"cod": "C24", "nome": "BOLOGNA", "aMin": 6.5, "aMax": 9.7, "bMin": 9.7, "bMax": 13.8, "cMin": 13.8, "cMax": 15.0},
    {"cod": "C26", "nome": "VILLAGGIO OLIMPICO", "aMin": 6.1, "aMax": 9.0, "bMin": 9.0, "bMax": 12.9, "cMin": 12.9, "cMax": 14.0},
    {"cod": "C27", "nome": "PORTA PORTESE", "aMin": 8.8, "aMax": 10.1, "bMin": 10.1, "bMax": 14.5, "cMin": 14.5, "cMax": 16.0},
    {"cod": "C29", "nome": "CASAL BERTONE", "aMin": 4.2, "aMax": 6.4, "bMin": 6.4, "bMax": 9.1, "cMin": 9.1, "cMax": 12.4},
    {"cod": "C30", "nome": "PIGNETO", "aMin": 4.4, "aMax": 7.3, "bMin": 7.3, "bMax": 10.5, "cMin": 10.5, "cMax": 13.1},
    {"cod": "C31", "nome": "MARCO POLO", "aMin": 6.1, "aMax": 8.2, "bMin": 8.2, "bMax": 11.8, "cMin": 11.8, "cMax": 15.0},
    {"cod": "C32", "nome": "OSTIENSE", "aMin": 6.1, "aMax": 7.7, "bMin": 7.7, "bMax": 11.0, "cMin": 11.0, "cMax": 12.5},
    {"cod": "C35", "nome": "AURELIO MADONNA DEL RIPOSO", "aMin": 6.1, "aMax": 8.2, "bMin": 8.2, "bMax": 11.8, "cMin": 11.8, "cMax": 12.8},
    {"cod": "C38", "nome": "CASILINO MARRANELLA", "aMin": 4.1, "aMax": 6.4, "bMin": 6.4, "bMax": 9.1, "cMin": 9.1, "cMax": 11.9},
    {"cod": "C42", "nome": "VIGNA CLARA", "aMin": 8.8, "aMax": 9.8, "bMin": 9.8, "bMax": 14.0, "cMin": 14.0, "cMax": 15.5},
    {"cod": "C43", "nome": "TRIONFALE IGEA", "aMin": 8.8, "aMax": 10.5, "bMin": 10.5, "bMax": 15.0, "cMin": 15.0, "cMax": 16.5},
    {"cod": "C44", "nome": "CAMILLUCCIA", "aMin": 8.8, "aMax": 11.1, "bMin": 11.1, "bMax": 15.8, "cMin": 15.8, "cMax": 18.1},
    {"cod": "C45", "nome": "NOCETTA", "aMin": 4.4, "aMax": 6.5, "bMin": 6.5, "bMax": 9.3, "cMin": 9.3, "cMax": 12.6},
    {"cod": "C47", "nome": "BALDUINA BELSITO", "aMin": 6.3, "aMax": 8.3, "bMin": 8.3, "bMax": 11.9, "cMin": 11.9, "cMax": 14.3},
    {"cod": "C48", "nome": "TOR MARANCIA NAVIGATORI", "aMin": 6.1, "aMax": 8.2, "bMin": 8.2, "bMax": 11.8, "cMin": 11.8, "cMax": 13.5},
    {"cod": "C51", "nome": "APPIO LATINO", "aMin": 6.1, "aMax": 8.2, "bMin": 8.2, "bMax": 11.8, "cMin": 11.8, "cMax": 13.3},
    {"cod": "C52", "nome": "COLLINA FLEMING", "aMin": 8.8, "aMax": 9.8, "bMin": 9.8, "bMax": 14.0, "cMin": 14.0, "cMax": 15.5},
    {"cod": "D5", "nome": "SAN PAOLO", "aMin": 5.3, "aMax": 7.5, "bMin": 7.5, "bMax": 10.7, "cMin": 10.7, "cMax": 12.6},
    {"cod": "D7", "nome": "PORTUENSE", "aMin": 6.1, "aMax": 8.3, "bMin": 8.3, "bMax": 11.0, "cMin": 11.0, "cMax": 12.8},
    {"cod": "D9", "nome": "COLLI PORTUENSI", "aMin": 6.1, "aMax": 8.3, "bMin": 8.4, "bMax": 12.0, "cMin": 12.0, "cMax": 12.6},
    {"cod": "D11", "nome": "MONTESACRO", "aMin": 5.3, "aMax": 8.0, "bMin": 8.0, "bMax": 11.5, "cMin": 11.5, "cMax": 13.0},
    {"cod": "D15", "nome": "ARDEATINO OTTAVO COLLE", "aMin": 7.0, "aMax": 9.7, "bMin": 9.7, "bMax": 13.8, "cMin": 13.8, "cMax": 15.9},
    {"cod": "D27", "nome": "TALENTI", "aMin": 5.9, "aMax": 8.3, "bMin": 8.3, "bMax": 11.9, "cMin": 11.9, "cMax": 13.7},
    {"cod": "D29", "nome": "EUR", "aMin": 7.0, "aMax": 10.5, "bMin": 10.5, "bMax": 15.1, "cMin": 15.1, "cMax": 16.2},
    {"cod": "D31", "nome": "CASSIA DUE PONTI", "aMin": 8.8, "aMax": 9.2, "bMin": 9.2, "bMax": 13.1, "cMin": 13.1, "cMax": 14.5},
    {"cod": "D32", "nome": "FONTE MERAVIGLIOSA", "aMin": 6.1, "aMax": 9.8, "bMin": 9.8, "bMax": 14.0, "cMin": 14.0, "cMax": 16.5},
    {"cod": "D34", "nome": "MONTAGNOLA", "aMin": 6.4, "aMax": 9.2, "bMin": 9.2, "bMax": 13.2, "cMin": 13.2, "cMax": 15.0},
    {"cod": "D36", "nome": "GROTTAPERFETTA ROMA 70", "aMin": 7.0, "aMax": 9.7, "bMin": 9.7, "bMax": 13.8, "cMin": 13.8, "cMax": 16.0},
    {"cod": "D37", "nome": "APPIA ANTICA", "aMin": 6.7, "aMax": 9.7, "bMin": 9.7, "bMax": 13.8, "cMin": 13.8, "cMax": 15.5},
    {"cod": "D38", "nome": "TINTORETTO", "aMin": 7.0, "aMax": 9.7, "bMin": 9.7, "bMax": 13.8, "cMin": 13.8, "cMax": 16.0},
    {"cod": "D46", "nome": "CONCA D'ORO", "aMin": 5.3, "aMax": 7.9, "bMin": 7.9, "bMax": 11.3, "cMin": 11.3, "cMax": 13.0},
    {"cod": "D47", "nome": "SACCO PASTORE", "aMin": 5.3, "aMax": 7.9, "bMin": 7.9, "bMax": 11.3, "cMin": 11.3, "cMax": 13.0},
    {"cod": "D68", "nome": "CORTINA D'AMPEZZO", "aMin": 8.8, "aMax": 11.0, "bMin": 11.0, "bMax": 14.0, "cMin": 14.0, "cMax": 15.0},
    {"cod": "D69", "nome": "MONTE MARIO ALTO", "aMin": 8.8, "aMax": 11.0, "bMin": 11.0, "bMax": 15.0, "cMin": 15.0, "cMax": 16.4},
    {"cod": "D71", "nome": "NUOVO SALARIO PRATI FISCALI", "aMin": 5.0, "aMax": 8.2, "bMin": 8.2, "bMax": 11.7, "cMin": 11.7, "cMax": 13.4},
    {"cod": "D78", "nome": "FERRATELLA", "aMin": 7.0, "aMax": 9.4, "bMin": 9.4, "bMax": 13.5, "cMin": 13.5, "cMax": 15.0}
  ];

  // ─── I 20 parametri ufficiali (testo esatto della scheda ARPE) ────────
  var PARAMETRI = [
    'Posto auto',
    'Cortile d’uso comune, area verde o impianto sportivo',
    'Cantina',
    'Terrazzo o balcone',
    'Area verde di pertinenza',
    'Aria condizionata',
    'Stabile con ascensore',
    'Bagno con finestra o doppi servizi',
    'Porta blindata',
    'Doppi vetri',
    'Stabile con servizio di portierato',
    'Stabile o UI ultimati o completamente ristrutturati negli ultimi 10 anni',
    'Sistema di sicurezza o sistema di allarme',
    'Cucina abitabile con finestra',
    'Videocitofono o videosorveglianza',
    'Antenna centralizzata o impianto satellitare',
    'Riscaldamento autonomo',
    'Stabile non superiore a 4 piani',
    'Strutture di superamento di barriere architettoniche',
    'Terrazzo o locale condominiale ad uso comune',
  ];

  // ─── Maggiorazioni / riduzioni (A-H come sulla scheda) ────────────────
  // arr: percentuale configurabile (cfg.pArr) — 0 finche' non calibrata.
  var MAGG = [
    { id: 'arr', label: 'A – Ammobiliato', pct: 'cfg' },
    { id: 'sem', label: 'B – Seminterrato', pct: -10 },
    { id: 'asc', label: 'C – Senza ascensore', pct: -10 },
    { id: 'att', label: 'D – Attico', pct: 10 },
    { id: 'clA', label: 'E – Classe energetica A/B/C', pct: 10 },
    { id: 'eco', label: 'F – Interventi Eco Bonus', pct: 5 },
    { id: 'sis', label: 'G – Interventi Sisma Bonus', pct: 10 },
    { id: 'clD', label: 'H – Classe energetica D/E/F', pct: 5 },
  ];

  // Soglie subfascia (n. parametri su 20) e percentuali configurabili.
  var DEFAULT_CFG = { sMed: 3, sMax: 7, pArr: 0, pDur: 0 };

  // ─── Superficie convenzionale (coefficienti ufficiali) ────────────────
  function supConv(input) {
    var mq = Number(input.mq) || 0;
    var box = Number(input.mqBox) || 0;
    var boxPre = !!input.boxPre;
    var pc = Number(input.mqPC) || 0;
    var bal = Number(input.mqBal) || 0;
    var sc = Number(input.mqSc) || 0;
    var ve = Number(input.mqVe) || 0;
    var base, regola;
    if (mq < 46) { base = Math.min(mq * 1.30, 52.90); regola = '× 1,30 (max 52,90)'; }
    else if (mq <= 70) { base = Math.min(mq * 1.15, 70.00); regola = '× 1,15 (max 70,00)'; }
    else { base = mq; regola = '× 1,00'; }
    var parts = [{ n: 'Superficie utile calpestabile', mq: mq, c: regola, v: base }];
    if (box > 0) parts.push({ n: 'Box / posto auto esclusivo' + (boxPre ? ' (zona pregiata)' : ''), mq: box, c: boxPre ? '× 0,80' : '× 0,50', v: box * (boxPre ? 0.80 : 0.50) });
    if (pc > 0) parts.push({ n: 'Posto auto comune', mq: pc, c: '× 0,20', v: pc * 0.20 });
    if (bal > 0) parts.push({ n: 'Balconi / terrazze / cantine', mq: bal, c: '× 0,25', v: bal * 0.25 });
    if (sc > 0) parts.push({ n: 'Superficie scoperta esclusiva', mq: sc, c: '× 0,15', v: sc * 0.15 });
    if (ve > 0) parts.push({ n: 'Verde condominiale (quota)', mq: ve, c: '× 0,10', v: ve * 0.10 });
    var total = parts.reduce(function (a, p) { return a + p.v; }, 0);
    return { total: total, parts: parts };
  }

  // ─── Il calcolo (stessa semantica di scheda-canone.html calc()) ───────
  // input: { zona:{aMin..cMax}, mq, mqBox, boxPre, mqPC, mqBal, mqSc, mqVe,
  //          normale=true, parIdx=[], mag=['arr',...], tipo:'trans'|'stud'|'32',
  //          cfg }
  function computeCanone(input) {
    var cfg = Object.assign({}, DEFAULT_CFG, input.cfg || {});
    var z = input.zona || {};
    if (!(z.aMax > 0 && z.bMax > 0 && z.cMax > 0)) return { ok: false, error: 'zona_non_configurata' };
    var mq = Number(input.mq) || 0;
    if (mq <= 0) return { ok: false, error: 'mq_mancanti' };

    var sup = supConv(input);
    var scv = sup.total;
    var parIdx = Array.isArray(input.parIdx) ? input.parIdx.filter(function (i) { return i >= 0 && i < 20; }) : [];
    var nP = parIdx.length;
    var normale = input.normale !== false;
    var fascia = !normale ? 'A' : nP >= cfg.sMax ? 'C' : nP >= cfg.sMed ? 'B' : 'A';
    var fMin = z[fascia.toLowerCase() + 'Min'];
    var fMax = z[fascia.toLowerCase() + 'Max'];

    var mag = Array.isArray(input.mag) ? input.mag : [];
    var on = function (id) { return mag.indexOf(id) !== -1; };
    var pct = 0, note = [];
    if (input.tipo === 'trans') { pct += 10; note.push('transitorio +10%'); }
    if (cfg.pDur && input.tipo === '32') { pct += cfg.pDur; note.push('durata +' + cfg.pDur + '%'); }
    if (on('arr') && cfg.pArr) { pct += cfg.pArr; note.push('ammobiliato +' + cfg.pArr + '%'); }
    if (on('sem')) { pct -= 10; note.push('seminterrato −10%'); }
    if (on('asc')) { pct -= 10; note.push('senza ascensore −10%'); }
    if (on('att')) { pct += 10; note.push('attico +10%'); }
    if (on('clA')) { pct += 10; note.push('classe A/B/C +10%'); }
    if (on('eco')) { pct += 5; note.push('Eco Bonus +5%'); }
    if (on('sis')) { pct += 10; note.push('Sisma Bonus +10%'); }
    if (on('clD')) { pct += 5; note.push('classe D/E/F +5%'); }

    var f = 1 + pct / 100;
    // Regola dell'accordo: gli incrementi NON superano il massimo di fascia.
    var capMese = fMax * scv;
    var cMax = Math.min(fMax * scv * f, pct > 0 ? capMese : fMax * scv * f);
    var cMin = Math.max(0, fMin * scv * Math.min(f, 1));

    return {
      ok: true, sc: scv, parts: sup.parts, nP: nP, parIdx: parIdx.slice().sort(function (a, b) { return a - b; }),
      normale: normale, fascia: fascia, fMin: fMin, fMax: fMax,
      mag: mag.slice(), pct: pct, note: note, cMin: cMin, cMax: cMax,
      capApplied: pct > 0 && fMax * scv * f > capMese,
    };
  }

  // ─── Zona: match per codice o per nome (substring, case-insensitive) ──
  function matchZone(text) {
    var t = String(text || '').toUpperCase().trim();
    if (!t) return null;
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].cod === t) return ZONES[i];
    var hits = ZONES.filter(function (z) { return t.indexOf(z.nome) !== -1 || z.nome.indexOf(t) !== -1; });
    if (hits.length === 1) return hits[0];
    // parole singole: "TRASTEVERE LOFT" deve trovare TRASTEVERE
    if (!hits.length) {
      var words = t.split(/[^A-ZÀ-Ü']+/).filter(function (w) { return w.length >= 4; });
      var found = ZONES.filter(function (z) {
        return words.some(function (w) { return z.nome.indexOf(w) !== -1; });
      });
      if (found.length === 1) return found[0];
    }
    return null;
  }

  // ─── Parametri derivati dalle feature REALI di immobile/annuncio ──────
  // Solo mappature certe: un parametro spuntato senza un dato che lo provi
  // e' un falso in un documento di attestazione.
  var FEATURE_MAP = [
    { re: /(ascensore|elevator|lift)/i, idx: 6 },
    { re: /(aria.?condizionata|air.?con|\bac\b|climatizz)/i, idx: 5 },
    { re: /(balcon|terrazz|balcony|terrace)/i, idx: 3 },
    { re: /(cantina|cellar)/i, idx: 2 },
    { re: /(posto.?auto|parking|garage|box.?auto)/i, idx: 0 },
    { re: /(portier|concierge|doorman)/i, idx: 10 },
    { re: /(blindata|armou?red.?door)/i, idx: 8 },
    { re: /(doppi.?vetri|double.?glaz)/i, idx: 9 },
    { re: /(allarme|alarm|security.?system)/i, idx: 12 },
    { re: /(videocitofono|video.?intercom|videosorveglianza|cctv)/i, idx: 14 },
    { re: /(satellitare|satellite|antenna.?centralizzata)/i, idx: 15 },
    { re: /(riscaldamento.?autonomo|autonomous.?heating|caldaia.?autonoma)/i, idx: 16 },
    { re: /(giardino.?privato|private.?garden)/i, idx: 4 },
    { re: /(ristrutturat|renovated|refurbish)/i, idx: 11 },
    { re: /(barriere.?architettoniche|disabled.?access|wheelchair)/i, idx: 18 },
  ];
  function deriveParametri(features) {
    var list = (Array.isArray(features) ? features : [features]).filter(Boolean).map(String);
    var out = [], from = {};
    list.forEach(function (feat) {
      FEATURE_MAP.forEach(function (m) {
        if (m.re.test(feat) && out.indexOf(m.idx) === -1) { out.push(m.idx); from[m.idx] = feat; }
      });
    });
    out.sort(function (a, b) { return a - b; });
    return { parIdx: out, from: from };
  }

  // Maggiorazioni derivate da dati certi. 'asc'/'sem'/'eco'/'sis' MAI in
  // automatico: negativi o bonus vanno dichiarati dall'operatore.
  function deriveMaggiorazioni(d, cfg) {
    cfg = Object.assign({}, DEFAULT_CFG, cfg || {});
    var mag = [], why = [];
    if (d && d.furnished && cfg.pArr > 0) { mag.push('arr'); why.push('ammobiliato (annuncio)'); }
    if (d && /(attico|ultimo piano|penthouse)/i.test(String(d.floorText || ''))) { mag.push('att'); why.push('attico (piano)'); }
    var ec = String((d && d.energyClass) || '').toUpperCase().trim();
    if (/^[ABC]/.test(ec)) { mag.push('clA'); why.push('classe ' + ec); }
    else if (/^[DEF]/.test(ec)) { mag.push('clD'); why.push('classe ' + ec); }
    return { mag: mag, why: why };
  }

  // ─── Il solve: la struttura che fa rientrare il canone del contratto ──
  // Usa TUTTI i dati reali disponibili (parametri mappati dalle feature,
  // maggiorazioni provate) + eventuali override dell'operatore, applica il
  // cap e dice se il canone pattuito rientra. Se non rientra NON inventa:
  // riporta lo sforamento esatto e il massimo asseverabile.
  function solve(input) {
    var zona = input.zona || (input.zonaCod || input.zonaText ? matchZone(input.zonaCod || input.zonaText) : null);
    if (!zona) return { ok: false, error: 'zona_non_trovata' };
    var der = deriveParametri(input.features || []);
    var parIdx = Array.isArray(input.parIdx) && input.parIdx.length ? input.parIdx : der.parIdx;
    var derM = deriveMaggiorazioni(input, input.cfg);
    var mag = Array.isArray(input.mag) && input.mag.length ? input.mag : derM.mag;
    var calc = computeCanone(Object.assign({}, input, { zona: zona, parIdx: parIdx, mag: mag }));
    if (!calc.ok) return calc;
    var canone = Number(input.canone) || 0;
    var fits = canone > 0 ? canone <= calc.cMax + 0.005 : null;
    return Object.assign(calc, {
      zona: zona, canone: canone, fits: fits,
      excess: fits === false ? canone - calc.cMax : 0,
      derived: { parametri: der, maggiorazioni: derM },
    });
  }

  var API = {
    ZONES: ZONES, PARAMETRI: PARAMETRI, MAGG: MAGG, DEFAULT_CFG: DEFAULT_CFG,
    supConv: supConv, computeCanone: computeCanone, matchZone: matchZone,
    deriveParametri: deriveParametri, deriveMaggiorazioni: deriveMaggiorazioni,
    solve: solve,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_CANONE = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
