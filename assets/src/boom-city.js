/* assets/boom-city.js — the city desks (v1.6, «the complete aviation desk»).
   Reads window.BOOM_CITY (the build's config) and window.BOOM_DESK_CAL (the
   desk calendar, inlined from js/desk-calendar.js); posts only to our own
   API. The pass: blank → open (a 200 from /api/city-lead, the SERVER's file
   number) → paid (GET /api/city-lead?paid= says paid:true); on a desk that
   charges at signing (v1.8) → booked (the order's answer, or the managed
   ticket's GET ?order=: booked · due · paid · closed). The page never
   computes a file number or a payment state on its own. Every instrument
   below shows a fact the page already holds; motion only when a fact
   changes, the desk is open, or the reader moves. */
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
  var root = document.documentElement, IO = 'IntersectionObserver' in window;
  /* §C the walk's entrances: a section gets .in once it comes into view.
     html[data-armed] tells the head's curtain the script is here (without
     it in 3 s, html.vivo comes off and nothing waits hidden). */
  if (IO) {
    var secIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); secIO.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    $$('.sec').forEach(function (s) { secIO.observe(s); });
    root.setAttribute('data-armed', '');
  }
  var sell = C.CHECKOUT === true;
  /* a desk still opening (Paris, Berlin) is never "open": its instruments
     say when a reply comes, never "desk open" (loi Hoguet, §34c GewO) */
  var waitlist = C.MODE === 'waitlist';
  /* v1.8: a desk that charges at signing (Paris, Berlin) takes an ORDER at its till, never a payment: the
     server's answer stamps BOOKED (its own state, never PAID, never a purchase) and the email's link opens
     the managed ticket (?order=&t=). The six carry no CHARGE_AT: none of it reaches them */
  var SIGN = C.CHARGE_AT === 'signing', BK = C.BOOKED || {};
  function track(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} }
  function convert(label) { try { window.dispatchEvent(new CustomEvent('boom-conversion', { detail: { label: label, section: 'pass' } })); } catch (e) {} }
  var CUR = C.CURRENCY || 'EUR', eur = function (n) { return (C.SYMBOL || '€') + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  /* an invoice amount keeps its cents (a fee under its cap: €476.19; a fee never reaches the thousands); a
     day from the server (YYYY-MM-DD) in words, from a fixed table (never toLocaleString) */
  var amt = function (n) { var x = Math.round(n * 100) / 100; return x % 1 ? (C.SYMBOL || '€') + x.toFixed(2) : eur(x); };
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var dayOf = function (v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m && MON[m[2] - 1] ? +m[3] + ' ' + MON[m[2] - 1] + ' ' + m[1] : ''; };
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
  /* the window said where the reader acts (data-window: the door, the strip)
     and on the instruments (data-gate: the header chip, its door twin, the
     Departures foot, the gate, the outlined door) — one line, one source */
  function sayLine(w) {
    if (!waitlist) return w.line;
    var z = w.tz ? ' ' + w.tz : '';
    return w.open ? 'replies until ' + w.until + z : 'replies ' + (/^To/.test(w.day) ? w.day.toLowerCase() : w.day) + ' from ' + w.from + z;
  }
  function fill(attr, line) {
    $$('[' + attr + ']').forEach(function (n) {
      var t = n.getAttribute(attr).replace('{w}', line);
      if (n.textContent !== t) n.textContent = t;
    });
  }
  function refreshClock() {
    var now = new Date(), w = win();
    if (w) {
      var line = sayLine(w);
      fill('data-window', line); fill('data-gate', line);
      /* the one hook for every "open" dot (the chip, the pill, the gate's pulse) */
      root.setAttribute('data-desk', w.open ? 'open' : 'closed');
      var pl = $('depPill');
      if (pl) { pl.hidden = false; txt('depPillT', waitlist ? (w.open ? 'REPLYING' : 'OFFLINE') : w.open ? 'DESK OPEN' : 'DESK CLOSED'); }
      $$('.dep-f').forEach(function (n) { n.hidden = false; });
      if (window.BOOM_ONDA && BOOM_ONDA.setOpen) BOOM_ONDA.setOpen(w.open);
    }
    gate(now);
    /* row 01 follows the desk's clock: "REPLY TODAY" never outlives closing time */
    if (lastS === 'open' || lastS === 'paid' || lastS === 'booked') depFact(lastS, lastD);
    if (pass.getAttribute('data-state') === 'open') txt('oNext', nextLine());
    /* the next minute boundary, never a countdown */
    setTimeout(refreshClock, 60000 - (Date.now() % 60000) + 50);
  }

  /* ── §C.4 the gate: the desk's clock (a Solari board, the desk's zone),
     the reader's own clock (computed here, never sent), and the desk's
     real week (desk days minus the webhook's holidays — never a name) ── */
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var ckB = null, ckIO = null, ckSeen = !IO, weekKey = '';
  function gate(now) {
    var p = CAL && C.DESK ? CAL.zoneParts(now, C.DESK.timeZone) : null, box = $('clocks'), h = $('ckDesk'), you = $('ckYou');
    if (!p || !box) return;
    var hm = two(Math.floor(p.min / 60)) + ':' + two(p.min % 60), fresh = false;
    box.hidden = false;
    /* the board where it is seen: in the stub (≥940, the first screen) at
       once; below, plain text until the Gate comes within a screen (no
       Solari calibration in the boot task) */
    if (!ckB && !ckSeen && !ckIO && h && !wide.matches) {
      ckIO = new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) { ckSeen = true; ckIO.disconnect(); gate(new Date()); } }, { rootMargin: '100% 0px' });
      ckIO.observe(box);
    }
    if (!ckB && window.BoomSolari && h && (ckSeen || wide.matches)) { ckB = new window.BoomSolari.Board(h, 5, ' 0123456789:'); h.classList.add('live'); fresh = true; }
    /* a minute later only the changed cells flip; never a countdown */
    if (!ckB) txt('ckDesk', hm); else if (fresh || reduce) ckB.show(hm, 60, fresh && !reduce); else ckB.update(hm);
    txt('ckZone', p.tz);
    /* said with the clock's own label (its zone: the desk answers from Rome) */
    var lab = box.querySelector('.ck-l');
    txt('ckDeskSr', (lab ? lab.textContent : 'Desk time') + ': ' + hm + (p.tz ? ' ' + p.tz : ''));
    var same = now.getFullYear() === p.y && now.getMonth() + 1 === p.m && now.getDate() === p.d && now.getHours() * 60 + now.getMinutes() === p.min;
    txt('ckYou', same ? 'Same time as you' : two(now.getHours()) + ':' + two(now.getMinutes()));
    if (you) you.classList.toggle('same', same);
    if (p.key !== weekKey) { weekKey = p.key; week(p); }
  }
  function week(p) {
    var ol = $('week'), D = C.DESK;
    if (!ol || !D || !D.days) return;
    var hrs = D.hours ? D.hours.from + '–' + D.hours.to : '';
    for (var i = 0; i < 7; i++) {
      var li = ol.children[i];
      if (!li) { li = document.createElement('li'); li.style.setProperty('--i', i); ol.appendChild(li); }
      /* a calendar day in UTC at noon, the webhook's own form */
      var dt = new Date(Date.UTC(p.y, p.m - 1, p.d + i, 12)), wd = dt.getUTCDay(), n = dt.getUTCDate();
      var open = D.days.indexOf(wd) >= 0 && !CAL.isDeskHoliday(dt, C.HOLIDAYS);
      li.className = (open ? 'open' : 'closed') + (i ? '' : ' today');
      li.textContent = '';
      var b = document.createElement('b'), s = document.createElement('span');
      b.textContent = DAYS[wd].slice(0, 3); s.textContent = n;
      li.appendChild(b); li.appendChild(s);
      if (!open) { var x = document.createElement('i'); x.textContent = 'closed'; li.appendChild(x); }
      li.setAttribute('aria-label', DAYS[wd] + ' ' + n + (waitlist ? (open ? ', replies ' + hrs : ', no replies') : open ? ', desk open ' + hrs : ', desk closed'));
      if (i) li.removeAttribute('aria-current'); else li.setAttribute('aria-current', 'date');
    }
    ol.hidden = false;
  }

  /* ── §C.1 Departures: the statuses mount once, when the board comes into
     view (one flip in, staggered); row 01 changes only on a server event
     (setState), and its flap waits until the board is on screen — the
     screen-reader twin and #depLive say it at once ── */
  var dep = { hosts: $$('.dep .st-b'), b: [], want: [], go: [], mounted: false, seen: !IO };
  dep.hosts.forEach(function (h, i) { dep.want[i] = h.getAttribute('data-word') || h.textContent; });
  function depMount() {
    dep.mounted = true;
    dep.hosts.forEach(function (h, i) {
      if (!window.BoomSolari) return;
      var b = dep.b[i] = new window.BoomSolari.Board(h, 12, ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
      h.classList.add('live');
      if (reduce || !IO) { b.show(dep.want[i]); dep.go[i] = 1; return; }
      /* the first fill reads the word wanted THEN (a fact may have come meanwhile) */
      setTimeout(function () { dep.go[i] = 1; b.show(dep.want[i], 60, true); }, 500 + i * 90);
    });
  }
  function depFlip() {
    var b = dep.b[0];
    if (!b) { if (dep.mounted && dep.hosts[0]) dep.hosts[0].textContent = dep.want[0]; return; }
    if (!dep.go[0]) return;
    if (reduce) b.show(dep.want[0]); else b.update(dep.want[0]);
  }
  if (dep.hosts.length) {
    var depBox = dep.hosts[0].closest('.dep') || dep.hosts[0];
    if (IO) new IntersectionObserver(function (es) {
      /* the ratio, not isIntersecting: a sliver at the edge is not "in view" */
      var e = es[es.length - 1];
      dep.seen = e.isIntersecting && e.intersectionRatio >= .35;
      if (!dep.seen) return;
      if (!dep.mounted) depMount(); else depFlip();
    }, { threshold: .35 }).observe(depBox);
    else depMount();
  }
  var DAY3 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], lastS = '', lastD = null;
  function depFact(s, d) {
    lastS = s; lastD = d;
    var w = win(), today = !!w && (w.open || w.day === 'Today'), when = !w ? '' : today ? 'TODAY' : DAY3[w.wd] || '', word = '', say = '';
    /* the board takes the drum's three letters; its screen-reader twin and
       #depLive say the words ("reply Monday", "from 4 November") */
    var day = today ? 'today' : w ? DAYS[w.wd] : '';
    /* sell: "Valentino writes to set your free call" — REPLY on the desk's
       next open day; a waitlist: the file is open, nothing more is promised */
    if (s === 'open') { word = sell ? (when && 'REPLY ' + when) : 'FILE OPEN'; say = sell ? 'reply ' + day : 'file open'; }
    /* an order just BOOKED (a desk that charges at signing) starts the work as a payment does; the managed
       ticket (d.st, read days later) says nothing here */
    else if ((s === 'paid' || (s === 'booked' && !d.st)) && sell) {
      if (d.startNow === false) {
        /* the payer did not tick Start now: the server's first working day */
        var m = /^(\d{1,2}) ([A-Za-z]{3,9})/.exec(String(d.workFromLabel || ''));
        word = m ? 'FROM ' + m[1] + ' ' + m[2].slice(0, 3).toUpperCase() : '';
        say = m ? 'from ' + m[1] + ' ' + m[2] : '';
      } else { word = when && 'START ' + when; say = 'start ' + day; }
    }
    if (!word || word === dep.want[0] || !dep.hosts.length) return;
    dep.want[0] = word;
    txt('dep-1-sr', 'Status: ' + say);
    txt('depLive', 'Step 1: ' + say);
    if (dep.seen && dep.mounted) depFlip();
  }

  /* ── the fares: a row opens ITS ticket in place; the tapped row stays put
     (Safari has no scroll anchoring: the page corrects in the tap). Without
     JS: an exclusive accordion (<details name>). A ticket above is closed
     only when the page can scroll back by its height. ── */
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
    /* the reader's tap: a small ripple from the ticket's price (the onda, §D) */
    if (opening) { track('fare_open', { plan: d.getAttribute('data-plan'), market: C.SLUG }); ping(d.querySelector('.f-price'), 's'); }
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
    /* the ONE clocks node: in the stub's gate on a desktop pass, in the Gate section below */
    var ck = $('clocks'), to = $(wide.matches ? 'stubGate' : 'deskClocks');
    /* the ONE onda canvas: behind the page on a desktop (the pass paper is translucent at the
       top), INSIDE the pass on a phone — the card's living security print. Crossing 940 moves
       it; its ResizeObserver re-measures (v1.7 §D) */
    var cv = $('onda'), home = wide.matches ? document.body : pass;
    if (cv && cv.parentNode !== home) home.insertBefore(cv, home.firstChild);
    if (ck && to && ck.parentNode !== to) { to.appendChild(ck); if (ckB) window.BoomSolari.calibrate($('ckDesk'), ' 0123456789:'); }
    var s = currentSlot();
    if (!s || !act || act.parentNode === s) return;
    var had = act.contains(document.activeElement) ? document.activeElement : null;
    s.appendChild(act);
    if (had) {
      try { had.focus({ preventScroll: true }); } catch (e) {}
      var hr = had.getBoundingClientRect();
      if (hr.top < topLim() || hr.bottom > innerHeight - stripH()) had.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }
  /* v1.7: on a desk (>=940) the CLOSED Full Search ticket shows its quiet pay button under the stub; it is the
     same node that sits in the open ticket's stub (one [data-pay] per plan), moved by the page like the door */
  var fsPay = $$('[data-pay="full-search"]')[0], fsBp = fsPay && fsPay.closest('.bp'), fsSlot = fsBp && fsBp.querySelector('.bp-pay'), fsHome = fsPay && fsPay.parentNode;
  function placePay() {
    if (!fsPay || !fsSlot) return;
    var fs = $('fare-full-search'), to = wide.matches && fs && !fs.open ? fsSlot : fsHome;
    if (fsPay.parentNode !== to) to.appendChild(fsPay);
  }
  var plan = '';
  function sync() {
    var o = openFare();
    if (faresBox) faresBox.classList.toggle('fs-open', !!(o && o.hasAttribute('data-fs')));
    /* an open economy ticket unfolds the pair into rows (the class covers a browser without :has) */
    var bps = faresBox && faresBox.querySelector('.bps');
    if (bps) bps.classList.toggle('pair-open', !!(o && !o.parentNode.classList.contains('eroe')));
    place();
    placePay();
    plan = o ? o.getAttribute('data-plan') : '';
    if (state() === 'blank') {
      var p = planOf(plan);
      if ($('notSure')) $('notSure').hidden = !!p;
      if ($('planLn')) { $('planLn').hidden = !p; if (p) txt('planName', p.label); }
    }
    doorTwins();
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
      if (r.top < topLim() || r.top > innerHeight * 0.6) act.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
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
      /* The template loads the brief editor only for a deliberate Flight handoff.
         Its capture guard blocks premature sends while that download is pending. */
      if (window.BoomJourneyHandoff) Object.assign(body, BoomJourneyHandoff.cityLead());
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
    ['cOpen', 'cConfirm', 'cPaid', 'cBooked'].forEach(function (k) { var n = $(k); if (n) n.hidden = k !== id; });
    var n = $(id); if (!n) return;
    n.classList.remove('in'); void n.offsetWidth; n.classList.add('in');
    var st = n.querySelector('.stamp'); if (st) { st.classList.remove('hit'); void st.offsetWidth; st.classList.add('hit'); }
  }
  var moved = false;
  ['wheel', 'touchstart', 'keydown'].forEach(function (t) { addEventListener(t, function () { moved = true; }, { passive: true, once: true }); });
  function land(node, always) {
    if (!node) return;
    var r = node.getBoundingClientRect();
    if (always || r.top < topLim() || r.bottom > innerHeight - stripH()) node.scrollIntoView({ block: r.height > innerHeight * 0.8 ? 'start' : 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    try { node.focus({ preventScroll: true }); } catch (e) {}
  }
  function setState(s, d) {
    d = d || {};
    pass.setAttribute('data-state', s);
    /* the issue (OPEN, PAID): the foil flashes once (.struck: remove, reflow,
       add), the plane moves (the CSS reads data-state; data-hold parks it
       before leg 1 when the payer did not tick Start now), and the code line
       prints the SERVER's file code — "—" without one, never one of ours */
    var issued = s === 'open' || s === 'paid' || s === 'booked', I = C.IATA || '', f = d.file || '—';
    /* BOOKED (v1.8): the word of the order, or of the managed ticket after it — DUE, PAID, CLOSED */
    var ms = s === 'booked' ? { due: 'DUE', paid: 'PAID', withdrawn: 'CLOSED', closed: 'CLOSED' }[d.st] || 'BOOKED' : '';
    pass.classList.remove('struck');
    if ((s === 'paid' || ms === 'BOOKED') && d.startNow === false) pass.setAttribute('data-hold', ''); else pass.removeAttribute('data-hold');
    if (issued) { void pass.offsetWidth; pass.classList.add('struck'); }
    if (s === 'open') txt('codeLine', 'FILE ' + f + ' · ' + I + ' · TENANT SIDE');
    else if (s === 'paid') txt('codeLine', 'PAID · FILE ' + f + ' · ' + I);
    else if (ms) txt('codeLine', ms + ' · FILE ' + f + ' · ' + I);
    depFact(s, d);
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
      show('cOpen'); ping($('cOpen').querySelector('.stamp'), 'l'); land($('cOpen'));
    } else if (s === 'confirming' || s === 'unconfirmed') {
      if (st) st.textContent = s === 'confirming' ? 'Confirming' : 'Not confirmed';
      txt('slotSr', (SIGN ? 'Order' : 'Payment') + (s === 'confirming' ? ' being confirmed' : ' not confirmed yet'));
      if (s === 'unconfirmed' && $('cConfirm')) txt('cText', $('cConfirm').getAttribute('data-unconfirmed'));
      show('cConfirm');
    } else if (s === 'paid') {
      var p = planOf(d.plan) || {};
      slot('PAID', 'Paid');
      txt('pFile', d.file || '—');
      txt('pFare', (p.label || '') + ' · ' + eur(p.eur || 0));
      starts('p', C.PAID || {}, d);
      show('cPaid'); ping($('cPaid').querySelector('.stamp'), 'p');
    } else if (ms) booked(ms, d);
    doorTwins();
  }
  /* the start and the steps of a PAID or BOOKED card (k: its ids' prefix): ticked, the desk's first open
     hour; a payer who did not tick "Start now" gets the server's first working day after the 14 days, the
     three steps of the wait (never "same working day") and the wait note in place of the generic one */
  function starts(k, P, d) {
    var waits = d.startNow === false;
    txt(k + 'Start', !waits ? (P.startsNow || '') : d.workFromLabel ? String(P.startsWait || '{date}').replace('{date}', d.workFromLabel) : ((P.nextWait || [])[1] || [''])[0]);
    if (!waits) return;
    var li = $$('#' + k + 'Next li');
    (P.nextWait || []).forEach(function (pair, i) { if (li[i]) { li[i].textContent = ''; var b = document.createElement('b'); b.textContent = pair[0]; li[i].appendChild(b); li[i].appendChild(document.createTextNode(' ' + pair[1])); } });
    if ($(k + 'Wait')) $(k + 'Wait').hidden = false;
    if ($(k + 'Text')) $(k + 'Text').hidden = true;
  }
  /* ── BOOKED (v1.8, D9): the card #cBooked, the strings C.BOOKED (BK). Nothing on it says paid: a fresh
     order shows File · Fare "… €500 when you sign" · Order (the server's number) · Starts, the steps and
     the line. The managed ticket (d.st) prints only the server's state: BOOKED with the online withdrawal
     (D11: never on the fresh card), DUE with the secure pay link, PAID (the stamp says PAID), CLOSED; past
     BOOKED the heading, the start, the steps and the line step aside ── */
  function booked(ms, d) {
    var p = planOf(d.plan) || {}, c = $('cBooked'), M = ms !== 'BOOKED', w = d.st, B = BK, word = ms.charAt(0) + ms.slice(1).toLowerCase(), x = c.querySelector('.st-w'), a = null;
    slot(ms, word);
    c.querySelector('.k').textContent = word;
    txt('bFile', d.file || '—');
    txt('bFare', p.label ? p.label + ' · ' + (d.amount != null ? amt(d.amount) : eur(p.eur) + (M ? '' : ' when you sign')) : '—');
    txt('bOrder', d.number || '—');
    starts('b', B, d);
    if (M) c.querySelector('h2').hidden = $('bStart').parentNode.hidden = $('bNext').hidden = $('bText').hidden = $('bWait').hidden = true;
    /* the stamp says PAID only once the server says paid; a closed order has none */
    if (ms === 'PAID') { x.textContent = 'PAID'; x.removeAttribute('textLength'); x = c.querySelector('textPath'); x.textContent = x.textContent.replace('BOOKED', 'PAID'); }
    c.querySelector('.stamp').hidden = ms === 'CLOSED';
    if (w) {
      if (w === 'booked') {
        a = document.createElement('a'); a.className = 'lnk'; a.textContent = B.withdrawLink;
        a.href = C.WITHDRAW_URL + '?desk=' + encodeURIComponent(C.CITY) + (d.number ? '&ref=' + encodeURIComponent(d.number) : '') + '#online';
      } else if (w === 'due' && /^https:\/\/(?:www\.)?boomrome\.com\/api\/payments\/link\?/.test(d.payUrl)) {
        /* the stable pay link of the invoice (api/payments/link): ours, https, never another address */
        a = document.createElement('a'); a.className = 'pay'; a.href = d.payUrl;
        a.innerHTML = '<span><b></b></span><span class="ar" aria-hidden="true">→</span>';
        a.firstChild.firstChild.textContent = B.payLabel;
      }
      /* the line and its one action, built from the build's strings once the server has answered */
      x = c.appendChild(document.createElement('p')); x.id = 'bLine';
      x.textContent = w === 'due' ? String(B.dueText).replace('{amount}', amt(d.amount)) : w === 'paid' ? on(B.paidText, d.paidOn) : w === 'withdrawn' ? on(B.withdrawnText, d.withdrawnOn) : w === 'closed' ? B.closedText : '';
      if (a) x.appendChild(a);
    }
    show('cBooked');
    if (!w) ping(c.querySelector('.stamp'), 'l');
  }
  /* "Paid on {date}." — without the server's day the sentence drops "on {date}", never prints a blank */
  function on(s, v) { var x = dayOf(v); return String(s).replace(/ on \{date\}/, x ? ' on ' + x : '').replace('{date}', x); }

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
    if (window.BoomJourneyHandoff && !BoomJourneyHandoff.cityCheckout()) return;
    opener = from || null;
    /* where the page stood when the till opened: a fragment jump behind the modal is undone (deep) */
    tillX = scrollX; tillY = scrollY;
    tf.setAttribute('data-plan', id);
    txt('tTitle', p.label); txt('tPrice', eur(p.eur)); txt('tCond', p.condition); txt('tTag', p.name);
    var ul = $('tInc'); ul.textContent = '';
    p.includes.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    $('tRule').hidden = !p.rule;
    /* a desk that charges at signing: the ✓ line is THIS fare's trigger (which signing earns its fee) */
    if (p.trigger) txt('tRule', p.trigger);
    /* the till fills itself from what the visitor already typed, never the other way round */
    var fn = $('fName'), c = splitContact(($('fContact') || {}).value);
    if (fn && fn.value && !$('tName').value) $('tName').value = fn.value.trim();
    if (c.email && !$('tEmail').value) $('tEmail').value = c.email;
    txt('tErr', '');
    $$('#tillForm input[aria-invalid]').forEach(function (i) { setErr(i, ''); });
    $('tStart').checked = false; $('tGo').removeAttribute('aria-disabled'); paying = false; payLabels();
    if (typeof till.showModal === 'function') { try { till.showModal(); } catch (e) { till.setAttribute('open', ''); } } else till.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    doorTwins();
    track('begin_checkout', { currency: CUR, value: p.eur, items: [{ item_id: 'city_' + C.SLUG + '_' + id, item_name: p.label }], market: C.SLUG });
    try { $('tTitle').focus({ preventScroll: true }); } catch (e) {}
  }
  var payTok = 0, tillX = 0, tillY = 0;
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
    /* Enter on the tick does not pay. On a desk that charges at signing our button IS the order (L221-14 al. 2,
       C. civ. 1127-2, §312j(3) BGB: the function that validates it carries the obligation to pay, after a chance
       to check): Enter in a field never submits the till — the browser's implicit submission would click #tGo
       unseen, below the tick, the withdrawal line and the button's words. It walks to the next field instead
       (name → email → note → the tick → the button); only a click, Enter or Space ON the button orders. A held
       key walks one step and never reaches the button (an auto-repeated Enter does nothing there). */
    var WALK = ['tName', 'tEmail', 'tNote', 'tStart', 'tGo'];
    tf.addEventListener('keydown', function (e) {
      var t = e.target, i;
      if (e.key !== 'Enter' || !t || e.isComposing || e.keyCode === 229) return;
      if (SIGN && e.repeat) { e.preventDefault(); return; }
      if (t.type !== 'checkbox' && !(SIGN && t.tagName === 'INPUT')) return;
      e.preventDefault();
      i = SIGN ? WALK.indexOf(t.id) : -1;
      if (i > -1 && $(WALK[i + 1])) $(WALK[i + 1]).focus();
    });
    $('tillX').addEventListener('click', closeTill);
    /* a tap on the backdrop closes: the backdrop is the dialog's own box outside its content */
    till.addEventListener('click', function (e) {
      if (e.target !== till) return;
      var r = till.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeTill();
    });
    till.addEventListener('close', function () {
      document.documentElement.style.overflow = '';
      /* the opener may now sit in a CLOSED ticket (placePay moved the Full Search pay node home after the
         window shrank below 940): open that ticket as a tap does, or the focus would fall to <body> */
      var fd = opener && opener.closest && opener.closest('details.fare');
      if (fd && !fd.open && document.contains(fd)) { fares.forEach(function (o) { o.open = o === fd; }); last = fd; sync(); }
      if (opener && document.contains(opener) && !opener.hidden) {
        try { opener.focus({ preventScroll: true }); } catch (e) {}
        /* the focus is seen (WCAG 2.4.7 / 2.4.11): after a resize, or a page moved behind the modal, the opener may sit
           under the sticky header or below the viewport and its strip — bring it into the band, as place() does */
        var or = opener.getBoundingClientRect();
        if (or.top < topLim() || or.bottom > innerHeight - stripH()) opener.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
      doorTwins();
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
      /* D19: an order takes no payment information — booking_submit, never add_payment_info */
      track(SIGN ? 'booking_submit' : 'add_payment_info', { currency: CUR, value: p.eur, market: C.SLUG });
      var body = {
        city: C.SLUG, kind: id, name: n.value.trim(), email: m.value.trim(),
        notes: ($('tNote').value || '').trim(),
        /* the payer's own request to start inside the 14-day withdrawal
           period — never pre-ticked; without it the desk starts when the
           14 days end (Directive 2011/83/EU art. 7(3)) */
        startNow: $('tStart').checked === true,
        company: ($('tCompany').value || '').trim()
      };
      /* an order also carries the load's request id (a retry lands on the stored order: one order, one number,
         one email) and the version of the terms it was taken under (an older page: 409 terms_changed) */
      if (SIGN) { body.requestId = requestId; body.termsV = C.ORDER_TERMS_V || ''; }
      postJson(C.CHECKOUT_ENDPOINT || '/api/service-checkout', body).then(function (r) {
        /* BOOKED is the server's word: the order exists, the email is on its way — shown even if the till was
           closed while it flew (an order taken and not said would be the surprise) */
        if (SIGN && r && r.ok && r.booked) { paying = false; confirmed(r, id); return; }
        /* the visitor closed the till (or the page moved on) while it flew: stay */
        if (tok !== payTok || !till.open) { paying = false; $('tGo').removeAttribute('aria-disabled'); return; }
        if (r && r.ok && r.url) { location.href = r.url; return; }
        throw r || new Error('failed');
      }).catch(function (r) {
        paying = false; $('tGo').removeAttribute('aria-disabled'); payLabels();
        if (tok !== payTok) return;
        /* an order refused for a field says it on the field; a stale page asks for a reload */
        var er = SIGN && r ? r.error : '', fd = er === 'name' ? n : er === 'email' ? m : null;
        if (fd) { setErr(fd, till.getAttribute('data-err-' + er)); fd.focus(); return; }
        txt('tErr', till.getAttribute(er === 'terms_changed' ? 'data-err-stale' : 'data-err-net'));
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
    /* a desk that charges at signing never has a payment to return from: its ?paid= is ignored */
    if (SIGN) return;
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
                track('purchase', { transaction_id: 'city_' + C.SLUG + '_' + ('0000000' + h.toString(16)).slice(-8), currency: CUR, value: p.eur, items: [{ item_id: 'city_' + C.SLUG + '_' + vp, item_name: p.label, price: p.eur, quantity: 1 }], market: C.SLUG });
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

  /* ── the order's answer (the till's POST, v1.8): BOOKED with the server's file, number, plan and start;
     ONE booking per order id (sessionStorage), never a purchase: nothing was paid ── */
  function confirmed(r, id) {
    var k = 'boom-booked-' + r.id;
    if (!planOf(r.plan)) r.plan = id;
    setState('booked', r);
    land($('cBooked'));
    if (!store.get(k)) { store.set(k, '1'); track('booking', { currency: CUR, value: PLANS[r.plan].eur, plan: r.plan, market: C.SLUG }); convert('City order booked'); }
  }
  /* ── the managed ticket (v1.8 §5.4): the order email's "Manage your order", ?order=<book_…>&t=<token>.
     The address line folds at once (GA never had them: the template strips order and t from
     page_location); ONE ask, GET /api/city-lead?order=&t=&city= (twice more if the network or the server
     fails), and the page prints only the server's state. A reload is the blank page: the email is the
     record. A wrong link says "not confirmed yet", never a state ── */
  function handleOrder() {
    if (!SIGN) return;
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var oid = q.get('order') || '', t = q.get('t') || '', n = 0;
    if (!oid && !t) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (!/^book_[a-z0-9_]{8,52}$/.test(oid) || !/^[a-f0-9]{24}$/.test(t)) return;
    setState('confirming');
    (function ask() {
      fetch((C.LEAD_URL || '/api/city-lead') + '?order=' + oid + '&t=' + t + '&city=' + C.SLUG, { cache: 'no-store' }).then(function (r) {
        return r.json().then(function (v) {
          if (v && v.ok && /^(booked|due|paid|withdrawn|closed)$/.test(v.state)) { v.st = v.state; setState('booked', v); if (!moved) land($('cBooked'), true); return; }
          /* a wrong token and an unknown order are the same 404: no retry; the network or a 5xx: retry */
          throw r.status < 500 && r.status !== 429 ? 0 : 1;
        });
      }).catch(function (e) { if (e !== 0 && ++n < 3) setTimeout(ask, 1500 * n); else { setState('unconfirmed'); if (!moved) land($('cConfirm'), true); } });
    })();
  }

  /* ── the door's twins: one door, always one tap away. While no door is on
     the screen (the pass's door, or the outlined one at the Gate) and the
     pass is blank: the strip on a phone (<760), the header's gold twin
     (#topGo) from 760, where the desk chip takes turns with it in one slot
     (.off: visibility only, the header never moves). ── */
  var strip = $('strip'), topGo = $('topGo'), chip = $('topChip'), deskGo = $('deskGo'), filo = $('filo');
  var seen = { door: true, desk: false };
  function stripH() { return strip && strip.classList.contains('on') ? strip.offsetHeight : 0; }
  /* the reading area's top: the html's scroll-padding-top (under the sticky
     header from 760) — where scrollIntoView lands a node too */
  function topLim() { return parseFloat(getComputedStyle(root).scrollPaddingTop) || 0; }
  function doorTwins() {
    var tillOpen = !!(till && till.open), blank = state() === 'blank';
    var on = IO && !seen.door && !seen.desk && blank && !tillOpen, narrow = innerWidth < 760;
    if (deskGo) deskGo.hidden = !blank;
    if (filo) filo.hidden = tillOpen;
    if (topGo && chip) {
      var go = on && !narrow;
      if (topGo.hidden || topGo.classList.contains('off') === go) {
        topGo.hidden = false;
        topGo.classList.toggle('off', !go); chip.classList.toggle('off', go);
        topGo.setAttribute('aria-hidden', go ? 'false' : 'true'); topGo.tabIndex = go ? 0 : -1; topGo.inert = !go;
        chip.setAttribute('aria-hidden', go ? 'true' : 'false');
      }
    }
    if (!strip) return;
    on = on && narrow;
    if (strip.classList.contains('on') === on) return;
    strip.classList.toggle('on', on);
    if (on) strip.removeAttribute('inert'); else strip.setAttribute('inert', '');
    strip.setAttribute('aria-hidden', on ? 'false' : 'true');
    /* --strip-h is the strip's alone: the header twin covers no content */
    root.style.setProperty('--strip-h', on ? strip.offsetHeight + 'px' : '0px');
  }
  if (IO && (door || deskGo)) {
    /* the gold button itself, half of it at least: the "not sure" line
       peeking in at the foot of the screen is not a door, nor is a door
       under the sticky header (≥760: the root starts below it; rebuilt at
       the 760 crossing, read in a frame, never in the boot task) */
    var twinIO = null, mq760 = window.matchMedia ? matchMedia('(min-width: 760px)') : null;
    var twinWatch = function () {
      if (twinIO) twinIO.disconnect();
      var t = document.querySelector('.top'), hh = t && getComputedStyle(t).position === 'sticky' ? t.offsetHeight : 0;
      twinIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) { seen[e.target === door ? 'door' : 'desk'] = e.isIntersecting && e.intersectionRatio >= 0.5; });
        doorTwins();
      }, { rootMargin: -hh + 'px 0px 0px 0px', threshold: [0, 0.5, 1] });
      if (door) twinIO.observe(door);
      if (deskGo) twinIO.observe(deskGo);
    };
    requestAnimationFrame(twinWatch);
    if (mq760) { if (mq760.addEventListener) mq760.addEventListener('change', twinWatch); else if (mq760.addListener) mq760.addListener(twinWatch); }
    addEventListener('resize', doorTwins);
  }
  [[$('stripGo'), 'strip_click'], [topGo, 'twin_click'], [deskGo, 'twin_click']].forEach(function (x) {
    if (x[0]) x[0].addEventListener('click', function () { track(x[1], { location: x[0].id, market: C.SLUG }); openForm(true); });
  });

  /* ── where you are: the filament (scroll, rAF-throttled) and the header's
     wayfinding (the section under the top 40% of the screen; none past the
     last one, the Network and below) ── */
  var way = $$('.wayf a'), wayT = way.map(function (a) { return $(a.getAttribute('href').slice(1)); }), wayEnd = $('network'), wayOn = null, tick = false;
  function where() {
    tick = false;
    var max = root.scrollHeight - innerHeight;
    if (filo) filo.style.setProperty('--p', max > 0 ? Math.min(1, Math.max(0, scrollY / max)).toFixed(4) : '0');
    var y = innerHeight * 0.4, pick = null;
    for (var i = 0; i < wayT.length; i++) if (wayT[i] && wayT[i].getBoundingClientRect().top <= y) pick = way[i];
    if (wayEnd && wayEnd.getBoundingClientRect().top <= y) pick = null;
    if (pick === wayOn) return;
    if (wayOn) wayOn.removeAttribute('aria-current');
    if (pick) pick.setAttribute('aria-current', 'location');
    wayOn = pick;
  }
  function onScroll() { if (!tick) { tick = true; requestAnimationFrame(where); } }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });

  /* ── §D the onda (v1.7): after load, when idle, at every width — behind the page on a
     desktop pass, inside the pass on a phone (place). It loops only while the desk is
     open (refreshClock tells it each minute); the heartbeat rises from the stub's
     destination code at ≥940, from the city's board below; the ambient stays above the
     fares (calm) and, on a phone, sleeps while the board is above the viewport (hero).
     A FACT pings it once from where it happens: OPEN from its stamp, PAID doubled, a fare
     from its price. A fact that lands before the engine waits for it (ondaQ). ── */
  var ondaIn = false, ondaQ = [];
  function ping(n, s) { if (window.BOOM_ONDA && BOOM_ONDA.pulse) BOOM_ONDA.pulse(n, s, 220); else if (n) ondaQ.push([n, s]); }
  function onda() {
    var cv = $('onda');
    if (ondaIn || !C.ONDA || !cv) return;
    ondaIn = true;
    var s = document.createElement('script');
    s.src = C.ONDA; s.async = true;
    s.onload = function () {
      var w = win(), O = window.BOOM_ONDA;
      if (!O || !O.start) return;
      O.start(cv, { origin: function () { return wide.matches ? document.querySelector('.route-s .rb') : $('placeBoard'); }, calm: faresBox, hero: $('placeBoard'), open: !!(w && w.open) });
      ondaQ.splice(0).forEach(function (x) { O.pulse(x[0], x[1], 220); });
    };
    document.head.appendChild(s);
  }
  function ondaLater() { if (window.requestIdleCallback) requestIdleCallback(onda, { timeout: 2000 }); else setTimeout(onda, 200); }
  if (document.readyState === 'complete') ondaLater(); else addEventListener('load', ondaLater, { once: true });

  /* the Horizon comes alive when it nears the screen (assets/boom-map.js) */
  var hzMap = document.querySelector('svg.hz'), hzIn = false;
  function hzGo() { if (hzIn || !hzMap || !C.MAP) return; hzIn = true; var e = document.createElement('script'); e.src = C.MAP; e.async = true; document.head.appendChild(e); }
  if (hzMap && IO) { var hzIO = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { hzIO.disconnect(); hzGo(); } }, { rootMargin: '600px 0px' }); hzIO.observe(hzMap); } else addEventListener('load', hzGo);

  /* ── small things: the WhatsApp links, the questions ── */
  $$('a[href^="https://wa.me/"]').forEach(function (a) {
    a.addEventListener('click', function () { track('wa_open', { location: a.id || 'link', plan: plan || 'none', market: C.SLUG }); });
  });
  $$('#faq details').forEach(function (d, i) { d.addEventListener('toggle', function () { if (d.open) track('faq_open', { market: C.SLUG, question_index: i }); }); });

  sync();
  refreshClock();
  /* the first read of where you are waits for a frame (no forced layout in the boot task) */
  onScroll();
  /* the managed ticket first (a desk that charges at signing): it reads the address bar before a return would */
  handleOrder();
  handleReturn();
  /* ── links to one fare: /<slug>#fare-<plan> (or #<plan>) opens that ticket and lands it whole — the pay button
     (the door on a desk still opening) at the bottom edge, focused without a jump; /<slug>#pay-<plan> then opens
     the till on that plan (the Start-now tick never pre-ticked): the operator's link for a lead who has decided.
     Skipped on a paid return and on a pass that is not blank; the hash folds back; again once at load (the browser
     re-applies a fragment) unless the reader has moved; fare_open {via:'link'} counts it. v1.8: on a desk that
     charges at signing #order-<plan> is #pay-<plan> (the operator's replies say "order"), and a ?paid= means
     nothing there; the six never read #order-. ── */
  function deep() {
    /* a link followed while the till is open never re-targets the tickets behind the modal; the browser's own
       fragment jump has started to scroll the page behind it (smoothly: at this point it may not have moved yet) —
       an instant scrollTo cancels it and keeps the page where the till found it; the jump also blurred the till,
       so the focus goes back to its title */
    if (till && till.open) {
      scrollTo({ left: tillX, top: tillY, behavior: 'instant' });
      if (!till.contains(document.activeElement)) { try { $('tTitle').focus({ preventScroll: true }); } catch (e) {} }
      return;
    }
    var m = /^#(fare-|pay-|order-)?([a-z-]+)$/.exec(location.hash);
    if (m && m[1] === 'order-' && !SIGN) m = null;
    var id = m && m[2], d = id && planOf(id) && $('fare-' + id);
    if (!d || (!SIGN && /[?&]paid=/.test(location.search)) || state() !== 'blank') return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    var was = d.open;
    fares.forEach(function (o) { o.open = o === d; });
    last = d; sync();
    var t = d.querySelector('[data-pay]') || $('door');
    var go = function () { if (moved) return; t.scrollIntoView({ block: 'end', behavior: 'instant' }); try { t.focus({ preventScroll: true }); } catch (e) {} };
    go();
    if (document.readyState !== 'complete') addEventListener('load', go, { once: true });
    if (!was) track('fare_open', { plan: id, market: C.SLUG, via: 'link' });
    if ((m[1] === 'pay-' || m[1] === 'order-') && sell) { track(m[1] === 'pay-' ? 'pay_link' : 'order_link', { plan: id, market: C.SLUG }); openTill(id, t); }
  }
  deep();
  addEventListener('hashchange', deep);
  track('page_view_market', { market: C.SLUG });
  window.BOOM_TICKET = { state: state, setState: setState, openTill: openTill, nextLine: nextLine };
})();
