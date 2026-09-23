"""Synthetic stdio link to the real JS handler; no network or real sender."""
import json
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'homie-bridge/agent-os/bin'))
from wa_outbox_single import SingleOutbox, TargetReceipts


def forbidden(event, args):
    if event.startswith('socket.') or event in ('subprocess.Popen', 'os.system', 'os.posix_spawn'):
        raise RuntimeError('external_io_forbidden')


sys.addaudithook(forbidden)
config = json.loads(sys.stdin.readline())


def emit(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


class StdioTransport:
    def post(self, path, payload, timeout):
        emit({'kind': 'request', 'path': path, 'payload': payload})
        response = json.loads(sys.stdin.readline())
        if response.get('transportError'):
            raise OSError('synthetic_lost_response')
        return response['status'], response['body']


class SyntheticSender:
    def available(self):
        return True

    def __call__(self, phone, text):
        emit({'kind': 'synthetic_send', 'phone': phone, 'text': text})
        if config.get('crashDuringSend'):
            os._exit(17)
        return 0


unit = SingleOutbox(TargetReceipts(config['receipts']), StdioTransport(), SyntheticSender(),
                   lambda: True, lambda: True)
result = unit.run(config.get('operation', 'send'), config['actionId'], config['revision'],
                  config['payloadHash'], execute=True)
emit({'kind': 'result', 'result': result})
