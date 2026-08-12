#!/usr/bin/env python3
# BOOM · LA CASA — la pagina annuncio, rieseguita Déco Solari.
#   python3 costruisci-casa.py artefatto   → flagship con galleria inline
#   python3 costruisci-casa.py sito        → tutte le case, foto da Storage
# Consuma lh-css.html (design system) + deco-organi.html (organi condivisi).
import json, re, sys
from datetime import datetime, timezone

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}
VITA = {
  'Trastevere':      'Cobblestones, trattorie, nightlife on your doorstep.',
  'Centro Storico':  'Piazzas, museums and the city at walking pace.',
  'Centro':          'The centre at walking pace, everything downstairs.',
  'Prati':           'Elegant streets, the Vatican, serious food shopping.',
  'Pigneto':         "Rome's bohemian quarter — bars, galleries, street life.",
  'Trieste':         'Liberty villas and quiet cafés, ten minutes from the centre.',
  'Africano':        'Local Rome at honest prices, Coppedè around the corner.',
  'Parioli':         'Embassies, parks and Rome at its most residential.',
  'Ponte Milvio':    "Riverside aperitivo and the north's favourite piazza.",
  "Conca d'Oro":     'Metro B1 at hand, park runs along the Aniene.',
  'Vittorio Veneto': "La Dolce Vita's boulevard, steps from Villa Borghese.",
}
FEAT = {'ac':'Air conditioning','balcony':'Balcony','elevator':'Elevator',
  'dishwasher':'Dishwasher','wifi':'WiFi','double_glazing':'Double glazing',
  'doorman':'Doorman','washing_machine':'Washing machine','terrace':'Terrace',
  'furnished':'Furnished','parking':'Parking','garden':'Garden','pets':'Pets OK',
  'heating':'Heating','fireplace':'Fireplace','storage':'Storage room'}

oggi = datetime.now(timezone.utc)

def dal_iso(g):
    s = re.sub(r'(?i)available\s+from','',str(g or '')).strip()
    if not s: return None
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    if m: return s[:10]
    gg = re.search(r'\b(\d{1,2})\b(?!\d)', s)
    me = re.search(r'(?i)\b([a-z]{3})[a-z]*\b', s)
    an = re.search(r'\b(20\d{2})\b', s)
    if me and me.group(1).lower() in MESI:
        try:
            d = datetime(int(an.group(1)) if an else oggi.year,
                MESI[me.group(1).lower()],
                int(gg.group(1)) if gg and int(gg.group(1)) <= 31 else 1,
                tzinfo=timezone.utc)
            return d.strftime('%Y-%m-%d')
        except ValueError: return None
    return None

def eti_libera(iso):
    if not iso: return ''
    d = datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)
    return 'now' if d <= oggi else d.strftime('%-d %b')

def letti(f):
    for c in (f.get('bedrooms'), f.get('beds')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None

def piano(f):
    p = re.sub(r'\s+',' ',str(f.get('floor') or '')).strip()
    if not p: return ''
    if re.search(r'ground|terra', p, re.I) or p == '0': return 'Ground'
    m = re.search(r'\d+', p)
    return f'FL {m.group()}' if m else p[:8]

docs = json.load(open('case-full.json'))
uri = json.load(open('foto-uri.json'))      # copertine base64 (per id corto)
rem = json.load(open('foto-map.json'))      # copertine Storage
flag_foto = json.load(open('foto-casa.json'))
FLAG = 'sr0rpLSqbpDMASkHINfx'

def copertina(idx, banca):
    return banca.get(idx)

case = []
for f in docs:
    # tutte le case pubblicabili: le affittate/waitlist aprono la lista d'attesa
    if f.get('status') not in ('available', 'waitlist', 'rented'): continue
    i = f['_id']
    prezzo = int(re.sub(r'[^\d]','',str(f.get('price') or '')) or 0)
    if not prezzo or not f.get('name'): continue
    if MODO == 'artefatto':
        foto = flag_foto if i == FLAG else \
            ([copertina(i, uri)] if copertina(i, uri) else [])
    else:
        foto = [u for u in (f.get('images') or []) if isinstance(u, str)][:14] \
            or ([f['image']] if f.get('image') else [])
    if not foto: continue
    zona = re.sub(r'\s+',' ',str(f.get('zone') or 'Roma')).split('/')[0].strip()
    iso = dal_iso(f.get('availableDate'))
    bagni = re.sub(r'[^\d]','',str(f.get('bathrooms') or '')) or None
    arredo = f.get('furnished')
    case.append({
        'id': i,
        'stato': f['status'],
        'nome': re.sub(r'\s+',' ',f['name']).strip(),
        'zona': zona,
        'prezzo': prezzo,
        'sqm': re.sub(r'[^\d]','',str(f.get('sqm') or '')) or '',
        'letti': letti(f),
        'bagni': int(bagni) if bagni else None,
        'piano': piano(f),
        'arredata': (str(arredo).lower() in ('yes','true','si','sì','1'))
                    if arredo is not None else None,
        'desc': re.sub(r'\s+',' ',str(f.get('description') or '')).strip(),
        'vita': VITA.get(zona, ''),
        'feat': [FEAT.get(x, x.replace('_',' ').capitalize())
                 for x in (f.get('features') or [])],
        'libera': eti_libera(iso),
        'dal': iso,
        'video': f.get('videoUrl') or f.get('youtubeUrl') or None,
        'lat': f.get('lat') and float(f['lat']),
        'lng': f.get('lng') and float(f['lng']),
        'via': re.sub(r'\s*\d.*$','',str(f.get('address') or '')).strip(),
        'foto': foto,
    })

# il flagship apre la pagina: prima lui, poi le disponibili, poi le altre
case.sort(key=lambda c: (c['id'] != FLAG, c['stato'] != 'available', c['nome']))
flag = case[0]

def leggi(n): return open(n, encoding='utf-8').read()
css = leggi('lh-css.html')
css = css.replace(
    '<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
    f'<title>{flag["nome"]} — {flag["zona"]}, Rome | BOOM</title>')
css = css.replace(
    'content="Verified mid-term apartment rentals in Rome for internationals — '
    'English-first, legal contracts, 48-hour move-in. Browse homes or let us find yours."',
    'content="Video-verified apartment for rent in Rome with BOOM: real photos, '
    'transparent money, legal contract, keys in as little as 48 hours."')

h = '\n'.join([css, leggi('casa-body.html'), leggi('solari-engine.html'),
               leggi('deco-organi.html'), leggi('casa-js.html')])
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('CASA_JSON', json.dumps(case, ensure_ascii=False)
              .replace('</', '<\\/'))
h = h.replace('MODO_FLAG', MODO)
if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
else:
    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')

if MODO == 'artefatto':
    # le anteprime si aprono l'una dall'altra; le pagine senza anteprima
    # portano al sito vivo — mai un link rotto dentro l'artefatto
    for da, a_ in {
        '/index.html': 'https://claude.ai/code/artifact/3c0dae67-a0e6-47d4-964f-832b824ffe0f',
        '/apartments.html': 'https://claude.ai/code/artifact/ec4d60c9-d2c0-4ec8-883f-eb7b8b4df8f6',
        '/property-finding.html': 'https://claude.ai/code/artifact/4186ed23-28d5-46a2-98bc-09fdf5eb7e21',
        '/board.html': 'https://claude.ai/code/artifact/d5c23034-8aa4-4e33-b53a-e73809b444f2',
    }.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
    h = re.sub(r'href="/([a-z-]+)\.html"',
               r'href="https://www.boomrome.com/\1"', h)
    h = h.replace('href="/login"', 'href="https://www.boomrome.com/login"')
else:
    for da, a_ in {
        '/index.html': '/v2-home.html',
        '/apartments.html': '/v2-apartments.html',
        '/property-finding.html': '/v2-property-finding.html',
        '/board.html': '/v2-board.html',
    }.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')

uscita = 'boom-casa.html' if MODO == 'artefatto' else 'boom-casa-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · {len(case)} case (flagship: {flag["nome"]})')
for c in case:
    print('  ·', c['nome'][:30].ljust(30), c['zona'][:14].ljust(14),
          f"€{c['prezzo']}", f"foto:{len(c['foto'])}",
          'video' if c['video'] else '')
