import {resolve as checkoutResolve} from './checkout-loader.mjs';
let mutation;
export function initialize(data){mutation=data?.mutation;}
export const resolve=checkoutResolve;
export async function load(url,context,next){
 const out=await next(url,context);
 const edits={
  resume:['_payment-session.js','lock=await acquireLock({pa,paId:id,renew:true,proposalVersion:snapshot.updateTime,','lock=await (async()=>({ok:true,guards:[],proposalVersion:snapshot.updateTime}))({pa,paId:id,renew:true,proposalVersion:snapshot.updateTime,'],
  cas:['_lock.js','precondition:e.before ? {updateTime:e.before.updateTime} : {exists:false}','precondition:e.before ? {exists:true} : {exists:false}'],
  read:['_lock.js','} catch (error) { await rollback(entries); throw error; }','} catch (error) { /* mutant: ignore unreadable availability */ }'],
  release:['_lock.js',"await fsDelete('propertyLocks/'+id,{updateTime:snapshot.updateTime}); n++;","await fsDelete('propertyLocks/'+id); n++;"],
 };
 const change=edits[mutation];
 if(change&&url.endsWith('/api/preagreement/'+change[0])){const code=String(out.source);if(!code.includes(change[1]))throw Error('Missing mutation target '+mutation);return{...out,source:code.replace(change[1],change[2])};}
 return out;
}
