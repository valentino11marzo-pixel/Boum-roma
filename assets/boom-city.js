/* assets/boom-city.js — the city pages (reads window.BOOM_CITY, posts to
   our /api/city-lead; CLAUDE.md v1.4). DOM order is reading order. The
   ticket: blank → standby → open (a 200, the server's file) → paid (GET
   ?paid= says paid:true). The checked chip is the plan. */
(function () {
  'use strict';
  var C = window.BOOM_CITY || {};
  var PLANS = C.PLANS || {};
  var K = C.CHECKIN || null;
  var D = C.DESK || null;
  var I = C.ISSUE || (K && K.pass) || {};
  var DASH = '—';
  var $ = function (id) { return document.getElementById(id); };
  function boomTrack(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} }
  var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BS = window.BoomSolari;
  var eur = function (n) { return '€' + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var setText = function (id, t) { var el = $(id); if (!el) return; var v = t == null ? '' : String(t); if (el.textContent !== v) el.textContent = v; };
  /* PLANS is plain data: an inherited key (?paid=constructor) is not a plan */
  var planOf = function (id) { return id && Object.prototype.hasOwnProperty.call(PLANS, id) ? PLANS[id] : null; };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var sell = C.CHECKOUT === true;
  /* a POST that never answers must not lock a button for the tab's life:
     20 s, then the send fails in place and the button comes back */
  function postJson(url, body, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 20000);
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(to); return r.json(); }, function (e) { clearTimeout(to); throw e; });
  }
  /* a Solari board: built once, then only the changed cells flip; under
     reduced motion the cells are set, never spun */
  function flap(host, word, drum, ref) {
    if (!host) return null;
    if (!BS) { host.textContent = word; return null; }
    if (!ref || ref.cells.length !== word.length) {
      var b = new BS.Board(host, word.length, drum);
      b.target = word;
      if (ridotto) b.show(word);
      /* each cell reads the board's CURRENT target when its turn comes: a word
         changed before the first spin ends (STANDBY → PAID) is never overwritten */
      else b.cells.forEach(function (c, i) { setTimeout(function () { c.go(b.target[i] || ' ', drum); }, i * 60); });
      return b;
    }
    ref.target = word;
    if (ridotto) ref.cells.forEach(function (c, i) { c.set(word[i] || ' '); }); else ref.update(word);
    return ref;
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
  /* "no card · same-day reply" while the desk is open; closed, every
     [data-door-sub] and the strip say the window the OPEN card computes */
  var deskSub = (function () {
    var bar = $('paybar');
    var lead = C.DOOR_SUB_LEAD || 'free';
    var smalls = [].map.call(document.querySelectorAll('[data-door-sub]'), function (el) { return el.querySelector('small'); }).filter(Boolean);
    var open = { sub: smalls[0] ? smalls[0].textContent : '', strip: bar ? bar.getAttribute('data-sub') || '' : '' };
    var last = null;
    function sync() {
      if (!desk) return;
      var closed = desk.open() === false, rw = closed ? desk.replyWindow() : null;
      var sub = closed && rw ? lead + ' · ' + rw : null;
      if (sub === last) return;
      last = sub;
      smalls.forEach(function (sm) { sm.textContent = sub || open.sub; });
      if (bar) {
        bar.setAttribute('data-sub', sub || open.strip);
        /* the strip's line is rewritten only while it shows the default (a plan named there stays) */
        var st = $('stripSub'); if (st && st.textContent.indexOf(lead + ' · ') === 0) setText('stripSub', sub || open.strip);
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
  /* the ticket, filled in below (null where the page has no Check-in) */
  var T = null;
  /* one request id per load: a retried send files the same lead; the till carries the file */
  var requestId = (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^a-z0-9]/g, '');
  var fileRef = '';
  /* the plan line reads the checked chip: the questions write it, a plate's
     link writes it, the visitor can change it under "change" */
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
    /* a printed ticket follows the chip; a chip never prints one */
    if (T) T.refresh();
  }
  if (planline) {
    var sum = planline.querySelector('summary');
    planline.setAttribute('data-none', $('plText').textContent);
    planline.setAttribute('data-unsure', (function () { var u = form.querySelector('.chip.unsure b'); return u ? u.textContent + ' · ' + form.querySelector('.chip.unsure small').textContent : 'Not sure yet'; })());
    planline.setAttribute('data-from', planline.getAttribute('data-from') || '');
    /* a chip the reader taps is theirs: from then on no render overwrites it;
       a printed ticket follows it (and the Check-in may suggest another) */
    form.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'service') { form.setAttribute('data-plan-from', 'chip'); paintPlanline('chip'); if (T) T.render({ plain: true, quiet: true }); }
    });
    sum.addEventListener('click', function () { /* native toggle */ });
  }
  /* the hero: one gold door, the fares as plain anchors, the quiet links */
  (function () {
    var go = document.querySelector('.hero-go');
    if (go) go.addEventListener('click', function () { boomTrack('hero_cta', { location: 'hero', market: C.SLUG }); });
    var hp = $('heroPlan');
    if (hp) hp.addEventListener('click', function () { boomTrack('hero_cta', { location: 'plan', market: C.SLUG }); });
    [].forEach.call(document.querySelectorAll('.fare[data-fare]'), function (a) {
      a.addEventListener('click', function () { boomTrack('fare_click', { plan: a.getAttribute('data-fare'), market: C.SLUG }); });
    });
    [['heroWa', 'hero'], ['ckWa2', 'ticket'], ['stripWa', 'strip']].forEach(function (w) {
      var el = $(w[0]);
      if (el) el.addEventListener('click', function () { boomTrack('wa_open', { location: w[1], plan: service() || 'none', market: C.SLUG }); });
    });
  })();
  /* a plate's main link prints the ticket on ITS plan and brings the reader
     (and the focus) up to it; confirming or issued, only the way up. No JS: the door */
  [].forEach.call(document.querySelectorAll('.sib [data-service]'), function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('data-service');
      if (!planOf(id)) return;
      if (!T || !(T.issued() || T.confirming())) {
        if (form) form.setAttribute('data-plan-from', 'plate');
        setPlan(id, 'plate');
        boomTrack('select_item', { item_id: id, source_page: C.SLUG, source: 'plate' });
        if (!T) return;
        T.print('plate');
        T.render({ plain: true, quiet: true });
      }
      e.preventDefault();
      T.toPass(1);
    });
  });
  (function () {
    var f = $('ckFile');
    if (f) f.addEventListener('click', function () { boomTrack('hero_cta', { location: 'ticket', plan: service() || 'none', market: C.SLUG }); });
  })();

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
      function open(plan, src) {
        var id = planOf(plan) ? plan : C.FEATURED;
        rows.forEach(function (row) { var i = row.querySelector('input'); i.checked = i.value === id; });
        /* every opening copies the door's name, email and phone into the
           sheet's empty fields: nothing typed twice, nothing overwritten */
        [['fName', 'sName'], ['fEmail', 'sEmail'], ['fPhone', 'sPhone']].forEach(function (pr) {
          var from = $(pr[0]), to = $(pr[1]);
          var v = from ? String(from.value || '').trim() : '';
          if (to && v && !to.value) to.value = v;
        });
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
        var body = {
          city: C.SLUG, kind: id, name: name, email: email, phone: phone,
          notes: ($('sNote').value || '').trim(),
          /* the payer's own request to start inside the 14-day withdrawal
             period — never pre-ticked; without it the desk starts when the
             14 days end (Directive 2011/83/EU art. 7(3)) */
          startNow: !!($('sStart') && $('sStart').checked),
          company: ($('sCompany').value || '').trim()
        };
        /* the file opened in this tab travels with the order: the webhook
           reuses its number (one person, one number) */
        if (fileRef) body.fileRef = fileRef;
        postJson(C.CHECKOUT_ENDPOINT || '/api/service-checkout', body)
          .then(function (res) {
            if (res && res.ok && res.url) { location.href = res.url; return; }
            throw new Error((res && res.error) || 'failed');
          })
          .catch(function () { sending = false; go.classList.remove('busy'); fail('net'); });
      }
      go.addEventListener('click', pay);
      /* back from Stripe via the bfcache: the till starts clean */
      addEventListener('pageshow', function (e) {
        if (!e.persisted) return;
        sending = false; go.classList.remove('busy');
        if (ov.open) close();
        document.body.style.overflow = '';
      });
      $('ovX').addEventListener('click', close);
      /* "Prefer to talk first?" keeps the plan the reader was looking at: the
         door below carries it, as a plate's own link does (not once issued) */
      $('ovTalk').addEventListener('click', function () {
        var id = chosen();
        if (planOf(id) && form && !(T && T.issued())) { form.setAttribute('data-plan-from', 'plate'); setPlan(id, 'plate'); }
        close();
      });
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
      b.addEventListener('click', function () {
        var plan = b.getAttribute('data-pay');
        if (!plan) return;
        /* a payment being confirmed, or paid, is never paid twice: the ticket instead */
        if (T && (T.confirming() || T.issued() === 'paid')) return T.toPass(1);
        sheet.open(plan, b.id || (b.closest('.sib') ? 'plate' : 'page'));
      });
    });
  }

  /* ══ THE CHECK-IN AND THE TICKET: three taps → the RULES' plan ══ */
  var CK = (function () {
    var root = $('checkin'), pass = $('pass'), wrap = $('passWrap');
    if (!K || !root || !pass) return null;
    var STEPS = ['stage', 'where', 'when'];
    var touchedDocs = false, editing = null, started = false, lastPlan = null, lastKind = 'blank', viewedPlan = null;
    var printed = false, emitted = false, issued = '', confirming = false, priceBoard = null, statusBoard = null, statusWord = '', lastLive = '';
    var DOSS = C.DOSSIER || K.dossier, PREP = C.PREPARES || {};
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
    /* the plan's own short line (the fare row's), for a plan the rules did not give */
    var tagline = function (id) { var e = document.querySelector('.fare[data-fare="' + id + '"] .fn'); return e ? e.textContent : ''; };

    /* where the questions are: blank · pending (a stage the rules cannot
       resolve yet) · resolved (plan known) · complete (the three answers) */
    function state() {
      var st = answer('stage'), wh = answer('where'), wn = answer('when');
      if (!st) return { kind: 'blank' };
      var r = rule(st, wh);
      if (!r) return { kind: 'pending', stage: st, st: st, wh: wh, wn: wn };
      return { kind: wn ? 'complete' : 'resolved', st: st, wh: wh, wn: wn, rule: r, plan: PLANS[r.plan], planId: r.plan };
    }

    /* the steps appear one after the other; an answered one folds unless it is being changed */
    function sync() {
      var ready = true, firstOpen = null;
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
      setText('ckNum', K.num.replace('{n}', String(firstOpen === null ? 3 : firstOpen + 1)));
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
        K.dossier.items.forEach(function (it, i) { var cb = root.querySelector('input[name="ck-doc"][value="' + it.id + '"]'); if (cb) cb.checked = !!(mk & (1 << i)); });
      }
      return { answered: answered, via: via, docs: m[4] !== '-' };
    }
    function remember() {
      if (!answer('stage')) return;
      try { history.replaceState(null, '', location.pathname + location.search + '#checkin=' + hashOf()); } catch (e) {}
    }
    var shareUrl = function (via) { return (C.PAGE_URL || location.origin + location.pathname) + '#checkin=' + hashOf(via); };
    var shareText = function (which, via) { return K.share[which].replace('{city}', C.CITY).replace('{url}', shareUrl(via)); };

    /* one same-document view transition around a swap of the steps (returned); a plain
       swap where the API is absent, hidden or motion is off */
    function swap(fn, plain) {
      if (!plain && document.startViewTransition && !ridotto && !document.hidden) {
        try { return document.startViewTransition(function () { fn(); }); } catch (e) {}
      }
      fn();
      return null;
    }

    /* the papers line: what is in hand, what the CHOSEN plan prepares of
       what is missing (named only when there is something — Attended Viewing
       prepares no paper), and the rest */
    var papersLine = function (planId) {
      var held = docsHeld(), items = K.dossier.items, N = items.length;
      if (!touchedDocs && !held.length) return { text: '', pct: 0, short: DASH, field: '' };
      var miss = items.filter(function (it) { return held.indexOf(it.id) < 0; });
      var names = function (a) { return a.map(function (it) { return it.t; }).join(', '); };
      var text = held.length === N ? DOSS.all : DOSS.some.replace('{have}', String(held.length)).replace('{missing}', names(miss));
      var p = planOf(planId), prep = p && PREP[planId] ? PREP[planId] : [];
      var ours = miss.filter(function (it) { return prep.indexOf(it.id) > -1; });
      if (p && ours.length) text += ' ' + DOSS.ours.replace('{plan}', p.label).replace('{ours}', names(ours));
      if (DOSS.rest) text += ' ' + DOSS.rest;
      return { text: text, pct: Math.round(held.length / N * 100), short: held.length + '/' + N, field: held.length + '/' + N + (miss.length ? ' · missing: ' + names(miss) : '') };
    };

    /* the WhatsApp text: the desk marker first (api/_market.js reads it),
       then the plan and the answers once they exist — never a price; an
       answer loses its first capital, never "I" or the city's */
    var midCase = function (t) { return /^I\b/.test(t) || (C.CITY && t.indexOf(C.CITY) === 0) ? t : t.charAt(0).toLowerCase() + t.slice(1); };
    function waHref() {
      var p = planOf(service()), txt = C.WA_TEXT || '';
      if (p && C.WA_PLAN) {
        var ans = STEPS.map(function (id) { var a = answer(id); return a ? midCase(optOf(id, a).t) : null; }).filter(Boolean);
        txt += ' ' + C.WA_PLAN.replace('{plan}', p.label).replace('{answers}', ans.length ? ' · ' + ans.join(' · ') : '');
      }
      return 'https://wa.me/' + (C.WHATSAPP || '') + '?text=' + encodeURIComponent(txt);
    }

    /* ── the ticket ── */
    function setStatus(word) {
      if (word === statusWord) return;
      statusWord = word;
      statusBoard = flap($('ckStatus'), (word + '       ').slice(0, 7), ' ABCDEFGHIJKLMNOPQRSTUVWXYZ', statusBoard);
      setText('ckStatusSr', word);
    }
    /* layout geometry (offsetTop), never the painted rect: the emission moves the card */
    var topOf = function (el) { var t = 0; while (el) { t += el.offsetTop; el = el.offsetParent; } return t; };
    var barH = function () { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra')) || 80; };
    var stripH = function () { var s = $('paybar'); return s && s.classList.contains('on') ? s.offsetHeight : 0; };
    var shown = function (el) { return !!(el && !el.hidden && el.offsetParent); };
    function go(y, i) { try { scrollTo({ top: y, behavior: i ? 'instant' : ridotto ? 'auto' : 'smooth' }); } catch (e) { scrollTo(0, y); } }
    /* never scroll the KEYBOARD's control under the bar (a tap focuses the radio too) */
    function kbCap(want) {
      var a = document.activeElement, fv = false;
      try { fv = root.contains(a) && a.matches(':focus-visible'); } catch (e) {}
      return fv ? Math.min(want, topOf(a.closest('label') || a) - barH() - 8) : want;
    }
    /* where the doors land the strip steps back: its height is not taken off */
    function landDoors() {
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        /* the lowest door showing: the till under the free call where the desk sells */
        var f = $('ckFile'), t = $('ckStart'); if (t && t.offsetParent && topOf(t) > topOf(f)) f = t;
        if (!printed || !f || !f.offsetParent) return;
        var want = kbCap(topOf(f) + f.offsetHeight - innerHeight + 16);
        if (want > scrollY + 1) go(want);
      }); });
    }
    /* the next open question (then the papers fold) on the screen, below the bar */
    function keepNext() {
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        var pb = $('ckPapersBox'), el = STEPS.map(stepEl).filter(function (x) { return shown(x) && !answer(x.getAttribute('data-step')); })[0] || (shown(pb) ? pb : null);
        if (!el) return;
        var t = topOf(el), up = t - barH() - 8, low = t + el.offsetHeight - (innerHeight - stripH() - 16);
        var want = up < scrollY ? up : low > scrollY ? Math.min(up, low) : null;
        if (want !== null && Math.abs((want = Math.max(0, kbCap(want))) - scrollY) > 1) go(want);
      }); });
    }
    /* the one focus target the page moves to: the ticket itself */
    function focusPass() { try { pass.focus({ preventScroll: true }); } catch (e) {} }
    /* the ticket's top under the bar (f: focus too); a floor (the sent
       card's first step) stays on screen, at once: a glide shows the hole */
    function toPass(f, floorEl) {
      if (f) focusPass();
      var run = function () {
        var y = topOf(pass) - barH() - 12;
        if (floorEl) y = Math.max(y, topOf(floorEl) + floorEl.offsetHeight - innerHeight + 16);
        if (Math.abs((y = Math.max(0, y)) - scrollY) > 1) go(y, floorEl);
      };
      if (floorEl) run(); else requestAnimationFrame(function () { requestAnimationFrame(run); });
    }
    /* the strike (stamp, foil) once the stamp is 60% on screen below the bar;
       at once without an observer or motion. .struck is only the motion */
    var strikeIO = null;
    function strike() {
      var st = $('ckStamp'), now = function () { if (strikeIO) strikeIO.disconnect(); strikeIO = null; pass.classList.add('struck'); };
      if (strikeIO) strikeIO.disconnect();
      if (!st || ridotto || !window.IntersectionObserver) return now();
      /* a busy frame batches a stale entry first: the last one is now */
      strikeIO = new IntersectionObserver(function (es) { var e = es[es.length - 1]; if (e.isIntersecting && e.intersectionRatio >= 0.59) now(); }, { rootMargin: '-' + Math.round(barH()) + 'px 0px 0px 0px', threshold: 0.6 });
      strikeIO.observe(st);
    }
    /* the first print in a page load runs the emission once; later prints never replay it */
    function print(source) {
      if (printed) return false;
      printed = true;
      if (wrap) { wrap.classList.add('printed'); if (!emitted) { emitted = true; wrap.classList.add('in'); } }
      if ($('ckBlank')) $('ckBlank').hidden = true;
      pass.setAttribute('data-state', 'standby');
      var rf = $('ckRefund'); if (rf) rf.hidden = false;
      paint();
      boomTrack('plan_print', { source: source || 'checkin', market: C.SLUG });
      return true;
    }
    /* the ticket shows the CHECKED chip's plan; no chip (or "not sure") is the first call */
    function paint() {
      if (!printed || issued) return;
      var s = state(), id = service(), p = planOf(id);
      pass.setAttribute('data-state', confirming ? 'confirming' : 'standby');
      setText('ckTitle', (I.titles || {}).plan || '');
      setStatus(((I.status || {}).standby) || 'STANDBY');
      /* the route: the reader's own "where" (YOU until answered), the plane one leg per answer */
      var legs = STEPS.filter(function (x) { return !!answer(x); }).length;
      pass.style.setProperty('--leg', String(legs));
      setText('ckFrom', s.wh ? optOf('where', s.wh).code : 'YOU');
      var fc = I.firstCall || {};
      if (p) {
        setText('ckPlan', p.label);
        setText('ckWhy', s.rule && s.planId === id ? s.rule.why : tagline(id));
        setText('ckCond', p.condition);
        setText('ckCondLong', p.conditionLong);
        setText('ckPriceSr', eur(p.eur) + (p.unit ? ' ' + p.unit : ''));
        if (lastPlan !== id) { priceBoard = flap($('ckPrice'), eur(p.eur), ' €,.0123456789FRE', priceBoard); lastPlan = id; }
      } else {
        setText('ckPlan', fc.plan || '');
        setText('ckWhy', fc.line || '');
        setText('ckCond', '');
        setText('ckCondLong', fc.line || '');
        setText('ckPriceSr', fc.fare || 'Free');
        if (lastPlan !== '') { priceBoard = flap($('ckPrice'), String(fc.fare || 'Free').toUpperCase(), ' €,.0123456789FRE', priceBoard); lastPlan = ''; }
      }
      /* the refund rule is Full Search's promise: its block keeps its height
         under any plan, so swapping plans never moves the doors */
      var rf = $('ckRefund'); if (rf) rf.classList.toggle('off', id !== 'full-search');
      var note = $('ckNote');
      if (note) {
        if (s.kind === 'complete') { note.textContent = (s.st === 'zero' && s.wn === 'soon') ? K.refusal : K.notes.when[s.wn]; note.hidden = false; }
        else note.hidden = true;
      }
      /* move-in: the month the reader picked; else the answer; the page's own prefill never speaks for them */
      var mv = $('fMoveIn'), mo = mv && mv.value && mv.getAttribute('data-user') ? mv.options[mv.selectedIndex] : null;
      setText('ckMoveIn', mo ? mo.textContent : (s.wn ? optOf('when', s.wn).t : DASH));
      setText('ckPassPapers', papersLine(id).short);
      setText('ckPassFile', DASH);
      setText('ckPassWhen', DASH);
      var codes = [s.st ? optOf('stage', s.st).code : null, s.wh ? optOf('where', s.wh).code : null, s.wn ? optOf('when', s.wn).code : null].filter(Boolean);
      var cl = $('ckCodeLine'); if (cl) setText('ckCodeLine', (cl.getAttribute('data-base') || '') + (codes.length ? ' · ' + codes.join(' · ') : ''));
      /* the doors, pointed at this plan: the till only on a real plan, never while a payment is being confirmed */
      var start = $('ckStart');
      if (start) { start.setAttribute('data-pay', p ? id : ''); setText('ckStartAmt', p ? eur(p.eur) : ''); start.hidden = !p || confirming; }
      var file = $('ckFile'); if (file) { file.setAttribute('data-service', p ? id : ''); file.hidden = confirming; }
      var pd = $('ckPending'); if (pd) pd.hidden = !confirming;
      /* the plan announced once per plan */
      var say = p ? p.label + ', ' + eur(p.eur) + ', ' + p.condition : (fc.plan || '') + ', ' + (fc.fare || '');
      if (s.kind === 'complete' && note && !note.hidden) say = (p ? p.label + ', ' + eur(p.eur) : fc.plan) + '. ' + note.textContent;
      if (say !== lastLive) { lastLive = say; setText('ckLive', say); }
    }
    /* OPEN after the 200, PAID after the server said paid: the number is the server's */
    function issue(kind, o) {
      o = o || {};
      if (issued === 'paid' || (issued === kind)) return;
      if (!printed) print(kind === 'paid' ? 'paid' : 'door');
      paint();
      issued = kind; confirming = false;
      pass.setAttribute('data-state', kind);
      setText('ckTitle', (I.titles || {}).issued || '');
      setStatus(((I.status || {})[kind]) || kind.toUpperCase());
      setText('ckPassFile', o.file || DASH);
      var B = I.boarding || {};
      if (kind === 'open') {
        setText('ckPassenger', String(o.name || '').trim().slice(0, 24) || DASH);
        setText('ckPassWhen', sell ? ($('openWhen') ? $('openWhen').textContent : DASH) : (B.waitlist || DASH));
      } else {
        setText('ckPassWhen', o.startNow === false && o.workFromLabel ? String(B.paidWait || '{date}').replace('{date}', o.workFromLabel) : (B.paidNow || DASH));
      }
      var pd = $('ckPending'); if (pd) pd.hidden = true;
      var file = $('ckFile'); if (file) file.hidden = true;
      if (kind === 'paid') payOff();
      var st = $('ckStamp'); if (st) st.setAttribute('data-stamp', (kind === 'paid' ? 'PAID' : 'FILE OPEN') + ' · BOOM ' + String(C.WORD || C.CITY || '').toUpperCase());
      strike();
      var said = (kind === 'paid' ? 'Payment confirmed.' : 'Your file is open.') + (o.file ? ' File ' + o.file + '.' : '');
      lastLive = said; setText('ckLive', said);
      boomTrack('pass_issued', { state: kind, market: C.SLUG });
      if (stripOff) stripOff();
      freeze(SENT);
    }
    /* paid or being confirmed: no pay button anywhere */
    function payOff() { [].forEach.call(document.querySelectorAll('[data-pay]'), function (b) { b.hidden = true; }); }
    /* an answer after the one POST (or while paying) goes nowhere: the
       questions go inert, a focus in them onto the ticket; the line stays read */
    var SENT = ($('ckSent') || {}).textContent;
    /* a line's first sentence: the frozen head keeps one line while paying */
    var first = function (el) { return el && el.textContent.replace(/\.\s.*$/, '.'); };
    function freeze(line) {
      if (root.contains(document.activeElement)) focusPass();
      root.classList.add('frozen');
      ['ckSteps', 'ckSuggest', 'ckPapersBox'].forEach(function (id) { try { $(id).inert = true; } catch (e) {} });
      var s = $('ckSent'); if (s) { if (line) s.textContent = line; s.hidden = false; }
    }
    function confirmPaid(plan) {
      confirming = true;
      if (form) form.setAttribute('data-plan-from', 'paid');
      setPlan(plan, 'paid');
      print('paid');
      paint();
      payOff();
      freeze(first($('ckPending')));
    }

    function render(opts) {
      opts = opts || {};
      var s = state();
      /* the ticket BEFORE this render (a view transition swaps a frame later) */
      var pBefore = printed, planBefore = lastPlan;
      var vt = swap(function () {
        sync();
        if ($('ckPend')) $('ckPend').hidden = s.kind !== 'pending';
        if ($('ckPapersBox')) $('ckPapersBox').hidden = s.kind !== 'complete' && !touchedDocs;
        if (s.kind === 'pending') {
          var pt = (C.PENDING || {})[s.stage] || '';
          setText('ckPendText', pt);
          if (pt !== lastLive) { lastLive = pt; setText('ckLive', pt); }
        }
        if (s.kind === 'resolved' || s.kind === 'complete') {
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
          if (!printed && !issued && !opts.quiet) print('checkin');
        } else {
          /* back to blank or pending: a plan the Check-in had written into the
             door is no longer decided — it leaves (a chip the reader chose by
             hand stays theirs); the answered steps still travel in words */
          if (form && form.getAttribute('data-plan-from') === 'checkin') {
            [].forEach.call(form.querySelectorAll('input[name="service"]'), function (r) { r.checked = false; });
            form.removeAttribute('data-plan-from');
            paintPlanline();
          }
          if ($('fCheckin')) $('fCheckin').value = s.st ? [optOf('stage', s.st).t, s.wh ? optOf('where', s.wh).t : null].filter(Boolean).join(' · ') : '';
        }
        /* the answers suggest another plan than the one chosen by hand: say
           so, with a button — never overwrite the reader */
        var sg = $('ckSuggest'), hand = form && /^(chip|plate)$/.test(form.getAttribute('data-plan-from') || '');
        var suggest = (s.kind === 'resolved' || s.kind === 'complete') && hand && service() !== s.planId;
        if (sg) {
          sg.hidden = !suggest;
          if (suggest) setText('ckSuggestText', K.result.suggest.replace('{plan}', s.plan.label));
          sg.setAttribute('data-plan', suggest ? s.planId : '');
        }
        /* the papers: the line names what the CHOSEN plan prepares */
        var pl = papersLine(service());
        setText('ckReady', pl.text);
        var meter = $('ckMeter'); if (meter) { meter.style.setProperty('--meter', pl.pct + '%'); meter.style.width = pl.pct + '%'; }
        if ($('fDossier')) $('fDossier').value = touchedDocs ? pl.field : '';
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
        paint();
        paintLinks();
      }, !!opts.plain);
      /* a tap that prints the ticket or changes its plan lands the doors, any
         other keeps the next question in view — after the cross-fade, whose
         snapshot a scroll would drag over the ticket */
      if (opts.tap) {
        var land = function () { if (printed && (!pBefore || lastPlan !== planBefore)) landDoors(); else keepNext(); };
        if (vt && vt.finished) vt.finished.then(function () { land(); }, function () { land(); }); else land();
      }
      if ((s.kind === 'resolved' || s.kind === 'complete') && (lastKind === 'blank' || lastKind === 'pending' || opts.resolved)) {
        boomTrack('checkin_result', { market: C.SLUG, plan: s.planId, stage: s.st, where: s.wh || '', when: s.wn || '', resolved_at_tap: s.wh && rule(s.st, null) == null ? 2 : 1, docs: touchedDocs ? docsHeld().length : -1 });
      }
      lastKind = s.kind;
      remember();
      return s;
    }
    /* the links that carry the plan: WhatsApp (hero, ticket, strip) and the strip's line */
    function paintLinks() {
      var h = waHref();
      ['heroWa', 'ckWa2', 'stripWa'].forEach(function (id) { var a = $(id); if (a && a.getAttribute('href') !== h) a.setAttribute('href', h); });
      var wa = $('ckWa'); if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(shareText('plan', 'w'));
      /* the strip names the plan, never the price */
      var p = planOf(service()), bar = $('paybar');
      if (p) setText('stripSub', p.label + ' · ' + (bar && bar.getAttribute('data-yourplan') || 'your plan'));
      else if (bar) setText('stripSub', bar.getAttribute('data-sub') || '');
    }

    /* ── the ticket as an image: 1080×1920, one pure function; no file, no name ── */
    function drawPass(x, d, W, H) {
      function rr(X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
      function sp(t) { return String(t).toUpperCase().split('').join(' '); }
      function fit(t, max, size, weight, fam) { var s = size; x.font = weight + ' ' + s + 'px ' + fam; while (x.measureText(t).width > max && s > 14) { s -= 2; x.font = weight + ' ' + s + 'px ' + fam; } return s; }
      var gold = '#FFD700', mono = 'ui-monospace, Menlo, Consolas, monospace', sans = '"Helvetica Neue", Helvetica, Arial, sans-serif';
      x.fillStyle = '#060607'; x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(255,215,0,.035)'; x.lineWidth = 1;
      for (var gx = 0; gx <= W; gx += 80) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
      for (var gy = 0; gy <= H; gy += 80) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
      var cx = 80, cw = W - 160, bodyH = 860, stubH = 520, chh = bodyH + stubH, cy = Math.round((H - chh) / 2) - 30, rad = 36, foil = 44;
      var cut = cy + bodyH;
      x.save(); rr(cx, cy, cw, chh, rad); x.clip();
      var bg = x.createLinearGradient(cx, cy, cx + cw, cy + chh); bg.addColorStop(0, '#101014'); bg.addColorStop(.72, '#080809'); bg.addColorStop(1, '#080809');
      x.fillStyle = bg; x.fillRect(cx, cy, cw, chh);
      var sb = x.createLinearGradient(0, cut, 0, cy + chh); sb.addColorStop(0, '#0C0C0F'); sb.addColorStop(1, '#070708');
      x.fillStyle = sb; x.fillRect(cx, cut, cw, stubH);
      x.save(); x.globalAlpha = .5;
      var mk = x.createRadialGradient(cx, cy, 40, cx, cy, cw * 1.1); mk.addColorStop(0, 'rgba(255,215,0,.14)'); mk.addColorStop(1, 'rgba(255,215,0,0)');
      x.strokeStyle = mk; x.lineWidth = 1;
      for (var dd = -chh; dd < cw + chh; dd += 18) { x.beginPath(); x.moveTo(cx + dd, cy); x.lineTo(cx + dd - chh * .47, cy + chh); x.stroke(); }
      for (var d2 = -chh; d2 < cw + chh; d2 += 28) { x.beginPath(); x.moveTo(cx + d2, cy); x.lineTo(cx + d2 + chh * .5, cy + chh); x.stroke(); }
      x.restore();
      /* the rosette watermark, very low */
      x.save(); x.globalAlpha = .05; x.strokeStyle = gold;
      for (var rr2 = 30; rr2 < 300; rr2 += 18) { x.beginPath(); x.arc(cx + cw - 190, cy + 300, rr2, 0, Math.PI * 2); x.stroke(); }
      x.restore();
      var lam = x.createLinearGradient(0, cy, 0, cy + bodyH);
      [[0, '#7a5f16'], [.14, '#f6e27a'], [.32, '#8a6d1f'], [.48, '#fdf0a8'], [.63, '#b8942b'], [.78, '#f6e27a'], [1, '#6b5716']].forEach(function (s) { lam.addColorStop(s[0], s[1]); });
      x.fillStyle = lam; x.fillRect(cx, cy, foil, bodyH);
      x.save(); x.translate(cx + foil / 2, cy + bodyH / 2); x.rotate(-Math.PI / 2);
      x.fillStyle = 'rgba(20,16,5,.9)'; x.font = '800 15px ' + sans; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(('BOOM · ' + d.side + ' · ').toUpperCase().repeat(3).split('').join(String.fromCharCode(8202)), 0, 0);
      x.restore();
      x.restore();
      rr(cx, cy, cw, chh, rad); x.strokeStyle = 'rgba(255,215,0,.28)'; x.lineWidth = 2; x.stroke();
      rr(cx + 10, cy + 10, cw - 20, chh - 20, rad - 8); x.strokeStyle = 'rgba(255,215,0,.12)'; x.lineWidth = 1; x.stroke();
      var L = cx + foil + 60, Rr = cx + cw - 60, y = cy + 96;
      /* the mark and the header line, the status word on the right */
      try {
        if (d.markD && typeof Path2D === 'function') {
          var P = new Path2D(d.markD);
          x.save(); x.translate(L, y - 46); x.scale(64 / 1024, 64 / 1024); x.translate(0, 1024); x.scale(0.1, -0.1); x.fillStyle = gold; x.fill(P); x.restore();
        }
      } catch (e) {}
      x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      x.fillStyle = gold; x.font = '600 22px ' + mono;
      x.fillText(sp(d.title), L + 84, y - 8);
      x.textAlign = 'right'; x.fillStyle = '#FFE55C'; x.font = '400 26px ' + mono; x.fillText(sp(d.status), Rr, y - 8);
      x.textAlign = 'left';
      /* the route: FROM, the dashed leg with the plane where the answers reached, IATA */
      y += 150;
      x.fillStyle = '#FFF'; var fz = fit(d.from, 300, 96, '200', sans); var fw = x.measureText(d.from).width;
      x.fillText(d.from, L, y);
      x.font = '200 96px ' + sans; x.textAlign = 'right'; x.fillStyle = gold; x.fillText(d.iata || '', Rr, y);
      var iw = x.measureText(d.iata || '').width; x.textAlign = 'left';
      var a0 = L + fw + 30, a1 = Rr - iw - 30, ly = y - fz * 0.34;
      x.save(); x.setLineDash([10, 10]); x.strokeStyle = 'rgba(250,250,250,.34)'; x.lineWidth = 2; x.beginPath(); x.moveTo(a0, ly); x.lineTo(a1, ly); x.stroke(); x.restore();
      var px = a0 + (a1 - a0 - 44) * Math.max(0, Math.min(3, d.legs)) / 3;
      x.strokeStyle = gold; x.lineWidth = 2; x.beginPath(); x.moveTo(a0, ly); x.lineTo(px + 22, ly); x.stroke();
      try {
        if (d.planeD && typeof Path2D === 'function') {
          var Q = new Path2D(d.planeD);
          x.save(); x.translate(px + 22, ly); x.rotate(Math.PI / 2); x.translate(-22, -22); x.scale(44 / 24, 44 / 24); x.fillStyle = gold; x.fill(Q); x.restore();
        }
      } catch (e) {}
      /* the plan and its line */
      y += 130; x.fillStyle = '#FFF'; fit(d.plan, Rr - L, 64, '300', sans); x.fillText(d.plan, L, y);
      y += 60; x.fillStyle = 'rgba(255,255,255,.62)'; x.font = '300 26px ' + sans;
      var words = String(d.line || '').split(' '), cur = '', lw = Rr - L, lines = 0;
      words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > lw && cur) { if (lines < 3) x.fillText(cur, L, y); y += 38; lines++; cur = w; } else cur = t; });
      if (cur && lines < 3) { x.fillText(cur, L, y); }
      /* the fields a stranger may read: passenger (never a name), move-in, papers */
      y = cy + bodyH - 130;
      var rows = [[d.F.passenger, d.guest], [d.F.movein, d.movein], [d.F.papers, d.papers]];
      var colW = (Rr - L) / 3;
      rows.forEach(function (row, idx) {
        var X = L + idx * colW;
        x.fillStyle = 'rgba(255,255,255,.34)'; x.font = '400 18px ' + mono; x.fillText(sp(row[0]), X, y);
        x.fillStyle = '#FFF'; var v = String(row[1] || '—'); fit(v, colW - 24, 32, '300', sans); x.fillText(v, X, y + 48);
      });
      /* the punched perforation: holes, and the two half-circles cut at the edges */
      for (var hx = cx + 40; hx < cx + cw - 30; hx += 28) { x.fillStyle = '#060607'; x.beginPath(); x.arc(hx, cut, 6, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#060607'; x.beginPath(); x.arc(cx, cut, 26, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(cx + cw, cut, 26, 0, Math.PI * 2); x.fill();
      /* the stub: FARE, the price, the condition, the barcode and the codes */
      var sy = cut + 90, SL = cx + 60;
      x.fillStyle = gold; x.font = '600 20px ' + mono; x.fillText(sp(d.F.fare), SL, sy);
      x.fillStyle = '#FFE55C'; x.font = '300 110px ' + sans; x.fillText(d.price, SL, sy + 120);
      var pw = x.measureText(d.price).width;
      x.fillStyle = 'rgba(255,255,255,.55)'; fit(d.cond, Rr - SL - pw - 30, 24, '400', mono); x.fillText(String(d.cond).toUpperCase(), SL + pw + 26, sy + 112);
      var bx = SL, by = sy + 170;
      for (var i = 0; bx < Rr - 60; i++) { var bw = [2, 4, 1, 3, 2, 1, 5, 2][i % 8]; x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(bx, by, bw * 2, 80); bx += bw * 2 + [3, 5, 2, 4][i % 4] * 2; }
      x.fillStyle = 'rgba(255,255,255,.4)'; fit(d.codes, Rr - SL - 50, 20, '400', mono); x.fillText(d.codes, SL, by + 124);
      x.save(); x.translate(cx + cw - 32, cut + stubH / 2); x.rotate(-Math.PI / 2); x.fillStyle = '#3ddc97'; x.font = '600 18px ' + mono; x.textAlign = 'center'; x.fillText(sp(d.side), 0, 0); x.restore();
      x.fillStyle = 'rgba(255,255,255,.26)'; x.font = '400 20px ' + mono; x.textAlign = 'center';
      x.fillText(sp(String(d.pageUrl || '').replace(/^https:\/\/(www\.)?/, '')), W / 2, cy + chh + 70);
    }
    function passData() {
      var s = state(), id = service(), p = planOf(id), F = K.pass.fields || {}, fc = I.firstCall || {};
      var markEl = document.querySelector('#boomMark path'), planeEl = document.querySelector('#boomPlane path');
      var held = docsHeld(), cl = $('ckCodeLine');
      return {
        iata: C.IATA || '', side: K.pass.side, pageUrl: C.PAGE_URL || '',
        title: (I.titles || {}).plan || 'BOOM', status: ((I.status || {}).standby) || 'STANDBY',
        from: s.wh ? optOf('where', s.wh).code : 'YOU', legs: STEPS.filter(function (z) { return !!answer(z); }).length,
        guest: K.pass.guest,
        plan: p ? p.label : (fc.plan || ''), price: p ? eur(p.eur) : (fc.fare || ''), cond: p ? p.condition : '',
        line: p ? (s.rule && s.planId === id ? s.rule.why : tagline(id)) : (fc.line || ''),
        movein: s.wn ? optOf('when', s.wn).t : DASH,
        papers: touchedDocs ? held.length + '/' + K.dossier.items.length : DASH,
        codes: cl ? cl.textContent : '',
        F: { passenger: F.passenger || 'Passenger', movein: F.movein || 'Move-in', papers: F.papers || 'Papers', fare: (I.stub || {}).fare || 'Fare' },
        markD: markEl ? markEl.getAttribute('d') : '', planeD: planeEl ? planeEl.getAttribute('d') : ''
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
        return { blob: b, ext: ext, name: 'boom-' + C.SLUG + '-plan.' + ext };
      }, function () { inflight = null; return null; });
      return inflight;
    }
    var busy = function (on) { pass.classList.toggle('busy', on); if (wrap) wrap.classList.toggle('busy', on); };
    function savePass() {
      busy(true);
      return passBlob().then(function (r) {
        busy(false);
        if (!r) return;
        var a = document.createElement('a'), u = URL.createObjectURL(r.blob);
        a.href = u; a.download = r.name; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { URL.revokeObjectURL(u); a.remove(); } catch (e) {} }, 2000);
        var s = $('ckSaved'); if (s) { s.textContent = pass.getAttribute('data-saved') || ''; setTimeout(function () { s.textContent = ''; }, 2400); }
        boomTrack('pass_save', { market: C.SLUG, format: r.ext });
      });
    }
    function sharePass() {
      var text = shareText('pass', 'p');
      busy(true);
      return passBlob().then(function (r) {
        busy(false);
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
      if (issued || confirming) return;
      var n = e.target && e.target.name || '';
      /* a tick is a plain swap: a view transition here puts an overlay over
         the page for ~370 ms and the next tick lands on it */
      if (n === 'ck-doc') { touchedDocs = true; render({ plain: true }); return; }
      var m = /^ck-(stage|where|when)$/.exec(n);
      if (!m) return;
      if (!started) { started = true; boomTrack('checkin_start', { market: C.SLUG, landing_state: landingState }); }
      /* the radio is already checked when change fires: the kind BEFORE the
         tap is the one render remembered, not state() now */
      var before = lastKind;
      editing = null;
      var s = render({ resolved: before === 'blank' || before === 'pending', tap: true });
      boomTrack('checkin_answer', { market: C.SLUG, step: m[1], value: e.target.value, kind: s.kind });
    });
    root.addEventListener('click', function (e) {
      if (issued || confirming) return;
      var b = e.target && e.target.closest('.ck-change');
      if (b) {
        editing = b.getAttribute('data-change');
        sync();
        try { stepEl(editing).querySelector('input:checked, input').focus({ preventScroll: true }); } catch (err) {}
        return;
      }
      /* "use it": the plan the answers suggest replaces the hand-picked one */
      var u = e.target && e.target.closest('#ckSuggestUse');
      if (u) {
        var sp = $('ckSuggest').getAttribute('data-plan');
        if (planOf(sp)) {
          form.setAttribute('data-plan-from', 'checkin'); setPlan(sp, 'checkin'); render({ plain: true });
          toPass(1);
          boomTrack('checkin_suggest_use', { market: C.SLUG, plan: sp });
        }
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
    var mvEl = $('fMoveIn');
    /* touched by the reader (a month, or back to "not sure yet"): theirs from then on */
    if (mvEl) mvEl.addEventListener('change', function () { mvEl.removeAttribute('data-auto'); mvEl.setAttribute('data-user', '1'); paint(); });
    if ($('ckCopy')) $('ckCopy').addEventListener('click', copyLink);
    if ($('ckWa')) $('ckWa').addEventListener('click', function () { boomTrack('pass_share', { market: C.SLUG, method: 'whatsapp' }); });
    if ($('ckSave')) $('ckSave').addEventListener('click', savePass);
    if ($('ckShare')) $('ckShare').addEventListener('click', sharePass);
    /* the plan seen: fires once per plan when the plan line is fully on screen */
    if ('IntersectionObserver' in window && $('ckPlan')) {
      new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          var id = service();
          if (en.isIntersecting && printed && planOf(id) && viewedPlan !== id) { viewedPlan = id; boomTrack('checkin_result_view', { market: C.SLUG, plan: id }); }
        });
      }, { threshold: 1 }).observe($('ckPlan'));
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden' || !started) return;
      var s = state();
      if (s.kind !== 'complete') boomTrack('checkin_abandon', { market: C.SLUG, last_step: answer('when') ? 'when' : answer('where') ? 'where' : answer('stage') ? 'stage' : 'none', docs_ticked: docsHeld().length, unresolved: s.kind === 'pending' });
    });

    /* a link with answers lands on them: partial → the next step; complete → the ticket */
    var landingState = 'cold';
    var h = readHash();
    if (h && h.answered) {
      var s0 = render({ landing: true, plain: true });
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
      paintLinks();
    }
    return {
      state: state, render: render, hash: hashOf, shareUrl: shareUrl, passBlob: passBlob, drawPass: drawPass, passData: passData,
      print: print, refresh: function () { if (printed) { paint(); paintLinks(); } else paintLinks(); }, printed: function () { return printed; },
      issued: function () { return issued; }, confirming: function () { return confirming; }, issue: issue, confirmPaid: confirmPaid, toPass: toPass
    };
  })();
  T = CK;
  window.BOOM_CHECKIN = CK;
  var stripOff = null;

  /* ── send: errors from the page's data attributes, said in place ── */
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
    /* manual scroll anchoring (Safari has none): fn changes the page above
       the door, which, on screen, then does not move — at once: a glide is
       the very movement this prevents */
    var still = function (fn) {
      var d = $('contact'), r = d.getBoundingClientRect(), b = r.top;
      fn();
      if (r.bottom > 0 && b < innerHeight && Math.abs(b = d.getBoundingClientRect().top - b) >= 1) { try { scrollBy({ top: b, behavior: 'instant' }); } catch (e) { scrollBy(0, b); } }
    };
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

      /* no ticket yet: it prints now, in the click, the form held still */
      if (T && !T.printed()) still(function () { T.print('door'); });
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
          fileRef = typeof j.id === 'string' && /^city_[a-z0-9_]{8,48}$/.test(j.id) ? j.id : 'city_' + requestId;
          var done = $('fDone');
          /* who writes, when: computed against the desk clock, never a static promise */
          var w = $('openWhen'), rw = desk && desk.replyWindow();
          if (w && rw) w.textContent = rw;
          /* the pass names the plan FILED, not a chip changed in flight */
          if (service() !== picked) {
            [].forEach.call(form.querySelectorAll('input[name="service"]'), function (r) { r.checked = r.value === picked; });
            paintPlanline();
            if (T) T.refresh();
          }
          /* the ticket becomes a boarding pass: the number is the server's */
          if (T) still(function () { T.issue('open', { file: j.file, name: name }); });
          /* the form leaves a frame after the ticket changed (the anchor
             absorbs that); one column lands the first step under the stub,
             side by side the ticket only if off screen; focus: the file */
          var pass = $('pass'), one = innerWidth < 1100, sw = function () {
            form.classList.add('hidden');
            done.classList.add('on');
            if (T && pass && (one || pass.getBoundingClientRect().top < 0)) T.toPass(0, one && (done.querySelector('.next li') || done));
            try { done.focus({ preventScroll: true }); } catch (e) {}
          };
          if (document.hidden) sw(); else requestAnimationFrame(function () { requestAnimationFrame(sw); });
          boomTrack('sign_up', { method: 'city_form', market: C.SLUG });
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

  /* ── the paid landing (?paid=<plan>): the address bar proves nothing.
     "Confirming", then GET /api/city-lead?paid= at 0/1.5/3/6/12 s; only
     paid:true stamps PAID and counts ONE purchase (sessionStorage). */
  (function () {
    if (C.CHECKOUT !== true || !form) return;
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var plan = q.get('paid'), sid = q.get('session_id') || '', pp = planOf(plan);
    if (!pp) return;
    /* the shape the server accepts, or no payer: the page stays as it is */
    if (!/^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(sid)) return;
    var card = $('fPaid');
    if (!card) return;
    form.classList.add('hidden');
    var h3 = card.querySelector('h3'), h3Html = h3 ? h3.innerHTML : '';
    var paintPlan = function (p) { $('paidPlan').textContent = p.label + ' · ' + eur(p.eur) + ' · ' + p.condition; };
    paintPlan(pp);
    if (h3 && card.getAttribute('data-pending')) h3.textContent = card.getAttribute('data-pending');
    /* the steps wait for the server; the address line (#paidText) stays */
    if ($('paidNext')) $('paidNext').hidden = true;
    card.classList.add('on');
    if (T) T.confirmPaid(plan);
    /* land on the ticket (focus too); a legacy #contact lands again at load unless the reader moved */
    var moved = 0, land = function () { if (T) T.toPass(1); else card.focus(); };
    ['wheel', 'touchstart', 'keydown'].forEach(function (t) { addEventListener(t, function () { moved = 1; }, { passive: true, once: true }); });
    if (location.hash) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      if (document.readyState !== 'complete') addEventListener('load', function () { if (!moved) land(); });
    }
    setTimeout(land, 50);
    function onVerified(v) {
      var vp = planOf(v.plan) ? v.plan : plan, p = planOf(vp);
      paintPlan(p);
      if (h3) h3.innerHTML = h3Html;
      card.classList.add('ok');   // the tick draws now, never before
      if ($('paidText')) $('paidText').hidden = false;
      if ($('paidNext')) $('paidNext').hidden = false;
      /* no "start now" tick: the work begins when the 14-day withdrawal period ends — say so */
      if (v.startNow === false && card.getAttribute('data-wait')) {
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
      /* the PAID plan's chip, whatever was tapped while waiting */
      if (T) {
        T.confirmPaid(vp);
        T.issue('paid', v);
      }
      /* the PAID ticket is what lands, again, if the reader has not moved */
      if (!moved) land();
      var key = 'boom:paid:' + (sid || plan), seen = false;
      try { seen = !!sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); } catch (e) {}
      /* the Stripe session id names a payer: GA gets an opaque hash of it (FNV-1a), never the id */
      var h = 0x811c9dc5;
      for (var hi = 0; hi < sid.length; hi++) { h ^= sid.charCodeAt(hi); h = Math.imul(h, 0x01000193) >>> 0; }
      if (!seen) boomTrack('purchase', { transaction_id: 'city_' + C.SLUG + '_' + ('0000000' + h.toString(16)).slice(-8), currency: 'EUR', value: p.eur, items: [{ item_id: 'city_' + C.SLUG + '_' + vp, item_name: p.label, price: p.eur, quantity: 1 }], market: C.SLUG });
      /* verified: the query folds away, the URL can be shared without re-landing */
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
    var at = [0, 1500, 3000, 6000, 12000], n = 0, verified = false;
    function ask() {
      if (verified) return;
      /* the fifth ask unanswered: "not confirmed yet" on card, stub and Check-in */
      if (n >= at.length) {
        var un = card.getAttribute('data-unconfirmed');
        if (un) { if (h3) h3.textContent = un; setText('ckPending', un); setText('ckSent', un.replace(/\.\s.*$/, '.')); }
        return;
      }
      var wait = at[n] - (n ? at[n - 1] : 0);
      n++;
      setTimeout(function () {
        fetch(C.LEAD_URL + '?paid=' + encodeURIComponent(sid) + '&city=' + encodeURIComponent(C.SLUG), { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (v) {
            if (v && v.paid === true && !verified) { verified = true; onVerified(v); return; }
            ask();
          }, ask);
      }, wait);
    }
    ask();
  })();

  /* ── chrome: scrolled nav, burger ───────────────────────────────────── */
  (function () {
    var nav = $('nav');
    addEventListener('scroll', function () { if (nav) nav.classList.toggle('scrolled', scrollY > 30); }, { passive: true });
    var t = $('navToggle'), m = $('mobileMenu');
    if (t && m) {
      /* closed: inert + aria-hidden (CSS adds visibility); open: focus on
         its first link, Escape closes back to the burger */
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

  /* ── the strip: the phone's door after the hero's; never over the door or ticket; gone once issued ── */
  (function () {
    var bar = $('paybar'), cta = document.querySelector('.hero-go') || document.querySelector('.hero');
    if (!bar || !cta) return;
    var seen = { contact: false, pass: false }, gone = false;
    if ('IntersectionObserver' in window) {
      ['contact', 'pass'].forEach(function (id) {
        var el = $(id); if (!el) return;
        new IntersectionObserver(function (es) { es.forEach(function (e) { seen[id] = e.isIntersecting; }); upd(); }, { threshold: 0 }).observe(el);
      });
    }
    /* its measured height for the CSS: --strip-h */
    var hh = 0;
    function upd() {
      var h = bar.offsetHeight;
      if (h && h !== hh) document.documentElement.style.setProperty('--strip-h', (hh = h) + 'px');
      bar.classList.toggle('on', !gone && cta.getBoundingClientRect().bottom < 0 && !seen.contact && !seen.pass && !dialogOpen());
    }
    addEventListener('resize', upd);
    stripOff = function () { gone = true; upd(); };
    /* nor while a payment is being confirmed */
    if ((T && (T.issued() || T.confirming())) || ($('fPaid') && $('fPaid').classList.contains('on'))) gone = true;
    addEventListener('scroll', upd, { passive: true }); upd();
    /* the till closing is not a scroll: the strip comes back on its own */
    if (ov) ov.addEventListener('close', function () { setTimeout(upd, 0); });
    var g = $('stripGo'); if (g) g.addEventListener('click', function () { boomTrack('paybar_click', { market: C.SLUG, plan: service() || 'none' }); });
  })();

  boomTrack('page_view_market', { market: C.SLUG });
})();
