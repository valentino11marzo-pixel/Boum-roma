// Exercise the real approval handler. Only Firestore/auth/HTTP/dialog IO is mocked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const portal = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const start = portal.indexOf('    async function approveAgentAction(');
const end = portal.indexOf('    async function rejectAgentAction(', start);
assert(start >= 0 && end > start, 'Handler reale presente');
const handler = portal.slice(start, end);
const stamp = '2026-09-21T12:00:00.000Z';
let passed = 0, failed = 0;
const check = async (name, run) => {
  try { await run(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.message); }
};
async function execute({ result, channel, kind = 'reply', source = handler, response } = {}) {
  const action = { id: 'action-demo', kind, leadId: 'lead-demo', payload: channel ? { channel } : {} };
  const io = { toasts: [], requests: [], writes: [], confirms: [], logs: [] };
  const context = vm.createContext({
    S: { actionQueue: [structuredClone(action)], profile: { id: 'admin-demo' } },
    auth: { currentUser: { getIdToken: async () => 'synthetic-token' } },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => stamp } } },
    db: { collection(name) {
      assert.equal(name, 'action_queue');
      return { doc(id) { assert.equal(id, action.id); return { async update(data) { io.writes.push({ name, id, data }); } }; } };
    } },
    fetch: async (url, options) => {
      io.requests.push({ url, ...options });
      assert.equal(url, '/api/agent/execute');
      return { json: async () => structuredClone(response || { ok: true, status: 'executed', result }) };
    },
    confirm: message => { io.confirms.push(message); return true; },
    toast: (...args) => io.toasts.push(args),
    logActivity: (...args) => io.logs.push(args)
  });
  vm.runInContext(source, context);
  await vm.runInContext("approveAgentAction('action-demo')", context);
  const plain = JSON.parse(JSON.stringify(io));
  assert.equal(plain.confirms.length, 1);
  assert.deepEqual(plain.writes, [{ name: 'action_queue', id: action.id,
    data: { status: 'approved', approvedAt: stamp, approvedBy: 'admin-demo' } }]);
  assert.deepEqual(plain.requests.map(r => ({ url: r.url, method: r.method, token: r.headers['X-Firebase-Token'], body: JSON.parse(r.body) })),
    [{ url: '/api/agent/execute', method: 'POST', token: 'synthetic-token', body: { id: action.id } }]);
  assert.equal(plain.toasts.length, 1, 'Un solo esito leggibile');
  return plain.toasts[0];
}
function whatsappUnverified(toast) {
  const text = toast.join(' ');
  assert.doesNotMatch(text, /messaggio inviato|whatsapp inviat[oa]|whatsapp consegnat[oa]/i, 'WhatsApp senza prova non è dichiarato inviato');
  assert.match(text, /whatsapp/i, 'Il canale non viene nascosto');
  assert.match(text, /verific/i, 'Esito WhatsApp da verificare esplicito');
}

await check('WhatsApp URL: il risultato prevale sul payload e non dichiara invio', async () => {
  const toast = await execute({ channel: 'email', result: { channel: 'whatsapp', whatsapp: { url: 'https://wa.me/390000000000?text=simulato' } } });
  whatsappUnverified(toast); assert.doesNotMatch(toast.join(' '), /email inviata/i);
});
await check('WhatsApp queued: un indizio di coda non diventa invio', async () => {
  whatsappUnverified(await execute({ channel: 'whatsapp', result: { channel: 'whatsapp', whatsapp: { queued: true }, queued: true } }));
});
await check('email sent true: invio confermato, anche nel canale email predefinito', async () => {
  for (const result of [{ channel: 'email', email: { sent: true } }, { email: { sent: true } }]) {
    assert.match((await execute({ result })).join(' '), /email inviata/i);
  }
});
await check('email senza prova booleana: executed non dichiara invio', async () => {
  for (const sent of [false, undefined, 'true']) {
    const toast = await execute({ channel: 'email', result: { channel: 'email', email: { sent } } });
    assert.doesNotMatch(toast.join(' '), /email inviata|messaggio inviato/i);
    assert.match(toast.join(' '), /verific/i);
  }
});
await check('both: separa email provata e WhatsApp da verificare', async () => {
  const toast = await execute({ result: { channel: 'both', email: { sent: true }, whatsapp: { url: 'https://wa.me/390000000000' } } });
  whatsappUnverified(toast); assert.match(toast.join(' '), /email inviata/i);
});
await check('both senza email provata: nessun canale viene dichiarato inviato', async () => {
  const toast = await execute({ result: { channel: 'both', email: { sent: false } } });
  whatsappUnverified(toast); assert.doesNotMatch(toast.join(' '), /email inviata/i);
});
await check('risultato legacy nullo: usa il canale WhatsApp del payload', async () => {
  whatsappUnverified(await execute({ channel: 'whatsapp', result: null }));
});
await check('azione non reply: resta Azione applicata', async () => {
  assert.deepEqual(await execute({ kind: 'archive', result: { channel: 'whatsapp' } }), ['success', 'Eseguita', 'Azione applicata']);
});
await check('risposta ancora in coda: mantiene il riscontro precedente senza invio', async () => {
  assert.deepEqual(await execute({ channel: 'whatsapp', response: { ok: true, status: 'approved' } }), ['info', 'In coda', "L'agente la eseguirà a breve"]);
});
await check('MUTAZIONE: ripristinare Messaggio inviato viene rilevato', async () => {
  const opening = "if (data?.ok && data.status === 'executed') {";
  const from = handler.indexOf(opening), to = handler.indexOf("} else if (data?.error === 'no_executor_for_kind:other'", from);
  assert(from >= 0 && to > from, 'Ramo executed reale presente');
  const source = handler.slice(0, from + opening.length)
    + "\n toast('success', 'Eseguita', action.kind === 'reply' ? 'Messaggio inviato' : 'Azione applicata');\n "
    + handler.slice(to);
  assert.notEqual(source, handler, 'La mutazione ripristina davvero il vecchio feedback');
  const toast = await execute({ source, channel: 'whatsapp', result: { channel: 'whatsapp', whatsapp: { url: 'https://wa.me/390000000000' } } });
  assert.throws(() => whatsappUnverified(toast), /WhatsApp senza prova non è dichiarato inviato/);
});
console.log('Action feedback: ' + passed + ' pass, ' + failed + ' fail');
process.exitCode = failed ? 1 : 0;
