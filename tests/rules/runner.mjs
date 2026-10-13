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
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField,
  collection, query, where, getDocs,
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
  await setDoc(doc(db, 'properties/propNoCur'), { ownerId: 'llA', name: 'Prop senza contratto corrente' });

  await setDoc(doc(db, 'contracts/contractA'), { tenantId: 'tA', propertyId: 'propA', rent: 1000 });
  await setDoc(doc(db, 'contracts/contractB'), { tenantId: 'tB', propertyId: 'propB', rent: 1200 });
  // Le chiavi di firma: nel deposito admin-only, mai sul contratto. Un
  // contratto LEGACY le porta ancora in chiaro (prima della migrazione).
  await setDoc(doc(db, 'signTokens/contractA'), { contractId: 'contractA', tenant: 'tok-tenant-A-000', landlord: 'tok-landlord-A-00' });
  await setDoc(doc(db, 'contracts/contractLegacy'), { tenantId: 'tA', propertyId: 'propA', rent: 900,
    tenantSignToken: 'tok-legacy-tenant', landlordSignToken: 'tok-legacy-landlord' });

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

  // ── Palazzo (12/10/2026): le porte del ruolo landlord ──────────────────
  // Le manopole interne in settings, e quelle che il pubblico legge.
  for (const x of ['registrazione', 'ai', 'rentFeeStats', 'sddFeeStats', 'viewingAvailability', 'squadra', 'segretaria',
       'fiducia', 'publisher', 'outreach', 'cockpit', 'general', 'mediaRehost', 'marketBenchmarks'])
    await setDoc(doc(db, 'settings/' + x), { secret: 'interno-' + x });
  await setDoc(doc(db, 'settings/company'), { iban: 'IT60X0542811101000000123456' });
  await setDoc(doc(db, 'settings/video'), { url: 'https://example.invalid/v.mp4' });
  await setDoc(doc(db, 'settings/canoneAccordo'), { pArr: 0.1 });
  // Inbox: una conversazione assegnata alla proprietaria A, con l'analisi
  // AI; un messaggio del contatto e una NOTA INTERNA.
  await setDoc(doc(db, 'conversations/conv1'), { contactUid: 'tA', assignedLandlordId: 'llA', aiSummary: 'analisi interna', suggestedReply: 'bozza' });
  await setDoc(doc(db, 'messages/msgIn'), { conversationId: 'conv1', contactUid: 'tA', assignedLandlordId: 'llA', direction: 'in', body: 'ciao' });
  await setDoc(doc(db, 'messages/msgNote'), { conversationId: 'conv1', contactUid: 'tA', assignedLandlordId: 'llA', direction: 'note', body: 'NOTA INTERNA' });
  // La proprietaria C ha un palazzo da 9 interni (un blocco del loader) —
  // ogni interno con contratto, rata, guasto e documento condiviso.
  await setDoc(doc(db, 'users/llC'), { role: 'landlord', name: 'Landlord C' });
  for (let i = 1; i <= 9; i++) {
    const p = 'plzC_' + i;
    await setDoc(doc(db, 'properties/' + p), { ownerId: 'llC', name: 'Int. ' + i });
    await setDoc(doc(db, 'contracts/cC_' + i), { tenantId: 'tC' + i, propertyId: p, rent: 900 });
    await setDoc(doc(db, 'payments/payC_' + i), { tenantId: 'tC' + i, propertyId: p, contractId: 'cC_' + i, amount: 900, status: 'pending' });
    await setDoc(doc(db, 'maintenance/mC_' + i), { userId: 'tC' + i, propertyId: p, title: 'Guasto ' + i });
    await setDoc(doc(db, 'documents/dC_' + i), { userId: 'adminUid', propertyId: p, shared: true, name: 'Doc ' + i });
  }
  // Il cambio di inquilino (13/10/2026): l'interno propX ha un contratto
  // corrente nuovo; il vecchio è finito (per stato, per data o per chiusura
  // anticipata) o resta 'active' per dimenticanza ma con la fine passata.
  // Una seconda stanza viva sullo stesso immobile, non corrente.
  for (const u of ['tOld', 'tOld2', 'tOld3', 'tOld4', 'tNew', 'tRoom', 'tTerm', 'tNext'])
    await setDoc(doc(db, 'users/' + u), { role: 'tenant', name: 'Inquilino ' + u });
  await setDoc(doc(db, 'properties/propX'), { ownerId: 'llA', currentContractId: 'cNew', name: 'Int. X' });
  await setDoc(doc(db, 'contracts/cNew'), { tenantId: 'tNew', propertyId: 'propX', status: 'active', startDate: '2026-07-01', endDate: '2099-06-30' });
  await setDoc(doc(db, 'contracts/cOld'), { tenantId: 'tOld', propertyId: 'propX', status: 'ended', endDate: '2025-06-30' });
  await setDoc(doc(db, 'contracts/cOld2'), { tenantId: 'tOld2', propertyId: 'propX', status: 'expired' });
  await setDoc(doc(db, 'contracts/cOld3'), { tenantId: 'tOld3', propertyId: 'propX', status: 'active', endDate: '2025-06-30' });
  await setDoc(doc(db, 'contracts/cOld4'), { tenantId: 'tOld4', propertyId: 'propX', status: 'active', endDate: '2099-06-30', terminatedAt: '2025-12-31' });
  await setDoc(doc(db, 'contracts/cRoom'), { tenantId: 'tRoom', propertyId: 'propX', status: 'active', unit: 'B', endDate: '2099-06-30' });
  await setDoc(doc(db, 'contracts/cNext'), { tenantId: 'tNext', propertyId: 'propX', status: 'pending', startDate: '2099-01-01' });
  // Un interno il cui contratto CORRENTE è stato chiuso e nessuno è subentrato.
  await setDoc(doc(db, 'properties/propY'), { ownerId: 'llA', currentContractId: 'cTerm', name: 'Int. Y' });
  await setDoc(doc(db, 'contracts/cTerm'), { tenantId: 'tTerm', propertyId: 'propY', status: 'terminated', terminatedAt: '2025-12-31' });
});

// Auth contexts
const admin = env.authenticatedContext('adminUid').firestore();
const llA   = env.authenticatedContext('llA').firestore();
const llB   = env.authenticatedContext('llB').firestore();
const tA    = env.authenticatedContext('tA').firestore();
const tB    = env.authenticatedContext('tB').firestore();
const anon  = env.unauthenticatedContext().firestore();
// Sessione Firebase ANONIMA (magic-link/intake): signed-in ma provider 'anonymous'.
const anonProv = env.authenticatedContext('anonSess', { firebase: { sign_in_provider: 'anonymous' } }).firestore();

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

await check('CANNOT write a sign token onto own contract (tenantSignToken is gone from the allowed fields)',
  assertFails(updateDoc(doc(tA, 'contracts/contractA'), { tenantSignToken: 'mine' })));

// ── SIGN TOKENS: the other party's signing credential is never readable ──
console.log('\nsignTokens (Magic Sign credentials, admin-only)');
await check('tenant A CANNOT read the sign tokens of OWN contract',
  assertFails(getDoc(doc(tA, 'signTokens/contractA'))));
await check('landlord A CANNOT read the sign tokens of a contract on OWN property',
  assertFails(getDoc(doc(llA, 'signTokens/contractA'))));
await check('tenant A CANNOT write sign tokens',
  assertFails(setDoc(doc(tA, 'signTokens/contractA'), { landlord: 'forged' })));
await check('admin reads sign tokens',  assertSucceeds(getDoc(doc(admin, 'signTokens/contractA'))));
await check('admin writes sign tokens', assertSucceeds(setDoc(doc(admin, 'signTokens/contractB'), { contractId: 'contractB', tenant: 'tok-b-tenant-000' })));
await check('admin CANNOT create a contract carrying a plaintext sign token',
  assertFails(setDoc(doc(admin, 'contracts/contractNew'), { tenantId: 'tA', propertyId: 'propA', landlordSignToken: 'x-00000000' })));
await check('admin creates a contract WITHOUT sign tokens',
  assertSucceeds(setDoc(doc(admin, 'contracts/contractNew'), { tenantId: 'tA', propertyId: 'propA', rent: 800 })));
await check('admin CANNOT add a plaintext sign token to a contract',
  assertFails(updateDoc(doc(admin, 'contracts/contractA'), { landlordSignToken: 'x-00000000' })));
await check('admin CANNOT change a legacy plaintext sign token',
  assertFails(updateDoc(doc(admin, 'contracts/contractLegacy'), { tenantSignToken: 'rotated-000000' })));
await check('admin still updates OTHER fields of a legacy contract (tokens untouched)',
  assertSucceeds(updateDoc(doc(admin, 'contracts/contractLegacy'), { notes: 'ok' })));
await check('admin CAN remove the legacy plaintext tokens (the migration)',
  assertSucceeds(updateDoc(doc(admin, 'contracts/contractLegacy'), { tenantSignToken: deleteField(), landlordSignToken: deleteField() })));

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
// Audit 2026-08-18 P0.4: la prenotazione pubblica entra da /api/viewings/slots
// (credenziali admin), MAI da un client — `create: if true` era un vettore XSS.
await check('anon CANNOT create a viewingRequest directly (only /api/viewings/slots does)',
  assertFails(setDoc(doc(anon, 'viewingRequests/vr1'), { name: 'Walk-in', email: 'a@b.com' })));
await check('admin CAN create a viewingRequest (the server path)',
  assertSucceeds(setDoc(doc(admin, 'viewingRequests/vr1'), { name: 'Walk-in', email: 'a@b.com' })));

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

// ── documents: l'admin archivia per conto di terzi (audit P0.3) ─────────
console.log('\ndocuments — admin archives for others (post-firma)');
await check('admin CAN create a document for a tenant (signed contract archiving)',
  assertSucceeds(setDoc(doc(admin, 'documents/docForTenant'), { userId: 'tA', name: 'Contratto firmato', category: 'contract' })));
await check('tenant still creates a document only for SELF',
  assertSucceeds(setDoc(doc(tA, 'documents/docSelf'), { userId: 'tA', name: 'My upload' })));
await check('tenant CANNOT create a document for ANOTHER user',
  assertFails(setDoc(doc(tA, 'documents/docSpoof'), { userId: 'tB', name: 'Spoof' })));

// ── Sessioni anonime: niente notifiche né audit log ─────────────────────
console.log('\nAnonymous PROVIDER session (magic-link/intake)');
await check('anon-provider CANNOT create a notification',
  assertFails(setDoc(doc(anonProv, 'notifications/spoof1'), { userId: 'tA', title: 'fake', read: false })));
await check('anon-provider CANNOT append to activityLog',
  assertFails(setDoc(doc(anonProv, 'activityLog/poison1'), { action: 'fake', actor: 'anon' })));
await check('tenant CAN still create a notification',
  assertSucceeds(setDoc(doc(tA, 'notifications/n1'), { userId: 'adminUid', title: 'hi', read: false })));
await check('tenant CAN still append to activityLog',
  assertSucceeds(setDoc(doc(tA, 'activityLog/a1'), { action: 'login', userId: 'tA' })));

// ── registrations / deals / pass studio ─────────────────────────────────
console.log('\nregistrations + deals + pass studio');
await check('unauthenticated CAN create a registration with known fields (public onboarding)',
  assertSucceeds(setDoc(doc(anon, 'registrations/r1'), { name: 'Walk-in', email: 'a@b.com', status: 'pending', source: 'onboarding' })));
// Audit 2026-08-18 P0.4: un campo ESTRANEO (vettore d'iniezione) è rifiutato alla porta.
await check('unauthenticated CANNOT inject an arbitrary field into a registration',
  assertFails(setDoc(doc(anon, 'registrations/rEvil'), { name: 'x', evilPayload: '<img src=x onerror=alert(1)>' })));
await check('unauthenticated CANNOT read registrations',
  assertFails(getDoc(doc(anon, 'registrations/r1'))));
await check('admin reads registrations',
  assertSucceeds(getDoc(doc(admin, 'registrations/r1'))));
await check('admin writes deals',
  assertSucceeds(setDoc(doc(admin, 'deals/d1'), { title: 'Deal' })));
await check('landlord CANNOT read deals',
  assertFails(getDoc(doc(llA, 'deals/d1'))));
await check('admin writes passMeta',
  assertSucceeds(setDoc(doc(admin, 'passMeta/p1'), { serial: 'x' })));
await check('tenant CANNOT read passRegistrations',
  assertFails(getDoc(doc(tA, 'passRegistrations/p1'))));
await check('admin reads clientErrors (console /salute)',
  assertSucceeds(getDoc(doc(admin, 'clientErrors/e1'))));
await check('landlord CANNOT read clientErrors',
  assertFails(getDoc(doc(llA, 'clientErrors/e1'))));
await check('nobody writes clientErrors from the browser',
  assertFails(setDoc(doc(admin, 'clientErrors/e2'), { message: 'x' })));

// ── PALAZZO (12/10/2026): le porte che l'account della proprietaria apre ──
console.log('\nsettings — le manopole interne sono dell\'admin');
const llC = env.authenticatedContext('llC').firestore();
for (const x of ['registrazione', 'ai', 'rentFeeStats', 'sddFeeStats', 'viewingAvailability', 'squadra', 'segretaria',
       'fiducia', 'publisher', 'outreach', 'cockpit', 'general', 'mediaRehost', 'marketBenchmarks']) {
  await check('landlord CANNOT read settings/' + x, assertFails(getDoc(doc(llA, 'settings/' + x))));
  await check('tenant CANNOT read settings/' + x, assertFails(getDoc(doc(tA, 'settings/' + x))));
}
await check('anonymous CANNOT read settings/ai (URL del tunnel)', assertFails(getDoc(doc(anon, 'settings/ai'))));
await check('admin reads settings/registrazione', assertSucceeds(getDoc(doc(admin, 'settings/registrazione'))));
await check('admin reads settings/rentFeeStats', assertSucceeds(getDoc(doc(admin, 'settings/rentFeeStats'))));
await check('landlord reads settings/company (il portal la carica al boot)', assertSucceeds(getDoc(doc(llA, 'settings/company'))));
await check('tenant reads settings/company', assertSucceeds(getDoc(doc(tA, 'settings/company'))));
await check('anonymous CANNOT read settings/company (IBAN)', assertFails(getDoc(doc(anon, 'settings/company'))));
await check('anon-provider session CANNOT read settings/company', assertFails(getDoc(doc(anonProv, 'settings/company'))));
await check('anonymous STILL reads settings/video (sito pubblico)', assertSucceeds(getDoc(doc(anon, 'settings/video'))));
await check('anon-provider session reads settings/video', assertSucceeds(getDoc(doc(anonProv, 'settings/video'))));
await check('landlord CANNOT write settings/company', assertFails(setDoc(doc(llA, 'settings/company'), { iban: 'x' })));
// I parametri dell'accordo non sono un segreto: la console proposte (aperta
// anche a un proprietario) deve dare lo stesso verdetto di fascia dell'admin.
await check('landlord reads settings/canoneAccordo', assertSucceeds(getDoc(doc(llA, 'settings/canoneAccordo'))));
await check('anonymous CANNOT read settings/canoneAccordo', assertFails(getDoc(doc(anon, 'settings/canoneAccordo'))));
await check('landlord CANNOT write settings/canoneAccordo', assertFails(setDoc(doc(llA, 'settings/canoneAccordo'), { pArr: 0.5 })));

console.log('\nmaintenance — un guasto solo sul proprio interno, mai anonimo');
await check('anon-provider session CANNOT open a fake leak on propA',
  assertFails(setDoc(doc(anonProv, 'maintenance/fake1'), { userId: 'anonSess', propertyId: 'propA', title: 'FUGA DI GAS — evacuare' })));
await check('unauthenticated CANNOT open a ticket',
  assertFails(setDoc(doc(anon, 'maintenance/fake2'), { userId: 'x', propertyId: 'propA', title: 'x' })));
await check('tenant B (other building) CANNOT open a ticket on propA',
  assertFails(setDoc(doc(tB, 'maintenance/fake3'), { userId: 'tB', propertyId: 'propA', title: 'Allagamento' })));
await check('tenant B CANNOT borrow tenant A\'s contract to open on propA',
  assertFails(setDoc(doc(tB, 'maintenance/fake4'), { userId: 'tB', propertyId: 'propA', contractId: 'contractA', title: 'x' })));
await check('tenant A opens a ticket with OWN contractId (come /casa)',
  assertSucceeds(setDoc(doc(tA, 'maintenance/casaA'), { userId: 'tA', tenantId: 'tA', propertyId: 'propA', contractId: 'contractA', title: 'Caldaia', status: 'pending' })));
await check('tenant A CANNOT point own contract at another property',
  assertFails(setDoc(doc(tA, 'maintenance/casaA2'), { userId: 'tA', propertyId: 'propB', contractId: 'contractA', title: 'x' })));
await check('tenant A CANNOT forge the reporter/source written by the server',
  assertFails(setDoc(doc(tA, 'maintenance/casaA3'), { userId: 'tA', propertyId: 'propA', contractId: 'contractA', title: 'x',
    reporter: { role: 'owner', name: 'La proprietaria', via: 'palazzo' }, source: 'palazzo' })));
await check('tenant A CANNOT open a ticket without a propertyId',
  assertFails(setDoc(doc(tA, 'maintenance/casaA4'), { userId: 'tA', title: 'x' })));
// Il portal (vista inquilino) non manda contractId: vale il contratto
// CORRENTE dell'immobile. Un immobile senza currentContractId, o un
// contractId null, sono un "no" (mai un errore che passi per sbaglio).
await check('tenant A opens a ticket WITHOUT contractId on the property whose current contract is hers',
  assertSucceeds(setDoc(doc(tA, 'maintenance/casaA5'), { userId: 'tA', propertyId: 'propA', title: 'Caldaia' })));
await check('tenant B CANNOT open without contractId on a property whose current contract is not his',
  assertFails(setDoc(doc(tB, 'maintenance/casaB5'), { userId: 'tB', propertyId: 'propA', title: 'x' })));
await check('tenant A CANNOT open without contractId on a property with no current contract',
  assertFails(setDoc(doc(tA, 'maintenance/casaA6'), { userId: 'tA', propertyId: 'propNoCur', title: 'x' })));
await check('contractId null counts as «not given»: tenant B still CANNOT open on propA',
  assertFails(setDoc(doc(tB, 'maintenance/casaB7'), { userId: 'tB', propertyId: 'propA', contractId: null, title: 'x' })));
await check('tenant A CANNOT open with a contractId that does not exist',
  assertFails(setDoc(doc(tA, 'maintenance/casaA8'), { userId: 'tA', propertyId: 'propA', contractId: 'nope', title: 'x' })));
// Il cambio di inquilino: chi è uscito non apre più guasti sull'interno,
// nemmeno col SUO vecchio contractId (la revoca che /guasto fa coi link).
{
  const tOld = env.authenticatedContext('tOld').firestore(), tOld2 = env.authenticatedContext('tOld2').firestore();
  const tOld3 = env.authenticatedContext('tOld3').firestore(), tOld4 = env.authenticatedContext('tOld4').firestore();
  const tNew = env.authenticatedContext('tNew').firestore(), tRoom = env.authenticatedContext('tRoom').firestore();
  const tTerm = env.authenticatedContext('tTerm').firestore(), tNext = env.authenticatedContext('tNext').firestore();
  await check('EX tenant (contract ended) CANNOT open a ticket on the unit he left, with his old contractId',
    assertFails(setDoc(doc(tOld, 'maintenance/exOld'), { userId: 'tOld', propertyId: 'propX', contractId: 'cOld', title: 'FUGA DI GAS', priority: 'urgent' })));
  await check('EX tenant (contract expired) CANNOT either',
    assertFails(setDoc(doc(tOld2, 'maintenance/exOld2'), { userId: 'tOld2', propertyId: 'propX', contractId: 'cOld2', title: 'x' })));
  await check('EX tenant whose contract is still «active» by mistake but whose END DATE is past CANNOT either',
    assertFails(setDoc(doc(tOld3, 'maintenance/exOld3'), { userId: 'tOld3', propertyId: 'propX', contractId: 'cOld3', title: 'x' })));
  await check('EX tenant closed early (terminatedAt past) CANNOT either',
    assertFails(setDoc(doc(tOld4, 'maintenance/exOld4'), { userId: 'tOld4', propertyId: 'propX', contractId: 'cOld4', title: 'x' })));
  await check('the NEW tenant (current contract) opens a ticket, with or without contractId',
    assertSucceeds(Promise.all([
      setDoc(doc(tNew, 'maintenance/newX1'), { userId: 'tNew', propertyId: 'propX', contractId: 'cNew', title: 'Caldaia' }),
      setDoc(doc(tNew, 'maintenance/newX2'), { userId: 'tNew', propertyId: 'propX', title: 'Caldaia' })])));
  await check('a SECOND ROOM (active, not the current contract) still opens a ticket',
    assertSucceeds(setDoc(doc(tRoom, 'maintenance/roomX'), { userId: 'tRoom', propertyId: 'propX', contractId: 'cRoom', title: 'Serratura' })));
  await check('an INCOMING tenant (pending, not current) does not open tickets yet',
    assertFails(setDoc(doc(tNext, 'maintenance/nextX'), { userId: 'tNext', propertyId: 'propX', contractId: 'cNext', title: 'x' })));
  await check('the CURRENT contract closed with nobody after: its tenant CANNOT open, with or without contractId',
    assertFails(setDoc(doc(tTerm, 'maintenance/termY1'), { userId: 'tTerm', propertyId: 'propY', contractId: 'cTerm', title: 'x' })));
  await check('…without contractId either',
    assertFails(setDoc(doc(tTerm, 'maintenance/termY2'), { userId: 'tTerm', propertyId: 'propY', title: 'x' })));
}
await check('landlord A opens a ticket on OWN property',
  assertSucceeds(setDoc(doc(llA, 'maintenance/llA1'), { userId: 'llA', propertyId: 'propA', title: 'Umidità' })));
await check('landlord A CANNOT open a ticket on landlord B property',
  assertFails(setDoc(doc(llA, 'maintenance/llA2'), { userId: 'llA', propertyId: 'propB', title: 'x' })));
await check('admin opens a ticket for a tenant (the server path)',
  assertSucceeds(setDoc(doc(admin, 'maintenance/adm1'), { userId: null, propertyId: 'propA', title: 'x', reporter: { role: 'tenant', via: 'link' }, source: 'guasto-link' })));

console.log('\nInbox — la proprietaria non legge note interne né analisi AI');
await check('landlord A CANNOT read the conversation assigned to her (aiSummary)', assertFails(getDoc(doc(llA, 'conversations/conv1'))));
await check('landlord A CANNOT read a message of that conversation', assertFails(getDoc(doc(llA, 'messages/msgIn'))));
await check('landlord A CANNOT read the internal note', assertFails(getDoc(doc(llA, 'messages/msgNote'))));
await check('landlord A CANNOT list conversations by assignedLandlordId',
  assertFails(getDocs(query(collection(llA, 'conversations'), where('assignedLandlordId', '==', 'llA')))));
await check('the contact (tenant A) reads own conversation', assertSucceeds(getDoc(doc(tA, 'conversations/conv1'))));
await check('the contact reads own inbound message', assertSucceeds(getDoc(doc(tA, 'messages/msgIn'))));
await check('the contact CANNOT read an internal note about them', assertFails(getDoc(doc(tA, 'messages/msgNote'))));
await check('a client CANNOT fabricate an internal note',
  assertFails(setDoc(doc(tA, 'messages/forgedNote'), { conversationId: 'conv1', by: 'tA', direction: 'note', body: 'x' })));
await check('a client still writes an ordinary message',
  assertSucceeds(setDoc(doc(tA, 'messages/okOut'), { conversationId: 'conv1', by: 'tA', direction: 'out', body: 'x' })));
await check('admin reads the note', assertSucceeds(getDoc(doc(admin, 'messages/msgNote'))));

console.log('\nIl loader della proprietaria: un blocco da 9 interni passa, uno estraneo no');
const nine = Array.from({ length: 9 }, (_, i) => 'plzC_' + (i + 1));
for (const coll of ['contracts', 'payments', 'maintenance']) {
  await check('landlord C reads ' + coll + ' where propertyId in [9 suoi]',
    assertSucceeds(getDocs(query(collection(llC, coll), where('propertyId', 'in', nine)))));
  await check('landlord C CANNOT read ' + coll + ' if the block holds a property not hers',
    assertFails(getDocs(query(collection(llC, coll), where('propertyId', 'in', [...nine.slice(0, 8), 'propA'])))));
}
await check('landlord C reads the SHARED documents of her 9 units',
  assertSucceeds(getDocs(query(collection(llC, 'documents'), where('shared', '==', true), where('propertyId', 'in', nine)))));
await check('landlord C CANNOT read unshared documents of her units',
  assertFails(getDocs(query(collection(llC, 'documents'), where('propertyId', 'in', nine)))));

console.log('\npaymentCosts — costo Stripe e margine BOOM fuori dalla rata');
await check('landlord CANNOT read paymentCosts', assertFails(getDoc(doc(llA, 'paymentCosts/payA'))));
await check('admin writes paymentCosts', assertSucceeds(setDoc(doc(admin, 'paymentCosts/payA'), { stripeCostEur: 1.2, marginEur: 0 })));

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
