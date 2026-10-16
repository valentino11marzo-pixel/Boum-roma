import {requireRole} from '../_auth.js';
import {fsGet,fsList} from '../homie/_lib.js';
import engine from '../../js/tenant-workspace-engine.js';

// Personal inbox across homes. Messages are text, never executable actions or
// evidence that a payment is due: payment state is read separately from payments.
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method'});
  const actor=await requireRole(req,res,['tenant','admin']);if(!actor)return;
  const id=req.query?.contractId;
  if(!engine.id(id))return res.status(400).json({ok:false,error:'contract_required'});
  try{
    const c=await fsGet('contracts/'+id);
    if(!c||!c.tenantId||(actor.profile.role!=='admin'&&c.tenantId!==actor.uid))return res.status(403).json({ok:false,error:'forbidden'});
    const rows=await fsList('notifications',{filter:{field:'userId',op:'EQUAL',value:c.tenantId},orderBy:{field:'createdAt',direction:'DESCENDING'},limit:50});
    const notifications=rows.filter(n=>n.userId===c.tenantId).map(n=>({id:n.id,title:String(n.title||'BOOM').slice(0,200),message:String(n.message||'').slice(0,3000),createdAt:String(n.createdAt||''),read:n.read===true}));
    return res.status(200).json({ok:true,notifications,limited:rows.length===50});
  }catch{return res.status(503).json({ok:false,error:'notifications_unavailable'});}
}
