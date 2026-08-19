#!/usr/bin/env python3
"""
boom_scout.py — LO SCATTO: gli occhi di Homie sul mercato, come SCRIPT.

IL PROBLEMA CHE RISOLVE. Il ciclo "apri le ricerche dei clienti → estrai gli
annunci nuovi → mandali al server" esisteva solo come MANDATO scritto in un
prompt (bot/HOMIE.md): nessuno script deterministico lo eseguiva. Risultato:
il radar PFS viveva dei soli alert email dei portali — lenti, radi — e il
cliente che paga per "essere il primo" arrivava dopo. A Roma un buon affitto
da privato raccoglie decine di contatti nelle prime ORE: la velocità È il
prodotto.

QUESTO SCRIPT è quel ciclo, ogni ~10 minuti via launchd:
  1. GET  /api/homie/searches      → le ricerche VIVE (auto-generate dai
     criteri di ogni cliente attivo da pfs/sync-searches — mai hardcodare
     un URL: la lista cambia da sola; urlOverride vince sempre);
  2. apre ogni ricerca in un browser vero (profilo persistente, IP
     residenziale — il motivo per cui questo gira sul Mac e non su Vercel:
     i portali 403-ano gli IP dei datacenter, è scritto in api/pfs/_fetch.js);
  3. estrae gli URL annuncio, tiene un registro locale dei già visti
     (i duplicati verso il server sono comunque gratis: dedupe sha1 — nel
     dubbio manda), apre le schede NUOVE e ne legge i fatti;
  4. POST /api/homie/property      → l'ingestione condivisa fa il resto:
     dedupe, classificazione privato/agenzia, punteggio su ogni cliente,
     push nel mazzo, radar (impronta+fiuto+vedette), Telegram istantaneo;
  5. POST /api/homie/searches      → il rapporto del giro, che È il battito:
     `blocked` è il campo che conta — "giro pulito, zero risultati" e
     "buttato fuori dal portale" arrivano identici, e solo il secondo è un
     guasto. Un radar CIECO non deve mai sembrare un mercato fermo
     (runVerdict, lato server: qui si riportano FATTI, mai verdetti).

LE REGOLE D'ORO (le stesse del Pubblicista):
  - ritmo umano: una pagina alla volta, pause con jitter, tetti per giro;
  - captcha/login/403 → si segna `blocked` e si passa oltre: MAI aggirare,
    MAI martellare;
  - l'inserzionista si dichiara SOLO se provato: ricerca /da-privati/ di
    Immobiliare → 'private' per costruzione; marker in pagina → quel che
    dicono; altrimenti 'unknown' ESPLICITO (il server, se il campo manca,
    assume 'private' — un'agenzia spacciata per privato finirebbe nel mazzo
    di un cliente);
  - il giudizio sta sul server: questo script non decide mai cosa vale.

Modalità:
  --once   (default) un giro completo — è ciò che launchd lancia ogni 10'
  --dry    stampa le ricerche che aprirebbe, zero browser, zero scritture
  --login  apre il profilo persistente per accettare cookie/login una volta
  --state  stampa il registro locale (quanti visti per ricerca)

Setup (Mac, una volta):
  cp bot/boom_scout.py ~/boom-scout/ && cd ~/boom-scout
  # .env accanto allo script: HOMIE_SECRET=... (lo stesso del publisher)
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m pip install playwright requests python-dotenv
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m playwright install chromium
  python3 boom_scout.py --login     # accetta i cookie sui due portali
  cp bot/com.boom.scout.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.boom.scout.plist

Env (.env accanto allo script, o dall'ambiente):
  HOMIE_SECRET             obbligatorio (X-Homie-Secret)
  BOOM_API_BASE            default https://www.boomrome.com
  BOOM_SCOUT_PROFILE       default ~/.boom/chrome-scout
  BOOM_SCOUT_STATE         default ~/.boom/scout-state.json
  BOOM_SCOUT_MAX_SEARCHES  default 10  (per giro)
  BOOM_SCOUT_MAX_DETAILS   default 12  (schede aperte per giro)
  BOOM_SCOUT_HEADED=1      browser visibile (default headless; se un portale
                           blocca l'headless, passare a headed e riprovare)

Logica pura testata SENZA bot né rete: python3 tests/scout/runner.py
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
    pass  # dotenv è comodità, non requisito: gli env possono arrivare da launchd

BOOM_BASE = os.environ.get('BOOM_API_BASE', 'https://www.boomrome.com')
HOMIE_SECRET = os.environ.get('HOMIE_SECRET', '')
PROFILE_DIR = os.path.expanduser(os.environ.get('BOOM_SCOUT_PROFILE', '~/.boom/chrome-scout'))
STATE_PATH = os.path.expanduser(os.environ.get('BOOM_SCOUT_STATE', '~/.boom/scout-state.json'))
MAX_SEARCHES = int(os.environ.get('BOOM_SCOUT_MAX_SEARCHES', '10'))
MAX_DETAILS = int(os.environ.get('BOOM_SCOUT_MAX_DETAILS', '12'))
HEADED = os.environ.get('BOOM_SCOUT_HEADED', '') == '1'

KNOWN_CAP = 400          # url ricordati per ricerca (i più recenti)
KNOWN_MAX_AGE_DAYS = 30  # oltre, si dimentica (il dedupe vero è del server)
NP_MAX_ATTEMPTS = 2      # schede senza prezzo: si riprova al giro dopo, poi basta


# ─────────────────────────── FUNZIONI PURE ────────────────────────────────
# Tutto ciò che DECIDE sta qui in testa, senza rete né browser: è la parte
# che i test guidano davvero (tests/scout/runner.py, via importlib).

def extract_listing_urls(html, portal):
    """Gli URL annuncio dentro una pagina di ricerca, canonici, max 60.
    Stessi pattern di api/pfs/_fetch.js: le due letture non possono divergere
    su cosa È un annuncio."""
    urls = []
    seen = set()
    h = html or ''

    def add(u):
        if u not in seen and len(urls) < 60:
            seen.add(u)
            urls.append(u)

    if portal != 'idealista':
        for m in re.finditer(r'https?://www\.immobiliare\.it/annunci/(\d+)/?', h, re.I):
            add('https://www.immobiliare.it/annunci/' + m.group(1) + '/')
        for m in re.finditer(r'href="/annunci/(\d+)/?"', h, re.I):
            add('https://www.immobiliare.it/annunci/' + m.group(1) + '/')
    if portal != 'immobiliare':
        for m in re.finditer(r'https?://www\.idealista\.it/immobile/(\d+)/?', h, re.I):
            add('https://www.idealista.it/immobile/' + m.group(1) + '/')
        for m in re.finditer(r'href="/immobile/(\d+)/?"', h, re.I):
            add('https://www.idealista.it/immobile/' + m.group(1) + '/')
    return urls


def parse_listing(html, url):
    """I fatti della scheda annuncio: JSON-LD prima (Immobiliare lo espone),
    regex di riserva poi. Un campo che non c'è resta None: MAI inventare."""
    out = {'sourceUrl': url, 'title': None, 'price': None, 'sqm': None,
           'bedrooms': None, 'images': [], 'description': None}
    h = html or ''
    if not h:
        return out

    for block in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', h):
        try:
            ld = json.loads(block)
        except Exception:
            continue
        if isinstance(ld, dict) and isinstance(ld.get('@graph'), list):
            # Nel @graph si pesca SOLO il nodo immobiliare (come _fetch.js):
            # prendere il primo nodo qualunque leggerebbe l'Organization.
            items = [x for x in ld['@graph'] if isinstance(x, dict)
                     and re.search(r'Apartment|House|RealEstateListing|Residence', str(x.get('@type', '')))]
        elif isinstance(ld, dict):
            items = [ld]
        else:
            continue
        for item in items:
            if not out['title'] and item.get('name'):
                out['title'] = str(item['name'])[:120]
            offers = item.get('offers') or {}
            if not out['price'] and isinstance(offers, dict) and offers.get('price') is not None:
                digits = re.sub(r'\D', '', str(offers['price']))
                if digits:
                    out['price'] = int(digits)
            floor = item.get('floorSize') or {}
            if not out['sqm'] and isinstance(floor, dict) and floor.get('value') is not None:
                try:
                    out['sqm'] = int(float(str(floor['value']).replace(',', '.')))
                except Exception:
                    pass
            if out['bedrooms'] is None and item.get('numberOfRooms') is not None:
                try:
                    out['bedrooms'] = int(str(item['numberOfRooms']).strip())
                except Exception:
                    pass
            img = item.get('image')
            if not out['images'] and img:
                out['images'] = [str(x) for x in (img if isinstance(img, list) else [img])][:10]
            if not out['description'] and item.get('description'):
                out['description'] = str(item['description'])[:800]
        if out['title'] and out['price']:
            break

    if not out['title']:
        m = re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
        if m:
            out['title'] = re.sub(r'<[^>]+>', '', m.group(1)).strip()[:120] or None
    if not out['price']:
        m = re.search(r'€\s*([\d.]+)', h)
        if m:
            try:
                out['price'] = int(m.group(1).replace('.', ''))
            except Exception:
                pass
    if not out['sqm']:
        m = re.search(r'(\d+)\s*m[²2]', h)
        if m:
            out['sqm'] = int(m.group(1))
    if out['bedrooms'] is None:
        m = re.search(r'(\d+)\s*(?:camer[ae]|local[ei]|cam\.)', h, re.I)
        if m:
            out['bedrooms'] = int(m.group(1))
    return out


def detect_advertiser(html, portal, search_url=''):
    """'private' | 'agency' | 'unknown' — e il dubbio si DICHIARA.
    La prova più forte è strutturale: una ricerca Immobiliare /da-privati/
    contiene solo privati per costruzione. Poi i marker di pagina (gli stessi
    di api/pfs/_fetch.js). Senza prova: 'unknown' ESPLICITO — il server, se
    il campo manca, assume 'private', e un'agenzia spacciata per privato
    finirebbe nel mazzo di un cliente."""
    if '/da-privati/' in str(search_url or ''):
        return 'private'
    h = (html or '')[:400000]
    if not h:
        return 'unknown'
    m = re.search(r'"(?:sellerType|advertiserType|contactType|userType)"\s*:\s*"([^"]+)"', h, re.I)
    if m:
        v = m.group(1).lower()
        if re.search(r'private|privato|particular', v):
            return 'private'
        if re.search(r'agency|agenzia|professional|pro', v):
            return 'agency'
    if re.search(r'annuncio\s+di\s+privato|inserzionista[^<]{0,40}privato|"isPrivate"\s*:\s*true', h, re.I):
        return 'private'
    if re.search(r'agenzia\s+immobiliare|"isAgency"\s*:\s*true|class="[^"]*(?:agency|agenzia)[^"]*"', h, re.I):
        return 'agency'
    if portal == 'idealista' and re.search(r'professionista|commercialName', h, re.I):
        return 'agency'
    return 'unknown'


def looks_blocked(url, title, body_text):
    """Captcha / muro di login / verifica: nel dubbio NON bloccato — un falso
    'blocked' spegne un allarme vero domani."""
    hay = ' '.join([str(url or ''), str(title or ''), str(body_text or '')[:2000]]).lower()
    marks = ('captcha', 'recaptcha', 'accedi per continuare', 'sign in to continue',
             'verifica di sicurezza', 'access denied', 'two-factor', '2fa',
             'unusual traffic', 'sei un robot')
    return any(m in hay for m in marks)


def prune_known(known, now_ts, cap=KNOWN_CAP, max_age_days=KNOWN_MAX_AGE_DAYS):
    """Il registro locale dei già visti: si pota per età e per numero (i più
    recenti restano). È una CACHE — perderne una voce costa solo un POST in
    più, e i duplicati verso il server sono gratis."""
    out = {}
    max_age = max_age_days * 86400
    for url, v in (known or {}).items():
        ts = v.get('ts', 0) if isinstance(v, dict) else 0
        if now_ts - ts <= max_age:
            out[url] = v if isinstance(v, dict) else {'ts': ts}
    if len(out) > cap:
        keep = sorted(out.items(), key=lambda kv: kv[1].get('ts', 0))[-cap:]
        out = dict(keep)
    return out


def pending_urls(urls, known, np_max=NP_MAX_ATTEMPTS):
    """Cosa resta da APRIRE: i mai visti, più i visti-senza-prezzo che non
    hanno esaurito i tentativi (np < np_max — il contatore vive nel
    registro, così sopravvive tra un giro e l'altro). Un url già ingerito
    (voce senza 'np') non si riapre mai."""
    out = []
    for u in urls or []:
        e = (known or {}).get(u)
        if e is None:
            out.append(u)
        elif isinstance(e, dict) and e.get('np', 0) and e['np'] < np_max:
            out.append(u)
    return out


def pick_searches(searches, state, cap=MAX_SEARCHES):
    """Chi si apre in questo giro: le mai scansionate prima, poi le più
    stantie — così nessuna ricerca resta indietro per sempre."""
    st = state.get('searches', {}) if isinstance(state, dict) else {}

    def last(s):
        return (st.get(s.get('id') or '', {}) or {}).get('lastScanAt', 0)

    rows = [s for s in (searches or []) if s and s.get('url')]
    rows.sort(key=last)
    return rows[:max(0, cap)]


def build_property_payload(listing, search, advertiser):
    """Il body per POST /api/homie/property. L'advertiser viaggia SEMPRE
    esplicito; la zona viene dalla ricerca (pulita, da sync-searches) e il
    titolo farà il resto lato server (inferZone). skipFreshHours 12: i
    ri-avvistamenti dentro la finestra non ripunteggiano tutti i clienti."""
    body = {
        'sourceUrl': listing.get('sourceUrl'),
        'source': (search or {}).get('portal') or 'manual',
        'price': listing.get('price'),
        'advertiser': advertiser if advertiser in ('private', 'agency', 'unknown') else 'unknown',
        'skipFreshHours': 12,
    }
    if listing.get('title'):
        body['title'] = listing['title']
    if (search or {}).get('zone'):
        body['zone'] = search['zone']
    if listing.get('sqm'):
        body['sqm'] = listing['sqm']
    if listing.get('bedrooms') is not None:
        body['bedrooms'] = listing['bedrooms']
    if listing.get('images'):
        body['images'] = listing['images'][:20]
    if listing.get('description'):
        body['description'] = listing['description']
    return body


def build_report(searches_n, found, ingested, blocked_n, error=None):
    """Il rapporto del giro = il battito. Si riportano FATTI: il verdetto
    (runVerdict) lo dà il server, dove è testato."""
    rep = {'ok': True, 'searches': int(searches_n), 'found': int(found),
           'ingested': int(ingested), 'blocked': int(blocked_n)}
    if error:
        rep['ok'] = False
        rep['error'] = str(error)[:300]
    return rep


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


def load_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return {'searches': {}}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(state, f)
    os.replace(tmp, STATE_PATH)


LOCK_DIR = STATE_PATH + '.lock'


def acquire_lock(stale_secs=1200):
    """Un giro alla volta: launchd può accavallare se un run è lento."""
    try:
        os.makedirs(LOCK_DIR)
        with open(os.path.join(LOCK_DIR, 'pid'), 'w') as f:
            f.write(str(os.getpid()))
        return True
    except FileExistsError:
        try:
            age = time.time() - os.path.getmtime(LOCK_DIR)
            if age > stale_secs:
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


def jitter(a=1.5, b=4.0):
    time.sleep(random.uniform(a, b))


def open_profile(playwright):
    os.makedirs(PROFILE_DIR, exist_ok=True)
    return playwright.chromium.launch_persistent_context(
        PROFILE_DIR, headless=not HEADED,
        viewport={'width': 1380, 'height': 900},
        locale='it-IT',
    )


def fetch_page(ctx, url):
    """(html, blocked) — una pagina alla volta, mai un retry aggressivo."""
    page = ctx.new_page()
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=25000)
        time.sleep(random.uniform(1.2, 2.5))  # lasciamo respirare il DOM
        title = page.title()
        html = page.content()
        blocked = looks_blocked(page.url, title, html[:2000])
        return html, blocked
    except Exception as e:
        print(f'  [pagina] {url} → {e.__class__.__name__}: {str(e)[:120]}')
        return None, False
    finally:
        try:
            page.close()
        except Exception:
            pass


# ─────────────────────────────── MODALITÀ ─────────────────────────────────

def mode_dry():
    data = api('/api/homie/searches')
    rows = data.get('searches', [])
    print(f"{len(rows)} ricerche vive (intervallo suggerito: {data.get('suggestedIntervalMinutes')}')")
    state = load_state()
    for s in pick_searches(rows, state):
        st = state.get('searches', {}).get(s['id'], {})
        print(f"  [{s.get('portal')}] {s.get('label')} · zona={s.get('zone') or '—'} · "
              f"visti={len(st.get('known', {}))} · {s['url'][:90]}")


def mode_state():
    state = load_state()
    rows = state.get('searches', {})
    print(f'{len(rows)} ricerche nel registro locale ({STATE_PATH})')
    for sid, st in rows.items():
        last = st.get('lastScanAt', 0)
        ago = f"{int((time.time() - last) / 60)}' fa" if last else 'mai'
        print(f'  {sid}: {len(st.get("known", {}))} visti · ultimo giro {ago}')


def mode_login():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE_DIR, headless=False, viewport={'width': 1380, 'height': 900}, locale='it-IT')
        for url in ('https://www.immobiliare.it/', 'https://www.idealista.it/'):
            ctx.new_page().goto(url, wait_until='domcontentloaded')
        print('Accetta i cookie (ed eventuale login) sui portali aperti.')
        input('Quando hai finito premi INVIO qui… ')
        ctx.close()


def mode_once():
    if not acquire_lock():
        print('[scout] giro precedente ancora in corso — salto.')
        return
    try:
        _run_once()
    finally:
        release_lock()


def _run_once():
    now = time.time()
    state = load_state()
    try:
        data = api('/api/homie/searches')
    except Exception as e:
        # Senza lista non c'è giro: si riporta il guasto (il battito conta).
        try:
            api('/api/homie/searches', 'POST', build_report(0, 0, 0, 0, error=f'searches_get: {e}'))
        except Exception:
            pass
        print(f'[scout] GET ricerche fallita: {e}')
        return

    rows = pick_searches(data.get('searches', []), state)
    if not rows:
        api('/api/homie/searches', 'POST', build_report(0, 0, 0, 0))
        print('[scout] nessuna ricerca viva — giro a vuoto (riportato).')
        return

    found = ingested = blocked_n = 0
    detail_budget = MAX_DETAILS
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = open_profile(p)
        try:
            for s in rows:
                sid = s['id']
                st = state.setdefault('searches', {}).setdefault(sid, {})
                st['lastScanAt'] = time.time()
                html, page_blocked = fetch_page(ctx, s['url'])
                if html is None or page_blocked:
                    blocked_n += 1
                    print(f"  [{s.get('portal')}] {s.get('label')} → BLOCCATA/irraggiungibile")
                    continue
                urls = extract_listing_urls(html, s.get('portal'))
                found += len(urls)
                known = prune_known(st.get('known', {}), now)
                new_urls = pending_urls(urls, known)
                print(f"  [{s.get('portal')}] {s.get('label')} → {len(urls)} annunci, {len(new_urls)} da aprire")

                for u in new_urls:
                    if detail_budget <= 0:
                        break  # non marcato come visto: il prossimo giro lo riprende
                    detail_budget -= 1
                    jitter()
                    dhtml, dblocked = fetch_page(ctx, u)
                    if dblocked:
                        blocked_n += 1
                        break  # questo portale ci ha visto: si molla la presa
                    if dhtml is None:
                        continue
                    listing = parse_listing(dhtml, u)
                    if not listing.get('price'):
                        # Il contatore si SCRIVE sempre nel registro: senza,
                        # ogni giro ripartirebbe da 1 e la scheda muta si
                        # riaprirebbe per sempre (budget bruciato a vuoto).
                        att = (known.get(u) or {}).get('np', 0) + 1
                        known[u] = {'ts': time.time(), 'np': att}
                        if att < NP_MAX_ATTEMPTS:
                            print(f'    {u} → senza prezzo, riprovo al giro dopo')
                        else:
                            print(f'    {u} → senza prezzo per {att} giri: lascio perdere')
                        continue
                    advertiser = detect_advertiser(dhtml, s.get('portal'), s['url'])
                    payload = build_property_payload(listing, s, advertiser)
                    try:
                        r = api('/api/homie/property', 'POST', payload)
                        ingested += 1
                        known[u] = {'ts': time.time()}
                        pushed = len(r.get('pushedTo') or [])
                        print(f"    + {listing.get('title') or u} · €{listing.get('price')} · {advertiser}"
                              + (f' → {pushed} clienti' if pushed else ''))
                    except Exception as e:
                        print(f'    POST fallito per {u}: {str(e)[:120]}')
                st['known'] = known
                save_state(state)
                jitter(2.0, 5.0)
        finally:
            try:
                ctx.close()
            except Exception:
                pass

    rep = build_report(len(rows), found, ingested, blocked_n)
    try:
        api('/api/homie/searches', 'POST', rep)
    except Exception as e:
        print(f'[scout] rapporto non consegnato: {e}')
    print(f"[scout] giro: {len(rows)} ricerche · {found} visti · {ingested} ingeriti · {blocked_n} bloccate")


def main():
    ap = argparse.ArgumentParser(description='Lo Scatto — gli occhi di Homie sul mercato')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--login', action='store_true')
    ap.add_argument('--state', action='store_true')
    ap.add_argument('--once', action='store_true')
    args = ap.parse_args()
    if args.login:
        mode_login()
    elif args.dry:
        mode_dry()
    elif args.state:
        mode_state()
    else:
        mode_once()


if __name__ == '__main__':
    main()
