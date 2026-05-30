// api/agent/viewings.schedule.js — Tool: agent.viewings.schedule  (Tier 2)
//
// Creates a viewingRequests doc with one or more proposed slots. The portal
// + cockpit already render this collection (S.viewingRequests, "Viewings"
// page). When the user accepts a slot, the existing UI handles the rest.
//
// Body: {
//   leadId?:     string
//   clientId?:   string
//   propertyId?: string   // strongly recommended
//   propertyName?: string
//   name?:       string   // visitor name (fallback if no leadId)
//   email?:      string
//   phone?:      string
//   slots:       string[] // ISO datetimes, at least 1, max 5
//   notes?:      string
//   language?:   'it' | 'en'
// }

import { fsCreate, fsGet, logActivity, guardPost, okJson, errJson } from './_lib.js';

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const slots = Array.isArray(body.slots) ? body.slots.filter(Boolean).slice(0, 5) : [];
  if (slots.length === 0) return errJson(res, 400, 'slots[] required (>=1)');
  for (const s of slots) { if (isNaN(new Date(s).getTime())) return errJson(res, 400, 'slots must be ISO dates'); }

  let name = body.name, email = body.email, phone = body.phone;
  if (body.leadId) {
    const lead = await fsGet(`leads/${body.leadId}`);
    if (lead) { name = name || lead.name; email = email || lead.email; phone = phone || lead.phone; }
  }

  const doc = {
    leadId: body.leadId || null,
    clientId: body.clientId || null,
    propertyId: body.propertyId || null,
    propertyName: body.propertyName || null,
    name: name || null, email: email || null, phone: phone || null,
    proposedSlots: slots,
    scheduledAt: slots[0],          // default to first slot for "today's viewings" filter
    status: 'pending',
    notes: body.notes || null,
    language: body.language || null,
    createdBy: 'agent',
    createdAt: new Date(),
  };

  try {
    const { id } = await fsCreate('viewingRequests', doc);
    await logActivity('Viewing proposto (agent)', 'viewing', { id, propertyId: doc.propertyId, slots: slots.length });
    return okJson(res, { id });
  } catch (e) { return errJson(res, 500, e.message); }
}
