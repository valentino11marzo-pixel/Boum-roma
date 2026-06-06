// api/my-pass.js — PUBLIC, token-authenticated "Add to Apple Wallet" link.
// A customer taps a link → gets THEIR pass (rebuilt live from Firestore),
// no login. The token is the pass's own authenticationToken, so the link is
// unguessable and tied to that exact pass.
//
//   GET /api/my-pass?type=tenant&id=<contractId>&t=<authToken>
//
// Use: build links with t = generateAuthToken(id) (server-side) and send them
// by email / WhatsApp, or render the official "Add to Apple Wallet" badge.

import { buildAndSign, generateAuthToken } from "./generate-pass.js";
import { loadPassData } from "./_passkit.js";

const VALID = new Set(["tenant", "silver", "landlord", "viewing", "referral"]);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  const type = String(req.query.type || "tenant");
  const id = String(req.query.id || req.query.c || "");
  const t = String(req.query.t || "");

  if (!VALID.has(type) || !id) return res.status(400).json({ error: "bad_request" });
  if (!t || t !== generateAuthToken(id)) return res.status(401).json({ error: "invalid_token" });

  try {
    const data = await loadPassData(type, id);
    const { buffer } = buildAndSign(type, data);
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename=boom-${type}.pkpass`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(e.message && e.message.endsWith("_not_found") ? 404 : 500).json({ error: e.message });
  }
}
