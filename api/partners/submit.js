// api/partners/submit.js
// I PARTNER ISTITUZIONALI ENTRANO IN PIPELINE.
//
// Quattro pagine (università, aziende, centri di ricerca, proprietari) hanno
// un modulo, e tutti e quattro finivano su Web3Forms: una email a un servizio
// esterno. Quindi l'ufficio housing di una università — il canale gratuito
// numero uno secondo docs/university-outreach.md — compilava il form e NON
// diventava un lead: nessuno lo vedeva nel portale, il Lead Brain non lo
// classificava, nessun follow-up sistematico. Un canale che vale una coorte
// di studenti a semestre trattato peggio di un WhatsApp qualsiasi.
//
// Qui la segnalazione diventa un lead nello stesso schema che leggono già
// portale, Brain e Commerciale, con in più il TIPO di partner e un codice
// tracciabile da dare all'ufficio: senza codice non si sa mai quale
// convenzione porta studenti, e un canale che non si misura non si difende.
//
// Method: POST · body { kind(university|corporate|research|owner),
//   name, email, org?, role?, country?, volume?, message?, phone?,
//   company(honeypot) }
// → 200 { ok, id, code }

import { fsCreate, logActivity } from '../homie/_lib.js';
import { tgSend } from '../telegram/_lib.js';

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

const clip = (v, n = 200) => (v == null ? '' : String(v).trim().slice(0, n));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export const KINDS = {
  university: { label: 'Università / study-abroad', emoji: '🎓', intent: 'partner-university' },
  corporate:  { label: 'Azienda',                   emoji: '🏢', intent: 'partner-corporate' },
  research:   { label: 'Centro di ricerca',         emoji: '🔬', intent: 'partner-research' },
  owner:      { label: 'Proprietario',              emoji: '🔑', intent: 'owner' },
};

/**
 * Il codice della convenzione, derivato dal nome dell'ente: `JCU-2026`,
 * `LUISS-2026`. Serve a sapere QUALE ufficio porta studenti — l'unico modo
 * per difendere un canale è misurarlo. Deterministico: lo stesso ente
 * ricontattato l'anno dopo ottiene lo stesso codice, quindi i numeri non si
 * sparpagliano su due etichette diverse.
 */
export function partnerCode(org, year) {
  const y = year || new Date().getUTCFullYear();
  const words = String(org || '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !['THE', 'OF', 'DI', 'DEGLI', 'DELLA', 'UNIVERSITY', 'UNIVERSITA', 'UNIVERSITÀ'].includes(w));
  if (!words.length) return 'PARTNER-' + y;
  // Sigla se sono più parole (John Cabot University → JC), altrimenti le
  // prime lettere (Sapienza → SAPIENZA).
  const base = words.length > 1
    ? words.map(w => w[0]).join('').slice(0, 6)
    : words[0].slice(0, 8);
  return base + '-' + y;
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

  const kindKey = clip(body.kind, 20).toLowerCase();
  const kind = KINDS[kindKey];
  if (!kind) return res.status(400).json({ ok: false, error: 'unknown_kind' });

  const name = clip(body.name, 120);
  const email = clip(body.email, 160);
  const org = clip(body.org, 160);
  const role = clip(body.role, 120);
  const country = clip(body.country, 80);
  const volume = clip(body.volume, 80);
  const phone = clip(body.phone, 40);
  const note = clip(body.message, 600);

  if (!name || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'contact_required' });
  }

  const code = partnerCode(org || name);
  const bits = [`${kind.label}${org ? ': ' + org : ''}`];
  if (role) bits.push(role);
  if (country) bits.push(country);
  if (volume) bits.push(volume + ' persone/anno');
  if (note) bits.push(note);
  const message = bits.join(' · ');

  const now = new Date();
  const lead = {
    source: 'partner',
    service: null,
    name,
    email,
    phone: phone || null,
    message,
    notes: message,
    language: null,          // la decide replyLang dalle parole di chi scrive
    budget: null,
    zone: null,
    situation: null,
    propertyId: null, propertyTitle: null, propertyPrice: null, propertyAddress: null,
    intakeForm: false,
    status: 'new',
    grade: null,
    // Un ente non è un lead da qualificare come un inquilino: è già
    // qualificato per definizione. Il grade lo mette comunque il Brain, ma
    // l'intent dice al Commerciale con che voce rispondere.
    intent: kind.intent,
    confidence: null,
    tier: null,
    ingestedBy: 'partners',
    sourceRef: code,
    partner: {
      kind: kindKey,
      org: org || null,
      role: role || null,
      country: country || null,
      volume: volume || null,
      code,
      utm: `https://www.boomrome.com/apartments?utm_source=partner&utm_medium=referral&utm_campaign=${encodeURIComponent(code)}`,
      at: now.toISOString(),
    },
    raw: { ip, ua: clip(req.headers['user-agent'], 300) },
    createdAt: now,
    ingestedAt: now,
  };

  let id = null;
  try {
    ({ id } = await fsCreate('leads', lead));
  } catch (err) {
    console.error('[partners/submit] write failed:', err.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }

  logActivity(`Partner ${kindKey}: ${org || name}`, 'lead', { leadId: id, code }, 'web').catch(() => {});

  // Un ente che si propone è raro e prezioso: l'operatore lo deve sapere
  // adesso, non alla prossima apertura del portale.
  tgSend(process.env.TELEGRAM_CHAT_ID, [
    `${kind.emoji} <b>Nuovo partner: ${esc(kind.label)}</b>`,
    org ? `<b>${esc(org)}</b>` : '',
    `${esc(name)}${role ? ' · ' + esc(role) : ''}`,
    `✉️ ${esc(email)}${phone ? ' · 📱 ' + esc(phone) : ''}`,
    volume ? `Volume dichiarato: ${esc(volume)}` : '',
    country ? `Paese: ${esc(country)}` : '',
    note ? `\n<i>${esc(note.slice(0, 300))}</i>` : '',
    `\nCodice convenzione: <code>${esc(code)}</code>`,
  ].filter(Boolean).join('\n')).catch(() => {});

  return res.status(200).json({ ok: true, id, code });
}
