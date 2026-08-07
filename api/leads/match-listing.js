// api/leads/match-listing.js — "chi cerca questa casa?"
//
// La risposta alla domanda che nessuno poteva fare. Dato un annuncio, torna
// le persone in archivio che lo stavano cercando — ordinate, col motivo e col
// messaggio già scritto nella loro lingua.
//
// Zero AI: solo l'aritmetica di _reverse.js su dati che ci sono già.
//
// GET  ?listingId=<id>[&limit=8]     → { ok, listing, matches:[…], scanned }
// POST { listingId, notify:[leadIds] } → segna chi hai contattato, così la
//        prossima volta non te lo ripropone (`notifiedListings` sul lead)
//
// Auth: X-Wizard-Secret / X-Homie-Secret (il bot) oppure Bearer admin.

import { fsGet, fsList, fsPatch, readJson, secretEqual } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { rankLeadsForListing, outreachText, waLink, MATCH_THRESHOLD } from './_reverse.js';

const SITE = 'https://www.boomrome.com';

function botSecretOk(req) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  return !!expected && secretEqual(String(supplied || ''), expected);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wizard-Secret, X-Homie-Secret, Authorization');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // il bot passa col segreto condiviso; il portale con un token admin
  if (!botSecretOk(req)) {
    const actor = await requireCronOrAdmin(req, res);
    if (!actor) return;
  }

  const q = req.query || {};
  let body = {};
  if (req.method === 'POST') {
    try { body = (await readJson(req)) || {}; } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  }
  const listingId = String(body.listingId || q.listingId || '').trim();
  if (!listingId) return res.status(400).json({ ok: false, error: 'listingId_required' });

  let listing;
  try { listing = await fsGet(`listings/${listingId}`); }
  catch (e) { return res.status(500).json({ ok: false, error: 'listing_read_failed' }); }
  if (!listing) return res.status(404).json({ ok: false, error: 'listing_not_found' });
  listing = { ...listing, id: listingId };

  // ── POST: segna chi hai contattato ────────────────────────────────────
  // Senza questo la stessa persona verrebbe riproposta ogni volta che tocchi
  // l'annuncio, e la funzione da utile diventa fastidiosa in due giorni.
  if (req.method === 'POST') {
    const ids = Array.isArray(body.notify) ? body.notify.filter(Boolean).slice(0, 50) : [];
    let marked = 0;
    for (const id of ids) {
      try {
        const lead = await fsGet(`leads/${id}`);
        if (!lead) continue;
        const prev = Array.isArray(lead.notifiedListings) ? lead.notifiedListings : [];
        if (prev.includes(listingId)) continue;
        await fsPatch(`leads/${id}`, {
          notifiedListings: [...prev, listingId].slice(-40),
          lastOutreachAt: new Date(),
        });
        marked++;
      } catch (e) { console.warn('[leads/match-listing] mark', id, e.message); }
    }
    return res.status(200).json({ ok: true, marked });
  }

  // ── GET: chi cercava questa casa ──────────────────────────────────────
  let leads = [], catalog = [];
  try {
    [leads, catalog] = await Promise.all([
      fsList('leads', { limit: 500 }),
      fsList('listings', { limit: 100 }),
    ]);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'read_failed', detail: e.message });
  }

  const listingById = new Map(catalog.map(l => [l.id, l]));
  const knownZones = [...new Set(catalog.map(l => l.zone).filter(Boolean))];
  const limit = Math.max(1, Math.min(20, Number(q.limit || body.limit) || 8));

  const ranked = rankLeadsForListing(listing, leads, listingById, knownZones);
  const matches = ranked.slice(0, limit).map(m => ({
    id: m.lead.id,
    name: m.lead.name || null,
    phone: m.lead.phone || null,
    email: m.lead.email || null,
    grade: m.lead.grade || null,
    askedAbout: m.lead.propertyTitle || null,
    createdAt: m.lead.createdAt || null,
    score: m.score,
    reasons: m.reasons,
    lang: m.lang,
    text: outreachText(m, listing, SITE),
    wa: waLink(m, listing, SITE),
  }));

  return res.status(200).json({
    ok: true,
    listing: { id: listing.id, name: listing.name || null, zone: listing.zone || null, price: listing.price || null },
    threshold: MATCH_THRESHOLD,
    scanned: leads.length,
    total: ranked.length,
    matches,
  });
}
