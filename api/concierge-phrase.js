// api/concierge-phrase.js
// Single-shot rephrasing endpoint. The page (state machine) decides what to
// ask, when to advance, what to render. This endpoint only phrases ONE
// sentence at a time in Valentino's voice.
//
// Two cached system blocks (Layer 1 rules + Layer 2 voice examples + PHRASE
// TASKS catalog) + one uncached kind-specific instruction. Most calls return
// 30–80 output tokens. Per-call cost ≈ $0.0007.
//
// vercel.json must list this file's includeFiles for concierge/voice-prompt.md.

import fs from 'node:fs';
import path from 'node:path';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };

const ALLOWED_ORIGINS = new Set([
  'https://boomrome.com',
  'https://www.boomrome.com',
]);

const ALLOWED_MODEL = 'claude-haiku-4-5-20251001';

const VALID_KINDS = new Set([
  // ask_guarantor and ack_shield_offered removed iter 4 (guarantor state
  // dropped from qualification flow; Shield is reactive-only now).
  'ask_timing','ask_duration','ask_budget','ask_profile','ask_zone','ask_contact',
  'extract_timing','extract_duration','extract_budget','extract_profile','extract_zone','extract_contact',
  'decline_short','decline_budget','decline_geo',
  'ack_listings','ack_no_listings','ack_multi_capture',
  'free_response',
]);

// Server-side guard: catch model drift where it talks to a developer instead
// of the visitor. If any of these patterns appear in free_response output,
// substitute the safe fallback. Defensive layer only — the prompt change
// should make this rare, but production safety > theory.
const BAD_PATTERNS = [
  /^I (need|require) (the |your |a )?visitor/i,
  /\boff[- ]?topic\b/i,
  /could you (clarify|elaborate|specify)/i,
  /what did (they|the visitor) (write|say|reply|tell)/i,
  /\bcontext\b[^.!?]{0,40}\bmessage\b/i,
  /\bdevelopers?\b/i,
  /\bsystem\b[^.!?]{0,40}\bmessage\b/i,
];
const FREE_RESPONSE_SAFE_FALLBACK = "Pick one of the chips below to keep us moving .";

const MAX_TOKENS_ASK = 80;
const MAX_TOKENS_EXTRACT = 200;

const RATE_MIN_MAX = 60;
const RATE_MIN_WINDOW_MS = 60_000;
const RATE_DAY_MAX = 200;
const RATE_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

const rateMin = new Map();
const rateDay = new Map();

const PRICE = { in: 1.00, out: 5.00, cache_read: 0.10, cache_write: 1.25 };

// ─── Voice prompt loader (cold-start once, 3 sections) ────────────────────

let voiceLayer1 = null;       // rules
let voiceLayer2Plus = null;   // voice examples + PHRASE TASKS catalog

function loadVoicePrompt() {
  if (voiceLayer1 && voiceLayer2Plus) return;
  const p = path.join(process.cwd(), 'concierge', 'voice-prompt.md');
  const md = fs.readFileSync(p, 'utf8');

  const l1Marker    = 'LAYER 1 — SYSTEM PROMPT';
  const l2Marker    = 'LAYER 2 — VOICE REFERENCE CARD';
  const tasksMarker = 'PHRASE TASKS — SINGLE-SHOT REPHRASING JOBS';

  const l1Idx    = md.indexOf(l1Marker);
  const l2Idx    = md.indexOf(l2Marker);
  const tasksIdx = md.indexOf(tasksMarker);
  if (l1Idx < 0 || l2Idx < 0) throw new Error('voice-prompt.md: section markers missing');

  let l1 = md.slice(l1Idx + l1Marker.length, l2Idx);
  let l2 = md.slice(l2Idx + l2Marker.length, tasksIdx > 0 ? tasksIdx : md.length);
  let tasks = tasksIdx > 0 ? md.slice(tasksIdx + tasksMarker.length) : '';

  // Skip the rest of the marker line in each (markers may have suffix text).
  const skip = s => { const n = s.indexOf('\n'); return n >= 0 ? s.slice(n + 1) : s; };
  l1 = skip(l1); l2 = skip(l2); tasks = skip(tasks);

  // Trim trailing END section from tasks (if present).
  const endIdx = tasks.indexOf('\nEND\n');
  if (endIdx > 0) tasks = tasks.slice(0, endIdx);

  const stripDecorations = s => s.replace(/^[═\s\n]+|[═\s\n]+$/g, '').trim();
  voiceLayer1 = stripDecorations(l1);
  voiceLayer2Plus = stripDecorations(l2) + (tasks ? '\n\n═══ PHRASE TASKS ═══\n\n' + stripDecorations(tasks) : '');
}

// ─── Per-kind instruction builder ─────────────────────────────────────────

function buildKindInstruction(kind, context) {
  const lead = context?.lead || {};
  const userText = (context?.userText || '').slice(0, 500);

  // Recap helper for ack_multi_capture
  const recapParts = [];
  if (lead.timing) recapParts.push(lead.timing);
  if (lead.duration_months) recapParts.push(lead.duration_months + ' months');
  if (lead.budget_max) recapParts.push('€' + lead.budget_max);
  if (lead.zone) recapParts.push(lead.zone);
  const recap = recapParts.join(', ');

  const count = context?.count || 0;
  const zone = lead.zone || '';
  const cf = context?.currentField || 'open';

  const ASK = (label, max) => `TASK: ${kind}\nPhrase ONE short question for: ${label}. Max ${max} words. Output the sentence only — no preamble, no quotes.`;

  switch (kind) {
    case 'ask_timing':    return ASK('when the visitor arrives in Roma', 8);
    case 'ask_duration':  return ASK('how long they stay', 8);
    case 'ask_budget':    return ASK('their monthly budget in euros', 8);
    case 'ask_profile':   return ASK('whether student / corporate / freelance / family', 10);
    case 'ask_zone':      return ASK('which neighborhood or to be matched', 12);
    case 'ask_contact':   return ASK('name + email + phone', 12);

    case 'extract_timing':
      return `TASK: extract_timing\nThe visitor said: "${userText}"\nExtract their arrival timing. Buckets: urgent (within ~2 weeks) / soon (2 weeks–~2 months) / later (2+ months out).\nOutput JSON ONLY: {"value": "urgent"|"soon"|"later"|null, "phrasedAck": "<one short Valentino sentence acknowledging>"}.\nIf the message doesn't state timing, value: null and phrasedAck: "". No prose around the JSON.`;
    case 'extract_duration':
      return `TASK: extract_duration\nThe visitor said: "${userText}"\nExtract stay duration in integer months. Round weeks to months. Treat "year" as 12.\nOutput JSON ONLY: {"value": <integer>|null, "phrasedAck": "..."}\nIf not stated, value: null. No prose.`;
    case 'extract_budget':
      return `TASK: extract_budget\nThe visitor said: "${userText}"\nExtract monthly budget in euros (integer). If a range is given, take the upper bound.\nOutput JSON ONLY: {"value": <integer>|null, "phrasedAck": "..."}\nIf not stated, value: null. No prose.`;
    case 'extract_profile':
      return `TASK: extract_profile\nThe visitor said: "${userText}"\nExtract their profile. Allowed: "student", "corporate", "freelance", "family", "researcher".\nOutput JSON ONLY: {"value": <string>|null, "phrasedAck": "..."}\nIf not stated, value: null. No prose.`;
    case 'extract_zone':
      return `TASK: extract_zone\nThe visitor said: "${userText}"\nValid Roma zones: Borgo Pio, Trastevere, Parioli, Salario, Trieste, San Lorenzo, Flaminio, Ponte Milvio. If they named one, use that exact spelling.\nOutput JSON ONLY: {"value": "<zone>"|null, "phrasedAck": "..."}\nIf not stated, value: null. No prose.`;
    case 'extract_contact':
      return `TASK: extract_contact\nThe visitor said: "${userText}"\nExtract name, email, phone. Phone keeps international format if given. Name is full name as written.\nOutput JSON ONLY: {"name": "..."|null, "email": "..."|null, "phone": "..."|null, "phrasedAck": "..."}\nFor any missing field, null. No prose.`;

    case 'decline_short':
      return `TASK: decline_short\nVisitor's stay is under 30 days — BOOM doesn't fit. Phrase a clean honest decline in Valentino voice. Two sentences max. No "unfortunately". Suggest Airbnb honestly. Output the decline only.`;
    case 'decline_budget':
      return `TASK: decline_budget\nVisitor's budget is below €900/mo — BOOM can't deliver standard at that price. Phrase a clean honest decline in Valentino voice. Two sentences max. No "unfortunately". Suggest Idealista or other honest alternative. Output the decline only.`;
    case 'decline_geo':
      return `TASK: decline_geo\nVisitor wants a city other than Roma — BOOM is Roma only. Phrase a clean decline in Valentino voice. Two sentences max. Mention Roma only for now, Barcelona on roadmap. Output the decline only.`;

    case 'ack_listings':
      return `TASK: ack_listings\nThe page just rendered ${count} matched listing${count === 1 ? '' : 's'} below your reply. Phrase ONE short Valentino-voice sentence acknowledging — refer to the count, do NOT name properties or prices. Max 10 words. Output the sentence only.`;
    case 'ack_no_listings':
      return `TASK: ack_no_listings\nThe page found zero matches in ${zone || "the visitor's zone"}. Phrase ONE short sentence acknowledging the gap, inviting off-market hunt. Max 12 words. Output the sentence only.`;
    case 'ack_multi_capture':
      return `TASK: ack_multi_capture\nThe visitor gave us multiple fields at once. Recap: "${recap}". Phrase ONE Valentino-voice sentence in this exact rhythm: "Got it — <recap> . Looking now ." Output the sentence only.`;

    case 'free_response':
      return `TASK: free_response
The visitor just sent a message that doesn't directly answer the current state's question.
Visitor's message: "${userText}"
Current state's question: about their ${cf}.

Reply with ONE OR TWO short Valentino-voice sentences that acknowledge their message and gently steer back to the current question. Chips for the current state remain visible below the input.

Hard rules:
- Do NOT ask them to clarify
- Do NOT explain what you can or cannot do
- Do NOT mention "off-topic", "context", "system", "developer", or any meta-language about the message
- Do NOT speak about what you need from a developer or system
- If the message is too vague to respond meaningfully, output exactly: "${FREE_RESPONSE_SAFE_FALLBACK}"

Output the reply only. No preamble, no quotes, no JSON, no explanations. ONE OR TWO sentences max.`;
  }
  return `TASK: ${kind}\nUnknown task. Output a single short Valentino-voice acknowledgment.`;
}

function maxTokensFor(kind) {
  if (kind.startsWith('ask_') || kind.startsWith('ack_')) return MAX_TOKENS_ASK;
  return MAX_TOKENS_EXTRACT;
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
  const e = map.get(ip);
  if (!e || now - e.windowStart >= windowMs) {
    map.set(ip, { count: 1, windowStart: now });
    if (map.size > 1000) {
      const cutoff = now - 2 * windowMs;
      for (const [k, v] of map) if (v.windowStart < cutoff) map.delete(k);
    }
    return { allowed: true, count: 1 };
  }
  e.count += 1;
  if (e.count > max) return { allowed: false, count: e.count };
  return { allowed: true, count: e.count };
}

function log(event, extra = {}) {
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'concierge-phrase', event, ...extra })); } catch {}
}

// ─── Handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) {
    log('reject', { reason: 'missing-anthropic-key' });
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const ip = getClientIp(req);
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
  const kind = String(body.kind || '');
  if (!VALID_KINDS.has(kind)) {
    log('reject', { reason: 'bad-kind', kind });
    return res.status(400).json({ error: 'Invalid kind' });
  }
  const context = (body.context && typeof body.context === 'object') ? body.context : {};

  try { loadVoicePrompt(); }
  catch (err) {
    log('voice-load-error', { message: err.message });
    return res.status(500).json({ error: 'Voice prompt missing on server' });
  }

  const kindInstruction = buildKindInstruction(kind, context);

  // Two cached system blocks (Layer 1, Layer 2 + PHRASE TASKS) + uncached
  // kind-specific instruction. Stub user message ("Execute.") because Anthropic
  // requires at least one user turn — the actual context lives in the
  // kindInstruction system block (cleaner separation than embedding in user).
  const upstreamBody = {
    model: ALLOWED_MODEL,
    max_tokens: maxTokensFor(kind),
    system: [
      { type: 'text', text: voiceLayer1,     cache_control: { type: 'ephemeral' } },
      { type: 'text', text: voiceLayer2Plus, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: kindInstruction },
    ],
    messages: [{ role: 'user', content: 'Execute the task.' }],
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
    log('upstream-error', { kind, message: err.message });
    return res.status(502).json({ error: 'Upstream request failed' });
  }
  const ms = Date.now() - t0;

  if (!upstream.ok) {
    log('upstream-bad', { kind, status: upstream.status, body: JSON.stringify(data).slice(0, 300) });
    return res.status(upstream.status).json({ error: 'Upstream API error', detail: data?.error || null });
  }

  const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

  let text = raw;
  let extracted = null;

  if (kind.startsWith('extract_')) {
    // Parse JSON output. Strip code fences if model wrapped them.
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      extracted = parsed;
      text = parsed.phrasedAck || '';
    } catch {
      log('extract-parse-fail', { kind, raw: raw.slice(0, 120) });
      text = '';
      extracted = null;
    }
  }

  // Defensive guard for free_response — if the model leaks meta-instructions
  // (talking to a developer instead of the visitor), substitute the safe
  // fallback. The hardened prompt should make this rare; this is the floor.
  if (kind === 'free_response' && text && BAD_PATTERNS.some(p => p.test(text))) {
    log('warn', { event: 'free_response_drift_caught', kind, originalSlice: text.slice(0, 120) });
    text = FREE_RESPONSE_SAFE_FALLBACK;
  }

  const u = data.usage || {};
  const tokens_used = {
    input:        u.input_tokens || 0,
    output:       u.output_tokens || 0,
    cache_read:   u.cache_read_input_tokens || 0,
    cache_create: u.cache_creation_input_tokens || 0,
  };
  const cost_usd =
    ((tokens_used.input        * PRICE.in)          +
     (tokens_used.output       * PRICE.out)         +
     (tokens_used.cache_read   * PRICE.cache_read)  +
     (tokens_used.cache_create * PRICE.cache_write)) / 1e6;
  tokens_used.cost_usd = Math.round(cost_usd * 1e6) / 1e6;

  log('ok', { kind, ip, ms, ...tokens_used });
  return res.status(200).json({ text, extracted, tokens_used });
}
