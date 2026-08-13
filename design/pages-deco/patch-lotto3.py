#!/usr/bin/env python3
# LOTTO 3 — il giro del "continuiamo":
#  1. IL ROSSO — #FF9C8A era slavato; #FF6B57 (corallo vivo, contrasto ~6.8)
#     su discovery (.casa-stato.poi) e detail (.stato-grande.dopo).
#  2. THE ENGINE → UN RADAR VERO — il quadrato "basilare" diventa un radar
#     CSS che si capisce in un secondo: anelli, spazzata conica, blip coi
#     nomi dei portali + off-market, sincronizzati col giro. E il bug del
#     font: su discovery il titolo usava .vuoto-titolo SENZA l'antenato
#     .vuoto, quindi cadeva su Inter — ora .rete-titolo con var(--display)
#     vale per h2 e h3.
#  3. IL MOSAICO SOLARE — più vivo e colorato: glints verdi rari sulla
#     cresta (il verde "available now" del brand), cascate di colonna come
#     un tabellone che aggiorna una riga, base più visibile, oro più pieno.
#  4. PORTE-MINI — al posto della riga Stripe nell'hero: i 4 servizi
#     sintetici (PFS/DAS/VV/Concierge) — la fiducia Stripe resta dove si
#     parla di soldi (banchina garanzie), detta una volta sola.
#  5. IL VELO DELLA DISCOVERY — alleggerito dove copriva il tabellone.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('pt.html', 'ad-corpo.html', 'ld-corpo.html'):
    shutil.copy(f, f + '.bak3')

# ═══ 1. IL ROSSO ════════════════════════════════════════════════════════
s = leggi('ad-corpo.html')
s = uno(s, """.casa-p .home-foto .casa-stato.poi { color:#FF9C8A;
  box-shadow:inset 0 0 0 1px rgba(255,110,90,.32); }""",
""".casa-p .home-foto .casa-stato.poi { color:#FF6B57;
  box-shadow:inset 0 0 0 1px rgba(255,107,87,.38); }""", 'rosso discovery')

# ═══ 5. IL VELO DELLA DISCOVERY — il tabellone si deve vedere ═══════════
s = uno(s, """.disco-velo::after { content:''; position:absolute; inset:0;
  background:linear-gradient(100deg, rgba(3,3,3,.92) 0%, rgba(3,3,3,.66) 34%,
    rgba(3,3,3,.12) 62%, transparent 78%); }""",
""".disco-velo::after { content:''; position:absolute; inset:0;
  background:linear-gradient(100deg, rgba(3,3,3,.9) 0%, rgba(3,3,3,.58) 32%,
    rgba(3,3,3,.08) 56%, transparent 72%); }""", 'velo desktop')
s = uno(s, """  .disco-velo::after {
    background:linear-gradient(180deg, rgba(3,3,3,.55), rgba(3,3,3,.86) 46%,
      rgba(3,3,3,.94)); } }""",
"""  .disco-velo::after {
    background:linear-gradient(180deg, rgba(3,3,3,.42), rgba(3,3,3,.84) 46%,
      rgba(3,3,3,.94)); } }""", 'velo mobile')

# ═══ 2b. IL RADAR SULLA DISCOVERY — markup nuovo, font giusto ═══════════
s = uno(s, """    <div class="rete coro">
      <div class="rete-pfs">
        <span class="rete-eti"><b></b>Property Finding · the hunt engine</span>
        <h2 class="vuoto-titolo">Not on this page?<br><span class="hl">It doesn't mean it doesn't exist.</span></h2>
        <p>Your brief becomes a live search: our engine scans the market and
          the off-market around the clock, a human verifies every match, and
          you get curated options — not links.</p>
        <div class="rete-cifre">
          <div class="rete-cifra"><b>1:1</b><span>tailored hunt</span></div>
          <div class="rete-cifra"><b>5+</b><span>curated options</span></div>
          <div class="rete-cifra"><b>24/7</b><span>market scan</span></div>
          <div class="rete-cifra"><b>€0</b><span>if we fail</span></div>
        </div>
        <div class="rete-motore" aria-label="The engine behind the hunt">
          <span>RADAR — 96 scans/day</span><span>HUMAN-VERIFIED</span>
          <span>OFF-MARKET INCLUDED</span></div>
        <a class="btn btn-primary" href="/property-finding.html">Start the hunt</a>
        <p class="rete-nota">€350 upfront — deducted from the agency fee when
          we find your home. Full refund if we don't deliver.</p>
      </div>
    </div>""",
"""    <div class="rete coro">
      <div class="rete-pfs">
        <div class="rete-corpo">
          <div>
            <span class="rete-eti"><b></b>Property Finding · the hunt engine</span>
            <h2 class="rete-titolo">Not on this page?<br><span class="hl">It doesn't mean it doesn't exist.</span></h2>
            <p>Your brief becomes a live search: our radar scans the portals
              and the off-market ninety-six times a day, a human verifies
              every match, and you get curated options — not links.</p>
            <div class="rete-cifre">
              <div class="rete-cifra"><b>1:1</b><span>tailored hunt</span></div>
              <div class="rete-cifra"><b>5+</b><span>curated options</span></div>
              <div class="rete-cifra"><b>24/7</b><span>market scan</span></div>
              <div class="rete-cifra"><b>€0</b><span>if we fail</span></div>
            </div>
            <a class="btn btn-primary" href="/property-finding.html">Start the hunt</a>
            <p class="rete-nota">€350 upfront — deducted from the agency fee when
              we find your home. Full refund if we don't deliver.</p>
          </div>
          <div class="radar-colonna" aria-hidden="true">
            <div class="radar">
              <i style="left:62%;top:26%;animation-delay:.35s" data-n="Immobiliare"></i>
              <i style="left:74%;top:58%;animation-delay:1.45s" data-n="Idealista"></i>
              <i style="left:30%;top:70%;animation-delay:3s" data-n="Casa.it"></i>
              <i style="left:22%;top:38%;animation-delay:3.9s" data-n="Subito"></i>
              <i class="oro" style="left:48%;top:14%;animation-delay:4.72s" data-n="Off-market"></i>
              <span class="radar-io"></span>
            </div>
            <p class="radar-dida"><b>96</b> scans · every day</p>
          </div>
        </div>
      </div>
    </div>""", 'radar discovery')
scrivi('ad-corpo.html', s)

s = leggi('ld-corpo.html')
s = uno(s, """.stato-grande.dopo { color:#FF9C8A;
  box-shadow:inset 0 0 0 1px rgba(255,110,90,.32); }""",
""".stato-grande.dopo { color:#FF6B57;
  box-shadow:inset 0 0 0 1px rgba(255,107,87,.38); }""", 'rosso detail')
scrivi('ld-corpo.html', s)

# ═══ PT.HTML ════════════════════════════════════════════════════════════
s = leggi('pt.html')

# ── 2a. CSS del radar: sostituisce la linea-scan e ripara il titolo ─────
s = uno(s, """.rete-pfs::before { content:''; position:absolute; top:0; left:-40%;
  width:40%; height:1.5px;
  background:linear-gradient(90deg, transparent, var(--gold), transparent);
  animation:rete-scan 3.2s var(--ease) infinite; }
@keyframes rete-scan { to { left:110%; } }""",
""".rete-corpo { display:grid; grid-template-columns:1fr auto;
  gap:clamp(20px,3.4vw,48px); align-items:center; }
@media (max-width:760px){
  .rete-corpo { grid-template-columns:1fr; }
  .radar-colonna { order:-1; justify-self:center; } }
/* IL RADAR — la caccia che si vede: anelli, spazzata, i portali come
   blip che si accendono quando il fascio li tocca */
.radar { position:relative; width:clamp(190px,20vw,242px); aspect-ratio:1;
  border-radius:50%; flex:none;
  background:
    radial-gradient(circle, rgba(255,215,0,.08), rgba(255,215,0,.015) 56%,
      transparent 72%),
    repeating-radial-gradient(circle at 50% 50%, transparent 0,
      transparent 23%, rgba(250,248,240,.09) 23.5%, transparent 24%);
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.18); }
.radar::before { content:''; position:absolute; inset:0; border-radius:50%;
  background:conic-gradient(from 0deg, rgba(255,215,0,.32),
    rgba(255,215,0,.06) 55deg, transparent 85deg, transparent);
  animation:radar-giro 4.8s linear infinite; }
@keyframes radar-giro { to { transform:rotate(360deg); } }
.radar-io { position:absolute; left:50%; top:50%; width:7px; height:7px;
  margin:-3.5px 0 0 -3.5px; border-radius:50%; background:var(--gold);
  box-shadow:0 0 14px rgba(255,215,0,.85); }
.radar i { position:absolute; width:5px; height:5px; margin:-2.5px 0 0 -2.5px;
  border-radius:50%; background:#FAF8F0; color:#FAF8F0; opacity:.3;
  animation:radar-blip 4.8s linear infinite; }
.radar i.oro { background:var(--gold); color:var(--gold); }
.radar i::after { content:attr(data-n); position:absolute; left:10px;
  top:-4px; font-size:9px; font-weight:600; letter-spacing:.14em;
  text-transform:uppercase; color:var(--text-3); white-space:nowrap; }
@keyframes radar-blip {
  0%, 3% { opacity:1; box-shadow:0 0 10px currentColor; }
  40%, 100% { opacity:.3; box-shadow:none; } }
.radar-dida { margin-top:12px; text-align:center; font-size:10px;
  font-weight:600; letter-spacing:.2em; text-transform:uppercase;
  color:var(--text-3); }
.radar-dida b { color:var(--gold); font-weight:600;
  font-variant-numeric:tabular-nums; }
@media (prefers-reduced-motion:reduce){
  .radar::before { animation:none; opacity:.4; }
  .radar i { animation:none; opacity:.85; } }""", 'css radar')

# il titolo del motore: una classe sola per h2 e h3, sempre var(--display)
s = uno(s, """.rete-pfs h3 { margin-top:13px; font-family:var(--display); font-size:23px;
  font-weight:250; letter-spacing:-.01em; }
.rete-pfs h3 .hl { color:var(--gold); }""",
""".rete-titolo { margin-top:13px; font-family:var(--display);
  font-size:clamp(20px,2.2vw,25px); font-weight:250; letter-spacing:-.01em;
  line-height:1.22; }
.rete-titolo .hl { color:var(--gold); }""", 'css titolo rete')

# le pillole rete-motore non servono piu (il radar dice le stesse cose)
s = uno(s, """.rete-motore { margin-top:16px; display:flex; flex-wrap:wrap; gap:7px; }
.rete-motore span { font-size:10px; font-weight:600; letter-spacing:.16em;
  color:var(--text-3); padding:6px 10px;
  box-shadow:inset 0 0 0 1px var(--line-0); border-radius:100px; }
.rete-motore span:first-child { color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
""", '', 'css motore via')

# ── 2a. markup del radar sulla home ─────────────────────────────────────
s = uno(s, """      <div class="rete-pfs">
        <span class="rete-eti"><b></b>Property Finding · the hunt engine</span>
        <h3>Your brief becomes<br><span class="hl">a live search.</span></h3>
        <p>You describe the home; we turn it into a standing query. The radar
          watches Immobiliare, Idealista and the listings that never reach a
          portal. Every hit is opened, checked and walked by a person before
          it reaches you — so what arrives is a shortlist, not links.</p>
        <div class="rete-cifre">
          <div class="rete-cifra"><b>1:1</b><span>tailored hunt</span></div>
          <div class="rete-cifra"><b>5+</b><span>curated options</span></div>
          <div class="rete-cifra"><b>24/7</b><span>market scan</span></div>
          <div class="rete-cifra"><b>€0</b><span>if we fail</span></div>
        </div>
        <div class="rete-motore" aria-label="The engine behind the hunt">
          <span>RADAR — 96 scans/day</span><span>HUMAN-VERIFIED</span>
          <span>OFF-MARKET INCLUDED</span></div>
        <a class="btn btn-primary" href="/property-finding.html">Start the hunt</a>
        <p class="rete-nota">€350 upfront — deducted from the agency fee when
          we find your home. Full refund if we don't deliver.</p>
      </div>""",
"""      <div class="rete-pfs">
        <div class="rete-corpo">
          <div>
            <span class="rete-eti"><b></b>Property Finding · the hunt engine</span>
            <h3 class="rete-titolo">Your brief becomes<br><span class="hl">a live search.</span></h3>
            <p>You describe the home; we turn it into a standing query. The
              radar watches Immobiliare, Idealista and the listings that never
              reach a portal. Every hit is opened, checked and walked by a
              person before it reaches you — so what arrives is a shortlist,
              not links.</p>
            <div class="rete-cifre">
              <div class="rete-cifra"><b>1:1</b><span>tailored hunt</span></div>
              <div class="rete-cifra"><b>5+</b><span>curated options</span></div>
              <div class="rete-cifra"><b>24/7</b><span>market scan</span></div>
              <div class="rete-cifra"><b>€0</b><span>if we fail</span></div>
            </div>
            <a class="btn btn-primary" href="/property-finding.html">Start the hunt</a>
            <p class="rete-nota">€350 upfront — deducted from the agency fee when
              we find your home. Full refund if we don't deliver.</p>
          </div>
          <div class="radar-colonna" aria-hidden="true">
            <div class="radar">
              <i style="left:62%;top:26%;animation-delay:.35s" data-n="Immobiliare"></i>
              <i style="left:74%;top:58%;animation-delay:1.45s" data-n="Idealista"></i>
              <i style="left:30%;top:70%;animation-delay:3s" data-n="Casa.it"></i>
              <i style="left:22%;top:38%;animation-delay:3.9s" data-n="Subito"></i>
              <i class="oro" style="left:48%;top:14%;animation-delay:4.72s" data-n="Off-market"></i>
              <span class="radar-io"></span>
            </div>
            <p class="radar-dida"><b>96</b> scans · every day</p>
          </div>
        </div>
      </div>""", 'radar home')

# ── 4. PORTE-MINI al posto della riga Stripe ────────────────────────────
s = uno(s, """/* la riga di fiducia nell'hero: una sola, sottile. Il discorso lungo sui
   soldi vive nella banchina, dove si parla di prezzi. */
.hero-fede { display:flex; align-items:center; gap:11px;
  margin-top:clamp(16px,2vw,22px); padding:11px 15px; border-radius:100px;
  background:var(--surface); box-shadow:inset 0 0 0 1px var(--line-0);
  max-width:max-content; }
.hero-fede .hf-stripe { width:40px; height:auto; flex:none; opacity:.85; }
.hero-fede span { font-size:11.5px; line-height:1.5; color:var(--text-4); }
.hero-fede span b { color:var(--text-2); font-weight:500; }
@media (max-width:640px){
  .hero-fede { border-radius:14px; padding:11px 13px; align-items:flex-start; }
  .hero-fede .hf-stripe { margin-top:2px; } }""",
"""/* le porte-mini: i quattro servizi, sintetici, gia dal primo schermo.
   La fiducia Stripe vive nella banchina, dove si parla di prezzi —
   ogni cosa detta una volta sola. */
.porte-mini { display:flex; align-items:stretch; flex-wrap:wrap; gap:8px;
  margin-top:clamp(16px,2vw,22px); }
.porte-mini .pm-eti { align-self:center; font-size:10px; font-weight:600;
  letter-spacing:.22em; text-transform:uppercase; color:var(--text-4);
  padding-right:3px; }
.porte-mini a { display:flex; flex-direction:column; gap:2px;
  padding:10px 14px; border-radius:12px; background:var(--surface);
  box-shadow:inset 0 0 0 1px var(--line-0);
  transition:box-shadow .3s, transform .3s; }
.porte-mini a:hover { box-shadow:inset 0 0 0 1px var(--line-gold-2);
  transform:translateY(-1px); }
.porte-mini b { font-size:12px; font-weight:500; color:var(--text);
  white-space:nowrap; }
.porte-mini span { font-size:10.5px; color:var(--text-4);
  white-space:nowrap; }
@media (max-width:640px){
  .porte-mini { display:grid; grid-template-columns:1fr 1fr; }
  .porte-mini .pm-eti { grid-column:1/-1; padding:0; }
  .porte-mini b, .porte-mini span { white-space:normal; } }""", 'css porte-mini')

s = uno(s, """      <div class="hero-fede">
        <svg class="hf-stripe" aria-label="Stripe" viewBox="0 0 468 222.5" xmlns="http://www.w3.org/2000/svg"> <path fill="#635BFF" d="M414 113.4c0-25.6-12.4-45.8-36.1-45.8-23.8 0-38.2 20.2-38.2 45.6 0 30.1 17 45.3 41.4 45.3 11.9 0 20.9-2.7 27.7-6.5v-20c-6.8 3.4-14.6 5.5-24.5 5.5-9.7 0-18.3-3.4-19.4-15.2h48.9c0-1.3.2-6.5.2-8.9zm-49.4-9.5c0-11.3 6.9-16 13.2-16 6.1 0 12.6 4.7 12.6 16h-25.8zm-63.5-36.3c-9.8 0-16.1 4.6-19.6 7.8l-1.3-6.2h-22v116.6l25-5.3.1-28.3c3.6 2.6 8.9 6.3 17.7 6.3 17.9 0 34.2-14.4 34.2-46.1-.1-29-16.6-44.8-34.1-44.8zm-6 68.9c-5.9 0-9.4-2.1-11.8-4.7l-.1-37.1c2.6-2.9 6.2-4.9 11.9-4.9 9.1 0 15.4 10.2 15.4 23.3 0 13.4-6.2 23.4-15.4 23.4zm-71.3-74.8l25.1-5.4V36l-25.1 5.3zm0 7.6h25.1v87.5h-25.1zm-26.9 7.4l-1.6-7.4h-21.6v87.5h25V97.5c5.9-7.7 15.9-6.3 19-5.2v-23c-3.2-1.2-14.9-3.4-20.8 7.4zm-50-29.8l-24.4 5.2-.1 80.1c0 14.8 11.1 25.7 25.9 25.7 8.2 0 14.2-1.5 17.5-3.3V135c-3.2 1.3-19 5.9-19-8.9V90.6h19V69.3h-19l.1-21.7zM79.3 94.7c0-3.9 3.2-5.4 8.5-5.4 7.6 0 17.2 2.3 24.8 6.4V72.2c-8.3-3.3-16.5-4.6-24.8-4.6C67.5 67.6 54 78.2 54 95.9c0 27.6 38 23.2 38 35.1 0 4.6-4 6.1-9.6 6.1-8.3 0-18.9-3.4-27.3-8v23.8c9.3 4 18.7 5.7 27.3 5.7 20.8 0 35.1-10.3 35.1-28.2-.1-29.8-38.2-24.5-38.2-35.7z"/> </svg>
        <span><b>Every euro through BOOM</b>, never to a stranger ·
          every home walked in person · we reply within 2h</span>
      </div>""",
"""      <nav class="porte-mini" aria-label="BOOM services">
        <span class="pm-eti">Services</span>
        <a href="/property-finding.html"><b>Property Finding</b>
          <span>€350 · refunded if we fail</span></a>
        <a href="/deal-assistance.html"><b>Deal Assistance</b>
          <span>€249 · we close your deal</span></a>
        <a href="/virtual-viewing.html"><b>Virtual Viewing</b>
          <span>€89 · we walk it live for you</span></a>
        <a href="/concierge.html"><b>Concierge</b>
          <span>move-in, utilities, done</span></a>
      </nav>""", 'porte-mini markup')

# ── 3. IL MOSAICO SOLARE — piu vivo, piu colorato ───────────────────────
# il verde del brand entra nel campo: un terzo colore, raro, da tabellone
s = uno(s, """    var ORO = '255,215,0', LATTE = '250,248,240';
    var W, H, DPR, MIN, cw, ch, gap, cols, rows, E, AU, basetela;""",
"""    var ORO = '255,215,0', LATTE = '250,248,240', VERDE = '0,255,136';
    var W, H, DPR, MIN, cw, ch, gap, cols, rows, E, AU, AV, basetela;""",
'colori e var verde')
s = uno(s, """      E = new Float32Array(cols * rows);
      AU = new Float32Array(cols * rows);""",
"""      E = new Float32Array(cols * rows);
      AU = new Float32Array(cols * rows);
      AV = new Float32Array(cols * rows);""", 'array verde')

# base un filo piu presente: il tabellone si vede anche da fermo
s = uno(s, """        bg.fillStyle = 'rgba(' + LATTE + ',' + (.024 * vy) + ')';""",
"""        bg.fillStyle = 'rgba(' + LATTE + ',' + (.031 * vy) + ')';""",
'base viva')

# le cascate di colonna: il tabellone che aggiorna una riga, in verticale
s = uno(s, """    var battito = 700;
    function vita(t) {
      ctx.clearRect(0, 0, W, H);
      /* il battito del mosaico, anche in cima: l'anello dal cuore */
      if (!ridotto && t > battito) {
        onde.push({ x: W * (mob ? .5 : .56), y: H * .42,
          via: t, batte: true });
        if (onde.length > 4) onde.shift();
        battito = t + 8200;
      }""",
"""    var battito = 700, flip = 2200, casc = [];
    function vita(t) {
      ctx.clearRect(0, 0, W, H);
      /* il battito del mosaico, anche in cima: l'anello dal cuore */
      if (!ridotto && t > battito) {
        onde.push({ x: W * (mob ? .5 : .56), y: H * .42,
          via: t, batte: true });
        if (onde.length > 4) onde.shift();
        battito = t + 8200;
      }
      /* la cascata di colonna: una riga del tabellone che si aggiorna —
         le palette scattano dall'alto in basso, a volte in verde */
      if (!ridotto && t > flip) {
        casc.push({ c: Math.floor(Math.random() * cols), via: t,
          verde: Math.random() < .32 });
        if (casc.length > 3) casc.shift();
        flip = t + 4600 + Math.random() * 3800;
      }
      for (var ci = 0; ci < casc.length; ci++) {
        var ca = casc[ci], testa = (t - ca.via) / 46;
        if (testa > rows + 3) continue;
        var da2 = Math.max(0, Math.floor(testa) - 2);
        var fino = Math.min(rows - 1, Math.floor(testa));
        for (var rr = da2; rr <= fino; rr++) {
          var ii = rr * cols + ca.c, forza = 1 - (testa - rr) / 3;
          if (forza <= 0) continue;
          if (ca.verde) AV[ii] = Math.max(AV[ii], forza * .8);
          else AU[ii] = Math.max(AU[ii], forza * .85);
          E[ii] = Math.max(E[ii], forza);
        }
      }""", 'cascate')

# i brilli sulla cresta: oro come prima, e ogni tanto uno verde
s = uno(s, """        if (v1 > .96 && Math.random() < .005) AU[i] = .9;""",
"""        if (v1 > .96) { var brillo = Math.random();
          if (brillo < .0045) AU[i] = .9;
          else if (brillo < .006) AV[i] = .85; }""", 'brillo verde')

# il decadimento include il verde
s = uno(s, """      for (var k = 0; k < E.length; k++) {
        E[k] *= kdec; AU[k] *= kdec;
        if (E[k] < .003) E[k] = 0;
        if (AU[k] < .003) AU[k] = 0;
      }""",
"""      for (var k = 0; k < E.length; k++) {
        E[k] *= kdec; AU[k] *= kdec; AV[k] *= kdec;
        if (E[k] < .003) E[k] = 0;
        if (AU[k] < .003) AU[k] = 0;
        if (AV[k] < .003) AV[k] = 0;
      }""", 'decadimento verde')

# il render: verde > oro > latte, oro un filo piu pieno, latte piu visibile
s = uno(s, """        var i2 = r2 * cols + c2;
        if (E[i2] < .02 && AU[i2] < .05) continue;   /* dorme: è già base */
        var x2 = c2 * (cw + gap), y2 = r2 * (ch + gap);
        var vy2 = velo(y2);
        if (vy2 <= 0) continue;
        ctx.fillStyle = AU[i2] > .05
          ? 'rgba(' + ORO + ',' + (AU[i2] * .45 * vy2) + ')'
          : 'rgba(' + LATTE + ',' + (E[i2] * .11 * vy2) + ')';
        ctx.beginPath();
        ctx.roundRect(x2, y2, cw, ch, 3 * DPR);
        ctx.fill();
        if (E[i2] > .14 || AU[i2] > .1) {""",
"""        var i2 = r2 * cols + c2;
        if (E[i2] < .02 && AU[i2] < .05 && AV[i2] < .06) continue;
        var x2 = c2 * (cw + gap), y2 = r2 * (ch + gap);
        var vy2 = velo(y2);
        if (vy2 <= 0) continue;
        ctx.fillStyle = AV[i2] > .06
          ? 'rgba(' + VERDE + ',' + (AV[i2] * .32 * vy2) + ')'
          : AU[i2] > .05
            ? 'rgba(' + ORO + ',' + (AU[i2] * .5 * vy2) + ')'
            : 'rgba(' + LATTE + ',' + (E[i2] * .13 * vy2) + ')';
        ctx.beginPath();
        ctx.roundRect(x2, y2, cw, ch, 3 * DPR);
        ctx.fill();
        if (E[i2] > .14 || AU[i2] > .1 || AV[i2] > .1) {""", 'render verde')

scrivi('pt.html', s)
print('lotto 3: fatto')
