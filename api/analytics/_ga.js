// api/analytics/_ga.js
// Client GA4 Data API senza dipendenze: service account → JWT RS256 firmato
// con node:crypto → access token (cache 50') → runReport/runRealtimeReport.
// Mirrors the raw-fetch pattern of api/pfs/brief.js — nessun SDK Google,
// nessun peso in api/package.json.
//
// Env vars:
//   GA4_PROPERTY_ID       numeric property id (GA Admin → Property settings —
//                         NOT the G-XXXX measurement id in the pages)
//   GA_SA_JSON_BASE64     base64 of the service-account JSON key. The SA
//                         email must be added as Viewer on the GA4 property.
//   GA_SA_JSON            (alternative) the same JSON, raw.
//
// Pure helpers (tidyReport, assembleSnapshot, snapshotSpecs) are exported and
// unit-tested in tests/analytics/test.mjs.

import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

export function gaPropertyId() {
  return String(process.env.GA4_PROPERTY_ID || '').replace(/\D/g, '');
}

let _sa = null;
function serviceAccount() {
  if (_sa) return _sa;
  let raw = process.env.GA_SA_JSON || '';
  if (!raw && process.env.GA_SA_JSON_BASE64) {
    try { raw = Buffer.from(process.env.GA_SA_JSON_BASE64, 'base64').toString('utf8'); } catch { raw = ''; }
  }
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key) return null;
    _sa = sa;
    return _sa;
  } catch { return null; }
}

export function gaConfigured() {
  return !!(gaPropertyId() && serviceAccount());
}

export function b64url(data) {
  return Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// In-memory token cache — same idea as getAdminToken in api/homie/_lib.js.
let _token = null;
let _tokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

export async function getGaToken() {
  const now = Date.now();
  if (_token && (now - _tokenAt) < TOKEN_TTL_MS) return _token;
  const sa = serviceAccount();
  if (!sa) throw new Error('ga_unconfigured');
  const iat = Math.floor(now / 1000);
  const input =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signature = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key);
  const assertion = input + '.' + b64url(signature);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`ga_token_failed (${res.status}): ${String(data.error_description || data.error || '').slice(0, 200)}`);
  }
  _token = data.access_token;
  _tokenAt = now;
  return _token;
}

async function gaRequest(method, body) {
  const token = await getGaToken();
  const res = await fetch(`${DATA_BASE}/properties/${gaPropertyId()}:${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`ga_${method}_failed (${res.status}): ${String(data.error?.message || '').slice(0, 300)}`);
  }
  return data;
}

// spec: { dateRanges:[{startDate,endDate,name?}], dimensions:['pagePath',…],
//         metrics:['activeUsers',…], orderBys?, dimensionFilter?, limit? }
export async function runReport(spec) {
  return gaRequest('runReport', {
    dateRanges: spec.dateRanges,
    dimensions: (spec.dimensions || []).map(name => ({ name })),
    metrics: (spec.metrics || []).map(name => ({ name })),
    ...(spec.orderBys ? { orderBys: spec.orderBys } : {}),
    ...(spec.dimensionFilter ? { dimensionFilter: spec.dimensionFilter } : {}),
    limit: spec.limit || 100,
    keepEmptyRows: false,
  });
}

export async function runRealtime(spec = {}) {
  return gaRequest('runRealtimeReport', {
    dimensions: (spec.dimensions || []).map(name => ({ name })),
    metrics: (spec.metrics && spec.metrics.length ? spec.metrics : ['activeUsers']).map(name => ({ name })),
    limit: spec.limit || 20,
  });
}

// ─── Tidy: GA response → array di oggetti piatti ──────────────────────────
// Con più dateRanges GA aggiunge da solo la dimensione `dateRange` (valore =
// name della range o `date_range_N`) — arriva come una dimensione qualsiasi.
export function tidyReport(resp) {
  if (!resp || !Array.isArray(resp.rows)) return [];
  const dims = (resp.dimensionHeaders || []).map(h => h.name);
  const mets = (resp.metricHeaders || []).map(h => h.name);
  return resp.rows.map(row => {
    const out = {};
    (row.dimensionValues || []).forEach((v, i) => { out[dims[i] || `dim${i}`] = v.value; });
    (row.metricValues || []).forEach((v, i) => {
      const n = Number(v.value);
      out[mets[i] || `met${i}`] = Number.isFinite(n) ? n : v.value;
    });
    return out;
  });
}

// ─── Snapshot giornaliero ─────────────────────────────────────────────────
// I numeri "ieri/g7/g28" viaggiano in UN solo runReport (3 dateRanges); le
// sezioni struttura (pagine, fonti, geo, device, eventi) leggono gli ultimi
// 7 giorni — su un sito a traffico contenuto il singolo giorno è rumore.

const R_IERI = { startDate: 'yesterday', endDate: 'yesterday', name: 'ieri' };
const R_7 = { startDate: '7daysAgo', endDate: 'yesterday', name: 'g7' };
const R_28 = { startDate: '28daysAgo', endDate: 'yesterday', name: 'g28' };
const TOTAL_METRICS = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate', 'averageSessionDuration'];

export function snapshotSpecs() {
  return [
    { key: 'totali', spec: { dateRanges: [R_IERI, R_7, R_28], dimensions: [], metrics: TOTAL_METRICS } },
    { key: 'trend14', spec: { dateRanges: [{ startDate: '14daysAgo', endDate: 'yesterday' }], dimensions: ['date'], metrics: ['activeUsers', 'sessions', 'screenPageViews'], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 14 } },
    { key: 'pagine', spec: { dateRanges: [R_7], dimensions: ['pagePath'], metrics: ['screenPageViews', 'activeUsers'], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 12 } },
    { key: 'sorgenti', spec: { dateRanges: [R_7], dimensions: ['sessionSource', 'sessionMedium'], metrics: ['sessions', 'activeUsers'], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 } },
    { key: 'paesi', spec: { dateRanges: [R_7], dimensions: ['country'], metrics: ['activeUsers', 'sessions'], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 8 } },
    { key: 'citta', spec: { dateRanges: [R_7], dimensions: ['city'], metrics: ['activeUsers'], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 9 } },
    { key: 'dispositivi', spec: { dateRanges: [R_7], dimensions: ['deviceCategory'], metrics: ['activeUsers'], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 5 } },
    { key: 'eventi', spec: { dateRanges: [R_7], dimensions: ['eventName'], metrics: ['eventCount'], orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 15 } },
  ];
}

const n0 = v => Math.round(Number(v) || 0);
const pct1 = v => Math.round((Number(v) || 0) * 1000) / 10;

function mapTotals(row) {
  return {
    utenti: n0(row.activeUsers),
    nuoviUtenti: n0(row.newUsers),
    sessioni: n0(row.sessions),
    pagineViste: n0(row.screenPageViews),
    engagementPct: pct1(row.engagementRate),
    durataMediaSec: n0(row.averageSessionDuration),
  };
}

// parts: { totali, trend14, pagine, sorgenti, paesi, citta, dispositivi,
//          eventi } — ciascuno già passato da tidyReport.
export function assembleSnapshot(parts = {}) {
  const totali = parts.totali || [];
  const byRange = name => totali.find(r => r.dateRange === name) || {};
  return {
    ieri: mapTotals(byRange('ieri')),
    g7: mapTotals(byRange('g7')),
    g28: mapTotals(byRange('g28')),
    trend14: (parts.trend14 || []).map(r => ({ data: r.date, utenti: n0(r.activeUsers), sessioni: n0(r.sessions), pagineViste: n0(r.screenPageViews) })),
    pagine7g: (parts.pagine || []).slice(0, 12).map(r => ({ path: r.pagePath, viste: n0(r.screenPageViews), utenti: n0(r.activeUsers) })),
    sorgenti7g: (parts.sorgenti || []).slice(0, 10).map(r => ({ sorgente: r.sessionSource, mezzo: r.sessionMedium, sessioni: n0(r.sessions), utenti: n0(r.activeUsers) })),
    paesi7g: (parts.paesi || []).slice(0, 8).map(r => ({ paese: r.country, utenti: n0(r.activeUsers), sessioni: n0(r.sessions) })),
    citta7g: (parts.citta || []).filter(r => r.city && r.city !== '(not set)').slice(0, 8).map(r => ({ citta: r.city, utenti: n0(r.activeUsers) })),
    dispositivi7g: (parts.dispositivi || []).slice(0, 5).map(r => ({ tipo: r.deviceCategory, utenti: n0(r.activeUsers) })),
    eventi7g: (parts.eventi || []).slice(0, 15).map(r => ({ evento: r.eventName, conteggio: n0(r.eventCount) })),
  };
}

// "Ieri" nel calendario di Roma (la property GA è su Europe/Rome) — usato
// come id del doc giornaliero webAnalytics/daily_<data>.
export function romeYesterday() {
  return new Date(Date.now() - 86400e3).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
}
