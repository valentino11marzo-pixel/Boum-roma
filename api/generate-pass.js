import { PKPass } from "passkit-generator";
import crypto from "crypto";
import path from "path";
import fs from "fs";

const signerCert = Buffer.from(process.env.PASS_CERT_BASE64 || "", "base64");
const signerKey = Buffer.from(process.env.PASS_KEY_BASE64 || "", "base64");
const signerKeyPassphrase = process.env.PASS_KEY_PASSPHRASE || "boom2026pass";
const wwdr = Buffer.from(process.env.WWDR_CERT_BASE64 || "", "base64");
const PASS_TYPE_ID = "pass.com.boomrome.proppass";
const TEAM_ID = "3MFCAL4947";

function loadAssets(type) {
  const dir = path.join(process.cwd(), "pass-assets", type);
  const bufs = {};
  for (const f of ["icon.png","icon@2x.png","icon@3x.png","logo.png","logo@2x.png","thumbnail.png","thumbnail@2x.png","strip.png","strip@2x.png"]) {
    try { bufs[f] = fs.readFileSync(path.join(dir, f)); } catch(e) {}
  }
  return bufs;
}

function getColors(type) {
  if (type === "tenant") return { backgroundColor: "rgb(212, 175, 55)", foregroundColor: "rgb(8, 8, 10)", labelColor: "rgb(60, 50, 30)" };
  if (type === "referral") return { backgroundColor: "rgb(26, 20, 18)", foregroundColor: "rgb(240, 230, 218)", labelColor: "rgb(184, 149, 106)" };
  if (type === "landlord") return { backgroundColor: "rgb(0, 0, 0)", foregroundColor: "rgb(255, 255, 255)", labelColor: "rgb(120, 120, 120)" };
  return { backgroundColor: "rgb(8, 8, 10)", foregroundColor: "rgb(255, 255, 255)", labelColor: "rgb(212, 175, 55)" };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { type = "viewing", data } = req.body;
    if (!data) return res.status(400).json({ error: "Missing data" });
    if (!["viewing","tenant","referral","landlord"].includes(type)) return res.status(400).json({ error: "Unknown type: " + type });

    const serial = crypto.randomUUID();
    const assets = loadAssets(type);
    const colors = getColors(type);

    const pass = new PKPass(assets, {
      wwdr, signerCert, signerKey, signerKeyPassphrase,
    }, {
      formatVersion: 1,
      passTypeIdentifier: PASS_TYPE_ID,
      teamIdentifier: TEAM_ID,
      organizationName: "BOOM",
      serialNumber: serial,
      description: "BOOM Pass",
      logoText: "BOOM",
      ...colors,
    });

    pass.type = "generic";

    // QR code linking to portal
    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: "https://boomrome.com/portal.html?" + type + "=" + serial,
      messageEncoding: "iso-8859-1",
    });

    // === LOCATION RELEVANCE ===
    // If lat/lng provided, pass appears on lock screen when nearby
    if (data.latitude && data.longitude) {
      pass.setLocations({
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        relevantText: type === "viewing" ? "Your viewing is nearby" : type === "tenant" ? "Welcome home" : "BOOM",
      });
    }

    // === TIME RELEVANCE (viewing only) ===
    if (type === "viewing" && data.date && data.time) {
      pass.setRelevantDate(new Date(data.date + "T" + data.time + ":00+02:00"));
      // Viewing expires 24h after
      pass.setExpirationDate(new Date(new Date(data.date + "T" + data.time + ":00+02:00").getTime() + 24 * 60 * 60 * 1000));
    }

    // === FIELDS PER TYPE ===
    if (type === "viewing") {
      pass.headerFields.push({ key: "date", label: "DATE", value: data.date || "TBC" });
      pass.primaryFields.push({ key: "property", label: "PROPERTY", value: data.propertyAddress || "TBC" });
      pass.secondaryFields.push({ key: "time", label: "TIME", value: data.time || "TBC" });
      pass.secondaryFields.push({ key: "zone", label: "ZONE", value: data.zone || "Rome" });
      pass.auxiliaryFields.push({ key: "agent", label: "YOUR AGENT", value: data.agentName || "Valentino" });
      if (data.rent) pass.auxiliaryFields.push({ key: "rent", label: "RENT", value: "\u20AC" + data.rent + "/mo" });

      // Back: tappable address, phone, link
      pass.backFields.push({
        key: "address",
        label: "Property Address",
        value: data.propertyAddress || "",
        attributedValue: "<a href='https://maps.apple.com/?q=" + encodeURIComponent(data.propertyAddress || "") + "'>" + (data.propertyAddress || "") + "</a>",
      });
      pass.backFields.push({
        key: "phone",
        label: "Your Agent - Valentino",
        value: "+39 351 977 5583",
        attributedValue: "<a href='tel:+393519775583'>+39 351 977 5583</a>",
      });
      pass.backFields.push({
        key: "instructions",
        label: "Viewing Instructions",
        value: "Please arrive on time. Your agent will meet you at the property entrance. Bring a valid ID.",
      });
      if (data.clientName) pass.backFields.push({ key: "client", label: "Client", value: data.clientName });
      pass.backFields.push({
        key: "web",
        label: "BOOM",
        value: "Rome's Premium Rental Concierge",
        attributedValue: "<a href='https://boomrome.com'>www.boomrome.com</a>",
      });
    }

    if (type === "tenant") {
      pass.headerFields.push({ key: "contract", label: "CONTRACT", value: data.contractType || "Concordato" });
      pass.primaryFields.push({ key: "home", label: "YOUR HOME", value: data.propertyAddress || "" });
      pass.secondaryFields.push({ key: "from", label: "FROM", value: data.startDate || "" });
      pass.secondaryFields.push({ key: "to", label: "TO", value: data.endDate || "" });
      pass.auxiliaryFields.push({ key: "zone", label: "ZONE", value: data.zone || "Rome" });
      if (data.tenantName) pass.auxiliaryFields.push({ key: "tenant", label: "TENANT", value: data.tenantName });

      // Back: address on maps, emergency, landlord, useful numbers
      pass.backFields.push({
        key: "address",
        label: "Home Address",
        value: data.propertyAddress || "",
        attributedValue: "<a href='https://maps.apple.com/?q=" + encodeURIComponent(data.propertyAddress || "") + "'>" + (data.propertyAddress || "") + "</a>",
      });
      pass.backFields.push({ key: "landlord", label: "Landlord", value: data.landlordName || "" });
      pass.backFields.push({
        key: "emergency",
        label: "BOOM Emergency Line",
        value: data.emergencyPhone || "+39 351 977 5583",
        attributedValue: "<a href='tel:" + (data.emergencyPhone || "+393519775583").replace(/\s/g, "") + "'>" + (data.emergencyPhone || "+39 351 977 5583") + "</a>",
      });
      pass.backFields.push({
        key: "useful",
        label: "Emergency Numbers Italy",
        value: "Carabinieri: 112\nPolice: 113\nFire: 115\nAmbulance: 118\nACEA (water): 800 130 335\nENEL (electricity): 800 900 800",
      });
      pass.backFields.push({
        key: "web",
        label: "BOOM Concierge",
        value: "Need help? We're always available.",
        attributedValue: "<a href='https://boomrome.com'>www.boomrome.com</a>",
      });
    }

    if (type === "referral") {
      const code = data.referralCode || "BOOM-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      pass.headerFields.push({ key: "reward", label: "REWARD", value: data.discount || "\u20AC100 off" });
      pass.primaryFields.push({ key: "title", label: "REFERRAL", value: "Share BOOM with a friend" });
      pass.secondaryFields.push({ key: "code", label: "YOUR CODE", value: code });
      pass.secondaryFields.push({ key: "from", label: "FROM", value: data.referrerName || "" });
      pass.auxiliaryFields.push({ key: "valid", label: "VALID UNTIL", value: data.expirationDate || "No expiry" });

      pass.backFields.push({
        key: "how",
        label: "How It Works",
        value: "1. Share your code " + code + " with anyone moving to Rome\n2. They contact BOOM and mention your code\n3. When they sign, you BOTH get " + (data.discount || "\u20AC100 off") + "\n\nNo limits on referrals.",
      });
      pass.backFields.push({
        key: "share",
        label: "Share Link",
        value: "boomrome.com/portal.html?ref=" + code,
        attributedValue: "<a href='https://boomrome.com/portal.html?ref=" + code + "'>Share BOOM</a>",
      });
      pass.backFields.push({
        key: "contact",
        label: "Contact",
        value: "+39 351 977 5583",
        attributedValue: "<a href='tel:+393519775583'>+39 351 977 5583</a>",
      });
    }

    if (type === "landlord") {
      if (data.rentAmount) pass.headerFields.push({ key: "rent", label: "RENT", value: "\u20AC" + data.rentAmount + "/mo" });
      pass.primaryFields.push({ key: "property", label: "YOUR PROPERTY", value: data.propertyAddress || "" });
      pass.secondaryFields.push({ key: "tenant", label: "CURRENT TENANT", value: data.currentTenant || "Vacant" });
      pass.secondaryFields.push({ key: "zone", label: "ZONE", value: data.zone || "Rome" });
      if (data.contractEnd) pass.auxiliaryFields.push({ key: "ends", label: "CONTRACT ENDS", value: data.contractEnd });

      pass.backFields.push({
        key: "address",
        label: "Property Location",
        value: data.propertyAddress || "",
        attributedValue: "<a href='https://maps.apple.com/?q=" + encodeURIComponent(data.propertyAddress || "") + "'>" + (data.propertyAddress || "") + "</a>",
      });
      pass.backFields.push({ key: "owner", label: "Owner", value: data.landlordName || "" });
      pass.backFields.push({
        key: "phone",
        label: "BOOM Property Management",
        value: "+39 351 977 5583",
        attributedValue: "<a href='tel:+393519775583'>+39 351 977 5583</a>",
      });
      pass.backFields.push({
        key: "legal",
        label: "Contract Type",
        value: "Canone Concordato Transitorio (L.431/98 art.5 c.1)\nCedolare secca 10%\nAsseverazione via partner CAF",
      });
      pass.backFields.push({
        key: "web",
        label: "BOOM",
        value: "Property managed by BOOM",
        attributedValue: "<a href='https://boomrome.com'>www.boomrome.com</a>",
      });
    }

    const buf = pass.getAsBuffer();
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", "attachment; filename=boom-" + type + "-" + serial.slice(0, 8) + ".pkpass");
    return res.send(buf);

  } catch (err) {
    console.error("PropPass error:", err);
    return res.status(500).json({ error: "Failed to generate pass", details: err.message });
  }
}
