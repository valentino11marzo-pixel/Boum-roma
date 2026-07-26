// api/preagreement/convert.js
// An ACCEPTED (or paid) pre-agreement becomes a rental contract in the
// portal's `contracts` collection — no re-typing. The tenant identity the
// client self-filled on the public page (name, dob, birthplace, nationality,
// address, CF, ID + uploaded ID documents) seeds their `users` profile and
// travels onto the contract; lease + money terms carry over; Magic-Sign
// tokens are minted.
//
// Two entry points:
//   - HTTP POST (console "→ Contract" button) — this file's default handler
//   - convertPaToContract() — the same core, called by stripe-webhook.js /
//     submit.js for the AUTOMATIC pipeline: PA created with propertyId +
//     autoConvert → the contract materializes the moment the deal closes
//     (payment confirmed, or acceptance when nothing is due via Stripe).
//
// Landlord signature: by DEFAULT the owner signs directly — the landlord-side
// Magic-Sign link is meant for them (the console shares it via WhatsApp/email
// after the tenant signs; signingOrder sequential). delegate:true is the
// OPTION for deals where the admin countersigns per delega scritta (as on
// some real BOOM proposals): it records landlordDelegate and the landlord
// link stays with the admin instead.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord)
// Body: {
//   id:          string,        // preAgreements doc id
//   propertyId?: string,        // defaults to pa.propertyId
//   delegate?:   boolean,       // default FALSE — owner signs directly;
//                               // true = agency countersigns per delega
//   delegateName?: string,      // default 'Valentino Egidi'
//   type?:       'transitorio'|'studenti'   // default 'transitorio'
// }
// Response: { ok, contractId, tenantId, tenantSignUrl, landlordSignUrl,
//             delegate:{...}|null, already?:true }

import crypto from 'node:crypto';
import { fsGet, fsList, fsCreate, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

const BASE = 'https://www.boomrome.com';
const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);

// ── Core conversion, shared by the console handler and the auto pipeline ──
// Returns { ok, already?, contractId, tenantId, tenantSignUrl,
//           landlordSignUrl, delegate } or { ok:false, error }.
export async function convertPaToContract({ pa, paId, propertyId, delegate = false, delegateName, type, actor = 'system' }) {
  if (!pa || !paId) return { ok: false, error: 'no_pa' };
  if (pa.status !== 'accepted' && pa.status !== 'paid') return { ok: false, error: 'not_accepted_yet' };

  // Idempotent: already converted → hand back the existing contract's links.
  if (pa.contractId) {
    try {
      const c = await fsGet('contracts/' + pa.contractId);
      if (c) {
        return {
          ok: true, already: true, contractId: pa.contractId, tenantId: c.tenantId || null,
          tenantSignUrl: c.tenantSignToken ? `${BASE}/sign?sign=${c.tenantSignToken}` : null,
          landlordSignUrl: c.landlordSignToken ? `${BASE}/sign?sign=${c.landlordSignToken}` : null,
          delegate: c.landlordDelegate || null,
        };
      }
    } catch (_) { /* stale pointer — fall through and convert again */ }
  }

  const propId = propertyId || pa.propertyId;
  if (!propId) return { ok: false, error: 'no_property' };
  let property;
  try { property = await fsGet('properties/' + propId); }
  catch (e) { return { ok: false, error: 'property_lookup_failed' }; }
  if (!property) return { ok: false, error: 'property_not_found' };

  const tenants = Array.isArray(pa.tenants) && pa.tenants.length ? pa.tenants : [pa.tenant || {}];
  const t = tenants[0];
  if (!t || !t.fullName) return { ok: false, error: 'no_tenant_identity' };
  const uploads = Array.isArray(pa.uploads) ? pa.uploads : [];

  // ── 1. Tenant user: reuse by email, else bootstrap from the PA identity ──
  // The users doc MUST be keyed by a real Firebase Auth uid: /casa and
  // /api/payments/pay authorize on tenantId === auth.uid. So when no
  // profile matches by email, we mint the Auth account server-side
  // (Identity Toolkit signUp, random password — the tenant sets their own
  // via "Password dimenticata" on /login) and key the doc on its localId.
  let tenantId = null;
  try {
    if (t.email) {
      const hits = await fsList('users', { filter: { field: 'email', op: 'EQUAL', value: t.email }, limit: 1 });
      if (hits && hits[0]) tenantId = hits[0].id;
    }
    let authUid = null;
    if (!tenantId && t.email && process.env.FIREBASE_API_KEY) {
      try {
        const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.FIREBASE_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: t.email, password: crypto.randomBytes(18).toString('base64url'), returnSecureToken: false }),
        });
        const d = await r.json().catch(() => ({}));
        if (d && d.localId) authUid = d.localId;
        // EMAIL_EXISTS with no users doc → fall through to auto-ID (rare;
        // the operator links the profile from the portal)
      } catch (_) {}
    }
    if (!tenantId) {
      const { id } = await fsCreate('users', {
        role: 'tenant',
        name: t.fullName, email: t.email || '', phone: t.phone || '',
        cf: t.cf || '', dob: t.dob || '', pob: t.birthPlace || '',
        address: t.address || '', docNum: t.idDoc || '', nationality: t.nationality || '',
        identityDocs: uploads.filter(u => (u.tenantIndex || 0) === 0).map(u => ({ url: u.url, name: u.name, at: u.at })),
        createdBy: 'preagreement_convert', createdAt: new Date().toISOString(),
      }, authUid || undefined).then(r => { tenantId = authUid || r.id; })
        .catch(e => { if (e && e.exists && authUid) tenantId = authUid; else throw e; });
    }
  } catch (e) {
    console.error('[preagreement/convert] tenant bootstrap failed:', e.message);
    return { ok: false, error: 'tenant_bootstrap_failed' };
  }

  // ── 2. The contract, shaped exactly like portal.html's saveContract ──
  const m = pa.money || {}, le = pa.lease || {};
  const months = Math.max(1, Number(le.months) || 12);
  const rent = Number(m.rent) || 0;
  // instalment cadence (1|2|3|6|12 months) — the schedule generator and the
  // tenant portal both read it from the contract
  const installmentMonths = [1, 2, 3, 6, 12].includes(Number(m.installmentMonths)) ? Number(m.installmentMonths) : 1;
  const installmentAmount = Math.round((Number(m.installmentAmount) || rent * installmentMonths) * 100) / 100;
  // energy allowance collected with the rent (default) or settled apart
  const billEnergyCredit = m.billEnergyCredit !== false && Number(m.energyCredit) > 0;
  const cType = type === 'studenti' ? 'studenti' : 'transitorio';
  const delegateOn = delegate === true;
  const dName = clip(delegateName, 120) || 'Valentino Egidi';
  const newToken = () => crypto.randomUUID();

  const contract = {
    propertyId: propId,
    tenantId,
    type: cType,
    startDate: le.startDate || null,
    endDate: le.endDate || null,
    rent,
    deposit: Number(m.deposit) || 0,
    depositMonths: Number(m.depositMonths) || 1,
    accessoryCharges: Number(m.energyCredit) || 0,
    paymentMethod: 'bonifico bancario',
    paymentDay: 5,
    installmentMonths,
    installmentAmount,
    billEnergyCredit,
    canone: {
      monthly: rent,
      total: Math.round(rent * months * 100) / 100,
      // installments stays the MONTH count: portal.html validates
      // monthly × installments === total and offers a destructive auto-fix
      // when it doesn't. The cadence lives in its own fields.
      installments: months,
      installmentMonths,
      installmentAmount,
      paymentDay: 5,
      paymentMethod: 'bonifico bancario',
      cedolareSecca: true,
      oneriMode: 'tabella_allegato_d',
    },
    durata: { text: months + ' mesi', startDate: le.startDate || null, endDate: le.endDate || null },
    transitionalReason: le.reason || '',
    transitionalDocs: '',
    universityName: '', courseName: '',
    cohabitants: tenants.slice(1).map(x => x.fullName).filter(Boolean).join(', '),
    otherClauses: (Array.isArray(pa.customClauses) ? pa.customClauses : []).join('\n'),
    studenti: null,
    notes: `Da pre-agreement ${pa.ref || paId} — accettato ${String(pa.acceptedAt || '').slice(0, 10)}${pa.paidAt ? ` · pagato €${pa.paidEur} il ${String(pa.paidAt).slice(0, 10)}` : ''}${uploads.length ? ` · ${uploads.length} documento/i d'identità allegati` : ''}.`,
    cadastral: '', energyClass: '',
    renditaCatastale: 0,
    cedolareSecca: 'si',
    requiresAsseverazione: true,
    linkedLeadId: '', linkedLeadSource: '', linkedViewingId: '',
    preAgreementId: paId,
    preAgreementRef: pa.ref || null,
    identityDocs: uploads.map(u => ({ url: u.url, name: u.name, tenantIndex: u.tenantIndex || 0, at: u.at })),
    status: 'active',
    signatureStatus: 'none',
    signingOrder: 'sequential',           // tenant first; landlord countersigns when ready
    // Landlord identity from the PA — magic-sign shows the real name even
    // when the portal property has no ownerId/users profile (owner-direct
    // signing is the default now).
    landlordName: (pa.landlord || {}).name || property.ownerName || '',
    landlordEmail: (pa.landlord || {}).email || null,
    landlordPhone: (pa.landlord || {}).phone || null,
    tenantSignToken: newToken(),
    landlordSignToken: newToken(),
    landlordDelegate: delegateOn ? {
      name: dName,
      onBehalfOf: (pa.landlord || {}).name || property.ownerName || '',
      basis: 'delega scritta del proprietario',
      setAt: new Date().toISOString(),
      setBy: actor,
    } : null,
    paymentsGenerated: false,
    welcomeEmailSent: false,
    createdAt: new Date().toISOString(),
    createdBy: 'preagreement_convert:' + actor,
  };

  // ID deterministico dal PA: due conversioni concorrenti (double-submit,
  // retry del webhook con back-link stantio) collassano sullo stesso doc —
  // la seconda riceve 409 e restituisce il contratto della prima, con i
  // token firma originali intatti.
  const contractId = 'pa_' + paId;
  try {
    await fsCreate('contracts', contract, contractId);
  } catch (e) {
    if (e.exists) {
      try {
        const c = await fsGet('contracts/' + contractId);
        if (c) {
          return {
            ok: true, already: true, contractId, tenantId: c.tenantId || null,
            tenantSignUrl: c.tenantSignToken ? `${BASE}/sign?sign=${c.tenantSignToken}` : null,
            landlordSignUrl: c.landlordSignToken ? `${BASE}/sign?sign=${c.landlordSignToken}` : null,
            delegate: c.landlordDelegate || null,
          };
        }
      } catch (_) { /* cade nel ramo errore sotto */ }
    }
    console.error('[preagreement/convert] contract create failed:', e.message);
    return { ok: false, error: 'contract_create_failed' };
  }

  // Deposit balance as a REAL installment: when the PA split the deposit
  // (n% at signing, rest upon move-in), the remainder becomes a payments
  // doc due on move-in day — payable by card from /casa (Canone via BOOM)
  // or by transfer (bank reconciliation matches it like any rent). The
  // journey's T-7 email reminds the tenant automatically.
  const depBal = Number(m.depositAtMoveIn) || 0;
  if (depBal > 0 && le.startDate) {
    try {
      await fsCreate('payments', {
        type: 'deposit-balance',
        contractId, tenantId, propertyId: propId,
        amount: depBal, month: 'saldo deposito',
        dueDate: le.startDate, status: 'pending',
        createdAt: new Date().toISOString(), createdBy: 'preagreement_convert',
      }, 'depbal_' + contractId);
    } catch (e) { if (!e.exists) console.error('[preagreement/convert] depbal:', e.message); }
  }

  // Back-link on the PA (best-effort — the contract exists either way).
  // Sign URLs are stored here too so the console can offer 🖊 Magic Sign /
  // WhatsApp share without extra reads (preAgreements is admin-only).
  fsPatch('preAgreements/' + paId, {
    contractId, convertedAt: new Date().toISOString(), convertedBy: actor,
    tenantSignUrl: `${BASE}/sign?sign=${contract.tenantSignToken}`,
    landlordSignUrl: `${BASE}/sign?sign=${contract.landlordSignToken}`,
    delegated: delegateOn,   // the console shapes the landlord-link action on this
  }).catch(() => {});
  logActivity('preagreement_converted', 'contract',
    { paId, ref: pa.ref || '', contractId, tenant: t.fullName, delegate: delegateOn, auto: actor === 'auto' }, actor)
    .catch(() => {});

  return {
    ok: true, contractId, tenantId,
    tenantSignUrl: `${BASE}/sign?sign=${contract.tenantSignToken}`,
    landlordSignUrl: `${BASE}/sign?sign=${contract.landlordSignToken}`,
    delegate: contract.landlordDelegate,
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  const paId = clip(b && b.id, 80);
  if (!paId) return res.status(400).json({ ok: false, error: 'id_required' });

  let pa;
  try { pa = await fsGet('preAgreements/' + paId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pa) return res.status(404).json({ ok: false, error: 'not_found' });

  const out = await convertPaToContract({
    pa, paId,
    propertyId: clip(b.propertyId, 80),
    delegate: b.delegate === true,
    delegateName: b.delegateName,
    type: b.type,
    actor: auth.email || auth.uid,
  });
  if (!out.ok) {
    const code = out.error === 'not_accepted_yet' ? 409
      : out.error === 'no_property' ? 400
      : out.error === 'property_not_found' ? 404
      : out.error === 'no_tenant_identity' ? 409 : 500;
    return res.status(code).json({ ok: false, error: out.error, status: pa.status });
  }
  return res.status(200).json(out);
}
