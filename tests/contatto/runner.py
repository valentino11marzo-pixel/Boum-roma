#!/usr/bin/env python3
"""tests/contatto/runner.py — IL CONTATTO, la logica pura del postino.

Importa bot/boom_contatto.py via importlib e guida ciò che decide: quando un
job è eseguibile, cosa conta come PROVA di consegna, come si riporta un
esito. Più il vincolo che non si può testare col DOM ma si può PINNARE sul
sorgente: il messaggio approvato si incolla INTATTO — mai trasformato.

python3 tests/contatto/runner.py
"""

import importlib.util
import inspect
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(HERE, '..', '..', 'bot', 'boom_contatto.py')

spec = importlib.util.spec_from_file_location('boom_contatto', MOD)
ct = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ct)

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


JOB = {'id': 'out_h_1', 'sourceUrl': 'https://www.immobiliare.it/annunci/1/',
       'message': 'Buongiorno! La contatto per il suo annuncio, che mi interessa molto. Possibile una visita? Grazie!'}

# ── l'esito: id sempre, errore clippato, mai il messaggio ─────────────────
r = ct.build_result(JOB, True, via='portal-chat')
check('esito ok: id + via, senza il messaggio (il server ce l\'ha già)',
      r == {'id': 'out_h_1', 'ok': True, 'via': 'portal-chat'})
r = ct.build_result(JOB, False, error='x' * 500)
check('errore clippato a 300 ma mai omesso', len(r['error']) == 300 and r['ok'] is False)
check('job nullo non fa crollare il rapporto', ct.build_result(None, False, error='x')['id'] is None)

# ── la cintura prima del browser ──────────────────────────────────────────
check('job valido → pronto', ct.job_ready(JOB) == (True, None))
check('senza url → mai il browser', ct.job_ready({'message': JOB['message']})[0] is False)
check('messaggio corto → mai il browser', ct.job_ready({'sourceUrl': JOB['sourceUrl'], 'message': 'ciao'})[0] is False)

# ── la PROVA di consegna: il DELTA, non la presenza ───────────────────────
check('conferma visibile → marker', ct.sent_confirmation('<div>Messaggio inviato con successo</div>') is True)
check('conferma inglese → marker', ct.sent_confirmation('Your message sent!') is True)
# LA MUTAZIONE CHE CONTA: senza conferma NON si dichiara inviato — l'incerto
# va parcheggiato dal server, mai ritentato alla cieca (doppio messaggio).
check('pagina qualunque → NESSUNA prova', ct.sent_confirmation('<h1>Bilocale Pigneto</h1>') is False)
check('html vuoto → nessuna prova', ct.sent_confirmation(None) is False)
# Il delta (la correzione della revisione): un annuncio la cui DESCRIZIONE
# dice "scrivimi e ti risponderò" contiene il marker da PRIMA del submit —
# dichiararlo 'inviato' su quello sarebbe un falso ok.
check('marker COMPARSO col submit → prova',
      ct.confirmation_delta('<h1>Bilocale</h1>', '<h1>Bilocale</h1><p>Messaggio inviato</p>') is True)
check('marker PREESISTENTE nella pagina → nessuna prova (esito incerto)',
      ct.confirmation_delta('descrizione: scrivimi e ti risponderò subito',
                            'descrizione: scrivimi e ti risponderò subito') is False)
check('pagina identica prima/dopo → nessuna prova', ct.confirmation_delta('<p>x</p>', '<p>x</p>') is False)

check('captcha → blocked', ct.looks_blocked('https://x/', 'reCAPTCHA', '') is True)
check('annuncio normale → non blocked', ct.looks_blocked('https://x/annunci/1/', 'Bilocale', 'affittasi zona') is False)

# ── il testo INTATTO, pinnato sul sorgente ────────────────────────────────
src = inspect.getsource(ct.send_on_page)
check('il precompilato del portale si svuota prima', "box.fill('')" in src)
check('il messaggio approvato entra INTATTO (fill(message))', 'box.fill(message)' in src)
check('…e non viene MAI trasformato', '.replace(' not in src.split('box.fill(message)')[1][:200]
      and 'message.upper' not in src and 'message.format' not in src)

# ── l'identità nei form: solo dagli env dedicati ──────────────────────────
envs = {e for _, e in ct.IDENTITY_FIELDS}
check('i campi identità leggono SOLO gli env dedicati',
      envs == {'BOOM_CONTACT_NAME', 'BOOM_CONTACT_EMAIL', 'BOOM_CONTACT_PHONE'})

print(f'\nIl Contatto: {passed} passed, {failed} failed')
if failed:
    print('FALLITI: ' + ' | '.join(bad))
    sys.exit(1)
