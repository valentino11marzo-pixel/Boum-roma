/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Conversion tracking + attribution + WhatsApp enhancer
   js/boom-track.js — drop-in, site-wide. Include near </body>:
       <script defer src="/js/boom-track.js"></script>

   - First-touch source attribution (UTM → referrer → direct), persisted.
   - Stamps the source into every <form> (web3forms emails carry it) and into
     the WhatsApp prefill ("… (ref: instagram)") so every lead self-reports.
   - GA4 events: whatsapp_click · begin_checkout · cta_intent · generate_lead
     (all carry source_channel) + context-aware bilingual WhatsApp prefill.
   - Defensive: no-ops if gtag absent; never blocks navigation.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__boomTrack) return;
  window.__boomTrack = true;

  var isIt = (document.documentElement.lang || '').toLowerCase().indexOf('it') === 0;

  // ── First-touch source attribution ──────────────────────────────────────
  function detectSource() {
    try {
      var KEY = 'boom_src';
      var p = new URLSearchParams(location.search);
      var us = p.get('utm_source');
      if (us) {
        var s = us.toLowerCase()
          + (p.get('utm_medium') ? '/' + p.get('utm_medium').toLowerCase() : '')
          + (p.get('utm_campaign') ? '/' + p.get('utm_campaign').toLowerCase() : '');
        try { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, s); } catch (e) {}
        return s;
      }
      var stored; try { stored = localStorage.getItem(KEY); } catch (e) {}
      if (stored) return stored;
      var r = document.referrer || '', host = '';
      try { host = new URL(r).hostname.replace(/^www\./, ''); } catch (e) {}
      var label =
        !host ? 'direct' :
        host.indexOf('boomrome') > -1 ? 'direct' :
        /(^|\.)google\./.test(host) ? 'google' :
        /(bing|duckduckgo|ecosia|yahoo)/.test(host) ? host.split('.')[0] :
        /instagram\.com/.test(host) ? 'instagram' :
        /(facebook\.com|^fb\.|l\.facebook)/.test(host) ? 'facebook' :
        /(t\.co|twitter\.com|x\.com)/.test(host) ? 'x' :
        /reddit\.com/.test(host) ? 'reddit' :
        /linkedin\.com|lnkd\.in/.test(host) ? 'linkedin' :
        /(whatsapp|wa\.me)/.test(host) ? 'whatsapp' :
        'ref:' + host;
      try { if (label !== 'direct') localStorage.setItem(KEY, label); } catch (e) {}
      return label;
    } catch (e) { return 'direct'; }
  }
  var SRC = detectSource();

  function ev(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }
  function ctx(extra) {
    var o = { page_path: location.pathname, page_title: (document.title || '').slice(0, 90), source_channel: SRC };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  // ── Stamp the source into every form (web3forms/email leads carry it) ────
  [].forEach.call(document.querySelectorAll('form'), function (f) {
    if (f.querySelector('input[name="boom_source"]')) return;
    var add = function (n, v) { var i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; f.appendChild(i); };
    add('boom_source', SRC);
    add('boom_landing', location.pathname);
  });

  // ── Click tracking + WhatsApp prefill (capture phase, before navigation) ──
  document.addEventListener('click', function (e) {
    var a = (e.target && e.target.closest) ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';

    if (/(?:wa\.me|api\.whatsapp\.com)\//.test(href)) {
      if (!/[?&]text=/.test(href)) {
        var subject = (document.title || '').replace(/\s*[|–—].*$/, '').trim();
        var msg = (isIt ? 'Ciao BOOM! Sono interessato/a' : 'Hi BOOM! I am interested') + (subject ? ' — ' + subject : '');
        if (SRC && SRC !== 'direct') msg += ' (ref: ' + SRC + ')';
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
