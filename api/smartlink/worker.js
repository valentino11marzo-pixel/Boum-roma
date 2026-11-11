// Porta riservata al lettore BOOM: claim atomico, lease e risultato senza pubblicazione.
import crypto from 'node:crypto';
import {fsGetVersioned,fsCommit,fsList,fsPatch,readJson,requireSecret} from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';
import JOBS from '../../js/smartlink-import-engine.js';
import {archivePhotos,archivePhotoBytes} from './_archive.js';
import {imageType} from './import-photo.js';

// Una foto per richiesta: anche base64 + metadati restano sotto i 4,5 MB Vercel.
export const PHOTO_LIMIT=3_000_000;
const photoKeys=['op','id','leaseToken','sourceUrl','index','total','imageUrl','mime','base64'];
function photoList(values,source) {
  if(!Array.isArray(values) || !values.length || values.length>RULES.MAX_PHOTOS) return null;
  const urls=values.map(value=>typeof value==='string' && value.length<=2048 ? RULES.photoUrl(value,source.source):null);
  return urls.every(Boolean) && new Set(urls).size===urls.length ? urls:null;
}
function transferFor(job,body) {
  return job.photoTransfer?.leaseToken===body.leaseToken ? job.photoTransfer : {leaseToken:body.leaseToken,total:body.total,photos:[]};
}
function receiptFor(transfer,body,sha256) {
  if(transfer.total!==body.total) return {conflict:true};
  const receipt=transfer.photos.find(photo=>photo.index===body.index);
  if(receipt) return receipt.sha256===sha256 && receipt.imageUrl===body.imageUrl ? {receipt}:{conflict:true};
  return transfer.photos.some(photo=>photo.imageUrl===body.imageUrl)?{conflict:true}:{};
}
async function receivePhoto(body,job,res) {
  if(Object.keys(body).some(key=>!photoKeys.includes(key)) || !Number.isSafeInteger(body.index) || !Number.isSafeInteger(body.total) || body.total<1 || body.total>RULES.MAX_PHOTOS || body.index<1 || body.index>body.total) return res.status(400).json({ok:false,error:'invalid_photo'});
  const source=RULES.normalizeUrl(job.sourceUrl);
  if(!source || RULES.normalizeUrl(body.sourceUrl)?.url!==source.url) return res.status(400).json({ok:false,error:'source_mismatch'});
  const imageUrl=typeof body.imageUrl==='string' && body.imageUrl.length<=2048 && RULES.photoUrl(body.imageUrl,source.source);
  if(!imageUrl || imageUrl!==body.imageUrl) return res.status(400).json({ok:false,error:'invalid_photo_url'});
  if(typeof body.base64!=='string' || !body.base64.length || body.base64.length>4*Math.ceil(PHOTO_LIMIT/3)) return res.status(413).json({ok:false,error:'photo_too_large'});
  const bytes=Buffer.from(body.base64,'base64');
  if(!bytes.length || bytes.length>PHOTO_LIMIT || bytes.toString('base64')!==body.base64) return res.status(400).json({ok:false,error:'invalid_photo_bytes'});
  const mime=imageType(bytes);
  if(!mime || mime!==body.mime) return res.status(400).json({ok:false,error:'invalid_photo_type'});
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  let transfer=transferFor(job,body), prior=receiptFor(transfer,body,sha256);
  if(prior.conflict) return res.status(409).json({ok:false,error:'photo_conflict'});
  if(prior.receipt) return res.status(200).json({ok:true,duplicate:true,index:body.index});
  let url;
  try {url=await archivePhotoBytes(bytes,job.draftKey,body.leaseToken+':'+body.index);}
  catch(error) {return res.status(error.invalidPhoto?422:503).json({ok:false,error:error.invalidPhoto?'invalid_photo_bytes':'photo_archive_failed'});}
  // L'upload può durare oltre la lease o incontrare una nuova assegnazione.
  const current=await fsGetVersioned('smartlinkImports/'+body.id);
  if(!current || !JOBS.canComplete(current.data,body.leaseToken,Date.now()) || current.data.sourceUrl!==job.sourceUrl || current.data.draftKey!==job.draftKey) return res.status(409).json({ok:false,error:'stale_lease'});
  transfer=transferFor(current.data,body);prior=receiptFor(transfer,body,sha256);
  if(prior.conflict) return res.status(409).json({ok:false,error:'photo_conflict'});
  if(prior.receipt) return res.status(200).json({ok:true,duplicate:true,index:body.index});
  const photos=[...transfer.photos,{index:body.index,imageUrl,sha256,url}].sort((a,b)=>a.index-b.index);
  await fsCommit([{docPath:'smartlinkImports/'+body.id,fields:{photoTransfer:{leaseToken:body.leaseToken,total:body.total,photos}},precondition:{updateTime:current.updateTime}}]);
  return res.status(200).json({ok:true,index:body.index});
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(!requireSecret(req,res)) return;
  let body;try {body=await readJson(req);} catch {return res.status(400).json({ok:false,error:'invalid_json'});}
  const now=Date.now();
  try {
    if(body?.op==='pull' || body?.op==='heartbeat') {
      await fsPatch('smartlinkWorkers/main',{lastSeenAt:new Date(now).toISOString(),version:'1.0.0'});
      if(body.op==='heartbeat') return res.status(200).json({ok:true});
      if(process.env.SMARTLINK_REMOTE_ENABLED!=='1') return res.status(200).json({ok:true,enabled:false,job:null});
      const candidates=(await Promise.all(['queued','reading'].map(status=>fsList('smartlinkImports',{filter:{field:'status',op:'EQUAL',value:status},limit:30})))).flat().sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
      for(const candidate of candidates) {
        const versioned=await fsGetVersioned('smartlinkImports/'+candidate.id); if(!versioned) continue;
        const fields=JOBS.claim(versioned.data,now,crypto.randomUUID()); if(!fields) continue;
        try {await fsCommit([{docPath:'smartlinkImports/'+candidate.id,fields,precondition:{updateTime:versioned.updateTime}}]);}
        catch(error) {if(error.conflict) continue; throw error;}
        if(fields.status!=='reading') continue;
        return res.status(200).json({ok:true,enabled:true,job:{id:candidate.id,url:versioned.data.sourceUrl,leaseToken:fields.leaseToken,leaseUntil:fields.leaseUntil,photoLimit:PHOTO_LIMIT}});
      }
      return res.status(200).json({ok:true,enabled:true,job:null});
    }
    if(!['complete','photo'].includes(body?.op) || !/^[A-Za-z0-9_-]{20}$/.test(String(body.id || ''))) return res.status(400).json({ok:false,error:'invalid_request'});
    const versioned=await fsGetVersioned('smartlinkImports/'+body.id);
    if(!versioned) return res.status(404).json({ok:false,error:'not_found'});
    const job=versioned.data;
    if(body.op==='complete' && job.completedToken===body.leaseToken && JOBS.terminal(job.status)) return res.status(200).json({ok:true,duplicate:true});
    if(!JOBS.canComplete(job,body.leaseToken,now)) return res.status(409).json({ok:false,error:'stale_lease'});
    if(body.op==='photo') return await receivePhoto(body,job,res);
    const source=RULES.normalizeUrl(job.sourceUrl);
    const statuses=['ready','needs_attention','unavailable'];
    if(!statuses.includes(body.status)) return res.status(400).json({ok:false,error:'invalid_status'});
    const fields={status:body.status,finishedAt:new Date(now).toISOString(),leaseToken:null,leaseUntil:null,completedToken:body.leaseToken};
    if(body.status==='ready') {
      if(RULES.normalizeUrl(body.sourceUrl)?.url!==source.url) return res.status(400).json({ok:false,error:'source_mismatch'});
      const images=photoList(body.images,source);
      if(!images) return res.status(400).json({ok:false,error:'photos_required'});
      const input=body.data || {};
      if(body.transport==='bytes') {
        const transfer=job.photoTransfer, gallery=body.gallery;
        if(!gallery || gallery.expected!==images.length || gallery.found!==images.length || !transfer || transfer.leaseToken!==body.leaseToken || transfer.total!==images.length || transfer.photos.length!==images.length) return res.status(409).json({ok:false,error:'photos_incomplete'});
        const receipts=[...transfer.photos].sort((a,b)=>a.index-b.index);
        if(receipts.some((photo,index)=>photo.index!==index+1 || photo.imageUrl!==images[index] || !RULES.validImageUrl(photo.url,job.draftKey))) return res.status(409).json({ok:false,error:'photos_incomplete'});
        fields.images=receipts.map(photo=>photo.url);
      } else {
        // Compatibilità col lettore precedente, mai ripiego del trasporto byte.
        if(body.transport!==undefined || job.photoTransfer?.leaseToken===body.leaseToken) return res.status(400).json({ok:false,error:'invalid_transport'});
        fields.images=await archivePhotos(images,job.draftKey);
        if(fields.images.length!==images.length) return res.status(503).json({ok:false,error:'photo_archive_failed'});
      }
      fields.missingPhotos=0;
      fields.data={title:RULES.cleanText(input.title,130),zone:RULES.cleanText(input.zone,90),price:RULES.positiveNumber(input.price,1000000),sqm:RULES.positiveNumber(input.sqm,100000),rooms:RULES.positiveNumber(input.rooms,100)};
      fields.error=null;
    } else fields.error=['source_blocked','listing_removed','photos_not_found','reader_error','source_changed'].includes(body.error) ? body.error : 'reader_error';
    if(!JOBS.canComplete(job,body.leaseToken,Date.now())) return res.status(409).json({ok:false,error:'stale_lease'});
    await fsCommit([{docPath:'smartlinkImports/'+body.id,fields,precondition:{updateTime:versioned.updateTime}}]);
    return res.status(200).json({ok:true});
  } catch(error) {return res.status(error.conflict?409:503).json({ok:false,error:error.conflict?'stale_lease':'worker_unavailable'});}
}
