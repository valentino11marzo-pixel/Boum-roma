export async function load(url,context,nextLoad){
 const r=await nextLoad(url,context);if(!url.endsWith('/api/payments/admin.js'))return r;
 const m=process.env.RENT_WRITE_MUTATION;let s=String(r.source);
 if(m==='locked')s=s.replace('if(!RENT.editablePayment(version.data))','if(false)');
 if(m==='stale')s=s.replace('if(!RENT.sameSnapshot(expected,RENT.paymentSnapshot(version.data)))','if(false)');
 if(m==='cents')s=s.replace("...item,status:'pending'", "...item,amount:parseInt(item.amount),status:'pending'");
 if(m==='links')s=s.replace('fields:{...fields,updatedAt:now}', 'fields:{...fields,tenantId:version.data.tenantId,propertyId:version.data.propertyId,updatedAt:now}');
 if(m==='coverage')s=s.replace('!previous.some(p=>RENT.coversMonth(p,item.month))','true');
 return {...r,source:s};
}
