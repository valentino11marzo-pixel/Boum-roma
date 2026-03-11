// api/reminder-cron.js
// Vercel Cron Job — runs every 15 minutes
// Uses Firebase REST API (no service account key needed)
// Env vars required:
//   FIREBASE_API_KEY        → Web API key from Firebase console
//   FIREBASE_ADMIN_EMAIL    → valentino@boomrome.com
//   FIREBASE_ADMIN_PASS     → your portal password
//   FIREBASE_PROJECT_ID     → boom-property-dashboards
//   GMAIL_USER              → valentino@boomrome.com
//   GMAIL_APP_PASS          → 16-char app password
//   CRON_SECRET             → boom-cron-2026

import nodemailer from 'nodemailer';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const API_KEY    = process.env.FIREBASE_API_KEY;

async function getFirebaseToken() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.FIREBASE_ADMIN_EMAIL,
        password: process.env.FIREBASE_ADMIN_PASS,
        returnSecureToken: true,
      }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error('Firebase auth failed: ' + JSON.stringify(data));
  return data.idToken;
}

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function fsQuery(collection, token, filter) {
  const body = { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: filter } } };
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function fsPatch(docPath, fields, token) {
  const updateMask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  await fetch(`${FS_BASE}/${docPath}?${updateMask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

function fsVal(v) {
  if (!v) return null;
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.timestampValue !== undefined) return v.timestampValue;
  return null;
}

function parseDoc(doc) {
  if (!doc?.fields) return null;
  const obj = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields)) obj[k] = fsVal(v);
  return obj;
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
});

function buildEmail({ clientName, listingName, listingZone, confirmedDateTime, isAgent, minutesBefore }) {
  const dt = new Date(confirmedDateTime);
  const dtStr = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) +
    ' · ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const when = minutesBefore === 180 ? '3 hours' : '30 minutes';
  const prop = listingName + (listingZone ? ` — ${listingZone}` : '');
  const subject = isAgent
    ? `⏰ Viewing in ${when} — ${clientName} · ${listingName}`
    : `⏰ Reminder: Your viewing is in ${when}`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0C0C0C;font-family:'Helvetica Neue',Helvetica,sans-serif">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
  <div style="margin-bottom:24px"><span style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#888">● BOOM ROME</span></div>
  <div style="background:#111;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden">
    <div style="height:2px;background:linear-gradient(90deg,#D4AF37,#F5D98B)"></div>
    <div style="padding:24px 22px">
      <div style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#555;margin-bottom:8px">Reminder</div>
      <div style="font-size:20px;font-weight:300;color:#F2F2F2;margin-bottom:4px">${isAgent ? `Viewing in ${when}.` : `Your viewing is in ${when}.`}</div>
      <div style="font-size:13px;color:#888;margin-bottom:20px">${isAgent ? `${clientName} is coming to see ${prop}.` : `You're visiting ${prop}.`}</div>
      <div style="background:#0C0C0C;border:1px solid rgba(255,255,255,0.06);border-radius:10px">
        <div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#444;margin-bottom:2px">Property</div>
          <div style="font-size:13px;color:#F2F2F2">${prop}</div>
        </div>
        <div style="padding:12px 14px">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#444;margin-bottom:2px">When</div>
          <div style="font-size:13px;color:#F2F2F2">${dtStr}</div>
        </div>
      </div>
      ${!isAgent ? `<div style="margin-top:16px;font-size:11px;color:#555;line-height:1.8">Bring valid ID · Arrive 5 min early<br><a href="https://wa.me/393313251961" style="color:#D4AF37;text-decoration:none">WhatsApp Valentino →</a></div>` : ''}
    </div>
  </div>
  <div style="margin-top:20px;font-size:10px;color:#333;text-align:center">BOOM · Egidi Immobiliare S.r.l. · Rome</div>
</div></body></html>`;
  return { subject, html };
}

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const now = new Date();
  const results = { checked: 0, sent3h: 0, sent30m: 0, errors: [] };
  try {
    const token = await getFirebaseToken();
    const queryResult = await fsQuery('viewingRequests', token, {
      field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'confirmed' },
    });
    const docs = (queryResult || []).filter(r => r.document).map(r => parseDoc(r.document)).filter(Boolean);
    results.checked = docs.length;

    for (const v of docs) {
      if (!v.confirmedDateTime) continue;
      const minsUntil = (new Date(v.confirmedDateTime).getTime() - now.getTime()) / 60000;
      const docPath = `viewingRequests/${v.id}`;

      if (!v.reminder3hSent && minsUntil >= 165 && minsUntil <= 195) {
        try {
          const { subject: cs, html: ch } = buildEmail({ ...v, isAgent: false, minutesBefore: 180 });
          const { subject: as, html: ah } = buildEmail({ ...v, isAgent: true,  minutesBefore: 180 });
          await transporter.sendMail({ from: `BOOM Rome <${process.env.GMAIL_USER}>`, to: v.clientEmail, subject: cs, html: ch });
          await transporter.sendMail({ from: `BOOM Rome <${process.env.GMAIL_USER}>`, to: 'valentino@boomrome.com', subject: as, html: ah });
          await fsPatch(docPath, { reminder3hSent: { booleanValue: true } }, token);
          results.sent3h++;
        } catch (e) { results.errors.push(`3h ${v.id}: ${e.message}`); }
      }

      if (!v.reminder30mSent && minsUntil >= 15 && minsUntil <= 45) {
        try {
          const { subject: cs, html: ch } = buildEmail({ ...v, isAgent: false, minutesBefore: 30 });
          const { subject: as, html: ah } = buildEmail({ ...v, isAgent: true,  minutesBefore: 30 });
          await transporter.sendMail({ from: `BOOM Rome <${process.env.GMAIL_USER}>`, to: v.clientEmail, subject: cs, html: ch });
          await transporter.sendMail({ from: `BOOM Rome <${process.env.GMAIL_USER}>`, to: 'valentino@boomrome.com', subject: as, html: ah });
          await fsPatch(docPath, { reminder30mSent: { booleanValue: true } }, token);
          results.sent30m++;
        } catch (e) { results.errors.push(`30m ${v.id}: ${e.message}`); }
      }
    }
    return res.status(200).json({ ok: true, timestamp: now.toISOString(), ...results });
  } catch (e) {
    console.error('Cron error:', e);
    return res.status(500).json({ error: e.message });
  }
}
