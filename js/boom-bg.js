/* BOOM · Background System (finalist build)
 * Drop-in: injects a fixed, static, gold-on-black texture behind the page.
 * Finalists chosen via the background study (readability-behind-content first):
 *   Guilloché (site default) · Cassettoni (hero accent) · Marmo (editorial veil)
 *   Déco (text-light splash) · + fresh recessive options Tessellato · Acqua · Bussola.
 * Each texture is shaped by a light/soft mask so it recedes behind content.
 * Switcher is hidden on the live site (reveal with ?bg=1). Fully reversible:
 * remove this <script> and the file — it touches nothing else.
 */
(function(){
  if (window.__boomBg) return; window.__boomBg = true;
  var NSReady = function(fn){ document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',fn) : fn(); };

  var GOLD='rgba(255,223,140,1)';
  var FOIL='<defs><linearGradient id="bbFoil" x1="0.45" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE5A0"/><stop offset="0.5" stop-color="#E7BE48"/><stop offset="1" stop-color="#7E5F16"/></linearGradient></defs>';
  function P(x,y){return x.toFixed(1)+','+y.toFixed(1);}
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

  /* ---------------- finalist generators (tuned per study) ---------------- */
  function gGuilloche(W,H){ /* default — banknote rosette + hypotrochoid weave, capped + responsive */
    var narrow=W<768, cx=W*(narrow?0.85:0.74), cy=H*(narrow?0.20:0.36),
        base=Math.min(W, narrow?H*0.55:H)* (narrow?0.6:0.6), s=FOIL, r,n,th,rr,d;
    for(r=0;r<6;r++){ var k=6+r*2, amp=0.10+r*0.018, RR=base*(0.34+0.66*r/6), N=320; d='';
      for(n=0;n<=N;n++){ th=n/N*2*Math.PI; rr=RR*(1+amp*Math.cos(k*th)); d+=(n?'L':'M')+P(cx+rr*Math.cos(th),cy+rr*Math.sin(th)); }
      s+='<path d="'+d+'" fill="none" stroke="url(#bbFoil)" stroke-width="0.5" opacity="'+(0.14-r*0.018).toFixed(3)+'"/>';
    }
    var Rr=base*0.86, rs=base*0.86*7/12, dd=base*0.30, M=8*240; d='';
    for(n=0;n<=M;n++){ th=n/240*2*Math.PI; d+=(n?'L':'M')+P(cx+(Rr-rs)*Math.cos(th)+dd*Math.cos((Rr-rs)/rs*th), cy+(Rr-rs)*Math.sin(th)-dd*Math.sin((Rr-rs)/rs*th)); }
    s+='<path d="'+d+'" fill="none" stroke="url(#bbFoil)" stroke-width="0.4" opacity="0.10"/>';
    return s;
  }
  function gCassettoni(W,H){ /* Pantheon coffers — dome offset top-right, oculus + ramp halved */
    var cx=W*0.80, cy=H*0.22, Rmax=Math.min(W,H)*0.66, sectors=24, rings=7;
    var rad=function(k){return Rmax*Math.pow(0.78, rings-k);};
    var s=FOIL;
    for(var k=0;k<=rings;k++) s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+rad(k).toFixed(1)+'" fill="none" stroke="url(#bbFoil)" stroke-width="0.5" opacity="0.08"/>';
    for(var i=0;i<sectors;i++){ var a0=i/sectors*2*Math.PI, a1=(i+0.5)/sectors*2*Math.PI;
      for(var kk=0;kk<rings;kk++){ var r0=rad(kk), r1=rad(kk+1), pr=(r1-r0)*0.16, pa=(a1-a0)*0.34, aa0=a0+pa, aa1=a1-pa, rr0=r0+pr, rr1=r1-pr;
        s+='<path d="M'+P(cx+rr0*Math.cos(aa0),cy+rr0*Math.sin(aa0))+' L'+P(cx+rr1*Math.cos(aa0),cy+rr1*Math.sin(aa0))+' L'+P(cx+rr1*Math.cos(aa1),cy+rr1*Math.sin(aa1))+' L'+P(cx+rr0*Math.cos(aa1),cy+rr0*Math.sin(aa1))+' Z" fill="none" stroke="url(#bbFoil)" stroke-width="0.5" opacity="'+(0.05+0.09*kk/rings).toFixed(3)+'"/>';
      }
    }
    s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(rad(1)).toFixed(1)+'" fill="rgba(255,224,150,0.05)"/>';
    s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(rad(0)*0.8).toFixed(1)+'" fill="rgba(255,232,170,0.03)"/>';
    return s;
  }
  function gMarmo(){ /* marble — cooler, thinner veins; op set to .55 in DEF */
    return '<defs>'
      +'<filter id="bbMrA"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="3" seed="3" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .20  0 0 0 0 .18  0 0 0 0 .13  .11 .10 .07 0 0"/></filter>'
      +'<filter id="bbMrB"><feTurbulence type="turbulence" baseFrequency="0.006 0.011" numOctaves="3" seed="7" stitchTiles="stitch" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="a"/><feComponentTransfer in="a" result="aa"><feFuncA type="table" tableValues="0 0 0 0 .5 0 0 0"/></feComponentTransfer><feFlood flood-color="#C9A24A" result="c"/><feComposite in="c" in2="aa" operator="in"/></filter>'
      +'</defs><rect width="100%" height="100%" filter="url(#bbMrA)"/><rect width="100%" height="100%" filter="url(#bbMrB)" opacity="0.55"/>';
  }
  function gDeco(W,H){ /* Art-Deco corner sunburst — off-canvas focus, narrow sweep, dimmed + length falloff */
    var fx=W*1.02, fy=-H*0.06, s=FOIL, rays=34, i, len=Math.hypot(W,H)*0.6;
    for(i=0;i<rays;i++){ var a=(Math.PI*0.56)+(i/rays)*(Math.PI*0.45);
      s+='<line x1="'+fx+'" y1="'+fy+'" x2="'+(fx+Math.cos(a)*len).toFixed(1)+'" y2="'+(fy+Math.sin(a)*len).toFixed(1)+'" stroke="url(#bbFoil)" stroke-width="'+(i%4===0?0.9:0.5)+'" opacity="'+(i%4===0?0.07:0.035)+'"/>';
    }
    for(i=1;i<=6;i++) s+='<circle cx="'+fx+'" cy="'+fy+'" r="'+(i*Math.min(W,H)*0.13).toFixed(1)+'" fill="none" stroke="url(#bbFoil)" stroke-width="0.6" opacity="0.05"/>';
    return s;
  }
  function gTessellato(W,H){ /* fresh — sparse Roman mosaic, PRNG-jittered, fades from the reading column */
    var rnd=mulberry32(1337), cell=44, jit=cell*0.42, s=FOIL;
    for(var gy=-cell;gy<H+cell;gy+=cell) for(var gx=-cell;gx<W+cell;gx+=cell){
      if(rnd()<0.32) continue;
      var x=gx+(rnd()-.5)*2*jit, y=gy+(rnd()-.5)*2*jit, w=cell*(0.30+rnd()*0.34), h=cell*(0.30+rnd()*0.34), rot=(rnd()-.5)*22;
      var colFade=Math.min(1,Math.abs(x-W*0.5)/(W*0.34)), op=(0.04+0.13*colFade*rnd());
      s+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="1.2" transform="rotate('+rot.toFixed(1)+' '+x.toFixed(1)+' '+y.toFixed(1)+')" fill="url(#bbFoil)" opacity="'+op.toFixed(3)+'"/>';
    }
    return s;
  }
  function gAcqua(){ /* fresh — still-water caustic, maximally recessive (no edges/lines) */
    return '<defs><filter id="bbAqA"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="21" stitchTiles="stitch" result="n"/><feDisplacementMap in="n" in2="n" scale="40" result="d"/><feColorMatrix in="d" type="matrix" values="0 0 0 0 .20  0 0 0 0 .17  0 0 0 0 .09  .20 .16 .07 0 0"/><feGaussianBlur stdDeviation="1.4"/></filter></defs><rect width="100%" height="100%" filter="url(#bbAqA)"/>';
  }
  function gBussola(W,H){ /* fresh — single off-canvas Cosmati medallion, lightest geometric option */
    var cx=W*0.90, cy=H*0.04, R=Math.min(W,H)*0.92, s=FOIL, facs=[0.34,0.55,0.7,0.86,1], i;
    for(i=0;i<facs.length;i++) s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(R*facs[i]).toFixed(1)+'" fill="none" stroke="url(#bbFoil)" stroke-width="'+(i%2?0.5:0.9)+'" opacity="'+(0.14-i*0.018).toFixed(3)+'"/>';
    for(i=0;i<32;i++){ var ang=i/32*2*Math.PI, r0=R*0.55, r1=R*0.86;
      s+='<line x1="'+(cx+r0*Math.cos(ang)).toFixed(1)+'" y1="'+(cy+r0*Math.sin(ang)).toFixed(1)+'" x2="'+(cx+r1*Math.cos(ang)).toFixed(1)+'" y2="'+(cy+r1*Math.sin(ang)).toFixed(1)+'" stroke="url(#bbFoil)" stroke-width="0.5" opacity="0.08"/>';
    }
    return s;
  }

  var POOL='radial-gradient(94% 88% at 79% 12%, #000 3%, rgba(0,0,0,.42) 50%, transparent 85%)';
  var SOFT='radial-gradient(120% 112% at 50% 32%, #000 32%, rgba(0,0,0,.5) 74%, transparent 100%)';
  var DEF={
    none:      {nm:'Off'},
    guilloche: {nm:'Guilloché', gen:gGuilloche,  mask:POOL, op:1},
    cassettoni:{nm:'Cassettoni',gen:gCassettoni, mask:POOL, op:1},
    marmo:     {nm:'Marmo',     gen:gMarmo,       mask:SOFT, op:0.55},
    tessellato:{nm:'Tessellato',gen:gTessellato,  mask:SOFT, op:0.9},
    acqua:     {nm:'Acqua',     gen:gAcqua,       mask:SOFT, op:0.8},
    bussola:   {nm:'Bussola',   gen:gBussola,     mask:POOL, op:1},
    deco:      {nm:'Déco',      gen:gDeco,        mask:POOL, op:0.6}
  };
  var ORDER=['auto','none','guilloche','cassettoni','marmo','tessellato','acqua','bussola','deco'];

  /* per-page default for "Auto" — Guilloché site-wide, accents per surface (per the study) */
  function pageDefault(){
    var p=(location.pathname||'').toLowerCase();
    if(/apartment-detail|apartment_|\/listing\//.test(p)) return 'cassettoni';
    if(/apartments/.test(p)) return 'marmo';
    if(/login|pass-delivery|onboarding|magic-sign|share/.test(p)) return 'bussola';
    return 'guilloche';
  }

  NSReady(function(){
    var css='#boomBg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}'
      +'#boomBg .bb-glow{position:absolute;inset:0;background:radial-gradient(58vmax 44vmax at 79% 4%,rgba(255,216,90,.06),transparent 60%)}'
      +'#boomBg .bb-tex{position:absolute;inset:0;-webkit-mask-size:cover;mask-size:cover;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}'
      +'#boomBg .bb-tex svg{width:100%;height:100%}'
      +'#boomBg .bb-grain{position:absolute;inset:0;opacity:.16;mix-blend-mode:overlay}'
      +'#boomBg .bb-vign{position:absolute;inset:0;background:radial-gradient(140% 108% at 50% 30%,transparent 58%,rgba(0,0,0,.45) 100%)}'
      +'.bb-switch{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99999;display:flex;gap:3px;flex-wrap:wrap;max-width:min(94vw,560px);background:rgba(8,8,10,.86);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,215,0,.18);border-radius:13px;padding:5px;box-shadow:0 10px 30px rgba(0,0,0,.5);font-family:Inter,Helvetica,sans-serif}'
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

    /* switcher — hidden by default on the live site; reveal with ?bg=1 (or localStorage boomBgPanel=1) */
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
