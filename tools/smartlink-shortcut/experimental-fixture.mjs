import assert from 'node:assert/strict';
import {parseDocument} from 'htmlparser2';

const base='https://www.idealista.it/immobile/123456789/';
const photo=i=>'https://img4.idealista.it/blur/WEB_DETAIL-L-L/0/id.pro.it.image.master/18/17/e4/'+(800000000+i)+'.jpg';
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


function mergeCases(seed, middleSeed, now) {
  const copy=value=>JSON.parse(JSON.stringify(value));
  const cases=[
    {name:'complete',input:copy(seed),now,expected:{ok:true,gallery:{expected:15,found:15}}},
    {name:'complete serialized',input:JSON.stringify(seed),now,expected:{ok:true,gallery:{expected:15,found:15}}},
    {name:'repeated index with same photo',input:copy(middleSeed),now,expected:{ok:true,gallery:{expected:15,found:15}}},
  ];
  const add=(name,change,expected,at=now)=>{const input=copy(seed);change(input);cases.push({name,input,now:at,expected});};
  const error=value=>({ok:false,error:value});
  add('partial prefix',value=>{value.frames=value.frames.slice(0,3);},{ok:true,gallery:{expected:15,found:3}});
  add('different listing',value=>{value.frames[0].pageUrl='https://www.idealista.it/immobile/999999999/';},error('source_mismatch'));
  add('different canonical',value=>{value.frames[0].canonicalUrl=seed.plan.canonicalUrl.replace('www.','');},error('source_mismatch'));
  add('unsupported source',value=>{value.plan.sourceUrl='https://example.invalid/immobile/123456789/';},error('unsupported_listing_url'));
  add('photo on another host',value=>{value.frames[0].image='https://example.invalid/photo.jpg';},error('invalid_photo_url'));
  add('photo credential URL',value=>{value.frames[0].image=value.frames[0].image.replace('https://','https://user:secret@');},error('invalid_photo_url'));
  add('wrong step',value=>{value.frames[1].step=1;},error('invalid_gallery'));
  add('wrong position',value=>{value.frames[1].index=3;},error('invalid_gallery'));
  add('changed total',value=>{value.frames[1].total=16;},error('invalid_gallery'));
  add('duplicate photo across positions',value=>{value.frames[1].image=value.frames[0].image.replace('.webp','.jpg');},error('invalid_gallery'));
  add('forged plan positions',value=>{value.plan.positions[0]=2;},error('invalid_gallery'));
  add('empty frames',value=>{value.frames=[];},error('invalid_gallery'));
  add('diagnostic frame',value=>{value.frames[0]={kind:'boom.smartlink.share',version:1,error:'photos_not_found'};},error('photos_not_found'));
  add('future plan',value=>{value.plan.capturedAt=new Date(now+300001).toISOString();},error('invalid_capture_date'));
  add('frame before plan',value=>{value.frames[0].capturedAt=new Date(Date.parse(value.plan.capturedAt)-1).toISOString();},error('invalid_capture_date'));
  add('decreasing frame date',value=>{value.frames[1].capturedAt=value.plan.capturedAt;},error('invalid_capture_date'));
  add('sequence exceeds three minutes',value=>{value.frames.at(-1).capturedAt=new Date(Date.parse(value.plan.capturedAt)+180001).toISOString();},error('invalid_capture_date'),Date.parse(seed.plan.capturedAt)+200000);
  add('conflicting price',value=>{value.frames[1].data.price=2500;},{ok:true,data:{price:null}});
  add('unknown price remains unknown',value=>{value.frames[1].data.price=null;},{ok:true,data:{price:null}});
  add('unknown title remains unknown',value=>{value.frames[1].data.title='';},{ok:true,data:{title:''}});
  add('closed envelope',value=>{value.unexpected=true;},error('invalid_payload'));
  add('closed plan',value=>{value.plan.unexpected=true;},error('invalid_payload'));
  add('closed frame',value=>{value.frames[0].unexpected=true;},error('invalid_payload'));
  add('closed data',value=>{value.frames[0].data.unexpected=true;},error('invalid_data'));
  add('invalid numeric data',value=>{value.frames[0].data.price=-100;},error('invalid_data'));
  cases.push({name:'raw byte bound',input:JSON.stringify(seed)+' '.repeat(131072),now,expected:error('payload_too_large')});
  add('UTF8 byte bound',value=>{value.frames[0].data.title='€'.repeat(46000);},error('payload_too_large'));
  cases.push({name:'malformed JSON',input:'{',now,expected:error('invalid_payload')});
  return cases;
}

export { Clock, page, mergeCases };
