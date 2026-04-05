export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.boomrome.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) return res.status(500).json({ error: 'Webhook not configured' });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    return res.status(response.status).json({ ok: response.ok });
  } catch (err) {
    console.error('Webhook proxy error:', err);
    return res.status(502).json({ error: 'Webhook delivery failed' });
  }
}
