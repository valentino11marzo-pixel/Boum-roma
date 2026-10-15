import { fsGet, secretEqual } from '../../homie/_lib.js';
import { setCors } from '../../_auth.js';
import { bodyOf, validId, fail, verifyDocument } from './_protocol.js';

const rates = new Map();
export default async function handler(req, res) {
  setCors(req, res); res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
  const rate = rates.get(ip); const now = Date.now();
  if (rate && now - rate.at < 60000 && rate.count++ >= 30) return res.status(429).json({ ok: false, error: 'rate_limited' });
  if (!rate || now - rate.at >= 60000) rates.set(ip, { at: now, count: 1 });
  const { req: reqId, role, token } = bodyOf(req);
  if (!validId(reqId) || !['tenant', 'landlord'].includes(role) || typeof token !== 'string' || !token || token.length > 200) return res.status(400).json({ ok: false, error: 'bad_request' });
  try {
    const doc = await fsGet(`signRequests/${reqId}`); if (!doc) fail('not_found', 404);
    const mine = doc.signers?.[role]; if (!mine?.token || !secretEqual(token, mine.token)) fail('invalid_token', 401);
    // Completed legacy requests remain consultable; never retrofit a hash onto past signatures.
    const legacyComplete = !doc.documentVersion && doc.status === 'complete' && !!doc.signedPdfUrl && !!mine.signedAt;
    if (!legacyComplete) verifyDocument(doc);
    const required = Array.isArray(doc.requiredRoles) ? doc.requiredRoles : Object.keys(doc.signers);
    return res.status(200).json({ ok: true, title: doc.title || 'Document', role, pageCount: doc.pageCount,
      originalPdfUrl: doc.originalPdfUrl || '', fields: (doc.fields || []).filter(f => f.role === role), requiredRoles: required,
      alreadySigned: !!mine.signedAt, status: doc.status, signedPdfUrl: doc.status === 'complete' ? doc.signedPdfUrl || '' : '',
      documentVersion: doc.documentVersion || null, documentHash: doc.documentHash || null, pdfHash: doc.pdfHash || null,
      legacy: legacyComplete, finalizationPending: !legacyComplete && required.every(r => doc.signers[r]?.signedAt) && !(doc.status === 'complete' && doc.signedPdfUrl),
      signers: required.map(r => ({ role: r, name: doc.signers[r]?.name || '', signed: !!doc.signers[r]?.signedAt })) });
  } catch (e) { return res.status(e.status || 502).json({ ok: false, error: e.code || 'upstream' }); }
}
