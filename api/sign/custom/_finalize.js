import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fsGetVersioned, fsCommit, fsCreate } from '../../homie/_lib.js';
import { sendEmail } from '../../agent/_lib.js';
import { hash, fail, verifyDocument, verifiedBytes, uploadPdf } from './_protocol.js';

function dataUrlToBytes(d){
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(d || '');
  if (!m) return null;
  return { kind: m[1].toLowerCase().startsWith('jp') ? 'jpg' : 'png', bytes: Buffer.from(m[2], 'base64') };
}

export async function buildSignedPdf(originalBytes, fields, signers){
  const pdf = await PDFDocument.load(originalBytes);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const imgCache = {};
  async function img(role){
    if (imgCache[role] !== undefined) return imgCache[role];
    const sig = signers[role] && signers[role].signatureImg;
    const parsed = sig ? dataUrlToBytes(sig) : null;
    let embedded = null;
    if (parsed) embedded = parsed.kind === 'jpg' ? await pdf.embedJpg(parsed.bytes) : await pdf.embedPng(parsed.bytes);
    imgCache[role] = embedded;
    return embedded;
  }
  for (const f of (fields || [])) {
    if (!f) continue;
    var pi = (typeof f.page === 'number' ? f.page : parseInt(f.page, 10)) || 1;
    if (pi >= 1) pi = pi - 1;             // editor pages are 1-based; pdf-lib is 0-based
    if (pi < 0 || pi >= pages.length) fail('invalid_fields');
    const page = pages[pi];
    const { width: pw, height: ph } = page.getSize();
    const x = (Number(f.xr) || 0) * pw;
    const w = (Number(f.wr) || 0.18) * pw;
    const h = (Number(f.hr) || 0.05) * ph;
    const yTop = (Number(f.yr) || 0) * ph;
    const y = ph - yTop - h;             // top-left ratio → pdf-lib bottom-left
    if (f.kind === 'date') {
      const signedAt = signers[f.role] && signers[f.role].signedAt;
      const when = signedAt && new Date(signedAt);
      if (!when || Number.isNaN(when.getTime())) throw new Error('missing_signer_date_' + f.role);
      const signingDate = when.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
      const size = Math.max(8, Math.min(14, h * 0.7));
      page.drawText(signingDate, { x: x + 2, y: y + (h - size) / 2, size, font, color: rgb(0.05, 0.05, 0.05) });
    } else {
      const im = await img(f.role);
      if (!im) fail('missing_signature_image');
      if (im) {
        // preserve aspect ratio within the field box
        const ar = im.width / im.height;
        let dw = w, dh = w / ar;
        if (dh > h) { dh = h; dw = h * ar; }
        page.drawImage(im, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
      }
    }
  }
  return await pdf.save();
}

export async function validateSignature(signature) {
  if (typeof signature !== 'string' || signature.length < 50 || signature.length > 3_000_000) fail('bad_signature', 400);
  const image = dataUrlToBytes(signature); if (!image) fail('bad_signature', 400);
  try { const pdf = await PDFDocument.create(); const embedded = image.kind === 'jpg' ? await pdf.embedJpg(image.bytes) : await pdf.embedPng(image.bytes); if (!embedded.width || !embedded.height || embedded.width * embedded.height > 16000000) fail('bad_signature', 400); }
  catch { fail('bad_signature', 400); }
}
export const allSigned = doc => doc.requiredRoles.every(role => !!doc.signers[role]?.signedAt);
export function result(doc) {
  const complete = doc.status === 'complete' && !!doc.signedPdfUrl;
  return { ok: true, complete, finalizationPending: !complete && allSigned(doc), signedPdfUrl: complete ? doc.signedPdfUrl : '', status: doc.status };
}
async function notification(reqId, doc, complete) {
  const type = complete ? 'document.signed' : 'document.finalization_failed';
  const id = `${complete ? 'docsigned' : 'docfinalize-failed'}-${reqId}-${doc.documentVersion}`;
  try { await fsCreate('agentNotifications', { type, summary: complete ? 'Documento firmato: PDF pronto' : 'Firme raccolte: PDF finale da recuperare', priority: 'high', ref: { collection: 'signRequests', id: reqId }, payload: { reqId, title: doc.title, signedPdfUrl: complete ? doc.signedPdfUrl : '' }, dedupKey: id, status: 'pending', actor: 'magic-sign-custom', createdAt: new Date().toISOString(), attempts: 0 }, id); }
  catch (e) { if (!e.exists) console.warn('[custom/sign] notification unavailable'); }
}
// Called only by the winner of a conditional transition. Retrying a PDF never resends copies.
// Delivery remains best effort: a crash after the transition must not claim a sent email.
export async function deliver(reqId, doc, justSignedRole) {
  const completed = !justSignedRole;
  const safe = s => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const recipients = doc.requiredRoles.filter(role => doc.signers[role]?.email && (completed || !doc.signers[role].signedAt));
  if (!recipients.length) return;
  let delivery = 'sent';
  try {
    const jobs = recipients.map(role => {
      const s = doc.signers[role];
      const url = completed ? doc.signedPdfUrl : `https://www.boomrome.com/sign?csign=${encodeURIComponent(reqId)}&role=${role}&t=${encodeURIComponent(s.token)}`;
      return sendEmail({ to: s.email, subject: `${completed ? 'Documento firmato' : 'Documento da firmare'} — ${doc.title}`, html: `<p>Ciao ${safe(s.name)},</p><p>${completed ? 'Il PDF firmato è pronto.' : 'È disponibile il documento per la tua firma.'}</p><p><a href="${safe(url)}">${completed ? 'Scarica il PDF firmato' : 'Apri il documento'}</a></p>` });
    });
    let timer; try { await Promise.race([Promise.all(jobs), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('delivery_unknown')), 10000); })]); }
    finally { clearTimeout(timer); }
  } catch { delivery = 'unknown'; }
  // A network failure/timeout may have happened after SMTP accepted a message. Never retry it implicitly.
  const key = completed ? 'copyDelivery' : 'reminderDelivery';
  for (let i = 0; i < 3; i++) {
    const current = await fsGetVersioned(`signRequests/${reqId}`);
    if (!current || current.data.documentHash !== doc.documentHash) return;
    try { await fsCommit([{ docPath: `signRequests/${reqId}`, fields: { [key]: { status: delivery, at: new Date().toISOString() } }, precondition: { updateTime: current.updateTime } }]); return; } catch (e) { if (!e.conflict) return; }
  }
}
function signatureFingerprint(doc) {
  const keys = ['token', 'signatureImg', 'signedAt', 'signIP', 'signUA', 'consentText', 'consentHash', 'consentAt', 'documentVersion', 'documentHash', 'pdfHash'];
  return hash(JSON.stringify([...doc.requiredRoles].sort().map(role => [role, ...keys.map(key => doc.signers[role]?.[key] ?? null)])));
}
export async function finalize(reqId, binding) {
  const path = `signRequests/${reqId}`;
  let leased;
  const leaseId = randomUUID();
  for (let i = 0; i < 5; i++) {
    const current = await fsGetVersioned(path); if (!current) fail('not_found', 404);
    const doc = current.data; verifyDocument(doc, binding);
    if (!allSigned(doc) || (doc.status === 'complete' && doc.signedPdfUrl)) return result(doc);
    if (doc.finalizationLease?.expiresAt > new Date().toISOString()) return result(doc);
    const fields = { status: 'finalizing', finalizationLease: { id: leaseId, expiresAt: new Date(Date.now() + 90000).toISOString() } };
    try { await fsCommit([{ docPath: path, fields, precondition: { updateTime: current.updateTime } }]); leased = { ...doc, ...fields }; break; }
    catch (e) { if (!e.conflict) throw e; }
  }
  if (!leased) fail('concurrent_update');
  let patch;
  try {
    const bytes = await verifiedBytes(leased);
    const signed = await buildSignedPdf(bytes, leased.fields, leased.signers);
    const signedPdfPath = `${path}/signed/${leased.documentHash}-${leaseId}.pdf`;
    const signedPdfUrl = await uploadPdf(signedPdfPath, Buffer.from(signed));
    patch = { status: 'complete', signedPdfPath, signedPdfUrl, signedAt: new Date().toISOString(), signedPdfError: null, finalizationLease: null, copyDelivery: { status: 'pending' } };
  } catch (e) { patch = { status: 'finalization_failed', signedPdfError: e.code || 'pdf_finalization_failed', finalizationLease: null }; }
  for (let i = 0; i < 5; i++) {
    const current = await fsGetVersioned(path); if (!current) fail('not_found', 404);
    verifyDocument(current.data, binding);
    if (current.data.finalizationLease?.id !== leaseId) return result(current.data);
    if (signatureFingerprint(current.data) !== signatureFingerprint(leased)) fail('signature_changed');
    try {
      await fsCommit([{ docPath: path, fields: patch, precondition: { updateTime: current.updateTime } }]);
      const final = { ...current.data, ...patch };
      await notification(reqId, final, patch.status === 'complete');
      if (patch.status === 'complete') await deliver(reqId, final).catch(() => {});
      return result(final);
    } catch (e) { if (!e.conflict) throw e; }
  }
  fail('concurrent_update');
}
