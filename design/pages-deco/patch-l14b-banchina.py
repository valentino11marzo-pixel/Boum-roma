#!/usr/bin/env python3
# L14·B — LA BANCHINA CHE VENDE. Il brief dell'operatore: «troppo spenta e
# non ben differenziata: colori, grandezze, design… ultra premium, percezione
# ultra tech additiva, colpire diretto il cliente». Oggi le quattro porte
# sono gemelle in grigio. La cura NON e' un arcobaleno (fuori brand): e' la
# GERARCHIA e la LINGUA DEL TABELLONE che il sito gia' parla —
#   1. l'ammiraglia (Gate 02, Property Finding — rimborso pieno) comanda la
#      fila: colonna piu' larga, filo d'oro sempre acceso, caso piu' grande;
#   2. numeri di gate e PREZZI su tessere Solari (stesse tessere del
#      tabellone in hero e della og-card): i numeri diventano protagonisti;
#   3. un chip segnale VERO per porta (Live video / Full refund / Fixed fee
#      / In 24h) — differenziazione onesta, mai una promessa nuova;
#   4. il numero fantasma dietro il vetro + il lampo di cortesia al hover:
#      additivo, tech, e il movimento resta informazione (feedback).
import shutil

SP = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/'

def leggi(n): return open(SP + n, encoding='utf-8').read()
def scrivi(n, s): open(SP + n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: {s.count(ago)}'

p = leggi('pt.html'); shutil.copy(SP + 'pt.html', SP + 'pt.html.bakL14B')

# ── 1 · CSS: dal commento delle porte a quello delle garanzie ────────────
A = '/* le porte: una situazione per cella, il prezzo come risposta */'
B = '/* le garanzie: badge piccoli, tutti veri'
uno(p, A, 'css inizio'); uno(p, B, 'css fine')
ia, ib = p.index(A), p.index(B)

CSS = '''/* le porte: gerarchia vera — l'ammiraglia (Gate 02) comanda la fila,
   le altre rispondono. Numeri di gate e prezzi su tessere Solari: la
   stessa lingua del tabellone in alto, mai un colore fuori brand. */
.ba-porte { display:grid; grid-template-columns:1fr 1.55fr 1fr 1fr;
  gap:1px; background:var(--line-0); }
.ba-p { position:relative; display:flex; flex-direction:column;
  background:var(--surface); padding:17px 18px;
  transition:background .3s var(--ease); overflow:hidden; }
/* il numero fantasma: segnaletica di scalo dietro il vetro */
.ba-p .fantasma { position:absolute; right:2px; bottom:-16px;
  font-family:var(--display); font-size:88px; font-weight:200;
  line-height:1; letter-spacing:-.05em; color:transparent;
  -webkit-text-stroke:1px rgba(255,215,0,.09); pointer-events:none;
  user-select:none; transition:-webkit-text-stroke-color .4s var(--ease); }
.ba-p:hover .fantasma { -webkit-text-stroke-color:rgba(255,215,0,.2); }
.ba-gate { display:flex; align-items:center; justify-content:space-between;
  gap:8px; position:relative; }
.ba-gate b { display:inline-flex; align-items:center; gap:7px;
  font-size:9px; font-weight:600; letter-spacing:.24em;
  text-transform:uppercase; color:var(--text-4);
  transition:color .3s var(--ease); }
.ba-p:hover .ba-gate b { color:var(--gold); }
/* la tessera: la cella del tabellone Solari, in piccolo */
.tess { display:inline-flex; gap:3px; }
.tess i { font-style:normal; width:16px; height:20px; display:grid;
  place-items:center; border-radius:4px; background:#040404;
  color:var(--gold); font-size:11px; font-weight:500; letter-spacing:0;
  font-variant-numeric:tabular-nums; position:relative;
  box-shadow:inset 0 0 0 1px rgba(239,235,223,.07),
    0 1px 3px rgba(0,0,0,.5); }
.tess i::after { content:''; position:absolute; left:1px; right:1px;
  top:50%; height:1px; background:rgba(3,3,3,.85); }
/* il chip segnale: un fatto per porta, mai una promessa nuova */
.ba-chip { display:inline-flex; align-items:center; gap:5px;
  padding:4px 9px; border-radius:100px; font-size:8.5px; font-weight:700;
  letter-spacing:.15em; text-transform:uppercase; color:var(--text-3);
  box-shadow:inset 0 0 0 1px var(--line); white-space:nowrap; flex:none; }
.ba-chip.viva { color:var(--green);
  box-shadow:inset 0 0 0 1px rgba(0,255,136,.28); }
.ba-chip.viva b { width:5px; height:5px; border-radius:50%;
  background:var(--green); animation:pulse 2.2s ease infinite; }
.ba-chip.oro { color:#141005; background:var(--gold); box-shadow:none; }
.ba-p::before { content:''; position:absolute; top:0; left:0; right:0;
  height:1px; background:var(--gold); transform:scaleX(0); z-index:1;
  transform-origin:left; transition:transform .42s var(--ease),
    opacity .3s var(--ease); }
.ba-p:hover { background:var(--elevated); }
.ba-p:hover::before { transform:scaleX(1); }
/* il lampo di cortesia: passa una volta, al passaggio del mouse */
.ba-p::after { content:''; position:absolute; top:0; bottom:0; left:-70%;
  width:44%; transform:skewX(-16deg); pointer-events:none;
  background:linear-gradient(100deg, transparent,
    rgba(255,215,0,.055), transparent); transition:left .7s var(--ease); }
.ba-p:hover::after { left:125%; }
.ba-p svg.sg { width:19px; height:19px; margin-top:13px; color:var(--gold);
  fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round;
  stroke-linejoin:round; transition:transform .4s var(--ease); }
.ba-p svg.sg .acc { opacity:.55; }
.ba-p svg.sg .pieno { fill:var(--gold); stroke:none; }
.ba-p:hover svg.sg { transform:translateY(-2px); }
.ba-p .caso { display:block; margin-top:11px;
  font-family:var(--display); font-size:17px; font-weight:300;
  letter-spacing:-.005em; color:var(--text); line-height:1.28; }
.ba-p .fa { display:block; margin-top:6px; font-size:11.5px; line-height:1.45;
  color:var(--text-4); }
.ba-serv { display:block; margin-top:11px;
  font-size:10.5px; font-weight:600; letter-spacing:.16em;
  text-transform:uppercase; color:var(--gold); line-height:1.5; }
.ba-serv i { display:inline-block; margin-left:6px; font-style:normal;
  transition:transform .35s var(--ease); }
.ba-p:hover .ba-serv i { transform:translateX(4px); }
/* il prezzo su tessere: numeri da tabellone, non note a margine */
.ba-p .costo { display:flex; align-items:center; gap:9px;
  margin-top:auto; padding-top:12px; flex-wrap:wrap; }
.pflap { display:inline-flex; align-items:center; gap:2.5px; }
.pflap em { font-style:normal; font-family:var(--display); font-size:12px;
  font-weight:400; color:var(--gold); opacity:.9; margin-right:2px; }
.pflap i { font-style:normal; font-family:var(--display); width:20px;
  height:27px; display:grid; place-items:center; border-radius:4.5px;
  background:#040404; color:var(--oro-flap); font-size:16px;
  font-weight:400; font-variant-numeric:tabular-nums; position:relative;
  box-shadow:inset 0 0 0 1px rgba(239,235,223,.07),
    0 2px 5px rgba(0,0,0,.55); }
.pflap i::after { content:''; position:absolute; left:1px; right:1px;
  top:50%; height:1px; background:rgba(3,3,3,.85); }
.ba-p .costo .dice { font-style:normal; font-size:10.5px;
  color:var(--text-4); line-height:1.3; flex:1; min-width:0; }
.ba-p .costo .dice .breve { display:none; }
/* l'ammiraglia: colonna piu' larga, filo d'oro sempre acceso, caso e
   tessere piu' grandi — la gerarchia si vede prima di leggerla */
.ba-p.eroe { background:linear-gradient(168deg, rgba(255,215,0,.085),
  rgba(255,215,0,.015) 62%, transparent); padding:19px 20px; }
.ba-p.eroe:hover { background:linear-gradient(168deg, rgba(255,215,0,.13),
  rgba(255,215,0,.03) 62%, transparent); }
.ba-p.eroe::before { transform:scaleX(1); opacity:.55; height:2px; }
.ba-p.eroe:hover::before { opacity:1; }
.ba-p.eroe .caso { font-size:20.5px; }
.ba-p.eroe .fa { color:var(--text-3); }
.ba-p.eroe .pflap i { width:24px; height:32px; font-size:20px; }
.ba-p.eroe .pflap em { font-size:14px; }
.ba-p.eroe .fantasma { -webkit-text-stroke-color:rgba(255,215,0,.13); }

/* su schermo stretto: l'ammiraglia prende la sua riga intera, le altre
   tre si dividono sotto — quattro porte, zero scroll orizzontale */
@media (max-width:860px){
  .ba-porte { grid-template-columns:1fr 1fr; }
  .ba-p { padding:14px 15px; }
  .ba-p.eroe { grid-column:1/-1; padding:16px; }
  .ba-p .fa { display:none; }
  .ba-p.eroe .fa { display:block; font-size:11px; }
  .ba-p .caso { margin-top:9px; font-size:14.5px; }
  .ba-p.eroe .caso { font-size:17px; }
  .ba-serv { margin-top:8px; font-size:9.5px; }
  .ba-p .costo { padding-top:9px; }
  .pflap i { width:17px; height:23px; font-size:13.5px; }
  .ba-p.eroe .pflap i { width:20px; height:27px; font-size:16px; }
  .ba-p .fantasma { font-size:62px; }
  .ba-p .costo .dice .lungo { display:none; }
  .ba-p .costo .dice .breve { display:inline; } }

'''
p = p[:ia] + CSS + p[ib:]

# ── 2 · HTML: le quattro porte, riscritte ────────────────────────────────
HA = '<div class="ba-porte">'
HB = '<div class="ba-garanzie"'
uno(p, HA, 'html inizio'); uno(p, HB, 'html fine')
ja = p.index(HA)
jb = p.index(HB)

PORTE = '''<div class="ba-porte">
        <a class="ba-p" href="/virtual-viewing.html">
          <span class="fantasma" aria-hidden="true">01</span>
          <span class="ba-gate"><b><span class="tess"><i>0</i><i>1</i></span>Gate</b>
            <span class="ba-chip viva"><b></b>Live video</span></span>
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5"
            y="6.5" width="12" height="11" rx="2"/>
            <path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>
            <circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg>
          <span class="caso">Can't fly over to see it?</span>
          <span class="fa">A live video tour with you asking the questions —
            the red flags said out loud. <b style="color:var(--text-2);
            font-weight:500">Our homes: free, always.</b></span>
          <span class="ba-serv">Virtual Viewing<i>→</i></span>
          <span class="costo"><span class="pflap"><em>€</em><i>8</i><i>9</i></span><i
            class="dice"><span class="lungo">for homes on other portals ·
            credited if you rent with us</span><span class="breve">for other
            portals' homes</span></i></span>
        </a>

        <a class="ba-p eroe" href="/property-finding.html">
          <span class="fantasma" aria-hidden="true">02</span>
          <span class="ba-gate"><b><span class="tess"><i>0</i><i>2</i></span>Gate</b>
            <span class="ba-chip oro">Full refund</span></span>
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6L20.5 20.5"/>
            <path d="M8 10.8h5.6M10.8 8v5.6" class="acc"/></svg>
          <span class="caso">Nothing in the catalogue fits?</span>
          <span class="fa">Our flagship: we hunt the whole market for you —
            off-market included — and walk every shortlist in person.
            <b style="color:var(--text-2);font-weight:500">Refunded in full
            if we don't deliver.</b></span>
          <span class="ba-serv">Property Finding<i>→</i></span>
          <span class="costo"><span class="pflap"><em>€</em><i>3</i><i>5</i><i>0</i></span><i
            class="dice"><span class="lungo">deducted on success · refunded
            if we don't deliver</span><span class="breve">deducted on
            success</span></i></span>
        </a>

        <a class="ba-p" href="/deal-assistance.html">
          <span class="fantasma" aria-hidden="true">03</span>
          <span class="ba-gate"><b><span class="tess"><i>0</i><i>3</i></span>Gate</b>
            <span class="ba-chip">Fixed fee</span></span>
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.4l7.2 2.9v5.1c0 4.2-3 7.2-7.2 8.4-4.2-1.2-7.2-4.2-7.2-8.4V6.3z"/>
            <path d="M9.1 11.6l2.2 2.2 4.1-4.7" class="acc"/></svg>
          <span class="caso">Found one yourself?</span>
          <span class="fa">We verify the landlord, the papers and the price
            — then negotiate.</span>
          <span class="ba-serv">Deal Assistance<i>→</i></span>
          <span class="costo"><span class="pflap"><em>€</em><i>2</i><i>4</i><i>9</i></span><i
            class="dice"><span class="lungo">fixed · deposit and clauses
            negotiated</span><span class="breve">fixed · we negotiate for
            you</span></i></span>
        </a>

        <a class="ba-p" href="/contract-check-express.html">
          <span class="fantasma" aria-hidden="true">04</span>
          <span class="ba-gate"><b><span class="tess"><i>0</i><i>4</i></span>Gate</b>
            <span class="ba-chip">In 24h</span></span>
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3.2h7.4L18.6 8v12.8H6z"/>
            <path d="M13.2 3.2V8h5.2" class="acc"/>
            <path d="M9 12.6h6.4M9 15.8h4.4" class="acc"/></svg>
          <span class="caso">About to sign something?</span>
          <span class="fa">A written traffic-light verdict in 24h: what's
            fine, what's unfair, what's missing.</span>
          <span class="ba-serv">Contract Check Express<i>→</i></span>
          <span class="costo"><span class="pflap"><em>€</em><i>4</i><i>9</i></span><i
            class="dice"><span class="lungo">credited on Deal
            Assistance</span><span class="breve">credited on Deal
            Assistance</span></i></span>
        </a>
      </div>

      '''
p = p[:ja] + PORTE + p[jb:]

# le vecchie classi non devono sopravvivere da nessuna parte
assert 'ba-p prima' not in p, 'classe prima ancora viva'
assert p.count('class="ba-p eroe"') == 1
assert p.count('class="fantasma"') == 4
assert p.count('class="pflap"') == 4
assert p.count('ba-chip') >= 4  # css + 4 usi

scrivi('pt.html', p)
print('L14B banchina: gerarchia + tessere Solari + chip segnale + fantasma')
