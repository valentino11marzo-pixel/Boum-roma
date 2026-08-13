#!/usr/bin/env python3
# LOTTO 10 — lo studio del movimento: il movimento e INFORMAZIONE.
# Inventario: tutto cio che e VIVO gia si muove (tabellone, radar, scene
# del come-funziona con barra e pausa su hover, QR del pass, onda dei
# dolori, flap dei prezzi). La regola anti-eccesso: UNA animazione focale
# per schermata; loop solo per le cose vive; one-shot per i momenti
# narrativi. Restavano DUE punti dove il valore vero sta fermo:
#  1. I GATE — al reveal della banchina le etichette Gate 01→04 si
#     accendono in sequenza, come le luci d'imbarco: mezzo secondo,
#     una volta sola, e il "sistema di porte" si percepisce da se.
#  2. IL TENANT PASS — la card non appare: viene EMESSA, come quando
#     Wallet aggiunge un pass (sale, si assesta con la molla, resta
#     inclinata). E' il gesto del prodotto vero, quindi e informazione.
# Entrambi spenti sotto prefers-reduced-motion.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

shutil.copy('pt.html', 'pt.html.bak10')
s = leggi('pt.html')

s = uno(s, """.pass-carta:hover { transform:rotate(0deg) translateY(-4px); }""",
""".pass-carta:hover { transform:rotate(0deg) translateY(-4px); }
/* il pass viene EMESSO, non appare: sale e si assesta con la molla —
   il gesto di Wallet, cioe il prodotto vero */
html.vivo .sale .pass-carta { opacity:0;
  transform:translateY(38px) rotate(-5deg) scale(.97); }
html.vivo .sale.dentro .pass-carta { opacity:1; transform:rotate(-2deg);
  transition:opacity .6s var(--ease) .2s,
    transform .85s cubic-bezier(.3,1.45,.5,1) .2s; }
/* le luci d'imbarco: i Gate si accendono in sequenza al reveal */
@keyframes gate-tick {
  0% { color:var(--text-4); } 35% { color:var(--gold); }
  100% { color:var(--text-4); } }
html.vivo .banchina.dentro .ba-p:nth-child(1) .ba-gate b {
  animation:gate-tick .55s ease .25s both; }
html.vivo .banchina.dentro .ba-p:nth-child(2) .ba-gate b {
  animation:gate-tick .55s ease .43s both; }
html.vivo .banchina.dentro .ba-p:nth-child(3) .ba-gate b {
  animation:gate-tick .55s ease .61s both; }
html.vivo .banchina.dentro .ba-p:nth-child(4) .ba-gate b {
  animation:gate-tick .55s ease .79s both; }
@media (prefers-reduced-motion:reduce){
  html.vivo .sale .pass-carta { opacity:1;
    transform:rotate(-2deg); transition:none; }
  html.vivo .banchina.dentro .ba-gate b { animation:none; } }""",
'movimento informazione')

scrivi('pt.html', s)
print('lotto 10: fatto')
