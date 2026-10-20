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
console.log('SmartLink map: suggestion, explicit confirmation, omission, invalidation and stale search ✓');
