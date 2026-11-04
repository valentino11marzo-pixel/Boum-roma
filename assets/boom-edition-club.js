/* CLUB / white departure hall. Existing journey; a single connected composition. */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('edition') !== 'club' || document.body.dataset.direction !== 'club') return;
  var directions=window.BoomFlightDirections, hero=document.getElementById('nextHero'), ticket=document.getElementById('directionClubTicket'), planner=document.querySelector('.europe-planner');
  if(!directions||!hero||!ticket||!planner)return;
  document.body.dataset.edition='club';
  document.documentElement.classList.add('boom-club-light');
  var theme=document.querySelector('meta[name="theme-color"]');if(theme)theme.content='#ffffff';
  var byId=function(id){return document.getElementById(id);};
  document.querySelectorAll('.europe-brand-lockup').forEach(function(img){img.src='/assets/boom-brand-lockup-ink.svg';});
  if(window.BoomFlightNextMotion)window.BoomFlightNextMotion.setTheme('light');

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
  document.querySelector('.europe-switch-label').textContent='Your next city';
  window.addEventListener('boom-globe-city',function(event){
    var slug=event.detail&&event.detail.slug;
    if(!['rome','madrid','barcelona','amsterdam','london','milan'].includes(slug))return;
    var choice=hero.querySelector('button[data-europe-city="'+slug+'"]');if(choice)choice.click();
  });

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
    hero.querySelector('.hero-pretitle').textContent='Your next chapter in';
    hero.querySelector('.hero-centre .eyebrow').textContent='BOOM. A modern real estate agency.';
    hero.querySelector('.hero-promise').textContent=foreign?'A new city. A dedicated team to help you find your place.':'Real homes. The right neighbourhood. A team to help you settle in.';
    planLink.href=foreign?'#europeDeskPlanner':'#nextSearch';
    var homeStop=flightline.querySelector('[data-flight-stop="homes"]');homeStop.href=foreign?'#europeStoryCity':'#nextSkyTitle';homeStop.innerHTML='<span>02</span> '+(foreign?'Your service':'Homes & Skyline');
    flightline.querySelector('[data-flight-stop="support"]').hidden=foreign;flightline.querySelector('i:last-of-type').hidden=foreign;
    if(window.BoomFlightNextMotion){window.BoomFlightNextMotion.setTheme('light');window.BoomFlightNextMotion.setCityPattern(city);}
    if(globe)globe.selectCity(city);
    queueFit();queueScroll();
  }
  var fitFrame=0;
  function fitDestination(){fitFrame=0;var host=byId('nextDestinationBoard'),heading=byId('nextHeroTitle'),letters=(host.getAttribute('aria-label')||'ROME').length,width=heading.clientWidth;if(width>0)host.style.setProperty('--europe-board-size',Math.max(23,Math.min(innerWidth<650?91:136,(width-6)/(letters*.91)))+'px');}
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
    var foreign=document.body.dataset.europeCity!=='rome',stops=[hero,foreign?byId('europeDeskStory'):skyline,document.getElementById('services')],active=0;
    var positions=stops.map(function(el){return el.getBoundingClientRect().top;});
    positions.forEach(function(top,index){if(top<innerHeight*.4&&(!foreign||index<2))active=index;});
    flightline.querySelectorAll('[data-flight-stop]').forEach(function(link,index){if(index===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
    var steps=document.querySelector('.next-journey'),box=steps.getBoundingClientRect(),progress=Math.max(0,Math.min(1,(innerHeight*.8-box.top)/(Math.max(1,box.height))));
    steps.style.setProperty('--journey-progress',motionAllowed()?progress:1);
    document.body.dataset.editionMotion=motionAllowed()?'active':'still';
  }
  function queueScroll(){if(!scrollFrame)scrollFrame=requestAnimationFrame(renderScroll);}
  window.addEventListener('scroll',queueScroll,{passive:true});window.addEventListener('resize',queueScroll,{passive:true});
  new MutationObserver(queueScroll).observe(pause,{attributes:true,attributeFilter:['aria-pressed']});
  reduce.addEventListener('change',queueScroll);document.addEventListener('visibilitychange',queueScroll);
  window.addEventListener('pagehide',function(){if(fitFrame)cancelAnimationFrame(fitFrame);if(scrollFrame)cancelAnimationFrame(scrollFrame);fitFrame=scrollFrame=0;});
  syncCity();requestAnimationFrame(function(){window.dispatchEvent(new Event('resize'));queueFit();});
})();
