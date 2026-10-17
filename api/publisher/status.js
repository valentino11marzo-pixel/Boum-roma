// AdminFlats: read one listing's receipts without enabling the publisher.
import { requireRole } from '../_auth.js';
import { fsGet } from '../homie/_lib.js';
import DISPO from '../../js/dispo-engine.js';
import { PORTALS } from './_state.js';
import { publicationStatus } from './_status.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  if (!await requireRole(req,res,['admin'])) return;
  const id = req.query?.id;
  if (typeof id !== 'string' || !id.trim() || id.length > 150 || /[\x00-\x1f/]/.test(id))
    return res.status(400).json({ok:false,error:'invalid_listing'});
  let listing;
  try { listing = await fsGet('listings/'+id); }
  catch { return res.status(503).json({ok:false,error:'catalog_read_failed'}); }
  if (!listing) return res.status(404).json({ok:false,error:'listing_not_found'});
  listing = {...listing,id};
  const reads = await Promise.allSettled([fsGet('settings/publisher'),...PORTALS.map(p=>fsGet('portalPubs/'+p+'_'+id))]);
  const config = reads[0];
  return res.status(200).json({ok:true,id,readAt:new Date().toISOString(),
    availability:DISPO.catalogState(listing), availabilityUpdatedAt:listing.availabilityUpdatedAt || null,
    channels:PORTALS.map((p,i)=>publicationStatus(listing,p,reads[i+1].value,config.value,
      {receiptError:reads[i+1].status === 'rejected',configError:config.status === 'rejected'}))});
}
