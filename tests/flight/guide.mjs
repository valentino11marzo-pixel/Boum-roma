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
const M=require('../../js/mappa-engine.js');
assert.equal(new Set(M.DESTINATIONS.map(d=>d.slug)).size,M.DESTINATIONS.length);
assert.equal(M.destination('luiss').address,'Viale Romania 32, Rome');
assert.equal(M.destination('luiss-parenzo').address,'Via Parenzo 11, Rome');
assert.equal(M.destination('rufa-ostiense').address,'Via Giuseppe Libetta 7, Rome');
assert.equal(M.destination('rome-business-school').address,'Via Giuseppe Montanelli 5, Rome');
assert.equal(M.destination('tor-vergata-engineering').address,'Via del Politecnico 1, Rome');
assert.equal(M.destination('naba-rome').address,'Via Ostiense 92, Rome');
assert.equal(M.mappedDestination(M.destination('luiss-parenzo')),false,'address-only campus cannot become (0,0) or borrow Romania');
assert.equal(M.mappedDestination(M.destination('naba-rome')),true);
assert.ok(M.destination('naba-rome').coordinateSource.startsWith('https://www.turismoroma.it/'));
assert.ok(!M.destination('naba-rome').gridSlug,'new campus must not inherit a legacy GTFS grid');
assert.ok(M.DESTINATIONS.filter(d=>d.source).every(d=>d.address&&d.checked==='2026-10-28'&&new URL(d.source).protocol==='https:'));
assert.match(M.destinationMap(M.destination('rufa-ostiense')),/Giuseppe%20Libetta%207/);
assert.equal(M.destinationMap({slug:'private',address:'Private home'}),null);
const noJourneys=G.rank(homes.map(r=>({...r,journey:null})),{budget:2000,priority:'commute'});
assert.equal(noJourneys.journeys,0);assert.equal(noJourneys.candidates[0].id,'affordable');assert.equal(noJourneys.matches,4);
assert.match(G.reasons(noJourneys.candidates[0],noJourneys).join(' '),/Route still to verify/);
assert.equal(G.rank([{id:'door',rent:900,journey:{...trip,min:0}}],{priority:'commute'}).candidates[0].journey.min,0);
const publicURL=new URL(G.share({budget:1500,place:'rufa-ostiense',priority:'space',homes:['one','two','unknown','one','bad?email=secret'],includeHomes:true,email:'private@sample.test',lat:51.5},M.DESTINATIONS,['one','two']), 'https://www.boomrome.com');
assert.equal(publicURL.pathname,'/skyline');assert.equal(publicURL.searchParams.get('homes'),'one,two');assert.equal(publicURL.searchParams.get('place'),'rufa-ostiense');assert.equal(publicURL.searchParams.get('priority'),'space');
assert.deepEqual([...publicURL.searchParams.keys()].sort(),['budget','guide','homes','place','priority']);
assert.equal(new URL(G.share({place:'private-place',homes:['one'],includeHomes:false},M.DESTINATIONS,['one']),'https://www.boomrome.com').searchParams.has('homes'),false);
assert.equal(new URL(G.share({place:'private-place'},M.DESTINATIONS,[]),'https://www.boomrome.com').searchParams.has('place'),false);
assert.equal(new URL(G.share({includeHomes:true,homes:['unknown']},M.DESTINATIONS,[]),'https://www.boomrome.com').searchParams.get('homes'),'','explicit empty shortlist remains empty');
assert.equal(G.addressDirections({lat:41.9,lng:12.5},'Via Giuseppe Libetta 7, Rome'),'https://www.google.com/maps/dir/?api=1&origin=41.9,12.5&destination=Via%20Giuseppe%20Libetta%207%2C%20Rome&travelmode=transit');
assert.equal(G.addressDirections({lat:null,lng:null},'Campus'),null);
console.log('  ✓ Your Rome: verified campus addresses, unknown coordinates, no borrowed GTFS, explainable ranking and public opt-in shares');
const flatA={id:'a',name:'A',type:'Apartment',rent:1200,area:50,journey:{...trip,min:20,precision:'zone'}};
const flatB={id:'b',name:'B',type:'Apartment',rent:1450,area:70,journey:{...trip,min:15,precision:'zone'}};
assert.deepEqual(G.tradeoff(flatB,[flatA,flatB]),{comparable:true,referenceId:'a',referenceName:'A',kind:'apartment',rentDelta:250,areaDelta:20,minutesDelta:-5});
assert.equal(G.tradeoff({...flatB,type:'Room'},[flatA,flatB]).comparable,false,'rooms and apartments never claim equivalent space gains');
assert.equal(G.tradeoff({...flatB,type:''},[flatA]).comparable,false,'unknown type is not guessed');
assert.equal(G.tradeoff({...flatB,area:null},[flatA]).areaDelta,null);
assert.equal(G.tradeoff({...flatB,journey:{...flatB.journey,fonte:'rete'}},[flatA]).minutesDelta,null,'different trip models are not comparable');
assert.equal(G.tradeoff({...flatB,journey:{...flatB.journey,destination:{lat:42,lng:12}}},[flatA]).minutesDelta,null,'different destinations are not comparable');
console.log('  ✓ Immediate trade-offs compare equivalent listed home types and matching travel models only');

assert.equal(G.tradeoff({...flatA,type:'Private room'},[{...flatB,type:'Shared room'}]).comparable,false,'private and shared rooms are distinct rental types');
