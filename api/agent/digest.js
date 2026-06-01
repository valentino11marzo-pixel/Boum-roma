// api/agent/digest.js — Tool: agent.digest  (Tier 1, read-only + optional email)
//
// One compact daily briefing combining state.snapshot + risk.scan, ready for
// Homie to post on Telegram or for a morning email. If `email` is provided
// (and Gmail env is set), it also sends the digest.
//
// Body: {
//   email?:  string     if present, send the digest there (Nodemailer)
//   window?: number      risk horizon days (default 60)
// }
//
// Output: { generatedAt, text, html, summary:{leadsNew,pending,risksHigh,...}, sent? }

import { fsList, sendEmail, logActivity, guardPost, okJson, errJson } from './_lib.js';

function daysUntil(d) {
  if (!d) return null;
  const t = typeof d === 'string' ? Date.parse(d) : (d?.getTime ? d.getTime() : d);
  return isNaN(t) ? null : Math.round((t - Date.now()) / 86400000);
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const horizon = typeof body.window === 'number' ? body.window : 60;

  try {
    const [leads, contracts, payments, properties] = await Promise.all([
      fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 80 }),
      fsList('contracts', { limit: 200 }),
      fsList('payments', { limit: 300 }),
      fsList('properties', { limit: 200 }),
    ]);
    const propById = {}; properties.forEach(p => { propById[p.id] = p; });
    const now = Date.now();
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);

    // Leads
    const newToday = leads.filter(l => l.createdAt && Date.parse(l.createdAt) >= startToday.getTime()).length;
    const pendingNew = leads.filter(l => !l.status || l.status === 'new').length;
    const gradeA = leads.filter(l => (!l.status || l.status === 'new') && l.grade === 'A').length;

    // Risks (mirror of risk.scan, condensed)
    let risksHigh = 0, risksMed = 0; const top = [];
    const pushRisk = (sev, label) => { if (sev === 'high') risksHigh++; else risksMed++; if (top.length < 8) top.push((sev === 'high' ? '🔴 ' : '🟠 ') + label); };
    const propLabel = (c) => { const p = propById[c.propertyId]; return (p && (p.title || p.name)) || c.propertyName || c.propertyId || 'Contratto'; };
    for (const c of contracts) {
      if (['expired', 'terminated', 'draft'].includes(c.status)) continue;
      const d = daysUntil(c.endDate);
      if (d == null) continue;
      if (d < 0) pushRisk('high', `${propLabel(c)} — contratto scaduto da ${Math.abs(d)}gg`);
      else if (d <= 30) pushRisk('high', `${propLabel(c)} — scade tra ${d}gg`);
      else if (d <= horizon) pushRisk('med', `${propLabel(c)} — scade tra ${d}gg`);
      if (c.status === 'active' && (!c.tenantSignature || !c.landlordSignature)) pushRisk('high', `${propLabel(c)} — firma mancante`);
    }
    for (const p of payments) {
      if (['paid', 'cancelled'].includes(p.status)) continue;
      const due = p.dueDate ? Date.parse(p.dueDate) : null;
      if (due && due < now) { const late = Math.round((now - due) / 86400000); pushRisk(late > 7 ? 'high' : 'med', `${p.tenantName || 'Pagamento'} — €${(p.amount || 0).toLocaleString('it-IT')} in ritardo ${late}gg`); }
    }

    const summary = { leadsNew: newToday, pendingNew, gradeA, risksHigh, risksMed };
    const dateStr = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

    const textLines = [
      `BOOM Roma · Briefing ${dateStr}`,
      ``,
      `📨 Lead: ${newToday} nuovi oggi · ${pendingNew} in attesa${gradeA ? ` · ${gradeA} grade A` : ''}`,
      `🎯 Rischi: ${risksHigh} urgenti · ${risksMed} da seguire`,
      ``,
      ...(top.length ? ['Top priorità:', ...top.map(t => '· ' + t)] : ['Nessun rischio aperto ✅']),
    ];
    const text = textLines.join('\n');
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#08080A;color:#D4AF37;padding:18px 22px;border-radius:10px 10px 0 0"><strong style="font-size:18px;letter-spacing:1px">BOOM Roma</strong><div style="color:#999;font-size:13px">Briefing · ${dateStr}</div></div>
      <div style="border:1px solid #eee;border-top:none;padding:18px 22px;border-radius:0 0 10px 10px">
        <p style="font-size:15px"><strong>📨 Lead:</strong> ${newToday} nuovi oggi · ${pendingNew} in attesa${gradeA ? ` · <span style="color:#B8960C">${gradeA} grade A</span>` : ''}</p>
        <p style="font-size:15px"><strong>🎯 Rischi:</strong> ${risksHigh} urgenti · ${risksMed} da seguire</p>
        ${top.length ? `<p style="font-weight:bold;margin-top:16px">Top priorità</p><ul style="line-height:1.7;font-size:14px;color:#333">${top.map(t => `<li>${t.replace(/^🔴 |^🟠 /, '')}</li>`).join('')}</ul>` : '<p style="color:#2a8">Nessun rischio aperto ✅</p>'}
      </div></div>`;

    let sent = null;
    if (body.email) {
      try { const r = await sendEmail({ to: body.email, subject: `BOOM Roma · Briefing ${dateStr}`, html, text }); sent = { ok: true, messageId: r.messageId }; }
      catch (e) { sent = { ok: false, error: e.message }; }
    }

    await logActivity('Digest generato (agent)', 'agent', summary);
    return okJson(res, { generatedAt: new Date().toISOString(), summary, text, html, sent });
  } catch (e) { return errJson(res, 500, e.message); }
}
