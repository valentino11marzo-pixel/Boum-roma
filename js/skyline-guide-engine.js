/* Skyline guidance is a view of the public catalogue, never a score or an appraisal. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.BOOM_SKYLINE_GUIDE=factory();
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function positive(v){return typeof v==='number'&&isFinite(v)&&v>0?v:null;}
  function journey(j){
    if(!j||positive(j.min)===null||['piedi','rete','stima'].indexOf(j.fonte)<0)return null;
    return j;
  }
  function rank(records,options){
    options=options||{};
    var budget=positive(options.budget),priority=['rent','space','commute'].indexOf(options.priority)>=0?options.priority:'rent';
    var seen=Object.create(null),unknownPrice=0;
    var eligible=(Array.isArray(records)?records:[]).filter(function(r){
      if(!r||!r.id||seen[r.id]||r.missing||r.lane==='closed')return false;
      seen[r.id]=true;
      if(positive(r.rent)===null){unknownPrice++;return false;}
      return true;
    });
    var matches=eligible.filter(function(r){return !budget||r.rent<=budget;});
    var sorted=matches.slice().sort(function(a,b){
      var delta=0;
      if(priority==='space')delta=(positive(b.area)||-Infinity)-(positive(a.area)||-Infinity);
      if(priority==='commute')delta=(journey(a.journey)?a.journey.min:Infinity)-(journey(b.journey)?b.journey.min:Infinity);
      return (isNaN(delta)?0:delta)||a.rent-b.rent||String(a.id).localeCompare(String(b.id));
    });
    // Missing area/commute never wins a corresponding priority, nor disappears silently.
    return {priority:priority,budget:budget,total:eligible.length,matches:matches.length,unknownPrice:unknownPrice,
      candidates:sorted.slice(0,3).map(function(r){return Object.assign({},r,{journey:journey(r.journey),headroom:budget===null?null:budget-r.rent});})};
  }
  function directions(j){
    if(!journey(j)||!j.origin||!j.destination)return null;
    var a=j.origin,b=j.destination;
    if(![a.lat,a.lng,b.lat,b.lng].every(function(v){return typeof v==='number'&&isFinite(v);})||Math.abs(a.lat)>90||Math.abs(b.lat)>90||Math.abs(a.lng)>180||Math.abs(b.lng)>180)return null;
    return 'https://www.google.com/maps/dir/?api=1&origin='+a.lat+','+a.lng+'&destination='+b.lat+','+b.lng+'&travelmode='+(j.fonte==='piedi'?'walking':'transit');
  }
  return {rank:rank,directions:directions};
});
