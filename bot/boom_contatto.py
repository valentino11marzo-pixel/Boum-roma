#!/usr/bin/env python3
"""
boom_contatto.py — IL CONTATTO: il messaggio approvato arriva al proprietario.

IL MANDATO. L'operatore, in plancia (pfs-command), rivede l'annuncio, sceglie
stile e voce, LEGGE il messaggio e tocca Conferma: quel tap è la firma.
Questo script è solo il POSTINO: preleva i job approvati da
/api/outreach/queue, apre l'annuncio nel browser (profilo persistente,
loggato sui portali — le risposte del proprietario arrivano nel centro
messaggi del portale), scrive ESATTAMENTE il testo approvato nella chat o
nel form di contatto, e riporta l'esito. Non decide niente, non riscrive
niente, non contatta nessuno che l'operatore non abbia approvato.

LE REGOLE D'ORO (quelle del Pubblicista, più due proprie):
  - il testo si incolla INTATTO: una parola cambiata qui è una parola che
    l'operatore non ha mai approvato;
  - ritmo umano: un messaggio alla volta, 20-40s di pausa tra l'uno e
    l'altro, massimo 6 per giro (tetto lato server);
  - captcha/login/verifica → STOP di tutto il giro, rapporto `blocked`:
    mai aggirare, mai insistere su un portale che ci ha visto;
  - esito INCERTO (inviato ma senza conferma visibile) → si riporta
    `esito_incerto`: il server lo parcheggia SUBITO (mai un retry cieco che
    rischia il doppio messaggio allo stesso proprietario);
  - ogni esito viene riportato: il rapporto è anche il battito
    (pfsRadarHealth/contatto → allerta Telegram dopo 3 giri falliti), e si
    riporta ANCHE il giro a coda vuota (idle: il silenzio è il guasto,
    il giro a vuoto è salute).

Modalità:
  --run     (default) un giro: pull → invii → rapporto. È ciò che launchd
            lancia ogni 5 minuti.
  --dry     mostra la coda senza browser e senza toccare nulla
  --login   apre il profilo per fare login sui portali (una volta)
  --assist  per i job PARCHEGGIATI o quando --run non trova i campi:
            apre la pagina, mette il messaggio negli appunti (pbcopy),
            l'operatore incolla e invia, poi conferma l'esito a terminale

Setup (Mac, una volta):
  cp bot/boom_contatto.py ~/boom-contatto/ && cd ~/boom-contatto
  # .env accanto allo script: HOMIE_SECRET=... (lo stesso degli altri bracci)
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m pip install playwright requests python-dotenv
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m playwright install chromium
  python3 boom_contatto.py --login    # login sui portali (le chat vivono lì)
  cp bot/com.boom.contatto.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.boom.contatto.plist

Env (.env accanto allo script):
  HOMIE_SECRET             obbligatorio (X-Homie-Secret)
  BOOM_API_BASE            default https://www.boomrome.com
  BOOM_CONTATTO_PROFILE    default ~/.boom/chrome-contatto
  BOOM_CONTACT_NAME        identità per i form da sloggato (nome)
  BOOM_CONTACT_EMAIL       …email
  BOOM_CONTACT_PHONE       …telefono (solo nei CAMPI del form, mai nel testo)

Logica pura testata senza bot né rete: python3 tests/contatto/runner.py
"""

import argparse
import json
import os
import random
import re
import sys
import time

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
except Exception:
    pass

BOOM_BASE = os.environ.get('BOOM_API_BASE', 'https://www.boomrome.com')
HOMIE_SECRET = os.environ.get('HOMIE_SECRET', '')
PROFILE_DIR = os.path.expanduser(os.environ.get('BOOM_CONTATTO_PROFILE', '~/.boom/chrome-contatto'))
CONTACT_NAME = os.environ.get('BOOM_CONTACT_NAME', '')
CONTACT_EMAIL = os.environ.get('BOOM_CONTACT_EMAIL', '')
CONTACT_PHONE = os.environ.get('BOOM_CONTACT_PHONE', '')


# ─────────────────────────── FUNZIONI PURE ────────────────────────────────

def looks_blocked(url, title, body_text):
    hay = ' '.join([str(url or ''), str(title or ''), str(body_text or '')[:2000]]).lower()
    marks = ('captcha', 'recaptcha', 'accedi per continuare', 'sign in to continue',
             'verifica di sicurezza', 'access denied', 'two-factor', '2fa',
             'unusual traffic', 'sei un robot')
    return any(m in hay for m in marks)


def build_result(job, ok, via=None, error=None):
    """L'esito di UN job: id sempre, mai il messaggio (il server ce l'ha già),
    errore clippato ma mai omesso."""
    r = {'id': (job or {}).get('id'), 'ok': bool(ok)}
    if via:
        r['via'] = str(via)
    if error:
        r['error'] = str(error)[:300]
    return r


def job_ready(job):
    """L'ultima rete PRIMA del browser: un job senza url o senza messaggio
    non apre nessuna pagina (il server valida già, ma la cintura doppia
    costa una riga)."""
    j = job or {}
    if not str(j.get('sourceUrl') or '').startswith('http'):
        return False, 'sourceUrl mancante'
    if len(str(j.get('message') or '').strip()) < 40:
        return False, 'messaggio vuoto o troppo corto'
    return True, None


def sent_confirmation(html):
    """C'è un marker di conferma in QUESTA pagina? (da solo non basta:
    serve il confronto con lo stato pre-submit, vedi confirmation_delta)."""
    h = (html or '').lower()
    marks = ('messaggio inviato', 'richiesta inviata', 'inviata con successo',
             'message sent', 'request sent', 'grazie per averci contattato',
             'ti risponder', 'abbiamo inviato')
    return any(m in h for m in marks)


def confirmation_delta(before_html, after_html):
    """La PROVA vera: il marker di conferma deve COMPARIRE col submit.
    Un annuncio la cui descrizione dice "scrivimi e ti risponderò subito"
    contiene il marker da PRIMA — dichiararlo 'inviato' su quello sarebbe
    un falso ok che perde un contatto in silenzio. Marker presente prima
    E dopo = nessuna prova → esito incerto (che si parcheggia, mai si
    ritenta)."""
    b = (before_html or '').lower()
    a = (after_html or '').lower()
    marks = ('messaggio inviato', 'richiesta inviata', 'inviata con successo',
             'message sent', 'request sent', 'grazie per averci contattato',
             'ti risponder', 'abbiamo inviato')
    return any(m in a and m not in b for m in marks)


TEXTAREA_SELECTORS = (
    'textarea[name="message"]', 'textarea[name="messaggio"]',
    'textarea[id*="message" i]', 'textarea[placeholder*="essagg" i]',
    'textarea[placeholder*="essage" i]', 'form textarea', 'textarea',
)
CONTACT_BUTTON_RE = r'contatta|invia messaggio|richiedi info|message|contact'
SUBMIT_RE = r'invia|send|contatta'
IDENTITY_FIELDS = (
    (('input[name="name"]', 'input[name="nome"]', 'input[id*="name" i]'), 'BOOM_CONTACT_NAME'),
    (('input[type="email"]', 'input[name="email"]'), 'BOOM_CONTACT_EMAIL'),
    (('input[type="tel"]', 'input[name="phone"]', 'input[name="telefono"]'), 'BOOM_CONTACT_PHONE'),
)


# ──────────────────────────── I/O E BROWSER ───────────────────────────────

def http(method, url, body=None):
    import requests
    headers = {'X-Homie-Secret': HOMIE_SECRET, 'Content-Type': 'application/json'}
    return requests.request(method, url, json=body, headers=headers, timeout=45)


def api(path, method='GET', body=None):
    if not HOMIE_SECRET:
        sys.exit("HOMIE_SECRET mancante (mettilo in bot/.env o nell'ambiente).")
    r = http(method, BOOM_BASE.rstrip('/') + path, body)
    r.raise_for_status()
    return r.json()


SPOOL_PATH = os.path.expanduser('~/.boom/contatto-pending-report.json')
LOCK_DIR = os.path.expanduser('~/.boom/contatto.lock')


def acquire_lock(stale_secs=1800):
    """Un giro alla volta, ANCHE contro un --run/--assist manuale lanciato
    mentre gira quello di launchd: due pull ravvicinati sono la ricetta del
    doppio invio."""
    try:
        os.makedirs(LOCK_DIR)
        with open(os.path.join(LOCK_DIR, 'pid'), 'w') as f:
            f.write(str(os.getpid()))
        return True
    except FileExistsError:
        try:
            if time.time() - os.path.getmtime(LOCK_DIR) > stale_secs:
                release_lock()
                return acquire_lock(stale_secs)
        except Exception:
            pass
        return False


def release_lock():
    try:
        for name in os.listdir(LOCK_DIR):
            os.unlink(os.path.join(LOCK_DIR, name))
        os.rmdir(LOCK_DIR)
    except Exception:
        pass


def replay_spool():
    """Se c'è un rapporto in sospeso lo si consegna PRIMA di qualunque pull:
    i suoi job sono ancora 'sending' sul server, e finché non arriva il
    rapporto il reclaim potrebbe rimetterli in giro. True = via libera."""
    if not os.path.exists(SPOOL_PATH):
        return True
    try:
        with open(SPOOL_PATH) as f:
            body = json.load(f)
    except Exception:
        os.unlink(SPOOL_PATH)  # spool corrotto: meglio il reclaim del server
        return True
    last = None
    for delay in (0, 3, 8):
        if delay:
            time.sleep(delay)
        try:
            rep = api('/api/outreach/queue', 'POST', body)
            os.unlink(SPOOL_PATH)
            print(f"[contatto] rapporto in sospeso consegnato: {rep.get('recorded')}")
            return True
        except Exception as e:
            last = e
    print(f'[contatto] rapporto in sospeso NON consegnato (riprovo al giro dopo): {last}')
    return False


def report(body):
    """Il rapporto degli esiti NON si può perdere: prima su disco (spool),
    poi il POST con retry — solo il successo cancella lo spool. Un lotto
    di esiti perso diventerebbe, dopo il lease, un REINVIO cieco: lo
    stesso proprietario col messaggio doppio."""
    os.makedirs(os.path.dirname(SPOOL_PATH), exist_ok=True)
    tmp = SPOOL_PATH + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(body, f)
    os.replace(tmp, SPOOL_PATH)
    return replay_spool()


def open_profile(playwright, headless=False):
    os.makedirs(PROFILE_DIR, exist_ok=True)
    return playwright.chromium.launch_persistent_context(
        PROFILE_DIR, headless=headless,
        viewport={'width': 1380, 'height': 900}, locale='it-IT')


def first_visible(page, selectors):
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible():
                return el
        except Exception:
            continue
    return None


def fill_identity_if_asked(page):
    """I form da sloggato chiedono nome/email/telefono: si riempiono SOLO i
    campi visibili e vuoti, SOLO dagli env dedicati. Un campo obbligatorio
    senza env → l'esito lo dirà il submit."""
    values = {'BOOM_CONTACT_NAME': CONTACT_NAME, 'BOOM_CONTACT_EMAIL': CONTACT_EMAIL,
              'BOOM_CONTACT_PHONE': CONTACT_PHONE}
    for selectors, env_key in IDENTITY_FIELDS:
        val = values.get(env_key) or ''
        if not val:
            continue
        el = first_visible(page, selectors)
        try:
            if el and not (el.input_value() or '').strip():
                el.fill(val)
        except Exception:
            pass


def send_on_page(page, message):
    """Il tentativo di invio su UNA pagina annuncio già caricata.
    Ritorna ('ok'|'uncertain'|'nofield', dettaglio)."""
    box = first_visible(page, TEXTAREA_SELECTORS)
    if not box:
        # spesso il form appare dopo il bottone "Contatta"
        try:
            btn = page.get_by_role('button', name=re.compile(CONTACT_BUTTON_RE, re.I)).first
            if btn.count():
                btn.click(timeout=4000)
                time.sleep(1.5)
                box = first_visible(page, TEXTAREA_SELECTORS)
        except Exception:
            pass
    if not box:
        try:
            link = page.get_by_role('link', name=re.compile(CONTACT_BUTTON_RE, re.I)).first
            if link.count():
                link.click(timeout=4000)
                time.sleep(1.5)
                box = first_visible(page, TEXTAREA_SELECTORS)
        except Exception:
            pass
    if not box:
        return 'nofield', 'nessun campo messaggio trovato sulla pagina'

    # IL TESTO ENTRA INTATTO. Prima si svuota l'eventuale precompilato del
    # portale ("Sono interessato…"): il messaggio approvato è TUTTO il testo.
    box.fill('')
    box.fill(message)
    fill_identity_if_asked(page)

    # Il submit si cerca DENTRO il form della textarea: un bottone
    # "Contatta" pescato a caso in un'altra zona della pagina è un click
    # alla cieca — la regola d'oro del Pubblicista lo vieta.
    submit = None
    try:
        form = box.locator('xpath=ancestor::form[1]')
        if form.count():
            cand = form.get_by_role('button', name=re.compile(SUBMIT_RE, re.I)).first
            if cand.count():
                submit = cand
            else:
                cand = form.locator('button[type="submit"]').first
                if cand.count():
                    submit = cand
    except Exception:
        submit = None
    if submit is None:
        try:
            cand = page.get_by_role('button', name=re.compile(SUBMIT_RE, re.I)).first
            if cand.count():
                submit = cand
        except Exception:
            pass
    if submit is None:
        submit = first_visible(page, ('form button[type="submit"]', 'button[type="submit"]'))
    if submit is None:
        return 'nofield', 'campo messaggio trovato ma nessun bottone di invio'

    # Baseline PRIMA del click: la conferma deve COMPARIRE, non esserci già.
    before = ''
    try:
        before = page.content()
    except Exception:
        pass
    submit.click(timeout=6000)
    time.sleep(3.0)
    after = ''
    try:
        after = page.content()
    except Exception:
        pass
    if confirmation_delta(before, after):
        return 'ok', None
    # niente conferma COMPARSA: forse è partito, forse un campo obbligatorio
    # ha bloccato il form. NON si riprova: lo dice l'operatore.
    return 'uncertain', 'nessuna conferma comparsa dopo il submit'


# ─────────────────────────────── MODALITÀ ─────────────────────────────────

def mode_dry():
    # ?peek=1: guardare senza prendere — niente lease, niente tentativi
    # contati. Un --dry non deve mai lasciare tracce sulla coda.
    data = api('/api/outreach/queue?peek=1')
    if not data.get('enabled', True):
        print('[contatto] kill switch: coda SPENTA (settings/outreach).')
        return
    jobs = data.get('jobs', [])
    print(f'{len(jobs)} job in coda' + ('' if jobs else ' — niente da fare.'))
    for j in jobs:
        print(f"  [{j.get('portal')}] {j.get('sourceUrl')}")
        print(f"    stile {j.get('style')}/{j.get('voice')}"
              + (f" · per {j.get('clientName')}" if j.get('clientName') else '')
              + (f" · tentativi {j.get('attempts')}" if j.get('attempts') else ''))
        print('    ' + str(j.get('message', '')).replace('\n', '\n    '))


def mode_login():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = open_profile(p, headless=False)
        for url in ('https://www.immobiliare.it/', 'https://www.idealista.it/', 'https://www.subito.it/'):
            ctx.new_page().goto(url, wait_until='domcontentloaded')
        print('Fai login sui portali aperti (le chat e le risposte vivono lì).')
        input('Quando hai finito premi INVIO qui… ')
        ctx.close()


def mode_run():
    if not acquire_lock():
        print('[contatto] un altro giro è in corso — salto.')
        return
    try:
        _run(assist=False)
    finally:
        release_lock()


def _run(assist):
    if not replay_spool():
        return  # niente pull con un rapporto vecchio in sospeso
    data = api('/api/outreach/queue' + ('?assist=1' if assist else ''))
    if not data.get('enabled', True):
        print('[contatto] kill switch: coda spenta — niente da fare.')
        return
    jobs = data.get('jobs', [])
    if not jobs:
        try:
            api('/api/outreach/queue', 'POST', {'results': [], 'idle': True})
        except Exception as e:
            print(f'[contatto] battito idle non consegnato: {e}')
        print('[contatto] coda vuota — battito riportato.')
        return
    if assist:
        _assist_jobs(jobs)
        return

    results = []
    blocked = False
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = open_profile(p, headless=False)
        try:
            for i, job in enumerate(jobs):
                ready, why = job_ready(job)
                if not ready:
                    results.append(build_result(job, False, error='job non eseguibile: ' + why))
                    continue
                if i > 0:
                    time.sleep(random.uniform(20, 40))  # ritmo umano tra un invio e l'altro
                page = ctx.new_page()
                try:
                    page.goto(job['sourceUrl'], wait_until='domcontentloaded', timeout=25000)
                    time.sleep(random.uniform(1.5, 3.0))
                    if looks_blocked(page.url, page.title(), page.content()[:2000]):
                        blocked = True
                        print(f"  [{job.get('portal')}] BLOCCATO su {job['sourceUrl']} — mollo la presa.")
                        break  # i job non tentati tornano in coda (lease + blocked)
                    outcome, detail = send_on_page(page, job['message'])
                    if outcome == 'ok':
                        results.append(build_result(job, True, via='portal-chat'))
                        print(f"  ✓ inviato: {job['sourceUrl']}")
                    elif outcome == 'uncertain':
                        results.append(build_result(job, False, error='esito_incerto: ' + (detail or '')))
                        print(f"  ? incerto: {job['sourceUrl']} — parcheggiato, verifica a mano")
                    else:
                        results.append(build_result(job, False, error=detail or 'campo non trovato'))
                        print(f"  ✗ {job['sourceUrl']} → {detail}")
                except Exception as e:
                    results.append(build_result(job, False, error=f'{e.__class__.__name__}: {str(e)[:150]}'))
                    print(f"  ✗ {job['sourceUrl']} → {e.__class__.__name__}")
                finally:
                    try:
                        page.close()
                    except Exception:
                        pass
        finally:
            try:
                ctx.close()
            except Exception:
                pass

    body = {'results': results}
    if blocked:
        body['blocked'] = True
        body['error'] = 'portale bloccato (captcha/login) durante il giro'
    report(body)


def _assist_jobs(jobs):
    """La corsia dell'operatore: pagina aperta, messaggio negli appunti,
    esito confermato a voce. Serve ANCHE i parcheggiati (?assist=1)."""
    import subprocess
    from playwright.sync_api import sync_playwright
    results = []
    with sync_playwright() as p:
        ctx = open_profile(p, headless=False)
        try:
            for job in jobs:
                print('\n' + '─' * 60)
                print(f"[{job.get('portal')}] {job['sourceUrl']}"
                      + (f" · tentativi {job.get('attempts')}" if job.get('attempts') else ''))
                print(job['message'])
                try:
                    subprocess.run(['pbcopy'], input=job['message'].encode(), check=False)
                    print('(messaggio copiato negli appunti — incollalo nel form)')
                except Exception:
                    pass
                ctx.new_page().goto(job['sourceUrl'], wait_until='domcontentloaded')
                ans = input('Esito [INVIO = inviato · s = salta · b = bloccato]: ').strip().lower()
                if ans == 'b':
                    results.append(build_result(job, False, error='bloccato (assist)'))
                    break
                if ans == 's':
                    results.append(build_result(job, False, error='saltato dall\'operatore (assist)'))
                    continue
                results.append(build_result(job, True, via='assist'))
        finally:
            try:
                ctx.close()
            except Exception:
                pass
    report({'results': results})


def mode_assist():
    if not acquire_lock():
        print('[contatto] un altro giro è in corso (launchd?) — riprova tra un minuto.')
        return
    try:
        _run(assist=True)
    finally:
        release_lock()


def main():
    ap = argparse.ArgumentParser(description='Il Contatto — il postino dei messaggi approvati')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--login', action='store_true')
    ap.add_argument('--assist', action='store_true')
    ap.add_argument('--run', action='store_true')
    args = ap.parse_args()
    if args.login:
        mode_login()
    elif args.dry:
        mode_dry()
    elif args.assist:
        mode_assist()
    else:
        mode_run()


if __name__ == '__main__':
    main()
