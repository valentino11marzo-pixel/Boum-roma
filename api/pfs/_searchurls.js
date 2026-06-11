// api/pfs/_searchurls.js
// Auto-generates portal search URLs from a pfsClients doc — these become
// the system's own "alerts": radarSearches docs that scan-market.js scans
// on a schedule, with zero dependency on saved searches created inside
// Immobiliare/Idealista accounts.
//
// The generated URL is a sane DEFAULT (price ceiling, recency sort).
// Portal filter params change without notice and zone slugs are not
// guessable for every quartiere, so each radarSearches doc supports a
// `urlOverride` field: open the generated URL in a browser, refine the
// filters there (zona esatta, "da privati", camere), paste the final URL
// in the command center → the cron uses the override from then on.
// Zone + bedrooms are enforced at scoring time by _match.js regardless,
// so an over-broad search URL costs fetches, never wrong pushes.

import { clientBudgetRange } from '../homie/_match.js';

// Well-known Idealista zone slugs for Rome (extend as clients need them).
const IDEALISTA_ZONES = {
  'centro storico': 'zona-centro-storico',
  'centro': 'zona-centro-storico',
  'trastevere': 'zona-trastevere',
  'testaccio': 'zona-testaccio',
  'monti': 'zona-monti',
  'prati': 'zona-prati',
  'parioli': 'zona-parioli',
  'flaminio': 'zona-flaminio',
  'salario': 'zona-salario',
  'trieste': 'zona-trieste',
  'nomentano': 'zona-nomentano',
  'san lorenzo': 'zona-san-lorenzo',
  'pigneto': 'zona-pigneto',
  'san giovanni': 'zona-san-giovanni',
  'appio latino': 'zona-appio-latino',
  'ostiense': 'zona-ostiense',
  'garbatella': 'zona-garbatella',
  'monteverde': 'zona-monteverde',
  'aurelio': 'zona-aurelio',
  'balduina': 'zona-balduina',
  'eur': 'zona-eur',
  'monte sacro': 'zona-monte-sacro',
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

  // Immobiliare — query params, newest first
  {
    const p = new URLSearchParams({ criterio: 'dataModifica', ordine: 'desc' });
    if (max) p.set('prezzoMassimo', String(max));
    if (min) p.set('prezzoMinimo', String(min));
    out.push({
      portal: 'immobiliare',
      url: `https://www.immobiliare.it/affitto-case/roma/?${p.toString()}`,
      label: `Immobiliare · Roma${zone ? ' · ' + zone : ''}${max ? ' · ≤€' + max : ''}`,
    });
  }

  // Idealista — path segments; known zone slug if we have one
  {
    const zoneSlug = zone && IDEALISTA_ZONES[zone] ? IDEALISTA_ZONES[zone] + '/' : '';
    const segs = [];
    if (max) segs.push(`con-prezzo_${max}`);
    const segPath = segs.length ? segs.join(',') + '/' : '';
    out.push({
      portal: 'idealista',
      url: `https://www.idealista.it/affitto-case/roma-roma/${zoneSlug}${segPath}?ordine=pubblicazione-desc`,
      label: `Idealista · Roma${zone ? ' · ' + zone : ''}${max ? ' · ≤€' + max : ''}`,
    });
  }

  return out;
}
