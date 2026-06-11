// api/media/caption.js
// Copywriter AI per il Media Studio (/media-studio).
//
// Pubblico ma non abusabile come proxy generico:
//   - Il prompt è costruito INTERAMENTE lato server da campi whitelistati
//     e troncati (zona/prezzo/locali/mq/extra ≤ 120 char ciascuno)
//   - Modello e max_tokens fissati lato server (haiku, 500 token)
//   - Rate limit per IP: 8 richieste / 60s (best effort, in-memory)
//   - POST only; CORS: boomrome.com + anteprime *.vercel.app
//   - Logging strutturato di ogni reject e successo (come parse-docs.js)

const ALLOWED_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 500;
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 60_000;

const TIPI = {
  'ig-post':  'un post Instagram (caption con 2-3 frasi evocative, emoji sobrie, e 8-10 hashtag pertinenti su Roma e affitti premium alla fine)',
  'ig-story': 'una story Instagram (1-2 frasi brevissime e d\'impatto, massimo 120 caratteri, con una call-to-action)',
  'portale':  'un annuncio per portali immobiliari (titolo accattivante + descrizione professionale di 60-90 parole, senza emoji)',
  'breve':    'un messaggio WhatsApp breve ed elegante da inviare a un cliente interessato (2-3 frasi, professionale ma caldo)',
};

const rateLimitMap = new Map(); // ip -> { count, windowStart }

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const ok = /^https:\/\/(www\.)?boomrome\.com$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)
    || /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

function logEvent(obj) {
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj })); }
  catch { console.log('media-caption: log serialization failed'); }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    if (rateLimitMap.size > 1000) {
      const cutoff = now - 2 * RATE_LIMIT_WINDOW_MS;
      for (const [k, v] of rateLimitMap) if (v.windowStart < cutoff) rateLimitMap.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

// Campo utente: troncato, una riga, niente caratteri di controllo.
function field(v) {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = getClientIp(req);
  if (req.method !== 'POST') {
    logEvent({ event: 'media-caption-reject', reason: 'method', method: req.method, ip });
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    logEvent({ event: 'media-caption-reject', reason: 'server-missing-anthropic-key', ip });
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (!checkRateLimit(ip)) {
    logEvent({ event: 'media-caption-reject', reason: 'rate-limit', ip });
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Troppe richieste — riprova tra un minuto' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const tipo = TIPI[body.tipo] ? body.tipo : 'ig-post';
  const lingua = body.lingua === 'en' ? 'en' : 'it';
  const zona = field(body.zona);
  const prezzo = field(body.prezzo);
  const locali = field(body.locali);
  const mq = field(body.mq);
  const extra = field(body.extra);

  const dati = [
    zona && `Zona: ${zona}`,
    prezzo && `Prezzo: ${prezzo}`,
    locali && `Locali: ${locali}`,
    mq && `Superficie: ${mq}`,
    extra && `Punti di forza: ${extra}`,
  ].filter(Boolean).join('\n') || 'Appartamento premium a Roma (dettagli non forniti: resta generico ma elegante).';

  const system = 'Sei il copywriter di BOOM Roma (boomrome.com), agenzia premium di affitti '
    + 'residenziali a Roma. Tono: elegante, essenziale, luxury ma concreto — mai gonfiato, '
    + 'mai clickbait. Non inventare dettagli non forniti (piano, balcone, metratura). '
    + 'Rispondi SOLO con il testo richiesto, senza preamboli né commenti.';

  const prompt = `Scrivi ${TIPI[tipo]} per questo immobile in affitto:\n\n${dati}\n\n`
    + (lingua === 'en' ? 'Scrivi il testo in INGLESE.' : 'Scrivi il testo in ITALIANO.');

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ALLOWED_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data || !Array.isArray(data.content)) {
      logEvent({ event: 'media-caption-error', ip, upstreamStatus: upstream.status });
      return res.status(502).json({ error: 'Generazione non riuscita' });
    }
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    logEvent({ event: 'media-caption-ok', ip, tipo, lingua, chars: text.length });
    return res.status(200).json({ text });
  } catch (err) {
    logEvent({ event: 'media-caption-error', ip, message: err?.message || 'unknown' });
    return res.status(502).json({ error: 'Upstream request failed' });
  }
}
