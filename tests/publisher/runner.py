#!/usr/bin/env python3
"""Il braccio del Pubblicista — la logica pura, senza rete né browser.
Uso: python3 tests/publisher/runner.py
Copre: i campi del pannello vengono SOLO dal payload (mai un None stampato,
mai un codice feature grezzo), l'ordine delle azioni non si riordina, il
rapporto ECHOA l'hash dell'azione, il riconoscimento del login wall."""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(HERE, '..', '..', 'bot', 'boom_publisher.py')

spec = importlib.util.spec_from_file_location('boom_publisher', MOD)
bp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bp)

passed = failed = 0
bad = []


def check(name, cond):
    global passed, failed
    if cond:
        passed += 1
        print('PASS', name)
    else:
        failed += 1
        bad.append(name)
        print('FAIL', name)


PAYLOAD = {
    'name': 'Bilocale Pigneto', 'address': 'Via del Pigneto 112', 'zone': 'Pigneto',
    'price': 1250, 'depositMonths': 2, 'sqm': 55, 'beds': 1, 'bathrooms': 1,
    'furnished': True, 'showExactAddress': True,
    'featuresLabels': {'it': ['aria condizionata', 'lavatrice'], 'en': ['air conditioning', 'washing machine']},
    'descriptionIt': 'Luminoso bilocale', 'descriptionEn': 'Bright one-bedroom',
    'photos': ['https://st/x1.jpg', 'https://st/x2.jpg'],
}

rows = dict(bp.field_rows(PAYLOAD))
check('i campi vengono dal payload (titolo, prezzo, indirizzo)',
      rows.get('Titolo') == 'Bilocale Pigneto' and rows.get('Prezzo €/mese') == 1250)
check('le feature arrivano UMANIZZATE, mai i codici grezzi',
      rows.get('Caratteristiche (IT)') == 'aria condizionata · lavatrice')
check('la regola del pin viaggia col campo giusto', 'SÌ' in str(rows.get('Mostra indirizzo esatto')))
check('le foto dichiarano l\'ordine (la 1ª è la copertina)',
      any('copertina' in k for k in rows) and '2' in str(dict(bp.field_rows(PAYLOAD)).get('Foto (in ORDINE: la 1ª è la copertina)')))
check('un campo assente NON si stampa (mai inventare)',
      'Piano' not in rows and 'Classe energetica' not in rows)
check('payload vuoto → zero righe, zero crash', bp.field_rows(None) == [])

acts = [
    {'op': 'remove', 'id': 'a', 'name': 'Casa A', 'hash': 'h1', 'remoteUrl': 'https://immobiliare.it/1'},
    {'op': 'create', 'id': 'b', 'name': 'Casa B', 'hash': 'h2'},
]
check('plan_line: verbo giusto e URL quando c\'è',
      bp.plan_line(acts[0]).startswith('[TOGLI]') and 'immobiliare.it/1' in bp.plan_line(acts[0])
      and bp.plan_line(acts[1]) == '[PUBBLICA] Casa B')

r = bp.build_result(acts[1], True, remote_id='98765', remote_url='https://x/98765')
check('il rapporto ECHOA l\'hash dell\'azione (mai ricalcolato qui)',
      r['hash'] == 'h2' and r['id'] == 'b' and r['op'] == 'create' and r['ok'] is True and r['remoteId'] == '98765')
check('un errore viene clippato, mai omesso',
      bp.build_result(acts[1], False, error='x' * 500)['error'] == 'x' * 300)

check('login wall riconosciuto', bp.looks_blocked('https://gestionale.immobiliare.it/login', 'Accedi', '') is True)
check('captcha riconosciuto', bp.looks_blocked('https://x', 'Verifica', 'completa il reCAPTCHA per continuare') is True)
check('un pannello normale NON è blocked',
      bp.looks_blocked('https://gestionale.immobiliare.it/annunci', 'I miei annunci', 'Bilocale Pigneto — attivo') is False)

check('i pannelli dichiarati sono HTTPS e coprono i portali di default',
      all(u.startswith('https://') for u in bp.PANELS.values()) and set(bp.PANELS) >= {'immobiliare', 'idealista'})

print(f'\nBraccio Pubblicista: {passed} passed, {failed} failed')
if failed:
    print('FALLITI: ' + ' | '.join(bad))
    sys.exit(1)
