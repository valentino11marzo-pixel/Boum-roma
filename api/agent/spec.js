// api/agent/spec.js — Tool: agent.spec  (GET, public read of the tool catalog)
//
// Returns a JSON manifest of all agent tools. Homie reads this once at boot
// (and on signal-changed) so it knows what tools exist + what arguments to
// build, without hard-coding the catalog on the Mac side.
//
// Public on purpose (no secret). It only exposes the SHAPE of the API, not
// any data. All side-effect endpoints still require X-Homie-Secret.
//
// Shape is MCP-ish: { name, description, tier, side_effects, input, output }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')     return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  return res.status(200).json({
    ok: true,
    version: '1.0.0',
    auth: { header: 'X-Homie-Secret', env: 'HOMIE_SECRET' },
    base: 'https://boomrome.com/api/agent',
    tiers: {
      1: 'Auto-applied by Homie. Reversible / informational. (notes, drafts, qualification, scans.)',
      2: 'Proposed to action_queue, requires human approval. (sending email/WhatsApp, scheduling, drafting contracts, signature requests.)',
    },
    tools: [
      {
        name: 'leads.create', method: 'POST', path: '/leads.create',
        tier: 1, side_effects: 'writes:leads,activityLog',
        input: { source: 'enum', name: 'string', email: 'string?', phone: 'string?', message: 'string?', budget: 'number?', zone: 'string?', propertyTitle: 'string?', propertyPrice: 'number?', propertyUrl: 'string?', grade: 'A|B|C|dead?', confidence: 'number?', tier: '1|2?' },
        output: { id: 'string' },
      },
      {
        name: 'leads.update', method: 'POST', path: '/leads.update',
        tier: 1, side_effects: 'writes:leads,activityLog',
        input: { id: 'string', status: 'enum?', notes: 'string?', grade: 'enum?', intent: 'string?', confidence: 'number?', qualification: 'object?' },
        output: { id: 'string', updated: 'string[]' },
      },
      {
        name: 'messages.send', method: 'POST', path: '/messages.send',
        tier: 2, side_effects: 'sends:email|wa-link,writes:messageLog,activityLog',
        input: { channel: 'email|whatsapp|both', leadId: 'string?', to: 'string?', phone: 'string?', subject: 'string?', body: 'string', html: 'string?', replace: 'object?' },
        output: { channel: 'string', email: 'object?', whatsapp: 'object?' },
      },
      {
        name: 'viewings.schedule', method: 'POST', path: '/viewings.schedule',
        tier: 2, side_effects: 'writes:viewingRequests,activityLog',
        input: { leadId: 'string?', propertyId: 'string?', slots: 'iso-date[]', notes: 'string?' },
        output: { id: 'string' },
      },
      {
        name: 'contracts.draft', method: 'POST', path: '/contracts.draft',
        tier: 2, side_effects: 'writes:contracts(status=draft),leads,activityLog',
        input: { type: 'transitorio|studenti', propertyId: 'string', tenantId: 'string', startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD?', rent: 'number', deposit: 'number?', linkedLeadId: 'string?' },
        output: { id: 'string', status: 'draft', endDate: 'string', deposit: 'number' },
      },
      {
        name: 'documents.create', method: 'POST', path: '/documents.create',
        tier: 1, side_effects: 'writes:documents(+Storage),activityLog',
        input: { name: 'string', fileUrl: 'https-url?', fileBase64: 'string?', type: 'contract|receipt|id|utility|other?', category: 'string?', templateType: 'string?', mimeType: 'string?', fileName: 'string?', lang: 'IT|EN?', clientId: 'string?', tenantId: 'string?', landlordId: 'string?', propertyId: 'string?', contractId: 'string?', leadId: 'string?', userId: 'string?', shared: 'boolean?', tags: 'string[]?', pinned: 'boolean?', order: 'number?', notes: 'string?', refCode: 'string?', externalId: 'string? (idempotency)' },
        output: { id: 'string', fileUrl: 'string', archived: 'boolean?', updated: 'boolean?' },
      },
      {
        name: 'documents.list', method: 'POST', path: '/documents.list',
        tier: 1, side_effects: 'none (read-only)',
        input: { clientId: 'string?', tenantId: 'string?', landlordId: 'string?', propertyId: 'string?', contractId: 'string?', leadId: 'string?', type: 'enum?', source: 'string?', status: 'active|archived?', userId: 'string?', externalId: 'string?', limit: 'number? (1-200, default 50)' },
        output: { count: 'number', items: 'array<{id,name,type,source,refCode,propertyId,clientId,tenantId,landlordId,contractId,shared,fileUrl,createdAt}>' },
      },
      {
        name: 'documents.update', method: 'POST', path: '/documents.update',
        tier: 1, side_effects: 'writes:documents,activityLog',
        input: { id: 'string', name: 'string?', type: 'enum?', category: 'string?', tags: 'string[]?', shared: 'boolean?', pinned: 'boolean?', order: 'number?', status: 'active|archived?', notes: 'string?', userId: 'string?', propertyId: 'string?', clientId: 'string?', tenantId: 'string?', landlordId: 'string?', contractId: 'string?', lang: 'IT|EN?', refCode: 'string?' },
        output: { id: 'string', updated: 'string[]' },
      },
      {
        name: 'magicsign.create', method: 'POST', path: '/magicsign.create',
        tier: 2, side_effects: 'writes:signRequests,activityLog',
        input: { title: 'string', pdfUrl: 'https-url', pageCount: 'number', fields: 'array<{page,kind,role,xr,yr,wr,hr}>', signers: '{tenant?,landlord?}', contractId: 'string?', leadId: 'string?' },
        output: { id: 'string', signLinks: '{tenant?,landlord?}' },
      },
      {
        name: 'radar.scan', method: 'POST', path: '/radar.scan',
        tier: 1, side_effects: 'writes:leads,radarSearches,activityLog',
        input: { id: 'string?' },
        output: { scanned: 'number', totalNew: 'number', totalDrops: 'number', results: 'array' },
      },
      {
        name: 'state.snapshot', method: 'POST', path: '/state.snapshot',
        tier: 1, side_effects: 'none (read-only)',
        input: { scope: 'all|leads|contracts|payments|agenda?' },
        output: { ts: 'iso', leads: 'object?', contracts: 'object?', payments: 'object?', agenda: 'object?', actionQueue: 'object?' },
      },
      {
        name: 'risk.scan', method: 'POST', path: '/risk.scan',
        tier: 1, side_effects: 'none (read-only)',
        input: { window: 'number? (days-ahead horizon, default 60)' },
        output: { generatedAt: 'iso', counts: '{high,med,total}', items: 'array<{sev,cat,title,detail,days,ref}>' },
      },
      {
        name: 'compliance.scan', method: 'POST', path: '/compliance.scan',
        tier: 1, side_effects: 'none (read-only)',
        input: { window: 'number? (due-soon horizon days, default 14)' },
        output: { generatedAt: 'iso', counts: '{high,med,total}', items: 'array<{sev,cat,title,detail,days,ref,code,owner}>' },
      },
      {
        name: 'relet.scan', method: 'POST', path: '/relet.scan',
        tier: 1, side_effects: 'none (read-only)',
        input: { window: 'number? (horizon days, default 90)' },
        output: { generatedAt: 'iso', counts: '{expiring,urgent,matched,uncovered}', incomeAtRisk: 'number', vacancyExposure: 'number', plans: 'array<{contractId,label,zone,rent,daysToEnd,status,matchCount,strongMatches,estDaysToLet,vacancyRisk,topMatches}>' },
      },
      {
        name: 'digest', method: 'POST', path: '/digest',
        tier: 1, side_effects: 'read-only + optional email send',
        input: { email: 'string? (send the briefing there)', window: 'number? (risk horizon days, default 60)' },
        output: { generatedAt: 'iso', summary: '{leadsNew,pendingNew,gradeA,risksHigh,risksMed}', text: 'string', html: 'string', sent: 'object?' },
      },
      {
        name: 'context.push', method: 'POST', path: '/context.push',
        tier: 1, side_effects: 'writes:operatorContext,activityLog',
        input: { day: 'YYYY-MM-DD?', observations: 'string?', habits: 'object?', whatsapp: 'object? ({conversations,needingReply,avgResponseMin,topics[]...})', painPoints: 'string[]?', wins: 'string[]?', notes: 'string?' },
        output: { day: 'string', saved: 'string[]' },
      },
      {
        name: 'context.pack', method: 'POST', path: '/context.pack',
        tier: 1, side_effects: 'none (read-only)',
        input: { days: 'number? (operator-context days, default 7)', window: 'number? (rhythm lookback days, default 14)' },
        output: { generatedAt: 'iso', operator: 'array<day-doc>', rhythm: 'object', state: 'object', homie: 'object', text: 'string (paste-able Italian grounding block)' },
      },
      {
        name: 'ai.reply', method: 'POST', path: '/ai.reply',
        tier: 1, side_effects: 'draft-only (calls Claude; does not send)',
        input: { leadId: 'string?', lead: 'object?', tone: 'warm|professional|concise?', language: 'it|en?', goal: 'string?' },
        output: { subject: 'string', body: 'string', language: 'string', usage: 'object?' },
      },
      {
        name: 'execute', method: 'POST', path: '/execute',
        tier: 2, side_effects: 'runs the dispatched tool + writes:action_queue',
        input: { id: 'string (action_queue doc id)', override: 'object?' },
        output: { id: 'string', status: 'executed|failed', result: 'object' },
      },
      {
        name: 'heartbeat', method: 'POST', path: '/heartbeat',
        tier: 0, side_effects: 'writes:heartbeat/mac',
        input: { status: 'live|busy|idle?', activeTool: 'string?', lastEvent: 'string?', queueLen: 'number?', model: 'string?' },
        output: { lastSeenAt: 'iso' },
      },
      {
        name: 'spec', method: 'GET', path: '/spec',
        tier: 0, side_effects: 'none',
        input: {}, output: 'this document',
      },
    ],
    // Sibling endpoints (existing) that Homie should also know about:
    related: {
      inbound: { method: 'POST', path: '/api/homie/inbound', note: 'Direct lead ingestion path (e.g. intake form forwarder). Same effect as agent.leads.create, kept for backwards-compatibility.' },
      action: { method: 'POST', path: '/api/homie/action', note: 'Proposes an action into action_queue (status=pending). Use execute later to apply.' },
      message: {
        method: 'POST', path: '/api/homie/message',
        tier: 1, side_effects: 'writes:conversations,messages,activityLog',
        note: 'Feed ONE WhatsApp/email message into the portal Inbox. Idempotent on messageId. Resolves the contact by contactType+contactId or by phone (auto-matches leads/tenants/landlords/pfs/clients, else creates a standalone WhatsApp contact). Optional analysis{summary,intent,needsReply,urgency,suggestedReply} surfaces in the Inbox as the 🤖 Homie banner + "da rispondere" flag.',
        input: { direction: 'in|out|note', body: 'string', channel: 'whatsapp|email|note?', contactType: 'enum?', contactId: 'string?', phone: 'string?', email: 'string?', name: 'string?', messageId: 'string? (idempotency)', timestamp: 'iso?', mediaUrls: 'string[]?', analysis: '{summary?,intent?,needsReply?,urgency?,suggestedReply?}?' },
        output: { conversationId: 'string', messageId: 'string', created: 'boolean', dedupHit: 'boolean?' },
      },
      inboxSync: {
        method: 'POST', path: '/api/homie/inbox-sync',
        tier: 1, side_effects: 'writes:conversations,activityLog',
        note: 'Reconciliation pass after scanning ALL of WhatsApp. Batch-updates conversation status/needsReply/urgency/aiSummary/suggestedReply/tags. Does NOT append messages (use /api/homie/message). Address each by conversationId, contactType+contactId, or phone.',
        input: { updates: 'array<{conversationId?,contactType?,contactId?,phone?,status?,needsReply?,urgency?,aiSummary?,suggestedReply?,tags?}>' },
        output: { updated: 'number', skipped: 'number', results: 'array' },
      },
    },
  });
}
