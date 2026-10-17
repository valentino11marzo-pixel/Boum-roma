// Admission control, not a provider invoice. No prompts, API keys or responses
// are stored here. Reservations share the existing canonical daily aiUsage doc.
import crypto from 'node:crypto';
import REG from '../js/ai-registry.js';
import { fsGet, fsGetVersioned, fsCommit } from './homie/_lib.js';

export class AiBudgetError extends Error {
  constructor(code) { super(code); this.code=code; this.status=503; this.backend='cloud'; }
}
const fail=code=>{throw new AiBudgetError('ai_budget_'+code);};
const dayFor=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date(now));
const MAX_ATTEMPTS=2048; // Bounded document size; reaching it blocks, never drops holds.

// Firestore helpers do not accept AbortSignal. Bound each await instead of
// waiting forever; a commit already sent may still land, so never undo its hold.
export async function budgetWithinDeadline(operation, deadline=Date.now()+4000) {
  const ms=deadline-Date.now();
  if(ms<=0)fail('time_exhausted');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(()=>{if(Date.now()>=deadline)fail('time_exhausted');return operation();}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AiBudgetError('ai_budget_time_exhausted')),ms);}),
    ]);
  } finally { clearTimeout(timer); }
}
const rethrowTimeout=error=>{if(error?.code==='ai_budget_time_exhausted')throw error;};

export async function budgetSettings({deadline=Date.now()+4000}={}) {
  let raw;
  try { raw=await budgetWithinDeadline(()=>fsGet('settings/ai'),deadline); } catch(error) { rethrowTimeout(error); fail('settings_unavailable'); }
  const parsed=REG.mergeSettings(raw);
  if(parsed.rejected.some(r=>r.key==='budget'||r.key.startsWith('budget.'))) fail('settings_invalid');
  return parsed.cfg.budget;
}

function observedMicros(doc) {
  let total=0;
  for(const entry of Object.values(doc?.p || {})) {
    const c=entry?.cloud;
    if(!c)continue;
    if(c.unpriced>0 || (c.ok>0 && typeof c.usd!=='number') || (c.usd!=null && (!Number.isFinite(c.usd)||c.usd<0))) fail('usage_unknown');
    total+=c.usd || 0;
  }
  const n=Math.ceil(total*1e6);
  if(!Number.isSafeInteger(n))fail('usage_unknown');
  return n;
}
function unreservedMicros(doc) {
  const n=doc?.budgetUnreservedMicros ?? 0;
  if(!Number.isSafeInteger(n)||n<0)fail('usage_unknown');
  return n;
}
function ledger(doc) {
  if(!doc?.budgetV1)return {baselineMicros:Math.max(observedMicros(doc),unreservedMicros(doc)),unreservedAtStart:unreservedMicros(doc),settledMicros:0,heldMicros:0,attempts:{}};
  const b=structuredClone(doc.budgetV1);
  if(!['baselineMicros','unreservedAtStart','settledMicros','heldMicros'].every(k=>Number.isSafeInteger(b[k])&&b[k]>=0) || !b.attempts || typeof b.attempts!=='object' || Array.isArray(b.attempts))fail('ledger_invalid');
  let holds=0,settled=0;
  for(const a of Object.values(b.attempts)) {
    if(!a || !['held','settled'].includes(a.state) || !Number.isSafeInteger(a.micros) || a.micros<0)fail('ledger_invalid');
    if(a.state==='held')holds+=a.micros;else settled+=a.micros;
  }
  if(holds!==b.heldMicros || settled!==b.settledMicros)fail('ledger_invalid');
  if(unreservedMicros(doc)<b.unreservedAtStart)fail('ledger_invalid');
  return b;
}
function accountedMicros(b,doc) {
  // Separate watermark: late telemetry for already-reserved calls is never
  // counted twice, while calls made with the budget off remain chargeable.
  return Math.max(b.baselineMicros+b.settledMicros+unreservedMicros(doc)-b.unreservedAtStart,observedMicros(doc));
}

export async function reserveBudget({model,inputTokens,maxTokens,now=Date.now(),deadline=Date.now()+4000}) {
  const micros=REG.reserveMicros(model,inputTokens,maxTokens);
  if(micros==null)fail('price_unknown');
  const day=dayFor(now),path='aiUsage/'+day,id=crypto.randomUUID();
  for(let retry=0;retry<5;retry++) {
    if(Date.now()>=deadline)fail('time_exhausted');
    let settings,current;
    try { settings=await budgetWithinDeadline(()=>fsGetVersioned('settings/ai'),deadline); current=await budgetWithinDeadline(()=>fsGetVersioned(path),deadline); }
    catch(error) { rethrowTimeout(error); fail('reservation_unavailable'); }
    if(Date.now()>=deadline)fail('time_exhausted');
    const parsed=REG.mergeSettings(settings?.data);
    if(parsed.rejected.some(r=>r.key==='budget'||r.key.startsWith('budget.')))fail('settings_invalid');
    const cfg=parsed.cfg.budget;
    // Configuration changed while counting: do not silently remove admission.
    if(!settings || !cfg.enabled)fail('settings_changed');
    const b=ledger(current?.data);
    if(Object.keys(b.attempts).length>=MAX_ATTEMPTS)fail('ledger_capacity');
    const used=accountedMicros(b,current?.data);
    if(used+b.heldMicros+micros>Math.floor(cfg.dailyUsd*1e6))fail('exceeded');
    b.heldMicros+=micros;
    b.attempts[id]={state:'held',micros,model,at:new Date(now).toISOString()};
    try {
      await budgetWithinDeadline(()=>fsCommit([
        {docPath:'settings/ai',fields:{},precondition:{updateTime:settings.updateTime}},
        {docPath:path,fields:{day,budgetV1:b},precondition:current?{updateTime:current.updateTime}:{exists:false}},
      ]),deadline);
      return {day,id,model,micros};
    } catch(error) { rethrowTimeout(error); if(!error.conflict)fail('reservation_unavailable'); }
  }
  fail('reservation_busy');
}

export async function settleBudget(receipt,{model,usage,deadline=Date.now()+4000}) {
  if(!receipt)return {state:'disabled'};
  const micros=REG.billedMicros(model,usage);
  if(micros==null)return {state:'held',reason:'usage_unknown'};
  const path='aiUsage/'+receipt.day;
  for(let retry=0;retry<5;retry++) {
    try {
      const current=await budgetWithinDeadline(()=>fsGetVersioned(path),deadline),b=ledger(current?.data),a=b.attempts[receipt.id];
      if(!a || a.model!==receipt.model || a.micros!==receipt.micros && a.state==='held')return {state:'held',reason:'receipt_unknown'};
      if(a.state==='settled')return {state:'settled'};
      b.heldMicros-=a.micros;b.settledMicros+=micros;
      b.attempts[receipt.id]={...a,state:'settled',micros};
      await budgetWithinDeadline(()=>fsCommit([{docPath:path,fields:{budgetV1:b},precondition:{updateTime:current.updateTime}}]),deadline);
      return {state:'settled'};
    } catch(error) { if(!error.conflict)return {state:'held',reason:'settlement_unavailable'}; }
  }
  return {state:'held',reason:'settlement_busy'};
}

export async function budgetSnapshot(now=Date.now()) {
  const day=dayFor(now),deadline=Date.now()+4000;
  const coverage={provider:'Anthropic Messages',excluded:['OpenAI STT','ElevenLabs','Telnyx'],estimated:true,timezone:'Europe/Rome'};
  try {
    const cfg=await budgetSettings({deadline});
    if(!cfg.enabled)return {...coverage,day,enabled:false,dailyUsd:cfg.dailyUsd,state:'disabled'};
    const doc=await budgetWithinDeadline(()=>fsGet('aiUsage/'+day),deadline),b=ledger(doc),used=accountedMicros(b,doc);
    return {...coverage,day,...cfg,state:'ready',accountedUsd:used/1e6,heldUsd:b.heldMicros/1e6,remainingUsd:Math.max(0,cfg.dailyUsd-(used+b.heldMicros)/1e6),heldCount:Object.values(b.attempts).filter(a=>a.state==='held').length};
  } catch(error) { return {...coverage,day,state:'unavailable',enabled:null,error:error.code||'ai_budget_unavailable'}; }
}
