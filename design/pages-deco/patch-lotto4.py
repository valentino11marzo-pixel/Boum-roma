#!/usr/bin/env python3
# LOTTO 4 — la ridondanza dei servizi, risolta:
#  - Nell'hero i 4 quadrati anonimi SPARISCONO: al loro posto UNA riga di
#    richiamo che parla la lingua emotiva ("Can't be there? Found one on
#    your own?") e porta al menu vero (#banchina). Il menu si dice una
#    volta sola, nel posto dove serve.
#  - La banchina DIVENTA quel menu: gate numerati (la lingua aeroportuale
#    del brand), la domanda emotiva in Helvetica display da protagonista,
#    e — quello che mancava del tutto — IL NOME del servizio come risposta
#    in oro con la freccia. Prima le tessere chiedevano "Found one
#    yourself?" e mostravano €249 senza mai dire cosa stavi comprando.
#    Prezzi allineati in basso su tutta la fila (flex column + auto).
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

shutil.copy('pt.html', 'pt.html.bak4')
s = leggi('pt.html')

# ═══ 1. L'HERO: via i quadrati, dentro il richiamo ══════════════════════
s = uno(s, """/* le porte-mini: i quattro servizi, sintetici, gia dal primo schermo.
   La fiducia Stripe vive nella banchina, dove si parla di prezzi —
   ogni cosa detta una volta sola. */
.porte-mini { display:flex; align-items:stretch; flex-wrap:wrap; gap:8px;
  margin-top:clamp(16px,2vw,22px); }
.porte-mini .pm-eti { align-self:center; font-size:10px; font-weight:600;
  letter-spacing:.22em; text-transform:uppercase; color:var(--text-4);
  padding-right:3px; }
.porte-mini a { display:flex; flex-direction:column; gap:2px;
  padding:10px 14px; border-radius:12px; background:var(--surface);
  box-shadow:inset 0 0 0 1px var(--line-0);
  transition:box-shadow .3s, transform .3s; }
.porte-mini a:hover { box-shadow:inset 0 0 0 1px var(--line-gold-2);
  transform:translateY(-1px); }
.porte-mini b { font-size:12px; font-weight:500; color:var(--text);
  white-space:nowrap; }
.porte-mini span { font-size:10.5px; color:var(--text-4);
  white-space:nowrap; }
@media (max-width:640px){
  .porte-mini { display:grid; grid-template-columns:1fr 1fr; }
  .porte-mini .pm-eti { grid-column:1/-1; padding:0; }
  .porte-mini b, .porte-mini span { white-space:normal; } }""",
"""/* il richiamo ai servizi: UNA riga che parla la situazione, non il
   prodotto. Il menu vero vive nella banchina — detto una volta sola. */
.porte-eco { display:flex; align-items:center; gap:12px;
  margin-top:clamp(16px,2vw,22px); padding:11px 16px; border-radius:100px;
  background:var(--surface); box-shadow:inset 0 0 0 1px var(--line-0);
  max-width:max-content; transition:box-shadow .3s var(--ease); }
.porte-eco:hover { box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.porte-eco .pe-eti { font-size:10px; font-weight:600; letter-spacing:.22em;
  text-transform:uppercase; color:var(--gold); flex:none; }
.porte-eco .pe-dice { font-size:11.5px; line-height:1.5;
  color:var(--text-4); }
.porte-eco .pe-dice b { color:var(--text-2); font-weight:500;
  white-space:nowrap; }
@media (max-width:640px){
  .porte-eco { border-radius:14px; align-items:flex-start; }
  .porte-eco .pe-eti { margin-top:2px; } }""", 'css richiamo')

s = uno(s, """      <nav class="porte-mini" aria-label="BOOM services">
        <span class="pm-eti">Services</span>
        <a href="/property-finding.html"><b>Property Finding</b>
          <span>€350 · refunded if we fail</span></a>
        <a href="/deal-assistance.html"><b>Deal Assistance</b>
          <span>€249 · we close your deal</span></a>
        <a href="/virtual-viewing.html"><b>Virtual Viewing</b>
          <span>€89 · we walk it live for you</span></a>
        <a href="/concierge.html"><b>Concierge</b>
          <span>move-in, utilities, done</span></a>
      </nav>""",
"""      <a class="porte-eco" href="#banchina">
        <span class="pe-eti">Services</span>
        <span class="pe-dice">Can't be there? Found one on your own? About
          to sign? <b>There's a flat-price door for each →</b></span>
      </a>""", 'richiamo markup')

# ═══ 2. LA BANCHINA: il menu vero ═══════════════════════════════════════
s = uno(s, """.ba-p { position:relative; display:block; background:var(--surface);
  padding:14px 15px 15px; transition:background .3s var(--ease); }""",
""".ba-p { position:relative; display:flex; flex-direction:column;
  background:var(--surface); padding:16px 17px;
  transition:background .3s var(--ease); }
.ba-gate { display:flex; align-items:center; justify-content:space-between;
  gap:10px; }
.ba-gate b { font-size:9.5px; font-weight:600; letter-spacing:.24em;
  text-transform:uppercase; color:var(--text-4);
  transition:color .3s var(--ease); }
.ba-p:hover .ba-gate b { color:var(--gold); }""", 'css ba-p colonna')

s = uno(s, """.ba-p .caso { display:block; margin-top:9px; font-size:13.5px; font-weight:500;
  letter-spacing:.005em; color:var(--text); line-height:1.35; }
.ba-p .fa { display:block; margin-top:3px; font-size:11.5px; line-height:1.45;
  color:var(--text-4); }
.ba-p .costo { display:flex; align-items:baseline; gap:7px; margin-top:9px;
  flex-wrap:wrap; }""",
""".ba-p .caso { display:block; margin-top:12px;
  font-family:var(--display); font-size:17.5px; font-weight:300;
  letter-spacing:-.005em; color:var(--text); line-height:1.28; }
.ba-p .fa { display:block; margin-top:6px; font-size:11.5px; line-height:1.45;
  color:var(--text-4); }
.ba-serv { display:flex; align-items:center; gap:6px; margin-top:11px;
  font-size:10.5px; font-weight:600; letter-spacing:.16em;
  text-transform:uppercase; color:var(--gold); }
.ba-serv i { font-style:normal; transition:transform .35s var(--ease); }
.ba-p:hover .ba-serv i { transform:translateX(4px); }
.ba-p .costo { display:flex; align-items:baseline; gap:7px;
  margin-top:auto; padding-top:10px; flex-wrap:wrap; }""", 'css caso e serv')

s = uno(s, """  .ba-porte { grid-template-columns:1fr 1fr; }
  .ba-p { padding:12px 13px 13px; }
  .ba-p .fa { display:none; }
  .ba-p .caso { margin-top:7px; font-size:12.5px; }
  .ba-p .costo { margin-top:7px; }
  .ba-p .costo b { font-size:16px; } }""",
"""  .ba-porte { grid-template-columns:1fr 1fr; }
  .ba-p { padding:13px 14px; }
  .ba-p .fa { display:none; }
  .ba-p .caso { margin-top:9px; font-size:14.5px; }
  .ba-serv { margin-top:8px; font-size:9.5px; }
  .ba-p .costo { padding-top:8px; }
  .ba-p .costo b { font-size:16px; } }""", 'css mobile porte')

# le quattro porte: gate numerati, la domanda grande, il nome del servizio
s = uno(s, """        <a class="ba-p prima" href="/virtual-viewing.html">
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5"
            y="6.5" width="12" height="11" rx="2"/>
            <path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>
            <circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg>
          <span class="caso">Can't fly over to see it?</span>""",
"""        <a class="ba-p prima" href="/virtual-viewing.html">
          <span class="ba-gate"><b>Gate 01</b>
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5"
            y="6.5" width="12" height="11" rx="2"/>
            <path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>
            <circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg></span>
          <span class="caso">Can't fly over to see it?</span>""", 'gate 01')
s = uno(s, """          <span class="costo"><b>€89</b>""",
"""          <span class="ba-serv">Virtual Viewing<i>→</i></span>
          <span class="costo"><b>€89</b>""", 'serv 01')

s = uno(s, """        <a class="ba-p" href="/property-finding.html">
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6L20.5 20.5"/>
            <path d="M8 10.8h5.6M10.8 8v5.6" class="acc"/></svg>
          <span class="caso">Nothing in the catalogue fits?</span>""",
"""        <a class="ba-p" href="/property-finding.html">
          <span class="ba-gate"><b>Gate 02</b>
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6L20.5 20.5"/>
            <path d="M8 10.8h5.6M10.8 8v5.6" class="acc"/></svg></span>
          <span class="caso">Nothing in the catalogue fits?</span>""", 'gate 02')
s = uno(s, """          <span class="costo"><b>€350</b>""",
"""          <span class="ba-serv">Property Finding<i>→</i></span>
          <span class="costo"><b>€350</b>""", 'serv 02')

s = uno(s, """        <a class="ba-p" href="/deal-assistance.html">
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.4l7.2 2.9v5.1c0 4.2-3 7.2-7.2 8.4-4.2-1.2-7.2-4.2-7.2-8.4V6.3z"/>
            <path d="M9.1 11.6l2.2 2.2 4.1-4.7" class="acc"/></svg>
          <span class="caso">Found one yourself?</span>""",
"""        <a class="ba-p" href="/deal-assistance.html">
          <span class="ba-gate"><b>Gate 03</b>
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.4l7.2 2.9v5.1c0 4.2-3 7.2-7.2 8.4-4.2-1.2-7.2-4.2-7.2-8.4V6.3z"/>
            <path d="M9.1 11.6l2.2 2.2 4.1-4.7" class="acc"/></svg></span>
          <span class="caso">Found one yourself?</span>""", 'gate 03')
s = uno(s, """          <span class="costo"><b>€249</b>""",
"""          <span class="ba-serv">Deal Assistance<i>→</i></span>
          <span class="costo"><b>€249</b>""", 'serv 03')

s = uno(s, """        <a class="ba-p" href="/contract-check-express.html">
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3.2h7.4L18.6 8v12.8H6z"/>
            <path d="M13.2 3.2V8h5.2" class="acc"/>
            <path d="M9 12.6h6.4M9 15.8h4.4" class="acc"/></svg>
          <span class="caso">About to sign something?</span>""",
"""        <a class="ba-p" href="/contract-check-express.html">
          <span class="ba-gate"><b>Gate 04</b>
          <svg class="sg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3.2h7.4L18.6 8v12.8H6z"/>
            <path d="M13.2 3.2V8h5.2" class="acc"/>
            <path d="M9 12.6h6.4M9 15.8h4.4" class="acc"/></svg></span>
          <span class="caso">About to sign something?</span>""", 'gate 04')
s = uno(s, """          <span class="costo"><b>€49</b>""",
"""          <span class="ba-serv">Contract Check Express<i>→</i></span>
          <span class="costo"><b>€49</b>""", 'serv 04')

scrivi('pt.html', s)
print('lotto 4: fatto')
