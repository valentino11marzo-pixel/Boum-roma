// api/employees/commerciale.js — IL COMMERCIALE (cron ogni 2 ore, 8-20 Roma)
//
// The sales employee. In the Rome rental market response speed ≈ conversion,
// so this one makes sure NO lead sits unanswered:
//
//   • Prima risposta — every lead still `new` after a 20-minute human window
//     gets a personalized Claude-drafted reply (same persona as agent/ai.reply)
//     proposed in action_queue (Tier 2). Telegram pings the operator within a
//     minute (notify-pending); one tap approves and messages.send delivers.
//     Never auto-sends: outbound stays human-approved.
//   • Follow-up — leads still `new` after 48h (grade A/B or apply/reserve
//     intent) get ONE templated gentle nudge proposal.
//
// Idempotent by contextHash: a lead is never proposed twice for the same
// step, no matter how often the cron fires. Cap per run keeps the approval
// queue humane. Heartbeat + report like every employee; no digest message —
// the proposal cards ARE the notification.
//
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` = read-only.

import { callClaude, extractJson } from '../agent/_claude.js';
import {
  requireCronOrAdmin, fsList, logActivity, proposeAction,
  reportEmployeeHealth, saveReport,
} from './_lib.js';

const EMPLOYEE = 'commerciale';
const HUMAN_WINDOW_MS = 20 * 60 * 1000;       // leave first move to the human
const FOLLOWUP_AFTER_MS = 48 * 3600 * 1000;
const MAX_LEAD_AGE_MS = 14 * 86400000;        // don't dig up archaeology
const MAX_FIRST_PER_RUN = 5;
const MAX_FOLLOWUP_PER_RUN = 3;

const SYSTEM = `Sei l'assistente commerciale di BOOM Roma, agenzia premium di affitti a Roma (boomrome.com). Scrivi la PRIMA risposta a un lead che ha mostrato interesse per un appartamento o per il servizio di ricerca casa.

Regole:
- Tono caldo, umano, professionale — mai robotico, mai markdown, massimo 1 emoji.
- Personalizza usando i dati del lead (nome, zona, budget, immobile d'interesse). Non inventare dettagli che non hai.
- Massimo 5-6 frasi. Vai dritto al valore: conferma disponibilità/interesse, fai 1 domanda utile per qualificare (es. data di ingresso o budget se mancano), e proponi il passo successivo (una call o una visita).
- Firma come "Il team BOOM".
- Scrivi in inglese se il lead scrive in inglese, altrimenti in italiano.

Rispondi SOLO con un oggetto JSON valido, senza testo attorno:
{"subject": "<oggetto email breve>", "body": "<corpo del messaggio>"}`;

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[commerciale]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry }) {
  const now = Date.now();
  const leads = await fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 120 });

  const isNew = l => !l.status || l.status === 'new';
  const ageOf = l => { const t = Date.parse(l.createdAt || 0); return t ? now - t : null; };
  const reachable = l => !!(l.email || l.phone);

  const proposals = [];
  let firstCount = 0, followupCount = 0, aiErrors = 0;

  for (const lead of leads) {
    if (!isNew(lead) || !reachable(lead)) continue;
    const age = ageOf(lead);
    if (age == null || age < HUMAN_WINDOW_MS || age > MAX_LEAD_AGE_MS) continue;

    // ── Prima risposta ────────────────────────────────────────────────
    if (firstCount < MAX_FIRST_PER_RUN) {
      const r = await proposeFirstReply(lead, dry).catch(e => {
        aiErrors++; console.warn('[commerciale] first reply failed:', lead.id, e.message);
        return null;
      });
      if (r) {
        proposals.push(r);
        if (!r.dedupHit) { firstCount++; continue; } // fresh first-reply → follow-up not yet due
      }
    }

    // ── Follow-up (una volta sola, dopo 48h ancora `new`) ─────────────
    if (followupCount < MAX_FOLLOWUP_PER_RUN && age > FOLLOWUP_AFTER_MS) {
      const hot = lead.grade === 'A' || lead.grade === 'B' || ['apply', 'reserve'].includes(lead.intent);
      if (!hot) continue;
      const r = await proposeFollowup(lead, dry);
      proposals.push(r);
      if (!r.dedupHit) followupCount++;
    }
  }

  const counts = {
    leadsScanned: leads.length,
    firstReplies: firstCount,
    followups: followupCount,
    dedupSkipped: proposals.filter(p => p.dedupHit).length,
    aiErrors,
  };
  const summary = `${firstCount} prime risposte + ${followupCount} follow-up in coda approvazione (${counts.dedupSkipped} già proposti)`;

  const report = { summary, counts, proposals: proposals.filter(p => !p.dedupHit).slice(0, 15) };
  // Quiet runs keep the heartbeat (written by the handler) but skip the
  // empty report — teamReports stays a feed of things that happened.
  if (!dry && (firstCount || followupCount || aiErrors)) {
    await saveReport(EMPLOYEE, report);
    await logActivity('Commerciale: run completato', 'employee', counts, EMPLOYEE);
  }
  return { counts, summary, report };
}

async function proposeFirstReply(lead, dry) {
  const contextHash = `commerciale:first:${lead.id}`;
  if (dry) return { type: 'first', leadId: lead.id, dedupHit: false, dry: true };

  // Dedup BEFORE paying for the Claude call.
  const probe = await proposeProbe(contextHash);
  if (probe) return { type: 'first', leadId: lead.id, dedupHit: true };

  const facts = [
    lead.name ? `Nome lead: ${lead.name}` : null,
    lead.budget ? `Budget: €${lead.budget}/mese` : null,
    lead.zone ? `Zona preferita: ${lead.zone}` : null,
    lead.propertyTitle || lead.listingName ? `Immobile d'interesse: ${lead.propertyTitle || lead.listingName}${lead.listingPrice ? ` (€${lead.listingPrice}/mese)` : ''}` : null,
    lead.intent ? `Intento: ${lead.intent}` : null,
    lead.source ? `Fonte: ${lead.source}` : null,
    lead.message ? `Messaggio originale del lead: "${String(lead.message).slice(0, 500)}"` : null,
  ].filter(Boolean).join('\n');

  const { text } = await callClaude({ system: SYSTEM, user: `Scrivi la prima risposta a questo lead.\n\n${facts}`, maxTokens: 700 });
  const parsed = extractJson(text) || { subject: 'La tua richiesta — BOOM Roma', body: text };

  const channel = lead.email ? 'email' : 'whatsapp';
  const r = await proposeAction({
    leadId: lead.id,
    kind: 'reply',
    summary: `Prima risposta a ${lead.name || 'lead'}${lead.propertyTitle || lead.listingName ? ` · ${lead.propertyTitle || lead.listingName}` : ''} (${channel})`,
    confidence: 0.8,
    proposedBy: 'commerciale',
    payload: {
      channel,
      recipient: lead.email || lead.phone,
      to: lead.email || undefined,
      phone: lead.phone || undefined,
      subject: parsed.subject || 'La tua richiesta — BOOM Roma',
      draft: parsed.body || text,
    },
    contextHash,
  });
  return { type: 'first', leadId: lead.id, name: lead.name || null, dedupHit: r.dedupHit };
}

async function proposeFollowup(lead, dry) {
  const contextHash = `commerciale:followup:${lead.id}`;
  if (dry) return { type: 'followup', leadId: lead.id, dedupHit: false, dry: true };

  const en = /[a-z]/i.test(lead.message || '') && !/[àèéìòù]/i.test(lead.message || '') && (lead.language === 'en' || /\b(the|and|looking|apartment|hi|hello)\b/i.test(lead.message || ''));
  const name = lead.name ? ` ${lead.name.split(' ')[0]}` : '';
  const draft = en
    ? `Hi${name},\n\nJust checking in on your enquiry — we're still happy to help you find the right place in Rome. If you're still looking, reply with your ideal move-in date and we'll line up a couple of options (with video tours if you're abroad).\n\nBest,\nIl team BOOM`
    : `Ciao${name},\n\nTi scriviamo di nuovo per la tua richiesta: siamo ancora a disposizione per aiutarti a trovare la casa giusta a Roma. Se stai ancora cercando, rispondici con la tua data di ingresso ideale e ti proponiamo un paio di opzioni (anche con video-visita).\n\nA presto,\nIl team BOOM`;

  const channel = lead.email ? 'email' : 'whatsapp';
  const r = await proposeAction({
    leadId: lead.id,
    kind: 'reply',
    summary: `Follow-up a ${lead.name || 'lead'} — fermo da 48h+ (${channel})`,
    confidence: 0.8,
    proposedBy: 'commerciale',
    payload: {
      channel,
      recipient: lead.email || lead.phone,
      to: lead.email || undefined,
      phone: lead.phone || undefined,
      subject: en ? 'Still looking for a place in Rome?' : 'Stai ancora cercando casa a Roma?',
      draft,
    },
    contextHash,
  });
  return { type: 'followup', leadId: lead.id, name: lead.name || null, dedupHit: r.dedupHit };
}

// Cheap existence check on contextHash (proposeAction would also dedupe, but
// for first replies we check first to avoid a wasted Claude call).
async function proposeProbe(contextHash) {
  try {
    const hits = await fsList('action_queue', {
      filter: { field: 'contextHash', op: 'EQUAL', value: contextHash },
      limit: 1,
    });
    return hits.length > 0;
  } catch { return false; }
}
