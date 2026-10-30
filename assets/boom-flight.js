(function () {
  'use strict';
  /* Snapshot hit testing cannot see the live fixed bar. Once navigation
     settles, ask the existing scroll contract to measure it again. */
  function navigationTransition(event) {
    var transition = event.viewTransition;
    if (!transition) return;
    // A retry can land on a 503/non-opted-in page. That is an expected
    // cancellation, not a page error or a reason to intercept navigation.
    transition.ready.catch(function () {});
    if (event.type === 'pageswap') {
      // Only these public pages load the Flight opt-in stylesheet. Chromium
      // can reject an inaccessible transition promise in a non-opted-in
      // destination, so stop the animation before leaving for a service page.
      // The navigation itself is still native and is never intercepted.
      var destination;
      try { destination = new URL(event.activation.entry.url); } catch (_) {}
      if (!destination || destination.origin !== location.origin ||
          !/^\/(?:|index(?:\.html)?|apartments(?:\.html)?|apartment-detail(?:\.html)?|skyline(?:\.html)?|your-rome(?:\.html)?|listing\/[A-Za-z0-9_-]+)\/?$/.test(destination.pathname))
        transition.skipTransition();
    }
    transition.finished.then(function () {
      if (event.type !== 'pagereveal') return;
      requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
    }, function () {});
  }
  window.addEventListener('pageswap', navigationTransition);
  window.addEventListener('pagereveal', navigationTransition);
  // The map can be usable before third-party tiles finish loading. Only the
  // owned same-origin Skyline frame may release the host's loading veil.
  window.addEventListener('message', function(event) {
    if(event.origin!==location.origin||!event.data||event.data.t!=='boomSkylineReady')return;
    var frame=document.querySelector('#cieloMappa iframe');
    if(!frame||event.source!==frame.contentWindow)return;
    var veil=document.getElementById('cieloVelo');if(veil)veil.classList.add('via');
  });
  var F = window.BOOM_FLIGHT; if (!F) return;
  if (new URLSearchParams(location.search).get('embed') === '1') return;
  var dialog, opener, known = {}, fetchPromise;
  function read() { try { return F.saved(localStorage.getItem('boomSalvate')); } catch (_) { return []; } }
  function places() {
    try {
      var a = JSON.parse(localStorage.getItem('boom:pois') || '[]');
      return Array.isArray(a) ? a.filter(function(p) { return p && typeof p.name === 'string'; }).slice(0,4) : [];
    } catch (_) { return []; }
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if(cls)n.className=cls; if(text)n.textContent=text; return n; }
  function remember() {
    document.querySelectorAll('.casa-p[data-id],.home-card[data-id]').forEach(function(c) {
      var name = c.querySelector('.nome,.home-name,h3');
      if (name) known[F.listing(c.dataset.id)] = name.textContent.trim();
    });
    var name = document.getElementById('nomeCasa'), heart = document.getElementById('cuoreCasa');
    if (name && heart && F.saved([heart.dataset.u]).length) known[heart.dataset.u] = name.textContent.trim();
  }
  function sync() {
    var paths = read();
    document.querySelectorAll('.flight-move-count').forEach(function(b) { b.textContent = paths.length || ''; });
    document.querySelectorAll('.home-cuore[data-u]').forEach(function(b) {
      var yes = paths.indexOf(b.dataset.u) >= 0;
      b.classList.toggle('si', yes); b.setAttribute('aria-pressed', String(yes));
      b.setAttribute('aria-label', yes ? 'Remove saved home' : 'Save this home');
    });
    if (dialog && dialog.open) render();
  }
  function render() {
    remember();
    var paths = read(), list = dialog.querySelector('.flight-saved'); list.replaceChildren();
    if(!paths.length) list.appendChild(el('li','flight-empty','A home catches your eye? Tap its heart. You’ll find it here, wherever you are on BOOM.'));
    paths.forEach(function(p,i) { var li=el('li'), a=el('a','',known[p] || 'Saved home ' + (i+1)); a.href=p; li.appendChild(a); list.appendChild(li); });
    var a = dialog.querySelector('[data-flight-sky]'); a.href = F.skyline(paths); a.firstChild.textContent=paths.length ? 'See saved homes in Skyline' : 'Explore Rome in Skyline';
    dialog.querySelector('.flight-copy').disabled = !paths.length;
    var po = dialog.querySelector('[data-flight-places]'), pp = places(); po.replaceChildren();
    if (!pp.length) po.appendChild(el('p','flight-empty','Add your campus, office or favourite place in Skyline to see how each home fits your day.'));
    pp.forEach(function(p) { po.appendChild(el('div','flight-secondary',p.name)); });
  }
  function build() {
    dialog = el('dialog','flight-dialog'); dialog.setAttribute('aria-labelledby','flight-move-title');
    dialog.innerHTML = '<div class="flight-dialog-top"><div><span class="flight-kicker">BOOM · Your Rome</span><h2 id="flight-move-title">Your move.</h2></div><button type="button" class="flight-close" aria-label="Close Your move">×</button></div><div class="flight-dialog-body"><p>Your homes. Your everyday places. One place to come back to.</p><h3>Saved homes</h3><ul class="flight-saved"></ul><a class="flight-primary" data-flight-sky href="/skyline"><span>Explore Rome in Skyline</span><span aria-hidden="true">↗</span></a><button class="flight-copy" type="button">Copy my Skyline link ↗</button><p class="flight-status" role="status"></p><input class="flight-link-fallback" aria-label="Your Skyline link" readonly hidden><h3>Your everyday</h3><div data-flight-places></div><a class="flight-secondary" href="/skyline?places=1">Manage my places <span aria-hidden="true">↗</span></a><a class="flight-secondary" href="/your-rome">Your Rome · find your balance <span aria-hidden="true">↗</span></a><h3>Your next step</h3><a class="flight-secondary" href="/property-finding">Find a home with BOOM <span aria-hidden="true">↗</span></a><a class="flight-secondary" href="/login">My tenant portal <span aria-hidden="true">↗</span></a><p class="flight-device">Saved on this browser. Your Skyline link includes up to 20 home IDs only; personal places stay private. Availability and prices are checked again when a home opens.</p></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('.flight-close').addEventListener('click',function(){dialog.close();});
    dialog.addEventListener('click',function(e){if(e.target===dialog){var b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right)dialog.close();}});
    dialog.addEventListener('close',function(){if(opener&&opener.isConnected)opener.focus();});
    dialog.querySelector('.flight-copy').addEventListener('click',async function(){
      var url = new URL(F.skyline(read()),location.origin).href, status=dialog.querySelector('.flight-status');
      try { await navigator.clipboard.writeText(url); status.textContent='Link copied. Your personal places are not included.'; }
      catch (_) { var input=dialog.querySelector('.flight-link-fallback'); input.hidden=false;input.value=url;input.focus();input.select();status.textContent='Select and copy this link.'; }
    });
  }
  function open(e) {
    opener=e.currentTarget; if(!dialog)build(); render();
    if(!dialog.open)dialog.showModal();
    if (!fetchPromise && read().length) {
      fetchPromise=fetch('/api/listings',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('catalog');return r.json();}).then(function(j){
        (j.listings||[]).forEach(function(l){var p=F.listing(l.id);if(p&&typeof l.name==='string')known[p]=l.name;});
        if(dialog.open)render();
      }).catch(function(){fetchPromise=null;});
    }
  }
  function button(mobile) { var b=el('button','flight-move'+(mobile?' flight-move-mobile':''));b.type='button';b.setAttribute('aria-haspopup','dialog');b.innerHTML='Your move <span class="flight-move-count"></span>';b.addEventListener('click',open);return b; }
  function boot() {
    document.body.classList.add('boom-flight');
    var menu=document.querySelector('.nav .menu'), inner=document.querySelector('.nav-inner'), curtain=document.getElementById('tenda');
    [menu,curtain].forEach(function(m){if(!m)return;if(!m.querySelector('a[href="/skyline"]')){var s=el('a','flight-skyline-link','Skyline');s.href='/skyline';var first=m.querySelector('a[href="/apartments"]');first?first.after(s):m.prepend(s);}m.appendChild(button(false));});
    if(menu){var more=el('details','flight-more'), summary=el('summary','','More'), links=el('div');more.appendChild(summary);more.appendChild(links);['/owners','/partners','/about'].forEach(function(h){var a=menu.querySelector('a[href="'+h+'"]');if(a)links.appendChild(a);});var login=menu.querySelector('.m-login');login?login.before(more):menu.appendChild(more);document.addEventListener('click',function(e){if(!more.contains(e.target))more.open=false;});more.addEventListener('keydown',function(e){if(e.key==='Escape'){more.open=false;summary.focus();}});}
    if(inner) {var mobile=button(true), toggle=inner.querySelector('.apri'); toggle?toggle.before(mobile):inner.appendChild(mobile);}
    var bar=document.querySelector('.bar');if(!menu&&bar)bar.appendChild(button(false));
    sync();
    /* Existing heart handlers own the write; capture observes after they finish. */
    document.addEventListener('click',function(e){if(e.target.closest('.home-cuore'))setTimeout(function(){sync();window.dispatchEvent(new CustomEvent('boom:move'));},0);},true);
    window.addEventListener('storage',function(e){if(e.key==='boomSalvate'||e.key==='boom:pois')sync();});
    window.addEventListener('boom:move',sync);
    window.addEventListener('focus',sync);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
