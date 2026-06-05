// api/generate-pass.js
// BOOM PropPass V3 — 5 passes, professionally laid out for Apple Wallet.
//
//   Tenant      storeCard   (clean, no strip — "premium card" look)
//   Silver      storeCard   (platinum variant)
//   Landlord    storeCard   (bronze/gold partner)
//   Viewing     eventTicket (relevantDate + geo-fence + semantics)
//   Referral    coupon
//
// Design principles applied here:
//   • Native semantic fields (currencyCode / dateStyle) → Apple formats &
//     aligns money and dates for us, localized to the user's region.
//   • One hero (primary) value, tidy 2-field secondary/auxiliary rows.
//   • Empty fields auto-omitted (no holes, no "€0").
//   • Right-aligned numbers/dates for clean columns.
//   • Rich, actionable backFields (Pay / Maintenance / Maps / WhatsApp links).
//   • changeMessage on live fields, so push updates show a nice notification.
//
// Asset path: assets/passes/{type}/{icon,logo,strip,thumbnail}{,@2x,@3x}.png

import { PKPass } from "passkit-generator";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { fsPatch } from "./homie/_lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const signerCert = Buffer.from(process.env.PASS_CERT_BASE64 || "", "base64");
const signerKey = Buffer.from(process.env.PASS_KEY_BASE64 || "", "base64");
const signerKeyPassphrase = process.env.PASS_KEY_PASSPHRASE || "";

// Apple WWDR G4 certificate (public, required by passkit-generator v3)
const wwdr = `-----BEGIN CERTIFICATE-----
MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQEL
BQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsT
HUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBS
b290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UE
Aww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNh
dGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJbmMu
MQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAf
eKp6JzKwRl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjo
v9Y5Ui8eZ/xx8YJtPH4GUnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41t
QSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQyziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB
5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQYojZQykn/e2kv1MukBVl
PNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeHdSbCb64D
YyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8G
A1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0
BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJv
b3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290
LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+kchbd6gwDgYDVR0PAQH/BAQD
AgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQA/Vj2e5bbD
eeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWv
p50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPef
x4elUWY0GzlxOSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJ
EtHlgepZAE9bPFo22noicwkJac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQ
A1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xKX+udO7xPiEAGE/+QF4oIRynoYpgp
pU8RBWk6z/Kf
-----END CERTIFICATE-----`;

const PASS_TYPE_ID = "pass.com.boomrome.proppass";
const TEAM_ID = "3MFCAL4947";
const WEB_SERVICE_URL = "https://boomrome.com/api/pass-update";

const SUPPORT_WA = "https://wa.me/393313251961";
const SUPPORT_LINKS = '<a href="https://wa.me/393313251961">WhatsApp</a> · <a href="mailto:valentino@boom-rome.com">Email</a>';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad(n) { return String(n).padStart(2, "0"); }

function generateAuthToken(id) {
  return crypto
    .createHash("sha256")
    .update(`boom-${id}-${process.env.PASS_AUTH_SECRET || "fallback"}`)
    .digest("hex")
    .slice(0, 32);
}

function safeDate(input) {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateRange(start, end) {
  const s = safeDate(start), e = safeDate(end);
  if (!s || !e) return "";
  return `${pad(s.getDate())}/${pad(s.getMonth() + 1)}/${s.getFullYear()} → ${pad(e.getDate())}/${pad(e.getMonth() + 1)}/${e.getFullYear()}`;
}

function loadAssets(type) {
  const baseDir = path.resolve(__dirname, "..", "assets", "passes", type);
  const files = [
    "icon.png", "icon@2x.png", "icon@3x.png",
    "logo.png", "logo@2x.png", "logo@3x.png",
    "strip.png", "strip@2x.png", "strip@3x.png",
    "thumbnail.png", "thumbnail@2x.png", "thumbnail@3x.png",
  ];
  const buffers = {};
  for (const f of files) {
    const fpath = path.join(baseDir, f);
    try { if (fs.existsSync(fpath)) buffers[f] = fs.readFileSync(fpath); } catch (e) {}
  }
  return buffers;
}

// ── Semantic field helpers — native formatting + auto-omit when empty ──────
const R = "PKTextAlignmentRight";
const clean = (arr) => arr.filter(Boolean);
function fText(key, label, value, opts = {}) {
  if (value == null || String(value).trim() === "") return null;
  return { key, label, value: String(value), ...opts };
}
function fCurrency(key, label, value, opts = {}) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return null;
  return { key, label, value: n, currencyCode: "EUR", ...opts };
}
function fNumber(key, label, value, opts = {}) {
  if (value == null || value === "") return null;
  return { key, label, value: Number(value) || 0, ...opts };
}
function fDate(key, label, value, opts = {}) {
  const d = safeDate(value);
  if (!d) return null;
  return { key, label, value: d.toISOString(), dateStyle: "PKDateStyleMedium", timeStyle: "PKDateStyleNone", ignoresTimeZone: true, ...opts };
}
function fLink(key, label, url, text) {
  if (!url) return null;
  return { key, label, value: text || url, attributedValue: `<a href="${url}">${text || url}</a>` };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
function buildTenantPass({
  contractId, tenantName = "", propertyAddress = "", propertyCity = "Roma",
  propertyCoords = null, contractStart, contractEnd, monthlyRent,
  nextPaymentDate, paymentStatus,
}) {
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    organizationName: "BOOM Rome",
    description: `BOOM Tenant Card — ${tenantName}`,
    serialNumber: `tenant-${contractId || crypto.randomUUID()}`,
    backgroundColor: "rgb(11,11,13)",
    foregroundColor: "rgb(245,245,242)",
    labelColor: "rgb(212,175,55)",
    logoText: "BOOM",
    webServiceURL: WEB_SERVICE_URL,
    authenticationToken: generateAuthToken(contractId || tenantName),
    sharingProhibited: true,
    storeCard: {
      headerFields: clean([
        fText("type", "BOOM", "TENANT"),
        fText("state", "STATO", paymentStatus || "ATTIVO", { textAlignment: R }),
      ]),
      primaryFields: clean([
        fText("name", "INQUILINO", tenantName),
      ]),
      secondaryFields: clean([
        fCurrency("rent", "CANONE", monthlyRent, { changeMessage: "Canone aggiornato: %@" }),
        fDate("next", "PROSSIMA RATA", nextPaymentDate, { textAlignment: R, changeMessage: "Prossima rata: %@" }),
      ]),
      auxiliaryFields: clean([
        fText("addr", "INDIRIZZO", propertyAddress),
        fDate("end", "SCADENZA", contractEnd, { textAlignment: R }),
      ]),
      backFields: clean([
        fText("immobile", "Immobile", [propertyAddress, propertyCity].filter(Boolean).join(", ")),
        fText("periodo", "Periodo contratto", formatDateRange(contractStart, contractEnd)),
        fCurrency("canone_b", "Canone mensile", monthlyRent),
        fLink("pay", "Paga il canone", "https://boomrome.com/portal.html", "Paga ora →"),
        fLink("maint", "Manutenzione", "https://boomrome.com/portal.html", "Apri una richiesta →"),
        fLink("doc", "Contratto e documenti", "https://boomrome.com/portal.html", "Apri →"),
        { key: "support", label: "Assistenza", value: "valentino@boom-rome.com · +39 331 3251961", attributedValue: SUPPORT_LINKS },
        fText("cid", "ID Contratto", contractId),
        fText("terms", "Note", "Documento ufficiale BOOM Rome. Per i termini completi fa fede il contratto firmato."),
      ]),
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: `BOOM:TENANT:${contractId}`, messageEncoding: "iso-8859-1", altText: String(contractId || "").slice(0, 8).toUpperCase() }],
    userInfo: { contractId, type: "tenant" },
  };
  if (propertyCoords && propertyCoords.lat && propertyCoords.lng) {
    pass.locations = [{ latitude: parseFloat(propertyCoords.lat), longitude: parseFloat(propertyCoords.lng), relevantText: `A casa — ${(tenantName || "").split(" ")[0]}` }];
  }
  const exp = safeDate(contractEnd);
  if (exp) pass.expirationDate = exp.toISOString();
  return pass;
}

function buildSilverPass(data) {
  const base = buildTenantPass(data);
  base.description = `BOOM Tenant Silver VIP — ${data.tenantName || ""}`;
  base.serialNumber = `silver-${data.contractId || crypto.randomUUID()}`;
  base.backgroundColor = "rgb(228,229,231)";
  base.foregroundColor = "rgb(22,22,24)";
  base.labelColor = "rgb(120,104,72)";
  base.storeCard.headerFields = clean([
    fText("type", "BOOM", "SILVER"),
    fText("state", "STATO", data.paymentStatus || "VIP", { textAlignment: R }),
  ]);
  base.storeCard.backFields = clean([
    fText("vip", "Vantaggi Silver", "Assistenza prioritaria · viewing prioritari · accesso agli eventi BOOM."),
    ...base.storeCard.backFields,
  ]);
  base.userInfo = { ...(base.userInfo || {}), type: "silver", tier: "VIP" };
  return base;
}

function buildLandlordPass({
  landlordId, landlordName = "", memberSince, propertiesCount = 0,
  totalRevenue = 0, partnerId, propertiesCoords = [],
}) {
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    organizationName: "BOOM Rome",
    description: `BOOM Partner — ${landlordName}`,
    serialNumber: `landlord-${landlordId || crypto.randomUUID()}`,
    backgroundColor: "rgb(32,26,15)",
    foregroundColor: "rgb(247,238,214)",
    labelColor: "rgb(214,178,94)",
    logoText: "BOOM",
    webServiceURL: WEB_SERVICE_URL,
    authenticationToken: generateAuthToken(landlordId || landlordName),
    sharingProhibited: true,
    storeCard: {
      headerFields: clean([
        fText("member", "PARTNER DAL", String(memberSince || new Date().getFullYear()), { textAlignment: R }),
      ]),
      primaryFields: clean([
        fText("name", "BOOM PARTNER", landlordName),
      ]),
      secondaryFields: clean([
        fNumber("props", "PROPRIETÀ", propertiesCount),
        fCurrency("rev", "REVENUE", totalRevenue, { textAlignment: R }),
      ]),
      auxiliaryFields: clean([
        fText("status", "STATUS", "PREMIUM"),
        fText("pid", "BOOM ID", partnerId, { textAlignment: R }),
      ]),
      backFields: clean([
        fLink("dash", "Dashboard", "https://boomrome.com/portal.html", "Apri la dashboard →"),
        fLink("deal", "Scadenze & fiscale", "https://boomrome.com/portal.html", "Vedi scadenze e tasse →"),
        { key: "support", label: "Assistenza", value: "valentino@boom-rome.com · +39 331 3251961", attributedValue: SUPPORT_LINKS },
        fText("pid_b", "BOOM Partner ID", partnerId),
      ]),
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: `BOOM:LANDLORD:${landlordId}`, messageEncoding: "iso-8859-1", altText: String(landlordId || "").slice(0, 8).toUpperCase() }],
    userInfo: { landlordId, type: "landlord", tier: "GOLD" },
  };
  if (Array.isArray(propertiesCoords) && propertiesCoords.length > 0) {
    pass.locations = propertiesCoords
      .filter((c) => c && c.lat && c.lng)
      .map((c, i) => ({ latitude: parseFloat(c.lat), longitude: parseFloat(c.lng), relevantText: `La tua proprietà ${i + 1} di ${propertiesCoords.length}` }));
  }
  return pass;
}

function buildViewingPass({
  viewingId, clientName = "", propertyAddress = "", propertyCity = "Roma",
  propertyCoords = null, confirmedDateISO, durationMinutes = 30,
  meetingPoint = "AL CITOFONO", isVoided = false,
}) {
  const eventDate = safeDate(confirmedDateISO);
  const expirationDate = eventDate ? new Date(eventDate.getTime() + (durationMinutes + 60) * 60 * 1000) : null;

  const pass = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    organizationName: "BOOM Rome",
    description: `BOOM Viewing — ${propertyAddress}${isVoided ? " (annullata)" : ""}`,
    serialNumber: `viewing-${viewingId || crypto.randomUUID()}`,
    backgroundColor: "rgb(11,11,13)",
    foregroundColor: "rgb(245,245,242)",
    labelColor: "rgb(212,175,55)",
    logoText: "BOOM",
    webServiceURL: WEB_SERVICE_URL,
    authenticationToken: generateAuthToken(viewingId || clientName),
    eventTicket: {
      headerFields: clean([
        fText("type", "VIEWING", isVoided ? "ANNULLATA" : "PRIVATA", { textAlignment: R }),
      ]),
      primaryFields: clean([
        fText("addr", "INDIRIZZO", propertyAddress),
      ]),
      secondaryFields: clean([
        fDate("date", "DATA", confirmedDateISO, { changeMessage: "Visita spostata: %@" }),
        eventDate ? { key: "time", label: "ORA", value: eventDate.toISOString(), dateStyle: "PKDateStyleNone", timeStyle: "PKDateStyleShort", ignoresTimeZone: true, textAlignment: R, changeMessage: "Nuovo orario: %@" } : null,
      ]),
      auxiliaryFields: clean([
        fText("duration", "DURATA", `${durationMinutes} min`),
        fText("meeting", "PUNTO D'INCONTRO", meetingPoint, { textAlignment: R }),
      ]),
      backFields: clean([
        fText("client", "Cliente", clientName),
        fText("immobile", "Immobile", [propertyAddress, propertyCity].filter(Boolean).join(", ")),
        (propertyCoords && propertyCoords.lat && propertyCoords.lng)
          ? fLink("maps", "Mappa", `https://maps.apple.com/?ll=${propertyCoords.lat},${propertyCoords.lng}&q=${encodeURIComponent(propertyAddress)}`, "Apri in Mappe →")
          : null,
        fText("resched", "Riprogrammazione", isVoided ? "Visita ANNULLATA. Contattaci per riprogrammare." : "Puoi riprogrammare fino a 2 ore prima."),
        { key: "support", label: "Assistenza", value: "+39 331 3251961", attributedValue: `<a href="${SUPPORT_WA}">WhatsApp BOOM</a>` },
      ]),
    },
    voided: !!isVoided,
    barcodes: [{ format: "PKBarcodeFormatQR", message: `BOOM:VIEWING:${viewingId}`, messageEncoding: "iso-8859-1", altText: String(viewingId || "").slice(0, 8).toUpperCase() }],
    userInfo: { viewingId, type: "viewing", confirmedDate: confirmedDateISO || null, voided: !!isVoided },
  };
  if (eventDate) pass.relevantDate = eventDate.toISOString();
  if (expirationDate) pass.expirationDate = expirationDate.toISOString();
  if (propertyCoords && propertyCoords.lat && propertyCoords.lng && !isVoided) {
    pass.locations = [{ latitude: parseFloat(propertyCoords.lat), longitude: parseFloat(propertyCoords.lng), relevantText: `La tua visita — ${propertyAddress}` }];
    pass.semantics = {
      eventType: "PKEventTypeGeneric",
      eventName: `Visita BOOM — ${propertyAddress}`,
      venueName: propertyAddress,
      venueLocation: { latitude: parseFloat(propertyCoords.lat), longitude: parseFloat(propertyCoords.lng) },
      ...(eventDate ? { eventStartDate: eventDate.toISOString() } : {}),
    };
  }
  return pass;
}

function buildReferralPass({
  referrerId, referrerName = "", referralCode = "BOOM-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
  memberSince, referralsActive = 0, totalEarned = 0, nextThreshold = "5 → €1.000",
  programEndDate = null, isVoided = false,
}) {
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    organizationName: "BOOM Rome",
    description: `BOOM Circle — ${referrerName}`,
    serialNumber: `referral-${referrerId || referralCode}`,
    backgroundColor: "rgb(11,11,13)",
    foregroundColor: "rgb(212,175,55)",
    labelColor: "rgb(232,232,235)",
    logoText: "BOOM CIRCLE",
    webServiceURL: WEB_SERVICE_URL,
    authenticationToken: generateAuthToken(referrerId || referralCode),
    coupon: {
      headerFields: clean([
        fText("type", "BOOM", "CIRCLE", { textAlignment: R }),
      ]),
      primaryFields: clean([
        fText("name", "MEMBRO", referrerName),
      ]),
      secondaryFields: clean([
        fNumber("active", "REFERRAL ATTIVI", referralsActive),
        fCurrency("earned", "GUADAGNATO", totalEarned, { textAlignment: R }),
      ]),
      auxiliaryFields: clean([
        fText("code", "CODICE", referralCode),
        fText("threshold", "PROSSIMA SOGLIA", nextThreshold, { textAlignment: R }),
      ]),
      backFields: clean([
        fText("how", "Come funziona", "Condividi il tuo codice. Quando un amico firma con BOOM, guadagni €150 di credito. Cumulabile."),
        fLink("share", "Link da condividere", `https://boomrome.com/?ref=${referralCode}`, "Condividi BOOM →"),
        { key: "support", label: "Assistenza", value: "valentino@boom-rome.com", attributedValue: `<a href="${SUPPORT_WA}">WhatsApp</a>` },
      ]),
    },
    voided: !!isVoided,
    barcodes: [{ format: "PKBarcodeFormatQR", message: `BOOM:REFERRAL:${referralCode}`, messageEncoding: "iso-8859-1", altText: referralCode }],
    userInfo: { referrerId, type: "referral", referralCode },
  };
  const exp = safeDate(programEndDate);
  if (exp) pass.expirationDate = exp.toISOString();
  return pass;
}

const BUILDERS = {
  tenant: buildTenantPass,
  silver: buildSilverPass,
  landlord: buildLandlordPass,
  viewing: buildViewingPass,
  referral: buildReferralPass,
};

// Export builders + signer for the studio (pass-issue) and web service (pass-update)
export { BUILDERS, loadAssets, generateAuthToken, PASS_TYPE_ID, TEAM_ID, WEB_SERVICE_URL };

// Build + sign a .pkpass for {type, data}. Returns { buffer, passJson }.
export function buildAndSign(type, data) {
  const builder = BUILDERS[type];
  if (!builder) throw new Error("Unknown pass type: " + type);
  const passJson = builder(data || {});
  const assets = loadAssets(type);
  // storeCards read cleaner WITHOUT the strip band behind the fields.
  if (type === "tenant" || type === "silver" || type === "landlord") {
    delete assets["strip.png"]; delete assets["strip@2x.png"]; delete assets["strip@3x.png"];
  }
  assets["pass.json"] = Buffer.from(JSON.stringify(passJson));
  const pass = new PKPass(assets, { signerCert, signerKey, signerKeyPassphrase, wwdr });
  return { buffer: pass.getAsBuffer(), passJson };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  const allowedOrigins = ["https://boomrome.com", "https://www.boomrome.com"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { type = "tenant", data } = req.body || {};
    if (!data) return res.status(400).json({ error: "Missing data" });
    if (!BUILDERS[type]) return res.status(400).json({ error: "Unknown type: " + type });

    const { buffer: buf, passJson } = buildAndSign(type, data);

    // Track the pass so the web service can push updates to it later.
    try {
      const serial = passJson.serialNumber;
      const entityId = String(serial).split("-").slice(1).join("-");
      await fsPatch(`passMeta/${serial}`, { type, entityId, serial, updatedAt: new Date(), lastBuiltAt: new Date() });
    } catch (e) { /* tracking is best-effort */ }

    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename=boom-${type}-${passJson.serialNumber.slice(-12)}.pkpass`);
    res.setHeader("X-Pass-Serial", passJson.serialNumber);
    return res.send(buf);
  } catch (err) {
    console.error("PropPass error:", err);
    return res.status(500).json({ error: "Failed to generate pass", detail: err.message });
  }
}
