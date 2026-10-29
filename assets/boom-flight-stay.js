/* The URL carries requested dates. Catalogue eligibility and all quote
   arithmetic remain with their existing controllers. */
(function () {
  'use strict';
  function ready() {
    var S = window.BOOM_STAY;
    if (!S) return;
    var byId = function (id) { return document.getElementById(id); };
    var shortcut = byId('durataSoggiorno'), application = byId('apMesi');
    var select = shortcut || application;
    var start = byId('stayMoveIn') || byId('apQuando');
    var end = byId('stayMoveOut') || byId('apUscita');
    var form = select && select.closest('form'), advanced = byId('quandoData');
    var error = byId('stayDatesError') || byId('apStayError');
    var quote = document.querySelector('.durata-conto');
    var quoteButtons = document.querySelectorAll('.durata-tasti button[data-m]');
    var syncing = false, syncingQuote = false, quoteGesture = null, quoteGestureTimer;
    function hasIntent(i) { return !!(i.moveIn || i.moveOut || i.durationMonths); }
    function current() {
      var own = S.intent(location.search, location.hash);
      if (hasIntent(own)) return own;
      try {
        if (window.parent !== window && window.parent.location.origin === location.origin)
          return S.intent(window.parent.location.search, window.parent.location.hash);
      } catch (_) { /* A cross-origin host cannot supply BOOM intent. */ }
      return own;
    }
    function raw() {
      return { moveIn: start && start.value || null, moveOut: end && end.value || null,
        durationMonths: select && S.months(select.value) };
    }
    function selection(value) {
      if (!select) return;
      select.querySelectorAll('[data-stay-custom]').forEach(function (option) { option.remove(); });
      var i = S.normalize(value), p = S.period(i.moveIn, i.moveOut);
      var wanted = i.durationMonths ? String(i.durationMonths) : p && p.days ? 'dates' : '';
      if (wanted && !Array.prototype.some.call(select.options, function (o) { return o.value === wanted; })) {
        var option = document.createElement('option'); option.dataset.stayCustom = 'true'; option.value = wanted;
        option.textContent = wanted === 'dates' ? p.wholeMonths + ' months + ' + p.days + ' days' : S.label(i.durationMonths);
        select.appendChild(option);
      }
      // Apply historically defaults to twelve months when no preference exists.
      if (wanted || shortcut) select.value = wanted;
      select.classList.toggle('scelto', !!wanted);
    }
    function describe(value) {
      var i = S.normalize(value), message = S.summary(i);
      document.querySelectorAll('[data-stay-summary]').forEach(function (node) {
        node.textContent = message || 'Minimum 3 months. Choose dates or a length.';
      });
      document.querySelectorAll('[data-stay-note]').forEach(function (note) {
        note.hidden = !message;
        note.textContent = message ? message + ' requested. Dates and lease terms are confirmed for each home.' : '';
        if (message && note.dataset.stayNote === 'results') note.textContent += i.moveIn || i.moveOut ? ' Departure does not filter these results.' : ' Requested length does not narrow the results.';
      });
    }
    function validity(report) {
      if (!start || !end) return true;
      var problem = S.validate(raw());
      if (start.validity.badInput) problem = { field: 'moveIn', message: 'Choose a valid arrival date.' };
      else if (end.validity.badInput) problem = { field: 'moveOut', message: 'Choose a valid departure date.' };
      else if (S.date(start.min) && S.date(start.value) && start.value < start.min)
        problem = { field: 'moveIn', message: 'Choose an arrival on or after ' + start.min + '.' };
      [start, end].forEach(function (input) {
        var wrong = !!problem && input === (problem.field === 'moveIn' ? start : end);
        input.setCustomValidity(wrong ? problem.message : '');
        if (wrong) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      });
      if (error) { error.textContent = problem ? problem.message : ''; error.hidden = !problem; }
      if (problem && report) {
        document.dispatchEvent(new CustomEvent('boom:stay-invalid'));
        var invalid = problem.field === 'moveIn' ? start : end;
        invalid.focus(); invalid.reportValidity();
      }
      return !problem;
    }
    function remember(value) {
      var url = S.withIntent(location.pathname + location.search + location.hash, value);
      if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
      document.dispatchEvent(new CustomEvent('boom:stay', { detail: S.normalize(value) }));
    }
    function arrivalFilter(value) {
      if (!advanced || advanced === start || advanced.value === (value || '')) return;
      advanced.value = value || '';
      syncing = true; advanced.dispatchEvent(new Event('change', { bubbles: true })); syncing = false;
    }
    function quoteFor(value) {
      if (!application || !quote) return;
      var i = S.normalize(value), p = S.period(i.moveIn, i.moveOut);
      var incomplete = !!(i.moveIn || i.moveOut) && !!S.validate(value);
      var needsConfirmation = incomplete || !!(p && p.days);
      var notice = document.querySelector('[data-stay-quote-note]');
      if (!notice) {
        notice = document.createElement('p'); notice.className = 'flight-stay-note'; notice.dataset.stayQuoteNote = 'true';
        quote.parentNode.insertBefore(notice, quote);
      }
      quote.hidden = needsConfirmation; notice.hidden = !needsConfirmation;
      notice.textContent = incomplete ? 'Complete a valid stay to see the rent estimate.'
        : 'Your dates include extra days. BOOM will confirm the total for this exact period; no daily rate is assumed.';
      var n = i.durationMonths;
      if (!needsConfirmation && n && n !== quoteGesture) {
        syncingQuote = true;
        if (window.BoomStayQuote && typeof window.BoomStayQuote.setMonths === 'function') window.BoomStayQuote.setMonths(n);
        else {
          var button = Array.prototype.find.call(quoteButtons, function (b) { return Number(b.dataset.m) === n; });
          if (button) button.click();
        }
        syncingQuote = false;
      }
      selection(value);
    }
    function fields(value) {
      var i = S.normalize(value);
      if (start) start.value = i.moveIn || '';
      if (end) end.value = i.moveOut || '';
      if (application && !hasIntent(i)) application.value = '12';
      selection(i); describe(i); validity(false);
      quoteFor(application && !hasIntent(i) ? { durationMonths: 12 } : i);
      if (end) end.min = i.moveIn ? S.addMonths(i.moveIn, 3) || '' : '';
    }
    function change(kind) {
      if (syncing || syncingQuote) return;
      var n = select && S.months(select.value);
      if (start && end && S.date(start.value) && ((kind === 'duration' && n) || (kind === 'start' && !end.value)))
        end.value = S.addMonths(start.value, n || 3) || '';
      if (end) end.min = start && S.date(start.value) ? S.addMonths(start.value, 3) || '' : '';
      var value = raw(), valid = validity(false);
      // An incomplete draft keeps its actual dates, not an earlier valid
      // range or a silently regenerated departure. Navigation is blocked.
      if (!valid) value.durationMonths = null;
      arrivalFilter(value.moveIn); remember(value); describe(value);
      if (valid) selection(value);
      quoteFor(value);
    }
    function linkIntent(link) {
      if (!link) return false;
      var href = link.getAttribute('href');
      if (!/^\/(?:listing\/[A-Za-z0-9_-]+|apartments(?:\.html)?|skyline(?:\.html)?|your-rome)(?:[?#]|$)/.test(href || '')) return false;
      link.setAttribute('href', S.withIntent(href, current())); return true;
    }
    ['pointerdown', 'focusin', 'click', 'auxclick', 'contextmenu'].forEach(function (type) {
      document.addEventListener(type, function (event) {
        var link = event.target.closest && event.target.closest('a[href]');
        if (!linkIntent(link)) return;
        if ((type === 'click' || type === 'auxclick') && !validity(true)) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
    });
    if (select) select.addEventListener('change', function () { change('duration'); });
    if (start) ['input', 'change'].forEach(function (type) { start.addEventListener(type, function () { change('start'); }); });
    if (end) ['input', 'change'].forEach(function (type) { end.addEventListener(type, function () { change('end'); }); });
    if (advanced) advanced.addEventListener('change', function () {
      if (syncing || !start) return;
      start.value = advanced.value; change('start');
    });
    function clear() {
      if (start) start.value = ''; if (end) end.value = '';
      if (select) select.value = shortcut ? '' : '12';
      if (end) end.min = '';
      selection({}); arrivalFilter(null); remember({}); describe({}); validity(false);
      if (application) quoteFor({ durationMonths: 12 });
    }
    document.querySelectorAll('[data-stay-clear]').forEach(function (button) { button.addEventListener('click', clear); });
    var reset = byId('pulisci'); if (reset && shortcut) reset.addEventListener('click', clear);
    if (form) form.addEventListener('submit', function (event) {
      if (!validity(true)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    var save = byId('serbaForma');
    if (save) save.addEventListener('submit', function (event) {
      if (!validity(true)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    if (form && form.dataset.stayPage === 'home') form.addEventListener('submit', function (event) {
      event.preventDefault();
      var budget = byId('quantoBudget').value, who = byId('chiAtterra').value, hash = [];
      if (budget) hash.push('budget=' + encodeURIComponent(budget)); if (who) hash.push('chi=' + encodeURIComponent(who));
      var i = S.normalize(raw());
      if (window.boomTrack) window.boomTrack('find_homes', { budget: budget, chi: who, durationMonths: i.durationMonths });
      location.href = S.withIntent('/apartments' + (hash.length ? '#' + hash.join('&') : ''), i);
    });
    if (application) {
      document.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('.durata-tasti button[data-m]');
        if (button && !syncingQuote) {
          quoteGesture = Number(button.dataset.m); clearTimeout(quoteGestureTimer);
          // Native clicks may run a microtask checkpoint between capture
          // and the original target listener. Keep this gesture for the turn.
          quoteGestureTimer = setTimeout(function () { quoteGesture = null; }, 0);
        }
      }, true);
      document.addEventListener('boom:durata', function (event) {
        if (syncingQuote) return;
        if (quoteGesture === Number(event.detail)) {
          selection({ durationMonths: event.detail }); change('duration');
        } else {
          // A late catalogue/price refresh may register its Apply listener
          // after ours. Restore after the whole original event, not midway.
          queueMicrotask(function () { fields(current()); });
        }
      });
    }
    function restore() { var i = current(); fields(i); arrivalFilter(i.moveIn); }
    window.addEventListener('popstate', restore);
    // Keep legacy arrival hashes usable; new links carry both civil dates.
    window.addEventListener('hashchange', function () { if (!syncing) restore(); });
    var initial = current();
    // A link can prefill the original Apply once. History, late catalogue/
    // quote events and BFCache must never overwrite a person's form edits.
    var household = byId('apChi'), people = new URLSearchParams(location.search).get('people');
    if (household && !household.value && ['solo', 'couple', 'family', 'flatmates'].indexOf(people) >= 0) {
      household.value = people;
      household.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Do not present the listing's release date as an arrival chosen by the
    // visitor. Empty arrival stays empty until they choose it explicitly.
    fields(initial); arrivalFilter(initial.moveIn);
  }
  // Defer scripts see interactive while later scripts are still loading.
  // Wait for the original regia before prefill, including on a slow network.
  if (document.readyState === 'complete') setTimeout(ready, 0);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(ready, 0); }, { once: true });
})();
