/* BOOM Flight — links derived from existing preferences, never a second catalogue. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_FLIGHT = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var ID = /^[A-Za-z0-9_-]{1,120}$/;
  function saved(raw) {
    var a; try { a = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return []; }
    if (!Array.isArray(a)) return [];
    return a.filter(function (s, i) {
      return typeof s === 'string' && /^\/listing\/[A-Za-z0-9_-]{1,120}$/.test(s) && a.indexOf(s) === i;
    }).slice(0, 100);
  }
  function skyline(paths) {
    var ids = saved(paths).slice(0, 20).map(function (p) { return p.slice(9); });
    return '/skyline' + (ids.length ? '?homes=' + ids.map(encodeURIComponent).join(',') : '');
  }
  function listing(id) { return ID.test(String(id || '')) ? '/listing/' + id : null; }
  // A comparison is a view over the existing saved paths and the current
  // public catalogue. Facts/date/geo rules stay with their original engines.
  // Missing listings remain visible as unknown instead of silently vanishing.
  function compare(paths, catalogue, options) {
    options=options||{};
    var records=Object.create(null);
    (Array.isArray(catalogue)?catalogue:[]).forEach(function(l){
      var path=l&&listing(l.id);
      if(path&&String(l.status||'').toLowerCase()!=='draft'&&(l.name||l.title))records[path]=l;
    });
    function positive(v){
      if(typeof v!=='number'&&typeof v!=='string')return null;
      if(typeof v==='string'&&!/^\d+(?:\.\d{1,2})?$/.test(v.trim()))return null;
      var n=Number(v);return isFinite(n)&&n>0?n:null;
    }
    return saved(paths).slice(0,3).map(function(path){
      var l=records[path],id=path.slice(9);
      if(!l)return {id:id,path:path,missing:true,name:'Saved home',zone:'Not in the current catalogue',image:'',rent:null,area:null,bedrooms:null,availability:'Listing not available to verify',lane:'unknown',precision:'none'};
      var facts=options.facts,dispo=options.dispo,geo=options.geo;
      var date=dispo&&dispo.laneCopy?dispo.laneCopy(l,'en',options.today):null;
      var image=String(l.image||(Array.isArray(l.images)&&l.images[0])||'');
      if(!/^https:\/\//i.test(image)&&!/^\/(?!\/)/.test(image))image='';
      var precision=geo&&geo.pinPrecision?geo.pinPrecision(l).level:'none';
      return {id:id,path:path,missing:false,name:String(l.name||l.title),zone:String(l.zone||l.neighborhood||'Rome'),image:image,
        rent:positive(l.price),area:positive(l.sqm),bedrooms:facts&&facts.bedroomsOf?facts.bedroomsOf(l):null,
        availability:date?date.short:'Ask us for the date',lane:date?date.lane:'unknown',precision:precision};
    });
  }
  return { saved: saved, skyline: skyline, listing: listing, compare: compare };
});
