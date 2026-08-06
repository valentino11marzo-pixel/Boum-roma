#!/usr/bin/env python3
# BOOM · IMMERSIVA — la tesi come lancio di prodotto (linea parallela alla Déco).
#   python3 costruisci-imm.py artefatto | sito
import json, re, sys
from datetime import datetime, timezone

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'

def euro(n): return '€' + f'{int(n):,}'
def leggi(n): return open(n, encoding='utf-8').read()

rows = json.load(open('live-rows.json'))
uri = json.load(open('foto-uri.json')); rem = json.load(open('foto-map.json'))
banca = uri if MODO == 'artefatto' else rem
flag_foto = json.load(open('foto-casa.json'))
FLAG = 'sr0rpLSqbpDMASkHINfx'

def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00')
        .replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)

vivi = [r for r in rows if r.get('status') == 'available'
        and r.get('nome') and r.get('price') and banca.get(r['id'])]
vivi.sort(key=quando, reverse=True)
case = [{'id': r['id'], 'nome': re.sub(r'\s+',' ',r['nome']).strip(),
         'zona': re.sub(r'\s+',' ',(r.get('zona') or 'Roma')).split('/')[0].strip(),
         'prezzo': int(re.sub(r'[^\d]','',str(r['price'])) or 0)}
        for r in vivi]
case = [c for c in case if c['prezzo'] > 0]

# le stesse tre della vetrina di casa: tre zone diverse
tre, zone = [], set()
for giro in (1, 2):
    for c in case:
        if len(tre) == 3: break
        if c in tre or (giro == 1 and c['zona'].lower() in zone): continue
        tre.append(c); zone.add(c['zona'].lower())

flag = next(c for c in case if c['id'] == FLAG)
fee = round(flag['prezzo'] * 12 * .10)
totale = flag['prezzo'] * 2 + fee

if MODO == 'artefatto':
    URL = {
        'URL_APPARTAMENTI': 'https://claude.ai/code/artifact/ec4d60c9-d2c0-4ec8-883f-eb7b8b4df8f6',
        'URL_PF': 'https://claude.ai/code/artifact/4186ed23-28d5-46a2-98bc-09fdf5eb7e21',
        'URL_CASA': 'https://claude.ai/code/artifact/a65a8cb4-bfe1-49a5-acaf-2c4a1a992321',
        'URL_CLASSICA': 'https://claude.ai/code/artifact/3c0dae67-a0e6-47d4-964f-832b824ffe0f',
    }
    casa_base = URL['URL_CASA'] + '#id='
else:
    URL = {
        'URL_APPARTAMENTI': '/v2-apartments.html',
        'URL_PF': '/v2-property-finding.html',
        'URL_CASA': '/v2-listing.html',
        'URL_CLASSICA': '/v2-home.html',
    }
    casa_base = '/v2-listing.html#id='

CARTE = '\n'.join(f'''        <a class="casa-min" href="{casa_base}{c['id']}">
          <div class="ph"><img loading="lazy" decoding="async"
            src="{banca[c['id']]}"
            alt="{c['nome']}, {c['zona']} — apartment for rent in Rome"></div>
          <div class="didascalia"><span class="nome">{c['nome']}
            <small>{c['zona']}</small></span>
            <span class="prezzo">{euro(c['prezzo'])}/mo</span></div>
        </a>''' for c in tre)

h = leggi('imm.html')
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('IMM_F1', flag_foto[0]).replace('IMM_F2', flag_foto[3]) \
     .replace('IMM_F3', flag_foto[6])
h = h.replace('CASA_NOME', flag['nome'])
h = h.replace('CASA_FEE', euro(fee))
h = h.replace('CASA_PREZZO', euro(flag['prezzo']))
h = h.replace('TOTALE_NUM', str(totale))
h = h.replace('CASE_TRE', CARTE)
for k, v in URL.items(): h = h.replace(k, v)
if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
else:
    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')

uscita = 'boom-imm.html' if MODO == 'artefatto' else 'boom-imm-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · flagship {flag["nome"]} · totale {euro(totale)}')
for c in tre: print('  ·', c['nome'][:30].ljust(30), c['zona'][:14].ljust(14),
                    euro(c['prezzo']))
