#!/usr/bin/env python3
# MONTA IL BIGLIETTO II NELLA HOME — sostituisce lo Scaffale (pr-) nella
# sezione #banchina di pt.html con la biglietteria (.bp) del Biglietto II.
# Ogni sostituzione è ancorata con uno(): se il sorgente è cambiato, il
# patch FALLISCE invece di montare a metà. Sana anche il div "banchina
# sale" duplicato (bug pre-esistente: il secondo non veniva mai chiuso).
import sys

SP = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/'


def uno(s, ago):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO: attese 1 occorrenza, trovate {n}: {ago[:70]!r}')
        sys.exit(1)
    return ago


pt = open(SP + 'pt.html', encoding='utf-8').read()
bg = open(SP + 'variante-biglietto.html', encoding='utf-8').read()

# ── 1. il CSS del biglietto, estratto dalla variante ──────────────────
a0 = bg.index(uno(bg, '/* ══ LA BIGLIETTERIA'))
a1 = bg.index(uno(bg, '/* ── la riga dei fatti'))
seg_a = bg[a0:a1]
b0 = bg.index(uno(bg, '/* ── breakpoint intermedio'))
b1 = bg.index(uno(bg, '</style>'))
seg_b = bg[b0:b1]

# i token di firma + la molla (pt.html non la definisce) vivono sulla
# biglietteria stessa, come facevano su .pr-fila
seg_a = seg_a.replace(uno(seg_a, '.biglietteria { display:grid;'),
                      '.biglietteria { --c-vv:#00FF88; --c-pf:#FFD700; '
                      '--c-da:#9D8CFF; --c-cc:#3ED3FF;\n'
                      '  --molla:cubic-bezier(.3,1.45,.5,1); display:grid;')
css = ('/* IL BIGLIETTO — il servizio come boarding pass: la rotta del '
       'trasferimento,\n   il talloncino col prezzo, la perforazione '
       'punzonata. La metafora è un fatto\n   di prodotto: la visita '
       'confermata arriva come Apple Wallet boarding pass. */\n'
       + seg_a + seg_b)

ini = uno(pt, '/* LO SCAFFALE')
fin = uno(pt, '@media (max-width:1020px){ .pr.eroe .compra '
              '{ align-self:stretch; } }')
i0 = pt.index(ini)
i1 = pt.index(fin) + len(fin)
pt = pt[:i0] + css.rstrip() + pt[i1:]

# ── 2. il markup: la biglietteria al posto dello scaffale ─────────────
m0 = bg.index(uno(bg, '<div class="biglietteria" id="biglietteria">'))
m1 = bg.index(uno(bg, '<div class="fatti">'))
biglietti = bg[m0:m1].rstrip()
biglietti = biglietti.replace(
    uno(biglietti, '<div class="biglietteria" id="biglietteria">'),
    '<div class="biglietteria coro" id="prBiglietti" '
    'style="margin-top:clamp(22px,2.6vw,34px)">')
# il blocco della variante chiude biglietteria e apre fatti: qui la
# chiusura del grid resta, i fatti no (la home ha gia ba-garanzie/cifre)
if not biglietti.endswith('</div>'):
    print('FALLITO: il blocco biglietti non termina con </div>')
    sys.exit(1)

vecchio0 = uno(pt, '<div class="pr-fila coro" id="prScaffale"')
j0 = pt.index(vecchio0)
tilt_fine = uno(pt, "og.style.setProperty('--ry', '0deg');\n        });\n"
                    '      });\n    })();\n    </script>')
j1 = pt.index(tilt_fine) + len(tilt_fine)

tilt = '''<script>
    /* prendere in mano il biglietto: tilt lieve verso il cursore, solo
       con un mouse vero; la molla lo riporta a piatto al rilascio. */
    (function () {
      if (!(window.matchMedia
        && matchMedia('(hover:hover) and (pointer:fine)').matches)) return;
      if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
      document.querySelectorAll('#prBiglietti .bp').forEach(function (bp) {
        bp.addEventListener('pointermove', function (e) {
          var r = bp.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - .5;
          var y = (e.clientY - r.top) / r.height - .5;
          bp.style.setProperty('--rx', (x * 3.5) + 'deg');
          bp.style.setProperty('--ry', (-y * 2.5) + 'deg');
        });
        bp.addEventListener('pointerleave', function () {
          bp.style.setProperty('--rx', '0deg');
          bp.style.setProperty('--ry', '0deg');
        });
      });
    })();
    </script>'''
pt = pt[:j0] + biglietti + '\n\n    ' + tilt + pt[j1:]

# ── 3. l'ingresso in scena (coro) punta ai biglietti, non ai .pr ──────
pt = pt.replace(uno(pt, 'html.vivo .pr-fila .pr { opacity:0; }'),
                'html.vivo .biglietteria .bp { opacity:0; }')
pt = pt.replace(uno(pt, 'html.vivo .pr-fila.dentro .pr {'),
                'html.vivo .biglietteria.dentro .bp {')
for k in (1, 2, 3, 4):
    pt = pt.replace(
        uno(pt, f'html.vivo .pr-fila.dentro .pr:nth-child({k})'),
        f'html.vivo .biglietteria.dentro .bp:nth-child({k})')
pt = pt.replace(uno(pt, 'html.vivo .pr-fila .pr { opacity:1; animation:none; }'),
                'html.vivo .biglietteria .bp { opacity:1; animation:none; }')

# ── 4. il div "banchina sale" duplicato (bug pre-esistente) ───────────
doppio = ('<div class="banchina sale" style="margin-top:clamp(16px,2vw,24px)">'
          '<div class="banchina sale" style="margin-top:clamp(16px,2vw,24px)">')
pt = pt.replace(uno(pt, doppio),
                '<div class="banchina sale" '
                'style="margin-top:clamp(16px,2vw,24px)">')

# ── verifiche finali ──────────────────────────────────────────────────
for ago in ('id="prBiglietti"', 'class="bp eroe"',
            '--molla:cubic-bezier(.3,1.45,.5,1); display:grid;'):
    uno(pt, ago)
for ago in ('timbro', 'filigrana', 'perf perf-v'):
    assert ago in pt, f'manca {ago}'
assert 'prScaffale' not in pt, 'scaffale ancora presente'
assert '.pr-fila' not in pt, 'CSS pr-fila ancora presente'
assert 'pr-arriva' in pt, 'keyframes ingresso persi'
open(SP + 'pt.html', 'w', encoding='utf-8').write(pt)
print('montato: biglietteria nella home,', len(pt) // 1024, 'KB')
