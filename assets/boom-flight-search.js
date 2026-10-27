/* The real save-search transport. Success follows the server, never the click. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BoomSaveSearch = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  async function submit(form, body, transport) {
    if (form.dataset.sending === 'true') return false;
    var button = form.querySelector('[type="submit"]'), status = form.querySelector('[role="status"]');
    if (!status) return false;
    form.dataset.sending='true';button.disabled=true;button.textContent='Saving…';status.textContent='';
    var controller = new AbortController(), timeout = setTimeout(function(){controller.abort();},20000);
    try {
      var response=await (transport || fetch)('/api/search/save',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal
      });
      var result=await response.json();
      if(!response.ok || !result || result.ok!==true || !result.id) {
        status.textContent=response.status===429 ? 'Too many attempts. Please try again in a few minutes.' : 'Your search could not be saved. Your details are still here — please retry.';
        return false;
      }
      status.textContent='Search saved. We’ll email you when a new matching home appears.';
      button.textContent='Saved ✓';
      return true;
    } catch (_) {
      status.textContent='We could not confirm the save. Please check your connection before trying again.';
      return false;
    } finally {
      clearTimeout(timeout);form.dataset.sending='false';button.disabled=false;
      if(button.textContent!=='Saved ✓')button.textContent='Save search';
    }
  }
  return { submit: submit };
});
