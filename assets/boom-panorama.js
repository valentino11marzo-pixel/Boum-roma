/* Panorama is a presentation of Club. The original controllers still own the journey. */
(function () {
  'use strict';
  var query=new URLSearchParams(location.search);
  if(query.get('experience')!=='panorama'||document.body.dataset.edition!=='club')return;
  var byId=function(id){return document.getElementById(id);};
  var hero=byId('nextHero'),atlas=byId('boomGlobeMount'),ticket=byId('directionClubTicket');
  if(!hero||!atlas||!ticket)return;
  document.body.dataset.experience='panorama';
  document.documentElement.classList.add('boom-panorama');
  var anchor=document.createElement('span');anchor.hidden=true;anchor.dataset.panoramaAnchor='';atlas.before(anchor);
  atlas.dataset.globeLabels='selected';
  var toolbar=document.createElement('div');toolbar.className='panorama-globe-toolbar';
  toolbar.innerHTML='<span>Explore the BOOM destinations</span><button type="button" data-panorama-expand aria-haspopup="dialog" aria-controls="panoramaGlobeDialog">Full view <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>';
  atlas.prepend(toolbar);
  // Europe keeps the city illustration and landmark in sync; show the original node.
  atlas.prepend(byId('europeCitySignature'));
  var route=document.createElement('div');route.className='panorama-route';
  route.innerHTML='<span class="panorama-route-city"></span><span class="panorama-route-scope"></span>';
  atlas.querySelector('.boom-globe-caption').before(route);
  hero.querySelector('.europe-switch-label').textContent='Choose your destination';
  var mast=hero.querySelector('.edition-runway-head');
  mast.firstElementChild.textContent='Your stay in Rome';mast.lastElementChild.textContent='Add what you know. You can explore without dates.';
  var proof=document.createElement('div');proof.className='panorama-proof';
  proof.innerHTML='<a href="/about">Meet Valentino</a><a href="/your-money">How fees work</a>';
  hero.querySelector('.edition-plan-link').after(proof);
  var actionArrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  hero.querySelector('.edition-pass-arrow').innerHTML=actionArrow;
  document.querySelectorAll('#services .ticket-stub b,#services .europe-service-proof>span[aria-hidden],#services .service-foot a>span').forEach(function(icon){icon.innerHTML=actionArrow;});
  var serviceRoutes=[['Your brief','Search','Viewings'],['Home found','Checks','Signature support']];
  document.querySelectorAll('#services .next-ticket .ticket-route').forEach(function(line,index){
    line.classList.add('panorama-service-route');
    line.innerHTML=serviceRoutes[index].map(function(step){return '<span>'+step+'</span>';}).join('<i aria-hidden="true"></i>');
  });
  byId('nextSearchForm').querySelector('.search-submit').textContent='See matching homes';
  byId('nextSearchForm').querySelectorAll('label>span').forEach(function(label){label.textContent=label.textContent.replace(/^\d+\s*\/\s*/,'').toLowerCase().replace(/^./,function(c){return c.toUpperCase();});});
  var dialog=document.createElement('dialog');dialog.id='panoramaGlobeDialog';dialog.className='panorama-globe-dialog';
  dialog.setAttribute('aria-labelledby','panoramaGlobeTitle');
  dialog.innerHTML='<div class="panorama-full-head"><div><h2 id="panoramaGlobeTitle">Explore your next city.</h2></div><div class="panorama-full-actions"><button type="button" data-panorama-motion aria-pressed="false">Pause motion</button><button type="button" data-panorama-close aria-label="Close full globe view">Close <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div><div class="panorama-full-stage"></div><p class="panorama-full-note">Rotate to explore. Choose a city to see its homes or support.</p>';
  document.body.appendChild(dialog);
  var opener=null,restored=true,returnFocus=true,entrance=null,reduce=matchMedia('(prefers-reduced-motion: reduce)');
  var pause=byId('nextMotionToggle'),motion=dialog.querySelector('[data-panorama-motion]');
  function syncMotion(){var paused=pause.getAttribute('aria-pressed')==='true';motion.setAttribute('aria-pressed',String(paused));motion.textContent=paused?'Resume motion':'Pause motion';if((paused||reduce.matches)&&entrance){entrance.cancel();entrance=null;}}
  function restore(){
    if(restored)return;restored=true;
    if(entrance){entrance.cancel();entrance=null;}
    anchor.after(atlas);atlas.dataset.globeLabels='selected';delete document.body.dataset.panoramaExpanded;
    window.dispatchEvent(new Event('resize'));
    if(returnFocus&&opener&&opener.isConnected)opener.focus({preventScroll:true});
  }
  function close(focus){returnFocus=focus!==false;if(dialog.open)dialog.close();restore();}
  toolbar.querySelector('button').addEventListener('click',function(event){
    opener=document.activeElement;returnFocus=true;restored=false;atlas.dataset.globeLabels='all';
    dialog.querySelector('.panorama-full-stage').appendChild(atlas);document.body.dataset.panoramaExpanded='true';
    dialog.showModal();dialog.querySelector('[data-panorama-close]').focus({preventScroll:true});syncMotion();window.dispatchEvent(new Event('resize'));
    if(event.detail>0&&!reduce.matches&&pause.getAttribute('aria-pressed')!=='true')entrance=dialog.animate([{opacity:.3,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.23,1,.32,1)'});
  });
  dialog.querySelector('[data-panorama-close]').addEventListener('click',function(){close(true);});
  dialog.addEventListener('close',function(){if(!dialog.open)restore();});
  motion.addEventListener('click',function(){pause.click();syncMotion();});
  new MutationObserver(syncMotion).observe(pause,{attributes:true,attributeFilter:['aria-pressed']});
  reduce.addEventListener('change',syncMotion);
  // Close the exploration dialog before Club opens its finite destination transition.
  window.addEventListener('boom-globe-city',function(){if(dialog.open)close(false);},true);
  window.addEventListener('popstate',function(){close(false);});
  window.addEventListener('pagehide',function(){close(false);});
  window.addEventListener('boom:flight-view',function(event){if(event.detail.view!=='home')close(false);});
  function syncCity(){
    var city=document.body.dataset.europeCity||'rome',foreign=city!=='rome';
    var label={rome:'Rome',london:'London',milan:'Milan',amsterdam:'Amsterdam',madrid:'Madrid',barcelona:'Barcelona'}[city]||'Rome';
    hero.querySelector('.hero-pretitle').textContent=foreign?'Make your move to':'Find your place in';
    hero.querySelector('.hero-promise').textContent=foreign?'Rental search and tenant-side support in '+label+'. See the scope and fee before you choose.':'Homes in Rome, with the neighbourhood and your everyday journey in view.';
    hero.querySelector('.edition-pass-action').textContent=foreign?'Explore '+label+' support':'Browse Rome homes';
    // The fee explanation is Rome-specific; international offers explain their own terms.
    proof.lastElementChild.hidden=foreign;
    route.querySelector('.panorama-route-city').textContent=label;
    route.querySelector('.panorama-route-scope').textContent=foreign?'Rental search & tenant-side support':'Homes, neighbourhoods & Skyline';
    byId('nextSkyTitle').innerHTML='See the home.<br>Understand the city.';
    byId('nextServicesTitle').innerHTML='The right support.<br>At the right moment.';
  }
  new MutationObserver(syncCity).observe(document.body,{attributes:true,attributeFilter:['data-europe-city']});syncCity();syncMotion();
})();
