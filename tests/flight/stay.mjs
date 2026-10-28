import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const S=require('../../js/stay-engine.js');
let checks=0;
function check(name,fn){fn();checks++;console.log('  ✓ '+name);}
check('Stay accepts exact months in the technical planner range, never ambiguous ranges or coercions',()=>{
 for(const n of S.choices){assert.equal(S.months(n),n);assert.equal(S.months(String(n)),n);}
 for(const n of [4,48,120])assert.equal(S.months(n),n);
 for(const n of [null,undefined,true,{},[],0,-1,1,2,1.5,121,119988,'6-12','12+',' 6 ','1e1','6 months'])assert.equal(S.months(n),null);
 assert.equal(S.label(1),'');assert.equal(S.read('?stay=1'),null);assert.equal(S.label(6),'6 months');assert.equal(S.label('12+'),'');
});
check('Civil dates reject rollover, timestamps and malformed years; month arithmetic clamps without DST drift',()=>{
 for(const d of ['2027-02-29','2026-04-31','0000-01-01','2027-1-01','2027-01-01T00:00:00Z'])assert.equal(S.date(d),null);
 assert.equal(S.date('2028-02-29'),'2028-02-29');
 assert.equal(S.addMonths('2027-01-31',3),'2027-04-30');
 assert.equal(S.addMonths('2027-11-30',3),'2028-02-29');
 assert.equal(S.addMonths('2028-02-29',12),'2029-02-28');
 assert.equal(S.addMonths('2027-03-28',6),'2027-09-28');
 assert.equal(S.addMonths('9999-11-01',3),null);
 assert.deepEqual(S.period('2027-01-31','2027-05-01'),{wholeMonths:3,days:1,months:null,meetsMinimum:true});
 assert.equal(S.period('2027-01-31','2027-04-30').months,3);
});
check('Explicit dates outrank the shortcut; extra days stay exact and never create a rounded quote',()=>{
 assert.deepEqual(S.intent('?stay=12&moveIn=2027-01-31&moveOut=2027-04-30'),{moveIn:'2027-01-31',moveOut:'2027-04-30',durationMonths:3});
 assert.deepEqual(S.intent('?stay=6&moveIn=2027-01-31'),{moveIn:'2027-01-31',moveOut:'2027-07-31',durationMonths:6});
 assert.deepEqual(S.intent('?stay=12&moveIn=2027-01-31&moveOut=2027-05-01'),{moveIn:'2027-01-31',moveOut:'2027-05-01',durationMonths:null});
 assert.equal(S.intent('?stay=12&moveIn=2027-01-31&moveOut=2027-02-30').durationMonths,null);
 assert.equal(S.intent('?stay=12&moveIn=2027-01-31&moveOut=2027-02-30').moveOut,null);
 assert.equal(S.intent('?stay=6','#dal=2027-01-31').moveOut,'2027-07-31');
 assert.match(S.summary({moveIn:'2027-01-31',moveOut:'2027-05-01'}),/3 months \+ 1 day$/);
});
check('Validation enforces three calendar months, both dates and a bounded planner, without claiming lease eligibility',()=>{
 for(const i of [{moveIn:'2027-01-31'},{moveOut:'2027-05-01'}, {moveIn:'2027-01-31',moveOut:'2027-01-30'}, {moveIn:'2027-01-31',moveOut:'2027-04-29'}, {moveIn:'2027-01-01',moveOut:'2037-01-02'}, {moveIn:'0001-01-01',moveOut:'9999-12-31'}])assert.ok(S.validate(i));
 assert.equal(S.validate({moveIn:'2027-01-31',moveOut:'2027-04-30'}),null);
 assert.equal(S.validate({moveIn:'2027-01-01',moveOut:'2037-01-01'}),null);
 assert.equal(S.validate({durationMonths:6}),null);assert.equal(S.validate({}),null);
 const value={moveIn:'2027-01-31',moveOut:'2027-05-01'};
 assert.equal(S.withIntent('/your-rome?budget=1500&stay=12#map',value),'/your-rome?budget=1500&moveIn=2027-01-31&moveOut=2027-05-01#map');
 assert.equal(S.withIntent('/listing/a?stay=6&moveIn=2027-01-31&moveOut=2027-07-31',{}),'/listing/a');
});
check('Calendar contracts detect mutations that erase the minimum or round a precise departure to the shortcut',()=>{
 const source=readFileSync(new URL('../../js/stay-engine.js',import.meta.url),'utf8');
 const contract=M=>{
   assert.equal(M.validate({moveIn:'2027-01-31',moveOut:'2027-04-29'}).field,'moveOut');
   assert.equal(M.normalize({moveIn:'2027-01-31',moveOut:'2027-05-01',durationMonths:12}).durationMonths,null);
 };
 contract(S);
 for(const [before,after] of [
   ['meetsMinimum: !!minimum && until >= minimum','meetsMinimum: true'],
   ['if (start && end) { var p = period(start, end); n = p && p.meetsMinimum ? p.months : null; }','']
 ]){
   assert.ok(source.includes(before));const box={module:{exports:{}},URL,URLSearchParams};
   vm.runInNewContext(source.replace(before,after),box);
   assert.throws(()=>contract(box.module.exports));
 }
});
check('Stay survives local navigation without losing advanced filters or hash',()=>{
 const path=S.withStay('/apartments?q=Prati&view=skyline#budget=1500&chi=couple',6);
 assert.equal(path,'/apartments?q=Prati&view=skyline&stay=6#budget=1500&chi=couple');
 assert.equal(S.read('?q=Prati&stay=6'),6);
 assert.equal(S.withStay(path,null),'/apartments?q=Prati&view=skyline#budget=1500&chi=couple');
 assert.equal(S.withStay('/listing/real-id?stay=3#applica',18),'/listing/real-id?stay=18#applica');
 assert.equal(S.read('?stay=12%2B'),null);
});
check('Stay is never appended to external destinations or payment actions',()=>{
 for(const url of ['https://example.test/','//example.test/','javascript:alert(1)','/\\example.test/'])assert.equal(S.withStay(url,6),url);
 const runtime=readFileSync(new URL('../../assets/boom-flight-stay.js',import.meta.url),'utf8');
 assert.doesNotMatch(runtime,/fetch\(|localStorage|sessionStorage|\.price\s*\*|\.prezzo\s*\*/);
});
check('Home and discovery expose both dates; the original advanced arrival and Apply hooks remain unique',()=>{
 const home=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const ap=readFileSync(new URL('../../apartments.html',import.meta.url),'utf8');
 const detail=readFileSync(new URL('../../apartment-detail.html',import.meta.url),'utf8');
 assert.equal((home.match(/id="durataSoggiorno"/g)||[]).length,1);
 assert.doesNotMatch(home,/id="quandoData"|var CONTA =/);
 assert.equal((ap.match(/id="quandoData"/g)||[]).length,1);
 assert.ok(ap.indexOf('id="quandoData"')>ap.indexOf('id="foglioVelo"'));
 for(const text of [home,ap]){
   for(const id of ['stayMoveIn','stayMoveOut','stayDatesError'])assert.equal((text.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
   const options=text.match(/<select id="durataSoggiorno"[\s\S]*?<\/select>/)[0];
   assert.deepEqual([...options.matchAll(/value="(\d+)"/g)].map(m=>+m[1]),S.choices);
 }
 const apply=detail.match(/<select id="apMesi"[\s\S]*?<\/select>/)[0];
 for(const id of ['apQuando','apUscita','apStayError'])assert.equal((detail.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.deepEqual([...apply.matchAll(/value="(\d+)"/g)].map(m=>+m[1]),S.choices);
 assert.deepEqual([...detail.matchAll(/data-m="(\d+)"/g)].map(m=>+m[1]),S.choices);
});
check('Home source transform is idempotent and removes only the legacy form controller',()=>{
 const run=spawnSync('python3',['-c',String.raw`
import sys
from pathlib import Path
sys.path.insert(0, str(Path('design/pages-deco').resolve()))
from flight_home import enhance_home, _stay_intent
s=Path('index.html').read_text()
assert enhance_home(s)==s
legacy='''<style>/* «when do you land?» — l'atterraggio è il primo gesto del funnel */ .x{color:red}</style>
<form class="atterro" id="atterro"><div class="atterro-campo ac-data"><span id="quandoEti">When do you land?</span><input id="quandoData"></div></form>
<script>
  /* «when do you land?» — il campo data NATIVO vestito BOOM */
  (function () { var CONTA = []; badController();
  })();
  nextController();
</script>'''
r=_stay_intent(legacy)
assert '<style>' in r and 'nextController();' in r and 'badController' not in r
assert r.count('id="durataSoggiorno"')==1 and 'id="quandoData"' not in r
assert _stay_intent(r)==r
`],{cwd:new URL('../..',import.meta.url),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
});
console.log(`Stay intent: ${checks} passed, 0 failed`);
