// Real endpoint, approval and claim/ACK guards. Every external I/O is synthetic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ready, callSingle, DB, save, task, revise, conv, CID, ID, NOW, realNow,
  queries, writes, network, setHooks, executionPayloadHash } from './outbox-single-fixture.mjs';
import { SINGLE_PROTOCOL, singlePayloadHash } from '../../api/homie/_wa-single-protocol.js';
import { preparationContentHash } from '../../api/segretaria/_execution-guard.js';
import { default as bulk } from '../../api/homie/wa-outbox.js';

let checks = 0;
function check(label, condition) { assert.ok(condition, label); checks++; console.log('PASS ' + label); }
const inspect = actionId => callSingle({ protocol: SINGLE_PROTOCOL, op: 'inspect', actionId });
const selection = result => ({ protocol: SINGLE_PROTOCOL, actionId: result.actionId, revision: result.revision, payloadHash: result.payloadHash });
const claim = result => callSingle({ ...selection(result), op: 'claim' });
const ack = (result, ok, error) => callSingle({ ...selection(result), op: 'ack', ok, ...(error ? { error } : {}) });
const snapshot = () => JSON.stringify([...DB]);
const queue = id => DB.get('action_queue/' + id);
const mutateAction = (id, fn) => { const row = structuredClone(queue(id)); fn(row); save('action_queue/' + id, row); };
function replaceApprovedText(id, text) {
  revise(t => { t.preparation.draft.text = text; });
  mutateAction(id, row => { row.payload.draft = text; row.segretaria.payloadHash = executionPayloadHash(row);
    row.segretaria.reviewedPayloadHash = row.segretaria.payloadHash;
    row.segretaria.preparationHash = preparationContentHash(task().preparation); });
  revise(t => { t.preparation.approval.payloadHash = queue(id).segretaria.payloadHash; });
}
async function callBulk(body) {
  let code, output;
  await bulk({ method: 'POST', body, headers: { 'x-homie-secret': 'fixture' } }, {
    status(n) { code = n; return this; }, json(v) { output = v; return this; }, setHeader() {}, end() {},
  });
  return { code, ...output };
}
function assertNoPayload(response, label) {
  check(label, !Object.hasOwn(response, 'messages') && !Object.hasOwn(response, 'phone')
    && !Object.hasOwn(response, 'text') && !JSON.stringify(response).includes(conv.contactPhone));
}

try {
  let id = await ready();
  // 1: Target beyond a mixed backlog. Reads used for ownership/context are
  // allowed; the bulk status scan, scan cursor and unrelated writes are not.
  for (let n = 0; n < 125; n++) save('action_queue/legacy-' + n, { kind: 'reply', leadId: 'other-' + n,
    status: n % 2 ? 'executed' : 'pending', executedAt: new Date(NOW).toISOString(),
    payload: { channel: 'whatsapp', phone: '+390000000000', draft: 'SYNTHETIC OTHER' } });
  const otherId = 'sgreply_' + 'b'.repeat(40);
  save('action_queue/' + otherId, { status: 'executed', proposedBy: 'segretaria-proposal', leadId: 'other-prepared',
    segretaria: { delivery: { state: 'claimed', claimedAt: new Date(NOW).toISOString() } } });
  save('heartbeat/wa-outbox', { afterId: 'unaltered-cursor' });
  const unrelated = [...DB].filter(([path]) => path !== 'action_queue/' + id && !path.startsWith('operatorTasks/') && !path.startsWith('conversations/'));
  let before = snapshot(), beforeWrites = writes.length;
  let inspected = await inspect(id);
  check('inspect returns one valid selection', inspected.code === 200 && inspected.actionId === id && inspected.protocol === SINGLE_PROTOCOL && inspected.revision === 'revision-1');
  assertNoPayload(inspected, 'inspect returns metadata only');
  check('inspect is strictly read only', snapshot() === before && writes.length === beforeWrites);
  check('inspect hash binds exact action, recipient and text', inspected.payloadHash === singlePayloadHash({ actionId: id, phone: conv.contactPhone, text: task().preparation.draft.text }));
  const observedQueries = [];
  setHooks({ queryHook: (q, coll) => observedQueries.push({ q, coll }) });
  let result = await claim(inspected);
  check('claim returns exactly the target', result.code === 200 && result.messages.length === 1 && result.messages[0].actionId === id
    && Object.keys(result.messages[0]).sort().join(',') === 'actionId,phone,text');
  check('target is permanently claimed before payload response', queue(id).segretaria.delivery.state === 'claimed'
    && queue(id).segretaria.delivery.single.payloadHash === inspected.payloadHash && !queue(id).waSentAt);
  check('no broad executed-action scan', !observedQueries.some(({ q, coll }) => coll === 'action_queue' && q.where?.fieldFilter?.field.fieldPath === 'status'));
  check('mixed backlog, other receipt and cursor preserved', unrelated.every(([path, data]) => JSON.stringify(DB.get(path)) === JSON.stringify(data)));
  result = await claim(inspected);
  check('repeat claim never repeats payload', result.code === 409 && result.error === 'delivery_already_claimed');
  assertNoPayload(result, 'denied claim contains no payload');

  // 2: Strict selection/schema/auth; no default operation and no legacy path.
  id = await ready(); inspected = await inspect(id); before = snapshot(); beforeWrites = writes.length;
  const invalid = [null, [], {}, { protocol: SINGLE_PROTOCOL, op: 'pull', actionId: id },
    { protocol: 'older-version', op: 'inspect', actionId: id },
    { protocol: SINGLE_PROTOCOL, op: 'inspect' },
    { protocol: SINGLE_PROTOCOL, op: 'inspect', actionId: '../action_queue/a' },
    { protocol: SINGLE_PROTOCOL, op: 'inspect', actionId: 'legacy' },
    { protocol: SINGLE_PROTOCOL, op: 'inspect', actionId: id, extra: true },
    { ...selection(inspected), op: 'claim', revision: '' },
    { ...selection(inspected), op: 'claim', revision: '\n' },
    { ...selection(inspected), op: 'claim', revision: '\ud800' },
    { ...selection(inspected), op: 'claim', payloadHash: 'bad' },
    { ...selection(inspected), op: 'claim', messages: [] },
    { ...selection(inspected), op: 'ack', ok: 1 },
    { ...selection(inspected), op: 'ack', ok: false, error: 'contains private provider text' },
    { ...selection(inspected), op: 'ack', ok: true, error: 'send_not_started' }];
  for (const [index, body] of invalid.entries()) {
    result = await callSingle(body);
    check('invalid schema rejected ' + index, result.code === 400);
  }
  for (const headers of [{}, { 'x-homie-secret': 'wrong' }, { 'x-wizard-secret': 'fixture' }, { 'x-homie-secret': ['fixture'] }]) {
    result = await callSingle({ protocol: SINGLE_PROTOCOL, op: 'inspect', actionId: id }, { headers });
    check('unauthenticated or ambiguous header rejected', result.code === 401);
  }
  result = await callSingle({ protocol: SINGLE_PROTOCOL, op: 'inspect', actionId: id }, { method: 'GET' });
  check('only POST is accepted', result.code === 405);
  result = await inspect('sgreply_' + 'f'.repeat(40));
  check('missing target rejected without substitution', result.code === 404);
  check('all invalid requests leave DB untouched', before === snapshot() && writes.length === beforeWrites);
  const disguisedLegacy = 'sgreply_' + 'd'.repeat(40);
  save('action_queue/' + disguisedLegacy, { kind: 'reply', status: 'executed', executedAt: new Date(NOW).toISOString(),
    payload: { channel: 'whatsapp', phone: conv.contactPhone, draft: 'SYNTHETIC LEGACY' } });
  before = snapshot(); beforeWrites = writes.length; result = await inspect(disguisedLegacy);
  check('valid ID cannot admit a legacy unreviewed action', result.code === 409 && result.error === 'segretaria_approval_missing'
    && snapshot() === before && writes.length === beforeWrites);

  // 3: Approval, revision/hash and context vetoes are checked again after inspect.
  const vetoes = [
    ['missing approval', row => { delete row.segretaria.reviewedAt; }],
    ['approval altered', row => { row.segretaria.reviewedPayloadHash = 'mismatch'; }],
    ['payload altered', row => { row.payload.draft = 'Changed after approval'; }],
    ['no executed state', row => { row.status = 'approved'; }],
    ['execution not started', row => { row.segretaria.execution.state = 'done'; }],
    ['wrong channel', row => { row.payload.channel = 'email'; }],
  ];
  for (const [label, mutate] of vetoes) {
    id = await ready(); inspected = await inspect(id); mutateAction(id, mutate);
    before = snapshot(); beforeWrites = writes.length;
    result = await claim(inspected);
    check('guard rejects ' + label, result.code === 409);
    check('guard rejection has no writes: ' + label, snapshot() === before && writes.length === beforeWrites);
  }
  for (const [field, value] of [['revision', 'revision-other'], ['payloadHash', '0'.repeat(64)]]) {
    id = await ready(); inspected = await inspect(id); before = snapshot();
    result = await claim({ ...inspected, [field]: value });
    check('selection binding rejects wrong ' + field, result.code === 409 && result.error === 'delivery_selection_changed' && snapshot() === before);
  }
  const contexts = [
    ['new inbound', () => revise(t => { t.followUp.lastMessageId = 'message-later'; })],
    ['closed case', () => revise(t => { t.status = 'done'; t.followUp.open = false; })],
    ['stale context revision', () => revise(t => { t.contextRevision = 1; })],
    ['conversation binding conflict', () => save('conversations/' + CID, { ...conv, conversationBindingConflict: true })],
    ['recipient changed', () => save('conversations/' + CID, { ...conv, contactPhone: '+390000000099' })],
    ['source changed', () => save('contracts/cA', { ...DB.get('contracts/cA'), status: 'terminated' })],
  ];
  for (const [label, change] of contexts) {
    id = await ready(); inspected = await inspect(id); change(); before = snapshot(); beforeWrites = writes.length;
    result = await claim(inspected);
    check('fresh guard rejects ' + label, result.code === 409 && snapshot() === before && writes.length === beforeWrites);
    result = await inspect(id);
    check('read-only inspect also rejects ' + label, result.code === 409 && snapshot() === before);
  }

  // 4: Time bounds/unknown times and receipts never make a second pickup.
  for (const stamp of [new Date(NOW - 48 * 3600000).toISOString(), null, 'not-a-time']) {
    id = await ready(); inspected = await inspect(id); mutateAction(id, row => { row.executedAt = stamp; }); before = snapshot();
    result = await claim(inspected);
    check('expired or unverifiable time is refused', result.code === 409 && snapshot() === before);
  }
  id = await ready(); inspected = await inspect(id);
  mutateAction(id, row => { row.executedAt = new Date(NOW - 48 * 3600000 + 1).toISOString(); });
  setHooks({ queryHook: (_q, coll) => { if (coll === 'messages') Date.now = () => NOW + 2; } });
  result = await claim(inspected);
  check('context read crossing expiration refuses claim', result.code === 409 && result.error === 'whatsapp_delivery_expired' && !queue(id).segretaria.delivery);

  // 7: Cross-host duplicate claims need no shared local lock for exclusion.
  id = await ready(); inspected = await inspect(id);
  const concurrent = await Promise.all([claim(inspected), claim(inspected)]);
  check('concurrent claims emit one payload in total', concurrent.filter(r => r.code === 200).length === 1
    && concurrent.filter(r => r.code === 409).length === 1 && concurrent.reduce((n, r) => n + (r.messages?.length || 0), 0) === 1);
  for (const changed of ['queue', 'task', 'conversation']) {
    id = await ready(); inspected = await inspect(id);
    setHooks({ commitHook: async operations => {
      if (!operations.some(w => w.update?.fields?.segretaria?.mapValue?.fields?.delivery)) return;
      setHooks({ commitHook: null });
      if (changed === 'queue') mutateAction(id, row => { row.payload.draft = 'Racing replacement'; });
      else if (changed === 'task') revise(t => { t.followUp.lastMessageId = 'racing-message'; });
      else save('conversations/' + CID, { ...conv, contactPhone: '+390000000098' });
    } });
    result = await claim(inspected);
    check('CAS vetoes concurrent ' + changed + ' modification', result.code === 409 && !queue(id).segretaria.delivery && !result.messages);
  }

  // 9/10/11/15: Claim survives an absent worker; ACK is target-bound, immutable,
  // retryable without pickup and never mirrored into another message flow.
  id = await ready(); inspected = await inspect(id);
  result = await ack(inspected, true);
  check('ack before claim refused', result.code === 409 && !queue(id).waSentAt);
  await claim(inspected);
  const claimed = snapshot();
  result = await callBulk({ op: 'ack', actionId: id, ok: true });
  check('bulk ACK cannot bypass selected binding', result.code === 409 && snapshot() === claimed);
  for (const altered of [{ ...inspected, revision: 'other' }, { ...inspected, payloadHash: 'e'.repeat(64) },
    { ...inspected, actionId: 'sgreply_' + 'c'.repeat(40) }]) {
    result = await ack(altered, true);
    check('ACK rejects altered selection', [404, 409].includes(result.code) && snapshot() === claimed);
  }
  revise(t => { t.followUp.lastMessageId = 'inbound-after-pickup'; });
  result = await ack(inspected, true);
  check('target ACK records real claim despite later inbound', result.code === 200 && result.delivery === 'sent' && queue(id).waSentAt);
  const afterAck = snapshot(); beforeWrites = writes.length;
  result = await ack(inspected, true);
  check('lost successful ACK can be replayed without rewrites', result.code === 200 && result.cached && snapshot() === afterAck && writes.length === beforeWrites);
  result = await ack(inspected, false, 'send_outcome_unknown');
  check('later failed ACK cannot overwrite success', result.code === 409 && snapshot() === afterAck);
  result = await claim(inspected);
  check('sent target is never reclaimed', result.code === 409 && !result.messages);

  for (const category of ['send_outcome_unknown', 'send_not_started']) {
    id = await ready(); inspected = await inspect(id); await claim(inspected);
    result = await ack(inspected, false, category);
    check('approved error category becomes terminal failed receipt', result.code === 200 && result.delivery === 'failed' && queue(id).waSendError === category);
    before = snapshot(); beforeWrites = writes.length;
    result = await ack(inspected, false, category === 'send_not_started' ? 'send_outcome_unknown' : 'send_not_started');
    check('negative ACK retry preserves first error category', result.code === 200 && result.cached && snapshot() === before && writes.length === beforeWrites);
    result = await ack(inspected, true);
    check('success cannot erase failed/uncertain receipt', result.code === 409 && snapshot() === before);
    result = await claim(inspected);
    check('failed/uncertain target cannot be reclaimed', result.code === 409 && snapshot() === before);
  }
  id = await ready(); inspected = await inspect(id); await claim(inspected);
  let acknowledgements = await Promise.all([ack(inspected, true), ack(inspected, false, 'send_outcome_unknown')]);
  check('concurrent conflicting ACK has exactly one terminal winner', acknowledgements.filter(r => r.code === 200).length === 1 && acknowledgements.filter(r => r.code === 409).length === 1);
  id = await ready(); inspected = await inspect(id); await claim(inspected);
  setHooks({ commitHook: async () => { throw new Error('SENSITIVE_PROVIDER_DETAIL'); } });
  result = await ack(inspected, true);
  check('ACK persistence outage is explicit and sanitized', result.code === 503 && result.error === 'delivery_ack_unavailable' && !JSON.stringify(result).includes('SENSITIVE'));
  setHooks({ commitHook: null });
  result = await ack(inspected, true);
  check('ACK-only recovery works after persistence outage', result.code === 200 && result.delivery === 'sent');

  id = await ready(); inspected = await inspect(id); await claim(inspected);
  setHooks({ commitHook: async operations => {
    if (!operations.some(w => w.update?.fields?.waSentAt)) return;
    setHooks({ commitHook: null });
    mutateAction(id, row => { row.segretaria.delivery.single.payloadHash = 'f'.repeat(64); });
  } });
  result = await ack(inspected, true);
  check('ACK binding is rechecked after concurrent receipt change', result.code === 409 && result.error === 'delivery_selection_changed' && !queue(id).waSentAt);
  id = await ready(); inspected = await inspect(id); await claim(inspected);
  const copiedId = 'sgreply_' + 'c'.repeat(40);
  save('action_queue/' + copiedId, structuredClone(queue(id))); before = snapshot();
  result = await ack({ ...inspected, actionId: copiedId }, true);
  check('copied receipt cannot acknowledge a different existing target', result.code === 409 && snapshot() === before && !queue(copiedId).waSentAt);
  mutateAction(id, row => { row.payload.draft = 'Changed after pickup'; }); before = snapshot();
  result = await ack(inspected, true);
  check('ACK refuses payload changed after pickup', result.code === 409 && snapshot() === before && !queue(id).waSentAt);

  // 14: Shared cross-language vectors + byte-preserving approved long text.
  const vectors = JSON.parse(readFileSync(new URL('./fixtures/wa-single-protocol-v1.json', import.meta.url)));
  for (const [index, vector] of vectors.vectors.entries()) check('shared Unicode hash vector ' + index, singlePayloadHash(vector) === vector.payloadHash);
  const exact = '  Caffè ☕\n\t' + 'x'.repeat(2300) + ' 🏠 e\u0301\n  ';
  id = await ready();
  // Approval machinery normally limits drafts before approval. This fixture
  // deliberately creates a consistently approved longer payload to test that
  // transport adds no independent truncation/normalization after approval.
  replaceApprovedText(id, exact);
  inspected = await inspect(id); result = await claim(inspected);
  check('approved whitespace, Unicode and >2000 chars survive transport unchanged', result.code === 200
    && result.messages[0].text === exact && result.payloadHash === singlePayloadHash(result.messages[0]));
  for (const [label, text] of [['NUL', 'before\u0000after'], ['blank', ' \n\t '], ['Python blank', '\u001c \u001f'],
    ['NEXT LINE blank', '\u0085'], ['too long', 'x'.repeat(10001)], ['invalid surrogate', '\ud800']]) {
    id = await ready(); replaceApprovedText(id, text); before = snapshot(); beforeWrites = writes.length;
    result = await inspect(id);
    check('unsupported payload refused before inspect: ' + label, result.code === 409 && result.error === 'delivery_payload_invalid');
    result = await claim({ actionId: id, revision: 'revision-1', payloadHash: singlePayloadHash({ actionId: id, phone: conv.contactPhone, text }) });
    check('unsupported payload refused before claim: ' + label, result.code === 409 && !queue(id).segretaria.delivery
      && snapshot() === before && writes.length === beforeWrites);
  }
  id = await ready(); replaceApprovedText(id, '🏠'.repeat(10000)); inspected = await inspect(id); result = await claim(inspected);
  check('10000 valid astral codepoints remain acceptable and byte exact', result.code === 200 && result.messages[0].text === '🏠'.repeat(10000));

  // 16: Never log/echo provider data or manufacture downstream events.
  id = await ready(); setHooks({ failingCollection: 'action_queue' });
  result = await inspect(id);
  check('read failure returns sanitized availability category', result.code === 503 && result.error === 'delivery_unavailable');
  check('no external calls, emails or message mirror', network.length === 0 && globalThis.__mails.length === 0
    && writes.every(w => !w.path.startsWith('messages/') && !w.path.startsWith('activity/')));
  console.log(`\n${checks}/${checks} PASS`);
} catch (error) {
  console.error(error.stack); process.exitCode = 1;
} finally { Date.now = realNow; }
