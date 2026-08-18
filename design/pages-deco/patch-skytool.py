#!/usr/bin/env python3
# LO SKYLINE DIVENTA LO STRUMENTO.
#   1. Ponte embed: la discovery (e chiunque lo incornici) filtra i pin
#      via postMessage — un solo Skyline, mai piu' una copia che diverge.
#   2. I TUOI POSTI: la stessa memoria del detail (boom:pois, Photon)
#      sale sulla mappa — i posti salvati sono ancore VIVE, ogni casa
#      mostra i minuti verso di loro, e un filtro tiene solo le case a
#      ≤25' dal tuo posto. Scritti una volta, ogni superficie risponde.
import shutil

FN = '/home/user/Boum-roma/skyline.html'
shutil.copy(FN, FN + '.bak-tool')
s = open(FN, encoding='utf-8').read()

def sost(old, new, dove):
    global s
    assert s.count(old) == 1, f'{dove}: {s.count(old)} occorrenze'
    s = s.replace(old, new)

# ── CSS: il posto mio + il pannello ──────────────────────────────────────
sost(".emb .bar{display:none}",
"""'.emb .bar{display:none}' non usato""", 'placeholder-mai') if False else None
sost(""".emb .bar{display:none}""",
""".emb .bar{display:none}
/* i tuoi posti: ancore d'oro, sempre accese — sono il TUO motivo */
.sky-mine{display:flex;align-items:center;gap:6px;font-size:11px;color:#111;background:linear-gradient(135deg,var(--gold),var(--gold2));border-radius:100px;padding:5px 11px;white-space:nowrap;font-weight:600;box-shadow:0 6px 18px rgba(0,0,0,.45)}
.sky-mine .d{font-weight:700;display:none}
.sky-mine.lit .d{display:inline}
.sky-mine.lit .d::before{content:'· '}
.miei-velo{position:absolute;inset:0;z-index:30;display:flex;align-items:flex-start;justify-content:center;padding-top:min(16vh,120px);background:rgba(5,5,7,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.miei-velo[hidden]{display:none}
.miei{width:min(420px,92vw);background:var(--card);border:1px solid rgba(255,215,0,.25);border-radius:18px;padding:18px 18px 16px;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.miei b.t{font-family:var(--disp);font-weight:300;font-size:19px;letter-spacing:.02em}
.miei p.s{font-size:11.5px;color:var(--t3);margin:4px 0 12px;line-height:1.5}
.miei input{width:100%;padding:12px 13px;background:#141419;border:1px solid var(--line);border-radius:10px;color:#fff;font-size:14px}
.miei input:focus{outline:none;border-color:rgba(255,215,0,.45)}
.miei-sug{margin-top:6px}
.miei-sug button{display:block;width:100%;text-align:left;padding:10px 12px;background:none;border:0;border-bottom:1px solid var(--line);color:var(--t2);font-size:12.5px;cursor:pointer}
.miei-sug button:hover{color:var(--gold)}
.miei-sug button b{display:block;color:#fff;font-weight:500}
.miei-righe{margin-top:10px}
.miei-righe .r{display:flex;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid var(--line);font-size:13px}
.miei-righe .r b{font-weight:500;flex:1}
.miei-righe .r button{background:none;border:0;color:var(--t3);cursor:pointer;font-size:14px;padding:4px 8px}
.miei-righe .r button:hover{color:#FF6B57}
.miei-vuota{font-size:12px;color:var(--t3);padding:10px 2px}
.miei-chiudi{margin-top:12px;width:100%;padding:11px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#000;font-weight:600;font-size:13px;border:0;border-radius:10px;cursor:pointer}""",
'css tool')

# ── markup: chip nel filtro + pannello ───────────────────────────────────
sost("""  <button class="chip" data-max="2500">≤ €2,500</button>
</div>""",
"""  <button class="chip" data-max="2500">≤ €2,500</button>
  <button class="chip" id="mieiChip" type="button">◆ My places</button>
  <button class="chip" id="vicinoChip" type="button" hidden>≤ 25′ walk</button>
</div>

<div class="miei-velo" id="mieiVelo" hidden>
  <div class="miei" role="dialog" aria-modal="true" aria-label="My places">
    <b class="t">Your places, on the sky</b>
    <p class="s">Type your office, campus or gym once — every home shows the
      distance, here and on each home's page. Saved on this device only.</p>
    <input id="mieiQ" type="text" autocomplete="off"
      placeholder="Your office, university, a metro stop…">
    <div class="miei-sug" id="mieiSug"></div>
    <div class="miei-righe" id="mieiRighe"></div>
    <button class="miei-chiudi" id="mieiChiudi" type="button">Done</button>
  </div>
</div>""", 'markup tool')

# ── il pin porta l'id (per il ponte embed) ───────────────────────────────
sost("var el=document.createElement('div'); el.className='sky-pin'; el.__price=price||0; el.__rented=rented;",
     "var el=document.createElement('div'); el.className='sky-pin'; el.__price=price||0; el.__rented=rented; el.__id=String(l.id||''); el.__co=co;",
     'pin id')

# ── applyFilter: prezzo + ponte embed + vicino-al-mio-posto ─────────────
sost("""function applyFilter(){
  var shown=0;
  MARKERS.forEach(function(mk){
    var el=mk.getElement();
    var ok=(MAXFILTER===0)?!el.__rented:(el.__price>0&&el.__price<=MAXFILTER&&!el.__rented);
    el.classList.toggle('dim',!ok); if(ok)shown++;
  });""",
"""function applyFilter(){
  var shown=0;
  MARKERS.forEach(function(mk){
    var el=mk.getElement();
    var ok=(MAXFILTER===0)?!el.__rented:(el.__price>0&&el.__price<=MAXFILTER&&!el.__rented);
    /* il ponte embed: la discovery dice quali case restano dopo i SUOI
       filtri — un solo Skyline, la selezione arriva da fuori */
    if(ok&&TIENI&&!TIENI.has(el.__id))ok=false;
    /* vicino al mio posto: ~2km in linea d'aria ≈ 25' a piedi (stessa
       stima onesta delle altre superfici, mai spacciata per percorso) */
    if(ok&&VICINO&&MYP.length){
      var dmin=1e9;MYP.forEach(function(p){var d=haversine([el.__co[0],el.__co[1]],[p.lng,p.lat]);if(d<dmin)dmin=d;});
      if(dmin>2.0)ok=false;
    }
    el.classList.toggle('dim',!ok); if(ok)shown++;
  });""", 'applyFilter')

# ── il motore dei posti + ponte messaggi (prima di makePin) ──────────────
sost("""/* I tasti diretti nel popup""",
"""/* ── I TUOI POSTI — la stessa memoria del detail (boom:pois): scritti
   una volta, ogni superficie risponde. Qui diventano ancore VIVE. ── */
var TIENI=null, VICINO=false;
var MYP=[];
function mieiLetti(){try{return JSON.parse(localStorage.getItem('boom:pois')||'[]')}catch(e){return[]}}
function mieiSerba(a){try{localStorage.setItem('boom:pois',JSON.stringify(a.slice(0,4)))}catch(e){}}
var MYP_MK=[];
function buildMyPlaces(){
  MYP=mieiLetti();
  MYP_MK.forEach(function(m){try{m.mk.remove()}catch(e){}});
  MYP_MK=[];
  if(!map)return;
  MYP.forEach(function(p){
    var el=document.createElement('div');el.className='sky-mine';
    var nm=document.createElement('span');nm.textContent='◆ '+p.name;
    var d=document.createElement('span');d.className='d';
    el.appendChild(nm);el.appendChild(d);
    MYP_MK.push({el:el,dEl:d,p:p,mk:new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([p.lng,p.lat]).addTo(map)});
  });
  var vc=document.getElementById('vicinoChip');
  if(vc){vc.hidden=!MYP.length;if(!MYP.length){VICINO=false;vc.classList.remove('on');}}
  if(map&&map.getSource&&map.getSource('links'))clearLinks();
  applyFilter();
}
window.addEventListener('message',function(e){
  if(e.origin!==location.origin)return;
  var d=e.data||{};
  if(d.t==='boomTieni'&&Array.isArray(d.ids)){TIENI=new Set(d.ids.map(String));if(map)applyFilter();}
});

/* I tasti diretti nel popup""", 'motore posti')

# ── showLinks: i tuoi posti si collegano SEMPRE, le ancore riempiono ─────
sost("""  var near=ANCHORS.map(function(A,i){return {A:A,i:i,d:haversine(co,[A[0],A[1]])}})
    .sort(function(a,b){return a.d-b.d}).slice(0,6);""",
"""  /* i TUOI posti si collegano sempre (sono il motivo per cui li hai
     salvati); le ancore di Roma riempiono fino a sei linee */
  var mie=MYP_MK.map(function(m){return {m:m,d:haversine(co,[m.p.lng,m.p.lat])}});
  var near=ANCHORS.map(function(A,i){return {A:A,i:i,d:haversine(co,[A[0],A[1]])}})
    .sort(function(a,b){return a.d-b.d}).slice(0,Math.max(2,6-mie.length));""",
'showLinks near')
sost("""  var feats=near.map(function(n){return {type:'Feature',geometry:{type:'LineString',coordinates:arc(co,[n.A[0],n.A[1]],0.12,44)}}});""",
"""  var feats=near.map(function(n){return {type:'Feature',geometry:{type:'LineString',coordinates:arc(co,[n.A[0],n.A[1]],0.12,44)}}});
  mie.forEach(function(x){
    feats.push({type:'Feature',geometry:{type:'LineString',coordinates:arc(co,[x.m.p.lng,x.m.p.lat],-0.12,44)}});
    x.m.el.classList.add('lit');x.m.dEl.textContent=distLabel(x.d);
  });""", 'showLinks feats')
sost("""function clearLinks(){
  if(map.getSource('links'))map.getSource('links').setData({type:'FeatureCollection',features:[]});
  ANCHOR_MK.forEach(function(m){m.el.classList.remove('lit');m.el.style.opacity='';});""",
"""function clearLinks(){
  if(map.getSource('links'))map.getSource('links').setData({type:'FeatureCollection',features:[]});
  ANCHOR_MK.forEach(function(m){m.el.classList.remove('lit');m.el.style.opacity='';});
  MYP_MK.forEach(function(m){m.el.classList.remove('lit');m.dEl.textContent='';});""",
'clearLinks')

# ── il pannello: ricerca Photon (stessa chiamata del detail) ─────────────
sost("""[].forEach.call(document.querySelectorAll('#filters .chip'),function(c){
  c.addEventListener('click',function(){
    [].forEach.call(document.querySelectorAll('#filters .chip'),function(x){x.classList.toggle('on',x===c);});
    MAXFILTER=Number(c.getAttribute('data-max'))||0; applyFilter();
  });
});""",
"""[].forEach.call(document.querySelectorAll('#filters .chip[data-max]'),function(c){
  c.addEventListener('click',function(){
    [].forEach.call(document.querySelectorAll('#filters .chip[data-max]'),function(x){x.classList.toggle('on',x===c);});
    MAXFILTER=Number(c.getAttribute('data-max'))||0; applyFilter();
  });
});

/* ── il pannello dei posti ── */
(function(){
  var velo=document.getElementById('mieiVelo'),chip=document.getElementById('mieiChip'),
      q=document.getElementById('mieiQ'),sug=document.getElementById('mieiSug'),
      righe=document.getElementById('mieiRighe'),chiudi=document.getElementById('mieiChiudi'),
      vicino=document.getElementById('vicinoChip');
  if(!velo||!chip)return;
  function lista(){
    var a=mieiLetti();
    righe.innerHTML=a.length?a.map(function(p,i){
      return '<div class="r"><b>◆ '+String(p.name).replace(/[<>&]/g,'')+'</b>'
        +'<button type="button" data-i="'+i+'" aria-label="Remove">✕</button></div>';
    }).join(''):'<p class="miei-vuota">Nothing saved yet — type a place above, once.</p>';
  }
  righe.addEventListener('click',function(e){
    var b=e.target.closest('button[data-i]');if(!b)return;
    var a=mieiLetti();a.splice(+b.dataset.i,1);mieiSerba(a);lista();buildMyPlaces();
  });
  var attesa=null;
  q.addEventListener('input',function(){
    clearTimeout(attesa);
    var t=q.value.trim();
    if(t.length<3){sug.innerHTML='';return;}
    attesa=setTimeout(function(){
      fetch('https://photon.komoot.io/api/?q='+encodeURIComponent(t)
        +'&lat=41.893&lon=12.483&limit=4&lang=en&zoom=12')
        .then(function(r){return r.json()})
        .then(function(j){
          sug.innerHTML=(j.features||[]).slice(0,4).map(function(ft){
            var p=ft.properties||{};
            var nome=(p.name||p.street||'Place').replace(/"/g,'');
            var dove=[p.suburb||p.district,p.city].filter(Boolean).join(', ');
            return '<button type="button" data-lat="'+ft.geometry.coordinates[1]
              +'" data-lng="'+ft.geometry.coordinates[0]+'" data-n="'+nome
              +'"><b>'+nome+'</b><span>'+dove+'</span></button>';
          }).join('')||'<p class="miei-vuota">Nothing found — try the street or campus name.</p>';
        })
        .catch(function(){sug.innerHTML='<p class="miei-vuota">Place search unreachable right now.</p>';});
    },320);
  });
  sug.addEventListener('click',function(e){
    var b=e.target.closest('button[data-n]');if(!b)return;
    var a=mieiLetti();
    if(!a.some(function(p){return p.name===b.dataset.n}))
      a.unshift({name:b.dataset.n,lat:+b.dataset.lat,lng:+b.dataset.lng});
    mieiSerba(a);sug.innerHTML='';q.value='';lista();buildMyPlaces();
  });
  chip.addEventListener('click',function(){velo.hidden=false;lista();q.focus();});
  chiudi.addEventListener('click',function(){velo.hidden=true;});
  velo.addEventListener('click',function(e){if(e.target===velo)velo.hidden=true;});
  if(vicino)vicino.addEventListener('click',function(){
    VICINO=!VICINO;vicino.classList.toggle('on',VICINO);applyFilter();
  });
})();""", 'pannello')

# ── boot: i posti salgono con la mappa ───────────────────────────────────
sost("""  gradeColor();
  buildAnchors();""",
"""  gradeColor();
  buildAnchors();
  buildMyPlaces();""", 'boot places')

open(FN, 'w', encoding='utf-8').write(s)
print('skyline: ponte embed + I TUOI POSTI (boom:pois condivisa, Photon, linee, ≤25′)')
