#!/usr/bin/env python3
# PFS 5.0 — LA REGIA DEL VOLO: l'esperienza immersiva sopra l'architettura
# provata. UNA tesi, non effetti sparsi: la pagina È il volo ABROAD→ROME.
#  - il FILO: una rotta d'oro fissa sul bordo (desktop) che si riempie
#    con lo scroll, l'aereo che ti accompagna, le tappe che si accendono;
#  - il MONTAGGIO: alla cassa il biglietto si assembla davanti a te
#    (lamina→campi→strappo→talloncino), una volta sola;
#  - i VERDETTI: la tabella anti-truffa emette le righe in sequenza;
#  - LA ZECCA: il pass campione col TUO nome — Wallet vero, da
#    screenshottare (il gancio virale onesto: resta marcato DEMO).
# Tutto additivo e degradabile: senza JS niente si nasconde, con
# reduced-motion niente si muove, sotto i 1280px il filo non esiste.
import sys

FILES = ['design/pages-deco/pf-body.html', 'property-finding.html']


def uno(s, ago, f):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO in {f}: {n} occorrenze di {ago[:70]!r}')
        sys.exit(1)


CSS_ANCORA = '.identita a { color:var(--text-2); }'
CSS = CSS_ANCORA + '''

/* ══ PFS 5.0 · LA REGIA DEL VOLO ══════════════════════════════════════ */
/* il filo: la rotta della pagina, fissa, solo desktop largo */
.rotta-filo { position:fixed; left:30px; top:18px; bottom:18px; width:18px;
  z-index:5; pointer-events:none; opacity:0; transition:opacity 1s ease; }
body.volo-on .rotta-filo { opacity:1; }
.rotta-filo::before { content:''; position:absolute; left:8.5px; top:0;
  bottom:0; width:1px; background:repeating-linear-gradient(180deg,
    rgba(250,250,250,.15) 0 5px, transparent 5px 10px); }
.rf-scia { position:absolute; left:8.5px; top:0; width:1px; height:0;
  background:linear-gradient(180deg, transparent, var(--gold));
  box-shadow:0 0 8px rgba(255,215,0,.25); }
.rf-aereo { position:absolute; left:1px; top:0; width:17px; height:17px; }
.rf-aereo svg { display:block; width:100%; height:100%;
  transform:rotate(180deg); fill:var(--gold);
  filter:drop-shadow(0 0 6px rgba(255,215,0,.4)); }
.rf-tappa { position:absolute; left:5.5px; width:7px; height:7px;
  border-radius:50%; background:var(--black);
  box-shadow:inset 0 0 0 1px rgba(250,250,250,.28);
  transition:background .5s ease, box-shadow .5s ease; }
.rf-tappa.passata { background:var(--gold);
  box-shadow:0 0 9px rgba(255,215,0,.55); }
@media (max-width:1279px), (prefers-reduced-motion:reduce) {
  .rotta-filo { display:none; } }

/* il montaggio del biglietto: armato SOLO dal JS, mai senza */
#ckForm.arma .ck-banda { transform:translateX(-110%); }
#ckForm.arma .ck-corpo > * { opacity:0; transform:translateY(12px); }
#ckForm.arma .ck-perf { opacity:0; }
#ckForm.arma .ck-stub { opacity:0; transform:translateX(9%); }
#ckForm.monta .ck-banda { transform:none;
  transition:transform .9s cubic-bezier(.26,1.16,.44,1); }
#ckForm.monta .ck-corpo > * { opacity:1; transform:none;
  transition:opacity .5s ease, transform .6s cubic-bezier(.22,1,.36,1); }
#ckForm.monta .ck-corpo > *:nth-child(1) { transition-delay:.18s; }
#ckForm.monta .ck-corpo > *:nth-child(2) { transition-delay:.3s; }
#ckForm.monta .ck-corpo > *:nth-child(3) { transition-delay:.42s; }
#ckForm.monta .ck-perf { opacity:1; transition:opacity .5s ease .55s; }
#ckForm.monta .ck-stub { opacity:1; transform:none;
  transition:opacity .6s ease .45s,
    transform .8s cubic-bezier(.26,1.16,.44,1) .45s; }

/* i verdetti della regola: le celle entrano in sequenza */
.regola2.arma > div { opacity:0; transform:translateY(9px); }
.regola2.viva > div { opacity:1; transform:none;
  transition:opacity .45s ease, transform .5s cubic-bezier(.22,1,.36,1); }

/* la zecca del pass: il nome sul biglietto Wallet */
.passmint { margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; }
.passmint input { flex:1 1 130px; min-width:0; padding:10px 13px;
  font:inherit; font-size:13px; color:var(--text);
  background:rgba(255,255,255,.04); border:0; border-radius:100px;
  box-shadow:inset 0 0 0 1px var(--line); outline:none;
  transition:box-shadow .3s ease; }
.passmint input:focus { box-shadow:inset 0 0 0 1px rgba(255,215,0,.5); }
.passmint a { flex:none; display:inline-flex; align-items:center;
  padding:10px 18px; font-size:12px; font-weight:700; color:#0A0A05;
  background:var(--gold); border-radius:100px; text-decoration:none;
  transition:transform .3s ease; }
.passmint a:active { transform:scale(.97); }'''

# il filo, nel markup: subito prima dell'hero
HERO_ANCORA = '<header class="pf-hero">'
FILO = '''<div class="rotta-filo" id="rottaFilo" aria-hidden="true">
  <span class="rf-scia"></span>
  <span class="rf-aereo"><svg viewBox="0 0 24 24"><path d="M21.5 15.5v-2l-8-5V3c0-.83-.67-1.5-1.5-1.5S10.5 2.17 10.5 3v5.5l-8 5v2l8-2.5v5.5l-2 1.5V21l3.5-1 3.5 1v-1.5l-2-1.5v-5.5l8 2.5z"/></svg></span>
</div>
''' + HERO_ANCORA

# la zecca al posto del semplice link del pass
MINT_A = '''        <a href="/api/pass-demo?type=viewing">Add a sample pass →</a>
        <small>On iPhone it opens straight into Wallet.</small>'''
MINT_B = '''        <div class="passmint">
          <input id="pmNome" maxlength="32" placeholder="Your first name"
            aria-label="Your name on the sample pass" autocomplete="given-name">
          <a id="pmVai" href="/api/pass-demo?type=viewing">Mint my pass →</a>
        </div>
        <small>On iPhone it opens straight into Wallet — with your name
          on it. It stays marked DEMO: a sample, not a booking.</small>'''

SCRIPT_ANCORA = '''</script>

<footer class="footer">'''
SCRIPT = '''</script>
<script>
/* PFS 5.0 · LA REGIA DEL VOLO — additiva e degradabile: senza JS nulla
   si nasconde, con reduced-motion nulla si muove. */
(function () {
  'use strict';
  var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function traccia(n, p) { try { gtag('event', n, p || {}); } catch (e) {} }

  /* la zecca: il nome finisce nel pass (sanificato anche lato server) */
  var pmN = document.getElementById('pmNome');
  var pmV = document.getElementById('pmVai');
  if (pmN && pmV) {
    pmN.addEventListener('input', function () {
      var v = pmN.value.replace(/[^\\p{L} '\\-.]/gu, '').trim().slice(0, 32);
      pmV.href = '/api/pass-demo?type=viewing'
        + (v ? '&name=' + encodeURIComponent(v) : '');
    });
    pmV.addEventListener('click', function () {
      traccia('pfs_pass_minted', { named: pmN.value.trim() ? 1 : 0 });
    });
  }

  /* il montaggio del biglietto, una volta sola */
  var form = document.getElementById('ckForm');
  if (form && !ridotto && 'IntersectionObserver' in window) {
    form.classList.add('arma');
    new IntersectionObserver(function (v, o) {
      if (!v.some(function (x) { return x.isIntersecting; })) return;
      o.disconnect();
      requestAnimationFrame(function () { form.classList.add('monta'); });
    }, { threshold: .25 }).observe(form);
  }

  /* i verdetti della regola, cella dopo cella */
  var reg = document.querySelector('.regola2');
  if (reg && !ridotto && 'IntersectionObserver' in window) {
    [].forEach.call(reg.children, function (c, i) {
      c.style.transitionDelay = (i * 55) + 'ms';
    });
    reg.classList.add('arma');
    new IntersectionObserver(function (v, o) {
      if (!v.some(function (x) { return x.isIntersecting; })) return;
      o.disconnect(); reg.classList.add('viva');
    }, { threshold: .3 }).observe(reg);
  }

  /* il filo del volo: solo desktop largo, mai con reduced-motion */
  if (ridotto) return;
  if (!matchMedia('(min-width:1280px) and (hover:hover)').matches) return;
  var filo = document.getElementById('rottaFilo');
  if (!filo) return;
  var scia = filo.querySelector('.rf-scia');
  var aereo = filo.querySelector('.rf-aereo');
  var TAPPE = ['conto', 'regola', 'macchina', 'tocca', 'verifica',
    'checkin', 'faq'];
  var punti = [];
  function misura() {
    [].forEach.call(filo.querySelectorAll('.rf-tappa'),
      function (t) { t.remove(); });
    punti = [];
    var H = document.documentElement.scrollHeight - innerHeight;
    if (H <= 0) return;
    TAPPE.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var f = Math.max(0, Math.min(1,
        (el.offsetTop - innerHeight * .4) / H));
      var t = document.createElement('span');
      t.className = 'rf-tappa';
      t.style.top = (f * 100) + '%';
      filo.appendChild(t);
      punti.push({ f: f, el: t });
    });
  }
  var attesa = false;
  function passo() {
    attesa = false;
    var H = document.documentElement.scrollHeight - innerHeight;
    var p = H > 0 ? Math.min(1, scrollY / H) : 0;
    scia.style.height = (p * 100) + '%';
    aereo.style.top = 'calc(' + (p * 100) + '% - 8px)';
    punti.forEach(function (t) {
      t.el.classList.toggle('passata', p >= t.f);
    });
  }
  addEventListener('scroll', function () {
    if (!attesa) { attesa = true; requestAnimationFrame(passo); }
  }, { passive: true });
  addEventListener('resize', function () { misura(); passo(); });
  misura(); passo();
  document.body.classList.add('volo-on');
})();
</script>

<footer class="footer">'''

for f in FILES:
    s = open(f, encoding='utf-8').read()
    for a, b in ((CSS_ANCORA, CSS), (HERO_ANCORA, FILO), (MINT_A, MINT_B),
                 (SCRIPT_ANCORA, SCRIPT)):
        uno(s, a, f)
        s = s.replace(a, b)
    for ago in ('id="rottaFilo"', 'id="pmNome"', 'volo-on', 'ckForm.monta'):
        assert ago in s, (f, ago)
    open(f, 'w', encoding='utf-8').write(s)
    print(f, '→ regia del volo montata,', len(s) // 1024, 'KB')
