/* Safari Share: legge solo il documento che l'operatore ha già aperto. */
(function (root) {
  'use strict';
  const RULES = typeof module !== 'undefined' && module.exports ? require('./smartlink-engine.js') : root.BOOM_SMARTLINK;
  const KIND = 'boom.smartlink.share', VERSION = 1, MAX_BYTES = 131072, MAX_URL = 2048;
  const ERRORS=['invalid_payload','payload_too_large','unsupported_listing_url','source_mismatch','invalid_capture_date','invalid_data','invalid_photo_url','too_many_photos','invalid_gallery','photos_not_found','capture_unavailable'];
  const fail = error => ({ok:false,error});
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
  const byteLength = value => new TextEncoder().encode(value).length;
  function listing(raw) {
    if(typeof raw !== 'string' || raw.length > MAX_URL || /[\s\\]/.test(raw)) return null;
    const authority=raw.match(/^https:\/\/([^/?#]+)/)?.[1];
    if(!authority || /[:@]/.test(authority)) return null;
    try {
      const u=new URL(raw), host=u.hostname.replace(/^www\./,'');
      const route={'immobiliare.it':/^\/annunci\/(\d+)\/?$/,'idealista.it':/^\/immobile\/(\d+)\/?$/}[host];
      const id=route && u.pathname.match(route)?.[1];
      if(!id || ![host,'www.'+host].includes(u.hostname)) return null;
      return {...RULES.normalizeUrl(raw),host,id};
    } catch {return null;}
  }
  const same = (a,b) => !!a && !!b && a.host===b.host && a.id===b.id;
  function number(value, max) {
    if(value==null || value==='') return null;
    const parsed=typeof value==='number' ? value : typeof value==='string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed>0 && parsed<=max ? parsed : null;
  }
  function text(value, max) {
    return typeof value==='string' ? RULES.cleanText(value,max) : '';
  }
  function validate(raw, now=Date.now()) {
    try {
      const serialized=typeof raw==='string' ? raw : JSON.stringify(raw);
      if(typeof serialized!=='string') return fail('invalid_payload');
      if(byteLength(serialized)>MAX_BYTES) return fail('payload_too_large');
      const payload=JSON.parse(serialized);
      if(keys(payload,['kind','version','error']) && Object.keys(payload).length===3 && payload.kind===KIND && payload.version===VERSION && ERRORS.includes(payload.error)) return fail(payload.error);
      if(!keys(payload,['kind','version','sourceUrl','pageUrl','canonicalUrl','capturedAt','data','images','gallery']) || payload.kind!==KIND || payload.version!==VERSION) return fail('invalid_payload');
      const source=listing(payload.sourceUrl), page=listing(payload.pageUrl);
      if(!source || !page) return fail('unsupported_listing_url');
      if(!same(source,page) || (payload.canonicalUrl!==undefined && !same(source,listing(payload.canonicalUrl)))) return fail('source_mismatch');
      const at=payload.capturedAt;
      if(typeof at!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString()!==(at.length===20?at.slice(0,-1)+'.000Z':at) || Date.parse(at)>now+300000) return fail('invalid_capture_date');
      if(!keys(payload.data,['title','price','zone','sqm','rooms'])) return fail('invalid_data');
      const input=payload.data;
      if(['title','zone'].some(key=>input[key]!=null && typeof input[key]!=='string') || ['price','sqm','rooms'].some(key=>input[key]!=null && input[key]!=='' && number(input[key],key==='price'?1000000:key==='sqm'?100000:100)===null)) return fail('invalid_data');
      const data={title:text(input.title,130),price:number(input.price,1000000),zone:text(input.zone,90),sqm:number(input.sqm,100000),rooms:number(input.rooms,100)};
      if(!Array.isArray(payload.images)) return fail('invalid_photo_url');
      if(payload.images.length>RULES.MAX_PHOTOS) return fail('too_many_photos');
      if(!payload.images.length) return fail('photos_not_found');
      const images=payload.images.map(url=>typeof url==='string' && url.length<=MAX_URL ? RULES.photoUrl(url,source.source) : null);
      if(images.some(url=>!url) || new Set(images).size!==images.length) return fail('invalid_photo_url');
      const gallery=payload.gallery;
      if(!keys(gallery,['expected','found']) || gallery.found!==images.length || (gallery.expected!==null && (!Number.isSafeInteger(gallery.expected) || gallery.expected<images.length))) return fail('invalid_gallery');
      return {ok:true,source:{url:source.url,source:source.source},data,images,gallery:{expected:gallery.expected,found:images.length},capturedAt:at};
    } catch {return fail('invalid_payload');}
  }
  // Nessuna lettura globale delle immagini: i suggerimenti di altre case restano fuori.
  const GALLERIES={
    'immobiliare.it':['.in-gallery','[data-testid="listing-gallery"]','[data-testid="gallery"]'],
    'idealista.it':['#main-multimedia','.detail-multimedia','.multimedia-container','[data-testid="listing-gallery"]'],
  };
  const COUNTERS={
    'immobiliare.it':['.in-gallery__counter','.in-carousel__counter','[data-testid="gallery-counter"]'],
    'idealista.it':['.multimedia-shortcuts','[data-testid="gallery-counter"]'],
  };
  function capture(document, pageUrl) {
    try {
      const source=listing(pageUrl);
      if(!source) return fail('unsupported_listing_url');
      const canonicalNodes=Array.from(document.querySelectorAll('link[rel="canonical"]'));
      if(canonicalNodes.length>1) return fail('source_mismatch');
      const canonicalUrl=canonicalNodes[0]?.getAttribute('href');
      if(canonicalUrl && !same(source,listing(canonicalUrl))) return fail('source_mismatch');
      const schemas=[], scriptNodes=Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      let size=0, foreign=false;
      const collect=(value, inherited=null, depth=0)=>{
        if(depth>8 || !value || typeof value!=='object') return;
        if(Array.isArray(value)) {value.slice(0,100).forEach(item=>collect(item,inherited,depth+1));return;}
        const type=Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
        const property=type.some(t=>['Apartment','House','Residence','SingleFamilyResidence','RealEstateListing'].includes(t));
        const identities=[value.url,value.mainEntityOfPage?.['@id'],typeof value.mainEntityOfPage==='string'?value.mainEntityOfPage:null,value['@id']].filter(v=>v!=null);
        const resolved=identities.map(identity=>{
          try {return typeof identity==='string'?listing(new URL(identity,source.url).toString()):null;} catch {return null;}
        });
        const own=resolved[0] || null;
        // Un'identità esplicita diversa non eredita mai quella della pagina padre.
        const inconsistent=resolved.some(identity=>!same(source,identity));
        const linked=identities.length ? (inconsistent?null:own) : inherited;
        if(property && linked) {
          if(same(source,linked)) schemas.push(value);
          else foreign=true;
        }
        if(property && inconsistent) foreign=true;
        if(value['@graph']) collect(value['@graph'],null,depth+1);
        // Solo l'entità principale, mai ItemList/recommendation/offers.itemListElement.
        if(value.mainEntity) collect(value.mainEntity,inconsistent?null:own,depth+1);
        if(property && value.itemOffered) collect(value.itemOffered,linked,depth+1);
      };
      for(const node of scriptNodes) {
        const json=node.textContent || '';size+=byteLength(json);
        if(size>MAX_BYTES) return fail('payload_too_large');
        try {collect(JSON.parse(json));} catch { /* Il DOM visibile può essere sufficiente. */ }
      }
      if(!schemas.length && foreign) return fail('source_mismatch');
      const images=[], seen=new Set();
      const add=raw=>{
        const url=typeof raw==='string' && raw.length<=MAX_URL ? RULES.photoUrl(raw,source.source) : null;
        if(!url) return false;
        const parsed=new URL(url), identity=source.host==='immobiliare.it' ? parsed.pathname.match(/\/image\/(\d+)\//)?.[1] || parsed.origin+parsed.pathname : parsed.origin+parsed.pathname;
        if(!seen.has(identity)) {seen.add(identity);images.push(url);}
        return true;
      };
      for(const item of schemas) for(const photo of Array.isArray(item.image)?item.image:item.image?[item.image]:[]) add(typeof photo==='string'?photo:photo?.contentUrl || photo?.url);
      const galleries=[...new Set(GALLERIES[source.host].flatMap(selector=>Array.from(document.querySelectorAll(selector))))];
      let expected=null;
      const count=raw=>{
        const value=String(raw || '').trim();
        const match=value.match(/^\d+\s*\/\s*(\d+)$/) || value.match(/^(\d+)\s*(?:foto|fotos|photos|immagini)$/i) || value.match(/^(\d+)$/);
        const n=match && Number(match[1]);
        if(Number.isSafeInteger(n) && n>0) expected=Math.max(expected || 0,n);
      };
      for(const gallery of galleries) {
        count(gallery.getAttribute('data-total'));count(gallery.getAttribute('data-count'));
        for(const img of gallery.querySelectorAll('img')) {
          // La prima variante valida per la foto prevale; nessuna URL viene inventata.
          for(const raw of [img.getAttribute('data-original'),img.getAttribute('data-src'),img.currentSrc,img.getAttribute('src')]) if(add(raw)) break;
        }
      }
      for(const selector of COUNTERS[source.host]) for(const node of document.querySelectorAll(selector)) count(node.textContent?.trim());
      if(images.length>RULES.MAX_PHOTOS) return fail('too_many_photos');
      const item=schemas[0] || {};
      const getText=selectors=>selectors.map(selector=>document.querySelector(selector)?.textContent || '').find(Boolean) || '';
      const visiblePrice=getText(source.host==='immobiliare.it'?['.in-detail__price','[data-testid="price"]']:['.info-data-price','[data-testid="price"]']);
      const priceMatch=visiblePrice.trim().match(/^(?:€\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)\s*€?(?:\s*\/\s*(?:mese|mes))?$/i);
      const payload={kind:KIND,version:VERSION,sourceUrl:source.url,pageUrl:source.url,...(canonicalUrl?{canonicalUrl:listing(canonicalUrl).url}:{}),capturedAt:new Date().toISOString(),
        data:{title:text(item.name || getText(['h1']),130),price:number(item.offers?.price,1000000) || (priceMatch?number(priceMatch[1].replace(/\./g,'').replace(',','.'),1000000):null),zone:text(item.address?.addressLocality,90),sqm:number(item.floorSize?.value,100000),rooms:number(item.numberOfRooms,100)},
        images,gallery:{expected,found:images.length}};
      const result=validate(payload);
      return result.ok ? {ok:true,payload} : result;
    } catch {return fail('capture_unavailable');}
  }
  const API={KIND,VERSION,MAX_BYTES,MAX_URL,validate,capture};
  if(typeof module!=='undefined' && module.exports) module.exports=API;
  if(root) root.BOOM_SMARTLINK_SHARE=API;
})(typeof window!=='undefined'?window:this);
