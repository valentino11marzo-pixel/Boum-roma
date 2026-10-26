// Il Radar contiene dati archiviati, non una verifica corrente della fonte.
import crypto from 'node:crypto';
import { fsGet } from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';

export const validRadarId=id=>typeof id==='string' && /^h_[0-9a-f]{16}$/.test(id);
const text=(value,max)=>typeof value==='string'?RULES.cleanText(value,max):'';
const number=(value,max)=>['string','number'].includes(typeof value)?RULES.positiveNumber(value,max):null;

function radarListing(record,id,source) {
  if(!record || !RULES.sameListingUrl(record.sourceUrl,source.url)) return null;
  const date=typeof record.scrapedAt==='string'?Date.parse(record.scrapedAt):NaN;
  return {
    radar:{id,archivedAt:Number.isFinite(date)&&date<=Date.now()?new Date(date).toISOString():null},
    data:{title:text(record.title,130),zone:text(record.zone,90),price:number(record.price,1000000),
      sqm:number(record.sqm,100000) ?? number(record.size,100000),rooms:number(record.rooms,100)},
    // bedrooms mescola camere da letto e locali nelle vecchie ingest: non è rooms.
    images:RULES.photoCandidates('',source.source,record.images)
  };
}

export async function readRadarListing(id,source) {
  if(!validRadarId(id)) return null;
  return radarListing(await fsGet('pfsProperties/'+id),id,source);
}

export async function findRadarListing(source) {
  const ids=[...new Set(RULES.storedListingUrls(source.url).map(url=>
    'h_'+crypto.createHash('sha1').update(url).digest('hex').slice(0,16)))].slice(0,8);
  const results=await Promise.allSettled(ids.map(id=>readRadarListing(id,source)));
  const candidates=results.filter(result=>result.status==='fulfilled' && result.value).map(result=>result.value);
  candidates.sort((a,b)=>(Date.parse(b.radar.archivedAt)||0)-(Date.parse(a.radar.archivedAt)||0));
  return candidates[0] || null;
}
