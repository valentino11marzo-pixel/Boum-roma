// api/viewings/status.js — PUBLIC, sanitized viewing-status lookup.
//
// book.html creates its viewingRequests doc anonymously (rules allow create),
// then needs to watch it for the admin's confirmation — but reads on
// viewingRequests are admin-only, so a direct Firestore poll from the public
// page silently fails. This endpoint resolves the doc under admin credentials
// and returns ONLY what the confirmation screen needs: no email, no phone,
// no notes. The unguessable Firestore auto-ID acts as the access token
// (same posture as the magic-sign token lookup).
//
// Body: { id }  →  { ok, status, confirmedDateTime, listingName, listingZone,
//                    meetingPoint, passSentUrl }

import { fsGet } from "../homie/_lib.js";

const ALLOWED_ORIGINS = new Set([
  "https://boomrome.com",
  "https://www.boomrome.com",
]);

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const id = String((req.body && req.body.id) || "").trim();
  if (!id || id.length > 64 || /[\/#?%]/.test(id)) {
    return res.status(400).json({ ok: false, error: "bad_id" });
  }

  try {
    const v = await fsGet(`viewingRequests/${id}`);
    if (!v) return res.status(404).json({ ok: false, error: "not_found" });
    return res.status(200).json({
      ok: true,
      status: v.status || "pending",
      confirmedDateTime: v.confirmedDateTime || null,
      listingName: v.listingName || v.propertyName || "",
      listingZone: v.listingZone || "",
      meetingPoint: v.meetingPoint || null,
      passSentUrl: v.passSentUrl || null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
