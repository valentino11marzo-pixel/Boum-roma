// api/preagreement/notify.js
// Console "✉ Reinvia copia" — re-sends the accepted/paid document email to
// the client (and the admin copy). Built for recovery: when a send failed
// (e.g. the nodemailer bundling outage) or the client says "non l'ho
// ricevuta", one tap re-delivers their copy.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord)
// Body:     { id }
// Response: { ok, client, admin }

import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { sendPaEmails } from './_notify.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  const paId = b && typeof b.id === 'string' ? b.id.trim().slice(0, 80) : '';
  if (!paId) return res.status(400).json({ ok: false, error: 'id_required' });

  let pa;
  try { pa = await fsGet('preAgreements/' + paId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pa) return res.status(404).json({ ok: false, error: 'not_found' });
  if (pa.status !== 'accepted' && pa.status !== 'paid') {
    return res.status(409).json({ ok: false, error: 'not_accepted_yet', status: pa.status });
  }
  if (!(pa.tenant || {}).email) return res.status(409).json({ ok: false, error: 'no_client_email' });

  const results = await sendPaEmails({
    pa,
    ref: pa.ref || '',
    url: '/pre-agreement?t=' + pa.token,
    event: pa.status === 'paid' ? 'paid' : 'accepted',
    paidEur: pa.paidEur || null,
    paidAt: pa.paidAt || null,
    notifyClient: true,
  });

  fsPatch('preAgreements/' + paId, { resentAt: new Date().toISOString(), resentBy: auth.email || auth.uid })
    .catch(() => {});
  logActivity('preagreement_copy_resent', 'preagreement',
    { paId, ref: pa.ref || '', client: results.client }, auth.email || 'admin')
    .catch(() => {});

  return res.status(200).json({ ok: true, client: !!results.client, admin: !!results.admin });
}
