// api/owners/contatti.js — I CONTATTI DEGLI INQUILINI, per il Palazzo
//
// La proprietaria di un palazzo, cliccando un interno, deve trovare chi c'è
// dentro e come raggiungerlo (telefono, email). Dal browser non può: le
// rules le fanno leggere i contratti dei SUOI immobili ma non `users`
// (anagrafiche: admin o sé stessi), e un contratto nato da una proposta non
// porta `tenantPhone`/`tenantEmail` (stanno sul profilo e sulla proposta).
// Questa porta li ricompone sul server, sotto admin, e li riconsegna SOLO
// per i contratti degli immobili di chi chiama.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>
// Body:     { contractIds: [<id>, …] }   (≤ 120, id validati)
// Response: { ok, contacts: { <contractId>: [{ role, name, phone, email }] },
//             denied, missing }
//
// Regole dure (tests/palazzo/contatti.mjs):
// - admin: qualunque contratto. landlord/owner: SOLO i contratti il cui
//   immobile ha `ownerId === uid`; gli altri vengono OMESSI (contati in
//   `denied`), mai un 403 che riveli quali id esistono.
// - escono nome, telefono, email e il ruolo (titolare / co-conduttore). MAI
//   codice fiscale, documento, nascita, indirizzo: alla proprietaria serve
//   raggiungere l'inquilino, non il suo fascicolo.
// - precedenza: il dato sul CONTRATTO (scritto dal wizard o dalla firma) →
//   il profilo `users/<tenantId>` → la proposta da cui il contratto è nato.
//   Nessun numero inventato: un contatto che manca resta vuoto.
// - nessuna scrittura; `Cache-Control: private, no-store`.

import { fsGetMany, readJson } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

const ID_RE = /^[\w.-]{1,80}$/;
const MAX_IDS = 120;

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
// Un telefono resta un telefono: cifre, + iniziale, spazi. Il resto (note,
// "chiamare dopo le 18") non diventa un numero da comporre.
export function cleanPhone(v) {
  const s = clip(v, 40);
  if (!s) return '';
  const plus = s.startsWith('+') || s.startsWith('00');
  const digits = s.replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 6 || digits.length > 15) return '';
  return (plus ? '+' : '') + digits;
}
export function cleanEmail(v) {
  const s = clip(v, 120).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

// Il titolare + i co-conduttori di UN contratto, dalle tre fonti in ordine.
export function contactsOf(contract, user, pa) {
  const c = contract || {}, u = user || {};
  const t0 = pa ? ((Array.isArray(pa.tenants) && pa.tenants[0]) || pa.tenant || {}) : {};
  const out = [];
  const name = clip(c.tenantName || u.name || u.displayName || t0.fullName, 120);
  const phone = cleanPhone(c.tenantPhone) || cleanPhone(u.phone) || cleanPhone(t0.phone);
  const email = cleanEmail(c.tenantEmail) || cleanEmail(u.email) || cleanEmail(t0.email);
  if (name || phone || email) out.push({ role: 'tenant', name, phone, email });
  const paCo = pa && Array.isArray(pa.tenants) ? pa.tenants.slice(1) : [];
  (Array.isArray(c.coTenants) ? c.coTenants : []).forEach((x, i) => {
    if (!x) return;
    const p = paCo[i] || {};
    const n = clip(x.name || p.fullName, 120);
    const ph = cleanPhone(x.phone) || cleanPhone(p.phone);
    const em = cleanEmail(x.email) || cleanEmail(p.email);
    if (n || ph || em) out.push({ role: 'cotenant', name: n, phone: ph, email: em });
  });
  return out;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'private, no-store');

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req).catch(() => null);
  const raw = b && Array.isArray(b.contractIds) ? b.contractIds : null;
  if (!raw) return res.status(400).json({ ok: false, error: 'contractIds_required' });
  const ids = [...new Set(raw.map(x => String(x == null ? '' : x).trim()).filter(x => ID_RE.test(x)))];
  if (ids.length > MAX_IDS) return res.status(400).json({ ok: false, error: 'too_many_ids', max: MAX_IDS });
  if (!ids.length) return res.status(200).json({ ok: true, contacts: {}, denied: 0, missing: 0 });

  const isAdmin = auth.profile.role === 'admin';
  try {
    const cMap = await fsGetMany(ids.map(id => 'contracts/' + id));
    let missing = 0, denied = 0;
    let kept = [];
    for (const id of ids) {
      const c = cMap.get('contracts/' + id);
      if (!c) { missing++; continue; }
      kept.push(c);
    }
    if (!isAdmin) {
      const propIds = [...new Set(kept.map(c => c.propertyId).filter(p => typeof p === 'string' && ID_RE.test(p)))];
      const pMap = propIds.length ? await fsGetMany(propIds.map(p => 'properties/' + p)) : new Map();
      const mine = kept.filter(c => {
        const p = c.propertyId ? pMap.get('properties/' + c.propertyId) : null;
        return !!(p && p.ownerId && p.ownerId === auth.uid);
      });
      denied = kept.length - mine.length;
      kept = mine;
    }

    const userIds = [...new Set(kept.map(c => c.tenantId).filter(x => typeof x === 'string' && ID_RE.test(x)))];
    const uMap = userIds.length ? await fsGetMany(userIds.map(u => 'users/' + u)) : new Map();
    // La proposta si legge SOLO dove il contratto e il profilo non bastano.
    const needPa = kept.filter(c => {
      const pa = typeof c.preAgreementId === 'string' && ID_RE.test(c.preAgreementId);
      if (!pa) return false;
      const got = contactsOf(c, uMap.get('users/' + c.tenantId), null);
      return !got.length || got.some(x => !x.phone && !x.email);
    });
    const paMap = needPa.length ? await fsGetMany(needPa.map(c => 'preAgreements/' + c.preAgreementId)) : new Map();

    const contacts = {};
    for (const c of kept) {
      contacts[c.id] = contactsOf(c, uMap.get('users/' + c.tenantId),
        c.preAgreementId ? paMap.get('preAgreements/' + c.preAgreementId) : null);
    }
    return res.status(200).json({ ok: true, contacts, denied, missing });
  } catch (e) {
    console.error('[owners/contatti]', e && e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
}
