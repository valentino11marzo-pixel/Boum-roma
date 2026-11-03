import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse } from 'acorn';
import { buildWorkflow, buildArtifact, writeArtifact, IDS, MEDIA_IDS, ROOT, toPlist } from './experimental.mjs';
import { buildMergeSubset } from './merge-subset.mjs';
import { Clock, page, mergeCases } from './experimental-fixture.mjs';
import MEDIA from '../../js/smartlink-media-engine.js';
import SHARE from '../../js/smartlink-share-engine.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4f5YBAASbAc1Jyt1EAAAAAElFTkSuQmCC';
const name = action => action.WFWorkflowActionIdentifier.replace('is.workflow.actions.', '');
const clone = value => JSON.parse(JSON.stringify(value));
const get = (workflow, id) => workflow.WFWorkflowActions.find(action => action.WFWorkflowActionParameters.UUID === id).WFWorkflowActionParameters;
function structural(workflow) {
  const actions = workflow.WFWorkflowActions;
  assert.deepEqual(actions.map(name), ['runjavascriptonwebpage', 'detect.dictionary', 'getvalueforkey', 'repeat.count', 'delay', 'nothing', 'runjavascriptonwebpage', 'repeat.count', 'text.combine', 'gettext', 'nothing', 'runjavascriptonwebpage', 'detect.dictionary', 'getvalueforkey', 'repeat.each', 'downloadurl', 'base64encode', 'gettext', 'repeat.each', 'text.combine', 'gettext', 'setclipboard']);
  assert.deepEqual(workflow.WFWorkflowTypes, []);
  assert.deepEqual(workflow.WFWorkflowInputContentItemClasses, []);
  const scripts = actions.filter(action => name(action) === 'runjavascriptonwebpage');
  assert.equal(scripts.length, 3);
  for (const action of scripts) assert.equal('WFInput' in action.WFWorkflowActionParameters, false, 'Mac active Safari mode is explicit; no Number or Text Safari input');
  assert.equal(get(workflow, MEDIA_IDS.dictionary).WFInput.Value.OutputUUID, IDS.payload);
  assert.equal(actions[14].WFWorkflowActionParameters.WFInput.Value.OutputUUID, MEDIA_IDS.images);
  assert.equal(get(workflow, MEDIA_IDS.base64).WFInput.Value.OutputUUID, MEDIA_IDS.download);
  assert.equal(get(workflow, MEDIA_IDS.base64).WFBase64LineBreakMode, 'None');
  assert.equal(actions[21].WFWorkflowActionParameters.WFLocalOnly, true);
  assert.equal(actions[21].WFWorkflowActionParameters.WFInput.Value.OutputUUID, MEDIA_IDS.envelope);
  const envelopeRefs = Object.values(get(workflow, MEDIA_IDS.envelope).WFTextActionText.Value.attachmentsByRange);
  assert.deepEqual(envelopeRefs.map(ref => ref.OutputUUID), [IDS.payload, MEDIA_IDS.combined]);
  const merge = get(workflow, IDS.payload).WFJavaScript;
  assert.equal(merge.WFSerializationType, 'WFTextTokenString');
  assert.deepEqual(Object.values(merge.Value.attachmentsByRange).map(ref => ref.OutputUUID), [IDS.envelope]);
  const frameRefs = Object.values(get(workflow, IDS.frame).WFJavaScript.Value.attachmentsByRange);
  assert.equal(frameRefs[0].OutputUUID, IDS.plan);
  assert.deepEqual(frameRefs[1], { Type: 'Variable', VariableName: 'Repeat Index' });
  assert.equal(JSON.stringify(workflow).includes(png), false);
  assert.equal(JSON.stringify(workflow).includes('portal-import-qa.json'), false, 'Full dynamic artifact must not embed static QA input');
}

function simulate(workflow, { flattened = false, start = 1, pageOptions = {}, transformFrame, expectFailure = false } = {}) {
  const epoch = Date.parse('2026-11-03T12:00:00.000Z');
  const clock = new Clock(), browser = page(clock, { start, prices: [2450], ...pageOptions });
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [epoch + clock.now()])); } static now() { return epoch + clock.now(); } }
  const values = new Map(), variables = new Map(), gets = [];
  let clipboard, last, scriptCalls = 0, injected = 0;
  const expandedScriptBytes = {};
  function reference(ref) {
    if (ref.Type === 'ActionOutput') { assert(values.has(ref.OutputUUID)); return values.get(ref.OutputUUID); }
    if (ref.Type === 'Variable') { assert(variables.has(ref.VariableName)); return variables.get(ref.VariableName); }
    assert.fail('Unexpected native reference');
  }
  function resolve(value) {
    if (typeof value === 'string') return value;
    if (value.WFSerializationType === 'WFTextTokenAttachment') return reference(value.Value);
    assert.equal(value.WFSerializationType, 'WFTextTokenString');
    let text = value.Value.string;
    const refs = Object.entries(value.Value.attachmentsByRange).map(([range, ref]) => { const match = /^\{(\d+), 1\}$/.exec(range); assert(match); return [+match[1], ref]; }).sort((a, b) => b[0] - a[0]);
    for (const [offset, ref] of refs) {
      assert.equal(text[offset], '\uFFFC'); const replacement = reference(ref);
      assert(['string', 'number'].includes(typeof replacement), 'No implicit object/list serialization');
      text = text.slice(0, offset) + replacement + text.slice(offset + 1);
    }
    assert.equal(text.includes('\uFFFC'), false); return text;
  }
  function javascript(p) {
    if (p.UUID === IDS.frame || p.UUID === IDS.payload) assert.equal(last, null, 'Observed Mac chain clears the implicit input with Nothing before JavaScript');
    const source = resolve(p.WFJavaScript), outputs = [];
    expandedScriptBytes[p.UUID] = Math.max(expandedScriptBytes[p.UUID] || 0, Buffer.byteLength(source));
    const context = {
      document: browser.document, location: { href: browser.state.url }, URL, TextEncoder, Date: FixedDate, Map, Set, JSON,
      completion(output) { outputs.push(output); return 'completion-result'; },
      __boomInjected() { injected++; },
      fetch() { assert.fail('Network forbidden in page JavaScript'); },
      XMLHttpRequest() { assert.fail('Network forbidden in page JavaScript'); },
    };
    for (const key of ['window', 'localStorage', 'sessionStorage', 'navigator']) Object.defineProperty(context, key, { get() { throw new Error('Page global access forbidden: ' + key); } });
    const result = vm.runInNewContext(flattened ? source.replace(/\r\n?|\n/g, ' ') : source, context, { timeout: 1000 });
    assert.equal(result, 'completion-result'); assert.equal(outputs.length, 1, 'Exactly one outer callback per native JS action');
    scriptCalls++; last = outputs[0]; assert.equal(typeof last, 'string');
    if (p.UUID === IDS.frame && transformFrame) {
      const frame = JSON.parse(last); transformFrame(frame); last = JSON.stringify(frame);
    }
  }
  function run(actions) {
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index], p = action.WFWorkflowActionParameters, type = name(action);
      if (type === 'repeat.count' || type === 'repeat.each') {
        assert.equal(p.WFControlFlowMode, 0);
        const end = actions.findIndex((candidate, at) => at > index && name(candidate) === type && candidate.WFWorkflowActionParameters.WFControlFlowMode === 2 && candidate.WFWorkflowActionParameters.GroupingIdentifier === p.GroupingIdentifier);
        assert(end > index);
        const input = resolve(type === 'repeat.count' ? p.WFRepeatCount : p.WFInput);
        if (type === 'repeat.count') assert(Number.isSafeInteger(input) && input > 0 && input <= 89, 'No loop on an invalid plan');
        else assert(Array.isArray(input) && input.length > 0 && input.length <= 60, 'No photo downloads on an invalid merged payload');
        const items = type === 'repeat.count' ? Array.from({ length: input }, (_, i) => i + 1) : input;
        const results = [];
        for (let i = 0; i < items.length; i++) {
          variables.set('Repeat Index', i + 1); variables.set('Repeat Item', items[i]);
          run(actions.slice(index + 1, end)); results.push(last);
        }
        values.set(actions[end].WFWorkflowActionParameters.UUID, results); last = results; index = end; continue;
      }
      switch (type) {
        case 'runjavascriptonwebpage': javascript(p); break;
        case 'detect.dictionary': last = JSON.parse(resolve(p.WFInput)); break;
        case 'getvalueforkey': last = resolve(p.WFInput)[p.WFDictionaryKey]; break;
        case 'delay': assert.equal(p.WFDelayTime, 1); clock.advance(1000); break;
        case 'nothing': last = null; break;
        case 'text.combine': assert.equal(p.WFTextSeparator, 'Custom'); last = resolve(p.text).join(p.WFTextCustomSeparator); break;
        case 'gettext': last = resolve(p.WFTextActionText); break;
        case 'downloadurl': gets.push(resolve(p.WFURL)); last = Buffer.from(png, 'base64'); break;
        case 'base64encode': assert.equal(p.WFBase64LineBreakMode, 'None'); last = resolve(p.WFInput).toString('base64'); break;
        case 'setclipboard': assert.equal(p.WFLocalOnly, true); clipboard = resolve(p.WFInput); last = clipboard; break;
        default: assert.fail('Unexpected action: ' + type);
      }
      if (p.UUID) values.set(p.UUID, last);
    }
  }
  if (expectFailure) {
    assert.throws(() => run(workflow.WFWorkflowActions)); assert.equal(gets.length, 0); assert.equal(clipboard, undefined); assert.equal(injected, 0);
    return;
  }
  run(workflow.WFWorkflowActions);
  assert.equal(injected, 0, 'Captured title text must never execute as code');
  const result = MEDIA.validate(clipboard, epoch + clock.now()); assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.gallery, { expected: 15, found: 15 }); assert.equal(result.media.length, 15);
  assert.deepEqual(gets, result.images, 'Downloads preserve merged index order, including a gallery started in the middle');
  const payload = JSON.parse(clipboard).payload;
  const plan = JSON.parse(values.get(IDS.plan));
  assert.equal(payload.capturedAt, plan.capturedAt, 'Download time cannot refresh the original observation');
  assert.equal(payload.capturedAt, new Date(epoch).toISOString());
  assert.equal(scriptCalls, plan.count + 2);
  assert.equal(browser.clicks.length, plan.count - 1); assert.equal(browser.outside(), 0);
  return { result, clipboard, scriptCalls, plan, payload, expandedScriptBytes,
    frames: values.get(IDS.repeat).map(value=>JSON.parse(value)), now: epoch+clock.now() };
}

const { workflow } = buildWorkflow();
const representative = simulate(workflow);
structural(workflow);
let middle;
for (const flattened of [false, true]) for (const start of [1, 8, 15]) {
  const result=simulate(workflow, { flattened, start });
  if(!flattened && start===8) middle=result;
}
const hostile = [
  'Casa "quotata" e \'singola\' \\ fine',
  'Casa ` ${__boomInjected()} `',
  'Casa\nseconda riga\r\nterza\ttab',
  'Casa café 🏠 漢字 \u2028 separatore \u2029 fine',
  '"});__boomInjected();completion("pwned");/*',
  '</script><script>__boomInjected()</script>',
];
for (const title of hostile) for (const flattened of [false, true]) {
  const outcome = simulate(workflow, { flattened, transformFrame(frame) { frame.data.title = title; } });
  assert.equal(outcome.result.ok, true);
}
simulate(workflow, { expectFailure: true, transformFrame(frame) { frame.sourceUrl = 'https://www.idealista.it/immobile/999999999/'; } });
simulate(workflow, { expectFailure: true, pageOptions: { total: 61 } });
simulate(workflow, { expectFailure: true, pageOptions: { noProgress: true } });
let mutations = 0;
for (const mutate of [
  value => { get(value, MEDIA_IDS.dictionary).WFInput.Value.OutputUUID = IDS.envelope; },
  value => { value.WFWorkflowActions[10].WFWorkflowActionIdentifier = 'is.workflow.actions.delay'; },
  value => { get(value, MEDIA_IDS.base64).WFInput.Value.OutputUUID = IDS.payload; },
  value => { value.WFWorkflowActions[21].WFWorkflowActionParameters.WFLocalOnly = false; },
]) {
  const changed = clone(workflow); mutate(changed);
  assert.throws(() => { structural(changed); simulate(changed); }); mutations++;
}
const quotedInput = clone(workflow);
const merge = get(quotedInput, IDS.payload).WFJavaScript.Value;
const entries = Object.entries(merge.attachmentsByRange);
assert.equal(entries.length, 1);
const [range, reference] = entries[0], offset = Number(/^\{(\d+), 1\}$/.exec(range)[1]);
const before = "JSON.parse('", after = "')";
merge.string = merge.string.slice(0, offset) + before + '\uFFFC' + after + merge.string.slice(offset + 1);
merge.attachmentsByRange = { ['{' + (offset + before.length) + ', 1}']: reference };
simulate(quotedInput);
assert.throws(() => simulate(quotedInput, { transformFrame(frame) { frame.data.title = "Casa 'quoted' ` ${__boomInjected()} `"; } }), 'Raw JSON inside a quoted JavaScript string must fail the hostile-text regression');
mutations++;
const rulesSource=readFileSync(new URL('../../js/smartlink-engine.js',import.meta.url),'utf8');
const shareSource=readFileSync(new URL('../../js/smartlink-share-engine.js',import.meta.url),'utf8');
const subset=buildMergeSubset(rulesSource,shareSource);
const alteredInitializer=shareSource.replace("'use strict';","'use strict';const discardedEffect=globalThis.__boomSideEffect();");
assert.notEqual(alteredInitializer,shareSource);
assert.throws(()=>buildMergeSubset(rulesSource,alteredInitializer),/initializer must not remove effects/,'An initializer with effects cannot be silently removed');
const dynamicRules=shareSource.replace('RULES.photoUrl','RULES[\'photoUrl\']');
assert.notEqual(dynamicRules,shareSource);
assert.throws(()=>buildMergeSubset(rulesSource,dynamicRules),/static member access/,'Computed RULES access must not be guessed by the dependency closure');
const computedExport=shareSource.replace('const API={KIND,','const API={[\'KIND\']:KIND,');
assert.notEqual(computedExport,shareSource);
assert.throws(()=>buildMergeSubset(rulesSource,computedExport),{code:'ERR_ASSERTION'},'Computed exports require an explicit generator change');
function loadSubset(rules,share) {
  const context={window:{},URL,TextEncoder,Date,Map,Set,JSON};
  for(const key of ['document','location','fetch','XMLHttpRequest','localStorage','sessionStorage','navigator']) Object.defineProperty(context,key,{get(){throw new Error('Forbidden pure merge access: '+key);}});
  vm.runInNewContext(rules,context,{timeout:1000});
  vm.runInNewContext(share,context,{timeout:1000});
  return context.window.BOOM_SMARTLINK_SHARE;
}
const subsetApi=loadSubset(subset.rules,subset.share);
assert.equal(subsetApi.MAX_BYTES,SHARE.MAX_BYTES);
const carrier=sample=>({kind:SHARE.FRAMES_KIND,version:1,plan:sample.plan,frames:sample.frames});
const mergeScenarios=mergeCases(carrier(representative),carrier(middle),Math.max(representative.now,middle.now));
function compareMerge(api,scenario) {
  const complete=clone(SHARE.combineFrames(scenario.input,scenario.now));
  const reduced=clone(api.combineFrames(scenario.input,scenario.now));
  assert.deepEqual(reduced,complete,'Merge subset is semantically equivalent: '+scenario.name);
  assert.equal(reduced.ok,scenario.expected.ok,scenario.name);
  if(!scenario.expected.ok) assert.equal(reduced.error,scenario.expected.error,scenario.name);
  else {
    if(scenario.expected.gallery) assert.deepEqual(reduced.payload.gallery,scenario.expected.gallery,scenario.name);
    for(const [key,value] of Object.entries(scenario.expected.data || {})) assert.equal(reduced.payload.data[key],value,scenario.name);
  }
}
for(const scenario of mergeScenarios) compareMerge(subsetApi,scenario);
const subsetTree=parse(subset.share,{ecmaVersion:'latest',sourceType:'script'});
let omitted;
function findHelper(node) {
  if(!node || typeof node!=='object') return;
  if(node.type==='FunctionDeclaration' && node.id?.name==='galleryPhotoKey') omitted=node;
  for(const value of Object.values(node)) if(Array.isArray(value)) value.forEach(findHelper); else if(value && typeof value==='object') findHelper(value);
}
findHelper(subsetTree);
assert(omitted,'The retained dependency needed by photo ownership must be present');
const missingHelper=loadSubset(subset.rules,subset.share.slice(0,omitted.start)+subset.share.slice(omitted.end));
assert.deepEqual(clone(missingHelper.combineFrames(mergeScenarios[0].input,mergeScenarios[0].now)),{ok:false,error:'invalid_payload'},'A missing helper fails closed with a precise diagnostic');
assert.throws(()=>compareMerge(missingHelper,mergeScenarios[0]),/semantically equivalent/,'The semantic suite catches an omitted transitive helper');
mutations++;
const artifact = buildArtifact();
assert.deepEqual(artifact.workflow, workflow);
assert.equal(artifact.xml, toPlist(workflow));
assert.equal(artifact.xml, buildArtifact().xml, 'Experimental artifact is reproducible');
assert.equal(artifact.metadata.artifact.bytes, Buffer.byteLength(artifact.xml));
assert.equal(artifact.metadata.artifact.sha256, createHash('sha256').update(artifact.xml).digest('hex'));
if (process.platform === 'darwin') {
  const roundtrip = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: artifact.xml, encoding: 'utf8', maxBuffer: 1024 * 1024 }));
  assert.deepEqual(roundtrip, workflow, 'Native plist parsing preserves UTF16 token offsets and every action reference');
  structural(roundtrip); simulate(roundtrip, { flattened: true });
}
const outputDirectory = mkdtempSync(join(tmpdir(), 'boom-shortcut-experimental-'));
const publishedDirectory = join(ROOT, 'assets', 'tools');
const directName = 'experimental-guard-' + randomUUID() + '.unsigned.shortcut';
const linkedName = 'experimental-guard-' + randomUUID() + '.unsigned.shortcut';
const publishedTargets = [join(publishedDirectory, directName), join(publishedDirectory, linkedName)];
try {
  const outputPath = join(outputDirectory, 'qa.unsigned.shortcut');
  assert.deepEqual(writeArtifact(outputPath), artifact.metadata);
  assert.equal(readFileSync(outputPath, 'utf8'), artifact.xml);
  assert.throws(() => writeArtifact(outputPath), /EEXIST/, 'An existing artifact must never be replaced');
  assert.throws(() => writeArtifact(join(outputDirectory, 'qa.shortcut')), /unsigned/, 'No output with an installable release name');
  assert.throws(() => writeArtifact(publishedTargets[0]), /outside published assets\/tools/, 'Reject even a new unsigned filename inside the published directory');
  const linkedDirectory = join(outputDirectory, 'published-assets');
  symlinkSync(publishedDirectory, linkedDirectory, 'dir');
  assert.throws(() => writeArtifact(join(linkedDirectory, linkedName)), /outside published assets\/tools/, 'Resolve the parent directory before rejecting a symlink into published assets');
  for (const path of publishedTargets) assert.equal(existsSync(path), false, 'Rejected outputs must not create a published file');
} finally {
  /* In a regression, remove only the two UUID files owned by this test. */
  for (const path of publishedTargets) rmSync(path, { force: true });
  rmSync(outputDirectory, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, actions: workflow.WFWorkflowActions.length, fullGalleryScenarios: 6, hostileStringScenarios: 12, errorScenariosWithZeroDownloads: 3, mergeEquivalenceScenarios: mergeScenarios.length, mutations, callbacksOnce: true, originalPlanDatePreserved: true, astEquivalent: true, expandedScriptBytes: { plan: representative.expandedScriptBytes[IDS.plan], frame: representative.expandedScriptBytes[IDS.frame], merge: representative.expandedScriptBytes[IDS.payload] }, networkRequests: 0, nativeExecuted: false }));
