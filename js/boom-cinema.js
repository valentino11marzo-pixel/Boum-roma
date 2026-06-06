/* ════════════════════════════════════════════════════════════════════════
   BOOM Cinema — shared cinematic engine.
   Progressive enhancement only: never blocks, never hides content if it fails.
   Auto-detects the page (detail vs apartments grid) by element presence.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__boomCinema) return; window.__boomCinema = true;

  var R = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var FINE = matchMedia('(hover:hover) and (pointer:fine)').matches;
  var doc = document, body = doc.body;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  body.classList.add('cine-on');

  /* Ambient + scroll-progress */
  if (!R) {
    var amb = doc.createElement('div'); amb.className = 'cine-ambient';
    amb.innerHTML = '<i class="g1"></i><i class="g2"></i><i class="g3"></i>'; body.appendChild(amb);
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

  /* Count-up a single element's number, preserving its prefix/suffix (€, etc.) */
  function countUp(el, dur) {
    if (!el || R) return;
    var txt = (el.textContent || '').trim();
    var m = txt.replace(/\s/g, '').match(/^(\D*)([\d.,]+)(.*)$/); if (!m) return;
    var pre = m[1] || '', suf = m[3] || '', target = parseInt(m[2].replace(/[.,]/g, ''), 10);
    if (!target || target < 10) return;
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

  /* Staggered entrance via the Web Animations API (ends at the natural state) */
  function entrance(sels) {
    if (R) return; var i = 0;
    sels.forEach(function (s) {
      var el = $(s); if (!el || el.offsetParent === null) return;
      // Editorial touch: the title settles from wide tracking to its set value.
      var kf = (s === '.apt-name')
        ? [{ opacity: 0, transform: 'translateY(24px)', filter: 'blur(8px)', letterSpacing: '12px' }, { opacity: 1, transform: 'none', filter: 'blur(0)', letterSpacing: '-1px' }]
        : [{ opacity: 0, transform: 'translateY(24px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }];
      try {
        el.animate(kf, { duration: (s === '.apt-name' ? 1150 : 850), delay: i * 80, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
      } catch (e) {}
      i++;
    });
  }

  /* Reveal-on-scroll for a set of sections (only tags elements via JS → safe) */
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

  /* Hero: cursor spotlight + subtle 3D tilt (detail carousel) */
  function heroSpotlight() {
    if (R || !FINE) return; var c = $('#carousel'); if (!c) return;
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
      c.classList.remove('cine-spot');
      c.style.transition = 'transform .5s var(--cine-ease)';
      c.style.transform = '';
    });
  }

  /* Carousel "Play tour" — auto-advances using the page's global next() */
  function playTour() {
    var c = $('#carousel'); if (!c || typeof window.next !== 'function' || c.querySelector('.cine-tour')) return;
    var btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'cine-tour';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>Play tour</span>';
    var timer = null, label = btn.querySelector('span');
    function stop() { clearInterval(timer); timer = null; btn.classList.remove('is-playing'); label.textContent = 'Play tour'; }
    btn.addEventListener('click', function () {
      if (timer) { stop(); return; }
      btn.classList.add('is-playing'); label.textContent = 'Touring…';
      try { window.next(); } catch (e) {}
      timer = setInterval(function () { try { window.next(); } catch (e) { stop(); } }, 3200);
    });
    c.appendChild(btn);
  }

  /* Apartments grid: staggered reveal of new cards + 3D tilt (event-delegated) */
  function cards(gridSel) {
    var grid = $(gridSel); if (!grid) return;
    function animateNew(nodes) {
      if (R) return; var i = 0;
      nodes.forEach(function (el) {
        if (el.nodeType !== 1 || !el.classList || !el.classList.contains('card')) return;
        try {
          el.animate(
            [{ opacity: 0, transform: 'translateY(26px) scale(.985)' }, { opacity: 1, transform: 'none' }],
            { duration: 640, delay: Math.min(i, 7) * 55, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }
          );
        } catch (e) {}
        i++;
      });
    }
    animateNew($all('.card', grid));
    if ('MutationObserver' in window) {
      new MutationObserver(function (muts) {
        var added = []; muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { added.push(n); }); });
        if (added.length) animateNew(added);
      }).observe(grid, { childList: true });
    }
    if (FINE && !R) {
      var raf = null, curr = null, ev = null;
      grid.addEventListener('mousemove', function (e) {
        var card = e.target.closest && e.target.closest('.card'); if (!card) return;
        curr = card; ev = e; if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null; if (!curr || !ev) return;
          var r = curr.getBoundingClientRect();
          var x = (ev.clientX - r.left) / r.width - .5, y = (ev.clientY - r.top) / r.height - .5;
          curr.classList.add('cine-tilt');
          curr.style.transform = 'perspective(900px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 6).toFixed(2) + 'deg) translateY(-6px)';
        });
      });
      grid.addEventListener('mouseout', function (e) {
        var card = e.target.closest && e.target.closest('.card');
        if (card && !card.contains(e.relatedTarget)) { card.classList.remove('cine-tilt'); card.style.transform = ''; }
      });
    }
  }

  function waitFor(test, cb, max) { var n = 0; (function w() { if (test()) cb(); else if (n++ < (max || 160)) setTimeout(w, 60); })(); }

  /* ── DETAIL page ─────────────────────────────────────────────────── */
  if ($('#aptName')) {
    waitFor(function () { var n = $('#aptName'); return n && n.textContent.trim().length > 0; }, function () {
      entrance(['.breadcrumb', '.apt-badges', '.apt-name', '.apt-address', '.apt-zone', '.apt-price-block', '.apt-specs', '.apt-actions', '.media-section', '.aci-box']);
      countUp($('#aptPrice'), 1100); countUp($('#sidebarPrice'), 1100);
      reveal('.content-section,.aci-box,.zone-footer,.sidebar-card,.trust-band,.notify-banner');
      ctas(['.aci-apply', '.sidebar-apply', '.reserve-btn', '#inquiryBtn']);
      heroSpotlight(); playTour();
      var blk = $('.apt-price-block');
      if (blk && !blk.querySelector('.cine-live')) {
        var d = doc.createElement('div'); d.className = 'cine-live';
        d.innerHTML = '<span class="dot"></span>Live availability · BOOM-verified'; blk.appendChild(d);
      }
    });
  }

  /* ── APARTMENTS grid page ────────────────────────────────────────── */
  if ($('#aptGrid')) {
    cards('#aptGrid');
    ctas(['.svc-cta-gold', '.nbtn-primary']);
    reveal('.svc-card,.notify-banner');
    entrance(['.apt-h1', '.apt-pulse']);
    countWhenReady($('#pulseAvail'), 1200);
    countWhenReady($('#pulseNew'), 1200);
    countWhenReady($('#pulseAvg'), 1200);
  }
})();
