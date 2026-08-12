// api/referral/submit.js
// IL REFERRAL CHE VALE QUALCOSA.
//
// Il codice `BOOM-XXXXXX` esisteva già in /casa e la pagina /refer prometteva
// già €50+€50 — ma il modulo finiva su Web3Forms, un servizio esterno: chi
// veniva presentato da un inquilino NON diventava mai un lead. Nessuno lo
// vedeva nel portale, il Lead Brain non lo classificava, notify-pending non lo
// mandava sul telefono, il Commerciale non rispondeva. La promessa era vera e
// la macchina dietro non esisteva.
//
// Questo endpoint chiude il cerchio: la segnalazione diventa un lead nello
// STESSO schema che leggono già portale, Brain e Commerciale, con in più chi
// l'ha mandata — così il credito si può davvero riconoscere.
//
// Method: POST · body { referrerName, referrerEmail, referrerCode?,
//                       friendName, friendEmail?, friendPhone?, note?,
//                       company(honeypot) }
// → 200 { ok, id }

import { fsCreate, logActivity } from '../homie/_lib.js';

const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) for (const k of [...HITS.keys()].slice(0, 1000)) HITS.delete(k);
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 160) => (v == null ? '' : String(v).trim().slice(0, n));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Il valore del credito, in un posto solo: pagina, /casa ed email devono
 *  dire lo stesso numero — una promessa che varia non è una promessa. */
export const REFERRAL_EUR = 50;

/** `BOOM-A1B2C3` — quello che /casa mostra all'inquilino. Normalizzato
 *  (maiuscole, prefisso opzionale) perché la gente lo ricopia a mano. */
export function normalizeCode(input) {
  const raw = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return null;
  const m = raw.match(/^(?:BOOM-)?([A-Z0-9]{4,12})$/);
  return m ? 'BOOM-' + m[1] : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });
  if (body.company) return res.status(200).json({ ok: true, id: null }); // honeypot

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const referrerName = clip(body.referrerName, 120);
  const referrerEmail = clip(body.referrerEmail, 160);
  const referrerCode = normalizeCode(body.referrerCode);
  const friendName = clip(body.friendName, 120);
  const friendEmail = clip(body.friendEmail, 160);
  const friendPhone = clip(body.friendPhone, 40);
  const note = clip(body.note, 400);

  // Serve chi presenta (per riconoscere il credito) e almeno un modo per
  // raggiungere l'amico — senza, non c'è nulla da lavorare.
  if (!referrerName || !EMAIL_RE.test(referrerEmail)) {
    return res.status(400).json({ ok: false, error: 'referrer_required' });
  }
  const reachable = EMAIL_RE.test(friendEmail) || friendPhone.replace(/\D/g, '').length >= 6;
  if (!friendName || !reachable) {
    return res.status(400).json({ ok: false, error: 'friend_required' });
  }

  const bits = [`Referred by ${referrerName}${referrerCode ? ' (' + referrerCode + ')' : ''}`];
  if (note) bits.push(note);
  const message = bits.join(' · ');

  const now = new Date();
  // Stesso schema di apply-lead / leads-scan-inbox: da qui in poi il lead è
  // indistinguibile dagli altri e tutta la macchina esistente lo lavora.
  const lead = {
    source: 'referral',
    service: null,
    name: friendName,
    email: EMAIL_RE.test(friendEmail) ? friendEmail : null,
    phone: friendPhone || null,
    message,
    notes: message,
    language: null,          // la deciderà replyLang dalle parole della persona
    budget: null,
    zone: null,
    situation: null,
    propertyId: null,
    propertyTitle: null,
    propertyPrice: null,
    propertyAddress: null,
    intakeForm: false,
    status: 'new',
    grade: null,
    intent: 'referral',
    confidence: null,
    tier: null,
    ingestedBy: 'referral',
    sourceRef: referrerCode || referrerEmail,
    // Chi ha presentato chi: è questo che rende il credito riconoscibile
    // quando il contratto si chiude davvero.
    referral: {
      byName: referrerName,
      byEmail: referrerEmail,
      byCode: referrerCode || null,
      rewardEur: REFERRAL_EUR,
      rewardStatus: 'pending',
      at: now.toISOString(),
    },
    raw: { ip, ua: clip(req.headers['user-agent'], 300) },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity(
      `Referral: ${referrerName} → ${friendName}`,
      'lead',
      { leadId: id, byCode: referrerCode || null },
      'web'
    ).catch(() => {});
    return res.status(200).json({ ok: true, id, rewardEur: REFERRAL_EUR });
  } catch (err) {
    console.error('[referral/submit] write failed:', err.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }
}
