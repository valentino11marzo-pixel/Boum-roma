// api/agent/context.pack.js — Tool: agent.context.pack  (Tier 1, read-only)
//
// The operator context pack: ONE call that compiles everything a planning
// session (Claude Code, or Homie answering "come sta andando?") needs to know
// about how BOOM is actually being operated:
//
//   operator — Homie's daily observations (operatorContext, via context.push)
//   rhythm   — the real working rhythm mined from activityLog (who acts,
//              on what, at which hours of the day, Europe/Rome)
//   state    — compact portal numbers (leads / contracts / payments / queue)
//   homie    — heartbeat status + which agent tools actually got used
//   text     — a paste-able Italian summary of all of the above, so the
//              operator can drop it into any Claude session as grounding
//
// Body: { days?: number (operator-context days, default 7, max 30),
//         window?: number (rhythm lookback days, default 14, max 30) }
//
// Auth: X-Homie-Secret (Mac) or X-Firebase-Token (admin browser) — guardPost.

import { fsGet, fsList, guardPost, okJson, errJson } from './_lib.js';

const ts = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return isNaN(t) ? null : t; };
const romePart = (iso, opts) => {
  const t = ts(iso); if (t == null) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', ...opts }).format(new Date(t));
};
const bump = (obj, key) => { if (key != null) obj[key] = (obj[key] || 0) + 1; };
const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const opDays = Math.min(Math.max(Number(body.days) || 7, 1), 30);
  const window = Math.min(Math.max(Number(body.window) || 14, 1), 30);

  try {
    const [ctxDocs, logs, leads, contracts, payments, queue, hb] = await Promise.all([
      fsList('operatorContext', { orderBy: { field: 'day', direction: 'DESCENDING' }, limit: opDays + 2 }).catch(() => []),
      fsList('activityLog', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 500 }).catch(() => []),
      fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 50 }).catch(() => []),
      fsList('contracts', { limit: 100 }).catch(() => []),
      fsList('payments', { limit: 100 }).catch(() => []),
      fsList('action_queue', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 50 }).catch(() => []),
      fsGet('heartbeat/mac').catch(() => null),
    ]);

    // ── operator: Homie's daily observations ─────────────────────────────
    const operator = ctxDocs.filter(d => d.id !== 'latest').slice(0, opDays);

    // ── rhythm: mine activityLog for the real working pattern ────────────
    const cutoff = Date.now() - window * 86400000;
    const recent = logs.filter(l => { const t = ts(l.createdAt); return t != null && t >= cutoff; });
    const byCategory = {}, byActor = {}, byHour = {}, byWeekday = {}, byAction = {};
    for (const l of recent) {
      bump(byCategory, l.category || 'other');
      bump(byActor, l.actor || 'unknown');
      bump(byHour, romePart(l.createdAt, { hour: '2-digit', hour12: false }));
      bump(byWeekday, romePart(l.createdAt, { weekday: 'short' }));
      bump(byAction, l.action || '?');
    }
    const rhythm = {
      windowDays: window,
      events: recent.length,
      byCategory, byActor,
      peakHoursRome: top(byHour, 5).map(([h, n]) => ({ hour: h, events: n })),
      byWeekday,
      topActions: top(byAction, 10).map(([a, n]) => ({ action: a, count: n })),
      truncated: logs.length >= 500 ? 'activityLog sample capped at 500 rows — oldest days may be undercounted' : null,
    };

    // ── state: compact portal numbers ─────────────────────────────────────
    const todayRome = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    const now = Date.now();
    const overdue = payments.filter(p => p.status === 'pending' && p.dueDate && ts(p.dueDate) < now);
    const leadSources = {};
    leads.forEach(l => bump(leadSources, l.source || 'unknown'));
    const state = {
      leads: {
        sample30d: leads.length,
        newToday: leads.filter(l => (l.createdAt || '').slice(0, 10) === todayRome).length,
        pendingNew: leads.filter(l => !l.status || l.status === 'new').length,
        topSources: top(leadSources, 6).map(([s, n]) => ({ source: s, count: n })),
      },
      contracts: {
        active: contracts.filter(c => c.status === 'active').length,
        draft: contracts.filter(c => c.status === 'draft').length,
        unsigned: contracts.filter(c => !c.landlordSignature || !c.tenantSignature).length,
      },
      payments: {
        pending: payments.filter(p => p.status === 'pending').length,
        overdue: overdue.length,
        overdueAmount: overdue.reduce((s, p) => s + (p.amount || 0), 0),
      },
      actionQueue: { pending: queue.length },
    };

    // ── homie: is the Mac agent alive, and what does it actually use ─────
    const lastSeen = hb ? ts(hb.lastSeenAt || hb.lastPingAt) : null;
    const homieActions = {};
    recent.filter(l => l.actor === 'homie').forEach(l => bump(homieActions, l.action || '?'));
    const homie = {
      status: hb?.status || 'unknown',
      lastSeenMinAgo: lastSeen ? Math.round((Date.now() - lastSeen) / 60000) : null,
      model: hb?.model || null,
      toolsUsed: top(homieActions, 10).map(([a, n]) => ({ action: a, count: n })),
    };

    // ── text: paste-able Italian grounding block ──────────────────────────
    const L = [];
    L.push(`CONTEXT PACK · BOOM · ${new Date().toISOString()}`);
    L.push('');
    L.push(`— OPERATORE (osservazioni Homie, ultimi ${opDays}g: ${operator.length} giorni presenti) —`);
    if (!operator.length) L.push('Nessuna osservazione ancora: Homie non ha mai chiamato context.push.');
    for (const d of operator.slice(0, 7)) {
      const bits = [];
      if (d.observations) bits.push(d.observations.slice(0, 400));
      if (d.whatsapp) bits.push(`WhatsApp: ${JSON.stringify(d.whatsapp).slice(0, 200)}`);
      if (d.painPoints?.length) bits.push(`Frizioni: ${d.painPoints.slice(0, 5).join(' · ')}`);
      if (d.wins?.length) bits.push(`Vittorie: ${d.wins.slice(0, 5).join(' · ')}`);
      L.push(`${d.day}: ${bits.join(' | ') || (d.notes || '').slice(0, 300) || '—'}`);
    }
    L.push('');
    L.push(`— RITMO (activityLog, ${window}g, ${recent.length} eventi) —`);
    L.push(`Attori: ${top(byActor, 5).map(([a, n]) => `${a} ${n}`).join(', ') || '—'}`);
    L.push(`Categorie: ${top(byCategory, 8).map(([c, n]) => `${c} ${n}`).join(', ') || '—'}`);
    L.push(`Ore di punta (Roma): ${rhythm.peakHoursRome.map(h => `${h.hour}:00 (${h.events})`).join(', ') || '—'}`);
    L.push('');
    L.push('— STATO PORTALE —');
    L.push(`Lead: ${state.leads.newToday} nuovi oggi, ${state.leads.pendingNew} da gestire. Fonti: ${state.leads.topSources.map(s => `${s.source} ${s.count}`).join(', ') || '—'}`);
    L.push(`Contratti: ${state.contracts.active} attivi, ${state.contracts.draft} bozze, ${state.contracts.unsigned} con firme mancanti.`);
    L.push(`Pagamenti: ${state.payments.pending} pending, ${state.payments.overdue} scaduti (€${state.payments.overdueAmount}).`);
    L.push(`Azioni in coda (da approvare): ${state.actionQueue.pending}.`);
    L.push('');
    L.push('— HOMIE —');
    L.push(`Stato: ${homie.status}${homie.lastSeenMinAgo != null ? `, visto ${homie.lastSeenMinAgo} min fa` : ''}${homie.model ? `, modello ${homie.model}` : ''}.`);
    L.push(`Azioni registrate (${window}g): ${homie.toolsUsed.map(t => `${t.action} ×${t.count}`).join(', ') || 'nessuna — Homie osserva ma non agisce.'}`);

    return okJson(res, {
      generatedAt: new Date().toISOString(),
      operator, rhythm, state, homie,
      text: L.join('\n'),
    });
  } catch (e) { return errJson(res, 500, e.message); }
}
