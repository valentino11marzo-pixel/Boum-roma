#!/usr/bin/env python3
# v25 — LA BANCHINA. La fascia smette di vendere un servizio solo e diventa
#   lo smistamento: qualunque sia il punto in cui sei arrivato, c'e una porta
#   con un prezzo scritto sopra. Piu la garanzia sui pagamenti, con le parole
#   che il sito live usa gia — nessuna promessa nuova, nessuna assicurazione
#   inventata.
#
#   Il principio: nessuno compra «Deal Assistance». Uno compra «ho trovato
#   una casa da solo e ho paura di farmi fregare». Quindi ogni porta e la
#   SITUAZIONE, e il prezzo e la risposta.
#
#   Copy verificata sul live:
#     · virtual-viewing.html  «€89 … credited to your agency fee» ·
#                             «Refunded in full if we can't reach the property»
#     · how-it-works.html     «First month + deposit + fee via Stripe.
#                             No bank-transfer circus.» ·
#                             «Legally protected, fully refundable. Video
#                             inventory at move-in and move-out.» ·
#                             «€350 … deducted from the agency fee — and
#                             refunded if we don't deliver»
#     · deal-assistance.html  «€249 fixed» · «Stripe-secured»
#     · contract-check-express.html «€49, credited on Deal Assistance»
f = 'pt.html'
s = open(f, encoding='utf-8').read()
def uno(a, b, nome):
    global s
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    s = s.replace(a, b)

STRIPE = open('stripe.svg', encoding='utf-8').read().replace(
    'class="stripe-logo"', 'class="ba-stripe" aria-label="Stripe"')
STRIPE = ' '.join(STRIPE.split())

# ── 1 · via il CSS della fascia v23 ─────────────────────────────────────
a = s.index("/* ── LA FASCIA — l'ultima cosa prima del catalogo")
b = s.index('.porta svg .pieno')
CSS = r'''/* ── LA BANCHINA — dove chi arriva viene smistato ──────────────────────
   Non «i nostri servizi»: la situazione in cui uno si trova, col prezzo
   della risposta. Nessuno compra «Deal Assistance»; uno compra «ho trovato
   casa da solo e ho paura di farmi fregare». Sotto, la garanzia sui
   pagamenti — con le parole che il sito usa gia, nessuna promessa nuova. */
.banchina { margin-top:clamp(20px,2.4vw,30px); border:1px solid var(--line);
  border-radius:16px; overflow:hidden; background:var(--surface); }

.ba-capo { display:flex; align-items:baseline; justify-content:space-between;
  gap:14px; flex-wrap:wrap; padding:14px 18px 12px; }
.ba-capo b { font-family:var(--display); font-size:15.5px; font-weight:400;
  letter-spacing:.005em; color:var(--text); }
.ba-capo b em { font-style:normal; color:var(--gold); }
.ba-tutti { display:inline-flex; align-items:center; gap:7px; font-size:11px;
  font-weight:600; letter-spacing:.14em; text-transform:uppercase;
  color:var(--text-4); padding:10px 2px; margin:-10px 0;
  transition:color .25s var(--ease); }
.ba-tutti:hover { color:var(--gold); }

/* le porte: una situazione per cella, il prezzo come risposta */
.ba-porte { display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
  background:var(--line-0); border-top:1px solid var(--line-0); }
.ba-p { position:relative; display:block; background:var(--surface);
  padding:14px 15px 15px; transition:background .3s var(--ease); }
.ba-p::before { content:''; position:absolute; top:0; left:0; right:0;
  height:1px; background:var(--gold); transform:scaleX(0);
  transform-origin:left; transition:transform .42s var(--ease); }
.ba-p:hover { background:var(--elevated); }
.ba-p:hover::before { transform:scaleX(1); }
.ba-p svg.sg { width:19px; height:19px; color:var(--gold); fill:none;
  stroke:currentColor; stroke-width:1.5; stroke-linecap:round;
  stroke-linejoin:round; transition:transform .4s var(--ease); }
.ba-p svg.sg .acc { opacity:.55; }
.ba-p svg.sg .pieno { fill:var(--gold); stroke:none; }
.ba-p:hover svg.sg { transform:translateY(-2px); }
.ba-p .caso { display:block; margin-top:9px; font-size:13.5px; font-weight:500;
  letter-spacing:.005em; color:var(--text); line-height:1.35; }
.ba-p .fa { display:block; margin-top:3px; font-size:11.5px; line-height:1.45;
  color:var(--text-4); }
.ba-p .costo { display:flex; align-items:baseline; gap:7px; margin-top:9px;
  flex-wrap:wrap; }
.ba-p .costo b { font-family:var(--display); font-size:17px; font-weight:400;
  letter-spacing:.02em; color:var(--gold); font-variant-numeric:tabular-nums; }
.ba-p .costo i { font-style:normal; font-size:10.5px; color:var(--text-4);
  line-height:1.3; }
/* la porta che vale di piu per chi e appena atterrato */
.ba-p.prima { background:linear-gradient(165deg, rgba(255,215,0,.07),
  rgba(255,215,0,.01) 70%, transparent); }
.ba-p.prima:hover { background:linear-gradient(165deg, rgba(255,215,0,.12),
  rgba(255,215,0,.02) 70%, transparent); }

/* su schermo stretto: una fila che scorre. Le porte sono alternative —
   scegliene una — quindi il carosello qui e onesto (a differenza della
   fiducia, che va sempre tutta visibile). */
@media (max-width:860px){
  .ba-porte { display:flex; overflow-x:auto; scroll-snap-type:x mandatory;
    scrollbar-width:none; -webkit-overflow-scrolling:touch; }
  .ba-porte::-webkit-scrollbar { display:none; }
  .ba-p { flex:0 0 min(72vw,232px); scroll-snap-align:start;
    border-right:1px solid var(--line-0); }
  .ba-p:last-child { border-right:0; } }

/* la garanzia: dove finiscono i soldi, detta con le parole del sito */
.ba-soldi { display:flex; align-items:center; gap:15px; padding:14px 18px;
  border-top:1px solid var(--line-0);
  background:linear-gradient(100deg, rgba(0,255,136,.045),
    rgba(0,255,136,.008) 58%, transparent); }
.ba-scudo { width:34px; height:34px; flex:none; border-radius:50%;
  display:grid; place-items:center; background:rgba(0,255,136,.09);
  border:1px solid rgba(0,255,136,.26); }
.ba-scudo svg { width:17px; height:17px; color:var(--green); fill:none;
  stroke:currentColor; stroke-width:1.6; stroke-linecap:round;
  stroke-linejoin:round; }
.ba-soldi .dice { flex:1; min-width:0; font-size:12.5px; line-height:1.55;
  color:var(--text-2); }
.ba-soldi .dice b { color:var(--text); font-weight:500; }
.ba-soldi .dice em { font-style:normal; color:var(--green); font-weight:500; }
.ba-stripe { width:46px; height:auto; flex:none; opacity:.85; }
@media (max-width:640px){ .ba-stripe { display:none; } }

/* la coda: i fatti che restano veri comunque, e l'ora di Roma */
.ba-coda { display:flex; align-items:center; gap:9px; flex-wrap:wrap;
  padding:10px 18px; border-top:1px solid var(--line-0); background:var(--void);
  font-size:11.5px; color:var(--text-4); }
.ba-coda .ch { display:inline-flex; align-items:center; gap:6px;
  white-space:nowrap; }
.ba-coda .ch svg { width:13px; height:13px; color:var(--gold); flex:none;
  fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round;
  stroke-linejoin:round; }
.ba-coda .sep { width:1px; height:12px; background:var(--line); flex:none; }
@media (max-width:640px){ .ba-coda .sep { display:none; }
  .ba-coda { gap:7px 14px; } }
.ba-viva { display:inline-flex; align-items:center; gap:7px; margin-left:auto; }
@media (max-width:860px){ .ba-viva { margin-left:0; } }
.ba-viva .pt { width:6px; height:6px; border-radius:50%; background:var(--green);
  animation:fa-pulsa 2.8s ease-out infinite; }
@keyframes fa-pulsa {
  0%   { box-shadow:0 0 0 0 rgba(0,255,136,.45); }
  70%  { box-shadow:0 0 0 8px rgba(0,255,136,0); }
  100% { box-shadow:0 0 0 0 rgba(0,255,136,0); } }
.orologio-roma { color:var(--gold); font-variant-numeric:tabular-nums;
  letter-spacing:.1em; }
@media (prefers-reduced-motion:reduce){ .ba-viva .pt { animation:none; } }

'''
s = s[:a] + CSS + s[b:]

# ── 2 · il markup ───────────────────────────────────────────────────────
i = s.index('  <!-- la fascia: una cosa da comprare, quattro fatti, la riga viva -->')
j = s.index('</header>', i)
HTML = '''  <!-- la banchina: dove chi arriva viene smistato, col prezzo scritto -->
  <div class="container">
    <div class="banchina coro dentro-subito">

      <div class="ba-capo">
        <b>Wherever you are in this, <em>there's a door</em>.</b>
        <a class="ba-tutti" href="#porte">All services →</a>
      </div>

      <div class="ba-porte">
        <a class="ba-p prima" href="/virtual-viewing.html">
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5"
            y="6.5" width="12" height="11" rx="2"/>
            <path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>
            <circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg>
          <span class="caso">Can't fly over to see it?</span>
          <span class="fa">A live video tour of that exact flat — the red
            flags said out loud.</span>
          <span class="costo"><b>€89</b><i>credited to your fee if you
            rent with us</i></span>
        </a>

        <a class="ba-p" href="/property-finding.html">
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6L20.5 20.5"/>
            <path d="M8 10.8h5.6M10.8 8v5.6" class="acc"/></svg>
          <span class="caso">Nothing in the catalogue fits?</span>
          <span class="fa">We hunt the whole market for you, off-market
            included.</span>
          <span class="costo"><b>€350</b><i>deducted on success ·
            refunded if we don't deliver</i></span>
        </a>

        <a class="ba-p" href="/deal-assistance.html">
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.4l7.2 2.9v5.1c0 4.2-3 7.2-7.2 8.4-4.2-1.2-7.2-4.2-7.2-8.4V6.3z"/>
            <path d="M9.1 11.6l2.2 2.2 4.1-4.7" class="acc"/></svg>
          <span class="caso">Found one yourself?</span>
          <span class="fa">We verify the landlord, the papers and the price
            — then negotiate.</span>
          <span class="costo"><b>€249</b><i>fixed · avg saving €600+</i></span>
        </a>

        <a class="ba-p" href="/contract-check-express.html">
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3.2h7.4L18.6 8v12.8H6z"/>
            <path d="M13.2 3.2V8h5.2" class="acc"/>
            <path d="M9 12.6h6.4M9 15.8h4.4" class="acc"/></svg>
          <span class="caso">About to sign something?</span>
          <span class="fa">A written traffic-light verdict in 24h: what's
            fine, what's unfair, what's missing.</span>
          <span class="costo"><b>€49</b><i>credited on Deal
            Assistance</i></span>
        </a>
      </div>

      <div class="ba-soldi">
        <span class="ba-scudo" aria-hidden="true"><svg viewBox="0 0 24 24">
          <path d="M12 3l7 2.8v5.4c0 4.1-3 7.1-7 8.3-4-1.2-7-4.2-7-8.3V5.8z"/>
          <path d="M8.6 11.6l2.3 2.3 4.3-4.9"/></svg></span>
        <span class="dice"><b>Every euro goes through BOOM, never to a
          stranger.</b> First month, deposit and agency fee on Stripe —
          <em>no bank-transfer circus</em>, a receipt for each one, and a
          full refund if we don't deliver. Your deposit is legally protected
          and filmed in and out.</span>
        ''' + STRIPE + '''
      </div>

      <div class="ba-coda">
        <span class="ch"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12.5l5 5 10-11"/></svg>Walked and filmed by us</span>
        <span class="sep"></span>
        <span class="ch"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12.5l5 5 10-11"/></svg>Move-in total before you
          pay</span>
        <span class="sep"></span>
        <span class="ch"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12.5l5 5 10-11"/></svg>Licensed agency · BOOM® EU
          019317594</span>
        <span class="ba-viva"><span class="pt"></span>Rome
          <span class="orologio-roma" id="oraRoma">—:—</span>
          · we reply within 2h</span>
      </div>

    </div>
  </div>
'''
s = s[:i] + HTML + s[j:]

assert 'fa-capo' not in s and 'fa-fatti' not in s, 'residui fascia v23'
assert s.count('id="oraRoma"') == 1, 'orologio'
assert s.count('<a class="ba-p') == 4, s.count('<a class="ba-p')
assert s.count('019317594') == 3, s.count('019317594')
open(f, 'w', encoding='utf-8').write(s)
print('v25 · la banchina: 4 porte con prezzo + la garanzia sui pagamenti')
