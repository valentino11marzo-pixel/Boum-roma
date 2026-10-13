import crypto from 'node:crypto';
import {requireRole} from '../_auth.js';
import {fsGet,fsGetVersioned,fsList,fsCommit} from '../homie/_lib.js';
import engine from '../../js/tenant-workspace-engine.js';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,32);
const error=(res,n,e)=>res.status(n).json({ok:false,error:e});
const now=()=>new Date().toISOString();

// This endpoint only records the tenant's request in BOOM. Supplier dispatch
// remains unavailable until the recipients and allowed payload are configured.
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['POST','GET'].includes(req.method))return error(res,405,'method');
  const actor=await requireRole(req,res,['tenant','admin']);if(!actor)return;
  const admin=actor.profile.role==='admin';
  const b=req.method==='GET'?req.query:req.body;
  if(!b||typeof b!=='object')return error(res,400,'body');
  const action=b.action||(req.method==='GET'?'list':'create');
  if(req.method==='GET'&&action!=='list')return error(res,405,'method');
  try{
    if(!engine.id(b.contractId))return error(res,400,'contract_required');
    const contract=await fsGetVersioned('contracts/'+b.contractId);
    const c=contract?.data;
    if(!c||!c.tenantId||(!admin&&c.tenantId!==actor.uid))return error(res,403,'forbidden');
    if(action==='list'){
      const rows=await fsList('maintenance',{filter:{field:'userId',op:'EQUAL',value:c.tenantId},limit:200});
      return res.status(200).json({ok:true,tickets:rows.filter(m=>m.userId===c.tenantId&&m.propertyId===c.propertyId&&(m.contractId?m.contractId===b.contractId:m.propertyId===c.propertyId)).map(engine.ticket).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),limited:rows.length===200});
    }
    if(!['create','update'].includes(action))return error(res,400,'action');
    if(!engine.id(c.propertyId))return error(res,409,'property_missing');
    if(['cancelled','terminated','expired'].includes(c.status))return error(res,409,'contract_closed');
    const input=engine.input(b);
    if(!input)return error(res,400,'invalid_ticket');
    if(action==='create'&&!engine.id(b.requestId))return error(res,400,'request_required');
    const id=action==='create'?'tenant_'+hash(c.tenantId+':'+b.requestId):b.ticketId;
    if(!engine.id(id))return error(res,400,'ticket_required');
    const path='maintenance/'+id;
    const record=await fsGetVersioned(path);
    if(record&&(record.data.userId!==c.tenantId||record.data.contractId!==b.contractId||record.data.propertyId!==c.propertyId||record.data.source!=='tenant-dashboard'))return error(res,403,'forbidden');
    let fields;
    if(action==='create'){
      const fingerprint=hash(JSON.stringify({contractId:b.contractId,...input}));
      if(record&&record.data.requestHash!==fingerprint)return error(res,409,'request_reused');
      if(!record)fields={...input,source:'tenant-dashboard',requestHash:fingerprint,contractId:b.contractId,propertyId:c.propertyId,userId:c.tenantId,tenantId:c.tenantId,title:input.category+' · '+input.description.slice(0,80),status:'open',revision:1,createdAt:now(),updatedAt:now()};
    }else{
      if(!record)return error(res,404,'ticket_missing');
      if(!engine.ticket(record.data).editable)return error(res,409,'ticket_locked');
      if(b.revision!==record.data.revision)return error(res,409,'stale');
      fields={...input,title:input.category+' · '+input.description.slice(0,80),revision:record.data.revision+1,updatedAt:now()};
    }
    if(fields)await fsCommit([
      {docPath:path,fields,precondition:record?{updateTime:record.updateTime}:{exists:false}},
      {docPath:'contracts/'+b.contractId,fields:{},precondition:{updateTime:contract.updateTime}},
    ]);
    return res.status(200).json({ok:true,ticket:engine.ticket({...await fsGet(path),id})});
  }catch(e){return error(res,e.conflict?409:503,e.conflict?'stale':'maintenance_unavailable');}
}
