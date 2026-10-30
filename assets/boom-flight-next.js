(function () {
  'use strict';
  var D = window.BoomNextData, S = window.BOOM_STAY, F = window.BOOM_FLIGHT, M = window.BoomNextMap;
  if (!D || !S || !F || !M) return;
  var catalogue = [], loaded = false, loading = false, selected = '', toastTimer, lastOpener;
  var state = { view: 'home', home: '', budget: '', people: '', type: '', layout: 'skyline', saved: false, stay: S.normalize() };
  var heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function byId(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function money(n) { return n == null ? 'Price on request' : '€' + Number(n).toLocaleString('en-GB'); }
  function saved() { try { return F.saved(localStorage.getItem('boomSalvate')); } catch (_) { return []; } }
  function getHome(id) { return catalogue.find(function (c) { return c.id === id; }); }
  function readURL() {
    var q = new URLSearchParams(location.search);
    state.view = ['apartments','detail'].includes(q.get('view')) ? q.get('view') : 'home';
    state.home = /^[A-Za-z0-9_-]{1,100}$/.test(q.get('home') || '') ? q.get('home') : '';
    state.budget = ['1000','1500','2000','3000','5000'].includes(q.get('budget')) ? q.get('budget') : '';
    state.people = ['solo','couple','family','flatmates'].includes(q.get('people')) ? q.get('people') : '';
    state.type = (q.get('type') || '').slice(0,50); state.saved = q.get('saved') === '1';
    state.layout = ['gallery','skyline'].includes(q.get('layout')) ? q.get('layout') : (window.BoomFlightDirections ? window.BoomFlightDirections.defaultLayout : 'skyline');
    state.stay = S.intent(location.search);
  }
  function url(view, home) {
    var q = new URLSearchParams();
    if (window.BoomFlightDirections) q.set('direction',window.BoomFlightDirections.name);
    if (view !== 'home') q.set('view',view);
    if (view === 'detail' && home) q.set('home',home);
    if (state.budget) q.set('budget',state.budget);
    if (state.people) q.set('people',state.people);
    if (state.type) q.set('type',state.type);
    if (state.saved) q.set('saved','1');
    if (state.layout === 'gallery' || window.BoomFlightDirections) q.set('layout',state.layout);
    return S.withIntent('/flight-next' + (q.size ? '?' + q : ''),state.stay);
  }
  function commit(replace) { history[replace ? 'replaceState' : 'pushState']({},'',url(state.view,state.home)); }
  function announce(text) { var n = byId('nextAnnouncement'); n.textContent = text; n.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { n.hidden = true; },3300); }
  function syncSaved() {
    var list = saved(); byId('nextSaveCount').textContent = String(list.length);
    document.querySelectorAll('[data-save-home]').forEach(function (b) {
      var yes = list.includes(F.listing(b.dataset.saveHome));
      b.setAttribute('aria-pressed',String(yes)); b.setAttribute('aria-label',yes ? 'Remove saved home' : 'Save this home');
    });
  }
  function toggleSave(id) {
    var path = F.listing(id); if (!path) return;
    var list = saved(), found = list.includes(path); list = found ? list.filter(function(p){return p!==path;}) : list.concat(path);
    try { localStorage.setItem('boomSalvate',JSON.stringify(F.saved(list))); }
    catch (_) { announce('Your browser could not save this home.'); return; }
    syncSaved(); window.dispatchEvent(new CustomEvent('boom:move'));
    announce(found ? 'Removed from your shortlist.' : 'Saved. Your shortlist stays with you across BOOM.');
    if (state.view === 'apartments' && state.saved) renderResults();
  }
  function facts(c) {
    return [c.type || null,c.area == null ? null : c.area + ' m²',c.bedrooms == null ? null : c.bedrooms === 0 ? 'Studio' : c.bedrooms + (c.bedrooms === 1 ? ' bedroom' : ' bedrooms')].filter(Boolean);
  }
  function card(c, isResult) {
    return '<article class="next-card" data-home-id="'+esc(c.id)+'" data-selected="'+(selected===c.id)+'"><div class="next-card-image"><a href="'+esc(url('detail',c.id))+'" data-home="'+esc(c.id)+'" aria-label="Explore '+esc(c.name)+'">'+(c.image?'<img src="'+esc(c.image)+'" alt="'+esc(c.name)+'" loading="lazy" decoding="async">':'<span class="load-message">Photos coming soon</span>')+'</a><span class="card-status" data-lane="'+esc(c.lane)+'">'+esc(c.status)+'</span><button type="button" class="card-save" data-save-home="'+esc(c.id)+'" aria-label="Save this home" aria-pressed="false">'+heart+'</button></div><div class="next-card-info"><p class="card-location">'+esc(c.zone || 'Rome')+'</p><h3><a href="'+esc(url('detail',c.id))+'" data-home="'+esc(c.id)+'">'+esc(c.name)+'</a></h3><p class="card-facts">'+facts(c).map(function(x){return '<span>'+esc(x)+'</span>';}).join('')+'</p><div class="card-price"><strong>'+esc(money(c.price))+'</strong>'+(c.price?'<small>/ month</small>':'')+(isResult?'<button type="button" data-locate="'+esc(c.id)+'" aria-label="Locate '+esc(c.name)+' in Skyline">⌖</button>':'<a href="'+esc(url('detail',c.id))+'" data-home="'+esc(c.id)+'" aria-label="Explore '+esc(c.name)+'">↗</a>')+'</div></div></article>';
  }
  function exploreHomes() {
    var list = catalogue.filter(function(c){return c.lane!=='closed';});
    return list.sort(function(a,b){var rank={now:0,ahead:1,unknown:2};return (rank[a.lane]??3)-(rank[b.lane]??3);});
  }
  function renderHome() {
    if (!loaded) return;
    var preferred=['esFhjFMVfZtkIrhkx0PR','cezFMXTWnHUDgb1H2WWm','5QAKCvswE3HN9nuuG82S'];
    var list=exploreHomes().filter(function(c){return c.image;});
    list.sort(function(a,b){var ai=preferred.indexOf(a.id),bi=preferred.indexOf(b.id);return (ai<0?99:ai)-(bi<0?99:bi);});
    byId('nextHomeRail').innerHTML=list.slice(0,3).map(function(c){return card(c,false);}).join('') || '<p class="load-message">The collection is being updated. <a href="/apartments">See the full catalogue ↗</a></p>';
    syncSaved();
  }
  function filtered() {
    var list = state.saved ? catalogue.filter(function(c){return saved().includes(c.canonicalUrl);}) : exploreHomes();
    return D.cards(list,{budgetMax:state.budget,type:state.type});
  }
  function renderResults() {
    if (!loaded) return;
    var list=filtered();
    byId('nextResultCount').textContent=list.length+' '+(state.saved?'saved homes':'homes to explore');
    byId('nextClearFilters').hidden=!(state.budget||state.type||state.saved);
    byId('nextResults').innerHTML=list.length?list.map(function(c){return card(c,true);}).join(''):'<div class="empty-state"><h2>A little room to adjust.</h2><p>'+(state.saved?'Save a home with its heart to keep it here.':'No homes match these choices right now. Try a broader budget or a different home type.')+'</p><button type="button" data-reset>Explore all homes ↗</button><br><a href="/property-finding">Let BOOM search for you ↗</a></div>';
    M.scope(list.map(function(c){return c.id;})); M.setBudget(Number(state.budget)||0);
    syncSaved();
  }
  function stayText() {
    if (!state.stay.moveIn && !state.stay.moveOut) return 'Dates & household';
    function date(x) { return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(new Date(x+'T12:00:00')); }
    return state.stay.moveIn && state.stay.moveOut ? date(state.stay.moveIn)+' → '+date(state.stay.moveOut) : 'Complete your dates';
  }
  function syncControls() {
    byId('nextMoveIn').value=state.stay.moveIn||''; byId('nextMoveOut').value=state.stay.moveOut||'';
    byId('nextBudget').value=state.budget; byId('nextPeople').value=state.people;
    byId('nextFilterBudget').value=state.budget; byId('nextFilterType').value=state.type;
    byId('nextEditStay').firstChild.textContent=stayText()+' ';
    byId('nextDiscovery').dataset.layout=state.layout;
    document.querySelectorAll('[data-layout]').forEach(function(b){if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.layout===state.layout));});
    document.querySelectorAll('.next-nav [data-view]').forEach(function(a){if(a.dataset.view===state.view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    byId('nextStayHint').textContent=S.summary(state.stay)||'Stays from 3 months. Exploring? You can choose dates later.';
  }
  function renderDetail() {
    var target=byId('nextDetailContent');
    if(!loaded){target.innerHTML='<p class="load-message">Opening your home…</p>';return;}
    var c=getHome(state.home);
    if(!c){target.innerHTML='<div class="detail-failure"><p class="eyebrow">HOME NOT FOUND</p><h1>This home is no longer in the public collection.</h1><a class="text-button" href="'+esc(url('apartments'))+'" data-view="apartments">Explore current homes <span>↗</span></a></div>';return;}
    var actual=S.withIntent(c.canonicalUrl+(state.people?'?people='+encodeURIComponent(state.people):''),state.stay);
    var photoHtml=c.images.map(function(src,i){return '<button type="button" data-photo="'+i+'" aria-label="Open photo '+(i+1)+' of '+c.images.length+'"><img src="'+esc(src)+'" alt="'+esc(c.name)+' — photo '+(i+1)+'" '+(i?'loading="lazy"':'fetchpriority="high"')+' decoding="async"></button>';}).join('');
    target.innerHTML='<div class="detail-heading"><div class="detail-breadcrumb"><a href="'+esc(url('apartments'))+'" data-view="apartments">← Your possibilities</a><span>ROME / '+esc(c.zone.toUpperCase())+'</span></div><div class="detail-title-row"><div><h1 id="nextDetailTitle" tabindex="-1">'+esc(c.name)+'</h1><p class="card-facts">'+facts(c).map(function(x){return '<span>'+esc(x)+'</span>';}).join('')+'</p></div><div class="detail-actions"><button type="button" data-save-home="'+esc(c.id)+'" aria-label="Save this home" aria-pressed="false">'+heart+'</button><button type="button" data-share-home aria-label="Copy a link to this home">↗</button></div></div></div><div class="next-photo-rail" id="nextPhotoRail" aria-label="'+esc(c.name)+' photo gallery" tabindex="0">'+(photoHtml||'<p class="load-message">Photos are not available for this home yet.</p>')+'</div><div class="photo-controls"><div><button type="button" data-photo-step="-1" aria-label="Previous photo">←</button><span id="nextPhotoCount">'+(c.images.length?'01':'00')+' / '+String(c.images.length).padStart(2,'0')+'</span><button type="button" data-photo-step="1" aria-label="Next photo">→</button></div><button type="button" data-photo="0">View all photos <span>↗</span></button></div><div class="detail-decision"><div class="decision-price"><p class="eyebrow">YOUR MONTHLY RENT</p><strong>'+esc(money(c.price))+'</strong>'+(c.price?'<small>/ month</small>':'')+'</div><div class="decision-status">'+esc(c.status)+'<small>'+(c.billsIncluded?'Bills included as listed.':'See the full cost breakdown before applying.')+'</small></div><div class="decision-cta"><a class="button gold" data-next-apply href="'+esc(actual+(c.lane==='closed'?'':'#applica'))+'">'+(c.lane==='closed'?'View current availability':'Apply for this home')+' <span>↗</span></a><small>'+(c.lane==='closed'?'Current status is checked on the listing.':'Opens your application · no payment now')+'</small></div></div><div class="detail-body"><div><h2>Your next chapter<br><em>starts here.</em></h2><p class="detail-copy">'+esc(c.description||'Explore the photographs and full listing for the details of this home. BOOM can help you with any questions before you apply.')+'</p><div class="detail-features">'+c.features.slice(0,10).map(function(x){return '<span>'+esc(x)+'</span>';}).join('')+'</div><div class="detail-stay"><span><span class="eyebrow">YOUR REQUESTED STAY</span><br>'+esc(S.summary(state.stay)||'Add your dates when you are ready.')+'</span><button type="button" data-edit-stay>Edit ↗</button></div><a class="text-button" href="'+esc(actual)+'">The complete home, costs & conditions <span>↗</span></a></div><aside><div class="detail-support"><p class="eyebrow">THE HOME IS JUST THE BEGINNING</p><h3 style="margin-top:15px">Make it your Rome.</h3><p>Start with your campus or everyday destination. See the trade-offs in rent, space and location.</p><button class="text-button" type="button" data-guide>Find my balance <span>↗</span></button><a class="text-button" href="/virtual-viewing">See it with a real person <span>↗</span></a><a class="text-button" href="/your-money">Understand your costs <span>↗</span></a></div><p class="detail-number">BOOM / '+esc(c.id)+'</p></aside></div>';
    syncSaved();
    var rail=byId('nextPhotoRail');
    rail.addEventListener('scroll',function(){var index=photoIndex();byId('nextPhotoCount').textContent=String(index+1).padStart(2,'0')+' / '+String(c.images.length).padStart(2,'0');},{passive:true});
    rail.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();stepPhoto(e.key==='ArrowRight'?1:-1);}});
    document.title=c.name+' — BOOM Flight Next';
  }
  function photoIndex(){var rail=byId('nextPhotoRail'),first=rail&&rail.querySelector('button');return first?Math.max(0,Math.min(rail.children.length-1,Math.round(rail.scrollLeft/(first.getBoundingClientRect().width+parseFloat(getComputedStyle(rail).gap))))):0;}
  function stepPhoto(step){var rail=byId('nextPhotoRail');if(!rail)return;var next=rail.children[Math.max(0,Math.min(rail.children.length-1,photoIndex()+step))];if(next)rail.scrollTo({left:next.offsetLeft-rail.offsetLeft-parseFloat(getComputedStyle(rail).paddingLeft),behavior:reduce()?'instant':'smooth'});}
  function reduce(){return matchMedia('(prefers-reduced-motion:reduce)').matches;}
  function showPage(focus) {
    document.querySelectorAll('[data-page]').forEach(function(el){el.hidden=el.dataset.page!==state.view;});
    document.body.dataset.view=state.view; syncControls();
    if(state.view==='home'){M.mount(byId('nextHomeMap'));M.scope(exploreHomes().map(function(c){return c.id;}));M.setBudget(0);document.title='BOOM — Your next chapter, Rome.';}
    else if(state.view==='apartments'){renderResults();if(state.layout==='skyline')M.mount(byId('nextApartmentsMap'));else M.hide();document.title='Your possibilities in Rome — BOOM';}
    else{M.hide();renderDetail();}
    if(window.BoomFlightDirections)window.BoomFlightDirections.render({state:state,catalogue:catalogue,url:url});
    if(focus){window.scrollTo({top:0,behavior:'instant'});var heading=state.view==='detail'?byId('nextDetailTitle'):state.view==='apartments'?byId('nextAptsTitle'):byId('nextHeroTitle');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}}
  }
  function navigate(view,home) {
    var update=function(){state.view=view;state.home=home||'';commit();showPage(true);};
    if(document.startViewTransition&&!reduce()){var transition=document.startViewTransition(update);transition.ready.catch(function(){});transition.finished.catch(function(){});}else update();
  }
  function openDialog(dialog,opener){lastOpener=opener||document.activeElement;dialog.showModal();}
  function editStay(opener){byId('nextDialogIn').value=state.stay.moveIn||'';byId('nextDialogOut').value=state.stay.moveOut||'';byId('nextDialogPeople').value=state.people;byId('nextDialogError').hidden=true;openDialog(byId('nextStayDialog'),opener);}
  function guide(opener){
    var mount=byId('nextGuideMount');
    if(!mount.firstChild){
      var frame=document.createElement('iframe');frame.title='Your Rome — find my balance';
      frame.src=S.withIntent('/skyline?guide=1'+(state.budget?'&budget='+state.budget:'')+(opener&&opener.dataset.place?'&place='+encodeURIComponent(opener.dataset.place):''),state.stay);
      frame.addEventListener('load',function(){
        try{
          var doc=frame.contentDocument;if(!doc||frame.contentWindow.location.origin!==location.origin)return;
          var style=doc.createElement('style');style.textContent='#skyGuideClose{display:none!important}';doc.head.appendChild(style);
          doc.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();byId('nextGuideDialog').close();}},true);
          doc.addEventListener('click',function(e){
            var a=e.target.closest('a[href]');if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
            var target=new URL(a.href,location.origin),match=target.pathname.match(/^\/listing\/([A-Za-z0-9_-]+)$/);
            if(target.origin===location.origin&&match&&getHome(match[1])){e.preventDefault();byId('nextGuideDialog').close();navigate('detail',match[1]);}
          });
        }catch(_){/* External service pages keep their own native navigation. */}
      });
      mount.appendChild(frame);
    }
    M.hide();openDialog(byId('nextGuideDialog'),opener);
  }
  function photos(index,opener){var c=getHome(state.home);if(!c||!c.images.length)return;var mount=byId('nextFullPhotos');mount.innerHTML=c.images.map(function(src,i){return '<figure><img src="'+esc(src)+'" alt="'+esc(c.name)+' — photo '+(i+1)+'" loading="lazy"><figcaption>'+String(i+1).padStart(2,'0')+' / '+String(c.images.length).padStart(2,'0')+' · '+esc(c.name)+'</figcaption></figure>';}).join('');openDialog(byId('nextPhotoDialog'),opener);mount.scrollLeft=Math.min(index,c.images.length-1)*mount.clientWidth;}
  function updateFilters(){commit(true);syncControls();renderResults();}
  function resetFilters(){state.budget='';state.type='';state.saved=false;updateFilters();}
  async function load(){
    if(loading)return;loading=true;
    try{catalogue=await D.load();loaded=true;
      var types=Array.from(new Set(catalogue.map(function(c){return c.type;}).filter(Boolean))).sort();
      byId('nextFilterType').innerHTML='<option value="">All home types</option>'+types.map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+'</option>';}).join('');
      renderHome();showPage(false);
    }catch(_){
      var error='<div class="empty-state"><h2>The collection is taking a moment.</h2><p>We could not load the current homes. Your choices are still here.</p><button type="button" data-retry>Try again ↗</button><br><a href="/apartments">Open the existing catalogue ↗</a></div>';
      byId('nextHomeRail').innerHTML=error;byId('nextResults').innerHTML=error;byId('nextResultCount').textContent='Connection interrupted';if(state.view==='detail')byId('nextDetailContent').innerHTML=error;
    }finally{loading=false;}
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('button,a');if(!b)return;
    if(b.hasAttribute('data-view')){if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(b.dataset.view);}
    else if(b.hasAttribute('data-home')){if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate('detail',b.dataset.home);}
    else if(b.hasAttribute('data-save-home')){toggleSave(b.dataset.saveHome);}
    else if(b.hasAttribute('data-guide')){guide(b);}
    else if(b.hasAttribute('data-edit-stay')||b.id==='nextEditStay'){editStay(b);}
    else if(b.hasAttribute('data-close-dialog')){b.closest('dialog').close();}
    else if(b.hasAttribute('data-photo')){photos(Number(b.dataset.photo),b);}
    else if(b.hasAttribute('data-photo-step')){stepPhoto(Number(b.dataset.photoStep));}
    else if(b.hasAttribute('data-layout')){state.layout=b.dataset.layout;commit(true);syncControls();if(state.layout==='skyline')M.mount(byId('nextApartmentsMap'));else M.hide();}
    else if(b.hasAttribute('data-locate')){selected=b.dataset.locate;if(state.layout!=='skyline'){state.layout='skyline';syncControls();commit(true);M.mount(byId('nextApartmentsMap'));}M.select(selected);selectCard(false);if(innerWidth<761)byId('nextApartmentsMap').scrollIntoView({behavior:reduce()?'instant':'smooth',block:'center'});}
    else if(b.hasAttribute('data-saved')){state.saved=true;navigate('apartments');}
    else if(b.hasAttribute('data-reset')||b.id==='nextClearFilters'){resetFilters();}
    else if(b.hasAttribute('data-retry')){load();}
    else if(b.hasAttribute('data-share-home')){var c=getHome(state.home);if(c)navigator.clipboard.writeText(location.origin+c.canonicalUrl).then(function(){announce('Home link copied. Your personal dates stay private.');},function(){announce('Copy the link from your browser to share this home.');});}
    else if(b.hasAttribute('data-services')){e.preventDefault();if(state.view!=='home'){state.view='home';state.home='';commit();showPage(false);}byId('services').scrollIntoView({behavior:reduce()?'instant':'smooth'});}
  });
  function selectCard(scroll){document.querySelectorAll('.next-results [data-home-id]').forEach(function(c){var yes=c.dataset.homeId===selected;c.dataset.selected=String(yes);if(yes&&scroll){var rail=byId('nextResults');if(innerWidth<761){if(rail.scrollWidth>rail.clientWidth+2){rail.scrollTo({left:c.offsetLeft-rail.offsetLeft-20,behavior:reduce()?'instant':'smooth'});}else{c.scrollIntoView({block:'nearest',behavior:reduce()?'instant':'smooth'});}}else{var panel=byId('nextResults').parentElement;panel.scrollTo({top:c.offsetTop-panel.offsetTop-55,behavior:reduce()?'instant':'smooth'});}}});}
  window.addEventListener('boom-next:map-select',function(e){selected=e.detail.id;var c=getHome(selected);if(!c)return;if(state.view==='home'){document.querySelector('.city-caption').innerHTML='<span class="city-selected">'+(c.image?'<img src="'+esc(c.image)+'" alt="">':'')+'<span>'+esc(c.name)+'<small>'+esc(c.zone)+' · '+esc(money(c.price))+(c.price?' / month':'')+'</small></span></span><a href="'+esc(url('detail',c.id))+'" data-home="'+esc(c.id)+'">Explore this home <span aria-hidden="true">↗</span></a>';}else selectCard(true);});
  byId('nextFilterBudget').addEventListener('change',function(e){state.budget=e.target.value;updateFilters();});
  byId('nextFilterType').addEventListener('change',function(e){state.type=e.target.value;updateFilters();});
  byId('nextSearchForm').addEventListener('submit',function(e){e.preventDefault();var requested={moveIn:byId('nextMoveIn').value,moveOut:byId('nextMoveOut').value},error=S.validate(requested);byId('nextSearchError').hidden=!error;if(error){byId('nextSearchError').textContent=error.message;byId(error.field==='moveIn'?'nextMoveIn':'nextMoveOut').focus();return;}state.stay=S.normalize(requested);state.budget=byId('nextBudget').value;state.people=byId('nextPeople').value;state.saved=false;navigate('apartments');});
  byId('nextStayForm').addEventListener('submit',function(e){e.preventDefault();var requested={moveIn:byId('nextDialogIn').value,moveOut:byId('nextDialogOut').value},error=S.validate(requested);byId('nextDialogError').hidden=!error;if(error){byId('nextDialogError').textContent=error.message;byId(error.field==='moveIn'?'nextDialogIn':'nextDialogOut').focus();return;}state.stay=S.normalize(requested);state.people=byId('nextDialogPeople').value;commit(true);syncControls();if(state.view==='detail')renderDetail();byId('nextStayDialog').close();});
  byId('nextClearDates').addEventListener('click',function(){state.stay=S.normalize();commit(true);syncControls();if(state.view==='detail')renderDetail();byId('nextStayDialog').close();});
  byId('nextMotionToggle').addEventListener('click',function(e){var b=e.currentTarget,paused=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(paused));b.innerHTML=paused?'Resume motion <span aria-hidden="true">▷</span>':'Pause motion <span aria-hidden="true">Ⅱ</span>';if(window.BoomFlightNextMotion)window.BoomFlightNextMotion.setPaused(paused);});
  document.querySelectorAll('dialog').forEach(function(dialog){dialog.addEventListener('close',function(){if(dialog.id==='nextGuideDialog'){byId('nextGuideMount').replaceChildren();if(state.view==='home')M.mount(byId('nextHomeMap'));else if(state.view==='apartments'&&state.layout==='skyline')M.mount(byId('nextApartmentsMap'));}if(lastOpener&&lastOpener.isConnected)lastOpener.focus({preventScroll:true});});});
  window.addEventListener('popstate',function(){readURL();showPage(true);});
  window.addEventListener('storage',function(e){if(e.key==='boomSalvate'){syncSaved();if(state.view==='apartments'&&state.saved)renderResults();}});
  window.addEventListener('focus',syncSaved);
  readURL();showPage(false);syncSaved();load();
})();
