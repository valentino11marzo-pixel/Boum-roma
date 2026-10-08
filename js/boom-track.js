/* BOOM · attribution, conversion tracking and anonymous behavior intelligence.
 * Collection starts only after explicit analytics consent and never records
 * form values, query strings, IPs or fine-grained pointer movement.
 */
(function () {
  'use strict';
  if (window.__boomTrack) return;
  window.__boomTrack = true;

  var CONSENT_KEY = 'boom:consent';
  var isIt = (document.documentElement.lang || '').toLowerCase().indexOf('it') === 0;
  var started = false, allowed = false;

  function hasConsent() {
    try { return /^all:\d+$/.test(localStorage.getItem(CONSENT_KEY) || '') && navigator.doNotTrack !== '1'; }
    catch (e) { return false; }
  }
  function clean(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 80); }
  function cleanPath(v) {
    try { return new URL(v || location.href, location.href).pathname.slice(0, 180) || '/'; }
    catch (e) { return '/'; }
  }
  function safeTarget(v) {
    v = String(v || '');
    if (v.charAt(0) === '#') return 'anchor:' + clean(v.slice(1), 72);
    if (/^mailto:/i.test(v)) return 'mailto';
    if (/^tel:/i.test(v)) return 'tel';
    try {
      var u = new URL(v, location.href);
      if (/(?:wa\.me|api\.whatsapp\.com)$/.test(u.hostname)) return 'whatsapp';
      if (/buy\.stripe\.com$/.test(u.hostname)) return 'stripe';
      return u.origin === location.origin ? u.pathname : 'external:' + u.hostname.replace(/^www\./, '').slice(0, 100);
    } catch (e) { return '/'; }
  }
  function uid() {
    try {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    } catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 16); }
  }
  function sessionId() {
    try { var v = sessionStorage.getItem('boom:sid'); if (v) return v; v = uid(); sessionStorage.setItem('boom:sid', v); return v; }
    catch (e) { return uid(); }
  }
  function inferService(path) {
    if (/property-finding/.test(path)) return 'property_finding';
    if (/deal-assistance|contract-check|blog-contract-types/.test(path)) return 'deal_assistance';
    if (/virtual-viewing|viewing/.test(path)) return 'virtual_viewing';
    if (/deposit/.test(path)) return 'deposit_recovery';
    if (/apartments|listing/.test(path)) return 'apartments';
    if (/owners|owner/.test(path)) return 'property_management';
    if (/moving-to-rome|remote-move|executive|reunion/.test(path)) return 'relocation';
    if (/blog|faq|canone|welcome-to-rome/.test(path)) return 'editorial';
    return path === '/' ? 'home' : 'other';
  }
  function detectSource() {
    var p = new URLSearchParams(location.search), utm = clean(p.get('utm_source'), 40);
    var medium = clean(p.get('utm_medium'), 40), campaign = clean(p.get('utm_campaign'), 60);
    var host = '';
    try { host = new URL(document.referrer || '').hostname.replace(/^www\./, ''); } catch (e) {}
    var channel = utm || (!host ? 'direct' :
      host.indexOf('boomrome') > -1 ? 'internal' :
      /(^|\.)google\./.test(host) ? 'google' :
      /(bing|duckduckgo|ecosia|yahoo)/.test(host) ? 'organic_search' :
      /(chatgpt|perplexity|claude|copilot)/.test(host) ? 'ai_assistant' :
      /(instagram|facebook|linkedin|reddit|twitter|x\.com)/.test(host) ? 'social' : 'referral');
    var source = { channel: channel, medium: medium, campaign: campaign,
      landing: cleanPath(location.href), referrerHost: host.slice(0, 100) };
    try {
      var old = JSON.parse(localStorage.getItem('boom:source') || 'null');
      if (old && old.channel) return old;
      localStorage.setItem('boom:source', JSON.stringify(source));
    } catch (e) {}
    return source;
  }
  function ev(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }

  function begin() {
    if (started || !hasConsent()) return;
    started = true; allowed = true;
    var source = detectSource(), pagePath = cleanPath(location.href), service = inferService(pagePath);
    var sid = sessionId(), pvid = uid(), began = Date.now(), active = 0, scrollMax = 0;
    var exitType = 'close_or_background', lastSection = '', interactions = [], sectionMap = {}, visible = {};
    var sentSignature = '';

    function context(extra) {
      var o = { page_path: pagePath, page_title: clean(document.title, 90), source_channel: source.channel, service: service };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      return o;
    }
    window.boomBehaviorContext = context;
    // Alcune pagine chiamano questo contratto pubblico dopo esiti asincroni
    // (per esempio visita richiesta/confermata). Non sovrascrivere gli
    // helper locali delle pagine che hanno già una tassonomia propria.
    if (typeof window.boomTrack !== 'function') {
      window.boomTrack = function (name, params) { ev(clean(name, 60), context(params || {})); };
    }

    [].forEach.call(document.querySelectorAll('form'), function (f) {
      if (f.querySelector('input[name="boom_source"]')) return;
      [['boom_source', source.channel], ['boom_landing', source.landing], ['boom_service', service]].forEach(function (x) {
        var i = document.createElement('input'); i.type = 'hidden'; i.name = x[0]; i.value = x[1]; f.appendChild(i);
      });
    });

    function sectionName(el, i) {
      var sectionId = clean(el.getAttribute('data-analytics-section') || el.id, 72);
      var h = el.querySelector && el.querySelector('h1,h2,h3');
      var label = clean(el.getAttribute('data-analytics-label') || (h && h.textContent) || sectionId || ('Section ' + (i + 1)), 90);
      if (!sectionId) sectionId = 'section_' + (i + 1);
      return { id: sectionId, label: label };
    }
    var candidates = [].slice.call(document.querySelectorAll('[data-analytics-section],main section,body>section,article>section,main>[id]'))
      .filter(function (el, i, a) { return a.indexOf(el) === i && el.getBoundingClientRect().height >= 80; }).slice(0, 30);
    candidates.forEach(function (el, i) {
      var meta = sectionName(el, i); el.__boomSection = meta;
      sectionMap[meta.id] = { id: meta.id, label: meta.label, viewedMs: 0, firstAt: null };
    });
    function stopVisible(now) {
      Object.keys(visible).forEach(function (sectionId) {
        sectionMap[sectionId].viewedMs += Math.max(0, now - visible[sectionId]); delete visible[sectionId];
      });
    }
    function resumeVisible(now) {
      if (document.hidden) return;
      candidates.forEach(function (el) {
        var m = el.__boomSection, r = el.getBoundingClientRect();
        var overlap = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
        if (m && r.height > 0 && overlap / r.height >= .4) {
          if (!visible[m.id]) visible[m.id] = now;
          if (sectionMap[m.id].firstAt == null) sectionMap[m.id].firstAt = Math.round((now - began) / 1000);
          lastSection = m.id;
        }
      });
    }
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var now = Date.now();
        entries.forEach(function (entry) {
          var m = entry.target.__boomSection; if (!m) return;
          if (entry.isIntersecting && entry.intersectionRatio >= .4) {
            if (!visible[m.id]) visible[m.id] = now;
            if (sectionMap[m.id].firstAt == null) sectionMap[m.id].firstAt = Math.round((now - began) / 1000);
            lastSection = m.id;
          } else if (visible[m.id]) {
            sectionMap[m.id].viewedMs += Math.max(0, now - visible[m.id]); delete visible[m.id];
          }
        });
      }, { threshold: [.4, .7] });
      candidates.forEach(function (el) { observer.observe(el); });
    }
    function currentSection(el) {
      var s = el && el.closest ? el.closest('[data-analytics-section],section,[id]') : null;
      return clean(s && s.__boomSection && s.__boomSection.id || lastSection, 72);
    }
    function push(kind, label, target, section) {
      interactions.push({ kind: kind, label: clean(label, 80) || 'Interaction', target: safeTarget(target),
        section: section || '', atSecond: Math.round((Date.now() - began) / 1000) });
      if (interactions.length > 32) interactions.shift();
    }
    // Stripe returns here only after a successful hosted checkout. The
    // session id proves the route but is deliberately never persisted.
    if (pagePath === '/thank-you' || pagePath === '/thank-you.html') {
      try {
        var paid = new URLSearchParams(location.search), known = {
          'virtual-viewing': 'virtual_viewing', 'deal-assistance': 'deal_assistance',
          'property-finding': 'property_finding', 'deposit-recovery': 'deposit_recovery',
          'contract-check-express': 'deal_assistance', 'remote-move-pack': 'relocation',
          'concordato-pack': 'property_management'
        };
        if (paid.get('session_id')) {
          var paidKind = paid.get('service') || 'property-finding';
          if (known[paidKind]) service = known[paidKind];
          push('conversion', 'Purchase completed', pagePath, 'thank_you');
        }
      } catch (e) {}
    }

    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href],button,[role="button"]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '', label = a.getAttribute('data-analytics-label') || a.getAttribute('aria-label') || a.textContent;
      var section = currentSection(a), declaredKind = clean(a.getAttribute('data-analytics-kind'), 24), kind = 'cta';
      if (/(?:wa\.me|api\.whatsapp\.com)\//.test(href)) {
        kind = 'whatsapp';
        if (!/[?&]text=/.test(href)) {
          var subject = (document.title || '').replace(/\s*[|–—].*$/, '').trim();
          var msg = (isIt ? 'Ciao BOOM! Sono interessato/a' : 'Hi BOOM! I am interested') + (subject ? ' — ' + subject : '');
          if (source.channel && source.channel !== 'direct') msg += ' (ref: ' + source.channel + ')';
          a.setAttribute('href', href + (href.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(msg));
        }
        ev('whatsapp_click', context({ link_text: clean(label, 60), cta_location: section }));
      } else if (/buy\.stripe\.com/.test(href)) {
        kind = 'checkout'; ev('begin_checkout', context({ cta_location: section }));
      } else if (href.charAt(0) === '#') kind = 'anchor';
      else if (href) {
        try {
          var u = new URL(href, location.href);
          if (u.origin === location.origin) { kind = 'internal'; exitType = 'navigate_internal'; }
          else { kind = 'external'; exitType = 'navigate_external'; }
        } catch (_) {}
      }
      if (/(book|buy|start|apply|reserve|contact|whatsapp|check|find|view|scopri|inizia|prenota|contatt)/i.test(clean(label, 80))) kind = kind === 'internal' ? 'cta' : kind;
      if (['cta', 'checkout', 'lead', 'conversion'].indexOf(declaredKind) >= 0) kind = declaredKind;
      push(kind, label, href, section);
    }, true);

    document.addEventListener('submit', function (e) {
      var f = e.target; if (!f || f.tagName !== 'FORM') return;
      var label = f.getAttribute('data-analytics-label') || f.id || f.getAttribute('name') || 'Form';
      var kind = f.getAttribute('data-analytics-kind') === 'checkout' ? 'checkout' : 'lead';
      push(kind, label, pagePath, currentSection(f));
      ev('generate_lead', context({ form_id: clean(label, 60), lead_type: clean(f.getAttribute('data-lead-type') || service, 60) }));
    }, true);

    window.addEventListener('boom-conversion', function (e) {
      var d = e.detail || {}; push('conversion', d.label || d.name || 'Conversion', pagePath, clean(d.section || lastSection, 72));
    });
    setInterval(function () { if (!document.hidden && document.hasFocus()) active += 1; }, 1000);
    function measureScroll() {
      var doc = document.documentElement, max = Math.max(1, doc.scrollHeight - innerHeight);
      scrollMax = Math.max(scrollMax, Math.min(100, Math.round((scrollY / max) * 100)));
    }
    addEventListener('scroll', measureScroll, { passive: true }); measureScroll();

    function snapshot(type) {
      if (!allowed || !hasConsent()) return;
      var now = Date.now(), activeSections = Object.keys(visible); stopVisible(now);
      var body = {
        schema: 1, consent: true, pageViewId: pvid, sessionId: sid,
        pagePath: pagePath, pageTitle: clean(document.title, 120), service: service,
        language: clean(document.documentElement.lang || navigator.language, 12),
        device: innerWidth < 680 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop',
        viewport: innerWidth + 'x' + innerHeight, source: source, startedAt: began,
        elapsedSeconds: Math.round((now - began) / 1000), activeSeconds: active,
        scrollMax: scrollMax, lastSection: lastSection, exitType: type || 'checkpoint',
        sections: Object.keys(sectionMap).map(function (sectionId) { return sectionMap[sectionId]; }).filter(function (x) { return x.firstAt != null; }),
        interactions: interactions
      };
      if (!document.hidden) activeSections.forEach(function (sectionId) { visible[sectionId] = now; });
      var json = JSON.stringify(body), sig = body.activeSeconds + ':' + body.scrollMax + ':' + interactions.length + ':' + body.sections.length + ':' + body.exitType;
      if (sig === sentSignature && body.exitType === 'checkpoint') return;
      sentSignature = sig;
      try {
        if (navigator.sendBeacon) navigator.sendBeacon('/api/analytics/collect', new Blob([json], { type: 'application/json' }));
        else fetch('/api/analytics/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true, credentials: 'same-origin' }).catch(function () {});
      } catch (e) {}
    }
    setTimeout(function () { snapshot('checkpoint'); }, 3500);
    setTimeout(function () { snapshot('checkpoint'); }, 30000);
    setTimeout(function () { snapshot('checkpoint'); }, 120000);
    addEventListener('pagehide', function () { snapshot(exitType); }, { capture: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) snapshot('close_or_background');
      else resumeVisible(Date.now());
    });
  }

  document.addEventListener('boom-consent-denied', function () { allowed = false; });
  if (hasConsent()) begin();
  else document.addEventListener('boom-consent-granted', begin, { once: true });
})();
