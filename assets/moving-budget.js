(function(){
  'use strict';
  const E=window.BOOM_MOVE_BUDGET, data=JSON.parse(document.getElementById('deskData').textContent),city=document.getElementById('city');
  if(!E)return;
  const states=Object.create(null);let current=null;
  const $=id=>document.getElementById(id);
  function money(n){return new Intl.NumberFormat('en-GB',{style:'currency',currency:current.currency,maximumFractionDigits:2}).format(n/100);}
  function render(){
    if(!current)return;
    const entries=states[current.slug],r=E.calculate(entries),known=E.fields.length-r.missing.length-r.invalid.length;
    const entered=group=>E.fields.some(f=>(group==='cash'?f.group!=='monthly':f.group===group)&&entries[f.id]&&entries[f.id].status!=='unknown'&&E.cents(entries[f.id].amount)!==null);
    $('cashTotal').textContent=entered('cash')?money(r.cash):'—';$('expenseTotal').textContent=entered('arrival')?money(r.arrival):'—';$('depositTotal').textContent=entered('deposit')?money(r.deposit):'—';$('monthlyTotal').textContent=entered('monthly')?money(r.monthly):'—';
    $('budgetState').textContent=r.invalid.length?'Check '+r.invalid.length+' invalid amount'+(r.invalid.length===1?'':'s')+'. Totals are partial.':r.complete?'Every line checked. Review your estimates before committing.':known+' of '+E.fields.length+' lines entered. '+r.missing.length+' still to check — totals are partial.';
    // Counts, not a sum of arrival and recurring money: those periods are not comparable.
    const count=status=>Object.values(entries).filter(e=>e.status===status&&E.cents(e.amount)!==null).length;
    $('certainty').textContent=count('confirmed')+' confirmed quotes · '+count('estimated')+' estimates. Unknown costs are excluded.';
    $('missingList').replaceChildren(...E.fields.filter(f=>r.missing.includes(f.id)||r.invalid.includes(f.id)).map(f=>{const li=document.createElement('li');li.textContent=f.label+(r.invalid.includes(f.id)?' — correct the amount':'');return li;}));
    if(r.complete){const li=document.createElement('li');li.textContent='All lines have an amount. Estimates still need verification.';$('missingList').append(li);}
    E.fields.forEach(f=>{$(f.id).setAttribute('aria-invalid',String(r.invalid.includes(f.id)));$(f.id+'-error').hidden=!r.invalid.includes(f.id);});
  }
  function selectCity(){
    current=data.find(d=>d.slug===city.value)||null;
    E.fields.forEach(f=>{$(f.id+'-status').disabled=!current;$(f.id).disabled=true;$(f.id).value='';$(f.id+'-status').value='unknown';$(f.id+'-error').hidden=true;$(f.id).setAttribute('aria-invalid','false');});
    $('printBudget').disabled=!current;
    if(!current)return;
    city.querySelector('option[value=""]').disabled=true;
    states[current.slug] ||= {};
    for(const f of E.fields){const e=states[current.slug][f.id];if(e){$(f.id+'-status').value=e.status;$(f.id).value=e.amount||'';$(f.id).disabled=e.status==='unknown';}}
    $('summaryCity').textContent=current.name;$('summaryCurrency').textContent=current.currency+' · your own figures';
    $('currencyNote').textContent='All amounts in '+current.currency+'. Each city has a separate worksheet. No currency conversion.';
    $('deskLink').href='/'+current.slug;$('deskLink').textContent='Talk to the '+current.name+' desk';
    $('deskNote').textContent='Save this worksheet for your conversation. Opening the '+current.name+' desk sends none of these amounts.';
    render();
  }
  city.disabled=false;city.addEventListener('change',selectCity);
  E.fields.forEach(f=>{
    const status=$(f.id+'-status'),input=$(f.id);
    function update(){if(!current)return;input.disabled=status.value==='unknown';states[current.slug][f.id]={status:status.value,amount:input.value};render();}
    status.addEventListener('change',update);input.addEventListener('input',update);
  });
  $('printBudget').addEventListener('click',()=>window.print());
})();
