// Exercises the actual Portal functions, replacing only DOM/network/auth boundaries.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const start = source.indexOf('    function _aspiBankForm(');
const end = source.indexOf('    async function sendAspi(contractId)', start);
assert(start > 0 && end > start);
const els = Object.fromEntries(['aspiBankSummary','aspiDebitIban','aspiDebitHolder','aspiBankSaveBtn','aspiBankSheetBtn','aspiBankStatus'].map(k=>[k,{value:'',disabled:false,textContent:''}]));
const requests=[];let reject=false, sheets=0;
const ctx={window:{_aspiStatus:{contractId:'test',bank:{rliDebitIban:'',rliDebitHolder:''}}}, document:{getElementById:k=>els[k]},
 esc:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 auth:{currentUser:{getIdToken:async()=>'test-token'}},openFoglio:async()=>{sheets++},
 fetch:async(url,opts)=>{const b=JSON.parse(opts.body);requests.push({url,...b});return {ok:!reject,json:async()=>reject?{ok:false,error:'iban_invalid'}:{ok:true,bank:{rliDebitIban:b.rliDebitIban,rliDebitHolder:b.rliDebitHolder,ready:!!b.rliDebitIban&&!!b.rliDebitHolder}}}}};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
els.aspiDebitIban.value='it60 x054 2811 1010 0000 0123 456';els.aspiDebitHolder.value=' Test Holder ';
await ctx.saveAspiBank('test');
assert.equal(requests.length,1);assert.equal(requests[0].rliDebitIban,'IT60X0542811101000000123456');assert.equal(requests[0].rliDebitHolder,'Test Holder');assert.equal(sheets,0);
assert.match(els.aspiBankStatus.textContent,/Dati salvati/);assert.match(els.aspiBankSummary.textContent,/compilato/);
await ctx.sendAspiBankSheet('test');assert.equal(sheets,1);assert.equal(requests.length,1);
reject=true;els.aspiDebitIban.value='WRONG';await ctx.sendAspiBankSheet('test');
assert.equal(sheets,1,'failed save must not send an outdated sheet');assert.match(els.aspiBankStatus.textContent,/IBAN non valido/);assert.equal(els.aspiBankSheetBtn.disabled,false);
reject=false;els.aspiDebitIban.value='';els.aspiDebitHolder.value='';await ctx.saveAspiBank('test');assert.match(els.aspiBankStatus.textContent,/manca ancora/);
assert.match(ctx._aspiDeliveryNotes({packEmail:{status:'failed',attempts:5}}),/tentativi esauriti/);
assert.doesNotMatch(ctx._aspiDeliveryNotes({packEmail:{status:'failed',attempts:5}}),/riproverà/);
assert.match(ctx._aspiDeliveryNotes({packEmail:{status:'pending'}}),/attesa/);
assert(!ctx._aspiBankForm('test',{rliDebitHolder:'"><script>bad</script>'}).includes('<script>'));
console.log('Registration bank UI: save, recovery, no implicit email, stale-data guard, exhausted retry and escaping PASS');
