// api/sign/links.js
// I LINK DI FIRMA, A CHI SPETTANO (1/10/2026).
//
// I token di firma non stanno più sul contratto (api/sign/_tokens.js): il
// browser non li legge da Firestore, li chiede qui. La porta restituisce
// SOLO la credenziale di chi chiede:
//   · admin                     → conduttore + locatore (+ co-conduttori)
//   · owner/landlord proprietario dell'immobile → il SUO link (locatore)
//   · tenant del contratto      → il SUO link (conduttore)
// Mai il link dell'altra parte: è esattamente la firma falsa che i token
// sul contratto rendevano possibile. Un token mancante si conia qui (solo
// per chi non ha firmato e solo per i ruoli che la risposta restituisce).
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>
// Body:     { contractId }
//           { op:'migrate', dryRun? }   — admin: sposta i token ancora in
//           chiaro sui contratti nel deposito (lo fa anche il reminder-cron
//           ogni ora; questo è il bottone per non aspettare).
// Response: { ok, scope:'admin'|'landlord'|'tenant', tenant, landlord,
//             tenantSigned, landlordSigned, cosign?: [{index,name,url,signed}] }
//           403 not_your_contract · 404 not_found

import { fsGet, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { ensureSignTokens, migrateLegacySignTokens, signUrl } from './_tokens.js';
import { cosignRef } from '../magic-sign/_shared.js';

const BASE = 'https://www.boomrome.com';

export function scopeFor(auth, contract, property) {
  const role = auth && auth.profile && auth.profile.role;
  if (role === 'admin') return { scope: 'admin', roles: ['tenant', 'landlord'] };
  if ((role === 'landlord' || role === 'owner') && property && property.ownerId && property.ownerId === auth.uid) {
    return { scope: 'landlord', roles: ['landlord'] };
  }
  if (role === 'tenant' && contract && contract.tenantId && contract.tenantId === auth.uid) {
    return { scope: 'tenant', roles: ['tenant'] };
  }
  return null;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord', 'tenant']);
  if (!auth) return;
  const b = (await readJson(req).catch(() => ({}))) || {};

  if (b.op === 'migrate') {
    if (auth.profile.role !== 'admin') return res.status(403).json({ ok: false, error: 'admin_only' });
    try {
      const report = await migrateLegacySignTokens({ dryRun: b.dryRun === true, limit: 200, maxMs: 8000 });
      if (!report.dryRun) await logActivity('sign_tokens_migrated', 'contract', report, auth.email || auth.uid).catch(() => {});
      return res.status(200).json({ ok: true, ...report });
    } catch (e) {
      console.error('[sign/links] migrate:', e.message);
      return res.status(500).json({ ok: false, error: 'migrate_failed' });
    }
  }

  const contractId = String(b.contractId || '').trim().slice(0, 80);
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });
  let property = null;
  if (contract.propertyId) { try { property = await fsGet('properties/' + contract.propertyId); } catch (_) {} }

  const sc = scopeFor(auth, contract, property);
  if (!sc) return res.status(403).json({ ok: false, error: 'not_your_contract' });

  let toks;
  try { toks = await ensureSignTokens(contractId, contract, { mint: sc.roles }); }
  catch (e) {
    console.error('[sign/links] tokens:', e.message);
    return res.status(500).json({ ok: false, error: 'sign_tokens_unavailable' });
  }
  const out = {
    ok: true, scope: sc.scope,
    tenant: sc.roles.includes('tenant') ? signUrl(toks.tenant) : null,
    landlord: sc.roles.includes('landlord') ? signUrl(toks.landlord) : null,
    tenantSigned: !!contract.tenantSignature,
    landlordSigned: !!contract.landlordSignature,
  };
  if (sc.scope === 'admin') {
    const co = (Array.isArray(contract.coTenants) ? contract.coTenants : [])
      .map((x, i) => (x && x.name ? { index: i, name: String(x.name).slice(0, 60), url: `${BASE}/sign?sign=${encodeURIComponent(cosignRef(contractId, i))}`, signed: !!x.signature } : null))
      .filter(Boolean);
    if (co.length) out.cosign = co;
  }
  return res.status(200).json(out);
}
