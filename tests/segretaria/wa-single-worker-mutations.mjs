// Mutate only temporary source copies; each defect must fail its behavioral test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workerPath = 'homie-bridge/agent-os/bin/wa_outbox_single.py';
const original = readFileSync(join(root, workerPath), 'utf8');
const mutations = [
  ['payload_hash', ' or wire_hash(messages[0]) != digest', '', 'test_06_wrong_target_multiple_payload_hash_and_malformed_response'],
  ['ordinary_hold', 'if not self.hold():', 'if False:', 'test_12_hold_service_and_stop_guards_rechecked_at_send_and_ack'],
  ['ack_binding', 'not self.matching(data, action_id, binding) or data.get("delivery") != expected',
    'data.get("delivery") != expected', 'test_10_ack_lost_5xx_duplicate_wrong_binding_and_recovery_only'],
  ['durable_sending', 'self.receipts.write(row)\n            blocked = self.guard()  # Last gate',
    '# MUTATION: omit durable sending\n            blocked = self.guard()  # Last gate', 'test_20_failure_persisting_sending_stops_before_sender'],
  ['last_stop_gate', 'blocked = self.guard()  # Last gate', 'blocked = None  # Last gate',
    'test_12b_service_started_after_sending_write_prevents_helper'],
  ['endpoint_allowlist', 'if path != ENDPOINT:', 'if False:',
    'test_22_http_transport_rejects_redirects_duplicate_json_and_general_endpoint'],
];

for (const [name, before, after, behavioralTest] of mutations) {
  assert.equal(original.split(before).length, 2, `${name}: mutation must match exactly once`);
  const copy = mkdtempSync(join(tmpdir(), 'homie-single-mutant-'));
  try {
    for (const relative of [workerPath, 'homie-bridge/agent-os/bin/wa_outbox.py',
      'homie-bridge/agent-os/tests/test_wa_outbox_single.py', 'tests/segretaria/fixtures/wa-single-protocol-v1.json']) {
      mkdirSync(dirname(join(copy, relative)), { recursive: true });
      cpSync(join(root, relative), join(copy, relative));
    }
    writeFileSync(join(copy, workerPath), original.replace(before, after));
    const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover',
      '-s', 'homie-bridge/agent-os/tests', '-p', 'test_wa_outbox_single.py', '-v'],
    { cwd: copy, encoding: 'utf8', timeout: 30_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(result.status, 1, `${name}: mutant must fail: ${result.stderr}`);
    assert.match(result.stderr, new RegExp('FAIL: ' + behavioralTest + '\\b'), `${name}: behavioral assertion must detect defect: ${result.stderr}`);
    console.log('PASS worker mutation killed: ' + name);
  } finally { rmSync(copy, { recursive: true, force: true }); }
}
console.log(`${mutations.length}/${mutations.length} worker mutations killed`);
