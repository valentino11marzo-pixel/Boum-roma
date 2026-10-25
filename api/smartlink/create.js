// L'admin pubblica una scheda BOOM con soli campi revisionati.
import crypto from 'node:crypto';
import { requireRole } from '../_auth.js';
import { fsCreate, fsGet, logActivity, readJson } from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireRole(req, res, ['admin']);
  if (!actor) return;
  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const now=new Date().toISOString();
  if(body?.draftKey!=null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.draftKey)) return res.status(400).json({ok:false,error:'invalid_draft_key'});
  const archiveId=body?.archiveId;
  if(archiveId!=null && (typeof archiveId!=='string' || !/^[A-Za-z0-9_-]{20}$/.test(archiveId))) return res.status(400).json({ok:false,error:'invalid_archive'});
  const record = RULES.makeRecord(archiveId ? {...body,images:[]} : body || {}, now);
  if (!record) return res.status(400).json({ ok: false, error: 'invalid_smartlink_data' });
  if(archiveId) {
    let archive;
    try {archive=await fsGet('smartlinks/'+archiveId);}
    catch {return res.status(503).json({ok:false,error:'archive_unavailable'});}
    const images=RULES.reusableImages(archive,record.sourceUrl,body.images,body.draftKey ?? body.idempotencyKey);
    if(!images) return res.status(400).json({ok:false,error:'invalid_archive_selection'});
    record.images=images;
    // Riutilizzare una foto non equivale ad avere ricontrollato l'annuncio oggi.
    const date=Date.parse(archive.observedAt);
    record.observedAt=Number.isFinite(date)&&date<=Date.now()?new Date(date).toISOString():null;
    record.reusedFrom=archiveId;
    record.createdAt=now;
  }
  if (!record.images.length) return res.status(400).json({ ok:false, error:'photos_required' });
  const key = String(body.idempotencyKey || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    return res.status(400).json({ ok: false, error: 'idempotency_key_required' });
  }
  const id = crypto.createHash('sha256').update(actor.uid + ':' + key).digest('base64url').slice(0, 20);
  try {
    await fsCreate('smartlinks', { ...record, createdBy: actor.uid }, id);
    try { await logActivity('smartlink_created', 'property', { smartlinkId: id, source: record.source }, actor.uid); }
    catch { /* Il link creato resta valido se il registro secondario fallisce. */ }
    return res.status(201).json({ ok: true, id, url: `https://www.boomrome.com/smartlink.html?id=${id}` });
  } catch (e) {
    if (e.exists) {
      try {
        const existing = await fsGet('smartlinks/' + id);
        if (existing?.createdBy === actor.uid && existing?.sourceUrl === record.sourceUrl) {
          if(!RULES.samePublication(existing,record)) return res.status(409).json({ok:false,error:'publication_conflict'});
          return res.status(200).json({ ok: true, id, url: `https://www.boomrome.com/smartlink.html?id=${id}`, duplicate: true });
        }
      } catch { /* A failed lookup cannot certify a successful retry. */ }
      return res.status(409).json({ ok: false, error: 'key_conflict' });
    }
    return res.status(500).json({ ok: false, error: 'save_failed' });
  }
}
