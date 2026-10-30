(function () {
  'use strict';
  var directions = ['atlas','residence','club'], views = ['home','apartments','detail'];
  var query = new URLSearchParams(location.search);
  var direction = directions.includes(query.get('direction')) ? query.get('direction') : 'atlas';
  var view = views.includes(query.get('view')) ? query.get('view') : 'home';
  var home = /^[A-Za-z0-9_-]{1,100}$/.test(query.get('home') || '') ? query.get('home') : '';
  if (view === 'detail' && !home) view = 'home';
  var device = query.get('device') === 'mobile' ? 'mobile' : 'desktop';
  var frame = document.getElementById('labFrame'), intent = new URLSearchParams();
  var copy = {
    atlas:['Skyline is useful from the first screen. Homes, neighbourhoods and daily life become one decision.','A map asks more of a first-time visitor. Photography and a clear starting point must do their part.'],
    residence:['Real photography leads the experience. The homes, their proportions and their monthly rent are easy to take in.','It depends on excellent listing photography. Skyline is one step further away, so the most distinctive tool needs a deliberate invitation.'],
    club:['The search becomes an arrival pass. Solari, yellow and the aviation language give the first action a strong BOOM signature.','The metaphor can become theatre if it spreads everywhere. Keep the terms, costs and actual homes more prominent than the theme.']
  };
  function previewURL() {
    var q = new URLSearchParams({direction:direction});
    intent.forEach(function(value,key){q.set(key,value);});
    if(view !== 'home') q.set('view',view);
    if(view === 'detail' && home)q.set('home',home);
    return '/flight-next?' + q;
  }
  function sync(load) {
    document.querySelectorAll('[data-direction]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.direction===direction));});
    document.querySelectorAll('[data-view]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.view===view));if(b.dataset.view==='detail')b.disabled=!home;});
    document.querySelectorAll('button[data-device]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.device===device));});
    document.getElementById('labStage').dataset.device=device;
    updateViewportLabel();
    document.getElementById('labCurrentDirection').textContent=direction.toUpperCase();
    frame.title=direction[0].toUpperCase()+direction.slice(1)+' — interactive BOOM preview';
    document.getElementById('labOpen').href=previewURL();
    document.getElementById('labStrength').replaceChildren();
    document.getElementById('labTradeoff').replaceChildren();
    ['labStrength','labTradeoff'].forEach(function(id,i){var p=document.getElementById(id),b=document.createElement('b');b.textContent=i?'The trade-off':'The strength';p.append(b,document.createTextNode(copy[direction][i]));});
    var q=new URLSearchParams({direction:direction,view:view,device:device});if(home)q.set('home',home);
    history.replaceState(null,'','/flight-lab?'+q);
    if(load)frame.src=previewURL();
  }
  function captureIntent() {
    try {
      var current = new URL(frame.contentWindow.location.href);
      if(current.origin === location.origin && current.pathname === '/flight-next') {
        intent = new URLSearchParams();
        ['budget','people','type','saved','moveIn','moveOut','stay'].forEach(function(key){var value=current.searchParams.get(key);if(value)intent.set(key,value.slice(0,100));});
      }
    } catch (_) { /* An external service keeps its own navigation. */ }
  }
  function updateViewportLabel() {
    document.getElementById('labViewportLabel').textContent=(device==='mobile'?'MOBILE / ':'PREVIEW / ')+Math.round(frame.clientWidth)+' PX';
  }
  document.addEventListener('click',function(e){
    if(e.target.closest('#labOpen')){captureIntent();document.getElementById('labOpen').href=previewURL();return;}
    var b=e.target.closest('button');if(!b)return;
    captureIntent();
    if(b.dataset.direction&&directions.includes(b.dataset.direction)){direction=b.dataset.direction;sync(true);}
    else if(b.dataset.view&&views.includes(b.dataset.view)){view=b.dataset.view;sync(true);}
    else if(b.dataset.device){device=b.dataset.device;sync(false);}
  });
  window.addEventListener('message',function(e){
    var data=e.data;
    if(e.origin!==location.origin||e.source!==frame.contentWindow||!data||data.type!=='boom-design-state'||data.direction!==direction||!views.includes(data.view))return;
    // Retain the in-frame journey in memory when comparing compositions. The
    // workbench URL contains only the public home, direction, page and viewport.
    captureIntent();
    view=data.view;
    if(/^[A-Za-z0-9_-]{1,100}$/.test(data.home||'') && (data.view==='detail'||!home))home=data.home;
    sync(false);
  });
  if(window.ResizeObserver)new ResizeObserver(updateViewportLabel).observe(frame);
  sync(true);
})();
