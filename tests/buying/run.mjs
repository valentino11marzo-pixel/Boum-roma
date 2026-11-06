// Real intake and pipeline handlers, network-only mocks; no external writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import BUYING from '../../js/buying-engine.js';
let passed=0;
function check(label,condition){assert.ok(condition,label);passed++;console.log('  ✓ '+label);}
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.CRON_SECRET = 'cron-test';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
process.env.TELEGRAM_CHAT_ID = '42';
delete process.env.ANTHROPIC_API_KEY;

// ════════════════════════════════════════════════════════════════════════
// Firestore finto (lo stesso di tests/apply): campi CODIFICATI, 409 su un
// documentId che esiste, query in ordine di nome senza orderBy.
// ════════════════════════════════════════════════════════════════════════
const DB = new Map();
const TG = [];
let autoN = 0;
const typeOf = (v) => (v ? Object.keys(v)[0] : undefined);
const valOf = (v) => {
  const t = typeOf(v);
  if (t === 'timestampValue') return Date.parse(v.timestampValue);
  if (t === 'integerValue') return Number(v.integerValue);
  if (t === 'doubleValue') return v.doubleValue;
  return v[t];
};
const sameKind = (a, b) => {
  const num = (t) => t === 'integerValue' || t === 'doubleValue';
  return typeOf(a) === typeOf(b) || (num(typeOf(a)) && num(typeOf(b)));
};
const getField = (fields, p) => p.split('.').reduce((cur, k) => {
  if (!cur) return undefined;
  const f = cur[k];
  return f && f.mapValue && p.indexOf(k) < p.length - k.length ? f.mapValue.fields : f;
}, fields);
function matches(fields, where) {
  if (!where) return true;
  if (where.compositeFilter) {
    const rs = where.compositeFilter.filters.map((f) => matches(fields, f));
    return where.compositeFilter.op === 'OR' ? rs.some(Boolean) : rs.every(Boolean);
  }
  if (where.unaryFilter) return true;
  const f = where.fieldFilter;
  const actual = getField(fields, f.field.fieldPath);
  if (actual === undefined) return false;
  if (f.op === 'IN') return (f.value.arrayValue.values || []).some((x) => sameKind(actual, x) && valOf(actual) === valOf(x));
  if (!sameKind(actual, f.value)) return false;
  const a = valOf(actual), b = valOf(f.value);
  switch (f.op) {
    case 'EQUAL': return a === b;
    case 'NOT_EQUAL': return a !== b;
    case 'GREATER_THAN': return a > b;
    case 'GREATER_THAN_OR_EQUAL': return a >= b;
    case 'LESS_THAN': return a < b;
    case 'LESS_THAN_OR_EQUAL': return a <= b;
    default: return false;
  }
}
const docOut = (p, fields) => ({ name: `projects/p/databases/(default)/documents/${p}`, fields, updateTime: new Date().toISOString() });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit') || u.includes('securetoken')) return json({ idToken: 'fake', localId: 'admin', expiresIn: '3600' });
  if (u.includes('api.telegram.org')) {
    TG.push({ method: u.split('/').pop(), body: opts.body ? JSON.parse(opts.body) : {} });
    return json({ ok: true, result: { message_id: 1000 + TG.length } });
  }
  if (!u.includes('firestore.googleapis.com')) return json({});
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    let rows = [...DB.entries()].filter(([k, d]) => k.startsWith(coll + '/') && k.split('/').length === 2 && matches(d.fields, q.where));
    const orderBy = q.orderBy || [];
    rows = rows.filter(([, d]) => orderBy.every((o) => o.field.fieldPath === '__name__' || getField(d.fields, o.field.fieldPath) !== undefined));
    rows.sort(([ka, da], [kb, db]) => {
      for (const o of orderBy) {
        const dir = o.direction === 'DESCENDING' ? -1 : 1;
        const a = o.field.fieldPath === '__name__' ? ka : valOf(getField(da.fields, o.field.fieldPath));
        const b = o.field.fieldPath === '__name__' ? kb : valOf(getField(db.fields, o.field.fieldPath));
        if (a < b) return -dir; if (a > b) return dir;
      }
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return json(rows.slice(0, q.limit || 1000).map(([k, d]) => ({ document: docOut(k, d.fields) })));
  }
  if (u.includes(':commit') || u.includes(':batchGet')) return json({ writeResults: [] });
  const m = u.match(/documents\/([^?]+)/);
  const p = m ? decodeURIComponent(m[1]) : '';
  const method = opts.method || 'GET';
  if (method === 'GET') { const d = DB.get(p); return d ? json(docOut(p, d.fields)) : json({ error: { code: 404 } }, 404); }
  if (method === 'POST') {
    const qid = u.match(/documentId=([^&]+)/);
    const id = qid ? decodeURIComponent(qid[1]) : 'auto' + String(++autoN).padStart(4, '0');
    const key = `${p}/${id}`;
    if (DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, { fields: { ...(body.fields || {}) } });
    return json(docOut(key, DB.get(key).fields));
  }
  if (method === 'PATCH') {
    const prev = DB.has(p) ? DB.get(p).fields : {};
    DB.set(p, { fields: { ...prev, ...(body.fields || {}) } });
    return json(docOut(p, DB.get(p).fields));
  }
  return json({});
};
const plain = (v) => {
  const t = typeOf(v);
  if (t === 'mapValue') return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  if (t === 'arrayValue') return (v.arrayValue.values || []).map(plain);
  if (t === 'nullValue') return null;
  if (t === 'integerValue') return Number(v.integerValue);
  return v[t];
};
const docOf = (p) => { const d = DB.get(p); return d ? Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, plain(v)])) : null; };
const docsIn = (coll) => [...DB.keys()].filter((k) => k.startsWith(coll + '/') && k.split('/').length === 2);
const mockRes = () => {
  const r = { statusCode: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => r;
  return r;
};
let ipN = 0;
const post = (handler, body, ip) => {
  const res = mockRes();
  return Promise.resolve(handler({ method: 'POST', body, headers: { 'x-forwarded-for': ip || '10.9.0.' + (++ipN) }, query: {}, socket: {} }, res)).then(() => res);
};

const handler=(await import('../../api/leads/web.js')).default;
const market=await import('../../api/_market.js');
const {stage0}=await import('../../api/leads/brain.js');
const notify=(await import('../../api/telegram/notify-pending.js')).default;
const {handoverSegretaria}=await import('../../api/segretaria/_core.js');
const base={form:'buy-property-europe',name:'Buyer test',email:'buyer@example.test',phone:'+44 7700 900123',country:'GB',city:'London',purchase_budget:'650000',currency:'GBP',purpose:'home',timeline:'six_months',need:'search',privacy:'yes',page_lang:'en',message:'Two bedrooms, near the station.',requestId:'buytest123456789'};
const first=await post(handler,base);
check('intake saved with stable reference',first.statusCode===200 && first.body.id==='web_buy-property-europe_buytest123456789');
const lead=docOf('leads/'+first.body.id);
check('buyer is never a tenant or an active/paid mandate',lead.leadType==='buyer' && lead.intent==='purchase_search' && lead.buying.mandateStatus==='not_started' && lead.buying.coverageStatus==='to_confirm' && lead.buying.feeStatus==='not_quoted');
check('total budget and currency retained; monthly budget stays empty',lead.budget===null && lead.budgetKind==='total_purchase' && lead.buying.budget===650000 && lead.buying.currency==='GBP');
check('country, city, international contact and words retained',lead.buying.country==='GB' && lead.buying.city==='London' && lead.phone==='+447700900123' && lead.message.includes(base.message));
const counts=[docsIn('leads').length,docsIn('activityLog').length];
const retry=await post(handler,{...base,city:'Changed after uncertain response'});
check('retry returns original reference and never overwrites or duplicates',retry.body.duplicate && retry.body.id===first.body.id && docOf('leads/'+first.body.id).buying.city==='London' && counts[0]===docsIn('leads').length && counts[1]===docsIn('activityLog').length);
for(const [patch,error] of [[{country:'US'},'country_required'],[{country:'__proto__'},'country_required'],[{city:''},'city_required'],[{currency:'XYZ'},'currency_required'],[{purchase_budget:'650,000'},'budget_invalid'],[{purchase_budget:'-1'},'budget_invalid'],[{purchase_budget:'0'},'budget_invalid'],[{purchase_budget:'650000.5'},'budget_invalid'],[{phone:'07700900123'},'phone_international'],[{privacy:false},'privacy_required']]){
  const r=await post(handler,{...base,...patch});check('rejects '+JSON.stringify(patch),r.statusCode===400 && r.body.error===error);
}
check('unknown budget remains unknown; no invented purpose/time',BUYING.parse({...base,purchase_budget:'',purpose:'x',timeline:'x'}).value.budget===null && BUYING.parse({...base,purpose:'x',timeline:'x'}).value.purpose==='undecided');
for(const code of Object.keys(BUYING.countries))assert.ok(BUYING.parse({...base,country:code}).value,code);
check('every listed European destination reaches feasibility review',Object.keys(BUYING.countries).length>=45);
check('honeypot creates no record',(await post(handler,{...base,company:'spam'})).body.id===null && docsIn('leads').length===1);
check('privacy acknowledged on the enquiry',lead.buying.privacyAcknowledged===true);
check('rule grading cannot classify the purchase against Rome rent',stage0(lead,new Map()).final && stage0(lead,new Map()).grade==='B' && /acquisto/.test(stage0(lead,new Map()).reason));
for(const l of [lead,{leadType:'buyer'},{intent:'purchase_search'},{sourceRef:'buy-property-europe'}])check('buyer identified from persisted marker',market.isBuyingLead(l) && !!market.notRomeTenant(l));
check('Reunion buyer remains on its existing route',!market.isBuyingLead({leadType:'buyer',market:'reunion'}) && market.isReunion({leadType:'buyer',market:'reunion'}));
check('rental tenant remains on rental route',!market.isBuyingLead({leadType:'tenant',market:'roma'}));
check('no Segretaria handover for a purchase',(await handoverSegretaria(first.body.id)).ok===false);
const rn=mockRes();
const brain=(await import('../../api/leads/brain.js')).default;
await brain({method:'POST',headers:{authorization:'Bearer cron-test'},query:{}},mockRes());
await notify({method:'GET',headers:{authorization:'Bearer cron-test'},query:{}},rn);
const card=TG.find(t=>t.method==='sendMessage' && /Buyer test/.test(t.body.text||''));
check('actual operator card identifies buying enquiry',card && /Acquisto Europa/.test(card.body.text));
const kb=JSON.stringify(card?.body.reply_markup||{});
check('card has no rental assistant action',!kb.includes('sg:'));
const wa=card?.body.reply_markup?.inline_keyboard.flat().find(b=>b.url?.includes('wa.me'))?.url||'';
check('correct international number and purchase reply, never Rome rentals',wa.startsWith('https://wa.me/447700900123?') && decodeURIComponent(wa).includes('buy-property-europe') && !decodeURIComponent(wa).includes('/apartments'));
check('Italian reply retains buying context',market.buyingReplyText({...lead,language:'it'}).includes('/comprare-casa-europa'));
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
for(const [file,lang,alternate] of [['buy-property-europe','en','comprare-casa-europa'],['comprare-casa-europa','it','buy-property-europe']]){
  const html=read(file+'.html');
  const ld=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq=ld['@graph'].find(n=>n['@type']==='FAQPage');
  const escape=s=>s.replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  check(lang+' every FAQ answer and question is visible static content',faq.mainEntity.every(q=>html.includes('<summary>'+escape(q.name)+'</summary>') && html.includes('<p>'+escape(q.acceptedAnswer.text)+'</p>')));
  check(lang+' canonical + reciprocal language + sitemap',html.includes('rel="canonical" href="https://www.boomrome.com/'+file+'"') && html.includes('hreflang="'+(lang==='it'?'en':'it')+'" href="https://www.boomrome.com/'+alternate+'"') && read('sitemap.xml').includes('/'+file+'</loc>'));
  check(lang+' no price offer/checkout or guaranteed office coverage',!ld['@graph'].some(n=>n.offers) && !html.includes('/api/create-checkout') && !html.includes('/api/service-checkout'));
  check(lang+' privacy unchecked and no assumed purpose/time',html.includes('name="privacy" value="yes" required') && html.includes('value="undecided" selected') && html.includes('value="exploring" selected'));
}
check('buyer model source is actually used in the intake',read('api/leads/web.js').includes('BUYING.parse(body)'));
execFileSync(process.execPath,['scripts/build-buying.mjs','--check'],{cwd:new URL('../..',import.meta.url)});
console.log(`Buying: ${passed} passed, 0 failed`);

