// api/agent/_claude.js
// Thin Anthropic /v1/messages client for the agent layer. Mirrors the raw-HTTP
// approach already used by api/parse-docs.js (no SDK dependency, no build step),
// but server-side only and reusable across the AI tools (ai.reply, etc.).
//
// Env:
//   ANTHROPIC_API_KEY   (required) — same key parse-docs.js uses
//   ANTHROPIC_MODEL     (optional) — defaults to claude-opus-4-8
//
// Model default is Opus 4.8 (latest, most capable). Override per-deployment via
// ANTHROPIC_MODEL if you want to trade intelligence for latency/cost (e.g.
// claude-haiku-4-5 for high-volume reply drafting).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

// Call Claude with a system prompt + a single user turn. Returns the joined
// text of the response. `system` is sent as a cacheable block so a stable
// persona prefix can be reused across calls (prompt caching).
export async function callClaude({ system, user, maxTokens = 1024, model } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  if (!user) throw new Error('user content required');

  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    // Keep thinking off for short, latency-sensitive drafts; the system prompt
    // instructs Claude to answer with the deliverable only.
    system: [
      { type: 'text', text: system || 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: user }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
  return { text, usage: data.usage || null, model: data.model || body.model };
}

// Best-effort JSON extraction from a Claude response (handles ```json fences).
export function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}
