// api/pass-diag.js — admin-only Apple Wallet activation DOCTOR.
// Returns booleans/counts only (NO secret values) so we can verify that
// production is correctly configured to sign + push passes, without guessing.
//
// It actively PROBES the things that usually block activation:
//   1. signing certs present (PASS_CERT_BASE64 / PASS_KEY_BASE64)
//   2. the Pass Type certificate is actually APNs-push-enabled
//      → opens a real TLS connection to api.push.apple.com with the client
//        cert. Apple accepts the handshake only for a valid push cert.
//   3. admin email configured (for Studio Issue/Push)
//   4. how many passes are tracked and how many devices have registered
//      (no registrations = no pass has been added on an iPhone yet)
//
// Auth: X-Firebase-Token (admin browser) OR X-Homie-Secret.

import http2 from "node:http2";
import { guardPost } from "./agent/_lib.js";
import { fsList } from "./homie/_lib.js";
import { PASS_TYPE_ID, TEAM_ID } from "./generate-pass.js";

// Open a TLS/HTTP2 connection to APNs with the Pass Type cert. A successful
// "connect" means Apple accepted the client certificate → push-enabled.
async function apnsCertProbe() {
  const cert = Buffer.from(process.env.PASS_CERT_BASE64 || "", "base64");
  const key = Buffer.from(process.env.PASS_KEY_BASE64 || "", "base64");
  const passphrase = process.env.PASS_KEY_PASSPHRASE || undefined;
  if (!cert.length || !key.length) return { reachable: false, reason: "missing_cert" };
  return await new Promise((resolve) => {
    let settled = false, client;
    const done = (r) => { if (settled) return; settled = true; try { client && client.close(); } catch (e) {} resolve(r); };
    try { client = http2.connect("https://api.push.apple.com:443", { cert, key, passphrase }); }
    catch (e) { return resolve({ reachable: false, reason: String(e.code || e.message) }); }
    const to = setTimeout(() => done({ reachable: false, reason: "timeout" }), 6000);
    client.on("connect", () => { clearTimeout(to); done({ reachable: true }); });
    client.on("error", (e) => { clearTimeout(to); done({ reachable: false, reason: String(e.code || e.message) }); });
  });
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  const env = process.env;
  const has = (k) => !!(env[k] && String(env[k]).length);
  const certPresent = has("PASS_CERT_BASE64") && has("PASS_KEY_BASE64");
  const adminEmails = (env.AGENT_ADMIN_EMAILS || env.FIREBASE_ADMIN_EMAIL || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  let deviceRegistrations = null, trackedPasses = null;
  try { deviceRegistrations = (await fsList("passRegistrations", { limit: 1000 })).length; } catch (e) {}
  try { trackedPasses = (await fsList("passMeta", { limit: 1000 })).length; } catch (e) {}

  // Active probe: is the cert actually push-enabled?
  const apnsProbe = certPresent ? await apnsCertProbe() : { reachable: false, reason: "missing_cert" };

  const env_ok = {
    PASS_CERT_BASE64: has("PASS_CERT_BASE64"),
    PASS_KEY_BASE64: has("PASS_KEY_BASE64"),
    PASS_KEY_PASSPHRASE: has("PASS_KEY_PASSPHRASE"),
    PASS_AUTH_SECRET: has("PASS_AUTH_SECRET"),
    FIREBASE_ADMIN_EMAIL: has("FIREBASE_ADMIN_EMAIL"),
    FIREBASE_ADMIN_PASS: has("FIREBASE_ADMIN_PASS"),
    FIREBASE_PROJECT_ID: has("FIREBASE_PROJECT_ID"),
    AGENT_ADMIN_EMAILS: has("AGENT_ADMIN_EMAILS"),
  };

  // Ordered, single next action.
  let nextStep;
  if (!certPresent) nextStep = "Imposta PASS_CERT_BASE64 + PASS_KEY_BASE64 (e PASS_KEY_PASSPHRASE) su Vercel, poi redeploy.";
  else if (!apnsProbe.reachable) nextStep = `Il certificato firma ma APNs lo rifiuta (${apnsProbe.reason}). Verifica che il Pass Type ID sia ABILITATO al push nel portale Apple Developer (o passa a una .p8). Senza questo i pass si installano ma NON si aggiornano.`;
  else if (!adminEmails.length) nextStep = "Imposta AGENT_ADMIN_EMAILS (o FIREBASE_ADMIN_EMAIL) con la tua email admin per Issue/Push dalla Studio.";
  else if (!deviceRegistrations) nextStep = "Config + push OK. Aggiungi un pass REALE (collegato a un record) sul tuo iPhone da boomrome.com, poi premi Push: deve aggiornarsi sulla lock screen.";
  else nextStep = "Tutto verde: cert firma + push abilitato + admin + " + deviceRegistrations + " dispositivi registrati. Premi Push su un pass per verificare l'update.";

  const ready = certPresent && apnsProbe.reachable && adminEmails.length > 0;

  // Log a one-line verdict so it shows in Vercel runtime logs.
  console.log(`[pass-diag] ready=${ready} cert=${certPresent} apns=${apnsProbe.reachable}${apnsProbe.reason ? "(" + apnsProbe.reason + ")" : ""} admins=${adminEmails.length} passes=${trackedPasses} devices=${deviceRegistrations}`);

  return res.status(200).json({
    ok: true,
    ready,
    passTypeId: PASS_TYPE_ID,
    teamId: TEAM_ID,
    webServiceURL: "https://boomrome.com/api/pass-update",
    signing: { certConfigured: certPresent, passphraseConfigured: has("PASS_KEY_PASSPHRASE") },
    apns: { mode: "cert-based (reuses Pass Type certificate)", pushEnabled: apnsProbe.reachable, detail: apnsProbe.reason || "ok" },
    env_ok,
    adminEmailsConfigured: adminEmails.length,
    trackedPasses,
    deviceRegistrations,
    nextStep,
  });
}
