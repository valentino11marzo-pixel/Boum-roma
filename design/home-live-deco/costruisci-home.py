#!/usr/bin/env python3
# BOOM · LA HOME — l'identità del sito live, rieseguita Déco Solari.
#   python3 costruisci-home.py artefatto   → foto e Inter inline (anteprima)
#   python3 costruisci-home.py sito        → foto da Storage, Inter da Google
import json, re, sys
from datetime import datetime, timezone, timedelta

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

def letti(r):
    for c in (r.get('beds'), r.get('bedrooms')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None
def piano(r):
    p = re.sub(r'\s+',' ',str(r.get('floor') or '')).strip()
    if not p: return ''
    if re.search(r'ground|terra', p, re.I) or p == '0': return 'Ground Floor'
    m = re.search(r'\d+', p); return f'Floor {m.group()}' if m else p[:10]
def euro(n): return '€' + f'{int(n):,}'
def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00').replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)
def libera(g, oggi):
    s = re.sub(r'(?i)available\s+from','',str(g or '')).strip()
    if not s: return ''
    d = None; m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    if m: d = datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)),tzinfo=timezone.utc)
    else:
        gg=re.search(r'\b(\d{1,2})\b(?!\d)',s); me=re.search(r'(?i)\b([a-z]{3})[a-z]*\b',s)
        an=re.search(r'\b(20\d{2})\b',s)
        if me and me.group(1).lower() in MESI:
            try: d = datetime(int(an.group(1)) if an else oggi.year, MESI[me.group(1).lower()],
                              int(gg.group(1)) if gg and int(gg.group(1))<=31 else 1, tzinfo=timezone.utc)
            except ValueError: d = None
    if d is None: return ''
    return 'Now' if d <= oggi else d.strftime('%-d %b')

rows = json.load(open('live-rows.json'))
oggi = datetime.now(timezone.utc)
uri = json.load(open('foto-uri.json')); rem = json.load(open('foto-map.json'))
banca = uri if MODO == 'artefatto' else rem

vivi = [r for r in rows if r.get('status') == 'available'
        and r.get('nome') and r.get('price') and banca.get(r['id'])]
vivi.sort(key=quando, reverse=True)

def normale(r):
    return {
        'id': r['id'],
        'nome': re.sub(r'\s+',' ',r['nome']).strip(),
        'zona': re.sub(r'\s+',' ',(r.get('zona') or 'Roma')).split('/')[0].strip(),
        'prezzo': int(re.sub(r'[^\d]','',str(r['price'])) or 0),
        'sqm': re.sub(r'[^\d]','',str(r.get('sqm') or '')) or '',
        'letti': letti(r),
        'piano': piano(r),
        'video': bool(r.get('video')),
        'nuova': (oggi - quando(r)).days < 21,
        'libera': libera(r.get('avail'), oggi),
    }
case = [normale(r) for r in vivi if int(re.sub(r'[^\d]','',str(r['price'])) or 0) > 0]

# tre case, tre zone: la vetrina «Move in this week» del sito live,
# generata dal catalogo invece che scritta a mano
vetrina, zone = [], set()
for giro in (1, 2):
    for c in case:
        if len(vetrina) == 3: break
        if c in vetrina or (giro == 1 and c['zona'].lower() in zone): continue
        vetrina.append(c); zone.add(c['zona'].lower())

def tag(c):
    if c['video']: return 'Video Tour'
    if c['nuova']: return 'New'
    return ('Free ' + c['libera'].lower()) if c['libera'] else c['zona']

def carta(c, primo):
    dati = [x for x in [(c['sqm'] + 'm²') if c['sqm'] else '',
        ('Studio' if c['letti'] == 0 else f"{c['letti']} bed" if c['letti'] else ''),
        c['piano']] if x]
    dentro = ' <i>•</i> '.join(dati)
    alt = f"{c['nome']}, {c['zona']} — apartment for rent in Rome with BOOM"
    vita = VITA.get(c['zona'], '')
    return f'''      <a class="home" href="/listing/{c['id']}">
        <div class="home-foto">
          <img {'' if primo else 'loading="lazy" '}decoding="async" src="{banca[c['id']]}" alt="{alt}">
          <span class="home-tag">{tag(c)}</span>
          <button type="button" class="home-cuore" data-u="/listing/{c['id']}"
            aria-label="Save this home">♥</button>
          <span class="home-prezzo"><span class="flap-prezzo flap-scale"
            data-p="{euro(c['prezzo'])}" aria-label="{euro(c['prezzo'])} per month"></span><small>/month</small></span>
        </div>
        <div class="home-corpo">
          <span class="home-zona" role="link" tabindex="0"
            data-href="/apartments.html#zona={c['zona']}">{c['zona']} →</span>
          <div class="home-nome">{c['nome']}</div>
          <div class="home-dati">{dentro}</div>
          {f'<div class="home-vita">{vita}</div>' if vita else ''}
          <div class="home-vai">View Details →</div>
        </div>
      </a>'''

HOMES = '\n\n'.join(carta(c, i == 0) for i, c in enumerate(vetrina))

# la scena 1 dell'apparecchio: la passeggiata dentro UNA casa vera
sc1 = vetrina[0]

def leggi(n): return open(n, encoding='utf-8').read()
h = '\n'.join(leggi(p) for p in ['lh-css.html','lh-body.html','solari-engine.html','deco-organi.html','lh-js.html'])
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('HOMES_CARDS', HOMES)
h = h.replace('SC1_FOTO', banca[sc1['id']])
h = h.replace('SC1_NOME', sc1['nome'])
h = h.replace('SC1_PREZZO', euro(sc1['prezzo']))
# la formula della pagina annuncio live: primo mese + deposito (1 mese) + fee 10% annuo
h = h.replace('SC1_TOT', euro(sc1['prezzo'] * 2 + round(sc1['prezzo'] * 12 * .10)))
UNI = ['LUISS', 'Sapienza', 'Roma Tre', 'John Cabot', 'LUMSA', 'NABA', 'IED', 'RUFA']
h = h.replace('UNI_ITEMS\nUNI_ITEMS',
    '\n'.join('    <span class="uni-item">' + u.upper() + '</span>' for u in UNI + UNI))
if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
else:
    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')

# in anteprima le pagine si aprono l'una dall'altra: un prodotto, non file
if MODO == 'artefatto':
    for da, a_ in {
        '/apartments.html': 'https://claude.ai/code/artifact/ec4d60c9-d2c0-4ec8-883f-eb7b8b4df8f6',
        '/property-finding.html': 'https://claude.ai/code/artifact/4186ed23-28d5-46a2-98bc-09fdf5eb7e21',
        '/board.html': 'https://claude.ai/code/artifact/d5c23034-8aa4-4e33-b53a-e73809b444f2',
    }.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
        h = h.replace('data-href="' + da, 'data-href="' + a_)
    # le carte aprono la pagina annuncio; data-u (cuori) resta /listing/<id>
    h = h.replace('href="/listing/',
        'href="https://claude.ai/code/artifact/a65a8cb4-bfe1-49a5-acaf-2c4a1a992321#id=')
else:
    for da, a_ in {
        '/apartments.html': '/v2-apartments.html',
        '/property-finding.html': '/v2-property-finding.html',
        '/board.html': '/v2-board.html',
    }.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
        h = h.replace('data-href="' + da, 'data-href="' + a_)
    h = h.replace('href="/listing/', 'href="/v2-listing.html#id=')

uscita = 'boom-lahome.html' if MODO == 'artefatto' else 'boom-lahome-sito.html' 
open(uscita,'w',encoding='utf-8').write(h)
print(f"{uscita} · {len(h)//1024} KB · {len(case)} case · {len(vetrina)} in vetrina")
for c in vetrina: print('  ·', c['nome'][:30].ljust(30), c['zona'][:14].ljust(14),
                        euro(c['prezzo']).rjust(7), tag(c))
