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
      const route={'immobiliare.it':/^\/annunci\/(\d+)\/?$/,'idealista.it':/^\/immobile\/(\d+)(?:\/foto\/([1-9]\d*))?\/?$/}[host];
      const match=route && u.pathname.match(route), id=match?.[1];
      if(!id || ![host,'www.'+host].includes(u.hostname)) return null;
      const page=RULES.normalizeUrl(raw);
      /* La galleria navigata resta la pagina osservata; la scheda usa l'annuncio base. */
      return {...page,url:match[2]?u.origin+'/immobile/'+id+'/':page.url,pageUrl:page.url,host,id};
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
  function displayedPrice(value) {
    const match=String(value || '').trim().match(/^(?:€\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)\s*€?(?:\s*\/\s*(?:mese|mes))?$/i);
    return match?number(match[1].replace(/\./g,'').replace(',','.'),1000000):null;
  }
  function validate(raw, now=Date.now()) {
    try {
      const serialized=typeof raw==='string' ? raw : JSON.stringify(raw);
      if(typeof serialized!=='string') return fail('invalid_payload');
      if(byteLength(serialized)>MAX_BYTES) return fail('payload_too_large');
      const payload=JSON.parse(serialized);
      if(payload?.kind===FRAMES_KIND) {const combined=combineFrames(payload,now);return combined.ok?validate(combined.payload,now):combined;}
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
  /* Nessuna lettura globale delle immagini: i suggerimenti di altre case restano fuori. */
  const GALLERIES={
    'immobiliare.it':['.in-gallery','[data-testid="listing-gallery"]','[data-testid="gallery"]'],
    'idealista.it':['#main-multimedia','.detail-multimedia','.multimedia-container','[data-testid="listing-gallery"]','.image-gallery-slide-wrapper'],
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
        /* Un'identità esplicita diversa non eredita mai quella della pagina padre. */
        const inconsistent=resolved.some(identity=>!same(source,identity));
        const linked=identities.length ? (inconsistent?null:own) : inherited;
        if(property && linked) {
          if(same(source,linked)) schemas.push(value);
          else foreign=true;
        }
        if(property && inconsistent) foreign=true;
        if(value['@graph']) collect(value['@graph'],null,depth+1);
        /* Solo l'entità principale, mai ItemList/recommendation/offers.itemListElement. */
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
        const isIdealistaSlides=source.host==='idealista.it' && String(gallery.getAttribute('class') || '').split(/\s+/).includes('image-gallery-slide-wrapper');
        const photoNodes=isIdealistaSlides ? Array.from(gallery.querySelectorAll('.image-gallery-slide')).flatMap(slide=>Array.from(slide.querySelectorAll('figure.item-gallery')).flatMap(figure=>Array.from(figure.querySelectorAll('img')))) : gallery.querySelectorAll('img');
        for(const img of photoNodes) {
          /* La prima variante valida per la foto prevale; nessuna URL viene inventata. */
          for(const raw of [img.getAttribute('data-original'),img.getAttribute('data-src'),img.currentSrc,img.getAttribute('src')]) if(add(raw)) break;
        }
      }
      for(const selector of COUNTERS[source.host]) for(const node of document.querySelectorAll(selector)) count(node.textContent?.trim());
      if(images.length>RULES.MAX_PHOTOS) return fail('too_many_photos');
      const item=schemas[0] || {};
      const getText=selectors=>selectors.map(selector=>document.querySelector(selector)?.textContent || '').find(Boolean) || '';
      const visiblePrice=getText(source.host==='immobiliare.it'?['.in-detail__price','[data-testid="price"]']:['.info-data-price','[data-testid="price"]']);
      const visible={price:[],sqm:[],rooms:[],zone:[]};
      if(source.host==='idealista.it') {
        for(const detail of document.querySelectorAll('section.detail-content-wrapper')) for(const info of detail.querySelectorAll('p.info-data')) for(const container of info.querySelectorAll('.price-container')) for(const node of container.querySelectorAll('strong.price')) visible.price.push(displayedPrice(node.textContent));
        for(const detail of document.querySelectorAll('section.detail-content-wrapper')) for(const features of detail.querySelectorAll('div.info-features')) for(const node of features.querySelectorAll('span')) {
          const value=String(node.textContent || '').trim().replace(/\s+/g,' ');
          const sqm=value.match(/^(\d+(?:[.,]\d+)?)\s*m²$/i), rooms=value.match(/^(\d+)\s+local[ei]$/i);
          if(sqm) visible.sqm.push(number(sqm[1].replace(',','.'),100000));
          if(rooms) visible.rooms.push(number(rooms[1],100));
        }
        for(const main of document.querySelectorAll('main.detail-container')) for(const block of main.querySelectorAll('span.main-info__title-block')) for(const node of block.querySelectorAll('span.main-info__title-minor')) visible.zone.push(text(node.textContent,90));
      }
      const consistent=(initial,candidates)=>{
        const values=[...new Set([initial,...candidates].filter(value=>value!==null))];
        return values.length===1?values[0]:null;
      };
      const zones=[...new Set(visible.zone.filter(Boolean))];
      const payload={kind:KIND,version:VERSION,sourceUrl:source.url,pageUrl:source.pageUrl,...(canonicalUrl?{canonicalUrl:listing(canonicalUrl).pageUrl}:{}),capturedAt:new Date().toISOString(),
        data:{title:text(item.name || getText(['h1']),130),price:consistent(number(item.offers?.price,1000000) || displayedPrice(visiblePrice),visible.price),zone:text(item.address?.addressLocality,90) || (zones.length===1?zones[0]:''),sqm:consistent(number(item.floorSize?.value,100000),visible.sqm),rooms:consistent(number(item.numberOfRooms,100),visible.rooms)},
        images,gallery:{expected,found:images.length}};
      const result=validate(payload);
      return result.ok ? {ok:true,payload} : result;
    } catch {return fail('capture_unavailable');}
  }
  const PLAN_KIND='boom.smartlink.plan', FRAME_KIND='boom.smartlink.frame', FRAMES_KIND='boom.smartlink.share.frames';
  const MAX_SEQUENCE_MS=180000;
  const closed=(value,allowed)=>keys(value,allowed) && Object.keys(value).length===allowed.length;
  const protocolError=(error,fallback='capture_unavailable')=>fail(ERRORS.includes(error?.message)?error.message:fallback);
  const exactDate=(value,now)=>typeof value==='string' && value.length===24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value && Date.parse(value)<=now+300000;
  function positionsFor(total,start) {
    const result=[start];let current=start,direction=start-1<=total-start?-1:1;
    while(current+direction>=1 && current+direction<=total) {current+=direction;result.push(current);}
    direction=-direction;
    while(current+direction>=1 && current+direction<=total) {current+=direction;result.push(current);}
    return result;
  }
  function checkedPlan(plan,now=Date.now()) {
    if(!closed(plan,['kind','version','sourceUrl','canonicalUrl','total','start','positions','count','capturedAt']) || plan.kind!==PLAN_KIND || plan.version!==VERSION) throw new Error('invalid_payload');
    const source=listing(plan.sourceUrl);
    if(!source || source.host!=='idealista.it' || source.url!==plan.sourceUrl) throw new Error('unsupported_listing_url');
    if(plan.canonicalUrl!==null) {
      const canonical=listing(plan.canonicalUrl);
      if(!same(source,canonical) || canonical.pageUrl!==plan.canonicalUrl) throw new Error('source_mismatch');
    }
    if(!Number.isSafeInteger(plan.total) || plan.total<1) throw new Error('invalid_gallery');
    if(plan.total>RULES.MAX_PHOTOS) throw new Error('too_many_photos');
    if(!Number.isSafeInteger(plan.start) || plan.start<1 || plan.start>plan.total) throw new Error('invalid_gallery');
    const positions=positionsFor(plan.total,plan.start);
    if(!Array.isArray(plan.positions) || plan.positions.length!==positions.length || plan.positions.some((index,i)=>index!==positions[i]) || plan.count!==positions.length) throw new Error('invalid_gallery');
    if(!exactDate(plan.capturedAt,now)) throw new Error('invalid_capture_date');
    return source;
  }
  function galleryPhotoKey(url) {
    const parsed=new URL(url);
    const id=parsed.pathname.match(/\/id\.pro\.it\.image\.master\/(?:[0-9a-f]{2}\/){3}([0-9]+)\.(?:jpe?g|webp)$/i)?.[1];
    return id?'idealista:'+id:parsed.origin+parsed.pathname;
  }
  function galleryFrame(document,pageUrl,plan=null) {
    const source=listing(pageUrl);
    if(!source || source.host!=='idealista.it') throw new Error('unsupported_listing_url');
    const canonicalNodes=Array.from(document.querySelectorAll('link[rel="canonical"]'));
    if(canonicalNodes.length>1) throw new Error('source_mismatch');
    const href=canonicalNodes[0]?.getAttribute('href'), canonical=href?listing(href):null;
    if(href && !same(source,canonical)) throw new Error('source_mismatch');
    const canonicalUrl=canonical?.pageUrl || null;
    if(plan && (!same(source,listing(plan.sourceUrl)) || canonicalUrl!==plan.canonicalUrl)) throw new Error('source_mismatch');
    const galleries=Array.from(document.querySelectorAll('#gallery'));
    if(galleries.length!==1) throw new Error('invalid_gallery');
    const gallery=galleries[0], counters=Array.from(gallery.querySelectorAll('[data-testid="gallery-counter"]'));
    const match=counters.length===1 && counters[0].textContent.trim().match(/^([1-9]\d*)\s*\/\s*([1-9]\d*)$/);
    if(!match) throw new Error('invalid_gallery');
    const index=Number(match[1]),total=Number(match[2]);
    if(!Number.isSafeInteger(total) || total<1 || index>total) throw new Error('invalid_gallery');
    if(total>RULES.MAX_PHOTOS) throw new Error('too_many_photos');
    if(plan && total!==plan.total) throw new Error('invalid_gallery');
    const images=Array.from(gallery.querySelectorAll('.image-gallery-slide.center figure.item-gallery picture img'));
    if(images.length!==1) throw new Error('photos_not_found');
    const img=images[0], declared=img.getAttribute('src'), current=img.currentSrc;
    const src=typeof declared==='string' && declared.length<=MAX_URL ? RULES.photoUrl(declared,source.source):null;
    const loaded=typeof current==='string' && current.length<=MAX_URL ? RULES.photoUrl(current,source.source):null;
    if((declared && !src) || (current && !loaded)) throw new Error('invalid_photo_url');
    if(!src && !loaded) throw new Error('photos_not_found');
    if(src && loaded && galleryPhotoKey(src)!==galleryPhotoKey(loaded)) throw new Error('invalid_gallery');
    return {source,canonicalUrl,gallery,index,total,image:loaded || src};
  }
  function capturePlan(document,pageUrl) {
    try {
      const observed=galleryFrame(document,pageUrl), initial=capture(document,pageUrl);
      if(!initial.ok) return initial;
      if(initial.payload.gallery.expected!==null && initial.payload.gallery.expected!==observed.total) return fail('invalid_gallery');
      const positions=positionsFor(observed.total,observed.index);
      const plan={kind:PLAN_KIND,version:VERSION,sourceUrl:observed.source.url,canonicalUrl:observed.canonicalUrl,
        total:observed.total,start:observed.index,positions,count:positions.length,capturedAt:initial.payload.capturedAt};
      checkedPlan(plan);
      return {ok:true,plan};
    } catch(error) {return protocolError(error);}
  }
  function captureFrame(document,pageUrl,plan,repeatIndex) {
    try {
      checkedPlan(plan);
      if(Date.now()-Date.parse(plan.capturedAt)>MAX_SEQUENCE_MS) return fail('capture_unavailable');
      if(!Number.isSafeInteger(repeatIndex) || repeatIndex<1 || repeatIndex>plan.count) return fail('invalid_gallery');
      const observed=galleryFrame(document,pageUrl,plan);
      if(observed.index!==plan.positions[repeatIndex-1]) return fail('invalid_gallery');
      const snapshot=capture(document,pageUrl);
      if(!snapshot.ok) return snapshot;
      if(snapshot.payload.gallery.expected!==null && snapshot.payload.gallery.expected!==plan.total) return fail('invalid_gallery');
      const frame={kind:FRAME_KIND,version:VERSION,step:repeatIndex,index:observed.index,total:plan.total,
        sourceUrl:plan.sourceUrl,pageUrl:observed.source.pageUrl,canonicalUrl:plan.canonicalUrl,
        capturedAt:snapshot.payload.capturedAt,data:snapshot.payload.data,image:observed.image};
      if(repeatIndex<plan.count) {
        const next=plan.positions[repeatIndex],direction=next-observed.index;
        if(Math.abs(direction)!==1 || next<1 || next>plan.total) return fail('invalid_gallery');
        const label=direction<0?'Previous Slide':'Next Slide';
        const buttons=Array.from(observed.gallery.querySelectorAll('button[aria-label="'+label+'"]'));
        if(buttons.length!==1 || buttons[0].disabled || buttons[0].getAttribute('aria-disabled')==='true' || typeof buttons[0].click!=='function') return fail('capture_unavailable');
        buttons[0].click();
      }
      return {ok:true,frame};
    } catch(error) {return protocolError(error);}
  }
  function combineFrames(raw,now=Date.now()) {
    try {
      const serialized=typeof raw==='string'?raw:JSON.stringify(raw);
      if(typeof serialized!=='string') return fail('invalid_payload');
      if(byteLength(serialized)>MAX_BYTES) return fail('payload_too_large');
      const envelope=JSON.parse(serialized);
      if(!closed(envelope,['kind','version','plan','frames']) || envelope.kind!==FRAMES_KIND || envelope.version!==VERSION) return fail('invalid_payload');
      const plan=envelope.plan;checkedPlan(plan,now);
      if(!Array.isArray(envelope.frames) || !envelope.frames.length || envelope.frames.length>plan.count) return fail('invalid_gallery');
      const photos=new Map(), owners=new Map(), data=[];
      let previousAt=Date.parse(plan.capturedAt);
      for(let step=0;step<envelope.frames.length;step++) {
        const frame=envelope.frames[step];
        if(closed(frame,['kind','version','error']) && frame.kind===KIND && frame.version===VERSION && ERRORS.includes(frame.error)) return fail(frame.error);
        if(!closed(frame,['kind','version','step','index','total','sourceUrl','pageUrl','canonicalUrl','capturedAt','data','image']) || frame.kind!==FRAME_KIND || frame.version!==VERSION) return fail('invalid_payload');
        if(frame.step!==step+1 || frame.index!==plan.positions[step] || frame.total!==plan.total) return fail('invalid_gallery');
        if(frame.sourceUrl!==plan.sourceUrl || frame.canonicalUrl!==plan.canonicalUrl || !same(listing(plan.sourceUrl),listing(frame.pageUrl))) return fail('source_mismatch');
        const at=Date.parse(frame.capturedAt);
        if(!exactDate(frame.capturedAt,now) || at<previousAt || at-Date.parse(plan.capturedAt)>MAX_SEQUENCE_MS) return fail('invalid_capture_date');
        previousAt=at;
        const checked=validate({kind:KIND,version:VERSION,sourceUrl:frame.sourceUrl,pageUrl:frame.pageUrl,
          ...(frame.canonicalUrl?{canonicalUrl:frame.canonicalUrl}:{}),capturedAt:frame.capturedAt,
          data:frame.data,images:[frame.image],gallery:{expected:plan.total,found:1}},now);
        if(!checked.ok) return checked;
        const key=galleryPhotoKey(checked.images[0]),previous=photos.get(frame.index),owner=owners.get(key);
        if((previous && previous.key!==key) || (owner!==undefined && owner!==frame.index)) return fail('invalid_gallery');
        if(!previous) {photos.set(frame.index,{key,url:checked.images[0]});owners.set(key,frame.index);}
        data.push(checked.data);
      }
      const coherent=(key,empty)=>{
        /* Un null/vuoto può già rappresentare un conflitto dentro un frame. */
        const values=[...new Set(data.map(item=>item[key]))];
        return values.length===1?values[0]:empty;
      };
      const images=Array.from(photos).sort(([a],[b])=>a-b).map(([,photo])=>photo.url);
      const payload={kind:KIND,version:VERSION,sourceUrl:plan.sourceUrl,pageUrl:envelope.frames[0].pageUrl,
        ...(plan.canonicalUrl?{canonicalUrl:plan.canonicalUrl}:{}),capturedAt:plan.capturedAt,
        data:{title:coherent('title',''),price:coherent('price',null),zone:coherent('zone',''),sqm:coherent('sqm',null),rooms:coherent('rooms',null)},
        images,gallery:{expected:plan.total,found:images.length}};
      const result=validate(payload,now);
      return result.ok?{ok:true,payload}:result;
    } catch(error) {return protocolError(error,'invalid_payload');}
  }

  const API={KIND,VERSION,MAX_BYTES,MAX_URL,PLAN_KIND,FRAME_KIND,FRAMES_KIND,validate,capture,capturePlan,captureFrame,combineFrames};
  if(typeof module!=='undefined' && module.exports) module.exports=API;
  if(root) root.BOOM_SMARTLINK_SHARE=API;
})(typeof window!=='undefined'?window:this);
