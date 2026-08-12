#!/usr/bin/env python3
# LO SKYLINE — Roma disegnata dal codice, e usata come strumento:
# i quartieri stanno alla loro longitudine vera, si toccano, portano alle case.
s = open('pt.html').read()
def sost(v, n, dove):
    global s
    assert s.count(v) == 1, 'NON TROVATO/DOPPIO: ' + dove
    s = s.replace(v, n)

# ── la sezione, subito dopo le case della settimana ────────────────────
sost("""<!-- ══ I SERVIZI — sei porte, una fila ═══════════════════════════════════ -->""",
"""<!-- ══ LO SKYLINE — la città come strumento ═════════════════════════════ -->
<section class="sezione" id="skyline">
  <div class="container">
    <div class="testa-fila sale">
      <div>
        <span class="eyebrow"><i></i>The city, as an instrument</span>
        <h2 class="titolo">Where do you want to <span class="hl">wake up</span>?</h2>
        <p class="sotto">Rome, drawn to scale: every district sits at its real
          place on the map. Touch one.</p>
      </div>
    </div>

    <div class="sky sale">
      <canvas id="skyTela" aria-hidden="true"></canvas>
      <div class="sky-tasti" id="skyTasti"></div>
      <div class="sky-carta" id="skyCarta" aria-live="polite">
        <div class="sky-vuota" id="skyVuota">
          <b>Pick a district</b>
          <span>Or let the board choose for you.</span>
        </div>
        <a class="sky-piena" id="skyPiena" href="/apartments.html">
          <div>
            <b id="skyNome">—</b>
            <span id="skyDati">—</span>
          </div>
          <i>See homes →</i>
        </a>
      </div>
    </div>
  </div>
</section>

<!-- ══ I SERVIZI — sei porte, una fila ═══════════════════════════════════ -->""",
     'sezione skyline')

# ── il vestito ──────────────────────────────────────────────────────────
sost("""/* ══ IL FONDATORE ══════════════════════════════════════════════════════ */""",
"""/* ══ LO SKYLINE — la città disegnata, e usabile ════════════════════════ */
.sky { position:relative; margin-top:clamp(20px,2.6vw,32px); }
.sky canvas { display:block; width:100%; height:clamp(190px,26vw,340px); }
.sky-tasti { position:absolute; left:0; right:0; top:0;
  height:clamp(190px,26vw,340px); }
.sky-tasti button { position:absolute; bottom:0; width:34px; height:64%;
  transform:translateX(-50%); padding:0; border:0; background:none;
  cursor:pointer; }
.sky-tasti button::after { content:''; position:absolute; left:50%; bottom:14%;
  width:7px; height:7px; margin-left:-3.5px; border-radius:50%;
  background:var(--gold); opacity:.5; transition:opacity .3s ease,
    transform .3s var(--ease); }
.sky-tasti button:hover::after, .sky-tasti button.on::after,
.sky-tasti button:focus-visible::after { opacity:1; transform:scale(1.5); }
.sky-tasti button:focus-visible { outline:2px solid var(--gold);
  outline-offset:2px; border-radius:6px; }
.sky-carta { margin-top:14px; min-height:74px; }
.sky-vuota { display:flex; flex-direction:column; gap:3px; padding:16px 18px;
  box-shadow:inset 0 0 0 1px var(--line-0); }
.sky-vuota b { font-family:var(--display); font-size:16px; font-weight:300;
  color:var(--text-2); }
.sky-vuota span { font-size:12px; color:var(--text-4); }
.sky-piena { display:none; align-items:center; justify-content:space-between;
  gap:16px; padding:16px 18px; background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line-gold-2);
  transition:box-shadow .3s ease, background .3s ease; }
.sky-piena:hover { background:var(--elevated);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.sky.scelto .sky-vuota { display:none; }
.sky.scelto .sky-piena { display:flex; }
.sky-piena b { display:block; font-family:var(--display); font-size:20px;
  font-weight:300; letter-spacing:.02em; }
.sky-piena span { display:block; margin-top:3px; font-size:12px;
  color:var(--text-3); font-variant-numeric:tabular-nums; }
.sky-piena i { font-style:normal; font-size:10.5px; font-weight:600;
  letter-spacing:.12em; text-transform:uppercase; color:var(--gold);
  white-space:nowrap; transition:transform .3s var(--ease); }
.sky-piena:hover i { transform:translateX(4px); }
@media (max-width:640px){
  .sky canvas, .sky-tasti { height:200px; }
  .sky-tasti button { width:30px; }
  .sky-piena b { font-size:17px; } }

/* ══ IL FONDATORE ══════════════════════════════════════════════════════ */""",
     'css skyline')

# ── il modulo ───────────────────────────────────────────────────────────
sost("""  function mosaicoRomano() {""",
"""  function skylineRoma() {
    /* LO SKYLINE — Roma dal codice. I monumenti alla loro longitudine
       vera, i quartieri del catalogo dove stanno davvero. Lo strato
       della città si posa una volta; solo il fascio di luce vive. */
    var tela = document.getElementById('skyTela');
    if (!tela || !tela.getContext) return;
    var ZONE = 'SKY_JSON';
    if (!ZONE.length) return;
    var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mob = matchMedia('(max-width: 640px)').matches;
    var ctx = tela.getContext('2d');
    var ORO = '255,215,0', LATTE = '250,248,240';
    var W, H, DPR, suolo, citta, luci;
    /* i monumenti, alla loro longitudine reale */
    var MONUMENTI = [
      { lng: 12.4534, tipo: 'sanpietro', h: 1.00, nome: 'San Pietro' },
      { lng: 12.4663, tipo: 'castello',  h: .52, nome: "Castel Sant'Angelo" },
      { lng: 12.4768, tipo: 'pantheon',  h: .46, nome: 'Pantheon' },
      { lng: 12.4813, tipo: 'piramide',  h: .40, nome: 'Piramide Cestia' },
      { lng: 12.4828, tipo: 'vittoriano', h: .62, nome: 'Vittoriano' },
      { lng: 12.4922, tipo: 'colosseo',  h: .55, nome: 'Colosseo' },
      { lng: 12.5060, tipo: 'pino',      h: .58, nome: '' },
      { lng: 12.4600, tipo: 'pino',      h: .50, nome: '' },
      { lng: 12.5230, tipo: 'pino',      h: .54, nome: '' },
    ];
    var LNG0 = 12.446, LNG1 = 12.537;
    function ax(lng) { return ((lng - LNG0) / (LNG1 - LNG0)) * W; }

    function misura() {
      var r = tela.getBoundingClientRect();
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = Math.round(r.width * DPR); H = Math.round(r.height * DPR);
      tela.width = W; tela.height = H;
      suolo = H * .84;
      disegna();
      piazza();
    }

    /* ── i mattoni del disegno ─────────────────────────────────────── */
    function cupola(g, x, base, raggio, tamburo) {
      g.beginPath(); g.arc(x, base - tamburo, raggio, Math.PI, 0); g.stroke();
      g.beginPath();
      g.moveTo(x - raggio, base - tamburo); g.lineTo(x - raggio, base);
      g.moveTo(x + raggio, base - tamburo); g.lineTo(x + raggio, base);
      g.stroke();
      /* la lanterna */
      g.beginPath();
      g.moveTo(x, base - tamburo - raggio);
      g.lineTo(x, base - tamburo - raggio - raggio * .34);
      g.stroke();
      g.beginPath();
      g.arc(x, base - tamburo - raggio - raggio * .4, raggio * .11, 0, 6.29);
      g.stroke();
    }
    function colonne(g, x0, x1, base, alto, n) {
      for (var i = 0; i <= n; i++) {
        var x = x0 + (x1 - x0) * (i / n);
        g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - alto); g.stroke();
      }
      g.beginPath();
      g.moveTo(x0 - 2 * DPR, base - alto); g.lineTo(x1 + 2 * DPR, base - alto);
      g.stroke();
    }
    function monumento(g, m, alt) {
      var x = ax(m.lng), a = alt * m.h;
      if (m.tipo === 'sanpietro') {
        colonne(g, x - a * .95, x - a * .42, suolo, a * .26, 5);
        colonne(g, x + a * .42, x + a * .95, suolo, a * .26, 5);
        g.beginPath();
        g.moveTo(x - a * .34, suolo); g.lineTo(x - a * .34, suolo - a * .40);
        g.lineTo(x + a * .34, suolo - a * .40); g.lineTo(x + a * .34, suolo);
        g.stroke();
        cupola(g, x, suolo - a * .40, a * .30, a * .16);
      } else if (m.tipo === 'castello') {
        g.beginPath();
        g.moveTo(x - a * .62, suolo); g.lineTo(x - a * .62, suolo - a * .34);
        g.lineTo(x + a * .62, suolo - a * .34); g.lineTo(x + a * .62, suolo);
        g.stroke();
        g.beginPath();
        g.moveTo(x - a * .34, suolo - a * .34);
        g.lineTo(x - a * .34, suolo - a * .78);
        g.lineTo(x + a * .34, suolo - a * .78);
        g.lineTo(x + a * .34, suolo - a * .34);
        g.stroke();
        g.beginPath();
        g.moveTo(x, suolo - a * .78); g.lineTo(x, suolo - a);
        g.stroke();
      } else if (m.tipo === 'pantheon') {
        colonne(g, x - a * .58, x + a * .58, suolo, a * .52, 7);
        cupola(g, x, suolo - a * .52, a * .5, 0);
      } else if (m.tipo === 'piramide') {
        g.beginPath();
        g.moveTo(x - a * .52, suolo); g.lineTo(x, suolo - a);
        g.lineTo(x + a * .52, suolo); g.stroke();
      } else if (m.tipo === 'vittoriano') {
        g.beginPath();
        g.moveTo(x - a * .9, suolo); g.lineTo(x - a * .78, suolo - a * .22);
        g.lineTo(x + a * .78, suolo - a * .22); g.lineTo(x + a * .9, suolo);
        g.stroke();
        colonne(g, x - a * .62, x + a * .62, suolo - a * .22, a * .5, 9);
        g.beginPath();
        g.moveTo(x - a * .70, suolo - a * .72);
        g.lineTo(x + a * .70, suolo - a * .72); g.stroke();
      } else if (m.tipo === 'colosseo') {
        for (var p = 0; p < 3; p++) {
          var y = suolo - a * (.30 + p * .26);
          g.beginPath();
          g.moveTo(x - a * .72, y); g.lineTo(x + a * .72, y); g.stroke();
        }
        g.beginPath();
        g.moveTo(x - a * .72, suolo); g.lineTo(x - a * .72, suolo - a * .82);
        g.moveTo(x + a * .72, suolo); g.lineTo(x + a * .72, suolo - a * .82);
        g.stroke();
        for (var i2 = -2; i2 <= 2; i2++) {
          var ax2 = x + i2 * a * .28;
          g.beginPath();
          g.arc(ax2, suolo - a * .30, a * .1, Math.PI, 0); g.stroke();
          g.beginPath();
          g.arc(ax2, suolo - a * .56, a * .1, Math.PI, 0); g.stroke();
        }
      } else if (m.tipo === 'pino') {
        g.beginPath();
        g.moveTo(x, suolo); g.lineTo(x - a * .06, suolo - a * .62); g.stroke();
        g.beginPath();
        g.ellipse(x - a * .06, suolo - a * .72, a * .40, a * .19, 0, 0, 6.29);
        g.stroke();
      }
    }

    /* ── la città si posa una volta sola ───────────────────────────── */
    function disegna() {
      citta = document.createElement('canvas');
      citta.width = W; citta.height = H;
      var g = citta.getContext('2d');
      /* il cielo di Roma, appena caldo all'orizzonte */
      var cielo = g.createLinearGradient(0, suolo - H * .5, 0, suolo);
      cielo.addColorStop(0, 'rgba(255,215,0,0)');
      cielo.addColorStop(1, 'rgba(255,190,90,.07)');
      g.fillStyle = cielo;
      g.fillRect(0, 0, W, suolo);
      /* i palazzi: bassi, fitti, con qualche finestra accesa */
      luci = [];
      var seme = 7;
      function caso() { seme = (seme * 1103515245 + 12345) % 2147483648;
        return seme / 2147483648; }
      g.strokeStyle = 'rgba(' + LATTE + ',.11)';
      g.lineWidth = DPR;
      var x = -20 * DPR;
      while (x < W + 20 * DPR) {
        var w = (26 + caso() * 46) * DPR;
        var alt = (14 + caso() * 40) * DPR;
        g.strokeRect(x, suolo - alt, w, alt);
        if (caso() < .5) {
          var fx = x + w * (.25 + caso() * .5), fy = suolo - alt * (.3 + caso() * .5);
          luci.push({ x: fx, y: fy, fase: caso() * 9 });
        }
        x += w + 3 * DPR;
      }
      /* i monumenti, in oro */
      g.strokeStyle = 'rgba(' + ORO + ',.45)';
      g.lineWidth = 1.3 * DPR;
      g.lineCap = 'round'; g.lineJoin = 'round';
      var alt2 = H * (mob ? .46 : .52);
      MONUMENTI.forEach(function (m) { monumento(g, m, alt2); });
      /* la linea di terra */
      g.strokeStyle = 'rgba(' + ORO + ',.3)';
      g.lineWidth = DPR;
      g.beginPath(); g.moveTo(0, suolo); g.lineTo(W, suolo); g.stroke();
      /* le tacche dei quartieri */
      ZONE.forEach(function (z) {
        var zx = ax(z.lng);
        g.strokeStyle = 'rgba(' + ORO + ',' + (z.si ? .34 : .16) + ')';
        g.beginPath();
        g.moveTo(zx, suolo); g.lineTo(zx, suolo + 9 * DPR); g.stroke();
        g.font = '600 ' + (mob ? 6.5 : 7.5) * DPR + 'px Inter, sans-serif';
        g.fillStyle = 'rgba(' + LATTE + ',' + (z.si ? .42 : .24) + ')';
        g.textAlign = 'center';
        g.fillText(z.z.toUpperCase().split('').join('\\u200a'),
          zx, suolo + 22 * DPR);
      });
    }

    /* ── i tasti veri, sopra il disegno: tocco e tastiera ───────────── */
    var tasti = document.getElementById('skyTasti');
    var sky = tela.closest('.sky');
    var scelta = null, faro = 0;
    function piazza() {
      if (tasti.children.length === ZONE.length) {
        [].slice.call(tasti.children).forEach(function (b, i) {
          b.style.left = (ax(ZONE[i].lng) / DPR) + 'px'; });
        return;
      }
      tasti.innerHTML = '';
      ZONE.forEach(function (z, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.style.left = (ax(z.lng) / DPR) + 'px';
        b.setAttribute('aria-label', z.z + ' — ' + z.n
          + (z.n === 1 ? ' home' : ' homes') + ', from ' + z.da);
        var scegli = function () {
          scelta = z; faro = performance.now();
          [].slice.call(tasti.children).forEach(function (x, k) {
            x.classList.toggle('on', k === i); });
          sky.classList.add('scelto');
          document.getElementById('skyNome').textContent = z.z;
          document.getElementById('skyDati').textContent =
            z.n + (z.n === 1 ? ' home' : ' homes') + ' · from ' + z.da
            + (z.si ? ' · available now' : '');
          document.getElementById('skyPiena').setAttribute('href',
            AP_ZONA + encodeURIComponent(z.z));
          accendi();
        };
        b.addEventListener('mouseenter', scegli);
        b.addEventListener('focus', scegli);
        b.addEventListener('click', function () {
          scegli();
          location.href = AP_ZONA + encodeURIComponent(z.z);
        });
        tasti.appendChild(b);
      });
    }
    var AP_ZONA = 'AP_URL' + '#zona=';

    /* ── la vita: il fascio di luce e qualche finestra ──────────────── */
    function vita(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(citta, 0, 0);
      /* le finestre accese, lentissime */
      if (!ridotto) luci.forEach(function (l) {
        var b = .12 + .12 * Math.sin(t * .0007 + l.fase);
        ctx.fillStyle = 'rgba(255,225,150,' + b + ')';
        ctx.fillRect(l.x, l.y, 1.6 * DPR, 2.2 * DPR);
      });
      /* il fascio sul quartiere scelto */
      if (scelta) {
        var p = ridotto ? 1 : Math.min(1, (t - faro) / 520);
        var e = 1 - Math.pow(1 - p, 3);
        var zx = ax(scelta.lng);
        var g2 = ctx.createLinearGradient(0, suolo, 0, suolo - H * .9 * e);
        g2.addColorStop(0, 'rgba(' + ORO + ',.28)');
        g2.addColorStop(1, 'rgba(' + ORO + ',0)');
        ctx.fillStyle = g2;
        ctx.fillRect(zx - 13 * DPR, suolo - H * .9 * e, 26 * DPR, H * .9 * e);
        ctx.strokeStyle = 'rgba(' + ORO + ',' + (.5 * e) + ')';
        ctx.lineWidth = DPR;
        ctx.beginPath();
        ctx.moveTo(zx, suolo); ctx.lineTo(zx, suolo - H * .82 * e);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,248,220,' + (.85 * e) + ')';
        ctx.beginPath();
        ctx.arc(zx, suolo, 3 * DPR, 0, 6.29); ctx.fill();
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
    misura();
    vita(0);
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
      attesa = setTimeout(function () { misura(); vita(performance.now()); }, 200);
    }, { passive: true });
  }
  if (document.readyState === 'complete') setTimeout(skylineRoma, 0);
  else addEventListener('load', function () { setTimeout(skylineRoma, 0); });

  function mosaicoRomano() {""", 'modulo skyline')
open('pt.html', 'w').write(s)
print('skyline montato nella home')

# ── il builder: i quartieri con longitudine vera, quante case e da quanto
b = open('costruisci-portale.py').read()
v = """h = h.replace('AGGIORNATO', AGG)"""
n = """h = h.replace('AGGIORNATO', AGG)
# ── LO SKYLINE: i quartieri alla loro longitudine reale ────────────────
import statistics as _st
piene = json.load(open('case-full.json'))
coord, quante = {}, {}
for r in piene:
    if r.get('status') not in ('available','reserved','rented','waitlist'): continue
    if not r.get('nome') and not r.get('name'): continue
    z = re.sub(r'\\s+',' ',str(r.get('zone') or 'Roma')).split('/')[0].strip()
    quante.setdefault(z, []).append(r)
    if r.get('lng'): coord.setdefault(z, []).append(float(r['lng']))
SKY = []
for z, rr in quante.items():
    if z not in coord: continue
    pr = [int(re.sub(r'[^\\d]','',str(x.get('price') or '')) or 0) for x in rr]
    pr = [p for p in pr if p]
    disp = [x for x in rr if x['status'] == 'available']
    if not pr: continue
    SKY.append({'z': z, 'lng': round(_st.mean(coord[z]), 5), 'n': len(rr),
                'da': euro(min(pr)), 'si': bool(disp)})
SKY.sort(key=lambda x: x['lng'])
h = h.replace("'SKY_JSON'", json.dumps(SKY, ensure_ascii=False))"""
assert b.count(v) == 1, 'builder sky'
open('costruisci-portale.py', 'w').write(b.replace(v, n))
print('builder: SKY_JSON con longitudini vere')
