// Receipt dei tool telefonici: prove provider, non frasi dell'agente.
// node tests/phone/tool-receipts.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPhoneToolReceipts, PHONE_TOOL_RECEIPT_LIMITS } from '../../api/phone/_tool-receipts.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };

const call = (id, at = 4) => ({
  role: 'agent', message: 'La metto in contatto con Valentino.', time_in_call_secs: at,
  tool_calls: [{
    type: 'system', request_id: id, tool_name: 'transfer_to_number',
    params_as_json: '{"transfer_number":"+393313251961","password":"SECRET"}',
    tool_has_been_called: true,
  }],
});
const result = (id, fields = {}, at = 5) => ({
  role: 'agent', message: null, time_in_call_secs: at,
  tool_results: [{
    type: 'system', request_id: id, tool_name: 'transfer_to_number',
    tool_has_been_called: true, tool_latency_secs: 0.42, ...fields,
  }],
});

check('la promessa parlata non diventa una ricevuta', () => {
  const built = buildPhoneToolReceipts([{ role: 'agent', message: 'Ora la trasferisco.', time_in_call_secs: 2 }]);
  assert.deepEqual(built, { receipts: [], status: 'unavailable', truncated: false });
});

check('tool call senza risultato resta unknown, mai connected', () => {
  const built = buildPhoneToolReceipts([call('transfer_1')]);
  assert.equal(built.status, 'partial');
  assert.deepEqual(built.receipts, [{
    tool: 'transfer_to_number', provider: 'elevenlabs', evidence: 'tool_call', status: 'unknown',
    requestedAtSec: 4,
  }]);
});

check('errore provider attestato diventa failed e classifica il guasto SIP', () => {
  const built = buildPhoneToolReceipts([
    call('transfer_fail'),
    result('transfer_fail', {
      is_error: true,
      error_type: 'system_tool_error',
      raw_error_message: 'Missing SIP Trunking credentials for +393313251961',
      result_value: 'Agent failed to transfer the call to Unknown number',
    }),
  ]);
  assert.equal(built.status, 'complete');
  assert.equal(built.receipts[0].status, 'failed');
  assert.equal(built.receipts[0].reason, 'missing_sip_credentials');
  assert.equal(built.receipts[0].evidence, 'tool_result');
  assert.equal(built.receipts[0].latencySec, 0.42);
  assert.ok(built.receipts.every((row) => !('requestId' in row)));
  const persisted = JSON.stringify(built);
  assert.doesNotMatch(persisted, /3313251961|SECRET|raw_error|params_as_json|result_value/);
});

check('solo un risultato esplicito prova connected', () => {
  const connected = buildPhoneToolReceipts([
    call('transfer_ok'),
    result('transfer_ok', { is_error: false, result_value: 'Call transferred successfully.' }),
  ]);
  assert.equal(connected.receipts[0].status, 'connected');
  assert.equal(connected.status, 'complete');

  for (const value of ['Tool Called.', 'Transfer started.', 'Request accepted.']) {
    const generic = buildPhoneToolReceipts([
      call('generic_' + value.length),
      result('generic_' + value.length, { is_error: false, result_value: value }),
    ]);
    assert.equal(generic.receipts[0].status, 'unknown', value);
    assert.equal(generic.status, 'partial');
  }
});

check('flag e testo in conflitto non inventano un collegamento', () => {
  const built = buildPhoneToolReceipts([
    call('contradiction'),
    result('contradiction', { is_error: false, result_value: 'Unable to transfer; transfer completed successfully.' }),
  ]);
  assert.equal(built.receipts[0].status, 'unknown');
});

check('tool estranei, id pericolosi e campi provider restano fuori', () => {
  const built = buildPhoneToolReceipts([
    { role: 'agent', tool_calls: [{ tool_name: 'search_catalog', request_id: 'catalog_1', params_as_json: '{"tenant":"PRIVATE"}' }] },
    call('bad id <script>'),
    result('bad id <script>', { is_error: true, raw_error_message: 'provider failure' }),
  ]);
  assert.equal(built.receipts.length, 2);
  assert.doesNotMatch(JSON.stringify(built), /PRIVATE|script|search_catalog/);
});

check('un result firmato senza call resta una prova di fallimento', () => {
  const built = buildPhoneToolReceipts([
    result('orphan_result', { is_error: true, raw_error_message: 'SIP 486 Busy here' }, 9),
  ]);
  assert.equal(built.receipts[0].status, 'failed');
  assert.equal(built.receipts[0].reason, 'busy');
  assert.equal(built.receipts[0].resultAtSec, 9);
});

check('il payload è bounded e dichiara il taglio', () => {
  const turns = Array.from({ length: PHONE_TOOL_RECEIPT_LIMITS.maxReceipts + 7 }, (_, i) => call('cap_' + i, i));
  const built = buildPhoneToolReceipts(turns);
  assert.equal(built.receipts.length, PHONE_TOOL_RECEIPT_LIMITS.maxReceipts);
  assert.equal(built.truncated, true);
  assert.equal(built.status, 'partial');
});

{
  const source = readFileSync(new URL('../../api/phone/_tool-receipts.js', import.meta.url), 'utf8');
  const marker = 'if (result.is_error === true || result.is_blocked === true) {';
  assert.ok(source.includes(marker));
  const mutated = source.replace(marker, 'if (false) {');
  const module = await import('data:text/javascript;base64,' + Buffer.from(mutated).toString('base64') + '#mutation');
  const built = module.buildPhoneToolReceipts([
    call('mutation_fail'), result('mutation_fail', { is_error: true, raw_error_message: 'provider failure' }),
  ]);
  assert.notEqual(built.receipts[0].status, 'failed');
  checks++;
  console.log('PASS MUTAZIONE: ignorare is_error fa cadere la prova failed');
}

console.log(`\n${checks} verifiche ricevute tool telefono.`);
