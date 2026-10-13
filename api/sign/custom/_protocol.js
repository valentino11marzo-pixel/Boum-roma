// One protocol for browser and agent-created tailored PDFs. No signing terms are generated here.
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { fsGetVersioned, fsCommit, getAdminToken } from '../../homie/_lib.js';

export const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const CONSENT = 'I confirm my identity and accept this document. This digital signature is legally valid (FES — Art. 21 CAD).';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const validId = value => typeof value === 'string' && /^[\w-]{1,180}$/.test(value);
export function fail(code, status = 409) { const e = new Error(code); e.code = code; e.status = status; throw e; }
export function bodyOf(req) { try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return {}; } }

export function storagePath(value) {
  let u; try { u = new URL(value); } catch { fail('invalid_pdf_url', 400); }
  const prefix = `/v0/b/${BUCKET}/o/`;
  if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com' || u.port || u.username || u.password || !u.pathname.startsWith(prefix)) fail('invalid_pdf_url', 400);
  let path; try { path = decodeURIComponent(u.pathname.slice(prefix.length)); } catch { fail('invalid_pdf_url', 400); }
  if (!/^signRequests\/[\w-]{1,180}\/(?:original\.pdf|sealed\/[a-f0-9]{64}(?:-[a-f0-9-]{36})?\.pdf)$/.test(path)) fail('invalid_pdf_path', 400);
  return path;
}
export async function readPdf(url) {
  storagePath(url);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) fail('original_unavailable', 502);
  return readBounded(response);
}
async function readBounded(response) {
  if (Number(response.headers.get('content-length')) > MAX_PDF_BYTES) fail('pdf_too_large', 400);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > MAX_PDF_BYTES) { fail('pdf_too_large', 400); } chunks.push(Buffer.from(chunk)); }
  const bytes = Buffer.concat(chunks);
  if (!bytes.length) fail('invalid_pdf', 400);
  return bytes;
}
export async function uploadPdf(path, bytes) {
  const token = await getAdminToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: bytes, signal: AbortSignal.timeout(20000) });
  if (!response.ok) fail('pdf_upload_failed', 502);
  let meta = await response.json();
  if (!meta.downloadTokens) {
    const metadata = await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (metadata.ok) meta = await metadata.json();
  }
  const downloadToken = String(meta.downloadTokens || '').split(',')[0];
  if (!downloadToken) fail('pdf_download_unavailable', 502);
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
  // A saved URL is not proof that a signer can open it. Probe without admin credentials.
  const probe = await fetch(publicUrl, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!probe.ok) fail('pdf_download_unavailable', 502);
  const actual = await readBounded(probe);
  if (hash(actual) !== hash(bytes)) fail('pdf_download_unavailable', 502);
  return publicUrl;
}
function text(value, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
// Canonical semantic fields: transient editor IDs/types never change what gets signed.
export function terms(input) {
  if (!text(input.title) || !Number.isInteger(input.pageCount) || input.pageCount < 1 || input.pageCount > 200) fail('invalid_document', 400);
  if (!Array.isArray(input.fields) || !input.fields.length || input.fields.length > 200) fail('invalid_fields', 400);
  const fields = input.fields.map(f => {
    if (!f || !['tenant', 'landlord'].includes(f.role) || !['signature', 'initials', 'date'].includes(f.kind) || !Number.isInteger(f.page) || f.page < 1 || f.page > input.pageCount) fail('invalid_fields', 400);
    for (const k of ['xr', 'yr', 'wr', 'hr']) if (!Number.isFinite(f[k]) || f[k] < 0 || f[k] > 1) fail('invalid_fields', 400);
    if (f.wr <= 0 || f.hr <= 0 || f.xr + f.wr > 1.000001 || f.yr + f.hr > 1.000001) fail('invalid_fields', 400);
    return { page: f.page, role: f.role, kind: f.kind, xr: f.xr, yr: f.yr, wr: f.wr, hr: f.hr };
  });
  const requiredRoles = [...new Set(fields.map(f => f.role))].sort();
  if (input.requiredRoles && (!Array.isArray(input.requiredRoles) || JSON.stringify([...input.requiredRoles].sort()) !== JSON.stringify(requiredRoles))) fail('invalid_roles', 400);
  const signers = {};
  for (const role of requiredRoles) {
    if (!fields.some(f => f.role === role && f.kind === 'signature')) fail('signature_field_required', 400);
    const s = input.signers?.[role];
    if (!s || !text(s.name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(s.email))) fail('signer_required', 400);
    signers[role] = { name: text(s.name) || (role === 'tenant' ? 'Inquilino' : 'Locatore'), email: text(s.email) || null, userId: text(s.userId) || null };
  }
  const refs = {};
  for (const key of ['propertyId', 'contractId', 'leadId']) { if (input[key] && !validId(input[key])) fail('invalid_reference', 400); refs[key] = input[key] || null; }
  return { title: text(input.title), pageCount: input.pageCount, ...refs, fields, requiredRoles, signers };
}
export function documentHash(doc) { return hash(JSON.stringify({ version: 1, pdfHash: doc.pdfHash, terms: terms(doc) })); }
export function verifyDocument(doc, body) {
  if (doc.documentVersion !== 1 || !doc.documentHash || !doc.pdfHash) fail(Object.values(doc.signers || {}).some(s => s.signedAt) ? 'legacy_signed_review_required' : 'legacy_migration_required');
  let expected; try { expected = documentHash(doc); } catch { fail('document_changed'); }
  if (expected !== doc.documentHash) fail('document_changed');
  if (body && (body.documentVersion !== doc.documentVersion || body.documentHash !== doc.documentHash)) fail('document_changed');
  for (const role of doc.requiredRoles) {
    const s = doc.signers[role];
    if (s.signedAt && (s.documentHash !== doc.documentHash || s.documentVersion !== doc.documentVersion)) fail('signature_version_mismatch');
  }
}
export async function verifiedBytes(doc) {
  const bytes = await readPdf(doc.originalPdfUrl);
  if (hash(bytes) !== doc.pdfHash) fail('document_changed');
  return bytes;
}
export async function createRequest(body, actor) {
  const reqId = body.reqId;
  if (!validId(reqId)) fail('invalid_request_id', 400);
  const input = terms(body);
  const sourceUrl = body.originalPdfUrl || body.pdfUrl;
  const sourcePath = storagePath(sourceUrl);
  if (sourcePath !== `signRequests/${reqId}/original.pdf` || (body.originalPdfPath && body.originalPdfPath !== sourcePath)) fail('invalid_pdf_path', 400);
  const bytes = await readPdf(sourceUrl);
  let pdf; try { pdf = await PDFDocument.load(bytes); } catch { fail('invalid_pdf', 400); }
  if (pdf.getPageCount() !== input.pageCount) fail('page_count_mismatch', 400);
  // pdf.js applies page rotation/cropping; the embedding coordinates currently do not.
  for (const page of pdf.getPages()) {
    const media = page.getMediaBox(), crop = page.getCropBox();
    if (page.getRotation().angle % 360 || media.x || media.y || ['x','y','width','height'].some(k => crop[k] !== media[k])) fail('unsupported_pdf_geometry', 400);
  }
  const pdfHash = hash(bytes);
  const expectedHash = documentHash({ ...input, pdfHash });
  const path = `signRequests/${reqId}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const old = await fsGetVersioned(path);
    if (old?.data.documentVersion) {
      verifyDocument(old.data);
      if (old.data.documentHash !== expectedHash) fail('request_id_conflict');
      return { reqId, ...old.data };
    }
    if (old && Object.values(old.data.signers || {}).some(s => s.signedAt)) fail('legacy_signed_review_required');
    if (old && body.migrateLegacy !== true) fail('legacy_migration_required');
    if (old && JSON.stringify(terms(old.data)) !== JSON.stringify(input)) fail('legacy_document_mismatch');
    const originalPdfPath = `${path}/sealed/${pdfHash}-${randomUUID()}.pdf`;
    const originalPdfUrl = await uploadPdf(originalPdfPath, bytes);
    const signers = {};
    for (const role of input.requiredRoles) signers[role] = { ...input.signers[role], token: old?.data.signers?.[role]?.token || randomUUID(), signedAt: null, signatureImg: null };
    const doc = { ...input, signers, documentVersion: 1, documentHash: expectedHash, pdfHash, originalPdfPath, originalPdfUrl,
      sourcePdfPath: sourcePath, status: 'ready', signedPdfUrl: null, signedPdfPath: null,
      createdAt: old?.data.createdAt || new Date().toISOString(), createdBy: old?.data.createdBy || actor,
      ...(old ? { migratedAt: new Date().toISOString(), migratedBy: actor } : {}) };
    try { await fsCommit([{ docPath: path, fields: doc, precondition: old ? { updateTime: old.updateTime } : { exists: false } }]); return { reqId, ...doc }; }
    catch (e) { if (!e.conflict) throw e; }
  }
  fail('concurrent_update');
}
export function createResult(doc) {
  return { ok: true, reqId: doc.reqId, documentVersion: doc.documentVersion, documentHash: doc.documentHash, status: doc.status,
    signers: Object.fromEntries(doc.requiredRoles.map(role => [role, { ...terms(doc).signers[role], token: doc.signers[role].token }])) };
}
