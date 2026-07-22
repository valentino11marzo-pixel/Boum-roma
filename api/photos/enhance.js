// api/photos/enhance.js
// AI photo curation + enhancement for the public catalog, one listing per call.
//
// The catalog's real problems (audited on live data): floorplan scans used as
// covers, the cover duplicated into the gallery, renders with baked-in UI
// frames, real photos that are simply dim. So this does BRAIN first, then
// polish:
//   1. Claude vision classifies every photo (real photo / floorplan / render /
//      document, room, rotation, quality, cover-worthiness, watermark).
//   2. A plan is built: best real photo becomes the cover, gallery reordered
//      into a viewing narrative (living → kitchen → bedrooms → bath →
//      exterior), exact duplicates dropped, floorplans moved to the end.
//   3. sharp enhances each kept photo (EXIF+detected rotation, contrast
//      stretch, per-photo preset chosen from the AI quality grade), uploads
//      to Storage under listings/enhanced/<id>/ and updates the listing.
//
// Originals are NEVER deleted; the first apply saves the original URL list to
// `imagesOriginal` and every later run re-plans from those, so the pipeline
// is repeatable and reversible.
//
// Method: POST  · auth: Firebase ID token, role admin/owner/landlord
// Body: { listingId, mode: 'audit' | 'apply' }
// audit → { ok, plan } (no writes) · apply → { ok, plan, applied:{cover,images} }

import sharp from 'sharp';
import crypto from 'node:crypto';
import { getAdminToken, FS_BASE, fsPatch, readJson, fsValToJs } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_PHOTOS = 40;
const ROOM_ORDER = ['living', 'kitchen', 'bedroom', 'bathroom', 'balcony', 'exterior', 'view', 'other'];

// preset by AI quality grade: already-good photos get a whisper, dim ones more
export function presetFor(kind, quality) {
  if (kind === 'floorplan' || kind === 'document') return { gamma: 1, sat: 1, bright: 1, sharpen: 0.6, gray: true };
  if (kind === 'render') return { gamma: 1, sat: 1, bright: 1, sharpen: 0 };
  if (quality >= 8) return { gamma: 1.03, sat: 1.07, bright: 1.01, sharpen: 0.7 };
  if (quality >= 5) return { gamma: 1.06, sat: 1.12, bright: 1.02, sharpen: 0.9 };
  return { gamma: 1.1, sat: 1.18, bright: 1.05, sharpen: 1.1 };
}

// Formats the prebuilt sharp/libvips CANNOT decode (HEIC/HEIF from iPhones —
// HEVC-compressed, patent-encumbered, not in the prebuilt binaries). One such
// photo used to 500 the whole run ("Input buffer has corrupt header: heif:
// ... security limits", prod 2026-07-22). Detect by magic bytes and skip.
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
export function isUnsupportedImage(buf) {
  if (!buf || buf.length < 12) return true;
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (HEIF_BRANDS.includes(brand)) return true;
  }
  return false;
}

export async function enhanceBuffer(buf, { rotateDeg = 0, preset }) {
  let p = sharp(buf).rotate();                      // EXIF first
  if (rotateDeg) p = p.rotate(rotateDeg);           // then AI-detected
  p = p.resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });
  if (!preset.gray) p = p.normalise({ lower: 1, upper: 99.5 });
  if (preset.gamma !== 1) p = p.gamma(preset.gamma);
  if (preset.sat !== 1 || preset.bright !== 1) p = p.modulate({ brightness: preset.bright, saturation: preset.sat });
  if (preset.sharpen) p = p.sharpen({ sigma: preset.sharpen, m1: 0.6, m2: 2 });
  return p.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

// Gallery narrative: cover first, rooms in viewing order, floorplans last.
export function buildPlan(photos) {
  const seen = new Map(); // sha1 -> first index
  for (const p of photos) {
    if (p.sha1 && seen.has(p.sha1)) p.action = 'drop-duplicate';
    else if (p.sha1) seen.set(p.sha1, p.i);
  }
  const kept = photos.filter(p => p.action !== 'drop-duplicate');
  const real = kept.filter(p => p.kind === 'photo' || p.kind === 'render');
  const plans = kept.filter(p => p.kind === 'floorplan' || p.kind === 'document');
  const coverPick = [...real].sort((a, b) => (b.coverScore || 0) - (a.coverScore || 0))[0] || kept[0];
  if (coverPick) coverPick.isCover = true;
  const rest = real.filter(p => p !== coverPick).sort((a, b) => {
    const ra = ROOM_ORDER.indexOf(a.room || 'other'), rb = ROOM_ORDER.indexOf(b.room || 'other');
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || (b.coverScore || 0) - (a.coverScore || 0);
  });
  return { cover: coverPick || null, ordered: [coverPick, ...rest, ...plans].filter(Boolean), dropped: photos.filter(p => p.action === 'drop-duplicate') };
}

async function classify(photos) {
  // downscale for the vision call; grade what the tenant would actually see.
  // A photo sharp can't decode must not kill the batch: mark and move on.
  const content = [];
  for (const p of photos) {
    let small;
    try { small = await sharp(p.buf).rotate().resize({ width: 560, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer(); }
    catch { p.action = 'skip-undecodable'; continue; }
    content.push({ type: 'text', text: `PHOTO ${p.i}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: small.toString('base64') } });
  }
  if (!content.length) throw new Error('no_decodable_photos');
  content.push({ type: 'text', text:
`You are auditing the photo set of a Rome rental listing. For EVERY photo above answer as a JSON array (same order, one object per photo), no prose:
[{"i":<n>,"kind":"photo|render|floorplan|document|other","room":"living|kitchen|bedroom|bathroom|balcony|exterior|view|other","rotateDeg":0|90|180|270,"quality":1-10,"coverScore":0-100,"watermark":true|false}]
- kind "render" = CGI/staged mockup, "floorplan" = plan/scan, "document" = paperwork.
- rotateDeg = clockwise rotation NEEDED to make it upright.
- quality grades exposure/sharpness of the actual image (renders can be 10).
- coverScore = how good as the listing's FIRST photo: bright wide real interior or striking exterior scores high; floorplans, documents, bathrooms, watermarked or dark shots score low.` });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error('anthropic_' + r.status);
  const j = await r.json();
  const text = (j.content || []).map(c => c.text || '').join('');
  const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
  const byI = new Map(arr.map(a => [a.i, a]));
  for (const p of photos) {
    const a = byI.get(p.i) || {};
    p.kind = ['photo', 'render', 'floorplan', 'document', 'other'].includes(a.kind) ? a.kind : 'photo';
    p.room = a.room || 'other';
    p.rotateDeg = [0, 90, 180, 270].includes(a.rotateDeg) ? a.rotateDeg : 0;
    p.quality = Math.max(1, Math.min(10, +a.quality || 6));
    p.coverScore = Math.max(0, Math.min(100, +a.coverScore || 40));
    p.watermark = !!a.watermark;
  }
}

// no-AI fallback: everything is a photo, grade by brightness stats.
// stats() throws on undecodable buffers — that must skip the photo, not
// the run (this exact path took the endpoint down on a HEIC upload).
async function classifyHeuristic(photos) {
  for (const p of photos) {
    let lum = 120;
    try {
      const st = await sharp(p.buf).stats();
      lum = st.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / 3;
    } catch { p.action = 'skip-undecodable'; continue; }
    p.kind = 'photo'; p.room = 'other'; p.rotateDeg = 0;
    p.quality = lum > 150 ? 8 : lum > 100 ? 6 : 4;
    p.coverScore = Math.round(Math.min(100, lum / 2.2));
    p.watermark = false;
  }
}

async function uploadJpeg(token, path, buf) {
  const up = await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: buf });
  if (!up.ok) throw new Error('storage_' + up.status);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  const id = String((b && b.listingId) || '').trim();
  const mode = (b && b.mode) === 'apply' ? 'apply' : 'audit';
  if (!id) return res.status(400).json({ ok: false, error: 'no_listing' });

  try {
    const token = await getAdminToken();
    const dr = await fetch(`${FS_BASE}/listings/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!dr.ok) return res.status(404).json({ ok: false, error: 'listing_not_found' });
    const doc = await dr.json();
    const f = doc.fields || {};
    const js = {}; for (const k in f) js[k] = fsValToJs(f[k]);

    // plan from the true originals when a previous apply already ran
    const source = (Array.isArray(js.imagesOriginal) && js.imagesOriginal.length)
      ? js.imagesOriginal
      : [js.image, ...(Array.isArray(js.images) ? js.images : [])].filter(Boolean);
    const urls = [...new Set(source)].slice(0, MAX_PHOTOS);
    if (!urls.length) return res.status(200).json({ ok: true, plan: null, note: 'no_photos' });

    const photos = [];
    for (let i = 0; i < urls.length; i++) {
      try {
        const r = await fetch(urls[i]);
        if (!r.ok) { photos.push({ i, url: urls[i], action: 'skip-unfetchable' }); continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 10 * 1024 * 1024) { photos.push({ i, url: urls[i], action: 'skip-too-large' }); continue; }
        if (isUnsupportedImage(buf)) { photos.push({ i, url: urls[i], action: 'skip-unsupported-format' }); continue; }
        photos.push({ i, url: urls[i], buf, sha1: crypto.createHash('sha1').update(buf).digest('hex') });
      } catch { photos.push({ i, url: urls[i], action: 'skip-unfetchable' }); }
    }
    let fetchable = photos.filter(p => p.buf);
    if (!fetchable.length) return res.status(200).json({ ok: true, plan: null, note: 'no_fetchable_photos' });

    let ai = true;
    if (ANTHROPIC_KEY) { try { await classify(fetchable); } catch (e) { ai = false; await classifyHeuristic(fetchable); } }
    else { ai = false; await classifyHeuristic(fetchable); }
    // photos neither pipeline could decode are skipped, never fatal
    fetchable = fetchable.filter(p => !p.action);
    if (!fetchable.length) return res.status(200).json({ ok: true, plan: null, note: 'no_decodable_photos' });

    const plan = buildPlan(fetchable);
    const report = {
      ai, count: urls.length,
      cover: plan.cover ? { url: plan.cover.url, room: plan.cover.room, coverScore: plan.cover.coverScore } : null,
      order: plan.ordered.map(p => ({ i: p.i, url: p.url, kind: p.kind, room: p.room, rotateDeg: p.rotateDeg, quality: p.quality, coverScore: p.coverScore, watermark: p.watermark, isCover: !!p.isCover })),
      dropped: plan.dropped.map(p => ({ i: p.i, url: p.url, reason: 'duplicate' })),
      skipped: photos.filter(p => p.action && p.action.startsWith('skip')).map(p => ({ i: p.i, url: p.url, reason: p.action })),
    };
    if (mode === 'audit') return res.status(200).json({ ok: true, plan: report });

    // APPLY: enhance + upload + update the doc. One photo failing here keeps
    // its ORIGINAL url in the gallery instead of killing the whole run.
    const stamp = Date.now().toString(36);
    const newUrls = [];
    for (let k = 0; k < plan.ordered.length; k++) {
      const p = plan.ordered[k];
      try {
        const out = await enhanceBuffer(p.buf, { rotateDeg: p.rotateDeg, preset: presetFor(p.kind, p.quality) });
        const path = `listings/enhanced/${id}/${stamp}_${String(k).padStart(2, '0')}_${p.sha1.slice(0, 8)}.jpg`;
        newUrls.push(await uploadJpeg(token, path, out));
      } catch (e) {
        console.error('[photos/enhance] photo', p.i, 'kept original:', e.message);
        report.skipped.push({ i: p.i, url: p.url, reason: 'enhance-failed-kept-original' });
        newUrls.push(p.url);
      }
    }
    const patch = { image: newUrls[0], images: newUrls, photosEnhancedAt: new Date().toISOString(), photosEnhancedBy: auth.email || auth.uid };
    if (!Array.isArray(js.imagesOriginal) || !js.imagesOriginal.length) patch.imagesOriginal = urls;
    await fsPatch(`listings/${id}`, patch);

    return res.status(200).json({ ok: true, plan: report, applied: { cover: newUrls[0], images: newUrls } });
  } catch (err) {
    console.error('[photos/enhance]', err.message);
    return res.status(500).json({ ok: false, error: 'internal', detail: String(err.message || '').slice(0, 120) });
  }
}
