// api/apply-lead.js
// Public lead-capture endpoint for the apartment-detail Apply form.
//
// Delivery is DUAL-SINK so a lead is never lost and needs zero Firebase setup:
//   1) Email (primary, always works) — the application is emailed to the team
//      inbox via the same Gmail transport reminder-cron.js already uses
//      (GMAIL_USER / GMAIL_APP_PASS). Reply-To is the applicant.
//   2) Firestore `leads` (best-effort) — same shape portal.html + cockpit read
//      (source='web', status='new'). Firestore rules gate `leads` writes to
//      admins; the server signs in as FIREBASE_ADMIN_EMAIL, but that account
//      only counts as admin once a /users/{uid} doc with role:'admin' exists.
//      Until then this write 403s — so we treat it as best-effort and DON'T
//      fail the request on it. The moment the admin doc is seeded, leads start
//      populating the portal automatically with no code change.
//
// Public (no shared secret) with layered abuse protection — honeypot, required
// name + (email or phone), length caps, and a best-effort per-IP rate limit.
//
// Method: POST
// Body: { name, email, phone, company(honeypot), listingId, listingName,
//         moveIn, duration, occupants, message }
// Response 200: { ok: true, id }  | 4xx/5xx: { ok: false, error }

import nodemailer from 'nodemailer';
import { fsCreate, logActivity } from './homie/_lib.js';

const TEAM_INBOX = process.env.LEADS_INBOX || 'valentino@boomrome.com';

// ── Best-effort in-memory rate limit (per warm instance) ──
const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear(); // crude memory guard
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let _transporter = null;
function transporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
  });
  return _transporter;
}

function buildEmail({ name, email, phone, listingName, listingId, moveIn, duration, occupants, note, ip }) {
  const waDigits = (phone || '').replace(/[^\d]/g, '');
  const row = (label, value) => value
    ? `<tr><td style="padding:6px 14px 6px 0;color:#9a9a9a;font:13px/1.5 -apple-system,Helvetica,Arial,sans-serif;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 0;color:#111;font:14px/1.55 -apple-system,Helvetica,Arial,sans-serif">${value}</td></tr>`
    : '';
  const mailto = email ? `<a href="mailto:${esc(email)}" style="color:#0a7d2c;text-decoration:none">${esc(email)}</a>` : '';
  const tel = phone ? `<a href="tel:${esc(phone)}" style="color:#111;text-decoration:none">${esc(phone)}</a>` : '';
  const wa = waDigits ? ` &nbsp;·&nbsp; <a href="https://wa.me/${waDigits}" style="color:#0a7d2c;text-decoration:none">WhatsApp</a>` : '';
  const subject = `New application · ${listingName || 'an apartment'} · ${name || 'lead'}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e6e6e6;border-radius:14px;overflow:hidden">
      <tr><td style="background:#0a0a0a;padding:18px 24px">
        <div style="color:#D4AF37;font:600 12px/1 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:3px;text-transform:uppercase">BOOM · New Application</div>
        <div style="color:#fff;font:300 22px/1.3 -apple-system,Helvetica,Arial,sans-serif;margin-top:8px">${esc(listingName || 'an apartment')}</div>
      </td></tr>
      <tr><td style="padding:20px 24px 8px">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          ${row('Name', esc(name))}
          ${row('Email', mailto)}
          ${row('Phone', tel + wa)}
          ${row('Listing ID', esc(listingId))}
          ${row('Move-in', esc(moveIn))}
          ${row('Stay', esc(duration))}
          ${row('Occupants', esc(occupants))}
          ${row('Message', esc(note))}
        </table>
      </td></tr>
      <tr><td style="padding:8px 24px 22px">
        <div style="color:#9a9a9a;font:12px/1.5 -apple-system,Helvetica,Arial,sans-serif">Reply to this email to reach the applicant directly. · IP ${esc(ip || '—')}</div>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = [
    `New application — ${listingName || 'an apartment'}`,
    `Name: ${name || '—'}`,
    `Email: ${email || '—'}`,
    `Phone: ${phone || '—'}`,
    listingId ? `Listing ID: ${listingId}` : '',
    moveIn ? `Move-in: ${moveIn}` : '',
    duration ? `Stay: ${duration}` : '',
    occupants ? `Occupants: ${occupants}` : '',
    note ? `Message: ${note}` : '',
  ].filter(Boolean).join('\n');
  return { subject, html, text };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── TEMP env/SMTP check (GET ?diag2=boomdiag9) — verifies Gmail auth without
  // sending mail. Remove after confirming. ──
  if (req.method === 'GET' && req.query && req.query.diag2 === 'boomdiag9') {
    const out = {
      hasGmailUser: !!process.env.GMAIL_USER,
      hasGmailPass: !!process.env.GMAIL_APP_PASS,
      hasFirebaseAdmin: !!process.env.FIREBASE_ADMIN_EMAIL,
    };
    try { await transporter().verify(); out.smtpVerify = true; }
    catch (e) { out.smtpVerify = false; out.smtpErr = String((e && e.message) || e).slice(0, 200); }
    return res.status(200).json(out);
  }

  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Honeypot: real users never fill this.
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

  const listingId   = clip(body.listingId, 120);
  const listingName = clip(body.listingName, 160) || 'an apartment';
  const moveIn      = clip(body.moveIn, 40);
  const duration    = clip(body.duration, 40);
  const occupants   = clip(body.occupants, 40);
  const note        = clip(body.message, 600);

  // Human-readable summary for the portal Leads inbox.
  const parts = [`Application for ${listingName}`];
  if (moveIn)    parts.push(`move-in ${moveIn}`);
  if (duration)  parts.push(`stay ${duration}`);
  if (occupants) parts.push(occupants);
  let summary = parts.join(' · ') + '.';
  if (note) summary += ` — “${note}”`;

  const now = new Date();
  const lead = {
    source: 'web',                       // valid source read by portal + cockpit
    service: 'Apartment Application',
    leadType: 'tenant',
    name, email: email || null, phone: phone || null,
    message: summary,
    notes: summary,
    language: 'en',
    listingId: listingId || null,
    listingName,
    moveIn: moveIn || null,
    duration: duration || null,
    occupants: occupants || null,
    intent: 'apply',
    status: 'new',
    grade: null,
    // audit
    ingestedBy: 'apply_form',
    sourceRef: 'apartment-detail',
    raw: { listingId, listingName, moveIn, duration, occupants, note, ip },
    createdAt: now,
    ingestedAt: now,
  };

  // ── Sink 1: Firestore (best-effort — won't fail the request) ──
  let firestoreId = null;
  try {
    const { id } = await fsCreate('leads', lead);
    firestoreId = id;
    logActivity('Application da scheda appartamento', 'lead', { leadId: id, listingId, listingName }, 'apply_form');
  } catch (err) {
    console.error('[apply-lead] firestore non-fatal:', String((err && err.message) || err).slice(0, 200));
  }

  // ── Sink 2: Email (primary guarantee) ──
  let emailed = false;
  try {
    const { subject, html, text } = buildEmail({ name, email, phone, listingName, listingId, moveIn, duration, occupants, note, ip });
    await transporter().sendMail({
      from: `BOOM Rome <${process.env.GMAIL_USER}>`,
      to: TEAM_INBOX,
      replyTo: hasEmail ? email : undefined,
      subject, html, text,
    });
    emailed = true;
  } catch (err) {
    console.error('[apply-lead] email failed:', String((err && err.message) || err).slice(0, 200));
  }

  if (firestoreId || emailed) {
    return res.status(200).json({ ok: true, id: firestoreId || 'emailed' });
  }
  console.error('[apply-lead] BOTH sinks failed');
  return res.status(500).json({ ok: false, error: 'internal' });
}
