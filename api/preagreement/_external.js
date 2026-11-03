// api/preagreement/_external.js — dalla console pre-agreement: il contratto
// firmato FUORI da Magic Sign rientra nel giro, e la provvigione si incassa
// con un link (2/11/2026).
//
// «Voglio caricare direttamente i contratti che ho firmato senza Magic Sign,
// e continuare tutta la journey; poi con un tap il link Stripe della
// provvigione, che si paga sempre all'ingresso.»
//
// Cosa c'era: il recupero del firmato esterno (api/contracts/_external.js) —
// ma solo nel pannello Registrazione del portal, solo a contratto già nato, e
// bloccato finché OGNI parte non aveva un profilo nel portal (un proprietario
// nato dalla proposta non ce l'ha mai: party_profiles_required). E la
// provvigione viaggiava sul contratto come dato interno (agencyFee) senza
// nessun documento pagabile: nessun link poteva incassarla.
//
// Qui niente regola nuova sulle firme: le operazioni della console
// ORCHESTRANO i pezzi che ci sono — la conversione (contratto che nasce dalla
// proposta), linkExternalParty (stessi controlli di ruolo e CF),
// adoptExternal/prepareExternal (stesse verifiche dell'operatore, stessi byte),
// onboardExternal (benvenuto e canoni, solo se chiesti) — e la fattura BOOM
// con il link di /api/payments/link (stesso webhook, stessa ricevuta).
// Admin-only: lo controlla sign-for, che le instrada.
import crypto from 'node:crypto';
import { fsGet, fsGetVersioned, fsList, fsCreate, fsCommit, logActivity } from '../homie/_lib.js';
import { externalReview, adoptExternal, prepareExternal, onboardExternal, linkExternalParty } from '../contracts/_external.js';
import { signedParties } from '../contracts/revise.js';
import completion from '../../js/contract-completion-engine.js';
import RENT from '../../js/rent-engine.js';
import { payLink } from '../payments/_token.js';

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const eurIt = (n) => '€' + r2(n).toLocaleString('it-IT', { minimumFractionDigits: Number.isInteger(r2(n)) ? 0 : 2, maximumFractionDigits: 2 });
const eurEn = (n) => '€' + r2(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(r2(n)) ? 0 : 2, maximumFractionDigits: 2 });

// ── LA PROVVIGIONE ───────────────────────────────────────────────────────
// La cifra è quella che il cliente ha firmato sulla proposta (deriveMoney:
// fee + IVA = feeTotal). Mai ricalcolata qui.
export function feeOf(pa) {
  const m = (pa && pa.money) || {};
  const base = r2(m.fee), total = r2(m.feeTotal) || base;
  if (!(total > 0)) return null;
  return {
    totalEur: total, baseEur: base || total,
    vatPct: Number(m.feeVatPct) || 22, vatEur: base ? r2(total - base) : 0,
    due: ['move-in', 'signing', 'separate'].includes(m.feeDue) ? m.feeDue : 'separate',
    mode: m.feeMode || 'pct', pct: Number(m.feePct) || null, months: Number(m.feeMonths) || null,
  };
}
export const feeInvoiceId = (paId) => 'prov_' + String(paId || '').replace(/[^\w-]/g, '').slice(0, 80);

// Perché un link NON si fa: la provvigione dentro il dovuto alla firma
// passa dal link della proposta (un secondo link la farebbe pagare due volte).
export function feeBlock(pa, fee) {
  if (!fee) return 'no_fee';
  if (fee.due === 'signing') return (pa.status === 'paid' || pa.paidAt) ? 'fee_paid_at_signing' : 'fee_in_due_at_signing';
  return null;
}

export function feeMessage({ pa, fee, url }) {
  const t = pa.tenant || {}, first = clip(t.fullName, 80).split(' ')[0];
  const addr = clip((pa.property || {}).address, 120);
  return 'Hi' + (first ? ' ' + first : '') + '! '
    + (fee.due === 'move-in'
      ? 'As agreed in your proposal' + (pa.ref ? ' ' + pa.ref : '') + ', the BOOM agency fee' + (addr ? ' for ' + addr : '') + ' is due at move-in'
      : 'As agreed in your proposal' + (pa.ref ? ' ' + pa.ref : '') + ', here is the BOOM agency fee' + (addr ? ' for ' + addr : ''))
    + ': ' + eurEn(fee.totalEur) + ' (incl. ' + fee.vatPct + '% VAT). You can pay it by card here — the receipt arrives by email automatically:\n' + url;
}

// La fattura BOOM della provvigione, UNA per proposta (id deterministico,
// 409 = già emessa). Una fattura esistente non si riscrive mai: se la cifra
// della proposta non coincide più, lo si dice e si tiene quella emessa.
export async function ensureFeeInvoice({ pa, paId, contract, contractId, actor }) {
  const fee = feeOf(pa);
  const blocked = feeBlock(pa, fee);
  if (blocked) return { ok: false, error: blocked, fee };
  const id = feeInvoiceId(paId);
  let inv = await fsGet('invoices/' + id);
  let created = false;
  if (!inv) {
    const t = pa.tenant || {}, le = pa.lease || {};
    const code = clip(pa.ref, 40).replace(/^BOOM-/i, '') || paId.slice(0, 10).toUpperCase();
    const how = fee.mode === 'months' && fee.months ? fee.months + ' mensilità' : (fee.pct ? fee.pct + '% del canone annuo' : '');
    const doc = {
      number: 'BOOM-PROV-' + code,
      recipientId: (contract && contract.tenantId) || '', clientId: (contract && contract.tenantId) || '',
      recipientType: 'tenant', recipientName: clip(t.fullName, 120),
      recipientEmail: EMAIL_RE.test(clip(t.email, 160)) ? clip(t.email, 160) : '',
      service: 'Provvigione di intermediazione',
      amount: fee.totalEur, netAmount: fee.baseEur, vatPct: fee.vatPct, vatAmount: fee.vatEur,
      date: new Date().toISOString().slice(0, 10),
      dueDate: (fee.due === 'move-in' && /^\d{4}-\d{2}-\d{2}/.test(String(le.startDate || ''))) ? String(le.startDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      description: clip(((pa.property || {}).address || '') + ' — proposta ' + (pa.ref || paId) + '. Provvigione di intermediazione'
        + (how ? ' (' + how + ')' : '') + ' + IVA ' + fee.vatPct + '%' + (fee.due === 'move-in' ? ', dovuta all\'ingresso.' : '.'), 250),
      status: 'pending', source: 'preagreement', preAgreementId: paId, preAgreementRef: pa.ref || null,
      contractId: contractId || '', propertyId: (contract && contract.propertyId) || pa.propertyId || '',
      createdAt: new Date().toISOString(), createdBy: actor || 'admin',
    };
    try { await fsCreate('invoices', doc, id); inv = doc; created = true; }
    catch (e) {
      if (!(e && e.exists)) throw e;
      inv = await fsGet('invoices/' + id);
      if (!inv) throw e;
    }
  }
  // Nata PRIMA del contratto, la fattura non sa chi è l'inquilino nel portal:
  // appena il contratto c'è la si collega (mai l'importo, mai su una pagata).
  if (!created && !inv.recipientId && contract && contract.tenantId && inv.status !== 'paid') {
    const link = { recipientId: contract.tenantId, clientId: contract.tenantId, contractId: contractId || '', propertyId: contract.propertyId || inv.propertyId || '' };
    try { await fsCommit([{ docPath: 'invoices/' + id, fields: link, precondition: { exists: true } }]); inv = { ...inv, ...link }; }
    catch (e) { console.warn('[pa/external] fee invoice link:', e.message); }
  }
  const amountChanged = r2(inv.amount) !== fee.totalEur;
  return { ok: true, id, created, invoice: inv, fee, amountChanged };
}

export async function feeLink({ pa, paId, contract, contractId, actor }) {
  const r = await ensureFeeInvoice({ pa, paId, contract, contractId, actor });
  if (!r.ok) return r;
  const inv = r.invoice;
  const blocked = RENT.paymentBlockReason(inv, 'invoice');
  const paid = blocked === 'already_paid';
  const url = blocked ? null : payLink('inv', r.id);
  const now = new Date().toISOString();
  // La proposta lo sa (la console la legge in tempo reale): mai una proposta
  // fantasma, la scrittura vale solo se il documento esiste.
  const stamp = { feeInvoiceId: r.id, feeInvoiceStatus: paid ? 'paid' : (blocked || 'pending'), feeLinkUrl: url || null };
  if (r.created || !pa.feeInvoiceAt) stamp.feeInvoiceAt = now;
  if (paid) { stamp.feePaidAt = inv.paidAt || inv.paidDate || now; stamp.feePaidVia = inv.paidVia || 'manual'; }
  try { await fsCommit([{ docPath: 'preAgreements/' + paId, fields: stamp, precondition: { exists: true } }]); }
  catch (e) { console.warn('[pa/external] fee stamp:', e.message); }
  await logActivity('preagreement_fee_link', 'payment', { paId, invoiceId: r.id, created: r.created, amount: inv.amount, blocked: blocked || null }, actor || 'admin').catch(() => {});
  const t = pa.tenant || {};
  return {
    ok: true, invoiceId: r.id, number: inv.number || null, created: r.created,
    amount: r2(inv.amount), fee: r.fee, amountChanged: r.amountChanged,
    status: paid ? 'paid' : (blocked || 'pending'), blocked: blocked || null,
    paidAt: paid ? (inv.paidAt || inv.paidDate || null) : null,
    url, message: url ? feeMessage({ pa, fee: { ...r.fee, totalEur: r2(inv.amount) }, url }) : null,
    phone: clip(t.phone, 40) || null, email: clip(t.email, 160) || null,
  };
}

// ── I PROFILI CHE MANCANO (prima del firmato esterno) ────────────────────
// adoptExternal esige un profilo nel portal per ogni parte (l'archivio del
// firmato va nel portal di ciascuno). Sul contratto nato dalla proposta il
// conduttore ce l'ha (la conversione lo crea), il proprietario e i
// co-conduttori no. Il piano si legge prima e si esegue con un tap:
//   · email già nel portal con lo stesso ruolo → si COLLEGA quel profilo;
//   · email nel portal con un altro ruolo → conflitto, lo si dice e basta;
//   · email nuova → profilo con accesso (entra con «Password dimenticata»);
//   · nessuna email → scheda senza accesso al portal (dichiarato).
// Il collegamento passa SEMPRE da linkExternalParty: ruolo e CF controllati
// lì, mai un profilo sostituito, mai dedotto da un nome simile.
function partyOf(party, c, pa) {
  const ll = (pa && pa.landlord) || {};
  if (party === 'landlord') return { role: 'landlord', name: c.landlordName || ll.name || '', email: c.landlordEmail || ll.email || '', phone: c.landlordPhone || ll.phone || '', cf: c.landlordCF || '' };
  if (party === 'tenant') { const t = (pa && pa.tenant) || {}; return { role: 'tenant', name: c.tenantName || t.fullName || '', email: c.tenantEmail || t.email || '', phone: c.tenantPhone || t.phone || '', cf: c.tenantCF || t.cf || '' }; }
  const x = (c.coTenants || [])[Number(String(party).slice(2))] || {};
  return { role: 'tenant', name: x.name || '', email: x.email || '', phone: x.phone || '', cf: x.cf || '', nationality: x.nationality || '', dob: x.dob || '', pob: x.birthPlace || '' };
}

// Un profilo esistente si riconosce da un dato ESATTO, in quest'ordine:
// l'email, il codice fiscale, e — per un co-conduttore — la scheda che la
// conversione ha creato per QUESTA proposta (notes «Co-conduttore — PA <ref>»,
// stesso nome): senza, la conversione e il collegamento farebbero due schede
// della stessa persona. Mai un nome simile da solo.
async function findProfile(party, who, email, pa, paId) {
  const q = async (field, value) => value ? ((await fsList('users', { filter: { field, op: 'EQUAL', value }, limit: 3 }).catch(() => [])) || []) : [];
  if (email) { const h = await q('email', email); if (h.length) return { hits: h, by: 'email' }; }
  const cf = clip(who.cf, 20).toUpperCase();
  if (/^[A-Z0-9]{11,16}$/.test(cf)) { const h = await q('cf', cf); if (h.length) return { hits: h, by: 'cf' }; }
  if (String(party).startsWith('co') && who.name) {
    const note = 'Co-conduttore — PA ' + ((pa && pa.ref) || paId || '');
    const h = (await q('name', who.name)).filter(x => x.notes === note && x.createdBy === 'preagreement_convert');
    if (h.length) return { hits: h, by: 'conversione' };
  }
  return { hits: [], by: null };
}

export async function profilePlan(c, p, pa, paId) {
  const missing = completion.missingProfiles(c, p);
  const used = new Set([c.tenantId, (p || {}).ownerId, c.landlordId, ...(c.coTenants || []).map(x => x && x.userId)].filter(Boolean));
  const out = [];
  for (const party of missing) {
    const who = partyOf(party, c, pa);
    const email = EMAIL_RE.test(clip(who.email, 160)) ? clip(who.email, 160).toLowerCase() : '';
    let action = email ? 'create' : 'create_nologin', userId = null, why = '', by = null;
    const found = await findProfile(party, who, email, pa, paId);
    const hits = found.hits.filter(x => !used.has(x.id) || x.role !== who.role);
    if (found.hits.length && !hits.length) { action = 'conflict'; why = 'il profilo trovato è già una parte di questo contratto'; }
    else if (hits.length > 1) { action = 'conflict'; why = 'più profili con lo stesso ' + (found.by === 'cf' ? 'codice fiscale' : found.by === 'email' ? 'indirizzo email' : 'nome'); }
    else if (hits[0]) {
      by = found.by;
      if (hits[0].role === who.role) { action = 'link'; userId = hits[0].id; }
      else { action = 'conflict'; why = 'il profilo con questo ' + (by === 'cf' ? 'codice fiscale' : 'indirizzo email') + ' ha ruolo «' + (hits[0].role || '—') + '»'; }
    }
    if (!who.name && action !== 'link') { action = 'conflict'; why = 'manca il nome'; }
    if (userId) used.add(userId);
    out.push({ party, role: who.role, name: who.name, email: email || null, phone: who.phone || null, action, userId, by, why });
  }
  return out;
}

async function createProfile(who, email) {
  let uid = null;
  if (email && process.env.FIREBASE_API_KEY) {
    try {
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.FIREBASE_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: crypto.randomBytes(18).toString('base64url'), returnSecureToken: false }),
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.localId) uid = d.localId;
    } catch (_) { /* senza account: la scheda nasce comunque, il collegamento resta */ }
  }
  const doc = {
    role: who.role, name: who.name, email: email || '', phone: who.phone || '',
    cf: who.cf || '', codiceFiscale: who.cf || '',
    ...(who.nationality ? { nationality: who.nationality } : {}),
    ...(who.dob ? { dob: who.dob, birthDate: who.dob } : {}),
    ...(who.pob ? { pob: who.pob, birthPlace: who.pob } : {}),
    createdBy: 'preagreement_external', createdAt: new Date().toISOString(),
  };
  try {
    const r = await fsCreate('users', doc, uid || undefined);
    return uid || (r && r.id);
  } catch (e) { if (e && e.exists && uid) return uid; throw e; }
}

export async function applyProfiles(contractId, pa, paId) {
  const v0 = await fsGetVersioned('contracts/' + contractId);
  if (!v0) return { ok: false, error: 'contract_not_found', status: 404 };
  const p0 = v0.data.propertyId ? await fsGet('properties/' + v0.data.propertyId) : null;
  const plan = await profilePlan({ ...v0.data, id: contractId }, p0, pa, paId);
  const results = [];
  for (const step of plan) {
    if (step.action === 'conflict') { results.push({ ...step, ok: false, error: 'profile_conflict' }); continue; }
    let userId = step.userId;
    try {
      if (!userId) userId = await createProfile(partyOf(step.party, v0.data, pa), step.email);
      // la versione si rilegge a ogni collegamento: ciascuno cambia il contratto
      const v = await fsGetVersioned('contracts/' + contractId);
      const r = await linkExternalParty(contractId, { version: v.updateTime, party: step.party, userId, confirm: true });
      results.push({ ...step, userId, ok: !!r.ok, created: !step.userId, error: r.ok ? undefined : r.error });
    } catch (e) {
      console.warn('[pa/external] profile', step.party, e.message);
      results.push({ ...step, userId, ok: false, error: 'profile_failed' });
    }
  }
  return { ok: results.every(r => r.ok), results };
}

// ── LO STATO PER LA CONSOLE (sola lettura) ───────────────────────────────
export async function externalStatus({ pa, paId, contractId, contract }) {
  const fee = feeOf(pa);
  const feeState = fee ? { ...fee, blocked: feeBlock(pa, fee), invoiceId: pa.feeInvoiceId || null, status: pa.feeInvoiceStatus || null, paidAt: pa.feePaidAt || null, url: pa.feeLinkUrl || null } : null;
  if (!contract) return { ok: true, hasContract: false, contractId: null, propertyId: pa.propertyId || null, fee: feeState };
  const v = await fsGetVersioned('contracts/' + contractId);
  if (!v) return { ok: true, hasContract: false, contractId: null, propertyId: pa.propertyId || null, fee: feeState };
  const c = { ...v.data, id: contractId };
  const p = c.propertyId ? await fsGet('properties/' + c.propertyId) : null;
  const review = externalReview(c, p, v.updateTime);
  const profiles = await profilePlan(c, p, pa, paId);
  return {
    ok: true, hasContract: true, contractId, fee: feeState,
    property: p ? { id: c.propertyId, address: p.address || p.name || '' } : null,
    review: {
      version: review.version, termsHash: review.termsHash, canAdopt: review.canAdopt,
      signed: signedParties(c).map(x => ({ role: x.role, name: x.name || '', signedAt: x.signedAt || null })),
      document: review.document ? { url: review.document.url, name: review.document.name, signedDate: review.document.signedDate, pages: review.document.pages } : null,
      preparation: review.preparation, termsValid: review.termsValid,
      terms: {
        tenantName: c.tenantName || '', landlordName: c.landlordName || '', type: c.type || '',
        startDate: c.startDate || null, endDate: c.endDate || null,
        rent: Number(c.rent) || 0, deposit: Number(c.deposit) || 0,
        installmentMonths: Number(c.installmentMonths) || 1, paymentDay: c.paymentDay || 5,
        coTenants: (c.coTenants || []).map(x => x.name).filter(Boolean),
        address: p ? (p.address || p.name || '') : '', unit: c.unit || '',
      },
    },
    profiles,
    onboarding: {
      welcomeEmailSent: !!c.welcomeEmailSent, welcomeEmailSentAt: c.welcomeEmailSentAt || null,
      paymentsGenerated: !!c.paymentsGenerated, externalWelcome: c.externalWelcome || null,
    },
  };
}

export { adoptExternal, prepareExternal, onboardExternal, eurIt };
