/* BOOM Flight Next — original Solari, isolated for the independent proposal.
 * Cells: design/pages-deco/solari-engine.html (mechanics unchanged; timers cancellable).
 * Field: index.html cartaRoma() (same cell grid, tides, crest and 8.2s pulse).
 * The lifecycle owns one RAF; there is no second decorative animation clock.
 */
(function () {
  'use strict';
  if (window.BoomFlightNextMotion) { window.BoomFlightNextMotion.boot(); return; }

/* ══════════════════════════════════════════════════════════════════════════
   BOOM SOLARI — il motore a palette (Gino Valle, 1962), meccanica v3:
   due mezze celle statiche + due ante 3D guidate da animationend, rulli
   corti (mai teletrasporti), retargeting a metà giro, failsafe per la
   scheda nascosta. Qui esporta soltanto: la regia è del Terminale.
   ══════════════════════════════════════════════════════════════════════════ */
function createSolari() {
  'use strict';
  var timers = new Set();
  function schedule(fn, delay) {
    var id = setTimeout(function () { timers.delete(id); fn(); }, delay);
    timers.add(id); return id;
  }
  function cancel() { timers.forEach(clearTimeout); timers.clear(); }
  function Cell(host) {
    var el = document.createElement('span');
    el.className = 'fc2';
    el.innerHTML = '<i class="st"><b></b></i><i class="sb"><b></b></i><i class="lt"><b></b></i><i class="lb"><b></b></i><s></s>';
    host.appendChild(el);
    this.st = el.children[0].firstChild;
    this.sb = el.children[1].firstChild;
    this.ltEl = el.children[2]; this.lt = this.ltEl.firstChild;
    this.lbEl = el.children[3]; this.lb = this.lbEl.firstChild;
    this.cur = ' '; this.busy = false; this.pending = ' '; this.turns = 0;
    this.set(' ');
  }
  Cell.prototype.set = function (c) {
    this.cur = c; this.pending = c;
    this.st.textContent = c; this.sb.textContent = c;
  };
  Cell.prototype.next = function (drum) {
    var i = drum.indexOf(this.cur); if (i < 0) i = 0;
    var j = drum.indexOf(this.pending); if (j < 0) j = 0;
    var d = (j - i + drum.length) % drum.length;
    if (d === 0) return null;
    if (d > 2) return drum[(j - 1 + drum.length) % drum.length];
    return drum[(i + 1) % drum.length];
  };
  Cell.prototype.step = function (nc, done) {
    var self = this, fired = false;
    function finishTop() {
      if (fired) return; fired = true;
      self.ltEl.onanimationend = null;
      self.ltEl.style.display = 'none'; self.ltEl.style.animation = '';
      var fired2 = false;
      function finishBot() {
        if (fired2) return; fired2 = true;
        self.lbEl.onanimationend = null;
        self.sb.textContent = nc;
        self.lbEl.style.display = 'none'; self.lbEl.style.animation = '';
        self.cur = nc; done();
      }
      self.lbEl.style.display = 'block';
      /* Safari spesso NON spara animationend quando l'animazione nasce
         nello stesso frame del display:block: reflow forzato, e il timer
         di riserva va al passo VERO dell'animazione (prima 400ms: ogni
         flip su Safari durava il triplo, e il tabellone «caricava due
         volte») */
      void self.lbEl.offsetWidth;
      self.lbEl.style.animation = 'nextSolariBottom 150ms cubic-bezier(.3,1.35,.6,1) forwards';
      self.lbEl.onanimationend = finishBot;
      schedule(finishBot, 210);
    }
    this.st.textContent = nc;
    this.lt.textContent = this.cur;
    this.lb.textContent = nc;
    this.ltEl.style.display = 'block';
    void this.ltEl.offsetWidth;
    this.ltEl.style.animation = 'nextSolariTop 90ms cubic-bezier(.55,0,.85,.36) forwards';
    this.ltEl.onanimationend = finishTop;
    schedule(finishTop, 140);
  };
  Cell.prototype.go = function (target, drum, fullTurn) {
    this.pending = target;
    if (fullTurn && !this.busy) this.turns = 1;
    if (this.busy) return;
    var self = this;
    this.busy = true;
    (function run() {
      var nc = self.next(drum);
      if (nc === null && self.turns > 0) {
        self.turns = 0;
        var i = drum.indexOf(self.cur);
        nc = drum[(i + 1) % drum.length];
        self.pending = drum[i];
        self.step(nc, run);
        return;
      }
      if (nc === null) { self.busy = false; return; }
      self.step(nc, run);
    })();
  };

  var measurer = document.createElement('canvas').getContext('2d');
  function calibrate(host, drum) {
    var cs = getComputedStyle(host);
    var fs = parseFloat(cs.fontSize);
    measurer.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var chPx = 1.26 * fs;
    var m = measurer.measureText('H');
    var fa = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : m.actualBoundingBoxAscent * 1.25;
    var fd = m.fontBoundingBoxDescent !== undefined ? m.fontBoundingBoxDescent : m.actualBoundingBoxAscent * 0.25;
    var baseline = (chPx + fa - fd) / 2;
    var shift = chPx / 2 - (baseline - m.actualBoundingBoxAscent / 2);
    var maxW = 0;
    for (var i = 0; i < drum.length; i++) {
      var w = measurer.measureText(drum[i]).width;
      if (w > maxW) maxW = w;
    }
    host.style.setProperty('--gs', shift.toFixed(2) + 'px');
    host.style.setProperty('--cw', ((maxW + fs * 0.24) / fs).toFixed(4) + 'em');
  }

  function Board(host, len, drum) {
    host.textContent = '';
    host.classList.add('flap-scale');
    calibrate(host, drum);
    this.cells = [];
    this.drum = drum;
    for (var i = 0; i < len; i++) this.cells.push(new Cell(host));
  }
  Board.prototype.show = function (word, stagger, spin) {
    var self = this;
    this.cells.forEach(function (c, i) {
      var ch = word[i] || ' ';
      if (!spin) { c.set(ch); return; }
      schedule(function () { c.go(ch, self.drum); },
        i * (stagger || 90) + Math.random() * 26);
    });
  };
  Board.prototype.update = function (word) {   /* flippa solo le celle cambiate */
    var self = this;
    this.cells.forEach(function (c, i) {
      var ch = word[i] || ' ';
      if (c.cur !== ch || c.pending !== ch) c.go(ch, self.drum);
    });
  };
  Board.prototype.giro = function (stagger) {
    /* il giro dell'insegna: ogni cella rifa' TUTTO il tamburo e riatterra
       sulla SUA lettera — la vita dei tabelloni veri, mai una parola
       diversa (la parola del titolo e' una promessa: non si cambia) */
    var self = this;
    this.cells.forEach(function (c, i) {
      if (c.cur === ' ') return;
      schedule(function () { c.go(c.cur, self.drum, true); },
        i * (stagger || 90) + Math.random() * 26);
    });
  };
  Board.prototype.flutter = function () {
    var c = this.cells[Math.floor(Math.random() * this.cells.length)];
    if (c && !c.busy && c.cur !== ' ') c.go(c.cur, this.drum, true);
  };

  return { Cell: Cell, Board: Board, calibrate: calibrate, cancel: cancel, schedule: schedule };
}

  var instance = null, manuallyPaused = false;
  function boot() {
    if (instance) return instance;
    var hero = document.getElementById('nextHero');
    var tela = document.getElementById('nextSolariField');
    var host = document.getElementById('nextDestinationBoard');
    if (!hero || !tela || !host || !hero.contains(tela) || !hero.contains(host)) return null;
    var ctx = tela.getContext && tela.getContext('2d');
    if (!ctx) return null; // The server-rendered ROME remains readable.
    var reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    var mobileQuery = matchMedia('(max-width: 640px)');
    var ridotto = reduceQuery.matches, mob = mobileQuery.matches;
    var clock = 0, lastFrame = 0, lastPaint = -1000, raf = 0;
    var running = false, inView = false, suspended = false, destroyed = false;
    var resizeTimer = 0, observer = null, resizeObserver = null, played = false;
    var listeners = [];
    var solari = createSolari();
    var drum = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var board = new solari.Board(host, 4, drum);
    host.setAttribute('aria-label', 'Rome');
    host.setAttribute('role', 'img');
    board.show('ROME', 0, false);
    Array.prototype.forEach.call(host.children, function (cell) { cell.setAttribute('aria-hidden', 'true'); });
    var ORO = '255,215,0', LATTE = '250,248,240', VERDE = '0,255,136';
    var W, H, DPR, MIN, cw, ch, gap, cols, rows, E, AU, AV, basetela;
    /* il velo verticale, cotto nell'alpha: niente mask-image al compositor */
    function velo(y) {
      var q = y / H;
      return q < .72 ? 1 : Math.max(0, (0.98 - q) / .26);
    }
    function misura() {
      var r = tela.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      mob = mobileQuery.matches;
      /* tetto d'area: nitido dove serve, mai un canvas mostruoso */
      DPR = Math.min(devicePixelRatio || 1, 2,
        Math.max(1, Math.sqrt(2.3e6 / Math.max(1, r.width * r.height))));
      W = Math.round(r.width * DPR); H = Math.round(r.height * DPR);
      tela.width = W; tela.height = H; MIN = Math.min(W, H);
      cw = Math.round((mob ? 30 : 40) * DPR); ch = Math.round(cw * .68);
      gap = Math.round(7 * DPR);
      cols = Math.ceil(W / (cw + gap)) + 1;
      rows = Math.ceil(H / (ch + gap)) + 1;
      E = new Float32Array(cols * rows);
      AU = new Float32Array(cols * rows);
      AV = new Float32Array(cols * rows);
      /* lo strato base è un canvas SOTTO, composto dal browser:
         non si ricopia mai — ogni frame disegna solo le celle accese */
      basetela = document.createElement('canvas');
      basetela.width = W; basetela.height = H;
      var bg = basetela.getContext('2d');
      for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) {
        var vy = velo(r2 * (ch + gap));
        if (vy <= 0) continue;
        bg.fillStyle = 'rgba(' + LATTE + ',' + (.031 * vy) + ')';
        bg.beginPath();
        bg.roundRect(c2 * (cw + gap), r2 * (ch + gap), cw, ch, 3 * DPR);
        bg.fill();
      }
      return true;
    }
    var px = -1e4, py = -1e4, onde = [];
    function localizza(e) {
      var r = tela.getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * DPR, y: (p.clientY - r.top) * DPR };
    }
    var fretta = 0;
    function muovi(e) { if (!running || ridotto) return; var p = localizza(e); px = p.x; py = p.y;
      fretta = performance.now(); }
    var scorsa = 0, spinta = 0;
    function scorri() {
      if (!running || ridotto) return;
      fretta = performance.now();
      spinta = Math.min(1, Math.abs(scrollY - scorsa) / 130);
      scorsa = scrollY;
    }
    function tocca(e) {
      var p = localizza(e); fretta = performance.now();
      if (!running || ridotto || p.x < 0 || p.x > W || p.y < 0 || p.y > H) return;
      onde.push({ x: p.x, y: p.y, via: clock });
      if (onde.length > 4) onde.shift();
    }
    var battito = 700, flip = 2200, casc = [];
    function vita(t) {
      ctx.clearRect(0, 0, W, H);
      /* il battito del mosaico, anche in cima: l'anello dal cuore */
      if (!ridotto && t > battito) {
        onde.push({ x: W * (mob ? .5 : .56), y: H * .42,
          via: t, batte: true });
        if (onde.length > 4) onde.shift();
        battito = t + 8200;
      }
      /* la cascata di colonna: una riga del tabellone che si aggiorna —
         le palette scattano dall'alto in basso, a volte in verde */
      if (!ridotto && t > flip) {
        casc.push({ c: Math.floor(Math.random() * cols), via: t,
          verde: Math.random() < .32 });
        if (casc.length > 3) casc.shift();
        flip = t + 4600 + Math.random() * 3800;
      }
      for (var ci = 0; ci < casc.length; ci++) {
        var ca = casc[ci], testa = (t - ca.via) / 46;
        if (testa > rows + 3) continue;
        var da2 = Math.max(0, Math.floor(testa) - 2);
        var fino = Math.min(rows - 1, Math.floor(testa));
        for (var rr = da2; rr <= fino; rr++) {
          var ii = rr * cols + ca.c, forza = 1 - (testa - rr) / 3;
          if (forza <= 0) continue;
          if (ca.verde) AV[ii] = Math.max(AV[ii], forza * .8);
          else AU[ii] = Math.max(AU[ii], forza * .85);
          E[ii] = Math.max(E[ii], forza);
        }
      }
      /* i tempi giusti: su mobile lo schermo è corto — l'onda cammina
         più svelta perché il viaggio duri uguale all'occhio */
      var vel = mob ? 1.45 : 1;
      var f1 = ridotto ? W * .6
        : ((t * .00009 * vel) % 1.6) * (W + H) - H * .4;
      var f2 = ridotto ? -1
        : (1 - (t * .00005 * vel) % 1.6) * (W + H) - H * .4;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var x = c * (cw + gap) + cw / 2, y = r * (ch + gap) + ch / 2;
        var i = r * cols + c;
        var v1 = Math.max(0, 1 - Math.abs((x + y * .82) - f1) / (MIN * .34));
        var v2 = Math.max(0, 1 - Math.abs((x - y * .6 + H * .6) - f2) / (MIN * .5));
        var vm = Math.max(0, 1 - Math.hypot(x - px, y - py) / (MIN * .26));
        /* lo scroll spinge un fronte orizzontale attraverso il campo */
        var fs = H * .3 + scorsa * DPR * .85;
        var vs = spinta * Math.max(0, 1 - Math.abs(y - fs) / (MIN * .16));
        E[i] = Math.max(E[i], v1 * v1 * .9, v2 * v2 * .35, vm * vm, vs);
        if (v1 > .96) { var brillo = Math.random();
          if (brillo < .0045) AU[i] = .9;
          else if (brillo < .006) AV[i] = .85; }
        for (var oi = 0; oi < onde.length; oi++) {
          var od = onde[oi];
          /* il battito ha il passo del mosaico: lento, maestoso */
          var eta = (t - od.via) / (od.batte ? 3000 : 900);
          if (eta > 1.4) continue;
          var da = Math.abs(Math.hypot(x - od.x, y - od.y)
            - eta * MIN * (od.batte ? 1.05 : .5));
          var vo = Math.max(0, 1 - da / (MIN * (od.batte ? .12 : .09)));
          E[i] = Math.max(E[i], vo * (1.2 - eta));
          if (od.batte) {
            /* la banda piena del mosaico, alzata: una CRESTA stretta e
               incandescente guida l'onda, la banda dietro tiene l'oro
               piu' a lungo, e la corsa attraversa TUTTO il campo invece
               di morire a meta' — un battito, di quelli che si sentono */
            var vc = Math.max(0, 1 - da / (MIN * .035));
            E[i] = Math.max(E[i], vc * 1.15 * (1 - eta * .3));
            AU[i] = Math.max(AU[i],
              vo * vo * (1 - eta * .35) * .9,
              vc * (1 - eta * .25));
          } else if (vo > .9 && Math.random() < .015) AU[i] = .8;
        }
      }
      var dtv = Math.min(80, t - (vita.prima || t)); vita.prima = t;
      var kdec = Math.pow(.9, dtv / 16.7);
      spinta *= kdec;
      for (var k = 0; k < E.length; k++) {
        E[k] *= kdec; AU[k] *= kdec; AV[k] *= kdec;
        if (E[k] < .003) E[k] = 0;
        if (AU[k] < .003) AU[k] = 0;
        if (AV[k] < .003) AV[k] = 0;
      }
      ctx.drawImage(basetela, 0, 0);
      for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) {
        var i2 = r2 * cols + c2;
        if (E[i2] < .02 && AU[i2] < .05 && AV[i2] < .06) continue;
        var x2 = c2 * (cw + gap), y2 = r2 * (ch + gap);
        var vy2 = velo(y2);
        if (vy2 <= 0) continue;
        ctx.fillStyle = AV[i2] > .06
          ? 'rgba(' + VERDE + ',' + (AV[i2] * .32 * vy2) + ')'
          : AU[i2] > .05
            ? 'rgba(' + ORO + ',' + (AU[i2] * .5 * vy2) + ')'
            : 'rgba(' + LATTE + ',' + (E[i2] * .13 * vy2) + ')';
        ctx.beginPath();
        ctx.roundRect(x2, y2, cw, ch, 3 * DPR);
        ctx.fill();
        if (E[i2] > .14 || AU[i2] > .1 || AV[i2] > .1) {
          ctx.fillStyle = 'rgba(3,3,3,.55)';
          ctx.fillRect(x2, y2 + ch * .48, cw, Math.max(1, DPR));
        }
      }
    }

    function listen(target, event, fn, options) {
      target.addEventListener(event, fn, options);
      listeners.push(function () { target.removeEventListener(event, fn, options); });
    }
    function settleBoard() {
      solari.cancel();
      board.cells.forEach(function (cell, i) {
        cell.ltEl.onanimationend = null; cell.lbEl.onanimationend = null;
        cell.ltEl.style.animation = ''; cell.lbEl.style.animation = '';
        cell.ltEl.style.display = 'none'; cell.lbEl.style.display = 'none';
        cell.busy = false; cell.turns = 0; cell.set('ROME'[i]);
      });
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0; lastFrame = 0;
      settleBoard();
      hero.dataset.nextMotion = ridotto ? 'reduced' : 'paused';
    }
    function frame(t) {
      raf = 0;
      if (!running) return;
      if (lastFrame) clock += Math.min(80, t - lastFrame);
      lastFrame = t;
      // Original pacing: quiet 30fps; a gesture opens the full frame rate.
      if (t - fretta <= 500 || t - lastPaint >= 28) {
        lastPaint = t; vita(clock);
      }
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      if (destroyed) return;
      if (manuallyPaused || suspended || document.hidden || !inView || ridotto || !W || !H) { stop(); return; }
      if (running) return;
      running = true; lastFrame = 0; lastPaint = -1000;
      hero.dataset.nextMotion = 'running';
      if (!played) solari.schedule(function () {
        if (!running || ridotto) return;
        played = true; board.giro(65);
      }, 350);
      raf = requestAnimationFrame(frame);
    }
    function staticField() {
      var preference = ridotto;
      ridotto = true; onde = []; casc = []; vita.prima = 0; vita(0);
      ridotto = preference;
    }
    function visibility() {
      var rect = hero.getBoundingClientRect();
      inView = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      sync();
    }
    function resize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeTimer = 0;
        if (destroyed) return;
        if (misura()) { staticField(); solari.calibrate(host, drum); }
        visibility();
      }, 140);
    }
    function changeMotion() {
      ridotto = reduceQuery.matches;
      stop();
      if (W && H) staticField();
      sync();
    }
    function leave() { px = -1e4; py = -1e4; }
    if (misura()) staticField();
    listen(hero, 'pointermove', muovi, { passive: true });
    listen(hero, 'pointerdown', tocca, { passive: true });
    listen(hero, 'pointerleave', leave, { passive: true });
    listen(window, 'scroll', function () { scorri(); if (!observer) visibility(); }, { passive: true });
    listen(window, 'resize', resize, { passive: true });
    listen(document, 'visibilitychange', sync);
    listen(window, 'pagehide', function () { suspended = true; stop(); clearTimeout(resizeTimer); });
    listen(window, 'pageshow', function () { suspended = false; visibility(); });
    if (reduceQuery.addEventListener) listen(reduceQuery, 'change', changeMotion);
    else { reduceQuery.addListener(changeMotion); listeners.push(function () { reduceQuery.removeListener(changeMotion); }); }
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting; sync();
      }, { threshold: .04 });
      observer.observe(hero);
    }
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(hero);
    }
    instance = {
      setPaused: function (paused) {
        manuallyPaused = Boolean(paused);
        sync();
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true; stop(); clearTimeout(resizeTimer);
        if (observer) observer.disconnect();
        if (resizeObserver) resizeObserver.disconnect();
        listeners.forEach(function (remove) { remove(); });
        instance = null;
      }
    };
    visibility();
    return instance;
  }
  window.BoomFlightNextMotion = {
    boot: boot,
    setPaused: function (paused) {
      manuallyPaused = Boolean(paused);
      if (instance) instance.setPaused(manuallyPaused);
    },
    destroy: function () { if (instance) instance.destroy(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
