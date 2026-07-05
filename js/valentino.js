/* ═══════════════════════════════════════════════════════════════════════════
   VALENTINO EGIDI — SHARED ENGINE  ·  js/valentino.js
   One defensive engine for every valentino-*.html page. Every feature guards on
   the presence of its markup, so pages include only what they need.
   ═════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ── i18n ──────────────────────────────────────────────────── */
function setLang(l){
  document.documentElement.lang=l;
  $$('[data-it]').forEach(el=>{const v=el.getAttribute('data-'+l);if(v!=null)el.innerHTML=v;});
  $$('[data-it-ph]').forEach(el=>{const v=el.getAttribute('data-'+l+'-ph');if(v!=null)el.placeholder=v;});
  $$('.langtog button').forEach(b=>b.classList.toggle('on',b.dataset.lang===l));
  try{localStorage.setItem('ve_lang',l);}catch(e){}
  document.dispatchEvent(new CustomEvent('ve:lang',{detail:l}));
}
function initLang(){
  let l='it';try{l=localStorage.getItem('ve_lang')||'it';}catch(e){}
  const tog=$('.langtog');
  if(tog)tog.addEventListener('click',e=>{const b=e.target.closest('button');if(b)setLang(b.dataset.lang);});
  setLang(l);
}

/* ── boot (home only, once per session) ────────────────────── */
function initBoot(){
  const boot=$('.boot');if(!boot)return;
  let seen=false;try{seen=sessionStorage.getItem('ve_boot')==='1';}catch(e){}
  const finish=()=>{boot.classList.add('done');setTimeout(()=>boot.remove(),1100);};
  if(seen||reduce){boot.remove();return;}
  try{sessionStorage.setItem('ve_boot','1');}catch(e){}
  setTimeout(finish,1900);
  addEventListener('load',()=>setTimeout(finish,400),{once:true});
}

/* ── page transitions (leave-cover) ────────────────────────── */
function initTransitions(){
  if(reduce)return;
  let pt=$('.pt');if(!pt){pt=document.createElement('div');pt.className='pt';document.body.appendChild(pt);}
  addEventListener('pageshow',()=>document.body.classList.remove('leaving'));
  document.addEventListener('click',e=>{
    const a=e.target.closest('a');if(!a)return;
    const href=a.getAttribute('href')||'';
    if(a.target==='_blank'||a.hasAttribute('download')||e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;
    if(!href||href.startsWith('#')||href.startsWith('http')||href.startsWith('mailto')||href.startsWith('tel')||href.startsWith('//'))return;
    if(a.hostname&&a.hostname!==location.hostname)return;
    e.preventDefault();document.body.classList.add('leaving');
    setTimeout(()=>{location.href=href;},420);
  });
}

/* ── custom cursor ─────────────────────────────────────────── */
function initCursor(){
  if(!fine||reduce)return;
  const cur=$('#cur'),curd=$('#curd');if(!cur||!curd)return;const cl=cur.querySelector('.cl');
  document.body.classList.add('cur-on');
  let tx=innerWidth/2,ty=innerHeight/2,cx=tx,cy=ty;
  addEventListener('mousemove',e=>{tx=e.clientX;ty=e.clientY;curd.style.transform=`translate(${tx}px,${ty}px) translate(-50%,-50%)`;},{passive:true});
  (function loop(){cx+=(tx-cx)*.2;cy+=(ty-cy)*.2;cur.style.transform=`translate(${cx}px,${cy}px) translate(-50%,-50%)`;requestAnimationFrame(loop);})();
  const bind=el=>{const lab=el.getAttribute('data-cursor');
    el.addEventListener('mouseenter',()=>{if(lab){cur.classList.add('lab');if(cl)cl.textContent=lab;}else cur.classList.add('lg');});
    el.addEventListener('mouseleave',()=>{cur.classList.remove('lab','lg');if(cl)cl.textContent='';});};
  $$('a,button,[data-cursor],.zcard,.lcard').forEach(bind);
}

/* ── 3D tilt + magnetic ────────────────────────────────────── */
function initTiltMag(){
  if(!fine||reduce)return;
  const tilt=(el,max)=>{
    el.addEventListener('mousemove',e=>{const r=el.getBoundingClientRect();
      const px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;
      el.style.transform=`perspective(900px) rotateY(${(px*max).toFixed(2)}deg) rotateX(${(-py*max).toFixed(2)}deg)`;},{passive:true});
    el.addEventListener('mouseleave',()=>el.style.transform='');};
  const fig=$('#heroFig');if(fig)tilt(fig,+fig.dataset.tilt||6);
  $$('.pillar,.tcard').forEach(el=>tilt(el,3.5));
  $$('.btn-ink,.nav-cta').forEach(el=>{el.classList.add('mag');
    el.addEventListener('mousemove',e=>{const r=el.getBoundingClientRect();
      el.style.transform=`translate(${((e.clientX-r.left-r.width/2)*.28).toFixed(1)}px,${((e.clientY-r.top-r.height/2)*.5).toFixed(1)}px)`;},{passive:true});
    el.addEventListener('mouseleave',()=>el.style.transform='');});
}

/* ── reveals + count-up ────────────────────────────────────── */
function initReveals(){
  $$('.kin').forEach(h=>requestAnimationFrame(()=>setTimeout(()=>h.classList.add('in'),reduce?0:120)));
  if(!('IntersectionObserver'in window)){$$('.rv,[data-st],.kin').forEach(e=>e.classList.add('in'));return;}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.13});
  $$('.rv,[data-st]').forEach(el=>io.observe(el));
  const cio=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;cio.unobserve(e.target);
    const el=e.target,t=+el.dataset.c;let s=null;
    (function f(ts){if(!s)s=ts;const p=Math.min((ts-s)/1200,1),k=1-Math.pow(1-p,3);el.childNodes[0].nodeValue=Math.round(k*t);if(p<1)requestAnimationFrame(f);})(performance.now());
  }),{threshold:.6});
  $$('[data-c]').forEach(el=>cio.observe(el));
}

/* ── scroll engine: nav, progress, story, zones, hero parallax, telemetry ── */
function initScroll(){
  const nav=$('#nav'),prog=$('#prog');
  const story=$('.story'),zones=$('.zones');
  const zTrack=$('#zonesTrack'),zProg=$('#zonesProg');
  const scenes=$$('[data-scene]');const rail=$('#storyRail');
  if(rail)scenes.forEach(()=>rail.insertAdjacentHTML('beforeend','<span></span>'));
  const dots=$$('#storyRail span');
  const hud=$('.hero-hud'),telem=$('#telem');
  const navLinks=$$('.nav-mid a'),ind=$('#navInd');
  const spy=navLinks.filter(a=>(a.getAttribute('href')||'').charAt(0)==='#').map(a=>({a,sec:$(a.getAttribute('href'))})).filter(x=>x.sec);
  const activeLink=$('.nav-mid a[aria-current="page"]');
  const moveInd=a=>{if(ind&&a){ind.style.left=a.offsetLeft+'px';ind.style.width=a.offsetWidth+'px';ind.style.opacity='1';}};
  navLinks.forEach(a=>a.addEventListener('mouseenter',()=>moveInd(a)));
  const navMid=$('.nav-mid');if(navMid)navMid.addEventListener('mouseleave',()=>{if(spy.length)frame();else if(activeLink)moveInd(activeLink);});
  let tk=false;
  function frame(){
    const y=scrollY,vh=innerHeight,docH=document.documentElement.scrollHeight-vh;
    if(prog)prog.style.width=(docH>0?y/docH*100:0)+'%';
    if(nav)nav.classList.toggle('solid',y>vh*0.7);
    if(!reduce){
      if(story){const top=story.offsetTop,hh=story.offsetHeight,p=clamp((y-top)/(hh-vh),0,1),n=scenes.length,pos=p*(n-1);
        scenes.forEach((sc,i)=>{const o=clamp(1-Math.abs(pos-i),0,1);sc.style.opacity=o.toFixed(3);
          const img=sc.querySelector('img');if(img)img.style.transform=`scale(${(1.08-o*0.08).toFixed(3)})`;
          const tx=sc.querySelector('.scene-txt');if(tx)tx.style.transform=`translateY(${(pos-i)*40}px)`;});
        const a=Math.round(pos);dots.forEach((dt,i)=>dt.classList.toggle('on',i===a));}
      if(zones&&zTrack){const top=zones.offsetTop,hh=zones.offsetHeight,p=clamp((y-top)/(hh-vh),0,1);
        const maxX=zTrack.scrollWidth-innerWidth;zTrack.style.transform=`translateX(${(-p*maxX).toFixed(1)}px)`;
        if(zProg)zProg.style.width=(20+p*80)+'%';}
      if(hud&&y<vh)hud.style.transform=`translateY(${(y*0.12).toFixed(1)}px)`;
    }
    if(spy.length){const yy=y+vh*0.32;let cur=null;spy.forEach(m=>{if(m.sec.offsetTop<=yy)cur=m;});
      navLinks.forEach(a=>a.classList.remove('act'));
      if(cur){cur.a.classList.add('act');moveInd(cur.a);}else if(ind)ind.style.opacity='0';}
    if(telem){const pct=docH>0?Math.round(y/docH*100):0;let name=telem.dataset.sec||telem.dataset.home||'Home';
      spy.forEach(m=>{if(m.sec.getBoundingClientRect().top<=vh*0.4)name=m.a.textContent.trim();});
      telem.innerHTML=`Scroll <b>${String(pct).padStart(3,'0')}%</b> · ${name}`;}
    tk=false;
  }
  addEventListener('scroll',()=>{if(!tk){requestAnimationFrame(frame);tk=true;}},{passive:true});
  addEventListener('resize',frame);frame();
  if(!spy.length&&activeLink)moveInd(activeLink);
}

/* ── Rome clock ────────────────────────────────────────────── */
function initClock(){const clk=$('#clock');if(!clk)return;
  const t=()=>{try{clk.textContent=new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());}catch(e){}};
  t();setInterval(t,1000);}

/* ── floating CTA ──────────────────────────────────────────── */
function initFab(){const fab=$('#fab');if(!fab)return;const target=$(fab.getAttribute('href')||'#valuta');let tk=false;
  const upd=()=>{const y=scrollY,vh=innerHeight;let near=false;
    if(target){const r=target.getBoundingClientRect();near=r.top<vh*0.85&&r.bottom>vh*0.15;}
    fab.classList.toggle('show',y>vh*0.9&&!near);tk=false;};
  addEventListener('scroll',()=>{if(!tk){requestAnimationFrame(upd);tk=true;}},{passive:true});upd();}

/* ── valuation form → WhatsApp ─────────────────────────────── */
function initForm(){const vf=$('#valForm');if(!vf)return;
  vf.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(vf),g=k=>(d.get(k)||'').toString().trim();
    const msg=`Ciao Valentino, vorrei una valutazione onesta.\n\nIndirizzo: ${g('addr')}\nSuperficie: ${g('mq')} m²\nNome: ${g('nome')}\nContatto: ${g('contact')}`;
    window.open('https://wa.me/393313251961?text='+encodeURIComponent(msg),'_blank');});}

/* ── estimator + distribution viz ──────────────────────────── */
function initEstimator(){
  const sel=$('#zoneSel');if(!sel)return;
  const loEl=$('#estLo'),hiEl=$('#estHi'),bar=$('#estBar'),tot=$('#estTotal');
  const cv=$('#estViz'),ctx=cv?cv.getContext('2d'):null;
  const MAXHI=9500,fmt=n=>n.toLocaleString('it-IT');let cur=null,raf=null;
  const tween=(el,to)=>{if(!el)return;const from=parseInt((el.textContent||'0').replace(/\D/g,''))||0,s=performance.now();
    (function step(t){const p=Math.min((t-s)/650,1),k=1-Math.pow(1-p,3);el.textContent=fmt(Math.round(from+(to-from)*k));if(p<1)requestAnimationFrame(step);})(s);};
  function size(){if(!cv)return;const r=cv.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);cv.width=Math.max(1,r.width*d);cv.height=Math.max(1,r.height*d);ctx.setTransform(d,0,0,d,0,0);}
  function draw(prog){if(!ctx||!cur)return;const r=cv.getBoundingClientRect(),W=r.width,H=r.height;ctx.clearRect(0,0,W,H);
    const pad=2,baseY=H-12,mid=(cur.lo+cur.hi)/2,spread=(cur.hi-cur.lo),minX=cur.lo-spread*.9,maxX=cur.hi+spread*.9;
    const xOf=v=>pad+((v-minX)/(maxX-minX))*(W-2*pad),g=v=>Math.exp(-Math.pow((v-mid)/(spread*.55),2));
    ctx.fillStyle='rgba(181,83,46,0.13)';ctx.beginPath();ctx.moveTo(xOf(cur.lo),baseY);
    for(let v=cur.lo;v<=cur.hi;v+=(cur.hi-cur.lo)/44)ctx.lineTo(xOf(v),baseY-g(v)*(baseY-6)*prog);
    ctx.lineTo(xOf(cur.hi),baseY);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(21,19,13,0.5)';ctx.lineWidth=1.3;ctx.beginPath();let st=false;const endV=minX+(maxX-minX)*prog;
    for(let v=minX;v<=endV;v+=(maxX-minX)/130){const x=xOf(v),yv=baseY-g(v)*(baseY-6);if(!st){ctx.moveTo(x,yv);st=true;}else ctx.lineTo(x,yv);}
    ctx.stroke();ctx.strokeStyle='rgba(21,19,13,0.16)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,baseY+.5);ctx.lineTo(W-pad,baseY+.5);ctx.stroke();
    if(prog>.55){const x=xOf(mid);ctx.strokeStyle='#B5532E';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,baseY);ctx.lineTo(x,baseY-g(mid)*(baseY-6));ctx.stroke();
      ctx.fillStyle='#B5532E';ctx.font='9px "IBM Plex Mono",monospace';ctx.textAlign='center';ctx.fillText('prezzo onesto',Math.min(Math.max(x,40),W-40),8);}}
  function animate(){if(!ctx)return;cancelAnimationFrame(raf);const s=performance.now();
    (function step(t){const p=Math.min((t-s)/950,1);draw(1-Math.pow(1-p,3));if(p<1)raf=requestAnimationFrame(step);})(s);}
  sel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    sel.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
    const lo=+b.dataset.lo,hi=+b.dataset.hi;cur={lo,hi};tween(loEl,lo);tween(hiEl,hi);
    if(bar)bar.style.width=Math.round(hi/MAXHI*100)+'%';
    const mqIn=$('#valForm input[name="mq"]');const mq=mqIn&&parseFloat(mqIn.value)>0?parseFloat(mqIn.value):null;
    if(tot)tot.innerHTML=mq?`≈ <b style="color:var(--stone-ink)">${fmt(Math.round(lo*mq/1000))}k – ${fmt(Math.round(hi*mq/1000))}k €</b> per ${mq} m² <span style="opacity:.6">(indicativo)</span>`:`Inserisci i m² nel modulo per il totale indicativo.`;
    if(ctx){size();animate();}});
  addEventListener('resize',()=>{if(cur&&ctx){size();draw(1);}});
}

/* ── living travertine (WebGL, scroll + cursor reactive) ───── */
function initShader(){
  if(reduce)return;const cv=$('#trav');if(!cv)return;let gl;
  try{gl=cv.getContext('webgl')||cv.getContext('experimental-webgl');}catch(e){}
  if(!gl){cv.remove();return;}
  const vs='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs='precision highp float;uniform vec2 u_res;uniform float u_time;uniform vec2 u_mouse;uniform float u_scroll;'+
  'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'+
  'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}'+
  'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<6;i++){v+=a*noise(p);p*=2.02;a*=.5;}return v;}'+
  'void main(){vec2 uv=gl_FragCoord.xy/u_res.xy;vec2 p=uv*vec2(u_res.x/u_res.y,1.)*2.1;p.y+=u_scroll*0.55;float t=u_time*0.035+u_scroll*0.4;'+
  'vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));vec2 r=vec2(fbm(p+3.5*q+vec2(1.7,9.2)),fbm(p+3.5*q+vec2(8.3,2.8)));float f=fbm(p+3.8*r);'+
  'float veins=abs(sin((p.x+f*3.2)*3.14159+r.x*4.0));veins=pow(1.0-veins,2.2);'+
  'vec3 base=mix(vec3(0.82,0.78,0.68),vec3(0.73,0.68,0.56),f);vec3 col=mix(base,vec3(0.60,0.55,0.44),veins*0.55);'+
  'col=mix(col,vec3(0.88,0.85,0.76),smoothstep(0.45,0.95,f)*0.5);float d=distance(uv,u_mouse);'+
  'col+=vec3(0.71,0.33,0.18)*smoothstep(0.55,0.0,d)*0.16;col+=vec3(1.0,0.96,0.86)*smoothstep(0.32,0.0,d)*0.10;'+
  'col+=(hash(gl_FragCoord.xy+u_time)-0.5)*0.025;gl_FragColor=vec4(col,1.0);}';
  const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return gl.getShaderParameter(o,gl.COMPILE_STATUS)?o:null;};
  const v=sh(gl.VERTEX_SHADER,vs),f=sh(gl.FRAGMENT_SHADER,fs);if(!v||!f){cv.remove();return;}
  const pr=gl.createProgram();gl.attachShader(pr,v);gl.attachShader(pr,f);gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){cv.remove();return;}gl.useProgram(pr);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const uRes=gl.getUniformLocation(pr,'u_res'),uTime=gl.getUniformLocation(pr,'u_time'),uMouse=gl.getUniformLocation(pr,'u_mouse'),uScroll=gl.getUniformLocation(pr,'u_scroll');
  let W=0,H=0,mx=.7,my=.5,tmx=.7,tmy=.5;const dpr=()=>Math.min(devicePixelRatio||1,2);
  function size(){const r=cv.getBoundingClientRect(),d=dpr();W=Math.max(1,r.width*d);H=Math.max(1,r.height*d);cv.width=W;cv.height=H;gl.viewport(0,0,W,H);}
  size();addEventListener('resize',size);
  const host=cv.parentElement;if(host)host.addEventListener('mousemove',e=>{const r=cv.getBoundingClientRect();tmx=(e.clientX-r.left)/r.width;tmy=1-(e.clientY-r.top)/r.height;},{passive:true});
  let vis=true;new IntersectionObserver(es=>es.forEach(e=>vis=e.isIntersecting),{threshold:.01}).observe(cv);
  const t0=performance.now();
  (function render(now){requestAnimationFrame(render);if(!vis)return;mx+=(tmx-mx)*.06;my+=(tmy-my)*.06;
    const sc=scrollY/((document.documentElement.scrollHeight-innerHeight)||1);
    gl.uniform2f(uRes,W,H);gl.uniform1f(uTime,(now-t0)/1000);gl.uniform2f(uMouse,mx,my);gl.uniform1f(uScroll,sc);
    gl.drawArrays(gl.TRIANGLES,0,3);})(t0);
}

/* ── signature (writes on when seen) ───────────────────────── */
function initSignature(){
  const sigs=$$('.signature');if(!sigs.length)return;
  if(reduce||!('IntersectionObserver'in window)){sigs.forEach(s=>s.classList.add('drawn'));return;}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){setTimeout(()=>e.target.classList.add('drawn'),200);io.unobserve(e.target);}}),{threshold:.5});
  sigs.forEach(s=>io.observe(s));
}

/* ── dashboard preview: sparklines + automation pipeline ───── */
function initDashboard(){
  const dash=$('.dash');if(!dash)return;
  const sparks=$$('.dash .spark').map(cv=>{const ctx=cv.getContext('2d');
    const data=cv.dataset.pts?cv.dataset.pts.split(',').map(Number):Array.from({length:12},(_,i)=>0.2+i/11*0.7+Math.random()*0.12);
    const size=()=>{const d=Math.min(devicePixelRatio||1,2),r=cv.getBoundingClientRect();cv.width=Math.max(1,r.width*d);cv.height=Math.max(1,r.height*d);if(ctx)ctx.setTransform(d,0,0,d,0,0);};
    size();return{cv,ctx,data,size};});
  function draw(s,prog){const{cv,ctx,data}=s;if(!ctx)return;const r=cv.getBoundingClientRect(),W=r.width,H=r.height;ctx.clearRect(0,0,W,H);
    const max=Math.max.apply(0,data),min=Math.min.apply(0,data),X=i=>i/(data.length-1)*W,Y=v=>H-((v-min)/((max-min)||1))*(H-4)-2,n=Math.max(2,Math.round(data.length*prog));
    ctx.beginPath();ctx.moveTo(X(0),H);for(let i=0;i<n;i++)ctx.lineTo(X(i),Y(data[i]));ctx.lineTo(X(n-1),H);ctx.closePath();ctx.fillStyle='rgba(181,83,46,.10)';ctx.fill();
    ctx.beginPath();for(let i=0;i<n;i++){const px=X(i),py=Y(data[i]);i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.strokeStyle='#B5532E';ctx.lineWidth=1.5;ctx.stroke();
    ctx.beginPath();ctx.arc(X(n-1),Y(data[n-1]),2.2,0,6.283);ctx.fillStyle='#B5532E';ctx.fill();}
  function run(){
    const fill=$('.pipe-fill'),nodes=$$('.pnode'),stage=+dash.dataset.stage||0.6,on=Math.max(1,Math.round(nodes.length*stage));
    nodes.forEach((nd,i)=>setTimeout(()=>nd.classList.toggle('on',i<on),reduce?0:120*i+200));
    if(fill&&nodes.length>1)setTimeout(()=>{fill.style.width=((on-1)/(nodes.length-1)*86)+'%';},reduce?0:320);
    sparks.forEach(s=>{if(reduce){draw(s,1);return;}let st=null;(function step(t){if(!st)st=t;const p=Math.min((t-st)/1100,1);draw(s,Math.max(.12,1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(step);})(performance.now());});
  }
  if(reduce||!('IntersectionObserver'in window)){run();return;}
  new IntersectionObserver((es,o)=>es.forEach(e=>{if(e.isIntersecting){run();o.disconnect();}}),{threshold:.3}).observe(dash);
  addEventListener('resize',()=>sparks.forEach(s=>{s.size();draw(s,1);}));
}

/* ── decode (scramble → resolve) ───────────────────────────── */
function initDecode(){
  const els=$$('[data-decode]');if(!els.length)return;
  const G='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%/&';
  const run=el=>{const final=el.getAttribute('data-final')||el.textContent;el.setAttribute('data-final',final);
    if(reduce){el.textContent=final;return;}
    const start=performance.now(),dur=820,n=final.length;
    (function step(t){const p=Math.min((t-start)/dur,1),rev=Math.floor(p*n);let out='';
      for(let i=0;i<n;i++){const c=final[i];out+=(c===' '||i<rev)?c:G[(Math.random()*G.length)|0];}
      el.textContent=out;if(p<1)requestAnimationFrame(step);else el.textContent=final;})(start);};
  if(reduce||!('IntersectionObserver'in window)){els.forEach(run);return;}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){run(e.target);io.unobserve(e.target);}}),{threshold:.6});
  els.forEach(e=>io.observe(e));
}

/* ── constellation (Roma in dati — generative data-art) ────── */
function initConstellation(){
  const cv=$('#mapCanvas');if(!cv)return;const ctx=cv.getContext('2d');if(!ctx)return;
  const N=[{n:'Centro Storico',x:.46,y:.40,p:8000},{n:'Prati',x:.31,y:.27,p:6500},{n:'Parioli',x:.63,y:.17,p:6200},
    {n:'Monti',x:.56,y:.45,p:6800},{n:'Trastevere',x:.39,y:.60,p:6000},{n:'Aventino',x:.51,y:.66,p:6500},
    {n:'Testaccio',x:.40,y:.75,p:5200},{n:'Pigneto',x:.75,y:.60,p:3800},{n:'EUR',x:.59,y:.89,p:4200}];
  const E=[];N.forEach((a,i)=>{N.map((b,j)=>({j,d:Math.hypot(a.x-b.x,a.y-b.y)})).filter(o=>o.j!==i)
    .sort((u,v)=>u.d-v.d).slice(0,2).forEach(o=>{const key=i<o.j?i+'-'+o.j:o.j+'-'+i;if(!E.some(e=>e.key===key))E.push({key,a:i,b:o.j});});});
  const maxP=Math.max.apply(0,N.map(n=>n.p));
  let W=0,H=0,mx=0,my=0,tmx=0,tmy=0,prog=0,hover=-1,running=false;
  function size(){const D=Math.min(devicePixelRatio||1,2),r=cv.getBoundingClientRect();W=r.width;H=r.height;cv.width=Math.max(1,W*D);cv.height=Math.max(1,H*D);ctx.setTransform(D,0,0,D,0,0);}
  size();addEventListener('resize',size);
  function pos(nd){const px=Math.min(W*0.17,130),py=Math.min(H*0.16,84);return{x:px+nd.x*(W-2*px)+mx*16,y:py+nd.y*(H-2*py)+my*16};}
  cv.addEventListener('mousemove',e=>{const r=cv.getBoundingClientRect();tmx=((e.clientX-r.left)/r.width-.5)*2;tmy=((e.clientY-r.top)/r.height-.5)*2;
    let best=-1,bd=24;N.forEach((nd,i)=>{const pp=pos(nd),d=Math.hypot(e.clientX-r.left-pp.x,e.clientY-r.top-pp.y);if(d<bd){bd=d;best=i;}});hover=best;});
  cv.addEventListener('mouseleave',()=>{tmx=tmy=0;hover=-1;});
  function draw(now){
    mx+=(tmx-mx)*.05;my+=(tmy-my)*.05;ctx.clearRect(0,0,W,H);
    E.forEach((e,k)=>{const ep=Math.min(1,Math.max(0,prog*E.length-k));if(ep<=0)return;
      const a=pos(N[e.a]),b=pos(N[e.b]),hot=hover===e.a||hover===e.b;
      ctx.strokeStyle=hot?'rgba(181,83,46,.5)':'rgba(20,18,13,.13)';ctx.lineWidth=hot?1.3:1;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x+(b.x-a.x)*ep,a.y+(b.y-a.y)*ep);ctx.stroke();});
    N.forEach((nd,i)=>{const np=Math.min(1,Math.max(0,prog*1.4-(i/N.length)*0.4));if(np<=0)return;
      const pp=pos(nd),pulse=1+Math.sin(now/900+i)*0.12,r=(3+(nd.p/maxP)*4)*np*(hover===i?1.55:1)*pulse;
      if(hover===i){ctx.beginPath();ctx.arc(pp.x,pp.y,r+6,0,6.283);ctx.strokeStyle='rgba(181,83,46,.4)';ctx.lineWidth=1;ctx.stroke();}
      ctx.beginPath();ctx.arc(pp.x,pp.y,r,0,6.283);ctx.fillStyle=hover===i?'#B5532E':'rgba(20,18,13,.82)';ctx.fill();
      if(np>0.8){ctx.globalAlpha=hover===i?1:0.8;ctx.textAlign='left';
        ctx.font='600 11px "IBM Plex Mono",monospace';ctx.fillStyle='#14120d';ctx.fillText(nd.n.toUpperCase(),pp.x+11,pp.y-2);
        ctx.font='400 10px "IBM Plex Mono",monospace';ctx.fillStyle='#B5532E';ctx.fillText('€'+nd.p.toLocaleString('it-IT')+'/m²',pp.x+11,pp.y+11);ctx.globalAlpha=1;}});
  }
  function loop(now){if(!running)return;if(prog<1)prog=Math.min(1,prog+0.012);draw(now);requestAnimationFrame(loop);}
  if(reduce){prog=1;draw(performance.now());return;}
  if('IntersectionObserver'in window){new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){if(!running){running=true;requestAnimationFrame(loop);}}else running=false;}),{threshold:.05}).observe(cv);}
  else{running=true;requestAnimationFrame(loop);}
}

/* ── word cycle (hero rotating word) ───────────────────────── */
function initWordCycle(){
  if(reduce)return;
  setInterval(()=>{$$('.wcycle').forEach(el=>{
    const words=(el.dataset.words||'').split('|').filter(Boolean);if(words.length<2)return;
    let ww=el.querySelector('.ww');let i=+el.dataset.i||0;
    if(!ww){ww=document.createElement('span');ww.className='ww';ww.textContent=words[i];el.textContent='';el.appendChild(ww);}
    ww.classList.add('out');
    setTimeout(()=>{i=(i+1)%words.length;el.dataset.i=i;ww.textContent=words[i];
      ww.classList.remove('out');ww.classList.add('pre');
      requestAnimationFrame(()=>requestAnimationFrame(()=>ww.classList.remove('pre')));},460);
  });},3200);
}

/* ── honesty marquee (bilingual, seamless loop) ────────────── */
function initMarquee(){
  const m=$('.marq');if(!m)return;
  const build=()=>{const l=document.documentElement.lang||'it';
    const items=((l==='en'?m.dataset.marqEn:m.dataset.marqIt)||m.dataset.marqIt||'').split('|').filter(Boolean);
    if(!items.length)return;
    const track=document.createElement('div');track.className='marq-track';
    track.innerHTML=items.map(t=>`<span class="mi">${t}</span>`).join('').repeat(2);
    m.innerHTML='';m.appendChild(track);};
  document.addEventListener('ve:lang',build);build();
}

/* ── spotlight glow on cards ───────────────────────────────── */
function initSpotlight(){
  if(!fine)return;
  $$('.pillar,.tcard,.bfeat,.dstat,.fcard').forEach(el=>{el.classList.add('glow');
    el.addEventListener('mousemove',e=>{const r=el.getBoundingClientRect();
      el.style.setProperty('--gx',((e.clientX-r.left)/r.width*100).toFixed(1)+'%');
      el.style.setProperty('--gy',((e.clientY-r.top)/r.height*100).toFixed(1)+'%');},{passive:true});});
}

/* ── FAQ accordion (one open at a time) ────────────────────── */
function initFaq(){
  const faq=$('.faq');if(!faq)return;
  faq.addEventListener('click',e=>{const q=e.target.closest('.fq-q');if(!q)return;
    const item=q.parentElement,wasOpen=item.classList.contains('open');
    faq.querySelectorAll('.fq.open').forEach(o=>{o.classList.remove('open');const b=o.querySelector('.fq-q');if(b)b.setAttribute('aria-expanded','false');});
    if(!wasOpen){item.classList.add('open');q.setAttribute('aria-expanded','true');}});
}

/* ── chapter rail (roman numerals, from [data-chap]) ───────── */
function initChapters(){
  const secs=$$('[data-chap]');if(!secs.length)return;
  const R=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  const rail=document.createElement('nav');rail.className='chap';rail.setAttribute('aria-label','Capitoli');
  secs.forEach((s,i)=>{const a=document.createElement('a');a.href='#'+s.id;
    a.innerHTML=`<span class="tick"></span><span class="rn">${R[i]||''} · <span data-it="${s.dataset.chap}" data-en="${s.dataset.chapEn||s.dataset.chap}">${s.dataset.chap}</span></span>`;
    rail.appendChild(a);});
  document.body.appendChild(rail);
  if(document.documentElement.lang==='en')rail.querySelectorAll('[data-en]').forEach(el=>{el.innerHTML=el.getAttribute('data-en');});
  const links=[...rail.querySelectorAll('a')];let tk=false;
  const upd=()=>{const y=scrollY+innerHeight*0.35;let idx=-1;
    secs.forEach((s,i)=>{if(s.offsetTop<=y)idx=i;});
    links.forEach((a,i)=>a.classList.toggle('on',i===idx));
    const cur=idx>=0?secs[idx]:null;rail.classList.toggle('dark',!!(cur&&cur.hasAttribute('data-dark')));
    tk=false;};
  addEventListener('scroll',()=>{if(!tk){requestAnimationFrame(upd);tk=true;}},{passive:true});upd();
}

/* ── boot all ──────────────────────────────────────────────── */
function init(){
  initLang();initBoot();initTransitions();initCursor();initTiltMag();
  initReveals();initScroll();initClock();initFab();initForm();initEstimator();initShader();
  initSignature();initDashboard();initDecode();initConstellation();
  initWordCycle();initMarquee();initSpotlight();initFaq();initChapters();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
