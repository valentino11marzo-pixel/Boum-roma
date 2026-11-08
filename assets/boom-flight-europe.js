/* One BOOM identity; city services retain their own catalogue and original forms. */
(function () {
  'use strict';
  if (document.body.dataset.direction !== 'club') return;
  var J = window.BOOM_JOURNEY;
  var places = {
    rome:{name:'Rome',code:'ROM',landmark:'The Colosseum',copy:'Explore real homes. Find your balance of rent, space and everyday travel.'},
    madrid:{name:'Madrid',code:'MAD',landmark:'Puerta de Alcalá'},
    barcelona:{name:'Barcelona',code:'BCN',landmark:'Sagrada Família'},
    amsterdam:{name:'Amsterdam',code:'AMS',landmark:'The canal houses'},
    london:{name:'London',code:'LON',landmark:'Tower Bridge'},
    milan:{name:'Milan',code:'MIL',landmark:'The Duomo'}
  };
  var needs = {
    search:{label:'Find a home for me',hint:'A search with an agent on your side',plan:'full-search'},
    application:{label:'I’ve found a home',hint:'Help with the application and lease',plan:'application-pack'},
    viewing:{label:'Visit it for me',hint:'See a home while you’re away',plan:'attended-viewing'}
  };
  var query = new URLSearchParams(location.search);
  var dispatch = query.get('edition') === 'club' && query.get('experience') === 'panorama' && query.get('vision') === 'dispatch';
  var city = places[query.get('city')] ? query.get('city') : 'rome';
  if (query.get('view') === 'apartments' || query.get('view') === 'detail') city = 'rome';
  var need = needs[query.get('need')] ? query.get('need') : 'search';
  var view = query.get('view') || 'home', loaded = Object.create(null), loadNumber = 0, controller;
  var el = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
  function icon(slug) { return '<svg class="europe-city-icon" viewBox="0 0 160 120" aria-hidden="true"><use href="/assets/boom-city-icons.svg#city-'+slug+'"></use></svg>'; }
  function buttons() { return Object.keys(places).map(function(slug){return '<button type="button" data-europe-city="'+slug+'" aria-pressed="'+(slug===city)+'"><span class="europe-city-code">'+places[slug].code+'</span><span>'+places[slug].name+'</span></button>';}).join(''); }
  function currency(slug) { return slug === 'london' ? 'GBP' : 'EUR'; }
  function values(slug) {
    var prefix = slug === 'rome' ? 'next' : 'europe';
    return {moveIn:el(prefix+'MoveIn').value,moveOut:el(prefix+'MoveOut').value,budget:el(prefix+'Budget').value,people:el(prefix+'People').value,currency:currency(slug),need:need};
  }
  function fill(slug,brief) {
    var prefix = slug === 'rome' ? 'next' : 'europe';
    ['MoveIn','MoveOut','Budget','People'].forEach(function(key){
      var lower=key.charAt(0).toLowerCase()+key.slice(1),input=el(prefix+key),value=brief[lower];
      input.value=value == null ? '' : String(value);
      if(slug==='rome') input.dispatchEvent(new Event('input',{bubbles:true}));
    });
  }
  function editionURL(path){var u=new URL(path,location.origin),q=new URLSearchParams(location.search);if(['club','perspective'].includes(q.get('edition')))u.searchParams.set('edition',q.get('edition'));if(q.get('edition')==='club'&&q.get('experience')==='panorama'){u.searchParams.set('experience','panorama');if(['airframe','signal','orbit','dispatch','gate','connection','vector'].includes(q.get('vision'))){u.searchParams.set('vision',q.get('vision'));u.searchParams.delete('variant');if(q.get('vision')==='dispatch'&&['open','atlas','concourse','instrument'].includes(q.get('composition')))u.searchParams.set('composition',q.get('composition'));else u.searchParams.delete('composition');}else{u.searchParams.delete('vision');if(q.get('variant')==='terminal')u.searchParams.set('variant','terminal');else u.searchParams.delete('variant');}}if(q.get('duo')==='1')u.searchParams.set('duo','1');return u.pathname+u.search+u.hash;}
  function canonicalHome(slug) { return editionURL('/flight-next?direction=club&city='+slug); }
  function cleanQuery(params) {
    Array.from(params.keys()).forEach(function(key){
      if(/^(privateplace|private_place|lat|lng|lon|latitude|longitude|coordinates|address|name|email|phone|contact|token)$/i.test(key))params.delete(key);
    });
  }
  function writeURL(push) {
    if(view!=='home') return;
    var url=new URL(location.href),brief=values(city);
    cleanQuery(url.searchParams);
    url.searchParams.set('city',city);
    if(city==='rome') url.searchParams.delete('need'); else url.searchParams.set('need',need);
    if(city!=='rome') {
      ['place','home','homes','type','layout','stay'].forEach(function(key){url.searchParams.delete(key);});
      ['moveIn','moveOut','budget','people'].forEach(function(key){if(brief[key])url.searchParams.set(key,brief[key]);else url.searchParams.delete(key);});
      if(brief.budget)url.searchParams.set('currency',currency(city));else url.searchParams.delete('currency');
    } else url.searchParams.delete('currency');
    history[push?'pushState':'replaceState'](history.state,'',url.pathname+url.search+url.hash);
    updateHomeLinks();
  }
  function deskURL() {
    var path=J&&J.deskURL?J.deskURL(city,values(city)):'/'+city,data=loaded[city];
    // Dispatch carries the reviewed offer to the city's original ticket. The
    // native #fare route reveals its scope and action; it never opens the till.
    if(dispatch&&data&&data.slug===city&&data.live===true&&data.mode==='search'&&validConfig(data)) {
      var plan=data.pricing.plans.find(function(p){return p.id===needs[need].plan;});
      if(plan)return path+'#fare-'+plan.id;
    }
    return path;
  }
  function updateHomeLinks() {
    var brief=Object.assign({},J?J.read(location.search):{},values(city));
    var path=J?J.withIntent(canonicalHome(city),brief):canonicalHome(city);
    if(window.BoomFlightEurope)path=window.BoomFlightEurope.decorateURL(path,{view:'home'});
    document.querySelectorAll('.next-brand[data-view="home"]').forEach(function(a){a.href=path;});
  }
  function updateLinks() {
    if(city==='rome') return;
    document.querySelectorAll('[data-europe-desk-link]').forEach(function(a){a.href=deskURL();});
    document.querySelector('.next-signoff .button').href=deskURL();
    updateBrief();
  }
  function updateBrief() {
    var summary=el('europeBriefSummary');if(!summary||city==='rome')return;
    var brief=values(city),household={solo:'Just me',couple:'A couple',family:'A family',flatmates:'Flatmates'};
    function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';var d=new Date(value+'T12:00:00');return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(d);}
    var start=date(brief.moveIn),end=date(brief.moveOut),dates=start?(start+' → '+(end||'Departure date needed')):(end?'Arrival date needed → '+end:'Dates open');
    var rent=brief.budget?new Intl.NumberFormat('en-GB',{style:'currency',currency:currency(city),maximumFractionDigits:0}).format(Number(brief.budget)):'Budget open';
    summary.innerHTML='<div><dt>Your dates</dt><dd>'+esc(dates)+'</dd></div><div><dt>Monthly rent</dt><dd>'+esc(brief.budget?'Up to '+rent:rent)+'</dd></div><div><dt>Who’s moving</dt><dd>'+esc(household[brief.people]||'Household open')+'</dd></div>';
    if(dispatch) {
      var badDate=el('europeMoveIn').validity.badInput||el('europeMoveOut').validity.badInput;
      var empty=[!(brief.moveIn||brief.moveOut||badDate),!brief.budget,!brief.people];
      Array.from(summary.children).forEach(function(row,i){row.hidden=empty[i];});
      summary.hidden=empty.every(Boolean);
      if(badDate&&!start&&!end)summary.firstElementChild.querySelector('dd').textContent='Check your dates';
    }
  }
  function fitBoard() {
    var host=el('nextDestinationBoard'),centre=document.querySelector('.hero-centre');
    if(dispatch) {
      var heading=host.closest('h1'),letters=(host.getAttribute('aria-label')||places[city].name).length;
      if(heading&&heading.clientWidth>0) {
        // A wide departure heading may place the board in only one column.
        // Fit the original flaps to their real bay, not the whole heading.
        var bay=host.parentElement,available=Math.min(heading.clientWidth,bay.clientWidth||heading.clientWidth)-8-3*(letters-1);
        host.style.setProperty('--europe-board-size',Math.max(0,available/(.91*letters-.07))+'px');
      }
      return;
    }
    var width=Math.max(210,centre.clientWidth-24);
    var size=Math.min(innerWidth<650?84:132,width/(places[city].name.length*.91));
    host.style.setProperty('--europe-board-size',Math.max(26,size)+'px');
  }
  function validConfig(data) {
    return data && data.pricing && Array.isArray(data.pricing.plans) && data.hero && data.hero.faresHead &&
      typeof data.hero.faresHead.b==='string' && data.pricing.plans.length>0 && data.pricing.plans.every(function(plan){
        return plan && typeof plan.id==='string' && typeof plan.label==='string' && typeof plan.offerDescription==='string' &&
          typeof plan.condition==='string' && Number.isFinite(plan.price) && plan.price>=0 &&
          Array.isArray(plan.includes) && plan.includes.length>0 && plan.includes.every(function(line){return typeof line==='string';});
      });
  }
  function paintService(data,shared) {
    var pass=el('europeServicePass'),currentClub=query.get('edition')==='club';
    document.querySelectorAll('[data-europe-need]').forEach(function(button){
      var old=button.querySelector('.europe-need-price');if(old)old.remove();
      if(!currentClub||!validConfig(data)||data.live!==true||data.mode!=='search')return;
      var choice=data.pricing.plans.find(function(p){return p.id===needs[button.dataset.europeNeed].plan;});if(!choice)return;
      var priceTag=document.createElement('span');priceTag.className='europe-need-price';priceTag.textContent=new Intl.NumberFormat('en-GB',{style:'currency',currency:currency(city),maximumFractionDigits:0}).format(choice.price)+' · '+choice.condition;button.querySelector('div').appendChild(priceTag);
    });
    if(!validConfig(data) || data.live!==true || data.mode!=='search') {
      pass.innerHTML='<div class="europe-service-copy"><p class="eyebrow">'+esc(places[city].name)+' / SERVICE DETAILS</p><h3>Speak with the '+esc(places[city].name)+' desk.</h3><p>Check the current service, price and availability on the city page.</p></div><a class="europe-service-action text-button" data-europe-desk-link href="'+esc(deskURL())+'">Open the desk ↗</a>';
      if(currentClub){el('europeDeskContinue').textContent='Open '+places[city].name+' desk ↗';if(el('europeSelectedService'))el('europeSelectedService').textContent=dispatch?'Your next step':'Your move';}
      if(dispatch){var fallbackCopy=document.querySelector('.edition-brief-head>p:last-child');if(fallbackCopy)fallbackCopy.textContent='Open the city desk to check its current service and conditions.';}
      return;
    }
    var plan=data.pricing.plans.find(function(p){return p.id===needs[need].plan;});
    if(!plan) { paintService(null);return; }
    var price=new Intl.NumberFormat('en-GB',{style:'currency',currency:currency(city),maximumFractionDigits:0}).format(plan.price);
    var nextStep=dispatch?'Review the service, then choose paid support or request a free call.':'Discuss your plans on a free call. Choose a paid service when its scope is clear.';
    pass.innerHTML='<div class="europe-service-copy"><p class="eyebrow">'+esc(places[city].code)+' / '+esc(plan.label)+'</p><h3>'+esc(needs[need].label)+'.</h3><p>'+esc(plan.offerDescription)+'</p></div><div class="europe-service-price"><strong>'+esc(price)+'</strong><small>'+esc(plan.condition)+'</small><p>'+esc(data.hero.faresHead.b)+'</p></div><dl class="europe-service-facts"><div class="europe-service-includes"><dt>What you receive</dt><dd><ul>'+plan.includes.map(function(item){return '<li>'+esc(item)+'</li>';}).join('')+'</ul></dd></div><div><dt>Who answers</dt><dd>'+(currentClub?'<figure class="club-desk-person"><img src="/img/founder-terrazza.jpg" alt="Valentino Egidi, founder of BOOM, photographed in Rome" width="1100" height="1648" loading="lazy" decoding="async"><figcaption><strong>Valentino Egidi</strong><p>Founder of BOOM<br><span>Based in Rome</span></p><a href="/about">Meet the agency ↗</a></figcaption></figure>':'Valentino Egidi · BOOM, based in Rome')+'</dd></div><div><dt>Your next step</dt><dd>Discuss your plans on a free call. Choose a paid service when its scope is clear.</dd></div></dl><div class="europe-service-bottom">'+(need==='search'&&shared&&shared.refund?'<p>'+esc(shared.refund.rule)+'</p>':'')+'<a class="europe-service-action text-button" data-europe-desk-link href="'+esc(deskURL())+'">See the full '+esc(places[city].name)+' service ↗</a></div>';
    if(dispatch) {
      pass.querySelector('.europe-service-copy h3').textContent=plan.label;
      var nextLine=pass.querySelector('.europe-service-facts>div:last-child dd'),briefCopy=document.querySelector('.edition-brief-head>p:last-child');
      nextLine.textContent=nextStep;
      // The Club adapter can create this header after the first service paint;
      // its initial arrangement completes the same move if the header is absent.
      if(briefCopy){briefCopy.textContent=nextStep;nextLine.parentElement.remove();}
      var inclusions=pass.querySelector('.europe-service-includes'),disclosure=document.createElement('details'),label=document.createElement('summary');
      disclosure.className='dispatch-service-inclusions';label.textContent='What’s included';
      disclosure.append(label,inclusions.querySelector('ul'));
      pass.querySelector('.europe-service-facts').before(disclosure);inclusions.remove();
    }
    if(currentClub){el('europeDeskContinue').textContent=(dispatch?'Review ':'Continue with ')+plan.label+' ↗';if(el('europeSelectedService'))el('europeSelectedService').textContent=dispatch?'Your next step':plan.label;}
    if(dispatch)updateLinks();
  }
  function loadService() {
    var n=++loadNumber,slug=city;
    if(controller)controller.abort();
    if(slug==='rome')return;
    if(loaded[slug]) { paintService(loaded[slug],loaded.shared);return; }
    paintService(null);
    controller=new AbortController();
    var activeController=controller;
    var timer=setTimeout(function(){activeController.abort();},8000);
    function get(path) { return fetch(path,{signal:activeController.signal}).then(function(r){if(!r.ok)throw Error('unavailable');return r.json();}); }
    get('/assets/boom-desks-public.json').then(function(result){
      if(n!==loadNumber)return;
      var selected=result&&result.cities&&result.cities[slug];
      if(!selected || selected.slug!==slug || !validConfig(selected) || !result.refund || typeof result.refund.rule!=='string')throw Error('city details unavailable');
      Object.keys(places).forEach(function(key){
        var config=result.cities[key];
        if(config&&config.slug===key&&validConfig(config)&&config.live===true&&config.mode==='search')loaded[key]=config;
      });
      loaded.shared={refund:{rule:result.refund.rule}};
      paintService(selected,loaded.shared);
    }).catch(function(){if(n===loadNumber)paintService(null);}).finally(function(){clearTimeout(timer);});
  }
  function renderCity(animate) {
    var p=places[city],foreign=city!=='rome';
    document.body.dataset.europeCity=city;
    document.querySelectorAll('button[data-europe-city]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.europeCity===city));});
    document.querySelectorAll('[data-europe-open]').forEach(function(b){b.textContent=p.name;b.setAttribute('aria-label','Change city, currently '+p.name);});
    el('nextSearch').hidden=foreign;el('europeDeskPlanner').hidden=!foreign;el('europeDeskStory').hidden=!foreign;
    document.querySelector('.hero-centre .eyebrow').textContent='BOOM / MODERN REAL ESTATE AGENCY';
    document.querySelector('.hero-pretitle').textContent='Make yourself at home in';
    document.querySelector('.hero-promise').textContent=p.copy || 'Rental search, applications and viewings. An agent working on your side.';
    el('europeCitySignature').innerHTML=icon(city)+'<span>'+esc(p.landmark)+'<small>'+esc(p.name)+' · '+(foreign?'Tenant-side rental support':'Our home city')+'</small></span>';
    el('europePlannerCity').textContent='YOUR '+p.name.toUpperCase()+' DESK';
    el('europePlannerCode').textContent=p.code;
    el('europeDeskContinue').textContent='Continue to '+p.name+' ↗';
    el('europeStoryCity').textContent='Your '+p.name+' move, with a clear plan.';
    el('europeBudgetLabel').textContent='Monthly rent ('+(foreign&&city==='london'?'£':'€')+')';
    var moneySymbol=city==='london'?'£':'€';
    Array.from(el('europeBudget').options).forEach(function(option){if(option.value)option.textContent='Up to '+moneySymbol+Number(option.value).toLocaleString('en-GB');});
    var finalCTA=document.querySelector('.next-signoff .button');
    finalCTA.href=foreign?deskURL():'https://wa.me/393313251961';
    finalCTA.textContent=foreign?'Meet the '+p.name+' desk ↗':'Talk to a real person ↗';
    document.querySelector('.next-signoff h2').innerHTML='Based in Rome.<br><em>On your side.</em>';
    var footerTag=document.querySelector('.next-footer>span');if(footerTag)footerTag.textContent='Homes. People. Rome.';
    el('europeContextNote').textContent=foreign?'Every BOOM desk answers from Rome. Service details belong to the city you choose.':'Rome: real homes, Skyline and an agency to guide your move.';
    document.querySelector('.hero-bottom>a').href='#'+(foreign?'europeDeskStory':'nextSearch');
    if(window.BoomFlightNextMotion)window.BoomFlightNextMotion.setDestination(p.name);
    fitBoard();
    if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      el('europeCitySignature').classList.remove('europe-city-enter');
      requestAnimationFrame(function(){el('europeCitySignature').classList.add('europe-city-enter');});
    }
    if(view==='home')document.title='BOOM — Your home in '+p.name;
    updateLinks();loadService();
  }
  function chooseCity(slug,push) {
    if(!places[slug])return;
    if(view!=='home'){
      var current=new URLSearchParams(location.search),target=new URL(canonicalHome(slug),location.origin);
      ['moveIn','moveOut','people'].forEach(function(key){if(current.get(key))target.searchParams.set(key,current.get(key));});
      if(slug!=='london'&&current.get('budget'))target.searchParams.set('budget',current.get('budget'));
      if(slug==='rome'&&J)location.href=J.withIntent(canonicalHome(slug),J.read(location.search));
      else location.href=target.pathname+target.search;
      return;
    }
    var brief=values(city),old=city;
    city=slug;
    if(currency(old)!==currency(city)) {brief.budget='';el('europeCurrencyNote').hidden=false;el('europeCurrencyNote').textContent='Choose your rent budget in '+currency(city)+'. We haven’t converted the previous amount.';}
    else el('europeCurrencyNote').hidden=true;
    fill(city,brief);renderCity(true);if(push!==null)writeURL(push);el('europeHomeStatus').textContent=places[city].name+' selected. '+(city==='rome'?'Explore homes in Rome.':'Choose the support you need.');
  }
  function chooseNeed(value,push) {
    if(!needs[value])return;
    need=value;
    document.querySelectorAll('[data-europe-need]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.europeNeed===need));});
    if(loaded[city])paintService(loaded[city],loaded.shared);
    updateLinks();writeURL(push);
  }
  function formError() {
    var brief=values(city);
    if(J&&J.deskError){var issue=J.deskError(brief);return issue?issue.message:'';}
    if(brief.moveOut&&!brief.moveIn)return 'Add a move-in date, or leave both dates open.';
    if(brief.moveIn&&brief.moveOut&&brief.moveOut<=brief.moveIn)return 'Your move-out date must be after your move-in date.';
    return '';
  }
  var hero=el('nextHero'),ticket=el('directionClubTicket'),search=el('nextSearch');
  if(!hero||!ticket)return;
  document.body.classList.add('europe-ready');
  document.querySelectorAll('.next-brand').forEach(function(a){a.innerHTML='<img class="europe-brand-lockup" src="/assets/boom-brand-lockup.svg" width="600" height="160" alt="BOOM">';});
  document.querySelector('.next-nav nav').innerHTML='<a href="/flight-next?direction=club&view=apartments" data-view="apartments">Rome homes</a><a href="/desks">BOOM Desks</a><button type="button" data-europe-open aria-haspopup="dialog">'+places[city].name+'</button>';
  var switcher=document.createElement('div');switcher.className='europe-city-switch';
  switcher.innerHTML='<span class="europe-switch-label">YOUR NEXT CITY</span><div class="europe-cities" role="group" aria-label="Choose your city">'+buttons()+'</div>';
  hero.insertBefore(switcher,ticket);
  var signature=document.createElement('div');signature.id='europeCitySignature';signature.className='europe-city-signature';document.querySelector('.hero-centre').appendChild(signature);
  var planner=document.createElement('div');planner.className='europe-planner';ticket.appendChild(planner);planner.appendChild(search);
  var desk=document.createElement('section');desk.id='europeDeskPlanner';desk.hidden=true;desk.setAttribute('aria-labelledby','europeDeskTitle');
  desk.innerHTML='<div class="europe-planner-top"><span id="europePlannerCity"></span><span id="europePlannerCode"></span></div><h2 id="europeDeskTitle">What do you need?</h2><div class="europe-needs" role="group" aria-label="Choose the support you need">'+Object.keys(needs).map(function(key,i){return '<button type="button" data-europe-need="'+key+'" aria-pressed="'+(key===need)+'"><span>0'+(i+1)+'</span><div><strong>'+needs[key].label+'</strong><small>'+needs[key].hint+'</small></div><span aria-hidden="true">↗</span></button>';}).join('')+'</div><form id="europeDeskForm"><details id="europeOptionalBrief"><summary>Add dates &amp; budget <span>optional</span></summary><div class="europe-fields"><label>Move in<input id="europeMoveIn" type="date" aria-label="Desk move-in date"></label><label>Move out<input id="europeMoveOut" type="date" aria-label="Desk move-out date"></label><label><span id="europeBudgetLabel">Monthly rent (€)</span><select id="europeBudget" aria-label="Desk monthly rent budget"><option value="">Choose later</option><option value="1000">Up to €1,000</option><option value="1500">Up to €1,500</option><option value="2000">Up to €2,000</option><option value="3000">Up to €3,000</option><option value="5000">Up to €5,000</option></select></label><label>Who’s moving?<select id="europePeople" aria-label="Desk household"><option value="">Choose later</option><option value="solo">Just me</option><option value="couple">A couple</option><option value="family">A family</option><option value="flatmates">Flatmates</option></select></label></div></details><p id="europeCurrencyNote" class="europe-form-note" hidden></p><p id="europeDeskError" class="form-error" role="alert" hidden></p><button id="europeDeskContinue" class="button gold" type="submit"></button><p class="europe-next-step">See the service and speak with the desk. No payment at this step.</p></form>';
  planner.appendChild(desk);
  if(dispatch)desk.querySelector('.europe-next-step').textContent='Your selected service opens next. No request or payment is sent here.';
  var trust=document.createElement('section');trust.className='europe-trustbar';trust.setAttribute('aria-label','Who is behind BOOM');
  trust.innerHTML='<div class="europe-trust-person"><span>YOUR CONTACT</span><strong>Valentino Egidi</strong><span>Egidi Immobiliare S.r.l. · Rome</span></div><a href="/about">Meet BOOM ↗</a><p id="europeContextNote" class="sr-only"></p>';
  hero.insertAdjacentElement('afterend',trust);
  var story=document.createElement('section');story.id='europeDeskStory';story.className='next-section europe-desk-story';story.hidden=true;
  story.innerHTML='<div class="europe-story-lead"><p class="eyebrow">THE SERVICE / IN PLAIN WORDS</p><h2 id="europeStoryCity"></h2><p>Your choice above brings the relevant service into focus. The desk explains the full scope before you decide.</p></div><article id="europeServicePass" class="europe-service-pass" aria-live="polite"></article>';
  trust.insertAdjacentElement('afterend',story);
  var dialog=document.createElement('dialog');dialog.id='europeCityDialog';dialog.setAttribute('aria-labelledby','europeCityDialogTitle');dialog.innerHTML='<div class="next-dialog-top"><span>BOOM / CITIES</span><button type="button" data-europe-close aria-label="Close city chooser">✕</button></div><h2 id="europeCityDialogTitle">Where are you moving?</h2><p>Homes and Skyline in Rome. Tenant-side rental support at our European desks.</p><div class="europe-cities">'+buttons()+'</div><a href="/desks" class="text-button">Explore every BOOM desk ↗</a>';
  document.body.appendChild(dialog);
  var status=document.createElement('p');status.id='europeHomeStatus';status.className='sr-only';status.setAttribute('role','status');document.body.appendChild(status);
  // The existing catalogue rail and single Skyline instance share one scene.
  // A deliberate action moves the camera; browsing photographs never does.
  var skyline=document.querySelector('.skyline-chapter'),homes=document.querySelector('.homes-chapter');
  var explore=document.createElement('div');explore.className='europe-explore-grid';
  skyline.querySelector('.chapter-heading').insertAdjacentElement('afterend',explore);
  explore.append(homes,skyline.querySelector('.next-city-scene'));
  homes.querySelector('.eyebrow').textContent='FROM THE ROME CATALOGUE';
  homes.querySelector('.chapter-heading>.text-button').textContent='All homes ↗';
  var rail=el('nextHomeRail'),railControls=document.createElement('div');railControls.className='europe-home-controls';
  railControls.innerHTML='<span id="europeHomePosition" role="status" aria-live="polite"></span><button type="button" data-europe-home-step="-1" aria-label="Previous home" aria-controls="nextHomeRail" disabled>←</button><button type="button" data-europe-home-step="1" aria-label="Next home" aria-controls="nextHomeRail" disabled>→</button><button type="button" data-europe-locate disabled>Show on Skyline ↗</button>';
  rail.insertAdjacentElement('afterend',railControls);
  function homeCards(){return Array.from(rail.querySelectorAll('[data-home-id]'));}
  function currentHomeIndex(){
    var cards=homeCards(),left=rail.getBoundingClientRect().left;
    var index=0,distance=Infinity;
    cards.forEach(function(card,i){var delta=Math.abs(card.getBoundingClientRect().left-left);if(delta<distance){index=i;distance=delta;}});
    return index;
  }
  function syncRail(){
    var cards=homeCards(),index=currentHomeIndex(),card=cards[index];
    el('europeHomePosition').textContent=card?String(index+1).padStart(2,'0')+' / '+String(cards.length).padStart(2,'0'):'';
    railControls.querySelector('[data-europe-home-step="-1"]').disabled=!card||index===0;
    railControls.querySelector('[data-europe-home-step="1"]').disabled=!card||index===cards.length-1;
    var locate=railControls.querySelector('[data-europe-locate]');locate.disabled=!card;
    locate.setAttribute('aria-label',card?'Show '+card.querySelector('h3').textContent+' on Skyline':'Show on Skyline');
  }
  function showRailCard(card){
    if(!card)return;
    rail.scrollTo({left:rail.scrollLeft+card.getBoundingClientRect().left-rail.getBoundingClientRect().left,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  railControls.addEventListener('click',function(e){
    var step=e.target.closest('[data-europe-home-step]'),cards=homeCards(),index=currentHomeIndex();
    if(step){showRailCard(cards[index+Number(step.dataset.europeHomeStep)]);return;}
    if(e.target.closest('[data-europe-locate]')&&cards[index]&&window.BoomNextMap){
      window.BoomNextMap.select(cards[index].dataset.homeId);
      if(innerWidth<761||['connection','dispatch','orbit','vector'].includes(document.body.dataset.homeVision))el('nextHomeMap').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }
  });
  rail.addEventListener('scroll',syncRail,{passive:true});
  new MutationObserver(syncRail).observe(rail,{childList:true});
  window.addEventListener('resize',syncRail,{passive:true});
  window.addEventListener('boom-next:map-select',function(e){
    if(view!=='home')return;
    var card=homeCards().find(function(c){return c.dataset.homeId===e.detail.id;});
    if(card)showRailCard(card);
  });
  var proof=document.createElement('a');proof.className='europe-service-proof';proof.href='/client-portal?code=DEMO';
  proof.innerHTML='<span><small>PROPERTY FINDING / A LOOK INSIDE</small><strong>Explore the client workspace.</strong><span>The existing app, with sample homes. No signup.</span></span><span aria-hidden="true">↗</span>';
  document.querySelector('.next-tickets').insertAdjacentElement('afterend',proof);
  var clientAccess=document.createElement('a');clientAccess.href='/login';clientAccess.textContent='Client area ↗';
  document.querySelector('.next-footer>div').prepend(clientAccess);
  var opener;
  document.addEventListener('click',function(e){
    var cityButton=e.target.closest('button[data-europe-city]');
    if(cityButton){chooseCity(cityButton.dataset.europeCity,true);if(dialog.open)dialog.close();return;}
    var needButton=e.target.closest('[data-europe-need]');if(needButton){chooseNeed(needButton.dataset.europeNeed,true);return;}
    var open=e.target.closest('[data-europe-open]');if(open){opener=open;dialog.showModal();return;}
    if(e.target.closest('[data-europe-close]'))dialog.close();
  });
  dialog.addEventListener('close',function(){if(opener&&opener.isConnected)opener.focus({preventScroll:true});});
  el('europeDeskForm').addEventListener('submit',function(e){e.preventDefault();var error=formError();el('europeDeskError').textContent=error;el('europeDeskError').hidden=!error;if(error){el('europeOptionalBrief').open=true;return;}location.href=deskURL();});
  el('europeDeskForm').addEventListener('input',function(){el('europeDeskError').hidden=true;updateLinks();writeURL(false);});
  if(dispatch) {
    el('europeBudget').addEventListener('change',function(){
      if(this.value&&this.validity.valid)el('europeCurrencyNote').hidden=true;
    });
    ['keyup','focusout'].forEach(function(name){
      el('europeDeskForm').addEventListener(name,function(event){
        if(event.target.matches('#europeMoveIn,#europeMoveOut'))updateBrief();
      });
    });
  }
  window.addEventListener('resize',fitBoard,{passive:true});
  // The original board can present the city directory without selecting a
  // customer destination. Its displayed word, not the brief, owns its width.
  if(dispatch)new MutationObserver(fitBoard).observe(el('nextDestinationBoard'),{attributes:true,attributeFilter:['aria-label']});
  window.addEventListener('boom:flight-view',function(e){
    view=e.detail.view;
    var params=new URLSearchParams(location.search),selected=places[params.get('city')]?params.get('city'):'rome';
    if(view!=='home')selected='rome';
    if(city!==selected){city=selected;renderCity(false);}
    if(view==='home')document.title='BOOM — Your home in '+places[city].name;
  });
  window.addEventListener('popstate',function(){
    var params=new URLSearchParams(location.search);view=params.get('view')||'home';city=view==='home'&&places[params.get('city')]?params.get('city'):'rome';need=needs[params.get('need')]?params.get('need'):'search';
    if(city!=='rome')fill(city,{moveIn:params.get('moveIn'),moveOut:params.get('moveOut'),budget:params.get('currency')===currency(city)||city!=='london'?params.get('budget'):'',people:params.get('people')});
    renderCity(false);chooseNeed(need,false);
  });
  window.BoomFlightEurope={refreshBrief:function(){updateBrief();if(loaded[city])paintService(loaded[city],loaded.shared);},selectCity:function(slug,options){if(!places[slug]||view!=='home')return false;chooseCity(slug,options&&options.history===false?null:true);return true;},decorateURL:function(path,context){
    var u=new URL(path,location.origin);var target=context.view==='home'?city:'rome';
    cleanQuery(u.searchParams);
    if(target!=='rome'){
      ['place','home','homes','type','layout','stay','moveIn','moveOut','budget','people','currency'].forEach(function(key){u.searchParams.delete(key);});
      var brief=values(target);['moveIn','moveOut','budget','people'].forEach(function(key){if(brief[key])u.searchParams.set(key,brief[key]);});
      if(brief.budget)u.searchParams.set('currency',currency(target));u.searchParams.set('city',target);u.searchParams.set('need',need);
    }else{u.searchParams.delete('city');u.searchParams.delete('need');u.searchParams.delete('currency');}
    return editionURL(u.pathname+u.search+u.hash);
  }};
  if(city!=='rome')fill(city,{moveIn:query.get('moveIn'),moveOut:query.get('moveOut'),budget:city!=='london'||query.get('currency')==='GBP'?query.get('budget'):'',people:query.get('people')});
  renderCity(false);
  el('nextSkyTitle').innerHTML='Find a home around<br><em>your daily life.</em>';
  el('nextHomesTitle').textContent='Inside the homes.';
  el('nextServicesTitle').textContent='How can BOOM help?';
  document.querySelector('.ticket-gold h3').textContent='We search for you.';
  document.querySelector('.ticket-dark h3').textContent='Support for a home you found.';
  el('nextJourneyTitle').innerHTML='From application<br><em>to move-in.</em>';
  el('nextStayTitle').innerHTML='Your dates.<br>Your household.';
  document.querySelector('.hero-bottom>a').textContent='Explore your options ↓';
  document.querySelector('.hero-bottom>a').href='#'+(city==='rome'?'nextSearch':'europeDeskStory');
})();
