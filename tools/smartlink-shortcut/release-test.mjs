/* Real manifest/verification code; only the native process boundary is simulated. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {buildArtifact,buildWorkflow,compareSignedWorkflow,verifySignedWorkflow,validateReleaseManifest,OUTPUT_RELATIVE,SIGNED_RELATIVE,REPO_ROOT} from './build.mjs';

const directory=mkdtempSync(join(tmpdir(),'boom-shortcut-release-test-'));
const marker='__boomNativeRelease_'+randomUUID().replaceAll('-','');
const source=readFileSync(new URL('./build.mjs',import.meta.url),'utf8');
let nativeCalls=0,mode='valid';
try {
  const fixture=join(directory,'repo');
  mkdirSync(join(fixture,'js'),{recursive:true});mkdirSync(join(fixture,'assets/tools'),{recursive:true});
  for(const name of ['smartlink-engine.js','smartlink-share-engine.js'])writeFileSync(join(fixture,'js',name),readFileSync(resolve(REPO_ROOT,'js',name)));
  const unsigned=Buffer.from(buildArtifact(fixture));writeFileSync(resolve(fixture,OUTPUT_RELATIVE),unsigned);
  const signed=Buffer.alloc(32);signed.write('AEA1');signed.writeUInt32LE(4,8);signed.write('test',12);
  writeFileSync(resolve(fixture,SIGNED_RELATIVE),signed);
  const expected=buildWorkflow(readFileSync(join(fixture,'js/smartlink-engine.js'),'utf8'),readFileSync(join(fixture,'js/smartlink-share-engine.js'),'utf8'));
  const signedWorkflow=()=>{
    const value=structuredClone(expected);delete value.WFWorkflowName;
    Object.assign(value,{WFQuickActionSurfaces:[],WFWorkflowOutputContentItemClasses:[],WFWorkflowHasShortcutInputVariables:false,WFWorkflowHasOutputFallback:false});
    if(mode==='wrong-plist')value.WFWorkflowActions[0].WFWorkflowActionParameters.WFJavaScript='completion("different");';
    return value;
  };
  globalThis[marker]=(tool,args,options)=>{
    nativeCalls++;assert.equal(options.timeout,15000);assert.equal(options.maxBuffer,2000000);
    assert.deepEqual(options.stdio,['pipe','pipe','pipe']);
    if(mode==='missing-tool')throw Error('private native error must not escape');
    if(tool==='/usr/bin/plutil' && args[0]==='-extract')return Buffer.from('fixture-certificate').toString('base64');
    if(tool==='/usr/bin/openssl')return 'fixture public key';
    if(tool==='/usr/bin/aea') {
      if(mode==='bad-signature')throw Error('raw signature detail must not escape');
      assert.deepEqual(readFileSync(args[args.indexOf('-i')+1]),signed,'Verification must use a private copy of the bytes being hashed');
      if(mode==='changed-during-decode') {const changed=Buffer.from(signed);changed[31]=1;writeFileSync(resolve(fixture,SIGNED_RELATIVE),changed);}
      writeFileSync(args[args.indexOf('-o')+1],'fixture archive');return '';
    }
    if(tool==='/usr/bin/aa' && args[0]==='list')return mode==='invalid-json'?'private malformed output':JSON.stringify([{TYP:'D',PAT:''},
      {TYP:mode==='symlink'?'L':'F',PAT:mode==='outside-path'?'../Shortcut.wflow':'Shortcut.wflow',DAT:200}]);
    if(tool==='/usr/bin/aa' && args[0]==='extract') {
      assert.equal(args[args.indexOf('-include-path')+1],'Shortcut.wflow');
      writeFileSync(join(args[args.indexOf('-d')+1],'Shortcut.wflow'),'fixture plist');return '';
    }
    if(tool==='/usr/bin/plutil' && args[0]==='-convert')return JSON.stringify(args.at(-1).endsWith('unsigned.plist')?expected:signedWorkflow());
    assert.fail('Unexpected native tool invocation');
  };
  const replacement="const execFileSync=(...args)=>globalThis["+JSON.stringify(marker)+"](...args);";
  const injected=source.replace("import { execFileSync } from 'node:child_process';",replacement).replace("if(process.platform!=='darwin')","if(false)");
  assert.notEqual(injected,source);
  const modulePath=join(directory,'build-test.mjs');writeFileSync(modulePath,injected);
  const native=await import(pathToFileURL(modulePath).href);
  const manifest=native.buildReleaseManifest(fixture);
  assert(nativeCalls>0);assert.equal(manifest.version,2);
  assert.equal(manifest.verification.signatureVerified,true);assert.equal(manifest.verification.trustChainVerified,false);
  assert.deepEqual(validateReleaseManifest(manifest,fixture),{attestationMatchesCurrentFiles:true,nativeDecoderRun:false,trustChainVerified:false});

  for(const testMode of ['wrong-plist','bad-signature','missing-tool','outside-path','symlink','invalid-json']) {
    mode=testMode;
    assert.throws(()=>native.buildReleaseManifest(fixture,manifest.verification),error=>
      !/private native|raw signature|private malformed/.test(error.message) && /Signed workflow differs|verification failed|only Shortcut|Invalid native/.test(error.message),
      'Neither existing nor caller-supplied proof may bypass native verification: '+mode);
  }
  mode='changed-during-decode';
  assert.throws(()=>native.buildReleaseManifest(fixture),/exact native verification attestation/,'Changed input during native decoding cannot be attested');
  writeFileSync(resolve(fixture,SIGNED_RELATIVE),signed);mode='valid';
  for(const change of [m=>m.version=1,m=>m.verification.workflowSha256='0'.repeat(64),m=>m.verification.signedSha256='0'.repeat(64),
    m=>m.verification.unsignedSha256='0'.repeat(64),m=>m.verification.sourcesSha256='0'.repeat(64),
    m=>m.verification.signatureVerified=false,m=>m.verification.trustChainVerified=true,m=>m.verification.extra='untrusted',m=>delete m.verification]) {
    const changed=structuredClone(manifest);change(changed);assert.throws(()=>validateReleaseManifest(changed,fixture),/exact native verification attestation/);
  }
  const differentSigned=Buffer.from(signed);differentSigned[31]=1;writeFileSync(resolve(fixture,SIGNED_RELATIVE),differentSigned);
  assert.throws(()=>validateReleaseManifest(manifest,fixture),/exact native verification attestation/);
  writeFileSync(resolve(fixture,SIGNED_RELATIVE),signed);
  writeFileSync(resolve(fixture,OUTPUT_RELATIVE),Buffer.concat([unsigned,Buffer.from('\n')]));
  assert.throws(()=>native.buildReleaseManifest(fixture),/unsigned artifact is stale/);
  assert.throws(()=>validateReleaseManifest(manifest,fixture),/unsigned artifact is stale/);
  writeFileSync(resolve(fixture,OUTPUT_RELATIVE),unsigned);
  const rulesPath=join(fixture,'js/smartlink-engine.js'),originalRules=readFileSync(rulesPath);
  writeFileSync(rulesPath,Buffer.concat([originalRules,Buffer.from('\n/* changed source */\n')]));
  writeFileSync(resolve(fixture,OUTPUT_RELATIVE),buildArtifact(fixture));
  assert.throws(()=>validateReleaseManifest(manifest,fixture),/exact native verification attestation/,'Current but changed engines require a new native attestation');
  writeFileSync(rulesPath,originalRules);writeFileSync(resolve(fixture,OUTPUT_RELATIVE),unsigned);

  for(const mutate of [w=>w.WFWorkflowActions.reverse(),w=>w.WFWorkflowActions[1].WFWorkflowActionParameters.WFLocalOnly=false,
    w=>w.WFWorkflowActions[3].WFWorkflowActionParameters.WFInput.Value.OutputUUID='different',w=>w.extra=true,
    w=>w.WFWorkflowHasOutputFallback=true,w=>w.WFWorkflowName='Different name']) {
    const changed=signedWorkflow();mutate(changed);assert.throws(()=>compareSignedWorkflow(expected,changed),/Signed workflow/);
  }
  // Mutation: returning a digest without comparing decoded workflows must fail this case.
  const mutantSource=injected.replace("if(!isDeepStrictEqual(left,right))throw new Error('Signed workflow differs from unsigned workflow');",'/* omitted comparison */');
  assert.notEqual(mutantSource,injected);const mutantPath=join(directory,'mutant.mjs');writeFileSync(mutantPath,mutantSource);
  const mutant=await import(pathToFileURL(mutantPath).href);mode='wrong-plist';
  assert.throws(()=>assert.throws(()=>mutant.buildReleaseManifest(fixture),/Signed workflow differs/),{code:'ERR_ASSERTION'},'Mutation: the real gate must reject a different decoded plist');
  mode='valid';
  // No network, signing or installation: verify the existing matching pair as files.
  if(process.platform==='darwin') {
    const proof=verifySignedWorkflow(readFileSync(resolve(REPO_ROOT,OUTPUT_RELATIVE)),readFileSync(resolve(REPO_ROOT,SIGNED_RELATIVE)));
    assert.equal(proof.signatureVerified,true);assert.equal(proof.trustChainVerified,false);
  } else {
    assert.throws(()=>verifySignedWorkflow(unsigned,signed),/requires macOS Apple Archive/,'Unavailable decoder cannot issue a proof');
  }
  console.log('Shortcut release gate: PASS (native boundary, exact plist, input drift, closed attestation, mutation; CI does not repeat native decoding)');
} finally {delete globalThis[marker];rmSync(directory,{recursive:true,force:true});}
