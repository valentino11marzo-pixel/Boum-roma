// Foto della fonte → browser admin → Storage BOOM. Non espone URL terzi al cliente.
import { requireRole } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';
import sharp from 'sharp';

const LIMIT = 8_000_000;

export function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (bytes.subarray(4, 8).toString() === 'ftyp' && /^(?:avif|avis)$/.test(bytes.subarray(8, 12).toString())) return 'image/avif';
  return null;
}

export async function fetchPhoto(url, onFailure) {
  let upstreamStatus=null, contentType='missing', size=0, detectedType=null, phase='network';
  const unavailable=reason=>{
    // Solo forma e conteggi: mai URL, header grezzi, corpi o dettagli dell'errore.
    try { onFailure?.({phase:reason,upstreamStatus,contentType,bytesRead:size,detectedType}); }
    catch { /* La diagnostica non cambia l'esito dell'importazione. */ }
    return null;
  };
  try {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: { 'Accept':'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
      signal: AbortSignal.timeout(12000),
    });
    upstreamStatus=Number.isInteger(r.status) && r.status>=100 && r.status<=599 ? r.status : null;
    const mime=(r.headers.get('content-type') || '').split(';')[0];
    const accepted=/^image\/(?:jpeg|png|webp|avif)$/i.test(mime);
    contentType=accepted?mime.toLowerCase():mime?'other':'missing';
    if (!r.ok) return unavailable('upstream_status');
    if (!accepted) return unavailable('content_type');
    if (Number(r.headers.get('content-length')) > LIMIT) return unavailable('content_length');
    const reader = r.body?.getReader();
    if (!reader) return unavailable('body_missing');
    phase='body_read';
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > LIMIT) { await reader.cancel(); return unavailable('body_limit'); }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const type = imageType(bytes);
    detectedType=type;
    // I CDN possono restituire AVIF anche ignorando Accept: rendiamolo leggibile
    // da tutti i browser prima dell'upload, con lo stesso limite di dimensioni.
    if (type === 'image/avif') {
      try {
        const converted = await sharp(bytes, {limitInputPixels:40_000_000}).rotate()
          .resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true})
          .webp({quality:88}).toBuffer();
        return {bytes:converted,type:'image/webp'};
      } catch { return unavailable('avif_conversion'); }
    }
    return type ? { bytes, type } : unavailable('signature');
  } catch (error) {
    unavailable(phase);
    throw error;
  }
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
    const photo = await fetchPhoto(url, diagnostic=>console.warn(JSON.stringify({event:'smartlink_photo_failure',...diagnostic})));
    if (!photo) return res.status(422).json({ ok:false, error:'photo_unavailable' });
    res.setHeader('Content-Type', photo.type);
    return res.status(200).end(photo.bytes);
  } catch { return res.status(502).json({ ok:false, error:'photo_unavailable' }); }
}
