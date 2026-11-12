import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import E from '../../js/moving-budget-engine.js';
import {CITY_MARKETS,CITY_PLANS} from '../../api/_market.js';
const root=new URL('../../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root),'utf8');
let passed=0;function check(label,fn){fn();passed++;console.log('  ✓ '+label);}
function scenario(engine){
  const entries=Object.fromEntries(engine.fields.map(f=>[f.id,{status:'confirmed',amount:'0'}]));
  Object.assign(entries,{firstRent:{status:'confirmed',amount:'1400'},deposit:{status:'confirmed',amount:'2800'},temporary:{status:'estimated',amount:'300.50'},travel:{status:'estimated',amount:'99.99'},rent:{status:'confirmed',amount:'1400'},bills:{status:'estimated',amount:'100'}});
  const r=engine.calculate(entries);assert.equal(r.cash,460049);assert.equal(r.arrival,180049);assert.equal(r.deposit,280000);assert.equal(r.monthly,150000);assert.equal(r.complete,true);assert.equal(r.groups.arrival.estimated,40049);
}
check('first rent, deposit and recurring money are separate; cents are exact',()=>scenario(E));
check('empty worksheet is incomplete, not a zero-cost move',()=>{const r=E.calculate({});assert.equal(r.complete,false);assert.equal(r.missing.length,9);});
check('unknown amounts do not enter totals even if an earlier value exists',()=>{const r=E.calculate({deposit:{status:'unknown',amount:'9000'}});assert.equal(r.deposit,0);assert.ok(r.missing.includes('deposit'));});
check('explicit zero is a checked line',()=>{const r=E.calculate({deposit:{status:'confirmed',amount:'0'}});assert.ok(!r.missing.includes('deposit'));assert.equal(r.invalid.length,0);});
check('invalid amount stays unresolved, never zero',()=>{const r=E.calculate({deposit:{status:'estimated',amount:'1,000.25'}});assert.deepEqual(r.invalid,['deposit']);assert.equal(r.complete,false);});
check('negative, blank, exponent, infinity, thousands and excessive amounts refused',()=>{for(const v of ['', ' ', '-1','1e3','Infinity','NaN','1,234.50','0.001','1000000.01',null,undefined,{},true])assert.equal(E.cents(v),null,String(v));});
check('decimal comma, exact cents and upper bound supported',()=>{assert.equal(E.cents(' 1234,56 '),123456);assert.equal(E.cents('0.01'),1);assert.equal(E.cents(1000000),100000000);});
check('unknown certainty cannot silently become confirmed',()=>{assert.deepEqual(E.calculate({rent:{status:'invented',amount:'1200'}}).invalid,['rent']);});
check('inputs are never mutated',()=>{const x={rent:{status:'confirmed',amount:'2'}};const before=JSON.stringify(x);E.calculate(x);assert.equal(JSON.stringify(x),before);});
check('generated page agrees with its inputs',()=>execFileSync(process.execPath,['tools/moving-budget/build.mjs','--check'],{cwd:root,stdio:'pipe'}));
const html=read('moving-budget.html');const data=JSON.parse(html.match(/id="deskData">([^<]+)</)[1]);
check('every live city uses its actual currency and payment stage',()=>{for(const [slug,m] of Object.entries(CITY_MARKETS)){const c=JSON.parse(read('cities/'+slug+'.json'));if(!c.live)continue;const d=data.find(d=>d.slug===slug);assert.ok(d,slug);assert.equal(d.currency,(m.currency||'eur').toUpperCase());assert.equal(d.chargeAt,m.chargeAt||'checkout');}});
check('desk fees and VAT visible without JavaScript',()=>{for(const d of data){const m=CITY_MARKETS[d.slug];assert.ok(html.includes((m.currency==='gbp'?'£':'€')+CITY_PLANS['full-search'].eur+' Full Search · VAT included'));assert.ok(html.includes('href="/'+d.slug+'"'));}});
check('no-JS worksheet is disabled with a visible method and fallback links',()=>{assert.match(html,/<noscript>/);assert.match(html,/id="city" disabled/);assert.match(html,/id="method"/);assert.match(html,/href="\/desks"/);});
check('worksheet cannot submit or trigger form-based lead tracking',()=>assert.doesNotMatch(html,/<form\b/));
check('selecting certainty before typing leaves the amount unresolved',()=>{const r=E.calculate({rent:{status:'confirmed',amount:''}});assert.ok(r.missing.includes('rent'));assert.equal(r.invalid.length,0);});
check('public links and sitemap discover the tool',()=>{for(const file of ['desks.html','services.html','sitemap.xml','llms.txt'])assert.ok(read(file).includes('/moving-budget'),file);});
check('personal amounts have no transport, URL or storage code',()=>assert.doesNotMatch(read('assets/moving-budget.js'),/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|location\.(?:search|hash)\s*=/));
check('mutation: adding a recurring month to arrival cash is detected',()=>{const source=read('js/moving-budget-engine.js').replace('cash:arrival+deposit','cash:arrival+deposit+monthly');const context={module:{exports:{}}};vm.runInNewContext(source,context);assert.throws(()=>scenario(context.module.exports));});
check('mutation: treating unknown as complete is detected',()=>{const source=read('js/moving-budget-engine.js').replace('complete:missing.length===0&&invalid.length===0','complete:true');const context={module:{exports:{}}};vm.runInNewContext(source,context);assert.equal(context.module.exports.calculate({}).complete,true);assert.throws(()=>assert.equal(context.module.exports.calculate({}).complete,false));});
console.log(`\n${passed} passed, 0 failed`);
