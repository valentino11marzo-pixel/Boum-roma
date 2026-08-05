// api/reunion-lead.js
// Public lead-capture endpoint for the /reunion landing page (BOOM La Réunion).
//
// The page speaks to THREE audiences on purpose — propriétaires who want their
// home managed, locataires looking for one, and acheteurs buying from a
// distance — so the single thing this endpoint must never lose is WHICH of the
// three wrote in. It lands in `leadType` AND in the first words of the human
// summary. The summary is what actually carries it: `leadType` is written by
// several endpoints but READ by no page (portal.html and cockpit-preview.html
// show service/zone/budget and the message), so the operator's real cue is the
// line they see — which is why it starts with PROPRIÉTAIRE / LOCATAIRE /
// ACHETEUR in capitals rather than hiding the side in a field.
//
// Same shape as /api/canone-lead: a `leads` doc with status='new',
// source='web' — so a Réunion lead rides the EXISTING machine (Lead Brain →
// notify-pending → Commerciale) with nothing new to build.
//
// Abuse protection is identical to the other public forms (no shared secret
// exists on a page anyone can open):
//   - honeypot field (`company` must be empty)
//   - required name + (email or phone), length caps
//   - best-effort per-IP rate limit (warm-instance memory)
//
// Method: POST   Body: { role, name, email, phone, commune, message,
//                        budget, moveIn, propertyKind, lang, company(honeypot) }
// Response 200: { ok: true, id } | 4xx/5xx: { ok: false, error }

import { fsCreate, logActivity } from './homie/_lib.js';

// ── Best-effort in-memory rate limit (per warm instance) ──
const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear(); // crude memory guard
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num = v => {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Honeypot: real users never fill this. Answer 200 so the bot learns nothing.
  if (body.company) return res.status(200).json({ ok: true, id: 'skip' });

  const name  = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);

  const hasEmail = email && email.includes('@') && email.includes('.');
  const hasPhone = phone && /\d{6,}/.test(phone.replace(/\D/g, ''));
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
  if (!hasEmail && !hasPhone) return res.status(400).json({ ok: false, error: 'contact_required' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  // ── The one field that decides how the operator answers ──
  const role = String(body.role || '').toLowerCase();
  const side = ['buyer', 'acheteur', 'acquereur', 'acquéreur'].includes(role) ? 'buyer'
    : ['owner', 'landlord', 'proprietaire', 'propriétaire'].includes(role) ? 'owner'
    : 'tenant';
  const isOwner = side === 'owner';
  const isBuyer = side === 'buyer';
  // `buyer` is a NEW third value. Safe to introduce: leadType is written by
  // several endpoints and read by none — nothing filters on it today.
  const leadType = isOwner ? 'landlord' : isBuyer ? 'buyer' : 'tenant';

  const commune = clip(body.commune, 80);
  const message = clip(body.message, 1000);
  const budget  = num(body.budget);
  const moveIn  = clip(body.moveIn, 40);
  const kind    = clip(body.propertyKind, 60);
  const purpose = clip(body.purpose, 60);   // buyer only: usage du bien

  // Human-readable summary for the portal Leads inbox + the Telegram card.
  const parts = [];
  if (commune) parts.push(commune);
  if (isOwner) {
    if (kind) parts.push(kind);
  } else if (isBuyer) {
    // A purchase budget is a TOTAL, not a monthly rent: printing "€/mois"
    // next to 320000 would read as a catastrophic misunderstanding of the
    // one number that matters to this person.
    if (budget) parts.push(`budget ~${budget.toLocaleString('fr-FR')} €`);
    if (kind) parts.push(kind);
    if (purpose) parts.push(purpose);
  } else {
    if (budget) parts.push(`budget ~${budget}€/mois`);
    if (moveIn) parts.push(`emménagement ${moveIn}`);
  }
  const head = isOwner ? 'PROPRIÉTAIRE — La Réunion'
    : isBuyer ? 'ACHETEUR — La Réunion'
    : 'LOCATAIRE — La Réunion';
  const summary = [
    `${head}${parts.length ? ' · ' + parts.join(' · ') : ''}.`,
    message,
  ].filter(Boolean).join(' ');

  // The visitor's own words decide the language we answer in. The page is
  // French-first, so 'fr' is the honest default here — replyLang() maps an
  // unknown language to English rather than Italian, which is the right
  // fallback for a French speaker and the wrong one for nobody.
  const lang = body.lang === 'en' ? 'en' : 'fr';

  const now = new Date();
  const lead = {
    source: 'web',                 // valid source read by portal + cockpit
    service: 'BOOM La Réunion',
    market: 'reunion',
    leadType,
    name, email: email || null, phone: phone || null,
    message: summary,
    notes: summary,
    language: lang,
    zone: commune,
    budget: isOwner ? null : budget,
    budgetKind: isBuyer ? 'purchase' : (isOwner ? null : 'monthly'),
    moveIn: isOwner || isBuyer ? null : moveIn,
    purpose: isBuyer ? purpose : null,
    intent: isOwner ? 'reunion_owner' : isBuyer ? 'reunion_buyer' : 'reunion_tenant',
    status: 'new',
    grade: null,
    propertyAddress: isOwner ? commune : null,
    // audit
    ingestedBy: 'reunion-lead',
    sourceRef: 'reunion',
    raw: { role: leadType, commune, budget, moveIn, propertyKind: kind, purpose, message, lang, ip },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity('Lead da BOOM La Réunion', 'lead', { leadId: id, leadType, commune, budget }, 'reunion-lead');

    // Fire-and-forget: the lead is already saved, so a failed notify only
    // means the operator hears about it on the next pulse instead of now.
    fsCreate('agentNotifications', {
      type: 'lead.new',
      summary: `🇷🇪 ${head} · ${name}${commune ? ' · ' + commune : ''}` +
        (budget ? ` · ${budget.toLocaleString('fr-FR')} €${isBuyer ? '' : '/mois'}` : ''),
      priority: 'high',
      ref: { collection: 'leads', id },
      payload: { name, email, phone, commune, budget, leadType, source: 'reunion-lead' },
      dedupKey: `lead-${id}`,
      status: 'pending',
      actor: 'reunion-lead',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }).catch(e => console.warn('[reunion-lead] notify failed:', e.message));

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[reunion-lead]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
