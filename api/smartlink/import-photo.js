// Foto della fonte → browser admin → Storage BOOM. Non espone URL terzi al cliente.
import { requireRole } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';

const LIMIT = 8_000_000;

export function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export async function fetchPhoto(url) {
  const r = await fetch(url, {
    redirect: 'manual',
    headers: { 'Accept':'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok || !/^image\/(?:jpeg|png|webp)$/i.test((r.headers.get('content-type') || '').split(';')[0])) return null;
  if (Number(r.headers.get('content-length')) > LIMIT) return null;
  const reader = r.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > LIMIT) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  const type = imageType(bytes);
  return type ? { bytes, type } : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method_not_allowed' });
  const actor = await requireRole(req, res, ['admin']);
  if (!actor) return;
  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok:false, error:'invalid_json' }); }
  const source = RULES.normalizeUrl(body?.sourceUrl);
  const url = source && RULES.photoUrl(body?.imageUrl, source.source);
  if (!url) return res.status(400).json({ ok:false, error:'invalid_photo_url' });
  try {
    const photo = await fetchPhoto(url);
    if (!photo) return res.status(422).json({ ok:false, error:'photo_unavailable' });
    res.setHeader('Content-Type', photo.type);
    return res.status(200).end(photo.bytes);
  } catch { return res.status(502).json({ ok:false, error:'photo_unavailable' }); }
}
