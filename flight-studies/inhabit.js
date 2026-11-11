(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const state = { city: 'milan', plan: 'full-search', paused: false, keyboard: false, data: null };
  const motion = window.BoomFlightNextMotion;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  function syncMotion() {
    const stopped = state.paused || reduce.matches;
    motion?.setPaused(stopped);
    document.body.dataset.paused = String(stopped);
    $('#motion').setAttribute('aria-pressed', String(stopped));
    $('#motion').innerHTML = `<span aria-hidden="true">${stopped ? '▷' : 'Ⅱ'}</span> ${reduce.matches ? 'Reduced motion' : stopped ? 'Resume motion' : 'Pause motion'}`;
    $('#motion').disabled = reduce.matches;
    $('#stage-motion').setAttribute('aria-pressed', String(stopped));
    $('#stage-motion').textContent = reduce.matches ? 'Reduced motion' : stopped ? 'Resume motion' : 'Pause motion';
    $('#stage-motion').disabled = reduce.matches;
  }
  $('#motion').addEventListener('click', () => { state.paused = !state.paused; syncMotion(); });
  $('#stage-motion').addEventListener('click', () => { state.paused = !state.paused; syncMotion(); });
  reduce.addEventListener('change', syncMotion);
  document.addEventListener('keydown', () => { state.keyboard = true; document.body.dataset.keyboard = 'true'; });
  document.addEventListener('pointerdown', () => { state.keyboard = false; document.body.dataset.keyboard = 'false'; });
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function fitBoard() {
    const available = $('.city-stage').clientWidth - (innerWidth <= 560 ? 36 : 60);
    const size = Math.min(innerWidth <= 560 ? 45 : 60, available / (state.city.length * .91));
    $('.city-stage').style.setProperty('--board-size', `${size}px`);
  }
  function render() {
    if (!state.data) return;
    const city = state.data.cities?.[state.city], plan = city?.pricing?.plans?.find(p => p.id === state.plan);
    if (!city || !city.live || !plan || !Array.isArray(plan.includes) || !plan.url || !plan.priceDisplay) {
      document.querySelectorAll('[data-city]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.city === state.city)));
      motion?.setDestination(state.city, { animate: false }); fitBoard();
      $('#service-status').textContent = 'The selected service could not load. Continue to the original city desk.';
      $('#service').innerHTML = `<p class="load-note">The selected service could not load. Check the original ${esc(state.city.charAt(0).toUpperCase()+state.city.slice(1))} desk for current details.</p><a class="button black" href="https://www.boomrome.com/${esc(state.city)}">Open the city desk <span aria-hidden="true">↗</span></a>`;
      return;
    }
    document.querySelectorAll('[data-city]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.city === state.city)));
    $('#service-status').textContent = `${city.name} desk. ${plan.label}, ${plan.priceDisplay}, ${plan.condition}.`;
    motion?.setDestination(city.name, { animate: !state.keyboard && !state.paused && !reduce.matches });
    fitBoard();
    $('#service').innerHTML = `<div class="service-title"><h3>${esc(plan.label)}</h3><span class="price">${esc(plan.priceDisplay)}</span></div><div class="price-condition"><span>${esc(city.name)} desk</span><span>${esc(plan.condition)}</span></div><ul class="service-list">${plan.includes.map(item => `<li>${esc(item)}</li>`).join('')}</ul><div class="condition"><p>${esc(city.tenantSideNote)}</p><p>${esc(plan.paymentNote)}</p>${plan.refundNote ? `<p>${esc(plan.refundNote)}</p>` : ''}</div><a class="button black service-cta" id="native-service" href="${esc(plan.url)}">Review ${esc(plan.label)} in ${esc(city.name)} <span aria-hidden="true">↗</span></a><a class="terms" href="${esc(city.termsUrl)}">Read service terms</a><p class="service-notice">Continue on BOOM’s original city page. No payment at this step.</p>`;
  }
  document.querySelectorAll('[data-city]').forEach(button => button.addEventListener('click', () => { state.city = button.dataset.city; render(); }));
  document.querySelectorAll('input[name=need]').forEach(input => input.addEventListener('change', () => { state.plan = input.value; render(); }));
  window.addEventListener('resize', fitBoard, { passive: true });
  motion?.setDestination('MILAN', { animate: false });
  syncMotion(); fitBoard();
  window.BoomStudyPublicData.load().then(data => { state.data = data; render(); }).catch(() => { state.data = { cities: {} }; render(); });
})();
