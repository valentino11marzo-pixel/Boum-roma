#!/usr/bin/env python3
# LA CASA VIVA — tre cose:
#   · via la carta «See it live free» dalla pellicola: sapeva di upsell.
#     Il video live gratis diventa una PORTICINA, dove stanno i servizi.
#   · LE PORTICINE: i tre servizi contestuali in fondo alla pagina, prima
#     delle altre case — video live gratis (questa casa), PFS €350,
#     DAS €249 (+ €89 di viewing sui portali, accreditato). Compatte,
#     oneste, nella grammatica delle porte della banchina.
#   · L'IDRANTE: in modalita sito la pagina rilegge il SUO documento su
#     Firestore — il bot di Valentino aggiorna deposito/prezzo/stato in
#     ogni momento, e la pagina riscrive denaro, stato, durata e FAQ da
#     sola. Una verita sola: quella vera.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('ld-corpo.html', 'ld-regia.html'):
    shutil.copy(f, f + '.bak')

# ═══ LD-CORPO ═══════════════════════════════════════════════════════════
s = leggi('ld-corpo.html')

# le porticine, prima delle altre case
i = s.index('Three more,')
j = s.rindex('<section', 0, i)
s = s[:j] + """<!-- ══ LE PORTICINE — i servizi, dove servono e senza rumore ═════════════ -->
<section class="sezione" id="porticine">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Services · flat prices</span>
      <h2 class="titolo">Three ways we can <span class="hl">step in</span>.</h2>
    </div>
    <div class="porticine sale">
      <a class="porticina" id="portaVideo" href="#" target="_blank"
        rel="noopener">
        <b>See this flat live, from anywhere</b>
        <span>A BOOM agent walks it on live video — you direct, you ask,
          we answer on camera.</span>
        <i class="verde">Free — our home, our job</i>
      </a>
      <a class="porticina" href="/property-finding.html">
        <b>Let the machine hunt for you</b>
        <span>Your brief becomes a live search: the whole market,
          off-market included, human-verified.</span>
        <i>€350 · deducted on success — refunded if we fail</i>
      </a>
      <a class="porticina" href="/deal-assistance.html">
        <b>Found one on a portal?</b>
        <span>We verify the landlord, the papers and the price — then
          negotiate. Start with an €89 live viewing of their listing,
          credited if you rent through us.</span>
        <i>€249 · flat</i>
      </a>
    </div>
  </div>
</section>

""" + s[j:]

# il css
s = uno(s, '</style>', """
/* ══ LE PORTICINE ══════════════════════════════════════════════════════ */
.porticine { margin-top:clamp(18px,2.2vw,26px); display:grid; gap:1px;
  background:var(--line-0); box-shadow:inset 0 0 0 1px var(--line-0);
  grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); }
.porticina { position:relative; display:flex; flex-direction:column;
  gap:6px; padding:17px 18px 16px; background:var(--surface);
  transition:background .3s var(--ease); }
.porticina::before { content:''; position:absolute; top:0; left:0; right:0;
  height:1px; background:var(--gold); transform:scaleX(0);
  transform-origin:left; transition:transform .42s var(--ease); }
.porticina:hover { background:var(--elevated); }
.porticina:hover::before { transform:scaleX(1); }
.porticina b { font-size:13.5px; font-weight:500; color:var(--text);
  line-height:1.35; }
.porticina span { font-size:11.5px; line-height:1.55; color:var(--text-4); }
.porticina i { margin-top:4px; font-style:normal; font-size:11px;
  font-weight:600; letter-spacing:.05em; color:var(--gold); }
.porticina i.verde { color:var(--green); }
</style>""", 'css porticine')
scrivi('ld-corpo.html', s)

# ═══ LD-REGIA ═══════════════════════════════════════════════════════════
s = leggi('ld-regia.html')

# ── via la carta upsell dalla pellicola ─────────────────────────────────
s = uno(s, """    } else {
      /* casa NOSTRA: fartela vedere e il nostro lavoro, la visita in
         video dal vivo e GRATIS. Il Virtual Viewing a €89 esiste per le
         case degli altri portali, non qui. */
      var a = document.createElement('a');
      a.className = 'pel-v azione';
      a.href = 'https://wa.me/393313251961?text='
        + encodeURIComponent('Hi! I\\'d like a live video viewing of "'
            + c.nome + '" — when is the next slot?');
      a.target = '_blank'; a.rel = 'noopener';
      a.style.marginTop = '12px';
      a.style.borderRadius = '14px';
      a.style.boxShadow = 'inset 0 0 0 1px var(--line-gold)';
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/>'
        + '<path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>'
        + '<circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg>'
        + '<span><b>See it live from where you are — free.</b>'
        + '<span>A BOOM agent walks this exact flat on live video, with you '
        + 'asking the questions. <em>Our home, our job — no charge.</em> '
        + 'Book a slot on WhatsApp.</span></span>';
      pel.appendChild(a);
    }""",
"""    }
    /* la visita video gratis non e un upsell da riquadro: sta con i
       servizi, nelle porticine in fondo — e nelle FAQ, come sempre */""",
'via carta upsell')

# ── i ganci per l'idrante: stato, canone, soldi, durata, FAQ, presa ─────
s = uno(s, """  var st = per('#statoCasa');
  /* lo stato e l'informazione piu volatile della pagina: si vede che e viva */
  st.textContent = c.stato;
  st.className = 'stato-grande ' + (c.libera ? 'libera'
    : /wait/i.test(c.stato) ? 'attesa' : 'presa');""",
"""  var st = per('#statoCasa');
  /* lo stato e l'informazione piu volatile della pagina: si vede che e viva */
  function scriviStato() {
    st.textContent = c.stato;
    st.className = 'stato-grande ' + (c.libera ? 'libera'
      : /wait/i.test(c.stato) ? 'attesa' : 'presa');
  }
  scriviStato();
  var rifaiDurata = function () {}, rifaiPresa = function () {},
      rifaiPorte = function () {};""", 'stato funzione')

s = uno(s, """  var canone = per('#canoneCasa');
  canone.dataset.p = euro(c.prezzo);
  canone.setAttribute('aria-label', euro(c.prezzo) + ' per month');
  if (BS) {
    var bo = new BS.Board(canone, euro(c.prezzo).length, ' €,.0123456789');
    setTimeout(function () {
      ridotto ? bo.show(euro(c.prezzo)) : bo.show(euro(c.prezzo), 60, true);
    }, 500);
  } else canone.textContent = euro(c.prezzo);""",
"""  var canone = per('#canoneCasa');
  var mostraCanone = (function () {
    var bo = null, largo = 0;
    return function (subito) {
      var t = euro(c.prezzo);
      canone.dataset.p = t;
      canone.setAttribute('aria-label', t + ' per month');
      if (!BS) { canone.textContent = t; return; }
      if (!bo || t.length !== largo) {
        canone.innerHTML = ''; largo = t.length;
        bo = new BS.Board(canone, largo, ' €,.0123456789');
      }
      (ridotto || subito) ? bo.show(t) : bo.show(t, 60, true);
    };
  })();
  setTimeout(function () { mostraCanone(false); }, 500);""", 'canone funzione')

s = uno(s, """  var mesiCauzione = c.cauzioneMesi || 1;
  var cauzione = c.prezzo * mesiCauzione;
  var onorario = Math.round(c.prezzo * 12 * .10);
  var totale = c.prezzo + cauzione + onorario;   /* il giorno uno intero, per le domande */
  /* la cifra grande e il giorno uno INTERO: canone + deposito + onorario.
     Nessuna voce a margine — il deposito e un pagamento vero, e torna,
     ed e scritto in verde sulla sua riga. Un numero, una storia. */
  var chiavi = totale;
  per('#voceCanone').textContent = euro(c.prezzo);
  per('#voceOnorario').textContent = euro(onorario);
  per('#voceCauzione').textContent = euro(cauzione);
  per('#chiaviOnorario').textContent = euro(onorario);""",
"""  /* la cifra grande e il giorno uno INTERO: canone + deposito + onorario.
     Nessuna voce a margine — il deposito e un pagamento vero, e torna,
     ed e scritto in verde sulla sua riga. Un numero, una storia. */
  var cauzione, onorario, totale;
  function contiSoldi() {
    var mesi = c.cauzioneMesi || 1;
    cauzione = c.prezzo * mesi;
    onorario = Math.round(c.prezzo * 12 * .10);
    totale = c.prezzo + cauzione + onorario;
    per('#voceCanone').textContent = euro(c.prezzo);
    per('#voceOnorario').textContent = euro(onorario);
    per('#voceCauzione').textContent = euro(cauzione);
    per('#chiaviOnorario').textContent = euro(onorario);
  }
  contiSoldi();""", 'soldi funzione')

s = uno(s, """  (function () {
    var host = document.getElementById('totFlap');
    if (!host) return;
    var testo = euro(chiavi);
    var quadro = null;
    var BS = window.BoomSolari;
    if (BS && BS.Board) {
      quadro = new BS.Board(host, testo.length, ' €,.0123456789');
      var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (ridotto || !('IntersectionObserver' in window)) quadro.show(testo);
      else new IntersectionObserver(function (v, io) {
        if (!v[0].isIntersecting) return;
        io.disconnect(); quadro.show(testo, 46, true);
      }, { threshold: .35 }).observe(host);
    } else { host.textContent = testo; }
  })();""",
"""  var mostraTotale = function () {};
  (function () {
    var host = document.getElementById('totFlap');
    if (!host) return;
    var quadro = null, largo = 0;
    function scrivi(subito) {
      var testo = euro(totale);
      if (!BS || !BS.Board) { host.textContent = testo; return; }
      if (!quadro || testo.length !== largo) {
        host.innerHTML = ''; largo = testo.length;
        quadro = new BS.Board(host, largo, ' €,.0123456789');
      }
      (ridotto || subito) ? quadro.show(testo) : quadro.show(testo, 46, true);
    }
    mostraTotale = scrivi;
    if (ridotto || !('IntersectionObserver' in window)) scrivi(true);
    else new IntersectionObserver(function (v, io) {
      if (!v[0].isIntersecting) return;
      io.disconnect(); scrivi(false);
    }, { threshold: .35 }).observe(host);
  })();""", 'totale funzione')

s = uno(s, """    var tasti = [].slice.call(document.querySelectorAll('.durata-tasti button'));
    if (!tasti.length) return;
    function conta(m) {
      var canoni = c.prezzo * m;""",
"""    var tasti = [].slice.call(document.querySelectorAll('.durata-tasti button'));
    if (!tasti.length) return;
    var mScelto = 12;
    function conta(m) {
      mScelto = m;
      var canoni = c.prezzo * m;""", 'durata memoria')
s = uno(s, """    tasti.forEach(function (t) {
      t.addEventListener('click', function () { conta(Number(t.dataset.m)); });
    });
    conta(12);
  })();""",
"""    tasti.forEach(function (t) {
      t.addEventListener('click', function () { conta(Number(t.dataset.m)); });
    });
    conta(12);
    rifaiDurata = function () { conta(mScelto); };
  })();""", 'durata rifai')

# le FAQ diventano una funzione richiamabile
s = uno(s, """  (function () {
    var lista = document.getElementById('chiediLista');
    if (!lista) return;
    var D = [""",
"""  function scriviChiedi() {
    var lista = document.getElementById('chiediLista');
    if (!lista) return;
    var D = [""", 'chiedi apre')
s = uno(s, """    } catch (err) {}
  })();""",
"""    } catch (err) {}
  }
  scriviChiedi();""", 'chiedi chiude')

# la presa si puo ricalcolare
s = uno(s, """    var attesa2 = /wait/i.test(c.stato);
    if (!c.libera && !attesa2) {
      /* casa presa: niente finta corsia di prenotazione */
      var card = document.getElementById('presaCasa');
      if (card) card.style.display = 'none';
      return;
    }
    if (attesa2) document.getElementById('presaTitolo').textContent =
      'Priority hold — first in line when it frees up.';""",
"""    var card = document.getElementById('presaCasa');
    rifaiPresa = function () {
      var attesa2 = /wait/i.test(c.stato);
      /* casa presa: niente finta corsia di prenotazione */
      if (card) card.style.display = (!c.libera && !attesa2) ? 'none' : '';
      document.getElementById('presaTitolo').textContent = attesa2
        ? 'Priority hold — first in line when it frees up.'
        : 'Seen enough? Take it off the market.';
    };
    rifaiPresa();""", 'presa rifai')

# ── le porticine + l'idrante, prima delle altre case ────────────────────
s = uno(s, "  /* ── le altre case: tre, della stessa mano ──────────────────────────── */",
"""  /* ── le porticine: il video live di QUESTA casa, coi suoi dati ──────── */
  (function () {
    var pv = document.getElementById('portaVideo');
    if (!pv) return;
    rifaiPorte = function () {
      var vivo = c.libera || /wait/i.test(c.stato);
      pv.style.display = vivo ? '' : 'none';
      pv.href = 'https://wa.me/393313251961?text=' + encodeURIComponent(
        'Hi! I\\'d like a live video viewing of "' + c.nome
        + '" — when is the next slot?');
    };
    rifaiPorte();
  })();

  /* ── L'IDRANTE: la pagina resta viva sui dati del bot ─────────────────
     Il builder fotografa il catalogo, ma Firestore cambia in ogni
     momento — il bot aggiorna deposito, prezzo, stato. In modalita sito
     la pagina rilegge il SUO documento e, se i numeri sono cambiati,
     riscrive stato, denaro, durata, FAQ, presa e porticine da sola.
     Una verita sola: quella vera. Se la rete manca, restano i numeri
     del builder — mai una pagina rotta. */
  if (VERO) setTimeout(function () {
    fetch('https://firestore.googleapis.com/v1/projects/'
        + 'boom-property-dashboards/databases/(default)/documents/listings/'
        + encodeURIComponent(c.id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.fields) return;
        var f = j.fields;
        function nume(k) {
          var v = f[k]; if (!v) return null;
          var n = parseFloat(v.integerValue || v.doubleValue
            || v.stringValue);
          return isFinite(n) && n > 0 ? n : null;
        }
        function testo(k) {
          var v = f[k]; return v ? String(v.stringValue || '') : '';
        }
        var cambia = false;
        var p2 = nume('price');
        if (p2 && p2 !== c.prezzo) { c.prezzo = p2; cambia = true; }
        var m2 = nume('depositMonths');
        if (m2 && m2 !== c.cauzioneMesi) {
          c.cauzioneMesi = m2; cambia = true;
        }
        var s2 = testo('status').toLowerCase();
        if (s2) {
          var d2 = (testo('availableDate')
            .match(/^\\d{4}-\\d{2}-\\d{2}/) || [])[0] || c.dal;
          var oggi2 = new Date().toISOString().slice(0, 10);
          var eti, lib;
          if (s2 === 'available') {
            if (d2 && d2 > oggi2) {
              var dt = new Date(d2 + 'T12:00:00');
              eti = 'From ' + dt.getDate() + ' ' + dt.toLocaleDateString(
                'en-GB', { month: 'short' });
              if (dt.getFullYear() !== new Date().getFullYear())
                eti += ' ' + dt.getFullYear();
            } else eti = 'Available now';
            lib = true;
          } else if (s2 === 'waitlist') { eti = 'Waitlist open'; lib = false; }
          else if (s2 === 'reserved') { eti = 'Reserved'; lib = false; }
          else { eti = 'Rented'; lib = false; }
          if (eti !== c.stato || lib !== c.libera || d2 !== c.dal) {
            c.stato = eti; c.libera = lib; c.dal = d2; cambia = true;
          }
        }
        if (!cambia) return;
        scriviStato(); contiSoldi(); mostraTotale(true); mostraCanone(true);
        rifaiDurata(); scriviChiedi(); rifaiPresa(); rifaiPorte();
      })
      .catch(function () { /* niente rete: restano i numeri del builder */ });
  }, 600);

  /* ── le altre case: tre, della stessa mano ──────────────────────────── */""",
'porticine + idrante')
scrivi('ld-regia.html', s)
print('casa viva: fatta')
