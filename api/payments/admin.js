// Mutazioni esplicite dell'operatore. Nessun incasso, invio o pagamento Stripe.
// Ricevuta dell'operazione e audit nella collection esistente, nello stesso commit.
import {createHash} from 'node:crypto';
import {requireRole} from '../_auth.js';
import {fsGet,fsGetVersioned,fsList,fsCommit,readJson} from '../homie/_lib.js';
import RENT from '../../js/rent-engine.js';
import PDF from '../../js/contract-pdf.js';

const validId=x=>typeof x==='string' && /^[A-Za-z0-9_-]{1,180}$/.test(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const reply=(res,status,error)=>res.status(status).json({ok:false,error});
const guard=(path,v)=>({docPath:path,fields:{},precondition:{updateTime:v.updateTime}});
const validExpected=x=>x && typeof x==='object' && !Array.isArray(x);

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return reply(res,405,'method_not_allowed');
  const actor=await requireRole(req,res,['admin']);if(!actor)return;
  let body;try{body=await readJson(req);}catch{return reply(res,400,'invalid_json');}
  const {op,requestKey,contractId,paymentId,data,expected}=body||{};
  if(!['create','update','bulk','renew_draft'].includes(op) || !/^[A-Za-z0-9_-]{16,80}$/.test(requestKey||'') || !validId(contractId) || !data || typeof data!=='object' || Array.isArray(data)) return reply(res,400,'invalid_request');
  if(op==='update' && (!validId(paymentId)||!validExpected(expected)))return reply(res,400,'invalid_request');
  if(op==='renew_draft' && !validExpected(expected))return reply(res,400,'invalid_request');
  const fingerprint=hash({op,contractId,paymentId:paymentId||null,data,expected:expected||null});
  const operationId='rent-op-'+hash([actor.uid,requestKey]).slice(0,40),auditPath='activityLog/'+operationId;
  const replay=async()=>{
    const saved=await fsGet(auditPath);
    if(!saved)return false;
    if(saved.actor!==actor.uid || saved.details?.fingerprint!==fingerprint) reply(res,409,'request_changed');
    else res.status(200).json({ok:true,...saved.details.result,replayed:true});
    return true;
  };
  try {
    if(await replay())return;
    const contract=await fsGetVersioned('contracts/'+contractId);
    if(!contract)return reply(res,404,'contract_not_found');
    const c=contract.data;
    if(!validId(c.tenantId)||!validId(c.propertyId))return reply(res,409,'contract_links_missing');
    // Guardiamo anche l'esistenza delle destinazioni: niente associazioni a record cancellati.
    const [tenant,property]=await Promise.all([fsGetVersioned('users/'+c.tenantId),fsGetVersioned('properties/'+c.propertyId)]);
    if(!tenant||!property)return reply(res,409,'contract_links_missing');
    const writes=[{docPath:'contracts/'+contractId,fields:{rentScheduleRevision:operationId},precondition:{updateTime:contract.updateTime}},guard('users/'+c.tenantId,tenant),guard('properties/'+c.propertyId,property)];
    let result,before=null,after=null;
    const now=new Date().toISOString();
    if(op==='renew_draft') {
      if(!RENT.sameSnapshot(expected,RENT.contractSnapshot(c)))return reply(res,409,'state_changed');
      if(RENT.contractSigned(c) || c.tenantMandate || c.landlordMandate || c.paymentsGenerated)return reply(res,409,'renewal_requires_new_version');
      const existing=await fsList('payments',{filter:{field:'contractId',op:'EQUAL',value:contractId},limit:1});
      if(existing.length)return reply(res,409,'renewal_requires_new_version');
      const rent=RENT.inputMoney(data.newRent),end=data.newEndDate;
      const duration=PDF.monthsBetween(c.startDate+'T12:00:00',String(end)+'T12:00:00');
      if(String(data.renewalNotes||'').length>2000 || rent==null || !/^\d{4}-\d{2}-\d{2}$/.test(end||'') || !RENT.installmentInput({contractId,amount:rent,month:end.slice(0,7),dueDate:end},c) || end<=c.endDate || !duration.total || duration.total>600)return reply(res,400,'invalid_renewal');
      const installments=Math.max(1,Math.ceil(duration.total));
      before=RENT.contractSnapshot(c);
      const fields={rent,endDate:end,canone:{...(c.canone||{}),monthly:rent,total:Math.round(rent*100)*installments/100,installments},
        durata:{...(c.durata||{}),startDate:c.startDate,endDate:end,text:duration.text},
        renewalHistory:[...(Array.isArray(c.renewalHistory)?c.renewalHistory:[]),{date:now,previousEnd:c.endDate,newEnd:end,previousRent:c.rent,newRent:rent,notes:String(data.renewalNotes||'').slice(0,2000),actor:actor.uid}],updatedAt:now};
      // Sostituiamo la guardia del contratto con la modifica condizionale.
      writes[0]={docPath:'contracts/'+contractId,fields,precondition:{updateTime:contract.updateTime}};
      after=RENT.contractSnapshot({...c,...fields});result={contractId,operationId};
    } else if(op==='update') {
      const version=await fsGetVersioned('payments/'+paymentId);
      if(!version)return reply(res,404,'payment_not_found');
      if(!RENT.sameSnapshot(expected,RENT.paymentSnapshot(version.data)))return reply(res,409,'state_changed');
      if(!RENT.editablePayment(version.data))return reply(res,409,'payment_locked');
      if(!['pending','due','overdue'].includes(data.status))return reply(res,400,'use_payment_confirmation');
      const fields=RENT.installmentInput({...data,contractId},c);
      if(!fields)return reply(res,400,'invalid_installment');
      // Una modifica non può creare una seconda rata sul periodo di destinazione.
      if(version.data.contractId!==contractId || version.data.month!==fields.month) {
        const overlapping=await fsList('payments',{filter:{field:'contractId',op:'EQUAL',value:contractId},limit:2000});
        if(overlapping.length>=2000)return reply(res,409,'schedule_review_required');
        if(overlapping.some(p=>p.id!==paymentId && RENT.coversMonth(p,fields.month)))return reply(res,409,'installment_exists');
      }
      before=RENT.paymentSnapshot(version.data);after=RENT.paymentSnapshot({...version.data,...fields});
      writes.push({docPath:'payments/'+paymentId,fields:{...fields,updatedAt:now},precondition:{updateTime:version.updateTime}});
      result={paymentId,operationId};
    } else {
      if(c.status!=='active')return reply(res,409,'contract_inactive');
      if(op==='bulk' && (data.amount==null || data.amount==='') && RENT.contractRent(c)==null)return reply(res,409,'contract_rent_conflict');
      const items=op==='bulk'?RENT.bulkInstallments({...data,contractId},c):[RENT.installmentInput({...data,contractId},c)];
      if(!items || items.some(x=>!x) || (op==='create' && data.status!=='pending'))return reply(res,400,'invalid_installment');
      const previous=await fsList('payments',{filter:{field:'contractId',op:'EQUAL',value:contractId},limit:2000});
      if(previous.length>=2000)return reply(res,409,'schedule_review_required');
      const remaining=items.filter(item=>!previous.some(p=>RENT.coversMonth(p,item.month)));
      if(op==='create' && !remaining.length)return reply(res,409,'installment_exists');
      const paymentIds=await Promise.all(remaining.map(async item=>{
        const id='pay_'+contractId+'_'+item.month;
        // Un ID storico può appartenere a una rata poi spostata dall'operatore.
        // Il lock sul contratto serializza la scelta senza sovrascrivere quella rata.
        return await fsGet('payments/'+id) ? id+'_'+operationId.slice(-12) : id;
      }));
      remaining.forEach((item,i)=>writes.push({docPath:'payments/'+paymentIds[i],fields:{...item,status:'pending',createdAt:now,createdBy:actor.uid,operationId},precondition:{exists:false}}));
      result={created:remaining.length,skipped:items.length-remaining.length,paymentIds,operationId};
      after=remaining.map(({month,amount,dueDate})=>({month,amount,dueDate}));
    }
    writes.push({docPath:auditPath,precondition:{exists:false},fields:{action:'rent_admin_'+op,category:'payment',actor:actor.uid,createdAt:now,timestamp:now,
      details:{contractId,paymentId:paymentId||null,fingerprint,before,after,result}}});
    await fsCommit(writes);
    return res.status(200).json({ok:true,...result});
  } catch(error) {
    // Se il commit è arrivato ma la risposta è andata persa, lo stesso intento ha già una ricevuta.
    try{if(await replay())return;}catch{}
    return reply(res,error.conflict?409:503,error.conflict?'state_changed':'save_unavailable');
  }
}
