// api/portal/action.js
// Public endpoint that persists a PFS client's portal actions on their behalf,
// under admin credentials. The client authorizes via their portalAccessCode;
// the server re-derives the client doc from the code (never trusts a caller
// supplied client id) and only mutates that one doc. Every write also feeds the
// admin pipeline: rejections carry a reason, viewings carry a preference, and
// criteria changes refresh the search brief the operator sees in the portal.
//
// Method:    POST
// URL:       /api/portal/action
// Body:      { code, action, ...payload }
//   action 'like'           { propertyId }
//   action 'reject'         { propertyId, reason? }
//   action 'undo'           { propertyId }
//   action 'requestViewing' { propertyId, preference? }
//   action 'cancelViewing'  { propertyId }
//   action 'updateCriteria' { criteria:{ minBudget,budget,zone,moveIn,bedrooms,mustHaves,dealBreakers } }
//   action 'message'        { text }
//   action 'setLang'        { lang:'it'|'en' }
//   action 'ping'           {}
// Response:  200 { ok:true, client:{...} }

import { readJson, fsPatch } from '../homie/_lib.js';
import { setCors, findClientByCode, mapClientForPortal, journeyOf } from './_shared.js';
import { notifyOperator, notifyClient } from './_notify.js';

const clamp = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body) return res.status(400).json({ ok: false, error: 'invalid_json' });

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!code || code.length < 4) return res.status(400).json({ ok: false, error: 'missing_code' });

  let c;
  try { c = await findClientByCode(code); }
  catch (e) {
    console.error('[portal/action] lookup failed:', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
  if (!c) return res.status(404).json({ ok: false, error: 'invalid_code' });

  const patch = {};
  const props = Array.isArray(c.portalProperties) ? c.portalProperties.map(p => ({ ...p })) : [];
  const activity = Array.isArray(c.portalActivity) ? c.portalActivity.slice() : [];
  const nowIso = new Date().toISOString();
  const findP = id => props.find(p => p && p.id === id);
  let opNotify = null; // set for actions that warrant a real-time operator alert

  switch (action) {
    case 'like':
    case 'reject':
    case 'undo': {
      const p = findP(body.propertyId);
      if (!p) return res.status(404).json({ ok: false, error: 'property_not_found' });
      if (action === 'like') { p.clientLiked = true; p.clientRejected = false; p.rejectReason = ''; }
      else if (action === 'reject') { p.clientRejected = true; p.clientLiked = false; p.viewingRequested = false; p.rejectReason = clamp(body.reason, 120); }
      else { p.clientLiked = false; p.clientRejected = false; p.rejectReason = ''; p.viewingRequested = false; }
      p.clientActionAt = nowIso;
      patch.portalProperties = props;
      activity.push({ type: action, propertyId: p.id, reason: p.rejectReason || undefined, timestamp: nowIso });
      break;
    }
    case 'requestViewing':
    case 'cancelViewing': {
      const p = findP(body.propertyId);
      if (!p) return res.status(404).json({ ok: false, error: 'property_not_found' });
      const on = action === 'requestViewing';
      p.viewingRequested = on;
      p.viewingPreference = on ? clamp(body.preference, 200) : '';
      if (on) {
        p.clientLiked = true; p.clientRejected = false;
        // Reflect the conversion in the client-facing journey (never backwards):
        // requesting a viewing moves them into the 'viewing' act.
        if (journeyOf(c).index < 3) patch.portalStage = 'viewing';
        opNotify = { kind: 'viewing', property: p, preference: p.viewingPreference };
      }
      p.clientActionAt = nowIso;
      patch.portalProperties = props;
      activity.push({ type: action, propertyId: p.id, preference: p.viewingPreference || undefined, timestamp: nowIso });
      break;
    }
    case 'updateCriteria': {
      const cr = body.criteria || {};
      const toInt = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 && n < 100000 ? n : undefined; };
      if (cr.minBudget !== undefined) { const v = toInt(cr.minBudget); if (v !== undefined) patch.minBudget = v; }
      if (cr.budget !== undefined) { const v = toInt(cr.budget); if (v !== undefined) patch.budget = v; }
      if (cr.zone !== undefined) patch.zone = clamp(cr.zone, 160);
      if (cr.moveIn !== undefined) patch.moveIn = clamp(cr.moveIn, 30);
      if (cr.bedrooms !== undefined) patch.bedrooms = clamp(cr.bedrooms, 20);
      if (cr.mustHaves !== undefined) patch.mustHaves = clamp(cr.mustHaves, 300);
      if (cr.dealBreakers !== undefined) patch.dealBreakers = clamp(cr.dealBreakers, 300);
      activity.push({ type: 'criteria_updated', timestamp: nowIso });
      break;
    }
    case 'message': {
      const text = clamp(body.text, 1000);
      if (!text) return res.status(400).json({ ok: false, error: 'empty_message' });
      const messages = Array.isArray(c.portalMessages) ? c.portalMessages.slice() : [];
      messages.push({ from: 'client', text, timestamp: nowIso });
      patch.portalMessages = messages.slice(-100);
      activity.push({ type: 'message', timestamp: nowIso });
      opNotify = { kind: 'message', text };
      break;
    }
    case 'setLang': {
      patch.portalLang = body.lang === 'en' ? 'en' : 'it';
      break;
    }
    case 'ping':
      break;
    default:
      return res.status(400).json({ ok: false, error: 'unknown_action' });
  }

  if (action !== 'setLang' && action !== 'ping') patch.portalActivity = activity.slice(-200);
  patch.portalLastActive = new Date();

  try { await fsPatch('pfsClients/' + c.id, patch); }
  catch (e) {
    console.error('[portal/action] patch failed:', e.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }

  // Real-time operator alert + client confirmation (best-effort; never blocks).
  if (opNotify) {
    try { await notifyOperator({ client: c, ...opNotify }); }
    catch (e) { console.error('[portal/action] op-notify failed:', e.message); }
    if (opNotify.kind === 'viewing') {
      try { await notifyClient({ client: c, ...opNotify }); }
      catch (e) { console.error('[portal/action] client-notify failed:', e.message); }
    }
  }

  // Return fresh state so the UI re-renders without a second round-trip.
  return res.status(200).json({ ok: true, client: mapClientForPortal({ ...c, ...patch }) });
}
