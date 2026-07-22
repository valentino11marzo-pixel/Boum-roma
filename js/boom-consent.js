/*
 * boom-consent.js — GDPR / Google Consent Mode v2, the BOOM way.
 *
 * The gtag snippet on every page sets consent DEFAULT = denied before
 * gtag('config') runs (see the inline head snippet). This module:
 *   1. restores a remembered choice (365 days) and, if granted, lifts
 *      consent immediately — before the banner would even render;
 *   2. otherwise shows a small, non-blocking plate (bottom-left) that
 *      never interrupts reading or checkout;
 *   3. exposes window.boomConsent.open() so a footer link can reopen it.
 *
 * Storage: localStorage 'boom:consent' = 'all:<ms>' | 'min:<ms>'.
 * The Meta pixel (js/boom-pixel.js) independently requires 'all'.
 */
(function () {
  'use strict';
  var KEY = 'boom:consent', YEAR = 365 * 864e5;

  function gtagSafe() { try { window.gtag.apply(null, arguments); } catch (e) {} }
  function state() {
    try {
      var v = localStorage.getItem(KEY) || '', m = /^(all|min):(\d+)$/.exec(v);
      if (!m) return null;
      if (Date.now() - (+m[2]) > YEAR) { localStorage.removeItem(KEY); return null; }
      return m[1];
    } catch (e) { return null; }
  }
  function grant() {
    gtagSafe('consent', 'update', {
      analytics_storage: 'granted', ad_storage: 'granted',
      ad_user_data: 'granted', ad_personalization: 'granted'
    });
    try { document.dispatchEvent(new CustomEvent('boom-consent-granted')); } catch (e) {}
  }
  function save(v) { try { localStorage.setItem(KEY, v + ':' + Date.now()); } catch (e) {} }

  var s = state();
  if (s === 'all') grant();

  var el = null;
  function close() {
    if (!el) return;
    el.style.opacity = '0'; el.style.transform = 'translateY(10px)';
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); el = null; }, 450);
  }
  function open() {
    if (el) return;
    if (!document.getElementById('boomConsentCss')) {
      var st = document.createElement('style'); st.id = 'boomConsentCss';
      st.textContent =
        '.boomcst{position:fixed;left:16px;bottom:16px;z-index:140;width:min(348px,calc(100vw - 32px));' +
        'background:rgba(9,9,11,.92);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);' +
        'border:1px solid rgba(255,215,0,.22);border-radius:16px;padding:16px 16px 14px;' +
        "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#fff;font-weight:300;" +
        'box-shadow:0 24px 60px rgba(0,0,0,.55);opacity:0;transform:translateY(10px);' +
        'transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1)}' +
        '.boomcst .e{font-size:9px;letter-spacing:2.4px;text-transform:uppercase;color:#FFD700}' +
        '.boomcst p{font-size:12.5px;line-height:1.55;color:rgba(255,255,255,.72);margin:7px 0 12px}' +
        '.boomcst p a{color:rgba(255,229,160,.9);text-decoration:none}' +
        '.boomcst .r{display:flex;gap:8px;align-items:center}' +
        '.boomcst button{font-family:inherit;cursor:pointer;border-radius:100px;font-size:12px;padding:9px 15px;transition:.25s}' +
        '.boomcst .ok{flex:1;border:0;background:linear-gradient(135deg,#FFD700,#d9b400);color:#1a1407;font-weight:600}' +
        '.boomcst .ok:hover{transform:translateY(-1px)}' +
        '.boomcst .no{border:1px solid rgba(255,255,255,.16);background:none;color:rgba(255,255,255,.55)}' +
        '.boomcst .no:hover{color:#fff}' +
        '@media(max-width:879px){.boomcst{left:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px))}}' +
        '@media(prefers-reduced-motion:reduce){.boomcst{transition:none}}';
      document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.className = 'boomcst'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Cookie preferences');
    el.innerHTML =
      '<div class="e">Privacy</div>' +
      '<p>One analytics cookie helps us make BOOM better. No ads following you, no data resale — <a href="/privacy">how we handle data</a>.</p>' +
      '<div class="r"><button class="no" type="button">Essential only</button><button class="ok" type="button">Accept</button></div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      el.style.opacity = '1'; el.style.transform = 'none';
    }); });
    el.querySelector('.ok').addEventListener('click', function () { save('all'); grant(); close(); });
    el.querySelector('.no').addEventListener('click', function () { save('min'); close(); });
  }

  if (!s) {
    (document.readyState === 'loading')
      ? document.addEventListener('DOMContentLoaded', function () { setTimeout(open, 700); }, { once: true })
      : setTimeout(open, 700);
  }
  window.boomConsent = { open: function () { try { localStorage.removeItem(KEY); } catch (e) {} open(); } };
})();
