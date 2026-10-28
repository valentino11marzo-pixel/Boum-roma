// Execute Skyline's real controller functions with only DOM/MapLibre boundary
// doubles. This covers the production crash, geo precision and public URL contract.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const FLIGHT=require('../../js/flight-engine.js');
const html = fs.readFileSync(new URL('../../skyline.html', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../../assets/boom-flight-skyline.js', import.meta.url), 'utf8');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };
function extract(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  let i = src.indexOf('{', start), depth = 0, quote = '', escape = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('Unclosed ' + name);
}
class Element {
  constructor() { this.attrs = {}; this.handlers = {}; this.classes = new Set(); this.classList = { contains: k => this.classes.has(k), add: k => this.classes.add(k), remove: k => this.classes.delete(k), toggle: (k, v) => v ? this.classes.add(k) : this.classes.delete(k) }; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, f) { const previous=this.handlers[k];this.handlers[k]=previous?(e=>{previous(e);f(e);}):f; }
  click() { this.handlers.click?.({}); }
}
class Popup { setHTML(s) { this.html = s; return this; } }
class Marker { constructor(o) { this.element = o.element; } setLngLat(c) { this.position = c; return this; } setPopup(p) { this.popup = p; return this; } addTo() { return this; } getElement() { return this.element; } }
const selected = [];
const ctx = {
  window: { BOOM_GEO: true }, BOOM_GEO: { pinPrecision: l => ({ level: l.precision || 'zone' }) },
  document: { createElement: () => new Element() }, maplibregl: { Popup, Marker }, map: {}, MARKERS: [],
  num: Number, fmt: n => '€' + n, PEEK_HOVER: false, pinChips: () => '',
  esc: v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  selectHome: e => selected.push(e.__id)
};
vm.createContext(ctx); vm.runInContext(extract(html, 'makePin'), ctx);
const home = { id: 'real-home', name: '<b>Real Home</b>', price: 1400, precision: 'zone', zone: 'Centro', lat: 41.8986, lng: 12.4735 };
check('makePin executes without the undefined L crash', () => { ctx.makePin(home, [12.475, 41.899], [12.4735, 41.8986]); assert.equal(ctx.MARKERS.length, 1); });
check('Quadrante and commute calculations keep the unshifted real coordinates', () => { assert.equal(ctx.window.__SKY_CASE[0].lat, 41.8986); assert.equal(ctx.window.__SKY_CASE[0].lng, 12.4735); assert.equal(ctx.MARKERS[0].getElement().__co[0], 12.4735); });
check('Approximate markers declare precision, keyboard activation selects the actual ID', () => { const el = ctx.MARKERS[0].getElement(); assert.ok(el.innerHTML.includes('≈')); assert.equal(el.attrs.role, 'button'); el.handlers.keydown({ key: 'Enter', preventDefault() {} }); assert.deepEqual(selected, ['real-home']); });
check('Public listing text is escaped in the fallback popup', () => { assert.ok(ctx.MARKERS[0].popup.html.includes('&lt;b&gt;Real Home&lt;/b&gt;')); assert.ok(!ctx.MARKERS[0].popup.html.includes('<b>Real Home</b>')); });
check('Street precision is not relabelled as an approximate neighborhood', () => { ctx.makePin({ ...home, id: 'street-home', precision: 'street' }, [12.48, 41.89], [12.48, 41.89]); assert.ok(!ctx.MARKERS[1].getElement().innerHTML.includes('≈')); });
// Mutation: reintroducing the real production bug must be detected by execution.
check('The regression detects the original undefined L mutation', () => { const mutant = vm.createContext({ ...ctx, window: { BOOM_GEO: true }, MARKERS: [] }); vm.runInContext(extract(html, 'makePin').replace('(l&&(l.name||l.title))', '(L&&(L.name||L.title))'), mutant); assert.throws(() => mutant.makePin(home, [12.48, 41.89]), /L is not defined/); });
const inputs = { skySharePlace: { checked: false }, qfMeta: { value: 'termini' } };
const shareCtx = {
  URL, Set, Number, location: { origin: 'https://www.boomrome.com' },
  window: { BOOM_MAPPA: true }, BOOM_MAPPA: { METE: [{ slug: 'termini' }] },
  reduced: { matches: false }, $: id => inputs[id],
  document: { querySelector: () => ({ dataset: { m: '25' } }) },
  api: {
    map: { getCenter: () => ({ lng: 12.485, lat: 41.898 }), getZoom: () => 13.4, getBearing: () => -20, getPitch: () => 55 },
    selected: () => ({ __id: 'real-home' }),
    filter: () => ({ budget: 1500, homes: ['real-home', 'not-in-catalogue'] }),
    markers: [{ getElement: () => ({ __id: 'real-home' }) }]
  }
};
vm.createContext(shareCtx); vm.runInContext(extract(ui, 'shareURL') + '\n' + extract(ui, 'validCamera'), shareCtx);
check('A share contains only catalogue IDs, selected home, camera and budget', () => { const url = new URL(shareCtx.shareURL()); assert.equal(url.searchParams.get('homes'), 'real-home'); assert.equal(url.searchParams.get('home'), 'real-home'); assert.equal(url.searchParams.get('budget'), '1500'); assert.equal(url.searchParams.get('place'), null); assert.equal(url.searchParams.get('minutes'), null); assert.deepEqual([...url.searchParams.keys()].sort(), ['budget', 'home', 'homes', 'view']); });
check('Public destination and commute filter require an explicit opt-in', () => { inputs.skySharePlace.checked = true; const url = new URL(shareCtx.shareURL()); assert.equal(url.searchParams.get('place'), 'termini'); assert.equal(url.searchParams.get('minutes'), '25'); });
check('A private/custom destination cannot enter the shared URL', () => { inputs.qfMeta.value = 'my-private-office'; const url = new URL(shareCtx.shareURL()); assert.equal(url.searchParams.get('place'), null); assert.equal(url.searchParams.get('minutes'), null); });
check('Camera input rejects malformed values and excessive zoom', () => { assert.equal(shareCtx.validCamera('1,2,no,4,5'), null); assert.equal(shareCtx.validCamera('12.48,41.89,99,0,55'), null); assert.ok(shareCtx.validCamera('12.48,41.89,13.4,-20,55')); });
check('Reduced motion restores a flat view', () => { shareCtx.reduced.matches = true; assert.equal(shareCtx.validCamera('12.48,41.89,13.4,-20,55').pitch, 0); });
const parent = {}, events = {};
const bridge = { window: { parent, addEventListener: (name, fn) => events[name] = fn }, location: { origin: 'https://www.boomrome.com' }, TIENI: null, map: null, PENDING_SELECT: '', Set, Array, skyId: id => /^[A-Za-z0-9_-]{1,100}$/.test(String(id || '')) ? String(id) : '' };
vm.createContext(bridge);
vm.runInContext(html.match(/window\.addEventListener\('message',function\(e\)\{[\s\S]*?\n\}\);/)[0], bridge);
check('Embed filtering rejects another origin and another source window', () => { events.message({ origin: 'https://evil.test', source: parent, data: { t: 'boomTieni', ids: ['real-home'] } }); assert.equal(bridge.TIENI, null); events.message({ origin: bridge.location.origin, source: {}, data: { t: 'boomTieni', ids: ['real-home'] } }); assert.equal(bridge.TIENI, null); });
check('The existing same-origin parent filter and pending selection remain supported', () => { events.message({ origin: bridge.location.origin, source: parent, data: { t: 'boomTieni', ids: ['real-home'] } }); assert.ok(bridge.TIENI.has('real-home')); events.message({ origin: bridge.location.origin, source: parent, data: { t: 'boomSelect', id: 'real-home' } }); assert.equal(bridge.PENDING_SELECT, 'real-home'); });
const saveButton=new Element(), savedEvents=[], saveNotices=[];
let rawSaved=JSON.stringify(['/listing/previous-home']), storageFail=false;
const saveCtx={
  window:{BOOM_FLIGHT:FLIGHT,dispatchEvent:e=>savedEvents.push(e.type)},
  api:{selected:()=>({__id:'real-home'})}, $:()=>saveButton,
  localStorage:{getItem:key=>{assert.equal(key,'boomSalvate');return rawSaved;},setItem:(key,value)=>{assert.equal(key,'boomSalvate');if(storageFail)throw Error('quota');rawSaved=value;}},
  CustomEvent:class{constructor(type){this.type=type;}},status:t=>saveNotices.push(t),syncCompare:()=>{}
};
vm.createContext(saveCtx);
vm.runInContext(['savedPath','readSaved','syncSaved','toggleSaved'].map(n=>extract(ui,n)).join('\n'),saveCtx);
check('Save reads the latest shortlist and preserves another frame’s intervening addition',()=>{
  saveCtx.syncSaved();
  rawSaved=JSON.stringify(['/listing/previous-home','/listing/added-in-parent']);
  saveCtx.toggleSaved();
  assert.deepEqual(JSON.parse(rawSaved),['/listing/real-home','/listing/previous-home','/listing/added-in-parent']);
  assert.equal(saveButton.attrs['aria-pressed'],'true');assert.equal(saveButton.textContent,'Saved ✓');assert.deepEqual(savedEvents,['boom:move']);
});
check('Removing a selected home preserves the rest and a storage sync refreshes its state',()=>{
  saveCtx.toggleSaved();assert.deepEqual(JSON.parse(rawSaved),['/listing/previous-home','/listing/added-in-parent']);
  assert.equal(saveButton.attrs['aria-pressed'],'false');
  rawSaved=JSON.stringify(['/listing/real-home']);saveCtx.syncSaved();assert.equal(saveButton.attrs['aria-pressed'],'true');
});
check('A failed save neither changes persisted homes nor announces a successful move update',()=>{
  rawSaved='[]';saveCtx.syncSaved();storageFail=true;const before=savedEvents.length;saveCtx.toggleSaved();
  assert.equal(rawSaved,'[]');assert.equal(saveButton.attrs['aria-pressed'],'false');assert.equal(savedEvents.length,before);assert.match(saveNotices.at(-1),/could not save/);
});
// Compare uses the very same fact/date/precision engines as the public detail.
const FACTS=require('../../js/listing-facts.js');
const DISPO=require('../../js/dispo-engine.js');
const GEO=require('../../js/boom-geo.js');
const options={facts:FACTS,dispo:DISPO,geo:GEO,today:'2026-10-28'};
const catalogue=[
  {id:'one',name:'One bedroom',price:'1500',sqm:'60',bedrooms:1,beds:'3',status:'available',availableFrom:'2027-02-01',image:'https://images.example.test/one.jpg'},
  {id:'studio',name:'Studio',price:0,sqm:'',bedrooms:0,beds:'2',status:'available',availableDate:'ask the owner',image:'javascript:alert(1)'},
  {id:'unknown',name:'Unknown facts',price:'€1,500',sqm:'60 sqm',beds:'contact us',status:'available',availableDate:'ask the owner'},
  {id:'rented',name:'Rented home',status:'rented',availableDate:'2027-02-01'},
  {id:'draft',name:'Unpublished address',status:'draft',image:'https://images.example.test/private.jpg'}
];
const knownPaths=catalogue.map(l=>'/listing/'+l.id);
check('Compare deduplicates canonical saved paths, preserves their order and caps at three',()=>{
  const before=JSON.stringify(catalogue);
  const result=FLIGHT.compare(['/listing/studio','https://evil.test/one','/listing/one','/listing/studio','/listing/unknown','/listing/rented'],catalogue,options);
  assert.deepEqual(result.map(r=>r.id),['studio','one','unknown']);
  assert.equal(JSON.stringify(catalogue),before);
});
check('Compare preserves structured bedrooms and a true studio without turning unknowns into zero',()=>{
  const result=FLIGHT.compare(knownPaths,catalogue,options);
  assert.equal(result[0].bedrooms,1);assert.equal(result[1].bedrooms,0);assert.equal(result[2].bedrooms,null);
});
check('Compare never presents zero, missing or formatted free text as a confirmed rent/area',()=>{
  const [one,studio,unknown]=FLIGHT.compare(knownPaths,catalogue,options);
  assert.equal(one.rent,1500);assert.equal(one.area,60);
  assert.equal(studio.rent,null);assert.equal(studio.area,null);
  assert.equal(unknown.rent,null);assert.equal(unknown.area,null);
  assert.equal(studio.image,'');assert.equal(one.image,catalogue[0].image);
});
check('Compare respects future dates, unknown dates and a rented home’s legacy text',()=>{
  const future=FLIGHT.compare(['/listing/one'],catalogue,options)[0];
  const unknown=FLIGHT.compare(['/listing/unknown'],catalogue,options)[0];
  const rented=FLIGHT.compare(['/listing/rented'],catalogue,options)[0];
  assert.equal(future.lane,'ahead');assert.match(future.availability,/2027/);
  assert.equal(unknown.availability,'Ask us for the date');
  assert.equal(rented.lane,'closed');assert.equal(rented.availability,'Rented');
});
check('Compare retains removed saved entries as unknown and does not reveal a draft',()=>{
  const result=FLIGHT.compare(['/listing/removed','/listing/draft'],catalogue,options);
  assert.deepEqual(result.map(r=>r.missing),[true,true]);
  assert.equal(result[1].name,'Saved home');assert.equal(result[1].image,'');
  assert.equal(result[0].rent,null);assert.equal(result[0].precision,'none');
  assert.equal(FLIGHT.compare(['/listing/one'],catalogue,{})[0].bedrooms,null);
});
check('Compare’s bedroom regression detects replacing the structured engine with legacy beds',()=>{
  const source=fs.readFileSync(new URL('../../js/flight-engine.js',import.meta.url),'utf8');
  const mutant={module:{exports:{}}};vm.createContext(mutant);
  vm.runInContext(source.replace('facts.bedroomsOf(l)','Number(l.beds)'),mutant);
  assert.notEqual(mutant.module.exports.compare(['/listing/one'],catalogue,options)[0].bedrooms,1);
});
// Execute the actual picker handler: it has no storage writes of its own.
let latestPaths=['/listing/one','/listing/studio','/listing/unknown','/listing/rented'];
const comparisonStatus={textContent:''};let compareRenders=0;
const pickerCtx={comparePaths:latestPaths.slice(0,3),readSaved:()=>latestPaths,
  renderCompare:()=>compareRenders++,compareDialog:{querySelectorAll:()=>[]},$:()=>comparisonStatus};
vm.createContext(pickerCtx);vm.runInContext(extract(ui,'changeCompare'),pickerCtx);
function change(path,checked){const input={dataset:{comparePath:path},checked,closest(){return this;}};pickerCtx.changeCompare({target:input});return input;}
check('A fourth comparison is rejected without removing any saved home',()=>{
  const fourth=change('/listing/rented',true);assert.equal(fourth.checked,false);
  assert.equal(pickerCtx.comparePaths.length,3);assert.equal(latestPaths.length,4);assert.match(comparisonStatus.textContent,/three homes/);
  assert.equal(compareRenders,0);
});
check('A comparison slot can be replaced and stale entries from another frame are pruned',()=>{
  change('/listing/studio',false);change('/listing/rented',true);
  assert.deepEqual(Array.from(pickerCtx.comparePaths),['/listing/one','/listing/unknown','/listing/rented']);
  latestPaths=['/listing/one','/listing/unknown'];change('/listing/rented',true);
  assert.deepEqual(Array.from(pickerCtx.comparePaths),latestPaths);
});
// Minimal DOM boundary for the empty → first-save transition in the real renderer.
class CompareNode extends Element {
  constructor(){super();this.children=[];this.dataset={};this.style={setProperty(){}};}
  appendChild(node){this.children.push(node);return node;}
  replaceChildren(){this.children=[];}
  querySelector(){return null;}
}
const compareBody=new CompareNode(),compareUiStatus=new CompareNode();let renderSaved=[];
const renderCtx={readSaved:()=>renderSaved,comparePaths:null,compareDialog:new CompareNode(),
  $:id=>id==='skyCompareBody'?compareBody:compareUiStatus,
  el:(tag,cls,text)=>Object.assign(new CompareNode(),{tag,className:cls,textContent:text}),
  closeCompare(){},api:{markers:[]},window:{BOOM_FLIGHT:FLIGHT},BOOM_FLIGHT:FLIGHT,
  compareRecords:paths=>FLIGHT.compare(paths,catalogue,options),money:n=>'€'+n};
renderCtx.window.parent=renderCtx.window;
vm.createContext(renderCtx);vm.runInContext(extract(ui,'renderCompare'),renderCtx);
check('Opening an empty comparison does not trap the first subsequently saved home',()=>{
  renderCtx.renderCompare();assert.equal(renderCtx.comparePaths,null);
  renderSaved=['/listing/one'];renderCtx.renderCompare();
  assert.deepEqual(Array.from(renderCtx.comparePaths),renderSaved);
  assert.equal(renderCtx.compareDialog.dataset.homeCount,'1');
  assert.ok(compareBody.children.some(n=>n.className==='sky-compare-columns'));
});
console.log(`Skyline Flight: ${passed} passed, 0 failed`);
