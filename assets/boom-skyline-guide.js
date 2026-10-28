/* A small, explainable decision guide over Skyline's existing catalogue and journeys. */
(function(){
  'use strict';
  var api=null,opener=null,budgetChosen=false,query=new URLSearchParams(location.search);
  var $=function(id){return document.getElementById(id);};
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function money(n){return '€'+Math.round(n).toLocaleString('en-US');}
  var dialog=el('dialog','sky-guide');dialog.id='skyGuide';dialog.setAttribute('aria-labelledby','skyGuideTitle');
  dialog.innerHTML='<header class="sky-guide-header"><div><span class="sky-guide-kicker">BOOM / SKYLINE · YOUR ROME, YOUR BALANCE</span><h2 id="skyGuideTitle">A little further.<br>A different possibility.</h2><p>Start with the place you want to reach. See what your rent budget buys across Rome — and which trade-off feels right for you.</p></div><button type="button" class="sky-guide-close" id="skyGuideClose" aria-label="Close the home guide">×</button></header>'
    +'<form class="sky-guide-form" id="skyGuideForm"><label><b>01</b> Monthly rent<select id="skyGuideBudget" aria-label="Your monthly rent budget"><option value="1500">Up to €1,500</option><option value="1000">Up to €1,000</option><option value="2000">Up to €2,000</option><option value="2500">Up to €2,500</option><option value="3500">Up to €3,500</option><option value="0">Explore every budget</option></select></label>'
    +'<label><b>02</b> My everyday destination<select id="skyGuidePlace" aria-label="Your public destination"></select></label>'
    +'<label><b>03</b> What matters most?<select id="skyGuidePriority" aria-label="Your priority"><option value="rent">Keep more of my budget</option><option value="space">Have more space</option><option value="commute">Be closer to my destination</option></select></label></form>'
    +'<div class="sky-guide-summary" role="status" aria-live="polite" id="skyGuideSummary"></div><div class="sky-guide-results" id="skyGuideResults"></div>'
    +'<footer class="sky-guide-footer"><p>Monthly rent, before bills and fees. Travel times are estimates, not live departures. Check the route and each home’s dates, stay terms and full cost before deciding.</p><a href="/property-finding">Need a wider search? ↗</a></footer>';
  document.body.appendChild(dialog);
  var trigger=el('button','sky-guide-trigger','Find my balance');trigger.type='button';trigger.id='skyGuideOpen';trigger.setAttribute('aria-haspopup','dialog');
  var tools=document.querySelector('.sky-flight-tools');if(tools)tools.prepend(trigger);
  var places=window.BOOM_MAPPA&&BOOM_MAPPA.METE||[];
  places.forEach(function(p){var o=el('option','',p.nome);o.value=p.slug;$('skyGuidePlace').appendChild(o);});
  if(places.some(function(p){return p.slug===query.get('place');}))$('skyGuidePlace').value=query.get('place');
  else $('skyGuidePlace').value='colosseo';
  function stayLink(path){
    if(!window.BOOM_STAY)return path;
    var stay=BOOM_STAY.read(location.search);
    // The embed inherits only the requested stay from its same-origin host.
    // Personal saved places are never copied into navigation or Google URLs.
    if(!stay&&parent!==window)try{if(parent.location.origin===location.origin)stay=BOOM_STAY.read(parent.location.search);}catch(_){}
    return BOOM_STAY.withStay(path,stay);
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
    renderBody();
    if(key){
      var replacement=Array.prototype.find.call(body.querySelectorAll('button,a'),function(n){return key.id?n.dataset.guideHome===key.id:n.getAttribute('href')===key.href;});
      if(replacement)replacement.focus({preventScroll:true});
      else{$('skyGuideSummary').tabIndex=-1;$('skyGuideSummary').focus({preventScroll:true});}
      dialog.scrollTop=scroll;
    }
  }
  function renderBody(){
    var body=$('skyGuideResults'),summary=$('skyGuideSummary');body.replaceChildren();summary.replaceChildren();
    var state=api&&api.state?api.state():window.BoomSkylineState||{};
    if(!api||state.catalogueStatus==='error'||state.catalogueStatus==='loading'){
      body.appendChild(el('p','sky-guide-empty',state.catalogueStatus==='error'?'The catalogue could not be loaded. Close this guide to retry, or open the apartment list.':'Connecting the current homes and the city…'));
      var retryList=el('a','sky-guide-directions','Open apartment list ↗');retryList.href=stayLink('/apartments');body.appendChild(retryList);return;
    }
    var result=BOOM_SKYLINE_GUIDE.rank(snapshot(),{budget:Number($('skyGuideBudget').value),priority:$('skyGuidePriority').value}),place=destination();
    summary.appendChild(el('span','',result.matches+' '+(result.matches===1?'mapped home':'mapped homes')+(result.budget?' within '+money(result.budget)+'/mo':' in the current catalogue')));
    var sortedBy=result.priority==='rent'?'lowest rent':result.priority==='space'?'largest listed floor area':'shortest estimated journey';
    summary.appendChild(el('small','',result.matches?'Showing '+Math.min(3,result.matches)+' · ordered by '+sortedBy:'Your budget stays yours. No automatic increase.'));
    if(!result.candidates.length){var empty=el('div','sky-guide-empty');empty.appendChild(el('strong','','Let’s find another way in.'));empty.appendChild(el('p','','There are no currently offered homes with a listed rent inside this budget'+(api.filter().homes.length?' in this shared selection':'')+'. Try another budget above, browse the apartment list, or ask BOOM to search the wider market.'));var a=el('a','sky-guide-directions','Browse all apartments ↗');a.href=stayLink('/apartments');if(parent!==window)a.target='_top';empty.appendChild(a);body.appendChild(empty);return;}
    result.candidates.forEach(function(r,i){
      var card=el('article','sky-guide-card'),media=el('div','sky-guide-media');
      if(r.image){var img=el('img');img.src=r.image;img.alt=r.name;img.loading='lazy';img.addEventListener('error',function(){this.replaceWith(el('span','','Photo unavailable'));},{once:true});media.appendChild(img);}else media.appendChild(el('span','','Photo unavailable'));
      media.appendChild(el('span','',String(i+1).padStart(2,'0')+' / EXPLORE'));card.appendChild(media);
      var content=el('div','sky-guide-content');content.appendChild(el('span','sky-guide-zone',r.zone));content.appendChild(el('h3','',r.name));
      var price=el('p','sky-guide-rent',money(r.rent));price.appendChild(el('small','','/ month'));content.appendChild(price);
      content.appendChild(el('p','sky-guide-headroom',r.headroom===null?'Listed monthly rent':r.headroom===0?'At your rent budget':money(r.headroom)+' below your rent budget'));
      var facts=el('dl','sky-guide-facts');function fact(label,value){var row=el('div');row.appendChild(el('dt','',label));row.appendChild(el('dd','',value));facts.appendChild(row);}
      fact('Type as listed',r.type||'To confirm');fact('Listed area',r.area?r.area+' m²':'Area to confirm');fact('Bedrooms',r.bedrooms==null?'To confirm':r.bedrooms===0?'Studio':String(r.bedrooms));fact('Move-in',r.availability);content.appendChild(facts);
      var trip=el('p','sky-guide-trip');
      if(r.journey){var j=r.journey;trip.appendChild(el('span','','≈'+j.min+' min'+(j.fonte==='piedi'?' walk':'')+' to '+place.nome));trip.appendChild(el('small','',(j.fonte==='rete'?'Timetable model · not live':j.fonte==='piedi'?'Walking estimate · straight-line distance':'Rough distance estimate · route not measured')+(j.precision==='exact'?'':' · approximate starting point')));}
      else {trip.appendChild(el('span','','Journey to '+(place?place.nome:'your destination')+' to confirm'));trip.appendChild(el('small','','No usable location or travel data for this home.'));}
      if(r.outsideMapTime)trip.appendChild(el('small','','Outside the map’s current time filter. You can still explore the home details.'));
      content.appendChild(trip);
      var actions=el('div','sky-guide-actions'),fly=el('button','','See on map ↗');fly.type='button';fly.dataset.guideHome=r.id;
      fly.disabled=!api.markers.some(function(m){return m.getElement().__id===r.id;});if(fly.disabled)fly.title='Location not available on Skyline';actions.appendChild(fly);
      var detail=el('a','','Home details ↗');detail.href=stayLink(r.path);if(parent!==window)detail.target='_top';actions.appendChild(detail);content.appendChild(actions);
      var route=BOOM_SKYLINE_GUIDE.directions(r.journey);if(route){var directions=el('a','sky-guide-directions',(r.journey.precision==='exact'?'Check route':'Check route from this area')+' in Google Maps ↗');directions.href=route;directions.target='_blank';directions.rel='noopener noreferrer';content.appendChild(directions);}
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
    api.selectPublicPlace($('skyGuidePlace').value);
    if(api.select(button.dataset.guideHome)){dialog.close();}
    else{$('skyGuideSummary').textContent='This home is outside the other active map filters. Open Home details, or clear the commute filter and try again.';}
  });
  function ready(e){api=e&&e.detail&&e.detail.api||window.BoomSkyline;if(dialog.open)render();if(query.get('guide')==='1'&&!document.documentElement.classList.contains('emb')){query.delete('guide');open();}}
  window.addEventListener('boom:skyline-ready',ready);window.addEventListener('boom:skyline-journeys',function(){if(dialog.open)render();});window.addEventListener('boom:skyline-state',function(){if(dialog.open)render();});
  if(window.BoomSkyline)ready();
})();
