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
  document.querySelector('meta[name="theme-color"]').content='#000';
  var anchor=document.createElement('span');anchor.hidden=true;anchor.dataset.panoramaAnchor='';atlas.before(anchor);
  atlas.dataset.globeLabels='selected';
  atlas.dataset.globeAmbient='true';
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
  // The published Rome products, not a second catalogue or a checkout. Club
  // still owns public-brief links; the original service pages own every form.
  var ticketing=document.querySelector('#services .next-tickets');
  ticketing.replaceChildren(byId('panoramaServiceTickets').content.cloneNode(true));
  ticketing.classList.add('panorama-ticketing');
  document.querySelector('#services .chapter-aside').textContent='Four ways to help with your move. Choose the service, see its scope, then continue with BOOM.';
  var catalogueNote=document.createElement('p');catalogueNote.className='panorama-catalogue-note';
  catalogueNote.innerHTML='Renting a BOOM home? <strong>Viewings are free.</strong> Apply directly from the home’s page. <a href="/flight-next?direction=club&amp;edition=club&amp;experience=panorama&amp;view=apartments&amp;layout=skyline" data-view="apartments">Browse the homes</a>';
  document.querySelector('#services .service-foot').before(catalogueNote);
  document.querySelector('#services .service-foot').innerHTML='<a href="/services">All services &amp; prices <span aria-hidden="true"></span></a><a href="/your-money">How fees work <span aria-hidden="true"></span></a><a href="/concierge">Life in Rome, handled <span aria-hidden="true"></span></a>';
  document.querySelectorAll('#services .europe-service-proof>span[aria-hidden],#services .service-foot a>span').forEach(function(icon){icon.innerHTML=actionArrow;});
  byId('nextSearchForm').querySelector('.search-submit').textContent='See matching homes';
  var continueButton=byId('europeDeskContinue');
  function cleanContinueArrow(){var label=continueButton.textContent.replace(/\s*[↗→]\s*$/,'');if(label!==continueButton.textContent)continueButton.textContent=label;}
  new MutationObserver(cleanContinueArrow).observe(continueButton,{childList:true,subtree:true,characterData:true});cleanContinueArrow();
  byId('nextSearchForm').querySelectorAll('label>span').forEach(function(label){label.textContent=label.textContent.replace(/^\d+\s*\/\s*/,'').toLowerCase().replace(/^./,function(c){return c.toUpperCase();});});
  var dialog=document.createElement('dialog');dialog.id='panoramaGlobeDialog';dialog.className='panorama-globe-dialog';
  dialog.setAttribute('aria-labelledby','panoramaGlobeTitle');
  dialog.innerHTML='<div class="panorama-full-head"><div><h2 id="panoramaGlobeTitle">Explore your next city.</h2></div><div class="panorama-full-actions"><button type="button" data-panorama-motion aria-pressed="false">Pause motion</button><button type="button" data-panorama-close aria-label="Close full globe view">Close <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div><div class="panorama-full-stage"></div><p class="panorama-full-note">Rotate to explore. Choose a city to see its homes or support.</p>';
  document.body.appendChild(dialog);
  var opener=null,restored=true,returnFocus=true,entrance=null,reduce=matchMedia('(prefers-reduced-motion: reduce)');
  var pause=byId('nextMotionToggle'),motion=dialog.querySelector('[data-panorama-motion]');
  // Keep the real pause control beside the moving object, including on phones.
  var globeTools=document.createElement('div');globeTools.className='panorama-globe-tools';
  globeTools.setAttribute('role','group');globeTools.setAttribute('aria-label','Globe view controls');
  globeTools.innerHTML='<button type="button" data-panorama-zoom="out" aria-label="Zoom out" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button><button type="button" data-panorama-zoom="in" aria-label="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg></button>';
  var caption=atlas.querySelector('.boom-globe-caption');caption.prepend(globeTools);
  globeTools.appendChild(atlas.querySelector('.boom-globe-reset'));globeTools.appendChild(pause);
  var zoomOut=globeTools.querySelector('[data-panorama-zoom="out"]'),zoomIn=globeTools.querySelector('[data-panorama-zoom="in"]');
  function syncZoom(){
    var camera=window.BoomFlightGlobe.state(),ready=camera.ready&&!camera.error;
    zoomOut.disabled=!ready||camera.zoomTarget<=camera.zoomMin;
    zoomIn.disabled=!ready||camera.zoomTarget>=camera.zoomMax;
  }
  globeTools.addEventListener('click',function(event){
    var control=event.target.closest('[data-panorama-zoom]');if(!control)return;
    var camera=window.BoomFlightGlobe.state();
    var step=(camera.zoomMax-camera.zoomMin)/2;
    window.BoomFlightGlobe.setZoom(camera.zoomTarget+(control.dataset.panoramaZoom==='in'?step:-step),{animate:event.detail>0});
    syncZoom();
  });
  atlas.addEventListener('boom-globe-camera',syncZoom);
  // One quiet invitation after a genuine pause in exploration; never an alert,
  // a new step, or a repeating attention loop. Essential controls stay visible.
  var hint=document.createElement('p');hint.className='panorama-globe-hint';hint.dataset.visible='false';hint.setAttribute('aria-hidden','true');
  hint.textContent='Drag to rotate. Choose a city to continue.';atlas.querySelector('.boom-globe-stage').appendChild(hint);
  var hintTimer=0,hintShown=false,hintVisible=false,atlasVisible=false,pageAway=false;
  function clearHint(){
    clearTimeout(hintTimer);hintTimer=0;
    if(hintVisible){hintVisible=false;hint.dataset.visible='false';}
  }
  function hintAllowed(){
    return !hintShown&&!pageAway&&atlasVisible&&!document.hidden&&!reduce.matches&&pause.getAttribute('aria-pressed')!=='true'&&atlas.dataset.globeState==='ready'&&atlas.dataset.globeDragging!=='true'&&!document.activeElement?.matches('input,select,textarea,button,a,[contenteditable="true"]');
  }
  function scheduleHint(){
    clearHint();if(!hintAllowed())return;
    hintTimer=setTimeout(function(){hintTimer=0;if(!hintAllowed())return;hintShown=true;hintVisible=true;hint.dataset.visible='true';},3200);
  }
  function syncMotion(){var paused=pause.getAttribute('aria-pressed')==='true';document.body.dataset.panoramaMotionState=paused||reduce.matches?'quiet':'active';motion.setAttribute('aria-pressed',String(paused));motion.textContent=paused?'Resume motion':'Pause motion';if((paused||reduce.matches)&&entrance){entrance.cancel();entrance=null;}scheduleHint();}
  new MutationObserver(function(){syncZoom();scheduleHint();}).observe(atlas,{attributes:true,attributeFilter:['data-globe-state']});
  if(window.IntersectionObserver)new IntersectionObserver(function(entries){atlasVisible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.35;scheduleHint();},{threshold:[0,.35]}).observe(atlas);
  document.addEventListener('pointerdown',clearHint,{passive:true});
  document.addEventListener('pointerup',scheduleHint,{passive:true});
  document.addEventListener('keydown',clearHint);
  document.addEventListener('focusin',clearHint);
  document.addEventListener('focusout',function(){queueMicrotask(scheduleHint);});
  atlas.addEventListener('pointermove',scheduleHint,{passive:true});
  document.addEventListener('visibilitychange',scheduleHint);
  window.addEventListener('pagehide',function(){pageAway=true;clearHint();});
  window.addEventListener('pageshow',function(){pageAway=false;scheduleHint();});
  syncZoom();
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
  // One finite state transition, only after a direct pointer choice. Existing
  // controllers commit first; keyboard, pause and reduced motion stay immediate.
  var stateMotion=null,stateFrame=0;
  function cancelStateMotion(){if(stateFrame){cancelAnimationFrame(stateFrame);stateFrame=0;}if(stateMotion){stateMotion.cancel();stateMotion=null;}}
  function motionAllowed(){return !reduce.matches&&pause.getAttribute('aria-pressed')!=='true'&&!document.hidden;}
  function animateState(node){
    cancelStateMotion();if(!node||!motionAllowed())return;
    stateMotion=node.animate([{opacity:.55,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.23,1,.32,1)'});
    stateMotion.onfinish=function(){stateMotion=null;};
  }
  document.addEventListener('click',function(event){
    var choice=event.target.closest('[data-europe-need]');
    if(!choice||event.detail===0||choice.getAttribute('aria-pressed')==='true')return;
    // The next frame follows Europe's native event dispatch and render. A
    // microtask can run between capture and bubble listeners, before the commit.
    cancelStateMotion();stateFrame=requestAnimationFrame(function(){stateFrame=0;if(choice.isConnected&&choice.getAttribute('aria-pressed')==='true')animateState(byId('europeServicePass'));});
  },true);
  document.addEventListener('keydown',cancelStateMotion);
  document.addEventListener('visibilitychange',cancelStateMotion);
  window.addEventListener('pagehide',cancelStateMotion);
  window.addEventListener('popstate',cancelStateMotion);
  new MutationObserver(function(){if(!motionAllowed())cancelStateMotion();}).observe(pause,{attributes:true,attributeFilter:['aria-pressed']});
  reduce.addEventListener('change',cancelStateMotion);
  // Close the exploration dialog before Club opens its finite destination transition.
  window.addEventListener('boom-globe-city',function(){if(dialog.open)close(false);},true);
  window.addEventListener('popstate',function(){close(false);});
  window.addEventListener('pagehide',function(){close(false);});
  window.addEventListener('boom:flight-view',function(event){if(event.detail.view!=='home')close(false);});
  function syncCity(){
    cancelStateMotion();
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
