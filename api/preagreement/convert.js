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
// Delegate protocol (the BOOM way, as on the real signed proposals where
// Valentino signs "on behalf of" the owner): delegate:true (default) records
// landlordDelegate — the landlord-side Magic-Sign link belongs to the ADMIN,
// who countersigns per delega on their own schedule after the tenant signs
// (signingOrder sequential), keeping registration timing fully in-house.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord)
// Body: {
//   id:          string,        // preAgreements doc id
//   propertyId?: string,        // defaults to pa.propertyId
//   delegate?:   boolean,       // default true — agency countersigns per delega
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
export async function convertPaToContract({ pa, paId, propertyId, delegate = true, delegateName, type, actor = 'system' }) {
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
  let tenantId = null;
  try {
    if (t.email) {
      const hits = await fsList('users', { filter: { field: 'email', op: 'EQUAL', value: t.email }, limit: 1 });
      if (hits && hits[0]) tenantId = hits[0].id;
    }
    if (!tenantId) {
      const { id } = await fsCreate('users', {
        role: 'tenant',
        name: t.fullName, email: t.email || '', phone: t.phone || '',
        cf: t.cf || '', dob: t.dob || '', pob: t.birthPlace || '',
        address: t.address || '', docNum: t.idDoc || '', nationality: t.nationality || '',
        identityDocs: uploads.filter(u => (u.tenantIndex || 0) === 0).map(u => ({ url: u.url, name: u.name, at: u.at })),
        createdBy: 'preagreement_convert', createdAt: new Date().toISOString(),
      });
      tenantId = id;
    }
  } catch (e) {
    console.error('[preagreement/convert] tenant bootstrap failed:', e.message);
    return { ok: false, error: 'tenant_bootstrap_failed' };
  }

  // ── 2. The contract, shaped exactly like portal.html's saveContract ──
  const m = pa.money || {}, le = pa.lease || {};
  const months = Math.max(1, Number(le.months) || 12);
  const rent = Number(m.rent) || 0;
  const cType = type === 'studenti' ? 'studenti' : 'transitorio';
  const delegateOn = delegate !== false;
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
    canone: {
      monthly: rent,
      total: Math.round(rent * months * 100) / 100,
      installments: months,
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
    signingOrder: 'sequential',           // tenant first; delegate countersigns when ready
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

  let contractId;
  try {
    const { id } = await fsCreate('contracts', contract);
    contractId = id;
  } catch (e) {
    console.error('[preagreement/convert] contract create failed:', e.message);
    return { ok: false, error: 'contract_create_failed' };
  }

  // Back-link on the PA (best-effort — the contract exists either way).
  // Sign URLs are stored here too so the console can offer 🖊 Magic Sign /
  // WhatsApp share without extra reads (preAgreements is admin-only).
  fsPatch('preAgreements/' + paId, {
    contractId, convertedAt: new Date().toISOString(), convertedBy: actor,
    tenantSignUrl: `${BASE}/sign?sign=${contract.tenantSignToken}`,
    landlordSignUrl: `${BASE}/sign?sign=${contract.landlordSignToken}`,
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
    delegate: b.delegate !== false,
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
