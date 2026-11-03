// tests/pa-external/run.mjs — dalla console pre-agreement: il contratto
// firmato FUORI da Magic Sign rientra nel giro, e la provvigione si incassa
// con un link (2/11/2026).
//
// Handler VERI (api/preagreement/sign-for.js, api/stripe-webhook.js) su un
// Firestore in memoria; jsPDF e pdf-lib veri, SMTP e Stripe finti. Il giro:
// proposta pagata senza immobile → link provvigione (fattura prov_<id>) →
// contratto che nasce dalla proposta → profili mancanti creati/collegati →
// firmato caricato → recupero (immobile affittato, scadenze, pacchetto) →
// benvenuto + canoni UNA volta → la provvigione pagata timbra la proposta.
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
import assert from 'node:assert/strict';

// dinamico: un import statico partirebbe PRIMA di register() (stripe vero)
const { DB, storage, unexpected, authUsers, setWho, SIGNED_PDF, res, webhook, journeyEligible, call, seed } = await import('./fixture.mjs');

const contractOf = (id) => DB.get('contracts/' + id);
let n = 0;
async function test(name, fn) { try { await fn(); n++; console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name); throw e; } }

// ═══ 1. LA PROVVIGIONE — un link per proposta, una fattura sola ═══
await test('provvigione: la fattura prov_<id> nasce con la cifra firmata sulla proposta, IVA dichiarata a parte', async () => {
  seed();
  let r = await call({ op: 'ext-status' });
  assert.equal(r.code, 200); assert.equal(r.body.hasContract, false);
  assert.equal(r.body.fee.totalEur, 1464); assert.equal(r.body.fee.due, 'move-in'); assert.equal(r.body.fee.blocked, null);
  r = await call({ op: 'fee-link' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const inv = DB.get('invoices/prov_pa1');
  assert.equal(inv.amount, 1464); assert.equal(inv.netAmount, 1200); assert.equal(inv.vatAmount, 264); assert.equal(inv.vatPct, 22);
  assert.equal(inv.status, 'pending'); assert.equal(inv.preAgreementId, 'pa1'); assert.equal(inv.number, 'BOOM-PROV-TEST1');
  assert.equal(inv.recipientEmail, 'anna@example.test'); assert.equal(inv.dueDate, '2026-12-01');
  assert.match(r.body.url, /\/api\/payments\/link\?k=inv&id=prov_pa1&t=/);
  assert.match(r.body.message, /€1,464/); assert.match(r.body.message, /due at move-in/); assert.ok(r.body.message.includes(r.body.url));
  const pa = DB.get('preAgreements/pa1');
  assert.equal(pa.feeInvoiceId, 'prov_pa1'); assert.equal(pa.feeInvoiceStatus, 'pending'); assert.equal(pa.feeLinkUrl, r.body.url);
});

await test('provvigione: ripremere non rifà la fattura né cambia il link; una fattura emessa non si riscrive', async () => {
  const first = (await call({ op: 'fee-link' })).body;
  DB.get('preAgreements/pa1').money.feeTotal = 9999;   // la proposta non dovrebbe cambiare: se succede, si dice
  const again = await call({ op: 'fee-link' });
  assert.equal(again.body.created, false); assert.equal(again.body.url, first.url);
  assert.equal(DB.get('invoices/prov_pa1').amount, 1464); assert.equal(again.body.amount, 1464); assert.equal(again.body.amountChanged, true);
  assert.equal([...DB.keys()].filter(k => k.startsWith('invoices/')).length, 1);
  DB.get('preAgreements/pa1').money.feeTotal = 1464;
});

await test('provvigione pagata col link: il webhook timbra fattura E proposta; poi niente più link', async () => {
  const ev = { type: 'checkout.session.completed', data: { object: { id: 'cs_test_fee', amount_total: 146400, currency: 'eur', customer_email: 'anna@example.test', payment_intent: 'pi_1',
    metadata: { service: 'INVOICE', invoiceId: 'prov_pa1', number: 'BOOM-PROV-TEST1', amount: '1464', via: 'link' } } } };
  const r = res();
  await webhook({ method: 'POST', headers: { 'stripe-signature': 'sig' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(ev)); } }, r);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(DB.get('invoices/prov_pa1').status, 'paid');
  const pa = DB.get('preAgreements/pa1');
  assert.equal(pa.feeInvoiceStatus, 'paid'); assert.ok(pa.feePaidAt); assert.equal(pa.feePaidVia, 'stripe'); assert.equal(pa.feeLinkUrl, null);
  const after = await call({ op: 'fee-link' });
  assert.equal(after.body.status, 'paid'); assert.equal(after.body.url, null); assert.equal(after.body.message, null);
});

await test('provvigione dentro il dovuto alla firma: nessun secondo link (si pagherebbe due volte)', async () => {
  seed({ money: { rent: 1000, fee: 1200, feeVatPct: 22, feeTotal: 1464, feeDue: 'signing', dueAtSigning: 2464 } });
  let r = await call({ op: 'fee-link' });
  assert.equal(r.code, 409); assert.equal(r.body.error, 'fee_paid_at_signing');
  DB.get('preAgreements/pa1').status = 'accepted'; delete DB.get('preAgreements/pa1').paidAt;
  r = await call({ op: 'fee-link' });
  assert.equal(r.code, 409); assert.equal(r.body.error, 'fee_in_due_at_signing');
  assert.equal([...DB.keys()].some(k => k.startsWith('invoices/')), false);
  seed({ money: { rent: 1000, fee: 0, feeTotal: 0 } });
  r = await call({ op: 'fee-link' }); assert.equal(r.code, 400); assert.equal(r.body.error, 'no_fee');
});

await test('solo admin; proposta non accettata → niente', async () => {
  seed(); DB.set('users/owner1', { role: 'landlord' }); setWho('owner1');
  let r = await call({ op: 'fee-link' }); assert.equal(r.code, 403);
  r = await call({ op: 'ext-contract', createProperty: true }); assert.equal(r.code, 403);
  setWho('admin'); DB.get('preAgreements/pa1').status = 'sent';
  r = await call({ op: 'fee-link' }); assert.equal(r.code, 409); assert.equal(r.body.error, 'not_accepted_yet');
  assert.equal([...DB.keys()].some(k => k.startsWith('invoices/') || k.startsWith('contracts/')), false);
});

// ═══ 2. IL FIRMATO ESTERNO — dalla proposta al giro completo ═══
let cid;
await test('il contratto nasce dalla proposta (immobile compreso), i profili mancanti si dicono prima', async () => {
  seed();
  await call({ op: 'fee-link' });   // la provvigione chiesta PRIMA che il contratto esista
  assert.equal(DB.get('invoices/prov_pa1').recipientId, '');
  let r = await call({ op: 'ext-adopt' });
  assert.equal(r.code, 409); assert.equal(r.body.error, 'contract_required');
  r = await call({ op: 'ext-contract', createProperty: true });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  cid = r.body.contractId; assert.equal(cid, 'pa_pa1'); assert.equal(r.body.created, true);
  const c = contractOf(cid);
  assert.equal(c.status, 'active'); assert.ok(c.tenantId); assert.equal(c.propertyId, 'prop_pa_pa1');
  assert.ok(!DB.get('properties/prop_pa_pa1').ownerId, 'l\'immobile nato dalla proposta non ha proprietario: è il blocco di prima');
  const plan = Object.fromEntries(r.body.profiles.map(x => [x.party, x]));
  assert.equal(plan.landlord.action, 'create'); assert.equal(plan.landlord.email, 'maria@example.test');
  // la conversione ha già creato la scheda del co-conduttore (senza collegarla): si COLLEGA quella
  assert.equal(plan.co0.action, 'link'); assert.equal(plan.co0.by, 'email'); assert.equal(plan.co0.name, 'Luca Bianchi');
  assert.equal(r.body.review.canAdopt, true); assert.equal(r.body.review.terms.rent, 1000);
  // la fattura nata prima del contratto si collega all'inquilino, importo intatto
  await call({ op: 'fee-link' });
  const inv = DB.get('invoices/prov_pa1');
  assert.equal(inv.recipientId, c.tenantId); assert.equal(inv.contractId, cid); assert.equal(inv.amount, 1464);
});

await test('senza profili il firmato NON entra (la regola del recupero resta), e nulla va su Storage', async () => {
  const st = (await call({ op: 'ext-status' })).body;
  const r = await call({ op: 'ext-adopt', version: st.review.version, termsHash: st.review.termsHash, pdfBase64: SIGNED_PDF.toString('base64'), signedDate: '2026-10-25', confirmComplete: true, confirmTerms: true, fileName: 'firmato.pdf' });
  assert.equal(r.code, 422); assert.equal(r.body.error, 'party_profiles_required');
  assert.equal([...storage.keys()].some(k => k.includes('external-signed')), false);
});

await test('profili: si creano dai dati della proposta (con accesso), collegati con le regole di linkExternalParty', async () => {
  let r = await call({ op: 'ext-profiles' });
  assert.equal(r.code, 400);
  r = await call({ op: 'ext-profiles', confirm: true });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.ok, true, JSON.stringify(r.body.results));
  const c = contractOf(cid), p = DB.get('properties/prop_pa_pa1');
  const ll = DB.get('users/' + p.ownerId);
  assert.equal(ll.role, 'landlord'); assert.equal(ll.email, 'maria@example.test'); assert.equal(c.landlordId, p.ownerId);
  assert.ok(authUsers.has(p.ownerId), 'il proprietario ha un accesso vero: entra con «Password dimenticata»');
  const co = DB.get('users/' + c.coTenants[0].userId);
  assert.equal(co.role, 'tenant'); assert.equal(co.name, 'Luca Bianchi'); assert.equal(co.createdBy, 'preagreement_convert');
  assert.equal([...DB.values()].filter(u => u.name === 'Luca Bianchi' && u.role === 'tenant').length, 1, 'una persona, una scheda');
  assert.deepEqual(r.body.state.profiles, []);
  const again = await call({ op: 'ext-profiles', confirm: true });
  assert.equal(again.body.results.length, 0, 'ripremere non crea doppioni');
});

await test('firmato caricato: stessi byte, firma «esterna», niente certificato inventato', async () => {
  const st = (await call({ op: 'ext-status' })).body;
  let r = await call({ op: 'ext-adopt', version: st.review.version, termsHash: st.review.termsHash, pdfBase64: SIGNED_PDF.toString('base64'), signedDate: '2026-10-25', confirmComplete: false, confirmTerms: true });
  assert.equal(r.code, 422); assert.equal(r.body.error, 'review_required');
  // Il PDF si LEGGE contro i dati (lo stesso lettore della versione
  // corretta): il canone firmato è un altro → 409 con la voce, nulla scritto.
  const base = { op: 'ext-adopt', version: st.review.version, termsHash: st.review.termsHash, pdfBase64: SIGNED_PDF.toString('base64'), signedDate: '2026-10-25', confirmComplete: true, confirmTerms: true, fileName: 'firmato.pdf' };
  process.env.ANTHROPIC_API_KEY = 'synthetic';
  const read = { rent: { amount: 1000, basis: 'mensile' }, deposit: 2000, startDate: '2026-12-01', endDate: '2027-11-30', tenantName: 'Anna Rossi', landlordName: 'Maria Verdi', floor: null, unit: null };
  globalThis.__aiReply = { ...read, rent: { amount: 1250, basis: 'mensile' } };
  r = await call(base);
  assert.equal(r.code, 409, JSON.stringify(r.body)); assert.equal(r.body.error, 'pdf_terms_mismatch');
  assert.deepEqual(r.body.check.diff.map(x => x.key), ['rent']); assert.equal(r.body.check.diff[0].contract, 1000);
  assert.equal(globalThis.__aiCalls, 1, 'il PDF è andato al lettore');
  assert.notEqual(contractOf(cid).signatureStatus, 'complete');
  assert.equal([...storage.keys()].some(k => k.includes('external-signed')), false, 'una differenza non scrive niente, nemmeno su Storage');
  // il PDF che coincide entra, e il controllo resta scritto sul contratto
  globalThis.__aiReply = read;
  r = await call(base);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.check.status, 'match');
  delete process.env.ANTHROPIC_API_KEY;
  const c = contractOf(cid);
  assert.equal(c.pdfCheck.status, 'match'); assert.equal(c.pdfCheck.accepted, false); assert.equal(c.pdfCheck.via, 'external');
  assert.equal(c.signatureStatus, 'complete'); assert.equal(c.signingCertificateUrl, null);
  assert.deepEqual(storage.get('contracts/' + cid + '/external-signed/' + c.externalSignedDocument.sha256 + '.pdf'), SIGNED_PDF);
  assert.equal(journeyEligible(c), true, 'il journey (T-30 … uscita) riparte da solo: contratto attivo e firmato');
  assert.equal(globalThis.deliveryMails.length, 0);
});

await test('recupero: immobile affittato, scadenze di Magic Sign, pacchetto — senza email né rate', async () => {
  const r = await call({ op: 'ext-prepare' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const steps = r.body.preparation.steps;
  assert.equal(r.body.preparation.status, 'ready', JSON.stringify(steps));
  assert.equal(steps.occupancy.ok, true); assert.equal(steps.occupancy.property, 'rented');
  assert.equal(steps.obligations.ok, true);
  assert.equal(DB.get('properties/prop_pa_pa1').status, 'rented'); assert.equal(DB.get('properties/prop_pa_pa1').currentContractId, cid);
  const dl = [...DB.keys()].filter(k => k.startsWith('deadlines/')).map(k => DB.get(k).title);
  assert.ok(dl.some(t => t.startsWith('Registrare RLI')));
  assert.ok(dl.includes('Consegna chiavi + verbale di consegna e lettura contatori'));
  assert.ok(dl.some(t => t.startsWith('Cedolare: raccomandata')));
  assert.ok(dl.some(t => t.startsWith('Verifica APE allegato + deposito cauzionale incassato')));
  assert.equal(DB.get('preAgreements/pa1').contractSignatureSource, 'external');
  assert.equal(globalThis.deliveryMails.length, 0);
  assert.equal([...DB.keys()].some(k => k.startsWith('payments/pay_')), false);
  const count = [...DB.keys()].filter(k => k.startsWith('deadlines/')).length;
  await call({ op: 'ext-prepare' });
  assert.equal([...DB.keys()].filter(k => k.startsWith('deadlines/')).length, count, 'un secondo recupero non raddoppia lo scadenzario');
});

await test('benvenuto + canoni: solo se chiesti, una volta; la copia firmata in allegato, nessun certificato promesso', async () => {
  let r = await call({ op: 'ext-onboard' });
  assert.equal(r.code, 200); assert.equal(r.body.welcome, undefined); assert.equal(r.body.schedule, undefined);
  assert.equal(globalThis.deliveryMails.length, 0); assert.equal([...DB.keys()].some(k => k.startsWith('payments/pay_')), false);
  r = await call({ op: 'ext-onboard', welcome: true, schedule: true });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.schedule.ok, true); assert.equal(r.body.schedule.created, 12);
  const pays = [...DB.keys()].filter(k => k.startsWith('payments/pay_' + cid + '_'));
  assert.equal(pays.length, 12); assert.ok(DB.has('payments/pay_' + cid + '_2026-12'));
  assert.equal(r.body.welcome.ok, true); assert.equal(r.body.welcome.tenant, true); assert.equal(r.body.welcome.landlord, true);
  const mails = globalThis.deliveryMails;
  const tm = mails.find(m => String(m.to).includes('anna@example.test')), lm = mails.find(m => String(m.to).includes('maria@example.test'));
  assert.ok(tm && lm, 'inquilino e proprietario');
  assert.ok((tm.attachments || []).some(a => /Signed_Contract/.test(a.filename)));
  assert.doesNotMatch(tm.html, /signing certificate/i); assert.doesNotMatch(lm.html, /certificato di firma/i);
  const c = contractOf(cid);
  assert.equal(c.welcomeEmailSent, true); assert.equal(c.welcomeEmailBy, 'external'); assert.equal(c.paymentsGenerated, true);
  assert.ok([...DB.keys()].some(k => k.startsWith('magicLinks/')));
  const sent = mails.length;
  r = await call({ op: 'ext-onboard', welcome: true, schedule: true });
  assert.equal(r.body.welcome.skipped, 'already_sent'); assert.equal(r.body.schedule.created, 0);
  assert.equal(globalThis.deliveryMails.length, sent, 'un secondo tap non rimanda il benvenuto');
  assert.equal([...DB.keys()].filter(k => k.startsWith('payments/pay_' + cid + '_')).length, 12);
});

await test('benvenuto partito al solo proprietario: un secondo tap non glielo rimanda', async () => {
  const c = DB.get('contracts/' + cid);
  delete c.welcomeEmailSent; c.externalWelcome = { status: 'sent', at: '2026-11-02T10:00:00Z', tenant: false, landlord: true };
  const before = globalThis.deliveryMails.length;
  const r = await call({ op: 'ext-onboard', welcome: true });
  assert.equal(r.body.welcome.skipped, 'already_sent'); assert.equal(r.body.welcome.landlord, true);
  assert.equal(globalThis.deliveryMails.length, before);
  c.welcomeEmailSent = true;
});

await test('termini cambiati dopo il caricamento: niente benvenuto né canoni sul firmato sbagliato', async () => {
  DB.get('contracts/' + cid).rent = 1100;
  const r = await call({ op: 'ext-onboard', welcome: true, schedule: true });
  assert.equal(r.code, 409); assert.equal(r.body.error, 'signed_terms_changed');
});

await test('profili: un\'email del portal con un altro ruolo è un conflitto detto, mai un collegamento', async () => {
  seed({ landlord: { name: 'Maria Verdi', email: 'other@example.test' } });
  const r = await call({ op: 'ext-contract', createProperty: true });
  const plan = r.body.profiles.find(x => x.party === 'landlord');
  assert.equal(plan.action, 'conflict'); assert.match(plan.why, /tenant/);
  const out = await call({ op: 'ext-profiles', confirm: true });
  const res1 = out.body.results.find(x => x.party === 'landlord');
  assert.equal(res1.ok, false); assert.equal(res1.error, 'profile_conflict');
  assert.ok(!DB.get('properties/prop_pa_pa1').ownerId);
  assert.ok(out.body.results.find(x => x.party === 'co0').ok, 'gli altri profili vanno avanti');
});

await test('proprietario senza email: scheda senza accesso, dichiarata nel piano', async () => {
  seed({ landlord: { name: 'Maria Verdi', phone: '+39 347 0001111' }, tenants: [{ fullName: 'Anna Rossi', email: 'anna@example.test' }] });
  const r = await call({ op: 'ext-contract', createProperty: true });
  assert.equal(r.body.profiles.length, 1); assert.equal(r.body.profiles[0].action, 'create_nologin');
  const out = await call({ op: 'ext-profiles', confirm: true });
  assert.equal(out.body.ok, true, JSON.stringify(out.body));
  const owner = DB.get('properties/prop_pa_pa1').ownerId;
  assert.ok(owner && !authUsers.has(owner)); assert.equal(DB.get('users/' + owner).role, 'landlord');
});

await test('co-conduttore senza email né CF: si collega la scheda che la conversione ha creato per QUESTA proposta', async () => {
  seed({ tenants: [{ fullName: 'Anna Rossi', email: 'anna@example.test' }, { fullName: 'Luca Bianchi' }] });
  DB.set('users/omonimo', { role: 'tenant', name: 'Luca Bianchi', notes: 'Co-conduttore — PA BOOM-ALTRA', createdBy: 'preagreement_convert' });
  const r = await call({ op: 'ext-contract', createProperty: true });
  const plan = r.body.profiles.find(x => x.party === 'co0');
  assert.equal(plan.action, 'link'); assert.equal(plan.by, 'conversione'); assert.notEqual(plan.userId, 'omonimo');
  const out = await call({ op: 'ext-profiles', confirm: true });
  assert.equal(out.body.ok, true, JSON.stringify(out.body));
  assert.equal([...DB.keys()].filter(k => k.startsWith('users/') && DB.get(k).name === 'Luca Bianchi').length, 2, 'la sua scheda + l\'omonimo di un\'altra proposta: nessuna terza');
  assert.notEqual(contractOf('pa_pa1').coTenants[0].userId, 'omonimo');
});

await test('PDF diverso dai dati e «carica comunque»: entra, e la scelta resta scritta col suo autore', async () => {
  seed();
  await call({ op: 'ext-contract', createProperty: true });
  await call({ op: 'ext-profiles', confirm: true });
  const st = (await call({ op: 'ext-status' })).body;
  process.env.ANTHROPIC_API_KEY = 'synthetic';
  globalThis.__aiReply = { rent: { amount: 1000, basis: 'mensile' }, deposit: 3000, startDate: '2026-12-01', endDate: '2027-11-30', tenantName: 'Anna Rossi', landlordName: 'Maria Verdi' };
  const base = { op: 'ext-adopt', version: st.review.version, termsHash: st.review.termsHash, pdfBase64: SIGNED_PDF.toString('base64'), signedDate: '2026-10-25', confirmComplete: true, confirmTerms: true, fileName: 'firmato.pdf' };
  let r = await call(base);
  assert.equal(r.code, 409); assert.deepEqual(r.body.check.diff.map(x => x.key), ['deposit']);
  r = await call({ ...base, acceptMismatch: true });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const c = contractOf('pa_pa1');
  assert.equal(c.signatureStatus, 'complete');
  assert.equal(c.pdfCheck.status, 'mismatch'); assert.equal(c.pdfCheck.accepted, true); assert.equal(c.pdfCheck.by, 'admin');
  assert.deepEqual(c.pdfCheck.diff.map(x => x.key), ['deposit']);
  delete process.env.ANTHROPIC_API_KEY;
});

await test('lettore giù: il firmato entra lo stesso e il controllo si dichiara non eseguito', async () => {
  seed();
  await call({ op: 'ext-contract', createProperty: true });
  await call({ op: 'ext-profiles', confirm: true });
  const st = (await call({ op: 'ext-status' })).body;
  const r = await call({ op: 'ext-adopt', version: st.review.version, termsHash: st.review.termsHash, pdfBase64: SIGNED_PDF.toString('base64'), signedDate: '2026-10-25', confirmComplete: true, confirmTerms: true, fileName: 'firmato.pdf' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.check.status, 'unchecked'); assert.equal(r.body.check.reason, 'cloud_unconfigured');
  assert.equal(contractOf('pa_pa1').pdfCheck.status, 'unchecked');
  assert.equal(globalThis.__aiCalls, 0);
});

// ═══ 3. IL BENVENUTO CON ESITO INCERTO — non riparte da solo ═══
async function adoptedFresh() {
  seed();
  await call({ op: 'ext-contract', createProperty: true });
  await call({ op: 'ext-profiles', confirm: true });
  const st = (await call({ op: 'ext-status' })).body;
  const r = await call({ op: 'ext-adopt', version: st.review.version, termsHash: st.review.termsHash, pdfBase64: SIGNED_PDF.toString('base64'), signedDate: '2026-10-25', confirmComplete: true, confirmTerms: true, fileName: 'firmato.pdf' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  await call({ op: 'ext-prepare' });
}
await test('benvenuto interrotto a metà (timeout): incerto, un secondo tap NON lo rimanda; «È arrivato» lo timbra senza email', async () => {
  await adoptedFresh();
  globalThis.deliverySmtp = async () => { const e = new Error('Timeout'); e.code = 'ETIMEDOUT'; throw e; };
  let r = await call({ op: 'ext-onboard', welcome: true });
  assert.equal(r.body.welcome.ok, false); assert.equal(r.body.welcome.error, 'welcome_uncertain');
  let c = contractOf('pa_pa1');
  assert.equal(c.externalWelcome.status, 'uncertain'); assert.ok(!c.welcomeEmailSent);
  assert.equal(c.externalWelcome.outcome.tenant, 'uncertain');
  globalThis.deliverySmtp = null;
  const tries = globalThis.deliveryMailAttempts.length;
  r = await call({ op: 'ext-onboard', welcome: true });
  assert.equal(r.body.welcome.error, 'welcome_uncertain');
  assert.equal(globalThis.deliveryMailAttempts.length, tries, 'nessun nuovo invio su un esito incerto');
  r = await call({ op: 'ext-onboard', welcome: true, welcomeResolve: 'sent' });
  assert.equal(r.body.welcome.ok, true); assert.equal(r.body.welcome.resolved, 'sent');
  assert.equal(globalThis.deliveryMailAttempts.length, tries, '«È arrivato» non manda niente');
  c = contractOf('pa_pa1');
  assert.equal(c.welcomeEmailSent, true); assert.equal(c.welcomeEmailBy, 'external-confirmed'); assert.equal(c.externalWelcome.resolvedBy, 'admin');
  r = await call({ op: 'ext-onboard', welcome: true, welcomeResolve: 'resend' });
  assert.equal(r.body.welcome.skipped, 'already_sent'); assert.equal(globalThis.deliveryMailAttempts.length, tries);
});

await test('«sending» appeso da oltre 90 s: è incerto, e solo «rimandalo» lo rimanda', async () => {
  await adoptedFresh();
  DB.get('contracts/pa_pa1').externalWelcome = { status: 'sending', at: new Date(Date.now() - 120000).toISOString(), claim: 'old' };
  let r = await call({ op: 'ext-onboard', welcome: true });
  assert.equal(r.body.welcome.error, 'welcome_uncertain'); assert.equal(globalThis.deliveryMailAttempts.length, 0);
  r = await call({ op: 'ext-onboard', welcome: true, welcomeResolve: 'resend' });
  assert.equal(r.body.welcome.ok, true, JSON.stringify(r.body.welcome)); assert.equal(r.body.welcome.resent, true);
  assert.ok(globalThis.deliveryMails.some(m => String(m.to).includes('anna@example.test')));
  assert.equal(contractOf('pa_pa1').welcomeEmailSent, true);
});

await test('SMTP che rifiuta (550): non è partito niente, ripremere lo rimanda — sicuro', async () => {
  await adoptedFresh();
  globalThis.deliverySmtp = async () => { const e = new Error('Mailbox unavailable'); e.responseCode = 550; throw e; };
  let r = await call({ op: 'ext-onboard', welcome: true });
  assert.equal(r.body.welcome.error, 'welcome_failed'); assert.equal(contractOf('pa_pa1').externalWelcome.status, 'failed');
  globalThis.deliverySmtp = null;
  r = await call({ op: 'ext-onboard', welcome: true });
  assert.equal(r.body.welcome.ok, true); assert.equal(contractOf('pa_pa1').welcomeEmailSent, true);
});

// ═══ 4. LA PROVVIGIONE SI RICORDA — il Gestore, col handler vero ═══
// Dovuta all'ingresso e non pagata: un sollecito APPROVABILE (mai partito da
// solo) col link stabile, una volta a settimana; pagata o segnalata: silenzio.
// Ingresso vicino senza link preparato: una riga nel digest, mai una fattura
// emessa dal Gestore.
const { default: gestore } = await import('../../api/employees/gestore.js');
const runGestore = async (dry) => { const r = res(); await gestore({ method: 'POST', query: dry ? { dry: '1' } : {}, headers: { authorization: 'Bearer synthetic' } }, r); return r; };
const dayIso = (k) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const queue = () => [...DB.entries()].filter(([k]) => k.startsWith('action_queue/')).map(([, v]) => v);

await test('Gestore: provvigione scaduta → sollecito approvabile col link, una volta a settimana', async () => {
  seed({ lease: { startDate: dayIso(-6), months: 12, endDate: dayIso(358), type: 'transitorio', reason: 'lavoro' } });
  assert.equal((await call({ op: 'fee-link' })).code, 200);
  let r = await runGestore(); assert.equal(r.code, 200, JSON.stringify(r.body));
  const q = queue(); assert.equal(q.length, 1);
  assert.match(q[0].contextHash, /^gestore:feerem:prov_pa1:\d{4}-W\d{2}$/);
  assert.equal(q[0].status, 'pending'); assert.equal(q[0].autoApplied, false); assert.equal(q[0].proposedBy, 'gestore');
  assert.equal(q[0].payload.to, 'anna@example.test'); assert.equal(q[0].payload.channel, 'email');
  assert.ok(q[0].payload.draft.includes('/api/payments/link?k=inv&id=prov_pa1&t='), 'il link stabile, non una sessione');
  assert.ok(q[0].payload.draft.includes('€1,464') && q[0].payload.draft.includes('BOOM-TEST1'));
  r = await runGestore(); assert.equal(queue().length, 1, 'stessa settimana: nessun doppione');
  assert.equal(globalThis.deliveryMails.length, 0, 'il Gestore non spedisce niente da solo');
});

await test('Gestore: provvigione pagata, segnalata o non ancora scaduta → silenzio', async () => {
  for (const patch of [{ status: 'paid', paidAt: new Date().toISOString() }, { tenantReported: true }, { dueDate: dayIso(-1) }]) {
    seed({ lease: { startDate: dayIso(-6), months: 12, endDate: dayIso(358), type: 'transitorio', reason: 'lavoro' } });
    await call({ op: 'fee-link' });
    Object.assign(DB.get('invoices/prov_pa1'), patch);
    const r = await runGestore(); assert.equal(r.code, 200);
    assert.equal(queue().length, 0, 'nessun sollecito con ' + JSON.stringify(patch));
  }
});

await test('Gestore: ingresso tra pochi giorni e link mai preparato → riga nel digest, nessuna fattura emessa', async () => {
  seed({ lease: { startDate: dayIso(5), months: 12, endDate: dayIso(369), type: 'transitorio', reason: 'lavoro' } });
  DB.set('contracts/pa_pa1', { status: 'active', startDate: dayIso(5), endDate: dayIso(369), preAgreementId: 'pa1', propertyId: 'propX', tenantId: 'someTenant', signatureStatus: 'complete' });
  let r = await runGestore(true); assert.equal(r.code, 200, JSON.stringify(r.body));
  const line = (r.body.report.digest || []).find(l => l.startsWith('💶'));
  assert.ok(line && /ingresso tra [45]gg/.test(line) && /€1\.?464/.test(line) && /Link provvigione/.test(line), JSON.stringify(r.body.report.digest));
  assert.equal(DB.has('invoices/prov_pa1'), false, 'la fattura la emette l\'operatore, mai il Gestore');
  await call({ op: 'fee-link' });
  r = await runGestore(true);
  assert.equal((r.body.report.digest || []).some(l => l.startsWith('💶')), false, 'col link preparato la riga sparisce');
  DB.get('preAgreements/pa1').money.feeDue = 'signing';
  DB.delete('invoices/prov_pa1');
  r = await runGestore(true);
  assert.equal((r.body.report.digest || []).some(l => l.startsWith('💶')), false, 'provvigione già nel dovuto alla firma: niente da segnalare');
});

assert.deepEqual(unexpected, [], 'IO inatteso: ' + unexpected.join(', '));
console.log(`PA external: ${n} scenari passati`);
