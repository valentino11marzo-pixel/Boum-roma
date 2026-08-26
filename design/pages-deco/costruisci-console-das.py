#!/usr/bin/env python3
# DEAL ASSISTANCE — LA CONSOLE. Il modello collaudato sul Property
# Finding portato sulla seconda pagina per valore: hero e cassa INTATTI
# (pay-plate + foglio Stripe + paybar), poi il REGISTRO del patto e le
# otto obiezioni vere che apre il visitatore, ognuna con la sua prova
# dentro. Le sei domande del FAQPage restano VISIBILI come <summary>
# (righe <details> native: nel DOM per i motori, apribili senza JS), e
# la vecchia sezione FAQ sparisce invece di duplicarle.
# Base pristina: design/pages-deco/das-base.html → deal-assistance.html
import sys

SRC = 'design/pages-deco/das-base.html'
OUT = 'deal-assistance.html'


def uno(s, ago, dove=SRC):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO in {dove}: {n} occorrenze di {ago[:70]!r}')
        sys.exit(1)


s = open(SRC, encoding='utf-8').read()

CSS_ANCORA = '<style>main{padding-top:206px}.fam{top:112px}</style>'
CSS = """<style>main{padding-top:206px}.fam{top:112px}
/* ══ DAS CONSOLE — le obiezioni le apre chi legge ═══════════════════ */
:root { --e:cubic-bezier(.22,1,.36,1); --d1:.3s; }
::selection { background:rgba(255,215,0,.28); }
a:focus-visible, button:focus-visible, summary:focus-visible,
input:focus-visible { outline:2px solid var(--gold); outline-offset:3px;
  border-radius:4px; }
.sez-capo { max-width:56ch; }
.sez-capo .num { font-size:10px; font-weight:700; letter-spacing:.28em;
  text-transform:uppercase; color:var(--gold); }
.sez-capo h2 { margin-top:12px; font-weight:200;
  font-size:clamp(28px,4.4vw,52px); line-height:1.08;
  letter-spacing:-.022em; }
.sez-capo h2 span { color:var(--gold); }
.sez-capo p { margin-top:14px; font-size:14.5px; line-height:1.75;
  color:var(--t3); }
.sez-capo p b { color:var(--t2); font-weight:600; }

/* il registro del patto */
.registro { padding:clamp(46px,6vw,74px) 0; background:#020203;
  box-shadow:inset 0 1px 0 rgba(255,215,0,.14),
    inset 0 -1px 0 rgba(255,215,0,.14); position:relative;
  overflow:hidden; }
@media (min-width:900px){ .registro { display:flex; align-items:center;
  min-height:min(78vh,600px); } }
.registro > .container { width:100%; }
.reg-eti { font-size:9px; font-weight:700; letter-spacing:.32em;
  text-transform:uppercase; color:var(--t3); }
.libro { margin-top:clamp(16px,2.2vw,26px); max-width:1000px; }
.lp { display:grid; grid-template-columns:minmax(0,1fr) auto;
  align-items:baseline; gap:10px clamp(18px,3vw,50px);
  padding:clamp(10px,1.3vw,15px) 0;
  border-bottom:1px solid rgba(255,255,255,.055); }
.lp:first-child { padding-top:0; }
.lp-t { font-weight:200; font-size:clamp(18px,2.35vw,33px);
  line-height:1.18; letter-spacing:-.02em; }
.lp-t b { font-weight:300; color:var(--gold); }
.lp-v { font-style:normal; font-size:clamp(11px,1.3vw,17px);
  letter-spacing:.08em; text-transform:uppercase; color:var(--t4);
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.lp.tot { border-bottom:0; border-top:1px solid rgba(255,215,0,.4);
  margin-top:6px; padding-top:clamp(14px,1.8vw,22px); }
.lp.tot .lp-t { color:var(--gold); }
.lp.tot .lp-t b { color:var(--t1); }
.lp.tot .lp-v { font-size:clamp(13px,1.5vw,19px); color:var(--gold); }
.reg-nota { margin-top:clamp(14px,2vw,22px); font-size:11px;
  letter-spacing:.12em; text-transform:uppercase; color:var(--t4); }
@media (prefers-reduced-motion:no-preference){
  .registro .lp { opacity:0; transform:translateY(12px); }
  .registro.viva .lp { opacity:1; transform:none;
    transition:opacity .55s ease, transform .7s var(--e); }
  .registro.viva .lp:nth-child(1){transition-delay:.05s}
  .registro.viva .lp:nth-child(2){transition-delay:.26s}
  .registro.viva .lp:nth-child(3){transition-delay:.47s}
  .registro.viva .lp:nth-child(4){transition-delay:.68s}
  .registro.viva .lp:nth-child(5){transition-delay:.92s}
}

/* la console */
.console { margin-top:clamp(24px,3.2vw,40px); border-radius:18px;
  background:linear-gradient(180deg,rgba(255,255,255,.028),
    rgba(255,255,255,.008));
  box-shadow:inset 0 0 0 1px var(--line), 0 40px 90px rgba(0,0,0,.45);
  overflow:hidden; }
.cs-capo { display:flex; align-items:center; gap:12px 20px;
  flex-wrap:wrap; padding:clamp(13px,1.7vw,19px) clamp(16px,2.2vw,26px);
  border-bottom:1px solid var(--line); }
.cs-stato { font-size:9px; font-weight:700; letter-spacing:.24em;
  text-transform:uppercase; color:var(--t3); }
.cs-stato b { color:var(--gold); }
.cs-seg { display:flex; gap:5px; flex:1; }
.cs-seg i { flex:1; max-width:38px; height:2px; border-radius:2px;
  background:rgba(255,255,255,.13); transition:background .45s ease; }
.cs-seg i.acceso { background:var(--gold);
  box-shadow:0 0 8px rgba(255,215,0,.5); }
.cs-invito { font-size:11px; color:var(--t3); }
@media (min-width:900px){ .cs-invito { display:none; } }
.cs-tasti { display:none; }
@media (min-width:900px) and (hover:hover){
  .cs-tasti { display:inline-flex; align-items:center; gap:6px;
    font-size:9px; font-weight:700; letter-spacing:.18em;
    text-transform:uppercase; color:var(--t4); }
  .cs-tasti kbd { padding:2px 6px; font:inherit; letter-spacing:.1em;
    color:var(--t3); border-radius:4px;
    box-shadow:inset 0 0 0 1px var(--line); } }
.cs-tutto { flex:none; padding:7px 12px; font-size:9px; font-weight:700;
  letter-spacing:.2em; text-transform:uppercase; color:var(--t3);
  background:none; border:0; border-radius:100px; cursor:pointer;
  box-shadow:inset 0 0 0 1px var(--line);
  transition:color var(--d1) ease, box-shadow var(--d1) ease; }
.cs-tutto:hover { color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.riga { border-bottom:1px solid rgba(255,255,255,.045); }
.riga:last-of-type { border-bottom:0; }
.riga > summary { list-style:none; cursor:pointer; display:grid;
  align-items:center; gap:4px 16px; min-height:56px;
  grid-template-columns:50px minmax(0,1fr) auto auto;
  padding:clamp(15px,1.9vw,21px) clamp(16px,2.2vw,26px);
  transition:background var(--d1) ease; }
.riga > summary::-webkit-details-marker { display:none; }
.riga > summary:hover { background:rgba(255,215,0,.035); }
.r-num { font-size:12.5px; letter-spacing:.1em; white-space:nowrap;
  color:rgba(255,215,0,.5); transition:color var(--d1) ease; }
.r-tema { grid-column:2; font-size:9px; font-weight:700;
  letter-spacing:.26em; text-transform:uppercase; color:var(--t4); }
.r-q { grid-column:2; font-weight:250;
  font-size:clamp(16px,1.85vw,23px); line-height:1.24;
  letter-spacing:-.01em; color:var(--t1); overflow-wrap:anywhere;
  transition:color var(--d1) ease; }
.r-cifra { grid-column:3; grid-row:1/3; align-self:center; display:grid;
  justify-items:end; gap:3px; }
.r-colpo { font-weight:200; font-size:clamp(20px,2.4vw,32px);
  line-height:1; color:var(--gold); letter-spacing:-.02em;
  white-space:nowrap; font-variant-numeric:tabular-nums; }
.r-colpo-eti { font-size:9px; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:var(--t4); white-space:nowrap; }
.r-azione { grid-column:4; grid-row:1/3; align-self:center;
  display:inline-flex; align-items:center; gap:9px; }
.r-apri { font-size:9px; font-weight:700; letter-spacing:.18em;
  text-transform:uppercase; color:var(--gold); white-space:nowrap; }
.r-apri::after { content:'Open'; }
.riga[open] .r-apri { color:var(--t4); }
.riga[open] .r-apri::after { content:'Close'; }
.r-piu { width:22px; height:22px; position:relative; border-radius:50%;
  box-shadow:inset 0 0 0 1px var(--line);
  transition:box-shadow var(--d1) ease, transform .4s var(--e); }
.r-piu::before, .r-piu::after { content:''; position:absolute; left:50%;
  top:50%; width:9px; height:1.5px; background:var(--t2);
  transform:translate(-50%,-50%); transition:opacity .3s ease,
    background .3s ease; }
.r-piu::after { transform:translate(-50%,-50%) rotate(90deg); }
.riga[open] > summary { background:rgba(255,215,0,.045); }
.riga[open] > summary .r-num, .riga[open] > summary .r-q
  { color:var(--gold); }
.riga[open] .r-piu { transform:rotate(180deg);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.riga[open] .r-piu::after { opacity:0; }
.riga[open] .r-piu::before { background:var(--gold); }
.riga.risposta > summary .r-num::after { content:' ✓'; color:var(--gold); }
@media (prefers-reduced-motion:no-preference){
  .console.pulsa .riga:not([open]):first-of-type .r-piu {
    animation:invito 2.6s ease-in-out infinite; }
  @keyframes invito { 0%,100%{box-shadow:inset 0 0 0 1px var(--line)}
    50%{box-shadow:inset 0 0 0 1px rgba(255,215,0,.75),
      0 0 0 6px rgba(255,215,0,.07)} }
  .riga[open] .r-corpo { animation:apri .55s var(--e); }
  @keyframes apri { from{opacity:0;transform:translateY(-10px)} } }
.r-corpo { padding:clamp(6px,1vw,10px) clamp(16px,2.2vw,26px)
  clamp(24px,3vw,38px); }
@media (min-width:900px){ .r-corpo { padding-left:80px;
  padding-right:clamp(30px,4vw,60px); } }
.r-lead { font-weight:250; font-size:clamp(19px,2.2vw,28px);
  line-height:1.3; letter-spacing:-.01em; max-width:26ch; }
.r-lead b { font-weight:300; color:var(--gold); }
.r-det { margin-top:14px; font-size:14.5px; line-height:1.78;
  color:var(--t2); max-width:60ch; }
.r-det b { color:var(--t1); font-weight:600; }
.r-det + .r-det { margin-top:11px; }
.prove { margin-top:16px; display:flex; gap:8px; flex-wrap:wrap; }
.prove a { display:inline-flex; align-items:center; gap:7px;
  min-height:38px; padding:9px 15px; font-size:11px; font-weight:600;
  color:var(--t2); text-decoration:none; border-radius:100px;
  box-shadow:inset 0 0 0 1px var(--line);
  transition:color var(--d1) ease, box-shadow var(--d1) ease; }
.prove a:hover { color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.prove a i { font-style:normal; color:var(--gold); }
.r-strumenti { margin-top:18px; }
.r-link { display:inline-flex; align-items:center; gap:7px;
  padding:7px 0; font-size:11px; font-weight:600; letter-spacing:.12em;
  text-transform:uppercase; color:var(--t4); background:none; border:0;
  cursor:pointer; transition:color var(--d1) ease; }
.r-link::before { content:'⧉'; }
.r-link:hover { color:var(--gold); }
.reperto-eti { margin:clamp(24px,3vw,34px) 0 14px; display:flex;
  align-items:center; gap:12px; }
.reperto-eti b { flex:none; padding:5px 11px; font-size:9px;
  font-weight:700; letter-spacing:.22em; text-transform:uppercase;
  color:var(--gold); border-radius:3px;
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.reperto-eti span { font-size:10px; font-weight:600; letter-spacing:.18em;
  text-transform:uppercase; color:var(--t4); }
.reperto-eti::after { content:''; flex:1; height:1px;
  background:linear-gradient(90deg,var(--line),transparent); }
.cs-basta { display:none; align-items:center; gap:14px 20px;
  flex-wrap:wrap; padding:clamp(16px,2.1vw,24px) clamp(16px,2.2vw,26px);
  background:rgba(255,215,0,.06);
  border-top:1px solid rgba(255,215,0,.22); }
.cs-basta.viva { display:flex; animation:apri .6s var(--e); }
.cs-basta p { flex:1 1 240px; font-weight:250;
  font-size:clamp(17px,2vw,24px); line-height:1.24; }
.cs-basta p b { color:var(--gold); font-weight:250; }
.cs-basta .paybtn { max-width:330px; }
@media (max-width:620px){
  .riga > summary { grid-template-columns:40px minmax(0,1fr) auto;
    padding-left:14px; padding-right:14px; }
  .r-cifra { grid-column:2; grid-row:3; justify-items:start;
    margin-top:7px; }
  .r-colpo { font-size:26px; }
  .r-azione { grid-column:3; grid-row:1/3; }
  .r-apri { font-size:9px; }
  .prove a { min-height:44px; padding:12px 16px; }
  .r-link { min-height:44px; padding:12px 0; }
}

/* il verdetto — semaforo delle clausole */
.verdetto { display:grid; gap:12px;
  grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); }
.vd { padding:18px 20px; border-radius:14px; background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line); position:relative;
  overflow:hidden; }
.vd::before { content:''; position:absolute; left:0; right:0; top:0;
  height:2px; }
.vd.male::before { background:#FF7A6B; }
.vd.manca::before { background:#FFB020; }
.vd.bene::before { background:var(--gold); }
.vd-eti { font-size:9px; font-weight:700; letter-spacing:.2em;
  text-transform:uppercase; }
.vd.male .vd-eti { color:#FF7A6B; }
.vd.manca .vd-eti { color:#FFB020; }
.vd.bene .vd-eti { color:var(--gold); }
.vd h4 { margin-top:10px; font-weight:250; font-size:18px;
  line-height:1.25; }
.vd ul { margin-top:11px; list-style:none; display:grid; gap:7px; }
.vd li { position:relative; padding-left:15px; font-size:12.5px;
  line-height:1.6; color:var(--t3); }
.vd li::before { content:''; position:absolute; left:0; top:.62em;
  width:7px; height:1px; background:currentColor; opacity:.5; }

/* la sala delle regole romane */
.sala { display:grid; gap:12px;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }
.regolaR { position:relative; padding:19px 21px; border-radius:14px;
  background:var(--card); box-shadow:inset 0 0 0 1px var(--line);
  overflow:hidden; }
.regolaR::before { content:''; position:absolute; left:0; right:0; top:0;
  height:1px; background:linear-gradient(90deg,var(--gold),
    rgba(255,215,0,.05)); }
.rr-capo { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.rr-num { font-size:12.5px; letter-spacing:.12em;
  color:rgba(255,215,0,.55); }
.rr-fonte { padding:3px 8px; font-size:9px; font-weight:700;
  letter-spacing:.2em; text-transform:uppercase; color:var(--t4);
  border-radius:3px; box-shadow:inset 0 0 0 1px var(--line); }
.rr-fonte.legge { color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.regolaR h4 { margin-top:11px; font-weight:250; font-size:19px;
  line-height:1.22; }
.rr-trappola { margin-top:9px; font-size:12.5px; line-height:1.6;
  color:var(--t3); }
.rr-noi { margin-top:12px; padding-top:11px; font-size:12.5px;
  line-height:1.6; color:var(--t2);
  border-top:1px solid rgba(255,255,255,.06); }
.rr-noi::before { content:'BOOM'; display:block; margin-bottom:4px;
  font-size:9px; font-weight:700; letter-spacing:.24em;
  color:var(--gold); }
.rr-noi b { color:var(--t1); font-weight:600; }

/* la verifica */
.verifica { display:grid; gap:12px;
  grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
.vf { padding:18px 20px; border-radius:14px; background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line); }
.vf b { display:block; font-size:9px; font-weight:700;
  letter-spacing:.22em; text-transform:uppercase; color:var(--gold); }
.vf p { margin-top:9px; font-size:13px; line-height:1.65;
  color:var(--t2); }
.vf a { color:var(--t2); }

/* la chiusura */
.chiusa { text-align:center; padding:clamp(50px,7vw,88px) 0; }
.chiusa h2 { font-weight:200; font-size:clamp(28px,4.6vw,56px);
  line-height:1.08; letter-spacing:-.022em; }
.chiusa h2 span { color:var(--gold); }
.chiusa .paybtn { margin:clamp(20px,2.6vw,30px) auto 0; max-width:360px; }
.chiusa-nota { margin-top:16px; font-size:11.5px; color:var(--t4); }

/* la barra della cassa */
.hud { position:fixed; left:0; right:0; bottom:0; z-index:110;
  display:flex; align-items:center; gap:clamp(10px,2vw,22px);
  padding:9px clamp(14px,3vw,28px)
    calc(9px + env(safe-area-inset-bottom,0px));
  background:rgba(6,6,7,.86); backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
  border-top:1px solid rgba(255,215,0,.14); transform:translateY(110%);
  transition:transform .5s var(--e); }
.hud.su { transform:none; }
.hud-stato { flex:1; font-size:9px; font-weight:700; letter-spacing:.2em;
  text-transform:uppercase; color:var(--t4); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.hud-stato b { color:var(--gold); }
.hud-vai { flex:none; display:inline-flex; align-items:baseline; gap:7px;
  padding:9px 16px; font-size:11px; font-weight:800; letter-spacing:.08em;
  color:#141005; background:var(--gold); border-radius:100px;
  border:0; cursor:pointer; white-space:nowrap; }
.hud-vai small { font-size:9px; font-weight:700; opacity:.7; }
@media (prefers-reduced-motion:reduce){ .hud{transition:none} }
</style>"""
uno(s, CSS_ANCORA)
s = s.replace(CSS_ANCORA, CSS)
# ── i reperti ────────────────────────────────────────────────────────────
VERDETTO = """<div class="verdetto">
      <div class="vd male"><span class="vd-eti">⚑ Unfair</span>
        <h4>What the draft takes from you</h4>
        <ul><li>Exit penalties dressed as “notice”</li>
          <li>Deposits above the legal ceiling</li>
          <li>Repairs and maintenance pushed onto the tenant</li>
          <li>Automatic renewals with no way out</li></ul></div>
      <div class="vd manca"><span class="vd-eti">⚑ Missing</span>
        <h4>What isn't there and should be</h4>
        <ul><li>The registration setup (RLI, cedolare secca election)</li>
          <li>Deposit return terms and deadline</li>
          <li>The state of the flat at handover</li>
          <li>Who pays which running costs</li></ul></div>
      <div class="vd bene"><span class="vd-eti">✓ Verified</span>
        <h4>What we confirm before you commit</h4>
        <ul><li>The owner named in the public property registry</li>
          <li>The contract type fits your actual stay</li>
          <li>Meter readings and handover written down</li>
          <li>Every article, translated into plain English</li></ul></div>
    </div>"""

SALA = """<div class="sala">
      <div class="regolaR"><div class="rr-capo"><span class="rr-num">R01</span>
        <span class="rr-fonte legge">Territorial agreement</span></div>
        <h4>Rome's negotiated-rent bands</h4>
        <p class="rr-trappola">The 2023 Rome agreement fixes €/m² bands per
          zone. The wrong rent can't be attested — you pay more and lose the
          tax break.</p>
        <p class="rr-noi">We compute the attestable band for your flat —
          <b>75 zones, the official coefficients</b> — and negotiate against
          it.</p></div>
      <div class="regolaR"><div class="rr-capo"><span class="rr-num">R02</span>
        <span class="rr-fonte legge">Italian law</span></div>
        <h4>Deposit: three months, maximum</h4>
        <p class="rr-trappola">Anything above is not enforceable — and
          “non-refundable deposit” is not a thing.</p>
        <p class="rr-noi">We push for <b>two</b>, in writing, with the return
          terms named in the contract.</p></div>
      <div class="regolaR"><div class="rr-capo"><span class="rr-num">R03</span>
        <span class="rr-fonte legge">Landlord's duty</span></div>
        <h4>Registered within 30 days — or it doesn't exist</h4>
        <p class="rr-trappola">An unregistered lease gives you no legal
          protection <b>and no residency</b>.</p>
        <p class="rr-noi">We check the registration setup before you sign
          and follow the <b>protocol number</b> after.</p></div>
      <div class="regolaR"><div class="rr-capo"><span class="rr-num">R04</span>
        <span class="rr-fonte">€5 · public registry</span></div>
        <h4>Whoever rents it must own it</h4>
        <p class="rr-trappola">The fake-landlord scam dies with one document:
          the <b>visura catastale</b> names the real owner.</p>
        <p class="rr-noi">We pull it <b>before</b> a single euro moves.</p></div>
      <div class="regolaR"><div class="rr-capo"><span class="rr-num">R05</span>
        <span class="rr-fonte legge">L. 431/98 art. 5</span></div>
        <h4>A transitional lease needs a documented reason</h4>
        <p class="rr-trappola">The wrong contract type for your stay is the
          most common “legal” trap for foreigners.</p>
        <p class="rr-noi">We pick the right form — transitional, student,
          4+4 — and check the <b>attestation</b> that makes it hold.</p></div>
      <div class="regolaR"><div class="rr-capo"><span class="rr-num">R06</span>
        <span class="rr-fonte">Handover</span></div>
        <h4>The keys day is a document, not a handshake</h4>
        <p class="rr-trappola">No readings, no photos, no signed state of the
          flat — and the deposit argument is your word against theirs.</p>
        <p class="rr-noi">We make sure the contract <b>requires</b> a written
          handover record.</p></div>
    </div>"""

VERIFICA = """<div class="verifica">
      <div class="vf"><b>The company</b><p>Egidi Immobiliare S.r.l. — P.IVA
        17322991005, REA RM-1710623, Via dei Coronari 181, Roma.
        <a href="/terms.html">Terms →</a></p></div>
      <div class="vf"><b>The trademark</b><p>Registered EU trademark
        019317594 — look it up yourself on
        <a href="https://euipo.europa.eu/eSearch/#details/trademarks/019317594"
        target="_blank" rel="noopener">EUIPO ↗</a>.</p></div>
      <div class="vf"><b>The reviews</b><p>4.9★ with 47 reviews from real
        tenants — <a href="https://share.google/xikmVxQCRuKOdWcND"
        target="_blank" rel="noopener">read them one by one ↗</a>.</p></div>
      <div class="vf"><b>The money</b><p>Card via Stripe, receipted, with
        chargeback protection. <b>Never</b> a bank transfer to an
        individual.</p></div>
    </div>"""

CONTO = """<div class="verdetto">
      <div class="vd male"><span class="vd-eti">The exposure</span>
        <h4>What a single clause can cost</h4>
        <ul><li>An exit penalty is counted in <b>months of rent</b></li>
          <li>A deposit above the ceiling is money you fight for later</li>
          <li>No registration means <b>no residency</b> — and the paperwork
            chain breaks at the first office</li></ul></div>
      <div class="vd bene"><span class="vd-eti">The price</span>
        <h4>What this costs</h4>
        <ul><li><b>€249</b>, once, before you sign</li>
          <li>If you started with the <b>€49</b> Contract Check, it is
            credited in full</li>
          <li>No viewing fees, no application fees (Terms §4.3)</li></ul></div>
    </div>"""

RITIRO = """<div class="verifica">
      <div class="vf"><b>1 · The draft</b><p>The contract as the landlord sent
        it — PDF, Word, or photos of the pages. Italian is fine.</p></div>
      <div class="vf"><b>2 · The listing</b><p>The link or the address, so we
        can verify the property and who owns it.</p></div>
      <div class="vf"><b>3 · Your deadline</b><p>If the landlord wants an
        answer by Friday, say so — we work to your clock.</p></div>
    </div>"""

# ── le otto righe ────────────────────────────────────────────────────────
RIGHE = [
 ('d1', 'The product', 'What does the contract review cover?', '3',
  'layers checked',
  'Every article, the owner,<br>and the <b>registration setup</b>.',
  ["""We read all of it, clause by clause, and hand it back <b>in plain
      English</b>: what each article means and what it costs you. We flag
      the unfair ones and the missing ones, verify the landlord's identity
      and the property ownership, and check how the lease is being
      registered — the part that decides your residency and your tax
      position."""],
  '', 'The verdict — what we flag', VERDETTO),

 ('d2', 'The clock', 'How fast is the review?', '24h', 'first pass',
  'First pass within <b>24 hours</b><br>of payment.',
  ["""You pay, you send the draft, we come back with the first read inside a
      day. If your landlord wants an answer by Friday, <b>we work to your
      deadline</b>, not ours — the whole point of this service is that it
      fits inside the window you actually have."""],
  '', '', ''),

 ('d3', 'The reach', 'I already found a place — can you still help?', 'any',
  'portal · agency · private',
  'That is <b>exactly</b><br>what this is for.',
  ["""Deal Assistance works on the apartment <b>you</b> found — any portal,
      any agency, a private landlord, a friend of a friend. We verify the
      listing, review the contract and negotiate on your behalf. We don't
      need it to be one of ours; we need it to be safe for you."""],
  '', '', ''),

 ('d4', 'The price', 'Is €249 really worth it?', '€49',
  'your check, credited',
  'Compare it to <b>one bad clause</b>,<br>not to zero.',
  ["""The honest way to judge it is against the exposure, not against
      nothing. An exit penalty is counted in months of rent. A deposit above
      the legal ceiling is money you chase later. A lease that is never
      registered costs you your residency. If you already bought the €49
      Contract Check, <b>it is credited in full</b> against this."""],
  '<a href="/contract-check-express.html">The €49 check — the fast '
  'verdict <i>→</i></a>', 'The exposure vs the price', CONTO),

 ('d5', 'The counterpart', 'My accountant can read it — why you?', '6',
  'Rome rules we check',
  'Reading Italian isn\'t the job.<br><b>Knowing Rome</b> is.',
  ["""A translator gives you the words; an accountant gives you the tax
      line. Neither tells you that the rent can't be attested in that zone,
      that the deposit is over the ceiling, that the transitional form needs
      a documented reason, or that the handover has to be written down.
      These are the six rules that decide whether your year here is calm or
      expensive — and we check them on your draft, one by one."""],
  '', 'What a Rome local checks', SALA),

 ('d6', 'The trap', 'It\'s a standard contract — what could go wrong?',
  '30gg', 'to register — or it doesn\'t exist',
  'There is no such thing<br>as a <b>standard</b> contract.',
  ["""“Standard” usually means a template someone downloaded and edited. The
      most expensive problems are not exotic: the wrong contract type for
      your stay, a registration that never happens, a deposit clause that
      quietly becomes “last month's rent”, repairs pushed onto you. Every
      one of those is legal-looking on the page and costly in the year that
      follows."""],
  '<a href="/blog-scam-bible.html">The patterns we see most '
  '<i>→</i></a>', '', ''),

 ('d7', 'The trust', 'How do I know it isn\'t a scam?', '€5',
  'the visura that names the owner',
  'Two answers: <b>who they are</b>,<br>and <b>who we are</b>.',
  ["""On their side: we pull the property registry extract — five euros,
      and it names the actual owner — and we verify the identity of whoever
      is renting to you, <b>before</b> a single euro moves.""",
   """On ours: you can check us in thirty seconds. Registered company,
      registered EU trademark, 47 public reviews, and every payment through
      Stripe with a receipt — never a transfer to a person."""],
  '', 'Check us, don\'t trust us', VERIFICA),

 ('d8', 'The handover', 'What do you need from me?', '1', 'PDF. That\'s it.',
  'The draft, the listing,<br>and <b>your deadline</b>.',
  ["""Reply to the confirmation email with the contract as you received it —
      PDF, Word, even photos of the pages. Add the listing link if you have
      one. Then it's our turn: you'll get the read, the flags and the
      negotiation plan, and a human answering your questions until the keys
      are in your hand."""],
  '', 'What to send', RITIRO),
]

righe_html = []
for i, (rid, tema, dom, colpo, dida, lead, dets, prove, rep_eti, rep) in enumerate(RIGHE):
    corpo_det = '\n      '.join(f'<p class="r-det">{d}</p>' for d in dets)
    chips = f'\n      <div class="prove">{prove}</div>' if prove else ''
    rep_html = ''
    if rep:
        rep_html = (f'\n      <div class="reperto-eti"><b>Exhibit</b>'
                    f'<span>{rep_eti}</span></div>\n      {rep}')
    apre = ' open' if i == 0 else ''
    righe_html.append(f"""<details class="riga" id="{rid}"{apre}>
      <summary>
        <span class="r-num">{i + 1:02d}</span>
        <span class="r-tema">{tema}</span>
        <span class="r-q">{dom}</span>
        <span class="r-cifra"><span class="r-colpo">{colpo}</span>
          <span class="r-colpo-eti">{dida}</span></span>
        <span class="r-azione"><span class="r-apri"></span>
          <span class="r-piu" aria-hidden="true"></span></span>
      </summary>
      <div class="r-corpo">
      <p class="r-lead">{lead}</p>
      {corpo_det}{chips}
      <div class="r-strumenti"><button type="button" class="r-link"
        data-q="{rid}">Copy the link to this answer</button></div>{rep_html}
      </div>
    </details>""")

NUOVO = """  <!-- ══ IL REGISTRO — il patto in un respiro ═════════════════════════ -->
  <section class="registro" id="registro">
    <div class="container">
      <p class="reg-eti">The deal, in one breath</p>
      <div class="libro">
        <div class="lp"><span class="lp-t">You pay <b>€249</b>, once,
          before you sign.</span><i class="lp-v">− €249</i></div>
        <div class="lp"><span class="lp-t">Every page, <b>clause by
          clause</b>, in plain English.</span><i class="lp-v">the read</i></div>
        <div class="lp"><span class="lp-t">The owner checked against the
          <b>property registry</b>.</span><i class="lp-v">included</i></div>
        <div class="lp"><span class="lp-t">What's unfair — <b>renegotiated
          before you sign</b>.</span><i class="lp-v">included</i></div>
        <div class="lp tot"><span class="lp-t">One bad clause costs
          <b>months of rent — or your residency</b>.</span>
          <i class="lp-v">the risk you remove</i></div>
      </div>
      <p class="reg-nota">First pass within 24h · Contract Check €49
        credited · Terms §4.3</p>
    </div>
  </section>

  <!-- ══ LA CONSOLE — le obiezioni le apre chi legge ═══════════════════ -->
  <section class="rv" id="console">
    <div class="container">
      <div class="sez-capo">
        <span class="num">The interrogation</span>
        <h2>Before you hand us a contract,<br><span>ask us anything.</span></h2>
        <p>The eight questions clients actually ask. <b>Open the ones you
          care about</b> — every answer carries its evidence.</p>
      </div>
      <div class="console pulsa" id="cons">
        <div class="cs-capo">
          <span class="cs-stato" id="csStato"><b>0</b>/8 answered</span>
          <span class="cs-seg" id="csSeg" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <span class="cs-invito">Tap any question to open the answer</span>
          <span class="cs-tasti" aria-hidden="true"><kbd>1</kbd>–<kbd>8</kbd>
            open · <kbd>esc</kbd> close</span>
          <button type="button" class="cs-tutto" id="csTutto"
            aria-expanded="false">Open all</button>
        </div>
        """ + '\n        '.join(righe_html) + """
        <div class="cs-basta" id="csBasta">
          <p>Enough? <b>Send us the contract.</b></p>
          <button class="paybtn" onclick="openSheet('console')"><span class="lk">🛡</span><span class="tx"><b>Get protected</b><small>pay now · first review within 24h</small></span><span class="amt">€249</span></button>
        </div>
      </div>
    </div>
  </section>

  <!-- ══ LA CHIUSURA ═══════════════════════════════════════════════════ -->
  <section class="chiusa" id="chiusura">
    <div class="container">
      <h2>Eleven pages of Italian.<br><span>One read, before you sign.</span></h2>
      <button class="paybtn" onclick="openSheet('close')"><span class="lk">🛡</span><span class="tx"><b>Get protected</b><small>pay now · first review within 24h · Stripe</small></span><span class="amt">€249</span></button>
      <p class="chiusa-nota">Card via Stripe to Egidi Immobiliare S.r.l. —
        never a bank transfer to an individual.</p>
    </div>
  </section>

"""

# ── demolizione: via le sezioni intermedie e la vecchia FAQ ─────────────
D0 = '  <section class="rv">\n    <div class="sec-h"><span class="num">HOW IT WORKS</span>'
D1 = '  <section class="rv">\n    <div class="sec-h"><span class="num">MORE</span>'
uno(s, D0)
uno(s, D1)
s = s[:s.index(D0)] + NUOVO + s[s.index(D1):]

# ── la vecchia barra puntava a #pay, sezione che non esiste piu':
# senza guardia lanciava a OGNI scroll (null.getBoundingClientRect).
VECCHIA = """  var bar=document.getElementById('paybar'),hero=document.querySelector('.hero'),pay=document.getElementById('pay');"""
uno(s, VECCHIA)
s = s.replace(VECCHIA, """  var bar=document.getElementById('paybar'),hero=document.querySelector('.hero'),pay=document.getElementById('pay');
  if(!bar||!hero||!pay)return;   /* la console ha la sua barra */""")

# ── la barra della cassa + la regia ─────────────────────────────────────
CODA = '</body>'
uno(s, CODA)
s = s.replace(CODA, """
<div class="hud" id="hud" aria-label="Your progress and the checkout">
  <span class="hud-stato" id="hudStato">Eight questions · <b>tap one</b></span>
  <button class="hud-vai" id="hudVai" onclick="openSheet('hud')">Protect the deal · €249</button>
</div>
<script>
/* LA CONSOLE — il progresso e' del visitatore. Righe <details> native:
   senza JS restano perfettamente apribili. */
(function () {
  'use strict';
  var cons = document.getElementById('cons');
  if (!cons) return;
  var righe = [].slice.call(cons.querySelectorAll('.riga'));
  var seg = [].slice.call(cons.querySelectorAll('#csSeg i'));
  var stato = document.getElementById('csStato');
  var basta = document.getElementById('csBasta');
  var hudS = document.getElementById('hudStato');
  var CHIAVE = 'boom_das_lette', viste = {};
  function lette() {
    try { return JSON.parse(localStorage.getItem(CHIAVE) || '[]'); }
    catch (e) { return []; } }
  function ricorda(id) {
    try { var v = lette(); if (v.indexOf(id) < 0) { v.push(id);
      localStorage.setItem(CHIAVE, JSON.stringify(v.slice(-12))); } }
    catch (e) {} }
  function conta() {
    righe.forEach(function (r, i) {
      if (r.open) r.classList.add('risposta');
      seg[i].classList.toggle('acceso', r.classList.contains('risposta'));
    });
    var f = righe.filter(function (r) {
      return r.classList.contains('risposta'); }).length;
    stato.innerHTML = '<b>' + f + '</b>/8 answered';
    if (hudS) hudS.innerHTML = f
      ? '<b>' + f + '</b>/8 answered — the evidence is open'
      : 'Eight questions · <b>tap one</b>';
    if (f >= 2) basta.classList.add('viva');
  }
  righe.forEach(function (r) {
    r.addEventListener('toggle', function () {
      if (r.open) {
        ricorda(r.id);
        try { history.replaceState(null, '', '#' + r.id); } catch (e) {}
        if (!viste[r.id]) { viste[r.id] = 1;
          try { gtag('event', 'das_q_open', { q: r.id }); } catch (e) {} }
      }
      cons.classList.remove('pulsa');
      conta();
    });
  });
  if (innerWidth < 900 && !location.hash) {
    var p = righe[0]; if (p) p.open = false;
  }
  conta();

  function apriDaHash(scorri) {
    var id = (location.hash || '').replace('#', '');
    if (!/^d[1-8]$/.test(id)) return;
    var r = document.getElementById(id);
    if (!r) return;
    r.open = true;
    if (scorri) setTimeout(function () {
      r.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
  }
  apriDaHash(true);
  addEventListener('hashchange', function () { apriDaHash(true); });

  var tutto = document.getElementById('csTutto');
  if (tutto) tutto.addEventListener('click', function () {
    var apri = righe.some(function (r) { return !r.open; });
    righe.forEach(function (r) { r.open = apri; });
    tutto.textContent = apri ? 'Close all' : 'Open all';
    tutto.setAttribute('aria-expanded', apri ? 'true' : 'false');
    conta();
  });

  addEventListener('keydown', function (ev) {
    var t = ev.target || {}, tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select'
      || t.isContentEditable || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'Escape') {
      righe.forEach(function (r) { r.open = false; }); conta(); return; }
    var n = parseInt(ev.key, 10);
    if (!(n >= 1 && n <= 8)) return;
    var r = righe[n - 1]; if (!r) return;
    ev.preventDefault(); r.open = !r.open; conta();
    if (r.open) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  [].forEach.call(document.querySelectorAll('.r-link'), function (b) {
    b.addEventListener('click', function () {
      var url = location.origin + location.pathname + '#' + b.dataset.q;
      var fine = function () {
        var era = b.textContent; b.textContent = 'Link copied';
        setTimeout(function () { b.textContent = era; }, 2200);
        try { gtag('event', 'das_q_share', { q: b.dataset.q }); } catch (e) {}
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(fine, function () {
          window.prompt('Copy this link', url); });
      } else {
        var i = document.createElement('input');
        i.value = url; document.body.appendChild(i); i.select();
        try { document.execCommand('copy'); fine(); }
        catch (e) { window.prompt('Copy this link', url); }
        document.body.removeChild(i);
      }
    });
  });
})();
</script>
<script>
/* IL REGISTRO + LA BARRA */
(function () {
  'use strict';
  var reg = document.querySelector('.registro');
  if (reg && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (v, o) {
      if (!v.some(function (x) { return x.isIntersecting; })) return;
      o.disconnect(); reg.classList.add('viva');
    }, { threshold: .35 }).observe(reg);
    setTimeout(function () { reg.classList.add('viva'); }, 2500);
  } else if (reg) { reg.classList.add('viva'); }

  var hud = document.getElementById('hud');
  if (!hud || !('IntersectionObserver' in window)) return;
  var vicini = {};
  function mostra() {
    hud.classList.toggle('su', scrollY > innerHeight * .8
      && !vicini.chiusura); }
  new IntersectionObserver(function (vs) {
    vs.forEach(function (v) { vicini[v.target.id] = v.intersectionRatio > .45; });
    mostra();
  }, { threshold: [0, .25, .45, .7] }).observe(document.getElementById('chiusura'));
  addEventListener('scroll', mostra, { passive: true });
  var paybar = document.getElementById('paybar');
  if (paybar) paybar.style.display = 'none';
})();
</script>
</body>""")

# ── verifiche ────────────────────────────────────────────────────────────
LD = ['I already found a place — can you still help?',
      'Is €249 really worth it?', 'What does the contract review cover?',
      "How do I know it isn't a scam?", 'How fast is the review?',
      'What do you need from me?']
for q in LD:
    assert f'<span class="r-q">{q}</span>' in s, f'FAQ orfana: {q}'
for ago in ('id="registro"', 'id="console"', 'id="chiusura"', 'id="cons"',
            'id="csBasta"', 'id="hud"', 'das_q_open', 'class="sala"'):
    uno(s, ago, OUT)
assert s.count('<details class="riga') == 8, 'otto righe'
assert s.count('class="regolaR"') == 6, 'sei regole'
assert 'HOW IT WORKS' not in s and 'BOOK IT' not in s, 'sezioni vecchie rimosse'
assert s.count('<div class="faq">') == 0, 'vecchia FAQ rimossa'
assert 'openSheet(' in s and 'paySheet()' in s, 'la cassa resta'
assert s.index('id="registro"') < s.index('id="console"') < s.index('id="chiusura"')

open(OUT, 'w', encoding='utf-8').write(s)
print(OUT, '-> la console DAS,', len(s) // 1024, 'KB')
