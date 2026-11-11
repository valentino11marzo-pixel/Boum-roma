import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scrollBlock} from '../../scripts/scroll-sync.mjs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),M=require('../../js/mappa-engine.js');
const root=fileURLToPath(new URL('../../',import.meta.url)),html=readFileSync(root+'your-rome.html','utf8');
execFileSync(process.execPath,[root+'design/pages-deco/build-your-rome.mjs','--check']);
assert.match(html,/<!doctype html>/i);assert.match(html,/<html lang="en">/);assert.match(html,/<meta charset="utf-8">/);
assert.match(html,/<link rel="canonical" href="https:\/\/www.boomrome.com\/your-rome">/);
assert.ok(html.includes(scrollBlock(root)),'exact shared scroll block');
for(const d of M.DESTINATIONS.filter(d=>d.source)){
 assert.ok(html.includes(d.address),d.slug+' has a crawlable official address');assert.ok(html.includes(d.source),d.slug+' links its official source');
}
const blocks=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
const graph=blocks.flatMap(x=>x['@graph']||[x]),faq=graph.find(x=>x['@type']==='FAQPage');
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for(const question of faq.mainEntity){assert.ok(html.includes('<summary>'+esc(question.name)+'</summary>'));assert.ok(html.includes('<p>'+esc(question.acceptedAnswer.text)+'</p>'));}
assert.equal(graph.filter(x=>x['@type']==='RealEstateAgent').length,1);
assert.equal(graph.find(x=>x['@type']==='RealEstateAgent').legalName,'Egidi Immobiliare S.r.l.');
for(const match of html.matchAll(/(?:src|href)="(\/(?:assets|js|css)\/[^"?]+)(?:\?[^" ]*)?"/g))assert.ok(existsSync(root+match[1].slice(1)),match[1]+' exists');
assert.match(html,/<form[^>]+action="\/skyline"[^>]+method="get"/);
assert.match(html,/name="place"/);assert.match(html,/name="budget"/);assert.match(html,/name="priority"/);
assert.doesNotMatch(html,/<iframe|maplibre-gl\.js|name="email"/,'the guide is crawlable and does not load map WebGL or gate access');
console.log('  ✓ Your Rome page: generator parity, official campus text, visible FAQ/schema, identity, real assets and a functional no-JS planner');

// Recommendation rules run on normalized public comparison records. These
// fixtures exercise choices a visitor can actually justify, without a fit score.
const G=require('../../js/skyline-guide-engine.js');
const journey=(min,extra={})=>({min,fonte:'rete',precision:'exact',origin:{lat:41.88,lng:12.48},destination:{lat:41.9,lng:12.5},...extra});
const homes=[
 {id:'rent',name:'Lower rent',type:'Bilocale',rent:1100,area:45,lane:'now',journey:journey(42)},
 {id:'space',name:'More space',type:'Apartment',rent:1400,area:90,lane:'ahead',journey:journey(38)},
 {id:'journey',name:'Easier journey',type:'Flat',rent:1500,area:55,lane:'now',journey:journey(25)},
 {id:'over',name:'Over budget',type:'Apartment',rent:1800,area:150,lane:'now',journey:journey(12)},
 {id:'closed',name:'Rented',type:'Apartment',rent:700,area:150,lane:'closed',journey:journey(10)},
 {id:'missing',rent:100,area:500,missing:true},
 {id:'unpriced',type:'Apartment',rent:null,area:150,lane:'now',journey:journey(5)}
];
const before=JSON.stringify(homes),balanced=G.balance(homes,{budget:1500});
assert.equal(balanced.mode,'balance');assert.equal(balanced.total,4);assert.equal(balanced.matches,3);assert.equal(balanced.unknownPrice,1);
assert.deepEqual(balanced.candidates.map(r=>[r.id,r.category]),[['rent','rent'],['space','space'],['journey','commute']]);
assert.equal(balanced.candidates[0].reason.rentDelta,-300);
assert.equal(balanced.candidates[1].reason.referenceId,'rent');assert.equal(balanced.candidates[1].reason.areaDelta,45);
assert.equal(balanced.candidates[2].reason.referenceId,'rent');assert.equal(balanced.candidates[2].reason.minutesDelta,-17);
assert.equal(balanced.candidates[2].reason.basis,'timetable-model');assert.equal(balanced.candidates[2].headroom,0);
assert.equal(G.balance(homes,{budget:1500,priority:'commute'}).candidates[0].category,'commute');
assert.equal(JSON.stringify(homes),before,'balance must not reorder or decorate the live catalogue in place');
assert.equal(G.balance([...homes,homes[0]],{budget:1500}).matches,3,'duplicate catalogue IDs cannot become more options');
assert.equal(G.balance(homes,{budget:1000}).candidates.length,0,'never quietly raise the hard budget');
assert.equal(G.balance(homes,{budget:0}).matches,4,'zero explicitly means all rents');
assert.deepEqual(G.balance(null,{}).candidates,[]);
console.log('  ✓ Balance: three distinct factual choices, hard budget, exclusions, deterministic priority and no catalogue mutation');

const sparse=[{...homes[0],id:'single',area:null,journey:null}];
assert.equal(G.balance(sparse,{}).candidates.length,1,'one home must not be repeated to fill three slots');
assert.deepEqual(G.balance(sparse,{}).unavailableCategories,['space','commute']);
assert.equal(G.balance(sparse,{}).candidates[0].reason.code,'listed-rent','a lone home cannot claim to be lower than another');
const dominant=[{...homes[0],area:100,journey:journey(10)},{...homes[1],area:50,journey:journey(30)}];
const dominantResult=G.balance(dominant,{});
assert.equal(dominantResult.candidates.length,1,'one home winning all categories appears once');
assert.deepEqual(dominantResult.candidates[0].categories,['rent','space','commute']);
assert.equal(dominantResult.candidates[0].reasons.length,3);
assert.ok(dominantResult.candidates[0].reasons.every(r=>r.referenceId==='space'));
const missingFacts=[{...homes[0],area:null,journey:null},homes[1],homes[2]];
const knownComparison=G.balance(missingFacts,{});
assert.equal(knownComparison.candidates.find(r=>r.category==='commute').reason.referenceId,'space','a missing cheaper journey is not treated as slower; reference the named comparable model');
assert.equal(knownComparison.unknownJourneys,1);
console.log('  ✓ Sparse evidence: no forced alternatives, multi-category winners deduplicate, unknown journeys stay explicit');

function assertModelFirst(engine){
 const ranked=engine.rank([
  {...homes[0],id:'rough',rent:900,journey:journey(2,{fonte:'stima'})},
  {...homes[0],id:'walk',rent:1000,journey:journey(1,{fonte:'piedi'})},
  {...homes[0],id:'model',rent:1400,journey:journey(40)},
  {...homes[0],id:'unknown',rent:800,journey:null}
 ],{priority:'commute'});
 assert.equal(ranked.candidates[0].id,'model','only timetable-model minutes may lead journey priority');
 assert.deepEqual(ranked.candidates.slice(1).map(r=>r.id),['rough','walk'],'unmeasured journeys are ordered by rent, not their geometric minutes');
 assert.equal(ranked.comparableJourneys,1);assert.equal(ranked.estimatedJourneys,2);assert.equal(ranked.unknownJourneys,1);
 assert.equal(ranked.candidates[1].journeyStatus,'estimate');
 assert.match(engine.reasons(ranked.candidates[1],ranked)[0],/Route estimate only/);
}
assertModelFirst(G);
for(const fonte of ['stima','piedi']){
 const rough=homes.slice(0,3).map(r=>({...r,journey:{...r.journey,fonte}}));
 assert.ok(!G.balance(rough,{}).availableCategories.includes('commute'),'geometric '+fonte+' estimates cannot produce an easier-journey recommendation');
 assert.equal(G.tradeoff(rough[1],rough).minutesDelta,null,'no travel savings inferred from geometric '+fonte+' estimates');
}
const unmodelled=G.rank(homes.slice(0,3).map(r=>({...r,journey:null})),{priority:'commute'});
assert.deepEqual(unmodelled.candidates.map(r=>r.id),['rent','space','journey']);assert.equal(unmodelled.comparableJourneys,0);
assert.equal(G.rank([{...homes[0],journey:journey(0)}],{priority:'commute'}).candidates[0].journey.min,0,'a genuine zero model value is not missing');
for(const invalid of [journey(-1),journey(NaN),journey('10'),journey(10,{fonte:'unknown'})])assert.equal(G.rank([{...homes[0],journey:invalid}],{}).unknownJourneys,1);
console.log('  ✓ Journey evidence: timetable model before estimates, geometric minutes never become a faster-route benefit, explicit unknowns and zero');

for(const type of ['bilocale','Trilocale','Loft ','Duplex','Spacious 2 Bedroom flat','entire apartment'])assert.equal(G.homeKind(type),'apartment',type);
assert.equal(G.homeKind('Room with private Bath '),'room');assert.equal(G.homeKind('Room with private bathroom'),'room');
for(const type of ['Historic','Garden Floor','Loft Style','Private terrace','',null])assert.equal(G.homeKind(type),null,type);
assert.notEqual(G.homeKind('Private room'),G.homeKind('Shared room'));
function assertNoCrossKind(engine){
 const mixed=[{...homes[0],type:'Room',area:12},{...homes[1],type:'Apartment',area:80}];
 const result=engine.balance(mixed,{});
 assert.deepEqual(Array.from(result.availableCategories),['rent'],'a larger whole flat is not a more-space alternative to a room without a flat peer');
 assert.equal(result.candidates[0].reason.referenceId,null);
}
assertNoCrossKind(G);
const mixed=[{...homes[0],id:'room',type:'Room',rent:700,area:12},...homes.slice(0,3)];
for(const option of G.balance(mixed,{}).candidates)for(const reason of option.reasons){
 if(reason.referenceId){const reference=mixed.find(r=>r.id===reason.referenceId);assert.equal(G.homeKind(option.type),G.homeKind(reference.type));}
}
for(const change of [{precision:'zone'},{precision:null},{destination:{lat:42,lng:12.5}},{destination:{lat:null,lng:null}},{destination:null}]){
 const noPair=[homes[0],{...homes[2],journey:journey(10,change)}];
 assert.ok(!G.balance(noPair,{}).availableCategories.includes('commute'),'unlike coordinate/precision evidence cannot imply saved minutes');
 assert.equal(G.tradeoff(noPair[1],noPair).minutesDelta,null);
}
console.log('  ✓ Like-for-like choices: explicit catalogue aliases, no room/flat benefits, no borrowed destination or precision');

// These mutations restore the defects this change is meant to prevent.
const source=readFileSync(root+'js/skyline-guide-engine.js','utf8');
function mutant(find,replacement){assert.ok(source.includes(find),'mutation target exists');const ctx=vm.createContext({module:{exports:{}},URLSearchParams});vm.runInContext(source.replace(find,replacement),ctx);return ctx.module.exports;}
assertNoCrossKind(mutant('homeKind(r.type)===kind','homeKind(r.type)===kind'));
assert.throws(()=>assertModelFirst(mutant('delta=quality(a)-quality(b);','delta=(journey(a.journey)?a.journey.min:Infinity)-(journey(b.journey)?b.journey.min:Infinity);')),/only timetable-model/);
const noBudget=mutant('return !budget||r.rent<=budget;','return true;');
assert.throws(()=>assert.equal(noBudget.balance(homes,{budget:1500}).candidates.every(r=>r.rent<=1500),true));
assert.throws(()=>assertNoCrossKind(mutant('homeKind(r.type)===kind','true')),/larger whole flat/);
console.log('  ✓ Mutations caught: geometric ranking, budget bypass and cross-type space claims');
