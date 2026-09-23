// api/_ai.js — LA CENTRALE AI: una porta sola verso qualunque modello.
//
// Prima: VENTITRÉ file con la propria `fetch('https://api.anthropic.com/v1/
// messages')`, il modello scritto a mano, nessun contatore. La spesa AI era
// una riga di fattura a fine mese e "proviamo un modello locale" avrebbe
// voluto dire ventitré patch e nessun modo di sapere se il locale regge.
//
// Qui passa OGNI chiamata a un modello. Ciò che la centrale fa, e i chiamanti
// non devono più fare:
//   · sceglie il BACKEND dallo scopo dichiarato (js/ai-registry.js) e dalle
//     impostazioni `settings/ai`: cloud (com'è oggi, il default), shadow (il
//     cloud risponde, il locale corre in parallelo e si conta l'accordo),
//     local (risponde il locale; giù/lento/JSON illeggibile → si ricade sul
//     cloud, dichiarandolo nel risultato e nei contatori);
//   · mette il TETTO DI TEMPO (aiSignal) su ogni chiamata, locale compreso;
//   · CONTA: chiamate, token veri, costo dal listino, latenza — per scopo e
//     per backend, in `aiUsage/<giorno di Roma>` con incrementi atomici
//     (`:commit` + increment: due funzioni in parallelo non si sovrascrivono);
//   · non mette MAI il contenuto nei log: forma e misura (la lezione di
//     _modeljson: CF e IBAN di persone vere sono già finiti nei log una volta).
//
// Il locale è un endpoint OpenAI-compatibile (`/v1/chat/completions`): lo
// espongono Ollama, llama.cpp `llama-server`, LM Studio, mlx-lm. Il server
// pensa, il Mac esegue — e se il Mac è spento, il cloud c'è: fail-open per
// costruzione. L'URL e i nomi dei modelli stanno su `settings/ai` (o in env
// come default di deploy); il TOKEN del tunnel sta SOLO in env
// (LOCAL_AI_TOKEN): mai in un documento Firestore.
//
// Uso:
//   const r = await ai({ purpose: 'leads.brain', system, messages, maxTokens: 1200, timeoutMs: 25000, json: true });
//   r.text · r.usage · r.model · r.backend ('cloud'|'local') · r.stopReason · r.raw · r.fallback
// Errori: `AiError` con .code ('cloud_http'|'cloud_timeout'|'local_bad_json'|…)
// e .status. Il chiamante decide cosa significa (502, ripiego, riga saltata).

import REG from '../js/ai-registry.js';
import { getAdminToken, FS_BASE, fsGet, toFsFields } from './homie/_lib.js';
import { aiSignal } from './_budget.js';
import { parseModelJson } from './_modeljson.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TELEMETRY_CAP_MS = 4000;

export class AiError extends Error {
  constructor(code, { status = 0, backend = '', cause = null, detail = '' } = {}) {
    super(code + (status ? ' ' + status : ''));
    this.name = 'AiError';
    this.code = code;
    this.status = status;
    this.backend = backend;
    this.detail = detail;
    if (cause) this.cause = cause;
  }
}

const isAbort = (e) => !!e && (e.name === 'AbortError' || e.name === 'TimeoutError');

// ─── Le impostazioni (settings/ai + env), con cache breve ───────────────────
let _cache = null, _cacheAt = 0;
const TTL_MS = 30 * 1000;

// L'env è il default di deploy; il documento Firestore, se c'è, vince.
function envLocal() {
  const e = process.env;
  const out = {};
  if (e.LOCAL_AI_URL) out.url = e.LOCAL_AI_URL;
  if (e.LOCAL_AI_MODEL) out.model = e.LOCAL_AI_MODEL;
  if (e.LOCAL_AI_VISION_MODEL) out.visionModel = e.LOCAL_AI_VISION_MODEL;
  if (e.LOCAL_STT_URL) out.sttUrl = e.LOCAL_STT_URL;
  if (e.LOCAL_STT_MODEL) out.sttModel = e.LOCAL_STT_MODEL;
  if (e.LOCAL_AI_TIMEOUT_MS) out.timeoutMs = Number(e.LOCAL_AI_TIMEOUT_MS);
  return out;
}

export async function loadAiSettings({ fresh = false } = {}) {
  if (!fresh && _cache && (Date.now() - _cacheAt) < TTL_MS) return _cache;
  let raw = null;
  try { raw = await fsGet('settings/ai'); } catch { raw = null; }   // fail-open: senza documento si lavora in cloud
  const base = raw && typeof raw === 'object' ? raw : {};
  // Il documento vince sull'env SOLO dove dice qualcosa: un valore vuoto
  // ('' o null) nel documento non e' una scelta, e' l'assenza di scelta, e
  // non puo' spegnere LOCAL_AI_URL. LA LEZIONE DEL 23/09/2026: il primo
  // «🟢 Accendi il locale» scriveva la forma validata intera (url:'',
  // model:'' ...) e da li' /ai diceva «locale non configurato» con l'URL
  // regolarmente in env.
  const docLocal = base.local && typeof base.local === 'object' ? base.local : {};
  const docLocalSet = Object.fromEntries(Object.entries(docLocal).filter(([, v]) => v !== '' && v != null));
  const merged = { ...base, local: { ...envLocal(), ...docLocalSet } };
  const { cfg, rejected } = REG.mergeSettings(merged);
  _cache = { cfg, rejected, raw: raw || null };
  _cacheAt = Date.now();
  return _cache;
}
export function forgetAiSettings() { _cache = null; _cacheAt = 0; }

// Le credenziali del tunnel verso il Mac: bearer (llama-server --api-key,
// un reverse proxy) e/o service token di Cloudflare Access. Solo env.
export function localAuthHeaders() {
  const h = {};
  if (process.env.LOCAL_AI_TOKEN) h.Authorization = 'Bearer ' + process.env.LOCAL_AI_TOKEN;
  if (process.env.LOCAL_AI_CF_ID && process.env.LOCAL_AI_CF_SECRET) {
    h['CF-Access-Client-Id'] = process.env.LOCAL_AI_CF_ID;
    h['CF-Access-Client-Secret'] = process.env.LOCAL_AI_CF_SECRET;
  }
  return h;
}

// ─── La richiesta, normalizzata ─────────────────────────────────────────────
function normalize(opts) {
  let messages = opts.messages;
  if (!messages && opts.user != null) messages = [{ role: 'user', content: opts.user }];
  if (!Array.isArray(messages) || !messages.length) throw new AiError('no_messages');
  let hasImage = false, hasDocument = false;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b && b.type === 'image') hasImage = true;
      if (b && b.type === 'document') hasDocument = true;
    }
  }
  return { system: opts.system, messages, hasImage, hasDocument };
}

// Il JSON "largo" per il confronto e per la guardia del locale: anche un
// ARRAY in testa (il Lead Brain risponde con una lista). Per la lettura del
// risultato ogni chiamante usa già _modeljson: qui si decide solo se è
// leggibile, mai cosa c'è scritto.
function parseLoose(text) {
  const s = String(text == null ? '' : text);
  const i = s.search(/[[{]/);
  if (i < 0) return { ok: false };
  if (s[i] === '[') {
    const j = s.lastIndexOf(']');
    if (j < i) return { ok: false };
    try { return { ok: true, value: JSON.parse(s.slice(i, j + 1)) }; } catch { /* si prova l'oggetto */ }
  }
  const r = parseModelJson(s);
  return r.ok ? { ok: true, value: r.value } : { ok: false };
}

// ─── Cloud (Anthropic, raw HTTP come sempre: nessuna dipendenza) ────────────
async function callCloud(req, { model, maxTokens, timeoutMs, temperature, stopSequences }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError('cloud_unconfigured', { backend: 'cloud' });
  const body = { model, max_tokens: maxTokens, messages: req.messages };
  if (req.system != null && req.system !== '') body.system = req.system;
  if (temperature != null) body.temperature = temperature;
  if (stopSequences && stopSequences.length) body.stop_sequences = stopSequences;
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(ANTHROPIC_URL, {
      signal: aiSignal(timeoutMs),   // un modello appeso non deve uccidere la funzione
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError(isAbort(e) ? 'cloud_timeout' : 'cloud_network', { backend: 'cloud', cause: e });
  }
  const ms = Date.now() - t0;
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new AiError('cloud_http', { status: r.status, backend: 'cloud', detail: txt.slice(0, 300) });
  }
  const data = await r.json().catch(() => null);
  if (!data || !Array.isArray(data.content)) throw new AiError('cloud_bad_response', { backend: 'cloud', status: r.status });
  // Un blocco senza `type` ma con `text` è testo (i chiamanti storici
  // leggevano content[0].text senza guardare il tipo): non si perde.
  const text = data.content.filter(b => b && (b.type === 'text' || (b.type == null && typeof b.text === 'string'))).map(b => b.text || '').join('\n').trim();
  return { text, usage: data.usage || null, model: data.model || model, backend: 'cloud', stopReason: data.stop_reason || null, raw: data, ms };
}

// ─── Locale (OpenAI-compatibile, sul Mac attraverso il tunnel) ──────────────
function systemText(system) {
  if (system == null) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) return system.map(b => (b && b.text) || '').filter(Boolean).join('\n\n');
  return String(system);
}
function toOpenAiContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content == null ? '' : content);
  return content.map(b => {
    if (!b) return null;
    if (b.type === 'text') return { type: 'text', text: b.text || '' };
    if (b.type === 'image') {
      const src = b.source || {};
      const url = src.type === 'url' ? src.url : `data:${src.media_type || 'image/jpeg'};base64,${src.data || ''}`;
      return { type: 'image_url', image_url: { url } };
    }
    if (b.type === 'document') throw new AiError('local_unsupported_document', { backend: 'local' });
    return null;
  }).filter(Boolean);
}
function contentText(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(p => (p && (p.text || '')) || '').join('');
  return '';
}

async function callLocal(req, cfg, { model, maxTokens, timeoutMs, temperature, json }) {
  if (!cfg.local.url) throw new AiError('local_unconfigured', { backend: 'local' });
  if (!model) throw new AiError('local_no_model', { backend: 'local' });
  const messages = [];
  const sys = systemText(req.system);
  if (sys) messages.push({ role: 'system', content: sys });
  for (const m of req.messages) messages.push({ role: m.role, content: toOpenAiContent(m.content) });
  const body = { model, messages, max_tokens: maxTokens, stream: false, temperature: temperature == null ? 0.2 : temperature };
  if (json) body.response_format = { type: 'json_object' };
  const cap = Math.max(1000, Math.min(timeoutMs, cfg.local.timeoutMs));
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(cfg.local.url + '/v1/chat/completions', {
      signal: aiSignal(cap),
      method: 'POST',
      headers: { 'content-type': 'application/json', ...localAuthHeaders() },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError(isAbort(e) ? 'local_timeout' : 'local_unreachable', { backend: 'local', cause: e });
  }
  const ms = Date.now() - t0;
  if (!r.ok) throw new AiError('local_http', { status: r.status, backend: 'local' });
  const data = await r.json().catch(() => null);
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  if (!choice || !choice.message) throw new AiError('local_bad_response', { backend: 'local' });
  // I modelli "pensanti" (Qwen3 & co.) possono scrivere il ragionamento nel
  // testo: non è la risposta, e romperebbe ogni lettura JSON a valle.
  const text = contentText(choice.message.content).replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  if (json && !parseLoose(text).ok) throw new AiError('local_bad_json', { backend: 'local' });
  const u = data.usage || {};
  const usage = { input_tokens: Number(u.prompt_tokens) || 0, output_tokens: Number(u.completion_tokens) || 0 };
  const fr = choice.finish_reason;
  const stopReason = fr === 'length' ? 'max_tokens' : fr === 'content_filter' ? 'refusal' : 'end_turn';
  const served = 'local:' + (data.model || model);
  return {
    text, usage, model: served, backend: 'local', stopReason, ms,
    raw: { stop_reason: stopReason, content: [{ type: 'text', text }], usage, model: served, local: true },
  };
}

// ─── L'ombra: cloud risponde, locale si misura ──────────────────────────────
function judgeShadow(purpose, cloudRes, localSettled) {
  if (localSettled.status === 'rejected') {
    const e = localSettled.reason;
    return { agree: null, localFail: true, code: (e && e.code) || 'local_error', localMs: 0, localUsage: null };
  }
  const l = localSettled.value;
  let agree = null;
  if (purpose.agreeOn !== false) {
    if (purpose.json) {
      const a = parseLoose(cloudRes.text), b = parseLoose(l.text);
      agree = (a.ok && b.ok) ? REG.agreement(purpose, a.value, b.value) : false;
    } else {
      agree = REG.agreement(purpose, cloudRes.text, l.text);
    }
  }
  return { agree, localFail: false, code: '', localMs: l.ms, localUsage: l.usage };
}

// ─── I contatori: incrementi atomici, best-effort, MAI un'eccezione ────────
function romeDay(ms) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(0, 10); }
}
const inc = (n) => Number.isInteger(n) ? { integerValue: String(n) } : { doubleValue: n };

async function commitIncrements(writes) {
  const token = await getAdminToken();
  const resourceBase = FS_BASE.replace(/^https?:\/\/[^/]+\/v1\//, '');
  const body = {
    writes: writes.map(w => ({
      update: { name: `${resourceBase}/${w.docPath}`, fields: toFsFields(w.set || {}) },
      updateMask: { fieldPaths: Object.keys(w.set || {}) },
      updateTransforms: Object.entries(w.inc || {}).map(([fieldPath, n]) => ({ fieldPath, increment: inc(n) })),
    })),
  };
  const r = await fetch(`${FS_BASE}:commit`, {
    signal: aiSignal(TELEMETRY_CAP_MS),
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('commit ' + r.status);
}

/**
 * Registra una chiamata nei contatori del giorno (e, in ombra, nel doc
 * aiShadow dello scopo). Esportata perché il proxy del Doc Parser, che non
 * può passare dalla centrale (restituisce la risposta grezza), conti lo
 * stesso. Non lancia mai: un contatore che fallisce non deve fermare una
 * risposta già ottenuta.
 */
export async function recordUsage({ purpose, backend, ok, ms, model, usage, fallback = false, localFail = false, shadow = null, sttSeconds = null, now = Date.now() }) {
  try {
    const p = typeof purpose === 'string' ? REG.purposeOf(purpose) : purpose;
    if (!p) return false;
    const slug = REG.slugOf(p.key);
    const day = romeDay(now);
    const b = backend === 'local' ? 'local' : 'cloud';
    const base = `p.${slug}.${b}`;
    const incs = { [`${base}.calls`]: 1, [`${base}.${ok ? 'ok' : 'fail'}`]: 1, [`${base}.ms`]: Math.max(0, Math.round(ms || 0)) };
    if (usage) {
      incs[`${base}.inTok`] = Number(usage.input_tokens) || 0;
      incs[`${base}.outTok`] = Number(usage.output_tokens) || 0;
      if (usage.cache_read_input_tokens) incs[`${base}.cacheRead`] = Number(usage.cache_read_input_tokens) || 0;
      if (usage.cache_creation_input_tokens) incs[`${base}.cacheWrite`] = Number(usage.cache_creation_input_tokens) || 0;
    }
    let usd = null;
    if (b === 'local') usd = 0;
    else if (sttSeconds != null) usd = REG.sttCostUsd(model, sttSeconds);
    else usd = REG.costUsd(model, usage);
    if (usd != null) incs[`${base}.usd`] = Number(usd.toFixed(6));
    if (fallback) incs[`${base}.fallback`] = 1;
    if (localFail) { incs[`p.${slug}.local.calls`] = (incs[`p.${slug}.local.calls`] || 0) + 1; incs[`p.${slug}.local.fail`] = 1; }
    const writes = [{ docPath: `aiUsage/${day}`, set: { day, updatedAt: new Date(now) }, inc: incs }];
    if (shadow) {
      const sh = { samples: 1 };
      if (shadow.localFail) sh.localFail = 1;
      else if (shadow.agree === true) sh.agree = 1;
      else if (shadow.agree === false) sh.disagree = 1;
      else sh.notComparable = 1;
      if (shadow.localMs) sh.localMs = Math.round(shadow.localMs);
      if (ms) sh.cloudMs = Math.round(ms);
      const shInc = {};
      for (const [k, v] of Object.entries(sh)) shInc[k] = v;
      writes.push({ docPath: `aiShadow/${slug}`, set: { purpose: p.key, lastAt: new Date(now) }, inc: shInc });
      // e una traccia nel giorno, così il report quotidiano vede l'ombra
      for (const [k, v] of Object.entries(sh)) if (k === 'samples' || k === 'agree' || k === 'disagree' || k === 'localFail') incs[`p.${slug}.shadow.${k}`] = v;
      if (shadow.localUsage) {
        incs[`p.${slug}.local.calls`] = (incs[`p.${slug}.local.calls`] || 0) + 1;
        incs[`p.${slug}.local.ok`] = 1;
        incs[`p.${slug}.local.inTok`] = Number(shadow.localUsage.input_tokens) || 0;
        incs[`p.${slug}.local.outTok`] = Number(shadow.localUsage.output_tokens) || 0;
        incs[`p.${slug}.local.ms`] = Math.round(shadow.localMs || 0);
        incs[`p.${slug}.local.usd`] = 0;
      }
    }
    await commitIncrements(writes);
    return true;
  } catch (e) {
    // forma e misura, mai contenuto
    console.warn('[ai] contatori non scritti: ' + String(e && e.message || e).slice(0, 80));
    return false;
  }
}

// ─── La porta ───────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 *   purpose      chiave del registro (obbligatoria)
 *   system       string | blocchi Anthropic (con cache_control, passano intatti al cloud)
 *   messages     messaggi Anthropic; oppure `user` (stringa) per un turno solo
 *   maxTokens    default 1024
 *   timeoutMs    default 25000 (il locale è tappato anche da settings.local.timeoutMs)
 *   json         true = la risposta dev'essere JSON (il locale in json mode; illeggibile = fallimento del locale)
 *   model        modello cloud esplicito (vince sul registro e sulle impostazioni)
 *   temperature  opzionale (cloud: solo se passata; locale: default 0.2)
 */
export async function ai(opts = {}) {
  const purpose = REG.purposeOf(opts.purpose);
  if (!purpose) throw new AiError('unknown_purpose');
  const req = normalize(opts);
  const maxTokens = opts.maxTokens || 1024;
  const timeoutMs = opts.timeoutMs || 25000;
  const wantJson = opts.json === true || (opts.json !== false && purpose.json === true);
  const { cfg } = await loadAiSettings();
  const pol = REG.resolvePolicy(purpose.key, cfg, { hasImage: req.hasImage, hasDocument: req.hasDocument });
  const cloudModel = opts.model || pol.cloudModel;
  const common = { maxTokens, timeoutMs, temperature: opts.temperature, stopSequences: opts.stopSequences };
  const started = Date.now();

  let result = null, failed = null, fallback = false, localFail = false, shadow = null;
  try {
    if (pol.effective === 'local') {
      try {
        result = await callLocal(req, cfg, { ...common, model: pol.localModel, json: wantJson });
      } catch (e) {
        if (!(e instanceof AiError) || !cfg.local.fallback) throw e;
        console.warn(`[ai] ${purpose.key} locale ${e.code}${e.status ? ' ' + e.status : ''} → ricado sul cloud`);
        localFail = true; fallback = true;
        result = await callCloud(req, { ...common, model: cloudModel });
      }
    } else if (pol.effective === 'shadow') {
      const [c, l] = await Promise.allSettled([
        callCloud(req, { ...common, model: cloudModel }),
        callLocal(req, cfg, { ...common, model: pol.localModel, json: wantJson }),
      ]);
      if (c.status === 'rejected') throw c.reason;   // l'ombra non è un paracadute: la risposta è del cloud
      result = c.value;
      shadow = judgeShadow(purpose, result, l);
    } else {
      result = await callCloud(req, { ...common, model: cloudModel });
    }
  } catch (e) {
    failed = e;
  }
  const ms = Date.now() - started;
  if (failed) console.warn(`[ai] ${purpose.key} ${failed.code || failed.name || 'error'}${failed.status ? ' ' + failed.status : ''} ms=${ms}`);
  await recordUsage({
    purpose, ok: !failed, ms, fallback, localFail, shadow,
    backend: result ? result.backend : (pol.effective === 'local' ? 'local' : 'cloud'),
    model: result ? result.model : (pol.effective === 'local' && !fallback ? pol.localModel : cloudModel),
    usage: result ? result.usage : null,
  });
  if (failed) throw failed;
  return { ...result, fallback, policy: pol.effective, shadow: shadow ? { agree: shadow.agree, localFail: shadow.localFail } : null };
}

/** Comodità per i chiamanti che vogliono solo il testo. */
export async function aiText(opts) { return (await ai(opts)).text; }

export { REG };
