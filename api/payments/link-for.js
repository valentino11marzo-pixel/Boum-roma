// api/payments/link-for.js — il portale chiede "dammi il link per questo
// documento". Il token è derivato da un segreto server, quindi il calcolo
// non può stare nel browser: se il segreto arrivasse al client, chiunque
// potrebbe generare link di pagamento per QUALSIASI documento.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord)
// Body:     { kind: 'pay'|'inv', id }
// Response: { ok, url, kind, id }

import { requireRole, setCors } from '../_auth.js';
import { fsGet, readJson } from '../homie/_lib.js';
import { payLink, collectionFor } from './_token.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  const kind = b && typeof b.kind === 'string' ? b.kind.trim() : '';
  const id = b && typeof b.id === 'string' ? b.id.trim().slice(0, 200) : '';
  const collection = collectionFor(kind);
  if (!collection || !id) return res.status(400).json({ ok: false, error: 'kind_and_id_required' });

  // Il documento deve esistere: un link verso il nulla è solo un modo per
  // far sembrare rotto il sistema al cliente che lo apre.
  let doc;
  try { doc = await fsGet(`${collection}/${id}`); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!doc) return res.status(404).json({ ok: false, error: 'not_found' });
  if (doc.status === 'paid') return res.status(409).json({ ok: false, error: 'already_paid' });

  // Un landlord può generare link solo per i propri immobili; l'admin per
  // tutto. (Le fatture restano una faccenda dell'amministrazione.)
  if (auth.profile.role !== 'admin') {
    if (kind === 'inv') return res.status(403).json({ ok: false, error: 'admin_only' });
    let owns = false;
    try {
      const prop = doc.propertyId ? await fsGet(`properties/${doc.propertyId}`) : null;
      owns = !!prop && prop.ownerId === auth.uid;
    } catch (_) {}
    if (!owns) return res.status(403).json({ ok: false, error: 'not_yours' });
  }

  return res.status(200).json({ ok: true, kind, id, url: payLink(kind, id) });
}
