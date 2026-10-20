// Porta riservata al lettore BOOM: claim atomico, lease e risultato senza pubblicazione.
import crypto from 'node:crypto';
import {fsGetVersioned,fsCommit,fsList,fsPatch,readJson,requireSecret} from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';
import JOBS from '../../js/smartlink-import-engine.js';
import {archivePhotos} from './_archive.js';

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
        return res.status(200).json({ok:true,enabled:true,job:{id:candidate.id,url:versioned.data.sourceUrl,leaseToken:fields.leaseToken,leaseUntil:fields.leaseUntil}});
      }
      return res.status(200).json({ok:true,enabled:true,job:null});
    }
    if(body?.op!=='complete' || !/^[A-Za-z0-9_-]{20}$/.test(String(body.id || ''))) return res.status(400).json({ok:false,error:'invalid_request'});
    const versioned=await fsGetVersioned('smartlinkImports/'+body.id);
    if(!versioned) return res.status(404).json({ok:false,error:'not_found'});
    const job=versioned.data;
    if(job.completedToken===body.leaseToken && JOBS.terminal(job.status)) return res.status(200).json({ok:true,duplicate:true});
    if(!JOBS.canComplete(job,body.leaseToken,now)) return res.status(409).json({ok:false,error:'stale_lease'});
    const source=RULES.normalizeUrl(job.sourceUrl);
    const statuses=['ready','needs_attention','unavailable'];
    if(!statuses.includes(body.status)) return res.status(400).json({ok:false,error:'invalid_status'});
    const fields={status:body.status,finishedAt:new Date(now).toISOString(),leaseToken:null,leaseUntil:null,completedToken:body.leaseToken};
    if(body.status==='ready') {
      if(RULES.normalizeUrl(body.sourceUrl)?.url!==source.url) return res.status(400).json({ok:false,error:'source_mismatch'});
      const images=RULES.photoCandidates('',source.source,body.images);
      if(!images.length) return res.status(400).json({ok:false,error:'photos_required'});
      const input=body.data || {};
      fields.images=await archivePhotos(images,job.draftKey);
      if(!fields.images.length) return res.status(503).json({ok:false,error:'photo_archive_failed'});
      fields.missingPhotos=images.length-fields.images.length;
      fields.data={title:RULES.cleanText(input.title,130),zone:RULES.cleanText(input.zone,90),price:RULES.positiveNumber(input.price,1000000),sqm:RULES.positiveNumber(input.sqm,100000),rooms:RULES.positiveNumber(input.rooms,100)};
      fields.error=null;
    } else fields.error=['source_blocked','listing_removed','photos_not_found','reader_error','source_changed'].includes(body.error) ? body.error : 'reader_error';
    await fsCommit([{docPath:'smartlinkImports/'+body.id,fields,precondition:{updateTime:versioned.updateTime}}]);
    return res.status(200).json({ok:true});
  } catch(error) {return res.status(error.conflict?409:503).json({ok:false,error:error.conflict?'stale_lease':'worker_unavailable'});}
}
