// A tenant reports or withdraws their own transfer notice. This never settles
// money, changes an amount, or creates a receipt. CAS preserves a concurrent
// webhook/admin update; a failed response can be safely retried.
import { requireRole, setCors } from '../_auth.js';
import { fsGetVersioned, fsCommit, readJson } from '../homie/_lib.js';
import RENT from '../../js/rent-engine.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const auth = await requireRole(req, res, ['tenant']);
  if (!auth) return;
  const body = await readJson(req);
  const id = typeof body?.paymentId === 'string' ? body.paymentId.trim() : '';
  const action = body?.action;
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id) || !['report','withdraw'].includes(action)) return res.status(400).json({ok:false,error:'invalid_request'});
  try {
    const version = await fsGetVersioned('payments/' + id);
    if (!version) return res.status(404).json({ok:false,error:'not_found'});
    const p = version.data;
    if (p.tenantId !== auth.uid) return res.status(403).json({ok:false,error:'not_yours'});
    const state = RENT.paymentState(p);
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
