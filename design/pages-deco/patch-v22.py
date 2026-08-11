#!/usr/bin/env python3
# v22 — le correzioni che l'audit ha MISURATO, non intuito.
#   1 · contrasto: --text-4 (2.44:1) portava testo, incluse le etichette dei
#       campi e la riga del marchio registrato. Nasce --text-eti a 4.77:1;
#       --text-4 resta com'e, ma solo per la decorazione (frecce, punti).
#   2 · bersagli: cuore 36→40, frecce del calendario 30→40, i link di coda
#       da 18px di altezza a 40 di area toccabile, chip mappa 34→38.
#   3 · immagini: le tre foto dell'apparecchio senza alt e senza lazy,
#       e nessuna con proporzione dichiarata (salto di layout).
import re
f = 'pt.html'
s = open(f, encoding='utf-8').read()
def uno(a, b, nome):
    global s
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: ' + nome + ' (%d)' % s.count(a)
    s = s.replace(a, b)

# ── 1 · il contrasto ────────────────────────────────────────────────────
uno('  --text-4:      rgba(250,250,250,.3);',
    '  --text-4:      rgba(250,250,250,.3);   /* SOLO decorazione: frecce, punti,\n'
    '                                            separatori. Su nero e 2.44:1. */\n'
    '  --text-eti:    rgba(250,250,250,.48);  /* ogni etichetta che si legge:\n'
    '                                            4.77:1, sopra la soglia AA. */',
    'token contrasto')

# tutto cio che PORTA TESTO passa a --text-eti; la decorazione resta
ETICHETTE = [
  # etichette dei campi del check-in
  ('.atterro-eti { font-size:8.5px; font-weight:600;', 'atterro-eti'),
  ('.imbarco-v span {', 'imbarco span'),
]
# sostituzione mirata: le classi che l'audit ha trovato sotto soglia
MIRATE = [
  'atterro-eti', 'cielo-t', 'eti', 'piede-legale', 'pk-zona', 'sc-eti',
  'tc-p', 'hero-stat-label', 'passo-n', 'porta-eti', 'fond-eti',
]
conta = 0
for cl in MIRATE:
    # dentro il blocco della classe, color:var(--text-4) → var(--text-eti)
    for m in list(re.finditer(r'(\.' + re.escape(cl) + r'\b[^{]*\{[^}]*?)color:var\(--text-4\)',
                              s, re.S)):
        s = s[:m.start()] + m.group(1) + 'color:var(--text-eti)' + s[m.end():]
        conta += 1

# il footer legale e le etichette dei moduli: cercali per testo, non per classe
for cl in ['.piede-legale', '.piede-basso', '.campo-eti', '.form-eti']:
    s = re.sub(r'(' + re.escape(cl) + r'\b[^{]*\{[^}]*?)color:var\(--text-4\)',
               r'\1color:var(--text-eti)', s, flags=re.S)

# ── 2 · i bersagli ──────────────────────────────────────────────────────
uno('.home-cuore { position:absolute; right:8px; top:8px; z-index:3; width:36px;',
    '.home-cuore { position:absolute; right:6px; top:6px; z-index:3; width:40px;',
    'cuore larghezza')
s = re.sub(r'(\.home-cuore \{[^}]*?)height:36px', r'\1height:40px', s, flags=re.S)

CSS = r'''
/* ── bersagli: nessun comando sotto il polpastrello (44×44 su touch) ──── */
#calPrec, #calSucc { min-width:40px; min-height:40px; display:inline-flex;
  align-items:center; justify-content:center; }
/* i link di coda erano alti 18px: il testo resta, l'area cresce */
.settimana-testa .btn-vai, .vai-testa { padding:11px 2px; margin:-11px 0; }
.cielo-c { min-height:38px; }
@media (pointer:coarse){
  .settimana-testa .btn-vai, .vai-testa { padding:13px 4px; margin:-13px -4px; }
  .cielo-c { min-height:40px; } }

/* ── immagini: proporzione dichiarata = nessun salto mentre caricano ──── */
.s1-casa img, .home-foto img { aspect-ratio:4/3; }
.fond-foto img { aspect-ratio:4/5; }
'''
i = s.index('</style>')
s = s[:i] + CSS + '\n' + s[i:]

# ── 3 · le tre foto senza alt e senza lazy ──────────────────────────────
prima = s.count('loading="lazy"')
s = re.sub(r'<img(?![^>]*\balt=)(?![^>]*aria-hidden)', '<img alt=""', s)
s = re.sub(r'<img(?![^>]*loading=)', '<img loading="lazy" decoding="async"', s)
open(f, 'w', encoding='utf-8').write(s)
print('v22 · contrasto: %d regole a --text-eti' % conta)
print('v22 · lazy: %d → %d' % (prima, s.count('loading="lazy"')))
