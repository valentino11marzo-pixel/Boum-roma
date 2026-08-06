#!/usr/bin/env python3
# BOOM · PROPERTY FINDING — la pagina live, rieseguita; l'apparecchio mostra
# il motore vero. Riusa i token de LA HOME (lh-css).
import sys
MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
def leggi(n): return open(n, encoding='utf-8').read()
css = leggi('lh-css.html')
css = css.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
    '<title>Property Finding in Rome — Your Personal Realtor | BOOM</title>')
css = css.replace('content="Verified mid-term apartment rentals in Rome for internationals — English-first, legal contracts, 48-hour move-in. Browse homes or let us find yours."',
    'content="Your dedicated expert searches Rome\'s off-market properties, negotiates on your behalf and handles everything to move-in. €350 upfront, deducted on success."')
h = css + '\n' + leggi('pf-body.html')
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
else:
    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')
UNI = ['LUISS', 'Sapienza', 'Roma Tre', 'John Cabot', 'LUMSA', 'NABA', 'IED', 'RUFA']
h = h.replace('UNI_ITEMS\nUNI_ITEMS',
    '\n'.join('    <span class="uni-item">' + u.upper() + '</span>' for u in UNI + UNI))
if MODO == 'artefatto':
    # in anteprima le pagine si aprono l'una dall'altra
    h = h.replace('href="/apartments.html"',
        'href="https://claude.ai/code/artifact/ec4d60c9-d2c0-4ec8-883f-eb7b8b4df8f6"')
    h = h.replace('<a class="marchio" href="/"',
        '<a class="marchio" href="https://claude.ai/code/artifact/3c0dae67-a0e6-47d4-964f-832b824ffe0f"')
else:
    h = h.replace('<a class="marchio" href="/"', '<a class="marchio" href="/v2-home.html"')
    h = h.replace('href="/apartments.html"', 'href="/v2-apartments.html"')
uscita = 'boom-pf.html' if MODO == 'artefatto' else 'boom-pf-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB')
