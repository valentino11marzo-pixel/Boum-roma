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
uri = json.load(open('foto-uri.json')); rem = json.load(open('foto-map.json'))
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
    if s == 'available': return ('Available now', 'si')
    if s in ('reserved', 'waitlist'): return ('Reserved', '')
    return ('Rented', '')

# ── le carte: la grammatica del portale, con i dati per i filtri ────────
def carta(r):
    z = zona_di(r); p = prezzo(r); n = re.sub(r'\s+', ' ', r['nome']).strip()
    mq = re.sub(r'[^\d]', '', str(r.get('sqm') or '')) or ''
    b = letti(r); st = stato(r)
    nuova = (oggi - quando(r)).days < 21
    ch = ('VERIFIED', 'verde') if r.get('video') else \
         ('NEW', '') if nuova else ('FREE NOW', 'verde') if st[1] == 'si' else None
    dati = ' <i>·</i> '.join(x for x in [
        f'<span class="home-zona" role="link" tabindex="0" '
        f'data-href="/apartments.html#zona={z}">{z}</span>',
        f'{mq} m²' if mq else '',
        'Studio' if b == 0 else f'{b} bed' if b else ''] if x)
    chip = (f'<span class="casa-chip {ch[1]}">{ch[0]}</span>' if ch else '')
    return f'''      <a class="casa-p" href="/listing/{r['id']}"
        data-zona="{z}" data-prezzo="{p}" data-letti="{b or 0}"
        data-mq="{mq or 0}" data-quando="{quando(r).strftime('%Y-%m-%d')}"
        data-dal="{libera(r.get('avail'))}">
        <div class="home-foto">
          <img loading="lazy" decoding="async" src="{banca.get(r['id'], '')}"
            alt="{n}, {z} — apartment for rent in Rome with BOOM">
          {chip}
          <span class="casa-stato {st[1]}">{st[0]}</span>
          <button type="button" class="home-cuore" data-u="/listing/{r['id']}"
            aria-label="Save this home">♥</button>
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

h = '\n'.join([testa, nav, leggi('ad-corpo.html'), piede,
               leggi('ad-regia.html'), onda,
               leggi('solari-engine.html'), leggi('deco-organi.html')])
h = h.replace('<title>BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In</title>',
    '<title>Apartments in Rome — walked in person, ready to move in | BOOM</title>')
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('CASE_MURO', MURO)
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
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')

if MODO == 'artefatto':
    HOME = 'https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478'
    CASA = 'https://claude.ai/code/artifact/a65a8cb4-bfe1-49a5-acaf-2c4a1a992321'
    h = h.replace('href="/index.html"', 'href="' + HOME + '"')
    h = h.replace('href="/listing/', 'href="' + CASA + '#id=')
    h = re.sub(r'href="/([a-z-]+)\.html"', r'href="https://www.boomrome.com/\1"', h)
    h = h.replace('href="/login"', 'href="https://www.boomrome.com/login"')
    h = h.replace('data-href="/apartments.html#zona=', 'data-href="#zona=')
else:
    h = h.replace('href="/index.html"', 'href="/v2-home.html"')
    h = h.replace('href="/apartments.html"', 'href="/v2-apartments.html"')
    h = h.replace('href="/listing/', 'href="/v2-listing.html#id=')
    h = h.replace('data-href="/apartments.html#zona=', 'data-href="#zona=')

uscita = 'boom-discovery.html' if MODO == 'artefatto' else 'boom-discovery-sito.html'
open(uscita, 'w', encoding='utf-8').write(h)
print(f'{uscita} · {len(h)//1024} KB · {len(mostrate)} case · '
      f'{len(ZONE)} zone · {DISPONIBILI} disponibili · aggiornato {AGG}')
