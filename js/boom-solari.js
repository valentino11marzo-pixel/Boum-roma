/* ════════════════════════════════════════════════════════════════════════
   BOOM Solari — split-flap typography engine.

   The Solari split-flap board (Gino Valle, Compasso d'Oro 1962 — the
   departures board of Fiumicino and Termini) as brand typography. No new
   elements are added to a page: existing text BECOMES the board.

   On the home:
   - #flapWord ("DAYS" in the hero title) settles on load, then quietly
     alternates DAYS ⇄ 48H every 9s;
   - every element with [data-flap] (the four hero stats) becomes a board
     and flips to its value in a load ceremony, then every 14s one random
     cell does the famous empty "clack" of idle station boards.

   Mechanics of record (v3): two static half-cells + two 3D leaves driven
   by animationend (with hidden-tab failsafes) — no blind timers, no
   desyncs; short drums so characters never visibly teleport; mid-spin
   retargeting continues the roll toward the new word without stopping.

   Cell CSS lives in the host page (.fc block). Reduced motion → values
   are set instantly, nothing ever cycles. Sets data-counted="1" on stat
   elements so the page's count-up animation leaves the boards alone.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DRUM_WORD = ' DAYS48H';
  var DRUM_NUM = ' 0123456789HMIN€%';

  function Cell(host) {
    var el = document.createElement('span');
    el.className = 'fc';
    el.innerHTML = '<i class="st"><b></b></i><i class="sb"><b></b></i><i class="lt"><b></b></i><i class="lb"><b></b></i>';
    host.appendChild(el);
    this.st = el.children[0].firstChild;
    this.sb = el.children[1].firstChild;
    this.ltEl = el.children[2]; this.lt = this.ltEl.firstChild;
    this.lbEl = el.children[3]; this.lb = this.lbEl.firstChild;
    this.cur = ' ';
    this.busy = false;
    this.pending = ' ';
    this.turns = 0;
    this.set(' ');
  }
  Cell.prototype.set = function (c) {
    this.cur = c; this.pending = c;
    this.st.textContent = c;
    this.sb.textContent = c;
  };
  Cell.prototype.next = function (drum) {
    /* next drum character toward pending; long trips are shortened to
       the final 4 clicks so the roll never drags */
    var i = drum.indexOf(this.cur); if (i < 0) i = 0;
    var j = drum.indexOf(this.pending); if (j < 0) j = 0;
    var d = (j - i + drum.length) % drum.length;
    if (d === 0) return null;
    if (d > 5) return drum[(j - 4 + drum.length) % drum.length];
    return drum[(i + 1) % drum.length];
  };
  Cell.prototype.step = function (nc, done) {
    /* one mechanical click: the top half already shows the incoming
       character, the top leaf folds down, the bottom leaf drops in and
       settles with a micro-bounce */
    var self = this, fired = false;
    function finishTop() {
      if (fired) return; fired = true;
      self.ltEl.onanimationend = null;
      self.ltEl.style.display = 'none';
      self.ltEl.style.animation = '';
      var fired2 = false;
      function finishBot() {
        if (fired2) return; fired2 = true;
        self.lbEl.onanimationend = null;
        self.sb.textContent = nc;
        self.lbEl.style.display = 'none';
        self.lbEl.style.animation = '';
        self.cur = nc;
        done();
      }
      self.lbEl.style.display = 'block';
      self.lbEl.style.animation = 'flBot 150ms cubic-bezier(.3,1.35,.6,1) forwards';
      self.lbEl.onanimationend = finishBot;
      setTimeout(finishBot, 400);            /* failsafe: hidden tab */
    }
    this.st.textContent = nc;
    this.lt.textContent = this.cur;
    this.lb.textContent = nc;
    this.ltEl.style.display = 'block';
    this.ltEl.style.animation = 'flTop 90ms cubic-bezier(.55,0,.85,.36) forwards';
    this.ltEl.onanimationend = finishTop;
    setTimeout(finishTop, 300);              /* failsafe */
  };
  Cell.prototype.go = function (target, drum, fullTurn) {
    this.pending = target;
    if (fullTurn && !this.busy) this.turns = 1;
    if (this.busy) return;
    var self = this;
    this.busy = true;
    (function run() {
      var nc = self.next(drum);
      if (nc === null && self.turns > 0) {   /* idle clack: one forced click, then home */
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

  function Board(host, len, drum) {
    host.textContent = '';
    host.classList.add('flap-scale');
    this.cells = [];
    this.drum = drum;
    for (var i = 0; i < len; i++) this.cells.push(new Cell(host));
  }
  Board.prototype.show = function (word, stagger, spin) {
    var self = this;
    this.cells.forEach(function (c, i) {
      var ch = word[i] || ' ';
      if (!spin) { c.set(ch); return; }
      /* slight jitter: the cascade sounds mechanical, not robotic */
      setTimeout(function () { c.go(ch, self.drum); },
        i * (stagger || 90) + Math.random() * 26);
    });
  };
  Board.prototype.flutter = function () {
    var c = this.cells[Math.floor(Math.random() * this.cells.length)];
    if (c && !c.busy && c.cur !== ' ') c.go(c.cur, this.drum, true);
  };

  function boot() {
    var word = document.getElementById('flapWord');
    var statEls = Array.prototype.slice.call(document.querySelectorAll('[data-flap]'));
    if (!word && !statEls.length) return;

    var wordBoard = word ? new Board(word, 4, DRUM_WORD) : null;
    var boards = statEls.map(function (el) {
      el.dataset.counted = '1';              /* keep the count-up animation off the board */
      return new Board(el, el.dataset.flap.length, DRUM_NUM);
    });

    if (reduced) {
      if (wordBoard) wordBoard.show('DAYS');
      boards.forEach(function (b, i) { b.show(statEls[i].dataset.flap); });
      return;
    }

    /* load ceremony: the word first, then the stats in cascade */
    if (wordBoard) setTimeout(function () { wordBoard.show('DAYS', 110, true); }, 500);
    boards.forEach(function (b, i) {
      setTimeout(function () { b.show(statEls[i].dataset.flap, 80, true); }, 1250 + i * 240);
    });

    /* quiet state: rare, meaningful events only */
    if (wordBoard) {
      var wi = 0, WORDS = ['DAYS', '48H '];
      setInterval(function () {
        if (document.hidden) return;
        wi = (wi + 1) % WORDS.length;
        wordBoard.show(WORDS[wi], 110, true);
      }, 9000);
    }
    if (boards.length) {
      setInterval(function () {
        if (document.hidden) return;
        boards[Math.floor(Math.random() * boards.length)].flutter();
      }, 14000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.BoomSolari = { Cell: Cell, Board: Board };
})();
