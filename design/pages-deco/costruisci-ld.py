#!/usr/bin/env python3
# BOOM · LA CASA — la pagina dell'annuncio nella lingua del portale.
#   python3 costruisci-ld.py artefatto | sito
import json, re, sys, os
from datetime import datetime, timezone

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
def leggi(n): return open(n, encoding='utf-8').read()
oggi = datetime.now(timezone.utc)
MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}
def libera(g):
    s = re.sub(r'(?i)available\s+from', '', str(g or '')).strip()
    if not s: return ''
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    if m: return m.group(0)
    gg = re.search(r'\b(\d{1,2})\b(?!\d)', s)
    me = re.search(r'(?i)\b([a-z]{3})[a-z]*\b', s)
    an = re.search(r'\b(20\d{2})\b', s)
    if me and me.group(1).lower() in MESI:
        mese = MESI[me.group(1).lower()]
        anno = int(an.group(1)) if an else oggi.year
        giorno = int(gg.group(1)) if gg and int(gg.group(1)) <= 31 else 1
        if not an and mese < oggi.month: anno += 1
        try: return datetime(anno, mese, giorno).strftime('%Y-%m-%d')
        except ValueError: return ''
    return ''
def numero(v):
    m = re.search(r'\d+', str(v or ''))
    return int(m.group()) if m else None

piene = json.load(open('case-full.json'))
uri = json.load(open('foto-uri.json')); rem = json.load(open('foto-map.json'))
gall = json.load(open('foto-galleria.json')) if os.path.exists('foto-galleria.json') else {}
banca = uri if MODO == 'artefatto' else rem

def stato(s, dal=None):
    if s == 'available':
        # se l'ingresso e nel futuro, il badge dice la data — mai
        # «Available now» per una casa libera nel 2027
        oggi = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        if dal and dal > oggi:
            d = datetime.fromisoformat(dal)
            eti = 'Free from ' + str(int(d.strftime('%d'))) + d.strftime(' %b')
            if d.year != datetime.now(timezone.utc).year:
                eti += d.strftime(' %Y')
            return (eti, True)
        return ('Available now', True)
    if s == 'waitlist': return ('Waitlist open', False)
    if s == 'reserved': return ('Reserved', False)
    return ('Rented', False)

CASE = []
for r in piene:
    ide = r.get('_id') or r.get('id')
    if not r.get('name') or not r.get('price'): continue
    if r.get('status') not in ('available', 'reserved', 'rented', 'waitlist'): continue
    cover = banca.get(ide, '')
    if MODO == 'artefatto':
        foto = gall.get(ide) or ([cover] if cover else [])
    else:
        foto = (r.get('images') or [])[:8] or ([cover] if cover else [])
    if not foto: continue
    st = stato(r['status'], libera(r.get('availableDate')))
    ACRONIMI = {'ac': 'A/C', 'tv': 'TV', 'wi-fi': 'Wi-Fi', 'wifi': 'Wi-Fi',
                'no gas': 'No gas', 'ng': 'No gas'}
    def bella_dote(x):
        s = re.sub(r'\s+', ' ', str(x)).strip()
        return ACRONIMI.get(s.lower(), s[:1].upper() + s[1:])
    TRADUCI = {'balcone': 'Balcony', 'aria condizionata': 'A/C',
               'lavatrice': 'Washer', 'lavastoviglie': 'Dishwasher',
               'ascensore': 'Elevator', 'arredato': 'Furnished',
               'washing_machine': 'Washer', 'double_glazing': 'Double glazing',
               'concordato': 'Rent-controlled option'}
    def normale(x):
        b = bella_dote(x)
        return TRADUCI.get(b.lower().replace('_', ' '), b)
    dentro = [normale(x) for x in (r.get('features') or r.get('tags') or []) if x]
    CASE.append({
        'id': ide,
        'nome': re.sub(r'\s+', ' ', r['name']).strip(),
        'zona': re.sub(r'\s+', ' ', str(r.get('zone') or 'Roma')).split('/')[0].strip(),
        'indirizzo': re.sub(r'\s+', ' ', str(r.get('address') or '')).strip(),
        'prezzo': numero(r['price']) or 0,
        'mq': numero(r.get('sqm') or r.get('size')),
        'letti': numero(r.get('bedrooms') if r.get('bedrooms') is not None else r.get('beds')),
        'bagni': numero(r.get('bathrooms')),
        'piano': (str(r.get('floor')).strip() if r.get('floor') not in (None, '') else None),
        'tipo': (str(r.get('type')).strip().title() if r.get('type') else None),
        'arredata': str(r.get('furnished') or '').lower() in ('yes', 'true', 'si', 'sì'),
        'stato': st[0], 'libera': st[1],
        'dal': libera(r.get('availableDate')),
        'racconto': re.sub(r'\s+', ' ', str(r.get('description') or '')).strip(),
        'dentro': dentro,
        'cauzioneMesi': numero(r.get('depositMonths')) or 1,
        'lat': (float(r['lat']) if r.get('lat') else None),
        'lng': (float(r['lng']) if r.get('lng') else None),
        'cover': cover, 'foto': foto,
        # il video esiste solo per due case su ventisei: la pagina deve
        # saperlo e proporre la visita dal vivo dove manca, non fingere
        'video': (str(r.get('videoUrl') or r.get('youtubeUrl') or '').strip()
                  or None),
        # 18 case su 26 sono passate dalla pipeline di /api/photos/enhance:
        # il distintivo si accende solo per quelle, mai per le altre
        'fotoCurate': bool(r.get('photosEnhancedAt')),
    })
# prima le libere, e con più foto: la casa che apre dev'essere la migliore
CASE.sort(key=lambda x: (not x['libera'], -len(x['foto'])))

pt = leggi('pt.html')
testa = pt[:pt.index('</style>') + len('</style>')]
nav = pt[pt.index('<nav class="nav" id="nav">'):pt.index('<!-- ══ HERO')]
piede = pt[pt.index('<footer class="piede">'):
           pt.index('</footer>') + len('</footer>')]

h = '\n'.join([testa, nav, leggi('ld-corpo.html'), piede,
               leggi('ld-regia.html'),
               leggi('solari-engine.html'), leggi('deco-organi.html')])
# artefatto: il titolo della casa aperta. Sito: GENERICO — /listing/:id
# lo riscrive api/listing.js per annuncio (regex su <title>), e il
# template nudo (/apartment-detail) non deve fingere una casa precisa.
if MODO == 'artefatto':
    h = h.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
        '<title>' + CASE[0]['nome'] + ' — ' + CASE[0]['zona'] + ', Rome | BOOM</title>')
else:
    import testa as TESTA
    h = h.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
        '<title>' + TESTA.TITOLO_LISTING + '</title>')
h = h.replace('VIRTUAL_URL', 'https://www.boomrome.com/virtual-viewing'
    if MODO == 'artefatto' else '/virtual-viewing.html')
h = h.replace('href="#banchina"', 'href="' + ('https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478' if MODO == 'artefatto' else '/') + '#banchina"')
h = h.replace('MODO_QUI', MODO)
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace("'CASE_JSON'", json.dumps(CASE, ensure_ascii=False))
if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
else:
    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')

if MODO == 'artefatto':
    HOME = 'https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478'
    AP = 'https://claude.ai/code/artifact/12798611-3d8a-498f-a043-c6f10b6856cd'
    h = h.replace('href="/index.html"', 'href="' + HOME + '"')
    h = h.replace('/apartments.html', AP)
    h = h.replace("'/listing/'", "'#id='")
    h = h.replace('CHIAVE_CASA', '/listing/')
    h = h.replace('href="/your-money.html"', 'href="https://claude.ai/code/artifact/bd225367-85f2-4aa5-871d-9653827c078b"')
    h = re.sub(r'href="/([a-z-]+)\.html"', r'href="https://www.boomrome.com/\1"', h)
    h = h.replace('href="/login"', 'href="https://www.boomrome.com/login"')
else:
    # CABLATO: route canoniche — /listing/<id> resta se stesso
    for da, a_ in {'/index.html': '/',
        '/your-money.html': '/your-money',
        '/property-finding.html': '/v2-property-finding.html'}.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
    h = h.replace('/apartments.html', '/apartments')
    h = h.replace('CHIAVE_CASA', '/listing/')

C0 = CASE[0]
h = h.replace('<h1 id="nomeCasa">—</h1>',
    '<h1 id="nomeCasa">' + C0['nome'] + '</h1>')
h = h.replace('<p class="dove" id="doveCasa">—</p>',
    '<p class="dove" id="doveCasa">' + C0['zona'] + ' · Rome</p>')
DESCR = (C0['nome'] + ' — ' + C0['zona'] + ', Rome. '
         + ('€' + format(C0['prezzo'], ',') + '/month, ' if C0['prezzo'] else '')
         + 'walked in person and video-checked by BOOM. Transparent move-in '
         'costs, sign from your phone, keys in as little as 48 hours.')
h = h.replace(
    '<meta name="description" content="Verified mid-term apartment rentals in '
    'Rome for internationals — English-first, legal contracts, 48-hour '
    'move-in. Your landing in Rome, handled.">',
    '<meta name="description" content="'
    + (DESCR if MODO == 'artefatto' else TESTA.DESCR_LISTING) + '">')
if MODO == 'sito':
    # il TEMPLATE di /listing/:id — testa generica di parita (og/twitter/
    # robots/icone/gtag/JSON-LD): api/listing.js la riscrive per annuncio
    OG = TESTA.blocco_listing() + '\n'
    i = h.index('</title>') + len('</title>')
    h = h[:i] + '\n' + OG + h[i:]
    h = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         + h.replace('</style>', '</style>\n</head>\n<body>', 1)
         + '\n</body>\n</html>')
uscita = 'boom-casa-p.html' if MODO == 'artefatto' else 'boom-casa-p-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · {len(CASE)} case · '
      f'apre con «{CASE[0]["nome"]}» ({len(CASE[0]["foto"])} foto)')
