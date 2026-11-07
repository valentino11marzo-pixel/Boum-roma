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
  function modelled(j){return !!(journey(j)&&j.fonte==='rete');}
  function journeyStatus(j){return modelled(j)?'modelled':journey(j)?'estimate':'unknown';}
  function byRent(a,b){return a.rent-b.rent||String(a.id).localeCompare(String(b.id));}
  function pool(records,options){
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
    return {priority:priority,budget:budget,total:eligible.length,matches:matches.length,unknownPrice:unknownPrice,
      journeys:matches.filter(function(r){return journey(r.journey);}).length,
      comparableJourneys:matches.filter(function(r){return modelled(r.journey);}).length,
      estimatedJourneys:matches.filter(function(r){return journeyStatus(r.journey)==='estimate';}).length,
      unknownJourneys:matches.filter(function(r){return !journey(r.journey);}).length,records:matches};
  }
  function candidate(r,budget){return Object.assign({},r,{journey:journey(r.journey),journeyStatus:journeyStatus(r.journey),headroom:budget===null?null:budget-r.rent});}
  function rank(records,options){
    var result=pool(records,options),priority=result.priority;
    var sorted=result.records.slice().sort(function(a,b){
      var delta=0;
      if(priority==='space')delta=(positive(b.area)||-Infinity)-(positive(a.area)||-Infinity);
      if(priority==='commute'){
        // A straight-line walk or geometric transit estimate is not a faster
        // measured route. Keep it visible after timetable models, ordered by
        // rent, with unknown journeys last. No comparison of unlike minutes.
        var quality=function(r){return modelled(r.journey)?0:journey(r.journey)?1:2;};
        delta=quality(a)-quality(b);
        if(!delta&&modelled(a.journey)&&modelled(b.journey))delta=a.journey.min-b.journey.min;
      }
      return (isNaN(delta)?0:delta)||byRent(a,b);
    });
    // Missing area/commute never wins a corresponding priority, nor disappears silently.
    result.candidates=sorted.slice(0,3).map(function(r){return candidate(r,result.budget);});delete result.records;return result;
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
    else if(result.priority==='commute'&&modelled(record.journey))out.push('Timetable model: approximately '+record.journey.min+' minutes; not a live departure. Check the actual route.');
    else if(result.priority==='commute'&&journey(record.journey))out.push('Route estimate only: ordered by rent after homes with a timetable model. Check the actual route.');
    else out.push('Rent first: '+(record.headroom>0?'below your stated rent limit.':'ordered by the advertised monthly rent.'));
    var cheaper=others.filter(function(r){return r.rent<record.rent;}).sort(function(a,b){return a.rent-b.rent;})[0];
    if(cheaper)out.push('€'+(record.rent-cheaper.rent).toLocaleString('en-US')+' more per month than the lowest-rent option shown.');
    else if(others.length)out.push('No higher in rent than the other options shown.');
    if(!record.journey)out.push('Route still to verify; destination proximity is not a claim.');
    return out;
  }
  function homeKind(value){
    var type=String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
    if(type==='room'||type==='private room'||type==='shared room')return type;
    // Explicit catalogue aliases only. Facts has no rental-type classifier;
    // adjectives such as "Historic" or "Garden floor" do not prove a unit.
    if(type==='room with private bath'||type==='room with private bathroom')return 'room';
    if(/^(entire )?(apartment|flat|studio|loft|duplex|monolocale|bilocale|trilocale|quadrilocale)$/.test(type)||/^(spacious )?[1-9] bedroom (flat|apartment)$/.test(type))return 'apartment';
    return null;
  }
  function peersOf(record,records){
    var kind=homeKind(record&&record.type);
    if(!kind)return [];
    return (records||[]).filter(function(r){return r&&r.id!==record.id&&!r.missing&&r.lane!=='closed'&&kind&&homeKind(r.type)===kind&&positive(r.rent)!==null;}).sort(byRent);
  }
  function sameJourney(a,b){
    if(!modelled(a)||!modelled(b)||['exact','street','zone'].indexOf(a.precision)<0||a.precision!==b.precision||!a.destination||!b.destination)return false;
    var x=a.destination,y=b.destination;
    return [x.lat,x.lng,y.lat,y.lng].every(function(v){return typeof v==='number'&&isFinite(v);})&&Math.abs(x.lat)<=90&&Math.abs(x.lng)<=180&&x.lat===y.lat&&x.lng===y.lng;
  }
  function differences(record,base){
    return {rentDelta:base?record.rent-base.rent:null,
      areaDelta:base&&positive(record.area)!==null&&positive(base.area)!==null?record.area-base.area:null,
      minutesDelta:base&&sameJourney(record.journey,base.journey)?record.journey.min-base.journey.min:null};
  }
  function tradeoff(record,records){
    var kind=homeKind(record&&record.type),peers=peersOf(record,records);
    if(!kind||!peers.length)return {comparable:false,reason:kind?'No other '+kind+' shown for a like-for-like comparison.':'Home type needs confirmation before comparing.'};
    var base=peers[0];
    // Compare space only within the same listed home type; do not turn missing
    // fields, geometric estimates or different models into a benefit claim.
    return Object.assign({comparable:true,referenceId:base.id,referenceName:base.name,kind:kind},differences(record,base));
  }
  // Three complementary facts, not three copies of a winning score. Each
  // benefit has a named same-kind reference inside the hard-budget pool.
  // A home winning several categories appears once; missing facts do not
  // create filler alternatives or a fabricated route advantage.
  function balance(records,options){
    var result=pool(records,options),matches=result.records.slice().sort(byRent),winners={},candidates=[];
    function choice(record,category,base){
      var delta=differences(record,base),improvement=category==='rent'&&delta.rentDelta!==null&&delta.rentDelta<0;
      var reason=Object.assign({category:category,code:category==='rent'?(improvement?'lower-rent':'listed-rent'):category==='space'?'more-space':'easier-journey',
        label:category==='rent'?(improvement?'Lower rent':'Listed rent'):category==='space'?'More space':'Easier journey',
        kind:homeKind(record.type),referenceId:base?base.id:null,referenceName:base?base.name:null,
        basis:category==='rent'?'listed-rent':category==='space'?'listed-area':'timetable-model',
        referenceScope:base?(category==='commute'?'same-kind-and-journey-evidence':category==='space'?'same-kind-and-listed-area':'same-kind'):null},delta);
      return {record:record,reason:reason};
    }
    if(matches.length)winners.rent=choice(matches[0],'rent',peersOf(matches[0],matches)[0]);
    var spaces=[],commutes=[];
    matches.forEach(function(record){
      var peers=peersOf(record,matches),spaceBase=peers.filter(function(p){return positive(p.area)!==null;})[0];
      var journeyBase=peers.filter(function(p){return sameJourney(record.journey,p.journey);})[0];
      if(positive(record.area)!==null&&spaceBase&&record.area>spaceBase.area)spaces.push(choice(record,'space',spaceBase));
      // Compare with the lowest-rent peer whose journey evidence matches.
      // A cheaper unknown journey is never silently treated as slower.
      if(journeyBase&&record.journey.min<journeyBase.journey.min)commutes.push(choice(record,'commute',journeyBase));
    });
    spaces.sort(function(a,b){return b.record.area-a.record.area||byRent(a.record,b.record);});
    commutes.sort(function(a,b){return a.record.journey.min-b.record.journey.min||byRent(a.record,b.record);});
    if(spaces.length)winners.space=spaces[0];if(commutes.length)winners.commute=commutes[0];
    var order=[result.priority].concat(['rent','space','commute'].filter(function(key){return key!==result.priority;}));
    order.forEach(function(key){
      var win=winners[key];if(!win)return;
      var existing=candidates.find(function(r){return r.id===win.record.id;});
      if(existing){existing.categories.push(key);existing.reasons.push(win.reason);return;}
      candidates.push(Object.assign(candidate(win.record,result.budget),{category:key,categories:[key],reason:win.reason,reasons:[win.reason]}));
    });
    result.mode='balance';result.availableCategories=order.filter(function(key){return !!winners[key];});
    result.unavailableCategories=order.filter(function(key){return !winners[key];});result.candidates=candidates;
    delete result.records;return result;
  }
  return {rank:rank,balance:balance,directions:directions,addressDirections:addressDirections,share:share,reasons:reasons,tradeoff:tradeoff,homeKind:homeKind};
});
