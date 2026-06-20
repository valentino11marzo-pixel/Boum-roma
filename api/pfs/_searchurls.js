// api/pfs/_searchurls.js
// Auto-generates portal search URLs from a pfsClients doc — these become
// the system's own "alerts": radarSearches docs that scan-market.js scans
// on a schedule, with zero dependency on saved searches created inside
// Immobiliare/Idealista accounts.
//
// URL grammar VERIFIED against live indexed URLs (June 2026):
//   Immobiliare:  /affitto-case/roma/[<zona>/]da-privati/?prezzoMassimo=N
//                 e.g. immobiliare.it/affitto-case/roma/prati/da-privati/
//                 → "da-privati" is a real path filter (only private ads)
//   Idealista:    /affitto-case/<scope>/con-prezzo_N,prezzo-min_M/?ordine=da-privati-asc
//                 e.g. idealista.it/affitto-case/roma-roma/con-prezzo_500/
//                 → "con-…" segments comma-join; da-privati-asc sorts
//                   private advertisers first (no hard filter exists)
//
// Design rule: NEVER emit a guessed slug. Zones outside the verified maps
// fall back to the city-wide page (always loads); zone precision is
// enforced at scoring time by _match.js anyway, and every radarSearches
// doc supports `urlOverride` — open the URL, refine filters on the
// portal, paste the final URL in the command center.
// Room-count segments exist on both portals but are deliberately not
// emitted (locali≠bedrooms mapping over-filters); scoring handles beds.

import { clientBudgetRange } from '../homie/_match.js';

// Verified Immobiliare zone slugs (path: /affitto-case/roma/<slug>/)
const IMMOBILIARE_ZONES = {
  'monti': 'monti',
  'prati': 'prati',
  'trastevere': 'testaccio-trastevere',
  'testaccio': 'testaccio-trastevere',
};

// Verified Idealista zone paths (replace the roma-roma scope)
const IDEALISTA_ZONES = {
  'centro': 'roma/centro',
  'centro storico': 'roma/centro',
  'trastevere': 'roma/trastevere-testaccio/trastevere',
  'testaccio': 'roma/trastevere-testaccio',
  'prati': 'roma/prati-mazzini/prati',
};

function firstZone(client) {
  const raw = client.preferred_areas || client.zone || '';
  const first = String(raw).split(/[,;/&]/)[0].trim().toLowerCase();
  return first || null;
}

// → [{ portal, url, label }]
export function buildSearchUrls(client) {
  const range = clientBudgetRange(client) || {};
  const max = isFinite(range.max) && range.max !== Infinity ? Math.round(range.max) : null;
  const min = range.min > 0 ? Math.round(range.min) : null;
  const zone = firstZone(client);
  const out = [];

  // ── Immobiliare — /da-privati/ path filter + price query params ──
  {
    const zoneSlug = zone && IMMOBILIARE_ZONES[zone] ? IMMOBILIARE_ZONES[zone] + '/' : '';
    const p = new URLSearchParams({ criterio: 'dataModifica', ordine: 'desc' });
    if (max) p.set('prezzoMassimo', String(max));
    if (min) p.set('prezzoMinimo', String(min));
    out.push({
      portal: 'immobiliare',
      url: `https://www.immobiliare.it/affitto-case/roma/${zoneSlug}da-privati/?${p.toString()}`,
      label: `Immobiliare · Roma${zoneSlug ? ' · ' + zone : ''} · privati${max ? ' · ≤€' + max : ''}`,
    });
  }

  // ── Idealista — con-… segments + private-first ordering ──
  {
    const scope = (zone && IDEALISTA_ZONES[zone]) || 'roma-roma';
    const segs = [];
    if (max) segs.push(`prezzo_${max}`);
    if (min) segs.push(`prezzo-min_${min}`);
    const segPath = segs.length ? `con-${segs.join(',')}/` : '';
    out.push({
      portal: 'idealista',
      url: `https://www.idealista.it/affitto-case/${scope}/${segPath}?ordine=da-privati-asc`,
      label: `Idealista · Roma${scope !== 'roma-roma' ? ' · ' + zone : ''} · privati prima${max ? ' · ≤€' + max : ''}`,
    });
  }

  return out;
}
