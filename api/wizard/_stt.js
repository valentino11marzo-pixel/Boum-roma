// api/wizard/_stt.js — la trascrizione, in UNA copia.
//
// Anthropic non fa speech-to-text. Due chiamanti — il bot Telegram che detta
// un annuncio (api/wizard/transcribe.js) e l'inventario che registra il giro
// in casa (api/contracts/inventario.js) — e una sola implementazione, così
// non possono divergere su formato, tetto o gestione dell'errore.
//
// DUE BACKEND, la stessa disciplina della centrale AI (api/_ai.js):
//   · locale — un server Whisper sul Mac che parla il dialetto OpenAI
//     (`POST /v1/audio/transcriptions`, multipart: speaches, faster-whisper-
//     server, whisper.cpp con la rotta compatibile). Whisper large-v3-turbo
//     su Apple Silicon è pari al cloud e costa zero: è lo scopo
//     'stt.transcribe' del registro, e si accende come gli altri
//     (settings/ai → purposes['stt.transcribe'].mode, più local.sttUrl).
//     Per l'audio "shadow" non ha senso (niente da confrontare): vale come
//     locale con ricaduta sul cloud;
//   · cloud — Whisper di OpenAI quando la chiave c'è. È anche la ricaduta se
//     il locale è giù (fail-open, dichiarato nel risultato: `backend`).
//
// Ritorna SEMPRE un oggetto parlante, mai un'eccezione muta:
//   { ok:true, text, backend }              trascritto (anche stringa vuota)
//   { ok:false, error:'unconfigured' }    nessun backend configurato
//   { ok:false, error:'audio_size'|… }    input rifiutato / STT giù
// Chi chiama decide se è fatale: per il bot sì, per l'inventario no (il
// parlato è un aiuto, non la fonte). Ogni chiamata si CONTA (aiUsage), col
// costo del cloud stimato dai byte (bitrate dichiarato per formato: è una
// stima, e nel report è scritta come tale).

import REG from '../../js/ai-registry.js';
import { loadAiSettings, recordUsage, localAuthHeaders } from '../_ai.js';
import { aiSignal } from '../_budget.js';

const MAX_AUDIO = 4 * 1024 * 1024;
// kbps tipici per stimare la durata dai byte (solo per il costo del cloud)
const KBPS = { ogg: 28, webm: 48, m4a: 64, mp3: 128, wav: 256 };

function extOf(mime) {
  const m = String(mime || 'audio/ogg');
  return /mp4|m4a/.test(m) ? 'm4a' : /webm/.test(m) ? 'webm' : /mpeg|mp3/.test(m) ? 'mp3' : /wav/.test(m) ? 'wav' : 'ogg';
}
export function estimateSeconds(bytes, mimeType) {
  const kbps = KBPS[extOf(mimeType)] || 32;
  return Math.round((Number(bytes) || 0) * 8 / (kbps * 1000));
}

function buildForm(buf, mime, ext, model, lang) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), `voice.${ext}`);
  form.append('model', model);
  if (lang) form.append('language', lang);
  form.append('response_format', 'json');
  return form;
}

async function postForm(url, headers, form, timeoutMs) {
  const r = await fetch(url, { method: 'POST', headers, body: form, signal: aiSignal(timeoutMs) });
  if (!r.ok) throw new Error('http_' + r.status);
  const j = await r.json();
  return String(j.text || '').trim();
}

export async function transcribeAudio(buf, mimeType, opts = {}) {
  if (!buf || !buf.length) return { ok: false, error: 'no_audio' };
  if (buf.length > MAX_AUDIO) return { ok: false, error: 'audio_size' };

  const mime = String(mimeType || 'audio/ogg');
  const ext = extOf(mime);
  // lingua: 'it' di default (l'operatore parla italiano); null = riconoscila
  const lang = opts.language === null ? null : (opts.language || 'it');
  const maxChars = opts.maxChars || 1200;
  const seconds = estimateSeconds(buf.length, mime);

  let cfg;
  try { cfg = (await loadAiSettings()).cfg; } catch { cfg = REG.mergeSettings(null).cfg; }
  const pol = REG.resolvePolicy('stt.transcribe', cfg, {});
  const cloudKey = process.env.OPENAI_API_KEY;

  // ── locale, prima ──
  if (pol.effective === 'local' || pol.effective === 'shadow') {
    const t0 = Date.now();
    try {
      const model = cfg.local.sttModel || 'whisper-1';
      const text = await postForm(cfg.local.sttUrl + '/v1/audio/transcriptions', localAuthHeaders(), buildForm(buf, mime, ext, model, lang), Math.min(cfg.local.timeoutMs, 40000));
      await recordUsage({ purpose: 'stt.transcribe', backend: 'local', ok: true, ms: Date.now() - t0, model: 'local:' + model });
      return { ok: true, text: text.slice(0, maxChars), backend: 'local' };
    } catch (e) {
      console.warn('[stt] locale ' + String(e && e.message || e).slice(0, 60) + (cloudKey && cfg.local.fallback ? ' → ricado sul cloud' : ''));
      await recordUsage({ purpose: 'stt.transcribe', backend: 'local', ok: false, ms: Date.now() - t0, model: 'local' });
      if (!cfg.local.fallback || !cloudKey) return { ok: false, error: 'stt_failed' };
    }
  }

  // ── cloud (OpenAI Whisper) ──
  if (!cloudKey) return { ok: false, error: 'unconfigured' };
  const t0 = Date.now();
  try {
    const text = await postForm('https://api.openai.com/v1/audio/transcriptions', { Authorization: `Bearer ${cloudKey}` }, buildForm(buf, mime, ext, 'whisper-1', lang), 40000);
    await recordUsage({ purpose: 'stt.transcribe', backend: 'cloud', ok: true, ms: Date.now() - t0, model: 'whisper-1', sttSeconds: seconds });
    return { ok: true, text: text.slice(0, maxChars), backend: 'cloud' };
  } catch (e) {
    console.error('[stt] openai ' + String(e && e.message || e).slice(0, 60));
    await recordUsage({ purpose: 'stt.transcribe', backend: 'cloud', ok: false, ms: Date.now() - t0, model: 'whisper-1', sttSeconds: seconds });
    return { ok: false, error: 'stt_failed' };
  }
}

export { MAX_AUDIO };
