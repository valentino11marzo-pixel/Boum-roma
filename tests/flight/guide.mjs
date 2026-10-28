import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),G=require('../../js/skyline-guide-engine.js');
const trip={min:20,fonte:'stima',origin:{lat:41.9,lng:12.5},destination:{lat:41.89,lng:12.49}};
const homes=[
 {id:'affordable',rent:1200,area:45,lane:'now',journey:{...trip,min:35}},
 {id:'spacious',rent:1500,area:85,lane:'ahead',journey:{...trip,min:30,fonte:'rete'}},
 {id:'close',rent:1800,area:55,lane:'now',journey:{...trip,min:10,fonte:'piedi'}},
 {id:'unknown',rent:1400,area:null,lane:'now',journey:null},
 {id:'closed',rent:500,area:200,lane:'closed',journey:trip},
 {id:'missing',rent:400,area:200,missing:true},
 {id:'unpriced',rent:null,area:50,lane:'now'}
];
const original=JSON.stringify(homes);
assert.equal(G.rank(homes,{budget:1600,priority:'rent'}).candidates[0].id,'affordable');
assert.equal(G.rank(homes,{budget:1600,priority:'space'}).candidates[0].id,'spacious');
assert.equal(G.rank(homes,{budget:2000,priority:'commute'}).candidates[0].id,'close');
const result=G.rank(homes,{budget:1600,priority:'commute'});
assert.equal(result.matches,3);assert.equal(result.unknownPrice,1);
assert.equal(result.candidates.at(-1).id,'unknown');
assert.equal(result.candidates[0].journey.fonte,'rete');
assert.equal(result.candidates[1].journey.fonte,'stima');
assert.equal(result.candidates[0].headroom,100);
assert.equal(G.rank(homes,{budget:1000}).candidates.length,0);
assert.equal(G.rank([...homes,homes[0]],{}).total,4);
assert.equal(JSON.stringify(homes),original);
assert.equal(G.directions(trip),'https://www.google.com/maps/dir/?api=1&origin=41.9,12.5&destination=41.89,12.49&travelmode=transit');
assert.match(G.directions({...trip,fonte:'piedi'}),/travelmode=walking$/);
assert.equal(G.directions({...trip,origin:{lat:100,lng:12}}),null);
assert.equal(G.directions({...trip,origin:{lat:'private-place',lng:12}}),null);
assert.equal(G.directions(null),null);
console.log('  ✓ Skyline guidance: rent/space/commute tradeoffs, truthful unknowns, budget boundaries, no mutation and public directions');
