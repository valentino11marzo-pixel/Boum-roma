// api/pass-diag.js — admin-only Apple Wallet activation diagnostics.
// Returns booleans/counts only (NO secret values) so we can verify that
// production is correctly configured to sign + push passes, without guessing.
//
// Auth: X-Firebase-Token (admin browser) OR X-Homie-Secret.
// Output: { ok, ready, passTypeId, teamId, apns:{...}, adminEmailsConfigured,
//           trackedPasses, deviceRegistrations, hint }

import { guardPost } from "./agent/_lib.js";
import { fsList } from "./homie/_lib.js";
import { PASS_TYPE_ID, TEAM_ID } from "./generate-pass.js";

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  const env = process.env;
  const certPresent = !!(env.PASS_CERT_BASE64 && env.PASS_KEY_BASE64);
  const adminEmails = (env.AGENT_ADMIN_EMAILS || env.FIREBASE_ADMIN_EMAIL || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  let deviceRegistrations = null, trackedPasses = null;
  try { deviceRegistrations = (await fsList("passRegistrations", { limit: 1000 })).length; } catch (e) {}
  try { trackedPasses = (await fsList("passMeta", { limit: 1000 })).length; } catch (e) {}

  const ready = certPresent && adminEmails.length > 0;
  return res.status(200).json({
    ok: true,
    ready,
    passTypeId: PASS_TYPE_ID,
    teamId: TEAM_ID,
    webServiceURL: "https://boomrome.com/api/pass-update",
    apns: {
      mode: "cert-based (reuses Pass Type certificate)",
      passCertConfigured: certPresent,
      passphraseConfigured: !!env.PASS_KEY_PASSPHRASE,
    },
    adminEmailsConfigured: adminEmails.length,
    trackedPasses,
    deviceRegistrations,
    hint: ready
      ? "Config OK. Aggiungi un pass collegato a un record su iPhone, poi premi Push per verificare l'aggiornamento."
      : (!certPresent
          ? "Mancano PASS_CERT_BASE64 / PASS_KEY_BASE64 in questo ambiente."
          : "Imposta AGENT_ADMIN_EMAILS con la tua email admin per Issue/Push dalla Studio."),
  });
}
