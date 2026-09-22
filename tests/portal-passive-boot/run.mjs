import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), RENT = require('../../js/rent-engine.js');
const source = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
function part(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'real function boundaries exist');
  return text.slice(a, b);
}
const fixed = Date.parse('2026-09-18T12:00:00Z');
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return fixed; }
}
function harness(text = source, role = 'admin', hash = '') {
  const effects = [], timers = [], routes = [], ui = [], nodes = new Map();
  const S = {profile:{role,name:'Operatore di esempio'}, users:[{id:'t',name:'Inquilino test',email:'tenant@example.invalid',phone:'390000000000'}, {id:'o'}],
    properties:[{id:'u',name:'Unità test',ownerId:'o'}],
    contracts:[{id:'c',tenantId:'t',propertyId:'u',status:'active',endDate:'2026-10-03'}],
    payments:[{id:'due',contractId:'c',amount:900,status:'pending',dueDate:'2026-09-23'}], userNotifications:[]};
  const ctx = vm.createContext({S, Date:TestDate, window:{location:{hash},BOOM_RENT:RENT},
    document:{getElementById(id) { if(!nodes.has(id)) nodes.set(id,{removeAttribute(){},textContent:'',innerHTML:''}); return nodes.get(id); }},
    localStorage:{getItem:()=>null}, roleLabel:r=>r, initials:()=> 'OT', isAdmin:()=>S.profile.role==='admin',
    innestoSeedFromHash:()=>null, goTo:(...args)=>routes.push(args),
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
    console:{log(){},error(...args){effects.push(['error',...args]);}},
    EMAILJS_CONFIG:{templates:{notification:'test'}},fmtDate:d=>d,
    firebase:{firestore:{FieldValue:{serverTimestamp:()=> 'test-now'}}},
    db:{collection(name){return {add:async data=>effects.push(['add',name,data]),doc(id){return {update:async data=>effects.push(['update',name,id,data])};}};}},
    createNotification:async (...args)=>effects.push(['notification',...args]),
    sendBoomEmail:async (...args)=>effects.push(['email',...args]),
    generatePass:async (...args)=>{effects.push(['pass',...args]);return {blob:{},url:'https://example.invalid/pass'};},
    sendPassWhatsApp:(...args)=>effects.push(['whatsapp',...args])
  });
  for (const name of ['checkStripeReturn','loadCompanySettings','startNotificationListener','startContractsListener','startActionQueueListener',
    'startSignRequestsListener','startRadarListener','startInboxListener','startHeartbeatListener','startMaintenanceListener','startAgentFeedListener','buildNav']) ctx[name]=()=>ui.push(name);
  const fragments = [
    part(text,'    function setupApp() {','    function buildNav()'),
    part(text,'    async function checkContractExpiry() {','    function updateNotifBadge()'),
    part(text,'    async function checkScheduledNotifications() {','    function isToday('),
    part(text,'    async function notifyPaymentDueSoon(','    async function notifyNewDocument('),
    part(text,'    function daysUntil(','    function daysSince('),
    part(text,'    function isToday(','    async function refresh()')
  ];
  vm.runInContext(fragments.join('\n'),ctx);
  return {ctx,S,effects,timers,routes,ui,run:code=>vm.runInContext(code,ctx),async drain(){while(timers.length)await timers.shift().fn();}};
}
let checks=0;
async function test(name, fn) { await fn(); checks++; console.log('PASS '+name); }
async function passive(text,role='admin',hash='') {
  const h=harness(text,role,hash), before=JSON.stringify(h.S);
  h.run('setupApp();setupApp()');
  assert.equal(h.timers.length,0,'boot schedules no operational callbacks');
  await h.drain();
  assert.deepEqual(h.effects,[],'opening creates no notification, email, pass, record or WhatsApp action');
  assert.equal(JSON.stringify(h.S),before,'opening does not mark contracts as reviewed');
  assert.equal(h.routes.length,2);
  assert(h.ui.includes('startNotificationListener') && h.ui.includes('buildNav'),'read listeners/navigation preserved');
  return h;
}
await test('admin Home and repeat setup are passive even with due payments and expiring contracts',()=>passive(source));
await test('Canoni deep link stays on payments without operational effects',async()=>{const h=await passive(source,'admin','#payments');assert.equal(h.routes[0][0],'payments');});
await test('tenant setup preserves its dashboard and remains passive',async()=>{const h=await passive(source,'tenant');assert.equal(h.routes[0][0],'dashboard');});
await test('explicit notification action still notifies a payable rate',async()=>{const h=harness();await h.run('checkScheduledNotifications()');assert.equal(h.effects.length,1);assert.equal(h.effects[0][5].paymentId,'due');});
async function reportedGuard(text) {
  const h=harness(text), p=h.S.payments[0];
  h.S.payments=[{...p,id:'reported',tenantReported:true},{...p,id:'sdd',sddPiId:'pi_test',sddStatus:'processing'},
    {...p,id:'card',stripeStatus:'processing'},{...p,id:'paid',status:'paid'},{...p,id:'invalid',amount:0}];
  await h.run('checkScheduledNotifications()');assert.deepEqual(h.effects,[],'no reminders for reported/processing/paid/invalid rates');
}
await test('explicit notifications respect the shared payable state',()=>reportedGuard(source));
await test('existing same-day reminder is not sent again',async()=>{const h=harness();h.S.userNotifications=[{type:'payment',data:{paymentId:'due'},createdAt:'2026-09-18'}];await h.run('checkScheduledNotifications()');assert.deepEqual(h.effects,[]);});
await test('explicit contract notification remains available',async()=>{const h=harness();h.S.payments=[];h.S.contracts[0].endDate='2026-09-25';await h.run('checkScheduledNotifications()');assert.equal(h.effects.filter(e=>e[0]==='notification').length,2);});
await test('explicit review still runs once and marks the contract only after delivery path',async()=>{const h=harness();await h.run('checkContractExpiry()');assert.deepEqual(h.effects.map(e=>e[0]),['email','add','pass','whatsapp','update']);assert.equal(h.S.contracts[0].reviewRequestSent,true);const n=h.effects.length;await h.run('checkContractExpiry()');assert.equal(h.effects.length,n);});
async function tenantExpiry(text) { const h=harness(text,'tenant');await h.run('checkContractExpiry();checkScheduledNotifications()');assert.deepEqual(h.effects,[],'tenant never triggers bulk review or reminders'); }
await test('bulk operations remain admin-only when invoked directly',()=>tenantExpiry(source));
// Reintroduce each defect into the REAL functions, without modifying the repository.
for(const fn of ['checkScheduledNotifications','checkContractExpiry']) {
  const mutant=source.replace('    function setupApp() {','    function setupApp() {\n        setTimeout(() => '+fn+'(), 5000);');
  await test('mutation killed: restore boot timer '+fn,async()=>{await assert.rejects(()=>passive(mutant),/boot schedules/);});
}
await test('mutation killed: ignore reported/processing state in reminder selection',async()=>{
  const mutant=source.replace("p.status === 'pending' && window.BOOM_RENT.canPay(p)","p.status === 'pending'");assert.notEqual(mutant,source);
  await assert.rejects(()=>reportedGuard(mutant),/no reminders/);
});
await test('mutation killed: allow tenant to trigger review/referral campaign',async()=>{
  const original=part(source,'    async function checkContractExpiry() {','    function updateNotifBadge()');
  const mutant=source.replace(original,original.replace('        if (!isAdmin()) return;\n',''));assert.notEqual(mutant,source);
  await assert.rejects(()=>tenantExpiry(mutant),/tenant never/);
});
console.log(`${checks} passive-boot checks passed, including 4 mutations. No real network or writes; lastLogin telemetry is outside this test.`);
