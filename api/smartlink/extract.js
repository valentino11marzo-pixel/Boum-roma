// Lettura assistita di un annuncio esterno; nessuna scrittura o pubblicazione.
import { requireRole } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { extractListing } from './_extract.js';
import { findArchivedListing } from './_reuse.js';
import { findRadarListing } from './_radar.js';
import RULES from '../../js/smartlink-engine.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireRole(req, res, ['admin']);
  if (!actor) return;
  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const source = RULES.normalizeUrl(body?.url);
  if (!source) return res.status(400).json({ok:false, error:'unsupported_listing_url'});
  if(body.archiveOnly!==undefined && typeof body.archiveOnly!=='boolean') return res.status(400).json({ok:false,error:'invalid_request'});
  try {
    const archived=await findArchivedListing(source);
    if(archived) return res.status(200).json(archived);
  } catch {
    if(body.archiveOnly) return res.status(503).json({ok:false,error:'archive_unavailable'});
    // Un archivio non raggiungibile non impedisce la lettura diretta.
  }
  if(body.archiveOnly) return res.status(200).json({ok:true,status:'unavailable',source,images:[]});
  const result = await extractListing(source.url);
  const fields=['title','zone','price','sqm','rooms'];
  if (result.ok && result.source && (!result.images?.length || fields.some(key=>!result.data?.[key]))) {
    // Recupera soltanto ciò che manca, da un singolo campione dello stesso
    // annuncio. La provenienza deve accompagnare anche la pubblicazione.
    try {
      const cached=await findRadarListing(result.source);
      if(cached) {
        let reused=false;
        if(!result.images?.length && cached.images.length) {
          result.images=cached.images;result.photoOrigin='radar';reused=true;
        }
        const data={...(result.data || {})};
        for(const key of fields) if(!data[key] && cached.data[key]) {data[key]=cached.data[key];reused=true;}
        if(reused) {result.data=data;result.radar=cached.radar;result.status='partial';}
      }
    } catch { /* Il Radar non è indispensabile alla lettura. */ }
  }
  return res.status(result.ok ? 200 : 400).json(result);
}
