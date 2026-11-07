/* Dispatch reads the native draft and published offer. It owns no customer
 * state, destination data, validation rules, service URL or submission. */
(function () {
  'use strict';
  if (document.body.dataset.homeVision !== 'dispatch' || document.body.dataset.experience !== 'panorama') return;
  var S = window.BOOM_STAY, J = window.BOOM_JOURNEY;
  var byId = function (id) { return document.getElementById(id); };
  var context = byId('directionClubTicket');
  if (!context || !S || !J || byId('dispatchJourneyTicket')) return;

  var ticket = document.createElement('aside');
  ticket.id = 'dispatchJourneyTicket';
  ticket.className = 'dispatch-journey-ticket';
  ticket.hidden = true;
  ticket.setAttribute('aria-labelledby', 'dispatchJourneyTitle');
  ticket.innerHTML = '<h2 id="dispatchJourneyTitle">Your move</h2>' +
    '<dl class="dispatch-journey-fields">' +
      '<div class="dispatch-journey-field" data-journey-field="destination"><dt>Destination</dt><dd><span id="dispatchJourneyCity"></span> <span id="dispatchJourneyCityCode" class="dispatch-journey-code"></span></dd></div>' +
      '<div class="dispatch-journey-field" data-journey-field="dates"><dt>Dates</dt><dd><span id="dispatchJourneyDates"></span><span id="dispatchJourneyDateIssue" class="dispatch-journey-warning" hidden></span></dd></div>' +
      '<div class="dispatch-journey-field" data-journey-field="rent"><dt>Monthly rent</dt><dd id="dispatchJourneyRent"></dd></div>' +
      '<div class="dispatch-journey-field" data-journey-field="household"><dt>Household</dt><dd id="dispatchJourneyHousehold"></dd></div>' +
      '<div class="dispatch-journey-field" data-journey-field="support"><dt>Support</dt><dd><span id="dispatchJourneySupport"></span><span id="dispatchJourneySupportDetail" class="dispatch-journey-detail"></span><span id="dispatchJourneyFee" class="dispatch-journey-fee" hidden></span></dd></div>' +
    '</dl><nav class="dispatch-journey-actions" aria-label="Review your move">' +
      '<a id="dispatchJourneyEdit" href="#nextSearch">Edit your plan</a>' +
      '<a id="dispatchJourneyReview" href="#services">Review options</a>' +
    '</nav>';
  context.after(ticket);

  var queued = false;
  var dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function text(node) { return node ? node.textContent.trim() : ''; }
  function setText(id, value) {
    var node = byId(id);
    if (node.textContent !== value) node.textContent = value;
  }
  function setAttribute(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function setHidden(id, hidden) {
    var node = byId(id);
    if (node.hidden !== hidden) node.hidden = hidden;
  }
  function setRowHidden(name, hidden) {
    var row = ticket.querySelector('[data-journey-field="' + name + '"]');
    if (row.hidden !== hidden) row.hidden = hidden;
  }
  function selectedLabel(id, empty) {
    var field = byId(id);
    return field && field.value ? text(field.selectedOptions[0]) || empty : empty;
  }
  function date(value) {
    return S.date(value) ? dateFormat.format(new Date(value + 'T12:00:00')) : '';
  }
  function draft() {
    var city = document.body.dataset.europeCity || 'rome';
    var prefix = city === 'rome' ? 'next' : 'europe';
    var moveIn = byId(prefix + 'MoveIn'), moveOut = byId(prefix + 'MoveOut');
    var dates = { moveIn: moveIn.value, moveOut: moveOut.value };
    // Partial entry in a native date field can have an empty value while the
    // browser still reports badInput. It must not appear as an open-date plan.
    var badIn = moveIn.validity && moveIn.validity.badInput;
    var badOut = moveOut.validity && moveOut.validity.badInput;
    var issue = badIn || badOut
      ? { field: badIn ? 'moveIn' : 'moveOut', message: badIn ? 'Choose a valid arrival date.' : 'Choose a valid departure date.' }
      : (city === 'rome' ? S.validate(dates) : J.deskError(dates));
    return { city: city, prefix: prefix, dates: dates, issue: issue };
  }
  function render() {
    queued = false;
    var current = draft(), foreign = current.city !== 'rome';
    var cityButton = document.querySelector('.europe-city-switch [data-europe-city="' + current.city + '"]');
    setText('dispatchJourneyCity', text(cityButton && cityButton.querySelector('span:last-child')) || 'Choose your city');
    setText('dispatchJourneyCityCode', text(cityButton && cityButton.querySelector('.europe-city-code')));
    var start = date(current.dates.moveIn), end = date(current.dates.moveOut);
    var dates = start || end ? (start || 'Arrival open') + ' – ' + (end || 'Departure open') : 'Dates open';
    if (current.issue && !start && !end) dates = 'Check your dates';
    setText('dispatchJourneyDates', dates);
    setText('dispatchJourneyDateIssue', current.issue ? current.issue.message : '');
    setHidden('dispatchJourneyDateIssue', !current.issue);
    setAttribute(ticket, 'data-date-state', current.issue ? 'invalid' : start && end ? 'valid' : 'open');
    setText('dispatchJourneyRent', selectedLabel(current.prefix + 'Budget', 'Budget open'));
    setText('dispatchJourneyHousehold', selectedLabel(current.prefix + 'People', 'Household open'));
    setRowHidden('rent', !byId(current.prefix + 'Budget').value);
    setRowHidden('household', !byId(current.prefix + 'People').value);
    setHidden('dispatchJourneyTicket', !(current.dates.moveIn || current.dates.moveOut || current.issue ||
      byId(current.prefix + 'Budget').value || byId(current.prefix + 'People').value));

    var support, detail, fee = '', available = false;
    if (foreign) {
      var pass = byId('europeServicePass');
      var price = text(pass && pass.querySelector('.europe-service-price strong'));
      var condition = text(pass && pass.querySelector('.europe-service-price small'));
      var choice = document.querySelector('#europeDeskPlanner [data-europe-need][aria-pressed="true"] strong');
      available = !!(price && condition);
      support = text(pass && pass.querySelector('.europe-service-copy h3'));
      if (!support) support = 'Review the city desk';
      detail = available ? text(choice) : text(pass && pass.querySelector('.europe-service-copy>p:not(.eyebrow)'));
      if (available) fee = price + ' · ' + condition;
    } else {
      // The Rome chooser filters situations; a single visible Property Finding
      // ticket is still not an explicit paid-service selection.
      support = text(document.querySelector('#visionNeedChooser [data-vision-need][aria-pressed="true"]')) || 'Choose your support';
      detail = 'No paid service selected.';
    }
    setText('dispatchJourneySupport', support);
    setText('dispatchJourneySupportDetail', detail);
    setText('dispatchJourneyFee', fee);
    setHidden('dispatchJourneyFee', !available);
    setAttribute(ticket, 'data-service-state', foreign ? available ? 'available' : 'unavailable' : 'unselected');
    setAttribute(byId('dispatchJourneyEdit'), 'href', foreign ? '#europeOptionalBrief' : '#nextSearch');
    setAttribute(byId('dispatchJourneyEdit'), 'aria-controls', foreign ? 'europeOptionalBrief' : 'nextSearchForm');
    setAttribute(byId('dispatchJourneyReview'), 'href', foreign ? '#europeServicePass' : '#services');
    setAttribute(byId('dispatchJourneyReview'), 'aria-controls', foreign ? 'europeServicePass' : 'visionNeedChooser');
  }
  function queue() {
    if (queued) return;
    queued = true;
    queueMicrotask(render);
  }
  function reveal(target, focus, animate) {
    if (!target || !focus) return;
    var pause = byId('nextMotionToggle');
    var smooth = animate && !reduced.matches && !document.hidden && !(pause && pause.getAttribute('aria-pressed') === 'true');
    target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'instant' });
    if (!focus.matches('button,input,select,a[href],summary')) focus.setAttribute('tabindex', '-1');
    focus.focus({ preventScroll: true });
  }
  ticket.addEventListener('click', function (event) {
    var link = event.target.closest('a');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var current = draft(), foreign = current.city !== 'rome';
    if (link.id === 'dispatchJourneyEdit') {
      event.preventDefault();
      if (foreign) byId('europeOptionalBrief').open = true;
      var field = current.issue ? current.issue.field : 'moveIn';
      var input = byId(current.prefix + (field === 'moveOut' ? 'MoveOut' : 'MoveIn'));
      reveal(byId(foreign ? 'europeOptionalBrief' : 'nextSearch'), input, event.detail > 0);
      if (input.validity && !input.validity.valid) input.reportValidity();
    } else if (link.id === 'dispatchJourneyReview') {
      event.preventDefault();
      var target = byId(foreign ? 'europeServicePass' : 'visionNeedChooser');
      var focus = target && target.querySelector(foreign ? 'h3' : 'button[aria-pressed="true"]');
      reveal(target, focus || target, event.detail > 0);
    }
  });

  ['input', 'change', 'submit'].forEach(function (name) {
    document.addEventListener(name, function (event) {
      if (event.target.closest('#nextSearchForm,#europeDeskForm,#nextStayForm,#nextFilterBudget,#nextFilterType')) queue();
    });
  });
  // Native date segments can change badInput without changing their serialized
  // value, so browsers need not emit input/change until the date is complete.
  ['keyup', 'focusout'].forEach(function (name) {
    document.addEventListener(name, function (event) {
      if (event.target.matches('#nextMoveIn,#nextMoveOut,#europeMoveIn,#europeMoveOut')) queue();
    });
  });
  document.addEventListener('click', function (event) {
    if (event.target.closest('#nextClearDates,#nextClearFilters,[data-reset]')) queue();
  });
  ['boom:flight-view', 'popstate', 'pageshow', 'hashchange'].forEach(function (name) { window.addEventListener(name, queue); });
  if (window.navigation && window.navigation.addEventListener) window.navigation.addEventListener('currententrychange', queue);
  new MutationObserver(queue).observe(document.body, { attributes: true, attributeFilter: ['data-europe-city', 'data-view'] });
  ['visionNeedChooser', 'europeServicePass', 'europeSelectedService', 'europeBriefSummary', 'nextStayHint'].forEach(function (id) {
    var node = byId(id);
    if (node) new MutationObserver(queue).observe(node, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-pressed'] });
  });
  queue();
})();
