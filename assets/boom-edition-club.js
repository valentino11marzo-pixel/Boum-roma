/* CLUB / night departure. Existing journey; one geographic entry into the real service. */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('edition') !== 'club' || document.body.dataset.direction !== 'club') return;
  var directions=window.BoomFlightDirections, hero=document.getElementById('nextHero'), ticket=document.getElementById('directionClubTicket'), planner=document.querySelector('.europe-planner');
  if(!directions||!hero||!ticket||!planner)return;
  document.body.dataset.edition='club';
  document.documentElement.classList.add('boom-club-night');
  var theme=document.querySelector('meta[name="theme-color"]');if(theme)theme.content='#08090b';
  var byId=function(id){return document.getElementById(id);};
  document.querySelectorAll('.europe-brand-lockup').forEach(function(img){img.src='/assets/boom-brand-lockup.svg';});
  if(window.BoomFlightNextMotion)window.BoomFlightNextMotion.setTheme('dark');

  // Keep the real forms and listeners intact; the destination now has a geographic counterpart.
  planner.classList.add('edition-club-runway');
  hero.insertBefore(planner,hero.querySelector('.hero-bottom'));
  var mast=document.createElement('div');mast.className='edition-runway-head';
  mast.innerHTML='<span>Your arrival plan</span><span>Dates. Place. Possibilities.</span>';planner.prepend(mast);
  var atlas=document.createElement('div');atlas.className='edition-atlas';atlas.id='boomGlobeMount';ticket.appendChild(atlas);
  var planLink=document.createElement('a');planLink.className='edition-plan-link';planLink.href='#nextSearch';planLink.innerHTML='Plan your move <span aria-hidden="true">↓</span>';
  hero.querySelector('.hero-promise').insertAdjacentElement('afterend',planLink);
  var globe=window.BoomFlightGlobe;if(globe)globe.mount(atlas);
  var bottom=hero.querySelector('.hero-bottom');bottom.querySelector('span').replaceWith(byId('europeCitySignature'));
  var compactHome=matchMedia('(max-width: 650px)');
  function arrangeHome(){
    var localFirst=compactHome.matches&&document.body.dataset.europeCity==='rome';
    var focused=planner.contains(document.activeElement)?document.activeElement:null,moved=false;
    if(localFirst&&planner.parentElement!==ticket){ticket.insertBefore(planner,atlas);moved=true;}
    else if(!localFirst&&planner.parentElement!==hero){hero.insertBefore(planner,bottom);moved=true;}
    if(moved&&focused)focused.focus({preventScroll:true});
  }
  compactHome.addEventListener('change',function(){arrangeHome();queueFit();});
  document.querySelector('.europe-switch-label').textContent='Your next city';
  // Arrive where the decision happens. Moving the original nodes preserves validation and handoff.
  var deskStory=byId('europeDeskStory'),deskPlanner=byId('europeDeskPlanner'),deskForm=byId('europeDeskForm');
  var workspace=document.createElement('div');workspace.className='edition-desk-workspace';
  workspace.append(deskPlanner,byId('europeServicePass'),deskForm);deskStory.appendChild(workspace);
  deskStory.querySelector('.europe-story-lead>.eyebrow').textContent='YOUR BOOM DESK / TENANT-SIDE SUPPORT';
  deskStory.querySelector('.europe-story-lead>p:last-child').textContent='Start with what you need. See the work included, then bring us your plans.';
  deskPlanner.querySelector('.europe-planner-top').classList.add('sr-only');
  byId('europeDeskTitle').textContent='Where do you need us?';
  var briefHeader=document.createElement('div');briefHeader.className='edition-brief-head';
  briefHeader.innerHTML='<p class="eyebrow">YOUR NEXT STEP</p><h3 id="europeSelectedService">Your move</h3><p>Your plans travel with you to the desk.</p>';
  var briefSummary=document.createElement('dl');briefSummary.id='europeBriefSummary';briefSummary.setAttribute('aria-label','Your move summary');
  deskForm.prepend(briefHeader,briefSummary);
  byId('europeOptionalBrief').querySelector('summary').innerHTML='Edit your move <span>optional</span>';
  deskForm.querySelector('.europe-next-step').textContent='You’ll continue to the city desk with this brief. No payment at this step.';
  var flightVersion=0,flightTarget='';
  function cancelArrival(){++flightVersion;flightTarget='';if(globe&&globe.cancelFlight)globe.cancelFlight();}
  window.addEventListener('boom-globe-city',function(event){
    var slug=event.detail&&event.detail.slug;
    if(!['rome','madrid','barcelona','amsterdam','london','milan'].includes(slug))return;
    var europe=window.BoomFlightEurope,next=window.BoomFlightNext;
    if(!europe||!next||document.body.dataset.view!=='home')return;
    // Invalid dates keep the person at the actual form, before any camera movement.
    var wasRome=document.body.dataset.europeCity==='rome';
    var prefix=wasRome?'next':'europe';
    if(slug==='rome'&&window.BOOM_STAY.validate({moveIn:byId(prefix+'MoveIn').value,moveOut:byId(prefix+'MoveOut').value})){
      cancelArrival();if(!wasRome)europe.selectCity('rome');next.enterRome();byId('nextSearch').scrollIntoView({block:'center',behavior:'instant'});return;
    }
    var version=++flightVersion,entered=false;flightTarget=slug;
    function arrive(){
      if(version!==flightVersion)return;
      europe.selectCity(slug,{history:slug!=='rome'});
      if(slug==='rome'){entered=next.enterRome({rememberHome:wasRome});if(!entered)europe.selectCity('rome');}
      else {entered=true;byId('europeDeskStory').scrollIntoView({block:'start',behavior:'instant'});}
    }
    var transition=globe&&globe.flyTo?globe.flyTo(slug,{onCovered:arrive}):Promise.resolve().then(arrive);
    Promise.resolve(transition).then(function(result){
      if(version!==flightVersion)return;flightTarget='';
      if(result&&['cancelled','superseded'].includes(result.status))return;
      // City-dependent media and the original form have settled before the final arrival.
      if(entered&&slug!=='rome')byId('europeDeskStory').scrollIntoView({block:'start',behavior:'instant'});
      var target=entered?(slug==='rome'?byId('nextAptsTitle'):byId('europeStoryCity')):byId('nextSearchError');
      if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
    }).catch(function(){if(version===flightVersion){flightTarget='';if(!entered)arrive();}});
  });
  window.addEventListener('popstate',cancelArrival);
  window.addEventListener('pagehide',cancelArrival);

  var skyline=document.querySelector('.skyline-chapter');skyline.id='clubHomes';
  byId('nextSkyTitle').innerHTML='A home for<br>your everyday.';
  skyline.querySelector('.chapter-aside>p').textContent='Start with your campus or work. Discover the neighbourhoods that make sense for your life.';
  byId('nextHomesTitle').textContent='Inside the homes';
  byId('nextServicesTitle').innerHTML='Your move.<br>Our people.';
  document.querySelector('.services-chapter>.chapter-heading>.chapter-aside').textContent='A dedicated search, or support for the home you found. Choose where you need us.';
  byId('nextJourneyTitle').innerHTML='From first look<br>to first morning.';
  var flightline=document.createElement('nav');flightline.className='edition-flightline';flightline.setAttribute('aria-label','Your BOOM journey');
  flightline.innerHTML='<a href="#nextHero" data-flight-stop="departure" aria-current="location"><span>01</span> Your destination</a><i aria-hidden="true"></i><a href="#nextSkyTitle" data-flight-stop="homes"><span>02</span> Homes & Skyline</a><i aria-hidden="true"></i><a href="#services" data-flight-stop="support"><span>03</span> Your support</a>';
  hero.insertAdjacentElement('afterend',flightline);
  var discovery=byId('nextDiscovery'),balance=byId('nextBalance');discovery.insertAdjacentElement('afterend',balance);

  function syncCity(){
    var city=document.body.dataset.europeCity||'rome',foreign=city!=='rome';
    arrangeHome();
    hero.querySelector('.hero-pretitle').textContent=foreign?'Your BOOM desk in':'Find your place in';
    hero.querySelector('.hero-centre .eyebrow').textContent=foreign?'BOOM Desks · Your agent, on your side.':'BOOM Rome · Homes & Skyline';
    hero.querySelector('.hero-promise').textContent=foreign?'Rental search, applications and viewings. Clear scope, clear fees, a person to guide your move.':'Explore the homes. Compare your everyday journey. Find the place that fits your life.';
    planLink.href=foreign?'#europeDeskStory':'#nextSearch';
    byId('europeStoryCity').textContent='Your '+city.charAt(0).toUpperCase()+city.slice(1)+' move.';
    if(window.BoomFlightEurope)window.BoomFlightEurope.refreshBrief();
    var homeStop=flightline.querySelector('[data-flight-stop="homes"]');homeStop.href=foreign?'#europeStoryCity':'#nextSkyTitle';homeStop.innerHTML='<span>02</span> '+(foreign?'Your service':'Homes & Skyline');
    flightline.querySelector('[data-flight-stop="support"]').hidden=foreign;flightline.querySelector('i:last-of-type').hidden=foreign;
    if(flightTarget&&city!==flightTarget)cancelArrival();
    if(window.BoomFlightNextMotion){window.BoomFlightNextMotion.setTheme('dark');window.BoomFlightNextMotion.setCityPattern(city);}
    if(globe)globe.selectCity(city);
    queueFit();queueScroll();
  }
  var fitFrame=0;
  function fitDestination(){fitFrame=0;var host=byId('nextDestinationBoard'),heading=byId('nextHeroTitle'),letters=(host.getAttribute('aria-label')||'ROME').length,width=heading.clientWidth;if(width>0)host.style.setProperty('--europe-board-size',Math.max(23,Math.min(innerWidth<650?78:110,(width-6)/(letters*.91)))+'px');}
  function queueFit(){if(!fitFrame)fitFrame=requestAnimationFrame(fitDestination);}
  new MutationObserver(syncCity).observe(document.body,{attributes:true,attributeFilter:['data-europe-city']});
  window.addEventListener('resize',queueFit,{passive:true});
  var sourceRender=directions.render;
  directions.render=function(context){sourceRender.apply(this,arguments);if(context.state.view==='apartments')byId('nextAptsTitle').textContent='Find your place in Rome.';queueScroll();};

  // One scroll update per input frame: current chapter and the four-step journey line.
  var scrollFrame=0,reduce=matchMedia('(prefers-reduced-motion: reduce)'),pause=byId('nextMotionToggle');
  function motionAllowed(){return !reduce.matches&&pause.getAttribute('aria-pressed')!=='true'&&!document.hidden;}
  function renderScroll(){
    scrollFrame=0;
    var allowed=motionAllowed(),motionState=allowed?'active':'still';
    if(document.body.dataset.view!=='home'){
      if(document.body.dataset.editionMotion!==motionState)document.body.dataset.editionMotion=motionState;
      return;
    }
    var foreign=document.body.dataset.europeCity!=='rome',stops=[hero,foreign?byId('europeDeskStory'):skyline,document.getElementById('services')],active=0;
    var positions=stops.map(function(el){return el.getBoundingClientRect().top;});
    var steps=document.querySelector('.next-journey'),box=foreign?null:steps.getBoundingClientRect();
    var progress=box?Math.max(0,Math.min(1,(innerHeight*.8-box.top)/Math.max(1,box.height))):1;
    positions.forEach(function(top,index){if(top<innerHeight*.4&&(!foreign||index<2))active=index;});
    flightline.querySelectorAll('[data-flight-stop]').forEach(function(link,index){if(index===active){if(!link.hasAttribute('aria-current'))link.setAttribute('aria-current','location');}else if(link.hasAttribute('aria-current'))link.removeAttribute('aria-current');});
    var nextProgress=String(allowed?progress:1);if(steps.style.getPropertyValue('--journey-progress')!==nextProgress)steps.style.setProperty('--journey-progress',nextProgress);
    if(document.body.dataset.editionMotion!==motionState)document.body.dataset.editionMotion=motionState;
  }
  function queueScroll(){if(!scrollFrame)scrollFrame=requestAnimationFrame(renderScroll);}
  window.addEventListener('scroll',queueScroll,{passive:true});window.addEventListener('resize',queueScroll,{passive:true});
  new MutationObserver(queueScroll).observe(pause,{attributes:true,attributeFilter:['aria-pressed']});
  reduce.addEventListener('change',queueScroll);document.addEventListener('visibilitychange',queueScroll);
  window.addEventListener('pagehide',function(){if(fitFrame)cancelAnimationFrame(fitFrame);if(scrollFrame)cancelAnimationFrame(scrollFrame);fitFrame=scrollFrame=0;});
  syncCity();requestAnimationFrame(function(){window.dispatchEvent(new Event('resize'));queueFit();});
})();
