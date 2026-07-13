/*
 * boom-pixel.js — Meta (Facebook/Instagram) Pixel, drop-in.
 *
 * WHY: boom-track.js already covers GA4. The paid channel with the best ROI for
 * Rome expat/student rentals is Instagram/Facebook — which needs the Meta Pixel
 * for retargeting + lookalike audiences + ad-conversion optimisation. This module
 * adds that layer without touching boom-track.
 *
 * ACTIVATION (one step): set your Pixel ID below (or define window.BOOM_PIXEL_ID
 * before this script loads). Until then the module is a safe no-op — nothing
 * fires, nothing breaks.
 *
 *   <script>window.BOOM_PIXEL_ID='1234567890';</script>
 *   <script defer src="/js/boom-pixel.js"></script>
 *
 * Events mapped (Meta standard events, so they slot straight into Ads Manager):
 *   PageView          — every page
 *   Contact           — WhatsApp / tel / mailto click  (the primary CTA)
 *   Lead              — any <form> submit
 *   InitiateCheckout  — click toward /book /booking or a Stripe link
 * Manual: window.boomPixel('AddToWishlist', { ... })
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  // Paste your Meta Pixel ID here, or set window.BOOM_PIXEL_ID before this loads.
  var PIXEL_ID = window.BOOM_PIXEL_ID || '';
  if (!PIXEL_ID) return; // no ID → no-op, never breaks the page.
  // GDPR: the pixel only ever runs with full consent (see js/boom-consent.js).
  try { if ((localStorage.getItem('boom:consent') || '').indexOf('all') !== 0) return; } catch (e) { return; }
  if (window.__boomPixel) return;
  window.__boomPixel = true;

  // ── Standard Meta Pixel bootstrap ───────────────────────────────────────────
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');

  function px(event, params) {
    try { if (window.fbq) window.fbq('track', event, params || {}); } catch (e) {}
  }
  window.boomPixel = px;

  // ── Auto-map the conversion actions (mirrors boom-track's GA4 events) ────────
  function nearestAnchor(node) {
    while (node && node !== document) {
      if (node.tagName === 'A' && node.getAttribute('href')) return node;
      node = node.parentNode;
    }
    return null;
  }

  document.addEventListener('click', function (ev) {
    var a = nearestAnchor(ev.target);
    if (!a) return;
    var href = (a.getAttribute('href') || '').toLowerCase();

    if (href.indexOf('wa.me') !== -1 || href.indexOf('api.whatsapp.com') !== -1 ||
        href.indexOf('whatsapp://') !== -1 || href.indexOf('tel:') === 0 ||
        href.indexOf('mailto:') === 0) {
      px('Contact', { method: href.indexOf('tel:') === 0 ? 'phone'
                            : href.indexOf('mailto:') === 0 ? 'email' : 'whatsapp' });
      return;
    }
    if (href.indexOf('/book') !== -1 || href.indexOf('booking') !== -1 ||
        href.indexOf('stripe.com') !== -1 || href.indexOf('checkout') !== -1) {
      px('InitiateCheckout');
    }
  }, true);

  document.addEventListener('submit', function () { px('Lead'); }, true);
})();
