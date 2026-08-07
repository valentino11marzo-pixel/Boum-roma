#!/usr/bin/env python3
"""tests/wizard/local_brain.py — il cervello gratis del bot wizard.

Ogni messaggio che il locale risolve è un claude-sonnet-5 in meno (con TUTTO
il catalogo nel prompt). Ma un parser che sbaglia è peggio di uno che tace:
una regex che legge "il deposito è 2 mesi?" come un ORDINE cambierebbe il
contratto di un immobile per una domanda. Quindi si testa cosa capisce E
cosa deve rifiutarsi di capire.

Esegui: python3 tests/wizard/local_brain.py
"""
import ast
import os
import re
import sys
import types
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BOT = os.path.join(ROOT, 'bot', 'boom_listing_wizard.py')

# Il bot importa telegram/requests e pretende un .env con i segreti: qui serve
# solo il cervello, quindi si estraggono le funzioni pure dall'AST e si
# eseguono in un modulo finto con le poche dipendenze che usano davvero.
WANTED = {
    '_local_answer', '_local_interpret', '_match_listing', '_is_question',
    '_num', '_it_date', '_parse_money', '_days_since', '_smells_like_new',
}
WANTED_ASSIGN = {
    'NUM_WORDS', 'NL_STOPWORDS', 'QUESTION_RE', 'MONTHS_IT', 'ORDINALS_IT',
    'NL_STATS', 'TYPE_WORDS_RE',
}

tree = ast.parse(open(BOT).read())
picked = [n for n in tree.body
          if (isinstance(n, ast.FunctionDef) and n.name in WANTED)
          or (isinstance(n, ast.Assign) and any(getattr(t, 'id', None) in WANTED_ASSIGN for t in n.targets))]
missing = WANTED - {n.name for n in picked if isinstance(n, ast.FunctionDef)}
if missing:
    print('FAIL — funzioni non trovate nel bot:', ', '.join(sorted(missing)))
    sys.exit(1)

mod = types.ModuleType('brain')
mod.__dict__.update({'re': re, 'datetime': datetime,
                     'logger': types.SimpleNamespace(warning=lambda *a: None, info=lambda *a: None)})
exec(compile(ast.Module(body=picked, type_ignores=[]), BOT, 'exec'), mod.__dict__)

# _count_leads tocca Firestore: qui è un numero finto e deterministico.
mod._count_leads = lambda doc_id: {'l1': 7, 'l2': 0}.get(doc_id, 0)
mod.fs_query_available = lambda c: CATALOG

CATALOG = [
    ('l1', {'name': 'Trilocale Pigneto', 'zone': 'Pigneto', 'address': 'Via del Pigneto 42',
            'price': 1400, 'depositMonths': 1, 'status': 'available', 'sqm': 95,
            'images': ['a', 'b', 'c'], 'videoUrl': 'https://youtu.be/abc',
            'createdAt': '2026-07-01T10:00:00'}),
    ('l2', {'name': 'Bilocale Levico', 'zone': 'Trieste', 'address': 'Via Levico 8',
            'price': 1100, 'status': 'available', 'sqm': 55, 'images': [],
            'createdAt': '2026-07-20T10:00:00'}),
    ('l3', {'name': 'Monolocale Ostiense', 'zone': 'Ostiense', 'address': 'Via Ostiense 210',
            'price': 850, 'depositMonths': 2, 'status': 'available',
            'createdAt': '2026-06-10T10:00:00'}),
]

fails = 0
def ok(name, cond, detail=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' — ' + str(detail)))
    if not cond: fails += 1

def edit(msg):
    return mod._local_interpret(msg, '', CATALOG)

def ask(msg):
    return mod._local_answer(msg, CATALOG)

# ── 1. le modifiche che DEVONO costare zero ─────────────────────────────────
cases = [
    ("metti il deposito a 2 mesi per Pigneto",      'l1', {'depositMonths': 2, 'deposit': 2800}),
    ("deposito tre mesi Ostiense",                  'l3', {'depositMonths': 3, 'deposit': 2550}),
    ("prezzo a 1300 per il Pigneto",                'l1', {'price': 1300}),
    ("aumenta Levico di 100",                       'l2', {'price': 1200}),
    ("abbassa di 50 Ostiense",                      'l3', {'price': 800}),
    ("affittato Levico",                            'l2', {'status': 'rented'}),
    ("Ostiense è tornato libero",                   'l3', {'status': 'available'}),
    ("Levico non arredato",                         'l2', {'furnished': 'no'}),
    ("Pigneto semi arredato",                       'l1', {'furnished': 'partial'}),
    ("Ostiense arredato",                           'l3', {'furnished': 'yes'}),
    ("Levico 60 mq",                                'l2', {'sqm': 60}),
    ("Pigneto due bagni",                           'l1', {'bathrooms': 2}),
    ("Levico piano terra",                          'l2', {'floor': 'Terra'}),
    ("Ostiense piano terzo",                        'l3', {'floor': '3'}),
    ("commissione 900 per Levico",                  'l2', {'agencyFee': 900}),
    ("Pigneto https://youtu.be/nuovo123",           'l1', {'videoUrl': 'https://youtu.be/nuovo123'}),
]
for msg, want_id, want in cases:
    p = edit(msg)
    got = (p or {}).get('updates') or {}
    hit = p and p.get('action') == 'update' and p.get('id') == want_id and all(got.get(k) == v for k, v in want.items())
    ok(f'gratis: "{msg}"', hit, f"{(p or {}).get('action')} id={(p or {}).get('id')} {got}")

# il prezzo che cambia trascina il deposito, come nella console
p = edit("prezzo a 1000 Ostiense")
ok('un prezzo nuovo ricalcola il deposito', p['updates'].get('deposit') == 2000, p['updates'])

# più modifiche nella stessa frase
p = edit("Levico a 1250 e deposito 2 mesi")
ok('due modifiche in una frase', p['updates'].get('price') == 1250 and p['updates'].get('depositMonths') == 2, p['updates'])

# date italiane
p = edit("Pigneto libero dal 1 ottobre")
ok('data italiana → ISO', str(p['updates'].get('availableDate', '')).endswith('-10-01'), p['updates'])
p = edit("Levico disponibile subito")
ok('"subito" resta "Subito"', p['updates'].get('availableDate') == 'Subito', p['updates'])

# ── 2. quello che il locale NON deve toccare (deve salire all'AI) ───────────
refuse = [
    ("metti il deposito a 2 mesi per Levigo",  'refuso nel nome → sale all AI'),
    ("il trilocale di via non so dove",        'nessun aggancio → sale all AI'),
    ("trilocale a Prati, 80mq, 1500 euro, libero subito", 'annuncio NUOVO → sale all AI'),
]
for msg, why in refuse:
    p = edit(msg)
    free = bool(p and p.get('_free'))
    ok(f'{why}: "{msg[:38]}"', not free, p)

# la trappola vera: una DOMANDA non deve diventare un ordine
for q in ["il deposito di Pigneto è 2 mesi?", "Ostiense costa 850?", "Levico è affittato?"]:
    p = edit(q)
    ans = ask(q)
    ok(f'domanda non diventa modifica: "{q}"', ans is not None or not (p or {}).get('_free'),
       f"answer={bool(ans)} plan={(p or {}).get('updates')}")

# ── 3. le domande che DEVONO costare zero ──────────────────────────────────
answers = [
    ("quanto costa Pigneto?",             ['1.400', '1,400']),
    ("che deposito ha Ostiense?",         ['2 mesi']),
    ("quanti interessati ha Pigneto?",    ['7']),
    ("Levico ha interessati?",            ['nessun interessato']),
    ("Pigneto ha il video?",              ['youtu.be']),
    ("Levico ha il video?",               ['nessun video']),
    ("quante foto ha Pigneto?",           ['3 foto']),
    ("quali sono liberi?",                ['3 annunci disponibili']),
    ("quanti annunci ho?",                ['3 annunci disponibili']),
    ("da quanto è sul mercato Ostiense?", ['giorni sul mercato']),
    ("qual è l'indirizzo di Levico?",     ['Via Levico 8']),
]
for q, needles in answers:
    a = ask(q) or ''
    ok(f'risposta gratis: "{q}"', any(n in a for n in needles), repr(a[:90]))

# una frase che non è una domanda non deve essere risposta
ok('un ordine non viene "risposto"', ask("affittato Levico") is None, ask("affittato Levico"))
# un annuncio non riconoscibile non inventa risposte
ok('nessun aggancio → nessuna risposta', ask("quanto costa quella cosa là?") is None)

# ── 3b. la ricerca rovesciata NON deve rubare parole già assegnate ────────
# "interessati" significa GIÀ "chi ha scritto per questa casa" (/interessati).
# Ri-puntare una parola che ha un significato consolidato è il modo più veloce
# per rendere inaffidabile uno strumento: da lì in poi non ti fidi più di
# nessuna risposta. Quindi la ricerca rovesciata risponde SOLO a frasi
# inequivocabili, e questo test pinna il confine da entrambi i lati.
for q, want in [("chi cerca Pigneto?", 'l1'),
                ("chi la cercava, Levico?", 'l2'),
                ("a chi propongo Pigneto?", 'l1'),
                ("chi in archivio vorrebbe Ostiense?", 'l3')]:
    a = ask(q)
    ok(f'ricerca rovesciata: "{q}"', a == f'__WHOWANTS__{want}', a)
for q in ["quanti interessati ha Pigneto?", "quali persone sarebbero interessate a Levico?",
          "quanto costa Pigneto?", "che deposito ha Ostiense?"]:
    a = ask(q) or ''
    ok(f'"interessati" tiene il suo significato: "{q}"', not str(a).startswith('__WHOWANTS__'), a)

# ── 4. il match sugli annunci ──────────────────────────────────────────────
ok('id esatto vince', mod._match_listing('l3', CATALOG)[0] == 'l3')
ok('ambiguità dichiarata, non indovinata', mod._match_listing('quanto costa', CATALOG) in (None,)
   or mod._match_listing('quanto costa', CATALOG)[0] == 'AMBIG')

print('\n' + (f'{fails} FALLITI' if fails else 'Tutto verde.'))
sys.exit(1 if fails else 0)
