(function(){
 'use strict';
 function boot(){
   var map=document.getElementById('vistaCielo'),wall=document.getElementById('muro');if(!map||!wall)return;
   var heading=document.createElement('div');heading.className='flight-map-heading';heading.innerHTML='<span>BOOM Skyline · Rome</span><a href="/skyline">Enter full screen ↗</a>';map.prepend(heading);
   function cards(){wall.querySelectorAll('.casa-p[data-id]').forEach(function(c){
     if(c.querySelector('.flight-pin-button'))return;
     var photo=c.querySelector('.home-foto');if(!photo)return;
     var b=document.createElement('button');b.type='button';b.className='flight-pin-button';b.innerHTML='<span class="flight-pin-label">On Skyline</span><span aria-hidden="true">↗</span>';b.setAttribute('aria-label','Show this home on Skyline');b.title='Show this home on Skyline';photo.appendChild(b);
     b.addEventListener('click',function(e){
       e.preventDefault();e.stopPropagation();document.getElementById('vCielo').click();
       var id=c.dataset.id;
       function send(){var fr=map.querySelector('iframe');if(fr&&fr.contentWindow)fr.contentWindow.postMessage({t:'boomSelect',id:id},location.origin);}
       send();var fr=map.querySelector('iframe');if(fr)fr.addEventListener('load',send,{once:true});
       wall.querySelectorAll('.flight-selected').forEach(function(x){x.classList.remove('flight-selected');});c.classList.add('flight-selected');
       if(matchMedia('(max-width:1049px)').matches){document.getElementById('vCielo').focus({preventScroll:true});map.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}
     });
   });}
   cards();new MutationObserver(cards).observe(wall,{childList:true});
   window.addEventListener('message',function(e){
     var fr=map.querySelector('iframe');if(e.origin!==location.origin||!fr||e.source!==fr.contentWindow||!e.data||e.data.t!=='boomSelected')return;
     wall.querySelectorAll('.casa-p[data-id]').forEach(function(c){c.classList.toggle('flight-selected',c.dataset.id===e.data.id);});
   });
   var mobile=matchMedia('(max-width:1049px)');
   var requested=new URLSearchParams(location.search).get('view');
   if(window.BoomApartmentsView)window.BoomApartmentsView.show(requested==='skyline'||(!mobile.matches&&requested!=='grid'),false);
   /* Filters are useful in both views, so their drawer remains keyboard-contained. */
   ['foglioVelo','serbaVelo','paraVelo'].forEach(function(id){
     var veil=document.getElementById(id);if(!veil)return;var before,open=!veil.hidden;
     function controls(){return Array.from(veil.querySelectorAll('button,input,select,a[href]')).filter(function(n){return !n.disabled&&n.tabIndex>=0&&n.getClientRects().length;});}
     new MutationObserver(function(){
       var now=!veil.hidden;if(now===open)return;open=now;
       if(now){before=document.activeElement;var first=id==='serbaVelo'?document.getElementById('serbaMail'):controls()[0];if(first)first.focus({preventScroll:true});}
       else if(before&&before.isConnected&&!veil.contains(before))before.focus({preventScroll:true});
     }).observe(veil,{attributes:true,attributeFilter:['hidden']});
     veil.addEventListener('keydown',function(e){if(e.key!=='Tab'||veil.hidden)return;var nodes=controls();if(!nodes.length)return;var a=nodes[0],z=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}});
   });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
