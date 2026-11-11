import {readFileSync} from 'node:fs';
import RULES from '../../js/smartlink-engine.js';
import SHARE from '../../js/smartlink-share-engine.js';

const engines=['smartlink-engine.js','smartlink-share-engine.js'].map(name=>readFileSync(new URL('../../js/'+name,import.meta.url),'utf8')).join('\n');
const failed=error=>error==='source_mismatch' || error==='unsupported_listing_url'
  ? {status:'needs_attention',error:'source_changed'}
  : {status:'unavailable',error:error==='capture_unavailable'?'reader_error':'photos_not_found'};

/* Static local code, isolated exports; never page-provided globals or remote code. */
function invoke(page,operation,...args) {
  return page.evaluate(`(() => { 'use strict'; const window=Object.create(null),module=undefined;\n${engines}\nreturn (${operation.toString()})(window.BOOM_SMARTLINK_SHARE,window.BOOM_SMARTLINK,...${JSON.stringify(args)}); })()`);
}

function prepare(SHARE,RULES,sourceUrl) {
  if(document.querySelectorAll('#gallery').length) return {ok:true};
  if(RULES.normalizeUrl(location.href)?.url!==sourceUrl) return {ok:false,error:'source_mismatch'};
  const checked=SHARE.capture(document,location.href);
  if(!checked.ok && checked.error!=='photos_not_found') return checked;
  if(checked.ok && checked.payload.sourceUrl!==sourceUrl) return {ok:false,error:'source_mismatch'};
  const buttons=Array.from(document.querySelectorAll('button[aria-label]')).filter(button=>/^[1-9]\d* foto$/.test(button.getAttribute('aria-label') || ''));
  if(buttons.length!==1) return {ok:false,error:'invalid_gallery'};
  const button=buttons[0],total=Number(button.getAttribute('aria-label').split(' ')[0]);
  if(!Number.isSafeInteger(total) || total>RULES.MAX_PHOTOS || button.disabled || button.getAttribute('aria-disabled')==='true') return {ok:false,error:'invalid_gallery'};
  button.click();
  return {ok:true,opened:true};
}

/* Readiness is not validation: capturePlan/captureFrame recheck the entire document. */
function visibleFrame(expected) {
  const roots=document.querySelectorAll('#gallery');
  if(roots.length!==1) return false;
  const counters=roots[0].querySelectorAll('[data-testid="gallery-counter"]');
  const match=counters.length===1 && counters[0].textContent.trim().match(/^([1-9]\d*)\s*\/\s*([1-9]\d*)$/);
  if(!match || expected && (Number(match[1])!==expected.index || Number(match[2])!==expected.total)) return false;
  const images=roots[0].querySelectorAll('.image-gallery-slide.center figure.item-gallery picture img');
  return images.length===1 && images[0].complete && images[0].naturalWidth>0;
}

/* The caller already navigated and rejected HTTP/challenge pages. No navigation or retries here. */
export async function readIdealista(page,url) {
  const source=RULES.normalizeUrl(url);
  if(source?.source!=='Idealista' || source.url!==url) return failed('unsupported_listing_url');
  try {
    let result=await invoke(page,prepare,source.url);
    if(!result.ok) return failed(result.error);
    await page.waitForFunction(visibleFrame,null,{timeout:8000});
    result=await invoke(page,(SHARE)=>SHARE.capturePlan(document,location.href));
    if(!result.ok) return failed(result.error);
    const plan=result.plan;
    if(plan.sourceUrl!==source.url) return failed('source_mismatch');
    const frames=[];
    for(let step=1;step<=plan.count;step++) {
      await page.waitForFunction(visibleFrame,{index:plan.positions[step-1],total:plan.total},{timeout:5000});
      const captured=await invoke(page,(SHARE,RULES,plan,step)=>SHARE.captureFrame(document,location.href,plan,step),plan,step);
      if(!captured.ok) return failed(captured.error);
      frames.push(captured.frame);
    }
    const combined=SHARE.combineFrames({kind:SHARE.FRAMES_KIND,version:SHARE.VERSION,plan,frames});
    if(!combined.ok) return failed(combined.error);
    const payload=combined.payload;
    if(payload.gallery.expected!==payload.images.length || payload.gallery.found!==payload.images.length || !payload.data.title) return failed('invalid_gallery');
    return {status:'ready',sourceUrl:source.url,data:payload.data,images:payload.images,gallery:payload.gallery,capturedAt:payload.capturedAt};
  } catch {return {status:'unavailable',error:'reader_error'};}
}
