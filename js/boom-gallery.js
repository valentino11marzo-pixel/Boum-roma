/* ═══════════════════════════════════════════════════════════════════════
   BOOM · Gallery lightbox  —  js/boom-gallery.js
   Drop-in fullscreen viewer for property photos. Include near </body>:
       <script defer src="/js/boom-gallery.js"></script>

   Click any gallery image → fullscreen overlay with ‹ › arrows, counter,
   Esc/backdrop/× to close, keyboard nav. Self-injecting, idempotent,
   skips images wrapped in links. No dependency, no markup changes.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__boomGallery || !document.body) return;

  var set = [];
  ['.gallery-image', '.hero-gallery img', '.gallery img'].forEach(function (sel) {
    [].forEach.call(document.querySelectorAll(sel), function (im) {
      if (set.indexOf(im) === -1 && !(im.closest && im.closest('a'))) set.push(im);
    });
  });
  if (!set.length) return;
  window.__boomGallery = true;

  var srcs = set.map(function (im) { return im.getAttribute('src') || im.currentSrc || im.src; });

  var st = document.createElement('style');
  st.textContent =
    '.gallery-image,.hero-gallery img,.gallery img{cursor:zoom-in}' +
    '.boom-lb{position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,.94);display:none;align-items:center;justify-content:center;opacity:0;transition:opacity .3s;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}' +
    '.boom-lb.open{display:flex;opacity:1}' +
    '.boom-lb img{max-width:92vw;max-height:86vh;border-radius:8px;box-shadow:0 30px 90px rgba(0,0,0,.6)}' +
    '.boom-lb button{position:absolute;background:rgba(0,0,0,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(255,215,0,.25);color:#fff;width:46px;height:46px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color .25s,background .25s}' +
    '.boom-lb button:hover{border-color:#FFD700;background:rgba(0,0,0,.7)}' +
    '.boom-lb .lb-x{top:18px;right:18px}.boom-lb .lb-p{left:18px;top:50%;transform:translateY(-50%)}.boom-lb .lb-n{right:18px;top:50%;transform:translateY(-50%)}' +
    '.boom-lb .lb-c{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.7);font-size:12px;letter-spacing:2px;font-variant-numeric:tabular-nums}' +
    '@media(max-width:600px){.boom-lb .lb-p,.boom-lb .lb-n{top:auto;bottom:22px;transform:none}.boom-lb .lb-p{left:18px}.boom-lb .lb-n{right:18px}.boom-lb .lb-c{bottom:74px}}';
  document.head.appendChild(st);

  var lb = document.createElement('div');
  lb.className = 'boom-lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Photo viewer');
  lb.innerHTML = '<button class="lb-x" aria-label="Close">×</button>' +
    '<button class="lb-p" aria-label="Previous">‹</button>' +
    '<img alt="">' +
    '<button class="lb-n" aria-label="Next">›</button>' +
    '<div class="lb-c"></div>';
  document.body.appendChild(lb);

  var lbImg = lb.querySelector('img'), lbC = lb.querySelector('.lb-c'), idx = 0;
  function show(i) { idx = (i + srcs.length) % srcs.length; lbImg.src = srcs[idx]; lbC.textContent = (idx + 1) + ' / ' + srcs.length; }
  function open(i) { show(i); lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }

  set.forEach(function (im, i) { im.addEventListener('click', function () { open(i); }); });
  lb.querySelector('.lb-x').addEventListener('click', close);
  lb.querySelector('.lb-p').addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
  lb.querySelector('.lb-n').addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
  });
})();
