// api/owners/invite.js — la console dell'operatore sull'area proprietario.
//
// Method: POST · Auth: Bearer admin (solo admin: crea account e spedisce).
// Body:
//   { op:'status', propertyId | landlordId | userId }
//       → chi è il proprietario, se ha l'account, se l'ha attivato, quando
//         è stato invitato e quando ha aperto l'area l'ultima volta.
//   { op:'invite', propertyId | landlordId | userId, email?, send? }
//       → crea/ritrova l'account e manda l'invito (link di attivazione
//         monouso, o il link all'area se è già attivo). Risponde anche col
//         link, così l'operatore può girarlo su WhatsApp.
//   { op:'backfill', dry?, limit? }
//       → tutti i proprietari che hanno un contratto FIRMATO e un'email, e
//         che non hanno ancora l'area (o l'invito è vecchio di 30 giorni e
//         mai attivato): li invita. `dry:true` = solo l'elenco. Tetto per
//         giro (default 10) e budget di tempo: si ripete finché serve.

import { fsGet, fsList, readJson } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import OWNER from '../../js/owner-vault-engine.js';
import { inviteOwner } from './_invite.js';
import { ownerContact, normEmail, OWNER_ROLES } from './_owner.js';

const clip = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
const REINVITE_DAYS = 30;

async function accountFor(contact) {
  const tryIds = [contact.userId, contact.ownerId].filter(Boolean);
  for (const id of tryIds) {
    const u = await fsGet('users/' + id).catch(() => null);
    if (u && OWNER_ROLES.has(String(u.role || ''))) return { uid: id, ...u };
  }
  if (contact.email) {
    const rows = await fsList('users', { filter: { field: 'email', op: 'EQUAL', value: contact.email }, limit: 3 }).catch(() => []);
    const u = rows.find((r) => OWNER_ROLES.has(String(r.role || '')));
    if (u) return { uid: u.id, ...u };
  }
  return null;
}
const accountView = (a) => a ? {
  uid: a.uid, activated: !!a.ownerActivatedAt || !!a.ownerLastSeenAt,
  pendingActivation: !!a.ownerSetup, invitedAt: a.ownerInvitedAt || null,
  inviteCount: Number(a.ownerInviteCount) || 0, lastSeenAt: a.ownerLastSeenAt || null,
} : null;

export default async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  let b;
  try { b = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  b = b || {};
  const op = String(b.op || 'status');
  const target = { propertyId: clip(b.propertyId), landlordId: clip(b.landlordId), userId: clip(b.userId) };

  try {
    if (op === 'status') {
      let contact;
      if (target.propertyId) {
        const prop = await fsGet('properties/' + target.propertyId).catch(() => null);
        if (!prop) return res.status(404).json({ ok: false, error: 'property_not_found' });
        const cs = await fsList('contracts', { filter: { field: 'propertyId', op: 'EQUAL', value: target.propertyId }, limit: 10 }).catch(() => []);
        contact = await ownerContact(prop, cs.find((c) => c.landlordEmail) || cs[0]);
      } else if (target.landlordId) {
        const l = await fsGet('landlords/' + target.landlordId).catch(() => null);
        if (!l) return res.status(404).json({ ok: false, error: 'landlord_not_found' });
        contact = { email: normEmail(l.email), name: l.name || '', userId: l.userId || null, ownerId: target.landlordId, landlordId: target.landlordId };
      } else if (target.userId) {
        const u = await fsGet('users/' + target.userId).catch(() => null);
        if (!u) return res.status(404).json({ ok: false, error: 'user_not_found' });
        contact = { email: normEmail(u.email), name: u.name || '', userId: target.userId, ownerId: target.userId };
      } else return res.status(400).json({ ok: false, error: 'target_required' });
      const acct = await accountFor(contact);
      return res.status(200).json({ ok: true, contact: { email: contact.email, name: contact.name, ownerId: contact.ownerId || null }, account: accountView(acct), previewId: contact.ownerId || (acct && acct.uid) || null });
    }

    if (op === 'invite') {
      if (!target.propertyId && !target.landlordId && !target.userId) return res.status(400).json({ ok: false, error: 'target_required' });
      const out = await inviteOwner({ ...target, email: clip(b.email, 200) || undefined, send: b.send !== false, via: 'owner-invite:' + (auth.email || auth.uid) });
      return res.status(out.ok ? 200 : (out.error && /not_found/.test(out.error) ? 404 : 409)).json(out);
    }

    if (op === 'backfill') {
      const dry = b.dry !== false;
      const limit = Math.min(25, Math.max(1, Number(b.limit) || 10));
      const started = Date.now();
      const props = await fsList('properties', { limit: 400 });
      const byOwner = new Map();
      for (const p of props) { const k = clip(p.ownerId); if (k && !byOwner.has(k)) byOwner.set(k, p); }
      const out = { candidates: [], invited: [], skipped: [] };
      for (const [ownerId, p] of byOwner) {
        if (Date.now() - started > 40_000) { out.truncated = true; break; }
        const cs = await fsList('contracts', { filter: { field: 'propertyId', op: 'EQUAL', value: p.id }, limit: 20 }).catch(() => []);
        // Solo chi ha davvero un rapporto in corso: un contratto che vincola.
        if (!cs.some((c) => OWNER.binding(c))) { out.skipped.push({ ownerId, reason: 'no_signed_contract' }); continue; }
        const contact = await ownerContact(p, cs.find((c) => c.landlordEmail) || cs[0]);
        if (!contact.email) { out.skipped.push({ ownerId, reason: 'no_email' }); continue; }
        const acct = await accountFor({ ...contact, ownerId });
        if (acct && (acct.ownerActivatedAt || acct.ownerLastSeenAt)) { out.skipped.push({ ownerId, reason: 'already_active' }); continue; }
        if (acct && acct.ownerInvitedAt && (Date.now() - Date.parse(acct.ownerInvitedAt)) < REINVITE_DAYS * 86400000) { out.skipped.push({ ownerId, reason: 'recently_invited' }); continue; }
        out.candidates.push({ ownerId, propertyId: p.id, email: contact.email, name: contact.name });
        if (dry || out.invited.length >= limit) continue;
        const r = await inviteOwner({ propertyId: p.id, via: 'owner-backfill:' + (auth.email || auth.uid) });
        (r.ok ? out.invited : out.skipped).push({ ownerId, email: contact.email, status: r.status, reason: r.reason || r.error, emailed: r.emailed });
      }
      return res.status(200).json({ ok: true, dry, ...out });
    }
    return res.status(400).json({ ok: false, error: 'bad_op' });
  } catch (e) {
    console.error('[owners/invite]', op, e.message);
    return res.status(500).json({ ok: false, error: 'invite_failed' });
  }
}
