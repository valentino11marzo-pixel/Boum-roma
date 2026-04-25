// api/parse-docs.js
// Hardened Anthropic /v1/messages proxy.
//
// Defenses:
//   - Admin-gated via Authorization: Bearer <PARSE_DOCS_SECRET>
//   - Constant-time bearer comparison (crypto.timingSafeEqual)
//   - Per-IP rate limit: 10 requests / 60s (in-memory, best effort)
//   - Model pinned server-side (client cannot choose)
//   - max_tokens capped server-side
//   - Request body field-whitelisted (strips tools, stream, metadata, etc.)
//   - POST only; CORS restricted to boomrome.com
//   - 10 MB payload cap (matches Vercel bodyParser sizeLimit below)
//   - Structured JSON logging of every reject + every success

import crypto from 'node:crypto';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// TODO: narrow to www-only once 301 redirect is live
const ALLOWED_ORIGINS = new Set([
  'https://www.boomrome.com',
  'https://boomrome.com',
]);

const ALLOWED_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS_CEILING = 2000;
const MAX_TOKENS_DEFAULT = 1500;

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Persists across invocations on a warm Fluid Compute instance.
// Different instances have independent maps — this is best-effort, not precise.
const rateLimitMap = new Map(); // ip -> { count, windowStart }

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    return xff.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

function logEvent(obj) {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
  } catch {
    console.log('parse-docs: log serialization failed');
  }
}

function constantTimeEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on length mismatch; check first.
  // Length is a minor side-channel but acceptable at our threat model.
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    // Opportunistic cleanup so the Map doesn't grow unbounded on a long-lived instance.
    if (rateLimitMap.size > 1000) {
      const cutoff = now - 2 * RATE_LIMIT_WINDOW_MS;
      for (const [k, v] of rateLimitMap) {
        if (v.windowStart < cutoff) rateLimitMap.delete(k);
      }
    }
    return { allowed: true, count: 1 };
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, count: entry.count };
  }
  return { allowed: true, count: entry.count };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const ip = getClientIp(req);
  const ua = (req.headers['user-agent'] || '').slice(0, 200);

  // Method check (POST only)
  if (req.method !== 'POST') {
    logEvent({ event: 'parse-docs-reject', reason: 'method', method: req.method, ip, ua });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Server-side config sanity. Fail closed if misconfigured.
  const serverSecret = process.env.PARSE_DOCS_SECRET;
  if (!serverSecret) {
    logEvent({ event: 'parse-docs-reject', reason: 'server-missing-secret', ip, ua });
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    logEvent({ event: 'parse-docs-reject', reason: 'server-missing-anthropic-key', ip, ua });
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // Auth: constant-time bearer check
  const authHeader = req.headers.authorization || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
  const providedToken = bearerMatch ? bearerMatch[1].trim() : '';
  if (!constantTimeEqual(providedToken, serverSecret)) {
    logEvent({ event: 'parse-docs-reject', reason: 'auth', ip, ua });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Per-IP rate limit
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    logEvent({ event: 'parse-docs-reject', reason: 'rate-limit', ip, ua, count: rl.count });
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Body shape check
  const body = req.body;
  if (!body || typeof body !== 'object') {
    logEvent({ event: 'parse-docs-reject', reason: 'bad-body', ip, ua });
    return res.status(400).json({ error: 'Invalid request body' });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    logEvent({ event: 'parse-docs-reject', reason: 'bad-messages', ip, ua });
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  // Whitelist upstream fields. Anything else the client sent is dropped.
  // This blocks cost/behavior-shifting params (tools, tool_choice, stream, metadata,
  // temperature, top_p, top_k, stop_sequences, etc.) even from a bearer holder.
  const clientMax = Number(body.max_tokens);
  const maxTokens = Number.isFinite(clientMax) && clientMax > 0
    ? Math.min(clientMax, MAX_TOKENS_CEILING)
    : MAX_TOKENS_DEFAULT;

  const upstreamBody = {
    model: ALLOWED_MODEL,
    max_tokens: maxTokens,
    messages: body.messages,
  };
  if (typeof body.system === 'string' && body.system.length > 0) {
    upstreamBody.system = body.system;
  }

  // Forward to Anthropic
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await upstream.json().catch(() => ({ error: 'Invalid upstream JSON' }));

    logEvent({
      event: 'parse-docs-ok',
      ip,
      upstreamStatus: upstream.status,
      rateCount: rl.count,
    });

    return res.status(upstream.status).json(data);
  } catch (err) {
    logEvent({
      event: 'parse-docs-error',
      ip,
      message: err?.message || 'unknown',
    });
    return res.status(502).json({ error: 'Upstream request failed' });
  }
}
