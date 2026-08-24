#!/usr/bin/env python3
# LA CONSOLE — il livello superiore del Colloquio. La conversazione resta
# la spina dorsale (scelta del fondatore), ma smette di essere un
# monologo travestito da dialogo: le otto obiezioni VERE diventano righe
# di una console e il visitatore APRE quelle che gli interessano. Ogni
# risposta porta dentro la sua prova (tabella truffe, finder+orologio,
# sala delle regole romane, clausole verbatim, conto, kit toccabile).
# Effetti: la pagina e' CORTA di default (le 20,8 schermate della 8.0
# crollano) e PROFONDA su richiesta; il lettore ha agenzia; il progresso
# «n/8 risposte» e' la ricompensa onesta. Righe = <details> NATIVI:
# testo nel DOM per i motori, accessibile, e funzionante senza JS.
# Base: property-finding.html (hero-biglietto INTATTO).
import sys

SRC = 'property-finding.html'
OUT = 'preview-pfs-colloquio.html'


def uno(s, ago, dove=SRC):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO in {dove}: {n} occorrenze di {ago[:70]!r}')
        sys.exit(1)


s = open(SRC, encoding='utf-8').read()


def estrai(inizio):
    uno(s, inizio)
    a = s.index(inizio)
    b = s.index('</section>', a)
    blocco = s[a:b].rstrip()
    assert blocco.endswith('</div>'), inizio
    return blocco[:-len('</div>')].rstrip()


REGOLA = estrai('<div class="regola2 sale">')
CONTO = estrai('<div class="conto sale">')
FINDER = estrai('<div class="finder quadro" id="finder"')
FINDER = FINDER[:FINDER.index('<div class="macchina sale" id="macchinaBox">')].rstrip()
PASSI = estrai('<div class="passi4 sale coro">')
TOCCA = estrai('<div class="tocca sale">')
VERIFICA = estrai('<div class="verifica sale">')
uno(s, '<div class="inclusi sale">')
_a = s.index('<div class="inclusi sale">')
_b = s.index('<div class="diverso quadro sale"', _a)
INCLUSI = s[_a:_b].rstrip()
assert INCLUSI.endswith('</div>'), 'inclusi'

CSS_ANCORA = ".imbarco-garanzia::before { content:'✓'; color:var(--gold); }"
CSS = CSS_ANCORA + """

/* ══ LA LASTRA — il patto in un respiro ══════════════════════════════ */
.lastra { position:relative; padding:clamp(52px,7vw,96px) 0;
  background:#020202; box-shadow:inset 0 1px 0 rgba(255,215,0,.14),
    inset 0 -1px 0 rgba(255,215,0,.14); }
.lastra-eti { font-size:9.5px; font-weight:700; letter-spacing:.34em;
  text-transform:uppercase; color:var(--text-3); }
.lastra-frase { margin-top:clamp(18px,2.4vw,28px);
  font-family:var(--display); font-weight:200;
  font-size:clamp(23px,3.5vw,50px); line-height:1.14;
  letter-spacing:-.022em; max-width:27ch; }
.lastra-frase .lp { display:block; }
.lastra-frase .lp + .lp { margin-top:.16em; }
.lastra-frase b { font-weight:300; color:var(--gold); }
.lastra-frase .lp.oro { color:var(--gold); }
.lastra-frase .lp.oro b { color:var(--text); }
.lastra-nota { margin-top:clamp(18px,2.4vw,26px); font-size:11px;
  letter-spacing:.14em; text-transform:uppercase; color:var(--text-3); }
@media (prefers-reduced-motion:no-preference){
  html.vivo .lastra .lp { opacity:0; filter:blur(9px);
    transform:translateY(14px); }
  html.vivo .lastra.accesa .lp { opacity:1; filter:none; transform:none;
    transition:opacity .6s ease, filter .7s ease,
      transform .8s cubic-bezier(.22,1,.36,1); }
  html.vivo .lastra.accesa .lp:nth-child(1) { transition-delay:.05s; }
  html.vivo .lastra.accesa .lp:nth-child(2) { transition-delay:.32s; }
  html.vivo .lastra.accesa .lp:nth-child(3) { transition-delay:.59s; }
  html.vivo .lastra.accesa .lp:nth-child(4) { transition-delay:.86s; }
  html.vivo .lastra.accesa .lp:nth-child(5) { transition-delay:1.18s; }
}

/* ══ LA CONSOLE — le domande le fai tu ═══════════════════════════════ */
.console { margin-top:clamp(26px,3.4vw,44px); border-radius:18px;
  background:linear-gradient(180deg, rgba(255,255,255,.028),
    rgba(255,255,255,.008));
  box-shadow:inset 0 0 0 1px var(--line), 0 40px 90px rgba(0,0,0,.45);
  overflow:hidden; }
.cs-capo { display:flex; align-items:center; gap:14px 20px;
  flex-wrap:wrap; padding:clamp(14px,1.8vw,20px) clamp(16px,2.2vw,26px);
  border-bottom:1px solid var(--line); }
.cs-stato { font-size:9.5px; font-weight:700; letter-spacing:.24em;
  text-transform:uppercase; color:var(--text-3); }
.cs-stato b { color:var(--gold); }
.cs-seg { display:flex; gap:5px; flex:1; }
.cs-seg i { flex:1; max-width:38px; height:2px; border-radius:2px;
  background:rgba(255,255,255,.13);
  transition:background .45s ease, box-shadow .45s ease; }
.cs-seg i.acceso { background:var(--gold);
  box-shadow:0 0 8px rgba(255,215,0,.5); }
.cs-invito { font-size:10.5px; color:var(--text-3);
  letter-spacing:.02em; }
.riga { border-bottom:1px solid var(--line-0); }
.riga:last-of-type { border-bottom:0; }
.riga > summary { list-style:none; cursor:pointer; position:relative;
  display:grid; align-items:center; gap:4px 16px;
  grid-template-columns:38px minmax(0,1fr) auto 26px;
  padding:clamp(15px,1.9vw,21px) clamp(16px,2.2vw,26px);
  transition:background .3s ease; }
.riga > summary::-webkit-details-marker { display:none; }
.riga > summary:hover { background:rgba(255,215,0,.035); }
.riga > summary:focus-visible { outline:2px solid var(--gold);
  outline-offset:-2px; }
.r-num { font-family:var(--display); font-weight:250; font-size:13px;
  letter-spacing:.1em; color:rgba(255,215,0,.5);
  transition:color .3s ease; }
.r-tema { grid-column:2; font-size:8.5px; font-weight:700;
  letter-spacing:.26em; text-transform:uppercase; color:var(--text-3); }
.r-q { grid-column:2; font-family:var(--display); font-weight:250;
  font-size:clamp(16px,1.85vw,23px); line-height:1.24;
  letter-spacing:-.01em; color:var(--text); text-wrap:balance;
  transition:color .3s ease; }
.r-colpo { grid-column:3; grid-row:1/3; align-self:center;
  font-family:var(--display); font-weight:200;
  font-size:clamp(20px,2.4vw,32px); line-height:1; color:var(--gold);
  letter-spacing:-.02em; white-space:nowrap; opacity:.85; }
.r-piu { grid-column:4; grid-row:1/3; align-self:center; width:22px;
  height:22px; position:relative; justify-self:end; border-radius:50%;
  box-shadow:inset 0 0 0 1px var(--line); transition:box-shadow .3s ease,
    transform .4s cubic-bezier(.22,1,.36,1); }
.r-piu::before, .r-piu::after { content:''; position:absolute;
  left:50%; top:50%; width:9px; height:1.5px; background:var(--text-2);
  transform:translate(-50%,-50%); transition:opacity .3s ease,
    background .3s ease; }
.r-piu::after { transform:translate(-50%,-50%) rotate(90deg); }
.riga[open] > summary .r-piu { transform:rotate(180deg);
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.5); }
.riga[open] > summary .r-piu::after { opacity:0; }
.riga[open] > summary .r-piu::before { background:var(--gold); }
.riga[open] > summary { background:rgba(255,215,0,.045); }
.riga[open] > summary .r-num { color:var(--gold); }
.riga[open] > summary .r-q { color:var(--gold); }
.riga.risposta > summary .r-num::after { content:' ✓'; color:var(--gold); }
.r-corpo { padding:clamp(6px,1vw,10px) clamp(16px,2.2vw,26px)
  clamp(24px,3vw,38px); }
@media (min-width:900px){ .r-corpo { padding-left:80px;
  padding-right:clamp(30px,4vw,60px); } }
@media (prefers-reduced-motion:no-preference){
  .riga[open] .r-corpo { animation:apri .55s cubic-bezier(.22,1,.36,1); }
  @keyframes apri { from { opacity:0; transform:translateY(-10px); } } }
.r-lead { font-family:var(--display); font-weight:250;
  font-size:clamp(19px,2.2vw,28px); line-height:1.3;
  letter-spacing:-.01em; max-width:26ch; }
.r-lead b { font-weight:300; color:var(--gold); }
.r-det { margin-top:14px; font-size:14.5px; line-height:1.78;
  color:var(--text-2); max-width:60ch; }
.r-det b { color:var(--text); font-weight:600; }
.r-det + .r-det { margin-top:11px; }
.prove { margin-top:16px; display:flex; gap:8px; flex-wrap:wrap; }
.prove a { display:inline-flex; align-items:center; gap:7px;
  padding:9px 15px; font-size:11.5px; font-weight:600;
  color:var(--text-2); text-decoration:none; border-radius:100px;
  box-shadow:inset 0 0 0 1px var(--line);
  transition:color .3s ease, box-shadow .3s ease, transform .3s ease; }
.prove a:hover { color:var(--gold);
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.4);
  transform:translateY(-1px); }
.prove a i { font-style:normal; color:var(--gold); }
.reperto-eti { margin:clamp(24px,3vw,34px) 0 14px; display:flex;
  align-items:center; gap:12px; }
.reperto-eti b { flex:none; padding:5px 11px; font-size:9.5px;
  font-weight:700; letter-spacing:.22em; text-transform:uppercase;
  color:var(--gold); border-radius:3px;
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.4); }
.reperto-eti span { font-size:10.5px; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase; color:var(--text-3); }
.reperto-eti::after { content:''; flex:1; height:1px;
  background:linear-gradient(90deg, var(--line), transparent); }
/* l'invito che compare quando ne hai aperte abbastanza */
.cs-basta { display:none; align-items:center; gap:14px 20px;
  flex-wrap:wrap; padding:clamp(16px,2.1vw,24px) clamp(16px,2.2vw,26px);
  background:rgba(255,215,0,.06);
  border-top:1px solid rgba(255,215,0,.22); }
.cs-basta.viva { display:flex;
  animation:apri .6s cubic-bezier(.22,1,.36,1); }
.cs-basta p { flex:1 1 260px; font-family:var(--display);
  font-weight:250; font-size:clamp(17px,2vw,24px); line-height:1.24;
  letter-spacing:-.01em; }
.cs-basta p b { color:var(--gold); font-weight:250; }
@media (max-width:620px){
  .riga > summary { grid-template-columns:30px minmax(0,1fr) 22px; }
  .r-colpo { grid-column:2; grid-row:3; justify-self:start;
    font-size:26px; margin-top:6px; opacity:1; }
  .r-piu { grid-column:3; grid-row:1/3; }
}

/* ══ LA CHIUSURA ═════════════════════════════════════════════════════ */
.chiusa-blocco { text-align:center; }
.chiusa-blocco h2 { font-family:var(--display); font-weight:200;
  font-size:clamp(30px,5vw,60px); line-height:1.08;
  letter-spacing:-.022em; }
.chiusa-blocco h2 span { color:var(--gold); }
.chiusa-blocco .btn-primary { margin-top:clamp(20px,2.6vw,30px); }
.chiusa-nota { margin-top:16px; font-size:11.5px; color:var(--text-3);
  letter-spacing:.02em; }

/* ══ LA SALA DELLE REGOLE — l'expertise locale ══════════════════════ */
.sala { margin-top:clamp(16px,2.2vw,24px); display:grid;
  gap:clamp(10px,1.4vw,16px);
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }
.regolaR { position:relative; padding:clamp(17px,2.1vw,24px);
  background:var(--card); border-radius:14px;
  box-shadow:inset 0 0 0 1px var(--line); overflow:hidden; }
.regolaR::before { content:''; position:absolute; left:0; right:0;
  top:0; height:1px; background:linear-gradient(90deg,
    var(--gold), rgba(255,215,0,.05)); }
.rr-capo { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.rr-num { font-family:var(--display); font-weight:250; font-size:13px;
  letter-spacing:.12em; color:rgba(255,215,0,.55); }
.rr-fonte { padding:3px 8px; font-size:8.5px; font-weight:700;
  letter-spacing:.2em; text-transform:uppercase; color:var(--text-3);
  border-radius:3px; box-shadow:inset 0 0 0 1px var(--line); }
.rr-fonte.legge { color:var(--gold);
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.35); }
.regolaR h4 { margin-top:11px; font-family:var(--display);
  font-weight:250; font-size:clamp(17px,1.75vw,21px); line-height:1.22;
  letter-spacing:-.01em; }
.rr-trappola { margin-top:9px; font-size:12.5px; line-height:1.6;
  color:var(--text-3); }
.rr-noi { margin-top:12px; padding-top:11px; font-size:12.5px;
  line-height:1.6; color:var(--text-2);
  border-top:1px solid var(--line-0); }
.rr-noi::before { content:'BOOM'; display:block; margin-bottom:4px;
  font-size:8.5px; font-weight:700; letter-spacing:.24em;
  color:var(--gold); }
.rr-noi b { color:var(--text); font-weight:600; }
.sala-nota { margin-top:14px; font-size:11px; color:var(--text-3);
  line-height:1.6; max-width:78ch; }
.sala-nota a { color:var(--text-2); }

/* ══ L'OROLOGIO DEL RADAR ════════════════════════════════════════════ */
.orolo { position:relative; margin-bottom:clamp(14px,2vw,20px);
  padding:clamp(14px,2vw,20px) clamp(16px,2.2vw,24px);
  background:linear-gradient(180deg, rgba(255,215,0,.035),
    rgba(255,215,0,.006)); border-radius:14px;
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.16); overflow:hidden; }
.orolo-griglia { display:grid; gap:12px 26px;
  grid-template-columns:repeat(auto-fit,minmax(148px,1fr));
  align-items:end; }
.oro-cella { display:grid; gap:5px; }
.oro-eti { font-size:9px; font-weight:700; letter-spacing:.24em;
  text-transform:uppercase; color:var(--text-3); }
.oro-val { font-family:var(--display); font-weight:250;
  font-size:clamp(22px,2.6vw,34px); line-height:1; color:var(--gold);
  letter-spacing:.01em; font-variant-numeric:tabular-nums; }
.oro-val small { font-size:.44em; font-weight:400; color:var(--text-2);
  letter-spacing:.06em; margin-left:.25em; }
.oro-barra { margin-top:clamp(13px,1.8vw,18px); height:2px;
  border-radius:2px; background:rgba(255,255,255,.09);
  overflow:hidden; }
.oro-barra i { display:block; height:100%; width:0%;
  background:linear-gradient(90deg, rgba(255,215,0,.35), var(--gold));
  box-shadow:0 0 10px rgba(255,215,0,.45); }
.orolo.batte { box-shadow:inset 0 0 0 1px rgba(255,215,0,.55),
  0 0 34px rgba(255,215,0,.12); }
.oro-nota { margin-top:11px; font-size:10.5px; color:var(--text-3);
  letter-spacing:.02em; line-height:1.6; }
.oro-vivo { display:inline-flex; align-items:center; gap:6px; }
.oro-vivo::before { content:''; width:6px; height:6px; border-radius:50%;
  background:var(--gold); box-shadow:0 0 8px rgba(255,215,0,.7);
  animation:oropulsa 2.4s ease-in-out infinite; }
@keyframes oropulsa { 0%,100% { opacity:1; } 50% { opacity:.25; } }
@media (prefers-reduced-motion:reduce){
  .oro-vivo::before { animation:none; } }

/* ══ LE CLAUSOLE ═════════════════════════════════════════════════════ */
.clausola { max-width:820px; padding:clamp(20px,2.6vw,30px);
  background:var(--card); border-radius:14px; position:relative;
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.clausola::before { content:'\\00A7'; position:absolute; right:18px;
  top:8px; font-family:var(--display); font-weight:200; font-size:60px;
  color:rgba(255,215,0,.08); line-height:1; }
.clausola blockquote { margin:0; font-size:14.5px; line-height:1.85;
  color:var(--text-2); }
.clausola blockquote b { color:var(--text); }
.clausola cite { display:block; margin-top:10px; font-style:normal;
  font-size:10px; font-weight:700; letter-spacing:.22em;
  text-transform:uppercase; color:var(--gold); }
.clausola + .clausola { margin-top:12px; }
.verifica-righe { margin-top:14px; display:flex; gap:10px 22px;
  flex-wrap:wrap; }
.verifica-righe a { font-size:12px; color:var(--text-3);
  text-decoration:none; transition:color .3s ease; }
.verifica-righe a:hover { color:var(--gold); }

/* ══ L'HERO: i quattro passi + il biglietto che si convalida ═════════ */
.hero-passi { margin-top:16px; display:flex; align-items:center;
  gap:7px 10px; flex-wrap:wrap; font-size:10px; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase; color:var(--text-3);
  max-width:56ch; }
.hero-passi b { color:var(--gold); font-weight:700; margin-right:2px; }
.hero-passi i { font-style:normal; color:rgba(255,215,0,.45); }
.ck-pronto { position:absolute; right:clamp(16px,1.8vw,22px);
  top:-13px; z-index:4; background:#0B0B0C; display:inline-flex;
  align-items:center; gap:6px; padding:5px 10px; font-size:8.5px;
  font-weight:800; letter-spacing:.2em; text-transform:uppercase;
  color:var(--gold); border-radius:100px;
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.45),
    0 6px 20px rgba(0,0,0,.55); opacity:0; transform:translateY(-4px);
  transition:opacity .4s ease, transform .5s cubic-bezier(.22,1,.36,1);
  pointer-events:none; }
.ck-pronto::before { content:'✓'; letter-spacing:0; }
#ckForm.pronto .ck-pronto { opacity:1; transform:none; }
#ckForm.pronto .ck-barcode { opacity:.7; transition:opacity .5s ease; }
#ckForm.pronto .ck-vai { box-shadow:0 0 0 1px rgba(255,215,0,.5),
  0 14px 40px rgba(255,215,0,.18); transition:box-shadow .5s ease; }

/* ══ LA BARRA — la cassa a un tap, sempre ════════════════════════════ */
.hud { position:fixed; left:0; right:0; bottom:0; z-index:110;
  display:flex; align-items:center; gap:clamp(10px,2vw,22px);
  padding:9px clamp(14px,3vw,28px)
    calc(9px + env(safe-area-inset-bottom, 0px));
  background:rgba(5,5,5,.84); backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
  border-top:1px solid rgba(255,215,0,.14); transform:translateY(110%);
  transition:transform .5s cubic-bezier(.22,1,.36,1); }
.hud.su { transform:none; }
.hud-stato { flex:1; font-size:9.5px; font-weight:700;
  letter-spacing:.2em; text-transform:uppercase; color:var(--text-3);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hud-stato b { color:var(--gold); }
.hud-vai { flex:none; display:inline-flex; align-items:baseline; gap:7px;
  padding:9px 16px; font-size:11px; font-weight:800;
  letter-spacing:.08em; color:#0A0A05; background:var(--gold);
  border-radius:100px; text-decoration:none; white-space:nowrap; }
.hud-vai small { font-size:9px; font-weight:700; opacity:.7; }
@media (prefers-reduced-motion:reduce){ .hud { transition:none; } }"""

# ── i reperti confezionati ───────────────────────────────────────────────
OROLOGIO = """<div class="orolo" id="orolo" aria-label="The scanner's schedule, live">
      <div class="orolo-griglia">
        <div class="oro-cella"><span class="oro-eti">Rome time</span>
          <span class="oro-val" id="oroT">--:--:--</span></div>
        <div class="oro-cella"><span class="oro-eti">Sweeps since midnight</span>
          <span class="oro-val" id="oroN">--<small>/96 today</small></span></div>
        <div class="oro-cella"><span class="oro-eti">Next sweep in</span>
          <span class="oro-val" id="oroC">--:--</span></div>
      </div>
      <div class="oro-barra"><i id="oroB"></i></div>
      <p class="oro-nota"><span class="oro-vivo">The inbox sweep runs every
        15 minutes, day and night</span> — derived from our production
        schedule, not a live feed of results.</p>
    </div>

    """

SALA = """<div class="reperto-eti sale"><b>Exhibit</b>
      <span>What a Rome local knows that a platform doesn't</span></div>
    <div class="sala sale">
      <div class="regolaR">
        <div class="rr-capo"><span class="rr-num">R01</span>
          <span class="rr-fonte legge">Territorial agreement</span></div>
        <h4>Rome's negotiated-rent bands</h4>
        <p class="rr-trappola">The 2023 Rome agreement fixes €/m² bands per
          zone. Ask the wrong rent and the contract can't be attested — you
          pay more and lose the tax break.</p>
        <p class="rr-noi">We compute the attestable band for your flat
          before you sign — <b>75 zones, the official coefficients</b> — and
          negotiate against it.</p>
      </div>
      <div class="regolaR">
        <div class="rr-capo"><span class="rr-num">R02</span>
          <span class="rr-fonte legge">Italian law</span></div>
        <h4>Deposit: three months, maximum</h4>
        <p class="rr-trappola">Anything above is not enforceable — and
          “non-refundable deposit” is not a thing.</p>
        <p class="rr-noi">We push for <b>two</b>, in writing, with the return
          terms named in the contract.</p>
      </div>
      <div class="regolaR">
        <div class="rr-capo"><span class="rr-num">R03</span>
          <span class="rr-fonte legge">Landlord's duty</span></div>
        <h4>Registered within 30 days — or it doesn't exist</h4>
        <p class="rr-trappola">An unregistered lease gives you no legal
          protection <b>and no residency</b>: the paperwork chain breaks at
          the first office.</p>
        <p class="rr-noi">We register it and hand you the <b>protocol
          number</b> — the dossier is prepared while you sign.</p>
      </div>
      <div class="regolaR">
        <div class="rr-capo"><span class="rr-num">R04</span>
          <span class="rr-fonte">€5 · public registry</span></div>
        <h4>Whoever rents it must own it</h4>
        <p class="rr-trappola">The fake-landlord scam dies with one document:
          the <b>visura catastale</b> names the real owner. It costs five
          euros. Almost nobody asks.</p>
        <p class="rr-noi">We pull it <b>before</b> the viewing, not after the
          deposit.</p>
      </div>
      <div class="regolaR">
        <div class="rr-capo"><span class="rr-num">R05</span>
          <span class="rr-fonte legge">L. 431/98 art. 5</span></div>
        <h4>A transitional lease needs a documented reason</h4>
        <p class="rr-trappola">The wrong contract type for your stay is the
          most common “legal” trap for foreigners — challengeable later,
          which helps nobody once you live there.</p>
        <p class="rr-noi">We pick the right form — transitional, student, 4+4
          — and prepare the <b>attestation</b> that makes it hold.</p>
      </div>
      <div class="regolaR">
        <div class="rr-capo"><span class="rr-num">R06</span>
          <span class="rr-fonte">Handover</span></div>
        <h4>The keys day is a document, not a handshake</h4>
        <p class="rr-trappola">No meter readings, no photos, no signed state
          of the flat — and the deposit argument, months later, is your word
          against theirs.</p>
        <p class="rr-noi">We sign a <b>verbale di consegna</b> on the spot:
          readings, photos, condition — emailed to both sides before we
          leave the building.</p>
      </div>
    </div>
    <p class="sala-nota sale">Rules and duties as published on our own pages:
      the <a href="/welcome-to-rome">expat guide</a> and the
      <a href="/blog-scam-bible.html">scam guide</a>. This is the part no
      platform localises for you.</p>"""

CLAUSOLE = """<div class="clausola sale">
      <blockquote>PFS costs €350 (fixed fee). If we do not present at least
        <b>3 options matching your agreed criteria within 15 days</b>, the
        €350 is <b>refunded in full</b>. On success it is <b>deducted from
        the agency fee</b>.</blockquote>
      <cite>Terms of Service — §4.2 Property Finding Service</cite>
    </div>
    <div class="clausola sale">
      <blockquote>For the Property Finding Service, Section 4.2 prevails over
        this section: … the €350 is refunded in full — <b>no admin fee
        applies</b>.</blockquote>
      <cite>Terms of Service — §7.1-bis Cancellation carve-out</cite>
    </div>"""

VERIF = VERIFICA + """

    <div class="verifica-righe sale">
      <a href="/terms.html">Egidi Immobiliare S.r.l. — P.IVA 17322991005 →</a>
      <a href="https://euipo.europa.eu/eSearch/#details/trademarks/019317594"
        target="_blank" rel="noopener">EU trademark 019317594 on EUIPO ↗</a>
      <a href="/blog-scam-bible.html">Our Rome rental scam guide →</a>
    </div>

    """ + SALA


def reperto(eti, corpo):
    if not corpo:
        return ''
    return (f'\n      <div class="reperto-eti sale"><b>Exhibit</b>'
            f'<span>{eti}</span></div>\n      {corpo}')


RIGHE = [
    ('q1', 'The product', 'What exactly do I get for the €350?', '24h',
     'A hunt, a hunter —<br>and everything <b>to the keys</b>.',
     ["""Five lines, then <b>I call you</b>: fifteen minutes, brutal about
        what your budget really buys in your zones. The search arms within
        24 hours. I walk the shortlist in person — live on video if you're
        abroad — negotiate rent and terms, then handle contract, utilities
        and codice fiscale. On success the €350 <b>comes off my fee</b>."""],
     '', 'The itinerary — and everything included',
     PASSI + '\n\n      ' + INCLUSI),

    ('q2', 'The price', 'Is the €350 an extra cost?', '€0',
     'No. It\'s <b>my fee, paid early</b>.',
     ["""On success it's deducted from the agency fee — one month's rent or
        10% of the annual rent, <b>whichever is lower</b> (§4.1). So the hunt
        adds nothing to what you'd pay anyway. If I don't deliver, it comes
        back in full (§4.2). No viewing fees, no application fees (§4.3)."""],
     '<a href="/terms.html" target="_blank" rel="noopener">Our fees, '
     'in writing — Terms §4 <i>→</i></a>', '', ''),

    ('q3', 'The machine', 'Can you really access off-market apartments?',
     '96',
     'Yes — and the portals are watched<br><b>every fifteen minutes</b> anyway.',
     ["""Off-market means landlords and building administrators we've worked
        with for years: homes that never reach a portal. On top of that, a
        scanner reads the public market on a production schedule and scores
        everything against your five lines — <b>under sixty never touches
        your phone</b>. Agency relistings are stored, never pushed: I won't
        send you to pay someone else's commission."""],
     '', 'The scanner and the finder — real weights, real schedules',
     OROLOGIO + FINDER),

    ('q4', 'The rule',
     'Why would I pay €350 upfront? Every guide says never.', '100%',
     'Keep following that rule.<br>This is <b>mechanically different</b>.',
     ["""That rule protects you from strangers asking for wire transfers to
        “hold” a flat — <b>we teach it ourselves</b>, in our own scam guide.
        Here you pay a registered Italian company by card: receipted,
        chargeback-protected, against a <b>written contract term</b>. Not
        goodwill — a clause."""],
     '<a href="/blog-scam-bible.html">Our scam guide — 7 patterns, '
     '35+ red flags <i>→</i></a>', 'The scam pattern vs this service',
     REGOLA),

    ('q5', 'The distance', 'I\'m not in Italy yet — does it still work?',
     '0',
     'Good.<br>It\'s built for <b>exactly that</b>.',
     ["""Viewings happen <b>live on video</b> — I walk, you watch and ask.
        The contract is signed from your phone. Utilities and codice fiscale
        are handled before you land. Matches arrive in your private app;
        confirmed visits land in Apple Wallet. Don't take my word for any of
        it — touch all three."""],
     '', 'Touch it before you pay', TOCCA),

    ('q6', 'The counterpart', 'How do I know BOOM is legitimate?', '4.9★',
     'Don\'t trust me.<br><b>Check me.</b>',
     ["""Egidi Immobiliare S.r.l. — P.IVA 17322991005, REA RM-1710623, office
        in Via dei Coronari 181. An EU trademark you can look up yourself. 47
        Google reviews. Every payment through Stripe with a receipt —
        <b>never a bank transfer to an individual</b>.""",
      """Then there's the half no platform can copy: <b>Rome's own rules</b>.
        Which contract holds, what the negotiated bands allow, what must be
        registered and by when."""],
     '', '', VERIF),

    ('q7', 'The market', 'Is Rome really that brutal?', '24–72h',
     'Rome isn\'t chaotic.<br>Rome is <b>asymmetric</b>.',
     ["""A good flat survives <b>24–72 hours</b>; the good private listing
        collects dozens of enquiries within hours — and from another timezone
        you join that queue while you sleep. Much of what you scroll is the
        same flat re-posted by competing agencies. The best homes never reach
        the portals at all."""],
     '', 'What searching alone costs', CONTO),

    ('q8', 'The guarantee', 'What if you don\'t find anything?', '§4.2',
     'Then it costs you nothing —<br>and that\'s a <b>contract term</b>.',
     ["""Fifteen days is the <b>refund trigger, not a delivery date</b>: the
        right home takes days, sometimes weeks, and we don't stop until
        you're settled. “Three options” means the criteria <b>agreed with you
        in writing</b> on the first call. And I can't invent supply — if your
        brief can't exist in Rome at your budget, I say so on that call."""],
     '<a href="/terms.html" target="_blank" rel="noopener">Read the full '
     'terms <i>→</i></a>', 'The clause, verbatim', CLAUSOLE),
]

righe_html = []
for i, (rid, tema, dom, colpo, lead, dets, prove, rep_eti, rep) in enumerate(RIGHE):
    corpo_det = '\n      '.join(f'<p class="r-det">{d}</p>' for d in dets)
    chips = f'\n      <div class="prove">{prove}</div>' if prove else ''
    righe_html.append(f"""<details class="riga" id="{rid}">
      <summary>
        <span class="r-num">{i + 1:02d}</span>
        <span class="r-tema">{tema}</span>
        <span class="r-q">{dom}</span>
        <span class="r-colpo">{colpo}</span>
        <span class="r-piu" aria-hidden="true"></span>
      </summary>
      <div class="r-corpo">
      <p class="r-lead">{lead}</p>
      {corpo_det}{chips}{reperto(rep_eti, rep)}
      </div>
    </details>""")

NUOVO = """<!-- ══ LA LASTRA — il patto in un respiro ═══════════════════════════════ -->
<section class="lastra" id="lastra">
  <div class="container">
    <p class="lastra-eti">The deal, in one breath</p>
    <p class="lastra-frase">
      <span class="lp">You pay <b>€350</b>.</span>
      <span class="lp">I hand you <b>three homes</b> in your criteria,
        <b>within 15 days</b>.</span>
      <span class="lp">If I don't — <b>you get the €350 back</b>. In full.</span>
      <span class="lp">If I do — <b>it comes off my fee</b>.</span>
      <span class="lp oro">Either way: <b>you don't lose money</b>.</span>
    </p>
    <p class="lastra-nota">Terms §4.2 · §7.1-bis</p>
  </div>
</section>

<!-- ══ LA CONSOLE — le domande le fa il visitatore ══════════════════════ -->
<section class="section" id="console">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>The interrogation</span>
      <h2 class="titolo">You should be sceptical.<br>
        <span class="hl">So ask me anything.</span></h2>
      <p class="sotto">The eight questions clients actually ask before
        paying. <b>Open the ones you care about</b> — every answer carries
        its evidence, and nothing here is a claim you can't check.</p>
    </div>
    <div class="console sale" id="cons">
      <div class="cs-capo">
        <span class="cs-stato" id="csStato"><b>0</b>/8 answered</span>
        <span class="cs-seg" id="csSeg" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <span class="cs-invito">Tap a question →</span>
      </div>
      """ + '\n      '.join(righe_html) + """
      <div class="cs-basta" id="csBasta">
        <p>Enough? <b>Five lines and I start.</b></p>
        <a class="btn btn-primary" href="#checkin">Board the hunt · €350 ↑</a>
      </div>
    </div>
  </div>
</section>

<!-- ══ LA CHIUSURA ══════════════════════════════════════════════════════ -->
<section class="section section-dark" id="chiusura">
  <div class="container chiusa-blocco sale">
    <h2>Rome takes a day.<br><span>Your brief takes five lines.</span></h2>
    <a class="btn btn-primary" href="#checkin">Board the hunt · €350 ↑</a>
    <p class="chiusa-nota">Deducted from the fee on success · refunded in
      full if we don't deliver — Terms §4.2 · Card via Stripe to Egidi
      Immobiliare S.r.l.</p>
  </div>
</section>

"""

# ── demolizione: via i sette atti, l'imbarco e la vecchia FAQ ────────────
D0M = '<!-- ══ IL CONTO'
D1M = "<script>\n/* IL CHECK-IN: dal boarding pass alla Checkout Stripe."
uno(s, D0M)
uno(s, D1M)
s = s[:s.index(D0M)] + NUOVO + s[s.index(D1M):]

uno(s, CSS_ANCORA)
s = s.replace(CSS_ANCORA, CSS)

# hero: i quattro passi + il talloncino che si convalida
SOTTO = "€350 back</b> (Terms §4.2).</p>"
uno(s, SOTTO)
s = s.replace(SOTTO, SOTTO + """
      <div class="hero-passi" aria-label="What the €350 buys, in four steps">
        <span><b>01</b> Brief — five lines</span><i>→</i>
        <span><b>02</b> The hunt — off-market + every portal</span><i>→</i>
        <span><b>03</b> Viewings — live on video</span><i>→</i>
        <span><b>04</b> Contract — from your phone</span>
      </div>""")
uno(s, '<div class="ck-stub">')
s = s.replace('<div class="ck-stub">',
    '<div class="ck-stub">\n        <span class="ck-pronto" role="status"'
    ' aria-live="polite">Ready to board</span>')
uno(s, '<a class="salta" href="#perche">')
s = s.replace('<a class="salta" href="#perche">', '<a class="salta" href="#lastra">')

# il filo del volo segue le tre stazioni nuove
TAPPE_A = ("var TAPPE = ['conto', 'regola', 'macchina', 'tocca', 'verifica',"
           "\n    'imbarco', 'faq'];")
uno(s, TAPPE_A)
s = s.replace(TAPPE_A, "var TAPPE = ['lastra', 'console', 'chiusura'];")

CODA_A = '</script>\n\n<footer class="footer">'
uno(s, CODA_A)
s = s.replace(CODA_A, """</script>

<div class="hud" id="hud" aria-label="Your progress and the check-in">
  <span class="hud-stato" id="hudStato">Eight questions · <b>tap one</b></span>
  <a class="hud-vai" href="#checkin" id="hudVai">Board · €350
    <small>↩ §4.2</small></a>
</div>
<script>
/* LA CONSOLE — il progresso e' del visitatore: ogni domanda aperta
   accende un segmento, e dopo due arriva l'invito. Righe <details>
   native: senza JS restano perfettamente apribili. */
(function () {
  'use strict';
  var cons = document.getElementById('cons');
  if (!cons) return;
  var righe = [].slice.call(cons.querySelectorAll('.riga'));
  var seg = [].slice.call(cons.querySelectorAll('#csSeg i'));
  var stato = document.getElementById('csStato');
  var basta = document.getElementById('csBasta');
  var hudS = document.getElementById('hudStato');
  var viste = {};
  function conta() {
    var n = 0;
    righe.forEach(function (r, i) {
      if (r.open) { r.classList.add('risposta'); n++; }
      seg[i].classList.toggle('acceso', r.classList.contains('risposta'));
    });
    var fatte = righe.filter(function (r) {
      return r.classList.contains('risposta'); }).length;
    stato.innerHTML = '<b>' + fatte + '</b>/8 answered';
    if (hudS) hudS.innerHTML = fatte
      ? '<b>' + fatte + '</b>/8 answered — the evidence is open'
      : 'Eight questions · <b>tap one</b>';
    if (fatte >= 2) basta.classList.add('viva');
  }
  righe.forEach(function (r) {
    r.addEventListener('toggle', function () {
      if (r.open) {
        [].forEach.call(r.querySelectorAll('.sale'), function (e) {
          e.classList.add('dentro');
        });
        if (!viste[r.id]) {
          viste[r.id] = 1;
          try { gtag('event', 'pfs_q_open', { q: r.id }); } catch (e) {}
        }
      }
      conta();
    });
  });
  conta();
})();
</script>
<script>
/* L'OROLOGIO DEL RADAR — l'automazione resa visibile. Derivato dalla
   pianificazione di produzione (ogni 15 minuti, vercel.json) e la pagina
   lo dichiara. Fermo fuori vista e a scheda nascosta. */
(function () {
  'use strict';
  var box = document.getElementById('orolo');
  if (!box) return;
  var eT = document.getElementById('oroT'), eN = document.getElementById('oroN');
  var eC = document.getElementById('oroC'), eB = document.getElementById('oroB');
  var fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch (e) { return; }
  function due(n) { return (n < 10 ? '0' : '') + n; }
  function tic() {
    var p = {}, i, parti = fmt.formatToParts(new Date());
    for (i = 0; i < parti.length; i++) p[parti[i].type] = parti[i].value;
    var h = +p.hour % 24, m = +p.minute, sec = +p.second;
    var dentro = (m % 15) * 60 + sec, manca = 900 - dentro;
    eT.textContent = due(h) + ':' + due(m) + ':' + due(sec);
    eN.innerHTML = (h * 4 + Math.floor(m / 15)) + '<small>/96 today</small>';
    eC.textContent = due(Math.floor(manca / 60)) + ':' + due(manca % 60);
    eB.style.width = (dentro / 900 * 100).toFixed(2) + '%';
    box.classList.toggle('batte', dentro < 3 || manca < 3);
  }
  tic();
  var giro = null, vivo = false;
  function accendi(v) {
    if (v === vivo) return;
    vivo = v;
    if (v) { tic(); giro = setInterval(tic, 1000); }
    else { clearInterval(giro); giro = null; }
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (r) {
      accendi(r[0].isIntersecting && !document.hidden);
    }, { threshold: .05 }).observe(box);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) accendi(false);
    });
  } else { accendi(true); }
})();
</script>
<script>
/* LA LASTRA + IL BIGLIETTO CHE SI CONVALIDA + LA BARRA */
(function () {
  'use strict';
  var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lastra = document.getElementById('lastra');
  if (lastra && !ridotto && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (v, o) {
      if (!v.some(function (x) { return x.isIntersecting; })) return;
      o.disconnect(); lastra.classList.add('accesa');
    }, { threshold: .4 }).observe(lastra);
  }
  var form = document.getElementById('ckForm');
  var n = document.getElementById('ckNome');
  var e = document.getElementById('ckMail');
  var t = document.getElementById('ckTel');
  if (form && n && e && t) {
    var guarda = function () {
      var ok = (n.value || '').trim().length > 1
        && /^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$/.test((e.value || '').trim())
        && (t.value || '').replace(/[^0-9]/g, '').length >= 6;
      form.classList.toggle('pronto', ok);
    };
    [n, e, t].forEach(function (c) {
      c.addEventListener('input', guarda);
      c.addEventListener('change', guarda);
    });
    guarda();
  }
  var hud = document.getElementById('hud');
  if (!hud || !('IntersectionObserver' in window)) return;
  var vicini = {};
  function mostra() {
    hud.classList.toggle('su', scrollY > innerHeight * .8
      && !vicini.checkin && !vicini.chiusura);
  }
  var occ = new IntersectionObserver(function (vs) {
    vs.forEach(function (v) {
      /* «vicino» solo quando occupa davvero lo schermo: con una pagina
         corta un contatto di bordo spegnerebbe la barra troppo presto */
      vicini[v.target.id] = v.intersectionRatio > .45;
    });
    mostra();
  }, { threshold: [0, .25, .45, .7] });
  ['checkin', 'chiusura'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) occ.observe(el);
  });
  addEventListener('scroll', mostra, { passive: true });
  var vai = document.getElementById('hudVai');
  if (vai) vai.addEventListener('click', function () {
    try { gtag('event', 'pfs_hud_click'); } catch (e) {}
  });
})();
</script>

<footer class="footer">""")

# ── verifiche ────────────────────────────────────────────────────────────
LD = ["What if you don't find anything?", 'Is the €350 an extra cost?',
      'Can you really access off-market apartments?',
      "I'm not in Italy yet — does it still work?",
      'How do I know BOOM is legitimate?']
for q in LD:
    assert f'<span class="r-q">{q}</span>' in s, f'FAQ orfana: {q}'
for ago in ('id="lastra"', 'id="console"', 'id="chiusura"', 'id="cons"',
            'id="csBasta"', 'id="orolo"', 'id="checkin"', 'id="ckForm"',
            'class="ck-pronto"', 'id="hud"', 'pfs_q_open'):
    uno(s, ago, OUT)
assert s.count('<details class="riga"') == 8, 'otto righe'
assert s.count('class="regolaR"') == 6, 'sei regole'
for morto in ('id="conto"', 'id="regola"', 'id="macchina"', 'id="tocca"',
              'id="verifica"\x3e', 'id="prezzo"', 'id="perche"',
              'id="imbarco"', 'id="faq"', 'id="dubbio"', '#perche'):
    assert morto not in s, f'residuo: {morto}'
assert s.index('id="lastra"') < s.index('id="console"') < s.index('id="chiusura"')

open(OUT, 'w', encoding='utf-8').write(s)
print(OUT, '-> la console,', len(s) // 1024, 'KB')
