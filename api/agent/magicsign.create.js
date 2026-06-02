// api/agent/magicsign.create.js — Tool: agent.magicsign.create  (Tier 2)
//
// Creates a Magic Sign Custom request in Firestore (signRequests collection).
// Same schema the portal reads/writes in saveMagicSignRequest() — so once the
// record is in Firestore, the portal's "Magic Sign — Richieste" panel picks
// it up real-time and the signing/embedding flow works as if a human had
// dropped the PDF in the editor.
//
// Body: {
//   title:          string                     required
//   pdfUrl:         string (https)             required  — PDF already uploaded
//                                              somewhere reachable. For the
//                                              built-in 'transitorio' /
//                                              'studenti' contracts the
//                                              portal generates the PDF
//                                              on-demand; for custom PDFs
//                                              the Mac side should upload
//                                              to Firebase Storage first
//                                              (or any public URL).
//   pageCount:      number                     required
//   fields:         array                      required (≥1) — {page,type,role,kind,xr,yr,wr,hr}
//   signers:        { tenant?, landlord? }     at least one — {name,email,userId?}
//   propertyId?:    string
//   contractId?:    string                     link back to a contract draft
//   leadId?:        string                     link back to a converted lead
// }

import { fsCreate, logActivity, guardPost, okJson, errJson } from './_lib.js';

const VALID_KINDS = new Set(['signature', 'date', 'initials']);
const VALID_ROLES = new Set(['tenant', 'landlord']);

function uuid() {
  // 24-char random token, no dashes
  const a = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a);
  else for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  const errors = [];
  const title = String(body.title || '').trim();
  if (!title) errors.push('title required');
  if (!body.pdfUrl || !/^https?:\/\//.test(body.pdfUrl)) errors.push('pdfUrl must be a public https URL');
  if (typeof body.pageCount !== 'number' || body.pageCount < 1) errors.push('pageCount required (positive integer)');
  if (!Array.isArray(body.fields) || body.fields.length === 0) errors.push('fields[] required (>=1)');
  if (!body.signers || (!body.signers.tenant && !body.signers.landlord)) errors.push('signers.tenant or signers.landlord required');
  if (errors.length) return errJson(res, 400, 'validation', errors);

  // Validate fields
  for (const f of body.fields) {
    if (!Number.isInteger(f.page) || f.page < 1 || f.page > body.pageCount) errors.push(`field.page out of range`);
    if (!VALID_KINDS.has(f.kind)) errors.push(`field.kind must be ${[...VALID_KINDS].join(' | ')}`);
    if (!VALID_ROLES.has(f.role)) errors.push(`field.role must be ${[...VALID_ROLES].join(' | ')}`);
    for (const k of ['xr', 'yr', 'wr', 'hr']) {
      if (typeof f[k] !== 'number' || f[k] < 0 || f[k] > 1) errors.push(`field.${k} must be a ratio in [0,1]`);
    }
  }
  if (errors.length) return errJson(res, 400, 'validation', errors);

  const requiredRoles = new Set();
  body.fields.forEach(f => requiredRoles.add(f.role));
  const signers = {};
  for (const role of requiredRoles) {
    const s = body.signers[role];
    if (!s || (!s.email && !s.userId)) return errJson(res, 400, `signers.${role} requires {email or userId, name}`);
    signers[role] = {
      name: s.name || (role === 'tenant' ? 'Inquilino' : 'Locatore'),
      email: s.email || null, userId: s.userId || null,
      token: uuid(), signatureImg: null, signedAt: null,
    };
  }

  const doc = {
    title,
    propertyId: body.propertyId || null,
    contractId: body.contractId || null,
    leadId: body.leadId || null,
    originalPdfUrl: body.pdfUrl,
    originalPdfPath: body.pdfPath || null,    // empty if PDF was hosted externally
    pageCount: body.pageCount,
    fields: body.fields.map(f => ({
      id: 'f' + Math.random().toString(36).slice(2, 10),
      page: f.page, type: f.type || (f.role + '_' + f.kind),
      kind: f.kind, role: f.role,
      xr: f.xr, yr: f.yr, wr: f.wr, hr: f.hr,
    })),
    signers,
    requiredRoles: [...requiredRoles],
    signedPdfUrl: null, signedPdfPath: null,
    status: 'sent',
    createdAt: new Date(),
    createdBy: 'agent',
  };

  try {
    const { id } = await fsCreate('signRequests', doc);
    await logActivity('Magic Sign creato (agent)', 'contract', { id, title, roles: [...requiredRoles] });
    // Return per-role signing links the Mac side can hand to Homie/Telegram.
    const links = {};
    for (const role of requiredRoles) {
      links[role] = `https://boomrome.com/portal.html?csign=${id}&role=${role}&t=${signers[role].token}`;
    }
    return okJson(res, { id, signLinks: links });
  } catch (e) { return errJson(res, 500, e.message); }
}
