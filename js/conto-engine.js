/* BOOM · IL CONTO DELLA SUA CASA — il magnete dei proprietari, puro.
 *
 * Perché esiste (13/10/2026). La pagina /canone aveva un calcolatore suo,
 * con una tabella zone sua e un'aritmetica sua: +15% all'arredato già
 * selezionato, +15% al transitorio, un tetto a 1,35 volte il massimo di
 * fascia e il punto MEDIO della fascia come cifra in grande. Risultato
 * misurato in Chromium: «€2.262/mese» stampato sopra «tetto zona €1.760»,
 * cioè un canone sopra il massimo dell'Accordo — nullo per l'art. 13 L.
 * 431/98 nella parte eccedente — e quella cifra arrivava nella cassa del
 * Pacchetto da €349 come «canone in fascia». Il motore vero
 * (js/canone-engine.js, lo stesso della scheda ARPE e del Fascicolo) non può
 * produrre un numero sopra il massimo di fascia: gli aumenti si fermano lì.
 *
 * Qui non c'è aritmetica nuova. Il conto COMPONE solo funzioni del motore
 * (computeCanone, supConv, ZONES, PARAMETRI, MAGG) con la configurazione di
 * default — mai settings — così lo schermo, il PDF del server e la scheda
 * ARPE non possono dare due numeri diversi per la stessa casa. Sopra il
 * motore ci sono soltanto: la lista chiusa degli input (normalize), lo
 * stato nell'indirizzo (encode/decode, versionato), il testo da
 * condividere (shareText) e la riga del mercato (marketFor), che esce
 * SOLO sopra il campione del Perito.
 *
 * Quattro regole, tutte in tests/conto/run.mjs:
 *  1. Il numero in grande è il MASSIMO stimato di fascia, mai un punto
 *     medio, e mai sopra fMax × superficie convenzionale (invariante
 *     verificato su tutte le zone).
 *  2. Senza dotazioni dichiarate non si sceglie una fascia per il
 *     proprietario: si mostra il massimo di ciascuna (0, 3, 7 dotazioni).
 *  3. Le dotazioni non si suggeriscono a euro: dichiararne una che la casa
 *     non ha fa restituire l'eccedenza all'inquilino (art. 13) e l'attestazione
 *     non regge. Il conto dice le soglie, non «spunti questa e guadagna X».
 *  4. Il mercato chiede, non firma: la riga esce solo con un campione
 *     sufficiente e porta sempre «prezzi chiesti, superficie commerciale».
 *
 * Exposes window.BOOM_CONTO (browser) and module.exports (Node/tests).
 */
(function (root) {
  'use strict';

  var CANONE = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./canone-engine.js')
    : (root && root.BOOM_CANONE);
  if (!CANONE) throw new Error('BOOM_CONTO: canone-engine non caricato');

  var VERSION = 1;

  // ─── Le zone, così come le ha il motore (una copia sola) ────────────────
  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s'(\-/])([a-zà-ü])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  var ZONES = CANONE.ZONES.map(function (z) {
    return { cod: z.cod, nome: z.nome, label: titleCase(z.nome) };
  }).sort(function (a, b) { return a.label.localeCompare(b.label, 'it'); });
  var BY_COD = {};
  CANONE.ZONES.forEach(function (z) { BY_COD[z.cod] = z; });

  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** La ricerca della zona: elenca TUTTE le corrispondenze, non sceglie mai
   *  al posto del proprietario («Prati» mostra PRATI e NUOVO SALARIO PRATI
   *  FISCALI). Prima il nome esatto, poi chi comincia così, poi il resto. */
  function searchZones(q, limit) {
    var t = fold(q);
    if (!t) return [];
    var words = t.split(' ');
    var scored = [];
    ZONES.forEach(function (z) {
      var name = fold(z.nome), code = z.cod.toLowerCase();
      var all = words.every(function (w) { return name.indexOf(w) !== -1 || code === w; });
      if (!all) return;
      var s = name === t || code === t ? 0 : name.indexOf(t) === 0 ? 1 : 2;
      scored.push({ z: z, s: s });
    });
    scored.sort(function (a, b) { return a.s - b.s || a.z.label.localeCompare(b.z.label, 'it'); });
    return scored.slice(0, limit || 8).map(function (x) { return x.z; });
  }

  // ─── Le maggiorazioni che il proprietario può dichiarare ────────────────
  // L'arredo NON c'è: il motore lo tiene a 0 finché l'organizzazione non
  // calibra la percentuale, e la pagina lo dice invece di inventarla.
  var MAG_PUBLIC = [
    { id: 'asc', kind: 'riduzione', pct: -10, it: 'Senza ascensore', en: 'No lift' },
    { id: 'sem', kind: 'riduzione', pct: -10, it: 'Seminterrato', en: 'Semi-basement' },
    { id: 'att', kind: 'aumento', pct: 10, it: 'Attico', en: 'Penthouse' },
    { id: 'clA', kind: 'aumento', pct: 10, it: 'Classe energetica A, B o C', en: 'Energy class A, B or C' },
    { id: 'clD', kind: 'aumento', pct: 5, it: 'Classe energetica D, E o F', en: 'Energy class D, E or F' },
    { id: 'eco', kind: 'aumento', pct: 5, it: 'Lavori Ecobonus', en: 'Ecobonus works' },
    { id: 'sis', kind: 'aumento', pct: 10, it: 'Lavori Sismabonus', en: 'Seismic-bonus works' },
  ];
  var MAG_IDS = MAG_PUBLIC.map(function (m) { return m.id; });

  var TIPI = {
    '32': { it: '3+2 canone concordato', en: '3+2 agreed-rent lease' },
    trans: { it: 'Transitorio (1–18 mesi)', en: 'Transitional (1–18 months)' },
    stud: { it: 'Studenti universitari', en: 'University students' },
  };

  // I prezzi di BOOM che il conto nomina. Sono COPIE: tests/conto le
  // confronta con api/fiscal/_aspi.js (ASPI_DEFAULTS) e api/_catalog.js —
  // se un prezzo cambia lì, il test cade qui prima che la pagina menta.
  var PRICES = {
    registrazione: 89,
    attestazione: 189,
    primaLocazione: 278,   // registrazione + attestazione, IVA inclusa
    pacchetto: 349,
  };

  // Soglie di fascia del motore (numero di dotazioni su 20).
  var SOGLIE = { B: CANONE.DEFAULT_CFG.sMed, C: CANONE.DEFAULT_CFG.sMax };

  // ─── L'input: lista chiusa, mai un aggiustamento silenzioso ─────────────
  /** Un numero scritto da una persona o letto da un URL. Il punto è
   *  ambiguo: «45.5» (decimale, come lo scrive encode e un input type=number)
   *  e «1.200» (migliaia all'italiana) sono entrambi veri. Regola: con la
   *  virgola, i punti sono migliaia e la virgola il decimale; senza virgola,
   *  il punto è migliaia SOLO se separa gruppi di tre cifre («1.200»,
   *  «12.500»), altrimenti è il decimale. Prima ogni punto si toglieva, e
   *  45,5 mq passati nell'URL diventavano 455 (massimo dieci volte più alto). */
  function parseNum(v) {
    if (typeof v === 'number') return v;
    var t = String(v).trim().replace(/\s+/g, '').replace(/€/g, '');
    if (!/^[+-]?[\d.,]+$/.test(t)) return NaN;
    if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    return Number(t);
  }
  function numIn(v, lo, hi) {
    if (v == null || v === '') return null;
    var n = parseNum(v);
    if (!isFinite(n)) return NaN;
    if (n < lo || n > hi) return NaN;
    return Math.round(n * 100) / 100;
  }

  /** Dalla forma grezza (pagina, URL, corpo della POST) all'input del conto.
   *  Un valore fuori lista NON viene corretto: torna in `errors` e il conto
   *  non parte. */
  function normalize(raw) {
    raw = raw || {};
    var errors = [];
    var z = String(raw.z || '').trim().toUpperCase();
    if (!BY_COD[z]) errors.push('zona');
    var mq = numIn(raw.mq, 10, 600);
    if (mq == null || isNaN(mq)) errors.push('mq');
    var acc = {};
    [['bal', 500], ['box', 200], ['pc', 200], ['sc', 2000], ['ve', 5000]].forEach(function (k) {
      var v = numIn(raw[k[0]], 0, k[1]);
      if (isNaN(v)) errors.push(k[0]);
      acc[k[0]] = v == null || isNaN(v) ? 0 : v;
    });
    var p = null;
    if (raw.p != null && raw.p !== '') {
      var list = Array.isArray(raw.p) ? raw.p : String(raw.p) === '-' ? [] : String(raw.p).split('.');
      p = [];
      for (var i = 0; i < list.length; i++) {
        var n = Number(list[i]);
        if (!(Number.isInteger(n) && n >= 0 && n < 20)) { errors.push('p'); break; }
        if (p.indexOf(n) === -1) p.push(n);
      }
      p.sort(function (a, b) { return a - b; });
    }
    var mag = [];
    var mlist = raw.m == null || raw.m === '' ? [] : Array.isArray(raw.m) ? raw.m : String(raw.m).split('.');
    for (var j = 0; j < mlist.length; j++) {
      if (MAG_IDS.indexOf(mlist[j]) === -1) { errors.push('m'); break; }
      if (mag.indexOf(mlist[j]) === -1) mag.push(mlist[j]);
    }
    if (mag.indexOf('clA') !== -1 && mag.indexOf('clD') !== -1) errors.push('m');
    var t = raw.t == null || raw.t === '' ? '32' : String(raw.t);
    var tipoOk = Object.prototype.hasOwnProperty.call(TIPI, t);
    if (!tipoOk) errors.push('t');
    var ask = numIn(raw.ask, 1, 50000); if (isNaN(ask)) { errors.push('ask'); ask = null; }
    var imu = numIn(raw.imu, 1, 100000); if (isNaN(imu)) { errors.push('imu'); imu = null; }
    var n0 = raw.n === 0 || raw.n === '0' || raw.n === false || raw.n === 'false';
    var input = {
      v: VERSION, z: z, mq: mq, bal: acc.bal, box: acc.box,
      // `bp` nell'URL, `boxPre` nell'input già normalizzato (quello che la
      // pagina manda al server): le due forme valgono uguale.
      boxPre: [raw.bp, raw.boxPre].some(function (x) { return x === 1 || x === '1' || x === true; }),
      pc: acc.pc, sc: acc.sc, ve: acc.ve, p: p, n: !n0, m: mag, t: tipoOk ? t : '32', ask: ask, imu: imu,
    };
    return { ok: errors.length === 0, input: input, errors: errors };
  }

  function engineInput(inp, nP, tipo) {
    var parIdx = inp.p ? inp.p.slice() : [];
    if (nP != null) { parIdx = []; for (var i = 0; i < nP; i++) parIdx.push(i); }
    return {
      zona: BY_COD[inp.z], mq: inp.mq, mqBal: inp.bal, mqBox: inp.box, boxPre: inp.boxPre, mqPC: inp.pc,
      mqSc: inp.sc, mqVe: inp.ve, parIdx: parIdx, normale: inp.n, mag: inp.m, tipo: tipo || inp.t,
      // Mai settings: la configurazione di default, quella che il server
      // ricalcola. La maggiorazione dell'arredo resta 0 finché
      // l'organizzazione firmataria non la calibra.
      cfg: CANONE.DEFAULT_CFG,
    };
  }

  // Si arrotonda il mensile all'euro PRIMA e tutto il resto deriva da lì:
  // schermo e PDF non possono differire di un centesimo. Il MASSIMO si
  // arrotonda per difetto (mai un euro sopra il tetto di legge: €1.435,60 è
  // €1.435, non €1.436), il minimo per eccesso.
  function euro(n) { return Math.floor(n + 1e-9); }
  function euroSu(n) { return Math.ceil(n - 1e-9); }

  /** Il conto. `inp` è l'input normalizzato. */
  function conto(inp) {
    if (!inp || !BY_COD[inp.z]) return { ok: false, error: 'zona' };
    if (!(inp.mq >= 10)) return { ok: false, error: 'mq' };
    var zona = BY_COD[inp.z];
    var declared = Array.isArray(inp.p);
    var calc = CANONE.computeCanone(engineInput(inp, declared ? null : 0));
    if (!calc.ok) return { ok: false, error: calc.error };

    // Il massimo di ciascuna fascia (0, 3, 7 dotazioni), stesso tipo e stesse
    // maggiorazioni: è ciò che si mostra finché le dotazioni non sono dette.
    var fasce = {};
    [['A', 0], ['B', SOGLIE.B], ['C', SOGLIE.C]].forEach(function (f) {
      var r = CANONE.computeCanone(engineInput(inp, f[1]));
      fasce[f[0]] = { max: euro(r.cMax), min: euroSu(r.cMin), fMin: r.fMin, fMax: r.fMax };
    });
    if (!inp.n) { fasce.B = null; fasce.C = null; }

    var max = declared ? euro(calc.cMax) : null;
    var min = declared ? euroSu(calc.cMin) : null;

    // Per tipo di contratto: di norma lo stesso (gli aumenti si fermano al
    // massimo di fascia); cambia solo quando una riduzione è dichiarata.
    var perTipo = {};
    Object.keys(TIPI).forEach(function (t) {
      var r = CANONE.computeCanone(engineInput(inp, declared ? null : 0, t));
      perTipo[t] = euro(r.cMax);
    });
    var vals = Object.keys(perTipo).map(function (k) { return perTipo[k]; });
    var sameAcrossTipi = vals.every(function (v) { return v === vals[0]; });

    var res = {
      ok: true, v: VERSION, input: inp,
      zone: { cod: zona.cod, nome: zona.nome, label: titleCase(zona.nome) },
      sc: Math.round(calc.sc * 100) / 100, parts: calc.parts.map(function (p) {
        return { n: p.n, mq: p.mq, c: p.c, v: Math.round(p.v * 100) / 100 };
      }),
      declared: declared, nP: declared ? calc.nP : null, normale: inp.n,
      fascia: declared ? calc.fascia : null, fMin: declared ? calc.fMin : null, fMax: declared ? calc.fMax : null,
      max: max, min: min, fasce: fasce,
      pct: calc.pct, note: calc.note, capApplied: !!calc.capApplied,
      tipo: inp.t, perTipo: perTipo, sameAcrossTipi: sameAcrossTipi,
      soglie: { B: SOGLIE.B, C: SOGLIE.C },
    };

    // La prossima soglia: si dice QUANTE dotazioni servono, mai quali
    // spuntare né quanti euro valgono (regola 3).
    if (declared && inp.n && calc.fascia !== 'C') {
      var to = calc.fascia === 'A' ? 'B' : 'C';
      res.next = { fascia: to, need: SOGLIE[to] - calc.nP };
    }

    if (declared) {
      var annuo = max * 12;
      res.annuo = annuo;
      res.cedolare = Math.round(annuo * 0.10);
      res.netto = annuo - res.cedolare;
      res.imuRisparmio = inp.imu ? Math.round(inp.imu * 0.25) : null;
      // Il pareggio col libero (4+4, cedolare al 21%): sopra questa cifra il
      // libero renderebbe di più, a parità di altri costi. Solo per il 3+2:
      // a Roma il transitorio e lo studentato seguono comunque le fasce.
      if (inp.t === '32') {
        var mensileNetto = max * 0.90 + (inp.imu ? inp.imu * 0.25 / 12 : 0);
        res.pareggioLibero = Math.round(mensileNetto / 0.79);
      }
    }

    // «Quanto vorrebbe chiedere?» — la domanda vera del proprietario.
    if (inp.ask) {
      if (declared) {
        res.ask = { value: inp.ask, fits: inp.ask <= max, excess: inp.ask > max ? Math.round(inp.ask - max) : 0 };
      } else {
        var need = null;
        if (inp.ask <= fasce.A.max) need = 0;
        else if (fasce.B && inp.ask <= fasce.B.max) need = SOGLIE.B;
        else if (fasce.C && inp.ask <= fasce.C.max) need = SOGLIE.C;
        res.ask = { value: inp.ask, need: need, fits: need === 0 ? true : need == null ? false : null,
          excess: need == null ? Math.round(inp.ask - (fasce.C ? fasce.C.max : fasce.A.max)) : 0 };
      }
    }
    return res;
  }

  // ─── Lo stato nell'indirizzo: niente dati personali, versione esplicita ──
  function encode(inp) {
    var q = ['v=' + VERSION, 'z=' + encodeURIComponent(inp.z), 'mq=' + inp.mq];
    if (inp.bal) q.push('bal=' + inp.bal);
    if (inp.box) q.push('box=' + inp.box);
    if (inp.box && inp.boxPre) q.push('bp=1');
    if (inp.pc) q.push('pc=' + inp.pc);
    if (inp.sc) q.push('sc=' + inp.sc);
    if (inp.ve) q.push('ve=' + inp.ve);
    if (Array.isArray(inp.p)) q.push('p=' + (inp.p.length ? inp.p.join('.') : '-'));
    if (inp.n === false) q.push('n=0');
    if (inp.m && inp.m.length) q.push('m=' + inp.m.join('.'));
    if (inp.t && inp.t !== '32') q.push('t=' + inp.t);
    if (inp.ask) q.push('ask=' + inp.ask);
    if (inp.imu) q.push('imu=' + inp.imu);
    return q.join('&');
  }

  /** Legge l'indirizzo. Una versione sconosciuta si RIFIUTA: reinterpretare
   *  gli indici delle dotazioni con un ordine diverso cambierebbe il conto
   *  di chi l'ha mandato a qualcuno. */
  function decode(qs) {
    var s = String(qs || '').replace(/^[?#]/, '');
    var o = {};
    s.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i === -1 ? kv : kv.slice(0, i);
      var v = i === -1 ? '' : kv.slice(i + 1);
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { /* lascia grezzo */ }
      o[k] = v;
    });
    if (!o.z) return { ok: false, empty: true };
    if (o.v != null && String(o.v) !== String(VERSION)) return { ok: false, error: 'versione' };
    return normalize(o);
  }

  // ─── Numeri e testi ─────────────────────────────────────────────────────
  // Migliaia deterministiche (mai toLocaleString: con ICU ridotta degrada).
  function fmtEur(n, lang) {
    var s = String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.');
    return '€' + s;
  }
  function fmtNum(n, dec, lang) {
    var f = (Number(n) || 0).toFixed(dec == null ? 2 : dec);
    var parts = f.split('.');
    var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.');
    return parts[1] ? int + (lang === 'en' ? '.' : ',') + parts[1] : int;
  }

  /** Il testo da mandare (WhatsApp, commercialista, coniuge). Mai dati
   *  personali: zona, metri e numeri, più il link che rifà il conto. */
  function shareText(r, lang, url) {
    if (!r || !r.ok) return '';
    var en = lang === 'en';
    var where = r.zone.label + ' (' + fmtNum(r.input.mq, 0, lang) + (en ? ' sqm' : ' mq') + ')';
    var head;
    if (r.declared) {
      head = en
        ? 'My home in ' + where + ': agreed rent (canone concordato) up to ' + fmtEur(r.max, lang) + ' a month, band ' + r.fascia + ' (' + r.nP + ' of 20 features).'
        : 'Il conto della casa a ' + where + ': a canone concordato fino a ' + fmtEur(r.max, lang) + ' al mese, fascia ' + r.fascia + ' (' + r.nP + ' dotazioni su 20).';
    } else if (!r.fasce.C) {
      // Impianti non tutti funzionanti: l'Accordo applica la fascia A, un numero solo.
      head = en
        ? 'My home in ' + where + ': agreed rent (canone concordato) up to ' + fmtEur(r.fasce.A.max, lang) + ' a month (band A).'
        : 'Il conto della casa a ' + where + ': a canone concordato fino a ' + fmtEur(r.fasce.A.max, lang) + ' al mese (fascia A).';
    } else {
      head = en
        ? 'My home in ' + where + ': agreed rent (canone concordato) with a maximum between ' + fmtEur(r.fasce.A.max, lang) + ' and ' + fmtEur(r.fasce.C.max, lang) + ' a month, depending on its features.'
        : 'Il conto della casa a ' + where + ': a canone concordato il massimo è tra ' + fmtEur(r.fasce.A.max, lang) + ' e ' + fmtEur(r.fasce.C.max, lang) + ' al mese, secondo le dotazioni.';
    }
    var lines = [head];
    if (r.declared && r.pareggioLibero) {
      lines.push(en
        ? 'A free-market 4+4 would pay more only above ' + fmtEur(r.pareggioLibero, lang) + ' a month (flat tax, same other costs).'
        : 'Il libero 4+4 renderebbe di più solo sopra ' + fmtEur(r.pareggioLibero, lang) + ' al mese (cedolare secca, a parità di altri costi).');
    }
    lines.push(en ? 'Rome territorial agreement tables (2023). Estimate, not the attestation.' : 'Tabelle dell\'Accordo territoriale di Roma (2023). Stima, non è l\'attestazione.');
    if (url) lines.push(url);
    return lines.join('\n');
  }

  /** Il massimo in una riga: «€1.288» se c'è un numero solo (dotazioni
   *  dette, o fascia A obbligata), «tra €896 e €1.540» altrimenti. */
  function rangeText(r, lang) {
    if (!r || !r.ok) return '';
    if (r.declared) return fmtEur(r.max, lang);
    if (!r.fasce.C) return fmtEur(r.fasce.A.max, lang);
    return (lang === 'en' ? 'between ' : 'tra ') + fmtEur(r.fasce.A.max, lang) + (lang === 'en' ? ' and ' : ' e ') + fmtEur(r.fasce.C.max, lang);
  }

  // ─── Il mercato (il Perito): solo coppie certe zona Accordo → zona mercato ─
  // Gli slug sono quelli di normalizeZone sui nomi del lessico di
  // radar-engine (ROME_ZONES). Una zona dell'Accordo che non ha una
  // corrispondenza netta NON ha riga di mercato: meglio niente che il
  // quartiere sbagliato.
  var MARKET_OF = {
    B1: 'testaccio', B2: 'aventino', B3: 'celio', B4: 'monti', B12: 'aventino', B14: 'trastevere', B15: 'borgo',
    B17: 'castro-pretorio', B18: 'esquilino', B25: 'ludovisi', B31: 'centro-storico',
    C1: 'parioli', C3: 'pinciano', C4: 'nomentano', C5: 'san-lorenzo', C10: 'garbatella', C11: 'marconi',
    C12: 'monteverde', C13: 'monteverde', C15: 'aurelio', C16: 'aurelio', C18: 'cipro', C19: 'ponte-milvio',
    C21: 'trieste', C24: 'bologna', C26: 'flaminio', C29: 'tiburtino', C30: 'pigneto', C32: 'ostiense',
    C40: 'prati', C41: 'prati', C42: 'vigna-clara', C43: 'trionfale', C44: 'vigna-clara', C46: 'trieste',
    C48: 'ardeatino', C49: 'flaminio', C50: 'flaminio', C51: 'appio-latino', C52: 'vigna-clara',
    D5: 'ostiense', D7: 'portuense', D9: 'monteverde', D11: 'montesacro', D15: 'ardeatino', D27: 'montesacro',
    D29: 'eur', D34: 'ardeatino', D36: 'ardeatino', D46: 'montesacro', D47: 'montesacro', D71: 'montesacro',
  };

  /** La riga del mercato per una zona dell'Accordo, dalla risposta di
   *  /api/meteo. null se la zona non ha corrispondenza, se il Perito la sta
   *  ancora misurando o se il campione è sotto la soglia. */
  function marketFor(cod, meteo) {
    var slug = MARKET_OF[cod];
    if (!slug || !meteo || !Array.isArray(meteo.zones)) return null;
    var minSample = Number(meteo.minSample) > 0 ? Number(meteo.minSample) : 8;
    for (var i = 0; i < meteo.zones.length; i++) {
      var z = meteo.zones[i];
      if (z.slug !== slug) continue;
      var a = z.asked;
      if (!a || !(Number(a.medianEurSqm) > 0) || !(Number(a.sample) >= minSample)) return null;
      return {
        slug: slug, name: z.zone, median: Number(a.medianEurSqm), p25: Number(a.p25) || null, p75: Number(a.p75) || null,
        sample: Number(a.sample), updatedAt: z.updatedAt || null,
      };
    }
    return null;
  }

  var API = {
    VERSION: VERSION, ZONES: ZONES, PARAMETRI: CANONE.PARAMETRI, MAG_PUBLIC: MAG_PUBLIC, TIPI: TIPI,
    PRICES: PRICES, SOGLIE: SOGLIE, MARKET_OF: MARKET_OF,
    searchZones: searchZones, normalize: normalize, conto: conto, encode: encode, decode: decode,
    shareText: shareText, rangeText: rangeText, marketFor: marketFor, fmtEur: fmtEur, fmtNum: fmtNum, fold: fold,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_CONTO = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
