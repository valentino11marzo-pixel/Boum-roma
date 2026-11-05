/* Club's photographs belong to the same public home, never a parallel catalogue. */
(function () {
  'use strict';
  if(document.body.dataset.edition!=='club')return;
  var directions=window.BoomFlightDirections,ticket=document.getElementById('directionClubTicket'),atlas=document.getElementById('boomGlobeMount');
  if(!directions||!ticket||!atlas)return;
  var scene=document.createElement('section');scene.id='clubMedia';scene.className='club-media';scene.setAttribute('aria-label','Inside BOOM');
  scene.innerHTML='<div class="club-home-story"><div class="club-media-heading"><span>Inside a Rome home</span><span>From the BOOM collection</span></div><div class="club-media-rail" tabindex="0" aria-label="Photographs of the featured home"><p class="club-media-empty" role="status">Opening the Rome collection…</p></div><div class="club-media-controls"><span class="club-media-count" aria-live="polite"></span><div><button type="button" data-media-step="-1" aria-label="Previous home photograph">←</button><button type="button" data-media-step="1" aria-label="Next home photograph">→</button></div></div><div class="club-media-caption" hidden><div><p class="club-media-zone"></p><a class="club-media-name"></a><p class="club-media-facts"></p></div><a class="club-media-open">Explore this home <span aria-hidden="true">↗</span></a></div></div><figure class="club-desk-person"><img src="/img/founder-terrazza.jpg" alt="Valentino Egidi, founder of BOOM, photographed in Rome" width="1100" height="1648" decoding="async"><figcaption><span>Your BOOM contact</span><h2>Valentino<br>Egidi.</h2><p>Founder of BOOM<br><span>Based in Rome</span></p><p>Rental search, applications and viewings, with the scope agreed before you start.</p><a href="#europeDeskStory">Choose your support <span aria-hidden="true">↓</span></a><a href="/about">Meet the agency <span aria-hidden="true">↗</span></a></figcaption></figure>';
  // Photographs are evidence after orientation; the founder appears at the service decision.
  document.querySelector('.skyline-chapter').appendChild(scene);
  var person=scene.querySelector('.club-desk-person');
  person.querySelector('img').loading='lazy';
  person.querySelector('h2').innerHTML='Valentino Egidi.';
  person.querySelector('a[href="#europeDeskStory"]').remove();
  document.getElementById('europeDeskStory').appendChild(person);
  var rail=scene.querySelector('.club-media-rail'),count=scene.querySelector('.club-media-count'),caption=scene.querySelector('.club-media-caption'),chosen=null,version=0;
  var esc=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  function index(){var slides=Array.from(rail.querySelectorAll('figure'));if(!slides.length)return 0;var left=rail.getBoundingClientRect().left;return slides.reduce(function(best,slide,i){return Math.abs(slide.getBoundingClientRect().left-left)<Math.abs(slides[best].getBoundingClientRect().left-left)?i:best;},0);}
  function syncCount(){var total=rail.querySelectorAll('figure').length,current=index();var label=total?String(current+1).padStart(2,'0')+' / '+String(total).padStart(2,'0'):'';if(count.textContent!==label)count.textContent=label;scene.querySelector('[data-media-step="-1"]').disabled=!total||current===0;scene.querySelector('[data-media-step="1"]').disabled=!total||current===total-1;}
  function step(delta,keyboard){var slides=rail.querySelectorAll('figure'),target=slides[Math.max(0,Math.min(slides.length-1,index()+delta))];if(target)rail.scrollTo({left:target.offsetLeft-rail.offsetLeft,behavior:keyboard||matchMedia('(prefers-reduced-motion: reduce)').matches||document.getElementById('nextMotionToggle').getAttribute('aria-pressed')==='true'?'instant':'smooth'});}
  scene.addEventListener('click',function(event){var button=event.target.closest('[data-media-step]');if(button)step(Number(button.dataset.mediaStep),event.detail===0);});
  rail.addEventListener('keydown',function(event){if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();step(event.key==='ArrowRight'?1:-1,true);}});
  rail.addEventListener('scroll',syncCount,{passive:true});
  syncCount();
  var original=directions.render;
  directions.render=function(context){
    original.apply(this,arguments);
    var candidates=context.catalogue.filter(function(home){return home.lane!=='closed'&&home.images.length;});
    var next=candidates.find(function(home){return home.id==='esFhjFMVfZtkIrhkx0PR';})||candidates[0];
    if(!next){chosen=null;++version;caption.hidden=true;rail.innerHTML='<div class="club-media-empty" role="status">'+(context.error?'The collection could not be loaded. <button class="text-button" type="button" data-retry>Try again</button>':context.loaded?'No photographed home is available in this collection. Explore the catalogue below.':'Opening the Rome collection…')+'</div>';syncCount();return;}
    if(!chosen||chosen.id!==next.id||chosen.images.join()!==next.images.join()){
      chosen=next;var currentVersion=++version;
      var photos=next.id==='esFhjFMVfZtkIrhkx0PR'?[next.images[0],next.images[2],next.images[4]].concat(next.images.filter(function(_,i){return ![0,2,4].includes(i);})).filter(Boolean):next.images;
      rail.innerHTML=photos.map(function(src,i){return '<figure><img src="'+esc(src)+'" alt="'+esc(next.name)+' — photograph '+(i+1)+'" '+'loading="lazy"'+' decoding="async"><figcaption hidden>Photograph unavailable. The home details remain accessible below.</figcaption></figure>';}).join('');
      rail.querySelectorAll('img').forEach(function(img){img.addEventListener('load',function(){if(currentVersion===version)img.parentElement.style.setProperty('--photo-ratio',String(img.naturalWidth/img.naturalHeight));});img.addEventListener('error',function(){if(currentVersion!==version)return;img.hidden=true;img.nextElementSibling.hidden=false;});});rail.scrollLeft=0;syncCount();
    }
    caption.hidden=false;
    scene.querySelector('.club-media-zone').textContent=next.zone||'Rome';
    scene.querySelector('.club-media-name').textContent=next.name;
    scene.querySelector('.club-media-facts').textContent=[next.price==null?'Price on request':'€'+next.price.toLocaleString('en-GB')+' / month',next.area?next.area+' m²':null,next.status].filter(Boolean).join(' · ');
    caption.querySelectorAll('a').forEach(function(link){link.dataset.home=next.id;link.href=context.url('detail',next.id);});
  };
})();
