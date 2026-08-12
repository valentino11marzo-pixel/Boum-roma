#!/usr/bin/env python3
# AUDIT → CORREZIONI, parte 2: la pagina casa.
import re, json
from datetime import datetime, timezone
def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

# ═══ COSTRUISCI-LD.PY ═══════════════════════════════════════════════════
s = leggi('costruisci-ld.py')

# [30][1] lo stato con gli stessi nomi della discovery + la data futura
s = uno(s, """def stato(s):
    if s == 'available': return ('Available now', True)
    if s in ('reserved', 'waitlist'): return ('Reserved', False)
    return ('Rented', False)""",
"""def stato(s, dal=None):
    if s == 'available':
        # se l'ingresso e nel futuro, il badge dice la data — mai
        # «Available now» per una casa libera nel 2027
        oggi = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        if dal and dal > oggi:
            d = datetime.fromisoformat(dal)
            eti = 'From ' + str(int(d.strftime('%d'))) + d.strftime(' %b')
            if d.year != datetime.now(timezone.utc).year:
                eti += d.strftime(' %Y')
            return (eti, True)
        return ('Available now', True)
    if s == 'waitlist': return ('Waitlist open', False)
    if s == 'reserved': return ('Reserved', False)
    return ('Rented', False)""", 'stato ld')

# la chiamata deve passare la data
m = re.search(r"st = stato\(([^)]*)\)", s)
assert m, 'chiamata stato'
s = s.replace(m.group(0), "st = stato(%s, libera(r.get('availableDate')))" % m.group(1), 1)

# [6][38] le dotazioni si normalizzano col dizionario condiviso
s = uno(s, "    dentro = [bella_dote(x) for x in (r.get('features') or r.get('tags') or []) if x]",
"""    TRADUCI = {'balcone': 'Balcony', 'aria condizionata': 'A/C',
               'lavatrice': 'Washer', 'lavastoviglie': 'Dishwasher',
               'ascensore': 'Elevator', 'arredato': 'Furnished',
               'washing_machine': 'Washer', 'double_glazing': 'Double glazing',
               'concordato': 'Rent-controlled option'}
    def normale(x):
        b = bella_dote(x)
        return TRADUCI.get(b.lower().replace('_', ' '), b)
    dentro = [normale(x) for x in (r.get('features') or r.get('tags') or []) if x]""",
'dote tradotte')

# [13] la chiave dei preferiti: un segnaposto che il replace di navigazione
#     non tocca — la chiave resta /listing/<id> su tutte e tre le pagine
s = uno(s, "    h = h.replace(\"'/listing/'\", \"'#id='\")",
    "    h = h.replace(\"'/listing/'\", \"'#id='\")\n"
    "    h = h.replace('CHIAVE_CASA', '/listing/')", 'chiave art')
s = uno(s, "    h = h.replace(\"'/listing/'\", \"'/v2-listing.html#id='\")",
    "    h = h.replace(\"'/listing/'\", \"'/v2-listing.html#id='\")\n"
    "    h = h.replace('CHIAVE_CASA', '/listing/')", 'chiave sito')

# [32] nav Services → home#banchina
s = uno(s, "h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())",
    "h = h.replace('href=\"#banchina\"', 'href=\"' + ('https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478' if MODO == 'artefatto' else '/v2-home.html') + '#banchina\"')\n"
    "h = h.replace('LOGO_SVG', leggi('logo-live.svg').strip())", 'nav servizi ld')

# [34] footer allineato (sito)
s = uno(s, """    h = h.replace('href="/index.html"', 'href="/v2-home.html"')""",
"""    for da, a_ in {'/index.html': '/v2-home.html',
        '/property-finding.html': '/v2-property-finding.html'}.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')""", 'footer ld')

# [24][21][22][25][26] testa vera: H1 precompilato, description unica,
# canonical + og + JSON-LD dell'annuncio di default
s = uno(s, "uscita = 'boom-casa-p.html' if MODO == 'artefatto' else 'boom-casa-p-sito.html'"
    if "uscita = 'boom-casa-p.html' if MODO == 'artefatto' else 'boom-casa-p-sito.html'" in s
    else "uscita = ('boom-casa-p.html' if MODO == 'artefatto'",
"""C0 = CASE[0]
h = h.replace('<h1 id="nomeCasa">—</h1>',
    '<h1 id="nomeCasa">' + C0['nome'] + '</h1>')
h = h.replace('<p class="dove" id="doveCasa">—</p>',
    '<p class="dove" id="doveCasa">' + C0['zona'] + ' · Rome</p>')
DESCR = (C0['nome'] + ' — ' + C0['zona'] + ', Rome. '
         + ('€' + format(C0['prezzo'], ',') + '/month, ' if C0['prezzo'] else '')
         + 'walked in person and video-checked by BOOM. Transparent move-in '
         'costs, sign from your phone, keys in as little as 48 hours.')
h = h.replace(
    '<meta name="description" content="Verified mid-term apartment rentals in '
    'Rome for internationals — English-first, legal contracts, 48-hour '
    'move-in. Your landing in Rome, handled.">',
    '<meta name="description" content="' + DESCR + '">')
if MODO == 'sito':
    LD = {'@context': 'https://schema.org', '@type': 'Apartment',
          'name': C0['nome'],
          'address': {'@type': 'PostalAddress', 'addressLocality': 'Rome',
                      'addressRegion': 'RM', 'addressCountry': 'IT',
                      'streetAddress': C0.get('indirizzo') or C0['zona']},
          'numberOfBedrooms': C0.get('letti'),
          'numberOfBathroomsTotal': C0.get('bagni')}
    if C0.get('mq'):
        LD['floorSize'] = {'@type': 'QuantitativeValue',
                           'value': C0['mq'], 'unitCode': 'MTK'}
    LD = {k: v for k, v in LD.items() if v is not None}
    OFFER = {'@context': 'https://schema.org', '@type': 'Offer',
             'price': C0['prezzo'], 'priceCurrency': 'EUR',
             'availability': 'https://schema.org/InStock' if C0['libera']
                 else 'https://schema.org/SoldOut',
             'url': 'https://www.boomrome.com/listing/' + C0['id'],
             'itemOffered': LD,
             'seller': {'@type': 'RealEstateAgent',
                        'name': 'BOOM — Egidi Immobiliare S.r.l.',
                        'url': 'https://www.boomrome.com'}}
    OG = ('<link rel="canonical" href="https://www.boomrome.com/listing/'
          + C0['id'] + '">\\n'
          '<meta property="og:title" content="' + C0['nome'] + ' — '
          + C0['zona'] + ', Rome | BOOM">\\n'
          '<meta property="og:description" content="' + DESCR + '">\\n'
          '<meta property="og:type" content="website">\\n'
          '<meta property="og:url" content="https://www.boomrome.com/listing/'
          + C0['id'] + '">\\n'
          + (('<meta property="og:image" content="' + C0['cover'] + '">\\n'
              '<meta name="twitter:card" content="summary_large_image">\\n')
             if C0.get('cover', '').startswith('http') else '')
          + '<script type="application/ld+json">'
          + json.dumps(OFFER, ensure_ascii=False) + '</script>\\n')
    i = h.index('</title>') + len('</title>')
    h = h[:i] + '\\n' + OG + h[i:]
    h = ('<!DOCTYPE html>\\n<html lang="en">\\n<head>\\n<meta charset="utf-8">\\n'
         + h.replace('</style>', '</style>\\n</head>\\n<body>', 1)
         + '\\n</body>\\n</html>')
uscita = 'boom-casa-p.html' if MODO == 'artefatto' else 'boom-casa-p-sito.html'""",
'testa detail')
if 'import json' not in s.split('\n')[3]:
    s = s.replace('import json, re, sys', 'import json, re, sys') \
        if 'import json, re, sys' in s else s
scrivi('costruisci-ld.py', s)

# ═══ LD-REGIA.HTML ══════════════════════════════════════════════════════
s = leggi('ld-regia.html')

# [13] la chiave dei preferiti col segnaposto
s = uno(s, "per('#cuoreCasa').dataset.u = '/listing/' + c.id;",
    "/* la chiave dei preferiti e la stessa delle altre due pagine:\n"
    "     il segnaposto sopravvive al replace di navigazione del builder */\n"
    "  per('#cuoreCasa').dataset.u = 'CHIAVE_CASA' + c.id;", 'chiave cuore')

# [18] casa non libera: il bottone dice la verita
s = uno(s, "  per('#applicaNome').textContent = c.nome;",
"""  per('#applicaNome').textContent = c.nome;
  /* se la casa non e libera, la CTA non finge: si entra in lista */
  if (!c.libera) {
    var bAp = document.querySelector('#modApplica button[type="submit"]');
    if (bAp) bAp.textContent = 'Join the waitlist';
    var sAp = document.getElementById('applicaSotto');
    if (sAp) sAp.textContent = 'This home is taken for now. Join the '
      + 'waitlist and you hear first — from a person — the moment it frees up.';
  }""", 'cta waitlist')

# [2] il contratto: non tutte le case sono transitorio art. 5 c. 1
s = uno(s, """      ['What kind of contract is it?',
       'A transitional lease under L. 431/98 art. 5 c. 1, in English and '
       + 'Italian, explained line by line before you sign. Registration with '
       + 'the Agenzia delle Entrate is handled by us.'],""",
"""      ['What kind of contract is it?',
       'A registered lease under L. 431/98 — typically transitional '
       + '(art. 5 c. 1); some homes offer a rent-controlled option, and the '
       + 'listing says so. In English and Italian, explained line by line '
       + 'before you sign. Registration with the Agenzia delle Entrate is '
       + 'handled by us.'],""", 'contratto faq')
s = uno(s, """          <li><b>The contract, in English and Italian</b><span>A transitional
            lease under L. 431/98 art. 5 c. 1, explained line by line before
            you sign anything.</span></li>"""
    if False else 'SALTA', 'SALTA', 'noop') if False else s

# [1] la FAQ «how fast» diceva «1 March» tacendo l'anno 2027
s = uno(s, """       'As little as <em>48 hours</em> from a signed pre-agreement, if the '
       + 'flat is free. This one'
       + (c.dal ? ' is available from <em>' + new Date(c.dal + 'T12:00:00')
            .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
            + '</em>.' : ' is available now.')],""",
"""       'As little as <em>48 hours</em> from a signed pre-agreement, if the '
       + 'flat is free. This one'
       + (c.dal ? ' is available from <em>' + new Date(c.dal + 'T12:00:00')
            .toLocaleDateString('en-GB', { day: 'numeric', month: 'long',
              year: 'numeric' })
            + '</em>.' : ' is available now.')],""", 'faq anno')
scrivi('ld-regia.html', s)

# ═══ LD-CORPO.HTML — il contratto nel blocco onorario ═══════════════════
s = leggi('ld-corpo.html')
s = uno(s, """          <li><b>The contract, in English and Italian</b><span>A transitional
            lease under L. 431/98 art. 5 c. 1, explained line by line before
            you sign anything.</span></li>""",
"""          <li><b>The contract, in English and Italian</b><span>A registered
            lease under L. 431/98 — transitional or rent-controlled, depending
            on the home — explained line by line before you sign
            anything.</span></li>""", 'contratto blocco')
scrivi('ld-corpo.html', s)
print('detail: fatta')
