/* A small, explainable decision guide over Skyline's existing catalogue and journeys. */
(function(){
  'use strict';
  var api=null,opener=null,budgetChosen=false,currentCandidates=[],query=new URLSearchParams(location.search);
  var $=function(id){return document.getElementById(id);};
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function money(n){return '€'+Math.round(n).toLocaleString('en-US');}
  var dialog=el('dialog','sky-guide');dialog.id='skyGuide';dialog.setAttribute('aria-labelledby','skyGuideTitle');
  dialog.innerHTML='<header class="sky-guide-header"><div><span class="sky-guide-kicker">BOOM / SKYLINE · YOUR ROME, YOUR BALANCE</span><h2 id="skyGuideTitle">Your Rome.<br>Find your balance.</h2><p>The right door starts with your everyday destination. Compare current homes, understand the trade-offs, then keep or share your plan.</p></div><button type="button" class="sky-guide-close" id="skyGuideClose" aria-label="Close the home guide">×</button></header>'
    +'<form class="sky-guide-form" id="skyGuideForm"><label><b>01</b> Monthly rent<select id="skyGuideBudget" aria-label="Your monthly rent budget"><option value="1500">Up to €1,500</option><option value="1000">Up to €1,000</option><option value="2000">Up to €2,000</option><option value="2500">Up to €2,500</option><option value="3500">Up to €3,500</option><option value="0">Explore every budget</option></select></label>'
    +'<label><b>02</b> My everyday destination<select id="skyGuidePlace" aria-label="Your public destination"></select></label>'
    +'<label><b>03</b> What matters most?<select id="skyGuidePriority" aria-label="Your priority"><option value="rent">Keep more of my budget</option><option value="space">Have more space</option><option value="commute">Be closer to my destination</option></select></label></form>'
    +'<div class="sky-guide-destination" id="skyGuideDestination"></div>'
    +'<details class="sky-guide-share" id="skyGuideShare"><summary>Share this plan ↗</summary><div><p>Share your rent budget, public destination, priority and requested stay. Personal saved places and contact details never enter this link.</p><label><input type="checkbox" id="skyGuideShareHomes"> Include the homes shown below (up to 3)</label><label><input type="checkbox" id="skyGuideShareStay"> Include my requested stay / dates</label><p class="sky-guide-share-note">Anyone with the link can see these preferences. Prices and availability will be read again when they open it.</p><div class="sky-guide-copy"><input id="skyGuideShareURL" aria-label="Public plan link" readonly><button type="button" id="skyGuideCopy">Copy link</button></div><span role="status" id="skyGuideCopyStatus"></span></div></details>'
    +'<div class="sky-guide-summary" role="status" aria-live="polite" id="skyGuideSummary"></div><div class="sky-guide-results" id="skyGuideResults"></div>'
    +'<section class="sky-guide-help" aria-label="Choose your next step"><a id="skyGuidePFS" href="/property-finding"><span>NEED MORE OPTIONS</span><strong>Give BOOM your search.</strong><small>Property Finding · a personal search beyond this catalogue. See scope, fees and terms. ↗</small></a><a id="skyGuideDAS" href="/deal-assistance"><span>ALREADY FOUND A HOME</span><strong>Take the next step with help.</strong><small>Deal Assistance · support for a home you found elsewhere. See what is included. ↗</small></a></section>'
    +'<footer class="sky-guide-footer"><p>Monthly rent, before bills and fees. Travel times are estimates, not live departures. Confirm the teaching address, actual route, dates, stay terms and full cost before deciding.</p><a href="/your-rome">Campus guide & method ↗</a></footer>';
  document.body.appendChild(dialog);
  var trigger=el('button','sky-guide-trigger','Find my balance');trigger.type='button';trigger.id='skyGuideOpen';trigger.setAttribute('aria-haspopup','dialog');
  var tools=document.querySelector('.sky-flight-tools');if(tools)tools.prepend(trigger);
  var places=window.BOOM_MAPPA&&(BOOM_MAPPA.DESTINATIONS||BOOM_MAPPA.METE)||[],groups=Object.create(null);
  places.forEach(function(p){var group=p.group||'Rome';if(!groups[group]){groups[group]=el('optgroup');groups[group].label=group;$('skyGuidePlace').appendChild(groups[group]);}var o=el('option','',p.nome);o.value=p.slug;groups[group].appendChild(o);});
  if(['rent','space','commute'].indexOf(query.get('priority'))>=0)$('skyGuidePriority').value=query.get('priority');
  if(places.some(function(p){return p.slug===query.get('place');}))$('skyGuidePlace').value=query.get('place');
  else $('skyGuidePlace').value='colosseo';
  function stayLink(path){
    if(!window.BOOM_STAY)return path;
    var S=BOOM_STAY,read=S.intent||S.read,stay=read(location.search);
    var empty=stay&&typeof stay==='object'?!stay.moveIn&&!stay.moveOut&&!stay.durationMonths:!stay;
    if(empty&&parent!==window)try{if(parent.location.origin===location.origin)stay=read(parent.location.search);}catch(_){}
    return S.withIntent?S.withIntent(path,stay):S.withStay(path,stay);
  }
  function shareLink(){
    var paths=BOOM_SKYLINE_GUIDE.share({budget:Number($('skyGuideBudget').value),priority:$('skyGuidePriority').value,
      place:$('skyGuidePlace').value,includeHomes:$('skyGuideShareHomes').checked,homes:currentCandidates.map(function(r){return r.id;})},
      places,api&&api.catalogue?api.catalogue().map(function(l){return String(l.id);}):[]);
    return 'https://www.boomrome.com'+($('skyGuideShareStay').checked?stayLink(paths):paths);
  }
  function updateShare(){
    $('skyGuideShareURL').value=shareLink();$('skyGuideCopyStatus').textContent='';
    // Service pages receive only the same safe public preferences. They own their
    // enquiry forms and checkout; this guide creates neither a lead nor a payment.
    var qs=new URL(shareLink()).searchParams;qs.delete('guide');qs.delete('homes');
    $('skyGuidePFS').href=stayLink('/property-finding?'+qs.toString());$('skyGuideDAS').href=stayLink('/deal-assistance?'+qs.toString());
  }
  function showDestination(){
    var p=destination(),node=$('skyGuideDestination');node.replaceChildren();if(!p)return;
    var text=el('div');text.appendChild(el('strong','',p.address||p.che||p.nome));
    if(p.address)text.appendChild(el('small','',p.che||'Confirm this is the teaching venue on your timetable.'));
    node.appendChild(text);
    if(p.source){var source=el('a','','Official campus ↗');source.href=p.source;source.target='_blank';source.rel='noopener noreferrer';node.appendChild(source);}
    var url=window.BOOM_MAPPA&&BOOM_MAPPA.destinationMap?BOOM_MAPPA.destinationMap(p):null;
    if(url){var map=el('a','','Check campus map ↗');map.href=url;map.target='_blank';map.rel='noopener noreferrer';node.appendChild(map);}
  }
  function destination(){return places.find(function(p){return p.slug===$('skyGuidePlace').value;});}
  function snapshot(){
    if(!api||!api.catalogue||!window.BOOM_FLIGHT)return [];
    var catalogue=api.catalogue(),filter=api.filter(),scope=filter.homes;
    var mapped=new Set(api.markers.map(function(m){return m.getElement().__id;}));
    return catalogue.filter(function(l){return mapped.has(String(l.id))&&(!filter.homesActive||scope.indexOf(String(l.id))>=0);}).map(function(l){
      var record=BOOM_FLIGHT.compare([BOOM_FLIGHT.listing(l.id)],catalogue,{facts:window.BOOM_FACTS,dispo:window.BOOM_DISPO,geo:window.BOOM_GEO})[0];
      if(record){
        record.journey=api.journeyFor?api.journeyFor(record.id,$('skyGuidePlace').value):null;
        record.type=typeof l.type==='string'?l.type.trim():'';
        var marker=api.markers.find(function(m){return m.getElement().__id===record.id;});
        record.outsideMapTime=!!(marker&&marker.getElement().classList.contains('fuoriTempo'));
      }
      return record;
    }).filter(Boolean);
  }
  function render(){
    var active=document.activeElement,body=$('skyGuideResults'),key=null;
    if(active&&body.contains(active))key={id:active.dataset.guideHome||'',href:active.getAttribute('href')||''};
    var scroll=dialog.scrollTop;
    renderBody();showDestination();updateShare();
    if(key){
      var replacement=Array.prototype.find.call(body.querySelectorAll('button,a'),function(n){return key.id?n.dataset.guideHome===key.id:n.getAttribute('href')===key.href;});
      if(replacement)replacement.focus({preventScroll:true});
      else{$('skyGuideSummary').tabIndex=-1;$('skyGuideSummary').focus({preventScroll:true});}
      dialog.scrollTop=scroll;
    }
  }
  function renderBody(){
    var body=$('skyGuideResults'),summary=$('skyGuideSummary');body.replaceChildren();summary.replaceChildren();currentCandidates=[];
    var state=api&&api.state?api.state():window.BoomSkylineState||{};
    if(!api||state.catalogueStatus==='error'||state.catalogueStatus==='loading'){
      body.appendChild(el('p','sky-guide-empty',state.catalogueStatus==='error'?'The catalogue could not be loaded. Close this guide to retry, or open the apartment list.':'Connecting the current homes and the city…'));
      var retryList=el('a','sky-guide-directions','Open apartment list ↗');retryList.href=stayLink('/apartments');body.appendChild(retryList);return;
    }
    var result=BOOM_SKYLINE_GUIDE.rank(snapshot(),{budget:Number($('skyGuideBudget').value),priority:$('skyGuidePriority').value}),place=destination();
    summary.appendChild(el('span','',result.matches+' '+(result.matches===1?'mapped home':'mapped homes')+(result.budget?' within '+money(result.budget)+'/mo':' in the current catalogue')));
    currentCandidates=result.candidates;
    var sortedBy=result.priority==='rent'?'lowest rent':result.priority==='space'?'largest listed floor area':'shortest estimated journey';
    summary.appendChild(el('small','',result.matches?(result.priority==='commute'&&!result.journeys?'Journey estimates unavailable for this destination · ordered by rent. Check the route in Google Maps.':'Showing '+Math.min(3,result.matches)+' · ordered by '+sortedBy):'Your budget stays yours. No automatic increase.'));
    if(!result.candidates.length){var empty=el('div','sky-guide-empty');empty.appendChild(el('strong','','Let’s find another way in.'));empty.appendChild(el('p','','There are no currently offered homes with a listed rent inside this budget'+(api.filter().homesActive?' in this shared selection':'')+'. Try another budget above, browse the apartment list, or ask BOOM to search the wider market.'));var a=el('a','sky-guide-directions','Browse all apartments ↗');a.href=stayLink('/apartments');if(parent!==window)a.target='_top';empty.appendChild(a);body.appendChild(empty);return;}
    result.candidates.forEach(function(r,i){
      var card=el('article','sky-guide-card'),media=el('div','sky-guide-media');
      if(r.image){var img=el('img');img.src=r.image;img.alt=r.name;img.loading='lazy';img.addEventListener('error',function(){this.replaceWith(el('span','','Photo unavailable'));},{once:true});media.appendChild(img);}else media.appendChild(el('span','','Photo unavailable'));
      media.appendChild(el('span','',String(i+1).padStart(2,'0')+' / EXPLORE'));card.appendChild(media);
      var content=el('div','sky-guide-content');content.appendChild(el('span','sky-guide-zone',r.zone));content.appendChild(el('h3','',r.name));
      var price=el('p','sky-guide-rent',money(r.rent));price.appendChild(el('small','','/ month'));content.appendChild(price);
      content.appendChild(el('p','sky-guide-headroom',r.headroom===null?'Listed monthly rent':r.headroom===0?'At your rent budget':money(r.headroom)+' below your rent budget'));
      var why=el('div','sky-guide-why');why.appendChild(el('strong','','WHY THIS OPTION'));BOOM_SKYLINE_GUIDE.reasons(r,result).forEach(function(reason){why.appendChild(el('p','',reason));});content.appendChild(why);
      var facts=el('dl','sky-guide-facts');function fact(label,value){var row=el('div');row.appendChild(el('dt','',label));row.appendChild(el('dd','',value));facts.appendChild(row);}
      fact('Type as listed',r.type||'To confirm');fact('Listed area',r.area?r.area+' m²':'Area to confirm');fact('Bedrooms',r.bedrooms==null?'To confirm':r.bedrooms===0?'Studio':String(r.bedrooms));fact('Move-in',r.availability);content.appendChild(facts);
      var trip=el('p','sky-guide-trip');
      if(r.journey){var j=r.journey;trip.appendChild(el('span','','≈'+j.min+' min'+(j.fonte==='piedi'?' walk':'')+' to '+(place?place.nome:'your destination')));trip.appendChild(el('small','',(j.fonte==='rete'?'Timetable model · not live':j.fonte==='piedi'?'Walking estimate · straight-line distance':'Rough distance estimate · route not measured')+(j.precision==='exact'?'':' · approximate starting point')));}
      else {trip.appendChild(el('span','','Journey to '+(place?place.nome:'your destination')+' to confirm'));trip.appendChild(el('small','',place&&place.address&&!(window.BOOM_MAPPA&&BOOM_MAPPA.mappedDestination&&BOOM_MAPPA.mappedDestination(place))?'We do not estimate minutes to an unverified campus point. Check the official address and actual route.':'No usable travel estimate for this home yet. Check the actual route before deciding.'));}
      if(r.outsideMapTime)trip.appendChild(el('small','','Outside the map’s current time filter. You can still explore the home details.'));
      content.appendChild(trip);
      var actions=el('div','sky-guide-actions'),fly=el('button','','See on map ↗');fly.type='button';fly.dataset.guideHome=r.id;
      fly.disabled=!api.markers.some(function(m){return m.getElement().__id===r.id;});if(fly.disabled)fly.title='Location not available on Skyline';actions.appendChild(fly);
      var detail=el('a','','Home details ↗');detail.href=stayLink(r.path);if(parent!==window)detail.target='_top';actions.appendChild(detail);content.appendChild(actions);
      var route=BOOM_SKYLINE_GUIDE.directions(r.journey);if(!route&&place&&place.address){var pin=api.markers.find(function(m){return m.getElement().__id===r.id;}),co=pin&&pin.getElement().__co;if(co&&typeof co[0]==='number'&&typeof co[1]==='number')route=BOOM_SKYLINE_GUIDE.addressDirections({lat:co[1],lng:co[0]},place.address);else if(BOOM_MAPPA.destinationMap)route=BOOM_MAPPA.destinationMap(place);}
      if(route){var directions=el('a','sky-guide-directions',(r.journey&&r.journey.precision==='exact'?'Check route':r.journey?'Check route from this area':'Check campus / route')+' in Google Maps ↗');directions.href=route;directions.target='_blank';directions.rel='noopener noreferrer';content.appendChild(directions);}
      card.appendChild(content);body.appendChild(card);
    });
  }
  function open(){
    if(document.documentElement.classList.contains('emb')&&parent!==window){
      var url=new URL('/skyline',location.origin);url.searchParams.set('guide','1');
      if(api){var f=api.filter();url.searchParams.set('budget',f.budget);if(f.homesActive)url.searchParams.set('homes',f.homes.join(','));}
      var meta=$('qfMeta'),minutes=document.querySelector('.qf-min button.on');
      if(meta&&places.some(function(p){return p.slug===meta.value;}))url.searchParams.set('place',meta.value);
      if(minutes&&['15','25','40'].indexOf(minutes.dataset.m)>=0)url.searchParams.set('min',minutes.dataset.m);
      window.top.location.assign(stayLink(url.pathname+url.search));return;
    }
    opener=document.activeElement;
    var budget=budgetChosen?Number($('skyGuideBudget').value):api?api.filter().budget:query.has('budget')?Number(query.get('budget')):1500;
    if(!Number.isFinite(budget)||budget<0)budget=1500;
    if(![].some.call($('skyGuideBudget').options,function(o){return Number(o.value)===budget;})){var custom=el('option','','Up to '+money(budget));custom.value=budget;$('skyGuideBudget').appendChild(custom);}
    $('skyGuideBudget').value=String(budget);render();dialog.showModal();
  }
  trigger.addEventListener('click',open);$('skyGuideClose').addEventListener('click',function(){dialog.close();});dialog.addEventListener('close',function(){if(opener&&opener.isConnected)opener.focus({preventScroll:true});});
  $('skyGuideForm').addEventListener('submit',function(e){e.preventDefault();});$('skyGuideForm').addEventListener('change',function(e){if(e.target.id==='skyGuideBudget')budgetChosen=true;render();});
  $('skyGuideResults').addEventListener('click',function(e){var button=e.target.closest('[data-guide-home]');if(!button||!api)return;
    if(api.setBudget)api.setBudget(Number($('skyGuideBudget').value));
    if(api.selectPublicPlace)api.selectPublicPlace($('skyGuidePlace').value);
    if(api.select(button.dataset.guideHome)){dialog.close();}
    else{$('skyGuideSummary').textContent='This home is outside the other active map filters. Open Home details, or clear the commute filter and try again.';}
  });
  $('skyGuideShareHomes').addEventListener('change',updateShare);$('skyGuideShareStay').addEventListener('change',updateShare);
  $('skyGuideCopy').addEventListener('click',async function(){var value=shareLink();$('skyGuideShareURL').value=value;try{await navigator.clipboard.writeText(value);$('skyGuideCopyStatus').textContent='Link copied. Your personal places stay private.';}catch(_){$('skyGuideShareURL').focus();$('skyGuideShareURL').select();$('skyGuideCopyStatus').textContent='Select and copy this link.';}});
  function ready(e){api=e&&e.detail&&e.detail.api||window.BoomSkyline;if(dialog.open)render();if(query.get('guide')==='1'&&!document.documentElement.classList.contains('emb')){query.delete('guide');open();}}
  window.addEventListener('boom:skyline-ready',ready);window.addEventListener('boom:skyline-journeys',function(){if(dialog.open)render();});window.addEventListener('boom:skyline-state',function(){if(dialog.open)render();});
  if(window.BoomSkyline)ready();
})();
