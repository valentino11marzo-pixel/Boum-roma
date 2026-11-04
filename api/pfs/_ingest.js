// api/pfs/_ingest.js
// THE single ingestion path for scraped/alerted rental listings.
// Every source (Homie webhook, email-alert cron, market-scan cron, manual
// admin add) converges here so dedupe, scoring, agency filtering and the
// swipe-deck push behave identically everywhere.
//
// Flow per property:
//   1. dedupe on sha1(sourceUrl) → pfsProperties/<stableId> (merge/upsert)
//   2. agency policy: advertiser 'agency' is stored (for analytics) but
//      NEVER pushed to client decks — BOOM only proposes private listings
//   3. score against every active pfsClients doc (api/homie/_match.js)
//   4. push score ≥ threshold into client.portalProperties (swipe deck)
//   5. persist a matchSummary on the property doc so the command center
//      can render per-client scores without re-scoring client-side

import crypto from 'node:crypto';
import RADAR from '../../js/radar-engine.js';
import RM from '../../js/radar-markets.js';
import { fsPatch, fsGet, fsList, logActivity } from '../homie/_lib.js';
import { recordObservation } from '../market/_ledger.js';
import { radarTap } from '../radar/_tap.js';
import { scoreMatch, DEFAULT_THRESHOLD } from '../homie/_match.js';
import { tgNotify } from './_health.js';

export const ACTIVE_STAGES = new Set([
  'payment_confirmed', 'searching', 'options', 'viewing', 'closing',
]);

const MARKET_VIAS = new Set(['domain', 'alias', 'text', 'explicit', 'legacy']);

export function stableIdFromUrl(url) {
  return 'h_' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

export function sanitizeImages(imgs) {
  if (!Array.isArray(imgs)) return [];
  return imgs
    .filter(s => typeof s === 'string' && /^https?:\/\//.test(s))
    .slice(0, 20);
}

export async function listActiveClients() {
  const all = await fsList('pfsClients', { limit: 200 });
  return all.filter(c => {
    const stage = c.stage || c.portalStage;
    if (!stage) return c.portalEnabled === true; // legacy clients pre-stage
    return ACTIVE_STAGES.has(stage);
  });
}

// La zona di una città fuori Roma è SEMPRE il nome canonico del suo lessico
// ('Madrid · Chamberí'): un 'Centro' nudo mandato da Homie diventerebbe lo
// slug 'centro', lo stesso della zona romana. Già canonico → resta; altrimenti
// si cerca nel lessico della città; niente → null (mai indovinare).
export function canonicalZone(rawZone, market) {
  if (!rawZone) return null;
  const z = String(rawZone).trim();
  if (!z) return null;
  const zones = RADAR.MARKET_ZONES[market];
  if (zones && Object.prototype.hasOwnProperty.call(zones, z)) return z;
  const hit = RADAR.inferZone(z, market);
  return hit ? hit.zone : null;
}

// raw: { sourceUrl*, source*, price*, title?, address?, zone?, bedrooms?,
//        sqm?, bathrooms?, furnished?, images?, description?, contactEmail?,
//        contactPhone?, scrapedAt?, advertiser? ('private'|'agency'|'unknown'),
//        market? (città dichiarata dal chiamante), aliasMarket? (dall'alias
//        della casella) }
// opts: { threshold?, ingestedBy?, addedBy?, skipFreshHours? }
//
// Returns { ok, propertyId, skippedFresh?, droppedAgency?, pushedTo,
//           skipped, belowThreshold, errors, totalActiveClients }
export async function ingestProperty(raw, opts = {}) {
  const errors = [];
  const sourceUrl = String(raw.sourceUrl || '').trim();
  if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
    return { ok: false, error: 'sourceUrl must be a full http(s) URL' };
  }
  const price = typeof raw.price === 'number' ? raw.price : parseFloat(raw.price);
  if (!isFinite(price) || price <= 0) {
    return { ok: false, error: 'price (number > 0) is required', sourceUrl };
  }

  const stableId = stableIdFromUrl(sourceUrl);
  const now = new Date();
  const ingestedBy = opts.ingestedBy || 'pfs-ingest';
  const advertiser = ['private', 'agency', 'unknown'].includes(raw.advertiser)
    ? raw.advertiser : 'unknown';

  // ── 0. La città (radar per mercato) ──────────────────────
  // Decisa UNA volta, qui, con la prova più forte (js/radar-markets.js). Per
  // ogni fonte che esisteva prima (immobiliare, idealista.it, casafari,
  // subito, whatsapp, manual) il risultato è Roma: niente cambia.
  const mres = RM.resolveListingMarket({
    sourceUrl, source: raw.source, explicit: raw.market, aliasMarket: raw.aliasMarket,
    text: raw.title || raw.address,
  });
  const market = mres.market || null;
  // Chi ha già deciso la città con una prova (scan-inbox: l'alias, il testo)
  // la passa come esplicita insieme alla prova: si registra la prova vera.
  const marketVia = mres.via === 'explicit' && MARKET_VIAS.has(raw.marketVia) ? raw.marketVia : (mres.via || null);

  // ── Freshness short-circuit ───────────────────────────────
  // Crons re-scan a sliding window; if we ingested this listing recently,
  // just bump lastSeenAt instead of re-scoring all clients on every run.
  const skipFreshHours = Number.isFinite(opts.skipFreshHours) ? opts.skipFreshHours : 0;
  if (skipFreshHours > 0) {
    try {
      const existing = await fsGet('pfsProperties/' + stableId);
      const seen = existing && (existing.lastSeenAt || existing.scrapedAt);
      // Un annuncio visto la prima volta SENZA città che ora ce l'ha (o un doc
      // di prima dei mercati che risulta di un'altra città) non è un
      // ri-avvistamento: è la sua prima consegna, e va fatta per intero.
      const firstMarket = !!market && (existing && (existing.marketUnknown === true ||
        (existing.market == null && market !== 'roma')));
      if (seen && !firstMarket && (now - new Date(seen)) < skipFreshHours * 3600 * 1000) {
        // Un prezzo cambiato dentro la finestra di freschezza non è "niente
        // di nuovo": si aggiorna il doc (prima restava stantio) e, se è un
        // RIBASSO, il radar lo tratta come notizia (fiuto + vedette).
        const priceChanged = existing.price != null && price !== existing.price;
        await fsPatch('pfsProperties/' + stableId, {
          lastSeenAt: now, ...(priceChanged ? { price } : {}),
          ...(market && existing.market == null ? { market } : {}),
        });
        // Anche il corto-circuito è un RI-AVVISTAMENTO: per il libro mastro
        // di mercato vale (l'annuncio è vivo → la verifica di morte slitta).
        // Fuori Roma la zona passa solo canonica (mai un 'Centro' nudo).
        const obsZone = market && market !== 'roma' ? (canonicalZone(raw.zone, market) || existing.zone || null) : raw.zone;
        if (market) {
          try { await recordObservation(stableId, { sourceUrl, source: raw.source, price: raw.price, zone: obsZone, market }); } catch { /* mai bloccante */ }
        }
        if (market && priceChanged && price < existing.price) {
          try { await radarTap(stableId, { ...existing, market: existing.market || market, price, sourceUrl }, { priceJustDropped: true }); } catch { /* mai bloccante */ }
        }
        return { ok: true, propertyId: stableId, skippedFresh: true, pushedTo: [], skipped: [], belowThreshold: [], errors: [] };
      }
      if (seen && firstMarket) {
        // Si spegne il "città sconosciuta" PRIMA del giro pieno (che scrive
        // solo i suoi campi): altrimenti al prossimo avvistamento questo doc
        // risulterebbe ancora "prima consegna" e si ripunteggerebbe sempre.
        try { await fsPatch('pfsProperties/' + stableId, { market, marketVia, marketUnknown: false, marketReason: null }); } catch { /* il giro pieno resta valido */ }
      }
    } catch { /* fall through to full ingest */ }
  }

  // ── 1. Master record ──────────────────────────────────────
  // La zona: dichiarata dalla fonte, oppure DEDOTTA dal titolo/indirizzo
  // dell'annuncio stesso (radar-engine.inferZone — parole intere, ambiguo →
  // null, mai un indovinello). Era il difetto che affamava le statistiche:
  // la fonte portante (scan-inbox) non passa nessuna zona.
  // Roma: la regola di sempre, identica. Fuori Roma: solo il lessico di
  // QUELLA città, e la zona solo nella forma canonica ('Madrid · Centro').
  // Città sconosciuta: nessuna zona (quale lessico? nessuno).
  const cityMarket = !!market && market !== 'roma';
  const text = String(raw.title || '') + ' ' + String(raw.address || '');
  let zone = null, zoneInferred = false;
  if (market === 'roma') {
    const inferredZone = !raw.zone && (raw.title || raw.address) ? RADAR.inferZone(text) : null;
    zone = raw.zone || (inferredZone ? inferredZone.zone : null);
    zoneInferred = !raw.zone && !!inferredZone;
  } else if (cityMarket) {
    const fromRaw = canonicalZone(raw.zone, market);
    const inferredZone = !fromRaw && (raw.title || raw.address) ? RADAR.inferZone(text, market) : null;
    zone = fromRaw || (inferredZone ? inferredZone.zone : null);
    zoneInferred = !fromRaw && !!inferredZone;
  }
  const property = {
    sourceUrl,
    source: String(raw.source || 'manual').toLowerCase(),
    title: raw.title || null,
    address: raw.address || null,
    zone,
    zoneInferred,
    price,
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : (parseInt(raw.bedrooms, 10) || null),
    sqm: typeof raw.sqm === 'number' ? raw.sqm : (parseInt(raw.sqm, 10) || null),
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : (parseInt(raw.bathrooms, 10) || null),
    furnished: typeof raw.furnished === 'boolean' ? raw.furnished : null,
    images: sanitizeImages(raw.images),
    description: raw.description || null,
    contactEmail: raw.contactEmail || null,
    contactPhone: raw.contactPhone || null,
    advertiser,
    scrapedAt: raw.scrapedAt || now.toISOString(),
    lastSeenAt: now,
    ingestedBy,
    market,
    marketVia,
  };
  if (cityMarket && raw.zone) property.zoneRaw = String(raw.zone).slice(0, 80);
  if (!market) {
    property.marketUnknown = true;
    property.marketReason = mres.reason || 'market_unknown';
  }

  try { await fsPatch('pfsProperties/' + stableId, property); }
  catch (err) {
    console.error('[pfs/_ingest] master write failed:', err.message);
    // Continue — we can still push to clients even if the master write hiccupped
  }

  // Città sconosciuta → si archivia e basta: niente libro mastro (le
  // statistiche di una città non si sporcano con un annuncio forse di
  // un'altra), niente radar, niente mazzi. Lo dice chi chiama (needsAttention).
  if (!market) {
    return { ok: true, propertyId: stableId, marketUnknown: true, marketReason: property.marketReason, pushedTo: [], skipped: [], belowThreshold: [], errors: [], totalActiveClients: 0 };
  }

  // IL PERITO: ogni annuncio visto da QUALSIASI porta alimenta anche il
  // libro mastro di mercato (marketListings) — solo fatti, mai contatti
  // (il motore li scarta per costruzione). Best-effort: il radar di mercato
  // non deve mai rompere l'ingestione PFS, che serve clienti paganti.
  try { await recordObservation(stableId, property); } catch { /* mai bloccante */ }

  // IL RADAR 2.0 (identità cross-portale, fiuto, vedette) — DOPO il libro
  // mastro, best-effort come lui. radar.clusterIds serve al passo 3: la
  // stessa casa vista da due portali non entra due volte nel mazzo.
  // Gira anche sugli annunci di agenzia: il cluster deve sapere che la
  // stessa casa è pubblicata da privato E da agenzia.
  let radar = null;
  try { radar = await radarTap(stableId, property); } catch { /* mai bloccante */ }

  // ── 2. Agency policy ──────────────────────────────────────
  // Roma: 'drop' (BOOM propone solo privati). Madrid/Barcellona: 'flag' — il
  // Full Search pubblicato promette anche le agenzie; passano, segnalate.
  if (advertiser === 'agency' && RM.agencyPolicy(market) === 'drop') {
    await logActivity('pfs_property_agency_dropped', 'pfs_radar',
      { sourceUrl, price, propertyId: stableId }, ingestedBy);
    return { ok: true, propertyId: stableId, droppedAgency: true, pushedTo: [], skipped: [], belowThreshold: [], errors: [] };
  }

  // ── 3. Score + push ───────────────────────────────────────
  let clients = [];
  try { clients = await listActiveClients(); }
  catch (err) {
    return { ok: false, error: 'client_list_failed', detail: err.message, propertyId: stableId };
  }
  // Solo i clienti della STESSA città, prima di punteggiare (scoreMatch lo
  // ricontrolla: due guardie, non una).
  clients = clients.filter(c => RM.clientMarket(c) === market);

  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
  const pushedTo = [];
  const skippedExisting = [];
  const belowThreshold = [];

  for (const client of clients) {
    const { score, reasons, reject } = scoreMatch(property, client);
    if (reject || score < threshold) {
      belowThreshold.push({ clientId: client.id, name: client.name || null, score, reasons });
      continue;
    }

    const existing = Array.isArray(client.portalProperties) ? client.portalProperties : [];
    // De-dup di cluster: se il cliente ha già in mazzo un GEMELLO di questa
    // casa (stesso immobile su un altro portale), non la riceve due volte —
    // due card per la stessa casa fanno sembrare il servizio un aggregatore.
    const clusterMates = radar && Array.isArray(radar.clusterIds) && radar.clusterIds.length > 1
      ? radar.clusterIds : null;
    if (existing.some(p => p && (p.id === stableId || (clusterMates && clusterMates.includes(p.id))))) {
      skippedExisting.push({ clientId: client.id, name: client.name || null, score });
      continue;
    }

    // Shape expected by client-portal.html mapClient()
    const entry = {
      id: stableId,
      address: property.address || property.title || sourceUrl,
      price: Math.round(property.price),
      rooms: property.bedrooms,
      sqm: property.sqm,
      zone: property.zone,
      match: score,
      images: property.images || [],
      description: property.description || '',
      sourceUrl: property.sourceUrl,
      source: property.source,
      isNew: true,
      addedAt: now.toISOString(),
      addedBy: opts.addedBy || 'homie',
      matchReasons: reasons,
      market,
      advertiser,
    };

    const existingActivity = Array.isArray(client.portalActivity) ? client.portalActivity : [];
    const newActivity = existingActivity.concat([{
      type: 'homie_match',
      propertyId: stableId,
      score,
      timestamp: now.toISOString(),
    }]);

    try {
      await fsPatch('pfsClients/' + client.id, {
        portalProperties: existing.concat([entry]),
        portalActivity: newActivity,
      });
      pushedTo.push({ clientId: client.id, name: client.name || null, score, reasons });
    } catch (err) {
      console.error('[pfs/_ingest] push to ' + client.id + ' failed:', err.message);
      errors.push({ clientId: client.id, error: err.message });
    }
  }

  // ── 4. Match summary on the property doc (command center) ─
  try {
    await fsPatch('pfsProperties/' + stableId, {
      matchSummary: {
        at: now.toISOString(),
        threshold,
        pushedTo: pushedTo.map(p => ({ clientId: p.clientId, name: p.name, score: p.score })),
        alreadyHad: skippedExisting.map(p => ({ clientId: p.clientId, name: p.name, score: p.score })),
        belowThreshold: belowThreshold.slice(0, 20).map(p => ({ clientId: p.clientId, name: p.name, score: p.score, reasons: p.reasons })),
      },
    });
  } catch (err) {
    console.warn('[pfs/_ingest] matchSummary write failed:', err.message);
  }

  // ── 5. "Qualcosa di pronto" → Telegram ───────────────────
  // Fires only when at least one client actually received the property —
  // a ready-to-act match, not noise. Env-optional, never blocks ingest.
  if (pushedTo.length && process.env.TELEGRAM_BOT_TOKEN) {
    const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const what = esc(property.title || property.address || 'Annuncio');
    const specs = [
      '€' + Math.round(price) + '/mese',
      property.bedrooms != null ? property.bedrooms + ' cam' : null,
      property.sqm ? property.sqm + ' m²' : null,
    ].filter(Boolean).join(' · ');
    const who = pushedTo.map(p => `${esc(p.name || p.clientId)} (${p.score})`).join(', ');
    const flag = advertiser === 'unknown' ? '\n⚠️ Inserzionista da verificare'
      : (advertiser === 'agency' ? '\n🏢 agencia — verificar honorarios' : '');
    const fiutoLine = radar && radar.fiuto && radar.fiuto.verdict === 'occasione'
      ? `\n💎 Occasione ${radar.fiuto.score}/100 (${radar.fiuto.eurSqm} €/mq, ${radar.fiuto.vsMedianPct}% vs mediana di zona)` : '';
    const city = market !== 'roma' ? `${RM.marketFlag(market)} ${esc(RM.marketLabel(market, 'it'))} · ` : '';
    await tgNotify(
      `🏠 ${city}<b>Match pronto!</b>\n${what}\n${specs}${fiutoLine}\n→ <b>${who}</b>${flag}\n\n` +
      `<a href="${esc(sourceUrl)}">Apri annuncio</a> · ` +
      `<a href="https://boomrome.com/pfs-command">Command Center</a>`
    );
  }

  await logActivity('pfs_property_ingested', 'pfs_radar', {
    sourceUrl,
    price,
    propertyId: stableId,
    source: property.source,
    advertiser,
    market,
    pushedCount: pushedTo.length,
    skippedCount: skippedExisting.length,
    belowThresholdCount: belowThreshold.length,
    totalActive: clients.length,
  }, ingestedBy);

  return {
    ok: true,
    propertyId: stableId,
    pushedTo,
    skipped: skippedExisting,
    belowThreshold,
    errors,
    totalActiveClients: clients.length,
  };
}
