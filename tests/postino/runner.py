#!/usr/bin/env python3
"""tests/postino/runner.py — IL POSTINO sul Mac, la logica pura senza rete.

Il Postino consegna su WhatsApp il TESTO APPROVATO di un altro — il posto
peggiore dove sbagliare quoting o mandare due volte. Le mutazioni che
contano:
  - il testo del cliente resta UN argomento argv qualunque cosa contenga
    (apici, $, backtick, a-capo): mai una stringa in shell;
  - un template senza {text} o senza destinatario è un errore DETTO,
    mai un invio a vuoto;
  - il registro anti-doppio si scrive PRIMA dell'invio e un id già annotato
    non si rimanda MAI (un doppio messaggio allo stesso cliente è il
    peggior esito possibile).

python3 tests/postino/runner.py
"""

import importlib.util
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(HERE, '..', '..', 'bot', 'boom_postino.py')

spec = importlib.util.spec_from_file_location('boom_postino', MOD)
po = importlib.util.module_from_spec(spec)
spec.loader.exec_module(po)

passed = failed = 0
bad = []


def check(name, cond):
    global passed, failed
    if cond:
        passed += 1
        print(f'PASS {name}')
    else:
        failed += 1
        bad.append(name)
        print(f'FAIL {name}')


# ── 1. il comando: argv, mai shell ─────────────────────────────────────────
cmd = po.build_cmd('wacli send {digits} {text}', '+393331234567', 'Ciao! Confermo giovedì 😊')
check('template di default: 4 argomenti', len(cmd) == 4)
check('il numero diventa solo cifre in {digits}', cmd[2] == '393331234567')
check('il testo è UN argomento', cmd[3] == 'Ciao! Confermo giovedì 😊')

evil = 'Ok "bene" $(rm -rf ~) `id` \'x\'\ne domani?'
cmd2 = po.build_cmd('wacli send {digits} {text}', '+39333', evil)
check('MUTAZIONE: apici, $(), backtick e a-capo restano DENTRO l\'argomento',
      len(cmd2) == 4 and cmd2[3] == evil)

cmd3 = po.build_cmd('/usr/local/bin/send_whatsapp.sh --to={digits} --message={text}', '+39 333 123', 'ciao')
check('placeholder inline (--message={text}) funzionano', cmd3[2] == '--message=ciao' and cmd3[1] == '--to=39333123')

try:
    po.build_cmd('wacli send {digits}', '+39333', 'ciao')
    check('template senza {text} → errore DETTO', False)
except ValueError:
    check('template senza {text} → errore DETTO', True)
try:
    po.build_cmd('wacli send {text}', '+39333', 'ciao')
    check('template senza destinatario → errore DETTO', False)
except ValueError:
    check('template senza destinatario → errore DETTO', True)

# ── 2. il registro anti-doppio ─────────────────────────────────────────────
tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
po.REGISTRY = tmp.name
ids = po.note_sent([], 'a1')
ids = po.note_sent(ids, 'a2')
check('il registro annota in ordine', ids == ['a1', 'a2'])
check('…e persiste su disco', json.load(open(tmp.name)) == ['a1', 'a2'])
ids = po.note_sent(ids, 'a1')
check('un id ri-annotato non duplica', ids == ['a2', 'a1'])
big = []
for i in range(600):
    big = po.note_sent(big, f'x{i}')
check('il registro resta capato a 500', len(big) == 500 and big[-1] == 'x599' and 'x0' not in big)
with open(tmp.name, 'w') as f:
    f.write('{{{garbage')
check('un registro corrotto non esplode: riparte vuoto', po.load_registry() == [])
os.unlink(tmp.name)

print()
if failed:
    print(f'{failed} FALLITI: ' + ', '.join(bad))
    sys.exit(1)
print(f'Tutto verde ({passed}) — il Postino non riscrive, non raddoppia, non passa da una shell.')
