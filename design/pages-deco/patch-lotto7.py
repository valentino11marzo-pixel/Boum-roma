#!/usr/bin/env python3
# LOTTO 7 — lo Skyline della home smette di auto-degradarsi.
#
# L'embed ha TUTTO lo standalone (terreno terrarium, palazzi 3D
# travertino, satellite ibrido, cielo): la differenza era il watchdog
# del lotto 2, scritto contro il nero e diventato troppo nervoso:
#  - degradava a satellite su QUALSIASI 'Failed to fetch' — compreso un
#    singolo tile bloccato da un adblock o una rete mobile ballerina
#    (lo standalone ignora i tile falliti, e infatti "funziona bene");
#  - a 9 secondi secchi passava al satellite anche se lo stile era in
#    piedi e i tile stavano solo finendo di scendere.
# Ora: errore → si degrada SOLO se non riguarda un tile E lo stile non
# e ancora in piedi; timeout → se lo stile c'e si aspetta (3 giri da
# 5s — 'idle' arrivera prima), il satellite scatta solo quando dopo 9s
# non c'e NEANCHE lo stile. Il nero resta impossibile, il degrado
# smette di essere probabile. Stessa cura alla mappa del blocco (detail).
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('pt.html', 'ld-regia.html'):
    shutil.copy(f, f + '.bak7')

# ═══ LA HOME (modulo cielo — la discovery lo eredita dall'estrazione) ═══
s = leggi('pt.html')
s = uno(s, """    mappa.on('error', function (e) {
      /* un tile che manca non e un fallimento; uno stile che manca lo e —
         e il piano B e il satellite, non il buio */
      if (e && e.error && /style|Failed to fetch/i.test(String(e.error.message || '')))
        ripiego();
    });""",
"""    mappa.on('error', function (e) {
      /* un tile che manca NON e un fallimento (l'errore porta e.tile, e
         lo standalone li ignora da sempre): si degrada solo se l'errore
         non riguarda un tile E lo stile non e ancora in piedi */
      if (e && e.error && !e.tile
          && !(mappa.isStyleLoaded && mappa.isStyleLoaded())
          && /style|Failed to fetch/i.test(String(e.error.message || '')))
        ripiego();
    });""", 'errore solo stile')

s = uno(s, """    mappa.on('load', eccola);
    /* 'idle' = primo quadro COMPLETO: se 'load' tarda ma il render
       arriva, il velo si alza comunque — mai il nero su una mappa viva */
    mappa.once('idle', eccola);
    /* e se in 9s non e arrivato niente, si passa al satellite */
    setTimeout(ripiego, 9000);""",
"""    mappa.on('load', eccola);
    /* 'idle' = primo quadro COMPLETO: se 'load' tarda ma il render
       arriva, il velo si alza comunque — mai il nero su una mappa viva */
    mappa.once('idle', eccola);
    /* il cane da guardia ha due orecchie: a 9s, se lo STILE e in piedi
       e i tile stanno solo scendendo, si aspetta ('idle' arrivera) —
       si degrada un quadro MORTO, mai uno vivo e lento */
    function guardia(giri) {
      if (carico || morto || satellite || !mappa) return;
      if (mappa.isStyleLoaded && mappa.isStyleLoaded() && giri < 3)
        return void setTimeout(function () { guardia(giri + 1); }, 5000);
      ripiego();
    }
    setTimeout(function () { guardia(0); }, 9000);""", 'guardia due orecchie')
scrivi('pt.html', s)

# ═══ LA MAPPA DEL BLOCCO (detail) — stessa disciplina ════════════════════
s = leggi('ld-regia.html')
s = uno(s, """      mappaB.on('error', function (e) {
        if (e && e.error
            && /style|Failed to fetch/i.test(String(e.error.message || '')))
          ripiegoB();
      });
      setTimeout(ripiegoB, 9000);""",
"""      mappaB.on('error', function (e) {
        if (e && e.error && !e.tile
            && !(mappaB.isStyleLoaded && mappaB.isStyleLoaded())
            && /style|Failed to fetch/i.test(String(e.error.message || '')))
          ripiegoB();
      });
      function guardiaB(giri) {
        if (carico || spenta || satellite || !mappaB) return;
        if (mappaB.isStyleLoaded && mappaB.isStyleLoaded() && giri < 3)
          return void setTimeout(function () { guardiaB(giri + 1); }, 5000);
        ripiegoB();
      }
      setTimeout(function () { guardiaB(0); }, 9000);""", 'guardia blocco')
scrivi('ld-regia.html', s)

# ═══ I FONT: da bloccanti ad async in modalita sito (tutti i builder) ════
FONT_SYNC = """    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\\n'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" rel="stylesheet">')"""
FONT_ASYNC = """    h = h.replace('FONT_INLINE',
        '<link rel="preconnect" href="https://fonts.googleapis.com">\\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap" media="print" onload="this.media=\\'all\\'">\\n'
        '<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700'
        '&display=swap"></noscript>')"""
for b in ('costruisci-portale.py', 'costruisci-ad.py', 'costruisci-ld.py',
          'costruisci-soldi.py'):
    t = leggi(b)
    if FONT_SYNC in t:
        shutil.copy(b, b + '.bak7')
        scrivi(b, t.replace(FONT_SYNC, FONT_ASYNC))
        print(b, '· font async')
    else:
        print(b, '· pattern font non trovato (controlla)')
print('lotto 7: fatto')
