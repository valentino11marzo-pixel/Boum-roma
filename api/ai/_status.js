// api/ai/_status.js — LO STATO DELLA CENTRALE AI, in una copia sola.
//
// Letto dall'endpoint (api/ai/status.js), dal comando /ai su Telegram e dai
// suoi bottoni. Qui vive l'I/O (Firestore, la sonda al locale); il giudizio
// sta tutto in js/ai-registry.js (puro, testato).

import REG from '../../js/ai-registry.js';
import { fsGet, fsList, fsPatch } from '../homie/_lib.js';
import { aiSignal } from '../_budget.js';
import { loadAiSettings, forgetAiSettings, localAuthHeaders } from '../_ai.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function romeDay(ms) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(0, 10); }
}

/** La sonda: il locale risponde? Con quali modelli? Mai più di 4s. */
export async function probeLocal(cfg, { timeoutMs = 4000 } = {}) {
  const out = { configured: !!cfg.local.url, enabled: !!cfg.local.enabled, url: cfg.local.url ? cfg.local.url.replace(/^(https?:\/\/[^/]+).*$/, '$1') : '', reachable: false, ms: 0, models: [], error: '' };
  if (!cfg.local.url) return out;
  const t0 = Date.now();
  try {
    const r = await fetch(cfg.local.url + '/v1/models', { signal: aiSignal(timeoutMs), headers: localAuthHeaders() });
    out.ms = Date.now() - t0;
    if (!r.ok) { out.error = 'http_' + r.status; return out; }
    const j = await r.json().catch(() => null);
    const list = j && Array.isArray(j.data) ? j.data : (Array.isArray(j) ? j : []);
    out.models = list.map(m => String((m && (m.id || m.name)) || '')).filter(Boolean).slice(0, 40);
    out.reachable = true;
  } catch (e) {
    out.ms = Date.now() - t0;
    out.error = (e && (e.name === 'AbortError' || e.name === 'TimeoutError')) ? 'timeout' : 'unreachable';
  }
  return out;
}

/** I contatori di oggi e del mese (documenti aiUsage/<giorno>). */
export async function usageWindow(now = Date.now()) {
  const day = romeDay(now);
  const first = day.slice(0, 8) + '01';
  let today = null, month = [];
  try { today = await fsGet('aiUsage/' + day); } catch { today = null; }
  try {
    month = await fsList('aiUsage', { filter: { field: 'day', op: 'GREATER_THAN_OR_EQUAL', value: first }, limit: 40 });
  } catch { month = today ? [today] : []; }
  if (today && !month.some(d => d && d.day === day)) month.push(today);
  return { day, today: REG.usageSummary(today ? [today] : []), month: REG.usageSummary(month) };
}

/** I verdetti dell'ombra, per scopo. */
export async function shadowVerdicts(cfg) {
  let docs = [];
  try { docs = await fsList('aiShadow', { limit: 60 }); } catch { docs = []; }
  const byKey = new Map(docs.map(d => [REG.keyOfSlug(d.id) || d.purpose || d.id, d]));
  return REG.PURPOSES.map(p => REG.shadowVerdict(p, byKey.get(p.key) || null, cfg));
}

/** La fotografia completa. `probe:false` salta la sonda (per i test e per Telegram a mano). */
export async function aiSnapshot({ probe = true, fresh = false, now = Date.now() } = {}) {
  const { cfg, rejected } = await loadAiSettings({ fresh });
  const [local, usage, shadow] = await Promise.all([
    probe ? probeLocal(cfg) : Promise.resolve({ configured: !!cfg.local.url, enabled: !!cfg.local.enabled, reachable: null, models: [], ms: 0, error: '' }),
    usageWindow(now),
    shadowVerdicts(cfg),
  ]);
  const rows = REG.statusRows(cfg);
  return { ok: true, cfg: { local: { ...cfg.local, url: local.url || '' }, purposes: cfg.purposes, shadow: cfg.shadow }, rejected, local, rows, usage, shadow };
}

/**
 * Scrive un pezzo di settings/ai DOPO averlo validato col registro: un
 * valore impossibile torna in `rejected` e NON si scrive (mai aggiustato in
 * silenzio). `patch` può portare purposes:{key:{mode|cloudModel|localModel}},
 * local:{…}, shadow:{…}.
 */
export async function setAiSettings(patch) {
  const raw = (await fsGet('settings/ai').catch(() => null)) || {};
  const next = { ...raw };
  if (patch.local && typeof patch.local === 'object') next.local = { ...(raw.local || {}), ...patch.local };
  if (patch.shadow && typeof patch.shadow === 'object') next.shadow = { ...(raw.shadow || {}), ...patch.shadow };
  if (patch.purposes && typeof patch.purposes === 'object') {
    next.purposes = { ...(raw.purposes || {}) };
    for (const [k, v] of Object.entries(patch.purposes)) next.purposes[k] = { ...(next.purposes[k] || {}), ...(v || {}) };
  }
  // la validazione è quella del registro: la STESSA che il server applica a runtime
  const { cfg, rejected } = REG.mergeSettings(next);
  const touched = [
    ...(patch.local ? Object.keys(patch.local).map(k => 'local.' + k) : []),
    ...(patch.shadow ? Object.keys(patch.shadow).map(k => 'shadow.' + k) : []),
    ...(patch.purposes ? Object.entries(patch.purposes).flatMap(([k, v]) => Object.keys(v || {}).map(f => 'purposes.' + k + '.' + f)) : []),
  ];
  const blocking = rejected.filter(r => touched.includes(r.key));
  if (blocking.length) return { ok: false, rejected: blocking };
  // si scrive la forma VALIDATA (cfg), non il grezzo: una modalità o un
  // URL rifiutati non entrano mai nel documento
  // Nel documento entrano SOLO le voci di local che qualcuno ha scritto (gia'
  // nel doc o nel patch) e che dicono qualcosa: la forma validata intera porta
  // i default ('' per url/model, 20000 per timeoutMs) e, una volta nel
  // documento, quei default VINCONO sull'env. Il primo «Accendi il locale»
  // del 23/09/2026 ha spento LOCAL_AI_URL esattamente cosi'.
  const localKeys = new Set(Object.keys(next.local || {}));
  const localOut = Object.fromEntries(Object.entries(cfg.local).filter(([k, v]) => localKeys.has(k) && v !== '' && v != null));
  const doc = { local: localOut, purposes: cfg.purposes, shadow: cfg.shadow, updatedAt: new Date() };
  await fsPatch('settings/ai', doc);
  forgetAiSettings();
  return { ok: true, cfg, rejected };
}

// ─── Telegram: /ai e i bottoni aitg:<local|code> ───────────────────────────
const ICON = { cloud: '☁️', shadow: '🌗', local: '🏠' };

export async function aiStatusMessage({ probe = true } = {}) {
  const s = await aiSnapshot({ probe });
  const t = s.usage.today.total, m = s.usage.month.total;
  const localLine = !s.local.configured
    ? '🔴 <b>locale non configurato</b> (settings/ai → local.url, oppure LOCAL_AI_URL)'
    : !s.local.enabled
      ? '⚪ locale <b>spento</b>' + (s.local.reachable ? ' · raggiungibile' : s.local.reachable === false ? ' · irraggiungibile (' + esc(s.local.error) + ')' : '')
      : s.local.reachable
        ? '🟢 locale <b>acceso</b> · risponde in ' + s.local.ms + 'ms' + (s.local.models.length ? ' · ' + esc(s.local.models.slice(0, 3).join(', ')) : '')
        : s.local.reachable === false
          ? '⚠️ locale acceso ma <b>irraggiungibile</b> (' + esc(s.local.error) + ') — tutto ricade sul cloud'
          : '🟢 locale acceso';
  const lines = s.rows.map(r => {
    const u = s.usage.today.byPurpose[r.key];
    const spent = u ? (u.cloud.calls ? REG.fmtUsd(u.cloud.usd) + ' (' + u.cloud.calls + ')' : '') + (u.local.calls ? (u.cloud.calls ? ' · ' : '') + 'locale ' + u.local.calls + (u.cloud.fallback ? ', ricadute ' + u.cloud.fallback : '') : '') : '';
    const sh = s.shadow.find(v => v.key === r.key);
    const shTxt = r.mode === 'shadow' && sh ? ' · ' + (sh.state === 'pronta' ? '✅ pronta (' + sh.why + ')' : sh.state === 'bocciata' ? '❌ ' + sh.why : sh.state === 'in_misura' ? '⏳ ' + sh.why : sh.state === 'non_misurabile' ? 'ℹ️ non misurabile' : sh.why) : '';
    const mode = r.localOk ? (ICON[r.mode] || '') + ' ' + r.mode + (r.effective !== r.mode ? ' → cloud (' + esc(r.why) + ')' : '') : '🔒 solo cloud';
    return `${mode} — <b>${esc(r.label)}</b> <i>(${r.tier})</i>${spent ? '\n     ' + esc(spent) : ''}${shTxt ? '\n     ' + esc(shTxt) : ''}`;
  });
  const msg = [
    '<b>🧠 La Centrale AI</b>',
    localLine,
    '',
    `<b>Oggi</b>: cloud ${REG.fmtUsd(t.cloud.usd)} (${REG.fmtEur(t.cloud.usd)}) su ${t.cloud.calls} chiamate · locale ${t.local.calls} chiamate · ricadute ${t.cloud.fallback}`,
    `<b>Mese</b>: cloud ${REG.fmtUsd(m.cloud.usd)} (${REG.fmtEur(m.cloud.usd)}) su ${m.cloud.calls} chiamate · locale ${m.local.calls} · ${s.usage.month.days} giorni misurati`,
    '',
    'Per scopo — ☁️ cloud · 🌗 shadow (cloud risponde, locale si misura) · 🏠 local (ricade sul cloud se fallisce):',
    ...lines,
    ...(s.rejected.length ? ['', '⚠️ Impostazioni ignorate: ' + esc(s.rejected.map(r => r.key + ' (' + r.why + ')').join(' · '))] : []),
  ].join('\n');
  const keyboard = { inline_keyboard: [
    [{ text: s.cfg.local.enabled ? '⚪ Spegni il locale (tutto in cloud)' : '🟢 Accendi il locale', callback_data: 'aitg:local' }],
    ...s.rows.filter(r => r.localOk).map(r => [{ text: `${ICON[REG.nextMode(REG.purposeOf(r.key), r.mode)]} → ${REG.nextMode(REG.purposeOf(r.key), r.mode)} · ${r.label.slice(0, 40)}`, callback_data: `aitg:${r.code}` }]),
  ] };
  return { msg, keyboard };
}

/** Il toggle: 'local' = interruttore del locale; un codice = la modalità dello scopo, a rotazione. */
export async function toggleAi(arg) {
  if (arg === 'local') {
    const raw = (await fsGet('settings/ai').catch(() => null)) || {};
    const enabled = !(raw.local && raw.local.enabled === true);
    const r = await setAiSettings({ local: { enabled } });
    return r.ok;
  }
  const p = REG.byCode(arg);
  if (!p) return false;
  const { cfg } = await loadAiSettings({ fresh: true });
  const cur = (cfg.purposes[p.key] && cfg.purposes[p.key].mode) || 'cloud';
  const r = await setAiSettings({ purposes: { [p.key]: { mode: REG.nextMode(p, cur) } } });
  return r.ok;
}
