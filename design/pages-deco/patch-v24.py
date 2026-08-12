#!/usr/bin/env python3
# v24 — «Why we exist» e «Il fondatore» diventano una voce sola.
#   Dicevano la stessa cosa da due angoli (il mercato e rotto / io l'ho
#   attraversato) occupando 2.275px in due sezioni separate. Fuse:
#     · il motto di Valentino sale a TITOLO — oggi e sepolto in una
#       citazione a 7.930px di scorrimento, ed e la riga piu forte del sito;
#     · la sua storia resta il sottotitolo;
#     · i sei dolori diventano la PROVA sotto la sua affermazione, non una
#       griglia autonoma con un titolo suo;
#     · i quattro numeri chiudono, a tutta larghezza.
#   Piu: il numero del marchio UE nelle informazioni di marca.
f = 'pt.html'
s = open(f, encoding='utf-8').read()
def uno(a, b, nome):
    global s
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    s = s.replace(a, b)

# ── 1 · il markup: una sezione al posto di due ──────────────────────────
a = s.index('<!-- ══ WHY WE EXIST ══')
b = s.index('<!-- ══ ORGANIZZAZIONI + READY FOR ROME ══')
vecchio = s[a:b]
# i sei dolori si portano dietro le loro icone: li estraggo dal vecchio
i1 = vecchio.index('<div class="dolori coro">')
i2 = vecchio.index('</div>\n    <div class="diverso sale">')
DOLORI = vecchio[i1:i2] + '</div>'
assert DOLORI.count('class="dolore"') == 6, DOLORI.count('class="dolore"')

NUOVA = '''<!-- ══ PERCHÉ ESISTIAMO — una voce sola: la sua ═════════════════════════
     Erano due sezioni che dicevano la stessa cosa da due angoli. Ora il
     motto e il titolo, la storia il sottotitolo, i sei dolori la prova. -->
<section class="sezione fond-sezione" id="perche">
  <canvas class="mosaico-fondo" id="mosaicoFond" aria-hidden="true"></canvas>
  <div class="container">

    <div class="fond">
      <div class="fond-foto quadro sale"><span class="tacca"></span>
        FOUNDER_IMG
      </div>
      <div class="sale">
        <span class="eyebrow"><i></i>Why we exist</span>
        <h2 class="titolo">Rome runs on New York prices over <span class="hl">Mumbai
          infrastructure</span>.</h2>
        <p class="sotto">That gap is why BOOM exists. Five years inside Rome's
          traditional agencies showed me the market from the inside. Then I
          opened my own and rebuilt the whole approach around one idea:
          you're a person landing in a city — not a file number. Every home
          here has been walked by us; every promise has my name under it.</p>
        <div class="fond-firma"><b>Valentino</b><span>Founder — BOOM® ·
          Egidi Immobiliare S.r.l., Via dei Coronari 181, Roma ·
          EU trade mark 019317594</span></div>
        <div class="hero-azioni" style="margin-top:20px">
          <a class="btn btn-primary" href="https://wa.me/393313251961"
            target="_blank" rel="noopener">Message me on WhatsApp</a>
          <a class="btn btn-secondary" href="RECENSIONI_URL"
            target="_blank" rel="noopener">Google reviews ↗</a>
          <a class="btn btn-secondary" href="/about.html">Our story</a>
        </div>
      </div>
    </div>

    <p class="dolori-capo"><b>Six things this market does to people</b> — and
      what we do instead.</p>
''' + DOLORI + '''

    <div class="diverso sale">
      <b>One company, no hand-offs.</b>
      <p>The agency, the portal and the tech engine are the same people —
        no middlemen between you and the keys. Video-verified apartments,
        transparent pricing, real human support. We're building what we
        wish existed when we moved here.</p>
    </div>

    <div class="chi-num coro" id="aboutNum">
      <div><b data-fine="6" data-suff="+">0+</b><span>Years in Rome Real Estate</span></div>
      <div><b data-fine="500" data-suff="+">0+</b><span>Happy Tenants Placed</span></div>
      <div><b data-fine="48" data-suff="h">0h</b><span>Average Move-in Time</span></div>
      <div><b>24/7</b><span>WhatsApp Support</span></div>
    </div>

  </div>
</section>

'''
s = s[:a] + NUOVA + s[b:]

# ── 2 · il CSS che la fusione richiede ──────────────────────────────────
uno('.fond .chi-num { margin-top:20px; }',
    '''/* la fusione: i dolori e i numeri escono dalla colonna e prendono
   tutta la larghezza — la faccia parla, poi arriva la prova */
.dolori-capo { margin:clamp(30px,3.4vw,46px) 0 0; font-size:14.5px;
  color:var(--text-3); }
.dolori-capo b { font-family:var(--display); font-size:17px; font-weight:400;
  letter-spacing:.005em; color:var(--text); }
.fond-sezione .dolori { margin-top:clamp(14px,1.6vw,20px); }
.fond-sezione .chi-num { margin-top:clamp(22px,2.6vw,32px); }
@media (min-width:760px){
  .fond-sezione .chi-num { grid-template-columns:repeat(4,1fr); } }''',
    'css fusione')

# ── 3 · il numero del marchio UE dove si parla del marchio ──────────────
uno('<i class="lungo">Egidi Immobiliare S.r.l. · BOOM® registered mark</i>'
    '<i class="breve">Egidi S.r.l. · BOOM®</i>',
    '<i class="lungo">Egidi Immobiliare S.r.l. · BOOM® EU trade mark '
    '019317594</i><i class="breve">Egidi S.r.l. · BOOM® 019317594</i>',
    'mue fascia')
uno('''<p class="piede-legale"><b>BOOM®</b> is a registered trademark of
          <b>Egidi Immobiliare S.r.l.</b><br>
          Via dei Coronari 181/184, 00186 Roma · P.IVA 17322991005 ·
          Licensed real-estate agency</p>''',
    '''<p class="piede-legale"><b>BOOM®</b> is a registered trademark of
          <b>Egidi Immobiliare S.r.l.</b> — EU trade mark
          <b>019317594</b>, class 36.<br>
          Via dei Coronari 181/184, 00186 Roma · P.IVA 17322991005 ·
          Licensed real-estate agency</p>''', 'mue footer')

assert s.count('id="mosaicoFond"') == 1, 'mosaico duplicato'
assert s.count('FOUNDER_IMG') == 1
assert s.count('id="aboutNum"') == 1
# quattro volte: fascia (lunga + breve), firma del fondatore, footer legale
assert s.count('019317594') == 4, s.count('019317594')
# la citazione e stata promossa a titolo: la sua regola CSS ora e morta
import re as _re
s = _re.sub(r'\.fond-quote \{[^}]*\}\n', '', s)
assert 'fond-quote' not in s, 'residui della citazione'
open(f, 'w', encoding='utf-8').write(s)
print('v24 · due sezioni → una · marchio UE in tre punti')
