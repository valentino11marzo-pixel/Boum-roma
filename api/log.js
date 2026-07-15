// api/log.js — raccoglitore degli errori client (js/boom-err.js).
// Scrive su console.error (→ Vercel runtime logs, interrogabili) e,
// best-effort, su Firestore `clientErrors` per la visibilità storica.
// Pubblico ma inoffensivo: payload piccolo, campi tagliati, rate-limit
// per IP, nessuna risposta con dati.

import { fsCreate } from './homie/_lib.js';

const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');
const hits = new Map(); // ip → { n, t }
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n++;
  return h.n > MAX_PER_WINDOW;
}

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(204).end();

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  if (!b || typeof b !== 'object') b = {};

  const entry = {
    kind: clip(b.kind, 30) || 'error',
    message: clip(b.message, 500),
    source: clip(b.source, 300),
    line: Number(b.line) || 0,
    col: Number(b.col) || 0,
    stack: clip(b.stack, 1500),
    page: clip(b.page, 300),
    ua: clip(b.ua, 200),
    ts: clip(b.ts, 40) || new Date().toISOString(),
    ip,
  };
  if (!entry.message) return res.status(204).end();

  console.error('[client-error]', JSON.stringify(entry));
  try { await fsCreate('clientErrors', entry); } catch (e) { /* best-effort */ }
  return res.status(204).end();
}
