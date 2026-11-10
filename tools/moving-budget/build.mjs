import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CITY_MARKETS,CITY_PLANS} from '../../api/_market.js';
import engine from '../../js/moving-budget-engine.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const desks=Object.entries(CITY_MARKETS).filter(([slug,m])=>JSON.parse(read('cities/'+slug+'.json')).live&&m.mode==='search').map(([slug,m])=>({slug,name:m.label,iata:JSON.parse(read('cities/'+slug+'.json')).iata,currency:(m.currency||'eur').toUpperCase(),chargeAt:m.chargeAt||'checkout',updated:JSON.parse(read('cities/'+slug+'.json')).updated}));
const fieldHtml=group=>engine.fields.filter(f=>group==='arrival'?f.group!=='monthly':f.group==='monthly').map(f=>`<div class="cost-row" id="row-${f.id}"><div class="cost-copy"><label for="${f.id}">${escape(f.label)}</label><p id="${f.id}-hint">${escape(f.help)}</p></div><div class="cost-controls"><label class="sr-only" for="${f.id}-status">${escape(f.label)} certainty</label><select id="${f.id}-status" data-status="${f.id}" disabled><option value="unknown">Still to check</option><option value="estimated">My estimate</option><option value="confirmed">Confirmed quote</option></select><input id="${f.id}" data-amount="${f.id}" type="text" inputmode="decimal" maxlength="10" autocomplete="off" placeholder="Amount" aria-describedby="${f.id}-hint ${f.id}-error" disabled><span class="field-error" id="${f.id}-error" hidden>Use an amount from 0 to 1,000,000, with up to two decimals and no thousands separators.</span></div></div>`).join('\n');
const cards=desks.map(d=>`<li><a href="/${d.slug}">${escape(d.name)}</a><span>${d.currency==='GBP'?'£':'€'}${CITY_PLANS['full-search'].eur} Full Search · VAT included</span><small>${d.chargeAt==='signing'?'Fee charged only when you sign a lease.':'Fee paid when ordered; refunded in full if we decline the search in the first call.'}</small></li>`).join('\n');
const version=f=>createHash('sha256').update(read(f)).digest('hex').slice(0,10);
const tokens={CSSVERSION:version('assets/moving-budget.css'),JSVERSION:version('assets/moving-budget.js'),OPTIONS:desks.map(d=>`<option value="${d.slug}">${d.name} · ${d.currency}</option>`).join(''),ARRIVAL:fieldHtml('arrival'),MONTHLY:fieldHtml('monthly'),DESKS:cards,CONFIG:JSON.stringify(desks).replace(/</g,'\\u003c')};
let html=read('tools/moving-budget/template.html').replace(/\{\{([A-Z]+)\}\}/g,(_,key)=>{if(!(key in tokens))throw Error('Unknown token '+key);return tokens[key];});
if(process.argv.includes('--check')){if(read('moving-budget.html')!==html)throw Error('moving-budget.html differs; run node tools/moving-budget/build.mjs');console.log('Moving budget generated page is current');}
else {fs.writeFileSync(path.join(root,'moving-budget.html'),html);console.log('Built moving-budget.html');}
