// api/agent/messages.send.js — Tool: agent.messages.send  (Tier 2)
//
// Sends a message via email (Nodemailer/Gmail) and/or returns a WhatsApp
// deep-link the operator/agent can hand to the user.
//
// Body: {
//   channel:   'email' | 'whatsapp' | 'both'    required
//   to:        string            recipient email (for email) — falls back to lead.email
//   phone:     string            recipient phone (for WhatsApp) — falls back to lead.phone
//   leadId?:   string            if present, lead is fetched and missing to/phone filled in
//   subject?:  string            email subject (required for email)
//   body:      string            plain-text body — also used as WA text
//   html?:     string            optional HTML email body (else <p>body</p>)
//   replace?:  object            simple {{token}} substitutions on body/html/subject
// }
//
// Rate limit: not enforced here (yet). The executor enforces per-action
// uniqueness via action_queue.status so the same approve can't re-send.

import { sendEmail, waLink, fsGet, fsCreate, logActivity, guardPost, okJson, errJson } from './_lib.js';

const VALID_CHANNELS = new Set(['email', 'whatsapp', 'both']);

function applyReplacements(s, replace) {
  if (!s || !replace) return s;
  return String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (replace[k] != null ? replace[k] : `{{${k}}}`));
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const channel = String(body.channel || '').toLowerCase();
  if (!VALID_CHANNELS.has(channel)) return errJson(res, 400, 'channel must be email | whatsapp | both');
  if (!body.body) return errJson(res, 400, 'body required');

  let to = body.to || null, phone = body.phone || null, leadName = null;
  if (body.leadId) {
    const lead = await fsGet(`leads/${body.leadId}`);
    if (lead) {
      if (!to) to = lead.email;
      if (!phone) phone = lead.phone;
      leadName = lead.name;
    }
  }

  const replace = { ...(body.replace || {}), name: leadName || (body.replace && body.replace.name) || '' };
  const subject = applyReplacements(body.subject, replace);
  const text = applyReplacements(body.body, replace);
  const html = applyReplacements(body.html, replace) || `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">${text.replace(/\n/g, '<br>')}</p>`;

  const out = { channel };
  try {
    if (channel === 'email' || channel === 'both') {
      if (!to) return errJson(res, 400, 'to (email) required for email channel');
      if (!subject) return errJson(res, 400, 'subject required for email');
      const r = await sendEmail({ to, subject, html, text });
      out.email = { sent: true, messageId: r.messageId, to };
    }
    if (channel === 'whatsapp' || channel === 'both') {
      if (!phone) return errJson(res, 400, 'phone required for whatsapp channel');
      out.whatsapp = { url: waLink(phone, text), to: phone };
    }
    // Persist a small message-log entry so the cockpit can show "Homie ha
    // risposto a Anna B." in the activity timeline.
    await fsCreate('messageLog', {
      channel, leadId: body.leadId || null, to, phone,
      subject: subject || null, body: text,
      actor: 'agent', createdAt: new Date(),
    }).catch(() => {});
    await logActivity('Messaggio inviato (agent)', 'message', { channel, to: to || phone, leadId: body.leadId || null });
    return okJson(res, out);
  } catch (e) { return errJson(res, 500, e.message); }
}
