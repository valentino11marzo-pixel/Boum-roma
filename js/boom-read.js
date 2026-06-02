/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Article reading experience  —  js/boom-read.js
   Drop-in for long-form pages (blog posts, guides). Include near </body>:
       <script defer src="/js/boom-read.js"></script>

   - Gold reading-progress bar (top) tracking scroll through the article.
   - Floating "back to top" button after the fold.
   Self-injecting (no markup needed), idempotent, reduced-motion aware.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__boomRead || !document.body) return;
  window.__boomRead = true;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var bar = document.createElement('div');
  bar.setAttribute('aria-hidden', 'true');
  bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0;z-index:2147483600;' +
    'background:linear-gradient(90deg,#E5C200,#FFD700,#FFE55C);box-shadow:0 0 10px rgba(255,215,0,.5);' +
    'transition:width .08s linear;pointer-events:none';
  document.body.appendChild(bar);

  var btt = document.createElement('button');
  btt.type = 'button';
  btt.setAttribute('aria-label', 'Back to top');
  btt.textContent = '↑';
  btt.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483600;width:44px;height:44px;' +
    'border-radius:50%;border:1px solid rgba(255,215,0,.3);background:rgba(10,10,10,.72);' +
    '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#FFD700;font-size:18px;line-height:1;' +
    'cursor:pointer;opacity:0;transform:translateY(10px) scale(.9);transition:opacity .3s,transform .3s;pointer-events:none';
  btt.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  document.body.appendChild(btt);

  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0) + '%';
    var on = window.scrollY > 600;
    btt.style.opacity = on ? '1' : '0';
    btt.style.transform = on ? 'none' : 'translateY(10px) scale(.9)';
    btt.style.pointerEvents = on ? 'auto' : 'none';
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();
})();
