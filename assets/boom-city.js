/* assets/boom-city.js — shared behaviour of the BOOM city pages (built by
   build-cities.mjs from cities/<city>.json + cities/_template.html).
   Reads window.BOOM_CITY, inlined by the build: slug, city, the board word,
   the lead endpoint. No keys, no third-party form service: the form posts
   JSON to our own /api/city-lead, which writes the lead into the same
   pipeline as every other BOOM door (Brain → Telegram → the operator).
   The Solari engine (window.BoomSolari) is inlined by the build in <head>;
   without it the word and the prices stay plain text — the page reads,
   the design arrives when it can.
   THE TILL (14/10): where the build set CHECKOUT true (a search desk with
   checkout:true — never a waitlist desk, the build refuses it) the plates'
   buttons, the pay bar and the offer after the lead open ONE sheet that
   posts to /api/service-checkout with { city, kind } and follows Stripe's
   URL; the price shown comes from the server's own grid, the page only
   names the plan. Stripe lands back on ?paid=<plan>&session_id=…: the card
   shows the paid state and the board spells PAID. Without CHECKOUT none of
   this mounts and a ?paid= in the URL is ignored. */
(function () {
  'use strict';
  var C = window.BOOM_CITY || {};
  var PLANS = C.PLANS || {};
  function boomTrack(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} }
  var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BS = window.BoomSolari;
  var eur = function (n) { return '€' + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  /* a small board that spells one word (OPEN, PAID) in the door's end states */
  function miniBoard(id) {
    var host = document.getElementById(id);
    if (!host) return;
    var word = String(host.getAttribute('data-word') || '').toUpperCase();
    if (!word) return;
    if (!BS) { host.textContent = word; return; }
    if (host.getAttribute('data-mounted')) return;
    host.setAttribute('data-mounted', '1');
    var b = new BS.Board(host, word.length, ' ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (ridotto) { b.show(word); return; }
    setTimeout(function () { b.show(word, 90, true); }, 250);
  }

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

  /* ── a plate's button preselects its service chip in the door ────────── */
  [].forEach.call(document.querySelectorAll('[data-service]'), function (a) {
    a.addEventListener('click', function () {
      var id = a.getAttribute('data-service');
      var r = document.querySelector('input[name="service"][value="' + id + '"]');
      if (r) r.checked = true;
      boomTrack('select_item', { item_id: id, source_page: C.SLUG });
    });
  });

  /* ── the till ──────────────────────────────────────────────────────────── */
  var ov = C.CHECKOUT === true ? document.getElementById('ov') : null;
  var sheet = null;
  if (ov) {
    sheet = (function () {
      var go = document.getElementById('sGo'), amt = document.getElementById('sGoAmt'), err = document.getElementById('sErr');
      var rows = [].slice.call(ov.querySelectorAll('.payrow'));
      var lastFocus = null, sending = false;
      var fail = function (key) { err.textContent = ov.getAttribute('data-err-' + key) || ''; err.classList.add('on'); };
      var chosen = function () { var r = ov.querySelector('input[name="payplan"]:checked'); return r ? r.value : ''; };
      function paint() {
        var id = chosen(), p = PLANS[id];
        rows.forEach(function (row) { row.classList.toggle('on', row.querySelector('input').checked); });
        amt.textContent = p ? eur(p.eur) : '';
      }
      rows.forEach(function (row) { row.querySelector('input').addEventListener('change', paint); });
      function open(plan, src, prefill) {
        var id = PLANS[plan] ? plan : C.FEATURED;
        rows.forEach(function (row) { var i = row.querySelector('input'); i.checked = i.value === id; });
        if (prefill) {
          ['sName', 'sEmail', 'sPhone'].forEach(function (f, i) {
            var el = document.getElementById(f), v = prefill[['name', 'email', 'phone'][i]];
            if (el && v && !el.value) el.value = v;
          });
        }
        paint();
        err.classList.remove('on');
        lastFocus = document.activeElement;
        ov.classList.add('on'); document.body.style.overflow = 'hidden';
        var bar = document.getElementById('paybar'); if (bar) bar.classList.remove('on');
        boomTrack('begin_checkout', { currency: 'EUR', value: PLANS[id] ? PLANS[id].eur : 0, items: [{ item_id: 'city_' + C.SLUG + '_' + id, item_name: PLANS[id] ? PLANS[id].label : id }], source: src || '', market: C.SLUG });
        setTimeout(function () { try { document.getElementById('sName').focus(); } catch (e) {} }, 350);
      }
      function close() {
        ov.classList.remove('on'); document.body.style.overflow = '';
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
      }
      function pay() {
        if (sending) return;
        var id = chosen(), p = PLANS[id];
        var name = (document.getElementById('sName').value || '').trim();
        var email = (document.getElementById('sEmail').value || '').trim();
        var phone = (document.getElementById('sPhone').value || '').trim();
        err.classList.remove('on');
        if (!p) return fail('net');
        if (name.length < 2) return fail('name');
        if (!/^\S+@\S+\.\S+$/.test(email)) return fail('email');
        if (phone && phone.replace(/\D/g, '').length < 6) return fail('phone');
        sending = true; go.classList.add('busy');
        boomTrack('add_payment_info', { currency: 'EUR', value: p.eur, market: C.SLUG });
        fetch(C.CHECKOUT_ENDPOINT || '/api/service-checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city: C.SLUG, kind: id, name: name, email: email, phone: phone,
            notes: (document.getElementById('sNote').value || '').trim(),
            company: (document.getElementById('sCompany').value || '').trim()
          })
        })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res && res.ok && res.url) { location.href = res.url; return; }
            throw new Error((res && res.error) || 'failed');
          })
          .catch(function () { sending = false; go.classList.remove('busy'); fail('net'); });
      }
      go.addEventListener('click', pay);
      document.getElementById('ovX').addEventListener('click', close);
      document.getElementById('ovTalk').addEventListener('click', function () { close(); });
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      [].forEach.call(ov.querySelectorAll('input'), function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && el.type !== 'radio') pay(); }); });
      document.addEventListener('keydown', function (e) {
        if (!ov.classList.contains('on')) return;
        if (e.key === 'Escape') return close();
        if (e.key !== 'Tab') return;
        var f = ov.querySelectorAll('input:not([tabindex="-1"]),button,a[href]');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      return { open: open, close: close };
    })();
    [].forEach.call(document.querySelectorAll('[data-pay]'), function (b) {
      if (b.id === 'payOfferBtn') return;   /* bound after the lead, with the chosen plan and the prefill */
      b.addEventListener('click', function () {
        var plan = b.getAttribute('data-pay');
        sheet.open(plan, b.id || (b.closest('.sib') ? 'plate' : b.closest('.paybar') ? 'paybar' : 'page'));
      });
    });
  }

  /* ── send ──────────────────────────────────────────────────────────────
     Errors come from the page's own data attributes (city copy never lives
     here). A failed send gives the button back and says so, in place. */
  var form = document.getElementById('cityForm');
  if (form) {
    var err = document.getElementById('fErr');
    var go = document.getElementById('fGo');
    var v = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var service = function () { var r = form.querySelector('input[name="service"]:checked'); return r ? r.value : ''; };
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

      var goText = go.querySelector('b'), restText = goText ? goText.textContent : '';
      go.style.opacity = .6; go.style.pointerEvents = 'none'; go.classList.add('busy');
      if (goText && form.getAttribute('data-sending')) goText.textContent = form.getAttribute('data-sending');
      boomTrack('generate_lead', { channel: 'form', source_page: C.SLUG });
      var picked = service();
      fetch(C.LEAD_ENDPOINT || '/api/city-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: C.SLUG,
          name: name, email: email, phone: phone,
          moveIn: v('fMoveIn'), budget: v('fBudget'), service: picked,
          situation: v('fSituation'), areas: v('fAreas'), message: v('fMsg'),
          company: v('fCompany')
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || 'failed');
          form.classList.add('hidden');
          document.getElementById('fDone').classList.add('on');
          miniBoard('flapDone');
          boomTrack('sign_up', { method: 'city_form', market: C.SLUG });
          /* the till, after the file: the service they chose, their name and
             email already in the sheet. "Not sure yet" gets no offer — they
             asked for advice, not a checkout. */
          var offer = document.getElementById('payOffer');
          if (offer && sheet && PLANS[picked]) {
            document.getElementById('payOfferAmt').textContent = eur(PLANS[picked].eur);
            var btn = document.getElementById('payOfferBtn');
            btn.setAttribute('data-pay', picked);
            btn.addEventListener('click', function () { sheet.open(picked, 'after-lead', { name: name, email: email, phone: phone }); });
            offer.hidden = false;
          }
        })
        .catch(function () {
          go.style.opacity = 1; go.style.pointerEvents = ''; go.classList.remove('busy');
          if (goText) goText.textContent = restText;
          fail('net');
        });
    });
  }

  /* ── the paid landing: Stripe sends the client back to ?paid=<plan> ────
     Shown only where the till exists and the plan is one of ours; the
     purchase event fires once per session id (a refresh must not count a
     second sale). The query is folded away so the URL can be shared. */
  (function () {
    if (C.CHECKOUT !== true || !form) return;
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var plan = q.get('paid'), sid = q.get('session_id') || '';
    if (!plan || !PLANS[plan]) return;
    var card = document.getElementById('fPaid');
    if (!card) return;
    form.classList.add('hidden');
    document.getElementById('paidPlan').textContent = PLANS[plan].label + ' · ' + eur(PLANS[plan].eur);
    card.classList.add('on');
    miniBoard('flapPaid');
    var key = 'boom:paid:' + (sid || plan), seen = false;
    try { seen = !!localStorage.getItem(key); localStorage.setItem(key, String(Date.now())); } catch (e) {}
    if (!seen) boomTrack('purchase', { transaction_id: sid || ('city_' + Date.now()), currency: 'EUR', value: PLANS[plan].eur, items: [{ item_id: 'city_' + C.SLUG + '_' + plan, item_name: PLANS[plan].label, price: PLANS[plan].eur, quantity: 1 }], market: C.SLUG });
    try { history.replaceState(null, '', location.pathname + '#contact'); } catch (e) {}
    setTimeout(function () { try { document.getElementById('contact').scrollIntoView({ block: 'start' }); } catch (e) {} }, 50);
  })();

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
    function upd() { bar.classList.toggle('on', hero.getBoundingClientRect().bottom < 0 && !(ov && ov.classList.contains('on'))); }
    addEventListener('scroll', upd, { passive: true }); upd();
  })();

  boomTrack('page_view_market', { market: C.SLUG });
})();
