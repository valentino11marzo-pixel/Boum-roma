#!/usr/bin/env python3
# BOOM · HOW IT WORKS — il manifesto: mezzo portale, mezza agenzia, poi il
# concierge. Stessa testa/nav/piede del portale; la FAQ visibile e il
# JSON-LD nascono dalla STESSA fonte (TESTA.COME_FAQ) — markup che afferma
# cio' che la pagina non mostra e' contenuto nascosto (regola GEO).
#   python3 costruisci-come.py artefatto | sito
import html as _html, re, sys

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
def leggi(n): return open(n, encoding='utf-8').read()

import testa as TESTA

TITOLO = 'How BOOM works — portal, agency, concierge | BOOM Rome'
DESCR = ('Half portal, half agency, then a concierge: live catalogue with '
         'real dates, video viewings, a registered contract signed from '
         'your phone, and a named human after the keys.')

VOCI = ''.join(
    '<details class="faq-v"' + (' open' if i == 0 else '') + '><summary>'
    + _html.escape(q['name']) + '</summary><p>'
    + _html.escape(q['acceptedAnswer']['text']) + '</p></details>'
    for i, q in enumerate(TESTA.COME_FAQ['mainEntity']))

pt = leggi('pt.html')
testa = pt[:pt.index('</style>') + len('</style>')]
nav = pt[pt.index('<nav class="nav" id="nav">'):pt.index('<!-- ══ HERO')]
piede = pt[pt.index('<footer class="piede">'):
           pt.index('</footer>') + len('</footer>')]

corpo = leggi('come-corpo.html').replace('FAQ_COME_VOCI', VOCI)

h = '\n'.join([testa, nav, corpo, piede,
               leggi('solari-engine.html'), leggi('deco-organi.html')])
h = h.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
    '<title>' + TITOLO + '</title>')
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace(
    '<meta name="description" content="Verified mid-term apartment rentals in '
    'Rome for internationals — English-first, legal contracts, 48-hour '
    'move-in. Your landing in Rome, handled.">',
    '<meta name="description" content="' + DESCR + '">')

# l'invariante GEO: ogni domanda del JSON-LD esiste come <summary> visibile
for q in TESTA.COME_FAQ['mainEntity']:
    assert _html.escape(q['name']) in h, 'FAQ invisibile: ' + q['name']

if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
    HOME = 'https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478'
    AP = 'https://claude.ai/code/artifact/12798611-3d8a-498f-a043-c6f10b6856cd'
    h = h.replace('href="#banchina"', 'href="' + HOME + '#banchina"')
    h = h.replace('href="/index.html#banchina"', 'href="' + HOME + '#banchina"')
    h = h.replace('href="/index.html"', 'href="' + HOME + '"')
    h = h.replace('href="/apartments.html"', 'href="' + AP + '"')
    h = h.replace('href="/how-it-works.html"', 'href="#anime"')
    h = re.sub(r'href="/([a-z-]+)\.html"', r'href="https://www.boomrome.com/\1"', h)
    h = h.replace('href="/login"', 'href="https://www.boomrome.com/login"')
else:
    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" media="print" onload="this.media=\'all\'">\n'
        '<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap"></noscript>')
    h = h.replace('href="#banchina"', 'href="/#banchina"')
    h = h.replace('href="/index.html#banchina"', 'href="/#banchina"')
    for da, a_ in {'/index.html': '/',
        '/apartments.html': '/apartments',
        '/how-it-works.html': '#anime'}.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
    # cleanUrls: OGNI link interno perde il .html anche nel modo sito
    h = re.sub(r'href="/([a-z-]+)\.html"', r'href="/\1"', h)
    OG = TESTA.blocco_come(TITOLO, DESCR) + '\n'
    i = h.index('</title>') + len('</title>')
    h = h[:i] + '\n' + OG + h[i:]
    h = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         + h.replace('</style>', '</style>\n</head>\n<body>', 1)
         + '\n' + TESTA.CONSENSO + '\n</body>\n</html>')

uscita = 'boom-come.html' if MODO == 'artefatto' else 'boom-come-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · FAQ {len(TESTA.COME_FAQ["mainEntity"])} voci')
