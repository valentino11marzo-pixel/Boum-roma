// api/sign/refinalize.js
// Admin recovery endpoint: re-runs the post-signature engine for a contract
// whose finalize step failed AFTER the signatures were written (obligations /
// FES certificate / magic link / welcome emails missing, finalizedAt unset).
// finalizeContract is idempotent — if finalizedAt is already set this returns
// { ok, skipped:true } and writes nothing.
//
// Auth: admin Firebase ID token (X-Firebase-Token) or X-Homie-Secret.
// Body:  { contractId }
// Reply: { ok, result }

import { fsGet, secretEqual } from '../homie/_lib.js';
import { verifyBrowserAdmin } from '../agent/_lib.js';
import { finalizeContract, dedupeFinalizeDeadlines } from './_finalize.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.boomrome.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-Token, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const hasSecret = secretEqual(req.headers['x-homie-secret'] || '', process.env.HOMIE_SECRET || '');
  let authorized = hasSecret;
  if (!authorized) {
    const u = await verifyBrowserAdmin(req);
    authorized = !!(u && u.admin);
  }
  if (!authorized) return res.status(401).json({ ok: false, error: 'unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const contractId = body && typeof body.contractId === 'string' ? body.contractId.trim() : '';
  if (!contractId) return res.status(400).json({ ok: false, error: 'missing_contractId' });

  try {
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });
    if (contract.signatureStatus !== 'complete') {
      return res.status(409).json({ ok: false, error: 'not_fully_signed', signatureStatus: contract.signatureStatus || 'none' });
    }
    // La bonifica dei doppioni gira SEMPRE, anche a contratto GIÀ
    // finalizzato: la tempesta di retry del 1/09 ha lasciato decine di
    // scadenze doppie e POI il primo giro sano ha scritto finalizedAt — da
    // lì finalizeContract esce subito (skipped) e la passata interna non
    // girerebbe mai. Un tap su 🔄 Rifinalizza le pulisce.
    let dedupeRemoved = 0;
    try { dedupeRemoved = (await dedupeFinalizeDeadlines(contractId)).removed || 0; }
    catch (e) { console.warn('[refinalize] dedupe:', e.message); }
    const result = await finalizeContract(contract);
    return res.status(200).json({ ok: true, result, dedupeRemoved });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'finalize_failed', detail: String((e && e.message) || e) });
  }
}
