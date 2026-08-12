#!/usr/bin/env python3
# ld1 — LA CASA COME UNICA FONTE DI VERITA.
#   Il punto non e estetico: Valentino ripete le stesse cose su WhatsApp
#   ogni giorno. Ogni domanda che si ripete e una cosa che questa pagina
#   non dice. Quindi:
#
#   1 · IL DENARO IN CHIARO sale di grado. Il totale move-in — il numero
#       piu importante di tutto il sito — gira sui Solari, che sono
#       l'anima del marchio. Accanto, la durata: 3/6/12 mesi non cambia
#       il giorno uno (l'onorario e il 10% del canone annuo, fisso) ma
#       cambia quanto ti costa l'intero soggiorno, ed e la domanda che
#       tutti fanno. Aritmetica dichiarata, nessuna cifra inventata.
#
#   2 · «TUTTO QUELLO CHE CI CHIEDERESTI SU WHATSAPP» — dieci risposte
#       precise, ognuna verificata su cio che il sito o i documenti gia
#       dicono. E lo script delle chat, scritto una volta sola.
import re
def leggi(n): return open(n, encoding='utf-8').read()
corpo = leggi('ld-corpo.html')
regia = leggi('ld-regia.html')
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

# ── 1 · il denaro, rifatto ──────────────────────────────────────────────
i = corpo.index('<!-- ══ IL DENARO IN CHIARO ═')
j = corpo.index('<!-- ══ COSA SUCCEDE DOPO ═')
DENARO = '''<!-- ══ IL DENARO IN CHIARO ═══════════════════════════════════════════════
     Il numero piu importante del sito gira sui Solari. Accanto, la durata:
     non cambia il giorno uno, cambia l'intero soggiorno — ed e la domanda
     che arriva ogni volta su WhatsApp. -->
<section class="sezione" id="denaro">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>The money, in the open</span>
      <h2 class="titolo">What you pay to get the keys — <span class="hl">all of
        it</span>.</h2>
      <p class="sotto">No agency surprise on signing day. Every figure below is
        written into your pre-agreement before a single euro moves.</p>
    </div>

    <div class="racconto sale" style="margin-top:20px">
      <p id="raccontoCasa">—</p>
      <div class="dote" id="dentroCasa"></div>
    </div>

    <div class="denaro-corpo">
      <div class="conto quadro sale"><span class="tacca"></span>
        <div class="conto-riga"><span>First month's rent
          <em id="contoQuando">—</em></span><b id="contoCanone">—</b></div>
        <div class="conto-riga"><span>Security deposit
          <em>Held for you — returned after the final walkthrough</em></span>
          <b id="contoCauzione">—</b></div>
        <div class="conto-riga"><span>Agency fee
          <em>10% of the annual rent — our only fee</em></span>
          <b id="contoOnorario">—</b></div>
        <p class="conto-nota">Utilities and the registration tax are not
          included — they're paid to the providers and to the State, never to
          us. <b>The deposit is not a cost:</b> it is held and comes back to
          you after the final walkthrough, filmed in and out.</p>
      </div>

      <aside class="totale quadro sale"><span class="tacca"></span>
        <span class="tot-eti">Move-in total · due on day one</span>
        <div class="tot-flap"><span class="flap-tot" id="totFlap"
          data-p="" aria-live="polite"></span></div>
        <span class="tot-scudo"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 2.8v5.4c0 4.1-3 7.1-7 8.3-4-1.2-7-4.2-7-8.3V5.8z"/>
          <path d="M8.6 11.6l2.3 2.3 4.3-4.9"/></svg>Paid through BOOM on
          Stripe · a receipt for each line</span>

        <div class="durata">
          <span class="durata-eti">How long are you staying?</span>
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
      </aside>
    </div>
  </div>
</section>

<!-- ══ QUELLO CHE CI CHIEDERESTI SU WHATSAPP ═════════════════════════════
     Ogni domanda che si ripete in chat e una cosa che questa pagina non
     diceva. Scritte una volta, qui. -->
<section class="sezione" id="chiedi">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Before you ask</span>
      <h2 class="titolo">Everything people ask us <span class="hl">on
        WhatsApp</span>.</h2>
      <p class="sotto">Answered here so you don't have to ask — and so the
        answer is the same one, every time, in writing.</p>
    </div>
    <div class="chiedi-lista coro" id="chiediLista"></div>
    <a class="chiedi-wa" href="https://wa.me/393313251961" target="_blank"
      rel="noopener">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A10.4 10.4 0
        0 0 3.6 16.1L2.5 21.5l5.5-1.1A10.4 10.4 0 1 0 20.5 3.5z"/>
        <path d="M8.3 7.6c.3-.1.6 0 .8.3l1 1.7c.2.3.1.6-.1.8l-.7.7c.6 1.3 1.6
        2.3 2.9 2.9l.7-.7c.2-.2.5-.3.8-.1l1.7 1c.3.2.4.5.3.8-.4 1.1-1.6
        1.7-2.7 1.4-2.9-.8-5.1-3-5.9-5.9-.3-1.1.3-2.3 1.2-2.9z"
        class="acc"/></svg>
      Something we haven't answered? <b>Ask a person →</b></a>
  </div>
</section>

'''
corpo = corpo[:i] + DENARO + corpo[j:]

# ── 2 · il CSS ──────────────────────────────────────────────────────────
CSS = r'''
/* ── IL DENARO: il conto a sinistra, IL numero a destra ───────────────── */
.denaro-corpo { margin-top:clamp(22px,2.6vw,32px); display:grid; gap:16px;
  grid-template-columns:1fr; align-items:start; }
@media (min-width:920px){ .denaro-corpo {
  grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr); } }

.totale { padding:22px 24px 24px; background:
  linear-gradient(165deg, rgba(255,215,0,.075), rgba(255,215,0,.012) 58%),
  var(--card); box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.tot-eti { display:block; font-size:10.5px; font-weight:600; letter-spacing:.2em;
  text-transform:uppercase; color:var(--gold); }
.tot-flap { margin-top:13px; }
.tot-scudo { display:inline-flex; align-items:flex-start; gap:8px;
  margin-top:14px; font-size:11.5px; line-height:1.5; color:var(--text-4); }
.tot-scudo svg { width:15px; height:15px; flex:none; margin-top:1px;
  color:var(--green); fill:none; stroke:currentColor; stroke-width:1.6;
  stroke-linecap:round; stroke-linejoin:round; }

/* la durata: non cambia il giorno uno, cambia quanto costa restarci */
.durata { margin-top:20px; padding-top:18px;
  border-top:1px solid var(--line-gold); }
.durata-eti { display:block; font-size:12.5px; color:var(--text-2); }
.durata-tasti { margin-top:10px; display:flex; gap:7px; flex-wrap:wrap; }
.durata-tasti button { flex:1 1 auto; min-height:38px; padding:9px 14px;
  font-family:var(--sans); font-size:12px; font-weight:400; letter-spacing:.02em;
  color:var(--text-2); background:var(--surface); border:1px solid var(--line);
  border-radius:100px; cursor:pointer;
  transition:color .22s var(--ease), border-color .22s var(--ease),
    background .22s var(--ease); }
.durata-tasti button:hover { color:var(--text); border-color:var(--line-gold-2); }
.durata-tasti button.on { background:var(--gold); border-color:transparent;
  color:#000; font-weight:600; }
.durata-conto { margin-top:15px; }
.durata-conto > div { display:flex; align-items:baseline;
  justify-content:space-between; gap:14px; padding:7px 0; font-size:13px;
  color:var(--text-2); }
.durata-conto > div b { font-family:var(--display); font-size:15px;
  font-weight:400; color:var(--text); font-variant-numeric:tabular-nums;
  white-space:nowrap; }
.durata-tot { border-top:1px solid var(--line-0); margin-top:4px;
  padding-top:11px!important; }
.durata-tot span { color:var(--text); }
.durata-tot b { color:var(--gold)!important; font-size:19px!important; }
.durata-nota { margin-top:9px; font-size:11.5px; line-height:1.55;
  color:var(--text-4); }
.durata-nota b { color:var(--text-2); font-weight:400; }

/* IL numero sui Solari: e l'anima del marchio, e questa e la cifra che
   conta piu di ogni altra nel sito */
.flap-tot { display:inline-flex; gap:3px; }
.flap-tot .bs-cella { width:var(--w,26px); height:var(--h,38px); }
@media (max-width:520px){ .flap-tot .bs-cella { width:22px; height:33px; } }

/* ── QUELLO CHE CI CHIEDERESTI ────────────────────────────────────────── */
.chiedi-lista { margin-top:clamp(22px,2.6vw,32px); display:grid; gap:1px;
  background:var(--line-0); box-shadow:inset 0 0 0 1px var(--line-0);
  border-radius:14px; overflow:hidden; }
@media (min-width:900px){ .chiedi-lista { grid-template-columns:1fr 1fr; } }
.chiedi-v { background:var(--card); padding:17px 19px 18px;
  transition:background .3s var(--ease); }
.chiedi-v:hover { background:var(--elevated); }
.chiedi-v b { display:block; font-size:13.5px; font-weight:500;
  letter-spacing:.005em; color:var(--text); line-height:1.4; }
.chiedi-v p { margin:6px 0 0; font-size:12.5px; line-height:1.6;
  color:var(--text-2); }
.chiedi-v p em { font-style:normal; color:var(--gold); }
.chiedi-wa { display:inline-flex; align-items:center; gap:11px;
  margin-top:clamp(16px,2vw,22px); padding:13px 20px; border-radius:100px;
  background:var(--surface); box-shadow:inset 0 0 0 1px var(--line);
  font-size:12.5px; color:var(--text-2);
  transition:box-shadow .25s var(--ease), transform .25s var(--ease); }
.chiedi-wa:hover { box-shadow:inset 0 0 0 1px var(--line-gold-2);
  transform:translateY(-1px); }
.chiedi-wa b { color:var(--gold); font-weight:500; }
.chiedi-wa svg { width:19px; height:19px; flex:none; color:var(--green);
  fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round;
  stroke-linejoin:round; }
.chiedi-wa svg .acc { opacity:.7; }
'''
corpo = corpo.replace('</style>', CSS + '\n</style>', 1) if '</style>' in corpo \
    else corpo
open('ld-corpo.html', 'w', encoding='utf-8').write(corpo)

# ── 3 · la regia ────────────────────────────────────────────────────────
VECCHIO = regia[regia.index('  /* ── IL DENARO IN CHIARO ─'):
                regia.index("  /* ── L'APPLY: i tre passi")]
NUOVO = r'''  /* ── IL DENARO IN CHIARO ────────────────────────────────────────────
     Regole dichiarate, aritmetica visibile: la cauzione e N mensilita,
     l'onorario il 10% del canone ANNUO (quindi non cambia con la durata,
     e per questo il giorno uno resta uguale mentre il soggiorno no). */
  var mesiCauzione = c.cauzioneMesi || 1;
  var cauzione = c.prezzo * mesiCauzione;
  var onorario = Math.round(c.prezzo * 12 * .10);
  var totale = c.prezzo + cauzione + onorario;
  per('#contoCanone').textContent = euro(c.prezzo);
  per('#contoQuando').textContent = c.dal
    ? 'Available from ' + new Date(c.dal + 'T12:00:00')
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : 'Paid on move-in day';
  per('#contoCauzione').textContent = euro(cauzione);
  document.querySelectorAll('.conto-riga')[1].querySelector('em').textContent =
    mesiCauzione + (mesiCauzione === 1 ? ' month' : ' months')
    + ' — returned after the final walkthrough';
  per('#contoOnorario').textContent = euro(onorario);

  /* il totale gira sui Solari: e la cifra che conta piu di ogni altra */
  (function () {
    var host = document.getElementById('totFlap');
    if (!host) return;
    var testo = euro(totale);
    var quadro = null;
    if (window.BS && BS.Board) {
      quadro = new BS.Board(host, testo.length, ' €,.0123456789');
      var ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (ridotto || !('IntersectionObserver' in window)) quadro.show(testo);
      else new IntersectionObserver(function (v, io) {
        if (!v[0].isIntersecting) return;
        io.disconnect(); quadro.show(testo, 46, true);
      }, { threshold: .35 }).observe(host);
    } else { host.textContent = testo; }
  })();

  /* la durata: il giorno uno non cambia, il soggiorno si — ed e la
     domanda che arriva ogni volta in chat */
  (function () {
    var tasti = [].slice.call(document.querySelectorAll('.durata-tasti button'));
    if (!tasti.length) return;
    function conta(m) {
      var canoni = c.prezzo * m;
      per('#durCanoni').textContent = euro(canoni) + '  ';
      per('#durOnorario').textContent = euro(onorario);
      per('#durTotale').textContent = euro(canoni + onorario);
      per('#durNota').innerHTML = '<b>' + euro(cauzione) + '</b> of deposit sits '
        + 'on top of this and comes back to you at the end — it is held, not '
        + 'spent. Utilities and the registration tax are paid to the providers '
        + 'and to the State, never to us.';
      tasti.forEach(function (t) {
        t.classList.toggle('on', Number(t.dataset.m) === m); });
    }
    tasti.forEach(function (t) {
      t.addEventListener('click', function () { conta(Number(t.dataset.m)); });
    });
    conta(12);
  })();

  /* ── QUELLO CHE CI CHIEDERESTI SU WHATSAPP ──────────────────────────
     Dieci risposte, ognuna vera per quello che il sito e i documenti gia
     dicono. Le cifre vengono dalla casa aperta, non da un testo fisso. */
  (function () {
    var lista = document.getElementById('chiediLista');
    if (!lista) return;
    var D = [
      ['Can I see it without flying to Rome?',
       'Yes. A BOOM agent walks this exact flat on live video with you asking '
       + 'the questions, plus HD photos and the red flags said out loud. '
       + '<em>€89</em> — credited to your agency fee if you then rent with us.'],
      ['What exactly do I pay on day one?',
       '<em>' + euro(totale) + '</em>: first month ' + euro(c.prezzo)
       + ', deposit ' + euro(cauzione) + ' and the agency fee '
       + euro(onorario) + '. Nothing else is charged by us, ever.'],
      ['Is the deposit really coming back?',
       'It is held, not spent, and returned after the final walkthrough. '
       + 'The flat is filmed at move-in and at move-out, so the state of it '
       + 'is a recording and not an argument.'],
      ['How do I pay — and to whom?',
       'Through BOOM on Stripe, with a receipt for each line. Never a bank '
       + 'transfer to a private person. The counterparty is <em>Egidi '
       + 'Immobiliare S.r.l.</em>, a licensed agency — BOOM® is its EU trade '
       + 'mark 019317594.'],
      ['What kind of contract is it?',
       'A transitional lease under L. 431/98 art. 5 c. 1, in English and '
       + 'Italian, explained line by line before you sign. Registration with '
       + 'the Agenzia delle Entrate is handled by us.'],
      ['Do I have to be in Rome to sign?',
       'No. You sign from your phone with a private link, and the landlord '
       + 'countersigns after you. The keys are the only thing that needs you '
       + 'in the city.'],
      ['Do I need an Italian guarantor?',
       'Not by default. We look at your situation — employed, self-employed, '
       + 'student, relocating — and tell you what this particular landlord '
       + 'asks for before you apply, not after.'],
      ['How fast can I actually move in?',
       'As little as <em>48 hours</em> from a signed pre-agreement, if the '
       + 'flat is free. This one'
       + (c.dal ? ' is available from <em>' + new Date(c.dal + 'T12:00:00')
            .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
            + '</em>.' : ' is available now.')],
      ['Can I hold it while I decide?',
       'Yes — a <em>€300</em> hold takes it off the market for 48 hours, one '
       + 'tap, fully refundable. It is the only way to stop someone else '
       + 'taking it while you think.'],
      ['What is not included in the figures above?',
       'Utilities (electricity, gas, water, internet) and the registration '
       + 'tax. Both are paid to the providers and to the State — we never '
       + 'touch them, and we never mark them up.']
    ];
    lista.innerHTML = D.map(function (q) {
      return '<div class="chiedi-v"><b>' + q[0] + '</b><p>' + q[1] + '</p></div>';
    }).join('');
  })();

'''
regia = regia.replace(VECCHIO, NUOVO)
assert 'chiediLista' in regia and 'durata-tasti' in regia
open('ld-regia.html', 'w', encoding='utf-8').write(regia)
print('ld1 · denaro sui Solari + durata + le dieci risposte')
