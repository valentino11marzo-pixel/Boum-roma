// BOOM Firestore rules — automated test suite.
// Runs against the Firestore emulator (started by `firebase emulators:exec`).
// Proves the rules in ../../firestore.rules behave correctly BEFORE deploy.
//
// Scenario data:
//   admin      = adminUid (role admin)
//   landlordA  = llA      (owns propA)
//   landlordB  = llB      (owns propB)
//   tenantA    = tA       (rents propA via contractA)
//   tenantB    = tB       (rents propB via contractB)

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';

const PROJECT = 'boom-rules-test';
let passed = 0, failed = 0;
const failures = [];

async function check(name, promise) {
  try { await promise; passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  \x1b[31m✗ ' + name + '\x1b[0m → ' + (e.message || e)); }
}

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

// ── Seed data with rules DISABLED ───────────────────────────────────────
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/adminUid'), { role: 'admin', name: 'Admin' });
  await setDoc(doc(db, 'users/llA'),      { role: 'landlord', name: 'Landlord A' });
  await setDoc(doc(db, 'users/llB'),      { role: 'landlord', name: 'Landlord B' });
  await setDoc(doc(db, 'users/tA'),       { role: 'tenant', name: 'Tenant A' });
  await setDoc(doc(db, 'users/tB'),       { role: 'tenant', name: 'Tenant B' });

  await setDoc(doc(db, 'properties/propA'), { ownerId: 'llA', currentContractId: 'contractA', name: 'Prop A' });
  await setDoc(doc(db, 'properties/propB'), { ownerId: 'llB', currentContractId: 'contractB', name: 'Prop B' });

  await setDoc(doc(db, 'contracts/contractA'), { tenantId: 'tA', propertyId: 'propA', rent: 1000 });
  await setDoc(doc(db, 'contracts/contractB'), { tenantId: 'tB', propertyId: 'propB', rent: 1200 });

  await setDoc(doc(db, 'payments/payA'), { tenantId: 'tA', propertyId: 'propA', contractId: 'contractA', amount: 1000, status: 'pending' });
  await setDoc(doc(db, 'payments/payB'), { tenantId: 'tB', propertyId: 'propB', contractId: 'contractB', amount: 1200, status: 'pending' });

  await setDoc(doc(db, 'maintenance/mA'), { userId: 'tA', propertyId: 'propA', title: 'Leak' });
  await setDoc(doc(db, 'maintenance/mB'), { userId: 'tB', propertyId: 'propB', title: 'Heater' });

  await setDoc(doc(db, 'documents/docA'), { userId: 'tA', propertyId: 'propA', shared: false });
  await setDoc(doc(db, 'leads/lead1'), { name: 'Hot lead', email: 'x@y.com' });
  await setDoc(doc(db, 'pfsClients/c1'), { name: 'PFS client', budget: '€1000' });
  await setDoc(doc(db, 'config/parse_docs'), { bearer: 'super-secret-token' });
  await setDoc(doc(db, 'documentShares/share1'), { token: 'tok_abc', ownerId: 'llA', docIds: ['d1'], revoked: false });
  await setDoc(doc(db, 'taxPacks/pack1'), { ownerId: 'llA', fiscalYear: 2025, propertyId: 'propA' });
});

// Auth contexts
const admin = env.authenticatedContext('adminUid').firestore();
const llA   = env.authenticatedContext('llA').firestore();
const llB   = env.authenticatedContext('llB').firestore();
const tA    = env.authenticatedContext('tA').firestore();
const tB    = env.authenticatedContext('tB').firestore();
const anon  = env.unauthenticatedContext().firestore();

console.log('\n\x1b[1mBOOM Firestore Rules — test suite\x1b[0m\n');

// ── ADMIN: full access ──────────────────────────────────────────────────
console.log('Admin');
await check('admin reads any contract',  assertSucceeds(getDoc(doc(admin, 'contracts/contractB'))));
await check('admin reads leads',         assertSucceeds(getDoc(doc(admin, 'leads/lead1'))));
await check('admin reads pfsClients',    assertSucceeds(getDoc(doc(admin, 'pfsClients/c1'))));
await check('admin reads config bearer', assertSucceeds(getDoc(doc(admin, 'config/parse_docs'))));
await check('admin writes a property',   assertSucceeds(setDoc(doc(admin, 'properties/propC'), { ownerId: 'llA', name: 'C' })));
await check('admin deletes a payment',   assertSucceeds(deleteDoc(doc(admin, 'payments/payB'))));

// ── TENANT A: own data only ─────────────────────────────────────────────
console.log('\nTenant A (rents propA)');
await check('reads OWN contract',            assertSucceeds(getDoc(doc(tA, 'contracts/contractA'))));
await check('CANNOT read tenant B contract', assertFails(getDoc(doc(tA, 'contracts/contractB'))));
await check('reads OWN payment',             assertSucceeds(getDoc(doc(tA, 'payments/payA'))));
await check('CANNOT read tenant B payment',  assertFails(getDoc(doc(tA, 'payments/payB'))));
await check('reads OWN maintenance',         assertSucceeds(getDoc(doc(tA, 'maintenance/mA'))));
await check('CANNOT read tenant B maint.',   assertFails(getDoc(doc(tA, 'maintenance/mB'))));
await check('reads the property they rent',  assertSucceeds(getDoc(doc(tA, 'properties/propA'))));
await check('CANNOT read property B',        assertFails(getDoc(doc(tA, 'properties/propB'))));
await check('CANNOT read the lead pool',     assertFails(getDoc(doc(tA, 'leads/lead1'))));
await check('CANNOT read pfsClients',        assertFails(getDoc(doc(tA, 'pfsClients/c1'))));
await check('CANNOT read config bearer',     assertFails(getDoc(doc(tA, 'config/parse_docs'))));
await check('CANNOT read tenant B user doc', assertFails(getDoc(doc(tA, 'users/tB'))));
await check('reads OWN user doc',            assertSucceeds(getDoc(doc(tA, 'users/tA'))));

// ── TENANT A: allowed writes ────────────────────────────────────────────
console.log('\nTenant A — self-service writes');
await check('creates maintenance with own userId',
  assertSucceeds(setDoc(doc(tA, 'maintenance/newM'), { userId: 'tA', propertyId: 'propA', title: 'New' })));
await check('CANNOT create maintenance as another user',
  assertFails(setDoc(doc(tA, 'maintenance/badM'), { userId: 'tB', propertyId: 'propB', title: 'Spoof' })));
await check('flags OWN payment reported (allowed fields)',
  assertSucceeds(updateDoc(doc(tA, 'payments/payA'), { tenantReported: true, proofUrl: 'http://x/p.jpg' })));
await check('CANNOT change payment amount',
  assertFails(updateDoc(doc(tA, 'payments/payA'), { amount: 1 })));
await check('CANNOT escalate own role to admin',
  assertFails(updateDoc(doc(tA, 'users/tA'), { role: 'admin' })));
await check('CANNOT delete a contract',
  assertFails(deleteDoc(doc(tA, 'contracts/contractA'))));
await check('signs OWN contract (signature fields only)',
  assertSucceeds(updateDoc(doc(tA, 'contracts/contractA'), { tenantSignature: 'data:img', tenantSignedAt: 'now' })));
await check('CANNOT change rent on own contract',
  assertFails(updateDoc(doc(tA, 'contracts/contractA'), { rent: 1 })));

// ── LANDLORD A: own properties only ─────────────────────────────────────
console.log('\nLandlord A (owns propA)');
await check('reads OWN property',             assertSucceeds(getDoc(doc(llA, 'properties/propA'))));
await check('CANNOT read landlord B property',assertFails(getDoc(doc(llA, 'properties/propB'))));
await check('reads contract on OWN property',  assertSucceeds(getDoc(doc(llA, 'contracts/contractA'))));
await check('CANNOT read contract on B prop',  assertFails(getDoc(doc(llA, 'contracts/contractB'))));
await check('reads payment on OWN property',   assertSucceeds(getDoc(doc(llA, 'payments/payA'))));
await check('CANNOT write a property (admin only)',
  assertFails(setDoc(doc(llA, 'properties/propA'), { ownerId: 'llA', hacked: true })));
await check('CANNOT read the lead pool',       assertFails(getDoc(doc(llA, 'leads/lead1'))));

// ── ANONYMOUS — Magic-Sign moved server-side ────────────────────────────
console.log('\nAnonymous on contracts — magic-sign moved to /api/magic-sign/*');
await check('anon CANNOT read a contract by id',
  assertFails(getDoc(doc(anon, 'contracts/contractA'))));
await check('anon CANNOT update a contract signature',
  assertFails(updateDoc(doc(anon, 'contracts/contractA'), { tenantSignature: 'data:x', tenantSignToken: null })));

// ── ANONYMOUS ───────────────────────────────────────────────────────────
console.log('\nAnonymous (not signed in)');
await check('CANNOT read any contract', assertFails(getDoc(doc(anon, 'contracts/contractA'))));
await check('CANNOT read any property', assertFails(getDoc(doc(anon, 'properties/propA'))));
await check('CANNOT read users',        assertFails(getDoc(doc(anon, 'users/tA'))));
await check('CAN create a viewingRequest (public form)',
  assertSucceeds(setDoc(doc(anon, 'viewingRequests/vr1'), { name: 'Walk-in', email: 'a@b.com' })));

// ── documentShares + taxPacks (commercialista) ──────────────────────────
console.log('\ndocumentShares + taxPacks');
await check('admin reads a documentShare', assertSucceeds(getDoc(doc(admin, 'documentShares/share1'))));
await check('landlord A reads OWN documentShare', assertSucceeds(getDoc(doc(llA, 'documentShares/share1'))));
await check('landlord B CANNOT read A documentShare', assertFails(getDoc(doc(llB, 'documentShares/share1'))));
await check('tenant CANNOT read documentShares', assertFails(getDoc(doc(tA, 'documentShares/share1'))));
await check('landlord A creates a share for SELF', assertSucceeds(setDoc(doc(llA, 'documentShares/share2'), { token:'t2', ownerId:'llA', docIds:['d1'], revoked:false })));
await check('landlord A CANNOT create a share owned by B', assertFails(setDoc(doc(llA, 'documentShares/share3'), { token:'t3', ownerId:'llB', docIds:['d1'] })));
await check('landlord A reads OWN taxPack', assertSucceeds(getDoc(doc(llA, 'taxPacks/pack1'))));
await check('landlord B CANNOT read A taxPack', assertFails(getDoc(doc(llB, 'taxPacks/pack1'))));

// ── DEFAULT DENY ────────────────────────────────────────────────────────
console.log('\nDefault-deny');
await check('admin CANNOT touch an undeclared collection',
  assertFails(getDoc(doc(admin, 'someRandomCollection/x'))));

// ── Summary ─────────────────────────────────────────────────────────────
await env.cleanup();
console.log('\n' + '─'.repeat(48));
console.log(`\x1b[1mResult: ${passed} passed, ${failed} failed\x1b[0m`);
if (failed) { console.log('\x1b[31mFAILED:\x1b[0m ' + failures.join(', ')); process.exit(1); }
console.log('\x1b[32mAll rules behave as intended.\x1b[0m');
