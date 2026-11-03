// Execute the real Studio matrix with production mutations confined to memory.
// Each mutation must reach its intended assertion, never fail on imports/syntax.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const portalURL=new URL('../../js/portal-app.js',import.meta.url);
const studioURL=new URL('./studio.mjs',import.meta.url);
const portal=readFileSync(portalURL,'utf8');
const studio=readFileSync(studioURL,'utf8');
const sourceRead="const sourceCode=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');";
assert.equal(studio.split(sourceRead).length,2,'The Studio must have one injectable production-source read');

function replaceOnce(source,before,after) {
  assert.equal(source.split(before).length,2,'The mutation must identify one exact production guard');
  return source.replace(before,after);
}

function matrix(code,name) {
  // The harness itself normally selects these exact blocks. Supplying the same
  // blocks avoids embedding unrelated Portal features in each in-memory module.
  const proofStart=code.indexOf('    function portalSessionProof() {');
  const proofEnd=code.indexOf('    function portalSessionReset() {',proofStart);
  const start=code.indexOf('    function openExternalSmartLink() {');
  const end=code.indexOf('    // ═════════',code.indexOf('    async function smartLinkCreate()'));
  assert.ok(proofStart>=0 && proofEnd>proofStart && start>=0 && end>start);
  const selected=code.slice(proofStart,proofEnd)+'    function portalSessionReset() {}\n'+code.slice(start,end)+'    // ═════════';
  let test=studio.replace(sourceRead,'const sourceCode='+JSON.stringify(selected)+';');
  for(const file of ['smartlink-engine.js','smartlink-share-engine.js']) {
    const relative="'../../js/"+file+"'";
    test=replaceOnce(test,relative,JSON.stringify(new URL('../../js/'+file,import.meta.url).href));
  }
  return {test,url:'data:text/javascript,'+encodeURIComponent(test+'\n//# sourceURL=boom-smartlink-studio-'+name+'.mjs')};
}

await import(matrix(portal,'baseline').url);

const incomplete="if (smartLinkShare && (smartLinkShare.failed || smartLinkShare.expected!==null && smartLinkShare.found<smartLinkShare.expected))";
const pasteGuard="read===smartLinkShareRead && version===smartLinkPollVersion && portalSessionCurrent(proof) && sourceInput===document.getElementById('sl_source')";
const photoGuard="version===smartLinkPollVersion && smartLinkShare===state && portalSessionCurrent(proof) && sourceInput===document.getElementById('sl_source')";
const createGuard="const current=()=>portalSessionCurrent(proof) && version===smartLinkPollVersion && draft===document.getElementById('sl_key') && draft?.isConnected;";
const incompleteAssertion='context.smartLinkShareReview(true);await context.smartLinkCreate();assert.equal(published,null);';
const incompleteLine=studio.slice(0,studio.indexOf(incompleteAssertion)).split('\n').length;
assert.ok(studio.includes(incompleteAssertion),'The known-incomplete gallery assertion must remain in the real matrix');

const cases=[
  {name:'incomplete-gallery',code:replaceOnce(portal,incomplete,'if (false)'),check(error){
    assert.equal(error.expected,null);
    assert.equal(error.actual?.images?.length,2,'The failure must be the two-photo incomplete gallery being published');
    assert.equal(error.actual?.historicalData,true);
    assert.match(error.stack,new RegExp('boom-smartlink-studio-incomplete-gallery\\.mjs:'+incompleteLine+':\\d+'),
      'The incomplete-gallery mutation must fail at its exact publication assertion');
  }},
  {name:'share-session',code:replaceOnce(replaceOnce(portal,pasteGuard,pasteGuard.replace('portalSessionCurrent(proof) && ','')),
    photoGuard,photoGuard.replace('portalSessionCurrent(proof) && ','')),check(error){
    assert.match(error.message,/A late clipboard result after account must not download photos/);
  }},
  {name:'create-session',code:replaceOnce(portal,createGuard,createGuard.replace('portalSessionCurrent(proof) && ','')),check(error){
    assert.match(error.message,/An old create token result cannot publish after an account change/);
    assert.equal(error.actual?.images?.length,1);
  }},
];
for(const scenario of cases) {
  await assert.rejects(()=>import(matrix(scenario.code,scenario.name).url),error=>{
    assert.equal(error.code,'ERR_ASSERTION','A dependency, syntax or runtime error is not a detected mutation');
    scenario.check(error);
    return true;
  },'The '+scenario.name+' mutation must be rejected by the real Studio matrix');
}

assert.equal(readFileSync(portalURL,'utf8'),portal,'Mutation checks never write the product file');
assert.equal(readFileSync(studioURL,'utf8'),studio,'Mutation checks never weaken the source matrix');
console.log('SmartLink Studio mutations: PASS (baseline; incomplete gallery; share session; create session; memory only)');
