// api/agent/ai.reply.js — Tool: agent.ai.reply  (Tier 1, draft-only)
//
// Drafts a personalized first reply to a lead with Claude. Does NOT send — it
// returns { subject, body, language } so the operator (or Homie) can review,
// edit, and then send via agent.messages.send or by proposing a Tier-2 action.
//
// Body: {
//   leadId?:  string         fetch the lead from Firestore and use its fields
//   lead?:    object         OR pass the lead fields inline (name, message, ...)
//   tone?:    'warm' | 'professional' | 'concise'   default 'warm'
//   language?:'it' | 'en'    override; otherwise inferred from the lead
//   goal?:    string         optional steer, e.g. "propose a viewing this week"
// }
//
// Output: { subject, body, language, usage }

import { fsGet, guardPost, okJson, errJson, logActivity } from './_lib.js';
import { callClaude, extractJson } from './_claude.js';

const SYSTEM = `Sei l'assistente di BOOM Roma, agenzia premium di affitti a Roma (boomrome.com). Scrivi la PRIMA risposta a un lead che ha mostrato interesse per un appartamento o per il servizio di ricerca casa.

Regole:
- Tono caldo, umano, professionale — mai robotico, mai markdown, mai emoji eccessivi (max 1).
- Personalizza usando i dati del lead (nome, zona, budget, immobile d'interesse). Non inventare dettagli che non hai.
- Massimo 5-6 frasi. Vai dritto al valore: conferma disponibilità/interesse, fai 1 domanda utile per qualificare (es. data di ingresso o budget se mancano), e proponi il passo successivo (una call o una visita).
- Firma come "Il team BOOM".
- Scrivi nella lingua indicata.

Rispondi SOLO con un oggetto JSON valido, senza testo attorno:
{"subject": "<oggetto email breve>", "body": "<corpo del messaggio>"}`;

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  let lead = body.lead || null;
  if (!lead && body.leadId) {
    lead = await fsGet(`leads/${body.leadId}`);
    if (!lead) return errJson(res, 404, 'lead_not_found');
  }
  if (!lead) return errJson(res, 400, 'leadId or lead required');

  const language = (body.language || lead.language || 'it').toLowerCase().startsWith('en') ? 'en' : 'it';
  const tone = ['warm', 'professional', 'concise'].includes(body.tone) ? body.tone : 'warm';

  const facts = [
    `Lingua: ${language === 'en' ? 'inglese' : 'italiano'}`,
    `Tono richiesto: ${tone}`,
    lead.name ? `Nome lead: ${lead.name}` : null,
    lead.budget ? `Budget: €${lead.budget}/mese` : null,
    lead.zone ? `Zona preferita: ${lead.zone}` : null,
    lead.situation ? `Situazione: ${lead.situation}` : null,
    lead.propertyTitle ? `Immobile d'interesse: ${lead.propertyTitle}${lead.propertyPrice ? ` (€${lead.propertyPrice}/mese)` : ''}` : null,
    lead.source ? `Fonte: ${lead.source}` : null,
    body.goal ? `Obiettivo di questa risposta: ${body.goal}` : null,
    lead.message ? `Messaggio originale del lead: "${String(lead.message).slice(0, 500)}"` : null,
  ].filter(Boolean).join('\n');

  try {
    const { text, usage } = await callClaude({
      system: SYSTEM,
      user: `Scrivi la prima risposta a questo lead.\n\n${facts}`,
      maxTokens: 700,
    });
    const parsed = extractJson(text) || { subject: language === 'en' ? 'About your enquiry' : 'La tua richiesta', body: text };
    await logActivity('Bozza AI generata (agent)', 'message', { leadId: body.leadId || null, language, tone });
    return okJson(res, { subject: parsed.subject || '', body: parsed.body || text, language, tone, usage });
  } catch (e) {
    return errJson(res, 502, 'ai_failed', e.message);
  }
}
