/* assets/boom-city.js — the city desks (v1.5, «Il biglietto»). Reads
   window.BOOM_CITY (the build's config) and window.BOOM_DESK_CAL (the desk
   calendar, inlined from js/desk-calendar.js); posts only to our own API.
   The pass: blank → open (a 200 from /api/city-lead, the SERVER's file
   number) → paid (GET /api/city-lead?paid= says paid:true). The page never
   computes a file number or a payment state on its own. */
(function () {
  'use strict';
  var C = window.BOOM_CITY || {};
  var PLANS = C.PLANS || {};
  var CAL = window.BOOM_DESK_CAL || null;
  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var wide = window.matchMedia ? matchMedia('(min-width: 940px)') : { matches: false };
  var pass = $('pass');
  if (!pass) return;
  var sell = C.CHECKOUT === true;
  function track(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} }
  function convert(label) { try { window.dispatchEvent(new CustomEvent('boom-conversion', { detail: { label: label, section: 'pass' } })); } catch (e) {} }
  var eur = function (n) { return '€' + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var txt = function (id, v) { var n = $(id); if (n) { var s = v == null ? '' : String(v); if (n.textContent !== s) n.textContent = s; } };
  /* PLANS is plain data: an inherited key (?paid=constructor) is not a plan */
  var planOf = function (id) { return id && Object.prototype.hasOwnProperty.call(PLANS, id) ? PLANS[id] : null; };
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  /* a POST that never answers must not lock a button for the tab's life:
     20 s, then the send fails in place and the button comes back */
  function postJson(url, body, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 20000);
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(to); return r.json(); }, function (e) { clearTimeout(to); throw e; });
  }

  /* ── Solari: the city settles once; the status flips only when a fact changes ── */
  var DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function mount(host, word, spin) {
    if (!host || !window.BoomSolari) { if (host) host.textContent = word; return null; }
    var b = new window.BoomSolari.Board(host, word.length, DRUM);
    host.classList.add('live');
    if (reduce || !spin) b.show(word); else b.show(word, 60, true);
    return b;
  }
  (function () {
    var host = $('placeBoard'), word = host && String(host.getAttribute('data-word') || C.WORD || '').toUpperCase();
    if (!word) return;
    if (reduce) { mount(host, word, false); return; }
    setTimeout(function () { mount(host, word, true); }, 120);
  })();
  var slotBoard = null;
  function slot(word, sr) {
    var sb = pass.querySelector('.slot .slot-b');
    if (!slotBoard || slotBoard.cells.length !== word.length) slotBoard = mount(sb, word, true);
    else slotBoard.update(word);
    txt('slotSr', sr);
  }

  /* ── the desk window: hours, said in words, from the desk calendar (the
     webhook's own holidays), the zone name of the OPENING instant ── */
  function win() { return CAL && C.DESK ? CAL.deskWindow(new Date(), C.DESK, C.HOLIDAYS) : null; }
  function nextLine() {
    var w = win();
    return !w ? '' : w.open ? 'By ' + w.until + (w.tz ? ' ' + w.tz : '') + ' today' : w.line;
  }
  function refreshClock() {
    var w = win();
    if (w) $$('[data-window]').forEach(function (n) {
      var t = n.getAttribute('data-window').replace('{w}', w.line);
      if (n.textContent !== t) n.textContent = t;
    });
    if (pass.getAttribute('data-state') === 'open') txt('oNext', nextLine());
    /* the next minute boundary, never a countdown */
    setTimeout(refreshClock, 60000 - (Date.now() % 60000) + 50);
  }

  /* ── the fares: a row opens ITS ticket in place; the tapped row stays put.
     Without JS the rows are an exclusive accordion (<details name>); with
     JS the page opens and closes them itself, in the tap, so the layout is
     final before the next frame and the row is put back under the finger
     in the same task (Safari has no native scroll anchoring). A ticket
     ABOVE the tapped row is closed only when the page can scroll back by
     its height; otherwise it stays open and nothing jumps. ── */
  var fares = $$('details.fare');
  var faresBox = $('fares');
  var last = null;
  function openFare() {
    if (last && last.open) return last;
    for (var i = 0; i < fares.length; i++) if (fares[i].open) return fares[i];
    return null;
  }
  function scrollByY(dy) { try { scrollBy({ top: dy, left: 0, behavior: 'instant' }); } catch (e) { scrollBy(0, dy); } }
  function toggleFare(d) {
    var s = d.querySelector('summary'), y0 = s.getBoundingClientRect().top;
    var opening = !d.open, closed = [], was = act ? act.parentNode : null;
    pinned = null;
    if (opening) fares.forEach(function (o) { if (o !== d && o.open) { o.open = false; closed.push(o); } });
    d.open = opening;
    if (opening) last = d;
    sync();
    var dy = s.getBoundingClientRect().top - y0;
    if (dy < -1 && scrollY + dy < -1) {
      /* not enough page above to scroll back: the tickets above stay open */
      var back = closed.filter(function (o) { return !!(o.compareDocumentPosition(d) & 4); });
      if (back.length) {
        back.forEach(function (o) { o.open = true; });
        sync();
        dy = s.getBoundingClientRect().top - y0;
        /* the door leaving the ticket above still pulls the row up: it stays
           where it was (the strip offers it while it is off the screen) */
        if (dy < -1 && scrollY + dy < -1 && was && was !== act.parentNode && was.closest('details.fare')) {
          pinned = was;
          sync();
          dy = s.getBoundingClientRect().top - y0;
        }
      }
    }
    if (Math.abs(dy) > 1) scrollByY(dy);
    if (opening) track('fare_open', { plan: d.getAttribute('data-plan'), market: C.SLUG });
  }
  fares.forEach(function (d) {
    d.removeAttribute('name');
    d.querySelector('summary').addEventListener('click', function (e) { e.preventDefault(); toggleFare(d); });
    /* an open set by anyone else (the paid return, the browser's find-in-page) */
    d.addEventListener('toggle', function () { sync(); });
  });

  /* ── the action: ONE node (the door, its form, the states). It sits in the
     stub — or, on a phone, inside the open ticket. Never two doors. ── */
  var act = $('act'), stubSlot = $('stubSlot'), pinned = null;
  function currentSlot() {
    if (wide.matches) return stubSlot;
    /* pinned: the door stays in a ticket above that the page could not scroll past */
    if (pinned && pinned.closest('details.fare') && pinned.closest('details.fare').open) return pinned;
    pinned = null;
    var o = openFare();
    return (o && o.querySelector('[data-slot]')) || stubSlot;
  }
  function place() {
    var s = currentSlot();
    if (!s || !act || act.parentNode === s) return;
    var had = act.contains(document.activeElement) ? document.activeElement : null;
    s.appendChild(act);
    if (had) {
      try { had.focus({ preventScroll: true }); } catch (e) {}
      var hr = had.getBoundingClientRect();
      if (hr.top < 0 || hr.bottom > innerHeight - stripH()) had.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }
  var plan = '';
  function sync() {
    var o = openFare();
    if (faresBox) faresBox.classList.toggle('fs-open', !!(o && o.hasAttribute('data-fs')));
    place();
    plan = o ? o.getAttribute('data-plan') : '';
    if (state() === 'blank') {
      var p = planOf(plan);
      if ($('notSure')) $('notSure').hidden = !!p;
      if ($('planLn')) { $('planLn').hidden = !p; if (p) txt('planName', p.label); }
    }
    stripSync();
  }
  if (wide.addEventListener) wide.addEventListener('change', sync);
  else if (wide.addListener) wide.addListener(sync);
  function state() { return pass.getAttribute('data-state') || 'blank'; }

  /* ── errors said in place, gone as soon as the visitor fixes them ── */
  function setErr(input, msg) {
    var e = $(input.getAttribute('aria-describedby'));
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    if (e) e.textContent = msg || '';
    return !msg;
  }
  $$('input[aria-describedby]').forEach(function (i) {
    i.addEventListener('input', function () { if (i.getAttribute('aria-invalid') === 'true') setErr(i, ''); });
  });
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function splitContact(v) {
    v = String(v || '').trim();
    if (/@/.test(v)) return EMAIL.test(v) ? { email: v } : { bad: 'email' };
    /* as typed: the server reads "+31 (0)6 …" with the desk's country (cityPhone) */
    return (v.match(/\d/g) || []).length >= 7 ? { phone: v.slice(0, 40) } : { bad: 'contact' };
  }

  /* ── the free door: the first tap reveals two fields, the second sends ── */
  var form = $('fileForm'), door = $('door'), opened = false, sending = false;
  /* one request id per load: a retried send files the same lead */
  var requestId = (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^a-z0-9]/g, '');
  function openForm(focus) {
    var box = $('fFields');
    if (!box || !door) return;
    if (!opened) {
      opened = true; box.hidden = false; box.classList.add('in');
      door.setAttribute('aria-expanded', 'true');
      track('hero_cta', { location: 'door', plan: plan || 'none', market: C.SLUG });
    }
    if (focus) {
      var nm = $('fName');
      var r = act.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight * 0.6) act.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      /* any focus the visitor moves in the meantime wins over ours */
      var movedOn = false, mark = function () { movedOn = true; };
      document.addEventListener('focusin', mark, true);
      setTimeout(function () {
        document.removeEventListener('focusin', mark, true);
        if (movedOn) return;
        try { nm.focus({ preventScroll: true }); } catch (e) { nm.focus(); }
      }, reduce ? 0 : 320);
    }
  }
  if (form && door) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!opened) { openForm(true); return; }
      if (sending) return;
      var nm = $('fName'), ct = $('fContact'), name = nm.value.trim(), c = splitContact(ct.value);
      var okN = setErr(nm, name.length < 2 ? form.getAttribute('data-err-name') : '');
      var okC = setErr(ct, c.bad === 'email' ? form.getAttribute('data-err-email') : c.bad ? form.getAttribute('data-err-contact') : '');
      if (!okN) { nm.focus(); track('form_error', { form: 'file', field: 'name', market: C.SLUG }); return; }
      if (!okC) { ct.focus(); track('form_error', { form: 'file', field: 'contact', market: C.SLUG }); return; }
      /* the plan the visitor was reading when they asked for the call (their
         tap; nothing pre-selected otherwise: the server reads "to decide") */
      var picked = planOf(plan) ? plan : '';
      var body = { city: C.SLUG, name: name, service: picked, requestId: requestId, company: ($('fCompany') || {}).value || '' };
      if (c.email) body.email = c.email; else body.phone = c.phone;
      sending = true; door.setAttribute('aria-disabled', 'true'); txt('fNetErr', '');
      var label = $('doorL'), was = label.textContent;
      label.textContent = form.getAttribute('data-sending') || was;
      track('generate_lead', { channel: 'form', source_page: C.SLUG, plan: picked || 'none' });
      postJson(C.LEAD_URL || '/api/city-lead', body).then(function (r) {
        if (!r || !r.ok) throw new Error('lead');
        sending = false; door.removeAttribute('aria-disabled');
        setState('open', { name: name, file: r.file || '' });
        track('sign_up', { method: 'city_form', market: C.SLUG });
        convert('City file opened');
      }).catch(function () {
        sending = false; door.removeAttribute('aria-disabled'); label.textContent = was;
        txt('fNetErr', form.getAttribute('data-err-net'));
        track('form_error', { form: 'file', field: 'net', market: C.SLUG });
      });
    });
    /* the door is served disabled: without this script a submit would be a
       GET to the page with the contact data in the address bar */
    door.disabled = false;
  }

  /* ── the states, printed where the door was ── */
  function show(id) {
    ['cOpen', 'cConfirm', 'cPaid'].forEach(function (k) { var n = $(k); if (n) n.hidden = k !== id; });
    var n = $(id); if (!n) return;
    n.classList.remove('in'); void n.offsetWidth; n.classList.add('in');
    var st = n.querySelector('.stamp'); if (st) { st.classList.remove('hit'); void st.offsetWidth; st.classList.add('hit'); }
  }
  var moved = false;
  ['wheel', 'touchstart', 'keydown'].forEach(function (t) { addEventListener(t, function () { moved = true; }, { passive: true, once: true }); });
  function land(node, always) {
    if (!node) return;
    var r = node.getBoundingClientRect();
    if (always || r.top < 0 || r.bottom > innerHeight - stripH()) node.scrollIntoView({ block: r.height > innerHeight * 0.8 ? 'start' : 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    try { node.focus({ preventScroll: true }); } catch (e) {}
  }
  function setState(s, d) {
    d = d || {};
    pass.setAttribute('data-state', s);
    /* no second till, and no money asked right after a free door was promised */
    $$('[data-pay]').forEach(function (b) { b.hidden = s !== 'blank'; });
    if (s !== 'blank') closeTill();
    if (form) form.hidden = s !== 'blank';
    if ($('notSure')) $('notSure').hidden = true;
    if ($('planLn')) $('planLn').hidden = true;
    var st = pass.querySelector('.slot .slot-t');
    if (s === 'open') {
      slot('OPEN', 'File open');
      txt('oName', String(d.name || '').slice(0, 40) || '—');
      txt('oFile', d.file || '—');
      txt('oNext', nextLine() || ($('oNext') || {}).textContent);
      show('cOpen'); land($('cOpen'));
    } else if (s === 'confirming' || s === 'unconfirmed') {
      if (st) st.textContent = s === 'confirming' ? 'Confirming' : 'Not confirmed';
      txt('slotSr', s === 'confirming' ? 'Payment being confirmed' : 'Payment not confirmed yet');
      if (s === 'unconfirmed' && $('cConfirm')) txt('cText', $('cConfirm').getAttribute('data-unconfirmed'));
      show('cConfirm');
    } else if (s === 'paid') {
      var p = planOf(d.plan) || {};
      slot('PAID', 'Paid');
      txt('pFile', d.file || '—');
      txt('pFare', (p.label || '') + ' · ' + eur(p.eur || 0));
      var P = C.PAID || {};
      var waits = d.startNow === false;
      txt('pStart', !waits ? (P.startsNow || '') : d.workFromLabel ? String(P.startsWait || '{date}').replace('{date}', d.workFromLabel) : ((P.nextWait || [])[1] || [''])[0]);
      /* a payer who did not tick "Start now": the three steps of the wait,
         never "same working day"; the wait note in place of the generic one */
      if (waits) {
        var li = $$('#pNext li');
        (P.nextWait || []).forEach(function (pair, i) { if (li[i]) { li[i].textContent = ''; var b = document.createElement('b'); b.textContent = pair[0]; li[i].appendChild(b); li[i].appendChild(document.createTextNode(' ' + pair[1])); } });
        if ($('pWait')) $('pWait').hidden = false;
        if ($('pText')) $('pText').hidden = true;
      }
      show('cPaid');
    }
    stripSync();
  }

  /* ── the till: only from an explicit pay button; the plan is already chosen ── */
  /* the till exists only where the build opened the checkout (a waitlist page has none) */
  var till = sell ? $('till') : null, tf = sell ? $('tillForm') : null, opener = null, paying = false;
  function payLabels() {
    var p = planOf(tf.getAttribute('data-plan')), now = $('tStart').checked, go = $('tGo');
    if (!p) return;
    txt('tGoL', go.getAttribute(now ? 'data-label-now' : 'data-label-wait') + ' · ' + eur(p.eur));
    txt('tGoS', go.getAttribute(now ? 'data-sub-now' : 'data-sub-wait'));
  }
  function openTill(id, from) {
    var p = planOf(id);
    if (!p || !till || state() !== 'blank' || sending) return;
    opener = from || null;
    tf.setAttribute('data-plan', id);
    txt('tTitle', p.label); txt('tPrice', eur(p.eur)); txt('tCond', p.condition); txt('tTag', p.name);
    var ul = $('tInc'); ul.textContent = '';
    p.includes.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    $('tRule').hidden = !p.rule;
    /* the till fills itself from what the visitor already typed, never the other way round */
    var fn = $('fName'), c = splitContact(($('fContact') || {}).value);
    if (fn && fn.value && !$('tName').value) $('tName').value = fn.value.trim();
    if (c.email && !$('tEmail').value) $('tEmail').value = c.email;
    txt('tErr', '');
    $$('#tillForm input[aria-invalid]').forEach(function (i) { setErr(i, ''); });
    $('tStart').checked = false; $('tGo').removeAttribute('aria-disabled'); paying = false; payLabels();
    if (typeof till.showModal === 'function') { try { till.showModal(); } catch (e) { till.setAttribute('open', ''); } } else till.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    stripSync();
    track('begin_checkout', { currency: 'EUR', value: p.eur, items: [{ item_id: 'city_' + C.SLUG + '_' + id, item_name: p.label }], market: C.SLUG });
    try { $('tTitle').focus({ preventScroll: true }); } catch (e) {}
  }
  var payTok = 0;
  function closeTill() {
    payTok++;
    if (till && till.open) { if (typeof till.close === 'function') till.close(); else till.removeAttribute('open'); }
  }
  if (till && tf) {
    $$('[data-pay]').forEach(function (b) {
      b.addEventListener('click', function () {
        /* a payment being confirmed, or paid, is never paid twice; nor is a
           till opened while the free door is filing (it promised no card) */
        if (state() !== 'blank' || sending) { land(act, true); return; }
        openTill(b.getAttribute('data-pay'), b);
      });
    });
    $('tStart').addEventListener('change', payLabels);
    /* Enter on the tick does not pay */
    tf.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.type === 'checkbox') e.preventDefault(); });
    $('tillX').addEventListener('click', closeTill);
    /* a tap on the backdrop closes: the backdrop is the dialog's own box outside its content */
    till.addEventListener('click', function (e) {
      if (e.target !== till) return;
      var r = till.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeTill();
    });
    till.addEventListener('close', function () {
      document.documentElement.style.overflow = '';
      if (opener && document.contains(opener) && !opener.hidden) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
      stripSync();
    });
    /* "Prefer to talk first?" — the free door, in the same ticket */
    $('tAlt').addEventListener('click', function () { opener = null; closeTill(); openForm(true); });
    tf.addEventListener('submit', function (e) {
      e.preventDefault();
      if (paying || state() !== 'blank') return;
      var n = $('tName'), m = $('tEmail'), bad = null;
      if (!setErr(n, n.value.trim().length < 2 ? till.getAttribute('data-err-name') : '')) bad = bad || n;
      if (!setErr(m, EMAIL.test(m.value.trim()) ? '' : till.getAttribute('data-err-email'))) bad = bad || m;
      if (bad) { bad.focus(); track('form_error', { form: 'till', market: C.SLUG }); return; }
      var id = tf.getAttribute('data-plan'), p = planOf(id);
      if (!p) return;
      paying = true; $('tGo').setAttribute('aria-disabled', 'true'); txt('tErr', '');
      var tok = payTok;
      track('add_payment_info', { currency: 'EUR', value: p.eur, market: C.SLUG });
      postJson(C.CHECKOUT_ENDPOINT || '/api/service-checkout', {
        city: C.SLUG, kind: id, name: n.value.trim(), email: m.value.trim(),
        notes: ($('tNote').value || '').trim(),
        /* the payer's own request to start inside the 14-day withdrawal
           period — never pre-ticked; without it the desk starts when the
           14 days end (Directive 2011/83/EU art. 7(3)) */
        startNow: $('tStart').checked === true,
        company: ($('tCompany').value || '').trim()
      }).then(function (r) {
        /* the visitor closed the till (or the page moved on) while it flew: stay */
        if (tok !== payTok || !till.open) { paying = false; $('tGo').removeAttribute('aria-disabled'); return; }
        if (r && r.ok && r.url) { location.href = r.url; return; }
        throw new Error((r && r.error) || 'failed');
      }).catch(function () {
        paying = false; $('tGo').removeAttribute('aria-disabled'); payLabels();
        if (tok === payTok) txt('tErr', till.getAttribute('data-err-net'));
      });
    });
    /* back from Stripe via the bfcache: the till starts clean */
    addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      paying = false; $('tGo').removeAttribute('aria-disabled');
      closeTill(); document.documentElement.style.overflow = '';
      if (state() === 'blank') payLabels();
    });
  }

  /* ── the return from checkout: PAID only on the server's word.
     ?paid=<plan>&start=<0|1>&session_id=cs_… → "being confirmed", then GET
     /api/city-lead?paid= at 0/1.5/3/6/12 s; only paid:true stamps PAID and
     counts ONE purchase (sessionStorage). The address bar proves nothing. ── */
  function handleReturn() {
    if (!sell) return;
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var id = q.get('paid'), sid = q.get('session_id') || '';
    if (!id) return;
    var clean = function () { try { history.replaceState(null, '', location.pathname); } catch (e) {} };
    if (!planOf(id) || !/^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(sid)) { clean(); return; }
    /* a legacy #contact fragment: the browser would scroll there at load */
    if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    var row = $('fare-' + id);
    if (row && !row.open) { row.open = true; sync(); }
    setState('confirming');
    var landOnce = function () { if (!moved) land($('cConfirm').hidden ? $('cPaid') : $('cConfirm'), true); };
    setTimeout(landOnce, 50);
    if (document.readyState !== 'complete') addEventListener('load', landOnce, { once: true });
    var at = [0, 1500, 3000, 6000, 12000], n = 0, done = false;
    (function ask() {
      if (done) return;
      if (n >= at.length) { setState('unconfirmed'); return; }
      var wait = at[n] - (n ? at[n - 1] : 0);
      n++;
      setTimeout(function () {
        fetch((C.LEAD_URL || '/api/city-lead') + '?paid=' + encodeURIComponent(sid) + '&city=' + encodeURIComponent(C.SLUG), { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (v) {
            if (v && v.paid === true && !done) {
              done = true;
              var vp = planOf(v.plan) ? v.plan : id, p = planOf(vp);
              setState('paid', { plan: vp, file: v.file, startNow: v.startNow, workFromLabel: v.workFromLabel });
              if (!moved) land($('cPaid'), true);
              var key = 'boom-paid-' + sid;
              if (!store.get(key)) {
                store.set(key, '1');
                /* the Stripe session id names a payer: GA gets an opaque hash (FNV-1a), never the id */
                var h = 0x811c9dc5;
                for (var i = 0; i < sid.length; i++) { h ^= sid.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
                track('purchase', { transaction_id: 'city_' + C.SLUG + '_' + ('0000000' + h.toString(16)).slice(-8), currency: 'EUR', value: p.eur, items: [{ item_id: 'city_' + C.SLUG + '_' + vp, item_name: p.label, price: p.eur, quantity: 1 }], market: C.SLUG });
                convert('City payment confirmed');
              }
              clean();
              return;
            }
            ask();
          }, ask);
      }, wait);
    })();
  }

  /* ── the strip: one door, only while the pass's door is off the screen ── */
  var strip = $('strip'), doorGone = false;
  function stripH() { return strip && strip.classList.contains('on') ? strip.offsetHeight : 0; }
  function stripSync() {
    if (!strip) return;
    var on = doorGone && state() === 'blank' && innerWidth < 760 && !(till && till.open);
    if (strip.classList.contains('on') === on) return;
    strip.classList.toggle('on', on);
    if (on) strip.removeAttribute('inert'); else strip.setAttribute('inert', '');
    strip.setAttribute('aria-hidden', on ? 'false' : 'true');
    document.documentElement.style.setProperty('--strip-h', on ? strip.offsetHeight + 'px' : '0px');
  }
  if (strip && door && 'IntersectionObserver' in window) {
    /* the gold button itself, half of it at least: the "not sure" line
       peeking in at the foot of the screen is not a door */
    new IntersectionObserver(function (es) { var e = es[es.length - 1]; doorGone = !(e.isIntersecting && e.intersectionRatio >= 0.5); stripSync(); }, { threshold: [0, 0.5, 1] }).observe(door);
    addEventListener('resize', stripSync);
    $('stripGo').addEventListener('click', function () { track('strip_click', { market: C.SLUG }); openForm(true); });
  }

  /* ── small things: the WhatsApp links, the questions ── */
  $$('a[href^="https://wa.me/"]').forEach(function (a) {
    a.addEventListener('click', function () { track('wa_open', { location: a.id || 'link', plan: plan || 'none', market: C.SLUG }); });
  });
  $$('#faq details').forEach(function (d, i) { d.addEventListener('toggle', function () { if (d.open) track('faq_open', { market: C.SLUG, question_index: i }); }); });

  sync();
  refreshClock();
  handleReturn();
  track('page_view_market', { market: C.SLUG });
  window.BOOM_TICKET = { state: state, setState: setState, openTill: openTill, nextLine: nextLine };
})();
