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
    var openApplication = function () {};
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
        if (sourceApply) {
          var action = sourceApply.textContent.trim();
          apply.textContent = action === 'Send application' || /^Reserve from /.test(action) ? 'Apply for this home' : action;
        }
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
    var frame = byId('telaio'), roll = byId('rullino'), counter = byId('contaFoto');
    if (frame) frame.addEventListener('keydown', function (e) {
      if (e.target === frame && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault(); e.stopPropagation(); frame.click();
      }
    });
    if (roll && roll.children.length) {
      var caption = document.createElement('p'); caption.className = 'bfd-photo-caption';
      caption.id = 'bfdPhotoHelp';
      var position = document.createElement('span');
      position.setAttribute('role', 'status'); position.setAttribute('aria-live', 'polite');
      var hint = document.createElement('span');
      hint.textContent = roll.children.length > 1 ? 'Swipe to explore · arrow keys when focused' : 'Open the photograph to explore';
      caption.append(position, hint); roll.after(caption);
      frame.setAttribute('aria-describedby', caption.id);
      function photoPosition() { position.textContent = 'Photo ' + (counter && counter.textContent || '1 / 1') + (frame.getAttribute('data-photo-error') ? '. ' + frame.getAttribute('data-photo-error') : ''); }
      photoPosition();
      if (counter) new MutationObserver(photoPosition).observe(counter, {childList:true, characterData:true, subtree:true});
      new MutationObserver(photoPosition).observe(frame, {attributes:true,attributeFilter:['data-photo-error']});
    }

    // A view over the original application, never another application state.
    // Fields, error handling, request ID and the only submit handler stay in regia.
    (function applicationBoarding() {
      var form = byId('modApplica'), box = byId('applica');
      if (!form || !box || !sourceApply) return;
      var groups = Array.prototype.slice.call(form.querySelectorAll('.ap-gruppo'));
      if (groups.length !== 3) return;
      var labels = ['You', 'Your stay', 'Your profile', 'Review'];
      var step = 0, restoreAfterValidation = false;
      var sheet = null, opener = null;
      if (window.HTMLDialogElement && HTMLDialogElement.prototype.showModal) {
        var inlineSection = box.closest('.bfd-application-section');
        sheet = document.createElement('dialog'); sheet.className = 'bfd-application-sheet';
        sheet.id = 'bfdApplicationSheet'; sheet.setAttribute('aria-label', 'Apply for this home');
        var top = document.createElement('div'); top.className = 'bfd-sheet-top';
        var code = document.createElement('span'); code.textContent = 'BOOM / YOUR APPLICATION';
        var close = document.createElement('button'); close.type = 'button';
        close.setAttribute('aria-label', 'Close application'); close.textContent = 'Close ×';
        close.addEventListener('click', function () { sheet.close(); }); top.append(code, close);
        var context = document.createElement('div'); context.className = 'bfd-sheet-context';
        var firstPhoto = document.querySelector('#rullino img');
        if (firstPhoto) { var thumb = document.createElement('img'); thumb.src = firstPhoto.src; thumb.alt = ''; context.append(thumb); }
        var info = document.createElement('div'), name = document.createElement('b'), price = document.createElement('span');
        info.append(name, price); context.append(info);
        function houseContext() {
          name.textContent = byId('nomeCasa').textContent;
          price.textContent = (byId('canoneCasa').dataset.p || '') + ' / month';
        }
        houseContext();
        var contextWatch = new MutationObserver(houseContext);
        contextWatch.observe(byId('nomeCasa'), {childList:true,characterData:true,subtree:true});
        contextWatch.observe(byId('canoneCasa'), {attributes:true,attributeFilter:['data-p']});
        sheet.append(top, context, box); document.body.appendChild(sheet);
        if (inlineSection) inlineSection.hidden = true;
        function restorePage() {
          document.documentElement.classList.remove('bfd-app-open');
          if (location.hash === '#applica') history.replaceState(history.state, '', location.pathname + location.search);
          if (opener && opener.isConnected) opener.focus({preventScroll:true});
        }
        sheet.addEventListener('close', restorePage);
        sheet.addEventListener('click', function (event) {
          if (event.target !== sheet) return;
          var r = sheet.getBoundingClientRect();
          if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) sheet.close();
        });
        openApplication = function (from) {
          if (box.style.display === 'none' || sheet.open) return;
          opener = from || document.activeElement;
          sheet.showModal(); document.documentElement.classList.add('bfd-app-open');
          var target = step === 3 ? byId('bfdReviewTitle') : groups[step].querySelector('input,select');
          if (form.style.display === 'none') target = byId('applicaFatto').querySelector('b');
          if (target) { if (!target.matches('input,select')) target.tabIndex = -1; target.focus({preventScroll:true}); }
        };
        document.addEventListener('click', function (event) {
          var link = event.target.closest('a[href="#applica"]');
          if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); openApplication(link);
        }, true);
        sheet.addEventListener('click', function (event) {
          var link = event.target.closest('a[href^="#"]');
          if (link && link.hash !== '#applica') sheet.close();
        });
        window.addEventListener('pageshow', function () {
          document.documentElement.classList.toggle('bfd-app-open', sheet.open);
        });
      }
      var nav = document.createElement('ol'); nav.className = 'bfd-apply-steps';
      nav.setAttribute('aria-label', 'Application steps');
      var buttons = labels.map(function (label, i) {
        var item = document.createElement('li'), button = document.createElement('button');
        button.type = 'button'; button.innerHTML = '<b>0' + (i + 1) + '</b><span>' + label + '</span>';
        button.addEventListener('click', function () {
          if (i <= step) show(i, true);
          else if (i === step + 1 && canAdvance()) show(i, true);
        });
        item.appendChild(button); nav.appendChild(item); return button;
      });
      form.before(nav);
      groups.forEach(function (group, i) {
        var heading = group.querySelector('.ap-eti');
        if (heading) { heading.id = 'bfdApplyHeading' + i; heading.tabIndex = -1; group.setAttribute('aria-labelledby', heading.id); }
        group.setAttribute('role', 'group');
      });
      var review = document.createElement('section'); review.className = 'bfd-apply-review'; review.hidden = true;
      review.setAttribute('aria-labelledby', 'bfdReviewTitle');
      review.innerHTML = '<h4 id="bfdReviewTitle" tabindex="-1">Check it. Then send.</h4><p>This application does not reserve the home or take a payment. A person reviews your request.</p><div class="bfd-review-details"></div><details class="bfd-review-costs"><summary><span>Listing costs</span><b>View breakdown +</b></summary><dl></dl><p>Final dates, lease terms and the full cost are confirmed in writing.</p><a href="#denaro">Read costs and exclusions ↗</a></details>';
      form.insertBefore(review, sourceApply);
      var controls = document.createElement('div'); controls.className = 'bfd-apply-controls';
      var back = document.createElement('button'); back.type = 'button'; back.textContent = '← Back';
      var next = document.createElement('button'); next.type = 'button'; next.className = 'btn btn-primary'; next.dataset.bfdNext = '';
      back.addEventListener('click', function () { show(step - 1, true); });
      next.addEventListener('click', function () { if (canAdvance()) show(step + 1, true); });
      controls.append(back, next); form.insertBefore(controls, sourceApply);
      controls.appendChild(sourceApply);
      function value(id) {
        var field = byId(id); if (!field) return '';
        if (field.tagName === 'SELECT') return field.value && field.selectedOptions[0] ? field.selectedOptions[0].textContent : '';
        return field.value.trim();
      }
      function row(dl, label, text) {
        var r = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = text || 'Not provided'; r.append(dt, dd); dl.appendChild(r);
      }
      function summary() {
        var details = review.querySelector('.bfd-review-details'), costs = review.querySelector('.bfd-review-costs dl');
        details.replaceChildren(); costs.replaceChildren();
        [
          ['You', [['Name','apNome'],['Email','apMail'],['WhatsApp','apTel']]],
          ['Your stay', [['Move-in','apQuando'],['Move-out','apUscita'],['Length requested','apMesi'],['Household','apChi'],['Signers','apFirme']]],
          ['Your profile', [['Situation','apLavoro'],['Monthly income','apReddito'],['Guarantor','apGarante']]]
        ].forEach(function (group, i) {
          var section = document.createElement('section'), head = document.createElement('div'), title = document.createElement('b');
          title.textContent = group[0]; var edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit'; edit.disabled = sourceApply.disabled;
          edit.setAttribute('aria-label', 'Edit ' + group[0].toLowerCase()); edit.addEventListener('click', function () { show(i, true); });
          head.append(title, edit); section.append(head); var dl = document.createElement('dl'); section.append(dl);
          group[1].forEach(function (field) { var text = value(field[1]); if (text) row(dl, field[0], text); });
          if (!dl.children.length) row(dl, 'Optional details', 'You can discuss these with us');
          details.append(section);
        });
        [['Monthly rent','voceCanone'],['Agency fee, incl. VAT','voceOnorario'],['Security deposit','voceCauzione']].forEach(function (field) {
          var amount = byId(field[1]); row(costs, field[0], amount ? amount.textContent.trim() : 'To confirm');
        });
      }
      function dateInvalid() {
        return ['apQuando', 'apUscita'].map(byId).find(function (field) { return field && !field.checkValidity(); });
      }
      function canAdvance() {
        if (step === 0) { var name = byId('apNome'); if (name && !name.reportValidity()) return false; }
        if (step === 1) { var invalid = dateInvalid(); if (invalid) { invalid.reportValidity(); return false; } }
        return true;
      }
      function show(n, focus) {
        step = Math.max(0, Math.min(3, n));
        groups.forEach(function (group, i) { group.hidden = i !== step; });
        review.hidden = step !== 3; sourceApply.hidden = step !== 3;
        back.hidden = step === 0; next.hidden = step === 3;
        next.textContent = step === 2 ? 'Review application →' : 'Continue →';
        buttons.forEach(function (button, i) {
          if (i === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
          button.disabled = sourceApply.disabled || i > step + 1;
        });
        if (step === 3) summary();
        if (focus) {
          var heading = step === 3 ? byId('bfdReviewTitle') : groups[step].querySelector('.ap-eti');
          if (heading) { heading.focus({preventScroll:true}); heading.scrollIntoView({block:'nearest', behavior:'auto'}); }
        }
      }
      document.addEventListener('boom:stay-invalid', function () { show(1, false); });
      form.addEventListener('submit', function (event) {
        if (step !== 3) { event.preventDefault(); event.stopImmediatePropagation(); if (canAdvance()) show(step + 1, true); return; }
        var invalid = dateInvalid();
        if (invalid) { event.preventDefault(); event.stopImmediatePropagation(); show(1, false); invalid.reportValidity(); return; }
        // Let the original validator focus its existing fields (including its
        // email OR phone rule). Restore the appropriate step before next paint.
        groups.forEach(function (group) { group.hidden = false; });
        restoreAfterValidation = true;
      }, true);
      // This bubble listener runs AFTER regia's original submit listener.
      // A promise here would run at the capture-listener microtask checkpoint,
      // hiding the fields before the original validator can focus an error.
      form.addEventListener('submit', function () {
        if (!restoreAfterValidation) return;
        restoreAfterValidation = false;
        var active = document.activeElement, found = groups.findIndex(function (group) { return group.contains(active); });
        show(found >= 0 ? found : 3, false);
        if (found >= 0 && active) active.focus({preventScroll:true});
      });
      var reviewCosts = new MutationObserver(function () { if (step === 3) summary(); });
      ['voceCanone', 'voceOnorario', 'voceCauzione'].forEach(function (id) {
        var amount = byId(id); if (amount) reviewCosts.observe(amount, {childList:true,characterData:true,subtree:true});
      });
      function sending() {
        var busy = sourceApply.disabled;
        buttons.forEach(function (button, i) { button.disabled = busy || i > step + 1; });
        review.querySelectorAll('button').forEach(function (button) { button.disabled = busy; });
        back.disabled = busy; next.disabled = busy;
        nav.hidden = form.style.display === 'none';
      }
      var stateWatch = new MutationObserver(sending);
      stateWatch.observe(sourceApply, {attributes:true, attributeFilter:['disabled']});
      stateWatch.observe(form, {attributes:true, attributeFilter:['style']});
      box.classList.add('bfd-apply-ready'); show(0, false); sending();
    })();
    function openHash() {
      if (location.hash === '#posto') {
        setView(true, false);
        if (place && !place.hidden) requestAnimationFrame(function () {
          place.scrollIntoView({ block: 'start', behavior: 'auto' });
        });
      }
      if (location.hash === '#casa') setView(false, false);
      if (location.hash === '#applica') openApplication();
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
