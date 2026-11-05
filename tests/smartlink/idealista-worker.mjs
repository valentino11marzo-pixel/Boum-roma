import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readIdealista} from '../../tools/smartlink-worker/idealista.mjs';
import RULES from '../../js/smartlink-engine.js';
import SHARE from '../../js/smartlink-share-engine.js';
import {Clock,page as fixture} from '../../tools/smartlink-shortcut/experimental-fixture.mjs';

const base='https://www.idealista.it/immobile/123456789/';
const implementation=readFileSync(new URL('../../tools/smartlink-worker/idealista.mjs',import.meta.url),'utf8');
const engines=['smartlink-engine.js','smartlink-share-engine.js'].map(name=>readFileSync(new URL('../../js/'+name,import.meta.url),'utf8')).join('\n');
const plain=value=>JSON.parse(JSON.stringify(value));

function browser(options={}) {
  const clock=new Clock(), observed=fixture(clock,options), start=Date.now();
  let opened=!options.closed,openerClicks=0,evaluations=0;
  class FakeDate extends Date {constructor(...args){super(...(args.length?args:[start+clock.now()]));}static now(){return start+clock.now();}}
  const wrap=node=>node && new Proxy(node,{get(target,key){
    if(key==='complete') return !options.noLoad;
    if(key==='naturalWidth') return options.noLoad?0:1500;
    if(key==='currentSrc' && options.invalidPhotoAt===observed.state.index) return 'https://example.invalid/foreign.jpg';
    if(key==='querySelectorAll') return selector=>target.querySelectorAll(selector).map(wrap);
    if(key==='querySelector') return selector=>wrap(target.querySelector(selector));
    return target[key];
  }});
  const button={getAttribute:key=>key==='aria-label'?observed.state.total+' foto':null,disabled:false,
    click:()=>{openerClicks++;opened=true;}};
  const query=selector=>{
    if(selector==='button[aria-label]') return options.noOpener?[]:options.multipleOpeners?[button,button]:[button];
    if(!opened && ['#gallery','.image-gallery-slide-wrapper','[data-testid="gallery-counter"]'].includes(selector)) return [];
    return observed.document.querySelectorAll(selector).map(wrap);
  };
  const document={querySelectorAll:query,querySelector:selector=>query(selector)[0] || null};
  for(const key of ['cookie','images','body','documentElement','localStorage','sessionStorage']) Object.defineProperty(document,key,{get(){throw new Error('Forbidden '+key);}});
  const context={document,location:{get href(){return observed.state.url;}},URL,TextEncoder,Date:FakeDate,
    fetch(){throw new Error('No network in DOM reader');}};
  Object.defineProperty(context,'window',{get(){throw new Error('Page-owned exports must not be read');}});
  const run=script=>vm.runInNewContext(script,context,{timeout:1000});
  const page={
    async evaluate(script){evaluations++;return plain(run(script));},
    async waitForFunction(fn,arg,{timeout}) {
      const end=clock.now()+timeout;
      do {
        if(run('('+fn.toString()+')('+JSON.stringify(arg)+')')) return;
        clock.advance(50);
      } while(clock.now()<=end);
      throw new Error('Fixture wait timeout');
    },
  };
  return {page,...observed,clock,openerClicks:()=>openerClicks,evaluations:()=>evaluations};
}

async function success(read,options={}) {
  const test=browser(options),result=await read(test.page,base),total=options.total || 15;
  assert.equal(result.status,'ready');
  assert.deepEqual(result.gallery,{expected:total,found:total});
  assert.equal(result.images.length,total);
  assert.equal(result.sourceUrl,base);
  assert.equal(result.data.title,'Casa fixture');
  assert.deepEqual(result.images.map(url=>Number(url.match(/\/(\d+)\.webp$/)[1])),Array.from({length:total},(_,i)=>800000001+i));
  assert.equal(test.outside(),0,'never enter contact slide');
  assert.equal(test.clicks.length,total-1+Math.min((options.start || 1)-1,total-(options.start || 1)));
  assert.equal(test.openerClicks(),options.closed?1:0);
  assert.ok(Number.isFinite(Date.parse(result.capturedAt)));
  return {test,result};
}

await success(readIdealista);
await success(readIdealista,{closed:true});
await success(readIdealista,{start:8});
await success(readIdealista,{total:60});
await success(readIdealista,{total:1});
for(const options of [{sourceChangeAt:2},{canonicalChangeAt:2},{totalChangeAt:2},{invalidPhotoAt:2},{duplicateAt:2},{noProgress:true},{contactAt:2},{noLoad:true},{total:61},{closed:true,noOpener:true},{closed:true,multipleOpeners:true}]) {
  const test=browser(options),result=await readIdealista(test.page,base);
  assert.notEqual(result.status,'ready',JSON.stringify(options));
  assert.equal(test.outside(),0);
  if(options.sourceChangeAt || options.canonicalChangeAt || options.totalChangeAt || options.invalidPhotoAt || options.noProgress || options.contactAt) assert.equal(test.clicks.length,1,'stop before another click: '+JSON.stringify(options));
}
for(const options of [{},{closed:true}]) {
  const test=browser(options);test.state.url=base.replace('123456789','999999999');test.state.canonical=test.state.url;
  assert.deepEqual(await readIdealista(test.page,base),{status:'needs_attention',error:'source_changed'});
  assert.equal(test.openerClicks(),0);assert.equal(test.clicks.length,0);
}
{
  const test=browser({closed:true});test.state.canonical=base.replace('123456789','999999999');
  assert.deepEqual(await readIdealista(test.page,base),{status:'needs_attention',error:'source_changed'});
  assert.equal(test.openerClicks(),0);
}
{
  const test=browser();
  assert.deepEqual(await readIdealista(test.page,'https://example.invalid/immobile/1/'),{status:'needs_attention',error:'source_changed'});
  assert.equal(test.evaluations(),0);
}

/* Mutations execute the real adapter in memory, with the same static engine bodies. */
function mutated(from,to) {
  assert.ok(implementation.includes(from),'mutation anchor');
  const script=implementation.replace(from,to).replace(/^import .*;\n/gm,'').replace(/^const engines=.*;\n/m,'').replace('export async function readIdealista','async function readIdealista');
  return vm.runInNewContext(script+'\nreadIdealista',{RULES,SHARE,engines,URL,TextEncoder});
}
{
  const read=mutated('if(plan.sourceUrl!==source.url) return failed(\'source_mismatch\');','');
  const test=browser({total:1});test.state.url=base.replace('123456789','999999999');test.state.canonical=test.state.url;
  assert.equal((await read(test.page,base)).status,'ready','missing job binding is observable');
}
{
  const read=mutated('step<=plan.count','step<plan.count');
  await assert.rejects(success(read),/ready/,'complete-gallery scenario rejects truncated capture');
}
{
  const read=mutated('images[0].complete && images[0].naturalWidth>0','true');
  assert.equal((await read(browser({noLoad:true}).page,base)).status,'ready','loading guard mutation is detected');
}
console.log('SmartLink Idealista worker: PASS (real shared parser, complete 15/60, source/photo/counter/load guards, 3 mutations; no source requests)');
