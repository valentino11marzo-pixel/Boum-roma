/* Prototipo Mac: build pura e riproducibile, separata dal comando distribuito. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
import escodegen from 'escodegen';
import {CAPTURE_ERRORS,toPlist} from './build.mjs';
import {buildMergeSubset} from './merge-subset.mjs';

export {toPlist};
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
export const IDS=Object.freeze(Object.fromEntries(['plan','dictionary','count','group','frame','repeat','combined','envelope','payload']
  .map((name,index)=>[name,'CFA58481-98D5-4FD2-A43E-'+String(index+1).padStart(12,'0')])));
export const MEDIA_IDS=Object.freeze(Object.fromEntries(['dictionary','images','group','download','base64','item','repeat','combined','envelope']
  .map((name,index)=>[name,'F5203818-75A4-46C8-966E-'+String(index+1).padStart(12,'0')])));
const outputRef=(uuid,name)=>({Type:'ActionOutput',OutputUUID:uuid,OutputName:name});
const attachment=Value=>({Value,WFSerializationType:'WFTextTokenAttachment'});
const output=(uuid,name)=>attachment(outputRef(uuid,name));
const action=(name,parameters)=>({WFWorkflowActionIdentifier:'is.workflow.actions.'+name,WFWorkflowActionParameters:parameters});
const variable=name=>({Type:'Variable',VariableName:name});
const diagnostic=error=>JSON.stringify({kind:'boom.smartlink.share',version:1,error});
export function tokenText(parts) {
  let string='';const attachmentsByRange={};
  for(const part of parts) {
    if(typeof part==='string')string+=part;
    else {attachmentsByRange['{'+string.length+', 1}']=part;string+='\uFFFC';}
  }
  return {Value:{string,attachmentsByRange},WFSerializationType:'WFTextTokenString'};
}
const ast=source=>parse(source,{ecmaVersion:'latest',sourceType:'script'});
const shape=value=>JSON.parse(JSON.stringify(value,(key,value)=>['start','end','raw'].includes(key)?undefined:value));
export function compact(source) {
  const before=ast(source);
  const printed=escodegen.generate(before,{comment:false,format:{compact:true,semicolons:true,parentheses:true,escapeless:false}})+'\n';
  assert.deepEqual(shape(ast(printed)),shape(before),'Compaction must preserve the JavaScript AST');
  return printed;
}
function compactToken(value,label) {
  const refs=Object.entries(value.Value.attachmentsByRange).map(([range,ref],index)=>{
    const match=/^\{(\d+), 1\}$/.exec(range);assert.ok(match,'Native token uses a UTF16 NSRange');
    const at=Number(match[1]);assert.equal(value.Value.string[at],'\uFFFC');
    return {at,ref,name:'__BOOM_'+label+'_'+index+'__'};
  }).sort((a,b)=>a.at-b.at);
  let source=value.Value.string;
  for(const ref of refs.slice().reverse())source=source.slice(0,ref.at)+ref.name+source.slice(ref.at+1);
  const printed=compact(source);
  const positions=refs.map(ref=>{
    const at=printed.indexOf(ref.name);assert.ok(at>=0);assert.equal(printed.indexOf(ref.name,at+1),-1,'One placeholder per bound native value');
    return {...ref,at};
  }).sort((a,b)=>a.at-b.at);
  const parts=[];let cursor=0;
  for(const ref of positions){parts.push(printed.slice(cursor,ref.at),ref.ref);cursor=ref.at+ref.name.length;}
  parts.push(printed.slice(cursor));
  return {native:tokenText(parts),template:printed};
}
function wrapper(rules,share,call,member,{safeUrls=false}={}) {
  return tokenText([`completion((function(){
'use strict';
let output=${JSON.stringify(diagnostic('capture_unavailable'))};
try {
const window=Object.create(null);
const module=undefined;
${rules}
${share}
const api=window.BOOM_SMARTLINK_SHARE;
const result=`,...call,`;
if(result && result.ok===true) {
const serialized=JSON.stringify(result.${member});
${safeUrls?`if(!result.payload.images.every(url=>typeof url==='string' && JSON.stringify(url).slice(1,-1)===url)) {
output=${JSON.stringify(diagnostic('invalid_photo_url'))};
} else `:''}if(typeof serialized==='string') output=new TextEncoder().encode(serialized).length<=api.MAX_BYTES?serialized:${JSON.stringify(diagnostic('payload_too_large'))};
} else if(result && ${JSON.stringify(CAPTURE_ERRORS)}.includes(result.error)) {
output=JSON.stringify({kind:'boom.smartlink.share',version:1,error:result.error});
}
} catch (_) { /* Closed diagnostics never copy page details. */ }
return output;
})());`]);
}
export function buildWorkflow() {
  const rules=readFileSync(resolve(ROOT,'js/smartlink-engine.js'),'utf8');
  const share=readFileSync(resolve(ROOT,'js/smartlink-share-engine.js'),'utf8');
  const plan=compact(wrapper(rules,share,['api.capturePlan(document,location.href)'],'plan').Value.string);
  const frame=compactToken(wrapper(rules,share,['api.captureFrame(document,location.href,(',outputRef(IDS.plan,'JavaScript Result'),'),Number(',variable('Repeat Index'),'))'],'frame'),'FRAME');
  const subset=buildMergeSubset(rules,share);
  const merge=compactToken(wrapper(subset.rules,subset.share,['api.combineFrames((',outputRef(IDS.envelope,'Text'),'))'],'payload',{safeUrls:true}),'MERGE');
  const frames=tokenText(['{"kind":"boom.smartlink.share.frames","version":1,"plan":',outputRef(IDS.plan,'JavaScript Result'),',"frames":[',outputRef(IDS.combined,'Combined Text'),']}']);
  const mediaItem=tokenText(['{"index":',variable('Repeat Index'),',"url":"',variable('Repeat Item'),'","base64":"',outputRef(MEDIA_IDS.base64,'Base64'),'"}']);
  const media=tokenText(['{"kind":"boom.smartlink.share.media","version":1,"payload":',outputRef(IDS.payload,'JavaScript Result'),',"images":[',outputRef(MEDIA_IDS.combined,'Combined Text'),']}']);
  const workflow={
    WFWorkflowName:'BOOM — QA Safari e foto native',
    WFWorkflowClientVersion:'3612.0.2.1',WFWorkflowMinimumClientVersion:900,WFWorkflowMinimumClientVersionString:'900',
    WFWorkflowIcon:{WFWorkflowIconStartColor:4260881663,WFWorkflowIconGlyphNumber:59511},
    WFWorkflowTypes:[],WFWorkflowInputContentItemClasses:[],WFWorkflowImportQuestions:[],
    WFWorkflowActions:[
      action('runjavascriptonwebpage',{UUID:IDS.plan,WFJavaScript:plan}),
      action('detect.dictionary',{UUID:IDS.dictionary,WFInput:output(IDS.plan,'JavaScript Result')}),
      action('getvalueforkey',{UUID:IDS.count,WFGetDictionaryValueType:'Value',WFDictionaryKey:'count',WFInput:output(IDS.dictionary,'Dictionary')}),
      action('repeat.count',{GroupingIdentifier:IDS.group,WFControlFlowMode:0,WFRepeatCount:output(IDS.count,'Dictionary Value')}),
      action('delay',{WFDelayTime:1}),
      action('nothing',{}),
      action('runjavascriptonwebpage',{UUID:IDS.frame,WFJavaScript:frame.native}),
      action('repeat.count',{GroupingIdentifier:IDS.group,WFControlFlowMode:2,UUID:IDS.repeat}),
      action('text.combine',{UUID:IDS.combined,text:output(IDS.repeat,'Repeat Results'),WFTextSeparator:'Custom',WFTextCustomSeparator:','}),
      action('gettext',{UUID:IDS.envelope,WFTextActionText:frames}),
      action('nothing',{}),
      action('runjavascriptonwebpage',{UUID:IDS.payload,WFJavaScript:merge.native}),
      action('detect.dictionary',{UUID:MEDIA_IDS.dictionary,WFInput:output(IDS.payload,'JavaScript Result')}),
      action('getvalueforkey',{UUID:MEDIA_IDS.images,WFGetDictionaryValueType:'Value',WFDictionaryKey:'images',WFInput:output(MEDIA_IDS.dictionary,'Dictionary')}),
      action('repeat.each',{GroupingIdentifier:MEDIA_IDS.group,WFControlFlowMode:0,WFInput:output(MEDIA_IDS.images,'Dictionary Value')}),
      action('downloadurl',{UUID:MEDIA_IDS.download,WFURL:tokenText([variable('Repeat Item')])}),
      action('base64encode',{UUID:MEDIA_IDS.base64,WFInput:output(MEDIA_IDS.download,'Contenuti URL'),WFBase64LineBreakMode:'None'}),
      action('gettext',{UUID:MEDIA_IDS.item,WFTextActionText:mediaItem}),
      action('repeat.each',{GroupingIdentifier:MEDIA_IDS.group,WFControlFlowMode:2,UUID:MEDIA_IDS.repeat}),
      action('text.combine',{UUID:MEDIA_IDS.combined,text:output(MEDIA_IDS.repeat,'Repeat Results'),WFTextSeparator:'Custom',WFTextCustomSeparator:','}),
      action('gettext',{UUID:MEDIA_IDS.envelope,WFTextActionText:media}),
      action('setclipboard',{WFLocalOnly:true,WFInput:output(MEDIA_IDS.envelope,'Text')}),
    ],
  };
  return {workflow,scripts:[{name:'plan',text:plan},{name:'frame',text:frame.template},{name:'merge',text:merge.template}]};
}
export function buildArtifact() {
  const {workflow,scripts}=buildWorkflow(),xml=toPlist(workflow);
  return {workflow,xml,metadata:{experimental:true,mode:'mac-active',actions:workflow.WFWorkflowActions.length,
    artifact:{bytes:Buffer.byteLength(xml),sha256:sha(xml)},
    compilers:{acorn:require('acorn/package.json').version,escodegen:require('escodegen/package.json').version},
    scripts:scripts.map(({name,text})=>({name,bytes:Buffer.byteLength(text),sha256:sha(text)})),
    sources:['js/smartlink-engine.js','js/smartlink-share-engine.js','js/smartlink-media-engine.js'].map(path=>({path,sha256:sha(readFileSync(resolve(ROOT,path)))})),
    nativeExecuted:false,iPhoneVerified:false}};
}
export function writeArtifact(outputPath) {
  const destination=resolve(outputPath),published=realpathSync(resolve(ROOT,'assets/tools'));
  const parent=realpathSync(dirname(destination)),where=relative(published,parent);
  if(!destination.endsWith('.unsigned.shortcut') || where==='' || (!where.startsWith('..'+sep) && where!=='..' && !where.startsWith(sep)))
    throw new Error('Use an explicit .unsigned.shortcut path outside published assets/tools');
  const result=buildArtifact();writeFileSync(destination,result.xml,{flag:'wx'});return result.metadata;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length===0)console.log(JSON.stringify(buildArtifact().metadata,null,2));
  else if(args.length===2 && args[0]==='--output')console.log(JSON.stringify(writeArtifact(args[1]),null,2));
  else throw new Error('Usage: node tools/smartlink-shortcut/experimental.mjs [--output /path/name.unsigned.shortcut]');
}
