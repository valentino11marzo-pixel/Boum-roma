/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Apple-Tech Elevation Layer  —  js/boom-elevate.js
   Drop-in, dependency-free motion primitives for the apartments funnel.
   Include once, BEFORE the page's own render script so the API is ready:
       <script src="/js/boom-elevate.js"></script>

   Provides three primitives (all additive, idempotent, reduced-motion aware):
     1. FLIP        — animate a grid's cards from their old → new positions
                      when the list is filtered / sorted / re-rendered.
     2. blur-up     — a tiny blurred preview (imgur thumbnail) crossfades to
                      the sharp photo as it decodes. Works on any [data-blur-up].
     3. continuity  — a "shared element" handoff: the tapped listing card photo
                      morphs into the detail page's hero on arrival.

   Design rules (mirror js/boom-motion.js):
     • Never hides content if JS fails — markup stays visible without this file.
     • Idempotent: safe to load twice; each element is enhanced once.
     • Respects prefers-reduced-motion: degrades to plain, instant rendering.
     • No external dependencies, no network beyond the imgur thumbnail.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.BoomElevate) return;                    // idempotent guard

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var EASE = 'cubic-bezier(.16,1,.3,1)';

  // ── Inject styles (appended last so single-class rules win ties) ───────────
  var css =
    /* blur-up: low-res preview sits ON TOP of the real photo and fades out as
       the photo decodes — so we never touch the <img>'s own transitions
       (card hover-zoom, gallery hover) which live at higher/equal specificity */
    /* sized/placed to the IMAGE's own box via inline styles (set in blurUp),
       so it never spills over a padded parent or a sibling video block */
    '.bu-lqip{position:absolute;background-size:cover;background-position:center;' +
       'filter:blur(14px) saturate(1.2);transform:scale(1.06);opacity:1;' +
       'transition:opacity .7s ease;z-index:2;pointer-events:none;overflow:hidden}' +
    '.bu-lqip.bu-hide{opacity:0}' +
    '@media(prefers-reduced-motion:reduce){.bu-lqip{display:none}}';
  try {
    var style = document.createElement('style');
    style.setAttribute('data-boom-elevate', '');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  } catch (e) { /* non-fatal */ }

  // ════════════════════════════ 1) blur-up ════════════════════════════════
  // imgur thumbnail: insert a size letter before the extension. 't' = 160px,
  // aspect-preserving. Same host → no Vercel optimizer / allowlist needed.
  function lqipFor(url) {
    url = String(url || '');
    // Unwrap the Vercel image optimizer (/_vercel/image?url=<encoded original>&…)
    // so optimized gallery thumbs still resolve to their imgur source.
    if (/\/_vercel\/image/.test(url)) {
      var vm = url.match(/[?&]url=([^&]+)/);
      if (vm) { try { url = decodeURIComponent(vm[1]); } catch (e) {} }
    }
    var m = url.match(/(i\.imgur\.com\/[A-Za-z0-9]{7})[sbtmlh]?(\.(?:jpe?g|png|webp|gif))/i);
    return m ? 'https://' + m[1] + 't' + m[2] : null;
  }

  function blurUp(img) {
    if (reduce || !img || img.__bu) return;
    var c = img.parentElement;
    if (!c) return;
    var lq = lqipFor(img.currentSrc || img.getAttribute('src') || img.src);
    if (!lq) return;                                  // no cheap preview → plain load (retry-safe)
    var w = img.offsetWidth, h = img.offsetHeight;
    if (!w || !h) return;                             // not laid out yet → plain load (retry-safe)

    img.__bu = 1;                                     // claim only once we'll actually enhance
    try { if (getComputedStyle(c).position === 'static') c.style.position = 'relative'; } catch (e) {}

    var layer = document.createElement('div');
    layer.className = 'bu-lqip';
    layer.style.backgroundImage = 'url("' + lq + '")';
    // Cover exactly the image's box (not the parent), so a padded parent or a
    // sibling (e.g. the single-photo+video layout) is never overlaid.
    layer.style.left = img.offsetLeft + 'px';
    layer.style.top = img.offsetTop + 'px';
    layer.style.width = w + 'px';
    layer.style.height = h + 'px';
    try { layer.style.borderRadius = getComputedStyle(img).borderRadius; } catch (e) {}
    layer.setAttribute('aria-hidden', 'true');
    c.insertBefore(layer, img);

    var removed = false;
    function reveal() {
      if (removed) return;
      removed = true;
      layer.classList.add('bu-hide');
      setTimeout(function () { if (layer && layer.parentNode) layer.parentNode.removeChild(layer); }, 720);
    }
    if (img.complete && img.naturalWidth > 0) reveal();
    else {
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', function () { if (layer && layer.parentNode) layer.parentNode.removeChild(layer); }, { once: true });
    }
  }

  function scan(root) {
    var nodes = (root || document).querySelectorAll('img[data-blur-up]');
    Array.prototype.forEach.call(nodes, blurUp);
  }

  // ════════════════════════════ 2) FLIP ═══════════════════════════════════
  // Call flipCapture(container, selector) BEFORE mutating the DOM; it records
  // each keyed child's rect and returns play() to run AFTER the new DOM is in.
  // Persisting cards glide to their new spot; brand-new cards rise + fade in.
  function flipCapture(container, selector) {
    if (reduce || !container) return null;
    var first = {};
    var kids = container.querySelectorAll(selector);
    for (var i = 0; i < kids.length; i++) {
      var id = kids[i].dataset && kids[i].dataset.id;
      if (id) first[id] = kids[i].getBoundingClientRect();
    }
    return function play() {
      var now = container.querySelectorAll(selector);
      // Finalize only when the (longest-running) transform transition ends, so a
      // shorter opacity transition can't clear styles mid-flight.
      function cleanupOn(el) {
        el.addEventListener('transitionend', function te(ev) {
          if (ev && ev.propertyName && ev.propertyName !== 'transform') return;
          el.style.transition = ''; el.style.willChange = ''; el.style.transform = '';
          el.removeEventListener('transitionend', te);
        });
      }
      Array.prototype.forEach.call(now, function (el) {
        var id = el.dataset && el.dataset.id;
        var f = id && first[id];
        var n = el.getBoundingClientRect();
        if (f) {
          var dx = f.left - n.left, dy = f.top - n.top;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;     // didn't move
          el.style.transition = 'none';
          el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          el.style.willChange = 'transform';
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            el.style.transition = 'transform .5s ' + EASE;
            el.style.transform = '';
            cleanupOn(el);
          }); });
        } else {
          el.style.transition = 'none';
          el.style.opacity = '0';
          el.style.transform = 'translateY(10px) scale(.985)';
          el.style.willChange = 'transform,opacity';
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            el.style.transition = 'opacity .45s ease, transform .55s ' + EASE;
            el.style.opacity = ''; el.style.transform = '';
            cleanupOn(el);
          }); });
        }
      });
    };
  }

  // ═══════════════════ 3) list → detail continuity ════════════════════════
  var HKEY = 'boom:handoff';

  // Called on the LIST page the instant a card is tapped, before navigation.
  function captureHandoff(img, id) {
    try {
      if (reduce || !img || !id) return;
      var r = img.getBoundingClientRect();
      if (!r.width) return;
      sessionStorage.setItem(HKEY, JSON.stringify({
        id: id,
        src: img.currentSrc || img.src,
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        t: Date.now()
      }));
      // one-shot per stored handoff; readHandoff enforces the TTL on the other side
    } catch (e) {}
  }

  function readHandoff(id) {
    try {
      var raw = sessionStorage.getItem(HKEY);
      if (!raw) return null;
      var h = JSON.parse(raw);
      if (!h || h.id !== id) return null;
      if (Date.now() - h.t > 10000) { sessionStorage.removeItem(HKEY); return null; }   // generous TTL: slow-3G detail loads can pass 5s
      return h;
    } catch (e) { return null; }
  }

  // Called on the DETAIL page once the hero <img> is in the (visible) DOM.
  // Returns true if it owns the hero reveal (caller should then skip blur-up
  // for this element), false if there's no fresh handoff to play.
  function playArrival(heroImg, id) {
    if (reduce || !heroImg) return false;
    var h = readHandoff(id);
    if (!h) return false;
    try { sessionStorage.removeItem(HKEY); } catch (e) {}   // one-shot
    heroImg.__bu = 1;                                        // claim it from blur-up

    var started = false;
    function start() {
      if (started) return;
      started = true;
      var n = heroImg.getBoundingClientRect();
      if (!n.width || !n.height) { heroImg.style.opacity = ''; return; }
      var sx = h.rect.width / n.width, sy = h.rect.height / n.height;
      var dx = h.rect.left - n.left, dy = h.rect.top - n.top;
      heroImg.style.transformOrigin = 'top left';
      heroImg.style.transition = 'none';
      heroImg.style.opacity = '1';
      heroImg.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
      heroImg.style.willChange = 'transform';
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        heroImg.style.transition = 'transform .62s ' + EASE;
        heroImg.style.transform = '';
        heroImg.addEventListener('transitionend', function te() {
          heroImg.style.transition = ''; heroImg.style.willChange = '';
          heroImg.style.transformOrigin = ''; heroImg.style.transform = '';
          heroImg.removeEventListener('transitionend', te);
        }, { once: true });
      }); });
    }
    if (heroImg.complete && heroImg.naturalWidth > 0) start();
    else {
      heroImg.addEventListener('load', start, { once: true });
      setTimeout(start, 350);                                // don't wait forever
    }
    return true;
  }

  // ── public API ─────────────────────────────────────────────────────────
  window.BoomElevate = {
    scan: scan,
    blurUp: blurUp,
    flipCapture: flipCapture,
    captureHandoff: captureHandoff,
    playArrival: playArrival,
    reduce: reduce
  };

  // Auto-enhance any static [data-blur-up] already in the document.
  if (document.readyState !== 'loading') scan(document);
  else document.addEventListener('DOMContentLoaded', function () { scan(document); }, { once: true });
})();
