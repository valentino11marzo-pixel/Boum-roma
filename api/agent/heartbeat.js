// api/agent/heartbeat.js — Tool: agent.heartbeat  (background, no Tier)
//
// Called by the Mac-side Homie runtime every ~30s (or whenever a tool call
// completes). Updates the heartbeat/mac doc that cockpit-preview.html already
// listens to → the green/orange/red dot in the top bar.
//
// Body: {
//   status?:        'live' | 'busy' | 'idle'        default 'live'
//   activeTool?:    string                          last tool the agent ran
//   lastEvent?:     string                          short human label
//   queueLen?:      number                          actions Homie is processing
//   model?:         string                          e.g. 'sonnet-4-7'
//   version?:       string                          Mac client version
//   meta?:          object                          free-form
// }

import { fsPatch, guardPost, okJson, errJson } from './_lib.js';

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  try {
    const now = new Date();
    const update = {
      status: body.status || 'live',
      activeTool: body.activeTool || null,
      lastEvent: body.lastEvent || null,
      queueLen: typeof body.queueLen === 'number' ? body.queueLen : null,
      model: body.model || null,
      version: body.version || null,
      meta: body.meta || null,
      // Write BOTH field names: the cockpit's heartbeat listener reads
      // `lastPingAt`; the agent layer's own response uses `lastSeenAt`.
      // Keeping both avoids a silent "always offline" dot on the cockpit.
      lastSeenAt: now,
      lastPingAt: now,
    };
    await fsPatch('heartbeat/mac', update);
    return okJson(res, { ok: true, lastSeenAt: now });
  } catch (e) { return errJson(res, 500, e.message); }
}
