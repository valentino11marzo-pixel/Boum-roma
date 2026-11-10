/* City Editions: original city geometry, one native destination and decision. */
(function(){
 'use strict';
 if(document.body.dataset.dispatchComposition!=='cityeditions')return;
 var byId=function(id){return document.getElementById(id);};
 var ticket=byId('directionClubTicket'),signature=byId('europeCitySignature'),scene=byId('visionScene'),pause=byId('nextMotionToggle');
 if(!ticket||!signature||!scene||!pause||!byId('airspaceDecision'))return;
 var artwork=document.createElement('div');artwork.id='cityEditionArtwork';
 var bands=document.createElement('div');bands.className='city-edition-bands';bands.setAttribute('aria-hidden','true');
 for(var i=0;i<6;i++){var band=document.createElement('span');band.className='city-edition-band';bands.appendChild(band);}
 artwork.append(bands,signature);ticket.appendChild(artwork);
 var controls=document.createElement('div');controls.id='cityEditionControls';
 controls.innerHTML='<div class="city-edition-modes" role="group" aria-label="Explore the destination"><button type="button" data-city-edition-view="art" aria-controls="cityEditionArtwork" aria-pressed="true">City edition</button><button type="button" data-city-edition-view="globe" aria-controls="visionScene" aria-pressed="false">Globe</button></div>';
 controls.appendChild(pause);ticket.appendChild(controls);
 var reduce=matchMedia('(prefers-reduced-motion: reduce)'),animations=[],pointerCity='',lastCity=document.body.dataset.europeCity,visible=true;
 function cancel(){animations.forEach(function(animation){animation.cancel();});animations=[];}
 function allowed(){return document.body.dataset.cityEditionView==='art'&&document.body.dataset.view==='home'&&visible&&!document.hidden&&!reduce.matches&&pause.getAttribute('aria-pressed')!=='true'&&!(navigator.connection&&navigator.connection.saveData);}
 function construct(){
  cancel();if(!allowed()||!artwork.animate)return;
  var ease=getComputedStyle(document.body).getPropertyValue('--edition-ease').trim()||'cubic-bezier(.23,1,.32,1)';
  Array.from(bands.children).forEach(function(band,index){animations.push(band.animate([{opacity:0,transform:'scale(.94)'},{opacity:1,transform:'scale(1)'}],{duration:270,delay:index*30,easing:ease,fill:'backwards'}));});
  var emblem=signature.querySelector('svg');if(emblem)animations.push(emblem.animate([{opacity:.25},{opacity:1}],{duration:180,delay:60,easing:ease,fill:'backwards'}));
  // Finite WAAPI objects only: no animation clock, no delayed commercial state.
  var current=animations;Promise.all(current.map(function(a){return a.finished.catch(function(){});})).then(function(){if(animations===current)animations=[];});
 }
 function show(value){
  cancel();document.body.dataset.cityEditionView=value;artwork.hidden=value!=='art';scene.hidden=value!=='globe';
  controls.querySelectorAll('[data-city-edition-view]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.cityEditionView===value));});
  // Resize the same native canvas and board after a deliberate view change.
  window.dispatchEvent(new Event('resize'));
 }
 controls.addEventListener('click',function(event){var button=event.target.closest('[data-city-edition-view]');if(button)show(button.dataset.cityEditionView);});
 document.addEventListener('click',function(event){var button=event.target.closest('button[data-europe-city]');pointerCity=button&&event.detail>0?button.dataset.europeCity:'';},true);
 var owner=new MutationObserver(function(){
  var city=document.body.dataset.europeCity;
  if(city!==lastCity){lastCity=city;var animate=pointerCity===city;pointerCity='';if(animate)construct();else cancel();}
  if(!allowed())cancel();
 });
 var pauseObserver=new MutationObserver(function(){if(!allowed())cancel();});
 var observer='IntersectionObserver' in window?new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;if(!visible)cancel();},{threshold:.1}):null;
 function observe(){owner.observe(document.body,{attributes:true,attributeFilter:['data-europe-city','data-view']});pauseObserver.observe(pause,{attributes:true,attributeFilter:['aria-pressed']});if(observer)observer.observe(artwork);}
 document.addEventListener('visibilitychange',function(){if(document.hidden)cancel();});
 reduce.addEventListener('change',cancel);
 if(navigator.connection)navigator.connection.addEventListener('change',cancel);
 window.addEventListener('pagehide',function(){cancel();owner.disconnect();pauseObserver.disconnect();if(observer)observer.disconnect();});
 window.addEventListener('pageshow',observe);
 show('art');observe();document.body.dataset.cityEditionsReady='true';construct();
})();
