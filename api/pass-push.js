// api/pass-push.js — trigger a live update of a Wallet pass.
// Any BOOM system can call this when data changes (Stripe "rent paid",
// reminder-cron, Homie, the portal, the Compliance OS) and every device
// holding the pass refreshes via APNs.
//
// Auth: X-Homie-Secret (servers/cron) OR X-Firebase-Token (admin browser).
// Body: { serial }                    e.g. "tenant-<contractId>"
//   or: { type, entityId }            e.g. { type:"tenant", entityId:"<contractId>" }
//   or: { type, contractId|viewingId|landlordId }
// Returns: { ok, serial, devices, sent, errors }

import { guardPost } from "./agent/_lib.js";
import { pushPass } from "./_passkit.js";

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  let serial = body.serial;
  if (!serial && body.type) {
    const id = body.entityId || body.contractId || body.viewingId || body.landlordId || body.referrerId;
    if (id) serial = `${body.type}-${id}`;
  }
  if (!serial) return res.status(400).json({ ok: false, error: "serial_or_type_id_required" });

  try {
    const result = await pushPass(String(serial));
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
