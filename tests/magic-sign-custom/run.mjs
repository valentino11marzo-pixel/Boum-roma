// Integration check for the custom-signing endpoint's evidence and finalization states.
import crypto from 'node:crypto';

process.env.FIREBASE_API_KEY = 'test';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@example.test';
process.env.FIREBASE_ADMIN_PASS = 'test';

const { toFsFields, fsDocToJs } = await import('../../api/homie/_lib.js');
const { default: submit } = await import('../../api/sign/custom/submit.js');

const doc = {
  title: 'Test document', status: 'sent',
  originalPdfUrl: 'https://example.test/missing.pdf',
  requiredRoles: ['tenant'], fields: [],
  signers: { tenant: { name: 'Tenant', email: 'tenant@example.test', token: 'test-token', signedAt: null } },
};
const events = [];
const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.includes('accounts:signInWithPassword')) return response(200, { idToken: 'admin-token' });
  if (url === doc.originalPdfUrl) return response(404, {});
  if (url.includes('/signRequests/test-request')) {
    if (!init.method || init.method === 'GET') {
      return response(200, { name: 'projects/test/databases/(default)/documents/signRequests/test-request', fields: toFsFields(doc) });
    }
    if (url.includes('currentDocument.exists=false')) return response(409, {});
    const patch = fsDocToJs({ name: 'projects/test/databases/(default)/documents/signRequests/test-request', fields: JSON.parse(init.body).fields });
    if (patch.signers) doc.signers = { ...doc.signers, ...patch.signers };
    Object.assign(doc, { ...patch, signers: doc.signers });
    return response(200, {});
  }
  if (url.includes('/agentNotifications') && init.method === 'POST') {
    events.push(fsDocToJs({ name: 'projects/test/databases/(default)/documents/agentNotifications/n1', fields: JSON.parse(init.body).fields }));
    return response(200, { name: 'projects/test/databases/(default)/documents/agentNotifications/n1' });
  }
  throw new Error('unexpected fetch: ' + url);
};

function res() {
  return { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
const base = { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.100', 'user-agent': 'test' }, body: {
  req: 'test-request', role: 'tenant', token: 'test-token', signature: 'data:image/png;base64,' + 'A'.repeat(70),
} };

const noConsent = res();
await submit(base, noConsent);
if (noConsent.statusCode !== 400 || noConsent.body.error !== 'missing_consent' || doc.signers.tenant.signedAt) {
  throw new Error('A custom signature without consent was accepted');
}

const text = 'I confirm my identity and accept this document. This digital signature is legally valid (FES — Art. 21 CAD).';
const consent = { text, hash: crypto.createHash('sha256').update(text).digest('hex') };
const signed = res();
await submit({ ...base, body: { ...base.body, consent } }, signed);
if (signed.statusCode !== 200 || !signed.body.ok || signed.body.complete !== false || signed.body.finalizationPending !== true) {
  throw new Error('Missing final PDF was presented as a complete document');
}
if (doc.status !== 'finalization_failed' || !doc.signers.tenant.consentHash || !doc.signers.tenant.consentAt) {
  throw new Error('Signature evidence or failed-finalization state was not saved');
}
if (events.length !== 1 || events[0].type !== 'document.finalization_failed') {
  throw new Error('Operator was not informed that the final PDF is missing');
}
console.log('Magic Sign Custom: missing consent rejected; PDF failure retained as an operator action.');
