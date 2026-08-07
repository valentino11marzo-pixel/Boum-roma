// api/wizard/transcribe.js
// Voice-note transcription for the Telegram wizard bot.
//
// The operator dictates a listing while walking the apartment; the bot sends
// the Telegram voice note (ogg/opus) here and feeds the transcript to
// /api/wizard/interpret. Anthropic has no speech-to-text, so this uses
// OpenAI Whisper WHEN the key is configured; without OPENAI_API_KEY it
// answers 501 and the bot tells the operator voice is not set up yet —
// never a silent failure.
//
// Method: POST  ·  Headers: X-Wizard-Secret (or X-Homie-Secret)
// Body:   { base64, mimeType? }   (audio, ≤ ~2 MB — Telegram voice notes)
// 200:    { ok:true, text }
// 501:    { ok:false, error:'transcribe_unconfigured' }

import { secretEqual, readJson } from '../homie/_lib.js';

function checkSecret(req, res) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  if (!expected) { res.status(500).json({ ok: false, error: 'server_misconfigured: WIZARD_SECRET unset' }); return false; }
  if (!secretEqual(String(supplied || ''), expected)) { res.status(401).json({ ok: false, error: 'invalid_secret' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!checkSecret(req, res)) return;

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(501).json({ ok: false, error: 'transcribe_unconfigured' });

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const b64 = String((body && body.base64) || '');
  if (!b64) return res.status(400).json({ ok: false, error: 'no_audio' });
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length || buf.length > 4 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'audio_size' });

  try {
    const mime = String((body && body.mimeType) || 'audio/ogg');
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), 'voice.ogg');
    form.append('model', 'whisper-1');
    form.append('language', 'it');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!r.ok) {
      console.error('[wizard/transcribe] openai', r.status, (await r.text()).slice(0, 200));
      return res.status(502).json({ ok: false, error: 'stt_failed' });
    }
    const j = await r.json();
    const text = String(j.text || '').trim();
    if (!text) return res.status(200).json({ ok: true, text: '' });
    return res.status(200).json({ ok: true, text: text.slice(0, 1200) });
  } catch (e) {
    console.error('[wizard/transcribe]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
