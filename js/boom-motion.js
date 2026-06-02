/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Motion Layer  —  js/boom-motion.js
   Drop-in premium motion for any BOOM page. Include once, near </body>:
       <script defer src="/js/boom-motion.js"></script>

   What it does (all additive, all conflict-safe, all reduced-motion aware):
     1. Smooth inertia scroll (Lenis, lazy-loaded from CDN, degrades to native)
     2. Pill shape + gold sheen sweep + magnetic pull on standard CTA buttons
     3. Count-up on numbers (opt-in: [data-countup] or known stat classes)

   Design rules:
     • Never hides content. Never controls opacity of reveal systems (each page
       owns its own .reveal/.active/.v/.is-on logic — we don't touch it).
     • Idempotent: safe to load twice; skips elements already enhanced.
     • Skips any element that already opts into its own motion (.magnetic-btn).
     • Respects prefers-reduced-motion and pointer:coarse (no magnetic on touch).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__boomMotion) return;            // idempotent guard
  window.__boomMotion = true;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover)').matches;
  var EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

  // Standard CTA button classes seen across BOOM pages. Toggle/icon buttons
  // (.vt-btn, .mobile-menu-btn, .tp-maint-btn, .nav-cta, .hero-cta) are left out
  // on purpose. Pages with their own magnetic system (.magnetic-btn) are skipped.
  var BTN = '.btn,.btn-primary,.btn-secondary,.btn-ghost,.btn-gold,.btn-outline,'
          + '.btn-submit,.cta-primary,.cta-secondary,.nbtn,.nbtn-primary,'
          + '.whatsapp-btn,.btn-whatsapp';

  // ── Inject styles (last in <head> so single-class rules win ties) ──────────
  var css =
    /* Lenis required styles */
    'html.lenis,html.lenis body{height:auto}' +
    '.lenis.lenis-smooth{scroll-behavior:auto !important}' +
    '.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain}' +
    '.lenis.lenis-stopped{overflow:hidden}' +
    /* Pill + sheen on enhanced buttons */
    '.boom-btn{position:relative;overflow:hidden;border-radius:100px !important;' +
       'will-change:transform}' +
    '.boom-btn::after{content:"";position:absolute;inset:0;pointer-events:none;' +
       'background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.40),transparent 70%);' +
       'transform:translateX(-130%);transition:transform .7s ' + EASE + '}' +
    '.boom-btn:hover::after{transform:translateX(130%)}';
  var style = document.createElement('style');
  style.setAttribute('data-boom-motion', '');
  style.textContent = css;
  document.head.appendChild(style);

  // ── 1) Smooth inertia scroll (Lenis) ──────────────────────────────────────
  function initLenis() {
    if (window.__boomLenis || reduce || typeof window.Lenis !== 'function') return;
    try {
      var l = new window.Lenis({
        duration: 1.1,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true
      });
      (function raf(time) { l.raf(time); requestAnimationFrame(raf); })();
      window.__boomLenis = l;
    } catch (e) { /* fall back to native scroll */ }
  }
  if (!reduce) {
    if (typeof window.Lenis === 'function') {
      initLenis();
    } else {
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/lenis@1.1.13/dist/lenis.min.js';
      s.async = true;
      s.onload = initLenis;
      document.head.appendChild(s);
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  // ── 2) Buttons: pill + sheen + magnetic ────────────────────────────────────
  function enhanceButtons() {
    var nodes = document.querySelectorAll(BTN);
    Array.prototype.forEach.call(nodes, function (btn) {
      if (btn.classList.contains('boom-btn')) return;          // already done
      if (btn.classList.contains('magnetic-btn')) return;      // page owns it
      btn.classList.add('boom-btn');                            // pill + sheen

      if (reduce || !canHover) return;                          // magnetic: desktop only
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2;
        var y = e.clientY - r.top - r.height / 2;
        btn.style.transform = 'translate(' + (x * 0.2) + 'px,' + (y * 0.3) + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  // ── 3) Count-up ─────────────────────────────────────────────────────────────
  // Opt-in via [data-countup], plus common stat-value classes. Only touches
  // elements with no child elements whose text starts/contains a single integer.
  var COUNT = '[data-countup],.hero-stat-value,.feature-stat-value,.stat-value,'
            + '.stat-number,.stat-num,.metric-value';

  function countUp(el) {
    if (el.dataset.counted || el.childElementCount > 0) return;
    var text = (el.dataset.final || el.textContent).trim();
    el.dataset.final = text;
    var m = text.match(/^(\D*)(\d+)(.*)$/);
    if (!m) return;
    el.dataset.counted = '1';
    var pre = m[1], end = parseInt(m[2], 10), suf = m[3];
    if (reduce || end === 0) { el.textContent = text; return; }
    var dur = 1300, t0 = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.round(end * e) + suf;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function setupCounts() {
    var nodes = document.querySelectorAll(COUNT);
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(nodes, countUp);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { countUp(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    Array.prototype.forEach.call(nodes, function (el) { io.observe(el); });
  }

  ready(function () { enhanceButtons(); setupCounts(); });
})();
