// Real runJourney + Firestore helpers + email transport; only network boundaries are synthetic.
import assert from 'node:assert/strict';
import { toFsFields, fsValToJs } from '../../api/homie/_lib.js';

export async function verifyJourneyRun({ runJourney, shift, handover, check }) {
  const beforeFetch = globalThis.fetch, beforeMails = globalThis.__mails;
  const rows = new Map(); let patches = 0;
  const base = { status: 'active', signatureStatus: 'complete', tenantId: 'tenant-synthetic', startDate: shift(-4), endDate: shift(361) };
  rows.set('contracts/unconfirmed', { ...base });
  rows.set('contracts/delayed', { ...base, startDate: shift(-20), verbaleConsegna: handover(-4) });
  rows.set('contracts/recent', { ...base, verbaleConsegna: handover(-1) });
  rows.set('contracts/already', { ...base, verbaleConsegna: handover(-4), journey: { p3: 'prior-send' } });
  rows.set('users/tenant-synthetic', { name: 'Synthetic tenant', email: 'journey@example.invalid' });
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
  const doc = (path, data) => ({ name: 'projects/synthetic/databases/(default)/documents/' + path, fields: toFsFields(data) });
  globalThis.__mails = [];
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(String(raw));
    if (url.hostname === 'identitytoolkit.googleapis.com') return response({ idToken: 'synthetic' });
    assert.equal(url.hostname, 'firestore.googleapis.com', 'No external service/network');
    if (url.pathname.endsWith(':runQuery')) {
      const query = JSON.parse(options.body).structuredQuery, collection = query.from[0].collectionId;
      assert(['contracts', 'leads', 'payments', 'invoices'].includes(collection));
      return response([...rows].filter(([path]) => path.startsWith(collection + '/')).map(([path, data]) => ({ document: doc(path, data) })));
    }
    const path = decodeURIComponent(url.pathname.split('/documents/')[1] || '');
    if (!options.method || options.method === 'GET') return rows.has(path) ? response(doc(path, rows.get(path))) : response({}, 404);
    assert.equal(options.method, 'PATCH');
    assert(path.startsWith('contracts/'));
    const fields = JSON.parse(options.body).fields;
    assert.deepEqual(Object.keys(fields), ['journey'], 'Only existing once flags may be written');
    patches++;
    Object.assign(rows.get(path), Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fsValToJs(value)])));
    return response(doc(path, rows.get(path)));
  };
  try {
    const first = await runJourney();
    check('runner reale: invia soltanto p3 della consegna provata e maturata', first.errors === 0 && JSON.stringify(first.sent) === JSON.stringify(['delayed:p3']) && globalThis.__mails.length === 1 && patches === 1);
    check('runner reale: nessun flag scritto per decorrenza senza consegna', !rows.get('contracts/unconfirmed').journey && !rows.get('contracts/recent').journey);
    check('runner reale: conserva il flag p3 già registrato', rows.get('contracts/already').journey.p3 === 'prior-send');
    const second = await runJourney();
    check('runner reale: secondo giro non duplica email o flag', second.sent.length === 0 && globalThis.__mails.length === 1 && patches === 1);
    rows.get('contracts/unconfirmed').verbaleConsegna = handover(-3);
    const recovered = await runJourney();
    check('runner reale: verbale arrivato dopo abilita la tappa, una volta sola', JSON.stringify(recovered.sent) === JSON.stringify(['unconfirmed:p3']) && globalThis.__mails.length === 2 && patches === 2);
  } finally { globalThis.fetch = beforeFetch; globalThis.__mails = beforeMails; }
}

// La provvigione nel runner vero: la fattura prov_ nata PRIMA del contratto
// (contractId vuoto) si ritrova dalla proposta, e la T-7 porta il link.
export async function verifyFeeRun({ runJourney, shift, check }) {
  const beforeFetch = globalThis.fetch, beforeMails = globalThis.__mails;
  const rows = new Map();
  rows.set('contracts/pa_pa1', { status: 'active', signatureStatus: 'complete', tenantId: 'tenant-synthetic', startDate: shift(6), endDate: shift(371), preAgreementId: 'pa1' });
  rows.set('contracts/other', { status: 'active', signatureStatus: 'complete', tenantId: 'tenant-synthetic', startDate: shift(5), endDate: shift(370) });
  rows.set('invoices/prov_pa1', { status: 'pending', amount: 1464, dueDate: shift(6), contractId: '', preAgreementId: 'pa1' });
  rows.set('invoices/inv_other', { status: 'pending', amount: 99, dueDate: shift(5), contractId: 'other' });
  rows.set('users/tenant-synthetic', { name: 'Synthetic tenant', email: 'journey@example.invalid' });
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
  const doc = (path, data) => ({ name: 'projects/synthetic/databases/(default)/documents/' + path, fields: toFsFields(data) });
  globalThis.__mails = [];
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(String(raw));
    if (url.hostname === 'identitytoolkit.googleapis.com') return response({ idToken: 'synthetic' });
    assert.equal(url.hostname, 'firestore.googleapis.com', 'No external service/network');
    if (url.pathname.endsWith(':runQuery')) {
      const query = JSON.parse(options.body).structuredQuery, collection = query.from[0].collectionId;
      assert(['contracts', 'leads', 'payments', 'invoices'].includes(collection));
      return response([...rows].filter(([path]) => path.startsWith(collection + '/')).map(([path, data]) => ({ document: doc(path, data) })));
    }
    const path = decodeURIComponent(url.pathname.split('/documents/')[1] || '');
    if (!options.method || options.method === 'GET') return rows.has(path) ? response(doc(path, rows.get(path))) : response({}, 404);
    assert.equal(options.method, 'PATCH');
    assert(path.startsWith('contracts/'), 'il journey non scrive sulle fatture');
    Object.assign(rows.get(path), Object.fromEntries(Object.entries(JSON.parse(options.body).fields).map(([key, value]) => [key, fsValToJs(value)])));
    return response(doc(path, rows.get(path)));
  };
  try {
    const out = await runJourney();
    const mails = globalThis.__mails.map(m => String(m.html || ''));
    const withFee = mails.filter(h => h.includes('/api/payments/link?k=inv&amp;id=prov_pa1&amp;t='));
    check('runner reale: T-7 porta il link della provvigione ritrovata dalla proposta', out.errors === 0 && out.sent.includes('pa_pa1:t7') && withFee.length === 1);
    check('runner reale: una fattura che non è la provvigione non entra nelle email', !mails.some(h => h.includes('inv_other')) && out.sent.includes('other:t7'));
  } finally { globalThis.fetch = beforeFetch; globalThis.__mails = beforeMails; }
}
