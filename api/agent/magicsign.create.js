// Agent transport shares the same sealed-PDF protocol as the authenticated admin editor.
// Upload first to signRequests/<reqId>/original.pdf. reqId is the caller's stable retry key.
import { guardPost, okJson, errJson } from './_lib.js';
import { createRequest, storagePath } from '../sign/custom/_protocol.js';

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  try {
    const doc = await createRequest({ ...body, reqId: body.reqId || storagePath(body.originalPdfUrl || body.pdfUrl).split('/')[1], originalPdfUrl: body.originalPdfUrl || body.pdfUrl,
      originalPdfPath: body.originalPdfPath || body.pdfPath }, body._actor || 'agent');
    const signLinks = Object.fromEntries(doc.requiredRoles.map(role => [role,
      `https://www.boomrome.com/sign?csign=${encodeURIComponent(doc.reqId)}&role=${role}&t=${encodeURIComponent(doc.signers[role].token)}`]));
    return okJson(res, { id: doc.reqId, reqId: doc.reqId, signLinks, documentVersion: doc.documentVersion, documentHash: doc.documentHash });
  } catch (e) { return errJson(res, e.status || 502, e.code || 'upstream'); }
}
