// api/notify-viewing-created.js
// Receives a viewing-created event from book.html (or any public form) and
// sends an admin notification email via EmailJS REST API. Lightweight.
//
// Body shape: { viewingId, clientName, clientEmail, clientPhone,
//               listingName, requestedDate, requestedTime, notes }
//
// Returns 200 unconditionally on shape success — failures are logged.

const ALLOWED_ORIGINS = new Set([
  "https://boomrome.com",
  "https://www.boomrome.com",
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  const safe = (k) => (body[k] || "—").toString().slice(0, 200);

  const subject = `[BOOM] Nuovo viewing — ${safe("clientName")} @ ${safe("listingName")} — ${safe("requestedDate")}`;
  const messageBody =
    `Action: CREATED\n\n` +
    `Cliente: ${safe("clientName")} (${safe("clientEmail")} / ${safe("clientPhone")})\n` +
    `Property: ${safe("listingName")}\n` +
    `Requested: ${safe("requestedDate")} ${safe("requestedTime")}\n` +
    `Notes: ${safe("notes")}\n\n` +
    `Portal link: https://boomrome.com/portal.html#/viewings\n\n— BOOM Auto-notify`;

  // Send via EmailJS REST API (no SDK, no env-side keys exposure)
  try {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: "service_74n80th",
        template_id: "boom_notification",
        user_id: "dnMxbtS2qDm_o7SHE",
        accessToken: process.env.EMAILJS_PRIVATE_KEY || undefined,
        template_params: {
          to_email: "valentino@boom-rome.com",
          from_name: "BOOM Portal",
          reply_to: body.clientEmail || "noreply@boomrome.com",
          heading: "📥 Nuovo viewing",
          subheading: safe("listingName"),
          name: "Valentino",
          intro: subject,
          card_title: "VIEWING REQUEST",
          card_color: "#D4AF37",
          r1_icon: "👤", r1_label: "Cliente", r1_value: `${safe("clientName")} · ${safe("clientPhone")}`,
          r2_icon: "📧", r2_label: "Email", r2_value: safe("clientEmail"),
          r3_icon: "🏠", r3_label: "Property", r3_value: safe("listingName"),
          r4_icon: "📅", r4_label: "Requested", r4_value: `${safe("requestedDate")} ${safe("requestedTime")}`,
          closing: messageBody,
          cta_text: "Apri portal →",
          portal_link: "https://boomrome.com/portal.html",
        },
      }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[notify-viewing-created] EmailJS HTTP", r.status, text);
      return res.status(200).json({ ok: false, reason: "emailjs-failed" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[notify-viewing-created] error:", err.message);
    return res.status(200).json({ ok: false, reason: err.message });
  }
}
