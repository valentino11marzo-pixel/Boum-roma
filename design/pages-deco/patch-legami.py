#!/usr/bin/env python3
# I LEGAMI — la pagina dei soldi si raggiunge da dove serve, mai due volte:
#   · footer condiviso (tutte le pagine): «Your Money» sotto Company
#   · detail: una riga in fondo al quadro dei soldi
#   · home: il link nel sotto della banchina
#   · le mappe URL dei quattro builder imparano /your-money.html
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

ARTE = 'https://claude.ai/code/artifact/bd225367-85f2-4aa5-871d-9653827c078b'
# la riga di codice che i builder artefatto ricevono, gia pronta
RIGA_ART = ("    h = h.replace('href=\"/your-money.html\"', "
            "'href=\"" + ARTE + "\"')\n")

for f in ('pt.html', 'ld-corpo.html', 'costruisci-portale.py',
          'costruisci-ad.py', 'costruisci-ld.py', 'costruisci-soldi.py'):
    shutil.copy(f, f + '.bak')

# ═══ PT.HTML — footer + banchina ════════════════════════════════════════
s = leggi('pt.html')
s = uno(s, """        <a href="/about.html">About</a>""",
"""        <a href="/about.html">About</a>
        <a href="/your-money.html">Your Money</a>""", 'footer soldi')
s = uno(s, """      <p class="sotto">Every price is flat and written here — and most of it
        comes back: credited to your agency fee when you rent with us, or
        refunded if we don't deliver.</p>""",
"""      <p class="sotto">Every price is flat and written here — and most of it
        comes back: credited to your agency fee when you rent with us, or
        refunded if we don't deliver.
        <a class="sotto-vai" href="/your-money.html">How your money
          moves →</a></p>""", 'banchina soldi')
s = uno(s, '</style>', """
.sotto-vai { display:inline-block; margin-left:6px; color:var(--gold);
  font-size:inherit; text-decoration:none;
  border-bottom:1px solid var(--line-gold-2); padding-bottom:1px;
  transition:border-color .25s; }
.sotto-vai:hover { border-color:var(--gold); }
</style>""", 'css sotto-vai')
scrivi('pt.html', s)

# ═══ LD-CORPO.HTML — la riga nel quadro dei soldi ═══════════════════════
s = leggi('ld-corpo.html')
s = uno(s, """        <p class="chiavi-fuori"><b>What is not included:</b> utilities
          (electricity, gas, water, internet) and the registration tax. Both
          are paid to the providers and to the State. We never touch them and
          we never mark them up.</p>""",
"""        <p class="chiavi-fuori"><b>What is not included:</b> utilities
          (electricity, gas, water, internet) and the registration tax. Both
          are paid to the providers and to the State. We never touch them and
          we never mark them up.
          <a class="sotto-vai" href="/your-money.html">The full money story —
            every euro, in and out →</a></p>""", 'detail soldi')
scrivi('ld-corpo.html', s)

# ═══ COSTRUISCI-PORTALE.PY ══════════════════════════════════════════════
s = leggi('costruisci-portale.py')
s = uno(s, "    for da, a_ in {'/index.html': HOME, '/apartments.html': AP,",
"    for da, a_ in {'/index.html': HOME, '/apartments.html': AP,\n"
"        '/your-money.html': '" + ARTE + "',", 'portale art soldi')
s = uno(s, "        '/apartments.html': '/v2-apartments.html',",
"        '/apartments.html': '/v2-apartments.html',\n"
"        '/your-money.html': '/v2-money.html',", 'portale sito soldi')
scrivi('costruisci-portale.py', s)

# ═══ COSTRUISCI-AD.PY — l'artefatto sostituisce PRIMA della regex ═══════
s = leggi('costruisci-ad.py')
RIGA_REGEX = "    h = re.sub(r'href=\"/([a-z-]+)\\.html\"', r'href=\"https://www.boomrome.com/\\1\"', h)\n"
assert s.count(RIGA_REGEX) == 1, 'regex ad'
s = s.replace(RIGA_REGEX, RIGA_ART + RIGA_REGEX)
s = uno(s, """    for da, a_ in {'/index.html': '/v2-home.html',
        '/apartments.html': '/v2-apartments.html',
        '/property-finding.html': '/v2-property-finding.html'}.items():""",
"""    for da, a_ in {'/index.html': '/v2-home.html',
        '/apartments.html': '/v2-apartments.html',
        '/your-money.html': '/v2-money.html',
        '/property-finding.html': '/v2-property-finding.html'}.items():""",
'ad sito soldi')
scrivi('costruisci-ad.py', s)

# ═══ COSTRUISCI-LD.PY ═══════════════════════════════════════════════════
s = leggi('costruisci-ld.py')
assert s.count(RIGA_REGEX) == 1, 'regex ld'
s = s.replace(RIGA_REGEX, RIGA_ART + RIGA_REGEX)
s = uno(s, """    for da, a_ in {'/index.html': '/v2-home.html',
        '/property-finding.html': '/v2-property-finding.html'}.items():""",
"""    for da, a_ in {'/index.html': '/v2-home.html',
        '/your-money.html': '/v2-money.html',
        '/property-finding.html': '/v2-property-finding.html'}.items():""",
'ld sito soldi')
scrivi('costruisci-ld.py', s)

# ═══ COSTRUISCI-SOLDI.PY — su se stessa il footer ancora in pagina ══════
s = leggi('costruisci-soldi.py')
assert s.count(RIGA_REGEX) == 1, 'regex soldi'
s = s.replace(RIGA_REGEX,
    "    h = h.replace('href=\"/your-money.html\"', 'href=\"#giornouno\"')\n"
    + RIGA_REGEX)
s = uno(s, """    for da, a_ in {'/index.html': '/v2-home.html',
        '/apartments.html': '/v2-apartments.html',
        '/property-finding.html': '/v2-property-finding.html'}.items():""",
"""    for da, a_ in {'/index.html': '/v2-home.html',
        '/apartments.html': '/v2-apartments.html',
        '/your-money.html': '#giornouno',
        '/property-finding.html': '/v2-property-finding.html'}.items():""",
'soldi sito se stessa')
scrivi('costruisci-soldi.py', s)
print('legami: fatti')
