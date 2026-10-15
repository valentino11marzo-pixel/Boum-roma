import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
const F = await import('./fixture.mjs');
const { finalizeContract, retryRegistrationPackage } = await import('../../api/sign/_finalize.js');
let passed = 0;
function check(name, value) { if (!value) throw Error('FAIL ' + name); passed++; console.log('PASS ' + name); }
const packageMails = () => globalThis.deliveryMails.filter(m => /Pacchetto registrazione/.test(m.subject));
const welcomeMails = () => globalThis.deliveryMails.filter(m => /Welcome home|Contratto firmato —/.test(m.subject));
const receiptMails = () => globalThis.deliveryMails.filter(m => /lease is registered|Contratto registrato/.test(m.subject));
const error550 = () => Object.assign(Error('synthetic rejection'), { responseCode: 550 });
const pending = () => ({ finalizedAt: '2026-10-15T12:05:00Z', signingCertificateUrl: 'https://storage.example/cert.pdf', signedPdfUrl: 'https://storage.example/signed.pdf', registrationPackEmail: { status: 'pending', attempts: 0 } });
const sendingPackage = d => d.registrationPackEmail?.status === 'sending';
const sendingReceipt = d => Object.values(d.registrationReceiptDelivery || {}).some(e => e.status === 'sending');

// A failed initial claim retains an explicit, safe intent and canonical artifacts.
F.reset(); let refused = false;
F.hooks.fail = ws => { if (!refused && F.writesData(ws).some(sendingPackage)) { refused = true; return true; } return false; };
let r = await finalizeContract(F.current());
check('initial claim failed: no package sent', refused && packageMails().length === 0 && !r.caf);
check('initial claim failed: durable pending and signed artifacts survive', F.current().registrationPackEmail?.status === 'pending' && F.current().finalizedAt && F.current().signedPdfUrl);
const welcomeBefore = welcomeMails().length;
F.hooks.fail = () => false;
r = await F.cron();
check('REAL cron recovers pending package', r.code === 200 && packageMails().length === 1 && F.current().registrationPackEmail.status === 'sent');
check('REAL cron does not repeat welcome', welcomeBefore === 2 && welcomeMails().length === welcomeBefore);
check('cron uses only mocked IO', F.unexpected.length === 0);

// Failure of the atomic checkpoint cannot stamp finalizedAt without an intent.
F.reset();
F.hooks.fail = ws => F.writesData(ws).some(d => d.registrationPackEmail?.status === 'pending');
r = await finalizeContract(F.current());
check('checkpoint rejected: no finalized marker or email', !r.ok && !F.current().finalizedAt && globalThis.deliveryMails.length === 0);
F.hooks.fail = () => false;
await finalizeContract(F.current());
check('checkpoint retry completes normally once', packageMails().length === 1 && welcomeMails().length === 2);

// Two stale snapshots compete at the real Firestore CAS transport boundary.
F.reset(pending());
F.hooks.beforeCommit = F.twoClaims(sendingPackage);
const same = F.current();
await Promise.all([retryRegistrationPackage(same), retryRegistrationPackage(same)]);
check('concurrent package claims send exactly once', packageMails().length === 1 && F.current().registrationPackEmail.attempts === 1);

// Concurrent invocations of the real cron must also share the same claim.
F.reset(pending()); F.hooks.beforeCommit = F.twoClaims(sendingPackage);
await Promise.all([F.cron(), F.cron()]);
check('two REAL crons send one package', packageMails().length === 1 && F.current().registrationPackEmail.status === 'sent');
check('concurrent crons use only mocked IO', F.unexpected.length === 0);

// Only a certain rejection permits automatic retry; unknown transport outcomes stay held.
F.reset(pending()); globalThis.deliverySmtp = mail => { if (/Pacchetto registrazione/.test(mail.subject)) throw error550(); };
await retryRegistrationPackage(F.current());
check('SMTP rejection recorded failed', F.current().registrationPackEmail.status === 'failed');
globalThis.deliverySmtp = null; await F.cron();
check('REAL cron retries only rejected package', packageMails().length === 1 && F.current().registrationPackEmail.attempts === 2 && welcomeMails().length === 0);
F.reset(pending()); globalThis.deliverySmtp = () => { throw Error('email_timeout'); };
await retryRegistrationPackage(F.current()); globalThis.deliverySmtp = null;
await F.cron();
check('uncertain package is never automatically resent', F.current().registrationPackEmail.status === 'uncertain' && globalThis.deliveryMailAttempts.length === 1);

// Three parties: owner rejects, successful recipients must never receive the retry.
F.reset(); globalThis.deliverySmtp = mail => { if (mail.to === 'owner@example.test') throw error550(); };
r = await F.drive(F.upload());
check('receipt real handler records partial delivery', r.code === 200 && r.body.sent.length === 2 && r.body.failed.join() === 'landlord');
globalThis.deliverySmtp = null;
r = await F.drive({});
check('receipt retry addresses only rejected owner', r.body.sent.length === 1 && r.body.sent[0].who === 'landlord' && receiptMails().length === 3);
await F.drive(F.upload());
check('same PDF POST retry produces no new receipt delivery', receiptMails().length === 3);

// Concurrent full POSTs, including upload, share file identity and per-person CAS.
F.reset(); F.hooks.beforeCommit = F.twoClaims(sendingReceipt);
const both = await Promise.all([F.drive(F.upload()), F.drive(F.upload())]);
check('concurrent full receipt POSTs are successful', both.every(x => x.code === 200));
check('concurrent full receipt POSTs send one email per party', receiptMails().length === 3 && new Set(receiptMails().map(m => m.to)).size === 3);
check('concurrent receipts preserve all ledger outcomes', Object.values(F.current().registrationReceiptDelivery).length === 3 && Object.values(F.current().registrationReceiptDelivery).every(x => x.status === 'sent'));

// An explicit resend of an uncertain party still cannot steal an in-flight claim.
F.reset(); globalThis.deliverySmtp = mail => { if (mail.to === 'tenant@example.test') throw Error('socket hang up'); };
r = await F.drive(F.upload()); globalThis.deliverySmtp = null;
r = await F.drive({});
check('normal receipt retry preserves uncertainty', r.body.uncertain.join() === 'tenant' && receiptMails().length === 2);
F.hooks.beforeCommit = F.twoClaims(sendingReceipt);
await Promise.all([F.drive({ resend: true }), F.drive({ resend: true })]);
check('two explicit uncertain retries produce one additional email', receiptMails().length === 3 && receiptMails().filter(m => m.to === 'tenant@example.test').length === 1);

// A lost durable result after SMTP success is held, never silently retried.
F.reset();
F.hooks.fail = ws => F.writesData(ws).some(d => Object.values(d.registrationReceiptDelivery || {}).some(e => e.who === 'tenant' && e.status === 'sent'));
await F.drive(F.upload()); F.hooks.fail = () => false;
const attempts = globalThis.deliveryMailAttempts.length;
await F.drive({});
check('lost receipt outcome leaves sending held and does not resend', globalThis.deliveryMailAttempts.length === attempts && Object.values(F.current().registrationReceiptDelivery).find(e => e.who === 'tenant').status === 'sending');
check('all handler traffic remained simulated', F.unexpected.length === 0);
console.log(`Registration delivery: ${passed} passed`);
