// Tenant notices and explicit administrative corrections never settle money.
// Admin correction stores its reason and authenticated actor atomically with
// the reversal; CAS preserves concurrent webhook/admin updates.
import { requireRole, setCors } from '../_auth.js';
import { fsGetVersioned, fsCommit, readJson } from '../homie/_lib.js';
import RENT from '../../js/rent-engine.js';
import { createHash } from 'node:crypto';

// LA SEGNALAZIONE SI TOGLIE TUTTA (13/10/2026). Annullare una segnalazione —
// l'inquilino che ritira la sua, o l'operatore che revoca quella sbagliata —
// azzerava solo il segnale (tenantReported) e lasciava sulla rata data, nota,
// ricevuta ed elenco: una nuova segnalazione fatta da /casa (action 'report',
// che non riscrive la testa) li ereditava e risultava «con ricevuta» per un
// bonifico che nessuno aveva provato. Ora si puliscono, come fa /rata, e ciò
// che c'era resta a parte, come storia (tenantReportWithdrawn). Pura.
const clip = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n);
const isoOf = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v.toDate === 'function') { try { return v.toDate().toISOString(); } catch (_) { return null; } }
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return null;
};
export function reportHistory(p) {
  const pay = p || {};
  const list = Array.isArray(pay.tenantReports) ? pay.tenantReports.filter(x => x && typeof x === 'object').slice(-6) : [];
  if (list.length) return list.map(x => ({ at: clip(x.at, 40) || null, date: clip(x.date, 10) || null, note: clip(x.note, 500),
    proofUrl: clip(x.proofUrl, 1000), proofName: clip(x.proofName, 120), via: clip(x.via, 20) }));
  if (pay.tenantReported === true || pay.tenantReportDate || pay.proofUrl || pay.tenantNotes) {
    return [{ at: isoOf(pay.tenantReportedAt), date: clip(pay.tenantReportDate, 10) || null, note: clip(pay.tenantNotes, 500),
      proofUrl: clip(pay.proofUrl, 1000), proofName: clip(pay.proofName, 120), via: clip(pay.reportedVia, 20) }];
  }
  return [];
}
export function withdrawFields(p, { by, reason, reviewId } = {}) {
  // Ogni voce porta la SUA data d'annullo e chi l'ha annullata: la storia di
  // prima (un co-intestatario che aveva già ritirato la sua da /rata) resta
  // e si accoda — «at» in testa è solo l'ultimo annullo.
  const nowIso = new Date().toISOString(), who = by || 'tenant';
  const prev = p && p.tenantReportWithdrawn && Array.isArray(p.tenantReportWithdrawn.reports) ? p.tenantReportWithdrawn.reports.filter(x => x && typeof x === 'object') : [];
  return {
    tenantReported: false, tenantReportedAt: null, tenantReportWithdrawnAt: new Date(),
    tenantReportDate: null, tenantNotes: null, proofUrl: null, proofName: null, tenantReports: null,
    tenantReportWithdrawn: { at: nowIso, by: who, ...(reason ? { reason: clip(reason, 500) } : {}),
      ...(reviewId ? { reviewId } : {}), reports: prev.concat(reportHistory(p).map(x => ({ ...x, withdrawnAt: nowIso, withdrawnBy: who }))).slice(-6) },
  };
}

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
      const fields = {...withdrawFields(p,{by:'admin',reason,reviewId:auditId}),tenantReportReviewId:auditId,
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
      : withdrawFields(p,{by:'tenant'});
    await fsCommit([{docPath:'payments/' + id,fields,precondition:{updateTime:version.updateTime}}]);
    return res.status(200).json({ok:true,state:RENT.paymentState({...p,...fields})});
  } catch (error) {
    return res.status(error.conflict ? 409 : 503).json({ok:false,error:error.conflict?'state_changed':'report_unavailable'});
  }
}
