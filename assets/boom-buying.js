(function () {
  'use strict';
  var form = document.getElementById('buyingForm'), config = window.BOOM_BUYING_PAGE;
  if (!form || !config || !window.BOOM_BUYING) return;
  var status = document.getElementById('formStatus'), submit = document.getElementById('buySubmit');
  var busy = false, completed = false;
  // Lives only in memory: a retry retains its ID; personal data never enters storage or URL.
  var requestId = crypto.randomUUID().replace(/-/g, '');
  function showError(text, field) {
    status.setAttribute('data-error', ''); status.textContent = text;
    var el = field && form.elements.namedItem(field);
    if (el && el.focus) { el.setAttribute('aria-invalid','true'); el.setAttribute('aria-describedby','formStatus'); el.focus(); }
  }
  form.addEventListener('input', function (event) { event.target.removeAttribute('aria-invalid'); });
  submit.disabled = false;
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy || completed || !form.reportValidity()) return;
    status.removeAttribute('data-error'); status.textContent = '';
    var body = Object.fromEntries(new FormData(form).entries());
    body.form = 'buy-property-europe'; body.page_lang = config.lang; body.requestId = requestId;
    var parsed = window.BOOM_BUYING.parse(body);
    if (parsed.error) {
      showError(parsed.error === 'phone_international' ? config.phoneError : parsed.error === 'privacy_required' ? config.privacyError : config.validation, parsed.field); return;
    }
    if (!body.email && !body.phone) { showError(config.contactError, 'email'); return; }
    busy = true; submit.disabled = true; submit.textContent = config.sending;
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch('/api/leads/web', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:controller.signal});
      var result = await response.json();
      if (!response.ok || !result.ok || !result.id) {
        showError(result.error === 'contact_required' ? config.contactError : config.failed, result.field); return;
      }
      completed = true;
      document.getElementById('buyFields').hidden = true;
      var success = document.getElementById('buySuccess'); success.hidden = false;
      document.getElementById('buyReference').textContent = result.id;
      success.focus();
      // The shared tracker checks explicit analytics consent; no form values are sent.
      if (window.boomTrack) window.boomTrack('generate_lead', {service:'property_buying', method:'buying_brief'});
    } catch (_) { showError(config.failed); }
    finally { clearTimeout(timer); busy = false; submit.disabled = completed; submit.textContent = config.cta; }
  });
  document.getElementById('buyAgain').addEventListener('click', function () {
    form.reset(); completed = false; requestId = crypto.randomUUID().replace(/-/g, '');
    document.getElementById('buyFields').hidden = false; document.getElementById('buySuccess').hidden = true;
    status.textContent = ''; submit.disabled = false; form.elements.country.focus();
  });
  document.querySelectorAll('[data-buy-city]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (completed) return;
      form.elements.city.value = button.dataset.buyCity; form.elements.country.value = button.dataset.buyCountry;
      form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start'});
      form.elements.city.focus({preventScroll:true});
    });
  });
}());
