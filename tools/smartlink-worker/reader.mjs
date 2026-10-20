import {canonical,listingSnapshot} from '../smartlink-extension/background.mjs';

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
    let snapshot;
    if (/(?:^|\.)casafari\.com$/.test(new URL(url).hostname)) {
      // Il riepilogo mostra cinque foto: la galleria espone le restanti.
      // Si apre soltanto il visualizzatore, senza like/commenti/condivisioni.
      await page.locator('.PropertyGallery__image-button').first().click({timeout:8000});
      await page.locator('img.FullScreenGallery__image').waitFor({state:'visible',timeout:8000});
      const counter=await page.locator('.FullScreenGallery__counter').textContent();
      const total=Number(counter?.match(/\/\s*(\d+)/)?.[1]);
      if(!Number.isInteger(total) || total<1) return {status:'unavailable',error:'photos_not_found'};
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
      if(snapshot.images.length<wanted) return {status:'unavailable',error:'photos_not_found'};
    }
    snapshot ||= await page.evaluate(listingSnapshot,url);
    if(!snapshot.images.length) {
      await page.waitForLoadState('load',{timeout:8000}).catch(()=>{});
      snapshot=await page.evaluate(listingSnapshot,url);
    }
    if(!snapshot.images.length || !snapshot.data.title) return {status:'unavailable',error:'photos_not_found'};
    return {status:'ready',sourceUrl:url,images:snapshot.images,data:snapshot.data};
  } catch {return {status:'unavailable',error:'reader_error'};}
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
