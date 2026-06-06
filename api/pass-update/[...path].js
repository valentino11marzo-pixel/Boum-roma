// api/pass-update/[...path].js
// The Apple PassKit Web Service. Apple calls this at {webServiceURL}/v1/...
// (webServiceURL = https://boomrome.com/api/pass-update, set in generate-pass.js).
//
// Implements the 5 standard endpoints:
//   POST   /v1/devices/{deviceId}/registrations/{passTypeId}/{serial}   register
//   DELETE /v1/devices/{deviceId}/registrations/{passTypeId}/{serial}   unregister
//   GET    /v1/devices/{deviceId}/registrations/{passTypeId}            list updated serials
//   GET    /v1/passes/{passTypeId}/{serial}                             latest signed pass
//   POST   /v1/log                                                      device logs
//
// Auth: register / get-pass require  Authorization: ApplePass {authToken}
// where authToken === generateAuthToken(entityId) baked into the pass.

import {
  parseSerial, authTokenForSerial, getLatestPass,
  registerDevice, unregisterDevice, serialsForDevice,
} from "../_passkit.js";

function applePassToken(req) {
  const h = req.headers["authorization"] || req.headers["Authorization"] || "";
  const m = /^ApplePass\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); });
}

export default async function handler(req, res) {
  const seg = [].concat(req.query.path || []); // ['v1','devices',...]
  const method = req.method;

  try {
    // ── POST /v1/log ───────────────────────────────────────────────
    if (seg[0] === "v1" && seg[1] === "log" && method === "POST") {
      const body = await readBody(req);
      try { console.log("[PassKit log]", JSON.stringify(body).slice(0, 1000)); } catch (e) {}
      return res.status(200).json({ ok: true });
    }

    // ── /v1/devices/{deviceId}/registrations/{passTypeId}[/{serial}] ─
    if (seg[0] === "v1" && seg[1] === "devices" && seg[3] === "registrations") {
      const deviceId = seg[2];
      const passTypeId = seg[4];
      const serial = seg[5];

      // list updated serials (no serial in path)
      if (!serial && method === "GET") {
        const since = req.query.passesUpdatedSince;
        const serials = await serialsForDevice(deviceId, passTypeId, since);
        if (!serials.length) return res.status(204).end();
        return res.status(200).json({ lastUpdated: String(Date.now()), serialNumbers: serials });
      }

      if (serial && (method === "POST" || method === "DELETE")) {
        const tok = applePassToken(req);
        if (!tok || tok !== authTokenForSerial(serial)) return res.status(401).end();

        if (method === "POST") {
          const body = await readBody(req);
          const pushToken = body && body.pushToken;
          if (!pushToken) return res.status(400).json({ error: "missing_push_token" });
          await registerDevice(deviceId, passTypeId, serial, pushToken);
          return res.status(201).json({ ok: true });
        }
        if (method === "DELETE") {
          await unregisterDevice(deviceId, serial);
          return res.status(200).json({ ok: true });
        }
      }
    }

    // ── GET /v1/passes/{passTypeId}/{serial} ───────────────────────
    if (seg[0] === "v1" && seg[1] === "passes" && seg[3] && method === "GET") {
      const serial = seg[3];
      const tok = applePassToken(req);
      if (!tok || tok !== authTokenForSerial(serial)) return res.status(401).end();

      const { type } = parseSerial(serial);
      if (!type) return res.status(404).end();

      let latest;
      try { latest = await getLatestPass(serial); }
      catch (e) { return res.status(404).json({ error: e.message }); }

      // If-Modified-Since support (avoid resending an unchanged pass)
      const ims = req.headers["if-modified-since"];
      if (ims && new Date(ims).getTime() >= latest.lastModified.getTime() - 1000) {
        return res.status(304).end();
      }
      res.setHeader("Content-Type", "application/vnd.apple.pkpass");
      res.setHeader("Last-Modified", latest.lastModified.toUTCString());
      return res.status(200).send(latest.buffer);
    }

    return res.status(404).json({ error: "not_found", path: seg.join("/") });
  } catch (e) {
    console.error("[pass-update]", e);
    return res.status(500).json({ error: e.message });
  }
}
