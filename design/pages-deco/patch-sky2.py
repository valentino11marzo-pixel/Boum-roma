#!/usr/bin/env python3
# LO SKYLINE, quello VERO: la sezione del sito live portata in home come
# widget-magnete — Roma in assonometria, ogni casa un pin alle sue
# coordinate, e la porta verso la Skyline 3D a schermo intero.
s = open('pt.html').read()
def sost(v, n, dove):
    global s
    assert s.count(v) == 1, 'NON TROVATO/DOPPIO: ' + dove
    s = s.replace(v, n)

# ── 1 · la sezione: dalla mia invenzione alla Skyline vera ─────────────
A = '<!-- ══ LO SKYLINE — la città come strumento ═════════════════════════════ -->'
B = '<!-- ══ I SERVIZI — sei porte, una fila ═══════════════════════════════════ -->'
ia, ib = s.index(A), s.index(B)
NUOVA = '''<!-- ══ LO SKYLINE 3D — la sezione del sito, in home come magnete ════════ -->
<section class="sezione" id="skyline">
  <div class="container">
    <div class="testa-fila sale">
      <div>
        <span class="eyebrow"><i></i>Skyline 3D · Satellite</span>
        <h2 class="titolo">Every home on Rome's <span class="hl">real
          skyline</span>.</h2>
        <p class="sotto">Not pins on a flat map: the city in relief, with each
          of our homes standing where it actually stands. Orbit the block,
          check the distances, then open the full Skyline.</p>
      </div>
      <a class="vai-testa" href="/skyline">Open the Skyline ↗</a>
    </div>

    <div class="sky sale">
      <canvas id="skyTela" aria-hidden="true"></canvas>
      <div class="sky-tasti" id="skyTasti"></div>
      <span class="sky-bussola" aria-hidden="true">N</span>
      <div class="sky-fila" id="skyFila" role="group"
        aria-label="Homes on the skyline"></div>
      <div class="sky-carta" id="skyCarta" aria-live="polite">
        <div class="sky-vuota" id="skyVuota">
          <b>DISPONIBILI homes standing in Rome right now</b>
          <span>Touch a tower to see which one.</span>
        </div>
        <a class="sky-piena" id="skyPiena" href="/apartments.html">
          <div>
            <b id="skyNome">—</b>
            <span id="skyDati">—</span>
          </div>
          <i>Open this home →</i>
        </a>
      </div>
    </div>
  </div>
</section>

'''
s = s[:ia] + NUOVA + s[ib:]

# ── 2 · il vestito: la bussola e la fila delle case ────────────────────
sost(""".sky-fila button.on { color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold); }""",
""".sky-fila button.on { color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.sky-bussola { position:absolute; top:12px; right:14px; width:26px;
  height:26px; display:grid; place-items:center; border-radius:50%;
  box-shadow:inset 0 0 0 1px var(--line-gold-2); font-size:9px;
  font-weight:600; letter-spacing:.1em; color:var(--gold); }""",
     'bussola')
sost(""".sky canvas { display:block; width:100%; height:clamp(190px,26vw,340px); }
.sky-tasti { position:absolute; left:0; right:0; top:0;
  height:clamp(190px,26vw,340px); }
.sky-tasti button { position:absolute; bottom:0; width:34px; height:64%;
  transform:translateX(-50%); padding:0; border:0; background:none;
  cursor:pointer; }
.sky-tasti button::after { content:''; position:absolute; left:50%; bottom:14%;
  width:7px; height:7px; margin-left:-3.5px; border-radius:50%;
  background:var(--gold); opacity:.5; transition:opacity .3s ease,
    transform .3s var(--ease); }""",
""".sky canvas { display:block; width:100%; height:clamp(250px,34vw,430px);
  background:linear-gradient(180deg, #050506, #08080B); }
.sky-tasti { position:absolute; left:0; right:0; top:0;
  height:clamp(250px,34vw,430px); }
.sky-tasti button { position:absolute; width:30px; height:30px;
  transform:translate(-50%,-50%); padding:0; border:0; background:none;
  cursor:pointer; }
.sky-tasti button::after { content:''; position:absolute; left:50%; top:50%;
  width:9px; height:9px; margin:-4.5px 0 0 -4.5px; border-radius:50%;
  background:var(--gold); opacity:.62; transition:opacity .3s ease,
    transform .3s var(--ease); }""", 'tasti pin')

# ── 3 · il motore: Roma in rilievo, le case alle loro coordinate ───────
A2 = '  function skylineRoma() {'
B2 = "  if (document.readyState === 'complete') setTimeout(skylineRoma, 0);"
ia2, ib2 = s.index(A2), s.index(B2)
MOTORE = '''  function skylineRoma() {
    /* LA SKYLINE 3D — la sezione del sito live, portata in home: Roma in
       assonometria disegnata dal codice, e OGNI CASA alle sue coordinate
       vere, in piedi sul suo isolato. Lo strato città si posa una volta. */
    var tela = document.getElementById('skyTela');
    if (!tela || !tela.getContext) return;
    var CASE = 'SKY_JSON';
    if (!CASE.length) return;
    var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mob = matchMedia('(max-width: 640px)').matches;
    var ctx = tela.getContext('2d');
    var ORO = '255,215,0', LATTE = '250,248,240';
    var W, H, DPR, citta, isolati, K, CX, CY;
    /* il centro della scena: la media delle nostre case */
    var LAT = CASE.reduce(function (a, c) { return a + c.lat; }, 0) / CASE.length;
    var LNG = CASE.reduce(function (a, c) { return a + c.lng; }, 0) / CASE.length;
    /* il Tevere, per punti veri (nord → sud) */
    var TEVERE = [[41.951,12.470],[41.933,12.466],[41.918,12.470],
      [41.906,12.466],[41.895,12.474],[41.884,12.470],[41.872,12.478]];
    var COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
    function proietta(lat, lng) {
      /* metri approssimati, poi assonometria a 30° */
      var mx = (lng - LNG) * 111320 * Math.cos(LAT * Math.PI / 180);
      var my = (lat - LAT) * 110540;
      return { x: CX + (mx - my * .35) * K, y: CY - (my * .55 + mx * .28) * K };
    }
    function misura() {
      var r = tela.getBoundingClientRect();
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = Math.round(r.width * DPR); H = Math.round(r.height * DPR);
      tela.width = W; tela.height = H;
      CX = W * .5; CY = H * .60;
      /* la scala: tutte le case dentro il quadro, con aria attorno */
      K = 1;
      var prova = CASE.map(function (c) { return proietta(c.lat, c.lng); });
      var xs = prova.map(function (p) { return p.x - CX; });
      var ys = prova.map(function (p) { return p.y - CY; });
      var mx = Math.max.apply(null, xs.map(Math.abs)) || 1;
      var my = Math.max.apply(null, ys.map(Math.abs)) || 1;
      K = Math.min(W * .40 / mx, H * .30 / my);
      disegna(); piazza();
    }
    /* un blocco in rilievo: la faccia alta e i due fianchi */
    function blocco(g, p, w, d, h, forza) {
      var x = p.x, y = p.y;
      var ax = w * COS, ay = w * SIN, bx = -d * COS, by = d * SIN;
      g.fillStyle = 'rgba(' + LATTE + ',' + (forza * .05) + ')';
      g.beginPath();
      g.moveTo(x, y - h);
      g.lineTo(x + ax, y + ay - h);
      g.lineTo(x + ax + bx, y + ay + by - h);
      g.lineTo(x + bx, y + by - h);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(' + LATTE + ',' + (forza * .13) + ')';
      g.lineWidth = DPR; g.stroke();
      g.beginPath();
      g.moveTo(x, y - h); g.lineTo(x, y);
      g.moveTo(x + ax, y + ay - h); g.lineTo(x + ax, y + ay);
      g.moveTo(x + bx, y + by - h); g.lineTo(x + bx, y + by);
      g.stroke();
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x + ax, y + ay);
      g.moveTo(x, y); g.lineTo(x + bx, y + by);
      g.stroke();
    }
    function disegna() {
      citta = document.createElement('canvas');
      citta.width = W; citta.height = H;
      var g = citta.getContext('2d');
      g.lineCap = 'round'; g.lineJoin = 'round';
      /* l'alone del centro: la città che si accende sotto */
      var al = g.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * .5);
      al.addColorStop(0, 'rgba(255,205,90,.055)');
      al.addColorStop(1, 'rgba(255,205,90,0)');
      g.fillStyle = al; g.fillRect(0, 0, W, H);
      /* il Tevere: il filo d'oro che attraversa il rilievo */
      g.strokeStyle = 'rgba(' + ORO + ',.24)';
      g.lineWidth = 2.4 * DPR;
      g.beginPath();
      TEVERE.forEach(function (t, i) {
        var p = proietta(t[0], t[1]);
        i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y);
      });
      g.stroke();
      /* gli isolati: una maglia in assonometria, più densa al centro */
      isolati = [];
      var seme = 11;
      function caso() { seme = (seme * 1103515245 + 12345) % 2147483648;
        return seme / 2147483648; }
      var passo = (mob ? 620 : 520);   /* metri per isolato */
      for (var gy = -6; gy <= 6; gy++) for (var gx = -7; gx <= 7; gx++) {
        var lat = LAT + (gy * passo) / 110540;
        var lng = LNG + (gx * passo) / (111320 * Math.cos(LAT * Math.PI / 180));
        var p = proietta(lat, lng);
        if (p.x < -60 * DPR || p.x > W + 60 * DPR) continue;
        if (p.y < -40 * DPR || p.y > H + 60 * DPR) continue;
        var d = Math.sqrt(gx * gx + gy * gy);
        var vicino = Math.max(.18, 1 - d / 7);
        var h = (6 + caso() * 26 * vicino) * DPR * (mob ? .8 : 1);
        isolati.push({ p: p, w: passo * .62 * K, d: passo * .62 * K,
          h: h, forza: vicino });
      }
      /* dal fondo al davanti: la profondità si costruisce così */
      isolati.sort(function (a, b) { return a.p.y - b.p.y; });
      isolati.forEach(function (b) {
        blocco(g, b.p, b.w, b.d, b.h, b.forza); });
    }
    /* ── i pin: una casa, una torre d'oro ─────────────────────────────── */
    var tasti = document.getElementById('skyTasti');
    var fila = document.getElementById('skyFila');
    var sky = tela.closest('.sky');
    var scelta = null, faro = 0;
    function piazza() {
      var rifai = tasti.children.length !== CASE.length;
      if (rifai) { tasti.innerHTML = ''; fila.innerHTML = ''; }
      CASE.forEach(function (c, i) {
        var p = proietta(c.lat, c.lng);
        c._p = p;
        var b = rifai ? document.createElement('button') : tasti.children[i];
        if (rifai) {
          b.type = 'button';
          b.setAttribute('aria-label', c.nome + ' — ' + c.zona + ', ' + c.da
            + (c.si ? ', available now' : ''));
        }
        b.style.left = (p.x / DPR) + 'px';
        b.style.top = ((p.y - c.alt) / DPR) + 'px';
        if (!rifai) return;
        var c2 = document.createElement('button');
        c2.type = 'button'; c2.textContent = c.zona;
        c2.setAttribute('aria-label', c.nome + ' — ' + c.zona + ', ' + c.da);
        var scegli = function () {
          scelta = c; faro = performance.now();
          [].slice.call(tasti.children).forEach(function (x, k) {
            x.classList.toggle('on', k === i); });
          [].slice.call(fila.children).forEach(function (x, k) {
            x.classList.toggle('on', k === i); });
          sky.classList.add('scelto');
          document.getElementById('skyNome').textContent = c.nome;
          document.getElementById('skyDati').textContent =
            c.zona + ' · ' + c.da + (c.si ? ' · available now' : ' · ' + c.stato);
          document.getElementById('skyPiena').setAttribute('href', CASA_URL + c.id);
          accendi();
        };
        b.addEventListener('mouseenter', scegli);
        b.addEventListener('focus', scegli);
        b.addEventListener('click', function () {
          scegli(); location.href = CASA_URL + c.id; });
        c2.addEventListener('click', function () {
          if (scelta === c) location.href = CASA_URL + c.id;
          else { scegli(); c2.scrollIntoView({ inline: 'center',
            block: 'nearest', behavior: 'smooth' }); }
        });
        tasti.appendChild(b); fila.appendChild(c2);
      });
    }
    var CASA_URL = 'CASA_BASE';
    function vita(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(citta, 0, 0);
      /* le torri delle case: dal fondo al davanti */
      var ord = CASE.slice().sort(function (a, b) { return a._p.y - b._p.y; });
      ord.forEach(function (c) {
        var p = c._p, viva = c.si;
        var scelto = scelta === c;
        var respiro = ridotto ? 0 : .5 + .5 * Math.sin(t * .0016 + c.fase);
        var h = c.alt * (scelto ? 1.18 : 1);
        /* il fusto */
        var gr = ctx.createLinearGradient(p.x, p.y, p.x, p.y - h);
        gr.addColorStop(0, 'rgba(' + ORO + ',0)');
        gr.addColorStop(1, 'rgba(' + ORO + ',' + (viva ? .55 : .22)
          + (scelto ? '' : '') + ')');
        ctx.strokeStyle = gr;
        ctx.lineWidth = (scelto ? 2.6 : 1.6) * DPR;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h); ctx.stroke();
        /* la luce in punta */
        var raggio = (scelto ? 4.6 : 3) * DPR;
        ctx.fillStyle = viva
          ? 'rgba(255,248,220,' + (.55 + respiro * .45) + ')'
          : 'rgba(' + LATTE + ',.4)';
        ctx.beginPath(); ctx.arc(p.x, p.y - h, raggio, 0, 6.29); ctx.fill();
        if (viva && !ridotto) {
          var pr = ((t * .00035 + c.fase) % 1);
          ctx.strokeStyle = 'rgba(' + ORO + ',' + (.3 * (1 - pr)) + ')';
          ctx.lineWidth = DPR;
          ctx.beginPath();
          ctx.arc(p.x, p.y - h, (3 + pr * 16) * DPR, 0, 6.29); ctx.stroke();
        }
        /* l'ombra sull'isolato */
        ctx.fillStyle = 'rgba(' + ORO + ',' + (scelto ? .3 : .12) + ')';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 5 * DPR, 2.4 * DPR, 0, 0, 6.29); ctx.fill();
      });
      /* il nome, solo per la casa scelta */
      if (scelta) {
        var e = ridotto ? 1 : Math.min(1, (t - faro) / 380);
        var p2 = scelta._p;
        var testo = scelta.zona.toUpperCase().split('').join('\\u200a');
        ctx.font = '600 ' + (mob ? 8 : 9) * DPR + 'px Inter, sans-serif';
        ctx.textAlign = 'center';
        var lar = ctx.measureText(testo).width;
        var tx = Math.max(lar / 2 + 6 * DPR,
          Math.min(W - lar / 2 - 6 * DPR, p2.x));
        ctx.fillStyle = 'rgba(' + ORO + ',' + (.92 * e) + ')';
        ctx.fillText(testo, tx, p2.y - scelta.alt * 1.18 - 12 * DPR);
      }
    }
    var girando = false, visibile = false, ultimo = 0;
    function giro(t) {
      if (!girando) return;
      if (t - ultimo < 28) { requestAnimationFrame(giro); return; }
      ultimo = t; vita(t); requestAnimationFrame(giro);
    }
    function accendi() {
      if (girando || !visibile || document.hidden || ridotto) return;
      girando = true; requestAnimationFrame(giro);
    }
    function spegni() { girando = false; }
    CASE.forEach(function (c, i) {
      c.fase = (i * 2.4) % 6.28;
      c.alt = 0;   /* misurata dopo, in misura() */
    });
    misura();
    CASE.forEach(function (c) {
      c.alt = (c.si ? 46 : 30) * DPR * (mob ? .8 : 1); });
    piazza(); vita(0);
    if (!ridotto) {
      new IntersectionObserver(function (vs) {
        visibile = vs[0].isIntersecting;
        visibile ? accendi() : spegni();
      }, { threshold: .1 }).observe(tela);
      document.addEventListener('visibilitychange', function () {
        document.hidden ? spegni() : accendi(); });
    }
    var attesa;
    addEventListener('resize', function () {
      clearTimeout(attesa);
      attesa = setTimeout(function () {
        misura();
        CASE.forEach(function (c) {
          c.alt = (c.si ? 46 : 30) * DPR * (mob ? .8 : 1); });
        piazza(); vita(performance.now());
      }, 200);
    }, { passive: true });
  }
'''
s = s[:ia2] + MOTORE + s[ib2:]

# ── 4 · IL LOGO: presenza da marchio, non da segnaposto ────────────────
sost(""".marchio .logo-mark { width:48px; height:48px; flex:none; }
.marchio span { font-family:var(--display); font-size:19.5px; font-weight:400;
  letter-spacing:.34em; text-indent:.34em; text-transform:uppercase; }
@media (max-width:640px){
  .marchio .logo-mark { width:47px; height:47px; }
  .marchio span { font-size:19.5px; } }""",
""".marchio .logo-mark { width:56px; height:56px; flex:none; }
.marchio span { font-family:var(--display); font-size:23px; font-weight:400;
  letter-spacing:.36em; text-indent:.36em; text-transform:uppercase; }
@media (max-width:640px){
  .marchio { gap:9px; }
  .marchio .logo-mark { width:52px; height:52px; }
  .marchio span { font-size:21px; letter-spacing:.3em; text-indent:.3em; } }""",
     'logo più grande')

# ── 5 · LE RECENSIONI: un accenno, senza ingombrare ────────────────────
sost("""      <div class="board-piede"><span><b>DISPONIBILI</b> homes available now</span>
        <span>Catalogue updated <b>AGGIORNATO</b></span></div>
    </aside>""",
"""      <div class="board-piede"><span><b>DISPONIBILI</b> homes available now</span>
        <span>Catalogue updated <b>AGGIORNATO</b></span></div>
    </aside>
    <a class="recensioni" href="RECENSIONI_URL" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7z"/></svg>
      <span>What our tenants write about us</span>
      <i>Google reviews ↗</i>
    </a>""", 'recensioni')
sost("""/* la strip d'imbarco: quattro fatti, onesti */""",
"""/* le recensioni: un filo sotto il tabellone, mai un cartello */
.recensioni { display:flex; align-items:center; gap:10px; margin-top:10px;
  padding:11px 14px; background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line-0); transition:.3s ease; }
.recensioni:hover { box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.recensioni svg { width:15px; height:15px; flex:none; fill:var(--gold);
  opacity:.85; }
.recensioni span { flex:1; min-width:0; font-size:12px; color:var(--text-3); }
.recensioni i { font-style:normal; font-size:9.5px; font-weight:600;
  letter-spacing:.12em; text-transform:uppercase; color:var(--gold);
  white-space:nowrap; }

/* la strip d'imbarco: quattro fatti, onesti */""", 'css recensioni')

# ── 6 · IL PIEDE: il marchio è registrato, si scrive ───────────────────
sost("""        <p class="piede-legale"><b>Egidi Immobiliare S.r.l.</b><br>
          Via dei Coronari 181/184, 00186 Roma · P.IVA 17322991005</p>""",
"""        <p class="piede-legale"><b>BOOM®</b> is a registered trademark of
          <b>Egidi Immobiliare S.r.l.</b><br>
          Via dei Coronari 181/184, 00186 Roma · P.IVA 17322991005 ·
          Licensed real-estate agency</p>""", 'piede marchio')
open('pt.html', 'w').write(s)
print('skyline vero + logo + recensioni + marchio')

# ── 7 · il builder: le case con coordinate, e il link alle recensioni ──
b = open('costruisci-portale.py').read()
v = """SKY.sort(key=lambda x: x['lng'])
h = h.replace("'SKY_JSON'", json.dumps(SKY, ensure_ascii=False))"""
n = """SKY.sort(key=lambda x: x['lng'])
# la Skyline vuole le CASE, non le zone: ognuna alle sue coordinate
SKYCASE = []
for r in piene:
    if r.get('status') not in ('available','reserved','waitlist'): continue
    if not r.get('lat') or not r.get('lng') or not r.get('name'): continue
    p = int(re.sub(r'[^\\d]','',str(r.get('price') or '')) or 0)
    if not p: continue
    SKYCASE.append({
        'id': r.get('_id') or r.get('id'),
        'nome': re.sub(r'\\s+',' ',r['name']).strip(),
        'zona': re.sub(r'\\s+',' ',str(r.get('zone') or 'Roma')).split('/')[0].strip(),
        'lat': float(r['lat']), 'lng': float(r['lng']),
        'da': euro(p), 'si': r['status'] == 'available',
        'stato': 'reserved' if r['status'] in ('reserved','waitlist') else 'rented'})
h = h.replace("'SKY_JSON'", json.dumps(SKYCASE, ensure_ascii=False))
h = h.replace('CASA_BASE', CASA + '#id=' if MODO == 'artefatto'
    else '/v2-listing.html#id=')
h = h.replace('RECENSIONI_URL',
    'https://www.google.com/maps?q=Egidi+Immobiliare+Via+dei+Coronari+Roma')"""
assert b.count(v) == 1, 'builder skycase'
b = b.replace(v, n)
# CASA serve anche in modo sito
v = """    CASA = 'https://claude.ai/code/artifact/a65a8cb4-bfe1-49a5-acaf-2c4a1a992321'"""
n = """    CASA = 'https://claude.ai/code/artifact/db7c3240-a12d-4734-9eb7-06a780584231'"""
assert b.count(v) == 1, 'casa url'
b = b.replace(v, n)
open('costruisci-portale.py', 'w').write(b)
print('builder: SKY_JSON con le case, recensioni, casa aggiornata')
