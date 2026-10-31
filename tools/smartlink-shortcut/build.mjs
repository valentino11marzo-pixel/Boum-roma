// Pacchetto statico: nessuna dipendenza, download o esecuzione di Comandi Rapidi.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // I due UMD hanno un root locale: non leggono eventuali omonimi della pagina.
  // completion è fuori dal try: viene invocata una volta anche in caso di errore.
  return `(function () {
  'use strict';
  let output = ${JSON.stringify(failure('capture_unavailable'))};
  try {
    const window = Object.create(null);
    const module = undefined;
// js/smartlink-engine.js sha256:${sha256(rulesSource)}
${rulesSource}
// js/smartlink-share-engine.js sha256:${sha256(shareSource)}
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
    // La diagnostica non include eccezioni, HTML o altri dati della pagina.
  }
  completion(output);
})();
`;
}

export function buildWorkflow(rulesSource, shareSource) {
  const action = (name, parameters = {}) => ({
    WFWorkflowActionIdentifier:'is.workflow.actions.' + name,
    WFWorkflowActionParameters:parameters,
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
      // Il primo input è la pagina Safari condivisa; i successivi sono l'output precedente.
      action('runjavascriptonwebpage',{WFJavaScript:buildCaptureScript(rulesSource,shareSource)}),
      action('setclipboard',{WFLocalOnly:true}),
      // La URL costante interrompe il flusso dati verso Apri URL: niente payload nella URL.
      action('url',{WFURLActionURL:PORTAL_URL}),
      action('openurl'),
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
export function buildReleaseManifest(repoRoot = REPO_ROOT) {
  const unsigned = readFileSync(resolve(repoRoot,OUTPUT_RELATIVE));
  if (unsigned.toString('utf8') !== buildArtifact(repoRoot)) throw new Error('Cannot record release: unsigned artifact is stale');
  const signed = readFileSync(resolve(repoRoot,SIGNED_RELATIVE));
  if (signed.subarray(0,4).toString('ascii') !== 'AEA1') throw new Error('Cannot record release: signed artifact has no AEA1 header');
  return {
    version:1,
    name:'Crea SmartLink BOOM',
    unsigned:{path:OUTPUT_RELATIVE,sha256:sha256(unsigned)},
    signed:{path:SIGNED_RELATIVE,sha256:sha256(signed)},
    sources:['js/smartlink-engine.js','js/smartlink-share-engine.js'].map(path=>({path,sha256:sha256(readFileSync(resolve(repoRoot,path)))})),
  };
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
