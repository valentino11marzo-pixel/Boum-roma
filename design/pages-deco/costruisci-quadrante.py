#!/usr/bin/env python3
# IL QUADRANTE — lo Skyline smette di nascondere le distanze.
#
# Fino a oggi le distanze dai punti d'interesse comparivano SOLO passando
# sopra un pin, e sparivano appena lo lasciavi (`showLinks`/`clearLinks`).
# Cioe': l'informazione per cui uno apre una mappa di case — «da qui, quanto
# ci metto?» — era un effetto al passaggio del mouse, e su un telefono, dove
# il passaggio del mouse non esiste, praticamente non c'era.
#
# Il Quadrante e' un pannello che non sparisce. A riposo e' la legenda della
# citta' e il filtro per minuti; quando scegli una casa diventa il cruscotto
# di QUELLA porta. Ogni numero porta il proprio grado di verita' — misurato
# dal Pendolare o stimato, e la stima si vede.
#
# La patch e' ancorata e ri-eseguibile: se un ancoraggio non e' unico, esce
# prima di scrivere.
import sys

SRC = 'design/pages-deco/skyline-base.html'   # la copia PRISTINA
F = 'skyline.html'


def uno(s, ago):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO: {n} occorrenze di {ago[:70]!r}')
        sys.exit(1)


s = open(SRC, encoding='utf-8').read()

# Si riparte SEMPRE dalla base pristina, mai dal file gia' costruito: la
# prima stesura provava a smontare le proprie modifiche per rifarle, e le
# giunzioni (che non sono blocchi delimitati) restavano indietro — al
# secondo giro non trovava piu' i propri ancoraggi. E' la stessa disciplina
# dei costruttori delle pagine servizio: base pristina, patch ancorata.

# ── 1 · il motore condiviso ────────────────────────────────────────────
AGO_TEMPI = '<script src="/js/tempi-engine.js"></script>'
if AGO_TEMPI in s:
    uno(s, AGO_TEMPI)
    s = s.replace(AGO_TEMPI, AGO_TEMPI + '\n<script src="/js/mappa-engine.js"></script>')
else:
    AGO_B = '<body>'
    uno(s, AGO_B)
    s = s.replace(AGO_B, AGO_B + '\n<script src="/js/mappa-engine.js"></script>')

# ── 2 · il vestito ─────────────────────────────────────────────────────
CSS = r'''/* ══ QUADRANTE:CSS ══ */
/* IL QUADRANTE — le distanze non spariscono piu'. A riposo e' la legenda
   della citta'; con una casa scelta e' il cruscotto di quella porta. */
.quad{position:absolute;z-index:11;left:16px;bottom:calc(16px + env(safe-area-inset-bottom));
  width:min(330px,calc(100vw - 32px));background:rgba(10,10,14,.82);
  -webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);
  border:1px solid rgba(255,255,255,.10);border-radius:18px;
  box-shadow:0 26px 70px rgba(0,0,0,.62);overflow:hidden;
  transition:transform .34s cubic-bezier(.22,1,.36,1),opacity .28s ease}
.quad-capo{display:flex;align-items:center;gap:10px;padding:12px 14px 11px;
  border-bottom:1px solid rgba(255,255,255,.07)}
.quad-capo .q-eti{flex:1;min-width:0}
.quad-capo b{display:block;font-family:var(--disp);font-weight:300;font-size:15px;
  color:#fff;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.quad-capo small{display:block;margin-top:2px;font-size:10px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--t3)}
.quad-x{flex:none;width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.14);
  background:transparent;color:var(--t2);font-size:14px;line-height:1;cursor:pointer;
  display:none;align-items:center;justify-content:center}
.quad.scelta .quad-x{display:flex}
.quad-x:hover{border-color:var(--gold);color:var(--gold)}
.quad-corpo{padding:6px 6px 8px;max-height:min(46vh,340px);overflow-y:auto;
  overscroll-behavior:contain}
/* L'elenco e' piu' alto del pannello, quindi l'ultima riga visibile viene
   TAGLIATA A META'. Senza un segno, una riga mozzata non si legge come
   «continua sotto»: si legge come una cosa rotta — e' esattamente cosi'
   che appariva nella prova a 390px. La sfumatura compare SOLO quando c'e'
   davvero altro da vedere (classe messa dal JS misurando lo scorrimento):
   una sfumatura sempre accesa direbbe «continua» anche su una lista
   finita, cioe' mentirebbe in piccolo. */
.quad-corpo.altro-giu{-webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 34px),transparent);
  mask-image:linear-gradient(180deg,#000 calc(100% - 34px),transparent)}
.quad-corpo.altro-su{-webkit-mask-image:linear-gradient(0deg,#000 calc(100% - 22px),transparent);
  mask-image:linear-gradient(0deg,#000 calc(100% - 22px),transparent)}
.quad-corpo.altro-su.altro-giu{
  -webkit-mask-image:linear-gradient(180deg,transparent,#000 22px,#000 calc(100% - 34px),transparent);
  mask-image:linear-gradient(180deg,transparent,#000 22px,#000 calc(100% - 34px),transparent)}
.qr{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:11px;
  transition:background .18s ease}
.qr:hover{background:rgba(255,255,255,.045)}
.qr .ic{flex:none;width:26px;height:26px;border-radius:8px;display:flex;
  align-items:center;justify-content:center;font-size:13px;
  background:rgba(255,215,0,.08);box-shadow:inset 0 0 0 1px rgba(255,215,0,.16)}
.qr .nm{flex:1;min-width:0}
.qr .nm b{display:block;font-size:12.5px;font-weight:400;color:#fff;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qr .nm span{display:block;font-size:10.5px;color:var(--t3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qr .tm{flex:none;text-align:right;font-variant-numeric:tabular-nums}
.qr .tm b{display:block;font-size:14px;font-weight:400;color:var(--gold);line-height:1.1}
.qr .tm i{display:block;font-style:normal;font-size:9px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--t4);margin-top:1px}
.qr.mio .ic{background:rgba(0,255,136,.08);box-shadow:inset 0 0 0 1px rgba(0,255,136,.22)}
.qr.mio .tm b{color:#00FF88}
.quad-nota{padding:2px 14px 12px;font-size:10.5px;line-height:1.5;color:var(--t4)}
.quad-nota b{color:var(--t3);font-weight:400}
/* il filtro per minuti: la domanda che nessun portale sa rispondere */
.quad-filtro{padding:10px 12px 12px;border-top:1px solid rgba(255,255,255,.07);
  background:rgba(255,255,255,.018)}
.qf-t{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--t3);
  margin-bottom:8px}
.qf-r{display:flex;gap:7px;align-items:center}
.qf-r select{flex:1;min-width:0;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.12);border-radius:9px;color:#fff;
  font:inherit;font-size:12px;padding:7px 8px;min-height:38px}
.qf-r select:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.qf-min{display:flex;gap:5px}
.qf-min button{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);
  border-radius:9px;color:var(--t2);font:inherit;font-size:11.5px;padding:7px 9px;
  min-height:44px;min-width:44px;cursor:pointer;font-variant-numeric:tabular-nums}  /* 44: il bersaglio di un dito, non di un cursore */
.qf-min button.on{background:linear-gradient(135deg,var(--gold),var(--gold2));
  color:#000;border-color:transparent;font-weight:600}
.qf-esito{margin-top:9px;font-size:11px;color:var(--t3);line-height:1.5}
.qf-esito b{color:var(--gold);font-weight:500}
.qf-esito i{font-style:normal;color:var(--t4)}
@media(max-width:640px){
  .quad{left:10px;right:10px;width:auto;bottom:calc(10px + env(safe-area-inset-bottom))}
  .quad-corpo{max-height:34vh}
  .quad.chiuso .quad-corpo,.quad.chiuso .quad-filtro,.quad.chiuso .quad-nota{display:none}
  .quad-capo{cursor:pointer}
}
@media(prefers-reduced-motion:reduce){.quad{transition:none}}
/* ══ /QUADRANTE:CSS ══ */
'''
# il primo </style> e' quello del foglio dello Skyline (il secondo e' del
# contratto di scorrimento, iniettato dopo: non e' casa nostra)
AGO_CSS = '</style>\n<script src="/js/boom-geo.js">'
uno(s, AGO_CSS)
s = s.replace(AGO_CSS, CSS + AGO_CSS)

# ── 3 · il pannello ────────────────────────────────────────────────────
HTML = '''<!-- BOOM_QUADRANTE -->
<div class="quad" id="quad" hidden>
  <div class="quad-capo" id="quadCapo">
    <span class="q-eti"><b id="quadT">Rome, from any door</b>
      <small id="quadS">Tap a home — the city answers</small></span>
    <button class="quad-x" id="quadX" type="button" aria-label="Back to the city">&#10005;</button>
  </div>
  <div class="quad-corpo" id="quadC"></div>
  <p class="quad-nota" id="quadN"></p>
  <div class="quad-filtro">
    <p class="qf-t">Only homes within</p>
    <div class="qf-r">
      <div class="qf-min" id="qfMin">
        <button type="button" data-m="15">15&#8242;</button>
        <button type="button" data-m="25">25&#8242;</button>
        <button type="button" data-m="40">40&#8242;</button>
      </div>
      <select id="qfMeta" aria-label="Destination"></select>
    </div>
    <p class="qf-esito" id="qfEsito"></p>
  </div>
</div>
<!-- /BOOM_QUADRANTE -->
'''
AGO_HTML = '<div class="count" id="count"'
uno(s, AGO_HTML)
s = s.replace(AGO_HTML, HTML + AGO_HTML)

# ── 4 · il cervello ────────────────────────────────────────────────────
JS = r'''/* ══ QUADRANTE:JS ══ */
/* Il pannello che non sparisce. Legge il motore condiviso
   (js/mappa-engine.js): mete, distanze, e soprattutto il GRADO DI VERITA'
   di ogni minuto — misurato dal Pendolare o stimato, e la stima si vede.
   Se il motore non c'e', il pannello NON compare: meglio niente che un
   cruscotto che inventa. */
(function(){
  var M = window.BOOM_MAPPA;
  var q = document.getElementById('quad');
  if (!M || !q) return;
  q.hidden = false;
  if (innerWidth <= 640) q.classList.add('chiuso');

  var capo = document.getElementById('quadCapo'),
      tit = document.getElementById('quadT'), sot = document.getElementById('quadS'),
      corpo = document.getElementById('quadC'), nota = document.getElementById('quadN'),
      chiudi = document.getElementById('quadX'),
      selMeta = document.getElementById('qfMeta'), minRow = document.getElementById('qfMin'),
      esito = document.getElementById('qfEsito');

  /* la misura dello scorrimento: 1px di tolleranza perche' su schermi a
     densita' frazionaria scrollHeight e clientHeight non tornano MAI
     esattamente uguali, e senza tolleranza la sfumatura resterebbe accesa
     su una lista che invece finisce li'. */
  function bordi(){
    var g = corpo.scrollHeight - corpo.clientHeight - corpo.scrollTop > 1;
    corpo.classList.toggle('altro-giu', g);
    corpo.classList.toggle('altro-su', corpo.scrollTop > 1);
  }
  corpo.addEventListener('scroll', bordi, { passive: true });
  addEventListener('resize', bordi);
  /* LE CHIAMATE ESPLICITE NON BASTANO, e il perche' vale la riga in piu':
     su telefono il pannello nasce CHIUSO (display:none), quindi la prima
     misura vede 0 e 0 e non decide nulla; poi qualcun altro lo riapre —
     il ramo che gestisce la mappa non caricata, per esempio — senza
     sapere che qui c'e' qualcosa da rimisurare. Invece di rincorrere ogni
     punto che apre il pannello (e dimenticarne uno, com'e' successo), si
     osserva la SCATOLA: da nascosta a visibile e' un cambio di
     dimensione, e la misura si rifa' da sola. */
  if (window.ResizeObserver) new ResizeObserver(bordi).observe(corpo);

  var ICO = { nodo:'🚇', segno:'🏛', ateneo:'🎓' };
  var esc = function(t){ return String(t == null ? '' : t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

  /* il ponte verso la griglia del Pendolare, gia' caricata dalla pagina */
  function etaDi(lat, lng, slug){
    if (!window.BOOM_TEMPI || !window.__TEMPI_DATI) return null;
    return BOOM_TEMPI.eta(window.__TEMPI_DATI, lat, lng, slug);
  }

  M.METE.forEach(function(m){
    var o = document.createElement('option');
    o.value = m.slug; o.textContent = m.nome; selMeta.appendChild(o);
  });
  selMeta.value = 'termini';

  /* Senza un tempo la colonna NON esiste: un trattino ripetuto su nove
     righe si legge come una cosa rotta, non come «non hai ancora scelto». */
  function riga(ic, nome, che, t, mio){
    return '<div class="qr' + (mio ? ' mio' : '') + '">'
      + '<span class="ic">' + ic + '</span>'
      + '<span class="nm"><b>' + esc(nome) + '</b><span>' + esc(che) + '</span></span>'
      + (t ? '<span class="tm"><b>' + esc(t.testo.replace(/ walk$/,'')) + '</b>'
        + '<i>' + (t.fonte === 'rete' ? 'measured'
            : t.fonte === 'piedi' ? 'on foot' : 'estimate') + '</i></span>' : '')
      + '</div>';
  }

  /* A RIPOSO: la legenda della citta'. Non e' riempitivo — dice quali sono
     i punti su cui la mappa sa rispondere, prima ancora che tu scelga. */
  function riposo(){
    q.classList.remove('scelta');
    tit.textContent = 'Rome, from any door';
    sot.textContent = 'Tap a home — the city answers';
    corpo.innerHTML = M.METE.map(function(m){
      return riga(ICO[m.tipo] || '◆', m.nome, m.che, null, false);
    }).join('');
    bordi();
    var mie = M.posti();
    nota.innerHTML = mie.length
      ? '<b>' + mie.length + ' of your places</b> are saved on this device — '
        + 'every home answers for them too.'
      : 'Save your office or campus once (◆ My places) and every home '
        + 'answers for it too.';
  }

  /* CON UNA CASA SCELTA: il cruscotto di quella porta. */
  var casaAttiva = null;
  function perCasa(casa){
    if (!casa || !isFinite(casa.lat) || !isFinite(casa.lng)) return riposo();
    casaAttiva = casa;
    q.classList.add('scelta');
    q.classList.remove('chiuso');
    tit.textContent = casa.nome || 'This door';
    sot.textContent = 'From this door';
    var v = M.vicine(casa.lat, casa.lng, {
      quante: 6, leggiEta: function(slug){ return etaDi(casa.lat, casa.lng, slug); } });
    var mie = M.posti().map(function(p){
      var d = M.km(casa.lat, casa.lng, p.lat, p.lng);
      return { p: p, t: M.tempo(d, null) };
    });
    corpo.innerHTML =
      mie.map(function(x){ return riga('◆', x.p.name, 'Your place', x.t, true); }).join('')
      + v.map(function(x){ return riga(ICO[x.meta.tipo] || '◆',
          x.meta.nome, x.meta.che, x.tempo, false); }).join('');
    bordi();
    var stime = v.filter(function(x){ return x.tempo && x.tempo.fonte === 'stima'; }).length;
    nota.innerHTML = stime
      ? 'Times marked <b>estimate</b> are straight-line arithmetic — the '
        + 'measured ones come from Rome’s real timetables.'
      : 'Measured on Rome’s real network and timetables, door to door.';
  }

  chiudi.addEventListener('click', function(e){ e.stopPropagation(); casaAttiva = null; riposo(); });
  capo.addEventListener('click', function(){
    if (innerWidth <= 640 && !q.classList.contains('scelta')) q.classList.toggle('chiuso');
  });

  /* IL FILTRO PER MINUTI. La domanda vera di chi si trasferisce — «quanto
     ci metto da qui a lezione» — e nessun portale la sa rispondere: mostrano
     un raggio in km, che a Roma non vuol dire niente.
     Le case il cui tempo e' STIMATO non entrano nel filtro: si contano a
     parte e si dice. Un filtro che promette minuti deve averli misurati. */
  var minAttivo = 0;
  function applica(){
    var slug = selMeta.value;
    var tutte = (window.__SKY_CASE || []);
    if (!minAttivo || !tutte.length){
      tutte.forEach(function(c){ if (c.el) c.el.classList.remove('fuoriTempo'); });
      esito.innerHTML = tutte.length
        ? 'Pick a limit to filter the map.'
        : '';
      if (window.__skyRicalcola) window.__skyRicalcola();
      return;
    }
    var r = M.filtroTempo(tutte, slug, minAttivo, function(c, sl){
      return etaDi(c.lat, c.lng, sl); });
    var dentro = {};
    r.dentro.forEach(function(c){ dentro[c.id] = 1; });
    tutte.forEach(function(c){
      if (!c.el) return;
      c.el.classList.toggle('fuoriTempo', !dentro[c.id]);
    });
    var nome = (M.METE.filter(function(m){ return m.slug === slug; })[0] || {}).nome || slug;
    esito.innerHTML = '<b>' + r.dentro.length + '</b> within ' + minAttivo
      + '′ of ' + esc(nome)
      + (r.incerte.length ? ' <i>· ' + r.incerte.length
          + ' not measured yet, left out</i>' : '');
    if (window.__skyRicalcola) window.__skyRicalcola();
  }
  minRow.addEventListener('click', function(e){
    var b = e.target.closest('button[data-m]'); if (!b) return;
    var v = +b.dataset.m;
    minAttivo = (minAttivo === v) ? 0 : v;
    [].forEach.call(minRow.children, function(x){
      x.classList.toggle('on', +x.dataset.m === minAttivo); });
    applica();
  });
  selMeta.addEventListener('change', applica);

  window.__quadrante = { perCasa: perCasa, riposo: riposo, applica: applica };
  riposo();
})();
/* ══ /QUADRANTE:JS ══ */
'''
AGO_JS = '\n(function loadMapLibre(){'
uno(s, AGO_JS)
s = s.replace(AGO_JS, '\n' + JS + AGO_JS)


# ── 5 · LE GIUNZIONI: lo Skyline consegna al Quadrante cio' che gia' ha ──
# Nessuna logica duplicata: il pannello legge le case e la griglia dei tempi
# che la pagina carica comunque, e il filtro per minuti entra nel filtro che
# esiste gia' invece di aprirne un secondo — due filtri paralleli darebbero
# due conteggi diversi della stessa mappa.

A = ".then(function(d){TEMPI_DATI=d&&BOOM_TEMPI.daDoc(d)})"
uno(s, A)
s = s.replace(A, ".then(function(d){TEMPI_DATI=d&&BOOM_TEMPI.daDoc(d);"
                 "window.__TEMPI_DATI=TEMPI_DATI;"
                 "if(window.__quadrante)window.__quadrante.applica();})")

A = "    el.classList.toggle('dim',!ok); if(ok)shown++;"
uno(s, A)
s = s.replace(A,
  "    /* il Quadrante marca le case fuori dal limite di minuti: la\n"
  "       selezione resta UNA, e il conto in basso dice la verita' */\n"
  "    if(ok&&el.classList.contains('fuoriTempo'))ok=false;\n"
  "    el.classList.toggle('dim',!ok); if(ok)shown++;")

A = "  MARKERS.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(co).setPopup(pop).addTo(map));"
uno(s, A)
s = s.replace(A, A + "\n"
  "  /* il Quadrante lavora su lat/lng, non su [lng,lat]: si consegna gia'\n"
  "     nella forma giusta, cosi' nessuno converte due volte */\n"
  "  (function(){var _n=(L&&(L.name||L.title))||'This home';\n"
  "    (window.__SKY_CASE=window.__SKY_CASE||[]).push({id:el.__id,el:el,\n"
  "      lat:co[1],lng:co[0],nome:_n});\n"
  "    function _q(){if(window.__quadrante)\n"
  "      window.__quadrante.perCasa({lat:co[1],lng:co[0],nome:_n});}\n"
  "    el.addEventListener('mouseenter',_q); el.addEventListener('click',_q);})();")

A = "function applyFilter(){"
uno(s, A)
s = s.replace(A, "window.__skyRicalcola=function(){applyFilter();};\nfunction applyFilter(){")

# 5f · se MapLibre non carica, la pagina non e' un vicolo cieco: il
# Quadrante e' informazione pura e non ha bisogno della mappa. Si toglie il
# velo e si dice cosa resta — invece di lasciare un cartello d'errore sopra
# uno strumento che funziona.
A = "s.onerror=function(){ msg('Map engine unavailable"
uno(s, A)
s = s.replace(A,
  "s.onerror=function(){ var _q=document.getElementById('quad');\n"
  "    if(_q){var _l=document.getElementById('load');if(_l)_l.style.display='none';\n"
  "      _q.classList.remove('chiuso');\n"
  "      var _n=document.getElementById('quadN');\n"
  "      if(_n)_n.innerHTML='The 3D map needs a connection it could not get. '\n"
  "        +'The distances below still work \\u2014 or open the '\n"
  "        +'<a href=\"/apartments\" style=\"color:var(--gold)\">list view</a>.';\n"
  "      return;}\n"
  "    msg('Map engine unavailable")

A = ".sky-pin.dim{opacity:.16;filter:grayscale(.7)}"
uno(s, A)
s = s.replace(A, A + "\n.sky-pin.fuoriTempo{opacity:.16;filter:grayscale(.7)}")


open(F, 'w', encoding='utf-8').write(s)
print('Quadrante innestato in', F)
