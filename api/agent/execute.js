// api/agent/execute.js — Executor for action_queue items  (Tier 2 closer)
//
// This is the CLOSER. When the operator approves a pending action — from
// Telegram (/approva 7f3), from the Cockpit Action Queue panel, or from the
// portal's Command Center — they call this endpoint with the action id.
// We read the action, dispatch it to the right tool (messages.send,
// viewings.schedule, leads.update, magicsign.create), mark the action as
// 'executed' with the tool response captured, and log.
//
// Body: { id: string, override?: object }
//   - id:       action_queue document id
//   - override: optional partial payload to merge over action.payload
//               (e.g. operator-edited reply body before approving)
//
// Idempotent: an action already 'executed', 'rejected' or 'failed' returns
// the cached result without re-running.

import { fsGet, fsPatch, logActivity, guardPost, okJson, errJson } from './_lib.js';

// Tool dispatch table — kind → { module path, payload-to-args transform }
const DISPATCH = {
  reply: {
    module: './messages.send.js',
    build: (action, override) => {
      const p = { ...(action.payload || {}), ...(override || {}) };
      return {
        channel: p.channel || 'email',
        leadId: action.leadId || p.leadId,
        to: p.to || p.recipient,
        phone: p.phone,
        subject: p.subject || (p.draft ? p.draft.split('\n')[0].slice(0, 80) : 'Risposta'),
        body: p.body || p.draft,
        html: p.html,
      };
    },
  },
  schedule_viewing: {
    module: './viewings.schedule.js',
    build: (action, override) => {
      const p = { ...(action.payload || {}), ...(override || {}) };
      return {
        leadId: action.leadId,
        propertyId: p.propertyId,
        propertyName: p.propertyName,
        slots: p.proposedSlots || p.slots || [],
        notes: p.notes,
      };
    },
  },
  qualify: {
    module: './leads.update.js',
    build: (action, override) => {
      const p = { ...(action.payload || {}), ...(override || {}) };
      return {
        id: action.leadId,
        qualification: p.qualification || p.questions || null,
        grade: p.grade,
        notes: p.notes,
      };
    },
  },
  archive: {
    module: './leads.update.js',
    build: (action, override) => {
      const p = { ...(action.payload || {}), ...(override || {}) };
      return {
        id: action.leadId,
        status: 'discarded',
        discardedReason: p.reason || 'archived by agent',
      };
    },
  },
  note: {
    module: './leads.update.js',
    build: (action, override) => {
      const p = { ...(action.payload || {}), ...(override || {}) };
      return { id: action.leadId, notes: p.text || p.note || action.summary };
    },
  },
  // 'other' has no automatic dispatch — operator must handle manually
};

// Call a sibling tool handler in-process. Fakes the (req, res) interface so
// each tool stays callable as a standalone Vercel function AND as a library.
async function callTool(modulePath, payload) {
  const mod = await import(modulePath);
  const handler = mod.default;
  let captured = { status: 0, body: null };
  const fakeReq = {
    method: 'POST',
    body: payload,
    headers: { 'x-homie-secret': process.env.HOMIE_SECRET || '' },
    on: () => {},
  };
  const fakeRes = {
    status(c) { captured.status = c; return this; },
    json(b)   { captured.body = b; return this; },
    setHeader() {},
    end() { return this; },
  };
  await handler(fakeReq, fakeRes);
  return captured;
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const id = String(body.id || '').trim();
  if (!id) return errJson(res, 400, 'id required');

  const action = await fsGet(`action_queue/${id}`);
  if (!action) return errJson(res, 404, 'action_not_found');

  // Idempotency
  if (['executed', 'rejected', 'failed'].includes(action.status)) {
    return okJson(res, { id, status: action.status, cached: true, result: action.executionResult || null });
  }

  const dispatch = DISPATCH[action.kind];
  if (!dispatch) {
    await fsPatch(`action_queue/${id}`, {
      status: 'failed', failedAt: new Date(),
      executionError: `no dispatcher for kind=${action.kind}`,
    });
    return errJson(res, 422, `no_executor_for_kind:${action.kind}`);
  }

  const args = dispatch.build(action, body.override);
  let toolResult;
  try {
    toolResult = await callTool(dispatch.module, args);
  } catch (e) {
    await fsPatch(`action_queue/${id}`, {
      status: 'failed', failedAt: new Date(), executionError: e.message,
    });
    await logActivity('Azione fallita (executor)', 'agent', { actionId: id, kind: action.kind, error: e.message });
    return errJson(res, 500, 'executor_threw', e.message);
  }

  const success = toolResult.status === 200 && toolResult.body?.ok;
  await fsPatch(`action_queue/${id}`, {
    status: success ? 'executed' : 'failed',
    executedAt: success ? new Date() : null,
    failedAt: success ? null : new Date(),
    executionResult: toolResult.body || null,
    executionError: success ? null : (toolResult.body?.error || `tool_status_${toolResult.status}`),
    executedBy: 'agent-executor',
  });

  await logActivity(success ? 'Azione eseguita (executor)' : 'Azione fallita (executor)', 'agent',
    { actionId: id, kind: action.kind, leadId: action.leadId, status: toolResult.status });

  if (!success) return errJson(res, 502, 'tool_failed', toolResult.body);
  return okJson(res, { id, status: 'executed', result: toolResult.body });
}
