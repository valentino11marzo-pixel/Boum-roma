/* js/miniera-engine.js — LA MINIERA. Lo storico WhatsApp diventa un verdetto.
 *
 * PERCHÉ. Sul Mac di Homie ci sono MESI di conversazioni complete (wacli);
 * in Firestore ci sono gli ESITI (lead, visite, contratti FIRMATI). Uniti
 * per telefono sono un dataset etichettato conversazione→esito che nessun
 * competitor ha. L'operatore ha deciso il metodo: i poteri nuovi di Homie
 * non si scelgono a gusto, si scelgono coi numeri — e questo motore è lo
 * strumento che li produce (STUDIO_HOMIE_GAME_CHANGER.md).
 *
 * COSA FA. Prende le righe per-thread estratte dal Mac (feature + campioni
 * corti, MAI l'archivio integrale — decisione D2), l'indice degli esiti
 * costruito dal server, e produce: funnel, conversione per velocità di
 * risposta, lingue e orari, obiezioni ricorrenti, il libro dei silenzi
 * (chi aspetta ADESSO, chi si è raffreddato), i thread d'oro, le
 * statistiche di approvazione da action_queue, e il VERDETTO: la classifica
 * motivata dei poteri candidati.
 *
 * LE REGOLE CHE CONTANO:
 * - Sotto campione minimo NON esce un numero (lezione D4 del Perito: una
 *   percentuale su 7 thread è un'opinione travestita).
 * - Il join è per telefono in TUTTE le forme (la lezione già pagata:
 *   internazionale vs nazionale sdoppiava la stessa persona). La copia di
 *   normalizePhone qui DEVE restare uguale a api/homie/_lead.js — il test
 *   di parità lo garantisce.
 * - Nel libro dei silenzi i veti valgono più del punteggio: un inquilino,
 *   un proprietario, un cliente PFS, un lead morto o uno che ha già firmato
 *   non finiscono MAI nella lista di re-ingaggio.
 * - Radar proprietari: NON misurabile dalle chat. Il verdetto lo dichiara
 *   invece di inventare un punteggio.
 *
 * Puro: nessun Firebase, nessuna rete, nessun DOM. `now` arriva da fuori.
 * UMD come boom-geo / canone-engine / squadra-registry → BOOM_MINIERA.
 */
(function (root) {
  'use strict';

  /* ── telefono: stesse forme di api/homie/_lead.js (test di parità) ───── */
  function normalizePhone(p) {
    if (!p) return '';
    var s = String(p).replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.indexOf('00') === 0) s = '+' + s.slice(2);
    else if (s[0] !== '+') {
      if (s[0] === '3' || s[0] === '0') s = '+39' + s.replace(/^0/, '');
    }
    return s;
  }
  function phoneVariants(p) {
    var norm = normalizePhone(p);
    var out = {};
    if (norm) out[norm] = 1;
    var raw = String(p || '').trim();
    if (raw) out[raw] = 1;
    if (norm.indexOf('+39') === 0) out[norm.slice(3)] = 1;
    if (norm[0] === '+') out['00' + norm.slice(1)] = 1;
    return Object.keys(out).filter(Boolean);
  }

  /* ── la riga per-thread che il Mac spedisce ──────────────────────────────
   * Feature + campioni corti (D2). Tutto clippato ALLA PORTA: una riga
   * malformata non entra, una troppo lunga viene tagliata, un gruppo
   * WhatsApp (chatId @g.us) non entra proprio. */
  var CLIP = { name: 80, text: 240, sample: 1200 };
  function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
  function toMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v > 1e12 ? v : v * 1000; // sec o ms
    var t = Date.parse(String(v));
    return isNaN(t) ? null : t;
  }

  function threadRow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var chatId = clip(raw.chatId, 120);
    if (!chatId) return null;
    if (/@g\.us/i.test(chatId) || /status@broadcast/i.test(chatId)) return null; // mai i gruppi
    var lastTs = toMs(raw.lastTs);
    if (!lastTs) return null; // senza tempo non c'è silenzio né storia
    // La parte utente di un JID WhatsApp è un numero INTERNAZIONALE senza
    // "+" (393331234567@s.whatsapp.net): passarla nuda a normalizePhone le
    // farebbe raddoppiare il prefisso (+39393…) e il join mancherebbe la
    // persona — il difetto che la Miniera esiste per scovare, non per avere.
    var jidUser = /^\d{7,15}@/.test(chatId) ? chatId.split('@')[0] : '';
    var rawPhone = String(raw.phone == null ? '' : raw.phone).trim();
    if (!rawPhone && jidUser) rawPhone = '+' + jidUser;
    else if (/^\d{10,15}$/.test(rawPhone) && rawPhone === jidUser) rawPhone = '+' + rawPhone;
    var row = {
      chatId: chatId,
      phone: normalizePhone(rawPhone),
      name: clip(raw.name, CLIP.name),
      msgCount: Math.max(0, Math.floor(Number(raw.msgCount) || 0)),
      inCount: Math.max(0, Math.floor(Number(raw.inCount) || 0)),
      outCount: Math.max(0, Math.floor(Number(raw.outCount) || 0)),
      firstTs: toMs(raw.firstTs) || lastTs,
      lastTs: lastTs,
      firstInTs: toMs(raw.firstInTs),
      firstReplyMinutes: raw.firstReplyMinutes == null ? null
        : Math.max(0, Math.round(Number(raw.firstReplyMinutes))),
      lastDirection: raw.lastDirection === 'out' ? 'out' : 'in',
      firstInText: clip(raw.firstInText, CLIP.text),
      lastInText: clip(raw.lastInText, CLIP.text),
      lastOutText: clip(raw.lastOutText, CLIP.text),
      inSample: clip(raw.inSample, CLIP.sample),
    };
    if (isNaN(row.firstReplyMinutes)) row.firstReplyMinutes = null;
    return row;
  }

  /* L'hash di contenuto: cambia se e solo se il thread è cambiato. Il Mac
   * lo usa per saltare gli invariati, il server per l'idempotenza (D7). */
  function rowHash(row) { return (row.msgCount || 0) + ':' + (row.lastTs || 0); }

  /* ── l'indice degli esiti: telefono → cosa è successo davvero ──────────
   * Precedenza dei ruoli: chi è GIÀ inquilino/proprietario/cliente PFS non
   * è un lead, qualunque cosa dica la collection leads — scrivere "ti
   * ricontatto per il bilocale" a un inquilino è il modo più rapido per
   * perdere la fiducia nello strumento. */
  function buildOutcomeIndex(src) {
    src = src || {};
    var by = {}; // phone form → outcome
    function put(p, patch, rolePriority) {
      phoneVariants(p).forEach(function (form) {
        var cur = by[form] || (by[form] = { role: 'lead', rolePriority: 0 });
        for (var k in patch) if (patch[k] !== undefined) {
          if (k === 'role') {
            if ((rolePriority || 0) >= (cur.rolePriority || 0)) { cur.role = patch.role; cur.rolePriority = rolePriority || 0; }
          } else if (patch[k] === true || cur[k] == null || cur[k] === false || cur[k] === '') {
            cur[k] = patch[k];
          }
        }
      });
    }
    (src.leads || []).forEach(function (l) {
      if (!l) return;
      var dead = l.status === 'archived' || l.status === 'dead' || l.grade === 'dead';
      put(l.phone, { isLead: true, leadStatus: l.status || '', grade: l.grade || '', dead: dead, leadName: l.name || '' }, 0);
    });
    (src.viewings || []).forEach(function (v) {
      if (!v) return;
      var real = v.status !== 'cancelled';
      if (real) put(v.phone, { viewing: true }, 0);
    });
    (src.contracts || []).forEach(function (c) {
      if (!c) return;
      var signed = c.signatureStatus === 'complete' || !!c.finalizedAt || !!c.signedPdfUrl;
      put(c.tenantPhone, { contract: true, signed: signed, role: 'tenant' }, 3);
      put(c.landlordPhone, { role: 'landlord' }, 3);
    });
    (src.users || []).forEach(function (u) {
      if (!u || !u.phone) return;
      if (u.role === 'tenant') put(u.phone, { role: 'tenant' }, 2);
      if (u.role === 'owner' || u.role === 'landlord') put(u.phone, { role: 'landlord' }, 2);
    });
    (src.landlords || []).forEach(function (l) { if (l) put(l.phone, { role: 'landlord' }, 2); });
    (src.pfsClients || []).forEach(function (c) { if (c) put(c.phone, { role: 'pfs' }, 2); });
    return by;
  }
  function lookupOutcome(index, phone) {
    var forms = phoneVariants(phone);
    for (var i = 0; i < forms.length; i++) if (index[forms[i]]) return index[forms[i]];
    return null;
  }

  /* ── segnali dal testo (deterministici, zero token) ─────────────────── */
  var VIEWING_INTENT = /\b(visit(a|are|e)|vedere|vederlo|vederla|viewing|see (the|it)|appuntamento|quando posso|can i (see|visit)|schedule)\b/i;
  var BUDGET_SIGNAL = /\d{3,5}\s*(€|euro|eur)|€\s*\d{3,5}/i;
  var OBJECTIONS = [
    { key: 'prezzo',   re: /\b(troppo car[oa]|expensive|too much|fuori budget|budget|trattabil|negoti)/i },
    { key: 'deposito', re: /\b(deposito|deposit|cauzione|caparra|mensilit)/i },
    { key: 'date',     re: /\b(disponibil|available from|da quando|when.*available|settembre|ottobre|january|february|march|april|may|june|july|august|september|october|november|december|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|novembre|dicembre)\b/i },
    { key: 'zona',     re: /\b(zona|quartiere|area|location|lontano|distante|metro|vicino a)\b/i },
    { key: 'arredo',   re: /\b(arredat|furnish|mobili|unfurnished|vuoto)\b/i },
    { key: 'durata',   re: /\b(transitorio|short term|long term|durata|months? contract|contratto .*(mesi|anni)|breve periodo)\b/i },
    { key: 'garanzie', re: /\b(garant|guarantor|busta paga|payslip|contratto di lavoro|proof of income|fideiussion)\b/i },
    { key: 'media',    re: /\b(foto|photos?|video|planimetria|floor ?plan|virtual tour)\b/i },
  ];

  /* ── il join: riga + esito + derivate ────────────────────────────────── */
  var H = 3600 * 1000, D = 24 * H;
  function joinThreads(rows, index, opts) {
    opts = opts || {};
    var now = toMs(opts.now) || Date.now();
    var langOf = typeof opts.langOf === 'function' ? opts.langOf : null;
    return (rows || []).map(function (r) {
      if (!r || !r.lastTs) return null;
      var o = r.phone ? lookupOutcome(index || {}, r.phone) : null;
      var textAll = [r.firstInText, r.inSample, r.lastInText].join(' ');
      var sample = r.inSample || r.firstInText || r.lastInText || '';
      var lang = 'na';
      if (langOf && sample.length >= 12) { try { lang = langOf(sample) || 'na'; } catch (e) { lang = 'na'; } }
      return {
        row: r,
        outcome: o,
        role: o ? o.role : 'unknown',
        isLead: !!(o && o.isLead),
        dead: !!(o && o.dead),
        viewing: !!(o && o.viewing),
        contract: !!(o && o.contract),
        lang: lang,
        silenceHours: Math.max(0, (now - r.lastTs) / H),
        ageDays: Math.max(0, (now - r.lastTs) / D),
        viewingIntent: VIEWING_INTENT.test(textAll),
        budgetSignal: BUDGET_SIGNAL.test(textAll),
        objections: OBJECTIONS.filter(function (ob) { return ob.re.test(textAll); }).map(function (ob) { return ob.key; }),
      };
    }).filter(Boolean);
  }

  /* ── l'ora di Roma (per la statistica oraria, niente libreria tz) ────── */
  function romeHour(ms) {
    try {
      return Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome', hour: '2-digit', hour12: false,
      }).format(new Date(ms)));
    } catch (e) { return new Date(ms).getUTCHours(); }
  }

  /* ── bucket di latenza: la domanda "quanto conta rispondere subito?" ───
   * La conversione ("advanced" = visita o contratto) per fascia di tempo
   * alla prima risposta. Un bucket sotto MIN_BUCKET non pubblica il tasso:
   * n sì, percentuale no. */
  var LATENCY_BUCKETS = [
    { key: 'entro_5m',  label: '≤5 min',   max: 5 },
    { key: 'entro_30m', label: '≤30 min',  max: 30 },
    { key: 'entro_2h',  label: '≤2 ore',   max: 120 },
    { key: 'entro_24h', label: '≤24 ore',  max: 1440 },
    { key: 'oltre_24h', label: '>24 ore',  max: Infinity },
  ];
  var MIN_BUCKET = 8;

  function latencyStats(joined) {
    var rows = joined.filter(function (j) { return j.isLead && j.role === 'lead'; });
    var out = LATENCY_BUCKETS.map(function (b) { return { key: b.key, label: b.label, n: 0, advanced: 0, rate: null }; });
    var never = { key: 'mai_risposto', label: 'mai risposto', n: 0, advanced: 0, rate: null };
    rows.forEach(function (j) {
      var m = j.row.firstReplyMinutes;
      var adv = j.viewing || j.contract;
      if (m == null) { never.n++; if (adv) never.advanced++; return; }
      for (var i = 0; i < LATENCY_BUCKETS.length; i++) {
        if (m <= LATENCY_BUCKETS[i].max) { out[i].n++; if (adv) out[i].advanced++; break; }
      }
    });
    out.push(never);
    out.forEach(function (b) { if (b.n >= MIN_BUCKET) b.rate = Math.round(100 * b.advanced / b.n); });
    // Le due metà per il verdetto: veloce (≤30') vs lento (>24h o mai).
    var fast = { n: out[0].n + out[1].n, advanced: out[0].advanced + out[1].advanced };
    var slow = { n: out[4].n + never.n, advanced: out[4].advanced + never.advanced };
    return {
      buckets: out,
      fast: fast.n >= MIN_BUCKET ? Math.round(100 * fast.advanced / fast.n) : null,
      fastN: fast.n,
      slow: slow.n >= MIN_BUCKET ? Math.round(100 * slow.advanced / slow.n) : null,
      slowN: slow.n,
    };
  }

  /* ── il libro dei silenzi ────────────────────────────────────────────
   * Due liste, due mestieri:
   * · unanswered — l'ultima parola è LORO e nessuno ha risposto: chiunque
   *   sia (anche un inquilino: la caldaia merita risposta), col ruolo in
   *   chiaro così l'operatore sa che voce usare.
   * · coldOpen — l'ultima parola è NOSTRA e il thread si è raffreddato:
   *   qui è re-ingaggio commerciale, quindi i VETI comandano — solo lead
   *   vivi, mai firmati, mai morti, mai oltre maxAgeDays (a Roma una
   *   ricerca di 4 mesi fa è finita — lezione della ricerca rovesciata),
   *   e con un segnale vero (intent visita / budget / conversazione vera).
   */
  function silenceBook(joined, opts) {
    opts = opts || {};
    var minUnansweredHours = opts.minUnansweredHours != null ? opts.minUnansweredHours : 6;
    var minColdHours = opts.minColdHours != null ? opts.minColdHours : 48;
    var maxAgeDays = opts.maxAgeDays != null ? opts.maxAgeDays : 120;

    var unanswered = [], coldOpen = [];
    joined.forEach(function (j) {
      var r = j.row;
      if (r.lastDirection === 'in') {
        if (j.silenceHours >= minUnansweredHours && j.ageDays <= maxAgeDays && !j.dead) {
          unanswered.push({
            chatId: r.chatId, phone: r.phone, name: r.name || r.phone,
            role: j.role, days: Math.round(j.ageDays * 10) / 10,
            lastInText: r.lastInText || r.firstInText,
          });
        }
        return;
      }
      // ultima parola nostra → candidato re-ingaggio, ma i veti prima di tutto
      if (j.role !== 'lead') return;           // inquilini/proprietari/PFS: MAI
      if (!j.isLead) return;                   // sconosciuti: niente da riscaldare
      if (j.dead || j.contract) return;        // morto o già chiuso: MAI
      if (j.silenceHours < minColdHours) return;
      if (j.ageDays > maxAgeDays) return;
      var signal = j.viewingIntent || j.budgetSignal || r.inCount >= 3;
      if (!signal) return;
      coldOpen.push({
        chatId: r.chatId, phone: r.phone, name: r.name || r.phone,
        days: Math.round(j.ageDays * 10) / 10,
        intent: j.viewingIntent ? 'visita' : (j.budgetSignal ? 'budget' : 'conversazione'),
        lastOutText: r.lastOutText,
      });
    });
    unanswered.sort(function (a, b) { return a.days - b.days; }); // i più recenti prima: ancora salvabili
    coldOpen.sort(function (a, b) { return a.days - b.days; });
    return { unanswered: unanswered, coldOpen: coldOpen };
  }

  /* ── lo studio: tutto insieme, con l'onestà del campione ─────────────── */
  var MIN_SAMPLE = 30;

  function study(rows, index, opts) {
    opts = opts || {};
    var minSample = opts.minSample != null ? opts.minSample : MIN_SAMPLE;
    var joined = joinThreads(rows, index, opts);
    var leads = joined.filter(function (j) { return j.isLead && j.role === 'lead'; });
    var golden = joined.filter(function (j) { return j.contract && j.row.inCount >= 2; });
    var longThreads = joined.filter(function (j) {
      return j.role === 'lead' && (j.row.msgCount >= 12 || (j.row.lastTs - j.row.firstTs) >= 21 * D);
    });
    var viewingIntentOpen = leads.filter(function (j) { return j.viewingIntent && !j.viewing && !j.contract && !j.dead; });

    var byLang = {}, byHour = {}, objections = {};
    joined.forEach(function (j) {
      byLang[j.lang] = (byLang[j.lang] || 0) + 1;
      j.objections.forEach(function (k) { objections[k] = (objections[k] || 0) + 1; });
      if (j.row.firstInTs) {
        var h = romeHour(j.row.firstInTs);
        byHour[h] = (byHour[h] || 0) + 1;
      }
    });

    var funnel = {
      threads: joined.length,
      joinedLeads: leads.length,
      viewing: leads.filter(function (j) { return j.viewing; }).length,
      contract: joined.filter(function (j) { return j.contract; }).length,
      tenants: joined.filter(function (j) { return j.role === 'tenant'; }).length,
      landlords: joined.filter(function (j) { return j.role === 'landlord'; }).length,
      unknown: joined.filter(function (j) { return !j.outcome; }).length,
    };

    return {
      generatedAt: new Date(toMs(opts.now) || Date.now()).toISOString(),
      minSample: minSample,
      sufficientSample: leads.length >= minSample,
      funnel: funnel,
      latency: latencyStats(joined),
      byLang: byLang,
      byHour: byHour,
      objections: objections,
      silence: silenceBook(joined, opts),
      golden: golden.slice(0, 30).map(function (j) {
        return { chatId: j.row.chatId, name: j.row.name || j.row.phone, msgCount: j.row.msgCount };
      }),
      goldenCount: golden.length,
      longThreadsCount: longThreads.length,
      viewingIntentOpenCount: viewingIntentOpen.length,
    };
  }

  /* ── le approvazioni: la materia prima della scala della fiducia ───────
   * Niente derivazioni furbe: si contano gli status VERI per categoria e
   * si calcola il tasso solo dove il campione regge. Status tolleranti
   * (l'executor e l'auto-apply scrivono varianti diverse). */
  var APPROVED_STATUSES = { approved: 1, executed: 1, 'auto-applied': 1, sent: 1, done: 1 };
  function approvalStats(actions) {
    var byKind = {};
    (actions || []).forEach(function (a) {
      if (!a) return;
      var kind = String(a.kind || a.type || 'sconosciuta');
      var k = byKind[kind] || (byKind[kind] = { proposed: 0, approved: 0, rejected: 0, pending: 0, other: 0, statuses: {} });
      var st = String(a.status || 'pending');
      k.proposed++;
      k.statuses[st] = (k.statuses[st] || 0) + 1;
      if (APPROVED_STATUSES[st]) k.approved++;
      else if (st === 'rejected') k.rejected++;
      else if (st === 'pending') k.pending++;
      else k.other++;
    });
    Object.keys(byKind).forEach(function (kind) {
      var k = byKind[kind];
      var decided = k.approved + k.rejected;
      k.approvalRate = decided >= MIN_BUCKET ? Math.round(100 * k.approved / decided) : null;
    });
    return byKind;
  }

  /* ── IL VERDETTO: la classifica motivata dei poteri ────────────────────
   * Deterministico, coi perché dentro. Un potere senza dati sufficienti
   * finisce in fondo con la ragione scritta; radar-proprietari dichiara
   * di non essere misurabile da qui. Sotto campione globale il verdetto
   * apre con "campione insufficiente" e non finge una classifica forte. */
  function verdict(st, approvals) {
    var powers = [];
    var un = st.silence.unanswered.filter(function (u) { return u.role === 'lead' || u.role === 'unknown'; }).length;
    var unAll = st.silence.unanswered.length;
    var cold = st.silence.coldOpen.length;

    powers.push({
      key: 'segugio', title: 'Il Segugio dei silenzi',
      score: un * 3 + cold, sufficient: st.funnel.threads > 0,
      why: [
        unAll + ' conversazioni con l\'ultima parola del cliente rimasta senza risposta (' + un + ' lead/prospect)',
        cold + ' thread caldi raffreddati con la nostra ultima parola e un segnale vero',
      ],
    });

    powers.push({
      key: 'visite', title: 'Le visite che si fissano da sole',
      score: st.viewingIntentOpenCount * 2, sufficient: st.funnel.threads > 0,
      why: [st.viewingIntentOpenCount + ' lead hanno chiesto di VEDERE una casa e non risultano mai arrivati a una visita'],
    });

    var lat = st.latency;
    var latOk = lat.fast != null && lat.slow != null;
    powers.push({
      key: 'velocita', title: 'La velocità che converte (base della scala della fiducia)',
      score: latOk ? Math.max(0, lat.fast - lat.slow) : 0, sufficient: latOk,
      why: latOk
        ? ['rispondere entro 30\' converte il ' + lat.fast + '% (' + lat.fastN + ' casi) contro il ' + lat.slow + '% oltre le 24h (' + lat.slowN + ' casi)']
        : ['campione insufficiente sui bucket di latenza (veloci: ' + lat.fastN + ', lenti: ' + lat.slowN + ', minimo ' + MIN_BUCKET + ' per parte)'],
    });

    var topObj = Object.keys(st.objections).sort(function (a, b) { return st.objections[b] - st.objections[a]; })[0] || null;
    var goldenOk = st.goldenCount >= 5;
    powers.push({
      key: 'playbook', title: 'Il playbook (Commerciale 2.0)',
      score: st.goldenCount * 2 + (topObj ? Math.min(10, st.objections[topObj]) : 0), sufficient: goldenOk,
      why: goldenOk
        ? [st.goldenCount + ' conversazioni d\'oro (finite in contratto) pronte a fare da esempio',
           topObj ? 'obiezione più frequente: "' + topObj + '" (' + st.objections[topObj] + ' thread)' : 'nessuna obiezione dominante']
        : ['solo ' + st.goldenCount + ' conversazioni finite in contratto agganciate: servono più esiti o un join migliore'],
    });

    powers.push({
      key: 'dossier', title: 'Il dossier per contatto',
      score: st.longThreadsCount, sufficient: st.funnel.threads > 0,
      why: [st.longThreadsCount + ' relazioni lunghe o ricorrenti che oggi nessuna superficie ricorda'],
    });

    powers.sort(function (a, b) {
      if (a.sufficient !== b.sufficient) return a.sufficient ? -1 : 1;
      return b.score - a.score;
    });

    powers.push({
      key: 'radar-proprietari', title: 'Radar proprietari', score: null,
      sufficient: false, measurable: false,
      why: ['non si misura dalle chat: si misura dal libro del Perito (assorbimento e giacenze per zona)'],
    });

    return {
      sufficientSample: st.sufficientSample,
      note: st.sufficientSample
        ? null
        : 'campione insufficiente: ' + st.funnel.joinedLeads + ' lead agganciati su un minimo di ' + st.minSample +
          ' — sincronizza più storico o verifica il join telefoni prima di fidarti della classifica',
      powers: powers,
      approvals: approvals || null,
    };
  }

  /* ── il riassunto per Telegram: podio + numeri, mai un muro di testo ───
   * tgNotify manda con parse_mode HTML: il testo che viene dal CLIENTE
   * (nomi, ultimi messaggi) va escapato, o un solo "<" butta via l'intero
   * recap — la lezione delle card visite. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function tgSummary(st, vd) {
    var lines = ['⛏ LA MINIERA — studio dello storico WhatsApp', ''];
    lines.push('Thread: ' + st.funnel.threads + ' · lead agganciati: ' + st.funnel.joinedLeads +
               ' · visite: ' + st.funnel.viewing + ' · contratti: ' + st.funnel.contract);
    if (!vd.sufficientSample && vd.note) { lines.push(''); lines.push('⚠️ ' + vd.note); }
    lines.push('');
    lines.push('IL VERDETTO (cosa costruire prima):');
    var podio = ['🥇', '🥈', '🥉'];
    vd.powers.filter(function (p) { return p.measurable !== false; }).slice(0, 3).forEach(function (p, i) {
      lines.push(podio[i] + ' ' + p.title + (p.sufficient ? '' : ' (dati insufficienti)'));
      p.why.forEach(function (w) { lines.push('   · ' + w); });
    });
    var un = st.silence.unanswered.length;
    if (un > 0) {
      lines.push('');
      lines.push('👀 SUBITO: ' + un + ' conversazioni aspettano ancora una risposta — le prime 3:');
      st.silence.unanswered.slice(0, 3).forEach(function (u) {
        lines.push('   · ' + esc(u.name) + (u.role !== 'lead' && u.role !== 'unknown' ? ' (' + u.role + ')' : '') +
                   ' — ' + u.days + 'g fa: "' + esc((u.lastInText || '').slice(0, 60)) + '"');
      });
    }
    lines.push('');
    lines.push('Dettaglio completo nel rapporto teamReports.');
    return lines.join('\n');
  }

  var API = {
    normalizePhone: normalizePhone,
    phoneVariants: phoneVariants,
    threadRow: threadRow,
    rowHash: rowHash,
    buildOutcomeIndex: buildOutcomeIndex,
    lookupOutcome: lookupOutcome,
    joinThreads: joinThreads,
    silenceBook: silenceBook,
    latencyStats: latencyStats,
    study: study,
    approvalStats: approvalStats,
    verdict: verdict,
    tgSummary: tgSummary,
    MIN_SAMPLE: MIN_SAMPLE,
    MIN_BUCKET: MIN_BUCKET,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_MINIERA = API;
})(typeof window !== 'undefined' ? window : this);
