// Richiesta e ripresa dal Portal. La lettura è eseguita dal Mac BOOM.
import crypto from 'node:crypto';
import {requireRole} from '../_auth.js';
import {fsCreate,fsGet,fsList,readJson} from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';
import JOBS from '../../js/smartlink-import-engine.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({ok:false,error:'method_not_allowed'});
  const actor=await requireRole(req,res,['admin']); if(!actor) return;
  try {
    if(req.method==='GET') {
      const worker=await fsGet('smartlinkWorkers/main');
      if(req.query?.id) {
        if(!/^[A-Za-z0-9_-]{20}$/.test(req.query.id)) return res.status(400).json({ok:false,error:'invalid_id'});
        const job=await fsGet('smartlinkImports/'+req.query.id);
        if(!job || job.createdBy!==actor.uid) return res.status(404).json({ok:false,error:'not_found'});
        return res.status(200).json({ok:true,job:JOBS.view({...job,id:req.query.id}),online:JOBS.workerOnline(worker,Date.now())});
      }
      const jobs=await fsList('smartlinkImports',{filter:{field:'createdBy',op:'EQUAL',value:actor.uid},orderBy:{field:'createdAt',direction:'DESCENDING'},limit:100});
      const now=Date.now();
      return res.status(200).json({ok:true,online:JOBS.workerOnline(worker,now),jobs:jobs.filter(j=>now-Date.parse(j.createdAt)<86400000).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,10).map(JOBS.view)});
    }
    let body; try {body=await readJson(req);} catch {return res.status(400).json({ok:false,error:'invalid_json'});}
    const source=RULES.normalizeUrl(body?.url), key=String(body?.draftKey || '');
    if(!source || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return res.status(400).json({ok:false,error:'invalid_request'});
    const id=crypto.createHash('sha256').update(actor.uid+':'+key).digest('base64url').slice(0,20);
    const existing=await fsGet('smartlinkImports/'+id);
    if(existing) {
      if(existing.createdBy!==actor.uid || existing.sourceUrl!==source.url) return res.status(409).json({ok:false,error:'key_conflict'});
      return res.status(200).json({ok:true,job:JOBS.view({...existing,id})});
    }
    if(process.env.SMARTLINK_REMOTE_ENABLED!=='1') return res.status(503).json({ok:false,error:'reader_not_enabled'});
    const jobs=await fsList('smartlinkImports',{filter:{field:'createdBy',op:'EQUAL',value:actor.uid},orderBy:{field:'createdAt',direction:'DESCENDING'},limit:100});
    const now=Date.now();
    if(jobs.filter(j=>!JOBS.terminal(j.status) && now-Date.parse(j.createdAt)<JOBS.MAX_AGE_MS).length>=5) return res.status(429).json({ok:false,error:'too_many_pending'});
    const record={createdBy:actor.uid,sourceUrl:source.url,draftKey:key,status:'queued',attempts:0,createdAt:new Date(now).toISOString()};
    try {await fsCreate('smartlinkImports',record,id);} catch(error) {if(!error.exists) throw error;}
    const saved=await fsGet('smartlinkImports/'+id);
    if(!saved || saved.sourceUrl!==source.url || saved.createdBy!==actor.uid) return res.status(409).json({ok:false,error:'key_conflict'});
    return res.status(202).json({ok:true,job:JOBS.view({...saved,id})});
  } catch {return res.status(503).json({ok:false,error:'queue_unavailable'});}
}
