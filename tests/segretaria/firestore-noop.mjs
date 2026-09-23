// Real Firestore codec and claim guard. The only substitute is an in-memory
// REST boundary storing original Firestore Value objects, never decoded rows.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { ready, DB, versions, CID, ID, NOW, realNow, callSingle } from './outbox-single-fixture.mjs';
import { fsGetVersioned, fsCommit, toFsFields, fsValToJs } from '../../api/homie/_lib.js';
import { preparationContentHash } from '../../api/segretaria/_execution-guard.js';
import { contactFingerprint, loadCaseContext, contextFingerprint } from '../../api/segretaria/_context.js';
import { personaDossier } from '../../api/segretaria/_persona.js';
import { SINGLE_PROTOCOL } from '../../api/homie/_wa-single-protocol.js';

const fixtureFetch = globalThis.fetch;
const ROOT = 'projects/p/databases/(default)/documents/';
const clone = value => structuredClone(value);
const raw = new Map(), commitBodies = [], commits = [], setupBodies = [];
let checks = 0, sequence = 0, beforeCommit = null;
const check = (label, actual) => { assert.ok(actual, label); checks++; console.log('PASS ' + label); };
const equal = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; console.log('PASS ' + label); };
const makeDoc = (path, fields) => ({ name: ROOT + path, fields: clone(fields), updateTime: `2026-09-14T10:01:${String(++sequence).padStart(2, '0')}.123456Z` });
const pathOf = write => (write.update?.name || write.delete).slice(ROOT.length);
const field = (doc, key) => key.split('.').reduce((v, part) => v?.[part], Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fsValToJs(v)])));
const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => clone(value), text: async () => JSON.stringify(value) });

// Apply only the mask's paths, including an explicitly empty mask. Omitting
// the mask replaces the whole document, matching the REST Write contract.
function applyWrite(write, existing) {
  if (write.delete) return null;
  const fields = write.update.fields || {};
  if (!Object.hasOwn(write, 'updateMask')) return makeDoc(pathOf(write), fields);
  const next = clone(existing?.fields || {});
  for (const name of write.updateMask.fieldPaths || []) {
    assert.ok(!name.includes('.'), 'fixture intentionally supports these top-level masks only');
    if (Object.hasOwn(fields, name)) next[name] = clone(fields[name]);
    else delete next[name];
  }
  // WriteResult: a write that changes no data retains the previous updateTime.
  // https://firebase.google.com/docs/firestore/reference/rest/v1/WriteResult
  if (existing && isDeepStrictEqual(next, existing.fields)) return clone(existing);
  return makeDoc(pathOf(write), next);
}
async function rawFetch(input, opts = {}) {
  const url = new URL(String(input));
  const body = opts.body ? JSON.parse(opts.body) : {};
  if (url.hostname === 'identitytoolkit.googleapis.com') return response({ idToken: 'synthetic-admin' });
  assert.equal(url.hostname, 'firestore.googleapis.com', 'no external network is permitted');
  if (url.pathname.endsWith(':commit')) {
    commitBodies.push(clone(body));
    if (beforeCommit) { const hook = beforeCommit; beforeCommit = null; hook(); }
    const writes = body.writes || [];
    // All preconditions precede ALL writes: a failed batch leaves no partial claim.
    for (const write of writes) {
      const existing = raw.get(pathOf(write)), pre = write.currentDocument || {};
      if (pre.exists === true && !existing || pre.exists === false && existing
          || pre.updateTime && existing?.updateTime !== pre.updateTime) {
        return response({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      }
    }
    const staged = writes.map(write => [pathOf(write), applyWrite(write, raw.get(pathOf(write)))]);
    for (const [path, doc] of staged) { if (doc) raw.set(path, doc); else raw.delete(path); }
    commits.push(clone(body));
    return response({ writeResults: staged.map(([, doc]) => ({ updateTime: doc?.updateTime })), commitTime: new Date(NOW).toISOString() });
  }
  if (url.pathname.endsWith(':runQuery')) {
    const query = body.structuredQuery, collection = query.from[0].collectionId;
    const matches = (doc, filter) => {
      if (!filter) return true;
      if (filter.compositeFilter) {
        const values = filter.compositeFilter.filters.map(f => matches(doc, f));
        return filter.compositeFilter.op === 'AND' ? values.every(Boolean) : values.some(Boolean);
      }
      const f = filter.fieldFilter, value = field(doc, f.field.fieldPath), expected = fsValToJs(f.value);
      if (f.op === 'EQUAL') return value === expected;
      if (f.op === 'IN') return expected.includes(value);
      if (f.op === 'GREATER_THAN') return value > expected;
      throw new Error('unsupported synthetic filter ' + f.op);
    };
    let docs = [...raw].filter(([path, doc]) => path.startsWith(collection + '/') && path.split('/').length === 2 && matches(doc, query.where)).map(([, doc]) => doc);
    for (const sort of [...(query.orderBy || [])].reverse()) docs.sort((a, b) => {
      const val = doc => sort.field.fieldPath === '__name__' ? doc.name : field(doc, sort.field.fieldPath);
      return String(val(a)).localeCompare(String(val(b))) * (sort.direction === 'DESCENDING' ? -1 : 1);
    });
    if (query.startAt) docs = docs.filter(doc => query.startAt.before ? doc.name >= query.startAt.values[0].referenceValue : doc.name > query.startAt.values[0].referenceValue);
    return response(docs.slice(0, query.limit || 1000).map(document => ({ document })));
  }
  const path = decodeURIComponent(url.pathname.split('/documents/')[1] || '');
  assert.ok(!opts.method || opts.method === 'GET', 'claim uses no non-atomic document writes');
  return raw.has(path) ? response(raw.get(path)) : response({ error: { status: 'NOT_FOUND' } }, 404);
}
function clear() { raw.clear(); commitBodies.length = 0; commits.length = 0; sequence = 0; beforeCommit = null; globalThis.fetch = rawFetch; }
const sentinels = () => ({ mapValue: { fields: {
  exactTimestamp: { timestampValue: '2026-09-14T10:00:00.123456Z' },
  largeInteger: { integerValue: '9223372036854775807' },
  reference: { referenceValue: ROOT + 'synthetic/reference' },
  bytes: { bytesValue: 'AAECA/8=' },
  nested: { arrayValue: { values: [{ mapValue: { fields: { at: { timestampValue: '2026-09-14T09:00:00.654321Z' } } } }] } },
  emptyString: { stringValue: '' }, nullable: { nullValue: null },
} } });

async function rawApproved(emailState = 'present') {
  setupBodies.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith(':commit')) {
      const body = JSON.parse(options.body);
      setupBodies.push({ body: clone(body), versions: new Map(versions) });
    }
    return fixtureFetch(url, options);
  };
  const id = await ready();
  clear();
  // Seed approved synthetic rows once. From this point storage and all GET,
  // query and commit responses are RAW Values; no fixture decoder is involved.
  for (const [path, data] of DB) raw.set(path, { name: ROOT + path, fields: toFsFields(data), updateTime: versions.get(path) });
  const taskPath = 'operatorTasks/' + ID, convPath = 'conversations/' + CID, queuePath = 'action_queue/' + id;
  raw.get(taskPath).fields.preparation.mapValue.fields.preservationProbe = sentinels();
  if (emailState === 'absent') delete raw.get(convPath).fields.contactEmail;
  if (emailState === 'empty') raw.get(convPath).fields.contactEmail = { stringValue: '' };
  if (emailState === 'null') raw.get(convPath).fields.contactEmail = { nullValue: null };
  // Construct a valid approval for these synthetic raw fields using the real
  // fingerprints. This is fixture setup, not an implementation override.
  const conversation = (await fsGetVersioned(convPath)).data;
  const task = (await fsGetVersioned(taskPath)).data;
  const dossier = await personaDossier({ phone: conversation.contactPhone, email: conversation.contactEmail,
    leadId: conversation.leadId, conversationId: CID });
  const context = await loadCaseContext({ task, conversation, dossier, now: NOW });
  const p = raw.get(taskPath).fields.preparation.mapValue.fields;
  p.contactFingerprint = { stringValue: contactFingerprint(conversation) };
  p.sourceFingerprint = { stringValue: contextFingerprint(context) };
  const s = raw.get(queuePath).fields.segretaria.mapValue.fields;
  s.contactFingerprint = clone(p.contactFingerprint); s.sourceFingerprint = clone(p.sourceFingerprint);
  s.preparationHash = { stringValue: preparationContentHash((await fsGetVersioned(taskPath)).data.preparation) };
  return { id, taskPath, convPath, queuePath };
}
const inspect = id => callSingle({ protocol: SINGLE_PROTOCOL, op: 'inspect', actionId: id });
const claim = selected => callSingle({ protocol: SINGLE_PROTOCOL, op: 'claim', actionId: selected.actionId, revision: selected.revision, payloadHash: selected.payloadHash });

try {
  // Reproduce the defect with the actual production decoder and encoder.
  clear();
  raw.set('operatorTasks/probe', makeDoc('operatorTasks/probe', { preparation: sentinels() }));
  raw.set('conversations/probe', makeDoc('conversations/probe', { contactPhone: { stringValue: '' } }));
  let task = await fsGetVersioned('operatorTasks/probe'), conv = await fsGetVersioned('conversations/probe');
  const original = clone(raw.get('operatorTasks/probe').fields);
  await fsCommit([
    { docPath: 'operatorTasks/probe', fields: { preparation: task.data.preparation }, precondition: { updateTime: task.updateTime } },
    { docPath: 'conversations/probe', fields: { contactPhone: conv.data.contactPhone || null, contactEmail: conv.data.contactEmail || null }, precondition: { updateTime: conv.updateTime } },
  ]);
  let changed = raw.get('operatorTasks/probe').fields.preparation.mapValue.fields;
  equal('old rewrite turns timestamp Value into string, retaining the string digits', changed.exactTimestamp, { stringValue: '2026-09-14T10:00:00.123456Z' });
  equal('old rewrite also changes nested timestamp type', changed.nested.arrayValue.values[0].mapValue.fields.at, { stringValue: '2026-09-14T09:00:00.654321Z' });
  check('old rewrite rounds an int64 through JavaScript Number', changed.largeInteger.integerValue !== original.preparation.mapValue.fields.largeInteger.integerValue);
  equal('old rewrite loses unsupported reference and bytes values', [changed.reference, changed.bytes], [{ nullValue: null }, { nullValue: null }]);
  equal('old conversation rewrite converts empty and absent fields to null', raw.get('conversations/probe').fields, { contactPhone: { nullValue: null }, contactEmail: { nullValue: null } });

  clear();
  raw.set('operatorTasks/probe', makeDoc('operatorTasks/probe', original));
  raw.set('conversations/probe', makeDoc('conversations/probe', { contactPhone: { stringValue: '' } }));
  const before = clone([...raw]);
  task = await fsGetVersioned('operatorTasks/probe'); conv = await fsGetVersioned('conversations/probe');
  await fsCommit([
    { docPath: 'operatorTasks/probe', fields: {}, precondition: { updateTime: task.updateTime } },
    { docPath: 'conversations/probe', fields: {}, precondition: { updateTime: conv.updateTime } },
  ]);
  for (const [path, doc] of before) {
    equal('empty masked write preserves raw data ' + path, raw.get(path).fields, doc.fields);
    equal('empty masked write preserves updateTime ' + path, raw.get(path).updateTime, doc.updateTime);
  }
  equal('empty masks remain explicitly present on the REST wire', commitBodies[0].writes.map(w => w.updateMask), [{ fieldPaths: [] }, { fieldPaths: [] }]);
  equal('full microsecond updateTime preconditions remain on wire', commitBodies[0].writes.map(w => w.currentDocument), before.map(([, doc]) => ({ updateTime: doc.updateTime })));

  for (const emailState of ['present', 'absent', 'empty', 'null']) {
    const target = await rawApproved(emailState);
    if (emailState === 'present') {
      const approval = setupBodies.find(({ body }) => body.writes.some(w => w.update?.fields?.status?.stringValue === 'approved'));
      const execution = setupBodies.find(({ body }) => body.writes.some(w => w.update?.fields?.segretaria?.mapValue?.fields?.execution));
      check('real approval and execution batches are observed on the REST wire', !!approval && !!execution);
      for (const [name, snapshot, paths] of [
        ['approval', approval, [target.convPath, 'leads/leadA']],
        ['execution', execution, [target.taskPath, target.convPath]],
      ]) for (const path of paths) {
        const write = snapshot.body.writes.find(w => pathOf(w) === path);
        equal(name + ' guard sends zero replacement fields ' + path, write?.update?.fields, {});
        equal(name + ' guard sends an explicit empty mask ' + path, write.updateMask, { fieldPaths: [] });
        equal(name + ' guard retains its exact read version ' + path, write.currentDocument, { updateTime: snapshot.versions.get(path) });
      }
    }
    const selected = await inspect(target.id);
    equal('raw approved fixture passes all real inspect guards: ' + emailState, selected.code, 200);
    const previous = new Map([...raw].map(([path, doc]) => [path, clone(doc)]));
    const result = await claim(selected);
    equal('real single claim succeeds with raw values: ' + emailState, result.code, 200);
    equal('real claim is exactly one atomic batch: ' + emailState, commits.length, 1);
    equal('real claim includes all three CAS documents: ' + emailState, commits[0].writes.map(pathOf).sort(), [target.taskPath, target.convPath, target.queuePath].sort());
    for (const path of [target.taskPath, target.convPath]) {
      equal('claim preserves raw guard document ' + path + ': ' + emailState, raw.get(path).fields, previous.get(path).fields);
      equal('claim preserves guard updateTime ' + path + ': ' + emailState, raw.get(path).updateTime, previous.get(path).updateTime);
      const write = commits[0].writes.find(w => pathOf(w) === path);
      equal('claim guard uses an explicit empty mask ' + path, write.updateMask, { fieldPaths: [] });
      equal('claim guard sends zero replacement fields ' + path, write.update.fields, {});
    }
    for (const write of commits[0].writes) equal('claim retains exact version for ' + pathOf(write), write.currentDocument, { updateTime: previous.get(pathOf(write)).updateTime });
    equal('the queue alone receives the bound delivery claim', raw.get(target.queuePath).fields.segretaria.mapValue.fields.delivery.mapValue.fields.state, { stringValue: 'claimed' });
    const repeated = await claim(selected);
    equal('a second request cannot return another payload', [repeated.code, repeated.error, Object.hasOwn(repeated, 'messages'), commits.length], [409, 'delivery_already_claimed', false, 1]);
  }

  for (const key of ['taskPath', 'convPath', 'queuePath']) for (const race of ['modify', 'delete']) {
    const target = await rawApproved('absent'), selected = await inspect(target.id);
    const beforeRace = new Map([...raw].map(([path, doc]) => [path, clone(doc)]));
    beforeCommit = () => {
      if (race === 'delete') raw.delete(target[key]);
      else raw.set(target[key], makeDoc(target[key], { ...raw.get(target[key]).fields, concurrentMarker: { stringValue: 'synthetic update' } }));
    };
    const result = await claim(selected);
    equal('CAS rejects ' + race + ' race on ' + key, [result.code, result.error, Object.hasOwn(result, 'messages')], [409, 'delivery_changed', false]);
    equal('failed race commits no partial claim: ' + key + '/' + race, commits.length, 0);
    for (const [path, doc] of beforeRace) if (path !== target[key]) equal('race preserves untouched raw document ' + path, raw.get(path), doc);
    if (race === 'delete') check('racing deletion is not recreated: ' + key, !raw.has(target[key]));
    else equal('racing change remains intact: ' + key, raw.get(target[key]).fields.concurrentMarker, { stringValue: 'synthetic update' });
  }
  console.log(`\n${checks} Firestore raw-Value and real-claim checks passed; all I/O synthetic`);
} finally { globalThis.fetch = fixtureFetch; Date.now = realNow; }
