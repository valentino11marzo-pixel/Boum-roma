#!/usr/bin/env python3
# BOOM · KIOSK — il tabellone da vetrina: tutto il catalogo, a rotazione.
import json, os, re, sys
from datetime import datetime, timezone, timedelta
sys.dont_write_bytecode = True   # niente design/__pycache__ nel repo
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from listing_facts import bedrooms_of  # design/listing_facts.py: la regola UNA
MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'
MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}
# le camere con la regola del sito (FACTS.bedroomsOf): `bedrooms` prima di
# `beds` — prima qui il bilocale di Via dei Cappellari usciva «3BR»
def letti(r): return bedrooms_of(r)
def euro(n): return '€' + f'{int(n):,}'
def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00').replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)
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
    return 'NOW' if d <= oggi else d.strftime('%-d%b').upper()

rows = json.load(open('live-rows.json'))
oggi = datetime.now(timezone.utc)
vivi = [r for r in rows if r.get('status') in ('available','waitlist')
        and r.get('nome') and r.get('price')]
vivi.sort(key=quando, reverse=True)
CASE = []
for r in vivi:
    p = int(re.sub(r'[^\d]','',str(r['price'])) or 0)
    if not p: continue
    n = letti(r)
    nuova = (oggi - quando(r)).days < 21
    CASE.append({
        # l'id della casa: il tabellone non lo mostra, ma
        # scripts/catalogo-nomi.mjs ci riscrive camere e nomi PER ID, senza
        # doverlo ricavare dall'ordine delle righe
        'id': r['id'],
        'ora': (libera(r.get('avail'), oggi) or '—')[:5],
        'zona': re.sub(r'\s+',' ',(r.get('zona') or 'Roma')).split('/')[0].strip().upper()[:13],
        'tipo': ('STU' if n == 0 else f'{n}BR' if n else 'FLT'),
        'prezzo': euro(p)[:6],
        'stato': 'LIST' if r['status'] == 'waitlist' else ('NEW' if nuova else 'FREE'),
    })

def leggi(n): return open(n, encoding='utf-8').read()
# IL TABELLONE VIVO. Fino al 16/10/2026 questo builder emetteva il kiosk di
# luglio: un corpo senza testa, le righe tutte insieme, nessuna lettura del
# catalogo. board.html era stata fatta a mano sopra — la testa (canonical,
# og-board.png), le PARTENZE/ARRIVI dello Scalo, l'idrante che legge
# Firestore col motore delle corsie (laneRows) e le camere con la regola
# UNA (camereDi, 15/10) — e una ricostruzione le toglieva tutte, senza un
# errore. Ora la pagina nasce da due frammenti, come le altre:
#   kiosk-corpo.html  lo stile del kiosk e il corpo (cima, lato, sala, fondo)
#   kiosk-regia.html  lo script: fotografia di build (CASE_JSON), partenze e
#                     arrivi, rotazione, orologio, idrante
# e dalla testa di testa.py (blocco_board) col contratto di scorrimento.
TITOLO = 'BOOM · Rome — Live Board'
h = ('<title>' + TITOLO + '</title>\n'
     + 'TESTA_BOARD'
     + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
     + leggi('kiosk-corpo.html') + leggi('solari-engine.html') + '\n'
     + leggi('kiosk-regia.html'))
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())
h = h.replace("'CASE_JSON'", json.dumps(CASE, ensure_ascii=False))
# il piede porta alla home vera (/): prima il builder scriveva /v2-home.html,
# una pagina di prova che sul sito non esiste piu
HOME = ('https://claude.ai/code/artifact/3c0dae67-a0e6-47d4-964f-832b824ffe0f'
        if MODO == 'artefatto' else '/')
h = h.replace('KIOSK_HOME', HOME)
if MODO == 'sito':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import testa as TESTA
    assert TESTA.TITOLO_BOARD == TITOLO
    h = h.replace('TESTA_BOARD', TESTA.blocco_board() + '\n')
    h = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         + h.replace('</style>', '</style>\n' + TESTA.scroll()
                     + '\n</head>\n<body>', 1)
         + '\n' + TESTA.CONSENSO + '\n' + TESTA.TRACCIA + '\n</body>\n</html>\n')
else:
    # l'anteprima non ha /js: il motore delle corsie dal sito vero (senza,
    # l'idrante ricade sulla fotografia di build — fail-open, come vivo)
    h = h.replace('TESTA_BOARD', '')
    h = h.replace('<script src="/js/dispo-engine.js">',
                  '<script src="https://www.boomrome.com/js/dispo-engine.js">')
uscita = 'boom-kiosk.html' if MODO == 'artefatto' else 'boom-kiosk-sito.html'
open(uscita,'w',encoding='utf-8').write(h)
# le pagine come le gira il tabellone: partenze (ora NOW) poi arrivi
part = sum(1 for c in CASE if c['ora'] == 'NOW')
pagine = -(-part // 6) + -(-(len(CASE) - part) // 6) or 1
print(f'{uscita} · {len(h)//1024} KB · {len(CASE)} case · {pagine} pagine '
      f'({part} in partenza, {len(CASE) - part} in arrivo)')
