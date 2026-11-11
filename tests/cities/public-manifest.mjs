// The deployed public contract must not expose cities/ source documents.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {publicDeskProjection,PUBLIC_DESKS_FILE,writeAll} from '../../build-cities.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const shared=read('cities/_shared.json');
const cities=fs.readdirSync(path.join(root,'cities')).filter(f=>f.endsWith('.json')&&!f.startsWith('_')).sort().map(f=>read('cities/'+f));
let passed=0,failed=0;
function check(name,fn){try{fn();passed++;console.log('  ✓ '+name);}catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}}
console.log('\n▸ public desks  One generated public projection, private city sources stay private');
check('committed projection contains every active selling desk in the current source configuration',()=>{
  const actual=read(PUBLIC_DESKS_FILE),expected=publicDeskProjection(shared,cities);
  const activeSlugs=cities.filter(city=>city.live===true&&city.mode==='search'&&city.checkout===true).map(city=>city.slug).sort();
  assert.ok(activeSlugs.length>0);assert.deepEqual(actual,expected);assert.deepEqual(Object.keys(actual.cities),activeSlugs);
  assert.equal(actual.refund.rule,shared.refund.rule);
  assert.equal(fs.readFileSync(path.join(root,PUBLIC_DESKS_FILE),'utf8'),JSON.stringify(expected,null,2)+'\n');
});
function contract(projection){
  assert.deepEqual(Object.keys(projection).sort(),['cities','refund']);assert.deepEqual(Object.keys(projection.refund),['rule']);
  for(const city of Object.values(projection.cities)){
    assert.deepEqual(Object.keys(city).sort(),['chargeAt','city','currency','hero','live','mode','pricing','slug']);
    assert.deepEqual(Object.keys(city.hero),['faresHead']);assert.deepEqual(Object.keys(city.hero.faresHead),['b']);assert.deepEqual(Object.keys(city.pricing).sort(),['plans','sub']);
    for(const plan of city.pricing.plans)assert.deepEqual(Object.keys(plan).sort(),['condition','id','includes','label','offerDescription','price','trigger']);
  }
}
check('every exposed field is explicitly allowlisted and copied verbatim from its public desk source',()=>{
  const projection=publicDeskProjection(shared,cities);contract(projection);
  for(const source of cities.filter(c=>c.live&&c.mode==='search'&&c.checkout)){
    const actual=projection.cities[source.slug];assert.equal(actual.hero.faresHead.b,source.hero.faresHead.b);
    assert.equal(actual.city,source.city);assert.equal(actual.currency,source.currency||'EUR');assert.equal(actual.chargeAt,source.chargeAt||'checkout');assert.equal(actual.pricing.sub,source.pricing.sub||'');
    for(const plan of actual.pricing.plans){const sourcePlan=source.pricing.plans.find(p=>p.id===plan.id);for(const key of Object.keys(plan))assert.deepEqual(plan[key],key==='trigger'?(sourcePlan.trigger||''):sourcePlan[key]);}
  }
});
check('new private fields cannot leak; ordering is deterministic and non-selling live desks are excluded',()=>{
  const copy=structuredClone(cities),s=structuredClone(shared);
  s.internalNotes='PRIVATE_NOTE_SHARED';s.refund.internal='PRIVATE_NOTE_REFUND';
  for(const c of copy){c.internalNotes='PRIVATE_NOTE_CITY';c.hero.internal='PRIVATE_NOTE_HERO';c.hero.faresHead.internal='PRIVATE_NOTE_FARES';c.pricing.internal='PRIVATE_NOTE_PRICING';for(const p of c.pricing.plans)p.internalNotes='PRIVATE_NOTE_PLAN';}
  const result=publicDeskProjection(s,copy.reverse());assert.deepEqual(result,publicDeskProjection(shared,cities));assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NOTE/);
  const active=structuredClone(cities.find(c=>c.slug==='madrid'));active.mode='waitlist';assert.equal('madrid'in publicDeskProjection(shared,[active]).cities,false);
  active.mode='search';active.checkout=false;assert.equal('madrid'in publicDeskProjection(shared,[active]).cities,false);
});
check('privacy and not-open filtering regressions are caught by mutations of the real projection',()=>{
  const source=publicDeskProjection.toString();
  const poisoned=structuredClone(cities);poisoned.forEach(c=>c.internalNotes='PRIVATE_NOTE_CITY');
  const draft=structuredClone(cities[0]);Object.assign(draft,{slug:'not-open-fixture',live:false,mode:'waitlist',checkout:false});poisoned.push(draft);
  function prove(fn){const result=fn(shared,poisoned);contract(result);assert.equal('not-open-fixture'in result.cities,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NOTE/);}
  prove(publicDeskProjection);
  prove(vm.runInNewContext('('+source+')'));
  for(const [before,after] of [
    ["if (city.live !== true || city.mode !== 'search' || city.checkout !== true) continue;",'if (false) continue;'],
    ['out.cities[city.slug] = {','out.cities[city.slug] = { internalNotes: city.internalNotes,']
  ]){assert.ok(source.includes(before));const mutant=vm.runInNewContext('('+source.replace(before,after)+')');assert.throws(()=>prove(mutant));}
});
check('currency and payment conditions cannot drift silently from the canonical public desk',()=>{
  function prove(fn){
    const p=fn(shared,cities);
    assert.equal(p.cities.london.currency,'GBP');assert.equal(p.cities.milan.currency,'EUR');
    for(const slug of ['paris','berlin']){
      assert.equal(p.cities[slug].chargeAt,'signing');
      const source=cities.find(c=>c.slug===slug);
      for(const plan of p.cities[slug].pricing.plans)assert.equal(plan.trigger,source.pricing.plans.find(x=>x.id===plan.id).trigger);
    }
    assert.equal(p.cities.milan.chargeAt,'checkout');
    assert.equal(p.cities.madrid.pricing.sub,cities.find(c=>c.slug==='madrid').pricing.sub);
  }
  prove(publicDeskProjection);
  const source=publicDeskProjection.toString();
  for(const [before,after] of [
    ["currency: city.currency || 'EUR'","currency: 'EUR'"],
    ["chargeAt: city.chargeAt || 'checkout'","chargeAt: 'checkout'"],
    ["trigger: plan.trigger || ''","trigger: ''"],
    ["sub: city.pricing.sub || ''","sub: ''"]
  ]){assert.ok(source.includes(before));assert.throws(()=>prove(vm.runInNewContext('('+source.replace(before,after)+')')));}
});
check('writeAll generates the manifest, --check rejects missing or stale content, and rebuild restores it',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'boom-desks-public-'));
  try{
    const files=['cities/_template.html','cities/_shared.json','cities/paris.json','cities/_claims.json','assets/src/boom-city.css','assets/src/boom-city.js','assets/src/boom-onda.js','assets/src/boom-map.js','css/boom-scroll.css','js/boom-scroll.js','js/boom-consent.js','js/boom-track.js','js/desk-calendar.js','design/pages-deco/solari-engine.html','og-paris.png','withdrawal.html'];
    for(const file of files){fs.mkdirSync(path.dirname(path.join(tmp,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(tmp,file));}
    writeAll({root:tmp});assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp,PUBLIC_DESKS_FILE),'utf8')),publicDeskProjection(shared,[read('cities/paris.json')]));
    assert.doesNotThrow(()=>writeAll({root:tmp,check:true}));
    fs.writeFileSync(path.join(tmp,PUBLIC_DESKS_FILE),'{}\n');assert.throws(()=>writeAll({root:tmp,check:true}),/boom-desks-public.json is stale/);
    writeAll({root:tmp});assert.doesNotThrow(()=>writeAll({root:tmp,check:true}));
    fs.unlinkSync(path.join(tmp,PUBLIC_DESKS_FILE));assert.throws(()=>writeAll({root:tmp,check:true}),/boom-desks-public.json is stale/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
check('deployment still excludes private city sources; the projection lives under public assets',()=>{
  const ignore=fs.readFileSync(path.join(root,'.vercelignore'),'utf8');assert.match(ignore,/^cities\//m);assert.equal(PUBLIC_DESKS_FILE,'assets/boom-desks-public.json');
  assert.doesNotMatch(ignore,/^assets\/$/m);assert.doesNotMatch(ignore,/boom-desks-public/);
});
console.log('Public desks: '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
