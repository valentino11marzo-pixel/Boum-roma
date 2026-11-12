(function(){
  'use strict';
  const E=window.BOOM_MOVE_BUDGET, data=JSON.parse(document.getElementById('deskData').textContent),city=document.getElementById('city');
  if(!E)return;
  const states=Object.create(null);let current=null,nextMissing=null;
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
    const unresolved=E.fields.filter(f=>r.missing.includes(f.id)||r.invalid.includes(f.id));
    $('missingList').replaceChildren(...unresolved.map(f=>{const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.dataset.fieldJump=f.id;button.textContent=f.label+(r.invalid.includes(f.id)?' — correct the amount':'');li.append(button);return li;}));
    if(r.complete){const li=document.createElement('li');li.textContent='All lines have an amount. Estimates still need verification.';$('missingList').append(li);}
    nextMissing=unresolved[0]||null;
    $('nextCost').disabled=!nextMissing;
    $('nextCost').textContent=nextMissing?'Continue: '+nextMissing.label:'All amounts entered';
    for(const [group,total] of [['arrival',6],['monthly',3]]){
      const pending=unresolved.filter(f=>group==='arrival'?f.group!=='monthly':f.group==='monthly').length;
      $(group+'Count').textContent=(total-pending)+' of '+total+' entered';
    }
    $('dockCity').textContent=current.name+' · arrival cash';
    $('dockTotal').textContent=$('cashTotal').textContent;
    $('dockState').textContent=r.invalid.length?'Check amounts':r.complete?'All lines entered':'Partial · '+known+'/9 entered';
    $('budgetSummary').dataset.complete=String(r.complete);
    E.fields.forEach(f=>{
      const invalid=r.invalid.includes(f.id);
      $(f.id).setAttribute('aria-invalid',String(invalid));$(f.id+'-error').hidden=!invalid;
      $('row-'+f.id).dataset.certainty=invalid?'invalid':r.missing.includes(f.id)?'unknown':entries[f.id].status;
    });
  }
  function focusField(id){
    if(!E.fields.some(f=>f.id===id))return;
    const input=$(id),target=input.disabled?$(id+'-status'):input;
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'center',behavior:'instant'});
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
    $('destinationCode').textContent=current.iata;
    $('budgetDock').hidden=false;
    E.fields.forEach(f=>{$(f.id).placeholder='Amount in '+current.currency;});
    $('currencyNote').textContent='All amounts in '+current.currency+'. Use your own quotes and estimates.';
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
  $('nextCost').addEventListener('click',()=>{if(nextMissing)focusField(nextMissing.id);});
  $('missingList').addEventListener('click',event=>{const button=event.target.closest('[data-field-jump]');if(button)focusField(button.dataset.fieldJump);});
  // Anchor navigation also transfers keyboard focus. No forced motion or timing gates.
  document.querySelectorAll('a[href="#budgetSummary"]').forEach(a=>a.addEventListener('click',()=>{$('budgetSummary').focus({preventScroll:true});}));
})();
