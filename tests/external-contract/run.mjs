import {F,DB,storage,PDF,SIG,res,hooks,current,assert,handler,lookup,submit,documents,links,finalizeContract,aspiChecklist,checklistBlocked,reset,call,status,payload,adopt,prepare,receipt,setWho,fault} from './fixture.mjs';
let n=0;async function test(name,fn){try{await fn();n++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
await test('unsigned preview blocks registration even when a generated PDF exists',async()=>{reset();assert.equal(checklistBlocked(aspiChecklist(current(),{},'registrazione')),true);assert.equal((await call({op:'send',bill:false})).code,422);assert.equal(globalThis.deliveryMails.length,0);});
await test('admin only and strict contract path',async()=>{reset();setWho('t1');assert.equal((await call({op:'external-adopt'})).code,403);setWho('admin');assert.equal((await call({op:'external-adopt',contractId:'../users/admin'})).code,400);assert.equal(storage.size,0);});
await test('explicit verification, real date, valid PDF and profile membership required',async()=>{
  reset();const b=await payload();
  for(const change of [{confirmTerms:false},{confirmComplete:false},{signedDate:'2026-02-31'},{signedDate:'2099-01-01'},{pdfBase64:Buffer.from('%PDF-not a pdf').toString('base64')}])assert.ok((await call({...b,...change})).code>=400);
  DB.get('properties/p1').ownerId='';assert.equal((await call(await payload())).body.error,'party_profiles_required');assert.equal(storage.size,0);
});
await test('stale reviewed terms are rejected before uploading',async()=>{reset();const b=await payload();DB.get('contracts/c1').rent=999;assert.equal((await call(b)).body.error,'review_changed');assert.equal(storage.size,0);});
await test('signature concurrent with adoption cannot be overwritten',async()=>{reset();const b=await payload();hooks.beforeCommit=async ws=>{if(F.writesData(ws).some(x=>x.externalSignedDocument)){DB.get('contracts/c1').tenantSignature=SIG;hooks.beforeCommit=async()=>{};}};assert.equal((await call(b)).code,409);assert.equal(current().tenantSignature,SIG);assert.ok(!current().externalSignedDocument);});
await test('same practice keeps exact bytes, prior signatures proof and existing money',async()=>{
  reset({tenantSignature:SIG,tenantSignedAt:'2026-10-13T10:00:00Z',signatureStatus:'partial'});DB.set('payments/existing',{amount:1000,contractId:'c1'});DB.set('invoices/existing',{amount:99,contractId:'c1'});
  const b=await payload();assert.equal((await call({...b,archivePreviousSignatures:false})).body.error,'archive_signatures_required');await call(b);
  const c=current();assert.equal(c.signatureStatus,'complete');assert.equal(c.tenantSignature,null);assert.equal(c.signingCertificateUrl,null);assert.equal(c.contractVersions.length,1);assert.ok(c.contractVersions[0].voidedSignatures[0].signatureSha256);
  assert.deepEqual(storage.get('contracts/c1/external-signed/'+c.externalSignedDocument.sha256+'.pdf'),PDF);
  const repeat=await call(b);assert.equal(repeat.body.duplicate,true);assert.equal(current().contractVersions.length,1);assert.equal([...DB.keys()].filter(k=>k.startsWith('contracts/')).length,1);
  assert.deepEqual(DB.get('payments/existing'),{amount:1000,contractId:'c1'});assert.equal(globalThis.deliveryMails.length,0);
});
await test('complete internal contract cannot be silently replaced',async()=>{reset({signatureStatus:'complete',fullySignedAt:'2026-10-14'});assert.equal((await call(await payload())).body.error,'fully_signed');assert.equal(storage.size,0);});
await test('recovery creates documents for every party and prepares RLI without FES or welcome',async()=>{
  reset();await adopt();const result=await prepare();assert.equal(result.preparation.status,'ready',JSON.stringify(result));
  const c=current();assert.ok(c.registrationPackUrl&&c.registrationSheetUrl&&c.fascicoloFiscaleUrl);assert.ok(DB.has('deadlines/rli_c1'));
  for(const [role,uid] of [['tenant','t1'],['landlord','owner'],['co0','co1']]){const d=DB.get('documents/contract-signed_c1_'+role);assert.equal(d.fileUrl,c.signedPdfUrl);assert.equal(d.userId,uid);assert.equal(d.signedDocumentSource,'external');}
  assert.equal((c.registrationPackMissing||[]).some(x=>/FES/.test(JSON.stringify(x))),false);
  const sheet=storage.get('contracts/c1/registration-sheet.html').toString();assert.match(sheet,/firma esterna/);assert.doesNotMatch(sheet,/firma elettronica \(FES/);
  const count=DB.size;await prepare();assert.equal(DB.size,count);await finalizeContract(current());assert.equal(globalThis.deliveryMails.length,0);assert.equal([...DB.keys()].some(k=>k.startsWith('payments/')),false);
});
await test('archive failure is visible and recoverable without duplicate documents',async()=>{reset();await adopt();fault('archive',true);let r=await prepare();assert.equal(r.preparation.status,'incomplete');assert.equal(r.preparation.steps.archive.ok,false);fault('archive',false);r=await prepare();assert.equal(r.preparation.steps.archive.ok,true);assert.equal([...DB.keys()].filter(k=>k.startsWith('documents/contract-signed_')).length,3);});
await test('RLI draft, SPID wait and transmission are distinct from registration',async()=>{reset();await adopt();await prepare();for(const stage of ['draft','awaiting_spid','submitted','rejected']){let s=await status();const r=await call({op:'progress',version:s.external.version,channel:'rli',stage,reference:'RLI-DRAFT-123',note:'Synthetic next step'});assert.equal(r.code,200);assert.equal(current().registrationProgress.stage,stage);assert.notEqual(current().registrationStatus,'registered');}assert.equal((await call({op:'progress',version:(await status()).external.version,channel:'rli',stage:'submitted'})).body.error,'reference_required');});
await test('date alone, missing positive evidence and wrong original cannot close registration',async()=>{reset();await adopt();for(const change of [{code:'',base64:null},{confirmReceipt:false},{signedHash:'wrong'},{date:'2026-10-13'}])assert.ok((await call({...receipt(),...change})).code>=400);assert.notEqual(current().registrationStatus,'registered');assert.equal([...DB.keys()].filter(k=>k.startsWith('documents/registration-receipt_')).length,0);});
await test('receipt closes deadline and lives beside original in each portal; same retry sends once',async()=>{
  reset();await adopt();await prepare();let r=await call({...receipt(),notify:true});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.archive.ok,true);assert.equal(DB.get('deadlines/rli_c1').status,'done');assert.equal(globalThis.deliveryMails.length,3);
  await call({...receipt(),notify:true});assert.equal(globalThis.deliveryMails.length,3);
  for(const uid of ['t1','co1']){setWho(uid);const r=res();await documents({method:'GET',headers:{authorization:'Bearer synthetic'},query:{contractId:'c1'}},r);assert.equal(r.code,200);assert.equal(r.body.documents.length,2);assert.ok(r.body.documents.every(d=>d.url===current().signedPdfUrl||d.url===current().registrationReceiptUrl));}
  DB.set('users/stranger',{role:'tenant'});setWho('stranger');const no=res();await documents({method:'GET',headers:{authorization:'Bearer synthetic'},query:{contractId:'c1'}},no);assert.equal(no.code,403);
  assert.equal(DB.get('documents/registration-receipt_c1_landlord').userId,'owner');
});
await test('receipt archive failure is recoverable through same completion button',async()=>{reset();await adopt();await prepare();fault('receipt',true);let r=await call(receipt());assert.equal(r.code,200);assert.equal(r.body.archive.ok,false);assert.equal(current().registrationStatus,'registered');fault('receipt',false);r=await call({op:'external-prepare'});assert.equal(r.body.receiptArchive.ok,true);assert.ok(DB.has('documents/registration-receipt_c1_landlord'));assert.equal(globalThis.deliveryMails.length,0);});
await test('CAF attaches only exact signed contract and scheda; repeat is not a resend',async()=>{reset();await adopt();await prepare();let r=await call({op:'send',kind:'completo',bill:false});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(globalThis.deliveryMails.length,1);assert.equal(globalThis.deliveryMails[0].attachments.length,2);assert.deepEqual(globalThis.deliveryMails[0].attachments[0].content,PDF);r=await call({op:'send',kind:'completo',bill:false});assert.equal(r.body.duplicate,true);assert.equal(globalThis.deliveryMails.length,1);});
await test('CAF missing original fails without sending a partial package',async()=>{reset();await adopt();await prepare();fault('signed',true);assert.equal((await call({op:'send',kind:'completo',bill:false})).body.error,'required_attachment_unavailable');assert.equal(globalThis.deliveryMails.length,0);});
await test('uncertain CAF transport is not blindly retried',async()=>{reset();await adopt();await prepare();globalThis.deliverySmtp=async()=>{throw Error('transport response lost');};assert.equal((await call({op:'send',bill:false})).code,422);globalThis.deliverySmtp=null;assert.equal((await call({op:'send',bill:false})).body.error,'caf_delivery_uncertain');assert.equal(globalThis.deliveryMailAttempts.length,1);});
await test('terms modified after adoption block preparation, transmission and registration',async()=>{reset();await adopt();DB.get('contracts/c1').rent=900;assert.equal((await call({op:'external-prepare'})).body.error,'signed_terms_changed');assert.equal((await call({op:'send',bill:false})).body.error,'signed_terms_changed');assert.equal((await call(receipt())).body.error,'signed_terms_changed');assert.equal(globalThis.deliveryMails.length,0);});
await test('old Magic Sign links cannot reopen the external definitive; no fabricated signatures',async()=>{reset();await adopt();for(const token of ['TOK_EXT_T','TOK_EXT_L']){let r=await call({token},lookup);assert.equal(r.code,410);r=await call({token,signature:SIG+'A'.repeat(300),consent:{text:'I accept',hash:'hash'}},submit);assert.equal(r.code,410);}const l=await call({},links);assert.equal(l.body.tenant,null);assert.equal(l.body.landlord,null);assert.equal(l.body.tenantSigned,true);assert.equal(current().tenantSignature,null);});
await test('pre-agreement receives a truthful external completion without phantom proposals',async()=>{
 reset({preAgreementId:'pa1'});DB.set('preAgreements/pa1',{contractId:'c1',status:'paid'});await adopt();await prepare();
 assert.equal(DB.get('preAgreements/pa1').contractSignatureStatus,'complete');assert.equal(DB.get('preAgreements/pa1').contractSignatureSource,'external');assert.equal(DB.get('preAgreements/pa1').status,'paid');
 reset({preAgreementId:'missing'});await adopt();const r=await prepare();assert.equal(r.preparation.steps.preagreement.ok,false);assert.ok(!DB.has('preAgreements/missing'));
});
await test('missing profile can be linked in the same practice with explicit identity review',async()=>{
 reset();DB.get('contracts/c1').coTenants[0].userId='';let s=await status();
 assert.equal((await call({op:'external-party',version:s.external.version,party:'co0',userId:'co1'})).body.error,'profile_confirmation_required');
 assert.equal((await call({op:'external-party',version:s.external.version,party:'co0',userId:'owner',confirm:true})).body.error,'profile_role_mismatch');
 assert.equal((await call({op:'external-party',version:s.external.version,party:'co0',userId:'co1',confirm:true})).code,200);
 await adopt();await prepare();assert.equal(DB.get('documents/contract-signed_c1_co0').userId,'co1');
});
await test('uncertain CAF resolution is explicit, waits for live attempt and preserves evidence',async()=>{
 reset();await adopt();await prepare();globalThis.deliverySmtp=async()=>{throw Error('response lost');};await call({op:'send',bill:false});globalThis.deliverySmtp=null;
 let s=await status();assert.equal((await call({op:'caf-resolve',version:s.external.version,outcome:'not_sent',confirm:true,note:'Checked SMTP rejection'})).body.error,'delivery_still_running');
 DB.get('contracts/c1').registrationCafDelivery.at='2026-10-15T13:00:00Z';s=await status();
 assert.equal((await call({op:'caf-resolve',version:s.external.version,outcome:'not_sent',note:'Checked'})).body.error,'delivery_verification_required');
 assert.equal((await call({op:'caf-resolve',version:s.external.version,outcome:'not_sent',confirm:true,note:'SMTP definitively rejected, operator checked'})).code,200);
 assert.equal(current().registrationCafHistory.length,1);assert.equal(globalThis.deliveryMailAttempts.length,1);
 assert.equal((await call({op:'send',bill:false})).code,200);assert.equal(globalThis.deliveryMails.length,1);
});
await test('template refresh started before external adoption cannot overwrite its canonical PDF',async()=>{
 reset();const old=current();const {ensureContractPdf}=await import('../../api/sign/_contractpdf.js');let adoptedUrl;
 hooks.beforeCommit=async writes=>{if(F.writesData(writes).some(x=>x.pdfGeneratedBy==='server')){hooks.beforeCommit=async()=>{};await adopt();adoptedUrl=current().signedPdfUrl;}};
 const url=await ensureContractPdf('c1',old,{force:true});assert.equal(url,adoptedUrl);assert.equal(current().generatedPDF,adoptedUrl);assert.equal(current().pdfSource,'upload');
});
await test('a signature already in flight cannot commit after external adoption',async()=>{
 reset({landlordSignature:SIG,signatureStatus:'partial'});
 const {MS_CONSENT_TEXT}=await import('../../api/magic-sign/submit.js');
 hooks.beforeCommit=async writes=>{if(F.writesData(writes).some(x=>x.tenantSignature)){hooks.beforeCommit=async()=>{};await adopt();}};
 const r=await call({token:'TOK_EXT_T',signature:SIG+'A'.repeat(300),consent:{text:MS_CONSENT_TEXT,hash:''}},submit);
 assert.equal(r.code,410,JSON.stringify(r.body));assert.ok(current().externalSignedDocument);assert.equal(current().tenantSignature,null);
});
await test('CAF completion cannot downgrade a receipt registered while mail was sending',async()=>{
 reset();await adopt();await prepare();globalThis.deliverySmtp=async()=>{assert.equal((await call(receipt())).code,200);};
 const r=await call({op:'send',bill:false});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(current().registrationStatus,'registered');assert.equal(current().registrationCafDelivery.status,'sent');
});
await test('large external original accepted by upload also fits the CAF transport',async()=>{
 reset();const b=await payload(),large=Buffer.concat([PDF,Buffer.alloc(9*1024*1024)]);b.pdfBase64=large.toString('base64');assert.equal((await call(b)).code,200);await prepare();
 assert.equal((await call({op:'send',bill:false})).code,200);assert.deepEqual(globalThis.deliveryMails[0].attachments[0].content,large);
});
await test('a saved registration receipt cannot silently become a different file or code',async()=>{
 reset();await adopt();await call(receipt());const url=current().registrationReceiptUrl;
 const different=Buffer.concat([PDF,Buffer.from('changed')]).toString('base64');
 assert.equal((await call({...receipt(),base64:different})).body.error,'receipt_already_recorded');
 assert.equal((await call({...receipt(),code:'OTHER-CODE'})).body.error,'receipt_already_recorded');
 assert.equal(current().registrationReceiptUrl,url);
});
await test('invitation and identity entry points recognize external signatures without inventing images',async()=>{
 reset();await adopt();const c=current();
 const {signatureState}=await import('../../api/preagreement/send-sign.js');const {schedaLocked}=await import('../../api/profile/_scheda.js');const {inviteCoTenants}=await import('../../api/sign/_cosign.js');const {default:sendLink}=await import('../../api/sign/send-link.js');
 const state=signatureState(c);assert.equal(state.tenantSigned,true);assert.equal(state.landlordSigned,true);assert.equal(state.coPending,0);
 for(const role of ['tenant','landlord','cotenant'])assert.equal(schedaLocked(c,role,0),true);
 assert.equal((await inviteCoTenants({contractId:'c1',contract:c,resend:true})).pending.length,0);
 assert.equal((await call({role:'tenant'},sendLink)).body.error,'already_signed');assert.equal(globalThis.deliveryMails.length,0);
});
assert.deepEqual(F.unexpected,[]);console.log(`External contract: ${n} end-to-end scenarios passed`);
