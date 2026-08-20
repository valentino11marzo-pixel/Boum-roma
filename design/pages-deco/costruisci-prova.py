#!/usr/bin/env python3
# BOOM · LA PROVA (/try) — il noleggio in 90 secondi: il percorso intero
# reso VIVIBILE in cinque atti, su tre case VERE del catalogo. L'unica
# bugia è dichiarata (è una simulazione); tutto il resto — prezzi, zone,
# aritmetica del giorno uno — è il dato reale.
#   python3 costruisci-prova.py artefatto | sito
import html as _html, json, re, sys

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
def leggi(n): return open(n, encoding='utf-8').read()

import testa as TESTA

TITOLO = 'Try BOOM — the 90-second rental | BOOM Rome'
DESCR = ('Rent it before you rent it: a 90-second simulation of the whole '
         'BOOM journey — pick a real Rome home, ask on a live tour, read '
         'the terms in English, sign with your finger. Nothing stored.')

# ── le tre case vere: disponibili, con foto, zone diverse, prezzi
#    scalati (bassa · media · alta). Regola deterministica, mai a mano. ──
piene = json.load(open('case-full.json'))
vive = []
for r in piene:
    if r.get('status') != 'available': continue
    img = r.get('image') or (r.get('images') or [None])[0]
    p = int(re.sub(r'[^\d]', '', str(r.get('price') or '')) or 0)
    nome = re.sub(r'\s+', ' ', str(r.get('name') or '')).strip()
    if not (img and p and nome and r.get('_id')): continue
    m = re.search(r'\d+', str(r.get('depositMonths') or ''))
    vive.append({'id': r['_id'], 'nome': nome,
                 'zona': re.sub(r'\s+', ' ', str(r.get('zone') or 'Roma'))
                     .split('/')[0].strip(),
                 'p': p, 'mesi': int(m.group()) if m else 0,
                 'foto': img,
                 'beds': int(re.sub(r'[^\d]', '', str(r.get('bedrooms') or '1')) or 1)})
vive.sort(key=lambda x: x['p'])
assert len(vive) >= 3, 'servono almeno tre case vive con foto'
# bassa, mediana, alta — con zone tutte diverse quando possibile
tris = [vive[0]]
for cand in [vive[len(vive) // 2], vive[-1]]:
    if all(cand['zona'] != c['zona'] for c in tris): tris.append(cand)
for cand in reversed(vive):
    if len(tris) >= 3: break
    if all(cand['id'] != c['id'] for c in tris): tris.append(cand)
tris = tris[:3]

def carta(c):
    e = _html.escape
    return (f'<button type="button" class="pv-casa" data-id="{e(str(c["id"]))}"'
            f' data-nome="{e(c["nome"])}" data-zona="{e(c["zona"])}"'
            f' data-prezzo="{c["p"]}" data-mesi="{c["mesi"]}"'
            f' data-foto="{e(c["foto"])}">'
            f'<span class="foto" style="background-image:url(\'{e(c["foto"])}\')"></span>'
            f'<span class="info"><b>{e(c["nome"])}</b>'
            f'<span>{e(c["zona"])} · {c["beds"]} bed</span>'
            f'<span class="pcanone">€{c["p"]:,}<small> /mo</small></span></span>'
            f'<span class="scegli">This one →</span></button>')

CASE_HTML = '\n          '.join(carta(c) for c in tris)

pt = leggi('pt.html')
testa = pt[:pt.index('</style>') + len('</style>')]
nav = pt[pt.index('<nav class="nav" id="nav">'):pt.index('<!-- ══ HERO')]
piede = pt[pt.index('<footer class="piede">'):
           pt.index('</footer>') + len('</footer>')]

# PRIMA il segnaposto JSON (contiene 'PV_CASE': l'ordine inverso lo sbrana)
corpo = leggi('prova-corpo.html').replace("'PV_CASE_JSON'", json.dumps(
    [{'id': c['id'], 'p': c['p']} for c in tris]))
corpo = corpo.replace('PV_CASE', CASE_HTML)

h = '\n'.join([testa, nav, corpo, piede, leggi('deco-organi.html')])
h = h.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
    '<title>' + TITOLO + '</title>')
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
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
    h = h.replace('href="/try.html"', 'href="#prova"')
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
        '/try.html': '#prova'}.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
    h = re.sub(r'href="/([a-z-]+)\.html"', r'href="/\1"', h)
    OG = TESTA.blocco_prova(TITOLO, DESCR) + '\n'
    i = h.index('</title>') + len('</title>')
    h = h[:i] + '\n' + OG + h[i:]
    h = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         + h.replace('</style>', '</style>\n</head>\n<body>', 1)
         + '\n' + TESTA.CONSENSO + '\n</body>\n</html>')

uscita = 'boom-prova.html' if MODO == 'artefatto' else 'boom-prova-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · case: '
      + ' | '.join(f"{c['nome']} €{c['p']}" for c in tris))
