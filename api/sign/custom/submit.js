// Token authority, viewed-document binding and conditional writes are independent guards.
import { fsGetVersioned, fsCommit, secretEqual } from '../../homie/_lib.js';
import { setCors } from '../../_auth.js';
import { bodyOf, validId, fail, CONSENT, hash, verifyDocument, verifiedBytes } from './_protocol.js';
import { validateSignature, allSigned, finalize, deliver } from './_finalize.js';

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };
const rates = new Map();
export default async function handler(req, res) {
  setCors(req, res); res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const rate = rates.get(ip); const now = Date.now();
  if (rate && now - rate.at < 60000 && rate.count++ >= 20) return res.status(429).json({ ok: false, error: 'rate_limited' });
  if (!rate || now - rate.at >= 60000) rates.set(ip, { at: now, count: 1 });
  const body = bodyOf(req); const { role, token } = body; const reqId = body.req;
  if (!validId(reqId) || !['tenant', 'landlord'].includes(role) || typeof token !== 'string' || !token || token.length > 200) return res.status(400).json({ ok: false, error: 'bad_request' });
  const path = `signRequests/${reqId}`;
  try {
    let saved = false, signedDoc;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await fsGetVersioned(path); if (!current) fail('not_found', 404);
      const doc = current.data; const mine = doc.signers?.[role];
      if (!mine?.token || !secretEqual(token, mine.token)) fail('invalid_token', 401);
      verifyDocument(doc, body);
      if (mine.signedAt) { signedDoc = doc; break; }
      if (body.op === 'retryFinalization') fail('signature_required', 400);
      if (!body.consent?.text || !body.consent?.hash) fail('missing_consent', 400);
      if (body.consent.text !== CONSENT) fail('invalid_consent_text', 400);
      if (body.consent.hash !== hash(CONSENT)) fail('invalid_consent_hash', 400);
      await validateSignature(body.signature);
      // Re-fetch bytes before accepting evidence; an overwritten Storage object must never be signed.
      await verifiedBytes(doc);
      const at = new Date().toISOString();
      const signers = { ...doc.signers, [role]: { ...mine, signatureImg: body.signature, signedAt: at, signIP: ip,
        signUA: String(req.headers['user-agent'] || '').slice(0, 200), consentText: CONSENT, consentHash: hash(CONSENT), consentAt: at,
        documentVersion: doc.documentVersion, documentHash: doc.documentHash, pdfHash: doc.pdfHash } };
      signedDoc = { ...doc, signers };
      const fields = { signers, updatedAt: at, status: allSigned(signedDoc) ? 'finalization_pending' : 'partial' };
      try { await fsCommit([{ docPath: path, fields, precondition: { updateTime: current.updateTime } }]); signedDoc = { ...signedDoc, ...fields }; saved = true; break; }
      catch (e) { if (!e.conflict) throw e; signedDoc = null; }
    }
    if (!signedDoc) fail('concurrent_update');
    if (saved && !allSigned(signedDoc)) await deliver(reqId, signedDoc, role).catch(() => {});
    const outcome = await finalize(reqId, body);
    return res.status(200).json({ ...outcome, ...(!saved ? { note: 'already_signed' } : {}) });
  } catch (e) { return res.status(e.status || 502).json({ ok: false, error: e.code || 'upstream' }); }
}
