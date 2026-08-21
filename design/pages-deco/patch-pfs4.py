#!/usr/bin/env python3
# PFS 4.0 — LA PAGINA CHE SMONTA LO SCETTICISMO, sezione per sezione.
# Esegue l'architettura confermata dal fondatore (studio a 5 agenti +
# secondo studio sulla porta): UNA porta, de-risking meccanico, obiezione
# nominata, prodotto toccabile, verificabilità cliccabile, il ritorno
# dalla cassa visibile solo a chi ha annullato. Ancore verbatim su
# ENTRAMBI i file (sorgente pf-body + live property-finding).
import sys

FILES = ['design/pages-deco/pf-body.html', 'property-finding.html']
WA = 'https://wa.me/393313251961'
MAPS = 'https://www.google.com/maps?q=Egidi+Immobiliare+Via+dei+Coronari+Roma'
EUIPO = 'https://euipo.europa.eu/eSearch/#details/trademarks/019317594'


def uno(s, ago, f):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO in {f}: {n} occorrenze di {ago[:70]!r}')
        sys.exit(1)


# ═══ R1 · HERO: la perdita, i link vivi, Valentino ═══════════════════
H1_A = '''<h1 class="titolo" style="margin-top:24px">Can't find the right place?<br>
        <span class="hl">We'll find it for you.</span></h1>'''
H1_B = '''<h1 class="titolo" style="margin-top:24px">A good flat in Rome goes in a day.<br>
        <span class="hl">Yours needs a hunter.</span></h1>'''

SOTTO_A = '''<p class="sotto">Your dedicated expert searches off-market properties,
        negotiates on your behalf, handles viewings and manages everything from
        contracts to utilities. €350 upfront — deducted from your first month
        when we succeed.</p>'''
SOTTO_B = '''<p class="sotto">Your dedicated expert hunts the whole Rome market —
        off-market included — negotiates for you and handles everything to
        move-in. By contract: <b>at least 3 options in your criteria within
        15 days, or the €350 is refunded in full</b> (Terms §4.2).</p>'''

TRUST_A = '''<p class="pf-trust"><span class="trust-stars">★★★★★</span>
        <b>4.9 on Google</b> · 47 reviews · licensed agency —
        <b>Egidi Immobiliare S.r.l.</b></p>'''
TRUST_B = '''<p class="pf-trust"><span class="trust-stars">★★★★★</span>
        <a href="''' + MAPS + '''" target="_blank" rel="noopener"><b>4.9 on
        Google</b> · 47 reviews</a> · <a href="/terms.html">Licensed —
        <b>Egidi Immobiliare S.r.l.</b>, P.IVA 17322991005</a> ·
        <a href="''' + EUIPO + '''" target="_blank" rel="noopener">EU
        trademark 019317594</a></p>'''

CTA_A = '''<div class="hero-actions">
        <a class="btn btn-primary" href="#checkin">Start the hunt · €350</a>
        <a class="btn btn-secondary" href="#macchina">See the machine →</a>'''
CTA_B = '''<div class="hero-actions">
        <a class="btn btn-primary" href="#checkin">Start the hunt</a>
        <a class="btn btn-secondary" href="''' + WA + '''" target="_blank" rel="noopener">Message Valentino →</a>'''

# ═══ R2 · CSS nuovo (in coda al blocco stile del check-in) ═══════════
CSS_ANCORA = '''  .ck-tratta::after { animation:none; width:100%; opacity:.4; }
}'''
CSS_NUOVO = CSS_ANCORA + '''

/* ── PFS 4.0: i link vivi della fiducia ── */
.pf-trust a { color:var(--text-3); text-decoration:underline;
  text-underline-offset:3px; text-decoration-color:rgba(255,215,0,.35); }
.pf-trust a:hover { color:var(--text); }
/* il costo di cercare da solo: aritmetica rifacibile, mai numeri tondi */
.conto { margin-top:clamp(24px,3vw,38px); display:grid; gap:1px;
  grid-template-columns:1fr; background:var(--line-0);
  box-shadow:inset 0 0 0 1px var(--line-0); }
@media (min-width:840px){ .conto { grid-template-columns:repeat(3,1fr); } }
.conto > div { background:var(--card); padding:20px 22px; }
.conto b { display:block; font-family:var(--display); font-weight:250;
  font-size:22px; color:var(--gold); font-variant-numeric:tabular-nums; }
.conto span { display:block; margin-top:6px; font-size:13px;
  line-height:1.6; color:var(--text-2); }
.conto-chiusa { margin-top:16px; font-size:15px; color:var(--text);
  max-width:66ch; }
.conto-chiusa b { color:var(--gold); font-weight:600; }
.conto-bench { margin-top:8px; font-size:12.5px; color:var(--text-3);
  max-width:66ch; }
/* l'obiezione nominata: la tabella meccanica scam vs servizio */
.regola2 { margin-top:clamp(24px,3vw,38px); display:grid; gap:1px;
  background:var(--line-0); box-shadow:inset 0 0 0 1px var(--line-0);
  grid-template-columns:minmax(90px,.55fr) 1fr 1fr; }
.regola2 > div { background:var(--card); padding:13px 16px;
  font-size:12.5px; line-height:1.55; color:var(--text-2); min-width:0; }
.regola2 .r2-testa { font-size:10px; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:var(--text-3); display:flex;
  align-items:flex-end; }
.regola2 .r2-testa.male { color:var(--rosso,#FF6B4A); }
.regola2 .r2-testa.bene { color:var(--gold); }
.regola2 .r2-eti { font-size:10px; font-weight:700; letter-spacing:.14em;
  text-transform:uppercase; color:var(--text-3); display:flex;
  align-items:center; }
.regola2 .male { color:var(--text-3); }
.regola2 .bene b { color:var(--text); }
.regola2 a { color:inherit; }
@media (max-width:680px){
  .regola2 { grid-template-columns:1fr; }
  .regola2 .r2-eti { padding-bottom:4px; }
  .regola2 .r2-testa { display:none; }
  .regola2 .male::before { content:'THE SCAM PATTERN — '; font-size:9px;
    font-weight:700; letter-spacing:.14em; color:var(--rosso,#FF6B4A); }
  .regola2 .bene::before { content:'THIS SERVICE — '; font-size:9px;
    font-weight:700; letter-spacing:.14em; color:var(--gold); }
}
.regola-fonte { margin-top:12px; font-size:12px; color:var(--text-3); }
.regola-fonte a { color:var(--text-2); }
/* la macchina: la chiusura aritmetica */
.mac-fine { margin-top:16px; padding-top:14px;
  border-top:1px solid var(--line-0); font-size:13px; color:var(--text-2);
  max-width:64ch; }
.mac-fine b { color:var(--gold); font-weight:600; }
/* cosa è incluso: la striscia compatta al posto delle sei card */
.inclusi { margin-top:clamp(22px,3vw,34px); display:flex; flex-wrap:wrap;
  gap:8px; }
.inclusi span { padding:9px 14px; font-size:12.5px; color:var(--text-2);
  box-shadow:inset 0 0 0 1px var(--line); border-radius:100px; }
.inclusi span b { color:var(--gold); font-weight:600; }
/* il prodotto toccabile */
.tocca { margin-top:clamp(24px,3vw,38px); display:grid; gap:1px;
  grid-template-columns:1fr; background:var(--line-0);
  box-shadow:inset 0 0 0 1px var(--line-0); }
@media (min-width:900px){ .tocca { grid-template-columns:repeat(3,1fr); } }
.tocca > div { background:var(--card); padding:22px;
  display:flex; flex-direction:column; }
.tocca h3 { font-size:15px; font-weight:600; }
.tocca p { margin-top:6px; font-size:13px; line-height:1.6;
  color:var(--text-2); flex:1; }
.tocca a { margin-top:14px; display:inline-flex; align-items:center;
  gap:8px; align-self:flex-start; padding:10px 16px; font-size:12px;
  font-weight:600; color:var(--gold); text-decoration:none;
  box-shadow:inset 0 0 0 1px var(--line-gold); border-radius:100px;
  transition:background .3s ease; }
.tocca a:hover { background:var(--gold-muted); }
.tocca small { margin-top:8px; font-size:10.5px; color:var(--text-3); }
/* la prova: verificabile, non dichiarata */
.verifica { margin-top:clamp(24px,3vw,38px); display:grid; gap:14px;
  grid-template-columns:1fr; }
@media (min-width:900px){ .verifica { grid-template-columns:1.1fr .9fr; } }
.rec-card { display:flex; align-items:center; gap:18px; padding:24px;
  background:var(--card); box-shadow:inset 0 0 0 1px var(--line-0);
  text-decoration:none; transition:box-shadow .3s ease; }
.rec-card:hover { box-shadow:inset 0 0 0 1px var(--line-gold); }
.rec-card svg { width:34px; height:34px; fill:var(--gold); flex:none; }
.rec-card b { display:block; font-family:var(--display); font-weight:250;
  font-size:22px; color:var(--text); }
.rec-card span { display:block; margin-top:3px; font-size:12.5px;
  color:var(--text-3); }
.rec-card i { margin-left:auto; font-style:normal; font-size:12px;
  font-weight:600; color:var(--gold); white-space:nowrap; }
.volto { padding:24px; background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.volto .v-chi { display:flex; align-items:center; gap:14px; }
.volto .v-foto { width:54px; height:54px; border-radius:50%; flex:none;
  background:var(--gold-muted); display:grid; place-items:center;
  font-family:var(--display); font-size:20px; color:var(--gold);
  overflow:hidden; }
.volto .v-foto img { width:100%; height:100%; object-fit:cover; }
.volto .v-nome b { display:block; font-size:15px; font-weight:600; }
.volto .v-nome span { display:block; margin-top:2px; font-size:11.5px;
  color:var(--text-3); }
.volto p { margin-top:12px; font-size:13px; line-height:1.65;
  color:var(--text-2); }
.volto p b { color:var(--text); }
.volto a { margin-top:12px; display:inline-flex; padding:10px 16px;
  font-size:12px; font-weight:600; color:var(--gold);
  text-decoration:none; box-shadow:inset 0 0 0 1px var(--line-gold);
  border-radius:100px; }
/* il check-in: le carte attorno al bottone */
.ck-tenuta { margin:2px 0 12px; font-size:11px; line-height:1.55;
  color:var(--text-2); }
.ck-mecc { margin-top:9px; display:flex; gap:8px; font-size:10.5px;
  line-height:1.55; color:var(--text-3); }
.ck-mecc::before { content:'—'; color:var(--gold); flex:none; }
.ck-mecc b { color:var(--text-2); }
.ck-mecc a { color:var(--text-2); }
/* il ritorno dalla cassa: lo vede SOLO chi ha annullato */
.ck-torno { margin:0 0 18px; padding:18px 20px; background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line-gold); }
.ck-torno h3 { font-size:14.5px; font-weight:600; }
.ck-torno p { margin-top:6px; font-size:13px; line-height:1.6;
  color:var(--text-2); max-width:64ch; }
.ck-torno a { display:inline-flex; margin-top:12px; padding:10px 18px;
  font-size:12.5px; font-weight:700; color:#0A0A05;
  background:var(--gold); border-radius:100px; text-decoration:none; }
/* faq: il blocco identità */
.identita { margin-top:18px; padding:16px 18px; background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line-0); font-size:12px;
  line-height:1.7; color:var(--text-3); max-width:860px; }
.identita b { color:var(--text-2); }
.identita a { color:var(--text-2); }'''

# ═══ R3 · sezioni nuove: COSTO + OBIEZIONE (prima del check-in) ══════
CHECKIN_COMMENT = "<!-- ══ IL CHECK-IN — la porta: il brief e' un boarding pass ══════════════ -->"
NUOVE_SEZIONI = '''<!-- ══ IL CONTO — cercare da solo ha un prezzo, calcolabile ══════════════ -->
<section class="section section-dark" id="conto">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>The cost of searching alone</span>
      <h2 class="titolo">Do the math<br><span class="hl">before you do the hunt</span>.</h2>
    </div>
    <div class="conto sale">
      <div><b>21 nights × €90</b><span>a typical temporary stay in Rome
        while you search from hotels and short lets — ≈ €1,890 for three
        weeks, and the clock only stops when you sign.</span></div>
      <div><b>1–2 months' deposit</b><span>what renters wire to "hold" an
        unverified flat — the exact money Rome's rental scams are built
        to take. Our scam guide exists because it keeps happening.</span></div>
      <div><b>6–8 viewings</b><span>the visits a serious search needs.
        From another timezone you attend the leftovers — the good ones
        are gone before your flight lands.</span></div>
    </div>
    <p class="conto-chiusa sale">Against that: <b>€350, refundable by
      contract</b> — and deducted from the agency fee when we deliver.</p>
    <p class="conto-bench sale">For scale: a dedicated flat hunter runs
      €1,100–1,800+ in Paris or Amsterdam. Same craft, Rome, with the
      refund written into the contract: €350.</p>
  </div>
</section>

<!-- ══ LA REGOLA — l'obiezione detta da noi, prima che la pensi ══════════ -->
<section class="section" id="regola">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>The rule you've read everywhere</span>
      <h2 class="titolo">“Never pay upfront in Rome.”<br>
        <span class="hl">Correct — keep following it.</span></h2>
      <p class="sotto">That rule protects you from rental scams. We teach
        it ourselves, in our own scam guide. Here is why this service sits
        in a different category — dimension by dimension, mechanically:</p>
    </div>
    <div class="regola2 sale">
      <div class="r2-testa" aria-hidden="true"></div>
      <div class="r2-testa male">The scam pattern</div>
      <div class="r2-testa bene">This service</div>
      <div class="r2-eti">Who you pay</div>
      <div class="male">A stranger from a listing, unreachable after
        the transfer</div>
      <div class="bene"><b>Egidi Immobiliare S.r.l.</b> — registered
        Italian company, P.IVA 17322991005, REA RM-1710623, office in
        Via dei Coronari 181</div>
      <div class="r2-eti">How you pay</div>
      <div class="male">Bank transfer — irreversible by design</div>
      <div class="bene"><b>Card via Stripe</b> — receipted, and card
        payments carry chargeback protection</div>
      <div class="r2-eti">What you hold</div>
      <div class="male">A promise in a chat</div>
      <div class="bene"><b>A written contract term</b>: at least 3 options
        in your criteria within 15 days — Terms §4.2</div>
      <div class="r2-eti">If it goes wrong</div>
      <div class="male">The money is gone</div>
      <div class="bene"><b>The €350 returns to your card</b>, in full —
        no admin fee (Terms §7.1-bis)</div>
    </div>
    <p class="regola-fonte sale">Never seen a Rome rental scam up close?
      <a href="/blog-scam-bible.html">Read our scam guide</a> — the
      patterns, the red flags, the exact phrases they use. Whoever teaches
      the defence isn't the threat.</p>
  </div>
</section>

''' + CHECKIN_COMMENT

# ═══ R4 · perché: via l'aggettivo, dentro il fatto ═══════════════════
PERCHE_A = '''<h2 class="titolo">An unfair advantage,<br><span class="hl">on your side.</span></h2>'''
PERCHE_B = '''<h2 class="titolo">Three things you can't do<br><span class="hl">from abroad.</span></h2>'''

# ═══ R5 · macchina: la chiusura aritmetica ═══════════════════════════
MAC_A = '''<div class="soglia-r"><b>60</b><span>the push threshold — anything
          scoring below sixty out of a hundred never reaches your phone.</span></div>'''
MAC_B = MAC_A + '''
        <p class="mac-fine">Every 15 minutes = <b>96 scans a day</b>. These
          schedules are read from our production deploy file — not
          marketing copy.</p>'''

# ═══ R6 · griglia6 → striscia inclusi (via anche il refuso first month) ═══
G6_INIZIO = '<div class="griglia6 sale coro">'
G6_FINE = '<div class="diverso quadro sale"'
INCLUSI = '''<div class="inclusi sale">
      <span><b>Dedicated expert</b> — one person, your contact</span>
      <span><b>Off-market access</b> — homes never listed publicly</span>
      <span><b>Viewings done for you</b> — in person, live on video</span>
      <span><b>Negotiation</b> — rent, deposit, contract terms</span>
      <span><b>Full setup</b> — contract, utilities, codice fiscale</span>
      <span><b>€350 deducted</b> from the agency fee on success</span>
    </div>

    '''

# ═══ R7 · nuove sezioni TOCCA + VERIFICA (prima del prezzo) ══════════
PREZZO_COMMENT = '<!-- ══ IL PREZZO — verbatim ══════════════════════════════════════════════ -->'
TOCCA_E_VERIFICA = '''<!-- ══ IL PRODOTTO TOCCABILE — cosa ti arriva sul telefono ═══════════════ -->
<section class="section section-dark" id="tocca">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Touch it before you pay</span>
      <h2 class="titolo">What lands on your phone<br><span class="hl">by day three</span>.</h2>
    </div>
    <div class="tocca sale">
      <div>
        <h3>The swipe deck</h3>
        <p>Every match arrives as a card in your private app — photo,
          price, score, and why it matched your brief. Swipe through them
          like the place is already yours.</p>
        <a href="/client-portal.html?code=DEMO">Try the actual client app →</a>
        <small>Opens the real app with sample data — 10 seconds, no
          signup.</small>
      </div>
      <div>
        <h3>The Wallet boarding pass</h3>
        <p>Every confirmed viewing lands in Apple Wallet — address, time,
          directions, geofenced to the door. Your visit behaves like a
          flight.</p>
        <a href="/api/pass-demo?type=viewing">Add a sample pass →</a>
        <small>On iPhone it opens straight into Wallet.</small>
      </div>
      <div>
        <h3>The 90-second test drive</h3>
        <p>Feel the whole rail — from brief to signed contract — on three
          real homes, in your browser, right now.</p>
        <a href="/try.html">Try it in 90 seconds →</a>
        <small>No account, nothing saved.</small>
      </div>
    </div>
  </div>
</section>

<!-- ══ LA VERIFICA — controllaci, non fidarti ════════════════════════════ -->
<section class="section" id="verifica">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Verifiable, not claimed</span>
      <h2 class="titolo">Don't trust us.<br><span class="hl">Check us.</span></h2>
    </div>
    <div class="verifica sale">
      <a class="rec-card" href="''' + MAPS + '''" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7z"/></svg>
        <span><b>4.9 on Google</b><span>47 reviews from real tenants —
          read every one of them</span></span>
        <i>Google ↗</i>
      </a>
      <div class="volto">
        <div class="v-chi">
          <span class="v-foto" id="vFoto">V</span>
          <span class="v-nome"><b>Valentino — Founder</b>
            <span>Licensed agency · Egidi Immobiliare S.r.l. · Roma</span></span>
        </div>
        <p>I run the search. Every home on your shortlist, <b>I've walked
          in person</b> before you see it. And the guarantee has my
          company's name on it: 3 options in your criteria within 15 days,
          or the €350 goes back to your card — it's in the contract, not
          in the marketing.</p>
        <a href="''' + WA + '''" target="_blank" rel="noopener">Message me
          directly on WhatsApp →</a>
      </div>
    </div>
  </div>
</section>

''' + PREZZO_COMMENT

# ═══ R8 · prezzo: copy allineato al contratto ════════════════════════
PZ1_A = '<span>Upfront fee</span>'
PZ1_B = '<span>Flat fee · refundable</span>'
PZ2_A = '<p class="prezzoP-sub">Deducted from first month when we succeed</p>'
PZ2_B = ('<p class="prezzoP-sub">Deducted from the agency fee on success — '
         'or refunded in full (Terms §4.2)</p>')
PZ3_A = '<div><b>€0</b><span>Net cost*</span></div>'
PZ3_B = '<div><b>€0</b><span>Net on success</span></div>'

# ═══ R9 · check-in: le carte attorno al bottone + spostamento ════════
STUB_A = '''<div class="ck-sotto">BOOM·ROME · FIRST · PF-0350</div>'''
STUB_B = '''<div class="ck-sotto">BOOM·ROME · FIRST · PF-0350</div>
        <p class="ck-tenuta">Held on your file — deducted from the agency
          fee on success, or refunded. Never just spent.</p>'''

GAR_A = '''<p class="ck-garanzia"><span><b>Zero risk:</b> deducted on success,
          refunded in full if we don't deliver.</span></p>'''
GAR_B = GAR_A + '''
        <p class="ck-mecc"><span>By contract: at least <b>3 options in your
          criteria within 15 days</b>, or the €350 returns to your card —
          <a href="/terms.html" target="_blank" rel="noopener">Terms
          §4.2</a>.</span></p>
        <p class="ck-mecc"><span>Card via <b>Stripe</b> to Egidi Immobiliare
          S.r.l. — never a bank transfer to an individual. Chargeback
          protection applies.</span></p>'''

# il banner del ritorno dalla cassa, dentro la sezione check-in
FORM_A = '''<form class="ckt sale" id="ckForm" style="margin-top:clamp(22px,3vw,34px)" novalidate>'''
FORM_B = '''<div class="ck-torno" id="ckTorno" hidden
      style="margin-top:clamp(22px,3vw,34px)">
      <h3>Not ready to commit €350 today? Fair.</h3>
      <p>Two no-cost moves: a 15-minute call with the person who would run
        your search — or nothing at all: <b>we already have your brief</b>,
        and Valentino writes to you personally within a few hours.</p>
      <a href="''' + WA + '''?text=Hi%20Valentino%2C%20I%20was%20on%20the%20Property%20Finding%20page%20—%20can%20we%20do%20a%20quick%2015-min%20call%3F"
        target="_blank" rel="noopener">Book the 15-minute call →</a>
    </div>
    <form class="ckt sale" id="ckForm" novalidate>'''

# ═══ R10 · FAQ: bilaterali + la quinta domanda + identità ════════════
FAQ2_A = '''      <details><summary>Is the €350 an extra cost?</summary>
        <p>No — it is deducted from your first month's rent when we secure
          your apartment, so it effectively disappears.</p></details>'''
FAQ2_B = '''      <details><summary>Is the €350 an extra cost?</summary>
        <p>No — it is deducted from the agency fee when we secure your
          apartment, so it effectively disappears. If we don't deliver,
          it comes back in full (Terms §4.2).</p></details>'''
FAQ4_A = '''      <details><summary>I'm not in Italy yet — does it still work?</summary>
        <p>Perfectly. We handle the viewings on video and manage everything
          remotely — contract and utilities included.</p></details>'''
FAQ4_B = '''      <details><summary>I'm not in Italy yet — does it still work?</summary>
        <p>Yes — viewings live on video, the contract signed from your
          phone, utilities handled. One thing genuinely helps: being
          reachable on WhatsApp for quick decisions, because good flats
          move in hours, not days.</p></details>
      <details><summary>How do I know BOOM is legitimate?</summary>
        <p>Check, don't trust: Egidi Immobiliare S.r.l. — P.IVA 17322991005,
          REA RM-1710623, Via dei Coronari 181, Roma. EU trademark
          019317594, verifiable on EUIPO. 47 Google reviews you can read.
          Every payment runs through Stripe with a receipt — we never ask
          for a bank transfer to an individual.</p></details>'''

FAQLIST_FINE = '''</details>
    </div>
  </div>
</section>'''

# ═══ R11 · il copione del ritorno + il salvataggio del brief ═════════
SCRIPT_A = '''</script>

<footer class="footer">'''
SCRIPT_B = '''</script>
<script>
/* IL RITORNO DALLA CASSA: il banner lo vede SOLO chi ha annullato su
   Stripe (?canceled=1) — i caldi non lo incontrano mai. E il brief
   sopravvive al giro: salvato prima del redirect, ripristinato al
   ritorno. */
(function () {
  'use strict';
  var form = document.getElementById('ckForm');
  var torno = document.getElementById('ckTorno');
  if (!form) return;
  function traccia(n, p) { try { gtag('event', n, p || {}); } catch (e) {} }
  var CAMPI = ['name', 'email', 'phone', 'budget', 'move_in_date',
    'bedrooms', 'preferred_areas', 'must_haves', 'additional_info'];
  form.addEventListener('submit', function () {
    try {
      var d = {};
      CAMPI.forEach(function (k) {
        var el = form.querySelector('[name="' + k + '"]');
        if (el && el.value) d[k] = el.value;
      });
      sessionStorage.setItem('boom_pfs_brief', JSON.stringify(d));
    } catch (e) {}
  });
  try {
    var salvato = JSON.parse(sessionStorage.getItem('boom_pfs_brief') || '0');
    if (salvato) CAMPI.forEach(function (k) {
      var el = form.querySelector('[name="' + k + '"]');
      if (el && !el.value && salvato[k]) el.value = salvato[k];
    });
  } catch (e) {}
  var canceled = false;
  try { canceled = new URLSearchParams(location.search)
    .get('canceled') === '1'; } catch (e) {}
  if (canceled && torno) {
    torno.hidden = false;
    traccia('pfs_checkout_canceled_return', {});
    var sez = document.getElementById('checkin');
    if (sez && sez.scrollIntoView) setTimeout(function () {
      sez.scrollIntoView({ block: 'start' }); }, 150);
  }
})();
</script>

<footer class="footer">'''

SOST = [
    (H1_A, H1_B), (SOTTO_A, SOTTO_B), (TRUST_A, TRUST_B), (CTA_A, CTA_B),
    (CSS_ANCORA, CSS_NUOVO), (CHECKIN_COMMENT, NUOVE_SEZIONI),
    (PERCHE_A, PERCHE_B), (MAC_A, MAC_B),
    (PREZZO_COMMENT, TOCCA_E_VERIFICA),
    (PZ1_A, PZ1_B), (PZ2_A, PZ2_B),
    (PZ3_A, PZ3_B), (STUB_A, STUB_B), (GAR_A, GAR_B), (FORM_A, FORM_B),
    (FAQ2_A, FAQ2_B), (FAQ4_A, FAQ4_B), (SCRIPT_A, SCRIPT_B),
]

for f in FILES:
    s = open(f, encoding='utf-8').read()
    # griglia6 → inclusi (taglio a coppia di marcatori)
    uno(s, G6_INIZIO, f); uno(s, G6_FINE, f)
    i0 = s.index(G6_INIZIO); i1 = s.index(G6_FINE)
    s = s[:i0] + INCLUSI + s[i1:]
    for a, b in SOST:
        uno(s, a, f)
        s = s.replace(a, b)
    # lo SPOSTAMENTO del check-in: dalla testa (dopo l'hero) a valle
    # (dopo la verifica, prima del prezzo → no: prima della FAQ).
    # Il blocco: dal commento CHECK-IN fino al commento PERCHÉ.
    ck0 = s.index(uno(s, CHECKIN_COMMENT, f) or CHECKIN_COMMENT)
    perche_c = '<!-- ══ PERCHÉ FUNZIONA — verbatim ════════════════════════════════════════ -->'
    uno(s, perche_c, f)
    ck1 = s.index(perche_c)
    blocco_ck = s[ck0:ck1]
    s = s[:ck0] + s[ck1:]
    faq_c = '<!-- ══ FAQ — le stesse quattro del markup FAQPage, ORA VISIBILI ══════════ -->'
    uno(s, faq_c, f)
    s = s.replace(faq_c, blocco_ck + faq_c)
    # ═══ JSON-LD (vive solo nel built): FAQ sincronizzata, promesse
    # di tempo unificate sul contratto, identità legale vera ═══
    if f == 'property-finding.html':
        import json as _j
        faq_ld = _j.dumps({"@context": "https://schema.org",
          "@type": "FAQPage", "mainEntity": [
          {"@type": "Question", "name": "What if you don't find anything?",
           "acceptedAnswer": {"@type": "Answer", "text":
           "The \u20ac350 is fully refundable if we do not deliver a "
           "match. You risk nothing."}},
          {"@type": "Question", "name": "Is the \u20ac350 an extra cost?",
           "acceptedAnswer": {"@type": "Answer", "text":
           "No \u2014 it is deducted from the agency fee when we secure "
           "your apartment, so it effectively disappears. If we don't "
           "deliver, it comes back in full (Terms \u00a74.2)."}},
          {"@type": "Question", "name":
           "Can you really access off-market apartments?",
           "acceptedAnswer": {"@type": "Answer", "text":
           "Yes. After 6+ years in Rome we work directly with landlords "
           "and building administrators, so you see places that never "
           "reach the public portals."}},
          {"@type": "Question", "name":
           "I'm not in Italy yet \u2014 does it still work?",
           "acceptedAnswer": {"@type": "Answer", "text":
           "Yes \u2014 viewings live on video, the contract signed from "
           "your phone, utilities handled. One thing genuinely helps: "
           "being reachable on WhatsApp for quick decisions, because "
           "good flats move in hours, not days."}},
          {"@type": "Question", "name": "How do I know BOOM is legitimate?",
           "acceptedAnswer": {"@type": "Answer", "text":
           "Check, don't trust: Egidi Immobiliare S.r.l. \u2014 P.IVA "
           "17322991005, REA RM-1710623, Via dei Coronari 181, Roma. EU "
           "trademark 019317594, verifiable on EUIPO. 47 Google reviews "
           "you can read. Every payment runs through Stripe with a "
           "receipt \u2014 we never ask for a bank transfer to an "
           "individual."}}]}, ensure_ascii=False)
        import re as _r
        s2, n = _r.subn(
            r'<script type="application/ld\+json">\s*\{"@context":\s*"https://schema\.org",\s*"@type":\s*"FAQPage".*?</script>',
            lambda m: '<script type="application/ld+json">' + faq_ld + '</script>',
            s, count=1, flags=_r.S)
        assert n == 1, 'FAQPage ld non sostituito'
        s = s2
        a = '"description": "BOOM finds, vets and negotiates your Rome apartment \u2014 \u20ac350 flat fee, refundable if no match. 7-day average move-in."'
        if a not in s:
            a = '"description": "BOOM finds, vets and negotiates your Rome apartment — €350 flat fee, refundable if no match. 7-day average move-in."'
        uno(s, a, f)
        s = s.replace(a, '"description": "BOOM finds, vets and negotiates '
          'your Rome apartment — €350 flat fee. By contract: at least 3 '
          'options matching your criteria within 15 days, or a full '
          'refund (Terms §4.2)."')
        a = '"description": "Premium mid-term apartment rentals in Rome with full property management, legal contracts, and 48-hour move-in."'
        uno(s, a, f)
        s = s.replace(a, '"description": "Premium mid-term apartment '
          'rentals in Rome with full property management and legal '
          'contracts."')
        a = '"legalName": "BOOM Rome"'
        uno(s, a, f)
        s = s.replace(a, '"legalName": "Egidi Immobiliare S.r.l.", '
          '"vatID": "IT17322991005"')
    # verifiche finali
    for ago in ('id="conto"', 'id="regola"', 'id="tocca"', 'id="verifica"',
                'id="ckTorno"', 'code=DEMO', 'pass-demo?type=viewing'):
        uno(s, ago, f)
    assert s.count('boom_pfs_brief') == 2, f  # setItem + getItem
    assert 'first month' not in s, f
    assert 'upfront' not in s.lower() or 'Never pay upfront' in s, f
    assert s.index('id="conto"') < s.index('id="regola"') \
        < s.index('id="macchina"') < s.index('id="tocca"') \
        < s.index('id="verifica"') < s.index('id="checkin"') \
        < s.index('id="faq"'), f'ordine sezioni rotto in {f}'
    open(f, 'w', encoding='utf-8').write(s)
    print(f, '→ PFS 4.0,', len(s) // 1024, 'KB')
