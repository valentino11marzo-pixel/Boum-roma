// Pacchetto statico: nessuna dipendenza, download o esecuzione di Comandi Rapidi.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUTPUT_RELATIVE = 'assets/tools/boom-smartlink-safari-1.0.0.unsigned.shortcut';
export const SIGNED_RELATIVE = 'assets/tools/boom-smartlink-safari.shortcut';
export const MANIFEST_RELATIVE = 'tools/smartlink-shortcut/release.json';
export const PORTAL_URL = 'https://www.boomrome.com/portal?smartlink-share=1#boom-tools';
export const CAPTURE_ERRORS = Object.freeze([
  'invalid_payload', 'payload_too_large', 'unsupported_listing_url', 'source_mismatch',
  'invalid_capture_date', 'invalid_data', 'invalid_photo_url', 'too_many_photos',
  'invalid_gallery', 'photos_not_found', 'capture_unavailable',
]);
const failure = error => JSON.stringify({kind:'boom.smartlink.share',version:1,error});
const sha256 = source => createHash('sha256').update(source).digest('hex');

export function buildCaptureScript(rulesSource, shareSource) {
  for (const [name, source] of [['rules', rulesSource], ['share', shareSource]]) {
    if (/^[ \t]*\/\//m.test(source)) throw new Error(`Shortcut ${name} source must use block comments, not line comments`);
  }
  // I due UMD hanno un root locale: non leggono eventuali omonimi della pagina.
  // Il callback esterno conserva anche il valore dell'espressione finale: compatibilità
  // osservata con l'azione Safari sul Mac, senza cambiare il payload o il suo isolamento.
  return `completion((function () {
  'use strict';
  let output = ${JSON.stringify(failure('capture_unavailable'))};
  try {
    const window = Object.create(null);
    const module = undefined;
/* js/smartlink-engine.js sha256:${sha256(rulesSource)} */
${rulesSource}
/* js/smartlink-share-engine.js sha256:${sha256(shareSource)} */
${shareSource}
    const api = window.BOOM_SMARTLINK_SHARE;
    const result = api.capture(document, location.href);
    if (result && result.ok === true) {
      const serialized = JSON.stringify(result.payload);
      if (typeof serialized === 'string') {
        output = new TextEncoder().encode(serialized).length <= api.MAX_BYTES
          ? serialized : ${JSON.stringify(failure('payload_too_large'))};
      }
    } else if (result && ${JSON.stringify(CAPTURE_ERRORS)}.includes(result.error)) {
      output = JSON.stringify({kind:'boom.smartlink.share',version:1,error:result.error});
    }
  } catch (_) {
    /* La diagnostica non include eccezioni, HTML o altri dati della pagina. */
  }
  return output;
})());
`;
}

export function buildWorkflow(rulesSource, shareSource) {
  const javascriptId='2C72F043-4E2D-4635-851B-12AB70D6E6D1';
  const portalUrlId='8C2B0387-07FC-4E49-B37E-92AD916D792E';
  const action = (name, parameters = {}) => ({
    WFWorkflowActionIdentifier:'is.workflow.actions.' + name,
    WFWorkflowActionParameters:parameters,
  });
  const output = (uuid, name) => ({
    Value:{Type:'ActionOutput',OutputUUID:uuid,OutputName:name},
    WFSerializationType:'WFTextTokenAttachment',
  });
  return {
    WFWorkflowName:'Crea SmartLink BOOM',
    // Metadato del formato, fissato per una build riproducibile (Shortcuts macOS locale).
    WFWorkflowClientVersion:'3612.0.2.1',
    WFWorkflowMinimumClientVersion:900,
    WFWorkflowMinimumClientVersionString:'900',
    WFWorkflowIcon:{WFWorkflowIconStartColor:4260881663,WFWorkflowIconGlyphNumber:59511},
    WFWorkflowTypes:['ActionExtension'],
    WFWorkflowInputContentItemClasses:['WFSafariWebPageContentItem'],
    WFWorkflowImportQuestions:[],
    WFWorkflowActions:[
      // Mantiene la pagina condivisa su iOS / il pannello Safari attivo su Mac.
      action('runjavascriptonwebpage',{UUID:javascriptId,WFJavaScript:buildCaptureScript(rulesSource,shareSource)}),
      action('setclipboard',{WFInput:output(javascriptId,'JavaScript Result'),WFLocalOnly:true}),
      // Ogni consumer ha un collegamento esplicito: mai affidarsi all'azione precedente.
      action('url',{UUID:portalUrlId,WFURLActionURL:PORTAL_URL}),
      action('openurl',{WFInput:output(portalUrlId,'URL')}),
    ],
  };
}

const escapeXml = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function plistValue(value, level = 0) {
  const pad = '  '.repeat(level);
  if (typeof value === 'string') return `${pad}<string>${escapeXml(value)}</string>`;
  if (typeof value === 'boolean') return `${pad}<${value}/>`;
  if (Number.isSafeInteger(value)) return `${pad}<integer>${value}</integer>`;
  if (Array.isArray(value)) return value.length ? `${pad}<array>\n${value.map(item=>plistValue(item,level+1)).join('\n')}\n${pad}</array>` : `${pad}<array/>`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? `${pad}<dict>\n${entries.map(([key,item])=>`${pad}  <key>${escapeXml(key)}</key>\n${plistValue(item,level+1)}`).join('\n')}\n${pad}</dict>` : `${pad}<dict/>`;
  }
  throw new TypeError('Unsupported plist value');
}
export function toPlist(workflow) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${plistValue(workflow)}\n</plist>\n`;
}
export function buildArtifact(repoRoot = REPO_ROOT) {
  const rulesSource = readFileSync(resolve(repoRoot,'js/smartlink-engine.js'),'utf8');
  const shareSource = readFileSync(resolve(repoRoot,'js/smartlink-share-engine.js'),'utf8');
  return toPlist(buildWorkflow(rulesSource,shareSource));
}
const canonical = value => JSON.stringify(value && typeof value==='object'
  ? Array.isArray(value) ? value.map(item=>JSON.parse(canonical(item)))
    : Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))]))
  : value);
const verificationMethod='apple-archive-exact-plist-v1';
const signerDefaults={WFQuickActionSurfaces:[],WFWorkflowOutputContentItemClasses:[],WFWorkflowHasShortcutInputVariables:false,WFWorkflowHasOutputFallback:false};
const workflowDigest = workflow => {
  const value=structuredClone(workflow);delete value.WFWorkflowName;
  return sha256(canonical(value));
};
export function compareSignedWorkflow(expected,actual) {
  if(!expected || !actual || typeof expected!=='object' || typeof actual!=='object' || Array.isArray(expected) || Array.isArray(actual))throw new Error('Signed workflow must be a plist dictionary');
  const left=structuredClone(expected),right=structuredClone(actual);
  // These are the only normalizations observed in the official signer output.
  if(!Object.hasOwn(right,'WFWorkflowName'))delete left.WFWorkflowName;
  for(const [key,value] of Object.entries(signerDefaults))if(!Object.hasOwn(left,key) && Object.hasOwn(right,key)) {
    if(!isDeepStrictEqual(right[key],value))throw new Error('Signed workflow has unexpected signer settings');
    delete right[key];
  }
  if(!isDeepStrictEqual(left,right))throw new Error('Signed workflow differs from unsigned workflow');
  return workflowDigest(expected);
}
export function verifySignedWorkflow(unsigned,signed) {
  if(process.platform!=='darwin')throw new Error('Native signed-workflow verification requires macOS Apple Archive and plutil; no manifest was generated');
  if(signed.length<12 || signed.length>4000000 || signed.subarray(0,4).toString('ascii')!=='AEA1' || signed.readUInt32LE(4)!==0)
    throw new Error('Invalid signed AEA profile');
  const metadataSize=signed.readUInt32LE(8);
  if(!metadataSize || metadataSize>65536 || 12+metadataSize>=signed.length)throw new Error('Invalid signed AEA metadata');
  const directory=mkdtempSync(resolve(tmpdir(),'boom-shortcut-verify-'));
  const file=name=>resolve(directory,name);
  const run=(phase,tool,args,input)=>{
    try{return execFileSync(tool,args,{input,encoding:'utf8',timeout:15000,maxBuffer:2000000,stdio:['pipe','pipe','pipe']});}
    catch{throw new Error('Native signed-workflow verification failed: '+phase);}
  };
  const json=(phase,value)=>{try{return JSON.parse(value);}catch{throw new Error('Invalid native '+phase);}};
  try {
    writeFileSync(file('signed.shortcut'),signed);writeFileSync(file('unsigned.plist'),unsigned);
    const certificate=run('signer certificate','/usr/bin/plutil',['-extract','SigningCertificateChain.0','raw','-expect','data','-o','-','-'],signed.subarray(12,12+metadataSize)).trim();
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(certificate) || certificate.length>16384 || Buffer.from(certificate,'base64').toString('base64')!==certificate)throw new Error('Invalid embedded signer certificate');
    writeFileSync(file('signer.der'),Buffer.from(certificate,'base64'));
    const publicKey=run('signer public key','/usr/bin/openssl',['x509','-inform','DER','-in',file('signer.der'),'-pubkey','-noout']);
    writeFileSync(file('signer.pem'),publicKey);
    run('AEA signature','/usr/bin/aea',['decrypt','-i',file('signed.shortcut'),'-o',file('archive.aar'),'-sign-pub',file('signer.pem')]);
    const entries=json('archive listing',run('archive listing','/usr/bin/aa',['list','-i',file('archive.aar'),'-list-format','json']));
    if(!Array.isArray(entries) || entries.length!==2 || entries.filter(entry=>entry.TYP==='D' && entry.PAT==='').length!==1 ||
      entries.filter(entry=>entry.TYP==='F' && entry.PAT==='Shortcut.wflow' && Number.isSafeInteger(entry.DAT) && entry.DAT>0 && entry.DAT<=2000000).length!==1)
      throw new Error('Signed archive must contain only Shortcut.wflow');
    run('archive extraction','/usr/bin/aa',['extract','-i',file('archive.aar'),'-d',directory,'-include-path','Shortcut.wflow']);
    const decode=path=>json('workflow plist',run('workflow plist','/usr/bin/plutil',['-convert','json','-o','-',path]));
    return {method:verificationMethod,unsignedSha256:sha256(unsigned),signedSha256:sha256(signed),
      workflowSha256:compareSignedWorkflow(decode(file('unsigned.plist')),decode(file('Shortcut.wflow'))),
      signatureVerified:true,trustChainVerified:false};
  } finally {rmSync(directory,{recursive:true,force:true});}
}
function releaseInputs(repoRoot) {
  const sourceFiles=['js/smartlink-engine.js','js/smartlink-share-engine.js'].map(path=>({path,bytes:readFileSync(resolve(repoRoot,path))}));
  const workflow=buildWorkflow(...sourceFiles.map(source=>source.bytes.toString('utf8')));
  const unsigned = readFileSync(resolve(repoRoot,OUTPUT_RELATIVE));
  if (unsigned.toString('utf8') !== toPlist(workflow)) throw new Error('Cannot record release: unsigned artifact is stale');
  const signed = readFileSync(resolve(repoRoot,SIGNED_RELATIVE));
  if (signed.subarray(0,4).toString('ascii') !== 'AEA1') throw new Error('Cannot record release: signed artifact has no AEA1 header');
  return {unsigned,signed,workflow,manifest:{
    version:2,
    name:'Crea SmartLink BOOM',
    unsigned:{path:OUTPUT_RELATIVE,sha256:sha256(unsigned)},
    signed:{path:SIGNED_RELATIVE,sha256:sha256(signed)},
    sources:sourceFiles.map(({path,bytes})=>({path,sha256:sha256(bytes)})),
  }};
}
export function buildReleaseManifest(repoRoot = REPO_ROOT) {
  const {unsigned,signed,manifest}=releaseInputs(repoRoot);
  const verification=verifySignedWorkflow(unsigned,signed);
  const result={...manifest,verification:{...verification,sourcesSha256:sha256(canonical(manifest.sources))}};
  validateReleaseManifest(result,repoRoot); // Fail if inputs changed while the decoder ran.
  return result;
}
export function validateReleaseManifest(manifest,repoRoot = REPO_ROOT) {
  // CI checks the reviewed native attestation against these exact inputs. It does
  // not claim to repeat Apple's decoder or independently establish Apple trust.
  const {unsigned,signed,workflow,manifest:current}=releaseInputs(repoRoot);
  const expected={...current,verification:{method:verificationMethod,unsignedSha256:sha256(unsigned),signedSha256:sha256(signed),
    workflowSha256:workflowDigest(workflow),signatureVerified:true,trustChainVerified:false,sourcesSha256:sha256(canonical(current.sources))}};
  if(!isDeepStrictEqual(manifest,expected))throw new Error('Release manifest needs an exact native verification attestation for the current files');
  return {attestationMatchesCurrentFiles:true,nativeDecoderRun:false,trustChainVerified:false};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && ['--check','--manifest'].includes(args[0]))) throw new Error('Usage: node tools/smartlink-shortcut/build.mjs [--check|--manifest]');
  const artifact = buildArtifact(), output = resolve(REPO_ROOT,OUTPUT_RELATIVE);
  if (args[0] === '--manifest') {
    writeFileSync(resolve(REPO_ROOT,MANIFEST_RELATIVE),JSON.stringify(buildReleaseManifest(),null,2)+'\n');
    console.log(`SmartLink Shortcut release manifest: ${MANIFEST_RELATIVE}`);
  } else if (args[0] === '--check') {
    if (readFileSync(output,'utf8') !== artifact) throw new Error('Shortcut artifact is stale: run node tools/smartlink-shortcut/build.mjs');
    console.log('SmartLink Shortcut artifact: current');
  } else {
    writeFileSync(output,artifact);
    console.log(`SmartLink Shortcut unsigned: ${OUTPUT_RELATIVE} (${Buffer.byteLength(artifact)} bytes)`);
  }
}
