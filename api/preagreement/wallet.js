// api/preagreement/wallet.js
// The reservation, in the client's Apple Wallet — issued the moment the
// pre-agreement is accepted/paid. GET with the document token returns a
// signed .pkpass (eventTicket): address as hero, move-in date + monthly,
// protocol number, QR that reopens the signed document, and a
// relevantDate so Wallet surfaces the pass on the lock screen on move-in
// day. The accepted page's "Add to Apple Wallet" badge and the paid email
// both point here.
//
// Method: GET /api/preagreement/wallet?t=<token>

import { fsList } from '../homie/_lib.js';
import { buildAndSign } from '../generate-pass.js';

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
    if (pa.status !== 'accepted' && pa.status !== 'paid' && !signedEvidence) {
      return res.status(409).json({ ok: false, error: 'not_signed_yet', status: pa.status || null });
    }

    const m = pa.money || {}, le = pa.lease || {}, t = pa.tenant || {};
    const docUrl = 'https://www.boomrome.com/pre-agreement?t=' + token;
    const { buffer, passJson } = buildAndSign('reservation', {
      paId: id,
      ref: pa.ref || '',
      address: (pa.property || {}).address || '',
      tenantName: t.fullName || '',
      startDate: le.startDate,
      endDate: le.endDate,
      months: le.months,
      monthlyTotal: m.monthlyTotal != null ? m.monthlyTotal : m.rent,
      paidEur: pa.paidEur || null,
      status: pa.status,
      docUrl,
    });

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="BOOM_Reservation_${String(pa.ref || 'pass').replace(/[^A-Za-z0-9-]/g, '')}.pkpass"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Pass-Serial', passJson.serialNumber);
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('[preagreement/wallet] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'pass_failed' });
  }
}
