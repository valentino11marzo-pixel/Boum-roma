// api/pass-demo.js — GET: a ready-to-tap SAMPLE Wallet pass (no record needed).
// Lets anyone preview a BOOM pass as a customer would. Signs with the same
// certs as the real passes. ?type=tenant|silver|landlord|viewing|referral
import { buildAndSign } from "./generate-pass.js";

function iso(d) { return d.toISOString(); }

export default function handler(req, res) {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86400000);
  const end = new Date(now.getTime() + 335 * 86400000);
  const nextPay = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  const tomorrow3pm = new Date(now.getTime() + 86400000); tomorrow3pm.setHours(15, 0, 0, 0);

  const SAMPLES = {
    tenant: {
      contractId: "DEMO-TENANT", tenantName: "Mario Rossi",
      propertyAddress: "Via di Trastevere 4B", propertyCity: "Roma",
      propertyCoords: { lat: 41.8896, lng: 12.4695 },
      contractStart: iso(start), contractEnd: iso(end),
      monthlyRent: 1200, nextPaymentDate: iso(nextPay),
    },
    silver: {
      contractId: "DEMO-SILVER", tenantName: "Giulia Bianchi",
      propertyAddress: "Via dei Coronari 18", propertyCity: "Roma",
      contractStart: iso(start), contractEnd: iso(end), monthlyRent: 1800,
    },
    landlord: {
      landlordId: "DEMO-PARTNER", landlordName: "Luca Verdi",
      memberSince: 2021, propertiesCount: 4, totalRevenue: 86400, partnerId: "BMRM0042",
    },
    viewing: {
      viewingId: "DEMO-VIEWING", clientName: "Sofia Conti",
      propertyAddress: "Via del Pigneto 22", propertyCity: "Roma",
      propertyCoords: { lat: 41.8867, lng: 12.5257 },
      confirmedDateISO: iso(tomorrow3pm), durationMinutes: 30, meetingPoint: "AL CITOFONO",
    },
    referral: {
      referrerId: "DEMO-CIRCLE", referrerName: "Marco Neri",
      referralCode: "BOOM-DEMO", memberSince: 2023, referralsActive: 3, totalEarned: 450,
    },
  };

  let type = String(req.query.type || "tenant").toLowerCase();
  if (!SAMPLES[type]) type = "tenant";

  try {
    const { buffer } = buildAndSign(type, SAMPLES[type]);
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename=boom-demo-${type}.pkpass`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(500).json({
      error: e.message,
      hint: "Signing certs (PASS_CERT_BASE64 / PASS_KEY_BASE64 / PASS_KEY_PASSPHRASE) must be set in this environment.",
    });
  }
}
