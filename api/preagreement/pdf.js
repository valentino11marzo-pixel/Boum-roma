// api/preagreement/pdf.js
// Public, token-scoped PDF of the RENTAL PROPOSAL — the faithful replica
// of the paper document (same file attached to the confirmation emails).
//
// Method:  GET /api/preagreement/pdf?t=<token>
//
// PRIMA dell'accettazione il PDF si VEDE comunque (inline, come nel Magic
// Sign si legge il contratto prima di firmare — il cliente lo gira al
// garante, lo stampa, lo legge con calma), ma ogni pagina porta la
// filigrana "PREVIEW — NOT YET ACCEPTED": un PDF senza firme non può
// circolare come un affare chiuso. DOPO accettazione/pagamento arriva il
// documento definitivo in download, come sempre.

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
    // A signed document IS the truth: if signatures are on it, serve the
    // artefact even if a status write lagged (never block a signed client).
    const signedEvidence = !!((pa.tenant || {}).signature || (Array.isArray(pa.tenants) && pa.tenants[0] && pa.tenants[0].signature));
    const final = pa.status === 'accepted' || pa.status === 'paid' || signedEvidence;

    const buf = await buildPaPdf(pa, { preview: !final });
    const safeRef = String(pa.ref || 'BOOM').replace(/[^A-Za-z0-9-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    // Anteprima: inline (si apre nel browser, come il PDF del Magic Sign);
    // definitivo: download col nome giusto, come il bottone della pagina
    // accettata ha sempre fatto.
    res.setHeader('Content-Disposition', final
      ? `attachment; filename="BOOM_Pre-Agreement_${safeRef}.pdf"`
      : `inline; filename="BOOM_Proposal_PREVIEW.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(buf);
  } catch (e) {
    console.error('[preagreement/pdf] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'pdf_failed' });
  }
}
