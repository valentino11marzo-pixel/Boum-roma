// Exercise the production action and rule catalogue: list-only previews missed
// the accidental removal of the handler and both rule definitions.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const start=source.indexOf('    async function updateMaintenanceStatus(');
assert(start>=0,'Maintenance action must exist');
const end=source.indexOf('    function rulesPage()',start);
assert(end>start);
const block=source.slice(start,end);
let checks=0;
function fixture({role='admin',fail=false,wait=null}={}){
 const effects=[],user={uid:'operator'};
 const S={profile:{id:user.uid,role},maintenance:[{id:'ticket',title:'Rubinetto',userId:'tenant',propertyId:'house'}],properties:[{id:'house',name:'Casa prova',ownerId:'owner'}]};
 const auth={currentUser:user};
 const context={S,auth,isAdmin:()=>S.profile.role==='admin',statusLabel:x=>x,
  db:{collection:collection=>({doc:id=>({update:async fields=>{effects.push(['write',collection,id,fields]);if(wait)await wait;if(fail)throw Error('write failed');}})})},
  firebase:{firestore:{FieldValue:{serverTimestamp:()=>({serverTimestamp:true})}}},
  logActivity:(...args)=>effects.push(['activity',...args]),toast:(...args)=>effects.push(['toast',...args]),
  goTo:(...args)=>effects.push(['route',...args]),notifyMaintenanceResolved:async m=>effects.push(['resolved',m.id]),
  createNotification:async(...args)=>effects.push(['notification',...args])};
 runInNewContext(block+'\nthis.action=updateMaintenanceStatus;this.rules={triggers:RULE_TRIGGERS,actions:RULE_ACTIONS};',context);
 return {context,effects,auth};
}
for(const status of ['in_progress','resolved']){
 const f=fixture();await f.context.action('ticket',status);
 assert.equal(f.effects[0][0],'write');assert.equal(f.effects[0][3].status,status);
 assert.equal(f.effects.filter(e=>e[0]==='toast'&&e[1]==='success').length,1);
 assert(f.effects.some(e=>e[0]===(status==='resolved'?'resolved':'notification')));
 assert.deepEqual(f.effects.at(-1),['route','maintenance']);checks++;
}
{const f=fixture({fail:true});await f.context.action('ticket','resolved');assert.equal(f.effects.filter(e=>['resolved','notification','route'].includes(e[0])).length,0);assert(!f.effects.some(e=>e[0]==='toast'&&e[1]==='success'));checks++;}
{const f=fixture({role:'tenant'});await f.context.action('ticket','resolved');assert.equal(f.effects.length,0);checks++;}
{const f=fixture();await f.context.action('ticket','paid');assert.equal(f.effects.length,0);checks++;}
{let release;const f=fixture({wait:new Promise(r=>release=r)});const pending=f.context.action('ticket','resolved');f.auth.currentUser={uid:'other'};release();await pending;assert.equal(f.effects.length,1,'A late write must not notify or replace the new account screen');checks++;}
{const f=fixture();assert(Object.keys(f.context.rules.triggers).length>0);assert(Object.keys(f.context.rules.actions).length>0);for(const rule of Object.values(f.context.rules.triggers))assert(rule.name&&rule.category);checks++;}
console.log('Maintenance actions and rule catalogue: '+checks+' passed');
