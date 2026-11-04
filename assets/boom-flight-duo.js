(function(){
  'use strict';
  var editions=['club','perspective'],views=['home','apartments','detail'],q=new URLSearchParams(location.search);
  var view=views.includes(q.get('view'))?q.get('view'):'home',home=/^[A-Za-z0-9_-]{1,100}$/.test(q.get('home')||'')?q.get('home'):'';
  if(view==='detail'&&!home)view='home';
  var device=q.get('device')==='mobile'?'mobile':'desktop',focus=editions.includes(q.get('focus'))?q.get('focus'):'both',ready={};
  var frames={club:document.getElementById('duoClub'),perspective:document.getElementById('duoPerspective')};
  var current={club:{view:view,home:home},perspective:{view:view,home:home}},initial={};
  // The workbench carries public preferences only. It never copies private places.
  ['budget','people','stay','moveIn','moveOut','place','city'].forEach(function(k){var v=q.get(k);if(v&&v.length<100)initial[k]=v;});
  var intents={club:Object.assign({},initial),perspective:Object.assign({},initial)};
  function capture(key){
    try{var u=new URL(frames[key].contentWindow.location.href);if(u.origin!==location.origin||u.pathname!=='/flight-next')return;var brief={};
      ['budget','people','stay','moveIn','moveOut','place','city','type','homes','saved','layout','need','currency'].forEach(function(k){var value=u.searchParams.get(k);if(value&&value.length<310)brief[k]=value;});intents[key]=brief;
    }catch(_){/* A service destination owns its own navigation. */}
  }
  function url(edition,inside){
    var params=new URLSearchParams({direction:'club',edition:edition});
    Object.keys(intents[edition]).forEach(function(k){params.set(k,intents[edition][k]);});
    var state=current[edition];if(state.view!=='home')params.set('view',state.view);if(state.view==='detail'&&state.home)params.set('home',state.home);
    if(inside)params.set('duo','1');return '/flight-next?'+params;
  }
  function resize(){
    editions.forEach(function(key){var frame=frames[key],host=frame.parentElement;if(!host.clientWidth)return;var width=device==='mobile'?390:1280,scale=Math.min(1,host.clientWidth/width);frame.style.width=width+'px';frame.style.height=Math.ceil(host.clientHeight/scale)+'px';frame.style.transform='scale('+scale+')';if(device==='mobile')frame.style.left=Math.max(0,(host.clientWidth-width*scale)/2)+'px';else frame.style.left='0';});
  }
  function sync(){
    document.body.dataset.duoDevice=device;document.body.dataset.duoFocus=focus;
    document.querySelectorAll('[data-duo-view]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.duoView===view));if(b.dataset.duoView==='detail')b.disabled=!home;});
    document.querySelectorAll('button[data-duo-device]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.duoDevice===device));});
    document.querySelectorAll('button[data-duo-focus]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.duoFocus===focus));});
    editions.forEach(function(key){document.querySelector('[data-duo-panel="'+key+'"]').hidden=focus!=='both'&&focus!==key;document.getElementById(key==='club'?'duoOpenClub':'duoOpenPerspective').href=url(key,false);});
    var out=new URLSearchParams({view:view,device:device});if(home)out.set('home',home);if(focus!=='both')out.set('focus',focus);
    history.replaceState(null,'','/flight-duo?'+out);resize();
    document.getElementById('duoStatus').textContent=ready.club&&ready.perspective?'A + B · INTERATTIVE':'Caricamento delle due preview…';
  }
  function navigate(key,target,id){frames[key].contentWindow.postMessage({type:'boom-duo-navigate',view:target,home:id||''},location.origin);}
  document.addEventListener('click',function(e){
    var open=e.target.closest('#duoOpenClub,#duoOpenPerspective');if(open){var key=open.id==='duoOpenClub'?'club':'perspective';capture(key);open.href=url(key,false);return;}
    var b=e.target.closest('button');if(!b)return;
    if(views.includes(b.dataset.duoView)){view=b.dataset.duoView;editions.forEach(function(key){navigate(key,view,home);});sync();}
    else if(['desktop','mobile'].includes(b.dataset.duoDevice)){device=b.dataset.duoDevice;sync();}
    else if(['both','club','perspective'].includes(b.dataset.duoFocus)){focus=b.dataset.duoFocus;sync();}
  });
  window.addEventListener('message',function(e){
    var data=e.data,key=editions.find(function(k){return e.source===frames[k].contentWindow;});
    if(!key||e.origin!==location.origin||!data||data.type!=='boom-design-state'||data.edition!==key||!views.includes(data.view))return;
    var id=typeof data.home==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(data.home)?data.home:'';
    if(data.view==='detail'&&!id)return;
    capture(key);
    var old=current[key],changed=old.view!==data.view||(data.view==='detail'&&old.home!==id);
    current[key]={view:data.view,home:id};ready[key]=true;
    if(id&&(data.view==='detail'||!home))home=id;
    if(changed){view=data.view;if(document.getElementById('duoSync').checked){var other=key==='club'?'perspective':'club';if(current[other].view!==view||(view==='detail'&&current[other].home!==home))navigate(other,view,home);}}
    sync();
  });
  window.addEventListener('resize',resize,{passive:true});
  if(window.ResizeObserver)new ResizeObserver(resize).observe(document.querySelector('.duo-panels'));
  editions.forEach(function(key){frames[key].src=url(key,true);});sync();
})();
