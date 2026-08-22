#!/usr/bin/env python3
# PFS 7.0 — IL VOLO. Il gioiellino: non una pagina che RACCONTA il
# servizio ma il servizio che SI ESIBISCE. Ticket-hero intatto; poi tre
# scene cinematiche guidate dallo scroll (sticky + --f, pattern scrub di
# index.html) e tre blocchi fattuali compatti:
#   1. LE PARTENZE — il mercato di Roma come tabellone Solari: sei righe
#      brutali (tutte da fonti gia' pubblicate) e il buon annuncio che
#      SCADE mentre scorri (BOARDING → LAST CALL → GONE). La perdita non
#      si legge: si guarda.
#   2. IL RADAR — la macchina lavora: 14 contatti, i sotto-60 svaniscono,
#      l'agenzia viene sbarrata (stored, never pushed), tre d'oro restano
#      coi punteggi. Poi i numeri veri: 96/giorno · 50·30·20 · soglia 60.
#   3. LA CAMMINATA — il timbro REJECTED sulla casa umida: la camera
#      mente, i piedi no.
#   4. IL KIT (day 3, compatto: app DEMO · zecca del pass · /try)
#   5. LA SCATOLA NERA (regola anti-truffa + §4.2/§7.1-bis verbatim +
#      100% + fee §4.1 + limiti onesti)
#   6. LA VERIFICA (4.9 · P.IVA · EUIPO · volto) → imbarco → FAQ.
# Degrado totale: senza JS o con reduced-motion la pagina e' COMPLETA e
# statica (html.cine arma la regia, mai il contrario).
# Base: property-finding.html. Output: preview-pfs-volo.html.
import sys

SRC = 'property-finding.html'
OUT = 'preview-pfs-volo.html'


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
TOCCA = estrai('<div class="tocca sale">')
VERIFICA = estrai('<div class="verifica sale">')

# ── CSS ──────────────────────────────────────────────────────────────────
CSS_ANCORA = ".imbarco-garanzia::before { content:'✓'; color:var(--gold); }"
CSS = CSS_ANCORA + """

/* ══ IL VOLO · le scene ═══════════════════════════════════════════════ */
.scena { position:relative; }
html.cine .scena { height:var(--durata,240vh); }
.scena-vp { padding:clamp(64px,8vw,116px) 0; }
html.cine .scena-vp { position:sticky; top:0; min-height:100vh;
  display:flex; flex-direction:column; justify-content:center;
  padding:90px 0 40px; overflow:hidden; }
.vl-day { display:inline-flex; align-items:center; gap:8px;
  margin-bottom:14px; padding:6px 13px; font-size:9.5px; font-weight:700;
  letter-spacing:.26em; text-transform:uppercase; color:var(--gold);
  border-radius:100px; box-shadow:inset 0 0 0 1px rgba(255,215,0,.35); }
.vl-day::before { content:''; width:5px; height:5px; border-radius:50%;
  background:var(--gold); }
.scena-nota { margin-top:clamp(16px,2vw,24px); font-size:11px;
  color:var(--text-3); letter-spacing:.02em; max-width:74ch;
  line-height:1.6; }
.scena-nota a { color:var(--text-2); }

/* ── 1 · LE PARTENZE — il tabellone Solari del mercato ──────────────── */
.solari { margin-top:clamp(24px,3vw,36px); background:#060606;
  border-radius:16px; box-shadow:inset 0 0 0 1px var(--line),
  0 30px 80px rgba(0,0,0,.5); padding:clamp(14px,2vw,26px);
  perspective:900px; }
.sol-testa, .sol-riga { display:grid;
  grid-template-columns:minmax(0,1.5fr) minmax(0,.9fr) minmax(0,.55fr)
    minmax(0,1.4fr); gap:clamp(10px,1.6vw,26px); align-items:center; }
.sol-testa { padding:6px 10px 12px; font-size:9px; font-weight:700;
  letter-spacing:.3em; text-transform:uppercase; color:var(--text-3);
  border-bottom:1px solid var(--line); }
.sol-riga { padding:clamp(11px,1.5vw,15px) 10px;
  border-bottom:1px solid var(--line-0); transform-origin:50% 0;
  font-size:clamp(11px,1.15vw,14px); font-weight:600;
  letter-spacing:.14em; text-transform:uppercase; }
.sol-riga:last-child { border-bottom:0; }
.sol-riga .nome { color:var(--text); }
.sol-riga .stato { color:var(--gold); position:relative; }
.sol-riga .male { color:#FF7A6B; }
.sol-riga .stato.muto { color:var(--text-3); }
.sol-riga .tempo { font-family:var(--display); font-weight:300;
  letter-spacing:.04em; color:var(--text-2); font-size:clamp(13px,1.3vw,17px); }
.sol-riga .nota { font-size:10.5px; font-weight:500; letter-spacing:.04em;
  text-transform:none; color:var(--text-3); line-height:1.5; }
/* la riga viva: gli stati impilati, uno visibile */
.sol-vivo { display:grid; }
.sol-vivo > span { grid-area:1/1; transition:opacity .35s ease,
  transform .5s cubic-bezier(.3,1.2,.4,1); backface-visibility:hidden; }
.sol-vivo > span:nth-child(2), .sol-vivo > span:nth-child(3)
  { opacity:0; transform:rotateX(80deg); }
html.cine .sol-riga { opacity:0; transform:rotateX(-82deg); }
html.cine .scena.p1 .r1, html.cine .scena.p2 .r2,
html.cine .scena.p3 .r3, html.cine .scena.p4 .r4,
html.cine .scena.p5 .r5, html.cine .scena.p6 .r6 { opacity:1;
  transform:none; transition:opacity .45s ease,
  transform .8s cubic-bezier(.3,1.3,.35,1); }
/* p7: LAST CALL · p8: GONE (senza cine resta lo stato 1 — il fatto) */
.scena.p7 .sol-vivo > span:nth-child(1) { opacity:0; transform:rotateX(-80deg); }
.scena.p7 .sol-vivo > span:nth-child(2) { opacity:1; transform:none; }
.scena.p8 .sol-vivo > span:nth-child(2) { opacity:0; transform:rotateX(-80deg); }
.scena.p8 .sol-vivo > span:nth-child(3) { opacity:1; transform:none; }
@media (max-width:640px){
  .sol-testa, .sol-riga { grid-template-columns:minmax(0,1.4fr)
    minmax(0,.9fr) minmax(0,.55fr); }
  .sol-testa span:nth-child(4), .sol-riga .nota { display:none; } }

/* ── 2 · IL RADAR — la macchina lavora ──────────────────────────────── */
.rad-grid { margin-top:clamp(20px,2.6vw,32px); display:grid;
  grid-template-columns:minmax(0,1fr); gap:clamp(24px,3.5vw,48px);
  align-items:center; }
@media (min-width:960px){ .rad-grid
  { grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr); } }
.rad { position:relative; width:min(100%,min(46vh,460px));
  aspect-ratio:1; margin:0 auto; border-radius:50%;
  background:radial-gradient(circle,
    rgba(255,215,0,.05), rgba(255,215,0,.008) 62%, transparent 70%);
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.16); }
.rad::before, .rad::after { content:''; position:absolute; inset:0;
  border-radius:50%; pointer-events:none; }
.rad::before { transform:scale(.66);
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.1); }
.rad::after { transform:scale(.33);
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.1); }
.rad-mira { position:absolute; inset:0; pointer-events:none; }
.rad-mira::before, .rad-mira::after { content:''; position:absolute;
  background:rgba(255,215,0,.08); }
.rad-mira::before { left:50%; top:2%; bottom:2%; width:1px; }
.rad-mira::after { top:50%; left:2%; right:2%; height:1px; }
.rad-sweep { position:absolute; inset:0; border-radius:50%;
  overflow:hidden; }
.rad-sweep::before { content:''; position:absolute; inset:-2%;
  background:conic-gradient(from 0deg, rgba(255,215,0,.22),
    transparent 22%, transparent);
  animation:radgira 5.5s linear infinite; }
@keyframes radgira { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce){ .rad-sweep::before
  { animation:none; } }
.dot { position:absolute; width:9px; height:9px; margin:-4.5px;
  border-radius:50%; background:rgba(250,250,250,.5);
  transition:opacity .6s ease, transform .6s ease,
    background .6s ease; }
.dot.oro { width:12px; height:12px; margin:-6px; background:var(--gold);
  box-shadow:0 0 14px rgba(255,215,0,.6); }
.dot.ag { background:rgba(250,250,250,.4); }
.dot.ag::before, .dot.ag::after { content:''; position:absolute;
  left:50%; top:50%; width:16px; height:1.5px; background:#FF7A6B;
  opacity:1; transition:opacity .5s ease; }
.dot.ag::before { transform:translate(-50%,-50%) rotate(45deg); }
.dot.ag::after { transform:translate(-50%,-50%) rotate(-45deg); }
.dot-eti { position:absolute; transform:translate(12px,-50%);
  white-space:nowrap; font-size:10px; font-weight:700;
  letter-spacing:.12em; text-transform:uppercase; color:var(--text-2);
  transition:opacity .6s ease; }
.dot-eti b { color:var(--gold); font-weight:700; }
.dot-eti.manca { transform:translate(calc(-100% - 12px),-50%); }
/* stati (default = storia completa; cine li arma) */
html.cine #radar .dot, html.cine #radar .dot-eti { opacity:0; }
html.cine #radar.p1 .dot { opacity:1; }
html.cine #radar.p2 .dot.gr { opacity:.14; }
html.cine #radar .dot.ag::before, html.cine #radar .dot.ag::after
  { opacity:0; }
html.cine #radar.p3 .dot.ag::before,
html.cine #radar.p3 .dot.ag::after { opacity:1; }
html.cine #radar.p3 .dot.ag { opacity:.35; }
html.cine #radar.p4 .dot-eti { opacity:1; }
html.cine #radar.p4 .dot.oro { transform:scale(1.25); }
.rad-conta { font-family:var(--display); font-weight:200; line-height:1;
  font-size:clamp(56px,7vw,104px); color:var(--gold);
  letter-spacing:-.03em; display:grid; }
.rad-conta span { grid-area:1/1; transition:opacity .45s ease; }
.rad-conta small { font-size:.36em; font-weight:250; color:var(--text-2);
  letter-spacing:0; margin-left:.18em; }
.rad-did { margin-top:14px; display:grid; min-height:3.6em; }
.rad-did p { grid-area:1/1; font-size:13.5px; line-height:1.65;
  color:var(--text-2); max-width:44ch; transition:opacity .45s ease; }
.rad-did b { color:var(--text); }
/* default: si vede l'ultimo quadro */
.rad-conta .c14, .rad-did .d1, .rad-did .d2 { opacity:0; }
.rad-conta .c3, .rad-did .d3 { opacity:1; }
html.cine #radar .rad-conta span, html.cine #radar .rad-did p
  { opacity:0; }
html.cine #radar.p1 .c14, html.cine #radar.p1 .d1 { opacity:1; }
html.cine #radar.p2 .c14 { opacity:0; }
html.cine #radar.p2 .c3, html.cine #radar.p2 .d2 { opacity:1; }
html.cine #radar.p2 .d1 { opacity:0; }
html.cine #radar.p4 .d2 { opacity:0; }
html.cine #radar.p4 .d3 { opacity:1; }
.rad-strip { margin-top:clamp(18px,2.4vw,26px); display:flex;
  gap:10px 26px; flex-wrap:wrap; padding:14px 18px;
  background:var(--card); border-radius:12px;
  box-shadow:inset 0 0 0 1px var(--line);
  transition:opacity .6s ease, transform .6s ease; }
.rad-strip div { font-size:10.5px; font-weight:600; letter-spacing:.16em;
  text-transform:uppercase; color:var(--text-3); }
.rad-strip b { display:block; margin-bottom:2px;
  font-family:var(--display); font-size:19px; font-weight:300;
  letter-spacing:0; color:var(--gold); }
html.cine #radar .rad-strip { opacity:0; transform:translateY(14px); }
html.cine #radar.p5 .rad-strip { opacity:1; transform:none; }

/* ── 3 · LA CAMMINATA — il timbro ───────────────────────────────────── */
.cam-mazzo { margin-top:clamp(24px,3vw,38px); display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:clamp(12px,1.8vw,22px); }
@media (max-width:760px){ .cam-mazzo
  { grid-template-columns:minmax(0,1fr); max-width:420px; } }
.cam-casa { position:relative; padding:clamp(16px,2vw,24px);
  background:var(--card); border-radius:14px;
  box-shadow:inset 0 0 0 1px var(--line); }
.cam-casa h3 { font-family:var(--display); font-weight:300;
  font-size:clamp(17px,1.8vw,22px); letter-spacing:-.01em;
  display:flex; align-items:baseline; justify-content:space-between;
  gap:10px; }
.cam-casa h3 b { font-weight:250; color:var(--gold); font-size:.9em; }
.cam-casa .m { margin-top:6px; font-size:11.5px; color:var(--text-3);
  letter-spacing:.03em; }
.cam-punti { margin-top:14px; display:grid; gap:7px; }
.cam-punti div { display:grid;
  grid-template-columns:56px minmax(0,1fr) 26px; gap:8px;
  align-items:center; font-size:9.5px; font-weight:700;
  letter-spacing:.14em; text-transform:uppercase; color:var(--text-3); }
.cam-punti i { height:3px; border-radius:2px;
  background:rgba(255,255,255,.09); overflow:hidden; display:block;
  font-style:normal; position:relative; }
.cam-punti i::before { content:''; position:absolute; inset:0;
  transform-origin:0 50%; transform:scaleX(var(--w,1));
  background:var(--gold); border-radius:2px; }
.cam-punti b { color:var(--text-2); text-align:right; }
.cam-timbro { position:absolute; left:50%; top:46%;
  --posa:translate(-50%,-50%) rotate(-8deg);
  padding:7px 12px; font-size:10px; font-weight:800;
  letter-spacing:.2em; text-transform:uppercase; color:#FF7A6B;
  border:1.5px solid #FF7A6B; border-radius:4px;
  transform:var(--posa); background:rgba(5,5,5,.72);
  transition:opacity .35s ease, transform .5s cubic-bezier(.2,1.6,.4,1); }
.cam-timbro small { display:block; font-size:8px; font-weight:600;
  letter-spacing:.12em; color:rgba(255,122,107,.85); margin-top:2px; }
.cam-casa.morta { transition:opacity .5s ease .1s, filter .5s ease .1s; }
.scena.p2 .cam-casa.morta { opacity:.45; filter:saturate(.4); }
html.cine #selezione .cam-timbro { opacity:0;
  transform:var(--posa) scale(2.4); }
html.cine #selezione.p2 .cam-timbro { opacity:1;
  transform:var(--posa) scale(1); }
.cam-verita { margin-top:clamp(18px,2.4vw,28px); max-width:64ch;
  font-size:14px; line-height:1.75; color:var(--text-2);
  transition:opacity .6s ease, transform .6s ease; }
.cam-verita b { color:var(--text); }
html.cine #selezione .cam-verita { opacity:0; transform:translateY(12px); }
html.cine #selezione.p3 .cam-verita { opacity:1; transform:none; }

/* ── 5 · LA SCATOLA NERA ────────────────────────────────────────────── */
.nera-capo { display:flex; align-items:flex-end; gap:clamp(18px,3vw,44px);
  flex-wrap:wrap; }
.nera-cento { font-family:var(--display); font-weight:200;
  font-size:clamp(58px,7.5vw,112px); line-height:.95; color:var(--gold);
  letter-spacing:-.03em; }
.nera-cento small { display:block; margin-top:8px; font-family:var(--sans);
  font-size:11px; font-weight:600; letter-spacing:.18em;
  text-transform:uppercase; color:var(--text-3); max-width:26ch;
  line-height:1.6; }
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
.nera-onesta { margin-top:clamp(16px,2vw,22px); display:grid; gap:9px;
  max-width:74ch; }
.nera-onesta span { position:relative; padding-left:17px;
  font-size:12.5px; color:var(--text-3); line-height:1.6; }
.nera-onesta span::before { content:''; position:absolute; left:0;
  top:.62em; width:7px; height:1px; background:var(--gold); }
.nera-onesta b { color:var(--text-2); }
.verifica-righe { margin-top:14px; display:flex; gap:10px 22px;
  flex-wrap:wrap; }
.verifica-righe a { font-size:12px; color:var(--text-3);
  text-decoration:none; letter-spacing:.02em; transition:color .3s ease; }
.verifica-righe a:hover { color:var(--gold); }"""

# ── i quattordici contatti del radar ─────────────────────────────────────
DOTS = """
        <span class="dot gr" style="left:24%;top:18%"></span>
        <span class="dot gr" style="left:70%;top:14%"></span>
        <span class="dot gr" style="left:86%;top:38%"></span>
        <span class="dot gr" style="left:12%;top:44%"></span>
        <span class="dot gr" style="left:38%;top:78%"></span>
        <span class="dot gr" style="left:80%;top:76%"></span>
        <span class="dot gr" style="left:56%;top:8%"></span>
        <span class="dot gr" style="left:8%;top:68%"></span>
        <span class="dot gr" style="left:64%;top:88%"></span>
        <span class="dot gr" style="left:30%;top:60%"></span>
        <span class="dot ag" style="left:52%;top:72%"></span>
        <span class="dot oro" style="left:44%;top:30%"></span>
        <span class="dot oro" style="left:60%;top:52%"></span>
        <span class="dot oro" style="left:26%;top:40%"></span>
        <span class="dot-eti" style="left:44%;top:30%">Corso Trieste
          · <b>92</b></span>
        <span class="dot-eti" style="left:60%;top:52%">Salario
          · <b>87</b></span>
        <span class="dot-eti manca" style="left:26%;top:40%">Pinciano
          · <b>82</b></span>"""

# ── le scene ─────────────────────────────────────────────────────────────
SCENE = """<!-- ══ 1 · LE PARTENZE — il mercato come tabellone Solari ═══════════════ -->
<section class="scena section-dark" id="partenze" style="--durata:280vh"
  data-passi="0.05,0.14,0.23,0.32,0.41,0.5,0.68,0.86">
  <div class="scena-vp">
    <div class="container">
      <div class="sale">
        <span class="eyebrow"><i></i>Rome departures · the market, live</span>
        <h2 class="titolo">The board Rome<br>
          <span class="hl">never shows you.</span></h2>
      </div>
      <div class="solari" role="table"
        aria-label="The Rome rental market, stated as a departures board">
        <div class="sol-testa" role="row"><span>Listing</span>
          <span>Status</span><span>Survives</span><span>Remark</span></div>
        <div class="sol-riga r1" role="row">
          <span class="nome">Good 2-bed, fair price</span>
          <span class="stato sol-vivo"><span>Boarding</span>
            <span class="male">Last call</span>
            <span class="male">Gone</span></span>
          <span class="tempo sol-vivo"><span>24–72h</span>
            <span>&lt; 24h</span><span class="male">—</span></span>
          <span class="nota sol-vivo"><span>dozens of enquiries in the
            first hours</span><span>the queue closed while you
            slept</span><span>went while you scrolled</span></span>
        </div>
        <div class="sol-riga r2" role="row">
          <span class="nome">The phantom listing</span>
          <span class="stato male">Scam · daily</span>
          <span class="tempo male">—</span>
          <span class="nota">a deposit wired for a flat that doesn't
            exist</span>
        </div>
        <div class="sol-riga r3" role="row">
          <span class="nome">The double deposit</span>
          <span class="stato male">Scam · weekly</span>
          <span class="tempo male">—</span>
          <span class="nota">the same keys promised to three
            people</span>
        </div>
        <div class="sol-riga r4" role="row">
          <span class="nome">Agency relisting</span>
          <span class="stato muto">Duplicate</span>
          <span class="tempo">—</span>
          <span class="nota">the same flat, re-posted at another
            price</span>
        </div>
        <div class="sol-riga r5" role="row">
          <span class="nome">The off-market home</span>
          <span class="stato">Never listed</span>
          <span class="tempo">—</span>
          <span class="nota">moves landlord-to-agency, on
            relationships</span>
        </div>
        <div class="sol-riga r6" role="row">
          <span class="nome">Your search from abroad</span>
          <span class="stato muto">Delayed</span>
          <span class="tempo">—</span>
          <span class="nota">you join every queue from another
            timezone, while you sleep</span>
        </div>
      </div>
      <p class="scena-nota">A dramatisation of our published market
        facts — every line sourced: a good listing survives 24–72 hours;
        the scam patterns and their frequency are documented in
        <a href="/blog-scam-bible.html">our scam guide</a> (7 patterns,
        35+ red flags). And the law nobody quotes: deposit capped at
        three months — an unregistered contract voids your residency
        paperwork.</p>
    </div>
  </div>
</section>

<!-- ══ 2 · IL RADAR — la macchina lavora ════════════════════════════════ -->
<section class="scena" id="radar" style="--durata:300vh"
  data-passi="0.1,0.3,0.48,0.64,0.82">
  <div class="scena-vp">
    <div class="container">
      <div class="sale">
        <span class="vl-day">Day 0 — armed within 24h</span>
        <h2 class="titolo">While you sleep,<br>
          <span class="hl">the sweep continues.</span></h2>
      </div>
      <div class="rad-grid">
        <div class="rad" aria-hidden="true">
          <span class="rad-mira"></span>
          <span class="rad-sweep"></span>""" + DOTS + """
        </div>
        <div>
          <div class="rad-conta" aria-hidden="true">
            <span class="c14">14<small> spotted</small></span>
            <span class="c3">3<small> reach you</small></span>
          </div>
          <div class="rad-did">
            <p class="d1">Your brief, told once — five lines. The
              scanner reads the market <b>every fifteen minutes, day and
              night</b>, and scores everything against it.</p>
            <p class="d2">Anything under <b>sixty out of a hundred</b>
              never touches your phone. Few and relevant beats many and
              useless — that is the product.</p>
            <p class="d3">One was an <b>agency relisting</b> — stored,
              never pushed: we won't send you to pay someone else's
              commission. Three survive, scored on your brief.</p>
          </div>
          <div class="rad-strip" aria-label="The machine's real numbers">
            <div><b>96</b>scans a day</div>
            <div><b>50·30·20</b>budget · beds · district</div>
            <div><b>60</b>push threshold</div>
            <div><b>0</b>agency ads pushed</div>
          </div>
        </div>
      </div>
      <p class="scena-nota">Illustrative sweep — the homes are samples;
        the schedules and weights are our production system.</p>
    </div>
  </div>
</section>

<!-- ══ 3 · LA CAMMINATA — il timbro ═════════════════════════════════════ -->
<section class="scena section-dark" id="selezione" style="--durata:240vh"
  data-passi="0.12,0.42,0.68">
  <div class="scena-vp">
    <div class="container">
      <div class="sale">
        <span class="vl-day">Day 1–3 — walked in person</span>
        <h2 class="titolo">The camera lies.<br>
          <span class="hl">Feet don't.</span></h2>
      </div>
      <div class="cam-mazzo">
        <div class="cam-casa">
          <h3>Corso Trieste <b>€1.850</b></h3>
          <p class="m">2 bed · 78 m² · balcony · off-market</p>
          <div class="cam-punti">
            <div><span>Budget</span><i style="--w:.92"></i><b>92</b></div>
            <div><span>Beds</span><i style="--w:1"></i><b>✓</b></div>
            <div><span>Area</span><i style="--w:1"></i><b>✓</b></div>
          </div>
        </div>
        <div class="cam-casa morta">
          <h3>Pinciano <b>€2.050</b></h3>
          <p class="m">2 bed · 85 m² · elevator</p>
          <div class="cam-punti">
            <div><span>Budget</span><i style="--w:.82"></i><b>82</b></div>
            <div><span>Beds</span><i style="--w:1"></i><b>✓</b></div>
            <div><span>Area</span><i style="--w:1"></i><b>✓</b></div>
          </div>
          <span class="cam-timbro">Rejected<small>damp behind the
            wardrobe</small></span>
        </div>
        <div class="cam-casa">
          <h3>Salario <b>€1.690</b></h3>
          <p class="m">2 bed · 72 m² · renovated</p>
          <div class="cam-punti">
            <div><span>Budget</span><i style="--w:.87"></i><b>87</b></div>
            <div><span>Beds</span><i style="--w:1"></i><b>✓</b></div>
            <div><span>Area</span><i style="--w:1"></i><b>✓</b></div>
          </div>
        </div>
      </div>
      <p class="cam-verita">It scored 82. The photos were beautiful. The
        wall behind the wardrobe wasn't. <b>Every home on your shortlist
        is walked in person before you see it</b> — what survives the
        walk reaches your deck. Sample homes; the discipline is the
        real system.</p>
    </div>
  </div>
</section>

<!-- ══ 4 · IL KIT — day 3, sul tuo telefono ═════════════════════════════ -->
<section class="section" id="kit">
  <div class="container">
    <div class="sale">
      <span class="vl-day">Day 3 — on your phone</span>
      <h2 class="titolo">Touch it<br><span class="hl">before you pay.</span></h2>
    </div>
    """ + TOCCA + """
  </div>
</section>

<!-- ══ 5 · LA SCATOLA NERA — regola + clausole verbatim ═════════════════ -->
<section class="section section-dark" id="garanzia">
  <div class="container">
    <div class="nera-capo sale">
      <div class="nera-cento">100%<small>refunded if we don't deliver —
        by contract, not courtesy</small></div>
      <div style="flex:1 1 340px">
        <span class="eyebrow"><i></i>Day 15 — the trigger</span>
        <h2 class="titolo">“Never pay upfront in Rome.”<br>
          <span class="hl">Correct — keep following it.</span></h2>
        <p class="sotto">That rule protects you from rental scams — we
          teach it ourselves, in our own scam guide. This is mechanically
          different, dimension by dimension:</p>
      </div>
    </div>
    """ + REGOLA + """
    <div class="reperto-eti sale" style="margin:clamp(26px,3.4vw,38px) 0 14px;
      display:flex; align-items:center; gap:12px">
      <span style="font-size:10.5px;font-weight:600;letter-spacing:.18em;
        text-transform:uppercase;color:var(--text-3)">The clause,
        verbatim</span></div>
    <div class="clausola sale">
      <blockquote>PFS costs €350 (fixed fee). If we do not present at
        least <b>3 options matching your agreed criteria within 15
        days</b>, the €350 is <b>refunded in full</b>. On success it is
        <b>deducted from the agency fee</b>.</blockquote>
      <cite>Terms of Service — §4.2 Property Finding Service</cite>
    </div>
    <div class="clausola sale">
      <blockquote>…the €350 is refunded in full — <b>no admin fee
        applies</b>.</blockquote>
      <cite>Terms of Service — §7.1-bis Cancellation carve-out</cite>
    </div>
    <div class="nera-onesta sale">
      <span><b>15 days is the refund trigger, not a delivery date</b> —
        the right home takes days, sometimes weeks; we don't stop until
        you're settled.</span>
      <span><b>“Three options” means criteria agreed with you in
        writing</b> on the first call — the clause pays on those, not on
        our interpretation.</span>
      <span><b>Our own fee is declared</b>: one month's rent or 10% of
        annual — whichever is lower (§4.1). The €350 comes off it. No
        viewing or application fees (§4.3).</span>
      <span><b>We can't invent supply</b> — if your criteria can't exist
        in Rome at your budget, we say it on the first call,
        brutally.</span>
    </div>
  </div>
</section>

<!-- ══ 6 · LA VERIFICA — controllaci, non fidarti ═══════════════════════ -->
<section class="section" id="verifica2">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Verifiable, not claimed</span>
      <h2 class="titolo">Don't trust us.<br><span class="hl">Check us.</span></h2>
    </div>
    """ + VERIFICA + """

    <div class="verifica-righe sale">
      <a href="/terms.html">Egidi Immobiliare S.r.l. — P.IVA 17322991005 →</a>
      <a href="https://euipo.europa.eu/eSearch/#details/trademarks/019317594"
        target="_blank" rel="noopener">EU trademark 019317594 on EUIPO ↗</a>
      <a href="/blog-scam-bible.html">Our Rome rental scam guide →</a>
    </div>
  </div>
</section>

"""

# ── demolizione e innesto ────────────────────────────────────────────────
D0M = '<!-- ══ IL CONTO'
D1M = "<!-- ══ L'IMBARCO"
uno(s, D0M)
uno(s, D1M)
s = s[:s.index(D0M)] + SCENE + s[s.index(D1M):]

uno(s, CSS_ANCORA)
s = s.replace(CSS_ANCORA, CSS)

TAPPE_A = ("var TAPPE = ['conto', 'regola', 'macchina', 'tocca', 'verifica',"
           "\n    'imbarco', 'faq'];")
uno(s, TAPPE_A)
s = s.replace(TAPPE_A, "var TAPPE = ['partenze', 'radar', 'selezione', "
                       "'kit', 'garanzia',\n    'verifica2', 'imbarco', "
                       "'faq'];")

CODA_A = '</script>\n\n<footer class="footer">'
uno(s, CODA_A)
s = s.replace(CODA_A, """</script>
<script>
/* IL VOLO — la regia delle scene: sticky + passi discreti su --f.
   Additiva e degradabile: senza JS o con reduced-motion la pagina resta
   COMPLETA e statica (html.cine arma la regia, mai il contrario). */
(function () {
  'use strict';
  var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var scene = [].slice.call(document.querySelectorAll('.scena'));
  if (!scene.length || ridotto || !('IntersectionObserver' in window))
    return;
  document.documentElement.classList.add('cine');
  var attesa = false;
  function passo() {
    attesa = false;
    scene.forEach(function (sc) {
      var r = sc.getBoundingClientRect();
      var tot = sc.offsetHeight - innerHeight;
      if (tot <= 0) return;
      var f = Math.max(0, Math.min(1, -r.top / tot));
      sc.style.setProperty('--f', f.toFixed(4));
      (sc.dataset.passi || '').split(',').forEach(function (sog, i) {
        sc.classList.toggle('p' + (i + 1), f >= parseFloat(sog));
      });
    });
  }
  addEventListener('scroll', function () {
    if (!attesa) { attesa = true; requestAnimationFrame(passo); }
  }, { passive: true });
  addEventListener('resize', passo);
  passo();

  /* la profondita' del volo, misurata */
  var visti = {};
  var occhio = new IntersectionObserver(function (vs) {
    vs.forEach(function (v) {
      if (!v.isIntersecting) return;
      var id = v.target.id;
      if (visti[id]) return;
      visti[id] = 1;
      try { gtag('event', 'pfs_scene', { s: id }); } catch (e) {}
    });
  }, { threshold: .15 });
  ['partenze', 'radar', 'selezione', 'kit', 'garanzia', 'verifica2']
    .forEach(function (id) {
      var el = document.getElementById(id);
      if (el) occhio.observe(el);
    });
})();
</script>

<footer class="footer">""")

# ── verifiche finali ─────────────────────────────────────────────────────
for ago in ('id="partenze"', 'id="radar"', 'id="selezione"', 'id="kit"',
            'id="garanzia"', 'id="verifica2"', 'id="checkin"',
            'id="ckForm"', 'id="imbarco"', 'id="vFoto"', 'id="pmNome"',
            'pfs_scene', 'class="regola2 sale"', 'html.cine'):
    if ago == 'html.cine':
        assert s.count(ago) >= 10, 'cine css'
        continue
    uno(s, ago, OUT)
assert s.count('class="clausola sale"') == 2
assert s.count('class="dot oro"') == 3
assert s.count('class="dot gr"') == 10
assert s.count('sol-riga r') == 6
for morto in ('id="conto"', 'id="regola"', 'id="macchina"', 'id="tocca"',
              'id="verifica"\x3e', 'id="prezzo"', 'id="perche"',
              'id="finder"', 'href="#conto"', 'href="#macchina"'):
    assert morto not in s, f'residuo: {morto}'
assert s.index('id="partenze"') < s.index('id="radar"') \
    < s.index('id="selezione"') < s.index('id="kit"') \
    < s.index('id="garanzia"') < s.index('id="verifica2"') \
    < s.index('id="imbarco"') < s.index('id="faq"')

open(OUT, 'w', encoding='utf-8').write(s)
print(OUT, '-> il volo,', len(s) // 1024, 'KB')
