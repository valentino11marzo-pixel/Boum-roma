// api/sign/custom/submit.js
// Tailored-PDF ("Magic Sign Custom") write path. Records a role's signature on
// a signRequests doc and, once every required role has signed, embeds all
// signatures into the original PDF SERVER-SIDE (pdf-lib) and uploads the signed
// PDF to Firebase Storage with the admin token. Server-side embedding renders
// once at known page dimensions — fixing the client-render coordinate drift —
// and keeps the signer page light.
//
// The signing token is the sole authority; idempotent per role. The admin
// upload requires the signRequests/** match in storage.rules (deployed via
// `firebase deploy --only storage` — NOT by the Vercel deploy).
//
// Request:  POST { req, role, token, signature(dataURL) }
// Response: { ok, complete, signedPdfUrl? }

import { fsGet, fsPatch, getAdminToken, secretEqual, FS_BASE, toFsFields } from '../../homie/_lib.js';
// pdf-lib is imported statically: a lazy `await import('pdf-lib')` is not
// traced by Vercel's bundler and fails at runtime in production.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
// pdf-lib is imported lazily inside buildSignedPdf so a load failure degrades
// to "signature recorded, PDF pending" instead of crashing the endpoint.

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

const ALLOWED_ORIGINS = new Set(['https://www.boomrome.com', 'https://boomrome.com']);
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
// Canonical document consent — must match sign.html's CONSENT_DOC.
const MS_CONSENT_DOC = 'I confirm my identity and accept this document. This digital signature is legally valid (FES — Art. 21 CAD).';
const RL = new Map(); const RL_MAX = 20; const RL_WINDOW = 60_000;
function rateOk(ip){ const n=Date.now(); const e=RL.get(ip); if(!e||n-e.t>=RL_WINDOW){RL.set(ip,{c:1,t:n});return true;} e.c++; return e.c<=RL_MAX; }
function setCors(req,res){ const o=req.headers.origin; if(o&&ALLOWED_ORIGINS.has(o)){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');} res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); }

function dataUrlToBytes(d){
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(d || '');
  if (!m) return null;
  return { kind: m[1].toLowerCase().startsWith('jp') ? 'jpg' : 'png', bytes: Buffer.from(m[2], 'base64') };
}

async function uploadPdf(path, bytes){
  const token = await getAdminToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const r = await fetch(url, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/pdf' }, body: bytes });
  if (!r.ok) throw new Error('storage_upload_' + r.status + ': ' + (await r.text()).slice(0,300));
  const meta = await r.json().catch(()=>({}));
  const dt = (meta.downloadTokens || '').split(',')[0];
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media${dt ? ('&token=' + dt) : ''}`;
}

// Embed every signed field into the original PDF. fields: [{page,role,kind,xr,yr,wr,hr}]
async function buildSignedPdf(originalBytes, fields, signers){
  const pdf = await PDFDocument.load(originalBytes);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const today = new Date().toLocaleDateString('it-IT');
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
    if (pi < 0 || pi >= pages.length) continue;
    const page = pages[pi];
    const { width: pw, height: ph } = page.getSize();
    const x = (Number(f.xr) || 0) * pw;
    const w = (Number(f.wr) || 0.18) * pw;
    const h = (Number(f.hr) || 0.05) * ph;
    const yTop = (Number(f.yr) || 0) * ph;
    const y = ph - yTop - h;             // top-left ratio → pdf-lib bottom-left
    if (f.kind === 'date') {
      const size = Math.max(8, Math.min(14, h * 0.7));
      page.drawText(today, { x: x + 2, y: y + (h - size) / 2, size, font, color: rgb(0.05, 0.05, 0.05) });
    } else {
      const im = await img(f.role);
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
  const signature = body && typeof body.signature === 'string' ? body.signature : '';
  if (!reqId || !token || !(role==='tenant'||role==='landlord')) return res.status(400).json({ ok:false, error:'bad_request' });
  if (!signature || signature.length < 50 || signature.length > 3_000_000) return res.status(400).json({ ok:false, error:'bad_signature' });

  // Consent record (same FES evidence model as the standard flow): pin the
  // text to the canonical document-consent string and verify/derive its hash.
  const nodeCrypto = await import('node:crypto');
  const sha256 = (s) => nodeCrypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
  const consent = (body && body.consent && typeof body.consent === 'object') ? body.consent : null;
  if (consent) {
    if (consent.text !== MS_CONSENT_DOC) return res.status(400).json({ ok:false, error:'invalid_consent_text' });
    const expected = sha256(MS_CONSENT_DOC);
    if (consent.hash && consent.hash !== expected) return res.status(400).json({ ok:false, error:'invalid_consent_hash' });
    consent.hash = expected;
  }

  try {
    const doc = await fsGet(`signRequests/${reqId}`);
    if (!doc) return res.status(404).json({ ok:false, error:'not_found' });
    const signers = doc.signers || {};
    const mine = signers[role];
    if (!mine || !mine.token || !secretEqual(token, String(mine.token))) return res.status(401).json({ ok:false, error:'invalid_token' });

    // idempotent
    if (mine.signedAt) return res.status(200).json({ ok:true, complete: doc.status === 'complete', signedPdfUrl: doc.signedPdfUrl || '', note:'already_signed' });

    const now = new Date();
    mine.signatureImg = signature;
    mine.signedAt = now.toISOString();
    mine.signIP = ip;
    mine.signUA = String(req.headers['user-agent'] || '').slice(0, 200);
    if (consent) {
      mine.consentText = consent.text;
      mine.consentHash = consent.hash;
      mine.consentAt = consent.at || now.toISOString();
    }

    // Write ONLY signers.{role} (per-field updateMask) — patching the whole
    // `signers` map would make two roles signing at the same moment a
    // last-write-wins race that silently drops one signature.
    {
      const adminTok = await getAdminToken();
      const fields = toFsFields({ signers: { [role]: mine }, updatedAt: now });
      const mask = ['signers.' + role, 'updatedAt'].map(f => 'updateMask.fieldPaths=' + encodeURIComponent(f)).join('&');
      const r2 = await fetch(`${FS_BASE}/signRequests/${reqId}?${mask}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (!r2.ok) throw new Error('patch_signer_' + r2.status + ': ' + (await r2.text()).slice(0, 200));
    }

    // Re-read so completeness is computed from BOTH parties' fresh state —
    // a concurrent signer's write is visible by now.
    const fresh = (await fsGet(`signRequests/${reqId}`)) || doc;
    const freshSigners = fresh.signers || {};
    freshSigners[role] = mine;
    const required = Array.isArray(fresh.requiredRoles) && fresh.requiredRoles.length ? fresh.requiredRoles : Object.keys(freshSigners);
    const complete = required.every(r => freshSigners[r] && freshSigners[r].signedAt);

    const patch = { status: complete ? 'complete' : 'partial' };

    if (complete && doc.originalPdfUrl) {
      try {
        const orig = await fetch(doc.originalPdfUrl);
        if (!orig.ok) throw new Error('fetch_original_' + orig.status);
        const bytes = Buffer.from(await orig.arrayBuffer());
        const signed = await buildSignedPdf(bytes, fresh.fields || doc.fields, freshSigners);
        const path = `signRequests/${reqId}/signed.pdf`;
        patch.signedPdfUrl = await uploadPdf(path, Buffer.from(signed));
        patch.signedPdfPath = path;
        patch.signedAt = now;
      } catch (embedErr) {
        // Don't lose the signature if embedding/upload fails: record the signature,
        // mark complete-pending so an admin/cron can regenerate the PDF.
        console.error('[custom/submit] embed/upload failed:', embedErr.message);
        patch.status = 'complete';
        patch.signedPdfError = String(embedErr.message || embedErr).slice(0, 300);
      }
    }

    await fsPatch(`signRequests/${reqId}`, patch);

    // Post-signature automation for the drop-direct flow. Fire-and-forget, all
    // caught + time-boxed so it can never block or fail the signer's response.
    // (The fiscal/procedural obligations engine is NOT run here: a dropped PDF
    // carries no structured rent/dates/regime — that runs only for contracts
    // created in the portal. Here we notify the operator and deliver the copy.)
    if (complete) {
      try {
        const { fsCreate } = await import('../../homie/_lib.js');
        await fsCreate('agentNotifications', {
          type: 'document.signed',
          summary: `📄 Documento firmato da tutte le parti · ${doc.title || reqId}`,
          priority: 'high',
          ref: { collection: 'signRequests', id: reqId },
          payload: { reqId, title: doc.title || '', signedPdfUrl: patch.signedPdfUrl || '' },
          dedupKey: `docsigned-${reqId}`,
          status: 'pending',
          actor: 'magic-sign-custom',
          createdAt: now.toISOString(),
          attempts: 0,
        });
      } catch (e) { console.warn('[custom/submit] notify:', e.message); }
      try {
        const { sendEmail } = await import('../../agent/_lib.js');
        const url = patch.signedPdfUrl || '';
        const safe = (s) => String(s || '').replace(/[<>&]/g, '');
        const jobs = required.map((r) => {
          const sg = freshSigners[r];
          if (!sg || !sg.email) return null;
          return sendEmail({
            to: sg.email,
            subject: `✓ Documento firmato — ${doc.title || 'BOOM Roma'}`,
            html: '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222">'
              + `<p>Ciao ${safe(sg.name)},</p>`
              + `<p>Il documento <b>"${safe(doc.title)}"</b> è stato firmato da tutte le parti.</p>`
              + (url ? `<p><a href="${url}" style="color:#B8860B">⬇ Scarica il PDF firmato</a></p>` : '')
              + '<p style="color:#888;font-size:12px">Firma Elettronica Semplice (Art. 21 CAD) · BOOM Roma</p></div>',
          }).catch((e) => console.warn('[custom/submit] email', sg.email, e.message));
        }).filter(Boolean);
        await Promise.race([Promise.all(jobs), new Promise((rs) => setTimeout(rs, 12000))]);
      } catch (e) { console.warn('[custom/submit] emails:', e.message); }
    } else {
      // Partial: nudge the remaining signer(s) with THEIR link — same
      // lifecycle as the standard flow's _notify. Best-effort, time-boxed.
      try {
        const { sendEmail } = await import('../../agent/_lib.js');
        const safe = (s) => String(s || '').replace(/[<>&]/g, '');
        const jobs = required.filter((r) => r !== role && freshSigners[r] && !freshSigners[r].signedAt).map((r) => {
          const sg = freshSigners[r];
          if (!sg.email || !sg.token) return null;
          const link = `https://www.boomrome.com/sign?csign=${encodeURIComponent(reqId)}&role=${r}&t=${encodeURIComponent(sg.token)}`;
          return sendEmail({
            to: sg.email,
            subject: `✍️ Tocca a te firmare — ${doc.title || 'BOOM Roma'}`,
            html: '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222">'
              + `<p>Ciao ${safe(sg.name)},</p>`
              + `<p><b>${safe(mine.name || '')}</b> ha firmato <b>"${safe(doc.title)}"</b>. Ora manca solo la tua firma — un minuto, dal telefono.</p>`
              + `<p><a href="${link}" style="display:inline-block;background:linear-gradient(180deg,#F6E4A6,#E9C766 46%,#B98E2E);color:#1c1503;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:11px">Firma il documento</a></p>`
              + '<p style="color:#888;font-size:12px">Link personale monouso · Firma Elettronica Semplice (Art. 21 CAD) · BOOM Roma</p></div>',
          }).catch((e) => console.warn('[custom/submit] nudge', sg.email, e.message));
        }).filter(Boolean);
        await Promise.race([Promise.all(jobs), new Promise((rs) => setTimeout(rs, 12000))]);
      } catch (e) { console.warn('[custom/submit] nudge:', e.message); }
    }

    res.setHeader('Cache-Control','private, no-store');
    return res.status(200).json({ ok:true, complete, signedPdfUrl: patch.signedPdfUrl || '' });
  } catch (e) {
    return res.status(502).json({ ok:false, error:'upstream', detail:String((e&&e.message)||e) });
  }
}
