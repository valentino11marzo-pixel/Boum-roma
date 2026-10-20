// Prova locale dello SmartLink. Solo loopback, solo memoria: nessun dato di produzione.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import RULES from '../js/smartlink-engine.js';
import { extractListing } from '../api/smartlink/_extract.js';
import { nearbyPois } from '../api/smartlink/_pois.js';
import { fetchPhoto } from '../api/smartlink/import-photo.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const records = new Map();
const byKey = new Map();
const photos = new Map();
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
async function photoBody(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8_000_000) throw new Error('photo_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function photoType(data, advertised) {
  if (advertised === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (advertised === 'image/png' && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (advertised === 'image/webp' && data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP') return 'image/webp';
  return null;
}
async function html(res, file, type='text/html') {
  const data = await readFile(join(root, file));
  res.writeHead(200, { 'Content-Type':type + '; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(data);
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
    if (url.pathname === '/js/smartlink-photo.js') return html(res, 'js/smartlink-photo.js', 'text/javascript');
    if (url.pathname === '/js/smartlink-map.js') return html(res, 'js/smartlink-map.js', 'text/javascript');
    if (url.pathname === '/js/smartlink-page.js') return html(res, 'js/smartlink-page.js', 'text/javascript');
    if (url.pathname === '/design/home-live-deco/logo-live.svg') return html(res, 'design/home-live-deco/logo-live.svg', 'image/svg+xml');
    if (/^\/preview-photo\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
      const photo = photos.get(url.pathname.slice(15));
      if (!photo) return json(res, 404, { ok:false, error:'not_found' });
      res.writeHead(200, { 'Content-Type':photo.type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      return res.end(photo.data);
    }
    if (url.pathname === '/api/smartlink/read') {
      const id = url.searchParams.get('id') || '';
      const d = records.get(id);
      if (!d) return json(res, 404, { ok:false, error:'not_found' });
      const listing = RULES.publicRecord(d);
      listing.images = d.images.filter(raw => {
        try { const u=new URL(raw); return u.origin === `http://127.0.0.1:${port}` && /^\/preview-photo\/[A-Za-z0-9_-]+$/.test(u.pathname) && photos.has(u.pathname.slice(15)); }
        catch { return false; }
      });
      return json(res, 200, { ok:true, listing });
    }
    if (url.pathname === '/api/smartlink/pois') {
      const d = records.get(url.searchParams.get('id') || '');
      return d?.map ? json(res, 200, await nearbyPois(d.map)) : json(res, 404, { ok:false, error:'not_found' });
    }
  }
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return json(res, 403, { ok:false, error:'invalid_origin' });
    if (url.pathname === '/api/smartlink/photo') {
      const key = url.searchParams.get('key') || '';
      if (!/^[0-9a-f-]{36}$/i.test(key)) return json(res, 400, { ok:false, error:'invalid_key' });
      let data;
      try { data = await photoBody(req); } catch { return json(res, 413, { ok:false, error:'photo_too_large' }); }
      const type = photoType(data, req.headers['content-type']);
      if (!type) return json(res, 400, { ok:false, error:'invalid_photo' });
      const id = randomUUID();
      photos.set(id, { key, type, data });
      return json(res, 201, { ok:true, url:`http://127.0.0.1:${port}/preview-photo/${id}` });
    }
    let input;
    try { input = await body(req); }
    catch { return json(res, 400, { ok:false, error:'invalid_json' }); }
    if (url.pathname === '/api/smartlink/import-photo') {
      const source = RULES.normalizeUrl(input?.sourceUrl);
      const image = source && RULES.photoUrl(input?.imageUrl, source.source);
      if (!image) return json(res, 400, { ok:false, error:'invalid_photo_url' });
      try {
        const photo = await fetchPhoto(image);
        if (!photo) return json(res, 422, { ok:false, error:'photo_unavailable' });
        res.writeHead(200, { 'Content-Type':photo.type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
        return res.end(photo.bytes);
      } catch { return json(res, 502, { ok:false, error:'photo_unavailable' }); }
    }
    if (url.pathname === '/api/smartlink/extract') {
      const result = await extractListing(input?.url);
      return json(res, result.ok ? 200 : 400, result);
    }
    if (url.pathname === '/api/smartlink/create') {
      const key = String(input?.idempotencyKey || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return json(res, 400, { ok:false, error:'idempotency_key_required' });
      const images = input?.images;
      if (images != null && (!Array.isArray(images) || images.length > 12 || images.some(u => {
        try { const p = new URL(u); return p.origin !== `http://127.0.0.1:${port}` || !photos.get(p.pathname.slice(15)) || photos.get(p.pathname.slice(15)).key !== key; }
        catch { return true; }
      }))) return json(res, 400, { ok:false, error:'invalid_photos' });
      const record = RULES.makeRecord({ ...input, images:[] }, new Date().toISOString());
      if (!record) return json(res, 400, { ok:false, error:'invalid_smartlink_data' });
      record.images = images || [];
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
