#!/usr/bin/env python3
"""
boom_postino.py — IL POSTINO: chi consegna DAVVERO su WhatsApp, come SCRIPT.

IL PROBLEMA CHE RISOLVE (trovato in produzione il 29/08/2026). Ogni risposta
WhatsApp della macchina — la Segretaria, un tuo ✅ su una bozza del
Commerciale, un auto-invio della scala della fiducia — finisce nell'outbox
del server (`/api/homie/wa-outbox`) e ad inviarla DEVE essere il Mac, dove
vive la sessione WhatsApp (wacli). Quel ciclo di ritiro esisteva solo come
MANDATO scritto in bot/HOMIE.md: nessuno script deterministico lo eseguiva
(la stessa storia dello Scout). Risultato: la Segretaria scriveva, l'executor
marcava 'executed', e il messaggio restava in coda per sempre, in silenzio.

QUESTO SCRIPT è quel ciclo, ogni ~2 minuti via launchd:
  1. POST /api/homie/wa-outbox {op:'pull'}  → i messaggi approvati e mai
     inviati (il server esclude già ritirati, falliti e più vecchi di 48h);
  2. invia ognuno con wacli — IL TESTO ESATTO, senza riscritture (il testo
     è stato approvato: cambiarlo qui tradirebbe la firma dell'operatore);
  3. POST {op:'ack', actionId, ok, error}   → l'esito torna sul doc azione
     (waSentAt / waSendError): la consegna si VEDE, mai più un atto di fede.

LA RETE DI SICUREZZA LATO SERVER (api/telegram/_postino.js): se questo
script non gira, dopo 5 minuti l'operatore riceve su Telegram la card 📮
col testo già pronto nel bottone wa.me — la coda non è mai più invisibile.

REGISTRO LOCALE ANTI-DOPPIO: se lo script muore DOPO l'invio ma PRIMA
dell'ack, al giro dopo il server riproporrebbe lo stesso messaggio — e un
doppio messaggio allo stesso cliente è il peggior esito possibile. Gli
actionId inviati si annotano su disco PRIMA dell'invio: un id già annotato
non si rimanda MAI, si ri-acka soltanto.

Modalità:
  --once            (default) un giro di consegne — è ciò che lancia launchd
  --dry             mostra cosa consegnerebbe, zero invii, zero ack
  --test <numero>   manda un messaggio di prova a QUEL numero (per collaudare
                    WACLI_SEND_CMD una volta, sul tuo)

Setup (Mac, una volta):
  mkdir -p ~/boom-postino && cp bot/boom_postino.py ~/boom-postino/
  # .env accanto allo script: HOMIE_SECRET=... (lo stesso degli altri bracci)
  # e, se il tuo wacli ha una sintassi diversa, WACLI_SEND_CMD (vedi sotto)
  python3 boom_postino.py --test +39XXXXXXXXXX   # collaudo
  cp bot/com.boom.postino.plist ~/Library/LaunchAgents/ \
    && launchctl load ~/Library/LaunchAgents/com.boom.postino.plist

Env (.env accanto allo script, o dall'ambiente):
  HOMIE_SECRET      obbligatorio (X-Homie-Secret)
  BOOM_API_BASE     default https://www.boomrome.com
  WACLI_SEND_CMD    template del comando di invio. Default:
                        wacli send {digits} {text}
                    Placeholder: {phone} (con +), {digits} (solo cifre),
                    {text}. Si sostituiscono DOPO lo split: il testo del
                    cliente resta UN argomento, qualunque cosa contenga.
                    Esempi alternativi:
                        wacli messages send --to {digits} --message {text}
                        /path/send_whatsapp.sh {digits} {text}
"""
import json
import os
import random
import shlex
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(HERE, '.env'))
except ImportError:
    pass

BASE = os.getenv('BOOM_API_BASE', 'https://www.boomrome.com').rstrip('/')
SECRET = os.getenv('HOMIE_SECRET', '')
CMD_TPL = os.getenv('WACLI_SEND_CMD', 'wacli send {digits} {text}')
REGISTRY = os.path.join(HERE, 'postino-sent.json')
MAX_PER_RUN = 10


def build_cmd(template, phone, text):
    """Il comando come LISTA argv, mai una stringa passata a una shell: il
    testo del cliente può contenere apici, $, backtick, a-capo — dentro un
    argomento sono solo caratteri. I placeholder si sostituiscono DOPO lo
    shlex.split del template, così {text} resta UN argomento. Un template
    senza {text} o senza destinatario è un errore DETTO, non un invio a
    vuoto."""
    if '{text}' not in template:
        raise ValueError('WACLI_SEND_CMD senza {text}: il messaggio non verrebbe mai inviato')
    if '{phone}' not in template and '{digits}' not in template:
        raise ValueError('WACLI_SEND_CMD senza {phone}/{digits}: nessun destinatario')
    digits = ''.join(ch for ch in str(phone) if ch.isdigit())
    out = []
    for part in shlex.split(template):
        out.append(part.replace('{phone}', str(phone))
                       .replace('{digits}', digits)
                       .replace('{text}', str(text)))
    return out


def load_registry():
    try:
        with open(REGISTRY) as f:
            ids = json.load(f)
            return ids if isinstance(ids, list) else []
    except Exception:
        return []


def note_sent(ids, action_id):
    ids = [i for i in ids if i != action_id]
    ids.append(action_id)
    ids = ids[-500:]
    with open(REGISTRY, 'w') as f:
        json.dump(ids, f)
    return ids


def api(payload):
    import requests
    r = requests.post(BASE + '/api/homie/wa-outbox', json=payload,
                      headers={'X-Homie-Secret': SECRET}, timeout=30)
    r.raise_for_status()
    return r.json()


def send_one(phone, text, dry=False):
    cmd = build_cmd(CMD_TPL, phone, text)
    if dry:
        print('  DRY:', ' '.join(shlex.quote(c) for c in cmd[:3]), '…')
        return True, None
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if p.returncode == 0:
            return True, None
        return False, (p.stderr or p.stdout or f'exit {p.returncode}').strip()[:300]
    except Exception as e:
        return False, str(e)[:300]


def run(dry=False):
    if not SECRET:
        print('ERRORE: HOMIE_SECRET mancante (.env accanto allo script)'); sys.exit(1)
    sent_ids = load_registry()
    rep = api({'op': 'pull'})
    msgs = (rep.get('messages') or [])[:MAX_PER_RUN]
    if not msgs:
        print('postino: coda vuota'); return
    for m in msgs:
        aid, phone, text = m.get('actionId'), m.get('phone'), m.get('text')
        if not aid or not phone or not text:
            continue
        if aid in sent_ids:
            # inviato in un giro morto prima dell'ack: MAI rimandare, solo ri-ackare
            print(f'postino: {aid} già inviato — ri-acko senza rimandare')
            if not dry:
                api({'op': 'ack', 'actionId': aid, 'ok': True})
            continue
        if not dry:
            sent_ids = note_sent(sent_ids, aid)   # PRIMA dell'invio: anti-doppio
        ok, err = send_one(phone, text, dry=dry)
        print(f'postino: {aid} → {phone} — {"consegnato" if ok else "FALLITO: " + str(err)}')
        if not dry:
            api({'op': 'ack', 'actionId': aid, 'ok': ok, **({'error': err} if err else {})})
        time.sleep(2 + random.random() * 3)   # ritmo umano


if __name__ == '__main__':
    if '--test' in sys.argv:
        i = sys.argv.index('--test')
        num = sys.argv[i + 1] if len(sys.argv) > i + 1 else ''
        if not num:
            print('uso: boom_postino.py --test +39XXXXXXXXXX'); sys.exit(1)
        ok, err = send_one(num, 'Collaudo del Postino BOOM ✅ (questo messaggio arriva dal Mac)')
        print('OK — controlla WhatsApp' if ok else f'FALLITO: {err}\nRegola WACLI_SEND_CMD nel .env (vedi intestazione file)')
        sys.exit(0 if ok else 1)
    run(dry='--dry' in sys.argv)
