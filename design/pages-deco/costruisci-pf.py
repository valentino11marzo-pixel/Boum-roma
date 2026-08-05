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
uscita = 'boom-pf.html' if MODO == 'artefatto' else 'boom-pf-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB')
