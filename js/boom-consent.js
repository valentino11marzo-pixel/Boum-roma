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
  function deny() {
    gtagSafe('consent', 'update', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    try { document.dispatchEvent(new CustomEvent('boom-consent-denied')); } catch (e) {}
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
        '@media(prefers-reduced-motion:reduce){.boomcst{transition:none}}' +
        // La variante compatta, su richiesta della pagina (<html
        // data-consent="compact">): sulle pagine-strumento senza barra di
        // pagamento il riquadro intero copriva i campi a metà schermo. Qui
        // sta in fondo, basso, e lascia libero lo strumento. Stessi testi,
        // stessi due tasti: la scelta resta chiara.
        '@media(max-width:879px){html[data-consent=compact] .boomcst{left:8px;right:8px;width:auto;bottom:calc(8px + env(safe-area-inset-bottom,0px));padding:10px 12px;border-radius:14px}' +
        'html[data-consent=compact] .boomcst .e{display:none}' +
        'html[data-consent=compact] .boomcst p{font-size:12px;margin:0 0 8px;line-height:1.45}' +
        'html[data-consent=compact] .boomcst button{padding:8px 14px}}';
      document.head.appendChild(st);
    }
    // The banner speaks the page's language. It reads <html lang> rather than
    // the browser's, because the page has already decided what language the
    // reader is being served — an English cookie plate on the French /reunion
    // page is the one element that gives away that it is a translation.
    // L'italiano e' impersonale di proposito: le pagine italiane danno del
    // "tu" (/canone) o del "Lei" (/owners), e il banner non deve scegliere.
    var lang = String(document.documentElement.lang || 'en').toLowerCase().slice(0, 2);
    var T = lang === 'fr'
      ? { e: 'Confidentialité',
          p: 'Un cookie de mesure d\'audience nous aide à améliorer BOOM. Aucune publicité qui vous suit, aucune revente de données — <a href="/privacy">comment nous traitons vos données</a>.',
          no: 'Essentiels uniquement', ok: 'Accepter', aria: 'Préférences cookies' }
      : lang === 'it'
      ? { e: 'Privacy',
          p: 'Un cookie di misurazione ci aiuta a migliorare BOOM. Nessuna pubblicità che insegue, nessuna vendita di dati — <a href="/privacy">come trattiamo i dati</a>.',
          no: 'Solo essenziali', ok: 'Accetta', aria: 'Preferenze cookie' }
      : { e: 'Privacy',
          p: 'One analytics cookie helps us make BOOM better. No ads following you, no data resale — <a href="/privacy">how we handle data</a>.',
          no: 'Essential only', ok: 'Accept', aria: 'Cookie preferences' };

    el = document.createElement('div');
    el.className = 'boomcst'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', T.aria);
    el.innerHTML =
      '<div class="e">' + T.e + '</div>' +
      '<p>' + T.p + '</p>' +
      '<div class="r"><button class="no" type="button">' + T.no + '</button><button class="ok" type="button">' + T.ok + '</button></div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      el.style.opacity = '1'; el.style.transform = 'none';
    }); });
    el.querySelector('.ok').addEventListener('click', function () { save('all'); grant(); close(); });
    el.querySelector('.no').addEventListener('click', function () { save('min'); deny(); close(); });
  }

  // WHEN the plate may open. Two guards, both about not stepping on the
  // reader's first move:
  //   - a native <dialog open> on the page (the city desks' till) wins: a
  //     consent plate sliding in under a modal is two things asking at once.
  //     We wait for the dialog to close, then 400 ms, then open;
  //   - <body data-consent-late> (the city desks) asks for the plate AFTER
  //     the reader's first move — a wheel turn, a finger scroll, a tap or a
  //     key — plus 600 ms, so the diagnostic in the hero is read before
  //     anything else appears. The scroll EVENT is not a signal: the page
  //     scrolls itself to land the pass after the first tap, and that is not
  //     the reader moving on. 8 s is the ceiling: a reader who never moves
  //     still gets the plate.
  //   - and once armed, the plate still waits while the reader is AT WORK
  //     in the hero: the unanswered Check-in on the screen, or the ticket
  //     on the screen (on a 375px phone the plate would sit on the options
  //     or on the ticket's own door). It checks again every 1.2 s and shows
  //     at the latest 45 s after it was armed — nothing is stored before
  //     the choice, so the wait costs the reader nothing.
  // Pages without the attribute keep the 700 ms of before.
  function modalOpen() { try { return !!document.querySelector('dialog[open]'); } catch (e) { return false; } }
  function onScreen(el) {
    try {
      if (!el) return false;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
    } catch (e) { return false; }
  }
  function atWork() {
    try {
      var ck = document.getElementById('checkin'), pass = document.getElementById('pass');
      if (ck && onScreen(ck) && !ck.querySelector('input:checked')) return true;
      if (pass && pass.getAttribute('data-state') !== 'blank' && onScreen(pass)) return true;
      return false;
    } catch (e) { return false; }
  }
  var WAIT_MAX = 45000;
  function when(fn) {
    var fired = false, late = false, armedAt = 0;
    try { late = document.body && document.body.hasAttribute('data-consent-late'); } catch (e) {}
    function go() {
      if (fired) return;
      if (modalOpen()) { setTimeout(go, 400); return; }
      if (late && atWork() && Date.now() - armedAt < WAIT_MAX) { setTimeout(go, 1200); return; }
      fired = true; fn();
    }
    if (!late) { setTimeout(go, 700); return; }
    var armed = false;
    // a tap INSIDE the diagnostic, the pass or the door is the reader at
    // work, not a move on: it does not arm the plate (a scroll does)
    var inside = function (ev) {
      try {
        if (!ev || ev.type === 'wheel' || ev.type === 'touchmove') return false;
        var t = ev.target && ev.target.closest && ev.target.closest('#checkin, #pass, #contact, dialog');
        return !!t;
      } catch (e) { return false; }
    };
    var EVS = ['wheel', 'touchmove', 'pointerdown', 'keydown'];
    function arm(ev) {
      if (armed) return;
      if (inside(ev)) return;
      armed = true; armedAt = Date.now();
      EVS.forEach(function (ev) {
        try { window.removeEventListener(ev, arm, { passive: true }); } catch (e) {}
      });
      setTimeout(go, 600);
    }
    EVS.forEach(function (ev) {
      try { window.addEventListener(ev, arm, { passive: true }); } catch (e) {}
    });
    setTimeout(arm, 8000);
  }

  if (!s) {
    (document.readyState === 'loading')
      ? document.addEventListener('DOMContentLoaded', function () { when(open); }, { once: true })
      : when(open);
  }
  window.boomConsent = { open: function () { try { localStorage.removeItem(KEY); } catch (e) {} open(); } };
})();
