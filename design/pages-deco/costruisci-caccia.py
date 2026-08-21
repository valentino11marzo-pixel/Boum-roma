#!/usr/bin/env python3
# VARIANTE A — «LA CACCIA»: la mia tesi più onesta. La pagina attuale
# DESCRIVE il servizio; per spiegare "in cosa consiste" bisogna FARLO
# VEDERE. Qui il centro della pagina è UNA caccia che si svolge giorno
# per giorno sotto gli occhi del lettore: il brief che arriva, il radar
# che si arma, i candidati che muoiono sotto soglia, la casa scartata a
# piedi con il MOTIVO, la shortlist sul telefono, la firma. Ogni giorno
# porta il suo reperto (il finder VERO, la card bocciata, il telefono con
# il mazzo, la zecca del pass) — e l'onestà è dichiarata in testa: "i
# tempi e i pesi sono il nostro sistema di produzione; case e giorni
# variano, la meccanica no". Sostituisce: conto, perché, macchina,
# itinerario, cosa-ottieni, toccabile. Restano: hero(form), regola,
# verifica, imbarco, FAQ.
import sys

F = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/pfs-caccia.html'
s = open(F, encoding='utf-8').read()


def uno(ago):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO: {n} occorrenze di {ago[:70]!r}')
        sys.exit(1)
    return ago


def taglia(commento):
    """rimuove il blocco dal commento alla </section> inclusa; lo rende."""
    global s
    uno(commento)
    i0 = s.index(commento)
    i1 = s.index('</section>', i0) + len('</section>')
    blocco = s[i0:i1]
    s = s[:i0] + s[i1:]
    return blocco


# ── 1 · estrai i reperti che si riusano PRIMA di tagliare ────────────
uno('<div class="finder quadro" id="finder" data-fase="0">')
f0 = s.index('<div class="finder quadro" id="finder" data-fase="0">')
f1 = s.index('production weights — budget 50, bedrooms 30, district 20.</div>')
f1 = s.index('</div>', f1) + len('</div>')
finder_html = s[f0:f1] + '\n    </div>'  # chiude .finder
# il vero confine: il finder chiude con finder-piede </div> + </div>
# ricostruisco con prudenza: dal marcatore all'ultima chiusura nota
finder_html = s[f0:s.index('</div>', f1 - 6) + 6]

uno('<div class="passmint">')
p0 = s.index('<div class="passmint">')
p1 = s.index('</div>', s.index('id="pmVai"')) + len('</div>')
passmint_html = s[p0:p1]

# ── 2 · via le sezioni che la caccia sostituisce ─────────────────────
taglia('<!-- ══ IL CONTO — cercare da solo ha un prezzo, calcolabile ══════════════ -->')
taglia('<!-- ══ PERCHÉ FUNZIONA — verbatim ════════════════════════════════════════ -->')
taglia('<!-- ══ LA MACCHINA — il PFS aperto: la sola sezione nuova ════════════════ -->')
taglia('<!-- ══ COME FUNZIONA — verbatim ══════════════════════════════════════════ -->')
taglia('<!-- ══ COSA OTTIENI — verbatim ═══════════════════════════════════════════ -->')
taglia('<!-- ══ IL PRODOTTO TOCCABILE — cosa ti arriva sul telefono ═══════════════ -->')

# ── 3 · il CSS della caccia ──────────────────────────────────────────
CSS_ANCORA = uno(".imbarco-garanzia::before { content:'✓'; color:var(--gold); }")
CSS = CSS_ANCORA + '''

/* ══ LA CACCIA — il servizio che si spiega accadendo ═════════════════ */
.caccia-onesta { margin-top:10px; font-size:11.5px; color:var(--text-3);
  max-width:66ch; }
.giorni { margin-top:clamp(28px,3.6vw,46px); position:relative;
  display:grid; gap:clamp(18px,2.4vw,28px); max-width:860px; }
.giorni::before { content:''; position:absolute; left:9px; top:8px;
  bottom:8px; width:1px; background:repeating-linear-gradient(180deg,
    rgba(255,215,0,.28) 0 5px, transparent 5px 10px); }
.giorno { position:relative; padding-left:44px; }
.giorno::before { content:''; position:absolute; left:5px; top:5px;
  width:9px; height:9px; border-radius:50%; background:var(--black);
  box-shadow:inset 0 0 0 1.5px var(--gold); }
.giorno.morte::before { box-shadow:inset 0 0 0 1.5px var(--rosso,#FF6B4A); }
.giorno .g-eti { font-family:ui-monospace,Menlo,monospace; font-size:10px;
  font-weight:600; letter-spacing:.22em; text-transform:uppercase;
  color:var(--gold); }
.giorno.morte .g-eti { color:var(--rosso,#FF6B4A); }
.giorno h3 { margin-top:6px; font-family:var(--display); font-weight:300;
  font-size:clamp(17px,2vw,21px); letter-spacing:-.01em; }
.giorno p { margin-top:6px; font-size:13.5px; line-height:1.65;
  color:var(--text-2); max-width:60ch; }
.giorno p b { color:var(--text); font-weight:600; }
/* i reperti */
.reperto { margin-top:14px; }
.rep-brief { display:flex; flex-wrap:wrap; gap:8px; }
.rep-brief span { padding:8px 13px; font-size:12.5px; color:var(--text-2);
  box-shadow:inset 0 0 0 1px var(--line-gold); border-radius:100px; }
.rep-radar { display:flex; align-items:center; gap:10px;
  font-family:ui-monospace,Menlo,monospace; font-size:12px;
  color:var(--text-2); padding:12px 16px; background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line-0); max-width:520px; }
.rep-radar i { font-style:normal; width:7px; height:7px; flex:none;
  border-radius:50%; background:var(--green);
  animation:repPulsa 2.6s ease-in-out infinite; }
@keyframes repPulsa { 50% { opacity:.25; } }
@media (prefers-reduced-motion:reduce){ .rep-radar i { animation:none; } }
.rep-morta { position:relative; max-width:440px; padding:16px 18px;
  background:var(--card); box-shadow:inset 0 0 0 1px var(--line-0);
  filter:saturate(.4); }
.rep-morta .rm-nome { font-family:var(--display); font-size:15.5px;
  font-weight:500; color:var(--text-3); }
.rep-morta .rm-dati { margin-top:3px; font-size:12px; color:var(--text-3); }
.rep-morta .rm-timbro { position:absolute; right:14px; top:50%;
  transform:translateY(-50%) rotate(-7deg); padding:6px 12px;
  font-size:9.5px; font-weight:800; letter-spacing:.16em;
  text-transform:uppercase; color:var(--rosso,#FF6B4A);
  box-shadow:inset 0 0 0 1.5px var(--rosso,#FF6B4A); }
.rep-fonolo { margin-top:8px; font-size:11.5px; color:var(--text-3);
  max-width:52ch; }
.rep-telefono { width:min(320px,100%); padding:18px 16px 16px;
  background:linear-gradient(175deg,#141416,#0B0B0D);
  border-radius:22px; box-shadow:inset 0 0 0 1px var(--line),
    0 24px 50px -30px rgba(0,0,0,.9); }
.rep-telefono .rt-tacca { width:64px; height:4px; margin:0 auto 14px;
  border-radius:100px; background:rgba(255,255,255,.12); }
.rep-casa { display:grid; grid-template-columns:minmax(0,1fr) auto;
  gap:2px 10px; padding:11px 13px; background:rgba(255,255,255,.03);
  border-radius:10px; box-shadow:inset 0 0 0 1px var(--line-0); }
.rep-casa + .rep-casa { margin-top:8px; }
.rep-casa b { font-size:13px; font-weight:600; }
.rep-casa span { grid-column:1; font-size:11px; color:var(--text-3); }
.rep-casa .rc-punti { grid-row:1 / span 2; align-self:center;
  font-family:var(--display); font-size:19px; font-weight:400;
  color:var(--gold); font-variant-numeric:tabular-nums; }
.rep-live { display:inline-flex; align-items:center; gap:8px;
  padding:8px 14px; font-size:11px; font-weight:700; letter-spacing:.14em;
  text-transform:uppercase; color:var(--green);
  box-shadow:inset 0 0 0 1px rgba(0,255,136,.35); border-radius:100px; }
.rep-live i { font-style:normal; width:6px; height:6px; border-radius:50%;
  background:var(--green); }
.g-vai { display:inline-flex; margin-top:10px; font-size:12px;
  font-weight:600; color:var(--gold); text-decoration:none;
  border-bottom:1px solid rgba(255,215,0,.35); padding-bottom:1px; }
/* la banda finale: il contratto che chiude la caccia */
.caccia-fine { margin-top:clamp(26px,3.4vw,40px); display:flex;
  align-items:center; gap:16px 24px; flex-wrap:wrap;
  padding:clamp(20px,2.6vw,30px); background:var(--black);
  box-shadow:inset 0 0 0 1px var(--line-gold); max-width:860px; }
.caccia-fine p { flex:1 1 300px; font-size:14px; line-height:1.6;
  color:var(--text-2); }
.caccia-fine p b { color:var(--gold); font-weight:600; }'''
s = s.replace(CSS_ANCORA, CSS)

# ── 4 · la sezione, al posto del vecchio blocco (prima della regola) ─
REGOLA = uno("<!-- ══ LA REGOLA — l'obiezione detta da noi, prima che la pensi ══════════ -->")
CACCIA = '''<!-- ══ LA CACCIA — il servizio che si spiega accadendo ═══════════════════ -->
<section class="section section-dark" id="caccia">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>What the €350 actually buys</span>
      <h2 class="titolo">Watch one hunt<br><span class="hl">unfold</span>.</h2>
      <p class="sotto">Searching alone from abroad costs three weeks of
        temporary rent and the visits you can't attend. This is what
        happens instead — day by day.</p>
      <p class="caccia-onesta">A representative hunt: the schedules,
        weights and steps are our production system. Homes and days vary
        — the mechanics don't.</p>
    </div>

    <div class="giorni">
      <article class="giorno sale">
        <span class="g-eti">Day 0 · 09:12</span>
        <h3>Your brief lands. A person calls.</h3>
        <p>Five lines from the form become the hunt's contract. Valentino
          calls you — <b>15 minutes, once</b> — so the machine and the
          human work from the same brief. Nothing to repeat later.</p>
        <div class="reperto rep-brief" aria-hidden="true">
          <span>Trastevere · Monteverde</span><span>€1.400–1.800</span>
          <span>2 bed</span><span>furnished</span><span>Oct 1</span>
        </div>
      </article>

      <article class="giorno sale">
        <span class="g-eti">Day 0 · 09:40</span>
        <h3>The radar arms — and never sleeps.</h3>
        <p>Your criteria become a live search: the public market is read
          <b>every 15 minutes, day and night — 96 scans a day</b> — and
          the off-market calls start with landlords we already know.</p>
        <div class="reperto rep-radar" role="img"
          aria-label="radar attivo, scansione ogni 15 minuti">
          <i></i>*/15 · inbox scan · 96/day — production schedule</div>
      </article>

      <article class="giorno sale">
        <span class="g-eti">Day 1</span>
        <h3>Fourteen candidates. Eleven die.</h3>
        <p>Everything found is scored against your brief — budget 50,
          bedrooms 30, district 20. <b>Below sixty, you never see it.</b>
          Fewer and relevant beats many and useless: that's the product.
          Tap the brief below and watch the scoring work:</p>
        <div class="reperto">
''' + finder_html + '''
        </div>
      </article>

      <article class="giorno morte sale">
        <span class="g-eti">Day 2 · on foot</span>
        <h3>One dies in person.</h3>
        <p>Two survivors get walked. One doesn't come back:</p>
        <div class="reperto rep-morta">
          <div class="rm-nome">2-bed · Monteverde</div>
          <div class="rm-dati">€1.650 · 3rd floor · looked perfect online</div>
          <span class="rm-timbro">Rejected — damp behind the wardrobe</span>
        </div>
        <p class="rep-fonolo">The camera would never have told you. This
          is why every shortlisted home is walked before you see it.</p>
      </article>

      <article class="giorno sale">
        <span class="g-eti">Day 3</span>
        <h3>The shortlist lands on your phone.</h3>
        <p>Cards with the score and the <b>why</b> — you swipe from
          wherever you are. This deck is a real app, not a mockup:</p>
        <div class="reperto rep-telefono" aria-hidden="true">
          <div class="rt-tacca"></div>
          <div class="rep-casa"><b>Trastevere · top floor</b>
            <span>€1.750 · 2 bed · terrace</span>
            <span class="rc-punti">87</span></div>
          <div class="rep-casa"><b>Monteverde · renovated</b>
            <span>€1.580 · 2 bed · balcony</span>
            <span class="rc-punti">82</span></div>
          <div class="rep-casa"><b>Portuense · quiet court</b>
            <span>€1.490 · 2 bed</span>
            <span class="rc-punti">78</span></div>
        </div>
        <a class="g-vai" href="/client-portal.html?code=DEMO">Open the real
          client app · code DEMO →</a>
      </article>

      <article class="giorno sale">
        <span class="g-eti">Day 5 · 18:00 Rome</span>
        <h3>You visit from wherever you are.</h3>
        <p>Live video on the one you liked — every question asked out
          loud, meter readings included. The confirmed visit lands in
          your <b>Apple Wallet as a boarding pass</b>. Mint yours now:</p>
        <span class="reperto rep-live"><i></i>Live video viewing</span>
        <div class="reperto">
''' + passmint_html + '''
        </div>
      </article>

      <article class="giorno sale">
        <span class="g-eti">Day 7</span>
        <h3>We negotiate. In Italian. With data.</h3>
        <p>Rent, deposit, clauses — argued with market numbers, not
          hope. You approve every term before anything is signed. No
          promises on outcomes: <b>the negotiation is ours, the decision
          is yours.</b></p>
      </article>

      <article class="giorno sale">
        <span class="g-eti">Day ~12</span>
        <h3>A registered contract, signed from your phone.</h3>
        <p>Digital signature, registered lease, utilities queued, keys
          choreographed. The €350? <b>Deducted from the agency fee.</b>
          It was never an extra.</p>
        <a class="g-vai" href="/try.html">Feel this exact step — 90
          seconds, in your browser →</a>
      </article>
    </div>

    <div class="caccia-fine sale">
      <p>And if Day 15 arrives without <b>3 options in your criteria</b> —
        the €350 returns to your card. Not a promise: <b>Terms §4.2</b>.</p>
      <a class="btn btn-primary" href="#checkin">Board the hunt ↑</a>
    </div>
  </div>
</section>

''' + REGOLA
s = s.replace(REGOLA, CACCIA)

# ── 5 · il filo: le tappe della caccia ───────────────────────────────
a = uno("var TAPPE = ['conto', 'regola', 'macchina', 'tocca', 'verifica',\n    'imbarco', 'faq'];")
s = s.replace(a, "var TAPPE = ['caccia', 'regola', 'verifica', "
                 "'imbarco', 'faq'];")

# ── 6 · titolo pagina della variante (per il lab) ────────────────────
a = uno('<title>')
i = s.index(a) + len(a)
j = s.index('</title>')
s = s[:i] + 'La Caccia — Property Finding, variante A' + s[j:]

# ── verifiche ────────────────────────────────────────────────────────
for ago in ('id="caccia"', 'id="finder"', 'id="pmVai"', 'id="ckForm"',
            'id="regola"', 'id="verifica"', 'id="imbarco"', 'id="faq"'):
    uno(ago)
assert s.index('id="checkin"') < s.index('id="caccia"') \
    < s.index('id="regola"'), 'ordine rotto'
assert 'id="conto"' not in s and 'id="tocca"' not in s \
    and 'id="macchina"' not in s, 'sezioni vecchie ancora presenti'
open(F, 'w', encoding='utf-8').write(s)
print('LA CACCIA costruita,', len(s) // 1024, 'KB')
