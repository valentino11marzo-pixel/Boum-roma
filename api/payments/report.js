// Tenant notices and explicit administrative corrections never settle money.
// Admin correction stores its reason and authenticated actor atomically with
// the reversal; CAS preserves concurrent webhook/admin updates.
import { requireRole, setCors } from '../_auth.js';
import { fsGetVersioned, fsCommit, readJson } from '../homie/_lib.js';
import RENT from '../../js/rent-engine.js';
import { createHash } from 'node:crypto';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const auth = await requireRole(req, res, ['tenant','admin']);
  if (!auth) return;
  const body = await readJson(req);
  const id = typeof body?.paymentId === 'string' ? body.paymentId.trim() : '';
  const action = body?.action;
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id) || !['report','withdraw','review_withdraw'].includes(action)) return res.status(400).json({ok:false,error:'invalid_request'});
  const review = action === 'review_withdraw';
  if (review ? auth.profile.role !== 'admin' : auth.profile.role !== 'tenant') return res.status(403).json({ok:false,error:'forbidden'});
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (review && (reason.length < 10 || reason.length > 500)) return res.status(400).json({ok:false,error:'review_reason_required'});
  try {
    const version = await fsGetVersioned('payments/' + id);
    if (!version) return res.status(404).json({ok:false,error:'not_found'});
    const p = version.data;
    if (!review && p.tenantId !== auth.uid) return res.status(403).json({ok:false,error:'not_yours'});
    const state = RENT.paymentState(p);
    if (review) {
      if (!p.tenantReported && ['due','overdue'].includes(state) && p.tenantReportReviewId) return res.status(200).json({ok:true,state,alreadyReviewed:true});
      if (!RENT.canReviewReport(p)) return res.status(409).json({ok:false,error:'state_changed'});
      const auditId = 'rent-report-' + createHash('sha256').update(id + '|' + version.updateTime).digest('hex').slice(0,40);
      const fields = {tenantReported:false,tenantReportedAt:null,tenantReportReviewId:auditId,
        ...(String(p.status || '').trim().toLowerCase() === 'reported' ? {status:'pending'} : {})};
      await fsCommit([
        {docPath:'payments/' + id,fields,precondition:{updateTime:version.updateTime}},
        {docPath:'activityLog/' + auditId,precondition:{exists:false},fields:{action:'Segnalazione bonifico revocata',category:'payment',actor:auth.uid,createdAt:new Date(),timestamp:new Date(),
          details:{paymentId:id,reason,previousStatus:p.status,previousReportedAt:p.tenantReportedAt || null,previousTenantReported:p.tenantReported === true}}}
      ]);
      return res.status(200).json({ok:true,state:RENT.paymentState({...p,...fields}),reviewId:auditId});
    }
    if (action === 'report' && state === 'reported') return res.status(200).json({ok:true,state:'reported'});
    if (action === 'withdraw' && !p.tenantReported && ['due','overdue'].includes(state)) return res.status(200).json({ok:true,state});
    if (action === 'report' && !RENT.canPay(p)) return res.status(409).json({ok:false,error:'state_changed'});
    // A legacy explicit reported status requires operator review; changing the
    // notice alone must not reset that authoritative state to pending.
    if (action === 'withdraw' && (state !== 'reported' || !['pending','due','overdue'].includes(p.status))) return res.status(409).json({ok:false,error:'state_changed'});
    const fields = action === 'report'
      ? {tenantReported:true,tenantReportedAt:new Date()}
      : {tenantReported:false,tenantReportedAt:null};
    await fsCommit([{docPath:'payments/' + id,fields,precondition:{updateTime:version.updateTime}}]);
    return res.status(200).json({ok:true,state:RENT.paymentState({...p,...fields})});
  } catch (error) {
    return res.status(error.conflict ? 409 : 503).json({ok:false,error:error.conflict?'state_changed':'report_unavailable'});
  }
}
