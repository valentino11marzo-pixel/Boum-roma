// api/viewings/pass.js — the client's boarding pass, served for real.
//
// Why this exists: pass-delivery.html used to POST hand-assembled data from
// URL query params to /api/generate-pass and then navigate to a blob: URL.
// Two things were broken by design:
//   · the pass carried whatever was in the link (usually nothing) instead of
//     the actual viewing — no address, no coordinates, no time;
//   · iOS Safari does not reliably hand a blob: URL to Wallet. A .pkpass must
//     arrive from a real URL with Content-Type application/vnd.apple.pkpass.
//
// So: one public GET that loads the LIVE viewing, signs the pass and streams
// it with the headers Wallet expects. The viewing id is an unguessable
// Firestore id and the pass only contains what the client already received by
// email about their own appointment — same posture as the .ics endpoint.
//
// GET /api/viewings/pass?id=<viewingId>          → .pkpass (opens in Wallet)
// GET /api/viewings/pass?id=<viewingId>&meta=1   → JSON for the page mockup

import { loadPassData } from '../_passkit.js';
import { buildAndSign } from '../generate-pass.js';
import { fsPatch } from '../homie/_lib.js';
import { isVideo, startOf, fmtWhen } from './_lib.js';

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

  let data;
  try {
    data = await loadPassData('viewing', id);
  } catch (e) {
    const missing = String(e.message || '').endsWith('_not_found');
    return res.status(missing ? 404 : 500).json({ ok: false, error: e.message || 'internal' });
  }

  // Metadata for the page's visual mockup — never the signed bytes.
  if (String((req.query && req.query.meta) || '') === '1') {
    const s = startOf({ confirmedDateTime: data.confirmedDateISO });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      clientName: data.clientName || '',
      address: data.propertyAddress || '',
      when: data.confirmedDateISO || null,
      whenLabel: s ? fmtWhen(s, 'en') : '',
      mode: data.mode || 'person',
      videoUrl: data.videoUrl || null,
      durationMinutes: data.durationMinutes || 30,
      meetingPoint: data.meetingPoint || '',
      voided: !!data.isVoided,
    });
  }

  if (!data.confirmedDateISO) return res.status(409).json({ ok: false, error: 'not_scheduled_yet' });

  try {
    const { buffer, passJson } = buildAndSign('viewing', data);
    // track it so the Wallet web service can push updates later
    try {
      await fsPatch(`passMeta/${passJson.serialNumber}`, {
        type: 'viewing', entityId: id, serial: passJson.serialNumber,
        updatedAt: new Date(), lastBuiltAt: new Date(),
      });
    } catch { /* tracking is best-effort */ }

    // These exact headers are what makes iOS offer "Add to Apple Wallet".
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="boom-viewing-${id.slice(0, 8)}.pkpass"`);
    res.setHeader('Content-Length', Buffer.byteLength(buffer));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('[viewings/pass]', e.message);
    return res.status(500).json({ ok: false, error: 'sign_failed' });
  }
}
