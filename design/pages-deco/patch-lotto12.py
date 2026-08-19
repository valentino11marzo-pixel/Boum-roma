#!/usr/bin/env python3
# LOTTO 12 — LA PASSATA DELLA VERITÀ (sorgenti builder + dati di build).
# Decisioni dell'operatore (16/08): rimborso €350 SÌ (la formula è quella
# già scritta in faq:528 — 3 opzioni in 15 giorni), onorario 10%,
# Bilocale Centro (waitlist, 60mq) ha 1 camera.
import json, shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: attese 1, trovate {s.count(ago)} di {ago[:70]!r}'

# ── 1 · testa.py — il rating auto-dichiarato esce dal JSON-LD ────────────
t = leggi('testa.py'); shutil.copy('testa.py', 'testa.py.bak12')
RATING = ("    'aggregateRating': {'@type': 'AggregateRating',\n"
          "                        'ratingValue': '4.9', 'reviewCount': '127'},\n")
uno(t, RATING, 'testa aggregateRating')
# review markup self-serving: rischio penalità sui rich results, e il 127
# non è sorgentibile (il profilo Google regge 47)
t = t.replace(RATING, '')

VECCHIO_48 = ("'Most BOOM tenants move in within 48 hours of signing. Some '\n"
              "            'apartments are available same-day; complex cases (visa, '\n"
              "            'multi-document onboarding) average 7 days.'")
uno(t, VECCHIO_48, 'testa faq 48h')
# capacità, non statistica: nessuna misura sostiene il "most"
t = t.replace(VECCHIO_48,
    "'Move-in can be as fast as 48 hours from signing when the home '\n"
    "            'is free — some same-day. Complex cases (visa, multi-document '\n"
    "            'onboarding) usually take about a week.'")
scrivi('testa.py', t)

# ── 2 · pt.html — i numeri diventano fatti, il flap dice il vero ─────────
p = leggi('pt.html'); shutil.copy('pt.html', 'pt.html.bak12')

CIFRA_98 = '<div><b>98%</b><span>success rate</span></div>'
uno(p, CIFRA_98, 'pt 98%')
# il 98% non ha una misura dietro; il 4.9 su Google ce l'ha, col link
p = p.replace(CIFRA_98, '<div><b>4.9★</b><span>on Google · 47 reviews</span></div>')

SAVING = ('<span class="lungo">fixed · avg saving €600+</span>'
          '<span class="breve">fixed · saves €600+ on average</span>')
uno(p, SAVING, 'pt €600')
# nessuna casistica misurata: si vende la capacità, non una media inventata
p = p.replace(SAVING, '<span class="lungo">fixed · deposit and clauses negotiated</span>'
                      '<span class="breve">fixed · we negotiate for you</span>')

D45 = '<b>45+ days average search time</b>'
uno(p, D45, 'pt 45 days')
p = p.replace(D45, '<b>Weeks of searching, alone</b>')
D8K = '<b>€8,000+ upfront costs</b>'
uno(p, D8K, 'pt 8000')
p = p.replace(D8K, '<b>Months of rent upfront</b>')

GIRO = """      var giro = ['HOURS', 'DAYS'], i = 0;
      setInterval(function () {
        if (document.hidden) return;
        b.update(giro[i % 2]);
        host.setAttribute('aria-label', giro[i % 2].toLowerCase());
        i++;
      }, 8000);
"""
uno(p, GIRO, 'pt flap giro')
# HOURS prometteva più di quanto il sito stesso dichiara (48h come
# capacità): il flap si compone una volta e resta sulla parola vera
p = p.replace(GIRO, '')

# lo scalo non esiste più nel markup (lotto 11): via anche il CSS orfano
i0 = p.index('/* lo scalo: il cartellino ROM e la rotta che arriva */')
i1 = p.index('/* la cornice a tacche: riservata agli apparecchi')
p = p[:i0] + p[i1:]
VECCHIA_RIGA = '.btn-primary::after, .scalo-punto, .pronto::before { display:none; }'
uno(p, VECCHIA_RIGA, 'pt reduced-motion scalo')
p = p.replace(VECCHIA_RIGA, '.btn-primary::after, .pronto::before { display:none; }')
uno(p, 'HERO — tre zone: la voce, lo scalo, il tabellone', 'pt commento hero')
p = p.replace('HERO — tre zone: la voce, lo scalo, il tabellone',
              'HERO — due zone: la voce e il tabellone')
assert '.scalo' not in p, 'pt: resti di .scalo'
scrivi('pt.html', p)

# ── 3 · costruisci-ld.py — cover di riserva + note PREVIEW vere in sito ──
b = leggi('costruisci-ld.py'); shutil.copy('costruisci-ld.py', 'costruisci-ld.py.bak12')
COVER = "    cover = banca.get(ide, '')\n"
uno(b, COVER, 'ld cover')
b = b.replace(COVER, COVER +
    "    if MODO == 'sito' and not cover:\n"
    "        # il banco foto non ha l'id (es. cover .HEIC scartata dal bake):\n"
    "        # una casa in catalogo non sparisce dalla vetrina per una foto\n"
    "        cover = str(((r.get('images') or [None])[0]) or r.get('image') or '')\n")

GANCIO = "    h = h.replace('</footer>',\n"
uno(b, GANCIO, 'ld gancio sito')
NOTE = (
    "    # le note PREVIEW dicevano il vero solo nell'artefatto (dove il form\n"
    "    # non spedisce); sul sito spedisce davvero — la nota fa la promessa\n"
    "    # che la home già fa: una persona con un nome risponde entro 2 ore\n"
    "    h = h.replace('PREVIEW — nothing is sent from this page. On\\n"
    "          the live site this reaches a person and becomes your written\\n"
    "          pre-agreement.',\n"
    "        'Your application goes straight to a person — a named human\\n"
    "          replies within 2 hours and it becomes your written\\n"
    "          pre-agreement.')\n"
    "    h = h.replace('PREVIEW — nothing was sent from this page.',\n"
    "        'Sent — a named human replies within 2 hours.')\n")
b = b.replace(GANCIO, NOTE + GANCIO)
scrivi('costruisci-ld.py', b)

# ── 4 · i dati di build: la cover di Pigneto Palace passa al JPG ─────────
# (il .HEIC non renderizza in Chrome/Firefox; il JPG convertito entra nel
# repo come /foto-catalogo/pigneto-palace.jpg — URL relativo: vale in
# preview e in produzione. Firestore lo riceve dal one-shot server-side.)
PIGNETO = '2SwJ8yD3ITXylrEtYIlL'
mappa = json.load(open('foto-map.json'))
mappa[PIGNETO] = '/foto-catalogo/pigneto-palace.jpg'
json.dump(mappa, open('foto-map.json', 'w'), indent=1)
piene = json.load(open('case-full.json'))
for r in piene:
    if (r.get('_id') or r.get('id')) == PIGNETO:
        r['image'] = '/foto-catalogo/pigneto-palace.jpg'
        r['images'] = ['/foto-catalogo/pigneto-palace.jpg']
    # la decisione dell'operatore: il Bilocale Centro in waitlist ha 1 camera
    if (r.get('_id') or r.get('id')) == 'OLLVsiKhPrhpT1fx8XmB':
        r['bedrooms'] = 1
json.dump(piene, open('case-full.json', 'w'), ensure_ascii=False, indent=1)

print('lotto 12 sorgenti: rating via · fatti al posto dei numeri · flap su DAYS'
      ' · scalo CSS via · cover fallback · note PREVIEW vere · Pigneto JPG'
      ' · Bilocale Centro 1 camera')
