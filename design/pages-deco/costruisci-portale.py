#!/usr/bin/env python3
# BOOM · IL PORTALE — l'impostazione da azienda internazionale, dati veri.
#   python3 costruisci-portale.py artefatto | sito
import json, re, sys
from datetime import datetime, timezone

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
def euro(n): return '€' + f'{int(n):,}'
def leggi(n): return open(n, encoding='utf-8').read()
def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00')
        .replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)

rows = json.load(open('live-rows.json'))
oggi = datetime.now(timezone.utc)
uri = json.load(open('foto-uri.json')); rem = json.load(open('foto-map.json'))
banca = uri if MODO == 'artefatto' else rem

tutti = [r for r in rows if r.get('nome') and r.get('price')
         and r.get('status') in ('available','reserved','rented','waitlist')]
tutti.sort(key=quando, reverse=True)

# ── il tabellone: righe VERE, stati veri, chip solo se veri ──────────────
def chip(r):
    if r.get('video'): return ('VERIFIED', 'verde')
    if (oggi - quando(r)).days < 21: return ('NEW', '')
    return None
def stato(r):
    s = r['status']
    if s == 'available': return ('Available', 'si')
    if s in ('reserved','waitlist'): return ('Reserved', 'ni')
    return ('Rented', 'no')

# il tabellone elenca DESTINAZIONI: una zona, una volta (l'annuncio più
# recente di quella zona), prima le disponibili
def zona_di(r):
    return re.sub(r'\s+', ' ', (r.get('zona') or 'Roma')).split('/')[0].strip()
viste, board = set(), []
for r in sorted(tutti, key=lambda x: (x['status'] != 'available'),):
    z = zona_di(r)
    if z.lower() in viste: continue
    viste.add(z.lower()); board.append(r)
    if len(board) == 6: break
def riga_json(r):
    s = stato(r)
    p = int(re.sub(r'[^\d]', '', str(r['price'])) or 0)
    # allineati a destra sulle celle: le cifre incolonnano
    return {'z': zona_di(r), 'p': euro(p).rjust(6), 's': s[0].upper(),
            'c': s[1]}
BOARD_JSON = json.dumps([riga_json(r) for r in board], ensure_ascii=False)
# stessa regola della discovery: si conta cio che si puo mostrare
DISPONIBILI = sum(1 for r in tutti
                  if r['status'] == 'available' and banca.get(r['id']))

ultimo = max(quando(r) for r in tutti)
giorni = (oggi - ultimo).days
AGG = 'today' if giorni == 0 else 'yesterday' if giorni == 1 else \
      ultimo.strftime('%-d %b')

# ── le tre case della settimana (stessa vetrina della home) ──────────────
def letti(r):
    for c in (r.get('beds'), r.get('bedrooms')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None
case = []
for r in tutti:
    if r['status'] != 'available' or not banca.get(r['id']): continue
    p = int(re.sub(r'[^\d]','',str(r['price'])) or 0)
    if not p: continue
    case.append({'id': r['id'], 'nome': re.sub(r'\s+',' ',r['nome']).strip(),
        'zona': re.sub(r'\s+',' ',(r.get('zona') or 'Roma')).split('/')[0].strip(),
        'prezzo': p, 'sqm': re.sub(r'[^\d]','',str(r.get('sqm') or '')) or '',
        'letti': letti(r), 'video': bool(r.get('video')),
        'nuova': (oggi - quando(r)).days < 21})
tre, zone = [], set()
for giro in (1, 2):
    for c in case:
        if len(tre) == 3: break
        if c in tre or (giro == 1 and c['zona'].lower() in zone): continue
        tre.append(c); zone.add(c['zona'].lower())

def carta(c):
    ch = ('VERIFIED', 'verde') if c['video'] else \
         ('NEW', '') if c['nuova'] else ('AVAILABLE NOW', 'verde')
    dati = ' <i>·</i> '.join(x for x in [
        f'<span class="home-zona" role="link" tabindex="0" '
        f'data-href="/apartments.html#zona={c["zona"]}">{c["zona"]}</span>',
        f"{c['sqm']} m²" if c['sqm'] else '',
        'Studio' if c['letti'] == 0 else f"{c['letti']} bed" if c['letti'] else ''] if x)
    return f'''        <a class="casa-p" href="/listing/{c['id']}">
          <div class="home-foto">
            <img loading="lazy" decoding="async" src="{banca[c['id']]}"
              alt="{c['nome']}, {c['zona']} — apartment for rent in Rome with BOOM">
            <span class="casa-chip {ch[1]}">{ch[0]}</span>
            <button type="button" class="home-cuore" data-u="/listing/{c['id']}"
              aria-label="Save this home">♥</button>
          </div>
          <div class="corpo">
            <div class="riga1"><span class="nome">{c['nome']}</span>
              <span class="canone"><span class="flap-prezzo flap-scale"
                data-p="{euro(c['prezzo'])}" aria-label="{euro(c['prezzo'])} per month"></span><small>/mo</small></span></div>
            <div class="riga2">{dati}</div>
          </div>
        </a>'''
TRE = '\n'.join(carta(c) for c in tre)

h = '\n'.join([leggi('pt.html'), leggi('solari-engine.html'),
               leggi('deco-organi.html')])
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('PT_BOARD', BOARD_JSON)
h = h.replace('DISPONIBILI', str(DISPONIBILI))
# «From €X/mo» viene dal catalogo, non da un numero scritto a mano
minimo = min(int(re.sub(r'[^\d]', '', str(r['price'])) or 10**9)
             for r in tutti if r['status'] == 'available')
h = h.replace('From €1,000/mo', 'From ' + euro(minimo) + '/mo')
h = h.replace('AGGIORNATO', AGG)
# ── LO SKYLINE: i quartieri alla loro longitudine reale ────────────────
import statistics as _st
piene = json.load(open('case-full.json'))
coord, quante = {}, {}
for r in piene:
    if r.get('status') not in ('available','reserved','rented','waitlist'): continue
    if not r.get('nome') and not r.get('name'): continue
    z = re.sub(r'\s+',' ',str(r.get('zone') or 'Roma')).split('/')[0].strip()
    quante.setdefault(z, []).append(r)
    if r.get('lng'): coord.setdefault(z, []).append(float(r['lng']))
SKY = []
for z, rr in quante.items():
    if z not in coord: continue
    pr = [int(re.sub(r'[^\d]','',str(x.get('price') or '')) or 0) for x in rr]
    pr = [p for p in pr if p]
    disp = [x for x in rr if x['status'] == 'available']
    if not pr: continue
    SKY.append({'z': z, 'lng': round(_st.mean(coord[z]), 5), 'n': len(rr),
                'da': euro(min(pr)), 'si': bool(disp)})
SKY.sort(key=lambda x: x['lng'])
# la Skyline vuole le CASE, non le zone: ognuna alle sue coordinate
SKYCASE = []
for r in piene:
    if r.get('status') not in ('available','reserved','waitlist'): continue
    if not r.get('lat') or not r.get('lng') or not r.get('name'): continue
    p = int(re.sub(r'[^\d]','',str(r.get('price') or '')) or 0)
    if not p: continue
    SKYCASE.append({
        'id': r.get('_id') or r.get('id'),
        'nome': re.sub(r'\s+',' ',r['name']).strip(),
        'zona': re.sub(r'\s+',' ',str(r.get('zone') or 'Roma')).split('/')[0].strip(),
        'lat': float(r['lat']), 'lng': float(r['lng']),
        'da': euro(p), 'si': r['status'] == 'available',
        'stato': 'reserved' if r['status'] in ('reserved','waitlist') else 'rented'})
GIORNO = []
for r in piene:
    if r.get('status') != 'available': continue
    ide = r.get('_id') or r.get('id')
    if not banca.get(ide): continue
    p = int(re.sub(r'[^\d]', '', str(r.get('price') or '')) or 0)
    if not p: continue
    m = re.search(r'\d+', str(r.get('depositMonths') or ''))
    GIORNO.append({'p': p, 'm': int(m.group()) if m else 1})
h = h.replace("'GIORNO_JSON'", json.dumps(GIORNO))
h = h.replace("'SKY_JSON'", json.dumps(SKYCASE, ensure_ascii=False))
CASA_ART = 'https://claude.ai/code/artifact/db7c3240-a12d-4734-9eb7-06a780584231'
h = h.replace('CASA_BASE', (CASA_ART + '#id=') if MODO == 'artefatto'
    else '/listing/')
h = h.replace('SKYLINE_URL', 'https://www.boomrome.com/skyline'
    if MODO == 'artefatto' else '/skyline')
h = h.replace('<span class="varco-conta" id="varcoConta"></span>',
    f'<span class="varco-conta" id="varcoConta">{len(SKYCASE)}</span>')
h = h.replace('RECENSIONI_URL',
    'https://www.google.com/maps?q=Egidi+Immobiliare+Via+dei+Coronari+Roma')
h = h.replace('CASE_TRE', TRE)
# la scena 1 dell'apparecchio: il flagship vero (foto, nome, canone, totale)
flag_foto = json.load(open('foto-casa.json'))
sc = tre[0]
h = h.replace('SC_FOTO2', banca.get(tre[1]['id'], ''))
h = h.replace('SC_FOTO3', banca.get(tre[2]['id'], ''))
h = h.replace('SC_ZONA2', tre[1]['zona'])
h = h.replace('SC_ZONA3', tre[2]['zona'])
h = h.replace('SC_FOTO', flag_foto[0] if MODO == 'artefatto' else banca[sc['id']])
h = h.replace('PASS_MINI', leggi('logo-live.svg').strip()
    .replace('goldGrad', 'goldGradMini'))
h = h.replace('SC_NOME', sc['nome'])
h = h.replace('SC_PREZZO', euro(sc['prezzo']))
h = h.replace('SC_TOT', euro(sc['prezzo'] * 2 + round(sc['prezzo'] * 12 * .10)))
h = h.replace('PASS_LOGO', leggi('logo-live.svg').strip()
    .replace('goldGrad', 'goldGradPass'))
# la foto del fondatore: se c'è founder.jpg la incastoniamo, altrimenti
# un'attesa elegante (monogramma) finché Valentino non la manda come file
import os as _os, base64 as _b64
if _os.path.exists('founder.jpg'):
    if MODO == 'artefatto':
        _src = ('data:image/jpeg;base64,'
                + _b64.b64encode(open('founder.jpg', 'rb').read()).decode())
    else:
        _src = '/img/founder.jpg'
    FOND = ('<img src="' + _src + '" alt="Valentino, founder of BOOM, '
            'in Rome" loading="lazy" decoding="async">')
else:
    FOND = '<div class="fond-attesa" aria-hidden="true">V</div>'
h = h.replace('FOUNDER_IMG', FOND)
# il QR del pass: una texture decorativa dichiarata (aria-hidden), non un QR vero
import random as _rnd
_rnd.seed(7)
h = h.replace('PASS_QR', ''.join(
    '<i style="--i:' + str(i) + '"' + (' class="v"' if _rnd.random() < .42
    else '') + '></i>' for i in range(25)))
if MODO == 'artefatto':
    h = h.replace('FONT_INLINE', '<style>\n' + leggi('inter-inline.css') + '\n</style>')
else:
    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" media="print" onload="this.media=\'all\'">\n'
        '<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap"></noscript>')

if MODO == 'artefatto':
    HOME = 'https://claude.ai/code/artifact/3c0dae67-a0e6-47d4-964f-832b824ffe0f'
    AP = 'https://claude.ai/code/artifact/12798611-3d8a-498f-a043-c6f10b6856cd'
    CASA = CASA_ART
    h = h.replace('COME_URL', '#apparecchio').replace('AP_URL', AP)
    for da, a_ in {'/index.html': HOME, '/apartments.html': AP,
        '/your-money.html': 'https://claude.ai/code/artifact/bd225367-85f2-4aa5-871d-9653827c078b',
        '/property-finding.html': 'https://claude.ai/code/artifact/4186ed23-28d5-46a2-98bc-09fdf5eb7e21',
        '/board.html': 'https://claude.ai/code/artifact/d5c23034-8aa4-4e33-b53a-e73809b444f2',
    }.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
        h = h.replace('data-href="' + da, 'data-href="' + a_)
    h = h.replace('href="/listing/', 'href="' + CASA + '#id=')
    h = re.sub(r'href="/([a-z-]+)\.html"',
               r'href="https://www.boomrome.com/\1"', h)
    h = h.replace('href="/login"', 'href="https://www.boomrome.com/login"')
else:
    # LA FINESTRA SUL VERO SKYLINE — l'embed ricostruiva la mappa e
    # poteva tradire dove lo standalone funzionava: ora la home APRE
    # /skyline?embed=1 (stessa origine) dentro la cornice esistente.
    # Il velo si alza al load dell'iframe; i comandi del modulo (hud,
    # conta) spariscono: la finestra ha i suoi.
    h = h.replace(
        "      if (v[0].isIntersecting) { o.disconnect(); carica(); }",
        "      if (v[0].isIntersecting) { o.disconnect(); finestra(); }")
    h = h.replace(
        "  if ('IntersectionObserver' in window) {\n"
        "    new IntersectionObserver(function (v, o) {\n"
        "      if (v[0].isIntersecting) { o.disconnect(); finestra(); }",
        "  function finestra() {\n"
        "    var posto = document.getElementById('cieloMappa');\n"
        "    if (!posto) return;\n"
        "    var fr = document.createElement('iframe');\n"
        "    fr.src = '/skyline?embed=1';\n"
        "    fr.title = 'BOOM Skyline 3D — Rome';\n"
        "    fr.setAttribute('allow', 'fullscreen');\n"
        "    fr.style.cssText = 'position:absolute;inset:0;width:100%;"
        "height:100%;border:0;';\n"
        "    fr.addEventListener('load', function () {\n"
        "      if (velo) velo.classList.add('via');\n"
        "    });\n"
        "    /* rete: se il load tarda, meglio il loader dello skyline "
        "che il nostro velo */\n"
        "    setTimeout(function () {\n"
        "      if (velo) velo.classList.add('via');\n"
        "    }, 4000);\n"
        "    posto.appendChild(fr);\n"
        "    var hud = telaio.querySelector('.cielo-hud');\n"
        "    if (hud) hud.remove();\n"
        "    if (conta) conta.remove();\n"
        "  }\n"
        "  if ('IntersectionObserver' in window) {\n"
        "    new IntersectionObserver(function (v, o) {\n"
        "      if (v[0].isIntersecting) { o.disconnect(); finestra(); }")
    # CABLATO: la home vive su /, i link vanno alle route canoniche —
    # gli URL non cambiano mai, cambia solo il contenuto (regola SEO)
    h = h.replace('COME_URL', '#apparecchio').replace('AP_URL', '/apartments')
    for da, a_ in {'/index.html': '/',
        '/apartments.html': '/apartments',
        '/your-money.html': '/your-money',
                }.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
        h = h.replace('data-href="' + da, 'data-href="' + a_)
    # href="/listing/<id>" resta: E la route canonica prerender

# la testa della home: description propria, e in modalita sito lo scheletro
# HTML completo con lang, canonical e og — come le altre due pagine
if MODO == 'sito':
    import testa as TESTA
    OG = TESTA.blocco_home(
        'BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In',
        'Verified mid-term apartment rentals in Rome for internationals — '
        'English-first, legal contracts, 48-hour move-in. Your landing in '
        'Rome, handled.') + '\n'
    i = h.index('</title>') + len('</title>')
    h = h[:i] + '\n' + OG + h[i:]
    h = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         + h.replace('</style>', '</style>\n</head>\n<body>', 1)
         + '\n' + leggi('vetrina-idrante.html')
         + '\n' + TESTA.SW + '\n</body>\n</html>')
uscita = 'boom-portale.html' if MODO == 'artefatto' else 'boom-portale-sito.html' 
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · board {len(board)} righe · '
      f'aggiornato {AGG} · vetrina {len(tre)}')
