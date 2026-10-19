// Lettura assistita di un annuncio esterno; nessuna scrittura o pubblicazione.
import { requireRole } from '../_auth.js';
import crypto from 'node:crypto';
import { fsGet, readJson } from '../homie/_lib.js';
import { extractListing } from './_extract.js';
import RULES from '../../js/smartlink-engine.js';
import { extractOfficial } from './_realitycs.js';

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
  const official = await extractOfficial(source);
  if (official.status === 'ready') return res.status(200).json({ok:true, status:'partial', source, data:official.data, images:official.images, photoOrigin:'official', centralImport:'ready'});
  const result = await extractListing(source.url);
  result.centralImport = official.status;
  if (official.data) result.data = {...result.data, ...Object.fromEntries(Object.entries(official.data).filter(([, value]) => value != null && value !== ''))};
  if (result.ok && result.source && !result.images?.length) {
    // Il Radar può aver già visto l'annuncio tramite il browser di Homie.
    // Usiamo solo immagini di una fonte canonica identica e di una CDN attesa.
    try {
      const id = 'h_' + crypto.createHash('sha1').update(result.source.url).digest('hex').slice(0, 16);
      const cached = await fsGet('pfsProperties/' + id);
      if (RULES.normalizeUrl(cached?.sourceUrl)?.url === result.source.url) {
        result.images = RULES.photoCandidates('', result.source.source, cached.images);
        if (result.images.length) { result.status = 'partial'; result.photoOrigin = 'radar'; }
      }
    } catch { /* Il Radar non è indispensabile alla lettura. */ }
  }
  return res.status(result.ok ? 200 : 400).json(result);
}
