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
 var reduce=matchMedia('(prefers-reduced-motion: reduce)'),animations=[],assembly=null,assemblyBounds=null,pointerCity='',pointerSequence=0,lastCity=document.body.dataset.europeCity,visible=true,sequence=0,sourcePaths=null;
 var svgNS='http://www.w3.org/2000/svg',spriteAsset='/assets/boom-city-emblems.svg?v=20261111assembly1',sprite=spriteAsset+'#city-';
 // Each window addresses an architectural part of the one original sprite.
 // Bounds are in its 160 x 120 drawing space, never a second set of path data.
 function part(name,source,bounds,delay,duration,turn,reveal,windows,contour){return {name:name,source:source,bounds:bounds,delay:delay,duration:duration,turn:turn||0,reveal:reveal||'up',windows:windows,contour:contour};}
 var editions={
  rome:{parts:[
   part('lower-arcade',1,[0,0,160,120],0,500,-8,'up',null,'M0 68H18Q80 93 142 68H160V120H0Z'),
   part('upper-arcade',1,[0,0,160,120],60,500,8,'up',null,'M0 45H18Q80 74 142 45H160V68H142Q80 93 18 68H0Z'),
   part('elliptical-rim',1,[0,0,160,120],110,500,-12,'up',null,'M0 0H160V45H142Q80 74 18 45H0Z')
  ],lines:2,lineDelay:function(){return 350;}},
  madrid:{parts:[
   part('central-portal',1,[66,52,28,50],0,500,0),
   part('western-portals',1,[14,52,52,50],60,500,16,'right'),
   part('eastern-portals',1,[94,52,52,50],60,500,-16,'left'),
   part('plinth',2,[0,100,160,20],0,320,0,'left'),
   part('pediment',2,[0,0,160,100],160,500,-10)
  ],lines:8,lineDelay:function(){return 380;}},
  barcelona:{parts:[
   part('central-spires',1,[51,0,58,106],0,600,-12),
   part('outer-spires',1,[35,0,90,106],75,500,12,'up',[[35,0,16,106],[109,0,16,106]]),
   part('buttresses',1,[0,0,160,106],120,500,-8,'up',[[0,0,35,106],[125,0,35,106]]),
   part('portal',2,[48,55,64,51],40,500,8),
   part('plinth',3,[14,106,132,6],0,320,0,'left')
  ],lines:21,lineDelay:function(i){return i<8?420:350;}},
  amsterdam:{parts:[
   part('central-gable',2,[59,8,42,91],0,500,0),
   part('stepped-gable',1,[17,27,38,72],65,500,18),
   part('bell-gable',3,[105,24,34,75],110,500,-18)
  ],lines:2,lineDelay:function(i){return i?420:310;}},
  london:{parts:[
   part('western-tower',1,[29,11,30,85],0,500,14),
   part('eastern-tower',2,[101,11,30,85],60,500,-14),
   part('upper-walkway',3,[58,48,44,6],180,400,0,'left'),
   part('bridge-deck',3,[8,96,144,7],220,400,0,'left')
  ],lines:9,lineDelay:function(){return 400;}},
  milan:{parts:[
   part('facade',1,[18,31,124,75],0,500,-8),
   part('plinth',2,[12,107,136,6],0,320,0,'left'),
   part('central-spire',2,[76,0,8,66],0,500,0),
   part('inner-spires',2,[60,0,40,66],55,500,8,'up',[[60,0,8,66],[92,0,8,66]]),
   part('middle-spires',2,[44,0,72,66],100,500,-10,'up',[[44,0,8,66],[108,0,8,66]]),
   part('outer-spires',2,[29,0,102,66],140,500,12,'up',[[29,0,8,66],[123,0,8,66]]),
   part('edge-spires',2,[14,0,132,66],180,500,-12,'up',[[14,0,8,66],[138,0,8,66]])
  ],lines:11,lineDelay:function(){return 400;}}
 };
 // One parsed presentation cache of the canonical public asset. Loading never
 // queues a gesture or starts a late animation; the native picture stays usable.
 artwork.dataset.citySources='loading';
 fetch(spriteAsset,{credentials:'same-origin',cache:'force-cache'}).then(function(response){if(!response.ok)throw new Error('City artwork unavailable');return response.text();}).then(function(text){
  var documentSVG=new DOMParser().parseFromString(text,'image/svg+xml'),paths=Object.create(null);
  if(documentSVG.querySelector('parsererror'))throw new Error('Invalid city artwork');
  Object.keys(editions).forEach(function(city){
   var ids=editions[city].parts.map(function(p){return 'city-'+city+'-part-'+p.source;});
   for(var i=1;i<=editions[city].lines;i++)ids.push('city-'+city+'-line-'+i);
   ids.forEach(function(id){
    var original=documentSVG.getElementById(id);if(!original||original.localName!=='path'||!original.getAttribute('d'))throw new Error('Missing city artwork');
    var path=svgNode('path');['d','fill','fill-rule','pathLength'].forEach(function(attribute){if(original.hasAttribute(attribute))path.setAttribute(attribute,original.getAttribute(attribute));});paths[id]=path;
   });
  });
  sourcePaths=paths;artwork.dataset.citySources='ready';
 }).catch(function(){artwork.dataset.citySources='unavailable';});
 function cancel(){
  var current=animations;animations=[];current.forEach(function(animation){animation.finished.catch(function(){});animation.cancel();});
  if(assembly){assembly.remove();assembly=null;}assemblyBounds=null;
  artwork.removeAttribute('data-city-assembling');
 }
 function allowed(){return document.body.dataset.cityEditionView==='art'&&document.body.dataset.view==='home'&&visible&&!document.hidden&&!reduce.matches&&pause.getAttribute('aria-pressed')!=='true'&&!(navigator.connection&&navigator.connection.saveData);}
 function svgNode(name,attributes){var node=document.createElementNS(svgNS,name);Object.keys(attributes||{}).forEach(function(key){node.setAttribute(key,attributes[key]);});return node;}
 function sourceId(run,layer,index){return 'city-edition-source-'+run+'-'+layer+'-'+index;}
 function usePart(city,source,run){return svgNode('use',{href:'#'+sourceId(run,'part',source),'data-city-source':sprite+city+'-part-'+source});}
 function sourceDefinitions(city,edition,run){
  var svg=svgNode('svg',{class:'city-edition-sources','aria-hidden':'true',focusable:'false',width:'0',height:'0'}),defs=svgNode('defs'),seen=Object.create(null);
  function add(layer,index){
   var key='city-'+city+'-'+layer+'-'+index;if(seen[key])return;seen[key]=true;
   var path=sourcePaths[key].cloneNode(false);path.id=sourceId(run,layer,index);path.setAttribute('data-city-source',sprite+city+'-'+layer+'-'+index);defs.appendChild(path);
  }
  edition.parts.forEach(function(p){add('part',p.source);});for(var i=1;i<=edition.lines;i++)add('line',i);
  svg.appendChild(defs);return svg;
 }
 function makePlane(city,p,index,run){
  var plane=document.createElement('div'),b=p.bounds;
  plane.className='city-edition-plane';plane.dataset.cityPart=p.name;
  plane.style.transformOrigin=((b[0]+b[2]/2)/160*100)+'% '+((b[1]+b[3])/120*100)+'%';
  // All parts share the native drawing grid. Local cropped viewports introduce
  // independent subpixel rounding and visible seams on dense phone displays.
  var svg=svgNode('svg',{viewBox:'0 0 160 120','aria-hidden':'true',focusable:'false'}),use=usePart(city,p.source,run);
  var defs=svgNode('defs'),clip=svgNode('clipPath',{id:'city-edition-clip-'+run+'-'+index,clipPathUnits:'userSpaceOnUse'});
  if(p.contour)clip.appendChild(svgNode('path',{d:p.contour}));
  else (p.windows||[b]).forEach(function(w){clip.appendChild(svgNode('rect',{x:w[0]-.125,y:w[1]-.125,width:w[2]+.25,height:w[3]+.25}));});
  defs.appendChild(clip);svg.appendChild(defs);use.setAttribute('clip-path','url(#'+clip.id+')');
  svg.appendChild(use);plane.appendChild(svg);return plane;
 }
 function revealClip(p,complete){
  var b=p.bounds,edge;
  if(p.reveal==='left'){edge=(160-(complete?b[0]+b[2]+.125:b[0]-.125))/160*100;return 'inset(0 '+Math.max(0,Math.min(100,edge))+'% 0 0)';}
  if(p.reveal==='right'){edge=(complete?b[0]-.125:b[0]+b[2]+.125)/160*100;return 'inset(0 0 0 '+Math.max(0,Math.min(100,edge))+'%)';}
  edge=(complete?b[1]-.125:b[1]+b[3]+.125)/120*100;return 'inset('+Math.max(0,Math.min(100,edge))+'% 0 0 0)';
 }
 function construct(){
  cancel();if(!allowed()||!artwork.animate||!sourcePaths)return;
  var city=document.body.dataset.europeCity,edition=editions[city],emblem=signature.querySelector('svg');
  if(!edition||!emblem)return;
  var box=emblem.getBoundingClientRect(),scale=Math.min(box.width/160,box.height/120);
  if(!scale)return;
  var ease=getComputedStyle(document.body).getPropertyValue('--edition-ease').trim()||'cubic-bezier(.23,1,.32,1)',quietDepth=matchMedia('(max-width:760px)').matches?.5:1,run=++sequence;
  assembly=document.createElement('div');assembly.id='cityEditionAssembly';assembly.dataset.city=city;assembly.setAttribute('aria-hidden','true');
  assembly.style.width=(160*scale)+'px';assembly.style.height=(120*scale)+'px';assembly.style.visibility='hidden';assemblyBounds={width:box.width,height:box.height};
  signature.appendChild(assembly);
  var currentAssembly=assembly,prepared=[];
  // Timeline: architecture overlaps from 0–180ms; original gold lines land at
  // 630–700ms. Bands, Solari, service copy and every control remain stationary.
  try{
   assembly.appendChild(sourceDefinitions(city,edition,run));
   edition.parts.forEach(function(p,index){
    var plane=makePlane(city,p,index,run),svg=plane.querySelector('svg');assembly.appendChild(plane);
    prepared.push({plane:plane,svg:svg,part:p});
   });
   var accents=svgNode('svg',{viewBox:'0 0 160 120',class:'city-edition-accents','aria-hidden':'true',focusable:'false',fill:'none',stroke:'currentColor','stroke-width':'3.2','stroke-linecap':'butt'});
   for(var i=0;i<edition.lines;i++){
    var line=svgNode('use',{href:'#'+sourceId(run,'line',i+1),'data-city-source':sprite+city+'-line-'+(i+1),'data-city-line':String(i+1)});accents.appendChild(line);
   }
   assembly.appendChild(accents);
  }catch(error){cancel();return;}
  function ready(){
   if(assembly!==currentAssembly)return;
   if(!allowed()||document.body.dataset.europeCity!==city||!currentAssembly.isConnected){cancel();return;}
   try{
    var references=Array.from(currentAssembly.querySelectorAll('use'));
    if(references.some(function(reference){var bounds=reference.getBBox();return !bounds.width&&!bounds.height;})){cancel();return;}
    prepared.forEach(function(item){
     var p=item.part,timing={duration:p.duration,delay:p.delay,easing:ease,fill:'both'};
     animations.push(item.plane.animate([
      {transform:'translate3d(0,'+(-5*quietDepth)+'px,'+(-32*quietDepth)+'px) rotateX('+(12*quietDepth)+'deg) rotateY('+(p.turn*quietDepth)+'deg)'},
      {transform:'translate3d(0,0,0) rotateX(0deg) rotateY(0deg)'}
     ],timing));
     animations.push(item.svg.animate([{clipPath:revealClip(p,false)},{clipPath:revealClip(p,true)}],timing));
    });
    Array.from(accents.children).forEach(function(line,index){
     animations.push(line.animate([{strokeDasharray:'1',strokeDashoffset:'1'},{strokeDasharray:'1',strokeDashoffset:'0'}],{duration:280,delay:edition.lineDelay(index),easing:ease,fill:'backwards'}));
    });
    currentAssembly.style.visibility='';artwork.dataset.cityAssembling=city;
   }catch(error){cancel();return;}
   // Finite, interruptible WAAPI handles only. Stale completions cannot reveal
   // an old city or remove an overlay belonging to a newer native selection.
   var current=animations;Promise.all(current.map(function(a){return a.finished.catch(function(){});})).then(function(){if(animations===current)cancel();});
  }
  ready();
 }
 function show(value){
  cancel();document.body.dataset.cityEditionView=value;artwork.hidden=value!=='art';scene.hidden=value!=='globe';
  controls.querySelectorAll('[data-city-edition-view]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.cityEditionView===value));});
  // Resize the same native canvas and board after a deliberate view change.
  window.dispatchEvent(new Event('resize'));
 }
 controls.addEventListener('click',function(event){var button=event.target.closest('[data-city-edition-view]');if(button)show(button.dataset.cityEditionView);});
 document.addEventListener('click',function(event){
  var button=event.target.closest('button[data-europe-city]');++pointerSequence;
  pointerCity=button&&event.detail>0?button.dataset.europeCity:'';
 },true);
 document.addEventListener('click',function(){
  // Native city handling is registered earlier on this bubbling document phase.
  // Clearing from capture is too early: browsers checkpoint between listeners.
  var intent=pointerSequence;queueMicrotask(function(){if(pointerSequence===intent)pointerCity='';});
 });
 var owner=new MutationObserver(function(){
  var city=document.body.dataset.europeCity;
  if(city!==lastCity){lastCity=city;var animate=pointerCity===city&&!assembly;pointerCity='';if(animate)construct();else cancel();}
  else if(assembly&&!assembly.isConnected)cancel();
  if(!allowed())cancel();
 });
 var pauseObserver=new MutationObserver(function(){if(!allowed())cancel();});
 var observer='IntersectionObserver' in window?new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;if(!visible)cancel();},{threshold:.1}):null;
 function observe(){owner.observe(document.body,{attributes:true,attributeFilter:['data-europe-city','data-view']});owner.observe(signature,{childList:true});pauseObserver.observe(pause,{attributes:true,attributeFilter:['aria-pressed']});if(observer)observer.observe(artwork);}
 document.addEventListener('visibilitychange',function(){if(document.hidden)cancel();});
 window.addEventListener('resize',function(){
  if(!assembly||!assemblyBounds)return;
  var emblem=signature.querySelector('.europe-city-icon'),box=emblem&&emblem.getBoundingClientRect();
  // Native board/canvas owners also send resize notifications. Only a changed
  // drawing area invalidates this measured presentation.
  if(!box||Math.abs(box.width-assemblyBounds.width)>.5||Math.abs(box.height-assemblyBounds.height)>.5)cancel();
 });
 reduce.addEventListener('change',cancel);
 if(navigator.connection)navigator.connection.addEventListener('change',cancel);
 window.addEventListener('pagehide',function(){cancel();owner.disconnect();pauseObserver.disconnect();if(observer)observer.disconnect();});
 window.addEventListener('pageshow',observe);
 // Entry is a complete picture. Only a deliberate, settled city choice builds.
 show('art');observe();document.body.dataset.cityEditionsReady='true';
})();
