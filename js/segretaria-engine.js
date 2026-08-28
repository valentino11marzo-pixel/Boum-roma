/* js/segretaria-engine.js — LA SEGRETARIA: i binari duri, senza modello.
 *
 * Il disegno è in STUDIO_SEGRETARIA_2026-08.md. La Segretaria è il cervello
 * conversazionale che prende in mano una chat WhatsApp QUANDO l'operatore
 * gliela consegna (il click sulla card è la firma) e la porta fino alla
 * visita prenotata o all'escalation. Il prompt guida lo stile; le regole che
 * contano stanno QUI, pure e testabili per mutazione, applicate PRIMA
 * (turnVerdict) e DOPO (sanitizeReply) la chiamata al modello:
 *
 *   1. Risponde SOLO su conversazioni consegnate, SOLO a lead/sconosciuti —
 *      mai a inquilini, proprietari o clienti PFS (scrivono per la caldaia).
 *   2. Le parole legali/di rabbia tornano a un umano (la STESSA regex della
 *      scala della fiducia — una copia sola).
 *   3. Tetto turni per conversazione e tetto giornaliero globale: una chat
 *      infinita non è un servizio, è un sintomo.
 *   4. Mai un link fuori da boomrome.com / wa.me; risposte corte (la voce
 *      misurata dell'operatore: mediana 262 caratteri); mai markdown.
 *   5. L'eco: le risposte della Segretaria tornano dal Mac come `out` — va
 *      riconosciuta (hash, 48h) o si spegnerebbe da sola al primo turno.
 */
(function (root) {
  'use strict';

  var FID = (typeof require === 'function') ? require('./fiducia-engine.js')
    : (root && root.BOOM_FIDUCIA) || {};

  var DEFAULTS = {
    enabled: true,        // il gate vero è la consegna per conversazione
    maxTurns: 12,         // turni della Segretaria per conversazione
    dailyCap: 60,         // turni totali al giorno (tutte le chat)
    maxChars: 700,        // tetto duro sulla lunghezza della risposta
  };
  var LIMITS = { maxTurns: [2, 40], dailyCap: [5, 500], maxChars: [200, 1500] };

  function mergeConfig(raw) {
    var cfg = { enabled: DEFAULTS.enabled, maxTurns: DEFAULTS.maxTurns, dailyCap: DEFAULTS.dailyCap, maxChars: DEFAULTS.maxChars };
    var rejected = [];
    if (!raw || typeof raw !== 'object') return { cfg: cfg, rejected: rejected };
    if (raw.enabled === false) cfg.enabled = false;
    ['maxTurns', 'dailyCap', 'maxChars'].forEach(function (k) {
      if (raw[k] == null) return;
      var n = Number(raw[k]);
      if (!isFinite(n) || n < LIMITS[k][0] || n > LIMITS[k][1]) {
        rejected.push({ key: k, got: raw[k], why: 'fuori dall\'intervallo ' + LIMITS[k][0] + '–' + LIMITS[k][1] });
        return;
      }
      cfg[k] = Math.round(n);
    });
    return { cfg: cfg, rejected: rejected };
  }

  /* ── il verdetto sul turno: PRIMA di pagare il modello ─────────────────
   * L'ordine è la specifica: consegna → interruttore → contatto giusto →
   * tetti → escalation. 'reply' | 'skip' | 'escalate', sempre col perché. */
  var ESCALATION_RE = FID.ESCALATION_RE || /avvocat|legale|denunc|truffa|scam|lawyer|refund|rimbors/i;
  var LEAD_TYPES = { whatsapp: 1, lead: 1 };

  function turnVerdict(input) {
    var conv = input.conv || {}, text = String(input.text || ''), cfg = input.cfg || DEFAULTS;
    var turnsToday = Number(input.turnsToday || 0);
    if (!conv.segretaria) return { act: 'skip', why: 'conversazione non consegnata' };
    if (!cfg.enabled) return { act: 'skip', why: 'kill switch spento' };
    if (!LEAD_TYPES[String(conv.contactType || '')]) {
      return { act: 'escalate', why: 'contatto ' + (conv.contactType || 'ignoto') + ': non è un lead — la Segretaria non parla con inquilini/proprietari' };
    }
    var m = text.match(ESCALATION_RE);
    if (m) return { act: 'escalate', why: 'parole che chiedono un umano ("' + m[0] + '")' };
    if (Number(conv.segretariaTurns || 0) >= cfg.maxTurns) {
      return { act: 'escalate', why: 'tetto turni raggiunto (' + cfg.maxTurns + '): una chat così lunga la chiude una persona' };
    }
    if (turnsToday >= cfg.dailyCap) {
      return { act: 'escalate', why: 'tetto giornaliero raggiunto (' + cfg.dailyCap + ' turni)' };
    }
    return { act: 'reply', why: null };
  }

  /* ── l'eco: la MIA risposta che torna dal Mac non è l'operatore ────────
   * Le uscite della Segretaria vengono mirrorate da Homie come direction
   * 'out'. Senza questo riconoscimento, il primo turno la spegnerebbe
   * (disciplina D4: un 'out' MANUALE spegne). Hash del testo normalizzato,
   * finestra 48h, registro capato sul doc conversazione. */
  var ECHO_WINDOW_MS = 48 * 3600 * 1000;
  function textHash(t) {
    var s = String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function isSegretariaEcho(conv, text, now) {
    now = now || Date.now();
    var sent = (conv && conv.segretariaSent) || [];
    var h = textHash(text);
    for (var i = 0; i < sent.length; i++) {
      var at = Date.parse(sent[i].at || 0) || 0;
      if (sent[i].h === h && now - at < ECHO_WINDOW_MS) return true;
    }
    return false;
  }
  function noteSent(conv, text, now) {
    var sent = ((conv && conv.segretariaSent) || []).slice(-9);
    sent.push({ h: textHash(text), at: new Date(now || Date.now()).toISOString() });
    return sent;
  }

  /* ── la risposta, DOPO il modello: i binari sull'uscita ────────────────
   * Un solo caso aggiusta (il taglio di lunghezza); tutto il resto RIFIUTA
   * — una risposta rifiutata diventa un'escalation, mai un invio storto. */
  var URL_RE = /https?:\/\/[^\s<>")]+/gi;
  var ALLOWED_URL = /^https?:\/\/(www\.)?(boomrome\.com|wa\.me)([/?#]|$)/i;
  function sanitizeReply(text, cfg) {
    cfg = cfg || DEFAULTS;
    var t = String(text || '').trim();
    if (!t) return { ok: false, why: 'risposta vuota' };
    var urls = t.match(URL_RE) || [];
    for (var i = 0; i < urls.length; i++) {
      if (!ALLOWED_URL.test(urls[i])) return { ok: false, why: 'link fuori dominio: ' + urls[i].slice(0, 60) };
    }
    if (/[*_#`]{2}|^#{1,3} /m.test(t)) t = t.replace(/[*_#`]/g, '');   // WhatsApp non è markdown
    if (t.length > cfg.maxChars) {
      var cut = t.slice(0, cfg.maxChars);
      var stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
      t = stop > cfg.maxChars * 0.5 ? cut.slice(0, stop + 1).trim() : cut.trim();
    }
    return { ok: true, text: t };
  }

  var API = {
    DEFAULTS: DEFAULTS,
    mergeConfig: mergeConfig,
    turnVerdict: turnVerdict,
    isSegretariaEcho: isSegretariaEcho,
    noteSent: noteSent,
    sanitizeReply: sanitizeReply,
    textHash: textHash,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SEGRETARIA = API;
})(typeof window !== 'undefined' ? window : this);
