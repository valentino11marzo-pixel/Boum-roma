// api/wizard/_stt.js — la trascrizione, in UNA copia.
//
// Anthropic non fa speech-to-text: si usa Whisper di OpenAI quando la chiave
// c'è. Due chiamanti — il bot Telegram che detta un annuncio
// (api/wizard/transcribe.js) e l'inventario che registra il giro in casa
// (api/contracts/inventario.js) — e una sola implementazione, così non
// possono divergere su formato, tetto o gestione dell'errore.
//
// Ritorna SEMPRE un oggetto parlante, mai un'eccezione muta:
//   { ok:true, text }                     trascritto (anche stringa vuota)
//   { ok:false, error:'unconfigured' }    manca OPENAI_API_KEY
//   { ok:false, error:'audio_size'|… }    input rifiutato / STT giù
// Chi chiama decide se è fatale: per il bot sì, per l'inventario no (il
// parlato è un aiuto, non la fonte).

const MAX_AUDIO = 4 * 1024 * 1024;

export async function transcribeAudio(buf, mimeType, opts = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: 'unconfigured' };
  if (!buf || !buf.length) return { ok: false, error: 'no_audio' };
  if (buf.length > MAX_AUDIO) return { ok: false, error: 'audio_size' };

  const mime = String(mimeType || 'audio/ogg');
  const ext = /mp4|m4a/.test(mime) ? 'm4a' : /webm/.test(mime) ? 'webm' : /mpeg|mp3/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : 'ogg';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), `voice.${ext}`);
  form.append('model', 'whisper-1');
  // lingua: 'it' di default (l'operatore parla italiano); null = riconoscila
  const lang = opts.language === null ? null : (opts.language || 'it');
  if (lang) form.append('language', lang);

  try {
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!r.ok) {
      console.error('[stt] openai', r.status, (await r.text()).slice(0, 200));
      return { ok: false, error: 'stt_failed' };
    }
    const j = await r.json();
    return { ok: true, text: String(j.text || '').trim().slice(0, opts.maxChars || 1200) };
  } catch (e) {
    console.error('[stt]', e.message);
    return { ok: false, error: 'stt_failed' };
  }
}

export { MAX_AUDIO };
