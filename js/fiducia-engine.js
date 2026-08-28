/* js/fiducia-engine.js — LA SCALA DELLA FIDUCIA.
 *
 * Il disegno viene da STUDIO_HOMIE_GAME_CHANGER §4 e da STUDIO_ORGANICO
 * 2026-08: la macchina propone da mesi bozze in `action_queue` e l'operatore
 * le approva quasi tutte con lo stesso tap — quel tap è diventato il collo
 * di bottiglia (544 ultime parole di clienti senza risposta, misurate dalla
 * Miniera). Qui una categoria di bozze PROVATA — tante decisioni, quasi
 * tutte approvazioni — può essere promossa all'invio automatico. Le regole,
 * tutte in questo motore puro perché si testino senza Firestore:
 *
 *   1. La promozione non è mai automatica: la decide l'operatore, per
 *      categoria, da /fiducia su Telegram. Coi DEFAULT (nessuna impostazione
 *      salvata) NON PARTE NIENTE da solo: il deploy non cambia comportamento.
 *   2. Si promuove solo ciò che i numeri reggono: almeno `minSample`
 *      decisioni storiche e un tasso di approvazione ≥ `minRate`.
 *   3. Auto-invio ≠ invio istantaneo: la bozza resta ferma `graceMin` minuti
 *      con un tasto ✋ Ferma sulla card. Kill switch globale; a interruttore
 *      spento anche le bozze GIÀ armate si disarmano.
 *   4. Le sempre-escalation non si promuovono MAI: la prima risposta AI a un
 *      contatto nuovo (`commerciale:first`) resta in approvazione per
 *      costruzione, e dentro una categoria promossa un messaggio che parla
 *      di avvocati, denunce, rimborsi o truffe torna a un umano.
 *   5. Ogni sera un digest dice cosa è partito da solo — l'autonomia si
 *      controlla, non si dimentica.
 *
 * La categoria NON è `action.kind` (troppo largo: 'reply' copre sia la prima
 * risposta AI sia il follow-up template): è il prefisso del contextHash, che
 * ogni dipendente stampa già e che dice CHI propone COSA.
 */
(function (root) {
  'use strict';

  /* ── i default: tutto spento. Pinnati nei test come garanzia di
   *    non-regressione — senza impostazioni salvate nulla parte da solo. ── */
  var DEFAULTS = {
    enabled: false,     // kill switch globale
    graceMin: 10,       // minuti di grazia col tasto ✋ Ferma
    minSample: 30,      // decisioni storiche minime per categoria
    minRate: 95,        // % di approvazioni minima sul deciso
    categories: {},     // { 'commerciale:followup': true, ... } — opt-in
  };
  var LIMITS = { graceMin: [2, 120], minSample: [10, 500], minRate: [80, 100] };

  /* ── le categorie promuovibili: SOLO testi template, mai bozze AI ─────── */
  var CATEGORIES = [
    { key: 'commerciale:followup', code: 'cf', label: 'Follow-up ai lead fermi da 48h (testo template)' },
    { key: 'gestore:payrem',       code: 'gp', label: 'Sollecito pagamento in ritardo (testo template)' },
    { key: 'gestore:sign',         code: 'gs', label: 'Sollecito firma col link Magic Sign (testo template)' },
  ];
  /* Le mai-promuovibili, con la ragione scritta. `commerciale:first` è la
   * prima risposta AI a un contatto nuovo: è ESATTAMENTE la sempre-escalation
   * dello STUDIO_HOMIE §4, e resta in approvazione anche se qualcuno la
   * accendesse a mano nel doc di config. */
  var NEVER = {
    'commerciale:first': 'prima risposta AI a un contatto nuovo — sempre in approvazione',
  };

  function byCode(code) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].code === code) return CATEGORIES[i];
    return null;
  }

  /* ── la categoria di un'azione: il prefisso del contextHash ───────────── */
  function categoryOf(action) {
    var h = action && action.contextHash ? String(action.contextHash) : '';
    var parts = h.split(':');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return parts[0] + ':' + parts[1];
  }

  /* ── config: whitelist + clamp. Un valore impossibile NON viene
   *    aggiustato in silenzio: torna al default e finisce in `rejected`
   *    (la disciplina di resolveKnobs in api/_squadra.js). ─────────────── */
  function mergeConfig(raw) {
    var cfg = { enabled: DEFAULTS.enabled, graceMin: DEFAULTS.graceMin, minSample: DEFAULTS.minSample, minRate: DEFAULTS.minRate, categories: {} };
    var rejected = [];
    if (!raw || typeof raw !== 'object') return { cfg: cfg, rejected: rejected };
    cfg.enabled = raw.enabled === true;
    ['graceMin', 'minSample', 'minRate'].forEach(function (k) {
      if (raw[k] == null) return;
      var n = Number(raw[k]);
      if (!isFinite(n) || n < LIMITS[k][0] || n > LIMITS[k][1]) {
        rejected.push({ key: k, got: raw[k], why: 'fuori dall\'intervallo ' + LIMITS[k][0] + '–' + LIMITS[k][1] });
        return;
      }
      cfg[k] = Math.round(n);
    });
    var cats = raw.categories && typeof raw.categories === 'object' ? raw.categories : {};
    CATEGORIES.forEach(function (c) { if (cats[c.key] === true) cfg.categories[c.key] = true; });
    Object.keys(cats).forEach(function (k) {
      var known = CATEGORIES.some(function (c) { return c.key === k; });
      if (!known && cats[k] === true) rejected.push({ key: 'categories.' + k, got: true, why: NEVER[k] || 'categoria sconosciuta' });
    });
    return { cfg: cfg, rejected: rejected };
  }

  /* ── le approvazioni storiche, per categoria fine ─────────────────────
   * Status tolleranti come in miniera-engine.approvalStats: executor e
   * auto-apply scrivono varianti diverse dello stesso "sì". */
  var APPROVED = { approved: 1, executed: 1, 'auto-applied': 1, sent: 1, done: 1 };
  function statsFor(actions) {
    var by = {};
    (actions || []).forEach(function (a) {
      var key = categoryOf(a);
      if (!key) return;
      var s = by[key] || (by[key] = { proposed: 0, approved: 0, rejected: 0, pending: 0, decided: 0, rate: null });
      var st = String((a && a.status) || 'pending');
      s.proposed++;
      /* un'azione partita da sola non è una decisione dell'operatore: nel
       * campione entrano solo i suoi sì e i suoi no, altrimenti la scala
       * si autoalimenta (ogni auto-invio "conferma" la categoria). */
      if (a && a.fiduciaAutoSent) return;
      if (APPROVED[st]) { s.approved++; s.decided++; }
      else if (st === 'rejected') { s.rejected++; s.decided++; }
      else if (st === 'pending') s.pending++;
    });
    Object.keys(by).forEach(function (k) {
      var s = by[k];
      s.rate = s.decided > 0 ? Math.round(100 * s.approved / s.decided) : null;
    });
    return by;
  }

  /* ── le parole che chiedono un umano ──────────────────────────────────
   * Applicate a ciò che il CLIENTE ha scritto: rabbia, soldi contesi,
   * questioni legali. Radici, non parole intere: 'avvocat' copre avvocato/
   * avvocatessa, 'denunc' copre denuncia/denunciare. */
  var ESCALATION_RE = /avvocat|legale|denunc|diffid|truffa|scam|fraud|lawyer|legal action|sue you|police|polizia|carabinieri|tribunale|court|rimbors|refund|reclamo|complaint|vergogn|disgust/i;

  function escalationVeto(action, lead) {
    var p = (action && action.payload) || {};
    if (!p.to && !p.phone && !p.recipient) return 'senza recapito';
    if (lead) {
      var st = String(lead.status || '').toLowerCase();
      if (st === 'archived' || st === 'discarded' || lead.grade === 'dead') return 'lead non più attivo';
      var txt = String(lead.message || '');
      var m = txt.match(ESCALATION_RE);
      if (m) return 'parole che chiedono un umano ("' + m[0] + '")';
    }
    return null;
  }

  /* ── IL VERDETTO ──────────────────────────────────────────────────────
   * L'ordine dei controlli È la specifica (i test lo verificano per
   * mutazione): interruttore → categoria → mai-promuovibile → opt-in →
   * campione → tasso → escalation. Solo alla fine: auto, con l'orario. */
  function autoVerdict(input) {
    var action = input.action, lead = input.lead || null, stats = input.stats || {},
        cfg = input.cfg || DEFAULTS, now = input.now || Date.now();
    if (!cfg.enabled) return { auto: false, why: 'interruttore generale spento' };
    var key = categoryOf(action);
    if (!key) return { auto: false, why: 'categoria non riconosciuta' };
    if (NEVER[key]) return { auto: false, why: NEVER[key] };
    if (!cfg.categories[key]) return { auto: false, why: 'categoria non promossa (' + key + ')' };
    var s = stats[key] || { decided: 0, rate: null };
    if (s.decided < cfg.minSample) return { auto: false, why: 'campione insufficiente (' + s.decided + ' decisioni, servono ' + cfg.minSample + ')' };
    if (s.rate == null || s.rate < cfg.minRate) return { auto: false, why: 'tasso approvazione ' + (s.rate == null ? 'n/d' : s.rate + '%') + ' sotto il ' + cfg.minRate + '%' };
    var veto = escalationVeto(action, lead);
    if (veto) return { auto: false, why: veto };
    return { auto: true, key: key, rate: s.rate, decided: s.decided, sendAt: now + cfg.graceMin * 60000 };
  }

  /* ── il quadro per /fiducia: ogni categoria col suo stato e i numeri ── */
  function statusRows(stats, cfg) {
    return CATEGORIES.map(function (c) {
      var s = (stats && stats[c.key]) || { decided: 0, rate: null };
      var on = !!(cfg && cfg.categories && cfg.categories[c.key]);
      var ready = s.decided >= (cfg ? cfg.minSample : DEFAULTS.minSample)
        && s.rate != null && s.rate >= (cfg ? cfg.minRate : DEFAULTS.minRate);
      return { key: c.key, code: c.code, label: c.label, on: on, decided: s.decided, rate: s.rate, ready: ready };
    });
  }

  var API = {
    DEFAULTS: DEFAULTS,
    CATEGORIES: CATEGORIES,
    NEVER: NEVER,
    ESCALATION_RE: ESCALATION_RE,   // una copia sola: la riusa la Segretaria
    byCode: byCode,
    categoryOf: categoryOf,
    mergeConfig: mergeConfig,
    statsFor: statsFor,
    escalationVeto: escalationVeto,
    autoVerdict: autoVerdict,
    statusRows: statusRows,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_FIDUCIA = API;
})(typeof window !== 'undefined' ? window : this);
