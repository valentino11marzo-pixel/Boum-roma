/* assets/boom-city.js — shared behaviour of the BOOM city pages (built by
   build-cities.mjs from cities/<city>.json + cities/_template.html).
   Reads window.BOOM_CITY, inlined by the build: the slug, the board word,
   the plans with their conditions, the desk block, the Check-in rules.
   No keys, no third-party form service: the form posts JSON to our own
   /api/city-lead, which writes the lead into the same pipeline as every
   other BOOM door (Brain → Telegram → the operator).
   v2 (16/10, STUDIO_CITIES_ESPERIENZA.md §11): THE DIAGNOSTIC IS THE HERO.
   The Check-in's steps run stage → where → when; the pass (the ticket) is
   LIVE — resolved by the rules on the first tap for "haven't started" and
   "found one", on the second for "shortlist", never a guess in between —
   and writes into the door (the plan's chip, the move-in month, two hidden
   fields the server prints on the operator's summary) and never past it.
   The URL is the memory (#checkin=stage.where.when.docs[.via], rewritten on
   every answer); nothing is kept on the device beyond the session. The
   till is a native <dialog>. The pass is exported off the main thread
   where the browser has OffscreenCanvas, from the same drawing function.
   Motion is feedback: a step folding, the price board flipping once per
   plan, the meter moving, OPEN/PAID — nothing loops at rest, everything is
   still under prefers-reduced-motion. The Solari engine (window.BoomSolari)
   is inlined by the build; without it the words stay plain text.
   17/10, after the adversarial review (14 confirmed + 28 triaged findings):
   a chip the reader chose by hand is never overwritten by a re-render; the
   door sends once per tap; the pass lands on the tap that resolves it; the
   strip keeps the build's copy; the auto month follows the answer and
   leaves when the answer leaves; the board mounts when the pass becomes
   visible; an own reload is not "the link you received"; re-picking the
   same answer folds the step; the menu is inert off-screen (Escape closes,
   focus returns); focus lands on the open file; the price and the city are
   read as text (boards decorative); one small live region instead of a
   live plan box (18/10: in the Check-in, and no sticky column at all);
   a paper tick swaps without a view transition (whose overlay
   ate taps); the worker replies are correlated by id; the desk's tz label
   and the "same-day reply" sub follow the clock. */
(function () {
  'use strict';
  var C = window.BOOM_CITY || {};
  var PLANS = C.PLANS || {};
  var K = C.CHECKIN || null;
  var D = C.DESK || null;
  var $ = function (id) { return document.getElementById(id); };
  function boomTrack(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} }
  var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BS = window.BoomSolari;
  var eur = function (n) { return '€' + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var setText = function (id, t) { var el = $(id); if (!el) return; var v = t == null ? '' : String(t); if (el.textContent !== v) el.textContent = v; };
  /* PLANS is plain data: an inherited key (?paid=constructor) is not a plan */
  var planOf = function (id) { return id && Object.prototype.hasOwnProperty.call(PLANS, id) ? PLANS[id] : null; };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  /* a POST that never answers must not lock a button for the tab's life:
     20 s, then the send fails in place and the button comes back */
  function postJson(url, body, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 20000);
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(to); return r.json(); }, function (e) { clearTimeout(to); throw e; });
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* a board that spells one word (the city, OPEN, PAID) — mounted once, shown once */
  function mountBoard(host, word, drum, stagger) {
    if (!host) return null;
    if (!BS) { host.textContent = word; return null; }
    host.textContent = '';
    var b = new BS.Board(host, word.length, drum);
    if (ridotto) b.show(word); else b.show(word, stagger || 60, true);
    return b;
  }
  function miniBoard(id) {
    var host = $(id);
    if (!host || host.getAttribute('data-mounted')) return;
    var word = String(host.getAttribute('data-word') || '').toUpperCase();
    if (!word) return;
    host.setAttribute('data-mounted', '1');
    if (!BS) { host.textContent = word; return; }
    var b = new BS.Board(host, word.length, ' ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (ridotto) { b.show(word); return; }
    setTimeout(function () { b.show(word, 90, true); }, 250);
  }

  /* ── the city on the board: ONE settle at load, never re-spun (the title
     is a promise; a word that re-spins every 19 seconds is a slot machine) ── */
  (function () {
    var host = $('flapCity');
    if (!host || !BS) return;
    /* the board is served empty (the raw H1 reads the city once); the word
       is data-word, drawn by CSS until the cells land */
    var word = String(host.getAttribute('data-word') || C.WORD || '').trim().toUpperCase();
    if (!word) return;
    var b = new BS.Board(host, word.length, ' ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (ridotto) { b.show(word); return; }
    setTimeout(function () { b.show(word, 50, true); }, 120);
  })();

  /* ── the desk clock and the reply window, one copy of the desk block ── */
  var desk = (function () {
    if (!D) return null;
    var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    function parts(tz) {
      try {
        var f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short', timeZoneName: 'short' });
        var o = {};
        f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
        var h = parseInt(o.hour, 10) % 24, m = parseInt(o.minute, 10);
        return { h: h, m: m, hm: (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m, wd: WD[o.weekday], tz: o.timeZoneName || '' };
      } catch (e) { return null; }
    }
    var toMin = function (hhmm) { var a = hhmm.split(':'); return (+a[0]) * 60 + (+a[1]); };
    /* the zone's short name as the clock sees it (CEST seven months a year),
       the build's season-neutral label (CET/CEST) when Intl gives a numeric offset instead */
    function tzLabel() { var p = parts(D.timeZone); return p && /^[A-Z]{2,5}$/.test(p.tz) ? p.tz : D.tzLabel; }
    /* is the desk open now: true · false · null when the clock is unknown */
    function isOpen() {
      var p = parts(D.timeZone);
      if (!p || p.wd === undefined) return null;
      var now = p.h * 60 + p.m;
      return D.days.indexOf(p.wd) > -1 && now >= toMin(D.hours.from) && now < toMin(D.hours.to);
    }
    /* "By 19:00 CEST today" · "Tomorrow from 09:00 CET" · "Monday from 09:00 CET" */
    function replyWindow() {
      var p = parts(D.timeZone);
      if (!p || p.wd === undefined) return null;
      var tz = tzLabel();
      var now = p.h * 60 + p.m, today = D.days.indexOf(p.wd) > -1;
      if (today && now < toMin(D.hours.from)) return 'Today from ' + D.hours.from + ' ' + tz;
      if (today && now < toMin(D.hours.to)) return 'By ' + D.hours.to + ' ' + tz + ' today';
      for (var d = 1; d <= 7; d++) {
        if (D.days.indexOf((p.wd + d) % 7) > -1) return (d === 1 ? 'Tomorrow' : DAYS[(p.wd + d) % 7]) + ' from ' + D.hours.from + ' ' + tz;
      }
      return null;
    }
    /* the printed zone label follows the clock too (the build cannot know the date) */
    (function () { var tz = tzLabel(); [].forEach.call(document.querySelectorAll('[data-tz]'), function (el) { if (el.textContent !== tz) el.textContent = tz; }); })();
    /* the clock line in the "Who answers" fact: desk time and the visitor's,
       swapped at the minute boundary with one timeout, never a countdown */
    var shown = false;
    function clock() {
      var el = $('deskClock');
      if (!el) return;
      var a = parts(D.timeZone), b = parts(null);
      if (!a || !b) return;
      el.textContent = a.hm === b.hm ? 'it is ' + a.hm + ' at the desk' : 'it is ' + a.hm + ' at the desk, ' + b.hm + ' for you';
      /* the visitor's zone stays on the device: it is read for the line, never sent */
      if (!shown) { shown = true; boomTrack('clock_shown', { market: C.SLUG }); }
      var ms = 60000 - (Date.now() % 60000) + 50;
      setTimeout(clock, ms);
      /* the desk's promise on the door follows the same minute: a tab kept
         open across 19:00 stops saying "same-day reply" */
      try { if (typeof deskSub === 'function') deskSub(); } catch (e) {}
    }
    clock();
    return { replyWindow: replyWindow, parts: parts, tzLabel: tzLabel, open: isOpen };
  })();

  /* ── the door: the month select, the plan line, the send ── */
  var form = $('cityForm');
  var planline = $('planline');
  /* "free · same-day reply" is the desk's promise while it is open. In the
     evening and at the weekend the three places that print it (the door
     button, the pass's door, the strip) say the window instead — the same
     one the OPEN card computes — so the promise shown before the tap is the
     one kept after it. */
  var deskSub = (function () {
    var bar = $('paybar');
    var smalls = ['fGo', 'ckFile'].map(function (id) { var el = $(id); return el && el.querySelector('small'); }).filter(Boolean);
    var open = { sub: smalls[0] ? smalls[0].textContent : '', strip: bar ? bar.getAttribute('data-sub') || '' : '' };
    var last = null;
    function sync() {
      if (!desk) return;
      var closed = desk.open() === false, rw = closed ? desk.replyWindow() : null;
      var sub = closed && rw ? 'free · ' + rw : null;
      if (sub === last) return;
      last = sub;
      smalls.forEach(function (sm) { sm.textContent = sub || open.sub; });
      if (bar) {
        bar.setAttribute('data-sub', sub || open.strip);
        /* the strip's line is rewritten only while it shows the default (a plan named there stays) */
        var st = $('stripSub'); if (st && /^free · /.test(st.textContent)) setText('stripSub', sub || open.strip);
      }
    }
    sync();
    return sync;
  })();
  var nowYM = (function () { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1); })();
  function ymPlus(n) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1); }
  (function () {
    var sel = $('fMoveIn');
    if (!sel) return;
    /* the months already passed leave the list (the build anchors the list
       in data so the page stays deterministic; the clock lives here) */
    [].forEach.call(sel.options, function (o) { if (o.value && o.value < nowYM) { o.hidden = true; o.disabled = true; } });
    if (sel.value && sel.value < nowYM) sel.value = '';
  })();
  var service = function () { var r = form && form.querySelector('input[name="service"]:checked'); return r ? r.value : ''; };
  /* the plan line reads the checked chip: the pass writes it, a plate's
     button writes it, the visitor can change it under "change" */
  function paintPlanline(from) {
    if (!planline) return;
    var id = service(), p = planOf(id), txt = $('plText'), ch = $('plChange');
    if (p) {
      var via = from === 'checkin' ? (planline.getAttribute('data-from') || '') : '';
      txt.textContent = p.label + ' · ' + eur(p.eur) + (p.unit ? ' ' + p.unit : '') + ' · ' + p.condition + (via ? ' · ' + via : '');
      ch.hidden = false;
    } else if (id === 'unsure') {
      txt.textContent = planline.getAttribute('data-unsure') || 'Not sure yet';
      ch.hidden = false;
    } else {
      txt.textContent = planline.getAttribute('data-none') || '';
      ch.hidden = true;
    }
  }
  function setPlan(id, from) {
    var r = form && form.querySelector('input[name="service"][value="' + id + '"]');
    if (!r) return;
    r.checked = true;
    if (planline) { planline.open = false; }
    paintPlanline(from);
  }
  if (planline) {
    var sum = planline.querySelector('summary');
    planline.setAttribute('data-none', $('plText').textContent);
    planline.setAttribute('data-unsure', (function () { var u = form.querySelector('.chip.unsure b'); return u ? u.textContent + ' · ' + form.querySelector('.chip.unsure small').textContent : 'Not sure yet'; })());
    planline.setAttribute('data-from', planline.getAttribute('data-from') || '');
    /* a chip the reader taps is theirs: from then on no render overwrites it */
    form.addEventListener('change', function (e) { if (e.target && e.target.name === 'service') { form.setAttribute('data-plan-from', 'chip'); paintPlanline('chip'); } });
    sum.addEventListener('click', function () { /* native toggle */ });
  }
  /* a plate's button (and the pass's door) preselects its service chip */
  [].forEach.call(document.querySelectorAll('[data-service]'), function (a) {
    a.addEventListener('click', function () {
      var id = a.getAttribute('data-service');
      if (!id) return;
      var from = a.id === 'ckFile' ? 'checkin' : 'plate';
      setPlan(id, from);
      if (form) form.setAttribute('data-plan-from', from);
      boomTrack('select_item', { item_id: id, source_page: C.SLUG, source: a.id === 'ckFile' ? 'pass' : 'plate' });
    });
  });

  /* ── the till: a native dialog ──────────────────────────────────────── */
  var ov = C.CHECKOUT === true ? $('ov') : null;
  var sheet = null;
  var dialogOpen = function () { return !!(ov && ov.open); };
  if (ov) {
    sheet = (function () {
      var go = $('sGo'), amt = $('sGoAmt'), err = $('sErr');
      var rows = [].slice.call(ov.querySelectorAll('.payrow'));
      var lastFocus = null, sending = false;
      var fail = function (key) { err.textContent = ov.getAttribute('data-err-' + key) || ''; err.classList.add('on'); boomTrack('form_error', { form: 'till', field: key, market: C.SLUG }); };
      var chosen = function () { var r = ov.querySelector('input[name="payplan"]:checked'); return r ? r.value : ''; };
      function paint() {
        var id = chosen(), p = planOf(id);
        rows.forEach(function (row) { row.classList.toggle('on', row.querySelector('input').checked); });
        amt.textContent = p ? eur(p.eur) : '';
      }
      rows.forEach(function (row) { row.querySelector('input').addEventListener('change', paint); });
      /* the last button says what the payer chose: unticked it books and the
         work waits for the 14 days, ticked it starts */
      var tick = $('sStart');
      function paintStart() {
        var now = !!(tick && tick.checked);
        var b = go.querySelector('.tx b'), sm = go.querySelector('.tx small');
        if (b) b.textContent = go.getAttribute(now ? 'data-label-now' : 'data-label-wait') || b.textContent;
        if (sm) sm.textContent = go.getAttribute(now ? 'data-sub-now' : 'data-sub-wait') || sm.textContent;
      }
      if (tick) { tick.addEventListener('change', paintStart); paintStart(); }
      function open(plan, src, prefill) {
        var id = planOf(plan) ? plan : C.FEATURED;
        rows.forEach(function (row) { var i = row.querySelector('input'); i.checked = i.value === id; });
        if (prefill) {
          ['sName', 'sEmail', 'sPhone'].forEach(function (f, i) {
            var el = $(f), v = prefill[['name', 'email', 'phone'][i]];
            if (el && v && !el.value) el.value = v;
          });
        }
        paint();
        err.classList.remove('on');
        lastFocus = document.activeElement;
        if (typeof ov.showModal === 'function') { try { ov.showModal(); } catch (e) { ov.setAttribute('open', ''); } }
        else { ov.classList.add('inplace'); ov.setAttribute('open', ''); try { ov.scrollIntoView({ block: 'start' }); } catch (e) {} }
        document.body.style.overflow = 'hidden';
        var bar = $('paybar'); if (bar) bar.classList.remove('on');
        var pp = planOf(id);
        boomTrack('begin_checkout', { currency: 'EUR', value: pp ? pp.eur : 0, items: [{ item_id: 'city_' + C.SLUG + '_' + id, item_name: pp ? pp.label : id }], source: src || '', market: C.SLUG });
        setTimeout(function () { try { $('sName').focus(); } catch (e) {} }, 350);
      }
      function close() {
        if (typeof ov.close === 'function' && ov.open) ov.close(); else ov.removeAttribute('open');
        document.body.style.overflow = '';
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
      }
      ov.addEventListener('close', function () { document.body.style.overflow = ''; });
      function pay() {
        if (sending) return;
        var id = chosen(), p = planOf(id);
        var name = ($('sName').value || '').trim();
        var email = ($('sEmail').value || '').trim();
        var phone = ($('sPhone').value || '').trim();
        err.classList.remove('on');
        if (!p) return fail('net');
        if (name.length < 2) return fail('name');
        if (!/^\S+@\S+\.\S+$/.test(email)) return fail('email');
        if (phone && phone.replace(/\D/g, '').length < 6) return fail('phone');
        sending = true; go.classList.add('busy');
        boomTrack('add_payment_info', { currency: 'EUR', value: p.eur, market: C.SLUG });
        postJson(C.CHECKOUT_ENDPOINT || '/api/service-checkout', {
          city: C.SLUG, kind: id, name: name, email: email, phone: phone,
          notes: ($('sNote').value || '').trim(),
          /* the payer's own request to start inside the 14-day withdrawal
             period — never pre-ticked; without it the desk starts when the
             14 days end (Directive 2011/83/EU art. 7(3)) */
          startNow: !!($('sStart') && $('sStart').checked),
          company: ($('sCompany').value || '').trim()
        })
          .then(function (res) {
            if (res && res.ok && res.url) { location.href = res.url; return; }
            throw new Error((res && res.error) || 'failed');
          })
          .catch(function () { sending = false; go.classList.remove('busy'); fail('net'); });
      }
      go.addEventListener('click', pay);
      $('ovX').addEventListener('click', close);
      $('ovTalk').addEventListener('click', function () { close(); });
      /* a tap on the backdrop closes: the backdrop is the dialog's own box outside its content */
      ov.addEventListener('click', function (e) {
        if (e.target !== ov) return;
        var r = ov.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
      });
      [].forEach.call(ov.querySelectorAll('input'), function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && el.type !== 'radio' && el.type !== 'checkbox') pay(); }); });
      return { open: open, close: close };
    })();
    [].forEach.call(document.querySelectorAll('[data-pay]'), function (b) {
      if (b.id === 'payOfferBtn') return;   /* bound after the lead, with the chosen plan and the prefill */
      b.addEventListener('click', function () {
        var plan = b.getAttribute('data-pay');
        if (!plan) return;
        sheet.open(plan, b.id || (b.closest('.sib') ? 'plate' : 'page'));
      });
    });
  }

  /* ── send ──────────────────────────────────────────────────────────────
     Errors come from the page's own data attributes (city copy never lives
     here). A failed send gives the button back and says so, in place. */
  if (form) {
    var err = $('fErr');
    var go = $('fGo');
    var v = function (id) { var el = $(id); return el ? String(el.value || '').trim() : ''; };
    /* the error is said in place and the field it names takes focus */
    var fail = function (key) {
      err.textContent = form.getAttribute('data-err-' + key) || ''; err.classList.add('on');
      boomTrack('form_error', { form: 'file', field: key, market: C.SLUG });
      var f = key === 'name' ? $('fName') : key === 'email' ? $('fEmail') : key === 'contact' ? (v('fPhone') && !v('fEmail') ? $('fPhone') : $('fEmail')) : null;
      if (f) { try { f.focus(); } catch (e) {} }
    };
    /* ONE send per tap: pointer-events on the button stops a second click,
       not Enter in a field (implicit submission) — the flag does; it is
       released only when the send fails */
    var sending = false;
    /* one request id per page load: a send retried after a timeout files the
       same lead (api/city-lead.js writes leads/city_<id>), never a second */
    var requestId = (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^a-z0-9]/g, '');
    /* the offer after the lead is bound once; the plan and the prefill it
       opens with are the last send's */
    var offerPlan = '', offerPrefill = null, offerBtn = $('payOfferBtn');
    if (offerBtn && sheet) offerBtn.addEventListener('click', function () { if (offerPlan) sheet.open(offerPlan, 'after-lead', offerPrefill); });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (sending) return;
      err.classList.remove('on');
      var name = v('fName'), email = v('fEmail'), phone = v('fPhone');
      if (name.length < 2) return fail('name');
      var hasEmail = /^\S+@\S+\.\S+$/.test(email), hasPhone = phone.replace(/\D/g, '').length >= 6;
      if (!email && !phone) return fail('contact');
      if (email && !hasEmail) return fail('email');
      if (!hasEmail && !hasPhone) return fail('contact');

      sending = true;
      var goText = go.querySelector('b'), restText = goText ? goText.textContent : '';
      go.style.opacity = .6; go.style.pointerEvents = 'none'; go.classList.add('busy');
      if (goText && form.getAttribute('data-sending')) goText.textContent = form.getAttribute('data-sending');
      var picked = service();
      boomTrack('generate_lead', { channel: 'form', source_page: C.SLUG });
      boomTrack('door_prefill', { market: C.SLUG, plan: picked || 'none', from: form.getAttribute('data-plan-from') || 'none' });
      postJson(C.LEAD_ENDPOINT || '/api/city-lead', {
        city: C.SLUG,
        name: name, email: email, phone: phone,
        moveIn: v('fMoveIn'), budget: v('fBudget'), service: picked,
        situation: v('fSituation'), areas: v('fAreas'), message: v('fMsg'),
        /* what the Check-in learned, if they used it (the server prints it
           in the operator's summary; empty otherwise) */
        checkin: v('fCheckin'), dossier: v('fDossier'),
        requestId: requestId,
        company: v('fCompany')
      })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || 'failed');
          form.classList.add('hidden');
          var done = $('fDone');
          done.classList.add('on');
          /* who writes, when: computed against the desk clock, never a static promise */
          var w = $('openWhen'), rw = desk && desk.replyWindow();
          if (w && rw) w.textContent = rw;
          miniBoard('flapDone');
          /* the form left; focus moves onto the open file so it is read, not lost on <body> */
          try { done.focus({ preventScroll: true }); } catch (e) {}
          boomTrack('sign_up', { method: 'city_form', market: C.SLUG });
          /* the till, after the file: the service they chose, their name and
             email already in the sheet. "Not sure yet" gets no offer — they
             asked for advice, not a checkout. */
          var offer = $('payOffer'), pk = planOf(picked);
          if (offer && sheet && pk && offerBtn) {
            $('payOfferAmt').textContent = eur(pk.eur);
            offerBtn.setAttribute('data-pay', picked);
            /* the refund rule is Full Search's promise: under another plan it would read as theirs */
            var ofr = $('payOfferRefund'); if (ofr) ofr.hidden = picked !== 'full-search';
            offerPlan = picked; offerPrefill = { name: name, email: email, phone: phone };
            offer.hidden = false;
          }
        })
        .catch(function () {
          sending = false;
          go.style.opacity = 1; go.style.pointerEvents = ''; go.classList.remove('busy');
          if (goText) goText.textContent = restText;
          fail('net');
        });
    });
    /* the button is served disabled: without this script a submit would be a
       GET to the page with the contact data in the address bar */
    go.disabled = false;
  }

  /* ── the paid landing: Stripe sends the client back to ?paid=<plan> ────
     Shown only where the till exists and the plan is one of ours; the
     purchase event fires once per session id — the key lives in
     sessionStorage for the tab's life, never on the device (ePrivacy 5(3):
     the page keeps nothing of the visitor beyond the session). */
  (function () {
    if (C.CHECKOUT !== true || !form) return;
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var plan = q.get('paid'), sid = q.get('session_id') || '', pp = planOf(plan);
    if (!pp) return;
    var card = $('fPaid');
    if (!card) return;
    form.classList.add('hidden');
    /* the short condition: the invoice and the refund rule are in the email; the card stays a glance */
    $('paidPlan').textContent = pp.label + ' · ' + eur(pp.eur) + ' · ' + pp.condition;
    /* no "start now" tick: the work begins when the 14-day withdrawal period ends — say so */
    if (q.get('start') === '0' && card.getAttribute('data-wait')) {
      var wait = document.createElement('p'); wait.className = 'wait'; wait.id = 'paidWait';
      wait.textContent = card.getAttribute('data-wait');
      $('paidPlan').parentNode.insertBefore(wait, $('paidPlan').nextSibling);
      /* the wait note takes the place of the generic one: one sentence about what happens, not two */
      if ($('paidText')) $('paidText').hidden = true;
      /* and the three steps of a payer who waits: never "same working day" */
      var steps = $('paidNext') ? $('paidNext').querySelectorAll('li') : [];
      (C.PAID_WAIT_NEXT || []).forEach(function (pair, i) {
        var li = steps[i]; if (!li) return;
        var b = li.querySelector('b'), sp = li.querySelector('span');
        if (b) b.textContent = pair[0];
        if (sp) sp.textContent = pair[1];
      });
    }
    card.classList.add('on');
    miniBoard('flapPaid');
    var key = 'boom:paid:' + (sid || plan), seen = false;
    try { seen = !!sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); } catch (e) {}
    /* the Stripe session id names a payer: GA gets an opaque hash of it (FNV-1a), never the id */
    var h = 0x811c9dc5;
    for (var hi = 0; hi < sid.length; hi++) { h ^= sid.charCodeAt(hi); h = Math.imul(h, 0x01000193) >>> 0; }
    if (!seen) boomTrack('purchase', { transaction_id: 'city_' + C.SLUG + '_' + (sid ? ('0000000' + h.toString(16)).slice(-8) : Date.now().toString(36)), currency: 'EUR', value: pp.eur, items: [{ item_id: 'city_' + C.SLUG + '_' + plan, item_name: pp.label, price: pp.eur, quantity: 1 }], market: C.SLUG });
    try { history.replaceState(null, '', location.pathname + '#contact'); } catch (e) {}
    setTimeout(function () { try { $('contact').scrollIntoView({ block: 'start' }); try { card.focus({ preventScroll: true }); } catch (e2) {} } catch (e) {} }, 50);
  })();

  /* ── ONE DOM, two places. The build prints the pass right after the
     Check-in: the phone's reading order IS the focus order (a sighted
     keyboard user and a screen reader meet the ticket where it appears,
     not after the facts). At ≥920 the pass moves to the top of the right
     column, above the door. A node move keeps its state and listeners. ── */
  var deskMq = matchMedia('(min-width:920px)');
  (function () {
    var pass = $('pass'), right = document.querySelector('.hero-right'), ck = $('checkin');
    if (!pass || !right || !ck) return;
    function place() {
      var where = deskMq.matches ? 'right' : 'left';
      if (where === 'right' && pass.parentNode === right) return;
      if (where === 'left' && ck.nextElementSibling === pass) return;
      /* a move re-inserts the node: the focused control inside it would
         blur and the entrance animation would replay — keep the one, skip
         the other (the pass has entered already) */
      var focused = document.activeElement && pass.contains(document.activeElement) ? document.activeElement : null;
      pass.classList.remove('in');
      if (where === 'right') right.insertBefore(pass, right.firstChild); else ck.insertAdjacentElement('afterend', pass);
      if (focused) { try { focused.focus({ preventScroll: true }); } catch (e) {} }
    }
    place();
    try { deskMq.addEventListener('change', place); } catch (e) { try { deskMq.addListener(place); } catch (e2) {} }
  })();

  /* ══ THE CHECK-IN — the live pass ═══════════════════════════════════════
     Three taps (stage · where · when) → the plan the RULES give (the same
     rules the build derived the FAQ answer from), on the pass, as soon as
     the rules can know it; the papers after the third tap; the answers in
     the URL and, with the visitor's consent to share, in a link. */
  var CK = (function () {
    var root = $('checkin'), pass = $('pass');
    if (!K || !root || !pass) return null;
    var STEPS = ['stage', 'where', 'when'];
    var touchedDocs = false, editing = null, started = false, lastPlan = null, lastKind = 'blank', boardMounted = false, viewedPlan = null, entered = false;
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
    var docsHeld = function () { return [].map.call(pass.querySelectorAll('input[name="ck-doc"]:checked'), function (i) { return i.value; }); };
    var sell = C.CHECKOUT === true;

    /* where are we: blank · pending (a stage the rules cannot resolve yet) ·
       resolved (plan known) · complete (the three answers) */
    function state() {
      var st = answer('stage'), wh = answer('where'), wn = answer('when');
      if (!st) return { kind: 'blank' };
      var r = rule(st, wh);
      if (!r) return { kind: 'pending', stage: st, st: st, wh: wh, wn: wn };
      return { kind: wn ? 'complete' : 'resolved', st: st, wh: wh, wn: wn, rule: r, plan: PLANS[r.plan], planId: r.plan };
    }

    /* the steps appear one after the other; an answered one folds unless it is being changed */
    function sync() {
      var ready = true, n = 1, firstOpen = null;
      STEPS.forEach(function (id, i) {
        var el = stepEl(id), a = answer(id);
        el.hidden = !ready;
        var done = !!a && editing !== id;
        el.classList.toggle('done', done);
        var cb = el.querySelector('.ck-change'); if (cb) cb.hidden = !done;
        [].forEach.call(el.querySelectorAll('.ck-opt'), function (l) { l.classList.toggle('on', !!a && l.querySelector('input').checked); });
        if (!a && ready && firstOpen === null) firstOpen = i;
        if (!a) ready = false;
      });
      n = firstOpen === null ? 3 : firstOpen + 1;
      setText('ckNum', K.num.replace('{n}', String(n)));
    }

    /* the link that carries the answers: #checkin=<stage>.<where>.<when>.<docs>[.<via>]
       (docs = hex bitmask over the eight documents, '-' when untouched or
       when the link is for someone else: papers are personal) */
    function mask() {
      var m = 0;
      K.dossier.items.forEach(function (it, i) { if (docsHeld().indexOf(it.id) > -1) m |= (1 << i); });
      return m;
    }
    function hashOf(via) {
      var own = !via || via === 'l';
      return [answer('stage') || '-', answer('where') || '-', answer('when') || '-', touchedDocs && own ? mask().toString(16) : '-'].join('.') + (via ? '.' + via : '');
    }
    function readHash() {
      var m = /(?:^|[#&])checkin=([a-z-]+)\.([a-z-]+)\.([a-z-]+)\.([0-9a-f]{1,2}|-)(?:\.([lwcdp]))?(?:$|&)/.exec(location.hash || '');
      if (!m) return null;
      var vals = { stage: m[1], where: m[2], when: m[3] }, answered = 0;
      STEPS.forEach(function (id) {
        var r = vals[id] !== '-' ? root.querySelector('input[name="ck-' + id + '"][value="' + vals[id] + '"]') : null;
        if (r) { r.checked = true; answered++; }
      });
      var via = m[5] || '';
      var own = !via || via === 'l';
      if (m[4] !== '-' && own) {
        touchedDocs = true;
        var mk = parseInt(m[4], 16);
        K.dossier.items.forEach(function (it, i) { var cb = pass.querySelector('input[name="ck-doc"][value="' + it.id + '"]'); if (cb) cb.checked = !!(mk & (1 << i)); });
      }
      return { answered: answered, via: via, docs: m[4] !== '-' };
    }
    function remember() {
      if (!answer('stage')) return;
      try { history.replaceState(null, '', location.pathname + location.search + '#checkin=' + hashOf()); } catch (e) {}
    }
    var shareUrl = function (via) { return (C.PAGE_URL || location.origin + location.pathname) + '#checkin=' + hashOf(via); };
    var shareText = function (which, via) { return K.share[which].replace('{city}', C.CITY).replace('{url}', shareUrl(via)); };

    /* one same-document view transition around a swap of the steps and the
       pass; a plain swap where the API is absent, hidden or motion is off */
    function swap(fn, plain) {
      if (!plain && document.startViewTransition && !ridotto && !document.hidden) {
        try { document.startViewTransition(function () { fn(); }); return; } catch (e) {}
      }
      fn();
    }

    var papersLine = function () {
      var held = docsHeld(), N = K.dossier.items.length;
      if (!touchedDocs && !held.length) return { text: K.dossier.skipped, pct: 0, short: '—', field: '' };
      if (held.length === N) return { text: K.dossier.resultAll, pct: 100, short: held.length + ' of ' + N, field: held.length + '/' + N };
      var missing = K.dossier.items.filter(function (it) { return held.indexOf(it.id) < 0; }).map(function (it) { return it.t; });
      return { text: K.dossier.resultSome.replace('{have}', String(held.length)).replace('{missing}', missing.join(', ')), pct: Math.round(held.length / N * 100), short: held.length + ' of ' + N, field: held.length + '/' + N + ' · missing: ' + missing.join(', ') };
    };

    function render(opts) {
      opts = opts || {};
      var s = state();
      var wasHidden = pass.getAttribute('data-state') === 'blank' && getComputedStyle(pass).display === 'none';
      swap(function () {
        /* the one small live region: the plan once per plan, the pending
           sentence once — never the whole box (sixteen controls and ten
           fragments re-announced on every tick) */
        var live = $('ckLive');
        sync();
        pass.setAttribute('data-state', s.kind);
        /* the four bodies of the pass: the hidden attribute is the truth
           (the first CSS rule makes [hidden] win over any state rule) */
        if ($('ckBlank')) $('ckBlank').hidden = s.kind !== 'blank';
        if ($('ckPend')) $('ckPend').hidden = s.kind !== 'pending';
        if ($('ckPlanBox')) $('ckPlanBox').hidden = !(s.kind === 'resolved' || s.kind === 'complete');
        if ($('ckPapers')) $('ckPapers').hidden = s.kind !== 'complete';
        if (s.kind === 'pending') {
          setText('ckPendText', (C.PENDING || {})[s.stage] || '');
          setText('ckCode', optOf('stage', s.st).code);
          if (live) setText('ckLive', (C.PENDING || {})[s.stage] || '');
        }
        if (s.kind === 'blank' && live) setText('ckLive', '');
        if (s.kind === 'resolved' || s.kind === 'complete') {
          var p = s.plan, r = s.rule;
          var code = [optOf('stage', s.st).code, s.wh ? optOf('where', s.wh).code : null, s.wn ? optOf('when', s.wn).code : null].filter(Boolean).join(' · ');
          setText('ckCode', code);
          setText('ckPlan', p.label);
          setText('ckCond', p.condition);
          setText('ckWhy', r.why);
          var refund = $('ckRefund'); if (refund) refund.hidden = s.planId !== 'full-search';
          setText('ckCondLong', p.conditionLong);
          /* the price on its board, flipped once per plan; the board is
             decorative, the amount is read from the text beside it */
          setText('ckPriceSr', eur(p.eur) + (p.unit ? ' ' + p.unit : ''));
          if (lastPlan !== s.planId) {
            mountBoard($('ckPrice'), eur(p.eur), ' €,.0123456789', 60); lastPlan = s.planId;
            if (live) setText('ckLive', p.label + ', ' + eur(p.eur) + ', ' + p.condition);
          }
          /* the note after the third tap: the when note, or the refusal for zero + soon */
          var note = $('ckNote');
          if (s.kind === 'complete') {
            var noteText = (s.st === 'zero' && s.wn === 'soon') ? K.refusal : K.notes.when[s.wn];
            if (live && note.textContent !== noteText) setText('ckLive', p.label + ', ' + eur(p.eur) + '. ' + noteText);
            note.textContent = noteText;
            note.hidden = false;
          } else note.hidden = true;
          /* the papers */
          var pl = papersLine();
          setText('ckReady', pl.text);
          var meter = $('ckMeter'); if (meter) { meter.style.setProperty('--meter', pl.pct + '%'); meter.style.width = pl.pct + '%'; }
          setText('ckPassPapers', pl.short);
          setText('ckPassWhen', s.wn ? optOf('when', s.wn).t : '—');
          setText('ckPassFile', code);
          /* the doors, pointed at this plan */
          var start = $('ckStart');
          if (start) { start.setAttribute('data-pay', s.planId); setText('ckStartAmt', eur(p.eur)); }
          var file = $('ckFile'); if (file) file.setAttribute('data-service', s.planId);
          /* into the door: the chip, the plan line, the hidden fields. A chip
             the reader chose by hand (or from a plate) is theirs: the
             Check-in writes only where nothing or itself wrote before, and
             only when its plan changed — a paper tick is not a new plan */
          var from = form ? form.getAttribute('data-plan-from') : null;
          if (form && (!from || from === 'checkin') && (service() !== s.planId || from !== 'checkin')) {
            setPlan(s.planId, 'checkin');
            form.setAttribute('data-plan-from', 'checkin');
          }
          if ($('fCheckin')) $('fCheckin').value = [optOf('stage', s.st).t, s.wh ? optOf('where', s.wh).t : null, s.wn ? optOf('when', s.wn).t : null].filter(Boolean).join(' · ');
          if ($('fDossier')) $('fDossier').value = touchedDocs ? pl.field : '';
          /* the share row */
          var wa = $('ckWa'); if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(shareText('plan', 'w'));
          /* the strip names the plan, never the price */
          setText('stripSub', p.label + ' · ' + ($('paybar') && $('paybar').getAttribute('data-yourplan') || 'your plan'));
        } else {
          setText('stripSub', $('paybar') ? $('paybar').getAttribute('data-sub') || '' : '');
          /* back to blank or pending: a plan the Check-in had written into the
             door is no longer decided — it leaves (a chip the reader chose by
             hand stays theirs); the answered steps still travel in words */
          if (form && form.getAttribute('data-plan-from') === 'checkin') {
            [].forEach.call(form.querySelectorAll('input[name="service"]'), function (r) { r.checked = false; });
            form.removeAttribute('data-plan-from');
            paintPlanline();
          }
          if ($('fCheckin')) $('fCheckin').value = s.st ? [optOf('stage', s.st).t, s.wh ? optOf('where', s.wh).t : null].filter(Boolean).join(' · ') : '';
          setText('ckPriceSr', '');
        }
        /* the move-in month the page prefills from the third answer is marked
           as the page's own: it follows a changed answer and leaves with it;
           a month the reader picked is never touched */
        var mv = $('fMoveIn');
        if (mv && !mv.getAttribute('data-user')) {
          var want = s.kind === 'complete' ? (s.wn === 'soon' ? ymPlus(1) : s.wn === 'months' ? ymPlus(2) : '') : '';
          var auto = mv.getAttribute('data-auto') || '';
          if (!mv.value || (auto && mv.value === auto)) {
            if (want && [].some.call(mv.options, function (o) { return o.value === want && !o.disabled; })) { mv.value = want; mv.setAttribute('data-auto', want); }
            else if (auto && mv.value === auto) { mv.value = ''; mv.removeAttribute('data-auto'); }
          }
        }
        if (!boardMounted && s.kind !== 'blank') { boardMounted = true; mountBoard($('ckBoard'), String(C.WORD || C.CITY).toUpperCase(), ' ABCDEFGHIJKLMNOPQRSTUVWXYZ', 50); }
        if (s.kind !== 'blank' && !entered && !opts.landing) { entered = true; pass.classList.add('in'); }
        paintPass();
      }, !!opts.plain);
      /* the pass must land on the screen the visitor is looking at: scroll
         only when its bottom would fall below the fold, measured */
      if (!opts.landing && s.kind !== 'blank' && (wasHidden || opts.resolved)) {
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          /* layout geometry, not the painted rect: the entrance animation
             translates the card for 700 ms and a rect read mid-flight lands
             it a dozen pixels under the fold */
          var top = 0, el = pass; while (el) { top += el.offsetTop; el = el.offsetParent; }
          var bottom = top + pass.offsetHeight;
          var bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra')) || 80;
          /* the strip counts only when it is up: in the hero it never is */
          var strip = $('paybar'); var stripH = strip && strip.classList.contains('on') ? strip.offsetHeight : 0;
          var want = bottom - (innerHeight - stripH - 16);
          if (top - want < bar + 8) want = top - bar - 8;            /* never under the fixed bar */
          if (want > scrollY + 1) { try { scrollTo({ top: want, behavior: ridotto ? 'auto' : 'smooth' }); } catch (e) { scrollTo(0, want); } }
        }); });
      }
      if ((s.kind === 'resolved' || s.kind === 'complete') && (lastKind === 'blank' || lastKind === 'pending' || opts.resolved)) {
        boomTrack('checkin_result', { market: C.SLUG, plan: s.planId, stage: s.st, where: s.wh || '', when: s.wn || '', resolved_at_tap: s.wh && rule(s.st, null) == null ? 2 : 1, docs: touchedDocs ? docsHeld().length : -1 });
      }
      lastKind = s.kind;
      remember();
      return s;
    }

    /* the pass follows the name and the origin as they are typed */
    function paintPass() {
      var name = ($('ckName') && $('ckName').value || '').trim(), from = ($('ckOrigin') && $('ckOrigin').value || '').trim().toUpperCase();
      setText('ckPassenger', name || K.pass.guest);
      setText('ckFrom', from || '—');
    }

    /* ── the pass as an image: 1080×1920, drawn by ONE pure function — on an
       OffscreenCanvas in a Worker where the browser has it (the encode is
       the one interaction that can breach 200 ms on a mid-range phone),
       on the main thread behind a busy state otherwise. WebP where the
       browser encodes it (Safari returns PNG: the type is sniffed). ── */
    function drawPass(x, d, W, H) {
      function rr(X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
      var gold = '#FFD700', mono = 'ui-monospace, Menlo, Consolas, monospace', sans = '"Helvetica Neue", Helvetica, Arial, sans-serif';
      x.fillStyle = '#060607'; x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(255,215,0,.035)'; x.lineWidth = 1;
      for (var gx = 0; gx <= W; gx += 80) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
      for (var gy = 0; gy <= H; gy += 80) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
      var cx = 80, cw = W - 160, chh = 1180, cy = Math.round((H - chh) / 2) - 20, rad = 36;
      x.save(); rr(cx, cy, cw, chh, rad); x.clip();
      var bg = x.createLinearGradient(cx, cy, cx + cw, cy + chh); bg.addColorStop(0, '#101014'); bg.addColorStop(.72, '#080809'); bg.addColorStop(1, '#080809');
      x.fillStyle = bg; x.fillRect(cx, cy, cw, chh);
      x.save(); x.globalAlpha = .5;
      var mk = x.createRadialGradient(cx, cy, 40, cx, cy, cw * 1.1); mk.addColorStop(0, 'rgba(255,215,0,.14)'); mk.addColorStop(1, 'rgba(255,215,0,0)');
      x.strokeStyle = mk; x.lineWidth = 1;
      for (var dd = -chh; dd < cw + chh; dd += 18) { x.beginPath(); x.moveTo(cx + dd, cy); x.lineTo(cx + dd - chh * .47, cy + chh); x.stroke(); }
      for (var d2 = -chh; d2 < cw + chh; d2 += 28) { x.beginPath(); x.moveTo(cx + d2, cy); x.lineTo(cx + d2 + chh * .5, cy + chh); x.stroke(); }
      x.restore();
      var lam = x.createLinearGradient(0, cy, 0, cy + chh);
      [[0, '#7a5f16'], [.14, '#f6e27a'], [.32, '#8a6d1f'], [.48, '#fdf0a8'], [.63, '#b8942b'], [.78, '#f6e27a'], [1, '#6b5716']].forEach(function (s) { lam.addColorStop(s[0], s[1]); });
      x.fillStyle = lam; x.fillRect(cx, cy, 44, chh);
      x.save(); x.translate(cx + 22, cy + chh / 2); x.rotate(-Math.PI / 2);
      x.fillStyle = 'rgba(20,16,5,.9)'; x.font = '800 15px ' + sans; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(('BOOM · ' + d.side + ' · ').toUpperCase().repeat(4).split('').join(String.fromCharCode(8202)), 0, 0);
      x.restore();
      x.restore();
      rr(cx, cy, cw, chh, rad); x.strokeStyle = 'rgba(255,215,0,.28)'; x.lineWidth = 2; x.stroke();
      var L = cx + 44 + 64, Rr = cx + cw - 64, y = cy + 92;
      try {
        if (d.pathD && typeof Path2D === 'function') {
          var P = new Path2D(d.pathD);
          x.save(); x.translate(L, y - 46); x.scale(76 / 1024, 76 / 1024); x.translate(0, 1024); x.scale(0.1, -0.1); x.fillStyle = gold; x.fill(P); x.restore();
        }
      } catch (e) {}
      x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      x.fillStyle = gold; x.font = '600 22px ' + mono;
      x.fillText('B O O M  ·  B O A R D I N G   P A S S', L + 96, y);
      y += 150; x.fillStyle = '#FFF'; x.font = '300 118px ' + sans;
      var fw = 0;
      if (d.from) { x.fillText(d.from, L, y); fw = x.measureText(d.from).width + 34; }
      x.fillStyle = gold; x.font = '300 60px ' + sans; x.fillText('✈', L + fw, y - 8);
      x.font = '300 118px ' + sans; x.fillText(d.iata || '', L + fw + 86, y);
      y += 70; var cellW = 64, cellH = 86, gap = 8;
      x.font = '300 56px ' + sans; x.textAlign = 'center';
      for (var i = 0; i < d.word.length; i++) {
        var X = L + i * (cellW + gap);
        rr(X, y, cellW, cellH, 8); x.fillStyle = '#040404'; x.fill();
        x.fillStyle = '#121214'; rr(X, y, cellW, cellH / 2, 8); x.fill();
        x.fillStyle = '#FFE55C'; x.textBaseline = 'middle'; x.fillText(d.word[i], X + cellW / 2, y + cellH / 2 + 2);
        x.fillStyle = 'rgba(0,0,0,.85)'; x.fillRect(X, y + cellH / 2 - 1.5, cellW, 3);
      }
      x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      y += cellH + 92;
      var rows = [[d.F.passenger, d.name], [d.F.plan, d.plan], [d.F.price, d.price], [d.F.boarding, d.when], [d.F.file, d.code], [d.F.papers, d.papers]];
      var colW = (Rr - L) / 2;
      rows.forEach(function (row, idx) {
        var X = L + (idx % 2) * colW, Y = y + Math.floor(idx / 2) * 150;
        x.fillStyle = 'rgba(255,255,255,.3)'; x.font = '400 18px ' + mono; x.fillText(String(row[0]).toUpperCase().split('').join(' '), X, Y);
        x.fillStyle = '#FFF';
        var v = String(row[1] || '—'), fsz = 36;
        x.font = '300 ' + fsz + 'px ' + sans;
        while (x.measureText(v).width > colW - 40 && fsz > 22) { fsz -= 2; x.font = '300 ' + fsz + 'px ' + sans; }
        while (x.measureText(v).width > colW - 40 && v.length > 3) v = v.slice(0, -2) + '…';
        x.fillText(v, X, Y + 50);
      });
      y += 3 * 150 + 10;
      x.save(); x.setLineDash([10, 10]); x.strokeStyle = 'rgba(250,250,250,.22)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + 44, y); x.lineTo(cx + cw, y); x.stroke(); x.restore();
      x.fillStyle = '#060607'; x.beginPath(); x.arc(cx + 44, y, 22, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(cx + cw, y, 22, 0, Math.PI * 2); x.fill();
      y += 80;
      x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '300 20px ' + sans;
      var line = String(d.line || ''), lw = Rr - L, wordsArr = line.split(' '), cur = '', ly = y;
      wordsArr.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > lw) { x.fillText(cur, L, ly); ly += 30; cur = w; } else cur = t; });
      if (cur) x.fillText(cur, L, ly);
      x.fillStyle = 'rgba(255,255,255,.3)'; x.font = '400 19px ' + mono; x.fillText(String(d.foot).toUpperCase().split('').join(' '), L, ly + 60);
      x.textAlign = 'right'; x.fillStyle = '#3ddc97'; x.fillText(String(d.side).toUpperCase().split('').join(' '), Rr, ly + 60);
      x.textAlign = 'left';
      x.fillStyle = 'rgba(255,255,255,.26)'; x.font = '400 20px ' + mono; x.textAlign = 'center';
      x.fillText(String(d.pageUrl || '').replace(/^https:\/\/(www\.)?/, '').toUpperCase().split('').join(' '), W / 2, cy + chh + 70);
    }
    function passData() {
      var s = state(), p = s.plan || null, F = K.pass.fields;
      var pathEl = document.querySelector('#boomMark path');
      var pl = papersLine();
      return {
        word: String(C.WORD || C.CITY).toUpperCase(), iata: C.IATA || '', side: K.pass.side, foot: K.pass.foot, pageUrl: C.PAGE_URL || '',
        from: ($('ckOrigin') && $('ckOrigin').value || '').trim().toUpperCase(),
        name: ($('ckName') && $('ckName').value || '').trim() || K.pass.guest,
        plan: p ? p.label : '—', price: p ? eur(p.eur) + (p.unit ? ' ' + p.unit : '') : '—',
        when: s.wn ? optOf('when', s.wn).t : '—',
        code: $('ckCode') ? $('ckCode').textContent : '—',
        papers: touchedDocs ? pl.short : '—',
        line: p ? (s.planId === 'full-search' && sell && C.REFUND ? C.REFUND : p.conditionLong) : '',
        F: F, pathD: pathEl ? pathEl.getAttribute('d') : ''
      };
    }
    var worker = null, workerDead = false, reqSeq = 0, pendingReq = {}, inflight = null;
    function getWorker() {
      if (worker || workerDead) return worker;
      if (!window.Worker || !window.OffscreenCanvas || !window.Blob || !window.URL) { workerDead = true; return null; }
      try {
        var src = 'var draw=' + drawPass.toString() + ';onmessage=function(e){var m=e.data;try{var cv=new OffscreenCanvas(m.W,m.H);draw(cv.getContext("2d"),m.d,m.W,m.H);cv.convertToBlob({type:m.type,quality:.9}).then(function(b){postMessage({id:m.id,ok:true,blob:b})},function(){postMessage({id:m.id,ok:false})})}catch(err){postMessage({id:m.id,ok:false})}};';
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        /* one listener for the worker's life: each reply names its request */
        worker.onmessage = function (e) { var m = e.data || {}; var cb = pendingReq[m.id]; if (cb) cb(m.ok ? m.blob : null); };
        worker.onerror = function () { workerDead = true; worker = null; };
      } catch (e) { workerDead = true; worker = null; }
      return worker;
    }
    function mainThreadBlob(d) {
      return new Promise(function (resolve) {
        var cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920;
        drawPass(cv.getContext('2d'), d, 1080, 1920);
        cv.toBlob(function (b) { resolve(b); }, 'image/webp', .9);
      });
    }
    function passBlob() {
      /* a second Save or Share while one encodes joins it: never a stale
         image, never a second file four seconds later */
      if (inflight) return inflight;
      var d = passData();
      var w = getWorker();
      var p = w ? new Promise(function (resolve) {
        var id = ++reqSeq, done = false, to = null;
        var fin = function (b) { if (done) return; done = true; if (to) clearTimeout(to); delete pendingReq[id]; resolve(b); };
        to = setTimeout(function () { workerDead = true; worker = null; fin(null); }, 4000);
        pendingReq[id] = fin;
        try { w.postMessage({ id: id, W: 1080, H: 1920, d: d, type: 'image/webp' }); } catch (e) { fin(null); }
      }) : Promise.resolve(null);
      inflight = p.then(function (b) { return b || mainThreadBlob(d); }).then(function (b) {
        inflight = null;
        if (!b) return null;
        var ext = b.type === 'image/webp' ? 'webp' : 'png';
        return { blob: b, ext: ext, name: 'boom-' + C.SLUG + '-boarding-pass.' + ext };
      }, function () { inflight = null; return null; });
      return inflight;
    }
    function savePass() {
      pass.classList.add('busy');
      return passBlob().then(function (r) {
        pass.classList.remove('busy');
        if (!r) return;
        var a = document.createElement('a'), u = URL.createObjectURL(r.blob);
        a.href = u; a.download = r.name; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { URL.revokeObjectURL(u); a.remove(); } catch (e) {} }, 2000);
        var s = $('ckSaved'); if (s) { s.textContent = pass.getAttribute('data-saved') || ''; setTimeout(function () { s.textContent = ''; }, 2400); }
        boomTrack('pass_save', { market: C.SLUG, format: r.ext, fields_filled: (($('ckName').value ? 1 : 0) + ($('ckOrigin').value ? 1 : 0)) });
      });
    }
    function sharePass() {
      var text = shareText('pass', 'p');
      pass.classList.add('busy');
      return passBlob().then(function (r) {
        pass.classList.remove('busy');
        var file = r && window.File ? new File([r.blob], r.name, { type: r.blob.type }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          boomTrack('pass_share', { market: C.SLUG, method: 'files' });
          return navigator.share({ files: [file], title: 'BOOM ' + C.CITY, text: text }).catch(function () {});
        }
        if (navigator.share) {
          boomTrack('pass_share', { market: C.SLUG, method: 'url' });
          return navigator.share({ title: 'BOOM ' + C.CITY, text: text, url: shareUrl('p') }).catch(function () {});
        }
        boomTrack('pass_share', { market: C.SLUG, method: 'download' });
        return savePass();
      });
    }
    function copyLink() {
      var url = shareUrl('l'), done = function () {
        var s = $('ckCopied'); if (s) { s.textContent = pass.getAttribute('data-copied') || ''; setTimeout(function () { s.textContent = ''; }, 2400); }
        boomTrack('link_copy', { market: C.SLUG, where: 'pass' });
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
      var m = /^ck-(stage|where|when)$/.exec(e.target && e.target.name || '');
      if (!m) return;
      if (!started) { started = true; boomTrack('checkin_start', { market: C.SLUG, landing_state: landingState }); }
      /* the radio is already checked when change fires: the kind BEFORE the
         tap is the one render remembered, not state() now */
      var before = lastKind;
      editing = null;
      var s = render({ resolved: before === 'blank' || before === 'pending' });
      boomTrack('checkin_answer', { market: C.SLUG, step: m[1], value: e.target.value, kind: s.kind });
    });
    root.addEventListener('click', function (e) {
      var b = e.target && e.target.closest('.ck-change');
      if (b) {
        editing = b.getAttribute('data-change');
        sync();
        try { stepEl(editing).querySelector('input:checked, input').focus({ preventScroll: true }); } catch (err) {}
        return;
      }
      /* "change", then the same answer again: an already-checked radio fires
         no change event, so the step folds from here */
      var opt = e.target && e.target.closest('.ck-opt');
      if (opt && editing && opt.closest('.ck-step') === stepEl(editing)) {
        var inp = opt.querySelector('input');
        if (inp && inp.checked) { editing = null; sync(); }
      }
    });
    pass.addEventListener('change', function (e) {
      /* a tick is a plain swap: a view transition here puts an overlay over
         the page for ~370 ms and the next tick lands on it */
      if (e.target && e.target.name === 'ck-doc') { touchedDocs = true; render({ plain: true }); }
    });
    var mvEl = $('fMoveIn');
    /* touched by the reader (a month, or back to "not sure yet"): theirs from then on */
    if (mvEl) mvEl.addEventListener('change', function () { mvEl.removeAttribute('data-auto'); mvEl.setAttribute('data-user', '1'); });
    $('ckCopy').addEventListener('click', copyLink);
    $('ckWa').addEventListener('click', function () { boomTrack('pass_share', { market: C.SLUG, method: 'whatsapp' }); });
    $('ckSave').addEventListener('click', savePass);
    $('ckShare').addEventListener('click', sharePass);
    ['ckName', 'ckOrigin'].forEach(function (id) { $(id).addEventListener('input', paintPass); });
    var skip = document.querySelector('.skipck');
    if (skip) skip.addEventListener('click', function () { boomTrack('checkin_skip', { market: C.SLUG }); });
    /* the plan seen: fires once per plan when the plan line is fully on
       screen (the whole pass, complete, is taller than a phone) */
    if ('IntersectionObserver' in window && $('ckPlan')) {
      new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          var s = state();
          if (en.isIntersecting && s.planId && viewedPlan !== s.planId) { viewedPlan = s.planId; boomTrack('checkin_result_view', { market: C.SLUG, plan: s.planId }); }
        });
      }, { threshold: 1 }).observe($('ckPlan'));
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden' || !started) return;
      var s = state();
      if (s.kind !== 'complete') boomTrack('checkin_abandon', { market: C.SLUG, last_step: answer('when') ? 'when' : answer('where') ? 'where' : answer('stage') ? 'stage' : 'none', docs_ticked: docsHeld().length, unresolved: s.kind === 'pending' });
    });

    /* a link with answers lands on them: partial → the next step with the
       known ones ticked and a banner; complete from someone else → the
       ticket and "your friend's answers"; the visitor's own copy link →
       the ticket with the papers */
    var landingState = 'cold';
    var h = readHash();
    if (h && h.answered) {
      var s0 = render({ landing: true });
      var banner = $('ckLanding');
      var received = !!(h.via && h.via !== 'l');
      if (!received) {
        /* no via: the visitor's own answers, back from a reload or a kept
           tab — restored in silence */
        landingState = s0.kind === 'complete' ? 'resume_complete' : 'resume';
      } else if (s0.kind !== 'complete') {
        landingState = 'deeplink_partial';
        /* the taps left are to the PLAN: none when it already prints */
        var partial = K.landing.partial.replace('{n}', String(h.answered));
        banner.textContent = s0.kind === 'pending' ? partial.replace('{left}', 'One tap') : partial.split(/\.\s/)[0] + '.';
        banner.hidden = false;
      } else {
        landingState = 'deeplink_complete';
        banner.textContent = K.landing.friend;
        banner.hidden = false;
      }
      boomTrack(received ? 'deeplink_landing' : 'checkin_resume', { market: C.SLUG, answered: h.answered, docs_present: h.docs, via: h.via || 'none' });
    } else {
      /* a #checkin= that reads as nothing (a broken or foreign link) leaves
         the address bar clean: the first step is the honest landing */
      if (/^#checkin=/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
      sync();
    }
    /* on a wide screen the pass is on the page from load, blank: its city
       board too — and when a phone turns into a desk before the first tap */
    var mountBlank = function () { if (!boardMounted && getComputedStyle(pass).display !== 'none') { boardMounted = true; mountBoard($('ckBoard'), String(C.WORD || C.CITY).toUpperCase(), ' ABCDEFGHIJKLMNOPQRSTUVWXYZ', 50); } };
    mountBlank();
    try { deskMq.addEventListener('change', mountBlank); } catch (e) { try { deskMq.addListener(mountBlank); } catch (e2) {} }
    return { state: state, render: render, hash: hashOf, shareUrl: shareUrl, passBlob: passBlob, drawPass: drawPass, passData: passData };
  })();
  window.BOOM_CHECKIN = CK;

  /* ── chrome: scrolled nav, burger ───────────────────────────────────── */
  (function () {
    var nav = $('nav');
    addEventListener('scroll', function () { if (nav) nav.classList.toggle('scrolled', scrollY > 30); }, { passive: true });
    var t = $('navToggle'), m = $('mobileMenu');
    if (t && m) {
      /* closed, the slid-away menu is out of the tab order and the tree
         (inert + aria-hidden; the CSS adds visibility for older engines);
         open, focus moves to its first link, Escape closes and gives focus
         back to the burger; the consent plate hides while it is open */
      var setMenu = function (open) {
        t.classList.toggle('active', open); m.classList.toggle('active', open);
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
        m.setAttribute('aria-hidden', open ? 'false' : 'true');
        try { m.inert = !open; } catch (e) {}
        document.body.style.overflow = open ? 'hidden' : '';
        document.body.classList.toggle('menu-open', open);
        if (open) { var first = m.querySelector('a'); if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 420); }
        else if (document.activeElement && m.contains(document.activeElement)) { try { t.focus(); } catch (e) {} }
      };
      setMenu(false);
      t.addEventListener('click', function () { setMenu(!m.classList.contains('active')); });
      [].forEach.call(m.querySelectorAll('a'), function (a) { a.addEventListener('click', function () { setMenu(false); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && m.classList.contains('active')) setMenu(false); });
    }
    [].forEach.call(document.querySelectorAll('.faq details'), function (d, i) {
      d.addEventListener('toggle', function () { if (d.open) boomTrack('faq_open', { market: C.SLUG, question_index: i }); });
    });
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

  /* ── the strip: the one door on a phone, past the hero, never over the
     door itself nor while the till is open; no price ── */
  (function () {
    var bar = $('paybar'), hero = document.querySelector('.hero'), door = $('contact');
    if (!bar || !hero) return;
    var doorIn = false;
    if (door && 'IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (e) { doorIn = e.isIntersecting; }); upd(); }, { threshold: .15 }).observe(door);
    function upd() { bar.classList.toggle('on', hero.getBoundingClientRect().bottom < 0 && !doorIn && !dialogOpen()); }
    addEventListener('scroll', upd, { passive: true }); upd();
    /* the till closing is not a scroll: the strip comes back on its own */
    if (ov) ov.addEventListener('close', function () { setTimeout(upd, 0); });
    var g = $('stripGo'); if (g) g.addEventListener('click', function () { boomTrack('paybar_click', { market: C.SLUG, plan: service() || 'none' }); });
  })();

  boomTrack('page_view_market', { market: C.SLUG });
})();
