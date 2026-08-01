// js/viewing-availability.js — la REGOLA della disponibilità, lato console.
//
// Fino a oggi le finestre di prenotazione (lun-ven 10-13 e 15-19, sab 10-13)
// erano i default hardcoded di api/viewings/_avail.js: nessuna pagina le
// mostrava e nessuna le poteva cambiare. L'operatore poteva solo TOGLIERE
// tempo dal calendario Google, mai ridefinire l'orario di lavoro.
//
// La divisione dei ruoli che ne esce è quella giusta:
//   · la REGOLA (quando lavoro, quanto dura una visita, quanto preavviso)
//     si scrive qui, una volta, e vive su settings/viewingAvailability
//   · le ECCEZIONI (oggi pomeriggio no, giovedì sono dal notaio) si fanno
//     trascinando un evento "Impegnato" in Google Calendar — nessuna UI
//
// Questo file è PURO: nessun Firestore, nessun DOM. Il portal lo carica e
// tests/viewings/availability-ui.mjs lo importa così com'è, perché una
// finestra oraria scritta male chiude le prenotazioni di un giorno intero.

(function (root) {
  'use strict';

  const DAYS = [
    { i: 1, short: 'Lun', long: 'Lunedì' },
    { i: 2, short: 'Mar', long: 'Martedì' },
    { i: 3, short: 'Mer', long: 'Mercoledì' },
    { i: 4, short: 'Gio', long: 'Giovedì' },
    { i: 5, short: 'Ven', long: 'Venerdì' },
    { i: 6, short: 'Sab', long: 'Sabato' },
    { i: 0, short: 'Dom', long: 'Domenica' },
  ];

  // Gli stessi default del server (api/viewings/_avail.js): la console deve
  // mostrare ciò che il sito sta REALMENTE offrendo, non un placeholder.
  const UI_DEFAULTS = {
    windows: {
      1: [['10:00', '13:00'], ['15:00', '19:00']],
      2: [['10:00', '13:00'], ['15:00', '19:00']],
      3: [['10:00', '13:00'], ['15:00', '19:00']],
      4: [['10:00', '13:00'], ['15:00', '19:00']],
      5: [['10:00', '13:00'], ['15:00', '18:00']],
      6: [['10:00', '13:00']],
    },
    slotMinutes: { person: 45, video: 20 },
    minNoticeHours: 4,
    horizonDays: 14,
    maxPerDay: 6,
  };

  const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  const toMin = t => { const m = HHMM.exec(String(t || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };
  const toHHMM = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  /** "10:00-13:00, 15:00-19:00" → [['10:00','13:00'],['15:00','19:00']] */
  function parseWindows(text) {
    const out = [];
    for (const chunk of String(text || '').split(',')) {
      const t = chunk.trim();
      if (!t) continue;
      const [a, b] = t.split(/\s*[-–—]\s*/);
      const s = toMin(a), e = toMin(b);
      if (s == null || e == null) throw new Error(`orario non valido: "${t}"`);
      if (e <= s) throw new Error(`la fine deve venire dopo l'inizio: "${t}"`);
      out.push([toHHMM(s), toHHMM(e)]);
    }
    out.sort((x, y) => toMin(x[0]) - toMin(y[0]));
    for (let i = 1; i < out.length; i++) {
      if (toMin(out[i][0]) < toMin(out[i - 1][1])) throw new Error(`finestre sovrapposte: ${out[i - 1].join('-')} e ${out[i].join('-')}`);
    }
    return out;
  }

  const formatWindows = wins =>
    (wins || []).map(w => `${w[0]}-${w[1]}`).join(', ');

  /**
   * Il form → il doc che il server legge. Lancia con un messaggio in italiano
   * al primo valore impossibile: meglio un errore in faccia che una griglia
   * vuota scoperta dal cliente.
   */
  function buildConfig(form) {
    const windows = {};
    for (const d of DAYS) {
      const wins = parseWindows(form.windows[d.i] || '');
      if (wins.length) windows[d.i] = wins;
    }
    if (!Object.keys(windows).length) throw new Error('Almeno un giorno deve avere una finestra, altrimenti nessuno può prenotare.');

    const person = Math.round(Number(form.person));
    const video = Math.round(Number(form.video));
    if (!(person >= 10 && person <= 180)) throw new Error('Durata visita di persona: tra 10 e 180 minuti.');
    if (!(video >= 10 && video <= 180)) throw new Error('Durata video: tra 10 e 180 minuti.');

    const minNoticeHours = Number(form.minNoticeHours);
    if (!(minNoticeHours >= 0 && minNoticeHours <= 168)) throw new Error('Preavviso: tra 0 e 168 ore.');
    const horizonDays = Math.round(Number(form.horizonDays));
    if (!(horizonDays >= 1 && horizonDays <= 30)) throw new Error('Orizzonte: tra 1 e 30 giorni (il server taglia comunque a 30).');
    const maxPerDay = Math.round(Number(form.maxPerDay));
    if (!(maxPerDay >= 1 && maxPerDay <= 20)) throw new Error('Massimo visite al giorno: tra 1 e 20.');

    const cfg = { windows, slotMinutes: { person, video }, minNoticeHours, horizonDays, maxPerDay };
    if (form.busyIcs != null) {
      const url = String(form.busyIcs).trim();
      if (url && !/^https:\/\/\S+$/i.test(url)) throw new Error('L\'indirizzo del calendario deve iniziare con https://');
      cfg.busyIcs = url || null;
    }
    return cfg;
  }

  /**
   * Quante visite entrano davvero in una giornata, con questa regola.
   * Serve a rispondere alla domanda che l'operatore si fa guardando il form
   * ("e quindi quanti appuntamenti sto offrendo?") senza dover salvare.
   */
  function previewCount(windows, stepMinutes, gapMinutes = 15) {
    let n = 0;
    for (const wins of Object.values(windows || {})) {
      for (const [a, b] of wins) {
        const s = toMin(a), e = toMin(b);
        let cur = s;
        while (cur + stepMinutes <= e) { n++; cur += stepMinutes + gapMinutes; }
      }
    }
    return n;
  }

  // ── l'avviso quando forzi un orario ───────────────────────────────────────
  // Dal portal puoi mettere QUALSIASI data e ora: sei l'operatore, a volte
  // devi forzare. Ma nessuno ti diceva che stavi sovrapponendo due clienti.
  // Questo non blocca: avverte.

  const romeParts = d => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /**
   * @param when     Date proposta
   * @param minutes  durata della visita proposta
   * @param others   [{id, start:Date, minutes, clientName, listingName}] visite vive
   * @param cfg      config disponibilità (windows in ora di Roma)
   * @param exceptId visita che si sta spostando (non è un conflitto con sé stessa)
   * @returns [{level:'clash'|'outside'|'past', text}]
   */
  function checkSlot(when, minutes, others, cfg, exceptId = null, now = new Date()) {
    const out = [];
    if (!(when instanceof Date) || isNaN(when.getTime())) return out;
    const s = when.getTime(), e = s + (Number(minutes) || 45) * 60000;

    if (s < now.getTime()) out.push({ level: 'past', text: 'È un orario nel passato.' });

    for (const o of others || []) {
      if (!o || !o.start || (exceptId && o.id === exceptId)) continue;
      const os = o.start.getTime(), oe = os + (Number(o.minutes) || 45) * 60000;
      if (s < oe && e > os) {
        const who = [o.clientName, o.listingName].filter(Boolean).join(' — ') || 'un\'altra visita';
        const at = romeParts(o.start);
        out.push({ level: 'clash', text: `Si sovrappone a ${who} (${at.hour}:${at.minute}).` });
      }
    }

    const p = romeParts(when);
    const wins = (cfg && cfg.windows && cfg.windows[DOW[p.weekday]]) || [];
    const mins = +p.hour * 60 + +p.minute;
    const inside = wins.some(([a, b]) => mins >= toMin(a) && mins + (Number(minutes) || 45) <= toMin(b));
    if (!inside) {
      out.push({
        level: 'outside',
        text: wins.length
          ? `Fuori dalle tue finestre di ${p.weekday === 'Sun' ? 'domenica' : 'quel giorno'} (${formatWindows(wins)}).`
          : 'Quel giorno non hai finestre di disponibilità.',
      });
    }
    return out;
  }


  var API = {
    DAYS: DAYS, UI_DEFAULTS: UI_DEFAULTS,
    toMin: toMin, toHHMM: toHHMM,
    parseWindows: parseWindows, formatWindows: formatWindows,
    buildConfig: buildConfig, previewCount: previewCount, checkSlot: checkSlot,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_AVAIL = API;
})(typeof window !== 'undefined' ? window : this);
