/* Passage's view controls use the original lens, pause and dialog owners. */
(function () {
  'use strict';
  if(document.body.dataset.homeVision!=='dispatch'||document.body.dataset.dispatchComposition!=='passage')return;
  var atlas=document.getElementById('boomGlobeMount');
  var lenses=atlas&&atlas.querySelector('.dispatch-lenses'),tools=atlas&&atlas.querySelector('.panorama-globe-tools');
  var toolbar=atlas&&atlas.querySelector('.panorama-globe-toolbar'),pause=document.getElementById('nextMotionToggle');
  if(!lenses||!tools||!toolbar||!pause||atlas.querySelector('.passage-view-controls'))return;
  var controls=document.createElement('div');controls.className='passage-view-controls';
  controls.setAttribute('role','group');controls.setAttribute('aria-label','Explore the globe');
  controls.append(lenses,tools,toolbar);atlas.append(controls);
  lenses.setAttribute('aria-label','Globe view');
  function label(button,text,name){
    Array.from(button.childNodes).forEach(function(node){if(node.nodeType===3)node.remove();});
    var span=document.createElement('span');span.className='passage-control-label';span.textContent=text;
    button.append(span);button.setAttribute('aria-label',name);button.title=name;
  }
  label(lenses.querySelector('[data-dispatch-lens="globe"]'),'Globe','Show the whole globe');
  label(lenses.querySelector('[data-dispatch-lens="horizon"]'),'Close-up','Show a closer globe view');
  var expand=toolbar.querySelector('[data-panorama-expand]');
  label(expand,'Expand','Expand the globe');
  var proxy=document.querySelector('#panoramaGlobeDialog [data-panorama-motion]');
  var reduce=matchMedia('(prefers-reduced-motion: reduce)');
  var pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12"/></svg>';
  var playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
  function syncMotion(){
    var stopped=pause.getAttribute('aria-pressed')==='true',quiet=reduce.matches;
    var text=quiet?'Motion off':stopped?'Play':'Pause';
    var name=quiet?'Animations disabled by your device preference':stopped?'Play animations':'Pause animations';
    var html=(stopped&&!quiet?playIcon:pauseIcon)+'<span class="passage-control-label">'+text+'</span>';
    [pause,proxy].forEach(function(button){if(!button)return;if(button.innerHTML!==html)button.innerHTML=html;button.setAttribute('aria-label',name);button.title=name;button.disabled=quiet;});
  }
  var observer=new MutationObserver(syncMotion);
  observer.observe(pause,{attributes:true,attributeFilter:['aria-pressed']});
  if(proxy)observer.observe(proxy,{attributes:true,attributeFilter:['aria-pressed']});
  reduce.addEventListener('change',syncMotion);syncMotion();
  document.body.dataset.passageControls='ready';
})();
