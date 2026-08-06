#!/usr/bin/env python3
# BOOM · LA HOME QUIETA — l'identità del sito live, ricominciata.
#   python3 costruisci-quieta.py artefatto | sito
import json, re, sys
from datetime import datetime, timezone
MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}
VITA = {
  'Trastevere':      'Cobblestones, trattorie, nightlife on your doorstep.',
  'Prati':           'Elegant streets, the Vatican, serious food shopping.',
  'Pigneto':         "Rome's bohemian quarter — bars, galleries, street life.",
  'Trieste':         'Liberty villas and quiet cafés, ten minutes from the centre.',
  'Africano':        'Local Rome at honest prices, Coppedè around the corner.',
  'Ponte Milvio':    "Riverside aperitivo and the north's favourite piazza.",
  "Conca d'Oro":     'Metro B1 at hand, park runs along the Aniene.',
}
def euro(n): return '€' + f'{int(n):,}'
def leggi(n): return open(n, encoding='utf-8').read()
def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00')
        .replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)
def letti(r):
    for c in (r.get('beds'), r.get('bedrooms')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None
def piano(r):
    p = re.sub(r'\s+',' ',str(r.get('floor') or '')).strip()
    if not p: return ''
    if re.search(r'ground|terra', p, re.I) or p == '0': return 'Ground floor'
    m = re.search(r'\d+', p); return f'Floor {m.group()}' if m else p[:10]

rows = json.load(open('live-rows.json'))
oggi = datetime.now(timezone.utc)
uri = json.load(open('foto-uri.json')); rem = json.load(open('foto-map.json'))
banca = uri if MODO == 'artefatto' else rem
vivi = [r for r in rows if r.get('status') == 'available'
        and r.get('nome') and r.get('price') and banca.get(r['id'])]
vivi.sort(key=quando, reverse=True)
case = []
for r in vivi:
    p = int(re.sub(r'[^\d]','',str(r['price'])) or 0)
    if not p: continue
    case.append({'id': r['id'], 'nome': re.sub(r'\s+',' ',r['nome']).strip(),
        'zona': re.sub(r'\s+',' ',(r.get('zona') or 'Roma')).split('/')[0].strip(),
        'prezzo': p, 'sqm': re.sub(r'[^\d]','',str(r.get('sqm') or '')) or '',
        'letti': letti(r), 'piano': piano(r), 'video': bool(r.get('video'))})
vetrina, zone = [], set()
for giro in (1, 2):
    for c in case:
        if len(vetrina) == 3: break
        if c in vetrina or (giro == 1 and c['zona'].lower() in zone): continue
        vetrina.append(c); zone.add(c['zona'].lower())

def carta(c, primo):
    dati = [x for x in [
        f'<span class="home-zona" role="link" tabindex="0" '
        f'data-href="/apartments.html#zona={c["zona"]}">{c["zona"]}</span>',
        (c['sqm'] + 'm²') if c['sqm'] else '',
        'Studio' if c['letti'] == 0 else f"{c['letti']} bed" if c['letti'] else '',
        c['piano']] if x]
    dentro = ' <i>·</i> '.join(dati)
    vita = VITA.get(c['zona'], '')
    alt = f"{c['nome']}, {c['zona']} — apartment for rent in Rome with BOOM"
    tag = 'Video tour' if c['video'] else ''
    return f'''      <a class="home" href="/listing/{c['id']}">
        <div class="home-foto">
          <img {'' if primo else 'loading="lazy" '}decoding="async" src="{banca[c['id']]}" alt="{alt}">
          {f'<span class="home-tag">{tag}</span>' if tag else ''}
          <button type="button" class="home-cuore" data-u="/listing/{c['id']}"
            aria-label="Save this home">♥</button>
        </div>
        <div class="home-corpo">
          <div class="home-riga"><span class="home-nome">{c['nome']}</span>
            <span class="home-canone">{euro(c['prezzo'])}<small>/mo</small></span></div>
          <div class="home-dati">{dentro}</div>
          {f'<div class="home-vita">{vita}</div>' if vita else ''}
          <div class="home-vai">View details →</div>
        </div>
      </a>'''
HOMES = '\n\n'.join(carta(c, i == 0) for i, c in enumerate(vetrina))

h = '\n'.join(leggi(p) for p in
    ['lq-css.html','lq-body.html','solari-engine.html','deco-organi.html','lq-js.html'])
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('HOMES_CARDS', HOMES)
UNI = ['LUISS', 'Sapienza', 'Roma Tre', 'John Cabot', 'LUMSA', 'NABA', 'IED', 'RUFA']
h = h.replace('UNI_ITEMS',
    '\n'.join('    <span class="uni-item">' + u.upper() + '</span>' for u in UNI))
if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
else:
    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')
if MODO == 'artefatto':
    CASA = 'https://claude.ai/code/artifact/a65a8cb4-bfe1-49a5-acaf-2c4a1a992321'
    for da, a_ in {
        '/apartments.html': 'https://claude.ai/code/artifact/ec4d60c9-d2c0-4ec8-883f-eb7b8b4df8f6',
        '/property-finding.html': 'https://claude.ai/code/artifact/4186ed23-28d5-46a2-98bc-09fdf5eb7e21',
        '/board.html': 'https://claude.ai/code/artifact/d5c23034-8aa4-4e33-b53a-e73809b444f2',
    }.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
        h = h.replace('data-href="' + da, 'data-href="' + a_)
    h = h.replace('CASA_URL', CASA)
    h = h.replace('href="/listing/', 'href="' + CASA + '#id=')
else:
    for da, a_ in {
        '/apartments.html': '/v2-apartments.html',
        '/property-finding.html': '/v2-property-finding.html',
        '/board.html': '/v2-board.html',
    }.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
        h = h.replace('data-href="' + da, 'data-href="' + a_)
    h = h.replace('CASA_URL', '/v2-listing.html')
    h = h.replace('href="/listing/', 'href="/v2-listing.html#id=')
uscita = 'boom-lahome.html' if MODO == 'artefatto' else 'boom-lahome-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · {len(case)} case · {len(vetrina)} in vetrina')
