// api/owners/vault.js — L'AREA PROPRIETARIO: tutto quello che il proprietario
// ha con BOOM, in una risposta sola.
//
// Method:  GET | POST
// Auth:    Bearer <firebase-id-token> — proprietario (landlord) → la SUA
//          area; admin → ?ownerId=<users uid | landlords id> = «vedi come la
//          vede lui» (anteprima: nessuna scrittura, nessun timbro di visita).
// Returns: { ok, owner:{name,email}, preview, vault } — vault è l'uscita di
//          js/owner-vault-engine.js (buildVault): immobili, contratto, soldi,
//          scadenze, storia, cosa manca, documenti in cartelle, rendiconti.
//
// Perché server-side e non Firestore nel browser (come /casa): le rules
// sanno solo `ownerId == auth.uid`, ma metà degli immobili è intestata a una
// scheda `landlords` (api/owners/_owner.js), e i documenti vivono in posti
// che il proprietario NON deve leggere per intero — il contratto porta i
// token di firma di ENTRAMBE le parti. Qui si legge con le credenziali admin
// e si consegna solo ciò che il motore lascia passare.

import { fsGet, fsList, fsPatch } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import OWNER from '../../js/owner-vault-engine.js';
import { ownerKeys, ownerProperties, OWNER_ROLES } from './_owner.js';
import { tenantSideComplete } from '../magic-sign/_shared.js';
import { schedaUrl } from '../profile/_scheda.js';

const MAX_PROPS = 40;
const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

// Le chiavi da mostrare: le proprie, o (admin) quelle del proprietario scelto.
export async function resolveOwner(auth, ownerId) {
  if (auth.profile.role !== 'admin') {
    return { keys: await ownerKeys(auth.uid, auth.profile), uid: auth.uid, profile: auth.profile, preview: false };
  }
  const oid = clip(ownerId, 80);
  if (!oid) return null;
  const keys = new Set([oid]);
  let uid = null, profile = null;
  const [u, l] = await Promise.all([fsGet('users/' + oid).catch(() => null), fsGet('landlords/' + oid).catch(() => null)]);
  if (u && OWNER_ROLES.has(String(u.role || ''))) { uid = oid; profile = u; }
  else if (l && l.userId) { uid = String(l.userId); profile = await fsGet('users/' + uid).catch(() => null); }
  if (uid && profile) for (const k of await ownerKeys(uid, profile)) keys.add(k);
  if (!profile && l) profile = { name: l.name || [l.firstName, l.lastName].filter(Boolean).join(' '), email: l.email || '' };
  return { keys, uid, profile: profile || {}, preview: true };
}

const byField = (col, field, value, limit) =>
  fsList(col, { filter: { field, op: 'EQUAL', value }, limit }).catch(() => []);

export async function gatherVault(keys, { now } = {}) {
  const props = (await ownerProperties(keys)).slice(0, MAX_PROPS);
  const perProp = await Promise.all(props.map(async (p) => {
    const [contracts, payments, documents, maintenance] = await Promise.all([
      byField('contracts', 'propertyId', p.id, 30),
      byField('payments', 'propertyId', p.id, 400),
      byField('documents', 'propertyId', p.id, 200),
      byField('maintenance', 'propertyId', p.id, 60),
    ]);
    // Le rate generate senza propertyId (contratti storici) si agganciano
    // per contratto: il rendiconto fa lo stesso.
    const seen = new Set(payments.map((x) => x.id));
    const extra = await Promise.all(contracts.map((c) => byField('payments', 'contractId', c.id, 200)));
    for (const list of extra) for (const x of list) if (!seen.has(x.id)) { seen.add(x.id); payments.push(x); }
    return { contracts, payments, documents, maintenance };
  }));
  const rend = await Promise.all([...keys].map((k) => byField('rendiconti', 'ownerId', k, 60)));

  const flat = (k) => perProp.flatMap((x) => x[k]);
  const contracts = flat('contracts');
  // Il SOLO link di firma che esce è quello del proprietario, e solo quando
  // tocca a lui: lato conduttori completo (principale + co-conduttori).
  const signable = {}, schedaUrls = {};
  for (const c of contracts) {
    if (!c || !c.id || OWNER.landlordSigned(c)) continue;
    if (c.tenantSignature && tenantSideComplete(c)) signable[c.id] = true;
    schedaUrls[c.id] = schedaUrl(c.id, 'landlord');
  }
  return OWNER.buildVault({
    now: now || new Date(),
    properties: props, contracts,
    payments: flat('payments'), documents: flat('documents'), maintenance: flat('maintenance'),
    rendiconti: rend.flat(), signable, schedaUrls,
  });
}

export default async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'landlord', 'owner']);
  if (!auth) return;
  const ownerId = (req.query && req.query.ownerId) || (req.body && typeof req.body === 'object' && req.body.ownerId) || '';

  let who;
  try { who = await resolveOwner(auth, ownerId); }
  catch (e) { console.error('[owners/vault] resolve', e.message); return res.status(500).json({ ok: false, error: 'resolve_failed' }); }
  if (!who) return res.status(400).json({ ok: false, error: 'ownerId_required' });

  let vault;
  try { vault = await gatherVault(who.keys); }
  catch (e) { console.error('[owners/vault] gather', e.message); return res.status(500).json({ ok: false, error: 'vault_failed' }); }

  // La visita del proprietario è un'informazione per l'operatore (chi guarda
  // davvero la sua area). Attesa, ma non blocca: un timbro fallito non
  // toglie l'area a nessuno. Mai in anteprima admin.
  if (!who.preview && auth.uid) {
    await fsPatch('users/' + auth.uid, { ownerLastSeenAt: new Date().toISOString() }).catch((e) => console.warn('[owners/vault] seen', e.message));
  }
  const p = who.profile || {};
  return res.status(200).json({
    ok: true, preview: who.preview,
    owner: { name: clip(p.name, 120), email: clip(p.email, 200), activated: !!p.ownerActivatedAt || !p.ownerSetup },
    vault,
  });
}
