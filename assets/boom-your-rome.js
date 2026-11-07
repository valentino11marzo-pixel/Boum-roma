/* Your Rome has no catalogue request or WebGL. It hands a public brief to Skyline. */
(function(){
  'use strict';
  var form=document.getElementById('yourRomeForm');if(!form)return;
  var M=window.BOOM_MAPPA,G=window.BOOM_SKYLINE_GUIDE,S=window.BOOM_STAY;
  if(!M||!G||!S)return;
  var q=new URLSearchParams(location.search),place=form.elements.place,budget=form.elements.budget,priority=form.elements.priority;
  var state=S.intent(location.search),arrival=form.elements.moveIn,departure=form.elements.moveOut;
  if(M.destination(q.get('place')))place.value=q.get('place');
  if(q.has('budget')&&/^\d{1,6}$/.test(q.get('budget'))&&Number(q.get('budget'))<=100000){
    if(![].some.call(budget.options,function(o){return o.value===q.get('budget');})){var option=document.createElement('option');option.value=q.get('budget');option.textContent='€'+Number(option.value).toLocaleString('en-US');budget.appendChild(option);}
    budget.value=q.get('budget');
  }
  if(['rent','space','commute'].indexOf(q.get('priority'))>=0)priority.value=q.get('priority');
  arrival.value=state.moveIn||'';departure.value=state.moveOut||'';
  if(state.moveIn||state.moveOut)document.getElementById('yrDates').open=true;
  function intent(){return {moveIn:arrival.value,moveOut:departure.value,durationMonths:!arrival.value&&!departure.value?state.durationMonths:null};}
  function path(){return S.withIntent(G.share({budget:Number(budget.value),place:place.value,priority:priority.value},M.DESTINATIONS,[]),intent());}
  function update(){
    var d=M.destination(place.value),address=document.getElementById('yrAddress');
    address.textContent=d?(d.address||d.che)+(d.address?' · Confirm your teaching venue.':''):'';
    arrival.setCustomValidity('');departure.setCustomValidity('');
    document.getElementById('yrPlanStatus').textContent=!arrival.value&&!departure.value&&state.durationMonths?'Requested stay: '+state.durationMonths+' months · dates to choose. Free to explore.':'Free to explore. No email required.';
    if(arrival.value)departure.min=S.addMonths(arrival.value,3)||'';else departure.removeAttribute('min');
    document.querySelectorAll('[data-yr-service]').forEach(function(link){var url=new URL(path(),location.origin);url.searchParams.delete('guide');link.href=link.getAttribute('data-yr-service')+'?'+url.searchParams.toString();});
  }
  document.querySelectorAll('[data-yr-service]').forEach(function(link){link.setAttribute('data-yr-service',link.getAttribute('href'));});
  form.addEventListener('change',update);
  form.addEventListener('submit',function(e){
    var error=S.validate(intent());
    if(error){e.preventDefault();document.getElementById('yrDates').open=true;var field=error.field==='moveIn'?arrival:departure;field.setCustomValidity(error.message);field.reportValidity();document.getElementById('yrPlanStatus').textContent=error.message;return;}
    e.preventDefault();location.assign(path());
  });
  update();
})();
