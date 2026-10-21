import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import RULES from '../../js/smartlink-engine.js';

const zones = {cipro:{lat:41.9075,lng:12.4475}, prati:{lat:41.908,lng:12.46}, 'san-lorenzo':{lat:41.898,lng:12.52}};
assert.equal(RULES.areaCandidates('Bilocale a Cipro, Roma',zones)[0].label,'Cipro, Roma');
assert.equal(RULES.areaCandidates('Reciprocità',zones).length,0,'no substring guess');
assert.equal(RULES.areaCandidates('Cipro / Prati',zones).length,2,'ambiguous suggestion needs choice');
assert.equal(RULES.cleanMap({lat:null,lng:null}),null);
assert.equal(RULES.areaCircle(zones.cipro).geometry.coordinates[0].length,65);
const distance=RULES.distanceKm(zones.cipro,{lng:RULES.areaCircle(zones.cipro).geometry.coordinates[0][0][0],lat:zones.cipro.lat});
assert.ok(distance>.64 && distance<.66);

// Execute the real UI controller with a minimal DOM/network: tests races and consent state.
class Element {
  constructor() { this.value=''; this.children=[]; this.events={}; this.hidden=false; this.disabled=false; }
  addEventListener(type,handler) { this.events[type]=handler; }
  replaceChildren(...children) { this.children=children; }
  append(...children) { this.children.push(...children); }
  setAttribute(name,value) { this[name]=value; }
  get childElementCount() { return this.children.length; }
  scrollIntoView() {}
  focus() {}
  fire(type,event={}) { return this.events[type]?.(event); }
}
class MapStub {
  constructor() { this.sources={}; }
  isStyleLoaded() { return true; }
  addControl() {}
  on() {}
  getSource(id) { return this.sources[id]; }
  addSource(id,data) { this.sources[id]={...data,setData(value){this.data=value;}}; }
  addLayer() {}
  jumpTo() {}
  fitBounds(bounds) { assert.ok(bounds[0][0] < bounds[1][0] && bounds[0][1] < bounds[1][1]); }
  resize() {}
  remove() {}
}
let finishSearch;
const context={window:{BOOM_SMARTLINK:RULES,maplibregl:{Map:MapStub,NavigationControl:class {}}}, document:{createElement:()=>new Element()}, AbortController, setTimeout,clearTimeout,fetch:()=>new Promise(resolve=>{finishSearch=resolve;})};
vm.runInNewContext(readFileSync(new URL('../../js/smartlink-map.js',import.meta.url),'utf8'), context);
const nodes=new Map(), host=new Element();
host.querySelector=selector=>{if (!nodes.has(selector)) nodes.set(selector,new Element()); return nodes.get(selector);};
const picker=context.window.BOOM_SMARTLINK_MAP.mount(host,zones), el=selector=>host.querySelector(selector);
assert.equal(picker.ready(),false);
picker.suggest('Bilocale a Cipro'); await Promise.resolve();
assert.equal(picker.ready(),false,'suggestion is not approval');
assert.equal(el('[data-area-preview]').hidden,false);
assert.equal(el('[data-area-confirm]').disabled,false);
el('[data-area-confirm]').fire('click');
assert.equal(picker.value().label,'Cipro, Roma'); assert.equal(picker.ready(),true);
el('input').value='Prati'; el('input').fire('input');
assert.equal(picker.value(),null,'editing must invalidate approval'); assert.equal(picker.ready(),false);
await el('[data-area-search]').fire('click');
assert.equal(el('input').value,'Prati, Roma');
el('[data-area-omit]').fire('click');
assert.equal(picker.value(),null); assert.equal(picker.ready(),true);
picker.suggest('Cipro'); assert.equal(el('input').value,'','import must respect omit decision');
picker.reset(); assert.equal(picker.ready(),false);
el('input').value='quartiere sconosciuto';
const search=el('[data-area-search]').fire('click');
el('input').value='Cipro'; el('input').fire('input');
finishSearch({ok:true,json:async()=>({features:[{geometry:{coordinates:[12.46,41.908]},properties:{name:'Prati',city:'Roma'}}]})});
await search;
assert.equal(el('[data-area-results]').children.length,0,'stale search cannot overwrite new input');
assert.equal(picker.ready(),false);
picker.destroy();

// Risposta reale Photon del 21/10: lang=it dà 400, default usa il nome locale.
const photonFeature={geometry:{coordinates:[12.4824769,41.8748621]},properties:{name:'Piramide',city:'Roma'}};
let lookupCalls=0;
const photonFetch=async url=>{
  lookupCalls++;
  const valid=new URL(url).searchParams.get('lang')==='default';
  return {ok:valid,json:async()=>valid?{features:[photonFeature]}:{lang:[{message:'Language is not supported. Supported are: default, de, en, fr',value:'it'}]}};
};
context.fetch=photonFetch;
const livePicker=context.window.BOOM_SMARTLINK_MAP.mount(host,zones);
el('input').value='Piramide, Roma';
await el('[data-area-search]').fire('click');
assert.equal(el('[data-area-results]').children.length,1,'An unknown area must return the real search result');
await el('[data-area-results]').children[0].fire('click');
el('[data-area-confirm]').fire('click');
assert.equal(livePicker.value().label,'Piramide, Roma');assert.equal(livePicker.value().lat,41.8749);
livePicker.destroy();

// Esegue anche initSearch della scheda cliente reale: stesso errore, altro percorso UI.
const pageSource=readFileSync(new URL('../../js/smartlink-page.js',import.meta.url),'utf8');
const searchCode=pageSource.slice(pageSource.indexOf('  function initSearch()'),pageSource.indexOf('  async function initMap()'));
const pageNodes=new Map(),pageEl=id=>{if(!pageNodes.has(id))pageNodes.set(id,new Element());return pageNodes.get(id);};
let searchTimer;
const searchContext={$:pageEl,points:[],area:zones.cipro,RULES,fetch:photonFetch,
  setTimeout:fn=>{searchTimer=fn;return 1;},clearTimeout:()=>{},
  document:{createElement:()=>new Element(),addEventListener:()=>{}}};
vm.runInNewContext(searchCode+'\ninitSearch();',searchContext);
pageEl('place-query').value='Piramide';pageEl('place-query').fire('input');await searchTimer();
assert.equal(pageEl('place-results').hidden,false);
assert.equal(pageEl('place-results').children[0].textContent,'Piramide','The customer can find a place outside the preloaded POIs');
assert.equal(lookupCalls,2);
console.log('SmartLink map: suggestion, explicit confirmation, omission, invalidation and stale search ✓');
