/* External accounting evidence. No inferred tax identity, revenue or invoice issuance. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BOOM_INVOICE_RECONCILIATION = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const fiscalLabels = { rejected:'Scartata', delivered:'Consegnata', undelivered:'Mancata consegna', unknown:'Da verificare' };
  const paymentLabels = { unknown:'Incasso da verificare', matched:'Incasso riscontrato', partial:'Riscontro parziale' };
  function day(v) {
    if (v && typeof v.toDate === 'function') v = v.toDate();
    if (v && typeof v === 'object' && Number.isFinite(v.seconds)) v = new Date(v.seconds * 1000);
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(v) : null;
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(v)) return null;
    const s=v.slice(0,10), d=new Date(s+'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===s ? s : null;
  }
  function normalize(raw) {
    const errors=[];
    const fail = p => { if(errors.length<30) errors.push(p); };
    const text=(v,p,max=500,optional=false)=> {
      if(optional && (v===undefined || v===null || v==='')) return '';
      if(typeof v!=='string' || !v.trim() || v.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)){fail(p);return '';}
      return v.trim();
    };
    const date=(v,p)=>{const d=day(v);if(!d || d!==v)fail(p);return d||'';};
    const amount=(v,p,signed=false,optional=false)=>{if(optional&&v===null)return null;if(!Number.isSafeInteger(v)||Math.abs(v)>100000000000||(!signed&&v<0)){fail(p);return 0;}return v;};
    const choice=(v,values,p)=>{if(!values.includes(v)){fail(p);return values[0];}return v;};
    const id=(v,p)=>{const s=text(v,p,180);if(!/^[A-Za-z0-9_.:-]+$/.test(s))fail(p);return s;};
    const rows=(key,fn)=>{
      if(!Array.isArray(raw?.[key])||raw[key].length>1000){fail(key);return [];}
      const ids=new Set();return raw[key].map((r,i)=>{const p=key+'['+i+']';if(!r||typeof r!=='object'||Array.isArray(r)){fail(p);r={};}const result=fn(r,p);if(ids.has(result.id))fail(p+'.duplicateId');ids.add(result.id);return result;});
    };
    if(!raw||raw.schemaVersion!==1)fail('schemaVersion');
    const out={schemaVersion:1, company:text(raw?.company,'company',150), asOf:date(raw?.asOf,'asOf'), periodStart:date(raw?.periodStart,'periodStart'),periodEnd:date(raw?.periodEnd,'periodEnd'),note:text(raw?.note,'note',3000)};
    if(out.periodStart>out.periodEnd || out.periodEnd>out.asOf)fail('period');
    out.sources=rows('sources',(r,p)=>({id:id(r.id,p+'.id'),label:text(r.label,p+'.label',250),method:text(r.method,p+'.method',800),checkedOn:date(r.checkedOn,p+'.checkedOn')}));
    const sourceIds=new Set(out.sources.map(r=>r.id));
    const source=(v,p)=>{const s=id(v,p);if(!sourceIds.has(s))fail(p+'.missingSource');return s;};
    out.invoices=rows('invoices',(r,p)=>({id:id(r.id,p+'.id'),number:text(r.number,p+'.number',80),date:date(r.date,p+'.date'),party:text(r.party,p+'.party',180),amountCents:amount(r.amountCents,p+'.amountCents'),status:choice(r.status,Object.keys(fiscalLabels),p+'.status'),errors:Array.isArray(r.errors)&&r.errors.length<=10?r.errors.map((x,i)=>text(x,p+'.errors.'+i,30)):(fail(p+'.errors'),[]),paymentStatus:choice(r.paymentStatus,Object.keys(paymentLabels),p+'.paymentStatus'),paymentEvidence:text(r.paymentEvidence,p+'.paymentEvidence',1500),sourceId:source(r.sourceId,p+'.sourceId')}));
    const invoiceIds=new Set(out.invoices.map(r=>r.id));
    const invoice=(v,p)=>{if(v===null)return null;const s=id(v,p);if(!invoiceIds.has(s))fail(p+'.missingInvoice');return s;};
    out.payments=rows('payments',(r,p)=>{
      const x={id:id(r.id,p+'.id'),date:date(r.date,p+'.date'),party:text(r.party,p+'.party',180),amountCents:amount(r.amountCents,p+'.amountCents'),refundCents:amount(r.refundCents,p+'.refundCents',false,true),feeCents:amount(r.feeCents,p+'.feeCents',false,true),captured:r.captured,status:text(r.status,p+'.status',60),classification:text(r.classification,p+'.classification',180),note:text(r.note,p+'.note',1500),invoiceCandidate:invoice(r.invoiceCandidate,p+'.invoiceCandidate'),sourceId:source(r.sourceId,p+'.sourceId')};
      if(typeof x.captured!=='boolean'||x.refundCents>x.amountCents||(!x.captured&&x.refundCents))fail(p+'.captureOrRefund');return x;
    });
    out.settlements=rows('settlements',(r,p)=>({id:id(r.id,p+'.id'),date:date(r.date,p+'.date'),netCents:amount(r.netCents,p+'.netCents',true),bankNetCents:amount(r.bankNetCents,p+'.bankNetCents',true,true),bankRef:text(r.bankRef,p+'.bankRef',250,true),note:text(r.note,p+'.note',1000),sourceId:source(r.sourceId,p+'.sourceId')}));
    const bankRefs=out.settlements.map(r=>r.bankRef).filter(Boolean);if(new Set(bankRefs).size!==bankRefs.length)fail('settlements.duplicateBankReference');
    if(out.settlements.some(r=>r.bankNetCents!==null&&!r.bankRef))fail('settlements.bankReferenceRequired');
    out.costs=rows('costs',(r,p)=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period||''))fail(p+'.period');return {id:id(r.id,p+'.id'),period:r.period||'',amountCents:amount(r.amountCents,p+'.amountCents'),cardFeeCents:amount(r.cardFeeCents,p+'.cardFeeCents'),otherFeeCents:amount(r.otherFeeCents,p+'.otherFeeCents'),vatCents:amount(r.vatCents,p+'.vatCents'),sourceId:source(r.sourceId,p+'.sourceId')};});
    out.cases=rows('cases',(r,p)=>({id:id(r.id,p+'.id'),invoiceId:invoice(r.invoiceId,p+'.invoiceId'),party:text(r.party,p+'.party',180),issue:text(r.issue,p+'.issue',1200),nextAction:text(r.nextAction,p+'.nextAction',1500),evidence:text(r.evidence,p+'.evidence',1800),sourceId:source(r.sourceId,p+'.sourceId')}));
    if(JSON.stringify(out).length>500000)fail('payloadTooLarge');
    return {ok:errors.length===0,errors,data:out};
  }
  const sum=(rows,key)=>rows.reduce((n,r)=>n+(r[key]||0),0);
  function summary(d) {
    const rejected=d.invoices.filter(r=>r.status==='rejected'), p=d.payments.filter(r=>r.date>=d.periodStart&&r.date<=d.periodEnd), captured=p.filter(r=>r.captured), settlements=d.settlements.filter(r=>r.date>=d.periodStart&&r.date<=d.periodEnd), matched=settlements.filter(r=>r.bankNetCents!==null&&r.bankRef&&r.netCents===r.bankNetCents);
    return {invoiceCount:d.invoices.length,rejectedCount:rejected.length,rejectedCents:sum(rejected,'amountCents'),undeliveredCount:d.invoices.filter(r=>r.status==='undelivered').length,caseCount:d.cases.length,capturedCount:captured.length,attemptCount:p.length,grossCents:sum(captured,'amountCents'),refundCents:sum(captured,'refundCents'),feeCents:sum(captured,'feeCents'),unknownFeeCount:captured.filter(r=>r.feeCents===null).length,settlementCount:settlements.length,matchedCount:matched.length,settlementNetCents:sum(settlements,'netCents'),bankNetCents:sum(settlements,'bankNetCents'),unmatchedCount:settlements.length-matched.length,costCents:sum(d.costs,'amountCents'),costDifferenceCents:d.costs.reduce((n,r)=>n+r.amountCents-r.cardFeeCents-r.otherFeeCents-r.vatCents,0)};
  }
  function legacyIssues(rows) {
    const counts=new Map();rows.forEach(r=>{if(r.number)counts.set(r.number,(counts.get(r.number)||0)+1);});
    return rows.map(r=>({id:r.id,issues:[!r.number&&'Numero mancante',counts.get(r.number)>1&&'Numero ripetuto: verificare',!day(r.date||r.createdAt)&&'Data da verificare'].filter(Boolean)}));
  }
  return {normalize,summary,day,legacyIssues,fiscalLabels,paymentLabels};
});
