#!/usr/bin/env python3
# IL LOTTO 2 — quattro voci della lista di Valentino:
#   · FOOTER GLOBALE: la firma completa di una societa vera — P.IVA
#     17322991005, REA RM-1710623, marchio UE 019317594 cl. 36 (tutti
#     letti dalle SUE pagine, mai inventati) — e i mercati/brand
#     (Executive, La Reunion, Corporate, Universities) in colonna propria.
#   · L'ATTERRO DELLA DISCOVERY SI SGONFIA: via la scatola e il bottone
#     (i filtri sono gia vivi) — restano tre pill sottili in una riga.
#     Il calendario e il passaggio hash dalla home restano intatti.
#   · I BADGE DICONO LA VERITA CON I COLORI: verde che respira = libera
#     ora, oro che pulsa = lista aperta, ROSSO CALDO fermo = occupata
#     fino a una data («Free from 1 Mar 2027») — su discovery E detail.
#   · L'ONDA SUI SEI DOLORI: su mobile nessuno passa il mouse — ora le
#     carte girano in oro da sole, una alla volta, come i flap.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('pt.html', 'ad-corpo.html', 'costruisci-ad.py',
          'costruisci-ld.py', 'ld-corpo.html', 'ld-regia.html'):
    shutil.copy(f, f + '.bak')

# ═══ PT.HTML ════════════════════════════════════════════════════════════

s = leggi('pt.html')

# ── il footer globale: cinque colonne, la firma completa ────────────────
s = uno(s, """      <div class="piede-col">
        <b>Services</b>
        <a href="/apartments.html">Apartments</a>
        <a href="/property-finding.html">Property Finding</a>
        <a href="/deal-assistance.html">Deal Assistance</a>
        <a href="/virtual-viewing.html">Virtual Viewing</a>
        <a href="/concierge.html">Concierge</a>
        <a href="/v2-board.html">Live Board</a>
      </div>
      <div class="piede-col">
        <b>Company</b>
        <a href="/about.html">About</a>
        <a href="/your-money.html">Your Money</a>
        <a href="/how-it-works.html">How It Works</a>
        <a href="/universities.html">For Universities</a>
        <a href="/corporate.html">For Companies</a>
        <a href="/owners.html">For Owners</a>
        <a href="/blog.html">Blog</a>
      </div>
      <div class="piede-col">
        <b>Legal</b>
        <a href="/terms.html">Terms</a>
        <a href="/privacy.html">Privacy</a>
        <a href="/login">Login</a>
      </div>""",
"""      <div class="piede-col">
        <b>Homes</b>
        <a href="/apartments.html">Apartments</a>
        <a href="/your-money.html">Your Money</a>
        <a href="/v2-board.html">Live Board</a>
        <a href="/book.html">Book a Viewing</a>
        <a href="/welcome-to-rome.html">Welcome to Rome</a>
      </div>
      <div class="piede-col">
        <b>Services</b>
        <a href="/property-finding.html">Property Finding</a>
        <a href="/deal-assistance.html">Deal Assistance</a>
        <a href="/virtual-viewing.html">Virtual Viewing</a>
        <a href="/contract-check-express.html">Contract Check</a>
        <a href="/concierge.html">Concierge</a>
      </div>
      <div class="piede-col">
        <b>Company &amp; Markets</b>
        <a href="/about.html">About</a>
        <a href="/how-it-works.html">How It Works</a>
        <a href="/executive.html">BOOM Executive</a>
        <a href="/reunion.html">BOOM La Réunion</a>
        <a href="/corporate.html">For Companies</a>
        <a href="/universities.html">For Universities</a>
        <a href="/owners.html">For Owners</a>
        <a href="/blog.html">Blog</a>
      </div>
      <div class="piede-col">
        <b>Legal</b>
        <a href="/terms.html">Terms</a>
        <a href="/privacy.html">Privacy</a>
        <a href="/login">Login</a>
      </div>""", 'colonne footer')

# la firma legale completa: P.IVA, REA, marchio — tutti dai suoi file
s = uno(s, """        <p class="piede-legale"><b>BOOM®</b> is a registered trademark of
          <b>Egidi Immobiliare S.r.l.</b> — EU trade mark
          <b>019317594</b>, class 36.<br>
          Via dei Coronari 181/184, 00186 Roma · P.IVA 17322991005 ·
          Licensed real-estate agency</p>""",
"""        <p class="piede-legale"><b>BOOM®</b> is a registered trademark of
          <b>Egidi Immobiliare S.r.l.</b> — EU trade mark
          <b>019317594</b>, class 36.<br>
          Via dei Coronari 181/184, 00186 Roma<br>
          P.IVA 17322991005 · REA RM-1710623 ·
          Licensed real-estate agency</p>
        <p class="piede-mercati">Rome · La Réunion</p>""", 'firma legale')

# cinque colonne sul largo, e la riga dei mercati
s = uno(s, """@media (min-width:840px){ .piede-int {
  grid-template-columns:1.4fr 1fr 1fr 1fr; } }""",
"""@media (min-width:840px){ .piede-int {
  grid-template-columns:1.5fr 1fr 1fr 1.15fr .8fr; } }
.piede-mercati { margin-top:12px; font-size:10px; font-weight:600;
  letter-spacing:.22em; text-transform:uppercase; color:var(--text-4); }""",
'griglia footer')

# ── l'onda d'oro sui sei dolori ─────────────────────────────────────────
s = uno(s, """/* la risposta prende il posto del problema */
@media (hover:hover) and (pointer:fine){
  .dolore:hover { background:var(--elevated); }
  .dolore:hover svg { color:var(--gold); }
  .dolore:hover b { opacity:0; transform:translateY(-9px); }
  .dolore:hover span { opacity:1; transform:none; } }""",
"""/* la risposta prende il posto del problema — al passaggio del mouse,
   o quando l'onda arriva sulla carta (mobile non ha il mouse) */
@media (hover:hover) and (pointer:fine){
  .dolore:hover { background:var(--elevated); }
  .dolore:hover svg { color:var(--gold); }
  .dolore:hover b { opacity:0; transform:translateY(-9px); }
  .dolore:hover span { opacity:1; transform:none; } }
.dolore.viva { background:var(--elevated); }
.dolore.viva svg { color:var(--gold); }
.dolore.viva b { opacity:0; transform:translateY(-9px); }
.dolore.viva span { opacity:1; transform:none; }""", 'dolore viva css')

# su touch la risposta non sta piu sempre aperta: gira con l'onda
s = uno(s, """@media (hover:none), (pointer:coarse){
  .dolore { flex-wrap:wrap; align-items:flex-start; padding:14px 16px 13px; }
  .dolore svg { margin-top:1px; }
  .dolore b { flex:1; }
  .dolore span { position:static; left:auto; right:auto; opacity:1;
    transform:none; width:100%; padding-left:32px; margin-top:5px;
    font-size:12px; } }""",
"""@media (hover:none), (pointer:coarse){
  .dolore { min-height:56px; } }
/* con reduced-motion su touch l'onda non gira: la risposta resta
   scritta sotto, come prima — mai un contenuto irraggiungibile */
@media (prefers-reduced-motion: reduce) and (hover:none){
  .dolore { flex-wrap:wrap; align-items:flex-start; padding:14px 16px 13px; }
  .dolore b { flex:1; opacity:1; transform:none; }
  .dolore span { position:static; opacity:1; transform:none; width:100%;
    padding-left:32px; margin-top:5px; font-size:12px; } }""", 'dolore touch')

# il motore dell'onda, nella coda dello script (fuori dall'estrazione onda)
s = uno(s, """  /* il giorno uno, al volo: scegli il budget e l'hero risponde con la
     forchetta VERA del catalogo — canone + deposito + onorario, esatti,
     con la STESSA aritmetica della pagina casa */""",
"""  /* L'ONDA SUI DOLORI: una carta alla volta mostra la risposta in oro,
     da sola — su mobile nessuno passa il mouse. Il passaggio del mouse
     la ferma (stai leggendo tu), reduced-motion la spegne. */
  (function () {
    var carte = [].slice.call(document.querySelectorAll('.dolore'));
    if (carte.length < 2) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var qui = -1, fermo = false, giro = null;
    function passa() {
      if (fermo || document.hidden) return;
      if (qui >= 0) carte[qui].classList.remove('viva');
      qui = (qui + 1) % carte.length;
      carte[qui].classList.add('viva');
    }
    var zona = carte[0].parentElement;
    zona.addEventListener('mouseenter', function () {
      fermo = true;
      if (qui >= 0) carte[qui].classList.remove('viva');
    });
    zona.addEventListener('mouseleave', function () { fermo = false; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (v, io) {
        if (!v[0].isIntersecting) return;
        io.disconnect();
        passa(); giro = setInterval(passa, 2600);
      }, { threshold: .3 }).observe(zona);
    } else giro = setInterval(passa, 2600);
  })();

  /* il giorno uno, al volo: scegli il budget e l'hero risponde con la
     forchetta VERA del catalogo — canone + deposito + onorario, esatti,
     con la STESSA aritmetica della pagina casa */""", 'onda dolori')
scrivi('pt.html', s)

# ═══ DISCOVERY — l'atterro si sgonfia, i badge dicono la verita ═════════

s = leggi('ad-corpo.html')

# via il bottone: i filtri sono vivi, il bottone era un rito vuoto
s = uno(s, """          <button type="submit" class="btn btn-primary" id="quandoVai">Find homes</button>
""", '', 'via find homes')

# la scatola diventa una riga sottile
s = uno(s, """/* la barra di ricerca: la stessa del check-in di casa */
.cerca { margin-top:clamp(20px,2.4vw,30px); }""",
"""/* il check-in, sgonfiato: tre pill sottili in una riga — niente
   scatola, niente bottone. I filtri sono vivi, questo e un ritocco. */
.cerca { margin-top:clamp(16px,2vw,24px); }
.disco .atterro { background:none; box-shadow:none; padding:0;
  gap:10px 18px; flex-wrap:wrap; border-radius:0; }
.disco .atterro:focus-within { box-shadow:none; }
.disco .atterro .atterro-divisa { display:none; }
.disco .atterro .atterro-campo,
.disco .atterro .ac-data { padding:8px 13px;
  box-shadow:inset 0 0 0 1px var(--line); border-radius:100px; }
.disco .atterro .atterro-campo:focus-within,
.disco .atterro .ac-data:focus-within {
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
@media (max-width:640px){
  .disco .atterro { gap:8px; }
  .disco .atterro .atterro-campo,
  .disco .atterro .ac-data { padding:7px 11px; } }""", 'atterro slim')

# il badge del futuro: rosso caldo, fermo — occupata fino a una data
s = uno(s, """.casa-p .home-foto .casa-stato.poi { color:var(--text-2); }""",
""".casa-p .home-foto .casa-stato.poi { color:#FF9C8A;
  box-shadow:inset 0 0 0 1px rgba(255,110,90,.32); }""", 'poi rosso')
scrivi('ad-corpo.html', s)

# i builder: «From X» → «Free from X» (chiaro: e occupata FINO a li)
s = leggi('costruisci-ad.py')
s = uno(s, """            eti = 'From ' + str(int(dt.strftime('%d'))) + dt.strftime(' %b')""",
"""            eti = 'Free from ' + str(int(dt.strftime('%d'))) + dt.strftime(' %b')""",
'ad free from')
scrivi('costruisci-ad.py', s)

s = leggi('costruisci-ld.py')
s = uno(s, """            eti = 'From ' + str(int(d.strftime('%d'))) + d.strftime(' %b')""",
"""            eti = 'Free from ' + str(int(d.strftime('%d'))) + d.strftime(' %b')""",
'ld free from')
scrivi('costruisci-ld.py', s)

# il detail: la data futura ha la SUA classe (era verde come «now»)
s = leggi('ld-regia.html')
s = uno(s, """  function scriviStato() {
    st.textContent = c.stato;
    st.className = 'stato-grande ' + (c.libera ? 'libera'
      : /wait/i.test(c.stato) ? 'attesa' : 'presa');
  }""",
"""  function scriviStato() {
    st.textContent = c.stato;
    st.className = 'stato-grande ' + (/^Free from/i.test(c.stato) ? 'dopo'
      : c.libera ? 'libera'
      : /wait/i.test(c.stato) ? 'attesa' : 'presa');
  }""", 'stato dopo')
# e l'idrante produce la stessa etichetta
s = uno(s, """              eti = 'From ' + dt.getDate() + ' ' + dt.toLocaleDateString(
                'en-GB', { month: 'short' });""",
"""              eti = 'Free from ' + dt.getDate() + ' '
                + dt.toLocaleDateString('en-GB', { month: 'short' });""",
'idrante free from')
scrivi('ld-regia.html', s)

s = leggi('ld-corpo.html')
# lo stato-grande «dopo»: rosso caldo fermo, come sulla discovery
s = uno(s, '</style>', """
.stato-grande.dopo { color:#FF9C8A;
  box-shadow:inset 0 0 0 1px rgba(255,110,90,.32); }
</style>""", 'stato dopo css')
scrivi('ld-corpo.html', s)
print('lotto 2: fatto')
