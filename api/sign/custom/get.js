// api/sign/custom/get.js
// Tailored-PDF ("Magic Sign Custom") read mediator. Resolves a `signRequests`
// doc for a given role using the role's token, and returns only what the signer
// UI needs to render the PDF + the fields they must fill. Mirrors the
// token-gated, server-authoritative pattern of /api/sign/get.
//
// Request:  POST { req, role, token }
// Response: { ok, title, role, pageCount, originalPdfUrl, fields, requiredRoles,
//             alreadySigned, signers:[{role,name,signed}] }

import { fsGet, secretEqual } from '../../homie/_lib.js';

const ALLOWED_ORIGINS = new Set(['https://www.boomrome.com', 'https://boomrome.com']);
const RL = new Map(); const RL_MAX = 30; const RL_WINDOW = 60_000;
function rateOk(ip){ const n=Date.now(); const e=RL.get(ip); if(!e||n-e.t>=RL_WINDOW){RL.set(ip,{c:1,t:n});return true;} e.c++; return e.c<=RL_MAX; }
function setCors(req,res){ const o=req.headers.origin; if(o&&ALLOWED_ORIGINS.has(o)){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');} res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); }

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ ok:false, error:'method_not_allowed' }); }

  const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  if (!rateOk(ip)) { res.setHeader('Retry-After','60'); return res.status(429).json({ ok:false, error:'rate_limited' }); }

  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const reqId = body && typeof body.req === 'string' ? body.req.trim() : '';
  const role  = body && typeof body.role === 'string' ? body.role.trim() : '';
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  if (!reqId || reqId.length>200 || !token || token.length>200 || !(role==='tenant'||role==='landlord')) {
    return res.status(400).json({ ok:false, error:'bad_request' });
  }

  try {
    const doc = await fsGet(`signRequests/${reqId}`);
    if (!doc) return res.status(404).json({ ok:false, error:'not_found' });
    const signers = doc.signers || {};
    const mine = signers[role];
    if (!mine || !mine.token || !secretEqual(token, String(mine.token))) {
      return res.status(401).json({ ok:false, error:'invalid_token' });
    }

    const required = Array.isArray(doc.requiredRoles) && doc.requiredRoles.length ? doc.requiredRoles : Object.keys(signers);
    const myFields = (Array.isArray(doc.fields) ? doc.fields : []).filter(f => f && f.role === role);
    const signerSummary = required.map(r => ({ role:r, name:(signers[r] && signers[r].name) || '', signed: !!(signers[r] && signers[r].signedAt) }));

    res.setHeader('Cache-Control','private, no-store');
    return res.status(200).json({
      ok: true,
      title: doc.title || 'Document',
      role,
      pageCount: doc.pageCount || 0,
      originalPdfUrl: doc.originalPdfUrl || '',
      fields: myFields,
      requiredRoles: required,
      alreadySigned: !!mine.signedAt,
      status: doc.status || 'sent',
      signers: signerSummary
    });
  } catch (e) {
    return res.status(502).json({ ok:false, error:'upstream', detail:String((e&&e.message)||e) });
  }
}
