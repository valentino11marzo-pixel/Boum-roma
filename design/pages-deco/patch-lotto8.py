#!/usr/bin/env python3
# LOTTO 8 — il mobile smette di cambiare forma (audit a 390px, 33 quadri):
#  1. DETAIL · il €300 che spezzava la frase: '.presa-testa b' (la regola
#     del TITOLO: display:block + font display grande) acchiappava anche
#     il <b>€300</b> dentro il paragrafo — "A refundable / €300 / hold
#     reserves" su tre righe. La regola del paragrafo ora lo riporta
#     inline, corpo e font ereditati. (Valeva anche su desktop.)
#  2. DISCOVERY · la stecca filtri troncava i chip a meta bordo senza
#     alcun segnale: sembrava rotta. Ora su mobile il bordo destro sfuma
#     (mask) e l'ultimo chip ha aria per uscirne: si legge "continua a
#     destra", non "tagliato".
#  3. HOME · le garanzie in banchina su mobile erano pillole sfrangiate
#     di larghezze casuali: diventano righe quiete a tutta larghezza col
#     puntino d'oro e filo separatore — una checklist disegnata.
#  4. TUTTE · il footer mobile era UNA colonna infinita (~1500px): le
#     colonne di link vanno a due a due (brand a tutta larghezza, poi
#     Homes|Services e Company|Legal affiancate) — meta altezza.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('pt.html', 'ad-corpo.html', 'ld-corpo.html'):
    shutil.copy(f, f + '.bak8')

# ═══ 1. il €300 torna dentro la frase ═══════════════════════════════════
s = leggi('ld-corpo.html')
s = uno(s, """.presa-testa p b { color:var(--gold); font-weight:600; }""",
""".presa-testa p b { display:inline; font-family:inherit; font-size:inherit;
  line-height:inherit; color:var(--gold); font-weight:600; }""",
'euro300 inline')
scrivi('ld-corpo.html', s)

# ═══ 2. la stecca sfuma invece di troncare ══════════════════════════════
s = leggi('ad-corpo.html')
s = uno(s, """.stecca-int { display:flex; align-items:center; gap:8px; padding:9px 0;
  overflow-x:auto; scrollbar-width:none; }""",
""".stecca-int { display:flex; align-items:center; gap:8px; padding:9px 0;
  overflow-x:auto; scrollbar-width:none; }
@media (max-width:760px){
  /* il taglio netto sembrava un difetto: il bordo sfuma e l'ultimo chip
     ha aria per uscirne — si capisce che la fila continua a destra */
  .stecca-int { padding-right:34px;
    mask-image:linear-gradient(90deg, #000 calc(100% - 30px), transparent);
    -webkit-mask-image:linear-gradient(90deg, #000 calc(100% - 30px),
      transparent); } }""", 'stecca sfuma')
scrivi('ad-corpo.html', s)

# ═══ 3 + 4. garanzie a righe, footer a due colonne ═════════════════════
s = leggi('pt.html')
s = uno(s, """@media (max-width:640px){
  .ba-garanzie { padding:11px 15px; gap:6px; }
  .ba-g { font-size:10px; padding:6px 10px; } }""",
"""@media (max-width:640px){
  /* pillole di larghezze casuali = lista sfrangiata: su mobile le
     garanzie sono righe quiete a tutta larghezza, una checklist */
  .ba-garanzie { display:block; padding:6px 17px 8px; }
  .ba-g { display:flex; width:100%; box-shadow:none; border-radius:0;
    padding:9px 0; font-size:10.5px;
    border-bottom:1px solid var(--line-0); }
  .ba-g:last-child { border-bottom:0; } }""", 'garanzie righe')

s = uno(s, """.piede-int { display:grid; gap:28px; grid-template-columns:1fr; }
@media (min-width:840px){ .piede-int {
  grid-template-columns:1.5fr 1fr 1fr 1.15fr .8fr; } }""",
""".piede-int { display:grid; gap:28px; grid-template-columns:1fr; }
@media (max-width:839px){
  /* una colonna sola era un footer da 1500px: il brand resta a tutta
     larghezza, le colonne di link vanno a due a due */
  .piede-int { grid-template-columns:1fr 1fr; gap:6px 24px; }
  .piede-int > div:first-child { grid-column:1 / -1; margin-bottom:14px; } }
@media (min-width:840px){ .piede-int {
  grid-template-columns:1.5fr 1fr 1fr 1.15fr .8fr; } }""", 'piede due colonne')
scrivi('pt.html', s)
print('lotto 8: fatto')
