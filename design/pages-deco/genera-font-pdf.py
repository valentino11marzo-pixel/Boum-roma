#!/usr/bin/env python3
# IL CARATTERE DEI DOCUMENTI D'ORDINE — genera api/_pdffont-data.js.
#
# Perché esiste (v1.8, rilievo F4): il PDF dell'ordine di Parigi e Berlino
# (il mandato di ricerca, il documento che il cliente tiene e di cui l'ordine
# conserva lo SHA-256) stampava il corpo con la Helvetica dei PDF, che conosce
# solo WinAnsi: wa() toglieva ogni altra lettera, e «Ayşe Yılmaz» usciva
# «Aye Ylmaz», «Łukasz Wiśniewski» «ukasz Winiewski», un nome cirillico
# spariva del tutto. Qui nasce un carattere che le lettere le ha.
#
# Cosa fa: prende Liberation Sans 2.1 (metrica di Arial, quindi della
# Helvetica: righe e a capo restano quelli di prima), ne tiene i blocchi in
# cui si scrive un nome — latino con tutte le estensioni (turco, polacco,
# ceco, croato, rumeno, azero, vietnamita…), greco, cirillico — più la
# punteggiatura e le valute, toglie hinting e tabelle di layout (il corpo si
# stampa una lettera = un glifo, come la Helvetica di pdf-lib), e lo RINOMINA
# «BOOM Doc Sans»: è una versione modificata, e la SIL OFL 1.1 non lascia a
# una versione modificata i Reserved Font Name «Liberation» e «Arimo».
# Copyright e licenza restano nel font (name ID 0, 13, 14) e nell'intestazione
# del modulo generato.
#
# L'ebraico (che Liberation ha) resta FUORI apposta: pdf-lib non riordina il
# testo da destra a sinistra, e un nome stampato al contrario è peggio di un
# nome segnalato come non stampabile (api/_pdffont.js lo sostituisce con «?»
# e l'ordine alza l'allarme all'operatore).
#
# Le metriche (cmap a tratti, larghezze, ascendente…) le calcola fontTools
# QUI, una volta, in millesimi di em arrotondati: a runtime nessuno legge le
# tabelle del font (api/_pdffont.js le passa a pdf-lib con l'interfaccia di
# fontkit) e nessuna dipendenza npm si aggiunge.
#
# Uso:  pip install fonttools
#       python3 design/pages-deco/genera-font-pdf.py [LiberationSans-Regular.ttf]
# (di default il file del pacchetto Debian fonts-liberation2). Lo stesso font
# e la stessa versione di fontTools danno gli stessi byte.

import base64, hashlib, io, json, os, sys

from fontTools import subset
from fontTools.ttLib import TTFont

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(os.path.dirname(QUI))
SORGENTE = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
USCITA = os.path.join(RADICE, 'api', '_pdffont-data.js')

NOME = 'BOOM Doc Sans'
PS = 'BOOMDocSans-Regular'

# i blocchi in cui si scrive un nome (più ciò che i termini già stampano)
BLOCCHI = [
    (0x0020, 0x007E),  # latino di base
    (0x00A0, 0x00FF),  # latino-1
    (0x0100, 0x017F),  # latino esteso A (ş ı ł ś ć đ ő ř č ž …)
    (0x0180, 0x024F),  # latino esteso B (ǎ ș ț Ə …)
    (0x0259, 0x0259),  # ə (azero)
    (0x02B0, 0x02FF),  # lettere modificatrici (ʻ ʼ ˆ ˜ …)
    (0x0300, 0x036F),  # segni diacritici combinanti
    (0x0370, 0x03FF),  # greco
    (0x0400, 0x052F),  # cirillico + supplemento
    (0x1E00, 0x1EFF),  # latino esteso aggiuntivo (vietnamita, gallese …)
    (0x2000, 0x206F),  # punteggiatura generale (– — ‘ ’ “ ” … ‹ ›)
    (0x20A0, 0x20CF),  # valute (€ ₴ ₪ …: quelle che Liberation ha)
    (0x2100, 0x214F),  # simboli letterali (№ ™ …)
]

# il copyright e la licenza di Liberation, parola per parola (SIL OFL 1.1 §2:
# ogni copia porta l'avviso e la licenza): finiscono nell'intestazione del
# modulo generato, cioè dentro ogni funzione che lo spedisce
LICENZA = os.path.join(QUI, 'fonts', 'OFL-Liberation.txt')
NOTA = ('BOOM Doc Sans is a Modified Version of Liberation Sans (a subset, renamed): it does not use the',
        'Reserved Font Names, and it is distributed under the same licence, reproduced here.')


def main():
    opts = subset.Options()
    opts.unicodes = [cp for a, b in BLOCCHI for cp in range(a, b + 1)]
    opts.hinting = False
    opts.layout_features = []
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.drop_tables += ['FFTM', 'kern', 'gasp', 'DSIG', 'GDEF', 'GPOS', 'GSUB']
    opts.glyph_names = False
    font = TTFont(SORGENTE, recalcTimestamp=False)  # head.modified resta quello del font: stessi byte a ogni giro
    sorgente = font['name'].getDebugName(5)
    s = subset.Subsetter(options=opts)
    s.populate(unicodes=opts.unicodes)
    s.subset(font)

    # il nuovo nome (SIL OFL 1.1 §3): via ogni record del nome, poi quelli nuovi
    name = font['name']
    via = {1, 2, 3, 4, 5, 6, 10, 16, 17, 18, 21, 22}
    name.names = [r for r in name.names if r.nameID not in via]
    nuovi = {
        1: NOME, 2: 'Regular', 3: f'{NOME} Regular; subset of Liberation Sans {sorgente}',
        4: f'{NOME} Regular', 5: f'{sorgente}; BOOM subset 1', 6: PS,
        10: f'{NOME}: a subset of Liberation Sans ({sorgente}), renamed as the SIL Open Font License 1.1 '
            'requires of a Modified Version, embedded in the BOOM order documents.',
    }
    for i, v in nuovi.items():
        name.setName(v, i, 3, 1, 0x409)
        name.setName(v, i, 1, 0, 0)

    buf = io.BytesIO()
    font.save(buf)
    ttf = buf.getvalue()
    font = TTFont(io.BytesIO(ttf))

    upm = font['head'].unitsPerEm
    k = 1000.0 / upm
    r = lambda v: int(round(v * k))
    order = font.getGlyphOrder()
    widths = [r(font['hmtx'][g][0]) for g in order]
    cmap = font.getBestCmap()
    gid = {g: i for i, g in enumerate(order)}
    tratti = []
    for cp in sorted(cmap):
        g = gid[cmap[cp]]
        if tratti and cp == tratti[-1][1] + 1 and g == tratti[-1][2] + (cp - tratti[-1][0]):
            tratti[-1][1] = cp
        else:
            tratti.append([cp, cp, g])
    # un glifo, un carattere: la ToUnicode che pdf-lib scrive deve ridare il testo
    usati = [cmap[cp] for cp in cmap]
    if len(set(usati)) != len(usati):
        sys.exit('due caratteri condividono un glifo: la ToUnicode non saprebbe quale ridare')
    head, hhea, os2, post = font['head'], font['hhea'], font['OS/2'], font['post']
    dati = {
        'name': PS,
        'unitsPerEm': 1000,
        'ascent': r(hhea.ascent), 'descent': r(hhea.descent),
        'capHeight': r(getattr(os2, 'sCapHeight', 0) or hhea.ascent),
        'xHeight': r(getattr(os2, 'sxHeight', 0) or 0),
        'italicAngle': post.italicAngle,
        'bbox': [r(head.xMin), r(head.yMin), r(head.xMax), r(head.yMax)],
        'fixedPitch': bool(post.isFixedPitch),
        'familyClass': os2.sFamilyClass,
        'italic': bool(head.macStyle & 2),
        'glyphs': len(order),
        'chars': len(cmap),
        'cmap': tratti,
        'widths': widths,
        'sha256': hashlib.sha256(ttf).hexdigest(),
        'ttf': base64.b64encode(ttf).decode('ascii'),
    }

    with open(LICENZA, encoding='utf-8') as f:
        testo = list(NOTA) + [''] + f.read().rstrip('\n').split('\n')
    righe = '\n'.join('// ' + x if x else '//' for x in testo)
    corpo = json.dumps(dati, ensure_ascii=True, separators=(',', ':'))
    with open(USCITA, 'w', encoding='utf-8') as f:
        f.write(
            '// api/_pdffont-data.js — GENERATED by design/pages-deco/genera-font-pdf.py: never edit by hand.\n'
            '// The font of the order documents (api/_pdffont.js): BOOM Doc Sans, a subset of\n'
            f'// Liberation Sans ({sorgente}) — {len(cmap)} characters, {len(order)} glyphs, TrueType,\n'
            '// metrics in thousandths of an em (rounded), cmap as runs [first, last, first glyph].\n'
            '//\n' + righe + '\n'
            f'export const FONT = Object.freeze({corpo});\n')
    print(f'{USCITA}: {len(ttf)} B di font, {len(cmap)} caratteri, {len(order)} glifi, {len(tratti)} tratti di cmap')


if __name__ == '__main__':
    main()
