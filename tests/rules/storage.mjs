// BOOM Storage rules — prova sull'emulatore (Storage + Firestore: le regole
// Storage leggono il ruolo da users/<uid> via firestore.get).
// Gira con: firebase emulators:exec --only firestore,storage 'node storage.mjs'
// (vedi run-tests.sh). Le regole sono quelle VERE: ../../storage.rules e
// ../../firestore.rules, caricate dal file, mai una copia scritta a mano.
//
// Il difetto che tiene lontano (12/10/2026, rilievo 13 dell'audit Palazzo):
// su documents/, maintenance/ e payment-proofs/ la lettura era anche
// `|| isLandlord()`, e in Storage `read` comprende `list`: un account
// proprietario elencava e scaricava le cartelle di tutti (carte d'identità
// archiviate dall'Innesto, contratti di altri clienti, ricevute di /rata,
// foto dei guasti). Dati sintetici: nessun nome, numero o file reale.

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadString, listAll, getBytes, getDownloadURL, uploadBytes } from 'firebase/storage';

const HERE = new URL('.', import.meta.url);
let passed = 0, failed = 0;
const failures = [];
async function check(name, promise) {
  try { await promise; passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  \x1b[31m✗ ' + name + '\x1b[0m → ' + (e.message || e)); }
}

const env = await initializeTestEnvironment({
  projectId: 'demo-boom-rules',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', HERE), 'utf8') },
  storage: { rules: readFileSync(process.env.STORAGE_RULES_FILE || new URL('../../storage.rules', HERE), 'utf8') },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/adminUid'), { role: 'admin' });
  await setDoc(doc(db, 'users/llA'), { role: 'landlord' });
  await setDoc(doc(db, 'users/tA'), { role: 'tenant' });
  await setDoc(doc(db, 'users/tB'), { role: 'tenant' });
  const st = ctx.storage();
  const put = (p, ct) => uploadString(ref(st, p), 'SINTETICO', 'raw', { contentType: ct });
  await put('documents/adminUid/innesto/1700_contratto_altro_cliente.pdf', 'application/pdf');
  await put('documents/admin/1700_documento_identita_altro.jpg', 'image/jpeg');
  await put('documents/tB/archive/receipt_pay_x.pdf', 'application/pdf');
  await put('documents/llA/1700_mio.pdf', 'application/pdf');
  await put('payment-proofs/link-pay_c_altrui_2026-10/1.jpg', 'image/jpeg');
  await put('payment-proofs/tB/1.jpg', 'image/jpeg');
  await put('payment-proofs/tA/1.jpg', 'image/jpeg');
  await put('maintenance/guasto-altrui/1.jpg', 'image/jpeg');
  await put('maintenance/tA/1.jpg', 'image/jpeg');
  await put('taxpacks/llA/2025/pack.zip', 'application/zip');
});

const llA = env.authenticatedContext('llA').storage();
const tA = env.authenticatedContext('tA').storage();
const admin = env.authenticatedContext('adminUid').storage();

console.log('\n\x1b[1mBOOM Storage Rules — test suite\x1b[0m\n');
console.log('La proprietaria non elenca né scarica le cartelle degli altri');
await check('landlord CANNOT list documents/ (radice)', assertFails(listAll(ref(llA, 'documents'))));
await check('landlord CANNOT list documents/admin', assertFails(listAll(ref(llA, 'documents/admin'))));
await check('landlord CANNOT list the Innesto archive of the admin', assertFails(listAll(ref(llA, 'documents/adminUid/innesto'))));
await check('landlord CANNOT download a contract archived by the Innesto',
  assertFails(getBytes(ref(llA, 'documents/adminUid/innesto/1700_contratto_altro_cliente.pdf'))));
await check('landlord CANNOT get the download URL of someone else\'s ID document',
  assertFails(getDownloadURL(ref(llA, 'documents/admin/1700_documento_identita_altro.jpg'))));
await check('landlord CANNOT list a tenant\'s receipts archive', assertFails(listAll(ref(llA, 'documents/tB/archive'))));
await check('landlord CANNOT list payment-proofs/ (radice)', assertFails(listAll(ref(llA, 'payment-proofs'))));
await check('landlord CANNOT list the /rata proofs of an instalment', assertFails(listAll(ref(llA, 'payment-proofs/link-pay_c_altrui_2026-10'))));
await check('landlord CANNOT download a tenant\'s payment proof', assertFails(getBytes(ref(llA, 'payment-proofs/tB/1.jpg'))));
await check('landlord CANNOT list the /guasto photos of a unit', assertFails(listAll(ref(llA, 'maintenance/guasto-altrui'))));
await check('landlord CANNOT list maintenance/ (radice)', assertFails(listAll(ref(llA, 'maintenance'))));

console.log('\nCiò che serve resta');
await check('landlord reads OWN documents folder', assertSucceeds(getBytes(ref(llA, 'documents/llA/1700_mio.pdf'))));
await check('landlord reads OWN taxpack', assertSucceeds(getBytes(ref(llA, 'taxpacks/llA/2025/pack.zip'))));
await check('tenant reads OWN payment proof', assertSucceeds(getBytes(ref(tA, 'payment-proofs/tA/1.jpg'))));
await check('tenant reads OWN maintenance photo', assertSucceeds(getBytes(ref(tA, 'maintenance/tA/1.jpg'))));
await check('tenant CANNOT read another tenant\'s proof', assertFails(getBytes(ref(tA, 'payment-proofs/tB/1.jpg'))));
await check('admin lists documents/ (radice)', assertSucceeds(listAll(ref(admin, 'documents'))));
await check('admin reads the /rata proofs', assertSucceeds(getBytes(ref(admin, 'payment-proofs/link-pay_c_altrui_2026-10/1.jpg'))));

console.log('\nIl contratto su carta caricato dal Palazzo (contracts/<id>/contratto-carta-<ts>.pdf)');
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
await check('admin uploads the paper contract PDF',
  assertSucceeds(uploadBytes(ref(admin, 'contracts/c_plz_1/contratto-carta-1760000000000.pdf'), pdf, { contentType: 'application/pdf' })));
await check('admin reads it back', assertSucceeds(getBytes(ref(admin, 'contracts/c_plz_1/contratto-carta-1760000000000.pdf'))));
await check('landlord CANNOT upload into contracts/',
  assertFails(uploadBytes(ref(llA, 'contracts/c_plz_1/contratto-carta-1.pdf'), pdf, { contentType: 'application/pdf' })));
await check('landlord CANNOT read contracts/ directly (si apre dall\'URL tokenizzato)',
  assertFails(getBytes(ref(llA, 'contracts/c_plz_1/contratto-carta-1760000000000.pdf'))));
await check('tenant CANNOT upload into contracts/',
  assertFails(uploadBytes(ref(tA, 'contracts/c_plz_1/x.pdf'), pdf, { contentType: 'application/pdf' })));

await env.cleanup();
console.log('\n' + '─'.repeat(48));
console.log(`\x1b[1mResult: ${passed} passed, ${failed} failed\x1b[0m`);
if (failed) { console.log('\x1b[31mFAILED:\x1b[0m ' + failures.join(', ')); process.exit(1); }
console.log('\x1b[32mStorage rules behave as intended.\x1b[0m');
