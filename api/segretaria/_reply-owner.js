// Other reply producers keep their existing queue. This is a bounded, read-only
// check for work already there, not a new ownership registry or an expiring lock.
import { fsList } from '../homie/_lib.js';

export async function replyOwner(conversation, { excludeActionId = null } = {}) {
  if (conversation?.segretaria === true) return { blocked: true, owner: 'segretaria:conversation', actionId: null, incomplete: false };
  const probes = [['payload.conversationId', conversation?.id], ['leadId', conversation?.leadId],
    ['payload.phone', conversation?.contactPhone], ['payload.to', conversation?.contactEmail?.trim().toLowerCase()]]
    .filter(([, value]) => typeof value === 'string' && value);
  if (!probes.length) return { blocked: true, owner: null, actionId: null, incomplete: true };
  const results = await Promise.allSettled(probes.map(([field, value]) => fsList('action_queue', {
    filter: { field, op: 'EQUAL', value }, limit: 21,
  })));
  const incomplete = results.some(r => r.status !== 'fulfilled' || r.value.length >= 21);
  const rows = [...new Map(results.flatMap(r => r.status === 'fulfilled' ? r.value : []).map(r => [r.id, r])).values()];
  const busy = rows.filter(a => a.id !== excludeActionId && a.kind === 'reply'
    && (['pending', 'approved'].includes(a.status)
      || (a.status === 'executed' && ['whatsapp', 'both'].includes(a.payload?.channel) && !a.waSentAt)
      || (a.status === 'failed' && a.segretaria?.execution)))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return { blocked: !!busy || incomplete, owner: busy?.proposedBy || null, actionId: busy?.id || null, incomplete };
}
