#!/usr/bin/env python3
# v20 — via la mappa finta (era slop), dentro il teaser che apre lo
# strumento vero; la firma diventa una firma; badge, colori e misure
# passati al setaccio.
s = open('pt.html').read()
def sost(v, n, dove):
    global s
    assert s.count(v) == 1, 'NON TROVATO/DOPPIO: ' + dove
    s = s.replace(v, n)

# ══ 1 · LA SKYLINE: non imitarla, aprirla ══════════════════════════════
A = '<!-- ══ LO SKYLINE 3D — la sezione del sito, in home come magnete ════════ -->'
B = '<!-- ══ I SERVIZI — sei porte, una fila ═══════════════════════════════════ -->'
ia, ib = s.index(A), s.index(B)
NUOVA = '''<!-- ══ LA SKYLINE 3D — il varco verso lo strumento vero ═════════════════ -->
<section class="sezione" id="skyline">
  <div class="container">
    <a class="varco sale" href="SKYLINE_URL">
      <div class="varco-testo">
        <span class="eyebrow"><i></i>Skyline 3D · Satellite</span>
        <h2 class="titolo">Every home on Rome's <span class="hl">real
          skyline</span>.</h2>
        <p class="sotto">Satellite view, buildings in 3D, orbit the block —
          and the walk to Sapienza, LUISS or Termini measured from the door.</p>
        <span class="varco-vai"><i></i>Open the Skyline</span>
      </div>
      <div class="varco-quadro" aria-hidden="true">
        <span class="varco-chrome"><b></b><b></b><b></b>
          <em>boomrome.com/skyline</em></span>
        <div class="varco-scena">
          <span class="varco-conta" id="varcoConta"></span>
          <span class="varco-eti">homes standing in Rome</span>
          <div class="varco-passi">
            <span>Sapienza</span><span>LUISS</span><span>Termini</span>
          </div>
        </div>
        <span class="varco-mirino"></span>
      </div>
    </a>
  </div>
</section>

'''
s = s[:ia] + NUOVA + s[ib:]

# il vestito del varco (e via tutto il vestito della mappa disegnata)
a2 = s.index('/* ══ LO SKYLINE — la città disegnata, e usabile ════════════════════════ */')
b2 = s.index('/* ══ IL FONDATORE ══════════════════════════════════════════════════════ */')
s = s[:a2] + '''/* ══ IL VARCO VERSO LA SKYLINE — un invito, non una finta mappa ════════ */
.varco { display:grid; gap:clamp(20px,2.6vw,40px); grid-template-columns:1fr;
  align-items:center; padding:clamp(22px,2.6vw,34px);
  background:var(--card); box-shadow:inset 0 0 0 1px var(--line-0);
  transition:box-shadow .4s ease, background .4s ease; }
@media (min-width:900px){ .varco {
  grid-template-columns:minmax(0,1fr) minmax(0,.82fr); } }
.varco:hover { background:var(--elevated);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.varco .titolo { margin-top:12px; }
.varco .sotto { max-width:46ch; }
.varco-vai { display:inline-flex; align-items:center; gap:9px; margin-top:20px;
  font-size:11px; font-weight:600; letter-spacing:.14em;
  text-transform:uppercase; color:var(--gold);
  transition:transform .35s var(--ease); }
.varco-vai i { width:9px; height:9px; border-radius:50%; background:var(--gold);
  box-shadow:0 0 0 0 rgba(255,215,0,.5); font-style:normal;
  animation:varco-batti 2.6s ease-out infinite; }
@keyframes varco-batti {
  0% { box-shadow:0 0 0 0 rgba(255,215,0,.45); }
  70%, 100% { box-shadow:0 0 0 11px rgba(255,215,0,0); } }
.varco:hover .varco-vai { transform:translateX(5px); }
/* il quadro: il telaio dello strumento, non il suo contenuto finto */
.varco-quadro { position:relative; overflow:hidden; border-radius:12px;
  background:linear-gradient(155deg, #0E0E12, #08080A);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); aspect-ratio:16/10; }
.varco-chrome { position:absolute; top:0; left:0; right:0; height:30px;
  display:flex; align-items:center; gap:5px; padding:0 12px;
  border-bottom:1px solid var(--line-0); }
.varco-chrome b { width:6px; height:6px; border-radius:50%;
  background:var(--line); }
.varco-chrome em { margin-left:8px; font-style:normal; font-size:8.5px;
  letter-spacing:.14em; text-transform:uppercase; color:var(--text-4); }
.varco-scena { position:absolute; inset:30px 0 0; display:flex;
  flex-direction:column; align-items:center; justify-content:center;
  gap:4px; text-align:center;
  background:radial-gradient(62% 58% at 50% 46%,
    rgba(255,215,0,.09), transparent 72%); }
.varco-conta { font-family:var(--display); font-size:clamp(38px,5vw,62px);
  font-weight:200; color:var(--gold); font-variant-numeric:tabular-nums;
  line-height:1; }
.varco-eti { font-size:9.5px; font-weight:600; letter-spacing:.2em;
  text-transform:uppercase; color:var(--text-3); }
.varco-passi { display:flex; gap:7px; margin-top:14px; flex-wrap:wrap;
  justify-content:center; }
.varco-passi span { padding:6px 10px; font-size:9px; font-weight:600;
  letter-spacing:.12em; text-transform:uppercase; color:var(--text-3);
  box-shadow:inset 0 0 0 1px var(--line-0); border-radius:100px; }
/* il mirino che respira: l'unica animazione, e vuol dire «è vivo» */
.varco-mirino { position:absolute; left:50%; top:calc(50% + 15px);
  width:74px; height:74px; margin:-37px 0 0 -37px; border-radius:50%;
  border:1px solid rgba(255,215,0,.3); opacity:0; pointer-events:none;
  animation:varco-mira 4.2s ease-out infinite; }
@keyframes varco-mira {
  0% { transform:scale(.4); opacity:.55; }
  100% { transform:scale(1.7); opacity:0; } }
@media (prefers-reduced-motion:reduce){
  .varco-vai i, .varco-mirino { animation:none; }
  .varco-mirino { opacity:.2; } }

''' + s[b2:]

# ══ 2 · LA FIRMA: una firma vera, non uno scarabocchio ════════════════
sost("""              <div class="sc-firma"><svg viewBox="0 0 200 46" aria-hidden="true">
                <path pathLength="1" d="M8 36 C 20 6, 34 8, 30 26 C 27 40, 40 38, 48 24
                  M56 32 c 5 -11, 13 -11, 14 -1 c 1 8 9 5 13 -5
                  M92 10 l -7 28 m -5 -13 l 19 0
                  M116 30 c 4 -8, 10 -9, 11 -1 c 1 7 8 4 12 -5
                  M146 34 l 4 -3"/></svg></div>""",
"""              <div class="sc-firma"><svg viewBox="0 0 260 60" aria-hidden="true">
                <path class="f-corpo" pathLength="1" d="M12 47
                  C 16 24, 26 8, 36 9 c 9 1, 6 16, -3 25 c -8 8, -13 12, -9 16
                  c 4 4, 12 -2, 17 -9 c 4 -6, 7 -12, 11 -11 c 4 1, 2 8, 0 12
                  c -2 4, 0 7, 4 6 c 5 -1, 9 -7, 12 -13 c 3 -5, 6 -9, 9 -8
                  c 4 1, 1 9, -1 13 c -2 4, 1 6, 5 5 c 6 -2, 11 -9, 15 -16
                  c 3 -6, 8 -22, 12 -21 c 4 1, -1 14, -5 22 c -4 8, -7 14, -3 17
                  c 4 3, 11 -3, 15 -9 c 4 -6, 7 -12, 11 -11 c 4 1, 2 8, 0 12
                  c -2 4, 1 7, 5 6 c 7 -2, 13 -11, 18 -19"/>
                <path class="f-svolo" pathLength="1" d="M150 52
                  c 22 -6, 48 -9, 74 -6"/>
              </svg></div>""", 'firma')
sost(""".sc-firma svg { width:130px; height:30px; margin-top:8px; }
.sc-firma path { fill:none; stroke:var(--gold); stroke-width:1.6;
  stroke-linecap:round; stroke-dasharray:1; stroke-dashoffset:1; }
.scena-p.attiva .sc-firma path {
  animation:sc-scrivi 1.6s var(--ease) .5s forwards; }
@keyframes sc-scrivi { to { stroke-dashoffset:0; } }""",
""".sc-firma svg { width:168px; height:40px; margin-top:8px; overflow:visible; }
.sc-firma path { fill:none; stroke:var(--gold); stroke-linecap:round;
  stroke-linejoin:round; stroke-dasharray:1; stroke-dashoffset:1; }
.sc-firma .f-corpo { stroke-width:2.1; }
.sc-firma .f-svolo { stroke-width:1.2; opacity:.6; }
/* la penna scrive: il corpo con la sua cadenza, lo svolazzo dopo */
.scena-p.attiva .sc-firma .f-corpo {
  animation:sc-scrivi 1.5s cubic-bezier(.5,.02,.32,1) .45s forwards; }
.scena-p.attiva .sc-firma .f-svolo {
  animation:sc-scrivi .5s cubic-bezier(.3,.8,.4,1) 1.85s forwards; }
@keyframes sc-scrivi { to { stroke-dashoffset:0; } }""", 'firma css')

# ══ 3 · BADGE, COLORI, MISURE: il setaccio ════════════════════════════
# i chip delle carte: più corpo, gerarchia netta oro/verde
sost(""".casa-chip { position:absolute; left:10px; top:10px; height:22px;
  display:inline-flex; align-items:center; padding:0 9px;
  border-radius:5px; background:rgba(3,3,3,.78); backdrop-filter:blur(8px);
  font-size:8.5px; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:var(--gold-light);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.casa-chip.verde { color:var(--green);
  box-shadow:inset 0 0 0 1px rgba(0,255,136,.35); }""",
""".casa-chip { position:absolute; left:10px; top:10px; height:25px;
  display:inline-flex; align-items:center; padding:0 11px;
  border-radius:100px; background:rgba(3,3,3,.82); backdrop-filter:blur(10px);
  font-size:9.5px; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:var(--gold-light);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
/* il verde è uno stato, non un vezzo: solo dove la casa è davvero libera */
.casa-chip.verde { color:var(--green); background:rgba(0,32,18,.72);
  box-shadow:inset 0 0 0 1px rgba(0,255,136,.42); }""", 'chip')
# la strip d'imbarco: titoli con peso, sottotitoli leggibili
sost(""".imbarco-v b { display:block; font-family:var(--display); font-size:14px;
  font-weight:500; letter-spacing:.12em; }
.imbarco-v span { display:block; font-size:10px; letter-spacing:.12em;
  text-transform:uppercase; color:var(--text-3); margin-top:1px; }
.imbarco-v .orologio-roma { font-variant-numeric:tabular-nums; }""",
""".imbarco-v b { display:block; font-family:var(--display); font-size:16px;
  font-weight:400; letter-spacing:.16em; color:var(--text); }
.imbarco-v span { display:block; font-size:10.5px; letter-spacing:.08em;
  text-transform:none; color:var(--text-2); margin-top:3px; }
/* l'ora di Roma è un quadrante: cifre d'oro, passo fisso */
.imbarco-v .orologio-roma { font-variant-numeric:tabular-nums;
  letter-spacing:.14em; color:var(--gold); }""", 'imbarco')
# il LIVE del tabellone: pastiglia, non etichetta
sost(""".board-live { display:inline-flex; align-items:center; gap:7px; height:22px;
  padding:0 10px; box-shadow:inset 0 0 0 1px rgba(0,255,136,.3);
  font-size:9px; font-weight:700; letter-spacing:.18em; color:var(--green); }""",
""".board-live { display:inline-flex; align-items:center; gap:7px; height:24px;
  padding:0 12px; border-radius:100px; background:rgba(0,32,18,.6);
  box-shadow:inset 0 0 0 1px rgba(0,255,136,.38);
  font-size:9.5px; font-weight:700; letter-spacing:.2em; color:var(--green); }""",
     'board live')
# gli occhielli: un filo più presenti, stessa famiglia ovunque
sost(""".eyebrow { display:inline-flex; align-items:center; gap:10px; font-size:11px;""",
     """.eyebrow { display:inline-flex; align-items:center; gap:10px; font-size:11.5px;""",
     'eyebrow')
open('pt.html', 'w').write(s)
print('v20: varco, firma, badge')

# il builder: il conteggio nel varco e il link alla Skyline
b = open('costruisci-portale.py').read()
v = """h = h.replace('RECENSIONI_URL',"""
n = """h = h.replace('SKYLINE_URL', 'https://www.boomrome.com/skyline'
    if MODO == 'artefatto' else '/skyline')
h = h.replace('<span class="varco-conta" id="varcoConta"></span>',
    f'<span class="varco-conta" id="varcoConta">{len(SKYCASE)}</span>')
h = h.replace('RECENSIONI_URL',"""
assert b.count(v) == 1, 'builder varco'
open('costruisci-portale.py', 'w').write(b.replace(v, n))
print('builder: varco collegato')
