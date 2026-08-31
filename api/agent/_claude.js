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

import { modelJson } from '../_modeljson.js';
import { aiSignal } from '../_budget.js';

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
    signal: aiSignal(30000),   // un modello appeso non deve uccidere la funzione
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

// La lettura del JSON di un modello sta in api/_modeljson.js — una copia
// sola, con le regole scritte lì (si sistema solo la forma, una risposta
// troncata non si ripara mai). Questo resta l'ingresso storico dei chiamanti.
export function extractJson(text) {
  return modelJson(text);
}
