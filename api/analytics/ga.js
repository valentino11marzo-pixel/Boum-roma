// api/analytics/ga.js
// Sync Google Analytics → BOOM. Due modalità, stessa porta:
//
//   GET  (cron 05:30 UTC, o ?mode=snapshot) — SNAPSHOT GIORNALIERO: numeri
//        ieri/7g/28g, trend 14 giorni, top pagine/fonti/paesi/città/device/
//        eventi. Scrive webAnalytics/daily_<data> + webAnalytics/latest —
//        i doc che il brief mattutino (api/pfs/brief.js) e qualsiasi
//        console leggono. `?dry=1` calcola senza scrivere.
//
//   POST — query ad-hoc per studiare i dati:
//        { mode:'report', dimensions:['pagePath'], metrics:['activeUsers'],
//          days:28 | startDate/endDate, filter?, orderBy?, limit? }
//        { mode:'realtime', dimensions?, metrics? } → chi c'è ORA sul sito.
//        { mode:'snapshot', dry? } → snapshot manuale (bottone console).
//
// Auth come i cron PFS (api/pfs/_guard.js): Bearer CRON_SECRET, X-Homie-Secret
// o ID token Firebase di un admin. Senza GA4_PROPERTY_ID + GA_SA_JSON_BASE64
// il cron è un no-op silenzioso (nessun alert), le query rispondono 501.
// Heartbeat teamHealth/analytics — 3 run falliti di fila → alert Telegram.

import { fsPatch, logActivity, readJson } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth } from '../employees/_lib.js';
import {
  gaConfigured, gaPropertyId, runReport, runRealtime,
  tidyReport, snapshotSpecs, assembleSnapshot, romeYesterday,
} from './_ga.js';

const FILTER_MATCH = new Set(['EXACT', 'CONTAINS', 'BEGINS_WITH', 'ENDS_WITH', 'FULL_REGEXP']);

function strArr(v, max) {
  if (!Array.isArray(v)) return [];
  return v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, max);
}

async function doSnapshot(actor, dry, res) {
  const parts = {};
  const fetched = await Promise.all(snapshotSpecs().map(async ({ key, spec }) => {
    const rows = tidyReport(await runReport(spec));
    return [key, rows];
  }));
  for (const [key, rows] of fetched) parts[key] = rows;

  const date = romeYesterday();
  const doc = {
    date,
    propertyId: gaPropertyId(),
    fetchedAt: new Date(),
    ...assembleSnapshot(parts),
  };
  const stats = {
    utentiIeri: doc.ieri.utenti,
    sessioniIeri: doc.ieri.sessioni,
    utenti7g: doc.g7.utenti,
    pagineViste7g: doc.g7.pagineViste,
  };

  if (!dry) {
    await fsPatch(`webAnalytics/daily_${date}`, doc);
    await fsPatch('webAnalytics/latest', { ...doc, dailyDocId: `daily_${date}` });
    await reportEmployeeHealth('analytics', { ok: true, stats });
    await logActivity('ga_snapshot', 'analytics', { date, ...stats }, actor);
  }
  return res.status(200).json({ ok: true, dry: !!dry, date, stats, snapshot: doc });
}

async function doReport(body, res) {
  const dimensions = strArr(body.dimensions, 9);
  const metrics = strArr(body.metrics, 10);
  if (!metrics.length) metrics.push('activeUsers');

  let dateRanges;
  if (body.startDate && body.endDate) {
    dateRanges = [{ startDate: String(body.startDate), endDate: String(body.endDate) }];
  } else {
    const days = Math.min(365, Math.max(1, parseInt(body.days, 10) || 28));
    dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];
  }

  const spec = {
    dateRanges, dimensions, metrics,
    limit: Math.min(1000, Math.max(1, parseInt(body.limit, 10) || 100)),
  };
  if (body.orderBy && typeof body.orderBy === 'object') {
    if (typeof body.orderBy.metric === 'string') {
      spec.orderBys = [{ metric: { metricName: body.orderBy.metric }, desc: body.orderBy.desc !== false }];
    } else if (typeof body.orderBy.dimension === 'string') {
      spec.orderBys = [{ dimension: { dimensionName: body.orderBy.dimension }, desc: !!body.orderBy.desc }];
    }
  }
  if (body.filter && typeof body.filter.dimension === 'string' && typeof body.filter.value === 'string') {
    const match = FILTER_MATCH.has(body.filter.match) ? body.filter.match : 'CONTAINS';
    spec.dimensionFilter = {
      filter: {
        fieldName: body.filter.dimension,
        stringFilter: { matchType: match, value: body.filter.value, caseSensitive: false },
      },
    };
  }

  const rows = tidyReport(await runReport(spec));
  return res.status(200).json({ ok: true, rowCount: rows.length, rows });
}

async function doRealtime(body, res) {
  const rows = tidyReport(await runRealtime({
    dimensions: strArr(body.dimensions, 4),
    metrics: strArr(body.metrics, 5),
    limit: Math.min(100, Math.max(1, parseInt(body.limit, 10) || 20)),
  }));
  return res.status(200).json({ ok: true, rowCount: rows.length, rows });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const body = req.method === 'POST' ? (await readJson(req)) || {} : {};
  const mode = req.method === 'GET' ? (req.query?.mode || 'snapshot') : (body.mode || 'report');
  const dry = req.query?.dry === '1' || body.dry === true;

  if (!gaConfigured()) {
    // Cron senza config = installazione che non usa GA: silenzio, non un
    // guasto (stesso trattamento del wizard/health senza heartbeat doc).
    if (actor === 'cron') return res.status(200).json({ ok: true, skipped: 'ga_unconfigured' });
    return res.status(501).json({ ok: false, error: 'ga_unconfigured', hint: 'set GA4_PROPERTY_ID + GA_SA_JSON_BASE64 (service account Viewer sulla property)' });
  }

  try {
    if (mode === 'snapshot') return await doSnapshot(actor, dry, res);
    if (mode === 'report') return await doReport(body, res);
    if (mode === 'realtime') return await doRealtime(body, res);
    return res.status(400).json({ ok: false, error: 'unknown_mode' });
  } catch (e) {
    console.error('[analytics/ga] failed:', e.message);
    if (mode === 'snapshot' && !dry) {
      try { await reportEmployeeHealth('analytics', { ok: false, error: e.message }); } catch { /* best effort */ }
    }
    return res.status(502).json({ ok: false, error: 'ga_request_failed', detail: String(e.message).slice(0, 300) });
  }
}
