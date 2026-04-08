import { PKPass } from "passkit-generator";
import crypto from "crypto";
import path from "path";
import fs from "fs";

const signerCert = Buffer.from(process.env.PASS_CERT_BASE64 || "", "base64");
const signerKey = Buffer.from(process.env.PASS_KEY_BASE64 || "", "base64");
const signerKeyPassphrase = process.env.PASS_KEY_PASSPHRASE || "";
const PASS_TYPE_ID = "pass.com.boomrome.proppass";
const TEAM_ID = "3MFCAL4947";

function loadAssets(type) {
  const dir = path.join(process.cwd(), "pass-assets", type);
  const bufs = {};
  for (const f of ["icon.png","icon@2x.png","icon@3x.png","logo.png","logo@2x.png","strip.png","strip@2x.png","thumbnail.png","thumbnail@2x.png"]) {
    try { bufs[f] = fs.readFileSync(path.join(dir, f)); } catch(e) {}
  }
  return bufs;
}

function buildViewing(d) {
  const pass = {
    formatVersion: 1, organizationName: "BOOM", passTypeIdentifier: PASS_TYPE_ID, teamIdentifier: TEAM_ID,
    description: "BOOM Viewing Pass",
    backgroundColor: "rgb(10, 10, 10)", foregroundColor: "rgb(255, 255, 255)", labelColor: "rgb(212, 175, 55)",
    logoText: "BOOM",
    eventTicket: {
      headerFields: [{ key: "date", label: "DATE", value: d.date || "TBC" }],
      primaryFields: [{ key: "property", label: "PROPERTY", value: d.propertyAddress || "TBC" }],
      secondaryFields: [
        { key: "time", label: "TIME", value: d.time || "TBC" },
        { key: "zone", label: "ZONE", value: d.zone || "Rome" },
        { key: "agent", label: "AGENT", value: d.agentName || "Valentino" }
      ],
      auxiliaryFields: [
        { key: "client", label: "CLIENT", value: d.clientName || "" },
        ...(d.rent ? [{ key: "rent", label: "RENT", value: "€" + Number(d.rent).toLocaleString("it-IT") + "/mo" }] : []),
        ...(d.rooms ? [{ key: "rooms", label: "ROOMS", value: String(d.rooms) }] : [])
      ],
      backFields: [
        { key: "agentPhone", label: "Agent phone", value: d.agentPhone || "+39 377 087 0403" },
        { key: "agentEmail", label: "Agent email", value: d.agentEmail || "valentino@boom-rome.com" },
        { key: "instructions", label: "Viewing instructions", value: "Please arrive 5 minutes early. Bring a valid ID. The agent will meet you at the entrance." },
        { key: "boomContact", label: "BOOM Rome", value: "+39 377 087 0403" },
        { key: "website", label: "Website", value: "https://boomrome.com" }
      ]
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: d.listingUrl || "https://boomrome.com", messageEncoding: "iso-8859-1" }]
  };
  if (d.date && d.time) {
    try {
      const dt = new Date(d.date + "T" + d.time + ":00");
      pass.relevantDate = dt.toISOString();
      const exp = new Date(dt); exp.setDate(exp.getDate() + 1);
      pass.expirationDate = exp.toISOString();
    } catch(e) {}
  }
  if (d.latitude && d.longitude) {
    pass.locations = [{ latitude: parseFloat(d.latitude), longitude: parseFloat(d.longitude), relevantText: "Your viewing is nearby" }];
  }
  return pass;
}

function buildTenant(d) {
  const pass = {
    formatVersion: 1, organizationName: "BOOM", passTypeIdentifier: PASS_TYPE_ID, teamIdentifier: TEAM_ID,
    description: "BOOM Tenant Card",
    backgroundColor: "rgb(10, 10, 10)", foregroundColor: "rgb(255, 255, 255)", labelColor: "rgb(212, 175, 55)",
    logoText: "BOOM",
    storeCard: {
      headerFields: [{ key: "label", label: "", value: "YOUR HOME" }],
      primaryFields: [{ key: "tenant", label: "TENANT", value: d.tenantName || "" }],
      secondaryFields: [
        { key: "from", label: "FROM", value: d.startDate || "" },
        { key: "to", label: "TO", value: d.endDate || "" },
        { key: "rent", label: "RENT", value: "€" + (d.rent || "0"), currencyCode: "EUR" }
      ],
      auxiliaryFields: [
        { key: "contract", label: "CONTRACT", value: d.contractType || "Transitorio" },
        { key: "deposit", label: "DEPOSIT", value: d.deposit ? "€" + d.deposit : "—" },
        { key: "payment", label: "PAYMENT DAY", value: d.paymentDay || "5th" }
      ],
      backFields: [
        { key: "iban", label: "Landlord IBAN (tap to copy)", value: d.iban || "—" },
        { key: "paymentDay", label: "Payment due", value: "5th of each month via bank transfer" },
        { key: "emergency", label: "Emergency contact", value: d.emergencyPhone || "+39 377 087 0403" },
        { key: "landlordName", label: "Landlord", value: d.landlordName || "" },
        { key: "propertyAddress", label: "Property", value: d.propertyAddress || "" },
        { key: "contractType", label: "Contract", value: (d.contractType || "Transitorio") + " - Cedolare secca 10%" },
        { key: "houseRules", label: "House rules", value: d.houseRules || "No smoking inside. Quiet hours 22:00-08:00. Garbage collection: Mon/Wed/Fri." },
        { key: "boomSupport", label: "BOOM support", value: "valentino@boom-rome.com | +39 377 087 0403" },
        { key: "portal", label: "Your portal", value: "https://boomrome.com/portal" }
      ]
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: "https://boomrome.com/portal.html#dashboard", messageEncoding: "iso-8859-1" }]
  };
  if (d.latitude && d.longitude) {
    pass.locations = [{ latitude: parseFloat(d.latitude), longitude: parseFloat(d.longitude) }];
  }
  return pass;
}

function buildLandlord(d) {
  return {
    formatVersion: 1, organizationName: "BOOM", passTypeIdentifier: PASS_TYPE_ID, teamIdentifier: TEAM_ID,
    description: "BOOM Landlord Card",
    backgroundColor: "rgb(18, 16, 10)", foregroundColor: "rgb(232, 212, 139)", labelColor: "rgb(201, 168, 76)",
    logoText: "BOOM",
    storeCard: {
      headerFields: [{ key: "status", label: "", value: "PREMIUM PARTNER" }],
      primaryFields: [{ key: "name", label: "PROPERTY OWNER", value: (d.landlordName || "").toUpperCase() }],
      secondaryFields: [
        { key: "properties", label: "PROPERTIES", value: String(d.propertyCount || 1) },
        { key: "since", label: "SINCE", value: String(d.since || new Date().getFullYear()) },
        { key: "status", label: "STATUS", value: "Active" }
      ],
      backFields: [
        { key: "activeTenant", label: "Active tenant", value: d.currentTenant || "—" },
        { key: "activeRent", label: "Monthly rent", value: d.rentAmount ? "€" + d.rentAmount : "—" },
        { key: "contractDates", label: "Contract period", value: d.contractDates || "—" },
        { key: "contractType", label: "Contract type", value: d.contractType || "Transitorio - Cedolare secca 10%" },
        { key: "nextPayment", label: "Next payment due", value: d.nextPayment || "—" },
        { key: "propertyAddress", label: "Property", value: d.propertyAddress || "" },
        { key: "cadastral", label: "Cadastral data", value: d.cadastral || "—" },
        { key: "boomDirect", label: "Your BOOM contact", value: "Valentino | +39 377 087 0403" },
        { key: "boomEmail", label: "Email", value: "valentino@boom-rome.com" },
        { key: "portal", label: "Landlord portal", value: "https://boomrome.com/portal" }
      ]
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: "https://boomrome.com/portal.html#dashboard", messageEncoding: "iso-8859-1" }]
  };
}

function buildReferral(d) {
  const code = d.referralCode || "BOOM-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const pass = {
    formatVersion: 1, organizationName: "BOOM", passTypeIdentifier: PASS_TYPE_ID, teamIdentifier: TEAM_ID,
    description: "BOOM Referral Pass",
    backgroundColor: "rgb(10, 10, 10)", foregroundColor: "rgb(255, 255, 255)", labelColor: "rgb(212, 175, 55)",
    logoText: "BOOM",
    coupon: {
      headerFields: [{ key: "label", label: "", value: "REFERRAL" }],
      primaryFields: [{ key: "offer", label: "REFER A FRIEND", value: "Both get rewarded" }],
      secondaryFields: [{ key: "code", label: "YOUR CODE", value: code }],
      auxiliaryFields: [
        { key: "expires", label: "EXPIRES", value: d.expirationDate || "No expiry" },
        { key: "uses", label: "USES LEFT", value: d.usesLeft || "Unlimited" }
      ],
      backFields: [
        { key: "howItWorks", label: "How it works", value: "Share your code with a friend looking for an apartment in Rome. When they sign a contract through BOOM, you both receive €100 credit." },
        { key: "terms", label: "Terms", value: "Valid for new BOOM clients only. Credit applied to next invoice or rent payment. Cannot be combined with other offers." },
        { key: "shareLink", label: "Share this link", value: "https://boomrome.com/portal.html?intake=1&ref=" + code },
        { key: "boomSupport", label: "BOOM support", value: "valentino@boom-rome.com | +39 377 087 0403" }
      ]
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: "https://boomrome.com/portal.html?intake=1&ref=" + code, messageEncoding: "iso-8859-1" }]
  };
  if (d.expirationDate) {
    try { pass.expirationDate = new Date(d.expirationDate + "T23:59:59").toISOString(); } catch(e) {}
  }
  return pass;
}

const BUILDERS = { viewing: buildViewing, tenant: buildTenant, referral: buildReferral, landlord: buildLandlord };

export default async function handler(req, res) {
  const allowedOrigins = ["https://boomrome.com", "https://www.boomrome.com"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { type = "viewing", data } = req.body;
    if (!data) return res.status(400).json({ error: "Missing data" });
    const builder = BUILDERS[type];
    if (!builder) return res.status(400).json({ error: "Unknown type: " + type });
    const passData = builder(data);
    const serial = crypto.randomUUID();
    passData.serialNumber = serial;
    const assets = loadAssets(type);
    const pass = new PKPass(assets, { signerCert, signerKey, signerKeyPassphrase }, passData);
    const buf = pass.getAsBuffer();
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", "attachment; filename=boom-" + type + "-" + serial.slice(0, 8) + ".pkpass");
    return res.send(buf);
  } catch (err) {
    console.error("PropPass error:", err);
    return res.status(500).json({ error: "Failed to generate pass" });
  }
}
