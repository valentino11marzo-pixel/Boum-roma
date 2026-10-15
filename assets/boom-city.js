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
          /* what the Check-in learned, if they used it (the server prints it
             in the operator's summary; empty otherwise) */
          checkin: v('fCheckin'), dossier: v('fDossier'),
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

  /* ══ v1.2 (15/10) — THE CHECK-IN ═══════════════════════════════════════
     Three taps → the plan (the RULES in the config, the same the build derived
     the FAQ answer from), the papers in hand → what we'd fix first, a
     boarding pass to save or post, and the answers in a link (#checkin=…).
     It writes into the door — the plan's chip, the move-in band, two hidden
     fields the server prints in the operator's summary — and never into
     anything else: the result is advice, the file and the till stay the two
     doors they were. */
  var CK = (function () {
    var K = C.CHECKIN, root = document.getElementById('checkin');
    if (!K || !root) return null;
    var $ = function (id) { return document.getElementById(id); };
    var STEPS = ['stage', 'when', 'where'];
    var result = $('ckResult'), stepsBox = $('ckSteps');
    var touchedDocs = false, priceBoard = null, cityBoard = null, lastPlan = null;
    var stepEl = function (id) { return root.querySelector('.ck-step[data-step="' + id + '"]'); };
    var answer = function (id) { var r = root.querySelector('input[name="ck-' + id + '"]:checked'); return r ? r.value : null; };
    var optOf = function (stepId, optId) {
      var s = K.steps.filter(function (x) { return x.id === stepId; })[0];
      return s ? s.options.filter(function (o) { return o.id === optId; })[0] : null;
    };
    var rule = function (st, wh) {
      var facts = { stage: st, where: wh };
      for (var i = 0; i < K.rules.length; i++) {
        var r = K.rules[i], ok = true;
        for (var key in r.when) if (r.when.hasOwnProperty(key) && facts[key] !== r.when[key]) ok = false;
        if (ok) return r;
      }
      return null;
    };
    var docsHeld = function () { return [].map.call(root.querySelectorAll('input[name="ck-doc"]:checked'), function (i) { return i.value; }); };
    var setText = function (id, t) { var el = $(id); if (el) el.textContent = t == null ? '' : String(t); };

    /* the steps appear one after the other; the documents after the third */
    function sync() {
      var ready = true;
      STEPS.forEach(function (id) {
        var el = stepEl(id), a = answer(id);
        el.hidden = !ready;
        el.classList.toggle('done', !!a);
        if (!a) ready = false;
      });
      stepEl('dossier').hidden = !ready;
    }

    /* the link that carries the answers: #checkin=<stage>.<when>.<where>.<docs>
       (docs = hex bitmask over the eight documents, '-' when untouched) */
    function hashOf() {
      var mask = 0;
      if (touchedDocs) K.dossier.items.forEach(function (it, i) { if (docsHeld().indexOf(it.id) > -1) mask |= (1 << i); });
      return [answer('stage'), answer('when'), answer('where'), touchedDocs ? mask.toString(16) : '-'].join('.');
    }
    function readHash() {
      var m = /(?:^|[#&])checkin=([a-z]+)\.([a-z]+)\.([a-z]+)\.([0-9a-f]{1,2}|-)/.exec(location.hash || '');
      if (!m) return false;
      var vals = { stage: m[1], when: m[2], where: m[3] };
      var ok = STEPS.every(function (id) { var r = root.querySelector('input[name="ck-' + id + '"][value="' + vals[id] + '"]'); if (r) r.checked = true; return !!r; });
      if (!ok) return false;
      if (m[4] !== '-') {
        touchedDocs = true;
        var mask = parseInt(m[4], 16);
        K.dossier.items.forEach(function (it, i) { var cb = root.querySelector('input[name="ck-doc"][value="' + it.id + '"]'); if (cb) cb.checked = !!(mask & (1 << i)); });
      }
      sync();
      return true;
    }
    var shareUrl = function () { return (C.PAGE_URL || location.origin + location.pathname) + '#checkin=' + hashOf(); };

    function mountBoard(host, word, drum, cls) {
      if (!host) return null;
      if (!BS) { host.textContent = word; return null; }
      var b = new BS.Board(host, word.length, drum);
      if (ridotto) b.show(word); else b.show(word, 60, true);
      return b;
    }

    /* the pass follows the name and the origin as they are typed */
    function paintPass(p, wn, code) {
      setText('ckPassPlan', p.label);
      setText('ckPassWhen', optOf('when', wn).t);
      setText('ckPassFile', code);
      var name = ($('ckName') && $('ckName').value || '').trim(), from = ($('ckOrigin') && $('ckOrigin').value || '').trim().toUpperCase();
      setText('ckPassenger', name || K.pass.guest);
      setText('ckFrom', from || '—');
      if (!cityBoard) {
        var host = $('ckBoard');
        var word = String(host && host.getAttribute('data-word') || C.WORD || '').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '');
        cityBoard = mountBoard(host, word, ' ABCDEFGHIJKLMNOPQRSTUVWXYZ') || true;
      }
    }

    function show(scroll) {
      var st = answer('stage'), wn = answer('when'), wh = answer('where');
      if (!st || !wn || !wh) return false;
      var r = rule(st, wh), p = r && PLANS[r.plan];
      if (!p) return false;
      var code = [optOf('stage', st).code, optOf('when', wn).code, optOf('where', wh).code].join(' · ');
      setText('ckCode', code);
      setText('ckPlan', p.label);
      setText('ckPer', p.per);
      setText('ckWhy', r.why);
      var inc = $('ckInc'); inc.textContent = '';
      (p.includes || []).forEach(function (x) { var li = document.createElement('li'); li.textContent = x; inc.appendChild(li); });
      setText('ckNoteWhen', K.notes.when[wn]);
      setText('ckNoteWhere', K.notes.where[wh]);
      /* the price on its own board, spun once per plan */
      if (lastPlan !== r.plan) { priceBoard = mountBoard($('ckPrice'), eur(p.eur), ' €,.0123456789'); lastPlan = r.plan; }
      /* the papers: how many in hand, what we'd fix first */
      var held = docsHeld(), N = K.dossier.items.length, readyLine, pct;
      if (!touchedDocs && !held.length) { readyLine = K.dossier.skipped; pct = 0; }
      else if (held.length === N) { readyLine = K.dossier.resultAll; pct = 100; }
      else {
        var missing = K.dossier.items.filter(function (it) { return held.indexOf(it.id) < 0; }).map(function (it) { return it.t; });
        readyLine = K.dossier.resultSome.replace('{have}', String(held.length)).replace('{missing}', missing.join(', '));
        pct = Math.round(held.length / N * 100);
      }
      setText('ckReady', readyLine);
      var meter = $('ckMeter'); if (meter) meter.style.width = pct + '%';
      /* the two doors, pointed at this plan */
      var start = $('ckStart');
      if (C.CHECKOUT === true && start) {
        start.setAttribute('data-pay', r.plan);
        setText('ckStartTx', K.result.ctaSearch.replace('{price}', eur(p.eur)));
        if ($('ckFile')) $('ckFile').setAttribute('data-service', r.plan);
      } else if (start) start.setAttribute('data-service', r.plan);
      var chip = document.querySelector('input[name="service"][value="' + r.plan + '"]'); if (chip) chip.checked = true;
      var mv = $('fMoveIn'); if (mv && !mv.value) mv.value = optOf('when', wn).t;
      var labels = [optOf('stage', st).t, optOf('when', wn).t, optOf('where', wh).t].join(' · ');
      if ($('fCheckin')) $('fCheckin').value = labels;
      if ($('fDossier')) $('fDossier').value = touchedDocs ? (held.length + '/' + N + (held.length < N ? ' · missing: ' + K.dossier.items.filter(function (it) { return held.indexOf(it.id) < 0; }).map(function (it) { return it.t; }).join(', ') : '')) : '';
      paintPass(p, wn, code);
      var wa = $('ckWa');
      if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(K.result.share.text.replace('{city}', C.CITY).replace('{url}', shareUrl()));
      stepsBox.hidden = true;
      result.hidden = false;
      result.classList.remove('on'); void result.offsetWidth; result.classList.add('on');
      if (scroll) setTimeout(function () { try { root.scrollIntoView({ block: 'start', behavior: ridotto ? 'auto' : 'smooth' }); } catch (e) {} }, 60);
      boomTrack('checkin_result', { market: C.SLUG, plan: r.plan, stage: st, when: wn, where: wh, docs: touchedDocs ? held.length : -1 });
      return true;
    }
    function reopen() {
      result.hidden = true; result.classList.remove('on');
      stepsBox.hidden = false;
      try { stepEl('stage').querySelector('input').focus({ preventScroll: true }); } catch (e) {}
      try { root.scrollIntoView({ block: 'start', behavior: ridotto ? 'auto' : 'smooth' }); } catch (e) {}
    }

    /* ── the pass as an image: 1080×1920, the card drawn again on a canvas
       (the real mark through its SVG path), shared where the device can,
       saved everywhere else ── */
    function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
    function drawPass(cv) {
      var W = 1080, H = 1920; cv.width = W; cv.height = H;
      var x = cv.getContext('2d');
      var gold = '#FFD700', mono = '"SF Mono", Menlo, Consolas, monospace', sans = '"Helvetica Neue", Helvetica, Arial, sans-serif';
      var st = answer('stage'), wn = answer('when'), wh = answer('where');
      var r = st && wh && rule(st, wh), p = r && PLANS[r.plan];
      var code = st && wn && wh ? [optOf('stage', st).code, optOf('when', wn).code, optOf('where', wh).code].join(' · ') : '';
      var name = ($('ckName') && $('ckName').value || '').trim() || K.pass.guest;
      var from = ($('ckOrigin') && $('ckOrigin').value || '').trim().toUpperCase();
      var word = String(C.WORD || C.CITY).toUpperCase();
      x.fillStyle = '#060607'; x.fillRect(0, 0, W, H);
      /* the quiet grid of the page */
      x.strokeStyle = 'rgba(255,215,0,.035)'; x.lineWidth = 1;
      for (var gx = 0; gx <= W; gx += 80) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
      for (var gy = 0; gy <= H; gy += 80) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
      /* the card: as tall as its content, centred on the story (a card that
         ran to the bottom left a third of it empty) */
      var cx = 80, cw = W - 160, chh = 1150, cy = Math.round((H - chh) / 2) - 20, rad = 36;
      x.save(); roundRect(x, cx, cy, cw, chh, rad); x.clip();
      var bg = x.createLinearGradient(cx, cy, cx + cw, cy + chh); bg.addColorStop(0, '#101014'); bg.addColorStop(.72, '#080809'); bg.addColorStop(1, '#080809');
      x.fillStyle = bg; x.fillRect(cx, cy, cw, chh);
      /* calcographic print, fading from the top-left corner */
      x.save(); x.globalAlpha = .5;
      var mask = x.createRadialGradient(cx, cy, 40, cx, cy, cw * 1.1); mask.addColorStop(0, 'rgba(255,215,0,.14)'); mask.addColorStop(1, 'rgba(255,215,0,0)');
      x.strokeStyle = mask; x.lineWidth = 1;
      for (var d = -chh; d < cw + chh; d += 18) { x.beginPath(); x.moveTo(cx + d, cy); x.lineTo(cx + d - chh * .47, cy + chh); x.stroke(); }
      for (var d2 = -chh; d2 < cw + chh; d2 += 28) { x.beginPath(); x.moveTo(cx + d2, cy); x.lineTo(cx + d2 + chh * .5, cy + chh); x.stroke(); }
      x.restore();
      /* the lamina */
      var lam = x.createLinearGradient(0, cy, 0, cy + chh);
      [[0, '#7a5f16'], [.14, '#f6e27a'], [.32, '#8a6d1f'], [.48, '#fdf0a8'], [.63, '#b8942b'], [.78, '#f6e27a'], [1, '#6b5716']].forEach(function (s) { lam.addColorStop(s[0], s[1]); });
      x.fillStyle = lam; x.fillRect(cx, cy, 44, chh);
      x.save(); x.translate(cx + 22, cy + chh / 2); x.rotate(-Math.PI / 2);
      x.fillStyle = 'rgba(20,16,5,.9)'; x.font = '800 15px ' + sans; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(('BOOM · ' + K.pass.fields.statusValue + ' · ').toUpperCase().repeat(4).split('').join(String.fromCharCode(8202)), 0, 0);
      x.restore();
      x.restore();
      roundRect(x, cx, cy, cw, chh, rad); x.strokeStyle = 'rgba(255,215,0,.28)'; x.lineWidth = 2; x.stroke();
      var L = cx + 44 + 64, Rr = cx + cw - 64, y = cy + 92;
      /* the mark + the title */
      try {
        var pathEl = document.querySelector('#boomMark path');
        if (pathEl && window.Path2D) {
          var P = new Path2D(pathEl.getAttribute('d'));
          x.save(); x.translate(L, y - 46); x.scale(76 / 1024, 76 / 1024); x.translate(0, 1024); x.scale(0.1, -0.1); x.fillStyle = gold; x.fill(P); x.restore();
        }
      } catch (e) {}
      x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      x.fillStyle = gold; x.font = '600 22px ' + mono;
      x.fillText('B O O M  ·  B O A R D I N G   P A S S', L + 96, y);
      /* (the side — tenant side — is on the lamina and on the stub's status
         line; a third copy on the title row collided with the title) */
      /* the route */
      y += 150; x.textAlign = 'left'; x.fillStyle = '#FFF'; x.font = '200 118px ' + sans;
      var fromTxt = from || '';
      if (fromTxt) { x.fillText(fromTxt, L, y); }
      var fw = fromTxt ? x.measureText(fromTxt).width + 34 : 0;
      x.fillStyle = gold; x.font = '300 60px ' + sans; x.fillText('✈', L + fw, y - 8);
      x.font = '200 118px ' + sans; x.fillText(C.IATA || '', L + fw + 86, y);
      /* the city on its board */
      y += 70; var cellW = 64, cellH = 86, gap = 8;
      x.font = '300 56px ' + sans; x.textAlign = 'center';
      for (var i = 0; i < word.length; i++) {
        var X = L + i * (cellW + gap);
        roundRect(x, X, y, cellW, cellH, 8); x.fillStyle = '#040404'; x.fill();
        x.fillStyle = '#121214'; roundRect(x, X, y, cellW, cellH / 2, 8); x.fill();
        x.fillStyle = '#FFE55C'; x.textBaseline = 'middle'; x.fillText(word[i], X + cellW / 2, y + cellH / 2 + 2);
        x.fillStyle = 'rgba(0,0,0,.85)'; x.fillRect(X, y + cellH / 2 - 1.5, cellW, 3);
      }
      x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      /* the fields */
      y += cellH + 92;
      var F = K.pass.fields;
      var rows = [[F.passenger, name], [F.plan, p ? p.label : '—'], [F.boarding, wn ? optOf('when', wn).t : '—'], [F.file, code || '—'], [F.gate, K.pass.gateValue], [F.seat, F.seatValue]];
      var colW = (Rr - L) / 2;
      rows.forEach(function (row, idx) {
        var X = L + (idx % 2) * colW, Y = y + Math.floor(idx / 2) * 150;
        x.fillStyle = 'rgba(255,255,255,.3)'; x.font = '400 18px ' + mono; x.fillText(row[0].toUpperCase().split('').join(' '), X, Y);
        /* a long value shrinks before it is ever cut: the file code and the
           seat are the two lines that must read whole */
        x.fillStyle = '#FFF';
        var v = String(row[1]), fsz = 36;
        x.font = '300 ' + fsz + 'px ' + sans;
        while (x.measureText(v).width > colW - 40 && fsz > 22) { fsz -= 2; x.font = '300 ' + fsz + 'px ' + sans; }
        while (x.measureText(v).width > colW - 40 && v.length > 3) v = v.slice(0, -2) + '…';
        x.fillText(v, X, Y + 50);
      });
      /* the perforation */
      y += 3 * 150 + 10;
      x.save(); x.setLineDash([10, 10]); x.strokeStyle = 'rgba(250,250,250,.22)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + 44, y); x.lineTo(cx + cw, y); x.stroke(); x.restore();
      x.fillStyle = '#060607'; x.beginPath(); x.arc(cx + 44, y, 22, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(cx + cw, y, 22, 0, Math.PI * 2); x.fill();
      /* the stub: the bars, the address, the status */
      y += 86;
      var seed = 0; for (var c2 = 0; c2 < code.length; c2++) seed = (seed * 31 + code.charCodeAt(c2)) % 9973;
      var bx = L; x.fillStyle = 'rgba(255,255,255,.55)';
      while (bx < L + 260) { var bw = 2 + (seed = (seed * 7 + 3) % 11) % 4; x.fillRect(bx, y - 40, bw, 56); bx += bw + 3 + (seed % 5); }
      x.fillStyle = 'rgba(255,255,255,.3)'; x.font = '400 19px ' + mono; x.fillText(K.pass.foot.toUpperCase().split('').join(' '), L + 300, y);
      x.textAlign = 'right'; x.fillStyle = '#3ddc97'; x.fillText((F.status + ' · ' + F.statusValue).toUpperCase().split('').join(' '), Rr, y + 40);
      x.textAlign = 'left';
      /* the line under the card */
      x.fillStyle = 'rgba(255,255,255,.26)'; x.font = '400 20px ' + mono; x.textAlign = 'center';
      x.fillText((C.PAGE_URL || '').replace(/^https:\/\/(www\.)?/, '').toUpperCase().split('').join(' '), W / 2, cy + chh + 70);
      return cv;
    }
    function passBlob() {
      return new Promise(function (resolve) {
        var cv = document.createElement('canvas');
        drawPass(cv);
        cv.toBlob(function (b) { resolve(b); }, 'image/png');
      });
    }
    var fileName = function () { return 'boom-' + C.SLUG + '-boarding-pass.png'; };
    function savePass() {
      return passBlob().then(function (b) {
        if (!b) return;
        var a = document.createElement('a'), u = URL.createObjectURL(b);
        a.href = u; a.download = fileName(); a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { URL.revokeObjectURL(u); a.remove(); } catch (e) {} }, 2000);
        var s = $('ckSaved'); if (s) { s.textContent = root.getAttribute('data-saved') || ''; setTimeout(function () { s.textContent = ''; }, 2400); }
        boomTrack('share', { method: 'image', content_type: 'boarding_pass', market: C.SLUG });
      });
    }
    function sharePass() {
      var text = K.result.share.text.replace('{city}', C.CITY).replace('{url}', shareUrl());
      return passBlob().then(function (b) {
        var file = b && window.File ? new File([b], fileName(), { type: 'image/png' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          boomTrack('share', { method: 'native_image', content_type: 'boarding_pass', market: C.SLUG });
          return navigator.share({ files: [file], title: 'BOOM ' + C.CITY, text: text }).catch(function () {});
        }
        if (navigator.share) {
          boomTrack('share', { method: 'native', content_type: 'checkin', market: C.SLUG });
          return navigator.share({ title: 'BOOM ' + C.CITY, text: text, url: shareUrl() }).catch(function () {});
        }
        return savePass();
      });
    }
    function copyLink() {
      var url = shareUrl(), done = function () {
        var s = $('ckCopied'); if (s) { s.textContent = root.getAttribute('data-copied') || ''; setTimeout(function () { s.textContent = ''; }, 2400); }
        boomTrack('share', { method: 'copy', content_type: 'checkin', market: C.SLUG });
      };
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(url).then(done, function () { fallback(); });
      fallback();
      function fallback() {
        var ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { try { window.prompt('Copy the link', url); } catch (e2) {} }
        ta.remove();
      }
    }

    /* ── wiring ── */
    root.addEventListener('change', function (e) {
      var n = e.target && e.target.name || '';
      if (n === 'ck-doc') { touchedDocs = true; return; }
      var m = /^ck-(stage|when|where)$/.exec(n);
      if (!m) return;
      sync();
      boomTrack('checkin_answer', { market: C.SLUG, step: m[1], value: e.target.value });
    });
    $('ckGo').addEventListener('click', function () { show(true); });
    $('ckChange').addEventListener('click', function (e) { e.preventDefault(); reopen(); });
    $('ckCopy').addEventListener('click', copyLink);
    $('ckWa').addEventListener('click', function () { boomTrack('share', { method: 'whatsapp', content_type: 'checkin', market: C.SLUG }); });
    $('ckSave').addEventListener('click', savePass);
    $('ckShare').addEventListener('click', sharePass);
    ['ckName', 'ckOrigin'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        var st = answer('stage'), wn = answer('when'), wh = answer('where'), r = st && wh && rule(st, wh);
        if (r && PLANS[r.plan] && wn) paintPass(PLANS[r.plan], wn, [optOf('stage', st).code, optOf('when', wn).code, optOf('where', wh).code].join(' · '));
      });
    });
    /* a link with the answers lands straight on the result */
    if (readHash()) show(true); else sync();
    return { show: show, reopen: reopen, hash: hashOf, shareUrl: shareUrl, passBlob: passBlob, drawPass: drawPass };
  })();
  window.BOOM_CHECKIN = CK;

  /* ── depth: the file card and the pass tilt toward a fine pointer, the
     background drifts against it; nothing under reduced motion or on a
     touch screen (a thumb has no hover) ── */
  (function () {
    if (ridotto || !matchMedia('(pointer:fine)').matches) return;
    [document.querySelector('.filecard'), document.getElementById('ckCarta')].forEach(function (el) {
      if (!el) return;
      el.classList.add('tilt');
      var raf = 0, px = 0, py = 0;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width - .5; py = (e.clientY - r.top) / r.height - .5;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          el.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
          el.style.setProperty('--rx', (-py * 6).toFixed(2) + 'deg');
          el.style.setProperty('--mx', (px * 100 + 50).toFixed(1) + '%');
          el.style.setProperty('--my', (py * 100 + 50).toFixed(1) + '%');
        });
      });
      el.addEventListener('pointerleave', function () { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
    var bg = document.querySelector('.tech-bg');
    if (bg) {
      var raf2 = 0, mx = 0, my = 0;
      addEventListener('mousemove', function (e) {
        mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5;
        if (raf2) return;
        raf2 = requestAnimationFrame(function () { raf2 = 0; bg.style.transform = 'translate3d(' + (mx * -16).toFixed(1) + 'px,' + (my * -12).toFixed(1) + 'px,0)'; });
      }, { passive: true });
    }
  })();

  /* ── the rail: the dot of the section on screen lights up ── */
  (function () {
    var rail = document.querySelector('.rail');
    if (!rail || !('IntersectionObserver' in window)) return;
    var links = [].slice.call(rail.querySelectorAll('a[data-rail]'));
    var set = function (id) { links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-rail') === id); }); };
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) set(e.target.id === 'contact' ? 'contact' : e.target.id); });
    }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
    ['contact', 'how', 'services', 'checks', 'faq'].forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
    set('contact');
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
