/* Importazioni remote: durata, ripresa e proiezione privata condivise. */
(function(root) {
  'use strict';
  const LEASE_MS=300000, MAX_ATTEMPTS=2, MAX_AGE_MS=3600000, HEARTBEAT_MS=45000;
  const terminal = status => ['ready','needs_attention','unavailable','expired'].includes(status);
  function claimable(job, now) {
    if (!job || terminal(job.status)) return false;
    return job.status==='queued' || (job.status==='reading' && Date.parse(job.leaseUntil)<=now);
  }
  function claim(job, now, token) {
    if (!claimable(job,now)) return null;
    if (now-Date.parse(job.createdAt)>MAX_AGE_MS) return {status:'expired',error:'request_expired',closedAt:new Date(now).toISOString()};
    if (Number(job.attempts || 0)>=MAX_ATTEMPTS) return {status:'unavailable',error:'reader_interrupted',closedAt:new Date(now).toISOString()};
    return {status:'reading',attempts:Number(job.attempts || 0)+1,leaseToken:token,leaseUntil:new Date(now+LEASE_MS).toISOString(),startedAt:new Date(now).toISOString()};
  }
  function canComplete(job, token, now) { return job?.status==='reading' && job.leaseToken===token && Date.parse(job.leaseUntil)>now; }
  function workerOnline(worker, now) { const age=now-Date.parse(worker?.lastSeenAt); return age>=0 && age<HEARTBEAT_MS; }
  function view(job) {
    if(claimable(job,Date.now()) && Date.now()-Date.parse(job.createdAt)>MAX_AGE_MS) job={...job,status:'expired',error:'request_expired'};
    return {id:job.id,sourceUrl:job.sourceUrl,draftKey:job.draftKey,status:job.status,createdAt:job.createdAt,finishedAt:job.finishedAt || null,error:job.error || null,
      ...(job.status==='ready' ? {data:job.data,images:job.images,missingPhotos:job.missingPhotos || 0} : {})};
  }
  const API={LEASE_MS,MAX_ATTEMPTS,MAX_AGE_MS,terminal,claimable,claim,canComplete,workerOnline,view};
  if(typeof module!=='undefined' && module.exports) module.exports=API;
  if(root) root.BOOM_SMARTLINK_IMPORT=API;
})(typeof window!=='undefined'?window:this);
