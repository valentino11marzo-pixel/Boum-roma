// api/homie/wa-outbox.js
// WhatsApp OUTBOX for the Mac-side Homie agent — approved messages go OUT
// automatically instead of waiting for the operator to tap a wa.me link.
//
// Flow: the Commerciale proposes a WhatsApp reply → operator taps Approva in
// the cockpit → executor marks the action executed (the wa.me link stays in
// the result as manual fallback) → Homie polls THIS endpoint every few
// minutes, sends each message with wacli/send_whatsapp.sh, and acks. The
// action doc carries the delivery state (waSentAt / waSendError), so nothing
// is ever sent twice and failures are visible.
//
// Method: POST · Headers: X-Homie-Secret
// Body:  { op:'pull' }                       → { ok, messages:[{actionId, phone, text, leadId}] }
//        { op:'ack', actionId, ok, error? }  → { ok }
//
// Only actions executed in the last 48h qualify — an old backlog must never
// fire a burst of stale messages at real people.

import { fsList, fsPatch, readJson, secretEqual, logActivity } from './_lib.js';

const MAX_AGE_MS = 48 * 3600 * 1000;
const MAX_PER_PULL = 10;

function checkSecret(req, res) {
  const supplied = req.headers['x-homie-secret'] || req.headers['x-wizard-secret'];
  const expected = process.env.HOMIE_SECRET;
  if (!expected) { res.status(500).json({ ok: false, error: 'server_misconfigured' }); return false; }
  if (!secretEqual(String(supplied || ''), expected)) { res.status(401).json({ ok: false, error: 'invalid_secret' }); return false; }
  return true;
}

const wantsWa = a => {
  const ch = String((a.payload && a.payload.channel) || '').toLowerCase();
  return ch === 'whatsapp' || ch === 'both';
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!checkSecret(req, res)) return;

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const op = String((body && body.op) || 'pull');

  try {
    if (op === 'ack') {
      const id = String(body.actionId || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'actionId required' });
      const patch = body.ok
        ? { waSentAt: new Date(), waSentBy: 'homie-wacli', waSendError: null }
        : { waSendError: String(body.error || 'send failed').slice(0, 200), waSendAttemptAt: new Date() };
      await fsPatch(`action_queue/${id}`, patch);
      await logActivity(body.ok ? 'WhatsApp inviato (Homie)' : 'WhatsApp NON inviato (Homie)', 'message',
        { actionId: id, error: body.ok ? null : patch.waSendError }, 'homie');
      return res.status(200).json({ ok: true });
    }

    // pull
    const executed = await fsList('action_queue', {
      filter: { field: 'status', op: 'EQUAL', value: 'executed' },
      limit: 50,
    });
    const now = Date.now();
    const ts = v => (v ? new Date(v).getTime() || 0 : 0);
    const messages = (executed || [])
      .filter(a => wantsWa(a) && !a.waSentAt && !a.waSendError)
      .filter(a => now - ts(a.executedAt) < MAX_AGE_MS)
      .slice(0, MAX_PER_PULL)
      .map(a => ({
        actionId: a.id,
        leadId: a.leadId || null,
        phone: String((a.payload && a.payload.phone) || '').trim(),
        text: String((a.payload && (a.payload.body || a.payload.draft)) || '').slice(0, 2000),
      }))
      .filter(m => m.phone && m.text);
    return res.status(200).json({ ok: true, messages });
  } catch (err) {
    console.error('[homie/wa-outbox]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
