import {canonical,listingSnapshot} from '../smartlink-extension/background.mjs';
import RULES from '../../js/smartlink-engine.js';
import {readIdealista} from './idealista.mjs';

// Finestra per il responsabile: nessun clic, lettura dati o claim di lavori.
// Lo stesso profilo conserva la sessione soltanto dopo l'intervento umano.
export async function openReview(context,url) {
  if(!url || canonical(url)!==url) throw new Error('invalid_review_url');
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
  return page;
}

// Il browser è quello standard, con profilo dedicato. Nessun proxy, stealth o risolutore di verifiche.
export async function readListing(context,url) {
  if(canonical(url)!==url) return {status:'unavailable',error:'source_changed'};
  const page=await context.newPage();
  try {
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    if([401,403,429].includes(response?.status())) return {status:'needs_attention',error:'source_blocked'};
    if([404,410].includes(response?.status())) return {status:'unavailable',error:'listing_removed'};
    if(!response?.ok()) return {status:'unavailable',error:'reader_error'};
    if(canonical(page.url())!==url) return {status:'needs_attention',error:'source_changed'};
    await page.locator('h1').waitFor({state:'visible',timeout:12000}).catch(()=>{});
    const blocked=await page.evaluate(()=>{
      const text=(document.title+' '+(document.body?.innerText || '').slice(0,1200)).toLowerCase();
      return !!document.querySelector('iframe[src*="captcha-delivery.com"]') || /verify (?:that )?you are human|verifica di essere umano|access denied|accesso negato|unusual traffic|device check|captcha/.test(text);
    });
    if(blocked) return {status:'needs_attention',error:'source_blocked'};
    if(RULES.normalizeUrl(url)?.source==='Idealista') return await readIdealista(page,url);
    let snapshot,expected=null;
    if (/(?:^|\.)casafari\.com$/.test(new URL(url).hostname)) {
      // Il riepilogo mostra cinque foto: la galleria espone le restanti.
      // Si apre soltanto il visualizzatore, senza like/commenti/condivisioni.
      await page.locator('.PropertyGallery__image-button').first().click({timeout:8000});
      await page.locator('img.FullScreenGallery__image').waitFor({state:'visible',timeout:8000});
      const counter=await page.locator('.FullScreenGallery__counter').textContent();
      const total=Number(counter?.match(/\/\s*(\d+)/)?.[1]);
      if(!Number.isInteger(total) || total<1) return {status:'unavailable',error:'photos_not_found'};
      if(total>RULES.MAX_PHOTOS) return {status:'unavailable',error:'photos_not_found'};
      expected=total;
      const wanted=total, images=new Set();
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
      snapshot.images=[...images];
      if(snapshot.images.length<wanted) return {status:'unavailable',error:'photos_not_found'};
    }
    snapshot ||= await page.evaluate(listingSnapshot,url);
    if(!snapshot.images.length) {
      await page.waitForLoadState('load',{timeout:8000}).catch(()=>{});
      snapshot=await page.evaluate(listingSnapshot,url);
    }
    if(!snapshot.images.length || !snapshot.data.title) return {status:'unavailable',error:'photos_not_found'};
    return {status:'ready',sourceUrl:url,images:snapshot.images,data:snapshot.data,gallery:{expected,found:snapshot.images.length}};
  } catch {return {status:'unavailable',error:'reader_error'};}
  finally {await page.close().catch(()=>{});}
}

export async function readPhoto(imageUrl,sourceUrl,limit,fetcher=fetch) {
  const source=RULES.normalizeUrl(sourceUrl);
  if(!source || RULES.photoUrl(imageUrl,source.source)!==imageUrl || !Number.isSafeInteger(limit) || limit<1 || limit>8_000_000) throw new Error('invalid_photo');
  const response=await fetcher(imageUrl,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(12000),headers:{Accept:'image/avif,image/webp,image/png,image/jpeg'}});
  if([401,403,429].includes(response.status)) {await response.body?.cancel();throw Object.assign(new Error('source_blocked'),{blocked:true});}
  const mime=(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if(!response.ok || !['image/jpeg','image/png','image/webp','image/avif'].includes(mime) || Number(response.headers.get('content-length'))>limit) {await response.body?.cancel();throw new Error('photo_unavailable');}
  const reader=response.body?.getReader();if(!reader) throw new Error('photo_unavailable');
  const chunks=[];let size=0;
  while(true) {
    const {done,value}=await reader.read();if(done) break;
    size+=value.length;if(size>limit) {await reader.cancel();throw new Error('photo_too_large');}
    chunks.push(value);
  }
  if(!size) throw new Error('photo_unavailable');
  return {mime,base64:Buffer.concat(chunks).toString('base64')};
}

export async function processOne(job,read,call,sleep) {
  let result=await read(job.url);
  const base={id:job.id,leaseToken:job.leaseToken};
  // Un ACK perso ritenta gli stessi byte solo verso BOOM, senza riscaricare la foto.
  const receipt=async packet=>{
    for(let i=0;i<3;i++) {
      try {return await call(packet);} catch(error) {
        if(error.status>=400 && error.status<500 || i===2) throw error;
        await sleep(2000*(i+1));
      }
    }
  };
  if(result.status==='ready') {
    const source=RULES.normalizeUrl(job.url),images=result.images,gallery=result.gallery;
    // Gli adattatori precedenti non attestano il totale: conservano solo il loro trasporto URL.
    // Non è un ripiego dopo un download fallito, né una galleria dichiarata completa.
    const legacy=['Immobiliare.it','Subito','Casa.it'].includes(source?.source) && gallery?.expected===null && gallery.found===images?.length;
    if(!source || RULES.normalizeUrl(result.sourceUrl)?.url!==source.url || !Array.isArray(images) || !images.length || images.length>RULES.MAX_PHOTOS || images.some(url=>typeof url!=='string' || url.length>2048 || RULES.photoUrl(url,source.source)!==url) || new Set(images).size!==images.length || !legacy && (gallery?.expected!==images.length || gallery?.found!==images.length)) result={status:'unavailable',error:'photos_not_found'};
    else if(!legacy) {
      for(let i=0;i<images.length;i++) {
        if(Date.parse(job.leaseUntil)<=Date.now()) throw Object.assign(new Error('stale_lease'),{status:409});
        let photo;
        try {photo=await readPhoto(images[i],source.url,job.photoLimit);}
        catch(error) {result={status:error.blocked?'needs_attention':'unavailable',error:error.blocked?'source_blocked':'reader_error'};break;}
        await receipt({op:'photo',...base,sourceUrl:source.url,index:i+1,total:images.length,imageUrl:images[i],...photo});
      }
      if(result.status==='ready') result={...result,transport:'bytes'};
    }
  }
  return receipt({op:'complete',...base,...result});
}
