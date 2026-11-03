import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseDocument} from 'htmlparser2';
import RULES from '../../js/smartlink-engine.js';
const implementation=readFileSync(new URL('../../js/smartlink-share-engine.js',import.meta.url),'utf8');
const base='https://www.idealista.it/immobile/123456789/';
const photo=i=>'https://img4.idealista.it/blur/WEB_DETAIL-L-L/0/id.pro.it.image.master/18/17/e4/'+(800000000+i)+'.jpg';
const json=value=>JSON.parse(JSON.stringify(value));
class Clock {
  time=0; id=0; timers=new Map(); callbacks=[];
  now=()=>this.time;
  setTimeout=(fn,delay)=>{const id=++this.id;this.timers.set(id,{at:this.time+delay,fn});this.callbacks.push(fn);return id;};
  clearTimeout=id=>this.timers.delete(id);
  advance(ms) {
    const target=this.time+ms;let count=0;
    while(this.timers.size) {
      const [id,timer]=Array.from(this.timers).sort((a,b)=>a[1].at-b[1].at || a[0]-b[0])[0];
      if(timer.at>target) break;
      assert.ok(++count<20000,'bounded test scheduling');
      this.time=timer.at;this.timers.delete(id);timer.fn();
    }
    this.time=target;
  }
}
function dom(html,onClick,currentSrc) {
  const root=parseDocument(html), wrappers=new WeakMap();
  const text=node=>node.type==='text'?node.data:(node.children || []).map(text).join('');
  const tokens=selector=>selector.match(/(?:\[[^\]]*\]|[^\s[])+/g);
  const matches=(node,selector)=>{
    if(!node.name || !node.attribs) return false;
    if(selector.startsWith('#')) return node.attribs.id===selector.slice(1);
    const match=selector.match(/^([a-z0-9-]+)?((?:\.[a-z0-9_-]+)*)(?:\[([a-z0-9-]+)="([^"]*)"\])?$/i);
    assert.ok(match,'unsupported real selector '+selector);
    return (!match[1] || node.name===match[1]) && (!match[2] || match[2].slice(1).split('.').every(c=>(node.attribs.class || '').split(/\s+/).includes(c))) && (!match[3] || node.attribs[match[3]]===match[4]);
  };
  const query=(scope,selector)=>{
    const parts=tokens(selector), found=[];
    const chain=node=>{
      if(!matches(node,parts.at(-1))) return false;
      let ancestor=node.parent;
      for(let i=parts.length-2;i>=0;i--) {
        while(ancestor && ancestor!==scope && !matches(ancestor,parts[i])) ancestor=ancestor.parent;
        if(!ancestor || ancestor===scope) return false;
        ancestor=ancestor.parent;
      }
      return true;
    };
    const walk=node=>{for(const child of node.children || []) {if(chain(child)) found.push(wrap(child));walk(child);}};
    walk(scope);return found;
  };
  const wrap=node=>{
    if(wrappers.has(node)) return wrappers.get(node);
    const value={getAttribute:key=>node.attribs?.[key] ?? null,
      get textContent(){return text(node);},get disabled(){return 'disabled' in (node.attribs || {});},
      get currentSrc(){return currentSrc(node.attribs?.src || '');},
      querySelectorAll:selector=>query(node,selector),querySelector:selector=>query(node,selector)[0] || null,
      click:()=>onClick(node.attribs?.['aria-label'])};
    wrappers.set(node,value);return value;
  };
  return wrap(root);
}
function page(clock,options={}) {
  const state={index:options.start || 1,total:options.total || 15,url:base,canonical:base,contact:false,prices:options.prices || []};
  const clicks=[];let outside=0;
  const currentSrc=src=>options.jpgAt===state.index?src:src.replace(/\.jpg$/,'.webp');
  const imageIndex=index=>options.duplicateAt===index?1:index;
  const render=()=>{
    const center=state.contact?'<div class="image-gallery-slide center"><img src="https://st3.idealista.it/profilephotos/fixture-avatar.jpg"></div>':
      '<div class="image-gallery-slide center"><figure class="item-gallery"><picture><img src="'+photo(imageIndex(state.index))+'"></picture></figure></div>';
    const neighbor=state.index<state.total?'<div class="image-gallery-slide right"><figure class="item-gallery"><picture><img src="'+photo(imageIndex(state.index+1))+'"></picture></figure></div>':'';
    const controls=['Previous Slide','Next Slide'].map(label=>'<button aria-label="'+label+'"'+(options.disabled?' disabled':'')+'></button>').join('');
    const gallery='<div id="gallery"><p data-testid="gallery-counter">'+(state.contact?'':state.index+'/'+state.total)+'</p><div class="image-gallery-slide-wrapper">'+center+neighbor+controls+'</div></div>';
    const prices='<section class="detail-content-wrapper"><p class="info-data"><span class="price-container">'+state.prices.map(price=>'<strong class="price">'+price+' €/mese</strong>').join('')+'</span></p></section>';
    return '<link rel="canonical" href="'+state.canonical+'"><h1>Casa fixture</h1>'+prices+'<div id="main-multimedia"></div>'+gallery+(options.multipleRoots?gallery:'')+
      '<aside><img src="https://img4.idealista.it/fixture-recommendation.jpg"></aside>';
  };
  const onClick=label=>{
    assert.ok(['Previous Slide','Next Slide'].includes(label));
    const direction=label==='Next Slide'?1:-1,target=state.index+direction;
    clicks.push({from:state.index,to:target});
    if(target<1 || target>state.total) {outside++;state.contact=true;return;}
    if(options.noProgress) return;
    clock.setTimeout(()=>{
      state.index=options.jumpAt===target?target+1:target;
      state.url=base+'foto/'+state.index+'/';
      if(options.sourceChangeAt===target) {state.url=base.replace('123456789','999999999');state.canonical=state.url;}
      if(options.canonicalChangeAt===target) state.canonical=base.replace('www.','');
      if(options.totalChangeAt===target) state.total++;
      if(options.contactAt===target) state.contact=true;
    },options.delay ?? 40);
  };
  const document={querySelectorAll:selector=>dom(render(),onClick,currentSrc).querySelectorAll(selector),
    querySelector:selector=>dom(render(),onClick,currentSrc).querySelector(selector)};
  for(const key of ['cookie','images','body','documentElement','localStorage','sessionStorage']) Object.defineProperty(document,key,{get(){throw new Error('Forbidden document '+key);}});
  return {document,state,clicks,outside:()=>outside};
}
const runtimes=new WeakMap();
function load(source=implementation) {
  let network=0;
  const clock=new Clock(), epoch=Date.parse('2026-11-03T12:00:00.000Z');
  class TestDate extends Date {
    constructor(...args) {super(...(args.length?args:[epoch+clock.now()]));}
    static now() {return epoch+clock.now();}
  }
  const context={window:{BOOM_SMARTLINK:RULES},URL,TextEncoder,Date:TestDate,Map,Set,JSON,
    fetch(){network++;throw new Error('Network forbidden');},XMLHttpRequest(){network++;throw new Error('Network forbidden');}};
  for(const key of ['localStorage','sessionStorage','navigator']) Object.defineProperty(context,key,{get(){throw new Error('Forbidden global');}});
  vm.runInNewContext(source,context);
  const api=context.window.BOOM_SMARTLINK_SHARE;runtimes.set(api,{clock,now:()=>epoch+clock.now()});
  return {api,network:()=>network};
}
function scenario(api,options={}) {
  const runtime=runtimes.get(api),clock=runtime.clock;
  clock.time=0;clock.timers.clear();clock.callbacks=[];
  const browser=page(clock,options),planned=json(api.capturePlan(browser.document,browser.state.url)),frames=[];
  const plan=planned.plan;
  const step=(index)=>{
    const result=json(api.captureFrame(browser.document,browser.state.url,plan,index));
    frames.push(result.ok?result.frame:{kind:'boom.smartlink.share',version:1,error:result.error});
    return result;
  };
  const walk=(count=plan.count)=>{
    for(let index=frames.length+1;index<=count;index++) {
      clock.advance(1000);
      if(!step(index).ok) break;
    }
  };
  const envelope=()=>({kind:'boom.smartlink.share.frames',version:1,plan,frames});
  return {clock,now:runtime.now,...browser,planned,plan,frames,step,walk,envelope};
}
function complete(api,start=1,total=15) {
  const test=scenario(api,{start,total});assert.equal(test.planned.ok,true);
  assert.equal(test.plan.count,total+Math.min(start-1,total-start));
  test.walk();
  const combined=json(api.combineFrames(test.envelope(),test.now()));
  assert.equal(combined.ok,true);const result=combined.payload;
  assert.deepEqual(result.gallery,{expected:total,found:total});
  assert.deepEqual(result.images,Array.from({length:total},(_,i)=>photo(i+1).replace('.jpg','.webp')),'order is 1..N, not discovery order');
  assert.equal(test.outside(),0,'never enter contact/avatar slide');
  assert.equal(test.clicks.length,test.plan.count-1,'last frame does not advance');
  assert.ok(test.clicks.every(click=>click.to>=1 && click.to<=total));
  assert.equal(result.capturedAt,test.plan.capturedAt,'keep start of observation, not import time');
  assert.deepEqual(json(api.validate(test.envelope(),test.now())),json(api.validate(result,test.now())),'closed envelope dispatch returns normal validation shape');
  return test;
}
function changes(api) {
  for(const [option,error] of [['sourceChangeAt','source_mismatch'],['canonicalChangeAt','source_mismatch'],['totalChangeAt','invalid_gallery'],['jumpAt','invalid_gallery'],['contactAt','invalid_gallery']]) {
    const test=scenario(api,{[option]:2});test.walk();
    assert.equal(test.frames[1]?.error,error,option+' stops before another click');
    assert.deepEqual(json(api.combineFrames(test.envelope(),test.now())),{ok:false,error});assert.equal(test.outside(),0);
    assert.equal(test.clicks.length,1);
  }
}
function duplicates(api) {
  const test=scenario(api,{duplicateAt:2,jpgAt:2});test.walk();
  assert.deepEqual(json(api.combineFrames(test.envelope(),test.now())),{ok:false,error:'invalid_gallery'},'one photo cannot fill two positions across jpg/webp variants');
}
function bounded(api) {
  const test=scenario(api,{start:8});test.walk(3);
  const combined=json(api.combineFrames(test.envelope(),test.now()));
  assert.equal(combined.ok,true);assert.equal(combined.payload.gallery.expected,15);assert.equal(combined.payload.gallery.found,3);
  assert.ok(combined.payload.gallery.found<combined.payload.gallery.expected,'a valid prefix remains incomplete');
  test.clock.advance(86400000);
  assert.equal(api.combineFrames(test.envelope(),test.now()).ok,true,'later import does not refresh or invalidate an old acquisition');
  const expired=scenario(api);expired.clock.advance(180001);
  assert.deepEqual(expired.step(1),{ok:false,error:'capture_unavailable'});assert.equal(expired.clicks.length,0);
  const stuck=scenario(api,{noProgress:true});stuck.walk();
  assert.deepEqual(json(api.combineFrames(stuck.envelope(),stuck.now())),{ok:false,error:'invalid_gallery'});assert.equal(stuck.clicks.length,1);
  const slow=scenario(api,{delay:1500});slow.walk();
  assert.equal(slow.frames[1].error,'invalid_gallery','native Wait is not assumed sufficient on every page');assert.equal(slow.clicks.length,1);
}
function protocol(api) {
  let test=scenario(api);test.walk(1);
  let altered=json(test.envelope());altered.frames[0].total++;
  assert.equal(api.combineFrames(altered,test.now()).error,'invalid_gallery','frame total is immutable');
  altered=json(test.envelope());altered.frames[0].index=2;
  assert.equal(api.combineFrames(altered,test.now()).error,'invalid_gallery','frame positions follow the planned prefix');
  altered=json(test.envelope());altered.plan.positions[0]=2;
  assert.equal(api.combineFrames(altered,test.now()).error,'invalid_gallery','do not trust supplied plan positions');
  altered=json(test.envelope());altered.plan.secret='fixture';
  assert.equal(api.validate(altered,test.now()).error,'invalid_payload');
  altered=json(test.envelope());altered.frames[0].secret='fixture';
  assert.equal(api.validate(altered,test.now()).error,'invalid_payload');
  altered=json(test.envelope());altered.frames=[{kind:'boom.smartlink.share',version:1,error:'source_mismatch'}];
  assert.equal(api.validate(altered,test.now()).error,'source_mismatch','a diagnostic frame never becomes successful data');
  altered=json(test.envelope());altered.frames[0].capturedAt='2026-11-03T11:59:59.000Z';
  assert.equal(api.validate(altered,test.now()).error,'invalid_capture_date');
  assert.equal(api.validate(JSON.stringify(test.envelope())+' '.repeat(131072),test.now()).error,'payload_too_large','bound raw carrier before parsing');
  assert.equal(api.combineFrames({...test.envelope(),frames:[]},test.now()).error,'invalid_gallery');
  test=scenario(api);test.clock.advance(1000);
  assert.equal(api.captureFrame(test.document,test.state.url,{...test.plan,count:999},1).error,'invalid_gallery');assert.equal(test.clicks.length,0);
  assert.equal(api.captureFrame(test.document,test.state.url,test.plan,'1').error,'invalid_gallery','Repeat Index must be a number');assert.equal(test.clicks.length,0);
}
function conflicts(api) {
  const test=scenario(api);test.walk(3);
  test.frames[0].data={title:'Casa',price:2450,zone:'Roma',sqm:110,rooms:4};
  test.frames[1].data={title:'Casa',price:2500,zone:'Roma',sqm:110,rooms:4};
  test.frames[2].data={title:'Casa',price:2450,zone:'Cipro',sqm:110,rooms:4};
  const result=json(api.combineFrames(test.envelope(),test.now()));
  assert.equal(result.ok,true);assert.deepEqual(result.payload.data,{title:'Casa',price:null,zone:'',sqm:110,rooms:4},'conflicts stay unknown');
}
function unknownFields(api) {
  const test=scenario(api,{total:3,prices:[2450]});test.walk(1);
  assert.equal(test.frames[0].data.price,2450);
  test.state.prices=[2450,2500];test.walk(2);
  assert.equal(test.frames[1].data.price,null,'real capture marks conflicting DOM prices unknown');
  test.state.prices=[2450];test.walk(3);
  assert.equal(test.frames[2].data.price,2450);
  assert.equal(api.combineFrames(test.envelope(),test.now()).payload.data.price,null,'an unknown frame must not recover a prior price');
  test.frames[1].data.title='';
  assert.equal(api.combineFrames(test.envelope(),test.now()).payload.data.title,'','an empty text field remains unknown as well');
}
const loaded=load();
for(const start of [1,2,8,14,15]) complete(loaded.api,start);
complete(loaded.api,1,1);complete(loaded.api,30,60);
changes(loaded.api);duplicates(loaded.api);bounded(loaded.api);protocol(loaded.api);conflicts(loaded.api);unknownFields(loaded.api);
for(const options of [{total:61},{multipleRoots:true}]) {
  const test=scenario(loaded.api,options);assert.equal(test.planned.ok,false);assert.equal(test.clicks.length,0);
}
const disabled=scenario(loaded.api,{disabled:true});disabled.clock.advance(1000);
assert.equal(disabled.step(1).error,'capture_unavailable');assert.equal(disabled.clicks.length,0);
assert.equal(loaded.network(),0);
const mutations=[
  ['canonical lock','canonicalUrl!==plan.canonicalUrl','false',changes],
  ['stable total','frame.total!==plan.total','false',protocol],
  ['planned position','frame.index!==plan.positions[step]','false',protocol],
  ['unique position/photo','(owner!==undefined && owner!==frame.index)','false',duplicates],
  ['native order','.sort(([a],[b])=>a-b)','.sort(()=>0)',api=>complete(api,8)],
  ['conflicting fields','return values.length===1?values[0]:empty;','return values.length>=1?values[0]:empty;',conflicts],
  ['unknown field persists','const values=[...new Set(data.map(item=>item[key]))];',"const values=[...new Set(data.map(item=>item[key]).filter(value=>value!==null && value!==''))];",unknownFields],
  ['last-frame control','if(repeatIndex<plan.count)','if(true)',api=>complete(api,15)],
];
for(const [name,from,to,check] of mutations) {
  assert.ok(implementation.includes(from),name);
  assert.throws(()=>check(load(implementation.replaceAll(from,to)).api),undefined,'mutation must fail: '+name);
}
console.log('SmartLink native gallery protocol: PASS (real capture/DOM, simulated native Wait, plan/frame/carrier, source/canonical, 1..N order, 60/61, prefix/expiry, no contact slide, conservative fields, 8 mutations; full native shortcut/iPhone not tested)');
