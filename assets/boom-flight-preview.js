(function () {
  'use strict';
  var frame=document.getElementById('sitePreview'), stage=document.getElementById('stage');
  var screen=document.getElementById('screen');
  function sizePreview() {
    if(stage.dataset.device==='mobile'){
      var scale=Math.min(1,screen.clientWidth/390);
      frame.style.width='390px';frame.style.height=(screen.clientHeight/scale)+'px';
      frame.style.transform='scale('+scale+')';frame.style.transformOrigin='top left';
    }else{frame.style.width='';frame.style.height='';frame.style.transform='';frame.style.transformOrigin='';}
  }
  if(window.ResizeObserver)new ResizeObserver(sizePreview).observe(screen);
  else window.addEventListener('resize',sizePreview);
  var play=document.getElementById('playTour'), status=document.getElementById('tourStatus');
  var steps=[
    {title:'Il tuo punto di partenza.',note:'Il pulso giallo attraversa il pattern Solari originale. Scegli inizio e fine soggiorno, poi esplora Skyline.',name:'Home',url:'/'},
    {title:'Scegli una casa. Guarda come vivi.',note:'Filtra le case, passa tra lista e Skyline. “On Skyline” raggiunge la casa selezionata senza perdere la ricerca.',name:'Apartments',url:'/apartments'},
    {title:'Tutto quello che serve per decidere.',note:'Foto senza scatti, un biglietto leggibile e Apply accanto alla casa: quattro passaggi, riepilogo e dati conservati.',name:'Apartment Details',url:null},
    {title:'La tua Roma prende forma.',note:'Your Rome: scegli il campus preciso, confronta le possibilità e condividi la tua ricerca. Find my balance ti accompagna nella scelta.',name:'Skyline',url:'/skyline?guide=1'}
  ];
  var current=0, running=false, timer, loadTimer, orbitTimer, detailPath=null, tourOrbit=null, cleanup=[];
  function stopTourOrbit() {if(tourOrbit&&tourOrbit.isConnected&&tourOrbit.getAttribute('aria-pressed')==='true')tourOrbit.click();tourOrbit=null;}
  function watchInteractions(doc,documents,frames) {
    if(!doc||!doc.documentElement||documents.has(doc))return;documents.add(doc);
    function interacted(){if(running)pause('Esplora liberamente · percorso in pausa');}
    doc.addEventListener('pointerdown',interacted,true);doc.addEventListener('keydown',interacted,true);
    cleanup.push(function(){doc.removeEventListener('pointerdown',interacted,true);doc.removeEventListener('keydown',interacted,true);});
    function nested(){doc.querySelectorAll('iframe').forEach(function(child){
      if(frames.has(child))return;frames.add(child);
      function loaded(){try{watchInteractions(child.contentDocument,documents,frames);}catch(_){}}
      child.addEventListener('load',loaded);cleanup.push(function(){child.removeEventListener('load',loaded);});loaded();
    });}
    nested();var observer=new MutationObserver(nested);observer.observe(doc.documentElement,{childList:true,subtree:true});cleanup.push(function(){observer.disconnect();});
  }
  function update() {
    var s=steps[current];
    document.querySelectorAll('[data-step]').forEach(function(b){if(+b.dataset.step===current)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    document.getElementById('stepNumber').textContent=String(current+1).padStart(2,'0');
    document.getElementById('stepTitle').textContent=s.title;
    document.getElementById('stepNote').textContent=s.note;
    document.getElementById('routeLabel').textContent='BOOM / '+s.name;
    document.getElementById('openPage').href=s.url||'/apartments';
  }
  function pause(message) {running=false;clearTimeout(timer);clearTimeout(orbitTimer);stopTourOrbit();play.textContent='▶ Avvia il percorso';play.setAttribute('aria-pressed','false');status.textContent=message||'Preview interattiva';}
  function schedule() {clearTimeout(timer);if(running)timer=setTimeout(function(){if(current===3)pause('Percorso completato · esplora liberamente');else go(current+1);},14000);}
  function go(n) {
    if(n===2&&!detailPath){status.textContent='Scegli una casa dalla pagina Apartments';pause(status.textContent);return;}
    current=(n+4)%4;update();clearTimeout(timer);clearTimeout(orbitTimer);clearTimeout(loadTimer);stopTourOrbit();
    stage.classList.remove('is-arriving');stage.classList.add('is-loading');status.textContent='Apertura di '+steps[current].name+'…';
    /* Same-origin native navigation keeps the real page transitions intact. */
    frame.contentWindow.location.assign(steps[current].url);
    loadTimer=setTimeout(function(){stage.classList.remove('is-loading');pause('La pagina richiede più tempo. Puoi aprirla direttamente.');},25000);
  }
  function orbitWhenReady(attempt) {
    if(!running||attempt>10)return;
    try {
      var doc=frame.contentDocument, nested=doc.querySelector('#cieloMappa iframe');
      if(nested)doc=nested.contentDocument;
      if(doc&&doc.querySelector('#skyGuide:not([hidden])'))return;
      var orbit=doc&&doc.getElementById('skyOrbit');
      if(orbit&&!orbit.disabled){if(orbit.getAttribute('aria-pressed')!=='true'){orbit.click();tourOrbit=orbit;}return;}
    }catch(_){}
    orbitTimer=setTimeout(function(){orbitWhenReady(attempt+1);},600);
  }
  frame.addEventListener('load',function(){
    clearTimeout(loadTimer);stage.classList.remove('is-loading');stage.classList.add('is-arriving');
    try {
      var doc=frame.contentDocument, path=frame.contentWindow.location.pathname;
      if(path==='/')current=0;else if(/^\/apartments(?:\.html)?$/.test(path))current=1;else if(path.indexOf('/listing/')===0){current=2;detailPath=path;steps[2].url=path;document.querySelector('[data-step="2"]').disabled=false;}else if(/^\/skyline(?:\.html)?$/.test(path))current=3;
      update();document.getElementById('openPage').href=frame.contentWindow.location.href;
      cleanup.forEach(function(fn){fn();});cleanup=[];watchInteractions(doc,new WeakSet(),new WeakSet());
    }catch(_){pause('Apri la pagina per continuare');return;}
    status.textContent=running?'Percorso in movimento · 14 s per tappa':'Preview interattiva';
    if(running&&(current===0||current===3))orbitWhenReady(0);
    schedule();
  });
  document.querySelectorAll('[data-step]').forEach(function(b){b.addEventListener('click',function(){pause();go(+b.dataset.step);});});
  document.querySelectorAll('[data-device]').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('[data-device]').forEach(function(a){a.setAttribute('aria-pressed',String(a===b));});stage.dataset.device=b.dataset.device;sizePreview();});});
  play.addEventListener('click',function(){if(running){pause('Percorso in pausa');return;}running=true;play.textContent='Ⅱ Pausa';play.setAttribute('aria-pressed','true');if(current===3)go(0);else{status.textContent='Percorso in movimento · 14 s per tappa';if(current===0)orbitWhenReady(0);schedule();}});
  document.getElementById('previousStep').addEventListener('click',function(){pause();go(current-1);});
  document.getElementById('nextStep').addEventListener('click',function(){pause();go(current+1);});
  document.addEventListener('visibilitychange',function(){if(document.hidden)pause('Percorso in pausa');});
  /* Resolve a real home from the current public catalogue; never ship a mock
     property, duplicate its price, or save anything to a visitor's shortlist. */
  document.querySelector('[data-step="2"]').disabled=true;
  fetch('/api/listings',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('catalogue');return r.json();}).then(function(data){
    var homes=(data.listings||[]).filter(function(h){return window.BOOM_FLIGHT.listing(h.id);});
    var home=homes.find(function(h){return /montezebio/i.test(h.name||'');})||homes[0];
    if(home&&!detailPath){detailPath=window.BOOM_FLIGHT.listing(home.id);steps[2].url=detailPath;document.querySelector('[data-step="2"]').disabled=false;}
  }).catch(function(){status.textContent='Catalogo non raggiungibile: scegli una casa da Apartments.';});
  update();
})();
