#!/usr/bin/env python3
# BOOM · YOUR MONEY — la stessa lingua del portale, sui soldi.
#   python3 costruisci-soldi.py artefatto | sito
import json, re, sys

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
def leggi(n): return open(n, encoding='utf-8').read()
def euro(n): return '€' + f'{int(n):,}'

piene = json.load(open('case-full.json'))

# i preset: tre case VERE — la piu economica, la mediana, la piu cara
vive = []
for r in piene:
    if r.get('status') != 'available': continue
    nome = r.get('name')
    p = int(re.sub(r'[^\d]', '', str(r.get('price') or '')) or 0)
    if not nome or not p: continue
    m = re.search(r'\d+', str(r.get('depositMonths') or ''))
    vive.append({'nome': re.sub(r'\s+', ' ', nome).strip(),
                 'zona': re.sub(r'\s+', ' ', str(r.get('zone') or 'Roma'))
                     .split('/')[0].strip(),
                 'p': p, 'm': int(m.group()) if m else 1})
vive.sort(key=lambda x: x['p'])
assert len(vive) >= 3, 'servono almeno tre case vive'
PRESET = [vive[0], vive[len(vive) // 2], vive[-1]]

TASTI = '\n        '.join(
    f'<button type="button"><b>{p["nome"]}</b>'
    f'<span>{p["zona"]} · {euro(p["p"])}/mo</span></button>'
    for p in PRESET)

pt = leggi('pt.html')
testa = pt[:pt.index('</style>') + len('</style>')]
nav = pt[pt.index('<nav class="nav" id="nav">'):pt.index('<!-- ══ HERO')]
piede = pt[pt.index('<footer class="piede">'):
           pt.index('</footer>') + len('</footer>')]

h = '\n'.join([testa, nav, leggi('soldi-corpo.html'), piede,
               leggi('solari-engine.html'), leggi('deco-organi.html')])
h = h.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
    '<title>Your money at BOOM — every euro, in the open | BOOM Rome</title>')
h = h.replace('PRESET_TASTI', TASTI)
h = h.replace("'PRESET_JSON'", json.dumps(
    [{'p': p['p'], 'm': p['m']} for p in PRESET]))
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())

DESCR = ('What you pay to rent a home in Rome with BOOM — and what comes '
         'back. First month + deposit (returned, filmed in and out) + a '
         'flat 10% annual fee. Stripe receipts, a licensed agency, no '
         'fourth line at the table.')
h = h.replace(
    '<meta name="description" content="Verified mid-term apartment rentals in '
    'Rome for internationals — English-first, legal contracts, 48-hour '
    'move-in. Your landing in Rome, handled.">',
    '<meta name="description" content="' + DESCR + '">')

if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
    HOME = 'https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478'
    AP = 'https://claude.ai/code/artifact/12798611-3d8a-498f-a043-c6f10b6856cd'
    h = h.replace('href="#banchina"', 'href="' + HOME + '#banchina"')
    h = h.replace('href="/index.html#banchina"', 'href="' + HOME + '#banchina"')
    h = h.replace('href="/index.html"', 'href="' + HOME + '"')
    h = h.replace('href="/apartments.html"', 'href="' + AP + '"')
    h = h.replace('href="/your-money.html"', 'href="#giornouno"')
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
        '/your-money.html': '#giornouno'}.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
    # cleanUrls: OGNI link interno perde il .html anche nel modo sito
    h = re.sub(r'href="/([a-z-]+)\.html"', r'href="/\1"', h)
    import testa as TESTA
    OG = TESTA.blocco_money(
        'Your money at BOOM — every euro, in the open | BOOM Rome',
        DESCR) + '\n'
    i = h.index('</title>') + len('</title>')
    h = h[:i] + '\n' + OG + h[i:]
    h = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         + h.replace('</style>', '</style>\n</head>\n<body>', 1)
         + '\n' + TESTA.CONSENSO + '\n</body>\n</html>')

uscita = 'boom-soldi.html' if MODO == 'artefatto' else 'boom-soldi-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · preset: '
      + ' | '.join(f"{p['nome']} {euro(p['p'])}×{p['m']}" for p in PRESET))
