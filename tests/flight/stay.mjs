import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const S=require('../../js/stay-engine.js');
let checks=0;
function check(name,fn){fn();checks++;console.log('  ✓ '+name);}
check('Stay is an exact requested length; ranges, coercions and arbitrary input are rejected',()=>{
 for(const n of S.choices){assert.equal(S.months(n),n);assert.equal(S.months(String(n)),n);}
 for(const n of [null,undefined,true,{},[],0,-1,1,2,1.5,4,48,'6-12','12+',' 6 ','1e1','6 months'])assert.equal(S.months(n),null);
 assert.equal(S.label(1),'');assert.equal(S.read('?stay=1'),null);assert.equal(S.label(6),'6 months');assert.equal(S.label('12+'),'');
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
check('The Home offers duration; discovery retains its original advanced date field exactly once',()=>{
 const home=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const ap=readFileSync(new URL('../../apartments.html',import.meta.url),'utf8');
 const detail=readFileSync(new URL('../../apartment-detail.html',import.meta.url),'utf8');
 assert.equal((home.match(/id="durataSoggiorno"/g)||[]).length,1);
 assert.doesNotMatch(home,/id="quandoData"|var CONTA =/);
 assert.equal((ap.match(/id="quandoData"/g)||[]).length,1);
 assert.ok(ap.indexOf('id="quandoData"')>ap.indexOf('id="foglioVelo"'));
 for(const text of [home,ap]){
   const options=text.match(/<select id="durataSoggiorno"[\s\S]*?<\/select>/)[0];
   assert.deepEqual([...options.matchAll(/value="(\d+)"/g)].map(m=>+m[1]),S.choices);
 }
 const apply=detail.match(/<select id="apMesi"[\s\S]*?<\/select>/)[0];
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
