/* Passage explains the native offer. It does not own prices, customer state,
   forms, submissions or the WhatsApp routing rule. */
(function () {
  'use strict';
  if (document.body.dataset.homeVision !== 'dispatch' || document.body.dataset.dispatchComposition !== 'passage') return;
  var byId = function (id) { return document.getElementById(id); };
  var hero = byId('nextHero'), pass = byId('europeServicePass'), form = byId('europeDeskForm');
  if (!hero || !pass || !form || byId('passageSupport')) return;
  var manifest = null, queued = false;
  var arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  var esc = function (value) { return String(value || '').replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var setText = function (node, value) { if (node && node.textContent !== value) node.textContent = value; };
  var setHref = function (node, value) { if (node.getAttribute('href') !== value) node.setAttribute('href', value); };
  var copy = {
    search: {
      title: 'Your criteria. A clearer search.',
      intro: 'Looking through listings is one part of a move. This service brings the search, application and lease support in your ticket together.',
      steps: [['Tell us what matters', 'Discuss your dates, budget and priorities with the desk.'], ['Agree the scope', 'Read what is included and the conditions for your city before choosing support.'], ['Make an informed choice', 'Review the homes, documents and terms with the support set out in your ticket.']]
    },
    application: {
      title: 'You found the home. Let’s look closer.',
      intro: 'Move from an interesting listing to an application you understand. The ticket above sets out the documents and lease support included.',
      steps: [['Bring the home you found', 'The desk can discuss the listing and the documents you have.'], ['Prepare your application', 'Review the rental file, presentation and checks included in this service.'], ['Understand the next step', 'Read the conditions and discuss what still needs to be confirmed.']]
    },
    viewing: {
      title: 'Be there, even from abroad.',
      intro: 'You choose the home. BOOM attends and reports back, so you can decide with more context.',
      steps: [['Choose the home', 'Bring the listing you would like the desk to visit.'], ['See what is included', 'The ticket sets out the live video walkthrough and written report for your city.'], ['Decide with more context', 'Use the viewing and report to consider the home before your next move.']]
    }
  };
  // Country coverage supplied by Valentino, 11 November 2026. This is not
  // a claim of an office, language, qualification or individual city residence.
  var people = {
    madrid: ['Rebecca & Fausto', 'Supporting Spain and the Netherlands.'],
    barcelona: ['Rebecca & Fausto', 'Supporting Spain and the Netherlands.'],
    amsterdam: ['Rebecca, Fausto & Daniele', 'Rebecca and Fausto support Spain and the Netherlands; Daniele supports the Netherlands and England.'],
    london: ['Daniele', 'Supporting the Netherlands and England.']
  };
  var contact = document.createElement('div');
  contact.className = 'passage-ticket-contact';
  contact.innerHTML = '<p>A question before you choose?</p><a id="passageWhatsApp" href="/desks"><span>Meet your desk</span>' + arrow + '</a><small>You review the message before sending.</small>';
  form.appendChild(contact);

  var support = document.createElement('section');
  support.id = 'passageSupport';
  support.className = 'passage-support';
  support.setAttribute('aria-labelledby', 'passageSupportTitle');
  support.innerHTML =
    '<div class="passage-support-heading"><h2 id="passageSupportTitle"></h2><p id="passageSupportIntro"></p></div>' +
    '<div class="passage-support-body"><ol id="passageSteps" class="passage-steps"></ol>' +
    '<aside class="passage-people" aria-labelledby="passagePeopleTitle"><h3 id="passagePeopleTitle">People behind your move.</h3>' +
      '<div id="passageCountryTeam"><strong id="passageTeamNames"></strong><p id="passageTeamCoverage"></p></div>' +
      '<div><strong>Valentino Egidi</strong><p>Founder of BOOM. Coordinating your move from Rome, working across European capitals.</p></div>' +
      '<p class="passage-partner-note">BOOM also works with partner agencies and property owners.</p>' +
      '<a id="passageDeskCall" href="/desks">Meet your desk ' + arrow + '</a>' +
      '<p class="passage-contact-note">A free call helps establish which support fits, including when none is needed.</p>' +
    '</aside></div>' +
    '<div class="passage-questions"><h3>Before you choose.</h3><div>' +
      '<details><summary>Can I browse homes first?</summary><p>Our published home catalogue is in Rome. In other European cities, choose rental search, application or viewing support. The service and its scope belong to the city you select.</p><a href="/flight-next?view=apartments" data-view="apartments">Explore Rome homes ' + arrow + '</a></details>' +
      '<details><summary>What if I already found a home?</summary><p>You can compare Application Pack and Attended Viewing above. The first supports the application and documents; the second helps you see the home while you are away. Check each ticket for its exact scope.</p></details>' +
      '<details><summary>What happens before I pay?</summary><p id="passagePaymentNote">Review the complete service and conditions on the original city page. You can speak with the desk before choosing.</p><a id="passageTermsLink" href="/desks">Read the city’s service and conditions ' + arrow + '</a></details>' +
    '</div></div>';
  hero.after(support);

  function bridge(id) {
    var section = document.createElement('section');
    section.id = id; section.className = 'passage-browse-bridge';
    section.setAttribute('aria-labelledby', id + 'Title');
    section.innerHTML = '<div><h2 id="' + id + 'Title">Looking beyond the catalogue?</h2><p>For a search around your own criteria, explore Property Finding. Browse the homes freely; choose paid help when you need it.</p>' +
      '<p class="passage-pfs-condition" data-passage-pfs-condition></p></div>' +
      '<div class="passage-bridge-links"><a class="passage-link-primary" href="/property-finding" data-journey-service="/property-finding">Explore Property Finding ' + arrow + '</a>' +
      '<a href="/client-portal?code=DEMO">See the Rome search workspace ' + arrow + '</a><small>Interactive demo · sample Rome homes · no signup</small></div>';
    return section;
  }
  var homeBridge = bridge('passageHomeBridge'), resultsBridge = bridge('passageResultsBridge');
  byId('services').before(homeBridge);
  byId('nextApartments').appendChild(resultsBridge);

  var more = document.createElement('section');
  more.className = 'passage-more';
  more.id = 'passageMoreServices';
  more.setAttribute('aria-labelledby', 'passageMoreTitle');
  more.innerHTML = '<div><h2 id="passageMoreTitle">Support beyond the search.</h2><p>Different moments need different help. Explore the existing service, scope and costs before choosing.</p><a href="/services">All Rome services &amp; prices ' + arrow + '</a></div>' +
    '<div class="passage-service-directory"><h3>For your move in Rome</h3>' +
    '<a href="/remote-move-pack"><span><strong>Remote Move Pack</strong><small>Viewings, contract support and arrival setup</small></span>' + arrow + '</a>' +
    '<a href="/concierge"><span><strong>Concierge</strong><small>Settling in and practical support, quoted for your needs</small></span>' + arrow + '</a>' +
    '<a href="/deposit-recovery"><span><strong>Deposit Recovery</strong><small>Review the process, initial fee and success fee</small></span>' + arrow + '</a>' +
    '<h3>A different plan?</h3>' +
    '<a href="/buy-property-europe"><span><strong>Buying in Europe</strong><small>A separate enquiry and written proposal</small></span>' + arrow + '</a>' +
    '<a href="/owners"><span><strong>Own a home in Rome?</strong><small>Explore BOOM’s owner services</small></span>' + arrow + '</a>' +
    '<a href="/partners"><span><strong>Work with BOOM</strong><small>Explore the existing partnership programme</small></span>' + arrow + '</a></div>';
  byId('services').after(more);

  function footerCopy() {
    var footer = byId('clubCompany'); if (!footer) return;
    setText(footer.querySelector('.club-company-intro p'), 'Homes and property management in Rome. Rental support across Europe, coordinated from Rome.');
    var principles = footer.querySelectorAll('.club-principles article');
    if (principles[1]) {
      setText(principles[1].querySelector('h3'), 'People you can reach.');
      setText(principles[1].querySelector('p'), 'Valentino coordinates from Rome. Rebecca and Fausto support Spain and the Netherlands; Daniele supports the Netherlands and England.');
    }
    if (principles[2]) {
      setText(principles[2].querySelector('h3'), 'See the Rome search workspace.');
      setText(principles[2].querySelector('p'), 'Explore the Property Finding demo with sample Rome homes and no signup.');
      setText(principles[2].querySelector('a'), 'Explore the Rome demo');
    }
    setText(footer.querySelector('.club-destinations-title p'), 'Coordinated from Rome. Choose a city to see its service and conditions.');
    var board = footer.querySelector('.club-destination-board');
    if (manifest && board) Object.keys(manifest.cities).forEach(function (slug) {
      var city = manifest.cities[slug];
      if (!/^[a-z]+$/.test(slug) || !city || city.live !== true || city.mode !== 'search' || !city.city || board.querySelector('[data-europe-city="' + slug + '"],[data-passage-desk="' + slug + '"]')) return;
      var link = document.createElement('a');
      link.dataset.passageDesk = slug; link.href = '/' + slug;
      link.innerHTML = '<strong>' + esc(city.city) + '</strong><span>Service &amp; conditions</span>' + arrow;
      board.appendChild(link);
    });
  }
  function nativeRomeFacts() {
    var ticket = document.querySelector('#services [data-rome-service="property-finding"]');
    var fee = ticket && ticket.querySelector('.ticket-stub strong'), condition = ticket && ticket.querySelector('.ticket-terms');
    var text = fee && condition ? 'Property Finding ' + fee.textContent.trim() + '. ' + condition.textContent.trim() : 'Read the full scope, fee and refund conditions before choosing.';
    document.querySelectorAll('[data-passage-pfs-condition]').forEach(function (node) { setText(node, text); });
    var proof = document.querySelector('.europe-service-proof');
    if (proof) proof.hidden = true; // The explicit Rome demo now belongs beside browsing.
  }
  function readSelection() {
    var slug = document.body.dataset.europeCity || 'rome';
    var selected = document.querySelector('#europeDeskPlanner [data-europe-need][aria-pressed="true"]');
    var need = selected && selected.dataset.europeNeed || 'search';
    var label = document.querySelector('.europe-city-switch [data-europe-city="' + slug + '"] span:last-child');
    return {slug:slug, need:copy[need] ? need : 'search', name:label ? label.textContent.trim() : 'your city'};
  }
  function safeContact(city) {
    try {
      var url = new URL(city.contact.whatsapp);
      var message = url.searchParams.get('text') || '', marker = 'Hi BOOM ' + city.city;
      var marked = message === marker || message.indexOf(marker + ',') === 0;
      var keys = Array.from(url.searchParams.keys());
      return url.protocol === 'https:' && url.hostname === 'wa.me' && !url.username && !url.password && !url.hash && /^\/[0-9]+$/.test(url.pathname) && keys.length === 1 && keys[0] === 'text' && marked ? city.contact.whatsapp : '';
    } catch (_) { return ''; }
  }
  function render() {
    queued = false;
    var selection = readSelection(), foreign = selection.slug !== 'rome', facts = manifest && manifest.cities[selection.slug], content = copy[selection.need];
    var plans = facts && facts.pricing && facts.pricing.plans, planId = {search:'full-search',application:'application-pack',viewing:'attended-viewing'}[selection.need];
    var plan = Array.isArray(plans) && plans.find(function (p) { return p.id === planId; });
    support.hidden = !foreign || !plan;
    homeBridge.hidden = foreign;
    more.hidden = foreign;
    setText(byId('passageSupportTitle'), content.title);
    setText(byId('passageSupportIntro'), content.intro);
    var steps = byId('passageSteps');
    if (steps.dataset.need !== selection.need) {
      steps.innerHTML = content.steps.map(function (step) { return '<li><h3>' + esc(step[0]) + '</h3><p>' + esc(step[1]) + '</p></li>'; }).join('');
      steps.dataset.need = selection.need;
    }
    var team = people[selection.slug];
    byId('passageCountryTeam').hidden = !team;
    setText(byId('passageTeamNames'), team ? team[0] : '');
    setText(byId('passageTeamCoverage'), team ? team[1] : '');
    setHref(byId('passageDeskCall'), '/' + selection.slug + '#desk');
    byId('passageDeskCall').firstChild.textContent = 'Meet the ' + selection.name + ' desk ';
    setHref(byId('passageTermsLink'), '/' + selection.slug);
    var wa = facts && safeContact(facts), waLink = byId('passageWhatsApp');
    setHref(waLink, wa || '/' + selection.slug + '#desk');
    setText(waLink.querySelector('span'), wa ? 'WhatsApp the ' + selection.name + ' desk' : 'Meet the ' + selection.name + ' desk');
    if (wa) { waLink.target = '_blank'; waLink.rel = 'noopener'; }
    else { waLink.removeAttribute('target'); waLink.removeAttribute('rel'); }
    setText(contact.querySelector('small'), wa ? 'You review the message before sending.' : 'Open the city page to speak with the desk.');
    var payment = plan && facts.chargeAt === 'signing' && plan.trigger ? plan.trigger : 'Review the complete service and conditions on the city page. You can speak with the desk before choosing. No payment is taken on this page.';
    setText(byId('passagePaymentNote'), payment);
    var coordinator = pass.querySelector('.club-desk-person figcaption p span');
    setText(coordinator, 'Coordinating from Rome');
    setText(byId('europeContextNote'), foreign ? 'Coordinated from Rome, with people and partners across Europe. Read the service and conditions for your chosen city.' : 'Rome: real homes, Skyline and an agency to guide your move.');
    footerCopy(); nativeRomeFacts();
    if (window.BoomFlightClub) window.BoomFlightClub.refreshServiceLinks();
  }
  function queue() { if (!queued) { queued = true; queueMicrotask(render); } }
  new MutationObserver(queue).observe(document.body, {attributes:true, attributeFilter:['data-europe-city','data-view']});
  new MutationObserver(queue).observe(pass, {childList:true, subtree:true});
  new MutationObserver(queue).observe(byId('europeDeskPlanner'), {attributes:true, subtree:true, attributeFilter:['aria-pressed']});
  window.addEventListener('pageshow', queue);
  window.addEventListener('boom:flight-view', queue);

  // Use the native render context, including original availability and Apply.
  // Viewing a BOOM home must never be presented as requiring a paid add-on.
  if (window.BoomFlightDirections) {
    var originalRender = window.BoomFlightDirections.render;
    window.BoomFlightDirections.render = function (context) {
      originalRender.apply(this, arguments);
      if (context && context.state && context.state.view === 'detail') {
        var detail = byId('nextDetailContent'), viewing = detail.querySelector('.detail-support a[href*="/virtual-viewing"]'), apply = detail.querySelector('[data-next-apply]');
        if (viewing && apply) {
          viewing.href = apply.href;
          viewing.textContent = 'Ask about this BOOM home';
          var note = document.createElement('p');
          note.className = 'passage-viewing-note';
          note.textContent = 'Viewings of BOOM homes are free. Availability and appointments are confirmed with the agency.';
          viewing.after(note);
        }
      }
      queue();
    };
  }
  fetch('/assets/boom-desks-public.json').then(function (response) {
    if (!response.ok) throw new Error('Desk information unavailable');
    return response.json();
  }).then(function (data) {
    if (!data || !data.cities || typeof data.cities !== 'object') return;
    manifest = data; queue();
  }).catch(function () { queue(); });
  render();
})();
