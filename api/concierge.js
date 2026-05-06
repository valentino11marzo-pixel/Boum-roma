// api/concierge.js
// BOOM Concierge — Anthropic Haiku 4.5 proxy with prompt caching.
// Reads matched listings from Firestore, injects scrubbed JSON into the system
// prompt, returns reply + listings + token usage to the page.
//
// Voice: concierge/voice-prompt.md is the source of truth. Layer 1 (rules) and
// Layer 2 (real Valentino messages) are sent as TWO cached system blocks.
// A short voice-anchor block is appended on turns 4 / 8 / 12 to fight Haiku
// drift. The page never sees the API key.
//
// vercel.json must list this file's includeFiles for concierge/voice-prompt.md
// so the markdown ships into the function bundle.

import fs from 'node:fs';
import path from 'node:path';
import * as fsdb from './_lib/firestore.js';

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };

const ALLOWED_ORIGINS = new Set([
  'https://boomrome.com',
  'https://www.boomrome.com',
]);

const ALLOWED_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 280;

const RATE_MIN_MAX = 10;
const RATE_MIN_WINDOW_MS = 60_000;
const RATE_DAY_MAX = 30;
const RATE_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

const rateMin = new Map();
const rateDay = new Map();

// Pricing — Claude Haiku 4.5, USD per million tokens. Cache write is 1.25x
// base input; cache read is 0.10x. Source: Anthropic pricing as of Jan 2026.
const PRICE = { in: 1.00, out: 5.00, cache_read: 0.10, cache_write: 1.25 };

// ─── Voice prompt loader (read once at cold start) ───────────────────────

let voiceLayer1 = null;
let voiceLayer2 = null;

function loadVoicePrompt() {
  if (voiceLayer1 && voiceLayer2) return;
  const p = path.join(process.cwd(), 'concierge', 'voice-prompt.md');
  const md = fs.readFileSync(p, 'utf8');
  const l1Marker = 'LAYER 1 — SYSTEM PROMPT';
  const l2Marker = 'LAYER 2 — VOICE REFERENCE CARD';
  const l1Idx = md.indexOf(l1Marker);
  const l2Idx = md.indexOf(l2Marker);
  if (l1Idx < 0 || l2Idx < 0) throw new Error('voice-prompt.md: section markers missing');
  let l1 = md.slice(l1Idx + l1Marker.length, l2Idx);
  let l2 = md.slice(l2Idx + l2Marker.length);
  // Skip rest of the marker line in both (the L2 marker has trailing parenthetical text).
  const nl1 = l1.indexOf('\n'); if (nl1 >= 0) l1 = l1.slice(nl1 + 1);
  const nl2 = l2.indexOf('\n'); if (nl2 >= 0) l2 = l2.slice(nl2 + 1);
  const endIdx = l2.indexOf('\nEND\n');
  if (endIdx > 0) l2 = l2.slice(0, endIdx);
  voiceLayer1 = l1.replace(/^[═\s\n]+|[═\s\n]+$/g, '').trim();
  voiceLayer2 = l2.replace(/^[═\s\n]+|[═\s\n]+$/g, '').trim();
}

const VOICE_ANCHOR = `VOICE ANCHOR — remember:
• 1–2 short sentences per reply.
• Standalone period for hard truths ("Or probably not .").
• Space-before-bang in greetings ("Hello !").
• Italian terms stay in English (mediatore, fidejussione, transitorio).
• Never "unfortunately", never "we're here to help", never validate before answering.
• Would Valentino send this on WhatsApp at 14:00 between two viewings? If no, rewrite.`;

// ─── Available zones cache (5-min TTL) ───────────────────────────────────

let zonesCache = null;
let zonesCacheAt = 0;
const ZONES_TTL_MS = 5 * 60 * 1000;

async function getAvailableZones() {
  const now = Date.now();
  if (zonesCache && now - zonesCacheAt < ZONES_TTL_MS) return zonesCache;
  try {
    const docs = await fsdb.runQuery({
      collection: 'listings',
      where: fsdb.filter.eq('status', 'available'),
      limit: 100,
    });
    const zones = [...new Set(docs.map(d => (d.zone || '').trim()).filter(Boolean))].sort();
    zonesCache = zones;
    zonesCacheAt = now;
    return zones;
  } catch (err) {
    log('zones-fetch-error', { message: err.message });
    return zonesCache || [];
  }
}

// ─── Listings fetch (per-call, scrubbed) ─────────────────────────────────

async function matchedListings(lead) {
  const docs = await fsdb.runQuery({
    collection: 'listings',
    where: fsdb.filter.eq('status', 'available'),
    limit: 80,
  });

  const zoneNorm = lead?.zone ? String(lead.zone).toLowerCase().trim() : null;
  const budgetCap = typeof lead?.budget_max === 'number' ? lead.budget_max + 150 : null;

  let pool = docs.filter(d => {
    if (zoneNorm && (d.zone || '').toLowerCase().trim() !== zoneNorm) return false;
    if (budgetCap != null && typeof d.price === 'number' && d.price > budgetCap) return false;
    return true;
  });

  if (typeof lead?.budget_max === 'number') {
    pool.sort((a, b) =>
      Math.abs((a.price ?? 0) - lead.budget_max) -
      Math.abs((b.price ?? 0) - lead.budget_max));
  } else {
    pool.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  }
  return pool.slice(0, 5).map(scrubListing);
}

function scrubListing(d) {
  const sqm  = pickInt(d.sqm, d.size);
  const beds = pickInt(d.beds, d.bedrooms);
  const ad = d.availableDate || d.availableFrom || '';
  const availableFrom = /^\d{4}-\d{2}-\d{2}/.test(ad) ? ad.slice(0, 10) : ad;
  return {
    id: d.id,
    type: d.type || 'apartment',
    zone: d.zone || '',
    sqm: sqm,
    beds: beds,
    bathrooms: typeof d.bathrooms === 'number' ? d.bathrooms : null,
    price: typeof d.price === 'number' ? d.price : null,
    available_from: availableFrom,
    features: Array.isArray(d.features) ? d.features.slice(0, 8) : [],
    furnished: d.furnished || null,
    duration_min: 1,
    duration_max: 18,
  };
}

function pickInt(...values) {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRate(map, ip, max, windowMs) {
  const now = Date.now();
  const entry = map.get(ip);
  if (!entry || now - entry.windowStart >= windowMs) {
    map.set(ip, { count: 1, windowStart: now });
    if (map.size > 1000) {
      const cutoff = now - 2 * windowMs;
      for (const [k, v] of map) if (v.windowStart < cutoff) map.delete(k);
    }
    return { allowed: true, count: 1 };
  }
  entry.count += 1;
  if (entry.count > max) return { allowed: false, count: entry.count };
  return { allowed: true, count: entry.count };
}

function log(event, extra = {}) {
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'concierge', event, ...extra })); } catch {}
}

// ─── Dynamic context block (uncached) ────────────────────────────────────

function buildDynamicContext({ lead, listings, zones, stage }) {
  const facts = [
    `timing=${lead?.timing || '?'}`,
    `duration_months=${lead?.duration_months ?? '?'}`,
    `budget_max=${lead?.budget_max ?? '?'}`,
    `profile=${lead?.profile || '?'}`,
    `has_guarantor=${lead?.has_guarantor === null || lead?.has_guarantor === undefined ? '?' : lead.has_guarantor}`,
    `zone=${lead?.zone || '?'}`,
    `is_remote=${!!lead?.is_remote}`,
    `needs_admin_help=${!!lead?.needs_admin_help}`,
    `has_contact=${!!(lead?.email || lead?.phone)}`,
    `score=${typeof lead?.score === 'number' ? lead.score : 0}`,
    `routing=${lead?.routing || 'pending'}`,
  ];

  const zonesLine = zones && zones.length
    ? `CURRENT INVENTORY ZONES (real availability right now): ${zones.join(', ')}. If the visitor names a zone you don't have, be honest — say what we do have, or offer the Property Finder Service.`
    : 'CURRENT INVENTORY ZONES: (none retrievable — be honest if asked).';

  const listingsCount = (listings && listings.length) || 0;
  const listingsBlock = listingsCount > 0
    ? `MATCHED LISTINGS COUNT: ${listingsCount}. ${listingsCount} listings WILL BE RENDERED to the visitor below your reply. The visitor WILL see them. Do NOT name them, prices, or addresses yourself; refer to count ("Two fit your dates and budget — shown below"). Do NOT propose [SERVICE:PFS] when listings exist — there is no empty state. Listings JSON for your context only:\n${JSON.stringify(listings, null, 2)}`
    : 'MATCHED LISTINGS COUNT: 0. No listings match the current criteria. Acknowledge the gap honestly without "unfortunately". If the visitor has timing+duration+budget+zone all set, propose [SERVICE:PFS] for off-market hunting. Do NOT propose [BOOK_VIEWING] — there is nothing to view.';

  return `CURRENT FACTS (already extracted by the page; advance the next still-unknown step only — do not re-ask anything already known):
${facts.join('; ')}.

NEXT STAGE: ${stage}. Ask only the still-unknown next field, in one short sentence. Always emit [ASK:field] (timing/duration/budget/profile/guarantor/zone/contact/open) on its own line so the page can show the right input chips.

When closing, pick exactly one close token based on score above:
  • score < 40 → [OPEN_INTAKE]   (soft container for hesitant visitors)
  • score 40–79 → [BOOK_VIEWING] (routes to /book — pass mints AFTER booking confirms)
  • score 80+ → [TALK_VALENTINO] (opens WhatsApp directly to Valentino)

${zonesLine}

${listingsBlock}`;
}

// ─── Main handler ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = getClientIp(req);
  if (req.method !== 'POST') {
    log('reject', { reason: 'method', method: req.method, ip });
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    log('reject', { reason: 'missing-anthropic-key' });
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const rMin = checkRate(rateMin, ip, RATE_MIN_MAX, RATE_MIN_WINDOW_MS);
  if (!rMin.allowed) {
    log('reject', { reason: 'rate-min', ip, count: rMin.count });
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }
  const rDay = checkRate(rateDay, ip, RATE_DAY_MAX, RATE_DAY_WINDOW_MS);
  if (!rDay.allowed) {
    log('reject', { reason: 'rate-day', ip, count: rDay.count });
    return res.status(429).json({ error: 'Daily limit reached' });
  }

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }
  const safeMessages = messages.slice(-20).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content.slice(0, 2000) : '',
  })).filter(m => m.content);
  if (safeMessages.length === 0) return res.status(400).json({ error: 'no usable messages' });

  const lead = (body.lead && typeof body.lead === 'object') ? body.lead : {};
  const sessionId = (typeof body.sessionId === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(body.sessionId))
    ? body.sessionId
    : null;
  const stage = (typeof body.stage === 'string') ? body.stage.slice(0, 32) : 'INTRO';

  try { loadVoicePrompt(); }
  catch (err) {
    log('voice-load-error', { message: err.message });
    return res.status(500).json({ error: 'Voice prompt missing on server' });
  }

  let listings = [];
  let zones = [];
  try {
    [listings, zones] = await Promise.all([matchedListings(lead), getAvailableZones()]);
  } catch (err) {
    log('firestore-error', { message: err.message });
    // Soft-fail: continue without listings.
  }

  const turnNumber = safeMessages.filter(m => m.role === 'user').length;
  const includeAnchor = turnNumber > 0 && turnNumber % 4 === 0;

  const dynamic = buildDynamicContext({ lead, listings, zones, stage });

  const systemBlocks = [
    { type: 'text', text: voiceLayer1, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: voiceLayer2, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamic },
  ];
  if (includeAnchor) systemBlocks.push({ type: 'text', text: VOICE_ANCHOR });

  const upstreamBody = {
    model: ALLOWED_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemBlocks,
    messages: safeMessages,
  };

  const t0 = Date.now();
  let upstream, data;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(upstreamBody),
    });
    data = await upstream.json();
  } catch (err) {
    log('upstream-error', { message: err.message });
    return res.status(502).json({ error: 'Upstream request failed' });
  }
  const ms = Date.now() - t0;

  if (!upstream.ok) {
    log('upstream-bad', { status: upstream.status, body: JSON.stringify(data).slice(0, 400) });
    return res.status(upstream.status).json({ error: 'Upstream API error', detail: data?.error || null });
  }

  const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const u = data.usage || {};
  const tokens_used = {
    input:        u.input_tokens || 0,
    output:       u.output_tokens || 0,
    cache_read:   u.cache_read_input_tokens || 0,
    cache_create: u.cache_creation_input_tokens || 0,
  };
  const cost_usd =
    (tokens_used.input        * PRICE.in          / 1e6) +
    (tokens_used.output       * PRICE.out         / 1e6) +
    (tokens_used.cache_read   * PRICE.cache_read  / 1e6) +
    (tokens_used.cache_create * PRICE.cache_write / 1e6);
  tokens_used.cost_usd = Math.round(cost_usd * 1e6) / 1e6;

  if (sessionId) {
    appendToConversation({
      sessionId, lead, stage,
      userMessage: safeMessages[safeMessages.length - 1],
      reply, tokens_used,
    }).catch(err => log('conv-append-error', { message: err.message }));
  }

  log('ok', {
    ip, ms, turns: turnNumber, listings: listings.length,
    zones_cached: zones.length, anchor: includeAnchor,
    ...tokens_used,
  });

  return res.status(200).json({ reply, listings, sessionId, tokens_used });
}

async function appendToConversation({ sessionId, lead, stage, userMessage, reply, tokens_used }) {
  const docPath = `conversations/${sessionId}`;
  const existing = await fsdb.readDoc(docPath).catch(() => null);
  const now = new Date();
  const history = (existing && Array.isArray(existing.history)) ? existing.history : [];
  if (userMessage) history.push({ role: 'user',      content: userMessage.content, ts: now.toISOString() });
  if (reply)       history.push({ role: 'assistant', content: reply,                ts: now.toISOString() });

  const fields = {
    sessionId,
    lead,
    history: history.slice(-40),
    lastMessageAt: now,
    stage,
    score: typeof lead?.score === 'number' ? lead.score : 0,
    routing: lead?.routing || null,
    declined_reason: lead?.declined_reason || null,
    last_tokens: tokens_used,
  };
  if (!existing) {
    fields.startedAt = now;
    fields.status = 'active';
  } else if (lead?.declined_reason && existing.status !== 'declined') {
    fields.status = 'declined';
  }
  await fsdb.setDoc(docPath, fields);
}
