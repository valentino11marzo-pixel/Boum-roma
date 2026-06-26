/* BOOM · Background System (evaluation build)
 * Drop-in: injects a fixed, static, gold-on-black texture behind the page.
 * Six refined directions + a switcher that PERSISTS across pages (localStorage),
 * so you can judge "one for all" vs the per-page "Auto" mix. Reading-safe:
 * each texture is shaped by a light/soft mask so it recedes behind content.
 * Remove this <script> (and the file) to fully revert — it touches nothing else.
 */
(function(){
  if (window.__boomBg) return; window.__boomBg = true;
  var NSReady = function(fn){ document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',fn) : fn(); };

  var GOLD='rgba(255,223,140,1)';
  var FOIL='<defs><linearGradient id="bbFoil" x1="0" y1="0" x2="0.55" y2="1"><stop offset="0" stop-color="#FFEAAE"/><stop offset="0.5" stop-color="#E7BE48"/><stop offset="1" stop-color="#7E5F16"/></linearGradient></defs>';
  function P(x,y){return x.toFixed(1)+','+y.toFixed(1);}

  /* ---------------- refined generators ---------------- */
  function gMarmo(){ /* cloudy base + sharp gold-white veins */
    return '<defs>'
      +'<filter id="bbMrA"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="3" seed="3" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .22  0 0 0 0 .19  0 0 0 0 .13  .13 .11 .08 0 0"/></filter>'
      +'<filter id="bbMrB"><feTurbulence type="turbulence" baseFrequency="0.006 0.011" numOctaves="3" seed="7" stitchTiles="stitch" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="a"/><feComponentTransfer in="a" result="aa"><feFuncA type="table" tableValues="0 0 0 .12 .62 .12 0 0"/></feComponentTransfer><feFlood flood-color="#F0DDA8" result="c"/><feComposite in="c" in2="aa" operator="in"/></filter>'
      +'</defs><rect width="100%" height="100%" filter="url(#bbMrA)"/><rect width="100%" height="100%" filter="url(#bbMrB)" opacity="0.5"/>';
  }
  function gTravertino(){ /* warm mottle + horizontal sediment banding */
    return '<defs>'
      +'<filter id="bbTrA"><feTurbulence type="fractalNoise" baseFrequency="0.010 0.014" numOctaves="4" seed="11" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .17  0 0 0 0 .14  0 0 0 0 .10  .42 .35 .25 0 0"/></filter>'
      +'<filter id="bbTrB"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.05" numOctaves="2" seed="5" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .20  0 0 0 0 .16  0 0 0 0 .10  .16 .13 .09 0 0"/></filter>'
      +'</defs><rect width="100%" height="100%" filter="url(#bbTrA)"/><rect width="100%" height="100%" filter="url(#bbTrB)" opacity="0.5"/>';
  }
  function gCassettoni(W,H){ /* Pantheon coffered dome, polar, oculus of light */
    var cx=W*0.74, cy=H*0.30, Rmax=Math.min(W,H)*0.66, sectors=24, rings=7;
    var rad=function(k){return Rmax*Math.pow(0.78, rings-k);};
    var s=FOIL;
    for(var k=0;k<=rings;k++) s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+rad(k).toFixed(1)+'" fill="none" stroke="url(#bbFoil)" stroke-width="0.5" opacity="0.10"/>';
    for(var i=0;i<sectors;i++){ var a0=i/sectors*2*Math.PI, a1=(i+0.5)/sectors*2*Math.PI;
      for(var kk=0;kk<rings;kk++){ var r0=rad(kk), r1=rad(kk+1), pr=(r1-r0)*0.16, pa=(a1-a0)*0.34, aa0=a0+pa, aa1=a1-pa, rr0=r0+pr, rr1=r1-pr;
        s+='<path d="M'+P(cx+rr0*Math.cos(aa0),cy+rr0*Math.sin(aa0))+' L'+P(cx+rr1*Math.cos(aa0),cy+rr1*Math.sin(aa0))+' L'+P(cx+rr1*Math.cos(aa1),cy+rr1*Math.sin(aa1))+' L'+P(cx+rr0*Math.cos(aa1),cy+rr0*Math.sin(aa1))+' Z" fill="none" stroke="url(#bbFoil)" stroke-width="0.5" opacity="'+(0.07+0.17*kk/rings).toFixed(3)+'"/>';
      }
    }
    s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(rad(1)).toFixed(1)+'" fill="rgba(255,224,150,0.07)"/>';
    s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(rad(0)*0.8).toFixed(1)+'" fill="rgba(255,232,170,0.12)"/>';
    return s;
  }
  function gStream(W,H){ /* flow-field streamlines, fading at top/bottom */
    var ang=function(x,y){return Math.sin(x/240+y/520)*1.2+Math.cos(y/300-x/700)*1.1+0.4*Math.sin((x+y)/420);};
    var step=10, steps=Math.round(Math.min(W,H)/step*0.85), gap=64, s='';
    for(var sy=-gap;sy<=H+gap;sy+=gap) for(var sx=-gap;sx<=W+gap;sx+=gap){
      var x=sx+(((sx*7+sy*13)%17)-8), y=sy, d='M'+P(x,y);
      for(var k=0;k<steps;k++){ var a=ang(x,y); x+=Math.cos(a)*step; y+=Math.sin(a)*step; if(x<-30||x>W+30||y<-30||y>H+30) break; d+='L'+P(x,y); }
      var edge=1-Math.abs(sy-H*0.5)/(H*0.7), op=(0.10+0.20*Math.max(0,edge)).toFixed(3);
      s+='<path d="'+d+'" fill="none" stroke="'+GOLD+'" stroke-width="0.6" opacity="'+op+'"/>';
    }
    return s;
  }
  function gGuilloche(W,H){ /* engraved rosette + hypotrochoid weave */
    var cx=W*0.74, cy=H*0.36, base=Math.min(W,H)*0.6, s=FOIL, r,n,th,rr,d;
    for(r=0;r<6;r++){ var k=6+r*2, amp=0.10+r*0.018, RR=base*(0.34+0.66*r/6), N=480; d='';
      for(n=0;n<=N;n++){ th=n/N*2*Math.PI; rr=RR*(1+amp*Math.cos(k*th)); d+=(n?'L':'M')+P(cx+rr*Math.cos(th),cy+rr*Math.sin(th)); }
      s+='<path d="'+d+'" fill="none" stroke="url(#bbFoil)" stroke-width="0.5" opacity="'+(0.20-r*0.02).toFixed(3)+'"/>';
    }
    var Rr=base*0.86, rs=base*0.86*7/12, dd=base*0.30, M=12*240; d='';
    for(n=0;n<=M;n++){ th=n/240*2*Math.PI; d+=(n?'L':'M')+P(cx+(Rr-rs)*Math.cos(th)+dd*Math.cos((Rr-rs)/rs*th), cy+(Rr-rs)*Math.sin(th)-dd*Math.sin((Rr-rs)/rs*th)); }
    s+='<path d="'+d+'" fill="none" stroke="url(#bbFoil)" stroke-width="0.4" opacity="0.14"/>';
    return s;
  }
  function gDeco(W,H){ /* Art-Deco sunburst + concentric arcs from a corner */
    var fx=W*0.92, fy=-H*0.06, s=FOIL, rays=52, i;
    for(i=0;i<rays;i++){ var a=(Math.PI*0.52)+(i/rays)*(Math.PI*0.62), len=Math.hypot(W,H)*1.2;
      s+='<line x1="'+fx+'" y1="'+fy+'" x2="'+(fx+Math.cos(a)*len).toFixed(1)+'" y2="'+(fy+Math.sin(a)*len).toFixed(1)+'" stroke="url(#bbFoil)" stroke-width="'+(i%4===0?1.1:0.5)+'" opacity="'+(i%4===0?0.12:0.05)+'"/>';
    }
    for(i=1;i<=7;i++) s+='<circle cx="'+fx+'" cy="'+fy+'" r="'+(i*Math.min(W,H)*0.14).toFixed(1)+'" fill="none" stroke="url(#bbFoil)" stroke-width="0.6" opacity="0.05"/>';
    return s;
  }

  var POOL='radial-gradient(94% 88% at 79% 12%, #000 3%, rgba(0,0,0,.42) 50%, transparent 85%)';
  var SOFT='radial-gradient(120% 112% at 50% 32%, #000 32%, rgba(0,0,0,.5) 74%, transparent 100%)';
  var DEF={
    none:      {nm:'Off'},
    marmo:     {nm:'Marmo',      gen:function(){return gMarmo();},        mask:SOFT, op:0.8},
    travertino:{nm:'Travertino', gen:function(){return gTravertino();},   mask:SOFT, op:0.85},
    cassettoni:{nm:'Cassettoni', gen:gCassettoni,                          mask:POOL, op:1},
    stream:    {nm:'Streamlines',gen:gStream,                              mask:POOL, op:1},
    guilloche: {nm:'Guilloché',  gen:gGuilloche,                           mask:POOL, op:1},
    deco:      {nm:'Déco',       gen:gDeco,                                mask:POOL, op:1}
  };
  var ORDER=['auto','none','marmo','travertino','cassettoni','stream','guilloche','deco'];

  /* per-page default for the "Auto" (mixed) mode */
  function pageDefault(){
    var p=(location.pathname||'').toLowerCase();
    if(/apartment-detail|apartment_/.test(p)) return 'cassettoni';
    if(/apartments/.test(p)) return 'stream';
    if(p==='/'||/index|^\/$/.test(p)) return 'travertino';
    return 'marmo';
  }

  NSReady(function(){
    /* layers */
    var css='#boomBg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}'
      +'#boomBg .bb-glow{position:absolute;inset:0;background:radial-gradient(58vmax 44vmax at 79% 4%,rgba(255,216,90,.08),transparent 60%)}'
      +'#boomBg .bb-tex{position:absolute;inset:0;-webkit-mask-size:cover;mask-size:cover;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}'
      +'#boomBg .bb-tex svg{width:100%;height:100%}'
      +'#boomBg .bb-grain{position:absolute;inset:0;opacity:.24;mix-blend-mode:overlay}'
      +'#boomBg .bb-vign{position:absolute;inset:0;background:radial-gradient(140% 108% at 50% 30%,transparent 58%,rgba(0,0,0,.45) 100%)}'
      +'.bb-switch{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99999;display:flex;gap:3px;flex-wrap:wrap;max-width:min(92vw,540px);background:rgba(8,8,10,.86);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,215,0,.18);border-radius:13px;padding:5px;box-shadow:0 10px 30px rgba(0,0,0,.5);font-family:Inter,Helvetica,sans-serif}'
      +'.bb-switch .bb-lbl{font-size:8.5px;letter-spacing:1.4px;text-transform:uppercase;color:rgba(255,215,0,.7);align-self:center;padding:0 5px}'
      +'.bb-switch button{border:none;background:none;color:rgba(250,250,250,.52);font-size:11px;letter-spacing:.2px;padding:6px 9px;border-radius:9px;cursor:pointer;transition:.18s;font-family:inherit}'
      +'.bb-switch button:hover{color:#fff}.bb-switch button.on{background:#FFD700;color:#1a1407;font-weight:600}';
    var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

    var bg=document.createElement('div'); bg.id='boomBg';
    bg.innerHTML='<div class="bb-glow"></div>'
      +'<div class="bb-tex"><svg preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg></div>'
      +'<svg class="bb-grain" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="bbGrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 .86  0 0 0 0 .3  0 0 0 .55 0"/></filter></defs><rect width="100%" height="100%" filter="url(#bbGrain)"/></svg>'
      +'<div class="bb-vign"></div>';
    document.body.insertBefore(bg, document.body.firstChild);
    var texWrap=bg.querySelector('.bb-tex'), tex=texWrap.querySelector('svg');

    var stored=null; try{stored=localStorage.getItem('boomBg');}catch(e){}
    var mode = stored || 'auto';

    function resolved(){ return mode==='auto' ? pageDefault() : mode; }
    function build(){
      var W=innerWidth, H=innerHeight, key=resolved(), c=DEF[key];
      tex.setAttribute('viewBox','0 0 '+W+' '+H);
      if(!c || key==='none'){ tex.innerHTML=''; texWrap.style.opacity=0; return; }
      texWrap.style.opacity=c.op; texWrap.style.webkitMaskImage=c.mask; texWrap.style.maskImage=c.mask;
      tex.innerHTML = c.gen(W,H);
    }

    /* switcher — hidden on the live site by default; reveal with ?bg=1 (or set
       localStorage boomBgPanel=1). The chosen background still applies without it. */
    var showSwitch=/[?&]bg=1(?:&|$)/.test(location.search);
    try{ if(localStorage.getItem('boomBgPanel')==='1') showSwitch=true; }catch(_){}
    if(showSwitch){
      var sw=document.createElement('div'); sw.className='bb-switch';
      var html='<span class="bb-lbl">Sfondo</span>';
      ORDER.forEach(function(k){ var nm = k==='auto' ? 'Auto' : DEF[k].nm; html+='<button data-k="'+k+'">'+nm+'</button>'; });
      sw.innerHTML=html; document.body.appendChild(sw);
      var paint=function(){ sw.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.k===mode); }); };
      sw.addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return;
        mode=b.dataset.k;
        try{ mode==='auto' ? localStorage.removeItem('boomBg') : localStorage.setItem('boomBg', mode); }catch(_){}
        paint(); build();
      });
      paint();
    }
    build();
    var rt; addEventListener('resize', function(){ clearTimeout(rt); rt=setTimeout(build,180); }, {passive:true});
  });
})();
