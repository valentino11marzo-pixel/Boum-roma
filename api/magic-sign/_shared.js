// api/magic-sign/_shared.js
// Helpers specific to the Magic-Sign flow. Reuses the admin-token plumbing
// from /api/homie/_lib.js — Magic-Sign endpoints are open to anonymous
// callers but authorize via the single-use signing token carried in the URL.

import { fsList, FS_BASE, getAdminToken, toFsFields, fsDocToJs } from '../homie/_lib.js';

// Documento + updateTime: serve al write di firma per la precondizione
// ottimistica (currentDocument.updateTime) che chiude la race del doppio
// submit — fsGet normale scarta l'updateTime.
export async function fsGetWithTime(docPath) {
  const token = await getAdminToken();
  const r = await fetch(`${FS_BASE}/${docPath}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('fsGetWithTime_' + r.status);
  const doc = await r.json();
  return { data: fsDocToJs(doc), updateTime: doc.updateTime || null };
}

// ── CO-FIRMA: token DERIVATI per i co-conduttori ─────────────────────────
// Stesso pattern di scheda/manageToken: sha256("cosign:<contractId>:<idx>:
// <HOMIE_SECRET>") — niente da memorizzare, niente query dentro array,
// ogni contratto con coTenants[] ha GIÀ i suoi link (zero migrazione),
// ruotare il secret revoca tutto. Il ref viaggia nello stesso parametro
// ?sign= come "<contractId>.c<idx>.<token>".
import crypto from 'node:crypto';

export function cosignToken(contractId, idx) {
  const salt = process.env.HOMIE_SECRET || process.env.CRON_SECRET || 'boom';
  return crypto.createHash('sha256')
    .update(`cosign:${contractId}:${idx}:${salt}`).digest('hex').slice(0, 24);
}
export const cosignRef = (contractId, idx) => `${contractId}.c${idx}.${cosignToken(contractId, idx)}`;

export function parseCoSignRef(token) {
  const m = /^([A-Za-z0-9_-]{4,80})\.c(\d{1,2})\.([a-f0-9]{24})$/.exec(String(token || ''));
  if (!m) return null;
  const idx = Number(m[2]);
  const expect = cosignToken(m[1], idx);
  const a = Buffer.from(m[3]), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { contractId: m[1], idx };
}

// Look up a contract by tenantSignToken, landlordSignToken or a derived
// co-sign ref. Returns { contract, role, coIndex? } or null.
export async function findContractByToken(token) {
  if (!token || typeof token !== 'string' || token.length < 8) return null;

  // Co-firma: il ref è auto-verificante — niente query, si carica per ID.
  const co = parseCoSignRef(token);
  if (co) {
    const { fsGet } = await import('../homie/_lib.js');
    const contract = await fsGet('contracts/' + co.contractId).catch(() => null);
    if (!contract) return null;
    const list = Array.isArray(contract.coTenants) ? contract.coTenants : [];
    if (!list[co.idx] || !list[co.idx].name) return null;
    return { contract: { ...contract, id: co.contractId }, role: 'cotenant', coIndex: co.idx };
  }

  // tenantSignToken first (most common path)
  let hits = await fsList('contracts', {
    filter: { field: 'tenantSignToken', op: 'EQUAL', value: token },
    limit: 2,
  });
  if (hits.length === 1) return { contract: hits[0], role: 'tenant' };
  if (hits.length > 1) return null; // ambiguous → reject

  hits = await fsList('contracts', {
    filter: { field: 'landlordSignToken', op: 'EQUAL', value: token },
    limit: 2,
  });
  if (hits.length === 1) return { contract: hits[0], role: 'landlord' };
  return null;
}

// Lato-conduttori completo = conduttore principale + TUTTI i co-conduttori.
// È la condizione che sblocca la controfirma del locatore (sequenziale).
export function tenantSideComplete(contract) {
  if (!contract || !contract.tenantSignature) return false;
  const list = Array.isArray(contract.coTenants) ? contract.coTenants : [];
  return list.filter(x => x && x.name).every(x => !!x.signature);
}

// Apply server-side timestamp via a Firestore field transform. The plain
// fsPatch helper writes fields literally; some cascading updates want
// serverTimestamp() for createdAt / updatedAt. We do those through :commit.
//
// `writes` is an array of { docPath, fields, serverTimestampFields,
// precondition? } — precondition.updateTime rende il write CONDIZIONATO
// (Firestore risponde FAILED_PRECONDITION se il documento è cambiato nel
// frattempo): è il lucchetto ottimistico del write di firma.
export async function commitWrites(writes) {
  const token = await getAdminToken();
  // Il name di un write è un RESOURCE NAME ("projects/<p>/databases/(default)/
  // documents/<path>"), NON un URL: FS_BASE è l'endpoint REST completo e va
  // spogliato dell'origine. Col prefisso https:// Firestore risponde
  // 400 INVALID_ARGUMENT ("Document name ... is invalid") — il bug che il
  // 2026-08-02 bloccava OGNI firma in produzione mentre lo stub dei test,
  // permissivo sui nomi, lasciava passare tutto.
  const resourceBase = FS_BASE.replace(/^https?:\/\/[^/]+\/v1\//, '');
  const body = {
    writes: writes.map(w => {
      const update = {
        name: `${resourceBase}/${w.docPath}`,
        fields: toFsFields(w.fields || {}),
      };
      const updateMask = Object.keys(w.fields || {});
      const fieldTransforms = (w.serverTimestampFields || []).map(f => ({
        fieldPath: f,
        setToServerValue: 'REQUEST_TIME',
      }));
      const write = { update };
      if (updateMask.length) write.updateMask = { fieldPaths: updateMask };
      if (fieldTransforms.length) write.updateTransforms = fieldTransforms;
      if (w.precondition && w.precondition.updateTime) write.currentDocument = { updateTime: w.precondition.updateTime };
      return write;
    }),
  };
  const res = await fetch(`${FS_BASE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore commit failed (${res.status}): ${txt}`);
  }
  return await res.json();
}

export function setCors(req, res) {
  const origin = req.headers.origin || '';
  // Own domains + THIS project's Vercel previews only — a bare endsWith
  // ('.vercel.app') would whitelist anyone's Vercel deployment.
  const allowed = ['https://www.boomrome.com', 'https://boomrome.com'];
  const isPreview = origin.startsWith('https://boum-roma-') && origin.endsWith('.vercel.app');
  if (allowed.includes(origin) || isPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Best-effort per-IP rate limit (per warm instance) — same pattern as
// api/sign/custom/*. Returns false when the caller is over the window cap.
const RL = new Map();
export function rateOk(req, max = 30, windowMs = 60_000) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const e = RL.get(ip);
  if (!e || now - e.t >= windowMs) { RL.set(ip, { c: 1, t: now }); return true; }
  e.c += 1;
  return e.c <= max;
}
