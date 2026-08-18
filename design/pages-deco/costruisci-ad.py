#!/usr/bin/env python3
# BOOM · DISCOVERY — la stessa lingua del portale, sul catalogo intero.
#   python3 costruisci-ad.py artefatto | sito
import json, re, sys
from datetime import datetime, timezone

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
def leggi(n): return open(n, encoding='utf-8').read()
def euro(n): return '€' + f'{int(n):,}'
def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z', '+00:00')
        .replace('+00:00+00:00', '+00:00'))
    except Exception: return datetime(2020, 1, 1, tzinfo=timezone.utc)

MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}
oggi = datetime.now(timezone.utc)
def libera(g):
    """la data in cui la casa è libera, normalizzata — o vuoto se ignota"""
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
        # senza anno scritto: se il mese è già passato, è dell'anno prossimo
        if not an and mese < oggi.month: anno += 1
        try: return datetime(anno, mese, giorno).strftime('%Y-%m-%d')
        except ValueError: return ''
    return ''

rows = json.load(open('live-rows.json'))
piene = {(r.get('_id') or r.get('id')): r for r in json.load(open('case-full.json'))}
DOTE_NOMI = {'ac': 'A/C', 'wifi': 'Wi-Fi', 'wi-fi': 'Wi-Fi',
             'washing_machine': 'Washer', 'double_glazing': 'Double glazing',
             'dishwasher': 'Dishwasher', 'balcony': 'Balcony',
             'elevator': 'Elevator', 'doorman': 'Doorman', 'parking': 'Parking'}
def dote_di(ide):
    p = piene.get(ide) or {}
    fuori = []
    for f in (p.get('features') or p.get('tags') or []):
        k = re.sub(r'\s+', ' ', str(f)).strip().lower()
        if k in DOTE_NOMI and DOTE_NOMI[k] not in fuori: fuori.append(DOTE_NOMI[k])
    return fuori
uri = json.load(open('foto-uri.json'))
rem = json.load(open('foto-map.json'))
banca = uri if MODO == 'artefatto' else rem

tutti = [r for r in rows if r.get('nome') and r.get('price')
         and r.get('status') in ('available', 'reserved', 'rented', 'waitlist')]
tutti.sort(key=quando, reverse=True)

def zona_di(r):
    return re.sub(r'\s+', ' ', (r.get('zona') or 'Roma')).split('/')[0].strip()
def prezzo(r): return int(re.sub(r'[^\d]', '', str(r['price'])) or 0)
def letti(r):
    for c in (r.get('beds'), r.get('bedrooms')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None
def stato(r):
    s = r['status']
    if s == 'available':
        # libera si, ma DA QUANDO: se la data e nel futuro, il badge la dice.
        # «Available now» con ingresso nel 2027 era una promessa falsa.
        d = libera(r.get('avail'))
        if d and d > oggi.strftime('%Y-%m-%d'):
            dt = datetime.fromisoformat(d)
            eti = 'Free from ' + str(int(dt.strftime('%d'))) + dt.strftime(' %b')
            if dt.year != oggi.year: eti += dt.strftime(' %Y')
            return (eti, 'poi')
        return ('Available now', 'si')
    if s == 'waitlist': return ('Waitlist open', 'fila')
    if s == 'reserved': return ('Reserved', '')
    return ('Rented', '')

# ── le carte: la grammatica del portale, con i dati per i filtri ────────
def carta(r):
    z = zona_di(r); p = prezzo(r); n = re.sub(r'\s+', ' ', r['nome']).strip()
    mq = re.sub(r'[^\d]', '', str(r.get('sqm') or '')) or ''
    b = letti(r); st = stato(r)
    nuova = (oggi - quando(r)).days < 21
    # niente FREE NOW: lo stato lo dice gia la striscia sulla stessa foto.
    # Il chip resta per cio che AGGIUNGE: il video e la novita.
    vivo = r['status'] in ('available', 'waitlist')
    ch = ('VERIFIED', 'verde') if r.get('video') and vivo else \
         ('NEW', '') if nuova and vivo else None
    dati = ' <i>·</i> '.join(x for x in [
        f'<span class="home-zona" role="link" tabindex="0" '
        f'data-href="/apartments.html#zona={z}">{z}</span>',
        f'{mq} m²' if mq else '',
        'Studio' if b == 0 else f'{b} bed' if b else ''] if x)
    chip = (f'<span class="casa-chip {ch[1]}">{ch[0]}</span>' if ch else '')
    piena = piene.get(r['id']) or {}
    bagni = re.sub(r'[^\d]', '', str(piena.get('bathrooms') or '')) or '0'
    arred = '1' if str(piena.get('furnished') or '').lower() in ('yes','true','si','sì') else '0'
    vid = '1' if (r.get('video') or piena.get('videoUrl') or piena.get('youtubeUrl')) else '0'
    dote = dote_di(r['id'])
    cerca = ' '.join([n, z, str(r.get('address') or ''),
                      str(r.get('type') or '')]).lower()
    czm = re.search(r'\d+', str(piena.get('depositMonths') or ''))
    czm = int(czm.group()) if czm else 1
    piano = re.sub(r'[\s"]+', ' ', str(piena.get('floor') or '')).strip()[:12]
    return f'''      <a class="casa-p" href="/listing/{r['id']}"
        data-zona="{z}" data-prezzo="{p}" data-letti="{b or 0}"
        data-mq="{mq or 0}" data-quando="{quando(r).strftime('%Y-%m-%d')}"
        data-dal="{libera(r.get('avail'))}" data-bagni="{bagni}"
        data-arredata="{arred}" data-video="{vid}"
        data-dote="|{'|'.join(dote)}|" data-chiave="/listing/{r['id']}"
        data-cerca="{cerca}" data-id="{r['id']}" data-cauzione="{czm}"
        data-piano="{piano}">
        <div class="home-foto">
          <img loading="lazy" decoding="async" src="{banca.get(r['id'], '')}"
            alt="{n}, {z} — apartment for rent in Rome with BOOM">
          {chip}
          <span class="casa-stato {st[1]}">{st[0]}</span>
          <button type="button" class="home-cuore" data-u="/listing/{r['id']}"
            aria-label="Save this home">♥</button>
          <button type="button" class="home-para" data-id="{r['id']}"
            aria-label="Compare this home">⇄</button>
        </div>
        <div class="corpo">
          <div class="riga1"><span class="nome">{n}</span>
            <span class="canone"><span class="flap-prezzo flap-scale"
              data-p="{euro(p)}" aria-label="{euro(p)} per month"></span><small>/mo</small></span></div>
          <div class="riga2">{dati}</div>
        </div>
      </a>'''

# solo le case con una foto: una carta cieca non è una vetrina
mostrate = [r for r in tutti if banca.get(r['id'])]
MURO = '\n'.join(carta(r) for r in mostrate)

# ── le zone: destinazioni con quante case e da quanto ───────────────────
gruppi = {}
for r in mostrate:
    gruppi.setdefault(zona_di(r), []).append(r)
ZONE = []
for z, rr in gruppi.items():
    disp = [x for x in rr if x['status'] == 'available']
    base = disp or rr
    ZONE.append({'z': z, 'n': len(rr),
                 'da': euro(min(prezzo(x) for x in base)).rjust(6),
                 'si': bool(disp)})
ZONE.sort(key=lambda x: (not x['si'], -x['n']))
ALTRE = max(0, len(ZONE) - 8)
ZONE = ZONE[:8]   # un tabellone si legge in un colpo d'occhio
DISPONIBILI = sum(1 for r in mostrate if r['status'] == 'available')
ultimo = max(quando(r) for r in mostrate)
giorni = (oggi - ultimo).days
AGG = 'today' if giorni == 0 else 'yesterday' if giorni == 1 else \
      ultimo.strftime('%-d %b')

# ── il sistema di design viene dal portale: una lingua sola ─────────────
pt = leggi('pt.html')
testa = pt[:pt.index('</style>') + len('</style>')]
nav = pt[pt.index('<nav class="nav" id="nav">'):pt.index('<!-- ══ HERO')]
piede = pt[pt.index('<footer class="piede">'):
           pt.index('</footer>') + len('</footer>')]
a = pt.index('  function cartaRoma() {')
b = pt.index("  /* parte DOPO via(): il tabellone ha già dichiarato le zone vive */")
onda = ('<script>\n(function () {\n  \'use strict\';\n' + pt[a:b]
        + "  if (document.readyState === 'complete') setTimeout(cartaRoma, 0);\n"
        + "  else addEventListener('load', function () { setTimeout(cartaRoma, 0); });\n"
        + '})();\n</script>')

# la Skyline della home, per intero: il blocco e la sua macchina.
# Nessuna copia a mano — se la home migliora, la discovery la segue.
ci_a = pt.index('<div class="cielo sale" id="cielo">')
ci_b = pt.index('</section>', ci_a)
cielo_blocco = pt[ci_a:ci_b].rstrip()
assert cielo_blocco.endswith('</div>'), 'blocco cielo'
cielo_blocco = cielo_blocco[:-6].rstrip()  # cade il </div> del container
sc_a = pt.index("var CASE = 'SKY_JSON';")
sc_a = pt.rindex('<script>', 0, sc_a)
sc_b = pt.index('</script>', sc_a) + len('</script>')
cielo_js = pt[sc_a:sc_b]

h = '\n'.join([testa, nav, leggi('ad-corpo.html'), piede,
               leggi('ad-regia.html'), onda, cielo_js,
               leggi('solari-engine.html'), leggi('deco-organi.html')])
h = h.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
    '<title>Apartments in Rome — walked in person, ready to move in | BOOM</title>')
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('href="#banchina"', 'href="' + ('https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478' if MODO == 'artefatto' else '/') + '#banchina"')
h = h.replace('CASE_MURO', MURO)
h = h.replace('VISTA_CIELO', cielo_blocco)
SKYD = []
for r in mostrate:
    p = piene.get(r['id']) or {}
    if not p.get('lat') or not p.get('lng'): continue
    if r['status'] not in ('available', 'reserved', 'waitlist'): continue
    SKYD.append({'id': r['id'], 'nome': re.sub(r'\s+', ' ', r['nome']).strip(),
        'zona': zona_di(r), 'lat': float(p['lat']), 'lng': float(p['lng']),
        'da': euro(prezzo(r)), 'si': r['status'] == 'available',
        'foto': (rem.get(r['id'], '') if MODO == 'sito' else ''),
        'stato': 'reserved' if r['status'] in ('reserved', 'waitlist') else 'rented'})
h = h.replace("'SKY_JSON'", json.dumps(SKYD, ensure_ascii=False))
h = h.replace('SKYLINE_URL', 'https://www.boomrome.com/skyline'
    if MODO == 'artefatto' else '/skyline')
h = h.replace('CASA_BASE',
    ('https://claude.ai/code/artifact/db7c3240-a12d-4734-9eb7-06a780584231#id=')
    if MODO == 'artefatto' else '/listing/')
conta_dote = {}
for r in mostrate:
    for d in dote_di(r['id']): conta_dote[d] = conta_dote.get(d, 0) + 1
scelte = sorted(conta_dote.items(), key=lambda x: -x[1])[:6]
h = h.replace('DOTE_TASTI', '\n          '.join(
    f'<button type="button" data-f="dote" data-v="{d}">{d}</button>'
    for d, _ in scelte))
h = h.replace("'ZONE_JSON'", json.dumps(ZONE, ensure_ascii=False))
h = h.replace('DISPONIBILI', str(DISPONIBILI))
h = h.replace('AGGIORNATO', AGG)
h = h.replace('ALTRE_ZONE', (f'top 8 of {8 + ALTRE} zones') if ALTRE
    else f'{len(ZONE)} zones')
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
    HOME = 'https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478'
    CASA = 'https://claude.ai/code/artifact/db7c3240-a12d-4734-9eb7-06a780584231'
    h = h.replace('href="/index.html"', 'href="' + HOME + '"')
    h = h.replace('href="/listing/', 'href="' + CASA + '#id=')
    h = h.replace('href="/your-money.html"', 'href="https://claude.ai/code/artifact/bd225367-85f2-4aa5-871d-9653827c078b"')
    h = re.sub(r'href="/([a-z-]+)\.html"', r'href="https://www.boomrome.com/\1"', h)
    h = h.replace('href="/login"', 'href="https://www.boomrome.com/login"')
    h = h.replace('data-href="/apartments.html#zona=', 'data-href="#zona=')
else:
    # CABLATO: la discovery vive su /apartments, le card su /listing/<id>
    for da, a_ in {'/index.html': '/',
        '/apartments.html': '/apartments',
        '/your-money.html': '/your-money'}.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')
    h = h.replace('data-href="/apartments.html#zona=', 'data-href="#zona=')
    # cleanUrls: OGNI link interno perde il .html anche nel modo sito
    h = re.sub(r'href="/([a-z-]+)\.html"', r'href="/\1"', h)

DESCR = ('Browse ' + str(len(mostrate)) + ' verified apartments for rent in '
         'Rome — every home walked in person by BOOM. Filter by zone, budget '
         'and move-in date; ' + str(DISPONIBILI) + ' available now.')
h = h.replace(
    '<meta name="description" content="Verified mid-term apartment rentals in '
    'Rome for internationals — English-first, legal contracts, 48-hour '
    'move-in. Your landing in Rome, handled.">',
    '<meta name="description" content="' + DESCR + '">')
if MODO == 'sito':
    import testa as TESTA
    OG = TESTA.blocco_discovery(
        'Apartments in Rome — walked in person | BOOM', DESCR,
        len(mostrate),
        immagine=rem.get(mostrate[0]['id']) or TESTA.IMG_SOCIAL) + '\n'
    i = h.index('</title>') + len('</title>')
    h = h[:i] + '\n' + OG + h[i:]
    h = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         + h.replace('</style>', '</style>\n</head>\n<body>', 1)
         + '\n<script src="/js/dispo-engine.js"></script>'
         + '\n' + leggi('vetrina-idrante.html')
         + '\n' + TESTA.CONSENSO + '\n</body>\n</html>')
uscita = 'boom-discovery.html' if MODO == 'artefatto' else 'boom-discovery-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · {len(mostrate)} case · '
      f'{len(ZONE)} zone · {DISPONIBILI} disponibili · aggiornato {AGG}')
