#!/usr/bin/env python3
# BOOM · KIOSK — il tabellone da vetrina: tutto il catalogo, a rotazione.
#
# IL TEMPLATE È LA PAGINA VIVA. Prima questo file portava una COPIA intera
# della pagina dentro una stringa python: board.html è poi cresciuto (doctype,
# SEO, idrante, motore Solari col fix Safari) e la copia è rimasta indietro —
# un rebuild avrebbe RETROCESSO la pagina deployata. Ora si legge board.html
# dalla radice del repo e si sostituiscono SOLO le parti variabili, delimitate
# da marker: il motore Solari (da solari-engine.html, la copia condivisa),
# le righe CASE, il noscript, il link home. Builder e pagina non possono
# più divergere per costruzione.
#
# La grammatica delle righe rispecchia js/kiosk-engine.js (il motore puro che
# la pagina usa per l'aggiornamento vivo) — e i suoi tre divieti:
#   · MAI un glifo fuori dal rullo (l'apostrofo di CONCA D'ORO ora c'è;
#     il vecchio fallback «—» non esisteva nel rullo: cella muta);
#   · MAI una zona mozzata a metà parola («VITTORIO VENE»): si abbrevia;
#   · MAI un prezzo corrotto in silenzio (il vecchio [:6] stampava €10,00
#     per €10,000).
#
#   python3 costruisci-kiosk.py            → boom-kiosk.html (artefatto)
#   python3 costruisci-kiosk.py sito       → boom-kiosk-sito.html
#     (pronto da copiare su /board.html: è la stessa pagina con CASE fresche)
#
# live-rows.json: si cerca nella cwd, poi qui, poi in ../home-live-deco.
import json, re, sys, unicodedata
from pathlib import Path
from datetime import datetime, timezone

QUI = Path(__file__).resolve().parent
RADICE = QUI.parent.parent
MODO = sys.argv[1] if len(sys.argv) > 1 else 'artefatto'

# ── la grammatica condivisa (rispecchia js/kiosk-engine.js) ──────────────
DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789€.,:·+/'-"
LARGO_ZONA, LARGO_PREZZO = 13, 6
ABBREV = {'CENTRO STORICO': 'CENTRO'}
MESI = {'jan':1,'gen':1,'feb':2,'mar':3,'apr':4,'may':5,'mag':5,'jun':6,'giu':6,
        'jul':7,'lug':7,'aug':8,'ago':8,'sep':9,'set':9,'oct':10,'ott':10,
        'nov':11,'dec':12,'dic':12}
MESE_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

def pulisci(s):
    t = unicodedata.normalize('NFD', str(s or '').upper())
    t = ''.join(c for c in t if not unicodedata.combining(c))
    t = ''.join(c if c in DRUM else ' ' for c in t)
    return re.sub(r'\s+', ' ', t).strip()

def zona_corta(z):
    t = pulisci(str(z or '').split('/')[0])
    if not t: return 'ROMA'
    if len(t) <= LARGO_ZONA: return t
    if t in ABBREV: return ABBREV[t]
    parole = t.split(' ')
    if len(parole) > 1:
        punta = parole[0][0] + '. ' + ' '.join(parole[1:])
        if len(punta) <= LARGO_ZONA: return punta
    while len(parole) > 1 and len(' '.join(parole)) > LARGO_ZONA:
        parole.pop()
    r = ' '.join(parole)
    return r if len(r) <= LARGO_ZONA else r[:LARGO_ZONA]

def prezzo_corto(n):
    n = int(round(n))
    s = '€' + f'{n:,}'
    if len(s) > LARGO_PREZZO: s = '€' + str(n)
    if len(s) > LARGO_PREZZO: s = '€' + str(round(n / 1000)) + 'K'
    if len(s) > LARGO_PREZZO: s = '€' + str(round(n / 1e6)) + 'M'
    return s

def letti(r):
    for c in (r.get('beds'), r.get('bedrooms')):
        m = re.search(r'\d+', str(c or ''))
        if m: return int(m.group())
    return None

def quando(r):
    try: return datetime.fromisoformat(str(r['when']).replace('Z','+00:00').replace('+00:00+00:00','+00:00'))
    except Exception: return datetime(2020,1,1,tzinfo=timezone.utc)

def libera(g, oggi):
    """'' quando non si sa leggere: la riga scrive ASK, mai NOW (regola 1
    di dispo-engine — l'ambiguo non diventa mai «libera ora»)."""
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
    return 'NOW' if d <= oggi else f'{d.day}{MESE_EN[d.month-1]}'

# ── le righe ─────────────────────────────────────────────────────────────
def trova_rows():
    for base in (Path.cwd(), QUI, QUI.parent / 'home-live-deco'):
        p = base / 'live-rows.json'
        if p.exists(): return p
    sys.exit('live-rows.json non trovato (cwd, pages-deco, home-live-deco)')

rows = json.load(open(trova_rows(), encoding='utf-8'))
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
        'ora': (libera(r.get('avail'), oggi) or 'ASK')[:5],
        'zona': zona_corta(r.get('zona')),
        'tipo': ('STU' if n == 0 else f'{n}BR' if n else 'FLT'),
        'prezzo': prezzo_corto(p),
        'stato': 'LIST' if r['status'] == 'waitlist' else ('NEW' if nuova else 'FREE'),
    })

# ogni glifo emesso deve esistere nel rullo — il divieto n.1, verificato
for c in CASE:
    for v in c.values():
        fuori = [ch for ch in v if ch not in DRUM]
        assert not fuori, f'glifo fuori rullo {fuori} in {v!r}'

# ── il noscript (l'unico testo che un crawler senza JS legge) ────────────
def frase(c):
    if c['ora'] == 'NOW': q = 'available now'
    elif c['ora'] == 'ASK': q = 'move-in date on request'
    else:
        m = re.match(r'^(\d{1,2})([A-Z]{3})$', c['ora'])
        q = f'free from {m.group(1)} {m.group(2).title()}' if m else 'move-in date on request'
    return f"    <p>{c['zona'].title()} · {c['tipo']} · {c['prezzo']}/mo · {q}</p>"

NOSCRIPT = '\n'.join(frase(c) for c in CASE)

# ── il montaggio: board.html è il template, i marker le parti vive ───────
def leggi(p): return open(p, encoding='utf-8').read()
h = leggi(RADICE / 'board.html')
motore = leggi(QUI / 'solari-engine.html').strip()
h = re.sub(r'<!-- solari:inizio -->.*?<!-- solari:fine -->',
           lambda _: '<!-- solari:inizio -->\n' + motore + '\n<!-- solari:fine -->',
           h, count=1, flags=re.S)
h = re.sub(r'var CASE = \[.*?\];',
           lambda _: 'var CASE = ' + json.dumps(CASE, ensure_ascii=False) + ';',
           h, count=1, flags=re.S)
h = re.sub(r'<!-- case-noscript -->.*?<!-- /case-noscript -->',
           lambda _: '<!-- case-noscript -->\n' + NOSCRIPT + '\n    <!-- /case-noscript -->',
           h, count=1, flags=re.S)
if MODO == 'artefatto':
    h = h.replace('<a href="/" style=',
      '<a href="https://claude.ai/code/artifact/3c0dae67-a0e6-47d4-964f-832b824ffe0f" style=', 1)

uscita = QUI / ('boom-kiosk.html' if MODO == 'artefatto' else 'boom-kiosk-sito.html')
open(uscita,'w',encoding='utf-8').write(h)
print(f'{uscita.name} · {len(h)//1024} KB · {len(CASE)} case · {max(1,(len(CASE)+5)//6)} pagine')
