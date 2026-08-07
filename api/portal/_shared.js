// api/portal/_shared.js
// Helpers for the PFS client portal endpoints (lookup + action).
// The portal is open to anonymous callers but authorizes via the client's
// `portalAccessCode` — the same admin-token plumbing as Magic-Sign, since
// `pfsClients` is admin-only in firestore.rules (the browser cannot read or
// write it directly anymore). All reads/writes here run under admin creds.

import { fsList } from '../homie/_lib.js';

// Find the single PFS client whose portalAccessCode matches `code` AND whose
// portal is enabled. Returns the full doc (with id) or null. Ambiguous → null.
export async function findClientByCode(code) {
  if (!code || typeof code !== 'string' || code.length < 4) return null;
  const variants = [...new Set([code, code.trim(), code.trim().toUpperCase()])].filter(Boolean);
  for (const v of variants) {
    let hits;
    try {
      hits = await fsList('pfsClients', {
        filter: { field: 'portalAccessCode', op: 'EQUAL', value: v },
        limit: 3,
      });
    } catch (e) {
      console.error('[portal/_shared] fsList failed:', e.message);
      throw e;
    }
    const enabled = (hits || []).filter(c => c.portalEnabled === true);
    if (enabled.length === 1) return enabled[0];
    if (enabled.length > 1) return null; // duplicate codes → refuse (security)
  }
  return null;
}

// Client-facing journey (5 milestones) derived from portalStage or the
// internal PFS pipeline stage.
const JOURNEY = ['searching', 'options', 'viewing', 'closing', 'completed'];
const STAGE_TO_JOURNEY = {
  lead: 'searching', qualified: 'searching', onboarded: 'searching',
  searching: 'options', sent: 'options', viewing: 'viewing',
  negotiating: 'closing', closing: 'closing', placed: 'completed',
};
export function journeyOf(c) {
  const j = (c.portalStage && JOURNEY.includes(c.portalStage))
    ? c.portalStage
    : (STAGE_TO_JOURNEY[c.stage] || 'searching');
  return { stage: j, index: JOURNEY.indexOf(j) + 1, total: JOURNEY.length };
}

// Strip a portalProperties entry down to what the client UI needs. Never
// expose internal scoring internals beyond the human-readable matchReasons.
export function sanitizeProperty(p) {
  if (!p || typeof p !== 'object' || !p.id) return null;
  return {
    id: p.id,
    address: p.address || '',
    price: p.price || 0,
    rooms: p.rooms != null ? p.rooms : null,
    sqm: p.sqm != null ? p.sqm : null,
    match: p.match != null ? p.match : null,
    images: Array.isArray(p.images) ? p.images.slice(0, 12) : [],
    description: p.description || '',
    matchReasons: Array.isArray(p.matchReasons) ? p.matchReasons.slice(0, 8) : [],
    zone: p.zone || '',
    floor: p.floor != null ? p.floor : null,
    furnished: p.furnished != null ? p.furnished : null,
    sourceUrl: p.sourceUrl || '',
    isNew: !!(p.isNew || p.new),
    clientLiked: !!p.clientLiked,
    clientRejected: !!p.clientRejected,
    rejectReason: p.rejectReason || '',
    viewingRequested: !!p.viewingRequested,
    viewingPreference: p.viewingPreference || '',
    addedAt: p.addedAt || null,
  };
}

// Build the full sanitized client payload for the portal UI.
export function mapClientForPortal(c) {
  const props = Array.isArray(c.portalProperties)
    ? c.portalProperties.map(sanitizeProperty).filter(Boolean)
    : [];
  const liked = props.filter(p => p.clientLiked).length;
  const created = c.createdAt ? new Date(c.createdAt) : null;
  const days = created && !isNaN(created) ? Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000)) : 0;
  const matched = props.filter(p => p.match != null);
  const avgMatch = matched.length ? Math.round(matched.reduce((s, p) => s + p.match, 0) / matched.length) : 0;

  return {
    name: c.name || 'Guest',
    journey: journeyOf(c),
    stats: { days, options: props.length, liked, avgMatch },
    criteria: {
      minBudget: c.minBudget || null,
      budget: c.budget || null,
      zone: c.zone || '',
      moveIn: c.moveIn || '',
      bedrooms: c.bedrooms || '',
      mustHaves: c.mustHaves || '',
      dealBreakers: c.dealBreakers || '',
    },
    properties: props,
    activity: Array.isArray(c.portalActivity) ? c.portalActivity.slice(-25).reverse() : [],
    messages: Array.isArray(c.portalMessages) ? c.portalMessages.slice(-50) : [],
    lang: c.portalLang || null,
    agent: { name: 'Valentino', role: 'Property Finder', whatsapp: '393313251961' },
  };
}

export function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://www.boomrome.com', 'https://boomrome.com'];
  if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
