// api/agent/state.snapshot.js — Tool: agent.state.snapshot  (Tier 1, read-only)
//
// Returns a compact view of the portal state so Homie can answer questions
// on Telegram ("quanti lead oggi?", "quali contratti scadono?") without
// holding its own copy of Firestore. POST so we share the secret guard.
//
// Body: { scope?: 'all' | 'leads' | 'contracts' | 'payments' | 'agenda' }
//        default 'all'. Numbers are recent slices (last 30d) to keep the
//        response small (<10KB).

import { fsList, guardPost, okJson, errJson } from './_lib.js';

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }
function daysAgoIso(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const scope = body.scope || 'all';

  try {
    const out = { ts: new Date().toISOString() };

    if (scope === 'all' || scope === 'leads') {
      const recent = await fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 50 });
      const today = startOfToday();
      out.leads = {
        total30d: recent.length,
        newToday: recent.filter(l => l.createdAt && l.createdAt >= today && (l.status === 'new' || !l.status)).length,
        pendingNew: recent.filter(l => l.status === 'new' || !l.status).length,
        converted30d: recent.filter(l => l.status === 'converted').length,
        recent: recent.slice(0, 10).map(l => ({
          id: l.id, name: l.name, source: l.source, status: l.status || 'new',
          propertyTitle: l.propertyTitle || null, price: l.propertyPrice || null,
          createdAt: l.createdAt,
        })),
      };
    }

    if (scope === 'all' || scope === 'contracts') {
      const contracts = await fsList('contracts', { limit: 100 });
      const now = Date.now();
      const exp = (c) => c.endDate ? Math.round((new Date(c.endDate).getTime() - now) / 86400000) : null;
      out.contracts = {
        active: contracts.filter(c => c.status === 'active').length,
        draft: contracts.filter(c => c.status === 'draft').length,
        unsigned: contracts.filter(c => !c.landlordSignature || !c.tenantSignature).length,
        expiring60: contracts.filter(c => { const d = exp(c); return d != null && d >= 0 && d <= 60; }).length,
        expiring30: contracts.filter(c => { const d = exp(c); return d != null && d >= 0 && d <= 30; }).length,
      };
    }

    if (scope === 'all' || scope === 'payments') {
      const payments = await fsList('payments', { limit: 100 });
      const now = new Date();
      const overdue = payments.filter(p => p.status === 'pending' && p.dueDate && new Date(p.dueDate) < now);
      out.payments = {
        pending: payments.filter(p => p.status === 'pending').length,
        overdue: overdue.length,
        overdueAmount: overdue.reduce((s, p) => s + (p.amount || 0), 0),
      };
    }

    if (scope === 'all' || scope === 'agenda') {
      const today = startOfToday();
      const upcoming = await fsList('viewingRequests', { limit: 50 });
      out.agenda = {
        todayViewings: upcoming.filter(v => v.scheduledAt && v.scheduledAt.slice(0, 10) === today.slice(0, 10)).length,
        pendingViewings: upcoming.filter(v => v.status === 'pending').length,
      };
    }

    if (scope === 'all') {
      const pending = await fsList('action_queue', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 50 });
      out.actionQueue = { pending: pending.length };
    }

    return okJson(res, out);
  } catch (e) { return errJson(res, 500, e.message); }
}
