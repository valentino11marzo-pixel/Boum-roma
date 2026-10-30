import {fsList} from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';

// L'archivio resta smartlinks: nessuna seconda collection o copia delle foto.
export async function findArchivedListing(source) {
  const urls=RULES.storedListingUrls(source?.url);
  if(!urls.length) return null;
  const reads=await Promise.allSettled(urls.map(url=>fsList('smartlinks',{
    filter:{field:'sourceUrl',op:'EQUAL',value:url},limit:50
  })));
  // Una lettura parziale non può certificare quale sia l'ultima versione.
  const failed=reads.find(read=>read.status==='rejected');
  if(failed) throw failed.reason;
  if(reads.some(read=>read.value.length>=50)) throw new Error('SmartLink archive result limit reached');
  const records=[...new Map(reads.flatMap(read=>read.value).map(record=>[record.id,record])).values()];
  const candidates=records.filter(record=>/^[A-Za-z0-9_-]{20}$/.test(record.id || '') &&
    RULES.sameListingUrl(record.sourceUrl,source.url) && Array.isArray(record.images) &&
    RULES.reusableImages(record,source.url,[...new Set(record.images.filter(RULES.validPublicImageUrl))].slice(0,RULES.MAX_PHOTOS)));
  const now=Date.now();
  const timestamp=value=>{const date=Date.parse(value);return Number.isFinite(date)&&date<=now?date:null;};
  const version=record=>timestamp(record.createdAt)??timestamp(record.observedAt)??0;
  candidates.sort((a,b)=>version(b)-version(a) ||
    (timestamp(b.observedAt)??0)-(timestamp(a.observedAt)??0) ||
    (a.id<b.id?-1:a.id>b.id?1:0));
  const record=candidates[0];
  if(!record) return null;
  const images=[...new Set(record.images.filter(RULES.validPublicImageUrl))].slice(0,RULES.MAX_PHOTOS);
  const date=timestamp(record.observedAt);
  const observedAt=date===null?null:new Date(date).toISOString();
  return {
    ok:true,status:'partial',source,photoOrigin:'boom_archive',
    archive:{id:record.id,observedAt},images,
    data:{title:RULES.cleanText(record.title,130),zone:RULES.cleanText(record.zone,90),
      price:RULES.positiveNumber(record.price,1000000),sqm:RULES.positiveNumber(record.sqm,100000),rooms:RULES.positiveNumber(record.rooms,100)}
  };
}
