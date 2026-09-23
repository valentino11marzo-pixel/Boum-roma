// Deliberately separate from wa-outbox: no queue scan and no fallback pull.
import { fsGetVersioned, readJson, secretEqual } from './_lib.js';
import { inspectSegretariaDelivery, claimSegretariaDelivery, acknowledgeSegretariaDelivery } from '../segretaria/_delivery-guard.js';
import { SINGLE_PROTOCOL, singleActionMessage, singlePayloadHash, validSingleRequest, validSingleSelection } from './_wa-single-protocol.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const secret = process.env.HOMIE_SECRET, supplied = req.headers?.['x-homie-secret'];
  if (!secret) return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  if (typeof supplied !== 'string' || !secretEqual(supplied, secret))
    return res.status(401).json({ ok: false, error: 'invalid_secret' });
  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!validSingleRequest(body)) return res.status(400).json({ ok: false, error: 'invalid_single_request' });
  const { actionId, op } = body;
  const selection = op === 'inspect' ? null : { protocol: SINGLE_PROTOCOL, revision: body.revision, payloadHash: body.payloadHash };
  try {
    if (op === 'ack') {
      const result = await acknowledgeSegretariaDelivery({ id: actionId, ok: body.ok, error: body.error, expectedSelection: selection });
      if (result.code !== 200) return res.status(result.code).json({ ok: false, error: result.error });
      return res.status(200).json({ ok: true, actionId, ...selection, delivery: result.delivery, cached: result.cached });
    }
    const snapshot = await fsGetVersioned('action_queue/' + actionId), action = snapshot?.data;
    if (!action) return res.status(404).json({ ok: false, error: 'delivery_action_missing' });
    const result = op === 'inspect'
      ? await inspectSegretariaDelivery({ id: actionId, action })
      : await claimSegretariaDelivery({ id: actionId, action, expectedSelection: selection });
    if (!result.allowed) return res.status(result.code).json({ ok: false, error: result.error });
    if (op === 'claim') return res.status(200).json({ ok: true, actionId, ...selection, messages: [result.message] });
    const current = result.queue.data, message = singleActionMessage(actionId, current);
    const inspected = { protocol: SINGLE_PROTOCOL, revision: current.segretaria.proposalRevision,
      payloadHash: message ? singlePayloadHash(message) : '' };
    if (!message || !validSingleSelection(inspected)) return res.status(409).json({ ok: false, error: 'delivery_payload_invalid' });
    return res.status(200).json({ ok: true, actionId, ...inspected });
  } catch {
    // Never echo provider/Firestore exceptions (they can include a document).
    return res.status(503).json({ ok: false, error: 'delivery_unavailable' });
  }
}
