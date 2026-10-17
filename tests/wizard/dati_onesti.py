#!/usr/bin/env python3
"""tests/wizard/dati_onesti.py — il bot non scrive ciò che nessuno ha detto.

Dal 15/10/2026 vetrina, scheda, feed, Pubblicista e motori di risposta leggono
le camere con UNA regola (FACTS.bedroomsOf, js/listing-facts.js) e la macchina
delle descrizioni dice l'arredo solo se è dichiarato. Con queste regole un
default del bot diventa un falso pubblico: 'furnished':'no' → «unfurnished»,
'beds':0 → «monolocale», 'availableDate':'Subito' → «Available now», i POSTI
LETTO del passo 6 → le CAMERE. Qui si guidano le funzioni VERE del bot —
estratte dall'AST come in local_brain.py, handler Telegram compresi, con
oggetti finti — senza .env, senza Telegram, senza rete. Dove serve si chiede
a Node la regola gemella (bedroomsOf, isBoilerplate, Date.parse): senza Node
quei confronti si saltano e lo si dice.

Esegui: python3 tests/wizard/dati_onesti.py
(BOOM_WIZARD_BOT=<file> per provare una copia mutata del bot.)
"""
import ast
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import types
import unicodedata
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BOT = os.environ.get('BOOM_WIZARD_BOT') or os.path.join(ROOT, 'bot', 'boom_listing_wizard.py')
SRC = open(BOT, encoding='utf-8').read()
tree = ast.parse(SRC)

WANTED = {
    '_now_iso', '_bedrooms_of', '_bedrooms_label', '_template_description', '_describe_payload',
    '_accept_ai_copy', '_street_of', '_listing_name', '_fold', '_unsaid_fields', '_it_eur',
    '_create_summary', '_drop_unsaid', '_nl_listing_fields', '_listing_doc', 'summary_text',
    '_share_kit', '_coerce', 'make_keyboard', 'progress_bar',
    # il cervello gratis (local_brain.py) per i gemelli della regex
    '_local_interpret', '_match_listing', '_is_question', '_num', '_it_date', '_parse_money',
    '_smells_like_new', '_create_invents', '_pending_put', '_pending_pop',
    # gli handler, guidati con oggetti finti
    'floor_cb', 'beds_cb', 'description_cb', 'nl_confirm_cb', 'cmd_modifica',
}
WANTED_ASSIGN = {
    'BEDS_OPTIONS', 'BATHROOMS_OPTIONS', 'FEAT_LABELS_EN', 'FURN_EN', '_STREET_TAIL', '_STREET_CIVIC',
    '_STREET_PREFIX', '_STREET_ARTICLE', '_SMALL_WORDS', '_BED_NAME', '_SAID', '_SAID_LABEL',
    'EDIT_FIELDS', '_FURN', '_STATUS', 'NUM_WORDS', 'NL_STOPWORDS', 'QUESTION_RE', 'MONTHS_IT',
    'ORDINALS_IT', 'NL_STATS', 'TYPE_WORDS_RE',
}

def _is_wanted(n):
    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return n.name in WANTED
    if isinstance(n, ast.Assign):
        return any(getattr(t, 'id', None) in WANTED_ASSIGN for t in n.targets)
    if isinstance(n, ast.Assign) or isinstance(n, ast.AnnAssign):
        return False
    return False

picked = [n for n in tree.body if _is_wanted(n)]
found = {n.name for n in picked if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
missing = WANTED - found
if missing:
    print('FAIL — funzioni non trovate nel bot:', ', '.join(sorted(missing)))
    sys.exit(1)
# lo stato della conversazione (ZONE … CONFIRM) è una tupla assegnata in blocco
STATES = next(n for n in tree.body if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Tuple)
              and any(getattr(e, 'id', None) == 'BEDS' for e in n.targets[0].elts))
picked.insert(0, STATES)


class _Btn:
    def __init__(self, text, callback_data=None, url=None):
        self.text, self.callback_data, self.url = text, callback_data, url


class _Markup:
    def __init__(self, rows):
        self.rows = rows


mod = types.ModuleType('wizard')
mod.__dict__.update({
    're': re, 'json': json, 'datetime': datetime, 'timezone': timezone, 'unicodedata': unicodedata,
    'asyncio': asyncio, 'os': os,
    'logger': types.SimpleNamespace(warning=lambda *a: None, info=lambda *a: None, error=lambda *a: None),
    'InlineKeyboardButton': _Btn, 'InlineKeyboardMarkup': _Markup,
    'SITE_URL': 'https://www.boomrome.com', 'ADMIN_CHAT_ID': 1,
    'is_admin': lambda update: True,
    'ConversationHandler': types.SimpleNamespace(END=-1),
})
exec(compile(ast.Module(body=picked, type_ignores=[]), BOT, 'exec'), mod.__dict__)
M = mod.__dict__

fails = 0
def ok(name, cond, detail=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' — ' + str(detail)))
    if not cond:
        fails += 1

NODE = shutil.which('node')
def node(js):
    """Esegue JS nella radice del repo; None se Node non c'è o fallisce."""
    if not NODE:
        return None
    try:
        out = subprocess.run([NODE, '--input-type=module', '-e', js], cwd=ROOT, capture_output=True,
                             text=True, timeout=60)
        if out.returncode != 0:
            print('   (node stderr) ' + out.stderr.strip()[:400])
            return None
        return json.loads(out.stdout.strip().splitlines()[-1])
    except Exception as e:
        print('   (node) ' + str(e)[:200])
        return None


# ── oggetti finti per gli handler ───────────────────────────────────────────
class FakeQuery:
    def __init__(self, data, chat_id=1):
        self.data = data
        self.texts = []
        self.markups = []
        self.message = types.SimpleNamespace(chat=types.SimpleNamespace(id=chat_id))
    async def answer(self):
        return None
    async def edit_message_text(self, text, parse_mode=None, reply_markup=None):
        self.texts.append(text)
        self.markups.append(reply_markup)


class FakeMessage:
    def __init__(self):
        self.replies = []
    async def reply_text(self, text, parse_mode=None, reply_markup=None, **kw):
        self.replies.append(text)


def update_with(query=None, message=None):
    return types.SimpleNamespace(callback_query=query, message=message,
                                 effective_chat=types.SimpleNamespace(id=1))


def ctx(user_data=None, args=None):
    return types.SimpleNamespace(user_data=user_data if user_data is not None else {}, args=args or [],
                                 bot=types.SimpleNamespace())


def run(coro):
    return asyncio.run(coro)


def labels(markup):
    return [b.text for row in (markup.rows if markup else []) for b in row]


# ── 1. il passo 6 chiede le CAMERE, e il monolocale lo dice il tipo ─────────
opts = [lbl for lbl, _ in M['BEDS_OPTIONS']]
ok('passo 6: le opzioni sono camere, non posti letto',
   all('camer' in o for o in opts) and not any('lett' in o.lower() or '+' in o for o in opts), opts)
ok('passo 6: nessuna opzione 0 (il monolocale lo dice il tipo)', all(v != '0' for _, v in M['BEDS_OPTIONS']))

q = FakeQuery('fl_2'); c = ctx({'type': 'bilocale'})
st = run(M['floor_cb'](update_with(q), c))
ok('bilocale: la domanda è «Camere da letto?»', 'Camere da letto?' in q.texts[-1] and 'Posti letto' not in q.texts[-1], q.texts)
ok('bilocale: si resta sul passo delle camere', st == M['BEDS'])
ok('bilocale: la tastiera è quella delle camere', labels(q.markups[-1]) == opts, labels(q.markups[-1]))

q = FakeQuery('fl_1'); c = ctx({'type': 'monolocale'})
st = run(M['floor_cb'](update_with(q), c))
ok('monolocale: niente domanda, 0 camere scritte nei due gemelli',
   c.user_data.get('bedrooms') == 0 and c.user_data.get('beds') == 0, c.user_data)
ok('monolocale: si passa ai bagni', st == M['BATHROOMS'] and 'Bagni?' in q.texts[-1], q.texts)

q = FakeQuery('bed_2'); c = ctx({'type': 'trilocale'})
st = run(M['beds_cb'](update_with(q), c))
ok('la risposta va in bedrooms E in beds (gemelli)', c.user_data.get('bedrooms') == 2 and c.user_data.get('beds') == 2, c.user_data)
ok('la conferma dice «2 camere», non «2 letti»', '2 camere' in q.texts[-1] and 'letti' not in q.texts[-1], q.texts)
ok('dopo le camere si chiedono i bagni', st == M['BATHROOMS'])

# il percorso guidato intero, dal dato al documento pubblicato
guided = {'type': 'trilocale', 'zone': 'Prati', 'address': 'Via Quirino Visconti 60', 'sqm': 80, 'floor': '3',
          'bedrooms': 2, 'beds': 2, 'bathrooms': 1, 'price': 1500, 'furnished': 'yes',
          'availableDate': '2026-11-01', 'concordato': 'tbd', 'features': ['ac'], 'description': 'x'}
guided['name'] = M['_listing_name'](guided)
doc = M['_listing_doc'](guided, ['https://img/1.jpg'], M['_now_iso']())
ok('guidato: il documento porta 2 camere nei due campi', doc.get('bedrooms') == 2 and doc.get('beds') == 2, doc)
ok('guidato: il nome viene dalla via', doc.get('name') == 'Quirino Visconti Two-Bed', doc.get('name'))

# ── 2. la regex gratuita scrive i gemelli ───────────────────────────────────
CAT = [('l1', {'name': 'Trilocale Pigneto', 'zone': 'Pigneto', 'address': 'Via del Pigneto 42',
               'price': 1400, 'status': 'available', 'createdAt': '2026-07-01T10:00:00'}),
       ('l2', {'name': 'Bilocale Levico', 'zone': 'Trieste', 'address': 'Via Levico 8',
               'price': 1100, 'status': 'available', 'createdAt': '2026-07-20T10:00:00'})]
M['fs_query_available'] = lambda c: CAT
M['_count_leads'] = lambda i: 0
for msg, n in [('metti 3 camere a Pigneto', 3), ('Levico ha due camere', 2)]:
    p = M['_local_interpret'](msg, '', CAT)
    u = (p or {}).get('updates') or {}
    ok(f'«{msg}» → beds e bedrooms = {n}', u.get('beds') == n and u.get('bedrooms') == n, p)

# /modifica: «camere» come alias, e un numero di camere vero
written = []
M['_edit_listing'] = lambda doc_id, updates: written.append((doc_id, dict(updates)))
m = FakeMessage()
run(M['cmd_modifica'](update_with(message=m), ctx(args=['l1', 'camere', '2'])))
ok('/modifica camere 2 → beds e bedrooms', written and written[-1] == ('l1', {'beds': 2, 'bedrooms': 2}), written)
written.clear(); m = FakeMessage()
run(M['cmd_modifica'](update_with(message=m), ctx(args=['l1', 'letti', '12'])))
ok('/modifica letti 12 → rifiutato, niente scritto', not written and m.replies and '❌' in m.replies[-1], (written, m.replies))
written.clear(); m = FakeMessage()
run(M['cmd_modifica'](update_with(message=m), ctx(args=['l1', 'camere', '0'])))
ok('/modifica camere 0 → monolocale scritto', written and written[-1][1] == {'beds': 0, 'bedrooms': 0}, written)

# ── 3. la casa dettata: un campo non detto non si scrive ───────────────────
F = {'type': 'bilocale', 'zone': 'Prati', 'price': 1300, 'sqm': 60}
d = M['_nl_listing_fields'](F)
doc = M['_listing_doc'](d, [], M['_now_iso']())
for k in ('furnished', 'availableDate', 'beds', 'bedrooms', 'address', 'bathrooms', 'floor'):
    ok(f'dettata senza «{k}» → la chiave non c\'è', k not in doc, doc.get(k))
ok('dettata: prezzo e metri ci sono', doc.get('price') == 1300 and doc.get('sqm') == 60 and doc.get('size') == 60, doc)
ok('dettata senza via: il nome viene dalla zona', doc.get('name') == 'Prati Flat', doc.get('name'))

d = M['_nl_listing_fields']({'type': 'monolocale', 'zone': 'Esquilino', 'price': 800, 'sqm': 30})
ok('monolocale dettato → 0 camere (lo dice il tipo)', d.get('bedrooms') == 0 and d.get('beds') == 0, d)
d = M['_nl_listing_fields']({'type': 'trilocale', 'zone': 'Pigneto', 'price': 1300, 'sqm': 80, 'beds': 2,
                             'furnished': 'partial', 'availableDate': '2026-12-01', 'address': 'Via del Pigneto 3'})
doc = M['_listing_doc'](d, [], M['_now_iso']())
ok('dettata con camere/arredo/data → scritti come detti',
   doc.get('bedrooms') == 2 and doc.get('furnished') == 'partial' and doc.get('availableDate') == '2026-12-01', doc)
ok('dettata con via → nome «Pigneto Two-Bed»', doc.get('name') == 'Pigneto Two-Bed', doc.get('name'))

text = 'bilocale a Prati 60mq 1300 euro'
fields = {'type': 'bilocale', 'zone': 'Prati', 'price': 1300, 'sqm': 60, 'beds': 1, 'furnished': 'no',
          'availableDate': 'Subito', 'address': 'Via Cola di Rienzo 10'}
ok('il modello riempie camere/arredo/data/via non dette → tutte segnalate',
   sorted(M['_unsaid_fields'](text, fields)) == ['address', 'availableDate', 'beds', 'furnished'],
   M['_unsaid_fields'](text, fields))
said = ('trilocale in via Endertà 9, Prati, 80mq, due camere da letto, arredato, '
        'libero dal 1 dicembre, 1500 euro')
ok('tutto detto (anche «Endertà» con l\'accento) → niente da togliere',
   M['_unsaid_fields'](said, {'beds': 2, 'furnished': 'yes', 'availableDate': '2026-12-01',
                              'address': 'Via Enderta 9'}) == [], M['_unsaid_fields'](said, {'address': 'Via Enderta 9'}))
ok('«posti letto» non è una camera',
   M['_unsaid_fields']('bilocale a Prati 60mq 1300 euro, 3 posti letto', {'beds': 3}) == ['beds'])
ok('una frase in inglese con «bedrooms» vale', M['_unsaid_fields']('flat in Prati, 2 bedrooms, 1300', {'beds': 2}) == [])

plan = {'action': 'create', 'fields': dict(fields),
        'summary': ['bilocale — Prati, Via Cola di Rienzo 10', '€1.300/mese', '60mq · 1 camere',
                    'non arredato · da Subito']}
gone = M['_drop_unsaid'](text, plan)
ok('_drop_unsaid dice cosa ha tolto', sorted(gone) == sorted(['camere', 'arredamento', 'disponibilità', 'indirizzo']), gone)
ok('la card rifatta non mostra più ciò che non verrà scritto',
   not any(x in ' '.join(plan['summary']) for x in ('camere', 'arredato', 'Subito', 'Cola di Rienzo')), plan['summary'])
ok('la card rifatta tiene prezzo e metri', '€1.300/mese' in plan['summary'] and any('60mq' in r for r in plan['summary']),
   plan['summary'])

# nl_confirm_cb pubblica i campi detti, non i default di una volta
published = []
async def fake_publish(context, d, photo_ids):
    published.append(dict(d))
    return 'newid'
M['_do_publish'] = fake_publish
M['PENDING_NL'] = {}
M['PENDING_PHOTOS'] = {}
create_plan = {'action': 'create', 'fields': {'type': 'bilocale', 'zone': 'Prati', 'price': 1300, 'sqm': 60},
               '_photos': []}
M['_pending_put'](M['PENDING_NL'], 1, create_plan, 'tok1')
q = FakeQuery('nl_ok:tok1')
run(M['nl_confirm_cb'](update_with(q), ctx()))
pd = published[-1] if published else {}
ok('nl_confirm_cb: niente arredo/data/camere inventati',
   published and not any(k in pd for k in ('furnished', 'availableDate', 'beds', 'bedrooms')), pd)
ok('nl_confirm_cb: niente «Subito», niente «no»', 'Subito' not in pd.values() and 'no' not in pd.values(), pd)

# il percorso della card: la pulizia avviene PRIMA che il piano si conservi
nl = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == '_nl_process')
nl_src = ast.get_source_segment(SRC, nl) or ''
i_drop = nl_src.find('_drop_unsaid(text, plan)')
i_put = nl_src.find('_pending_put(PENDING_NL, chat_id, plan, tok)', max(0, nl_src.find("plan.get('action') == 'create'")))
ok('_nl_process: _drop_unsaid prima di conservare il piano della casa nuova', 0 <= i_drop < i_put, (i_drop, i_put))

# ── 4. la copia AI si timbra come testo della macchina ──────────────────────
d = {}
acc = M['_accept_ai_copy'](d, {'ok': True, 'en': ' A lovely flat. ', 'it': ' Una bella casa. ', 'aiHash': 'abc123', 'issues': []})
ok('copia pulita accettata', acc and d.get('description') == 'A lovely flat.' and d.get('descriptionIt') == 'Una bella casa.', d)
ok('timbro: descriptionSource ai + impronta + data', d.get('descriptionSource') == 'ai' and d.get('descriptionAiHash') == 'abc123'
   and re.match(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$', d.get('descriptionAt', '')), d)
doc = M['_listing_doc'](dict(d, name='X'), [], M['_now_iso']())
ok('il timbro arriva nel documento pubblicato',
   doc.get('descriptionSource') == 'ai' and doc.get('descriptionAiHash') == 'abc123' and doc.get('descriptionAt'), doc)
for label, ai in [('con problemi', {'ok': True, 'en': 'Text €1,500/month', 'it': '', 'issues': ['price_in_text']}),
                  ('senza testo', {'ok': True, 'en': '', 'it': '', 'issues': ['broke_rules']}),
                  ('JSON grezzo come testo', {'ok': True, 'en': {'en': 'x'}}),
                  ('errore', {'ok': False, 'error': 'ai_failed'}), ('niente risposta', None)]:
    d = {}
    ok(f'copia {label} → rifiutata, nessun timbro', not M['_accept_ai_copy'](d, ai) and d == {}, d)

# description_cb: il percorso guidato, col server finto
calls = []
def fake_post(path, body, *a, **k):
    calls.append((path, body))
    return replies.pop(0)
M['wizard_post'] = fake_post
base = {'type': 'bilocale', 'zone': 'Prati', 'sqm': 60, 'floor': '2', 'bedrooms': 1, 'beds': 1, 'bathrooms': 1,
        'price': 1300, 'features': ['ac', 'washing_machine'], 'concordato': 'tbd'}
replies = [{'ok': True, 'en': 'Bright flat.', 'it': 'Casa luminosa.', 'aiHash': 'h1', 'issues': []}]
c = ctx(dict(base)); q = FakeQuery('desc_auto')
run(M['description_cb'](update_with(q), c))
ok('description_cb: manda le camere strutturate al server', calls and calls[-1][1].get('bedrooms') == 1, calls[-1][1] if calls else None)
ok('description_cb: copia accettata e timbrata', c.user_data.get('description') == 'Bright flat.'
   and c.user_data.get('descriptionSource') == 'ai' and c.user_data.get('descriptionAiHash') == 'h1', c.user_data)
replies = [{'ok': True, 'en': 'Lovely flat, €1,300/month, free 1 month.', 'it': 'x', 'aiHash': 'h2', 'issues': ['price_in_text']}]
c = ctx(dict(base)); q = FakeQuery('desc_auto')
run(M['description_cb'](update_with(q), c))
ok('description_cb: copia con problemi → il testo di riserva, senza timbro AI',
   c.user_data.get('description', '').startswith('Beautiful') and 'descriptionSource' not in c.user_data, c.user_data)
ok('description_cb: lo dice all\'operatore', any('controlli' in t for t in q.texts), q.texts)

# ── 5. il testo di riserva: solo fatti dichiarati ───────────────────────────
t = M['_template_description']({'type': 'bilocale', 'zone': 'Prati', 'sqm': 60, 'floor': '2', 'bedrooms': 2,
                                'beds': '3 letti', 'bathrooms': 1, 'price': 1300, 'features': ['ac']})
ok('template: niente canone', '€' not in t and '1,300' not in t and '1300' not in t and 'month' not in t, t)
ok('template: niente arredo se non dichiarato', 'furnished' not in t, t)
ok('template: camere da bedrooms, mai dai «letti»', '2 bedrooms' in t and '3' not in t and 'beds' not in t, t)
ok('template: feature con l\'etichetta umana', 'air conditioning' in t and 'ac,' not in t, t)
t2 = M['_template_description']({'type': 'monolocale', 'zone': 'Monti', 'sqm': 30, 'floor': '1', 'bedrooms': 0,
                                 'bathrooms': 1, 'furnished': 'yes'})
ok('template: monolocale → «Studio, no separate bedroom»; arredo dichiarato detto',
   'Studio, no separate bedroom' in t2 and 'fully furnished' in t2, t2)
t3 = M['_template_description']({'type': 'bilocale', 'zone': 'Prati', 'sqm': 60, 'floor': '2', 'bathrooms': 1})
ok('template: camere ignote → non si dicono', 'bedroom' not in t3.lower() and 'studio' not in t3.lower(), t3)
bp = node('import { isBoilerplate } from "./api/wizard/describe.js";'
          f'console.log(JSON.stringify([{json.dumps(t)}, {json.dumps(t2)}, {json.dumps(t3)}].map(isBoilerplate)))')
if bp is None:
    print('SKIP isBoilerplate (Node assente o describe.js non importabile)')
else:
    ok('template riconosciuto da isBoilerplate (lo sweep notturno lo riscrive)', bp == [True, True, True], bp)

# ── 6. durata: il bot non propone soggiorni da un mese ─────────────────────
lease_month = re.findall(r'(?i)(?:durata|soggiorn\w*|affitt\w*|contratt\w*|stay|lease)\W+(?:\w+\W+){0,3}(?:1|un|one)\s+(?:mese|month)', SRC)
ok('nessuna durata da 1 mese proposta dal bot', not lease_month, lease_month)

# ── 7. _bedrooms_of è la gemella di FACTS.bedroomsOf ────────────────────────
CASES = [
    {}, {'bedrooms': 2}, {'bedrooms': '2'}, {'bedrooms': 0}, {'bedrooms': '0', 'beds': '3 letti'},
    {'bedrooms': None, 'beds': '2 camere'}, {'bedrooms': '', 'beds': '1 double bed'}, {'beds': '0'},
    {'beds': 'Living, 1 double'}, {'bedrooms': 11, 'beds': '2'}, {'bedrooms': 2.5, 'beds': '1'},
    {'bedrooms': 'due', 'beds': '3'}, {'bedrooms': ' 3 '}, {'bedrooms': True}, {'beds': True},
    {'beds': 4}, {'beds': 12}, {'bedrooms': -1, 'beds': '2'}, {'bedrooms': '1e1'}, {'beds': 'sofa bed'},
]
py = [M['_bedrooms_of'](x) for x in CASES]
js = node('import { createRequire } from "module"; const require = createRequire(import.meta.url);'
          'const F = require("./js/listing-facts.js");'
          f'console.log(JSON.stringify({json.dumps(CASES)}.map(x => F.bedroomsOf(x))))')
if js is None:
    print('SKIP parità con FACTS.bedroomsOf (Node assente)')
else:
    diff = [(c, p, j) for c, p, j in zip(CASES, py, js) if p != j]
    ok(f'_bedrooms_of == FACTS.bedroomsOf su {len(CASES)} casi', not diff, diff)

# ── 8. le date che il bot scrive, JavaScript le legge ───────────────────────
now = M['_now_iso']()
ok('_now_iso: ISO con millisecondi e Z, una volta sola', re.match(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$', now), now)
parsed = node(f'console.log(JSON.stringify([Date.parse({json.dumps(now)}), Date.parse("2026-09-23T17:57:23.165671+00:00Z")]))')
if parsed is None:
    print('SKIP Date.parse (Node assente)')
else:
    ok('Date.parse legge la data nuova (e non leggeva quella vecchia)', isinstance(parsed[0], (int, float)) and parsed[1] is None, parsed)
bad = []
for n in ast.walk(tree):
    if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Add) and isinstance(n.right, ast.Constant) \
            and n.right.value == 'Z' and isinstance(n.left, ast.Call) \
            and getattr(n.left.func, 'attr', None) == 'isoformat':
        bad.append(n.lineno)
ok('nessun isoformat() + "Z" rimasto nel codice del bot', not bad, bad)

# ── 9. il nome dalla via, come il catalogo curato ───────────────────────────
NAMES = [
    ({'address': 'Via dei Cappellari 4'}, 'Cappellari Flat'),
    ({'address': 'Via del Corso 75', 'bedrooms': 1}, 'Corso One-Bed'),
    ({'address': 'Via degli Avignonesi 16', 'bedrooms': 0}, 'Avignonesi Studio'),
    ({'address': 'Via di S. Anna 16', 'bedrooms': 1}, "Sant'Anna One-Bed"),
    ({'address': 'Via di Tor di Quinto 39', 'bedrooms': 1}, 'Tor di Quinto One-Bed'),
    ({'address': 'Piazzale Prenestino 42', 'bedrooms': 2}, 'Prenestino Two-Bed'),
    ({'address': 'via del pigneto 3, Roma', 'bedrooms': 2}, 'Pigneto Two-Bed'),
    ({'address': 'Viale 21 Aprile 33', 'bedrooms': 3}, '21 Aprile Three-Bed'),
    ({'address': 'Via in Piscinula', 'bedrooms': 1}, 'Piscinula One-Bed'),
    ({'address': "Via d'Azeglio 5 int. 4", 'bedrooms': 2}, 'Azeglio Two-Bed'),
    ({'address': 'Via Calabria 29 - Roma', 'bedrooms': 2}, 'Calabria Two-Bed'),
    ({'zone': 'Prati'}, 'Prati Flat'),
    ({}, 'Rome Flat'),
    ({'address': '42', 'zone': 'Monti', 'bedrooms': 7}, 'Monti 7-Bed'),
]
for d, want in NAMES:
    got = M['_listing_name'](d)
    ok(f'nome: {d} → «{want}»', got == want, got)
cur = node('import { createRequire } from "module"; const require = createRequire(import.meta.url);'
           'const C = require("./js/catalogo-correzioni.js");'
           'console.log(JSON.stringify(Object.values(C.LISTINGS).map(x => [x.address || "", x.name || ""])))')
if cur is None:
    print('SKIP confronto col catalogo curato (Node assente)')
else:
    def words(s):
        return set(re.findall(r'[a-z]{4,}', M['_fold'](s)))
    off = [(a, n, M['_street_of'](a)) for a, n in cur if a and not (words(M['_street_of'](a)) & words(n))]
    ok(f'la via del bot è nel nome curato di tutte le {len(cur)} case del catalogo', not off, off)

# ── 10. le card dell'operatore ──────────────────────────────────────────────
kit = M['_share_kit']({'name': 'Avignonesi Studio', 'zone': 'Centro', 'sqm': 30, 'bedrooms': 0, 'beds': 0}, 'https://x')
ok('kit: monolocale a parole, niente «0 camere», niente «€0»', 'monolocale' in kit and '0 camere' not in kit and '€0' not in kit, kit)
kit = M['_share_kit']({'name': 'Corso One-Bed', 'zone': 'Centro', 'beds': '3 letti', 'bedrooms': 1, 'price': 1500}, 'https://x')
ok('kit: le camere dalla regola unica', '1 camera' in kit and '3 camere' not in kit and '€1,500/mese' in kit, kit)
s = M['summary_text']({'name': 'X', 'price': 1000, 'bedrooms': 2, 'beds': 2, 'bathrooms': 1, 'type': 'trilocale'})
ok('riepilogo: «2 camere», e senza data «da concordare» (mai «Subito»)',
   '2 camere' in s and 'da concordare' in s and 'Subito' not in s, s)

print()
if fails:
    print(f'{fails} FALLITI.')
    sys.exit(1)
print('Tutto verde.')
