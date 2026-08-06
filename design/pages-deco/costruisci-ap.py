#!/usr/bin/env python3
# BOOM · APARTMENTS — il muro Solari in testa alla pagina della ricerca.
import json, re, sys
from datetime import datetime, timezone, timedelta
MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}
def letti(r):
    for c in (r.get('beds'), r.get('bedrooms')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None
def euro(n): return '€' + f'{int(n):,}'
def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00').replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)
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

def libera_data(g, oggi):
    s = re.sub(r'(?i)available\s+from','',str(g or '')).strip()
    if not s: return None
    d=None; m=re.match(r'^(\d{4})-(\d{2})-(\d{2})',s)
    if m: d=datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)),tzinfo=timezone.utc)
    else:
        gg=re.search(r'\b(\d{1,2})\b(?!\d)',s); me=re.search(r'(?i)\b([a-z]{3})[a-z]*\b',s)
        an=re.search(r'\b(20\d{2})\b',s)
        if me and me.group(1).lower() in MESI:
            try: d=datetime(int(an.group(1)) if an else oggi.year, MESI[me.group(1).lower()],
                            int(gg.group(1)) if gg and int(gg.group(1))<=31 else 1,tzinfo=timezone.utc)
            except ValueError: d=None
    return d

def libera(g, oggi):
    s = re.sub(r'(?i)available\s+from','',str(g or '')).strip()
    if not s: return ''
    d=None; m=re.match(r'^(\d{4})-(\d{2})-(\d{2})',s)
    if m: d=datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)),tzinfo=timezone.utc)
    else:
        gg=re.search(r'\b(\d{1,2})\b(?!\d)',s); me=re.search(r'(?i)\b([a-z]{3})[a-z]*\b',s)
        an=re.search(r'\b(20\d{2})\b',s)
        if me and me.group(1).lower() in MESI:
            try: d=datetime(int(an.group(1)) if an else oggi.year, MESI[me.group(1).lower()],
                            int(gg.group(1)) if gg and int(gg.group(1))<=31 else 1,tzinfo=timezone.utc)
            except ValueError: d=None
    if d is None: return ''
    return 'Now' if d <= oggi else d.strftime('%-d %b')

rows = json.load(open('live-rows.json'))
oggi = datetime.now(timezone.utc)
uri = json.load(open('foto-uri.json')); rem = json.load(open('foto-map.json'))
banca = uri if MODO == 'artefatto' else rem
vivi = [r for r in rows if r.get('status') in ('available','waitlist')
        and r.get('nome') and r.get('price')]
vivi.sort(key=quando, reverse=True)

tutte, muro = [], []
for r in vivi:
    p = int(re.sub(r'[^\d]','',str(r['price'])) or 0)
    if not p: continue
    zona = re.sub(r'\s+',' ',(r.get('zona') or 'Roma')).strip()
    zcorta = zona.split('/')[0].strip()
    n = letti(r); lib = libera(r.get('avail'), oggi)
    nuova = (oggi - quando(r)).days < 21
    attesa = r['status'] == 'waitlist'
    sqm = re.sub(r'[^\d]','',str(r.get('sqm') or ''))
    dati = ' <i>•</i> '.join(x for x in [
        (sqm+'m²') if sqm else '',
        ('Studio' if n == 0 else f'{n} bed' if n else '')] if x)
    d_lib = libera_data(r.get('avail'), oggi)
    c = { 'nome': re.sub(r'\s+',' ',r['nome']).strip(),
          'ts': quando(r).timestamp(),
          'la': r.get('la'), 'lo': r.get('lo'),
          'lib': (d_lib or oggi).strftime('%Y-%m-%d') if (d_lib or not attesa) else '2099-01-01',
          'vita': VITA.get(zcorta, ''),
          'zonaPiena': zona, 'zona': zcorta.upper()[:13],
          'prezzo': euro(p), 'prezzoN': p,
          'tipo': ('STU' if n == 0 else f'{n}BR' if n else 'FLT'),
          'letti': n, 'video': bool(r.get('video')),
          'stato': 'LIST' if attesa else ('NEW' if nuova else 'FREE'),
          'ora': (lib or '—').upper()[:5], 'dati': dati or zcorta,
          'tag': 'Video Tour' if r.get('video') else
                 ('Waiting list' if attesa else ('New' if nuova else '')),
          'foto': banca.get(r['id'],''), 'url': '/listing/'+r['id'] }
    if c['foto']: tutte.append(c)
    if not attesa and len(muro) < 6 and c['zona'].lower() not in [m['zona'].lower() for m in muro]:
        muro.append(c)

ZONE = sorted({c['zonaPiena'].split('/')[0].strip() for c in tutte})
CASE = { 'totale': len(tutte), 'muro': muro, 'tutte': tutte }
STATICHE = '\n'.join(
  f'''<a class="riga-ferma" href="{c['url']}"><span>{c['ora']}</span>'''
  f'''<span>{c['zona']}</span><span>{c['tipo']}</span>'''
  f'''<span>{c['prezzo']}</span><span>{c['stato']}</span></a>''' for c in muro)

def leggi(n): return open(n, encoding='utf-8').read()
css = leggi('lh-css.html')
css = css.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
    '<title>Apartments for Rent in Rome — Verified Homes | BOOM</title>')
h = css + '\n' + leggi('ap-body.html')
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('RIGHE_STATICHE', STATICHE)
h = h.replace("'CASE_JSON'", json.dumps(CASE, ensure_ascii=False))
h = h.replace("'ZONE_JSON'", json.dumps(ZONE, ensure_ascii=False))
h = h.replace("'OGGI_ISO'", json.dumps(oggi.strftime('%Y-%m-%d')))
# l'engine dei Solari va incluso prima dello script di pagina
h = h.replace('<script>\n(function () {', leggi('solari-engine.html') +
    '\n<script>\n(function () {', 1)
if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
else:
    h = h.replace('FONT_INLINE',
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')
if MODO == 'artefatto':
    h = h.replace('href="/property-finding.html"', 'href="https://claude.ai/code/artifact/4186ed23-28d5-46a2-98bc-09fdf5eb7e21"')
    h = h.replace('<a class="marchio" href="/"', '<a class="marchio" href="https://claude.ai/code/artifact/3c0dae67-a0e6-47d4-964f-832b824ffe0f"')
uscita = 'boom-ap.html' if MODO == 'artefatto' else 'boom-ap-sito.html'
open(uscita,'w',encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · {len(tutte)} case · {len(muro)} sul muro · zone: {len(ZONE)}')
