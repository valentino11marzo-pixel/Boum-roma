#!/usr/bin/env python3
"""design/listing_facts.py — LE CAMERE DI UNA CASA, CON LA REGOLA UNA, AI BUILDER.

Il gemello Python di FACTS.bedroomsOf (js/listing-facts.js) per i builder di
design/ (costruisci-*.py), che fotografano il catalogo nelle pagine statiche.

IL REPERTO (15/10/2026). Ogni builder si scriveva la sua regola delle camere,
e nessuna era quella del sito: sei leggevano PRIMA `beds` — il testo libero
del bot («Living , 1 bedroom with balcony , 1 bedroom…», «1BR + Loft», «3»
su un bilocale) — e ne prendevano il PRIMO numero, quindi «Capri 2 Bed»
usciva «1 bed» a ogni ricostruzione; uno perdeva lo 0 del monolocale
(`str(c or '')`) e leggeva «1.5» come 1; uno inventava una camera dove non
c'era scritto niente (`bedrooms or '1'`) e leggeva «1.5» come 15.

  bedrooms_of(d)  la regola di FACTS.bedroomsOf, punto per punto: il campo
                  STRUTTURATO `bedrooms`, letto come lo legge Number() di
                  JavaScript, vince se è un intero 0–10 (0 = monolocale);
                  il testo libero `beds` vale solo se `bedrooms` manca o non
                  si legge, e solo per 1–10 (il primo numero di cifre ASCII,
                  come /\\d+/ in JS). Altrimenti None: NON LO SAPPIAMO, e
                  una pagina non stampa né «0» né «Studio» per un dato che
                  non c'è.
  voce(n)         la voce della riga «zona · m² · camere» nella grammatica
                  delle carte: 'Studio' per 0, 'N bed', '' per None.

I builder lo importano con il percorso della cartella design/ (vivono in
design/pages-deco/ o design/home-live-deco/, anche quando li si copia l'uno
nell'altro come dice il README):

    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    from listing_facts import bedrooms_of

PARITÀ. `python3 design/listing_facts.py` confronta bedrooms_of con la regola
VERA, chiedendola a Node (js/listing-facts.js) su una tabella di casi: le
fotografie vere dei builder e i casi limite (stringhe che Number() legge e
float() no, e viceversa; spazi che trim() toglie e strip() no; cifre non
ASCII; numeri che String() scrive in un altro modo). Senza Node il confronto
si salta e lo si dice. tests/catalogo/vetrina.mjs lo lancia a ogni giro.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys

# ── la lettura che fa JavaScript ─────────────────────────────────────────
# String.prototype.trim(): gli spazi (Zs, tab, VT, FF, NBSP, BOM) e i fine
# riga. Non str.strip(): Python toglie anche \x1c-\x1f e \x85, e lascia il BOM.
_JS_WS = ('\t\n\x0b\x0c\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006'
          '\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')
# Number(stringa): decimale ASCII con segno ed esponente, Infinity, oppure
# 0x / 0o / 0b SENZA segno. Niente «_» fra le cifre, niente «inf»/«nan»:
# float() di Python li accetta, Number() no.
_JS_DEC = re.compile(r'[+-]?(?:Infinity|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)\Z')
_JS_BASE = {'x': (16, re.compile(r'[0-9a-fA-F]+\Z')), 'o': (8, re.compile(r'[0-7]+\Z')),
            'b': (2, re.compile(r'[01]+\Z'))}
_CIFRE = re.compile(r'[0-9]+')   # /\d+/ di JavaScript: solo cifre ASCII


def _js_num_str(x):
    """String(numero) di JavaScript (Number::toString): stesse cifre del
    repr di Python (entrambi il più corto che torna indietro), diverso il
    modo di scriverle (JS passa all'esponente solo sotto 1e-6 e da 1e21)."""
    if math.isnan(x):
        return 'NaN'
    if math.isinf(x):
        return 'Infinity' if x > 0 else '-Infinity'
    if x == 0:
        return '0'
    segno = '-' if x < 0 else ''
    mant, _, esp = repr(abs(x)).partition('e')
    intera, _, frazione = mant.partition('.')
    cifre = (intera + frazione).lstrip('0')
    tagliate = len((intera + frazione)) - len((intera + frazione).lstrip('0'))
    # n = posizione della virgola rispetto alla prima cifra significativa
    n = len(intera) - tagliate + (int(esp) if esp else 0)
    cifre = cifre.rstrip('0') or '0'
    k = len(cifre)
    if k <= n <= 21:
        return segno + cifre + '0' * (n - k)
    if 0 < n <= 21:
        return segno + cifre[:n] + '.' + cifre[n:]
    if -6 < n <= 0:
        return segno + '0.' + '0' * (-n) + cifre
    e = n - 1
    corpo = cifre[0] + ('.' + cifre[1:] if k > 1 else '')
    return segno + corpo + 'e' + ('+' if e >= 0 else '-') + str(abs(e))


def _js_str(v):
    """String(v) di JavaScript per ciò che un JSON può portare."""
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        return str(v) if abs(v) < 10 ** 21 else _js_num_str(float(v))
    if isinstance(v, float):
        return _js_num_str(v)
    if isinstance(v, (list, tuple)):
        return ','.join('' if x is None else _js_str(x) for x in v)
    if isinstance(v, dict):
        return '[object Object]'
    return str(v)


def _js_number(s):
    """Number(s) di JavaScript su una stringa già passata da trim()."""
    if s == '':
        return 0.0
    if _JS_DEC.match(s):
        return float(s)
    if len(s) > 2 and s[0] == '0' and s[1].lower() in _JS_BASE:
        base, cifre = _JS_BASE[s[1].lower()]
        if cifre.match(s[2:]):
            return float(int(s[2:], base))
    return float('nan')


# ── la regola ────────────────────────────────────────────────────────────
def bedrooms_of(d):
    """Le camere da letto con la regola di FACTS.bedroomsOf, o None."""
    if not isinstance(d, dict):
        d = {}
    b = d.get('bedrooms')
    if b is not None:
        if isinstance(b, (int, float)) and not isinstance(b, bool):
            n = float(b)
        else:
            t = _js_str(b).strip(_JS_WS)
            n = _js_number(t) if t != '' else None
        if n is not None and math.isfinite(n) and n.is_integer() and 0 <= n <= 10:
            return int(n)
    beds = d.get('beds')
    m = _CIFRE.search('' if beds is None else _js_str(beds))
    if m:
        k = int(m.group(0))
        if 1 <= k <= 10:
            return k
    return None


def voce(n):
    """La voce della riga «zona · m² · camere»: 'Studio' per 0, '' se ignote."""
    return 'Studio' if n == 0 else (f'{n} bed' if n else '')


# ── la parità con la regola vera ─────────────────────────────────────────
_QUI = os.path.dirname(os.path.abspath(__file__))
_RADICE = os.path.dirname(_QUI)

CASI_LIMITE = [
    None, 0, '', 'abc', [], {}, {'bedrooms': 0}, {'bedrooms': '0'}, {'bedrooms': 0, 'beds': '3'},
    {'bedrooms': '', 'beds': '2 BR'}, {'bedrooms': None, 'beds': 'Studio'}, {'bedrooms': 11, 'beds': '2'},
    {'bedrooms': -1}, {'bedrooms': 1.5, 'beds': '1BR + Loft'}, {'bedrooms': ' 3 '}, {'bedrooms': True, 'beds': '4'},
    {'bedrooms': False, 'beds': '2'}, {'bedrooms': 'abc'}, {'bedrooms': 'due', 'beds': '3'},
    {'beds': 'Living , 1 bedroom with balcony , 1 bedroom'}, {'beds': '0'}, {'beds': '12'}, {'beds': 3},
    {'bedrooms': 10}, {'bedrooms': '10'}, {'beds': '10 bedrooms'}, {'bedrooms': 3.0}, {'bedrooms': '3.0'},
    {'bedrooms': '3.'}, {'bedrooms': '.5', 'beds': '2'}, {'bedrooms': '+3'}, {'bedrooms': '-0'},
    {'bedrooms': '1e1'}, {'bedrooms': '1E0'}, {'bedrooms': '0x5'}, {'bedrooms': '0X0a'}, {'bedrooms': '0b11'},
    {'bedrooms': '0o7'}, {'bedrooms': '-0x5', 'beds': '2'}, {'bedrooms': '1_0', 'beds': '2'},
    {'bedrooms': 'Infinity', 'beds': '4'}, {'bedrooms': 'inf', 'beds': '4'}, {'bedrooms': 'nan', 'beds': '4'},
    {'bedrooms': '\xa03\xa0'}, {'bedrooms': '\ufeff3'}, {'bedrooms': '\x1c3', 'beds': '2'},
    {'bedrooms': '\u2028 2 \u3000'}, {'bedrooms': '٣', 'beds': '2'}, {'beds': '٣'}, {'beds': '٣ 2'},
    {'bedrooms': [2]}, {'bedrooms': [1, 2], 'beds': '2'}, {'bedrooms': [[3]]}, {'bedrooms': [None]},
    {'bedrooms': [None], 'beds': '4'}, {'bedrooms': {}, 'beds': '2'}, {'bedrooms': [True]},
    {'beds': True}, {'beds': ['2 bed']}, {'beds': {'n': 2}}, {'beds': 2.5}, {'beds': 0.5},
    {'beds': 0.000001}, {'beds': 0.0000001}, {'beds': 0.00001}, {'beds': 1e21}, {'beds': 1e-7},
    {'beds': 10 ** 30}, {'beds': 123456789012345680000}, {'beds': -3}, {'beds': '−3'},
]


def _fotografie():
    """I documenti veri delle fotografie dei builder."""
    out = []
    for rel in ('pages-deco/case-full.json', 'home-live-deco/live-rows.json'):
        p = os.path.join(_QUI, rel)
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                out.extend(json.load(f))
    return out


def parita(nodo=None):
    """(diff, n) con la regola vera chiesta a Node; None se Node non c'è."""
    nodo = nodo or os.environ.get('BOOM_NODE') or shutil.which('node')
    if not nodo:
        return None
    casi = _fotografie() + CASI_LIMITE
    # le righe delle fotografie anche nella forma REST (integerValue = stringa)
    casi += [{'bedrooms': None if r.get('bedrooms') is None else str(r.get('bedrooms')),
              'beds': None if r.get('beds') is None else str(r.get('beds'))}
             for r in _fotografie() if isinstance(r, dict)]
    js = ('const F = require(' + json.dumps(os.path.join(_RADICE, 'js', 'listing-facts.js')) + ');'
          'let s = ""; process.stdin.on("data", (c) => { s += c; });'
          'process.stdin.on("end", () => { console.log(JSON.stringify(JSON.parse(s).map((x) => F.bedroomsOf(x)))); });')
    try:
        r = subprocess.run([nodo, '-e', js], input=json.dumps(casi), capture_output=True,
                           text=True, timeout=60)
    except (OSError, subprocess.SubprocessError) as e:
        raise RuntimeError('Node non risponde: ' + str(e)[:200])
    if r.returncode != 0:
        raise RuntimeError('Node ha fallito: ' + r.stderr.strip()[:400])
    attesi = json.loads(r.stdout.strip().splitlines()[-1])
    diff = [(c, bedrooms_of(c), a) for c, a in zip(casi, attesi) if bedrooms_of(c) != a]
    return diff, len(casi)


if __name__ == '__main__':
    try:
        esito = parita()
    except RuntimeError as e:
        print('FAIL parità con FACTS.bedroomsOf — ' + str(e))
        sys.exit(1)
    if esito is None:
        print('SALTATA la parità con FACTS.bedroomsOf: Node non c\'è (BOOM_NODE o node nel PATH)')
        sys.exit(0)
    diff, n = esito
    if diff:
        print(f'FAIL bedrooms_of != FACTS.bedroomsOf su {len(diff)} casi di {n}:')
        for c, py, js in diff[:12]:
            print('   ', json.dumps(c, ensure_ascii=False)[:120], '→ python', py, '· node', js)
        sys.exit(1)
    print(f'PASS bedrooms_of == FACTS.bedroomsOf su {n} casi (fotografie dei builder, forma REST, casi limite)')
    sys.exit(0)
