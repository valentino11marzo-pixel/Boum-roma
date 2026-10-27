import {requireRole} from '../_auth.js';
import {fsGet,fsList} from '../homie/_lib.js';
import engine from '../../js/tenant-workspace-engine.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method'});
  const actor=await requireRole(req,res,['tenant','admin']);if(!actor)return;
  const id=req.query?.contractId;if(!engine.id(id))return res.status(400).json({ok:false,error:'contract_required'});
  try{
    const c=await fsGet('contracts/'+id);
    const member = c && (c.tenantId===actor.uid || (c.coTenants||[]).some(x=>x.userId===actor.uid));
    if(!c||!c.tenantId||(actor.profile.role!=='admin'&&!member))return res.status(403).json({ok:false,error:'forbidden'});
    const uid=actor.profile.role==='admin'?c.tenantId:actor.uid;
    const lists=await Promise.all(['userId','contractId'].map(field=>fsList('documents',{filter:{field,op:'EQUAL',value:field==='userId'?uid:id},limit:200})));
    return res.status(200).json({ok:true,documents:engine.documents(lists.flat(),{...c,id},uid),limited:lists.some(x=>x.length===200)});
  }catch{return res.status(503).json({ok:false,error:'archive_unavailable'});}
}
