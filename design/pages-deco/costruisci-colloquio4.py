#!/usr/bin/env python3
# IL COLLOQUIO 4.0 — la stessa sostanza (sette obiezioni vere, sette
# risposte on the record, sette reperti), ricomposta PER L'OCCHIO dopo la
# bocciatura della 2.0 («muri di testo»): domanda in scala manifesto con
# zigzag destra/sinistra, risposta distillata in UNA lead grande + un
# dettaglio corto (58 battute di riga, mai un muro), e su ogni atto un
# COLPO — la cifra gigante d'oro con tre righe micro: chi scorre soltanto
# i colpi legge l'intera vendita (100% · 24-72h · 96 · 4.9 · 0 · §4.2 ·
# 24h). Il ticket-hero resta INTATTO (richiesta esplicita).
# Base: property-finding.html. Output: preview-pfs-colloquio.html.
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
    """Dal marcatore d'inizio a </section>, senza la chiusura del
    .container (l'ultimo </div>)."""
    uno(s, inizio)
    a = s.index(inizio)
    b = s.index('</section>', a)
    blocco = s[a:b].rstrip()
    assert blocco.endswith('</div>'), inizio
    return blocco[:-len('</div>')].rstrip()


REGOLA = estrai('<div class="regola2 sale">')
CONTO = estrai('<div class="conto sale">')
FINDER = estrai('<div class="finder quadro" id="finder"')
PASSI = estrai('<div class="passi4 sale coro">')
TOCCA = estrai('<div class="tocca sale">')
VERIFICA = estrai('<div class="verifica sale">')
uno(s, '<div class="inclusi sale">')
a = s.index('<div class="inclusi sale">')
b = s.index('<div class="diverso quadro sale"', a)
INCLUSI = s[a:b].rstrip()
assert INCLUSI.endswith('</div>'), 'inclusi'

# ── CSS ──────────────────────────────────────────────────────────────────
CSS_ANCORA = ".imbarco-garanzia::before { content:'✓'; color:var(--gold); }"
CSS = CSS_ANCORA + """

/* ══ COLLOQUIO 3.0 · composto per l'occhio ════════════════════════════ */
.titolo-xl { font-size:clamp(32px,5vw,58px) !important; }
.a3-testa { max-width:1000px; }
.atto3.inv .a3-testa { margin-left:auto; text-align:right; }
.a3-alto { display:flex; align-items:baseline; gap:18px; flex-wrap:wrap; }
.atto3.inv .a3-alto { justify-content:flex-end; }
.a3-num { font-family:var(--display); font-weight:200; line-height:.85;
  font-size:clamp(62px,10vw,128px); color:rgba(255,215,0,.11);
  letter-spacing:-.03em; }
.a3-tema { font-size:10px; font-weight:700; letter-spacing:.32em;
  text-transform:uppercase; color:var(--text-3); }
.a3-q { margin-top:8px; font-family:var(--display); font-weight:200;
  font-size:clamp(26px,4vw,52px); line-height:1.12;
  letter-spacing:-.02em; text-wrap:balance; }
.a3-q b { font-weight:200; color:var(--gold); }
.a3-q::before { content:'\\201C'; color:var(--gold); margin-right:2px; }
.a3-q::after { content:'\\201D'; color:var(--gold); }
.a3-chi { margin-top:12px; font-size:10px; font-weight:700;
  letter-spacing:.24em; text-transform:uppercase; color:var(--text-3); }
.a3-corpo { margin-top:clamp(28px,3.6vw,48px); display:grid;
  grid-template-columns:minmax(0,1fr); gap:clamp(28px,4.5vw,64px);
  align-items:center; }
.a3-avv { display:flex; align-items:center; gap:10px;
  margin-bottom:16px; }
.a3-avv i { width:26px; height:26px; border-radius:50%; flex:none;
  display:inline-flex; align-items:center; justify-content:center;
  font-style:normal; font-size:12px; font-weight:700; color:#0A0A05;
  background:var(--gold); }
.a3-avv span { font-size:10px; font-weight:700; letter-spacing:.22em;
  text-transform:uppercase; color:var(--text-3); }
.a3-lead { font-family:var(--display); font-weight:250;
  font-size:clamp(20px,2.4vw,29px); line-height:1.32;
  letter-spacing:-.01em; max-width:24ch; text-wrap:balance; }
.a3-lead b { font-weight:300; color:var(--gold); }
.a3-det { margin-top:16px; font-size:15px; line-height:1.8;
  color:var(--text-2); max-width:58ch; }
.a3-det b { color:var(--text); font-weight:600; }
.a3-colpo { padding-top:20px; border-top:1px solid var(--line-gold); }
.a3-cifra { font-family:var(--display); font-weight:200;
  font-size:clamp(56px,7.5vw,116px); line-height:.95; color:var(--gold);
  letter-spacing:-.03em; white-space:nowrap; }
.a3-cifra small { font-size:.42em; font-weight:250;
  letter-spacing:-.01em; }
.a3-cifra-eti { margin-top:12px; font-size:11px; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase; color:var(--text-3);
  max-width:30ch; line-height:1.6; }
.a3-righe { margin-top:18px; display:grid; gap:9px; }
.a3-righe span { position:relative; padding-left:17px; font-size:12.5px;
  color:var(--text-3); letter-spacing:.02em; line-height:1.5; }
.a3-righe span::before { content:''; position:absolute; left:0;
  top:.62em; width:7px; height:1px; background:var(--gold); }
.a3-righe b { color:var(--text-2); font-weight:600; }
@media (min-width:980px){
  .a3-corpo { grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr); }
  .a3-colpo { border-top:0; padding-top:0;
    justify-self:end; }
  .atto3.inv .a3-colpo { order:-1; justify-self:start; }
}
.prove { margin-top:18px; display:flex; gap:8px; flex-wrap:wrap; }
.prove a { display:inline-flex; align-items:center; gap:7px;
  padding:9px 15px; font-size:11.5px; font-weight:600;
  color:var(--text-2); text-decoration:none; border-radius:100px;
  box-shadow:inset 0 0 0 1px var(--line);
  transition:color .3s ease, box-shadow .3s ease, transform .3s ease; }
.prove a:hover { color:var(--gold);
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.4);
  transform:translateY(-1px); }
.prove a i { font-style:normal; color:var(--gold); }
.reperto-eti { margin:clamp(30px,4vw,46px) 0 14px; display:flex;
  align-items:center; gap:12px; }
.reperto-eti b { flex:none; padding:5px 11px; font-size:9.5px;
  font-weight:700; letter-spacing:.22em; text-transform:uppercase;
  color:var(--gold); border-radius:3px;
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.4); }
.reperto-eti span { font-size:10.5px; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase; color:var(--text-3); }
.reperto-eti::after { content:''; flex:1; height:1px;
  background:linear-gradient(90deg, var(--line), transparent); }
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
.clausola-vai { display:inline-flex; margin-top:16px; font-size:12px;
  font-weight:600; color:var(--text-2); text-decoration:none;
  letter-spacing:.02em; transition:color .3s ease; }
.clausola-vai:hover { color:var(--gold); }
.verifica-righe { margin-top:14px; display:flex; gap:10px 22px;
  flex-wrap:wrap; }
.verifica-righe a { font-size:12px; color:var(--text-3);
  text-decoration:none; letter-spacing:.02em;
  transition:color .3s ease; }
.verifica-righe a:hover { color:var(--gold); }
@media (max-width:640px){
  .a3-q { font-size:clamp(24px,7vw,30px); }
  .a3-lead { max-width:none; }
  .a3-cifra { font-size:clamp(52px,16vw,72px); } }

/* ── il tabellone Solari del mercato (reperto dell'atto 2) ──────────── */
.solari { background:#060606; border-radius:16px;
  box-shadow:inset 0 0 0 1px var(--line), 0 30px 80px rgba(0,0,0,.5);
  padding:clamp(14px,2vw,26px); perspective:900px; }
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
.sol-riga .stato { color:var(--gold); }
.sol-riga .male { color:#FF7A6B; }
.sol-riga .stato.muto { color:var(--text-3); }
.sol-riga .tempo { font-family:var(--display); font-weight:300;
  letter-spacing:.04em; color:var(--text-2);
  font-size:clamp(13px,1.3vw,17px); }
.sol-riga .nota { font-size:10.5px; font-weight:500;
  letter-spacing:.04em; text-transform:none; color:var(--text-3);
  line-height:1.5; }
.sol-vivo { display:grid; }
.sol-vivo > span { grid-area:1/1; transition:opacity .35s ease,
  transform .5s cubic-bezier(.3,1.2,.4,1); backface-visibility:hidden; }
.sol-vivo > span:nth-child(2), .sol-vivo > span:nth-child(3)
  { opacity:0; transform:rotateX(80deg); }
.solari.s2 .sol-vivo > span:nth-child(1),
.solari.s3 .sol-vivo > span:nth-child(1)
  { opacity:0; transform:rotateX(-80deg); }
.solari.s2 .sol-vivo > span:nth-child(2)
  { opacity:1; transform:none; }
.solari.s3 .sol-vivo > span:nth-child(2)
  { opacity:0; transform:rotateX(-80deg); }
.solari.s3 .sol-vivo > span:nth-child(3)
  { opacity:1; transform:none; }
/* l'ingresso a cascata: armato SOLO dal JS */
.solari.arma .sol-riga { opacity:0; transform:rotateX(-82deg); }
.solari.viva .sol-riga { opacity:1; transform:none;
  transition:opacity .45s ease,
    transform .8s cubic-bezier(.3,1.3,.35,1); }
.solari-nota { margin-top:12px; font-size:11px; color:var(--text-3);
  letter-spacing:.02em; max-width:74ch; line-height:1.6; }
.solari-nota a { color:var(--text-2); }
@media (max-width:640px){
  .sol-testa, .sol-riga { grid-template-columns:minmax(0,1.4fr)
    minmax(0,.9fr) minmax(0,.55fr); }
  .sol-testa span:nth-child(4), .sol-riga .nota { display:none; } }

/* ── la camminata: il timbro (dentro l'atto 3) ──────────────────────── */
.cam-mazzo { display:grid; grid-template-columns:repeat(3,minmax(0,1fr));
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
  background:rgba(255,255,255,.09); display:block; font-style:normal;
  position:relative; overflow:hidden; }
.cam-punti i::before { content:''; position:absolute; inset:0;
  transform-origin:0 50%; transform:scaleX(var(--w,1));
  background:var(--gold); border-radius:2px; }
.cam-punti b { color:var(--text-2); text-align:right; }
.cam-timbro { position:absolute; left:50%; top:46%;
  --posa:translate(-50%,-50%) rotate(-8deg);
  padding:7px 12px; font-size:10px; font-weight:800;
  letter-spacing:.2em; text-transform:uppercase; color:#FF7A6B;
  border:1.5px solid #FF7A6B; border-radius:4px;
  transform:var(--posa); background:rgba(5,5,5,.72); }
.cam-timbro small { display:block; font-size:8px; font-weight:600;
  letter-spacing:.12em; color:rgba(255,122,107,.85); margin-top:2px; }
.cam-mazzo.arma .cam-timbro { opacity:0;
  transform:var(--posa) scale(2.4); }
.cam-mazzo.viva .cam-timbro { opacity:1; transform:var(--posa) scale(1);
  transition:opacity .35s ease .5s,
    transform .5s cubic-bezier(.2,1.6,.4,1) .5s; }
.cam-mazzo.viva .cam-casa.morta { opacity:.45; filter:saturate(.4);
  transition:opacity .5s ease .7s, filter .5s ease .7s; }
.cam-verita { margin-top:clamp(16px,2vw,24px); max-width:64ch;
  font-size:14px; line-height:1.75; color:var(--text-2); }
.cam-verita b { color:var(--text); }

/* ── la pillola d'imbarco persistente ───────────────────────────────── */
.pillola { position:fixed; left:50%; bottom:16px; z-index:120;
  transform:translate(-50%,140%); display:inline-flex;
  align-items:center; gap:10px; padding:13px 22px;
  font-size:12.5px; font-weight:700; color:#0A0A05;
  background:var(--gold); border-radius:100px; text-decoration:none;
  box-shadow:0 14px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.2);
  transition:transform .5s cubic-bezier(.22,1,.36,1);
  white-space:nowrap; }
.pillola small { font-size:10px; font-weight:600; opacity:.75; }
.pillola.su { transform:translate(-50%,0); }
@media (min-width:900px){ .pillola { left:auto; right:26px;
  bottom:22px; transform:translate(0,160%); }
  .pillola.su { transform:none; } }
@media (prefers-reduced-motion:reduce){ .pillola
  { transition:none; } }"""

# ── la scena ─────────────────────────────────────────────────────────────


def atto(idx, sid, dark, inv, tema, chi, q, lead, det, prove, cifra,
         cifra_eti, righe, reperto_eti, reperto, intro='', coda=''):
    d = ' section-dark' if dark else ''
    v = ' inv' if inv else ''
    chips = ''
    if prove:
        chips = '\n      <div class="prove">' + prove + '</div>'
    rr = '\n        '.join(f'<span>{r}</span>' for r in righe)
    rep = ''
    if reperto:
        rep = f"""
    <div class="reperto-eti sale"><b>Exhibit {chr(64 + idx)}</b>
      <span>{reperto_eti}</span></div>
    {reperto}"""
    return f"""
<section class="section{d} atto3{v}" id="{sid}">
  <div class="container">{intro}
    <div class="a3-testa sale">
      <div class="a3-alto"><span class="a3-num">0{idx}</span>
        <span class="a3-tema">{tema}</span></div>
      <p class="a3-q">{q}</p>
      <p class="a3-chi">{chi}</p>
    </div>
    <div class="a3-corpo">
      <div class="a3-risposta sale">
        <div class="a3-avv"><i>V</i><span>Valentino — on the record</span></div>
        <p class="a3-lead">{lead}</p>
        <p class="a3-det">{det}</p>{chips}
      </div>
      <aside class="a3-colpo sale" aria-hidden="false">
        <div class="a3-cifra">{cifra}</div>
        <p class="a3-cifra-eti">{cifra_eti}</p>
        <div class="a3-righe">
        {rr}
        </div>
      </aside>
    </div>{rep}{coda}
  </div>
</section>"""


# ── il tabellone e la camminata ──────────────────────────────────────────
SOLARI = """<div class="solari sale" id="solari" role="table"
      aria-label="The Rome rental market, stated as a departures board">
      <div class="sol-testa" role="row"><span>Listing</span>
        <span>Status</span><span>Survives</span><span>Remark</span></div>
      <div class="sol-riga" role="row">
        <span class="nome">Good 2-bed, fair price</span>
        <span class="stato sol-vivo"><span>Boarding</span>
          <span class="male">Last call</span>
          <span class="male">Gone</span></span>
        <span class="tempo sol-vivo"><span>24–72h</span>
          <span>&lt; 24h</span><span class="male">—</span></span>
        <span class="nota sol-vivo"><span>dozens of enquiries in the
          first hours</span><span>the queue closed while you
          slept</span><span>went while you read this page</span></span>
      </div>
      <div class="sol-riga" role="row">
        <span class="nome">The phantom listing</span>
        <span class="stato male">Scam · daily</span>
        <span class="tempo male">—</span>
        <span class="nota">a deposit wired for a flat that doesn't
          exist</span>
      </div>
      <div class="sol-riga" role="row">
        <span class="nome">The double deposit</span>
        <span class="stato male">Scam · weekly</span>
        <span class="tempo male">—</span>
        <span class="nota">the same keys promised to three people</span>
      </div>
      <div class="sol-riga" role="row">
        <span class="nome">Agency relisting</span>
        <span class="stato muto">Duplicate</span>
        <span class="tempo">—</span>
        <span class="nota">the same flat, re-posted at another
          price</span>
      </div>
      <div class="sol-riga" role="row">
        <span class="nome">The off-market home</span>
        <span class="stato">Never listed</span>
        <span class="tempo">—</span>
        <span class="nota">moves landlord-to-agency, on
          relationships</span>
      </div>
      <div class="sol-riga" role="row">
        <span class="nome">Your search from abroad</span>
        <span class="stato muto">Delayed</span>
        <span class="tempo">—</span>
        <span class="nota">you join every queue from another timezone,
          while you sleep</span>
      </div>
    </div>
    <p class="solari-nota sale">A dramatisation of our published market
      facts — every line sourced: a good listing survives 24–72 hours;
      the patterns and their frequency are documented in
      <a href="/blog-scam-bible.html">our scam guide</a> (7 patterns,
      35+ red flags). And the law nobody quotes: deposit capped at three
      months — an unregistered contract voids your residency
      paperwork.</p>"""

CAMMINATA = """<div class="reperto-eti sale"><b>C·2</b>
      <span>The walk — what the machine can't see</span></div>
    <div class="cam-mazzo sale" id="camminata">
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
    <p class="cam-verita sale">It scored 82. The photos were beautiful.
      The wall behind the wardrobe wasn't. <b>Every home on your
      shortlist is walked in person before you see it</b> — what
      survives the walk reaches your deck, and “three options” means
      three homes that survived it. Sample homes; the discipline is the
      real system.</p>"""

INTRO = """
    <div class="sale" style="margin-bottom:clamp(40px,6vw,72px)">
      <span class="eyebrow"><i></i>The interview</span>
      <h2 class="titolo titolo-xl">You should be sceptical.<br>
        <span class="hl">So ask us everything.</span></h2>
      <p class="sotto">Seven questions every client asks before paying —
        answered in writing, each with its evidence attached. A
        representative conversation: the objections are the real ones we
        hear every week, the answers are ours — not a transcript of any
        client's chat.</p>
    </div>"""

A1 = atto(1, 'dubbio', True, False, 'The rule',
  'You — every first message, rightly',
  "Why would I pay €350 upfront? Every guide — <b>including yours</b> — "
  "says never pay upfront in Rome.",
  "Keep following that rule.<br>This is <b>mechanically different</b>.",
  """That rule protects you from strangers asking for wire transfers to
      “hold” a flat — <b>we teach it ourselves</b>, in our own scam
      guide. Here you pay a registered Italian company, by card, against
      a <b>written contract term</b>. If I don't deliver, the €350
      returns to your card. Not goodwill: a clause. The whole thing,
      dimension by dimension, is below.""",
  """<a href="/terms.html" target="_blank" rel="noopener">Terms §4.2 —
          the clause <i>→</i></a>
        <a href="/blog-scam-bible.html">Our scam guide — 7 patterns,
          35+ red flags <i>→</i></a>""",
  '100%',
  'refunded if we don’t deliver — by contract, not courtesy',
  ['<b>Card via Stripe</b> — receipted, chargeback protection',
   '<b>Egidi Immobiliare S.r.l.</b> — registered, verifiable',
   '<b>Terms §4.2 · §7.1-bis</b> — no admin fee'],
  'The scam pattern vs this service', REGOLA, intro=INTRO)

A2 = atto(2, 'roma', False, True, 'The market',
  'You — after a week on the portals',
  "Is Rome really that brutal? <b>I've rented in other capitals.</b>",
  "Rome isn't chaotic.<br>Rome is <b>asymmetric</b>.",
  """A good flat survives 24–72 hours; the good private listing collects
      dozens of enquiries within hours — and from another timezone you
      join that queue <b>while you sleep</b>. Much of what you scroll is
      the same flat re-posted by competing agencies; the best homes
      never reach the portals at all. The scams are engineered precisely
      for the person abroad. Here is Rome's board — and what searching
      alone actually costs:""",
  '',
  '24–72<small>h</small>',
  'the life of a good listing on the portals',
  ['<b>The phantom listing</b> — runs daily',
   '<b>The double deposit</b> — runs weekly',
   '<b>Deposit cap</b> — three months, by law'],
  'Rome, stated as a departures board',
  SOLARI + '\n\n    ' + CONTO)

A3 = atto(3, 'solo', True, False, 'The machine',
  'You — and you are right, it is free',
  "I can search Idealista myself. <b>For free.</b>",
  "You're not paying me to search.<br>You're paying to be "
  "<b>first — and filtered</b>.",
  """Free search puts you in the same queue as every other tenant, hours
      late. Your brief, told once; the scanner reads the market <b>every
      fifteen minutes, day and night</b> and scores everything against
      your five lines — under sixty never touches your phone. I walk
      what survives. And I'm not selling you a portfolio: the hunt works
      the <b>buyer's side</b> — agency relistings are stored, never
      pushed. Try the brief yourself:""",
  '',
  '96',
  'scans a day — read from the production deploy file',
  ['<b>Match weights</b> — budget 50 · bedrooms 30 · district 20',
   '<b>Push threshold</b> — under 60/100 never reaches you',
   '<b>Agency relistings</b> — stored, never pushed'],
  'The finder — real weights, real schedules',
  FINDER + '\n\n    ' + CAMMINATA)

A4 = atto(4, 'chi', False, True, 'The counterpart', 'You — as you should',
  "How do I know <b>you're real</b>? I've never met you.",
  "Don't trust me.<br><b>Check me.</b>",
  """Egidi Immobiliare S.r.l. — P.IVA 17322991005, REA RM-1710623,
      office in Via dei Coronari 181. An EU trademark you can look up on
      EUIPO yourself. 47 Google reviews, readable one by one. Every
      payment runs through Stripe with a receipt — <b>never a bank
      transfer to an individual</b>. And the person answering your
      WhatsApp is the person who walks your shortlist: <b>me</b>.""",
  '',
  '4.9<small>★</small>',
  'on Google — 47 reviews from real tenants',
  ['<b>P.IVA</b> 17322991005 · <b>REA</b> RM-1710623',
   '<b>EU trademark</b> 019317594 — on EUIPO',
   '<b>Via dei Coronari 181</b>, Roma'],
  'Check, don’t trust', VERIFICA + """

    <div class="verifica-righe sale">
      <a href="/terms.html">Egidi Immobiliare S.r.l. — P.IVA 17322991005 →</a>
      <a href="https://euipo.europa.eu/eSearch/#details/trademarks/019317594"
        target="_blank" rel="noopener">EU trademark 019317594 on EUIPO ↗</a>
      <a href="/blog-scam-bible.html">Our Rome rental scam guide →</a>
    </div>""")

A5 = atto(5, 'estero', True, False, 'The distance',
  'You — writing from abroad',
  "I'm not even <b>in Italy</b> yet.",
  "Good.<br>It's built for <b>exactly that</b>.",
  """Viewings happen <b>live on video</b> — I walk, you watch and ask.
      The contract is signed from your phone. Utilities and codice
      fiscale are handled before you land. Matches arrive in your
      private app; confirmed visits land in <b>Apple Wallet</b>. Don't
      take my word for any of it — touch all three, right now:""",
  '',
  '0',
  'flights needed before you sign',
  ['<b>Viewings</b> — live on video, you direct me',
   '<b>Contract</b> — signed from your phone',
   '<b>Visits</b> — boarding passes in Apple Wallet'],
  'Touch it before you pay', TOCCA)

A6 = atto(6, 'garanzia', False, True, 'The guarantee',
  'You — the fair question',
  "And if you find <b>nothing</b> I like?",
  "Then it costs you nothing.<br>And that sentence is a "
  "<b>contract term</b>.",
  """Two honest limits. I can't <b>invent supply</b> — if your criteria
      can't exist in Rome at your budget, I say it on the first call,
      before your fifteen days burn politely. And fifteen days is the
      <b>refund trigger, not a delivery date</b>: the right home takes
      days, sometimes weeks — we don't stop until you're settled.
      “Three options” means the criteria <b>agreed with you in
      writing</b> on the first call — the clause pays on those. Our own
      fee is declared too: one month's rent or 10% of annual —
      whichever is lower (§4.1); the €350 comes off it.""",
  '',
  '§4.2',
  'the refund clause — quoted verbatim below',
  ['<b>15 days</b> — the refund trigger, not a promise',
   '<b>Criteria</b> — agreed in writing, first call',
   '<b>Our fee</b> — declared in §4.1, €350 deducted'],
  'The clause, verbatim', """<div class="clausola sale">
      <blockquote>PFS costs €350 (fixed fee). If we do not present at
        least <b>3 options matching your agreed criteria within 15
        days</b>, the €350 is <b>refunded in full</b>. On success it is
        <b>deducted from the agency fee</b>.</blockquote>
      <cite>Terms of Service — §4.2 Property Finding Service</cite>
    </div>
    <div class="clausola sale">
      <blockquote>For the Property Finding Service, Section 4.2 prevails
        over this section: if we do not deliver at least 3 options
        matching your agreed criteria within 15 days, the €350 is
        refunded in full — <b>no admin fee applies</b>.</blockquote>
      <cite>Terms of Service — §7.1-bis Cancellation carve-out</cite>
    </div>
    <a class="clausola-vai sale" href="/terms.html" target="_blank"
      rel="noopener">Read the full terms — nothing on this page contradicts
      them →</a>""")

A7 = atto(7, 'dopo', True, False, 'The first 24 hours',
  'You — ready to board',
  "OK. What actually happens <b>the minute I pay</b>?",
  "Five lines.<br>Then the <b>clock starts</b>.",
  """<b>I call</b> — fifteen minutes, brutal about what your budget
      really buys in your zones. The search arms within 24 hours: the
      scanner takes your brief the same day it exists. First scored
      matches land in your private app; viewings follow — I walk, you
      watch live — then negotiation, and a registered contract
      <b>signed from your phone</b>. This is the rail:""",
  '',
  '24<small>h</small>',
  'from payment to an armed search',
  ['<b>15-minute call</b> — same day, no sugar',
   '<b>Your app</b> — first scored matches',
   '<b>Keys</b> — contract signed from your phone'],
  'The itinerary — and everything included',
  PASSI + '\n\n    ' + INCLUSI)

NUOVO = A1 + '\n' + A2 + '\n' + A3 + '\n' + A4 + '\n' + A5 + '\n' + A6 \
    + '\n' + A7 + '\n\n'

# ── demolizione e innesto ────────────────────────────────────────────────
D0M = '<!-- ══ IL CONTO'
D1M = "<!-- ══ L'IMBARCO"
uno(s, D0M)
uno(s, D1M)
s = s[:s.index(D0M)] + NUOVO.strip() + '\n\n' + s[s.index(D1M):]

uno(s, CSS_ANCORA)
s = s.replace(CSS_ANCORA, CSS)

TAPPE_A = ("var TAPPE = ['conto', 'regola', 'macchina', 'tocca', 'verifica',"
           "\n    'imbarco', 'faq'];")
uno(s, TAPPE_A)
s = s.replace(TAPPE_A, "var TAPPE = ['dubbio', 'roma', 'solo', 'chi', "
                       "'estero', 'garanzia',\n    'dopo', 'faq'];")

CODA_A = '</script>\n\n<footer class="footer">'
uno(s, CODA_A)
s = s.replace(CODA_A, """</script>
<script>
/* Colloquio 3.0: fin dove arriva l'interrogatorio — una misura, sette atti */
(function () {
  'use strict';
  if (!('IntersectionObserver' in window)) return;
  var visti = {};
  var occhio = new IntersectionObserver(function (vs) {
    vs.forEach(function (v) {
      if (!v.isIntersecting) return;
      var id = v.target.id;
      if (visti[id]) return;
      visti[id] = 1;
      try { gtag('event', 'pfs_interview_act', { act: id }); } catch (e) {}
    });
  }, { threshold: .2 });
  ['dubbio', 'roma', 'solo', 'chi', 'estero', 'garanzia', 'dopo']
    .forEach(function (id) {
      var el = document.getElementById(id);
      if (el) occhio.observe(el);
    });
})();
</script>
<script>
/* Il tabellone Solari: cascata all'ingresso, poi il buon annuncio SCADE
   in loop (BOARDING -> LAST CALL -> GONE). Fermo fuori vista; con
   reduced-motion resta sul FATTO (24-72h), mai la drammatizzazione. */
(function () {
  'use strict';
  var sol = document.getElementById('solari');
  if (!sol) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  sol.classList.add('arma');
  var righe = [].slice.call(sol.querySelectorAll('.sol-riga'));
  righe.forEach(function (r, i) {
    r.style.transitionDelay = (i * 90) + 'ms';
  });
  var vivo = false, giro = null, stato = 0;
  function ciclo() {
    if (!vivo || document.hidden) { giro = setTimeout(ciclo, 900); return; }
    stato = (stato + 1) % 4;
    sol.classList.toggle('s2', stato === 2);
    sol.classList.toggle('s3', stato === 3);
    giro = setTimeout(ciclo,
      stato === 3 ? 2600 : stato === 2 ? 1700 : 3200);
  }
  new IntersectionObserver(function (v) {
    var era = vivo;
    vivo = v[0].isIntersecting;
    if (vivo && !era) {
      sol.classList.add('viva');
      if (giro === null) giro = setTimeout(ciclo, 3400);
      setTimeout(function () {
        righe.forEach(function (r) { r.style.transitionDelay = ''; });
      }, 1500);
    }
  }, { threshold: .35 }).observe(sol);
})();
</script>
<script>
/* La camminata: il timbro REJECTED cala quando il mazzo entra in scena */
(function () {
  'use strict';
  var cam = document.getElementById('camminata');
  if (!cam) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  cam.classList.add('arma');
  new IntersectionObserver(function (v, o) {
    if (!v.some(function (x) { return x.isIntersecting; })) return;
    o.disconnect();
    cam.classList.add('viva');
  }, { threshold: .4 }).observe(cam);
})();
</script>
<a class="pillola" id="pillola" href="#checkin"
  aria-label="Go to the check-in form">Board the hunt
  <small>€350 · refundable §4.2</small></a>

<script>
/* La pillola d'imbarco: compare a meta' interrogatorio, sparisce quando
   la cassa (hero) o l'imbarco sono gia' in vista. Solo via JS: senza,
   resta fuori schermo. */
(function () {
  'use strict';
  var p = document.getElementById('pillola');
  if (!p || !('IntersectionObserver' in window)) return;
  var visti = {};
  function stato() {
    var vicino = visti.checkin || visti.imbarco;
    p.classList.toggle('su', !vicino && scrollY > innerHeight * 1.6);
  }
  var occ = new IntersectionObserver(function (vs) {
    vs.forEach(function (v) { visti[v.target.id] = v.isIntersecting; });
    stato();
  });
  ['checkin', 'imbarco'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) occ.observe(el);
  });
  addEventListener('scroll', stato, { passive: true });
  p.addEventListener('click', function () {
    try { gtag('event', 'pfs_pill_click'); } catch (e) {}
  });
})();
</script>

<footer class="footer">""")

# ── verifiche finali ─────────────────────────────────────────────────────
for ago in ('id="dubbio"', 'id="roma"', 'id="solo"', 'id="chi"',
            'id="estero"', 'id="garanzia"', 'id="dopo"', 'id="finder"',
            'id="checkin"', 'id="ckForm"', 'id="imbarco"', 'id="vFoto"',
            'id="pmNome"', 'pfs_interview_act', 'class="regola2 sale"',
            'class="titolo titolo-xl"', 'id="solari"',
            'id="camminata"', 'id="pillola"'):
    uno(s, ago, OUT)
assert s.count('class="clausola sale"') == 2, 'clausole'
assert s.count('a3-colpo sale') == 7, s.count('a3-colpo sale')
assert s.count('atto3 inv') == 3, 'zigzag: atti 2-4-6'
for morto in ('id="conto"', 'id="regola"', 'id="macchina"', 'id="tocca"',
              'id="verifica"', 'id="prezzo"', 'id="perche"',
              'href="#conto"', 'href="#macchina"', 'href="#tocca"'):
    assert morto not in s, f'residuo: {morto}'
assert s.index('id="dubbio"') < s.index('id="roma"') < s.index('id="solo"') \
    < s.index('id="chi"') < s.index('id="estero"') \
    < s.index('id="garanzia"') < s.index('id="dopo"') \
    < s.index('id="imbarco"') < s.index('id="faq"')

open(OUT, 'w', encoding='utf-8').write(s)
print(OUT, '-> composto per l\'occhio,', len(s) // 1024, 'KB')
