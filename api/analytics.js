// api/analytics.js
// Growth dashboard data source. Admin-only proxy to the Google Analytics 4
// Data API (Data API v1beta) for property G-EYCD59RDVJ.
//
//   GET /api/analytics?days=28[&report=overview]
//   Authorization: Bearer <Firebase ID token>  (role must be "admin")
//
// Auth to Google uses a service-account JWT signed with node:crypto — no
// extra npm dependency, and the private key never leaves the server.
//
// Required env vars (set in Vercel):
//   GA4_PROPERTY_ID            numeric GA4 property id (e.g. "498765432")
//   GA_SERVICE_ACCOUNT_JSON    the full service-account JSON, raw or base64.
//                              (Grant that service account "Viewer" on the
//                               GA4 property: Admin → Property Access Mgmt.)
//   — or, instead of the JSON blob —
//   GA_SA_CLIENT_EMAIL         service-account email
//   GA_SA_PRIVATE_KEY          its PEM private key (\n-escaped is fine)
//
// If those are absent the endpoint returns 200 { ok:false, configured:false }
// so the dashboard can render a friendly "connect me" state instead of 500.

import crypto from 'node:crypto';
import { requireRole, setCors } from './_auth.js';

const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

// Conversion events fired by js/boom-track.js — surfaced as the lead funnel.
const KEY_EVENTS = ['generate_lead', 'whatsapp_click', 'begin_checkout', 'cta_intent'];

// ── Service-account credentials ──────────────────────────────────────────
function loadServiceAccount() {
  let email = process.env.GA_SA_CLIENT_EMAIL || '';
  let key = process.env.GA_SA_PRIVATE_KEY || '';
  const blob = process.env.GA_SERVICE_ACCOUNT_JSON || '';
  if (blob && (!email || !key)) {
    let txt = blob.trim();
    // tolerate base64-wrapped JSON
    if (!txt.startsWith('{')) {
      try { txt = Buffer.from(txt, 'base64').toString('utf8'); } catch (e) {}
    }
    try {
      const j = JSON.parse(txt);
      email = email || j.client_email || '';
      key = key || j.private_key || '';
    } catch (e) { /* fall through to "not configured" */ }
  }
  key = (key || '').replace(/\\n/g, '\n'); // un-escape newlines from env storage
  if (!email || !key) return null;
  return { email, key };
}

function isConfigured() {
  return Boolean(process.env.GA4_PROPERTY_ID) && Boolean(loadServiceAccount());
}

// ── OAuth2 token (signed JWT → access token), cached while warm ──────────
let _tokenCache = { token: null, exp: 0 };

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache.token && _tokenCache.exp - 60 > now) return _tokenCache.token;

  const sa = loadServiceAccount();
  if (!sa) throw new Error('service account not configured');

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const signature = b64url(
    crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.key)
  );
  const assertion = `${header}.${claim}.${signature}`;

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token exchange failed: ' + JSON.stringify(j).slice(0, 300));
  _tokenCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

// ── GA4 Data API calls ───────────────────────────────────────────────────
async function gaFetch(propertyId, method, body) {
  const token = await getAccessToken();
  const r = await fetch(`${DATA_API}/properties/${propertyId}:${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`GA ${method} ${r.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// Map a report's rows into plain objects keyed by header name (metrics → Number).
function rowsToObjects(report) {
  const dims = (report.dimensionHeaders || []).map((h) => h.name);
  const mets = (report.metricHeaders || []).map((h) => h.name);
  return (report.rows || []).map((row) => {
    const o = {};
    (row.dimensionValues || []).forEach((v, i) => { o[dims[i]] = v.value; });
    (row.metricValues || []).forEach((v, i) => { o[mets[i]] = Number(v.value || 0); });
    return o;
  });
}

async function buildOverview(propertyId, days) {
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

  const batch = await gaFetch(propertyId, 'batchRunReports', {
    requests: [
      // 0 — headline KPIs (single totals row)
      { dateRanges, metrics: [
        { name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' },
        { name: 'screenPageViews' }, { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
      ] },
      // 1 — sessions / users by day (trend)
      { dateRanges, dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 },
      // 2 — acquisition channels
      { dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagedSessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 12 },
      // 3 — top pages
      { dateRanges, dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 15 },
      // 4 — events (lead funnel + everything else)
      { dateRanges, dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 40 },
    ],
  });

  const [kpiR, trendR, chanR, pageR, evtR] = batch.reports;
  const kpi = rowsToObjects(kpiR)[0] || {};
  const eventsAll = rowsToObjects(evtR).map((e) => ({ name: e.eventName, count: e.eventCount }));
  const funnel = KEY_EVENTS.map((name) => ({
    name, count: (eventsAll.find((e) => e.name === name) || {}).count || 0,
  }));

  // Realtime active users — separate, guarded (never block the dashboard).
  let realtime = { activeUsers: null };
  try {
    const rt = await gaFetch(propertyId, 'runRealtimeReport', { metrics: [{ name: 'activeUsers' }] });
    realtime.activeUsers = Number((rt.rows?.[0]?.metricValues?.[0]?.value) || 0);
  } catch (e) { /* realtime is best-effort */ }

  return {
    kpis: {
      sessions: kpi.sessions || 0,
      totalUsers: kpi.totalUsers || 0,
      newUsers: kpi.newUsers || 0,
      pageViews: kpi.screenPageViews || 0,
      avgSessionDuration: kpi.averageSessionDuration || 0,
      engagementRate: kpi.engagementRate || 0,
    },
    timeseries: rowsToObjects(trendR).map((r) => ({
      date: r.date, sessions: r.sessions, users: r.totalUsers,
    })),
    channels: rowsToObjects(chanR).map((r) => ({
      channel: r.sessionDefaultChannelGroup || '(unknown)',
      sessions: r.sessions, users: r.totalUsers, engagedSessions: r.engagedSessions,
    })),
    topPages: rowsToObjects(pageR).map((r) => ({
      path: r.pagePath, views: r.screenPageViews, sessions: r.sessions,
    })),
    funnel,
    events: eventsAll,
    realtime,
  };
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'method_not_allowed' }); return; }

  const ctx = await requireRole(req, res, ['admin']);
  if (!ctx) return; // requireRole already wrote the response

  if (!isConfigured()) {
    res.status(200).json({
      ok: false,
      configured: false,
      error: 'analytics_not_configured',
      setup: {
        property: 'Set GA4_PROPERTY_ID (numeric, from GA Admin → Property Settings).',
        credentials: 'Set GA_SERVICE_ACCOUNT_JSON (service-account JSON) and grant that '
          + 'service account Viewer access under GA Admin → Property Access Management.',
        measurementId: 'G-EYCD59RDVJ',
      },
    });
    return;
  }

  const propertyId = String(process.env.GA4_PROPERTY_ID).replace(/\D/g, '');
  let days = parseInt(req.query?.days, 10);
  if (!Number.isFinite(days) || days < 1 || days > 365) days = 28;

  try {
    const data = await buildOverview(propertyId, days);
    res.status(200).json({
      ok: true,
      configured: true,
      propertyId,
      range: { days, startDate: `${days}daysAgo`, endDate: 'today' },
      ...data,
    });
  } catch (e) {
    console.error('[analytics] error:', e.message);
    res.status(502).json({ ok: false, configured: true, error: 'ga_request_failed', detail: e.message });
  }
}
