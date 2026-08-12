#!/usr/bin/env python3
# v26 — LA CALMA. Da telefono la parte alta era caotica: prima della prima
#   casa c'erano 1.883px, cioe due schermate e mezzo di preambolo.
#
#   Il difetto vero non era estetico ma logico, e l'ha svelato la copy
#   stessa: la banchina chiedeva «Nothing in the catalogue fits?» PRIMA del
#   catalogo. Una domanda a cui nessuno puo rispondere se non ha ancora
#   visto niente. Quindi la banchina scende sotto le case, dove la domanda
#   ha finalmente senso — e con lei sale tutto il resto.
#
#   Cinque mosse:
#     1 · le quattro statistiche escono dall'hero: tre delle quattro erano
#         gia dette dalla banchina. Restano come una riga sola dentro di
#         lei, senza doppioni.
#     2 · il banner delle recensioni lascia l'hero e va dove parla la
#         persona: sopra la sezione del fondatore.
#     3 · nell'hero resta UNA riga di fiducia — Stripe, ogni casa
#         camminata, la risposta in due ore.
#     4 · la banchina si sposta sotto le case.
#     5 · la rete PFS la segue: «non c'era niente per te» e il seguito
#         naturale dello smistamento, non una sezione a quattro schermate
#         di distanza.
import re
f = 'pt.html'
s = open(f, encoding='utf-8').read()
def uno(a, b, nome):
    global s
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    s = s.replace(a, b)
def estrai(inizio, fine, nome):
    """toglie un blocco e lo restituisce"""
    global s
    assert s.count(inizio) == 1, 'DOPPIO: ' + nome
    a = s.index(inizio); b = s.index(fine, a)
    blocco = s[a:b]; s = s[:a] + s[b:]
    return blocco

STRIPE = open('stripe.svg', encoding='utf-8').read().replace(
    'class="stripe-logo"', 'class="hf-stripe" aria-label="Stripe"')
STRIPE = ' '.join(STRIPE.split())

# ── 1 · le statistiche escono dall'hero ─────────────────────────────────
estrai('      <div class="hero-stats" id="heroStats">', '    </div>\n\n    <aside class="board',
       'statistiche hero')
s = re.sub(r'\.hero-stats? ?\{[^}]*\}\n', '', s)
s = re.sub(r'\.hero-stat[a-z-]* ?[+>]? ?\.?[a-z-]*\(?[a-z]*\)? ?\{[^}]*\}\n', '', s)
s = re.sub(r'@media \(max-width:\d+px\)\{\n?  \.hero-stats[^}]*\}[^}]*\}\n', '', s)

# ── 2 · le recensioni lasciano l'hero ───────────────────────────────────
REC = estrai('    <a class="recensioni" href="RECENSIONI_URL"',
             '  </div>\n\n  <!-- la banchina', 'recensioni')

# ── 3 · nell'hero resta una riga sola di fiducia ────────────────────────
uno('      </form>\n', '''      </form>
      <div class="hero-fede">
        ''' + STRIPE + '''
        <span><b>Every euro through BOOM</b>, never to a stranger ·
          every home walked in person · we reply within 2h</span>
      </div>
''', 'riga fiducia hero')
uno("/* le recensioni: un filo sotto il tabellone, mai un cartello */",
'''/* la riga di fiducia nell'hero: una sola, sottile. Il discorso lungo sui
   soldi vive nella banchina, dove si parla di prezzi. */
.hero-fede { display:flex; align-items:center; gap:11px;
  margin-top:clamp(16px,2vw,22px); padding:11px 15px; border-radius:100px;
  background:var(--surface); box-shadow:inset 0 0 0 1px var(--line-0);
  max-width:max-content; }
.hero-fede .hf-stripe { width:40px; height:auto; flex:none; opacity:.85; }
.hero-fede span { font-size:11.5px; line-height:1.5; color:var(--text-4); }
.hero-fede span b { color:var(--text-2); font-weight:500; }
@media (max-width:640px){
  .hero-fede { border-radius:14px; padding:11px 13px; align-items:flex-start; }
  .hero-fede .hf-stripe { margin-top:2px; } }

/* le recensioni: un filo sotto il tabellone, mai un cartello */''',
'css riga fiducia')

# ── 4 · la banchina scende sotto le case ────────────────────────────────
BAN = estrai("  <!-- la banchina: dove chi arriva viene smistato, col prezzo scritto -->",
             '</header>', 'banchina')
BAN = BAN.replace('<div class="container">\n    <div class="banchina coro dentro-subito">',
                  '<div class="container">\n    <div class="banchina coro">')
BAN = ('<!-- ══ LA BANCHINA — dopo il catalogo, non prima ═════════════════════════\n'
       '     Sta qui per una ragione logica prima che estetica: chiede «nothing\n'
       '     in the catalogue fits?», e quella domanda ha senso solo dopo che il\n'
       '     catalogo l\'hai visto. -->\n<section class="sezione" id="banchina">\n'
       + BAN.split('\n', 1)[1].rstrip() + '\n</section>\n\n')

# ── 5 · la rete PFS segue la banchina ───────────────────────────────────
RETE = estrai('<!-- ══ LA RETE — «not the perfect one? we\'ll find it.» ═══════════════════ -->',
              '<!-- ══ CONCIERGE', 'rete pfs')

# inserimento: subito dopo le case della settimana
i = s.index('<!-- ══ LA SKYLINE')
s = s[:i] + BAN + RETE + s[i:]

# le recensioni sopra il fondatore
i = s.index('<!-- ══ PERCHÉ ESISTIAMO')
s = (s[:i] + '<!-- il banner delle recensioni sta dove parla la persona -->\n'
     '<div class="container">\n' + REC.strip() + '\n</div>\n\n' + s[i:])
uno('.recensioni { display:flex; align-items:center; gap:10px; margin-top:10px;',
    '.recensioni { display:flex; align-items:center; gap:10px;\n'
    '  margin-top:clamp(26px,3vw,40px);', 'margine recensioni')

# ── 6 · le quattro cifre rientrano nella banchina, senza doppioni ───────
uno('''        <span class="ch"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12.5l5 5 10-11"/></svg>Walked and filmed by us</span>
        <span class="sep"></span>
        <span class="ch"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12.5l5 5 10-11"/></svg>Move-in total before you
          pay</span>
        <span class="sep"></span>
        <span class="ch terzo"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12.5l5 5 10-11"/></svg>Licensed agency · BOOM® EU
          019317594</span>''',
'''        <span class="ch"><b>48h</b>average move-in</span>
        <span class="sep"></span>
        <span class="ch"><b>98%</b>success rate</span>
        <span class="sep"></span>
        <span class="ch"><b>€0</b>hidden fees</span>
        <span class="sep"></span>
        <span class="ch terzo"><b>100%</b>walked in person</span>''',
'cifre nella coda')
uno('''.ba-coda .ch { display:inline-flex; align-items:center; gap:6px;
  white-space:nowrap; }
.ba-coda .ch svg { width:13px; height:13px; color:var(--gold); flex:none;
  fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round;
  stroke-linejoin:round; }''',
'''.ba-coda .ch { display:inline-flex; align-items:baseline; gap:7px;
  white-space:nowrap; }
/* le quattro cifre che stavano nell'hero: qui non fanno doppione con
   niente, perche la garanzia sopra parla di soldi e loro di risultati */
.ba-coda .ch b { font-family:var(--display); font-size:15px; font-weight:400;
  letter-spacing:.02em; color:var(--gold); font-variant-numeric:tabular-nums; }''',
'css cifre coda')

assert s.count('class="banchina') == 1
assert s.count('class="recensioni"') == 1
assert 'hero-stats' not in s, 'residui statistiche'
assert s.count('id="oraRoma"') == 1
open(f, 'w', encoding='utf-8').write(s)
print('v26 · hero calmo · banchina + PFS sotto le case · recensioni dal fondatore')
