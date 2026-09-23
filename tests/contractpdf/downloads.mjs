// Actual handlers, shared renderer and download helpers; IO only is simulated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { jsPDF } from 'jspdf';
const read = n => fs.readFileSync(new URL('../../' + n, import.meta.url), 'utf8');
const portal = read('js/portal-app.js');
const named = (name, source = portal) => {
  const match = new RegExp('^    (?:async )?function ' + name + '\\(', 'm').exec(source);
  if (!match) return '';
  const start = match.index, next = source.slice(start + 5).search(/\n    (?:async )?function /);
  return source.slice(start, start + 5 + next);
};
const draftUrl = 'https://storage.invalid/draft.pdf', signedUrl = 'https://storage.invalid/signed.pdf';
const flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
function fixture({ fresh = {}, readError = false, missing = false, pending = false, admin = true, blocked = false, fileError = false, source = portal } = {}) {
  const effects = [], reads = [], notices = [], files = [], opened = [], saves = [], popups = [], timers = new Map(); let timerId=0, resolveRead;
  const local = { id:'c1', propertyId:'p1', tenantId:'u1', type:'transitorio', rent:1000, startDate:'2026-09-01', endDate:'2027-08-31', generatedPDF:draftUrl };
  let record = { ...local, ...fresh };
  const snap = () => ({ exists:!missing, data:() => ({...record}) });
  const ctx=vm.createContext({
    Blob, Uint8Array, TextEncoder, crypto:webcrypto, AbortController, atob,
    URL:{createObjectURL:()=>'blob:synthetic',revokeObjectURL(){}},
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    console:{log(){},warn(){},error(){}},navigator:{userAgent:'Synthetic desktop',platform:'',maxTouchPoints:0},
    jspdf:{jsPDF},isAdmin:()=>admin,
    S:{contracts:[local],properties:[{id:'p1',name:'Immobile prova'}],users:[{id:'u1',name:'Persona prova'}]},
    toast:(...args)=>notices.push(args),
    open:(url)=>{if(blocked)return null;if(url!=='about:blank')opened.push(url);const popup={closed:false,document:{body:{}},location:{replace:u=>opened.push(u)},close(){this.closed=true;}};popups.push(popup);return popup;},
    document:{body:{appendChild(){}},createElement:()=>({style:{},remove(){},click(){saves.push({url:this.href,name:this.download});}})},
    fetch:async url=>{files.push(url);if(fileError)throw Error('synthetic network failure');return {ok:true,blob:async()=>new Blob(['%PDF-synthetic download'])};},
    firebase:{storage:()=>({ref:()=>({child:()=>({put:async()=>effects.push('upload'),getDownloadURL:async()=>draftUrl})})}),firestore:{FieldValue:{serverTimestamp:()=>0}}},
    db:{collection:()=>({doc:()=>({
      get:opts=>{reads.push(opts);if(readError)return Promise.reject(Error('synthetic denied'));if(pending)return new Promise(resolve=>resolveRead=resolve);return Promise.resolve(snap());},
      update:async patch=>{effects.push('patch');Object.assign(record,patch);}
    })})}
  });
  ctx.window=ctx;
  vm.runInContext(read('js/contract-pdf.js'),ctx);
  vm.runInContext(['generateContractPDF','generateDocHash','boomSave','boomDownloadUrl','boomOpen','readContractPDF','previewContractPDF','downloadSignedContractPDF','downloadContractPDF'].map(n=>named(n,source)).join('\n'),ctx);
  return {ctx,effects,reads,notices,files,opened,saves,popups,local,run:n=>ctx[n]('c1'),fire:ms=>{for(const[id,t]of[...timers])if(t.ms===ms){timers.delete(id);t.fn();}},resolve:()=>resolveRead(snap())};
}
let pass=0,fail=0;
async function test(n,fn){try{await fn();pass++;console.log('PASS '+n);}catch(e){fail++;console.error('FAIL '+n+': '+e.message);}}
const actions=['downloadContractPDF','downloadSignedContractPDF','previewContractPDF'];
async function signedDocumentInvariant(f,action='downloadContractPDF') {
  await f.run(action);
  assert.deepEqual(f.effects,[],'a read action must never regenerate or patch the contract');
  assert([...f.files,...f.opened].includes(signedUrl),'canonical signed document is delivered');
  assert(![...f.files,...f.opened].includes(draftUrl));
}
async function missingSignedInvariant(f) {
  await f.run('downloadSignedContractPDF');assert.equal(f.files.length,0);assert.deepEqual(f.effects,[]);assert(f.notices.some(n=>/firmato.*non.*disponibile/i.test(n.slice(1).join(' '))));
}
for(const action of actions){
  await test(action+': archived signed PDF wins over stale local draft without writes',async()=>{
    const f=fixture({fresh:{signedPdfUrl:signedUrl,tenantSignature:'recorded',landlordSignature:'recorded',signatureStatus:'complete'}});
    await signedDocumentInvariant(f,action);
  });
  await test(action+': read failure is actionable and never turns into generation',async()=>{
    const f=fixture({readError:true});await f.run(action);
    assert.deepEqual(f.effects,[]);assert.equal(f.files.length+f.opened.length,0);
    assert(f.notices.some(n=>n[0]==='error' && /riprova|connessione/i.test(n.slice(1).join(' '))));
  });
  await test(action+': missing record does not use cached document',async()=>{
    const f=fixture({missing:true});await f.run(action);assert.deepEqual(f.effects,[]);assert.equal(f.files.length+f.opened.length,0);assert(f.notices.some(n=>n[0]==='error'));
  });
  await test(action+': timed-out read and late result cannot open a stale document',async()=>{
    const f=fixture({pending:true});let done=false;const task=f.run(action).then(()=>done=true);await flush();
    assert(!done);f.fire(12000);await flush();assert(done,'read finishes after its deadline');await task;
    f.resolve();await flush();assert.equal(f.files.length+f.opened.length,0);assert.deepEqual(f.effects,[]);
  });
}
await test('missing signed PDF is not presented as a signed draft',async()=>{
  const f=fixture({fresh:{signatureStatus:'complete',pdfRegeneratedAfterSign:true,tenantSignature:'recorded'}});
  await missingSignedInvariant(f);
});
await test('unsigned missing PDF asks admin to generate explicitly',async()=>{
  const f=fixture({fresh:{generatedPDF:null}});await f.run('downloadContractPDF');assert.deepEqual(f.effects,[]);assert(f.notices.some(n=>/Rigenera PDF/.test(n.slice(1).join(' '))));
});
await test('tenant missing PDF does not suggest an admin-only command',async()=>{
  const f=fixture({fresh:{generatedPDF:null},admin:false});await f.run('downloadContractPDF');assert.deepEqual(f.effects,[]);assert(f.notices.some(n=>/BOOM/.test(n.slice(1).join(' '))));assert(!f.notices.some(n=>/Rigenera/.test(n.slice(1).join(' '))));
});
await test('partial cotenant signature never causes regeneration or a false signed label',async()=>{
  const f=fixture({fresh:{coTenants:[{signature:'recorded'}]}});await f.run('downloadContractPDF');assert.deepEqual(f.effects,[]);assert(f.files.includes(draftUrl));assert(!f.notices.some(n=>n[0]==='success'&&/firmato/i.test(n.slice(1).join(' '))));
});
await test('download opened as fallback is announced as opened, not saved',async()=>{
  const f=fixture({fileError:true});await f.run('downloadContractPDF');assert(f.notices.some(n=>n[0]==='success'&&/aperto/i.test(n[1])));assert(!f.notices.some(n=>n[0]==='success'&&/scaricato/i.test(n[1])));
});
await test('blocked preview reports the popup failure',async()=>{
  const f=fixture({blocked:true});await f.run('previewContractPDF');assert(f.notices.some(n=>n[0]==='error'&&/pop-up/.test(n[1])));
});
await test('legacy base64 PDF is delivered through the real blob helper',async()=>{
  const f=fixture({fresh:{generatedPDF:'data:application/pdf;base64,JVBERi0='}});await f.run('previewContractPDF');assert.equal(f.saves.length,1);assert.deepEqual(f.effects,[]);
});
await test('unsupported document URLs never open or download',async()=>{
  const f=fixture({fresh:{generatedPDF:'javascript:alert(1)'}});await f.run('previewContractPDF');assert.equal(f.files.length+f.opened.length,0);assert(f.notices.some(n=>n[0]==='error'));
});
await test('reading the server is explicit for all three document actions',async()=>{
  for(const action of actions){const f=fixture({fresh:{signedPdfUrl:signedUrl}});await f.run(action);assert.equal(f.reads.length,1);assert.equal(f.reads[0].source,'server');}
});
await test('iOS preview preserves its existing multi-page viewer using the canonical file',async()=>{
  const f=fixture({fresh:{signedPdfUrl:signedUrl}});f.ctx.navigator.userAgent='iPhone';await f.run('previewContractPDF');assert.equal(f.opened.length,1);assert(f.opened[0].includes(encodeURIComponent(signedUrl)));assert.deepEqual(f.effects,[]);
});
await test('mutation: preferring the stale draft is detected',async()=>{
  const source=portal.replace('contract.signedPdfUrl || (!signedOnly && contract.generatedPDF)','contract.generatedPDF');assert.notEqual(source,portal);
  await assert.rejects(signedDocumentInvariant(fixture({source,fresh:{signedPdfUrl:signedUrl}})),/canonical signed document/);
});
await test('mutation: regenerating during read produces the forbidden writes',async()=>{
  const source=portal.replace('const contract = snapshot.data();','const contract = snapshot.data(); await generateContractPDF(contractId);');assert.notEqual(source,portal);
  await assert.rejects(signedDocumentInvariant(fixture({source,fresh:{signedPdfUrl:signedUrl}})),/must never regenerate/);
});
await test('mutation: treating legacy flag as signed returns the wrong document',async()=>{
  const source=portal.replace('contract.signedPdfUrl || (!signedOnly && contract.generatedPDF)','contract.signedPdfUrl || (contract.pdfRegeneratedAfterSign && contract.generatedPDF) || (!signedOnly && contract.generatedPDF)');assert.notEqual(source,portal);
  await assert.rejects(missingSignedInvariant(fixture({source,fresh:{pdfRegeneratedAfterSign:true}})),/Expected values/);
});
console.log(`${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
