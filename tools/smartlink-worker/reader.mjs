import {canonical,listingSnapshot} from '../smartlink-extension/background.mjs';

// Diagnostica della sola sonda: codici chiusi, mai testo pagina o eccezioni.
// Il callback resta separato dal risultato inviato alla coda.
const diagnosticPhases={invalid_source:'input',http_rejected:'navigation',listing_removed:'navigation',http_error:'navigation',
  url_changed:'navigation',navigation_timeout:'navigation',navigation_error:'navigation',verification_page:'verification',
  verification_error:'verification',missing_photos:'parser',missing_title:'parser',gallery_incomplete:'parser',parser_error:'parser',ready:'complete'};

// Finestra per il responsabile: nessun clic, lettura dati o claim di lavori.
// Lo stesso profilo conserva la sessione soltanto dopo l'intervento umano.
export async function openReview(context,url) {
  if(!url || canonical(url)!==url) throw new Error('invalid_review_url');
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
  return page;
}

// Il browser è quello standard, con profilo dedicato. Nessun proxy, stealth o risolutore di verifiche.
export async function readListing(context,url,onDiagnostic) {
  let phase='navigation',httpStatus;
  const finish=(result,reason)=>{
    if(typeof onDiagnostic==='function' && Object.hasOwn(diagnosticPhases,reason)) {
      const diagnostic={phase:diagnosticPhases[reason],reason};
      if(Number.isInteger(httpStatus) && httpStatus>=100 && httpStatus<=599) diagnostic.httpStatus=httpStatus;
      try {onDiagnostic(diagnostic);} catch { /* La diagnosi non cambia l'esito della lettura. */ }
    }
    return result;
  };
  if(canonical(url)!==url) return finish({status:'unavailable',error:'source_changed'},'invalid_source');
  const page=await context.newPage();
  try {
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    httpStatus=response?.status();
    if([401,403,429].includes(httpStatus)) return finish({status:'needs_attention',error:'source_blocked'},'http_rejected');
    if([404,410].includes(httpStatus)) return finish({status:'unavailable',error:'listing_removed'},'listing_removed');
    if(!response?.ok()) return finish({status:'unavailable',error:'reader_error'},'http_error');
    if(canonical(page.url())!==url) return finish({status:'needs_attention',error:'source_changed'},'url_changed');
    phase='verification';
    await page.locator('h1').waitFor({state:'visible',timeout:12000}).catch(()=>{});
    const blocked=await page.evaluate(()=>{
      const text=(document.title+' '+(document.body?.innerText || '').slice(0,1200)).toLowerCase();
      return !!document.querySelector('iframe[src*="captcha-delivery.com"]') || /verify (?:that )?you are human|verifica di essere umano|access denied|accesso negato|unusual traffic|device check|captcha/.test(text);
    });
    if(blocked) return finish({status:'needs_attention',error:'source_blocked'},'verification_page');
    phase='parser';
    let snapshot;
    if (/(?:^|\.)casafari\.com$/.test(new URL(url).hostname)) {
      // Il riepilogo mostra cinque foto: la galleria espone le restanti.
      // Si apre soltanto il visualizzatore, senza like/commenti/condivisioni.
      await page.locator('.PropertyGallery__image-button').first().click({timeout:8000});
      await page.locator('img.FullScreenGallery__image').waitFor({state:'visible',timeout:8000});
      const counter=await page.locator('.FullScreenGallery__counter').textContent();
      const total=Number(counter?.match(/\/\s*(\d+)/)?.[1]);
      if(!Number.isInteger(total) || total<1) return finish({status:'unavailable',error:'photos_not_found'},'missing_photos');
      const wanted=Math.min(total,12), images=new Set();
      for(let index=1;index<=wanted;index++) {
        snapshot=await page.evaluate(listingSnapshot,url);
        snapshot.images.forEach(image=>images.add(image));
        if(images.size>=wanted) break;
        if(index<wanted) {
          await page.locator('.FullScreenGallery__arrow--next').click({timeout:5000});
          await page.waitForFunction(expected=>{
            const count=document.querySelector('.FullScreenGallery__counter')?.textContent;
            const image=document.querySelector('img.FullScreenGallery__image');
            return Number(count?.match(/^\s*(\d+)/)?.[1])===expected && image?.alt==='Property photo '+expected;
          },index+1,{timeout:5000});
        }
      }
      snapshot.images=[...images].slice(0,12);
      if(snapshot.images.length<wanted) return finish({status:'unavailable',error:'photos_not_found'},'gallery_incomplete');
    }
    snapshot ||= await page.evaluate(listingSnapshot,url);
    if(!snapshot.images.length) {
      await page.waitForLoadState('load',{timeout:8000}).catch(()=>{});
      snapshot=await page.evaluate(listingSnapshot,url);
    }
    if(!snapshot.images.length || !snapshot.data.title) return finish({status:'unavailable',error:'photos_not_found'},!snapshot.images.length?'missing_photos':'missing_title');
    return finish({status:'ready',sourceUrl:url,images:snapshot.images,data:snapshot.data},'ready');
  } catch(error) {
    const reason=phase==='navigation'?(error?.name==='TimeoutError'?'navigation_timeout':'navigation_error'):
      phase==='verification'?'verification_error':'parser_error';
    return finish({status:'unavailable',error:'reader_error'},reason);
  }
  finally {await page.close().catch(()=>{});}
}

export async function processOne(job,read,call,sleep) {
  const result=await read(job.url);
  const packet={op:'complete',id:job.id,leaseToken:job.leaseToken,...result};
  // Un ACK perso ritenta solo la ricevuta, senza riaprire la fonte.
  for(let i=0;i<3;i++) {
    try {return await call(packet);} catch(error) {
      if(error.status===409 || i===2) throw error;
      await sleep(2000*(i+1));
    }
  }
}
