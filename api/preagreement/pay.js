// api/preagreement/pay.js
// Public — a client who accepted their pre-agreement but abandoned Stripe
// (closed the tab, card declined, thought about it overnight) can resume
// payment from the SAME document link. The accepted page shows a
// "Complete your reservation" button that calls this; the 24h reminder
// email points at the same flow.
//
// Method: POST   Body: { token }
// Response: { ok, checkoutUrl } | 400/404/409/410

import { openProposalCheckout } from './_payment-session.js';
import { fsList, readJson } from '../homie/_lib.js';
import { paidOnRecord } from './_state.js';

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
    const { id, ...pa } = hit;   // fsList returns flat rows: {id, ...fields}

    if (pa.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });
    // Stessa regola di submit: conta il FATTO. Un documento incassato ma con
    // lo status rimasto indietro (webhook in ritardo, o degradato da un
    // secondo invio) non deve mai riaprire un pagamento già ricevuto — sono
    // soldi presi due volte e un rimborso da fare.
    if (paidOnRecord(pa)) return res.status(409).json({ ok: false, error: 'already_paid' });
    if (pa.status !== 'accepted') return res.status(409).json({ ok: false, error: 'not_accepted' });

    const result = await openProposalCheckout({ id, token });
    return res.status(result.code).json({ ok: result.code === 200, ...result });
  } catch (e) {
    console.error('[preagreement/pay] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'pay_failed' });
  }
}
