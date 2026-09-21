// Both production implementations communicate over stdio, never a live endpoint.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ready, callSingle, DB, save, network, realNow } from './outbox-single-fixture.mjs';

const protocol = 'homie-wa-single-v1';
const endpoint = '/api/homie/wa-outbox-single';
const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'homie-single-e2e-'));
let checks = 0;
function check(name, body) { assert.ok(body, name); checks++; console.log('PASS ' + name); }

async function bridge(selection, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-B', 'tests/segretaria/fixtures/wa-single-bridge.py'],
      { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    const observed = { sends: [], requests: [], result: null };
    let errors = '', failure = null;
    const timeout = setTimeout(() => { failure = new Error('synthetic_bridge_timeout'); child.kill(); }, 30_000);
    const lines = createInterface({ input: child.stdout });
    child.stderr.on('data', data => { errors += data; });
    child.on('error', reject);
    lines.on('line', async line => {
      try {
        const event = JSON.parse(line);
        if (event.kind === 'synthetic_send') observed.sends.push(event);
        else if (event.kind === 'result') observed.result = event.result;
        else if (event.kind === 'request') {
          assert.equal(event.path, endpoint, 'worker must never call bulk pull/mirror');
          observed.requests.push(event.payload);
          const { code, ...body } = await callSingle(event.payload);
          let response = options.dropAckResponse && event.payload.op === 'ack'
            ? { transportError: true } : { status: code, body };
          if (event.payload.op === 'claim' && Object.hasOwn(options, 'claimFailure')) {
            assert.equal(code, 200, 'fault is injected only AFTER the real handler commits the claim');
            response = options.claimFailure === 'lost' ? { transportError: true }
              : { status: options.claimFailure, body: {} };
          }
          child.stdin.write(JSON.stringify(response) + '\n');
        } else throw new Error('unexpected_bridge_event');
      } catch (error) { failure = error; child.kill(); }
    });
    child.on('close', code => {
      clearTimeout(timeout); lines.close();
      if (failure) reject(failure);
      else if (code !== (options.crashDuringSend ? 17 : 0)) reject(new Error('bridge_exit_' + code + ': ' + errors));
      else resolve(observed);
    });
    child.stdin.write(JSON.stringify({ ...selection, receipts: options.receipts,
      operation: options.operation || 'send', crashDuringSend: !!options.crashDuringSend }) + '\n');
  });
}

async function selection(text) {
  const actionId = await ready({ text });
  const { code, ok, ...metadata } = await callSingle({ protocol, op: 'inspect', actionId });
  assert.equal(code, 200); assert.equal(ok, true);
  return metadata;
}

try {
  const unicode = '  Caffè ☕ 🏠\nSeconda riga\t"esatta"  ';
  let selected = await selection(unicode);
  // Existing approval normalizes outer whitespace before storing the action.
  // Delivery must preserve that approved action, not reinterpret the draft.
  const approvedPayload = DB.get('action_queue/' + selected.actionId).payload;
  const approvedText = approvedPayload.body || approvedPayload.draft;
  for (let i = 0; i < 121; i++) save('action_queue/legacy-synthetic-' + i,
    { status: 'executed', payload: { channel: 'whatsapp', phone: '+390000000000', body: 'UNRELATED SYNTHETIC' } });
  const backlog = [...DB].filter(([key]) => key.includes('legacy-synthetic-')).map(([key, value]) => [key, JSON.stringify(value)]);
  let sent = await bridge(selected, { receipts: join(temp, 'success') });
  check('real JS claim → real Python worker → real JS ACK returns sent/acked', sent.result?.state === 'sent' && sent.result?.ackStatus === 'acked');
  check('exact approved Unicode/whitespace crosses implementations unchanged', sent.sends.length === 1 && sent.sends[0].text === approvedText);
  check('121 unrelated actions unchanged and no bulk cursor created', backlog.every(([key, value]) => JSON.stringify(DB.get(key)) === value) && !DB.has('heartbeat/wa-outbox'));
  check('one target receipt and no general endpoint/mirror', readdirSync(join(temp, 'success')).filter(x => x.endsWith('.json')).length === 1
    && sent.requests.every(x => x.actionId === selected.actionId && ['claim', 'ack'].includes(x.op)));

  selected = await selection('SYNTHETIC LOST ACK');
  const lostPath = join(temp, 'lost-ack');
  sent = await bridge(selected, { receipts: lostPath, dropAckResponse: true });
  check('lost ACK response retains local sent/pending while server records sent', sent.result?.state === 'sent' && sent.result?.ackStatus === 'pending'
    && DB.get('action_queue/' + selected.actionId).segretaria.delivery.state === 'sent');
  const retriedSend = await bridge(selected, { receipts: lostPath });
  check('restarting send after lost ACK never invokes sender or claims again', retriedSend.sends.length === 0 && retriedSend.requests.length === 0 && retriedSend.result?.outcome === 'existing_receipt');
  const acknowledged = await bridge(selected, { receipts: lostPath, operation: 'ack' });
  check('explicit ACK recovery across process restart uses cached server outcome', acknowledged.sends.length === 0 && acknowledged.requests.length === 1
    && acknowledged.requests[0].op === 'ack' && acknowledged.result?.ackStatus === 'acked');

  selected = await selection('SYNTHETIC CONCURRENT HOSTS');
  const pair = await Promise.all([bridge(selected, { receipts: join(temp, 'host-a') }), bridge(selected, { receipts: join(temp, 'host-b') })]);
  check('independent host ledgers compete for one atomic server claim', pair.reduce((n, x) => n + x.sends.length, 0) === 1
    && pair.filter(x => x.result?.state === 'sent').length === 1);

  selected = await selection('SYNTHETIC CRASH');
  const crashPath = join(temp, 'crash');
  const crashed = await bridge(selected, { receipts: crashPath, crashDuringSend: true });
  const filename = readdirSync(crashPath).find(x => x.endsWith('.json'));
  check('process crash after synthetic effect preserves durable sending receipt', crashed.sends.length === 1 && JSON.parse(readFileSync(join(crashPath, filename))).state === 'sending');
  const recovered = await bridge(selected, { receipts: crashPath });
  check('restart recovers uncertainty without a second send or claim', recovered.sends.length === 0 && recovered.requests.length === 0 && recovered.result?.state === 'uncertain');
  const uncertainAck = await bridge(selected, { receipts: crashPath, operation: 'ack' });
  check('uncertain ACK stays explicitly unknown and never becomes a send retry', uncertainAck.sends.length === 0 && uncertainAck.result?.state === 'uncertain'
    && DB.get('action_queue/' + selected.actionId).waSendError === 'send_outcome_unknown');

  for (const failure of [500, 503, 504, 0, 'lost']) {
    selected = await selection('SYNTHETIC CLAIM RESPONSE FAILURE ' + failure);
    const receipts = join(temp, 'claim-failure-' + failure);
    const failed = await bridge(selected, { receipts, claimFailure: failure });
    const committed = JSON.stringify(DB.get('action_queue/' + selected.actionId));
    check(`${failure}: real committed claim is reported unknown`, failed.result?.outcome === 'claim_outcome_unknown'
      && DB.get('action_queue/' + selected.actionId).segretaria.delivery.state === 'claimed');
    check(`${failure}: no send, retry, ACK or invented receipt after uncertain response`, failed.sends.length === 0
      && failed.requests.length === 1 && failed.requests[0].op === 'claim'
      && !readdirSync(receipts).some(x => x.endsWith('.json')));
    const restarted = await bridge(selected, { receipts });
    check(`${failure}: explicit process restart cannot send or overwrite permanent claim`, restarted.sends.length === 0
      && restarted.requests.length === 1 && restarted.requests[0].op === 'claim'
      && restarted.result?.outcome === 'claim_rejected'
      && JSON.stringify(DB.get('action_queue/' + selected.actionId)) === committed);
    const noAck = await bridge(selected, { receipts, operation: 'ack' });
    check(`${failure}: missing receipt never authorizes an ACK`, noAck.result?.outcome === 'receipt_missing'
      && noAck.sends.length === 0 && noAck.requests.length === 0);
  }
  check('all external server effects remained mocked', network.length === 0);
  console.log(`${checks} cross-stack checks passed`);
} finally {
  Date.now = realNow;
  rmSync(temp, { recursive: true, force: true });
}
