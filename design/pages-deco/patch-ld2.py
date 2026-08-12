#!/usr/bin/env python3
# ld2 — IL DENARO SMETTE DI SPAVENTARE, E LA GALLERIA SI SFOGLIA.
#
#   1 · «Move-in total, due on day one» con la cifra grande accanto al conto
#       era un costo senza contropartita: il numero arrivava da solo e
#       faceva paura. Ora e UN BLOCCO SOLO, e subito sotto la cifra c'e
#       cosa quel denaro compra davvero — il contratto nelle due lingue, la
#       registrazione all'Agenzia delle Entrate, la firma dal telefono, le
#       chiavi nel Wallet, il portale con canoni e ricevute, l'inventario
#       video, la persona su WhatsApp. L'onorario smette di essere un
#       pedaggio e diventa un elenco.
#       Onesta: la cauzione esce dal totale «per le chiavi» — non e un
#       costo, e trattenuta e torna. E cio che va allo Stato resta detto.
#
#   2 · LA GALLERIA si sfoglia: frecce, tastiera, contatore. Mancavano.
#
#   3 · LO STATO della casa diventa un badge vivo: disponibile respira in
#       verde, waitlist pulsa in oro, riservata sta ferma. Su una pagina
#       casa lo stato e l'informazione piu volatile che c'e.
def leggi(n): return open(n, encoding='utf-8').read()
corpo = leggi('ld-corpo.html'); regia = leggi('ld-regia.html')
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

# ── 1 · il denaro, un blocco solo ───────────────────────────────────────
i = corpo.index('    <div class="denaro-corpo">')
j = corpo.index('  </div>\n</section>\n\n<!-- ══ QUELLO CHE CI CHIEDERESTI')
DEN = '''    <div class="chiavi quadro sale"><span class="tacca"></span>

      <div class="chiavi-cima">
        <div>
          <span class="chiavi-eti">To get the keys</span>
          <div class="chiavi-flap"><span class="flap-tot" id="totFlap"
            data-p="" aria-live="polite"></span></div>
          <p class="chiavi-somma" id="chiaviSomma">—</p>
        </div>
        <div class="chiavi-cauzione">
          <span>+ <b id="chiaviCauzione">—</b> security deposit</span>
          <em>Not a cost. It is held for you and comes back after the final
            walkthrough — the flat is filmed in and out, so its state is a
            recording, not an argument.</em>
        </div>
      </div>

      <div class="chiavi-compra">
        <p class="chiavi-capo"><b>The agency fee is not a door charge.</b>
          <span id="chiaviOnorario">—</span> is what the whole thing costs,
          once, and this is what it buys:</p>
        <ul class="chiavi-lista">
          <li><b>The contract, in English and Italian</b><span>A transitional
            lease under L. 431/98 art. 5 c. 1, explained line by line before
            you sign anything.</span></li>
          <li><b>Registration with the Agenzia delle Entrate</b><span>We file
            it. The registration tax itself goes to the State — that part is
            not ours and never passes through us.</span></li>
          <li><b>Signing from your phone</b><span>A private link: you sign,
            the landlord countersigns after you. No notary, no flight, no
            printer.</span></li>
          <li><b>Your keys in Apple Wallet</b><span>The Landing Pass: address,
            entry details and your contact, on the lock screen the day you
            arrive.</span></li>
          <li><b>A tenant portal, not an inbox</b><span>Rent, receipts,
            documents and maintenance requests in one place, for the whole
            stay.</span></li>
          <li><b>One named human on WhatsApp</b><span>The same person from the
            first message to the day you hand the keys back. Not a rota, not
            a form.</span></li>
        </ul>
      </div>

      <div class="chiavi-fondo">
        <span class="chiavi-scudo"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 2.8v5.4c0 4.1-3 7.1-7 8.3-4-1.2-7-4.2-7-8.3V5.8z"/>
          <path d="M8.6 11.6l2.3 2.3 4.3-4.9"/></svg>Paid through BOOM on
          Stripe · a receipt for every line · never a transfer to a
          stranger</span>
        <p class="chiavi-fuori"><b>What is not included:</b> utilities
          (electricity, gas, water, internet) and the registration tax. Both
          are paid to the providers and to the State. We never touch them and
          we never mark them up.</p>
      </div>

      <div class="durata">
        <span class="durata-eti">And if you stay longer — how long?</span>
        <div class="durata-tasti" role="group" aria-label="Length of stay">
          <button type="button" data-m="3">3 months</button>
          <button type="button" data-m="6">6 months</button>
          <button type="button" data-m="12" class="on">12 months</button>
        </div>
        <div class="durata-conto">
          <div><span>Rent for the whole stay</span><b id="durCanoni">—</b></div>
          <div><span>Agency fee, once</span><b id="durOnorario">—</b></div>
          <div class="durata-tot"><span>What the stay costs you</span>
            <b id="durTotale">—</b></div>
          <p class="durata-nota" id="durNota">—</p>
        </div>
      </div>

    </div>
'''
corpo = corpo[:i] + DEN + corpo[j:]

# ── 2 · le frecce nella galleria + il badge di stato ────────────────────
corpo = uno(corpo, '''        <div class="telaio-alto">
          <span class="stato-grande" id="statoCasa">—</span>''',
'''        <button type="button" class="sfoglia prec" id="foPrec"
          aria-label="Previous photo"><svg viewBox="0 0 24 24"
          aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <button type="button" class="sfoglia succ" id="foSucc"
          aria-label="Next photo"><svg viewBox="0 0 24 24"
          aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
        <span class="conta-foto" id="contaFoto" aria-hidden="true"></span>
        <div class="telaio-alto">
          <span class="stato-grande" id="statoCasa">—</span>''', 'frecce')

CSS = r'''
/* ── PER LE CHIAVI: un blocco solo. Il numero non arriva da solo, arriva
   con quello che compra — un onorario senza elenco e un pedaggio. ────── */
.chiavi { margin-top:clamp(22px,2.6vw,32px); padding:clamp(22px,2.6vw,30px);
  background:linear-gradient(165deg, rgba(255,215,0,.06),
    rgba(255,215,0,.01) 52%), var(--card);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.chiavi-cima { display:grid; gap:clamp(18px,2.4vw,34px); align-items:start;
  grid-template-columns:1fr; }
@media (min-width:820px){ .chiavi-cima {
  grid-template-columns:minmax(0,auto) minmax(0,1fr); } }
.chiavi-eti { display:block; font-size:10.5px; font-weight:600;
  letter-spacing:.2em; text-transform:uppercase; color:var(--gold); }
.chiavi-flap { margin-top:12px; }
.flap-tot { display:inline-flex; font-size:clamp(28px,4vw,42px); }
.chiavi-somma { margin:10px 0 0; font-size:12.5px; line-height:1.6;
  color:var(--text-2); }
.chiavi-somma b { color:var(--text); font-weight:500;
  font-variant-numeric:tabular-nums; }
.chiavi-cauzione { padding:14px 16px; border-radius:12px;
  background:var(--surface); box-shadow:inset 0 0 0 1px var(--line-0); }
.chiavi-cauzione > span { display:block; font-size:13.5px; color:var(--text-2); }
.chiavi-cauzione b { font-family:var(--display); font-size:18px;
  font-weight:400; color:var(--text); font-variant-numeric:tabular-nums; }
.chiavi-cauzione em { display:block; margin-top:6px; font-style:normal;
  font-size:11.5px; line-height:1.6; color:var(--text-4); }

/* cosa compra l'onorario: e la parte che toglie la paura al numero */
.chiavi-compra { margin-top:clamp(20px,2.4vw,28px); padding-top:20px;
  border-top:1px solid var(--line-gold); }
.chiavi-capo { margin:0; font-size:14px; line-height:1.6; color:var(--text-2); }
.chiavi-capo b { display:block; font-family:var(--display); font-size:17px;
  font-weight:400; letter-spacing:.005em; color:var(--text); margin-bottom:4px; }
.chiavi-capo span { color:var(--gold); font-variant-numeric:tabular-nums; }
.chiavi-lista { list-style:none; margin:16px 0 0; padding:0; display:grid;
  gap:1px; background:var(--line-0); box-shadow:inset 0 0 0 1px var(--line-0);
  border-radius:12px; overflow:hidden; }
@media (min-width:760px){ .chiavi-lista {
  grid-template-columns:1fr 1fr; } }
.chiavi-lista li { position:relative; background:var(--card);
  padding:14px 16px 15px 38px; transition:background .3s var(--ease); }
.chiavi-lista li:hover { background:var(--elevated); }
.chiavi-lista li::before { content:''; position:absolute; left:16px; top:17px;
  width:11px; height:6px; border-left:1.6px solid var(--gold);
  border-bottom:1.6px solid var(--gold); transform:rotate(-45deg); }
.chiavi-lista b { display:block; font-size:13px; font-weight:500;
  letter-spacing:.005em; color:var(--text); line-height:1.4; }
.chiavi-lista span { display:block; margin-top:4px; font-size:11.5px;
  line-height:1.55; color:var(--text-4); }

.chiavi-fondo { margin-top:18px; padding-top:16px;
  border-top:1px solid var(--line-0); }
.chiavi-scudo { display:inline-flex; align-items:flex-start; gap:9px;
  font-size:12px; line-height:1.5; color:var(--text-2); }
.chiavi-scudo svg { width:16px; height:16px; flex:none; margin-top:1px;
  color:var(--green); fill:none; stroke:currentColor; stroke-width:1.6;
  stroke-linecap:round; stroke-linejoin:round; }
.chiavi-fuori { margin:10px 0 0; font-size:11.5px; line-height:1.6;
  color:var(--text-4); }
.chiavi-fuori b { color:var(--text-2); font-weight:500; }
.chiavi .durata { margin-top:20px; padding-top:18px;
  border-top:1px solid var(--line-gold); }

/* ── LA GALLERIA SI SFOGLIA ──────────────────────────────────────────── */
.sfoglia { position:absolute; top:50%; z-index:4; width:46px; height:46px;
  transform:translateY(-50%); display:grid; place-items:center;
  border-radius:50%; border:1px solid var(--line);
  background:rgba(6,6,7,.62); backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px); color:var(--text-2); cursor:pointer;
  opacity:0; transition:opacity .3s var(--ease), color .25s var(--ease),
    border-color .25s var(--ease), background .25s var(--ease); }
.telaio:hover .sfoglia, .sfoglia:focus-visible { opacity:1; }
@media (hover:none), (pointer:coarse){ .sfoglia { opacity:1; } }
.sfoglia:hover { color:var(--gold); border-color:var(--line-gold-2);
  background:rgba(6,6,7,.82); }
.sfoglia svg { width:19px; height:19px; fill:none; stroke:currentColor;
  stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.sfoglia.prec { left:14px; } .sfoglia.succ { right:14px; }
.sfoglia[disabled] { opacity:0!important; pointer-events:none; }
.conta-foto { position:absolute; right:14px; bottom:14px; z-index:4;
  font-size:11px; letter-spacing:.08em; color:var(--text-2);
  background:rgba(6,6,7,.7); backdrop-filter:blur(8px);
  border:1px solid var(--line); border-radius:100px; padding:5px 12px;
  font-variant-numeric:tabular-nums; }

/* ── LO STATO, VIVO ──────────────────────────────────────────────────── */
.stato-grande { display:inline-flex; align-items:center; gap:8px; }
.stato-grande::before { content:''; width:7px; height:7px; border-radius:50%;
  background:currentColor; flex:none; }
.stato-grande.libera { color:var(--green); }
.stato-grande.libera::before { animation:stato-respira 2.8s ease-out infinite; }
@keyframes stato-respira {
  0%   { box-shadow:0 0 0 0 rgba(0,255,136,.5); }
  70%  { box-shadow:0 0 0 9px rgba(0,255,136,0); }
  100% { box-shadow:0 0 0 0 rgba(0,255,136,0); } }
.stato-grande.attesa { color:var(--gold); }
.stato-grande.attesa::before { animation:stato-attesa 1.6s ease-in-out infinite; }
@keyframes stato-attesa { 0%,100% { opacity:1; } 50% { opacity:.25; } }
.stato-grande.presa { color:var(--text-3); }
@media (prefers-reduced-motion:reduce){
  .stato-grande::before { animation:none!important; } }
'''
corpo = corpo.replace('</style>', CSS + '\n</style>', 1)
open('ld-corpo.html', 'w', encoding='utf-8').write(corpo)

# ── 3 · la regia ────────────────────────────────────────────────────────
regia = uno(regia, '''  per('#contoCanone').textContent = euro(c.prezzo);
  per('#contoQuando').textContent = c.dal
    ? 'Available from ' + new Date(c.dal + 'T12:00:00')
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : 'Paid on move-in day';
  per('#contoCauzione').textContent = euro(cauzione);
  document.querySelectorAll('.conto-riga')[1].querySelector('em').textContent =
    mesiCauzione + (mesiCauzione === 1 ? ' month' : ' months')
    + ' — returned after the final walkthrough';
  per('#contoOnorario').textContent = euro(onorario);''',
'''  /* la cifra grande e quella PER LE CHIAVI: primo canone + onorario.
     La cauzione sta fuori e lo dice — non e un costo, e trattenuta. */
  var chiavi = c.prezzo + onorario;
  per('#chiaviCauzione').textContent = euro(cauzione);
  per('#chiaviOnorario').textContent = euro(onorario);
  per('#chiaviSomma').innerHTML = 'First month <b>' + euro(c.prezzo)
    + '</b> + agency fee <b>' + euro(onorario) + '</b>'
    + (c.dal ? ' · keys from <b>' + new Date(c.dal + 'T12:00:00')
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
        + '</b>' : '');''', 'conto vecchio')
regia = regia.replace("    var testo = euro(totale);", "    var testo = euro(chiavi);")
regia = uno(regia, "  var totale = c.prezzo + cauzione + onorario;",
            "  var totale = c.prezzo + cauzione + onorario;   /* il giorno uno intero, per le domande */", 'totale')

# le frecce e lo stato
regia = uno(regia, '''  if (immagini.length < 2) rullino.style.display = 'none';''',
'''  if (immagini.length < 2) rullino.style.display = 'none';

  /* ── sfogliare: frecce, tastiera, contatore ──────────────────────────
     Mancavano: su una pagina casa la foto successiva e il gesto piu
     ripetuto che ci sia. */
  (function () {
    var prec = document.getElementById('foPrec'),
        succ = document.getElementById('foSucc'),
        conta = document.getElementById('contaFoto');
    if (!prec || !succ) return;
    if (immagini.length < 2) {
      prec.style.display = succ.style.display = 'none';
      if (conta) conta.style.display = 'none'; return;
    }
    var qui = 0;
    function vai(d) {
      qui = (qui + d + immagini.length) % immagini.length;
      mostra(qui);
      if (conta) conta.textContent = (qui + 1) + ' / ' + immagini.length;
      var b = rullino.children[qui]; if (b && b.scrollIntoView)
        b.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
    }
    prec.addEventListener('click', function () { vai(-1); });
    succ.addEventListener('click', function () { vai(1); });
    [].slice.call(rullino.children).forEach(function (b, k) {
      b.addEventListener('click', function () {
        qui = k; if (conta) conta.textContent = (k + 1) + ' / ' + immagini.length;
      });
    });
    addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); vai(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); vai(1); }
    });
    if (conta) conta.textContent = '1 / ' + immagini.length;
  })();''', 'frecce js')
assert 'foPrec' in regia and 'chiaviSomma' in regia
open('ld-regia.html', 'w', encoding='utf-8').write(regia)
print('ld2 · per le chiavi (un blocco) · frecce e contatore · stato vivo')
