import {canonical,listingSnapshot} from '../smartlink-extension/background.mjs';

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
    let snapshot=await page.evaluate(listingSnapshot,url);
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
