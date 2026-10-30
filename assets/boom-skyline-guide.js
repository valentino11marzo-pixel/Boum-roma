/* Your brief stays in place. Current homes are the answer, not another form. */
(function(){
  'use strict';
  var api=null,opener=null,budgetChosen=false,currentCandidates=[],query=new URLSearchParams(location.search),editor=null,railFrame=0;
  var $=function(id){return document.getElementById(id);};
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function money(n){return '€'+Math.round(n).toLocaleString('en-US');}
  function put(node,text){if(node.textContent!==text)node.textContent=text;}
  var dialog=el('dialog','sky-guide');dialog.id='skyGuide';dialog.setAttribute('aria-labelledby','skyGuideTitle');
  dialog.innerHTML='<header class="sky-guide-header"><div><span class="sky-guide-kicker">BOOM / YOUR ROME</span><h2 id="skyGuideTitle">Your next possibilities.</h2></div><button type="button" class="sky-guide-close" id="skyGuideClose" aria-label="Close the home guide">×</button></header>'
    +'<div class="sky-guide-brief"><span>Your brief</span><button type="button" data-guide-edit="budget" aria-expanded="false" aria-controls="skyGuideBudgetQuestion"><small>Rent ceiling</small><b id="skyGuideBudgetLabel"></b><i>⌄</i></button><button type="button" data-guide-edit="place" aria-expanded="false" aria-controls="skyGuidePlaceQuestion"><small>My everyday</small><b id="skyGuidePlaceLabel"></b><i>⌄</i></button></div>'
    +'<form id="skyGuideForm" class="sky-guide-form"><section id="skyGuideBudgetQuestion" class="sky-guide-question" hidden><label for="skyGuideBudget">What rent budget feels right?</label><select id="skyGuideBudget" aria-label="Your monthly rent budget"><option value="1500">Up to €1,500 / month</option><option value="1000">Up to €1,000 / month</option><option value="2000">Up to €2,000 / month</option><option value="2500">Up to €2,500 / month</option><option value="3500">Up to €3,500 / month</option><option value="0">Explore every budget</option></select><div class="sky-guide-budget-picks"><button type="button" data-guide-budget="1000">€1,000</button><button type="button" data-guide-budget="1500">€1,500</button><button type="button" data-guide-budget="2000">€2,000</button><button type="button" data-guide-budget="2500">€2,500</button></div><div class="sky-guide-custom"><label>Another ceiling<input id="skyGuideCustomBudget" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="Monthly rent in €"></label><button type="button" id="skyGuideApplyBudget">Apply</button></div><small>Advertised rent only. Bills and fees still need checking.</small></section>'
    +'<section id="skyGuidePlaceQuestion" class="sky-guide-question" hidden><label for="skyGuidePlace">Where does your everyday begin?</label><select id="skyGuidePlace" aria-label="Your public destination"></select><small>Choose the address on your timetable, not just the university name.</small></section><select hidden tabindex="-1" aria-hidden="true" id="skyGuidePriority"><option value="rent">Keep more of my budget</option><option value="space">Have more space</option><option value="commute">Be closer to my destination</option></select><button type="button" class="sky-guide-done" id="skyGuideDone" hidden>See my options ↓</button></form>'
    +'<div class="sky-guide-priority" role="group" aria-label="What matters most?"><button type="button" data-guide-priority="rent" aria-pressed="true"><span>€</span> Lower rent</button><button type="button" data-guide-priority="space" aria-pressed="false"><span>↗</span> More space</button><button type="button" data-guide-priority="commute" aria-pressed="false"><span>◷</span> Less travel</button></div>'
    +'<div class="sky-guide-results-head"><div class="sky-guide-summary" role="status" aria-live="polite" id="skyGuideSummary"></div><nav class="sky-guide-pager" aria-label="Home options"><button type="button" id="skyGuidePrevious" aria-label="Previous home">←</button><span id="skyGuidePosition">01 / 03</span><button type="button" id="skyGuideNext" aria-label="Next home">→</button></nav></div><div class="sky-guide-results" id="skyGuideResults" aria-label="Your home options"></div>'
    +'<div class="sky-guide-secondary"><details class="sky-guide-method"><summary>Campus, sources & how we compare <span>+</span></summary><div id="skyGuideDestination" class="sky-guide-destination"></div><p>Monthly rent is before bills and fees. Space is as listed. Comparisons use the same listed home type; travel differences require the same estimate method and destination. Minutes are estimates or a timetable model, never live departures. Confirm route, dates, contract and full cost before deciding.</p><a href="/your-rome">All campus addresses & questions ↗</a></details>'
    +'<details class="sky-guide-share" id="skyGuideShare"><summary>Share my plan <span>↗</span></summary><div><p>Share your budget, public destination and priority. Personal saved places and contact details never enter this link.</p><label><input type="checkbox" id="skyGuideShareHomes"> Include these homes (up to 3)</label><label><input type="checkbox" id="skyGuideShareStay"> Include my requested stay / dates</label><p class="sky-guide-share-note">Anyone with the link can see these preferences. Prices and availability are read again when they open it.</p><div class="sky-guide-copy"><input id="skyGuideShareURL" aria-label="Public plan link" readonly><button type="button" id="skyGuideCopy">Copy link</button></div><span role="status" id="skyGuideCopyStatus"></span></div></details>'
    +'<details class="sky-guide-help"><summary>Take the next step with BOOM <span>↗</span></summary><div><a id="skyGuidePFS" href="/property-finding"><strong>I need more options.</strong><small>Property Finding · a personal search beyond this catalogue. Scope, fees & terms ↗</small></a><a id="skyGuideDAS" href="/deal-assistance"><strong>I already found a home.</strong><small>Deal Assistance · support for a home found elsewhere. What’s included ↗</small></a></div></details></div>';
  document.body.appendChild(dialog);
  var trigger=el('button','sky-guide-trigger','Find my balance');trigger.type='button';trigger.id='skyGuideOpen';trigger.setAttribute('aria-haspopup','dialog');
  var tools=document.querySelector('.sky-flight-tools');if(tools)tools.prepend(trigger);
  var places=window.BOOM_MAPPA&&(BOOM_MAPPA.DESTINATIONS||BOOM_MAPPA.METE)||[],groups=Object.create(null);
  places.forEach(function(p){var group=p.group||'Rome';if(!groups[group]){groups[group]=el('optgroup');groups[group].label=group;$('skyGuidePlace').appendChild(groups[group]);}var o=el('option','',p.nome);o.value=p.slug;groups[group].appendChild(o);});
  if(['rent','space','commute'].indexOf(query.get('priority'))>=0)$('skyGuidePriority').value=query.get('priority');
  $('skyGuidePlace').value=places.some(function(p){return p.slug===query.get('place');})?query.get('place'):'colosseo';
  function destination(){return places.find(function(p){return p.slug===$('skyGuidePlace').value;});}
  function stayLink(path){
    if(!window.BOOM_STAY)return path;
    var S=BOOM_STAY,read=S.intent||S.read,stay=read(location.search),empty=stay&&typeof stay==='object'?!stay.moveIn&&!stay.moveOut&&!stay.durationMonths:!stay;
    if(empty&&parent!==window)try{if(parent.location.origin===location.origin)stay=read(parent.location.search);}catch(_){}
    return S.withIntent?S.withIntent(path,stay):S.withStay(path,stay);
  }
  function rememberBrief(reopen){
    // The current public brief survives native back/reload; no device POI or
    // contact information is copied, and unrelated route state is preserved.
    try{var url=new URL(location.href);url.searchParams.set('budget',$('skyGuideBudget').value);url.searchParams.set('priority',$('skyGuidePriority').value);if(destination())url.searchParams.set('place',$('skyGuidePlace').value);if(reopen)url.searchParams.set('guide','1');else url.searchParams.delete('guide');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}catch(_){}
  }
  function shareLink(){
    var path=BOOM_SKYLINE_GUIDE.share({budget:Number($('skyGuideBudget').value),priority:$('skyGuidePriority').value,place:$('skyGuidePlace').value,includeHomes:$('skyGuideShareHomes').checked,homes:currentCandidates.map(function(r){return r.id;})},places,api&&api.catalogue?api.catalogue().map(function(l){return String(l.id);}):[]);
    return 'https://www.boomrome.com'+($('skyGuideShareStay').checked?stayLink(path):path);
  }
  function updateShare(){
    var url=shareLink();if($('skyGuideShareURL').value!==url){$('skyGuideShareURL').value=url;put($('skyGuideCopyStatus'),'');}
    var qs=new URL(url).searchParams;qs.delete('guide');qs.delete('homes');
    $('skyGuidePFS').href=stayLink('/property-finding?'+qs.toString());$('skyGuideDAS').href=stayLink('/deal-assistance?'+qs.toString());
  }
  function updateBrief(){
    var budget=Number($('skyGuideBudget').value),p=destination();
    put($('skyGuideBudgetLabel'),budget?money(budget)+'/mo':'Every budget');put($('skyGuidePlaceLabel'),p?p.nome:'Choose a destination');
    dialog.querySelectorAll('[data-guide-priority]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.guidePriority===$('skyGuidePriority').value));});
    var node=$('skyGuideDestination');if(!p||node.dataset.slug===p.slug)return;node.dataset.slug=p.slug;node.replaceChildren();
    node.appendChild(el('strong','',p.address||p.che||p.nome));if(p.address)node.appendChild(el('small','',p.che||'Confirm your teaching venue.'));
    if(p.source){var source=el('a','','Official campus ↗');source.href=p.source;source.target='_blank';source.rel='noopener noreferrer';node.appendChild(source);}
    var url=window.BOOM_MAPPA&&BOOM_MAPPA.destinationMap?BOOM_MAPPA.destinationMap(p):null;
    if(url){var map=el('a','','Check campus map ↗');map.href=url;map.target='_blank';map.rel='noopener noreferrer';node.appendChild(map);}
  }
  function setEditor(name,focus){
    editor=name;dialog.querySelectorAll('[data-guide-edit]').forEach(function(b){b.setAttribute('aria-expanded',String(b.dataset.guideEdit===name));});
    $('skyGuideBudgetQuestion').hidden=name!=='budget';$('skyGuidePlaceQuestion').hidden=name!=='place';$('skyGuideDone').hidden=!name;
    if(name&&focus)$(name==='budget'?'skyGuideBudget':'skyGuidePlace').focus({preventScroll:true});
  }
  function setBudget(value){
    var n=Number(value);if(!Number.isFinite(n)||n<0||n>100000)return false;n=Math.round(n);
    if(![].some.call($('skyGuideBudget').options,function(o){return Number(o.value)===n;})){var o=el('option','',money(n)+' / month');o.value=n;$('skyGuideBudget').appendChild(o);}
    $('skyGuideBudget').value=String(n);budgetChosen=true;return true;
  }
  function snapshot(){
    if(!api||!api.catalogue||!window.BOOM_FLIGHT)return [];
    var catalogue=api.catalogue(),filter=api.filter(),scope=filter.homes,mapped=new Set(api.markers.map(function(m){return m.getElement().__id;}));
    return catalogue.filter(function(l){return mapped.has(String(l.id))&&(!filter.homesActive||scope.indexOf(String(l.id))>=0);}).map(function(l){
      var r=BOOM_FLIGHT.compare([BOOM_FLIGHT.listing(l.id)],catalogue,{facts:window.BOOM_FACTS,dispo:window.BOOM_DISPO,geo:window.BOOM_GEO})[0];
      if(r){r.journey=api.journeyFor?api.journeyFor(r.id,$('skyGuidePlace').value):null;r.type=typeof l.type==='string'?l.type.trim():'';var m=api.markers.find(function(m){return m.getElement().__id===r.id;});r.outsideMapTime=!!(m&&m.getElement().classList.contains('fuoriTempo'));}return r;
    }).filter(Boolean);
  }
  function routeFor(r,place){
    var route=BOOM_SKYLINE_GUIDE.directions(r.journey);
    if(!route&&place&&place.address){var pin=api.markers.find(function(m){return m.getElement().__id===r.id;}),co=pin&&pin.getElement().__co;if(co&&typeof co[0]==='number'&&typeof co[1]==='number')route=BOOM_SKYLINE_GUIDE.addressDirections({lat:co[1],lng:co[0]},place.address);else if(BOOM_MAPPA.destinationMap)route=BOOM_MAPPA.destinationMap(place);}
    return route;
  }
  function makeCard(r,i,result,place,card){
    var delta=BOOM_SKYLINE_GUIDE.tradeoff(r,result.candidates),signature=JSON.stringify([r,delta,place&&place.slug,stayLink(r.path)]);
    if(!card){card=el('article','sky-guide-card');card.dataset.id=r.id;var media=el('div','sky-guide-media');if(r.image){var img=el('img');img.src=r.image;img.alt=r.name;img.loading='lazy';img.addEventListener('error',function(){this.replaceWith(el('span','','Photo unavailable'));},{once:true});media.appendChild(img);}else media.appendChild(el('span','','Photo unavailable'));media.appendChild(el('b','sky-guide-card-number'));card.appendChild(media);card.appendChild(el('div','sky-guide-content'));}
    put(card.querySelector('.sky-guide-card-number'),String(i+1).padStart(2,'0'));if(card.__signature===signature)return card;card.__signature=signature;
    var priorDetails=card.querySelector('.sky-guide-home-details'),detailsOpen=!!(priorDetails&&priorDetails.open);
    var content=card.querySelector('.sky-guide-content');content.replaceChildren();
    content.appendChild(el('span','sky-guide-zone',(r.zone?r.zone+' · ':'')+(r.type||'Type to confirm')));content.appendChild(el('h3','',r.name));
    var metrics=el('div','sky-guide-metrics');
    [[money(r.rent),'/ month'],[r.area?r.area+' m²':'—','Listed space'],[r.journey?'≈'+r.journey.min+' min':'Verify route',r.journey&&r.journey.fonte==='piedi'?'Est. walk':'To your destination']].forEach(function(pair){var metric=el('div');metric.appendChild(el('strong','',pair[0]));metric.appendChild(el('small','',pair[1]));metrics.appendChild(metric);});content.appendChild(metrics);
    var trade=el('div','sky-guide-tradeoff');
    if(delta.comparable){var bits=[];if(delta.rentDelta!==0)bits.push(money(Math.abs(delta.rentDelta))+'/mo '+(delta.rentDelta>0?'more':'less'));else bits.push('Same monthly rent');if(delta.areaDelta!==null&&delta.areaDelta!==0)bits.push(Math.abs(Math.round(delta.areaDelta*10)/10)+' m² '+(delta.areaDelta>0?'more':'less'));if(delta.minutesDelta!==null&&delta.minutesDelta!==0)bits.push('≈'+Math.abs(delta.minutesDelta)+' min '+(delta.minutesDelta>0?'longer':'shorter'));trade.appendChild(el('strong','',bits.join(' · ')));trade.appendChild(el('small','','Compared with '+delta.referenceName+'. Listed '+delta.kind+'s.'));}
    else{trade.appendChild(el('strong','',r.headroom>0?money(r.headroom)+' below your rent ceiling':r.headroom===0?'At your rent ceiling':'Listed monthly rent'));trade.appendChild(el('small','',delta.reason));}content.appendChild(trade);
    content.appendChild(el('p','sky-guide-availability',r.availability));
    var actions=el('div','sky-guide-actions'),fly=el('button','','Explore this home ↗');fly.type='button';fly.dataset.guideHome=r.id;fly.disabled=!api.markers.some(function(m){return m.getElement().__id===r.id;});actions.appendChild(fly);var detail=el('a','','Details ↗');detail.href=stayLink(r.path);if(parent!==window)detail.target='_top';actions.appendChild(detail);content.appendChild(actions);
    var details=el('details','sky-guide-home-details'),summary=el('summary','','Facts & route');details.open=detailsOpen;details.appendChild(summary);var facts=el('dl','sky-guide-facts');
    function fact(label,value){var row=el('div');row.appendChild(el('dt','',label));row.appendChild(el('dd','',value));facts.appendChild(row);}
    fact('Type as listed',r.type||'To confirm');fact('Listed area',r.area?r.area+' m²':'Area to confirm');fact('Bedrooms',r.bedrooms==null?'To confirm':r.bedrooms===0?'Studio':String(r.bedrooms));fact('Move-in',r.availability);details.appendChild(facts);
    var trip=el('p','sky-guide-trip');if(r.journey){var j=r.journey;trip.appendChild(el('span','','≈'+j.min+' min'+(j.fonte==='piedi'?' walk':'')+' to '+(place?place.nome:'your destination')));trip.appendChild(el('small','',(j.fonte==='rete'?'Timetable model · not live':j.fonte==='piedi'?'Walking estimate · straight-line distance':'Rough distance estimate · route not measured')+(j.precision==='exact'?'':' · approximate starting point')));}else{trip.appendChild(el('span','','Journey to confirm'));trip.appendChild(el('small','','No verified journey estimate to this destination. Check the official address and actual route.'));}if(r.outsideMapTime)trip.appendChild(el('small','','Outside the map’s current time filter. Home details remain available.'));details.appendChild(trip);
    var route=routeFor(r,place);if(route){var directions=el('a','sky-guide-directions',(r.journey&&r.journey.precision==='exact'?'Check route':'Check route from this area')+' in Google Maps ↗');directions.href=route;directions.target='_blank';directions.rel='noopener noreferrer';details.appendChild(directions);}content.appendChild(details);return card;
  }
  function activeIndex(){var body=$('skyGuideResults'),cards=[].slice.call(body.querySelectorAll('.sky-guide-card'));if(!cards.length)return 0;var left=body.getBoundingClientRect().left;return cards.reduce(function(best,c,i){return Math.abs(c.getBoundingClientRect().left-left)<Math.abs(cards[best].getBoundingClientRect().left-left)?i:best;},0);}
  function updatePager(){var count=currentCandidates.length,index=activeIndex();put($('skyGuidePosition'),String(count?index+1:0).padStart(2,'0')+' / '+String(count).padStart(2,'0'));$('skyGuidePrevious').disabled=index===0;$('skyGuideNext').disabled=index>=count-1;dialog.querySelector('.sky-guide-pager').hidden=count<2;}
  function render(){
    var body=$('skyGuideResults'),active=document.activeElement,key=active&&body.contains(active)?{id:active.dataset.guideHome||'',href:active.getAttribute('href')||''}:null;
    var oldCard=body.querySelectorAll('.sky-guide-card')[activeIndex()],oldId=oldCard&&oldCard.dataset.id,top=dialog.scrollTop,left=body.scrollLeft;
    var state=api&&api.state?api.state():window.BoomSkylineState||{},summary=$('skyGuideSummary');
    if(!api||state.catalogueStatus==='error'||state.catalogueStatus==='loading'){
      var message=state.catalogueStatus==='error'?'The catalogue could not be loaded. Close this guide to retry, or open the apartment list.':'Connecting the current homes and the city…';
      if(body.dataset.message!==message){body.replaceChildren(el('p','sky-guide-empty',message));var list=el('a','sky-guide-directions','Open apartment list ↗');list.href=stayLink('/apartments');body.appendChild(list);body.dataset.message=message;}currentCandidates=[];put(summary,'');
    }else{
      var result=BOOM_SKYLINE_GUIDE.rank(snapshot(),{budget:Number($('skyGuideBudget').value),priority:$('skyGuidePriority').value}),place=destination();currentCandidates=result.candidates;
      var label=result.matches+' '+(result.matches===1?'mapped home':'mapped homes')+(result.budget?' within '+money(result.budget)+'/mo':' in the current catalogue');
      var order=result.priority==='rent'?'Lower rent first':result.priority==='space'?'More listed space first':result.journeys?'Shorter estimated journey first':'Journey estimates unavailable · ordered by rent';
      if(summary.dataset.label!==label+'|'+order){summary.replaceChildren(el('span','',label),el('small','',result.matches?order:'Your budget stays yours. No automatic increase.'));summary.dataset.label=label+'|'+order;}
      if(!currentCandidates.length){var emptyKey='empty:'+Number($('skyGuideBudget').value)+':'+api.filter().homesActive;if(body.dataset.message!==emptyKey){body.replaceChildren();var empty=el('div','sky-guide-empty');empty.appendChild(el('strong','','Let’s widen the possibilities.'));empty.appendChild(el('p','','No currently offered homes with a listed rent fit this budget'+(api.filter().homesActive?' in this shared selection':'')+'. Change your brief or ask BOOM to search the wider market.'));var edit=el('button','','Adjust my budget');edit.type='button';edit.dataset.guideEdit='budget';empty.appendChild(edit);var pfs=el('a','sky-guide-directions','Ask BOOM to find my home ↗');pfs.href=stayLink('/property-finding');empty.appendChild(pfs);var all=el('a','sky-guide-directions','Browse all apartments ↗');all.href=stayLink('/apartments');empty.appendChild(all);body.appendChild(empty);body.dataset.message=emptyKey;}}
      else{delete body.dataset.message;[].slice.call(body.children).forEach(function(c){if(!c.classList.contains('sky-guide-card')||!currentCandidates.some(function(r){return r.id===c.dataset.id;}))c.remove();});currentCandidates.forEach(function(r,i){var existing=[].find.call(body.children,function(c){return c.dataset.id===r.id;}),card=makeCard(r,i,result,place,existing);if(body.children[i]!==card)body.insertBefore(card,body.children[i]||null);});}
    }
    updateBrief();updateShare();
    if(key){var replacement=[].find.call(body.querySelectorAll('button,a'),function(n){return key.id?n.dataset.guideHome===key.id:n.getAttribute('href')===key.href;});if(replacement)replacement.focus({preventScroll:true});else{summary.tabIndex=-1;summary.focus({preventScroll:true});}}
    dialog.scrollTop=top;var kept=[].find.call(body.children,function(c){return c.dataset.id===oldId;});if(kept&&body.scrollWidth>body.clientWidth)body.scrollLeft=kept.offsetLeft-body.firstElementChild.offsetLeft;else body.scrollLeft=left;updatePager();
  }
  function open(){
    if(document.documentElement.classList.contains('emb')&&parent!==window){var url=new URL('/skyline',location.origin);url.searchParams.set('guide','1');if(api){var f=api.filter();url.searchParams.set('budget',f.budget);if(f.homesActive)url.searchParams.set('homes',f.homes.join(','));}var meta=$('qfMeta'),minutes=document.querySelector('.qf-min button.on');if(meta&&places.some(function(p){return p.slug===meta.value;}))url.searchParams.set('place',meta.value);if(minutes&&['15','25','40'].indexOf(minutes.dataset.m)>=0)url.searchParams.set('min',minutes.dataset.m);window.top.location.assign(stayLink(url.pathname+url.search));return;}
    opener=document.activeElement;if(!budgetChosen){var n=api?api.filter().budget:query.has('budget')?Number(query.get('budget')):1500;if(!Number.isFinite(n)||n<0)n=1500;setBudget(n);budgetChosen=false;}render();dialog.showModal();requestAnimationFrame(updatePager);
  }
  trigger.addEventListener('click',open);$('skyGuideClose').addEventListener('click',function(){dialog.close();});dialog.addEventListener('close',function(){if(opener&&opener.isConnected)opener.focus({preventScroll:true});});
  dialog.addEventListener('click',function(e){var edit=e.target.closest('[data-guide-edit]');if(edit){setEditor(editor===edit.dataset.guideEdit?null:edit.dataset.guideEdit,true);return;}var priority=e.target.closest('[data-guide-priority]');if(priority){$('skyGuidePriority').value=priority.dataset.guidePriority;rememberBrief(true);render();return;}var budget=e.target.closest('[data-guide-budget]');if(budget&&setBudget(budget.dataset.guideBudget)){rememberBrief(true);render();}});
  $('skyGuideForm').addEventListener('submit',function(e){e.preventDefault();});$('skyGuideForm').addEventListener('change',function(e){if(e.target.id==='skyGuideBudget')budgetChosen=true;rememberBrief(true);render();});
  $('skyGuideDone').addEventListener('click',function(){setEditor(null);$('skyGuideSummary').tabIndex=-1;$('skyGuideSummary').focus({preventScroll:true});});
  $('skyGuideApplyBudget').addEventListener('click',function(){var input=$('skyGuideCustomBudget');if(input.value&&input.reportValidity()&&setBudget(input.value)){rememberBrief(true);render();}});
  $('skyGuideResults').addEventListener('click',function(e){var button=e.target.closest('[data-guide-home]');if(!button){if(e.target.closest('.sky-guide-actions>a'))rememberBrief(true);return;}if(!api)return;if(api.setBudget)api.setBudget(Number($('skyGuideBudget').value));if(api.selectPublicPlace)api.selectPublicPlace($('skyGuidePlace').value);if(api.select(button.dataset.guideHome)){rememberBrief(false);setEditor(null);trigger.textContent='Back to my options';dialog.close();}else{put($('skyGuideSummary'),'This home is outside the other active map filters. Open Details, or clear the commute filter and try again.');}});
  function move(direction){var body=$('skyGuideResults'),cards=body.querySelectorAll('.sky-guide-card'),index=Math.max(0,Math.min(cards.length-1,activeIndex()+direction)),card=cards[index];if(card)body.scrollTo({left:card.offsetLeft-cards[0].offsetLeft,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}
  $('skyGuidePrevious').addEventListener('click',function(){move(-1);});$('skyGuideNext').addEventListener('click',function(){move(1);});$('skyGuideResults').addEventListener('scroll',function(){if(!railFrame)railFrame=requestAnimationFrame(function(){railFrame=0;updatePager();});},{passive:true});
  $('skyGuideShareHomes').addEventListener('change',updateShare);$('skyGuideShareStay').addEventListener('change',updateShare);
  $('skyGuideCopy').addEventListener('click',async function(){var value=shareLink();$('skyGuideShareURL').value=value;try{await navigator.clipboard.writeText(value);put($('skyGuideCopyStatus'),'Link copied. Your personal places stay private.');}catch(_){$('skyGuideShareURL').focus();$('skyGuideShareURL').select();put($('skyGuideCopyStatus'),'Select and copy this link.');}});
  function ready(e){api=e&&e.detail&&e.detail.api||window.BoomSkyline;if(dialog.open)render();if(query.get('guide')==='1'&&!document.documentElement.classList.contains('emb')){query.delete('guide');open();}}
  window.addEventListener('boom:skyline-ready',ready);window.addEventListener('boom:skyline-journeys',function(){if(dialog.open)render();});window.addEventListener('boom:skyline-state',function(){if(dialog.open)render();});if(window.BoomSkyline)ready();
})();
