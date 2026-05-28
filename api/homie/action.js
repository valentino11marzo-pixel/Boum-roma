// api/homie/action.js
// Inbound webhook called by the Mac-side Homie agent when it has prepared a
// proposed action that needs human approval (or just logging). Writes to
// the `action_queue` Firestore collection — the source of truth for the
// cockpit's Action Queue panel.
//
// ─────────────────────────────────────────────────────────────────────────
// Protocol
// ─────────────────────────────────────────────────────────────────────────
// Method:   POST
// URL:      https://boomrome.com/api/homie/action
// Headers:  Content-Type: application/json
//           X-Homie-Secret: <HOMIE_SECRET>
// Body:     {
//   leadId:        string                                    // required, FK
//   kind:          'reply' | 'schedule_viewing' | 'qualify' |
//                  'archive' | 'note' | 'other'              // required
//   summary:       string                                    // required, ≤200ch
//   tier:          1 | 2                                     // required
//                  // 1=Haiku auto-handle, 2=Sonnet/Opus needs OK
//   confidence:    number                                    // 0..1, required
//   proposedBy:    'homie-vision' | 'homie-decision' |
//                  'homie-tier1' | 'homie-tier2' | string    // required
//   payload?:      object                                    // free-form, kind-specific:
//                  // reply: { channel, draft, recipient }
//                  // schedule_viewing: { proposedSlots: [...], propertyId }
//                  // qualify: { questions: [...] }
//                  // archive: { reason }
//   autoApply?:    boolean                                   // skip approval
//                  // if Homie is confident (tier=1, conf>0.9) it can mark
//                  // the action as 'auto-applied' instead of 'pending'
//   contextHash?:  string                                    // dedup key — if
//                  // the same hash arrives twice we no-op (idempotent
//                  // retries from the Mac bridge are safe)
// }
//
// Response 200:   { ok: true, id: '<docId>' }
// Response 200:   { ok: true, id: '<existing>', dedupHit: true }   // same hash
// Response 400:   { ok: false, error: 'validation', details: [...] }
// Response 401:   { ok: false, error: 'invalid_secret' }
// ─────────────────────────────────────────────────────────────────────────

import { FS_BASE, getAdminToken, fsCreate, requireSecret, readJson } from './_lib.js';

const VALID_KINDS = new Set(['reply', 'schedule_viewing', 'qualify', 'archive', 'note', 'other']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!requireSecret(req, res)) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // ── Validation ──────────────────────────────────────────
  const errors = [];
  if (!body.leadId || typeof body.leadId !== 'string') errors.push('leadId is required (string)');
  if (!body.kind || !VALID_KINDS.has(body.kind)) errors.push(`kind must be one of ${[...VALID_KINDS].join(', ')}`);
  const summary = String(body.summary || '').trim();
  if (!summary) errors.push('summary is required');
  if (summary.length > 240) errors.push('summary must be ≤240 chars');
  if (body.tier !== 1 && body.tier !== 2) errors.push('tier must be 1 or 2');
  if (typeof body.confidence !== 'number' || body.confidence < 0 || body.confidence > 1) {
    errors.push('confidence must be a number in [0,1]');
  }
  if (!body.proposedBy || typeof body.proposedBy !== 'string') errors.push('proposedBy is required (string)');

  if (errors.length) return res.status(400).json({ ok: false, error: 'validation', details: errors });

  // ── Dedup check (optional contextHash) ──────────────────
  if (body.contextHash) {
    try {
      const token = await getAdminToken();
      const queryRes = await fetch(`${FS_BASE}:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'action_queue' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'contextHash' },
                op: 'EQUAL',
                value: { stringValue: body.contextHash },
              },
            },
            limit: 1,
          },
        }),
      });
      const arr = await queryRes.json();
      const existingDoc = Array.isArray(arr) ? arr.find(r => r.document) : null;
      if (existingDoc) {
        const id = existingDoc.document.name.split('/').pop();
        return res.status(200).json({ ok: true, id, dedupHit: true });
      }
    } catch (e) {
      // Dedup check failure is non-fatal — proceed with insert
      console.warn('[homie/action] dedup query failed:', e.message);
    }
  }

  const now = new Date();
  const autoApply = body.autoApply === true && body.tier === 1 && body.confidence >= 0.9;

  const action = {
    leadId: body.leadId,
    kind: body.kind,
    summary,
    tier: body.tier,
    confidence: body.confidence,
    proposedBy: body.proposedBy,
    payload: body.payload || null,
    contextHash: body.contextHash || null,
    status: autoApply ? 'auto-applied' : 'pending',
    autoApplied: autoApply,
    createdAt: now,
    proposedAt: now,
  };

  try {
    const { id } = await fsCreate('action_queue', action);
    return res.status(200).json({ ok: true, id, status: action.status });
  } catch (err) {
    console.error('[homie/action]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
