// api/wizard/publish.js
// Authenticated publish bridge for the Telegram listing wizard bot.
//
// Why this exists: the wizard used to POST listings straight to the Firestore
// REST API (firestore.googleapis.com/.../documents/listings) with no auth.
// That worked only while the security rules allowed public writes. The portal
// security refactor locked `listings` writes to admin-only (see
// firestore.rules — "PUBLIC CATALOG ... Writes stay admin-only"), so the bot
// now gets 403 Forbidden. Re-opening the rules would let anyone vandalize the
// public catalog, so instead the bot calls this endpoint, which verifies a
// shared secret and performs the write under admin credentials — the same
// pattern as the Homie webhooks (api/homie/*).
//
// ─────────────────────────────────────────────────────────────────────────
// Protocol
// ─────────────────────────────────────────────────────────────────────────
// Method:   POST
// URL:      https://boomrome.com/api/wizard/publish[?id=<docId>]
// Headers:  Content-Type: application/json
//           X-Wizard-Secret: <WIZARD_SECRET>   (or X-Homie-Secret)
// Body:     either of
//   1. The exact Firestore REST payload the bot already builds:
//        { "fields": { "title": {"stringValue": "..."}, ... } }
//      → bot migration is just: swap URL + add the secret header.
//   2. A plain JSON listing object:
//        { "title": "...", "price": 1200, "photos": [...], ... }
//
// Doc ID:   optional — `?id=trastevere-2br` (or body.id / body.docId for the
//           plain shape). With an id the write is an UPSERT (create or
//           update); without, Firestore auto-generates the id.
//
// Response 200: { ok: true, id, url }   url = public /listing/<id> page
// Response 400: { ok: false, error: 'validation' | 'invalid_json' | ... }
// Response 401: { ok: false, error: 'invalid_secret' }
// Response 500: { ok: false, error: '<message>' }
//
// Env vars: WIZARD_SECRET (falls back to HOMIE_SECRET) + the FIREBASE_* set
// already configured for reminder-cron / homie.
// ─────────────────────────────────────────────────────────────────────────

import {
  fsCreate, fsPatch, fsValToJs, readJson, secretEqual, logActivity,
} from '../homie/_lib.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function checkSecret(req, res) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  if (!expected) {
    res.status(500).json({ ok: false, error: 'server_misconfigured: WIZARD_SECRET unset' });
    return false;
  }
  if (!secretEqual(String(supplied || ''), expected)) {
    res.status(401).json({ ok: false, error: 'invalid_secret' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wizard-Secret, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!checkSecret(req, res)) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Normalize both accepted shapes into a plain JS object.
  let listing;
  if (body.fields && typeof body.fields === 'object') {
    // Firestore REST shape — what the bot sent to firestore.googleapis.com.
    listing = {};
    for (const [k, v] of Object.entries(body.fields)) listing[k] = fsValToJs(v);
  } else {
    listing = { ...body };
  }

  // Doc id: query param wins, then body. Strip control fields from the doc.
  let docId = String((req.query && req.query.id) || listing.id || listing.docId || '').trim();
  delete listing.id;
  delete listing.docId;
  if (docId && !ID_RE.test(docId)) {
    return res.status(400).json({ ok: false, error: 'validation', details: ['id must match [A-Za-z0-9_-]{1,128}'] });
  }

  if (Object.keys(listing).length === 0) {
    return res.status(400).json({ ok: false, error: 'validation', details: ['listing payload is empty'] });
  }

  // Audit + timestamps. The wizard owns the listing schema; we only stamp.
  const now = new Date();
  listing.updatedAt = now;
  if (!docId) listing.createdAt = listing.createdAt || now;
  listing.ingestedBy = 'wizard';

  try {
    let id = docId;
    if (docId) {
      await fsPatch(`listings/${docId}`, listing);
    } else {
      ({ id } = await fsCreate('listings', listing));
    }
    await logActivity('listing_published', 'listings',
      { id, title: listing.title || listing.name || null }, 'wizard');
    return res.status(200).json({ ok: true, id, url: `https://boomrome.com/listing/${id}` });
  } catch (err) {
    console.error('[wizard/publish]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
