#!/usr/bin/env python3
# IL COLLOQUIO 2.0 — L'INTERROGATORIO. La vendita vera del PFS avviene in
# conversazione (misurato: la chiamata chiude, 11x); questa pagina la mette
# in scena SENZA fingere una chat: sette domande vere dello scettico, sette
# risposte in prima persona, e accanto a OGNI risposta il suo REPERTO —
# l'artefatto della 6.0 che la prova (tabella truffe, conto, finder vero,
# verifica, app DEMO + zecca del pass, clausola verbatim, itinerario).
# Base: property-finding.html (hero-form, filo del volo, GA, banner cancel
# — tutto il collaudato resta). Output: preview-pfs-colloquio.html.
# Regole d'onesta': dichiarata "representative conversation", mai orari o
# spunte da chat vera; ogni cifra citata esiste gia' nel repo (terms.html
# verbatim, pesi/orari di produzione, 47 recensioni gia' in pagina).
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
    """Dal marcatore d'inizio fino a </section>, senza la chiusura del
    .container (l'ultimo </div> del blocco estratto)."""
    uno(s, inizio)
    a = s.index(inizio)
    b = s.index('</section>', a)
    blocco = s[a:b].rstrip()
    assert blocco.endswith('</div>'), inizio
    blocco = blocco[:-len('</div>')].rstrip()
    return blocco


# ── i reperti, estratti dalla 6.0 prima della demolizione ────────────────
REGOLA = estrai('<div class="regola2 sale">')          # tabella + fonte guida
CONTO = estrai('<div class="conto sale">')             # conto + chiusa + bench
FINDER = estrai('<div class="finder quadro" id="finder"')  # finder + macchina
PASSI = estrai('<div class="passi4 sale coro">')       # itinerario 01-04
TOCCA = estrai('<div class="tocca sale">')             # app DEMO + pass + try
VERIFICA = estrai('<div class="verifica sale">')       # recensioni + volto

# inclusi SENZA il quadro "diverso" (il suo testo confluisce nell'atto 6)
uno(s, '<div class="inclusi sale">')
a = s.index('<div class="inclusi sale">')
b = s.index('<div class="diverso quadro sale"', a)
INCLUSI = s[a:b].rstrip()
assert INCLUSI.endswith('</div>'), 'inclusi'

# ── CSS dell'interrogatorio ──────────────────────────────────────────────
CSS_ANCORA = ".imbarco-garanzia::before { content:'✓'; color:var(--gold); }"
CSS = CSS_ANCORA + """

/* ══ COLLOQUIO 2.0 · L'INTERROGATORIO ═════════════════════════════════ */
.atto-capo { display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; }
.atto-num { font-family:var(--display); font-weight:200; line-height:.9;
  font-size:clamp(46px,7vw,86px); color:rgba(255,215,0,.16);
  letter-spacing:-.02em; }
.atto-tema { font-size:10px; font-weight:700; letter-spacing:.3em;
  text-transform:uppercase; color:var(--text-3); }
.atto-q { margin-top:16px; font-family:var(--display); font-weight:200;
  font-size:clamp(23px,3.2vw,38px); line-height:1.18;
  letter-spacing:-.015em; max-width:26ch; text-wrap:balance; }
.atto-q b { font-weight:200; color:var(--gold); }
.atto-q::before { content:'\\201C'; color:var(--gold); margin-right:2px; }
.atto-q::after { content:'\\201D'; color:var(--gold); }
.atto-chi { margin-top:10px; font-size:10px; font-weight:700;
  letter-spacing:.24em; text-transform:uppercase; color:var(--text-3); }
.atto-a { margin-top:clamp(20px,2.6vw,30px); max-width:820px;
  padding:clamp(18px,2.4vw,28px) clamp(18px,2.6vw,30px);
  background:linear-gradient(135deg, rgba(255,215,0,.05),
    rgba(255,215,0,.012) 60%);
  border-radius:4px 16px 16px 4px; position:relative; }
.atto-a::before { content:''; position:absolute; left:0; top:0; bottom:0;
  width:2px; border-radius:2px;
  background:linear-gradient(180deg, var(--gold), rgba(255,215,0,.15)); }
.atto-a-chi { display:flex; align-items:center; gap:10px;
  margin-bottom:12px; }
.atto-a-chi i { width:26px; height:26px; border-radius:50%; flex:none;
  display:inline-flex; align-items:center; justify-content:center;
  font-style:normal; font-size:12px; font-weight:700; color:#0A0A05;
  background:var(--gold); }
.atto-a-chi span { font-size:10px; font-weight:700; letter-spacing:.22em;
  text-transform:uppercase; color:var(--text-3); }
.atto-a p { font-size:14.5px; line-height:1.8; color:var(--text-2); }
.atto-a p + p { margin-top:12px; }
.atto-a b { color:var(--text); font-weight:600; }
.atto-a .oro { color:var(--gold); }
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
.reperto-eti { margin:clamp(26px,3.4vw,38px) 0 14px; display:flex;
  align-items:center; gap:12px; }
.reperto-eti b { flex:none; padding:5px 11px; font-size:9.5px;
  font-weight:700; letter-spacing:.22em; text-transform:uppercase;
  color:var(--gold); border-radius:3px;
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.4); }
.reperto-eti span { font-size:10.5px; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase; color:var(--text-3); }
.reperto-eti::after { content:''; flex:1; height:1px;
  background:linear-gradient(90deg, var(--line), transparent); }
/* la clausola: il contratto citato alla lettera */
.clausola { max-width:820px; padding:clamp(20px,2.6vw,30px);
  background:var(--card); border-radius:14px; position:relative;
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.clausola::before { content:'\\00A7'; position:absolute; right:18px;
  top:8px; font-family:var(--display); font-weight:200; font-size:60px;
  color:rgba(255,215,0,.08); line-height:1; }
.clausola blockquote { margin:0; font-size:14px; line-height:1.85;
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
  text-decoration:none; letter-spacing:.02em; transition:color .3s ease; }
.verifica-righe a:hover { color:var(--gold); }
@media (max-width:640px){ .atto-q { max-width:none; } }"""

# ── le sette scene ───────────────────────────────────────────────────────


def atto(idx, sid, dark, tema, chi, q, corpo, reperto_eti, reperto,
         intro='', coda=''):
    d = ' section-dark' if dark else ''
    rep = ''
    if reperto:
        rep = f"""
    <div class="reperto-eti sale"><b>Exhibit {chr(64 + idx)}</b>
      <span>{reperto_eti}</span></div>
    {reperto}"""
    return f"""
<section class="section{d} atto" id="{sid}">
  <div class="container">{intro}
    <div class="sale">
      <div class="atto-capo"><span class="atto-num">0{idx}</span>
        <span class="atto-tema">{tema}</span></div>
      <p class="atto-q">{q}</p>
      <p class="atto-chi">{chi}</p>
    </div>
    <div class="atto-a sale">
      <div class="atto-a-chi"><i>V</i><span>Valentino — on the record</span></div>
      {corpo}
    </div>{rep}{coda}
  </div>
</section>"""


INTRO = """
    <div class="sale">
      <span class="eyebrow"><i></i>The interview</span>
      <h2 class="titolo">You should be sceptical.<br>
        <span class="hl">So ask us everything.</span></h2>
      <p class="sotto">The seven questions every client asks before paying
        — answered in writing, with the evidence attached to each answer.
        A representative conversation: the objections are the real ones we
        hear every week, the answers are ours — not a transcript of any
        client's chat.</p>
    </div>"""

A1 = atto(1, 'dubbio', True, 'The rule',
  'You — every first message, rightly',
  "Why would I pay €350 upfront? Every guide — <b>including yours</b> — "
  "says never pay upfront in Rome.",
  """<p>Keep following that rule — <b>we teach it ourselves</b>, in our own
        scam guide. It protects you from strangers asking for wire
        transfers to “hold” a flat. What I'm asking is mechanically
        different: you pay a <b>registered Italian company by card via
        Stripe</b> — receipted, chargeback-protected — against a
        <b>written contract term</b>. If I don't deliver, <span
        class="oro">the €350 returns to your card</span>. Not goodwill: a
        clause. Here is the whole thing, dimension by dimension:</p>
      <div class="prove">
        <a href="/terms.html" target="_blank" rel="noopener">Read the
          clause yourself — Terms §4.2 <i>→</i></a>
        <a href="/blog-scam-bible.html">Our scam guide — 7 patterns,
          35+ red flags, €47K+ of client money saved <i>→</i></a>
      </div>""",
  'The scam pattern vs this service', REGOLA, intro=INTRO)

A2 = atto(2, 'roma', False, 'The market',
  'You — after a week on the portals',
  "Is Rome really that brutal? I've rented in other capitals.",
  """<p>Rome isn't harder because it's chaotic — it's harder because it's
        <b>asymmetric</b>. A good flat here survives <b>24–72 hours</b> on
        the portals; the good private listing collects dozens of enquiries
        within hours, and from another timezone you join that queue while
        you sleep. Much of what you scroll is <b>the same flat
        re-posted</b> by competing agencies. The best homes <b>never reach
        the portals at all</b> — they move landlord-to-agency, on
        relationships. And the classic scams are engineered precisely for
        the person searching from abroad: the deposit wired to “hold” a
        home you've never walked. We document the patterns — <b>the
        phantom listing runs daily, the double deposit weekly</b> — and
        the law nobody tells you: the deposit is <b>capped at three
        months</b>, and an unregistered contract <b>voids your residency
        paperwork</b>.</p>
      <p>None of that shows on a portal's front page. All of it decides
        whether you sign. Here is what searching alone actually
        costs:</p>""",
  'What searching alone costs', CONTO)

A3 = atto(3, 'solo', True, 'The machine',
  'You — and you are right, it is free',
  "I can search Idealista myself. <b>For free.</b>",
  """<p>So can everyone — <b>that's exactly the problem</b>. Free search
        puts you in the same queue as every other tenant, hours late. What
        you can't do alone is be <b>first</b> and be <b>filtered</b>. You
        give me your brief once. The scanner reads the market on a
        production schedule — <b>every fifteen minutes, day and night</b>
        — and scores everything against your five lines; anything under
        sixty <b>never touches your phone</b>. I walk what survives.</p>
      <p>And unlike a classic agency, I'm not selling you a portfolio:
        the hunt starts from <b>your brief</b>, works the buyer's side,
        and won't route you into someone else's commission — the
        machine's rules below say so explicitly. Try the brief yourself
        — this is the actual mechanism:</p>""",
  'The finder — real weights, real schedules', FINDER)

A4 = atto(4, 'chi', False, 'The counterpart', 'You — as you should',
  "How do I know you're real? I've never met you.",
  """<p>Don't trust me — <b>check me</b>. Egidi Immobiliare S.r.l., P.IVA
        17322991005, REA RM-1710623, office in Via dei Coronari 181. An
        <b>EU trademark</b> you can look up on EUIPO yourself. <b>47
        Google reviews</b> you can read one by one. Every payment runs
        through Stripe with a receipt — <b>never a bank transfer to an
        individual</b>. And the person answering your WhatsApp is the
        person who walks your shortlist: me.</p>""",
  "Check, don't trust", VERIFICA + """

    <div class="verifica-righe sale">
      <a href="/terms.html">Egidi Immobiliare S.r.l. — P.IVA 17322991005 →</a>
      <a href="https://euipo.europa.eu/eSearch/#details/trademarks/019317594"
        target="_blank" rel="noopener">EU trademark 019317594 on EUIPO ↗</a>
      <a href="/blog-scam-bible.html">Our Rome rental scam guide →</a>
    </div>""")

A5 = atto(5, 'estero', True, 'The distance',
  'You — writing from abroad',
  "I'm not even in Italy yet.",
  """<p>Good — the service is <b>built for exactly that</b>. Viewings
        happen <b>live on video</b>: I walk,
        you watch and ask. The contract is signed from your phone.
        Utilities and codice fiscale are handled before you land. Matches
        arrive in your private app; confirmed visits land in <b>Apple
        Wallet</b>. Don't take my word for any of that — touch all three,
        right now:</p>""",
  'Touch it before you pay', TOCCA)

A6 = atto(6, 'garanzia', False, 'The guarantee', 'You — the fair question',
  "And if you find <b>nothing</b> I like?",
  """<p>Then it costs you nothing — and that sentence is a <b>contract
        term</b>, not a slogan. Read the clause exactly as it is
        written:</p>""",
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
      them →</a>""",
  coda="""
    <div class="atto-a sale" style="margin-top:clamp(22px,3vw,32px)">
      <div class="atto-a-chi"><i>V</i><span>The honest part</span></div>
      <p>Two things I won't promise. I can't <b>invent supply</b> — if
        your criteria can't exist in Rome at your budget, I tell you on
        the first call, brutally, before your fifteen days burn politely.
        And the fifteen days is <b>the refund trigger, not a delivery
        date</b>: finding the right home sometimes takes days, sometimes
        weeks — what you buy is relentless effort and honest
        communication, and <b>we don't stop until you're settled</b>.</p>
      <p>“Three options” is not three links to fill a quota: the criteria
        are <b>agreed with you, in writing, on the first call</b> — the
        clause pays on those, not on my interpretation of them.</p>
      <p>Our own fee is declared in the same terms: <b>one month's rent
        or 10% of the annual rent — whichever is lower</b> (§4.1). The
        €350 comes off it. No viewing fees, no application fees
        (§4.3).</p>
    </div>""")

A7 = atto(7, 'dopo', True, 'The first 24 hours', 'You — ready to board',
  "OK. What actually happens <b>the minute I pay</b>?",
  """<p>You fill five lines. <b>I call</b> — fifteen minutes, brutal
        about what your budget really buys in your zones. The search
        arms within 24 hours: the scanner takes your brief the same day
        it exists. The first scored matches land in your private app;
        viewings follow — I walk, you watch live — then negotiation, and
        a registered contract <b>signed from your phone</b>. The whole
        hunt runs on a fifteen-day contractual clock. This is the
        rail:</p>""",
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

# ── CSS + tappe del filo + misura della profondita' ──────────────────────
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
/* Colloquio 2.0: fin dove arriva l'interrogatorio — una misura, sette atti */
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

<footer class="footer">""")

# ── verifiche finali ─────────────────────────────────────────────────────
for ago in ('id="dubbio"', 'id="roma"', 'id="solo"', 'id="chi"',
            'id="estero"', 'id="garanzia"', 'id="dopo"', 'id="finder"',
            'id="checkin"', 'id="ckForm"', 'id="imbarco"', 'id="vFoto"',
            'id="pmNome"', 'pfs_interview_act', 'class="regola2 sale"'):
    uno(s, ago, OUT)
assert s.count('class="clausola sale"') == 2, 'clausole'
assert s.count('class="atto-a sale"') == 8, s.count('class="atto-a sale"')
for morto in ('id="conto"', 'id="regola"', 'id="macchina"', 'id="tocca"',
              'id="verifica"', 'id="prezzo"', 'id="perche"',
              'href="#conto"', 'href="#macchina"', 'href="#tocca"'):
    assert morto not in s, f'residuo: {morto}'
assert s.index('id="dubbio"') < s.index('id="roma"') < s.index('id="solo"') \
    < s.index('id="chi"') < s.index('id="estero"') \
    < s.index('id="garanzia"') < s.index('id="dopo"') \
    < s.index('id="imbarco"') < s.index('id="faq"')

open(OUT, 'w', encoding='utf-8').write(s)
print(OUT, "-> l'interrogatorio in sette atti,", len(s) // 1024, 'KB')
