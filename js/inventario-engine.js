/* js/inventario-engine.js — L'INVENTARIO: cosa c'è in casa, e in che stato.
 *
 * Il verbale di consegna (api/contracts/verbale.js) rinviava agli arredi con
 * UNA riga di stile notarile: "completa degli arredi e delle dotazioni
 * pattuite". Vera, e inservibile: al rientro, diciotto mesi dopo, quella
 * frase non dice se la lavastoviglie c'era, se il divano aveva già lo
 * strappo, se le sei sedie erano sei. La trattenuta sul deposito si decide
 * su quella differenza — e senza un elenco la decide chi grida più forte.
 *
 * Qui l'elenco nasce dal giro che l'operatore fa comunque: filma le stanze,
 * la pagina estrae i fotogrammi, Claude propone stanza per stanza, e
 * l'operatore CORREGGE. Il motore è questo file: puro, senza rete e senza
 * Firestore, così le regole si possono testare senza un browser e senza un
 * appartamento.
 *
 * ─── LE QUATTRO REGOLE DURE ──────────────────────────────────────────────
 *
 * 1. UNA CONDIZIONE NON DICHIARATA RESTA VUOTA, MAI "BUONO".
 *    È l'asimmetria che conta: scrivere "buono" su un oggetto che nessuno
 *    ha guardato costa il deposito a un inquilino onesto, o una rinuncia al
 *    proprietario. Un trattino non ha mai fatto perdere una causa; un
 *    aggettivo inventato sì. Vale sia per il modello sia per i default.
 *
 * 2. LA PROPOSTA DELL'AI NON È UN FATTO. Tutto ciò che arriva dal video
 *    nasce `source:'ai'`; l'inventario diventa salvabile solo quando
 *    l'operatore lo ha rivisto (`reviewed`), e ogni riga che tocca passa a
 *    `source:'human'`. Il PDF stampa chi ha detto cosa.
 *
 * 3. NIENTE SI CREA DAL NULLA. Campi in whitelist, stanze normalizzate su
 *    un lessico chiuso, marca/modello solo se l'operatore li scrive. Una
 *    riga senza nome non è una riga: si scarta.
 *
 * 4. NESSUN TAGLIO SILENZIOSO. I tetti esistono (una risposta impazzita non
 *    deve produrre un PDF di 400 pagine) ma quello che si taglia viene
 *    DETTO in `warnings`. Un elenco troncato in silenzio si legge come un
 *    elenco completo — ed è la peggiore delle due bugie possibili.
 *
 * Consumatori: /inventario (la pagina sul telefono), api/contracts/
 * inventario.js (analisi + PDF + archivio) e api/contracts/verbale.js (che
 * stampa l'elenco DENTRO il verbale invece della frase generica).
 */
(function (root) {
  'use strict';

  // ─── Lessico chiuso delle stanze ────────────────────────────────────────
  // Chiavi canoniche + etichetta italiana. Il modello può dire "salotto",
  // "living room" o "cucina abitabile": qui diventano una cosa sola, così
  // due giri sulla stessa casa non producono due stanze diverse.
  var ROOMS = [
    { key: 'ingresso',  label: 'Ingresso',            syn: ['entrata', 'entrance', 'hall', 'hallway', 'atrio', 'disimpegno', 'corridoio', 'corridor'] },
    { key: 'soggiorno', label: 'Soggiorno',           syn: ['salotto', 'living', 'living room', 'sala', 'salone', 'sala da pranzo', 'dining', 'dining room', 'zona giorno'] },
    { key: 'cucina',    label: 'Cucina',              syn: ['kitchen', 'cucinotto', 'angolo cottura', 'kitchenette', 'cucina abitabile'] },
    { key: 'camera',    label: 'Camera',              syn: ['camera da letto', 'bedroom', 'stanza da letto', 'cameretta', 'matrimoniale', 'singola', 'doppia'] },
    { key: 'bagno',     label: 'Bagno',               syn: ['bathroom', 'servizio', 'servizi', 'wc', 'toilette', 'antibagno', 'doccia'] },
    { key: 'studio',    label: 'Studio',              syn: ['ufficio', 'office', 'studiolo'] },
    { key: 'balcone',   label: 'Balcone',             syn: ['balcony', 'loggia', 'veranda'] },
    { key: 'terrazzo',  label: 'Terrazzo',            syn: ['terrace', 'terrazza', 'roof', 'lastrico'] },
    { key: 'lavanderia',label: 'Lavanderia',          syn: ['laundry', 'ripostiglio lavanderia'] },
    { key: 'ripostiglio', label: 'Ripostiglio',       syn: ['sgabuzzino', 'storage', 'closet', 'armadio a muro', 'cabina armadio', 'walk-in'] },
    { key: 'cantina',   label: 'Cantina',             syn: ['cellar', 'basement', 'soffitta', 'solaio'] },
    { key: 'box',       label: 'Box / posto auto',    syn: ['garage', 'posto auto', 'parking'] },
    { key: 'comune',    label: 'Parti comuni',        syn: ['androne', 'scale', 'cortile', 'pianerottolo'] },
    { key: 'impianti',  label: 'Impianti e contatori',syn: ['caldaia', 'contatori', 'quadro elettrico', 'boiler', 'meters', 'impianto'] },
    { key: 'altro',     label: 'Altro',               syn: ['other', 'varie', 'generale'] }
  ];
  var MAX_ROOMS = 16, MAX_ITEMS_PER_ROOM = 30, MAX_ITEMS = 150;

  // Le condizioni sono quattro, e la quinta possibilità — non dichiarata —
  // è `null`. Vedi regola 1: non è un buco da riempire, è un'informazione.
  var CONDITIONS = ['nuovo', 'buono', 'usato', 'danneggiato'];
  var CONDITION_LABEL = {
    nuovo: 'nuovo / come nuovo',
    buono: 'buono stato',
    usato: 'segni d\'uso',
    danneggiato: 'danneggiato'
  };

  function s(v) { return v == null ? '' : String(v); }
  function clip(v, n) { return s(v).replace(/\s+/g, ' ').trim().slice(0, n || 80); }
  function deaccent(v) {
    return s(v).toLowerCase()
      .replace(/[àáâä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
      .replace(/[òóôö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* ── Stanze ─────────────────────────────────────────────────────────────
   * "Camera 2", "camera da letto 2", "bedroom 2" → {key:'camera', n:2}.
   * Il numero sopravvive perché due camere sono due stanze diverse; una
   * stanza che non riconosciamo NON diventa "soggiorno" per simpatia, ma
   * 'altro' con l'etichetta originale — meglio una riga onesta che una
   * riga sbagliata in un documento che vale sul deposito.
   */
  function normalizeRoom(raw) {
    var txt = deaccent(raw);
    if (!txt) return { key: 'altro', label: ROOMS[ROOMS.length - 1].label, n: 0 };
    var num = 0;
    var m = /(?:^|\s)(?:n\.?\s*)?([2-9])(?:\s*$)/.exec(txt);
    if (m) { num = +m[1]; txt = txt.slice(0, m.index).trim(); }
    var best = null;
    for (var i = 0; i < ROOMS.length; i++) {
      var r = ROOMS[i];
      var names = [r.key, deaccent(r.label)].concat(r.syn.map(deaccent));
      for (var j = 0; j < names.length; j++) {
        var n = names[j];
        if (!n) continue;
        // parola intera: "camera" dentro "telecamera" non è una stanza
        var re = new RegExp('(^|\\s)' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|\\s)');
        if (re.test(txt) && (!best || n.length > best.len)) best = { key: r.key, label: r.label, len: n.length };
      }
    }
    if (!best) {
      var lbl = clip(raw, 40);
      return { key: 'altro', label: lbl ? lbl.charAt(0).toUpperCase() + lbl.slice(1) : 'Altro', n: num };
    }
    return { key: best.key, label: best.label + (num ? ' ' + num : ''), n: num };
  }
  function roomId(r) { return r.key + (r.n ? '#' + r.n : ''); }

  /* ── Voci ───────────────────────────────────────────────────────────────
   * Whitelist stretta. `condition` non dichiarata resta null (regola 1);
   * una quantità che non è un numero vale 1 — l'oggetto è comunque lì —
   * ma non si inventa mai un "6" perché sembravano tante sedie.
   */
  // Il modello puo AFFERMARE solo cio che si vede in un fotogramma: un
  // difetto ('danneggiato') o un oggetto palesemente nuovo. "Buono stato" e
  // "segni d'uso" sono GIUDIZI: se li accettassimo dall'AI, un aggettivo mai
  // verificato da nessuno finirebbe in un documento che, tra diciotto mesi,
  // decide una trattenuta sul deposito. Un umano puo dichiararli, il video no.
  var AI_MAY_ASSERT = ['danneggiato', 'nuovo'];

  function normalizeItem(raw, opts) {
    var o = raw || {}, oo = opts || {};
    var src = oo.source === 'human' ? 'human' : 'ai';
    var name = clip(o.name || o.item || o.label, 70);
    if (!name || deaccent(name).length < 2) return null;
    var qty = Number(o.qty != null ? o.qty : o.quantity);
    if (!isFinite(qty) || qty < 1) qty = 1;
    qty = Math.min(99, Math.round(qty));
    var source = (o.source === 'human' || o.source === 'ai') ? o.source : src;
    var cond = s(o.condition || o.stato).toLowerCase().trim();
    if (CONDITIONS.indexOf(cond) < 0) cond = null;
    if (cond && source === 'ai' && AI_MAY_ASSERT.indexOf(cond) < 0) {
      cond = null;
      if (oo.stats) oo.stats.downgraded = (oo.stats.downgraded || 0) + 1;
    }
    return {
      name: name,
      qty: qty,
      condition: cond,                        // null = non dichiarata, e resta tale
      note: clip(o.note || o.notes, 160) || '',
      source: source
    };
  }

  function itemKey(it) { return deaccent(it.name); }

  /* ── La proposta grezza → inventario ────────────────────────────────────
   * Accetta sia { rooms:[{room, items:[]}] } sia una lista piatta di voci
   * con `room` dentro: il modello sbaglia forma prima di sbagliare sostanza,
   * e una forma diversa non deve buttare via il giro in appartamento.
   */
  function normalizeProposal(raw, opts) {
    opts = opts || {};
    var warnings = [];
    var input = raw;
    if (input && !Array.isArray(input) && Array.isArray(input.rooms)) input = input.rooms;
    if (input && !Array.isArray(input) && Array.isArray(input.items)) input = [{ room: 'altro', items: input.items }];
    if (!Array.isArray(input)) return { rooms: [], warnings: ['nessuna_proposta'], counts: { rooms: 0, items: 0, pieces: 0 } };

    // lista piatta di voci → raggruppa per stanza
    if (input.length && input[0] && !Array.isArray(input[0].items) && (input[0].name || input[0].item)) {
      var byRoom = [];
      var idx = {};
      for (var f = 0; f < input.length; f++) {
        var rn = s(input[f].room || input[f].stanza || 'altro');
        if (!idx[rn]) { idx[rn] = { room: rn, items: [] }; byRoom.push(idx[rn]); }
        idx[rn].items.push(input[f]);
      }
      input = byRoom;
    }

    var rooms = [], seen = {}, pieces = 0, items = 0, dropped = 0, overflow = 0;
    var stats = { downgraded: 0 };
    opts = { source: opts.source, stats: stats };
    for (var i = 0; i < input.length; i++) {
      var block = input[i] || {};
      var rr = normalizeRoom(block.room || block.stanza || block.label || block.name);
      var id = roomId(rr);
      var target = seen[id];
      if (!target) {
        if (rooms.length >= MAX_ROOMS) { overflow++; continue; }
        target = { key: rr.key, label: rr.label, n: rr.n, items: [] };
        seen[id] = target; rooms.push(target);
      }
      var list = Array.isArray(block.items) ? block.items : [];
      for (var k = 0; k < list.length; k++) {
        var it = normalizeItem(list[k], opts);
        if (!it) { dropped++; continue; }
        if (target.items.length >= MAX_ITEMS_PER_ROOM || items >= MAX_ITEMS) { overflow++; continue; }
        // stessa voce due volte nella stessa stanza (il modello vede il
        // divano da due fotogrammi): si fondono, non si contano due volte.
        var dup = null;
        for (var d = 0; d < target.items.length; d++) if (itemKey(target.items[d]) === itemKey(it)) { dup = target.items[d]; break; }
        if (dup) {
          dup.qty = Math.max(dup.qty, it.qty);
          if (!dup.condition && it.condition) dup.condition = it.condition;
          if (it.note && dup.note.indexOf(it.note) < 0) dup.note = clip(dup.note ? dup.note + '; ' + it.note : it.note, 160);
          continue;
        }
        target.items.push(it);
        items++; pieces += it.qty;
      }
    }
    rooms = rooms.filter(function (r) { return r.items.length > 0; });
    if (dropped) warnings.push(dropped + (dropped === 1 ? ' voce scartata perché senza nome' : ' voci scartate perché senza nome'));
    if (overflow) warnings.push(overflow + (overflow === 1 ? ' voce oltre il tetto: NON è' : ' voci oltre il tetto: NON sono') + ' nel documento');
    if (stats.downgraded) warnings.push(stats.downgraded + (stats.downgraded === 1 ? ' condizione generica proposta dal video riportata a "non dichiarata"' : ' condizioni generiche proposte dal video riportate a "non dichiarata"') + ': dichiarale tu se le hai verificate');
    return { rooms: rooms, warnings: warnings, counts: counts(rooms) };
  }

  function counts(rooms) {
    var items = 0, pieces = 0, undeclared = 0, damaged = 0;
    (rooms || []).forEach(function (r) {
      (r.items || []).forEach(function (it) {
        items++; pieces += it.qty || 1;
        if (!it.condition) undeclared++;
        if (it.condition === 'danneggiato') damaged++;
      });
    });
    return { rooms: (rooms || []).length, items: items, pieces: pieces, undeclared: undeclared, damaged: damaged };
  }

  /* ── Fusione di due passaggi ────────────────────────────────────────────
   * Un secondo video (la cantina, il balcone dimenticato) si AGGIUNGE: non
   * si perde mai una riga che l'operatore ha già corretto, e una condizione
   * scritta da un umano batte sempre quella proposta dal modello.
   */
  function mergeInventory(base, add) {
    var out = { rooms: [], warnings: [], counts: null };
    var idx = {};
    function push(room) {
      var id = roomId({ key: room.key, n: room.n || 0 });
      if (!idx[id]) { idx[id] = { key: room.key, label: room.label, n: room.n || 0, items: [] }; out.rooms.push(idx[id]); }
      return idx[id];
    }
    function absorb(inv) {
      ((inv && inv.rooms) || []).forEach(function (r) {
        var t = push(r);
        (r.items || []).forEach(function (it) {
          var cur = null;
          for (var i = 0; i < t.items.length; i++) if (itemKey(t.items[i]) === itemKey(it)) { cur = t.items[i]; break; }
          if (!cur) { t.items.push(JSON.parse(JSON.stringify(it))); return; }
          cur.qty = Math.max(cur.qty, it.qty);
          if (it.source === 'human' && it.condition) { cur.condition = it.condition; cur.source = 'human'; }
          else if (!cur.condition && it.condition) cur.condition = it.condition;
          if (it.note && cur.note.indexOf(it.note) < 0) cur.note = clip(cur.note ? cur.note + '; ' + it.note : it.note, 160);
        });
      });
    }
    absorb(base); absorb(add);
    out.rooms = out.rooms.filter(function (r) { return r.items.length > 0; });
    out.counts = counts(out.rooms);
    return out;
  }

  /* ── Fotogrammi ─────────────────────────────────────────────────────────
   * Quanti istanti guardare di un video lungo `dur` secondi. Si evitano il
   * primissimo e l'ultimo istante (mano sulla maniglia, telefono che si
   * abbassa) e si sta larghi almeno 1.2s per non pagare due volte lo stesso
   * fotogramma.
   */
  function framePlan(durationSec, max) {
    var dur = Number(durationSec);
    var n = Math.max(1, Math.min(Math.round(max || 10), 16));
    if (!isFinite(dur) || dur <= 0) return [];
    var usable = Math.max(0.2, dur - 0.6);
    var count = Math.max(1, Math.min(n, Math.floor(usable / 1.2) || 1));
    var out = [];
    for (var i = 0; i < count; i++) out.push(Math.min(dur - 0.05, +(0.3 + usable * ((i + 0.5) / count)).toFixed(2)));
    return out;
  }

  /* ── Confronto ingresso ⇄ uscita ────────────────────────────────────────
   * Il motivo per cui l'inventario esiste. `missing` = c'era e non c'è
   * più; `damaged` = c'era intero e torna rotto; `added` = comparso dopo
   * (non è un danno, ma va detto). Una voce la cui condizione all'ingresso
   * NON era dichiarata non può diventare un danno all'uscita: non sappiamo
   * da dove partiva — finisce in `unverifiable`, che è la verità.
   */
  function diffInventory(entry, exit) {
    var res = { missing: [], damaged: [], added: [], unverifiable: [], intact: 0 };
    var e = {}, x = {};
    ((entry && entry.rooms) || []).forEach(function (r) { (r.items || []).forEach(function (it) { e[roomId(r) + '|' + itemKey(it)] = { room: r.label, it: it }; }); });
    ((exit && exit.rooms) || []).forEach(function (r) { (r.items || []).forEach(function (it) { x[roomId(r) + '|' + itemKey(it)] = { room: r.label, it: it }; }); });
    Object.keys(e).forEach(function (k) {
      var was = e[k], now = x[k];
      if (!now) { res.missing.push({ room: was.room, name: was.it.name, qty: was.it.qty }); return; }
      if (now.it.qty < was.it.qty) res.missing.push({ room: was.room, name: was.it.name, qty: was.it.qty - now.it.qty });
      var worse = now.it.condition === 'danneggiato' && was.it.condition !== 'danneggiato';
      if (worse && !was.it.condition) { res.unverifiable.push({ room: was.room, name: was.it.name, why: 'condizione alla consegna non dichiarata' }); return; }
      if (worse) { res.damaged.push({ room: was.room, name: was.it.name, from: was.it.condition, to: now.it.condition }); return; }
      res.intact++;
    });
    Object.keys(x).forEach(function (k) { if (!e[k]) res.added.push({ room: x[k].room, name: x[k].it.name, qty: x[k].it.qty }); });
    return res;
  }

  /* ── Salvabile? ─────────────────────────────────────────────────────────
   * Regola 2: un elenco che nessuno ha riguardato non diventa un documento
   * firmato. La pagina alza `reviewed` quando l'operatore ha davvero
   * scorso la lista; qui si pretende quello, più almeno una voce.
   */
  function saveable(inv) {
    var c = counts((inv || {}).rooms);
    if (!c.items) return { ok: false, error: 'inventario_vuoto' };
    if (!inv.reviewed) return { ok: false, error: 'non_rivisto' };
    return { ok: true };
  }

  function conditionLabel(c) { return c ? (CONDITION_LABEL[c] || c) : 'non dichiarata'; }

  function summaryLine(inv) {
    var c = counts((inv || {}).rooms);
    if (!c.items) return 'Nessuna voce';
    var parts = [c.pieces + (c.pieces === 1 ? ' pezzo' : ' pezzi') + ' in ' + c.rooms + (c.rooms === 1 ? ' stanza' : ' stanze')];
    if (c.damaged) parts.push(c.damaged + ' danneggiat' + (c.damaged === 1 ? 'o' : 'i'));
    if (c.undeclared) parts.push(c.undeclared + ' senza condizione');
    return parts.join(' · ');
  }

  /* Righe piatte per il PDF e per il verbale — un solo posto che decide
   * l'ordine (stanze come sono state visitate, voci come inserite). */
  function flatRows(inv) {
    var rows = [];
    (((inv || {}).rooms) || []).forEach(function (r) {
      rows.push({ kind: 'room', label: r.label, count: (r.items || []).length });
      (r.items || []).forEach(function (it) {
        rows.push({
          kind: 'item', room: r.label, name: it.name, qty: it.qty,
          condition: it.condition, conditionLabel: conditionLabel(it.condition),
          note: it.note || '', source: it.source
        });
      });
    });
    return rows;
  }

  var API = {
    ROOMS: ROOMS,
    CONDITIONS: CONDITIONS,
    CONDITION_LABEL: CONDITION_LABEL,
    MAX_ROOMS: MAX_ROOMS,
    MAX_ITEMS: MAX_ITEMS,
    MAX_ITEMS_PER_ROOM: MAX_ITEMS_PER_ROOM,
    AI_MAY_ASSERT: AI_MAY_ASSERT,
    normalizeRoom: normalizeRoom,
    normalizeItem: normalizeItem,
    normalizeProposal: normalizeProposal,
    mergeInventory: mergeInventory,
    diffInventory: diffInventory,
    framePlan: framePlan,
    counts: counts,
    saveable: saveable,
    summaryLine: summaryLine,
    conditionLabel: conditionLabel,
    flatRows: flatRows
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_INVENTARIO = API;
})(typeof window !== 'undefined' ? window : this);
