#!/usr/bin/env python3
# v28 — la banchina rifatta da capo (testata + cifre), il footer riordinato.
#
#   · La testata «Wherever you are in this, there's a door» era un cartello
#     dentro la scatola, diverso da ogni altra sezione del sito. Ora la
#     banchina ha la testata STANDARD (eyebrow + titolo + sotto) come tutte
#     le altre — piu omogeneo per gli occhi, per i motori e per le AI.
#     E il link «All services» se ne va: dopo la v27 puntava alla sezione
#     in cui gia si trovava.
#   · Le quattro cifre erano nude: numeri piu grandi, etichette maiuscole
#     spaziate, celle con peso.
#   · Il footer: resta solo «Built in Rome, for Rome.» — il resto era un
#     secondo motto appeso al primo.
import re
f = 'pt.html'
s = open(f, encoding='utf-8').read()
def uno(a, b, nome):
    global s
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    s = s.replace(a, b)

# ── 1 · la testata standard, fuori dalla scatola ────────────────────────
uno('''<section class="sezione" id="banchina">
  <div class="container">
    <div class="banchina coro">

      <div class="ba-capo">
        <b>Wherever you are in this, <em>there's a door</em>.</b>
        <a class="ba-tutti" href="#banchina">All services →</a>
      </div>
''',
'''<section class="sezione" id="banchina">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Services · flat prices</span>
      <h2 class="titolo">Pick the door that matches
        <span class="hl">your situation</span>.</h2>
      <p class="sotto">Every price is flat and written here — and most of it
        comes back: credited to your agency fee when you rent with us, or
        refunded if we don't deliver.</p>
    </div>

    <div class="banchina coro" style="margin-top:clamp(22px,2.6vw,34px)">
''', 'testata banchina')

# il CSS della vecchia testata se ne va — blocchi espliciti
uno("""
.ba-capo { display:flex; align-items:baseline; justify-content:space-between;
  gap:14px; padding:14px 18px 12px; }
.ba-capo b { flex:1; min-width:0; }
@media (max-width:640px){
  .ba-capo { padding:13px 15px 11px; }
  .ba-capo b { font-size:14px; }
  .ba-tutti { font-size:10px; letter-spacing:.1em; } }
.ba-capo b { font-family:var(--display); font-size:15.5px; font-weight:400;
  letter-spacing:.005em; color:var(--text); }
.ba-capo b em { font-style:normal; color:var(--gold); }
.ba-tutti { display:inline-flex; align-items:center; gap:7px; font-size:11px;
  font-weight:600; letter-spacing:.14em; text-transform:uppercase;
  color:var(--text-4); padding:10px 2px; margin:-10px 0;
  transition:color .25s var(--ease); }
.ba-tutti:hover { color:var(--gold); }
""", "\n", 'css testata')
uno("""@media (max-width:560px){
  /* la sezione servizi completa e in pagina e «Services» sta nel menu:
     qui il link costa una riga di titolo e non aggiunge niente */
  .ba-tutti { display:none; }
  /* «licensed agency» e gia dentro la garanzia verde e nel footer legale */
  .ba-coda .ch.terzo { display:none; } }""",
"""@media (max-width:560px){
  .ba-coda .ch.terzo { display:none; } }""", 'strette finali')
assert 'ba-capo' not in s and 'ba-tutti' not in s, 'residui testata'
# la prima porta non ha piu la testata sopra: il bordo alto lo mette la scatola
uno('.ba-porte { display:grid; grid-template-columns:repeat(4,1fr); gap:1px;\n  background:var(--line-0); border-top:1px solid var(--line-0); }',
    '.ba-porte { display:grid; grid-template-columns:repeat(4,1fr); gap:1px;\n  background:var(--line-0); }', 'bordo porte')

# ── 2 · le cifre, vestite ───────────────────────────────────────────────
uno('''.ba-cifre { display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
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
  .ba-cifre b { font-size:17px; } }''',
'''.ba-cifre { display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
  background:var(--line-0); border-top:1px solid var(--line-0); }
.ba-cifre > div { position:relative; background:var(--void);
  padding:16px 18px 17px; overflow:hidden; }
/* il filo d'oro in testa a ogni cifra: sono risultati, non note a margine */
.ba-cifre > div::before { content:''; position:absolute; top:0; left:18px;
  width:26px; height:2px; background:var(--gold); opacity:.55; }
.ba-cifre b { display:block; font-family:var(--display); font-size:24px;
  font-weight:300; letter-spacing:.01em; color:var(--gold);
  font-variant-numeric:tabular-nums; }
.ba-cifre span { display:block; margin-top:4px; font-size:10px;
  font-weight:600; letter-spacing:.14em; text-transform:uppercase;
  line-height:1.4; color:var(--text-4); }
@media (max-width:640px){
  .ba-cifre { grid-template-columns:1fr 1fr; }
  .ba-cifre > div { padding:13px 15px 14px; }
  .ba-cifre > div::before { left:15px; }
  .ba-cifre b { font-size:20px; } }''', 'cifre vestite')

# ── 3 · il footer: un motto solo ────────────────────────────────────────
uno('''        <p class="piede-motto">Built in Rome, for Rome. If we can make Rome's
          rental market work, we can make it work anywhere.</p>''',
'''        <p class="piede-motto">Built in Rome, for Rome.</p>''', 'motto')

open(f, 'w', encoding='utf-8').write(s)
print('v28 · banchina con testata standard · cifre vestite · motto asciutto')
