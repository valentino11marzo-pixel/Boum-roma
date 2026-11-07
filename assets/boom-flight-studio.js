/* A single preview. Only public URL fields cross between its compositions. */
(function () {
  'use strict';
  var frame=document.getElementById('studioFrame'),viewport=document.getElementById('studioViewport');
  var status=document.getElementById('studioStatus'),error=document.getElementById('studioError'),open=document.getElementById('studioOpen');
  var query=new URLSearchParams(location.search);
  var publicKeys=['view','home','city','need','moveIn','moveOut','stay','budget','currency','people','type','place','homes','saved','layout'];
  var visions=['airframe','signal','orbit','dispatch','gate','connection','vector'];
  var experience=visions.includes(query.get('experience'))?query.get('experience'):query.get('experience')==='panorama'&&visions.includes(query.get('vision'))?query.get('vision'):query.get('experience')==='terminal'||(query.get('experience')==='panorama'&&query.get('variant')==='terminal')?'terminal':query.get('experience')==='club'?'club':query.get('experience')==='panorama'?'panorama':query.has('experience')?'club':'dispatch';
  var device=query.get('device')==='mobile'?'mobile':'desktop',brief=publicQuery(query),loading=false,detach=null;

  function publicQuery(source){
    var out=new URLSearchParams();
    publicKeys.forEach(function(key){var value=source.get(key);if(value&&value.length<=310)out.set(key,value);});
    return out;
  }
  function name(){return {airframe:'Airframe',signal:'Signal',orbit:'Orbit',dispatch:'Dispatch',gate:'Gate',connection:'Connection',vector:'Vector',terminal:'Terminal',panorama:'Panorama',club:'Club'}[experience];}
  function previewURL(){
    var out=new URLSearchParams(brief);out.set('direction','club');out.set('edition','club');
    if(experience!=='club')out.set('experience','panorama');
    if(experience==='terminal')out.set('variant','terminal');
    if(visions.includes(experience))out.set('vision',experience);
    return '/flight-next?'+out;
  }
  function render(){
    document.body.dataset.studioExperience=experience;document.body.dataset.studioDevice=device;
    document.querySelectorAll('button[data-studio-experience]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.studioExperience===experience));button.disabled=loading;});
    document.querySelectorAll('button[data-studio-device]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.studioDevice===device));});
    frame.title='BOOM '+name()+' — anteprima interattiva';
    open.href=previewURL();open.setAttribute('aria-disabled',String(loading));
    var out=new URLSearchParams(brief);out.set('experience',experience);out.set('device',device);
    history.replaceState(null,'','/flight-studio?'+out);
    status.textContent=loading?'Apertura di '+name()+'…':name()+' · '+(device==='mobile'?'390 px':'1280 px');
    document.getElementById('studioVariantTitle').textContent=name();
    document.getElementById('studioVariantNote').textContent={airframe:'Luce, spazio e case reali. Una superficie chiara collega destinazione, vita quotidiana e assistenza.',signal:'Il giallo diventa identità. Una grande composizione tipografica guida dalla città al prossimo passo.',orbit:'La geografia apre il percorso. Un orizzonte immersivo conduce a strumenti, case e servizi con una regia più chiara.',dispatch:'Una sala partenze aperta sul mondo: Solari, Horizon e sei destinazioni. La biglietteria riunisce servizio, condizioni e prossimo passo.',gate:'Il prossimo passo prima di tutto. Parti dalla tua situazione, confronta il servizio e vedi subito ambito e costo.',connection:'La città entra nel progetto. Skyline e il tuo punto quotidiano guidano la scelta; poi confronti affitto, spazio e tragitto.',vector:'L’indice di Dispatch incontra l’orizzonte di Orbit. Una destinazione, la sua geografia e il prossimo passo nella stessa composizione.',terminal:'La precedente composizione a banco partenze, conservata per il confronto.',panorama:'La precedente apertura Solari e globo, conservata per il confronto.',club:'La composizione Club originale, conservata per il confronto.'}[experience];
    resize();
  }
  function resize(){
    var viewportWidth=viewport.clientWidth,viewportHeight=viewport.clientHeight;
    var width=device==='mobile'?390:1280,scale=Math.min(1,viewportWidth/width);
    if(!scale)return;
    var height=Math.ceil(viewportHeight/scale),left=Math.max(0,(viewportWidth-width*scale)/2);
    frame.style.width=width+'px';frame.style.height=height+'px';
    frame.style.transform='scale('+scale+')';frame.style.left=left+'px';
  }
  function child(){
    try{
      var win=frame.contentWindow,url=new URL(win.location.href);
      if(url.origin!==location.origin||url.pathname!=='/flight-next')return null;
      return {win:win,doc:win.document,url:url};
    }catch(_){return null;}
  }
  function failure(message){error.textContent=message;error.hidden=false;return false;}
  function captureDraft(current,params){
    var doc=current.doc,win=current.win,view=doc.body.dataset.view||params.get('view')||'home';
    var city=doc.body.dataset.europeCity||params.get('city')||'rome';
    var dialog=doc.getElementById('nextStayDialog'),editing=dialog&&dialog.open;
    if(!editing&&view!=='home')return true;
    var prefix=editing?'nextDialog':city==='rome'?'next':'europe';
    var inId=editing?'nextDialogIn':prefix+'MoveIn',outId=editing?'nextDialogOut':prefix+'MoveOut';
    var arrival=doc.getElementById(inId),departure=doc.getElementById(outId),people=doc.getElementById(prefix+'People');
    if(!arrival||!departure||!people)return failure('Attendi che la vista sia pronta, poi riprova.');
    var value={moveIn:arrival.value,moveOut:departure.value,people:people.value},issue;
    if(city==='rome'||editing){
      if(!win.BOOM_STAY)return failure('Attendi che la vista sia pronta, poi riprova.');
      issue=win.BOOM_STAY.validate(value);
    }else{
      if(!win.BOOM_JOURNEY)return failure('Attendi che la vista sia pronta, poi riprova.');
      issue=win.BOOM_JOURNEY.deskError(value);
    }
    if(issue){failure(issue.message);(issue.field==='moveIn'?arrival:departure).focus();return false;}
    ['moveIn','moveOut','people'].forEach(function(key){if(value[key])params.set(key,value[key]);else params.delete(key);});
    // Exact dates replace an old duration, through the existing stay engine.
    if(city==='rome'||editing){var stay=win.BOOM_STAY.normalize(value);if(stay.durationMonths)params.set('stay',String(stay.durationMonths));else params.delete('stay');}
    if(!editing){
      var budget=doc.getElementById(prefix+'Budget');
      if(budget){if(budget.value)params.set('budget',budget.value);else params.delete('budget');}
    }
    return true;
  }
  function capture(draft){
    // An original application or desk owns its own page. Return using only the
    // last public preview URL; never inspect or copy fields from that page.
    var current=child();if(!current)return true;
    var next=publicQuery(current.url.searchParams);
    if(draft&&!captureDraft(current,next))return false;
    brief=next;experience=current.url.searchParams.get('experience')==='panorama'?(visions.includes(current.url.searchParams.get('vision'))?current.url.searchParams.get('vision'):current.url.searchParams.get('variant')==='terminal'?'terminal':'panorama'):'club';
    return true;
  }
  function load(){
    if(detach){detach();detach=null;}
    loading=true;error.hidden=true;render();frame.src=previewURL();
  }
  function watch(){
    if(detach){detach();detach=null;}
    var current=child();if(!current)return;
    var queued=0,win=current.win,doc=current.doc;
    function sync(){queued=0;if(loading)return;if(capture(false))render();}
    function queue(){if(!queued)queued=requestAnimationFrame(sync);}
    // History navigation and the original input handlers settle before capture.
    win.addEventListener('popstate',queue);win.addEventListener('hashchange',queue);
    doc.addEventListener('click',queue);doc.addEventListener('input',queue);doc.addEventListener('change',queue);
    var observer=new MutationObserver(queue);observer.observe(doc.body,{attributes:true,attributeFilter:['data-europe-city','data-view']});
    detach=function(){win.removeEventListener('popstate',queue);win.removeEventListener('hashchange',queue);doc.removeEventListener('click',queue);doc.removeEventListener('input',queue);doc.removeEventListener('change',queue);observer.disconnect();if(queued)cancelAnimationFrame(queued);};
  }
  frame.addEventListener('load',function(){if(detach){detach();detach=null;}loading=false;var current=child();if(current){capture(false);watch();}render();if(!current)status.textContent='Pagina originale aperta. La vista completa torna all’ultima anteprima.';});
  window.addEventListener('message',function(event){
    var data=event.data;
    if(loading||event.origin!==location.origin||event.source!==frame.contentWindow||!data||data.type!=='boom-design-state'||data.edition!=='club')return;
    if(capture(false))render();
  });
  document.addEventListener('click',function(event){
    var option=event.target.closest('button[data-studio-experience]');
    if(option){
      if(loading||option.dataset.studioExperience===experience)return;
      var chosen=option.dataset.studioExperience;if(!visions.concat(['panorama','terminal','club']).includes(chosen)||!capture(true))return;
      experience=chosen;load();return;
    }
    option=event.target.closest('button[data-studio-device]');
    // While a new direction loads, the iframe may still expose its outgoing
    // document. Resizing must not restore that document's previous direction.
    if(option){device=option.dataset.studioDevice;if(!loading)capture(false);render();return;}
    if(event.target.closest('#studioOpen')){
      if(loading||!capture(true)){event.preventDefault();return;}
      error.hidden=true;render();
    }
  });
  window.addEventListener('resize',resize,{passive:true});
  if(window.ResizeObserver)new ResizeObserver(resize).observe(viewport);
  window.addEventListener('pagehide',function(){if(detach){detach();detach=null;}});
  window.addEventListener('pageshow',function(event){if(event.persisted){capture(false);watch();render();}});
  load();
})();
