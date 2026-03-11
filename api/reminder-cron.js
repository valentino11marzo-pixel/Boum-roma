// api/reminder-cron.js
// Vercel Cron Job — runs every 15 minutes
// Sends reminder emails 3h and 30min before confirmed viewings
// Schedule in vercel.json: "*/15 * * * *"

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

// ─── Firebase Admin init ──────────────────
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

// ─── Email transport (Gmail via App Password) ─
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,       // valentino@boomrome.com (or gmail)
    pass: process.env.GMAIL_APP_PASS,   // 16-char App Password from Google
  },
});

// ─── Email template ───────────────────────
function buildReminderEmail({ clientName, listingName, listingZone, confirmedDateTime, isAgent, minutesBefore }) {
  const dt = new Date(confirmedDateTime);
  const dtStr = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) +
    ' · ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const when = minutesBefore === 180 ? '3 hours' : '30 minutes';
  const prop = listingName + (listingZone ? ` — ${listingZone}` : '');

  const subject = isAgent
    ? `⏰ Viewing in ${when} — ${clientName} · ${listingName}`
    : `⏰ Reminder: Your viewing is in ${when}`;

  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0C0C0C;font-family:'Helvetica Neue',Helvetica,sans-serif">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:28px">
    <div style="width:8px;height:8px;background:#D4AF37;border-radius:50%"></div>
    <span style="font-size:11px;font-weight:300;letter-spacing:0.3em;text-transform:uppercase;color:#888">BOOM ROME</span>
  </div>
  <div style="background:#111;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden">
    <div style="height:2px;background:linear-gradient(90deg,#D4AF37,#F5D98B)"></div>
    <div style="padding:24px 22px">
      <div style="font-size:9px;font-weight:400;letter-spacing:0.12em;text-transform:uppercase;color:#555;margin-bottom:8px">Reminder</div>
      <div style="font-size:20px;font-weight:300;letter-spacing:-0.02em;color:#F2F2F2;margin-bottom:4px">
        ${isAgent ? `Viewing in ${when}.` : `Your viewing is in ${when}.`}
      </div>
      <div style="font-size:13px;font-weight:300;color:#888;margin-bottom:20px">
        ${isAgent ? `${clientName} is coming to see ${prop}.` : `You're visiting ${prop}.`}
      </div>
      <div style="background:#0C0C0C;border:1px solid rgba(255,255,255,0.06);border-radius:10px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div style="width:26px;height:26px;background:#1A1A1A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.7">🏠</div>
          <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#444;margin-bottom:2px">Property</div><div style="font-size:13px;font-weight:300;color:#F2F2F2">${prop}</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div style="width:26px;height:26px;background:#1A1A1A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.7">📅</div>
          <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#444;margin-bottom:2px">When</div><div style="font-size:13px;font-weight:300;color:#F2F2F2">${dtStr}</div></div>
        </div>
        ${!isAgent ? `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px">
          <div style="width:26px;height:26px;background:#1A1A1A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.7">👤</div>
          <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#444;margin-bottom:2px">Agent</div><div style="font-size:13px;font-weight:300;color:#F2F2F2">Valentino — BOOM Rome</div></div>
        </div>` : `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px">
          <div style="width:26px;height:26px;background:#1A1A1A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.7">👤</div>
          <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#444;margin-bottom:2px">Client</div><div style="font-size:13px;font-weight:300;color:#F2F2F2">${clientName}</div></div>
        </div>`}
      </div>
      ${!isAgent ? `
      <div style="margin-top:16px;font-size:11px;color:#555;line-height:1.8">
        Bring a valid ID · Arrive 5 minutes early<br>
        <a href="https://wa.me/393313251961" style="color:#D4AF37;text-decoration:none;opacity:.8">WhatsApp Valentino →</a>
      </div>` : ''}
    </div>
  </div>
  <div style="margin-top:20px;font-size:10px;color:#333;text-align:center">BOOM · Egidi Immobiliare S.r.l. · Rome</div>
</div>
</body></html>`;

  return { subject, html };
}

// ─── Main handler ─────────────────────────
export default async function handler(req, res) {
  // Verify it's a cron call (Vercel adds this header)
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const results = { checked: 0, sent3h: 0, sent30m: 0, errors: [] };

  try {
    // Get all confirmed viewings where reminders haven't been sent
    const snap = await db.collection('viewingRequests')
      .where('status', '==', 'confirmed')
      .get();

    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    results.checked = docs.length;

    for (const v of docs) {
      if (!v.confirmedDateTime) continue;

      const viewingDT = new Date(v.confirmedDateTime);
      const minsUntil = (viewingDT.getTime() - now.getTime()) / 60000;

      // ── 3-hour reminder (window: 165–195 min = 3h ± 15min) ──
      if (!v.reminder3hSent && minsUntil >= 165 && minsUntil <= 195) {
        try {
          const { subject: cs, html: ch } = buildReminderEmail({ ...v, isAgent: false, minutesBefore: 180 });
          const { subject: as, html: ah } = buildReminderEmail({ ...v, isAgent: true,  minutesBefore: 180 });

          await transporter.sendMail({ from: `BOOM Rome <${process.env.GMAIL_USER}>`, to: v.clientEmail,                     subject: cs, html: ch });
          await transporter.sendMail({ from: `BOOM Rome <${process.env.GMAIL_USER}>`, to: 'valentino@boomrome.com', subject: as, html: ah });

          await db.collection('viewingRequests').doc(v.id).update({ reminder3hSent: true });
          results.sent3h++;
        } catch (e) { results.errors.push(`3h reminder ${v.id}: ${e.message}`); }
      }

      // ── 30-min reminder (window: 15–45 min = 30m ± 15min) ──
      if (!v.reminder30mSent && minsUntil >= 15 && minsUntil <= 45) {
        try {
          const { subject: cs, html: ch } = buildReminderEmail({ ...v, isAgent: false, minutesBefore: 30 });
          const { subject: as, html: ah } = buildReminderEmail({ ...v, isAgent: true,  minutesBefore: 30 });

          await transporter.sendMail({ from: `BOOM Rome <${process.env.GMAIL_USER}>`, to: v.clientEmail,                     subject: cs, html: ch });
          await transporter.sendMail({ from: `BOOM Rome <${process.env.GMAIL_USER}>`, to: 'valentino@boomrome.com', subject: as, html: ah });

          await db.collection('viewingRequests').doc(v.id).update({ reminder30mSent: true });
          results.sent30m++;
        } catch (e) { results.errors.push(`30m reminder ${v.id}: ${e.message}`); }
      }
    }

    return res.status(200).json({ ok: true, timestamp: now.toISOString(), ...results });
  } catch (e) {
    console.error('Cron error:', e);
    return res.status(500).json({ error: e.message });
  }
}
