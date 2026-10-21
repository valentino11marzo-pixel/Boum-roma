import {fsList} from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';

// L'archivio resta smartlinks: nessuna seconda collection o copia delle foto.
export async function findArchivedListing(source) {
  const records=await fsList('smartlinks',{filter:{field:'sourceUrl',op:'EQUAL',value:source.url},limit:50});
  const candidates=records.filter(record=>/^[A-Za-z0-9_-]{20}$/.test(record.id || '') && Array.isArray(record.images) &&
    RULES.reusableImages(record,source.url,[...new Set(record.images.filter(RULES.validPublicImageUrl))].slice(0,12)));
  candidates.sort((a,b)=>(Date.parse(b.observedAt)||0)-(Date.parse(a.observedAt)||0));
  const record=candidates[0];
  if(!record) return null;
  const images=[...new Set(record.images.filter(RULES.validPublicImageUrl))].slice(0,12);
  const date=Date.parse(record.observedAt);
  const observedAt=Number.isFinite(date)&&date<=Date.now()?new Date(date).toISOString():null;
  return {
    ok:true,status:'partial',source,photoOrigin:'boom_archive',
    archive:{id:record.id,observedAt},images,
    data:{title:RULES.cleanText(record.title,130),zone:RULES.cleanText(record.zone,90),
      price:RULES.positiveNumber(record.price,1000000),sqm:RULES.positiveNumber(record.sqm,100000),rooms:RULES.positiveNumber(record.rooms,100)}
  };
}
