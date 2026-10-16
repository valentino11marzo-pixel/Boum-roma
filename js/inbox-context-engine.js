/* Explicit record → conversation references only. No names, phones, IO or inferred ownership. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BOOM_INBOX_CONTEXT=factory();}(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const pools={person:'users',client:'clients',lead:'leads',pfsClient:'pfsClients',property:'properties',contract:'contracts'};
 const valid=id=>typeof id==='string'&&/^[\w.-]{1,180}$/.test(id)&&!['.','..'].includes(id);
 function one(state,pool,id){const rows=(state[pool]||[]).filter(r=>r.id===id);return rows.length===1?rows[0]:null;}
 function resolve(record,state,rows){
  state=state||{};const kind=record?.kind,id=record?.id,row=valid(id)&&pools[kind]&&one(state,pools[kind],id);
  if(!row||kind==='person'&&!['tenant','landlord'].includes(row.role))return{available:false,contacts:[],conversationIds:[]};
  const types={person:[row.role],client:['client'],lead:['lead'],pfsClient:['pfs']};
  const contacts=(types[kind]||[]).map(contactType=>({contactType,contactId:id}));
  const ids=new Set();let unresolvedCount=0;
  if(kind==='property'||kind==='contract')for(const task of rows||[]){
   const f=task.followUp;if(!f||f.confirmed!==true||f.needsReview===true||f.ambiguous===true||!valid(f.conversationId))continue;
   const match=/^contracts\/([\w.-]{1,180})$/.exec(f.practiceRef||''),contract=match&&one(state,'contracts',match[1]);
   if(!contract){unresolvedCount++;continue;}
   if(f.propertyRef&&f.propertyRef!=='properties/'+contract.propertyId){unresolvedCount++;continue;}
   if(kind==='contract'?contract.id===id:contract.propertyId===id)ids.add(f.conversationId);
  }
  return{available:true,label:row.name||row.ref||(kind==='contract'?'Contratto '+id:id),contacts,conversationIds:[...ids],unresolvedCount};
 }
 function matches(conversation,identity){return !!conversation&&conversation.contactType===identity.contactType&&conversation.contactId===identity.contactId&&!conversation.conversationBindingConflict&&conversation.conversationBindingStatus!=='unavailable';}
 return Object.freeze({resolve,matches});
}));
