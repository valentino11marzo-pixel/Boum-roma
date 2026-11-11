(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const citySelect = $('city');
  const needSelect = $('need');
  const names = {rome:'Rome',amsterdam:'Amsterdam',barcelona:'Barcelona',berlin:'Berlin',london:'London',madrid:'Madrid',milan:'Milan',paris:'Paris',valencia:'Valencia'};
  const needs = {'full-search':'help finding a home','application-pack':'help with my application','attended-viewing':'someone to visit a home'};
  const native = 'https://www.boomrome.com';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let data = null;
  let paused = false;
  let keyboard = false;
  let lastNeed = 'full-search';
  document.addEventListener('keydown', () => { keyboard = true; });
  document.addEventListener('pointerdown', () => { keyboard = false; });

  function money(city, amount) {
    return new Intl.NumberFormat('en-GB', { style:'currency', currency:data.cities[city].currency, maximumFractionDigits:0 }).format(amount);
  }
  function setText(id, value) { $(id).textContent = value; }
  function setList(lines) {
    $('includes').replaceChildren(...lines.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  }
  function cityWidth() {
    citySelect.classList.toggle('long-city', names[citySelect.value].length > 8);
    const selectStyle = getComputedStyle(citySelect);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${selectStyle.fontWeight} ${selectStyle.fontSize} ${selectStyle.fontFamily}`;
    const width = ctx.measureText(names[citySelect.value]).width + parseFloat(selectStyle.paddingLeft) + parseFloat(selectStyle.paddingRight) + 8;
    citySelect.parentElement.style.width = width + 'px';
  }
  function syncMotion() {
    if (window.BoomFlightNextMotion) window.BoomFlightNextMotion.setPaused(paused || reduce.matches);
    $('pause').setAttribute('aria-pressed', String(paused || reduce.matches));
    setText('pauseText', reduce.matches ? 'Reduced motion' : paused ? 'Resume motion' : 'Pause motion');
    $('pause').disabled = reduce.matches;
    $('pauseStage').setAttribute('aria-pressed', String(paused || reduce.matches));
    $('pauseStage').setAttribute('aria-label', reduce.matches ? 'Reduced motion enabled' : paused ? 'Resume city animation' : 'Pause city animation');
    setText('pauseStageText', reduce.matches ? 'Motion off' : paused ? 'Resume' : 'Pause');
    $('pauseStage').disabled = reduce.matches;
  }
  $('pause').addEventListener('click', () => { paused = !paused; syncMotion(); });
  $('pauseStage').addEventListener('click', () => { paused = !paused; syncMotion(); });
  reduce.addEventListener('change', syncMotion);

  function terms(city, plan) {
    return [plan.paymentNote, plan.refundNote].filter(Boolean).join(' ') || 'Read the full service conditions before you order on your city desk page.';
  }
  function unavailable(city) {
    $('loadingError').hidden = false;
    setText('quickPlan', 'Current details unavailable');
    setText('quickPrice', 'See city desk');
    setText('serviceTitle', 'Details unavailable');
    setText('serviceType', 'Tenant-side rental support.');
    setText('serviceDescription', 'Service details could not load. Review the current offer on the original BOOM city page.');
    setText('servicePrice', 'See desk');
    setText('serviceCondition', 'Current price unavailable');
    setText('paymentNote', 'Please review prices and conditions on the original BOOM city page.');
    setText('feeAnswer', 'Current fees could not load. Read the original city desk for current prices and conditions.');
    setText('refundAnswer', 'Read the original city desk for the conditions that apply to your selected service.');
    setText('intentNote', 'Choose a city and review current details on its original BOOM page.');
    setText('contextNote', 'European desks provide tenant-side rental support.');
    setText('scopeTitle', 'Current service details');
    setText('handoffNote', 'Review the current offer on the original BOOM city page. No payment at this step.');
    setText('selectionStatus', names[city] + '. Current service details unavailable.');
    setList(['The original desk has the current services, fees and conditions.']);
    $('continue').href = native + '/' + city;
    setText('continueText', 'Visit the ' + names[city] + ' desk');
  }
  function render() {
    const city = citySelect.value;
    const name = names[city];
    const isRome = city === 'rome';
    if (isRome) {
      if (needSelect.value !== 'homes') lastNeed = needSelect.value;
      needSelect.replaceChildren(new Option('to explore real homes', 'homes', true, true));
    } else if (needSelect.value === 'homes') {
      needSelect.replaceChildren(...Object.entries(needs).map(([id,label]) => new Option(label,id,false,id === lastNeed)));
    }
    const need = needSelect.value;
    cityWidth();
    if (window.BoomFlightNextMotion) {
      window.BoomFlightNextMotion.setDestination(name, { animate:!keyboard && !reduce.matches && !paused });
    }
    setText('deskLabel', isRome ? 'Your Rome home' : `Your ${name} desk`);
    $('termsLink').href = `${native}/terms${isRome ? '' : '#city-desks'}`;
    $('callLink').href = `${native}/${isRome ? 'about' : city + '#desk'}`;
    $('continue').href = `${native}/${isRome ? 'apartments' : city + '#fare-' + need}`;
    setText('callLink', isRome ? 'Meet the agency ↗' : 'Prefer to talk? Meet your desk ↗');
    if (isRome) {
      $('loadingError').hidden = true;
      setText('intentNote', 'Real homes in Rome. Explore the location, rent and conditions on each original listing.');
      setText('quickPlan', 'The Rome collection');
      setText('quickPrice', 'Explore homes');
      setText('serviceType', 'The BOOM homes catalogue. In Rome.');
      setText('serviceTitle', 'Find your Rome.');
      setText('serviceDescription', 'Explore the real BOOM homes in Rome. Look at the photographs, location, rent and availability, then continue with the home that fits your move.');
      setText('servicePrice', 'Rome');
      setText('serviceCondition', 'Homes, location & costs');
      setText('paymentNote', 'Rent, deposit, fees and availability depend on the individual home. Read the current details on the original listing before you apply.');
      setText('scopeTitle', 'Before you choose');
      setList(['Explore the original homes catalogue','Read the home’s photographs and location','Check current rent, availability and conditions','Continue to the original application for the home']);
      setText('continueText', 'Explore homes in Rome');
      setText('handoffNote', 'Open the original BOOM homes catalogue. You can explore before providing your details.');
      setText('contextNote', 'Real homes in Rome. European desks provide tenant-side rental support.');
      setText('feeAnswer', 'Each Rome home has its own rent, deposit, fees and conditions. Read the current listing for its complete costs and availability before applying. European desk fees are separate services.');
      setText('refundAnswer', 'The European Full Search refund rule does not apply to a Rome home reservation. Read the conditions associated with the home or service you choose on the original BOOM site.');
      setText('selectionStatus', 'Rome selected. Explore the original homes catalogue.');
      return;
    }
    if (!data) { unavailable(city); return; }
    const cityData = data.cities[city];
    const plan = cityData?.pricing?.plans?.find(item => item.id === need);
    if (!cityData?.live || !plan) {
      unavailable(city);
      return;
    }
    $('loadingError').hidden = true;
    const price = money(city,plan.price);
    setText('intentNote','An agent on your side of the rental search. Choose what you need. See exactly what it includes.');
    setText('quickPlan', plan.label);
    $('quickPrice').replaceChildren(document.createTextNode(price + ' '), Object.assign(document.createElement('small'), {textContent:plan.condition}));
    setText('serviceType','Tenant-side rental support. Based in Rome. Working for your move.');
    setText('serviceTitle',plan.label);
    setText('serviceDescription',plan.offerDescription);
    setText('servicePrice',price);
    setText('serviceCondition',plan.condition);
    setText('paymentNote',terms(city,plan));
    setText('scopeTitle','What’s included');
    setList(plan.includes);
    setText('continueText',`Review ${plan.label} in ${name}`);
    setText('handoffNote','Review the full service and terms on BOOM. No payment at this step.');
    setText('contextNote',`A service for the tenant. This is not a catalogue of ${name} homes.`);
    const offers = cityData.pricing.plans;
    setText('feeAnswer', offers.map(offer => `${offer.label}: ${offer.priceDisplay}, ${offer.condition}.`).join(' ') + ' Read the full conditions on the original city page before you order.');
    setText('refundAnswer', [cityData.pricing.sub, cityData.chargeAt === 'checkout' ? data.refund.rule : plan.trigger].filter(Boolean).join(' ') + ' Read the full conditions on your original city desk page.');
    setText('selectionStatus',`${name}. ${plan.label}. ${price}, ${plan.condition}. Service details updated below.`);
  }
  citySelect.addEventListener('change',render);
  needSelect.addEventListener('change',render);
  window.addEventListener('resize',cityWidth);
  window.BoomFlightNextMotion?.setDestination('MILAN',{animate:false});
  syncMotion();
  cityWidth();
  window.BoomStudyPublicData.load().then(result => {
    data=result;
    citySelect.disabled=false;
    needSelect.disabled=false;
    render();
  }).catch(() => {
    citySelect.disabled=false;
    needSelect.disabled=false;
    render();
  });
})();
