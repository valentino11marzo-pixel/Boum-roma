// api/properties/dossier.js
// The property DOSSIER — the four documents ARPE asks for with every
// asseverazione, uploaded ONCE per property and inherited by every future
// contract on it: visura catastale, planimetria, APE, delega ARPE firmata.
// Backs the console's "📦 Fascicolo ARPE" modal (upload slots + checklist);
// files go to Storage under admin creds (property-docs/<propId>/ —
// admin-only per storage.rules) and the tokenized URL is stored on
// properties/{id}.dossier.<slot>.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin, or the owner
//           of THAT property — also from /owner, only where the slot is empty)
// Body:     { propertyId, slot('visura'|'planimetria'|'ape'|'delega'),
//             base64, name?, contentType? }
// Response: { ok, slot, url } — url is admin-side only (the caller is admin)

import { getAdminToken, fsGet, fsPatch, fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { ownsProperty } from '../owners/_owner.js';

const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const MAX_BYTES = 15 * 1024 * 1024;
const SLOTS = ['visura', 'planimetria', 'ape', 'delega'];

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const propertyId = String((body || {}).propertyId || '').trim().slice(0, 80);
  const slot = String((body || {}).slot || '').trim();
  if (!propertyId) return res.status(400).json({ ok: false, error: 'property_required' });
  if (!SLOTS.includes(slot)) return res.status(400).json({ ok: false, error: 'bad_slot' });

  let buf;
  try { buf = Buffer.from(String(body.base64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64'); }
  catch { return res.status(400).json({ ok: false, error: 'bad_base64' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'empty' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'too_large' });
  const contentType = /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(String(body.contentType || ''))
    ? body.contentType : 'application/pdf';

  try {
    const prop = await fsGet('properties/' + propertyId);
    if (!prop) return res.status(404).json({ ok: false, error: 'property_not_found' });
    // Object-level authorization: a landlord/owner can only touch THEIR
    // property's dossier. «Suo» = ownerId è il suo uid OPPURE la scheda
    // landlords legata a lui (api/owners/_owner.js) — l'area proprietario
    // carica da qui, e metà degli immobili è intestata a una scheda CRM.
    if (!(await ownsProperty(auth, prop))) {
      return res.status(403).json({ ok: false, error: 'not_your_property' });
    }
    // Un documento già caricato dall'operatore non si sostituisce dall'area
    // proprietario: il fascicolo ARPE è partito con QUELLO. Si aggiunge
    // solo dove manca (l'operatore può sempre sostituire).
    if (auth.profile.role !== 'admin' && prop.dossier && prop.dossier[slot] && prop.dossier[slot].url) {
      return res.status(409).json({ ok: false, error: 'slot_filled' });
    }

    const safeName = String(body.name || slot).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const path = `property-docs/${propertyId}/${slot}_${Date.now()}_${safeName}`;
    const admin = await getAdminToken();
    const up = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': contentType }, body: buf }
    );
    if (!up.ok) {
      console.error('[properties/dossier] storage', up.status, (await up.text()).slice(0, 200));
      return res.status(502).json({ ok: false, error: 'storage_failed' });
    }
    const meta = await up.json().catch(() => ({}));
    const dlToken = String(meta.downloadTokens || '').split(',')[0];
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media${dlToken ? '&token=' + dlToken : ''}`;

    const dossier = { ...(prop.dossier || {}) };
    dossier[slot] = { url, name: safeName, contentType, bytes: buf.length, at: new Date().toISOString(), by: auth.email || auth.uid };
    await fsPatch('properties/' + propertyId, { dossier });
    await logActivity('property_dossier_uploaded', 'property', { propertyId, slot, name: safeName }, auth.email || 'admin');
    // Il proprietario che carica da solo è una notizia per l'operatore (→
    // Telegram entro un minuto via notify-pending): il pezzo che mancava al
    // fascicolo è arrivato, senza che nessuno l'abbia rincorso.
    if (auth.profile.role !== 'admin') {
      await fsCreate('agentNotifications', {
        type: 'owner.document_uploaded', priority: 'normal', status: 'pending',
        title: `📎 Il proprietario ha caricato: ${slot}`,
        body: `${prop.address || prop.name || propertyId} — ${safeName}`,
        propertyId, slot, url, by: auth.email || auth.uid, createdAt: new Date(),
      }).catch((e) => console.warn('[properties/dossier] notify:', e.message));
    }

    return res.status(200).json({ ok: true, slot, url });
  } catch (e) {
    console.error('[properties/dossier] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'upload_failed' });
  }
}
