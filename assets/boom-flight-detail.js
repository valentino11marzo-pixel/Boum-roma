/* Presentation only. No listing fetch, quote arithmetic, payment action or
   second favourites store: the current listing controllers own all facts. */
(function () {
  'use strict';
  function ready() {
    var root = document.querySelector('.bfd-dossier');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    var byId = function (id) { return document.getElementById(id); };
    var home = byId('bfd-home-panel'), place = byId('posto');
    var tabHome = byId('bfd-home-tab'), tabPlace = byId('bfd-everyday-tab');
    var pass = root.querySelector('.bfd-pass'), main = root.querySelector('.bfd-main');
    var apply = root.querySelector('[data-bfd-apply]');
    var hold = root.querySelector('[data-bfd-hold]');
    var contact = root.querySelector('[data-bfd-contact]');
    var viewing = root.querySelector('[data-bfd-viewing]');
    var sourceApply = document.querySelector('#modApplica button[type="submit"]');
    var sourceHold = byId('prVai'), sourceViewing = byId('portaVideo');
    var sourceContact = document.querySelector('.chiedi-wa');
    var mapStarted = false, fallbackMotion = null;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');

    function visible(el) {
      return !!el && !el.hidden && el.style.display !== 'none';
    }
    function setView(everyday, focus) {
      if (!home || !place || !tabHome || !tabPlace) return;
      if (everyday && tabPlace.disabled) everyday = false;
      var changed = home.hidden !== everyday;
      home.hidden = everyday;
      place.hidden = !everyday;
      tabHome.setAttribute('aria-selected', String(!everyday));
      tabPlace.setAttribute('aria-selected', String(everyday));
      tabHome.tabIndex = everyday ? -1 : 0;
      tabPlace.tabIndex = everyday ? 0 : -1;
      if (focus) (everyday ? tabPlace : tabHome).focus();
      if (changed) main.classList.add('bfd-changed');
      if (everyday && !mapStarted) {
        var start = byId('bloccoVia');
        if (start) { mapStarted = true; start.click(); }
      }
      // Keep the live WebGL canvas out of root view-transition snapshots.
      // Its panel changes immediately, with local CSS motion only.
      if (everyday) requestAnimationFrame(function () {
        window.dispatchEvent(new Event('resize'));
      });
    }
    function sync() {
      var missing = !visible(byId('denaro'));
      // Recovery is a plain navigation: a 503 response cannot participate
      // in the visual handoff between two complete listing documents.
      if (missing && !fallbackMotion) {
        fallbackMotion = document.createElement('style');
        fallbackMotion.textContent = '@view-transition{navigation:none}';
        document.head.appendChild(fallbackMotion);
      } else if (!missing && fallbackMotion) {
        fallbackMotion.remove(); fallbackMotion = null;
      }
      pass.hidden = missing;
      var hasPlace = !missing && place && place.style.display !== 'none';
      if (tabPlace) { tabPlace.disabled = !hasPlace; tabPlace.hidden = !hasPlace; }
      if (!hasPlace && home && home.hidden) setView(false, false);
      if (apply) {
        apply.hidden = missing || !visible(byId('applica')) || !sourceApply;
        if (sourceApply) apply.textContent = sourceApply.textContent.trim();
      }
      if (hold) {
        hold.hidden = missing || !visible(byId('presaCasa')) || !sourceHold;
        if (sourceHold) hold.textContent = sourceHold.textContent.trim();
      }
      if (contact && sourceContact) contact.href = sourceContact.href;
      if (viewing) {
        viewing.hidden = missing || !visible(sourceViewing);
        if (sourceViewing) viewing.href = sourceViewing.href;
      }
      var heart = byId('cuoreCasa'), label = byId('bfd-save-label');
      if (heart) {
        var saved = heart.classList.contains('si');
        heart.setAttribute('aria-pressed', String(saved));
        heart.setAttribute('aria-label', saved ? 'Remove saved home' : 'Save this home');
        if (label) label.textContent = saved ? 'Saved' : 'Save home';
      }
    }
    if (tabHome) tabHome.addEventListener('click', function () { setView(false, false); });
    if (tabPlace) tabPlace.addEventListener('click', function () { setView(true, false); });
    var tabs = root.querySelector('.bfd-tabs');
    if (tabs) tabs.addEventListener('keydown', function (e) {
      if (tabPlace.disabled || !/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      setView(e.key === 'End' || (e.key !== 'Home' && e.target === tabHome), true);
    });
    var photoButton = root.querySelector('[data-bfd-photos]');
    if (photoButton) photoButton.addEventListener('click', function (e) {
      e.stopPropagation();
      var frame = byId('telaio');
      if (frame) frame.click();
    });
    function openHash() {
      if (location.hash === '#posto') {
        setView(true, false);
        if (place && !place.hidden) requestAnimationFrame(function () {
          place.scrollIntoView({ block: 'start', behavior: 'auto' });
        });
      }
      if (location.hash === '#casa') setView(false, false);
    }
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href="#posto"]');
      if (link) setView(true, false);
    });
    window.addEventListener('hashchange', openHash);
    // Observe the current controllers, never infer availability from the
    // text of a status badge or recalculate a second set of prices.
    var watch = new MutationObserver(sync);
    [sourceApply, sourceHold, sourceViewing, sourceContact, byId('presaCasa'),
      byId('applica'), byId('denaro'), byId('cuoreCasa')].forEach(function (el) {
      if (el) watch.observe(el, { childList: true, characterData: true,
        subtree: el === sourceApply || el === sourceHold,
        attributes: true, attributeFilter: ['style', 'hidden', 'href', 'class'] });
    });
    function refreshSaved() {
      var h = byId('cuoreCasa');
      if (!h) return;
      try {
        var saved = JSON.parse(localStorage.getItem('boomSalvate') || '[]');
        h.classList.toggle('si', Array.isArray(saved) && saved.indexOf(h.dataset.u) >= 0);
      } catch (e) { /* unavailable local storage does not block the listing */ }
      sync();
    }
    window.addEventListener('storage', function (e) {
      if (e.key === 'boomSalvate') refreshSaved();
    });
    window.addEventListener('focus', refreshSaved);
    // The original lightbox owns navigation. Complete its focus contract.
    var lens = byId('lente'), returnFocus = null;
    if (lens) {
      var lensOpen = !lens.hidden;
      var lensWatch = new MutationObserver(function () {
        var isOpen = !lens.hidden;
        // Photo navigation writes hidden=false again; only a real open
        // transition captures the control to restore on closing.
        if (isOpen === lensOpen) return;
        lensOpen = isOpen;
        if (isOpen) {
          returnFocus = document.activeElement;
          var close = byId('lenteX'); if (close) close.focus({ preventScroll: true });
        } else if (returnFocus && returnFocus.focus) {
          returnFocus.focus({ preventScroll: true }); returnFocus = null;
        }
      });
      lensWatch.observe(lens, { attributes: true, attributeFilter: ['hidden'] });
      lens.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab' || lens.hidden) return;
        var controls = Array.prototype.filter.call(lens.querySelectorAll('button'),
          function (b) { return !b.disabled && getComputedStyle(b).display !== 'none'; });
        if (!controls.length) return;
        var first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
    // Keep motion preferences current for our presentation layer.
    function motion() { root.classList.toggle('bfd-reduced', reduced.matches); }
    if (reduced.addEventListener) reduced.addEventListener('change', motion);
    refreshSaved(); motion(); openHash();
  }
  // This static deferred layer follows the regia's earlier DOM-ready
  // listener. Photos/forms do not wait for remote media to finish loading.
  if (document.readyState === 'complete') setTimeout(ready, 0);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(ready, 0); }, { once: true });
})();
