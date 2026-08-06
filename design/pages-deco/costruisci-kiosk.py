#!/usr/bin/env python3
# BOOM · KIOSK — il tabellone da vetrina: tutto il catalogo, a rotazione.
import json, re, sys
from datetime import datetime, timezone, timedelta
MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}
def letti(r):
    for c in (r.get('beds'), r.get('bedrooms')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None
def euro(n): return '€' + f'{int(n):,}'
def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00').replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)
def libera(g, oggi):
    s = re.sub(r'(?i)available\s+from','',str(g or '')).strip()
    if not s: return ''
    d=None; m=re.match(r'^(\d{4})-(\d{2})-(\d{2})',s)
    if m: d=datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)),tzinfo=timezone.utc)
    else:
        gg=re.search(r'\b(\d{1,2})\b(?!\d)',s); me=re.search(r'(?i)\b([a-z]{3})[a-z]*\b',s)
        an=re.search(r'\b(20\d{2})\b',s)
        if me and me.group(1).lower() in MESI:
            try: d=datetime(int(an.group(1)) if an else oggi.year, MESI[me.group(1).lower()],
                            int(gg.group(1)) if gg and int(gg.group(1))<=31 else 1,tzinfo=timezone.utc)
            except ValueError: d=None
    if d is None: return ''
    return 'NOW' if d <= oggi else d.strftime('%-d%b').upper()

rows = json.load(open('live-rows.json'))
oggi = datetime.now(timezone.utc)
vivi = [r for r in rows if r.get('status') in ('available','waitlist')
        and r.get('nome') and r.get('price')]
vivi.sort(key=quando, reverse=True)
CASE = []
for r in vivi:
    p = int(re.sub(r'[^\d]','',str(r['price'])) or 0)
    if not p: continue
    n = letti(r)
    nuova = (oggi - quando(r)).days < 21
    CASE.append({
        'ora': (libera(r.get('avail'), oggi) or '—')[:5],
        'zona': re.sub(r'\s+',' ',(r.get('zona') or 'Roma')).split('/')[0].strip().upper()[:13],
        'tipo': ('STU' if n == 0 else f'{n}BR' if n else 'FLT'),
        'prezzo': euro(p)[:6],
        'stato': 'LIST' if r['status'] == 'waitlist' else ('NEW' if nuova else 'FREE'),
    })

def leggi(n): return open(n, encoding='utf-8').read()
h = '''<title>BOOM · Rome — Live Board</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
/* ══ IL KIOSK — il tabellone da vetrina. Nessuna nav: solo il teatro. ══ */
:root { --gold:#FFD700; --gold-light:#FFE55C; --green:#00FF88; --black:#030303;
  --oro-flap:#FFE55C; --line:rgba(255,255,255,.08); --line-0:rgba(255,255,255,.04);
  --line-gold:rgba(255,215,0,.14);
  --display:'Helvetica Neue',Helvetica,Arial,sans-serif;
  --sans:'Inter',-apple-system,sans-serif; color-scheme:dark; }
*,*::before,*::after { margin:0; padding:0; box-sizing:border-box; }
html,a { color:inherit; }
body { height:100%; }
body { background:var(--black); color:#FAFAFA; font-family:var(--sans);
  font-weight:300; overflow:hidden; display:flex; flex-direction:column;
  cursor:none; }
.cima { display:flex; align-items:center; justify-content:space-between;
  padding:clamp(18px,3vh,34px) clamp(22px,3.5vw,60px);
  border-bottom:1px solid var(--line-0); }
.marchio { display:flex; align-items:center; gap:16px; }
.marchio svg { width:clamp(34px,4.5vh,52px); height:clamp(34px,4.5vh,52px); }
.marchio span { font-family:var(--display); font-size:clamp(17px,2.4vh,26px);
  font-weight:500; letter-spacing:.32em; text-indent:.32em; text-transform:uppercase; }
.cima-eti { display:flex; align-items:center; gap:12px; font-size:clamp(11px,1.5vh,14px);
  font-weight:600; letter-spacing:.22em; text-transform:uppercase; color:var(--gold); }
.cima-eti i { font-style:normal; width:9px; height:9px; border-radius:50%;
  background:var(--green); animation:pulse 2.2s ease infinite; }
@keyframes pulse { 50% { opacity:.3; } }
#ora { font-family:var(--display); font-size:clamp(16px,2.6vh,26px); }
.sala { flex:1; display:grid; align-content:center;
  padding:0 clamp(22px,3.5vw,60px); }
.colonne, .riga { display:grid; align-items:center;
  grid-template-columns:clamp(80px,9vw,150px) minmax(0,1fr) clamp(64px,6vw,110px)
    clamp(120px,12vw,200px) clamp(90px,9vw,150px);
  gap:clamp(10px,2vw,34px); padding:0 clamp(8px,1vw,20px); }
.colonne { padding-bottom:1.4vh; font-size:clamp(10px,1.4vh,13px); font-weight:600;
  letter-spacing:.2em; text-transform:uppercase; color:rgba(250,250,250,.3); }
.riga { font-size:clamp(17px,3.4vh,34px);
  padding-top:clamp(10px,1.9vh,20px); padding-bottom:clamp(10px,1.9vh,20px);
  border-top:1px solid var(--line-0); }
.cella { overflow:hidden; }
.c-stato { color:var(--green); }
.riga.nuovo .c-stato { color:var(--gold-light); }
.fondo { display:flex; align-items:center; justify-content:space-between;
  gap:16px; padding:clamp(16px,2.6vh,30px) clamp(22px,3.5vw,60px);
  border-top:1px solid var(--line-0); font-size:clamp(12px,1.7vh,16px);
  letter-spacing:.14em; text-transform:uppercase; color:rgba(250,250,250,.5); }
.fondo b { color:var(--gold); font-weight:600; }
.pagine { display:flex; gap:8px; }
.pagine i { width:26px; height:3px; background:var(--line); font-style:normal;
  transition:background .4s ease; }
.pagine i.qui { background:var(--gold); }
.flap-scale { letter-spacing:0; white-space:nowrap; }
</style>
<div class="cima">
  <div class="marchio">LOGO_SVG<span>Boom</span></div>
  <div class="cima-eti"><i></i>Homes in Rome · Live</div>
  <div id="ora" class="flap-scale"></div>
</div>
<div class="sala">
  <div class="colonne">
    <span>Free</span><span>District</span><span>Beds</span><span>Rent /mo</span><span>State</span>
  </div>
  <div id="righe"></div>
</div>
<div class="fondo">
  <a href="https://claude.ai/code/artifact/3c0dae67-a0e6-47d4-964f-832b824ffe0f" style="color:inherit;text-decoration:none;cursor:pointer"><b>boomrome.com</b> · WhatsApp +39 331 325 1961</a>
  <span class="pagine" id="pagine"></span>
  <span>Video-verified · Keys in 48h</span>
</div>
''' + leggi('solari-engine.html') + '''
<script>
(function () {
  'use strict';
  var BS = window.BoomSolari;
  var DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789€.,:·+/';
  var CASE = 'CASE_JSON';
  var PER = 6, GIRO = 14000;
  var pagine = Math.max(1, Math.ceil(CASE.length / PER));
  var box = document.getElementById('righe');
  var nav = document.getElementById('pagine');
  var righe = [];
  for (var i = 0; i < Math.min(PER, CASE.length); i++) {
    var d = document.createElement('div');
    d.className = 'riga';
    d.innerHTML = '<span class="cella c-ora flap-scale"></span>' +
      '<span class="cella c-zona flap-scale"></span>' +
      '<span class="cella c-tipo flap-scale"></span>' +
      '<span class="cella c-prezzo flap-scale"></span>' +
      '<span class="cella c-stato flap-scale"></span>';
    box.appendChild(d);
    righe.push({ el:d, celle:{
      ora:   new BS.Board(d.querySelector('.c-ora'),    5,  DRUM),
      zona:  new BS.Board(d.querySelector('.c-zona'),   13, DRUM),
      tipo:  new BS.Board(d.querySelector('.c-tipo'),   3,  DRUM),
      prezzo:new BS.Board(d.querySelector('.c-prezzo'), 6,  DRUM),
      stato: new BS.Board(d.querySelector('.c-stato'),  5,  DRUM)
    }});
  }
  for (var k = 0; k < pagine; k++) {
    var t = document.createElement('i');
    if (k === 0) t.className = 'qui';
    nav.appendChild(t);
  }
  var pagina = 0;
  function mostra(p, sbatti) {
    pagina = p;
    [].forEach.call(nav.children, function (x, k) {
      x.classList.toggle('qui', k === p);
    });
    righe.forEach(function (r, i) {
      var h = CASE[p * PER + i];
      r.el.classList.toggle('nuovo', !!h && h.stato === 'NEW');
      var mostraR = function () {
        r.celle.ora.update(h ? h.ora : '');
        r.celle.zona.update(h ? h.zona : '');
        r.celle.tipo.update(h ? h.tipo : '');
        r.celle.prezzo.update(h ? h.prezzo : '');
        r.celle.stato.update(h ? h.stato : '');
      };
      if (sbatti) setTimeout(mostraR, i * 140); else mostraR();
    });
  }
  /* prima stampa col giro completo */
  righe.forEach(function (r, i) {
    var h = CASE[i];
    setTimeout(function () {
      if (!h) return;
      r.celle.ora.show(h.ora, 24, true);
      r.celle.zona.show(h.zona, 18, true);
      r.celle.tipo.show(h.tipo, 24, true);
      r.celle.prezzo.show(h.prezzo, 22, true);
      r.celle.stato.show(h.stato, 22, true);
      r.el.classList.toggle('nuovo', h.stato === 'NEW');
    }, 400 + i * 160);
  });
  if (pagine > 1) setInterval(function () {
    if (document.hidden) return;
    mostra((pagina + 1) % pagine, true);
  }, GIRO);
  /* l'orologio */
  function oraRoma() {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Rome',
        hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date());
    } catch (e) { return new Date().toTimeString().slice(0, 5); }
  }
  var oro = new BS.Board(document.getElementById('ora'), 5, ' 0123456789:');
  oro.show(oraRoma());
  setInterval(function () { if (!document.hidden) oro.update(oraRoma()); }, 20000);
  /* ogni tanto un fremito, come i tabelloni veri */
  setInterval(function () {
    if (document.hidden) return;
    var r = righe[Math.floor(Math.random() * righe.length)];
    var quali = ['zona','prezzo','stato'];
    r.celle[quali[Math.floor(Math.random() * 3)]].flutter();
  }, 9000);
})();
</script>
'''
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace("'CASE_JSON'", json.dumps(CASE, ensure_ascii=False))
open('boom-kiosk.html','w',encoding='utf-8').write(h)
print(f'boom-kiosk.html · {len(h)//1024} KB · {len(CASE)} case · {max(1,(len(CASE)+5)//6)} pagine')
