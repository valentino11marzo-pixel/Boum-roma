// api/pass-issue.js — admin-only: issue a SIGNED .pkpass from a live record.
// Unlike /api/generate-pass (manual data), this loads the current data from
// Firestore (contract / viewing / user) so the issued pass is always fresh and
// linked — meaning it can also receive live updates via the web service.
//
// Auth: X-Firebase-Token (admin browser, from Pass Studio) OR X-Homie-Secret.
// Body: { type, entityId }            → load live data + sign
//   or: { type, data }                → sign explicit data (passthrough)
// Returns: binary application/vnd.apple.pkpass

import { guardPost } from "./agent/_lib.js";
import { buildAndSign } from "./generate-pass.js";
import { loadPassData } from "./_passkit.js";

const VALID = new Set(["tenant", "silver", "landlord", "viewing", "referral"]);

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const type = String(body.type || "");
  if (!VALID.has(type)) return res.status(400).json({ ok: false, error: "invalid_type" });

  try {
    let data;
    if (body.entityId) data = await loadPassData(type, String(body.entityId));
    else if (body.data && typeof body.data === "object") data = body.data;
    else return res.status(400).json({ ok: false, error: "entityId_or_data_required" });

    const { buffer, passJson } = buildAndSign(type, data);
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename=boom-${type}-${String(passJson.serialNumber).slice(-12)}.pkpass`);
    res.setHeader("X-Pass-Serial", passJson.serialNumber);
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(e.message && e.message.endsWith("_not_found") ? 404 : 500).json({ ok: false, error: e.message });
  }
}
