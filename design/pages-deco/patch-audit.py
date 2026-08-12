#!/usr/bin/env python3
# AUDIT → CORREZIONI. 35 difetti confermati da 36 agenti (4 lenti + verifica
# avversaria). Qui quelli correggibili nei template e nei builder; gli errori
# nei DATI del catalogo vengono solo riportati, mai riscritti in silenzio.
import re, json

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

# ═══ PT.HTML — la home e il design system condiviso ═════════════════════
s = leggi('pt.html')

# [3] 48h era «media» qui e «caso migliore» altrove: si tiene la versione
#     difendibile — il piu veloce, non la media.
s = uno(s, '<span class="ch"><b>48h</b>average move-in</span>'
    if '<span class="ch"><b>48h</b>average move-in</span>' in s else
    '<div><b>48h</b><span>average move-in</span></div>',
    '<div><b>48h</b><span>fastest move-in</span></div>', '48h cifra')
s = uno(s, '<div><b data-fine="48" data-suff="h">0h</b><span>Average Move-in Time</span></div>',
    '<div><b data-fine="48" data-suff="h">0h</b><span>Fastest Move-in</span></div>', '48h counter')

# [28] salto h2→h4 nel concierge: le card diventano h3
s = s.replace('<h4>', '<h3 class="mini6-nome">').replace('</h4>', '</h3>')
s = uno(s, '.mini6 h4 { margin-top:10px; font-size:12.5px; font-weight:500; }',
    '.mini6 .mini6-nome { margin:10px 0 0; font-family:var(--sans);\n'
    '  font-size:12.5px; font-weight:500; letter-spacing:0; }', 'css mini6')

# footer: /board.html non esiste (esiste v2-board.html)
s = uno(s, '<a href="/board.html">Live Board</a>',
    '<a href="/v2-board.html">Live Board</a>', 'footer board')
scrivi('pt.html', s)

# ═══ COSTRUISCI-PORTALE.PY ══════════════════════════════════════════════
s = leggi('costruisci-portale.py')

# [11] il CTA «How It Works» puntava a #come, che non esiste: l'ancora vera
#     e #apparecchio, nella stessa pagina.
s = uno(s, "h = h.replace('COME_URL', HOME + '#come').replace('AP_URL', AP)",
    "h = h.replace('COME_URL', '#apparecchio').replace('AP_URL', AP)", 'come art')
s = uno(s, "h = h.replace('COME_URL', '/v2-home.html#come').replace('AP_URL', '/v2-apartments.html')",
    "h = h.replace('COME_URL', '#apparecchio').replace('AP_URL', '/v2-apartments.html')", 'come sito')

# [0][31] il conteggio «available now» era diverso dalla discovery: stessa
#     regola — disponibili CON foto nella banca del modo corrente.
s = uno(s, "DISPONIBILI = sum(1 for r in tutti if r['status'] == 'available')",
    "# stessa regola della discovery: si conta cio che si puo mostrare\n"
    "DISPONIBILI = sum(1 for r in tutti\n"
    "                  if r['status'] == 'available' and banca.get(r['id']))", 'conta')

# [33] «FREE NOW» sulla vetrina vs «AVAILABLE» sul tabellone: un nome solo
s = uno(s, "('NEW', '') if c['nuova'] else ('FREE NOW', 'verde')",
    "('NEW', '') if c['nuova'] else ('AVAILABLE NOW', 'verde')", 'chip nome')

# [19] tre gradienti con lo stesso id (nav + due pass): id univoci
s = uno(s, "h = h.replace('PASS_MINI', leggi('logo-live.svg').strip())",
    "h = h.replace('PASS_MINI', leggi('logo-live.svg').strip()\n"
    "    .replace('goldGrad', 'goldGradMini'))", 'grad mini')
s = uno(s, "h = h.replace('PASS_LOGO', leggi('logo-live.svg').strip())",
    "h = h.replace('PASS_LOGO', leggi('logo-live.svg').strip()\n"
    "    .replace('goldGrad', 'goldGradPass'))", 'grad pass')
scrivi('costruisci-portale.py', s)

# ═══ AD-CORPO / AD-REGIA / COSTRUISCI-AD — la discovery ═════════════════
s = leggi('ad-corpo.html')
# [16][36] «Apply» qui era un filtro, non una candidatura
s = uno(s, '<button type="submit" class="btn btn-primary" id="quandoVai">Apply</button>',
    '<button type="submit" class="btn btn-primary" id="quandoVai">Find homes</button>', 'find homes')
# [29] h1→h3 senza h2: lo stato vuoto sale di grado
s = uno(s, '<h3>Not on this page?<br><span class="hl">It doesn\'t mean it doesn\'t exist.</span></h3>',
    '<h2 class="vuoto-titolo">Not on this page?<br><span class="hl">It doesn\'t mean it doesn\'t exist.</span></h2>', 'vuoto h2')
s = s.replace('.vuoto b {', '.vuoto .vuoto-titolo, .vuoto b {') \
    if '.vuoto b {' in s else s
# lo stato futuro ha il suo colore: quieto, non verde
s = uno(s, '.casa-p .home-foto .casa-stato.fila { color:var(--gold);',
    '''.casa-p .home-foto .casa-stato.poi { color:var(--text-2); }
.casa-p .home-foto .casa-stato.fila { color:var(--gold);''', 'stato poi')
scrivi('ad-corpo.html', s)

s = leggi('ad-regia.html')
# [16] il submit saltava DENTRO il primo annuncio: ora mostra i risultati
s = uno(s, """    forma.addEventListener('submit', function (e) {
      e.preventDefault();
      var prima = document.querySelector('#muro .casa-p:not(.via)');
      if (prima) location.href = prima.getAttribute('href');
      else location.href = '/property-finding.html';
    });""",
"""    forma.addEventListener('submit', function (e) {
      e.preventDefault();
      /* un filtro mostra i risultati: non decide lui quale casa aprire */
      apri(false);
      var muro = document.getElementById('muro');
      if (muro) muro.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });""", 'submit filtro')
# [12] il tocco sulla zona di una carta non filtrava: il parser dell'hash
#     girava solo al load. Ora gira anche a ogni hashchange.
s = uno(s, """      if (k === 'zona') {
        stato.zona = v.toLowerCase();
        setTimeout(function () {
          document.querySelectorAll('.zona-riga').forEach(function (r) {
            var on = r.dataset.zona === stato.zona;
            r.classList.toggle('on', on);
            r.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        }, 80);
      }
    });
  })();

  aggiorna();""",
"""      if (k === 'zona') {
        stato.zona = v.toLowerCase();
        setTimeout(function () {
          document.querySelectorAll('.zona-riga').forEach(function (r) {
            var on = r.dataset.zona === stato.zona;
            r.classList.toggle('on', on);
            r.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        }, 80);
      }
    });
  }
  leggiHash();
  /* le zone sulle carte cambiano l'hash della stessa pagina: si riascolta */
  addEventListener('hashchange', function () { leggiHash(); aggiorna(); });
  })();

  aggiorna();""", 'hashchange')
s = uno(s, """    /* ── ciò che arrivi dalla home viaggia con te ─────────────────────── */
    var h = location.hash.replace('#', '');
    if (h) h.split('&').forEach(function (p) {""",
"""    /* ── ciò che arrivi dalla home viaggia con te ─────────────────────── */
    function leggiHash() {
    var h = location.hash.replace('#', '');
    if (h) h.split('&').forEach(function (p) {""", 'leggiHash fn')
scrivi('ad-regia.html', s)

s = leggi('costruisci-ad.py')
# [1] «Available now» con ingresso nel 2027: il badge dice la data vera
s = uno(s, """def stato(r):
    s = r['status']
    if s == 'available': return ('Available now', 'si')
    # la waitlist non e «Reserved»: la lista e aperta, e uno stato suo
    if s == 'waitlist': return ('Waitlist open', 'fila')
    if s == 'reserved': return ('Reserved', '')
    return ('Rented', '')""",
"""def stato(r):
    s = r['status']
    if s == 'available':
        # libera si, ma DA QUANDO: se la data e nel futuro, il badge la dice.
        # «Available now» con ingresso nel 2027 era una promessa falsa.
        d = libera(r.get('avail'))
        if d and d > oggi.strftime('%Y-%m-%d'):
            dt = datetime.fromisoformat(d)
            eti = 'From ' + str(int(dt.strftime('%d'))) + dt.strftime(' %b')
            if dt.year != oggi.year: eti += dt.strftime(' %Y')
            return (eti, 'poi')
        return ('Available now', 'si')
    if s == 'waitlist': return ('Waitlist open', 'fila')
    if s == 'reserved': return ('Reserved', '')
    return ('Rented', '')""", 'stato futuro')
# [39] NEW su una casa gia affittata: il chip vive solo dove ha senso
s = uno(s, """    ch = ('VERIFIED', 'verde') if r.get('video') else \\
         ('NEW', '') if nuova else None""",
"""    vivo = r['status'] in ('available', 'waitlist')
    ch = ('VERIFIED', 'verde') if r.get('video') and vivo else \\
         ('NEW', '') if nuova and vivo else None""", 'chip vivo')
# [32] nav «Services» → la banchina sta solo in home
s = uno(s, "h = h.replace('CASE_MURO', MURO)",
    "h = h.replace('href=\"#banchina\"', 'href=\"' + ('https://claude.ai/code/artifact/5e7c6222-9a91-4052-a4d7-f31255ed4478' if MODO == 'artefatto' else '/v2-home.html') + '#banchina\"')\n"
    "h = h.replace('CASE_MURO', MURO)", 'nav servizi ad')
# [34] footer allineato alla home (sito): stessa mappa
s = uno(s, """    h = h.replace('href="/index.html"', 'href="/v2-home.html"')
    h = h.replace('href="/apartments.html"', 'href="/v2-apartments.html"')""",
"""    for da, a_ in {'/index.html': '/v2-home.html',
        '/apartments.html': '/v2-apartments.html',
        '/property-finding.html': '/v2-property-finding.html'}.items():
        h = h.replace('href="' + da + '"', 'href="' + a_ + '"')""", 'footer ad')
# [21][25][26][20] testa unica per pagina: description, canonical, og,
# e in modalita sito lo scheletro HTML completo
s = uno(s, "uscita = 'boom-discovery.html' if MODO == 'artefatto' else 'boom-discovery-sito.html'",
"""DESCR = ('Browse ' + str(len(mostrate)) + ' verified apartments for rent in '
         'Rome — every home walked in person by BOOM. Filter by zone, budget '
         'and move-in date; ' + str(DISPONIBILI) + ' available now.')
h = h.replace(
    '<meta name="description" content="Verified mid-term apartment rentals in '
    'Rome for internationals — English-first, legal contracts, 48-hour '
    'move-in. Your landing in Rome, handled.">',
    '<meta name="description" content="' + DESCR + '">')
if MODO == 'sito':
    OG = ('<link rel="canonical" href="https://www.boomrome.com/v2-apartments.html">\\n'
          '<meta property="og:title" content="Apartments in Rome — walked in person | BOOM">\\n'
          '<meta property="og:description" content="' + DESCR + '">\\n'
          '<meta property="og:type" content="website">\\n'
          '<meta property="og:url" content="https://www.boomrome.com/v2-apartments.html">\\n'
          + (('<meta property="og:image" content="' + rem.get(mostrate[0]['id'], '') + '">\\n'
              '<meta name="twitter:card" content="summary_large_image">\\n')
             if rem.get(mostrate[0]['id']) else ''))
    i = h.index('</title>') + len('</title>')
    h = h[:i] + '\\n' + OG + h[i:]
    h = ('<!DOCTYPE html>\\n<html lang="en">\\n<head>\\n<meta charset="utf-8">\\n'
         + h.replace('</style>', '</style>\\n</head>\\n<body>', 1)
         + '\\n</body>\\n</html>')
uscita = 'boom-discovery.html' if MODO == 'artefatto' else 'boom-discovery-sito.html'""",
'testa discovery')
scrivi('costruisci-ad.py', s)
print('pt + portale + discovery: fatte')
