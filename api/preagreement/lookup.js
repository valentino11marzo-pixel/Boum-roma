// api/preagreement/lookup.js
// Public, no login — the client opens /pre-agreement?t=<token> and the page
// resolves the document here. Views are audit-logged onto the doc.
//
// Method: POST   Body: { token }
// Response 200: { ok, id, pa: {status, property, landlord, tenant, lease,
//                money, note, createdAt, acceptedAt?, ref?} }

import { fsList, fsPatch, readJson } from '../homie/_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const b = await readJson(req);
  const token = b && typeof b.token === 'string' ? b.token.trim() : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ ok: false, error: 'bad_token' });

  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    const hit = rows && rows[0];
    if (!hit) return res.status(404).json({ ok: false, error: 'not_found' });
    const { id, ...data } = hit;   // fsList returns flat rows: {id, ...fields}
    if (data.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });

    // audit the view (best-effort)
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const views = Array.isArray(data.views) ? data.views.slice(-49) : [];
    views.push({ at: new Date().toISOString(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 160) });
    fsPatch(`preAgreements/${id}`, { views, status: data.status === 'sent' ? 'viewed' : data.status }).catch(() => {});

    return res.status(200).json({
      ok: true, id,
      pa: {
        status: data.status, property: data.property, landlord: data.landlord,
        tenant: data.tenant, tenants: Array.isArray(data.tenants) ? data.tenants : null,
        lease: data.lease, money: data.money,
        note: data.note || null, createdAt: data.createdAt,
        acceptedAt: data.acceptedAt || null, ref: data.ref || null,
      },
    });
  } catch (e) {
    console.error('[preagreement/lookup] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
}
