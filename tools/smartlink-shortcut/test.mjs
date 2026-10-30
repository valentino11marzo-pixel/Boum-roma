import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { buildArtifact, buildCaptureScript, buildReleaseManifest, buildWorkflow, CAPTURE_ERRORS, MANIFEST_RELATIVE, OUTPUT_RELATIVE, PORTAL_URL, REPO_ROOT, SIGNED_RELATIVE, toPlist } from './build.mjs';

const rulesSource=readFileSync(resolve(REPO_ROOT,'js/smartlink-engine.js'),'utf8');
const shareSource=readFileSync(resolve(REPO_ROOT,'js/smartlink-share-engine.js'),'utf8');
const workflow=buildWorkflow(rulesSource,shareSource), artifact=toPlist(workflow);
const sourceUrl='https://www.immobiliare.it/annunci/123456789/';
const photos=Array.from({length:20},(_,i)=>`https://pwm.im-cdn.it/image/${1800000000+i}/xxl.jpg`);
const node=value=>({textContent:JSON.stringify(value)});
const fixture={
  querySelectorAll(selector) {
    if(selector==='script[type="application/ld+json"]') return [node({
      '@type':'Apartment',url:sourceUrl,name:'Casa & luce <Roma>',offers:{price:1500},
      address:{addressLocality:'Roma'},floorSize:{value:70},numberOfRooms:3,image:photos,
    })];
    return [];
  },
  querySelector:()=>null,
};
function run(script,{document=fixture,url=sourceUrl}={}) {
  const outputs=[];
  const untouched={BOOM_SMARTLINK_SHARE:{capture(){throw new Error('Page global must not run');}}};
  const context={document,location:{href:url},URL,TextEncoder,window:untouched,module:{exports:{}},
    completion:value=>outputs.push(value),
    fetch(){throw new Error('Network is forbidden');},
  };
  Object.defineProperty(document,'cookie',{get(){throw new Error('Cookies are forbidden');},configurable:true});
  vm.runInNewContext(script,context,{timeout:1000});
  assert.equal(outputs.length,1,'completion must run exactly once');
  assert.equal(context.window,untouched,'page window must not be replaced');
  assert.equal(context.window.BOOM_SMARTLINK,undefined,'rules must stay inside the shortcut scope');
  assert.equal(typeof outputs[0],'string','clipboard receives a JSON string');
  return JSON.parse(outputs[0]);
}
const diagnostic=error=>({kind:'boom.smartlink.share',version:1,error});
function stub(body) {
  return `window.BOOM_SMARTLINK_SHARE = {MAX_BYTES:131072,capture:function(document,url){${body}}};`;
}

// Action order is also the data flow: URL replaces the clipboard payload before Open URL.
assert.equal(workflow.WFWorkflowName,'Crea SmartLink BOOM');
assert.deepEqual(workflow.WFWorkflowInputContentItemClasses,['WFSafariWebPageContentItem']);
assert.deepEqual(workflow.WFWorkflowTypes,['ActionExtension']);
assert.deepEqual(workflow.WFWorkflowActions.map(action=>action.WFWorkflowActionIdentifier),[
  'is.workflow.actions.runjavascriptonwebpage','is.workflow.actions.setclipboard',
  'is.workflow.actions.url','is.workflow.actions.openurl',
]);
assert.deepEqual(workflow.WFWorkflowActions[1].WFWorkflowActionParameters,{WFLocalOnly:true});
assert.deepEqual(workflow.WFWorkflowActions[2].WFWorkflowActionParameters,{WFURLActionURL:PORTAL_URL});
assert.equal(PORTAL_URL,'https://www.boomrome.com/portal?smartlink-share=1#boom-tools');
assert.deepEqual(workflow.WFWorkflowActions[3].WFWorkflowActionParameters,{});
assert.equal(artifact,buildArtifact(),'artifact is deterministic');
assert.equal(artifact,readFileSync(resolve(REPO_ROOT,OUTPUT_RELATIVE),'utf8'),'committed artifact must include current engines');
const manifestPath=resolve(REPO_ROOT,MANIFEST_RELATIVE), signedPath=resolve(REPO_ROOT,SIGNED_RELATIVE);
if(existsSync(signedPath)) {
  assert.ok(existsSync(manifestPath),'a signed release needs its manifest');
  assert.deepEqual(JSON.parse(readFileSync(manifestPath,'utf8')),buildReleaseManifest(),'release hashes must match unsigned artifact, signed file and both embedded engines');
} else if(existsSync(manifestPath)) {
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.unsigned.sha256,createHash('sha256').update(artifact).digest('hex'),'unsigned release must match manifest even without signed binary');
  for(const source of manifest.sources) assert.equal(source.sha256,createHash('sha256').update(readFileSync(resolve(REPO_ROOT,source.path))).digest('hex'),'source release must match manifest');
}

const script=workflow.WFWorkflowActions[0].WFWorkflowActionParameters.WFJavaScript;
assert.ok(script.includes(rulesSource) && script.includes(shareSource),'both engines are embedded verbatim');
const captured=run(script);
assert.equal(captured.kind,'boom.smartlink.share');
assert.equal(captured.version,1);
assert.equal(captured.sourceUrl,sourceUrl);
assert.equal(captured.data.title,'Casa & luce <Roma>');
assert.equal(captured.data.price,1500);
assert.deepEqual(captured.images,photos,'gallery beyond 12 photos reaches the clipboard');
assert.equal('ok' in captured,false,'only the payload is copied, not the capture result envelope');
assert.deepEqual(run(script,{url:'https://untrusted.example/annunci/123456789/'}),diagnostic('unsupported_listing_url'));
assert.deepEqual(run(script,{document:{querySelectorAll(){throw new Error('Sensitive page detail');}}}),diagnostic('capture_unavailable'));
assert.deepEqual(run(buildCaptureScript('',stub("throw new Error('Private exception');"))),diagnostic('capture_unavailable'));
for(const error of CAPTURE_ERRORS) assert.deepEqual(run(buildCaptureScript('',stub(`return {ok:false,error:${JSON.stringify(error)}};`))),diagnostic(error));
assert.deepEqual(run(buildCaptureScript('',stub("return {ok:false,error:'Private page contents'};"))),diagnostic('capture_unavailable'));
assert.deepEqual(run(buildCaptureScript('',stub('return {ok:true};'))),diagnostic('capture_unavailable'));

const oversized=buildCaptureScript('',stub("return {ok:true,payload:{value:'é'.repeat(65536)}};"));
const expectBounded=code=>assert.deepEqual(run(code),diagnostic('payload_too_large'));
expectBounded(oversized);
assert.throws(()=>expectBounded(oversized.replace('new TextEncoder().encode(serialized).length <= api.MAX_BYTES','true')),assert.AssertionError,'mutation: unbounded clipboard output must fail');
assert.throws(()=>run(script.replace('const window = Object.create(null);','const window = globalThis.window;')),assert.AssertionError,'mutation: writing to page globals must fail');

// macOS native plist parser verifies escaping and the complete action dictionary, without
// importing, signing, installing or executing a shortcut. Linux CI still runs all JS checks.
if(process.platform==='darwin') {
  const parsed=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-','-'],{input:artifact,encoding:'utf8',maxBuffer:1024*1024}));
  assert.deepEqual(parsed,workflow,'native plist roundtrip preserves exact JS and action inputs');
}
console.log('SmartLink Shortcut: PASS (4 actions, local clipboard, embedded capture, 20 photos, bounded diagnostics, 2 mutations; native installation not tested)');
