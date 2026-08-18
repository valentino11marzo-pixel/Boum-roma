#!/usr/bin/env python3
# LOTTO 13·C3 — IL DETAIL CONVERTE.
#   La pagina dove si decide: prezzo e gesto sempre a portata di pollice,
#   la galleria si sfoglia col dito, Hold e Apply sono UN cliente con due
#   gesti, «Free from» non e' mai rosso, la casa si racconta fuori dai
#   soldi, la fiducia sta al punto di firma, le FAQ non costano due
#   schermate, WhatsApp arriva col nome della casa, e la rotaia orienta.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: {s.count(ago)}'

c = leggi('ld-corpo.html'); shutil.copy('ld-corpo.html', 'ld-corpo.html.bakC3')
r = leggi('ld-regia.html'); shutil.copy('ld-regia.html', 'ld-regia.html.bakC3')

# ═══ CORPO ═══════════════════════════════════════════════════════════════

# ── 1 · «Free from» in un colore che invita, mai rosso ───────────────────
uno(c, '.stato-grande.dopo { color:#FF6B57;', 'dopo rosso')
c = c.replace('.stato-grande.dopo { color:#FF6B57;',
    '/* una casa libera da una data e\' PRENOTABILE oggi: il rosso leggeva\n'
    '   «persa», la semantica giusta e\' il verde dell\'imbarco */\n'
    '.stato-grande.dopo { color:#7FDFA4;')

# ── 2 · la casa si racconta FUORI dai soldi ──────────────────────────────
RACCONTO = '''    <div class="racconto sale" style="margin-top:20px">
      <p id="raccontoCasa">—</p>
      <div class="dote" id="dentroCasa"></div>
    </div>

'''
uno(c, RACCONTO, 'racconto nel denaro')
c = c.replace(RACCONTO, '')
APRI_DENARO = '<section class="sezione" id="denaro">'
uno(c, APRI_DENARO, 'sezione denaro')
c = c.replace(APRI_DENARO, '''<!-- ══ LA CASA — com'e', prima dei conti: chi scansiona i titoli deve
     trovare la casa, non solo il denaro ═══════════════════════════════ -->
<section class="sezione" id="casa">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>The home</span>
      <h2 class="titolo">What it's <span class="hl">like</span>.</h2>
    </div>
    <div class="racconto sale" style="margin-top:20px">
      <p id="raccontoCasa">—</p>
      <div class="dote" id="dentroCasa"></div>
    </div>
  </div>
</section>

''' + APRI_DENARO)

# ── 3 · la fiducia al punto di firma ─────────────────────────────────────
BTN_AP = '<button class="btn btn-primary" type="submit">Send application</button>'
uno(c, BTN_AP, 'bottone apply')
c = c.replace(BTN_AP, BTN_AP + '''
        <p class="applica-fede">Egidi Immobiliare S.r.l., licensed agency
          · BOOM® EU trade mark 019317594 · payments via Stripe, receipted</p>''')

# ── 4 · dentro il successo dell'apply, il gesto d'oro (se la casa è libera)
FATTO_NOTA = '<p class="applica-nota">PREVIEW — nothing was sent from this page.</p>'
uno(c, FATTO_NOTA, 'nota fatto')
c = c.replace(FATTO_NOTA, '''<a class="btn btn-primary" id="fattoHold" href="#presaCasa"
          style="display:none">Hold this home · €300 →</a>
        ''' + FATTO_NOTA)

# ── 5 · la barra di decisione (mobile) + la rotaia (desktop) ─────────────
FINE_CORPO_ANCORA = '<span class="lente-conta" id="lenteConta" aria-hidden="true"></span>\n</div>'
uno(c, FINE_CORPO_ANCORA, 'fine corpo')
c = c.replace(FINE_CORPO_ANCORA, FINE_CORPO_ANCORA + '''

<!-- la decisione sempre a portata di pollice: prezzo, stato, il gesto -->
<div class="decisione" id="decisione" hidden>
  <div class="dec-info">
    <b id="decPrezzo">—</b>
    <span id="decStato">—</span>
  </div>
  <a class="btn btn-primary" id="decVai" href="#applica">Apply</a>
</div>

<!-- la rotaia: la pagina e' lunga, l'orientamento e' un servizio -->
<nav class="rotaia" id="rotaia" aria-label="Sections">
  <a href="#casa">The home</a><a href="#denaro">The money</a>
  <a href="#posto">The place</a><a href="#chiedi">Questions</a>
  <a href="#applica" class="oro">Apply</a>
</nav>''')

CSS_CODA = '''
/* la barra di decisione: solo dove serve (pollice), mai sopra il form */
.decisione { position:fixed; left:0; right:0; bottom:0; z-index:60;
  display:none; align-items:center; gap:12px; padding:10px 14px
  calc(10px + env(safe-area-inset-bottom)); background:rgba(7,7,9,.92);
  -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
  border-top:1px solid var(--line-gold-2); }
.decisione[hidden] { display:none !important; }
.dec-info { flex:1; min-width:0; display:flex; flex-direction:column; }
.dec-info b { font-family:var(--display); font-weight:300; font-size:19px;
  color:var(--gold); letter-spacing:.01em; }
.dec-info span { font-size:10.5px; letter-spacing:.12em;
  text-transform:uppercase; color:var(--text-3); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.decisione .btn { flex:none; padding:12px 22px; }
@media (max-width:900px){ .decisione.viva { display:flex; } }
/* la rotaia: desktop, sotto la testata */
.rotaia { position:sticky; top:64px; z-index:40; display:none;
  gap:4px; justify-content:center; padding:8px 12px; margin:0 auto;
  background:rgba(7,7,9,.78); -webkit-backdrop-filter:blur(12px);
  backdrop-filter:blur(12px); border-bottom:1px solid var(--line-0); }
@media (min-width:900px){ .rotaia { display:flex; } }
.rotaia a { padding:7px 14px; font-size:10.5px; letter-spacing:.2em;
  text-transform:uppercase; color:var(--text-3); text-decoration:none;
  border-radius:100px; transition:color .2s, background .2s; }
.rotaia a:hover { color:var(--text); }
.rotaia a.qui { color:var(--gold); background:rgba(255,215,0,.08); }
.rotaia a.oro { color:var(--gold); font-weight:600; }
.applica-fede { margin-top:10px; font-size:10.5px; line-height:1.6;
  letter-spacing:.04em; color:var(--text-4); }
/* le FAQ come apparecchi richiudibili: le domande restano tutte VISIBILI
   (la regola GEO), le risposte non costano due schermate di scroll */
details.chiedi-v summary { cursor:pointer; list-style:none;
  display:block; font-size:13.5px; font-weight:500; letter-spacing:.005em;
  color:var(--text); line-height:1.4; position:relative;
  padding-right:26px; }
details.chiedi-v summary::-webkit-details-marker { display:none; }
details.chiedi-v summary::after { content:'+'; position:absolute; right:2px;
  top:50%; transform:translateY(-50%); color:var(--gold); font-size:16px;
  font-weight:300; transition:transform .25s var(--ease); }
details.chiedi-v[open] summary::after { transform:translateY(-50%) rotate(45deg); }
'''
uno(c, '</style>', 'style corpo') if c.count('</style>') == 1 else None
i = c.index('</style>')
c = c[:i] + CSS_CODA + c[i:]
scrivi('ld-corpo.html', c)

# ═══ REGIA ═══════════════════════════════════════════════════════════════

# ── 6 · swipe + prefetch sulla galleria ──────────────────────────────────
VAI = '''    prec.addEventListener('click', function () { vai(-1); });
    succ.addEventListener('click', function () { vai(1); });'''
uno(r, VAI, 'frecce vai')
r = r.replace(VAI, VAI + '''
    /* il gesto piu' ripetuto: lo swipe sul telaio (il pattern della
       lente, riusato) — e la prossima foto si precarica da sola */
    (function () {
      var x0 = null;
      telaio.addEventListener('touchstart', function (e) {
        x0 = e.touches[0].clientX; }, { passive: true });
      telaio.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 40) vai(dx < 0 ? 1 : -1);
      }, { passive: true });
    })();''')
DENTRO_VAI = '''      qui = (qui + d + immagini.length) % immagini.length;
      mostra(qui);'''
uno(r, DENTRO_VAI, 'corpo vai')
r = r.replace(DENTRO_VAI, DENTRO_VAI + '''
      try { new Image().src = immagini[(qui + 1) % immagini.length];
        new Image().src = immagini[(qui - 1 + immagini.length) % immagini.length];
      } catch (e) {}''')

# ── 7 · WhatsApp col nome della casa ─────────────────────────────────────
ANAG = "  per('#applicaNome').textContent = c.nome;"
uno(r, ANAG, 'anagrafica')
r = r.replace(ANAG, ANAG + '''
  /* WhatsApp arriva gia' col contesto: mai un «ciao» muto — l'operatore
     sa di quale casa si parla e la pipeline aggancia il listing */
  (function () {
    var wa = document.querySelector('.chiedi-wa');
    if (!wa) return;
    var msg = 'Hi! I\\u2019m asking about \\u201c' + c.nome + '\\u201d ('
      + c.zona + ') \\u2014 ' + location.origin + '/listing/'
      + encodeURIComponent(c.id);
    wa.href = 'https://wa.me/393313251961?text=' + encodeURIComponent(msg);
  })();''')

# ── 8 · Hold ⇄ Apply: un cliente, due gesti ──────────────────────────────
CODA = '  /* cambiando casa dall\'indirizzo, la pagina si rifà */'
uno(r, CODA, 'coda regia')
r = r.replace(CODA, '''  /* ── Hold e Apply chiedono le stesse tre cose a due form scollegati:
     compilarne uno riempie l'altro, e il successo dell'apply offre il
     gesto d'oro (solo se la casa e' libera — mai un hold su una presa) */
  (function () {
    var coppie = [['prNome', 'apNome'], ['prMail', 'apMail'], ['prTel', 'apTel']];
    coppie.forEach(function (cp) {
      var a = document.getElementById(cp[0]), b = document.getElementById(cp[1]);
      if (!a || !b) return;
      function specchia(da, a2) {
        da.addEventListener('input', function () {
          if (!a2.value || a2.dataset.eco === '1') {
            a2.value = da.value; a2.dataset.eco = '1';
          }
        });
      }
      specchia(a, b); specchia(b, a);
    });
    var fh = document.getElementById('fattoHold');
    if (fh && c.libera && document.getElementById('presaCasa'))
      fh.style.display = '';
  })();

  /* ── la barra di decisione (mobile) + la rotaia (desktop) ── */
  (function () {
    var bar = document.getElementById('decisione');
    if (bar) {
      per('#decPrezzo').textContent = euro(c.prezzo) + '/mo';
      per('#decStato').textContent = c.stato;
      var vaiB = document.getElementById('decVai');
      if (!c.libera && vaiB) vaiB.textContent = 'Waitlist';
      bar.hidden = false;
      var applica = document.getElementById('applica');
      var soglia = 520;
      var giu = false;
      function stagione() {
        var vicino = false;
        if (applica) {
          var r2 = applica.getBoundingClientRect();
          vicino = r2.top < innerHeight && r2.bottom > 0;
        }
        var ora = scrollY > soglia && !vicino;
        if (ora !== giu) { giu = ora; bar.classList.toggle('viva', ora); }
      }
      addEventListener('scroll', stagione, { passive: true });
      stagione();
    }
    var rotaia = document.getElementById('rotaia');
    if (rotaia && 'IntersectionObserver' in window) {
      var voci = [].slice.call(rotaia.querySelectorAll('a'));
      var io2 = new IntersectionObserver(function (rr) {
        rr.forEach(function (x) {
          if (!x.isIntersecting) return;
          var id = '#' + x.target.id;
          voci.forEach(function (v) {
            v.classList.toggle('qui', v.getAttribute('href') === id); });
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      ['casa', 'denaro', 'posto', 'chiedi', 'applica'].forEach(function (id) {
        var el = document.getElementById(id); if (el) io2.observe(el);
      });
    }
    /* se la casa non ha racconto ne' dote, la sezione non finge */
    var sezCasa = document.getElementById('casa');
    if (sezCasa && !c.racconto && !(c.dentro || []).length)
      sezCasa.style.display = 'none';
  })();

''' + CODA)

# ── 9 · la CTA porta la data quando la casa si libera nel futuro ─────────
CTA_WAIT = "  if (!c.libera) {"
uno(r, CTA_WAIT, 'cta waitlist')
r = r.replace(CTA_WAIT, '''  /* una casa libera DA una data: la data sta nel gesto, non solo nel badge */
  if (c.libera && c.dal) {
    var oggiIso = new Date().toISOString().slice(0, 10);
    if (c.dal > oggiIso) {
      var bF = document.querySelector('#modApplica button[type="submit"]');
      if (bF) {
        var dF = new Date(c.dal + 'T12:00:00');
        bF.textContent = 'Apply \\u00b7 move in '
          + dF.getDate() + ' ' + dF.toLocaleDateString('en-GB', { month: 'short' });
      }
    }
  }
  if (!c.libera) {''')

# ── 10 · le FAQ come apparecchi richiudibili ─────────────────────────────
RENDER = """    lista.innerHTML = D.map(function (q) {
      return '<div class="chiedi-v"><b>' + q[0] + '</b><p>' + q[1] + '</p></div>';
    }).join('');"""
uno(r, RENDER, 'render chiedi')
r = r.replace(RENDER, """    /* domande tutte VISIBILI (regola GEO: il FAQPage afferma solo cio'
       che la pagina mostra), risposte richiudibili — la prima aperta */
    lista.innerHTML = D.map(function (q, i2) {
      return '<details class="chiedi-v"' + (i2 === 0 ? ' open' : '')
        + '><summary>' + q[0] + '</summary><p>' + q[1] + '</p></details>';
    }).join('');""")
scrivi('ld-regia.html', r)
print('C3 detail: barra+rotaia, swipe, hold-apply, verde-imbarco, casa fuori dai soldi, fede, FAQ, WhatsApp')
