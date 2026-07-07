/* BOOM Photoreal — "Explore the block" on Google Photorealistic 3D Tiles.
   Rome as it really is: photogrammetry buildings, trees, rooftops — the
   Google Maps / Earth look. Loaded ONLY on demand (CesiumJS ~3MB) and only
   when /api/maps-key returns a configured key; any failure rejects and the
   caller falls back to the MapLibre satellite orbit. Escape or ✕ closes. */
(function(){
'use strict';
var CDN='https://cdn.jsdelivr.net/npm/cesium@1.119.0/Build/Cesium/';
var loading=null,viewer=null,wrap=null;

function css(){
  if(document.getElementById('prcss'))return;
  var st=document.createElement('style');st.id='prcss';
  st.textContent='#prwrap{position:fixed;inset:0;z-index:300;background:#060607}'
   +'#prview{position:absolute;inset:0}'
   +'#prwrap .prx{position:absolute;top:14px;right:14px;z-index:5;border:1px solid rgba(255,215,0,.4);background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#FFD700;border-radius:100px;padding:11px 18px;font-size:13px;cursor:pointer;font-family:inherit;letter-spacing:.4px}'
   +'#prwrap .prl{position:absolute;left:16px;bottom:40px;z-index:5;color:rgba(255,255,255,.78);font-size:12px;letter-spacing:1px;background:rgba(0,0,0,.55);border-radius:100px;padding:8px 14px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}'
   +'#prwrap .prh{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:5;color:#FFD700;font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;background:rgba(0,0,0,.55);border:1px solid rgba(255,215,0,.3);border-radius:100px;padding:7px 14px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);white-space:nowrap}'
   +'#prwrap .prload{position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.5);font-size:12px;letter-spacing:2px;text-transform:uppercase;z-index:2;pointer-events:none}';
  document.head.appendChild(st);
}
function loadCesium(){
  return loading||(loading=new Promise(function(res,rej){
    if(window.Cesium)return res();
    window.CESIUM_BASE_URL=CDN;
    var l=document.createElement('link');l.rel='stylesheet';l.href=CDN+'Widgets/widgets.css';document.head.appendChild(l);
    var s=document.createElement('script');s.src=CDN+'Cesium.js';
    s.onload=function(){res();};
    s.onerror=function(){loading=null;rej(new Error('cesium_load_failed'));};
    document.head.appendChild(s);
    setTimeout(function(){if(!window.Cesium){loading=null;rej(new Error('cesium_timeout'));}},25000);
  }));
}
function esc(e){if(e.key==='Escape')close();}
function close(){
  try{if(viewer){viewer.destroy();}}catch(e){}
  viewer=null;
  if(wrap&&wrap.parentNode)wrap.parentNode.removeChild(wrap);
  wrap=null;
  document.removeEventListener('keydown',esc);
}
function open(o){
  return loadCesium().then(function(){
    css();close();
    wrap=document.createElement('div');wrap.id='prwrap';
    wrap.innerHTML='<div id="prview"></div>'
      +'<div class="prload">Building the real block…</div>'
      +'<button class="prx" type="button">✕ Back to map</button>'
      +'<div class="prh">Photoreal 3D — drag to take the wheel</div>'
      +'<div class="prl">'+String(o.name||'').replace(/</g,'&lt;')+' · Google Photorealistic 3D</div>';
    document.body.appendChild(wrap);
    wrap.querySelector('.prx').addEventListener('click',close);
    document.addEventListener('keydown',esc);
    var C=window.Cesium;
    viewer=new C.Viewer('prview',{
      baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,
      timeline:false,animation:false,navigationHelpButton:false,fullscreenButton:false,
      infoBox:false,selectionIndicator:false,baseLayer:false,
    });
    viewer.scene.globe.show=false;
    try{viewer.scene.backgroundColor=C.Color.fromCssColorString('#060607');}catch(e){}
    try{viewer.scene.skyAtmosphere.show=true;}catch(e){}
    return C.Cesium3DTileset.fromUrl(
      'https://tile.googleapis.com/v1/3dtiles/root.json?key='+encodeURIComponent(o.key),
      {showCreditsOnScreen:true}
    ).then(function(ts){
      if(!viewer)throw new Error('closed');
      viewer.scene.primitives.add(ts);
      var ld=wrap&&wrap.querySelector('.prload');if(ld)ld.style.display='none';
      var center=C.Cartesian3.fromDegrees(o.lng,o.lat,45);
      var heading=(o.heading||0),free=false;
      viewer.clock.onTick.addEventListener(function(){
        if(free||!viewer)return;
        heading+=0.0011;
        try{viewer.camera.lookAt(center,new C.HeadingPitchRange(heading,C.Math.toRadians(-30),300));}catch(e){}
      });
      var freeCam=function(){
        if(free)return;free=true;
        try{viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);}catch(e){}
        var h=wrap&&wrap.querySelector('.prh');if(h)h.style.display='none';
      };
      var h=new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      h.setInputAction(freeCam,C.ScreenSpaceEventType.LEFT_DOWN);
      h.setInputAction(freeCam,C.ScreenSpaceEventType.WHEEL);
      try{h.setInputAction(freeCam,C.ScreenSpaceEventType.PINCH_START);}catch(e){}
    });
  }).catch(function(err){close();throw err;});
}
window.BoomPhotoreal={open:open,close:close};
})();
