#!/usr/bin/env python3
# LOTTO 3b — il polish della pagina casa (diciture e numeri senza caos):
#  1. Il contatore foto (1/6) viveva in basso a destra, ESATTAMENTE dove
#     vive il prezzo Solari: su mobile copriva "per month", su desktop
#     si incollava al numero. Sale in alto, accanto al cuore — la fila
#     degli strumenti sta tutta su una riga, il racconto (nome, dove,
#     prezzo) tutto in basso.
#  2. La card "Due on day one" lasciava mezza larghezza vuota su desktop
#     (max-width:560px dentro una card piena): ora e un tabellone a due
#     colonne — il TOTALE grande a sinistra, le tre voci a destra,
#     allineate al centro. Su mobile resta la pila di prima.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

shutil.copy('ld-corpo.html', 'ld-corpo.html.bak3b')
s = leggi('ld-corpo.html')

# 1. il contatore foto sale accanto al cuore
s = uno(s, """.conta-foto { position:absolute; right:14px; bottom:14px; z-index:4;
  font-size:11px; letter-spacing:.08em; color:var(--text-2);
  background:rgba(6,6,7,.7); backdrop-filter:blur(8px);
  border:1px solid var(--line); border-radius:100px; padding:5px 12px;
  font-variant-numeric:tabular-nums; }""",
""".conta-foto { position:absolute; right:64px; top:21px; z-index:4;
  font-size:11px; letter-spacing:.08em; color:var(--text-2);
  background:rgba(6,6,7,.7); backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  border:1px solid var(--line); border-radius:100px; padding:5px 12px;
  font-variant-numeric:tabular-nums; }""", 'conta-foto in alto')

# 2a. la card dei soldi: due colonne su desktop — totale | voci
s = uno(s, """.chiavi-cima { max-width:560px; }""",
""".chiavi-cima { max-width:560px; }
@media (min-width:920px){
  .chiavi-cima { max-width:none; display:grid;
    grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);
    gap:clamp(28px,4.5vw,64px); align-items:center; }
  .chiavi-cima .voci { margin-top:0; } }""", 'chiavi due colonne')

# 2b. il markup: etichetta+totale in un blocco, le voci come colonna sorella
s = uno(s, """      <div class="chiavi-cima">
        <span class="chiavi-eti">Due on day one — all of it, in writing</span>
        <div class="chiavi-flap"><span class="flap-tot" id="totFlap"
          data-p="" aria-live="polite"></span></div>
        <div class="voci">""",
"""      <div class="chiavi-cima">
        <div class="chiavi-numero">
          <span class="chiavi-eti">Due on day one — all of it, in writing</span>
          <div class="chiavi-flap"><span class="flap-tot" id="totFlap"
            data-p="" aria-live="polite"></span></div>
        </div>
        <div class="voci">""", 'chiavi markup')

scrivi('ld-corpo.html', s)
print('lotto 3b: fatto')
