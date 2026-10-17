let mutation;
export function initialize(data){mutation=data?.mutation;}
export async function load(url,ctx,next){const r=await next(url,ctx);if(!url.endsWith('/api/_ai-budget.js'))return r;const replacements={
 concurrent:["precondition:current?{updateTime:current.updateTime}:{exists:false}","precondition:current?{exists:true}:{exists:false}"],
 timeout:["if(used+b.heldMicros+micros>","if(used+micros>"],
 settings:["catch(error) { rethrowTimeout(error); fail('settings_unavailable'); }","catch { return {enabled:false}; }"],
 reenable:['+unreservedMicros(doc)-b.unreservedAtStart',''],
 repricing:["{docPath:'settings/ai',fields:{},precondition:{updateTime:settings.updateTime}},",""],
};const p=replacements[mutation];if(!p)return r;const source=String(r.source);if(!source.includes(p[0]))throw Error('Missing mutation target '+mutation);return {...r,source:source.replace(p[0],p[1]).replace(mutation==='concurrent'?"{docPath:'settings/ai',fields:{},precondition:{updateTime:settings.updateTime}},":'__no_mutation__','')};}
