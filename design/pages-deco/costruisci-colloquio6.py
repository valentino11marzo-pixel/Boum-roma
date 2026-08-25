#!/usr/bin/env python3
# IL COLLOQUIO 6.0 — L'ORDINE DELLA COMPRENSIONE + LA LINGUA 2030.
# Lo studio a 4 lenti ha misurato: 'cosa ottengo' viveva all'80% di
# profondita' e il lettore da 30s usciva con l'impressione 'azienda
# preoccupata di non sembrare truffa'. Ordine nuovo: PRODOTTO ->
# macchina -> toccabile -> mercato -> chi -> regola -> clausola; i colpi
# leggono in fila la storia d'acquisto (24h 96 0 24-72h 4.9 100% 4.2).
# Lingua 2030: HUD di rotta (stato d'atto + 7 segmenti + CTA), cifre
# che si assestano, fascio di lettura. (base 3.0: sette obiezioni,
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
FINDER = FINDER[:FINDER.index(
    '<div class="macchina sale" id="macchinaBox">')].rstrip()
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

/* ══ LA LINGUA 2030 ═══════════════════════════════════════════════════ */
/* i 4 passi del prodotto nell'hero: la comprensione in 15 parole */
.hero-passi { margin-top:16px; display:flex; align-items:center;
  gap:7px 10px; flex-wrap:wrap; font-size:10px; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase; color:var(--text-3);
  max-width:56ch; }
.hero-passi b { color:var(--gold); font-weight:700; margin-right:2px; }
.hero-passi i { font-style:normal; color:rgba(255,215,0,.45); }
/* l'HUD di rotta: stato d'atto + sette segmenti + la CTA, sempre */
.hud { position:fixed; left:0; right:0; bottom:0; z-index:110;
  display:flex; align-items:center; gap:clamp(10px,2vw,22px);
  padding:9px clamp(14px,3vw,28px)
    calc(9px + env(safe-area-inset-bottom, 0px));
  background:rgba(5,5,5,.82); backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
  border-top:1px solid rgba(255,215,0,.14);
  transform:translateY(110%);
  transition:transform .5s cubic-bezier(.22,1,.36,1); }
.hud.su { transform:none; }
.hud-stato { font-size:9.5px; font-weight:700; letter-spacing:.2em;
  text-transform:uppercase; color:var(--text-3); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.hud-stato b { color:var(--gold); font-weight:700; }
.hud-seg { display:flex; gap:5px; flex:1; justify-content:center; }
.hud-seg i { width:clamp(14px,2.6vw,32px); height:2px; border-radius:2px;
  background:rgba(255,255,255,.14);
  transition:background .4s ease, box-shadow .4s ease; }
.hud-seg i.acceso { background:var(--gold);
  box-shadow:0 0 8px rgba(255,215,0,.5); }
.hud-vai { flex:none; display:inline-flex; align-items:baseline; gap:7px;
  padding:9px 16px; font-size:11px; font-weight:800;
  letter-spacing:.08em; color:#0A0A05; background:var(--gold);
  border-radius:100px; text-decoration:none; white-space:nowrap; }
.hud-vai small { font-size:9px; font-weight:700; opacity:.7; }
@media (max-width:760px){ .hud-seg { display:none; }
  .hud-stato { flex:1; } }
@media (prefers-reduced-motion:reduce){ .hud { transition:none; } }
/* il fascio di lettura: l'atto in lettura respira oro dall'alto */
.atto3 { transition:box-shadow .7s ease; }
.atto3.in-lettura { box-shadow:inset 0 140px 140px -140px
  rgba(255,215,0,.05); }
/* le cifre si assestano come strumenti (solo a moto pieno) */
@media (prefers-reduced-motion:no-preference){
  html.vivo .a3-colpo .a3-cifra { filter:blur(7px); opacity:.35;
    transform:scale(1.05); transform-origin:left bottom;
    transition:filter .55s cubic-bezier(.22,1,.36,1) .28s,
      opacity .5s ease .28s,
      transform .6s cubic-bezier(.22,1,.36,1) .28s; }
  html.vivo .a3-colpo.sale.dentro .a3-cifra { filter:none; opacity:1;
    transform:none; }
}"""

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

A1 = atto(6, 'dubbio', False, True, 'The rule',
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
  ['<b>Card via Stripe</b> — receipted, never a wire',
   '<b>Chargeback protection</b> — by design, not promise',
   '<b>Terms §4.2 · §7.1-bis</b> — no admin fee'],
  'The scam pattern vs this service', REGOLA)

A2 = atto(4, 'roma', False, True, 'The market',
  'You — after a week on the portals',
  "Is Rome really that brutal? <b>I've rented in other capitals.</b>",
  "Rome isn't chaotic.<br>Rome is <b>asymmetric</b>.",
  """A good flat survives 24–72 hours; the good private listing collects
      dozens of enquiries within hours — and from another timezone you
      join that queue <b>while you sleep</b>. Much of what you scroll is
      the same flat re-posted by competing agencies; the best homes
      never reach the portals at all. Here is what searching alone
      actually costs:""",
  '',
  '24–72<small>h</small>',
  'the life of a good listing on the portals',
  ['<b>The phantom listing</b> — runs daily',
   '<b>The double deposit</b> — runs weekly',
   '<b>Deposit cap</b> — three months, by law'],
  'What searching alone costs', CONTO)

A3 = atto(2, 'solo', False, True, 'The machine',
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
  'The finder — real weights, real schedules', FINDER)

A4 = atto(5, 'chi', True, False, 'The counterpart', 'You — as you should',
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

A5 = atto(3, 'estero', True, False, 'The distance',
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

A6 = atto(7, 'garanzia', True, False, 'The guarantee',
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

A7 = atto(1, 'dopo', True, False, 'The product',
  'You — the only fair first question',
  "What exactly do I get <b>for the €350</b>?",
  "A hunt, a hunter —<br>and everything <b>to the keys</b>.",
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
  PASSI + '\n\n    ' + INCLUSI, intro=INTRO)

NUOVO = A7 + '\n' + A3 + '\n' + A5 + '\n' + A2 + '\n' + A4 + '\n' + A1 \
    + '\n' + A6 + '\n\n'

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
s = s.replace(TAPPE_A, "var TAPPE = ['dopo', 'solo', 'estero', 'roma', "
                       "'chi', 'dubbio',\n    'garanzia', 'faq'];")

# i 4 passi del prodotto sotto la promessa dell'hero
SOTTO_A6 = ("(Terms §4.2).</b>" if False else "€350 back</b> (Terms §4.2).</p>")
uno(s, SOTTO_A6)
s = s.replace(SOTTO_A6, SOTTO_A6 + """
      <div class="hero-passi" aria-label="What the €350 buys, in four steps">
        <span><b>01</b> Brief — five lines</span><i>→</i>
        <span><b>02</b> The hunt — off-market + every portal</span><i>→</i>
        <span><b>03</b> Viewings — live on video</span><i>→</i>
        <span><b>04</b> Contract — from your phone</span>
      </div>""")

# lo skip-link puntava a #perche, id inesistente su questa pagina
uno(s, '<a class="salta" href="#perche">')
s = s.replace('<a class="salta" href="#perche">',
              '<a class="salta" href="#dopo">')

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

<div class="hud" id="hud" aria-label="Route: your position in the interview">
  <span class="hud-stato" id="hudStato" aria-live="off"></span>
  <span class="hud-seg" id="hudSeg" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
  <a class="hud-vai" href="#checkin" id="hudVai">Board · €350
    <small>↩ §4.2</small></a>
</div>
<script>
/* L'HUD DI ROTTA — lo stato dell'interrogatorio sempre sott'occhio:
   l'atto in lettura, i sette segmenti che si accendono, la CTA.
   Solo via JS; sparisce alla cassa e all'imbarco. */
(function () {
  'use strict';
  var hud = document.getElementById('hud');
  if (!hud || !('IntersectionObserver' in window)) return;
  var stato = document.getElementById('hudStato');
  var seg = [].slice.call(document.querySelectorAll('#hudSeg i'));
  var ATTI = [
    ['dopo', 'Act 01 · The product — <b>armed in 24h</b>'],
    ['solo', 'Act 02 · The machine — <b>96 scans/day</b>'],
    ['estero', 'Act 03 · The distance — <b>0 flights</b>'],
    ['roma', 'Act 04 · The market — <b>24–72h</b>'],
    ['chi', 'Act 05 · The counterpart — <b>4.9★</b>'],
    ['dubbio', 'Act 06 · The rule — <b>100% back</b>'],
    ['garanzia', 'Act 07 · The clause — <b>§4.2</b>'] ];
  var el = ATTI.map(function (x) {
    return document.getElementById(x[0]);
  });
  var vicini = {};
  var occ = new IntersectionObserver(function (vs) {
    vs.forEach(function (v) { vicini[v.target.id] = v.isIntersecting; });
  });
  ['checkin', 'imbarco'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) occ.observe(e);
  });
  var ultimo = -1, attesa = false;
  function passo() {
    attesa = false;
    var meta = innerHeight * .5, ora = -1;
    for (var i = 0; i < el.length; i++) {
      if (!el[i]) continue;
      var r = el[i].getBoundingClientRect();
      if (r.top < meta && r.bottom > meta) { ora = i; break; }
      if (r.top < meta) ora = i;
    }
    hud.classList.toggle('su',
      ora >= 0 && !vicini.checkin && !vicini.imbarco);
    if (ora !== ultimo) {
      ultimo = ora;
      if (ora >= 0) stato.innerHTML = ATTI[ora][1];
      seg.forEach(function (sg, i) {
        sg.classList.toggle('acceso', i <= ora);
      });
      el.forEach(function (e, i) {
        if (e) e.classList.toggle('in-lettura', i === ora);
      });
    }
  }
  addEventListener('scroll', function () {
    if (!attesa) { attesa = true; requestAnimationFrame(passo); }
  }, { passive: true });
  addEventListener('resize', passo);
  passo();
  document.getElementById('hudVai').addEventListener('click', function () {
    try { gtag('event', 'pfs_hud_click'); } catch (e) {}
  });
})();
</script>

<footer class="footer">""")

# ── verifiche finali ─────────────────────────────────────────────────────
for ago in ('id="dubbio"', 'id="roma"', 'id="solo"', 'id="chi"',
            'id="estero"', 'id="garanzia"', 'id="dopo"', 'id="finder"',
            'id="checkin"', 'id="ckForm"', 'id="imbarco"', 'id="vFoto"',
            'id="pmNome"', 'pfs_interview_act', 'class="regola2 sale"',
            'class="titolo titolo-xl"', 'id="hud"',
            'class="hero-passi"', 'href="#dopo"'):
    uno(s, ago, OUT)
assert s.count('class="clausola sale"') == 2, 'clausole'
assert s.count('a3-colpo sale') == 7, s.count('a3-colpo sale')
assert s.count('atto3 inv') == 3, 'zigzag: atti 2-4-6'
assert 'id="macchinaBox"' not in s, 'doppione macchina'
assert '#perche' not in s, 'skip-link morto'
for morto in ('id="conto"', 'id="regola"', 'id="macchina"', 'id="tocca"',
              'id="verifica"', 'id="prezzo"', 'id="perche"',
              'href="#conto"', 'href="#macchina"', 'href="#tocca"'):
    assert morto not in s, f'residuo: {morto}'
assert s.index('id="dopo"') < s.index('id="solo"') \
    < s.index('id="estero"') < s.index('id="roma"') \
    < s.index('id="chi"') < s.index('id="dubbio"') \
    < s.index('id="garanzia"') < s.index('id="imbarco"') \
    < s.index('id="faq"')

open(OUT, 'w', encoding='utf-8').write(s)
print(OUT, '-> composto per l\'occhio,', len(s) // 1024, 'KB')
