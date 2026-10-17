import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const access=require('../../js/tenant-access-engine.js');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
const current={id:'current',tenantId:'t1',status:'active',startDate:'2026-09-01',endDate:'2026-12-31'};
const future={id:'future',tenantId:'t1',status:'active',startDate:'2027-01-01',endDate:'2027-06-30'};
const past={id:'past',status:'expired',startDate:'2026-01-01',endDate:'2026-06-30'};
await test('current lease wins over a future contract already marked active',()=>assert.equal(access.choose([future,past,current],'2026-10-05').id,'current'));
await test('nearest future lease wins before move-in',()=>assert.equal(access.choose([future,{...future,id:'far',startDate:'2028-01-01'}],'2026-10-05').id,'future'));
await test('explicit lease and paid-return lease preserve the intended home',()=>{
 assert.equal(access.choose([current,future],'2026-10-05','future').id,'future');
 assert.equal(access.choose([current,future],'2026-10-05',null,{contractId:'future'}).id,'future');
 assert.equal(access.choose([current],'2026-10-05','not-owned'),null);
});
await test('terminated future lease never hides current home',()=>assert.equal(access.choose([current,{...future,status:'terminated'}],'2026-10-05').id,'current'));
await test('invitation requires linked tenant profile and carries no email or token',()=>{
 const tenant={id:'t1',role:'tenant',email:'test@example.test'};
 const url=new URL(access.inviteUrl(current,tenant));
 assert.equal(url.origin,'https://www.boomrome.com');
 assert.equal(url.searchParams.get('next'),'/casa?contract=current');
 assert.equal(url.href.includes(tenant.email),false);
 assert.equal(access.inviteUrl(current,{...tenant,id:'other'}),null);
 assert.equal(access.inviteUrl(current,{...tenant,role:'admin'}),null);
 assert.equal(access.inviteUrl(current,{...tenant,email:''}),null);
});
await test('welcome stage distinguishes own signature, co-tenants, completion and closed contracts',()=>{
 assert.equal(access.stage({generatedPDF:'https://files.example.test/lease'}),'review');
 assert.equal(access.stage({tenantSignature:'signed'}),'owner_signature');
 assert.equal(access.stage({tenantSignature:'signed',coTenants:[{name:'Co-tenant'}]}),'other_signatures');
 assert.equal(access.stage({tenantSignature:'signed',landlordSignature:'signed'}),'verifying');
 assert.equal(access.stage({signatureStatus:'complete'}),'signed');
 assert.equal(access.stage({signatureStatus:'completed',status:'cancelled'}),'closed');
 assert.equal(access.stage({status:'accepted'}),'preparing');
});
const login=readFileSync(new URL('../../login.html',import.meta.url),'utf8');
const script=[...login.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('DOMContentLoaded'));
function fixture({error,query='?next=%2Fcasa%3Fcontract%3Dcurrent'}={}){
 const els=new Map();let authCb;const calls=[];
 function el(id){if(!els.has(id))els.set(id,{value:'',listeners:{},classList:{toggle(){},remove(){}},addEventListener(n,f){this.listeners[n]=f},focus(){},select(){},setAttribute(){}});return els.get(id)}
 const auth={setPersistence:async()=>{},onAuthStateChanged(cb){authCb=cb},sendPasswordResetEmail:async(...args)=>{calls.push(args);if(error)throw {code:error}}};
 const ctx={console,URLSearchParams,location:{search:query,href:'/login'},navigator:{userAgent:'test'},setTimeout(){},sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},document:{getElementById:el,addEventListener(n,cb){if(n==='DOMContentLoaded')cb()}},firebase:{initializeApp(){},auth:Object.assign(()=>auth,{Auth:{Persistence:{LOCAL:'local',SESSION:'session'}}})}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(script,ctx);
 return {ctx,els,calls,emit:u=>authCb(u),reset:async()=>{el('email').value='test@example.test';await el('forgotBtn').listeners.click()}};
}
await test('first access requests an email with a safe continuation to the chosen home',async()=>{
 const f=fixture();await f.reset();assert.equal(f.calls.length,1);
 assert.equal(new URL(f.calls[0][1].url).searchParams.get('next'),'/casa?contract=current');
 assert.match(f.els.get('message').innerHTML,/If an account exists/);
});
await test('reset network failure never claims email success and permits retry',async()=>{
 const f=fixture({error:'auth/network-request-failed'});await f.reset();assert.match(f.els.get('message').innerHTML,/could not request/);assert.equal(f.els.get('forgotBtn').disabled,false);
});
await test('unknown account is indistinguishable from accepted reset',async()=>{
 const f=fixture({error:'auth/user-not-found'});await f.reset();assert.match(f.els.get('message').innerHTML,/If an account exists/);
});
await test('anonymous signing session cannot bounce back into the protected area',()=>{
 const f=fixture();f.emit({isAnonymous:true});assert.equal(f.ctx.location.href,'/login');f.emit({isAnonymous:false});assert.equal(f.ctx.location.href,'/casa?contract=current');
});
await test('reset continuation cannot redirect to another origin',async()=>{
 for(const next of ['//evil.example','/\\evil.example','https://evil.example']){
  const f=fixture({query:'?next='+encodeURIComponent(next)});await f.reset();assert.equal(new URL(f.calls[0][1].url).searchParams.get('next'),'/portal');
 }
});
const portal=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const hub=portal.slice(portal.indexOf('    async function openShareHub('),portal.indexOf('    window.openShareHub = openShareHub;'));
await test('real Share Hub renders tenant invitation without sending email or WhatsApp',async()=>{
 const box={innerHTML:''},net=[];
 const ctx={console,S:{contracts:[current],users:[{id:'t1',role:'tenant',email:'test@example.test',name:'Test',phone:'123'}],properties:[]},window:{location:{origin:'https://www.boomrome.com'},BOOM_TENANT_ACCESS:access},document:{getElementById(){return box}},isAdmin:()=>true,toast(){},fetchSignLinks:async()=>({}),auth:{currentUser:{getIdToken:async()=> 'synthetic'}},fetch:async(url)=>{net.push(url);return {json:async()=>({ok:false})}},esc:s=>String(s||'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')};
 vm.createContext(ctx);vm.runInContext(hub+'\nthis.openShareHub=openShareHub;',ctx);await ctx.openShareHub('current');
 assert.match(box.innerHTML,/Invita alla dashboard inquilino/);assert.match(box.innerHTML,/First%20access/);assert.deepEqual(net,['/api/profile/link']);
});
console.log(`${passed} tenant access scenarios passed`);
