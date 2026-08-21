#!/usr/bin/env python3
# PFS 6.0 — IL FORM È L'HERO (la lezione Executive applicata al flagship).
# Il check-in era alla settima sezione: il traffico caldo non deve
# scrollare per pagare. Ora: il biglietto-form nell'hero (si assembla
# all'apertura — la cerimonia è il benvenuto), il finder demo scende
# dentro "la macchina" (è la sua dimostrazione), in fondo una strip di
# richiamo (#imbarco). Vendita alla tech: hero-left a ~30 parole.
import sys

FILES = ['design/pages-deco/pf-body.html', 'property-finding.html']
WA = 'https://wa.me/393313251961'


def uno(s, ago, f):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO in {f}: {n} occorrenze di {ago[:70]!r}')
        sys.exit(1)


# ── CSS: la variante colonna del biglietto + hero + strip ────────────
CSS_ANCORA = '.passmint a:active { transform:scale(.97); }'
CSS = CSS_ANCORA + '''

/* ══ PFS 6.0 · il form è l'hero ═══════════════════════════════════════ */
.hero-quiet { margin-top:14px; font-size:12.5px; color:var(--text-3); }
.hero-quiet a { color:var(--text-2); text-decoration:underline;
  text-underline-offset:3px; }
@media (min-width:1020px){
  .pf-hero-in { grid-template-columns:minmax(0,1fr) minmax(480px,.98fr); } }
/* il biglietto in colonna: la geometria mobile, a qualsiasi viewport */
.ckt.colonna { grid-template-columns:30px minmax(0,1fr); }
.ckt.colonna .ck-banda { grid-row:1; }
.ckt.colonna .ck-corpo { grid-column:2;
  padding:clamp(16px,1.8vw,22px); }
.ckt.colonna .ck-rotta { font-size:clamp(19px,1.7vw,23px); }
.ckt.colonna .ck-campi { margin-top:14px; gap:10px 12px; }
.ckt.colonna .ck-campo input, .ckt.colonna .ck-campo select,
.ckt.colonna .ck-campo textarea { padding:10px 12px; font-size:13.5px; }
.ckt.colonna .ck-perf { grid-column:1/-1; height:10px; width:auto;
  background-image:
    radial-gradient(circle 3px at 50% 50%, var(--black) 97%, transparent),
    radial-gradient(circle 3.4px at 50% calc(50% + 1px),
      rgba(255,255,255,.13) 97%, transparent);
  background-size:14px 10px; background-repeat:repeat-x;
  background-position:center; }
.ckt.colonna .ck-perf::before { top:calc(50% - 10px); left:-11px;
  bottom:auto; }
.ckt.colonna .ck-perf::after { top:calc(50% - 10px); left:auto;
  right:-11px; bottom:auto; }
.ckt.colonna .ck-stub { grid-column:1/-1;
  padding:clamp(15px,1.7vw,20px) clamp(16px,1.8vw,22px); }
.ckt.colonna .ck-quota b { font-size:clamp(26px,2vw,32px); }
@media (max-width:900px){ .ckt.colonna .ck-campi {
  grid-template-columns:1fr; } }
/* la strip d'imbarco in fondo: il richiamo, non un secondo form */
.imbarco-strip { display:flex; align-items:center; gap:18px 26px;
  flex-wrap:wrap; padding:clamp(22px,3vw,32px);
  background:var(--black); box-shadow:inset 0 0 0 1px var(--line-gold); }
.imbarco-strip h3 { font-family:var(--display); font-weight:250;
  font-size:clamp(19px,2.2vw,26px); letter-spacing:-.01em; flex:1 1 260px; }
.imbarco-strip .btn-primary { flex:none; }
.imbarco-garanzia { flex-basis:100%; display:flex; gap:8px;
  font-size:11px; color:var(--text-3); }
.imbarco-garanzia::before { content:'✓'; color:var(--gold); }'''

# ── 1 · hero-left alla tech: sotto corto, niente bottoni, riga quieta ─
SOTTO_A = '''<p class="sotto">Your dedicated expert hunts the whole Rome market —
        off-market included — negotiates for you and handles everything to
        move-in. By contract: <b>at least 3 options in your criteria within
        15 days, or the €350 is refunded in full</b> (Terms §4.2).</p>'''
SOTTO_B = '''<p class="sotto">A dedicated hunt across the whole market —
        off-market included. By contract: <b>3 options in 15 days, or the
        €350 back</b> (Terms §4.2).</p>'''

CTA_A = '''<div class="hero-actions">
        <a class="btn btn-primary" href="#checkin">Start the hunt</a>
        <a class="btn btn-secondary" href="''' + WA + '''" target="_blank" rel="noopener">Message Valentino →</a>
      </div>'''
CTA_B = ''

TRUST_CODA = '''trademark 019317594</a></p>'''
TRUST_CODA_B = TRUST_CODA + '''
      <p class="hero-quiet">Prefer to talk first?
        <a href="''' + WA + '''" target="_blank" rel="noopener">Message
        Valentino on WhatsApp →</a></p>'''

for f in FILES:
    s = open(f, encoding='utf-8').read()

    # ── 2 · estrai torno+form dalla vecchia sezione check-in ─────────
    t0m = '<div class="ck-torno" id="ckTorno" hidden'
    uno(s, t0m, f)
    t0 = s.index(t0m)
    fine_form = '</form>'
    uno(s, fine_form, f)
    t1 = s.index(fine_form) + len(fine_form)
    blocco_form = s[t0:t1]
    # niente margine da sezione: in hero il respiro lo dà la colonna
    blocco_form = blocco_form.replace('\n      style="margin-top:clamp(22px,3vw,34px)">', '>')
    # niente reveal .sale (l'hero è subito in scena: c'è il montaggio),
    # e la geometria in colonna
    a = '<form class="ckt sale" id="ckForm" novalidate>'
    uno(blocco_form, a, f)
    blocco_form = blocco_form.replace(a,
        '<form class="ckt colonna" id="ckForm" novalidate>')

    # ── 3 · la vecchia sezione diventa la strip d'imbarco ────────────
    sec0m = "<!-- ══ IL CHECK-IN — la porta: il brief e' un boarding pass ══════════════ -->"
    uno(s, sec0m, f)
    sec0 = s.index(sec0m)
    sec1m = '</section>'
    sec1 = s.index(sec1m, t1) + len(sec1m)
    assert sec0 < t0 < t1 < sec1, f'geometria sezione check-in rotta in {f}'
    STRIP = '''<!-- ══ L'IMBARCO — il richiamo alla cassa, che ora vive nell'hero ════════ -->
<section class="section" id="imbarco">
  <div class="container">
    <div class="imbarco-strip sale">
      <h3>Five lines. Then <span class="hl">we hunt</span>.</h3>
      <a class="btn btn-primary" href="#checkin">Board the hunt ↑</a>
      <p class="imbarco-garanzia"><span><b>Zero risk:</b> deducted on
        success, refunded in full if we don't deliver — Terms §4.2.</span></p>
    </div>
  </div>
</section>'''
    s = s[:sec0] + STRIP + s[sec1:]

    # ── 4 · il finder scende nella macchina, il form sale nell'hero ──
    fin0m = '<div class="finder quadro" id="finder" data-fase="0">'
    uno(s, fin0m, f)
    fin0 = s.index(fin0m)
    coda_hero = '\n  </div>\n</header>'
    uno(s, coda_hero, f)
    fin1 = s.index(coda_hero)
    finder_html = s[fin0:fin1]
    s = s[:fin0] + ('<div class="ck-lato" id="checkin">\n      '
                    + blocco_form + '\n    </div>') + s[fin1:]
    mac_m = '<div class="macchina sale" id="macchinaBox">'
    uno(s, mac_m, f)
    s = s.replace(mac_m, finder_html + '\n\n    ' + mac_m)

    # ── 5 · hero-left alla tech ──────────────────────────────────────
    for a, b in ((SOTTO_A, SOTTO_B), (CTA_A, CTA_B),
                 (TRUST_CODA, TRUST_CODA_B), (CSS_ANCORA, CSS)):
        uno(s, a, f)
        s = s.replace(a, b)

    # ── 6 · le tappe del filo: l'imbarco al posto del vecchio checkin ─
    a = "var TAPPE = ['conto', 'regola', 'macchina', 'tocca', 'verifica',\n    'checkin', 'faq'];"
    uno(s, a, f)
    s = s.replace(a, "var TAPPE = ['conto', 'regola', 'macchina', 'tocca', "
                     "'verifica',\n    'imbarco', 'faq'];")

    # ── verifiche ────────────────────────────────────────────────────
    uno(s, 'id="checkin"', f)          # UNO solo, nell'hero
    uno(s, 'id="ckForm"', f)
    uno(s, 'id="imbarco"', f)
    uno(s, 'id="finder"', f)
    assert s.index('id="checkin"') < s.index('id="conto"'), f
    assert s.index('id="macchina"') < s.index('id="finder"') \
        < s.index('id="macchinaBox"'), f
    assert 'class="hero-actions"' not in s, f
    open(f, 'w', encoding='utf-8').write(s)
    print(f, '→ il form è l\'hero,', len(s) // 1024, 'KB')
