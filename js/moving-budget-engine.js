(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BOOM_MOVE_BUDGET=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const fields=[
    {id:'firstRent',label:'First rent payment',group:'arrival',help:'The actual first payment requested. Do not add it again under setup costs.'},
    {id:'deposit',label:'Refundable deposit',group:'deposit',help:'Cash tied up, not a moving expense. Return depends on the agreement and any deductions.'},
    {id:'temporary',label:'Temporary accommodation',group:'arrival',help:'The whole stay before your new lease begins, including any overlap.'},
    {id:'travel',label:'Travel and removals',group:'arrival',help:'Tickets, luggage, shipping and movers for everyone relocating.'},
    {id:'setup',label:'Other one-off costs',group:'arrival',help:'Your quotes for furniture, connections and other setup costs. Exclude anything entered elsewhere.'},
    {id:'support',label:'Professional support',group:'arrival',help:'Only services you choose. Enter your agreed quote, including tax, once.'},
    {id:'rent',label:'Monthly rent',group:'monthly',help:'For an ordinary month after arrival. The first payment above is counted only in arrival cash.'},
    {id:'bills',label:'Monthly bills',group:'monthly',help:'Only bills not already included in rent: utilities, internet and recurring charges.'},
    {id:'living',label:'Other monthly spending',group:'monthly',help:'Your allowance for food, transport and other regular spending.'}
  ];
  function cents(value){
    if(typeof value!=='string'&&typeof value!=='number')return null;
    const s=String(value).trim();
    if(!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(s))return null;
    const n=Math.round(Number(s.replace(',','.'))*100);
    return Number.isSafeInteger(n)&&n<=100000000? n:null;
  }
  function calculate(entries){
    const groups={arrival:{confirmed:0,estimated:0,unknown:0},deposit:{confirmed:0,estimated:0,unknown:0},monthly:{confirmed:0,estimated:0,unknown:0}};
    const missing=[],invalid=[];
    for(const f of fields){
      const e=entries&&entries[f.id],g=groups[f.group];
      if(!e||e.status==='unknown'||String(e.amount??'').trim()===''){g.unknown++;missing.push(f.id);continue;}
      const n=cents(e.amount);
      if(!['confirmed','estimated'].includes(e.status)||n===null){g.unknown++;invalid.push(f.id);continue;}
      g[e.status]+=n;
    }
    const arrival=groups.arrival.confirmed+groups.arrival.estimated;
    const deposit=groups.deposit.confirmed+groups.deposit.estimated;
    const monthly=groups.monthly.confirmed+groups.monthly.estimated;
    return {groups,arrival,deposit,cash:arrival+deposit,monthly,missing,invalid,complete:missing.length===0&&invalid.length===0};
  }
  return {fields,cents,calculate};
});
