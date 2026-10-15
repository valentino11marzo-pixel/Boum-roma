// Real authenticated follow-up handler; only Firestore/auth transport is synthetic.
// The ordering below models two independently observed stale-confirmation races.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DB, reset, put, call, CID, tasks, confirm, setBeforeCommit, requests } from './take-charge-fixture.mjs';

const transport = globalThis.fetch;
let passed = 0, failed = 0;
async function check(name, run) {
  reset();
  try {
    await run();
    assert(requests.every(request => /^(firestore|identitytoolkit)\.googleapis\.com\//.test(request)), 'No model, delivery, or other external IO');
    passed++;
    console.log('PASS ' + name);
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n' + error.message);
  } finally {
    globalThis.fetch = transport;
    setBeforeCommit(null);
  }
}
async function start() {
  const response = await call({ body: { op: 'start', conversationId: CID, messageId: 'm1' } });
  assert.equal(response.code, 200, JSON.stringify(response));
  assert.equal(response.task.followUp.confirmed, false);
  assert.equal(response.task.manualIntake.sourceMessageId, 'm1');
  return response.task;
}

await check('a conversation rebound after the dossier read cannot confirm the former contact’s practice', async () => {
  const task = await start();
  put('leads/leadB', { name: 'Persona B', email: 'b@example.invalid', propertyId: 'pB' });
  put('properties/pB', { name: 'Casa B' });
  put('contracts/cB', { linkedLeadId: 'leadB', propertyId: 'pB', status: 'active' });
  let conversationReads = 0, rebound = false;
  globalThis.fetch = async (raw, options) => {
    // Return the actual IO snapshot of A, then persist B. The dossier must not
    // borrow a later version of B as a valid guard for data already read from A.
    const response = await transport(raw, options);
    if (new URL(String(raw)).pathname.endsWith('/conversations/' + CID) && ++conversationReads === 2) {
      put('conversations/' + CID, { ...DB.get('conversations/' + CID),
        contactId: 'leadB', leadId: 'leadB', contactEmail: 'b@example.invalid' });
      rebound = true;
    }
    return response;
  };
  const response = await call({ body: confirm(task) });
  assert.equal(rebound, true, 'The identity change occurred after the second conversation GET');
  assert.equal(DB.get('conversations/' + CID).leadId, 'leadB');
  assert.equal(response.code, 409, 'A dossier from A cannot authorize a confirmation after rebinding to B');
  assert.equal(tasks().length, 1);
  assert.equal(tasks()[0].followUp.practiceRef, null, 'The former contact’s practice was never assigned');
  assert.equal(tasks()[0].followUp.confirmed, false);
});

await check('an email persisted before the follow-up commit rejects the stale confirmation even while its header lags', async () => {
  const task = await start();
  const conversationBefore = structuredClone(DB.get('conversations/' + CID));
  const messageId = '<review-m2@example.invalid>';
  const storedId = 'segretaria_mail_' + createHash('sha256').update(messageId).digest('hex');
  let inserted = false;
  setBeforeCommit(() => {
    // scan-replies persists messages before patching the conversation header.
    // Hold that second write: a guard on the unchanged header cannot detect m2.
    put('messages/' + storedId, { conversationId: CID, direction: 'in', channel: 'email',
      body: 'Correzione: occorre verificare un altro documento.', by: 'segretaria-mail',
      source: 'segretaria-mail', emailMessageId: messageId, at: new Date(Date.now() - 1000).toISOString() });
    inserted = true;
  });
  const response = await call({ body: confirm(task) });
  assert.equal(inserted, true, 'The new email was persisted before the conditional commit');
  assert.deepEqual(DB.get('conversations/' + CID), conversationBefore, 'The producer header remains deliberately unchanged');
  assert.equal(response.code, 409, 'A persisted newer source cannot produce a successful stale confirmation');
  assert.equal(tasks().length, 1);
  const current = tasks()[0];
  assert.equal(current.status, 'open');
  assert.equal(current.followUp.needsReview, true, 'An internally saved decision is invalidated before returning');
  assert.notEqual(current.followUp.lastMessageId, 'm1', 'The review is bound to the newly persisted source');
});

console.log(`${passed} manual follow-up race checks passed; ${failed} failed.`);
if (failed) process.exitCode = 1;
