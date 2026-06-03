/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Concierge — 24/7 tenant-facing AI chat widget
   js/boom-concierge.js — drop-in, site-wide. Include near </body>:
       <script defer src="/js/boom-concierge.js"></script>

   - Self-injecting floating launcher + chat panel (dark + gold, on-brand).
   - Talks to POST /api/concierge (server pins model + system prompt).
   - Bilingual IT/EN: greeting + UI follow <html lang>; replies follow the user.
   - Conversation kept in memory only; nothing persisted, no PII collected.
   - Defensive: no-ops on error, never blocks the page, reduced-motion aware.
   - Fires GA4 events (concierge_open / concierge_message) if gtag is present.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__boomConcierge) return;
  window.__boomConcierge = true;

  // Don't load on the admin portal / signing flows — this is for public visitors.
  var path = (location.pathname || '').toLowerCase();
  if (/(portal|proppass|pass-delivery|admin|cockpit|seed|setup-firebase)/.test(path)) return;
  if (location.search.indexOf('sign=') > -1 || location.search.indexOf('pfs=') > -1) return;

  var isIt = (document.documentElement.lang || '').toLowerCase().indexOf('it') === 0;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var T = isIt ? {
    launch: 'Concierge',
    title: 'BOOM Concierge',
    subtitle: 'Assistenza affitti · 24/7',
    greeting: 'Ciao! 👋 Sono il Concierge di BOOM. Posso aiutarti a trovare casa a Roma, spiegarti i nostri servizi o come evitare le truffe. Cosa ti serve?',
    placeholder: 'Scrivi un messaggio…',
    send: 'Invia',
    error: 'Ops, qualcosa è andato storto. Riprova o scrivici su WhatsApp.',
    typing: 'Sto scrivendo…',
    chips: ['Come funziona?', 'Quanto costa?', 'Cerco casa a Roma', 'Come evito le truffe?'],
    disclaimer: 'Risposte generate dall’IA · per casi specifici ti mettiamo in contatto con una persona.'
  } : {
    launch: 'Concierge',
    title: 'BOOM Concierge',
    subtitle: 'Renting help · 24/7',
    greeting: 'Hi! 👋 I’m the BOOM Concierge. I can help you find an apartment in Rome, explain our services, or how to avoid scams. What do you need?',
    placeholder: 'Type a message…',
    send: 'Send',
    error: 'Oops, something went wrong. Try again or message us on WhatsApp.',
    typing: 'Typing…',
    chips: ['How does it work?', 'What does it cost?', 'I’m looking for a place', 'How do I avoid scams?'],
    disclaimer: 'AI-generated answers · for specific cases we connect you to a human.'
  };

  // ── styles ────────────────────────────────────────────────────────────────
  var GOLD = '#D4AF37';
  var css = ''
    + '.boomcc-root{position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:"Helvetica Neue",Helvetica,Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-weight:300;-webkit-font-smoothing:antialiased}'
    + '.boomcc-launch{display:flex;align-items:center;gap:9px;background:#08080A;color:#fff;border:1px solid rgba(212,175,55,0.45);border-radius:40px;padding:12px 18px 12px 14px;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,0.35);transition:transform .2s ease,box-shadow .2s ease;font-size:13px;letter-spacing:1px;text-transform:uppercase}'
    + '.boomcc-launch:hover{transform:translateY(-2px);box-shadow:0 14px 38px rgba(0,0,0,0.45)}'
    + '.boomcc-launch .boomcc-dot{width:9px;height:9px;border-radius:50%;background:' + GOLD + ';box-shadow:0 0 0 0 rgba(212,175,55,0.6)}'
    + (reduce ? '' : '.boomcc-launch .boomcc-dot{animation:boomccPulse 2.4s infinite}')
    + '@keyframes boomccPulse{0%{box-shadow:0 0 0 0 rgba(212,175,55,0.55)}70%{box-shadow:0 0 0 9px rgba(212,175,55,0)}100%{box-shadow:0 0 0 0 rgba(212,175,55,0)}}'
    + '.boomcc-panel{position:fixed;bottom:20px;right:20px;width:min(380px,calc(100vw - 32px));height:min(620px,calc(100vh - 40px));background:#0A0A0A;border:1px solid rgba(255,255,255,0.09);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,0.55);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(14px) scale(.98);pointer-events:none;transition:opacity .25s ease,transform .25s ease}'
    + '.boomcc-panel.boomcc-open{opacity:1;transform:none;pointer-events:auto}'
    + '.boomcc-head{display:flex;align-items:center;gap:11px;padding:16px 16px 14px;border-bottom:1px solid rgba(255,255,255,0.07);background:linear-gradient(180deg,#0d0d0f,#0a0a0a)}'
    + '.boomcc-mark{width:34px;height:34px;border-radius:9px;flex:none;display:flex;align-items:center;justify-content:center;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);color:' + GOLD + ';font-size:15px;letter-spacing:1px}'
    + '.boomcc-htxt{flex:1;min-width:0}'
    + '.boomcc-htitle{color:#fff;font-size:14px;letter-spacing:.5px}'
    + '.boomcc-hsub{color:#8a8a8a;font-size:11px;letter-spacing:.4px;margin-top:2px;display:flex;align-items:center;gap:6px}'
    + '.boomcc-hsub::before{content:"";width:6px;height:6px;border-radius:50%;background:#27c93f;display:inline-block}'
    + '.boomcc-x{background:none;border:0;color:#777;font-size:22px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:6px}'
    + '.boomcc-x:hover{color:#fff;background:rgba(255,255,255,0.06)}'
    + '.boomcc-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}'
    + '.boomcc-body::-webkit-scrollbar{width:7px}.boomcc-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}'
    + '.boomcc-msg{max-width:84%;padding:11px 14px;border-radius:14px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-wrap:break-word}'
    + '.boomcc-bot{align-self:flex-start;background:#161616;color:#ededed;border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:5px}'
    + '.boomcc-user{align-self:flex-end;background:' + GOLD + ';color:#0a0a0a;border-bottom-right-radius:5px;font-weight:400}'
    + '.boomcc-msg a{color:' + GOLD + ';text-decoration:underline}'
    + '.boomcc-user a{color:#0a0a0a}'
    + '.boomcc-typing{align-self:flex-start;display:flex;gap:4px;padding:13px 14px;background:#161616;border:1px solid rgba(255,255,255,0.06);border-radius:14px;border-bottom-left-radius:5px}'
    + '.boomcc-typing span{width:6px;height:6px;border-radius:50%;background:#777;display:inline-block;animation:boomccBlink 1.2s infinite}'
    + '.boomcc-typing span:nth-child(2){animation-delay:.2s}.boomcc-typing span:nth-child(3){animation-delay:.4s}'
    + '@keyframes boomccBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}'
    + '.boomcc-chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 16px 8px}'
    + '.boomcc-chip{background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.28);color:#cfcfcf;border-radius:30px;padding:7px 12px;font-size:12px;cursor:pointer;transition:all .15s ease}'
    + '.boomcc-chip:hover{background:rgba(212,175,55,0.14);color:' + GOLD + '}'
    + '.boomcc-foot{border-top:1px solid rgba(255,255,255,0.07);padding:10px 12px 12px;background:#0a0a0a}'
    + '.boomcc-inrow{display:flex;gap:8px;align-items:flex-end}'
    + '.boomcc-ta{flex:1;resize:none;background:#161616;border:1px solid rgba(255,255,255,0.1);color:#fff;border-radius:12px;padding:11px 13px;font-size:13.5px;font-family:inherit;line-height:1.4;max-height:120px;outline:none}'
    + '.boomcc-ta:focus{border-color:rgba(212,175,55,0.5)}'
    + '.boomcc-ta::placeholder{color:#666}'
    + '.boomcc-go{flex:none;background:' + GOLD + ';color:#0a0a0a;border:0;border-radius:12px;width:42px;height:42px;cursor:pointer;font-size:17px;display:flex;align-items:center;justify-content:center;transition:opacity .15s}'
    + '.boomcc-go:disabled{opacity:.4;cursor:default}'
    + '.boomcc-disc{color:#5f5f5f;font-size:10px;text-align:center;margin-top:8px;letter-spacing:.2px;line-height:1.4}'
    + '@media (max-width:480px){.boomcc-panel{bottom:0;right:0;width:100vw;height:100dvh;border-radius:0}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── DOM ─────────────────────────────────────────────────────────────────
  var root = document.createElement('div');
  root.className = 'boomcc-root';
  root.innerHTML =
    '<button class="boomcc-launch" aria-label="' + T.title + '">'
    + '<span class="boomcc-dot"></span><span>' + T.launch + '</span></button>'
    + '<div class="boomcc-panel" role="dialog" aria-label="' + T.title + '">'
      + '<div class="boomcc-head">'
        + '<div class="boomcc-mark">B</div>'
        + '<div class="boomcc-htxt"><div class="boomcc-htitle">' + T.title + '</div>'
        + '<div class="boomcc-hsub">' + T.subtitle + '</div></div>'
        + '<button class="boomcc-x" aria-label="Close">×</button>'
      + '</div>'
      + '<div class="boomcc-body"></div>'
      + '<div class="boomcc-chips"></div>'
      + '<div class="boomcc-foot"><div class="boomcc-inrow">'
        + '<textarea class="boomcc-ta" rows="1" placeholder="' + T.placeholder + '" aria-label="' + T.placeholder + '"></textarea>'
        + '<button class="boomcc-go" aria-label="' + T.send + '">↑</button>'
      + '</div><div class="boomcc-disc">' + T.disclaimer + '</div></div>'
    + '</div>';
  document.body.appendChild(root);

  var launch = root.querySelector('.boomcc-launch');
  var panel = root.querySelector('.boomcc-panel');
  var closeBtn = root.querySelector('.boomcc-x');
  var body = root.querySelector('.boomcc-body');
  var chipsWrap = root.querySelector('.boomcc-chips');
  var ta = root.querySelector('.boomcc-ta');
  var go = root.querySelector('.boomcc-go');

  // history sent to the API: [{role,content}]
  var history = [];
  var busy = false;
  var greeted = false;

  function ga(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Render bot text: escape, then linkify markdown links + bare /paths + URLs + bold.
  function renderBot(text) {
    var html = esc(text);
    // [label](url)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, function (_, label, url) {
      var ext = /^https?:/.test(url);
      return '<a href="' + url + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
    });
    // bare absolute urls
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, function (m, pre, url) {
      return pre + '<a href="' + url + '" target="_blank" rel="noopener">' + url.replace(/^https?:\/\//, '') + '</a>';
    });
    // **bold**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return html;
  }

  function addMsg(role, text) {
    var el = document.createElement('div');
    el.className = 'boomcc-msg ' + (role === 'user' ? 'boomcc-user' : 'boomcc-bot');
    el.innerHTML = role === 'user' ? esc(text) : renderBot(text);
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'boomcc-typing';
    el.setAttribute('aria-label', T.typing);
    el.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function renderChips() {
    chipsWrap.innerHTML = '';
    T.chips.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'boomcc-chip';
      b.textContent = c;
      b.addEventListener('click', function () { send(c); });
      chipsWrap.appendChild(b);
    });
  }

  function hideChips() { chipsWrap.style.display = 'none'; }

  function greet() {
    if (greeted) return;
    greeted = true;
    addMsg('bot', T.greeting);
    renderChips();
  }

  function openPanel() {
    panel.classList.add('boomcc-open');
    launch.style.display = 'none';
    greet();
    ga('concierge_open', { page_path: path });
    setTimeout(function () { ta.focus(); }, 250);
  }

  function closePanel() {
    panel.classList.remove('boomcc-open');
    launch.style.display = '';
  }

  function autoGrow() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  function send(text) {
    text = (text != null ? text : ta.value).trim();
    if (!text || busy) return;
    hideChips();
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    ta.value = '';
    autoGrow();
    ga('concierge_message', { page_path: path });

    busy = true;
    go.disabled = true;
    var typing = showTyping();

    fetch('/api/concierge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-24) })
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
    }).then(function (res) {
      typing.remove();
      var reply = res.d && res.d.reply;
      if (res.ok && reply) {
        addMsg('bot', reply);
        history.push({ role: 'assistant', content: reply });
      } else {
        var msg = (res.d && res.d.message) || T.error;
        addMsg('bot', msg);
        // Don't keep a failed turn's assistant slot in history.
      }
    }).catch(function () {
      typing.remove();
      addMsg('bot', T.error);
    }).finally(function () {
      busy = false;
      go.disabled = false;
      ta.focus();
    });
  }

  // ── wire up ───────────────────────────────────────────────────────────────
  launch.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  go.addEventListener('click', function () { send(); });
  ta.addEventListener('input', autoGrow);
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('boomcc-open')) closePanel();
  });
})();
