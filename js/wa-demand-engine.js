/* js/wa-demand-engine.js — IL MISURATORE DELLA DOMANDA.
 *
 * PERCHÉ. Le 48 risposte rapide di js/whatsapp-replies.js sono state scritte
 * a ragionamento: coprono il giro del mestiere, ma NON sono ordinate su ciò
 * che i clienti di BOOM chiedono davvero. Installarne 48 a mano prima di
 * saperlo è lavoro speso a caso — e le prime dieci decidono se lo strumento
 * entra nell'abitudine o muore nel telefono.
 *
 * COSA FA. Prende il corpus che BOOM ha GIÀ — i thread WhatsApp ridotti dalla
 * Miniera (parole vere del cliente, campioni corti: decisione D2), i lead coi
 * loro messaggi, e le bozze approvate in action_queue — e risponde a tre
 * domande, in quest'ordine:
 *   1. QUALI DOMANDE ARRIVANO, e quante volte (per CONVERSAZIONE, non per
 *      messaggio: chi ripete "deposito" cinque volte resta una conversazione
 *      che aveva bisogno di quella risposta, una volta).
 *   2. QUANTO TEMPO SALVA ognuna. È la domanda che conta ed è diversa dalla
 *      prima: una richiesta che arriva 40 volte e si liquida con "sì, libero"
 *      vale meno di una che arriva 12 volte e ogni volta costa quattro minuti
 *      di digitazione (documenti, costi totali, come si chiude). Il costo NON
 *      è inventato qui: arriva da fuori (`costOf`), derivato dalla lunghezza
 *      VERA della risposta che la copre.
 *   3. COSA NON HA ANCORA UNA RISPOSTA. Un'intenzione con volume vero e
 *      nessuna scorciatoia che la copra è una risposta DA SCRIVERE — e questo
 *      motore è fatto per poter dichiarare incompleto il catalogo che lo
 *      accompagna, altrimenti sarebbe una conferma, non una misura.
 *
 * LE REGOLE DURE (le stesse della casa):
 * - Sotto campione NON esce una percentuale (lezione D4 del Perito, già
 *   pagata nella Miniera): i CONTEGGI sono fatti, le quote sono un'affermazione.
 * - Si misura solo ciò che scrive il CLIENTE. Le nostre uscite (action_queue)
 *   stanno in un corpus separato: servono a vedere cosa scriviamo noi, e non
 *   devono mai gonfiare la domanda con le nostre stesse parole.
 * - Quello che il motore non sa nominare non sparisce: esce come `unmatched`,
 *   con le frasi vere. Una classificazione silenziosa è indistinguibile da un
 *   difetto, e qui è proprio la parte ignota che vale (sono le risposte che
 *   nessuno ha ancora pensato).
 * - Zero token: solo grammatica. Deve poter girare su tutto l'archivio senza
 *   che costi nulla, e deve dare lo stesso risultato due volte.
 *
 * Puro: niente rete, niente Firebase, niente DOM; `now` arriva da fuori.
 * UMD come boom-geo / miniera-engine → window.BOOM_WADEMAND.
 */
(function (root) {
  'use strict';

  /* ── LE INTENZIONI ────────────────────────────────────────────────────
   * `covers` sono le scorciatoie di js/whatsapp-replies.js che rispondono.
   * Vuoto = nessuna risposta esiste ancora (candidata da scrivere). Il test
   * verifica che ogni scorciatoia nominata esista davvero: se una viene
   * rinominata, la mappa non può restare a puntare nel vuoto in silenzio.
   * `no` è l'anti-pattern: toglie i falsi positivi che si fanno male da soli
   * (un cliente che scrive "ho pagato" non sta chiedendo COME si paga).
   */
  var INTENTS = [
    { key: 'disponibilita', side: 'client', label: 'È ancora libero? da quando?',
      covers: ['enhomes', 'itcase'],
      re: /\b(ancora (libero|disponibil)|still available|is it available|availability|disponibil|libero da|available from|da quando|when.*(free|available)|move[- ]in date)/i },

    { key: 'prezzo_totale', side: 'client', label: 'Quanto costa in tutto (spese incluse)',
      covers: ['enprice', 'itcosti'],
      re: /\b(quanto cost|how much|prezzo|price|all[- ]?in|spese (comprese|incluse|condominial)|bollette|utilities included|bills included|total cost|monthly cost)/i },

    { key: 'commissione', side: 'client', label: 'Commissione di agenzia',
      covers: ['enprice', 'itcosti'],
      re: /\b(commission|agency fee|provvigion|quanto prendete|fee.*(agency|agenzia)|costi di agenzia)/i },

    { key: 'deposito', side: 'client', label: 'Deposito: quanto, e quando torna',
      covers: ['enprice', 'itcosti', 'endep'],
      re: /\b(deposito|deposit|cauzion|caparra|security deposit|quante mensilit|months.*deposit)/i },

    { key: 'visita', side: 'client', label: 'Voglio vederlo — quando?',
      covers: ['enbook', 'itvisita'],
      re: /\b(visit(a|are|arlo|e)?|vedere|vederlo|vederla|viewing|see (it|the (flat|apartment|place))|appuntament|quando posso|can i (see|visit|come)|schedule a (viewing|visit))/i },

    { key: 'video_foto', side: 'client', label: 'Foto, video, visita a distanza',
      covers: ['envideo', 'enbook'],
      re: /\b(altre foto|more photos|foto|photos?|video|virtual (tour|viewing)|videochiamat|video call|facetime|planimetri|floor ?plan)/i },

    { key: 'documenti', side: 'client', label: 'Che documenti servono / garanzie',
      covers: ['endocs', 'itdoc'],
      re: /\b(documenti|documents|garante|guarantor|busta paga|payslip|proof of income|contratto di lavoro|employment contract|requisiti|requirements|cosa (vi )?serve|what do you need)/i },

    { key: 'contratto', side: 'client', label: 'Che contratto è, durata, registrazione',
      covers: ['enapply', 'encheck'],
      re: /\b(contratt|contract|transitorio|cedolare|registrat|registered|durata|lease|minimo (di )?mesi|minimum stay|how many months|rinnovabil|renewable)/i },

    { key: 'residenza', side: 'client', label: 'Posso prendere la residenza?',
      covers: [],
      re: /\b(residenz|residency|residence (registration|permit)|anagrafe|iscrizione anagrafic|register.*(residence|address)|permesso di soggiorno)/i },

    { key: 'burocrazia', side: 'client', label: 'Codice fiscale, utenze, SIM, banca',
      covers: ['enconc', 'enguide'],
      re: /\b(codice fiscale|tax code|utenze|utilities|allacci|sim card|conto (in banca|corrente)|bank account|tessera sanitaria|health card)/i },

    { key: 'zona_distanza', side: 'client', label: 'Dov\'è, quanto dista da università/lavoro',
      covers: ['enstud', 'enhomes'],
      re: /\b(quanto dista|how far|distanza|distance|vicino a|close to|metro|autobus|\bbus\b|minuti da|minutes (from|to)|indirizzo|address|quale zona|which (area|zone)|luiss|sapienza|john cabot|roma tre|lumsa)/i },

    { key: 'arredo_servizi', side: 'client', label: 'Arredato? lavatrice, wifi, aria, ascensore',
      covers: [],
      re: /\b(arredat|furnish|unfurnished|\bmobili\b|lavatrice|washing machine|lavastovigl|dishwasher|wi-?fi|internet|aria condizionata|air con|ascensore|\blift\b|elevator|balcon|terrazz|riscaldament|heating)/i },

    { key: 'chi_abita', side: 'client', label: 'Coppia, amici, animali: chi può abitarci',
      covers: [],
      re: /\b(in due|coppia|couple|my (girlfriend|boyfriend|partner|wife|husband)|due persone|two (people|of us)|amic|friend|coinquilin|flatmate|shar(e|ing)|animal|cane|gatto|\bpet\b|\bdog\b|\bcat\b|bambin|\bkids?\b|children|famiglia|\bfamily\b)/i },

    { key: 'trattativa', side: 'client', label: 'Si può trattare sul prezzo',
      covers: [],
      re: /\b(trattabil|si può trattare|sconto|discount|negoti|lower (the )?price|fuori budget|troppo car|too expensive|best price)/i },

    { key: 'fiducia', side: 'client', label: 'Chi siete, è una truffa?',
      covers: ['entrust'],
      re: /\b(truffa|\bscam\b|fake|siete (una )?agenzia|are you (an )?agency|real agency|verificat|come faccio a fidarmi|how do i know|trust(worthy)?|partita iva|registered company)/i },

    { key: 'pagamento', side: 'client', label: 'Come si paga (canone, bonifico, carta)',
      covers: ['enpay'],
      re: /\b(come (si )?paga|how (do i|to) pay|bonific|bank transfer|iban|carta di credito|credit card|domiciliazion|direct debit|\bsepa\b|payment method)\b/i,
      no: /\b(ho (già )?pagat|i (have )?paid|payment (sent|done)|pagato ieri)/i },

    /* ── inquilino in casa ─────────────────────────────────────────── */
    { key: 'guasto', side: 'tenant', label: 'Qualcosa non funziona',
      covers: ['enfix'],
      re: /\b(non funziona|doesn'?t work|is broken|rotto|guast|perdita d'acqua|leak|caldaia|boiler|no hot water|senza (acqua|luce|gas)|no (power|water|heating)|riparazion|repair|idraulic|plumber)/i },

    { key: 'uscita', side: 'tenant', label: 'Disdetta, uscita, deposito indietro',
      covers: ['enend', 'endep'],
      re: /\b(disdetta|preavviso|notice period|move out|moving out|lascio (la casa|l'appartamento)|fine contratto|end of (the )?(lease|contract)|riavere il deposito|deposit back)/i },

    { key: 'rinnovo', side: 'tenant', label: 'Voglio restare / rinnovare',
      covers: ['enend'],
      re: /\b(rinnov|renew|extend (my|the) (stay|lease|contract)|restare (ancora|altri)|stay longer|proroga)/i },

    /* ── proprietari ───────────────────────────────────────────────── */
    { key: 'prop_gestione', side: 'owner', label: 'Proprietario: come lavorate, quanto costa',
      covers: ['prciao', 'prgest'],
      re: /\b(ho un (appartamento|immobile|bilocale|trilocale)|sono (il )?proprietari|my (apartment|property) (to rent|is empty)|affittare il mio|gestione (del mio )?immobile|quanto prendete di provvigione|vostre condizioni)/i },

    { key: 'prop_canone', side: 'owner', label: 'Proprietario: quanto posso chiedere',
      covers: ['prcanone', 'prpack'],
      re: /\b(quanto posso (chiedere|affittarlo)|a quanto si affitta|valutazione|quanto rende|canone concordato|cedolare secca|how much (can i|could i) (rent|get))/i },

    /* ── aziende ed enti ───────────────────────────────────────────── */
    { key: 'b2b', side: 'b2b', label: 'Azienda/ente: alloggi per persone nostre',
      covers: ['azimpresa', 'azuni', 'azric'],
      re: /\b(our (\w+ )?(employee|staff|team|people|students|researchers)|relocat\w+ (our|their|an employee)|nostri (dipendenti|studenti|ricercatori)|azienda|company (housing|let|name)|fattura (alla|intestata)|invoice.*(company|vat)|università|university|ricercator|researcher|\berc\b|marie[- ]curie|hr manager|relocation (of|for) (our|an) )/i },
  ];

  var SIDES = { client: 'Cliente', tenant: 'Inquilino', owner: 'Proprietario', b2b: 'Azienda/Ente' };

  /* Il rumore che non è una domanda: tenerlo fuori dal denominatore, o la
   * quota di "non classificato" racconta una difficoltà che non esiste. */
  var NOISE = /^(\s*(ok(ay)?|va bene|perfetto|perfect|grazie( mille)?|thanks?( you)?|thank you|ciao|hi|hello|buongiorno|buonasera|salve|good (morning|evening)|👍|🙏|❤️|si|sì|yes|no|👌|ok grazie)[\s.!,;:]*)+$/i;

  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }

  /** Multi-etichetta: un messaggio può chiedere due cose insieme, ed è la
   *  norma ("è ancora libero? e quanto costa in tutto?"). */
  function classify(text) {
    var t = clean(text);
    if (!t || NOISE.test(t)) return [];
    var out = [];
    for (var i = 0; i < INTENTS.length; i++) {
      var it = INTENTS[i];
      if (!it.re.test(t)) continue;
      if (it.no && it.no.test(t)
        && !it.re.test(t.replace(new RegExp(it.no.source, 'gi'), ' '))) continue;
      out.push(it.key);
    }
    return out;
  }

  var isNoise = function (t) { var c = clean(t); return !c || NOISE.test(c); };

  /* ── i corpus: una VOCE per conversazione, mai per messaggio ─────────── */

  /** I thread ridotti dalla Miniera (parole del cliente, già clippate). */
  function corpusFromThreads(threads, opts) {
    opts = opts || {};
    return (threads || []).map(function (t) {
      if (!t) return null;
      var row = t.row || t;
      var text = [row.firstInText, row.inSample, row.lastInText].filter(Boolean).join(' · ');
      if (!clean(text)) return null;
      return {
        source: 'whatsapp',
        id: row.chatId || row.phone || '',
        text: text,
        at: row.lastTs || row.firstTs || null,
        role: t.role || 'unknown',
        converted: !!(t.contract || t.viewing),
      };
    }).filter(Boolean);
  }

  /** I lead: esistono anche senza il Mac acceso, quindi la misura non è mai
   *  a zero solo perché l'estrattore non ha girato. */
  function corpusFromLeads(leads) {
    return (leads || []).map(function (l) {
      if (!l) return null;
      var text = [l.message, l.raw && l.raw.message, l.notes].filter(function (x) {
        return typeof x === 'string';
      }).join(' · ');
      if (!clean(text)) return null;
      var at = l.createdAt || l.at || null;
      return {
        source: 'lead',
        id: l.id || l.phone || l.email || '',
        text: text,
        at: typeof at === 'string' ? Date.parse(at) || null : (at && at.seconds ? at.seconds * 1000 : at),
        role: 'lead',
        converted: l.status === 'converted' || l.status === 'won',
      };
    }).filter(Boolean);
  }

  /** Quello che scriviamo NOI (bozze approvate). Corpus separato: serve a
   *  vedere cosa ci costa scrivere, non a gonfiare la domanda del cliente. */
  function corpusFromActions(actions) {
    return (actions || []).map(function (a) {
      if (!a || !a.payload) return null;
      var text = a.payload.message || a.payload.text || a.payload.body || '';
      if (!clean(text)) return null;
      return { source: 'nostra-uscita', id: a.id || '', text: text, at: a.createdAt || null };
    }).filter(Boolean);
  }

  /* ── LA MISURA ───────────────────────────────────────────────────────── */
  var D = 24 * 3600 * 1000;

  /**
   * @param items   corpus del CLIENTE (thread + lead)
   * @param opts.costOf(covers[]) → minuti che costa scrivere quella risposta
   *                a mano. Derivato fuori dalla lunghezza vera del testo.
   * @param opts.defaultMinutes  costo di un'intenzione SCOPERTA (non si può
   *                leggere da una risposta che non esiste: si dichiara).
   * @param opts.minSample  sotto questo numero di conversazioni classificate
   *                escono i conteggi ma NESSUNA percentuale.
   */
  function measure(items, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var days = opts.days || 180;
    var minSample = opts.minSample == null ? 30 : opts.minSample;
    var costOf = typeof opts.costOf === 'function' ? opts.costOf : function () { return opts.defaultMinutes || 2; };
    var defMin = opts.defaultMinutes || 2;

    var pool = (items || []).filter(function (x) {
      return x && clean(x.text) && (!x.at || (now - x.at) <= days * D);
    });

    var acc = {};
    INTENTS.forEach(function (it) {
      acc[it.key] = { key: it.key, label: it.label, side: it.side, covers: it.covers.slice(),
        count: 0, converted: 0, lastAt: null, samples: [] };
    });

    var classified = 0, noise = 0;
    var unmatched = [];
    pool.forEach(function (x) {
      if (isNoise(x.text)) { noise++; return; }
      var keys = classify(x.text);
      if (!keys.length) { unmatched.push(x); return; }
      classified++;
      keys.forEach(function (k) {
        var a = acc[k];
        a.count++;                                   // per CONVERSAZIONE
        if (x.converted) a.converted++;
        if (!a.lastAt || (x.at && x.at > a.lastAt)) a.lastAt = x.at || a.lastAt;
        if (a.samples.length < 4) a.samples.push(clean(x.text).slice(0, 160));
      });
    });

    var considered = pool.length - noise;
    var enough = classified >= minSample;

    var intents = Object.keys(acc).map(function (k) { return acc[k]; })
      .filter(function (a) { return a.count > 0; })
      .map(function (a) {
        var minutes = a.covers.length ? costOf(a.covers) : defMin;
        return {
          key: a.key, label: a.label, side: a.side, sideLabel: SIDES[a.side] || a.side,
          covers: a.covers, covered: a.covers.length > 0,
          count: a.count,
          share: enough && considered ? Math.round((a.count / considered) * 1000) / 10 : null,
          minutesEach: Math.round(minutes * 10) / 10,
          minutesSaved: Math.round(a.count * minutes),
          converted: a.converted,
          lastAt: a.lastAt,
          samples: a.samples,
        };
      })
      .sort(function (x, y) { return y.minutesSaved - x.minutesSaved || y.count - x.count; });

    // Le buche: volume vero e nessuna risposta che le copra. Sono l'unica
    // parte del rapporto che chiede di SCRIVERE qualcosa di nuovo, quindi
    // non si mescola col resto.
    var gaps = intents.filter(function (i) { return !i.covered; });

    return {
      window: { days: days, until: now },
      totals: {
        conversations: pool.length, noise: noise, considered: considered,
        classified: classified, unmatched: unmatched.length,
        coverage: enough && considered ? Math.round((classified / considered) * 1000) / 10 : null,
      },
      sufficient: enough, minSample: minSample,
      intents: intents,
      gaps: gaps,
      // Ciò che il motore non sa nominare, con le parole vere: è qui che si
      // scoprono le risposte che nessuno ha ancora pensato.
      unmatchedSamples: unmatched.slice(0, 25).map(function (x) {
        return { source: x.source, text: clean(x.text).slice(0, 200) };
      }),
    };
  }

  /** La prima fila DERIVATA dai numeri: quante ne installi prima di stancarti,
   *  ordinate per tempo salvato. Nessuna quota inventata sotto campione. */
  function firstRow(m, n) {
    n = n || 10;
    var picked = [];
    m.intents.forEach(function (i) {
      if (picked.length >= n) return;
      i.covers.forEach(function (sc) {
        if (picked.length < n && picked.indexOf(sc) < 0) picked.push(sc);
      });
    });
    return picked;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Il recap Telegram: corto, coi numeri, e onesto quando non bastano. */
  function tgSummary(m) {
    var L = [];
    L.push('<b>💬 Le risposte che ti servono davvero</b>');
    L.push(m.totals.considered + ' conversazioni lette · ' + m.totals.classified + ' riconosciute'
      + (m.totals.coverage != null ? ' (' + m.totals.coverage + '%)' : ''));
    if (!m.sufficient) {
      L.push('<i>Campione sotto ' + m.minSample + ': i conteggi valgono, le percentuali no.</i>');
    }
    L.push('');
    L.push('<b>Per tempo risparmiato</b>');
    m.intents.slice(0, 8).forEach(function (i, n) {
      L.push((n + 1) + '. ' + esc(i.label) + ' — <b>' + i.count + '×</b>, ~' + i.minutesSaved + ' min'
        + (i.covered ? ' → /' + i.covers[0] : ' → <b>DA SCRIVERE</b>'));
    });
    if (m.gaps.length) {
      L.push('');
      L.push('<b>Chiedono, e non hai una risposta pronta</b>');
      m.gaps.slice(0, 5).forEach(function (g) {
        L.push('• ' + esc(g.label) + ' — ' + g.count + '×');
      });
    }
    if (m.unmatchedSamples.length) {
      L.push('');
      L.push('<i>Non so ancora nominare ' + m.totals.unmatched + ' conversazioni. Esempio: "'
        + esc(m.unmatchedSamples[0].text.slice(0, 90)) + '…"</i>');
    }
    var first = firstRow(m, 8);
    if (first.length) {
      L.push('');
      L.push('<b>Installa prima queste:</b> ' + first.map(function (s) { return '/' + s; }).join(' '));
    }
    return L.join('\n');
  }

  var API = {
    INTENTS: INTENTS, SIDES: SIDES,
    classify: classify, isNoise: isNoise,
    corpusFromThreads: corpusFromThreads, corpusFromLeads: corpusFromLeads,
    corpusFromActions: corpusFromActions,
    measure: measure, firstRow: firstRow, tgSummary: tgSummary,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_WADEMAND = API;
})(typeof window !== 'undefined' ? window : this);
