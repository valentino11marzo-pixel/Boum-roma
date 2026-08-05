/* js/market-engine.js — IL PERITO: il libro mastro del mercato, puro.
 *
 * LA DOMANDA A CUI RISPONDE. L'operatore ha chiesto: "davvero il modo
 * migliore è leggere gli alert email?" La risposta onesta è NO, da soli non
 * bastano — e il motivo è strutturale, non di gusto: un alert racconta le
 * NASCITE (è il portale che ti annuncia un annuncio nuovo) ma non racconterà
 * MAI le MORTI. E le morti sono metà del valore: un annuncio che sparisce è
 * (proxy) un affitto concluso — da lì vengono i giorni-di-assorbimento per
 * zona, il dato che trasforma "il tuo prezzo è alto" in "a questo prezzo in
 * zona si affitta in 12 giorni, il tuo è fermo da 30".
 *
 * L'ARCHITETTURA (decisa, non opzionale):
 *   nascite  → le porte esistenti (alert email, occhi di Homie, scan) — ogni
 *              annuncio visto da QUALSIASI porta viene registrato qui;
 *   vita     → ri-avvistamenti: bump di lastSeen, storia prezzi, ribassi;
 *   morte    → verifiche ATTIVE sugli URL noti (via il Mac di Homie: IP
 *              residenziale, browser vero) — con la regola che tiene in piedi
 *              tutto: UN BLOCCO NON È UNA MORTE. Un 403, un captcha, un
 *              timeout sono "non so", mai "affittato". Se il radar è cieco
 *              deve SEMBRARE cieco, non un mercato fermo (la lezione già
 *              scritta in pfs/eyes: runVerdict).
 *   verità   → i canoni FIRMATI nostri, il dato che nessun competitor ha.
 *
 * GDPR, per costruzione: il libro mastro tiene i FATTI dell'annuncio (prezzo,
 * mq, zona, date) — MAI i contatti del privato. observe() li scarta alla
 * porta anche se la sorgente li passa: non è una policy, è il tipo di dato.
 *
 * Puro: nessuna rete, nessun DB, nessun DOM. Ogni funzione è un fold
 * (stato, osservazione) → stato. window.BOOM_MARKET + module.exports (UMD,
 * come canone-engine / squadra-registry — il server la importa uguale).
 */
(function (root) {
  'use strict';

  var PRICE_HISTORY_CAP = 12;

  function T(x) { var t = +new Date(x); return isFinite(t) ? t : null; }
  function iso(x) { return new Date(x).toISOString(); }
  function num(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    var n = parseFloat(String(x).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  /* Zona → slug stabile: 'Centro Storico ' e 'centro-storico' sono la stessa
   * zona. Senza questa normalizzazione le statistiche si spezzano in rivoli. */
  function normalizeZone(z) {
    if (!z) return null;
    var s = String(z).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || null;
  }

  /* ── IL FOLD DELLE OSSERVAZIONI ─────────────────────────────────────────
   * (esistente|null, osservazione, nowIso) → prossimo documento.
   * È l'unica via d'ingresso nel libro mastro: qualunque porta (alert,
   * Homie, scan, ingest PFS) passa da qui, quindi le regole valgono per
   * tutte insieme. */
  function observe(existing, raw, nowIso) {
    var now = nowIso || iso(Date.now());
    var price = num(raw.price);
    var facts = {
      sourceUrl: raw.sourceUrl || (existing && existing.sourceUrl) || null,
      source: raw.source || (existing && existing.source) || null,
      title: raw.title || (existing && existing.title) || null,
      zone: raw.zone || (existing && existing.zone) || null,
      zoneSlug: normalizeZone(raw.zone) || (existing && existing.zoneSlug) || null,
      sqm: num(raw.sqm) != null ? num(raw.sqm) : ((existing && existing.sqm) != null ? existing.sqm : null),
      rooms: num(raw.rooms != null ? raw.rooms : raw.bedrooms) != null
        ? num(raw.rooms != null ? raw.rooms : raw.bedrooms)
        : ((existing && existing.rooms) != null ? existing.rooms : null),
      bathrooms: num(raw.bathrooms) != null ? num(raw.bathrooms) : ((existing && existing.bathrooms) != null ? existing.bathrooms : null),
      furnished: typeof raw.furnished === 'boolean' ? raw.furnished
        : ((existing && typeof existing.furnished === 'boolean') ? existing.furnished : null),
      advertiser: (raw.advertiser === 'private' || raw.advertiser === 'agency') ? raw.advertiser
        : ((existing && existing.advertiser) || 'unknown')
      /* contactEmail / contactPhone / images / description: MAI.
       * Il libro mastro è statistica, non rubrica. */
    };

    if (!existing) {
      return Object.assign({}, facts, {
        price: price,
        priceHistory: price != null ? [{ p: price, at: now }] : [],
        firstSeenAt: now,
        lastSeenAt: now,
        status: 'active',
        needsEnrich: facts.sqm == null || facts.zoneSlug == null
      });
    }

    var next = Object.assign({}, existing, facts, { lastSeenAt: now });

    // Un rivisto era 'gone' o 'unknown' → è di nuovo vivo. Se era morto,
    // è un RIENTRO (relisted): la vita precedente resta nei goneAt storici
    // per l'assorbimento, la nuova vita riparte da ora.
    if (existing.status === 'gone') {
      next.status = 'active';
      next.relistedAt = now;
      next.pastLives = (existing.pastLives || []).concat([{
        firstSeenAt: existing.firstSeenAt, goneAt: existing.goneAt
      }]).slice(-5);
      next.firstSeenAt = now;   // la nuova vita conta da qui
      next.goneAt = null; next.goneEvidence = null;
    } else if (existing.status === 'unknown') {
      next.status = 'active';
    }

    // Storia prezzi: si scrive solo quando il prezzo CAMBIA.
    if (price != null && price !== existing.price) {
      next.price = price;
      next.priceHistory = (existing.priceHistory || []).concat([{ p: price, at: now }]).slice(-PRICE_HISTORY_CAP);
      if (existing.price != null && price < existing.price) next.priceDropAt = now;
    } else if (price != null && existing.price == null) {
      next.price = price;
      next.priceHistory = [{ p: price, at: now }];
    }

    next.needsEnrich = next.sqm == null || next.zoneSlug == null;
    return next;
  }

  /* ── IL VERDETTO DI MORTE ───────────────────────────────────────────────
   * evidence: { httpStatus, requestedUrl?, finalUrl?, marker? }
   *   marker (dal corpo pagina, deciso da chi fa il fetch):
   *     'listing'      → la pagina è ancora un annuncio
   *     'unavailable'  → "annuncio non più disponibile" & simili
   *     'search'       → redirect atterrato su una pagina di ricerca
   *
   * gone SOLO con una prova positiva. Tutto il resto — blocchi, captcha,
   * errori del portale, pagine ambigue — è 'unknown'. Sbagliare qui inquina
   * l'assorbimento: un pomeriggio di 403 diventerebbe "mezza Roma affittata
   * oggi", e ogni numero a valle sarebbe falso. */
  function deathVerdict(ev) {
    if (!ev) return 'unknown';
    var st = num(ev.httpStatus);
    if (st === 404 || st === 410) return 'gone';
    if (st === 200) {
      if (ev.marker === 'unavailable' || ev.marker === 'search') return 'gone';
      if (ev.marker === 'listing') return 'alive';
      return 'unknown';                     // 200 senza marker: prudenza
    }
    return 'unknown';                        // 403/429/5xx/timeout/0: MAI gone
  }

  /* Applica un verdetto al documento. goneAt si stampa UNA volta. */
  function applyCheck(existing, verdict, evidence, nowIso) {
    var now = nowIso || iso(Date.now());
    var next = Object.assign({}, existing, { lastCheckedAt: now });
    if (verdict === 'gone') {
      if (existing.status !== 'gone') {
        next.status = 'gone';
        next.goneAt = now;
        next.goneEvidence = evidence ? {
          httpStatus: num(evidence.httpStatus), marker: evidence.marker || null
        } : null;
      }
      next.consecutiveUnknown = 0;
    } else if (verdict === 'alive') {
      next.status = 'active';
      next.lastSeenAt = now;
      next.consecutiveUnknown = 0;
    } else {
      next.consecutiveUnknown = (existing.consecutiveUnknown || 0) + 1;
      // lo status NON cambia: un blocco non sposta niente
    }
    return next;
  }

  /* La coda di verifica: chi controllare adesso. I vivi mai controllati o
   * controllati da più tempo per primi; chi è stato visto/controllato da
   * poco non si ricontrolla (minIntervalHours). I morti non si controllano. */
  function checkQueue(list, opts) {
    var o = opts || {};
    var batch = o.batch != null ? o.batch : 100;
    var minMs = (o.minIntervalHours != null ? o.minIntervalHours : 20) * 3600e3;
    var now = o.nowMs != null ? o.nowMs : Date.now();
    return (list || [])
      .filter(function (l) { return l && l.status !== 'gone' && l.sourceUrl; })
      .filter(function (l) {
        var last = T(l.lastCheckedAt) || T(l.lastSeenAt) || 0;
        return (now - last) >= minMs;
      })
      .sort(function (a, b) {
        return (T(a.lastCheckedAt) || T(a.lastSeenAt) || 0) - (T(b.lastCheckedAt) || T(b.lastSeenAt) || 0);
      })
      .slice(0, Math.max(0, batch));
  }

  /* ── STATISTICA, CON L'ONESTÀ DEL CAMPIONE ──────────────────────────────
   * Sotto minSample non si pubblica un numero: una mediana su 3 annunci è
   * un'opinione travestita. Il chiamante mostra "campione insufficiente",
   * mai un numero debole spacciato per solido. */
  function percentile(sorted, q) {
    if (!sorted.length) return null;
    var idx = (sorted.length - 1) * q;
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function eurSqm(l) {
    var p = num(l && l.price), s = num(l && l.sqm);
    return (p != null && s != null && s >= 15 && s <= 500 && p > 0) ? p / s : null;
  }

  function zoneStats(list, opts) {
    var o = opts || {};
    var zone = normalizeZone(o.zone) || o.zone || null;
    var minSample = o.minSample != null ? o.minSample : 5;
    var now = o.nowMs != null ? o.nowMs : Date.now();
    var inZone = (list || []).filter(function (l) { return l && l.zoneSlug && l.zoneSlug === zone; });
    var actives = inZone.filter(function (l) { return l.status === 'active'; });

    var sqmVals = actives.map(eurSqm).filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; });
    var asked = sqmVals.length >= minSample ? {
      ok: true, sample: sqmVals.length,
      medianEurSqm: Math.round(percentile(sqmVals, 0.5) * 10) / 10,
      p25: Math.round(percentile(sqmVals, 0.25) * 10) / 10,
      p75: Math.round(percentile(sqmVals, 0.75) * 10) / 10
    } : { ok: false, reason: 'small_sample', sample: sqmVals.length };

    // Assorbimento: SOLO morti provate (goneAt) nate nel radar (firstSeenAt),
    // finestra 270gg. Le vite passate dei rientri contano anche loro.
    var spans = [];
    inZone.forEach(function (l) {
      var lives = (l.pastLives || []).concat(l.status === 'gone' ? [{ firstSeenAt: l.firstSeenAt, goneAt: l.goneAt }] : []);
      lives.forEach(function (v) {
        var a = T(v.firstSeenAt), b = T(v.goneAt);
        if (a && b && b > a && (now - b) < 270 * 86400e3) spans.push((b - a) / 86400e3);
      });
    });
    spans.sort(function (a, b) { return a - b; });
    var absorption = spans.length >= minSample ? {
      ok: true, sample: spans.length, medianDays: Math.round(percentile(spans, 0.5))
    } : { ok: false, reason: 'small_sample', sample: spans.length };

    var drops30 = inZone.filter(function (l) {
      var d = T(l.priceDropAt); return d && (now - d) < 30 * 86400e3;
    }).length;

    return {
      zone: zone, activeCount: actives.length, asked: asked,
      absorption: absorption, priceDrops30d: drops30
    };
  }

  /* Dove sta il TUO prezzo nella zona: percentile del €/mq fra gli attivi. */
  function pricePosition(subject, list, opts) {
    var o = opts || {};
    var minSample = o.minSample != null ? o.minSample : 5;
    var mine = eurSqm(subject);
    if (mine == null) return { ok: false, reason: 'no_price_or_sqm' };
    var zone = normalizeZone(subject.zone) || subject.zoneSlug || null;
    var vals = (list || [])
      .filter(function (l) { return l && l.status === 'active' && l.zoneSlug === zone; })
      .map(eurSqm).filter(function (v) { return v != null; });
    if (vals.length < minSample) return { ok: false, reason: 'small_sample', sample: vals.length };
    var below = vals.filter(function (v) { return v < mine; }).length;
    return {
      ok: true, sample: vals.length, eurSqm: Math.round(mine * 10) / 10,
      percentile: Math.round((below / vals.length) * 100)
    };
  }

  /* I comparabili: stessa zona, vivi, taglia simile. Con poco campione si
   * restituisce quel che c'è e lo si DICE (lowSample), non si allarga la
   * zona di nascosto — un comp di un altro quartiere è una bugia utile solo
   * a chi vende report. */
  function compsFor(subject, list, opts) {
    var o = opts || {};
    var max = o.max != null ? o.max : 5;
    var now = o.nowMs != null ? o.nowMs : Date.now();
    var zone = normalizeZone(subject.zone) || subject.zoneSlug || null;
    var sqm = num(subject.sqm), rooms = num(subject.rooms != null ? subject.rooms : subject.bedrooms);

    var pool = (list || []).filter(function (l) {
      if (!l || l.status !== 'active' || l.zoneSlug !== zone) return false;
      if (subject.sourceUrl && l.sourceUrl === subject.sourceUrl) return false;
      if (sqm != null && l.sqm != null && Math.abs(l.sqm - sqm) / sqm > 0.25) return false;
      if (rooms != null && l.rooms != null && Math.abs(l.rooms - rooms) > 1) return false;
      return true;
    });

    var scored = pool.map(function (l) {
      var s = 0;
      if (sqm != null && l.sqm != null) s += 1 - Math.abs(l.sqm - sqm) / sqm;      // 0..1
      var seen = T(l.lastSeenAt) || 0;
      s += Math.max(0, 1 - (now - seen) / (90 * 86400e3)) * 0.5;                   // recency 0..0.5
      return { l: l, s: s };
    }).sort(function (a, b) { return b.s - a.s; });

    return {
      comps: scored.slice(0, max).map(function (x) {
        return {
          sourceUrl: x.l.sourceUrl, title: x.l.title, price: x.l.price,
          sqm: x.l.sqm, rooms: x.l.rooms, eurSqm: eurSqm(x.l) != null ? Math.round(eurSqm(x.l) * 10) / 10 : null,
          lastSeenAt: x.l.lastSeenAt, advertiser: x.l.advertiser
        };
      }),
      lowSample: scored.length < 3
    };
  }

  /* La posizione prezzo letta dal SOLO doc marketStats/<zona> — la comps
   * card nel portal legge un documento, mai il registro intero. Dai tre
   * quantili non esce un percentile esatto: esce una FASCIA, ed è giusto
   * così — mostrare "78°" calcolato da tre numeri sarebbe finta precisione.
   * bands: sotto p25 · p25–mediana · mediana–p75 · sopra p75. */
  function pricePositionFromStats(subject, stats) {
    var mine = eurSqm(subject);
    if (mine == null) return { ok: false, reason: 'no_price_or_sqm' };
    var a = stats && stats.asked;
    if (!a || !a.ok) return { ok: false, reason: (a && a.reason) || 'no_stats', sample: a ? a.sample : 0 };
    var band, label;
    if (mine < a.p25) { band = 'sotto-p25'; label = 'sotto il 25° percentile di zona'; }
    else if (mine <= a.medianEurSqm) { band = 'p25-mediana'; label = 'tra il 25° e la mediana di zona'; }
    else if (mine <= a.p75) { band = 'mediana-p75'; label = 'tra la mediana e il 75° di zona'; }
    else { band = 'sopra-p75'; label = 'sopra il 75° percentile di zona'; }
    return {
      ok: true, eurSqm: Math.round(mine * 10) / 10, band: band, label: label,
      zone: { p25: a.p25, median: a.medianEurSqm, p75: a.p75, sample: a.sample },
      vsMedianPct: Math.round(((mine / a.medianEurSqm) - 1) * 100)
    };
  }

  var API = {
    normalizeZone: normalizeZone, observe: observe,
    pricePositionFromStats: pricePositionFromStats,
    deathVerdict: deathVerdict, applyCheck: applyCheck, checkQueue: checkQueue,
    zoneStats: zoneStats, pricePosition: pricePosition, compsFor: compsFor,
    percentile: percentile, eurSqm: eurSqm,
    PRICE_HISTORY_CAP: PRICE_HISTORY_CAP
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_MARKET = API;
})(typeof window !== 'undefined' ? window : this);
