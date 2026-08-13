#!/usr/bin/env python3
# LOTTO 6 — il badge Services dell'hero, da testo muto a PORTA:
#  - il puntino verde che pulsa (la stessa lingua degli altri eyebrow:
#    e un segnale vivo, non un'etichetta);
#  - velo dorato sulla pillola + anello gold sottile: si capisce che e
#    cliccabile prima di toccarla;
#  - l'azione ("A flat-price door for each") diventa ORO, e la freccia
#    vive in un cerchietto che scivola al passaggio — l'affordance che
#    mancava del tutto;
#  - le domande salgono di un gradino di contrasto (text-4 → text-3).
# E il micro-difetto dei gate su mobile: la freccia di CONTRACT CHECK
# EXPRESS restava orfana a destra quando il nome andava a capo — ora la
# freccia e inline e segue l'ultima parola, sempre.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

shutil.copy('pt.html', 'pt.html.bak6')
s = leggi('pt.html')

# ── il richiamo, ridisegnato ─────────────────────────────────────────────
s = uno(s, """/* il richiamo ai servizi: UNA riga che parla la situazione, non il
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
  .porte-eco .pe-eti { margin-top:2px; } }""",
"""/* il richiamo ai servizi: UNA riga che parla la situazione, non il
   prodotto — ma da PORTA, non da didascalia: puntino vivo, velo d'oro,
   l'azione in oro e la freccia nel cerchietto che scivola. */
.porte-eco { display:flex; align-items:center; gap:13px;
  margin-top:clamp(16px,2vw,22px); padding:11px 12px 11px 18px;
  border-radius:100px;
  background:linear-gradient(115deg, rgba(255,215,0,.07),
    rgba(255,215,0,.015) 52%), var(--surface);
  box-shadow:inset 0 0 0 1px var(--line-gold-2);
  max-width:max-content;
  transition:box-shadow .3s var(--ease), transform .3s var(--ease); }
.porte-eco:hover { box-shadow:inset 0 0 0 1px var(--line-gold);
  transform:translateY(-1px); }
.porte-eco .pe-eti { display:inline-flex; align-items:center; gap:8px;
  font-size:10px; font-weight:600; letter-spacing:.22em;
  text-transform:uppercase; color:var(--gold); flex:none; }
.porte-eco .pe-eti b { width:5px; height:5px; border-radius:50%;
  background:var(--green); animation:pulse 2.2s ease infinite; }
.porte-eco .pe-dice { font-size:11.5px; line-height:1.5;
  color:var(--text-3); }
.porte-eco .pe-dice b { color:var(--gold); font-weight:600;
  white-space:nowrap; }
.pe-vai { flex:none; width:27px; height:27px; display:grid;
  place-items:center; border-radius:50%; background:rgba(255,215,0,.1);
  color:var(--gold); font-size:13px;
  transition:transform .35s var(--ease), background .3s var(--ease); }
.porte-eco:hover .pe-vai { transform:translateX(3px);
  background:rgba(255,215,0,.17); }
@media (max-width:640px){
  .porte-eco { border-radius:16px; align-items:flex-start;
    padding:12px 12px 12px 15px; }
  .porte-eco .pe-eti { margin-top:2px; }
  .pe-vai { align-self:center; } }
@media (prefers-reduced-motion:reduce){
  .porte-eco .pe-eti b { animation:none; } }""", 'css richiamo vivo')

s = uno(s, """      <a class="porte-eco" href="#banchina">
        <span class="pe-eti">Services</span>
        <span class="pe-dice">Can't be there? Found one on your own? About
          to sign? <b>There's a flat-price door for each →</b></span>
      </a>""",
"""      <a class="porte-eco" href="#banchina">
        <span class="pe-eti"><b></b>Services</span>
        <span class="pe-dice">Can't be there? Found one on your own? About
          to sign? <b>A flat-price door for each</b></span>
        <span class="pe-vai" aria-hidden="true">→</span>
      </a>""", 'richiamo markup vivo')

# ── i gate: la freccia segue l'ultima parola, mai orfana ────────────────
s = uno(s, """.ba-serv { display:flex; align-items:center; gap:6px; margin-top:11px;
  font-size:10.5px; font-weight:600; letter-spacing:.16em;
  text-transform:uppercase; color:var(--gold); }
.ba-serv i { font-style:normal; transition:transform .35s var(--ease); }""",
""".ba-serv { display:block; margin-top:11px;
  font-size:10.5px; font-weight:600; letter-spacing:.16em;
  text-transform:uppercase; color:var(--gold); line-height:1.5; }
.ba-serv i { display:inline-block; margin-left:6px; font-style:normal;
  transition:transform .35s var(--ease); }""", 'freccia inline')

scrivi('pt.html', s)
print('lotto 6: fatto')
