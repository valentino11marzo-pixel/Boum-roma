/* Trasporto locale delle foto già scaricate: solo Portal, nessuna rete. */
(function (root) {
  'use strict';
  const SHARE=typeof module!=='undefined' && module.exports ? require('./smartlink-share-engine.js') : root.BOOM_SMARTLINK_SHARE;
  const KIND='boom.smartlink.share.media', VERSION=1, MAX_BYTES=16_000_000, MAX_IMAGE_BYTES=4_000_000;
  const fail=error=>({ok:false,error});
  const closed=(value,allowed)=>!!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===allowed.length && Object.keys(value).every(key=>allowed.includes(key));
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function imageInfo(item) {
    if(!closed(item,['index','url','mime','base64']) || !Number.isSafeInteger(item.index) || item.index<1 || typeof item.url!=='string') throw new Error('invalid_media');
    if(!['image/jpeg','image/png','image/webp'].includes(item.mime)) throw new Error('invalid_media');
    const value=item.base64;
    if(typeof value!=='string' || !value.length || value.length>Math.ceil(MAX_IMAGE_BYTES/3)*4) throw new Error('media_too_large');
    if(value.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('invalid_media');
    const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;
    const size=value.length/4*3-padding;
    if(size<1 || size>MAX_IMAGE_BYTES) throw new Error('media_too_large');
    if((padding===2 && (alphabet.indexOf(value[value.length-3])&15)!==0) || (padding===1 && (alphabet.indexOf(value[value.length-2])&3)!==0)) throw new Error('invalid_media');
    const prefix=atob(value.slice(0,16)), byte=index=>prefix.charCodeAt(index);
    const mime=byte(0)===255 && byte(1)===216 && byte(2)===255 ? 'image/jpeg' :
      [137,80,78,71,13,10,26,10].every((value,index)=>byte(index)===value) ? 'image/png' :
      prefix.slice(0,4)==='RIFF' && prefix.slice(8,12)==='WEBP' ? 'image/webp' : null;
    if(mime!==item.mime) throw new Error('invalid_media');
    return size;
  }
  function validate(raw,now=Date.now()) {
    try {
      const serialized=typeof raw==='string'?raw:JSON.stringify(raw);
      if(typeof serialized!=='string') return fail('invalid_payload');
      if(serialized.length>MAX_BYTES || new TextEncoder().encode(serialized).length>MAX_BYTES) return fail('payload_too_large');
      const packet=JSON.parse(serialized);
      if(packet?.kind!==KIND) return SHARE.validate(serialized,now);
      if(!closed(packet,['kind','version','payload','images']) || packet.version!==VERSION) return fail('invalid_media');
      const shared=SHARE.validate(packet.payload,now);
      if(!shared.ok) return shared;
      if(!Array.isArray(packet.images) || packet.images.length!==shared.images.length) return fail('invalid_media');
      for(let i=0;i<packet.images.length;i++) {
        const item=packet.images[i];
        imageInfo(item);
        if(item.index!==i+1 || item.url!==shared.images[i]) return fail('invalid_media');
      }
      return {...shared,media:packet.images.map(item=>({index:item.index,url:item.url,mime:item.mime,base64:item.base64}))};
    } catch(error) {return fail(['invalid_media','media_too_large'].includes(error?.message)?error.message:'invalid_payload');}
  }
  function toBlob(item) {
    const size=imageInfo(item), binary=atob(item.base64), bytes=new Uint8Array(size);
    for(let i=0;i<size;i++) bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:item.mime});
  }
  const API={KIND,VERSION,MAX_BYTES,MAX_IMAGE_BYTES,validate,toBlob};
  if(typeof module!=='undefined' && module.exports) module.exports=API;
  if(root) root.BOOM_SMARTLINK_MEDIA=API;
})(typeof window!=='undefined'?window:this);
