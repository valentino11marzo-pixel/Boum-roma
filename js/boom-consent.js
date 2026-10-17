/*
 * boom-consent.js — GDPR / Google Consent Mode v2, the BOOM way.
 *
 * The gtag snippet on every page should set consent DEFAULT = denied before
 * gtag('config') runs (see the inline head snippet). This module:
 *   1. restores a remembered choice (365 days) and, if granted, lifts
 *      consent immediately — before the banner would even render;
 *      without a granted choice it says «denied» explicitly and removes the
 *      analytics cookies (_ga, _ga_*, _gid…) a page without the default may
 *      already have written: no consent, no analytics cookie, on any page;
 *   2. otherwise shows a small, non-blocking plate (bottom-left) that
 *      never interrupts reading or checkout;
 *   3. lets the reader change their mind as easily as they said yes
 *      (Garante 10/06/2021, GDPR art. 7(3)): a «Cookie preferences» link is
 *      added next to «Privacy» in the footer, and ANY element carrying
 *      [data-cookie-prefs] or href="#cookie-preferences" — or a visit to
 *      …#cookie-preferences — reopens the plate (window.boomConsent.open()).
 *      «Essential only» removes the attribution cookie and stored touches
 *      here too, not only on pages that also load boom-track.js.
 *
 * Sul telefono (≤879px) il riquadro aspetta. Al primo sguardo copriva il
 * bottone dell'hero o il primo campo del modulo — cioè proprio quello che
 * ogni visitatore nuovo (e tutto il traffico che arriva da una risposta
 * AI) era venuto a toccare. Ora, senza una scelta salvata, compare al
 * PRIMO di due momenti: uno scorrimento di almeno 0,25 × l'altezza della
 * finestra, oppure 5 secondi dall'ARRIVO (da quando questo script gira,
 * attorno al DOMContentLoaded — non dal load, che su una rete vera arriva
 * secondi dopo per gtag, font e immagini). Una volta comparso resta fino
 * alla scelta (niente isteresi: un riquadro che va e viene si legge come
 * un difetto). È compatto e si alza sopra la barra che è DAVVERO ancorata
 * in fondo (barra di pagamento, HUD, bottone WhatsApp): la misura la fa il
 * browser, non un numero scritto a mano in ogni pagina — anche quando una
 * finestra o un tablet diventano larghi da telefono DOPO il caricamento
 * (aspettare e misurare sono due cose separate: delayed e armed). Il desktop
 * resta com'era: 700ms dopo il DOMContentLoaded, in basso a sinistra.
 *
 * Accetta accende SOLO la misura: Google Analytics (analytics_storage) e il
 * cookie di attribuzione di BOOM (boom_attr, js/boom-track.js). I segnali
 * pubblicitari ad_* restano negati anche dopo il sì: BOOM non fa pubblicità,
 * e il riquadro dice esattamente ciò che Accetta accende.
 * Il tracciamento parte SOLO dopo una scelta, come prima.
 *
 * I desk città (<body data-consent-late>, le pagine dove la diagnosi è
 * l'hero) aspettano di più: la prima mossa del lettore + 600 ms, poi
 * finché il lettore è al lavoro nell'hero (Check-in senza risposta o
 * biglietto sullo schermo), 45 s al massimo, mai sopra un <dialog open>.
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
      // Scaduto: la scelta non vale più, e nemmeno il cookie che autorizzava.
      if (Date.now() - (+m[2]) > YEAR) { localStorage.removeItem(KEY); dropAttr(); return null; }
      return m[1];
    } catch (e) { return null; }
  }
  function grant() {
    // Solo la misura. ad_* restano negati: lo dice anche una pagina che
    // avesse perso il proprio default (un «non detto» per gtag vale sì).
    gtagSafe('consent', 'update', {
      analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    try { document.dispatchEvent(new CustomEvent('boom-consent-granted')); } catch (e) {}
  }
  function denyGtag() {
    gtagSafe('consent', 'update', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
  }
  // I cookie non tecnici, tolti a ogni livello di dominio: GA4 li scrive
  // sul dominio più alto (.boomrome.com), boom-track.js sull'host.
  var NON_ESSENTIAL = /^(?:_ga(?:_[A-Za-z0-9]+)?|_gid|_gat(?:_[A-Za-z0-9_-]+)?|_gcl_[a-z]+|boom_attr)$/;
  function dropCookies() {
    try {
      var host = String(location.hostname || ''), doms = [''];
      if (host && !/^[\d.]+$/.test(host) && host.indexOf(':') < 0) {
        var parts = host.split('.');
        for (var i = 0; i < parts.length - 1; i++) { var d = parts.slice(i).join('.'); doms.push(d, '.' + d); }
      }
      String(document.cookie || '').split(';').forEach(function (c) {
        var name = c.split('=')[0].replace(/^\s+|\s+$/g, '');
        if (!NON_ESSENTIAL.test(name)) return;
        doms.forEach(function (d) { document.cookie = name + '=; Max-Age=0; Path=/' + (d ? '; Domain=' + d : ''); });
      });
    } catch (e) {}
  }
  // Senza consenso non resta nulla di ciò che l'attribuzione aveva salvato,
  // anche dove boom-track.js non è caricato (pre-arrival, pass-delivery…):
  // api/_attribution.js legge boom_attr da qualunque pagina parta il lead.
  function dropStored() {
    try { localStorage.removeItem('boom:source'); localStorage.removeItem('boom:last'); localStorage.removeItem('boom_src'); } catch (e) {}
    try { sessionStorage.removeItem('boom:sid'); } catch (e) {}
  }
  // Il cookie di attribuzione, tolto per nome anche quando document.cookie
  // non lo elenca (un'altra scheda, un dominio letto male): è quello che
  // api/_attribution.js legge sul lead.
  function dropAttr() { try { document.cookie = 'boom_attr=; Max-Age=0; Path=/'; } catch (e) {} }
  function deny() {
    denyGtag();
    dropCookies();
    dropStored();
    dropAttr();
    try { document.dispatchEvent(new CustomEvent('boom-consent-denied')); } catch (e) {}
  }
  function save(v) { try { localStorage.setItem(KEY, v + ':' + Date.now()); } catch (e) {} }

  var s = state();
  if (s === 'all') grant();
  else {
    // Nessun consenso (mai dato, scaduto o «Solo essenziali»): lo si dice a
    // gtag in chiaro — su una pagina che ha già il default è un no-op, su una
    // che non l'ha ferma i cookie da qui in poi — e si tolgono quelli già
    // scritti. Di nuovo dopo il load: gtag.js è asincrono e può arrivare
    // dopo questo file. Se nel frattempo il lettore ha accettato, non si
    // tocca niente.
    denyGtag();
    dropCookies();
    window.addEventListener('load', function () { if (state() !== 'all') dropCookies(); });
  }

  // ── Il telefono: QUANDO comparire, e DOVE ────────────────────────────
  // QUANDO si decide una volta, all'avvio (delayed); DOVE si misura sempre,
  // finché non c'è una scelta (armed): una finestra che diventa stretta dopo
  // il caricamento prende la regola compatta del telefono e deve salire
  // sopra la barra in fondo come un telefono vero. (max-width:879px) è la
  // STESSA soglia del CSS qui sotto, così logica e aspetto non divergono.
  var mq = null;
  try { mq = window.matchMedia ? window.matchMedia('(max-width:879px)') : null; } catch (e) { mq = null; }
  function onPhone() { return !!(mq && mq.matches); }
  function scrolledEnough() {
    var y = window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || 0;
    return y >= window.innerHeight * 0.25;
  }

  var el = null;
  var due = false;      // è arrivato il momento (scorrimento o 5s)
  var delayed = false;  // telefono all'avvio: il riquadro ASPETTA quel momento
  var armed = false;    // ascoltatori attivi (la misura) finché non c'è una scelta
  var raf = 0, trail = 0, wait5 = 0;

  // Quanto alzare il riquadro: il browser guarda cosa c'è DAVVERO in fondo
  // alla finestra. Tre punti sul bordo (sinistra, centro, destra) per le
  // barre a tutta larghezza, due appena sopra per i bottoni d'angolo (il
  // WhatsApp di /faq). Il primo elemento che non è il riquadro, risalendo
  // gli antenati, se è position:fixed ed è una cosa da fondo pagina (sta
  // nella metà bassa, visibile) dà la misura: innerHeight − il suo top.
  // Uno sfondo fisso a tutto schermo (top 0) non è una barra e non conta.
  function lift() {
    raf = 0;
    if (!el) return;
    // Fuori dalla regola del telefono il riquadro sta a 16px dal fondo come
    // sempre: niente misura (il desktop resta com'era).
    if (!onPhone()) { el.style.removeProperty('--boomcst-lift'); return; }
    if (!document.elementsFromPoint) return;
    var W = window.innerWidth, H = window.innerHeight, best = 0;
    var probes = [[12, H - 4], [W / 2, H - 4], [W - 12, H - 4], [40, H - 28], [W - 40, H - 28]];
    for (var i = 0; i < probes.length; i++) {
      var stack = [];
      try { stack = document.elementsFromPoint(probes[i][0], probes[i][1]) || []; } catch (e) { stack = []; }
      var n = null;
      for (var j = 0; j < stack.length; j++) if (!el.contains(stack[j])) { n = stack[j]; break; }
      for (; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        var cs = window.getComputedStyle(n);
        if (cs.position !== 'fixed') continue;
        var r = n.getBoundingClientRect();
        if (r.height > 0 && r.top < H && r.top > H * 0.4 && parseFloat(cs.opacity) > 0.05) {
          best = Math.max(best, H - r.top);
        }
        break;
      }
    }
    el.style.setProperty('--boomcst-lift', Math.round(best) + 'px');
  }
  // Una misura per fotogramma, più una di coda: le barre entrano con una
  // transizione, e a scorrimento fermo la misura giusta è quella di dopo.
  function schedule() {
    if (raf || !el) return;
    raf = window.requestAnimationFrame ? window.requestAnimationFrame(lift) : setTimeout(lift, 16);
  }
  function nudge() {
    schedule();
    clearTimeout(trail);
    trail = setTimeout(schedule, 350);
  }
  function show() {
    due = true;
    clearTimeout(wait5); wait5 = 0;
    if (!el) return;              // open() lo creerà già visibile
    lift();                       // al posto giusto PRIMA di comparire
    el.classList.remove('zz');
  }
  function onScroll() {
    // sui desk città lo scroll non è un segnale (la pagina scorre da sola)
    if (!late) { if (!due && scrolledEnough()) show(); }
    nudge();
  }
  function arm() {
    if (armed) return;
    armed = true;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', nudge, { passive: true });
    document.addEventListener('transitionend', nudge, true);
    document.addEventListener('animationend', nudge, true);
    // i desk città armano la loro attesa (prima mossa, al lavoro, 45 s)
    if (late) { armLate(); return; }
    // I 5 secondi contano dall'arrivo: lo script è defer, quindi gira
    // attorno al DOMContentLoaded. Dal load erano 9–10s su una rete vera.
    if (delayed && !due && !wait5) wait5 = setTimeout(show, 5000);
  }
  // Una scelta fatta: nessun ascoltatore resta a misurare per niente.
  function disarm() {
    if (!armed) return;
    armed = false;
    window.removeEventListener('scroll', onScroll, { passive: true });
    window.removeEventListener('resize', nudge, { passive: true });
    document.removeEventListener('transitionend', nudge, true);
    document.removeEventListener('animationend', nudge, true);
    LATE_EVS.forEach(function (t) { try { window.removeEventListener(t, lateArm, { passive: true }); } catch (e) {} });
    clearTimeout(wait5); clearTimeout(trail); wait5 = trail = 0;
    if (raf) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(raf); else clearTimeout(raf);
      raf = 0;
    }
  }

  function close() {
    disarm();
    if (!el) return;
    el.style.opacity = '0'; el.style.transform = 'translateY(10px)';
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); el = null; }, 450);
  }
  // Una scelta già salvata non riapre il riquadro (il timer dei 700ms può
  // scattare DOPO una scelta fatta da un riquadro aperto a mano); reopen()
  // toglie la scelta prima di chiamare open(), quindi lì passa.
  function open() {
    if (el || !document.body || state()) return;
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
        // Sul telefono il riquadro è SEMPRE compatto (prima lo era solo su
        // richiesta della pagina, <html data-consent="compact">): stessi
        // testi, stessi due tasti, in fondo, e alzato di --boomcst-lift
        // sopra la barra ancorata che il browser trova lì sotto (lift()).
        // .zz lo tiene nascosto finché non è il momento (vedi in fondo).
        // .zz sta FUORI dalla media query di proposito: si aggiunge solo
        // quando la pagina è partita da telefono (delayed), quindi il desktop non lo
        // vede mai — ma un telefono ruotato in orizzontale oltre gli 880px
        // (un Pro Max: 932×430) prima del momento uscirebbe dalla media
        // query e il riquadro comparirebbe subito, col layout desktop, su
        // una finestra alta 430px. Nascosto resta nascosto, in ogni verso.
        '@media(max-width:879px){.boomcst{left:8px;right:8px;width:auto;bottom:calc(var(--boomcst-lift,0px) + 8px + env(safe-area-inset-bottom,0px));padding:10px 12px;border-radius:14px}' +
        '.boomcst .e{display:none}.boomcst p{font-size:12px;margin:0 0 8px;line-height:1.45}.boomcst button{padding:8px 14px}}' +
        '.boomcst.zz{opacity:0!important;visibility:hidden;pointer-events:none}' +
        '@media(prefers-reduced-motion:reduce){.boomcst{transition:none}}';
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
          p: 'Accepter active Google Analytics et le cookie d\'attribution de BOOM. Aucune publicité, aucune revente de données — <a href="/privacy">comment nous traitons vos données</a>.',
          no: 'Essentiels uniquement', ok: 'Accepter', aria: 'Préférences cookies' }
      : lang === 'it'
      ? { e: 'Privacy',
          p: 'Accetta attiva Google Analytics e il cookie di attribuzione di BOOM. Nessuna pubblicità, nessuna vendita di dati — <a href="/privacy">come trattiamo i dati</a>.',
          no: 'Solo essenziali', ok: 'Accetta', aria: 'Preferenze cookie' }
      : { e: 'Privacy',
          p: 'Accept turns on Google Analytics and BOOM\'s own attribution cookie. No ads, no data resale — <a href="/privacy">how we handle data</a>.',
          no: 'Essential only', ok: 'Accept', aria: 'Cookie preferences' };

    // Sul telefono nasce nascosto (.zz) se il momento non è ancora venuto;
    // se nel frattempo il lettore ha già scorso, nasce visibile.
    if (delayed && !due && !late && scrolledEnough()) due = true;
    el = document.createElement('div');
    el.className = 'boomcst' + ((delayed || late) && !due ? ' zz' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', T.aria);
    el.innerHTML =
      '<div class="e">' + T.e + '</div>' +
      '<p>' + T.p + '</p>' +
      '<div class="r"><button class="no" type="button">' + T.no + '</button><button class="ok" type="button">' + T.ok + '</button></div>';
    document.body.appendChild(el);
    lift();
    var node = el;   // close() può azzerare el prima dei due fotogrammi
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (node !== el) return;
      node.style.opacity = '1'; node.style.transform = 'none';
    }); });
    el.querySelector('.ok').addEventListener('click', function () { save('all'); grant(); close(); });
    el.querySelector('.no').addEventListener('click', function () { save('min'); deny(); close(); });
  }

  // ── I desk città (<body data-consent-late>): la targa aspetta il lettore ──
  // Sui desk città la diagnosi è l'hero (STUDIO_CITIES_ESPERIENZA.md §11):
  // il riquadro compare dopo la PRIMA MOSSA del lettore — una rotella, un
  // dito che scorre, un tap FUORI da diagnosi/pass/porta, un tasto — più
  // 600 ms, e poi aspetta finché il lettore è AL LAVORO nell'hero: il
  // Check-in senza risposta sullo schermo, o il biglietto sullo schermo (su
  // un 375px si posava sulle opzioni, dopo il tap sulla porta del biglietto).
  // Ricontrolla ogni 1,2 s, mostra al più tardi 45 s dopo l'armamento, mai
  // sopra un <dialog open> (la cassa). Lo scroll EVENT non è un segnale: la
  // pagina scorre da sola per far atterrare il pass. 8 s senza mosse armano
  // comunque. Il riquadro nasce nascosto (.zz, come sul telefono) e show()
  // lo rivela; nulla è salvato prima della scelta, quindi aspettare non
  // costa nulla al lettore. Le pagine senza l'attributo non cambiano.
  var late = false;
  function isLate() { try { return !!(document.body && document.body.hasAttribute('data-consent-late')); } catch (e) { return false; } }
  function modalOpen() { try { return !!document.querySelector('dialog[open]'); } catch (e) { return false; } }
  function onScreen(n) {
    try {
      if (!n) return false;
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      var r = n.getBoundingClientRect();
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
  var WAIT_MAX = 45000, lateArmed = false, armedAt = 0;
  var LATE_EVS = ['wheel', 'touchmove', 'pointerdown', 'keydown'];
  function lateGo() {
    if (due) return;
    if (modalOpen()) { setTimeout(lateGo, 400); return; }
    if (late && atWork() && Date.now() - armedAt < WAIT_MAX) { setTimeout(lateGo, 1200); return; }
    show();
  }
  // un tap DENTRO la diagnosi, il pass o la porta è il lettore al lavoro,
  // non una mossa oltre: non arma (una rotella sì)
  function lateInside(ev) {
    try {
      if (!ev || ev.type === 'wheel' || ev.type === 'touchmove') return false;
      return !!(ev.target && ev.target.closest && ev.target.closest('#checkin, #pass, #contact, dialog'));
    } catch (e) { return false; }
  }
  function lateArm(ev) {
    if (lateArmed || lateInside(ev)) return;
    lateArmed = true; armedAt = Date.now();
    LATE_EVS.forEach(function (t) { try { window.removeEventListener(t, lateArm, { passive: true }); } catch (e) {} });
    setTimeout(lateGo, 600);
  }
  function armLate() {
    LATE_EVS.forEach(function (t) { try { window.addEventListener(t, lateArm, { passive: true }); } catch (e) {} });
    setTimeout(lateArm, 8000);
  }

  // ── Cambiare idea: facile quanto dire sì ─────────────────────────────
  // La privacy promette che il consenso si ritira dal riquadro: serve un
  // modo per RIAPRIRLO su ogni pagina, non solo window.boomConsent.open()
  // che nessuna pagina chiamava. Il link nasce accanto a «Privacy» nel piede
  // (stessa classe, stesso stile, stesso separatore), nella lingua della
  // pagina — o nelle sue lingue, se il piede ha già i <span class="l-xx">
  // dell'interruttore. Una pagina che ha già il suo link non ne riceve un
  // secondo.
  var PREFS = { en: 'Cookie preferences', it: 'Preferenze cookie', fr: 'Préférences cookies' };
  var PREFS_SEL = '[data-cookie-prefs],a[href="#cookie-preferences"]';
  function pageLang() {
    var l = String(document.documentElement.lang || 'en').toLowerCase().slice(0, 2);
    return PREFS[l] ? l : 'en';
  }
  function isPrivacy(a) {
    try {
      var u = new URL(a.getAttribute('href') || '', location.href);
      return /(?:^|\.)boomrome\.com$|^localhost$|^127\./.test(u.hostname) || u.origin === location.origin
        ? /^\/privacy(?:\.html)?$/.test(u.pathname) : false;
    } catch (e) { return false; }
  }
  function footerLink() {
    try {
      if (document.querySelector(PREFS_SEL)) return;
      var feet = document.getElementsByTagName('footer'), priv = null;
      for (var i = feet.length - 1; i >= 0 && !priv; i--) {
        var as = feet[i].getElementsByTagName('a');
        for (var j = 0; j < as.length && !priv; j++) if (isPrivacy(as[j])) priv = as[j];
      }
      if (!priv || !priv.parentNode) return footerFallback(feet[feet.length - 1]);
      var a = priv.cloneNode(false);
      ['id', 'target', 'rel', 'hreflang', 'download', 'aria-current'].forEach(function (k) { a.removeAttribute(k); });
      a.setAttribute('href', '#cookie-preferences');
      a.setAttribute('data-cookie-prefs', '');
      // le lingue dell'interruttore della pagina (owners/executive/reunion)
      var box = priv.closest ? (priv.closest('ul,ol,nav,div,p') || priv.parentNode) : priv.parentNode, langs = [];
      [].forEach.call(box.querySelectorAll('[class]'), function (n) {
        var m = /(?:^|\s)l-(en|it|fr)(?:\s|$)/.exec(n.className);
        if (m && langs.indexOf(m[1]) < 0) langs.push(m[1]);
      });
      if (langs.length) {
        langs.forEach(function (l) {
          var sp = document.createElement('span'); sp.className = 'l-' + l; sp.textContent = PREFS[l]; a.appendChild(sp);
        });
      } else a.textContent = PREFS[pageLang()];
      var at = priv, wrap = null;
      if (priv.parentNode.tagName === 'LI' && priv.parentNode.children.length === 1) {
        at = priv.parentNode; wrap = at.cloneNode(false); wrap.removeAttribute('id'); wrap.appendChild(a);
      }
      var node = wrap || a, parent = at.parentNode, prev = at.previousSibling;
      parent.insertBefore(node, at.nextSibling);
      // il separatore che c'era prima di «Privacy» (« · », «|», uno spazio)
      if (prev && prev.nodeType === 3) {
        var sep = /[·|•]/.test(prev.nodeValue) ? prev.nodeValue.replace(/\s+/g, ' ') : (/\S/.test(prev.nodeValue) ? '' : ' ');
        if (sep) parent.insertBefore(document.createTextNode(sep), node);
      }
    } catch (e) {}
  }
  // Un piede senza «Privacy» (gli articoli del blog, /meteo, /match): il
  // link in coda al suo ultimo testo, dopo un « · ».
  function footerFallback(foot) {
    try {
      if (!foot) return;
      var at = foot;
      while (at.lastElementChild && !/^(?:A|BUTTON|SVG|IMG|BR|SCRIPT|STYLE)$/i.test(at.lastElementChild.tagName)
        && /\S/.test(at.lastElementChild.textContent || '')) at = at.lastElementChild;
      var a = document.createElement('a');
      a.setAttribute('href', '#cookie-preferences');
      a.setAttribute('data-cookie-prefs', '');
      a.textContent = PREFS[pageLang()];
      at.appendChild(document.createTextNode(' · '));
      at.appendChild(a);
      // senza una regola per i link del piede resterebbe il blu del browser
      var c = window.getComputedStyle(a).color;
      if (c === 'rgb(0, 0, 238)' || c === 'rgb(85, 26, 139)') a.style.color = 'inherit';
    } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(PREFS_SEL) : null;
    if (!t) return;
    e.preventDefault();
    window.boomConsent.open();
  });

  if (!s) {
    late = isLate();
    delayed = onPhone();
    arm();
    (document.readyState === 'loading')
      ? document.addEventListener('DOMContentLoaded', function () { setTimeout(open, 700); }, { once: true })
      : setTimeout(open, 700);
  }
  // Riaperto a mano (un link "preferenze cookie"): lo si vuole ADESSO,
  // anche sul telefono — niente attesa, ma sempre sopra la barra in fondo.
  function reopen() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    due = true;
    arm();
    if (el) show(); else open();
  }
  // Chiamato prima che esista il <body> (uno script in testa): si aspetta il
  // DOM invece di lanciare.
  window.boomConsent = { open: function () {
    if (document.body) reopen();
    else document.addEventListener('DOMContentLoaded', reopen, { once: true });
  } };
  function ready() {
    footerLink();
    // …#cookie-preferences nell'indirizzo (un link dalla privacy, un'email)
    if (location.hash === '#cookie-preferences') window.boomConsent.open();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
