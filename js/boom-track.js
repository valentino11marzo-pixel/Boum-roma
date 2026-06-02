/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Conversion tracking + WhatsApp enhancer  —  js/boom-track.js
   Drop-in, site-wide. Include once near </body>:
       <script defer src="/js/boom-track.js"></script>

   - Tracks the things that matter (GA4 events via gtag), with zero config:
       whatsapp_click · begin_checkout (Stripe) · cta_intent · generate_lead
   - Pre-fills every WhatsApp CTA with a context-aware message (higher-quality
     leads) when the link has no text yet. Bilingual (it/en) from <html lang>.
   - Fully defensive: no-ops if gtag is absent; never blocks navigation.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__boomTrack) return;
  window.__boomTrack = true;

  var isIt = (document.documentElement.lang || '').toLowerCase().indexOf('it') === 0;

  function ev(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }
  function ctx(extra) {
    var o = { page_path: location.pathname, page_title: (document.title || '').slice(0, 90) };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  // ── Click tracking + WhatsApp prefill (capture phase, before navigation) ──
  document.addEventListener('click', function (e) {
    var a = (e.target && e.target.closest) ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';

    if (/(?:wa\.me|api\.whatsapp\.com)\//.test(href)) {
      if (!/[?&]text=/.test(href)) {
        var subject = (document.title || '').replace(/\s*[|–—].*$/, '').trim();
        var msg = (isIt ? 'Ciao BOOM! Sono interessato/a' : 'Hi BOOM! I am interested')
                + (subject ? (isIt ? ' — ' : ' — ') + subject : '');
        a.setAttribute('href', href + (href.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(msg));
      }
      ev('whatsapp_click', ctx({ link_text: (a.textContent || '').trim().slice(0, 60) }));
      return;
    }
    if (/buy\.stripe\.com/.test(href)) { ev('begin_checkout', ctx({ link_url: href })); return; }
    if (/#(form|inquiryCard|booking|services|pricing|contact)\b/.test(href)) { ev('cta_intent', ctx({ target: href })); }
  }, true);

  // ── Lead form submissions ──
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    ev('generate_lead', ctx({ form_id: f.id || f.getAttribute('name') || 'form' }));
  }, true);
})();
