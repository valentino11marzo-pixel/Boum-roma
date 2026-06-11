// api/pfs/scan-market.js
// Cron scanner for the auto-generated PFS searches (radarSearches docs with
// auto: true). For each enabled search: fetch the results page, diff
// against knownListings, fetch new detail pages, classify the advertiser,
// and feed everything through the shared ingestion pipeline (_ingest.js)
// → dedupe → scoring → client swipe decks.
//
// This is the BEST-EFFORT source: both portals 403 datacenter IPs at will.
// Failures are expected, recorded in pfsRadarHealth/market and alerted on
// sustained breakage — the email path (scan-inbox.js) is the guaranteed one.
//
// Auth: cron secret / Homie secret / admin token (see _guard.js).

import { fsList, fsPatch } from '../homie/_lib.js';
import { requireCronOrAdmin } from './_guard.js';
import { ingestProperty } from './_ingest.js';
import { fetchHtml, extractListingUrls, parseListing, detectAdvertiser } from './_fetch.js';
import { reportHealth, reportNeedsAttention } from './_health.js';

const MAX_SEARCHES_PER_RUN = 12;
const MAX_DETAIL_FETCHES = 24;   // global per run, keeps us inside maxDuration
const KNOWN_CAP = 400;           // knownListings entries kept per search

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  let searches = [];
  try {
    const all = await fsList('radarSearches', { limit: 200 });
    searches = all
      .filter(s => s.auto === true && s.enabled !== false && (s.urlOverride || s.searchUrl))
      .sort((a, b) => String(a.lastScanAt || '').localeCompare(String(b.lastScanAt || '')))
      .slice(0, MAX_SEARCHES_PER_RUN);
  } catch (e) {
    await reportHealth('market', { ok: false, error: 'search_list_failed: ' + e.message });
    return res.status(500).json({ ok: false, error: 'search_list_failed', detail: e.message });
  }

  if (!searches.length) {
    await reportHealth('market', { ok: true, stats: { searches: 0, note: 'no_enabled_searches' } });
    return res.status(200).json({ ok: true, searches: 0, note: 'no_enabled_searches — run sync-searches first' });
  }

  const now = new Date();
  let detailBudget = MAX_DETAIL_FETCHES;
  let pagesOk = 0, pagesFailed = 0, ingested = 0, droppedAgency = 0, pushedTotal = 0;
  const results = [];
  const needsAttention = [];

  for (const search of searches) {
    const url = search.urlOverride || search.searchUrl;
    const portal = search.portal || 'immobiliare';
    const html = await fetchHtml(url);
    if (!html) {
      pagesFailed++;
      results.push({ id: search.id, ok: false, error: 'search_page_unreachable' });
      try { await fsPatch('radarSearches/' + search.id, { lastScanAt: now, lastScanOk: false }); } catch {}
      continue;
    }
    pagesOk++;

    const urls = extractListingUrls(html, portal);
    const known = { ...(search.knownListings || {}) };
    let newHere = 0;

    for (const listingUrl of urls) {
      if (known[listingUrl]) continue;
      // Budget exhausted → do NOT mark as known, so the next run picks it up
      if (detailBudget <= 0) continue;
      detailBudget--;

      const detailHtml = await fetchHtml(listingUrl);
      if (!detailHtml) {
        // Detail page unreachable (anti-bot) → leave unknown, retry next run
        results.push({ id: search.id, url: listingUrl, skipped: 'detail_unreachable' });
        continue;
      }
      known[listingUrl] = { firstSeen: Date.now() };

      const listing = parseListing(detailHtml, listingUrl);
      const advertiser = detectAdvertiser(detailHtml, portal);
      if (!listing.price) {
        // Parseable page but no price → surface for manual add, don't retry forever
        needsAttention.push({ sourceUrl: listingUrl, source: portal, reason: 'no_price' });
        results.push({ id: search.id, url: listingUrl, skipped: 'no_price' });
        continue;
      }
      const r = await ingestProperty({
        sourceUrl: listingUrl,
        source: portal,
        price: listing.price,
        title: listing.title,
        zone: search.label || null,
        bedrooms: listing.bedrooms,
        sqm: listing.sqm,
        images: listing.images,
        description: listing.description,
        advertiser,
      }, { ingestedBy: 'pfs-scan-market', skipFreshHours: 12 });
      if (r.ok) {
        ingested++;
        newHere++;
        if (r.droppedAgency) droppedAgency++;
        pushedTotal += (r.pushedTo || []).length;
      }
    }

    // Cap knownListings growth (oldest first eviction)
    const entries = Object.entries(known);
    const capped = entries.length > KNOWN_CAP
      ? Object.fromEntries(entries.sort((a, b) => (a[1].firstSeen || 0) - (b[1].firstSeen || 0)).slice(-KNOWN_CAP))
      : known;

    try {
      await fsPatch('radarSearches/' + search.id, {
        knownListings: capped,
        lastScanAt: now,
        lastScanOk: true,
        lastFound: urls.length,
        lastNew: newHere,
      });
    } catch (e) {
      results.push({ id: search.id, warn: 'state_write_failed: ' + e.message });
    }
    results.push({ id: search.id, ok: true, found: urls.length, new: newHere });
  }

  // Health: the run is "ok" if at least one page was reachable. All pages
  // blocked = the portals are refusing this IP — that's a real outage of
  // this source and should count toward the Telegram alert.
  const ok = pagesOk > 0;
  await reportNeedsAttention('market', needsAttention);
  await reportHealth('market', {
    ok,
    error: ok ? null : `all ${pagesFailed} search pages unreachable (anti-bot?)`,
    stats: { searches: searches.length, pagesOk, pagesFailed, ingested, droppedAgency, pushedTotal },
  });

  return res.status(200).json({
    ok, actor,
    searches: searches.length, pagesOk, pagesFailed,
    ingested, droppedAgency, pushedTotal, results,
  });
}
