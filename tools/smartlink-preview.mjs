// Prova locale dello SmartLink. Solo loopback, solo memoria: nessun dato di produzione.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import RULES from '../js/smartlink-engine.js';
import { extractListing } from '../api/smartlink/_extract.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const records = new Map();
const byKey = new Map();
const port = Number(process.env.SMARTLINK_PREVIEW_PORT || 4177);

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32_000) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function html(res, file, type='text/html') {
  const data = await readFile(join(root, file));
  res.writeHead(200, { 'Content-Type':type + '; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(data);
}
function publicRecord(d) {
  const { sourceUrl, source, title, price, zone, sqm, rooms, note, observedAt, availability } = d;
  return { sourceUrl, source, title, price, zone, sqm, rooms, note, observedAt, availability };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'GET') {
    if (url.pathname === '/' || url.pathname === '/preview') return html(res, 'smartlink-preview.html');
    if (url.pathname === '/smartlink.html') return html(res, 'smartlink.html');
    if (url.pathname === '/favicon.ico') {
      const data = await readFile(join(root, 'favicon.ico'));
      res.writeHead(200, { 'Content-Type':'image/x-icon', 'Cache-Control':'no-store' });
      return res.end(data);
    }
    if (url.pathname === '/css/smartlink.css') return html(res, 'css/smartlink.css', 'text/css');
    if (url.pathname === '/js/smartlink-engine.js') return html(res, 'js/smartlink-engine.js', 'text/javascript');
    if (url.pathname === '/api/smartlink/read') {
      const id = url.searchParams.get('id') || '';
      const d = records.get(id);
      return d ? json(res, 200, { ok:true, listing:publicRecord(d) }) : json(res, 404, { ok:false, error:'not_found' });
    }
  }
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return json(res, 403, { ok:false, error:'invalid_origin' });
    let input;
    try { input = await body(req); }
    catch { return json(res, 400, { ok:false, error:'invalid_json' }); }
    if (url.pathname === '/api/smartlink/extract') {
      const result = await extractListing(input?.url);
      return json(res, result.ok ? 200 : 400, result);
    }
    if (url.pathname === '/api/smartlink/create') {
      const record = RULES.makeRecord(input || {}, new Date().toISOString());
      if (!record) return json(res, 400, { ok:false, error:'unsupported_listing_url' });
      const key = String(input?.idempotencyKey || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return json(res, 400, { ok:false, error:'idempotency_key_required' });
      const existing = byKey.get(key);
      if (existing && existing.sourceUrl !== record.sourceUrl) return json(res, 409, { ok:false, error:'key_conflict' });
      if (existing) return json(res, 200, { ok:true, id:existing.id, url:`http://127.0.0.1:${port}/smartlink.html?id=${existing.id}`, duplicate:true });
      const id = createHash('sha256').update('preview:' + key).digest('base64url').slice(0, 20);
      records.set(id, record);
      byKey.set(key, { id, sourceUrl:record.sourceUrl });
      return json(res, 201, { ok:true, id, url:`http://127.0.0.1:${port}/smartlink.html?id=${id}`, preview:true });
    }
  }
  json(res, 404, { ok:false, error:'not_found' });
});

server.listen(port, '127.0.0.1', () => console.log(`SmartLink preview: http://127.0.0.1:${port}/preview`));
