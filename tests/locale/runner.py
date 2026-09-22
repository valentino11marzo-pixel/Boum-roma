#!/usr/bin/env python3
"""tests/locale/runner.py — IL PONTE sul Mac, senza Mac né Ollama.

Importa bot/boom_locale.py via importlib (nessun effetto al load: il server
parte solo con --serve) e guida le funzioni che DECIDONO, poi il server VERO
su una porta libera contro un Ollama finto in-thread. Le mutazioni che
contano:
  - un token vuoto non autorizza MAI (un ponte senza serratura non si espone);
  - si inoltrano SOLO le tre rotte del contratto: l'API nativa di Ollama
    (/api/pull, /api/delete) resta invisibile da internet;
  - nei log non c'è un posto per il contenuto (la funzione non lo riceve).

python3 tests/locale/runner.py
"""

import http.server
import importlib.util
import json
import os
import socketserver
import sys
import threading
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(HERE, '..', '..', 'bot', 'boom_locale.py')

spec = importlib.util.spec_from_file_location('boom_locale', MOD)
bl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bl)

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


# ── la scelta del modello, dalla memoria ──────────────────────────────────
check('4 GB: nessun modello, e lo dice', bl.pick_model(4)['ok'] is False and 'insufficiente' in bl.pick_model(4)['tier'])
check('8 GB: qwen3:4b, niente visione', bl.pick_model(8)['text'] == 'qwen3:4b' and bl.pick_model(8)['vision'] is None)
check('16 GB: qwen3:8b, niente visione', bl.pick_model(16)['text'] == 'qwen3:8b' and bl.pick_model(16)['vision'] is None)
check('18 GB: 14b ma visione solo da 24', bl.pick_model(18)['text'] == 'qwen3:14b' and bl.pick_model(18)['vision'] is None)
check('24 GB: qwen3:14b + visione', bl.pick_model(24)['text'] == 'qwen3:14b' and bl.pick_model(24)['vision'] == 'qwen2.5vl:7b')
check('32 GB: qwen3:14b + visione', bl.pick_model(32)['text'] == 'qwen3:14b' and bl.pick_model(32)['vision'])
check('64 GB: qwen3:32b + visione', bl.pick_model(64)['text'] == 'qwen3:32b' and bl.pick_model(64)['vision'])
check('memoria ignota (0) → insufficiente, mai un modello a caso', bl.pick_model(0)['ok'] is False)

# ── la serratura ──────────────────────────────────────────────────────────
check('bearer giusto → autorizzato', bl.authorized('Bearer abc123', 'abc123') is True)
check('bearer sbagliato → no', bl.authorized('Bearer abc124', 'abc123') is False)
check('senza header → no', bl.authorized(None, 'abc123') is False)
check('Basic invece di Bearer → no', bl.authorized('Basic YWJjMTIz', 'abc123') is False)
check('MUTAZIONE: token vuoto configurato → MAI autorizzato, nemmeno con header vuoto',
      bl.authorized('', '') is False and bl.authorized('Bearer ', '') is False and bl.authorized(None, '') is False)

# ── le rotte ──────────────────────────────────────────────────────────────
check('/v1/models → ollama', bl.route('/v1/models') == 'ollama')
check('/v1/chat/completions?x=1 → ollama (query ignorata)', bl.route('/v1/chat/completions?x=1') == 'ollama')
check('/v1/audio/transcriptions → stt', bl.route('/v1/audio/transcriptions') == 'stt')
check('/api/pull (API nativa Ollama) → NON inoltrata', bl.route('/api/pull') is None)
check('/api/delete → NON inoltrata', bl.route('/api/delete') is None)
check('/v1/completions (legacy) → NON inoltrata', bl.route('/v1/completions') is None)
check('/ → niente', bl.route('/') is None and bl.route('') is None)

# ── il log non ha un posto per il contenuto ───────────────────────────────
import inspect
sig = inspect.signature(bl.log_line)
check('log_line non riceve body né headers', set(sig.parameters) == {'method', 'path', 'status', 'ms', 'note'})
line = bl.log_line('POST', '/v1/chat/completions?token=SEGRETO', 200, 123.7, 'x')
check('la query string non finisce nel log', 'SEGRETO' not in line and '/v1/chat/completions 200 123ms x' in line)

# ── il blocco per Vercel ──────────────────────────────────────────────────
blk = bl.vercel_block('https://mac.tail.ts.net', 'tok', 'qwen3:14b', 'qwen2.5vl:7b')
check('blocco Vercel: 4 righe con visione', blk.split('\n') == ['LOCAL_AI_URL=https://mac.tail.ts.net', 'LOCAL_AI_MODEL=qwen3:14b', 'LOCAL_AI_VISION_MODEL=qwen2.5vl:7b', 'LOCAL_AI_TOKEN=tok'])
check('blocco Vercel: 3 righe senza visione', len(bl.vercel_block('u', 't', 'm', '').split('\n')) == 3)

# ── il .env ───────────────────────────────────────────────────────────────
tmp = os.path.join(HERE, '.env.test')
with open(tmp, 'w') as f:
    f.write('# commento\nLOCAL_AI_TOKEN="abc"\nLOCALE_MODEL=qwen3:8b\nriga senza uguale\n')
env = bl.load_env(tmp)
os.remove(tmp)
check('.env: virgolette tolte, commenti e righe rotte ignorati', env == {'LOCAL_AI_TOKEN': 'abc', 'LOCALE_MODEL': 'qwen3:8b'})
check('.env assente → vuoto, mai un crollo', bl.load_env('/nonexistent/.env') == {})

# ── il server VERO contro un Ollama finto ─────────────────────────────────
seen = []


class FakeOllama(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _reply(self, obj, status=200):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        seen.append(('GET', self.path))
        if self.path == '/v1/models':
            return self._reply({'data': [{'id': 'qwen3:8b'}]})
        self._reply({'error': 'nope'}, 404)

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(n) or b'{}')
        seen.append(('POST', self.path, body.get('model'), body.get('response_format')))
        self._reply({'choices': [{'message': {'role': 'assistant', 'content': '{"ok":true}'}, 'finish_reason': 'stop'}],
                     'usage': {'prompt_tokens': 10, 'completion_tokens': 3}, 'model': body.get('model')})


class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


fake = TS(('127.0.0.1', 0), FakeOllama)
threading.Thread(target=fake.serve_forever, daemon=True).start()
conf = {'token': 'tok-123', 'model': 'qwen3:8b', 'vision': '', 'ollama': f'http://127.0.0.1:{fake.server_address[1]}',
        'stt': '', 'homie': '', 'port': 0, 'timeout': 5, 'base': 'https://www.boomrome.com'}
bridge = bl.ThreadedServer(('127.0.0.1', 0), bl.make_handler(conf))
threading.Thread(target=bridge.serve_forever, daemon=True).start()
B = f'http://127.0.0.1:{bridge.server_address[1]}'


def call(path, headers=None, data=None):
    req = urllib.request.Request(B + path, data=data, headers=headers or {}, method='POST' if data else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


s, j = call('/health')
check('/health senza auth → 200 {ok:true} e basta', s == 200 and j == {'ok': True})
s, j = call('/v1/models')
check('/v1/models senza bearer → 401, e Ollama NON viene toccato', s == 401 and not seen)
s, j = call('/v1/models', {'Authorization': 'Bearer sbagliato'})
check('bearer sbagliato → 401', s == 401 and not seen)
H = {'Authorization': 'Bearer tok-123', 'Content-Type': 'application/json'}
s, j = call('/v1/models', H)
check('/v1/models col bearer → passa a Ollama e torna la lista', s == 200 and j['data'][0]['id'] == 'qwen3:8b' and seen[-1] == ('GET', '/v1/models'))
s, j = call('/api/pull', H)
check('/api/pull col bearer → 404 (API nativa mai esposta)', s == 404 and seen[-1] == ('GET', '/v1/models'))
body = json.dumps({'model': 'qwen3:8b', 'messages': [{'role': 'user', 'content': 'x'}], 'response_format': {'type': 'json_object'}}).encode()
s, j = call('/v1/chat/completions', H, body)
check('completion: body inoltrato intatto (modello e json mode), risposta di Ollama restituita',
      s == 200 and j['choices'][0]['message']['content'] == '{"ok":true}' and seen[-1] == ('POST', '/v1/chat/completions', 'qwen3:8b', {'type': 'json_object'}))
s, j = call('/v1/audio/transcriptions', H, b'x')
check('STT senza STT_URL → 501 dichiarato', s == 501 and j.get('error') == 'stt_unconfigured')
big_hdr = dict(H); big_hdr['Content-Length'] = str(bl.MAX_BODY + 1)
req = urllib.request.Request(B + '/v1/chat/completions', data=b'{}', headers=big_hdr, method='POST')
try:
    urllib.request.urlopen(req, timeout=5)
    s = 200
except urllib.error.HTTPError as e:
    s = e.code
except Exception:
    s = -1
check('body dichiarato oltre 12 MB → 413', s == 413)
fake.shutdown()
fake.server_close()   # la porta va CHIUSA: un socket in ascolto senza nessuno dietro fa aspettare, non rifiuta
s, j = call('/v1/models', H)
check('Ollama spento → 502 con codice, mai una traccia', s == 502 and j.get('error') == 'upstream_unreachable')
bridge.shutdown()

# ── il serve non parte senza serratura ────────────────────────────────────
import io, contextlib
out = io.StringIO()
code = None
with contextlib.redirect_stdout(out):
    try:
        bl.serve({**conf, 'token': ''}, port=0)
    except SystemExit as e:
        code = e.code
check('MUTAZIONE: senza LOCAL_AI_TOKEN il server esce con codice 2 e lo dice', code == 2 and 'serratura' in out.getvalue())

# ── l'installer usa lo stesso picker (una copia sola della tabella) ───────
inst = open(os.path.join(HERE, '..', '..', 'bot', 'install_locale.sh'), encoding='utf-8').read()
check('install_locale.sh chiede il modello a boom_locale.py --pick-model (mai una seconda tabella)', '--pick-model' in inst and 'qwen3:' not in inst)
check('install_locale.sh: contesto lungo e keep-alive per Ollama', 'OLLAMA_CONTEXT_LENGTH' in inst and 'OLLAMA_KEEP_ALIVE' in inst)
check('install_locale.sh: token generato con openssl, mai scritto nel repo', 'openssl rand -hex 24' in inst)
check('install_locale.sh: .env mai clobberato (ensure_env)', 'ensure_env' in inst and 'chmod 600' in inst)

# ── Ollama senza finestra (22/09: sul Mac mini non c'era affatto) ─────────
# Se manca lo installa (formula Homebrew), e senza l'app lo tiene su come
# LaunchAgent NOSTRO con le variabili NEL plist: `launchctl setenv` non
# sopravvive al riavvio, un plist sì. Un solo server su :11434, legato a
# 127.0.0.1 (la serratura è il ponte).
check('install_locale.sh: Ollama assente → brew install ollama, mai "scaricalo e apri l\'app" come unica via',
      'brew install ollama' in inst)
i0 = inst.find('com.boom.ollama.plist" <<PLIST')
i1 = inst.find('\nPLIST', i0)
plist = inst[i0:i1] if i0 > 0 and i1 > i0 else ''
check('install_locale.sh: LaunchAgent com.boom.ollama con contesto e keep-alive NEL plist',
      '<string>com.boom.ollama</string>' in plist
      and '<key>OLLAMA_CONTEXT_LENGTH</key>' in plist and '<string>16384</string>' in plist
      and '<key>OLLAMA_KEEP_ALIVE</key>' in plist and '<string>-1</string>' in plist
      and '<key>KeepAlive</key>' in plist and '<key>RunAtLoad</key>' in plist)
check('install_locale.sh: il server Ollama del LaunchAgent è legato a 127.0.0.1 (mai esposto)',
      '<key>OLLAMA_HOST</key>' in plist and '<string>127.0.0.1:11434</string>' in plist)
check('install_locale.sh: un server estraneo su :11434 viene fermato SOLO se il nostro agente non è caricato',
      "launchctl list 2>/dev/null | grep -q 'com\\.boom\\.ollama$'" in inst and 'pkill -x ollama' in inst
      and inst.find("grep -q 'com\\.boom\\.ollama$'") < inst.find('pkill -x ollama'))
check('install_locale.sh: il ramo app resta (launchctl setenv + riapertura), dichiarato non persistente',
      'launchctl setenv OLLAMA_CONTEXT_LENGTH 16384' in inst and 'open -a Ollama' in inst
      and 'sopravvivono a un riavvio' in inst)

print(f"\n{'✓' if not failed else '✗'} locale: {passed} passed, {failed} failed")
if bad:
    print('  -', '\n  - '.join(bad))
sys.exit(1 if failed else 0)
