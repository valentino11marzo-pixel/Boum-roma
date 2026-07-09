// api/search/unsub.js
// One-click unsubscribe for saved-search alerts (public GET — linked from
// every digest email). Verifies the email on the doc matches the `e` param
// so an id alone can't kill someone else's alert.

import { fsList, fsPatch } from '../homie/_lib.js';

export default async function handler(req, res) {
  const id = String(req.query?.id || '').slice(0, 80);
  const e = String(req.query?.e || '').toLowerCase().slice(0, 160);
  if (!id || !e) return res.status(400).send('Missing parameters.');

  try {
    const rows = await fsList('savedSearches', { limit: 300 });
    const doc = rows.find(r => r.id === id);
    if (!doc || String(doc.email || '').toLowerCase() !== e) {
      return res.status(404).send('Alert not found.');
    }
    await fsPatch(`savedSearches/${id}`, { status: 'unsubscribed', unsubscribedAt: new Date().toISOString() });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Alerts stopped — BOOM</title></head>
<body style="margin:0;background:#060607;color:#fff;font-family:Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center">
<div><div style="letter-spacing:5px;color:#D4AF37;font-size:13px">B O O M</div>
<h1 style="font-weight:200;margin:16px 0 8px">Alerts stopped.</h1>
<p style="color:#999;font-size:14px">You won't hear from this search again.<br>Changed your mind? Save a new search anytime.</p>
<a href="https://www.boomrome.com/apartments" style="display:inline-block;margin-top:18px;background:#D4AF37;color:#1a1407;text-decoration:none;font-weight:600;border-radius:100px;padding:12px 24px;font-size:14px">Back to the homes →</a></div>
</body></html>`);
  } catch (err) {
    console.error('[unsub]', err);
    return res.status(500).send('Something hiccuped — try the link again.');
  }
}
