// Operator decision on one PFS client/listing case. Approval records checks;
// it does not put the listing in the customer portal or send a shortlist.
// POST { clientId, propertyId, decision:'approve'|'reject', evidence?, reason? }
import crypto from 'node:crypto';
import { fsGet, fsGetVersioned, fsCommit, readJson } from '../homie/_lib.js';
import { requireCronOrAdmin } from './_guard.js';
import { candidateId, normalizeApprovalEvidence } from './_candidates.js';

const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  // The shared radar guard also accepts cron, Homie, and an owner role.
  // A human admin alone may attest the availability and sharing checks.
  if (!actor.startsWith('admin:')) return res.status(403).json({ ok: false, error: 'admin_required' });
  let profile;
  try { profile = await fsGet('users/' + actor.slice(6)); }
  catch { return res.status(500).json({ ok: false, error: 'admin_lookup_failed' }); }
  if (profile?.role !== 'admin') return res.status(403).json({ ok: false, error: 'admin_required' });

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!validId(body?.clientId) || !validId(body?.propertyId))
    return res.status(400).json({ ok: false, error: 'invalid_case_id' });
  if (!['approve', 'reject'].includes(body.decision))
    return res.status(400).json({ ok: false, error: 'invalid_decision' });

  let client;
  try { client = await fsGet('pfsClients/' + body.clientId); }
  catch { return res.status(500).json({ ok: false, error: 'client_lookup_failed' }); }
  if (!client || client.reviewRequired !== true)
    return res.status(404).json({ ok: false, error: 'reviewed_client_not_found' });

  const path = 'pfsCandidateReviews/' + candidateId(body.clientId, body.propertyId);
  const operator = actor.slice(6);
  for (let attempt = 0; attempt < 3; attempt++) {
    let snap;
    try { snap = await fsGetVersioned(path); }
    catch { return res.status(500).json({ ok: false, error: 'candidate_lookup_failed' }); }
    if (!snap || snap.data.clientId !== body.clientId || snap.data.propertyId !== body.propertyId)
      return res.status(404).json({ ok: false, error: 'candidate_not_found' });

    const evidence = body.decision === 'approve'
      ? normalizeApprovalEvidence(body.evidence, snap.data.sourceUrl) : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (body.decision === 'approve' && !evidence)
      return res.status(400).json({ ok: false, error: 'approval_evidence_required' });
    if (body.decision === 'reject' && (reason.length < 3 || reason.length > 500))
      return res.status(400).json({ ok: false, error: 'rejection_reason_required' });

    const nextStatus = body.decision === 'approve' ? 'approved' : 'rejected';
    const decisionHash = hash([operator, nextStatus, evidence || reason]);
    if (snap.data.status !== 'pending') {
      if (snap.data.status === nextStatus && snap.data.decisionHash === decisionHash)
        return res.status(200).json({ ok: true, id: snap.data.id, status: nextStatus, already: true });
      return res.status(409).json({ ok: false, error: 'candidate_already_decided', status: snap.data.status });
    }

    const reviewedAt = new Date().toISOString();
    const fields = {
      status: nextStatus, reviewedBy: operator, reviewedAt, decisionHash,
      ...(evidence ? { reviewEvidence: evidence } : { rejectionReason: reason }),
    };
    try {
      await fsCommit([{ docPath: path, fields, precondition: { updateTime: snap.updateTime } }]);
      return res.status(200).json({ ok: true, id: snap.data.id, status: nextStatus, reviewedAt, already: false });
    } catch (err) {
      if (!err.conflict) {
        console.error('[pfs/candidate-review] decision write failed:', err.message);
        return res.status(500).json({ ok: false, error: 'decision_write_failed' });
      }
      // A simultaneous radar fact refresh can race the CAS. Re-read: a
      // human decision wins once, and an exact retry returns the same result.
    }
  }
  return res.status(409).json({ ok: false, error: 'candidate_changed_retry' });
}
