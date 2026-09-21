#!/usr/bin/env python3
"""Offline only: real temporary receipts; fake network, sender and service metadata."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib import error

BIN = Path(__file__).resolve().parents[1] / 'bin'
sys.path.insert(0, str(BIN))
import wa_outbox as baseline
import wa_outbox_single as single

ACTION = 'sgreply_' + 'a' * 40
OTHER = 'sgreply_' + 'b' * 40
REVISION = 'approved-revision-1'
MESSAGE = {'actionId': ACTION, 'phone': '+390000000000', 'text': 'SINTETICO\nUnicode è 🌻\t fine  '}
DIGEST = single.wire_hash(MESSAGE)
BINDING = {'protocol': single.PROTOCOL, 'revision': REVISION, 'payloadHash': DIGEST}


class Crash(BaseException):
    pass


class FakeSender:
    def __init__(self):
        self.calls = []
        self.ready = True
        self.hook = None
        self.result = 0

    def available(self):
        return self.ready

    def __call__(self, phone, text):
        self.calls.append((phone, text))
        if self.hook:
            self.hook()
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


class FakeServer:
    """Protocol fake only; actual endpoint/atomic Firestore covered by JS suite."""
    def __init__(self):
        self.calls = []
        self.hook = None
        self.claimed = False
        self.ack_response = None

    def post(self, path, payload, timeout):
        self.calls.append((path, copy.deepcopy(payload)))
        assert path == single.ENDPOINT, 'No general pull or mirror allowed'
        if self.hook:
            response = self.hook(payload)
            if response is not None:
                if isinstance(response, BaseException):
                    raise response
                return response
        data = {'ok': True, 'actionId': ACTION, **BINDING}
        if payload['op'] == 'inspect':
            return 200, data
        if payload['op'] == 'claim':
            if self.claimed:
                return 409, {'ok': False}
            self.claimed = True
            return 200, {**data, 'messages': [copy.deepcopy(MESSAGE)]}
        if payload['op'] == 'ack':
            if self.ack_response:
                return self.ack_response
            return 200, {**data, 'delivery': 'sent' if payload['ok'] else 'failed'}
        raise AssertionError('Unknown operation')


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.directory = self.root / 'wa-outbox-receipts'
        self.server, self.sender = FakeServer(), FakeSender()
        self.hold, self.unloaded, self.stop = True, True, False
        self.receipts = single.TargetReceipts(self.directory)
        self.worker = self.make_worker()
        self.addCleanup(self.receipts.close)
        # Fail closed if any test accidentally calls actual transport/helper.
        self.addCleanup(patch.stopall)
        patch('socket.socket', side_effect=AssertionError('Network forbidden in synthetic tests')).start()
        patch('socket.getaddrinfo', side_effect=AssertionError('DNS forbidden in synthetic tests')).start()
        patch('socket.create_connection', side_effect=AssertionError('Connections forbidden in synthetic tests')).start()
        patch('subprocess.run', side_effect=AssertionError('Subprocess forbidden in synthetic tests')).start()

    def make_worker(self, receipts=None, sender=None, server=None):
        return single.SingleOutbox(receipts or self.receipts, server or self.server, sender or self.sender,
                                   lambda: self.hold, lambda: self.unloaded, lambda: self.stop)

    def run_operation(self, operation='send', **kwargs):
        return self.worker.run(operation, kwargs.get('action', ACTION), kwargs.get('revision', REVISION),
                               kwargs.get('digest', DIGEST), kwargs.get('execute', True))

    def receipt_path(self, action=ACTION):
        return self.directory / (baseline.action_key(action) + '.json')

    def read_receipt(self):
        return json.loads(self.receipt_path().read_text())

    def write_receipt(self, state='received', **updates):
        self.assertTrue(self.receipts.acquire())
        row = {'actionId': ACTION, 'payloadHash': baseline.fingerprint(MESSAGE), 'wireBinding': BINDING,
               'state': state, 'ackStatus': 'pending', 'receivedAt': baseline.stamp()}
        if state in ('sending', 'sent', 'uncertain'):
            row['startedAt'] = baseline.stamp()
        if state in single.TERMINAL:
            row['finishedAt'] = baseline.stamp()
        row.update(updates)
        self.receipts.write(row)
        self.receipts.close()
        return row

    def test_01_inspect_readonly_metadata_and_no_local_artifacts(self):
        result = self.worker.inspect(ACTION)
        self.assertEqual(result['outcome'], 'inspected')
        self.assertEqual(result['payloadHash'], DIGEST)
        self.assertFalse(self.directory.exists())
        self.assertEqual([c[1]['op'] for c in self.server.calls], ['inspect'])
        self.assertEqual(self.sender.calls, [])
        self.assertNotIn('text', result)
        self.assertEqual(result['sessionReadiness'], 'not_verified')
        self.server.hook = lambda p: (200, {'ok': True, 'actionId': ACTION, **BINDING, 'messages': [MESSAGE]})
        self.assertEqual(self.worker.inspect(ACTION)['outcome'], 'inspect_invalid')
        self.assertFalse(self.directory.exists())

    def test_02_invalid_selection_and_explicit_execution_required(self):
        for action in (None, '', 'legacy-123', ACTION + 'x', 'sgreply_' + 'A' * 40):
            self.assertEqual(self.run_operation(action=action)['outcome'], 'invalid_selection')
        for revision in ('', None, '\nsecret', '\x7f', '\ud800', '🌻' * 129):
            self.assertEqual(self.run_operation(revision=revision)['outcome'], 'invalid_selection')
        for digest in ('bad', None, '0' * 63):
            self.assertEqual(self.run_operation(digest=digest)['outcome'], 'invalid_selection')
        self.assertTrue(single.valid_revision('🌻' * 128))
        self.assertTrue(single.valid_revision('r' * 256))
        self.assertEqual(self.run_operation(execute=False)['outcome'], 'execution_not_authorized')
        self.assertFalse(self.directory.exists())
        self.assertEqual(self.server.calls, [])
        self.assertEqual(self.sender.calls, [])

    def test_03_binding_context_approval_rejection_and_inspect_claim_race(self):
        self.assertEqual(self.worker.inspect(ACTION)['outcome'], 'inspected')
        # Server rejects changed context/revision/approval during its atomic claim.
        self.server.hook = lambda p: (409, {'ok': False})
        self.assertEqual(self.run_operation()['outcome'], 'claim_rejected')
        self.assertEqual(self.sender.calls, [])
        self.assertFalse(self.receipt_path().exists())
        self.assertEqual(self.server.calls[-1][1], {**BINDING, 'op': 'claim', 'actionId': ACTION})

    def test_04_target_only_and_existing_permanent_server_claim(self):
        self.server.claimed = True
        self.assertEqual(self.run_operation()['outcome'], 'claim_rejected')
        self.assertEqual(len(self.server.calls), 1)
        self.assertEqual(self.server.calls[0][1]['actionId'], ACTION)
        self.assertEqual(self.sender.calls, [])
        self.assertFalse(self.receipt_path().exists())

    def test_05_old_endpoint_redirect_unknown_protocol_http_no_fallback(self):
        for status in (0, 301, 302, 307, 308, 400, 401, 403, 404, 405, 408, 409, 429, 500, 503, 504):
            self.server.hook = lambda p, status=status: (status, {})
            outcome = self.run_operation()['outcome']
            expected = ('endpoint_unavailable' if status == 404 else 'claim_rejected'
                        if status in (400, 401, 405, 409) else 'claim_outcome_unknown')
            self.assertEqual(outcome, expected, status)
        self.server.hook = lambda p: (200, {'ok': True, 'actionId': ACTION, **{**BINDING, 'protocol': 'future'}, 'messages': [MESSAGE]})
        self.assertEqual(self.run_operation()['outcome'], 'claim_invalid')
        self.assertTrue(all(c[0] == single.ENDPOINT and c[1]['op'] == 'claim' for c in self.server.calls))
        self.assertEqual(self.sender.calls, [])

    def test_06_wrong_target_multiple_payload_hash_and_malformed_response(self):
        good = {'ok': True, 'actionId': ACTION, **BINDING, 'messages': [MESSAGE]}
        cases = [None, [], {}, {**good, 'messages': []}, {**good, 'messages': [MESSAGE, {**MESSAGE, 'actionId': OTHER}]},
                 {**good, 'actionId': OTHER}, {**good, 'messages': [{**MESSAGE, 'actionId': OTHER}]},
                 {**good, 'messages': [{**MESSAGE, 'text': 'changed'}]}, {**good, 'payloadHash': '0' * 64},
                 {**good, 'revision': 'other'}, {**good, 'messages': [{**MESSAGE, 'phone': 'invalid'}]}]
        for data in cases:
            self.server.hook = lambda p, data=data: (200, data)
            self.assertEqual(self.run_operation()['outcome'], 'claim_invalid')
        self.assertEqual(self.sender.calls, [])
        self.assertFalse(self.receipt_path().exists())

    def test_07_shared_lock_and_server_claim_prevent_competing_senders(self):
        self.assertTrue(self.receipts.acquire())
        second_receipts = single.TargetReceipts(self.directory)
        second = self.make_worker(receipts=second_receipts)
        self.assertEqual(second.run('send', ACTION, REVISION, DIGEST, True)['outcome'], 'locked')
        self.assertEqual(self.server.calls, [])
        self.receipts.close()
        self.assertEqual(self.run_operation()['outcome'], 'ack_registered')
        # A separate host/ledger still has to obtain the same server claim.
        remote_receipts = single.TargetReceipts(self.root / 'second-host')
        remote = self.make_worker(receipts=remote_receipts)
        self.assertEqual(remote.run('send', ACTION, REVISION, DIGEST, True)['outcome'], 'claim_rejected')
        self.assertEqual(len(self.sender.calls), 1)

    def test_08_corrupt_target_or_binding_stops_without_rewrite(self):
        original = self.write_receipt()
        cases = ['{broken', json.dumps({**original, 'payloadHash': 'bad'}),
                 json.dumps({**original, 'wireBinding': {**BINDING, 'revision': 'wrong'}}),
                 json.dumps({**original, 'actionId': OTHER}), json.dumps({**original, 'state': 'magic'}),
                 json.dumps({**original, 'ackStatus': 'acked'}), json.dumps({**original, 'phone': MESSAGE['phone']})]
        for raw in cases:
            self.receipt_path().write_text(raw)
            self.assertEqual(self.run_operation()['outcome'], 'local_state_error')
            self.assertEqual(self.receipt_path().read_text(), raw)
        self.assertEqual(self.server.calls, [])
        self.assertEqual(self.sender.calls, [])

    def test_09_crash_boundaries_recover_without_resend(self):
        # Interrupt after each durable pre/post send write. No fresh claim on restart.
        for crash_at, expected, sends in [(1, 'not_sent', 0), (2, 'uncertain', 0), (3, 'sent', 1), (4, 'sent', 1)]:
            with self.subTest(crash_at=crash_at):
                directory = self.root / ('crash-' + str(crash_at))
                class CrashReceipts(single.TargetReceipts):
                    count = 0
                    def write(inner, row):
                        super(CrashReceipts, inner).write(row)
                        inner.count += 1
                        if inner.count == crash_at:
                            raise Crash()
                journal = CrashReceipts(directory)
                server, sender = FakeServer(), FakeSender()
                worker = self.make_worker(receipts=journal, sender=sender, server=server)
                with self.assertRaises(Crash):
                    worker.run('send', ACTION, REVISION, DIGEST, True)
                restart = self.make_worker(receipts=single.TargetReceipts(directory), sender=sender, server=server)
                result = restart.run('send', ACTION, REVISION, DIGEST, True)
                self.assertEqual(result['outcome'], 'existing_receipt')
                self.assertEqual(result['state'], expected)
                self.assertEqual(len(sender.calls), sends)
                self.assertEqual(sum(c[1]['op'] == 'claim' for c in server.calls), 1)
                self.assertIn(restart.run('ack', ACTION, REVISION, DIGEST, True)['outcome'], ('ack_registered', 'already_acked'))
                self.assertEqual(len(sender.calls), sends)
        # A crash inside the sender leaves sending; the next start says uncertain.
        self.sender.result = Crash()
        with self.assertRaises(Crash):
            self.run_operation()
        self.assertEqual(self.read_receipt()['state'], 'sending')
        self.assertEqual(self.run_operation()['state'], 'uncertain')
        self.assertEqual(len(self.sender.calls), 1)

    def test_10_ack_lost_5xx_duplicate_wrong_binding_and_recovery_only(self):
        self.server.ack_response = (503, {})
        self.assertEqual(self.run_operation()['outcome'], 'ack_pending')
        self.assertEqual(self.run_operation()['outcome'], 'existing_receipt')
        self.assertEqual(len(self.sender.calls), 1)
        self.server.ack_response = (200, {'ok': True, 'actionId': OTHER, **BINDING, 'delivery': 'sent'})
        self.assertEqual(self.run_operation('ack')['outcome'], 'ack_invalid')
        self.assertEqual(self.read_receipt()['ackStatus'], 'pending')
        self.server.ack_response = (200, {'ok': True, 'actionId': ACTION, **BINDING, 'delivery': 'failed'})
        self.assertEqual(self.run_operation('ack')['outcome'], 'ack_invalid')
        self.server.ack_response = None
        self.assertEqual(self.run_operation('ack')['outcome'], 'ack_registered')
        count = len(self.server.calls)
        self.assertEqual(self.run_operation('ack')['outcome'], 'already_acked')
        self.assertEqual(len(self.server.calls), count)
        self.assertEqual(len(self.sender.calls), 1)
        self.assertTrue(all(c[1]['actionId'] == ACTION for c in self.server.calls))
        self.assertEqual(sum(c[1]['op'] == 'claim' for c in self.server.calls), 1)

    def test_11_other_pending_corrupt_receipts_never_read_or_modified(self):
        self.assertTrue(self.receipts.acquire())
        other = self.receipt_path(OTHER)
        other.write_text('{deliberately invalid foreign receipt')
        other.chmod(0o600)
        before = other.read_bytes()
        self.receipts.close()
        self.assertEqual(self.run_operation()['outcome'], 'ack_registered')
        self.assertEqual(other.read_bytes(), before)
        self.assertEqual(len(self.sender.calls), 1)
        self.assertTrue(all(c[1]['actionId'] == ACTION for c in self.server.calls))

    def test_12_hold_service_and_stop_guards_rechecked_at_send_and_ack(self):
        self.hold = False
        self.assertEqual(self.run_operation()['outcome'], 'ordinary_hold_missing')
        self.hold = True
        for state, outcome in ((False, 'ordinary_service_loaded'), (None, 'ordinary_service_unknown')):
            self.unloaded = state
            self.assertEqual(self.run_operation()['outcome'], outcome)
        self.unloaded, self.stop = True, True
        self.assertEqual(self.run_operation()['outcome'], 'stopped')
        self.stop = False
        self.assertEqual(self.server.calls, [])
        self.assertFalse(self.directory.exists())
        def stop_after_claim(payload):
            if payload['op'] == 'claim':
                self.stop = True
        self.server.hook = stop_after_claim
        self.assertEqual(self.run_operation()['outcome'], 'stopped')
        self.assertEqual(self.read_receipt()['state'], 'not_sent')
        self.assertEqual(self.sender.calls, [])
        self.assertEqual([c[1]['op'] for c in self.server.calls], ['claim'])

    def test_12b_service_started_after_sending_write_prevents_helper(self):
        original_write = self.receipts.write
        def write(row):
            original_write(row)
            if row['state'] == 'sending':
                self.unloaded = False
        self.receipts.write = write
        self.assertEqual(self.run_operation()['outcome'], 'ordinary_service_loaded')
        self.assertEqual(self.sender.calls, [])
        self.assertEqual(self.read_receipt()['state'], 'not_sent')
        self.assertTrue(self.hold)

    def test_12c_stop_after_sender_keeps_sent_ack_pending(self):
        self.sender.hook = lambda: setattr(self, 'stop', True)
        result = self.run_operation()
        self.assertEqual(result['outcome'], 'stopped')
        self.assertEqual((result['state'], result['ackStatus']), ('sent', 'pending'))
        self.assertEqual([c[1]['op'] for c in self.server.calls], ['claim'])
        self.stop = False
        self.assertEqual(self.run_operation('ack')['outcome'], 'ack_registered')
        self.assertEqual(len(self.sender.calls), 1)

    def test_13_sender_error_timeout_uncertain_never_automatically_retried(self):
        for failure in (1, TimeoutError('SECRET_CONTENT'), OSError('PHONE_PRIVATE')):
            directory = self.root / ('failure-' + str(len(list(self.root.iterdir()))))
            sender, server = FakeSender(), FakeServer()
            sender.result = failure
            worker = self.make_worker(receipts=single.TargetReceipts(directory), sender=sender, server=server)
            result = worker.run('send', ACTION, REVISION, DIGEST, True)
            self.assertEqual((result['state'], result['ackStatus']), ('uncertain', 'acked'))
            self.assertEqual(server.calls[-1][1]['error'], 'send_outcome_unknown')
            self.assertEqual(worker.run('send', ACTION, REVISION, DIGEST, True)['outcome'], 'existing_receipt')
            self.assertEqual(len(sender.calls), 1)
            self.assertNotIn('SECRET', json.dumps(result))

    def test_14_shared_wire_vectors_and_unchanged_exact_sender_text(self):
        fixture = BIN.parents[2] / 'tests/segretaria/fixtures/wa-single-protocol-v1.json'
        vectors = json.loads(fixture.read_text())
        self.assertEqual(vectors['protocol'], single.PROTOCOL)
        for vector in vectors['vectors']:
            self.assertEqual(single.wire_hash(vector), vector['payloadHash'])
        self.assertEqual(self.run_operation()['outcome'], 'ack_registered')
        self.assertEqual(self.sender.calls, [(MESSAGE['phone'], MESSAGE['text'])])
        receipt = self.read_receipt()
        self.assertEqual(receipt['payloadHash'], baseline.fingerprint(MESSAGE))
        self.assertEqual(receipt['wireBinding'], BINDING)
        self.assertNotIn('phone', receipt)
        self.assertNotIn('text', receipt)

    def test_15_restart_and_baseline_rollback_preserve_uncertain_record(self):
        self.write_receipt('sending')
        self.assertEqual(self.run_operation()['state'], 'uncertain')
        before = self.receipt_path().read_bytes()
        legacy_receipts = baseline.Receipts(self.directory)
        self.assertTrue(legacy_receipts.acquire())
        legacy_worker = baseline.Outbox(legacy_receipts, self.server, self.sender, lambda: True)
        self.assertEqual(legacy_worker.cycle(), 'hold')
        # Shared schema remains readable by the old worker; HOLD is never removed.
        self.assertEqual(legacy_receipts.read_all()[0]['payloadHash'], baseline.fingerprint(MESSAGE))
        legacy_receipts.close()
        self.assertEqual(self.receipt_path().read_bytes(), before)
        self.assertEqual(self.server.calls, [])
        self.assertEqual(self.sender.calls, [])

    def test_16_metadata_monitor_no_content_mirror_or_raw_exceptions(self):
        self.server.hook = lambda p: TimeoutError('SECRET_TOKEN ' + MESSAGE['phone'] + MESSAGE['text'])
        result = self.run_operation()
        self.assertEqual(result['outcome'], 'claim_outcome_unknown')
        encoded = json.dumps(result)
        self.assertNotIn('SECRET_TOKEN', encoded)
        self.assertNotIn(MESSAGE['phone'], encoded)
        self.assertNotIn('SINTETICO', encoded)
        self.assertEqual(len(self.server.calls), 1)
        self.assertEqual(self.sender.calls, [])

    def test_17_symlink_insecure_target_and_legacy_binding_rejected(self):
        self.write_receipt()
        original = self.read_receipt()
        del original['wireBinding']
        self.receipt_path().write_text(json.dumps(original))
        self.assertEqual(self.run_operation()['outcome'], 'local_state_error')
        self.receipt_path().unlink()
        outside = self.root / 'outside.json'
        outside.write_text(json.dumps(original))
        outside.chmod(0o600)
        self.receipt_path().symlink_to(outside)
        self.assertEqual(self.run_operation()['outcome'], 'local_state_error')
        self.assertTrue(self.receipt_path().is_symlink())
        self.assertEqual(self.server.calls, [])
        self.assertEqual(self.sender.calls, [])

    def test_18_missing_ack_receipt_does_not_claim_or_send(self):
        self.assertEqual(self.run_operation('ack')['outcome'], 'receipt_missing')
        self.assertEqual(self.server.calls, [])
        self.assertEqual(self.sender.calls, [])

    def test_19_claim_response_loss_permanent_server_claim_prevents_send(self):
        for failure in (500, 503, 504, 0, TimeoutError('Response lost after committed claim')):
            with self.subTest(failure=str(failure)):
                server = FakeServer()
                def lost_response(payload):
                    if payload['op'] == 'claim' and not server.claimed:
                        server.claimed = True
                        return failure if isinstance(failure, BaseException) else (failure, {})
                server.hook = lost_response
                worker = self.make_worker(server=server)
                self.assertEqual(worker.run('send', ACTION, REVISION, DIGEST, True)['outcome'], 'claim_outcome_unknown')
                self.assertTrue(server.claimed)
                self.assertFalse(self.receipt_path().exists())
                self.assertEqual([c[1]['op'] for c in server.calls], ['claim'])
                self.assertEqual(self.sender.calls, [])
                # An explicit later invocation is still refused by the permanent
                # server claim; the uncertain invocation itself never retries.
                restarted = self.make_worker(server=server, receipts=single.TargetReceipts(self.directory))
                self.assertEqual(restarted.run('send', ACTION, REVISION, DIGEST, True)['outcome'], 'claim_rejected')
                self.assertEqual([c[1]['op'] for c in server.calls], ['claim', 'claim'])
                self.assertFalse(self.receipt_path().exists())
                self.assertEqual(self.sender.calls, [])

    def test_20_failure_persisting_sending_stops_before_sender(self):
        real_write = self.receipts.write
        def fail_sending(row):
            if row['state'] == 'sending':
                raise OSError('Disk unavailable')
            real_write(row)
        self.receipts.write = fail_sending
        self.assertEqual(self.run_operation()['outcome'], 'local_state_error')
        self.assertEqual(self.read_receipt()['state'], 'received')
        self.assertEqual(self.sender.calls, [])

    def test_21_sender_helper_absent_is_not_session_readiness(self):
        self.sender.ready = False
        result = self.run_operation()
        self.assertEqual(result['outcome'], 'sender_helper_unavailable')
        self.assertEqual(result['sessionReadiness'], 'not_verified')
        self.assertEqual(self.server.calls, [])

    def test_22_http_transport_rejects_redirects_duplicate_json_and_general_endpoint(self):
        transport = single.SingleTransport('synthetic-only-token')
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'{"ok":true,"ok":false}'
        with patch.object(transport.opener, 'open', return_value=Response()):
            with self.assertRaises(ValueError):
                transport.post(single.ENDPOINT, {'op': 'inspect'}, 1)
        class ValidResponse(Response):
            def read(self, limit): return b'{"ok":true}'
        # The endpoint guard is a behavioral assertion, not a network failure.
        # Even when mutation removes that guard, opener.open stays synthetic.
        with patch.object(transport.opener, 'open', return_value=ValidResponse()) as opener:
            with self.assertRaises(ValueError):
                transport.post('/api/homie/wa-outbox', {}, 1)
            opener.assert_not_called()
            with self.assertRaises(ValueError):
                transport.post('/api/homie/message', {}, 1)
            opener.assert_not_called()
        with patch.object(transport.opener, 'open', side_effect=error.HTTPError('https://synthetic.invalid', 302, 'private', {}, None)):
            self.assertEqual(transport.post(single.ENDPOINT, {}, 1), (302, {}))
        self.assertIsNone(single.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://synthetic.invalid'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
