// api/_passkit.js
// Shared Apple Wallet "LIVE" engine: turns the static .pkpass files into
// dynamic, updatable passes. Used by:
//   - api/pass-update/[...path].js  (the PassKit Web Service Apple calls)
//   - api/pass-issue.js             (admin: issue a live pass from a record)
//   - api/pass-push.js              (trigger a push when data changes)
//
// Reuses the existing signer (generate-pass.js buildAndSign) and the
// Firestore-REST helpers (homie/_lib). APNs push is CERT-BASED using the same
// Pass Type ID certificate already used for signing — so NO new .p8 key is
// strictly required (token-based can be added later via PASS_APNS_* env).
//
// Collections:
//   passRegistrations/{deviceLibraryId__serial}  device push tokens
//   passMeta/{serial}                            { type, entityId, updatedAt }

import http2 from "node:http2";
import { buildAndSign, generateAuthToken, PASS_TYPE_ID } from "./generate-pass.js";
import { FS_BASE, getAdminToken, fsGet, fsList, fsPatch } from "./homie/_lib.js";

// ── serial helpers ─────────────────────────────────────────────────────────
// serials look like "tenant-<id>", "silver-<id>", "landlord-<id>",
// "viewing-<id>", "referral-<code>".
export function parseSerial(serial) {
  const s = String(serial || "");
  const i = s.indexOf("-");
  if (i < 0) return { type: null, entityId: null };
  return { type: s.slice(0, i), entityId: s.slice(i + 1) };
}
export function authTokenForSerial(serial) {
  const { entityId } = parseSerial(serial);
  return generateAuthToken(entityId);
}
const docId = (s) => String(s).replace(/[\/#?]/g, "_");

// ── load the CURRENT data for a pass from Firestore ────────────────────────
// Maps live records → the shape each builder in generate-pass.js expects, so
// the regenerated pass always reflects reality (next payment, viewing time…).
export async function loadPassData(type, entityId) {
  if (type === "tenant" || type === "silver") {
    const c = await fsGet(`contracts/${entityId}`);
    if (!c) throw new Error("contract_not_found");
    let property = null;
    if (c.propertyId) property = await fsGet(`properties/${c.propertyId}`).catch(() => null);
    let tenantName = c.tenantName;
    if (!tenantName && c.tenantId) {
      const u = await fsGet(`users/${c.tenantId}`).catch(() => null);
      tenantName = u && (u.name || u.email);
    }
    // next unpaid payment for this contract
    let nextPaymentDate = c.nextPaymentDate || null, paymentStatus = null;
    try {
      const pays = await fsList("payments", { filter: { field: "contractId", op: "EQUAL", value: entityId }, limit: 60 });
      const now = Date.now();
      const unpaid = pays
        .filter((p) => !["paid", "cancelled"].includes(String(p.status || "").toLowerCase()))
        .map((p) => ({ ...p, due: p.dueDate ? Date.parse(p.dueDate) : null }))
        .filter((p) => p.due)
        .sort((a, b) => a.due - b.due);
      if (unpaid.length) { nextPaymentDate = new Date(unpaid[0].due).toISOString(); paymentStatus = unpaid[0].due < now ? "IN RITARDO" : "DA PAGARE"; }
      else if (pays.length) { paymentStatus = "IN REGOLA"; }
    } catch (e) {}
    const data = {
      contractId: entityId,
      tenantName: tenantName || "",
      propertyAddress: (property && (property.address || property.name)) || c.propertyAddress || "",
      propertyCity: (property && property.city) || "Roma",
      propertyCoords: property && property.lat && property.lng ? { lat: property.lat, lng: property.lng } : (property && property.coords) || null,
      contractStart: c.startDate || (c.durata && c.durata.startDate) || null,
      contractEnd: c.endDate || (c.durata && c.durata.endDate) || null,
      monthlyRent: c.rent || c.rentAmount || (c.canone && c.canone.monthly) || null,
      nextPaymentDate,
      paymentStatus,
    };
    return data;
  }

  if (type === "landlord") {
    const u = await fsGet(`users/${entityId}`);
    if (!u) throw new Error("landlord_not_found");
    let propertiesCount = 0;
    try {
      const props = await fsList("properties", { filter: { field: "ownerId", op: "EQUAL", value: entityId }, limit: 100 });
      propertiesCount = props.length;
    } catch (e) {}
    return {
      landlordId: entityId,
      landlordName: u.name || u.email || "",
      memberSince: u.memberSince || (u.createdAt ? new Date(u.createdAt).getFullYear() : new Date().getFullYear()),
      propertiesCount,
      totalRevenue: u.totalRevenue || 0,
      partnerId: u.partnerId || String(entityId).slice(0, 8).toUpperCase(),
      propertiesCoords: [],
    };
  }

  if (type === "viewing") {
    const v = await fsGet(`viewingRequests/${entityId}`);
    if (!v) throw new Error("viewing_not_found");
    let property = null;
    if (v.propertyId) property = await fsGet(`properties/${v.propertyId}`).catch(() => null);
    const status = String(v.status || "").toLowerCase();
    return {
      viewingId: entityId,
      clientName: v.clientName || v.name || "",
      propertyAddress: v.listingName || v.propertyAddress || (property && (property.address || property.name)) || "",
      propertyCity: "Roma",
      propertyCoords: property && property.lat && property.lng ? { lat: property.lat, lng: property.lng } : null,
      confirmedDateISO: v.confirmedDateTime || v.confirmedDate || v.dateTime || null,
      durationMinutes: v.durationMinutes || 30,
      meetingPoint: v.meetingPoint || "AL CITOFONO",
      isVoided: status.includes("cancel") || status.includes("annull") || v.voided === true,
    };
  }

  if (type === "referral") {
    const u = await fsGet(`users/${entityId}`).catch(() => null);
    return {
      referrerId: entityId,
      referrerName: (u && (u.name || u.email)) || "",
      referralCode: (u && u.referralCode) || entityId,
      memberSince: (u && u.memberSince) || new Date().getFullYear(),
      referralsActive: (u && u.referralsActive) || 0,
      totalEarned: (u && u.referralEarned) || 0,
    };
  }

  throw new Error("unknown_pass_type");
}

// Rebuild + sign the freshest version of a pass.
export async function getLatestPass(serial) {
  const { type, entityId } = parseSerial(serial);
  const data = await loadPassData(type, entityId);
  const { buffer, passJson } = buildAndSign(type, data);
  await touchMeta(serial, type, entityId).catch(() => {});
  return { buffer, passJson, lastModified: new Date() };
}

// ── pass meta (updatedAt drives "what changed since") ──────────────────────
export async function touchMeta(serial, type, entityId) {
  return fsPatch(`passMeta/${docId(serial)}`, {
    type: type || parseSerial(serial).type,
    entityId: entityId || parseSerial(serial).entityId,
    serial, updatedAt: new Date(),
  });
}

// ── device registrations ───────────────────────────────────────────────────
export async function registerDevice(deviceLibraryId, passTypeId, serial, pushToken) {
  await fsPatch(`passRegistrations/${docId(deviceLibraryId + "__" + serial)}`, {
    deviceLibraryId, passTypeId, serialNumber: serial, pushToken,
    updatedAt: new Date(),
  });
}
export async function unregisterDevice(deviceLibraryId, serial) {
  const token = await getAdminToken();
  const path = `passRegistrations/${docId(deviceLibraryId + "__" + serial)}`;
  await fetch(`${FS_BASE}/${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}
export async function serialsForDevice(deviceLibraryId, passTypeId, sinceTag) {
  const regs = await fsList("passRegistrations", { filter: { field: "deviceLibraryId", op: "EQUAL", value: deviceLibraryId }, limit: 200 });
  const mine = regs.filter((r) => !passTypeId || r.passTypeId === passTypeId);
  const since = sinceTag ? parseInt(sinceTag, 10) : 0;
  const out = [];
  for (const r of mine) {
    const meta = await fsGet(`passMeta/${docId(r.serialNumber)}`).catch(() => null);
    const updated = meta && meta.updatedAt ? Date.parse(meta.updatedAt) : 0;
    if (!since || updated > since) out.push(r.serialNumber);
  }
  return out;
}
export async function registrationsForSerial(serial) {
  const regs = await fsList("passRegistrations", { filter: { field: "serialNumber", op: "EQUAL", value: serial }, limit: 200 });
  return regs.map((r) => r.pushToken).filter(Boolean);
}

// ── APNs (cert-based, reuses the Pass Type ID certificate) ─────────────────
export async function apnsPush(tokens) {
  const cert = Buffer.from(process.env.PASS_CERT_BASE64 || "", "base64");
  const key = Buffer.from(process.env.PASS_KEY_BASE64 || "", "base64");
  const passphrase = process.env.PASS_KEY_PASSPHRASE || undefined;
  if (!cert.length || !key.length) return { sent: 0, errors: ["missing_pass_cert"] };
  if (!tokens.length) return { sent: 0, errors: [] };

  return await new Promise((resolve) => {
    let client;
    try { client = http2.connect("https://api.push.apple.com:443", { cert, key, passphrase }); }
    catch (e) { return resolve({ sent: 0, errors: [String(e.message)] }); }
    const results = [];
    let pending = tokens.length;
    let settled = false;
    const finish = () => { if (settled) return; settled = true; try { client.close(); } catch (e) {} resolve({ sent: results.filter((r) => r.ok).length, errors: results.filter((r) => !r.ok) }); };
    client.on("error", (e) => { if (!settled) { settled = true; resolve({ sent: 0, errors: [String(e.message)] }); } });
    const timeout = setTimeout(finish, 8000);
    for (const t of tokens) {
      const req = client.request({
        ":method": "POST", ":path": `/3/device/${t}`,
        "apns-topic": PASS_TYPE_ID, "apns-push-type": "background", "apns-priority": "5",
        "content-type": "application/json",
      });
      let status = 0, body = "";
      req.on("response", (h) => { status = h[":status"]; });
      req.on("data", (d) => { body += d; });
      req.on("end", () => { results.push({ token: t.slice(0, 8), ok: status === 200, status, body: body || null }); if (--pending === 0) { clearTimeout(timeout); finish(); } });
      req.on("error", (e) => { results.push({ token: t.slice(0, 8), ok: false, error: String(e.message) }); if (--pending === 0) { clearTimeout(timeout); finish(); } });
      req.end(JSON.stringify({})); // empty payload = "refresh this pass"
    }
  });
}

// High-level: bump updatedAt + push every device holding this pass.
export async function pushPass(serial) {
  const { type, entityId } = parseSerial(serial);
  await touchMeta(serial, type, entityId).catch(() => {});
  const tokens = await registrationsForSerial(serial);
  const result = await apnsPush(tokens);
  return { serial, devices: tokens.length, ...result };
}

export { PASS_TYPE_ID };
