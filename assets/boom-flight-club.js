/* Club connects the existing catalogue, destination registry, Skyline model and
 * service forms. Personal places use boom:pois; no second catalogue or lead store. */
(function () {
  'use strict';
  if (document.body.dataset.direction !== 'club') return;
  var P=window.BOOM_MAPPA,G=window.BOOM_SKYLINE_GUIDE,M=window.BoomNextMap,J=window.BOOM_JOURNEY;
  if(!P||!G||!M||!J)return;
  var hooks=null,context=null,opener=null,mode='campus',hits=[],request=null,requestNumber=0;
  var showBalanceEntry=new URLSearchParams(location.search).get('edition')==='club';
  function el(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function money(v){return v==null?'Not listed':'€'+Number(v).toLocaleString('en-GB');}
  function place(){return context&&(context.state.privatePlace||P.destination(context.state.place));}
  function placeName(p){return p&&(p.nome||p.name)||'';}
  function brief(){var s=context.state;return Object.assign({},s.stay,{place:s.place,budget:s.budget?Number(s.budget):null,people:s.people,type:s.type,homes:s.homes||[]});}
  function intent(href){return context?J.withIntent(href,brief()):href;}
  function origin(c){var r=c.raw||{},lat=Number(r.lat),lng=Number(r.lng);return Number.isFinite(lat)&&Number.isFinite(lng)&&lat!==0&&lng!==0?{lat:lat,lng:lng}:null;}
  function evidence(c){
    var p=place();if(!p)return null;
    var known=context.state.place&&M.journeyFor(c.id,context.state.place);if(known)return known;
    var a=origin(c);if(!a||!P.mappedDestination(p))return null;
    var t=P.tempo(P.km(a.lat,a.lng,p.lat,p.lng),null);
    return t&&Object.assign({},t,{origin:a,destination:{lat:p.lat,lng:p.lng,slug:p.slug||'',name:placeName(p)},precision:window.BOOM_GEO?window.BOOM_GEO.pinPrecision(c.raw).level:'zone'});
  }
  function route(c,j){var p=place();if(!p)return '';return G.directions(j)||(p.address?G.addressDirections(origin(c),p.address):null)||P.destinationMap(p)||'';}
  function travel(j){return !j?'Route to check':j.fonte==='rete'?'≈'+j.min+' min · transit model':j.fonte==='piedi'?'≈'+j.min+' min · walking estimate':'Route to check';}
  function evidenceNote(j){
    if(!j)return 'A journey time is not available here. Check the route for your actual travel time.';
    var precision=j.precision==='zone'?' The home pin represents an approximate area.':'';
    return (j.fonte==='rete'?'Static weekday transit model, not live departures. Check the route before choosing.':j.fonte==='piedi'?'Walking estimate from straight-line distance; streets and crossings may add time.':'Distance alone cannot predict a commute across Rome. Check the route.')+precision;
  }
  function options(){
    var q=el('nextDestinationQuery').value.trim().toLowerCase();
    el('nextDestinationSearch').hidden=mode==='campus';
    el('nextDestinationPrivacy').textContent=mode==='campus'?'Choose your teaching venue, not just the university.':'Search is sent to Photon / OpenStreetMap when you press Search. Saved places stay in this browser and are excluded from shared links.';
    el('nextDestinationQuery').placeholder=mode==='campus'?'LUISS, Sapienza, RUFA…':'Workplace, street or another place in Rome';
    var list=mode==='campus'?P.DESTINATIONS.slice().sort(function(a,b){return (a.tipo==='ateneo'?0:1)-(b.tipo==='ateneo'?0:1);}).filter(function(p){return [p.nome,p.institution,p.address,p.che].join(' ').toLowerCase().includes(q);}):[];
    el('nextDestinationOptions').innerHTML=mode==='campus'?(list.map(function(p){return '<button type="button" class="destination-option" data-destination="'+esc(p.slug)+'"><strong>'+esc(p.nome)+'</strong><span>'+esc(p.address||p.che||p.group)+'</span><span aria-hidden="true">↗</span></button>';}).join('')||'<p class="destination-empty">No campus found. Try another name, or search for its address.</p>'):'';
    var saved=P.posti();el('nextDestinationPrivate').hidden=mode!=='work';
    el('nextDestinationPrivate').innerHTML=mode==='work'&&saved.length?'<p class="eyebrow">YOUR SAVED PLACES</p>'+saved.map(function(p,i){return '<button class="destination-option" type="button" data-private-place="'+i+'"><strong>'+esc(p.name)+'</strong><span>Saved on this browser</span><span aria-hidden="true">↗</span></button>';}).join(''):'';
    document.querySelectorAll('[data-destination-mode]').forEach(function(b){b.setAttribute('aria-pressed',String(mode===b.dataset.destinationMode));});
  }
  function open(button){opener=button||document.activeElement;mode='campus';el('nextDestinationQuery').value='';options();el('nextDestinationDialog').showModal();el('nextDestinationQuery').focus();}
  function choose(slug,privatePlace){if(privatePlace&&M.refreshPlaces)M.refreshPlaces();hooks.destination(slug||'',privatePlace||null);el('nextDestinationDialog').close();}
  async function search(){
    var q=el('nextDestinationQuery').value.trim(),output=el('nextDestinationOptions');
    if(q.length<3){output.innerHTML='<p class="destination-empty">Enter at least three characters.</p>';return;}
    if(request)request.abort();request=new AbortController();var number=++requestNumber;
    output.innerHTML='<p role="status" class="destination-empty">Finding your place…</p>';hits=[];
    var timer=setTimeout(function(){if(number===requestNumber)request.abort();},10000);
    try{
      var res=await fetch('https://photon.komoot.io/api/?q='+encodeURIComponent(q)+'&lat=41.893&lon=12.483&limit=6&lang=en&zoom=12',{signal:request.signal});
      if(!res.ok)throw new Error('unavailable');var json=await res.json();if(number!==requestNumber||mode!=='work'||!el('nextDestinationDialog').open)return;
      hits=(json.features||[]).map(function(f){var p=f.properties||{},co=f.geometry&&f.geometry.coordinates;return co&&{name:[p.name||p.street,p.housenumber].filter(Boolean).join(' '),label:[p.street,p.housenumber,p.district||p.suburb,p.city].filter(Boolean).join(', '),lat:co[1],lng:co[0]};}).filter(function(p){return p&&p.name&&typeof p.lat==='number'&&typeof p.lng==='number'&&p.lat>41.5&&p.lat<42.3&&p.lng>11.9&&p.lng<13.1;}).slice(0,6);
      output.innerHTML=hits.map(function(p,i){return '<button class="destination-option" type="button" data-found-place="'+i+'"><strong>'+esc(p.name)+'</strong><span>'+esc(p.label)+'</span><span aria-hidden="true">＋</span></button>';}).join('')||'<p class="destination-empty">No result around Rome. Try the full street name and number.</p>';
    }catch(_){if(number===requestNumber&&el('nextDestinationDialog').open&&mode==='work')output.innerHTML='<p class="destination-empty" role="status">Place search is unavailable. Try again, choose a saved place or continue exploring.</p>';}
    finally{clearTimeout(timer);}
  }
  function comparison(r){
    var x=r.reason||{};if(!x.referenceName)return 'Advertised rent. Bills, agency fees and lease conditions are checked separately.';
    var parts=[];
    if(x.areaDelta>0&&r.category==='space')parts.push(x.areaDelta+' m² more');
    if(x.minutesDelta<0&&r.category==='commute')parts.push(Math.abs(x.minutesDelta)+' min less in the same transit model');
    if(x.rentDelta>0)parts.push(money(x.rentDelta)+' more per month');else if(x.rentDelta<0)parts.push(money(-x.rentDelta)+' less per month');else parts.push('the same monthly rent');
    return parts.join(' · ')+', compared with '+x.referenceName+' ('+kindLabel(x.kind).toLowerCase()+').';
  }
  function kindLabel(kind){return {apartment:'Entire home',room:'Room','private room':'Private room','shared room':'Shared room'}[kind]||'Type to confirm';}
  function secondaryReasons(r){
    return (r.reasons||[]).filter(function(x){return x.category!==r.category&&x.referenceName&&x.kind&&x.kind===G.homeKind(r.type);}).map(function(x){
      var benefit='';
      if(x.category==='commute'&&x.basis==='timetable-model'&&r.journey&&r.journey.fonte==='rete'&&Number.isFinite(x.minutesDelta)&&x.minutesDelta<0)benefit=Math.abs(x.minutesDelta)+' min less in the same transit model';
      else if(x.category==='space'&&Number.isFinite(x.areaDelta)&&x.areaDelta>0)benefit=x.areaDelta+' m² more listed space';
      else if(x.category==='rent'&&Number.isFinite(x.rentDelta)&&x.rentDelta<0)benefit=money(-x.rentDelta)+' less per month';
      return benefit?benefit+', compared with '+x.referenceName+' ('+kindLabel(x.kind).toLowerCase()+').':'';
    }).filter(Boolean).join(' ');
  }
  function balanceCard(r,i,p){
    var c=context.catalogue.find(function(c){return c.id===r.id;}),kind=G.homeKind(c.type),link=p&&route(c,r.journey),extra=secondaryReasons(r);
    var title={rent:r.reason.label,space:'More listed space',commute:'Shorter modelled journey'}[r.category]||'Listed home';
    var precision=r.journey?r.journey.precision:window.BOOM_GEO?window.BOOM_GEO.pinPrecision(c.raw).level:'zone';
    var linkLabel=link&&link.indexOf('/maps/dir/')>=0?(precision==='exact'?'Check route in Maps ↗':'Check route from this area ↗'):'Open destination in Maps ↗';
    return '<article class="balance-card" data-primary="'+(i===0)+'"><p class="balance-reason">'+String(i+1).padStart(2,'0')+' / '+esc(title)+'</p>'+
      (extra?'<p class="balance-also">'+esc(extra)+'</p>':'')+
      '<a class="balance-photo" href="'+esc(context.url('detail',c.id))+'" data-home="'+esc(c.id)+'">'+(c.image?'<img src="'+esc(c.image)+'" alt="'+esc(c.name)+'" loading="lazy" decoding="async">':'<span>Photos to follow</span>')+'</a>'+
      '<div class="balance-card-body"><p class="eyebrow">'+esc(c.zone)+' · '+esc(kindLabel(kind))+'</p><p class="balance-availability">'+esc(c.status)+'</p><h3>'+esc(c.name)+'</h3>'+
      '<dl class="balance-facts"><div><dt>Monthly rent</dt><dd>'+esc(money(c.price))+'</dd></div><div><dt>Listed area</dt><dd>'+(c.area==null?'Not listed':esc(c.area)+' m²')+'</dd></div></dl>'+
      (p?'<div class="balance-travel"><span>'+esc(travel(r.journey))+'</span>'+(link?'<a class="balance-route" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+esc(linkLabel)+'</a>':'')+'</div>':'')+
      '<p class="balance-tradeoff">'+esc(comparison(r))+'</p><div class="balance-card-actions"><a class="balance-action" href="'+esc(context.url('detail',c.id))+'" data-home="'+esc(c.id)+'">Explore home <span>↗</span></a><button class="balance-locate" type="button" data-locate="'+esc(c.id)+'" aria-label="Locate '+esc(c.name)+' in Skyline">⌖</button><button class="balance-save" type="button" data-save-home="'+esc(c.id)+'" aria-label="Save '+esc(c.name)+'" aria-pressed="false">Save ＋</button></div></div></article>';
  }
  function renderBalanceEntry(result,p){
    if(!showBalanceEntry||!context)return;
    var discovery=el('nextDiscovery');if(!discovery)return;
    var entry=el('nextBalanceEntry');
    if(!entry){
      entry=document.createElement('section');entry.id='nextBalanceEntry';entry.className='balance-entry';
      entry.setAttribute('aria-label','Your Rome search brief');
      entry.innerHTML='<div class="balance-entry-copy"><p class="balance-entry-label">Your everyday</p><p class="balance-entry-destination"><span data-entry-place></span><small data-entry-private hidden>Private · this browser</small></p><ul class="balance-entry-context" aria-label="Current search preferences"><li data-entry-type></li><li data-entry-budget></li><li data-entry-dates></li></ul><p class="balance-entry-note" id="nextBalanceEntryNote"></p></div><button class="balance-entry-action" type="button" data-guide aria-describedby="nextBalanceEntryNote"><span data-entry-action></span><span aria-hidden="true">↗</span></button>';
      discovery.insertAdjacentElement('beforebegin',entry);
    }
    entry.hidden=!!context.error;if(context.error)return;
    var state=context.state,count=result?result.candidates.length:0;
    var type=state.type==='__entire'?'Entire home':state.type==='__rooms'?'Rooms':state.type?(G.homeKind(state.type)?kindLabel(G.homeKind(state.type)):'Type from shared link'):'All home types';
    var stay=window.BOOM_STAY?window.BOOM_STAY.summary(state.stay):'';
    var dates=window.BOOM_STAY?window.BOOM_STAY.normalize(state.stay):null;
    if(dates&&dates.moveIn&&dates.moveOut)stay=dates.moveIn+' → '+dates.moveOut;
    var amount=Number(state.budget),limited=Number.isFinite(amount)&&amount>0;
    entry.dataset.count=context.loaded?String(count):'';
    entry.dataset.ready=String(!!context.loaded);
    entry.querySelector('[data-entry-place]').textContent=p?placeName(p):'Where will you go most days?';
    entry.querySelector('[data-entry-private]').hidden=!state.privatePlace;
    entry.querySelector('[data-entry-type]').textContent=type;
    entry.querySelector('[data-entry-budget]').textContent=limited?'Up to '+money(amount)+' / month':'Any monthly rent';
    entry.querySelector('[data-entry-dates]').textContent=stay?'Requested: '+stay:'Dates not chosen';
    var label=!p?'Add your campus or work':!context.loaded?'View your plan':count>1?'Compare '+count+' options':count===1?'View this option':'Review these choices';
    var note=!context.loaded?'Loading matching homes.':!count?'No priced options. Adjust rent or home type.':!p?'Add a destination to explore the journey.':count===1?'One highlighted option. See its details below.':'See the reasons and trade-offs.';
    if(context.loaded&&count&&state.type==='')note+=' Types compared separately.';
    entry.querySelector('[data-entry-action]').textContent=label;
    entry.querySelector('.balance-entry-note').textContent=note;
  }
  function renderBalance(){
    var mount=el('nextBalance');if(!context||!mount)return;mount.hidden=!!context.error;if(context.error){renderBalanceEntry(null,place());return;}
    var p=place(),records=context.filtered.map(function(c){return {id:c.id,name:c.name,rent:c.price,area:c.area,type:c.type,lane:c.lane,journey:evidence(c)};});
    var result=G.balance(records,{budget:context.state.budget?Number(context.state.budget):null});
    renderBalanceEntry(result,p);
    var kinds=new Set(records.map(function(r){return G.homeKind(r.type)||'unknown';}));
    var heading=p?'Your Rome, in balance.':'There is more than one right home.';
    var intro=p?'Your everyday destination: '+placeName(p)+'. Compare what matters to you.':'Start with your campus or work. Then see what another neighbourhood could make possible.';
    mount.innerHTML='<div class="balance-heading"><div><p class="eyebrow">SKYLINE / FIND MY BALANCE</p><h2>'+esc(heading)+'</h2><p>'+esc(intro)+'</p></div><div class="balance-tools"><button class="text-button" type="button" data-edit-destination>'+(p?'Change destination':'Choose your destination')+' <span>↗</span></button><button class="text-button" type="button" data-share-plan>Share this plan <span>↗</span></button></div></div>'+
      (context.loaded&&kinds.size>1?'<p class="balance-kind-note">These options include different rental types. Price and space comparisons stay within each type.</p>':'')+
      (context.loaded?'<div class="balance-grid" data-count="'+result.candidates.length+'">'+result.candidates.map(function(r,i){return balanceCard(r,i,p);}).join('')+'</div>':'<p class="load-message">Opening your possibilities…</p>')+
      (context.loaded&&!result.candidates.length?'<p class="balance-empty">No priced homes match these choices right now. Adjust your budget or <a href="'+esc(intent('/property-finding'))+'">give BOOM your search brief ↗</a>.</p>':'')+
      '<div class="balance-foot"><p>'+(!context.loaded?'Your options are loading.':p?(result.comparableJourneys?'Transit comparisons use a static timetable model. Check the actual route.':'A reliable transit comparison is not available for these homes yet. Rent and space remain comparable.'):'Choose a destination to add the everyday journey.')+' Dates are a request; availability is confirmed for each home.</p><a href="'+esc(intent('/property-finding'))+'">Want more possibilities? Let BOOM search ↗</a></div>';
  }
  function detail(c){
    if(!context)return '';var p=place(),j=evidence(c),link=route(c,j);
    return '<section class="detail-everyday" aria-label="Your everyday journey"><div class="everyday-heading"><p class="eyebrow">YOUR EVERYDAY / SKYLINE</p><button type="button" data-edit-destination>'+(p?'Change destination':'Add your destination')+' ↗</button></div><div class="everyday-route"><span>'+esc(c.zone||'This home')+'</span><span aria-hidden="true">→</span><strong>'+esc(placeName(p)||'Your campus. Your work. Your Rome.')+'</strong></div>'+(p?'<div class="everyday-metrics"><span>'+esc(travel(j))+'</span>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Check route in Maps ↗</a>':'')+'</div><details class="everyday-note"><summary>'+(j&&j.fonte==='rete'?'Timetable estimate · not live':j&&j.fonte==='piedi'?'Walking estimate · not a measured route':'Journey still to verify')+(j&&j.precision==='zone'?' · approximate home area':'')+'</summary><p>'+esc(evidenceNote(j))+'</p></details>':'<p class="everyday-note">See how this home fits around the places that matter to you.</p>')+'</section>';
  }
  function render(next){
    context=next;var p=place(),b=el('nextDestinationSummary');b.querySelector('strong').textContent=placeName(p)||'Where will you go most days?';b.querySelector('.destination-hint').textContent=p?(p.address||p.che||(context.state.privatePlace?'Your saved place · private':'Your everyday destination')):'Campus, work or your own place';
    b.dataset.selected=String(!!p);renderBalance();
    document.querySelectorAll('a[data-journey-service]').forEach(function(a){a.href=intent(a.dataset.journeyService);});
  }
  function init(callbacks){
    hooks=callbacks;
    document.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
      if(b.id==='nextDestinationSummary'||b.hasAttribute('data-edit-destination'))open(b);
      else if(b.hasAttribute('data-destination'))choose(b.dataset.destination,null);
      else if(b.hasAttribute('data-private-place')){var p=P.posti()[Number(b.dataset.privatePlace)];if(p)choose('',p);}
      else if(b.hasAttribute('data-found-place')){var hit=hits[Number(b.dataset.foundPlace)];if(hit){P.salvaPosto(hit);choose('',hit);}}
      else if(b.hasAttribute('data-destination-mode')){mode=b.dataset.destinationMode;++requestNumber;if(request)request.abort();el('nextDestinationQuery').value='';options();el('nextDestinationQuery').focus();}
      else if(b.id==='nextDestinationSearch')search();
      else if(b.id==='nextDestinationClear')choose('',null);
      else if(b.hasAttribute('data-share-plan')){
        var data=brief(),saved=[];try{saved=window.BOOM_FLIGHT.saved(localStorage.getItem('boomSalvate'));}catch(_){}data.homes=context.state.homes.length?context.catalogue.filter(function(c){return context.state.homes.includes(c.id);}).slice(0,3).map(function(c){return c.id;}):context.catalogue.filter(function(c){return saved.includes(c.canonicalUrl);}).slice(0,3).map(function(c){return c.id;});
        var shared=location.origin+J.share(data);if(!navigator.clipboard){hooks.announce('Sharing is unavailable in this browser. Your plan is still here.');return;}navigator.clipboard.writeText(shared).then(function(){hooks.announce('Plan copied'+(data.homes.length?' with '+data.homes.length+' saved homes':'')+'. Personal places stay private.');},function(){hooks.announce('Sharing is unavailable in this browser. Your plan is still here.');});
      }
    });
    el('nextDestinationQuery').addEventListener('input',function(){if(mode==='campus')options();else{++requestNumber;if(request)request.abort();el('nextDestinationOptions').replaceChildren();}});
    el('nextDestinationQuery').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();if(mode==='work')search();}});
    el('nextDestinationDialog').addEventListener('close',function(){++requestNumber;if(request)request.abort();var focus=opener&&opener.isConnected?opener:document.querySelector(context&&context.state.view==='detail'?'.detail-everyday [data-edit-destination]':'#nextBalance [data-edit-destination]');if(focus)focus.focus({preventScroll:true});});
    window.addEventListener('boom-next:map-journeys',function(){if(context)hooks.refresh();});
  }
  window.BoomFlightClub={init:init,render:render,detail:detail,open:open,intent:intent};
})();
