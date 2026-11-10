/* Airspace: the original geography meets the original decision surface. */
(function () {
  'use strict';
  if(document.body.dataset.homeVision!=='dispatch'||!['airspace','cityeditions'].includes(document.body.dataset.dispatchComposition))return;
  var byId=function(id){return document.getElementById(id);};
  var hero=byId('nextHero'),ticket=byId('directionClubTicket'),atlas=byId('boomGlobeMount');
  var signature=byId('europeCitySignature'),story=byId('europeDeskStory'),planner=document.querySelector('.europe-planner.edition-club-runway');
  var plan=ticket&&ticket.querySelector('.edition-plan-link'),promise=ticket&&ticket.querySelector('.hero-promise');
  if(!hero||!ticket||!atlas||!signature||!story||!planner||!plan||!promise||byId('airspaceScene'))return;

  var scene=document.createElement('div');scene.id='airspaceScene';
  var decision=document.createElement('aside');decision.id='airspaceDecision';decision.setAttribute('aria-label','Your next step');
  hero.insertBefore(scene,ticket);scene.append(ticket,decision);
  // Move, never clone: Europe retains the city, offer, validation and handoff.
  decision.append(signature,planner,story);
  // The existing Full view anchor remains with the original atlas in visionScene.
  // The renderer observes this attribute even when geography is not ready yet.
  atlas.dataset.globeFraming='globe';
  var expand=atlas.querySelector('[data-panorama-expand]');if(expand)expand.title='Full view';
  var globe=window.BoomFlightGlobe;
  if(globe&&globe.state().ready)globe.setFraming('globe',{animate:false});

  function syncCity(){
    var foreign=document.body.dataset.europeCity!=='rome',focused=plan.contains(document.activeElement)?document.activeElement:null;
    planner.hidden=foreign;
    if(foreign){
      if(plan.parentElement!==promise.parentElement){promise.after(plan);if(focused)focused.focus({preventScroll:true});}
    }else if(plan.parentElement!==decision){decision.insertBefore(plan,planner);if(focused)focused.focus({preventScroll:true});}
  }
  new MutationObserver(syncCity).observe(document.body,{attributes:true,attributeFilter:['data-europe-city']});
  window.addEventListener('pageshow',syncCity);
  syncCity();document.body.dataset.airspaceReady='true';
  // Original owners remeasure the same board, hit targets and canvas after relocation.
  window.dispatchEvent(new Event('resize'));
})();
