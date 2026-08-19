#!/usr/bin/env python3
# L14·B3 — LO SCAFFALE. Il verdetto dell'operatore sulle versioni
# precedenti: «sembrano info, non badge di prodotto che convertono».
# Giusto. Un badge di prodotto che converte fa tre cose che una scheda
# non fa: mostra un OGGETTO (la carta BOOM resa in 3D: fluttua, si
# inclina verso il cursore, prende la luce), mette un bottone che COMPRA
# (verbo + prezzo, la grammatica dei commerce globali) e chiude col
# risk-reversal (la garanzia con la spunta sotto il bottone).
# La firma cromatica resta: un materiale, quattro luci (oro ammiraglia,
# verde live, violetto protezione, ciano verdetto). Fatti invariati.
import shutil

SP = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/'

def leggi(n): return open(SP + n, encoding='utf-8').read()
def scrivi(n, s): open(SP + n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: {s.count(ago)}'

p = leggi('pt.html'); shutil.copy(SP + 'pt.html', SP + 'pt.html.bakL14B3')

# ── 1 · CSS: via la carta d'imbarco, dentro lo scaffale ──────────────────
A = "/* LA CARTA D'IMBARCO — il materiale racconta il prodotto: BOOM emette"
B = '/* le garanzie: badge piccoli, tutti veri'
uno(p, A, 'css inizio'); uno(p, B, 'css fine')
ia, ib = p.index(A), p.index(B)

CSS = '''/* LO SCAFFALE — il servizio come PRODOTTO, non come scheda: un oggetto
   da desiderare (la carta BOOM in 3D che fluttua e si inclina verso il
   cursore), un bottone che COMPRA (verbo + prezzo) e la garanzia con la
   spunta subito sotto — desiderio, azione, rischio azzerato.
   La firma cromatica: UN materiale nero-vetro, quattro luci — oro
   ammiraglia · verde live · violetto protezione · ciano verdetto. */
.pr-fila { --c-vv:#00FF88; --c-pf:#FFD700; --c-da:#9D8CFF; --c-cc:#3ED3FF;
  display:grid; grid-template-columns:1.5fr 1fr 1fr 1fr;
  gap:clamp(12px,1.6vw,18px); align-items:stretch; }
@media (max-width:1020px){
  .pr-fila { grid-template-columns:1fr 1fr; }
  .pr.eroe { grid-column:1/-1; } }
@media (max-width:580px){ .pr-fila { grid-template-columns:1fr; } }
.pr { position:relative; display:flex; flex-direction:column;
  border-radius:22px; overflow:hidden;
  background:linear-gradient(180deg,#0F0F12,#080809 70%);
  box-shadow:inset 0 0 0 1px var(--line), 0 30px 60px -36px rgba(0,0,0,.9);
  padding:0 20px 20px; transition:box-shadow .45s var(--ease); }
.pr:hover { box-shadow:inset 0 0 0 1px
  color-mix(in srgb, var(--c) 35%, transparent),
  0 40px 80px -36px rgba(0,0,0,.95); }
.pr .retro { position:absolute; inset:0 0 auto; height:240px;
  pointer-events:none; opacity:.75; transition:opacity .5s var(--ease);
  background:radial-gradient(60% 78% at 50% 8%, var(--ca), transparent 72%); }
.pr:hover .retro { opacity:1; }
/* il palcoscenico: l'oggetto fluttua in prospettiva, l'ombra respira */
.palcosc { position:relative; height:200px; display:grid;
  place-items:center; perspective:900px; }
.pr .ombra { position:absolute; bottom:14px; left:50%; width:58%;
  height:22px; transform:translateX(-50%); border-radius:50%;
  background:radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.8),
    transparent 72%); filter:blur(7px);
  animation:ombraRespira 5.5s ease-in-out infinite; }
@keyframes ombraRespira { 50% { transform:translateX(-50%) scaleX(.88);
  opacity:.75; } }
.oggetto { --rx:0deg; --ry:0deg; position:relative; width:min(196px,72%);
  aspect-ratio:1.586; border-radius:13px; overflow:hidden;
  transform:rotateX(calc(13deg + var(--ry))) rotateY(calc(-15deg + var(--rx)));
  background:linear-gradient(148deg,#1D1D23,#0B0B0E 62%);
  box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--c) 34%, transparent),
    inset 0 1px 0 rgba(255,255,255,.14),
    22px 30px 44px -18px rgba(0,0,0,.85);
  animation:galleggia 5.5s ease-in-out infinite;
  transition:transform .5s cubic-bezier(.3,1.45,.5,1); }
.pr:hover .oggetto { animation-play-state:paused; }
@keyframes galleggia { 50% { translate:0 -7px; } }
.oggetto::before { content:''; position:absolute; inset:0;
  border-radius:13px; pointer-events:none;
  background:linear-gradient(calc(115deg + var(--rx) * 3),
    transparent 30%, rgba(255,255,255,.13) 47%, transparent 62%); }
.oggetto .fbrand { position:absolute; top:11px; left:13px; right:13px;
  display:flex; align-items:center; justify-content:space-between;
  font-family:var(--display); font-size:9px; font-weight:500;
  letter-spacing:.28em; text-transform:uppercase; color:var(--text-2); }
.oggetto .fbrand small { font-family:ui-monospace,Menlo,monospace;
  font-size:7.5px; letter-spacing:.2em; color:var(--text-4); }
.oggetto .banda { position:absolute; top:34px; left:0; right:0; height:3px;
  background:var(--c); box-shadow:0 0 14px var(--ca); }
.oggetto .ficon { position:absolute; left:13px; bottom:12px; width:30px;
  height:30px; border-radius:9px; display:grid; place-items:center;
  color:var(--c); background:color-mix(in srgb, var(--c) 9%, transparent);
  box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--c) 32%, transparent); }
.oggetto .ficon svg { width:16px; height:16px; fill:none;
  stroke:currentColor; stroke-width:1.6; stroke-linecap:round;
  stroke-linejoin:round; }
.oggetto .fprezzo { position:absolute; right:13px; bottom:11px;
  font-family:var(--display); font-weight:400; font-size:21px;
  letter-spacing:-.01em; color:var(--c);
  font-variant-numeric:tabular-nums; text-shadow:0 0 18px var(--ca); }
.oggetto .fnome { position:absolute; left:13px; top:46px;
  font-family:var(--display); font-weight:300; font-size:12.5px;
  letter-spacing:.02em; color:var(--text); }
.oggetto .fsotto { position:absolute; left:13px; top:64px; font-size:8.5px;
  letter-spacing:.14em; text-transform:uppercase; color:var(--text-4); }
/* sulle card piccole la faccia respira: niente sottotitolo */
.pr:not(.eroe) .oggetto .fsotto { display:none; }
.pr:not(.eroe) .oggetto .fnome { top:50%; transform:translateY(-70%); }
/* il nastro sull'angolo: segnale di prodotto (full refund), intagliato */
.oggetto .nastro { position:absolute; top:14px; right:-34px;
  transform:rotate(38deg); width:120px; text-align:center;
  background:var(--c); color:#0A0903; font-size:7.5px; font-weight:800;
  letter-spacing:.16em; text-transform:uppercase; padding:4px 0;
  box-shadow:0 4px 14px rgba(0,0,0,.4); }
/* la vendita: nome, promessa, il bottone che compra, la garanzia */
.pr .vendita { position:relative; display:flex; flex-direction:column;
  flex:1; }
.pr .pnome { display:flex; align-items:baseline; gap:9px; }
.pr .pnome .pn { font-family:var(--display); font-weight:350;
  font-size:18.5px; letter-spacing:-.005em; color:var(--text); }
.pr .pnome .pkind { font-size:8.5px; font-weight:700; letter-spacing:.18em;
  text-transform:uppercase; color:var(--c); }
.pr .promessa { margin-top:7px; font-size:12.5px; line-height:1.55;
  color:var(--text-3); }
.pr .promessa b { color:var(--text-2); font-weight:500; }
.pr .compra { margin-top:14px; display:inline-flex; align-items:center;
  justify-content:center; gap:9px; min-height:44px; padding:0 18px;
  border-radius:100px; background:var(--c); color:#0A0A05;
  font-size:12.5px; font-weight:700; letter-spacing:.02em;
  transition:transform .3s var(--ease), box-shadow .3s var(--ease);
  box-shadow:0 10px 26px -12px var(--cb); }
.pr .compra i { font-style:normal; transition:transform .3s var(--ease); }
.pr:hover .compra { transform:translateY(-1px);
  box-shadow:0 16px 34px -12px var(--cb); }
.pr:hover .compra i { transform:translateX(4px); }
.pr .rassicura { margin-top:11px; display:flex; align-items:flex-start;
  gap:8px; font-size:10.5px; line-height:1.5; color:var(--text-4); }
.pr .rassicura::before { content:'✓'; color:var(--c); font-size:11px;
  line-height:1.4; }
.pr .rassicura b { color:var(--text-3); font-weight:600; }
/* l'ammiraglia */
.pr.eroe .palcosc { height:244px; }
.pr.eroe .oggetto { width:min(250px,80%); }
.pr.eroe .oggetto .fprezzo { font-size:26px; }
.pr.eroe .oggetto .fnome { font-size:15px; top:50px; }
.pr.eroe .oggetto .fsotto { top:71px; }
.pr.eroe .pnome .pn { font-size:23px; }
.pr.eroe .promessa { font-size:13.5px; max-width:52ch; }
.pr.eroe .compra { align-self:flex-start; padding:0 24px; }
@media (max-width:1020px){ .pr.eroe .compra { align-self:stretch; } }

'''
p = p[:ia] + CSS + p[ib:]

# ── 2 · il motion d'ingresso: i prodotti calano sullo scaffale ──────────
VECCHIO = """/* l'emissione: i pass vengono STAMPATI in sequenza al reveal — la
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
  animation-delay:.46s; }"""
uno(p, VECCHIO, 'emissione imb')
p = p.replace(VECCHIO, """/* l'arrivo: i prodotti CALANO sullo scaffale in sequenza, con la molla */
@keyframes pr-arriva {
  from { opacity:0; transform:translateY(30px); }
  to { opacity:1; } }
html.vivo .pr-fila .pr { opacity:0; }
html.vivo .pr-fila.dentro .pr {
  animation:pr-arriva .75s cubic-bezier(.3,1.45,.5,1) both; }
html.vivo .pr-fila.dentro .pr:nth-child(1) { animation-delay:.05s; }
html.vivo .pr-fila.dentro .pr:nth-child(2) { animation-delay:.17s; }
html.vivo .pr-fila.dentro .pr:nth-child(3) { animation-delay:.29s; }
html.vivo .pr-fila.dentro .pr:nth-child(4) { animation-delay:.41s; }""")

RM = "  html.vivo .imb-griglia .imb { opacity:1; animation:none; } }"
uno(p, RM, 'reduced motion')
p = p.replace(RM, """  html.vivo .pr-fila .pr { opacity:1; animation:none; }
  .oggetto, .pr .ombra { animation:none !important; } }""")

# ── 3 · HTML: lo scaffale al posto dei pass ─────────────────────────────
HA = '<div class="imb-griglia coro" style="margin-top:clamp(22px,2.6vw,34px)">'
HB = '<div class="banchina sale" style="margin-top:clamp(16px,2vw,24px)">'
uno(p, HA, 'html inizio'); uno(p, HB, 'html fine')
ja, jb = p.index(HA), p.index(HB)

SCAFFALE = '''<div class="pr-fila coro" id="prScaffale" style="margin-top:clamp(22px,2.6vw,34px)">

      <a class="pr eroe" href="/property-finding.html" style="--c:var(--c-pf);--ca:rgba(255,215,0,.16);--cb:rgba(255,215,0,.45)">
        <span class="retro"></span>
        <span class="palcosc">
          <span class="ombra"></span>
          <span class="oggetto">
            <span class="fbrand">BOOM<small>PF·0350·ROME</small></span>
            <span class="banda"></span>
            <span class="fnome">Property Finding</span>
            <span class="fsotto">The private hunt</span>
            <span class="nastro">Full refund</span>
            <span class="ficon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6L20.5 20.5"/></svg></span>
            <span class="fprezzo">€350</span>
          </span>
        </span>
        <span class="vendita">
          <span class="pnome"><span class="pn">Property Finding</span>
            <span class="pkind">Flagship</span></span>
          <span class="promessa">Your private hunter on the whole Rome
            market — <b>off-market included</b>, every shortlist walked
            in person before you see it.</span>
          <span class="compra">Start the hunt · €350<i>→</i></span>
          <span class="rassicura"><span><b>Zero risk:</b> deducted on
            success, refunded in full if we don't deliver.</span></span>
        </span>
      </a>

      <a class="pr" href="/virtual-viewing.html" style="--c:var(--c-vv);--ca:rgba(0,255,136,.14);--cb:rgba(0,255,136,.4)">
        <span class="retro"></span>
        <span class="palcosc">
          <span class="ombra"></span>
          <span class="oggetto">
            <span class="fbrand">BOOM<small>VV·0089·ROME</small></span>
            <span class="banda"></span>
            <span class="fnome">Virtual Viewing</span>
            <span class="ficon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6.5" width="12" height="11" rx="2"/><path d="M15.5 11l5-2.6v7.2l-5-2.6z"/></svg></span>
            <span class="fprezzo">€89</span>
          </span>
        </span>
        <span class="vendita">
          <span class="pnome"><span class="pn">Virtual Viewing</span>
            <span class="pkind">Live</span></span>
          <span class="promessa">See any home <b>live on video</b> before
            you fly — the red flags said out loud.</span>
          <span class="compra">Book a live tour · €89<i>→</i></span>
          <span class="rassicura"><span><b>Credited</b> if you rent with
            us · BOOM homes: free, always.</span></span>
        </span>
      </a>

      <a class="pr" href="/deal-assistance.html" style="--c:var(--c-da);--ca:rgba(157,140,255,.15);--cb:rgba(157,140,255,.4)">
        <span class="retro"></span>
        <span class="palcosc">
          <span class="ombra"></span>
          <span class="oggetto">
            <span class="fbrand">BOOM<small>DA·0249·ROME</small></span>
            <span class="banda"></span>
            <span class="fnome">Deal Assistance</span>
            <span class="ficon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4l7.2 2.9v5.1c0 4.2-3 7.2-7.2 8.4-4.2-1.2-7.2-4.2-7.2-8.4V6.3z"/></svg></span>
            <span class="fprezzo">€249</span>
          </span>
        </span>
        <span class="vendita">
          <span class="pnome"><span class="pn">Deal Assistance</span>
            <span class="pkind">Protection</span></span>
          <span class="promessa">Found a home yourself? We <b>verify the
            landlord and the papers</b> — then negotiate for you.</span>
          <span class="compra">Protect the deal · €249<i>→</i></span>
          <span class="rassicura"><span><b>Fixed fee</b> — deposit and
            clauses negotiated, no percentages.</span></span>
        </span>
      </a>

      <a class="pr" href="/contract-check-express.html" style="--c:var(--c-cc);--ca:rgba(62,211,255,.13);--cb:rgba(62,211,255,.4)">
        <span class="retro"></span>
        <span class="palcosc">
          <span class="ombra"></span>
          <span class="oggetto">
            <span class="fbrand">BOOM<small>CC·0049·ROME</small></span>
            <span class="banda"></span>
            <span class="fnome">Contract Check</span>
            <span class="ficon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.2h7.4L18.6 8v12.8H6z"/><path d="M13.2 3.2V8h5.2"/></svg></span>
            <span class="fprezzo">€49</span>
          </span>
        </span>
        <span class="vendita">
          <span class="pnome"><span class="pn">Contract Check</span>
            <span class="pkind">Express</span></span>
          <span class="promessa">About to sign? A <b>written traffic-light
            verdict in 24h</b>: fine, unfair, missing.</span>
          <span class="compra">Check my contract · €49<i>→</i></span>
          <span class="rassicura"><span><b>Credited</b> in full on Deal
            Assistance.</span></span>
        </span>
      </a>
    </div>

    <script>
    /* IL TILT dello scaffale: l'oggetto si inclina verso il cursore — il
       gesto di prenderlo in mano. Solo con un mouse vero; molla al
       rilascio. Best-effort: senza elementi non fa nulla. */
    (function () {
      if (!(window.matchMedia
        && matchMedia('(hover:hover) and (pointer:fine)').matches)) return;
      document.querySelectorAll('#prScaffale .pr').forEach(function (pr) {
        var og = pr.querySelector('.oggetto');
        if (!og) return;
        pr.addEventListener('pointermove', function (e) {
          var r = pr.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - .5;
          var y = (e.clientY - r.top) / r.height - .5;
          og.style.setProperty('--rx', (x * 16) + 'deg');
          og.style.setProperty('--ry', (-y * 12) + 'deg');
        });
        pr.addEventListener('pointerleave', function () {
          og.style.setProperty('--rx', '0deg');
          og.style.setProperty('--ry', '0deg');
        });
      });
    })();
    </script>

    <div class="banchina sale" style="margin-top:clamp(16px,2vw,24px)">'''
p = p[:ja] + SCAFFALE + p[jb:]

# la generazione precedente non sopravvive da nessuna parte
for morto in ['imb-griglia', 'imb-pila', 'class="imb', 'imb-perfo',
              'imb-testa', 'imb-corpo', 'imb-stub', 'imb-rotta',
              'imb-lista', 'imb-fascia', 'imb-emesso', '.tess', 'pflap']:
    assert morto not in p, 'sopravvissuto: ' + morto
assert p.count('class="pr eroe"') == 1
assert p.count('class="compra"') == 4
assert p.count('class="rassicura"') == 4

scrivi('pt.html', p)
print('L14B3: lo Scaffale e\' montato')
