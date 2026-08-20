#!/usr/bin/env python3
# L14·B2 — LA CARTA D'IMBARCO. Il verdetto del laboratorio (esplora-
# banchina.html, opzioni A/B/C): vince A. La regola Apple che la regge:
# IL MATERIALE RACCONTA IL PRODOTTO — BOOM emette carte Wallet vere, e qui
# ogni servizio E' un boarding pass: perforazione coi fori che tagliano
# davvero (overflow:hidden), stub col prezzo su tessere Solari, codice
# volo, e sull'ammiraglia la rotta FROM -> TO ("The whole market -> Your
# front door") + il manifest di bordo. L'emissione al reveal usa la stessa
# molla di Wallet del pass in hero (cubic-bezier(.3,1.45,.5,1)) — il
# movimento e' il gesto del biglietto, mai decorazione.
# Prefisso classi: imb- (pass-lista/pass-carta esistono gia' nel sito).
import shutil

SP = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/'

def leggi(n): return open(SP + n, encoding='utf-8').read()
def scrivi(n, s): open(SP + n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: {s.count(ago)}'

p = leggi('pt.html'); shutil.copy(SP + 'pt.html', SP + 'pt.html.bakL14B2')

# ── 1 · CSS: via le porte-tile, dentro i pass ────────────────────────────
A = "/* le porte: gerarchia vera — l'ammiraglia (Gate 02) comanda la fila,"
B = '/* le garanzie: badge piccoli, tutti veri'
uno(p, A, 'css inizio'); uno(p, B, 'css fine')
ia, ib = p.index(A), p.index(B)

CSS = '''/* LA CARTA D'IMBARCO — il materiale racconta il prodotto: BOOM emette
   carte Wallet vere, e ogni servizio E' un boarding pass. Perforazione
   coi fori che tagliano davvero, stub col prezzo su tessere Solari,
   codice volo; l'ammiraglia porta la rotta FROM -> TO e il manifest.
   Verdetto del laboratorio A/B/C — vedi design/pages-deco/esplora-banchina. */
.imb-griglia { display:grid; grid-template-columns:1.22fr 1fr;
  gap:clamp(16px,2.2vw,26px); align-items:stretch; }
@media (max-width:900px){ .imb-griglia { grid-template-columns:1fr; } }
.imb-pila { display:grid; gap:clamp(12px,1.6vw,16px); }
.imb { position:relative; display:flex; flex-direction:column;
  background:linear-gradient(155deg,#141418,#09090B);
  border-radius:18px; overflow:hidden;
  box-shadow:inset 0 0 0 1px var(--line-gold),
    0 34px 70px -32px rgba(0,0,0,.95);
  transition:transform .5s var(--ease), box-shadow .5s var(--ease); }
.imb:hover { transform:translateY(-5px);
  box-shadow:inset 0 0 0 1px var(--line-gold-2),
    0 44px 80px -30px rgba(0,0,0,.95); }
.imb-testa { display:flex; align-items:center; justify-content:space-between;
  gap:10px; padding:14px 18px 12px; }
.imb-testa .marchio { display:inline-flex; align-items:center; gap:9px;
  font-family:var(--display); font-size:10.5px; font-weight:400;
  letter-spacing:.26em; text-indent:.26em; text-transform:uppercase;
  color:var(--text-3); }
.imb-corpo { padding:6px 18px 16px; display:flex; flex-direction:column;
  flex:1; }
.imb-corpo .caso { font-family:var(--display); font-weight:300;
  font-size:18px; line-height:1.26; letter-spacing:-.005em; }
.imb-corpo .fa { margin-top:6px; font-size:11.5px; line-height:1.5;
  color:var(--text-4); }
.imb-serv { margin-top:10px; font-size:10px; font-weight:600;
  letter-spacing:.16em; text-transform:uppercase; color:var(--gold); }
.imb-serv i { display:inline-block; font-style:normal; margin-left:6px;
  transition:transform .35s var(--ease); }
.imb:hover .imb-serv i { transform:translateX(4px); }
/* la tessera del gate + il chip segnale (fatti veri, mai promesse nuove) */
.tess { display:inline-flex; gap:3px; }
.tess i { font-style:normal; width:16px; height:20px; display:grid;
  place-items:center; border-radius:4px; background:#040404;
  color:var(--gold); font-size:11px; font-weight:500; letter-spacing:0;
  font-variant-numeric:tabular-nums; position:relative;
  box-shadow:inset 0 0 0 1px rgba(239,235,223,.07),
    0 1px 3px rgba(0,0,0,.5); }
.tess i::after { content:''; position:absolute; left:1px; right:1px;
  top:50%; height:1px; background:rgba(3,3,3,.85); }
.ba-chip { display:inline-flex; align-items:center; gap:5px;
  padding:4px 9px; border-radius:100px; font-size:8.5px; font-weight:700;
  letter-spacing:.15em; text-transform:uppercase; color:var(--text-3);
  box-shadow:inset 0 0 0 1px var(--line); white-space:nowrap; flex:none; }
.ba-chip.viva { color:var(--green);
  box-shadow:inset 0 0 0 1px rgba(0,255,136,.28); }
.ba-chip.viva b { width:5px; height:5px; border-radius:50%;
  background:var(--green); animation:pulse 2.2s ease infinite; }
.ba-chip.oro { color:#141005; background:var(--gold); box-shadow:none; }
/* la perforazione: il pass si strappa qui — i fori tagliano davvero
   (overflow:hidden sul pass li rende intagli, non cerchi appoggiati) */
.imb-perfo { position:relative; height:1px; margin-top:2px;
  border-top:1.5px dashed rgba(255,215,0,.22); }
.imb-perfo::before, .imb-perfo::after { content:''; position:absolute;
  top:-10px; width:20px; height:20px; border-radius:50%;
  background:var(--black); box-shadow:inset 0 0 0 1px var(--line-gold); }
.imb-perfo::before { left:-10px; } .imb-perfo::after { right:-10px; }
.imb-stub { display:flex; align-items:center; justify-content:space-between;
  gap:12px; padding:13px 18px 15px; }
.imb-stub .dice { font-size:10.5px; line-height:1.45; color:var(--text-4);
  flex:1; min-width:0; }
.imb-stub .codice { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:9px; letter-spacing:.22em; color:var(--text-4); opacity:.7; }
/* il prezzo su tessere: numeri da tabellone, non note a margine */
.pflap { display:inline-flex; align-items:center; gap:2.5px; }
.pflap em { font-style:normal; font-family:var(--display); font-size:13px;
  font-weight:400; color:var(--gold); opacity:.9; margin-right:2px; }
.pflap i { font-style:normal; font-family:var(--display); width:22px;
  height:30px; display:grid; place-items:center; border-radius:5px;
  background:#040404; color:var(--oro-flap); font-size:18px;
  font-weight:400; font-variant-numeric:tabular-nums; position:relative;
  box-shadow:inset 0 0 0 1px rgba(239,235,223,.07),
    0 2px 5px rgba(0,0,0,.55); }
.pflap i::after { content:''; position:absolute; left:1px; right:1px;
  top:50%; height:1px; background:rgba(3,3,3,.85); }
/* l'ammiraglia: il pass grande, emesso storto come un biglietto vero */
.imb.eroe { transform:rotate(-1.4deg);
  background:linear-gradient(150deg,#17150c 0%,#121214 42%,#09090B 100%);
  box-shadow:inset 0 0 0 1px var(--line-gold-2),
    0 50px 100px -36px rgba(0,0,0,.98),
    0 0 90px -40px rgba(255,215,0,.28); }
.imb.eroe:hover { transform:rotate(0deg) translateY(-5px); }
.imb.eroe .imb-testa { padding:18px 24px 14px; }
.imb.eroe .imb-corpo { padding:8px 24px 22px; }
.imb.eroe .imb-stub { padding:16px 24px 18px; }
.imb.eroe .caso { font-size:clamp(26px,2.9vw,36px); max-width:16ch; }
.imb.eroe .fa { font-size:12.5px; color:var(--text-3); max-width:46ch; }
.imb.eroe .imb-serv { margin-top:18px; }
.imb.eroe .pflap i { width:27px; height:37px; font-size:23px; }
.imb.eroe .pflap em { font-size:16px; }
/* il manifest di bordo: tre fatti, tre spunte */
.imb-lista { margin-top:18px; display:grid; gap:9px; }
.imb-lista span { position:relative; padding-left:22px; font-size:12.5px;
  line-height:1.5; color:var(--text-2); }
.imb-lista span::before { content:'✓'; position:absolute; left:0; top:0;
  color:var(--gold); font-size:12px; }
/* la rotta del biglietto: FROM -> TO, i campi veri */
.imb-rotta { margin-top:auto; padding-top:18px; display:flex;
  align-items:flex-end; gap:16px; }
.imb-rotta .campo { min-width:0; }
.imb-rotta .campo b { display:block; font-size:8.5px; font-weight:600;
  letter-spacing:.2em; text-transform:uppercase; color:var(--text-4);
  margin-bottom:3px; }
.imb-rotta .campo span { font-family:var(--display); font-weight:300;
  font-size:16px; line-height:1.2; white-space:nowrap; }
.imb-rotta .campo:last-child { text-align:right; }
.imb-rotta .campo:last-child span { color:var(--gold); }
.imb-rotta .aereo { flex:1; position:relative; height:1px;
  border-top:1px dashed rgba(255,215,0,.3); margin-bottom:9px; }
.imb-rotta .aereo i { position:absolute; top:-8px; left:50%;
  transform:translateX(-50%); font-style:normal; color:var(--gold);
  font-size:11px; line-height:1; padding:0 6px; }
/* la fascia della garanzia: solo sull'ammiraglia, solo un fatto */
.imb-fascia { margin-top:auto; padding:9px 24px; background:var(--gold);
  color:#141005; font-size:10px; font-weight:700; letter-spacing:.18em;
  text-transform:uppercase; display:flex; align-items:center; gap:8px; }
.imb-fascia::before { content:'✓'; font-size:11px; }
@media (max-width:900px){
  .imb.eroe { transform:none; }
  .imb.eroe:hover { transform:translateY(-5px); }
  .imb.eroe .caso { font-size:21px; }
  .imb-rotta .campo span { font-size:14px; } }

'''
p = p[:ia] + CSS + p[ib:]

# ── 2 · il motion: via il gate-tick, dentro l'emissione Wallet ──────────
TICK = """/* le luci d'imbarco: i Gate si accendono in sequenza al reveal */
@keyframes gate-tick {
  0% { color:var(--text-4); } 35% { color:var(--gold); }
  100% { color:var(--text-4); } }
html.vivo .banchina.dentro .ba-p:nth-child(1) .ba-gate b {
  animation:gate-tick .55s ease .25s both; }
html.vivo .banchina.dentro .ba-p:nth-child(2) .ba-gate b {
  animation:gate-tick .55s ease .43s both; }
html.vivo .banchina.dentro .ba-p:nth-child(3) .ba-gate b {
  animation:gate-tick .55s ease .61s both; }
html.vivo .banchina.dentro .ba-p:nth-child(4) .ba-gate b {
  animation:gate-tick .55s ease .79s both; }"""
uno(p, TICK, 'gate-tick')
p = p.replace(TICK, """/* l'emissione: i pass vengono STAMPATI in sequenza al reveal — la
   stessa molla di Wallet del pass in hero: il gesto del biglietto */
@keyframes imb-emesso {
  from { opacity:0; transform:translateY(34px) scale(.97); }
  to { opacity:1; } }
html.vivo .imb-griglia .imb { opacity:0; }
html.vivo .imb-griglia.dentro .imb {
  animation:imb-emesso .8s cubic-bezier(.3,1.45,.5,1) both; }
html.vivo .imb-griglia.dentro .imb.eroe { animation-delay:.08s; }
html.vivo .imb-griglia.dentro .imb-pila .imb:nth-child(1) {
  animation-delay:.22s; }
html.vivo .imb-griglia.dentro .imb-pila .imb:nth-child(2) {
  animation-delay:.34s; }
html.vivo .imb-griglia.dentro .imb-pila .imb:nth-child(3) {
  animation-delay:.46s; }""")

RM = "  html.vivo .banchina.dentro .ba-gate b { animation:none; } }"
uno(p, RM, 'reduced motion')
p = p.replace(RM, "  html.vivo .imb-griglia .imb { opacity:1; animation:none; } }")

# ── 3 · HTML: i pass fuori dalla scatola, la scatola tiene i fatti ──────
HA = '<div class="banchina coro" style="margin-top:clamp(22px,2.6vw,34px)">'
HB = '<div class="ba-garanzie"'
uno(p, HA, 'html inizio'); uno(p, HB, 'html fine')
ja, jb = p.index(HA), p.index(HB)

PASSI = '''<div class="imb-griglia coro" style="margin-top:clamp(22px,2.6vw,34px)">
      <a class="imb eroe" href="/property-finding.html">
        <span class="imb-testa">
          <span class="marchio">BOOM · Gate <span class="tess"><i>0</i><i>2</i></span></span>
          <span class="ba-chip oro">Full refund</span>
        </span>
        <span class="imb-corpo">
          <span class="caso">Nothing in the catalogue fits?</span>
          <span class="fa">Our flagship: we hunt the whole market for you —
            and walk every shortlist in person.</span>
          <span class="imb-lista">
            <span>Off-market included — homes that never reach the
              portals</span>
            <span>Every shortlist walked in person before you see it</span>
            <span>Video tours from anywhere — you ask, we walk</span>
          </span>
          <span class="imb-serv">Property Finding<i>→</i></span>
          <span class="imb-rotta">
            <span class="campo"><b>From</b><span>The whole market</span></span>
            <span class="aereo"><i>✈</i></span>
            <span class="campo"><b>To</b><span>Your front door</span></span>
          </span>
        </span>
        <span class="imb-perfo"></span>
        <span class="imb-stub">
          <span class="pflap"><em>€</em><i>3</i><i>5</i><i>0</i></span>
          <span class="dice">deducted on success · refunded in full if we
            don't deliver</span>
          <span class="codice">PF·350</span>
        </span>
        <span class="imb-fascia">Refunded in full if we don't deliver</span>
      </a>
      <div class="imb-pila">
        <a class="imb" href="/virtual-viewing.html">
          <span class="imb-testa">
            <span class="marchio">Gate <span class="tess"><i>0</i><i>1</i></span></span>
            <span class="ba-chip viva"><b></b>Live video</span>
          </span>
          <span class="imb-corpo">
            <span class="caso">Can't fly over to see it?</span>
            <span class="imb-serv">Virtual Viewing<i>→</i></span>
          </span>
          <span class="imb-perfo"></span>
          <span class="imb-stub">
            <span class="pflap"><em>€</em><i>8</i><i>9</i></span>
            <span class="dice">other portals' homes · credited if you rent
              with us — ours: free, always</span>
            <span class="codice">VV·89</span>
          </span>
        </a>
        <a class="imb" href="/deal-assistance.html">
          <span class="imb-testa">
            <span class="marchio">Gate <span class="tess"><i>0</i><i>3</i></span></span>
            <span class="ba-chip">Fixed fee</span>
          </span>
          <span class="imb-corpo">
            <span class="caso">Found one yourself?</span>
            <span class="imb-serv">Deal Assistance<i>→</i></span>
          </span>
          <span class="imb-perfo"></span>
          <span class="imb-stub">
            <span class="pflap"><em>€</em><i>2</i><i>4</i><i>9</i></span>
            <span class="dice">fixed · we verify the landlord and the
              papers, then negotiate</span>
            <span class="codice">DA·249</span>
          </span>
        </a>
        <a class="imb" href="/contract-check-express.html">
          <span class="imb-testa">
            <span class="marchio">Gate <span class="tess"><i>0</i><i>4</i></span></span>
            <span class="ba-chip">In 24h</span>
          </span>
          <span class="imb-corpo">
            <span class="caso">About to sign something?</span>
            <span class="imb-serv">Contract Check Express<i>→</i></span>
          </span>
          <span class="imb-perfo"></span>
          <span class="imb-stub">
            <span class="pflap"><em>€</em><i>4</i><i>9</i></span>
            <span class="dice">a traffic-light verdict in 24h · credited
              on Deal Assistance</span>
            <span class="codice">CC·49</span>
          </span>
        </a>
      </div>
    </div>

    <div class="banchina sale" style="margin-top:clamp(16px,2vw,24px)">

      '''
p = p[:ja] + PASSI + p[jb:]

# niente sopravvissuti della generazione precedente
for morto in ['ba-porte', 'class="ba-p ', 'class="ba-p"', 'ba-gate',
              'class="fantasma"', 'ba-serv', 'gate-tick']:
    assert morto not in p, 'sopravvissuto: ' + morto
assert p.count('class="imb eroe"') == 1
assert p.count('imb-perfo') > 4  # css + 4 usi
assert p.count('</a>') >= 4

scrivi('pt.html', p)
print("L14B2: la Carta d'Imbarco e' montata")
