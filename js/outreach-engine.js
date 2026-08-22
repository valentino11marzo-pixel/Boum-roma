/* js/outreach-engine.js — IL CONTATTO: il messaggio al proprietario, puro.
 *
 * IL PROBLEMA CHE RISOLVE. Il collo di bottiglia del Property Finding non è
 * TROVARE l'annuncio (lo Scatto lo porta in plancia in minuti): è il primo
 * contatto. Un privato su Immobiliare riceve decine di messaggi nelle prime
 * ore; chi scrive per primo, bene e nella chat del portale (quando non c'è
 * un cellulare) prende la visita. Oggi quel messaggio si scrive a mano, uno
 * per uno: qualità alta, quantità impossibile.
 *
 * QUESTO MOTORE genera il messaggio da MODELLI SCELTI DALL'OPERATORE (stile
 * + voce), riempiti SOLO con fatti reali dell'annuncio e del cliente. Le
 * regole della casa:
 *   - MAI inventare: uno slot senza dato si OMETTE, non si riempie a caso
 *     (un "ho visto le foto della cucina" su un annuncio senza foto è la
 *     fine della credibilità al primo scambio);
 *   - MAI dati personali del cliente nel messaggio (niente cognomi, niente
 *     telefoni: la chat del portale È il canale finché il proprietario non
 *     risponde);
 *   - UN contatto per annuncio, per costruzione (outreachKey): due clienti
 *     interessati = UNA conversazione col proprietario, mai due;
 *   - il messaggio finisce SEMPRE con una domanda (la CTA è la visita);
 *   - corto: sopra ~700 caratteri un privato smette di leggere.
 *
 * L'INVIO non vive qui: l'operatore rivede l'anteprima, tocca, e la coda
 * (outreachQueue) la esegue il Mac di Homie nella chat del portale — con
 * l'approvazione umana PER OGNI messaggio, mai in autonomia.
 *
 * Puro: nessuna rete, nessun DB, nessun DOM. window.BOOM_OUTREACH +
 * module.exports (UMD): la plancia mostra l'anteprima live nel browser,
 * il server (draft/queue) usa la STESSA copia — non possono divergere.
 */
(function (root) {
  'use strict';

  var MAX_LEN = 700;

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function num(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    var n = parseFloat(String(x).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  /* Il nome dell'annuncio come lo direbbe una persona: titolo se c'è,
   * altrimenti "il suo annuncio in zona X", altrimenti "il suo annuncio". */
  function listingLabel(l, lang) {
    var t = clean(l && l.title);
    if (t) return (lang === 'en' ? 'your listing “' : 'il suo annuncio “') + t.slice(0, 70) + '”';
    var z = clean(l && l.zone);
    if (z) return lang === 'en' ? ('your listing in ' + z) : ('il suo annuncio in zona ' + z);
    return lang === 'en' ? 'your listing' : 'il suo annuncio';
  }

  /* I fatti del CLIENTE che possono entrare nel messaggio: solo generici,
   * solo se presenti. moveIn è testo libero del gestionale ("Settembre",
   * "ASAP") — si cita com'è, mai reinterpretato. */
  function clientBits(c, lang) {
    var bits = [];
    if (c && clean(c.moveIn)) {
      bits.push(lang === 'en'
        ? ('move-in ' + clean(c.moveIn))
        : ('ingresso ' + clean(c.moveIn)));
    }
    var months = c && num(c.durationMonths);
    if (months) {
      bits.push(lang === 'en' ? (months + ' months minimum') : ('per almeno ' + months + ' mesi'));
    }
    return bits;
  }

  /* ── LE VOCI ────────────────────────────────────────────────────────────
   * personale — parla la parte che cerca casa (è la voce che il proprietario
   *             privato legge volentieri; è il tono del messaggio che
   *             l'operatore già scrive a mano oggi).
   * boom      — voce trasparente dell'agenzia: inquilino selezionato e
   *             referenziato, zero costi per il proprietario. Da usare
   *             quando la trasparenza vale più del tasso di risposta.
   *
   * ── GLI STILI ──────────────────────────────────────────────────────────
   * sobrio    — professionale, cortese, completo.
   * caloroso  — umano, un filo più personale.
   * deciso    — corto e operativo: chi scrive per primo e chiede subito la
   *             visita, la ottiene.
   * english   — per il proprietario che ha scritto l'annuncio in inglese.
   */
  var STYLES = ['sobrio', 'caloroso', 'deciso', 'english'];
  var VOICES = ['personale', 'boom'];

  // opts: { style, voice, client?, note? }
  function buildMessage(listing, opts) {
    var o = opts || {};
    var style = STYLES.indexOf(o.style) >= 0 ? o.style : 'sobrio';
    var voice = VOICES.indexOf(o.voice) >= 0 ? o.voice : 'personale';
    var lang = style === 'english' ? 'en' : 'it';
    var l = listing || {};
    var label = listingLabel(l, lang);
    var bits = clientBits(o.client, lang);
    var note = clean(o.note).slice(0, 200);
    var lines = [];

    if (voice === 'boom') {
      if (lang === 'en') {
        lines.push('Good morning! I\'m writing from BOOM Rome about ' + label + '.');
        lines.push('We follow a selected, referenced tenant' + (bits.length ? ' (' + bits.join(', ') + ')' : '') + ' looking for exactly this kind of home — at no cost to you as the owner.');
        if (note) lines.push(note);
        lines.push('Would it be possible to arrange a viewing in the next few days?');
      } else {
        lines.push('Buongiorno! La contatto da BOOM Roma per ' + label + '.');
        lines.push('Seguiamo un inquilino selezionato e referenziato' + (bits.length ? ' (' + bits.join(', ') + ')' : '') + ' che cerca esattamente una casa così — senza alcun costo per lei come proprietario.');
        if (note) lines.push(note);
        lines.push('Sarebbe possibile organizzare una visita nei prossimi giorni?');
      }
    } else if (style === 'english') {
      lines.push('Good morning! I saw ' + label + ' and I\'m very interested.');
      lines.push('I\'m looking for a home in the area' + (bits.length ? ' — ' + bits.join(', ') : '') + ', with solid references.');
      if (note) lines.push(note);
      lines.push('Would it be possible to visit in the next few days? Thank you!');
    } else if (style === 'deciso') {
      lines.push('Buongiorno! Ho visto ' + label + ' e sono seriamente interessato/a' + (bits.length ? ' (' + bits.join(', ') + ')' : '') + '.');
      if (note) lines.push(note);
      lines.push('Posso visitarlo già in settimana? Anche domani, se per lei va bene.');
    } else if (style === 'caloroso') {
      lines.push('Buongiorno! Ho visto ' + label + ' e mi ha colpito subito: è proprio quello che sto cercando.');
      lines.push('Cerco casa in zona' + (bits.length ? ' — ' + bits.join(', ') : '') + ', con referenze solide e massima serietà.');
      if (note) lines.push(note);
      lines.push('Le andrebbe di farmelo visitare nei prossimi giorni? Grazie mille!');
    } else { // sobrio
      lines.push('Buongiorno! La contatto per ' + label + ', che mi interessa molto.');
      lines.push('Cerco casa in zona' + (bits.length ? ' — ' + bits.join(', ') : '') + ', con referenze verificabili.');
      if (note) lines.push(note);
      lines.push('Sarebbe possibile organizzare una visita nei prossimi giorni? Grazie!');
    }

    var text = lines.filter(Boolean).join('\n');
    if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN - 1).replace(/\s+\S*$/, '') + '…';
    return text;
  }

  /* La chiave di idempotenza: UN contatto per annuncio, sempre. Due clienti
   * interessati alla stessa casa = una conversazione sola col proprietario
   * (due messaggi diversi dallo stesso mittente sono spam, e il mittente è
   * il profilo BOOM sul portale: uno solo). */
  function outreachKey(listingId) {
    return 'out_' + String(listingId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  }

  /* La validazione ALLA PORTA: un job che il Mac non può eseguire non deve
   * mai entrare in coda (entrerebbe, fallirebbe 3 volte, verrebbe
   * parcheggiato — tre giri per scoprire ciò che si sapeva subito). */
  function validateJob(job) {
    var errors = [];
    var j = job || {};
    if (!j.sourceUrl || !/^https?:\/\//.test(String(j.sourceUrl))) errors.push('sourceUrl mancante o non valido');
    var portal = String(j.portal || '');
    if (['immobiliare', 'idealista', 'subito'].indexOf(portal) < 0) {
      errors.push('portale non supportato per la chat: ' + (portal || '(vuoto)'));
    }
    var msg = clean(j.message);
    if (msg.length < 40) errors.push('messaggio troppo corto (<40 caratteri): non è un contatto serio');
    if (msg.length > MAX_LEN) errors.push('messaggio oltre ' + MAX_LEN + ' caratteri');
    // Telefono = una sequenza con ALMENO 9 CIFRE (contate, non caratteri):
    // "01.09.2026" ha 8 cifre ed è una data legittima nel testo; un numero
    // italiano ne ha 9-10 e non passa mai.
    var runs = msg.match(/\+?\d[\d .\-]{6,}\d/g) || [];
    var hasPhone = false;
    for (var i = 0; i < runs.length; i++) {
      if (runs[i].replace(/\D/g, '').length >= 9) { hasPhone = true; break; }
    }
    if (hasPhone) errors.push('il messaggio contiene un numero di telefono: la chat del portale È il canale');
    return { ok: !errors.length, errors: errors };
  }

  var API = {
    STYLES: STYLES, VOICES: VOICES, MAX_LEN: MAX_LEN,
    buildMessage: buildMessage, listingLabel: listingLabel,
    outreachKey: outreachKey, validateJob: validateJob,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_OUTREACH = API;
})(typeof window !== 'undefined' ? window : this);
