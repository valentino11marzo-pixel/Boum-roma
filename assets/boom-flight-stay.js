/* The URL carries the requested stay. Listing eligibility and all quote
   arithmetic remain with the existing catalogue and money controllers. */
(function () {
  'use strict';
  function ready() {
    var S = window.BOOM_STAY;
    if (!S) return;
    var select = document.getElementById('durataSoggiorno');
    var form = select && select.closest('form');
    var application = document.getElementById('apMesi');
    var durationButtons = document.querySelectorAll('.durata-tasti button[data-m]');
    function current() {
      var own = S.read(location.search);
      if (own) return own;
      try {
        if (window.parent !== window && window.parent.location.origin === location.origin)
          return S.read(window.parent.location.search);
      } catch (_) { /* A cross-origin host cannot supply BOOM intent. */ }
      return null;
    }
    function notes() {
      var value = current();
      if (select) { select.value = value ? String(value) : ''; select.classList.toggle('scelto', !!value); }
      document.querySelectorAll('[data-stay-note]').forEach(function (note) {
        note.hidden = !value;
        note.textContent = value ? S.label(value) + ' requested. Lease length is confirmed for each home.' : '';
        if (value && note.dataset.stayNote === 'results') note.textContent += ' This preference does not narrow the results.';
      });
    }
    function remember(value) {
      var url = S.withStay(location.pathname + location.search + location.hash, value);
      if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
      notes();
      document.dispatchEvent(new CustomEvent('boom:stay', { detail: current() }));
    }
    function linkIntent(link) {
      if (!link) return;
      var href = link.getAttribute('href');
      if (!/^\/(?:listing\/[A-Za-z0-9_-]+|apartments(?:\.html)?|skyline(?:\.html)?)(?:[?#]|$)/.test(href || '')) return;
      link.setAttribute('href', S.withStay(href, current()));
    }
    // Capture before navigation, including a new-tab/context-menu gesture.
    // This also covers cards inserted by the existing live catalogue loader.
    ['pointerdown', 'focusin', 'click', 'auxclick', 'contextmenu'].forEach(function (type) {
      document.addEventListener(type, function (event) {
        linkIntent(event.target.closest && event.target.closest('a[href]'));
      }, true);
    });
    if (select) select.addEventListener('change', function () { remember(select.value); });
    if (form && form.dataset.stayPage === 'home') {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var budget = document.getElementById('quantoBudget').value;
        var who = document.getElementById('chiAtterra').value, hash = [];
        if (budget) hash.push('budget=' + encodeURIComponent(budget));
        if (who) hash.push('chi=' + encodeURIComponent(who));
        var stay = S.months(select.value);
        if (window.boomTrack) window.boomTrack('find_homes', { budget: budget, chi: who, durationMonths: stay });
        location.href = S.withStay('/apartments' + (hash.length ? '#' + hash.join('&') : ''), stay);
      });
    }
    var clear = document.getElementById('pulisci');
    if (clear && select) clear.addEventListener('click', function () { remember(null); });
    function useExistingQuote(value) {
      var n = S.months(value);
      if (!n) return;
      // The existing button owns price arithmetic and emits boom:durata.
      var button = Array.prototype.find.call(durationButtons, function (b) { return Number(b.dataset.m) === n; });
      if (button) button.click();
      else if (application) { application.value = String(n); application.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (application) {
      var syncing = false;
      application.addEventListener('change', function () {
        if (syncing) return;
        syncing = true; useExistingQuote(application.value); syncing = false;
      });
      document.addEventListener('boom:durata', function (event) { remember(event.detail); });
      syncing = true; useExistingQuote(current()); syncing = false;
    }
    window.addEventListener('popstate', function () { notes(); if (application) useExistingQuote(current()); });
    notes();
  }
  // Run after the original DOM-ready regia has registered its money/apply
  // handlers; never wait for external images or the map to finish loading.
  // A defer script sees "interactive" even while later defer scripts are
  // still loading. Starting then would catch the regia's initial 12-month
  // quote as a visitor choice and overwrite ?stay= before the real prefill.
  if (document.readyState === 'complete') setTimeout(ready, 0);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(ready, 0); }, { once: true });
})();
