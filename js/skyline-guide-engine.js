/* Skyline guidance is a view of the public catalogue, never a score or an appraisal. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.BOOM_SKYLINE_GUIDE=factory();
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function positive(v){return typeof v==='number'&&isFinite(v)&&v>0?v:null;}
  function journey(j){
    if(!j||typeof j.min!=='number'||!isFinite(j.min)||j.min<0||['piedi','rete','stima'].indexOf(j.fonte)<0)return null;
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
    return {priority:priority,budget:budget,total:eligible.length,matches:matches.length,unknownPrice:unknownPrice,journeys:matches.filter(function(r){return journey(r.journey);}).length,
      candidates:sorted.slice(0,3).map(function(r){return Object.assign({},r,{journey:journey(r.journey),headroom:budget===null?null:budget-r.rent});})};
  }
  function directions(j){
    if(!journey(j)||!j.origin||!j.destination)return null;
    var a=j.origin,b=j.destination;
    if(![a.lat,a.lng,b.lat,b.lng].every(function(v){return typeof v==='number'&&isFinite(v);})||Math.abs(a.lat)>90||Math.abs(b.lat)>90||Math.abs(a.lng)>180||Math.abs(b.lng)>180)return null;
    return 'https://www.google.com/maps/dir/?api=1&origin='+a.lat+','+a.lng+'&destination='+b.lat+','+b.lng+'&travelmode='+(j.fonte==='piedi'?'walking':'transit');
  }
  function addressDirections(origin,address){
    if(!origin||typeof origin.lat!=='number'||typeof origin.lng!=='number'||!isFinite(origin.lat)||!isFinite(origin.lng)||Math.abs(origin.lat)>90||Math.abs(origin.lng)>180||typeof address!=='string'||!address.trim())return null;
    return 'https://www.google.com/maps/dir/?api=1&origin='+origin.lat+','+origin.lng+'&destination='+encodeURIComponent(address)+'&travelmode=transit';
  }
  // Explicit sharing serializes public, allow-listed preferences only. It never
  // accepts a personal place, coordinates, name, email or arbitrary query string.
  function share(options, destinations, allowedIds){
    options=options||{};
    var query=new URLSearchParams();query.set('guide','1');
    var budget=Number(options.budget);
    if(Number.isFinite(budget)&&budget>=0&&budget<=100000)query.set('budget',String(Math.round(budget)));
    if(['rent','space','commute'].indexOf(options.priority)>=0)query.set('priority',options.priority);
    if((destinations||[]).some(function(p){return p.slug===options.place;}))query.set('place',options.place);
    if(options.includeHomes){
      var seen=Object.create(null),allowed=new Set((allowedIds||[]).map(String));
      var ids=(Array.isArray(options.homes)?options.homes:[]).filter(function(id){
        if(typeof id!=='string'||!/^[-A-Za-z0-9_]{1,120}$/.test(id)||!allowed.has(id)||seen[id])return false;
        seen[id]=true;return true;
      }).slice(0,3);
      query.set('homes',ids.join(','));
    }
    return '/skyline?'+query.toString();
  }
  function reasons(record,result){
    var a=result.candidates||[],others=a.filter(function(r){return r.id!==record.id;}),out=[];
    if(result.priority==='space'&&positive(record.area)!==null)out.push('Space first: '+record.area+' m² of listed floor area.');
    else if(result.priority==='commute'&&journey(record.journey))out.push('Journey first: approximately '+record.journey.min+' minutes; check the actual route.');
    else out.push('Rent first: '+(record.headroom>0?'below your stated rent limit.':'ordered by the advertised monthly rent.'));
    var cheaper=others.filter(function(r){return r.rent<record.rent;}).sort(function(a,b){return a.rent-b.rent;})[0];
    if(cheaper)out.push('€'+(record.rent-cheaper.rent).toLocaleString('en-US')+' more per month than the lowest-rent option shown.');
    else if(others.length)out.push('No higher in rent than the other options shown.');
    if(!record.journey)out.push('Route still to verify; destination proximity is not a claim.');
    return out;
  }
  function homeKind(value){
    var type=String(value||'').trim().toLowerCase();
    if(type==='room'||type==='private room'||type==='shared room')return type;
    if(/^(entire )?(apartment|flat|studio)$/.test(type))return 'apartment';
    return null;
  }
  function tradeoff(record,records){
    var kind=homeKind(record&&record.type),peers=(records||[]).filter(function(r){return r&&r.id!==record.id&&kind&&homeKind(r.type)===kind&&positive(r.rent)!==null;});
    if(!kind||!peers.length)return {comparable:false,reason:kind?'No other '+kind+' shown for a like-for-like comparison.':'Home type needs confirmation before comparing.'};
    var base=peers.slice().sort(function(a,b){return a.rent-b.rent||String(a.id).localeCompare(String(b.id));})[0];
    // Compare space only within the same listed home type; do not turn missing
    // fields or different journey models into a benefit claim.
    var a=journey(record.journey),b=journey(base.journey);
    var travel=a&&b&&a.fonte===b.fonte&&a.precision===b.precision&&a.destination&&b.destination&&a.destination.lat===b.destination.lat&&a.destination.lng===b.destination.lng;
    return {comparable:true,referenceId:base.id,referenceName:base.name,kind:kind,
      rentDelta:record.rent-base.rent,
      areaDelta:positive(record.area)!==null&&positive(base.area)!==null?record.area-base.area:null,
      minutesDelta:travel?record.journey.min-base.journey.min:null};
  }
  return {rank:rank,directions:directions,addressDirections:addressDirections,share:share,reasons:reasons,tradeoff:tradeoff,homeKind:homeKind};
});
