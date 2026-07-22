// api/preagreement/pdf.js
// Public, token-scoped download of the OFFICIAL pre-agreement PDF — the
// faithful replica of the paper RENTAL PROPOSAL (same file attached to the
// confirmation emails). The accepted page's "Download PDF" button points
// here, so clients never end up printing the web page.
//
// Method:  GET /api/preagreement/pdf?t=<token>
// Only accepted/paid documents are downloadable (the draft has no
// signatures — before that, the web page IS the document).

import { fsList } from '../homie/_lib.js';
import { buildPaPdf } from './_pdf.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const token = String((req.query || {}).t || '').trim();
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ ok: false, error: 'bad_token' });

  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    const hit = rows && rows[0];
    if (!hit) return res.status(404).json({ ok: false, error: 'not_found' });
    const { id, ...pa } = hit;
    if (pa.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });
    if (pa.status !== 'accepted' && pa.status !== 'paid') return res.status(409).json({ ok: false, error: 'not_signed_yet' });

    const buf = await buildPaPdf(pa);
    const safeRef = String(pa.ref || 'BOOM').replace(/[^A-Za-z0-9-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="BOOM_Pre-Agreement_${safeRef}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(buf);
  } catch (e) {
    console.error('[preagreement/pdf] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'pdf_failed' });
  }
}
