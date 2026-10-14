/* assets/boom-city.js — shared behaviour of the BOOM city pages (built by
   build-cities.mjs from cities/<city>.json + cities/_template.html).
   Reads window.BOOM_CITY, inlined by the build: slug, city, the board word,
   the lead endpoint. No keys, no third-party form service: the form posts
   JSON to our own /api/city-lead, which writes the lead into the same
   pipeline as every other BOOM door (Brain → Telegram → the operator).
   The Solari engine (window.BoomSolari) is inlined by the build in <head>;
   without it the word and the prices stay plain text — the page reads,
   the design arrives when it can. */
(function () {
  'use strict';
  var C = window.BOOM_CITY || {};
  function boomTrack(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} }
  var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BS = window.BoomSolari;

  /* ── the city on the board ─────────────────────────────────────────────
     Same direction as the DAYS of index.html: one cell per letter, the word
     spins in at 600ms, and every 19s the drum does a full turn and lands on
     the SAME word (the title is a promise: it never changes). Hidden tab =
     silence; reduced motion = the word set still. */
  (function () {
    var host = document.getElementById('flapCity');
    if (!host || !BS) return;
    var word = String(host.textContent || C.WORD || '').trim().toUpperCase();
    if (!word) return;
    var b = new BS.Board(host, word.length, ' ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (ridotto) { b.show(word); return; }
    setTimeout(function () { b.show(word, 110, true); }, 600);
    setInterval(function () { if (document.hidden) return; b.giro(120); }, 19000);
  })();

  /* ── the prices on the board (the apartments-grid mount, one copy) ───── */
  (function () {
    function monta(host) {
      var testo = host.dataset.p || host.textContent || '';
      if (!BS) { host.textContent = testo; return; }
      var b = new BS.Board(host, testo.length, ' €,.0123456789');
      if (ridotto || !('IntersectionObserver' in window)) { b.show(testo); return; }
      new IntersectionObserver(function (r, io) {
        if (!r[0].isIntersecting) return;
        io.disconnect();
        b.show(testo, 40, true);
      }, { threshold: .4 }).observe(host);
    }
    [].forEach.call(document.querySelectorAll('.flap-prezzo'), monta);
  })();

  /* ── a plate's button preselects its service in the door ─────────────── */
  [].forEach.call(document.querySelectorAll('[data-service]'), function (a) {
    a.addEventListener('click', function () {
      var s = document.getElementById('fService');
      if (s) s.value = a.getAttribute('data-service');
      boomTrack('select_item', { item_id: a.getAttribute('data-service'), source_page: C.SLUG });
    });
  });

  /* ── send ──────────────────────────────────────────────────────────────
     Errors come from the page's own data attributes (city copy never lives
     here). A failed send gives the button back and says so, in place. */
  var form = document.getElementById('cityForm');
  if (form) {
    var err = document.getElementById('fErr');
    var go = document.getElementById('fGo');
    var v = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var fail = function (key) { err.textContent = form.getAttribute('data-err-' + key) || ''; err.classList.add('on'); };
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.classList.remove('on');
      var name = v('fName'), email = v('fEmail'), phone = v('fPhone');
      if (name.length < 2) return fail('name');
      var hasEmail = /^\S+@\S+\.\S+$/.test(email), hasPhone = phone.replace(/\D/g, '').length >= 6;
      if (!email && !phone) return fail('contact');
      if (email && !hasEmail) return fail('email');
      if (!hasEmail && !hasPhone) return fail('contact');

      go.style.opacity = .6; go.style.pointerEvents = 'none';
      boomTrack('generate_lead', { channel: 'form', source_page: C.SLUG });
      fetch(C.LEAD_ENDPOINT || '/api/city-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: C.SLUG,
          name: name, email: email, phone: phone,
          moveIn: v('fMoveIn'), budget: v('fBudget'), service: v('fService'),
          situation: v('fSituation'), areas: v('fAreas'), message: v('fMsg'),
          company: v('fCompany')
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || 'failed');
          form.classList.add('hidden');
          document.getElementById('fDone').classList.add('on');
          boomTrack('sign_up', { method: 'city_form', market: C.SLUG });
        })
        .catch(function () {
          go.style.opacity = 1; go.style.pointerEvents = '';
          fail('net');
        });
    });
  }

  /* ── chrome: scrolled nav, burger, scroll progress, mouse glow ───────── */
  (function () {
    var nav = document.getElementById('nav'), bar = document.querySelector('.scroll-progress');
    addEventListener('scroll', function () {
      if (nav) nav.classList.toggle('scrolled', scrollY > 30);
      if (bar) { var h = document.documentElement.scrollHeight - innerHeight; bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%'; }
    }, { passive: true });
    var t = document.getElementById('navToggle'), m = document.getElementById('mobileMenu');
    if (t && m) {
      t.addEventListener('click', function () {
        var open = !m.classList.contains('active');
        t.classList.toggle('active', open); m.classList.toggle('active', open);
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';
      });
      [].forEach.call(m.querySelectorAll('a'), function (a) {
        a.addEventListener('click', function () {
          t.classList.remove('active'); m.classList.remove('active');
          t.setAttribute('aria-expanded', 'false'); document.body.style.overflow = '';
        });
      });
    }
    var glow = document.getElementById('mouseGlow');
    if (glow && matchMedia('(pointer:fine)').matches && !ridotto) {
      addEventListener('mousemove', function (e) {
        glow.classList.add('active');
        glow.style.left = e.clientX + 'px'; glow.style.top = e.clientY + 'px';
      }, { passive: true });
    }
  })();

  /* ── reveal on scroll (no observer → no hiding: content beats choreography) ── */
  (function () {
    var els = document.querySelectorAll('.rv:not(.in)');
    if (!('IntersectionObserver' in window)) { [].forEach.call(els, function (el) { el.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    [].forEach.call(els, function (el) { io.observe(el); });
  })();

  /* ── mobile pay bar: appears past the hero, where the door itself is ── */
  (function () {
    var bar = document.getElementById('paybar'), hero = document.querySelector('.hero');
    if (!bar || !hero) return;
    function upd() { bar.classList.toggle('on', hero.getBoundingClientRect().bottom < 0); }
    addEventListener('scroll', upd, { passive: true }); upd();
  })();

  boomTrack('page_view_market', { market: C.SLUG });
})();
