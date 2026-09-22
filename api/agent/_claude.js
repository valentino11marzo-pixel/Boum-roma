// api/agent/_claude.js
// L'ingresso storico dell'agent layer (ai.reply, commerciale, segretaria,
// banking). Dal 21/09/2026 è un wrapper sottile sulla CENTRALE AI
// (api/_ai.js): stessa firma per i chiamanti, ma il backend (cloud, ombra o
// locale), il tetto di tempo e i contatori li decide la centrale in base allo
// SCOPO dichiarato nel registro (js/ai-registry.js).
//
// Env:
//   ANTHROPIC_API_KEY   (required) — la centrale la usa per il cloud
//   ANTHROPIC_MODEL     (optional) — override GLOBALE del modello cloud per i
//                       chiamanti di questo file (vince sul registro e sulle
//                       impostazioni per scopo). Il default di registro per
//                       questi scopi è claude-opus-4-8, com'era qui.
//
// `system` viaggia come blocco cacheable (prompt caching): al cloud passa
// intatto, al locale viene appiattito in testo.

import { ai } from '../_ai.js';
import { modelJson } from '../_modeljson.js';

const ENV_MODEL = process.env.ANTHROPIC_MODEL || '';

// Call the model with a system prompt + a single user turn. Returns the joined
// text of the response plus usage/model/backend. `purpose` è la chiave del
// registro: senza, si conta come 'agent.reply' (il chiamante storico).
export async function callClaude({ system, user, maxTokens = 1024, model, purpose = 'agent.reply', timeoutMs = 30000 } = {}) {
  if (!user) throw new Error('user content required');
  const r = await ai({
    purpose,
    maxTokens,
    timeoutMs,   // un modello appeso non deve uccidere la funzione
    model: model || ENV_MODEL || undefined,
    system: [
      { type: 'text', text: system || 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: user }],
  });
  return { text: r.text, usage: r.usage || null, model: r.model, backend: r.backend, fallback: r.fallback };
}

// La lettura del JSON di un modello sta in api/_modeljson.js — una copia
// sola, con le regole scritte lì (si sistema solo la forma, una risposta
// troncata non si ripara mai). Questo resta l'ingresso storico dei chiamanti.
export function extractJson(text) {
  return modelJson(text);
}
