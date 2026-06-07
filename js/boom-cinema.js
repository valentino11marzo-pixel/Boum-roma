/* ════════════════════════════════════════════════════════════════════════
   BOOM Cinema — shared cinematic engine (v4).
   Progressive enhancement only: never blocks, never hides content if it fails.
   Auto-detects the page (detail · apartments grid · neighborhood hub · home).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__boomCinema) return; window.__boomCinema = true;

  var R = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var FINE = matchMedia('(hover:hover) and (pointer:fine)').matches;
  var doc = document, body = doc.body;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var CARDSEL = '.card,.zone-card,.listing-card,.apartment-card';

  body.classList.add('cine-on');

  /* Ambient gold light (skip if the page already has its own) + progress reel */
  if (!R) {
    if (!$('.hero-ambient')) {
      var amb = doc.createElement('div'); amb.className = 'cine-ambient';
      amb.innerHTML = '<i class="g1"></i><i class="g2"></i><i class="g3"></i>'; body.appendChild(amb);
    }
    var prog = doc.createElement('div'); prog.className = 'cine-progress'; body.appendChild(prog);
    var ticking = false;
    addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var h = doc.documentElement, max = (h.scrollHeight - h.clientHeight) || 1;
        prog.style.width = (Math.min(1, Math.max(0, h.scrollTop / max)) * 100).toFixed(2) + '%';
        ticking = false;
      });
    }, { passive: true });
  }

  /* Count-up a number, preserving its prefix/suffix (€, h, %, …) */
  function countUp(el, dur) {
    if (!el || R) return;
    var txt = (el.textContent || '').trim();
    var m = txt.replace(/\s/g, '').match(/^(\D*)([\d.,]+)(.*)$/); if (!m) return;
    var pre = m[1] || '', suf = m[3] || '', target = parseInt(m[2].replace(/[.,]/g, ''), 10);
    if (!target || target < 10) return;
    try { el.style.fontVariantNumeric = 'tabular-nums'; } catch (e) {} // uniform digit width → no jitter
    var st = performance.now();
    (function step(t) {
      var k = Math.min(1, (t - st) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + Math.round(target * e).toLocaleString('en-US') + suf;
      if (k < 1) requestAnimationFrame(step); else el.textContent = txt;
    })(performance.now());
  }
  function countWhenReady(el, dur) {
    if (!el) return; var n = 0;
    (function w() { if (/\d{2,}/.test((el.textContent || '').trim())) countUp(el, dur); else if (n++ < 150) setTimeout(w, 80); })();
  }

  /* Staggered entrance via Web Animations (ends at the natural state) */
  function entrance(sels) {
    if (R) return; var i = 0;
    sels.forEach(function (s) {
      var el = $(s); if (!el || el.offsetParent === null) return;
      var isTitle = (s === '.apt-name');
      var kf = isTitle
        ? [{ opacity: 0, transform: 'translateY(24px)', filter: 'blur(8px)', letterSpacing: '12px' }, { opacity: 1, transform: 'none', filter: 'blur(0)', letterSpacing: '-1px' }]
        : [{ opacity: 0, transform: 'translateY(24px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }];
      try { el.animate(kf, { duration: isTitle ? 1150 : 850, delay: i * 80, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }); } catch (e) {}
      i++;
    });
  }

  /* Reveal-on-scroll for a set of elements (only JS-tagged → safe, with failsafe) */
  function reveal(sel) {
    var ts = $all(sel);
    if (!('IntersectionObserver' in window)) { ts.forEach(function (t) { t.classList.add('cine-in'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('cine-in'); io.unobserve(x.target); } });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
    ts.forEach(function (t) {
      if (t.getBoundingClientRect().top < innerHeight * 0.92) t.classList.add('cine-reveal', 'cine-in');
      else { t.classList.add('cine-reveal'); io.observe(t); }
    });
    setTimeout(function () { $all('.cine-reveal:not(.cine-in)').forEach(function (t) { t.classList.add('cine-in'); }); }, 5000);
  }

  /* Gold CTA sheen + magnetic hover (desktop) */
  function ctas(sels) {
    sels.forEach(function (s) { $all(s).forEach(function (b) { b.classList.add('cine-cta'); }); });
    if (FINE && !R) {
      sels.concat(['.sidebar-cta']).forEach(function (s) {
        $all(s).forEach(function (b) {
          if (b.__mag) return; b.__mag = 1; b.classList.add('cine-mag');
          b.addEventListener('mousemove', function (e) {
            var r = b.getBoundingClientRect();
            var x = (e.clientX - r.left - r.width / 2) / r.width, y = (e.clientY - r.top - r.height / 2) / r.height;
            b.style.transform = 'translate(' + (x * 6).toFixed(1) + 'px,' + (y * 5).toFixed(1) + 'px)';
          });
          b.addEventListener('mouseleave', function () { b.style.transform = ''; });
        });
      });
    }
  }

  /* Resolve the hero to enhance: the carousel, or the single photo wrapped so we
     can tilt it without fighting its Ken-Burns animation. */
  function heroEl() {
    var c = $('#carousel'); if (c) { c.classList.add('cine-hero'); return c; }
    var img = $('.single-hero-img'); if (!img || !img.parentNode) return null;
    if (img.parentNode.classList && img.parentNode.classList.contains('cine-hero')) return img.parentNode;
    var w = doc.createElement('div'); w.className = 'cine-hero cine-hero-wrap';
    img.parentNode.insertBefore(w, img); w.appendChild(img); return w;
  }
  /* Hero: cursor spotlight + subtle 3D tilt (carousel or single photo) */
  function heroSpotlight() {
    if (R || !FINE) return; var c = heroEl(); if (!c) return;
    var raf = null, e0 = null;
    c.addEventListener('mousemove', function (e) {
      e0 = e; if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null; var r = c.getBoundingClientRect();
        var px = (e0.clientX - r.left) / r.width, py = (e0.clientY - r.top) / r.height;
        c.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        c.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        c.style.transition = 'none';
        c.style.transform = 'perspective(1200px) rotateX(' + (-(py - .5) * 2.6).toFixed(2) + 'deg) rotateY(' + ((px - .5) * 3.2).toFixed(2) + 'deg)';
        c.classList.add('cine-spot');
      });
    });
    c.addEventListener('mouseleave', function () {
      c.classList.remove('cine-spot'); c.style.transition = 'transform .5s var(--cine-ease)'; c.style.transform = '';
    });
  }

  /* Carousel "Play tour" — auto-advances using the page's global next() */
  function playTour() {
    var c = $('#carousel'); if (!c || typeof window.next !== 'function' || c.querySelector('.cine-tour')) return;
    var btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'cine-tour';
    btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', 'Auto-play photo tour');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>Play tour</span>';
    var timer = null, label = btn.querySelector('span');
    function stop() { clearInterval(timer); timer = null; btn.classList.remove('is-playing'); btn.setAttribute('aria-pressed', 'false'); label.textContent = 'Play tour'; }
    function start() { btn.classList.add('is-playing'); btn.setAttribute('aria-pressed', 'true'); label.textContent = 'Touring…'; try { window.next(); } catch (e) {} timer = setInterval(function () { try { window.next(); } catch (e) { stop(); } }, 3200); }
    btn.addEventListener('click', function () { if (timer) stop(); else start(); });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden && timer) stop(); }); // pause in background
    c.appendChild(btn);
  }

  /* Lightbox swipe (detail) — reuses the existing prev/next buttons */
  function lightboxSwipe() {
    var lb = $('#lightbox'); if (!lb) return; var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) { var b = $(dx < 0 ? '#lbNext' : '#lbPrev'); if (b) b.click(); }
      x0 = null;
    }, { passive: true });
  }

  /* Stagger the children of a grid once it scrolls into view (e.g. feature items) */
  function staggerChildren(containerSel, childSel) {
    var c = $(containerSel); if (!c || R || !('IntersectionObserver' in window)) return;
    var kids = $all(childSel, c); if (!kids.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) {
        if (!x.isIntersecting) return;
        kids.forEach(function (k, i) { try { k.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: i * 45, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }); } catch (e) {} });
        io.disconnect();
      });
    }, { threshold: .15 });
    io.observe(c);
  }

  /* Watch a card container: stagger-animate any new cards (async-safe, marks done) */
  function watchGrid(sel) {
    var grid = $(sel); if (!grid) return;
    function sweep() {
      if (R) return; var i = 0;
      $all(CARDSEL, grid).forEach(function (el) {
        if (el.__cine) return; el.__cine = 1;
        try { el.animate([{ opacity: 0, transform: 'translateY(26px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: Math.min(i, 7) * 55, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }); } catch (e) {}
        i++;
      });
    }
    sweep();
    if ('MutationObserver' in window) new MutationObserver(sweep).observe(grid, { childList: true, subtree: true });
  }

  /* Universal 3D tilt — one delegated handler for every card type */
  function tiltAny() {
    if (R || !FINE) return; var raf = null, curr = null, ev = null;
    function reset(c) { if (c) { c.classList.remove('cine-tilt'); c.style.transform = ''; } }
    doc.addEventListener('mousemove', function (e) {
      ev = e; if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null; var card = ev.target.closest ? ev.target.closest(CARDSEL) : null;
        if (card !== curr) { reset(curr); curr = card; }
        if (!card) return;
        var r = card.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width - .5, y = (ev.clientY - r.top) / r.height - .5;
        card.classList.add('cine-tilt');
        card.style.transform = 'perspective(900px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 6).toFixed(2) + 'deg) translateY(-6px)';
      });
    }, { passive: true });
  }

  function waitFor(test, cb, max) { var n = 0; (function w() { if (test()) cb(); else if (n++ < (max || 160)) setTimeout(w, 60); })(); }

  /* ── Universal ───────────────────────────────────────────────────── */
  tiltAny();
  watchGrid('#zoneFooter');   // detail "more in this neighborhood" (no-op if absent)

  /* ── DETAIL page ─────────────────────────────────────────────────── */
  if ($('#aptName')) {
    waitFor(function () { var n = $('#aptName'); return n && n.textContent.trim().length > 0; }, function () {
      entrance(['.breadcrumb', '.apt-badges', '.apt-name', '.apt-address', '.apt-zone', '.apt-price-block', '.apt-specs', '.apt-actions', '.media-section', '.aci-box']);
      var pb = $('.apt-price-block'); if (pb && !R) pb.style.minWidth = Math.ceil(pb.getBoundingClientRect().width) + 'px'; // reserve width for count-up
      countUp($('#aptPrice'), 1100); countUp($('#sidebarPrice'), 1100);
      reveal('.content-section,.aci-box,.zone-footer,.sidebar-card,.trust-band,.notify-banner');
      staggerChildren('#featuresGrid', '.feature-item');
      ctas(['.aci-apply', '.sidebar-apply', '.reserve-btn', '#inquiryBtn']);
      heroSpotlight(); playTour(); lightboxSwipe();
      // "Live availability" chip only when the listing is actually available
      if ($('#aptBadges .badge-available') && pb && !pb.querySelector('.cine-live')) {
        var d = doc.createElement('div'); d.className = 'cine-live';
        d.innerHTML = '<span class="dot"></span>Live availability · BOOM-verified'; pb.appendChild(d);
      }
      // Desktop floating Apply — appears once the sticky sidebar CTA scrolls
      // out of view, hides while the form itself is on screen.
      (function () {
        var card = $('#inquiryCard'); if (!card || $('.apply-fab')) return;
        var fab = doc.createElement('a'); fab.className = 'apply-fab'; fab.href = '#inquiryCard';
        fab.textContent = 'Apply now →';
        fab.addEventListener('click', function () { setTimeout(function () { var n = $('#iqName'); if (n) n.focus(); }, 450); });
        body.appendChild(fab);
        var tick = false;
        function upd() {
          tick = false; var show = scrollY > 640;
          var r = card.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) show = false;
          fab.classList.toggle('in', show);
        }
        addEventListener('scroll', function () { if (tick) return; tick = true; requestAnimationFrame(upd); }, { passive: true });
        addEventListener('resize', function () { if (tick) return; tick = true; requestAnimationFrame(upd); }, { passive: true });
        upd();
      })();
    });
  }

  /* ── APARTMENTS grid page ────────────────────────────────────────── */
  if ($('#aptGrid')) {
    watchGrid('#aptGrid');
    ctas(['.svc-cta-gold', '.nbtn-primary']);
    reveal('.svc-card,.notify-banner');
    entrance(['.apt-h1', '.apt-pulse']);
    countWhenReady($('#pulseAvail'), 1200);
    countWhenReady($('#pulseNew'), 1200);
    countWhenReady($('#pulseAvg'), 1200);
  }

  /* ── NEIGHBORHOOD HUB ────────────────────────────────────────────── */
  if ($('#listingsGrid')) {
    watchGrid('#listingsGrid');
    entrance(['.hero-eyebrow', '.hero-title', '.hero-vibe', '.hero-actions']);
    reveal('.section-title,.section-subtitle,.notify-banner');
  }

  /* ── HOMEPAGE (static featured cards + its own hero animation) ────── */
  if ($('.apartment-card') && !$('#aptGrid') && !$('#listingsGrid')) {
    reveal('.section-title,.section-subtitle,.apartment-card');
  }

  /* ── GENERIC content pages (concierge, owners, about, …) — light & safe.
     Ambient + progress + universal card tilt already applied above; here we
     just reveal section headers as they scroll in. ─────────────────────── */
  if (!$('#aptName') && !$('#aptGrid') && !$('#listingsGrid') && !$('.apartment-card')) {
    reveal('.section-eyebrow,.section-title,.section-subtitle');
  }
})();
