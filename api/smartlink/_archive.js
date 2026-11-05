// Copia duratura delle foto: il telefono può chiudere la pagina durante l'importazione.
import crypto from 'node:crypto';
import sharp from 'sharp';
import {getAdminToken} from '../homie/_lib.js';
import {fetchPhoto} from './import-photo.js';
import RULES from '../../js/smartlink-engine.js';
const BUCKET='boom-property-dashboards.firebasestorage.app';
export async function archivePhotoBytes(input, draftKey, identity) {
  const bytes=await sharp(input,{limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer().catch(()=>{throw Object.assign(new Error('invalid_photo_bytes'),{invalidPhoto:true});});
  if(!bytes.length || bytes.length>=8_000_000) throw new Error('photo_archive_failed');
  // Byte e assegnazione fanno parte del nome: una vecchia lease non sovrascrive una foto diversa.
  const hash=crypto.createHash('sha256').update(identity).update(input).digest('hex');
  const file=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}.webp`;
  const name=`smartlinks/${draftKey}/${file}`;
  const url=`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(name)}?alt=media`;
  if(!RULES.validImageUrl(url,draftKey)) throw new Error('invalid_photo_destination');
  const token=await getAdminToken();
  const response=await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(name)}`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'image/webp'},body:bytes
  });
  if(!response.ok) throw new Error('photo_archive_failed');
  return url;
}
export async function archivePhotos(urls, draftKey) {
  const output=new Array(urls.length).fill(null);
  async function one(url,i) {
    try {
      const photo=await fetchPhoto(url); if(!photo) return;
      output[i]=await archivePhotoBytes(photo.bytes,draftKey,url);
    } catch { /* Riportiamo il numero di foto mancanti, mai una galleria fittizia. */ }
  }
  for(let i=0;i<urls.length;i+=3) await Promise.all(urls.slice(i,i+3).map((url,j)=>one(url,i+j)));
  return output.filter(Boolean);
}
