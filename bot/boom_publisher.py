#!/usr/bin/env python3
"""
BOOM Pubblicista — il BRACCIO sul Mac (bot/PUBBLICISTA.md è il mandato).

Il server pensa (/api/publisher/queue: cosa creare/aggiornare/togliere, con
il payload completo già normalizzato); questo script esegue dalla porta
aperta e riferisce ogni esito. Lo stato vive sul server: il Mac può morire
a metà giro e niente si duplica.

MODI (uno per invocazione — pensato per launchd + sessioni al terminale):
  --dry      stampa la worklist di ogni portale, zero browser, zero rapporti
  --login    apre il browser col profilo persistente sui pannelli agenzia:
             l'operatore fa login UNA volta, chiude, fine (la sessione resta)
  --check    per launchd (ogni 30'): interroga le code e, se c'è lavoro,
             notifica macOS ("Pubblicista: 3 azioni per immobiliare").
             Non tocca i pannelli: mai un browser senza operatore davanti.
  --assist   la sessione di lavoro VERA (oggi): per ogni azione apre il
             pannello, stampa i campi già pronti dal payload (descrizioni,
             foto, indirizzo con la regola showExactAddress), l'operatore
             compila/salva nel browser e conferma in terminale con l'URL
             pubblico → il rapporto parte da solo e il diff del server
             chiude il cerchio. Captcha/2FA → 'b' = blocked, mai aggirare.
  --auto     riservato: quando i selettori dei pannelli saranno mappati,
             la compilazione diventa automatica. Oggi ricade su --assist
             azione per azione (mai un click alla cieca).

DEPLOY NOTE: la copia viva gira sul Mac mini in
/Users/boomserver/boom-publisher/boom_publisher.py con un .env accanto
(HOMIE_SECRET — mai committato). Questo file è lo specchio versionato.
Setup: vedi bot/PUBBLICISTA.md ("Il braccio: setup in 10 minuti").
"""

import argparse
import json
import os
import subprocess
import sys

import requests

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
except Exception:
    pass  # dotenv è comodità, non requisito: gli env possono arrivare da launchd

BOOM_BASE = os.environ.get('BOOM_API_BASE', 'https://www.boomrome.com')
HOMIE_SECRET = os.environ.get('HOMIE_SECRET', '')
PORTALS = [p.strip() for p in os.environ.get('BOOM_PORTALS', 'immobiliare,idealista').split(',') if p.strip()]
PROFILE_DIR = os.path.expanduser(os.environ.get('BOOM_PUBLISHER_PROFILE', '~/.boom/chrome-publisher'))

# I punti d'ingresso dei pannelli agenzia PROPRI. Solo home: i percorsi
# interni li naviga l'operatore (--assist) finché --auto non è mappato.
PANELS = {
    'immobiliare': 'https://gestionale.immobiliare.it/',
    'idealista': 'https://www.idealista.it/pro/',
}

# ─── Logica pura (testata da tests/publisher/runner.py, senza rete) ─────────

def field_rows(payload):
    """I campi del pannello, nell'ordine in cui si compilano. Solo ciò che
    ESISTE nel payload: mai inventare, mai stampare un None."""
    if not payload:
        return []
    p = payload
    labels = (p.get('featuresLabels') or {})
    rows = [
        ('Titolo', p.get('name')),
        ('Indirizzo', p.get('address')),
        ('Mostra indirizzo esatto', {True: 'SÌ (pin verificato via+civico)', False: 'NO (pin non esatto — regola boom-geo)'}.get(p.get('showExactAddress'))),
        ('Zona', p.get('zone')),
        ('Prezzo €/mese', p.get('price')),
        ('Deposito (mesi)', p.get('depositMonths')),
        ('Deposito €', p.get('deposit')),
        ('Superficie m²', p.get('sqm')),
        ('Camere', p.get('beds')),
        ('Bagni', p.get('bathrooms')),
        ('Piano', p.get('floor')),
        ('Arredato', {True: 'sì', False: 'no'}.get(p.get('furnished'))),
        ('Disponibile dal', p.get('availableDate')),
        ('Classe energetica', p.get('energyClass')),
        ('Caratteristiche (IT)', ' · '.join(labels.get('it') or []) or None),
        ('Descrizione IT', p.get('descriptionIt')),
        ('Descrizione EN', p.get('descriptionEn')),
        ('Video', p.get('video')),
    ]
    rows = [(k, v) for k, v in rows if v not in (None, '', [])]
    photos = p.get('photos') or []
    if photos:
        rows.append(('Foto (in ORDINE: la 1ª è la copertina)', f'{len(photos)} — URL nel payload'))
    return rows


def plan_line(action):
    """Una riga leggibile per azione — l'ordine arriva GIÀ giusto dal server
    (remove → create → update): qui non si riordina mai."""
    verb = {'create': 'PUBBLICA', 'update': 'AGGIORNA', 'remove': 'TOGLI'}.get(action.get('op'), action.get('op', '?').upper())
    tail = f" → {action['remoteUrl']}" if action.get('remoteUrl') else ''
    return f"[{verb}] {action.get('name') or action.get('id')}{tail}"


def looks_blocked(url, title, body_text):
    """La sessione è caduta? Login wall e captcha arrivano in mille vesti:
    qui si riconoscono i segni comuni. In dubbio NON è blocked — l'operatore
    ha sempre l'ultima parola in --assist ('b')."""
    hay = ' '.join([str(url or ''), str(title or ''), str(body_text or '')[:2000]]).lower()
    marks = ('captcha', 'recaptcha', 'accedi', 'login', 'password dimenticata', 'sign in', 'verifica di sicurezza', 'two-factor', '2fa')
    return any(m in hay for m in marks)


def build_result(action, ok, remote_id=None, remote_url=None, error=None):
    """L'esito nel formato che il server registra. L'HASH È QUELLO DELL'AZIONE
    (echo): se l'operatore edita il listing mentre lavoriamo, il diff del
    giro dopo se ne accorge da solo."""
    r = {
        'id': action.get('id'),
        'op': action.get('op'),
        'hash': action.get('hash'),
        'name': action.get('name'),
        'ok': bool(ok),
    }
    if remote_id:
        r['remoteId'] = str(remote_id)
    if remote_url:
        r['remoteUrl'] = str(remote_url)
    if error:
        r['error'] = str(error)[:300]
    return r


# ─── Ponte col server ───────────────────────────────────────────────────────

def api(path, method='GET', body=None):
    if not HOMIE_SECRET:
        sys.exit('HOMIE_SECRET mancante (mettilo in bot/.env o nell\'ambiente).')
    url = BOOM_BASE.rstrip('/') + path
    r = http(method, url, body)
    r.raise_for_status()
    return r.json()


def http(method, url, body):
    headers = {'X-Homie-Secret': HOMIE_SECRET, 'Content-Type': 'application/json'}
    return requests.request(method, url, json=body, headers=headers, timeout=45)


def get_queue(portal):
    return api(f'/api/publisher/queue?portal={portal}')


def post_report(portal, results=None, blocked=False, error=None):
    body = {'portal': portal, 'results': results or []}
    if blocked:
        body['blocked'] = True
    if error:
        body['error'] = str(error)[:300]
    return api('/api/publisher/queue', 'POST', body)


def notify_mac(text):
    try:
        subprocess.run(['osascript', '-e', f'display notification {json.dumps(text)} with title "BOOM Pubblicista"'], timeout=10)
    except Exception:
        print('[notifica]', text)


# ─── Browser (solo nei modi che lo richiedono: import pigro) ────────────────

def open_profile(playwright, headless=False):
    os.makedirs(PROFILE_DIR, exist_ok=True)
    return playwright.chromium.launch_persistent_context(PROFILE_DIR, headless=headless, viewport={'width': 1380, 'height': 900})


def mode_login():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        ctx = open_profile(pw)
        for portal in PORTALS:
            ctx.new_page().goto(PANELS[portal], wait_until='domcontentloaded')
        print('Fai login su ENTRAMBI i pannelli (resta salvato nel profilo).')
        input('Quando hai finito premi INVIO qui… ')
        ctx.close()


def mode_dry():
    for portal in PORTALS:
        q = get_queue(portal)
        acts = q.get('actions') or []
        print(f"\n═══ {portal} — {'SPENTO (kill switch)' if not q.get('enabled') else f'{len(acts)} azioni'} · stats {q.get('stats')}")
        for a in acts:
            print(' ', plan_line(a))
            for k, v in field_rows(a.get('payload'))[:6]:
                print(f'      {k}: {str(v)[:70]}')


def mode_check():
    busy = []
    for portal in PORTALS:
        try:
            q = get_queue(portal)
            n = len(q.get('actions') or [])
            if q.get('enabled') and n:
                busy.append(f'{portal}: {n}')
        except Exception as e:
            print(f'[check] {portal}: {e}')
    if busy:
        notify_mac('Azioni in coda — ' + ' · '.join(busy) + '. Apri il terminale: boom_publisher.py --assist')
    else:
        print('[check] code vuote — catalogo allineato.')


def mode_assist():
    from playwright.sync_api import sync_playwright
    for portal in PORTALS:
        q = get_queue(portal)
        acts = q.get('actions') or []
        if not q.get('enabled'):
            print(f'{portal}: spento dal kill switch — salto.')
            continue
        if not acts:
            print(f'{portal}: niente da fare ✓')
            continue
        print(f'\n═══ {portal} — {len(acts)} azioni ═══')
        results, blocked = [], False
        with sync_playwright() as pw:
            ctx = open_profile(pw)
            page = ctx.new_page()
            page.goto(PANELS[portal], wait_until='domcontentloaded')
            if looks_blocked(page.url, page.title(), ''):
                print('⚠ Sembra servire il login (o un captcha). Se è così rispondi "b" alla prima azione.')
            for a in acts:
                print('\n' + plan_line(a))
                for k, v in field_rows(a.get('payload')):
                    print(f'  {k}: {v}')
                if (a.get('payload') or {}).get('photos'):
                    for i, u in enumerate(a['payload']['photos'], 1):
                        print(f'  foto {i}: {u}')
                ans = input('Esito [URL pubblico = fatto · INVIO = fatto senza URL · s = salta · b = bloccato]: ').strip()
                if ans.lower() == 'b':
                    blocked = True
                    break
                if ans.lower() == 's':
                    continue
                remote_url = ans if ans.startswith('http') else None
                results.append(build_result(a, True, remote_url=remote_url))
            ctx.close()
        rep = post_report(portal, results=results, blocked=blocked,
                          error='login/captcha sul pannello' if blocked else None)
        print(f'→ rapporto inviato: {rep.get("recorded")}' + (' · BLOCKED' if blocked else ''))


def mode_auto():
    print('--auto non è ancora mappato sui pannelli: passo ad --assist (mai un click alla cieca).')
    mode_assist()


def main():
    ap = argparse.ArgumentParser(description='BOOM Pubblicista — il braccio sul Mac')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--login', action='store_true')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--assist', action='store_true')
    ap.add_argument('--auto', action='store_true')
    args = ap.parse_args()
    if args.login:
        mode_login()
    elif args.dry:
        mode_dry()
    elif args.check:
        mode_check()
    elif args.auto:
        mode_auto()
    else:
        mode_assist()


if __name__ == '__main__':
    main()
