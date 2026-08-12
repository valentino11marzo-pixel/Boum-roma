#!/usr/bin/env python3
# v27 — la ripetizione, la coda, il marchio.
#
#   1 · LE SEI PORTE SE NE VANNO. Aveva ragione: sotto la banchina i
#       servizi tornavano una seconda volta. Verificato una per una — tutte
#       e sei sono gia altrove nella stessa pagina:
#         Ready Apartments → la vetrina delle case, sopra
#         Property Finding → banchina €350 + la sezione della rete
#         Deal Assistance  → banchina €249
#         Virtual Viewing  → banchina €89
#         Contract Check   → banchina €49
#         Concierge        → ha una sezione tutta sua, subito dopo
#       Non era una sintesi seguita da un dettaglio: era lo stesso elenco,
#       due volte. Il menu «Services» ora punta alla banchina.
#
#   2 · LA RETE SMETTE DI RIFARE LA DOMANDA. La banchina chiede gia
#       «Nothing in the catalogue fits?»; qui la stessa domanda arrivava
#       una seconda volta a due schermate di distanza. Ora questa sezione
#       non vende: MOSTRA la macchina che sta gia cercando.
#
#   3 · LA CODA DELLA BANCHINA, rifatta. Quattro cifre e un orologio vivo
#       stavano sulla stessa riga in due registri diversi. Ora le cifre
#       sono una fila propria, incolonnate; l'ora e una riga sottile.
#
#   4 · IL MARCHIO. Sono otto anelli concentrici: a 56px i tre interni
#       finiscono sotto il pixel e si impastano — e la «sgranatura».
#       Non e resa, e densita. Famiglia ottica: 6 anelli sotto gli 80px
#       (silhouette identica, nessun impasto), 8 dagli 80 in su.
#       Piu la taglia C dello studio: segno 66/58, parola 30/25, .26em.
import re
f = 'pt.html'
s = open(f, encoding='utf-8').read()
def uno(a, b, nome):
    global s
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    s = s.replace(a, b)

# ── 1 · via le sei porte ────────────────────────────────────────────────
a = s.index('<!-- ══ I SERVIZI — sei porte, una fila ═')
b = s.index('<!-- ══ CONCIERGE')
via = s[a:b]
assert via.count('class="porta"') == 6, via.count('class="porta"')
s = s[:a] + s[b:]
s = s.replace('href="#porte"', 'href="#banchina"')
# il CSS delle porte resta usato? no: era solo quella sezione
s = re.sub(r'/\* ══ SERVIZI — sei porte[^\n]*\n(?:.*?\n)*?(?=/\* ══ )', '', s, count=1)

# ── 2 · la rete mostra la macchina, non rifa la domanda ─────────────────
uno('''        <span class="eyebrow"><i></i>More than a portal</span>
        <h2 class="titolo">Not the perfect one? <span class="hl">We'll find it.</span></h2>
        <p class="sotto">We're an agency with a tech engine, not a listings
          wall. Wrong dates, wrong zone? Put us to work.</p>''',
'''        <span class="eyebrow"><i></i>The engine</span>
        <h2 class="titolo">While you read this, <span class="hl">it's already
          looking</span>.</h2>
        <p class="sotto">Every agency says it will look for you. Ours is a
          machine that scans Rome's portals and the off-market ninety-six
          times a day, and a human who opens every match before you ever
          see it.</p>''', 'testata rete')
uno('''        <h3>Wrong dates? Wrong zone?<br><span class="hl">Put the machine on it.</span></h3>
        <p>Your brief becomes a live search: our engine scans the market and
          the off-market around the clock, a human verifies every match, and
          you get curated options — not links.</p>''',
'''        <h3>Your brief becomes<br><span class="hl">a live search.</span></h3>
        <p>You describe the home; we turn it into a standing query. The radar
          watches Immobiliare, Idealista and the listings that never reach a
          portal. Every hit is opened, checked and walked by a person before
          it reaches you — so what arrives is a shortlist, not links.</p>''',
'rete corpo')

# ── 3 · la coda della banchina ──────────────────────────────────────────
uno('''      <div class="ba-coda">
        <span class="ch"><b>48h</b>average move-in</span>
        <span class="sep"></span>
        <span class="ch"><b>98%</b>success rate</span>
        <span class="sep"></span>
        <span class="ch terzo"><b>€0</b>hidden fees</span>
        <span class="sep"></span>
        <span class="ch"><b>100%</b>walked in person</span>
        <span class="ba-viva"><span class="pt"></span>Rome
          <span class="orologio-roma" id="oraRoma">—:—</span>
          · we reply within 2h</span>
      </div>''',
'''      <div class="ba-cifre">
        <div><b>48h</b><span>average move-in</span></div>
        <div><b>98%</b><span>success rate</span></div>
        <div><b>100%</b><span>walked in person</span></div>
        <div><b>€0</b><span>hidden fees</span></div>
      </div>
      <div class="ba-ora">
        <span class="ba-viva"><span class="pt"></span>Rome
          <span class="orologio-roma" id="oraRoma">—:—</span></span>
        <span>· a named human replies within 2h, not a form</span>
      </div>''', 'coda banchina')
uno('''/* la coda: i fatti che restano veri comunque, e l'ora di Roma */
.ba-coda { display:flex; align-items:center; gap:9px; flex-wrap:wrap;
  padding:10px 18px; border-top:1px solid var(--line-0); background:var(--void);
  font-size:11.5px; color:var(--text-4); }
.ba-coda .ch { display:inline-flex; align-items:baseline; gap:7px;
  white-space:nowrap; }
/* le quattro cifre che stavano nell'hero: qui non fanno doppione con
   niente, perche la garanzia sopra parla di soldi e loro di risultati */
.ba-coda .ch b { font-family:var(--display); font-size:15px; font-weight:400;
  letter-spacing:.02em; color:var(--gold); font-variant-numeric:tabular-nums; }
.ba-coda .sep { width:1px; height:12px; background:var(--line); flex:none; }''',
'''/* le quattro cifre: una fila propria, incolonnate. Prima stavano sulla
   stessa riga dell'orologio, in due registri diversi — numeri e tempo
   reale non si mischiano. */
.ba-cifre { display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
  background:var(--line-0); border-top:1px solid var(--line-0); }
.ba-cifre > div { background:var(--void); padding:13px 16px 14px; }
.ba-cifre b { display:block; font-family:var(--display); font-size:19px;
  font-weight:400; letter-spacing:.02em; color:var(--gold);
  font-variant-numeric:tabular-nums; }
.ba-cifre span { display:block; margin-top:2px; font-size:10.5px;
  line-height:1.35; color:var(--text-4); }
@media (max-width:640px){
  .ba-cifre { grid-template-columns:1fr 1fr; }
  .ba-cifre > div { padding:11px 14px 12px; }
  .ba-cifre b { font-size:17px; } }

/* l'ora di Roma: una riga sottile, non una mattonella */
.ba-ora { display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  padding:9px 18px; border-top:1px solid var(--line-0);
  background:var(--surface); font-size:11.5px; color:var(--text-4); }
@media (max-width:640px){ .ba-ora { padding:9px 15px; } }''', 'css coda')

# ── 4 · il marchio: taglia C + famiglia ottica ──────────────────────────
uno('''.marchio { display:inline-flex; align-items:center; gap:11px; }
.marchio .logo-mark { width:56px; height:56px; flex:none; }
.marchio span { font-family:var(--display); font-size:23px; font-weight:400;
  letter-spacing:.36em; text-indent:.36em; text-transform:uppercase; }
@media (max-width:640px){
  .marchio { gap:9px; }
  .marchio .logo-mark { width:52px; height:52px; }
  .marchio span { font-size:21px; letter-spacing:.3em; text-indent:.3em; } }''',
'''/* IL MARCHIO — taglia «Insegna»: il segno ha il diametro perche gli anelli
   si leggano davvero, la parola la mole di un titolo. Il tracking scende da
   .36 a .26: e la differenza fra quattro lettere e una parola. */
.marchio { display:inline-flex; align-items:center; gap:13px; }
.marchio .logo-mark { width:66px; height:66px; flex:none; }
.marchio span { font-family:var(--display); font-size:30px; font-weight:400;
  letter-spacing:.26em; text-indent:.26em; text-transform:uppercase; }
@media (max-width:640px){
  .marchio { gap:10px; }
  .marchio .logo-mark { width:58px; height:58px; }
  .marchio span { font-size:25px; letter-spacing:.22em; text-indent:.22em; } }
/* la barra cresce con lui */
.nav { padding:16px 0; }
.nav.scrolled, html.aperto .nav { padding:11px 0; }''', 'taglia marchio')
open(f, 'w', encoding='utf-8').write(s)
print('v27 · via le sei porte · rete riscritta · coda rifatta · marchio taglia C')
