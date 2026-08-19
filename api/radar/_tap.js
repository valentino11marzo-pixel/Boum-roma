// api/radar/_tap.js — IL RADAR 2.0 dentro l'ingestione, best-effort.
//
// Viene chiamato da api/pfs/_ingest.js SUBITO DOPO la scrittura master e il
// tap del Perito, e come loro non può MAI rompere l'ingestione: qualunque
// errore qui dentro torna null e il servizio pagato prosegue identico.
//
// Cosa fa, in ordine:
//   1. IDENTITÀ  — cerca i gemelli dell'annuncio nell'indice dei recenti
//      (radarState/index, UN documento compatto: 1 lettura + 1 scrittura,
//      mai una scansione della collection). La stessa casa su Immobiliare e
//      Idealista diventa UN cluster; i memberIds tornano a _ingest che li
//      usa per NON spingere due volte la stessa casa nel mazzo del cliente.
//   2. FIUTO     — punteggio occasione contro marketStats/<zona> (il Perito)
//      + la storia del libro mastro (ribassi, rientri). Scritto sul doc
//      pfsProperties in `radar` così command center e console lo leggono
//      senza ricalcolare.
//   3. OCCASIONI — verdetto 'occasione' → entra nel feed radarState/occasioni
//      (cap 60) + card Telegram all'operatore. Solo alla PRIMA vista o su un
//      ribasso appena registrato: un ri-avvistamento non è una notizia.
//   4. VEDETTE   — le ricerche libere (radarWatchers): canale Telegram
//      istantaneo, canale email in coda sul doc (il digest le spedisce).
//
// L'indice è una CACHE della verità (i doc pfsProperties), non la verità:
// una voce persa per un write concorrente degrada (un gemello mancato),
// non rompe. La copia in memoria del modulo fa sì che, dentro lo stesso
// giro di cron, gli annunci ingeriti in sequenza si vedano tra loro.

import RADAR from '../../js/radar-engine.js';
import { fsGet, fsPatch, fsList } from '../homie/_lib.js';
import { tgNotify } from '../pfs/_health.js';

const OCCASIONI_CAP = 60;
const WATCHERS_TTL_MS = 120e3;
const STATS_TTL_MS = 600e3;

// Cache di modulo (vivono quanto l'istanza lambda = tutto un giro di cron).
let _index = null;                 // { entries: [...] } — autorevole durante il run
let _watchers = { list: null, at: 0 };
const _stats = new Map();          // zoneSlug → { doc, at }

export function _resetTapCaches() { // per i test
  _index = null; _watchers = { list: null, at: 0 }; _stats.clear();
}

const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function loadIndex() {
  if (_index) return _index;
  const doc = await fsGet('radarState/index').catch(() => null);
  _index = { entries: Array.isArray(doc && doc.entries) ? doc.entries : [] };
  return _index;
}

async function loadWatchers() {
  const now = Date.now();
  if (_watchers.list && (now - _watchers.at) < WATCHERS_TTL_MS) return _watchers.list;
  const all = await fsList('radarWatchers', { limit: 100 }).catch(() => []);
  _watchers = { list: all.filter(w => w && w.enabled !== false), at: now };
  return _watchers.list;
}

async function loadStats(zoneSlug) {
  if (!zoneSlug) return null;
  const now = Date.now();
  const hit = _stats.get(zoneSlug);
  if (hit && (now - hit.at) < STATS_TTL_MS) return hit.doc;
  const doc = await fsGet('marketStats/' + zoneSlug).catch(() => null);
  _stats.set(zoneSlug, { doc, at: now });
  return doc;
}

function fmtEur(n) { return '€' + Math.round(n); }

function listingLine(p) {
  return [
    fmtEur(p.price) + '/mese',
    p.sqm ? p.sqm + ' m²' : null,
    (p.bedrooms != null ? p.bedrooms + ' cam' : null),
    p.zone || null,
  ].filter(Boolean).join(' · ');
}

// opts: { priceJustDropped?: boolean } — il ramo skipFresh di _ingest lo
// passa quando ha visto il prezzo cambiare su un ri-avvistamento.
export async function radarTap(stableId, property, opts = {}) {
  try {
    const now = new Date();
    const zoneName = property.zone || null;
    const zoneSlug = RADAR.normalizeZone(zoneName);

    // ── 1. Identità ─────────────────────────────────────────────
    const index = await loadIndex();
    const prevEntry = index.entries.find(e => e && e.id === stableId) || null;
    const wasKnown = !!prevEntry;

    const subject = {
      id: stableId,
      source: property.source, zone: zoneName, zoneSlug,
      price: property.price, sqm: property.sqm,
      bedrooms: property.bedrooms, title: property.title, address: property.address,
    };
    const twin = RADAR.findTwin(subject, index.entries);
    // Il cluster id è il capostipite. Se ero GIÀ in un cluster resto lì; se
    // un gemello compare adesso, adotto il suo (che risale al capostipite);
    // altrimenti sono capostipite di me stesso.
    const prevCluster = prevEntry && prevEntry.clusterId && prevEntry.clusterId !== stableId
      ? prevEntry.clusterId : null;
    const clusterId = prevCluster || (twin && twin.clusterId) || stableId;

    const entry = RADAR.indexEntry(stableId, {
      ...property,
      firstSeenAt: (prevEntry && prevEntry.t) || property.scrapedAt || now.toISOString(),
    }, clusterId);
    index.entries = RADAR.indexUpsert(index.entries, entry);
    await fsPatch('radarState/index', { entries: index.entries, updatedAt: now }).catch(() => {});

    const members = index.entries.filter(e => e && (e.clusterId || e.id) === clusterId);
    const cluster = RADAR.clusterInfo(members.map(m => ({
      id: m.id, source: m.source, advertiser: m.advertiser, price: m.price, firstSeenAt: m.t,
    })));

    // ── 2. Fiuto ────────────────────────────────────────────────
    const ledger = await fsGet('marketListings/' + stableId).catch(() => null);
    const stats = await loadStats(zoneSlug);
    const fiuto = RADAR.fiuto(
      { ...property, firstSeenAt: (ledger && ledger.firstSeenAt) || entry.t },
      { stats, ledger, cluster }
    );

    await fsPatch('pfsProperties/' + stableId, {
      radar: {
        clusterId,
        clusterSize: cluster.size,
        sources: cluster.sources,
        multiPortal: cluster.multiPortal,
        privateAndAgency: cluster.privateAndAgency,
        repost: cluster.repost,
        twinWhy: twin ? twin.why.slice(0, 4) : null,
        fiuto: { score: fiuto.score, verdict: fiuto.verdict, eurSqm: fiuto.eurSqm, vsMedianPct: fiuto.vsMedianPct, reasons: fiuto.reasons.slice(0, 4) },
        at: now.toISOString(),
      },
    }).catch(() => {});

    // Un ri-avvistamento non è una notizia: si alza la voce solo alla prima
    // vista, o quando è appena stato registrato un ribasso.
    const drop = opts.priceJustDropped === true;
    const alertable = !wasKnown || drop;
    const mates = cluster.memberIds.filter(id => id !== stableId);

    // ── 3. Occasioni ────────────────────────────────────────────
    if (fiuto.verdict === 'occasione' && alertable) {
      try {
        const occDoc = await fsGet('radarState/occasioni').catch(() => null);
        const prevItems = Array.isArray(occDoc && occDoc.items) ? occDoc.items : [];
        // La stessa CASA una volta sola: se un GEMELLO (stesso cluster) è già
        // nel feed, l'avvistamento da un altro portale non è una seconda
        // occasione — è la stessa, già segnalata.
        const clusterAlready = prevItems.some(i => i && i.id !== stableId &&
          (i.clusterId === clusterId || mates.indexOf(i.id) >= 0));
        if (!clusterAlready) {
          const items = prevItems.filter(i => i && i.id !== stableId);
          const already = prevItems.some(i => i && i.id === stableId);
          items.push({
            id: stableId,
            at: now.toISOString(),
            title: (property.title || property.address || 'Annuncio').slice(0, 120),
            zone: zoneName, price: property.price, sqm: property.sqm,
            rooms: property.bedrooms, url: property.sourceUrl, source: property.source,
            advertiser: property.advertiser || 'unknown',
            score: fiuto.score, eurSqm: fiuto.eurSqm, vsMedianPct: fiuto.vsMedianPct,
            reasons: fiuto.reasons.slice(0, 3),
            clusterId, multiPortal: cluster.multiPortal,
          });
          await fsPatch('radarState/occasioni', { items: items.slice(-OCCASIONI_CAP), updatedAt: now });

          if ((!already || drop) && process.env.TELEGRAM_BOT_TOKEN) {
            const clusterLine = cluster.multiPortal ? `\n🔁 Su ${cluster.sources.length} portali (${esc(cluster.sources.join(', '))})` : '';
            const paLine = cluster.privateAndAgency ? '\n👥 Pubblicata sia da privato che da agenzia' : '';
            await tgNotify(
              `💎 <b>OCCASIONE — ${esc(zoneName || 'zona n/d')}</b> · ${fiuto.score}/100${drop ? ' · ⬇️ ribasso' : ''}\n` +
              `${esc(property.title || property.address || 'Annuncio')}\n` +
              `${esc(listingLine(property))} · ${fiuto.eurSqm} €/mq (${fiuto.vsMedianPct}% vs mediana)\n` +
              `${esc(fiuto.reasons.slice(0, 3).join(' · '))}${clusterLine}${paLine}\n\n` +
              `<a href="${esc(property.sourceUrl)}">Apri annuncio</a> · ` +
              `<a href="https://boomrome.com/radar">La Centrale</a>`
            );
          }
        }
      } catch (e) { console.warn('[radar/_tap] occasioni:', e.message); }
    }

    // ── 4. Vedette ──────────────────────────────────────────────
    // Il de-dup di cluster qui è PER CANALE e per vedetta: se questa casa
    // (o un suo gemello) è già passata da questa vedetta su quel canale,
    // non ripassa — ma il gemello PRIVATO di un annuncio d'agenzia che la
    // vedetta "solo privati" non aveva mai visto passa eccome. Un ribasso
    // appena registrato riapre entrambi i canali (è una notizia nuova).
    if (alertable) {
      try {
        const watchers = await loadWatchers();
        const listingForMatch = { ...property, firstSeenAt: (ledger && ledger.firstSeenAt) || entry.t };
        for (const w of watchers) {
          const m = RADAR.watcherMatch(listingForMatch, w, fiuto);
          if (!m.match) continue;
          const emailSeen = new Set(
            (Array.isArray(w.notifiedIds) ? w.notifiedIds : [])
              .concat((Array.isArray(w.queue) ? w.queue : []).map(e => e && e.id).filter(Boolean))
          );
          const tgSeen = new Set(Array.isArray(w.tgSeenIds) ? w.tgSeenIds : []);
          const wantEmail = !!(w.channel && w.channel.email) &&
            (drop || (!emailSeen.has(stableId) && !mates.some(id => emailSeen.has(id))));
          const wantTg = !!(w.channel && w.channel.telegram) &&
            (drop || (!tgSeen.has(stableId) && !mates.some(id => tgSeen.has(id))));
          if (!wantEmail && !wantTg) continue;

          const patch = { lastMatchAt: now, matchCount: (Number(w.matchCount) || 0) + 1 };
          if (wantEmail) {
            patch.queue = RADAR.queueUpsert(w.queue, RADAR.queueEntry(stableId, property, fiuto));
            w.queue = patch.queue; // la copia in cache resta coerente nel run
          }
          if (wantTg) {
            patch.tgSeenIds = [...tgSeen].concat([stableId]).slice(-200);
            w.tgSeenIds = patch.tgSeenIds;
          }
          w.matchCount = patch.matchCount;
          await fsPatch('radarWatchers/' + w.id, patch).catch(() => {});
          if (wantTg && process.env.TELEGRAM_BOT_TOKEN) {
            await tgNotify(
              `📡 <b>Vedetta «${esc(w.name || w.id)}»</b>${drop ? ' · ⬇️ ribasso' : ''}\n` +
              `${esc(property.title || property.address || 'Annuncio')}\n` +
              `${esc(listingLine(property))}${fiuto.verdict === 'occasione' ? ' · 💎 ' + fiuto.score : ''}\n` +
              `${esc((m.why || []).join(' · '))}\n\n` +
              `<a href="${esc(property.sourceUrl)}">Apri annuncio</a>`
            );
          }
        }
      } catch (e) { console.warn('[radar/_tap] vedette:', e.message); }
    }

    return { clusterId, clusterIds: cluster.memberIds, fiuto, wasKnown };
  } catch (e) {
    console.warn('[radar/_tap]', e.message);
    return null;
  }
}
