/* Club wayfinding: a presentation of the existing journey, never another brief. */
(function () {
  'use strict';
  if (document.body.dataset.edition !== 'club') return;
  var directions = window.BoomFlightDirections;
  if (!directions) return;

  function route(context, review, closed) {
    var nav = document.createElement('nav');
    nav.className = 'club-journey-route';
    nav.setAttribute('aria-label', 'Your Rome journey');
    var list = document.createElement('ol');
    [
      { label: 'Explore homes', current: !review, back: review },
      { label: 'Review a home', current: review },
      { label: closed ? 'Check status' : 'Apply', next: true }
    ].forEach(function (step, index) {
      var item = document.createElement('li');
      var text = document.createElement(step.back ? 'a' : 'span');
      if (step.back) {
        text.href = context.url('apartments');
        text.dataset.view = 'apartments';
      }
      if (step.current) text.setAttribute('aria-current', 'step');
      if (step.next) text.setAttribute('aria-label', closed ? 'Check the current status on the original listing' : 'Apply on the original listing, not yet started');
      var number = document.createElement('span');
      number.className = 'club-journey-number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(index + 1).padStart(2, '0');
      text.append(number, document.createTextNode(step.label));
      item.appendChild(text); list.appendChild(item);
    });
    nav.appendChild(list);
    return nav;
  }

  function render(context) {
    if (!context || !context.state) return;
    var state = context.state;
    if (state.view === 'apartments') {
      var apartments = document.getElementById('nextApartments');
      if (!apartments.querySelector('.club-journey-route')) apartments.prepend(route(context, false, false));
      var caption = apartments.querySelector('.results-caption');
      if (caption && !caption.querySelector('.club-explore-note')) {
        var note = document.createElement('p');
        note.className = 'club-explore-note';
        note.innerHTML = 'Explore the photos. <span><span aria-hidden="true">⌖</span> Locate a home in Skyline.</span> Save the ones you like with the heart.';
        caption.appendChild(note);
      }
      return;
    }
    if (state.view !== 'detail' || !context.loaded || context.error) return;
    var home = context.catalogue.find(function (item) { return item.id === state.home; });
    var content = document.getElementById('nextDetailContent');
    var breadcrumb = content && content.querySelector('.detail-breadcrumb');
    var decision = content && content.querySelector('.detail-decision');
    if (!home || !breadcrumb || !decision) return;
    var closed = home.lane === 'closed';
    var availability = window.BOOM_DISPO;
    var availabilityState = availability && typeof availability.catalogState === 'function' && home.raw
      ? availability.catalogState(home.raw).state : 'check';
    if (!breadcrumb.querySelector('.club-journey-route')) {
      var back = breadcrumb.querySelector('a[data-view="apartments"]');
      if (back) back.remove();
      breadcrumb.prepend(route(context, true, closed));
    }
    if (decision.querySelector('.club-application-next')) return;
    var next = document.createElement('section');
    next.className = 'club-application-next';
    next.setAttribute('aria-labelledby', 'clubApplicationNextTitle');
    var title = document.createElement('h3');
    title.id = 'clubApplicationNextTitle';
    title.textContent = closed ? 'Before you continue' : 'What happens next';
    var action = document.createElement('p');
    action.textContent = closed
      ? 'Open the original listing to check its current availability. This home is not currently offered as available here.'
      : availabilityState === 'check'
        ? 'Availability still needs confirmation. The next page lets you send your dates and plans for review.'
        : 'The next page opens your application. Share your dates and plans for review.';
    var expectation = document.createElement('p');
    expectation.textContent = closed
      ? 'Confirm the status and lease conditions before making arrangements.'
      : 'An application does not reserve the home. No payment is taken at this step.';
    next.append(title, action, expectation);
    decision.appendChild(next);
    // Dispatch presents the state-aware explanation once. The closed listing
    // keeps its original status note; all application links remain untouched.
    if (document.body.dataset.homeVision === 'dispatch' && !closed) {
      var repeatedNote = decision.querySelector('.decision-cta > small');
      if (repeatedNote) repeatedNote.hidden = true;
    }
  }

  // The owner calls this again after an in-place detail refresh (dates/destination).
  window.BoomClubJourney = { render: render };
  var original = directions.render;
  directions.render = function (context) {
    original.apply(this, arguments);
    render(context);
  };
})();
