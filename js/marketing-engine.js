/* js/marketing-engine.js — IL REPARTO MARKETING, la parte che decide.
 *
 * Il Creativo (api/marketing/creativo.js) trasforma le foto già curate dal
 * Fotografo in un reel via Higgsfield. TUTTO il giudizio sta qui — chi ha
 * bisogno di un reel, in che ordine, con quali tetti di spesa, con quale
 * brief — così si testa senza rete, senza Firestore e senza spendere un
 * credito (la disciplina di dataops/radar/miniera).
 *
 * Le regole dure, pinnate nei test:
 *  1. GENERA DA SOLO, PUBBLICA MAI DA SOLO. Questo motore non conosce
 *     nemmeno il concetto di scrivere `videoUrl`: produce lavoro e messaggi
 *     di proposta. La vetrina la tocca l'operatore col binario che già usa
 *     (/video <id> <url> sul bot).
 *  2. MAI UN FATTO INVENTATO, MAI IL PREZZO NEI PIXEL. Il prompt visivo
 *     nasce solo dai dati veri dell'annuncio, e un prezzo cotto dentro un
 *     video invecchia alla prima trattativa: non entra, punto.
 *  3. UN FALLIMENTO NON SI RITENTA DA SOLO (la lezione SDD): un retry cieco
 *     brucia crediti sullo stesso scoglio. Si riprova solo quando cambiano
 *     le foto (l'id È l'impronta delle foto).
 *  4. OGNI ESCLUSIONE DICE PERCHÉ — un'esclusione silenziosa è
 *     indistinguibile da un bug (la lezione della ricerca rovesciata).
 *
 * Puro: nessun Firebase, nessuna rete, nessun Date.now() implicito.
 * window.BOOM_MARKETING (UMD, come boom-geo / squadra-registry).
 */
(function (root) {
  'use strict';

  /* ── Le foto sorgente ────────────────────────────────────────────────────
   * Copertina prima (l'ordine è quello del Fotografo: la prima È la
   * copertina), solo http(s) — un data: URI o un path locale non è
   * materiale di marketing — dedupe, tetto dichiarato. */
  var MAX_PHOTOS = 12;
  function sourcePhotos(l) {
    var raw = [l && l.image].concat(Array.isArray(l && l.images) ? l.images : []);
    var seen = {}, out = [];
    for (var i = 0; i < raw.length; i++) {
      var u = typeof raw[i] === 'string' ? raw[i].trim() : '';
      if (!/^https?:\/\//i.test(u)) continue;
      if (seen[u]) continue;
      seen[u] = true;
      out.push(u);
      if (out.length >= MAX_PHOTOS) break;
    }
    return out;
  }

  /* fnv-1a 32 bit → base36. Deterministico, zero dipendenze: serve
   * un'impronta stabile, non crittografia. */
  function contentHash(s) {
    var h = 0x811c9dc5;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  /* L'id del creativo È l'impronta delle foto: stesse foto → stesso id →
   * fsCreate risponde 409 e un rerun non sottomette due volte (idempotenza
   * per costruzione, la lezione del lucchetto). Foto nuove → id nuovo →
   * l'annuncio si ricandida da solo. */
  function creativeId(l) {
    return 'crea_' + String((l && l.id) || 'x') + '_' + contentHash(sourcePhotos(l).join('|'));
  }

  /* ── Chi ha bisogno di un reel ──────────────────────────────────────────
   * creativesById: mappa id→doc dei marketingCreatives esistenti.
   * Ritorna { ok, why } — il why è per l'operatore, in italiano. */
  var MIN_PHOTOS = 3;
  function needsCreative(l, creativesById) {
    if (!l || !l.id) return { ok: false, why: 'annuncio senza id' };
    if (l.status !== 'available') return { ok: false, why: 'non disponibile (status ' + (l.status || 'ignoto') + ')' };
    if (l.videoUrl || l.youtubeUrl) return { ok: false, why: 'ha già un video tour' };
    var photos = sourcePhotos(l);
    if (photos.length < MIN_PHOTOS) return { ok: false, why: 'galleria povera (' + photos.length + ' foto) — prima tocca al Fotografo' };
    var id = creativeId(l);
    var prev = creativesById && creativesById[id];
    if (prev) {
      if (prev.status === 'failed') return { ok: false, why: 'ultimo tentativo fallito — si riprova solo se cambiano le foto' };
      if (prev.status === 'ready') return { ok: false, why: 'reel già pronto, in attesa di pubblicazione' };
      return { ok: false, why: 'reel già in lavorazione' };
    }
    return { ok: true, why: null };
  }

  /* Settimana ISO ('2026-W35') — il tetto di spesa si conta per settimana,
   * e si conta su ciò che è stato SOTTOMESSO (anche i falliti: la spesa
   * c'è stata comunque). */
  function weekOf(d) {
    d = d instanceof Date ? d : new Date(d || Date.now());
    var u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = u.getUTCDay() || 7;
    u.setUTCDate(u.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(u.getUTCFullYear(), 0, 1));
    var w = Math.ceil((((u - y0) / 86400000) + 1) / 7);
    return u.getUTCFullYear() + '-W' + (w < 10 ? '0' + w : w);
  }

  /* ── La worklist del giro ───────────────────────────────────────────────
   * listings: catalogo. creatives: array dei marketingCreatives (con .id).
   * k: manopole { maxPerRun, weeklyCap }. now: Date del giro.
   *
   * Ordine: gallerie ricche prima (la lezione sweepOrder del Fotografo — un
   * reel su 12 foto curate vale più di uno su 3), pareggio stabile per id. */
  function pickWork(listings, creatives, k, now) {
    var byId = {};
    (creatives || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; });

    var week = weekOf(now);
    var weeklyCount = (creatives || []).filter(function (c) {
      return c && c.createdAt && weekOf(new Date(c.createdAt)) === week;
    }).length;

    var eligible = [], skipped = [];
    (listings || []).forEach(function (l) {
      var v = needsCreative(l, byId);
      if (v.ok) eligible.push(l);
      else skipped.push({ id: (l && l.id) || null, name: (l && l.name) || null, why: v.why });
    });

    eligible.sort(function (a, b) {
      var d = sourcePhotos(b).length - sourcePhotos(a).length;
      return d !== 0 ? d : (String(a.id) < String(b.id) ? -1 : 1);
    });

    var weeklyCap = Math.max(0, Number((k && k.weeklyCap) != null ? k.weeklyCap : 5));
    var maxPerRun = Math.max(0, Number((k && k.maxPerRun) != null ? k.maxPerRun : 1));
    var budgetLeft = Math.max(0, weeklyCap - weeklyCount);
    var todo = eligible.slice(0, Math.min(maxPerRun, budgetLeft));

    return { todo: todo, eligible: eligible.length, skipped: skipped, weeklyCount: weeklyCount, budgetLeft: budgetLeft };
  }

  /* ── Il brief visivo ────────────────────────────────────────────────────
   * Regia cinematografica generica + SOLO i fatti presenti sull'annuncio.
   * Niente prezzo, niente claim, niente testo cotto nei pixel: le parole
   * (caption, prezzo, CTA) viaggiano ACCANTO al video, dove si possono
   * correggere; i pixel restano veri per sempre. */
  function buildBrief(l) {
    var photos = sourcePhotos(l);
    var subject = 'apartment';
    var t = String((l && l.type) || '').toLowerCase();
    if (t.indexOf('studio') >= 0 || t.indexOf('monolocale') >= 0) subject = 'studio apartment';
    else if (t.indexOf('room') >= 0 || t.indexOf('stanza') >= 0) subject = 'room';
    var where = (l && l.zone) ? String(l.zone) + ', Rome' : 'Rome';
    var prompt =
      'Slow cinematic push-in through a bright ' + subject + ' in ' + where + '. ' +
      'Warm natural light, elegant real-estate showcase, steady smooth camera, ' +
      'photorealistic, no people, no text, no captions, no watermarks.';
    return { imageUrl: photos[0] || null, prompt: prompt };
  }

  /* Escape HTML per Telegram (parse_mode HTML) — la lezione delle card. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  /* La card "reel pronto": anteprima + IL binario di pubblicazione che
   * l'operatore già usa. Il tap (incollare il comando al bot) È
   * l'approvazione — nessuna superficie nuova. */
  function readyMessage(l, videoUrl) {
    return '🎥 <b>Reel pronto</b> — ' + esc((l && l.name) || (l && l.id)) + '\n' +
      'Guarda: ' + esc(videoUrl) + '\n' +
      'Pubblica: <code>/video ' + esc((l && l.id)) + ' ' + esc(videoUrl) + '</code>\n' +
      'In vetrina non c\'è finché non lo pubblichi tu.';
  }

  function failedMessage(l, reason) {
    return '⚠️ <b>Reel non riuscito</b> — ' + esc((l && l.name) || (l && l.id)) + '\n' +
      'Motivo: ' + esc(reason || 'sconosciuto') + '\n' +
      'Non riprovo da solo (crediti): si ritenta quando cambiano le foto.';
  }

  var API = {
    MAX_PHOTOS: MAX_PHOTOS, MIN_PHOTOS: MIN_PHOTOS,
    sourcePhotos: sourcePhotos, contentHash: contentHash, creativeId: creativeId,
    needsCreative: needsCreative, weekOf: weekOf, pickWork: pickWork,
    buildBrief: buildBrief, readyMessage: readyMessage, failedMessage: failedMessage,
    esc: esc,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_MARKETING = API;
})(typeof window !== 'undefined' ? window : this);
