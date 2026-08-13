#!/usr/bin/env python3
# LOTTO 9 — la passata di voce: fatti, non aggettivi.
# Il criterio: ogni riga deve abbassare la paura di chi affitta a
# distanza con un FATTO verificabile, mai con un aggettivo. L'inventario
# delle sezioni dice che il sito parla gia quasi ovunque per fatti
# (Move in this week · walked in person · il radar · la banchina): i
# tre punti che parlavano "da agenzia" erano nell'hero e sul Landing
# Pass. Ogni frase nuova e verificata sul retrobottega vero:
# contratto registrato AdE + magic sign ✓, Stripe con ricevuta ✓,
# la persona con nome che risponde ✓ (gia dichiarata in banchina).
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

shutil.copy('pt.html', 'pt.html.bak9')
s = leggi('pt.html')

# 1. il badge: "premium" e la parola di tutti — meglio dire per CHI
s = uno(s, '<div class="hero-eyebrow"><b></b>Premium Rentals in Rome</div>',
    '<div class="hero-eyebrow"><b></b>Rome rentals for internationals</div>',
    'eyebrow hero')

# 2. il sotto-hero: tre aggettivi diventano tre fatti
s = uno(s, '<p class="hero-sub">Video-verified. Transparent pricing. Real support.</p>',
    '<p class="hero-sub">A registered contract you sign from your phone. '
    'Every euro through Stripe, receipted. A named person who answers.</p>',
    'sotto hero')

# 3. il Landing Pass smette di essere una metafora carina: e il pezzo
#    che nessun competitor puo copiare senza costruire la macchina
s = uno(s, """      <p class="sotto">Every BOOM tenant gets a digital pass and a home in the
        BOOM app — because the service doesn't end at the keys.</p>""",
"""      <p class="sotto">Most agencies disappear at the keys. That's where
        we clock in: your pass, your rent, your receipts and a named person
        — in your pocket for the whole stay.</p>""", 'landing pass')

scrivi('pt.html', s)
print('lotto 9: fatto')
