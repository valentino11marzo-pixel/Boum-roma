// api/concierge-event.js
// Events from the concierge page. Writes to Firestore per the strategy:
//   conversations/{sessionId}  — every event, every session, including declined
//   leads/concierge_{sessionId} — only on real conversions (contact captured,
//                                  intake opened, viewing requested, alert subscribed,
//                                  service engaged, lead hot)
//   viewingRequests/{auto}     — viewing.requested
//   leadAlerts/{auto}          — alert.subscribed
//
// lead.hot also fires an EmailJS admin notification (same template pattern as
// api/notify-viewing-created.js). The page never writes to Firestore directly.

import * as fsdb from './_lib/firestore.js';

export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

const ALLOWED_ORIGINS = new Set([
  'https://boomrome.com',
  'https://www.boomrome.com',
]);

const RATE_MIN_MAX = 30;
const RATE_MIN_WINDOW_MS = 60_000;
const RATE_DAY_MAX = 200;
const RATE_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

const rateMin = new Map();
const rateDay = new Map();

const VALID_EVENTS = new Set([
  'lead.captured',
  'lead.declined',
  'lead.hot',
  'viewing.requested',
  'intake.opened',
  'service.engaged',
  'alert.subscribed',
]);

// ─── HTTP helpers ────────────────────────────────────────────────────────

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRate(map, ip, max, windowMs) {
  const now = Date.now();
  const e = map.get(ip);
  if (!e || now - e.windowStart >= windowMs) {
    map.set(ip, { count: 1, windowStart: now });
    if (map.size > 1000) {
      const cutoff = now - 2 * windowMs;
      for (const [k, v] of map) if (v.windowStart < cutoff) map.delete(k);
    }
    return { allowed: true, count: 1 };
  }
  e.count += 1;
  if (e.count > max) return { allowed: false, count: e.count };
  return { allowed: true, count: e.count };
}

function log(event, extra = {}) {
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'concierge-event', event, ...extra })); } catch {}
}

// ─── Mapping helpers ─────────────────────────────────────────────────────

// Concierge profile (student/corporate/freelance/family/researcher) →
// portal situation (worker/student/other) — preserve original at concierge.profile.
function mapSituation(profile) {
  const p = String(profile || '').toLowerCase();
  if (p === 'student')  return 'student';
  if (p === 'family')   return 'other';
  if (p === 'corporate' || p === 'freelance' || p === 'researcher') return 'worker';
  return '';
}

function deriveNotes(lead, eventType, payload) {
  const parts = [`Concierge ${eventType}.`];
  if (typeof lead?.score === 'number')   parts.push(`Score ${lead.score}/100.`);
  if (lead?.routing)                     parts.push(`Routing: ${lead.routing}.`);
  if (lead?.declined_reason)             parts.push(`Declined: ${lead.declined_reason}.`);
  if (lead?.needs_shield)                parts.push('Needs Shield.');
  if (lead?.is_remote)                   parts.push('Remote/abroad.');
  if (lead?.needs_admin_help)            parts.push('Needs admin help (DAS).');
  if (eventType === 'service.engaged' && payload?.service) parts.push(`Service: ${payload.service}.`);
  return parts.join(' ');
}

function buildLeadDoc({ sessionId, lead, eventType, payload }) {
  const now = new Date();
  const fields = {
    // Mirror the existing intake-form schema (portal.html:2889).
    name:         lead?.name  || '',
    email:        lead?.email || '',
    phone:        lead?.phone || '',
    budget:       typeof lead?.budget_max === 'number' ? lead.budget_max : 0,
    arrivalDate:  '',
    duration:     typeof lead?.duration_months === 'number' ? `${lead.duration_months} months` : '',
    zone:         lead?.zone || '',
    furnished:    '',
    situation:    mapSituation(lead?.profile),
    pets:         'no',
    mustHaves:    '',
    notes:        deriveNotes(lead, eventType, payload),
    source:       'concierge',
    service:      Array.isArray(lead?.services_shown) && lead.services_shown.length
                    ? String(lead.services_shown[0]).toUpperCase()
                    : (eventType === 'service.engaged' && payload?.service ? String(payload.service).toUpperCase() : ''),
    status:       'new',
    intakeForm:   false,
    intakeType:   'concierge',
    submittedAt:  now,
    createdAt:    now,
    // Concierge-specific metadata. Nested map preserves the rich session state.
    concierge: {
      sessionId:        sessionId,
      score:            typeof lead?.score === 'number' ? lead.score : 0,
      routing:          lead?.routing || null,
      declined_reason:  lead?.declined_reason || null,
      profile:          lead?.profile || null,         // original concierge profile (preserved)
      timing:           lead?.timing || null,
      needs_shield:     !!lead?.needs_shield,
      needs_admin_help: !!lead?.needs_admin_help,
      is_remote:        !!lead?.is_remote,
      services_shown:   Array.isArray(lead?.services_shown) ? lead.services_shown : [],
      lastEvent:        eventType,
      lastEventAt:      now,
    },
  };
  // Per-event flags
  if (eventType === 'intake.opened')    fields.concierge.intakeOpenedAt = now;
  if (eventType === 'alert.subscribed') fields.concierge.alertSubscribed = true;
  if (eventType === 'service.engaged')  fields.concierge.serviceEngaged = payload?.service || '';
  if (eventType === 'lead.hot')         fields.concierge.hotAt = now;
  if (eventType === 'viewing.requested')fields.concierge.viewingRequestedAt = now;
  return fields;
}

// ─── Conversation upsert ─────────────────────────────────────────────────

async function upsertConversation({ sessionId, lead, eventType, payload }) {
  const path = `conversations/${sessionId}`;
  const existing = await fsdb.readDoc(path).catch(() => null);
  const now = new Date();
  const events = (existing && Array.isArray(existing.events)) ? existing.events : [];
  events.push({ type: eventType, payload: payload || {}, ts: now.toISOString() });

  const fields = {
    sessionId,
    lead,
    events: events.slice(-60),
    lastEventAt: now,
    score:           typeof lead?.score === 'number' ? lead.score : 0,
    routing:         lead?.routing || null,
    declined_reason: lead?.declined_reason || null,
  };
  if (!existing) {
    fields.startedAt = now;
    fields.status = 'active';
  }
  if (eventType === 'lead.declined') fields.status = 'declined';
  if (eventType === 'lead.hot')      fields.routing = 'hot';
  if (eventType === 'intake.opened') fields.status = 'intake_opened';
  await fsdb.setDoc(path, fields);
}

// ─── Lead upsert (deterministic id by sessionId) ─────────────────────────

async function upsertLead({ sessionId, lead, eventType, payload }) {
  const path = `leads/concierge_${sessionId}`;
  const fields = buildLeadDoc({ sessionId, lead, eventType, payload });
  await fsdb.setDoc(path, fields);
  return path;
}

// ─── Viewing request write (matches existing schema) ─────────────────────

async function writeViewingRequest({ sessionId, lead, payload }) {
  const listing = payload?.listing || {};
  const proposedDate = payload?.proposedDate || tomorrowIso();
  const proposedTime = payload?.proposedTime || '11:00';
  const proposedDateTime = new Date(`${proposedDate}T${proposedTime}:00.000Z`);
  const fields = {
    clientName:        lead?.name  || '',
    clientEmail:       lead?.email || '',
    clientPhone:       lead?.phone || '',
    listingId:         listing.id  || '',
    listingName:       listing.type ? `${listing.type} · ${listing.zone || ''}`.trim() : (listing.zone || 'Concierge viewing'),
    listingZone:       listing.zone  || lead?.zone || '',
    listingPrice:      typeof listing.price === 'number' ? listing.price : 0,
    proposedDate,
    proposedTime,
    proposedDateTime:  proposedDateTime.toISOString(),
    status:            'requested',
    reminder3hSent:    false,
    reminder30mSent:   false,
    passSent:          false,
    notes:             'Created via concierge.',
    agentEmail:        'valentino@boomrome.com',
    source:            'concierge',
    concierge:         { sessionId, score: lead?.score || 0 },
    createdAt:         new Date(),
  };
  return fsdb.addDoc('viewingRequests', fields);
}

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Alert subscription write ────────────────────────────────────────────

async function writeAlert({ sessionId, lead, payload }) {
  const fields = {
    email: payload?.email || lead?.email || '',
    criteria: {
      zone:            lead?.zone || '',
      budget_max:      typeof lead?.budget_max === 'number' ? lead.budget_max : 0,
      duration_months: typeof lead?.duration_months === 'number' ? lead.duration_months : 0,
      timing:          lead?.timing || '',
      profile:         lead?.profile || '',
    },
    source: 'concierge',
    concierge: { sessionId, score: lead?.score || 0 },
    status: 'active',
    createdAt: new Date(),
  };
  return fsdb.addDoc('leadAlerts', fields);
}

// ─── Lead.hot — admin EmailJS notification (same pattern as notify-viewing-created.js)

async function fireHotEmail({ sessionId, lead }) {
  const subject = `🔥 [BOOM] HOT concierge lead — ${(lead?.name || lead?.zone || 'unnamed')} · score ${lead?.score || '?'}/100`;
  const body = JSON.stringify({
    service_id: 'service_74n80th',
    template_id: 'boom_notification',
    user_id: 'dnMxbtS2qDm_o7SHE',
    accessToken: process.env.EMAILJS_PRIVATE_KEY || undefined,
    template_params: {
      to_email: 'valentino@boom-rome.com',
      from_name: 'BOOM Concierge',
      reply_to: lead?.email || 'noreply@boomrome.com',
      heading: '🔥 Hot concierge lead',
      subheading: lead?.name || lead?.zone || 'unnamed',
      name: 'Valentino',
      intro: `Score ${lead?.score || '?'}/100 · routing HOT`,
      card_title: 'CONCIERGE LEAD',
      card_color: '#D4AF37',
      r1_icon: '👤', r1_label: 'Name',    r1_value: lead?.name || '—',
      r2_icon: '📧', r2_label: 'Contact', r2_value: `${lead?.email || '—'} / ${lead?.phone || '—'}`,
      r3_icon: '💰', r3_label: 'Search',  r3_value: `€${lead?.budget_max ?? '?'}/mo · ${lead?.zone || '?'} · ${lead?.duration_months ?? '?'}mo · ${lead?.timing || '?'}`,
      r4_icon: '🎯', r4_label: 'Profile', r4_value: `${lead?.profile || '?'}${lead?.is_remote ? ' (remote)' : ''}${lead?.needs_shield ? ' · needs Shield' : ''}${lead?.needs_admin_help ? ' · needs DAS' : ''}`,
      closing: subject,
      cta_text: 'Open CRM →',
      portal_link: `https://boomrome.com/portal.html`,
    },
  });
  try {
    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!r.ok) {
      log('hot-email-fail', { status: r.status });
      return false;
    }
    return true;
  } catch (err) {
    log('hot-email-error', { message: err.message });
    return false;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);

  const rMin = checkRate(rateMin, ip, RATE_MIN_MAX, RATE_MIN_WINDOW_MS);
  if (!rMin.allowed) {
    log('reject', { reason: 'rate-min', ip, count: rMin.count });
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }
  const rDay = checkRate(rateDay, ip, RATE_DAY_MAX, RATE_DAY_WINDOW_MS);
  if (!rDay.allowed) {
    log('reject', { reason: 'rate-day', ip, count: rDay.count });
    return res.status(429).json({ error: 'Daily limit reached' });
  }

  const body = req.body || {};
  const eventType = String(body.type || '');
  if (!VALID_EVENTS.has(eventType)) {
    log('reject', { reason: 'bad-type', type: eventType, ip });
    return res.status(400).json({ error: 'Invalid event type' });
  }
  const sessionId = (typeof body.sessionId === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(body.sessionId))
    ? body.sessionId
    : null;
  if (!sessionId) {
    log('reject', { reason: 'bad-sessionId', ip });
    return res.status(400).json({ error: 'Invalid sessionId' });
  }
  const lead = (body.lead && typeof body.lead === 'object') ? body.lead : {};
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

  const result = { ok: true, eventType, sessionId };

  try {
    // 1. Always upsert conversations (best-effort)
    await upsertConversation({ sessionId, lead, eventType, payload });

    // 2. Per-type side effects
    switch (eventType) {
      case 'lead.captured':
      case 'service.engaged':
      case 'alert.subscribed':
      case 'lead.hot':
      case 'viewing.requested':
      case 'intake.opened': {
        const leadPath = await upsertLead({ sessionId, lead, eventType, payload });
        result.leadPath = leadPath;
        break;
      }
      case 'lead.declined':
        // No leads write — declined visitors don't pollute the leads collection.
        break;
    }

    if (eventType === 'viewing.requested') {
      const vr = await writeViewingRequest({ sessionId, lead, payload });
      result.viewingRequestId = vr?.id || null;
    }
    if (eventType === 'alert.subscribed') {
      const a = await writeAlert({ sessionId, lead, payload });
      result.alertId = a?.id || null;
    }
    if (eventType === 'lead.hot') {
      result.adminEmailSent = await fireHotEmail({ sessionId, lead });
    }
  } catch (err) {
    log('write-error', { eventType, sessionId, message: err.message });
    return res.status(500).json({ error: 'Event write failed', detail: err.message });
  }

  log('ok', { eventType, sessionId, ip, ...(result.leadPath ? { leadPath: result.leadPath } : {}) });
  return res.status(200).json(result);
}
