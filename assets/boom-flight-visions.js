/* Three visual worlds, using the original BOOM geography, photographs and forms. */
(function () {
  'use strict';
  var query=new URLSearchParams(location.search),vision=query.get('vision');
  if(!['airframe','signal','orbit'].includes(vision)||document.body.dataset.experience!=='panorama')return;
  var byId=function(id){return document.getElementById(id);};
  var hero=byId('nextHero'),ticket=byId('directionClubTicket'),atlas=byId('boomGlobeMount'),media=byId('clubMedia');
  if(!hero||!ticket||!atlas||!media)return;
  document.body.dataset.homeVision=vision;
  document.body.dataset.homeVariant='panorama';
  document.documentElement.dataset.homeVision=vision;
  hero.dataset.nextField='off';
  if(window.BoomFlightNextMotion)window.BoomFlightNextMotion.setFieldEnabled(false);
  if(vision==='orbit')atlas.dataset.globeFraming='horizon';
  var light=vision!=='orbit';
  document.querySelector('meta[name="theme-color"]').content=vision==='signal'?'#ffd700':light?'#fcfcf8':'#000000';
  document.querySelectorAll('.next-nav .europe-brand-lockup,#clubCompany .club-company-brand img').forEach(function(mark){mark.src=light?'/assets/boom-brand-lockup-ink.svg':'/assets/boom-brand-lockup.svg';});

  // The 300-weight city name and the original mechanical Solari have separate
  // visual roles. Only the textual heading announces the destination.
  var board=byId('nextDestinationBoard'),cityName=document.createElement('span');
  cityName.id='visionCityName';cityName.className='vision-city-name';
  board.before(cityName);
  var record=document.createElement('div');record.className='vision-departure-record';record.setAttribute('aria-hidden','true');
  record.appendChild(board);byId('nextHeroTitle').after(record);

  var scene=document.createElement('div');scene.id='visionScene';scene.className='vision-scene';
  var tabs=document.createElement('div');tabs.id='visionSceneTabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Explore the homes or the destinations');
  tabs.innerHTML='<button type="button" data-vision-scene="homes" aria-pressed="false">Inside a Rome home</button><button type="button" data-vision-scene="world" aria-pressed="false">Explore the destinations</button>';
  scene.appendChild(tabs);
  // Full view returns the same atlas to its original anchor, now in this scene.
  var anchor=document.querySelector('[data-panorama-anchor]');
  if(anchor)scene.appendChild(anchor);
  scene.appendChild(atlas);scene.appendChild(media);ticket.appendChild(scene);
  var romeScene=vision==='airframe'?'homes':'world',lastCity='';
  var reduce=matchMedia('(prefers-reduced-motion: reduce)'),transition=null;
  function cancelTransition(){if(transition){transition.cancel();transition=null;}}
  function motionAllowed(){return !reduce.matches&&!document.hidden&&byId('nextMotionToggle').getAttribute('aria-pressed')!=='true';}
  function showScene(value,animate){
    cancelTransition();
    var foreign=document.body.dataset.europeCity!=='rome';
    if(foreign)value='world';
    document.body.dataset.visionScene=value;
    atlas.hidden=value!=='world';media.hidden=value!=='homes';tabs.hidden=foreign;
    tabs.querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.visionScene===value));});
    window.dispatchEvent(new Event('resize'));
    if(animate&&motionAllowed()){
      var panel=value==='world'?atlas:media;
      transition=panel.animate([{opacity:.35,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'cubic-bezier(.16,1,.3,1)'});
      transition.onfinish=function(){transition=null;};
    }
  }
  tabs.addEventListener('click',function(event){
    var button=event.target.closest('button[data-vision-scene]');
    if(!button||button.getAttribute('aria-pressed')==='true')return;
    romeScene=button.dataset.visionScene;showScene(romeScene,event.detail>0);
  });

  // A visitor chooses their situation; the actual, still-native service tickets
  // answer it. This is local presentation, not a lead, score or customer store.
  var chooser=document.createElement('fieldset');chooser.id='visionNeedChooser';
  chooser.innerHTML='<legend>Where are you in your move?</legend><div class="vision-need-options"><button type="button" data-vision-need="all" aria-pressed="true">All support</button><button type="button" data-vision-need="search" aria-pressed="false">I’m still searching</button><button type="button" data-vision-need="found" aria-pressed="false">I found a home</button><button type="button" data-vision-need="contract" aria-pressed="false">I have a contract</button></div><p id="visionNeedSummary" role="status">Choose the help you need, with the scope and fee in view.</p>';
  var tickets=document.querySelector('#services .panorama-ticketing');tickets.before(chooser);
  var groups={all:null,search:['property-finding'],found:['virtual-viewing','deal-assistance'],contract:['deal-assistance','contract-check-express']};
  var descriptions={all:'Choose the help you need, with the scope and fee in view.',search:'A dedicated search based on your written criteria.',found:'See the home remotely, or get help with checks and the agreement.',contract:'Get a written contract review, or support through to signature.'};
  function chooseNeed(value){
    if(!Object.prototype.hasOwnProperty.call(groups,value))return;
    chooser.querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.visionNeed===value));});
    tickets.querySelectorAll('.panorama-ticket').forEach(function(card){card.hidden=!!groups[value]&&!groups[value].includes(card.dataset.romeService);});
    tickets.dataset.visionNeed=value;byId('visionNeedSummary').textContent=descriptions[value];
  }
  chooser.addEventListener('click',function(event){var button=event.target.closest('button[data-vision-need]');if(button)chooseNeed(button.dataset.visionNeed);});
  function syncCity(){
    var city=document.body.dataset.europeCity||'rome';
    var selected=document.querySelector('.europe-city-switch button[data-europe-city="'+city+'"]');
    cityName.textContent=selected?selected.querySelector('span:last-child').textContent:'Rome';
    if(city!==lastCity){lastCity=city;chooseNeed('all');showScene(romeScene,false);}
  }
  new MutationObserver(syncCity).observe(document.body,{attributes:true,attributeFilter:['data-europe-city']});
  new MutationObserver(function(){if(!motionAllowed())cancelTransition();}).observe(byId('nextMotionToggle'),{attributes:true,attributeFilter:['aria-pressed']});
  reduce.addEventListener('change',cancelTransition);
  document.addEventListener('visibilitychange',cancelTransition);
  document.addEventListener('keydown',cancelTransition);
  window.addEventListener('pagehide',cancelTransition);
  window.addEventListener('popstate',cancelTransition);
  window.addEventListener('boom:flight-view',cancelTransition);
  syncCity();
})();
