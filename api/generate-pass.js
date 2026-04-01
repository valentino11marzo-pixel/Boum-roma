import { PKPass } from "passkit-generator";
import crypto from "crypto";
import path from "path";
import fs from "fs";

const signerCert = Buffer.from(process.env.PASS_CERT_BASE64 || "", "base64");
const signerKey = Buffer.from(process.env.PASS_KEY_BASE64 || "", "base64");
const signerKeyPassphrase = process.env.PASS_KEY_PASSPHRASE || "";
const PASS_TYPE_ID = "pass.com.boomrome.proppass";
const TEAM_ID = "3MFCAL4947";

function basePass() {
  return { formatVersion: 1, organizationName: "BOOM", passTypeIdentifier: PASS_TYPE_ID, teamIdentifier: TEAM_ID, backgroundColor: "rgb(8, 8, 10)", foregroundColor: "rgb(255, 255, 255)", labelColor: "rgb(212, 175, 55)", logoText: "BOOM" };
}

function loadAssets(type) {
  const dir = path.join(process.cwd(), "pass-assets", type);
  const bufs = {};
  for (const f of ["icon.png","icon@2x.png","icon@3x.png","logo.png","logo@2x.png","thumbnail.png","thumbnail@2x.png","strip.png","strip@2x.png"]) {
    try { bufs[f] = fs.readFileSync(path.join(dir, f)); } catch(e) {}
  }
  return bufs;
}

function buildViewing(d) {
  return { description:"BOOM Viewing Pass", generic: { headerFields:[{key:"date",label:"DATE",value:d.date||"TBC"}], primaryFields:[{key:"property",label:"PROPERTY",value:d.propertyAddress||"TBC"}], secondaryFields:[{key:"time",label:"TIME",value:d.time||"TBC"},{key:"zone",label:"ZONE",value:d.zone||"Rome"}], auxiliaryFields:[{key:"agent",label:"AGENT",value:d.agentName||"Valentino"},...(d.rent?[{key:"rent",label:"RENT",value:"€"+d.rent+"/mo"}]:[])], backFields:[{key:"info",label:"About BOOM",value:"BOOM is Rome's premium rental concierge.\nwww.boomrome.com\nvalentino@boom-rome.com\n+39 351 977 5583"},{key:"client",label:"Client",value:d.clientName||""}] }, barcodes:[{format:"PKBarcodeFormatQR",message:"https://boomrome.com/portal.html?viewing="+(d.viewingId||""),messageEncoding:"iso-8859-1"}] };
}

function buildTenant(d) {
  return { description:"BOOM Tenant Card", backgroundColor:"rgb(212, 175, 55)", foregroundColor:"rgb(8, 8, 10)", labelColor:"rgb(60, 50, 30)", generic: { headerFields:[{key:"contract",label:"CONTRACT",value:d.contractType||"Concordato"}], primaryFields:[{key:"home",label:"YOUR HOME",value:d.propertyAddress||""}], secondaryFields:[{key:"from",label:"FROM",value:d.startDate||""},{key:"to",label:"TO",value:d.endDate||""}], auxiliaryFields:[{key:"zone",label:"ZONE",value:d.zone||"Rome"},{key:"tenant",label:"TENANT",value:d.tenantName||""}], backFields:[{key:"landlord",label:"Landlord",value:d.landlordName||""},{key:"emergency",label:"Emergency",value:d.emergencyPhone||"+39 351 977 5583"},{key:"useful",label:"Useful Numbers",value:"Carabinieri: 112\nPolice: 113\nFire: 115\nAmbulance: 118"},{key:"info",label:"BOOM Concierge",value:"valentino@boom-rome.com\nwww.boomrome.com"}] }, barcodes:[{format:"PKBarcodeFormatQR",message:"https://boomrome.com/portal.html?tenant="+(d.contractId||""),messageEncoding:"iso-8859-1"}] };
}

function buildReferral(d) {
  const code = d.referralCode || "BOOM-"+crypto.randomBytes(3).toString("hex").toUpperCase();
  return { description:"BOOM Referral Pass", backgroundColor:"rgb(26, 20, 18)", foregroundColor:"rgb(240, 230, 218)", labelColor:"rgb(184, 149, 106)", generic: { headerFields:[{key:"reward",label:"REWARD",value:d.discount||"€100 off"}], primaryFields:[{key:"title",label:"REFERRAL",value:"Share BOOM with a friend"}], secondaryFields:[{key:"code",label:"CODE",value:code},{key:"from",label:"FROM",value:d.referrerName||""}], auxiliaryFields:[{key:"valid",label:"VALID",value:d.expirationDate||"No expiry"}], backFields:[{key:"how",label:"How It Works",value:"Share code "+code+". When they sign with BOOM, you both get "+(d.discount||"€100 off")+"."},{key:"contact",label:"Contact",value:"valentino@boom-rome.com\nwww.boomrome.com"}] }, barcodes:[{format:"PKBarcodeFormatQR",message:"https://boomrome.com/portal.html?ref="+code,messageEncoding:"iso-8859-1"}] };
}

function buildLandlord(d) {
  return { description:"BOOM Landlord Pass", backgroundColor:"rgb(0, 0, 0)", foregroundColor:"rgb(255, 255, 255)", labelColor:"rgb(120, 120, 120)", generic: { headerFields:[...(d.rentAmount?[{key:"rent",label:"RENT",value:"€"+d.rentAmount+"/mo"}]:[])], primaryFields:[{key:"property",label:"YOUR PROPERTY",value:d.propertyAddress||""}], secondaryFields:[{key:"tenant",label:"TENANT",value:d.currentTenant||"Vacant"},{key:"zone",label:"ZONE",value:d.zone||"Rome"}], auxiliaryFields:[...(d.contractEnd?[{key:"ends",label:"ENDS",value:d.contractEnd}]:[])], backFields:[{key:"owner",label:"Owner",value:d.landlordName||""},{key:"info",label:"BOOM Services",value:"Your property is managed by BOOM.\nvalentino@boom-rome.com"}] }, barcodes:[{format:"PKBarcodeFormatQR",message:"https://boomrome.com/portal.html?landlord="+(d.propertyId||""),messageEncoding:"iso-8859-1"}] };
}

const BUILDERS = { viewing: buildViewing, tenant: buildTenant, referral: buildReferral, landlord: buildLandlord };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { type = "viewing", data } = req.body;
    if (!data) return res.status(400).json({ error: "Missing data" });
    const builder = BUILDERS[type];
    if (!builder) return res.status(400).json({ error: "Unknown type: " + type });
    const passFields = builder(data);
    const serial = crypto.randomUUID();
    const assets = loadAssets(type);
    const pass = new PKPass(assets, { signerCert, signerKey, signerKeyPassphrase }, { ...basePass(), serialNumber: serial, ...passFields });
    const buf = pass.getAsBuffer();
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", "attachment; filename=boom-" + type + "-" + serial.slice(0,8) + ".pkpass");
    return res.send(buf);
  } catch (err) {
    console.error("PropPass error:", err);
    return res.status(500).json({ error: "Failed to generate pass", details: err.message });
  }
}
