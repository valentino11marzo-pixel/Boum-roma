// api/get-ip.js
// Returns the caller's IP address for inclusion in the Magic Sign audit
// trail. Read-only, no body, no auth — exposes only what every server
// already sees in its access logs.
//
// Response: { ip, ua, ts } where ip is best-effort extracted from
// proxy headers in the same order Vercel populates them.

const ALLOWED_ORIGINS = new Set([
  "https://boomrome.com",
  "https://www.boomrome.com",
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET")      { res.status(405).json({ error: "Method not allowed" }); return; }

  const fwd = (req.headers["x-forwarded-for"] || "").toString();
  const ip = fwd.split(",")[0].trim()
          || req.headers["x-real-ip"]
          || req.headers["cf-connecting-ip"]
          || (req.socket && req.socket.remoteAddress)
          || "unknown";
  const ua = (req.headers["user-agent"] || "").toString().slice(0, 240);

  res.status(200).json({ ip, ua, ts: new Date().toISOString() });
};
