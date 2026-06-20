// api/agent/concierge.js — "Chiedi a Homie" for tenants and landlords.
//
// One endpoint, two callers:
//   - tenant.html         → tenant asks about their flat (maintenance,
//                            payments, contract dates, neighborhood tips)
//   - owner-dashboard.html → landlord asks about their portfolio
//                            (yields, expiries, who hasn't paid)
//
// The point: a real concierge feel — first-aid for emergencies, a clear
// next step always, and (when the message describes a real issue) an
// agentNotifications event so Homie wakes up and takes the human side
// of the conversation forward (e.g. confirms the technician with
// the landlord, then writes back to the tenant on WhatsApp).
//
// Cost: Claude Haiku, ~600 input + 250 output tokens per turn ≈ €0.002.
// Cheaper than a single SMS.
//
// Body: {
//   role:     'tenant' | 'landlord'
//   message:  string                                   (max 2000 chars)
//   context?: object                                   the caller's known
//                                                       state (property,
//                                                       contractId, etc.)
//   history?: [{ role: 'user'|'assistant', content }]   last 6 turns
// }
// Returns: { ok, reply, action? }
//   reply:  short helpful Italian answer (<=3 short paragraphs).
//   action: { type, dedupKey } when concierge opened a notify so the
//           UI can show "✓ Il proprietario è stato avvisato".

import { readJson } from '../homie/_lib.js';
import { okJson, errJson } from './_lib.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CONCIERGE_MODEL || 'claude-haiku-4-5-20251001';
const MAX_HISTORY = 6;

// Lightweight intent detector — runs before we hit Claude, so we can
// short-circuit the easy emergencies with safe canned first-aid.
function detectEmergency(msg) {
  const m = msg.toLowerCase();
  if (/\b(gas|odore di gas|fuga di gas)\b/.test(m))
    return { kind: 'gas', priority: 'urgent',
             firstAid: 'Apri tutte le finestre, chiudi il rubinetto centrale del gas vicino al contatore, NON accendere/spegnere interruttori, esci di casa e chiama il 112. Avviso subito il proprietario.' };
  if (/\b(incendio|fuoco|fumo denso)\b/.test(m))
    return { kind: 'fire', priority: 'urgent',
             firstAid: 'Esci subito da casa chiudendo la porta della stanza interessata, chiama il 112. Avviso il proprietario.' };
  if (/\b(allagamento|alluvione|acqua ovunque|allagat)\b/.test(m))
    return { kind: 'flood', priority: 'urgent',
             firstAid: 'Chiudi il rubinetto generale dell\'acqua (di solito vicino al contatore o sotto al lavello). Togli la corrente alle zone bagnate dal quadro elettrico. Avviso un idraulico e il proprietario.' };
  if (/\b(senza corrente|black ?out|niente luce|salta(?:no)? le luci)\b/.test(m))
    return { kind: 'power', priority: 'high',
             firstAid: 'Controlla il quadro elettrico (di solito vicino alla porta d\'ingresso): se l\'interruttore generale è giù, sollevalo. Se rimane giù, c\'è un cortocircuito: avviso un elettricista.' };
  return null;
}

async function callClaude(systemPrompt, messages) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  return text || 'Sono qui. Dimmi pure.';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, X-Agent-Public-Secret, X-Firebase-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return errJson(res, 405, 'method_not_allowed');

  // Auth: accept either the public secret (for landing-page widgets) OR
  // a Firebase user ID token (tenant.html / owner-dashboard.html, both
  // post-login). Either is fine — the secret is shorthand and the token
  // proves a real account.
  const pub = req.headers['x-agent-public-secret'];
  const tok = req.headers['x-firebase-token'];
  let authOk = !!(pub && process.env.AGENT_PUBLIC_SECRET && pub === process.env.AGENT_PUBLIC_SECRET);
  if (!authOk && tok && process.env.FIREBASE_API_KEY) {
    try {
      const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: tok }) }
      );
      const data = await r.json();
      if (data.users?.[0]?.email) authOk = true;
    } catch { /* falls through to 401 */ }
  }
  if (!authOk) return errJson(res, 401, 'invalid_auth');

  const body = await readJson(req).catch(() => null);
  if (!body || typeof body !== 'object') return errJson(res, 400, 'no_body');

  const role = body.role === 'landlord' ? 'landlord' : 'tenant';
  const message = String(body.message || '').trim().slice(0, 2000);
  if (!message) return errJson(res, 400, 'missing_message');

  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const history = Array.isArray(body.history)
    ? body.history.slice(-MAX_HISTORY).filter(m =>
        m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    : [];

  // Emergency short-circuit: respond instantly with safe first-aid AND
  // fire an urgent notify so Homie alerts the landlord/owner.
  const emerg = detectEmergency(message);
  if (emerg) {
    const dedupKey = `concierge-emergency-${context.tenantId || context.uid || 'unknown'}-${Date.now()}`;
    try {
      const { fsCreate } = await import('../homie/_lib.js');
      fsCreate('agentNotifications', {
        type: 'maintenance.opened',
        summary: `🚨 EMERGENZA ${emerg.kind.toUpperCase()} · ${context.propertyName || context.property || 'casa'} · ${context.tenantName || 'tenant'}: ${message.slice(0,180)}`,
        priority: emerg.priority,
        ref: context.propertyId ? { collection: 'properties', id: context.propertyId } : null,
        ownerId: context.ownerId || null,
        payload: { kind: emerg.kind, message, context, channel: 'concierge' },
        dedupKey,
        status: 'pending',
        actor: 'concierge',
        createdAt: new Date().toISOString(),
        attempts: 0,
      }).catch(e => console.warn('[concierge] emergency notify failed:', e.message));
    } catch (_) {}
    return okJson(res, {
      reply: emerg.firstAid,
      action: { type: 'emergency', kind: emerg.kind, dedupKey },
    });
  }

  // Build a tight system prompt with whatever context we have.
  const ctxLines = [];
  if (context.tenantName)   ctxLines.push(`Tenant: ${context.tenantName}`);
  if (context.propertyName) ctxLines.push(`Casa: ${context.propertyName}`);
  if (context.rent)         ctxLines.push(`Canone: ${context.rent}€/mese`);
  if (context.contractEnd)  ctxLines.push(`Scadenza contratto: ${context.contractEnd}`);
  if (context.lastPayment)  ctxLines.push(`Ultimo pagamento: ${context.lastPayment}`);
  if (context.openTickets)  ctxLines.push(`Ticket aperti: ${context.openTickets}`);

  const system = `Sei Homie, il concierge digitale di BOOM Roma. Stai parlando con un ${role === 'tenant' ? 'inquilino' : 'proprietario'}.

CONTESTO:
${ctxLines.join('\n') || '(nessun contesto specifico noto)'}

STILE:
- Italiano cortese, diretto, mai burocratico.
- Risposte brevi: 2-3 frasi corte, max 2 paragrafi.
- Mai inventare dati che non sono nel CONTESTO. Se non sai, dillo e prometti che mi informi.
- Se il problema è di manutenzione, suggerisci di aprire il ticket dal pulsante "Maintenance" e dì che avviserai il proprietario.
- Se è urgente, fallo notare e indica l'azione immediata.
- Mai dare consigli legali specifici: rimanda al proprietario / amministratore.
- Firmati come "Homie" solo nella prima risposta della conversazione.`;

  const messages = [
    ...history,
    { role: 'user', content: message },
  ];

  try {
    const reply = await callClaude(system, messages);

    // Heuristic: detect "open a ticket" intent in the user's message
    // (broken / leak / boiler / cold / heating / etc) → emit a notify so
    // Homie picks it up and confirms a technician with the landlord.
    const issueWords = /\b(rotto|rotta|guast[oa]|perdit|caldaia|riscalda|freddo|scarico|tubo|frigo|forno|lavatric|cimic|topi|tapparell|serratur)/i;
    let action = null;
    if (role === 'tenant' && issueWords.test(message)) {
      const dedupKey = `concierge-issue-${context.tenantId || context.uid || 'unknown'}-${message.slice(0,40).toLowerCase().replace(/\W+/g,'-')}`;
      try {
        const { fsCreate } = await import('../homie/_lib.js');
        fsCreate('agentNotifications', {
          type: 'maintenance.opened',
          summary: `Segnalazione concierge · ${context.propertyName || 'casa'} · ${context.tenantName || 'tenant'}: ${message.slice(0,180)}`,
          priority: 'high',
          ref: context.propertyId ? { collection: 'properties', id: context.propertyId } : null,
          ownerId: context.ownerId || null,
          payload: { message, context, channel: 'concierge', conciergeReply: reply },
          dedupKey,
          status: 'pending',
          actor: 'concierge',
          createdAt: new Date().toISOString(),
          attempts: 0,
        }).catch(e => console.warn('[concierge] issue notify failed:', e.message));
        action = { type: 'issue_flagged', dedupKey };
      } catch (_) {}
    }

    return okJson(res, { reply, action });
  } catch (e) {
    console.error('[concierge]', e);
    return errJson(res, 502, 'llm_failed', { message: String(e.message || e) });
  }
}
