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

import { fsGet, fsGetVersioned, fsCommit, fsList, fsPatch, readJson, secretEqual, logActivity } from './_lib.js';
import { whatsappDeliveryWindow } from './_wa-delivery.js';
import { isPreparedAction, claimSegretariaDelivery, markSegretariaDeliveryBlocked, acknowledgeSegretariaDelivery } from '../segretaria/_delivery-guard.js';
import { runBudget } from '../_budget.js';

const MAX_PER_PULL = 10;
const PAGE_SIZE = 50;
const SCAN_PATH = 'heartbeat/wa-outbox';
const PREPARED_CHECK_MS = 35_000; // Fresh dossier, context and atomic claim must fit before the response reserve.

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
  const budget = runBudget(60_000, 7_000);

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const op = String((body && body.op) || 'pull');

  try {
    if (op === 'ack') {
      const id = String(body.actionId || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'actionId required' });
      const action = await fsGet('action_queue/' + id);
      if (id.startsWith('sgreply_') || isPreparedAction(action)) {
        const result = await acknowledgeSegretariaDelivery({ id, ok: body.ok, error: body.error });
        return res.status(result.code).json({ ok: result.code === 200, ...result });
      }
      const patch = body.ok
        ? { waSentAt: new Date(), waSentBy: 'homie-wacli', waSendError: null }
        : { waSendError: String(body.error || 'send failed').slice(0, 200), waSendAttemptAt: new Date() };
      await fsPatch(`action_queue/${id}`, patch);
      await logActivity(body.ok ? 'WhatsApp inviato (Homie)' : 'WhatsApp NON inviato (Homie)', 'message',
        { actionId: id, error: body.ok ? null : patch.waSendError }, 'homie');
      return res.status(200).json({ ok: true });
    }

    // One bounded page per pull. Persist the inspected prefix before claiming
    // any message: a denied proposal cannot monopolize every subsequent pull.
    // A failed cursor write produces no pickup; a crash after it only postpones
    // untouched candidates until the next sweep, never fabricates a receipt.
    const scan = await fsGetVersioned(SCAN_PATH);
    const afterId = scan?.data.afterId ?? null;
    const executed = await fsList('action_queue', {
      filter: { field: 'status', op: 'EQUAL', value: 'executed' },
      limit: PAGE_SIZE, afterId,
    });
    const now = Date.now();
    const selected = [];
    let preparedSelected = false, inspected = 0;
    for (const a of executed) {
      const pending = wantsWa(a) && !a.waSentAt && !a.waSendError && whatsappDeliveryWindow(a, now) === 'current'
        && (!isPreparedAction(a) || !a.segretaria?.delivery);
      if (!pending) { inspected++; continue; }
      const message = {
        actionId: a.id,
        leadId: a.leadId || null,
        phone: String((a.payload && a.payload.phone) || '').trim(),
        text: String((a.payload && (a.payload.body || a.payload.draft)) || '').slice(0, 2000),
      };
      if (!message.phone || !message.text) { inspected++; continue; }
      if (selected.length >= MAX_PER_PULL || (isPreparedAction(a) &&
          (preparedSelected || !budget.afford(PREPARED_CHECK_MS)))) break;
      selected.push({ action: a, message }); inspected++;
      if (isPreparedAction(a)) preparedSelected = true;
    }
    const next = inspected === executed.length && executed.length < PAGE_SIZE ? null
      : inspected ? executed[inspected - 1].id : afterId;
    try {
      await fsCommit([{ docPath: SCAN_PATH, fields: { afterId: next, checkedAt: new Date(now).toISOString() },
        precondition: scan?.updateTime ? { updateTime: scan.updateTime } : { exists: false } }]);
    } catch (error) {
      if (error?.conflict) return res.status(200).json({ ok: true, messages: [] });
      throw error;
    }
    const messages = [];
    for (const { action: a, message } of selected) {
      if (isPreparedAction(a)) {
        if (!budget.afford(PREPARED_CHECK_MS)) continue;
        const claim = await claimSegretariaDelivery({ id: a.id, action: a, now });
        if (!claim.allowed) {
          await markSegretariaDeliveryBlocked({ id: a.id, reason: claim.error, now });
          continue;
        }
      }
      messages.push(message);
    }
    return res.status(200).json({ ok: true, messages });
  } catch (err) {
    console.error('[homie/wa-outbox]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
