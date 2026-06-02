// api/agent/risk.scan.js — Tool: agent.risk.scan  (Tier 1, read-only)
//
// Server-side mirror of the cockpit's Risk Radar. Derives an at-risk list
// from contracts + payments + leads so Homie can answer "cosa è a rischio
// oggi?" on Telegram, or run a daily digest. No new collection — pure
// scoring over existing data.
//
// Body: { window?: number }   days-ahead horizon for expiries (default 60)
//
// Output: { generatedAt, counts:{high,med,total}, items:[{sev,cat,title,detail,days,ref}] }

import { fsList, guardPost, okJson, errJson } from './_lib.js';

function daysUntil(d) {
  if (!d) return null;
  const t = typeof d === 'string' ? Date.parse(d) : (d?.getTime ? d.getTime() : d);
  return isNaN(t) ? null : Math.round((t - Date.now()) / 86400000);
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const horizon = typeof body.window === 'number' ? body.window : 60;

  try {
    const [contracts, payments, leads, properties] = await Promise.all([
      fsList('contracts', { limit: 200 }),
      fsList('payments', { limit: 300 }),
      fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 80 }),
      fsList('properties', { limit: 200 }),
    ]);
    const propById = {};
    properties.forEach(p => { propById[p.id] = p; });
    const propLabel = (c) => {
      const p = propById[c.propertyId];
      return (p && (p.title || p.name || p.nickname)) || c.propertyName || c.propertyTitle || c.propertyId || 'Contratto';
    };

    const items = [];

    // 1) Contract expiries
    for (const c of contracts) {
      if (['expired', 'terminated', 'draft'].includes(c.status)) continue;
      const d = daysUntil(c.endDate);
      if (d == null) continue;
      if (d < 0) items.push({ sev: 'high', cat: 'Contratto scaduto', title: propLabel(c), detail: `Scaduto da ${Math.abs(d)}gg`, days: d, ref: c.id });
      else if (d <= 30) items.push({ sev: 'high', cat: 'Scadenza contratto', title: propLabel(c), detail: `Scade tra ${d}gg`, days: d, ref: c.id });
      else if (d <= horizon) items.push({ sev: 'med', cat: 'Scadenza vicina', title: propLabel(c), detail: `Scade tra ${d}gg`, days: d, ref: c.id });
    }

    // 2) Unsigned contracts
    for (const c of contracts) {
      if (['draft', 'expired', 'terminated'].includes(c.status)) continue;
      const missing = [];
      if (!c.tenantSignature) missing.push('inquilino');
      if (!c.landlordSignature) missing.push('locatore');
      if (missing.length) items.push({ sev: c.status === 'active' ? 'high' : 'med', cat: 'Firma mancante', title: propLabel(c), detail: `Manca: ${missing.join(' + ')}`, days: 0, ref: c.id });
    }

    // 3) Overdue payments
    const now = Date.now();
    for (const p of payments) {
      if (['paid', 'cancelled'].includes(p.status)) continue;
      const due = p.dueDate ? Date.parse(p.dueDate) : null;
      if (due && due < now) {
        const late = Math.round((now - due) / 86400000);
        items.push({ sev: late > 7 ? 'high' : 'med', cat: 'Pagamento in ritardo', title: p.tenantName || p.description || 'Pagamento', detail: `€${(p.amount || 0).toLocaleString('it-IT')} · ${late}gg`, days: -late, ref: p.id });
      }
    }

    // 4) Grade-A leads stale > 24h
    for (const l of leads) {
      if (l.status && l.status !== 'new') continue;
      if (l.grade !== 'A') continue;
      const created = l.createdAt ? Date.parse(l.createdAt) : now;
      const age = now - created;
      if (age > 24 * 3600 * 1000) items.push({ sev: 'med', cat: 'Lead A senza follow-up', title: l.name || 'Lead', detail: `In attesa da ${Math.round(age / 3600000)}h`, days: 0, ref: l.id });
    }

    const rank = { high: 0, med: 1, low: 2 };
    items.sort((a, b) => (rank[a.sev] - rank[b.sev]) || (a.days - b.days));

    return okJson(res, {
      generatedAt: new Date().toISOString(),
      counts: { high: items.filter(i => i.sev === 'high').length, med: items.filter(i => i.sev === 'med').length, total: items.length },
      items,
    });
  } catch (e) { return errJson(res, 500, e.message); }
}
