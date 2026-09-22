#!/usr/bin/env python3
"""boom_locale.py — IL PONTE fra la Centrale AI (server) e i modelli sul Mac.

Il server (api/_ai.js) parla a un endpoint OpenAI-compatibile dietro un
tunnel https, con un bearer. Sul Mac il modello lo serve Ollama
(http://127.0.0.1:11434), che però NON ha autenticazione: esposto nudo su
internet, chiunque potrebbe farci girare i propri prompt — e i documenti dei
clienti passano di qui. Questo script è la porta con la serratura:

    Vercel ──https (Tailscale Funnel)──► boom_locale.py :8088 ──► Ollama :11434
                                         │ Authorization: Bearer LOCAL_AI_TOKEN
                                         │ solo /v1/models, /v1/chat/completions
                                         │ (e /v1/audio/transcriptions → STT_URL)
                                         └ nei log: metodo, rotta, stato, ms — MAI il contenuto

Regole (verificate in tests/locale/runner.py):
  · senza LOCAL_AI_TOKEN nel .env il server NON PARTE: un ponte senza
    serratura non si espone mai, nemmeno per provare;
  · si inoltrano SOLO le tre rotte del contratto; tutto il resto è 404
    (l'API nativa di Ollama — /api/pull, /api/delete — resta invisibile);
  · /health risponde {ok:true} senza auth e senza dettagli (è la sonda
    del tunnel, non dice quali modelli ci sono);
  · body oltre 12 MB → 413; Ollama che non risponde → 502/504 con un
    codice, mai una traccia.

Uso:
  python3 boom_locale.py --serve            (launchd: com.boom.locale)
  python3 boom_locale.py --pick-model       stampa il modello adatto a QUESTO Mac
  python3 boom_locale.py --test             prova il ponte in locale (Ollama vivo, JSON mode)
  python3 boom_locale.py --smoke            …e chiede al server se ci vede (HOMIE_SECRET)

.env accanto allo script (lo scrive install_locale.sh):
  LOCAL_AI_TOKEN=…        la serratura (lo stesso valore va su Vercel)
  LOCALE_MODEL=qwen3:14b  il modello testo (LOCALE_VISION_MODEL per le immagini)
  OLLAMA_URL=http://127.0.0.1:11434
  STT_URL=                opzionale: server Whisper OpenAI-compatibile
  HOMIE_SECRET=…          solo per --smoke (legge /api/ai/status)
"""

import argparse
import hmac
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def load_env(path=None):
    """Lettura minima del .env: KEY=VALUE, righe vuote e # ignorate, virgolette tolte.
    Niente dipendenze: il ponte deve partire anche su un Mac appena installato."""
    path = path or os.path.join(HERE, '.env')
    out = {}
    try:
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return out


def cfg(env=None):
    e = dict(load_env())
    e.update({k: v for k, v in (env or os.environ).items() if k in (
        'LOCAL_AI_TOKEN', 'LOCALE_MODEL', 'LOCALE_VISION_MODEL', 'OLLAMA_URL', 'STT_URL',
        'HOMIE_SECRET', 'LOCALE_PORT', 'LOCALE_UPSTREAM_TIMEOUT', 'BOOM_BASE')})
    return {
        'token': e.get('LOCAL_AI_TOKEN', ''),
        'model': e.get('LOCALE_MODEL', ''),
        'vision': e.get('LOCALE_VISION_MODEL', ''),
        'ollama': (e.get('OLLAMA_URL') or 'http://127.0.0.1:11434').rstrip('/'),
        'stt': (e.get('STT_URL') or '').rstrip('/'),
        'homie': e.get('HOMIE_SECRET', ''),
        'port': int(e.get('LOCALE_PORT') or 8088),
        'timeout': float(e.get('LOCALE_UPSTREAM_TIMEOUT') or 120),
        'base': (e.get('BOOM_BASE') or 'https://www.boomrome.com').rstrip('/'),
    }


# ── La scelta del modello, dalla memoria VERA del Mac ────────────────────────
# Memoria unificata → modello testo (Ollama tag) + modello visione se ci sta
# accanto al testo. Numeri di settembre 2026; il registro sul server non ha
# preferenze: il nome va copiato tale e quale in LOCAL_AI_MODEL.
def pick_model(mem_gb):
    gb = float(mem_gb or 0)
    if gb < 6:
        return {'ok': False, 'text': None, 'vision': None, 'tier': 'insufficiente',
                'note': 'sotto i 6 GB nessun modello utile gira accanto al sistema'}
    if gb <= 8:
        return {'ok': True, 'text': 'qwen3:4b', 'vision': None, 'tier': '8 GB',
                'note': 'solo classificazione corta (brain, phone); niente visione'}
    if gb <= 16:
        return {'ok': True, 'text': 'qwen3:8b', 'vision': None, 'tier': '16 GB',
                'note': 'il caso base: brain, inbox, interprete, canone; visione no (non ci sta col testo)'}
    if gb <= 32:
        return {'ok': True, 'text': 'qwen3:14b', 'vision': 'qwen2.5vl:7b' if gb >= 24 else None, 'tier': '24–32 GB',
                'note': 'tutto il registro localOk' + ('' if gb >= 24 else ' — visione solo da 24 GB')}
    return {'ok': True, 'text': 'qwen3:32b', 'vision': 'qwen2.5vl:7b', 'tier': '64 GB+',
            'note': 'estrazioni vicine a haiku'}


def mac_memory_gb():
    try:
        b = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], timeout=5, stderr=subprocess.DEVNULL).decode().strip())
        return round(b / (1024 ** 3))
    except Exception:
        return 0


def mac_chip():
    try:
        return subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string'], timeout=5, stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return ''


# ── Le regole della porta ────────────────────────────────────────────────────
ROUTES = {
    '/v1/models': 'ollama',
    '/v1/chat/completions': 'ollama',
    '/v1/audio/transcriptions': 'stt',
}
MAX_BODY = 12 * 1024 * 1024


def route(path):
    """La rotta inoltrabile per un path (query string ignorata), o None."""
    p = (path or '').split('?', 1)[0].rstrip('/')
    return ROUTES.get(p)


def authorized(auth_header, token):
    """Bearer giusto → True. Token vuoto → SEMPRE False: senza serratura non si apre."""
    if not token:
        return False
    h = str(auth_header or '')
    if not h.startswith('Bearer '):
        return False
    return hmac.compare_digest(h[7:].strip(), token)


def log_line(method, path, status, ms, note=''):
    """Forma e misura, mai contenuto: non esiste un parametro per il body."""
    p = (path or '').split('?', 1)[0]
    return f"{time.strftime('%Y-%m-%d %H:%M:%S')} {method} {p} {status} {int(ms)}ms{(' ' + note) if note else ''}"


def vercel_block(url, token, model, vision=''):
    lines = [f'LOCAL_AI_URL={url}', f'LOCAL_AI_MODEL={model}']
    if vision:
        lines.append(f'LOCAL_AI_VISION_MODEL={vision}')
    lines.append(f'LOCAL_AI_TOKEN={token}')
    return '\n'.join(lines)


# ── Il server ────────────────────────────────────────────────────────────────
def make_handler(conf):
    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = 'boom-locale/1.0'
        protocol_version = 'HTTP/1.1'

        def log_message(self, fmt, *args):  # silenzia il log di default (porta l'IP e la query)
            pass

        def _send(self, status, body, ctype='application/json'):
            data = body if isinstance(body, (bytes, bytearray)) else json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _handle(self):
            t0 = time.time()
            path = self.path
            if path.split('?', 1)[0].rstrip('/') == '/health':
                self._send(200, {'ok': True})
                return
            if not authorized(self.headers.get('Authorization'), conf['token']):
                self._send(401, {'error': 'unauthorized'})
                print(log_line(self.command, path, 401, (time.time() - t0) * 1000), flush=True)
                return
            target = route(path)
            if not target:
                self._send(404, {'error': 'not_found'})
                print(log_line(self.command, path, 404, (time.time() - t0) * 1000), flush=True)
                return
            if target == 'stt' and not conf['stt']:
                self._send(501, {'error': 'stt_unconfigured'})
                print(log_line(self.command, path, 501, (time.time() - t0) * 1000), flush=True)
                return
            length = int(self.headers.get('Content-Length') or 0)
            if length > MAX_BODY:
                self._send(413, {'error': 'too_large'})
                print(log_line(self.command, path, 413, (time.time() - t0) * 1000), flush=True)
                return
            body = self.rfile.read(length) if length else None
            base = conf['ollama'] if target == 'ollama' else conf['stt']
            req = urllib.request.Request(base + path, data=body, method=self.command)
            ctype = self.headers.get('Content-Type')
            if ctype:
                req.add_header('Content-Type', ctype)
            status, note = 502, ''
            try:
                with urllib.request.urlopen(req, timeout=conf['timeout']) as r:
                    data = r.read()
                    status = r.status
                    self._send(status, data, r.headers.get('Content-Type') or 'application/json')
            except urllib.error.HTTPError as e:
                status = e.code
                data = e.read()
                self._send(status, data, e.headers.get('Content-Type') or 'application/json')
                note = 'upstream_http'
            except urllib.error.URLError as e:
                status = 504 if 'timed out' in str(e.reason).lower() else 502
                note = 'upstream_timeout' if status == 504 else 'upstream_unreachable'
                self._send(status, {'error': note})
            except Exception as e:  # noqa: BLE001
                status, note = 502, 'upstream_error:' + type(e).__name__
                self._send(status, {'error': 'upstream_error'})
            print(log_line(self.command, path, status, (time.time() - t0) * 1000, note), flush=True)

        def do_GET(self):
            self._handle()

        def do_POST(self):
            self._handle()

    return Handler


class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve(conf, port=None, bind='127.0.0.1'):
    if not conf['token']:
        print('ERRORE: LOCAL_AI_TOKEN mancante nel .env — un ponte senza serratura non si espone. '
              'Genera: openssl rand -hex 24', flush=True)
        sys.exit(2)
    srv = ThreadedServer((bind, port or conf['port']), make_handler(conf))
    print(f"boom-locale in ascolto su http://{bind}:{srv.server_address[1]} → {conf['ollama']}"
          + (f" · STT {conf['stt']}" if conf['stt'] else ' · STT non configurato'), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


# ── Le prove ─────────────────────────────────────────────────────────────────
def _get(url, headers=None, data=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method='POST' if data else 'GET')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def self_test(conf, base=None):
    """Prova il ponte come lo userà il server: /health, /v1/models col token, una
    completion in JSON mode. Stampa OK/KO col perché e i millisecondi."""
    base = (base or f"http://127.0.0.1:{conf['port']}").rstrip('/')
    ok_all = True

    def step(name, fn):
        nonlocal ok_all
        t0 = time.time()
        try:
            out = fn()
            print(f"OK  {name} ({int((time.time() - t0) * 1000)}ms){(' — ' + out) if out else ''}")
        except Exception as e:  # noqa: BLE001
            ok_all = False
            print(f"KO  {name} ({int((time.time() - t0) * 1000)}ms) — {str(e)[:160]}")

    hdr = {'Authorization': 'Bearer ' + conf['token'], 'Content-Type': 'application/json'}

    def t_health():
        s, b = _get(base + '/health', timeout=10)
        assert s == 200 and json.loads(b).get('ok') is True, f'status {s}'
        return ''

    def t_noauth():
        try:
            _get(base + '/v1/models', timeout=10)
        except urllib.error.HTTPError as e:
            assert e.code == 401, f'atteso 401, avuto {e.code}'
            return 'senza bearer → 401 (la serratura tiene)'
        raise AssertionError('senza bearer ha risposto 200: la serratura NON tiene')

    def t_models():
        s, b = _get(base + '/v1/models', hdr, timeout=20)
        ids = [m.get('id') for m in json.loads(b).get('data', [])]
        assert ids, 'nessun modello: hai fatto `ollama pull`?'
        if conf['model'] and conf['model'] not in ids and not any(i.startswith(conf['model']) for i in ids):
            raise AssertionError(f"{conf['model']} non è fra i modelli di Ollama: {', '.join(ids[:6])}")
        return ', '.join(ids[:6])

    def t_json():
        body = json.dumps({
            'model': conf['model'], 'stream': False, 'max_tokens': 60, 'temperature': 0,
            'response_format': {'type': 'json_object'},
            'messages': [{'role': 'system', 'content': 'Rispondi SOLO con JSON.'},
                         {'role': 'user', 'content': 'Scrivi esattamente {"ok": true}'}],
        }).encode()
        s, b = _get(base + '/v1/chat/completions', hdr, body, timeout=180)
        j = json.loads(b)
        txt = j['choices'][0]['message']['content']
        txt = txt.split('</think>')[-1].strip() if '</think>' in txt else txt.strip()
        parsed = json.loads(txt[txt.find('{'):txt.rfind('}') + 1])
        assert parsed.get('ok') is True, f'JSON diverso: {txt[:80]}'
        u = j.get('usage') or {}
        return f"json mode ok · {u.get('prompt_tokens', '?')} in / {u.get('completion_tokens', '?')} out"

    step('/health senza auth', t_health)
    step('/v1/models senza bearer', t_noauth)
    step('/v1/models col bearer', t_models)
    if conf['model']:
        step(f"completion JSON ({conf['model']})", t_json)
    else:
        ok_all = False
        print('KO  LOCALE_MODEL mancante nel .env')
    return ok_all


def smoke(conf):
    """Il giro completo: il ponte in locale, poi la parola al SERVER."""
    ok = self_test(conf)
    if not conf['homie']:
        print('--  HOMIE_SECRET assente: salto la domanda al server (mettilo nel .env per --smoke)')
        return ok
    try:
        req = urllib.request.Request(conf['base'] + '/api/ai/status?probe=1', headers={'X-Homie-Secret': conf['homie']})
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.loads(r.read())
        loc = j.get('local') or {}
        print(f"{'OK ' if loc.get('reachable') else 'KO '} il server {'VEDE' if loc.get('reachable') else 'NON vede'} il locale"
              f" · configurato={loc.get('configured')} · acceso={loc.get('enabled')} · {loc.get('ms', 0)}ms"
              f"{(' · modelli: ' + ', '.join(loc.get('models') or [])) if loc.get('models') else ''}"
              f"{(' · errore ' + loc.get('error')) if loc.get('error') else ''}")
        if not loc.get('configured'):
            print('    → su Vercel mancano LOCAL_AI_URL / LOCAL_AI_TOKEN (vedi il blocco stampato dall\'installer), poi redeploy')
        elif not loc.get('reachable'):
            print('    → il tunnel non risponde: `tailscale funnel status` sul Mac, e il token deve essere IDENTICO')
        elif not loc.get('enabled'):
            print('    → il ponte funziona: su Telegram /ai → «🟢 Accendi il locale»')
        return ok and bool(loc.get('reachable'))
    except Exception as e:  # noqa: BLE001
        print('KO  /api/ai/status non risponde:', str(e)[:120])
        return False


def main(argv=None):
    ap = argparse.ArgumentParser(description='Il ponte fra la Centrale AI e i modelli sul Mac')
    ap.add_argument('--serve', action='store_true')
    ap.add_argument('--port', type=int)
    ap.add_argument('--pick-model', action='store_true')
    ap.add_argument('--mem-gb', type=float)
    ap.add_argument('--test', action='store_true')
    ap.add_argument('--smoke', action='store_true')
    a = ap.parse_args(argv)
    conf = cfg()
    if a.pick_model:
        gb = a.mem_gb if a.mem_gb is not None else mac_memory_gb()
        p = pick_model(gb)
        print(json.dumps({'memGb': gb, 'chip': mac_chip(), **p}))
        return 0 if p['ok'] else 1
    if a.test:
        return 0 if self_test(conf) else 1
    if a.smoke:
        return 0 if smoke(conf) else 1
    serve(conf, a.port)
    return 0


if __name__ == '__main__':
    sys.exit(main())
