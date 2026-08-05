#!/usr/bin/env python3
# BOOM · POP — dal catalogo vero al manifesto, in un passaggio.
#   python3 costruisci-pop.py artefatto   → foto in base64 (anteprima CSP-safe)
#   python3 costruisci-pop.py sito        → foto dagli URL di Firebase Storage
import json, re, sys
from datetime import datetime, timezone, timedelta

MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
ROMA = timezone(timedelta(hours=2))
MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}

def letti(r):
    for c in (r.get('beds'), r.get('bedrooms')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None
def piano(r):
    p = re.sub(r'\s+',' ',str(r.get('floor') or '')).strip()
    if not p: return ''
    if re.search(r'ground|terra', p, re.I) or p == '0': return 'Ground'
    m = re.search(r'\d+', p); return m.group() if m else p[:8]
def sigla(r):
    n = letti(r)
    if n == 0: return 'STU'
    if n: return f'{n}BR'
    return (re.sub(r'\s+',' ',str(r.get('type') or 'FLAT')).upper().strip()[:3] or 'FLT')
def euro(n): return '€' + f'{int(n):,}'
def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00').replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)
def libera(g, oggi):
    """Otto formati scritti a mano nel catalogo, una sola risposta leggibile."""
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

vivi = [r for r in rows if r.get('status') in ('available','waitlist')
        and r.get('nome') and r.get('price')]
vivi.sort(key=quando, reverse=True)

def normale(r):
    d = quando(r)
    return {
        'id': r['id'],
        'nome': re.sub(r'\s+',' ',r['nome']).strip(),
        # «Africano/Trieste» è un'etichetta interna: in vetrina va un
        # quartiere solo, altrimenti il tabellone lo tronca a metà parola
        'zona': re.sub(r'\s+',' ',(r.get('zona') or 'Roma')).split('/')[0].strip(),
        'prezzo': int(re.sub(r'[^\d]','',str(r['price'])) or 0),
        'tipo': sigla(r),
        'sqm': re.sub(r'[^\d]','',str(r.get('sqm') or '')) or '',
        'piano': piano(r),
        'letti': letti(r),
        'attesa': r['status'] == 'waitlist',
        'nuova': (oggi - d).days < 21,
        'libera': libera(r.get('avail'), oggi),
    }

case = [normale(r) for r in vivi if int(re.sub(r'[^\d]','',str(r['price'])) or 0) > 0]
def stato(c): return 'LIST' if c['attesa'] else ('NEW' if c['nuova'] else 'FREE')

libere = [c for c in case if not c['attesa']]
attese = [c for c in case if c['attesa']]
# il tabellone dice «free right now»: prima chi lo è davvero
pronte = ([c for c in libere if c['libera'] == 'Now'] +
          [c for c in libere if c['libera'] != 'Now'])
tabellone, zone = [], set()
for giro in (1, 2):
    for c in pronte:
        if len(tabellone) == 6: break
        if c in tabellone: continue
        if giro == 1 and c['zona'].lower() in zone: continue
        tabellone.append(c); zone.add(c['zona'].lower())
# le schede: solo case con una fotografia vera (un buco nella griglia
# racconterebbe una manutenzione mancata, non un catalogo pieno), e una
# zona per volta finché ce n'è — sei riquadri devono mostrare sei Rome
# diverse, non quattro volte lo stesso quartiere.
fotografate = [c for c in (libere + attese) if banca.get(c['id'])]
vetrina, viste = [], set()
for giro in (1, 2):
    for c in fotografate:
        if len(vetrina) == 6: break
        if c in vetrina: continue
        z = c['zona'].lower()
        if giro == 1 and z in viste: continue
        vetrina.append(c); viste.add(z)

def voce(c):
    return {'nome':c['nome'], 'zona':c['zona'].upper()[:13], 'tipo':c['tipo'][:3],
            'prezzo':euro(c['prezzo'])[:6], 'stato':stato(c),
            'ora':(c['libera'] or '—').upper()[:5],
            'sqm':c['sqm'] or '—', 'piano':c['piano'] or '—',
            'url':'/listing/'+c['id']}

CASE = {'totale':len(case),
        'righe':[voce(c) for c in tabellone],
        'altre':[voce(c) for c in case if c not in tabellone]}

def camere(c):
    if c['letti'] == 0: return 'Studio'
    return (f"{c['letti']} bedroom" if c['letti']==1 else f"{c['letti']} bedrooms") \
        if c['letti'] else c['tipo']

def scheda(c, n, primo):
    tag = 'Waiting list' if c['attesa'] else ('New' if c['nuova'] else
          (('Free ' + c['libera'].lower()) if c['libera'] else ''))
    src = banca.get(c['id'],'')
    alt = f"{c['nome']}, {c['zona']} — apartment for rent in Rome with BOOM"
    dati = ' · '.join(x for x in [
        (c['sqm'] + ' m²') if c['sqm'] else '', camere(c),
        ('Ground floor' if c['piano'] == 'Ground'
         else ('Floor ' + c['piano'])) if c['piano'] else ''] if x)
    return f'''      <a class="casa" href="/listing/{c['id']}">
        <div class="casa-foto{'' if src else ' senza'}">
          <img {'' if primo else 'loading="lazy" '}decoding="async" src="{src}" alt="{alt}">
          <span class="casa-n">{n:02d}</span>
          {f'<span class="casa-tag">{tag}</span>' if tag else ''}
        </div>
        <div class="casa-corpo">
          <div class="casa-zona">{c['zona']}</div>
          <div class="casa-nome">{c['nome']}</div>
          <div class="casa-dati">{dati}</div>
          <div class="casa-piede">
            <span class="casa-prezzo">{euro(c['prezzo'])}<small> /mo</small></span>
            <span class="casa-vai">Open →</span>
          </div>
        </div>
      </a>'''

CARDS = '\n\n'.join(scheda(c, i+1, i < 3) for i, c in enumerate(vetrina))
# senza JavaScript il tabellone resta leggibile: stesse righe, stampate
STATICHE = '\n'.join(
  f'''<a class="riga-ferma" href="{c['url']}"><span>{c['ora']}</span>'''
  f'''<span>{c['zona']}</span><span>{c['tipo']}</span>'''
  f'''<span>{c['prezzo']}</span><span>{c['stato']}</span></a>''' for c in CASE['righe'])

def leggi(n): return open(n, encoding='utf-8').read()
h = '\n'.join(leggi(p) for p in ['pd-css.html','pd-body.html','solari-engine.html','pd-js.html'])
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace('CASE_CARDS', CARDS)
h = h.replace('RIGHE_STATICHE', STATICHE)
h = h.replace("'CASE_JSON'", json.dumps(CASE, ensure_ascii=False))

uscita = 'boom-pop.html' if MODO == 'artefatto' else 'boom-pop-sito.html'
open(uscita,'w',encoding='utf-8').write(h)
print(f"{uscita} · {len(h)//1024} KB · {len(case)} case · "
      f"{len(CASE['righe'])} righe · {len(vetrina)} schede")
for c in vetrina: print('  ·', c['nome'][:30].ljust(30), c['zona'][:14].ljust(14),
                        euro(c['prezzo']).rjust(7), c['libera'] or '—')
