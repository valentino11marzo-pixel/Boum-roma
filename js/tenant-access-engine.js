/* Shared tenant navigation. Selection never grants access: Firestore rules
   and the payment handlers still require the authenticated tenant UID. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.BOOM_TENANT_ACCESS=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function choose(rows,today,requestedId,payment){
    rows=(rows||[]).slice();
    if(payment&&payment.contractId)requestedId=payment.contractId;
    if(requestedId)return rows.find(function(c){return c.id===requestedId})||null;
    var live=rows.filter(function(c){return ['cancelled','terminated','expired'].indexOf(c.status)<0});
    var current=live.filter(function(c){return c.startDate&&c.startDate<=today&&(!c.endDate||c.endDate>=today)});
    current.sort(function(a,b){return String(b.startDate).localeCompare(String(a.startDate))});
    if(current.length)return current[0];
    var future=live.filter(function(c){return c.startDate>today});
    future.sort(function(a,b){return a.startDate.localeCompare(b.startDate)});
    if(future.length)return future[0];
    rows.sort(function(a,b){return String(b.startDate||'').localeCompare(String(a.startDate||''))});
    return rows[0]||null;
  }
  function inviteUrl(contract,tenant){
    if(!contract||!contract.id||!tenant||tenant.id!==contract.tenantId||tenant.role!=='tenant'||!tenant.email)return null;
    // No email or bearer credential in a shareable URL. The client uses
    // their own account and can see only contracts authorized for it.
    return 'https://www.boomrome.com/login?next='+encodeURIComponent('/casa?contract='+encodeURIComponent(contract.id));
  }
  // Presentation only: the signing API remains responsible for authorization
  // and signature order. Both live and legacy completion values exist.
  function stage(c){
    c=c||{};
    if(['cancelled','terminated','expired'].indexOf(c.status)>=0)return 'closed';
    if(['complete','completed'].indexOf(c.signatureStatus)>=0)return 'signed';
    if(c.tenantSignature){
      var waiting=(Array.isArray(c.coTenants)?c.coTenants:[]).some(function(x){return x&&x.name&&!x.signature});
      return waiting?'other_signatures':!c.landlordSignature?'owner_signature':'verifying';
    }
    return c.generatedPDF?'review':'preparing';
  }
  function ownSignUrl(response){
    if(!response||!response.ok||response.scope!=='tenant'||response.tenantSigned)return null;
    try{var u=new URL(response.tenant);return u.origin==='https://www.boomrome.com'&&u.pathname==='/sign'&&!u.username&&!u.password&&u.searchParams.get('sign')?u.href:null}catch(e){return null}
  }
  return {choose:choose,inviteUrl:inviteUrl,stage:stage,ownSignUrl:ownSignUrl};
});
