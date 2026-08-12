#!/usr/bin/env python3
# LA CASA COMPLETA — lente, il posto, la presa, la verita per i motori.
#   · LENTE: la foto a tutto schermo (tap, frecce, swipe, Esc)
#   · IL POSTO: mappa 3D del blocco (coordinate vere, anelli del passo,
#     fallback onesto), i vicini fissi misurati, i TUOI luoghi (photon,
#     stessa chiave localStorage del sito live: boom:pois)
#   · LA PRESA: hold €300 rimborsabile via /api/reserve-checkout — l'API
#     vera del sito; in modalita sito la POST parte davvero, nell'artefatto
#     resta PREVIEW. Idem per l'apply.
#   · FAQPage JSON-LD generato dalle STESSE dieci risposte della pagina.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('ld-corpo.html', 'ld-regia.html', 'costruisci-ld.py'):
    shutil.copy(f, f + '.bak')

# ═══ COSTRUISCI-LD.PY ═══════════════════════════════════════════════════
s = leggi('costruisci-ld.py')
s = uno(s, "        'cauzioneMesi': numero(r.get('depositMonths')) or 1,",
"""        'cauzioneMesi': numero(r.get('depositMonths')) or 1,
        'lat': (float(r['lat']) if r.get('lat') else None),
        'lng': (float(r['lng']) if r.get('lng') else None),""", 'lat lng')
s = uno(s, "h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())",
"""h = h.replace('MODO_QUI', MODO)
h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())""", 'modo qui')
scrivi('costruisci-ld.py', s)

# ═══ LD-CORPO.HTML ══════════════════════════════════════════════════════
s = leggi('ld-corpo.html')

# ── la presa in fondo al denaro + la sezione del posto prima delle FAQ ──
s = uno(s, """  </div>
</section>

<!-- ══ QUELLO CHE CI CHIEDERESTI SU WHATSAPP ═════════════════════════════""",
"""
    <div class="presa quadro sale" id="presaCasa"><span class="tacca"></span>
      <div class="presa-testa">
        <b id="presaTitolo">Seen enough? Take it off the market.</b>
        <p>A refundable <b>€300</b> hold reserves this exact home while we
          process your application: fully refunded if you're not approved,
          deducted from your first month if you move in. Cancel free within
          48 hours.</p>
      </div>
      <form class="presa-forma" id="presaForma">
        <input id="prNome" name="nome" placeholder="Full name"
          autocomplete="name" required>
        <input id="prMail" name="email" type="email" placeholder="Email"
          autocomplete="email" required>
        <input id="prTel" name="telefono" type="tel"
          placeholder="Phone / WhatsApp" autocomplete="tel" required>
        <button type="submit" class="btn btn-primary" id="prVai">Hold this
          home · €300</button>
      </form>
      <p class="presa-nota" id="presaNota">Card via Stripe · a receipt by
        email · a human replies within 2 hours.</p>
    </div>
  </div>
</section>

<!-- ══ IL POSTO — il blocco vero, le distanze vere ═══════════════════════
     Mai una mappa finta: il motore arriva solo se lo chiami, e se non
     arriva lo dice. Le distanze sono stime oneste (linea d'aria ×1.3),
     dichiarate come tali. -->
<section class="sezione" id="posto">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>The place</span>
      <h2 class="titolo">See the <span class="hl">block</span> — before you
        cross town.</h2>
      <p class="sotto">The real map and the real distances, measured from
        this door — not from the zone's name.</p>
    </div>

    <div class="blocco3d sale" id="blocco3d">
      <button type="button" class="blocco-facciata" id="bloccoVia">
        <span class="bf-anelli" aria-hidden="true"><i></i><i></i><i></i></span>
        <b>◆ Explore the block in 3D</b>
        <span class="bf-sotto">Real map · 3D buildings · 5 / 10 / 15-minute
          walk rings</span>
      </button>
    </div>

    <div class="vicini sale" id="vicini"></div>

    <div class="luoghi sale" id="luoghi">
      <div class="luoghi-testa"><b>Distance from <span class="hl">your
        places</span></b><span>Set them once — every home answers.</span></div>
      <div class="luoghi-cerca">
        <input id="luogoQ" type="text"
          placeholder="Your office, university, a metro stop…"
          autocomplete="off" aria-label="Search a place in Rome">
        <div class="luoghi-sug" id="luogoSug" role="listbox"></div>
      </div>
      <div class="luoghi-righe" id="luogoRighe"></div>
      <p class="luoghi-nota">Times are honest estimates — straight line ×1.3
        for real streets, walking at 4.7 km/h — not turn-by-turn routes.</p>
    </div>
  </div>
</section>

<!-- ══ QUELLO CHE CI CHIEDERESTI SU WHATSAPP ═════════════════════════════""",
'presa + posto')

# ── la lente, in fondo al documento ─────────────────────────────────────
s = s.rstrip() + """

<!-- ══ LA LENTE — la foto a tutto schermo ════════════════════════════════ -->
<div class="lente" id="lente" hidden role="dialog" aria-modal="true"
  aria-label="Photo viewer">
  <button type="button" class="lente-x" id="lenteX"
    aria-label="Close photo viewer">✕</button>
  <button type="button" class="lente-b prec" id="lentePrec"
    aria-label="Previous photo">‹</button>
  <img id="lenteFoto" alt="" decoding="async">
  <button type="button" class="lente-b succ" id="lenteSucc"
    aria-label="Next photo">›</button>
  <span class="lente-conta" id="lenteConta" aria-hidden="true"></span>
</div>
"""

# ── il CSS ──────────────────────────────────────────────────────────────
s = uno(s, '</style>', """
/* ══ LA LENTE ══════════════════════════════════════════════════════════ */
#telaio > img { cursor:zoom-in; }
.lente { position:fixed; inset:0; z-index:200; background:rgba(3,3,3,.97);
  display:grid; place-items:center; }
.lente[hidden] { display:none; }
.lente img { max-width:min(96vw, 1400px); max-height:88vh;
  object-fit:contain; box-shadow:0 40px 120px rgba(0,0,0,.8); }
.lente-x { position:absolute; top:18px; right:18px; width:44px; height:44px;
  display:grid; place-items:center; background:rgba(3,3,3,.72); border:0;
  border-radius:50%; color:var(--text-2); font-size:16px; cursor:pointer;
  box-shadow:inset 0 0 0 1px var(--line); transition:.2s; }
.lente-x:hover { color:var(--text);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.lente-b { position:absolute; top:50%; transform:translateY(-50%);
  width:44px; height:44px; display:grid; place-items:center;
  background:rgba(3,3,3,.72); border:0; border-radius:50%;
  color:var(--text-2); font-size:22px; cursor:pointer;
  box-shadow:inset 0 0 0 1px var(--line); transition:.2s; }
.lente-b:hover { color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.lente-b.prec { left:14px; }
.lente-b.succ { right:14px; }
.lente-conta { position:absolute; bottom:18px; left:50%;
  transform:translateX(-50%); font-size:11px; letter-spacing:.14em;
  color:var(--text-3); font-variant-numeric:tabular-nums; }

/* ══ LA PRESA ══════════════════════════════════════════════════════════ */
.presa { margin-top:clamp(16px,2vw,22px); padding:clamp(18px,2.4vw,26px);
  display:grid; gap:14px; }
.presa-testa b { display:block; font-family:var(--display); font-weight:300;
  font-size:clamp(19px,2.2vw,24px); line-height:1.25; }
.presa-testa p { margin-top:8px; font-size:13.5px; line-height:1.65;
  color:var(--text-2); max-width:64ch; }
.presa-testa p b { color:var(--gold); font-weight:600; }
.presa-forma { display:grid; gap:10px;
  grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); }
.presa-forma input { padding:13px 14px; background:var(--input); border:0;
  box-shadow:inset 0 0 0 1px var(--line); color:var(--text); font:inherit;
  font-size:14px; min-width:0; }
.presa-forma input:focus { outline:none;
  box-shadow:inset 0 0 0 1px var(--gold); }
.presa-nota { font-size:11px; color:var(--text-4); }
.presa-nota a { color:var(--gold); }

/* ══ IL POSTO ══════════════════════════════════════════════════════════ */
.blocco3d { position:relative; margin-top:clamp(16px,2vw,24px);
  height:min(56vh, 460px); background:var(--void);
  box-shadow:inset 0 0 0 1px var(--line-gold-2),
    0 40px 90px -40px rgba(0,0,0,.9); overflow:hidden; }
#bloccoMappa { position:absolute; inset:0; }
#bloccoMappa canvas { outline:none; }
.blocco3d .maplibregl-ctrl-attrib { font-size:9px!important; opacity:.4; }
.blocco3d .maplibregl-ctrl-group { background:rgba(14,14,16,.82)!important; }
.blocco3d .maplibregl-ctrl-icon {
  filter:invert(1) brightness(1.6) contrast(.85); }
.blocco-facciata { position:absolute; inset:0; display:grid;
  place-items:center; align-content:center; gap:8px; border:0;
  color:var(--text); font:inherit; cursor:pointer; text-align:center;
  padding:20px; background:
    radial-gradient(2px 2px at 26% 30%, var(--gold) 40%, transparent 60%),
    radial-gradient(2px 2px at 66% 22%, var(--gold) 40%, transparent 60%),
    radial-gradient(2px 2px at 44% 56%, rgba(255,215,0,.5) 40%, transparent 60%),
    radial-gradient(120% 90% at 70% 8%, rgba(255,215,0,.08), transparent 55%),
    linear-gradient(160deg, #101017 0%, #08080D 55%, var(--void) 100%); }
.blocco-facciata b { font-family:var(--display); font-weight:300;
  font-size:clamp(19px,2.4vw,26px); }
.bf-sotto { font-size:11px; letter-spacing:.1em; text-transform:uppercase;
  color:var(--text-3); }
.bf-anelli { position:absolute; inset:0; display:grid; place-items:center;
  pointer-events:none; }
.bf-anelli i { position:absolute; border-radius:50%; opacity:.5;
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.bf-anelli i:nth-child(1) { width:120px; height:120px; }
.bf-anelli i:nth-child(2) { width:220px; height:220px; opacity:.32; }
.bf-anelli i:nth-child(3) { width:330px; height:330px; opacity:.18; }
.blocco-pin span { display:inline-block; padding:6px 11px;
  background:var(--gold); color:#141005; font-size:12px; font-weight:700;
  border-radius:100px; box-shadow:0 10px 30px rgba(0,0,0,.5);
  font-variant-numeric:tabular-nums; }
.blocco-spento { position:absolute; inset:0; display:grid;
  place-items:center; align-content:center; gap:10px; padding:24px;
  text-align:center; }
.blocco-spento b { font-family:var(--display); font-weight:300;
  font-size:19px; }
.blocco-spento span { font-size:12.5px; color:var(--text-3); max-width:44ch;
  line-height:1.6; }
.vicini { margin-top:clamp(14px,1.8vw,18px); display:grid; gap:10px;
  grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); }
.vicino { display:flex; align-items:baseline; gap:8px; padding:13px 15px;
  background:var(--card); box-shadow:inset 0 0 0 1px var(--line-0); }
.vicino b { font-weight:500; font-size:13.5px; white-space:nowrap; }
.vicino span { flex:1; font-size:11px; color:var(--text-4);
  overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.vicino i { font-style:normal; font-size:12px; color:var(--gold);
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.luoghi { margin-top:clamp(14px,1.8vw,18px); padding:clamp(16px,2vw,22px);
  background:var(--card); box-shadow:inset 0 0 0 1px var(--line-0); }
.luoghi-testa { display:flex; flex-wrap:wrap; align-items:baseline;
  gap:6px 14px; }
.luoghi-testa b { font-family:var(--display); font-weight:300;
  font-size:18px; }
.luoghi-testa span { font-size:11.5px; color:var(--text-4); }
.luoghi-cerca { position:relative; margin-top:12px; }
.luoghi-cerca input { width:100%; padding:13px 14px; background:var(--input);
  border:0; box-shadow:inset 0 0 0 1px var(--line); color:var(--text);
  font:inherit; font-size:14px; }
.luoghi-cerca input:focus { outline:none;
  box-shadow:inset 0 0 0 1px var(--gold); }
.luoghi-sug { position:absolute; left:0; right:0; top:calc(100% + 6px);
  z-index:20; background:var(--void);
  box-shadow:inset 0 0 0 1px var(--line-gold-2),
    0 24px 60px rgba(0,0,0,.7); }
.luoghi-sug:empty { display:none; }
.luoghi-sug button { display:block; width:100%; text-align:left;
  padding:11px 14px; background:none; border:0;
  border-bottom:1px solid var(--line-0); color:var(--text-2); font:inherit;
  cursor:pointer; min-height:40px; }
.luoghi-sug button:last-child { border-bottom:0; }
.luoghi-sug button:hover { background:rgba(255,215,0,.06); }
.luoghi-sug button b { display:block; color:var(--text); font-weight:500;
  font-size:13.5px; }
.luoghi-sug button span { font-size:11px; color:var(--text-4); }
.luoghi-sug .luoghi-vuota { padding:11px 14px; }
.luoghi-righe { margin-top:12px; display:grid; gap:8px; }
.luogo { display:flex; align-items:center; gap:10px; padding:10px 12px;
  background:var(--void); box-shadow:inset 0 0 0 1px var(--line-0); }
.luogo b { flex:1; font-weight:500; font-size:13px; overflow:hidden;
  white-space:nowrap; text-overflow:ellipsis; }
.luogo i { font-style:normal; font-size:12px; color:var(--gold);
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.luogo button { width:36px; height:36px; flex:none; display:grid;
  place-items:center; background:none; border:0; color:var(--text-4);
  cursor:pointer; font-size:12px; border-radius:50%;
  box-shadow:inset 0 0 0 1px var(--line); transition:.2s; }
.luogo button:hover { color:var(--text); }
.luoghi-vuota { font-size:12px; color:var(--text-4); padding:8px 2px; }
.luoghi-nota { margin-top:12px; font-size:10.5px; color:var(--text-4);
  line-height:1.6; }
</style>""", 'css casa')
scrivi('ld-corpo.html', s)

# ═══ LD-REGIA.HTML ══════════════════════════════════════════════════════
s = leggi('ld-regia.html')

# ── il modo: sito = POST vere, artefatto = PREVIEW ──────────────────────
s = uno(s, "  var CASE = 'CASE_JSON';",
"""  var CASE = 'CASE_JSON';
  /* sito = le API vere partono davvero; artefatto = PREVIEW in console */
  var VERO = 'MODO_QUI' === 'sito';""", 'vero')

# ── la lente non litiga con le frecce della galleria ────────────────────
s = uno(s, """      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); vai(-1); }""",
"""      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      var l = document.getElementById('lente');
      if (l && !l.hidden) return;   /* la lente ha le sue frecce */
      if (e.key === 'ArrowLeft') { e.preventDefault(); vai(-1); }""",
'frecce lente')

# ── l'apply: in modalita sito la POST parte davvero ─────────────────────
s = uno(s, "      console.info('[PREVIEW] POST /api/apply-lead →', corpo);",
"""      if (VERO) {
        /* la porta vera del pipeline: parte e non blocca, come dal vivo */
        try { fetch('/api/apply-lead', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo) }); } catch (err) {}
      } else console.info('[PREVIEW] POST /api/apply-lead →', corpo);""",
'apply vero')

# ── FAQPage JSON-LD dalle stesse dieci risposte ─────────────────────────
s = uno(s, """    lista.innerHTML = D.map(function (q) {
      return '<div class="chiedi-v"><b>' + q[0] + '</b><p>' + q[1] + '</p></div>';
    }).join('');""",
"""    lista.innerHTML = D.map(function (q) {
      return '<div class="chiedi-v"><b>' + q[0] + '</b><p>' + q[1] + '</p></div>';
    }).join('');
    /* per i motori: le STESSE dieci risposte — mai due verita */
    try {
      var ld = { '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: D.map(function (q) { return { '@type': 'Question',
          name: q[0], acceptedAnswer: { '@type': 'Answer',
            text: q[1].replace(/<[^>]+>/g, '') } }; }) };
      var sc = document.getElementById('faqLd');
      if (!sc) {
        sc = document.createElement('script');
        sc.type = 'application/ld+json'; sc.id = 'faqLd';
        document.head.appendChild(sc);
      }
      sc.textContent = JSON.stringify(ld);
    } catch (err) {}""", 'faq ld')

# ── lente + posto + presa, dentro via() prima delle altre case ──────────
s = uno(s, "  /* ── le altre case: tre, della stessa mano ──────────────────────────── */",
"""  /* ── LA LENTE: la foto a tutto schermo ─────────────────────────────── */
  (function () {
    var lente = document.getElementById('lente');
    if (!lente || !immagini.length) return;
    var foto = document.getElementById('lenteFoto'),
        conta = document.getElementById('lenteConta');
    var qui = 0, aperta = false;
    function apri(i) {
      qui = (i + immagini.length) % immagini.length;
      foto.src = immagini[qui];
      foto.alt = c.nome + ' — photo ' + (qui + 1) + ' of ' + immagini.length;
      if (conta) conta.textContent = (qui + 1) + ' / ' + immagini.length;
      lente.hidden = false; aperta = true;
      document.documentElement.style.overflow = 'hidden';
    }
    function chiudi() {
      lente.hidden = true; aperta = false;
      document.documentElement.style.overflow = '';
    }
    telaio.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;  /* frecce e cuore sono loro */
      var k = 0;
      [].slice.call(rullino.children).forEach(function (b, i) {
        if (b.classList.contains('qui')) k = i; });
      apri(k);
    });
    document.getElementById('lenteX').addEventListener('click', chiudi);
    document.getElementById('lentePrec').addEventListener('click',
      function () { apri(qui - 1); });
    document.getElementById('lenteSucc').addEventListener('click',
      function () { apri(qui + 1); });
    lente.addEventListener('click', function (e) {
      if (e.target === lente) chiudi(); });
    addEventListener('keydown', function (e) {
      if (!aperta) return;
      if (e.key === 'Escape') chiudi();
      if (e.key === 'ArrowLeft') apri(qui - 1);
      if (e.key === 'ArrowRight') apri(qui + 1);
    });
    var x0 = null;
    lente.addEventListener('touchstart', function (e) {
      x0 = e.touches[0].clientX; }, { passive: true });
    lente.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) apri(qui + (dx < 0 ? 1 : -1));
    }, { passive: true });
    if (immagini.length < 2) {
      document.getElementById('lentePrec').style.display = 'none';
      document.getElementById('lenteSucc').style.display = 'none';
    }
  })();

  /* ── IL POSTO: il blocco vero, i vicini, i tuoi luoghi ──────────────── */
  (function () {
    var sez = document.getElementById('posto');
    if (!sez) return;
    if (!c.lat || !c.lng) { sez.style.display = 'none'; return; }
    var RAD = Math.PI / 180;
    function km(a1, o1, a2, o2) {
      var R = 6371, dy = (a2 - a1) * RAD, dx = (o2 - o1) * RAD;
      var q = Math.pow(Math.sin(dy / 2), 2) + Math.cos(a1 * RAD)
        * Math.cos(a2 * RAD) * Math.pow(Math.sin(dx / 2), 2);
      /* onesto: linea d'aria ×1.3 per le strade vere, non un percorso */
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(q))) * 1.3;
    }
    function tempo(d) {
      return d < 2.6 ? Math.round(d / 4.7 * 60) + ' min walk'
                     : '≈' + Math.round(d * 4.2 + 10) + ' min';
    }
    /* i vicini fissi: stazioni e atenei veri, i 4 piu vicini a QUESTA porta */
    var POSTI = [
      ['Termini', 'Trains + Metro A/B', 41.9009, 12.5018],
      ['Colosseo', 'The ancient centre', 41.8902, 12.4924],
      ['Vatican', 'St Peter\\'s & museums', 41.9022, 12.4534],
      ['Sapienza', 'Main campus', 41.9038, 12.5135],
      ['LUISS', 'Viale Romania campus', 41.9269, 12.4917],
      ['Roma Tre', 'Ostiense campus', 41.8564, 12.4790],
      ['John Cabot', 'Trastevere campus', 41.8937, 12.4664]
    ];
    document.getElementById('vicini').innerHTML = POSTI.map(function (p) {
      var d = km(c.lat, c.lng, p[2], p[3]);
      return { d: d, h: '<div class="vicino"><b>' + p[0] + '</b><span>'
        + p[1] + '</span><i>' + tempo(d) + '</i></div>' };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, 4)
      .map(function (x) { return x.h; }).join('');

    /* la mappa del blocco: solo se la chiami, e se non arriva lo dice */
    var via = document.getElementById('bloccoVia'),
        box = document.getElementById('blocco3d');
    var mappaB = null, spenta = false;
    function spengo() {
      if (spenta) return; spenta = true;
      box.innerHTML = '<div class="blocco-spento"><b>The map engine could '
        + 'not be reached from here.</b><span>No fake map in its place — '
        + 'see the exact spot on Google Maps instead.</span>'
        + '<a class="btn btn-primary" target="_blank" rel="noopener" '
        + 'href="https://maps.google.com/?q=' + c.lat + ',' + c.lng + '">'
        + 'Open in Google Maps ↗</a></div>';
    }
    function accendi() {
      var telo = document.createElement('div');
      telo.id = 'bloccoMappa'; box.innerHTML = ''; box.appendChild(telo);
      try {
        mappaB = new maplibregl.Map({ container: 'bloccoMappa',
          style: 'https://tiles.openfreemap.org/styles/liberty',
          center: [c.lng, c.lat], zoom: 15.7, pitch: 55, bearing: -17,
          antialias: true, attributionControl: { compact: true },
          cooperativeGestures: {
            windowsHelpText: 'Use Ctrl + scroll to zoom the map',
            macHelpText: 'Use ⌘ + scroll to zoom the map',
            mobileHelpText: 'Use two fingers to move the map' } });
      } catch (e) { spengo(); return; }
      mappaB.addControl(new maplibregl.NavigationControl(
        { visualizePitch: true }), 'bottom-right');
      mappaB.on('error', function (e) {
        if (e && e.error
            && /style|Failed to fetch/i.test(String(e.error.message || '')))
          spengo();
      });
      mappaB.on('load', function () {
        try {
          var f = null, st2 = mappaB.getStyle();
          (st2.layers || []).forEach(function (l) {
            if (!f && l['source-layer'] === 'building') f = l.source; });
          if (f) mappaB.addLayer({ id: 'blocco-3d', type: 'fill-extrusion',
            source: f, 'source-layer': 'building', minzoom: 13, paint: {
              'fill-extrusion-color': '#C8BDA5',
              'fill-extrusion-height':
                ['coalesce', ['get', 'render_height'], 12],
              'fill-extrusion-base':
                ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': .9 } });
        } catch (e) {}
        /* gli anelli del passo: 5/10/15 minuti a 4.8 km/h */
        [400, 800, 1200].forEach(function (r, i) {
          var co = [], dLat = r / 111320,
              dLng = r / (111320 * Math.cos(c.lat * RAD));
          for (var k = 0; k <= 72; k++) {
            var a = k / 72 * 2 * Math.PI;
            co.push([c.lng + dLng * Math.cos(a),
                     c.lat + dLat * Math.sin(a)]);
          }
          try {
            mappaB.addSource('anello' + i, { type: 'geojson', data: {
              type: 'Feature', properties: {},
              geometry: { type: 'LineString', coordinates: co } } });
            mappaB.addLayer({ id: 'anello' + i, type: 'line',
              source: 'anello' + i, paint: { 'line-color': '#FFD700',
                'line-width': 1.2, 'line-opacity': .55 - i * .14,
                'line-dasharray': [1, 2] } });
          } catch (e) {}
        });
        var el = document.createElement('div');
        el.className = 'blocco-pin';
        el.innerHTML = '<span>' + euro(c.prezzo) + '</span>';
        new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([c.lng, c.lat]).addTo(mappaB);
      });
    }
    via.addEventListener('click', function () {
      if (window.maplibregl) return accendi();
      via.querySelector('b').textContent = 'Waking the map engine…';
      var css = document.createElement('link'); css.rel = 'stylesheet';
      css.href =
        'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src =
        'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.min.js';
      js.onload = function () { try { accendi(); } catch (e) { spengo(); } };
      js.onerror = spengo;
      document.head.appendChild(js);
      setTimeout(function () { if (!mappaB) spengo(); }, 12000);
    });

    /* i tuoi luoghi: scritti una volta, ogni casa risponde. Stessa chiave
       del sito live (boom:pois): quello che salvi qui vale anche la. */
    var CHIAVE = 'boom:pois';
    function letti() {
      try { return JSON.parse(localStorage.getItem(CHIAVE) || '[]'); }
      catch (e) { return []; }
    }
    function serba(a) {
      try { localStorage.setItem(CHIAVE, JSON.stringify(a.slice(0, 4))); }
      catch (e) {}
    }
    var righe = document.getElementById('luogoRighe'),
        cerca = document.getElementById('luogoQ'),
        sug = document.getElementById('luogoSug');
    function righeGiu() {
      var a = letti();
      righe.innerHTML = a.length ? a.map(function (p, i) {
        return '<div class="luogo"><b>' + p.name + '</b><i>'
          + tempo(km(c.lat, c.lng, p.lat, p.lng)) + '</i>'
          + '<button type="button" data-i="' + i + '" aria-label="Remove '
          + p.name + '">✕</button></div>';
      }).join('') : '<p class="luoghi-vuota">Nothing saved yet — type your '
        + 'office or campus above, once.</p>';
    }
    righe.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]'); if (!b) return;
      var a = letti(); a.splice(+b.dataset.i, 1); serba(a); righeGiu();
    });
    var attesa = null;
    cerca.addEventListener('input', function () {
      clearTimeout(attesa);
      var q = cerca.value.trim();
      if (q.length < 3) { sug.innerHTML = ''; return; }
      attesa = setTimeout(function () {
        fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(q)
            + '&lat=41.893&lon=12.483&limit=4&lang=en&zoom=12')
          .then(function (r) { return r.json(); })
          .then(function (j) {
            sug.innerHTML = (j.features || []).slice(0, 4)
              .map(function (ft) {
                var p = ft.properties || {};
                var nome = p.name || p.street || 'Place';
                var dove = [p.suburb || p.district, p.city]
                  .filter(Boolean).join(', ');
                return '<button type="button" data-lat="'
                  + ft.geometry.coordinates[1] + '" data-lng="'
                  + ft.geometry.coordinates[0] + '" data-n="'
                  + String(nome).replace(/"/g, '') + '"><b>' + nome
                  + '</b><span>' + dove + '</span></button>';
              }).join('')
              || '<p class="luoghi-vuota">Nothing found — try the street '
              + 'or the campus name.</p>';
          })
          .catch(function () {
            /* niente rete da qui: lo diciamo, non lo nascondiamo */
            sug.innerHTML = '<p class="luoghi-vuota">The place search '
              + 'needs the live site — it can\\'t run from this '
              + 'preview.</p>';
          });
      }, 320);
    });
    sug.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]'); if (!b) return;
      var a = letti();
      if (!a.some(function (p) { return p.name === b.dataset.n; })) {
        a.unshift({ name: b.dataset.n, lat: +b.dataset.lat,
          lng: +b.dataset.lng });
        serba(a);
      }
      sug.innerHTML = ''; cerca.value = ''; righeGiu();
    });
    righeGiu();
  })();

  /* ── LA PRESA: €300 rimborsabili via Stripe — l'API vera del sito ───── */
  (function () {
    var f = document.getElementById('presaForma');
    if (!f) return;
    var attesa2 = /wait/i.test(c.stato);
    if (!c.libera && !attesa2) {
      /* casa presa: niente finta corsia di prenotazione */
      var card = document.getElementById('presaCasa');
      if (card) card.style.display = 'none';
      return;
    }
    if (attesa2) document.getElementById('presaTitolo').textContent =
      'Priority hold — first in line when it frees up.';
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var nome = f.querySelector('#prNome').value.trim(),
          mail = f.querySelector('#prMail').value.trim(),
          tel = f.querySelector('#prTel').value.trim();
      if (!nome || !mail || !tel) return;
      var corpo = { listingId: c.id, listingName: c.nome, amount: 300,
        name: nome, email: mail, phone: tel, move_in_date: c.dal || '' };
      var b = document.getElementById('prVai'),
          nota = document.getElementById('presaNota');
      if (!VERO) {
        console.info('[PREVIEW] POST /api/reserve-checkout →', corpo);
        if (nota) nota.textContent = 'PREVIEW — on the live site this '
          + 'opens Stripe checkout for the refundable €300 hold.';
        return;
      }
      b.disabled = true; b.textContent = 'Opening Stripe…';
      fetch('/api/reserve-checkout', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.url) { location.href = j.url; return; }
          throw new Error('senza url');
        })
        .catch(function () {
          b.disabled = false; b.textContent = 'Hold this home · €300';
          if (nota) nota.innerHTML = 'Checkout didn\\'t open — try again, '
            + 'or <a href="https://wa.me/393313251961" target="_blank" '
            + 'rel="noopener">message us on WhatsApp</a> and we\\'ll hold '
            + 'it manually.';
        });
    });
  })();

  /* ── le altre case: tre, della stessa mano ──────────────────────────── */""",
'lente posto presa')
scrivi('ld-regia.html', s)
print('casa: fatta')
