// Private immutable source snapshots, not invoices, payment updates or an SdI sender.
import crypto from 'node:crypto';
import { requireRole } from '../_auth.js';
import { fsCreate, fsGet, fsList, readJson } from '../homie/_lib.js';
import ENGINE from '../../js/invoice-reconciliation-engine.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({ok:false,error:'method_not_allowed'});
  const actor=await requireRole(req,res,['admin']); if(!actor)return;
  try {
    if(req.method==='GET') {
      const rows=await fsList('invoiceReconciliations',{orderBy:{field:'importedAt',direction:'DESCENDING'},limit:1});
      return res.status(200).json({ok:true,snapshot:rows[0]||null});
    }
    const body=await readJson(req);
    if(!body || !['preview','import'].includes(body.action))return res.status(400).json({ok:false,error:'invalid_action'});
    if(JSON.stringify(body).length>550000)return res.status(413).json({ok:false,error:'file_too_large'});
    const checked=ENGINE.normalize(body.data);
    if(!checked.ok)return res.status(400).json({ok:false,error:'invalid_snapshot',fields:checked.errors});
    const digest=crypto.createHash('sha256').update(JSON.stringify(checked.data)).digest('hex');
    const id='evidence_'+digest, totals=ENGINE.summary(checked.data);
    if(body.action==='preview')return res.status(200).json({ok:true,digest,summary:totals,data:checked.data});
    if(body.confirmed!==true||body.digest!==digest)return res.status(409).json({ok:false,error:'preview_confirmation_required'});
    const doc={data:checked.data,digest,importedAt:new Date().toISOString(),importedBy:actor.uid};
    try { await fsCreate('invoiceReconciliations',doc,id); }
    catch(e) {
      if(!e.exists)throw e;
      const existing=await fsGet('invoiceReconciliations/'+id);
      if(!existing || existing.digest!==digest || JSON.stringify(existing.data)!==JSON.stringify(checked.data))return res.status(409).json({ok:false,error:'existing_snapshot_conflict'});
      return res.status(200).json({ok:true,duplicate:true,snapshot:existing});
    }
    return res.status(201).json({ok:true,duplicate:false,snapshot:{id,...doc}});
  } catch(_) {
    // No names, identifiers, financial contents or raw Firestore errors in logs.
    return res.status(503).json({ok:false,error:'reconciliation_unavailable'});
  }
}
