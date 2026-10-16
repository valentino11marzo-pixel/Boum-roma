/* BOOM · attribution, conversion tracking and anonymous behavior intelligence.
 * Collection starts only after explicit analytics consent and never records
 * form values, query strings, IPs or fine-grained pointer movement.
 *
 * Attribution (ottobre 2026): the source is classified per AI engine
 * (classifySource, shared verbatim with js/behavior-engine.js). After consent
 * the FIRST non-internal touch is kept in localStorage 'boom:source' and in
 * the first-party cookie 'boom_attr' (90 days) that the lead endpoints read
 * (api/_attribution.js). Nothing is written before consent; denial or a
 * withdrawn consent deletes the cookie and the stored touches.
 * The first touch lives 90 days from when it was recorded (`at`), and the
 * cookie expires with it: reading it never restarts the clock.
 */
(function () {
  'use strict';
  if (window.__boomTrack) return;
  window.__boomTrack = true;

  var CONSENT_KEY = 'boom:consent';
  // 90 giorni dal primo contatto, non dall'ultima visita: è ciò che dice la
  // privacy («boom_attr, for 90 days»). Prima ogni pagina riscriveva il
  // cookie con Max-Age pieno e il contatto in localStorage non scadeva mai:
  // una visita da ChatGPT di dieci mesi prima firmava ancora il lead di oggi.
  var TOUCH_MS = 90 * 864e5;
  // I contatti salvati prima di questa regola non hanno `at`. Non sono più
  // vecchi del tracker che li scriveva (7/10/2026) né del consenso che li ha
  // permessi: il più recente dei due è un limite sicuro — scadono prima, mai
  // dopo, i loro 90 giorni.
  var LEGACY_FLOOR = Date.UTC(2026, 9, 7);
  var isIt = (document.documentElement.lang || '').toLowerCase().indexOf('it') === 0;
  var started = false, allowed = false;

  // Stessa scadenza di js/boom-consent.js (365 giorni): alcune pagine caricano
  // questo file PRIMA del modulo del consenso, e un 'all:<vecchio>' non deve
  // valere nemmeno per quell'istante (cookie e campo nascosto già scritti).
  function hasConsent() {
    try {
      var m = /^all:(\d+)$/.exec(localStorage.getItem(CONSENT_KEY) || '');
      return !!m && Date.now() - (+m[1]) <= 365 * 864e5 && navigator.doNotTrack !== '1';
    } catch (e) { return false; }
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
  /* CLASSIFY:BEGIN */
  // Una copia sola, incollata identica in js/boom-track.js e in
  // js/behavior-engine.js (tests/attribution la confronta byte per byte).
  // L'AI si guarda PRIMA di Google: gemini.google.com è un assistente, non
  // una ricerca.
  var AI_SRC = [['chatgpt', /^(?:chatgpt(?:\.com)?|chat\.openai\.com|openai(?:\.com)?)$/], ['perplexity', /^perplexity(?:\.ai)?$/], ['gemini', /^(?:gemini(?:\.google\.com)?|bard\.google\.com)$/], ['copilot', /^(?:copilot(?:\.microsoft\.com)?|copilot\.cloud\.microsoft)$/], ['claude', /^claude(?:\.ai)?$/], ['you', /^you\.com$/], ['deepseek', /^(?:chat\.)?deepseek\.com$/], ['meta_ai', /^meta\.ai$/], ['mistral', /^chat\.mistral\.ai$/], ['grok', /^grok\.com$/]];
  function aiEngine(v) {
    v = String(v == null ? '' : v).toLowerCase().trim().replace(/^www\./, '');
    for (var i = 0; i < AI_SRC.length; i++) if (AI_SRC[i][1].test(v)) return AI_SRC[i][0];
    return '';
  }
  function classifySource(utm, host) {
    utm = String(utm == null ? '' : utm).trim();
    host = String(host == null ? '' : host).toLowerCase().trim().replace(/^www\./, '');
    var engine = aiEngine(utm) || aiEngine(host);
    if (engine) return { channel: 'ai_assistant', engine: engine };
    if (utm) return { channel: utm, engine: '' };
    if (!host) return { channel: 'direct', engine: '' };
    if (/(^|\.)boomrome\.com$/.test(host)) return { channel: 'internal', engine: '' };
    if (/(^|\.)google\./.test(host)) return { channel: 'google', engine: '' };
    if (/(^|\.)(?:bing|duckduckgo|ecosia|yahoo|brave|qwant|kagi)\./.test(host)) return { channel: 'organic_search', engine: '' };
    if (/(^|\.)(?:instagram|facebook|linkedin|reddit|twitter)\./.test(host) || /(^|\.)(?:x\.com|t\.co|lnkd\.in)$/.test(host)) return { channel: 'social', engine: '' };
    return { channel: 'referral', engine: '' };
  }
  /* CLASSIFY:END */
  function knownEngine(v) {
    for (var i = 0; i < AI_SRC.length; i++) if (AI_SRC[i][0] === v) return v;
    return aiEngine(v);
  }
  function refToken(src) { return src.engine ? 'ai:' + src.engine : src.channel; }
  var SELF_HOST = String(location.hostname || '').toLowerCase().replace(/^www\./, '');
  // Il ritorno da un pagamento (Stripe) o da un accesso (Firebase Auth) è un
  // passaggio del NOSTRO percorso, non un sito che ci manda visite: senza
  // questa regola diventava il primo contatto per 90 giorni («referral ·
  // /thank-you»). Fuori dal blocco CLASSIFY, che resta identico al motore.
  var HOP_HOST = /(^|\.)(?:stripe\.com|firebaseapp\.com|web\.app)$/;

  // Un primo contatto salvato è valido solo se dice da DOVE si è arrivati:
  // 'internal' è assenza di informazione, non una fonte, e non deve mai
  // congelarsi come primo contatto; un 'referral' da Stripe salvato dal
  // tracker di prima è la stessa assenza. Quelli salvati prima della
  // classificazione per motore ('chatgpt.com' come utm, Gemini contato
  // 'google') si riconducono qui all'assistente giusto.
  function consentAt() {
    try { var m = /^all:(\d+)$/.exec(localStorage.getItem(CONSENT_KEY) || ''); return m ? +m[1] : 0; }
    catch (e) { return 0; }
  }
  function readTouch(k) {
    try {
      var v = JSON.parse(localStorage.getItem(k) || 'null');
      if (!v || typeof v !== 'object' || !v.channel || v.channel === 'internal') return null;
      if (v.channel === 'referral' && HOP_HOST.test(String(v.referrerHost || '').toLowerCase())) return null;
      var now = Date.now(), at = Number(v.at) || 0, legacy = !(at > 0);
      if (legacy) at = Math.max(consentAt(), LEGACY_FLOOR);
      at = Math.min(at, now);
      // Scaduto: si toglie, e il contatto di adesso potrà prenderne il posto.
      if (now - at > TOUCH_MS) { try { localStorage.removeItem(k); } catch (e) {} return null; }
      var e = knownEngine(clean(v.engine, 24)) || aiEngine(v.channel) || aiEngine(v.referrerHost);
      var t = { channel: e ? 'ai_assistant' : clean(v.channel, 40), engine: e,
        medium: clean(v.medium, 40), campaign: clean(v.campaign, 60),
        landing: cleanPath(v.landing || '/'), referrerHost: clean(v.referrerHost, 100), at: at };
      if (legacy) writeTouch(k, t);   // la data stimata si scrive una volta: non riparte a ogni lettura
      return t;
    } catch (e) { return null; }
  }
  function writeTouch(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // Chiamata SOLO da begin(), cioè dopo il consenso: prima non si scrive nulla.
  function detectSource() {
    var p = new URLSearchParams(location.search), utm = clean(p.get('utm_source'), 40);
    var medium = clean(p.get('utm_medium'), 40), campaign = clean(p.get('utm_campaign'), 60);
    var host = '';
    try { host = new URL(document.referrer || '').hostname.toLowerCase().replace(/^www\./, ''); } catch (e) {}
    var c = classifySource(utm, host);
    // Lo stesso sito su un altro dominio (anteprima, prova locale) è
    // navigazione interna, non un sito che ci manda visite.
    if (!utm && host && host === SELF_HOST) c = { channel: 'internal', engine: '' };
    // ...e così il ritorno da Stripe o dal login (HOP_HOST, qui sopra).
    if (!utm && HOP_HOST.test(host)) c = { channel: 'internal', engine: '' };
    var touch = { channel: c.channel, engine: c.engine, medium: medium, campaign: campaign,
      landing: cleanPath(location.href), referrerHost: host.slice(0, 100), at: Date.now() };
    if (touch.channel !== 'internal') writeTouch('boom:last', touch);
    else readTouch('boom:last');   // un ultimo contatto oltre i 90 giorni si toglie
    var first = readTouch('boom:source');
    if (first) return first;
    if (touch.channel !== 'internal') writeTouch('boom:source', touch);
    return touch;
  }

  // Il consenso negato o ritirato toglie tutto ciò che l'attribuzione aveva
  // lasciato: il cookie letto dalle porte dei lead e i contatti salvati.
  var attrValue = '', stamped = [], reattribute = null;
  function dropAttribution() {
    attrValue = '';
    stamped.forEach(function (i) { try { if (i.name === 'boom_source') i.value = ''; } catch (e) {} });
    // I link WhatsApp già decorati col «(ref: …)» tornano com'erano: senza,
    // dopo il diniego la fonte viaggiava ancora dentro il messaggio e
    // api/homie/_lead.js la scriveva sul lead.
    try {
      [].forEach.call(document.querySelectorAll('a[data-boom-ref]'), function (a) {
        var o = a.getAttribute('data-boom-orig');
        if (o != null) a.setAttribute('href', o);
        a.removeAttribute('data-boom-ref');
      });
    } catch (e) {}
    try { if (/(?:^|;\s*)boom_attr=/.test(document.cookie)) document.cookie = 'boom_attr=; Max-Age=0; Path=/'; } catch (e) {}
    try { localStorage.removeItem('boom:source'); localStorage.removeItem('boom:last'); localStorage.removeItem('boom_src'); } catch (e) {}
    try { sessionStorage.removeItem('boom:sid'); } catch (e) {}
  }
  function hasRef(href) {
    var t = String(href || '');
    try { t = decodeURIComponent(t.replace(/\+/g, ' ')); } catch (e) {}
    return /\(ref: /.test(t);
  }
  function ev(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }

  function begin() {
    if (started || !hasConsent()) return;
    started = true; allowed = true;
    var source = detectSource(), pagePath = cleanPath(location.href), service = inferService(pagePath);
    // L'attribuzione che viaggia coi lead: «ai:gemini · /faq», «google · /».
    // Un primo contatto sconosciuto (solo navigazione interna) resta vuoto:
    // meglio nessuna fonte che una fonte inventata.
    var attr = '';
    function attribute() {
      // Il cookie scade quando scade il primo contatto: Max-Age è ciò che
      // gli RESTA, mai di nuovo 90 giorni pieni a ogni pagina vista.
      var left = Math.floor(((Number(source.at) || Date.now()) + TOUCH_MS - Date.now()) / 1000);
      attr = source.channel === 'internal' || left <= 0 ? '' : clean(refToken(source) + (source.landing ? ' · ' + source.landing : ''), 120);
      attrValue = attr;
      if (attr) {
        try {
          // un contatto appena nato: 90 giorni pieni; uno già salvato: ciò che gli resta
          document.cookie = left >= 7776000
            ? 'boom_attr=' + encodeURIComponent(attr) + '; Max-Age=7776000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '')
            : 'boom_attr=' + encodeURIComponent(attr) + '; Max-Age=' + left + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
        } catch (e) {}
      }
      stamped.forEach(function (i) { if (i.name === 'boom_source') i.value = attr; });
    }
    attribute();
    // Negato e poi riaccettato sulla stessa pagina (dal link «cookie» del
    // piede): si ricomincia dal contatto di adesso.
    reattribute = function () { source = detectSource(); attribute(); };
    window.boomAttribution = function () { return allowed && hasConsent() ? attrValue : ''; };
    var sid = sessionId(), pvid = uid(), began = Date.now(), active = 0, scrollMax = 0;
    var exitType = 'close_or_background', lastSection = '', interactions = [], sectionMap = {}, visible = {};
    var sentSignature = '';

    function context(extra) {
      var o = { page_path: pagePath, page_title: clean(document.title, 90), source_channel: refToken(source), service: service };
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
      [['boom_source', attr], ['boom_landing', source.landing], ['boom_service', service]].forEach(function (x) {
        var i = document.createElement('input'); i.type = 'hidden'; i.name = x[0]; i.value = x[1]; f.appendChild(i);
        stamped.push(i);
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
          'concordato-pack': 'property_management', 'reserve': 'reservation'
        };
        if (paid.get('session_id')) {
          // ?reserved=1 è il deposito di blocco della casa (api/reserve-checkout):
          // non è un Property Finding.
          var paidKind = paid.get('service') || (paid.get('reserved') ? 'reserve' : 'property-finding');
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
        // La fonte viaggia DENTRO il messaggio: api/homie/_lead.js la legge
        // dal «(ref: …)» e la mette sul lead WhatsApp. Una volta sola.
        var ref = allowed && source.channel && source.channel !== 'direct' && source.channel !== 'internal' ? refToken(source) : '';
        if (!/[?&]text=/.test(href)) {
          var subject = (document.title || '').replace(/\s*[|–—].*$/, '').trim();
          var msg = (isIt ? 'Ciao BOOM! Sono interessato/a' : 'Hi BOOM! I am interested') + (subject ? ' — ' + subject : '');
          if (ref) msg += ' (ref: ' + ref + ')';
          // l'originale si ricorda PRIMA di riscrivere: il diniego lo rimette
          if (ref && !a.hasAttribute('data-boom-orig')) a.setAttribute('data-boom-orig', href);
          a.setAttribute('href', href + (href.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(msg));
          if (ref) a.setAttribute('data-boom-ref', '1');
        } else if (ref && !a.hasAttribute('data-boom-ref') && !hasRef(href)) {
          if (!a.hasAttribute('data-boom-orig')) a.setAttribute('data-boom-orig', href);
          a.setAttribute('href', href.replace(/([?&]text=)([^&#]*)/, function (m, k, v) {
            return k + v + encodeURIComponent('\n\n(ref: ' + ref + ')');
          }));
          a.setAttribute('data-boom-ref', '1');
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
      // Il tentativo resta nel percorso di /behavior (prima parte, col
      // consenso): senza, la scheda risulterebbe una pagina che non converte.
      push(kind, label, pagePath, currentSection(f));
      // Un modulo che dichiara data-analytics-manual (l'APPLY della scheda)
      // manda generate_lead a GA4 da sé, SOLO quando il server ha confermato:
      // qui sarebbe un secondo lead, contato anche quando l'invio fallisce.
      if (f.hasAttribute('data-analytics-manual')) return;
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

  document.addEventListener('boom-consent-denied', function () { allowed = false; dropAttribution(); });
  if (hasConsent()) begin();
  else {
    // Nessun consenso (mai dato, scaduto, ritirato o Do Not Track): niente
    // cookie di attribuzione e nessun contatto salvato da una volta prima.
    dropAttribution();
    document.addEventListener('boom-consent-granted', begin, { once: true });
  }
  document.addEventListener('boom-consent-granted', function () {
    if (!started || allowed || !hasConsent()) return;
    allowed = true;
    if (reattribute) reattribute();
  });
})();
